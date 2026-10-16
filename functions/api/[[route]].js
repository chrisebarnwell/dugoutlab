/* DugoutLab Hit Window game API. Cloudflare Pages Function + D1 binding named DB. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'player', level TEXT NOT NULL DEFAULT 'bb12u', age INTEGER,
    plan TEXT NOT NULL DEFAULT 'free', token TEXT NOT NULL UNIQUE, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, level TEXT NOT NULL,
    score INTEGER NOT NULL, liners INTEGER NOT NULL, called INTEGER NOT NULL, best_streak INTEGER NOT NULL,
    balls TEXT NOT NULL, match_id TEXT, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, created_by TEXT NOT NULL,
    a_player TEXT NOT NULL, b_player TEXT NOT NULL DEFAULT '', a_round TEXT, b_round TEXT,
    a_score INTEGER, b_score INTEGER, status TEXT NOT NULL DEFAULT 'open', winner TEXT, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS rounds_player ON rounds(player_id, created)`,
  `CREATE INDEX IF NOT EXISTS rounds_level ON rounds(level, score)`,
  `CREATE INDEX IF NOT EXISTS matches_b ON matches(b_player, status)`,
  `CREATE INDEX IF NOT EXISTS matches_a ON matches(a_player, status)`
];

function levelOK(l) { return /^(bb|sb)(6|7|8|9|10|11|12|13|14|15|16|17|18)u$/.test(String(l || '')); }
const ZONE_PTS = { mid: 30, lg: 20, rg: 20, ll: 10, rl: 10, miss: 0 };

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function bad(msg, status) { return json({ error: msg }, status || 400); }
function id() { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function tok() { return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); }
function clean(s, n) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, n || 60); }
function emailOK(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function pub(p) { return { id: p.id, name: p.name, role: p.role, level: p.level, age: p.age, plan: p.plan }; }
const MJOIN = `SELECT m.*, pa.name AS a_name, COALESCE(pb.name, '') AS b_name FROM matches m JOIN players pa ON pa.id = m.a_player LEFT JOIN players pb ON pb.id = m.b_player`;

async function ensure(db) {
  for (const s of SCHEMA) await db.prepare(s).run();
}
async function auth(db, token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM players WHERE token = ?').bind(token).first();
}
function scoreBalls(balls) {
  /* balls: [{zone, call}] where zone in ZONE_PTS, call = zone called before the swing or null */
  let score = 0, liners = 0, called = 0, streak = 0, best = 0;
  const out = [];
  for (const b of balls.slice(0, 10)) {
    const zone = ZONE_PTS.hasOwnProperty(b.zone) ? b.zone : 'miss';
    const call = ZONE_PTS.hasOwnProperty(b.call) && b.call !== 'miss' ? b.call : null;
    let pts = ZONE_PTS[zone];
    const hitCall = call && call === zone;
    if (hitCall) { pts *= 2; called++; }
    if (zone !== 'miss') { liners++; streak++; if (streak >= 3) pts += 10; } else streak = 0;
    if (streak > best) best = streak;
    score += pts;
    out.push({ zone, call, pts });
  }
  return { score, liners, called, best, balls: out };
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
      const role = body.role === 'coach' ? 'coach' : 'player';
      const level = levelOK(body.level) ? body.level : 'bb12u';
      const ageN = parseInt(body.age, 10);
      const age = isNaN(ageN) ? null : Math.max(5, Math.min(99, ageN));
      if (name.length < 2) return bad('Add a name');
      if (!emailOK(email)) return bad('That email does not look right');
      const existing = await db.prepare('SELECT * FROM players WHERE email = ?').bind(email).first();
      if (existing) {
        /* Returning player: same email signs back in. Name and level can be refreshed. */
        await db.prepare('UPDATE players SET name = ?, level = ?, age = COALESCE(?, age), role = CASE WHEN role = ? THEN role ELSE ? END WHERE id = ?')
          .bind(name, level, age, 'coach', role, existing.id).run();
        const p = await db.prepare('SELECT * FROM players WHERE id = ?').bind(existing.id).first();
        return json({ player: pub(p), token: p.token, returning: true });
      }
      const p = { id: id(), name, email, role, level, age, plan: 'free', token: tok(), created: now };
      await db.prepare('INSERT INTO players (id,name,email,role,level,age,plan,token,created) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(p.id, p.name, p.email, p.role, p.level, p.age, p.plan, p.token, p.created).run();
      return json({ player: pub(p), token: p.token, returning: false });
    }

    const me = await auth(db, token);

    if (route === 'me') {
      if (!me) return bad('Sign in first', 401);
      const stats = await db.prepare('SELECT COUNT(*) AS rounds, MAX(score) AS best, AVG(score) AS avg, SUM(liners) AS liners, SUM(CASE WHEN mode IS NOT NULL THEN 10 ELSE 0 END) AS balls FROM rounds WHERE player_id = ?').bind(me.id).first();
      const open = await db.prepare(MJOIN + ` WHERE (m.a_player = ? OR m.b_player = ?) AND m.status = 'open' ORDER BY m.created DESC LIMIT 20`).bind(me.id, me.id).all();
      const recent = await db.prepare(MJOIN + ` WHERE (m.a_player = ? OR m.b_player = ?) AND m.status = 'done' ORDER BY m.created DESC LIMIT 10`).bind(me.id, me.id).all();
      return json({ player: pub(me), stats, open: open.results, recent: recent.results });
    }

    if (route === 'round' && method === 'POST') {
      if (!me) return bad('Sign in first', 401);
      if (!Array.isArray(body.balls) || body.balls.length !== 10) return bad('A round is 10 balls');
      const level = levelOK(body.level) ? body.level : me.level;
      const mode = ['solo', 'challenge', 'h2h'].includes(body.mode) ? body.mode : 'solo';
      const forPlayer = body.for_player && me.role === 'coach' ? clean(body.for_player, 40) : me.id;
      const s = scoreBalls(body.balls);
      const r = { id: id(), player_id: forPlayer, mode, level, match_id: body.match_id ? clean(body.match_id, 40) : null };
      await db.prepare('INSERT INTO rounds (id,player_id,mode,level,score,liners,called,best_streak,balls,match_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(r.id, r.player_id, r.mode, r.level, s.score, s.liners, s.called, s.best, JSON.stringify(s.balls), r.match_id, now).run();
      let match = null;
      if (r.match_id) {
        const m = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(r.match_id).first();
        if (m && m.status === 'open') {
          const side = m.a_player === forPlayer ? 'a' : (m.b_player === forPlayer ? 'b' : null);
          if (side) {
            await db.prepare(`UPDATE matches SET ${side}_round = ?, ${side}_score = ? WHERE id = ?`).bind(r.id, s.score, m.id).run();
            const m2 = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(m.id).first();
            if (m2.a_score !== null && m2.b_score !== null) {
              const winner = m2.a_score === m2.b_score ? 'tie' : (m2.a_score > m2.b_score ? m2.a_player : m2.b_player);
              await db.prepare("UPDATE matches SET status = 'done', winner = ? WHERE id = ?").bind(winner, m2.id).run();
            }
            match = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first();
          }
        }
      }
      const rank = await db.prepare('SELECT COUNT(*) + 1 AS rank FROM rounds WHERE level = ? AND score > ?').bind(level, s.score).first();
      const total = await db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE level = ?').bind(level).first();
      return json({ round: { id: r.id, score: s.score, liners: s.liners, called: s.called, best_streak: s.best, balls: s.balls }, rank: rank.rank, of: total.n, match });
    }

    if (route === 'leaderboard') {
      const level = levelOK(url.searchParams.get('level')) ? url.searchParams.get('level') : null;
      const range = url.searchParams.get('range') === 'all' ? 0 : now - 7 * 86400000;
      const q = `SELECT p.name, p.id AS player_id, p.age, r.score, r.liners, r.called, r.best_streak, r.level, r.created FROM rounds r JOIN players p ON p.id = r.player_id
        WHERE r.created >= ? ${level ? 'AND r.level = ?' : ''} ORDER BY r.score DESC, r.created ASC LIMIT 25`;
      const stmt = level ? db.prepare(q).bind(range, level) : db.prepare(q).bind(range);
      const rows = await stmt.all();
      return json({ rows: rows.results });
    }

    if (route === 'players') {
      if (!me) return bad('Sign in first', 401);
      const qs = clean(url.searchParams.get('q'), 40).toLowerCase();
      if (qs.length < 2) return json({ rows: [] });
      const rows = await db.prepare("SELECT id, name, level, age FROM players WHERE (lower(name) LIKE ? OR lower(email) = ?) AND id != ? LIMIT 12")
        .bind('%' + qs + '%', qs, me.id).all();
      return json({ rows: rows.results });
    }

    if (route === 'challenge' && method === 'POST') {
      if (!me) return bad('Sign in first', 401);
      /* With no "to", this is an open invite: the first player to open the link joins as B. */
      let other = null;
      if (body.to) {
        other = await db.prepare('SELECT * FROM players WHERE id = ? OR lower(email) = ?').bind(clean(body.to, 120), clean(body.to, 120).toLowerCase()).first();
        if (!other || other.id === me.id) return bad('Pick another player');
      }
      const m = { id: id(), type: 'challenge', created_by: me.id, a_player: me.id, b_player: other ? other.id : '' };
      await db.prepare('INSERT INTO matches (id,type,created_by,a_player,b_player,status,created) VALUES (?,?,?,?,?,?,?)')
        .bind(m.id, m.type, m.created_by, m.a_player, m.b_player, 'open', now).run();
      return json({ match: { ...m, a_name: me.name, b_name: other ? other.name : '', status: 'open' } });
    }

    if (route === 'join' && method === 'POST') {
      if (!me) return bad('Sign in first', 401);
      const m = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(clean(body.match_id, 40)).first();
      if (!m || m.type !== 'challenge') return bad('That challenge link is not valid', 404);
      if (m.a_player === me.id) return json({ match: await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first(), mine: true });
      if (!m.b_player) await db.prepare('UPDATE matches SET b_player = ? WHERE id = ? AND b_player = ?').bind(me.id, m.id, '').run();
      const m2 = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(m.id).first();
      if (m2.b_player !== me.id) return bad('Someone else already took that challenge', 409);
      return json({ match: m2, mine: false });
    }

    if (route === 'h2h' && method === 'POST') {
      if (!me) return bad('Sign in first', 401);
      if (me.role !== 'coach') return bad('Head-to-head is a coach feature', 403);
      const a = await db.prepare('SELECT * FROM players WHERE id = ?').bind(clean(body.a, 40)).first();
      const b = await db.prepare('SELECT * FROM players WHERE id = ?').bind(clean(body.b, 40)).first();
      if (!a || !b || a.id === b.id) return bad('Pick two different players');
      const m = { id: id(), type: 'h2h', created_by: me.id, a_player: a.id, b_player: b.id };
      await db.prepare('INSERT INTO matches (id,type,created_by,a_player,b_player,status,created) VALUES (?,?,?,?,?,?,?)')
        .bind(m.id, m.type, m.created_by, m.a_player, m.b_player, 'open', now).run();
      return json({ match: { ...m, a_name: a.name, b_name: b.name, status: 'open' } });
    }

    if (route === 'match') {
      const m = await db.prepare(MJOIN + ' WHERE m.id = ?').bind(clean(url.searchParams.get('id'), 40)).first();
      if (!m) return bad('No such match', 404);
      return json({ match: m });
    }

    if (route === 'roster') {
      if (!me) return bad('Sign in first', 401);
      if (me.role !== 'coach') return bad('Coach feature', 403);
      const rows = await db.prepare(`SELECT p.id, p.name, p.level, COUNT(r.id) AS rounds, MAX(r.score) AS best FROM players p
        LEFT JOIN rounds r ON r.player_id = p.id WHERE p.role = 'player' GROUP BY p.id ORDER BY p.name LIMIT 200`).all();
      return json({ rows: rows.results });
    }

    return bad('Not found', 404);
  } catch (e) {
    if (String(e.message || e).includes('no such table')) { await ensure(db); return bad('Database was empty and has been set up. Try again.', 503); }
    return bad('Server error: ' + (e.message || e), 500);
  }
}
