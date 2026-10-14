import * as THREE from 'three';
import { GLSL_GEO } from './geo.js';
import { GLSL_NOISE, GLSL_LAYERS, GLSL_DETAIL, GLSL_MEADOW, GLSL_FOG } from './shaders.js';

// Everything that lives on the ground or in the air is placed on the GPU from the same height, mask and coast
// layers the terrain uses. Each instance owns one cell of a lat/lon grid around the camera; its cell gives it a
// stable hash (position jitter, species, size, animation phase), so nothing moves when the camera moves and the
// only change is at the grid edge, which fades. Cells are sized in meters and converted to degrees per planet.

export const GLSL_SCATTER = /* glsl */`
uniform sampler2D uMask;   // uCoast comes with GLSL_LAYERS
uniform vec2 uCamLL;        // camera lat, lon (deg)
uniform float uCellDeg;     // cell size, degrees of latitude
uniform float uGridW;       // cells per side
uniform float uAlt;         // camera height above ground (m)
uniform float uHalfExtentM; // half the grid width in meters
uniform float uSeason, uTime;
uniform vec3 uSunDir;
#define TAU 6.283185307179586

vec3 llDir(vec2 ll) { float p = radians(ll.x), l = radians(ll.y); return vec3(cos(p) * cos(l), sin(p), -cos(p) * sin(l)); }
vec4 hash4(vec2 c) { vec3 q = vec3(mod(c, 4096.0), 7.0); return vec4(hash3(q), hash3(q + 13.1), hash3(q + 27.7), hash3(q + 41.3)); }

// Cell (i, j) for instance id. Each row of cells is centred on the camera longitude separately and keeps its own
// longitude spacing (so cells stay square in meters toward the pole): the grid never slides, it only ends.
float rowScale(float j) { return 1.0 / max(cos(radians(clamp((j + 0.5) * uCellDeg, -85.0, 85.0))), 0.09); }
vec2 cellOf(float id, float W) {
  float jx = floor(id / W + 0.5 / W), ix = id - jx * W;
  float j = floor(uCamLL.x / uCellDeg) + jx - floor(W / 2.0);
  float i = floor(uCamLL.y / (uCellDeg * rowScale(j))) + ix - floor(W / 2.0);
  return vec2(i, j);
}
vec2 cellLL(vec2 c, vec2 jitter) { return vec2((c.y + jitter.y) * uCellDeg, (c.x + jitter.x) * uCellDeg * rowScale(c.y)); }
// meters of offset east/north -> degrees (lat, lon) at a latitude
vec2 metersToDeg(vec2 en, float lat) { float d = degrees(1.0 / uRadiusM); return vec2(en.y * d, en.x * d / max(cos(radians(lat)), 0.09)); }

struct Site {
  vec3 n; vec2 ll; vec2 uv; float inW; float h; float biome; float land; float inner; float depth;
  float clearing; float treeline; float dcam; vec3 base; vec4 rnd; bool water;
};

// snowline by latitude (proposed), 600 m lower under the grey snow hatch; the treeline sits 900 m below it
float snowline(float lat, float biome) {
  float a = abs(lat);
  float s = a < 30.0 ? mix(5000.0, 4000.0, a / 30.0) : a < 45.0 ? mix(4000.0, 2900.0, (a - 30.0) / 15.0)
          : a < 60.0 ? mix(2900.0, 1650.0, (a - 45.0) / 15.0) : mix(1650.0, 600.0, clamp((a - 60.0) / 15.0, 0.0, 1.0));
  return s - (abs(biome - 5.0) < 0.5 ? 600.0 : 0.0);
}

// The cheap part: where a site is and what the mask says about it. No height yet.
Site siteAt(vec2 ll, vec4 rnd) {
  Site s; s.ll = ll; s.rnd = rnd; s.n = llDir(ll);
  s.uv = windowUv(ll); s.inW = inWindow(s.uv);
  s.h = 0.0; s.biome = 0.0; s.land = 0.0; s.inner = 0.0; s.depth = 5000.0; s.clearing = 0.0; s.treeline = 0.0; s.dcam = 1.0;
  if (s.inW > 0.5) {
    vec4 m = texture2D(uMask, s.uv); s.biome = floor(m.b * 255.0 + 0.5); s.inner = m.g; s.depth = m.r * 5500.0;
    s.land = texture2D(uCoast, s.uv).r;
    // the protected-sea flag is painted on the water: a shore site takes it from the water texels next to it
    if (s.land < 0.95 && s.inner < 0.5) { vec2 o = 1.0 / uHeightSize; s.inner = max(max(texture2D(uMask, s.uv + vec2(o.x, 0.0)).g, texture2D(uMask, s.uv - vec2(o.x, 0.0)).g), max(texture2D(uMask, s.uv + vec2(0.0, o.y)).g, texture2D(uMask, s.uv - vec2(0.0, o.y)).g)); }
  }
  // land is what the coast layer calls land (the drawn shoreline); a shore cell with a water biome takes the forest
  s.water = s.inW < 0.5 || s.land < 0.5;
  if (!s.water && (s.biome < 0.5 || abs(s.biome - 4.0) < 0.5)) s.biome = 1.0;
  s.base = s.n; s.treeline = snowline(ll.x, s.biome) - 900.0;
  return s;
}
// The costly part: the ground height with the same fractal detail the terrain adds, and the clearing field.
void siteGround(inout Site s) {
  if (s.inW < 0.5) { s.base = s.n; return; }
  float coast;
  s.h = sampleGround(s.uv, coast);
  s.dcam = distance(cameraPosition, s.n * (1.0 + s.h / uRadiusM * uRelief));
  float fade = 1.0 - smoothstep(0.03, 0.12, s.dcam);
  float lw = smoothstep(0.5, 1.0, coast);                      // relief eases in from the shore, as on the terrain
  s.h += detail(s.n, s.h, s.water ? 0.0 : lw * lw, fade);
  s.clearing = max(clearingNoise(s.n), meadowNoise(s.n, s.ll.x));
  s.base = s.n * (1.0 + s.h * uRelief / uRadiusM);
}
// Height only, no detail: for things in the air that should not jitter with the ground
float groundSmooth(vec2 ll) { vec2 uv = windowUv(ll); float c; return inWindow(uv) > 0.5 ? max(sampleGround(uv, c), 0.0) : 0.0; }

// local frame at a site: x east, y up, z north, turned by 'turn' radians about up
mat3 frameAt(vec3 n, float turn) {
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n)); vec3 north = cross(n, east);
  float c = cos(turn), s = sin(turn);
  return mat3(east * c + north * s, n, north * c - east * s);
}
vec3 toWorld(vec3 base, mat3 f, vec3 local) { return base + (f * local) / uRadiusM; }
float metersFromCamera(vec3 p) { return distance(p, cameraPosition) * uRadiusM; }
// fade at the grid edge and above an altitude band
float edgeFade(float meters) { return 1.0 - smoothstep(uHalfExtentM * 0.72, uHalfExtentM * 0.97, meters); }
float altFade(float lo, float hi) { return 1.0 - smoothstep(lo, hi, uAlt); }
// day factor at a site, by the sphere normal (same curve as the terrain)
float dayAt(vec3 n) { return smoothstep(-0.12, 0.25, dot(n, uSunDir)); }
`;

