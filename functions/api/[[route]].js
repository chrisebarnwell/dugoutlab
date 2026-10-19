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
  `CREATE TABLE IF NOT EXISTS subscribers (
    email TEXT PRIMARY KEY, source TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS lineup_sends (
    id TEXT PRIMARY KEY, email_hash TEXT NOT NULL, ip_hash TEXT NOT NULL, ok INTEGER NOT NULL, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS lineup_sends_email ON lineup_sends(email_hash, created)`,
  `CREATE INDEX IF NOT EXISTS lineup_sends_ip ON lineup_sends(ip_hash, created)`,
  `CREATE INDEX IF NOT EXISTS hitters_acct ON hitters(account_id)`,
  `CREATE INDEX IF NOT EXISTS rounds_hitter ON rounds(hitter_id, created)`,
  `CREATE INDEX IF NOT EXISTS rounds_level ON rounds(level, score)`,
  `CREATE INDEX IF NOT EXISTS matches_a ON matches(a_hitter, status)`,
  `CREATE INDEX IF NOT EXISTS matches_b ON matches(b_hitter, status)`,
  /* Pitch Tracker. Kids and players: nickname + age only (plus jersey for coach rosters). No other child data. */
  `CREATE TABLE IF NOT EXISTS pitch_teams (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, age INTEGER NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pitch_kids (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'kid', team_id TEXT,
    nickname TEXT NOT NULL, age INTEGER NOT NULL, jersey TEXT NOT NULL DEFAULT '', own INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pitch_sessions (
    session_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kid_id TEXT NOT NULL, tag TEXT NOT NULL, date TEXT NOT NULL,
    pitches INTEGER NOT NULL, strikes INTEGER NOT NULL, balls INTEGER NOT NULL, logged_by_role TEXT NOT NULL,
    fb INTEGER NOT NULL DEFAULT 0, ch INTEGER NOT NULL DEFAULT 0, seq TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pitch_teams_acct ON pitch_teams(account_id)`,
  `CREATE INDEX IF NOT EXISTS pitch_kids_acct ON pitch_kids(account_id)`,
  `CREATE INDEX IF NOT EXISTS pitch_sessions_kid ON pitch_sessions(kid_id, date)`
];

/* ---------- Pitch Tracker premium gate ----------
   Feature flag: Pages env var PITCH_PREMIUM_GATE = "on" locks coach tools to plan 'pro'.
   Unset or anything else = coach tools open (beta). Payments are not wired: see route pitch/upgrade. */
function pitchGateOn(env) { return env.PITCH_PREMIUM_GATE === 'on'; }
function coachOn(env, a) { return !!a && a.role === 'coach' && (!pitchGateOn(env) || a.plan === 'pro'); }
const PT_TAGS = ['Home', 'Practice', 'Game'];
function ageOK(n) { n = parseInt(n, 10); return n >= 6 && n <= 18 ? n : 0; }
async function ownKid(db, acct, kid) {
  if (!acct || !kid) return null;
  return db.prepare('SELECT * FROM pitch_kids WHERE id = ? AND account_id = ?').bind(clean(kid, 40), acct.id).first();
}
/* Coach charting their own kid (or any kid on a coach account outside a team) must pick the tag every time. */
function needsPick(env, acct, k) { return coachOn(env, acct) && (k.kind === 'kid' || k.own === 1); }
function allowedTags(env, acct, k) {
  if (!coachOn(env, acct)) return ['Home'];
  return needsPick(env, acct, k) ? PT_TAGS : ['Practice', 'Game'];
}
function pubKid(env, acct, k) {
  return { id: k.id, kind: k.kind, team_id: k.team_id || null, nickname: k.nickname, age: k.age, jersey: k.jersey, own: k.own === 1, tags: allowedTags(env, acct, k), pick: needsPick(env, acct, k) };
}

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

/* ---------- Lineup email (Resend) ----------
   Needs Pages env vars: RESEND_API_KEY (secret) and LINEUP_FROM, e.g. "DugoutLab <lineups@dugoutlab.com>".
   The sending domain must be verified in Resend. Without both, the feature reports itself as off. */
