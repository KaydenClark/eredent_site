import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cellRand, vnoise } from './noise.js';
import { zoneAt } from './biomes.js';
import { GLSL_FOG } from './shaders.js';

// Instanced vegetation and rocks around the camera, placed deterministically on a latitude/longitude cell grid so
// the same tree stands in the same place every visit. Three layers stream in chunks, nearest first:
//   trees   big Pandora-scale trees (canopy heights from the spec, "Proposed"), out to ~2.5 km
//   under   understory trees, shrubs and rocks, out to ~700 m
//   ground  ferns, grass, sedge and stones, out to ~90 m
// Nothing is placed in water, on snow, or (trees) in the desert zones. Species shapes are generic; they stand in for
// the spec's descriptions until Kayden names real flora.

const D2R = Math.PI / 180;

// --- geometry: unit-height shapes with vertex colors (y up, base at 0) ------------------------------------
function colored(g, c, shade = null) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), cc = new THREE.Color(c);
  for (let i = 0; i < pos.count; i++) {
    const k = shade ? shade(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
    col[i * 3] = cc.r * k; col[i * 3 + 1] = cc.g * k; col[i * 3 + 2] = cc.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const lumpy = (g, amt, seed) => {   // break up perfect primitives (welded first, so the shading stays smooth)
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 3.1 + seed, y * 3.1, z * 3.1) - 0.5;
    p.setXYZ(i, x * (1 + n * amt), y * (1 + n * amt * 0.6), z * (1 + n * amt));
  }
  g.computeVertexNormals(); return g;
};
const aoY = (lo, hi) => (x, y) => 0.55 + 0.45 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)));