// Fragment shading shared by the creatures and the trees: sun, sky, two moons, the terrain's height fog and tonemap.
export const GLSL_SHADE_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunColor; uniform float uExposure, uRadiusM;
uniform vec3 uMoonDir[2]; uniform float uMoonLight[2];
${GLSL_FOG}
vec3 tonemap(vec3 c) { c *= uExposure; return c / (1.0 + c); }
// wrap = how much light bleeds around (foliage, fur); ao = baked occlusion
vec3 shade(vec3 albedo, vec3 N, vec3 world, float wrap, float ao) {
  vec3 n = normalize(world);
  float day = smoothstep(-0.12, 0.25, dot(n, uSunDir));
  float diff = max((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0);
  float sky = 0.5 + 0.5 * dot(N, n);
  vec3 skyLight = mix(vec3(0.02, 0.03, 0.06), vec3(0.22, 0.30, 0.42), day) * sky;
  vec3 col = albedo * ao * (diff * uSunColor * 1.15 * day + skyLight);
  for (int i = 0; i < 2; i++) {
    float md = max(dot(N, uMoonDir[i]), 0.0) * max(dot(n, uMoonDir[i]), 0.0);
    col += albedo * ao * md * uMoonLight[i] * vec3(0.55, 0.62, 0.75) * (1.0 - day);
  }
  col = applyFog(col, world - cameraPosition, max((length(world) - 1.0) * uRadiusM, 0.0), uRadiusM);   // same haze as the ground
  return tonemap(col);
}
`;

export const SCATTER_PREAMBLE = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_GEO}
${GLSL_NOISE}
${GLSL_LAYERS}
${GLSL_DETAIL}
${GLSL_MEADOW}
${GLSL_SCATTER}
`;

// One instanced mesh over a camera-centred grid. `cellM` is the cell size in meters, `gridW` cells per side,
// `perCell` instances per cell (flocks, herds).
export class Scatter {
  constructor(geometry, { vert, frag, uniforms, cellM, gridW, perCell = 1, points = false, side = THREE.FrontSide, transparent = false, blending }) {
    this.cellM = cellM; this.gridW = gridW; this.perCell = perCell;
    const n = gridW * gridW * perCell;
    const g = new THREE.InstancedBufferGeometry();
    g.index = geometry.index;
    for (const k of Object.keys(geometry.attributes)) g.setAttribute(k, geometry.attributes[k]);
    const ids = new Float32Array(n); for (let i = 0; i < n; i++) ids[i] = i;
    g.setAttribute('aId', new THREE.InstancedBufferAttribute(ids, 1));
    g.instanceCount = n;
    this.uniforms = {
      ...uniforms,
      uCamLL: { value: new THREE.Vector2() }, uCellDeg: { value: 0.001 }, uGridW: { value: gridW }, uAlt: { value: 0 }, uHalfExtentM: { value: 1 }
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, side, transparent, blending: blending ?? THREE.NormalBlending, depthWrite: !transparent });
    this.mesh = points ? new THREE.Points(g, this.material) : new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.radiusM = 1692.7e3;
    this.setRadius(this.radiusM / 1000);
  }
  setRadius(km) {
    this.radiusM = km * 1000;
    this.uniforms.uCellDeg.value = this.cellM / this.radiusM * 180 / Math.PI;
    this.uniforms.uHalfExtentM.value = this.gridW / 2 * this.cellM;
  }
  update(lat, lon, alt) { this.uniforms.uCamLL.value.set(lat, lon); this.uniforms.uAlt.value = alt; }
}

// Shared uniforms: the same objects the terrain material uses, so sun, moons, time and layers stay in step.
export function sharedUniforms(terrainUniforms, season) {
  const t = terrainUniforms;
  return {
    uHeight: t.uHeight, uHeightSize: t.uHeightSize, uWater: t.uWater, uMask: t.uMask, uCoast: t.uCoast, uCoastSize: t.uCoastSize,
    uWindow: t.uWindow, uRadiusM: t.uRadiusM,
    uRelief: t.uRelief, uDetail: t.uDetail, uSunDir: t.uSunDir, uSunColor: t.uSunColor, uMoonDir: t.uMoonDir, uMoonLight: t.uMoonLight,
    uTime: t.uTime, uExposure: t.uExposure, uSeason: season,
    uFogSun: t.uFogSun, uFogAway: t.uFogAway, uFogZenith: t.uFogZenith, uFogDensity: t.uFogDensity, uFogHeight: t.uFogHeight,
    uCamAltM: t.uCamAltM, uSunDirF: t.uSunDirF
  };
}
