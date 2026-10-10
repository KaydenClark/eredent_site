import * as THREE from 'three';
import { CameraRig } from './controls.js';
import { settings, set, onChange, planet, MOONS } from './settings.js';
import { dir } from './geo.js';
import { Heightfield } from './heightfield.js';
import { Terrain } from './terrain.js';
import { Atmosphere, Moons, makeClouds, makeStars, makeSun, setMoonRadiusCache, skyRadiance } from './sky.js';
import { bindPanel, updateStats, setHud } from './panel.js';
import { PLACES, SCENIC, placeById } from './places.js';
import { biomeName, evidenceFor } from './biomes.js';
import { initUi } from './ui.js';
import { Vegetation } from './vegetation.js';
import { Ambience } from './audio.js';
import { Dragons } from './dragons.js';
import { zoneAt } from './biomes.js';

// Logarithmic depth with a scale: the scene unit is a planet radius, so everything near the ground is a tiny
// fraction of a unit and three's log2(1 + w) would be linear there (meters of depth error). log2(1 + w * K) keeps
// sub-millimeter depth precision at arm's length and meters at the far side of the planet.
const LOGDEPTH_K = 1e9, FAR = 400;
THREE.ShaderChunk.logdepthbuf_vertex = THREE.ShaderChunk.logdepthbuf_vertex.replace('vFragDepth = 1.0 + gl_Position.w;', `vFragDepth = 1.0 + gl_Position.w * ${LOGDEPTH_K.toExponential()};`);
THREE.ShaderChunk.logdepthbuf_fragment = THREE.ShaderChunk.logdepthbuf_fragment.replace('log2( vFragDepth ) * logDepthBufFC * 0.5', `log2( vFragDepth ) * ${(1 / Math.log2(1 + FAR * LOGDEPTH_K)).toExponential(8)}`);

const BASE = import.meta.env.BASE_URL;
const status = document.getElementById('status');
const canvas = document.getElementById('view');

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }); }
catch (e) { status.textContent = 'Kiros needs WebGL 2 with hardware acceleration. Turn on graphics acceleration in the browser settings and reload.'; throw e; }
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); status.hidden = false; status.textContent = 'The graphics context was lost (driver reset or memory pressure). Reload the page to continue; your notes are saved.'; });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * settings.quality);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 2e-6, FAR);

