import * as THREE from 'three';
import { Scatter, SCATTER_PREAMBLE, GLSL_SHADE_FRAG } from './scatter.js';

// Life, Pandora-scale and never made by people (docs/SPEC.md, "Feel and life"):
//   dragons    flights over the coasts and the open ocean, busiest at dawn and dusk, small at distance
//   birds      flocks over the forest and the shores; bright in the tropics, white over the sea
//   grazers    big herd animals in the natural clearings of the mid-latitude forest
//   sea giants harmless giants surfacing in the protected inner seas; rarer, bigger, darker things in the outer ocean
//   fireflies  night lights under the tropical and swamp canopy
// All of it is placed and animated on the GPU on the same grid scheme as the trees (src/scatter.js).

function geom(pos, part, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx); return g;
}
// box between two 4-vertex rings; returns the index list
function tube(idx, a, b) { for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(a + i, b + i, b + j, a + i, b + j, a + j); } }

// Wingspan 2 (tips at z = ±1), body along +X. Part 0 body, 1 wing.
function dragonGeometry() {
  const pos = [], part = [], idx = [];
  const v = (x, y, z, p) => { pos.push(x, y, z); part.push(p); return pos.length / 3 - 1; };
  const nose = v(0.75, 0, 0, 0), top = v(0.1, 0.12, 0, 0), bot = v(0.1, -0.16, 0, 0), L = v(0.1, 0, 0.1, 0), R = v(0.1, 0, -0.1, 0), rear = v(-0.5, 0.02, 0, 0);
  for (const [a, b] of [[top, L], [L, bot], [bot, R], [R, top]]) idx.push(nose, a, b, rear, b, a);
  const tail = v(-1.3, 0.06, 0, 0), tl = v(-0.55, 0.0, 0.06, 0), tr = v(-0.55, 0.0, -0.06, 0);
  idx.push(rear, tl, tail, rear, tail, tr, tl, tr, tail);
  const head = v(1.05, 0.2, 0, 0), hl = v(0.8, 0.1, 0.05, 0), hr = v(0.8, 0.1, -0.05, 0), hb = v(0.8, 0.02, 0, 0);
  idx.push(nose, hl, head, nose, head, hr, hl, hb, head, hr, head, hb);
  for (const sgn of [1, -1]) {
    const rl = v(0.35, 0.03, 0.1 * sgn, 1), rt = v(-0.25, 0.03, 0.1 * sgn, 1), ml = v(0.3, 0, 0.5 * sgn, 1), mt = v(-0.45, 0, 0.5 * sgn, 1), tlp = v(0.15, 0, 1.0 * sgn, 1), ttp = v(-0.35, 0, 0.95 * sgn, 1);
    idx.push(rl, ml, mt, rl, mt, rt, ml, tlp, ttp, ml, ttp, mt);
  }
  return geom(pos, part, idx);
}

// A V of two triangles, wingspan 2. Part 1 everywhere (all wing).
function birdGeometry() {
  const pos = [0.45, 0, 0, -0.3, 0, 0, -0.1, 0, 1, -0.1, 0, -1, -0.65, 0.02, 0], part = [0, 0, 1, 1, 0];
  return geom(pos, part, [0, 2, 1, 0, 1, 3, 1, 2, 4, 1, 4, 3]);
}

