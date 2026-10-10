import * as THREE from 'three';
import { dir, latLon } from './geo.js';
import { createNav, stepNav, setMode, setPlanetRadius, KeyInput, EYE } from './nav.js';

// One camera, three ways to move it.
//  survey: the camera hangs over a point (lat, lon) at a height above the ground, facing a heading and pitch.
//          Dragging moves the ground under the pointer, the wheel changes height, right-drag (or two fingers) turns
//          and tilts. From orbit it looks straight down; nearer the ground it tilts toward the horizon on its own.
//  walk:   on foot at eye height; WASD, mouse look (pointer lock, or drag), Shift to run, Space to jump.
//  fly:    free flight; WASD along the view, Space/E up, C/Q down, Shift for speed; faster the higher you are.
export class CameraRig {
  constructor(camera, dom, world) {
    this.camera = camera; this.dom = dom;
    this.world = world;            // { groundAt(lat, lon, camPos?) m, isWater(lat, lon), radiusM, gravity }
    this.radiusM = 1692.7e3;
    this.mode = 'survey';
    this.t = { lat: 32, lon: -4, alt: 4.4e6, heading: 0, pitch: -90 };   // survey targets
    this.c = { ...this.t };                                             // survey current (smoothed)
    this.manualPitch = false;
    this.minAlt = 25; this.maxAltRadii = 12;
    this.flight = null; this.after = null;
    this.pointers = new Map(); this.lastPinch = null;
    this.keys = new KeyInput();
    this.nav = null;
    this.listeners = new Set();
    this.lookSens = 0.12;
    this._bind();
  }

  onModeChange(fn) { this.listeners.add(fn); }
  _emit() { for (const fn of this.listeners) fn(this.mode); }

  env() { return { radiusM: this.radiusM, gravity: this.world.gravity(), groundAt: (la, lo) => this.world.groundAt(la, lo), isWater: (la, lo) => this.world.isWater(la, lo), collide: this.mode === 'walk' && this.world.collide ? (la, lo) => this.world.collide(la, lo) : null }; }

  setRadius(m) {
    const ratio = m / this.radiusM; this.radiusM = m;
    this.t.alt = Math.max(this.minAlt, this.t.alt * ratio); this.c.alt = Math.max(this.minAlt, this.c.alt * ratio);
    if (this.flight) { this.flight.from.alt *= ratio; this.flight.to.alt *= ratio; }
    if (this.nav) setPlanetRadius(this.nav, this.env());
  }

  get latLon() { return this.mode === 'survey' ? { lat: this.c.lat, lon: this.c.lon } : { lat: this.nav.lat, lon: this.nav.lon }; }
  get view() {
    if (this.mode === 'survey') return { lat: this.c.lat, lon: this.c.lon, alt: this.c.alt, heading: this.c.heading, pitch: this.c.pitch, mode: 'survey' };
    const g = this.world.groundAt(this.nav.lat, this.nav.lon);
    return { lat: this.nav.lat, lon: this.nav.lon, alt: this.nav.h - g, heading: this.nav.heading, pitch: this.nav.pitch, mode: this.mode };
  }

  autoPitch(alt) {
    const a = Math.log10(Math.max(alt, 1)), lo = Math.log10(3e3), hi = Math.log10(1.2e6);   // 3 km .. 1,200 km
    const s = THREE.MathUtils.clamp((a - lo) / (hi - lo), 0, 1);
    return -12 - 78 * s * s;
  }

  // animated move in survey mode; `then` runs on arrival (e.g. switch to walking)
  flyTo(lat, lon, alt, heading = this.c.heading, pitch = null, then = null) {
    this._toSurvey();
    this.manualPitch = pitch !== null;
    this.flight = { from: { ...this.c }, to: { lat, lon, alt: Math.max(alt, this.minAlt * 0.2), heading, pitch: pitch ?? this.autoPitch(alt) }, s: 0,
      dur: 1.6 + Math.min(3.2, Math.abs(Math.log10(Math.max(alt, 1)) - Math.log10(Math.max(this.c.alt, 1))) * 0.9) };
    this.after = then;
  }

  // go to a saved or preset view, in its own mode
  goTo(v) {
    const mode = v.mode === 'walk' || v.mode === 'fly' ? v.mode : 'survey';
    if (mode === 'survey') return this.flyTo(v.lat, v.lon, v.alt, v.heading ?? 0, v.pitch ?? null);
    const alt = mode === 'walk' ? EYE : Math.max(v.alt, 3);
    this.flyTo(v.lat, v.lon, Math.max(alt, 3), v.heading ?? 0, v.pitch ?? -5, () => this.setMode(mode, { pitch: v.pitch ?? 0, h: mode === 'fly' ? this.world.groundAt(v.lat, v.lon) + v.alt : undefined }));
  }

