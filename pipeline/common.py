"""Shared paths and config for the Kiros layer pipeline. Every script runs from any cwd.

Variants: with the environment variable KIROS_VARIANT=<name> (set by `run_all.py --variant <name>` and
`check_acceptance.py --variant <name>`) the pipeline reads pipeline/config_<name>.json and writes its intermediates to
pipeline/build_<name>/, its textures to public/textures/<name>/ and its meta to public/data/kiros_meta_<name>.json.
Without it every path is the September default, unchanged."""
import json, os, re
import numpy as np

VARIANT = os.environ.get('KIROS_VARIANT', '').strip()
if VARIANT and not re.fullmatch(r'[a-z0-9_]+', VARIANT):
    raise SystemExit(f'KIROS_VARIANT must be lowercase letters, digits or _ (got {VARIANT!r})')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'source')
BUILD = os.path.join(HERE, 'build_' + VARIANT if VARIANT else 'build')
PUBLIC = os.path.join(ROOT, 'public')
TEX = os.path.join(PUBLIC, 'textures', VARIANT) if VARIANT else os.path.join(PUBLIC, 'textures')
TEX_URL = 'textures/' + VARIANT if VARIANT else 'textures'      # how the web app addresses TEX (written into meta)
DATA = os.path.join(PUBLIC, 'data')
META = os.path.join(DATA, f'kiros_meta_{VARIANT}.json' if VARIANT else 'kiros_meta.json')
CONFIG = os.path.join(HERE, f'config_{VARIANT}.json' if VARIANT else 'config.json')
for d in (BUILD, TEX, DATA):
    os.makedirs(d, exist_ok=True)

with open(CONFIG, encoding='utf-8') as f:
    CFG = json.load(f)


def select_mask(rule, x, y):
    """Lake selection rule from config ("x<600", "780<x<960 and y<480", ...) -> boolean array over x, y (outline px)."""
    out = np.ones(np.broadcast(x, y).shape, bool)
    for term in rule.split(' and '):
        parts = re.split(r'\s*(<|>)\s*', term.strip())          # e.g. ['780', '<', 'x', '<', '960']
        for i in range(0, len(parts) - 2, 2):
            a, op, b = parts[i], parts[i + 1], parts[i + 2]
            va = x if a == 'x' else y if a == 'y' else float(a)
            vb = x if b == 'x' else y if b == 'y' else float(b)
            out &= (va < vb) if op == '<' else (va > vb)
    return out

PENUP = os.path.join(SRC, 'penup_20260912_182533.jpg')          # master: coastlines, lakes in blue ink
OUTLINE = os.path.join(SRC, 'ca093ac3-1b33-4003-87ab-232136e9d27b.png')  # same drawing, black ink
BIOME = os.path.join(SRC, 'kiros_v5.png')                          # biome zones

U = CFG['grid']['upsample']


def src(name):
    return os.path.join(SRC, name)


def build(name):
    return os.path.join(BUILD, name)


def latlon_from_px(px, py, x0, y0, c, k):
    """Azimuthal-equidistant inverse: outline pixel -> (lat, lon) in degrees. y down on the page = south."""
    dx, dy = (px - x0) * k, (y0 - py) * k
    rho = np.radians(np.hypot(dx, dy)); th = np.arctan2(dx, dy)
    cr = np.radians(c)
    lat = np.arcsin(np.sin(cr) * np.cos(rho) + np.cos(cr) * np.sin(rho) * np.cos(th))
    lon = np.arctan2(np.sin(th) * np.sin(rho), np.cos(cr) * np.cos(rho) - np.sin(cr) * np.sin(rho) * np.cos(th))
    return np.degrees(lat), np.degrees(lon)


def px_from_latlon(lat_deg, lon_deg, x0, y0, c, k):
    """Forward azimuthal-equidistant: (lat, lon) degrees -> outline pixel (float)."""
    phi = np.radians(lat_deg); lam = np.radians(lon_deg); cr = np.radians(c)
    cosr = np.clip(np.sin(cr) * np.sin(phi) + np.cos(cr) * np.cos(phi) * np.cos(lam), -1, 1)
    rho = np.degrees(np.arccos(cosr))
    th = np.arctan2(np.cos(phi) * np.sin(lam), np.cos(cr) * np.sin(phi) - np.sin(cr) * np.cos(phi) * np.cos(lam))
    return x0 + rho / k * np.sin(th), y0 - rho / k * np.cos(th)
