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
  const gs = []; for (let i = 0; i < skirt.length; i++) gs.push(verts[i * 2], verts[i * 2 + 1], skirt[i]);
  g.setAttribute('aGridS', new THREE.Float32BufferAttribute(gs, 3));          // grid u, v, skirt flag
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
// The window lookup (uv into the regional layers) gets the same treatment: GPU asin/atan are too coarse up close
// (ANGLE on D3D11 is off by ~1e-5 rad, tens of meters), which put the drawn ground meters away from the CPU's.
function taylor(face, u0, v0, size, win) {
  const h = size / 2, cu = u0 + h, cv = v0 + h;
  const f = (du, dv) => dirAt(face, cu + du, cv + dv, [0, 0, 0]);
  const c = f(0, 0), xp = f(h, 0), xm = f(-h, 0), yp = f(0, h), ym = f(0, -h);
  const pp = f(h, h), pm = f(h, -h), mp = f(-h, h), mm = f(-h, -h);
  const uvOf = d => {
    const lat = Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180 / Math.PI, lon = Math.atan2(-d[2], d[0]) * 180 / Math.PI;
    return [(lon - win[0]) / (win[2] - win[0]), (lat - win[1]) / (win[3] - win[1])];
  };
  const U = [c, xp, xm, yp, ym, pp, pm, mp, mm].map(uvOf);
  const uv = new Float32Array(12);
  for (let k = 0; k < 2; k++) {
    uv[k] = U[0][k];
    uv[2 + k] = (U[1][k] - U[2][k]) / size;                               // d/du
    uv[4 + k] = (U[3][k] - U[4][k]) / size;                               // d/dv
    uv[6 + k] = (U[1][k] - 2 * U[0][k] + U[2][k]) / (h * h);              // uu
    uv[8 + k] = (U[5][k] - U[6][k] - U[7][k] + U[8][k]) / (4 * h * h);    // uv
    uv[10 + k] = (U[3][k] - 2 * U[0][k] + U[4][k]) / (h * h);             // vv
  }
  const t = new Float32Array(15);
  for (let k = 0; k < 3; k++) {
    t[k] = (xp[k] - xm[k]) / size;                                   // Ju
    t[3 + k] = (yp[k] - ym[k]) / size;                               // Jv
    t[6 + k] = (xp[k] - 2 * c[k] + xm[k]) / (h * h);                 // Huu
    t[9 + k] = (pp[k] - pm[k] - mp[k] + mm[k]) / (4 * h * h);        // Huv
    t[12 + k] = (yp[k] - 2 * c[k] + ym[k]) / (h * h);                // Hvv
  }
  return { c, t, uv };
}

function linearCopy(t) {
  const c = t.clone(); c.minFilter = c.magFilter = THREE.LinearFilter; c.needsUpdate = true; return c;
}

