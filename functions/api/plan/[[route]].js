/* DugoutLab Athlete Plan: cloud backup and sync. Cloudflare Pages Function + the same D1 binding (DB) as /api.
   Layer 2: the athlete's reported information and history, stored per adult account.

   Accounts come from /api/signup and /api/signin (adults only, parent or coach). Athletes are kids under an
   adult account: first name or nickname, age (6 to 18), sport, and what the adult reported in the wizard, check-ins
   and logs. No last names, no birthdates, no kid emails, no photos. Nothing here diagnoses or clears anyone to play.

   Local-first: the page saves to the browser first and backs up here when online. Every athlete row carries a
   revision number. A put must send the revision it last saw; a stale device gets 409 with the newer copy so the
   person can choose, never a silent overwrite.

   Routes (token in the JSON body or ?token=):
     GET  /api/plan/list                 -> { athletes: [{ id, nickname, age, sport, rev, updated }] }
     GET  /api/plan/get?id=              -> { athlete: { id, nickname, age, sport, rev, updated, data } }
     POST /api/plan/put  { id?, rev, data }   -> { id, rev, updated }   or 409 { conflict: true, rev, data }
     POST /api/plan/delete { id }        -> { ok: true }
   Account deletion in /api/pitch/account-delete also removes these rows. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS athletes (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, nickname TEXT NOT NULL, age INTEGER NOT NULL, sport TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS athletes_acct ON athletes(account_id, updated)`
];
const MAX_ATHLETES = 8, MAX_BYTES = 250000;

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function bad(msg, status) { return json({ error: msg }, status || 400); }
function id() { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function clean(s, n) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, n || 60); }
function ageOK(n) { n = parseInt(n, 10); return n >= 6 && n <= 18 ? n : 0; }
function sportOK(s) { return s === 'softball' ? 'softball' : 'baseball'; }
async function ensure(db) { for (const s of SCHEMA) await db.prepare(s).run(); }
async function auth(db, token) { return token ? db.prepare('SELECT * FROM accounts WHERE token = ?').bind(token).first() : null; }
async function own(db, acct, aid) {
  if (!acct || !aid) return null;
  return db.prepare('SELECT * FROM athletes WHERE id = ? AND account_id = ?').bind(clean(aid, 40), acct.id).first();
}
function pub(r, withData) {
  const o = { id: r.id, nickname: r.nickname, age: r.age, sport: r.sport, rev: r.rev, updated: r.updated };
  if (withData) { try { o.data = JSON.parse(r.data); } catch (e) { o.data = null; } }
  return o;
}
/* The page owns the shape of data. Here we only check it is an object with a sane profile and a size cap. */
function checkData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Nothing to save';
  const p = d.profile;
  if (!p || typeof p !== 'object') return 'Missing profile';
  const nickname = clean(p.nickname, 24), age = ageOK(p.age);
  if (nickname.length < 2) return 'Add a first name or nickname';
  if (!age) return 'Pick an age from 6 to 18';
  const raw = JSON.stringify(d);
  if (raw.length > MAX_BYTES) return 'That athlete file is too big to back up. Export it, then trim old entries.';
  return null;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const db = env.DB;
  if (!db) return bad('Database not bound. Add a D1 binding named DB to this Pages project.', 500);
  const route = (params.route || []).join('/');
  const url = new URL(request.url);
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { return bad('Bad JSON'); } }
  const token = body.token || url.searchParams.get('token') || '';
  const now = Date.now();

  try {
    await ensure(db);
    const me = await auth(db, token);
    if (!me) return bad('Sign in first', 401);

    if (route === 'list' && method === 'GET') {
      const rows = (await db.prepare('SELECT id, nickname, age, sport, rev, updated FROM athletes WHERE account_id = ? ORDER BY created').bind(me.id).all()).results;
      return json({ account: { id: me.id, name: me.name, role: me.role }, athletes: rows.map(r => pub(r, false)) });
    }

    if (route === 'get' && method === 'GET') {
      const r = await own(db, me, url.searchParams.get('id'));
      if (!r) return bad('Not your athlete', 404);
      return json({ athlete: pub(r, true) });
    }

    if (route === 'put' && method === 'POST') {
      const err = checkData(body.data);
      if (err) return bad(err);
      const p = body.data.profile;
      const nickname = clean(p.nickname, 24), age = ageOK(p.age), sport = sportOK(p.sport);
      const raw = JSON.stringify(body.data);
      if (body.id) {
        const r = await own(db, me, body.id);
        if (!r) return bad('Not your athlete', 404);
        const sent = parseInt(body.rev, 10) || 0;
        if (sent !== r.rev) return json({ conflict: true, error: 'This athlete was updated from another device.', athlete: pub(r, true) }, 409);
        const res = await db.prepare('UPDATE athletes SET nickname = ?, age = ?, sport = ?, data = ?, rev = rev + 1, updated = ? WHERE id = ? AND rev = ?')
          .bind(nickname, age, sport, raw, now, r.id, r.rev).run();
        if (!res.meta || !res.meta.changes) {
          const again = await own(db, me, r.id);
          return json({ conflict: true, error: 'This athlete was updated from another device.', athlete: pub(again, true) }, 409);
        }
        return json({ id: r.id, rev: r.rev + 1, updated: now });
      }
      const n = await db.prepare('SELECT COUNT(*) AS n FROM athletes WHERE account_id = ?').bind(me.id).first();
      if (n.n >= MAX_ATHLETES) return bad('Up to ' + MAX_ATHLETES + ' athletes per account');
      const aid = id();
      await db.prepare('INSERT INTO athletes (id,account_id,nickname,age,sport,rev,data,created,updated) VALUES (?,?,?,?,?,1,?,?,?)')
        .bind(aid, me.id, nickname, age, sport, raw, now, now).run();
      return json({ id: aid, rev: 1, updated: now });
    }

    if (route === 'delete' && method === 'POST') {
      const r = await own(db, me, body.id);
      if (!r) return bad('Not your athlete', 404);
      await db.prepare('DELETE FROM athletes WHERE id = ?').bind(r.id).run();
      return json({ ok: true });
    }

    return bad('Not found', 404);
  } catch (e) {
    return bad('Server error: ' + (e.message || e), 500);
  }
}
