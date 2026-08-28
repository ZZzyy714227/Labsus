// car3d — orchestrator: static/dynamic groups + world transform + point set
import * as THREE from 'three';
import { buildFrame } from './frame.js';
import { buildBody } from './body.js';
import { buildAero } from './aero.js';
import { buildFurniture } from './furniture.js';
import { buildSuspension } from './suspension.js';
import { buildSteering } from './steering.js';
import { buildWheels } from './wheels.js';
import { collectPointSet } from './pointset.js';

// World transform: car (X fwd, Y right, Z up) → Three (X right, Y up, Z toward)
//   world.x = carX ; world.y = carZ ; world.z = -carY
const WORLD = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
);

export function createCarGroup() {
  const group = new THREE.Group();
  group.name = 'car';
  group.matrix.copy(WORLD);
  group.matrixAutoUpdate = false;   // never recomputed — keeps car-frame coords clean
  return group;
}

/** Merge frame nodes + hardpoints (+ _L mirrors + rear R_ names) into one resolver. */
export function mergeNodes(frameNodes, frontHp, rearHp) {
  const nodes = {};
  const add = (obj) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (Array.isArray(v) && v.length === 3) nodes[k] = v;
    }
  };
  const addMirrors = (obj) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (Array.isArray(v) && v.length === 3) nodes[`${k}_L`] = [v[0], -v[1], v[2]];
    }
  };
  add(frameNodes);
  add(frontHp);
  addMirrors(frontHp);
  add(rearHp);
  addMirrors(rearHp);
  return nodes;
}

/** Strip R_ prefix from rear hardpoint keys (solver plain-key convention). */
function stripPrefix(hp) {
  const out = {};
  for (const [k, v] of Object.entries(hp ?? {})) {
    out[k.startsWith('R_') ? k.slice(2) : k] = v;
  }
  return out;
}

export class Car {
  constructor() {
    this.group = createCarGroup();
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'static';
    this.dynamicGroup = new THREE.Group();
    this.dynamicGroup.name = 'dynamic';
    this.group.add(this.staticGroup, this.dynamicGroup);
    this.defaults = null;
  }

  /** Static parts: frame, bodywork, aero, furniture (design changes only). */
  rebuildStatic(defaults) {
    this.defaults = defaults;
    this.staticGroup.clear();
    const nodes = mergeNodes(
      defaults.frame?.nodes, defaults.front?.right, defaults.rear?.right);

    const frame = buildFrame(nodes, defaults.frame?.tubes ?? [], defaults.frame?.tube_colors);
    this.staticGroup.add(frame);

    this.staticGroup.add(buildBody(defaults.bodywork, nodes));
    this.staticGroup.add(buildAero(
      defaults.front_wing, defaults.rear_wing,
      defaults.undertray, defaults.diffuser, nodes));
    this.staticGroup.add(buildFurniture(defaults.cabin));
  }

  /**
   * Dynamic parts: suspension, steering, wheels (per solve).
   * @param hpFront  display hardpoints {right, left} (CH/FL design + UP solved)
   * @param hpRear   same for rear (keys may carry R_ prefix)
   * @param solved   /api/solve response (or null → design pose)
   * @param rack     rack displacement mm
   */
  rebuildDynamic(hpFront, hpRear, solved, rack = 0) {
    this.dynamicGroup.clear();
    const solveF = solved?.front ?? {};
    const solveR = solved?.rear ?? {};
    const nodes = this.defaults?.frame?.nodes ?? {};

    // Solve responses already carry merged chassis keys — prefer them;
    // fall back to the design hardpoints for the initial (unsolved) pose.
    const fR = { ...(solveF.right ?? hpFront?.right ?? {}) };
    const fL = { ...(solveF.left ?? hpFront?.left ?? {}) };
    const rR = stripPrefix(solveR.right ?? hpRear?.right ?? {});
    const rL = stripPrefix(solveR.left ?? hpRear?.left ?? {});

    // Suspension: front (pushrod) + rear (pullrod)
    this.dynamicGroup.add(buildSuspension(
      fR, fL,
      { pivot: nodes.RK_PIVOT_R, damperEye: nodes.RK_DAMPER_R, damperChassis: nodes.DAMPER_CHASSIS_FR },
      { pivot: nodes.RK_PIVOT_L, damperEye: nodes.RK_DAMPER_L, damperChassis: nodes.DAMPER_CHASSIS_FL },
      solveF.rocker_right, solveF.rocker_left));
    this.dynamicGroup.add(buildSuspension(
      rR, rL,
      { pivot: nodes.R_RK_PIVOT_R, damperEye: nodes.R_RK_DAMPER_R, damperChassis: nodes.R_DAMPER_CHASSIS_RR },
      { pivot: nodes.R_RK_PIVOT_L, damperEye: nodes.R_RK_DAMPER_L, damperChassis: nodes.R_DAMPER_CHASSIS_RL },
      solveR.rocker_right, solveR.rocker_left));

    // Steering (front rack + column + wheel)
    const theta = solveF.steering_theta ?? 0;
    this.dynamicGroup.add(buildSteering(
      { right: fR, left: fL }, rack, theta, this.defaults?.cabin?.steering_wheel));

    // Wheels (all four corners, solved pose + contact patches)
    const tireWidth = fR.tire_width ?? 180;
    this.dynamicGroup.add(buildWheels(
      { right: fR, left: fL,
        contact_patch_right: solveF.contact_patch_right,
        contact_patch_left: solveF.contact_patch_left },
      { right: rR, left: rL,
        contact_patch_right: solveR.contact_patch_right,
        contact_patch_left: solveR.contact_patch_left },
      tireWidth));
  }

  /** Complete car-frame point set (all rendered vertices). */
  pointSet() {
    return collectPointSet(this.group);
  }
}
