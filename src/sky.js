import * as THREE from 'three';
import { ATMO_VERT, ATMO_FRAG } from './shaders.js';
import { dir } from './geo.js';
import { MOONS } from './settings.js';

export function makeStars() {
  const n = 5000, a = new Float32Array(n * 3), c = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.randomDirection().multiplyScalar(150); a.set([v.x, v.y, v.z], i * 3);
    const t = Math.random(), w = 0.55 + Math.random() * 0.45;            // a few warm and cool stars
    c.set(t < 0.15 ? [w, w * 0.8, w * 0.6] : t < 0.3 ? [w * 0.75, w * 0.85, w] : [w, w, w], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 0.28, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const p = new THREE.Points(g, m); p.renderOrder = -10; return p;
}

export function makeSun() {
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
  s.renderOrder = -9; return s;
}

export class Atmosphere {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSunI: { value: 8 }, uRAtmos: { value: 1.02 }, uExposure: { value: 1.3 }, uSkyGain: { value: 2.6 }, uHazeGain: { value: 0.7 },
        uKRlh: { value: new THREE.Vector3() }, uKMie: { value: 0 }, uShRlh: { value: 0.001 }, uShMie: { value: 0.0002 }, uG: { value: 0.76 }
      }
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 32), this.material);
    this.mesh.renderOrder = 5;
  }
  // Earth's air (Rayleigh 5.5e-6, 13e-6, 22.4e-6 per m; Mie 21e-6; scale heights 8.5 km and 1.2 km) converted to
  // scene units for the chosen planet radius, times a thickness multiplier (proposed for the small world).
  configure(radiusKm, thickness, density) {
    const R = radiusKm * 1000;
    const shR = 8500 * thickness / R, shM = 1200 * thickness / R;
    const u = this.material.uniforms;
    u.uKRlh.value.set(5.5e-6 * R * density, 13.0e-6 * R * density, 22.4e-6 * R * density); u.uKMie.value = 21e-6 * R * density;
    u.uShRlh.value = shR; u.uShMie.value = shM;
    u.uRAtmos.value = 1 + shR * 10;
    this.mesh.scale.setScalar(u.uRAtmos.value / 1.1);
  }
}

export function makeClouds(tex, radiusKm) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex, transparent: true, depthWrite: false, opacity: 0.72, side: THREE.DoubleSide });   // seen from below too
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), m);
  mesh.renderOrder = 2; mesh.frustumCulled = false;
  mesh.scale.setScalar(1 + 9000 / (radiusKm * 1000));     // cloud deck about 9 km up
  return mesh;
}

