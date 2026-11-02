// ── DUGOUTLAB: SITE.JS ────────────────────────────────────────────

// ── Mobile nav ────────────────────────────────────────────────────
function toggleMenu() {
  var m = document.getElementById('mobile-menu');
  if (!m) return;
  var open = m.classList.toggle('open');
  var b = document.getElementById('menu-btn');
  if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Escape closes the phone menu and returns focus to its button
document.addEventListener('keydown', function (e) {
  var m = document.getElementById('mobile-menu');
  if (e.key === 'Escape' && m && m.classList.contains('open')) { toggleMenu(); var b = document.getElementById('menu-btn'); if (b) b.focus(); }
});

// Close mobile menu on outside click
document.addEventListener('click', function(e) {
  var menu = document.getElementById('mobile-menu');
  var btn  = document.getElementById('menu-btn');
  if (menu && menu.classList.contains('open')) {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }
});

// ── Drill detail modal ─────────────────────────────────────────────
function showDrill(id) {
  if (!id || typeof DRILLS === 'undefined') return;
  var drill = DRILL_INDEX[id];
  if (!drill) return;

  var modal = document.getElementById('drill-modal');
  if (!modal) return;

  var col = CAT_COLORS[drill.category] || '#888';
  var catLabel = CAT_LABELS[drill.category] || drill.category;

  document.getElementById('modal-cat').textContent   = catLabel;
  document.getElementById('modal-name').textContent  = drill.name;
  document.getElementById('modal-dur').textContent   = drill.duration + ' min';
  document.getElementById('modal-players').textContent = (drill.minPlayers || 1) + '+ players';
  document.getElementById('modal-equip').textContent = drill.equipment || '';
  document.getElementById('modal-setup').textContent = drill.setup || '';
  document.getElementById('modal-exec').textContent  = drill.execution || '';
  document.getElementById('modal-cue').textContent   = drill.cue || '';
  document.getElementById('modal-why').textContent   = drill.why || '';

  // New enhanced fields: hide the entire box if data is missing or empty
  function setOrHide(elId, value) {
    var el = document.getElementById(elId);
    if (!el) return;
    var text = (value || '').toString().trim();
    el.textContent = text;
    // Walk up to the nearest "box" container and hide it if empty
    var box = el.closest('.modal-cue-box, .modal-why-box, [data-modal-box]') || el.parentElement;
    if (box) box.style.display = text ? '' : 'none';
  }
  setOrHide('modal-watch', drill.watchFor);
  setOrHide('modal-prog',  drill.progressions);
  setOrHide('modal-reg',   drill.regression);

  // Sport badge
  var sportEl = document.getElementById('modal-sport');
  if (sportEl) {
    var sportLabels = { both: 'Baseball & Softball', baseball: 'Baseball', softball: 'Softball' };
    sportEl.textContent = sportLabels[drill.sport] || 'Baseball & Softball';
  }

  var header = document.getElementById('modal-header');
  if (header) header.style.background = col;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrillModal() {
  var modal = document.getElementById('drill-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
  var modal = document.getElementById('drill-modal');
  if (modal && modal.classList.contains('open') && e.target === modal) {
    closeDrillModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeDrillModal();
});

// ── Email capture ──────────────────────────────────────────────────
function submitEmail(formId, confirmId) {
  var form    = document.getElementById(formId);
  var confirm = document.getElementById(confirmId);
  if (!form) return;

  var input = form.querySelector('input[type="email"]');
  if (!input || !input.value.includes('@')) {
    input && (input.style.borderColor = '#c0392b');
    return;
  }

  // Store locally (ready to wire to Mailchimp/Beehiiv when ready)
  var emails = JSON.parse(localStorage.getItem('dl_emails') || '[]');
  if (!emails.includes(input.value)) {
    emails.push(input.value);
    localStorage.setItem('dl_emails', JSON.stringify(emails));
  }

  if (confirm) {
    confirm.style.display = 'block';
    form.style.display = 'none';
  }
}

// Handle Enter key on email inputs
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.type === 'email') {
    var form    = e.target.closest('[id$="-form"]');
    var confirm = form ? document.getElementById(form.id.replace('-form','-confirm')) : null;
    if (form && confirm) submitEmail(form.id, confirm.id);
  }
});