// --- load layers -----------------------------------------------------------------------------------------
let meta;
try { meta = await fetch(BASE + 'data/kiros_meta.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }
catch (e) { status.textContent = 'The map data did not load. Is the dev server running? Reload to try again.'; throw e; }
const loader = new THREE.TextureLoader();
const loadTex = (name, opts = {}) => new Promise((res, rej) => loader.load(BASE + 'textures/' + name, t => {
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.data) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; }
  else if (opts.linear) { t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; }
  else { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  res(t);
}, undefined, rej));

let tex;
try {
  const [color, height, mask, coast, clouds, m1, m2] = await Promise.all([
    loadTex('kiros_region_color_8k.jpg', { srgb: true }), loadTex('kiros_region_height16_4k.png', { data: true }),
    loadTex('kiros_region_mask_4k.png', { data: true }), loadTex('kiros_region_coast_4k.png', { data: true }), loadTex('kiros_clouds_2k.png', { srgb: true }),
    loadTex(MOONS[0].texture, { srgb: true }), loadTex(MOONS[1].texture, { srgb: true })
  ]);
  tex = { color, height, mask, coast, clouds, moons: [m1, m2] };
} catch (e) {
  status.textContent = 'The map layers did not load. Reload the page to try again.'; throw e;
}
status.textContent = 'Reading the heights…';
await new Promise(r => setTimeout(r, 10));
let heightfield = new Heightfield(tex.height.image, meta.web.window_deg, tex.mask.image, tex.coast.image);

// --- world -----------------------------------------------------------------------------------------------
const terrain = new Terrain(tex, meta, heightfield); scene.add(terrain.mesh);
const world = {
  groundAt: (lat, lon, camPos) => terrain.groundAt(lat, lon, camPos),
  isWater: (lat, lon) => heightfield.land(lat, lon) < 0.47,
  collide: (lat, lon) => vegetation.group.visible ? vegetation.collide(lat, lon) : null,
  clearSpot: (lat, lon) => vegetation.clearSpot(lat, lon),
  gravity: () => 9.81 * planet().gravity
};
const rig = new CameraRig(camera, canvas, world);
const atmosphere = new Atmosphere(); scene.add(atmosphere.mesh);
const stars = makeStars(); scene.add(stars);
const sunMesh = makeSun(); scene.add(sunMesh);
const sunLight = new THREE.DirectionalLight(0xfff4e6, 1.7); scene.add(sunLight); scene.add(sunLight.target);
const ambient = new THREE.HemisphereLight(0x9fb8d8, 0x2a3020, 0.5); scene.add(ambient);
const clouds = makeClouds(tex.clouds, planet().radiusKm); scene.add(clouds);
const moons = new Moons(tex.moons); scene.add(moons.group);
const moonLight = { dirs: [new THREE.Vector3(), new THREE.Vector3()], light: [0, 0] };

const vegetation = new Vegetation({ terrain, heightfield, scene, planet, quality: settings.quality });
const dragons = new Dragons(scene, 5);
const hooks = { planet: [() => vegetation.clear(), p => dragons.setRadius(p.radiusKm * 1000)], frame: [] };   // later layers (vegetation, sound) register here
export const ctx = { THREE, vegetation, scene, camera, renderer, terrain, heightfield, rig, settings, planet, hooks, sunDir: new THREE.Vector3(), tex, meta };

// --- terrain source: the September penup build, or the Oct 10 revision built as a variant -------------------
// Both stay inspectable; switching swaps the regional layers in place. Neither choice is a canon decision.
const terrainSets = { sept: Promise.resolve({ tex, meta, hf: heightfield }) };
ctx.terrainSource = 'sept';
async function loadVariant(name) {
  const dir = name + '/';
  const m = await fetch(BASE + `data/kiros_meta_${name}.json`).then(r => { if (!r.ok) throw new Error('missing'); return r.json(); });
  const [color, height, mask, coast] = await Promise.all([
    loadTex(dir + 'kiros_region_color_8k.jpg', { srgb: true }), loadTex(dir + 'kiros_region_height16_4k.png', { data: true }),
    loadTex(dir + 'kiros_region_mask_4k.png', { data: true }), loadTex(dir + 'kiros_region_coast_4k.png', { data: true })]);
  const t = { ...tex, color, height, mask, coast };
  return { tex: t, meta: m, hf: new Heightfield(height.image, m.web.window_deg, mask.image, coast.image) };
}
let sourceReq = 0;
ctx.setTerrainSource = async name => {
  const req = ++sourceReq;
  if (!terrainSets[name]) terrainSets[name] = loadVariant(name);
  let set;
  try { set = await terrainSets[name]; } catch (e) { delete terrainSets[name]; throw e; }
  if (req !== sourceReq) return false;                      // a later switch won
  heightfield = set.hf; ctx.heightfield = set.hf; terrain.hf = set.hf; vegetation.hf = set.hf;
  terrain.setLayers(set.tex, set.meta, set.hf);
  ctx.terrainSource = name; vegetation.clear();
  for (const [id, v] of [['ts-sept', 'sept'], ['ts-oct10', 'oct10']]) document.getElementById(id)?.setAttribute('aria-pressed', String(name === v));
  if (rig.nav) rig.setMode(rig.mode, { force: true });     // stand on the new ground
  const note = document.getElementById('ts-note');
  if (note) { note.hidden = name !== 'oct10'; note.textContent = name === 'oct10' ? 'Showing the Oct 10 outline built as a variant: its lakes and mountain marks, the same coastline. A what-if for comparison, not a canon decision. See docs/oct10-variant.md.' : ''; }
  return true;
};

function applyPlanet() {
  const p = planet();
  terrain.setRadius(p.radiusKm); rig.setRadius(p.radiusKm * 1000);
  atmosphere.configure(p.radiusKm, p.atmosphereScale, p.airDensity * settings.atmo);
  moons.configure(p.radiusKm); setMoonRadiusCache(p.radiusKm);
  clouds.scale.setScalar(1 + 9000 / (p.radiusKm * 1000));
  updateStats(p, settings);
  for (const fn of hooks.planet) fn(p);
}
function applySettings() {
  terrain.material.uniforms.uRelief.value = settings.relief;
  terrain.material.uniforms.uDetail.value = settings.detail ? 1 : 0;
  terrain.detail = settings.detail;
  clouds.visible = settings.clouds; moons.group.visible = settings.moons;
  terrain.maxTiles = Math.round(1400 * Math.max(0.5, settings.quality));
}
applyPlanet(); applySettings();
window.kiros = ctx;   // debug hook
onChange((s, patch) => {
  if ('size' in patch || 'atmo' in patch) applyPlanet();
  if ('relief' in patch || 'detail' in patch || 'quality' in patch) { vegetation.quality = settings.quality; vegetation.clear(); }
  if ('quality' in patch) { renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * settings.quality); resize(); }
  applySettings();
});

