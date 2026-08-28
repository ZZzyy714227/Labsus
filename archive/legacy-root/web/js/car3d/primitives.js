// car3d — primitives in CAR-FRAME coordinates (X forward, Y right, Z up, mm)
// Every mesh gets userData.part for the point-set collector (pointset.js).
import * as THREE from 'three';

export function v(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

// ---- plain-array vector helpers (car-frame [x, y, z]) ----
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const mirrorY = (p) => [p[0], -p[1], p[2]];

/** Rotate point p about a car-frame X-axis line through `pivot` by theta. */
export function rotateAroundX(p, pivot, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dy = p[1] - pivot[1];
  const dz = p[2] - pivot[2];
  return [p[0], pivot[1] + dy * c - dz * s, pivot[2] + dy * s + dz * c];
}

function tag(mesh, part) {
  if (mesh) {
    mesh.userData.part = part;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return mesh;
}

/** Cylindrical tube between car-frame points a, b. */
export function tube(a, b, radius, material, part) {
  const dir = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  if (len < 1e-6) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 16), material);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return tag(mesh, part);
}

/** Smooth tube along a polyline of car-frame points (CatmullRom). */
export function tubeCurve(points, radius, material, part) {
  if (!points || points.length < 2) return null;
  const pts = points.map((p) => v(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = Math.max(32, pts.length * 24);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 12, false), material);
  return tag(mesh, part);
}

/** Box centered at c with sizes [sx, sy, sz]. */
export function box3(c, sizes, material, part) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizes[0], sizes[1], sizes[2]), material);
  mesh.position.set(c[0], c[1], c[2]);
  return tag(mesh, part);
}

/** Sphere ball. */
export function ball(c, radius, material, part) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
  mesh.position.set(c[0], c[1], c[2]);
  return tag(mesh, part);
}

/** Flat disc centred at c, normal along axis, radius r, thickness t. */
export function disc(c, axis, r, t, material, part) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 24), material);
  mesh.position.set(c[0], c[1], c[2]);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    v(axis[0], axis[1], axis[2]).normalize()
  );
  return tag(mesh, part);
}

/** Torus (tire) centred at c, ring normal along axis, major radius R, tube r. */
export function torus(c, axis, R, r, material, part) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, r, 20, 40), material);
  mesh.position.set(c[0], c[1], c[2]);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    v(axis[0], axis[1], axis[2]).normalize()
  );
  return tag(mesh, part);
}

/** Conical frustum from a (radius r1) to b (radius r2). */
export function coneTube(a, b, r1, r2, material, part) {
  const dir = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  if (len < 1e-6) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 20), material);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return tag(mesh, part);
}

/** Fan-triangulated plate from a loop of car-frame points (double-sided). */
export function plate(loop, material, part) {
  if (!loop || loop.length < 3) return null;
  const pts = loop.map((p) => v(p[0], p[1], p[2]));
  const centroid = v(0, 0, 0);
  pts.forEach((p) => centroid.add(p));
  centroid.divideScalar(pts.length);

  const positions = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    positions.push(
      centroid.x, centroid.y, centroid.z,
      a.x, a.y, a.z,
      b.x, b.y, b.z
    );
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();

  const mat = material.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  return tag(mesh, part);
}
