"""Shared paths and config for the Kiros layer pipeline. Every script runs from any cwd."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'source')
BUILD = os.path.join(HERE, 'build')
PUBLIC = os.path.join(ROOT, 'public')
TEX = os.path.join(PUBLIC, 'textures')
DATA = os.path.join(PUBLIC, 'data')
for d in (BUILD, TEX, DATA):
    os.makedirs(d, exist_ok=True)

with open(os.path.join(HERE, 'config.json'), encoding='utf-8') as f:
    CFG = json.load(f)

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