// --- time and sun ----------------------------------------------------------------------------------------
let simDays = 0;                                   // simulated time, for the moons
const sunDir = ctx.sunDir;
function updateSun() {
  const decl = settings.tiltDeg * Math.sin(settings.season * Math.PI * 2);
  const lon = (12 - settings.hour) * 15;           // noon at the prime meridian, which runs through the middle of the cluster
  dir(decl, lon, sunDir);
  sunMesh.position.copy(sunDir).multiplyScalar(230);
  terrain.material.uniforms.uSunDir.value.copy(sunDir);
  terrain.material.uniforms.uSunDirF.value.copy(sunDir);
  atmosphere.material.uniforms.uSunDir.value.copy(sunDir);
}

// --- camera ----------------------------------------------------------------------------------------------
rig.t.lat = 32; rig.t.lon = -4; rig.t.alt = 4.4e6; rig.t.pitch = -90; Object.assign(rig.c, rig.t);
// face toward the nearest water, or down the slope (the open view), from the data around a point
function faceHeading(lat, lon, how) {
  const R = planet().radiusKm * 1000, D = Math.PI / 180;
  let best = 0, bestV = Infinity;
  for (let a = 0; a < 360; a += 10) {
    let v = 0;
    for (const d of how === 'water' ? [150, 400, 900, 1600] : [400, 1200, 3000]) {
      const la = lat + Math.cos(a * D) * d / R / D, lo = lon + Math.sin(a * D) * d / (R * Math.cos(lat * D)) / D;
      v += how === 'water' ? heightfield.land(la, lo) : terrain.groundAt(la, lo);
    }
    if (v < bestV) { bestV = v; best = a; }
  }
  return best;
}
let placeReq = 0;
const goPlace = async id => {
  const p = placeById(id); if (!p) return;
  const req = ++placeReq;
  // places tied to one terrain source switch to it (the Oct 10 lake only exists in the variant)
  if (p.terrain && ctx.terrainSource !== p.terrain) { try { if (!(await ctx.setTerrainSource(p.terrain))) return; } catch { return; } }
  if (req !== placeReq) return;                             // the visitor already went somewhere else
  const v = { ...p.view };
  let faced = false;
  if (v.mode === 'walk' && heightfield.land(v.lat, v.lon) < 0.5) {   // a walking start in water: go to the nearest shore, face the water
    const R = planet().radiusKm * 1000, D = Math.PI / 180;
    search: for (let r = 100; r < 40000; r += 100) for (let a = 0; a < 360; a += 10) {
      const la = v.lat + Math.cos(a * D) * r / R / D, lo = v.lon + Math.sin(a * D) * r / (R * Math.cos(v.lat * D)) / D;
      if (heightfield.land(la, lo) >= 0.5) { v.lat = la; v.lon = lo; v.heading = (a + 180) % 360; faced = true; break search; }
    }
  }
  if (p.face === 'down') {    // stand at the edge with the biggest drop within ~2.5 km and look down it
    const R = planet().radiusKm * 1000, D = Math.PI / 180; let best = -1e9;
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
      const la = v.lat + i * 200 / R / D, lo = v.lon + j * 200 / (R * Math.cos(v.lat * D)) / D, h = terrain.groundAt(la, lo);
      for (let a = 0; a < 360; a += 30) {
        const at = m => terrain.groundAt(la + Math.cos(a * D) * m / R / D, lo + Math.sin(a * D) * m / (R * Math.cos(la * D)) / D);
        const near = h - at(300), mid = h - at(900);
        if (near < 15 || mid < near) continue;                        // the ground must fall away from the feet
        const drop = h - at(2500) + 2 * near + 0.15 * h;
        if (drop > best) { best = drop; v.lat = la; v.lon = lo; v.heading = a; }
      }
    }
    faced = true;
  }
  if (typeof p.face === 'string' && !faced) v.heading = faceHeading(v.lat, v.lon, p.face);
  const towardWater = v.heading;
  if (p.faceOffset) v.heading = (v.heading + p.faceOffset) % 360;   // look along the shore: water and land both in view
  if (p.face === 'water') {   // walk on to the strand, a few meters short of the water
    const R = planet().radiusKm * 1000, D = Math.PI / 180, a = towardWater * D;
    for (let d = 0; d < 4000; d += 10) {
      const la = v.lat + Math.cos(a) * 10 / R / D, lo = v.lon + Math.sin(a) * 10 / (R * Math.cos(v.lat * D)) / D;
      if (heightfield.land(la, lo) < 0.482) break;
      v.lat = la; v.lon = lo;
    }
  }
  if (p.local !== undefined) { set({ hour: ((p.local - v.lon / 15) % 24 + 24) % 24, clock: false }); document.getElementById('clock').checked = false; ui.syncClock(settings.hour); }
  rig.goTo(v);
};
ctx.goPlace = goPlace;
// drape a registered source drawing (ink lines and lake fills) over the globe: 'penup' | 'earth_re' | null
const overlays = {};
ctx.setOverlay = (name, opacity = 0.85) => {
  const u = terrain.material.uniforms;
  if (!name) { u.uOverlayOn.value = 0; return Promise.resolve(); }
  const file = { penup: 'overlay_penup_window.png', earth_re: 'overlay_earth_re_window.png' }[name];
  if (!file) return Promise.resolve();
  const p = overlays[name] || (overlays[name] = loadTex(file, { srgb: true }).then(t => { t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; }));
  return p.then(t => { u.uOverlay.value = t; u.uOverlayOn.value = opacity; ctx.overlay = { name, opacity }; })
    .catch(() => { u.uOverlayOn.value = 0; delete overlays[name]; console.warn('overlay not available:', file); });
};
bindPanel({ flyTo: goPlace, places: PLACES, scenic: SCENIC });
const ui = initUi({ rig, ctx, places: PLACES, goPlace });
const ALL_PLACES = [...SCENIC, ...PLACES];
// The workshop shows Kayden's private source maps and lore, so it only runs from the local dev server: a production
// build (GitHub Pages) leaves the module, its thumbnails and the Drive references out entirely.
let workshop = { open() { alert('The workshop runs on the local dev server only (npm run dev), so the private sources stay off the public site.'); }, close() {}, isOpen: () => false };
if (import.meta.env.DEV) {
  const { mountWorkshop } = await import('./workshop/workshop.js');
  workshop = mountWorkshop({
    getView: () => rig.view,
    flyTo: view => { const p = ALL_PLACES.find(q => q.view === view); p ? goPlace(p.id) : rig.goTo(view); if (innerWidth < 1400) workshop.close(); },
    places: ALL_PLACES,
    setOverlay: (name, opacity) => ctx.setOverlay(name, opacity),
    onOpenChange: open => { document.body.classList.toggle('ws-open', open); if (open && document.pointerLockElement) document.exitPointerLock(); rig.keys.blur(); }
  });
}
ctx.workshop = workshop;
{
  const a = document.getElementById('ts-sept'), b = document.getElementById('ts-oct10'), note = document.getElementById('ts-note');
  const sync = () => { a.setAttribute('aria-pressed', String(ctx.terrainSource === 'sept')); b.setAttribute('aria-pressed', String(ctx.terrainSource === 'oct10')); };
  const go = async name => {
    placeReq++;                                            // cancels a pending quick start
    note.hidden = false; note.textContent = 'Loading…';
    try {
      await ctx.setTerrainSource(name);
      note.textContent = name === 'oct10' ? 'Showing the Oct 10 outline built as a variant: its lakes and mountain marks, the same coastline. A what-if for comparison, not a canon decision. See docs/oct10-variant.md.' : '';
      note.hidden = name !== 'oct10';
    } catch { note.textContent = 'The Oct 10 variant has not been built on this machine yet (public/textures/oct10/).'; }
    sync();
  };
  a.onclick = () => go('sept'); b.onclick = () => go('oct10');
}

