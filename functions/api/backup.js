/* DugoutLab nightly backup. Cloudflare Pages Function.

   Copies every D1 table (accounts, rosters, pitch counts, lineups, athletes, timer runs...) to Workers KV
   as one gzipped JSON value per day: d1/YYYY-MM-DD.json.gz. Each copy expires on its own after 35 days,
   so deleted user data leaves backups within 35 days (matches privacy.html). KV is free on Workers Free.

   Called once a night by .github/workflows/backup.yml. Never returns data, only counts.

   Setup (Cloudflare dashboard, once):
     Storage & databases > Workers KV > Create namespace "dugoutlab-backups"
     Pages > dugoutlab > Settings > Bindings > KV namespace: name BACKUPS -> dugoutlab-backups
     Pages > dugoutlab > Settings > Variables: BACKUP_TOKEN (encrypt) = a long random string
     GitHub > repo > Settings > Secrets > Actions: BACKUP_TOKEN = the same string

   Route:
     POST /api/backup   header Authorization: Bearer <BACKUP_TOKEN>   -> { ok, key, bytes, tables: { name: rows } } */

const KEEP_DAYS = 35, PAGE = 1000, MAX_BYTES = 24 * 1024 * 1024;

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function dumpTable(db, name) {
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    const r = await db.prepare(`SELECT * FROM "${name.replace(/"/g, '')}" LIMIT ? OFFSET ?`).bind(PAGE, off).all();
    const batch = (r && r.results) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.BACKUP_TOKEN || !env.BACKUPS || !env.DB) return json({ error: 'Backup not set up' }, 503);
  const auth = request.headers.get('authorization') || '';
  if (!sameSecret(auth.replace(/^Bearer\s+/i, ''), env.BACKUP_TOKEN)) return json({ error: 'Not allowed' }, 401);

  const list = await env.DB.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name"
  ).all();
  const tables = {}, counts = {};
  for (const t of (list.results || [])) {
    const rows = await dumpTable(env.DB, t.name);
    tables[t.name] = { schema: t.sql, rows };
    counts[t.name] = rows.length;
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const key = `d1/${day}.json.gz`;
  const body = await gzip(JSON.stringify({ created: now.toISOString(), tables }));
  if (body.byteLength > MAX_BYTES) return json({ error: 'Backup too big for KV', bytes: body.byteLength }, 507);
  await env.BACKUPS.put(key, body, { expirationTtl: KEEP_DAYS * 86400 });

  return json({ ok: true, key, bytes: body.byteLength, keepDays: KEEP_DAYS, tables: counts });
}
