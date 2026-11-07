/* DugoutLab Lineup History: every game a coach saves from Compete Mode or Pod Rotation.

   Saved on this phone first (dl_lineups_v1). Signed in, each save also goes to the coach account
   (/api/team/lineups) so it follows the coach to any phone. Anything that fails waits and is sent again.

   LineupHistory.save(rec)      -> Promise of the saved record. rec = {
       tool: 'compete' | 'pods', date: 'YYYY-MM-DD', team, opp, title, innings,
       rows:    [{ name, bat (1-based, compete only), pod ('right'|'left', pods only), cells: ['P','SS','EH',...] }],
       players: [{ name, tier?, pod? }]   the roster that built it
       config:  {...}                     what the tool needs to put the exact lineup back on screen }
   LineupHistory.list()         -> records on this phone, newest game first
   LineupHistory.refresh()      -> Promise of the list, merged with the account (signed in)
   LineupHistory.get(id) / remove(id)
   LineupHistory.handoff(id, mode) + LineupHistory.takeHandoff()
       mode 'lineup' = put that game's card back on screen, 'roster' = load only its players.
   LineupHistory.stats(records) -> per kid: games, innings, position counts, off-field innings, batting spots
   LineupHistory.saveBar(el, getRecord)  -> date + opponent + Save button under a built lineup */
