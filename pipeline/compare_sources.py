"""Source comparison: register the newest map revision (kiros_earth_re, Drive 2026-10-10) onto the master grid
(penup_20260912_182533.jpg) and measure how it differs from the penup master. Standalone; it reads the originals and
writes only new files, never touching the pipeline's own outputs or any original image.

Writes
  public/data/source_comparison.json                    numbers, lake outlines (lat/lon), file inventory
  public/sources/derived/penup_lines_master.png          penup ink (coast, mountain marks, lakes), master frame, RGBA
  public/sources/derived/earth_re_lines_master.png       earth_re ink registered to the master frame, RGBA
  public/sources/derived/v5_on_master.png                kiros_v5 biome map registered to the master frame, RGBA
  public/sources/derived/kiros_map_a_northup.jpg         Kiros_Map_A rotated 90 deg counter-clockwise (north up)
  public/textures/overlay_penup_window.png               penup ink reprojected to the web window (lon -84..78, lat -14..84)
  public/textures/overlay_earth_re_window.png            earth_re ink, same window
  public/sources/previews/*.jpg, public/sources/thumbs/*.jpg   gallery copies of every source image

Method (no OpenCV needed: numpy + scipy + Pillow)
  * Frame tests: earth_re, kiros_v5 and saphaun_drawn_* are compared pixel by pixel against the clean coastline base
    'Copy of saphaun_drawn_Empty.jpg' box-downsampled 2x. Pixels that differ from the base are the hand-drawn additions.
  * Registration: iterative closest point between coastline ink pixels (earth_re ink minus its additions) and the
    penup ink, starting from a bounding-box similarity, robust trimming with a shrinking distance gate, first affine
    then full homography (the model register.py uses). Inliers = moved ink pixels within 2 px of penup ink.
  * Penup classes: blue ink = lakes (rule from masks.py); grey ink split into coast and mountain marks by the
    land/water nesting-parity rule of masks.py (a mark is ink with land on all sides).
  * earth_re classes: additions split by color (blue = lakes, everything else = brown mountain marks); the rest of
    the ink is the coastline of the base.
  * Lake area = region inside the ink line's center (ink pixels closer to the inside than to the outside count as
    lake). Areas use the azimuthal-equidistant area factor sin(rho)/rho, so they are true sphere areas.

Run from the repo root:  python pipeline/compare_sources.py
"""
import datetime, glob, hashlib, io, json, math, os, re, sys, zlib

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CFG, ROOT, latlon_from_px, px_from_latlon  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

P = lambda *a: os.path.join(ROOT, *a)  # noqa: E731
PENUP = P('pipeline', 'source', 'penup_20260912_182533.jpg')
OUTLINE = P('pipeline', 'source', 'ca093ac3-1b33-4003-87ab-232136e9d27b.png')
V5 = P('pipeline', 'source', 'kiros_v5.png')
EARTH_RE = P('docs', 'drive-source', 'kiros_earth_re.png')
SAPHAUN = P('docs', 'drive-source', 'Copy of saphaun_drawn_Empty.jpg')
SAPHAUN_EDIT = P('maps', 'saphaun_drawn_edit.jpg')
MAP_A = P('docs', 'drive-source', 'Kiros_Map_A.jpg')
PREVIOUS = P('docs', 'drive-source', 'Kiros_map_previous.jpg')
SCAN_2024 = P('maps', '20240812_184702.jpg')
MAP_WEST = P('maps', 'Map_West_Mountains_Trees.JPG')
PDF = P('maps', 'Kiros Colored.pdf')

OUT_DERIVED = P('public', 'sources', 'derived')
OUT_PREV = P('public', 'sources', 'previews')
OUT_THUMB = P('public', 'sources', 'thumbs')
OUT_TEX = P('public', 'textures')
OUT_JSON = P('public', 'data', 'source_comparison.json')
DEBUG = os.environ.get('KIROS_COMPARE_DEBUG')  # optional folder for check images

PL = CFG['placement']
X0, Y0 = PL['center_px_outline']
CLAT, KDEG = PL['center_lat_deg'], PL['deg_per_outline_px']
R_SMALL = CFG['planet']['options']['small']['radius_km']
R_EARTH = CFG['planet']['options']['earth']['radius_km']
KM_PX_SMALL = math.radians(KDEG) * R_SMALL           # 2.2453 km per master px (the Bonneville ruler)
KM_PX_EARTH = math.radians(KDEG) * R_EARTH
META = json.load(open(P('public', 'data', 'kiros_meta.json'), encoding='utf-8'))
WIN = META['web']['window_deg']
WIN_W, WIN_H = META['web']['height16']['size']

COL_LAKE = (0x2f, 0x6f, 0xff)
COL_MTN = (0xb8, 0x74, 0x2a)
COL_COAST = (0x5a, 0x5a, 0x5a)


# ----------------------------------------------------------------------------------------------- small helpers
def md5(path):
    return hashlib.md5(open(path, 'rb').read()).hexdigest()


def rel(path):
    return os.path.relpath(path, ROOT).replace('\\', '/')


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int16)


def blue_ink(a):
    """Blue ink rule from masks.py."""
    return (a[..., 2] > a[..., 0] + 40) & (a[..., 2] > a[..., 1] + 15)


def apply_h(H, pts):
    q = np.c_[pts, np.ones(len(pts))] @ H.T
    return q[:, :2] / q[:, 2:3]


def jac_det(H, pts):
    """|det J| of the homography at each point (area scale moving -> fixed)."""
    x, y = pts[:, 0], pts[:, 1]
    w = H[2, 0] * x + H[2, 1] * y + H[2, 2]
    return np.abs(np.linalg.det(H)) / np.abs(w) ** 3


def fit_affine(p, q):
    X = np.c_[p, np.ones(len(p))]
    M = np.linalg.lstsq(X, q, rcond=None)[0]
    return np.vstack([M.T, [0, 0, 1]])


def fit_homography(p, q):
    x, y = p[:, 0], p[:, 1]; u, v = q[:, 0], q[:, 1]; z = np.zeros_like(x); o = np.ones_like(x)
    M = np.r_[np.c_[x, y, o, z, z, z, -x * u, -y * u], np.c_[z, z, z, x, y, o, -x * v, -y * v]]
    h = np.linalg.lstsq(M, np.r_[u, v], rcond=None)[0]
    return np.r_[h, 1].reshape(3, 3)


def fit_similarity(p, q):
    """Least-squares similarity (scale, rotation, translation) p -> q."""
    pm, qm = p.mean(0), q.mean(0); pc, qc = p - pm, q - qm
    a = (pc[:, 0] * qc[:, 0] + pc[:, 1] * qc[:, 1]).sum() / (pc ** 2).sum()
    b = (pc[:, 0] * qc[:, 1] - pc[:, 1] * qc[:, 0]).sum() / (pc ** 2).sum()
    A = np.array([[a, -b], [b, a]])
    t = qm - A @ pm
    return np.array([[a, -b, t[0]], [b, a, t[1]], [0, 0, 1.0]])


def bbox_similarity(mov_pts, fix_pts):
    a = np.percentile(mov_pts, [0.5, 99.5], axis=0); b = np.percentile(fix_pts, [0.5, 99.5], axis=0)
    s = float(np.mean((b[1] - b[0]) / (a[1] - a[0])))
    t = (b[0] + b[1]) / 2 - s * (a[0] + a[1]) / 2
    return np.array([[s, 0, t[0]], [0, s, t[1]], [0, 0, 1.0]])


def icp_register(mov_mask, fix_mask, H0, gates=(40, 25, 15, 10, 6, 4, 3, 3, 2.5, 2.5, 2.5, 2.5), seed=0):
    """Register ink pixels of mov_mask onto ink pixels of fix_mask. Returns dict with both models and stats."""
    dt, ind = nd.distance_transform_edt(~fix_mask, return_indices=True)
    ys, xs = np.nonzero(mov_mask); pts = np.c_[xs, ys].astype(np.float64)
    rng = np.random.default_rng(seed)
    sub = pts[rng.choice(len(pts), min(25000, len(pts)), replace=False)]
    Hh, Wf = fix_mask.shape

    def nearest(H, p):
        q = apply_h(H, p)
        xi = np.clip(np.round(q[:, 0]).astype(int), 0, Wf - 1); yi = np.clip(np.round(q[:, 1]).astype(int), 0, Hh - 1)
        out = (q[:, 0] < -0.5) | (q[:, 0] > Wf - 0.5) | (q[:, 1] < -0.5) | (q[:, 1] > Hh - 0.5)
        d = np.where(out, 1e9, dt[yi, xi])
        nn = np.c_[ind[1][yi, xi], ind[0][yi, xi]].astype(np.float64)
        return q, d, nn

    res = {}
    H = H0.copy()
    for model, fit in (('affine', fit_affine), ('homography', fit_homography)):
        for g in gates:
            _, d, nn = nearest(H, sub)
            k = d < g
            H = fit(sub[k], nn[k])
        _, d, _ = nearest(H, pts)
        inl = d <= 2.0
        res[model] = {
            'matrix': H.copy(),
            'points': int(len(pts)),
            'inliers_2px': int(inl.sum()),
            'inlier_fraction_2px': float(inl.mean()),
            'within_1px': float((d <= 1).mean()),
            'median_px': float(np.median(d)),
            'rms_inliers_px': float(np.sqrt((d[inl] ** 2).mean())),
        }
    best = max(res, key=lambda m: (round(res[m]['inlier_fraction_2px'], 3), -res[m]['rms_inliers_px']))
    res['chosen'] = best
    return res


