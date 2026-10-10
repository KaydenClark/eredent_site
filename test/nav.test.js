// Walk and fly behavior of the camera, against a synthetic world. These pin down what the old controls could not do
// (they clamped the camera 60 m above the data surface and moved one step per key press).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNav, stepNav, setMode, setPlanetRadius, groundDistance, EYE, KeyInput } from '../src/nav.js';

const R_SMALL = 1692.7e3, R_EARTH = 6371e3;
const flat = (h = 100) => ({ radiusM: R_SMALL, gravity: 9.81 * 0.27, groundAt: () => h, isWater: () => false });
const idle = () => ({ forward: false, back: false, left: false, right: false, up: false, down: false, run: false, jump: false, lookX: 0, lookY: 0 });
const run = (nav, input, env, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepNav(nav, input, dt, env); };

test('holding forward walks continuously at walking speed in the facing direction', () => {
  const env = flat();
  const nav = createNav({ lat: 30, lon: 10, heading: 90, mode: 'walk', env });
  const start = { lat: nav.lat, lon: nav.lon };
  run(nav, { ...idle(), forward: true }, env, 2);
  const d = groundDistance(start, nav, env.radiusM);
  assert.ok(d > 6 && d < 10, `walked ${d.toFixed(2)} m in 2 s`);
  assert.ok(Math.abs(nav.lat - start.lat) < 1e-6, 'heading 90 is due east: latitude unchanged');
  assert.ok(nav.lon > start.lon);
});

test('releasing the key stops the walker (no drift)', () => {
  const env = flat();
  const nav = createNav({ lat: 30, lon: 10, heading: 0, mode: 'walk', env });
  run(nav, { ...idle(), forward: true }, env, 1);
  run(nav, idle(), env, 1);
  const at = { lat: nav.lat, lon: nav.lon };
  run(nav, idle(), env, 2);
  assert.ok(groundDistance(at, nav, env.radiusM) < 0.01);
});

test('the walker stays at eye height over rising ground', () => {
  // ground rises 1 m per meter north of 30°N (a steep hill)
  const env = { ...flat(), groundAt: (lat) => Math.max(0, (lat - 30) * Math.PI / 180 * R_SMALL) };
  const nav = createNav({ lat: 30, lon: 0, heading: 0, mode: 'walk', env });
  for (let i = 0; i < 180; i++) {
    stepNav(nav, { ...idle(), forward: true }, 1 / 60, env);
    assert.ok(Math.abs(nav.h - (env.groundAt(nav.lat, nav.lon) + EYE)) < 1e-6, `frame ${i}: eye ${nav.h} vs ground ${env.groundAt(nav.lat, nav.lon)}`);
  }
});

test('flying down into a mountain stops above the ground', () => {
  const env = flat(2000);
  const nav = createNav({ lat: 40, lon: 0, heading: 0, pitch: -60, mode: 'fly', h: 2100, env });
  run(nav, { ...idle(), forward: true, down: true, run: true }, env, 10);
  assert.ok(nav.h >= 2000 + nav.clearance - 1e-9, `height ${nav.h}`);
});

test('a long frame (tab switched away) does not teleport the camera', () => {
  const env = flat();
  const nav = createNav({ lat: 30, lon: 10, heading: 0, mode: 'walk', env });
  stepNav(nav, { ...idle(), forward: true, run: true }, 8, env);
  assert.ok(groundDistance({ lat: 30, lon: 10 }, nav, env.radiusM) < 5);
});

test('looking up and down is clamped short of straight up/down', () => {
  const env = flat();
  const nav = createNav({ lat: 30, lon: 10, mode: 'walk', env });
  stepNav(nav, { ...idle(), lookY: 500 }, 1 / 60, env);
  assert.ok(nav.pitch <= 89 && nav.pitch > 80);
  stepNav(nav, { ...idle(), lookY: -1000 }, 1 / 60, env);
  assert.ok(nav.pitch >= -89 && nav.pitch < -80);
});

test('walking across the antimeridian wraps longitude', () => {
  const env = flat();
  const nav = createNav({ lat: 0, lon: 179.99999, heading: 90, mode: 'walk', env });
  run(nav, { ...idle(), forward: true, run: true }, env, 2);
  assert.ok(nav.lon < -179.9 && nav.lon >= -180, `lon ${nav.lon}`);
});

test('changing planet size keeps the place and keeps the walker on the ground', () => {
  const ground = (lat) => 500 + lat;                      // same heights in meters on either planet
  const small = { ...flat(), groundAt: ground }, earth = { ...small, radiusM: R_EARTH, gravity: 9.81 };
  const nav = createNav({ lat: 46, lon: -28, mode: 'walk', env: small });
  setPlanetRadius(nav, earth);
  assert.equal(nav.lat, 46); assert.equal(nav.lon, -28);
  assert.ok(Math.abs(nav.h - (ground(46) + EYE)) < 1e-9);
  const fly = createNav({ lat: 46, lon: -28, mode: 'fly', h: 520, env: small });
  setPlanetRadius(fly, { ...earth, groundAt: () => 600 });  // ground now higher than the flyer
  assert.ok(fly.h >= 600 + fly.clearance);
});

