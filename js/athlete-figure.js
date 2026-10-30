/* DugoutLab Athlete Plan: animated move figures.
   A side-view figure drawn in SVG and animated between key poses. Facing right.
   Angles are absolute segment directions in degrees: 0 = straight down, 90 = forward (right),
   180 = straight up, -90 = back. The figure is set on the ground automatically by its lowest point
   (feet, hands, knees or head), so planks, push-ups and lunges land where they should.
   Pose keys:
     t torso (hip to shoulder)   n head tilt add-on
     a1 a2  near arm upper, fore      b1 b2  far arm upper, fore
     l1 l2 lf  near leg thigh, shin, foot      r1 r2 rf  far leg thigh, shin, foot
     x hip shift forward in px    air lift off the ground in px
   A move: { keys: [pose, pose, ...], ms: time per transition, hold: ms pause on each key, box: true,
     ball: true, band: true, mirror: 'shuffle' } */
window.DL_FIG = (function () {
  'use strict';
  var LEN = { t: 50, a1: 27, a2: 25, l1: 40, l2: 38, lf: 13, head: 9, neck: 6 };
  var STAND = { t: 180, n: 0, a1: 4, a2: 8, b1: -4, b2: 4, l1: 2, l2: 0, lf: 90, r1: -2, r2: 0, rf: 90, x: 0, air: 0 };
  function P(o) { var p = {}; for (var k in STAND) p[k] = STAND[k]; for (var j in o) p[j] = o[j]; return p; }
  function rad(a) { return a * Math.PI / 180; }
  function step(pt, a, len) { return [pt[0] + Math.sin(rad(a)) * len, pt[1] + Math.cos(rad(a)) * len]; }
  function joints(p) {
    var hip = [p.x, 0], sh = step(hip, p.t, LEN.t), head = step(sh, p.t + (p.n || 0), LEN.neck + LEN.head);
    var e1 = step(sh, p.a1, LEN.a1), h1 = step(e1, p.a2, LEN.a2), e2 = step(sh, p.b1, LEN.a1), h2 = step(e2, p.b2, LEN.a2);
    var k1 = step(hip, p.l1, LEN.l1), an1 = step(k1, p.l2, LEN.l2), t1 = step(an1, p.lf, LEN.lf);
    var k2 = step(hip, p.r1, LEN.l1), an2 = step(k2, p.r2, LEN.l2), t2 = step(an2, p.rf, LEN.lf);
    var pts = { hip: hip, sh: sh, head: head, e1: e1, h1: h1, e2: e2, h2: h2, k1: k1, an1: an1, t1: t1, k2: k2, an2: an2, t2: t2 };
    var low = -1e9; ['h1', 'h2', 'k1', 'k2', 'an1', 'an2', 't1', 't2'].forEach(function (k) { low = Math.max(low, pts[k][1]); });
    low = Math.max(low, head[1] + LEN.head);
    var dy = -low - (p.air || 0);
    for (var k in pts) pts[k] = [pts[k][0], pts[k][1] + dy];
    return pts;
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function mix(a, b, t) { var o = {}; for (var k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; }

  var M = {};
  function def(ids, keys, opt) { opt = opt || {}; opt.keys = keys.map(P); [].concat(ids).forEach(function (id) { M[id] = opt; }); }

  /* poses used often */
  var squatLow = { t: 148, a1: 80, a2: 85, b1: 76, b2: 82, l1: 82, l2: -22, r1: 78, r2: -24 };
  var athletic = { t: 160, a1: 30, a2: 60, b1: 26, b2: 56, l1: 30, l2: -14, r1: 26, r2: -16 };
  var plankHigh = { t: 97, a1: 2, a2: 0, b1: -2, b2: -2, l1: -84, l2: -84, lf: 4, r1: -86, r2: -86, rf: 2, n: -4 };
  var pushLow = { t: 92, a1: -128, a2: 20, b1: -132, b2: 16, l1: -88, l2: -88, lf: 4, r1: -90, r2: -90, rf: 2, n: -2 };
  var plankElbow = { t: 95, a1: 0, a2: 90, b1: -4, b2: 86, l1: -85, l2: -85, lf: 4, r1: -87, r2: -87, rf: 2, n: -4 };

  /* squat pattern */
  def(['squat', 'statue', 'goblet', 'wb-squat'], [{ a1: 70, a2: 80, b1: 66, b2: 76 }, squatLow], { ms: 900, hold: 300 });
  def(['split', 'rev-lunge'], [{ l1: 22, l2: 0, r1: -26, r2: -6, rf: 90 }, { t: 178, l1: 82, l2: 4, r1: -18, r2: -96, rf: 20 }], { ms: 900, hold: 250 });
  def(['lunge-slow'], [{ l1: 22, l2: 0, r1: -26, r2: -6 }, { t: 176, l1: 84, l2: 4, r1: -16, r2: -96, rf: 20, x: 8 }], { ms: 1000, hold: 200 });
  def(['stepup'], [{ l1: 88, l2: 0, lf: 90 }, { x: 36, l1: 2, l2: 0, r1: -30, r2: -40, air: 38 }], { ms: 900, hold: 250, box: [28, 34, 38] });
  def(['wallsit'], [{ t: 180, a1: 0, a2: 0, b1: 0, b2: 0, l1: 90, l2: 0, r1: 88, r2: 0 }, { t: 180, a1: 0, a2: 0, b1: 0, b2: 0, l1: 90, l2: 0, r1: 88, r2: 0 }], { ms: 1500, hold: 0, wallBack: true });

  /* push */
  def(['pushup', 'hi5', 'hr-pushup', 'slow-pushup', 'tap-pushup'], [plankHigh, pushLow], { ms: 900, hold: 200 });
  def(['plank', 'plankgame'], [plankElbow, plankElbow], { ms: 1500, hold: 0 });
  def(['bearhold'], [{ t: 92, a1: 0, a2: 0, b1: -2, b2: -2, l1: 4, l2: -84, lf: 10, r1: 0, r2: -86, rf: 8 }, { t: 92, a1: 0, a2: 0, b1: -2, b2: -2, l1: 4, l2: -84, lf: 10, r1: 0, r2: -86, rf: 8 }], { ms: 1500 });

  /* pull and hinge */
  def(['tablerow', 'invrow'], [{ t: 78, n: 10, a1: 172, a2: 172, b1: 170, b2: 170, l1: -100, l2: -100, lf: -180, r1: -101, r2: -101, rf: -181 }, { t: 66, n: 10, a1: 228, a2: 140, b1: 226, b2: 138, l1: -112, l2: -112, lf: -190, r1: -113, r2: -113, rf: -191 }], { ms: 900, hold: 250, barHands: true });
  def(['superman-pull', 'superman'], [{ t: 92, a1: 92, a2: 92, b1: 90, b2: 90, l1: -90, l2: -90, lf: -175, r1: -92, r2: -92, rf: -176, n: 0 }, { t: 98, a1: -40, a2: 60, b1: -44, b2: 56, l1: -96, l2: -96, lf: -175, r1: -98, r2: -98, rf: -176, n: 6 }], { ms: 900, hold: 300 });
  def(['bridge'], [{ t: -88, a1: -92, a2: -92, b1: -90, b2: -90, l1: 60, l2: -10, lf: 90, r1: 58, r2: -12, rf: 90, n: 0 }, { t: -70, a1: -92, a2: -92, b1: -90, b2: -90, l1: 98, l2: -2, lf: 90, r1: 96, r2: -4, rf: 90 }], { ms: 900, hold: 300 });
  def(['airplane', 'rdl-reach', 'sl-rdl'], [{}, { t: 96, a1: 10, a2: 10, b1: 6, b2: 6, l1: 4, l2: -6, r1: -84, r2: -86, rf: -170 }], { ms: 1100, hold: 300 });
  def(['bandgm', 'db-rdl'], [{}, { t: 110, a1: 22, a2: 22, b1: 18, b2: 18, l1: -6, l2: 0, r1: -8, r2: -2 }], { ms: 1000, hold: 250 });

  /* core */
  def(['deadbug', 'beetle'], [{ t: -90, a1: 180, a2: 180, b1: 180, b2: 180, l1: 180, l2: 90, lf: 180, r1: 180, r2: 90, rf: 180 }, { t: -90, a1: -92, a2: -92, b1: 180, b2: 180, l1: 180, l2: 90, lf: 180, r1: 92, r2: 92, rf: 180 }], { ms: 1000, hold: 250 });
  def(['birddog'], [{ t: 92, a1: 0, a2: 0, b1: 0, b2: 0, l1: 0, l2: -90, lf: -175, r1: 0, r2: -90, rf: -175 }, { t: 92, a1: 92, a2: 92, b1: 0, b2: 0, l1: 0, l2: -90, lf: -175, r1: -92, r2: -92, rf: -170 }], { ms: 1000, hold: 400 });
  def(['hollow'], [{ t: -78, a1: -110, a2: -110, b1: -110, b2: -110, l1: 78, l2: 78, lf: 140, r1: 78, r2: 78, rf: 140 }, { t: -78, a1: -110, a2: -110, b1: -110, b2: -110, l1: 78, l2: 78, lf: 140, r1: 78, r2: 78, rf: 140 }], { ms: 1500 });

  /* jumps and landings */
  def(['pogo', 'pogo-low', 'ankle-bounce', 'pogo-fb', 'pogo-ss', 'line-hops', 'rope', 'rope-easy', 'test-pogo20'], [{ a1: 14, a2: 40, b1: 10, b2: 36, lf: 70, rf: 70 }, { a1: 14, a2: 40, b1: 10, b2: 36, lf: 10, rf: 10, air: 14 }], { ms: 260, hold: 0 });
  def(['sqj-stick', 'land-ko', 'drop-freeze', 'land-drop', 'land-snap', 'snap'], [{}, { t: 158, a1: -50, a2: -40, b1: -54, b2: -44, l1: 54, l2: -20, r1: 50, r2: -22 }, { a1: 170, a2: 175, b1: 166, b2: 172, lf: 20, rf: 20, air: 30 }, athletic, athletic], { ms: 380, hold: 150 });
  def(['broad-stick', 'test-broad'], [{ x: 0 }, { t: 145, a1: -60, a2: -50, b1: -64, b2: -54, l1: 60, l2: -24, r1: 56, r2: -26, x: 0 }, { t: 150, a1: 120, a2: 130, b1: 116, b2: 126, l1: 30, l2: -40, lf: 60, r1: 26, r2: -44, rf: 60, air: 34, x: 50 }, { t: 155, a1: 60, a2: 70, b1: 56, b2: 66, l1: 60, l2: -18, r1: 56, r2: -20, x: 100 }, { t: 155, a1: 60, a2: 70, b1: 56, b2: 66, l1: 60, l2: -18, r1: 56, r2: -20, x: 100 }], { ms: 420, hold: 120, line: true });
  var athl2 = { t: 160, a1: 30, a2: 60, b1: 26, b2: 56, l1: 30, l2: -14, r1: 26, r2: -16, x: 62 };
  def(['step-stick', 'stepdown', 'stepdown-nj'], [{ x: 0, air: 32 }, { l1: 40, l2: -6, r1: 4, r2: 0, x: 30, air: 22 }, athl2, athl2], { ms: 520, hold: 150, box: [-22, 44, 32] });
  def(['wall-march'], [{ t: 128, a1: 140, a2: 140, b1: 136, b2: 136, l1: -40, l2: -40, r1: -40, r2: -40, lf: 40, rf: 40 }, { t: 128, a1: 140, a2: 140, b1: 136, b2: 136, l1: 70, l2: -10, lf: 100, r1: -40, r2: -40, rf: 40 }], { ms: 500, hold: 150, wallHands: true });

  /* balance */
  def(['bal-eyes', 'bal-closed', 'test-balance', 'bal2'], [{ a1: 40, a2: 40, b1: 36, b2: 36, r1: 70, r2: -10, rf: 100 }, { a1: 42, a2: 42, b1: 38, b2: 38, r1: 72, r2: -8, rf: 100 }], { ms: 1400, hold: 0 });
  def(['test-plank'], [plankElbow, plankElbow], { ms: 1500 });
  def(['test-push30'], [plankHigh, pushLow], { ms: 500, hold: 60 });

  /* ---------- render ---------- */
  function seg(a, b, w, c) { return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"/>'; }
  function draw(p, opt) {
    var j = joints(p), far = 'var(--fig-far, #6f8f74)', near = 'var(--fig, #f4efe6)', acc = 'var(--fig-acc, #C8862E)', s = '';
    s += seg(j.hip, j.k2, 9, far) + seg(j.k2, j.an2, 8, far) + seg(j.an2, j.t2, 6, far);
    s += seg(j.sh, j.e2, 7, far) + seg(j.e2, j.h2, 6, far);
    s += seg(j.hip, j.sh, 12, near);
    s += '<circle cx="' + j.head[0].toFixed(1) + '" cy="' + j.head[1].toFixed(1) + '" r="' + LEN.head + '" fill="' + near + '"/>';
    s += seg(j.hip, j.k1, 10, near) + seg(j.k1, j.an1, 9, near) + seg(j.an1, j.t1, 7, acc);
    s += seg(j.sh, j.e1, 8, near) + seg(j.e1, j.h1, 7, near);
    return s;
  }
  function props(m) {
    var c = 'var(--fig-far, #6f8f74)', s = '';
    if (m.box) s += '<rect x="' + m.box[0] + '" y="' + (-m.box[2]) + '" width="' + m.box[1] + '" height="' + m.box[2] + '" rx="3" fill="none" stroke="' + c + '" stroke-width="2.5"/>';
    if (m.barHands) { var h = joints(m.keys[0]).h1; s += '<line x1="' + (h[0] - 40).toFixed(1) + '" y1="' + h[1].toFixed(1) + '" x2="' + (h[0] + 40).toFixed(1) + '" y2="' + h[1].toFixed(1) + '" stroke="' + c + '" stroke-width="5" stroke-linecap="round"/>'; }
    if (m.wallHands) { var w = joints(m.keys[0]).h1; s += '<line x1="' + (w[0] + 4).toFixed(1) + '" y1="0" x2="' + (w[0] + 4).toFixed(1) + '" y2="-195" stroke="' + c + '" stroke-width="5"/>'; }
    if (m.wallBack) s += '<line x1="-8" y1="0" x2="-8" y2="-195" stroke="' + c + '" stroke-width="5"/>';
    if (m.line) s += '<line x1="12" y1="-5" x2="12" y2="5" stroke="var(--fig-acc, #C8862E)" stroke-width="3"/>';
    return s;
  }
  function frame(move, t) {
    var k = move.keys, n = k.length, ms = move.ms || 800, hold = move.hold || 0, per = ms + hold, total = per * n;
    var tt = t % total, i = Math.floor(tt / per), r = tt - i * per;
    var f = r < hold ? 0 : ease((r - hold) / ms);
    return mix(k[i], k[(i + 1) % n], f);
  }
  function svg(id, w) {
    var m = M[id]; if (!m) return null;
    var host = document.createElement('div');
    host.className = 'fig';
    host.innerHTML = '<svg viewBox="-110 -200 260 210" width="100%" role="img" aria-label="Animated demo"><line x1="-110" y1="0" x2="150" y2="0" stroke="var(--fig-ground, rgba(244,239,230,0.25))" stroke-width="2"/>' + props(m) + '<g class="body"></g></svg>';
    var g = host.querySelector('.body'), start = null, raf = null, reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    function tick(ts) { if (!host.isConnected && start !== null) { cancelAnimationFrame(raf); return; } if (start === null) start = ts; g.innerHTML = draw(frame(m, ts - start)); raf = requestAnimationFrame(tick); }
    if (reduce) g.innerHTML = draw(m.keys[m.keys.length > 2 ? 1 : 1]); else raf = requestAnimationFrame(tick);
    return host;
  }
  function has(id) { return !!M[id]; }
  return { has: has, svg: svg, draw: draw, frame: frame, props: props, moves: M };
})();
