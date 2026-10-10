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
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex, transparent: true, depthWrite: false, opacity: 0.72 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), m);
  mesh.renderOrder = 2;
  mesh.scale.setScalar(1 + 9000 / (radiusKm * 1000));     // cloud deck about 9 km up
  return mesh;
}

export class Moons {
  constructor(textures) {
    this.group = new THREE.Group();
    this.bodies = MOONS.map((m, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: textures[i], roughness: 1, metalness: 0 }));
      mesh.userData.spec = m; this.group.add(mesh); return mesh;
    });
  }
  // sizes to scale with the chosen planet; orbit radii and periods are proposed
  configure(radiusKm) { for (const b of this.bodies) b.scale.setScalar(b.userData.spec.radiusKm / radiusKm); }
  // days = simulated time in days; returns light factors for the terrain shader
  update(days, sunDir, out) {
    this.bodies.forEach((b, i) => {
      const s = b.userData.spec, a = (days / s.periodDays) * Math.PI * 2 + s.phase0;
      const lat = s.inclination * Math.sin(a), lon = THREE.MathUtils.radToDeg(a);
      dir(lat, lon, b.position).multiplyScalar(s.orbitRadii);
      b.rotation.y = a;
      const d = b.position.clone().normalize();
      const lit = 0.5 + 0.5 * d.dot(sunDir);                    // illuminated fraction as seen from the planet
      const ang = (s.radiusKm / radiusKmCache) / s.orbitRadii;    // apparent size relative to our Moon's
      out.dirs[i].copy(d); out.light[i] = lit * lit * 0.12 * Math.min(1, ang / 0.0045);
    });
  }
}
let radiusKmCache = 1692.7;
export function setMoonRadiusCache(km) { radiusKmCache = km; }