// --- lighting looks: sunrise, midday, golden hour, a night with both moons up --------------------------------
const LOOKS = ['sunrise', 'noon', 'golden', 'moons'];
function applyLook(name) {
  const { lat, lon } = rig.latLon, D = Math.PI / 180;
  const decl = settings.tiltDeg * Math.sin(settings.season * Math.PI * 2);
  const c = -Math.tan(lat * D) * Math.tan(decl * D);
  const h0 = c <= -1 ? 12 : c >= 1 ? 0 : Math.acos(c) / D / 15;      // half day length, hours
  const local = { sunrise: 12 - h0 + 0.25, noon: 12.4, golden: 12 + h0 - 0.7, moons: 12 + Math.min(h0 + 2.5, 11.5) }[name];
  if (local === undefined) return;
  const hour = ((local - lon / 15) % 24 + 24) % 24;
  set({ hour, clock: false }); document.getElementById('clock').checked = false; ui.syncClock(hour);
  if (name === 'moons') {
    // find the soonest time both moons stand well above this horizon and are at least half lit
    updateSun();
    const up = dir(lat, lon), probe = { dirs: [new THREE.Vector3(), new THREE.Vector3()], light: [0, 0] };
    let best = simDays, bestS = -1;
    for (let d = 0; d < 60; d += 0.02) {
      moons.update(simDays + d, sunDir, probe);
      const a = probe.dirs[0].dot(up), b = probe.dirs[1].dot(up);
      const la = 0.5 - 0.5 * probe.dirs[0].dot(sunDir), lb = 0.5 - 0.5 * probe.dirs[1].dot(sunDir);
      const score = Math.min(a, b) + 0.6 * Math.min(la, lb) + 0.2 * (la + lb);
      if (score > bestS) { bestS = score; best = simDays + d; }
    }
    simDays = best;
    // turn toward the pair
    moons.update(simDays, sunDir, probe);
    const m = probe.dirs[0].clone().add(probe.dirs[1]).normalize();
    const l = lon * D, p = lat * D;
    const east = new THREE.Vector3(-Math.sin(l), 0, -Math.cos(l)), north = new THREE.Vector3(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l));
    const el0 = Math.asin(Math.min(1, probe.dirs[0].dot(up))) / D, el1 = Math.asin(Math.min(1, probe.dirs[1].dot(up))) / D;
    const heading = Math.atan2(m.dot(east), m.dot(north)) / D, pitch = Math.max(-5, Math.min(35, Math.max(el0, el1) - camera.fov * 0.32));
    if (rig.nav) { rig.nav.heading = (heading + 360) % 360; rig.nav.pitch = pitch; }
    else { rig.t.heading = rig.c.heading = heading; rig.t.pitch = rig.c.pitch = Math.max(-89, Math.min(8, pitch)); rig.manualPitch = true; }
  }
}
ctx.applyLook = applyLook;
{
  const look = document.getElementById('look');
  look.onchange = () => { applyLook(look.value); look.value = ''; };
  let li = -1;
  addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key.toLowerCase() === 'l') { li = (li + 1) % LOOKS.length; applyLook(LOOKS[li]); e.preventDefault(); }
    if (e.key.toLowerCase() === 'b' && !workshop.isOpen()) {         // bookmark this view: opens the notebook's form
      if (document.pointerLockElement) document.exitPointerLock();
      workshop.open('notebook');
      setTimeout(() => { const b = [...document.querySelectorAll('.ws button')].find(x => x.textContent.trim() === 'Bookmark this view'); b?.click(); }, 50);
      e.preventDefault();
    }
  });
}