// ── You are here: light the current section in every menu ─────────
// One map: each page belongs to one top-nav section. Top nav, hamburger
// and footer all light the same way, so the site reads as one site.
var DL_SECTION = (function () {
  var path = window.location.pathname;
  var page = path.split('/').pop() || 'index.html';
  if (page.indexOf('.') < 0) page += '.html';
  if (path.indexOf('/articles/') >= 0) return { page: page, section: 'articles.html' };
  var MAP = {
    'practice.html': ['practice.html', 'framework.html', 'games.html', 'progression.html', 'practice-example.html'],
    'game-day.html': ['game-day.html', 'lineup.html', 'pods.html', 'pitch-tracker.html', 'pocket-card.html', 'field-layout.html',
      'strike-zone.html', 'situations.html', 'situation.html', 'skipper.html'],
    'training.html': ['training.html', 'athlete.html', 'moves.html', 'stage-finder.html', 'development.html', 'cage-targets.html',
      'game.html', 'arena.html', 'launch-lab.html'],
    'articles.html': ['articles.html', 'how-kids-learn.html', 'stages.html', 'ages.html', 'about.html'],
    'parents.html': ['parents.html', 'coach-dad.html', 'coach-dad-stay-loose.html']
  };
  var sec = '';
  Object.keys(MAP).forEach(function (k) { if (MAP[k].indexOf(page) >= 0) sec = k; });
  return { page: page, section: sec };
})();
(function () {
  function file(a) { return (a.getAttribute('href') || '').split('/').pop().split('#')[0]; }
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(function (a) {
    if (DL_SECTION.section && file(a) === DL_SECTION.section) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
  });
  document.querySelectorAll('.footer-links a').forEach(function (a) {
    if (file(a) === DL_SECTION.page) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
  });
})();

// ── Field bar: thumb-reach tool tabs on phones ─────────────────────
(function () {
  if (document.body.hasAttribute('data-nobar') || document.querySelector('.fieldbar')) return;
  var page = DL_SECTION.page;
  var I = {
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    gameday: '<path d="M12 3l8 8-8 8-8-8z"/><path d="M12 15.5v-3.2"/><circle cx="12" cy="10.6" r="0.9"/>',
    train: '<circle cx="17.5" cy="5" r="2.2"/><path d="M5.5 11.5l3.5-3 4.5 1 4 1M13.5 9.5l-3.5 6M10 15.5l-5.5 3M10 15.5l4.5 1.5 1 4.5"/>',
    practice: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    learn: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5C9.5 18 6.5 18 4 19z"/><path d="M12 6v13.5"/>'
  };
  var tabs = [
    ['index.html', 'Home', 'home', ''],
    ['practice.html', 'Practice', 'practice', 'practice.html'],
    ['game-day.html', 'Game Day', 'gameday', 'game-day.html'],
    ['training.html', 'Train', 'train', 'training.html'],
    ['articles.html', 'Learn', 'learn', 'articles.html']
  ];
  var nav = document.createElement('nav');
  nav.className = 'fieldbar';
  nav.setAttribute('aria-label', 'Quick tools');
  nav.innerHTML = tabs.map(function (t) {
    var on = t[0] === page || (t[3] && t[3] === DL_SECTION.section);
    return '<a href="/' + t[0] + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[t[2]] + '</svg><span>' + t[1] + '</span></a>';
  }).join('');
  document.body.appendChild(nav);
  document.body.classList.add('has-fieldbar');
})();

