import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cellRand, vnoise } from './noise.js';
import { zoneAt, treeline } from './biomes.js';
import { GLSL_FOG } from './shaders.js';
import { GLSL_NOISE } from './noise.js';

// Instanced vegetation and rocks around the camera, placed deterministically on a latitude/longitude cell grid so
// the same tree stands in the same place every visit. Three layers stream in chunks, nearest first:
//   trees   big Pandora-scale trees (canopy heights from the spec, "Proposed"), out to ~2.5 km
//   under   understory trees, tree ferns, palms, shrubs and rocks, out to ~700 m
//   ground  ferns, grass, sedge, reeds and stones, out to ~90 m
// Nothing is placed in water, on snow, or (trees) in the desert zones. Species shapes are generic; they stand in for
// the spec's descriptions until Kayden names real flora. Each species is built in a few seeded shape variants, and
// each zone tints its foliage (darker, bluer taiga and montane forest; saturated tropics; olive swamp).

const D2R = Math.PI / 180;
const SEG = { ico: 1, cone: 8, cyl: 7, far: false };   // geometry detail; lowered while building the far versions
const VARIANTS = { trees: 3, under: 2, ground: 1 };    // seeded shape variants per species
const STRIDE = 12;   // per plant: lat, lon, h, size, yaw, tint, light, palette r g b, moss, variant/lean random

// --- geometry: unit-height shapes with vertex colors (y up, base at 0) ------------------------------------
let RND = Math.random;   // seeded per variant while a shape is built
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rr = (a, b) => a + (b - a) * RND();

// kind: 0 bark, 1 foliage shell (closed or skirt: its inside reads as shade), 2 foliage blade (thin, lit both sides), 3 rock
function colored(g, c, shade = null, kind = 0) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), cc = new THREE.Color(c);
  const k3 = new Float32Array(pos.count * 3), K = [[0, 0, 0], [1, 1, 0], [1, 0, 0], [0, 0, 1]][kind];
  for (let i = 0; i < pos.count; i++) {
    const k = shade ? shade(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
    col[i * 3] = cc.r * k; col[i * 3 + 1] = cc.g * k; col[i * 3 + 2] = cc.b * k;
    k3[i * 3] = K[0]; k3[i * 3 + 1] = K[1]; k3[i * 3 + 2] = K[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aK', new THREE.BufferAttribute(k3, 3));
  return g;
}
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const lumpy = (g, amt, seed) => {   // break up perfect primitives (welded first, so the shading stays smooth)
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 3.1 + seed, y * 3.1, z * 3.1) - 0.5;
    p.setXYZ(i, x * (1 + n * amt), y * (1 + n * amt * 0.6), z * (1 + n * amt));
  }
  g.computeVertexNormals(); return g;
};
const aoY = (lo, hi) => (x, y) => 0.55 + 0.45 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)));
const hueJit = (c, a = 0.08) => new THREE.Color(c).multiply(new THREE.Color(1 + rr(-a, a), 1 + rr(-a, a) * 0.6, 1 + rr(-a * 1.4, a)));

// Trunk with a flared, lobed base (buttress ridges on the giants) and an optional bend. Three short rings at the
// base carry the flare in the near version; the far version keeps one ring.
function trunk({ r0, r1 = r0 * 0.4, h = 1, flare = 0, flareH = 0.1, lobes = 0, lobeAmp = 0, bend = 0, color, ao = aoY(0, 0.6) }) {
  const seg = SEG.far ? SEG.cyl : Math.max(SEG.cyl, lobes * 2);
  const rings = SEG.far || !flare ? 1 : 3;
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, rings, true);
  const p = g.attributes.position, ph = RND() * 6.283;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = p.getY(i) + 0.5;
    let y = t * h;
    if (rings === 3) y = t < 0.34 ? t * 3 * 0.3 * flareH : t < 0.67 ? (0.3 + (t * 3 - 1) * 0.7) * flareH : flareH + (t * 3 - 2) * (h - flareH);
    const a = Math.atan2(x, z);
    let r = r0 + (r1 - r0) * (y / h);
    if (flare && y < flareH) {
      const f = rings === 1 ? 0.35 : (1 - y / flareH) ** 2;
      r *= 1 + flare * f * (1 + (rings === 1 ? 0.5 : lobeAmp * Math.max(0, Math.cos(a * lobes + ph)) * 2 - lobeAmp * 0.3));
    }
    p.setXYZ(i, x * r + bend * (y / h) ** 2, y, z * r);
  }
  g.computeVertexNormals();
  return colored(g, color, ao, 0);
}

// A limb from a to b (unit coordinates), tapering
function limb(a, b, r0, r1, color) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 4, 1, true); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return colored(at(g, a[0], a[1], a[2]), color, () => 0.7, 0);
}

// A hanging strand (vine, moss beard): a narrow blade, top at (x, y, z), swinging slightly outward
function strand(x, y, z, len, w, color, yaw, cross = false) {
  const g = new THREE.PlaneGeometry(w, len, 1, 3), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const t = 0.5 - p.getY(k) / len; p.setXYZ(k, p.getX(k) * (1 - t * 0.75), -t * len, t * t * len * 0.15); }
  let geo = g;
  if (cross) { const h = g.clone(); h.rotateY(Math.PI / 2); geo = mergeGeometries([g, h]); }   // a beard, not a ribbon
  geo.rotateY(yaw);
  return colored(at(geo, x, y, z), color, (px, py) => 0.55 + 0.45 * Math.min(1, Math.max(0, 1 + (py - y) / len)), 2);
}

