// car3d — suspension solids: A-arms, uprights, push/pull rods, rockers, dampers
import * as THREE from 'three';
import { MAT } from './materials.js';
import {
  ball, cross, dist, norm, plate, rotateAroundX, sub, tube,
} from './primitives.js';

/** Upright local axes from solved points (same convention as the backend). */
function uprightAxes(hp) {
  const z = norm(sub(hp.UP2, hp.UP1));
  const x = norm(cross(sub(hp.UP5, hp.UP1), z));
  const y = cross(z, x);
  return { x, y, z };
}

/** Spring coil along an axis (helix of radius r, wire w). */
function coil(from, to, radius, turns, wire, material, part) {
  const d = sub(to, from);
  const len = Math.hypot(...d);
  if (len < 1e-6) return null;
  const axis = norm(d);
  const u0 = norm(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const w0 = cross(axis, u0);
  const pts = [];
  const n = Math.max(16, Math.round(turns * 16));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(
      from[0] + d[0] * t + radius * (u0[0] * Math.cos(ang) + w0[0] * Math.sin(ang)),
      from[1] + d[1] * t + radius * (u0[1] * Math.cos(ang) + w0[1] * Math.sin(ang)),
      from[2] + d[2] * t + radius * (u0[2] * Math.cos(ang) + w0[2] * Math.sin(ang)),
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, n, wire, 6, false), material);
  mesh.userData.part = part;
  return mesh;
}

/**
 * One corner of suspension. Points are used at face value (caller passes
 * already-mirrored data for the left side); rocker angle is signed
 * (negative for the mirrored left side).
 * @param hp          solved hardpoints with plain keys (CH1-5, UP1-5, FL1)
 * @param frame       frame-node lookups: {pivot, damperEye, damperChassis}
 * @param rockerAngleDeg  signed rocker rotation about car X
 */
function buildCorner(hp, frame, rockerAngleDeg, g) {
  const CH1 = hp.CH1, CH2 = hp.CH2, CH3 = hp.CH3, CH4 = hp.CH4;
  const UP1 = hp.UP1, UP2 = hp.UP2, UP3 = hp.UP3, UP4 = hp.UP4, UP5 = hp.UP5;
  const CH5 = hp.CH5;

  // A-arms (steel tubes + spherical housings)
  g.add(tube(CH1, UP1, 8, MAT.steel, 'uca'));
  g.add(tube(CH2, UP1, 8, MAT.steel, 'uca'));
  g.add(tube(CH3, UP2, 8, MAT.steel, 'lca'));
  g.add(tube(CH4, UP2, 8, MAT.steel, 'lca'));
  g.add(ball(UP1, 9, MAT.aluminum, 'ball_joint'));
  g.add(ball(UP2, 9, MAT.aluminum, 'ball_joint'));
  g.add(ball(CH1, 8, MAT.aluminum, 'ball_joint'));
  g.add(ball(CH2, 8, MAT.aluminum, 'ball_joint'));
  g.add(ball(CH3, 8, MAT.aluminum, 'ball_joint'));
  g.add(ball(CH4, 8, MAT.aluminum, 'ball_joint'));

  // Upright (machined aluminum plates + kingpin + wheel bearing boss)
  const { y } = uprightAxes(hp);
  g.add(plate([UP1, UP2, UP5], MAT.aluminum, 'upright'));
  g.add(plate([UP1, UP3, UP4, UP2], MAT.aluminum, 'upright'));
  g.add(tube(UP1, UP2, 9, MAT.steelDark, 'kingpin'));
  const y45 = y.map((c) => c * 45);
  g.add(tube(
    [UP5[0] - y45[0], UP5[1] - y45[1], UP5[2] - y45[2]],
    [UP5[0] + y45[0], UP5[1] + y45[1], UP5[2] + y45[2]],
    26, MAT.aluminum, 'wheel_bearing'));

  // Push/pull rod (upright → rocker eye CH5)
  g.add(tube(CH5, UP4, 7, MAT.steel, 'pushrod'));
  g.add(ball(CH5, 8, MAT.aluminum, 'pushrod'));
  g.add(ball(UP4, 8, MAT.aluminum, 'pushrod'));

  // Rocker (3-point plate rotating about X through pivot)
  const pivot = frame.pivot;
  const theta = rockerAngleDeg * Math.PI / 180;
  const eye = rotateAroundX(frame.damperEye, pivot, theta);
  g.add(plate([pivot, CH5, eye], MAT.accent, 'rocker'));
  g.add(tube([pivot[0] - 16, pivot[1], pivot[2]], [pivot[0] + 16, pivot[1], pivot[2]],
             10, MAT.aluminum, 'rocker'));

  // Damper: body + rod + coil spring, chassis mount → rotated rocker eye
  const chassisMount = frame.damperChassis;
  const L = dist(chassisMount, eye);
  const d = norm(sub(eye, chassisMount));
  const bodyEnd = chassisMount.map((c, i) => c + d[i] * L * 0.55);
  g.add(tube(chassisMount, bodyEnd, 13, MAT.aluminum, 'damper'));
  g.add(tube(bodyEnd, eye, 6, MAT.steelDark, 'damper'));
  const springStart = chassisMount.map((c, i) => c + d[i] * L * 0.08);
  const springEnd = chassisMount.map((c, i) => c + d[i] * L * 0.5);
  const spring = coil(springStart, springEnd, 21, 7, 3.5, MAT.accent, 'damper_spring');
  if (spring) g.add(spring);
}

/**
 * Build both corners of one axle.
 * @param hpPlain solved right-side hardpoints (plain keys)
 * @param hpLeft  solved left-side hardpoints (already mirrored, plain keys)
 * @param frameR  {pivot, damperEye, damperChassis} right-side frame nodes
 * @param frameL  same for the left side
 * @param rockerR rocker kinematics right side ({rocker_angle_deg})
 * @param rockerL rocker kinematics left side ({rocker_angle_deg})
 */
export function buildSuspension(hpPlain, hpLeft, frameR, frameL, rockerR, rockerL) {
  const g = new THREE.Group();
  g.name = 'suspension';
  if (hpPlain) buildCorner(hpPlain, frameR, rockerR?.rocker_angle_deg ?? 0, g);
  if (hpLeft) buildCorner(hpLeft, frameL, -(rockerL?.rocker_angle_deg ?? 0), g);
  return g;
}