function conifer({ trunk = 0x4a3426, leaf = 0x24402a, tiers = 6, width = 0.16, bare = 0.3, trunkW = 0.035 }) {
  const parts = [colored(at(new THREE.CylinderGeometry(trunkW * 0.55, trunkW, 1, 7, 1, true), 0, 0.5, 0), trunk, aoY(0, 0.6))];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, y0 = bare + (1 - bare) * t * 0.92, hgt = (1 - bare) / tiers * 1.9;
    const r = width * (1 - t * 0.8);
    parts.push(colored(lumpy(at(new THREE.ConeGeometry(r, hgt, 8, 1, true), 0, y0 + hgt / 2, 0), 0.25, i), leaf, aoY(y0 - 0.1, y0 + hgt * 1.2)));
  }
  return mergeGeometries(parts);
}
function broadleaf({ trunk = 0x5a4632, leaf = 0x3d5a26, crown = 0.62, spread = 0.26, blobs = 5, trunkW = 0.03, flat = 1 }) {
  const parts = [colored(at(new THREE.CylinderGeometry(trunkW * 0.6, trunkW, crown + 0.08, 7, 1, true), 0, (crown + 0.08) / 2, 0), trunk, aoY(0, crown))];
  for (let i = 0; i < blobs; i++) {
    const a = i / blobs * Math.PI * 2 + 0.4, r = i === 0 ? 0 : spread * 0.55;
    const s = spread * (i === 0 ? 0.85 : 0.6);
    const g = new THREE.IcosahedronGeometry(1, 1); g.scale(s, s * 0.7 * flat, s);
    const y = crown + (1 - crown) * (i === 0 ? 0.55 : 0.3);
    parts.push(colored(lumpy(at(g, Math.cos(a) * r, y, Math.sin(a) * r), 0.35, i * 7), leaf, aoY(crown - 0.05, 1)));
  }
  return mergeGeometries(parts);
}
function emergent() {   // giant tropical emergent: tall bare trunk, buttress, wide flat crown
  const parts = [
    colored(at(new THREE.CylinderGeometry(0.018, 0.03, 0.8, 7, 1, true), 0, 0.4, 0), 0x6b5a48, aoY(0, 0.7)),
    colored(at(new THREE.ConeGeometry(0.075, 0.12, 7, 1, true), 0, 0.06, 0), 0x5e4e3c, aoY(0, 0.12))
  ];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, r = i === 0 ? 0 : 0.17;
    const g = new THREE.IcosahedronGeometry(1, 1); g.scale(0.17, 0.07, 0.17);
    parts.push(colored(lumpy(at(g, Math.cos(a) * r, 0.86 + (i % 2) * 0.04, Math.sin(a) * r), 0.3, i), 0x2f5a1e, aoY(0.78, 0.95)));
  }
  return mergeGeometries(parts);
}
function cypress() {    // swamp tree: flared base, narrow trunk, flat irregular tiers with hanging moss
  const parts = [
    colored(at(new THREE.CylinderGeometry(0.02, 0.07, 0.25, 8, 1, true), 0, 0.125, 0), 0x4c4434, aoY(0, 0.25)),
    colored(at(new THREE.CylinderGeometry(0.015, 0.022, 0.7, 7, 1, true), 0, 0.6, 0), 0x524634, aoY(0.2, 0.9))
  ];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1); const s = 0.22 - i * 0.03; g.scale(s, s * 0.32, s);
    const a = i * 2.1;
    parts.push(colored(lumpy(at(g, Math.cos(a) * 0.06, 0.62 + i * 0.1, Math.sin(a) * 0.06), 0.4, i * 3), 0x3a4a26, aoY(0.55, 1)));
    const m = new THREE.ConeGeometry(s * 0.7, 0.16, 7, 1, true); m.rotateX(Math.PI);
    parts.push(colored(lumpy(at(m, Math.cos(a) * 0.06, 0.62 + i * 0.1 - 0.08, Math.sin(a) * 0.06), 0.5, i), 0x6a7050, aoY(0.4, 1)));
  }
  return mergeGeometries(parts);
}
function shrub(color) { const g = new THREE.IcosahedronGeometry(0.5, 1); g.scale(1, 0.75, 1); return colored(lumpy(at(g, 0, 0.32, 0), 0.45, 3), color, aoY(0, 0.8)); }
function rock() { const g = new THREE.IcosahedronGeometry(0.5, 1); g.scale(1, 0.6, 0.8); return colored(lumpy(at(g, 0, 0.15, 0), 0.6, 11), 0x77736c, aoY(-0.1, 0.6)); }
function tuft(color, blades = 7, lean = 0.35) {     // crossed blades: grass, sedge, fern fronds
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = i / blades * Math.PI * 2 + (i % 3) * 0.3;
    const g = new THREE.PlaneGeometry(0.12, 1, 1, 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.5; p.setXYZ(k, p.getX(k) * (1 - y * 0.85), y, y * y * lean); }
    g.rotateY(a); parts.push(colored(g, color, (x, y) => 0.45 + 0.55 * y));
  }
  return mergeGeometries(parts);
}
function fern() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(0.35, 1, 1, 3); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.5; p.setXYZ(k, p.getX(k) * Math.sin(y * Math.PI) * 1.2, Math.sin(y * 1.3) * 0.75, y * 0.85); }
    g.rotateY(i / 6 * Math.PI * 2); parts.push(colored(g, 0x2f5a24, (x, y) => 0.5 + 0.7 * y));
  }
  return mergeGeometries(parts);
}