// --- sound -----------------------------------------------------------------------------------------------
const ambience = new Ambience(); ctx.ambience = ambience;
{
  const b = document.getElementById('m-sound'), vol = document.getElementById('vol');
  vol.value = ambience.volume;
  const sync = () => { b.setAttribute('aria-pressed', String(ambience.on)); b.textContent = ambience.on ? 'Sound on' : 'Sound off'; vol.hidden = !ambience.on; };
  b.onclick = async () => { if (ambience.on) ambience.disable(); else { try { await ambience.enable(); } catch { b.textContent = 'No audio'; return; } } sync(); };
  vol.oninput = () => ambience.setVolume(+vol.value);
  sync();
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.viewHeight = h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
status.hidden = true;

// --- loop ------------------------------------------------------------------------------------------------
let dragonT = 0, seaward = 0; const dragonFog = new THREE.Color();
const clock = new THREE.Clock(); let fpsT = 0, fpsN = 0, fps = 60, hudT = 0, fogT = 1;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) set({ clock: false });
const fogA = new THREE.Vector3(), fogB = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpU = new THREE.Vector3();
ctx.fog = { sun: terrain.material.uniforms.uFogSun.value, away: terrain.material.uniforms.uFogAway.value, density: 0, height: 1500, camAlt: 0 };

