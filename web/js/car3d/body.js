// car3d — bodywork panels (BODYWORK_FACES) as painted PBR plates
import * as THREE from 'three';
import { paintMaterial } from './materials.js';
import { plate } from './primitives.js';

/**
 * @param faces {name: {loops: [[node,...]], color, opacity}}
 * @param nodes merged name→[x,y,z] resolver map
 */
export function buildBody(faces, nodes) {
  const g = new THREE.Group();
  g.name = 'body';
  for (const [name, face] of Object.entries(faces ?? {})) {
    const mat = paintMaterial(face.color || '#e8e6e1');
    for (const loop of face.loops ?? []) {
      const pts = loop.map((n) => nodes[n]).filter((p) => Array.isArray(p));
      if (pts.length !== loop.length) continue;
      const m = plate(pts, mat, `body_${name}`);
      if (m) g.add(m);
    }
  }
  return g;
}