// species: geometry, tint variation, and its size range (meters, height)
const SPECIES = {
  sequoia: { geo: () => conifer({ trunk: 0x6a3f2a, leaf: 0x2c4a2c, tiers: 5, width: 0.15, bare: 0.38, trunkW: 0.045 }), h: [60, 100], layer: 'trees' },
  fir: { geo: () => conifer({ leaf: 0x203a28, tiers: 7, width: 0.17, bare: 0.18 }), h: [35, 70], layer: 'trees' },
  spruce: { geo: () => conifer({ leaf: 0x1a3024, tiers: 8, width: 0.12, bare: 0.1, trunkW: 0.025 }), h: [30, 60], layer: 'trees' },
  oak: { geo: () => broadleaf({}), h: [40, 75], layer: 'trees' },
  jungle: { geo: () => broadleaf({ leaf: 0x2f5a1c, crown: 0.55, spread: 0.3, blobs: 6, flat: 0.8 }), h: [55, 95], layer: 'trees' },
  emergent: { geo: emergent, h: [95, 150], layer: 'trees' },
  cypress: { geo: cypress, h: [28, 55], layer: 'trees' },
  krumm: { geo: () => conifer({ leaf: 0x2a3c2a, tiers: 4, width: 0.3, bare: 0.05 }), h: [2, 7], layer: 'under' },
  sapling: { geo: () => broadleaf({ leaf: 0x46662c, crown: 0.45, spread: 0.32, blobs: 4 }), h: [6, 18], layer: 'under' },
  youngfir: { geo: () => conifer({ leaf: 0x284430, tiers: 5, width: 0.22, bare: 0.08 }), h: [5, 16], layer: 'under' },
  bush: { geo: () => shrub(0x3e5a2a), h: [1.2, 4], layer: 'under' },
  drybush: { geo: () => shrub(0x6f6a44), h: [0.6, 1.8], layer: 'under' },
  boulder: { geo: rock, h: [1.5, 6], layer: 'under' },
  fern: { geo: fern, h: [0.6, 1.6], layer: 'ground' },
  grass: { geo: () => tuft(0x6a8a3c, 9, 0.3), h: [0.35, 0.9], layer: 'ground' },
  sedge: { geo: () => tuft(0x5a6e38, 12, 0.15), h: [0.6, 1.6], layer: 'ground' },
  drygrass: { geo: () => tuft(0xa49a62, 7, 0.25), h: [0.3, 0.7], layer: 'ground' },
  stone: { geo: rock, h: [0.2, 0.8], layer: 'ground' }
};

// what grows in each zone: [species, weight] per layer, and candidates per cell
const ZONES = {
  tropical: { trees: [['jungle', 6], ['emergent', 1.4], ['oak', 1]], under: [['sapling', 5], ['bush', 4], ['boulder', 0.3]], ground: [['fern', 6], ['sedge', 1]] },
  mixed: { trees: [['sequoia', 4], ['fir', 3], ['oak', 4]], under: [['youngfir', 3], ['sapling', 3], ['bush', 3], ['boulder', 0.5]], ground: [['fern', 4], ['grass', 2], ['stone', 0.4]] },
  taiga: { trees: [['spruce', 7], ['fir', 3]], under: [['youngfir', 5], ['bush', 2], ['boulder', 0.7]], ground: [['fern', 2], ['grass', 2], ['stone', 0.6]] },
  wetland: { trees: [['cypress', 7], ['oak', 1]], under: [['bush', 3], ['sapling', 2]], ground: [['sedge', 7], ['grass', 2]] },
  bayou: { trees: [['cypress', 6], ['oak', 2]], under: [['bush', 3]], ground: [['sedge', 6], ['fern', 2]] },
  alpine: { trees: [], under: [['krumm', 3], ['bush', 1.5], ['boulder', 3]], ground: [['grass', 4], ['stone', 3]] },
  tundra: { trees: [], under: [['bush', 2], ['boulder', 2]], ground: [['grass', 4], ['stone', 2]] },
  desert: { trees: [], under: [['drybush', 2], ['boulder', 2.5]], ground: [['drygrass', 2], ['stone', 3]] },
  snow: { trees: [], under: [['boulder', 0.6]], ground: [] }
};

