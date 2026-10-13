// DUGOUTLAB: POD ROTATION ENGINE
// Pure function. No DOM. Builds a pod-based inning-by-inning lineup.
// Rules:
//  - Right pod covers 1B/2B/RF/CF, left pod covers 3B/SS/LF.
//  - Pitcher and catcher step out of their pod for their turn.
//  - The inning before a pitcher throws, they sit to get loose ("warm").
//  - Nobody sits back-to-back innings (warm counts as sitting).
//  - New field spot each inning. Only P and C may repeat.
//  - Sits spread as evenly as possible.

var PODS = {
  right: ['1B', '2B', 'RF', 'CF'],
  left:  ['3B', 'SS', 'LF']
};

// Expand an ordered plan [{name, innings}] into a per-inning array.
// Rows are an order, not a clock.
function expandPlan(plan, innings) {
  var out = [];
  plan.forEach(function (row) {
    var n = parseInt(row.innings, 10) || 0;
    for (var i = 0; i < n && out.length < innings; i++) out.push(row.name);
  });
  while (out.length < innings) out.push(null);
  return out;
}

// Default pod split: right pod gets ~4/7 of the roster.
function autoSplit(names) {
  var rightN = Math.round(names.length * 4 / 7);
  var pods = {};
  names.forEach(function (n, i) { pods[n] = i < rightN ? 'right' : 'left'; });
  return pods;
}

function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function buildPods(cfg) {
  // cfg: { players:[names], pods:{name:'right'|'left'}, innings, pitchers:[...per inning], catchers:[...per inning], swap:bool }
  var names = cfg.players.slice();
  var inn = cfg.innings;
  var pod = {};
  names.forEach(function (n) {
    var p = cfg.pods[n] || 'right';
    pod[n] = cfg.swap ? (p === 'right' ? 'left' : 'right') : p;
  });
  var inRoster = function (n) { return n && cfg.players.indexOf(n) !== -1 ? n : null; };
  var P = cfg.pitchers.map(inRoster), C = cfg.catchers.map(inRoster);
  // Keep pod sizes at the right ratio after a swap: move extras into the short pod.
  var target = Math.round(names.length * 4 / 7);
  var rightNames = names.filter(function (n) { return pod[n] === 'right'; });
  var leftNames = names.filter(function (n) { return pod[n] === 'left'; });
  var moved = [];
  while (rightNames.length < target && leftNames.length) {
    var m = leftNames.pop(); pod[m] = 'right'; rightNames.push(m); moved.push(m);
  }
  while (rightNames.length > target && rightNames.length) {
    var m2 = rightNames.pop(); pod[m2] = 'left'; leftNames.push(m2); moved.push(m2);
  }

  var best = null;
  for (var attempt = 0; attempt < 400; attempt++) {
    var r = tryBuild(names, pod, inn, P, C);
    if (!best || r.score < best.score) best = r;
    if (best.score === 0) break;
  }
  best.pod = pod;
  best.moved = moved;
  return best;
}

function tryBuild(names, pod, inn, P, C) {
  var grid = {}; names.forEach(function (n) { grid[n] = []; });
  var sits = {}; names.forEach(function (n) { sits[n] = 0; });
  var score = 0, flags = [];

  for (var i = 0; i < inn; i++) {
    var used = {};
    if (P[i]) { grid[P[i]][i] = 'P'; used[P[i]] = 1; }
    if (C[i] && !used[C[i]]) { grid[C[i]][i] = 'C'; used[C[i]] = 1; }
    var nextP = P[i + 1];
    if (nextP && nextP !== P[i] && !used[nextP]) { grid[nextP][i] = 'warm'; used[nextP] = 1; sits[nextP]++; }

    ['right', 'left'].forEach(function (side) {
      var spots = PODS[side];
      var avail = names.filter(function (n) { return !used[n] && pod[n] === side; });
      var need = spots.length;
      var chosen;
      if (avail.length < need) {
        // borrow from the other pod's spare players
        var other = names.filter(function (n) { return !used[n] && pod[n] !== side; });
        shuffle(other);
        other.sort(function (a, b) { return sits[a] - sits[b]; });
        chosen = avail.concat(other.slice(0, need - avail.length));
        score += 50;
      } else {
        // pick who sits: must not have sat last inning; fewest sits first
        shuffle(avail);
        avail.sort(function (a, b) {
          var la = isSit(grid[a][i - 1]) ? 1 : 0, lb = isSit(grid[b][i - 1]) ? 1 : 0;
          if (la !== lb) return lb - la; // sat last inning -> must play
          return sits[b] - sits[a];        // more sits -> play
        });
        chosen = avail.slice(0, need);
      }
      chosen.forEach(function (n) { used[n] = 1; });

      // assign spots, avoiding repeat of last inning's spot
      var bestPerm = null, bestPen = 1e9;
      for (var t = 0; t < 30; t++) {
        var perm = shuffle(spots.slice());
        var pen = 0;
        chosen.forEach(function (n, k) {
          if (grid[n][i - 1] === perm[k]) pen += 10;
          pen += countOf(grid[n], perm[k]);
        });
        if (pen < bestPen) { bestPen = pen; bestPerm = perm; }
        if (pen === 0) break;
      }
      chosen.forEach(function (n, k) { grid[n][i] = bestPerm[k]; });
      score += bestPen;
    });

    names.forEach(function (n) {
      if (!used[n]) { grid[n][i] = 'sit'; sits[n]++; }
    });
  }

  // penalties: back-to-back sits, uneven sits
  names.forEach(function (n) {
    for (var i = 1; i < inn; i++) if (isSit(grid[n][i]) && isSit(grid[n][i - 1])) score += 100;
  });
  var vals = names.map(function (n) { return sits[n]; });
  score += (Math.max.apply(null, vals) - Math.min.apply(null, vals)) * 5;
  return { grid: grid, sits: sits, score: score, flags: flags };
}

function isSit(v) { return v === 'sit' || v === 'warm'; }
function countOf(arr, v) { var c = 0; arr.forEach(function (x) { if (x === v) c++; }); return c; }

function auditPods(res, names, inn) {
  var flags = [];
  names.forEach(function (n) {
    var g = res.grid[n];
    for (var i = 1; i < inn; i++) {
      if (isSit(g[i]) && isSit(g[i - 1])) flags.push(n + ' sits back-to-back (innings ' + i + ' and ' + (i + 1) + ').');
      if (g[i] === g[i - 1] && g[i] !== 'P' && g[i] !== 'C' && !isSit(g[i])) flags.push(n + ' repeats ' + g[i] + ' in innings ' + i + ' and ' + (i + 1) + '.');
    }
  });
  return flags;
}

if (typeof module !== 'undefined') module.exports = { buildPods: buildPods, expandPlan: expandPlan, autoSplit: autoSplit, auditPods: auditPods };
