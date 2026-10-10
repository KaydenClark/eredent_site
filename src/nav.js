// Walking and flying on the sphere. Pure state and math (no DOM, no three.js) so it runs under node:test.
// Position is latitude and longitude in degrees (double precision) and h, meters above sea level. Heading is degrees
// clockwise from north, pitch degrees above the horizon.

export const EYE = 1.7;              // standing eye height, m
const WADE_EYE = 0.55;               // head above the water while wading or swimming
const WALK = 4.2, FLY = 40;          // base speeds, m/s
const MAX_DT = 0.1;                  // longer frames (a hidden tab) are clamped: no teleporting through terrain
const D2R = Math.PI / 180;

export function createNav({ lat, lon, heading = 0, pitch = 0, mode = 'walk', h, env }) {
  const nav = { lat, lon, heading, pitch, mode, h: h ?? 0, vel: { e: 0, n: 0, u: 0 }, vz: 0, onGround: true, inWater: false,
    speedMul: 1, clearance: 2.5 };
  setMode(nav, mode, env);
  if (mode === 'fly' && h !== undefined) nav.h = Math.max(h, env.groundAt(lat, lon) + nav.clearance);
  return nav;
}

export function setMode(nav, mode, env) {
  nav.mode = mode; nav.vz = 0; nav.vel = { e: 0, n: 0, u: 0 };
  if (mode === 'walk') settle(nav, env);
  else if (mode === 'fly') nav.h = Math.max(nav.h, env.groundAt(nav.lat, nav.lon) + nav.clearance);
  return nav;
}

// planet size changed: the place (lat, lon) and heights in meters stay, the camera is put back on or above the ground
export function setPlanetRadius(nav, env) {
  if (nav.mode === 'walk') settle(nav, env);
  else nav.h = Math.max(nav.h, env.groundAt(nav.lat, nav.lon) + nav.clearance);
}

function settle(nav, env) {
  const g = env.groundAt(nav.lat, nav.lon);
  nav.inWater = !!env.isWater?.(nav.lat, nav.lon);
  nav.h = g + (nav.inWater ? WADE_EYE : EYE); nav.onGround = true; nav.vz = 0;
}