const LAYERS = {
  trees: { cell: 48, per: 3, radius: 2600, chunk: 8, density: { tropical: 1, mixed: 0.9, taiga: 0.95, wetland: 0.45, bayou: 0.55 } },
  under: { cell: 24, per: 2, radius: 700, chunk: 8, density: { snow: 0.1, alpine: 0.55, tundra: 0.45, desert: 0.35 } },
  ground: { cell: 4, per: 1, radius: 95, chunk: 8 }
};

const VERT = /* glsl */`
precision highp float;
attribute vec3 color;
varying vec3 vColor, vN, vView; varying float vH;
uniform float uTime, uRadiusM;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 p = position;
  // wind: crowns sway, more at the top; each plant has its own phase from its position
  float ph = 0.0;
  #ifdef USE_INSTANCING_COLOR
    ph = (instanceColor.r * 41.0 + instanceColor.b * 17.0) * 6.2831;
  #endif
  float sway = p.y * p.y * 0.012;
  p.x += sin(uTime * 0.9 + ph) * sway; p.z += cos(uTime * 0.7 + ph * 1.3) * sway * 0.7;
  vec4 w = instanceMatrix * vec4(p, 1.0);
  vec4 mv = modelViewMatrix * w;
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = (vec4(mv.xyz, 0.0) * viewMatrix).xyz;
  vH = position.y;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunDir, uSunColor, uUp; uniform float uDay, uExposure, uRadiusM;
varying vec3 vColor, vN, vView; varying float vH;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_FOG}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = -normalize(vView);
  if (dot(N, V) < 0.0) N = -N;                       // two-sided leaves and blades
  float diff = max(dot(N, uSunDir), 0.0);
  float trans = pow(max(dot(-V, uSunDir), 0.0), 4.0) * 0.35;  // light through leaves against the sun
  float sky = 0.55 + 0.45 * dot(N, uUp);
  vec3 skyLight = mix(vec3(0.02, 0.03, 0.06), vec3(0.20, 0.27, 0.36), uDay) * sky;
  vec3 col = vColor * (diff * uSunColor * 1.1 * uDay + skyLight + uSunColor * trans * uDay * vec3(0.8, 1.0, 0.5));
  float alt = uCamAltM + dot(vView, uUp) * uRadiusM;
  col = applyFog(col, vView, alt, uRadiusM);
  col *= uExposure; col = col / (1.0 + col);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

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
      uFogSun: fogU.uFogSun, uFogAway: fogU.uFogAway, uFogDensity: fogU.uFogDensity, uFogHeight: fogU.uFogHeight, uCamAltM: fogU.uCamAltM, uSunDirF: fogU.uSunDirF
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide });
    this.meshes = {};                 // `${layer}:${species}` -> InstancedMesh, made when first needed
    this.geos = {};
    this.caps = { trees: 16000, under: 9000, ground: 7000 };
    this.lastBuild = {};
    this.stats = { instances: 0, chunks: 0 };
  }

  clear() { this.chunks.clear(); this.queue = []; this.dirty = true; this.lastBuild = {}; for (const m of Object.values(this.meshes)) m.count = 0; }

  _mesh(layer, name) {
    const key = `${layer}:${name}`;
    let m = this.meshes[key];
    if (!m) {
      const geo = this.geos[name] || (this.geos[name] = SPECIES[name].geo());
      const cap = this.caps[layer];
      m = new THREE.InstancedMesh(geo, this.material, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.userData = { cap, layer };
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
          const h = this.terrain.groundAt(lat, lon);
          const zone = zoneAt(samp.biome, lat, h, coast);
          const Z = ZONES[zone]; if (!Z) continue;
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
          if (sl > 0.75 && layer !== 'ground') pick = 'boulder';
          else if (sl > 0.9) pick = 'stone';
          if (layer === 'ground' && clear > 0.66 && pick === 'fern') pick = 'grass';
          const sp = SPECIES[pick]; if (!sp) continue;
          const r6 = cellRand(i, j, s + 6), r7 = cellRand(i, j, s + 7);
          const size = sp.h[0] + (sp.h[1] - sp.h[0]) * Math.pow(r6, 1.4);
          const rows = out[pick] || (out[pick] = []);
          // light under the canopy: dense forest shades its own understory and floor
          const forest = zone === 'tropical' || zone === 'mixed' || zone === 'taiga' || zone === 'wetland' || zone === 'bayou';
          const light = !forest || clear > 0.66 ? 1 : layer === 'trees' ? 0.9 : layer === 'under' ? 0.62 : 0.5;
          rows.push(lat, lon, h, size, r7 * Math.PI * 2, cellRand(i, j, s + 8), light);
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

  update(dt, camera, latLon, agl, frameBudgetMs = 5) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uUp.value.copy(camera.position).normalize();
    const show = this.enabled && agl < 3500;
    this.group.visible = show;
    if (!show) return;
    const q = this.quality;
    const want = [];
    for (const layer of Object.keys(LAYERS)) want.push(...this._chunkKeys(layer, latLon.lat, latLon.lon, LAYERS[layer].radius * (layer === 'trees' ? q : Math.min(q, 1.2))));
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let added = 0; this._addedTo = new Set();
    for (const w of want) {
      if (this.chunks.has(w.key)) continue;
      if (performance.now() - t0 > frameBudgetMs && added > 0) break;
      this.chunks.set(w.key, { layer: w.layer, data: this._generate(w.layer, w.I, w.J) }); added++;
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
    const x = new THREE.Vector3(), z = new THREE.Vector3(), col = new THREE.Color();
    const camR = camera.position;
    const lim = LAYERS[layer].radius * (layer === 'trees' ? this.quality : Math.min(this.quality, 1.2));
    const lim2 = (lim / R) ** 2;
    for (const ch of this.chunks.values()) {
      if (ch.layer !== layer) continue;
      for (const [name, rows] of Object.entries(ch.data)) {
        const mesh = this._mesh(layer, name);
        if (mesh.parent !== grp) grp.add(mesh);
        const cap = mesh.userData.cap; let c = counts[name] || 0;
        for (let r = 0; r < rows.length && c < cap; r += 7) {
          const lat = rows[r], lon = rows[r + 1], h = rows[r + 2], size = rows[r + 3], yaw = rows[r + 4], tint = rows[r + 5], light = rows[r + 6];
          const p = lat * D2R, l = lon * D2R, cp = Math.cos(p);
          up.set(cp * Math.cos(l), Math.sin(p), -cp * Math.sin(l));
          const sink = name === 'boulder' || name === 'stone' ? 0.3 * size : layer === 'trees' ? 1.5 + size * 0.02 : 0.12;
          const rr = 1 + (h - sink) / R;
          const px = up.x * rr - camR.x, py = up.y * rr - camR.y, pz = up.z * rr - camR.z;
          if (px * px + py * py + pz * pz > lim2) continue;
          east.set(-Math.sin(l), 0, -Math.cos(l)); north.crossVectors(up, east);
          x.copy(east).multiplyScalar(Math.cos(yaw)).addScaledVector(north, Math.sin(yaw));
          z.crossVectors(x, up);
          const s = size / R, w = s * (0.85 + tint * 0.3);
          m4.set(x.x * w, up.x * s, z.x * w, px, x.y * w, up.y * s, z.y * w, py, x.z * w, up.z * s, z.z * w, pz, 0, 0, 0, 1);
          mesh.setMatrixAt(c, m4);
          const k = (0.82 + tint * 0.32) * light;
          col.setRGB(k * (0.95 + tint * 0.1), k, k * (1.05 - tint * 0.1));
          mesh.setColorAt(c, col);
          c++;
        }
        counts[name] = c;
      }
    }
    for (const [key, mesh] of Object.entries(this.meshes)) {
      if (mesh.userData.layer !== layer) continue;
      const n = counts[key.split(':')[1]] || 0;
      mesh.count = n;
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
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