function updateFog(aslM, dt) {
  const u = terrain.material.uniforms, R = planet().radiusKm * 1000;
  const k = 1 - THREE.MathUtils.smoothstep(aslM, 12e3, 30e3);
  // proposed in the spec: mist in the valleys at dawn, fog over the cold northern seas; crisp over the snow ranges
  const ll = rig.latLon, local = ((settings.hour + ll.lon / 15) % 24 + 24) % 24;
  const decl = settings.tiltDeg * Math.sin(settings.season * Math.PI * 2), D = Math.PI / 180;
  const cH = -Math.tan(ll.lat * D) * Math.tan(decl * D), sunrise = 12 - (cH <= -1 ? 12 : cH >= 1 ? 0 : Math.acos(cH) / D / 15);
  const dawn = Math.exp(-(((local - sunrise - 0.6) / 1.3) ** 2));
  const coldSea = ll.lat > 55 && heightfield.land(ll.lat, ll.lon) < 0.5 ? 1 : 0;
  const mist = Math.max(dawn * (settings.weather === false ? 0 : 1), coldSea * 0.8);
  ctx.fog.height = 1500 * (1 - 0.65 * mist);
  ctx.fog.density = k * 3.2e-5 * settings.atmo * (planet().key === 'small' ? 1.1 : 1) * (1 + 3 * mist);
  ctx.fog.camAlt = aslM;
  u.uFogDensity.value = ctx.fog.density; u.uCamAltM.value = aslM; u.uFogHeight.value = ctx.fog.height;
  fogT += dt;
  if (k > 0 && fogT > 0.2) {
    fogT = 0;
    // horizon radiance toward the sun's azimuth and away from it, 1.5° above the horizon
    const up = tmpU.copy(camera.position).normalize();
    const flat = tmpV.copy(sunDir).addScaledVector(up, -sunDir.dot(up));
    if (flat.lengthSq() < 1e-8) flat.set(1, 0, 0).addScaledVector(up, -up.x);
    flat.normalize();
    const e = Math.sin(THREE.MathUtils.degToRad(1.5));
    const dA = flat.clone().multiplyScalar(Math.sqrt(1 - e * e)).addScaledVector(up, e);
    const dB = flat.clone().multiplyScalar(-Math.sqrt(1 - e * e)).addScaledVector(up, e);
    skyRadiance(dA, camera.position, atmosphere.material.uniforms, fogA);
    skyRadiance(dB, camera.position, atmosphere.material.uniforms, fogB);
    u.uFogSun.value.copy(fogA); u.uFogAway.value.copy(fogB);
    const zen = up.clone().multiplyScalar(0.92).addScaledVector(flat, -0.39).normalize();   // ~67° up, away from the sun
    skyRadiance(zen, camera.position, atmosphere.material.uniforms, u.uFogZenith.value);
    void R;
  }
}

