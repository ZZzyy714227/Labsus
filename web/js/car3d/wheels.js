// car3d — wheels: tires, rims, brake discs, calipers, contact patches
import * as THREE from 'three';
import { MAT } from './materials.js';
import { ball, box3, cross, disc, norm, sub, torus, tube } from './primitives.js';

/** Wheel spin axis from solved points (same convention as backend _upright_y_axis). */
function spinAxis(hp) {
  const z = norm(sub(hp.UP2, hp.UP1));
  const u15 = sub(hp.UP5, hp.UP1);
  const x = norm(cross(u15, z));
  return cross(z, x);
}

/**
 * One corner: tire + rim + brake + contact patch.
 * @param hp        solved hardpoints (UP1/2/5 present)
 * @param contact   {center, loaded_radius} from solve response
 * @param tireWidth mm
 */
function buildCorner(hp, contact, tireWidth) {
  const g = new THREE.Group();
  const UP5 = hp.UP5;
  const axis = spinAxis(hp);

  // Tire: torus ring radius = loaded radius − tube radius (tube = width/2)
  const loadedR = contact?.loaded_radius ?? 260;
  const tubeR = tireWidth / 2;
  const ringR = Math.max(loadedR - tubeR, 40);
  g.add(torus(UP5, axis, ringR, tubeR, MAT.rubber, 'tire'));

  // Rim (schematic): disc + hub + 5 spokes
  g.add(disc(UP5, axis, 165, 26, MAT.rim, 'rim'));
  g.add(ball(UP5, 45, MAT.rim, 'rim'));
  const u = norm(cross(Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], axis));
  const w = cross(axis, u);
  for (let k = 0; k < 5; k++) {
    const ang = (k * Math.PI * 2) / 5;
    const dir = [u[0] * Math.cos(ang) + w[0] * Math.sin(ang),
                 u[1] * Math.cos(ang) + w[1] * Math.sin(ang),
                 u[2] * Math.cos(ang) + w[2] * Math.sin(ang)];
    g.add(tube(UP5, [UP5[0] + dir[0] * 160, UP5[1] + dir[1] * 160, UP5[2] + dir[2] * 160],
               9, MAT.rim, 'rim'));
  }

  // Brake disc + caliper (inboard side)
  const discC = [UP5[0] + axis[0] * 55, UP5[1] + axis[1] * 55, UP5[2] + axis[2] * 55];
  g.add(disc(discC, axis, 105, 7, MAT.brakeDisc, 'brake_disc'));
  g.add(box3([discC[0], discC[1], discC[2] + 100], [45, 55, 75], MAT.caliper, 'caliper'));

  // Contact patch (dark rubber slab on the ground plane)
  if (contact?.center) {
    g.add(box3(contact.center, [70, 150, 6], MAT.rubber, 'contact_patch'));
  }
  return g;
}

/**
 * All four corners.
 * @param front {right, left, contact_patch_right, contact_patch_left}
 * @param rear  same shape (left keys already mirrored)
 * @param tireWidth mm
 */
export function buildWheels(front, rear, tireWidth) {
  const g = new THREE.Group();
  g.name = 'wheels';
  if (front?.right) g.add(buildCorner(front.right, front.contact_patch_right, tireWidth));
  if (front?.left) g.add(buildCorner(front.left, front.contact_patch_left, tireWidth));
  if (rear?.right) g.add(buildCorner(rear.right, rear.contact_patch_right, tireWidth));
  if (rear?.left) g.add(buildCorner(rear.left, rear.contact_patch_left, tireWidth));
  return g;
}