  _toSurvey() {
    if (this.mode === 'survey') return;
    const v = this.view;
    this.c = { lat: v.lat, lon: v.lon, alt: Math.max(v.alt, this.minAlt), heading: v.heading, pitch: Math.min(v.pitch, 8) };
    this.t = { ...this.c }; this.manualPitch = true;
    this.mode = 'survey'; this.nav = null;
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    this._emit();
  }

  setMode(mode, opts = {}) {
    if (mode === this.mode && !opts.force) return;
    if (mode === 'survey') {
      this._toSurvey();
      if (opts.rise) this.flyTo(this.c.lat, this.c.lon, Math.max(this.c.alt, 2500), this.c.heading, null);
      return;
    }
    const from = this.view;
    if (mode === 'walk' && this.world.clearSpot) Object.assign(from, this.world.clearSpot(from.lat, from.lon));   // not inside a tree
    const env = this.env();
    this.flight = null;
    this.nav = createNav({ lat: from.lat, lon: from.lon, heading: from.heading, pitch: opts.pitch ?? THREE.MathUtils.clamp(from.pitch, -30, 20), mode, env,
      h: mode === 'fly' ? (opts.h ?? this.world.groundAt(from.lat, from.lon) + Math.max(from.alt, 20)) : undefined });
    this.mode = mode;
    this._emit();
  }

  // drop from survey into walking (or flying) at the point under the middle of the screen
  landAtCenter(mode = 'walk') {
    if (this.mode !== 'survey') return this.setMode(mode);
    const hit = this.groundAtScreen(0, 0);
    const target = hit || this.latLon;
    const cur = this.c;
    if (cur.alt < 400 && !hit) return this.setMode(mode);
    const heading = cur.heading;
    this.flyTo(target.lat, target.lon, mode === 'walk' ? 6 : 120, heading, -4, () => this.setMode(mode, { pitch: mode === 'walk' ? 0 : -8 }));
  }

