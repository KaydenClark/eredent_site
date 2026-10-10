import * as THREE from 'three';
import { Scatter, SCATTER_PREAMBLE, GLSL_SHADE_FRAG } from './scatter.js';

// Pandora-scale forest for every biome (docs/SPEC.md, "Biomes and vegetation"). Three layers, all placed on the GPU:
//   canopy    the big trees, ~55 m apart out to ~11 km: tropical emergents and canopy giants, primeval conifers and
//             broadleafs, taiga spruce, swamp forest, tundra scrub
//   under     the smaller trees between them, ~24 m apart out to ~3 km: tree ferns, young trees, mangrove
//   palms     tropical shores, mainly on the inner seas, and the hot lowlands behind them
// Species, sizes and colors follow latitude band, height (treeline), the biome map, the coast layer and the
// clearing field the terrain also draws. Canopy heights are the spec's proposed numbers.

// A tree: 5-sided trunk and a crown of three rings and an apex. The vertex shader turns the crown into a flat
// dome, an ellipsoid or a tiered cone by species, so one geometry serves every kind.
function treeGeometry() {
  const pos = [], part = [], idx = [];
  const T = 5, S = 7;
  for (let r = 0; r < 2; r++) for (let i = 0; i < T; i++) { const a = i / T * Math.PI * 2; pos.push(Math.cos(a), r, Math.sin(a)); part.push(0); }
  for (let i = 0; i < T; i++) { const j = (i + 1) % T; idx.push(i, T + i, T + j, i, T + j, j); }
  const c0 = pos.length / 3, rings = [0, 0.38, 0.72];
  for (let r = 0; r < rings.length; r++) for (let i = 0; i < S; i++) { const a = i / S * Math.PI * 2; pos.push(Math.cos(a), rings[r], Math.sin(a)); part.push(1); }
  const apex = pos.length / 3; pos.push(0, 1, 0); part.push(1);
  const bot = pos.length / 3; pos.push(0, 0, 0); part.push(1);
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < S; i++) {
    const j = (i + 1) % S, a = c0 + r * S + i, b = c0 + r * S + j, c = c0 + (r + 1) * S + i, d = c0 + (r + 1) * S + j;
    idx.push(a, c, d, a, d, b);
  }
  for (let i = 0; i < S; i++) { const j = (i + 1) % S; idx.push(c0 + 2 * S + i, apex, c0 + 2 * S + j); idx.push(c0 + i, c0 + j, bot); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

// A palm: 5-sided trunk and 9 fronds, each a strip of 4 segments. Frond vertices carry (t along, frond index, side).
function palmGeometry() {
  const pos = [], part = [], idx = [];
  const T = 5, F = 9, SEG = 4;
  for (let r = 0; r < 2; r++) for (let i = 0; i < T; i++) { const a = i / T * Math.PI * 2; pos.push(Math.cos(a), r, Math.sin(a)); part.push(0); }
  for (let i = 0; i < T; i++) { const j = (i + 1) % T; idx.push(i, T + i, T + j, i, T + j, j); }
  for (let f = 0; f < F; f++) {
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) { pos.push(s / SEG, f, -1); pos.push(s / SEG, f, 1); part.push(2, 2); }
    for (let s = 0; s < SEG; s++) { const a = base + s * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

const TREE_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aPart; attribute float aId;   // position comes from three.js
uniform float uRole;         // 0 canopy, 1 understory, 2 palms, 3 far canopy (crowns only, beyond the canopy grid)
varying vec3 vColor, vNormal, vWorld; varying float vAo;

struct Tree { float scale, trunkH, trunkR, crownR, crownH, shape, sway; vec3 color; };

// crown radius profile by normalized height and shape: 0 flat dome, 1 ellipsoid, 2 tiered cone
float profile(float y, float shape) {
  float dome = pow(max(1.0 - y * y, 0.0), 0.35);
  float ell = pow(sin(clamp(y, 0.0, 1.0) * 3.14159), 0.7);
  float cone = (1.0 - y) * (0.8 + 0.4 * abs(fract(y * 3.0 + 0.5) - 0.5));
  return shape < 1.0 ? mix(dome, ell, shape) : mix(ell, cone, clamp(shape - 1.0, 0.0, 1.0));
}

Tree none() { Tree t; t.scale = 0.0; t.trunkH = 0.0; t.trunkR = 0.0; t.crownR = 0.0; t.crownH = 0.0; t.shape = 0.0; t.sway = 0.0; t.color = vec3(0.0); return t; }

vec3 hueVar(vec3 c, float r, float amt) { return c * mix(vec3(1.0 + amt, 1.0, 1.0 - amt), vec3(1.0 - amt, 1.0, 1.0 + amt), r); }

Tree pick(Site s) {
  Tree t = none(); t.scale = 1.0; t.sway = 1.0;
  vec4 r = s.rnd; float lat = s.ll.x, h = s.h;
  if (s.water || s.land < 0.55 || abs(s.biome - 2.0) < 0.5 || h > s.treeline) return none();
  float alpine = smoothstep(s.treeline - 600.0, s.treeline, h);
  bool wet = abs(s.biome - 3.0) < 0.5 || abs(s.biome - 6.0) < 0.5;
  float tropical = 1.0 - smoothstep(16.0, 20.0, lat);
  float cold = smoothstep(46.0, 50.0, lat) + smoothstep(s.treeline - 1500.0, s.treeline - 500.0, h) * 0.8;
  float tundra = smoothstep(61.0, 65.0, lat);
  // clearings: strongest in the mid latitudes (proposed), where the big grazers keep the ground open
  float clearStrength = mix(0.5, 1.0, smoothstep(12.0, 26.0, lat)) * (1.0 - smoothstep(55.0, 65.0, lat));
  if (r.w < s.clearing * clearStrength) return none();
  float shore = 1.0 - smoothstep(0.55, 0.85, s.land);      // 1 right at the waterline
  float u = r.x, v = r.y, w = r.z;
  float montane = smoothstep(500.0, 2600.0, h);

  if (uRole < 0.5 || uRole > 2.5) {                             // ---- canopy (and the far canopy)
    if (tundra > v) {
      if (w < 0.55) return none();
      t.trunkH = 1.5; t.trunkR = 0.3; t.crownR = 2.5 + 2.0 * u; t.crownH = 2.0; t.shape = 0.3; t.color = vec3(0.36, 0.40, 0.28);
    } else if (cold > v) {                                      // taiga spruce, 40 to 70 m, dark and dense
      t.trunkH = 6.0; t.trunkR = 1.5; t.crownH = 34.0 + 32.0 * u; t.crownR = 7.0 + 5.0 * w; t.shape = 1.7 + 0.3 * u;
      t.color = hueVar(vec3(0.10, 0.20, 0.13), w, 0.18);
    } else if (wet) {                                           // swamp forest, 30 to 60 m, flared trunks, flat mossy crowns
      t.trunkH = 16.0 + 10.0 * u; t.trunkR = 3.0; t.crownR = 12.0 + 7.0 * w; t.crownH = 14.0 + 10.0 * u; t.shape = 0.2;
      t.color = hueVar(vec3(0.24, 0.34, 0.17), w, 0.2);
    } else if (tropical > v) {                                  // giant tropical rainforest
      if (shore > 0.3 && s.inner > 0.5 && w < 0.75) return none();        // beach: palms take the shore on the inner seas
      if (u < 0.08) {                                           // emergents, 150 m and over, pale broad crowns above the canopy
        t.trunkH = 82.0 + 24.0 * w; t.trunkR = 3.4; t.crownR = 28.0 + 14.0 * v; t.crownH = 22.0 + 10.0 * u; t.shape = 0.1;
        t.color = hueVar(vec3(0.46, 0.56, 0.17), w, 0.2);
      } else {                                                  // canopy, 80 to 120 m
        t.trunkH = 40.0 + 18.0 * w; t.trunkR = 2.0; t.crownR = 18.0 + 12.0 * v; t.crownH = 26.0 + 16.0 * u; t.shape = 0.2 + 0.9 * w;
        t.color = hueVar(mix(vec3(0.08, 0.30, 0.07), vec3(0.26, 0.47, 0.10), u), w, 0.32);
      }
    } else {                                                    // primeval mixed forest, 60 to 100 m
      if (u < 0.5) {                                            // giant conifers
        t.trunkH = 12.0 + 8.0 * w; t.trunkR = 2.4; t.crownH = 55.0 + 30.0 * u * 2.0; t.crownR = 9.0 + 5.0 * v; t.shape = 2.0;
        t.color = hueVar(vec3(0.10, 0.24, 0.12), w, 0.15);
      } else {                                                  // broadleaf giants, turning in autumn and bare in winter
        t.trunkH = 22.0 + 12.0 * w; t.trunkR = 2.2; t.crownR = 16.0 + 9.0 * v; t.crownH = 32.0 + 14.0 * u; t.shape = 1.0;
        vec3 c = hueVar(vec3(0.20, 0.40, 0.12), w, 0.25);
        float midlat = smoothstep(22.0, 36.0, lat);
        float autumn = smoothstep(0.48, 0.58, uSeason) * (1.0 - smoothstep(0.66, 0.78, uSeason)) * midlat;
        float winter = smoothstep(0.66, 0.78, uSeason) * (1.0 - smoothstep(0.92, 1.0, uSeason)) * midlat;
        c = mix(c, hueVar(vec3(0.75, 0.36, 0.08), w, 0.3), autumn);
        c = mix(c, vec3(0.28, 0.22, 0.17), winter); t.crownR *= 1.0 - 0.45 * winter; t.crownH *= 1.0 - 0.3 * winter;
        t.color = c;
      }
    }
  } else if (uRole < 1.5) {                                     // ---- understory, sparser
    if (v < 0.35 || tundra > 0.5) return none();
    if (cold > v) { t.trunkH = 2.0; t.trunkR = 0.5; t.crownH = 12.0 + 14.0 * u; t.crownR = 2.5 + 1.5 * w; t.shape = 2.0; t.color = hueVar(vec3(0.11, 0.22, 0.14), w, 0.15); }
    else if (wet) { t.trunkH = 3.0; t.trunkR = 0.8; t.crownR = 5.0 + 5.0 * u; t.crownH = 6.0 + 4.0 * w; t.shape = 0.6; t.color = hueVar(vec3(0.26, 0.38, 0.16), w, 0.2); }
    else if (tropical > v) {
      if (u < 0.5) { t.trunkH = 8.0 + 8.0 * w; t.trunkR = 0.6; t.crownR = 6.0 + 4.0 * u * 2.0; t.crownH = 3.5; t.shape = 0.0; t.color = hueVar(vec3(0.30, 0.55, 0.16), w, 0.2); }   // tree ferns, flat umbrellas
      else { t.trunkH = 14.0 + 10.0 * w; t.trunkR = 0.9; t.crownR = 7.0 + 5.0 * u; t.crownH = 14.0 + 8.0 * w; t.shape = 0.8; t.color = hueVar(vec3(0.14, 0.36, 0.12), w, 0.25); }
    } else {
      if (u < 0.5) { t.trunkH = 4.0; t.trunkR = 0.8; t.crownH = 16.0 + 14.0 * w; t.crownR = 4.0 + 2.0 * v; t.shape = 2.0; t.color = hueVar(vec3(0.12, 0.26, 0.13), w, 0.15); }
      else { t.trunkH = 8.0 + 5.0 * w; t.trunkR = 0.8; t.crownR = 6.0 + 4.0 * v; t.crownH = 12.0 + 6.0 * u; t.shape = 1.0; t.color = hueVar(vec3(0.22, 0.42, 0.13), w, 0.25); }
    }
  } else {                                                      // ---- palms: tropical shores and hot lowlands
    if (tropical < 0.5 || wet || cold > 0.5) return none();
    float p = shore * (s.inner > 0.5 ? 0.95 : 0.35) + (1.0 - shore) * (1.0 - smoothstep(20.0, 90.0, h)) * 0.12;
    if (v > p) return none();
    t.trunkH = 22.0 + 20.0 * u; t.trunkR = 0.9; t.crownR = 10.0 + 4.0 * w;   // crownR = frond length
    t.crownH = 0.0; t.shape = 0.0; t.sway = 1.6; t.color = hueVar(vec3(0.28, 0.50, 0.14), w, 0.25);
  }
  if (uRole > 2.5) { t.crownR *= 1.5; t.crownH *= 1.15; }       // far canopy: clumps of crowns standing in for the forest beyond the grid
  // toward the treeline the forest shrinks and turns darker and bluer (montane)
  float shrink = mix(1.0, 0.35, alpine);
  t.trunkH *= shrink; t.crownR *= shrink; t.crownH *= shrink; t.trunkR *= mix(1.0, 0.6, alpine);
  t.color = mix(t.color, t.color * vec3(0.55, 0.7, 0.9), montane * 0.6);
  t.color = mix(t.color, vec3(0.22, 0.26, 0.20), alpine * 0.5);
  return t;
}

void main() {
  vec2 cell = cellOf(aId, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  Tree t = none();
  if (s.inW > 0.5 && !s.water && s.land >= 0.55 && abs(s.biome - 2.0) > 0.5) { siteGround(s); t = pick(s); }
  float dist = metersFromCamera(s.base);
  float fade = edgeFade(dist) * (uRole < 0.5 ? altFade(14000.0, 26000.0) : uRole < 1.5 ? altFade(2500.0, 5000.0) : uRole < 2.5 ? altFade(3500.0, 7000.0) : altFade(45000.0, 80000.0));
  if (uRole > 2.5) fade *= smoothstep(3400.0, 5200.0, dist);    // the far canopy starts where the canopy grid ends
  if (uRole > 2.5 && aPart < 0.5) fade = 0.0;                     // and has no trunks
  t.scale *= fade;
  if (t.scale <= 0.001) { gl_Position = vec4(0.0, 0.0, -3.0, 1.0); return; }

  vec3 lp, ln; float ao;
  float turn = rnd.z * TAU;
  if (aPart < 0.5) {                                             // trunk: flared at the base, tapered at the top
    float rr = t.trunkR * mix(1.7, 0.8, position.y);
    lp = vec3(position.x * rr, position.y * t.trunkH * 1.06 - t.trunkH * 0.06, position.z * rr);
    ln = vec3(position.x, 0.0, position.z); ao = mix(0.35, 0.7, position.y);
  } else if (aPart < 1.5) {                                      // crown: surface of revolution with the species profile
    float y = position.y;
    float pr = profile(y, t.shape);
    pr *= 1.0 + 0.24 * (hash3(vec3(position.x * 3.1 + 1.0, position.z * 2.7, rnd.x * 37.0)) - 0.5);   // lumpy, no two alike
    lp = vec3(position.x * pr * t.crownR, t.trunkH + y * t.crownH, position.z * pr * t.crownR);
    float dp = (profile(min(y + 0.04, 1.0), t.shape) - profile(max(y - 0.04, 0.0), t.shape)) / 0.08;
    bool centre = abs(position.x) + abs(position.z) < 0.001;
    ln = centre ? vec3(0.0, y > 0.5 ? 1.0 : -1.0, 0.0) : normalize(vec3(position.x, -dp * t.crownR / max(t.crownH, 1.0), position.z));
    ao = mix(0.32, 1.0, y);
    // wind: the crown leans and breathes a little
    float sw = sin(uTime * 0.7 + rnd.x * 6.0) * 0.02 * t.sway * y * y;
    lp.x += sw * t.crownH; lp.z += sw * 0.5 * t.crownH;
  } else {                                                       // palm frond: t along, index, side
    float ft = position.x, k = position.y, side = position.z;
    float fa = k / 9.0 * TAU + rnd.w * 0.7;
    float L = t.crownR;
    vec3 along = vec3(cos(fa), 0.0, sin(fa)), sideV = vec3(-sin(fa), 0.0, cos(fa));
    float sway = sin(uTime * 1.1 + rnd.x * 6.0 + k) * 0.05 * t.sway;
    float lift = 0.42 + 0.2 * hash3(vec3(cell, k)) - 1.15 * ft + sway;
    lp = vec3(0.0, t.trunkH, 0.0) + along * (ft * L * 0.92) + vec3(0.0, L * ft * lift, 0.0);
    lp += sideV * side * (0.16 * L * sin(ft * 3.14159) + 0.02 * L);
    lp.y -= abs(side) * 0.06 * L * sin(ft * 3.14159);          // fronds fold down at the sides
    ln = normalize(vec3(0.0, 1.0, 0.0) + along * (0.5 - 1.2 * ft) + sideV * side * 0.4);
    ao = mix(0.6, 1.0, ft);
    // lean the whole trunk a little, in a fixed direction per tree
    float lean = 0.06 * t.trunkH * hash3(vec3(cell, 5.5));
    lp.x += lean * (lp.y / max(t.trunkH, 1.0)) * (lp.y / max(t.trunkH, 1.0));
  }
  if (aPart < 0.5 && uRole > 1.5) { float lean = 0.06 * t.trunkH * hash3(vec3(cell, 5.5)); lp.x += lean * position.y * position.y; }
  lp *= t.scale;
  mat3 f = frameAt(s.n, turn);
  vec3 world = toWorld(s.base, f, lp);
  vWorld = world; vNormal = normalize(f * ln); vAo = ao;
  vColor = aPart < 0.5 ? mix(vec3(0.30, 0.22, 0.15), vec3(0.38, 0.33, 0.26), rnd.y) : t.color;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const TREE_FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_SHADE_FRAG}
varying vec3 vColor, vNormal, vWorld; varying float vAo;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormal); if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;   // fronds are seen from either side
  gl_FragColor = vec4(shade(vColor, N, vWorld, 0.35, vAo), 1.0);
  #include <colorspace_fragment>
}
`;

export class Vegetation {
  constructor(uniforms, quality = 1) {
    this.group = new THREE.Group();
    const q = Math.sqrt(Math.max(0.3, Math.min(2, quality)));
    const tree = treeGeometry(), palm = palmGeometry();
    const make = (geom, role, cellM, gridW, side) => {
      const sc = new Scatter(geom, { vert: TREE_VERT, frag: TREE_FRAG, uniforms: { ...uniforms, uRole: { value: role } }, cellM, gridW, side });
      this.group.add(sc.mesh); return sc;
    };
    this.layers = [
      make(tree, 0, 48, Math.round(220 * q), THREE.FrontSide),    // canopy: 10.5 km across
      make(tree, 3, 170, Math.round(190 * q), THREE.FrontSide),   // far canopy: 32 km across, crowns only
      make(tree, 1, 24, Math.round(120 * q), THREE.FrontSide),    // understory: 2.9 km across
      make(palm, 2, 46, Math.round(72 * q), THREE.DoubleSide)     // palms: 3.3 km across
    ];
  }
  setRadius(km) { for (const l of this.layers) l.setRadius(km); }
  update(lat, lon, alt) { for (const l of this.layers) l.update(lat, lon, alt); }
  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
