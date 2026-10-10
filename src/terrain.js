import * as THREE from 'three';
import { cubePoint, spherify, latLon } from './geo.js';
import { TERRAIN_VERT, TERRAIN_FRAG } from './shaders.js';
import { detailAt, detailFade, landWeight } from './heightfield.js';

const N = 32;               // grid cells per tile
const DEEP = 9;             // tiles this deep (≤ 5 km on the small world) are drawn relative to the local origin

function tileGeometry() {
  // (N+1)^2 grid in [0,1]^2 plus a skirt ring one cell outside it
  const verts = [], skirt = [], idx = [];
  const M = N + 2;          // vertices per side including skirt ring = N+3 -> index 0..N+2
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
    const sk = (i === 0 || j === 0 || i === M || j === M) ? 1 : 0;
    verts.push((i - 1) / N, (j - 1) / N); skirt.push(sk);
  }
  const at = (i, j) => j * (M + 1) + i;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('aGrid', new THREE.Float32BufferAttribute(verts, 2));
  g.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts.length / 2 * 3), 3)); // unused, keeps three happy
  g.setIndex(idx);
  return g;
}

// exact cube-to-sphere direction in double precision
const _p = new THREE.Vector3();
function dirAt(face, s, t, out) {
  spherify(cubePoint(face, s * 2 - 1, t * 2 - 1, _p)).normalize();
  out[0] = _p.x; out[1] = _p.y; out[2] = _p.z; return out;
}

// Center and second-order Taylor terms of a tile's mapping, by central differences on a 3×3 stencil (double).
function taylor(face, u0, v0, size) {
  const h = size / 2, cu = u0 + h, cv = v0 + h;
  const f = (du, dv) => dirAt(face, cu + du, cv + dv, [0, 0, 0]);
  const c = f(0, 0), xp = f(h, 0), xm = f(-h, 0), yp = f(0, h), ym = f(0, -h);
  const pp = f(h, h), pm = f(h, -h), mp = f(-h, h), mm = f(-h, -h);
  const t = new Float32Array(15);
  for (let k = 0; k < 3; k++) {
    t[k] = (xp[k] - xm[k]) / size;                                   // Ju
    t[3 + k] = (yp[k] - ym[k]) / size;                               // Jv
    t[6 + k] = (xp[k] - 2 * c[k] + xm[k]) / (h * h);                 // Huu
    t[9 + k] = (pp[k] - pm[k] - mp[k] + mm[k]) / (4 * h * h);        // Huv
    t[12 + k] = (yp[k] - 2 * c[k] + ym[k]) / (h * h);                // Hvv
  }
  return { c, t };
}

function linearCopy(t) {
  const c = t.clone(); c.minFilter = c.magFilter = THREE.LinearFilter; c.needsUpdate = true; return c;
}