// ── Keep the screen awake on field tools ───────────────────────────
(function () {
  var page = window.location.pathname.split('/').pop() || 'index.html';
  if (page.indexOf('.') < 0) page += '.html'; /* Cloudflare serves /practice, not /practice.html */
  var FIELD = ['pitch-tracker.html', 'lineup.html', 'pods.html', 'practice.html', 'practice-example.html',
               'game.html', 'arena.html', 'field-layout.html', 'strike-zone.html', 'cage-targets.html', 'games.html'];
  if (FIELD.indexOf(page) < 0 || !('wakeLock' in navigator)) return;
  var lock = null;
  function grab() {
    if (lock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l;
      l.addEventListener('release', function () { lock = null; });
    }).catch(function () {});
  }
  document.addEventListener('pointerdown', grab, { passive: true });
  document.addEventListener('visibilitychange', grab);
  grab();
})();

// ── Account: sign in / sign out in every menu ──────────────────────
// One DugoutLab account across tools. Writes the shared session keys every
// tool already reads (dl_pitch, dl_game2; Athlete Plan picks these up).
(function () {
  var KEYS = ['dl_pitch', 'dl_game2'];
  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function session() {
    for (var i = 0; i < KEYS.length; i++) { var a = get(KEYS[i]); if (a && a.token) return a; }
    var ap = get('dl_athlete_v1'); if (ap && ap.account && ap.account.token) return { token: ap.account.token, account: { name: ap.account.name } };
    return null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setSession(j) {
    var v = JSON.stringify({ token: j.token, account: j.account || null });
    try { localStorage.setItem('dl_pitch', v); var g = get('dl_game2') || {}; g.token = j.token; g.account = j.account || null; localStorage.setItem('dl_game2', JSON.stringify(g)); } catch (e) {}
  }
  function signOut() {
    var ap = get('dl_athlete_v1'), unsynced = false;
    if (ap && ap.athletes) Object.keys(ap.athletes).forEach(function (k) { if (ap.athletes[k].dirty) unsynced = true; });
    if (unsynced && !window.confirm('Some Athlete Plan changes on this phone have not backed up yet. Sign out anyway and lose them?')) return;
    try {
      localStorage.removeItem('dl_pitch'); localStorage.removeItem('dl_pitch_live'); localStorage.removeItem('dl_game2');
      localStorage.removeItem('dl_athlete_v1'); localStorage.removeItem('dl_last_email');
    } catch (e) {}
    window.location.reload();
  }
  var css = document.createElement('style');
  css.textContent =
    '.acct-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0.9rem 0 0.2rem;margin-top:0.4rem;border-top:1px solid var(--rule)}' +
    '.acct-row small{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-faint)}' +
    '.acct-row b{display:block;color:var(--ink);font-family:var(--sans);font-size:0.95rem;margin-top:2px}' +
    '.acct-btn{font:inherit;font-weight:700;font-size:0.9rem;border-radius:999px;padding:0.55rem 1.1rem;cursor:pointer;border:1px solid var(--gold);background:var(--fill);color:var(--on-fill)}' +
    '.acct-btn.ghost{background:none;color:var(--ink-soft);border-color:var(--rule)}' +
    '.nav-acct{font:inherit;font-size:0.85rem;font-weight:600;color:var(--ink-soft);background:none;border:1px solid var(--rule);border-radius:999px;padding:0.35rem 0.9rem;margin-left:0.5rem;cursor:pointer}' +
    '.acct-bg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center}' +
    '.acct-sh{width:100%;max-width:480px;background:var(--forest2,#1a3024);border-top:1px solid var(--rule);border-radius:22px 22px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));color:var(--ink)}' +
    '.acct-sh h3{font-family:var(--serif);font-size:1.4rem;margin:6px 0 4px}' +
    '.acct-sh p{color:var(--ink-soft);font-size:0.9rem;line-height:1.5}' +
    '.acct-sh input[type=email],.acct-sh input[type=text]{width:100%;margin-top:12px;padding:13px;border-radius:12px;border:1.5px solid var(--rule);background:var(--forest-deep);color:var(--ink);font:inherit;font-size:1rem;box-sizing:border-box}' +
    '.acct-sh label{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:0.85rem;color:var(--ink-soft)}' +
    '.acct-sh .go{width:100%;margin-top:16px;padding:15px;border-radius:12px;border:0;background:var(--fill);color:var(--on-fill);font:inherit;font-weight:700;font-size:1rem;cursor:pointer}' +
    '.acct-sh .err{color:var(--gold-light);font-size:0.85rem;margin-top:8px;min-height:1em}' +
    '.acct-sh .x{background:none;border:0;color:var(--ink-faint);font:inherit;text-decoration:underline;margin-top:12px;width:100%;cursor:pointer}';
  document.head.appendChild(css);

  function openSignIn() {
    var menu = document.getElementById('mobile-menu'); if (menu) menu.classList.remove('open');
    var mode = 'in', bg = document.createElement('div'); bg.className = 'acct-bg';
    function draw(msg) {
      var le = ''; try { le = localStorage.getItem('dl_last_email') || ''; } catch (e) {}
      var em = bg.querySelector('#acct-e'); if (em) le = em.value;
      bg.innerHTML = '<div class="acct-sh" role="dialog" aria-label="Sign in"><small style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--gold)">DugoutLab account</small>' +
        '<h3>' + (mode === 'in' ? 'Sign in' : 'Create your account') + '</h3><p>One account for every tool. Your plans and data back up to it. Email only, no password.</p>' +
        '<input type="email" id="acct-e" placeholder="you@email.com" autocomplete="email" inputmode="email" maxlength="120" value="' + esc(le) + '">' +
        (mode === 'up' ? '<input type="text" id="acct-n" placeholder="Your first name" maxlength="40"><label><input type="checkbox" id="acct-a"> <span>I am the parent or legal guardian, or an adult coach, and I am 18 or older.</span></label>' : '') +
        '<div class="err" id="acct-err">' + esc(msg || '') + '</div><button type="button" class="go" id="acct-go">' + (mode === 'in' ? 'Sign in' : 'Sign up') + '</button>' +
        '<button type="button" class="x" id="acct-sw">' + (mode === 'in' ? 'New here? Sign up' : 'Have an account? Sign in') + '</button><button type="button" class="x" id="acct-x" style="margin-top:4px">Not now</button></div>';
      bg.querySelector('#acct-x').onclick = function () { bg.remove(); };
      bg.querySelector('#acct-sw').onclick = function () { mode = mode === 'in' ? 'up' : 'in'; draw(); };
      bg.querySelector('#acct-go').onclick = function () {
        var b = this, email = String(bg.querySelector('#acct-e').value || '').trim().toLowerCase(), err = bg.querySelector('#acct-err');
        if (mode === 'up' && !bg.querySelector('#acct-a').checked) { err.textContent = 'Check the box to confirm you are the adult signing up.'; return; }
        b.disabled = true; err.textContent = '';
        var body = mode === 'in' ? { email: email } : { name: bg.querySelector('#acct-n').value, email: email, role: 'parent', adult: true, app: 'athlete' };
        fetch('/api/' + (mode === 'in' ? 'signin' : 'signup'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.error || 'Could not sign in.');
            if (!j.token) { mode = 'up'; draw('Almost there. Add your name to finish the account.'); return; }
            setSession(j); try { localStorage.setItem('dl_last_email', email); localStorage.setItem('dl_email_ok', JSON.stringify({ email: email, at: Date.now() })); } catch (e) {}
            window.location.reload();
          }); }).catch(function (e) { err.textContent = e.message; b.disabled = false; });
      };
    }
    bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); });
    draw(); document.body.appendChild(bg);
  }
  window.dlSignIn = openSignIn; window.dlSignOut = signOut;

  var s = session(), name = s && s.account && s.account.name ? s.account.name : '';
  var menu = document.getElementById('mobile-menu');
  if (menu) {
    var row = document.createElement('div'); row.className = 'acct-row';
    row.innerHTML = s ? '<div><small>Signed in</small><b>' + esc(name || 'Your account') + '</b></div><button type="button" class="acct-btn ghost" id="acct-out">Sign out</button>'
                      : '<div><small>Account</small><b>Back up your plans</b></div><button type="button" class="acct-btn" id="acct-in">Sign in</button>';
    menu.appendChild(row);
  }
  var links = document.querySelector('.nav-links');
  if (links) { var li = document.createElement('li'); li.innerHTML = '<button type="button" class="nav-acct" data-acct>' + (s ? 'Sign out' : 'Sign in') + '</button>'; links.appendChild(li); }
  document.querySelectorAll('#acct-out, .nav-acct').forEach(function (b) { b.addEventListener('click', function () { s ? signOut() : openSignIn(); }); });
  var bi = document.getElementById('acct-in'); if (bi) bi.addEventListener('click', openSignIn);
})();

