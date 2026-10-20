/* DugoutLab strike zone AR model, built on the phone.
   DLZoneUSDZ(topIn, bottomIn) returns a Uint8Array .usdz for Apple AR Quick Look.
   Origin is the BACK POINT OF HOME PLATE. Y is up. The pitcher is along -Z.
   Units are meters. Heights come in as inches off the ground.
   Package: one usda layer, stored (no compression), data aligned to 64 bytes, per the USDZ spec. */
(function (root) {
  var IN = 0.0254;
  var GOLD = [0.78, 0.53, 0.18], GOLD_LT = [0.95, 0.72, 0.36], WHITE = [0.96, 0.94, 0.90];

  /* ---------- geometry ---------- */
  function Mesh() { this.pts = []; this.counts = []; this.idx = []; }
  Mesh.prototype.face = function (list) {
    var base = this.pts.length;
    for (var i = 0; i < list.length; i++) this.pts.push(list[i]);
    this.counts.push(list.length);
    for (var j = 0; j < list.length; j++) this.idx.push(base + j);
  };
  /* Square bar of width w from point a to point b. */
  Mesh.prototype.bar = function (a, b, w) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    var L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
    d = [d[0] / L, d[1] / L, d[2] / L];
    var ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var u = norm(cross(d, ref)), v = norm(cross(d, u)), h = w / 2;
    var c = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { c.push(add(a, u, v, s[0] * h, s[1] * h)); });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { c.push(add(b, u, v, s[0] * h, s[1] * h)); });
    var F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (var i = 0; i < F.length; i++) this.face(F[i].map(function (k) { return c[k]; }));
  };
  /* Vertical prism over a ground polygon [(x, z)...] from y0 to y1. */
  Mesh.prototype.prism = function (poly, y0, y1) {
    var n = poly.length, i;
    var bot = poly.map(function (p) { return [p[0], y0, p[1]]; }), top = poly.map(function (p) { return [p[0], y1, p[1]]; });
    this.face(bot.slice().reverse());
    this.face(top);
    for (i = 0; i < n; i++) { var j = (i + 1) % n; this.face([bot[i], bot[j], top[j], top[i]]); }
  };
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function add(p, u, v, su, sv) { return [p[0] + u[0] * su + v[0] * sv, p[1] + u[1] * su + v[1] * sv, p[2] + u[2] * su + v[2] * sv]; }

  /* ---------- usda ---------- */
  function f(n) { return (Math.round(n * 100000) / 100000).toString(); }
  function c3(rgb) { return '(' + rgb.map(f).join(', ') + ')'; }
  function material(name, rgb, opacity) {
    return '        def Material "' + name + '"\n        {\n' +
      '            token outputs:surface.connect = </Zone/Looks/' + name + '/S.outputs:surface>\n' +
      '            def Shader "S"\n            {\n' +
      '                uniform token info:id = "UsdPreviewSurface"\n' +
      '                color3f inputs:diffuseColor = ' + c3(rgb) + '\n' +
      '                color3f inputs:emissiveColor = ' + c3(rgb.map(function (x) { return x * 0.6; })) + '\n' +
      '                float inputs:opacity = ' + f(opacity) + '\n' +
      '                float inputs:roughness = 0.9\n' +
      '                token outputs:surface\n            }\n        }\n';
  }
  function meshText(name, m, mat) {
    return '    def Mesh "' + name + '" (\n        prepend apiSchemas = ["MaterialBindingAPI"]\n    )\n    {\n' +
      '        uniform bool doubleSided = 1\n' +
      '        int[] faceVertexCounts = [' + m.counts.join(', ') + ']\n' +
      '        int[] faceVertexIndices = [' + m.idx.join(', ') + ']\n' +
      '        rel material:binding = </Zone/Looks/' + mat + '>\n' +
      '        point3f[] points = [' + m.pts.map(function (p) { return '(' + f(p[0]) + ', ' + f(p[1]) + ', ' + f(p[2]) + ')'; }).join(', ') + ']\n' +
      '        uniform token subdivisionScheme = "none"\n    }\n';
  }

  function buildUsda(topIn, botIn) {
    var yt = topIn * IN, yb = botIn * IN, hw = 8.5 * IN, fz = -17 * IN, mz = -8.5 * IN;
    /* Home plate: back point at origin, 17 in. front edge toward the pitcher. */
    var plateP = [[0, 0], [hw, mz], [hw, fz], [-hw, fz], [-hw, mz]];
    var plate = new Mesh(); plate.prism(plateP, 0.002, 0.012);
    /* The zone: the plate's shape, from the bottom line up to the top line. */
    var vol = new Mesh(); vol.prism(plateP, yb, yt);
    var edge = new Mesh(), W = 0.014, i;
    for (i = 0; i < plateP.length; i++) {
      var a = plateP[i], b = plateP[(i + 1) % plateP.length];
      edge.bar([a[0], yb, a[1]], [b[0], yb, b[1]], W);
      edge.bar([a[0], yt, a[1]], [b[0], yt, b[1]], W);
      edge.bar([a[0], yb, a[1]], [a[0], yt, a[1]], W);
    }
    /* Thirds on the front face, so the 3 x 3 boxes match the Pitch Tracker. */
    var grid = new Mesh(), G = 0.008, zf = fz - 0.002;
    for (i = 1; i < 3; i++) {
      var x = -hw + i * (2 * hw / 3), y = yb + i * (yt - yb) / 3;
      grid.bar([x, yb, zf], [x, yt, zf], G);
      grid.bar([-hw, y, zf], [hw, y, zf], G);
    }
    return '#usda 1.0\n(\n    defaultPrim = "Zone"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\n' +
      'def Xform "Zone" (\n    assetInfo = {\n        string name = "Zone"\n    }\n    kind = "component"\n)\n{\n' +
      '    def Scope "Looks"\n    {\n' + material('Box', GOLD, 0.2) + material('Edge', GOLD, 1) + material('Grid', GOLD_LT, 1) + material('Plate', WHITE, 1) + '    }\n' +
      meshText('Plate', plate, 'Plate') + meshText('Box', vol, 'Box') + meshText('Edges', edge, 'Edge') + meshText('Grid', grid, 'Grid') + '}\n';
  }

  /* ---------- zip (stored, 64-byte aligned) ---------- */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); var out = []; for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF); return new Uint8Array(out); }
  function zipOne(name, data) {
    var nm = utf8(name), crc = crc32(data);
    var headLen = 30 + nm.length, pad = (64 - ((headLen + 4) % 64)) % 64, extraLen = 4 + pad;
    var local = new Uint8Array(headLen + extraLen), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nm.length, true); lv.setUint16(28, extraLen, true);
    local.set(nm, 30); lv.setUint16(headLen, 0x1986, true); lv.setUint16(headLen + 2, pad, true);
    var cd = new Uint8Array(46 + nm.length), cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nm.length, true); cv.setUint32(42, 0, true); cd.set(nm, 46);
    var end = new Uint8Array(22), ev = new DataView(end.buffer), cdOff = local.length + data.length;
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
    ev.setUint32(12, cd.length, true); ev.setUint32(16, cdOff, true);
    var out = new Uint8Array(cdOff + cd.length + end.length);
    out.set(local, 0); out.set(data, local.length); out.set(cd, cdOff); out.set(end, cdOff + cd.length);
    return out;
  }

  function DLZoneUSDZ(topIn, botIn) { return zipOne('zone.usda', utf8(buildUsda(topIn, botIn))); }
  DLZoneUSDZ.usda = buildUsda;
  root.DLZoneUSDZ = DLZoneUSDZ;
  if (typeof module !== 'undefined' && module.exports) module.exports = DLZoneUSDZ;
})(typeof window !== 'undefined' ? window : this);