def warp_float(src, Hinv, out_shape, order=1, cval=0.0):
    """Sample src (H,W[,C]) at Hinv @ (x,y,1) for every output pixel (Hinv maps output -> source)."""
    hh, ww = out_shape
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float64)
    q = apply_h(Hinv, np.c_[xx.ravel(), yy.ravel()])
    coords = [q[:, 1].reshape(hh, ww), q[:, 0].reshape(hh, ww)]
    if src.ndim == 2:
        return nd.map_coordinates(src.astype(np.float32), coords, order=order, cval=cval)
    return np.stack([nd.map_coordinates(src[..., c].astype(np.float32), coords, order=order, cval=cval)
                     for c in range(src.shape[2])], -1)


def trace_boundary(mask):
    """Moore-neighbour trace of the outer boundary of the largest component. Returns (N,2) x,y pixel centers."""
    lab, n = nd.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return np.zeros((0, 2))
    if n > 1:
        sizes = nd.sum(mask, lab, range(1, n + 1)); mask = lab == (np.argmax(sizes) + 1)
    m = np.pad(mask, 1)
    ys, xs = np.nonzero(m)
    start = (ys[0], xs[0])                       # top-most, then left-most
    ring = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]   # clockwise from W
    p = start; b = (start[0], start[1] - 1)
    out = [p]
    for _ in range(4 * m.size):
        d = (b[0] - p[0], b[1] - p[1]); i = ring.index(d)
        found = None
        for k in range(1, 9):
            dy, dx = ring[(i + k) % 8]
            c = (p[0] + dy, p[1] + dx)
            if m[c]:
                found = c; break
            b = c
        if found is None:
            break                                # isolated pixel
        p = found
        if p == start and len(out) > 2:
            break
        out.append(p)
    a = np.array(out, np.float64) - 1
    return np.c_[a[:, 1], a[:, 0]]


def rdp(pts, eps):
    """Ramer-Douglas-Peucker for an open polyline."""
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]; L = np.hypot(*seg)
        rel_ = pts[a + 1:b] - pts[a]
        d = np.abs(seg[0] * rel_[:, 1] - seg[1] * rel_[:, 0]) / L if L > 0 else np.hypot(rel_[:, 0], rel_[:, 1])
        j = int(np.argmax(d))
        if d[j] > eps:
            keep[a + 1 + j] = True; stack += [(a, a + 1 + j), (a + 1 + j, b)]
    return pts[keep]


def simplify_closed(pts, max_pts=80):
    if len(pts) <= max_pts:
        return pts
    j = int(np.argmax(np.hypot(*(pts - pts[0]).T)))
    eps = 0.3
    while True:
        s = np.r_[rdp(pts[:j + 1], eps)[:-1], rdp(np.r_[pts[j:], pts[:1]], eps)[:-1]]
        if len(s) <= max_pts:
            return s
        eps *= 1.25


def area_factor(px, py):
    """True sphere area per master px^2, relative to the ruler scale (azimuthal equidistant: sin(rho)/rho)."""
    rho = np.radians(np.hypot(px - X0, py - Y0) * KDEG)
    return np.where(rho < 1e-9, 1.0, np.sin(rho) / np.maximum(rho, 1e-9))


def gc_km(lat1, lon1, lat2, lon2, R):
    p1, p2 = np.radians(lat1), np.radians(lat2); dl = np.radians(lon2 - lon1)
    c = np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(dl)
    return float(R * np.arccos(np.clip(c, -1, 1)))


def ll(px, py):
    la, lo = latlon_from_px(np.asarray(px, float), np.asarray(py, float), X0, Y0, CLAT, KDEG)
    return la, lo


def r2(v, n=2):
    return float(round(float(v), n))


# ----------------------------------------------------------------------------------------------- penup classes
def penup_land_and_marks():
    """Port of masks.py: land by nesting parity over the black-ink outline; mountain marks = ink with land on all sides."""
    L = np.asarray(Image.open(OUTLINE).convert('L'))
    lines = nd.binary_dilation(L < 140, iterations=1)
    H, W = lines.shape
    lab, n = nd.label(~lines)
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
    depth = np.full(n + 1, -1); q = list(border)
    for r in border:
        depth[r] = 0
    while q:
        nq = []
        for r in q:
            for s in adj[r]:
                if depth[s] < 0:
                    depth[s] = depth[r] + 1; nq.append(s)
        q = nq
    depth[depth < 0] = 1
    isl = depth % 2 == 1
    idx = nd.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
    land = isl[lab[idx[0], idx[1]]]
    Pp = rgb(PENUP)
    blue = blue_ink(Pp)
    bl, bn = nd.label(nd.binary_dilation(blue, iterations=1))
    lakes = np.zeros_like(land)
    for i in range(1, bn + 1):
        c = bl == i
        if c.sum() > 80:
            lakes |= nd.binary_erosion(nd.binary_fill_holes(c), iterations=2)
    land = land | lakes
    wl, wn = nd.label(~land)
    sz = nd.sum(~land, wl, range(1, wn + 1)); main = int(np.argmax(sz)) + 1
    dmain = nd.distance_transform_edt(wl != main)
    for i in range(1, wn + 1):
        if i != main and sz[i - 1] < 400 and dmain[wl == i].min() > 15:
            land |= wl == i
    raw = L < 140
    water = ~land
    ring = lakes ^ nd.binary_erosion(lakes, iterations=2)
    glyph = raw & ~nd.binary_dilation(water, iterations=3) & ~nd.binary_dilation(ring, iterations=4)
    return land, glyph, Pp, blue


def penup_classes():
    land, glyph, Pp, blue = penup_land_and_marks()
    g = Pp.mean(-1)
    ink = (g < 185) & ~nd.binary_dilation(blue, iterations=2)       # grey ink of the penup photo
    glyph_zone = nd.binary_dilation(glyph, iterations=2)
    # a mark is a whole separate stroke: mostly in the glyph zone, open (not a tiny island loop), not a dot.
    # Coast pieces of the fractal archipelago that the parity rule flips are attached to coast lines or closed.
    lab, n = nd.label(ink, structure=np.ones((3, 3)))
    idx = np.arange(1, n + 1)
    frac = nd.mean(glyph_zone, lab, idx); size = nd.sum(ink, lab, idx)
    objs = nd.find_objects(lab)
    keep = []
    for i, f, s in zip(idx, frac, size):
        if f > 0.6 and s >= 15:
            c = lab[objs[i - 1]] == i
            if (nd.binary_fill_holes(c) & ~c).sum() < 4:
                keep.append(i)
    marks = np.isin(lab, keep)
    # strokes hugging coast lines (median < 6 px away) are coast fragments of the archipelago, not marks
    dtc = nd.distance_transform_edt(~(ink & ~marks))
    med = nd.median(dtc, lab, keep) if keep else []
    marks = np.isin(lab, [i for i, m in zip(keep, med) if m >= 6])
    coast = ink & ~marks
    lake_ink = blue
    return dict(land=land, coast=coast, marks=marks, lake_ink=lake_ink, glyph_outline=glyph)


