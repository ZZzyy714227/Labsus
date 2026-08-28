// car3d — steering: rack, tie rods, column, wheel
import * as THREE from 'three';
import { MAT } from './materials.js';
import { ball, box3, cross, norm, torus, tube } from './primitives.js';

const STEER_RATIO = 3.5;   // steering wheel angle / road wheel angle

/**
 * Build steering system (front axle only).
 * @param hpFront   solved front hardpoints: {right, left} (left already mirrored)
 * @param rackDisplacement  mm (rack travels along car Y)
 * @param steeringTheta     rad (kingpin rotation from solver)
 * @param wheelCfg  CABIN.steering_wheel
 */
export function buildSteering(hpFront, rackDisplacement, steeringTheta, wheelCfg) {
  const g = new THREE.Group();
  g.name = 'steering';

  const FL1 = hpFront?.right?.FL1;
  if (!FL1) return g;

  // Rack bar (slides in Y) + fixed housing
  const yR = FL1[1] + rackDisplacement;
  const yL = -FL1[1] + rackDisplacement;
  g.add(tube([FL1[0], yR, FL1[2]], [FL1[0], yL, FL1[2]], 9, MAT.aluminum, 'rack'));
  g.add(box3([FL1[0], rackDisplacement, FL1[2]], [110, 70, 62], MAT.steelDark, 'rack_housing'));

  // Tie rods: rack ends → steering arms (UP3), right + mirrored left
  const tie = (up3, yEnd) => {
    g.add(tube([FL1[0], yEnd, FL1[2]], up3, 7, MAT.steel, 'tie_rod'));
    g.add(ball(up3, 8, MAT.aluminum, 'tie_rod'));
    g.add(ball([FL1[0], yEnd, FL1[2]], 8, MAT.aluminum, 'tie_rod'));
  };
  if (hpFront.right?.UP3) tie(hpFront.right.UP3, yR);
  if (hpFront.left?.UP3) tie(hpFront.left.UP3, yL);

  // Steering column: wheel hub → rack center
  const wc = wheelCfg.center;
  g.add(tube(wc, [FL1[0], rackDisplacement, FL1[2]], 11, MAT.steelDark, 'steering_column'));

  // Steering wheel (rim torus + 3 spokes + hub), spokes rotate with steering
  const wheelAngle = steeringTheta * STEER_RATIO;
  const n = norm([1, 0, 0.28]);                    // column axis (tilted to driver)
  const u = norm(cross([0, 0, 1], n));             // horizontal in wheel plane
  const w = cross(n, u);
  const R = wheelCfg.radius;
  const rim = torus(wc, n, R, wheelCfg.rim_thickness, MAT.upholstery, 'steering_wheel');
  if (rim) g.add(rim);
  g.add(ball(wc, 32, MAT.aluminum, 'steering_wheel'));
  for (let k = 0; k < 3; k++) {
    const ang = wheelAngle + (k * Math.PI * 2) / 3;
    const dir = [u[0] * Math.cos(ang) + w[0] * Math.sin(ang),
                 u[1] * Math.cos(ang) + w[1] * Math.sin(ang),
                 u[2] * Math.cos(ang) + w[2] * Math.sin(ang)];
    const rimP = [wc[0] + dir[0] * R, wc[1] + dir[1] * R, wc[2] + dir[2] * R];
    g.add(tube(wc, rimP, 6, MAT.aluminum, 'steering_wheel'));
  }
  return g;
}
