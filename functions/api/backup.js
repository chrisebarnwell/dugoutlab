/* DugoutLab nightly backup. Cloudflare Pages Function.

   Copies every D1 table (accounts, rosters, pitch counts, lineups, athletes, timer runs...) to an R2 bucket
   as one gzipped JSON file per day: d1/YYYY-MM-DD.json.gz. Keeps the last 35 days, deletes older ones,
   so deleted user data leaves backups within 35 days (matches privacy.html).

   Called once a night by .github/workflows/backup.yml. Never returns data, only counts.

   Setup (Cloudflare dashboard, once):
     R2 > Create bucket "dugoutlab-backups"
     Pages > dugoutlab > Settings > Bindings > R2 bucket: name BACKUPS -> dugoutlab-backups
     Pages > dugoutlab > Settings > Variables: BACKUP_TOKEN (encrypt) = a long random string
     GitHub > repo > Settings > Secrets > Actions: BACKUP_TOKEN = the same string

   Route:
     POST /api/backup   header Authorization: Bearer <BACKUP_TOKEN>   -> { ok, key, bytes, tables: { name: rows } } */

const KEEP_DAYS = 35, PAGE = 1000;

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
  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: 'application/gzip' } });

  /* Prune: drop daily files older than KEEP_DAYS. */
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let cursor, pruned = 0;
  do {
    const page = await env.BACKUPS.list({ prefix: 'd1/', cursor });
    for (const o of page.objects) {
      const d = o.key.slice(3, 13);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff) { await env.BACKUPS.delete(o.key); pruned++; }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return json({ ok: true, key, bytes: body.byteLength, pruned, tables: counts });
}