const LIMIT_PER_EMAIL = 4, LIMIT_PER_IP = 8, LIMIT_WINDOW = 3600000;
function lineupEmailOn(env) { return !!(env.RESEND_API_KEY && env.LINEUP_FROM && env.DB); }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function txt(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 60); }
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
/* Accept only the lineup itself: names, cells, a few game details. Tiers and notes are never sent by the page and are dropped here if present. */
function cleanLineup(L) {
  if (!L || typeof L !== 'object') return null;
  const columns = Array.isArray(L.columns) ? L.columns.slice(0, 12).map(c => txt(c, 16)) : [];
  if (columns.length < 1) return null;
  const rows = [];
  for (const r of (Array.isArray(L.rows) ? L.rows : []).slice(0, 40)) {
    if (r && r.group) { rows.push({ group: txt(r.group, 60) }); continue; }
    if (!r || !Array.isArray(r.cells)) return null;
    const name = txt(r.name, 40);
    if (!name) return null;
    const cells = r.cells.slice(0, columns.length).map(c => txt(c, 12));
    rows.push({ name, cells });
  }
  if (!rows.some(r => r.name)) return null;
  const details = (Array.isArray(L.details) ? L.details : []).slice(0, 6).map(d => txt(d, 160)).filter(Boolean);
  return { title: txt(L.title, 80) || 'Your lineup', mode: txt(L.mode, 40), details, columns, firstCol: txt(L.firstCol, 16) || 'Player', rows, legend: txt(L.legend, 200) };
}
function lineupHtml(L, optin) {
  const th = 'padding:6px 8px;border:1px solid #999;background:#f3efe6;font:bold 12px Helvetica,Arial,sans-serif;text-align:center';
  const td = 'padding:6px 8px;border:1px solid #bbb;font:14px Helvetica,Arial,sans-serif;text-align:center';
  let rows = '';
  for (const r of L.rows) {
    if (r.group) { rows += `<tr><td colspan="${L.columns.length + 1}" style="${td};text-align:left;font-weight:bold;background:#faf8f3">${h(r.group)}</td></tr>`; continue; }
    rows += `<tr><td style="${td};text-align:left;font-weight:bold;white-space:nowrap">${h(r.name)}</td>` +
      r.cells.map(c => `<td style="${td}${/^(P|C)$/.test(c) ? ';font-weight:bold' : ''}">${h(c)}</td>`).join('') + '</tr>';
  }
  return `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff;color:#111">
<div style="max-width:720px;margin:0 auto">
<div style="font:bold 11px Helvetica,Arial,sans-serif;letter-spacing:2px;color:#555">DUGOUTLAB LINEUP</div>
<h1 style="font:bold 22px Helvetica,Arial,sans-serif;margin:6px 0 4px">${h(L.title)}</h1>
${L.mode ? `<div style="font:13px Helvetica,Arial,sans-serif;color:#555;margin-bottom:6px">${h(L.mode)}</div>` : ''}
${L.details.map(d => `<div style="font:14px Helvetica,Arial,sans-serif;margin:2px 0">${h(d)}</div>`).join('')}
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:14px 0;width:100%">
<tr><th style="${th};text-align:left">${h(L.firstCol)}</th>${L.columns.map(c => `<th style="${th}">${h(c)}</th>`).join('')}</tr>
${rows}</table>
${L.legend ? `<div style="font:12px Helvetica,Arial,sans-serif;color:#555">${h(L.legend)}</div>` : ''}
<p style="font:12px Helvetica,Arial,sans-serif;color:#555;margin-top:18px;line-height:1.5">You asked dugoutlab.com to email this lineup to you. This did not create an account, and the lineup is not saved online.${optin ? ' You also asked for occasional DugoutLab coaching tools and updates. Reply "unsubscribe" any time to stop those.' : ''}</p>
<p style="font:12px Helvetica,Arial,sans-serif;color:#555">Make them want to come back tomorrow. dugoutlab.com</p>
</div></body></html>`;
}
function lineupText(L, optin) {
  const w0 = Math.max(L.firstCol.length, ...L.rows.filter(r => r.name).map(r => r.name.length)) + 2;
  const ws = L.columns.map((c, i) => Math.max(c.length, ...L.rows.filter(r => r.name).map(r => (r.cells[i] || '').length)) + 2);
  const line = (a, cells) => a.padEnd(w0) + cells.map((c, i) => (c || '').padEnd(ws[i])).join('');
  const out = ['DUGOUTLAB LINEUP', L.title];
  if (L.mode) out.push(L.mode);
  out.push(...L.details, '', line(L.firstCol, L.columns), '-'.repeat(w0 + ws.reduce((a, b) => a + b, 0)));
  for (const r of L.rows) out.push(r.group ? '[' + r.group + ']' : line(r.name, r.cells));
  if (L.legend) out.push('', L.legend);
  out.push('', 'You asked dugoutlab.com to email this lineup to you. This did not create an account, and the lineup is not saved online.' +
    (optin ? ' You also asked for occasional DugoutLab coaching tools and updates. Reply "unsubscribe" any time to stop those.' : ''), 'dugoutlab.com');
  return out.join('\n');
}