# ----------------------------------------------------------------------------------------------- lakes
def loop_regions(lake_ink, min_px=12):
    """Closed blue loops -> list of dicts with the centerline region (bool mask) and the ink component."""
    lab, n = nd.label(nd.binary_dilation(lake_ink, iterations=1), structure=np.ones((3, 3)))
    loops = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < min_px:
            continue
        gap = 0; cc = comp; filled = nd.binary_fill_holes(comp)
        while (filled & ~cc).sum() < 3 and gap < 6:            # open loop: thicken the ink until the gap closes,
            gap += 1                                            # fill, then shrink the filled shape back by the same amount
            cc = nd.binary_dilation(comp, structure=np.ones((3, 3)), iterations=gap)
            filled = nd.binary_fill_holes(cc)
        if (filled & ~cc).sum() < 3:
            continue
        if gap:
            filled = nd.binary_erosion(filled, structure=np.ones((3, 3)), iterations=gap) | comp
        interior = filled & ~comp
        if interior.sum() < 3:
            continue
        outside = ~filled
        d_out = nd.distance_transform_edt(~outside); d_in = nd.distance_transform_edt(~interior)
        region = interior | (comp & (d_in <= d_out))
        n_holes = nd.label(interior)[1]
        loops.append(dict(region=region, filled=filled, ink=comp, gap_closed_px=gap, interior_parts=int(n_holes)))
    # nest: a loop inside another loop's filled area is an inner loop of that lake
    for a in loops:
        a['parent'] = None
        ya, xa = np.nonzero(a['ink'])
        for j, b in enumerate(loops):
            if b is not a and b['filled'][ya, xa].mean() > 0.95 and b['filled'].sum() > a['filled'].sum():
                a['parent'] = j
    return loops


def lake_name(cx, cy):
    """Selection rules from pipeline/config.json lakes.*.select (master px)."""
    if cx < 600:
        return 'veir'
    if 780 < cx < 960 and cy < 480:
        return 'sfere'
    if cx > 1000 and cy > 600:
        return 'dire'
    return 'unnamed_%d_%d' % (cx, cy)


def lake_record(region_src, H=None):
    """Measure a lake region given in a source frame (H maps source px -> master px; None = already master)."""
    ys, xs = np.nonzero(region_src)
    pts = np.c_[xs, ys].astype(np.float64)
    if H is None:
        mp, w = pts, np.ones(len(pts))
    else:
        mp, w = apply_h(H, pts), jac_det(H, pts)
    af = area_factor(mp[:, 0], mp[:, 1])
    area_px = float(w.sum())
    true_small = float((w * af).sum() * KM_PX_SMALL ** 2)
    cx, cy = np.average(mp[:, 0], weights=w * af), np.average(mp[:, 1], weights=w * af)
    la, lo = ll(cx, cy)
    poly = trace_boundary(region_src)
    if H is not None:
        poly = apply_h(H, poly)
    poly_s = simplify_closed(poly, 80)
    pla, plo = ll(poly_s[:, 0], poly_s[:, 1])
    x0, y0 = mp.min(0); x1, y1 = mp.max(0)
    # principal axes (in true km on the small world, approximately)
    cov = np.cov(np.c_[mp[:, 0] - cx, mp[:, 1] - cy].T, aweights=w)
    ev, evec = np.linalg.eigh(cov)
    major = evec[:, 1]
    ang = math.degrees(math.atan2(major[0], -major[1])) % 180      # 0 = north-south, 90 = east-west
    bla, blo = ll(np.array([x0, x1, x0, x1]), np.array([y0, y0, y1, y1]))
    return {
        'name': lake_name(cx, cy),
        'area_master_px2': r2(area_px, 1),
        'area_km2_small_world': r2(true_small, 0),
        'area_km2_earth_sized': r2(true_small * (R_EARTH / R_SMALL) ** 2, 0),
        'area_km2_small_world_flat_ruler': r2(area_px * KM_PX_SMALL ** 2, 0),
        'centroid_px': [r2(cx, 1), r2(cy, 1)],
        'centroid_latlon': [r2(la, 3), r2(lo, 3)],
        'bbox_px': [r2(x0, 1), r2(y0, 1), r2(x1, 1), r2(y1, 1)],
        'bbox_latlon': {'lat': [r2(bla.min(), 3), r2(bla.max(), 3)], 'lon': [r2(blo.min(), 3), r2(blo.max(), 3)]},
        'length_km_small_world_approx': r2(4 * math.sqrt(ev[1]) * KM_PX_SMALL, 0),
        'width_km_small_world_approx': r2(4 * math.sqrt(max(ev[0], 0)) * KM_PX_SMALL, 0),
        'long_axis_bearing_deg': r2(ang, 1),
        'outline_latlon': [[r2(a, 4), r2(b, 4)] for a, b in zip(pla, plo)],
        'outline_points': int(len(poly_s)),
    }


def lakes_for(lake_ink, H=None, src_label=''):
    loops = loop_regions(lake_ink)
    out = []
    for i, lp in enumerate(loops):
        if lp['parent'] is not None:
            continue
        rec = lake_record(lp['region'], H)
        rec['ink_loop_closed'] = lp['gap_closed_px'] == 0
        rec['gap_closed_px'] = lp['gap_closed_px']
        rec['interior_parts'] = lp['interior_parts']
        inner = [lake_record(c['region'], H) for c in loops if c['parent'] == i]
        rec['inner_depression'] = None
        if inner:
            d = inner[0]; d.pop('name')
            rec['inner_depression'] = d
        out.append(rec)
    out.sort(key=lambda r: r['name'])
    return out, loops


# ----------------------------------------------------------------------------------------------- mountain marks
def mark_components(marks_src, H=None, land_lab=None, land_names=None, min_px=6):
    lab, n = nd.label(marks_src, structure=np.ones((3, 3)))
    comps = []
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < min_px:
            continue
        ys, xs = np.nonzero(m); pts = np.c_[xs, ys].astype(float)
        boundary = m & ~nd.binary_erosion(m)
        if H is None:
            mp, s = pts, 1.0
        else:
            mp = apply_h(H, pts); s = float(np.sqrt(jac_det(H, pts).mean()))
        cx, cy = mp.mean(0)
        length_px = boundary.sum() / 2.0 * s                         # thin stroke: perimeter ~ 2 x length
        comps.append({'cx': cx, 'cy': cy, 'pts': mp, 'length_px': float(length_px), 'ink_px': int(m.sum())})
    boxes = {k: v['box'] for k, v in CFG['ranges'].items() if not k.startswith('_')}
    for c in comps:
        c['ranges'] = [k for k, (a, b, y0, y1) in boxes.items() if a <= c['cx'] <= b and y0 <= c['cy'] <= y1]
        if land_lab is not None:
            xi = np.clip(np.round(c['pts'][:, 0]).astype(int), 0, land_lab.shape[1] - 1)
            yi = np.clip(np.round(c['pts'][:, 1]).astype(int), 0, land_lab.shape[0] - 1)
            labs = land_lab[yi, xi]
            c['landmass'] = land_names.get(int(np.bincount(labs).argmax()), 'unknown')
    return comps


def summarize_marks(comps):
    names = [k for k in CFG['ranges'] if not k.startswith('_')]
    out = {}
    for name in names + ['outside_all_boxes']:
        sel = [c for c in comps if (name in c['ranges'])] if name != 'outside_all_boxes' else [c for c in comps if not c['ranges']]
        if not sel:
            out[name] = {'strokes': 0, 'length_km_small_world': 0}
            continue
        pts = np.vstack([c['pts'] for c in sel])
        L = sum(c['length_px'] for c in sel)
        cov = np.cov(pts.T); ev, evec = np.linalg.eigh(cov); major = evec[:, 1]
        ang = math.degrees(math.atan2(major[0], -major[1])) % 180
        la, lo = ll(pts[:, 0], pts[:, 1])
        out[name] = {
            'strokes': len(sel),
            'length_km_small_world': r2(L * KM_PX_SMALL, 0),
            'length_master_px': r2(L, 0),
            'extent_px': [r2(pts[:, 0].min(), 0), r2(pts[:, 1].min(), 0), r2(pts[:, 0].max(), 0), r2(pts[:, 1].max(), 0)],
            'extent_lat': [r2(la.min(), 2), r2(la.max(), 2)], 'extent_lon': [r2(lo.min(), 2), r2(lo.max(), 2)],
            'elongation': r2(math.sqrt(ev[1] / max(ev[0], 1e-6)), 1),
            'trend_bearing_deg': r2(ang, 0),
            'landmasses': sorted(set(c.get('landmass', '') for c in sel)),
        }
    by_land = {}
    for c in comps:
        k = c.get('landmass', 'unknown')
        d = by_land.setdefault(k, {'strokes': 0, 'length_km_small_world': 0.0})
        d['strokes'] += 1; d['length_km_small_world'] += c['length_px'] * KM_PX_SMALL
    for d in by_land.values():
        d['length_km_small_world'] = r2(d['length_km_small_world'], 0)
    return {'by_config_range_box': out, 'by_landmass': by_land, 'total_strokes': len(comps),
            'total_length_km_small_world': r2(sum(c['length_px'] for c in comps) * KM_PX_SMALL, 0)}