// One conifer tier: a drooping skirt. A tip, a shoulder ring and a rim; the rim alternates long drooping branch
// tips with short raised gaps, so the edge reads as branches from below and as a star from above.
function skirt({ r, hgt, y0, droop, jag, color, seg, ao }) {
  const pos = [], idx = [], ph = RND() * 6.283;
  pos.push(rr(-0.08, 0.08) * r, y0 + hgt, rr(-0.08, 0.08) * r);
  for (let k = 0; k < seg; k++) {
    const a = k / seg * Math.PI * 2 + ph, rm = r * 0.5 * rr(0.85, 1.1), ym = y0 + hgt * rr(0.4, 0.5);
    if (!SEG.far) pos.push(Math.sin(a) * rm, ym, Math.cos(a) * rm);
  }
  for (let k = 0; k < seg; k++) {
    const a = (k + rr(-0.15, 0.15)) / seg * Math.PI * 2 + ph, out = (k % 2 === 0 ? 1 + jag : 1 - jag) * rr(0.85, 1.15);
    pos.push(Math.sin(a) * r * out, y0 - droop * hgt * out * rr(0.7, 1.2) + (k % 2 ? hgt * jag * 0.6 : 0), Math.cos(a) * r * out);
  }
  const off = SEG.far ? 0 : seg;   // far: tip straight to the rim
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg, m0 = 1 + k, m1 = 1 + k1, r0 = 1 + off + k, r1 = 1 + off + k1;
    if (SEG.far) idx.push(0, r0, r1); else idx.push(0, m0, m1, m0, r0, r1, m0, r1, m1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return colored(g, color, (x, y, z) => ao(x, y) * (0.72 + 0.28 * Math.min(1, Math.hypot(x, z) / r)), 1);
}

function conifer({ trunk: tc = 0x4a3426, leaf = 0x24402a, tiers = 6, width = 0.16, bare = 0.3, trunkW = 0.035, droop = 0.3, jag = 0.2,
  dome = false, flare = 0.7, lobes = 4, lobeAmp = 0.3 }) {
  const parts = [trunk({ r0: trunkW, r1: trunkW * 0.25, h: 0.97, flare, lobes, lobeAmp, color: tc })];
  const n = SEG.far ? Math.max(3, Math.round(tiers * 0.55)) : tiers;
  const seg = SEG.far ? 6 : 8;
  const ao = aoY(bare - 0.05, 1);
  for (let i = 0; i < n; i++) {
    const t = i / n, y0 = bare + (1 - bare) * t * 0.88 * rr(0.97, 1.03), hgt = (1 - bare) / n * rr(1.8, 2.3);
    // spire for fir and spruce; old giants keep a broad, rounded, uneven top
    let r = dome ? width * Math.sqrt(Math.max(0.04, 1 - Math.pow(t, 2.4))) * (0.75 + 0.25 * (1 - t)) : width * (1 - t * 0.86);
    r *= rr(0.8, 1.18);
    const c = hueJit(leaf, 0.06);
    const sk = skirt({ r, hgt, y0, droop: droop * (1 - t * 0.5), jag, color: c, seg, ao });
    if (dome) sk.translate(rr(-0.4, 0.4) * r, 0, rr(-0.4, 0.4) * r);   // old giants: uneven, offset masses
    parts.push(sk);
  }
  return mergeGeometries(parts);
}

// Broadleaf: a flared trunk splitting into limbs that carry a clustered, irregular crown of foliage masses
function broadleaf({ trunk: tc = 0x5a4632, leaf = 0x3d5a26, crown = 0.62, spread = 0.26, blobs = 5, trunkW = 0.03, flat = 1,
  flare = 0.6, lobes = 4, lobeAmp = 0.5, vines = 0, vineColor = 0x2c4a22, small = 2 }) {
  const parts = [trunk({ r0: trunkW, r1: trunkW * 0.55, h: crown + 0.06, flare, lobes, lobeAmp, color: tc, ao: aoY(0, crown) })];
  const fork = crown * rr(0.9, 1.0), n = SEG.far ? Math.min(blobs, 5) : blobs;
  const ph = RND() * 6.283, clumps = [];
  for (let i = 0; i < n; i++) {
    const a = i / Math.max(1, n - 1) * Math.PI * 2 + ph + rr(-0.4, 0.4);
    const r = i === 0 ? spread * rr(0, 0.15) : spread * rr(0.45, 0.78);
    const s = spread * (i === 0 ? rr(0.7, 0.85) : rr(0.42, 0.66));
    const y = crown + (1 - crown) * (i === 0 ? 0.55 : rr(0.18, 0.5));
    clumps.push([Math.cos(a) * r, y, Math.sin(a) * r, s]);
  }
  if (!SEG.far) for (let i = 0; i < small; i++) {   // a few small outlying sprays break the outline
    const a = RND() * 6.283, r = spread * rr(0.8, 1.0);
    clumps.push([Math.cos(a) * r, crown + (1 - crown) * rr(0.05, 0.3), Math.sin(a) * r, spread * rr(0.22, 0.32), 0]);
  }
  for (const [x, y, z, s, det] of clumps) {
    const g = new THREE.IcosahedronGeometry(1, det ?? SEG.ico); g.scale(s, s * 0.7 * flat, s);
    parts.push(colored(lumpy(at(g, x, y, z), 0.42, RND() * 50), hueJit(leaf), aoY(crown - 0.05, 1), 1));
  }
  if (!SEG.far) {
    for (const [x, y, z, s] of clumps.slice(1, n)) parts.push(limb([0, fork, 0], [x * 0.8, y - s * 0.35 * flat, z * 0.8], trunkW * 0.5, trunkW * 0.2, tc));
    for (let i = 0; i < vines; i++) {
      const [x, y, z, s] = clumps[i % clumps.length], a = RND() * 6.283, o = s * rr(0.3, 0.8);
      parts.push(strand(x + Math.cos(a) * o, y - s * 0.5 * flat, z + Math.sin(a) * o, rr(0.08, 0.28) * (crown + 0.2), 0.011, vineColor, RND() * 3.14));
    }
  }
  return mergeGeometries(parts);
}
function emergent() {   // giant tropical emergent: buttressed bare trunk, wide flat umbrella crown, hanging lianas
  const parts = [trunk({ r0: 0.028, r1: 0.016, h: 0.86, flare: 2.2, flareH: 0.14, lobes: 5, lobeAmp: 1.5, color: 0x6b5a48, ao: aoY(0, 0.7) })];
  const n = SEG.far ? 5 : 7, clumps = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rr(-0.3, 0.3), r = i === 0 ? 0 : rr(0.13, 0.2);
    clumps.push([Math.cos(a) * r, rr(0.84, 0.92), Math.sin(a) * r, rr(0.13, 0.18)]);
  }
  for (const [x, y, z, s] of clumps) {
    const g = new THREE.IcosahedronGeometry(1, SEG.ico); g.scale(s, s * 0.42, s);
    parts.push(colored(lumpy(at(g, x, y, z), 0.35, RND() * 50), hueJit(0x2f5a1e), aoY(0.78, 0.95), 1));
  }
  if (!SEG.far) {
    for (const [x, y, z] of clumps.slice(1)) parts.push(limb([0, 0.8, 0], [x * 0.85, y - 0.03, z * 0.85], 0.012, 0.005, 0x6b5a48));
    for (let i = 0; i < 9; i++) {
      const [x, y, z, s] = clumps[1 + i % (n - 1)], a = RND() * 6.283;
      parts.push(strand(x + Math.cos(a) * s * 0.5, y - s * 0.3, z + Math.sin(a) * s * 0.5, rr(0.12, 0.35), 0.008, 0x31502a, RND() * 3.14));
    }
  }
  return mergeGeometries(parts);
}
function cypress() {    // swamp tree: strongly flared, fluted base, narrow trunk, flat irregular tiers with moss beards
  const parts = [trunk({ r0: 0.022, r1: 0.011, h: 0.95, flare: 2.0, flareH: 0.22, lobes: 6, lobeAmp: 0.5, color: 0x524634, ao: aoY(0, 0.5) })];
  const n = SEG.far ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, SEG.ico); const s = (0.23 - i * 0.12 / n * 3 * 0.25) * rr(0.8, 1.15); g.scale(s, s * 0.3, s);
    const a = RND() * 6.283, o = rr(0.03, 0.08), y = 0.6 + i * 0.36 / n;
    const x = Math.cos(a) * o, z = Math.sin(a) * o;
    parts.push(colored(lumpy(at(g, x, y, z), 0.45, RND() * 50), hueJit(0x3a4a26), aoY(0.55, 1), 1));
    if (!SEG.far) {
      parts.push(limb([0, y - 0.08, 0], [x * 0.9, y - 0.01, z * 0.9], 0.009, 0.004, 0x524634));
      for (let k = 0; k < 4; k++) {
        const b = RND() * 6.283, d = s * rr(0.2, 0.75);
        parts.push(strand(x + Math.cos(b) * d, y - s * 0.04, z + Math.sin(b) * d, rr(0.1, 0.22), 0.026, 0x5a6248, RND() * 3.14, true));
      }
    }
  }
  return mergeGeometries(parts);
}
// arching fronds from a crown point: tree ferns and palms
function fronds(n, y, len, w, droop, color, rise = 0.25) {
  const parts = [], ph = RND() * 6.283;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(w, 1, 1, 4), p = g.attributes.position, l = len * rr(0.85, 1.1), d = droop * rr(0.8, 1.2);
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) + 0.5;
      p.setXYZ(k, p.getX(k) * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 1.1, y + (rise * t - d * t * t) * l, t * l);
    }
    // leaflets droop from the midrib: a shallow fold along the frond
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - Math.abs(p.getX(k)) * 0.4);
    g.rotateY(i / n * Math.PI * 2 + ph + rr(-0.2, 0.2));
    g.computeVertexNormals();
    parts.push(colored(g, hueJit(color, 0.06), (x, yy, z) => 0.55 + 0.45 * Math.min(1, Math.hypot(x, z) / l * 1.5), 2));
  }
  return parts;
}
function treefern() {   // a slender fibrous trunk under a crown of arching fronds
  return mergeGeometries([trunk({ r0: 0.035, r1: 0.028, h: 0.86, flare: 0.5, flareH: 0.1, color: 0x3e3226, ao: aoY(0, 0.8) }), ...fronds(SEG.far ? 6 : 9, 0.84, 0.55, 0.16, 0.7, 0x3a6a26, 0.45)]);
}
function palm() {       // a leaning, curved trunk with a drooping crown
  const bend = rr(0.08, 0.16);
  const parts = [trunk({ r0: 0.03, r1: 0.02, h: 0.92, flare: 0.5, flareH: 0.06, bend, color: 0x6e604c, ao: aoY(0, 0.9) })];
  for (const f of fronds(10, 0.9, 0.42, 0.09, 0.9, 0x4a6e2a, 0.35)) parts.push(f.translate(bend * 0.85, 0, 0));
  return mergeGeometries(parts);
}
function shrub(color) {
  const s = rr(0.85, 1.1);
  const g = new THREE.IcosahedronGeometry(0.5, SEG.ico); g.scale(s, 0.75, 2 - s);
  const h = new THREE.IcosahedronGeometry(0.28, 0); const a = RND() * 6.283;
  return mergeGeometries([colored(lumpy(at(g, 0, 0.32, 0), 0.45, RND() * 50), color, aoY(0, 0.8), 1),
    colored(lumpy(at(h, Math.cos(a) * 0.38, 0.28, Math.sin(a) * 0.38), 0.4, RND() * 50), hueJit(color, 0.1), aoY(0, 0.6), 1)]);
}
function rock() { const g = new THREE.IcosahedronGeometry(0.5, SEG.ico); g.scale(rr(0.85, 1.15), rr(0.5, 0.7), rr(0.7, 0.9)); return colored(lumpy(at(g, 0, 0.15, 0), 0.6, 11 + RND() * 40), 0x77736c, aoY(-0.1, 0.6), 3); }
function tuft(color, blades = 7, lean = 0.35, width = 0.12) {     // crossed blades: grass, sedge, reeds
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = i / blades * Math.PI * 2 + (i % 3) * 0.3, hh = 0.75 + 0.25 * ((i * 7) % 5) / 4;
    const g = new THREE.PlaneGeometry(width, 1, 1, 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.5; p.setXYZ(k, p.getX(k) * (1 - y * 0.85), y * hh, y * y * lean); }
    g.rotateY(a); parts.push(colored(g, color, (x, y) => 0.45 + 0.55 * y, 2));
  }
  return mergeGeometries(parts);
}
function reeds() {      // tall reed blades with a few dark seed heads
  const parts = [tuft(0x667438, 12, 0.1, 0.05)];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4, o = 0.05, hh = 0.84 + i * 0.06;
    const g = new THREE.CylinderGeometry(0.007, 0.007, 0.08, 5, 1, false);
    parts.push(colored(at(g, Math.cos(a) * o, hh, Math.sin(a) * o), 0x4a3424, () => 1, 0));
  }
  return mergeGeometries(parts);
}
function fern() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(0.35, 1, 1, 3); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.5; p.setXYZ(k, p.getX(k) * Math.sin(y * Math.PI) * 1.2, Math.sin(y * 1.3) * 0.75, y * 0.85); }
    g.rotateY(i / 6 * Math.PI * 2); parts.push(colored(g, 0x2f5a24, (x, y) => 0.5 + 0.7 * y, 2));
  }
  return mergeGeometries(parts);
}

