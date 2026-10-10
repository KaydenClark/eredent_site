import * as THREE from 'three';
import { cubePoint, spherify, latLon } from './geo.js';
import { TERRAIN_VERT, TERRAIN_FRAG } from './shaders.js';

const N = 32;               // grid cells per tile
const MAX_DEPTH = 15;       // about 160 m tiles on the small world (5 m per vertex)

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

export class Terrain {
  constructor(textures, meta, heightfield) {
    this.hf = heightfield;
    this.maxTiles = 1400;
    this.targetPx = 11;                   // split while a tile's grid cells are wider than this on screen (smaller = finer)
    const w = meta.web.window_deg;
    this.geometry = tileGeometry();
    this.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTiles * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.faceAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTiles), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aTile', this.tileAttr);
    this.geometry.setAttribute('aFace', this.faceAttr);
    this.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uHeight: { value: textures.height }, uHeightSize: { value: new THREE.Vector2(textures.height.image.width, textures.height.image.height) },
        uMask: { value: textures.mask }, uColor: { value: textures.color }, uCoast: { value: textures.coast },
        uWindow: { value: new THREE.Vector4(w.lon[0], w.lat[0], w.lon[1], w.lat[1]) },
        uRadiusM: { value: 1692.7e3 }, uRelief: { value: 1 }, uDetail: { value: 1 }, uGridN: { value: N },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
        uAbyss: { value: new THREE.Color(0.012, 0.045, 0.11) },
        uMoonDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] }, uMoonLight: { value: [0, 0] },
        uTime: { value: 0 }, uExposure: { value: 1.3 }
      }
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.count = 0;
    this._v = new THREE.Vector3(); this._c = new THREE.Vector3();
    this.radiusM = 1692.7e3;
  }

  setRadius(km) { this.radiusM = km * 1000; this.material.uniforms.uRadiusM.value = this.radiusM; }

  // Height (m) of the surface under a direction, including lake surfaces; no fractal detail.
  heightAt(dir) { const ll = latLon(dir); return this.hf.at(ll.lat, ll.lon); }

  update(camera, relief) {
    const cam = camera.position, camDist = cam.length(), camDir = this._c.copy(cam).normalize();
    const cosHorizon = camDist > 1.0005 ? 1 / camDist : 1;
    const tiles = this.tileAttr.array, faces = this.faceAttr.array;
    const budget = this.maxTiles;
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
      const d = Math.max(1e-7, cam.distanceTo(c.multiplyScalar(1 + h / this.radiusM)));
      return { face, u0, v0, size, depth, r: extent / d };
    };
    for (let f = 0; f < 6; f++) { const t = measure(f, 0, 0, 1, 0); if (t) push(t); }
    const out = [];
    while (heap.length) {
      const t = pop();
      if (t.depth < MAX_DEPTH && t.r > K && out.length + heap.length + 4 <= budget) {
        const s = t.size / 2, dp = t.depth + 1;
        for (const [du, dv] of [[0, 0], [s, 0], [0, s], [s, s]]) { const ch = measure(t.face, t.u0 + du, t.v0 + dv, s, dp); if (ch) push(ch); }
      } else out.push(t);
    }
    let n = 0;
    for (const { face, u0, v0, size, depth } of out) {
      if (n >= budget) break;
      tiles[n * 4] = u0; tiles[n * 4 + 1] = v0; tiles[n * 4 + 2] = size; tiles[n * 4 + 3] = depth; faces[n] = face; n++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    this.tileAttr.needsUpdate = true; this.faceAttr.needsUpdate = true;
  }
}