def angular_coverage(comps, cx, cy, radius_px, sectors=16):
    """Which of `sectors` directions around (cx,cy) contain mark ink within radius_px."""
    occ = np.zeros(sectors, bool)
    for c in comps:
        d = c['pts'] - [cx, cy]; r = np.hypot(d[:, 0], d[:, 1]); k = r <= radius_px
        if k.any():
            a = (np.degrees(np.arctan2(d[k, 0], -d[k, 1])) % 360) // (360 / sectors)
            occ[np.unique(a.astype(int))] = True
    dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return {'sectors_with_marks': int(occ.sum()), 'of': sectors, 'directions': [dirs[i] for i in np.nonzero(occ)[0]]}


# ----------------------------------------------------------------------------------------------- rasters
def rgba_from_classes(shape, layers):
    """layers: list of (alpha float array 0..1, color) painted in order."""
    out = np.zeros(shape + (4,), np.float32)
    for a, col in layers:
        a = np.clip(a, 0, 1)[..., None]
        c = np.array(list(col) + [1.0], np.float32); c[:3] /= 255
        out = c * a + out * (1 - a)                     # premultiplied "over"
    alpha = out[..., 3:4]
    out[..., :3] = np.where(alpha > 1e-6, out[..., :3] / np.maximum(alpha, 1e-6), 0)   # back to straight alpha for PNG
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def window_lookup():
    """Master px coordinates for every pixel of the web window texture (row 0 = north)."""
    lon0, lon1 = WIN['lon']; lat0, lat1 = WIN['lat']
    jj, ii = np.mgrid[0:WIN_H, 0:WIN_W].astype(np.float64)
    lon = lon0 + (ii + 0.5) / WIN_W * (lon1 - lon0)
    lat = lat1 - (jj + 0.5) / WIN_H * (lat1 - lat0)
    px, py = px_from_latlon(lat, lon, X0, Y0, CLAT, KDEG)
    return px, py


def to_window(master_alpha, px, py, min_width=True):
    a = nd.map_coordinates(master_alpha.astype(np.float32), [py, px], order=1, cval=0.0)
    if min_width:                                    # at least ~2 px wide on the 4096 grid
        a = np.maximum(a, nd.maximum_filter(a, size=2) * 0.9)
    return np.clip(a * 1.6, 0, 1)


# ----------------------------------------------------------------------------------------------- crop locator
def locate_by_ncc(mov_ink, fix_ink, scales):
    """Coarse search for scale + translation of mov inside fix (both bool). Returns (score, H mov->fix)."""
    fb = nd.gaussian_filter(fix_ink.astype(np.float32), 2)
    fb = (fb - fb.mean()) / (fb.std() + 1e-6)
    best = (-1, None)
    for s in scales:
        h, w = int(mov_ink.shape[0] * s), int(mov_ink.shape[1] * s)
        if h > fix_ink.shape[0] or w > fix_ink.shape[1] or h < 20:
            continue
        m = np.asarray(Image.fromarray((mov_ink * 255).astype(np.uint8)).resize((w, h), Image.BOX)).astype(np.float32) / 255
        m = nd.gaussian_filter(m, 2); m = (m - m.mean()) / (m.std() + 1e-6)
        cc = signal.fftconvolve(fb, m[::-1, ::-1], mode='valid') / m.size
        j = np.unravel_index(np.argmax(cc), cc.shape)
        if cc[j] > best[0]:
            best = (float(cc[j]), np.array([[s, 0, j[1]], [0, s, j[0]], [0, 0, 1.0]]))
    return best


# ----------------------------------------------------------------------------------------------- PDF
def pdf_single_image(path):
    """Return (PIL image, note) when the PDF's page is one embedded JPEG drawn over the whole page, else (None, note)."""
    b = open(path, 'rb').read()
    imgs = []
    for m in re.finditer(rb'(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n', b, re.S):
        d = m.group(2)
        if b'/Subtype/Image' in d.replace(b' ', b'') and b'DCTDecode' in d:
            L = int(re.search(rb'/Length (\d+)', d).group(1))
            imgs.append(b[m.end():m.end() + L])
    pages = len(re.findall(rb'/Type\s*/Page[^s]', b))
    if pages == 1 and len(imgs) == 1:
        return Image.open(io.BytesIO(imgs[0])), 'page 1 is a single embedded JPEG drawn over the whole page; preview taken from it'
    return None, 'PDF-only: not a single-image page and no PDF renderer installed'


# ----------------------------------------------------------------------------------------------- file inventory
DESCRIPTIONS = {
    # md5 -> (frame, description). Factual: what is visibly drawn. Frames: see frame_legend in the JSON.
    'c5f51bc6ad4f0cd0d8da1002aebe97dc': ('master', 'Penup drawing (photo, 1362x1155): grey-ink coastlines of all landmasses and island chains, grey zigzag mountain marks (a ring of marks around Lake Veir, NW Fiira, the north isle, Roan, NE isles, Malos spine, Dragon isle), blue-ink lake outlines: Lake Veir (with three small marks inside), Sfere, Dire Lake with a small inner loop. No labels. The master grid of the 3D terrain.'),
    'ae21588828c3d0605d6463ba5ab5b891': ('master', 'Same drawing as the penup master in black ink, pixel-aligned with it (lake outlines also black). Used by the pipeline for the land/water parity rule.'),
    '961ee86a5582a776dfe64d91df479db1': ('v5-frame', 'Biome map: the saphaun coastline scan with colored marker zones (green hatching, light-green/teal/yellow/purple region outlines), brown zigzag mountain marks (ring around Lake Veir, Malos spine, Dragon isle, north isles), blue lakes (Veir, Sfere, Dire with a filled dark-blue inner area), and a hand-drawn N/E/S/W compass.'),
    '7dc4c86b258d25f6159d4b1cd4728bf7': ('v5-frame', 'Newest revision (Drive 2026-10-10): the clean saphaun coastline scan with new marks only: small blue lake loops (Veir, a tiny Sfere loop, a narrow Dire Lake with no inner loop) and brown zigzag mountain lines (NW Fiira diagonal, one Veir diagonal line east of the lake, two Roan lines, the Malos spine along the east coast, a short mark on Dragon isle). No marks on the northern islands, no labels.'),
    '92dee7a866a2634f15ced0ab2fff1c17': ('v5-frame', 'Clean coastline-only scan (2416x1908): black/grey ink coastlines, island chains and dotted lines, no marks, no lakes, no labels. It is the base of kiros_v5, kiros_earth_re and saphaun_drawn_edit at exactly 2x.'),
    '1b2279e550a517af3c494befd9a3bfac': ('v5-frame', 'The saphaun coastline scan (2x frame) with brown zigzag mountain lines (NW Fiira, two lines flanking a light-blue Lake Veir, north isle, Roan north range plus two short lines, Dragon isle, Malos spine along the east and south) and light-blue lake outlines (Veir, a small Sfere, a large Dire Lake without inner loop).'),
    '30ffb40d5c643bf2e8b2b88c9f93a194': ('photo-unregistered', 'Photo of the printed saphaun coastline in a black frame with colored marker annotations (brown mountain zigzags, blue lakes, teal/green/purple/pink zone outlines) and a handwritten legend in the lower left (readable words include Tropical, Pine Tree, Swamp, Deep, Islands). Perspective photo, not registered.'),
    '291dc7de78d9aeefb09dc9c0e024d3a0': ('rotated-older', 'Older pencil map on sketchbook paper, drawn with north to the right of the page: shaded coastlines, many small islands in the central sea, hatched mountain ranges, a lake in the western continent, a heart-shaped lake in the crescent-shaped south-eastern continent, faint pencil rivers. No labels. Rotate 90 deg counter-clockwise for north up.'),
    'fbe948291c2f30557e528c354732c665': ('older-unregistered', 'Older colored-pencil map with handwritten labels (KIROS title, compass with N up). Readable names include Icla Islands, Ice Sea, goblin mountains, Jerr Islands, North Ocean, Snow Islands, Forner, Elf sea, Sfere, Arris, Leasi, Thiefs sea, Bose, Ener, Ender sea, Terra, Core, Capet, Rongle, Veir, Jorgum, Ignas, Fiy, Glem, Tolken, Mysreal, Anrel, Creat, Noc, Dire, Malos spine, lake Dire, Diron, Oasis, Trades sea, Dragon Islands, Dragon sea, Orc Ocean. Blue rivers, black zigzag mountain lines, a white circle west of Veir.'),
    'fba52a2a73028d0797c7fcfd893de099': ('older-unregistered', 'PDF (1 page, letter size, created 2016-07-28): a scan of the same older colored-pencil labeled map, placed with north toward the left side of the page (rotate 90 deg clockwise for north up).'),
    '6740c3d3eee03d7ac82fca463f3fd9e5': ('older-unregistered', 'Older labeled pencil-and-marker map on spiral-notebook paper, north up (compass lower left), in a layout like Map A rotated north-up, with blue lakes (Veir, the Sfere/Arris lake, a heart-shaped lake near Diron), blue rivers, dark-green tree-hatched areas, hatched mountains, an equator line in the south-west, and handwritten names (e.g. Icala Islands, Jerr Islands, Snow Islands, North Ocean, Thiefs Sea, Ender Sea, Veir Mountains, Malos Spine, Trades Sea, Dragon Islands, Dragon Sea, Orc Ocean).'),
    'acc14127824f0a1e333e6a1db5581a9f': ('outline-scan', 'Scan of the coastline outline in black ink on cream grid paper (2344x1926): same coastlines and island chains as the master, no marks, no lakes, no labels. Its own frame (registered to the master below).'),
    '38f92221a97a879d916bc0de6e8ef9cc': ('v5-frame-crop', 'Crop of the western part of the saphaun coastline (Fiira, Ender, Dragon isle and the north isle) with black stamped symbols: mountain triangles, round deciduous trees, palm trees, and blue wave symbols where Lake Veir sits.'),
    'bc45219de8142d5e372c1fbee4961ad1': ('painted-derivative', 'Painted annotated render made from the penup master ("Kiros at Earth size"): labels FIIRA, ROAN, MALOS, ENDER, DRAGON ISLE, GOBLIN MTNS ISLE, Lake Veir, Sfere, Dire Lake, Caspian Sea and Lake Bonneville comparison overlays, latitude lines 0-75 N, 0-4000 km scale bar, area figures.'),
    'c4d7bd9fd7ed4b3e7af98e606a98107c': ('painted-derivative', 'AI-painted illustration titled "Kiros - revised Earth-sized concept": labels FIIRA, ENDER, ROAN, CREATE, MALOS, DRAGON ISLANDS, Lake Veir, Veir Mountains, Sfere, Dire Lake, Malos Spine, North Ocean, Ice Sea, Dragon Sea, Orc Ocean; small lakes and mountain lines placed like kiros_earth_re; footer says lake areas not yet calibrated.'),
    '003f0d45a068142215afd575f952855a': ('painted-derivative', 'AI-painted fantasy-style map of the older labeled geometry (compass, mile scale bar, decorative border): Elf Sea, Thief Sea, Trades Sea, Ice Sea, North Ocean, Orc Ocean, Ender Sea, Dragon Sea; Veir, Sfere, Lake Dire; Goblin Mountains, Veir Mountains, Malos Spine; towns Cae, Capet, Terra, Rongle, Anrel, Mysreal, Togum, Tolkien, Fiy, Glem, Iganas, Forner, Arris, Leani, Crest, Noc, Dire, Diron, Bose, Oasis; a castle drawing.'),
    '993943f2784a0286cc0f633bc435cc1d': ('painted-derivative', 'AI-painted map of the master coastline (no labels, compass rose, unlabeled scale bar): desert western coast and Ender island, large dark Lake Veir, Roan lake south of a mountain line, Dire Lake, snowy northern islands.'),
    '6498797c428a4259d930224ed5406724': ('painted-derivative', 'AI-painted map of the master coastline (no labels, compass rose, 0-1000 km scale bar): desert western coast, Lake Veir inside a ring of mountains, a large Roan lake in the north, light-blue shallow Dire Lake area, snowy northern islands.'),
}

