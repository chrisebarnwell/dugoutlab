var wzSport = 'baseball';

function wzPickSport(val, btn) {
  wzSport = val;
  document.querySelectorAll('[id^="sport-"]').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

// ── DUGOUTLAB — BUILDER.JS ─────────────────────────────────────────

var wzSel = { age: null, time: null, focus: null, situation: null, skill: null };
var wzPlan = null;

function wzPick(group, val, btn) {
  wzSel[group] = val;
  btn.closest('.wz-opts-row').querySelectorAll('.wz-opt').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');

  var filled = Object.values(wzSel).filter(function(v) { return v !== null; }).length;
  var buildBtn = document.getElementById('build-btn');
  if (buildBtn) {
    buildBtn.disabled  = filled < 5;
    buildBtn.style.opacity = filled < 5 ? '0.4' : '1';
  }
}

function wzBuild() {
  if (!wzSel.age || !wzSel.time || !wzSel.focus || !wzSel.situation || !wzSel.skill) return;

  var totalMin  = parseInt(wzSel.time);
  var focus     = wzSel.focus;
  var ageGroup  = wzSel.age;
  var situation = wzSel.situation;
  var skillLvl  = wzSel.skill;

  var ageMinMap = { tball:4, young:7, middle:10, teen:13 };
  var ageMaxMap = { tball:7, young:9,  middle:12, teen:18 };
  var ageMin = ageMinMap[ageGroup];
  var ageMax = ageMaxMap[ageGroup];

  var ageLabels = {
    tball:  'T-Ball (Ages 4-7)',
    young:  'Ages 7-9',
    middle: 'Ages 10-12',
    teen:   'Ages 13+',
  };
  var focusLabels = {
    general:'Balanced', fielding:'Fielding', hitting:'Hitting',
    throwing:'Throwing', baserunning:'Baserunning', pitching:'Pitching',
  };
  var sitLabels = {
    regular:'Regular Practice', first:'First Practice of Season',
    pregame:'Pre-Game Warmup', tournament:'Tournament Day', last:'End of Season',
  };
  var skillLabels = { 'first-year':'Beginners', developing:'Developing', experienced:'Experienced' };

  // Build slot pools
  var pools = { warmup:[], acquisition:[], variable:[], 'small-sided':[], closing:[] };
  var skillMap = { 'first-year':0, developing:1, experienced:2 };
  var mySkill  = skillMap[skillLvl] || 0;

  DRILLS.forEach(function(d) {
    if (d.solo) return;
    if (d.ageMax < ageMin || d.ageMin > ageMax) return;
    if (d.sport && d.sport !== 'both' && d.sport !== wzSport) return;
    var compatible = (d.skillLevels || []).some(function(s) {
      return Math.abs((skillMap[s] || 0) - mySkill) <= 1;
    });
    if (!compatible) return;
    var slot = d.practiceSlot || 'variable';
    if (pools[slot]) pools[slot].push(d);
  });

  // Structures by situation
  var structures = {
    regular: [
      { slot:'warmup',      pct:.13, label:'Movement Warm-Up' },
      { slot:'acquisition', pct:.20, label: focusLabels[focus] + ' Intro' },
      { slot:'variable',    pct:.22, label: focusLabels[focus] + ' Work' },
      { slot:'small-sided', pct:.40, label:'Small-Sided Game' },
      { slot:'closing',     pct:.05, label:'Closing Circle' },
    ],
    first: [
      { slot:'warmup',      pct:.20, label:'Intro Game' },
      { slot:'small-sided', pct:.28, label:'Fun Game' },
      { slot:'acquisition', pct:.28, label:'One Simple Skill' },
      { slot:'small-sided', pct:.19, label:'Closing Game' },
      { slot:'closing',     pct:.05, label:'Closing Circle' },
    ],
    pregame: [
      { slot:'warmup',      pct:.25, label:'Movement Warm-Up' },
      { slot:'variable',    pct:.30, label:'Skill Activation' },
      { slot:'small-sided', pct:.40, label:'Competitive Game' },
      { slot:'closing',     pct:.05, label:'Team Talk' },
    ],
    tournament: [
      { slot:'warmup',      pct:.20, label:'Warm-Up' },
      { slot:'variable',    pct:.22, label:'Mental Prep' },
      { slot:'small-sided', pct:.33, label:'Game Simulation' },
      { slot:'small-sided', pct:.20, label:'Competition Game' },
      { slot:'closing',     pct:.05, label:'Team Talk' },
    ],
    last: [
      { slot:'warmup',      pct:.15, label:'Warm-Up' },
      { slot:'small-sided', pct:.30, label:'Favorite Game' },
      { slot:'variable',    pct:.25, label:'Showcase Skill' },
      { slot:'small-sided', pct:.25, label:'Championship Game' },
      { slot:'closing',     pct:.05, label:'Season Reflection' },
    ],
  };

  var structure = structures[situation] || structures.regular;

  function pickDrill(slot, preferCat, exclude) {
    var pool = (pools[slot] || []).filter(function(d) {
      return !(exclude || []).includes(d.id);
    });
    if (pool.length === 0) {
      pool = DRILLS.filter(function(d) {
        return d.ageMax >= ageMin && d.ageMin <= ageMax && !(exclude || []).includes(d.id);
      });
    }
    if (preferCat && preferCat !== 'general') {
      var pref = pool.filter(function(d) { return d.category === preferCat; });
      if (pref.length > 0) pool = pref;
    }
    return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  var used = [], planSlots = [], cursor = 0;
  var slotColors = {
    warmup:'#52b788', acquisition:'#2d6a4a', variable:'#1a3a2a',
    'small-sided':'#c8781a', closing:'#888888',
  };

  structure.forEach(function(block) {
    var mins  = Math.max(3, Math.round(totalMin * block.pct));
    var drill = pickDrill(block.slot, focus, used);
    if (drill) used.push(drill.id);

    planSlots.push({
      drillId:   drill ? drill.id   : '',
      drillName: drill ? drill.name : block.label,
      slotLabel: block.label,
      t0: String(cursor),
      t1: String(cursor + mins),
      setup:     drill ? (drill.setup || '') : '',
      cue:       drill ? (drill.cue   || '') : '',
      color:     slotColors[block.slot] || '#888',
    });
    cursor += mins;
  });

  wzPlan = {
    ageLabel:  ageLabels[ageGroup],
    time:      wzSel.time,
    focus:     focusLabels[focus],
    situation: sitLabels[situation],
    skill:     skillLabels[skillLvl],
    slots:     planSlots,
  };

  renderPlan();

  document.getElementById('wz-questions').style.display = 'none';
  document.getElementById('wz-output').style.display    = 'block';

  // Paywall counter
  var uses = parseInt(localStorage.getItem('dl_uses') || '0') + 1;
  localStorage.setItem('dl_uses', uses);
  if (uses >= 5) showPaywall();
}

function renderPlan() {
  var container = document.getElementById('plan-cards');
  if (!container || !wzPlan) return;

  var html = '';
  wzPlan.slots.forEach(function(slot) {
    var setupShort = slot.setup.substring(0, 150) + (slot.setup.length > 150 ? '...' : '');
    var cueHtml = slot.cue
      ? '<div class="plan-card-cue">' + slot.cue + '</div>'
      : '';

    html += '<div class="plan-card" onclick="showDrill(\'' + slot.drillId + '\')" style="cursor:' + (slot.drillId ? 'pointer' : 'default') + '">'
      + '<div class="plan-card-time" style="background:' + slot.color + '">'
      + '<div class="t-start">' + slot.t0 + '</div>'
      + '<div class="t-end">' + slot.t1 + '</div>'
      + '<div class="t-min">min</div>'
      + '</div>'
      + '<div class="plan-card-body">'
      + '<div class="plan-card-slot">' + slot.slotLabel + '</div>'
      + '<div class="plan-card-name">' + slot.drillName + (slot.drillId ? ' <span class="plan-card-tap">tap for details</span>' : '') + '</div>'
      + (setupShort ? '<div class="plan-card-setup">' + setupShort + '</div>' : '')
      + cueHtml
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;
}

function wzReset() {
  wzSel = { age:null, time:null, focus:null, situation:null, skill:null };
  wzPlan = null;
  document.getElementById('wz-questions').style.display = 'block';
  document.getElementById('wz-output').style.display    = 'none';
  var buildBtn = document.getElementById('build-btn');
  if (buildBtn) { buildBtn.disabled = true; buildBtn.style.opacity = '0.4'; }
  document.querySelectorAll('.wz-opt').forEach(function(b) { b.classList.remove('active'); });
}

function wzPrint() {
  if (!wzPlan) return;

  var rows = wzPlan.slots.map(function(s) {
    var setupText = (s.setup || '').substring(0, 280)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var name = s.drillName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var cueHtml = s.cue
      ? '<div style="background:#faf3e8;border:1px solid #e8c88a;border-radius:4px;padding:3px 8px;font-size:10px;color:#8a4a0a;font-weight:600;margin-top:4px;display:inline-block">'
        + s.cue.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      : '';
    return '<tr valign="top">'
      + '<td style="background:' + s.color + ';width:52px;text-align:center;padding:9px 3px;border-radius:5px 0 0 5px">'
      + '<div style="font-size:8px;color:rgba(255,255,255,.7)">' + s.t0 + '</div>'
      + '<div style="font-size:11px;font-weight:900;color:#fff">' + s.t1 + '</div>'
      + '<div style="font-size:7px;color:rgba(255,255,255,.55)">min</div>'
      + '</td>'
      + '<td style="padding:8px 11px;background:#fff;border-radius:0 5px 5px 0">'
      + '<div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#aaa;margin-bottom:2px">' + s.slotLabel + '</div>'
      + '<div style="font-size:13px;font-weight:900;color:#1a3a2a;margin-bottom:3px">' + name + '</div>'
      + '<div style="font-size:10px;color:#444;line-height:1.5">' + setupText + '</div>'
      + cueHtml
      + '</td></tr><tr><td colspan="2" style="height:4px"></td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DugoutLab Practice Plan</title>'
    + '<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}'
    + 'table{width:100%;border-collapse:separate;border-spacing:0}'
    + '@media print{@page{margin:.4in}.no-print{display:none!important}}'
    + '</style></head><body>'
    + '<div style="background:#1a3a2a;padding:11px 16px;display:flex;justify-content:space-between;align-items:center">'
    + '<div><span style="font-size:18px;font-weight:900;color:#fff">Dugout</span>'
    + '<span style="font-size:18px;font-weight:900;color:#c8781a">Lab</span>'
    + '<div style="font-size:8px;color:#7aab90;margin-top:1px">dugoutlab.com</div></div>'
    + '<div style="text-align:right">'
    + '<div style="font-size:10px;font-weight:800;color:#fff;letter-spacing:.1em">PRACTICE PLAN</div>'
    + '<div style="font-size:9px;color:#e8c870;margin-top:1px">' + wzPlan.ageLabel + ' &middot; ' + wzPlan.time + ' min</div>'
    + '</div></div>'
    + '<div style="height:3px;background:#c8781a"></div>'
    + '<div style="padding:10px 16px">'
    + '<div style="background:#2d6a4a;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:900;color:#fff">' + wzPlan.ageLabel + ' &middot; ' + wzPlan.focus + '</div>'
    + '<div style="font-size:9px;color:rgba(255,255,255,.65)">' + wzPlan.situation + ' &middot; ' + wzPlan.skill + '</div></div>'
    + '<table><tbody>' + rows + '</tbody></table></div>'
    + '<div style="background:#1a3a2a;padding:7px 16px;margin-top:10px;display:flex;justify-content:space-between">'
    + '<span style="font-size:8px;color:#7aab90">DugoutLab &middot; dugoutlab.com &middot; Free for Little League coaches</span>'
    + '<span style="font-size:8px;color:#c8781a;font-weight:700">Share freely.</span></div>'
    + '<div class="no-print" style="text-align:center;padding:14px">'
    + '<button onclick="window.print()" style="background:#c8781a;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;margin-right:8px">Print / Save PDF</button>'
    + '<button onclick="window.close()" style="background:#eee;color:#333;border:none;border-radius:8px;padding:9px 22px;font-size:13px;cursor:pointer">Close</button>'
    + '</div></body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(function() { URL.revokeObjectURL(url); }, 15000);
}

// ── Paywall ────────────────────────────────────────────────────────
function showPaywall() {
  var modal = document.getElementById('paywall-modal');
  if (modal) modal.classList.add('open');
}

function paywallSubmit() {
  var input = document.querySelector('#paywall-modal input[type=email]');
  if (!input || !input.value.includes('@')) return;

  var emails = JSON.parse(localStorage.getItem('dl_emails') || '[]');
  if (!emails.includes(input.value)) {
    emails.push(input.value);
    localStorage.setItem('dl_emails', JSON.stringify(emails));
  }
  localStorage.setItem('dl_uses', '0');

  document.getElementById('paywall-confirm').style.display = 'block';
  document.getElementById('paywall-form').style.display    = 'none';
  setTimeout(function() {
    var modal = document.getElementById('paywall-modal');
    if (modal) modal.classList.remove('open');
  }, 2000);
}
