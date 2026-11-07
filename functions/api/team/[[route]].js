/* DugoutLab My Team + timed runs. Cloudflare Pages Function + the same D1 binding (DB) as /api.

   The coach roster is the same one Pitch Tracker uses (pitch_teams + pitch_kids, kind 'player'), so one roster
   follows the coach into every tool. Players are a first name and a jersey number only. The player's age is the
   team age. No last names, no photos, no kid emails.

   Parent contact (optional, per player): a parent or guardian's name and email, typed by the coach.
     player_contacts: player_id, account_id, parent_name, parent_email, updated
   Kept in its own table and its own route so it never lands in the roster cache on every page. DugoutLab never
   emails these addresses; they are for the coach only. Deleted with the player, the team, or the account.

   Timed runs (Home to First today; the kind column leaves room for other timers later):
     runs: id, coach_id, player_id, session_id, date, type (Practice|Game), run_number (1|2), seconds, created_at
   Run ids come from the phone, so a save queued offline and sent twice is stored once.

   Routes (token in the JSON body or ?token=):
     GET  /api/team/roster                          -> { account, teams, players }
     POST /api/team/team    { id?, name, age }      -> { team }
     POST /api/team/player  { id?, team_id, name, jersey, parent_name?, parent_email? } -> { player, contact }
     POST /api/team/bulk    { team_id, players: [{ name, jersey, parent_name?, parent_email? }] } -> { added: [player], skipped, bad_emails }
     GET  /api/team/contacts?team=                  -> { contacts: { player_id: { parent_name, parent_email } } }
     POST /api/team/player-delete { id }            -> { ok }
     GET  /api/team/runs?player= | ?session= | ?team=  -> { runs }
     POST /api/team/runs    { add: [run], remove: [id] } -> { saved: [id], removed: [id], rejected: [{ id, error }] }
   Account deletion in /api/pitch/account-delete also removes runs and parent contacts. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pitch_teams (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, age INTEGER NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pitch_kids (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'kid', team_id TEXT,
    nickname TEXT NOT NULL, age INTEGER NOT NULL, jersey TEXT NOT NULL DEFAULT '', own INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS coach_trials (account_id TEXT PRIMARY KEY, started INTEGER NOT NULL, ends INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, player_id TEXT NOT NULL, session_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'h2f', date TEXT NOT NULL, type TEXT NOT NULL, run_number INTEGER NOT NULL,
    seconds REAL NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS player_contacts (
    player_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, parent_name TEXT NOT NULL DEFAULT '',
    parent_email TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, date)`,
  `CREATE INDEX IF NOT EXISTS runs_coach ON runs(coach_id, session_id)`
];
const TRIAL_DAYS = 14, MAX_TEAMS = 6, MAX_PLAYERS = 30, MAX_RUNS_PER_SESSION = 2;
const TYPES = ['Practice', 'Game'];

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function bad(msg, status) { return json({ error: msg }, status || 400); }
function id() { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); }
function clean(s, n) { return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 60); }
function ageOK(n) { n = parseInt(n, 10); return n >= 6 && n <= 18 ? n : 0; }
function jerseyOK(j) { return String(j == null ? '' : j).replace(/[^0-9]/g, '').slice(0, 3); }
function emailOK(e) {
  e = String(e || '').trim().toLowerCase().slice(0, 120);
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/.test(e) ? e : '';
}
async function setContact(db, me, pid, name, email, now) {
  if (!name && !email) { await db.prepare('DELETE FROM player_contacts WHERE player_id = ? AND account_id = ?').bind(pid, me.id).run(); return null; }
  await db.prepare('INSERT INTO player_contacts (player_id,account_id,parent_name,parent_email,updated) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(player_id) DO UPDATE SET parent_name = excluded.parent_name, parent_email = excluded.parent_email, updated = excluded.updated')
    .bind(pid, me.id, name, email, now).run();
  return { parent_name: name, parent_email: email };
}
function dateOK(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : ''; }
async function ensure(db) { for (const s of SCHEMA) await db.prepare(s).run(); }
async function auth(db, token) { return token ? db.prepare('SELECT * FROM accounts WHERE token = ?').bind(token).first() : null; }
async function ownTeam(db, me, tid) {
  return tid ? db.prepare('SELECT * FROM pitch_teams WHERE id = ? AND account_id = ?').bind(clean(tid, 40), me.id).first() : null;
}
async function ownPlayer(db, me, pid) {
  return pid ? db.prepare('SELECT * FROM pitch_kids WHERE id = ? AND account_id = ?').bind(clean(pid, 40), me.id).first() : null;
}
function pubTeam(t) { return { id: t.id, name: t.name, age: t.age }; }
function pubPlayer(k) { return { id: k.id, team_id: k.team_id || null, name: k.nickname, jersey: k.jersey || '', kind: k.kind }; }
function pubRun(r) {
  return { id: r.id, coachId: r.coach_id, playerId: r.player_id, sessionId: r.session_id, date: r.date, type: r.type,
    runNumber: r.run_number, seconds: Math.round(r.seconds * 100) / 100, createdAt: r.created_at };
}
/* First names only. "Will 7", "7 Will", "Will #7", "Will B 7" (a last initial tells two Wills apart). */
function nameOK(raw) {
  const parts = clean(raw, 40).replace(/[^A-Za-zÀ-ɏ' .-]/g, '').trim().split(' ').filter(Boolean);
  if (!parts.length) return '';
  let n = parts[0];
  if (parts[1] && /^[A-Za-z]\.?$/.test(parts[1])) n += ' ' + parts[1].charAt(0).toUpperCase();
  return n.slice(0, 24);
}

async function becomeCoach(db, me, now) {
  if (me.role !== 'coach') await db.prepare("UPDATE accounts SET role = 'coach' WHERE id = ?").bind(me.id).run();
  await db.prepare('INSERT OR IGNORE INTO coach_trials (account_id, started, ends) VALUES (?,?,?)').bind(me.id, now, now + TRIAL_DAYS * 86400000).run();
  me.role = 'coach';
}

async function addPlayer(db, me, team, name, jersey, now) {
  const k = { id: id(), account_id: me.id, kind: 'player', team_id: team.id, nickname: name, age: team.age, jersey, own: 0, created: now };
  await db.prepare('INSERT INTO pitch_kids (id,account_id,kind,team_id,nickname,age,jersey,own,created) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(k.id, k.account_id, k.kind, k.team_id, k.nickname, k.age, k.jersey, k.own, k.created).run();
  return k;
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

    if (route === 'roster' && method === 'GET') {
      const teams = (await db.prepare('SELECT id, name, age FROM pitch_teams WHERE account_id = ? ORDER BY created').bind(me.id).all()).results;
      const players = (await db.prepare("SELECT * FROM pitch_kids WHERE account_id = ? ORDER BY created").bind(me.id).all()).results;
      return json({ account: { id: me.id, name: me.name, role: me.role }, teams: teams.map(pubTeam), players: players.map(pubPlayer) });
    }

    if (route === 'team' && method === 'POST') {
      const name = clean(body.name, 40), age = ageOK(body.age);
      if (name.length < 2) return bad('Add a team name');
      if (!age) return bad('Pick the team age (6 to 18)');
      if (body.id) {
        const t = await ownTeam(db, me, body.id);
        if (!t) return bad('Not your team', 403);
        await db.prepare('UPDATE pitch_teams SET name = ?, age = ? WHERE id = ?').bind(name, age, t.id).run();
        await db.prepare("UPDATE pitch_kids SET age = ? WHERE team_id = ? AND own = 0").bind(age, t.id).run();
        return json({ team: { id: t.id, name, age } });
      }
      const n = await db.prepare('SELECT COUNT(*) AS n FROM pitch_teams WHERE account_id = ?').bind(me.id).first();
      if (n.n >= MAX_TEAMS) return bad('Up to ' + MAX_TEAMS + ' teams per coach');
      await becomeCoach(db, me, now);
      const t = { id: id(), name, age };
      await db.prepare('INSERT INTO pitch_teams (id,account_id,name,age,created) VALUES (?,?,?,?,?)').bind(t.id, me.id, name, age, now).run();
      return json({ team: t });
    }

    if (route === 'contacts' && method === 'GET') {
      const t = await ownTeam(db, me, url.searchParams.get('team'));
      if (!t) return bad('Not your team', 404);
      const rows = (await db.prepare('SELECT c.player_id, c.parent_name, c.parent_email FROM player_contacts c JOIN pitch_kids k ON k.id = c.player_id WHERE k.team_id = ? AND c.account_id = ?').bind(t.id, me.id).all()).results;
      const contacts = {};
      rows.forEach(r => { contacts[r.player_id] = { parent_name: r.parent_name, parent_email: r.parent_email }; });
      return json({ contacts });
    }

    if (route === 'player' && method === 'POST') {
      const name = nameOK(body.name), jersey = jerseyOK(body.jersey);
      if (name.length < 2) return bad('Add a first name');
      const hasContact = 'parent_name' in body || 'parent_email' in body;
      const pName = clean(body.parent_name, 60), pRaw = String(body.parent_email || '').trim(), pEmail = emailOK(pRaw);
      if (pRaw && !pEmail) return bad('That parent email does not look right');
      if (body.id) {
        const k = await ownPlayer(db, me, body.id);
        if (!k) return bad('Not your player', 403);
        await db.prepare('UPDATE pitch_kids SET nickname = ?, jersey = ? WHERE id = ?').bind(name, k.kind === 'player' ? jersey : '', k.id).run();
        const contact = hasContact ? await setContact(db, me, k.id, pName, pEmail, now) : undefined;
        return json({ player: pubPlayer(await ownPlayer(db, me, k.id)), contact });
      }
      const t = await ownTeam(db, me, body.team_id);
      if (!t) return bad('Set up your team first', 403);
      const c = await db.prepare('SELECT COUNT(*) AS n FROM pitch_kids WHERE team_id = ?').bind(t.id).first();
      if (c.n >= MAX_PLAYERS) return bad('Up to ' + MAX_PLAYERS + ' players per team');
      const k = await addPlayer(db, me, t, name, jersey, now);
      const contact = await setContact(db, me, k.id, pName, pEmail, now);
      return json({ player: pubPlayer(k), contact });
    }

    if (route === 'bulk' && method === 'POST') {
      const t = await ownTeam(db, me, body.team_id);
      if (!t) return bad('Set up your team first', 403);
      const list = Array.isArray(body.players) ? body.players.slice(0, MAX_PLAYERS) : [];
      const existing = (await db.prepare('SELECT nickname, jersey FROM pitch_kids WHERE team_id = ?').bind(t.id).all()).results;
      const seen = new Set(existing.map(e => e.nickname.toLowerCase() + '#' + (e.jersey || '')));
      let room = MAX_PLAYERS - existing.length, skipped = 0, badEmails = 0;
      const added = [];
      for (const p of list) {
        const name = nameOK(p && p.name), jersey = jerseyOK(p && p.jersey), key = name.toLowerCase() + '#' + jersey;
        if (name.length < 2 || seen.has(key) || room <= 0) { skipped++; continue; }
        seen.add(key); room--;
        const k = await addPlayer(db, me, t, name, jersey, now);
        const pRaw = String((p && p.parent_email) || '').trim(), pEmail = emailOK(pRaw);
        if (pRaw && !pEmail) badEmails++;
        await setContact(db, me, k.id, clean(p && p.parent_name, 60), pEmail, now);
        added.push(pubPlayer(k));
      }
      return json({ added, skipped, bad_emails: badEmails });
    }

    if (route === 'player-delete' && method === 'POST') {
      const k = await ownPlayer(db, me, body.id);
      if (!k) return bad('Not your player', 404);
      await db.prepare('DELETE FROM runs WHERE player_id = ? AND coach_id = ?').bind(k.id, me.id).run();
      try { await db.prepare('DELETE FROM pitch_sessions WHERE kid_id = ? AND account_id = ?').bind(k.id, me.id).run(); } catch (e) { /* no pitch table yet */ }
      await db.prepare('DELETE FROM player_contacts WHERE player_id = ? AND account_id = ?').bind(k.id, me.id).run();
      await db.prepare('DELETE FROM pitch_kids WHERE id = ?').bind(k.id).run();
      return json({ ok: true });
    }

    if (route === 'runs' && method === 'GET') {
      const pid = url.searchParams.get('player'), sid = url.searchParams.get('session'), tid = url.searchParams.get('team');
      let rows;
      if (pid) {
        const k = await ownPlayer(db, me, pid);
        if (!k) return bad('Not your player', 404);
        rows = (await db.prepare('SELECT * FROM runs WHERE player_id = ? AND coach_id = ? ORDER BY date, created_at LIMIT 2000').bind(k.id, me.id).all()).results;
      } else if (sid) {
        rows = (await db.prepare('SELECT * FROM runs WHERE session_id = ? AND coach_id = ? ORDER BY created_at').bind(clean(sid, 80), me.id).all()).results;
      } else if (tid) {
        const t = await ownTeam(db, me, tid);
        if (!t) return bad('Not your team', 404);
        rows = (await db.prepare('SELECT r.* FROM runs r JOIN pitch_kids k ON k.id = r.player_id WHERE k.team_id = ? AND r.coach_id = ? ORDER BY r.date, r.created_at LIMIT 10000').bind(t.id, me.id).all()).results;
      } else {
        rows = (await db.prepare('SELECT * FROM runs WHERE coach_id = ? ORDER BY date, created_at LIMIT 10000').bind(me.id).all()).results;
      }
      return json({ runs: rows.map(pubRun) });
    }

    if (route === 'runs' && method === 'POST') {
      const add = Array.isArray(body.add) ? body.add.slice(0, 200) : [];
      const remove = Array.isArray(body.remove) ? body.remove.slice(0, 200) : [];
      const saved = [], removed = [], rejected = [];
      for (const rid of remove) {
        const r = clean(rid, 40);
        await db.prepare('DELETE FROM runs WHERE id = ? AND coach_id = ?').bind(r, me.id).run();
        removed.push(r);
      }
      for (const r of add) {
        const rid = clean(r && r.id, 40);
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(rid)) { rejected.push({ id: rid, error: 'Bad run id' }); continue; }
        const dup = await db.prepare('SELECT coach_id FROM runs WHERE id = ?').bind(rid).first();
        if (dup) { if (dup.coach_id === me.id) saved.push(rid); else rejected.push({ id: rid, error: 'Bad run id' }); continue; }
        const k = await ownPlayer(db, me, r.playerId);
        if (!k) { rejected.push({ id: rid, error: 'Not your player' }); continue; }
        const date = dateOK(r.date), type = TYPES.indexOf(r.type) >= 0 ? r.type : '', sid = clean(r.sessionId, 80);
        const secs = Math.round(Number(r.seconds) * 100) / 100;
        if (!date || !type || !sid) { rejected.push({ id: rid, error: 'Missing date, type or session' }); continue; }
        if (!(secs >= 1 && secs <= 30)) { rejected.push({ id: rid, error: 'Time out of range' }); continue; }
        const have = (await db.prepare('SELECT run_number FROM runs WHERE player_id = ? AND session_id = ? AND coach_id = ?').bind(k.id, sid, me.id).all()).results;
        if (have.length >= MAX_RUNS_PER_SESSION) { rejected.push({ id: rid, error: 'Two runs already saved this session' }); continue; }
        const used = have.map(h => h.run_number);
        let num = parseInt(r.runNumber, 10);
        if (!(num >= 1 && num <= MAX_RUNS_PER_SESSION) || used.indexOf(num) >= 0) num = used.indexOf(1) < 0 ? 1 : 2;
        const created = Number(r.createdAt) > 0 && Number(r.createdAt) <= now + 60000 ? Math.round(Number(r.createdAt)) : now;
        await db.prepare('INSERT OR IGNORE INTO runs (id,coach_id,player_id,session_id,kind,date,type,run_number,seconds,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(rid, me.id, k.id, sid, 'h2f', date, type, num, secs, created).run();
        saved.push(rid);
      }
      return json({ saved, removed, rejected });
    }

    return bad('Not found', 404);
  } catch (e) {
    return bad('Server error: ' + (e.message || e), 500);
  }
}