// species: geometry, size range (meters, height) and layer
const SPECIES = {
  sequoia: { geo: () => conifer({ trunk: 0x7a4630, leaf: 0x2c4a2c, tiers: 8, width: 0.125, bare: 0.4, trunkW: 0.045, droop: 0.12, jag: 0.34, dome: true, flare: 1.0, lobes: 5, lobeAmp: 0.35 }), h: [60, 100], layer: 'trees' },
  fir: { geo: () => conifer({ leaf: 0x203a28, tiers: 8, width: 0.17, bare: 0.18, droop: 0.3, jag: 0.22 }), h: [35, 70], layer: 'trees' },
  spruce: { geo: () => conifer({ leaf: 0x1a3024, tiers: 10, width: 0.12, bare: 0.08, trunkW: 0.025, droop: 0.45, jag: 0.2, flare: 0.6 }), h: [30, 60], layer: 'trees' },
  oak: { geo: () => broadleaf({}), h: [40, 75], layer: 'trees' },
  jungle: { geo: () => broadleaf({ leaf: 0x2f5a1c, crown: 0.58, spread: 0.3, blobs: 6, flat: 0.88, flare: 1.4, lobeAmp: 1.4, vines: 7 }), h: [55, 95], layer: 'trees' },
  emergent: { geo: emergent, h: [95, 150], layer: 'trees' },
  cypress: { geo: cypress, h: [28, 55], layer: 'trees' },
  krumm: { geo: () => conifer({ leaf: 0x2a3c2a, tiers: 4, width: 0.3, bare: 0.05, trunkW: 0.05, droop: 0.15, jag: 0.3, flare: 0.3 }), h: [2, 7], layer: 'under' },
  sapling: { geo: () => broadleaf({ leaf: 0x46662c, crown: 0.45, spread: 0.32, blobs: 4, flare: 0.3, small: 1 }), h: [6, 18], layer: 'under' },
  youngfir: { geo: () => conifer({ leaf: 0x284430, tiers: 5, width: 0.22, bare: 0.08, droop: 0.3, flare: 0.3 }), h: [5, 16], layer: 'under' },
  treefern: { geo: treefern, h: [4, 11], layer: 'under' },
  palm: { geo: palm, h: [10, 24], layer: 'under' },
  bush: { geo: () => shrub(0x3e5a2a), h: [1.2, 4], layer: 'under' },
  drybush: { geo: () => shrub(0x6f6a44), h: [0.6, 1.8], layer: 'under' },
  boulder: { geo: rock, h: [1.5, 6], layer: 'under' },
  fern: { geo: fern, h: [0.6, 1.6], layer: 'ground' },
  grass: { geo: () => tuft(0x6a8a3c, 9, 0.3), h: [0.35, 0.9], layer: 'ground' },
  sedge: { geo: () => tuft(0x5a6e38, 12, 0.15), h: [0.6, 1.6], layer: 'ground' },
  reed: { geo: reeds, h: [1.6, 3.2], layer: 'ground' },
  drygrass: { geo: () => tuft(0xa49a62, 7, 0.25), h: [0.3, 0.7], layer: 'ground' },
  stone: { geo: rock, h: [0.2, 0.8], layer: 'ground' }
};

