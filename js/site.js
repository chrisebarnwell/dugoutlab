// ── DUGOUTLAB: SITE.JS ────────────────────────────────────────────

// ── Mobile nav ────────────────────────────────────────────────────
function toggleMenu() {
  var m = document.getElementById('mobile-menu');
  if (m) m.classList.toggle('open');
}

// Close mobile menu on outside click
document.addEventListener('click', function(e) {
  var menu = document.getElementById('mobile-menu');
  var btn  = document.getElementById('menu-btn');
  if (menu && menu.classList.contains('open')) {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.classList.remove('open');
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
  if (path.indexOf('/articles/') >= 0 || page === 'articles.html') return { page: page, section: 'articles.html' };
  var TRAIN = ['training.html', 'athlete.html', 'stage-finder.html', 'development.html'];
  var AGES = ['ages.html', 'stages.html'];
  var WHY = ['how-kids-learn.html'];
  var TOOLS = ['tools.html', 'lineup.html', 'pods.html', 'pitch-tracker.html', 'practice.html', 'framework.html',
    'progression.html', 'practice-example.html', 'games.html', 'situations.html', 'situation.html', 'field-layout.html',
    'strike-zone.html', 'cage-targets.html', 'arena.html', 'game.html', 'pocket-card.html', 'launch-lab.html',
    'skipper.html', 'coach-dad.html', 'coach-dad-stay-loose.html'];
  var sec = TRAIN.indexOf(page) >= 0 ? 'training.html' : AGES.indexOf(page) >= 0 ? 'ages.html' :
    WHY.indexOf(page) >= 0 ? 'how-kids-learn.html' : TOOLS.indexOf(page) >= 0 ? 'tools.html' : '';
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
    lineup: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    train: '<path d="M5 19c3-1 4-3 5-6s3-6 9-7"/><circle cx="19" cy="6" r="2.2"/><path d="M4 13l3 3M8 9l3 3"/>',
    practice: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    tools: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'
  };
  var tabs = [
    ['index.html', 'Home', 'home'],
    ['lineup.html', 'Lineup', 'lineup'],
    ['practice.html', 'Practice', 'practice'],
    ['training.html', 'Train', 'train'],
    ['tools.html', 'Tools', 'tools']
  ];
  var nav = document.createElement('nav');
  nav.className = 'fieldbar';
  nav.setAttribute('aria-label', 'Quick tools');
  nav.innerHTML = tabs.map(function (t) {
    var on = t[0] === page || (t[0] === 'lineup.html' && page === 'pods.html') ||
      (t[0] === 'training.html' && DL_SECTION.section === 'training.html') ||
      (t[0] === 'tools.html' && DL_SECTION.section === 'tools.html' && ['lineup.html', 'pods.html', 'practice.html'].indexOf(page) < 0);
    return '<a href="/' + t[0] + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[t[2]] + '</svg><span>' + t[1] + '</span></a>';
  }).join('');
  document.body.appendChild(nav);
  document.body.classList.add('has-fieldbar');
})();

// ── Keep the screen awake on field tools ───────────────────────────
(function () {
  var page = window.location.pathname.split('/').pop() || 'index.html';
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
