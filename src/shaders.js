import { GLSL_GEO } from './geo.js';

export const GLSL_NOISE = /* glsl */`
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// Shared by vertex and fragment: window lookup and 16-bit height decode.
export const GLSL_LAYERS = /* glsl */`
uniform sampler2D uHeight; uniform vec2 uHeightSize;
uniform vec4 uWindow;          // lon0, lat0, lon1, lat1 (deg)
uniform float uRadiusM;        // planet radius in meters (scene unit = 1 radius)

vec2 windowUv(vec2 ll) { return vec2((ll.y - uWindow.x) / (uWindow.z - uWindow.x), (ll.x - uWindow.y) / (uWindow.w - uWindow.y)); }
float inWindow(vec2 uv) { vec2 d = step(vec2(0.0), uv) * step(uv, vec2(1.0)); return d.x * d.y; }
float decodeH(vec2 uv) { vec4 t = texture2D(uHeight, uv); return floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5) - 6000.0; }
float sampleH(vec2 uv) {
  vec2 s = uv * uHeightSize - 0.5; vec2 i = floor(s); vec2 f = s - i; vec2 o = 1.0 / uHeightSize; vec2 b = (i + 0.5) * o;
  return mix(mix(decodeH(b), decodeH(b + vec2(o.x, 0.0)), f.x), mix(decodeH(b + vec2(0.0, o.y)), decodeH(b + o), f.x), f.y);
}
`;

export const TERRAIN_VERT = /* glsl */`
precision highp float;
attribute vec2 aGrid; attribute float aSkirt;
attribute vec4 aTile;          // u0, v0, size, depth   (instance)
attribute float aFace;         // cube face             (instance)
uniform float uRelief, uDetail, uGridN;
uniform sampler2D uMask;
varying vec3 vNormal, vWorld, vSphere; varying vec2 vUvW; varying float vIn, vDepth, vAlt; varying vec3 vLocal;
#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_GEO}
${GLSL_NOISE}
${GLSL_LAYERS}

// no clamp here: neighbour samples just past the tile edge keep the normals continuous across tiles
vec3 tileDir(vec2 g) { vec2 st = aTile.xy + g * aTile.z; return normalize(spherify(cubePoint(aFace, st * 2.0 - 1.0))); }

// fractal relief below the data resolution: ~4 km, 850 m, 210 m and 53 m wavelengths on the small world. Land only.
// Faded by distance to the camera (continuous across tile edges), never by tile level.
float detail(vec3 n, float h, float land, float fade) {
  if (fade <= 0.0 || land < 0.5) return 0.0;
  float rugged = smoothstep(700.0, 2600.0, h);                      // the ranges are broken ground, the lowlands gentle
  float ridge = 1.0 - abs(vnoise(n * 425.0) * 2.0 - 1.0);           // ridged, for the mountains
  float d = (ridge - 0.5) * 220.0 * rugged
          + (vnoise(n * 2000.0) - 0.5) * (40.0 + 60.0 * rugged)
          + (vnoise(n * 8000.0) - 0.5) * (14.0 + 16.0 * rugged)
          + (vnoise(n * 32000.0) - 0.5) * 8.0;
  return d * fade * uDetail;
}

vec3 surfacePoint(vec2 g, out float h, out vec2 uvW, out float inW) {
  vec3 n = tileDir(g);
  uvW = windowUv(latLon(n)); inW = inWindow(uvW);
  h = inW > 0.5 ? sampleH(uvW) : 0.0;
  float land = inW > 0.5 ? texture2D(uMask, uvW).b * 255.0 : 0.0;   // biome index: 0 ocean, 4 lake
  land = (land > 0.5 && abs(land - 4.0) > 0.5) ? 1.0 : 0.0;
  float dcam = distance(cameraPosition, n * (1.0 + h / uRadiusM * uRelief));
  float fade = 1.0 - smoothstep(0.03, 0.12, dcam);                 // full detail within ~50 km, gone by ~200 km (small world)
  h += detail(n, h, land, fade);
  return n * (1.0 + h / uRadiusM * uRelief);
}

void main() {
  float e = 1.0 / uGridN;
  float h, h1, h2; vec2 uvW, t1, t2; float inW, i1, i2;
  vec2 g = aSkirt > 0.5 ? clamp(aGrid, 0.0, 1.0) : aGrid;        // skirt vertices sit on the edge, then drop
  vec3 p = surfacePoint(g, h, uvW, inW);
  vec3 p1 = surfacePoint(g + vec2(e, 0.0), h1, t1, i1);
  vec3 p2 = surfacePoint(g + vec2(0.0, e), h2, t2, i2);
  vec3 n = normalize(p);
  vec3 N = normalize(cross(p1 - p, p2 - p));
  if (dot(N, n) < 0.0) N = -N;
  if (aSkirt > 0.5) p -= n * (aTile.z * 0.04);     // skirts hide the hairline cracks between LOD levels
  vNormal = N; vSphere = n; vUvW = uvW; vIn = inW; vDepth = aTile.w; vAlt = h;
  vLocal = vec3(aTile.xy + clamp(aGrid, 0.0, 1.0) * aTile.z, aFace);   // face coordinates: precise enough for meter-scale noise
  vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

export const TERRAIN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uColor, uMask;
uniform vec3 uSunDir, uSunColor, uAbyss;
uniform vec3 uMoonDir[2]; uniform float uMoonLight[2];
uniform float uTime, uExposure;
varying vec3 vNormal, vWorld, vSphere; varying vec2 vUvW; varying float vIn, vDepth, vAlt; varying vec3 vLocal;
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}

