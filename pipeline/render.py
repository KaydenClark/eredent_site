"""Step 5: color texture (biomes + hillshade + water depth) on the source grid, then the equirectangular
globe textures (8K/4K color, 4K height, 16-bit elevation export, meta.json)."""
import numpy as np, cv2, json
from PIL import Image
from scipy import ndimage as nd
from common import CFG, U, build, TEX, DATA
import os

t = np.load(build('terrain.npz')); e = t['elev'].astype(np.float32); land = t['land']; lakes = t['lakes']
desert = t['desert']; wet = t['wet']; bayou = t['bayou']; snowhatch = t['snowhatch']; I = t['interior'].astype(np.float32); lat = t['lat']
lake_surface = t['lake_surface']
H, W = e.shape


def noise(s, seed):
    n = np.random.default_rng(seed).standard_normal((H // s + 2, W // s + 2)).astype(np.float32)
    return cv2.resize(n, (W, H), interpolation=cv2.INTER_CUBIC)


nA = nd.gaussian_filter(noise(8, 1), 2); nB = nd.gaussian_filter(noise(3, 2), 1); nC = noise(1, 3) * 0.5
# hillshade (sun from the northwest, 40 deg up), exaggerated so relief reads from orbit
px_m = CFG['planet']['km_per_outline_px_small'] * 1000 / U
gy, gx = np.gradient(nd.gaussian_filter(np.where(land, e, 0), 1.0) * 14, px_m)
slope = np.hypot(gx, gy)
az, alt = np.radians(315), np.radians(40)
lx, ly, lz = np.cos(alt) * np.sin(az), -np.cos(alt) * np.cos(az), np.sin(alt)
nx, ny = -gx, -gy; nn = np.sqrt(nx * nx + ny * ny + 1)
lam = np.clip((nx * lx + ny * ly + lz) / nn, 0, 1)
amb = np.clip(1 - 0.35 * np.clip(slope / 3, 0, 1), 0, 1)
shade = (0.40 + 0.85 * lam) * amb
# climate bands by latitude (proposed cut-offs, config)
CL = CFG['climate']; B = CL['bands_lat']
L = lat + 2.5 * nA


def band(a, b, w=4):
    return np.clip((L - a) / w + 0.5, 0, 1) * np.clip((b - L) / w + 0.5, 0, 1)


trop = band(*B['tropical']); temp = band(*B['temperate']); bor = band(*B['boreal']); tun = band(*B['tundra'])
tot = trop + temp + bor + tun + 1e-6
C = lambda *c: np.array(c, np.float32)
col_trop = C(44, 112, 38); col_temp = C(38, 78, 40); col_bor = C(28, 56, 46); col_tun = C(108, 106, 82)
forest = (trop[..., None] * col_trop + temp[..., None] * col_temp + bor[..., None] * col_bor + tun[..., None] * col_tun) / tot[..., None]
mont = np.clip((e - 600) / 1500, 0, 1)[..., None]
forest = forest * (1 - 0.35 * mont) + C(26, 52, 44) * 0.35 * mont
forest *= (0.84 + 0.18 * nB + 0.07 * nC + 0.06 * nA)[..., None]
clearing = (nA + 0.6 * nB > 1.35) & (L > 15)
forest[clearing] = forest[clearing] * 0.6 + C(92, 118, 62) * 0.4
# snowline by latitude (config table, interpolated) lowered where the biome map hatches snow
sl_tab = sorted((float(k), v) for k, v in CL['snowline_m_by_lat'].items())
snowline = np.interp(np.clip(np.abs(lat), 0, 89), [a for a, _ in sl_tab], [b for _, b in sl_tab]).astype(np.float32)
snowline = snowline - np.where(snowhatch, CL['snow_hatch_lowering_m'], 0)
treeline = snowline - CL['treeline_below_snowline_m']
alp = np.clip((e - treeline) / 350, 0, 1); snow = np.clip((e - snowline) / 250, 0, 1) * np.clip(0.6 + 0.8 * nB, 0, 1)
rock = C(118, 108, 98)
colr = forest * (1 - alp[..., None]) + rock * alp[..., None]
steep = np.clip((slope - 2.5) / 2.0, 0, 1)
colr = colr * (1 - 0.6 * steep[..., None]) + rock * 0.6 * steep[..., None]
colr = colr * (1 - snow[..., None]) + C(240, 244, 248) * snow[..., None]
dz = nd.gaussian_filter(desert.astype(np.float32), 3)
dcol = C(196, 158, 104) * (0.92 + 0.1 * nB)[..., None] + np.where(e > 600, 1, 0)[..., None] * C(-30, -35, -30)
colr = colr * (1 - dz[..., None]) + dcol * dz[..., None]
wz = nd.gaussian_filter(wet.astype(np.float32), 3)
wcol = C(52, 92, 50) * (0.9 + 0.15 * nB)[..., None]
colr = colr * (1 - wz[..., None]) + wcol * wz[..., None]
colr[bayou] = colr[bayou] * 0.35 + C(40, 92, 88) * 0.65
colr *= shade[..., None]
# water
d = np.clip(-e, 0, None)
sh = np.clip(d / 150, 0, 1)[..., None]
shallow = C(96, 172, 160) * (1 - sh) + C(34, 118, 128) * sh
dd = np.clip((d - 60) / 3000, 0, 1)[..., None]
deepc = C(32, 108, 138) * (1 - dd) + C(6, 24, 52) * dd
dd2 = np.clip((d - 3000) / 2500, 0, 1)[..., None]; deepc = deepc * (1 - dd2) + C(4, 15, 36) * dd2
Iw = np.clip(I, 0, 1)[..., None]
wcolr = shallow * Iw + deepc * (1 - Iw)
wcolr *= (0.93 + 0.07 * nA + 0.03 * nB)[..., None]
lk = lakes
ld = np.clip(nd.distance_transform_edt(lk) / (18 * U), 0, 1)[..., None]
lcol = C(60, 130, 160) * (1 - ld) + C(18, 60, 105) * ld
inner_deep = lk & (e < -200)
# soften the drawn pixel edge of the coast by about one source pixel; the penup line is the truth, its staircase is not
landf = nd.gaussian_filter(land.astype(np.float32), 1.6)[..., None]
lakef = nd.gaussian_filter(lk.astype(np.float32), 1.6)[..., None]
img = colr * landf + wcolr * (1 - landf)
img = img * (1 - lakef) + lcol * lakef
img[inner_deep] = C(8, 26, 62)
np.save(build('landf.npy'), (landf[..., 0] * (1 - lakef[..., 0])).astype(np.float32))
coastband = (nd.distance_transform_edt(~land) <= 1.5) & ~land & (I < 0.5)
img[coastband] = img[coastband] * 0.5 + C(200, 220, 225) * 0.5
img = np.clip(img, 0, 255).astype(np.uint8)
Image.fromarray(img).save(build('kiros_color_source.png'))

# reprojection to equirectangular
x0, y0, c, k = np.load(build('proj.npy')); cr = np.radians(c)
WE = CFG['web_export']; EW, EH = WE['equirect_w'], WE['equirect_h']
lat0, lat1 = WE['lat_range']; lon0, lon1 = WE['lon_range']
j0, j1 = int((90 - lat1) / 180 * EH), int((90 - lat0) / 180 * EH); i0, i1 = int((lon0 + 180) / 360 * EW), int((lon1 + 180) / 360 * EW)
jj, ii = np.mgrid[j0:j1, i0:i1].astype(np.float32)
phi = np.radians(90 - (jj + 0.5) * 180 / EH); lam_ = np.radians((ii + 0.5) * 360 / EW - 180)
cosr = np.clip(np.sin(cr) * np.sin(phi) + np.cos(cr) * np.cos(phi) * np.cos(lam_), -1, 1); rho = np.degrees(np.arccos(cosr))
th = np.arctan2(np.cos(phi) * np.sin(lam_), np.cos(cr) * np.sin(phi) - np.sin(cr) * np.cos(phi) * np.cos(lam_))
sx = (x0 + rho / k * np.sin(th)) * U; sy = (y0 - rho / k * np.cos(th)) * U
mapx, mapy = sx.astype(np.float32), sy.astype(np.float32)
np.savez_compressed(build('remap.npz'), mapx=mapx, mapy=mapy, window=np.array([j0, j1, i0, i1]))
abyss = (4, 16, 38)


def remap(a, interp=cv2.INTER_LINEAR, border=0):
    return cv2.remap(a, mapx, mapy, interp, borderMode=cv2.BORDER_CONSTANT, borderValue=border)


eq = np.zeros((EH, EW, 3), np.uint8); eq[:] = abyss
gn = cv2.resize(np.random.default_rng(5).standard_normal((EH // 64, EW // 64)).astype(np.float32), (EW, EH), interpolation=cv2.INTER_CUBIC)
eq = np.clip(eq.astype(np.float32) * (1 + 0.12 * gn[..., None]), 0, 255).astype(np.uint8)
patch = remap(img, border=abyss)
inside = (mapx >= 0) & (mapx < W - 1) & (mapy >= 0) & (mapy < H - 1)
edge = np.minimum.reduce([mapx, W - 1 - mapx, mapy, H - 1 - mapy]); fe = np.clip(edge / 120, 0, 1)[..., None]
reg = eq[j0:j1, i0:i1].astype(np.float32)
reg = np.where(inside[..., None], patch * fe + reg * (1 - fe), reg)
eq[j0:j1, i0:i1] = reg.astype(np.uint8)
Image.fromarray(eq).save(os.path.join(TEX, 'kiros_color_8k.jpg'), quality=88)
Image.fromarray(eq).resize((4096, 2048), Image.LANCZOS).save(os.path.join(TEX, 'kiros_color_4k.jpg'), quality=88)
# surface height for displacement (sea level = 0, lake surfaces flat), 8-bit 0..4500 m
surf = np.where(land, np.maximum(e, 0), 0).astype(np.float32)
surf = np.where(lk, lake_surface, surf)
hs = remap(surf)
hs8 = np.zeros((EH, EW), np.float32); hs8[j0:j1, i0:i1] = np.where(inside, hs, 0)
hs8 = cv2.resize(hs8, (4096, 2048), interpolation=cv2.INTER_AREA)
Image.fromarray(np.clip(hs8 / 4500 * 255, 0, 255).astype(np.uint8)).save(os.path.join(TEX, 'kiros_height_4k.png'))
# data exports (source grid)
Image.fromarray(np.clip(e + 6000, 0, 65535).astype(np.uint16)).save(build('kiros_elevation_m_plus6000_16bit.png'))
json.dump({'note': 'Elevation PNG stores meters+6000 (uint16). Grid = penup outline (1362x1155) upsampled 2x.',
           'projection': 'azimuthal equidistant', 'center_lat_deg': float(c), 'center_lon_deg': 0.0, 'center_px_outline': [float(x0), float(y0)],
           'deg_per_outline_px': float(k), 'km_per_outline_px_bonneville_ruler': CFG['planet']['km_per_outline_px_small']},
          open(os.path.join(DATA, 'kiros_meta.json'), 'w'), indent=1)
print('done', img.shape, eq.shape)
