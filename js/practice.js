/* DugoutLab: Practice in a Pinch
   PLAN -> RUN -> REFLECT -> REUSE, all on this phone.
   Storage (localStorage, never sent anywhere):
     dl_pp_prefs        { len, sport, age }            last answers
     dl_age             shared age group (site.js DL.getAge)
     dl_practices_v1    [ saved practice ]            newest first, max 30
     dl_pp_again        { drillId: count }            "do again" votes from reflections
   A saved practice: { id, title, created, len, sport, age, blocks: [{ key, min, ids: [] }], reflection }
   Share links carry the plan in ?p= so an assistant coach sees the same practice. */
(function () {
  /* Minutes per block by age, same shares as the Practice Framework at "Developing". Our judgment, not research numbers. */
  var BASE = {
    a46:   { label: 'ages 4-6',   lo: 4,  hi: 6,  arr: 15, sta: 26, fix: 4,  ssg: 45, clo: 10 },
    a79:   { label: 'ages 7-9',   lo: 7,  hi: 9,  arr: 12, sta: 32, fix: 8,  ssg: 40, clo: 8  },
    a1012: { label: 'ages 10-12', lo: 10, hi: 12, arr: 10, sta: 35, fix: 10, ssg: 38, clo: 7  },
    a1315: { label: 'ages 13-15', lo: 13, hi: 15, arr: 8,  sta: 45, fix: 15, ssg: 25, clo: 7  },
    a16:   { label: 'ages 16+',   lo: 16, hi: 18, arr: 7,  sta: 45, fix: 25, ssg: 18, clo: 5  }
  };
  var SLOTS = [
    { key: 'arr', slot: 'warmup',      label: 'Arrival',              color: '#3a8a5e', n: 1 },
    { key: 'sta', slot: 'variable',    label: 'Skill stations',       color: '#5fa382', n: 2 },
    { key: 'fix', slot: 'acquisition', label: 'One focused fix',      color: '#c8862e', n: 1 },
    { key: 'ssg', slot: 'small-sided', label: 'Small-sided and live', color: '#3a8a5e', n: 1 },
    { key: 'clo', slot: 'closing',     label: 'The closer',           color: '#7a9480', n: 1 }
  ];
  var SLOT_BY_KEY = {}; SLOTS.forEach(function (s) { SLOT_BY_KEY[s.key] = s; });
  var PLAY_FIRST = { 'game-based-play': 1, 'modified-play-adm': 1, 'classic-staple': 1, 'perception-decision': 1, 'variable-practice': 1 };
  var LENS = [45, 60, 75, 90];
  var KEY_SAVED = 'dl_practices_v1', KEY_PREFS = 'dl_pp_prefs', KEY_AGAIN = 'dl_pp_again';

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function short(s, n) { s = String(s || ''); n = n || 150; if (s.length <= n) return s; var cut = s.slice(0, n); return cut.slice(0, cut.lastIndexOf(' ')) + '...'; }
  function track(e) { if (window.DL && DL.track) DL.track(e); }
  function toast(m) { if (window.DL && DL.toast) DL.toast(m); }

  /* ── State: remembered answers, sensible defaults ─────────────── */
  var prefs = load(KEY_PREFS, {});
  var urlAge = new URLSearchParams(location.search).get('age');
  var sharedAge = BASE[urlAge] ? urlAge : (window.DL && DL.getAge ? DL.getAge() : '');
  var state = {
    len: LENS.indexOf(prefs.len) >= 0 ? prefs.len : 60,
    sport: prefs.sport === 'softball' ? 'softball' : 'baseball',
    age: BASE[sharedAge] ? sharedAge : (BASE[prefs.age] ? prefs.age : 'a79')
  };
  var plan = [], current = null; /* current = saved practice object when opened from the list */
  var seed = Date.now() % 100000, used = {};
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  function syncButtons() {
    ['len', 'sport', 'age'].forEach(function (k) {
      var row = $('q-' + k).querySelectorAll('.pp-opt');
      for (var i = 0; i < row.length; i++) {
        var on = String(state[k]) === row[i].getAttribute('data-v');
        row[i].classList.toggle('active', on);
        row[i].setAttribute('aria-checked', on ? 'true' : 'false');
        row[i].tabIndex = on ? 0 : -1;
      }
    });
  }
  function savePrefs() { store(KEY_PREFS, state); if (window.DL && DL.setAge) DL.setAge(state.age); }
  ['len', 'sport', 'age'].forEach(function (k) {
    var row = $('q-' + k);
    row.addEventListener('click', function (e) {
      var b = e.target.closest('.pp-opt'); if (!b) return;
      state[k] = k === 'len' ? parseInt(b.getAttribute('data-v'), 10) : b.getAttribute('data-v');
      syncButtons(); savePrefs();
      if (!$('out').hidden) { current = null; build(); }
    });
    /* Arrow keys move between options, like a native radio group */
    row.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
      var opts = Array.prototype.slice.call(row.querySelectorAll('.pp-opt')), i = opts.indexOf(document.activeElement);
      if (i < 0) return; e.preventDefault();
      var n = opts[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + opts.length) % opts.length];
      n.focus(); n.click();
    });
  });

  /* ── Generation (unchanged rules, plus reuse of what worked) ──── */
  function minutes() {
    var b = BASE[state.age], L = state.len;
    function r5(p) { return Math.round(p * L / 100 / 5) * 5; }
    var arr = Math.max(5, r5(b.arr)), clo = Math.max(5, r5(b.clo)), sta = r5(b.sta), fix = r5(b.fix);
    var ssg = L - arr - clo - sta - fix;
    if (ssg < 10) { sta -= (10 - ssg); ssg = 10; }
    return { arr: arr, sta: sta, fix: fix, ssg: ssg, clo: clo };
  }
  function fits(d, slot, looseAge) {
    var b = BASE[state.age];
    if (d.practiceSlot !== slot) return false;
    if (d.sport !== 'both' && d.sport !== state.sport) return false;
    if (d.category === 'throwing' || d.category === 'pitching') return false; /* no arm programs in a pinch plan */
    if (looseAge) return d.ageMax >= b.lo - 3; /* older groups: allow drills written for a few years younger */
    return !(d.ageMax < b.lo || d.ageMin > b.hi);
  }
  function choose(slot, n, avoid) {
    function pool(loose, allowUsed) { return DRILLS.filter(function (d) { return fits(d, slot, loose) && (allowUsed || !used[d.id]) && (!avoid || d.id !== avoid); }); }
    var p = pool(false, false);
    if (slot !== 'acquisition') { var play = p.filter(function (d) { return PLAY_FIRST[d.principle]; }); if (play.length >= n) p = play; }
    if (p.length < n) p = pool(false, true);
    if (p.length < n) p = pool(true, false);
    if (p.length < n) p = pool(true, true);
    /* Reuse: activities a coach marked "do again" are twice as likely to come back. */
    var again = load(KEY_AGAIN, {}), weighted = [];
    p.forEach(function (d) { weighted.push(d); if (again[d.id]) weighted.push(d); });
    var out = [];
    while (out.length < n && weighted.length) {
      var d = weighted[Math.floor(rnd() * weighted.length)];
      out.push(d); weighted = weighted.filter(function (x) { return x.id !== d.id; });
    }
    out.forEach(function (d) { used[d.id] = 1; });
    return out;
  }
  function build() {
    used = {}; var m = minutes(); plan = [];
    SLOTS.forEach(function (s) { if (m[s.key] <= 0) return; plan.push({ s: s, min: m[s.key], drills: choose(s.slot, s.n) }); });
    /* A slot with nothing that fits hands its minutes to the live block, so the clock still adds up. */
    var live = null; plan.forEach(function (p) { if (p.s.key === 'ssg') live = p; });
    plan = plan.filter(function (p) { if (p.drills.length) return true; if (live) live.min += p.min; return false; });
    render();
    track('practice_built');
  }

  /* Flatten blocks into timed steps: one step per activity */
  function steps() {
    var out = [], t = 0;
    plan.forEach(function (p, pi) {
      var each = p.drills.length > 1 ? Math.round(p.min / p.drills.length) : p.min;
      p.drills.forEach(function (d, di) {
        var mins = (di === p.drills.length - 1) ? (p.min - each * (p.drills.length - 1)) : each;
        out.push({ pi: pi, di: di, d: d, s: p.s, start: t, mins: mins, label: p.s.label + (p.drills.length > 1 ? ' ' + String.fromCharCode(65 + di) : '') });
        t += mins;
      });
    });
    return out;
  }
  function titleFor() { return state.len + ' minutes, ' + BASE[state.age].label + (state.sport === 'softball' ? ', softball' : ''); }

  function render() {
    var again = load(KEY_AGAIN, {});
    $('out-title').textContent = current ? current.title : titleFor();
    $('out-label').textContent = current ? 'Saved ' + new Date(current.created).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Tonight\'s practice';
    var html = '';
    steps().forEach(function (st) {
      var d = st.d;
      html += '<li class="pp-block" style="--c:' + st.s.color + '">' +
        '<div class="pp-time"><b>' + st.mins + '</b><i>min</i></div>' +
        '<div class="pp-body">' +
          '<div class="pp-slot">' + esc(st.label) + ' &middot; ' + (st.start === 0 ? 'start' : 'at ' + st.start + ' min') + '</div>' +
          '<h3 class="pp-name"><button type="button" data-show="' + esc(d.id) + '">' + esc(d.name) + '</button>' + (again[d.id] ? ' <span class="pp-again" title="Your team liked this one">Team favorite</span>' : '') + '</h3>' +
          '<p class="pp-run">' + esc(short(d.setup)) + '</p>' +
          (d.cue ? '<div class="pp-cue"><span>Cue</span> ' + esc(d.cue) + '</div>' : '') +
          '<div class="pp-tools"><button type="button" data-show="' + esc(d.id) + '">How to run it</button><button type="button" data-swap="' + st.pi + ':' + st.di + '" aria-label="Swap ' + esc(d.name) + ' for another activity">Swap</button></div>' +
        '</div></li>';
    });
    $('blocks').innerHTML = html;
    $('out').hidden = false;
    $('build-wrap').hidden = true;
    $('save').textContent = current ? 'Saved' : 'Save';
    $('save').disabled = !!current;
  }

  $('build').addEventListener('click', function () {
    current = null; build();
    setTimeout(function () { $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('out-title').focus({ preventScroll: true }); }, 50);
  });
  $('reshuffle').addEventListener('click', function () { seed = Date.now() % 100000; current = null; build(); });
  $('blocks').addEventListener('click', function (e) {
    var sh = e.target.closest('[data-show]'); if (sh) { showDrill(sh.getAttribute('data-show')); return; }
    var b = e.target.closest('[data-swap]'); if (!b) return;
    var ix = b.getAttribute('data-swap').split(':'), p = plan[+ix[0]], old = p.drills[+ix[1]];
    delete used[old.id];
    var nd = choose(p.s.slot, 1, old.id)[0];
    if (nd) { p.drills[+ix[1]] = nd; current = null; render(); toast('Swapped in ' + nd.name); }
    else { used[old.id] = 1; toast('Nothing else fits this block for this age.'); }
  });

  /* ── Save and the saved list ───────────────────────────────────── */
  function snapshot() {
    return { id: 'p' + Date.now().toString(36), title: titleFor(), created: Date.now(), len: state.len, sport: state.sport, age: state.age,
      blocks: plan.map(function (p) { return { key: p.s.key, min: p.min, ids: p.drills.map(function (d) { return d.id; }) }; }), reflection: null };
  }
  function restore(sp) {
    state.len = sp.len; state.sport = sp.sport; state.age = sp.age; syncButtons();
    plan = []; used = {};
    sp.blocks.forEach(function (b) {
      var s = SLOT_BY_KEY[b.key], ds = b.ids.map(function (id) { return DRILL_INDEX[id]; }).filter(Boolean);
      if (s && ds.length) { plan.push({ s: s, min: b.min, drills: ds }); ds.forEach(function (d) { used[d.id] = 1; }); }
    });
    return plan.length > 0;
  }
  function saved() { return load(KEY_SAVED, []); }
  $('save').addEventListener('click', function () {
    var list = saved(), sp = snapshot();
    list.unshift(sp); if (list.length > 30) list.length = 30;
    if (!store(KEY_SAVED, list)) { toast('This browser will not let us save. Try Print or Share instead.'); return; }
    current = sp; render(); renderSaved();
    toast('Saved. Find it under Your practices.'); track('practice_saved');
  });
  function renderSaved() {
    var list = saved(), box = $('saved-list');
    if (!list.length) {
      box.innerHTML = '<div class="pp-empty"><b>No saved practices yet.</b><span>Build one above and tap Save. It stays on this phone, ready for next week.</span></div>';
      renderResume(null); return;
    }
    box.innerHTML = '<ul class="pp-list">' + list.map(function (sp) {
      var r = sp.reflection, when = new Date(sp.created).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return '<li class="pp-item">' +
        '<div class="pp-item-main"><b>' + esc(sp.title) + '</b><span>' + esc(when) + (r ? ' &middot; notes saved' : '') + '</span>' +
        (r && (r.worked || r.change) ? '<p class="pp-item-note">' + (r.worked ? '<span>Worked:</span> ' + esc(r.worked) + ' ' : '') + (r.change ? '<span>Change:</span> ' + esc(r.change) : '') + '</p>' : '') + '</div>' +
        '<div class="pp-item-act">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-open="' + sp.id + '">Open</button>' +
          '<button type="button" class="btn btn-sm ' + (r ? 'btn-outline' : 'btn-primary') + '" data-reflect="' + sp.id + '">' + (r ? 'Edit notes' : 'How did it go?') + '</button>' +
          '<button type="button" class="btn btn-sm btn-outline" data-again="' + sp.id + '">Run it again</button>' +
          '<button type="button" class="pp-del" data-del="' + sp.id + '" aria-label="Delete ' + esc(sp.title) + '">Delete</button>' +
        '</div></li>';
    }).join('') + '</ul>';
    renderResume(list[0]);
  }
  /* The top-of-page nudge: reflect on the last one, or pick it back up */
  function renderResume(last) {
    var el = $('resume');
    if (!last) { el.hidden = true; return; }
    var hours = (Date.now() - last.created) / 36e5;
    if (!last.reflection && hours > 1) {
      el.innerHTML = '<div><b>How did "' + esc(last.title) + '" go?</b><span>Thirty seconds now makes next week\'s plan better.</span></div><button type="button" class="btn btn-primary btn-sm" data-reflect="' + last.id + '">Add notes</button>';
    } else {
      el.innerHTML = '<div><b>Pick up where you left off</b><span>' + esc(last.title) + '</span></div><button type="button" class="btn btn-secondary btn-sm" data-open="' + last.id + '">Open it</button>';
    }
    el.hidden = false;
  }
  function find(id) { var l = saved(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function openSaved(id, scroll) {
    var sp = find(id); if (!sp) return;
    if (!restore(sp)) { toast('Some activities in this practice are no longer in the library. Build a fresh one.'); return; }
    current = sp; render(); track('practice_reopened');
    if (scroll !== false) setTimeout(function () { $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('out-title').focus({ preventScroll: true }); }, 30);
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) { openSaved(o.getAttribute('data-open')); return; }
    var r = e.target.closest('[data-reflect]'); if (r) { openReflect(r.getAttribute('data-reflect')); return; }
    var a = e.target.closest('[data-again]'); if (a) {
      /* Same shape, fresh copy dated today: the reuse path for a practice that worked */
      var sp = find(a.getAttribute('data-again')); if (!sp || !restore(sp)) return;
      current = null; render(); toast('Loaded. Tap Save to keep this copy.');
      setTimeout(function () { $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); return;
    }
    var d = e.target.closest('[data-del]'); if (d) {
      var id = d.getAttribute('data-del'), sp2 = find(id);
      if (!sp2 || !window.confirm('Delete "' + sp2.title + '"? This cannot be undone.')) return;
      store(KEY_SAVED, saved().filter(function (x) { return x.id !== id; }));
      if (current && current.id === id) { current = null; if (!$('out').hidden) render(); }
      renderSaved(); toast('Deleted.');
    }
  });

  /* ── Reflect: three questions, all optional ────────────────────── */
  var refId = null;
  function openReflect(id) {
    var sp = find(id); if (!sp) return; refId = id;
    var r = sp.reflection || {}, picked = r.again || [];
    $('ref-sub').textContent = sp.title + '. Thirty seconds. Skip anything you like.';
    $('ref-worked').value = r.worked || ''; $('ref-change').value = r.change || '';
    var ids = []; sp.blocks.forEach(function (b) { b.ids.forEach(function (x) { if (DRILL_INDEX[x] && ids.indexOf(x) < 0) ids.push(x); }); });
    $('ref-chips').innerHTML = ids.map(function (x) {
      return '<label class="ref-chip"><input type="checkbox" value="' + esc(x) + '"' + (picked.indexOf(x) >= 0 ? ' checked' : '') + '><span>' + esc(DRILL_INDEX[x].name) + '</span></label>';
    }).join('');
    openDialog($('ref-dlg'));
  }
  $('ref-dlg').addEventListener('close', function () {
    if ($('ref-dlg').returnValue !== 'save' || !refId) return;
    var list = saved(), sp = null; list.forEach(function (x) { if (x.id === refId) sp = x; });
    if (!sp) return;
    var picks = Array.prototype.map.call($('ref-chips').querySelectorAll('input:checked'), function (i) { return i.value; });
    var before = (sp.reflection && sp.reflection.again) || [], again = load(KEY_AGAIN, {});
    before.forEach(function (x) { if (again[x]) { again[x]--; if (again[x] <= 0) delete again[x]; } });
    picks.forEach(function (x) { again[x] = (again[x] || 0) + 1; });
    store(KEY_AGAIN, again);
    sp.reflection = { worked: $('ref-worked').value.trim().slice(0, 160), change: $('ref-change').value.trim().slice(0, 160), again: picks, at: Date.now() };
    store(KEY_SAVED, list); renderSaved();
    if (current && current.id === sp.id) { current = sp; render(); }
    toast(picks.length ? 'Notes saved. Those activities will come back more often.' : 'Notes saved.');
    track('practice_reflected');
  });

  /* ── Run mode: one block at a time, big type, a countdown ──────── */
  var run = { i: 0, list: [], left: 0, timer: null, running: false };
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function drawRun() {
    var st = run.list[run.i], nx = run.list[run.i + 1];
    $('run-step').textContent = 'Block ' + (run.i + 1) + ' of ' + run.list.length;
    $('run-slot').textContent = st.label + ' · ' + st.mins + ' min';
    $('run-name').textContent = st.d.name;
    $('run-cue').innerHTML = st.d.cue ? '<span>Say this</span> ' + esc(st.d.cue) : '';
    $('run-cue').hidden = !st.d.cue;
    $('run-setup').textContent = short(st.d.execution || st.d.setup, 260);
    $('run-up').textContent = nx ? 'Up next: ' + nx.d.name + ' (' + nx.mins + ' min)' : 'Last block. Finish with something they will remember.';
    $('run-clock').textContent = fmt(run.left);
    $('run-clock').classList.toggle('over', run.left <= 0);
    $('run-go').textContent = run.running ? 'Pause' : (run.left < st.mins * 60 && run.left > 0 ? 'Resume' : 'Start');
    $('run-prev').disabled = run.i === 0;
    $('run-next').textContent = nx ? 'Next →' : 'Done';
  }
  function setBlock(i) { stopTimer(); run.i = i; run.left = run.list[i].mins * 60; drawRun(); }
  function stopTimer() { if (run.timer) clearInterval(run.timer); run.timer = null; run.running = false; }
  function tick() {
    run.left--;
    if (run.left === 0) {
      $('run-live').textContent = 'Time. ' + (run.list[run.i + 1] ? 'Next up: ' + run.list[run.i + 1].d.name : 'Practice is done.');
      if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    }
    if (run.left < -599) stopTimer();
    drawRun();
  }
  $('run').addEventListener('click', function () {
    run.list = steps(); if (!run.list.length) return;
    setBlock(0); openDialog($('run-dlg')); track('practice_run');
  });
  $('run-go').addEventListener('click', function () {
    if (run.running) { stopTimer(); drawRun(); return; }
    run.running = true; run.timer = setInterval(tick, 1000); drawRun();
  });
  $('run-prev').addEventListener('click', function () { if (run.i > 0) setBlock(run.i - 1); });
  $('run-next').addEventListener('click', function () {
    if (run.i < run.list.length - 1) { setBlock(run.i + 1); return; }
    stopTimer(); $('run-dlg').close();
    /* Finished: save it if needed, then ask how it went */
    if (!current) { $('save').click(); }
    if (current) openReflect(current.id);
  });
  $('run-close').addEventListener('click', function () { stopTimer(); $('run-dlg').close(); });
  $('run-dlg').addEventListener('close', stopTimer);

  /* ── Share and print ───────────────────────────────────────────── */
  function shareCode() {
    return [state.len, state.sport === 'softball' ? 's' : 'b', state.age].join('.') + '~' +
      plan.map(function (p) { return p.s.key + ':' + p.min + ':' + p.drills.map(function (d) { return d.id; }).join(','); }).join('~');
  }
  function fromCode(code) {
    var parts = String(code || '').split('~'), head = parts.shift().split('.');
    var len = parseInt(head[0], 10), age = head[2];
    if (!BASE[age] || !(len > 0 && len <= 120)) return false;
    var blocks = parts.map(function (x) { var q = x.split(':'); return { key: q[0], min: parseInt(q[1], 10) || 0, ids: (q[2] || '').split(',') }; });
    return restore({ len: LENS.indexOf(len) >= 0 ? len : 60, sport: head[1] === 's' ? 'softball' : 'baseball', age: age, blocks: blocks });
  }
  $('share').addEventListener('click', function () {
    var url = location.origin + location.pathname + '?p=' + encodeURIComponent(shareCode());
    var text = (current ? current.title : titleFor()) + ' from DugoutLab Practice in a Pinch';
    track('practice_shared');
    if (navigator.share) { navigator.share({ title: 'Practice plan', text: text, url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied. Send it to your assistant coach.'); }, function () { window.prompt('Copy this link:', url); });
    } else { window.prompt('Copy this link:', url); }
  });
  $('print').addEventListener('click', function () { track('practice_printed'); window.print(); });

  /* Dialogs: native <dialog> where supported, a simple fallback otherwise */
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else { dlg.setAttribute('open', ''); }
  }

  /* ── Start ─────────────────────────────────────────────────────── */
  syncButtons();
  renderSaved();
  var q = new URLSearchParams(location.search).get('p');
  if (q && fromCode(q)) {
    render(); $('out-label').textContent = 'Shared with you'; track('practice_shared_open');
    setTimeout(function () { $('out').scrollIntoView({ block: 'start' }); }, 30);
  } else if (location.hash === '#saved') {
    setTimeout(function () { $('saved').scrollIntoView({ block: 'start' }); }, 30);
  }
})();
