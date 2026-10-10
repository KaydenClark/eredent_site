"""Step 4: heightmap (meters), bathymetry and biome zones on the outline grid upsampled 2x.
All heights, lake levels and zone rules come from config.json (canon, derived or proposed; see docs/SPEC.md)."""
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
from common import CFG, U, build

m = np.load(build('masks.npz'))


def up(a):
    return cv2.resize(a.astype(np.float32), None, fx=U, fy=U, interpolation=cv2.INTER_LINEAR)


land = nd.gaussian_filter(up(m['land']), 1.2) > 0.5
lakes = up(m['lakes']) > 0.5; inner = up(m['inner']) > 0.5; glyph = up(m['glyph']) > 0.3
land = land | nd.binary_dilation(lakes, iterations=3)
glyph &= ~nd.binary_dilation(lakes, iterations=6)
H, W = land.shape


def fbm(oct=6, base=256, gain=0.55, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((H, W), np.float32); amp = 1; tot = 0; s = base
    for i in range(oct):
        n = r.standard_normal((H // max(1, int(s / 4)) + 2, W // max(1, int(s / 4)) + 2)).astype(np.float32)
        n = cv2.resize(n, (W, H), interpolation=cv2.INTER_CUBIC)
        n = nd.gaussian_filter(n, max(0.6, s / 16))
        n /= (n.std() + 1e-6); out += amp * n; tot += amp; amp *= gain; s /= 2
    return out / tot


n1 = fbm(seed=1); n2 = fbm(seed=2, base=128); n3 = fbm(seed=3, base=64, oct=5)
ridged = 1 - np.abs(fbm(seed=4, base=96)); ridged = np.clip(ridged, 0, None) ** 2

# latitude per pixel from the solved placement
x0, y0, c, k = np.load(build('proj.npy'))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / U
dx, dy = (xx - x0) * k, (y0 - yy) * k
rho = np.radians(np.hypot(dx, dy)); th = np.arctan2(dx, dy); cr = np.radians(c)
lat = np.degrees(np.arcsin(np.sin(cr) * np.cos(rho) + np.cos(cr) * np.sin(rho) * np.cos(th))).astype(np.float32)
np.save(build('lat.npy'), lat)

# mountain ranges: assign glyph strokes to the named systems by location (canon: ranges only where the outline draws marks)
gl, gn = nd.label(glyph, structure=np.ones((3, 3)))
cen = nd.center_of_mass(glyph, gl, range(1, gn + 1))
fields = {}
cap = np.full((H, W), 1800, np.float32)
for name, r in CFG['ranges'].items():
    if name.startswith('_'):
        continue
    a, b, c0, c1 = r['box']; peak = r['peak_m']; sig = r['sigma']; style = r['style']
    sel = [i + 1 for i, (cy, cx) in enumerate(cen) if a <= cx / U <= b and c0 <= cy / U <= c1]
    f = np.isin(gl, sel).astype(np.float32)
    f = nd.gaussian_filter(f, sig); f /= (f.max() + 1e-6)
    fields[name] = (f, peak, style)

# base elevation by continent (proposed upland levels)
dist = nd.distance_transform_edt(land) / U
lab, nl = nd.label(land)
base = np.zeros((H, W), np.float32)
for name, r in CFG['regions'].items():
    if name.startswith('_'):
        continue
    x, y = r['seed']; i = lab[int(y * U), int(x * U)]
    if i:
        base[lab == i] = r['base_m']
base[(base == 0) & land] = 200
base = nd.gaussian_filter(base, 40)
rise = 1 - np.exp(-dist / 18)
elev = base * rise * (0.75 + 0.35 * n1) + 25 * n3
for name, (f, peak, style) in fields.items():
    if style == 'rugged':
        shape = f ** 1.3 * (0.55 + 0.65 * ridged)
    elif style == 'rounded':
        shape = nd.gaussian_filter(f, 6) ** 1.1 * (0.8 + 0.25 * n2)
    else:
        shape = f ** 1.6 * (0.6 + 0.5 * ridged)
    ref = np.percentile(shape[shape > 0.05 * shape.max()], 85)
    shape = np.clip(shape / (ref + 1e-6), 0, 1) ** 1.2
    zone = shape > 0.02
    lb = np.percentile(elev[zone & land], 50) if (zone & land).any() else 0
    elev += max(peak - lb, 0) * shape
    cap = np.maximum(cap, np.where(shape > 0.01, peak, 0))
elev = np.where(elev > cap, cap + 80 * np.tanh((elev - cap) / 80), elev)

# Dragon Islands: one dominant central cone (canon)
dv = CFG['dragon_volcano']
cx, cy = dv['center_px_outline'][0] * U, dv['center_px_outline'][1] * U
r = np.hypot(xx * U - cx, yy * U - cy) / U
cone = np.exp(-(r / dv['radius_px']) ** 1.6)
elev = np.where(land, np.maximum(elev, dv['summit_m'] * cone * (0.95 + 0.05 * n3)), elev)

# lakes
LK = CFG['lakes']
veir = lakes & (xx < 600)
dvo = nd.distance_transform_edt(~veir) / U; dvi = nd.distance_transform_edt(veir) / U
basin = np.exp(-dvo / 35)
elev = np.where(land, elev * (1 - basin) + (LK['veir']['rim_m'] + 150 * n2) * basin, elev)
elev = np.where(veir, LK['veir']['surface_m'] - LK['veir']['depth_m'] * np.clip(dvi / 25, 0, 1) ** 0.7, elev)
sf = lakes & (xx > 780) & (xx < 960) & (yy < 480)
ds = nd.distance_transform_edt(sf) / U; dso = nd.distance_transform_edt(~sf) / U; bs = np.exp(-dso / 20)
elev = np.where(land, elev * (1 - bs) + (LK['sfere']['rim_m'] + 60 * n2) * bs, elev)
elev = np.where(sf, LK['sfere']['surface_m'] - LK['sfere']['depth_m'] * np.clip(ds / 12, 0, 1) ** 0.7, elev)
dl = lakes & (xx > 1000) & (yy > 600)
dd = nd.distance_transform_edt(dl) / U; ddo = nd.distance_transform_edt(~dl) / U; bd = np.exp(-ddo / 45)
elev = np.where(land, elev * (1 - bd) + (LK['dire']['rim_m'] + 30 * n2) * bd, elev)
di = nd.distance_transform_edt(inner) / U
elev = np.where(dl, LK['dire']['surface_m'] + (LK['dire']['bed_m'] - LK['dire']['surface_m']) * np.clip(dd / 15, 0, 1), elev)
elev = np.where(inner, LK['dire']['bed_m'] + (LK['dire']['inner_floor_m'] - LK['dire']['bed_m']) * np.clip(di / 14, 0, 1) ** 0.8, elev)
lake_surface = np.where(veir, LK['veir']['surface_m'], np.where(sf, LK['sfere']['surface_m'], np.where(dl | inner, LK['dire']['surface_m'], 0))).astype(np.float32)

# biome zones from the registered biome map (yellow = desert, purple = wetland, grey hatch = snow)
bm = cv2.imread(build('biome_reg.png')); bm = cv2.resize(bm, (W, H), interpolation=cv2.INTER_NEAREST).astype(int)
bb, gg, rr = bm[..., 0], bm[..., 1], bm[..., 2]
yellow = (rr > 200) & (gg > 190) & (bb < 120)
purple = (bb > rr + 5) & (bb > 150) & (gg < bb - 10) & (rr > 110) & (rr < 190) & ~lakes
grey_hatch = (abs(rr - gg) < 10) & (abs(gg - bb) < 12) & (rr < 195) & (rr > 140)


def fill_zone(stroke, close=6):
    s = nd.binary_closing(nd.binary_dilation(stroke, iterations=2), iterations=close)
    return nd.binary_fill_holes(s) & land


desert = fill_zone(yellow)
wet = fill_zone(purple)
snowhatch = nd.gaussian_filter(grey_hatch.astype(np.float32), 10) > 0.03
elev = np.where(wet, np.clip(elev, 0, None) * 0.04 + 6 + 8 * n3, elev)
bayou = wet & (n3 + 0.5 * n1 > 0.55)

# ocean depth: shallow protected interior seas, deep outer ocean (canon), numbers from config (proposed)
OC = CFG['ocean']
ocean = ~land
dco = nd.distance_transform_edt(ocean) / U
Rc = OC['interior_closing_px'] * U; pad = np.pad(land, Rc + 10)
dil = nd.distance_transform_edt(~pad) <= Rc
clo = nd.distance_transform_edt(dil) > Rc
interior = clo[Rc + 10:-(Rc + 10), Rc + 10:-(Rc + 10)] & ocean
interior = nd.gaussian_filter(interior.astype(np.float32), 8 * U)
s0, s1 = OC['inner_shelf_m']; a0, a1 = OC['abyss_m']
shallow = -(s0 + (s1 - s0) * np.clip(dco / 40, 0, 1) ** 0.8) * (1 + 0.15 * n2)
deep = -(80 + (a1 - 700) * np.clip((dco - 6) / 70, 0, 1) ** 1.1) * (1 + 0.06 * n1)
odepth = interior * shallow + (1 - interior) * np.minimum(deep, -60 * np.clip(dco / 8, 0, 1) - 10)
elev = np.where(ocean, odepth, elev)
elev = np.where(land & ~lakes & ~inner, np.maximum(elev, np.where(wet, 1, 2)), elev)
np.savez_compressed(build('terrain.npz'), elev=elev.astype(np.float32), land=land, lakes=lakes | inner, lake_surface=lake_surface,
                    desert=desert, wet=wet, bayou=bayou, snowhatch=snowhatch, interior=interior.astype(np.float16), lat=lat)
print('elev land max', int(elev[land].max()), 'min', int(elev.min()),
      'veir peaks', int(elev[(xx > 290) & (xx < 560) & (yy > 250) & (yy < 730) & land].max()))
print('desert px', int(desert.sum()), 'wet px', int(wet.sum()), 'snowhatch', int(snowhatch.sum()))
v = np.clip((elev + 5000) / 9500, 0, 1); Image.fromarray((v * 255).astype(np.uint8)).resize((W // U, H // U)).save(build('elev_vis.png'))