// ── Skip link and main landmark ────────────────────────────────────
(function () {
  if (document.querySelector('.skip-link')) return;
  var menu = document.getElementById('mobile-menu');
  var main = document.getElementById('main') || document.querySelector('main');
  if (!main && menu) { main = menu.nextElementSibling; while (main && /^(STYLE|SCRIPT)$/.test(main.tagName)) main = main.nextElementSibling; }
  if (!main) return;
  if (!main.id) main.id = 'main';
  if (main.tagName !== 'MAIN' && !main.getAttribute('role')) main.setAttribute('role', 'main');
  var a = document.createElement('a'); a.className = 'skip-link'; a.href = '#' + main.id; a.textContent = 'Skip to content';
  document.body.insertBefore(a, document.body.firstChild);
})();

// ── Page style: Auto (follow the phone), Light, or Dark ────────────
// Reading and form pages use the paper surface; this lets anyone pick.
(function () {
  function current() { try { return localStorage.getItem('dl_theme') || 'auto'; } catch (e) { return 'auto'; } }
  function apply(v) {
    try { if (v === 'auto') localStorage.removeItem('dl_theme'); else localStorage.setItem('dl_theme', v); } catch (e) {}
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === v ? 'true' : 'false'); });
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.addEventListener('click', function () { apply(b.getAttribute('data-theme-set')); }); });
  apply(current());
})();

