// car3d — aero: wings (airfoil loft), endplates, undertray, diffuser
import * as THREE from 'three';
import { paintMaterial } from './materials.js';
import { plate, tube } from './primitives.js';

/** NACA-style airfoil outline: chord along +X, camber + thickness, then angle. */
function airfoilPoints(chord, camberPct, thicknessPct, angleDeg, n = 24) {
  const m = (camberPct || 0) / 100;
  const t = (thicknessPct || 5) / 100;
  const a = (angleDeg * Math.PI) / 180;
  const upper = [];
  const lower = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;                       // 0..1 along chord
    // NACA 4-digit: camber yc = m/p² (2p x − x²) for x<p, else m/(1−p)² ((1−2p)+2p x −x²), p=0.4
    const p = 0.4;
    const cam = m === 0 ? 0
      : x < p
        ? (m / (p * p)) * (2 * p * x - x * x)
        : (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
    const th = 5 * t * (
      0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x
      + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
    const ca = Math.cos(a), sa = Math.sin(a);
    const pxu = x * chord, pzl = (cam + th) * chord;
    const px = x * chord, pz = (cam - th) * chord;
    upper.push([pxu * ca - pzl * sa, pxu * sa + pzl * ca]);
    lower.push([px * ca - pz * sa, px * sa + pz * ca]);
  }
  return { upper, lower };
}

/** Loft one wing element across the span (car frame: X forward, Z up, Y span). */
function wingElement(el, ref, span, color) {
  const { upper, lower } = airfoilPoints(el.chord, el.camber_pct, el.thickness_pct, el.angle);
  const x0 = ref[0] + (el.x_offset || 0);
  const z0 = ref[2] + (el.z_offset || 0);
  const y0 = ref[1];
  const half = (span / 2) * (el.span_fraction ?? 1);
  const sections = 20;
  const ring = [...upper, ...[...lower].reverse()];   // closed outline (2n+2 pts)
  const positions = [];
  const idx = [];
  const nRing = ring.length;
  for (let s = 0; s <= sections; s++) {
    const y = y0 - half + (2 * half * s) / sections;
    for (const [rx, rz] of ring) positions.push(x0 + rx, y, z0 + rz);
  }
  for (let s = 0; s < sections; s++) {
    for (let k = 0; k < nRing; k++) {
      const a = s * nRing + k;
      const b = s * nRing + ((k + 1) % nRing);
      const c = (s + 1) * nRing + k;
      const d = (s + 1) * nRing + ((k + 1) % nRing);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mat = paintMaterial(color);
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.part = 'wing_element';
  return mesh;
}

function endplates(bounds, ref, cfg, color) {
  const g = new THREE.Group();
  const fwd = cfg.overhang_forward ?? 0.1;
  const rear = cfg.overhang_rear ?? 0.1;
  const x1 = bounds.minX - bounds.dx * fwd;
  const x2 = bounds.maxX + bounds.dx * rear;
  const z1 = bounds.minZ - (cfg.height_below ?? 100);
  const z2 = bounds.maxZ + (cfg.height_above ?? 80);
  for (const y of [bounds.minY, bounds.maxY]) {
    g.add(plate([[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]],
                paintMaterial(color), 'wing_endplate'));
  }
  return g;
}

/** Full wing assembly (elements + endplates + mount struts). */
function wing(cfg, nodes, name) {
  const g = new THREE.Group();
  if (!cfg?.enabled) return g;
  const ref = cfg.reference_point;
  const mat = paintMaterial(cfg.color || '#20242a');
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
                   minZ: Infinity, maxZ: -Infinity };
  for (const el of cfg.elements ?? []) {
    const m = wingElement(el, ref, cfg.span, cfg.color);
    if (!m) continue;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    bounds.minX = Math.min(bounds.minX, bb.min.x);
    bounds.maxX = Math.max(bounds.maxX, bb.max.x);
    bounds.minY = Math.min(bounds.minY, bb.min.y);
    bounds.maxY = Math.max(bounds.maxY, bb.max.y);
    bounds.minZ = Math.min(bounds.minZ, bb.min.z);
    bounds.maxZ = Math.max(bounds.maxZ, bb.max.z);
    g.add(m);
  }
  if (isFinite(bounds.minX)) {
    bounds.dx = bounds.maxX - bounds.minX;
    g.add(endplates(bounds, ref, cfg.endplate ?? {}, cfg.color));
  }
  for (const mt of cfg.mounts ?? []) {
    const base = nodes[mt.frame_node];
    if (!base) continue;
    g.add(tube(
      [base[0] + (mt.local_x || 0), base[1] + (mt.local_y || 0), base[2] + (mt.local_z || 0)],
      ref, 8, paintMaterial('#6b7280'), 'wing_mount'));
  }
  g.name = name;
  return g;
}

/** Undertray: flat floor + strakes (schematic). */
function undertray(cfg, nodes) {
  const g = new THREE.Group();
  if (!cfg?.enabled) return g;
  const z = cfg.ground_clearance;
  const hw = cfg.half_width;
  const mat = paintMaterial(cfg.color || '#20242a');
  g.add(plate([[cfg.front_x, hw, z], [cfg.rear_x, hw, z],
               [cfg.rear_x, -hw, z], [cfg.front_x, -hw, z]], mat, 'undertray'));
  for (const st of cfg.strakes ?? []) {
    const y = (st.side === 'right' ? 1 : -1) * hw * (st.y_ratio ?? 0.8);
    const x0 = cfg.front_x + (cfg.rear_x - cfg.front_x) * (st.start_ratio ?? 0.35);
    const x1 = Math.max(x0 + (st.length ?? 400), cfg.rear_x - 50);
    g.add(plate([[x0, y, z], [x1, y, z], [x1, y, z + (st.height ?? 25)]],
                paintMaterial('#4b5563'), 'undertray_strake'));
  }
  g.name = 'undertray';
  return g;
}

/** Diffuser: angled exit + channel dividers (schematic). */
function diffuser(cfg, nodes) {
  const g = new THREE.Group();
  if (!cfg?.enabled) return g;
  const z0 = 30;                       // meets undertray clearance
  const z1 = z0 + cfg.length * Math.tan((cfg.angle * Math.PI) / 180);
  const hw = cfg.exit_half_width;
  const x1 = cfg.start_x - cfg.length;
  const mat = paintMaterial(cfg.color || '#20242a');
  g.add(plate([[cfg.start_x, hw, z0], [x1, hw, z1], [x1, -hw, z1], [cfg.start_x, -hw, z0]],
              mat, 'diffuser'));
  const n = cfg.channels;
  for (let i = 1; i < n; i++) {
    const y = -hw + (2 * hw * i) / n;
    g.add(plate([[cfg.start_x, y, z0], [x1, y, z1], [x1, y, z1 + 40], [cfg.start_x, y, z0 + 40]],
                paintMaterial('#4b5563'), 'diffuser_strake'));
  }
  g.name = 'diffuser';
  return g;
}

export function buildAero(frontWing, rearWing, undertrayCfg, diffuserCfg, nodes) {
  const g = new THREE.Group();
  g.name = 'aero';
  g.add(wing(frontWing, nodes, 'front_wing'));
  g.add(wing(rearWing, nodes, 'rear_wing'));
  g.add(undertray(undertrayCfg, nodes));
  g.add(diffuser(diffuserCfg, nodes));
  return g;
}
