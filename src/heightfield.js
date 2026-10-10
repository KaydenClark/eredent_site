import { vnoise } from './noise.js';

// CPU copies of the regional layers (height, mask, coast), sampled exactly the way the terrain shader samples them,
// plus the same fractal relief the GPU adds below the data resolution. The walking camera, the vegetation and the
// HUD all read the ground from here, so what they think the ground is matches what is drawn.

function pixels(image) {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}

// Compact copies: heights as int16 meters, the mask as 3 bytes per texel, the coast as 1 (about 60 MB for the 4k
// layers instead of three full RGBA canvases).
function channels(rgba, n) {
  const out = new Uint8Array(rgba.length / 4 * n);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += n) for (let k = 0; k < n; k++) out[j + k] = rgba[i + k];
  return out;
}

export class Heightfield {
  constructor(heightImage, window, maskImage = null, coastImage = null) {
    const d = pixels(heightImage);
    this.hgt = new Int16Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) this.hgt[j] = d[i] * 256 + d[i + 1] - 6000;
    this.w = heightImage.width; this.h = heightImage.height;
    this.lon0 = window.lon[0]; this.lon1 = window.lon[1]; this.lat0 = window.lat[0]; this.lat1 = window.lat[1];
    this.mask = maskImage ? channels(pixels(maskImage), 3) : null;
    this.mw = maskImage ? maskImage.width : 0; this.mh = maskImage ? maskImage.height : 0;
    this.coast = coastImage ? channels(pixels(coastImage), 1) : null;
    this.cw = coastImage ? coastImage.width : 0; this.ch = coastImage ? coastImage.height : 0;
  }

  inside(lat, lon) { return !(lon < this.lon0 || lon > this.lon1 || lat < this.lat0 || lat > this.lat1); }

  // bilinear between texel centers, image row 0 = north; identical to sampleH() in the shader
  _bilinear(data, w, h, lat, lon, decode) {
    const u = (lon - this.lon0) / (this.lon1 - this.lon0) * w - 0.5;
    const v = (this.lat1 - lat) / (this.lat1 - this.lat0) * h - 0.5;
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(u))), y0 = Math.max(0, Math.min(h - 2, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
    const s = (x, y) => decode(y * w + x);
    return (s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx) * (1 - fy) + (s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx) * fy;
  }

  // surface height in meters above sea level from the data layer (0 over the ocean, lake surfaces flat)
  at(lat, lon) {
    if (!this.inside(lat, lon)) return 0;
    const d = this.hgt;
    return this._bilinear(d, this.w, this.h, lat, lon, i => d[i]);
  }

  // The drawn ground before the fine relief, as sampleGround() in the shader: the bilinear height with the shoreline
  // pulled down to the lowest of the four texels (the water), by the smooth land fraction.
  ground(lat, lon) {
    if (!this.inside(lat, lon)) return { h: 0, coast: 0 };
    const d = this.hgt, w = this.w, H = this.h;
    const u = (lon - this.lon0) / (this.lon1 - this.lon0) * w - 0.5;
    const v = (this.lat1 - lat) / (this.lat1 - this.lat0) * H - 0.5;
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(u))), y0 = Math.max(0, Math.min(H - 2, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
    const s = (x, y) => d[y * w + x];
    const a = s(x0, y0), b = s(x0 + 1, y0), c = s(x0, y0 + 1), e = s(x0 + 1, y0 + 1);
    const hb = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
    const coast = this.land(lat, lon), wl = Math.min(a, b, c, e);
    return { h: wl + (hb - wl) * smoothstep(0.42, 0.8, coast), coast, water: wl };
  }

  // solid-ground fraction 0..1 (smooth across the shoreline); 0 outside the mapped window
  land(lat, lon) {
    if (!this.coast || !this.inside(lat, lon)) return 0;
    const d = this.coast;
    return this._bilinear(d, this.cw, this.ch, lat, lon, i => d[i] / 255);   // one byte per texel
  }

  // nearest mask texel: biome index, water depth (m), protected sea 0..1
  sample(lat, lon) {
    if (!this.mask || !this.inside(lat, lon)) return { biome: 0, depth: 5200, inner: 0 };
    const x = Math.min(this.mw - 1, Math.max(0, Math.floor((lon - this.lon0) / (this.lon1 - this.lon0) * this.mw)));
    const y = Math.min(this.mh - 1, Math.max(0, Math.floor((this.lat1 - lat) / (this.lat1 - this.lat0) * this.mh)));
    const i = (y * this.mw + x) * 3, m = this.mask;
    return { biome: m[i + 2], depth: m[i] / 255 * 5500, inner: m[i + 1] / 255 };
  }
}

// Fractal relief below the data resolution, the same function as detail() in the terrain shader.
// n = unit direction, h = data height (m), landW = 0..1 how far inland, fade = distance fade 0..1.
export function detailAt(nx, ny, nz, h, landW, fade) {
  if (fade <= 0 || landW <= 0) return 0;
  const rugged = smoothstep(700, 2600, h);
  const ridge = 1 - Math.abs(vnoise(nx * 425, ny * 425, nz * 425) * 2 - 1);
  const ridge2 = 1 - Math.abs(vnoise(nx * 1400 + 3.1, ny * 1400 + 3.1, nz * 1400 + 3.1) * 2 - 1);
  let d = (ridge * ridge - 0.33) * 520 * rugged
          + (ridge2 * ridge2 - 0.33) * 190 * rugged * (0.4 + 0.6 * ridge)
          + (vnoise(nx * 2000, ny * 2000, nz * 2000) - 0.5) * (40 + 40 * rugged)
          + (vnoise(nx * 8000, ny * 8000, nz * 8000) - 0.5) * (14 + 16 * rugged)
          + (vnoise(nx * 32000, ny * 32000, nz * 32000) - 0.5) * 8
          + (vnoise(nx * 128000, ny * 128000, nz * 128000) - 0.5) * 2.5;
  const dd = d > 0 ? d * (1 - 0.75 * smoothstep(3300, 4300, h)) : d;   // summits stay near the spec heights
  return dd * fade * landW;
}

// distance fade of the fine relief: full within 0.03 planet radii of the camera, gone by 0.12
export const detailFade = distUnits => 1 - smoothstep(0.03, 0.12, distUnits);
export const landWeight = coastFrac => smoothstep(0.5, 0.92, coastFrac);

export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