// ── Shared helpers every tool can use ──────────────────────────────
window.DL = window.DL || {};
// One age group across the site. Values: a46, a79, a1012, a1315, a16.
DL.AGES = [['a46', '4-6'], ['a79', '7-9'], ['a1012', '10-12'], ['a1315', '13-15'], ['a16', '16+']];
DL.getAge = function () { try { return localStorage.getItem('dl_age') || ''; } catch (e) { return ''; } };
DL.setAge = function (v) { try { localStorage.setItem('dl_age', v); } catch (e) {} };
DL.toast = function (msg) {
  var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
};
// Privacy-first counts: an event name and a page, nothing else. No cookies,
// no IDs, no IP stored. Daily totals only (see /api/metric and privacy.html).
DL.track = function (name) {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    if (!/^[a-z0-9_]{2,40}$/.test(name) || location.protocol !== 'https:') return;
    var body = JSON.stringify({ e: name, p: (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '').slice(0, 40) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/metric', new Blob([body], { type: 'application/json' }));
  } catch (e) {}
};
// Returning visitor: count once per day per browser, without storing who.
(function () {
  try {
    var d = new Date().toISOString().slice(0, 10), last = localStorage.getItem('dl_seen');
    if (last !== d) { if (last) DL.track('return_visit'); localStorage.setItem('dl_seen', d); }
  } catch (e) {}
})();
// TL;DR seen: counted once per page view when the summary is actually on screen.
(function () {
  var t = document.querySelector('.tldr');
  if (!t || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    if (es[0].isIntersecting) { DL.track('tldr_seen'); io.disconnect(); }
  }, { threshold: 0.6 });
  io.observe(t);
})();
