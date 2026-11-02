/* DugoutLab My Team: the coach roster on every page, plus the timed-run save queue.
   Loaded by js/site.js on every page when someone is signed in.

   DLTeam.cached()          -> { teams, players, at } from this phone, or null (instant, works offline)
   DLTeam.refresh()         -> Promise of the same, fresh from /api/team/roster (falls back to the cache)
   DLTeam.current()         -> the team the coach picked last (or the first one)
   DLTeam.setCurrent(id)
   DLTeam.players(teamId?)  -> players on that team (default: current), roster order
   DLTeam.api(path, body?)  -> Promise of JSON. GET without a body.
   DLTeam.queueRun(run) / DLTeam.queueRemove(id) / DLTeam.flush() / DLTeam.pending()
     Saves go to the phone first, then to the server. Anything that fails waits here and is
     sent again when the phone is back online, from any DugoutLab page. */
(function () {
  if (window.DLTeam) return;
  var CACHE = 'dl_team_v1', CUR = 'dl_team_cur', QUEUE = 'dl_runs_queue', STALE = 10 * 60 * 1000;
  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function token() {
    var keys = ['dl_pitch', 'dl_game2'];
    for (var i = 0; i < keys.length; i++) { var a = get(keys[i]); if (a && a.token) return a.token; }
    var ap = get('dl_athlete_v1'); return ap && ap.account && ap.account.token ? ap.account.token : '';
  }
  function api(path, body) {
    var t = token();
    if (!t) return Promise.reject(Object.assign(new Error('Sign in first'), { status: 401 }));
    var opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ token: t }, body)) } : {};
    var u = '/api/' + path + (body ? '' : (path.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(t));
    return fetch(u, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw Object.assign(new Error(j.error || 'Something broke. Try again.'), { status: r.status });
        return j;
      });
    });
  }
  function cached() { return get(CACHE); }
  var inflight = null;
  function refresh() {
    if (inflight) return inflight;
    inflight = api('team/roster').then(function (j) {
      var c = { teams: j.teams || [], players: j.players || [], role: j.account && j.account.role, at: Date.now() };
      put(CACHE, c); inflight = null; return c;
    }).catch(function (e) { inflight = null; var c = cached(); if (c && e.status !== 401) return c; throw e; });
    return inflight;
  }
  function current() {
    var c = cached(); if (!c || !c.teams || !c.teams.length) return null;
    var id = get(CUR);
    for (var i = 0; i < c.teams.length; i++) if (c.teams[i].id === id) return c.teams[i];
    return c.teams[0];
  }
  function setCurrent(id) { put(CUR, id); }
  function players(teamId) {
    var c = cached(); if (!c) return [];
    var t = teamId || (current() && current().id);
    return (c.players || []).filter(function (p) { return p.kind === 'player' && p.team_id === t; });
  }

  /* ---- run save queue ---- */
  function pending() { return get(QUEUE) || []; }
  function setPending(q) { put(QUEUE, q); }
  function queueRun(run) { var q = pending(); q.push({ op: 'add', run: run }); setPending(q); return flush(); }
  function queueRemove(id) {
    var q = pending(), had = false;
    q = q.filter(function (x) { if (x.op === 'add' && x.run.id === id) { had = true; return false; } return true; });
    if (!had) q.push({ op: 'del', id: id });
    setPending(q); return flush();
  }
  var flushing = null;
  function flush() {
    if (flushing) return flushing.then(function () { return pending().length ? flush() : { ok: true }; });
    var q = pending();
    if (!q.length) return Promise.resolve({ ok: true, rejected: [] });
    if (!token()) return Promise.resolve({ ok: false, offline: false, rejected: [] });
    if (navigator.onLine === false) return Promise.resolve({ ok: false, offline: true, rejected: [] });
    var add = q.filter(function (x) { return x.op === 'add'; }).map(function (x) { return x.run; });
    var remove = q.filter(function (x) { return x.op === 'del'; }).map(function (x) { return x.id; });
    flushing = api('team/runs', { add: add, remove: remove }).then(function (j) {
      var done = {};
      (j.saved || []).forEach(function (id) { done['a' + id] = 1; });
      (j.rejected || []).forEach(function (r) { done['a' + r.id] = 1; });
      (j.removed || []).forEach(function (id) { done['d' + id] = 1; });
      setPending(pending().filter(function (x) { return !(x.op === 'add' ? done['a' + x.run.id] : done['d' + x.id]); }));
      flushing = null;
      var res = { ok: true, rejected: j.rejected || [] };
      try { window.dispatchEvent(new CustomEvent('dlteam:synced', { detail: res })); } catch (e) {}
      return res;
    }).catch(function (e) { flushing = null; return { ok: false, offline: !e.status, error: e.message, rejected: [] }; });
    return flushing;
  }
  window.addEventListener('online', function () { flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') flush(); });

  window.DLTeam = { cached: cached, refresh: refresh, current: current, setCurrent: setCurrent, players: players, api: api,
    token: token, queueRun: queueRun, queueRemove: queueRemove, flush: flush, pending: pending };

  /* Keep the roster fresh on every page and send anything left in the queue. */
  if (token()) {
    var c = cached();
    if (c && Date.now() - (c.at || 0) > STALE) refresh().catch(function () {});
    if (pending().length) flush();
  }
})();
