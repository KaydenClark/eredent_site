import * as THREE from 'three';

// Dragons in flight, far off, so they read as wildlife (spec, Feel and life: "flights heading out to sea at dawn and
// back at dusk, small at distance"). Canon: dragons hunt over the open ocean and use the land as nesting ground.
// Their shape, size (about 60 m wingspan here) and numbers are stand-ins, not canon. Silhouettes only.

const D2R = Math.PI / 180;

function dragonGeometry() {
  const body = new THREE.ConeGeometry(1.4, 14, 6); body.rotateX(Math.PI / 2);               // nose toward -z
  const tail = new THREE.ConeGeometry(0.9, 16, 5); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, 14);
  const neck = new THREE.ConeGeometry(0.7, 7, 5); neck.rotateX(Math.PI / 2); neck.translate(0, 0.6, -9);
  return { body: [body, tail, neck] };
}
function wing(side) {
  // a membrane: shoulder at the origin, span outward along x
  const s = side, g = new THREE.BufferGeometry();
  const v = [0, 0, -2.5, s * 9, 0.6, -4, s * 20, 0, 1, 0, 0, 3.5, s * 9, 0.6, -4, s * 20, 0, 1, s * 12, -0.2, 5, 0, 0, 3.5, s * 20, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return g;
}

export class Dragons {
  constructor(scene, count = 5) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.list = [];
    const parts = dragonGeometry();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x111316, side: THREE.DoubleSide, fog: false });
      const d = new THREE.Group();
      for (const p of parts.body) d.add(new THREE.Mesh(p, mat));
      const wl = new THREE.Mesh(wing(-1), mat), wr = new THREE.Mesh(wing(1), mat);
      wl.position.set(-0.8, 0.4, -2); wr.position.set(0.8, 0.4, -2);
      d.add(wl, wr);
      d.traverse(o => { o.frustumCulled = false; });   // the near plane is tiny; three's frustum test is unreliable this close to the planet
      d.userData = { wl, wr, mat, lat: 0, lon: 0, h: 600, heading: 0, speed: 24, phase: Math.random() * 6, turn: 0, alive: false };
      this.list.push(d); this.group.add(d);
    }
    this.radiusM = 1692.7e3; this.t = 0;
  }

  setRadius(m) { this.radiusM = m; for (const d of this.list) d.userData.alive = false; }

  // ctx: { lat, lon, agl, seaward (deg heading toward open water) , localHour, fogColor (THREE.Color, display) }
  update(dt, cam, ctx) {
    this.t += dt;
    const show = ctx.agl < 25000;
    this.group.visible = show; if (!show) return;
    const R = this.radiusM;
    const dawn = ctx.localHour > 4.5 && ctx.localHour < 10, dusk = ctx.localHour > 16 && ctx.localHour < 21;
    const course = dawn ? ctx.seaward : dusk ? ctx.seaward + 180 : null;
    for (const d of this.list) {
      const u = d.userData;
      const dn = (u.lat - ctx.lat) * D2R * R, de = (u.lon - ctx.lon) * D2R * R * Math.cos(ctx.lat * D2R);
      const dist = Math.hypot(dn, de);
      if (!u.alive || dist > 12000) {
        // a new flier, somewhere 1.5–5 km off, toward the sea by day
        const a = ((course ?? ctx.seaward) + (Math.random() - 0.5) * 140) * D2R, r = 1500 + Math.random() * 3500;
        u.lat = ctx.lat + Math.cos(a) * r / R / D2R; u.lon = ctx.lon + Math.sin(a) * r / (R * Math.cos(ctx.lat * D2R)) / D2R;
        u.h = ctx.groundBelow + 150 + Math.random() * 900;
        u.heading = course ?? Math.random() * 360; u.speed = 18 + Math.random() * 14; u.alive = true; u.turn = (Math.random() - 0.5) * 6;
      }
      // fly: hold the course at dawn and dusk, wheel and soar otherwise
      if (course !== null) u.heading += Math.sin(this.t * 0.2 + u.phase) * 2 * dt;
      else u.heading += u.turn * dt;
      const hd = u.heading * D2R;
      u.lat += Math.cos(hd) * u.speed * dt / R / D2R;
      u.lon += Math.sin(hd) * u.speed * dt / (R * Math.cos(u.lat * D2R)) / D2R;
      u.h += Math.sin(this.t * 0.3 + u.phase) * 3 * dt;
      // place and orient in the local frame
      const p = u.lat * D2R, l = u.lon * D2R, up = new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l));
      const east = new THREE.Vector3(-Math.sin(l), 0, -Math.cos(l)), north = new THREE.Vector3().crossVectors(up, east);
      const fwd = north.clone().multiplyScalar(Math.cos(hd)).add(east.clone().multiplyScalar(Math.sin(hd)));
      d.position.copy(up).multiplyScalar(1 + u.h / R);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fwd).negate(), up, fwd.clone().negate());
      d.quaternion.setFromRotationMatrix(m);
      const bank = course === null ? -u.turn * 0.08 : 0;
      d.rotateZ(bank);
      d.scale.setScalar(1.5 / R);
      // slow, heavy wingbeats with glides between
      const beat = Math.sin(this.t * 1.6 + u.phase), glide = 0.5 + 0.5 * Math.sin(this.t * 0.25 + u.phase);
      const flap = beat * 0.55 * (1 - glide * 0.85);
      u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
      // distant ones fade into the haze
      const k = 1 - Math.exp(-dist / 9000);
      u.mat.color.setRGB(0.05, 0.055, 0.065).lerp(ctx.fogColor, k * 0.6);
    }
  }
}