export class Terrain {
  constructor(textures, meta, heightfield) {
    this.hf = heightfield;
    this.maxTiles = 1400; this.capacity = 3000;
    this.targetPx = 11;                   // split while a tile's grid cells are wider than this on screen (smaller = finer)
    this.maxDepth = 15;
    const w = meta.web.window_deg;
    this.geometry = tileGeometry();
    const inst = (n) => new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    // per tile: aTile (u0, v0, size, depth + 32·face); position Taylor terms packed in aP0..aP4; layer-uv terms in aU0..aU2
    this.attrs = { aTile: inst(4), aP0: inst(4), aP1: inst(4), aP2: inst(4), aP3: inst(4), aP4: inst(2), aU0: inst(4), aU1: inst(4), aU2: inst(4) };
    this.win = [w.lon[0], w.lat[0], w.lon[1], w.lat[1]];
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
        uTime: { value: 0 }, uExposure: { value: 1.3 }, uFloorDist: { value: 1500 }, uOverlay: { value: null }, uOverlayOn: { value: 0 },
        uFogSun: { value: new THREE.Vector3(1, 1, 1) }, uFogAway: { value: new THREE.Vector3(1, 1, 1) }, uFogZenith: { value: new THREE.Vector3(0.3, 0.5, 0.9) },
        uFogDensity: { value: 0 }, uFogHeight: { value: 2200 }, uCamAltM: { value: 0 }, uSunDirF: { value: new THREE.Vector3(1, 0, 0) }
      }
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.count = 0;
    this._v = new THREE.Vector3(); this._c = new THREE.Vector3(); this._c2 = new THREE.Vector3();
    this.radiusM = 1692.7e3;
    this.relief = 1; this.detail = true;
    this.origin = new THREE.Vector3(1, 0, 0);       // local origin (unit direction, double precision)
    this.cache = new Map();
  }

  // swap the regional data layers (terrain source switch)
  setLayers(textures, meta) {
    const u = this.material.uniforms, w = meta.web.window_deg;
    u.uHeight.value = textures.height; u.uHeightSize.value.set(textures.height.image.width, textures.height.image.height);
    u.uCoast.value = textures.coast; u.uCoastSize.value.set(textures.coast.image.width, textures.coast.image.height);
    this._linear = this._linear || new Map();                // one linear-filtered copy per coast texture, reused
    if (!this._linear.has(textures.coast)) this._linear.set(textures.coast, linearCopy(textures.coast));
    u.uCoastL.value = this._linear.get(textures.coast); u.uMask.value = textures.mask; u.uColor.value = textures.color;
    u.uWindow.value.set(w.lon[0], w.lat[0], w.lon[1], w.lat[1]); u.uWindowF.value.copy(u.uWindow.value);
    this.win = [w.lon[0], w.lat[0], w.lon[1], w.lat[1]]; this.cache.clear();
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
    camera.updateMatrixWorld();
    const pxPerUnit = camera.viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));   // screen px per scene unit at distance 1
    const K = this.targetPx * N / pxPerUnit;   // extent/distance ratio at which a cell spans targetPx
    // largest-on-screen first, so the detail lands nearest the camera and the budget is spent where it shows
    const heap = [];
    const push = t => { heap.push(t); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].r >= heap[i].r) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].r > heap[m].r) m = l; if (r < heap.length && heap[r].r > heap[m].r) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    // view frustum: tiles outside it still exist (turning around must not show holes) but get much less of the budget
    this._frustum = this._frustum || new THREE.Frustum(); this._m4 = this._m4 || new THREE.Matrix4(); this._sph = this._sph || new THREE.Sphere();
    const wideCam = this._wide || (this._wide = new THREE.PerspectiveCamera());
    wideCam.copy(camera); wideCam.fov = Math.min(170, camera.fov * 1.25); wideCam.near = 1e-6; wideCam.far = 10; wideCam.updateProjectionMatrix();
    this._frustum.setFromProjectionMatrix(this._m4.multiplyMatrices(wideCam.projectionMatrix, camera.matrixWorldInverse));
    const camLL = latLon(cam);
    const measure = (face, u0, v0, size, depth) => {
      const c = spherify(cubePoint(face, (u0 + size / 2) * 2 - 1, (v0 + size / 2) * 2 - 1, this._v)).normalize();
      const extent = size * 1.5;                                        // chord of a tile on the unit sphere, roughly
      if (c.dot(camDir) < cosHorizon - extent * 0.9) return null;       // below the horizon: cannot be seen
      let h = this.heightAt(c) * relief;
      const roughD = cam.distanceTo(this._c2.copy(c).multiplyScalar(1 + h / this.radiusM));
      if (roughD < 0.012) { const ll = latLon(c); h = this.groundAt(ll.lat, ll.lon, cam); }   // near: the ground actually drawn
      const p = c.multiplyScalar(1 + h / this.radiusM);
      const d = Math.max(1e-9, cam.distanceTo(p));
      let r = extent / d;
      this._sph.set(p, extent * 0.75);
      if (d > extent * 1.2 && !this._frustum.intersectsSphere(this._sph)) r *= 0.2;
      return { face, u0, v0, size, depth, r, near: d < extent * 2.5 };
    };
    void camLL;
    for (let f = 0; f < 6; f++) { const t = measure(f, 0, 0, 1, 0); if (t) push(t); }
    const out = [];
    const hard = Math.min(this.capacity, budget * 1.6);
    while (heap.length) {
      const t = pop();
      const room = out.length + heap.length + 4 <= budget || (t.near && out.length + heap.length + 4 <= hard);   // tiles around the camera always refine
      if (t.depth < this.maxDepth && t.r > K && room) {
        const s = t.size / 2, dp = t.depth + 1;
        for (const [du, dv] of [[0, 0], [s, 0], [0, s], [s, s]]) { const ch = measure(t.face, t.u0 + du, t.v0 + dv, s, dp); if (ch) push(ch); }
      } else out.push(t);
    }

    this._updateOrigin(cam);
    const O = this.origin, A = this.attrs;
    const tile = A.aTile.array, P0 = A.aP0.array, P1 = A.aP1.array, P2 = A.aP2.array, P3 = A.aP3.array, P4 = A.aP4.array;
    const U0 = A.aU0.array, U1 = A.aU1.array, U2 = A.aU2.array;
    if (this.cache.size > 30000) this.cache.clear();
    let n = 0;
    for (const t of out) {
      if (n >= this.capacity) break;
      tile[n * 4] = t.u0; tile[n * 4 + 1] = t.v0; tile[n * 4 + 2] = t.size; tile[n * 4 + 3] = t.depth + 32 * t.face;
      if (t.depth >= DEEP) {
        const key = `${t.face}/${t.depth}/${Math.round(t.u0 / t.size)}/${Math.round(t.v0 / t.size)}`;
        let e = this.cache.get(key);
        if (!e) { e = taylor(t.face, t.u0, t.v0, t.size, this.win); this.cache.set(key, e); }
        const T = e.t, U = e.uv, i4 = n * 4;
        P0[i4] = e.c[0] - O.x; P0[i4 + 1] = e.c[1] - O.y; P0[i4 + 2] = e.c[2] - O.z; P0[i4 + 3] = T[0];   // c, ju.x
        P1[i4] = T[1]; P1[i4 + 1] = T[2]; P1[i4 + 2] = T[3]; P1[i4 + 3] = T[4];                           // ju.yz, jv.xy
        P2[i4] = T[5]; P2[i4 + 1] = T[6]; P2[i4 + 2] = T[7]; P2[i4 + 3] = T[8];                           // jv.z, huu
        P3[i4] = T[9]; P3[i4 + 1] = T[10]; P3[i4 + 2] = T[11]; P3[i4 + 3] = T[12];                        // huv, hvv.x
        P4[n * 2] = T[13]; P4[n * 2 + 1] = T[14];                                                       // hvv.yz
        U0[i4] = U[0]; U0[i4 + 1] = U[1]; U0[i4 + 2] = U[2]; U0[i4 + 3] = U[3];
        U1[i4] = U[4]; U1[i4 + 1] = U[5]; U1[i4 + 2] = U[6]; U1[i4 + 3] = U[7];
        U2[i4] = U[8]; U2[i4 + 1] = U[9]; U2[i4 + 2] = U[10]; U2[i4 + 3] = U[11];
      }
      n++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    for (const a of Object.values(A)) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); }
  }
}