vec3 tonemap(vec3 c) { c *= uExposure; return c / (1.0 + c); }

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vSphere); vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = uAbyss; float biome = 0.0, depth = 5200.0, inner = 0.0;
  if (vIn > 0.5) {
    base = texture2D(uColor, vUvW).rgb;
    vec4 m = texture2D(uMask, vUvW);
    depth = m.r * 5500.0; inner = m.g; biome = floor(m.b * 255.0 + 0.5);
  }
  bool water = biome < 0.5 || abs(biome - 4.0) < 0.5;
  float sunUp = dot(n, uSunDir);                              // -1 night .. 1 noon, by the sphere normal
  float day = smoothstep(-0.12, 0.25, sunUp);

  vec3 col;
  if (water) {
    // small procedural ripple so the surface catches the sun; stronger swell on the deep outer ocean (canon: hostile)
    // calm inside the protected seas and lakes, long heavy swell on the deep outer ocean (canon)
    bool lake = abs(biome - 4.0) < 0.5;
    float swell = (lake || inner > 0.5) ? 0.022 : mix(0.03, 0.075, smoothstep(150.0, 1500.0, depth));
    vec3 nn = n;
    float near = clamp((vDepth - 5.0) / 3.0, 0.0, 1.0);
    if (near > 0.0) {
      vec3 q1 = vec3(vLocal.xy * 24000.0, vLocal.z * 7.0) + vec3(uTime * 0.05, uTime * 0.03, 0.0);   // ~110 m waves
      vec3 q2 = vec3(vLocal.xy * 180000.0, vLocal.z * 7.0) + vec3(-uTime * 0.25, uTime * 0.2, 0.0); // ~15 m ripple
      vec2 w = (vec2(vnoise(q1), vnoise(q1 + 3.7)) - 0.5) * 2.0 + (vec2(vnoise(q2), vnoise(q2 + 5.1)) - 0.5) * 0.8;
      vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), n)); vec3 ey = cross(n, ex);   // tangent plane
      nn = normalize(n + (ex * w.x + ey * w.y) * swell * near);
    }
    float fres = pow(1.0 - max(dot(nn, V), 0.0), 5.0);
    vec3 R = reflect(-uSunDir, nn);
    float spec = pow(max(dot(R, V), 0.0), mix(600.0, 90.0, 1.0 - inner)) * mix(0.9, 0.45, 1.0 - inner);
    vec3 skyTint = mix(vec3(0.05, 0.09, 0.16), vec3(0.35, 0.55, 0.85), day);
    float diff = max(dot(nn, uSunDir), 0.0);
    col = base * (0.04 + 0.96 * diff) * uSunColor + skyTint * (0.08 + 0.35 * fres) * day + uSunColor * spec * day * 1.6;
  } else {
    // below the data resolution: canopy and ground texture so the land does not turn into a flat smear when close
    float near = clamp((vDepth - 6.0) / 4.0, 0.0, 1.0);
    if (near > 0.0) {
      // the two coarser octaves use the sphere position (seamless across cube faces); only the finest uses face coordinates
      vec3 q1 = vSphere * 9000.0, q2 = vSphere * 54000.0, q3 = vec3(vLocal.xy * 420000.0, vLocal.z * 7.0);
      float m1 = vnoise(q1), m2 = vnoise(q2), m3 = vnoise(q3);
      float bright = dot(base, vec3(0.33));
      float amp = (abs(biome - 2.0) < 0.5) ? 0.22 : 0.55;              // desert sand is smoother than canopy
      amp *= 1.0 - smoothstep(0.45, 0.75, bright);                     // snow and bare rock stay smooth
      float tex = 1.0 + amp * ((m1 - 0.5) * 0.9 + (m2 - 0.5) * 1.1 + (m3 - 0.5) * 0.6);
      base *= mix(1.0, tex, near);
      float clearing = smoothstep(0.62, 0.72, m1 * 0.6 + m2 * 0.4) * (1.0 - amp) * near;   // proposed: natural clearings
      base = mix(base, base * vec3(1.25, 1.2, 0.85), clearing * 0.5);
    }
    float diff = max(dot(N, uSunDir), 0.0);
    float sky = 0.5 + 0.5 * dot(N, n);                        // slopes facing the sky get more of it
    vec3 skyLight = mix(vec3(0.02, 0.03, 0.06), vec3(0.22, 0.30, 0.42), day) * sky;
    col = base * (diff * uSunColor * 1.15 + skyLight);
  }
  // two moons: faint silver fill on the night side, by phase and height (canon: nights can be bright, double shadows)
  for (int i = 0; i < 2; i++) {
    float md = max(dot(N, uMoonDir[i]), 0.0) * max(dot(n, uMoonDir[i]), 0.0);
    col += base * md * uMoonLight[i] * vec3(0.55, 0.62, 0.75) * (1.0 - day);
  }
  gl_FragColor = vec4(tonemap(col), 1.0);
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