(function () {
  if (window.LineupHistory) return;
  var KEY = 'dl_lineups_v1', QUEUE = 'dl_lineups_queue', HAND = 'dl_lineup_handoff', MAX = 600;
  var OFF = { EH: 1, sit: 1, warm: 1, '': 1 };
  var POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];

  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function uid() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'lu';
    for (var i = 0; i < 16; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function today() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function token() { try { return window.DLTeam && DLTeam.token ? DLTeam.token() : ''; } catch (e) { return ''; } }
  function sortList(a) {
    return a.sort(function (x, y) { return x.date === y.date ? (y.savedAt || 0) - (x.savedAt || 0) : (x.date < y.date ? 1 : -1); });
  }
  function list() { return sortList((get(KEY) || []).slice()); }
  function setList(a) { put(KEY, sortList(a).slice(0, MAX)); }
  function find(id) { var a = get(KEY) || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }

  /* ---- account sync ---- */
  function pending() { return get(QUEUE) || []; }
  function api(body) {
    var t = token();
    if (!t) return Promise.reject(Object.assign(new Error('Sign in first'), { status: 401 }));
    var opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ token: t }, body)) } : {};
    return fetch('/api/team/lineups' + (body ? '' : '?token=' + encodeURIComponent(t)), opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw Object.assign(new Error(j.error || 'Something broke. Try again.'), { status: r.status });
        return j;
      });
    });
  }
  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    var q = pending();
    if (!q.length || !token() || navigator.onLine === false) return Promise.resolve({ ok: !q.length });
    var saveIds = {}, rm = [];
    q.forEach(function (x) { if (x.op === 'del') rm.push(x.id); else saveIds[x.id] = 1; });
    var save = Object.keys(saveIds).map(find).filter(Boolean);
    flushing = api({ save: save, remove: rm }).then(function (j) {
      var done = {};
      (j.saved || []).forEach(function (id) { done['s' + id] = 1; });
      (j.rejected || []).forEach(function (r) { done['s' + r.id] = 1; });
      (j.removed || []).forEach(function (id) { done['d' + id] = 1; });
      var a = get(KEY) || [];
      a.forEach(function (r) { if (done['s' + r.id] && (j.saved || []).indexOf(r.id) >= 0) r.synced = true; });
      setList(a);
      put(QUEUE, pending().filter(function (x) { return !done[(x.op === 'del' ? 'd' : 's') + x.id]; }));
      flushing = null;
      return { ok: true, rejected: j.rejected || [] };
    }).catch(function (e) { flushing = null; return { ok: false, error: e.message }; });
    return flushing;
  }
  function queue(op, id) {
    var q = pending().filter(function (x) { return x.id !== id; });
    q.push({ op: op, id: id }); put(QUEUE, q);
  }
  function refresh() {
    if (!token()) return Promise.resolve(list());
    return flush().then(function () { return api(); }).then(function (j) {
      var server = j.lineups || [], ids = {}, waiting = {};
      server.forEach(function (r) { ids[r.id] = 1; });
      pending().forEach(function (x) { if (x.op === 'del') waiting[x.id] = 1; });
      var local = (get(KEY) || []).filter(function (r) { return !ids[r.id] && !r.synced; });
      // Saved on this phone before signing in: send it up now.
      local.forEach(function (r) { queue('save', r.id); });
      setList(server.filter(function (r) { return !waiting[r.id]; }).concat(local));
      if (local.length) flush();
      return list();
    }).catch(function () { return list(); });
  }

  /* ---- records ---- */
  function save(rec) {
    rec = Object.assign({}, rec);
    rec.id = rec.id || uid();
    rec.date = /^\d{4}-\d{2}-\d{2}$/.test(rec.date || '') ? rec.date : today();
    rec.savedAt = rec.savedAt || Date.now();
    rec.synced = false;
    if (!rec.teamId) { try { var cur = window.DLTeam && DLTeam.current(); if (cur) rec.teamId = cur.id; } catch (e) {} }
    var a = (get(KEY) || []).filter(function (r) { return r.id !== rec.id; });
    a.push(rec);
    if (!put(KEY, sortList(a).slice(0, MAX))) return Promise.reject(new Error('This phone is out of space for saved games.'));
    if (token()) { queue('save', rec.id); flush(); }
    if (window.DL && DL.track) { try { DL.track('lineup_saved'); } catch (e) {} }
    return Promise.resolve(rec);
  }
  function remove(id) {
    setList((get(KEY) || []).filter(function (r) { return r.id !== id; }));
    if (token()) { queue('del', id); return flush(); }
    return Promise.resolve({ ok: true });
  }

  function handoff(id, mode) { put(HAND, { id: id, mode: mode || 'lineup', at: Date.now() }); }
  function takeHandoff() {
    var h = get(HAND); try { localStorage.removeItem(HAND); } catch (e) {}
    if (!h || Date.now() - (h.at || 0) > 10 * 60 * 1000) return null;
    var rec = find(h.id); return rec ? { mode: h.mode, rec: rec } : null;
  }

  /* ---- per kid totals ---- */
  function stats(records) {
    var kids = {}, order = [], posSeen = {};
    (records || []).forEach(function (r) {
      (r.rows || []).forEach(function (row) {
        var key = String(row.name || '').trim(); if (!key) return;
        var k = kids[key.toLowerCase()];
        if (!k) { k = kids[key.toLowerCase()] = { name: key, games: 0, innings: 0, off: 0, pos: {}, bat: {}, batGames: 0, batSum: 0, log: [] }; order.push(k); }
        k.games++;
        (row.cells || []).forEach(function (c) {
          k.innings++;
          if (OFF[c] || !c) { k.off++; return; }
          k.pos[c] = (k.pos[c] || 0) + 1; posSeen[c] = 1;
        });
        if (row.bat) { k.bat[row.bat] = (k.bat[row.bat] || 0) + 1; k.batGames++; k.batSum += row.bat; }
        k.log.push({ id: r.id, date: r.date, title: r.title, tool: r.tool, bat: row.bat || null, cells: row.cells || [] });
      });
    });
    var cols = POS_ORDER.filter(function (p) { return posSeen[p]; });
    Object.keys(posSeen).forEach(function (p) { if (cols.indexOf(p) < 0) cols.push(p); });
    order.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return { kids: order, cols: cols };
  }

  /* ---- save bar under a built lineup ---- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() {
    if (document.getElementById('lh-css')) return;
    var s = document.createElement('style'); s.id = 'lh-css';
    s.textContent = '.lh-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-end;margin-top:1rem;padding:.9rem 1rem;border:1px solid var(--rule);border-radius:10px;background:var(--forest2)}'
      + '.lh-bar .lh-h{flex:1 1 100%;font-family:var(--serif);font-weight:600;font-size:1.05rem;color:var(--ink)}'
      + '.lh-bar .lh-s{flex:1 1 100%;font-size:.84rem;color:var(--ink-soft);margin-top:-.25rem}'
      + '.lh-bar label{display:flex;flex-direction:column;gap:.2rem;font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}'
      + '.lh-bar input{min-height:44px;border:1px solid var(--rule);background:var(--forest-deep);color:var(--ink);border-radius:8px;padding:.5rem .7rem;font:inherit;font-size:.95rem;text-transform:none;letter-spacing:0}'
      + '.lh-bar .lh-opp{flex:1 1 160px}.lh-bar .lh-opp input{width:100%}'
      + '.lh-bar button{min-height:44px;padding:.55rem 1.2rem;border:none;border-radius:8px;background:var(--fill);color:var(--on-fill);font:inherit;font-weight:600;font-size:.95rem;cursor:pointer}'
      + '.lh-bar button:disabled{opacity:.55;cursor:default}'
      + '.lh-msg{flex:1 1 100%;font-size:.88rem;color:var(--ink-soft);min-height:1.2em}.lh-msg a{font-weight:600}'
      + '@media print{.lh-bar{display:none!important}}';
    document.head.appendChild(s);
  }
  function saveBar(el, getRecord, existing) {
    if (!el) return;
    css();
    var seed = existing || getRecord() || {};
    el.innerHTML = '<div class="lh-bar no-print">'
      + '<div class="lh-h">Save this game</div>'
      + '<div class="lh-s">Keeps the lineup by date and adds to each kid\'s totals: where they played and where they hit.</div>'
      + '<label>Game date<input type="date" class="lh-date" value="' + esc(seed.date || today()) + '"></label>'
      + '<label class="lh-opp">Opponent (optional)<input type="text" class="lh-o" maxlength="40" value="' + esc(seed.opp || '') + '" placeholder="e.g. Rays"></label>'
      + '<button type="button" class="lh-go">Save to history</button>'
      + '<div class="lh-msg" role="status"></div></div>';
    var btn = el.querySelector('.lh-go'), msg = el.querySelector('.lh-msg'), savedId = existing ? existing.id : null;
    if (existing) { btn.disabled = true; btn.textContent = 'Saved'; msg.innerHTML = 'Already in your history. Change the date or opponent to update it.'; }
    function dirty() { if (savedId) { btn.disabled = false; btn.textContent = 'Save changes'; } }
    el.querySelector('.lh-date').addEventListener('change', dirty);
    el.querySelector('.lh-o').addEventListener('input', dirty);
    btn.addEventListener('click', function () {
      var rec = getRecord();
      if (!rec || !rec.rows || !rec.rows.length) { msg.textContent = 'Build a lineup first.'; return; }
      rec.date = el.querySelector('.lh-date').value || today();
      rec.opp = el.querySelector('.lh-o').value.trim().slice(0, 40);
      if (savedId) { rec.id = savedId; var old = find(savedId); if (old) rec.savedAt = old.savedAt; }
      btn.disabled = true;
      save(rec).then(function (r) {
        savedId = r.id;
        btn.textContent = 'Saved';
        msg.innerHTML = 'Saved for ' + esc(fmtDate(r.date)) + '. <a href="lineups.html">See every kid\'s totals &rarr;</a>'
          + (token() ? '' : ' <span style="color:var(--ink-faint)">On this phone only. Sign in to My Team to keep it on every phone.</span>');
      }).catch(function (e) { btn.disabled = false; msg.textContent = e.message; });
    });
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return d || '';
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return DAY[dt.getDay()] + ' ' + MON[dt.getMonth()] + ' ' + dt.getDate() + ', ' + m[1];
  }

  window.addEventListener('online', function () { flush(); });
  window.LineupHistory = { save: save, list: list, refresh: refresh, get: find, remove: remove, flush: flush,
    handoff: handoff, takeHandoff: takeHandoff, stats: stats, saveBar: saveBar, fmtDate: fmtDate, today: today, esc: esc,
    isOff: function (c) { return !!OFF[c] || !c; } };
  if (token() && pending().length) flush();
})();