FRAME_LEGEND = {
    'master': 'penup master grid (1362x1155), the grid the 3D terrain is built on',
    'v5-frame': 'the saphaun coastline scan frame shared by kiros_v5 / kiros_earth_re (1208x954) and saphaun_drawn_* (2416x1908 = exactly 2x); registered to the master by the matrix in registration',
    'v5-frame-crop': 'a crop/scale of the v5 frame (see registration.extra)',
    'outline-scan': 'same coastline drawing, its own scan frame; registered to the master in registration.extra',
    'rotated-older': 'older geometry drawn rotated relative to north-up',
    'older-unregistered': 'older geometry; coastlines differ, not registered',
    'painted-derivative': 'a painted or AI-made render made from one of the drawings; not a source of geometry',
    'photo-unregistered': 'a perspective photo; not registered',
}


def sanitize(name):
    s = re.sub(r'[^a-z0-9]+', '_', os.path.splitext(name)[0].lower()).strip('_')
    return s or 'file'


def inventory():
    order = ['pipeline/source', 'docs/drive-source', 'docs', 'maps']
    paths = []
    for d in order:
        pats = ['*.png', '*.jpg', '*.jpeg', '*.JPG', '*.PNG', '*.pdf'] if d != 'docs' else ['*.png', '*.jpg']
        found = set()
        for p in pats:
            found.update(glob.glob(os.path.join(ROOT, d, p)))
        paths += sorted(found, key=lambda s: s.lower())
    seen, used, files = {}, set(), []
    for p in paths:
        h = md5(p)
        rec = {'path': rel(p), 'md5': h, 'bytes': os.path.getsize(p)}
        if h in seen:
            first = seen[h]
            rec.update({k: first[k] for k in ('width', 'height', 'frame', 'description', 'preview', 'thumb') if k in first})
            rec['duplicate_of'] = first['path']
            first.setdefault('duplicates', []).append(rec['path'])
            files.append(rec)
            continue
        name = sanitize(os.path.basename(p))
        if name in used:
            name = name + '_' + h[:6]
        used.add(name)
        note = None
        if p.lower().endswith('.pdf'):
            im, note = pdf_single_image(p)
            rec['type'] = 'pdf'
        else:
            im = Image.open(p)
        frame, desc = DESCRIPTIONS.get(h, ('unclassified', 'not yet described'))
        rec.update({'frame': frame, 'description': desc, 'duplicate_of': None})
        if note:
            rec['preview_note'] = note
        if im is not None:
            rec['width'], rec['height'] = im.size
            im = im.convert('RGB')
            pv = im.copy(); pv.thumbnail((1600, 1600), Image.LANCZOS)
            pv.save(os.path.join(OUT_PREV, name + '.jpg'), quality=85)
            th = im.copy(); th.thumbnail((360, 360), Image.LANCZOS)
            th.save(os.path.join(OUT_THUMB, name + '.jpg'), quality=85)
            rec['preview'] = 'sources/previews/%s.jpg' % name
            rec['thumb'] = 'sources/thumbs/%s.jpg' % name
        else:
            rec['preview'] = rec['thumb'] = None
        seen[h] = rec
        files.append(rec)
    return files


