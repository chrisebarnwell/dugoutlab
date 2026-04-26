// ── DUGOUTLAB — SITE.JS ────────────────────────────────────────────

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

  // New enhanced fields
  var watchEl = document.getElementById('modal-watch');
  if (watchEl) watchEl.textContent = drill.watchFor || '';
  var progEl = document.getElementById('modal-prog');
  if (progEl) progEl.textContent = drill.progressions || '';
  var regEl = document.getElementById('modal-reg');
  if (regEl) regEl.textContent = drill.regression || '';

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
