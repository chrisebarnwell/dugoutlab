/* Hit Window Arena: team battles, tournaments, and hitter stats.
   Game state is a config plus a log of balls. Everything else (score, who is up,
   brackets, box scores) is replayed from that log, so Undo and resume are exact. */
(function (root) {
  var PTS = { mid: 30, lg: 20, rg: 20, ll: 10, rl: 10, miss: 0 };
  var ZN = { mid: 'Middle', lg: 'Left gap', rg: 'Right gap', ll: 'Left line', rl: 'Right line', miss: 'Miss' };
  var CN = { ld: 'Liner', gb: 'Grounder', fb: 'Fly ball', pu: 'Pop up' };

  function ballPts(b, streak) {
    var p = PTS[b.zone] || 0;
    if (b.call && b.call === b.zone && b.zone !== 'miss') p *= 2;
    if (b.zone !== 'miss' && streak >= 3) p += 10;
    return p;
  }
  function blankStat(name, team) { return { name: name, team: team, pts: 0, balls: 0, hits: 0, calls: 0, called: 0, ld: 0, contacts: 0, zones: { ll: 0, lg: 0, mid: 0, rg: 0, rl: 0, miss: 0 } }; }
  function addStat(st, b, pts) {
    st.pts += pts; st.balls++; st.zones[b.zone] = (st.zones[b.zone] || 0) + 1;
    if (b.zone !== 'miss') { st.hits++; if (b.contact) { st.contacts++; if (b.contact === 'ld') st.ld++; } }
    if (b.call) { st.calls++; if (b.call === b.zone) st.called++; }
  }

  /* ---------- Team Battle ---------- */
  function battleReplay(cfg, log) {
    var T = cfg.teams, per = cfg.per, s = {
      inn: 1, half: 0, idx: 0, ab: [], abPts: 0, streak: 0, maxInn: cfg.innings, over: false, extra: false,
      line: [[], []], total: [0, 0], stats: {}, last: null
    };
    function ensureInn(n) { for (var t = 0; t < 2; t++) while (s.line[t].length < n) s.line[t].push(null); }
    ensureInn(s.maxInn);
    T.forEach(function (tm, t) { tm.players.forEach(function (p, i) { s.stats[t + ':' + i] = blankStat(p, t); }); });
    for (var k = 0; k < log.length && !s.over; k++) {
      var b = log[k], t = s.half, i = s.idx;
      if (b.zone !== 'miss') s.streak++; else s.streak = 0;
      var pts = ballPts(b, s.streak);
      if (s.line[t][s.inn - 1] === null) s.line[t][s.inn - 1] = 0;
      s.line[t][s.inn - 1] += pts; s.total[t] += pts;
      addStat(s.stats[t + ':' + i], b, pts);
      s.ab.push(b); s.abPts += pts;
      s.last = { pts: pts, streak: s.streak, ball: b, t: t, i: i };
      if (s.ab.length >= per) {
        s.ab = []; s.abPts = 0; s.streak = 0; s.idx++;
        if (s.idx >= T[t].players.length) {
          s.idx = 0;
          if (s.half === 0) s.half = 1;
          else {
            s.half = 0;
            if (s.inn >= s.maxInn) {
              if (s.total[0] !== s.total[1] || s.extra) s.over = true;
              else { s.extra = true; s.maxInn++; ensureInn(s.maxInn); }
            }
            if (!s.over) s.inn++;
          }
        }
      }
    }
    if (s.line[s.half][s.inn - 1] === null && !s.over) s.line[s.half][s.inn - 1] = 0;
    s.winner = s.over ? (s.total[0] === s.total[1] ? -1 : (s.total[0] > s.total[1] ? 0 : 1)) : null;
    s.up = s.over ? null : { t: s.half, i: s.idx, name: T[s.half].players[s.idx] };
    var ni = s.idx + 1, nt = s.half;
    if (ni >= T[nt].players.length) { ni = 0; nt = 1 - nt; }
    s.deck = s.over ? null : { t: nt, name: T[nt].players[ni] };
    return s;
  }

  /* ---------- Tournament ---------- */
  function seedOrder(size) { var o = [1]; while (o.length < size) { var m = o.length * 2; o = [].concat.apply([], o.map(function (x) { return [x, m + 1 - x]; })); } return o; }
  function matchReplay(per, log) {
    var r = { a: { pts: 0, n: 0, streak: 0 }, b: { pts: 0, n: 0, streak: 0 }, done: false, winner: null, sd: false, last: null };
    for (var k = 0; k < log.length && !r.done; k++) {
      var side = k % 2 === 0 ? 'a' : 'b', S = r[side], b = log[k];
      if (b.zone !== 'miss') S.streak++; else S.streak = 0;
      var pts = ballPts(b, S.streak);
      S.pts += pts; S.n++;
      r.last = { side: side, pts: pts, streak: S.streak, ball: b };
      if (side === 'b' && r.b.n >= per && r.a.pts !== r.b.pts) { r.done = true; r.winner = r.a.pts > r.b.pts ? 'a' : 'b'; }
    }
    r.sd = r.a.n >= per && r.b.n >= per && !r.done || r.a.n > per;
    r.next = r.done ? null : (log.length % 2 === 0 ? 'a' : 'b');
    return r;
  }
  function roundName(r, total) {
    var left = total - r;
    return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : 'Round ' + (r + 1);
  }
  function bracketReplay(cfg, logs) {
    var n = cfg.players.length, size = 2; while (size < n) size *= 2;
    var order = seedOrder(size), R = Math.log(size) / Math.LN2, rounds = [], stats = {};
    cfg.players.forEach(function (p, i) { stats[i] = blankStat(p, 0); });
    var prev = order.map(function (seed) { return seed <= n ? seed - 1 : null; });
    var nextMatch = null;
    for (var r = 0; r < R; r++) {
      var ms = [], winners = [];
      for (var m = 0; m < prev.length / 2; m++) {
        var a = prev[2 * m], b = prev[2 * m + 1], key = r + '-' + m;
        var mt = { key: key, r: r, m: m, a: a, b: b, winner: undefined, res: null, bye: false };
        if (a === undefined || b === undefined) mt.winner = undefined;
        else if (a === null && b === null) mt.winner = null;
        else if (a === null || b === null) { mt.bye = true; mt.winner = a === null ? b : a; }
        else {
          var log = logs[key] || [];
          mt.res = matchReplay(cfg.per, log);
          for (var k = 0; k < log.length; k++) {
            var side = k % 2 === 0 ? a : b, rr = matchReplay(cfg.per, log.slice(0, k + 1));
            addStat(stats[side], log[k], rr.last.pts);
          }
          if (mt.res.done) mt.winner = mt.res.winner === 'a' ? a : b;
          else if (!nextMatch) nextMatch = mt;
        }
        ms.push(mt); winners.push(mt.winner);
      }
      rounds.push(ms); prev = winners;
    }
    var fin = rounds[R - 1][0];
    return { rounds: rounds, R: R, size: size, next: nextMatch, over: fin.winner !== undefined && fin.winner !== null, champ: fin.winner, final: fin, stats: stats };
  }

  root.ArenaCore = { PTS: PTS, ZN: ZN, CN: CN, battleReplay: battleReplay, bracketReplay: bracketReplay, matchReplay: matchReplay, seedOrder: seedOrder, roundName: roundName };
  if (typeof document === 'undefined') return;

  /* ======================= UI ======================= */
  var API = '/api/';
  function $(id) { return document.getElementById(id); }
  function all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var AUTH = { token: null, account: null, player: null };
  try { var g = JSON.parse(localStorage.getItem('dl_game2') || 'null'); if (g && g.token) AUTH = g; } catch (e) {}
  function api(path, body) {
    var u = API + path, opt = { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } };
    if (body) { body.token = AUTH.token; opt.body = JSON.stringify(body); }
    else if (AUTH.token) u += (u.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(AUTH.token);
    return fetch(u, opt).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something broke'); return j; }); });
  }
  var SCREENS = ['s-pick', 's-bset', 's-kset', 's-kview', 's-play', 's-done', 's-stats', 's-view'];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    $('resume').classList.toggle('hidden', !(id === 's-pick' && LIVE));
    window.scrollTo({ top: Math.max(0, $('topbar').getBoundingClientRect().top + window.pageYOffset - 70), behavior: 'smooth' });
  }
  function pop(big, small) {
    var p = $('pop'); p.innerHTML = esc(big) + (small ? '<small>' + esc(small) + '</small>' : ''); p.classList.add('show');
    clearTimeout(pop.t); pop.t = setTimeout(function () { p.classList.remove('show'); }, 850);
  }
  function share(title, text, url) {
    var full = text + (url ? ' ' + url : '');
    if (navigator.share) return navigator.share({ title: title, text: text, url: url || undefined }).then(function () { return 'Sent.'; }).catch(function () { return ''; });
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(full).then(function () { return 'Copied. Paste it anywhere.'; }).catch(function () { return full; });
    return Promise.resolve(full);
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }

  /* topbar */
  if (AUTH.token && AUTH.account) {
    $('tb-who').innerHTML = 'Signed in as <b>' + esc(AUTH.account.name) + '</b>. Games save.';
    $('tb-link').textContent = 'Account'; $('tb-link').href = 'game.html';
  }

  /* ---------- live game storage ---------- */
  var LIVE = null;
  try { LIVE = JSON.parse(localStorage.getItem('dl_arena_live') || 'null'); } catch (e) {}
  function keep() { try { if (LIVE) localStorage.setItem('dl_arena_live', JSON.stringify(LIVE)); else localStorage.removeItem('dl_arena_live'); } catch (e) {} }
  var syncT = null;
  function sync(now) {
    if (!AUTH.token || !LIVE) return Promise.resolve();
    clearTimeout(syncT);
    var L = LIVE;
    function go() {
      var st = L.kind === 'battle' ? battleReplay(L.cfg, L.log) : bracketReplay(L.cfg, L.logs);
      var winner = '';
      if (L.kind === 'battle' && st.over) winner = st.winner < 0 ? 'Tie' : L.cfg.teams[st.winner].name;
      if (L.kind === 'bracket' && st.over) winner = L.cfg.players[st.champ];
      var body = { id: L.eventId || undefined, type: L.kind, name: L.cfg.name, status: st.over ? 'done' : 'live', winner: winner, data: { cfg: L.cfg, log: L.log, logs: L.logs } };
      return api('event', body).then(function (j) { if (!L.eventId) { L.eventId = j.event.id; if (LIVE === L) keep(); } return j; }).catch(function () {});
    }
    if (now) return go();
    syncT = setTimeout(go, 1500);
    return Promise.resolve();
  }
  function eventUrl(id) { return location.origin + location.pathname + '?e=' + id; }

  /* ---------- my hitters (quick-add chips) ---------- */
  var MINE = null;
  function loadMine() {
    if (MINE || !AUTH.token) return Promise.resolve(MINE || []);
    return api('me').then(function (j) { MINE = j.hitters || []; return MINE; }).catch(function () { MINE = []; return MINE; });
  }

  /* ---------- seg helper ---------- */
  function seg(el, vals, cur, fmt, onPick) {
    el.innerHTML = vals.map(function (v) { return '<button type="button" data-v="' + v + '"' + (v === cur ? ' class="on"' : '') + '>' + (fmt ? fmt(v) : v) + '</button>'; }).join('');
    all('button', el).forEach(function (b) { b.addEventListener('click', function () { all('button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); onPick(isNaN(+b.getAttribute('data-v')) ? b.getAttribute('data-v') : +b.getAttribute('data-v')); }); });
  }
  function rosterUI(listEl, inEl, addEl, arr, onChange) {
    function draw() {
      listEl.innerHTML = arr.map(function (p, i) { return '<li><span><span class="n">' + (i + 1) + '</span>' + esc(p) + '</span><button type="button" data-i="' + i + '" aria-label="Remove">&times;</button></li>'; }).join('');
      all('button', listEl).forEach(function (b) { b.addEventListener('click', function () { arr.splice(+b.getAttribute('data-i'), 1); draw(); onChange(); }); });
      onChange();
    }
    function add() {
      var v = inEl.value.replace(/[<>]/g, '').trim().slice(0, 24);
      if (v.length < 1) return;
      arr.push(v); inEl.value = ''; inEl.focus(); draw();
    }
    addEl.addEventListener('click', add);
    inEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    draw();
    return { draw: draw, add: function (v) { arr.push(v); draw(); } };
  }

  /* ---------- Team Battle setup ---------- */
  var BS = { a: [], b: [], innings: 3, per: 3 };
  try { var bs = JSON.parse(localStorage.getItem('dl_arena_bset') || 'null'); if (bs) { BS = bs; $('ta-name').value = bs.an || 'Home'; $('tb-name').value = bs.bn || 'Away'; } } catch (e) {}
  function bEst() {
    var balls = (BS.a.length + BS.b.length) * BS.per * BS.innings;
    $('b-est').textContent = balls ? balls + ' swings total. About ' + Math.max(1, Math.round(balls * 12 / 60)) + ' minutes at a steady cage pace.' : '';
    try { localStorage.setItem('dl_arena_bset', JSON.stringify({ a: BS.a, b: BS.b, innings: BS.innings, per: BS.per, an: $('ta-name').value, bn: $('tb-name').value })); } catch (e) {}
  }
  var RA = rosterUI($('ta-list'), $('ta-in'), $('ta-add'), BS.a, bEst);
  var RB = rosterUI($('tb-list'), $('tb-in'), $('tb-add'), BS.b, bEst);
  seg($('b-inn'), [1, 2, 3, 4, 5, 6], BS.innings, null, function (v) { BS.innings = v; bEst(); });
  seg($('b-per'), [1, 2, 3, 4, 5], BS.per, null, function (v) { BS.per = v; bEst(); });
  $('b-split').addEventListener('click', function () {
    var pool = BS.a.concat(BS.b);
    if (pool.length < 2) { $('b-err').textContent = 'Add hitters to either team first, then split.'; return; }
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    BS.a.length = 0; BS.b.length = 0;
    pool.forEach(function (p, i) { (i % 2 ? BS.b : BS.a).push(p); });
    RA.draw(); RB.draw(); $('b-err').textContent = '';
  });
  function mineChips(el, onPick) {
    loadMine().then(function (h) {
      el.innerHTML = h.length ? h.map(function (x) { return '<button type="button" data-n="' + esc(x.nickname) + '">+ ' + esc(x.nickname) + '</button>'; }).join('') : '';
      all('button', el).forEach(function (b) { b.addEventListener('click', function () { onPick(b.getAttribute('data-n')); }); });
    });
  }
  $('b-go').addEventListener('click', function () {
    if (!BS.a.length || !BS.b.length) { $('b-err').textContent = 'Each team needs at least one hitter.'; return; }
    var cfg = { name: ($('ta-name').value.trim() || 'Home') + ' vs ' + ($('tb-name').value.trim() || 'Away'), innings: BS.innings, per: BS.per,
      teams: [{ name: $('ta-name').value.trim().slice(0, 24) || 'Home', players: BS.a.slice() }, { name: $('tb-name').value.trim().slice(0, 24) || 'Away', players: BS.b.slice() }] };
    LIVE = { kind: 'battle', cfg: cfg, log: [], started: Date.now() }; keep(); sync(true); P.reset(); play();
  });

  /* ---------- Tournament setup ---------- */
  var KS = { players: [], per: 5, seed: 'order' };
  try { var ks = JSON.parse(localStorage.getItem('dl_arena_kset') || 'null'); if (ks) { KS = ks; $('k-name').value = ks.name || 'Cage Classic'; } } catch (e) {}
  function kEst() {
    var n = KS.players.length;
    $('k-est').textContent = n >= 2 ? (n - 1) + ' matches. ' + (n < 4 ? 'Add ' + (4 - n) + ' more for a real bracket.' : '') : '';
    try { localStorage.setItem('dl_arena_kset', JSON.stringify({ players: KS.players, per: KS.per, seed: KS.seed, name: $('k-name').value })); } catch (e) {}
  }
  var RK = rosterUI($('k-list'), $('k-in'), $('k-add'), KS.players, kEst);
  seg($('k-per'), [3, 5, 10], KS.per, null, function (v) { KS.per = v; kEst(); });
  seg($('k-seed'), ['order', 'shuffle'], KS.seed, function (v) { return v === 'order' ? 'List order' : 'Shuffle'; }, function (v) { KS.seed = v; kEst(); });
  $('k-go').addEventListener('click', function () {
    if (KS.players.length < 2) { $('k-err').textContent = 'Add at least 2 hitters.'; return; }
    if (KS.players.length > 16) { $('k-err').textContent = 'Up to 16 hitters.'; return; }
    var ps = KS.players.slice();
    if (KS.seed === 'shuffle') for (var i = ps.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = ps[i]; ps[i] = ps[j]; ps[j] = t; }
    LIVE = { kind: 'bracket', cfg: { name: $('k-name').value.trim().slice(0, 40) || 'Tournament', per: KS.per, players: ps }, logs: {}, started: Date.now() };
    keep(); sync(true); bracketView();
  });

  /* ---------- bracket drawing (live and shared) ---------- */
  function bracketHtml(cfg, st) {
    return st.rounds.map(function (ms, r) {
      return '<div class="brk-col"><h4>' + roundName(r, st.R) + '</h4>' + ms.map(function (mt) {
        if (mt.a === null && mt.b === null) return '';
        function side(p, s) {
          if (p === undefined) return '<div class="tbd"><span>TBD</span><span></span></div>';
          if (p === null) return '<div class="tbd"><span>Bye</span><span></span></div>';
          var won = mt.winner === p && mt.winner !== undefined;
          return '<div' + (won ? ' class="w"' : '') + '><span>' + esc(cfg.players[p]) + '</span><span class="s">' + (mt.res && (mt.res[s].n || mt.res.done) ? mt.res[s].pts : '') + '</span></div>';
        }
        return '<div class="mt' + (st.next && st.next.key === mt.key ? ' next' : '') + '">' + side(mt.a, 'a') + side(mt.b, 'b') + '</div>';
      }).join('') + '</div>';
    }).join('');
  }
  function bracketView() {
    var st = bracketReplay(LIVE.cfg, LIVE.logs);
    if (st.over) return done();
    show('s-kview');
    $('kv-eb').textContent = LIVE.cfg.name;
    $('kv-h').textContent = st.next ? 'Up next: ' + LIVE.cfg.players[st.next.a] + ' vs ' + LIVE.cfg.players[st.next.b] : 'Bracket';
    $('kv-brk').innerHTML = bracketHtml(LIVE.cfg, st);
    $('kv-msg').textContent = '';
    $('kv-share').classList.toggle('hidden', !AUTH.token);
  }
  $('kv-next').addEventListener('click', function () { P.reset(); play(); });
  $('kv-quit').addEventListener('click', home);
  $('kv-share').addEventListener('click', function () {
    sync(true).then(function () {
      if (!LIVE.eventId) { $('kv-msg').textContent = 'Could not save yet. Check your signal.'; return; }
      share(LIVE.cfg.name, 'Follow the ' + LIVE.cfg.name + ' bracket live.', eventUrl(LIVE.eventId)).then(function (m) { $('kv-msg').textContent = m; });
    });
  });

  /* ---------- play pad ---------- */
  var P = { call: null, kind: 'ld', reset: function () { this.call = null; this.kind = 'ld'; } };
  function curLog() { return LIVE.kind === 'battle' ? LIVE.log : (LIVE.logs[bracketReplay(LIVE.cfg, LIVE.logs).next.key] = LIVE.logs[bracketReplay(LIVE.cfg, LIVE.logs).next.key] || []); }
  function dots(n, balls, per) {
    var d = ''; for (var i = 0; i < Math.max(per, balls.length + (n ? 1 : 0)); i++) d += '<span class="' + (balls[i] ? (balls[i].zone === 'miss' ? 'miss' : 'hit') : (i === balls.length ? 'now' : '')) + '"></span>';
    return d;
  }
  function lineHtml(cfg, st, live) {
    var n = st.line[0].length, h = '<table class="line"><tr><th></th>';
    for (var i = 1; i <= n; i++) h += '<th>' + i + '</th>';
    h += '<th class="r">R</th></tr>';
    for (var t = 0; t < 2; t++) {
      h += '<tr' + (live && st.up && st.up.t === t ? ' class="bat"' : '') + '><td class="tn">' + esc(cfg.teams[t].name) + '</td>';
      for (i = 0; i < n; i++) {
        var v = st.line[t][i], now = live && st.up && st.up.t === t && st.inn === i + 1;
        h += '<td' + (now ? ' class="now"' : '') + '>' + (v === null ? '' : v) + '</td>';
      }
      h += '<td class="r">' + st.total[t] + '</td></tr>';
    }
    return h + '</table>';
  }
  function play() {
    if (!LIVE) return home();
    show('s-play');
    drawPlay();
  }
  function drawPlay() {
    var cfg = LIVE.cfg;
    if (LIVE.kind === 'battle') {
      var st = battleReplay(cfg, LIVE.log);
      if (st.over) return done();
      $('p-head').innerHTML = lineHtml(cfg, st, true);
      $('p-sm').textContent = (st.half === 0 ? 'Top ' : 'Bottom ') + st.inn + (st.extra && st.inn > cfg.innings ? ', extra' : '') + ' · ' + cfg.teams[st.half].name;
      $('p-who').textContent = st.up.name;
      $('p-pts').textContent = st.abPts;
      $('p-dots').innerHTML = dots(1, st.ab, cfg.per);
      $('p-deck').innerHTML = st.deck ? 'On deck: <b>' + esc(st.deck.name) + '</b>' + (st.deck.t !== st.half ? ' (' + esc(cfg.teams[st.deck.t].name) + ')' : '') : '';
    } else {
      var bt = bracketReplay(cfg, LIVE.logs), mt = bt.next;
      if (!mt) return bracketView();
      var r = mt.res, nx = r.next, who = nx === 'a' ? mt.a : mt.b, me = r[nx];
      $('p-head').innerHTML = '<div class="vs"><div class="side' + (nx === 'a' ? ' turn' : '') + '"><b>' + esc(cfg.players[mt.a]) + '</b><i>' + r.a.pts + '</i><small>' + r.a.n + '/' + cfg.per + '</small></div><div class="x">VS</div><div class="side' + (nx === 'b' ? ' turn' : '') + '"><b>' + esc(cfg.players[mt.b]) + '</b><i>' + r.b.pts + '</i><small>' + r.b.n + '/' + cfg.per + '</small></div></div>';
      $('p-sm').textContent = roundName(mt.r, bt.R) + ' · ' + (r.sd ? 'Sudden death' : 'Ball ' + (me.n + 1) + ' of ' + cfg.per);
      $('p-who').textContent = cfg.players[who];
      $('p-pts').textContent = me.pts;
      var mine = (LIVE.logs[mt.key] || []).filter(function (b, k) { return (k % 2 === 0 ? 'a' : 'b') === nx; });
      $('p-dots').innerHTML = dots(1, mine.slice(0, cfg.per), cfg.per);
      $('p-deck').innerHTML = 'Then: <b>' + esc(cfg.players[nx === 'a' ? mt.b : mt.a]) + '</b>';
    }
    all('#p-calls button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-c') === P.call); });
    all('.zone').forEach(function (z) { z.classList.toggle('called', z.getAttribute('data-z') === P.call); });
    all('#p-kind button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === P.kind); });
  }
  function record(zone) {
    if (!LIVE) return;
    var mt0 = LIVE.kind === 'bracket' ? bracketReplay(LIVE.cfg, LIVE.logs).next : null;
    var log = curLog(), ball = { zone: zone };
    if (P.call) ball.call = P.call;
    if (zone !== 'miss') ball.contact = P.kind;
    log.push(ball);
    var last;
    if (LIVE.kind === 'battle') last = battleReplay(LIVE.cfg, LIVE.log).last;
    else { var res = matchReplay(LIVE.cfg.per, log); last = res.last; }
    var tag = ZN[zone];
    if (ball.call && ball.call === zone && zone !== 'miss') tag = 'CALLED IT';
    if (last.streak >= 3 && zone !== 'miss') tag += ' · streak ' + last.streak;
    pop(zone === 'miss' ? 'MISS' : '+' + last.pts, tag);
    P.reset(); keep();
    if (LIVE.kind === 'battle') {
      var st = battleReplay(LIVE.cfg, LIVE.log);
      if (st.ab.length === 0 || st.over) sync(st.over);
      if (st.over) return setTimeout(done, 700);
    } else if (res.done) {
      sync(true);
      var wn = LIVE.cfg.players[res.winner === 'a' ? mt0.a : mt0.b];
      return setTimeout(function () { var bt = bracketReplay(LIVE.cfg, LIVE.logs); if (bt.over) done(); else { bracketView(); $('kv-msg').textContent = wn + ' wins ' + Math.max(res.a.pts, res.b.pts) + ' to ' + Math.min(res.a.pts, res.b.pts) + ' and moves on.'; } }, 750);
    }
    drawPlay();
  }
  all('.zone').forEach(function (z) { z.addEventListener('click', function () { record(z.getAttribute('data-z')); }); });
  document.querySelector('.misc [data-z=miss]').addEventListener('click', function () { record('miss'); });
  all('#p-calls button').forEach(function (b) { b.addEventListener('click', function () { var c = b.getAttribute('data-c'); P.call = P.call === c ? null : c; drawPlay(); if (P.call) pop(ZN[c].toUpperCase(), 'called'); }); });
  all('#p-kind button').forEach(function (b) { b.addEventListener('click', function () { P.kind = b.getAttribute('data-k'); drawPlay(); }); });
  $('p-undo').addEventListener('click', function () {
    if (P.call) { P.call = null; return drawPlay(); }
    var log = curLog();
    if (log.length) { log.pop(); keep(); sync(); }
    drawPlay();
  });
  $('p-pause').addEventListener('click', function () { keep(); sync(true); home(); });

  /* ---------- results ---------- */
  function boxHtml(stats, cols) {
    var rows = Object.keys(stats).map(function (k) { return stats[k]; }).filter(function (s) { return s.balls; }).sort(function (a, b) { return b.pts - a.pts; });
    var top = rows.length ? rows[0].pts : -1;
    return '<table class="box"><tr><th>Hitter</th>' + (cols ? '<th>Team</th>' : '') + '<th>Pts</th><th>Hits</th><th>Called</th><th>Liner</th></tr>' + rows.map(function (s) {
      return '<tr' + (s.pts === top && top > 0 ? ' class="mvp"' : '') + '><td>' + esc(s.name) + '</td>' + (cols ? '<td>' + esc(cols[s.team]) + '</td>' : '') + '<td>' + s.pts + '</td><td>' + s.hits + '/' + s.balls + '</td><td>' + s.called + '/' + s.calls + '</td><td>' + pct(s.ld, s.contacts) + '%</td></tr>';
    }).join('') + '</table>';
  }
  function resultInto(kind, cfg, data, els) {
    if (kind === 'battle') {
      var st = battleReplay(cfg, data.log || []);
      els.crown.textContent = st.over ? (st.extra ? 'Final, extra innings' : 'Final') : 'In progress, ' + (st.half === 0 ? 'top ' : 'bottom ') + st.inn;
      els.nm.textContent = st.over ? (st.winner < 0 ? 'Tie game' : cfg.teams[st.winner].name + ' win') : cfg.teams[0].name + ' ' + st.total[0] + ', ' + cfg.teams[1].name + ' ' + st.total[1];
      els.sub.textContent = st.over ? cfg.teams[0].name + ' ' + st.total[0] + ', ' + cfg.teams[1].name + ' ' + st.total[1] : '';
      els.body.innerHTML = lineHtml(cfg, st, false) + boxHtml(st.stats, [cfg.teams[0].name, cfg.teams[1].name]);
      return st;
    }
    var bt = bracketReplay(cfg, data.logs || {});
    els.crown.textContent = bt.over ? 'Champion' : 'In progress';
    els.nm.textContent = bt.over ? cfg.players[bt.champ] : (bt.next ? cfg.players[bt.next.a] + ' vs ' + cfg.players[bt.next.b] + ' up next' : '');
    var f = bt.final.res;
    els.sub.textContent = bt.over && f ? 'Won the final, ' + Math.max(f.a.pts, f.b.pts) + ' to ' + Math.min(f.a.pts, f.b.pts) + (f.sd ? ' in sudden death' : '') + '.' : '';
    els.body.innerHTML = '<div class="brk" style="margin-bottom:0.9rem">' + bracketHtml(cfg, bt) + '</div>' + boxHtml(bt.stats);
    return bt;
  }
  function done() {
    show('s-done');
    resultInto(LIVE.kind, LIVE.cfg, LIVE, { crown: $('d-crown'), nm: $('d-nm'), sub: $('d-sub'), body: $('d-body') });
    $('d-msg').textContent = AUTH.token ? 'Saved.' : 'Sign in on Call Your Shot to save games and share result links.';
    sync(true);
  }
  $('d-again').addEventListener('click', function () {
    if (!LIVE) return home();
    LIVE = LIVE.kind === 'battle' ? { kind: 'battle', cfg: LIVE.cfg, log: [], started: Date.now() } : { kind: 'bracket', cfg: LIVE.cfg, logs: {}, started: Date.now() };
    keep(); sync(true); P.reset();
    if (LIVE.kind === 'battle') play(); else bracketView();
  });
  $('d-home').addEventListener('click', function () { LIVE = null; keep(); home(); });
  $('d-share').addEventListener('click', function () {
    var L = LIVE; if (!L) return;
    var txt = $('d-crown').textContent + ': ' + $('d-nm').textContent + '. ' + $('d-sub').textContent;
    sync(true).then(function () { return share('Hit Window Arena', txt, L.eventId ? eventUrl(L.eventId) : location.origin + '/arena.html'); }).then(function (m) { $('d-msg').textContent = m; });
  });

  /* ---------- home + history ---------- */
  function home() {
    if (location.hash) history.replaceState(null, '', location.pathname);
    show('s-pick');
    if (LIVE) {
      var st = LIVE.kind === 'battle' ? battleReplay(LIVE.cfg, LIVE.log) : bracketReplay(LIVE.cfg, LIVE.logs);
      $('resume-h').textContent = LIVE.cfg.name + (st.over ? ', final' : '');
    }
    if (!AUTH.token) return;
    api('events').then(function (j) {
      var rows = j.rows || [];
      $('hist-card').classList.toggle('hidden', !rows.length);
      $('hist').innerHTML = rows.map(function (e) {
        return '<li><div><b>' + esc(e.name) + '</b><br><span style="font-size:0.78rem">' + (e.type === 'battle' ? 'Team Battle' : 'Tournament') + ' · ' + (e.status === 'done' ? (e.winner ? esc(e.winner) + ' won' : 'Final') : 'Live') + ' · ' + new Date(e.updated).toLocaleDateString() + '</span></div><a href="?e=' + esc(e.id) + '">Open</a></li>';
      }).join('');
    }).catch(function () {});
  }
  $('resume-go').addEventListener('click', function () { P.reset(); if (LIVE.kind === 'bracket') bracketView(); else play(); });
  $('resume-drop').addEventListener('click', function () { if (confirm('End this game? It stays in your history if it was saved.')) { sync(true); LIVE = null; keep(); home(); } });
  function go(where) {
    if (where === 'battle') { show('s-bset'); RA.draw(); RB.draw(); mineChips($('b-mine'), function (n) { (BS.a.length <= BS.b.length ? RA : RB).add(n); }); }
    else if (where === 'bracket') { show('s-kset'); RK.draw(); mineChips($('k-mine'), function (n) { RK.add(n); }); }
    else if (where === 'stats') stats();
    else home();
  }
  all('[data-go]').forEach(function (b) { b.addEventListener('click', function () { history.replaceState(null, '', '#' + b.getAttribute('data-go')); go(b.getAttribute('data-go')); }); });
  all('[data-back]').forEach(function (b) { b.addEventListener('click', home); });

  /* ---------- stats ---------- */
  var COL = { ld: '#C8862E', gb: '#7ad6a8', fb: '#9dc5e0', pu: '#b9b2a4' };
  function sprayCard(z, total) {
    var cx = 160, cy = 204, R = 158, wedges = [['ll', -45, -30], ['lg', -30, -10], ['mid', -10, 10], ['rg', 10, 30], ['rl', 30, 45]];
    var hits = total - z.miss, max = 1;
    wedges.forEach(function (w) { max = Math.max(max, z[w[0]]); });
    function pt(a, r) { var t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
    var svg = '<svg viewBox="0 0 320 214" role="img" aria-label="Spray chart" style="max-width:420px;margin:0 auto">';
    wedges.forEach(function (w) {
      var p1 = pt(w[1], R), p2 = pt(w[2], R), op = z[w[0]] ? 0.15 + 0.8 * z[w[0]] / max : 0.05, lp = pt((w[1] + w[2]) / 2, R * 0.66), share = pct(z[w[0]], hits);
      svg += '<path d="M' + cx + ' ' + cy + ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + ' Z" fill="#C8862E" fill-opacity="' + op.toFixed(2) + '" stroke="#0a1610" stroke-width="2"/>';
      svg += '<text x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#f4efe6">' + share + '%</text>';
      var lq = pt((w[1] + w[2]) / 2, R + 13);
      svg += '<text x="' + lq[0].toFixed(1) + '" y="' + lq[1].toFixed(1) + '" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="rgba(244,239,230,0.75)">' + ({ ll: 'L line', lg: 'L gap', mid: 'Middle', rg: 'R gap', rl: 'R line' })[w[0]] + '</text>';
    });
    svg += '<rect x="' + (cx - 6) + '" y="' + (cy - 6) + '" width="12" height="12" transform="rotate(45 ' + cx + ' ' + cy + ')" fill="#f4efe6"/></svg>';
    return svg;
  }
  function trendSvg(rs) {
    var pts = rs.slice(0, 20).reverse(), W = 320, H = 120, pad = 14, max = 10;
    pts.forEach(function (r) { max = Math.max(max, r.score); });
    var best = 0; pts.forEach(function (r) { best = Math.max(best, r.score); });
    function x(i) { return pts.length < 2 ? W / 2 : pad + i * (W - 2 * pad) / (pts.length - 1); }
    function y(v) { return H - pad - v * (H - 2 * pad) / max; }
    var line = pts.map(function (r, i) { return x(i).toFixed(1) + ',' + y(r.score).toFixed(1); }).join(' ');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score trend">';
    svg += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(best).toFixed(1) + '" y2="' + y(best).toFixed(1) + '" stroke="rgba(244,239,230,0.25)" stroke-dasharray="4 4"/>';
    svg += '<text x="' + (W - pad) + '" y="' + (y(best) - 4).toFixed(1) + '" text-anchor="end" font-family="Inter, sans-serif" font-size="9" fill="rgba(244,239,230,0.55)">best ' + best + '</text>';
    svg += '<polyline points="' + line + '" fill="none" stroke="#C8862E" stroke-width="2.5" stroke-linejoin="round"/>';
    pts.forEach(function (r, i) { svg += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.score).toFixed(1) + '" r="' + (i === pts.length - 1 ? 5 : 3) + '" fill="' + (i === pts.length - 1 ? '#e2a85a' : '#C8862E') + '"/>'; });
    return svg + '</svg>';
  }
  function statsFor(h) {
    $('st-h').textContent = h.nickname || h.name;
    $('st-msg').textContent = 'Loading…';
    api('stats?hitter=' + encodeURIComponent(h.id)).then(function (j) {
      var rs = j.rounds || [];
      if (!rs.length) { $('st-body').innerHTML = '<p class="a-p">No rounds yet. Play one on Call Your Shot and this fills in.</p>'; return; }
      var z = { ll: 0, lg: 0, mid: 0, rg: 0, rl: 0, miss: 0 }, mix = { ld: 0, gb: 0, fb: 0, pu: 0 }, total = 0, calls = 0, called = 0, src = {}, bestStreak = 0, mostCalled = 0, sum = 0, best = 0;
      rs.forEach(function (r) {
        sum += r.score; best = Math.max(best, r.score); bestStreak = Math.max(bestStreak, r.best_streak); mostCalled = Math.max(mostCalled, r.called);
        var k = r.source || 'unset'; src[k] = src[k] || { n: 0, sum: 0 }; src[k].n++; src[k].sum += r.score;
        (r.balls || []).forEach(function (b) {
          total++; z[b.zone] = (z[b.zone] || 0) + 1;
          if (b.contact && mix[b.contact] !== undefined) mix[b.contact]++;
          if (b.call) { calls++; if (b.call === b.zone) called++; }
        });
      });
      var avg = Math.round(sum / rs.length), l5 = rs.slice(0, 5), p5 = rs.slice(5, 10);
      var a5 = l5.reduce(function (s, r) { return s + r.score; }, 0) / l5.length, b5 = p5.length ? p5.reduce(function (s, r) { return s + r.score; }, 0) / p5.length : null;
      var delta = b5 === null ? null : Math.round(a5 - b5);
      var hits = total - z.miss, mixN = mix.ld + mix.gb + mix.fb + mix.pu;
      var topZone = ['ll', 'lg', 'mid', 'rg', 'rl'].sort(function (a, b) { return z[b] - z[a]; })[0];
      var h2 = '<div class="tiles">' +
        '<div class="tile"><b>' + best + '</b><i>Best round</i>' + (j.level_best ? '<em class="dn">level best ' + j.level_best + '</em>' : '') + '</div>' +
        '<div class="tile"><b>' + Math.round(a5) + '</b><i>Last 5 avg</i>' + (delta === null ? '' : '<em' + (delta < 0 ? ' class="dn"' : '') + '>' + (delta >= 0 ? 'up ' + delta : 'down ' + (-delta)) + '</em>') + '</div>' +
        '<div class="tile"><b>' + pct(hits, total) + '%</b><i>Hit a target</i></div>' +
        '<div class="tile"><b>' + pct(called, calls) + '%</b><i>Called shots</i><em class="dn">' + called + ' of ' + calls + '</em></div>' +
        '<div class="tile"><b>' + rs.length + '</b><i>Rounds</i></div>' +
        '<div class="tile"><b>' + avg + '</b><i>Career avg</i></div>' +
        '<div class="tile"><b>' + bestStreak + '</b><i>Best streak</i></div>' +
        '<div class="tile"><b>' + total + '</b><i>Swings logged</i></div></div>';
      h2 += '<div class="viz"><h3>Spray chart</h3><p class="k">Where hits landed. Most: ' + ZN[topZone] + '. Missed the targets ' + pct(z.miss, total) + '% of swings.</p>' + sprayCard(z, total) + '</div>';
      h2 += '<div class="viz"><h3>Score trend</h3><p class="k">Last ' + Math.min(20, rs.length) + ' rounds, oldest to newest.</p>' + trendSvg(rs) + '</div>';
      if (mixN) {
        h2 += '<div class="viz"><h3>Contact mix</h3><p class="k">' + mixN + ' hits tagged. Line drives: ' + pct(mix.ld, mixN) + '%.</p><div class="mix">' + ['ld', 'gb', 'fb', 'pu'].map(function (k) { var p = pct(mix[k], mixN); return p ? '<span style="width:' + p + '%;background:' + COL[k] + '">' + (p >= 9 ? p + '%' : '') + '</span>' : ''; }).join('') + '</div><div class="legend">' + ['ld', 'gb', 'fb', 'pu'].map(function (k) { return '<span><i style="background:' + COL[k] + '"></i>' + CN[k] + ' ' + mix[k] + '</span>'; }).join('') + '</div></div>';
      }
      var sk = Object.keys(src), smax = 1;
      sk.forEach(function (k) { smax = Math.max(smax, src[k].sum / src[k].n); });
      h2 += '<div class="viz"><h3>By pitch type</h3><p class="k">Average round score.</p><table class="srcs">' + sk.map(function (k) { var a = Math.round(src[k].sum / src[k].n); return '<tr><td>' + ({ tee: 'Tee', toss: 'Toss', machine: 'Machine', live: 'Live', unset: 'Not tagged' }[k] || k) + '</td><td class="bar"><span style="width:' + Math.round(100 * a / smax) + '%"></span></td><td class="v">' + a + ' · ' + src[k].n + 'x</td></tr>'; }).join('') + '</table></div>';
      h2 += '<p class="a-note">Most called shots hit in one round: ' + mostCalled + '. Stats count rounds from Call Your Shot. Team Battle and Tournament box scores live with each game.</p>';
      $('st-body').innerHTML = h2;
    }).catch(function (e) { $('st-body').innerHTML = '<p class="a-p">' + esc(e.message) + '</p>'; });
  }
  function stats() {
    show('s-stats');
    if (!AUTH.token) { $('st-h').textContent = 'Sign in to see stats'; $('st-pick').innerHTML = ''; $('st-body').innerHTML = '<p class="a-p">Stats come from saved rounds. <a href="game.html">Sign in on Call Your Shot</a>, add a hitter, and play.</p>'; return; }
    $('st-body').innerHTML = '<p class="a-p" id="st-msg">Loading…</p>';
    loadMine().then(function (hs) {
      if (!hs.length) { $('st-h').textContent = 'No hitters yet'; $('st-body').innerHTML = '<p class="a-p"><a href="game.html">Add a hitter</a> and play a round first.</p>'; return; }
      var cur = (AUTH.player && hs.filter(function (h) { return h.id === AUTH.player.id; })[0]) || hs[0];
      $('st-pick').innerHTML = hs.length > 1 ? hs.map(function (h) { return '<button type="button" data-id="' + esc(h.id) + '">' + esc(h.nickname) + '</button>'; }).join('') : '';
      all('#st-pick button').forEach(function (b) { b.addEventListener('click', function () { statsFor(hs.filter(function (h) { return h.id === b.getAttribute('data-id'); })[0]); }); });
      statsFor(cur);
    });
  }

  /* ---------- shared event link ---------- */
  function view(id) {
    show('s-view');
    $('v-h').textContent = 'Loading…';
    api('event?id=' + encodeURIComponent(id)).then(function (j) {
      var e = j.event, d = e.data || {};
      $('v-eb').textContent = (e.type === 'battle' ? 'Team Battle' : 'Tournament') + ' · ' + new Date(e.updated).toLocaleDateString();
      $('v-h').textContent = e.name;
      var box = document.createElement('div');
      box.innerHTML = '<div class="champ"><div class="crown"></div><div class="nm"></div><div class="sub"></div></div><div style="margin-top:1rem"></div>';
      $('v-body').innerHTML = ''; $('v-body').appendChild(box);
      resultInto(e.type, d.cfg, d, { crown: box.querySelector('.crown'), nm: box.querySelector('.nm'), sub: box.querySelector('.sub'), body: box.lastChild });
    }).catch(function (err) { $('v-h').textContent = err.message; });
  }

  /* ---------- boot ---------- */
  var eid = (/[?&]e=([a-z0-9]+)/i.exec(location.search) || [])[1];
  if (eid) view(eid);
  else go((location.hash || '').slice(1));
})(typeof window !== 'undefined' ? window : this);