# ----------------------------------------------------------------------------------------------- main
def main():
    for d in (OUT_DERIVED, OUT_PREV, OUT_THUMB, OUT_TEX):
        os.makedirs(d, exist_ok=True)
    originals = sorted(set(glob.glob(os.path.join(ROOT, 'docs', 'drive-source', '*')) + glob.glob(os.path.join(ROOT, 'maps', '*'))
                           + glob.glob(os.path.join(ROOT, 'pipeline', 'source', '*')) + glob.glob(os.path.join(ROOT, 'docs', '*.png'))
                           + glob.glob(os.path.join(ROOT, 'docs', '*.jpg'))))
    md5_before = {p: md5(p) for p in originals}
    report = {'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
              'script': 'pipeline/compare_sources.py',
              'master': {'file': rel(PENUP), 'size': [1362, 1155], 'note': 'The 3D terrain is still built from this September penup master.'},
              'projection': {'type': 'azimuthal equidistant', 'center_px': [X0, Y0], 'center_latlon': [CLAT, 0.0],
                             'deg_per_master_px': KDEG, 'km_per_master_px_small_world': r2(KM_PX_SMALL, 4),
                             'km_per_master_px_earth_sized': r2(KM_PX_EARTH, 4),
                             'radius_km': {'small_world': R_SMALL, 'earth_sized': R_EARTH},
                             'area_note': 'lake areas are true sphere areas (projection area factor sin(rho)/rho applied); *_flat_ruler uses km_per_master_px squared only'}}

    # ---------------- frame tests
    E = rgb(EARTH_RE); V = rgb(V5)
    base_img = Image.open(SAPHAUN).convert('RGB')
    B = np.asarray(base_img.resize((E.shape[1], E.shape[0]), Image.BOX)).astype(np.int16)
    dEV = np.abs(E - V).max(-1); dEB = np.abs(E - B).max(-1); dVB = np.abs(V - B).max(-1)
    ED = rgb(SAPHAUN_EDIT); BS = np.asarray(base_img).astype(np.int16); dDB = np.abs(ED - BS).max(-1)
    inkB = B.mean(-1) < 160
    inkE = E.mean(-1) < 160
    dtE = nd.distance_transform_edt(~inkE)
    frames = {
        'earth_re_vs_v5': {'identical_pixels': r2((dEV == 0).mean(), 4), 'within_8_levels': r2((dEV <= 8).mean(), 4)},
        'earth_re_vs_saphaun_empty_box_half': {'within_4_levels': r2((dEB <= 4).mean(), 4), 'within_25_levels': r2((dEB <= 25).mean(), 4),
                                               'base_ink_within_1px_of_earth_re_ink': r2((dtE[inkB] <= 1).mean(), 4)},
        'v5_vs_saphaun_empty_box_half': {'within_4_levels': r2((dVB <= 4).mean(), 4), 'within_25_levels': r2((dVB <= 25).mean(), 4)},
        'saphaun_edit_vs_saphaun_empty': {'within_12_levels': r2((dDB <= 12).mean(), 4), 'within_25_levels': r2((dDB <= 25).mean(), 4)},
        'verdict': 'kiros_earth_re, kiros_v5 and saphaun_drawn_edit are the clean saphaun coastline scan (Copy of saphaun_drawn_Empty.jpg; earth_re and v5 at exactly half size) plus hand-drawn marks. One registration serves all of them.',
    }
    print('frames', json.dumps(frames, indent=None)[:400])

    # ---------------- earth_re classes (additions = pixels that differ from the base)
    add = (dEB > 25) & ((E.mean(-1) < B.mean(-1) - 10) | blue_ink(E))
    add = nd.binary_opening(add, structure=np.ones((2, 2))) | (add & nd.binary_dilation(nd.binary_opening(add, structure=np.ones((2, 2))), iterations=1))
    al, an = nd.label(add, structure=np.ones((3, 3))); asz = nd.sum(add, al, range(1, an + 1))
    add = np.isin(al, 1 + np.nonzero(asz >= 6)[0])
    add_blue = add & nd.binary_dilation(blue_ink(E) & add, iterations=1)
    # a stroke is lake ink if most of its pixels are blue
    al, an = nd.label(add, structure=np.ones((3, 3)))
    frac_blue = nd.mean(blue_ink(E), al, range(1, an + 1))
    lake_E = np.isin(al, 1 + np.nonzero(frac_blue > 0.5)[0])
    marks_E = add & ~lake_E
    coast_E = inkE & ~nd.binary_dilation(add, iterations=1)
    del add_blue

    # ---------------- registration earth_re frame -> master
    pen = penup_classes()
    pen_ink = pen['coast'] | pen['marks']
    H0 = bbox_similarity(np.c_[np.nonzero(coast_E)[::-1]], np.c_[np.nonzero(pen['coast'])[::-1]])
    reg = icp_register(coast_E, pen_ink, H0)
    H = reg[reg['chosen']]['matrix']
    Hs = H @ np.diag([0.5, 0.5, 1.0])                      # saphaun 2x frame -> master
    print('registration', reg['chosen'], {k: v for k, v in reg[reg['chosen']].items() if k != 'matrix'})

    # cross-check with the pipeline's ORB homography result (build/biome_reg.png), if present
    xcheck = None
    breg = P('pipeline', 'build', 'biome_reg.png')
    if os.path.exists(breg):
        BR = rgb(breg)
        v5w = warp_float(V.astype(np.float32), np.linalg.inv(H), BR.shape[:2], order=1, cval=255)
        ink_mine = v5w.mean(-1) < 110; ink_pipe = BR.mean(-1) < 110
        dtp = nd.distance_transform_edt(~ink_pipe); dtm = nd.distance_transform_edt(~ink_mine)
        xcheck = {'file': 'pipeline/build/biome_reg.png (register.py, ORB + RANSAC homography)',
                  'my_dark_ink_within_1px_of_pipeline': r2((dtp[ink_mine] <= 1).mean(), 3),
                  'my_dark_ink_within_2px_of_pipeline': r2((dtp[ink_mine] <= 2).mean(), 3),
                  'pipeline_dark_ink_within_2px_of_mine': r2((dtm[ink_pipe] <= 2).mean(), 3)}

    def regjson(r):
        return {m: {**{k: (np.round(v, 6).tolist() if k == 'matrix' else (r2(v, 3) if isinstance(v, float) else v)) for k, v in r[m].items()}}
                for m in ('affine', 'homography')} | {'chosen': r['chosen']}

    sx = math.sqrt(abs(np.linalg.det(H[:2, :2])))
    rot = math.degrees(math.atan2(H[1, 0] - H[0, 1], H[0, 0] + H[1, 1]))
    report['registration'] = {
        'method': 'ICP on coastline ink (earth_re ink minus its additions) against penup grey ink; bbox-similarity start; trimmed gates 40->2.5 px; affine then homography; matrices map source px (x,y,1) -> master px',
        'frame_tests': frames,
        'kiros_earth_re': regjson(reg) | {'scale': r2(sx, 4), 'rotation_deg': r2(rot, 3)},
        'kiros_v5': {'same_as': 'kiros_earth_re', 'matrix': np.round(H, 6).tolist()},
        'saphaun_2x_frame': {'files': ['docs/drive-source/Copy of saphaun_drawn_Empty.jpg', 'maps/saphaun_drawn_Empty.jpg', 'maps/saphaun_drawn_edit.jpg'],
                             'matrix': np.round(Hs, 6).tolist(), 'note': 'kiros_earth_re matrix times diag(0.5, 0.5, 1)'},
        'cross_check_vs_pipeline_register_py': xcheck,
    }

    # per-quadrant residuals (where the two coast drawings differ most)
    ys, xs = np.nonzero(coast_E); mp = apply_h(H, np.c_[xs, ys].astype(float))
    dtP = nd.distance_transform_edt(~pen['coast'])
    xi = np.clip(np.round(mp[:, 0]).astype(int), 0, 1361); yi = np.clip(np.round(mp[:, 1]).astype(int), 0, 1154)
    dpts = dtP[yi, xi]

    # ---------------- coastline agreement (master frame, both directions)
    coastE_m = warp_float(coast_E.astype(np.float32), np.linalg.inv(H), (1155, 1362)) > 0.3
    dtEm = nd.distance_transform_edt(~coastE_m)
    agree = {}
    for t in (1, 2, 3, 5):
        agree['earth_re_coast_within_%dpx_of_penup_coast' % t] = r2((dpts <= t).mean(), 4)
        agree['penup_coast_within_%dpx_of_earth_re_coast' % t] = r2((dtEm[pen['coast']] <= t).mean(), 4)
    agree['median_px_earth_re_to_penup'] = r2(np.median(dpts), 2)
    agree['median_px_penup_to_earth_re'] = r2(np.median(dtEm[pen['coast']]), 2)
    agree['px_to_km_small_world'] = r2(KM_PX_SMALL, 4)
    # clusters of disagreement (> 5 px), largest first
    far = np.zeros((1155, 1362), bool); far[yi[dpts > 5], xi[dpts > 5]] = True
    fl, fn = nd.label(nd.binary_dilation(far, iterations=6))
    clusters = []
    for i in range(1, fn + 1):
        k = (fl == i) & far
        if k.sum() < 25:
            continue
        cy_, cx_ = nd.center_of_mass(k); la, lo = ll(cx_, cy_)
        clusters.append({'center_px': [r2(cx_, 0), r2(cy_, 0)], 'center_latlon': [r2(la, 2), r2(lo, 2)], 'ink_px': int(k.sum())})
    clusters.sort(key=lambda c: -c['ink_px'])
    pf = np.zeros((1155, 1362), bool); pf |= pen['coast'] & (dtEm > 5)
    agree['earth_re_coast_far_from_penup_clusters'] = clusters[:12]
    agree['penup_coast_far_from_earth_re_px'] = int(pf.sum())
    pl_, pn_ = nd.label(nd.binary_dilation(pf, iterations=6)); pcl = []
    for i in range(1, pn_ + 1):
        k = (pl_ == i) & pf
        if k.sum() < 25:
            continue
        cy_, cx_ = nd.center_of_mass(k); la, lo = ll(cx_, cy_)
        pcl.append({'center_px': [r2(cx_, 0), r2(cy_, 0)], 'center_latlon': [r2(la, 2), r2(lo, 2)], 'ink_px': int(k.sum())})
    agree['penup_coast_far_from_earth_re_clusters'] = sorted(pcl, key=lambda c: -c['ink_px'])[:12]
    report['coastline_agreement'] = agree
    print('coast agreement', {k: v for k, v in agree.items() if 'cluster' not in k})

    # ---------------- lakes
    lakes_P, loops_P = lakes_for(pen['lake_ink'], None)
    lakes_E, loops_E = lakes_for(lake_E, H)
    pairs = []
    byP = {l['name']: l for l in lakes_P}; byE = {l['name']: l for l in lakes_E}
    for n in sorted(set(byP) | set(byE)):
        a, b = byP.get(n), byE.get(n)
        if not (a and b):
            pairs.append({'lake': n, 'in_penup': bool(a), 'in_earth_re': bool(b)}); continue
        dS = gc_km(*a['centroid_latlon'], *b['centroid_latlon'], R_SMALL)
        la1, lo1 = a['centroid_latlon']; la2, lo2 = b['centroid_latlon']
        brg = math.degrees(math.atan2(math.radians(lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2)), math.radians(la2 - la1))) % 360
        pairs.append({'lake': n,
                      'area_km2_small_world': {'penup': a['area_km2_small_world'], 'earth_re': b['area_km2_small_world']},
                      'area_km2_earth_sized': {'penup': a['area_km2_earth_sized'], 'earth_re': b['area_km2_earth_sized']},
                      'area_ratio_earth_re_over_penup': r2(b['area_master_px2'] / a['area_master_px2'], 3),
                      'centroid_shift_km_small_world': r2(dS, 0),
                      'centroid_shift_km_earth_sized': r2(dS * R_EARTH / R_SMALL, 0),
                      'centroid_shift_master_px': r2(math.hypot(b['centroid_px'][0] - a['centroid_px'][0], b['centroid_px'][1] - a['centroid_px'][1]), 1),
                      'shift_bearing_deg': r2(brg, 0),
                      'penup_inner_depression': a['inner_depression'] is not None, 'earth_re_inner_depression': b['inner_depression'] is not None})
    # kiros_v5 (biome map, same frame as earth_re): its blue lake loops, for context
    lake_V = (dVB > 25) & (V[..., 2] > V[..., 0] + 60) & (V[..., 2] > V[..., 1] + 40)
    lakes_V, _ = lakes_for(lake_V, H)
    lakes_V = [{k: l[k] for k in ('name', 'area_master_px2', 'area_km2_small_world', 'area_km2_earth_sized', 'centroid_px', 'centroid_latlon', 'ink_loop_closed')}
               for l in lakes_V if not l['name'].startswith('unnamed')]
    for l in lakes_V:
        if l['name'] in byP:
            l['centroid_shift_km_small_world_vs_penup'] = r2(gc_km(*l['centroid_latlon'], *byP[l['name']]['centroid_latlon'], R_SMALL), 0)
            l['area_ratio_vs_penup'] = r2(l['area_master_px2'] / byP[l['name']]['area_master_px2'], 3)
    print('v5 lakes', lakes_V)
    report['lakes'] = {'penup': lakes_P, 'earth_re': lakes_E, 'comparison': pairs, 'kiros_v5_for_context': lakes_V,
                       'method': 'blue ink loops; area = inside of the ink centerline; small gaps closed by binary closing (gap_closed_px); earth_re areas carried to master px by the homography Jacobian'}
    for p_ in pairs:
        print('lake', p_)

    # ---------------- mountain marks
    land = pen['land']
    llab, ln = nd.label(land)
    names = {}
    for k, r in CFG['regions'].items():
        if k.startswith('_'):
            continue
        x, y = r['seed']; i = int(llab[y, x])
        if i:
            names.setdefault(i, k)
    for i in range(1, ln + 1):
        if i not in names:
            cy_, cx_ = nd.center_of_mass(llab == i)
            names[i] = ('northern island' if cy_ < 330 else 'island') + ' near px (%d,%d)' % (cx_, cy_)
    # marks drawn on water: attach to the nearest land
    idx = nd.distance_transform_edt(llab == 0, return_distances=False, return_indices=True)
    llab_near = llab[idx[0], idx[1]]
    comps_P = mark_components(pen['marks'], None, llab_near, names)
    comps_E = mark_components(marks_E, H, llab_near, names)
    veirP = byP.get('veir'); veirE = byE.get('veir')
    ring = {}
    if veirP:
        cx, cy = veirP['centroid_px']
        ring['around_penup_veir_centroid_r120px'] = {'penup': angular_coverage(comps_P, cx, cy, 120), 'earth_re': angular_coverage(comps_E, cx, cy, 120)}
    if veirE:
        cx, cy = veirE['centroid_px']
        ring['around_earth_re_veir_centroid_r120px'] = {'penup': angular_coverage(comps_P, cx, cy, 120), 'earth_re': angular_coverage(comps_E, cx, cy, 120)}
    inside_lake = 0
    for c in comps_P:
        for lp in loops_P:
            if lp['parent'] is None and lp['filled'][int(round(c['cy'])), int(round(c['cx']))]:
                inside_lake += 1; c['inside_lake'] = True
    report['mountain_marks'] = {
        'penup': summarize_marks(comps_P), 'earth_re': summarize_marks(comps_E),
        'veir_ring_test': ring,
        'penup_marks_inside_lake_outlines': inside_lake,
        'method': 'penup: grey ink with land on all sides (masks.py rule); earth_re: non-blue additions to the base. Strokes = 8-connected components >= 6 px; length ~ half the stroke perimeter. A stroke counts in every config range box containing its centroid (as terrain.py does). Landmass = penup land component nearest the stroke, named by config regions seeds.',
    }
    print('marks penup', {k: v['strokes'] for k, v in report['mountain_marks']['penup']['by_config_range_box'].items()})
    print('marks earth_re', {k: v['strokes'] for k, v in report['mountain_marks']['earth_re']['by_config_range_box'].items()})
    print('ring', ring)

    # ---------------- overlays, master frame
    shapeM = (1155, 1362)
    fillP = np.zeros(shapeM, np.float32); innerP = np.zeros(shapeM, np.float32)
    for lp in loops_P:
        (fillP if lp['parent'] is None else innerP)[lp['region']] = 1
    rgba_from_classes(shapeM, [(pen['coast'].astype(np.float32), COL_COAST), (pen['marks'].astype(np.float32), COL_MTN),
                               (pen['lake_ink'].astype(np.float32), COL_LAKE)]).save(os.path.join(OUT_DERIVED, 'penup_lines_master.png'), optimize=True)
    Hinv = np.linalg.inv(H)
    aC = np.clip(warp_float(coast_E.astype(np.float32), Hinv, shapeM) * 1.8, 0, 1)
    aM = np.clip(warp_float(marks_E.astype(np.float32), Hinv, shapeM) * 1.8, 0, 1)
    aL = np.clip(warp_float(lake_E.astype(np.float32), Hinv, shapeM) * 1.8, 0, 1)
    fillE = np.zeros(lake_E.shape, np.float32)
    for lp in loops_E:
        fillE[lp['region']] = 1
    fillEm = warp_float(fillE, Hinv, shapeM) > 0.5
    rgba_from_classes(shapeM, [(aC, COL_COAST), (aM, COL_MTN), (aL, COL_LAKE)]).save(os.path.join(OUT_DERIVED, 'earth_re_lines_master.png'), optimize=True)
    v5rgba = np.asarray(Image.open(V5).convert('RGBA')).astype(np.float32)
    v5w = warp_float(v5rgba, Hinv, shapeM, order=1, cval=0)
    Image.fromarray(np.clip(v5w + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT_DERIVED, 'v5_on_master.png'), optimize=True)

    # ---------------- overlays, web window (equirectangular, lon -84..78, lat -14..84, row 0 = north)
    wx, wy = window_lookup()
    for tag, layers in (('penup', [(fillP, None), (innerP, None), (pen['coast'], COL_COAST), (pen['marks'], COL_MTN), (pen['lake_ink'], COL_LAKE)]),
                        ('earth_re', [(fillEm, None), (None, None), (aC, COL_COAST), (aM, COL_MTN), (aL, COL_LAKE)])):
        fill, inner = layers[0][0], layers[1][0]
        wl_ = []
        wl_.append((0.35 * np.clip(nd.map_coordinates(np.asarray(fill, np.float32), [wy, wx], order=1), 0, 1), COL_LAKE))
        if inner is not None:
            wl_.append((0.35 * np.clip(nd.map_coordinates(np.asarray(inner, np.float32), [wy, wx], order=1), 0, 1), COL_LAKE))
        for a, col in layers[2:]:
            wl_.append((to_window(np.asarray(a, np.float32), wx, wy), col))
        rgba_from_classes((WIN_H, WIN_W), wl_).save(os.path.join(OUT_TEX, 'overlay_%s_window.png' % tag), optimize=True)
    report['overlays'] = {
        'colors': {'lake': '#2f6fff', 'mountain_marks': '#b8742a', 'coast': '#5a5a5a'},
        'master_frame': {'size': [1362, 1155], 'files': ['sources/derived/penup_lines_master.png', 'sources/derived/earth_re_lines_master.png', 'sources/derived/v5_on_master.png'],
                         'note': 'ink only, transparent background; v5 is the full-color biome map, transparent outside its frame'},
        'window': {'size': [WIN_W, WIN_H], 'lon': WIN['lon'], 'lat': WIN['lat'], 'row0_lat': WIN['lat'][1],
                   'uv': 'u = (lon + 84) / 162, v = (lat + 14) / 98 (v = 0 at the bottom row)',
                   'files': ['textures/overlay_penup_window.png', 'textures/overlay_earth_re_window.png'],
                   'note': 'ink lines at least ~2 px wide; lake interiors filled at 35% alpha (penup Dire inner depression gets a second 35% layer)'}}

    # ---------------- extra frames: 2024 outline scan, Map_West crop
    extra = {}
    S24 = rgb(SCAN_2024); ink24 = S24.mean(-1) < 120
    r24 = icp_register(ink24, pen_ink, bbox_similarity(np.c_[np.nonzero(ink24)[::-1]], np.c_[np.nonzero(pen['coast'])[::-1]]))
    extra['maps/20240812_184702.jpg'] = regjson(r24)
    MW = rgb(MAP_WEST); g = MW.mean(-1)
    dark = g < 150
    thick = nd.binary_dilation(nd.binary_opening(dark, iterations=2), iterations=3)
    mw_ink = dark & ~thick & ~blue_ink(MW)
    sc, Hc = locate_by_ncc(mw_ink[::2, ::2], inkE, np.arange(0.60, 1.30, 0.02))
    if Hc is not None:
        Hc = Hc @ np.diag([0.5, 0.5, 1.0])               # full-res Map_West px -> earth_re px
        rmw = icp_register(mw_ink, inkE, Hc, gates=(8, 6, 4, 3, 3, 2.5, 2.5, 2.5))
        best = rmw[rmw['chosen']]
        M = best['matrix']; info = {'ncc_peak': r2(sc, 3), 'to_earth_re_frame': regjson(rmw), 'verdict': 'not confidently located'}
        if abs(M[0, 0] - 0.5) < 0.003 and abs(M[1, 1] - 0.5) < 0.003 and abs(M[0, 1]) + abs(M[1, 0]) < 0.003:
            # scale exactly 1/2 of the earth_re frame = 1:1 with the 2x saphaun scan: test it as a plain crop pixel by pixel
            SB = rgb(SAPHAUN); best_t = None
            for oy in range(int(round(2 * M[1, 2])) - 2, int(round(2 * M[1, 2])) + 3):
                for ox in range(max(0, int(round(2 * M[0, 2])) - 2), int(round(2 * M[0, 2])) + 3):
                    crop = SB[oy:oy + MW.shape[0], ox:ox + MW.shape[1]]
                    if oy < 0 or crop.shape != MW.shape:
                        continue
                    f = float((np.abs(crop - MW).max(-1) <= 12).mean())
                    if best_t is None or f > best_t[0]:
                        best_t = (f, ox, oy)
            if best_t and best_t[0] > 0.85:
                f, ox, oy = best_t
                Hmw = Hs @ np.array([[1, 0, ox], [0, 1, oy], [0, 0, 1.0]])
                info.update({'verdict': 'pixel crop of Copy of saphaun_drawn_Empty.jpg (2x frame) at x %d..%d, y %d..%d, plus stamped symbols' % (ox, ox + MW.shape[1], oy, oy + MW.shape[0]),
                             'crop_offset_in_saphaun_2x_px': [ox, oy], 'pixels_within_12_levels_of_base': r2(f, 4),
                             'to_master_matrix': np.round(Hmw, 6).tolist()})
        extra['maps/Map_West_Mountains_Trees.JPG'] = info
    report['registration']['extra'] = extra
    print('extra', {k: (v.get('chosen'), v.get('verdict')) for k, v in extra.items()})

    # ---------------- Map A rotation (visual check; supporting number = ink density correlation with the master)
    A = Image.open(MAP_A).convert('L')
    def dens(im):
        a = np.asarray(im.resize((68, 58), Image.BOX)).astype(np.float32)
        return (a - a.mean()) / (a.std() + 1e-6)
    mref = dens(Image.fromarray((255 - 255 * (pen['coast'] | pen['marks'] | pen['lake_ink'])).astype(np.uint8)))
    corr = {}
    for nm, tr in (('ccw90', Image.Transpose.ROTATE_90), ('cw90', Image.Transpose.ROTATE_270), ('none', None), ('180', Image.Transpose.ROTATE_180)):
        im = A.transpose(tr) if tr is not None else A
        d = dens(im)
        corr[nm] = r2(float((d * mref).mean()), 3)
    a_n = A.transpose(Image.Transpose.ROTATE_90).convert('RGB')
    a_n.thumbnail((1600, 1600), Image.LANCZOS); a_n.save(os.path.join(OUT_DERIVED, 'kiros_map_a_northup.jpg'), quality=85)
    report['map_a'] = {'file': 'docs/drive-source/Kiros_Map_A.jpg (also maps/Kiros_Map_A.jpg)',
                       'north_points_to': 'image right', 'rotation_to_north_up': '90 deg counter-clockwise',
                       'output': 'sources/derived/kiros_map_a_northup.jpg',
                       'evidence': 'visual: after the rotation the long western island (Ender) sits west, the continent with the lake inside crossing ranges (Fiira/Veir) west-center, the northern continent with a lake (Roan/Sfere) north-east, the crescent continent with a heart-shaped lake and a spine of marks along its outer edge (Malos/Dire) south-east, the hatched round island (Dragon) south-west and the island chain along the north, as on the master. Coastline geometry is older and is not registered.',
                       'coarse_ink_correlation_with_master': corr,
                       'correlation_note': 'weak supporting number only (different geometry, pencil shading)'}

    # ---------------- previous colored map: rough similarity from lake centers (reference only)
    PV = rgb(PREVIOUS)
    seeds = {'veir': (1150, 1550), 'sfere': (2070, 880), 'dire': (2200, 1920)}    # chosen by eye inside each white lake (full-res px)
    light = (PV.min(-1) > 175) & ((PV.max(-1) - PV.min(-1)) < 25)
    llb, _ = nd.label(light)
    prev_pts, mast_pts, used_names = [], [], []
    for nme, (x, y) in seeds.items():
        lid = llb[y, x]
        if lid == 0 or nme not in byP:
            continue
        reg_ = nd.binary_fill_holes(llb == lid)
        if reg_.sum() > 400000:
            continue
        cy_, cx_ = nd.center_of_mass(reg_)
        prev_pts.append((cx_, cy_)); mast_pts.append(byP[nme]['centroid_px']); used_names.append(nme)
    prev_info = {'registrable': False,
                 'note': 'Older geometry: the coastlines are drawn differently, so the image is not registered and no overlay is produced.'}
    if len(prev_pts) >= 3:
        pp, mm = np.array(prev_pts), np.array(mast_pts, float)
        Sx = fit_similarity(pp, mm); res = np.hypot(*(apply_h(Sx, pp) - mm).T)
        prev_info.update({'rough_similarity_from_lake_centers': {'landmarks': used_names, 'seed_px_prev': [list(seeds[n]) for n in used_names],
                                                                 'lake_centers_prev_px': np.round(pp, 1).tolist(), 'matrix_prev_to_master': np.round(Sx, 6).tolist(),
                                                                 'scale': r2(math.hypot(Sx[0, 0], Sx[1, 0]), 4), 'rotation_deg': r2(math.degrees(math.atan2(Sx[1, 0], Sx[0, 0])), 2),
                                                                 'residual_master_px': np.round(res, 1).tolist(), 'residual_km_small_world': np.round(res * KM_PX_SMALL, 0).tolist(),
                                                                 'note': 'three manually seeded lake centers only; reference for orientation, not a registration'}})
    report['kiros_map_previous'] = prev_info

    # ---------------- file inventory + previews
    report['frame_legend'] = FRAME_LEGEND
    report['files'] = inventory()

    # ---------------- originals unchanged?
    changed = [rel(p) for p in originals if md5(p) != md5_before[p]]
    report['originals_unchanged'] = not changed
    if changed:
        report['originals_changed'] = changed
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    print('wrote', rel(OUT_JSON), 'originals unchanged:', not changed)

    if DEBUG:
        os.makedirs(DEBUG, exist_ok=True)
        Image.fromarray(np.dstack([pen['coast'] * 255, pen['marks'] * 255, pen['lake_ink'] * 255]).astype(np.uint8)).save(os.path.join(DEBUG, 'penup_classes.png'))
        Image.fromarray(np.dstack([coast_E * 255, marks_E * 255, lake_E * 255]).astype(np.uint8)).save(os.path.join(DEBUG, 'earth_re_classes.png'))
        ov = np.full(shapeM + (3,), 255, np.uint8)
        ov[pen['coast']] = (255, 0, 0); ov[coastE_m] = (0, 0, 255); ov[pen['coast'] & coastE_m] = (0, 0, 0)
        Image.fromarray(ov).save(os.path.join(DEBUG, 'coast_overlap.png'))


if __name__ == '__main__':
    main()
