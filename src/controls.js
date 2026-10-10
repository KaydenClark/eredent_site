import * as THREE from 'three';
import { dir, latLon } from './geo.js';

// One camera for the whole descent. The camera hangs over a point on the surface (lat, lon) at a height above the
// ground (alt, meters), facing a heading and pitch. Dragging moves the ground under the pointer, the wheel changes
// height, right-drag (or two fingers) turns and tilts. Above ~1,000 km it looks straight down like an orbital view;
// nearer the ground it tilts toward the horizon on its own unless the viewer has set a tilt.
export class DescentControls {
  constructor(camera, dom, groundAt) {
    this.camera = camera; this.dom = dom; this.groundAt = groundAt;   // groundAt(dirVec) -> meters
    this.radiusM = 1692.7e3;
    this.t = { lat: 32, lon: -4, alt: 4.4e6, heading: 0, pitch: -90 };   // targets
    this.c = { ...this.t };                                             // current (smoothed)
    this.manualPitch = false;
    this.minAlt = 60; this.maxAltRadii = 12;
    this.flight = null;
    this.pointers = new Map(); this.lastPinch = null;
    this._bind();
  }

  setRadius(m) { const ratio = m / this.radiusM; this.radiusM = m; this.t.alt *= ratio; this.c.alt *= ratio; }

  get altitude() { return this.c.alt; }
  get position() { return this.camera.position; }
  get latLon() { return { lat: this.c.lat, lon: this.c.lon }; }

  autoPitch(alt) {
    const a = Math.log10(Math.max(alt, 1)), lo = Math.log10(3e3), hi = Math.log10(1.2e6);   // 3 km .. 1,200 km
    const s = THREE.MathUtils.clamp((a - lo) / (hi - lo), 0, 1);
    return -12 - 78 * s * s;
  }

  flyTo(lat, lon, alt, heading = this.t.heading, pitch = null) {
    this.manualPitch = pitch !== null;
    this.flight = { from: { ...this.c }, to: { lat, lon, alt, heading, pitch: pitch ?? this.autoPitch(alt) }, s: 0,
      dur: 1.6 + Math.min(3, Math.abs(Math.log10(Math.max(alt, 1)) - Math.log10(Math.max(this.c.alt, 1))) * 0.9) };
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('pointerdown', e => { d.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey || e.ctrlKey }); this.flight = null; });
    d.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {                                  // pinch: zoom, and two-finger vertical drag tilts
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.lastPinch) { this.zoom(-(dist - this.lastPinch) * 0.012); this.tilt(0, dy * 0.25); }
        this.lastPinch = dist; return;
      }
      if (p.b === 2 || p.shift) this.tilt(dx * 0.25, dy * 0.25); else this.pan(dx, dy);
    });
    const up = e => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.lastPinch = null; };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    d.addEventListener('wheel', e => { e.preventDefault(); this.flight = null; this.zoom(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)); }, { passive: false });
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase(); const step = 18; this.flight = null;
      if (k === 'arrowleft' || k === 'a') this.pan(step, 0); else if (k === 'arrowright' || k === 'd') this.pan(-step, 0);
      else if (k === 'arrowup' || k === 'w') this.pan(0, step); else if (k === 'arrowdown' || k === 's') this.pan(0, -step);
      else if (k === '+' || k === '=') this.zoom(-0.6); else if (k === '-' || k === '_') this.zoom(0.6);
      else if (k === 'q') this.tilt(-8, 0); else if (k === 'e') this.tilt(8, 0); else if (k === 'r') this.tilt(0, -6); else if (k === 'f') this.tilt(0, 6);
      else return;
      e.preventDefault();
    });
  }

  // screen pixels -> degrees of ground moved under the pointer, by height
  pan(dx, dy) {
    const h = this.dom.clientHeight || 600;
    const mPerPx = 2 * Math.max(this.t.alt, 200) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / h;
    const degPerPx = mPerPx / this.radiusM * 180 / Math.PI;
    const hd = THREE.MathUtils.degToRad(this.t.heading);
    // drag the ground: moving the pointer right moves the view left, relative to the heading
    const fwd = dy * degPerPx, right = -dx * degPerPx;
    const dn = fwd * Math.cos(hd) - right * Math.sin(hd), de = fwd * Math.sin(hd) + right * Math.cos(hd);
    this.t.lat = THREE.MathUtils.clamp(this.t.lat + dn, -89, 89);
    this.t.lon = wrap(this.t.lon + de / Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(this.t.lat))));
  }
  zoom(f) {
    this.t.alt = THREE.MathUtils.clamp(this.t.alt * Math.exp(f), this.minAlt, this.maxAltRadii * this.radiusM);
    if (!this.manualPitch) this.t.pitch = this.autoPitch(this.t.alt);
  }
  tilt(dh, dp) {
    this.t.heading = wrap(this.t.heading + dh);
    if (dp !== 0) { this.manualPitch = true; this.t.pitch = THREE.MathUtils.clamp(this.t.pitch + dp, -89.9, 8); }
  }

  update(dt) {
    const t = this.t, c = this.c;
    if (this.flight) {
      const f = this.flight; f.s = Math.min(1, f.s + dt / f.dur); const s = f.s * f.s * (3 - 2 * f.s);
      t.lat = lerp(f.from.lat, f.to.lat, s); t.lon = lerpAngle(f.from.lon, f.to.lon, s);
      t.alt = Math.exp(lerp(Math.log(f.from.alt), Math.log(f.to.alt), s));
      t.heading = lerpAngle(f.from.heading, f.to.heading, s); t.pitch = lerp(f.from.pitch, f.to.pitch, s);
      if (f.s >= 1) this.flight = null;
    }
    const k = 1 - Math.exp(-dt * 9);
    c.lat += (t.lat - c.lat) * k; c.lon = lerpAngle(c.lon, t.lon, k);
    c.alt = Math.exp(Math.log(c.alt) + (Math.log(t.alt) - Math.log(c.alt)) * k);
    c.heading = lerpAngle(c.heading, t.heading, k); c.pitch += (t.pitch - c.pitch) * k;

    const up = dir(c.lat, c.lon);
    const ground = Math.max(0, this.groundAt(up));
    const r = 1 + (ground + c.alt) / this.radiusM;
    this.camera.position.copy(up).multiplyScalar(r);
    const p = THREE.MathUtils.degToRad(c.lat), l = THREE.MathUtils.degToRad(c.lon);
    const east = new THREE.Vector3(-Math.sin(l), 0, -Math.cos(l));
    const north = new THREE.Vector3(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l));
    const hd = THREE.MathUtils.degToRad(c.heading), pt = THREE.MathUtils.degToRad(c.pitch);
    const look = north.clone().multiplyScalar(Math.cos(hd)).add(east.clone().multiplyScalar(Math.sin(hd))).multiplyScalar(Math.cos(pt)).add(up.clone().multiplyScalar(Math.sin(pt)));
    this.camera.up.copy(c.pitch < -85 ? north : up);
    this.camera.lookAt(this.camera.position.clone().add(look));
    return { ground, alt: c.alt };
  }
}

function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
function lerp(a, b, s) { return a + (b - a) * s; }
function lerpAngle(a, b, s) { return wrap(a + wrap(b - a) * s); }
export { latLon };
