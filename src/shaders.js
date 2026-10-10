import { GLSL_GEO } from './geo.js';
import { GLSL_NOISE } from './noise.js';

export { GLSL_NOISE };

// Shared by vertex and fragment: window lookup and the layer decodes. Every sample is taken at texel centers and
// blended by hand, so the CPU copy in heightfield.js reproduces it exactly.
export const GLSL_LAYERS = /* glsl */`
uniform sampler2D uHeight; uniform vec2 uHeightSize;
uniform sampler2D uWater;      // water-level field: lowest height in each texel's 3×3 neighbourhood (heightfield.js)
uniform sampler2D uCoast; uniform vec2 uCoastSize;
uniform vec4 uWindow;          // lon0, lat0, lon1, lat1 (deg)
uniform float uRadiusM;        // planet radius in meters (scene unit = 1 radius)

vec2 windowUv(vec2 ll) { return vec2((ll.y - uWindow.x) / (uWindow.z - uWindow.x), (ll.x - uWindow.y) / (uWindow.w - uWindow.y)); }
float inWindow(vec2 uv) { vec2 d = step(vec2(0.0), uv) * step(uv, vec2(1.0)); return d.x * d.y; }
float decodeH(vec2 uv) { vec4 t = texture2D(uHeight, uv); return floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5) - 6000.0; }
float decodeW(vec2 uv) { vec4 t = texture2D(uWater, uv); return floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5) - 6000.0; }
float decodeC(vec2 uv) { return floor(texture2D(uCoast, uv).r * 255.0 + 0.5) / 255.0; }
// height with the shoreline pulled down to the water: h00..h11 are the four texels, wl the lowest of them
float sampleGround(vec2 uv, out float coast) {
  vec2 s = uv * uHeightSize - 0.5; vec2 i = floor(s); vec2 f = s - i; vec2 o = 1.0 / uHeightSize; vec2 b = (i + 0.5) * o;
  float a = decodeH(b), bb = decodeH(b + vec2(o.x, 0.0)), c = decodeH(b + vec2(0.0, o.y)), d = decodeH(b + o);
  float hb = mix(mix(a, bb, f.x), mix(c, d, f.x), f.y);
  vec2 sc = uv * uCoastSize - 0.5; vec2 ic = floor(sc); vec2 fc = sc - ic; vec2 oc = 1.0 / uCoastSize; vec2 bc = (ic + 0.5) * oc;
  coast = mix(mix(decodeC(bc), decodeC(bc + vec2(oc.x, 0.0)), fc.x), mix(decodeC(bc + vec2(0.0, oc.y)), decodeC(bc + oc), fc.x), fc.y);
  float wl = min(hb, mix(mix(decodeW(b), decodeW(b + vec2(o.x, 0.0)), f.x), mix(decodeW(b + vec2(0.0, o.y)), decodeW(b + o), f.x), f.y));
  return wl + (hb - wl) * smoothstep(0.42, 0.97, coast);
}
`;

// Exponential height fog standing in for aerial perspective below ~30 km; above that the atmosphere shell does it.
export const GLSL_FOG = /* glsl */`
uniform vec3 uFogSun, uFogAway;   // horizon sky radiance toward the sun's azimuth and away from it (pre-exposure)
uniform vec3 uFogZenith;          // sky radiance straight up
uniform float uFogDensity;        // extinction at sea level, per meter (0 = off)
uniform float uFogHeight;         // scale height, m
uniform float uCamAltM;           // camera height above sea level, m
uniform vec3 uSunDirF;
vec3 applyFog(vec3 col, vec3 toPoint, float pointAltM, float radiusM) {
  if (uFogDensity <= 0.0) return col;
  float dist = length(toPoint) * radiusM;
  float h0 = max(uCamAltM, -500.0), dh = pointAltM - h0, H = uFogHeight;
  float k = abs(dh) > 1.0 ? (exp(-h0 / H) - exp(-(h0 + dh) / H)) * H / dh : exp(-h0 / H);
  float f = 1.0 - exp(-uFogDensity * dist * k);
  vec3 v = toPoint / max(length(toPoint), 1e-20);
  float s = 0.5 + 0.5 * dot(v, uSunDirF);
  vec3 fc = min(mix(uFogAway, uFogSun, pow(s, 5.0)), vec3(3.0));
  return mix(col, fc, f);
}
`;