// what grows in each zone: [species, weight] per layer, and candidates per cell
const ZONES = {
  tropical: { trees: [['jungle', 6], ['emergent', 1.4], ['oak', 1]], under: [['sapling', 3], ['treefern', 3], ['bush', 3], ['boulder', 0.3]], ground: [['fern', 6], ['sedge', 1]] },
  mixed: { trees: [['sequoia', 4], ['fir', 3], ['oak', 4]], under: [['youngfir', 3], ['sapling', 3], ['bush', 3], ['boulder', 0.5]], ground: [['fern', 4], ['grass', 2], ['stone', 0.4]] },
  taiga: { trees: [['spruce', 7], ['fir', 3]], under: [['youngfir', 5], ['bush', 2], ['boulder', 0.7]], ground: [['fern', 2], ['grass', 2], ['stone', 0.6]] },
  wetland: { trees: [['cypress', 7], ['oak', 1]], under: [['bush', 3], ['sapling', 2]], ground: [['sedge', 5], ['reed', 3], ['grass', 2]] },
  bayou: { trees: [['cypress', 6], ['oak', 2]], under: [['bush', 3], ['treefern', 1]], ground: [['sedge', 4], ['reed', 3], ['fern', 2]] },
  alpine: { trees: [], under: [['krumm', 3], ['bush', 1.5], ['boulder', 3]], ground: [['grass', 4], ['stone', 3]] },
  tundra: { trees: [], under: [['bush', 2], ['boulder', 2]], ground: [['grass', 4], ['stone', 2]] },
  desert: { trees: [], under: [['drybush', 2], ['boulder', 2.5]], ground: [['drygrass', 2], ['stone', 3]] },
  snow: { trees: [], under: [['boulder', 0.6]], ground: [] },
  volcanic: { trees: [], under: [['boulder', 2]], ground: [['stone', 3]] }   // black rock and ash soils
};

// foliage tint by zone (multiplies the species color; bark only takes its brightness), and moss on bark and rock
const PALETTE = {
  tropical: [0.9, 1.1, 0.7], mixed: [1, 1, 0.95], taiga: [0.76, 0.88, 1.02], wetland: [1.08, 0.98, 0.64], bayou: [1.02, 0.93, 0.62],
  alpine: [0.92, 0.95, 0.92], tundra: [1.06, 0.95, 0.76], desert: [1, 1, 1], snow: [0.95, 0.97, 1], volcanic: [0.55, 0.55, 0.55]
};
const MOSS = { tropical: 0.8, mixed: 0.6, taiga: 0.45, wetland: 1, bayou: 1, alpine: 0.3, tundra: 0.3, desert: 0, snow: 0.1, volcanic: 0.05 };

// Trunk radius as a fraction of height at a walker's height above the ground line, including the base flare
// (r0 × (1 + flare × ~0.25 × lobes)), and low-crown radius for young trees.
const TRUNK = { sequoia: 0.058, fir: 0.042, spruce: 0.029, oak: 0.036, jungle: 0.048, emergent: 0.075, cypress: 0.05,
  sapling: 0.03, youngfir: 0.035, krumm: 0.05, treefern: 0.035, palm: 0.032, boulder: 0.45 };
const CROWN = { youngfir: 0.2, krumm: 0.3, sapling: 0.15, bush: 0.5, boulder: 0.5 };

const LAYERS = {
  trees: { cell: 40, per: 3, radius: 2600, chunk: 8, density: { tropical: 1, mixed: 0.9, taiga: 0.95, wetland: 0.45, bayou: 0.55 } },
  under: { cell: 24, per: 2, radius: 700, chunk: 8, density: { snow: 0.1, alpine: 0.55, tundra: 0.45, desert: 0.35, volcanic: 0.3 } },
  ground: { cell: 4, per: 1, radius: 95, chunk: 8 }
};

