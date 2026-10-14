// Biome bands from docs/SPEC.md "Biomes and vegetation" (bands and canopy heights are Proposed there) and the
// biome map zones (desert yellow, wetland purple, snow hatch grey). Shared by the HUD and the vegetation.

// snowline (m) by latitude, spec table: 5,000 m at the equator, 4,000 at 30°N, 2,900 at 45°N, 1,650 at 60°N, 600 at 75°N
const SNOW = [[0, 5000], [30, 4000], [45, 2900], [60, 1650], [75, 600], [90, 0]];
export function snowline(lat, hatch = false) {
  const a = Math.abs(lat);
  for (let i = 1; i < SNOW.length; i++) if (a <= SNOW[i][0]) {
    const [l0, h0] = SNOW[i - 1], [l1, h1] = SNOW[i];
    return h0 + (h1 - h0) * (a - l0) / (l1 - l0) - (hatch ? 600 : 0);
  }
  return 0;
}
export const treeline = (lat, hatch) => snowline(lat, hatch) - 900;

// The vegetation zone at a point: one of
// tropical | mixed | taiga | alpine | tundra | snow | desert | wetland | bayou | water
// Dragon Islands cone: "black rock and ash soils" (spec, Landmasses). Same box and height as the terrain shader.
export const isVolcanic = (lat, lon, h) => lat > 5 && lat < 16 && lon > -32 && lon < -15 && h > 1200;

export function zoneAt(biome, lat, h, coast, lon = null) {
  if (coast < 0.47 || biome === 0 || biome === 4) return 'water';
  if (lon !== null && isVolcanic(lat, lon, h)) return 'volcanic';
  const hatch = biome === 5;
  const sl = snowline(lat, hatch), tl = sl - 900;
  if (h > sl) return 'snow';
  if (biome === 2) return 'desert';
  if (h > tl) return Math.abs(lat) > 63 ? 'tundra' : 'alpine';
  if (biome === 3) return 'wetland';
  if (biome === 6) return 'bayou';
  if (Math.abs(lat) > 63) return 'tundra';
  if (lat < 18) return h > tl - 1400 ? 'mixed' : 'tropical';
  if (lat < 48) return h > tl - 500 ? 'taiga' : 'mixed';
  return 'taiga';
}

const NAMES = {
  tropical: 'Giant tropical rainforest', mixed: 'Primeval mixed forest', taiga: 'Cold evergreen forest (taiga)',
  alpine: 'Alpine rock and scrub', tundra: 'Tundra', snow: 'Snowfield', desert: 'Desert', wetland: 'Wetland, swamp forest',
  bayou: 'Bayou', volcanic: 'Volcanic rock and ash'
};

export function biomeName(sample, lat, h, coast, lon = null) {
  const b = sample.biome;
  const z = zoneAt(b, lat, h, coast, lon);
  if (z !== 'water' && coast < 0.6 && z !== 'snow') return b === 4 || h > 300 ? 'Shore' : Math.abs(lat) < 25 ? 'Beach' : 'Rocky shore';
  if (z !== 'water') return NAMES[z];
  if (b === 4) return 'Lake';
  if (sample.inner > 0.5) return 'Protected inner sea';
  return sample.depth > 1000 ? 'Deep outer ocean' : 'Outer shelf';
}

// Where what you see at a spot comes from, for the HUD (trace the world back to its sources).
export function evidenceFor(sample, lat, h, coast, source = 'sept', lon = null) {
  const z = zoneAt(sample.biome, lat, h, coast, lon);
  if (z === 'volcanic') return 'Dragon Islands cone: spec "black rock and ash soils" · ground: Sept penup master + spec heights';
  if (z === 'water') {
    if (sample.biome === 4) return `lake outline: ${source === 'oct10' ? 'Oct 10 outline (variant)' : 'Sept penup'} blue ink · level: spec (derived/proposed)`;
    return sample.inner > 0.5 ? 'protected sea: Drive description (canon) · depth: spec (proposed)' : 'outer ocean: Drive description (canon) · depth: spec (proposed)';
  }
  const ground = source === 'oct10' ? 'ground: Oct 10 outline variant + spec heights' : 'ground: Sept penup master + spec heights';
  if (z === 'desert' || z === 'wetland' || z === 'bayou') return `${ground} · zone: kiros_v5 ${z === 'desert' ? 'yellow' : 'purple'} (canon)`;
  if (z === 'snow' || z === 'alpine' || z === 'tundra') return `${ground} · snowline: spec table (proposed)`;
  return `${ground} · forest band: spec (proposed) · trees generated`;
}
