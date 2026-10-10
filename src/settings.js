// Runtime settings. Every "Proposed" value from docs/SPEC.md that affects the view lives here, so it can
// change without rebuilding the data layers. Build-time values (heights, lake levels, zones) are in pipeline/config.json.

export const PLANETS = {
  small: { key: 'small', label: 'Small world', radiusKm: 1692.7, gravity: 0.27, lakeVeir: '51,000 km² (Bonneville)',
    atmosphereScale: 1.25, airDensity: 1.1 },   // Proposed: a 0.27 g world holds a taller, denser air column; the gods keep it in place
  earth: { key: 'earth', label: 'Earth-sized', radiusKm: 6371.0, gravity: 1.0, lakeVeir: '≈722,000 km² (14× Bonneville)',
    atmosphereScale: 1.0, airDensity: 1.0 }
};

export const MOON_R_KM = 1737.4;              // Earth's Moon, the ruler for both Kiros moons (canon: one half, one a third of it)
export const MOONS = [
  { name: 'larger', radiusKm: MOON_R_KM / 2, orbitRadii: 24, periodDays: 9.5, inclination: 6, phase0: 0.0, texture: 'moon_21.jpg' },   // distances, periods: proposed
  { name: 'smaller', radiusKm: MOON_R_KM / 3, orbitRadii: 41, periodDays: 21, inclination: 14, phase0: 2.1, texture: 'moon_34.jpg' }
];

export const defaults = {
  size: 'small',          // open question A or B
  relief: 1,              // 1 = true heights
  hour: 10.5,             // local time at the prime meridian (through the middle of the cluster)
  season: 0.25,           // 0 = spring equinox, 0.25 = summer solstice (north)
  clock: true,            // let time pass
  clockRate: 240,         // simulated seconds per real second (one day in six minutes)
  dayHours: 24,           // proposed
  tiltDeg: 23,            // proposed
  atmo: 1.0,              // atmosphere thickness multiplier (visual)
  clouds: true,
  moons: true,
  wildlife: true,         // distant dragon flights (stand-ins)
  detail: true,           // fractal detail below the data resolution (about 50 m per sample)
  quality: 1.0            // LOD budget multiplier
};

const KEY = 'kiros.settings.v1';
const listeners = new Set();

function load() {
  let s = { ...defaults };
  try { const j = localStorage.getItem(KEY); if (j) s = { ...s, ...JSON.parse(j) }; } catch {}
  const q = new URLSearchParams(location.search);
  if (q.get('size') === 'earth' || q.get('size') === 'small') s.size = q.get('size');
  if (q.has('hour')) s.hour = +q.get('hour');
  return s;
}

export const settings = load();

export function set(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  for (const fn of listeners) fn(settings, patch);
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function planet() { return PLANETS[settings.size] || PLANETS.small; }
