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

// ── Active nav link ────────────────────────────────────────────────
(function() {
  var page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    if (href === page || (page === 'index.html' && href === '/') ||
        (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

// ── Field bar: thumb-reach tool tabs on phones ─────────────────────
(function () {
  if (document.body.hasAttribute('data-nobar') || document.querySelector('.fieldbar')) return;
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var I = {
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    lineup: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    pitch: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 5.5c2 3.5 2 9.5 0 13M16.5 5.5c-2 3.5-2 9.5 0 13"/>',
    practice: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    tools: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'
  };
  var tabs = [
    ['index.html', 'Home', 'home'],
    ['lineup.html', 'Lineup', 'lineup'],
    ['pitch-tracker.html', 'Pitches', 'pitch'],
    ['practice.html', 'Practice', 'practice'],
    ['tools.html', 'Tools', 'tools']
  ];
  var nav = document.createElement('nav');
  nav.className = 'fieldbar';
  nav.setAttribute('aria-label', 'Quick tools');
  nav.innerHTML = tabs.map(function (t) {
    var on = t[0] === page || (t[0] === 'lineup.html' && page === 'pods.html');
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
               'game.html', 'field-layout.html', 'strike-zone.html', 'cage-targets.html', 'games.html'];
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
