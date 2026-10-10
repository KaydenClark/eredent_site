import * as THREE from 'three';

// Planet frame: +Y is the north pole. lon 0 is +X, east turns toward -Z (so the map reads with north up and
// east to the right when seen from outside, matching the equirectangular textures).
export function dir(latDeg, lonDeg, out = new THREE.Vector3()) {
  const p = THREE.MathUtils.degToRad(latDeg), l = THREE.MathUtils.degToRad(lonDeg);
  return out.set(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l));
}

export function latLon(v) {
  const n = v.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(n.y, -1, 1))), lon: THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)) };
}

// Cube faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z. (u, v) in [-1, 1].
export function cubePoint(face, u, v, out = new THREE.Vector3()) {
  switch (face) {
    case 0: return out.set(1, v, -u);
    case 1: return out.set(-1, v, u);
    case 2: return out.set(u, 1, -v);
    case 3: return out.set(u, -1, v);
    case 4: return out.set(u, v, 1);
    default: return out.set(-u, v, -1);
  }
}

// "Spherified cube": far more even tile sizes than a plain normalize.
export function spherify(p) {
  const x = p.x, y = p.y, z = p.z, x2 = x * x, y2 = y * y, z2 = z * z;
  return p.set(
    x * Math.sqrt(1 - y2 / 2 - z2 / 2 + y2 * z2 / 3),
    y * Math.sqrt(1 - z2 / 2 - x2 / 2 + z2 * x2 / 3),
    z * Math.sqrt(1 - x2 / 2 - y2 / 2 + x2 * y2 / 3));
}

export const GLSL_GEO = /* glsl */`
vec3 cubePoint(float face, vec2 uv) {
  float u = uv.x, v = uv.y;
  if (face < 0.5) return vec3(1.0, v, -u);
  if (face < 1.5) return vec3(-1.0, v, u);
  if (face < 2.5) return vec3(u, 1.0, -v);
  if (face < 3.5) return vec3(u, -1.0, v);
  if (face < 4.5) return vec3(u, v, 1.0);
  return vec3(-u, v, -1.0);
}
vec3 spherify(vec3 p) {
  vec3 p2 = p * p;
  return vec3(
    p.x * sqrt(1.0 - p2.y / 2.0 - p2.z / 2.0 + p2.y * p2.z / 3.0),
    p.y * sqrt(1.0 - p2.z / 2.0 - p2.x / 2.0 + p2.z * p2.x / 3.0),
    p.z * sqrt(1.0 - p2.x / 2.0 - p2.y / 2.0 + p2.x * p2.y / 3.0));
}
// degrees: x = lat, y = lon
vec2 latLon(vec3 n) { return vec2(degrees(asin(clamp(n.y, -1.0, 1.0))), degrees(atan(-n.z, n.x))); }
`;
