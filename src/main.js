import * as THREE from 'three';
import { CameraRig } from './controls.js';
import { settings, set, onChange, planet, MOONS } from './settings.js';
import { dir } from './geo.js';
import { Heightfield } from './heightfield.js';
import { Terrain } from './terrain.js';
import { Atmosphere, Moons, makeClouds, makeStars, makeSun, setMoonRadiusCache, skyRadiance } from './sky.js';
import { bindPanel, updateStats, setHud } from './panel.js';
import { PLACES, placeById } from './places.js';
import { biomeName } from './biomes.js';
import { initUi } from './ui.js';
import { Vegetation } from './vegetation.js';

// Logarithmic depth with a scale: the scene unit is a planet radius, so everything near the ground is a tiny
// fraction of a unit and three's log2(1 + w) would be linear there (meters of depth error). log2(1 + w * K) keeps
// sub-millimeter depth precision at arm's length and meters at the far side of the planet.
const LOGDEPTH_K = 1e9, FAR = 400;
THREE.ShaderChunk.logdepthbuf_vertex = THREE.ShaderChunk.logdepthbuf_vertex.replace('vFragDepth = 1.0 + gl_Position.w;', `vFragDepth = 1.0 + gl_Position.w * ${LOGDEPTH_K.toExponential()};`);
THREE.ShaderChunk.logdepthbuf_fragment = THREE.ShaderChunk.logdepthbuf_fragment.replace('log2( vFragDepth ) * logDepthBufFC * 0.5', `log2( vFragDepth ) * ${(1 / Math.log2(1 + FAR * LOGDEPTH_K)).toExponential(8)}`);

const BASE = import.meta.env.BASE_URL;
const status = document.getElementById('status');
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
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
const heightfield = new Heightfield(tex.height.image, meta.web.window_deg, tex.mask.image, tex.coast.image);

// --- world -----------------------------------------------------------------------------------------------
const terrain = new Terrain(tex, meta, heightfield); scene.add(terrain.mesh);
const world = {
  groundAt: (lat, lon, camPos) => terrain.groundAt(lat, lon, camPos),
  isWater: (lat, lon) => heightfield.land(lat, lon) < 0.47,
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
const hooks = { planet: [() => vegetation.clear()], frame: [] };   // later layers (vegetation, sound) register here
export const ctx = { THREE, vegetation, scene, camera, renderer, terrain, heightfield, rig, settings, planet, hooks, sunDir: new THREE.Vector3(), tex, meta };

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
const goPlace = id => { const p = placeById(id); if (p) rig.goTo(p.view); };
bindPanel({ flyTo: goPlace, places: PLACES });
const ui = initUi({ rig, ctx, places: PLACES, goPlace });

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.viewHeight = h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
status.hidden = true;

// --- loop ------------------------------------------------------------------------------------------------
const clock = new THREE.Clock(); let fpsT = 0, fpsN = 0, fps = 60, hudT = 0, fogT = 1;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) set({ clock: false });
const fogA = new THREE.Vector3(), fogB = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpU = new THREE.Vector3();
ctx.fog = { sun: terrain.material.uniforms.uFogSun.value, away: terrain.material.uniforms.uFogAway.value, density: 0, height: 2200, camAlt: 0 };

function updateFog(aslM, dt) {
  const u = terrain.material.uniforms, R = planet().radiusKm * 1000;
  const k = 1 - THREE.MathUtils.smoothstep(aslM, 12e3, 30e3);
  ctx.fog.density = k * 3.2e-5 * settings.atmo * (planet().key === 'small' ? 1.1 : 1);
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
  for (const fn of hooks.frame) fn(dt, { alt, ground, asl, dayK, sunUp });
  renderer.render(scene, camera);

  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const ll = rig.latLon;
    const s = heightfield.sample(ll.lat, ll.lon);
    const where = heightfield.inside(ll.lat, ll.lon) ? biomeName(s, ll.lat, ground, heightfield.land(ll.lat, ll.lon)) : 'open ocean';
    const modeLine = rig.mode === 'survey' ? 'Survey' : `${rig.mode === 'walk' ? 'Walking' : 'Flying'} · speed ${fmtSpeed(rig.speedMul)}`;
    setHud(`${modeLine}\n${fmtAlt(alt)} above ground · ${fmtAlt(ground)} elevation\n${where}\n${fmtLat(ll.lat)} ${fmtLon(ll.lon)}\n${terrain.count} tiles · ${fps.toFixed(0)} fps`);
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