function frame(forcedDt) {
  const dt = forcedDt ?? Math.min(clock.getDelta(), 0.1);
  if (settings.clock) {
    const dh = dt * settings.clockRate / 3600;
    settings.hour = (settings.hour + dh) % settings.dayHours; simDays += dh / settings.dayHours;
    ui.syncClock(settings.hour);
  }
  updateSun();
  moons.update(simDays, sunDir, moonLight);
  terrain.material.uniforms.uMoonDir.value[0].copy(moonLight.dirs[0]); terrain.material.uniforms.uMoonDir.value[1].copy(moonLight.dirs[1]);
  terrain.material.uniforms.uMoonLight.value = moonLight.light;
  terrain.material.uniforms.uTime.value += dt;
  clouds.rotation.y += dt * 0.0015;

  const { alt, ground } = rig.update(dt);
  const R = planet().radiusKm * 1000;
  const asl = (camera.position.length() - 1) * R;
  // near plane follows the height above ground: 5 cm when standing, larger when high up
  const near = THREE.MathUtils.clamp(alt * 0.04, 0.05, 20000) / R;
  if (Math.abs(near - camera.near) / camera.near > 0.05) { camera.near = near; camera.updateProjectionMatrix(); }
  // inside the air the open sky gets more gain (standing in for multiple scattering); from orbit the limb stays thin
  const au = atmosphere.material.uniforms;
  au.uSkyGain.value = THREE.MathUtils.lerp(5.2, 2.2, THREE.MathUtils.smoothstep(asl, 15e3, 160e3));
  // below ~30 km the ground's own height fog takes over the aerial perspective; the shell then only draws the sky
  au.uHazeGain.value = 0.7 * THREE.MathUtils.smoothstep(asl, 12e3, 30e3);
  atmosphere.material.depthTest = asl < 12e3;
  updateFog(asl, dt);
  // sunlight for lit (non-terrain) objects follows the sun and dims at night
  const upC = tmpU.copy(camera.position).normalize();
  const sunUp = sunDir.dot(upC);
  const dayK = THREE.MathUtils.smoothstep(sunUp, -0.1, 0.2);
  sunLight.position.copy(camera.position).addScaledVector(sunDir, 1);
  sunLight.target.position.copy(camera.position);
  sunLight.intensity = 2.2 * dayK;
  sunLight.color.setRGB(1, 0.75 + 0.22 * THREE.MathUtils.smoothstep(sunUp, 0, 0.4), 0.55 + 0.4 * THREE.MathUtils.smoothstep(sunUp, 0, 0.5));
  ambient.intensity = 0.08 + 0.75 * dayK;
  ambient.position.copy(upC);
  // stars fade out under a daylit sky
  stars.material.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(sunUp, -0.15, 0.12));

  terrain.update(camera, settings.relief);
  vegetation.uniforms.uDay.value = dayK;
  vegetation.update(dt, camera, rig.latLon, alt);
  terrain.material.uniforms.uFloorDist.value = vegetation.group.visible ? vegetation._radius('trees') * 0.92 : 0;
  for (const fn of hooks.frame) fn(dt, { alt, ground, asl, dayK, sunUp });
  {
    const ll = rig.latLon;
    dragonT -= dt;
    if (dragonT <= 0) { dragonT = 2; seaward = heightfield.inside(ll.lat, ll.lon) ? faceHeading(ll.lat, ll.lon, 'water') : seaward; }
    const e = settings.atmo, fa = terrain.material.uniforms.uFogAway.value;
    dragonFog.setRGB(fa.x * 1.3 / (1 + fa.x * 1.3), fa.y * 1.3 / (1 + fa.y * 1.3), fa.z * 1.3 / (1 + fa.z * 1.3));
    void e;
    dragons.visibleWanted = settings.wildlife !== false;
    dragons.group.visible = dragons.visibleWanted;
    if (dragons.visibleWanted) dragons.update(dt, camera, { lat: ll.lat, lon: ll.lon, agl: alt, seaward, localHour: ((settings.hour + ll.lon / 15) % 24 + 24) % 24, fogColor: dragonFog, groundBelow: Math.max(0, ground) });
  }
  if (ambience.on) {
    const ll = rig.latLon, coast = heightfield.land(ll.lat, ll.lon), smp = heightfield.sample(ll.lat, ll.lon);
    const shore = coast >= 0.47 ? 1 - THREE.MathUtils.smoothstep(coast, 0.47, 0.66) : THREE.MathUtils.smoothstep(coast, 0.2, 0.47) * (smp.inner > 0.5 ? 0.6 : 1);
    const v = rig.nav ? Math.hypot(rig.nav.vel.e, rig.nav.vel.n, rig.nav.vel.u) : 0;
    ambience.update(dt, { zone: heightfield.inside(ll.lat, ll.lon) ? zoneAt(smp.biome, ll.lat, ground / settings.relief, coast, ll.lon) : 'water', agl: alt, shore, day: dayK, altitude: asl, speed: v });
  }
  renderer.render(scene, camera);

  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const ll = rig.latLon;
    const s = heightfield.sample(ll.lat, ll.lon);
    const where = heightfield.inside(ll.lat, ll.lon) ? biomeName(s, ll.lat, ground / settings.relief, heightfield.land(ll.lat, ll.lon), ll.lon) : 'open ocean';
    const modeLine = rig.mode === 'survey' ? 'Survey' : `${rig.mode === 'walk' ? 'Walking' : 'Flying'} · speed ${fmtSpeed(rig.speedMul)}`;
    const ev = heightfield.inside(ll.lat, ll.lon) ? evidenceFor(s, ll.lat, ground / settings.relief, heightfield.land(ll.lat, ll.lon), ctx.terrainSource, ll.lon) : 'open ocean beyond the mapped window';
    setHud(`${modeLine}\n${fmtAlt(alt)} above ground · ${fmtAlt(ground)} elevation\n${where}\n${ev}\n${fmtLat(ll.lat)} ${fmtLon(ll.lon)} · ${planet().key === 'small' ? 'small world' : 'Earth-sized'}\n${terrain.count} tiles · ${fps.toFixed(0)} fps`);
    ctx.fps = fps;
  }
}
renderer.setAnimationLoop(() => frame());
// debug: run frames synchronously (for automated checks when the tab is not being painted)
ctx.tick = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); return rig.view; };

function fmtAlt(m) { const a = Math.abs(m), s = m < 0 ? '−' : ''; return a >= 10000 ? `${s}${(a / 1000).toFixed(0)} km` : a >= 1000 ? `${s}${(a / 1000).toFixed(1)} km` : `${s}${a.toFixed(a < 10 ? 1 : 0)} m`; }
function fmtLat(v) { return `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'N' : 'S'}`; }
function fmtLon(v) { return `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'E' : 'W'}`; }
function fmtSpeed(m) { return m >= 1 ? `×${m.toFixed(m < 10 ? 1 : 0)}` : `×${m.toFixed(2)}`; }
