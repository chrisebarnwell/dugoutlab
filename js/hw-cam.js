/* Hit Window auto camera. Phone on a tripod behind the hitter, pointed at the net.
   Finds the ball in each frame, follows it, and calls the target it hit.
   Ball-tracking, not net movement: a ball is a small blob that moves frame to frame.
   Three-frame difference isolates the ball's current spot; a short track with a sharp
   slowdown or turn is the impact; the impact point is matched to the target boxes. */
(function (root) {
  var ZONES = ['ll', 'lg', 'mid', 'rg', 'rl'];
  var ZN = { ll: 'Left line', lg: 'Left gap', mid: 'Middle', rg: 'Right gap', rl: 'Right line', miss: 'Miss' };
  var DEFAULT = {
    boxes: { ll: [0.03, 0.30, 0.17, 0.26], lg: [0.22, 0.20, 0.17, 0.22], mid: [0.415, 0.14, 0.17, 0.22], rg: [0.61, 0.20, 0.17, 0.22], rl: [0.80, 0.30, 0.17, 0.26] },
    hitter: [0.30, 0.58, 0.40, 0.42],
    sens: 3
  };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- pure tracker (testable in node) ---------- */
  function Tracker(w, h, cfg) {
    this.w = w; this.h = h; this.cfg = cfg;
    this.f0 = null; this.f1 = null; this.tracks = []; this.cool = 0; this.frame = 0; this.last = null;
    this.buildMask();
  }
  Tracker.prototype.buildMask = function () {
    var w = this.w, h = this.h, m = new Uint8Array(w * h), hb = this.cfg.hitter;
    if (hb) for (var y = Math.floor(hb[1] * h); y < Math.min(h, Math.ceil((hb[1] + hb[3]) * h)); y++)
      for (var x = Math.floor(hb[0] * w); x < Math.min(w, Math.ceil((hb[0] + hb[2]) * w)); x++) m[y * w + x] = 1;
    this.mask = m;
    this.thr = [0, 44, 36, 28, 22, 16][this.cfg.sens || 3] || 28;
  };
  /* gray: Uint8Array w*h. Returns a shot {zone, contact, path, impact} when one finishes, else null. */
  Tracker.prototype.push = function (gray) {
    var w = this.w, h = this.h, n = w * h, out = null;
    this.frame++;
    if (!this.f0 || !this.f1) { this.f0 = this.f1; this.f1 = gray; return null; }
    var a = this.f0, b = this.f1, c = gray, thr = this.thr, lo = thr * 0.6, anyN = 0, mv = new Uint8Array(n), any = new Uint8Array(n), cnt = 0, i;
    for (i = 0; i < n; i++) {
      if (this.mask[i]) continue;
      var d1 = c[i] - b[i], d2 = c[i] - a[i], m1 = d1 > thr || d1 < -thr;
      /* Lenient copy for the isolation test, so faint edges of a moving body still count against it. */
      if (d1 > lo || d1 < -lo) { any[i] = 1; anyN++; }
      if (m1 && (d2 > thr || d2 < -thr)) { mv[i] = 1; cnt++; }
    }
    this.any = any; this.anyRate = anyN / n;
    this.f0 = this.f1; this.f1 = gray;
    if (this.cool > 0) { this.cool--; this.tracks = []; return null; }
    /* Whole-frame change: camera bumped or lights flickered. Drop everything. */
    if (cnt > n * 0.06) { this.tracks = []; this.cool = 4; return null; }
    var blobs = cnt ? this.blobs(this.dilate(mv)) : [];
    out = this.step(blobs);
    return out;
  };
  /* Grow the motion mask by one pixel so a broken-up edge (a person walking, a swaying net) joins into one big shape that gets rejected. */
  Tracker.prototype.dilate = function (mv) {
    var w = this.w, h = this.h, o = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!mv[y * w + x]) continue;
      for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= h) continue; for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx >= 0 && xx < w) o[yy * w + xx] = 1; } }
    }
    return o;
  };
  /* A ball is alone in the air: little other change right around it. A body or swaying net has change spilling past the blob. */
  Tracker.prototype.isolated = function (x0, y0, x1, y1, area) {
    var w = this.w, h = this.h, any = this.any, r = 6, out = 0, win = 0;
    for (var y = Math.max(0, y0 - r); y <= Math.min(h - 1, y1 + r); y++)
      for (var x = Math.max(0, x0 - r); x <= Math.min(w - 1, x1 + r); x++)
        if (x < x0 || x > x1 || y < y0 || y > y1) { win++; if (any[y * w + x]) out++; }
    /* Allow for the camera's own grain: the frame-wide rate of faint change. */
    return out <= area * 0.8 + 4 + 2.5 * this.anyRate * win;
  };
  Tracker.prototype.blobs = function (mv) {
    var w = this.w, h = this.h, seen = new Uint8Array(w * h), list = [], stack = [], maxA = Math.max(30, w * h * 0.004);
    for (var s = 0; s < mv.length; s++) {
      if (!mv[s] || seen[s]) continue;
      var sx = 0, sy = 0, area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      stack.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        var p = stack.pop(), x = p % w, y = (p - x) / w;
        sx += x; sy += y; area++;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var q = ny * w + nx;
          if (mv[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      var bw = maxx - minx + 1, bh = maxy - miny + 1;
      /* Ball-shaped: small, not a long sliver (net strands, bat). Motion blur can stretch it 4x. */
      if (area >= 6 && area <= maxA && Math.max(bw, bh) <= 4 * Math.min(bw, bh) + 3 && this.isolated(minx, miny, maxx, maxy, area)) list.push({ x: sx / area, y: sy / area, a: area });
    }
    return list.length > 20 ? [] : list;
  };
  Tracker.prototype.step = function (blobs) {
    var used = {}, w = this.w, done = null, self = this;
    this.tracks.forEach(function (t) {
      var p = t.pts[t.pts.length - 1], v = t.pts.length > 1 ? { x: p.x - t.pts[t.pts.length - 2].x, y: p.y - t.pts[t.pts.length - 2].y } : { x: 0, y: 0 };
      var px = p.x + v.x * (t.miss + 1), py = p.y + v.y * (t.miss + 1);
      /* A one-point track does not know its speed yet: a hard-hit ball can jump a quarter of the frame. It must be climbing. */
      var fresh = t.pts.length === 1, gate = fresh ? w * 0.3 : Math.max(w * 0.07, Math.sqrt(v.x * v.x + v.y * v.y) * 1.6 + w * 0.03), best = -1, bd = 1e9;
      blobs.forEach(function (bl, k) { if (used[k]) return; if (fresh && bl.y > p.y - 1) return; var d = Math.hypot(bl.x - px, bl.y - py); if (d < gate && d < bd) { bd = d; best = k; } });
      if (best >= 0) { used[best] = fresh ? 1 : 2; t.pts.push({ x: blobs[best].x, y: blobs[best].y, f: self.frame }); t.miss = 0; }
      else t.miss++;
    });
    var alive = [];
    this.tracks.forEach(function (t) {
      if (t.miss <= 2) { alive.push(t); return; }
      var shot = self.judge(t);
      if (shot && (!done || shot.path.length > done.path.length)) done = shot;
    });
    /* Every blob also seeds its own track, so a stray speck cannot steal the start of a real flight. */
    blobs.forEach(function (bl, k) { if (alive.length < 12 && !(used[k] === 2)) alive.push({ pts: [{ x: bl.x, y: bl.y, f: self.frame }], miss: 0 }); });
    this.tracks = alive;
    if (done) { this.tracks = []; this.cool = 12; this.last = done; }
    return done;
  };
  /* A stray speck can latch onto the front of a real flight. If the whole track fails, try it without its first point or two. */
  Tracker.prototype.judge = function (t) {
    for (var k = 0; k < 3 && t.pts.length - k >= 3; k++) { var r = this.judgePts(t.pts.slice(k)); if (r) return r; }
    return null;
  };
  /* Is this track a hit ball? Where did it hit? */
  Tracker.prototype.judgePts = function (P) {
    var w = this.w, h = this.h;
    if (P.length < 3) return null;
    /* Impact: first point where the ball slows hard or turns more than about 70 degrees. Anything after is the ball dropping off the net. */
    var imp = P.length - 1, vmax = 0;
    for (var i = 1; i < P.length; i++) {
      var vx = P[i].x - P[i - 1].x, vy = P[i].y - P[i - 1].y, sp = Math.hypot(vx, vy) / Math.max(1, P[i].f - P[i - 1].f);
      if (i >= 2) {
        var ux = P[i - 1].x - P[i - 2].x, uy = P[i - 1].y - P[i - 2].y, cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
        if ((sp < vmax * 0.35 || cos < 0.35) && i >= 2) { imp = i - 1; break; }
      }
      if (sp > vmax) vmax = sp;
    }
    var ip = P[imp], nx = ip.x / w, ny = ip.y / h, B = this.cfg.boxes, zone = 'miss', bestD = 1e9;
    /* A hit ball travels away from the camera, so it climbs the screen. Dropping balls and rollers go down: ignore them. */
    /* A hit ball comes off the bat: the flight has to start near the hitter. */
    var hb = this.cfg.hitter;
    if (hb) { var sx0 = P[0].x / w, sy0 = P[0].y / h; if (sx0 < hb[0] - 0.2 || sx0 > hb[0] + hb[2] + 0.2 || sy0 < hb[1] - 0.3) return null; }
    var avg = Math.hypot(ip.x - P[0].x, ip.y - P[0].y) / Math.max(1, ip.f - P[0].f);
    if (avg < w * 0.025) return null;
    /* Coherent flight: every step before impact heads the same way as the whole flight, and climbs. */
    var gx = ip.x - P[0].x, gy = ip.y - P[0].y, gl = Math.hypot(gx, gy) || 1;
    for (i = 1; i <= imp; i++) {
      var sx = P[i].x - P[i - 1].x, sy = P[i].y - P[i - 1].y, sl = Math.hypot(sx, sy) || 1;
      if ((sx * gx + sy * gy) / (sl * gl) < 0.75 || sy > 1) return null;
    }
    if (imp < 2 || (P[0].y - ip.y) / h < 0.05 || Math.hypot(ip.x - P[0].x, ip.y - P[0].y) < w * 0.08) return null;
    ZONES.forEach(function (z) {
      var b = B[z]; if (!b) return;
      var padx = b[2] * 0.15, pady = b[3] * 0.15;
      if (nx >= b[0] - padx && nx <= b[0] + b[2] + padx && ny >= b[1] - pady && ny <= b[1] + b[3] + pady) {
        var d = Math.hypot(nx - (b[0] + b[2] / 2), ny - (b[1] + b[3] / 2));
        if (d < bestD) { bestD = d; zone = z; }
      }
    });
    /* Contact type from where the ball met the net, against the band the targets hang in. */
    var top = 1, bot = 0;
    ZONES.forEach(function (z) { var b = B[z]; if (!b) return; top = Math.min(top, b[1]); bot = Math.max(bot, b[1] + b[3]); });
    var peak = 1; for (i = 0; i <= imp; i++) peak = Math.min(peak, P[i].y / h);
    var band = Math.max(0.05, bot - top), contact = 'ld';
    if (peak < top - band * 0.9 || peak < 0.03) contact = 'pu';
    else if (ny < top - band * 0.15 || peak < top - band * 0.35) contact = 'fb';
    else if (ny > bot + band * 0.15) contact = 'gb';
    return { zone: zone, contact: zone === 'miss' ? null : contact, impact: { x: nx, y: ny }, path: P.slice(0, imp + 1).map(function (p) { return { x: p.x / w, y: p.y / h }; }) };
  };

  root.HWCamCore = { Tracker: Tracker, DEFAULT: DEFAULT, ZONES: ZONES };
  if (typeof document === 'undefined') return;

  /* ---------- browser UI ---------- */
  var CSS = '' +
    '.hwc{margin-bottom:0.8rem}' +
    '.hwc-bar{display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem}' +
    '.hwc-bar button{background:transparent;border:1.5px solid var(--rule);color:var(--ink-soft);border-radius:999px;padding:0.45rem 0.9rem;font-family:var(--sans);font-size:0.85rem;font-weight:600;min-height:40px}' +
    '.hwc-bar button.go{background:var(--gold);color:var(--forest-deep);border-color:var(--gold)}' +
    '.hwc-bar .st{font-size:0.78rem;color:var(--ink-faint);margin-left:auto;font-family:var(--mono);letter-spacing:0.04em}' +
    '.hwc-bar .st.live{color:#7ad6a8}' +
    '.hwc-view{position:relative;border-radius:12px;overflow:hidden;background:#000;border:1px solid var(--rule);touch-action:none}' +
    '.hwc-view video{display:block;width:100%;height:auto}' +
    '.hwc-view canvas{position:absolute;inset:0;width:100%;height:100%}' +
    '.hwc-flash{position:absolute;left:0;right:0;top:40%;text-align:center;font-family:var(--serif);font-weight:700;font-size:clamp(1.8rem,9vw,3.2rem);color:var(--gold);text-shadow:0 2px 16px #000;opacity:0;transition:opacity .15s;pointer-events:none}' +
    '.hwc-flash.on{opacity:1}' +
    '.hwc-set{display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.5rem;align-items:center;font-size:0.8rem;color:var(--ink-soft)}' +
    '.hwc-set label{display:flex;align-items:center;gap:0.4rem}' +
    '.hwc-set input[type=range]{accent-color:var(--gold)}' +
    '.hwc-tip{font-size:0.8rem;color:var(--ink-faint);line-height:1.45;margin-top:0.45rem}' +
    '.hwc-manual-hide .net-grid,.hwc-manual-hide .kind,.hwc-manual-hide .kind-row{display:none}.hwc-manual-hide .net{border-style:solid;padding:0.4rem}' +
    '.hwc-fix{display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.45rem;align-items:center;font-size:0.8rem;color:var(--ink-soft)}' +
    '.hwc-fix button{background:transparent;border:1px solid var(--rule);color:var(--ink-soft);border-radius:8px;padding:0.35rem 0.6rem;font-size:0.78rem;font-family:var(--sans);min-height:36px}';

  function load() { try { var c = JSON.parse(localStorage.getItem('dl_hw_cam') || 'null'); if (c && c.boxes) return c; } catch (e) {} return clone(DEFAULT); }
  function save(c) { try { localStorage.setItem('dl_hw_cam', JSON.stringify(c)); } catch (e) {} }

  /* opts: host (element to put the camera panel in), card (element whose manual pad hides while auto runs),
     active() -> bool, onShot(zone, contact), onFix(zone) to replace the last auto call */
  function mount(opts) {
    if (!document.getElementById('hwc-css')) { var st = document.createElement('style'); st.id = 'hwc-css'; st.textContent = CSS; document.head.appendChild(st); }
    var cfg = load(), el = document.createElement('div');
    el.className = 'hwc';
    el.innerHTML = '<div class="hwc-bar"><button type="button" class="go" data-a="on">Auto camera</button><button type="button" data-a="setup" class="hidden">Line up targets</button><button type="button" data-a="pad" class="hidden">Show buttons</button><span class="st"></span></div>' +
      '<div class="hwc-view hidden"><video playsinline muted autoplay></video><canvas></canvas><div class="hwc-flash"></div></div>' +
      '<div class="hwc-set hidden"><span>Drag each box onto its target. Drag the corner to resize. The HITTER box is ignored.</span><label>Sensitivity <input type="range" min="1" max="5" step="1"></label><button type="button" data-a="done" class="btn btn-primary btn-sm">Done</button><button type="button" data-a="reset" class="btn btn-outline btn-sm">Reset boxes</button></div>' +
      '<div class="hwc-fix hidden"></div>' +
      '<div class="hwc-tip hidden">Tripod behind the hitter, the whole net in view, same spot every time. Bright ball, steady light. Wrong call? Tap the right target below it.</div>';
    opts.host.insertBefore(el, opts.host.firstChild);
    var q = function (s) { return el.querySelector(s); };
    var video = q('video'), cv = q('canvas'), ctx = cv.getContext('2d'), view = q('.hwc-view'), stEl = q('.st'), flash = q('.hwc-flash');
    var work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
    var stream = null, tracker = null, running = false, setup = false, padShown = false, fps = 0, fpsN = 0, fpsT = 0, trail = null, trailT = 0;
    q('input[type=range]').value = cfg.sens || 3;

    function status(t, live) { stEl.textContent = t; stEl.classList.toggle('live', !!live); }
    function btn(a) { return q('[data-a=' + a + ']'); }
    function pad(show) { padShown = show; opts.card.classList.toggle('hwc-manual-hide', running && !show); btn('pad').textContent = show ? 'Hide buttons' : 'Show buttons'; }

    function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('No camera in this browser'); return; }
      status('Starting camera…');
      navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } } }).then(function (s) {
        stream = s; video.srcObject = s; running = true;
        view.classList.remove('hidden'); q('.hwc-tip').classList.remove('hidden');
        btn('on').textContent = 'Camera off'; btn('on').classList.remove('go');
        btn('setup').classList.remove('hidden'); btn('pad').classList.remove('hidden');
        pad(false);
        try { localStorage.setItem('dl_hw_auto', '1'); } catch (e) {}
        video.play().catch(function () {});
        loop();
        if (!localStorage.getItem('dl_hw_cam')) openSetup();
      }).catch(function (e) { status(e && e.name === 'NotAllowedError' ? 'Camera blocked. Allow it in settings.' : 'Camera did not start'); });
    }
    function stop() {
      running = false; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; tracker = null;
      view.classList.add('hidden'); q('.hwc-set').classList.add('hidden'); q('.hwc-tip').classList.add('hidden'); q('.hwc-fix').classList.add('hidden');
      btn('on').textContent = 'Auto camera'; btn('on').classList.add('go');
      btn('setup').classList.add('hidden'); btn('pad').classList.add('hidden');
      opts.card.classList.remove('hwc-manual-hide'); setup = false; status('');
      try { localStorage.removeItem('dl_hw_auto'); } catch (e) {}
    }
    function openSetup() { setup = true; q('.hwc-set').classList.remove('hidden'); status('Line up the boxes'); }
    btn('on').addEventListener('click', function () { if (running) stop(); else start(); });
    btn('setup').addEventListener('click', function () { if (setup) { closeSetup(); } else openSetup(); });
    btn('pad').addEventListener('click', function () { pad(!padShown); });
    btn('done').addEventListener('click', closeSetup);
    btn('reset').addEventListener('click', function () { var s = cfg.sens; cfg = clone(DEFAULT); cfg.sens = s; save(cfg); tracker = null; });
    q('input[type=range]').addEventListener('input', function () { cfg.sens = +this.value; save(cfg); if (tracker) { tracker.cfg = cfg; tracker.buildMask(); } });
    function closeSetup() { setup = false; q('.hwc-set').classList.add('hidden'); save(cfg); tracker = null; }

    /* drag boxes */
    var drag = null;
    function boxList() { var l = ZONES.map(function (z) { return [z, cfg.boxes[z]]; }); l.push(['hitter', cfg.hitter]); return l; }
    function rel(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    cv.addEventListener('pointerdown', function (e) {
      if (!setup) return;
      var p = rel(e), hit = null;
      boxList().reverse().some(function (it) {
        var b = it[1]; if (!b) return false;
        if (Math.abs(p.x - (b[0] + b[2])) < 0.05 && Math.abs(p.y - (b[1] + b[3])) < 0.06) { hit = { b: b, mode: 'size' }; return true; }
        if (p.x >= b[0] && p.x <= b[0] + b[2] && p.y >= b[1] && p.y <= b[1] + b[3]) { hit = { b: b, mode: 'move', ox: p.x - b[0], oy: p.y - b[1] }; return true; }
        return false;
      });
      if (hit) { drag = hit; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = rel(e), b = drag.b;
      if (drag.mode === 'move') { b[0] = Math.min(1 - b[2], Math.max(0, p.x - drag.ox)); b[1] = Math.min(1 - b[3], Math.max(0, p.y - drag.oy)); }
      else { b[2] = Math.max(0.04, Math.min(1 - b[0], p.x - b[0])); b[3] = Math.max(0.04, Math.min(1 - b[1], p.y - b[1])); }
    });
    cv.addEventListener('pointerup', function () { if (drag) { drag = null; save(cfg); } });

    function show(zone, contact) {
      flash.textContent = zone === 'miss' ? 'MISS' : ZN[zone].toUpperCase();
      flash.classList.add('on'); clearTimeout(show.t); show.t = setTimeout(function () { flash.classList.remove('on'); }, 900);
      var fx = q('.hwc-fix');
      fx.innerHTML = 'Auto: <b style="color:var(--ink)">' + ZN[zone] + '</b>. Wrong? ' + ZONES.concat(['miss']).filter(function (z) { return z !== zone; }).map(function (z) { return '<button type="button" data-z="' + z + '">' + ZN[z] + '</button>'; }).join('');
      fx.classList.remove('hidden');
      Array.prototype.forEach.call(fx.querySelectorAll('button'), function (b) { b.addEventListener('click', function () { fx.classList.add('hidden'); opts.onFix(b.getAttribute('data-z'), contact); }); });
      clearTimeout(show.f); show.f = setTimeout(function () { fx.classList.add('hidden'); }, 8000);
    }

    function draw() {
      var W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      boxList().forEach(function (it) {
        var z = it[0], b = it[1]; if (!b) return;
        var hot = trail && Date.now() - trailT < 1200 && trail.zone === z;
        ctx.lineWidth = hot ? 4 : 2;
        ctx.strokeStyle = z === 'hitter' ? 'rgba(244,239,230,0.45)' : (hot ? '#e2a85a' : 'rgba(200,134,46,0.9)');
        ctx.setLineDash(z === 'hitter' ? [6, 5] : []);
        ctx.fillStyle = hot ? 'rgba(200,134,46,0.35)' : (z === 'hitter' ? 'rgba(0,0,0,0.25)' : 'rgba(200,134,46,0.10)');
        ctx.fillRect(b[0] * W, b[1] * H, b[2] * W, b[3] * H); ctx.strokeRect(b[0] * W, b[1] * H, b[2] * W, b[3] * H);
        ctx.setLineDash([]);
        ctx.fillStyle = '#f4efe6'; ctx.font = '600 11px Inter, sans-serif';
        ctx.fillText(z === 'hitter' ? 'HITTER' : ZN[z], b[0] * W + 5, b[1] * H + 14);
        if (setup) { ctx.fillStyle = '#C8862E'; ctx.fillRect((b[0] + b[2]) * W - 9, (b[1] + b[3]) * H - 9, 12, 12); }
      });
      if (trail && Date.now() - trailT < 1600) {
        ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 3; ctx.beginPath();
        trail.path.forEach(function (p, i) { if (i) ctx.lineTo(p.x * W, p.y * H); else ctx.moveTo(p.x * W, p.y * H); });
        ctx.stroke();
        ctx.fillStyle = '#e2a85a'; ctx.beginPath(); ctx.arc(trail.impact.x * W, trail.impact.y * H, 8, 0, 7); ctx.fill();
      }
    }

    function loop() {
      if (!running) return;
      var next = video.requestVideoFrameCallback ? function (f) { video.requestVideoFrameCallback(f); } : function (f) { requestAnimationFrame(f); };
      next(function () {
        if (!running) return;
        if (video.videoWidth) {
          var w = 192, h = Math.round(192 * video.videoHeight / video.videoWidth);
          if (!tracker || tracker.w !== w || tracker.h !== h) { work.width = w; work.height = h; tracker = new Tracker(w, h, cfg); }
          wctx.drawImage(video, 0, 0, w, h);
          var px = wctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
          for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] + 2 * px[j + 1] + px[j + 2]) >> 2;
          var live = opts.active() && !setup;
          var shot = tracker.push(g);
          if (shot && live) { trail = shot; trailT = Date.now(); show(shot.zone, shot.contact); opts.onShot(shot.zone, shot.contact); }
          var now = performance.now(); fpsN++;
          if (now - fpsT > 1000) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
          if (!setup) status(live ? 'WATCHING · ' + fps + ' fps' : 'Paused', live);
          draw();
        }
        loop();
      });
    }
    var api = { start: start, stop: stop, on: function () { return running; } };
    try { if (localStorage.getItem('dl_hw_auto') === '1') api.wantAuto = true; } catch (e) {}
    return api;
  }
  root.HWCam = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