const VERT = /* glsl */`
precision highp float;
attribute vec3 color; attribute vec3 aK; attribute float aMoss;
varying vec3 vColor, vN, vView, vObj, vK; varying float vMoss;
uniform float uTime, uRadiusM;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 p = position;
  // wind: crowns sway, more at the top; each plant has its own phase from its position; leaves flutter a little
  float ph = 0.0; vec3 ic = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    ic = instanceColor;
    ph = (instanceColor.r * 41.0 + instanceColor.b * 17.0) * 6.2831;
  #endif
  float sway = p.y * p.y * 0.012;
  p.x += sin(uTime * 0.9 + ph) * sway; p.z += cos(uTime * 0.7 + ph * 1.3) * sway * 0.7;
  p += aK.x * 0.002 * p.y * vec3(sin(uTime * 2.7 + ph + p.y * 37.0), 0.0, cos(uTime * 3.1 + ph + p.x * 41.0));
  vec4 w = instanceMatrix * vec4(p, 1.0);
  vec4 mv = modelViewMatrix * w;
  // the instance color carries the zone's foliage tint; bark and rock take only its brightness
  vColor = color * mix(vec3(dot(ic, vec3(0.3, 0.55, 0.15))), ic, aK.x);
  vK = aK; vMoss = aMoss;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = (vec4(mv.xyz, 0.0) * viewMatrix).xyz;
  vObj = position;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const FRAG = /* glsl */`
precision highp float; precision highp int;
uniform vec3 uSunDir, uSunColor, uUp; uniform float uDay, uExposure, uRadiusM;
varying vec3 vColor, vN, vView, vObj, vK; varying float vMoss;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_FOG}
${GLSL_NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = -normalize(vView);
  float leaf = vK.x, shell = vK.y, rock = vK.z;
  float back = step(dot(N, V), 0.0);
  if (back > 0.5) N = -N;                            // two-sided leaves and blades
  float inside = back * shell;                       // looking up into a crown or a conifer skirt: its shaded underside
  vec3 base; float selfShade = 1.0;
  if (leaf > 0.5) {
    // leaf clumps: break up the flat primitives, with gaps of shade inside the crown and sunlit young leaves
    float clump = vnoise(vObj * vec3(14.0, 18.0, 14.0)) * 0.6 + vnoise(vObj * 47.0) * 0.4;
    base = vColor * (0.62 + 0.75 * clump);
    base = mix(base, base * vec3(0.9, 1.08, 0.78), smoothstep(0.55, 0.8, clump) * 0.6);
    selfShade = 0.55 + 0.45 * smoothstep(0.25, 0.7, clump);
  } else {
    // bark fissures, and moss low on the trunks and on the tops of rocks in wet country
    float bark = vnoise(vObj * vec3(60.0, 6.0, 60.0));
    base = vColor * (0.74 + 0.5 * bark);
    float where = mix(1.0 - smoothstep(0.03, 0.3, vObj.y), smoothstep(0.0, 0.7, dot(N, uUp)), rock);
    float moss = smoothstep(0.45, 0.7, vnoise(vObj * vec3(26.0, 9.0, 26.0) + 3.7)) * where * vMoss;
    base = mix(base, mix(vec3(0.045, 0.075, 0.02), vec3(0.13, 0.14, 0.08), rock), moss * 0.8);
  }
  float ndl = dot(N, uSunDir);
  // foliage takes wrapped light (a crown is a volume, not a shell); bark and rock plain Lambert
  float diff = mix(max(ndl, 0.0), clamp((ndl + 0.45) / 1.45, 0.0, 1.0), leaf) * selfShade * (1.0 - 0.65 * inside);
  float vs = max(dot(-V, uSunDir), 0.0);
  // light through leaves against the sun: strongest through thin blades and canopy undersides
  // (a thick crown's underside passes little; thin blades and the open undersides of conifer skirts pass more)
  float under = shell * (1.0 - inside) * (1.0 - smoothstep(-0.7, 0.1, dot(N, uUp)));
  float trans = leaf * (pow(vs, 4.0) * mix(0.3, 0.75, max(inside, 1.0 - shell)) + vs * vs * 0.04) * (1.0 - 0.75 * under);
  float sky = 0.55 + 0.45 * dot(N, uUp);
  vec3 skyLight = mix(vec3(0.02, 0.03, 0.06), vec3(0.20, 0.27, 0.36), uDay) * sky * (1.0 - 0.45 * inside);
  vec3 bounce = vec3(0.05, 0.05, 0.03) * uDay * max(-dot(N, uUp), 0.0);           // a little light back off the ground
  float contact = mix(0.6, 1.0, smoothstep(0.0, 0.1, vObj.y + rock * 0.12));   // ground contact: darker at the foot
  vec3 col = base * contact * (diff * uSunColor * 1.1 * uDay + skyLight + bounce + uSunColor * trans * uDay * vec3(0.8, 1.0, 0.45));
  float alt = uCamAltM + dot(vView, uUp) * uRadiusM;
  col = applyFog(col, vView, alt, uRadiusM);
  col *= uExposure; col = col / (1.0 + col);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// soft occlusion baked into foliage: faces turned in toward the crown's middle, and its underside, are darker
function crownAO(g) {
  const p = g.attributes.position, n = g.attributes.normal, k = g.attributes.aK, c = g.attributes.color;
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (let i = 0; i < p.count; i++) if (k.getY(i) > 0.5) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); m++; }
  if (!m) return g;
  cx /= m; cy /= m; cz /= m;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    if (k.getY(i) < 0.5) continue;
    d.set(p.getX(i) - cx, (p.getY(i) - cy) * 1.6, p.getZ(i) - cz).normalize();
    const o = d.x * n.getX(i) + d.y * n.getY(i) + d.z * n.getZ(i);
    const a = 0.68 + 0.32 * THREE.MathUtils.smoothstep(o, -0.6, 0.6);
    c.setXYZ(i, c.getX(i) * a, c.getY(i) * a, c.getZ(i) * a);
  }
  return g;
}