// Length 1 (rump at x = -0.5, nose at 1.1), shoulder at y = 0.78. Parts: 0 body, 1 neck and head, 2 tail, 3..6 legs.
function grazerGeometry() {
  const pos = [], part = [], idx = [];
  const ring = (x, yTop, yBot, w, p) => { const a = pos.length / 3; pos.push(x, yTop, w, x, yTop, -w, x, yBot, -w, x, yBot, w); part.push(p, p, p, p); return a; };
  const f = ring(0.42, 0.80, 0.42, 0.21, 0), m = ring(0.0, 0.88, 0.38, 0.24, 0), r = ring(-0.5, 0.74, 0.44, 0.18, 0);
  tube(idx, f, m); tube(idx, m, r); idx.push(f, f + 1, f + 2, f, f + 2, f + 3, r, r + 2, r + 1, r, r + 3, r + 2);
  const n0 = ring(0.38, 0.86, 0.58, 0.1, 1), n1 = ring(0.78, 1.08, 0.88, 0.08, 1), n2 = ring(1.1, 1.0, 0.8, 0.075, 1);
  tube(idx, n0, n1); tube(idx, n1, n2); idx.push(n2, n2 + 1, n2 + 2, n2, n2 + 2, n2 + 3);
  const t0 = pos.length / 3; pos.push(-0.5, 0.72, 0, -0.78, 0.5, 0, -0.5, 0.62, 0); part.push(2, 2, 2); idx.push(t0, t0 + 1, t0 + 2);
  const hips = [[0.3, 0.15], [0.3, -0.15], [-0.38, 0.14], [-0.38, -0.14]];
  hips.forEach(([x, z], i) => {
    const a = pos.length / 3, w = 0.07;
    for (const y of [0.55, 0.0]) { pos.push(x + w, y, z + w, x + w, y, z - w, x - w, y, z - w, x - w, y, z + w); part.push(3 + i, 3 + i, 3 + i, 3 + i); }
    tube(idx, a, a + 4);
  });
  return geom(pos, part, idx);
}

// Length 1 (x from -0.5 to 0.5), height 0.38, width 0.5. Parts: 0 body, 1 dorsal fin, 2 fluke.
function seaGiantGeometry() {
  const pos = [], part = [], idx = [];
  const S = 6, xs = [-0.42, -0.15, 0.15, 0.4];
  for (const x of xs) { const rr = Math.sqrt(Math.max(0, 1 - (2 * x) ** 2)); for (let i = 0; i < S; i++) { const a = i / S * Math.PI * 2; pos.push(x, rr * 0.19 * Math.cos(a), rr * 0.25 * Math.sin(a)); part.push(0); } }
  for (let r = 0; r < xs.length - 1; r++) for (let i = 0; i < S; i++) { const j = (i + 1) % S, a = r * S + i, b = r * S + j, c = (r + 1) * S + i, d = (r + 1) * S + j; idx.push(a, c, d, a, d, b); }
  const nose = pos.length / 3; pos.push(0.5, 0.02, 0); part.push(0);
  const tail = pos.length / 3; pos.push(-0.52, 0.03, 0); part.push(0);
  for (let i = 0; i < S; i++) { const j = (i + 1) % S; idx.push((xs.length - 1) * S + i, nose, (xs.length - 1) * S + j); idx.push(i, j, tail); }
  const f0 = pos.length / 3; pos.push(0.05, 0.17, 0, 0.17, 0.42, 0, -0.18, 0.17, 0); part.push(1, 1, 1); idx.push(f0, f0 + 1, f0 + 2);
  const k0 = pos.length / 3; pos.push(-0.5, 0.03, 0, -0.78, 0.06, 0.32, -0.78, 0.06, -0.32, -0.62, 0.04, 0); part.push(2, 2, 2, 2); idx.push(k0, k0 + 1, k0 + 3, k0, k0 + 3, k0 + 2);
  return geom(pos, part, idx);
}

