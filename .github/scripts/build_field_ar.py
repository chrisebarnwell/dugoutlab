#!/usr/bin/env python3
"""Build the AR field models for field-layout.html.

  pip install usd-core
  python3 .github/scripts/build_field_ar.py

Writes ar/field-<bases>-<mound>-<sport>.usdz, one per preset.
Origin is the BACK POINT OF HOME PLATE. Y is up. Second base is along -Z.
Viewer stands at +Z looking -Z, so first base is +X (right).
Units are meters. Every distance below is in feet and converted.
"""
import math, os, sys, tempfile
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, UsdUtils

FT = 0.3048
IN = FT / 12

# (bases ft, mound ft, sport). Keep in sync with LEAGUES in field-layout.html.
PRESETS = [
    (60, 0, 'bb'), (60, 46, 'bb'), (65, 46, 'bb'), (70, 50, 'bb'), (80, 54, 'bb'), (90, 60.5, 'bb'),
    (60, 35, 'sb'), (60, 40, 'sb'), (60, 43, 'sb'),
]

WHITE = (0.96, 0.94, 0.90)
GOLD = (0.78, 0.53, 0.18)
ORANGE = (0.95, 0.45, 0.10)
RED = (0.85, 0.20, 0.15)

def fname(b, m, sp):
    return 'field-%s-%s-%s.usdz' % (('%g' % b).replace('.', 'p'), ('%g' % m).replace('.', 'p'), sp)

class Builder:
    def __init__(self, stage):
        self.stage = stage
        self.n = 0
        self.mats = {}

    def mat(self, rgb):
        if rgb in self.mats:
            return self.mats[rgb]
        p = '/Field/Looks/M%d' % len(self.mats)
        m = UsdShade.Material.Define(self.stage, p)
        s = UsdShade.Shader.Define(self.stage, p + '/S')
        s.CreateIdAttr('UsdPreviewSurface')
        s.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*rgb))
        s.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*[c * 0.6 for c in rgb]))
        s.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.9)
        m.CreateSurfaceOutput().ConnectToSource(s.ConnectableAPI(), 'surface')
        self.mats[rgb] = m
        return m

    def mesh(self, pts, faces, rgb):
        self.n += 1
        g = UsdGeom.Mesh.Define(self.stage, '/Field/G%d' % self.n)
        g.CreatePointsAttr([Gf.Vec3f(*p) for p in pts])
        g.CreateFaceVertexCountsAttr([len(f) for f in faces])
        g.CreateFaceVertexIndicesAttr([i for f in faces for i in f])
        g.CreateSubdivisionSchemeAttr('none')
        g.CreateDoubleSidedAttr(True)
        UsdShade.MaterialBindingAPI.Apply(g.GetPrim()).Bind(self.mat(rgb))

    def prism(self, poly, y0, y1, rgb):
        """Extrude a ground polygon [(x, z), ...] from y0 to y1."""
        n = len(poly)
        pts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
        faces = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append([i, j, n + j, n + i])
        self.mesh(pts, faces, rgb)

    def strip(self, a, b, w, rgb, h=0.012):
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz)
        nx, nz = -dz / L * w / 2, dx / L * w / 2
        self.prism([(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)], 0.004, h, rgb)

    def ring(self, c, r, w, rgb, seg=72):
        for i in range(seg):
            t0, t1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
            ro, ri = r + w / 2, r - w / 2
            self.prism([(c[0] + ri * math.cos(t0), c[1] + ri * math.sin(t0)), (c[0] + ro * math.cos(t0), c[1] + ro * math.sin(t0)),
                        (c[0] + ro * math.cos(t1), c[1] + ro * math.sin(t1)), (c[0] + ri * math.cos(t1), c[1] + ri * math.sin(t1))], 0.004, 0.012, rgb)

    def pole(self, c, rgb, h=1.5, w=0.06):
        s = w / 2
        self.prism([(c[0] - s, c[1] - s), (c[0] + s, c[1] - s), (c[0] + s, c[1] + s), (c[0] - s, c[1] + s)], 0, h, rgb)
        f = 0.16
        self.prism([(c[0] - f, c[1] - f), (c[0] + f, c[1] - f), (c[0] + f, c[1] + f), (c[0] - f, c[1] + f)], h, h + 0.22, rgb)

def build(b, m, sp, out):
    stage = Usd.Stage.CreateNew(out)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    root = UsdGeom.Xform.Define(stage, '/Field')
    stage.SetDefaultPrim(root.GetPrim())
    B = Builder(stage)

    bm = b * FT
    s = bm / math.sqrt(2)
    home, p1, p2, p3 = (0, 0), (s, -s), (0, -2 * s), (-s, -s)

    # home plate, back point at the origin, front edge toward the pitcher
    B.prism([(0, 0), (8.5 * IN, -8.5 * IN), (8.5 * IN, -17 * IN), (-8.5 * IN, -17 * IN), (-8.5 * IN, -8.5 * IN)], 0.004, 0.02, WHITE)
    B.pole(home, RED, h=1.8)

    # baselines and foul line extensions
    lw = 0.08
    for a, c in [(home, p1), (p1, p2), (p2, p3), (p3, home)]:
        B.strip(a, c, lw, WHITE)
    B.strip(p1, (s * 1.35, -s * 1.35), lw, WHITE)
    B.strip(p3, (-s * 1.35, -s * 1.35), lw, WHITE)
    # aim line home to second, thin and gold
    B.strip((0, -17 * IN), p2, 0.04, GOLD)

    # bags: 15 in. 1st and 3rd sit inside fair territory, outer back corner on the point. 2nd centered on the point.
    w = 15 * IN
    r2 = 1 / math.sqrt(2)
    for P, u, n in [(p1, (r2, -r2), (-r2, -r2)), (p3, (-r2, -r2), (r2, -r2))]:
        a = P
        bb = (P[0] - u[0] * w, P[1] - u[1] * w)
        c = (bb[0] + n[0] * w, bb[1] + n[1] * w)
        d = (P[0] + n[0] * w, P[1] + n[1] * w)
        B.prism([a, bb, c, d], 0.004, 0.08, WHITE)
        B.pole(P, GOLD)
    h = w / math.sqrt(2)
    B.prism([(p2[0], p2[1] + h), (p2[0] + h, p2[1]), (p2[0], p2[1] - h), (p2[0] - h, p2[1])], 0.004, 0.08, WHITE)
    B.pole(p2, GOLD, h=2.2)

    # mound or pitching plate. Distance runs to the front edge of the rubber or plate.
    if m > 0:
        mz = -m * FT
        rw, rd = (24 * IN, 6 * IN) if (sp == 'sb' or m > 54) else (18 * IN, 4 * IN)
        B.prism([(-rw / 2, mz), (rw / 2, mz), (rw / 2, mz - rd), (-rw / 2, mz - rd)], 0.004, 0.05, WHITE)
        radius = 8 * FT if sp == 'sb' else (9 * FT if m > 54 else 5 * FT)
        B.ring((0, mz), radius, 0.08, ORANGE)
        B.pole((0, mz), ORANGE, h=1.3)

    stage.GetRootLayer().Save()

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    outdir = os.path.join(here, '..', '..', 'ar')
    os.makedirs(outdir, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for b, m, sp in PRESETS:
        usdc = os.path.join(tmp, 'field.usdc')
        build(b, m, sp, usdc)
        dst = os.path.join(outdir, fname(b, m, sp))
        if not UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(usdc), dst):
            sys.exit('failed: ' + dst)
        print('wrote', os.path.relpath(dst), os.path.getsize(dst), 'bytes')

if __name__ == '__main__':
    main()