export class Vegetation {
  constructor({ terrain, heightfield, scene, planet, quality = 1 }) {
    this.terrain = terrain; this.hf = heightfield; this.planet = planet;
    this.group = new THREE.Group(); scene.add(this.group);
    this.relief = 1;
    this.chunks = new Map();          // key -> { species: { name: Float64Array rows } }
    this.queue = []; this.dirty = true; this.enabled = true; this.quality = quality;
    const fogU = terrain.material.uniforms;
    this.uniforms = {
      uTime: { value: 0 }, uRadiusM: fogU.uRadiusM, uSunDir: fogU.uSunDir, uSunColor: fogU.uSunColor, uExposure: fogU.uExposure,
      uUp: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 },
      uFogSun: fogU.uFogSun, uFogAway: fogU.uFogAway, uFogZenith: fogU.uFogZenith, uFogDensity: fogU.uFogDensity, uFogHeight: fogU.uFogHeight, uCamAltM: fogU.uCamAltM, uSunDirF: fogU.uSunDirF
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide });
    this.meshes = {};                 // `${layer}:${species}:${variant}[:far]` -> InstancedMesh, made when first needed
    this.geos = {};
    this.caps = { trees: 30000, under: 9000, ground: 7000 };   // per species; split across its shape variants
    this.reach = 1;                   // tree ring grows with height above ground (set each frame)
    this.lastBuild = {};
    this.stats = { instances: 0, chunks: 0 };
  }

  clear() { this.chunks.clear(); this.queue = []; this.dirty = true; this.lastBuild = {}; for (const m of Object.values(this.meshes)) m.count = 0; }

  _mesh(layer, name, v = 0, far = false) {
    const key = `${layer}:${name}:${v}${far ? ':far' : ''}`;
    let m = this.meshes[key];
    if (!m) {
      const gk = `${name}:${v}${far ? ':far' : ''}`;
      if (!this.geos[gk]) {
        if (far) Object.assign(SEG, { ico: 0, cone: 5, cyl: 4, far: true });
        RND = rng(1013 + v * 7919 + name.length * 31 + name.charCodeAt(0) * 3);   // near and far share a seed: same silhouette
        this.geos[gk] = crownAO(SPECIES[name].geo());
        Object.assign(SEG, { ico: 1, cone: 8, cyl: 7, far: false }); RND = Math.random;
      }
      const geo = this.geos[gk];
      const cap = Math.ceil(this.caps[layer] / VARIANTS[layer] * (VARIANTS[layer] > 1 ? 1.25 : 1));
      m = new THREE.InstancedMesh(geo, this.material, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
      m.moss = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aMoss', m.moss);
      m.count = 0; m.frustumCulled = false; m.userData = { cap, layer, key };
      this.meshes[key] = m; this.group.add(m);
    }
    return m;
  }

  // one chunk of one layer: candidates on the cell grid, filtered by zone, slope and shoreline
  _generate(layer, I, J) {
    const L = LAYERS[layer], R = this.terrain.radiusM, dLat = L.cell / (R * D2R), out = {};
    const salt = layer === 'trees' ? 101 : layer === 'under' ? 202 : 303;
    for (let ii = 0; ii < L.chunk; ii++) {
      const i = I * L.chunk + ii, latC = (i + 0.5) * dLat;
      if (Math.abs(latC) > 89) continue;
      const dLon = L.cell / (R * Math.cos(latC * D2R) * D2R);
      for (let jj = 0; jj < L.chunk; jj++) {
        const j = J * L.chunk + jj;
        for (let k = 0; k < L.per; k++) {
          const s = salt + k * 17;
          const lat = (i + cellRand(i, j, s)) * dLat, lon = wrapLon((j + cellRand(i, j, s + 1)) * dLon);
          if (!this.hf.inside(lat, lon)) continue;
          const coast = this.hf.land(lat, lon);
          if (coast < (layer === 'ground' ? 0.53 : 0.6)) continue;
          // jitter the biome lookup by up to ~600 m so zone edges are not the 1 km texel grid
          const jl = (cellRand(i, j, s + 2) - 0.5) * 600 / (R * D2R), jo = (cellRand(i, j, s + 3) - 0.5) * 600 / (R * D2R * Math.cos(lat * D2R));
          const samp = this.hf.sample(lat + jl, lon + jo);
          const h = this.terrain.groundAt(lat, lon);   // drawn ground (times relief), for placement
          // zones and snowline follow the true height, as the terrain shader does, whatever the relief slider says
          const rel = this.terrain.relief, hz = rel > 1e-3 ? h / rel : this.hf.ground(lat, lon).h;
          const zone = zoneAt(samp.biome, lat, hz, coast, lon);
          const Z = ZONES[zone]; if (!Z) continue;
          // the open strand: bare sand or shingle, only the odd tuft (reeds at wetland edges are kept)
          if (layer === 'ground' && coast < 0.66 && zone !== 'wetland' && zone !== 'bayou' && cellRand(i, j, s + 9) > 0.12) continue;
          const list = Z[layer]; if (!list || !list.length) continue;
          let dens = layer === 'trees' ? (L.density[zone] ?? 0) : (L.density?.[zone] ?? 1);
          // natural clearings and meadows (proposed in the spec): fewer big trees, more ground cover
          const clear = vnoise(lat * 900, lon * 900, 7.7);
          if (layer === 'trees') dens *= clear > 0.66 ? 0.12 : 1;
          if (layer === 'ground' && clear > 0.66 && zone !== 'snow') dens *= 1.0;
          if (cellRand(i, j, s + 4) > dens) continue;
          // slope from the drawn ground: no big trees on cliffs
          const e = 3 / (R * D2R);
          const sl = Math.hypot(this.terrain.groundAt(lat + e, lon) - h, this.terrain.groundAt(lat, lon + e / Math.cos(lat * D2R)) - h) / 3;
          let pick = pickWeighted(list, cellRand(i, j, s + 5));
          // shore fringes: palms along tropical strands, reeds at the water's edge in the swamps
          const rs = cellRand(i, j, s + 10);
          if (layer === 'under' && zone === 'tropical' && coast < 0.74 && rs < 0.75) pick = 'palm';
          if (layer === 'ground' && (zone === 'wetland' || zone === 'bayou') && coast < 0.68 && rs < 0.6) pick = 'reed';
          if (sl > 0.75 && layer !== 'ground') pick = 'boulder';
          else if (sl > 0.9) pick = 'stone';
          if (layer === 'ground' && clear > 0.66 && pick === 'fern') pick = 'grass';
          const sp = SPECIES[pick]; if (!sp) continue;
          const r6 = cellRand(i, j, s + 6), r7 = cellRand(i, j, s + 7), tint = cellRand(i, j, s + 8);
          const size = sp.h[0] + (sp.h[1] - sp.h[0]) * Math.pow(r6, 1.4);
          const rows = out[pick] || (out[pick] = []);
          // light under the canopy: dense forest shades its own understory and floor
          const forest = zone === 'tropical' || zone === 'mixed' || zone === 'taiga' || zone === 'wetland' || zone === 'bayou';
          const light = !forest || clear > 0.66 ? 1 : layer === 'trees' ? 0.9 : layer === 'under' ? 0.62 : 0.5;
          // foliage tint: the zone, darker and bluer toward the treeline, and broad moist/dry patches a few km across
          const pal = PALETTE[zone];
          const mont = Math.min(1, Math.max(0, (hz - (treeline(lat, samp.biome === 5) - 1800)) / 1500));
          const pn = vnoise(lat * D2R * R / 1400, lon * D2R * R * Math.cos(lat * D2R) / 1400, 5.3);
          const pr = pal[0] * (1 - mont * 0.14) * (1.1 - pn * 0.2), pg = pal[1] * (1 - mont * 0.08) * (1.04 - pn * 0.08), pb = pal[2] * (1 + mont * 0.03) * (0.86 + pn * 0.28);
          // the odd broadleaf in fresh, lighter leaf
          const fresh = (pick === 'oak' || pick === 'jungle' || pick === 'sapling') && tint > 0.9 ? 1.18 : 1;
          rows.push(lat, lon, h, size, r7 * Math.PI * 2, tint, light, pr * fresh, pg * fresh, pb * (fresh > 1 ? 0.85 : 1), MOSS[zone] ?? 0.5, cellRand(i, j, s + 9));
        }
      }
    }
    for (const k of Object.keys(out)) out[k] = Float64Array.from(out[k]);
    return out;
  }

  _chunkKeys(layer, lat, lon, radius) {
    const L = LAYERS[layer], R = this.terrain.radiusM, dLat = L.cell / (R * D2R), span = L.cell * L.chunk;
    const keys = [], i0 = Math.floor(lat / dLat / L.chunk), nI = Math.ceil(radius / span) + 1;
    for (let I = i0 - nI; I <= i0 + nI; I++) {
      const latC = (I + 0.5) * L.chunk * dLat;
      if (Math.abs(latC) > 88) continue;
      const dLon = L.cell / (R * Math.cos(latC * D2R) * D2R);
      const j0 = Math.floor(lon / dLon / L.chunk), nJ = Math.ceil(radius / span) + 1;
      for (let J = j0 - nJ; J <= j0 + nJ; J++) {
        const dn = (latC - lat) * D2R * R, de = ((J + 0.5) * L.chunk * dLon - lon) * D2R * R * Math.cos(lat * D2R);
        const d = Math.max(0, Math.hypot(dn, de) - span * 0.75);
        if (d <= radius) keys.push({ key: `${layer}/${I}/${J}/${R}`, layer, I, J, d });
      }
    }
    return keys;
  }

  // Solid things near a walker: trunks of trees and young trees, and boulders. Radii follow the drawn shapes.
  _solids(lat, lon, reach) {
    const R = this.terrain.radiusM, out = [];
    for (const layer of ['trees', 'under']) {
      for (const k of this._chunkKeys(layer, lat, lon, reach)) {
        const ch = this.chunks.get(k.key); if (!ch) continue;
        for (const [name, rows] of Object.entries(ch.data)) {
          const tw = TRUNK[name]; if (!tw) continue;
          for (let r = 0; r < rows.length; r += STRIDE) {
            const dn = (rows[r] - lat) * D2R * R, de = (rows[r + 1] - lon) * D2R * R * Math.cos(lat * D2R);
            if (Math.abs(dn) > reach || Math.abs(de) > reach) continue;
            const w = (0.85 + rows[r + 5] * 0.3) * (layer === 'trees' ? 1.35 : 1);
            out.push({ dn, de, r: tw * rows[r + 3] * w, crown: CROWN[name] ? CROWN[name] * rows[r + 3] * w : 0 });
          }
        }
      }
    }
    return out;
  }

  // push (meters east/north) that moves a walker at lat/lon out of any trunk; null when clear
  collide(lat, lon, body = 0.4) {
    let best = null, depth = 0;
    for (const t of this._solids(lat, lon, 12)) {
      const d = Math.hypot(t.dn, t.de), pen = t.r + body - d;
      if (pen > depth) { depth = pen; const k = d > 1e-6 ? pen / d : 1; best = { dn: -t.dn * k, de: -t.de * k }; }
    }
    return best;
  }

  // the nearest spot (lat, lon) within ~60 m that is clear of trunks and of low crowns, for landing
  clearSpot(lat, lon) {
    const R = this.terrain.radiusM, solids = this._solids(lat, lon, 80);
    const ok = (dn, de) => solids.every(t => Math.hypot(t.dn - dn, t.de - de) > Math.max(t.r + 1.2, t.crown));
    for (let ring = 0; ring <= 20; ring++) {
      const n = Math.max(1, ring * 6);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, dn = Math.cos(a) * ring * 3, de = Math.sin(a) * ring * 3;
        if (ok(dn, de)) return { lat: lat + dn / R / D2R, lon: lon + de / (R * Math.cos(lat * D2R)) / D2R };
      }
    }
    return { lat, lon };
  }

  // unit direction of a chunk's middle, to order builds nearest first
  _center(layer, I, J) {
    const L = LAYERS[layer], R = this.terrain.radiusM, dLat = L.cell / (R * D2R), latC = (I + 0.5) * L.chunk * dLat;
    const lonC = (J + 0.5) * L.chunk * L.cell / (R * Math.cos(latC * D2R) * D2R), p = latC * D2R, l = lonC * D2R;
    return new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l));
  }

  _radius(layer) {
    const q = this.quality;
    return LAYERS[layer].radius * (layer === 'trees' ? q * this.reach : Math.min(q, 1.2));
  }

  update(dt, camera, latLon, agl, frameBudgetMs = 5) {
    const reach = Math.min(2, 1 + Math.max(0, agl - 20) / 1200);
    if (Math.abs(reach - this.reach) > 0.15) { this.reach = reach; this.lastBuild.trees = null; }
    this.uniforms.uTime.value += dt;
    this.uniforms.uUp.value.copy(camera.position).normalize();
    const show = this.enabled && agl < 3500;
    this.group.visible = show;
    if (!show) return;
    const want = [];
    for (const layer of Object.keys(LAYERS)) want.push(...this._chunkKeys(layer, latLon.lat, latLon.lon, this._radius(layer)));
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let added = 0; this._addedTo = new Set();
    for (const w of want) {
      if (this.chunks.has(w.key)) continue;
      if (performance.now() - t0 > frameBudgetMs && added > 0) break;
      this.chunks.set(w.key, { layer: w.layer, data: this._generate(w.layer, w.I, w.J), c: this._center(w.layer, w.I, w.J) }); added++;
      (this._addedTo || (this._addedTo = new Set())).add(w.layer);
    }
    const wantSet = new Set(want.map(w => w.key));
    for (const k of this.chunks.keys()) if (!wantSet.has(k)) this.chunks.delete(k);   // drop what fell out of range
    const R = this.terrain.radiusM, step = { trees: 40, under: 14, ground: 3 };
    for (const layer of Object.keys(LAYERS)) {
      const lb = this.lastBuild[layer];
      const moved = !lb || lb.distanceTo(camera.position) * R > step[layer];
      if (moved || this.dirty || (added && this._addedTo?.has(layer))) this._build(camera, layer);
    }
    this.dirty = false;
  }

  // instance matrices relative to an anchor next to the camera, so float32 positions stay exact to millimeters
  _build(camera, layer) {
    const R = this.terrain.radiusM;
    const lb = this.lastBuild[layer] || (this.lastBuild[layer] = new THREE.Vector3());
    lb.copy(camera.position);
    const grp = this._group(layer);
    grp.position.copy(camera.position);
    const counts = {};
    const m4 = new THREE.Matrix4(), up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3();
    const x = new THREE.Vector3(), z = new THREE.Vector3(), u = new THREE.Vector3(), col = new THREE.Color();
    const camR = camera.position;
    const lim = this._radius(layer);
    const lim2 = (lim / R) ** 2, farD2 = (650 / R) ** 2;   // beyond this, the simpler far shapes
    const nv = VARIANTS[layer], leanMax = layer === 'trees' ? 0.05 : layer === 'under' ? 0.09 : 0.18;
    // nearest chunks first, so when a species fills its instance cap the farthest trees are the ones left out;
    // chunks wholly beyond the ring are skipped without walking their rows
    const span = LAYERS[layer].cell * LAYERS[layer].chunk / R, list = [], camDir = camR.clone().normalize();
    for (const ch of this.chunks.values()) {
      if (ch.layer !== layer) continue;
      const d = ch.c ? ch.c.distanceTo(camDir) : 0;   // along the ground: chunk centers sit at sea level
      if (d - span * 0.75 > lim / R) continue;
      list.push([d, ch]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, ch] of list) {
      for (const [name, rows] of Object.entries(ch.data)) {
        const rock = name === 'boulder' || name === 'stone';
        const meshes = [];
        for (let v = 0; v < nv; v++) meshes.push([this._mesh(layer, name, v), layer === 'trees' ? this._mesh(layer, name, v, true) : null]);
        for (const pair of meshes) for (const mm of pair) if (mm && mm.parent !== grp) grp.add(mm);
        const lean = rock ? 0 : name === 'palm' ? 0.22 : leanMax;
        for (let r = 0; r < rows.length; r += STRIDE) {
          const lat = rows[r], lon = rows[r + 1], h = rows[r + 2], size = rows[r + 3], yaw = rows[r + 4], tint = rows[r + 5], light = rows[r + 6];
          const rv = rows[r + 11];
          const p = lat * D2R, l = lon * D2R, cp = Math.cos(p);
          up.set(cp * Math.cos(l), Math.sin(p), -cp * Math.sin(l));
          const sink = rock ? 0.3 * size : layer === 'trees' ? 1.5 + size * 0.02 : 0.12;
          const rr1 = 1 + (h - sink) / R;
          const px = up.x * rr1 - camR.x, py = up.y * rr1 - camR.y, pz = up.z * rr1 - camR.z;
          const d2 = px * px + py * py + pz * pz;
          if (d2 > lim2) continue;
          const edge = layer === 'ground' ? 1 : Math.min(1, (1 - Math.sqrt(d2 / lim2)) / 0.18);   // shrink into the ring's edge, no pop
          east.set(-Math.sin(l), 0, -Math.cos(l)); north.crossVectors(up, east);
          // a slight random lean: the foot stays put, the axis tips
          const la = ((rv * 3.71) % 1) * Math.PI * 2, lk = lean * ((rv * 7.13) % 1);
          u.copy(up).addScaledVector(east, Math.cos(la) * lk).addScaledVector(north, Math.sin(la) * lk).normalize();
          x.copy(east).multiplyScalar(Math.cos(yaw)).addScaledVector(north, Math.sin(yaw));
          x.addScaledVector(u, -x.dot(u)).normalize();
          z.crossVectors(x, u);
          const s = size / R * edge, w = s * (0.85 + tint * 0.3) * (layer === 'trees' ? 1.35 : 1);
          m4.set(x.x * w, u.x * s, z.x * w, px, x.y * w, u.y * s, z.y * w, py, x.z * w, u.z * s, z.z * w, pz, 0, 0, 0, 1);
          const pair = meshes[Math.min(nv - 1, Math.floor(rv * nv))];
          const mesh = d2 > farD2 && pair[1] ? pair[1] : pair[0], key = mesh.userData.key;
          const c = counts[key] || 0; if (c >= mesh.userData.cap) continue;
          mesh.setMatrixAt(c, m4);
          const k = (0.82 + tint * 0.32) * light;
          col.setRGB(k * (0.95 + tint * 0.1) * rows[r + 7], k * rows[r + 8], k * (1.05 - tint * 0.1) * rows[r + 9]);
          mesh.setColorAt(c, col);
          mesh.moss.setX(c, rows[r + 10]);
          counts[key] = c + 1;
        }
      }
    }
    for (const [key, mesh] of Object.entries(this.meshes)) {
      if (mesh.userData.layer !== layer) continue;
      const n = counts[key] || 0;
      mesh.count = n;
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
      mesh.moss.clearUpdateRanges(); mesh.moss.addUpdateRange(0, n); mesh.moss.needsUpdate = true;
    }
    let total = 0; for (const m of Object.values(this.meshes)) total += m.count;
    this.stats.instances = total; this.stats.chunks = this.chunks.size;
  }

  _group(layer) {
    this.groups = this.groups || {};
    if (!this.groups[layer]) { this.groups[layer] = new THREE.Group(); this.group.add(this.groups[layer]); }
    return this.groups[layer];
  }
}

function pickWeighted(list, r) {
  let sum = 0; for (const [, w] of list) sum += w;
  let t = r * sum;
  for (const [n, w] of list) { if ((t -= w) <= 0) return n; }
  return list[list.length - 1][0];
}
const wrapLon = a => ((a + 180) % 360 + 360) % 360 - 180;