export class Terrain {
  constructor(textures, meta, heightfield) {
    this.hf = heightfield;
    this.maxTiles = 1400; this.capacity = 2400;
    this.targetPx = 11;                   // split while a tile's grid cells are wider than this on screen (smaller = finer)
    this.maxDepth = 15;
    const w = meta.web.window_deg;
    this.geometry = tileGeometry();
    const inst = (n) => new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = { aTile: inst(4), aFace: inst(1), aC: inst(3), aJu: inst(3), aJv: inst(3), aHuu: inst(3), aHuv: inst(3), aHvv: inst(3) };
    for (const [k, a] of Object.entries(this.attrs)) this.geometry.setAttribute(k, a);
    this.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uHeight: { value: textures.height }, uHeightSize: { value: new THREE.Vector2(textures.height.image.width, textures.height.image.height) },
        uCoast: { value: textures.coast }, uCoastSize: { value: new THREE.Vector2(textures.coast.image.width, textures.coast.image.height) },
        uMask: { value: textures.mask }, uColor: { value: textures.color }, uCoastL: { value: linearCopy(textures.coast) },
        uWindow: { value: new THREE.Vector4(w.lon[0], w.lat[0], w.lon[1], w.lat[1]) }, uWindowF: { value: new THREE.Vector4(w.lon[0], w.lat[0], w.lon[1], w.lat[1]) },
        uRadiusM: { value: 1692.7e3 }, uRelief: { value: 1 }, uDetail: { value: 1 }, uGridN: { value: N }, uDeep: { value: DEEP },
        uOrigin: { value: new THREE.Vector3(1, 0, 0) }, uCamLocal: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
        uAbyss: { value: new THREE.Color(0.012, 0.045, 0.11) },
        uMoonDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] }, uMoonLight: { value: [0, 0] },
        uTime: { value: 0 }, uExposure: { value: 1.3 }, uFloorDist: { value: 1500 },
        uFogSun: { value: new THREE.Vector3(1, 1, 1) }, uFogAway: { value: new THREE.Vector3(1, 1, 1) },
        uFogDensity: { value: 0 }, uFogHeight: { value: 2200 }, uCamAltM: { value: 0 }, uSunDirF: { value: new THREE.Vector3(1, 0, 0) }
      }
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.count = 0;
    this._v = new THREE.Vector3(); this._c = new THREE.Vector3();
    this.radiusM = 1692.7e3;
    this.relief = 1; this.detail = true;
    this.origin = new THREE.Vector3(1, 0, 0);       // local origin (unit direction, double precision)
    this.cache = new Map();
  }

  setRadius(km) {
    this.radiusM = km * 1000; this.material.uniforms.uRadiusM.value = this.radiusM;
    this.maxDepth = km > 3000 ? 17 : 15;            // about 2.5 m between vertices at the finest level on either planet
  }

  // Height (m) of the data layer under a direction, including lake surfaces; no fractal detail. For the LOD only.
  heightAt(dir) { const ll = latLon(dir); return this.hf.at(ll.lat, ll.lon); }

  // The ground the GPU draws (m above sea level, times relief): shoreline pulled to the water and the fine relief.
  // camPos (scene units) sets the distance fade of the fine relief; omit it to get the full-detail ground.
  groundAt(lat, lon, camPos = null) {
    const g = this.hf.ground(lat, lon);
    const d = this._dirLL(lat, lon);
    let fade = 1;
    if (camPos) {
      const hs = g.h / this.radiusM * this.relief;
      fade = detailFade(Math.hypot(camPos.x - d[0] * (1 + hs), camPos.y - d[1] * (1 + hs), camPos.z - d[2] * (1 + hs)));
    }
    const h = g.h + (this.detail ? detailAt(d[0], d[1], d[2], g.h, landWeight(g.coast), fade) : 0);
    return h * this.relief;
  }
  _dirLL(lat, lon) {
    const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
    return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
  }

  // keep the local origin near the camera; move it only in steps so nothing drawn shifts from frame to frame
  _updateOrigin(cam) {
    const camDir = this._c.copy(cam).normalize();
    const alt = (cam.length() - 1) * this.radiusM;
    const limit = Math.max(1500, alt * 0.5) / this.radiusM;
    if (camDir.distanceTo(this.origin) > limit) this.origin.copy(camDir);
    this.mesh.position.copy(this.origin);
    this.material.uniforms.uOrigin.value.copy(this.origin);
    this.material.uniforms.uCamLocal.value.copy(cam).sub(this.origin);
  }

  update(camera, relief) {
    this.relief = relief;
    const cam = camera.position, camDist = cam.length(), camDir = this._c.copy(cam).normalize();
    const cosHorizon = camDist > 1.0005 ? 1 / camDist : 1;
    const budget = Math.min(this.maxTiles, this.capacity);
    const pxPerUnit = camera.viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));   // screen px per scene unit at distance 1
    const K = this.targetPx * N / pxPerUnit;   // extent/distance ratio at which a cell spans targetPx
    // largest-on-screen first, so the detail lands nearest the camera and the budget is spent where it shows
    const heap = [];
    const push = t => { heap.push(t); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].r >= heap[i].r) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].r > heap[m].r) m = l; if (r < heap.length && heap[r].r > heap[m].r) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const measure = (face, u0, v0, size, depth) => {
      const c = spherify(cubePoint(face, (u0 + size / 2) * 2 - 1, (v0 + size / 2) * 2 - 1, this._v)).normalize();
      const extent = size * 1.5;                                        // chord of a tile on the unit sphere, roughly
      if (c.dot(camDir) < cosHorizon - extent * 0.9) return null;       // below the horizon: cannot be seen
      const h = this.heightAt(c) * relief;
      const d = Math.max(1e-9, cam.distanceTo(c.multiplyScalar(1 + h / this.radiusM)));
      return { face, u0, v0, size, depth, r: extent / d };
    };
    for (let f = 0; f < 6; f++) { const t = measure(f, 0, 0, 1, 0); if (t) push(t); }
    const out = [];
    while (heap.length) {
      const t = pop();
      if (t.depth < this.maxDepth && t.r > K && out.length + heap.length + 4 <= budget) {
        const s = t.size / 2, dp = t.depth + 1;
        for (const [du, dv] of [[0, 0], [s, 0], [0, s], [s, s]]) { const ch = measure(t.face, t.u0 + du, t.v0 + dv, s, dp); if (ch) push(ch); }
      } else out.push(t);
    }

    this._updateOrigin(cam);
    const O = this.origin, A = this.attrs;
    const tile = A.aTile.array, face = A.aFace.array, aC = A.aC.array;
    const ju = A.aJu.array, jv = A.aJv.array, huu = A.aHuu.array, huv = A.aHuv.array, hvv = A.aHvv.array;
    if (this.cache.size > 30000) this.cache.clear();
    let n = 0;
    for (const t of out) {
      if (n >= budget) break;
      tile[n * 4] = t.u0; tile[n * 4 + 1] = t.v0; tile[n * 4 + 2] = t.size; tile[n * 4 + 3] = t.depth; face[n] = t.face;
      if (t.depth >= DEEP) {
        const key = `${t.face}/${t.depth}/${Math.round(t.u0 / t.size)}/${Math.round(t.v0 / t.size)}`;
        let e = this.cache.get(key);
        if (!e) { e = taylor(t.face, t.u0, t.v0, t.size); this.cache.set(key, e); }
        const i3 = n * 3, T = e.t;
        aC[i3] = e.c[0] - O.x; aC[i3 + 1] = e.c[1] - O.y; aC[i3 + 2] = e.c[2] - O.z;
        for (let k = 0; k < 3; k++) { ju[i3 + k] = T[k]; jv[i3 + k] = T[3 + k]; huu[i3 + k] = T[6 + k]; huv[i3 + k] = T[9 + k]; hvv[i3 + k] = T[12 + k]; }
      }
      n++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    for (const a of Object.values(A)) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); }
  }
}