async function mirrorSub(env, email, source) {
  /* Same Google Sheet collector as game signups. */
  if (!env.EMAIL_HOOK) return;
  try {
    await fetch(env.EMAIL_HOOK, { method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ email, name: '', role: 'subscriber', source, website: '' }) });
  } catch (e) { /* never block signup on the mirror */ }
}
async function mirrorEmail(env, a, app) {
  /* Optional: copy new account emails to the Google Sheet collector. Set EMAIL_HOOK in Pages env vars. */
  if (!env.EMAIL_HOOK) return;
  try {
    await fetch(env.EMAIL_HOOK, { method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ email: a.email, name: a.name, role: a.role, source: (app || 'game') + '-' + a.role, website: '' }) });
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
      ctx.waitUntil(mirrorEmail(env, a, body.app === 'pitch' ? 'pitch' : 'game'));
      return json({ account: pubAcct(a), token: a.token, returning: false });
    }

    if (route === 'subscribe' && method === 'POST') {
      /* Free practice plan signup. Email only. Honeypot field "website" must stay empty. */
      if (body.website) return json({ ok: true });
      const email = clean(body.email, 120).toLowerCase();
      if (!emailOK(email)) return bad('That email does not look right');
      const source = clean(body.source, 40) || 'site';
      await ensure(db);
      const r = await db.prepare('INSERT OR IGNORE INTO subscribers (email,source,created) VALUES (?,?,?)').bind(email, source, now).run();
      if (r.meta && r.meta.changes) ctx.waitUntil(mirrorSub(env, email, source));
      return json({ ok: true });
    }

    if (route === 'lineup-email' && method === 'GET') {
      return json({ enabled: lineupEmailOn(env) });
    }

    if (route === 'lineup-email' && method === 'POST') {
      if (body.website) return json({ ok: true });
      if (!lineupEmailOn(env)) return bad('Email delivery is not set up yet. Print or download your lineup for now.', 503);
      const email = clean(body.email, 120).toLowerCase();
      if (!emailOK(email)) return bad('That email does not look right');
      const L = cleanLineup(body.lineup);
      if (!L) return bad('That lineup could not be read. Rebuild it and try again.');
      const optin = body.optin === true;
      await ensure(db);
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const eh = await sha('e:' + email), ih = await sha('i:' + ip), since = now - LIMIT_WINDOW;
      const byEmail = await db.prepare('SELECT COUNT(*) AS n FROM lineup_sends WHERE email_hash = ? AND created > ?').bind(eh, since).first();
      const byIp = await db.prepare('SELECT COUNT(*) AS n FROM lineup_sends WHERE ip_hash = ? AND created > ?').bind(ih, since).first();
      if (byEmail.n >= LIMIT_PER_EMAIL || byIp.n >= LIMIT_PER_IP) return bad('Too many emails in the last hour. Try again a little later.', 429);
      let res, info = {};
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'authorization': 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ from: env.LINEUP_FROM, to: [email], subject: 'Your lineup: ' + L.title,
            html: lineupHtml(L, optin), text: lineupText(L, optin), reply_to: env.LINEUP_REPLY_TO || undefined })
        });
        try { info = await res.json(); } catch (e) { info = {}; }
      } catch (e) { res = null; }
      const accepted = !!(res && res.ok && info && info.id);
      await db.prepare('INSERT INTO lineup_sends (id,email_hash,ip_hash,ok,created) VALUES (?,?,?,?,?)').bind(id(), eh, ih, accepted ? 1 : 0, now).run();
      if (!accepted) return bad('The email service did not accept that send. Check the address and try again.', 502);
      if (optin) {
        const r = await db.prepare('INSERT OR IGNORE INTO subscribers (email,source,created) VALUES (?,?,?)').bind(email, 'lineup-email', now).run();
        if (r.meta && r.meta.changes) ctx.waitUntil(mirrorSub(env, email, 'lineup-email'));
      }
      return json({ ok: true, id: info.id });
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

    /* ================= PITCH TRACKER ================= */
    if (route.indexOf('pitch/') === 0) {
      await ensure(db);
      const sub = route.slice(6);
      const coach = coachOn(env, me);

      if (sub === 'me') {
        const kids = (await db.prepare('SELECT * FROM pitch_kids WHERE account_id = ? ORDER BY team_id, created').bind(me.id).all()).results;
        const teams = coach ? (await db.prepare('SELECT id, name, age FROM pitch_teams WHERE account_id = ? ORDER BY created').bind(me.id).all()).results : [];
        const since = new Date(now - 6 * 86400000).toISOString().slice(0, 10);
        const recent = (await db.prepare('SELECT kid_id, date, SUM(pitches) AS pitches FROM pitch_sessions WHERE account_id = ? AND date >= ? GROUP BY kid_id, date').bind(me.id, since).all()).results;
        return json({
          account: pubAcct(me), coach, gate: pitchGateOn(env),
          kids: kids.filter(k => k.kind === 'kid' || coach).map(k => pubKid(env, me, k)),
          teams, recent
        });
      }

      if (sub === 'team' && method === 'POST') {
        if (!coach) return bad(me.role === 'coach' ? 'Coach tools are part of Coach Pro' : 'Teams are a coach feature', 403);
        const name = clean(body.name, 40), age = ageOK(body.age);
        if (name.length < 2) return bad('Add a team name');
        if (!age) return bad('Pick the team age (6 to 18)');
        if (body.id) {
          const t = await db.prepare('SELECT * FROM pitch_teams WHERE id = ? AND account_id = ?').bind(clean(body.id, 40), me.id).first();
          if (!t) return bad('Not your team', 403);
          await db.prepare('UPDATE pitch_teams SET name = ?, age = ? WHERE id = ?').bind(name, age, t.id).run();
          return json({ team: { id: t.id, name, age } });
        }
        const n = await db.prepare('SELECT COUNT(*) AS n FROM pitch_teams WHERE account_id = ?').bind(me.id).first();
        if (n.n >= 6) return bad('Up to 6 teams per coach');
        const t = { id: id(), name, age };
        await db.prepare('INSERT INTO pitch_teams (id,account_id,name,age,created) VALUES (?,?,?,?,?)').bind(t.id, me.id, name, age, now).run();
        return json({ team: t });
      }

      if (sub === 'kid' && method === 'POST') {
        const nickname = clean(body.nickname, 24), age = ageOK(body.age);
        if (nickname.length < 2) return bad('Add a first name or nickname');
        if (!age) return bad('Pick an age from 6 to 18');
        let teamId = null, jersey = '', kind = 'kid', own = 0;
        if (body.team_id) {
          if (!coach) return bad('Team rosters are a coach feature', 403);
          const t = await db.prepare('SELECT * FROM pitch_teams WHERE id = ? AND account_id = ?').bind(clean(body.team_id, 40), me.id).first();
          if (!t) return bad('Not your team', 403);
          teamId = t.id; kind = 'player'; own = body.own ? 1 : 0;
          jersey = clean(body.jersey, 3).replace(/[^0-9]/g, '');
        }
        if (body.id) {
          const k = await ownKid(db, me, body.id);
          if (!k) return bad('Not your player', 403);
          await db.prepare('UPDATE pitch_kids SET nickname = ?, age = ?, jersey = ?, own = ? WHERE id = ?')
            .bind(nickname, age, k.kind === 'player' ? jersey : '', k.kind === 'player' ? own : 0, k.id).run();
          return json({ kid: pubKid(env, me, await ownKid(db, me, k.id)) });
        }
        const cnt = teamId
          ? await db.prepare('SELECT COUNT(*) AS n FROM pitch_kids WHERE team_id = ?').bind(teamId).first()
          : await db.prepare("SELECT COUNT(*) AS n FROM pitch_kids WHERE account_id = ? AND kind = 'kid'").bind(me.id).first();
        if (cnt.n >= (teamId ? 30 : 8)) return bad(teamId ? 'Up to 30 players per team' : 'Up to 8 kids per account');
        const k = { id: id(), account_id: me.id, kind, team_id: teamId, nickname, age, jersey, own, created: now };
        await db.prepare('INSERT INTO pitch_kids (id,account_id,kind,team_id,nickname,age,jersey,own,created) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(k.id, k.account_id, k.kind, k.team_id, k.nickname, k.age, k.jersey, k.own, k.created).run();
        return json({ kid: pubKid(env, me, k) });
      }

      if (sub === 'kid' && method === 'GET') {
        const k = await ownKid(db, me, url.searchParams.get('kid'));
        if (!k) return bad('Not your player', 404);
        const sessions = (await db.prepare('SELECT session_id, tag, date, pitches, strikes, balls, fb, ch, created FROM pitch_sessions WHERE kid_id = ? AND account_id = ? ORDER BY date, created LIMIT 500')
          .bind(k.id, me.id).all()).results;
        return json({ kid: pubKid(env, me, k), sessions });
      }

      if (sub === 'session' && method === 'POST') {
        const k = await ownKid(db, me, body.kid_id);
        if (!k) return bad('Pick a player first', 403);
        const tags = allowedTags(env, me, k);
        let tag = tags.length === 1 ? tags[0] : body.tag;
        if (tags.indexOf(tag) < 0) return bad(needsPick(env, me, k) ? 'Pick Home, Practice, or Game' : 'Pick Practice or Game');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : new Date(now).toISOString().slice(0, 10);
        const seq = String(body.seq || '').toUpperCase().replace(/[^SB]/g, '').slice(0, 250);
        if (!seq.length) return bad('No pitches to save');
        const types = String(body.types || '').toUpperCase().replace(/[^FC-]/g, '').slice(0, seq.length);
        const strikes = (seq.match(/S/g) || []).length, balls = seq.length - strikes;
        const fb = (types.match(/F/g) || []).length, ch = (types.match(/C/g) || []).length;
        const sid = id();
        await db.prepare('INSERT INTO pitch_sessions (session_id,account_id,kid_id,tag,date,pitches,strikes,balls,logged_by_role,fb,ch,seq,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(sid, me.id, k.id, tag, date, seq.length, strikes, balls, me.role, fb, ch, seq, now).run();
        return json({ session: { session_id: sid, tag, date, pitches: seq.length, strikes, balls, fb, ch } });
      }

      if (sub === 'kid-delete' && method === 'POST') {
        const k = await ownKid(db, me, body.kid_id);
        if (!k) return bad('Not your player', 404);
        await db.prepare('DELETE FROM pitch_sessions WHERE kid_id = ? AND account_id = ?').bind(k.id, me.id).run();
        await db.prepare('DELETE FROM pitch_kids WHERE id = ?').bind(k.id).run();
        return json({ ok: true });
      }

      if (sub === 'team-delete' && method === 'POST') {
        const t = await db.prepare('SELECT * FROM pitch_teams WHERE id = ? AND account_id = ?').bind(clean(body.team_id, 40), me.id).first();
        if (!t) return bad('Not your team', 404);
        await db.prepare('DELETE FROM pitch_sessions WHERE kid_id IN (SELECT id FROM pitch_kids WHERE team_id = ?)').bind(t.id).run();
        await db.prepare('DELETE FROM pitch_kids WHERE team_id = ?').bind(t.id).run();
        await db.prepare('DELETE FROM pitch_teams WHERE id = ?').bind(t.id).run();
        return json({ ok: true });
      }

      if (sub === 'account-delete' && method === 'POST') {
        /* Deletes everything tied to this adult account: pitch data, Hit Window hitters and rounds, and the email list row. */
        if (body.confirm !== 'DELETE') return bad('Type DELETE to confirm');
        const hs = (await db.prepare('SELECT id FROM hitters WHERE account_id = ?').bind(me.id).all()).results.map(r => r.id);
        for (const hid of hs) {
          await db.prepare('DELETE FROM rounds WHERE hitter_id = ?').bind(hid).run();
          await db.prepare('DELETE FROM matches WHERE a_hitter = ? OR b_hitter = ?').bind(hid, hid).run();
        }
        await db.prepare('DELETE FROM hitters WHERE account_id = ?').bind(me.id).run();
        await db.prepare('DELETE FROM pitch_sessions WHERE account_id = ?').bind(me.id).run();
        await db.prepare('DELETE FROM pitch_kids WHERE account_id = ?').bind(me.id).run();
        await db.prepare('DELETE FROM pitch_teams WHERE account_id = ?').bind(me.id).run();
        await db.prepare('DELETE FROM subscribers WHERE email = ?').bind(me.email).run();
        await db.prepare('DELETE FROM accounts WHERE id = ?').bind(me.id).run();
        return json({ ok: true });
      }

      if (sub === 'upgrade' && method === 'POST') {
        /* STUB. Wire Stripe Payment Link or Gumroad here, then set plan = 'pro' on a verified payment webhook. */
        return json({ ok: false, live: false, message: 'Coach Pro checkout is not open yet. Coach tools are free while we test.' });
      }

      return bad('Not found', 404);
    }

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