export const wrapLon = a => ((a + 180) % 360 + 360) % 360 - 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function stepNav(nav, input, dt, env) {
  dt = Math.min(Math.max(dt, 0), MAX_DT);
  nav.speedMul = clamp(nav.speedMul, 1 / 16, 256);
  nav.heading = ((nav.heading + (input.lookX || 0)) % 360 + 360) % 360;
  nav.pitch = clamp(nav.pitch + (input.lookY || 0), -89, 89);

  const hd = nav.heading * D2R, pt = nav.pitch * D2R;
  const fwdE = Math.sin(hd), fwdN = Math.cos(hd), rightE = Math.cos(hd), rightN = -Math.sin(hd);
  const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0), az = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const ay = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const R = env.radiusM;
  let te = 0, tn = 0, tu = 0;

  if (nav.mode === 'walk') {
    const ground0 = env.groundAt(nav.lat, nav.lon);
    nav.inWater = !!env.isWater?.(nav.lat, nav.lon);
    let speed = WALK * nav.speedMul * (input.run ? 3 : 1) * (nav.inWater ? 0.45 : 1);
    const len = Math.hypot(ax, az) || 1;
    te = (fwdE * az + rightE * ax) / len * speed; tn = (fwdN * az + rightN * ax) / len * speed;
    const k = 1 - Math.exp(-dt * (nav.onGround ? 12 : 2));        // little steering in the air
    nav.vel.e += (te - nav.vel.e) * k; nav.vel.n += (tn - nav.vel.n) * k;
    if (Math.abs(nav.vel.e) < 1e-4 && te === 0) nav.vel.e = 0;
    if (Math.abs(nav.vel.n) < 1e-4 && tn === 0) nav.vel.n = 0;
    move(nav, nav.vel.e * dt, nav.vel.n * dt, R);
    // trunks: pushed back out to the bark, sliding along it
    const push = env.collide?.(nav.lat, nav.lon);
    if (push) {
      move(nav, push.de, push.dn, R);
      const l = Math.hypot(push.de, push.dn) || 1, into = (nav.vel.e * push.de + nav.vel.n * push.dn) / l;
      if (into < 0) { nav.vel.e -= into * push.de / l; nav.vel.n -= into * push.dn / l; }
    }
    const ground = env.groundAt(nav.lat, nav.lon);
    nav.inWater = !!env.isWater?.(nav.lat, nav.lon);
    const eye = nav.inWater ? WADE_EYE : EYE;
    if (input.jump && nav.onGround && !nav.inWater) { nav.vz = 4; nav.onGround = false; }
    if (!nav.onGround) {
      nav.vz -= env.gravity * dt;
      nav.h += nav.vz * dt;
      if (nav.h <= ground + eye) { nav.h = ground + eye; nav.vz = 0; nav.onGround = true; }
    } else nav.h = ground + eye;
    void ground0;
  } else if (nav.mode === 'fly') {
    const agl = Math.max(0, nav.h - env.groundAt(nav.lat, nav.lon));
    const speed = FLY * nav.speedMul * (input.run ? 5 : 1) * clamp(agl / 150, 1, 400);   // faster when high up
    const cp = Math.cos(pt), sp = Math.sin(pt);
    const len = Math.hypot(ax, az, ay) || 1;
    te = (fwdE * cp * az + rightE * ax) / len * speed;
    tn = (fwdN * cp * az + rightN * ax) / len * speed;
    tu = (sp * az + ay) / len * speed;
    const k = 1 - Math.exp(-dt * 5);
    nav.vel.e += (te - nav.vel.e) * k; nav.vel.n += (tn - nav.vel.n) * k; nav.vel.u += (tu - nav.vel.u) * k;
    for (const c of ['e', 'n', 'u']) if (Math.abs(nav.vel[c]) < 1e-4) nav.vel[c] = 0;
    move(nav, nav.vel.e * dt, nav.vel.n * dt, R);
    nav.h += nav.vel.u * dt;
    const floor = env.groundAt(nav.lat, nav.lon) + nav.clearance;
    if (nav.h < floor) { nav.h = floor; if (nav.vel.u < 0) nav.vel.u = 0; }
    nav.h = Math.min(nav.h, R * 3);
  }
  return nav;
}

// move east/north by meters along the surface
function move(nav, de, dn, R) {
  if (!de && !dn) return;
  const lat = nav.lat + dn / R / D2R;
  nav.lon = wrapLon(nav.lon + de / (R * Math.max(1e-6, Math.cos(nav.lat * D2R))) / D2R);
  nav.lat = clamp(lat, -89.999, 89.999);
}

// great-circle distance between two {lat, lon}, meters
export function groundDistance(a, b, R) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Keyboard state for continuous movement. Physical key codes, so it works on any keyboard layout.
const BIND = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA'], right: ['KeyD'],
  up: ['Space', 'KeyE'], down: ['KeyC', 'KeyQ'], run: ['ShiftLeft', 'ShiftRight'], jump: ['Space'],
  turnL: ['ArrowLeft'], turnR: ['ArrowRight']
};
export class KeyInput {
  constructor() { this.keys = new Set(); this.lx = 0; this.ly = 0; }
  down(code) { this.keys.add(code); }
  up(code) { this.keys.delete(code); }
  blur() { this.keys.clear(); this.lx = 0; this.ly = 0; }
  look(dx, dy) { this.lx += dx; this.ly += dy; }
  has(action) { return BIND[action].some(c => this.keys.has(c)); }
  get active() { return this.keys.size > 0; }
  // one frame of input; look deltas are consumed
  read(dt = 0) {
    const turn = ((this.has('turnR') ? 1 : 0) - (this.has('turnL') ? 1 : 0)) * 90 * dt;   // arrow keys turn, 90°/s
    const s = { forward: this.has('forward'), back: this.has('back'), left: this.has('left'), right: this.has('right'),
      up: this.has('up'), down: this.has('down'), run: this.has('run'), jump: this.has('jump'), lookX: this.lx + turn, lookY: this.ly };
    this.lx = 0; this.ly = 0;
    return s;
  }
}