// Moons are lit by the sun directly (not by the scene's sunlight, which dims at night for the ground's sake).
function moonMaterial(map, sunDir) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSunDir: { value: sunDir } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uSunDir; varying vec2 vUv; varying vec3 vN;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 c = texture2D(map, vUv).rgb * (max(dot(normalize(vN), uSunDir), 0.0) * 1.25 + 0.015);
        gl_FragColor = vec4(c / (1.0 + c * 0.2), 1.0);
        #include <colorspace_fragment>
      }`
  });
}

export class Moons {
  constructor(textures) {
    this.group = new THREE.Group();
    this.sunDir = new THREE.Vector3(1, 0, 0);
    this.bodies = MOONS.map((m, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), moonMaterial(textures[i], this.sunDir));
      mesh.userData.spec = m; this.group.add(mesh); return mesh;
    });
  }
  // sizes to scale with the chosen planet; orbit radii and periods are proposed
  configure(radiusKm) { for (const b of this.bodies) b.scale.setScalar(b.userData.spec.radiusKm / radiusKm); }
  // days = simulated time in days; returns light factors for the terrain shader
  update(days, sunDir, out) {
    this.sunDir.copy(sunDir);
    this.bodies.forEach((b, i) => {
      const s = b.userData.spec, a = (days / s.periodDays) * Math.PI * 2 + s.phase0;
      const lat = s.inclination * Math.sin(a), lon = THREE.MathUtils.radToDeg(a);
      dir(lat, lon, b.position).multiplyScalar(s.orbitRadii);
      b.rotation.y = a;
      const d = b.position.clone().normalize();
      const lit = 0.5 - 0.5 * d.dot(sunDir);                    // illuminated fraction seen from the planet: full when opposite the sun
      const ang = (s.radiusKm / radiusKmCache) / s.orbitRadii;    // apparent size relative to our Moon's
      out.dirs[i].copy(d); out.light[i] = lit * lit * 0.12 * Math.min(1, ang / 0.0045);
    });
  }
}
let radiusKmCache = 1692.7;
export function setMoonRadiusCache(km) { radiusKmCache = km; }

// CPU copy of the atmosphere shader's scattering, for one ray: the horizon color the ground fog fades into.
// Returns pre-exposure radiance with the same sky gain and ozone tint as the shader applies to rays that miss the planet.
export function skyRadiance(rd, r0, u, out = new THREE.Vector3()) {
  const kR = u.uKRlh.value, kM = u.uKMie.value, shR = u.uShRlh.value, shM = u.uShMie.value, g = u.uG.value, rA = u.uRAtmos.value;
  const pSun = u.uSunDir.value, iSun = u.uSunI.value;
  const rsi = (o, d, sr) => { const b = 2 * o.dot(d), c = o.dot(o) - sr * sr, disc = b * b - 4 * c; if (disc < 0) return [1e5, -1e5]; const q = Math.sqrt(disc); return [(-b - q) / 2, (-b + q) / 2]; };
  let p = rsi(r0, rd, rA);
  if (p[0] > p[1]) return out.set(0, 0, 0);
  p[0] = Math.max(p[0], 0);
  const pp = rsi(r0, rd, 1);
  if (pp[0] > 0 && pp[0] < pp[1]) p[1] = Math.min(p[1], pp[0]);
  const I = 12, J = 4, step = (p[1] - p[0]) / I;
  let t = p[0] + step * 0.5, odR = 0, odM = 0;
  const tr = [0, 0, 0], tm = [0, 0, 0];
  const mu = rd.dot(pSun), gg = g * g;
  const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const pM = 3 / (8 * Math.PI) * ((1 - gg) * (mu * mu + 1)) / (Math.pow(1 + gg - 2 * mu * g, 1.5) * (2 + gg));
  const ip = new THREE.Vector3(), jp = new THREE.Vector3();
  for (let i = 0; i < I; i++) {
    ip.copy(r0).addScaledVector(rd, t);
    const hgt = ip.length() - 1;
    const sR = Math.exp(-hgt / shR) * step, sM = Math.exp(-hgt / shM) * step;
    odR += sR; odM += sM;
    const js = rsi(ip, pSun, rA)[1] / J;
    let jt = js * 0.5, jR = 0, jM = 0;
    for (let j = 0; j < J; j++) { jp.copy(ip).addScaledVector(pSun, jt); const jh = jp.length() - 1; jR += Math.exp(-jh / shR) * js; jM += Math.exp(-jh / shM) * js; jt += js; }
    for (let c = 0; c < 3; c++) {
      const k = c === 0 ? kR.x : c === 1 ? kR.y : kR.z;
      const at = Math.exp(-(kM * (odM + jM) + k * (odR + jR)));
      tr[c] += sR * at; tm[c] += sM * at;
    }
    t += step;
  }
  const gain = u.uSkyGain.value, tint = [0.86, 0.95, 1.1];
  return out.set(
    iSun * (pR * kR.x * tr[0] + pM * kM * tm[0]) * gain * tint[0],
    iSun * (pR * kR.y * tr[1] + pM * kM * tm[1]) * gain * tint[1],
    iSun * (pR * kR.z * tr[2] + pM * kM * tm[2]) * gain * tint[2]);
}