  // ray from the camera through normalized screen point (x, y in -1..1) to the drawn ground; null if it misses
  groundAtScreen(x, y) {
    const cam = this.camera, R = this.radiusM;
    const o = cam.position.clone(), d = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(o).normalize();
    // the planet sphere at the highest ground bounds the march
    const top = 1 + 4600 / R;
    const b = o.dot(d), c = o.lengthSq() - top * top, disc = b * b - c;
    if (disc < 0) return null;
    let t = Math.max(0, -b - Math.sqrt(disc)), tEnd = -b + Math.sqrt(disc);
    const p = new THREE.Vector3();
    const agl = (tt) => { p.copy(o).addScaledVector(d, tt); const ll = latLon(p); return { ll, a: (p.length() - 1) * R - this.world.groundAt(ll.lat, ll.lon) }; };
    let prev = agl(t);
    for (let i = 0; i < 400 && t < tEnd; i++) {
      const step = Math.max(prev.a / R * 0.5, 2 / R);
      const nt = t + step, cur = agl(nt);
      if (cur.a <= 0) {               // refine between t and nt
        let lo = t, hi = nt;
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (agl(m).a > 0) lo = m; else hi = m; }
        return agl(hi).ll;
      }
      t = nt; prev = cur;
    }
    return null;
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('pointerdown', e => {
      d.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey || e.ctrlKey, moved: 0 });
      if (this.mode === 'survey') { this.flight = null; this.after = null; }
    });
    d.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (this.mode !== 'survey') {
        if (document.pointerLockElement !== d) this.keys.look(-dx * this.lookSens * 1.6, dy * this.lookSens * 1.6);   // drag the view
        return;
      }
      if (this.pointers.size === 2) {                                  // pinch: zoom, and two-finger vertical drag tilts
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.lastPinch) { this.zoom(-(dist - this.lastPinch) * 0.012); this.tilt(0, dy * 0.25); }
        this.lastPinch = dist; return;
      }
      if (p.b === 2 || p.shift) this.tilt(dx * 0.25, dy * 0.25); else this.pan(dx, dy);
    });
    const up = e => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.lastPinch = null;
      // a click (not a drag) in walk/fly captures the mouse for looking around
      if (p && p.moved < 4 && this.mode !== 'survey' && e.pointerType === 'mouse' && document.pointerLockElement !== d) {
        try { const r = d.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {}
      }
    };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === d && this.mode !== 'survey') this.keys.look(e.movementX * this.lookSens, -e.movementY * this.lookSens);
    });
    d.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015);
      if (this.mode === 'survey') { this.flight = null; this.after = null; this.zoom(delta); }
      else this.changeSpeed(-delta * 1.5);
    }, { passive: false });
    addEventListener('blur', () => this.keys.blur());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.keys.blur(); });
    addEventListener('keyup', e => this.keys.up(e.code));
    addEventListener('keydown', e => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g') { this.mode === 'walk' ? this.setMode('survey', { rise: true }) : this.landAtCenter('walk'); e.preventDefault(); return; }
      if (k === 'v') { this.mode === 'fly' ? this.setMode('survey') : (this.mode === 'walk' ? this.setMode('fly') : this.landAtCenter('fly')); e.preventDefault(); return; }
      if (k === 'm') { this.setMode('survey', { rise: true }); e.preventDefault(); return; }
      if (k === '[' || k === ']') { this.changeSpeed(k === ']' ? 0.35 : -0.35); e.preventDefault(); return; }
      if (this.mode !== 'survey') {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          this.keys.down(e.code); e.preventDefault();
        }
        return;
      }
      const step = 18; this.flight = null; this.after = null;
      if (k === 'arrowleft' || k === 'a') this.pan(step, 0); else if (k === 'arrowright' || k === 'd') this.pan(-step, 0);
      else if (k === 'arrowup' || k === 'w') this.pan(0, step); else if (k === 'arrowdown' || k === 's') this.pan(0, -step);
      else if (k === '+' || k === '=') this.zoom(-0.6); else if (k === '-' || k === '_') this.zoom(0.6);
      else if (k === 'q') this.tilt(-8, 0); else if (k === 'e') this.tilt(8, 0); else if (k === 'r') this.tilt(0, -6); else if (k === 'f') this.tilt(0, 6);
      else return;
      e.preventDefault();
    });
  }

  changeSpeed(f) { if (this.nav) this.nav.speedMul = THREE.MathUtils.clamp(this.nav.speedMul * Math.exp(f), 1 / 16, 256); }
  get speedMul() { return this.nav ? this.nav.speedMul : 1; }

  // screen pixels -> degrees of ground moved under the pointer, by height
  pan(dx, dy) {
    const h = this.dom.clientHeight || 600;
    const mPerPx = 2 * Math.max(this.t.alt, 30) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / h;
    const degPerPx = mPerPx / this.radiusM * 180 / Math.PI;
    const hd = THREE.MathUtils.degToRad(this.t.heading);
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
    if (this.mode === 'survey') return this._updateSurvey(dt);
    const input = this.keys.read(dt);
    if (this.pad) for (const k of Object.keys(this.pad)) if (this.pad[k]) input[k] = true;   // on-screen buttons
    stepNav(this.nav, input, dt, this.env());
    const n = this.nav;
    const ground = this.world.groundAt(n.lat, n.lon);
    this._place(n.lat, n.lon, n.h, n.heading, n.pitch);
    return { ground, alt: n.h - ground };
  }

  _updateSurvey(dt) {
    const t = this.t, c = this.c;
    if (this.flight) {
      const f = this.flight; f.s = Math.min(1, f.s + dt / f.dur); const s = f.s * f.s * (3 - 2 * f.s);
      t.lat = lerp(f.from.lat, f.to.lat, s); t.lon = lerpAngle(f.from.lon, f.to.lon, s);
      t.alt = Math.exp(lerp(Math.log(f.from.alt), Math.log(f.to.alt), s));
      t.heading = lerpAngle(f.from.heading, f.to.heading, s); t.pitch = lerp(f.from.pitch, f.to.pitch, s);
      if (f.s >= 1) {
        this.flight = null;
        if (this.after) { Object.assign(c, t); const fn = this.after; this.after = null; fn(); return this.update(0); }
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    c.lat += (t.lat - c.lat) * k; c.lon = lerpAngle(c.lon, t.lon, k);
    c.alt = Math.exp(Math.log(c.alt) + (Math.log(t.alt) - Math.log(c.alt)) * k);
    c.heading = lerpAngle(c.heading, t.heading, k); c.pitch += (t.pitch - c.pitch) * k;
    const ground = this.world.groundAt(c.lat, c.lon, this.camera.position);
    this._place(c.lat, c.lon, ground + c.alt, c.heading, c.pitch);
    return { ground, alt: c.alt };
  }

  _place(lat, lon, hASL, heading, pitch) {
    const up = dir(lat, lon);
    this.camera.position.copy(up).multiplyScalar(1 + hASL / this.radiusM);
    const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
    const east = new THREE.Vector3(-Math.sin(l), 0, -Math.cos(l));
    const north = new THREE.Vector3(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l));
    const hd = THREE.MathUtils.degToRad(heading), pt = THREE.MathUtils.degToRad(pitch);
    const look = north.clone().multiplyScalar(Math.cos(hd)).add(east.clone().multiplyScalar(Math.sin(hd))).multiplyScalar(Math.cos(pt)).add(up.clone().multiplyScalar(Math.sin(pt)));
    this.camera.up.copy(pitch < -85 ? north : up);
    this.camera.lookAt(this.camera.position.clone().add(look));
  }
}

function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
function lerp(a, b, s) { return a + (b - a) * s; }
function lerpAngle(a, b, s) { return wrap(a + wrap(b - a) * s); }
export { latLon };
