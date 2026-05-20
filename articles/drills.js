// ── DUGOUTLAB — DRILLS.JS ──────────────────────────────────────────

var dlFilters = { age: 'all', cat: 'all', skill: 'all' };

var AGE_RANGES = {
  tball:        [4,  7],
  young:        [7,  9],
  middle:       [10, 12],
  teen:         [13, 18],
};

function dlSetAge(val, btn) {
  dlFilters.age = val;
  document.querySelectorAll('.age-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderDrills();
}

function dlSetCat(val, btn) {
  dlFilters.cat = val;
  document.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderDrills();
}

function dlSetSkill(val, btn) {
  dlFilters.skill = val;
  document.querySelectorAll('.skill-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderDrills();
}

function renderDrills() {
  var grid = document.getElementById('drill-grid');
  var countEl = document.getElementById('drill-count');
  if (!grid) return;

  var filtered = DRILLS.filter(function(d) {
    if (dlFilters.age !== 'all') {
      var range = AGE_RANGES[dlFilters.age];
      if (range && (d.ageMax < range[0] || d.ageMin > range[1])) return false;
    }
    if (dlFilters.cat !== 'all' && d.category !== dlFilters.cat) return false;
    if (dlFilters.skill !== 'all' && !(d.skillLevels || []).includes(dlFilters.skill)) return false;
    return true;
  });

  if (countEl) countEl.textContent = filtered.length + ' drills';

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#888">No drills match those filters. Try removing one.</div>';
    return;
  }

  grid.innerHTML = filtered.map(function(d) {
    var col = CAT_COLORS[d.category] || '#888';
    var catLabel = CAT_LABELS[d.category] || d.category;
    var setupShort = (d.setup || '').substring(0, 110) + ((d.setup||'').length > 110 ? '...' : '');
    return '<div class="card card-link drill-card" onclick="showDrill(\'' + d.id + '\')">'
      + '<span class="drill-cat" style="background:' + col + '">' + catLabel + '</span>'
      + '<div class="drill-name">' + d.name + '</div>'
      + '<div class="drill-meta">'
      + '<span>' + d.duration + ' min</span>'
      + '<span>Ages ' + d.ageMin + '-' + d.ageMax + '</span>'
      + '</div>'
      + '<div class="drill-setup">' + setupShort + '</div>'
      + '<div class="drill-tap">Tap for full details &#8594;</div>'
      + '</div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
  renderDrills();
});

// ── Sport filter ───────────────────────────────────────────────────
var dlSportFilter = 'all';

function dlSetSport(val, btn) {
  dlSportFilter = val;
  document.querySelectorAll('.sport-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderDrills();
}

// Patch renderDrills to include sport filter
var _origRender = renderDrills;
renderDrills = function() {
  var grid = document.getElementById('drill-grid');
  var countEl = document.getElementById('drill-count');
  if (!grid) return;

  var filtered = DRILLS.filter(function(d) {
    if (d.solo) return false;
    if (dlFilters.age !== 'all') {
      var range = AGE_RANGES[dlFilters.age];
      if (range && (d.ageMax < range[0] || d.ageMin > range[1])) return false;
    }
    if (dlFilters.cat !== 'all' && d.category !== dlFilters.cat) return false;
    if (dlFilters.skill !== 'all' && !(d.skillLevels || []).includes(dlFilters.skill)) return false;
    if (dlSportFilter !== 'all') {
      if (d.sport !== dlSportFilter && d.sport !== 'both') return false;
    }
    return true;
  });

  if (countEl) countEl.textContent = filtered.length + ' drills';

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#888">No drills match those filters.</div>';
    return;
  }

  grid.innerHTML = filtered.map(function(d) {
    var col = CAT_COLORS[d.category] || '#888';
    var catLabel = CAT_LABELS[d.category] || d.category;
    var setupShort = (d.setup || '').substring(0, 110) + ((d.setup||'').length > 110 ? '...' : '');
    var sportBadge = d.sport === 'baseball' ? '<span style="font-size:0.6rem;background:#e8f0ff;color:#1A5276;border-radius:3px;padding:1px 5px;margin-left:4px">Baseball</span>'
                   : d.sport === 'softball' ? '<span style="font-size:0.6rem;background:#fff0e8;color:#8a4a0a;border-radius:3px;padding:1px 5px;margin-left:4px">Softball</span>'
                   : '';
    return '<div class="card card-link drill-card" onclick="showDrill(\'' + d.id + '\')">'
      + '<span class="drill-cat" style="background:' + col + '">' + catLabel + '</span>'
      + sportBadge
      + '<div class="drill-name">' + d.name + '</div>'
      + '<div class="drill-meta">'
      + '<span>' + d.duration + ' min</span>'
      + '<span>Ages ' + d.ageMin + '-' + d.ageMax + '</span>'
      + '</div>'
      + '<div class="drill-setup">' + setupShort + '</div>'
      + '<div class="drill-tap">Tap for full details &#8594;</div>'
      + '</div>';
  }).join('');
};
