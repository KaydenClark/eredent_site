"""Step 1: land/water by nesting parity across the drawn lines (each crossed line flips land and water),
lakes from the blue ink of the penup master, mountain glyph strokes = drawn lines with land on all sides."""
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from collections import deque
from common import OUTLINE, PENUP, CFG, ROOT, build
import os

L = np.asarray(Image.open(OUTLINE).convert('L'))
lines = nd.binary_dilation(L < 140, iterations=1)
H, W = lines.shape
lab, n = nd.label(~lines)              # 4-connected regions between lines
pairs = set()
for dy in range(-5, 6):
    for dx in range(-5, 6):
        if dx * dx + dy * dy > 25 or (dx == 0 and dy == 0):
            continue
        a = lab[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
        b = lab[max(0, dy):H - max(0, -dy) or H, max(0, dx):W - max(0, -dx) or W]
        a = a[:b.shape[0], :b.shape[1]]; b = b[:a.shape[0], :a.shape[1]]
        m = (a > 0) & (b > 0) & (a != b)
        pairs.update(zip(a[m].tolist(), b[m].tolist()))
adj = [[] for _ in range(n + 1)]
for a, b in pairs:
    adj[a].append(b)
border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
depth = np.full(n + 1, -1); q = deque()
for r in border:
    depth[r] = 0; q.append(r)
while q:
    r = q.popleft()
    for s in adj[r]:
        if depth[s] < 0:
            depth[s] = depth[r] + 1; q.append(s)
depth[depth < 0] = 1
isl = (depth % 2 == 1)
landreg = isl[lab]; landreg[lab == 0] = False
idx = nd.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
land = isl[lab[idx[0], idx[1]]]

# lakes from the blue ink (authoritative for lakes)
P = np.asarray(Image.open(PENUP).convert('RGB')).astype(int)
blue = (P[..., 2] > P[..., 0] + 40) & (P[..., 2] > P[..., 1] + 15)
bl, bn = nd.label(nd.binary_dilation(blue, iterations=1))
comps = sorted([nd.binary_fill_holes(bl == i) for i in range(1, bn + 1) if (bl == i).sum() > 80], key=lambda m: -m.sum())
lakes = np.zeros_like(land); inner = np.zeros_like(land)
for m in comps:
    m = nd.binary_erosion(m, iterations=2)    # the ink line is ~3 px wide; pull the water edge back to the line's center
    lakes |= m
    ys, xs = np.where(m)
    if xs.mean() > 1080 and m.sum() < 4000:   # the small loop inside Dire Lake = its deep depression
        inner |= m
land = land | lakes

# small pockets enclosed by mountain glyph strokes flip to 'water' under the parity rule; return those to land
wl, wn = nd.label(~land)
sz = nd.sum(~land, wl, range(1, wn + 1)); main = np.argmax(sz) + 1
dmain = nd.distance_transform_edt(wl != main)
for i in range(1, wn + 1):
    if i == main:
        continue
    comp = wl == i
    if sz[i - 1] < 400 and dmain[comp].min() > 15:
        land |= comp
raw = L < 140
water = ~land
glyph = raw & ~nd.binary_dilation(water, iterations=3) & ~nd.binary_dilation(lakes ^ nd.binary_erosion(lakes, iterations=2), iterations=4)
extra = {}
VAR = CFG.get('variant')
if VAR:
    # Variant: keep the penup coastline and land/water exactly as above (old lake beds stay land), but take the lakes
    # and the mountain marks from another drawing's ink, already registered onto this master grid (RGBA, one color per class).
    K = np.asarray(Image.open(os.path.join(ROOT, VAR['ink_master'])).convert('RGBA')).astype(int)
    on = K[..., 3] >= 128
    ink_of = lambda rgb: on & (np.abs(K[..., :3] - np.array(rgb)).max(-1) <= 40)
    lake_ink = ink_of(VAR['lake_rgb']); mark_ink = ink_of(VAR['mark_rgb'])
    # each closed lake loop -> the area inside the centre of its ink line; a loop nested in another is its inner depression
    ll_, ln_ = nd.label(lake_ink, structure=np.ones((3, 3)))
    loops = []
    for i in range(1, ln_ + 1):
        comp = ll_ == i
        filled = nd.binary_fill_holes(comp); interior = filled & ~comp
        if comp.sum() < 12 or interior.sum() < 3:
            continue
        d_out = nd.distance_transform_edt(filled); d_in = nd.distance_transform_edt(~interior)
        loops.append((interior | (comp & (d_in <= d_out)), filled))
    sept_lakes, sept_glyph = lakes, glyph
    lakes = np.zeros_like(land); inner = np.zeros_like(land)
    for j, (region, filled) in enumerate(loops):
        nested = any(k != j and f2[region].mean() > 0.95 and f2.sum() > filled.sum() for k, (_, f2) in enumerate(loops))
        (inner if nested else lakes)[region] = True
    lakes |= inner
    land_before = land.copy(); land = land | lakes
    print('variant lakes px', int(lakes.sum()), 'inner px', int(inner.sum()), 'land px changed by the new lakes', int((land != land_before).sum()))
    water = ~land
    glyph = mark_ink & land & ~nd.binary_dilation(water, iterations=3) & ~nd.binary_dilation(lakes ^ nd.binary_erosion(lakes, iterations=2), iterations=4)
    gl_, gn_ = nd.label(glyph, structure=np.ones((3, 3)))
    glyph = np.isin(gl_, 1 + np.nonzero(nd.sum(glyph, gl_, range(1, gn_ + 1)) >= 6)[0])
    # what the acceptance check compares the built edges against: the penup coast ink (no old marks, no old lake
    # outlines) plus the variant's lake ink
    old_lake_zone = nd.binary_dilation(nd.binary_fill_holes(sept_lakes), iterations=5)
    extra['check_ink'] = (raw & ~sept_glyph & ~old_lake_zone) | lake_ink
    # the biome map (kiros_v5) paints the OLD lakes blue, a color its wetland rule also matches; terrain.py ignores
    # v5 color inside this zone so the old lake beds do not turn into wetland
    extra['v5_lake_zone'] = old_lake_zone
np.savez_compressed(build('masks.npz'), land=land, lakes=lakes, inner=inner, glyph=glyph, **extra)
vis = np.zeros((H, W, 3), np.uint8); vis[land] = (60, 140, 60); vis[lakes] = (40, 90, 220); vis[inner] = (10, 30, 120); vis[glyph] = (255, 255, 255)
Image.fromarray(vis).save(build('masks_vis.png'))
print('regions', n, 'max depth', depth.max(), 'land frac', round(float(land.mean()), 3), 'glyph px', int(glyph.sum()))