export const TERRAIN_VERT = /* glsl */`
precision highp float; precision highp int;
attribute vec3 aGridS;         // grid u, v, skirt flag
attribute vec4 aTile;          // u0, v0, size, depth + 32·face   (instance)
attribute vec4 aP0, aP1, aP2, aP3; attribute vec2 aP4;   // deep tiles: center (relative to the origin) and Taylor terms, packed
attribute vec4 aU0, aU1, aU2;  // deep tiles: layer uv at the center and its Taylor terms
uniform float uRelief, uDetail, uGridN, uDeep, uTime;
uniform sampler2D uMask;
uniform vec3 uOrigin;          // unit direction of the local origin; the mesh is placed there
uniform vec3 uCamLocal;        // camera position relative to the origin
varying vec3 vNormal, vSphere, vView; varying vec2 vUvW; varying float vIn, vDepth, vAlt, vCoast;
#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_GEO}
${GLSL_NOISE}
${GLSL_LAYERS}

// Direction to a grid point, relative to the origin. Deep (small, near) tiles use a second-order expansion about
// their center computed on the CPU in double precision, so nothing near the camera is ever the small difference of
// two numbers near 1. Coarse tiles are far away and use the exact cube-to-sphere mapping.
float tDepth, tFace;
vec3 tileRel(vec2 g) {
  if (tDepth >= uDeep) {
    vec2 d = (g - 0.5) * aTile.z;
    vec3 C = aP0.xyz, Ju = vec3(aP0.w, aP1.xy), Jv = vec3(aP1.zw, aP2.x), Huu = aP2.yzw, Huv = aP3.xyz, Hvv = vec3(aP3.w, aP4);
    return C + Ju * d.x + Jv * d.y + 0.5 * Huu * d.x * d.x + Huv * d.x * d.y + 0.5 * Hvv * d.y * d.y;
  }
  vec2 st = aTile.xy + g * aTile.z;
  return normalize(spherify(cubePoint(tFace, st * 2.0 - 1.0))) - uOrigin;
}

// fractal relief below the data resolution (same function as detailAt() in heightfield.js)
float detail(vec3 n, float h, float landW, float fade) {
  if (fade <= 0.0 || landW <= 0.0) return 0.0;
  float rugged = smoothstep(700.0, 2600.0, h);
  float ridge = 1.0 - abs(vnoise(n * 425.0) * 2.0 - 1.0);
  float ridge2 = 1.0 - abs(vnoise(n * 1400.0 + 3.1) * 2.0 - 1.0);
  float d = (ridge * ridge - 0.33) * 520.0 * rugged
          + (ridge2 * ridge2 - 0.33) * 190.0 * rugged * (0.4 + 0.6 * ridge)
          + (vnoise(n * 2000.0) - 0.5) * (40.0 + 40.0 * rugged)
          + (vnoise(n * 8000.0) - 0.5) * (14.0 + 16.0 * rugged)
          + (vnoise(n * 32000.0) - 0.5) * 8.0
          + (vnoise(n * 128000.0) - 0.5) * 2.5;
  if (d > 0.0) d *= 1.0 - 0.75 * smoothstep(3300.0, 4300.0, h);   // summits stay near the spec heights
  return d * fade * landW * uDetail;
}

// travelling swell on the water near the camera: long heavy swell on the deep outer ocean (canon: hostile), small
// waves in the protected seas and lakes. Anchored to the planet (phase from the direction), so it does not slide.
float swell(vec3 n, float coast, vec2 uv, float near) {
  float wat = 1.0 - smoothstep(0.30, 0.47, coast);
  if (wat <= 0.0 || near <= 0.0) return 0.0;
  vec4 m = texture2D(uMask, uv);
  float depth = m.r * 5500.0, biome = floor(m.b * 255.0 + 0.5);
  float amp = abs(biome - 4.0) < 0.5 ? 0.12 : mix(0.3, 1.6, smoothstep(150.0, 1500.0, depth)) * (m.g > 0.5 ? 0.35 : 1.0);
  float k = uRadiusM * 6.2831853;
  float w = sin(dot(n, vec3(0.80, 0.25, 0.55)) * k / 140.0 + uTime * 0.66)
          + 0.6 * sin(dot(n, vec3(-0.35, 0.72, 0.6)) * k / 75.0 + uTime * 0.91)
          + 0.35 * sin(dot(n, vec3(0.2, -0.6, 0.77)) * k / 31.0 + uTime * 1.4);
  return w * amp * wat * near * 0.55;
}

vec3 surfacePoint(vec2 g, out float h, out vec2 uvW, out float inW, out float coast, out vec3 nAbs) {
  vec3 r = tileRel(g);
  nAbs = normalize(uOrigin + r);
  if (tDepth >= uDeep) {
    vec2 d = (g - 0.5) * aTile.z;
    uvW = aU0.xy + aU0.zw * d.x + aU1.xy * d.y + 0.5 * aU1.zw * d.x * d.x + aU2.xy * d.x * d.y + 0.5 * aU2.zw * d.y * d.y;
  } else uvW = windowUv(latLon(nAbs));
  inW = inWindow(uvW);
  coast = 0.0; h = 0.0;
  if (inW > 0.5) h = sampleGround(uvW, coast);
  float hs0 = h / uRadiusM * uRelief;
  float dcam = distance(uCamLocal, r * (1.0 + hs0) + uOrigin * hs0);
  float fade = 1.0 - smoothstep(0.03, 0.12, dcam);
  float lw = smoothstep(0.5, 1.0, coast);
  h += detail(nAbs, h, lw * lw, fade);   // relief eases in from the shore, so lake banks are not walls
  float dcamM = dcam * uRadiusM;   // no swell right around the camera: the CPU ground (walking, flying) is still water
  if (inW > 0.5) h += swell(nAbs, coast, uvW, (1.0 - smoothstep(0.004, 0.012, dcam)) * smoothstep(40.0, 160.0, dcamM)) / max(uRelief, 1.0);
  float hs = h / uRadiusM * uRelief;
  return r * (1.0 + hs) + uOrigin * hs;
}

void main() {
  float e = 1.0 / uGridN;
  float h, h1, h2, inW, i1, i2, coast, c1, c2; vec2 uvW, t1, t2; vec3 n, n1, n2;
  tFace = floor((aTile.w + 0.5) / 32.0); tDepth = aTile.w - 32.0 * tFace;
  float aSkirt = aGridS.z; vec2 aGrid = aGridS.xy;
  vec2 g = aSkirt > 0.5 ? clamp(aGrid, 0.0, 1.0) : aGrid;        // skirt vertices sit on the edge, then drop
  vec3 p = surfacePoint(g, h, uvW, inW, coast, n);
  vec3 p1 = surfacePoint(g + vec2(e, 0.0), h1, t1, i1, c1, n1);
  vec3 p2 = surfacePoint(g + vec2(0.0, e), h2, t2, i2, c2, n2);
  vec3 N = normalize(cross(p1 - p, p2 - p));
  if (dot(N, n) < 0.0) N = -N;
  if (aSkirt > 0.5) p -= n * (aTile.z * 0.06 + 4.0 / uRadiusM);   // skirts hide the cracks between LOD levels
  vNormal = N; vSphere = n; vUvW = uvW; vIn = inW; vDepth = tDepth; vAlt = h; vCoast = coast;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = (vec4(mv.xyz, 0.0) * viewMatrix).xyz;    // camera -> point, world orientation, full precision
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const TERRAIN_FRAG = /* glsl */`
precision highp float; precision highp int;
uniform sampler2D uColor, uMask, uCoastL;
uniform vec3 uSunDir, uSunColor, uAbyss;
uniform vec3 uMoonDir[2]; uniform float uMoonLight[2];
uniform float uTime, uExposure, uRadiusM, uFloorDist;
uniform vec4 uWindowF;
uniform sampler2D uOverlay; uniform float uOverlayOn;
varying vec3 vNormal, vSphere, vView; varying vec2 vUvW; varying float vIn, vDepth, vAlt, vCoast;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
${GLSL_FOG}