const CREATURE_FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_SHADE_FRAG}
varying vec3 vColor, vNormal, vWorld; varying float vWrap;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormal); if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;   // wings are seen from either side
  gl_FragColor = vec4(shade(vColor, N, vWorld, vWrap, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

const CULL = 'gl_Position = vec4(0.0, 0.0, -3.0, 1.0); return;';

const DRAGON_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aPart; attribute float aId;   // position comes from three.js
varying vec3 vColor, vNormal, vWorld; varying float vWrap;
vec3 rollX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
void main() {
  vec2 cell = cellOf(aId, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  // they nest on the land and hunt the open ocean: most over the outer sea and its coasts, fewer over the inner seas
  float p = s.inW < 0.5 ? 0.0 : (s.water ? (s.inner > 0.5 ? 0.3 : 0.6) : 0.35);
  // flights go out at dawn and come back at dusk; midday is quiet and the night nearly empty
  float sunUp = dot(s.n, uSunDir);
  float act = 0.3 + 0.7 * exp(-pow(sunUp / 0.2, 2.0));
  act = mix(0.04, act, smoothstep(-0.4, -0.15, sunUp));
  if (rnd.w > p * act) { ${CULL} }
  float span = 34.0 + 22.0 * rnd.x;
  float Rc = 700.0 + 1800.0 * rnd.y, dirn = rnd.z < 0.5 ? 1.0 : -1.0;
  float a = (uTime * (26.0 + 10.0 * rnd.z) / Rc + rnd.w * TAU) * dirn;
  vec2 en = vec2(cos(a), sin(a)) * Rc;
  vec2 ll = s.ll + metersToDeg(en, s.ll.x);
  float ground = groundSmooth(ll) * uRelief;
  float cruise = s.water ? 60.0 + 120.0 * rnd.x : 160.0 + 360.0 * rnd.y;
  float alt = ground + cruise + 40.0 * sin(uTime * 0.08 + rnd.x * TAU);
  vec3 n = llDir(ll); vec3 base = n * (1.0 + alt / uRadiusM);
  float fade = edgeFade(metersFromCamera(base)) * altFade(40000.0, 80000.0);
  if (fade <= 0.001) { ${CULL} }
  // flap and glide: slow heavy beats, with long glides between
  float glide = smoothstep(0.35, 0.6, vnoise(vec3(uTime * 0.06, rnd.xy * 10.0)));
  float flap = sin(uTime * (1.4 + 0.4 * rnd.y) + rnd.y * TAU) * mix(0.55, 0.08, glide);
  float wz = abs(position.z);
  vec3 lp = position, ln = aPart > 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(vec3(position.x * 0.3, position.y + 0.02, position.z));
  if (aPart > 0.5) { float lift = flap * (0.3 * wz + 0.7 * wz * wz) + 0.12 * wz; lp.y += lift; ln = normalize(vec3(0.0, 1.0, -sign(position.z) * (flap * 1.2 * wz + 0.12))); }
  float bank = dirn * 0.4 * (1.0 - glide * 0.5);
  lp = rollX(lp, bank) * span * 0.5 * fade; ln = rollX(ln, bank);
  mat3 f = frameAt(n, a + dirn * 1.5708);
  vec3 world = toWorld(base, f, lp);
  vWorld = world; vNormal = normalize(f * ln); vWrap = aPart > 0.5 ? 0.9 : 0.25;
  vec3 body = mix(vec3(0.16, 0.12, 0.10), vec3(0.22, 0.14, 0.09), rnd.y);
  vColor = aPart > 0.5 ? mix(body, vec3(0.45, 0.25, 0.16), 0.55) : body;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const BIRD_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aPart; attribute float aId;   // position comes from three.js
uniform float uPerCell;
varying vec3 vColor, vNormal, vWorld; varying float vWrap;
void main() {
  float flock = floor(aId / uPerCell + 0.5 / uPerCell), member = aId - flock * uPerCell;
  vec2 cell = cellOf(flock, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  float shore = 1.0 - smoothstep(0.1, 0.9, abs(s.land - 0.5) * 2.0);
  float p = s.inW < 0.5 ? 0.0 : s.water ? mix(0.08, 0.5, shore) : (abs(s.biome - 2.0) < 0.5 ? 0.05 : mix(0.45, 0.6, shore));
  float sunUp = dot(s.n, uSunDir);
  p *= smoothstep(-0.2, 0.0, sunUp);                          // birds roost at night
  if (rnd.w > p) { ${CULL} }
  vec4 m = hash4(vec2(member * 7.1 + 1.0, cell.x + cell.y * 3.0));
  float Rf = 120.0 + 250.0 * rnd.x, dirn = rnd.y < 0.5 ? 1.0 : -1.0;
  float a = (uTime * 9.0 / Rf + rnd.z * TAU) * dirn;
  vec2 en = vec2(cos(a), sin(a)) * Rf + (m.xy - 0.5) * 90.0;
  vec2 ll = s.ll + metersToDeg(en, s.ll.x);
  float ground = groundSmooth(ll) * uRelief;
  float above = s.water ? 12.0 + 30.0 * rnd.z : 150.0 + 160.0 * rnd.z;   // well above the canopy
  float alt = ground + above + (m.z - 0.5) * 30.0 + 3.0 * sin(uTime * 0.9 + m.w * TAU);
  vec3 n = llDir(ll); vec3 base = n * (1.0 + alt / uRadiusM);
  float fade = edgeFade(metersFromCamera(base)) * altFade(5000.0, 9000.0);
  if (fade <= 0.001) { ${CULL} }
  float tropical = 1.0 - smoothstep(16.0, 22.0, s.ll.x);
  float span = s.water ? 3.5 + 2.5 * m.x : 3.5 + 4.5 * m.x;
  float glide = step(0.6, fract(uTime * 0.05 + m.w * 3.0));
  float flap = sin(uTime * (3.5 + 2.0 * m.y) + m.z * TAU) * mix(0.6, 0.1, glide);
  float wz = abs(position.z);
  vec3 lp = position; lp.y += flap * wz * wz;
  vec3 ln = normalize(vec3(0.0, 1.0, -sign(position.z) * flap * 1.4 * wz));
  lp *= span * 0.5 * fade;
  mat3 f = frameAt(n, a + dirn * 1.5708);
  vec3 world = toWorld(base, f, lp);
  vWorld = world; vNormal = normalize(f * ln); vWrap = 0.8;
  vec3 bright = m.w < 0.25 ? vec3(0.85, 0.12, 0.08) : m.w < 0.5 ? vec3(0.1, 0.6, 0.6) : m.w < 0.75 ? vec3(0.95, 0.7, 0.1) : vec3(0.35, 0.15, 0.6);
  vec3 land = mix(vec3(0.36, 0.3, 0.22), bright, tropical * step(0.2, m.x));
  vColor = s.water ? vec3(0.85, 0.86, 0.88) : land;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const GRAZER_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aPart; attribute float aId;   // position comes from three.js
varying vec3 vColor, vNormal, vWorld; varying float vWrap;
void main() {
  vec2 cell = cellOf(aId, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  bool forest = abs(s.biome - 1.0) < 0.5 || abs(s.biome - 5.0) < 0.5;
  if (s.inW < 0.5 || s.water || !forest || s.land < 0.8 || s.ll.x < 6.0 || s.ll.x > 58.0 || rnd.w > 0.6) { ${CULL} }
  siteGround(s);
  if (s.clearing < 0.9 || s.h > s.treeline - 300.0) { ${CULL} }       // only in the open ground of the meadows
  float L = 11.0 + 7.0 * rnd.x;
  float Rw = 18.0 + 22.0 * rnd.y, dirn = rnd.z < 0.5 ? 1.0 : -1.0;
  float a = (uTime * 0.9 / Rw + rnd.w * TAU) * dirn;
  vec2 en = vec2(cos(a), sin(a)) * Rw;
  Site here = siteAt(s.ll + metersToDeg(en, s.ll.x), rnd); siteGround(here);
  float fade = edgeFade(metersFromCamera(here.base)) * altFade(2500.0, 4500.0);
  if (fade <= 0.001) { ${CULL} }
  float walk = uTime * 1.3 + rnd.y * TAU;
  vec3 lp = position;
  vec3 ln = aPart < 0.5 ? normalize(vec3(0.0, position.y - 0.6, position.z * 2.0)) : aPart < 1.5 ? normalize(vec3(0.3, position.y - 0.9, position.z * 3.0)) : aPart < 2.5 ? vec3(0.0, 0.0, 1.0) : normalize(vec3(position.x - (aPart < 4.5 ? 0.3 : -0.38), 0.0, position.z - sign(position.z) * 0.14 + 0.001));
  if (aPart >= 2.5) {                                                // legs swing from the hip, diagonal pairs together
    float leg = aPart - 3.0;
    float phase = (leg == 0.0 || leg == 3.0) ? 0.0 : 3.14159;
    float swing = sin(walk + phase) * 0.28 * (1.0 - position.y / 0.55);
    float hx = leg < 2.0 ? 0.3 : -0.38;
    lp.x = hx + (position.x - hx) + swing * (0.55 - position.y);
  } else {
    lp.y += 0.015 * sin(walk * 2.0);                                   // the body rocks with the stride
    if (aPart > 0.5 && aPart < 1.5) lp.y -= (position.x - 0.38) * 0.25 * (0.5 + 0.5 * sin(uTime * 0.3 + rnd.x * TAU));   // head dips to graze
  }
  lp *= L * fade;
  mat3 f = frameAt(here.n, a + dirn * 1.5708);
  vec3 world = toWorld(here.base, f, lp);
  vWorld = world; vNormal = normalize(f * ln); vWrap = 0.3;
  vColor = mix(vec3(0.30, 0.24, 0.17), vec3(0.42, 0.38, 0.30), rnd.y) * (aPart < 0.5 ? 1.0 : 0.9);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const SEA_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aPart; attribute float aId;   // position comes from three.js
varying vec3 vColor, vNormal, vWorld; varying float vWrap;
void main() {
  vec2 cell = cellOf(aId, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  bool lake = abs(s.biome - 4.0) < 0.5, inner = s.inner > 0.5;
  float p = s.inW < 0.5 || !s.water || s.land > 0.35 ? 0.0 : lake ? (s.depth > 15.0 ? 0.12 : 0.0) : inner ? (s.depth > 15.0 ? 0.3 : 0.0) : (s.depth > 600.0 ? 0.05 : 0.0);
  if (rnd.w > p) { ${CULL} }
  siteGround(s);
  float L = inner || lake ? 40.0 + 40.0 * rnd.x : 80.0 + 90.0 * rnd.x;
  float Rw = 150.0 + 150.0 * rnd.y, dirn = rnd.z < 0.5 ? 1.0 : -1.0;
  float a = (uTime * 2.5 / Rw + rnd.w * TAU) * dirn;
  vec2 en = vec2(cos(a), sin(a)) * Rw;
  vec2 ll = s.ll + metersToDeg(en, s.ll.x);
  // the back breaks the surface and sinks again; outer-ocean things only show for a moment
  float yc = inner || lake ? L * (-0.07 + 0.13 * sin(uTime * 0.15 + rnd.x * TAU)) : L * (-0.3 + 0.36 * pow(max(sin(uTime * 0.05 + rnd.x * TAU), 0.0), 8.0));
  vec3 n = llDir(ll); vec3 base = n * (1.0 + (s.h * uRelief + yc) / uRadiusM);
  float fade = edgeFade(metersFromCamera(base)) * altFade(6000.0, 12000.0);
  if (fade <= 0.001) { ${CULL} }
  vec3 lp = position * L * fade;
  float sway = sin(uTime * 0.8 + rnd.y * TAU) * 0.08;
  if (aPart > 1.5) lp.y += sway * L;                                  // the fluke beats slowly
  vec3 ln = aPart < 0.5 ? normalize(vec3(position.x * 0.5, position.y / 0.19, position.z / 0.25)) : aPart < 1.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  mat3 f = frameAt(n, a + dirn * 1.5708);
  vec3 world = toWorld(base, f, lp);
  vWorld = world; vNormal = normalize(f * ln); vWrap = 0.2;
  vColor = inner || lake ? mix(vec3(0.16, 0.24, 0.28), vec3(0.3, 0.34, 0.33), rnd.y) : vec3(0.04, 0.05, 0.06);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FIREFLY_VERT = /* glsl */`
${SCATTER_PREAMBLE}
attribute float aId;
uniform float uPixelRatio;
varying float vGlow;
void main() {
  vec2 cell = cellOf(aId, uGridW); vec4 rnd = hash4(cell);
  vec2 jit = vec2(hash3(vec3(cell, 3.3)), hash3(vec3(cell, 9.1)));
  Site s = siteAt(cellLL(cell, jit), rnd);
  bool wet = abs(s.biome - 3.0) < 0.5 || abs(s.biome - 6.0) < 0.5;
  float warm = max(1.0 - smoothstep(18.0, 24.0, s.ll.x), wet ? 1.0 : 0.0);
  float night = 1.0 - smoothstep(-0.12, -0.03, dot(s.n, uSunDir));   // increasing edges: reversed ones are undefined in GLSL
  if (s.inW < 0.5 || s.water || s.land < 0.6 || abs(s.biome - 2.0) < 0.5 || rnd.w > 0.45 * warm || night <= 0.0) { ${CULL} }
  siteGround(s);
  if (s.h > s.treeline) { ${CULL} }
  float t = uTime * 0.4 + rnd.x * TAU;
  vec3 lp = vec3(3.0 * sin(t * 1.3), 1.5 + 14.0 * rnd.y + 1.5 * sin(t), 3.0 * cos(t * 0.9));
  vec3 base = toWorld(s.base, frameAt(s.n, 0.0), lp);
  float fade = edgeFade(metersFromCamera(base)) * altFade(350.0, 700.0) * night;
  float pulse = pow(0.5 + 0.5 * sin(uTime * (2.0 + 2.0 * rnd.z) + rnd.w * TAU * 4.0), 5.0);
  vGlow = fade * pulse;
  if (vGlow <= 0.01) { ${CULL} }
  gl_Position = projectionMatrix * viewMatrix * vec4(base, 1.0);
  gl_PointSize = (2.5 + 3.5 * pulse) * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;
const FIREFLY_FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vGlow;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vGlow;
  gl_FragColor = vec4(vec3(0.75, 1.0, 0.4) * a, a);
  #include <colorspace_fragment>
}
`;

export class Fauna {
  constructor(uniforms, quality = 1, pixelRatio = 1) {
    this.group = new THREE.Group();
    const q = Math.sqrt(Math.max(0.3, Math.min(2, quality)));
    const add = (sc) => { this.group.add(sc.mesh); return sc; };
    this.dragons = add(new Scatter(dragonGeometry(), { vert: DRAGON_VERT, frag: CREATURE_FRAG, uniforms: { ...uniforms }, cellM: 2500, gridW: 40, side: THREE.DoubleSide }));
    const perCell = 22;
    this.birds = add(new Scatter(birdGeometry(), { vert: BIRD_VERT, frag: CREATURE_FRAG, uniforms: { ...uniforms, uPerCell: { value: perCell } }, cellM: 450, gridW: Math.round(44 * q), perCell, side: THREE.DoubleSide }));
    this.grazers = add(new Scatter(grazerGeometry(), { vert: GRAZER_VERT, frag: CREATURE_FRAG, uniforms: { ...uniforms }, cellM: 150, gridW: Math.round(70 * q) }));
    this.sea = add(new Scatter(seaGiantGeometry(), { vert: SEA_VERT, frag: CREATURE_FRAG, uniforms: { ...uniforms }, cellM: 240, gridW: 64, side: THREE.DoubleSide }));
    this.fireflies = add(new Scatter(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
      { vert: FIREFLY_VERT, frag: FIREFLY_FRAG, uniforms: { ...uniforms, uPixelRatio: { value: pixelRatio } }, cellM: 11, gridW: 64, points: true, transparent: true, blending: THREE.AdditiveBlending }));
    this.all = [this.dragons, this.birds, this.grazers, this.sea, this.fireflies];
  }
  setRadius(km) { for (const s of this.all) s.setRadius(km); }
  update(lat, lon, alt) { for (const s of this.all) s.update(lat, lon, alt); }
  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
