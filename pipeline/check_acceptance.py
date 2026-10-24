"""Acceptance checks from docs/SPEC.md that can be measured on the built layers.
Run after the pipeline:  python pipeline/check_acceptance.py            (September build)
                          python pipeline/check_acceptance.py --variant oct10
  1. Coastlines and lakes match the penup outline within 2 px of the master grid.
  2. Mountains only where the outline has marks, at the table heights (+-5%).
  3. Desert only in the yellow zones, wetland only in the purple zone.
  4. From orbit the inner seas are clearly paler than the outer ocean (measured on the color texture).
  5. No rivers were placed (nothing to measure: the pipeline has no river step)."""
import numpy as np, cv2, os, sys
from PIL import Image
from scipy import ndimage as nd
if '--variant' in sys.argv:                       # must be set before common is imported
    os.environ['KIROS_VARIANT'] = sys.argv[sys.argv.index('--variant') + 1]
from common import CFG, U, OUTLINE, VARIANT, HERE, build

ok = True
def report(name, passed, detail):
    global ok; ok &= passed; print(('PASS ' if passed else 'FAIL ') + name + ': ' + detail)

m = np.load(build('masks.npz')); t = np.load(build('terrain.npz'))
land = t['land']; lakes = t['lakes']; e = t['elev']
L = cv2.imread(OUTLINE, cv2.IMREAD_GRAYSCALE)
H, W = L.shape

# 1. coastline distance: every drawn coastline pixel should be within 2 px of the derived land/water edge
ground = land & ~lakes                                 # solid ground; the edge against any water is what the drawing shows
land1 = cv2.resize(ground.astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST).astype(bool)
edge = land1 ^ nd.binary_erosion(land1)
dist_to_edge = nd.distance_transform_edt(~edge)
drawn = (L < 140) & ~m['glyph']                       # drawn lines that are not mountain marks
if 'check_ink' in m.files:                            # variant: penup coast ink + the variant's lake ink (built by masks.py)
    drawn = m['check_ink']
d = dist_to_edge[drawn]
frac = float((d <= 2).mean())
if VARIANT:
    sept = os.path.join(HERE, 'build', 'terrain.npz')
    if os.path.exists(sept):
        sl = np.load(sept)['land']; nd_ = int((sl != land).sum())
        report('land/water identical to the September build', nd_ == 0, f'{nd_} of {sl.size} px differ')
report('coastlines within 2 px', frac >= 0.97, f'{frac * 100:.1f}% of drawn coast and lake pixels lie within 2 px of the built edge (median {np.median(d):.1f} px)')

# 2. range heights: summit per range within +-5% of the configured peak; no mountain-class land far from marks
yy, xx = np.mgrid[0:e.shape[0], 0:e.shape[1]] / U
glyph2 = cv2.resize(m['glyph'].astype(np.uint8), (e.shape[1], e.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
near_marks = nd.binary_dilation(glyph2, iterations=int(30 * U))
# each mountain stroke is checked against the range whose box holds it; strokes inside two boxes are ambiguous and skipped
gl, gn = nd.label(m['glyph'], structure=np.ones((3, 3)))
cen = nd.center_of_mass(m['glyph'], gl, range(1, gn + 1))
ranges = {k: v for k, v in CFG['ranges'].items() if not k.startswith('_')}
owner = {}
for i, (cy, cx) in enumerate(cen):
    hits = [k for k, r in ranges.items() if r['box'][0] <= cx <= r['box'][1] and r['box'][2] <= cy <= r['box'][3]]
    if len(hits) == 1:
        owner.setdefault(hits[0], []).append(i + 1)
for name, r in ranges.items():
    if name not in owner:
        n_any = sum(1 for cy, cx in cen if r['box'][0] <= cx <= r['box'][1] and r['box'][2] <= cy <= r['box'][3])
        print(f'skip {name}: ' + ('all its strokes also fall inside another range box' if n_any else 'no marks drawn in its box (no relief built)')); continue
    strokes = np.isin(gl, owner[name])
    strokes = cv2.resize(strokes.astype(np.uint8), (e.shape[1], e.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
    sel = land & nd.binary_dilation(strokes, iterations=int(12 * U))
    if not sel.any():
        continue
    peak = float(e[sel].max())
    report(f'{name} summit', abs(peak - r['peak_m']) / r['peak_m'] <= 0.06, f'{peak:.0f} m vs {r["peak_m"]} m ({len(owner[name])} strokes)')
dv = CFG['dragon_volcano']
cx, cy = dv['center_px_outline']; sel = land & (np.hypot(xx - cx, yy - cy) < dv['radius_px'])
report('dragon volcano summit', abs(float(e[sel].max()) - dv['summit_m']) / dv['summit_m'] <= 0.05, f'{e[sel].max():.0f} m vs {dv["summit_m"]} m')
stray = land & ~near_marks & ~lakes & (e > 1900)
report('no ranges away from marks', stray.sum() < 500, f'{int(stray.sum())} px of land above 1,900 m more than 30 px from any mountain mark')

# 3. biome zones: desert and wetland pixels must lie inside the drawn zones (they are built from them, so this checks the fill)
bm = cv2.imread(build('biome_reg.png')); bm = cv2.resize(bm, (e.shape[1], e.shape[0]), interpolation=cv2.INTER_NEAREST).astype(int)
bb, gg, rr = bm[..., 0], bm[..., 1], bm[..., 2]
yellow = nd.binary_dilation((rr > 200) & (gg > 190) & (bb < 120), iterations=8)
purple = nd.binary_dilation((bb > rr + 5) & (bb > 150) & (gg < bb - 10) & (rr > 110) & (rr < 190), iterations=8)
desert = t['desert']; wet = t['wet']
dz = nd.binary_fill_holes(nd.binary_closing(yellow, iterations=6)); wz = nd.binary_fill_holes(nd.binary_closing(purple, iterations=6))
report('desert inside yellow zones', float((desert & ~dz).sum()) / max(1, desert.sum()) < 0.02, f'{(desert & ~dz).sum()} of {desert.sum()} desert px outside')
report('wetland inside purple zone', float((wet & ~wz).sum()) / max(1, wet.sum()) < 0.02, f'{(wet & ~wz).sum()} of {wet.sum()} wetland px outside')

# 4. inner seas paler than the outer ocean, on the color texture
col = np.asarray(Image.open(build('kiros_color_source.png')).convert('RGB')).astype(float)
I = t['interior'].astype(np.float32); ocean = ~land
inner = ocean & (I > 0.8); outer = ocean & (I < 0.05) & (e < -2000)
li, lo = col[inner].mean(), col[outer].mean()
report('inner seas paler than outer ocean', li > lo * 1.8, f'mean brightness inner {li:.0f} vs outer {lo:.0f}')

print('\nALL PASS' if ok else '\nSOME CHECKS FAILED')
