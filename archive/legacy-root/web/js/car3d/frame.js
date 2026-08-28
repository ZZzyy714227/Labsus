// car3d — rules-compliant steel spaceframe (tubes + node balls)
import * as THREE from 'three';
import { MAT, paintMaterial } from './materials.js';
import { ball, tube, tubeCurve } from './primitives.js';

const HOOP_R = 12.7;   // main/front hoop: 25.4mm OD steel (rules 3.4.1)
const TUBE_R = 9.5;    // other structural tubes (19mm OD)
const NODE_R = 4.0;    // visible weld nodes (suspension mounts only)

/**
 * Build the whole frame.
 * @param nodes  merged name→[x,y,z] map (frame nodes + hardpoints + mirrors)
 * @param tubes  FRAME_TUBES endpoint lists (2pt straight, 3+ pt curve)
 * @param tubeColors  FRAME_TUBE_COLORS {index: hex}
 */
export function buildFrame(nodes, tubes, tubeColors) {
  const g = new THREE.Group();
  g.name = 'frame';

  tubes.forEach((endpoints, i) => {
    const pts = endpoints.map((n) => nodes[n]).filter((p) => Array.isArray(p));
    if (pts.length !== endpoints.length) return;   // unresolvable → skip
    const hex = tubeColors?.[String(i)] ?? tubeColors?.[i];
    const mat = hex ? paintMaterial(hex) : MAT.steel;
    const mesh = pts.length === 2
      ? tube(pts[0], pts[1], TUBE_R, mat, 'frame_tube')
      : tubeCurve(pts, pts.length >= 4 ? HOOP_R : TUBE_R, mat, 'frame_tube');
    if (mesh) g.add(mesh);
  });

  for (const [name, p] of Object.entries(nodes)) {
    if (name.startsWith('BODY_')) continue;   // panel contour points — not structural
    g.add(ball(p, NODE_R, MAT.steelDark, 'frame_node'));
  }
  return g;
}