test('switching from fly to walk lands on the ground at eye height', () => {
  const env = flat(321);
  const nav = createNav({ lat: 12, lon: 45, mode: 'fly', h: 5000, env });
  setMode(nav, 'walk', env);
  assert.equal(nav.mode, 'walk');
  assert.ok(Math.abs(nav.h - (321 + EYE)) < 1e-9);
});

test('a jump goes higher and lasts longer in the small world\'s low gravity', () => {
  const jump = (gravity) => {
    const env = { ...flat(0), gravity };
    const nav = createNav({ lat: 0, lon: 0, mode: 'walk', env });
    let peak = 0, airborne = 0;
    stepNav(nav, { ...idle(), jump: true }, 1 / 60, env);
    for (let i = 0; i < 600; i++) {
      stepNav(nav, idle(), 1 / 60, env);
      peak = Math.max(peak, nav.h - EYE);
      if (nav.h - EYE > 1e-6) airborne += 1 / 60;
    }
    assert.ok(Math.abs(nav.h - EYE) < 1e-9, 'lands back on the ground');
    return { peak, airborne };
  };
  const small = jump(9.81 * 0.27), earth = jump(9.81);
  assert.ok(earth.peak > 0.3 && earth.peak < 1.5, `earth jump ${earth.peak}`);
  assert.ok(small.peak > 3 * earth.peak);
  assert.ok(small.airborne > 3 * earth.airborne);
});

test('wading: walking into water keeps the head above the surface and slows down', () => {
  const env = { ...flat(0), isWater: (lat) => lat > 30.00001 };
  const nav = createNav({ lat: 30, lon: 0, heading: 0, mode: 'walk', env });
  run(nav, { ...idle(), forward: true }, env, 4);
  assert.ok(nav.inWater);
  assert.ok(nav.h > 0.2 && nav.h < EYE);
  const before = { lat: nav.lat, lon: nav.lon };
  run(nav, { ...idle(), forward: true }, env, 1);
  const swim = groundDistance(before, nav, env.radiusM);
  assert.ok(swim > 0.5 && swim < 3.5, `swam ${swim} m in 1 s`);
});

test('speed setting scales movement and is bounded', () => {
  const env = flat();
  const a = createNav({ lat: 0, lon: 0, heading: 0, mode: 'fly', h: 300, env });
  const b = createNav({ lat: 0, lon: 0, heading: 0, mode: 'fly', h: 300, env });
  b.speedMul = 4;
  run(a, { ...idle(), forward: true }, env, 1); run(b, { ...idle(), forward: true }, env, 1);
  const da = groundDistance({ lat: 0, lon: 0 }, a, env.radiusM), db = groundDistance({ lat: 0, lon: 0 }, b, env.radiusM);
  assert.ok(db > 3.5 * da && db < 4.5 * da, `${da} vs ${db}`);
  b.speedMul = 1e9; stepNav(b, idle(), 1 / 60, env);
  assert.ok(b.speedMul <= 256);
});

test('keys held when the window loses focus are released', () => {
  const k = new KeyInput();
  k.down('KeyW'); k.down('ShiftLeft');
  assert.equal(k.read().forward, true);
  k.blur();
  const s = k.read();
  assert.equal(s.forward, false); assert.equal(s.run, false);
});

test('look deltas are consumed once', () => {
  const k = new KeyInput();
  k.look(10, -5);
  assert.deepEqual([k.read().lookX, k.read().lookY], [10, 0]);
});

test('walking into a tree trunk stops at its bark instead of passing through', () => {
  // a 4 m-radius trunk 20 m north of the start
  const R = R_SMALL, D = Math.PI / 180;
  const trunk = { lat: 30 + 20 / R / D, lon: 10, r: 4 };
  const collide = (lat, lon) => {
    const dn = (lat - trunk.lat) * D * R, de = (lon - trunk.lon) * D * R * Math.cos(lat * D), d = Math.hypot(dn, de);
    return d < trunk.r + 0.4 ? { dn: dn / (d || 1) * (trunk.r + 0.4 - d), de: de / (d || 1) * (trunk.r + 0.4 - d) } : null;
  };
  const env = { ...flat(), collide };
  const nav = createNav({ lat: 30, lon: 10, heading: 0, mode: 'walk', env });
  run(nav, { ...idle(), forward: true }, env, 10);
  const dn = (nav.lat - trunk.lat) * D * R;
  assert.ok(dn <= -(trunk.r + 0.39), `ended ${(-dn).toFixed(2)} m from the trunk center`);
  // flying ignores trunks (canopies are passable from above)
  const fly = createNav({ lat: 30, lon: 10, heading: 0, mode: 'fly', h: 102, env });
  run(fly, { ...idle(), forward: true }, env, 3);
  assert.ok((fly.lat - trunk.lat) * D * R > 0, 'flew past');
});
