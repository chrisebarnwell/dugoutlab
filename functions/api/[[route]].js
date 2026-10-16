/* DugoutLab Hit Window game API. Cloudflare Pages Function + D1 binding named DB.
   Accounts belong to adults (parents or coaches). Kids are hitters under a parent account:
   nickname and age group only. No kid email, no exact age. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'parent', plan TEXT NOT NULL DEFAULT 'free',
    token TEXT NOT NULL UNIQUE, consent_at INTEGER, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hitters (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, nickname TEXT NOT NULL,
    level TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY, hitter_id TEXT NOT NULL, mode TEXT NOT NULL, level TEXT NOT NULL,
    score INTEGER NOT NULL, liners INTEGER NOT NULL, called INTEGER NOT NULL, best_streak INTEGER NOT NULL,
    balls TEXT NOT NULL, match_id TEXT, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, created_by TEXT NOT NULL,
    a_hitter TEXT NOT NULL, b_hitter TEXT NOT NULL DEFAULT '', a_round TEXT, b_round TEXT,
    a_score INTEGER, b_score INTEGER, status TEXT NOT NULL DEFAULT 'open', winner TEXT, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hitters_acct ON hitters(account_id)`,
  `CREATE INDEX IF NOT EXISTS rounds_hitter ON rounds(hitter_id, created)`,
  `CREATE INDEX IF NOT EXISTS rounds_level ON rounds(level, score)`,
  `CREATE INDEX IF NOT EXISTS matches_a ON matches(a_hitter, status)`,
  `CREATE INDEX IF NOT EXISTS matches_b ON matches(b_hitter, status)`
];

const ZONE_PTS = { mid: 30, lg: 20, rg: 20, ll: 10, rl: 10, miss: 0 };
function levelOK(l) { return /^(bb|sb)(6|7|8|9|10|11|12|13|14|15|16|17|18)u$/.test(String(l || '')); }
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function bad(msg, status) { return json({ error: msg }, status || 400); }
function id() { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function tok() { return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); }
function clean(s, n) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, n || 60); }
function emailOK(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function pubAcct(a) { return { id: a.id, name: a.name, role: a.role, plan: a.plan }; }
const MJOIN = `SELECT m.*, ha.nickname AS a_name, ha.account_id AS a_acct, COALESCE(hb.nickname, '') AS b_name, COALESCE(hb.account_id, '') AS b_acct
  FROM matches m JOIN hitters ha ON ha.id = m.a_hitter LEFT JOIN hitters hb ON hb.id = m.b_hitter`;

async function ensure(db) { for (const s of SCHEMA) await db.prepare(s).run(); }
async function auth(db, token) { return token ? db.prepare('SELECT * FROM accounts WHERE token = ?').bind(token).first() : null; }
async function ownHitter(db, acct, hid) {
  if (!acct || !hid) return null;
  return db.prepare('SELECT * FROM hitters WHERE id = ? AND account_id = ?').bind(clean(hid, 40), acct.id).first();
}
function scoreBalls(balls) {
  let score = 0, liners = 0, called = 0, streak = 0, best = 0;
  const out = [];
  for (const b of balls.slice(0, 10)) {
    const zone = Object.prototype.hasOwnProperty.call(ZONE_PTS, b.zone) ? b.zone : 'miss';
    const call = Object.prototype.hasOwnProperty.call(ZONE_PTS, b.call) && b.call !== 'miss' ? b.call : null;
    let pts = ZONE_PTS[zone];
    if (call && call === zone) { pts *= 2; called++; }
    if (zone !== 'miss') { liners++; streak++; if (streak >= 3) pts += 10; } else streak = 0;
    if (streak > best) best = streak;
    score += pts;
    out.push({ zone, call, pts });
  }
  return { score, liners, called, best, balls: out };
}
async function mirrorEmail(env, a) {
  /* Optional: copy new account emails to the Google Sheet collector. Set EMAIL_HOOK in Pages env vars. */
  if (!env.EMAIL_HOOK) return;
  try {
    await fetch(env.EMAIL_HOOK, { method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ email: a.email, name: a.name, role: a.role, source: 'game-' + a.role, website: '' }) });
  } catch (e) { /* never block signup on the mirror */ }
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
    if (route === 'setup') { await ensure(db); return json({ ok: true }); }

    if (route === 'signup' && method === 'POST') {
      await ensure(db);
      const name = clean(body.name, 40), email = clean(body.email, 120).toLowerCase();
      const role = body.role === 'coach' ? 'coach' : 'parent';
      if (name.length < 2) return bad('Add your name');
      if (!emailOK(email)) return bad('That email does not look right');
      if (!body.adult) return bad(role === 'coach' ? 'Confirm you are an adult coach' : 'Confirm you are the parent or legal guardian');
      const existing = await db.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first();
      if (existing) {
        await db.prepare('UPDATE accounts SET name = ?, role = CASE WHEN role = ? THEN role ELSE ? END, consent_at = COALESCE(consent_at, ?) WHERE id = ?')
          .bind(name, 'coach', role, now, existing.id).run();
        const a = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(existing.id).first();
        return json({ account: pubAcct(a), token: a.token, returning: true });
      }
      const a = { id: id(), email, name, role, plan: 'free', token: tok(), consent_at: now, created: now };
      await db.prepare('INSERT INTO accounts (id,email,name,role,plan,token,consent_at,created) VALUES (?,?,?,?,?,?,?,?)')
        .bind(a.id, a.email, a.name, a.role, a.plan, a.token, a.consent_at, a.created).run();
      ctx.waitUntil(mirrorEmail(env, a));
      return json({ account: pubAcct(a), token: a.token, returning: false });
    }

    if (route === 'leaderboard') {
      await ensure(db);
      const level = levelOK(url.searchParams.get('level')) ? url.searchParams.get('level') : null;
      const range = url.searchParams.get('range') === 'all' ? 0 : now - 7 * 86400000;
      const q = `SELECT h.nickname AS name, h.id AS hitter_id, r.score, r.liners, r.called, r.best_streak, r.level, r.created
        FROM rounds r JOIN hitters h ON h.id = r.hitter_id WHERE r.created >= ? ${level ? 'AND r.level = ?' : ''} ORDER BY r.score DESC, r.created ASC LIMIT 25`;
      const rows = await (level ? db.prepare(q).bind(range, level) : db.prepare(q).bind(range)).all();
      return json({ rows: rows.results });
    }

    if (route === 'match') {
      const m = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(clean(url.searchParams.get('id'), 40)).first();
      if (!m) return bad('No such match', 404);
      return json({ match: m });
    }

    const me = await auth(db, token);
    if (!me) return bad('Sign in first', 401);

    if (route === 'me') {
      const hitters = await db.prepare('SELECT id, nickname, level FROM hitters WHERE account_id = ? ORDER BY created').bind(me.id).all();
      const hid = url.searchParams.get('hitter');
      const h = hid ? await ownHitter(db, me, hid) : null;
      let stats = null, open = [], recent = [];
      if (h) {
        stats = await db.prepare('SELECT COUNT(*) AS rounds, MAX(score) AS best, AVG(score) AS avg, SUM(liners) AS liners FROM rounds WHERE hitter_id = ?').bind(h.id).first();
        open = (await db.prepare(MJOIN + ` WHERE (m.a_hitter = ? OR m.b_hitter = ?) AND m.status = 'open' ORDER BY m.created DESC LIMIT 20`).bind(h.id, h.id).all()).results;
        recent = (await db.prepare(MJOIN + ` WHERE (m.a_hitter = ? OR m.b_hitter = ?) AND m.status = 'done' ORDER BY m.created DESC LIMIT 10`).bind(h.id, h.id).all()).results;
      }
      return json({ account: pubAcct(me), hitters: hitters.results, stats, open, recent });
    }

    if (route === 'hitter' && method === 'POST') {
      const nickname = clean(body.nickname, 24);
      if (nickname.length < 2) return bad('Add a nickname');
      if (!levelOK(body.level)) return bad('Pick a sport and age group');
      const count = await db.prepare('SELECT COUNT(*) AS n FROM hitters WHERE account_id = ?').bind(me.id).first();
      if (count.n >= 8) return bad('Up to 8 hitters per account');
      if (body.id) {
        const h = await ownHitter(db, me, body.id);
        if (!h) return bad('Not your hitter', 403);
        await db.prepare('UPDATE hitters SET nickname = ?, level = ? WHERE id = ?').bind(nickname, body.level, h.id).run();
        return json({ hitter: { id: h.id, nickname, level: body.level } });
      }
      const h = { id: id(), nickname, level: body.level };
      await db.prepare('INSERT INTO hitters (id,account_id,nickname,level,created) VALUES (?,?,?,?,?)').bind(h.id, me.id, h.nickname, h.level, now).run();
      return json({ hitter: h });
    }

    if (route === 'round' && method === 'POST') {
      if (!Array.isArray(body.balls) || body.balls.length !== 10) return bad('A round is 10 balls');
      const mode = ['solo', 'challenge', 'h2h'].includes(body.mode) ? body.mode : 'solo';
      let h = await ownHitter(db, me, body.hitter_id);
      if (!h && mode === 'h2h' && me.role === 'coach' && body.match_id) {
        const m = await db.prepare('SELECT * FROM matches WHERE id = ? AND created_by = ?').bind(clean(body.match_id, 40), me.id).first();
        if (m && (m.a_hitter === body.hitter_id || m.b_hitter === body.hitter_id)) h = await db.prepare('SELECT * FROM hitters WHERE id = ?').bind(body.hitter_id).first();
      }
      if (!h) return bad('Pick a hitter', 403);
      const s = scoreBalls(body.balls);
      const rid = id(), matchId = body.match_id ? clean(body.match_id, 40) : null;
      await db.prepare('INSERT INTO rounds (id,hitter_id,mode,level,score,liners,called,best_streak,balls,match_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(rid, h.id, mode, h.level, s.score, s.liners, s.called, s.best, JSON.stringify(s.balls), matchId, now).run();
      let match = null;
      if (matchId) {
        const m = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
        if (m && m.status === 'open') {
          const side = m.a_hitter === h.id ? 'a' : (m.b_hitter === h.id ? 'b' : null);
          if (side && m[side + '_score'] === null) {
            await db.prepare(`UPDATE matches SET ${side}_round = ?, ${side}_score = ? WHERE id = ?`).bind(rid, s.score, m.id).run();
            const m2 = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(m.id).first();
            if (m2.a_score !== null && m2.b_score !== null) {
              const winner = m2.a_score === m2.b_score ? 'tie' : (m2.a_score > m2.b_score ? m2.a_hitter : m2.b_hitter);
              await db.prepare("UPDATE matches SET status = 'done', winner = ? WHERE id = ?").bind(winner, m2.id).run();
            }
          }
          match = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first();
        }
      }
      const rank = await db.prepare('SELECT COUNT(*) + 1 AS rank FROM rounds WHERE level = ? AND score > ?').bind(h.level, s.score).first();
      const total = await db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE level = ?').bind(h.level).first();
      return json({ round: { id: rid, score: s.score, liners: s.liners, called: s.called, best_streak: s.best, balls: s.balls }, rank: rank.rank, of: total.n, match });
    }

    if (route === 'players') {
      const qs = clean(url.searchParams.get('q'), 24).toLowerCase();
      if (qs.length < 2) return json({ rows: [] });
      const rows = await db.prepare('SELECT id, nickname AS name, level FROM hitters WHERE lower(nickname) LIKE ? LIMIT 12').bind('%' + qs + '%').all();
      return json({ rows: rows.results });
    }

    if (route === 'challenge' && method === 'POST') {
      const h = await ownHitter(db, me, body.hitter_id);
      if (!h) return bad('Pick your hitter first', 403);
      let other = null;
      if (body.to) {
        other = await db.prepare('SELECT * FROM hitters WHERE id = ?').bind(clean(body.to, 40)).first();
        if (!other || other.id === h.id) return bad('Pick another hitter');
      }
      const m = { id: id(), type: 'challenge', created_by: me.id, a_hitter: h.id, b_hitter: other ? other.id : '' };
      await db.prepare('INSERT INTO matches (id,type,created_by,a_hitter,b_hitter,status,created) VALUES (?,?,?,?,?,?,?)')
        .bind(m.id, m.type, m.created_by, m.a_hitter, m.b_hitter, 'open', now).run();
      return json({ match: await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first() });
    }

    if (route === 'join' && method === 'POST') {
      const h = await ownHitter(db, me, body.hitter_id);
      if (!h) return bad('Pick your hitter first', 403);
      const m = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(clean(body.match_id, 40)).first();
      if (!m || m.type !== 'challenge') return bad('That challenge link is not valid', 404);
      if (m.a_hitter === h.id) return json({ match: await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first(), mine: true });
      if (!m.b_hitter) await db.prepare("UPDATE matches SET b_hitter = ? WHERE id = ? AND b_hitter = ''").bind(h.id, m.id).run();
      const m2 = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first();
      if (m2.b_hitter !== h.id) return bad('Someone else already took that challenge', 409);
      return json({ match: m2, mine: false });
    }

    if (route === 'h2h' && method === 'POST') {
      if (me.role !== 'coach') return bad('Head-to-head is a coach feature', 403);
      const a = await db.prepare('SELECT * FROM hitters WHERE id = ?').bind(clean(body.a, 40)).first();
      const b = await db.prepare('SELECT * FROM hitters WHERE id = ?').bind(clean(body.b, 40)).first();
      if (!a || !b || a.id === b.id) return bad('Pick two different hitters');
      const m = { id: id(), type: 'h2h', created_by: me.id, a_hitter: a.id, b_hitter: b.id };
      await db.prepare('INSERT INTO matches (id,type,created_by,a_hitter,b_hitter,status,created) VALUES (?,?,?,?,?,?,?)')
        .bind(m.id, m.type, m.created_by, m.a_hitter, m.b_hitter, 'open', now).run();
      return json({ match: await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first() });
    }

    return bad('Not found', 404);
  } catch (e) {
    if (String(e.message || e).includes('no such table')) { await ensure(db); return bad('Database was empty and has been set up. Try again.', 503); }
    return bad('Server error: ' + (e.message || e), 500);
  }
}