vec3 tonemap(vec3 c) { c *= uExposure; return c / (1.0 + c); }

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vSphere); vec3 N = normalize(vNormal);
  vec3 V = -normalize(vView);
  float distM = length(vView) * uRadiusM;
  vec3 base = uAbyss; float biome = 0.0, depth = 5200.0, inner = 0.0;
  if (vIn > 0.5) {
    base = texture2D(uColor, vUvW).rgb;
    vec4 m = texture2D(uMask, vUvW);
    depth = m.r * 5500.0; inner = m.g; biome = floor(m.b * 255.0 + 0.5);
  }
  bool lake = abs(biome - 4.0) < 0.5;
  // the shoreline: the smooth land fraction, roughened by noise once it is close enough to matter
  float closeK = 1.0 - smoothstep(2000.0, 12000.0, distM);
  float rough = (vnoise(vSphere * 60000.0) - 0.5) * 0.035 + (vnoise(vSphere * 400000.0) - 0.5) * 0.02;
  float cf = vIn > 0.5 ? texture2D(uCoastL, vUvW).r + rough * closeK : 0.0;
  float wf = 1.0 - smoothstep(0.44, 0.5 + 0.06 * (1.0 - closeK), cf);
  float sunUp = dot(n, uSunDir);                              // -1 night .. 1 noon, by the sphere normal
  float day = smoothstep(-0.12, 0.25, sunUp);
  float near = clamp((vDepth - 5.0) / 3.0, 0.0, 1.0);

  vec3 colLand, colWater;
  {
    // calm inside the protected seas and lakes, long heavy swell on the deep outer ocean (canon)
    float swell = (lake || inner > 0.5) ? 0.03 : mix(0.04, 0.09, smoothstep(150.0, 1500.0, depth));
    vec3 nn = normalize(mix(n, N, near));
    if (near > 0.0) {
      vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), n)); vec3 ey = cross(n, ex);   // tangent plane
      vec3 q1 = vSphere * 15000.0 + vec3(uTime * 0.05, uTime * 0.03, 0.0);    // long waves
      vec3 q2 = vSphere * 110000.0 + vec3(-uTime * 0.25, uTime * 0.2, 0.0);   // chop
      vec3 q3 = vSphere * 700000.0 + vec3(uTime * 0.9, -uTime * 0.7, uTime * 0.4); // ripples, only up close
      vec2 w = (vec2(vnoise(q1), vnoise(q1 + 3.7)) - 0.5) * 2.0 + (vec2(vnoise(q2), vnoise(q2 + 5.1)) - 0.5) * 0.8;
      w += (vec2(vnoise(q3), vnoise(q3 + 9.3)) - 0.5) * 0.6 * (1.0 - smoothstep(30.0, 400.0, distM));
      nn = normalize(nn + (ex * w.x + ey * w.y) * swell * near);
    }
    float fres = pow(1.0 - max(dot(nn, V), 0.0), 5.0);
    vec3 R = reflect(-uSunDir, nn);
    float spec = pow(max(dot(R, V), 0.0), mix(600.0, 90.0, 1.0 - inner)) * mix(0.9, 0.45, 1.0 - inner);
    vec3 skyTint = mix(vec3(0.05, 0.09, 0.16), vec3(0.35, 0.55, 0.85), day);
    // low down, the water mirrors the actual horizon sky (the same radiance the fog fades into)
    if (uFogDensity > 0.0) {
      vec3 Rf = normalize(reflect(-V, nn));
      float sa = 0.5 + 0.5 * dot(Rf, uSunDirF), el = dot(Rf, n);
      vec3 hz = min(mix(uFogAway, uFogSun, pow(sa, 8.0)), vec3(2.0));
      vec3 refl = mix(hz, uFogZenith, smoothstep(0.02, 0.45, el));   // higher reflections see the deeper sky
      skyTint = mix(skyTint, refl * 0.85, smoothstep(0.0, 1.0, uFogDensity / 3e-5));
    }
    float diff = max(dot(nn, uSunDir), 0.0);
    // up close the water has a body of its own: turquoise over sand in the protected shallows, near-black navy on the
    // outer ocean, cold blue in the lakes; far away the painted color layer (the orbital look) takes over
    float shallow = smoothstep(0.22, 0.47, cf) * (1.0 - smoothstep(60.0, 400.0, depth));
    vec3 deepC = lake ? vec3(0.015, 0.07, 0.12) : inner > 0.5 ? vec3(0.02, 0.13, 0.15) : mix(vec3(0.02, 0.09, 0.12), vec3(0.004, 0.018, 0.045), smoothstep(100.0, 1500.0, depth));
    vec3 shallowC = lake ? vec3(0.08, 0.17, 0.18) : vec3(0.22, 0.36, 0.30);
    vec3 body = mix(deepC, shallowC, shallow * (inner > 0.5 || lake ? 0.85 : 0.5));
    vec3 wbase = mix(base, body, closeK);
    float fr = 0.02 + 0.98 * fres;
    colWater = mix(wbase * (0.2 + 0.8 * diff) * uSunColor * max(day, 0.03), skyTint, fr) + uSunColor * spec * day * 1.6;
    float foamBand = smoothstep(0.34, 0.44, cf) * (1.0 - smoothstep(0.44, 0.5, cf));
    float surf = vnoise(vSphere * 260000.0 + vec3(uTime * 0.4, 0.0, -uTime * 0.3));
    float foam = foamBand * smoothstep(0.35, 0.75, surf + 0.25 * sin(uTime * 1.3 + cf * 40.0)) * (lake || inner > 0.5 ? 0.45 : 0.9) * closeK;
    colWater = mix(colWater, vec3(0.85, 0.88, 0.86) * (0.15 + 0.85 * diff) * uSunColor + skyTint * 0.2, foam);
  }
  {
    // below the data resolution: canopy and ground texture so the land does not turn into a flat smear when close
    float nearL = clamp((vDepth - 6.0) / 4.0, 0.0, 1.0);
    float bright = dot(base, vec3(0.33));
    if (nearL > 0.0) {
      vec3 q1 = vSphere * 9000.0, q2 = vSphere * 54000.0, q3 = vSphere * 250000.0;
      float m1 = vnoise(q1), m2 = vnoise(q2), m3 = vnoise(q3);
      float amp = (abs(biome - 2.0) < 0.5) ? 0.22 : 0.55;              // desert sand is smoother than canopy
      amp *= 1.0 - smoothstep(0.45, 0.75, bright);                     // snow and bare rock stay smooth
      float tex = 1.0 + amp * ((m1 - 0.5) * 0.9 + (m2 - 0.5) * 1.1 + (m3 - 0.5) * 0.6);
      base *= mix(1.0, tex, nearL);
      float clearing = smoothstep(0.62, 0.72, m1 * 0.6 + m2 * 0.4) * (1.0 - amp) * nearL;   // proposed: natural clearings
      base = mix(base, base * vec3(1.25, 1.2, 0.85), clearing * 0.5);
    }
    // close to the camera the ground is seen from under the trees: forest floor, moss and litter, not canopy
    bool forest = abs(biome - 1.0) < 0.5 || abs(biome - 3.0) < 0.5 || abs(biome - 6.0) < 0.5;
    vec2 llDeg = vec2(uWindowF.y + vUvW.y * (uWindowF.w - uWindowF.y), uWindowF.x + vUvW.x * (uWindowF.z - uWindowF.x));
    // treeline from the spec's snowline table (biomes.js): no forest floor above it
    float al = abs(llDeg.x);
    float snowL = al < 30.0 ? mix(5000.0, 4000.0, al / 30.0) : al < 45.0 ? mix(4000.0, 2900.0, (al - 30.0) / 15.0) : al < 60.0 ? mix(2900.0, 1650.0, (al - 45.0) / 15.0) : al < 75.0 ? mix(1650.0, 600.0, (al - 60.0) / 15.0) : mix(600.0, 0.0, clamp((al - 75.0) / 15.0, 0.0, 1.0));
    snowL -= abs(biome - 5.0) < 0.5 ? 600.0 : 0.0;          // grey snow hatch on kiros_v5 (biomes.js)
    float treeL = snowL - 900.0;
    float under = (forest && bright < 0.45) ? (1.0 - smoothstep(uFloorDist * 0.6, uFloorDist, distM)) * (1.0 - smoothstep(treeL - 250.0, treeL, vAlt)) : 0.0;
    // Dragon Islands cone: black rock and ash soils (spec); same box as biomes.js isVolcanic()
    float volc = (llDeg.x > 5.0 && llDeg.x < 16.0 && llDeg.y > -32.0 && llDeg.y < -15.0) ? smoothstep(1100.0, 1300.0, vAlt) : 0.0;
    under *= 1.0 - volc;
    // meadows and clearings: the same noise the vegetation uses to thin its big trees (vegetation.js)
    float meadow = under > 0.0 ? smoothstep(0.645, 0.675, vnoise(vec3(llDeg.x * 900.0, llDeg.y * 900.0, 7.7))) : 0.0;
    float shade = 0.0;
    if (under > 0.0) {
      float m = vnoise(vSphere * 900000.0), m2 = vnoise(vSphere * 150000.0);
      vec3 moss = vec3(0.07, 0.10, 0.04), litter = vec3(0.12, 0.085, 0.05), wet = vec3(0.05, 0.07, 0.045);
      vec3 floorC = mix(mix(moss, litter, smoothstep(0.35, 0.7, m)), wet, abs(biome - 3.0) < 0.5 || abs(biome - 6.0) < 0.5 ? 0.6 : 0.0);
      floorC *= 0.8 + 0.4 * m2;
      vec3 grassC = mix(vec3(0.065, 0.105, 0.035), vec3(0.10, 0.125, 0.05), m) * (0.8 + 0.4 * m2);
      base = mix(base, mix(floorC, grassC, meadow), under);
      // the canopy takes most of the direct sun; a few sun flecks get through
      float fleck = smoothstep(0.62, 0.8, vnoise(vSphere * 2400000.0 * 0.25));
      shade = under * (1.0 - meadow) * (0.72 - 0.5 * fleck);
    }
    // a narrow beach or rocky strand on the land side of the shoreline
    float strand = smoothstep(0.46, 0.5, cf) * (1.0 - smoothstep(0.5, 0.6, cf)) * closeK;
    vec3 sand = (vSphere.y < 0.5 && !lake) ? vec3(0.62, 0.56, 0.42) : vec3(0.36, 0.35, 0.33);
    base = mix(base, sand * (0.85 + 0.3 * vnoise(vSphere * 1500000.0)), strand * 0.85);
    // steep ground sheds soil: rock on cliffs and gullies
    float slope = 1.0 - dot(N, n);
    float rock = smoothstep(0.10, 0.30, slope) * nearL;
    // noise in 3D (height included), so cliffs do not smear into vertical streaks
    vec3 q3d = vSphere * (1.0 + vAlt / uRadiusM);
    float strata = vnoise(q3d * 300000.0) * 0.6 + vnoise(q3d * vec3(60000.0, 900000.0, 60000.0)) * 0.4;
    base = mix(base, vec3(0.31, 0.30, 0.28) * (0.72 + 0.5 * strata), rock * 0.85);
    base = mix(base, mix(vec3(0.09, 0.085, 0.08), vec3(0.20, 0.18, 0.16), strata) * (0.85 + 0.3 * vnoise(q3d * 40000.0)), volc * nearL * 0.9);
    // snow lies above the snowline (spec table, proposed), except on the steepest rock; drifts break its lower edge
    float drift = (vnoise(vSphere * 40000.0) - 0.5) * 220.0;
    float snowK = smoothstep(snowL - 120.0, snowL + 120.0, vAlt + drift) * (1.0 - smoothstep(0.35, 0.6, slope));
    base = mix(base, vec3(0.86, 0.88, 0.92) * (0.92 + 0.08 * vnoise(vSphere * 900000.0)), snowK * (vIn > 0.5 ? 1.0 : 0.0));
    float diff = max(dot(N, uSunDir), 0.0) * (1.0 - shade);
    float sky = (0.5 + 0.5 * dot(N, n)) * (1.0 - shade * 0.6);   // slopes facing the sky get more of it
    vec3 skyLight = mix(vec3(0.02, 0.03, 0.06), vec3(0.22, 0.30, 0.42), day) * sky;
    colLand = base * (diff * uSunColor * 1.15 + skyLight);
  }
  vec3 col = mix(colLand, colWater, wf);
  // two moons: faint silver fill on the night side, by phase and height (canon: nights can be bright, double shadows)
  for (int i = 0; i < 2; i++) {
    float md = max(dot(N, uMoonDir[i]), 0.0) * max(dot(n, uMoonDir[i]), 0.0);
    col += base * md * uMoonLight[i] * vec3(0.55, 0.62, 0.75) * (1.0 - day);
  }
  col = applyFog(col, vView, max(vAlt, 0.0), uRadiusM);
  vec3 outC = tonemap(col);
  // a source drawing draped over the ground for comparison (workshop); not part of the world
  if (uOverlayOn > 0.0 && vIn > 0.5) { vec4 ov = texture2D(uOverlay, vUvW); outC = mix(outC, ov.rgb, ov.a * uOverlayOn); }
  gl_FragColor = vec4(outC, 1.0);
  #include <colorspace_fragment>
}
`;

// Single-scattering atmosphere, ray-marched on a shell. Scene unit = planet radius.
export const ATMO_VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
export const ATMO_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunDir; uniform float uSunI, uRAtmos, uExposure, uSkyGain, uHazeGain;
uniform vec3 uKRlh; uniform float uKMie, uShRlh, uShMie, uG;
varying vec3 vWorld;
#define PI 3.141592653589793
#define ISTEPS 16
#define JSTEPS 6

vec2 rsi(vec3 r0, vec3 rd, float sr) {
  float a = dot(rd, rd), b = 2.0 * dot(rd, r0), c = dot(r0, r0) - sr * sr, d = b * b - 4.0 * a * c;
  if (d < 0.0) return vec2(1e5, -1e5);
  float q = sqrt(d); return vec2((-b - q) / (2.0 * a), (-b + q) / (2.0 * a));
}

vec3 atmosphere(vec3 r, vec3 r0, vec3 pSun, float iSun, float rPlanet, float rAtmos, vec3 kRlh, float kMie, float shRlh, float shMie, float g, out float hit) {
  hit = 0.0;
  vec2 p = rsi(r0, r, rAtmos);
  if (p.x > p.y) return vec3(0.0);
  p.x = max(p.x, 0.0);
  vec2 pp = rsi(r0, r, rPlanet);
  if (pp.x > 0.0 && pp.x < pp.y) { p.y = min(p.y, pp.x); hit = 1.0; }
  if (p.y <= p.x) return vec3(0.0);
  float iStepSize = (p.y - p.x) / float(ISTEPS);
  float iTime = p.x + iStepSize * 0.5;
  vec3 totalRlh = vec3(0.0), totalMie = vec3(0.0);
  float iOdRlh = 0.0, iOdMie = 0.0;
  float mu = dot(r, pSun), mumu = mu * mu, gg = g * g;
  float pRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
  float pMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
  for (int i = 0; i < ISTEPS; i++) {
    vec3 iPos = r0 + r * iTime;
    float iHeight = length(iPos) - rPlanet;
    float odStepRlh = exp(-iHeight / shRlh) * iStepSize, odStepMie = exp(-iHeight / shMie) * iStepSize;
    iOdRlh += odStepRlh; iOdMie += odStepMie;
    float jStepSize = rsi(iPos, pSun, rAtmos).y / float(JSTEPS);
    float jTime = jStepSize * 0.5, jOdRlh = 0.0, jOdMie = 0.0;
    for (int j = 0; j < JSTEPS; j++) {
      vec3 jPos = iPos + pSun * jTime;
      float jHeight = length(jPos) - rPlanet;
      jOdRlh += exp(-jHeight / shRlh) * jStepSize; jOdMie += exp(-jHeight / shMie) * jStepSize;
      jTime += jStepSize;
    }
    vec3 attn = exp(-(kMie * (iOdMie + jOdMie) + kRlh * (iOdRlh + jOdRlh)));
    totalRlh += odStepRlh * attn; totalMie += odStepMie * attn;
    iTime += iStepSize;
  }
  return iSun * (pRlh * kRlh * totalRlh + pMie * kMie * totalMie);
}

void main() {
  vec3 rd = normalize(vWorld - cameraPosition);
  float hit;
  vec3 c = atmosphere(rd, cameraPosition, uSunDir, uSunI, 1.0, uRAtmos, uKRlh, uKMie, uShRlh, uShMie, uG, hit);
  // Single scattering alone leaves the open sky dim and the haze over nearby ground strong. Rays that miss the planet
  // (sky) get a gain standing in for multiple scattering and a slight blue cast (ozone); rays that hit it (aerial
  // perspective over the ground) are held back.
  c *= mix(uSkyGain, uHazeGain, hit);
  c *= mix(vec3(0.86, 0.95, 1.1), vec3(1.0), hit);
  c *= uExposure; c = c / (1.0 + c);                     // same curve as the ground, so sky and land sit together
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;
