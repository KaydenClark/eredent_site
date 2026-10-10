import * as THREE from 'three';
import { DescentControls } from './controls.js';
import { settings, set, onChange, planet, MOONS } from './settings.js';
import { dir, latLon } from './geo.js';
import { Heightfield } from './heightfield.js';
import { Terrain } from './terrain.js';
import { Atmosphere, Moons, makeClouds, makeStars, makeSun, setMoonRadiusCache } from './sky.js';
import { bindPanel, updateStats, setHud } from './panel.js';

const BASE = import.meta.env.BASE_URL;
const status = document.getElementById('status');
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 2e-6, 400);

// --- load layers -----------------------------------------------------------------------------------------
const meta = await fetch(BASE + 'data/kiros_meta.json').then(r => r.json());
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
    loadTex('kiros_region_mask_4k.png', { data: true }), loadTex('kiros_region_coast_4k.png', { linear: true }), loadTex('kiros_clouds_2k.png', { srgb: true }),
    loadTex(MOONS[0].texture, { srgb: true }), loadTex(MOONS[1].texture, { srgb: true })
  ]);
  mask.magFilter = THREE.NearestFilter; mask.minFilter = THREE.NearestFilter;
  tex = { color, height, mask, coast, clouds, moons: [m1, m2] };
} catch (e) {
  status.textContent = 'The map layers did not load. Reload the page to try again.'; throw e;
}
status.textContent = 'Reading the heights…';
await new Promise(r => setTimeout(r, 10));
const heightfield = new Heightfield(tex.height.image, meta.web.window_deg);

// --- world -----------------------------------------------------------------------------------------------
const terrain = new Terrain(tex, meta, heightfield); scene.add(terrain.mesh);
const controls = new DescentControls(camera, canvas, d => terrain.heightAt(d) * settings.relief);
const atmosphere = new Atmosphere(); scene.add(atmosphere.mesh);
const stars = makeStars(); scene.add(stars);
const sunMesh = makeSun(); scene.add(sunMesh);
const sunLight = new THREE.DirectionalLight(0xfff4e6, 1.7); scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x202830, 0.5));
const clouds = makeClouds(tex.clouds, planet().radiusKm); scene.add(clouds);
const moons = new Moons(tex.moons); scene.add(moons.group);
const moonLight = { dirs: [new THREE.Vector3(), new THREE.Vector3()], light: [0, 0] };

function applyPlanet() {
  const p = planet();
  terrain.setRadius(p.radiusKm); controls.setRadius(p.radiusKm * 1000);
  atmosphere.configure(p.radiusKm, p.atmosphereScale, p.airDensity * settings.atmo);
  moons.configure(p.radiusKm); setMoonRadiusCache(p.radiusKm);
  clouds.scale.setScalar(1 + 9000 / (p.radiusKm * 1000));
  updateStats(p, settings);
}
function applySettings() {
  terrain.material.uniforms.uRelief.value = settings.relief;
  terrain.material.uniforms.uDetail.value = settings.detail ? 1 : 0;
  clouds.visible = settings.clouds; moons.group.visible = settings.moons;
  terrain.maxTiles = Math.round(1400 * settings.quality);
}
applyPlanet(); applySettings();
window.kiros = { terrain, camera, controls, settings, atmosphere, scene, renderer };   // debug hook
onChange((s, patch) => { if ('size' in patch || 'atmo' in patch) applyPlanet(); applySettings(); });

// --- time and sun ----------------------------------------------------------------------------------------
let simDays = 0;                                   // simulated time, for the moons
const sunDir = new THREE.Vector3();
function updateSun() {
  const decl = settings.tiltDeg * Math.sin(settings.season * Math.PI * 2);
  const lon = (12 - settings.hour) * 15;           // noon at the prime meridian, which runs through the middle of the cluster
  dir(decl, lon, sunDir);
  sunLight.position.copy(sunDir).multiplyScalar(50);
  sunMesh.position.copy(sunDir).multiplyScalar(230);
  terrain.material.uniforms.uSunDir.value.copy(sunDir);
  atmosphere.material.uniforms.uSunDir.value.copy(sunDir);
}

// --- camera ----------------------------------------------------------------------------------------------
// lat, lon, height above ground (m), heading, pitch (null = automatic by height)
const PLACES = {
  orbit: [32, -4, 4.4e6, 0, -90], veir: [46, -28, 420e3, 0, null], 'veir-ground': [47.9, -25.05, 1800, 215, -14],
  sfere: [47.4, 21.8, 300e3, 0, null], dire: [15.4, 32.9, 260e3, 0, null], 'malos-wet': [12.2, 45.35, 2500, 40, -16],
  dragon: [11, -24.13, 60e3, 0, null], create: [27, 12, 300e3, 0, null], ender: [24.35, -51.5, 3000, 320, -14],
  'inner-sea': [33, -5, 180e3, 0, null], outer: [20, -70, 1200, 270, -8], north: [62, 20, 500e3, 0, null]
};
controls.t.lat = 32; controls.t.lon = -4; controls.t.alt = 4.4e6; controls.t.pitch = -90; Object.assign(controls.c, controls.t);

bindPanel({
  flyTo: key => { const p = PLACES[key]; if (p) controls.flyTo(p[0], p[1], p[2], p[3], p[4]); },
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.viewHeight = h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
status.hidden = true;

// --- loop ------------------------------------------------------------------------------------------------
const clock = new THREE.Clock(); let fpsT = 0, fpsN = 0, fps = 60, hudT = 0;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) set({ clock: false });

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (settings.clock) {
    const dh = dt * settings.clockRate / 3600;
    settings.hour = (settings.hour + dh) % settings.dayHours; simDays += dh / settings.dayHours;
    document.getElementById('hour').value = settings.hour; document.getElementById('hour-out').textContent = fmtHour(settings.hour);
  }
  updateSun();
  moons.update(simDays, sunDir, moonLight);
  terrain.material.uniforms.uMoonDir.value[0].copy(moonLight.dirs[0]); terrain.material.uniforms.uMoonDir.value[1].copy(moonLight.dirs[1]);
  terrain.material.uniforms.uMoonLight.value = moonLight.light;
  terrain.material.uniforms.uTime.value += dt;
  clouds.rotation.y += dt * 0.0015;

  const { alt } = controls.update(dt);
  // inside the air the open sky gets more gain (standing in for multiple scattering); from orbit the limb stays thin
  atmosphere.material.uniforms.uSkyGain.value = THREE.MathUtils.lerp(5.2, 2.2, THREE.MathUtils.smoothstep(alt, 15e3, 160e3));
  // stars fade out under a daylit sky
  stars.material.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(camera.position.clone().normalize().dot(sunDir), -0.15, 0.12));

  terrain.update(camera, settings.relief);
  renderer.render(scene, camera);

  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const ll = controls.latLon;
    setHud(`${fmtAlt(alt)} above ground\n${fmtLat(ll.lat)} ${fmtLon(ll.lon)}\n${terrain.count} tiles · ${fps.toFixed(0)} fps`);
  }
});

function fmtAlt(m) { return m >= 10000 ? `${(m / 1000).toFixed(0)} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`; }
function fmtLat(v) { return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`; }
function fmtLon(v) { return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`; }
export function fmtHour(h) { const m = Math.floor((h % 1) * 60); return `${Math.floor(h).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; }
