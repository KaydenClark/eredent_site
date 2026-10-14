// Value noise with an integer hash (PCG3D), written twice: GLSL for the GPU and JS for the CPU. The terrain's fine
// relief comes from this noise, and the walking camera needs the same height the GPU draws, so both sides must hash
// the same lattice to the same values. A float hash (fract of large products) diverges between float32 and float64;
// integer arithmetic does not.

const OFF = 1048576;   // keeps lattice coordinates positive before they become unsigned

export const GLSL_NOISE = /* glsl */`
uint pcgHash(ivec3 c) {
  uvec3 v = uvec3(c + ${OFF});
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x;
}
float hash3(vec3 p) { return float(pcgHash(ivec3(floor(p))) >> 8u) / 16777215.0; }
float hashI(ivec3 c) { return float(pcgHash(c) >> 8u) / 16777215.0; }
float vnoise(vec3 p) {
  vec3 fl = floor(p); ivec3 i = ivec3(fl); vec3 f = p - fl; f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hashI(i), hashI(i + ivec3(1, 0, 0)), f.x), mix(hashI(i + ivec3(0, 1, 0)), hashI(i + ivec3(1, 1, 0)), f.x), f.y),
             mix(mix(hashI(i + ivec3(0, 0, 1)), hashI(i + ivec3(1, 0, 1)), f.x), mix(hashI(i + ivec3(0, 1, 1)), hashI(i + ivec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

export function pcgHash(x, y, z) {
  let a = (x + OFF) >>> 0, b = (y + OFF) >>> 0, c = (z + OFF) >>> 0;
  a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
  b = (Math.imul(b, 1664525) + 1013904223) >>> 0;
  c = (Math.imul(c, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0; b = (b ^ (b >>> 16)) >>> 0; c = (c ^ (c >>> 16)) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  return a;
}

const hashI = (x, y, z) => (pcgHash(x, y, z) >>> 8) / 16777215;
const lerp = (a, b, t) => a + (b - a) * t;

export function vnoise(px, py, pz) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let fx = px - ix, fy = py - iy, fz = pz - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  return lerp(
    lerp(lerp(hashI(ix, iy, iz), hashI(ix + 1, iy, iz), fx), lerp(hashI(ix, iy + 1, iz), hashI(ix + 1, iy + 1, iz), fx), fy),
    lerp(lerp(hashI(ix, iy, iz + 1), hashI(ix + 1, iy, iz + 1), fx), lerp(hashI(ix, iy + 1, iz + 1), hashI(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

// A deterministic 0..1 random number for an integer cell and a salt (vegetation placement).
export function cellRand(x, y, salt) { return hashI(x, y, salt); }
