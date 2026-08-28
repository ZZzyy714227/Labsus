// car3d — point-set collector: complete 3D coordinate set of the rendered car.
// All geometry lives in CAR-FRAME coordinates (X forward, Y right, Z up, mm);
// the world transform is a matrix on carGroup, never baked into vertices —
// so reading position attributes directly yields the true car-frame point set.
import * as THREE from 'three';

/** Collect vertices grouped by userData.part. Returns {part: [[x,y,z],...]}. */
export function collectPointSet(root) {
  const parts = {};
  let total = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const part = obj.userData.part || 'unknown';
    const pos = obj.geometry.getAttribute('position');
    if (!pos) return;
    // De-duplicate within this geometry (indexed geometry repeats vertices)
    const seen = new Set();
    const pts = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push([round3(x), round3(y), round3(z)]);
    }
    if (!parts[part]) parts[part] = [];
    parts[part].push(...pts);
    total += pts.length;
  });
  return { parts, total };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** JSON export object. */
export function pointSetToJSON(root, meta = {}) {
  const { parts, total } = collectPointSet(root);
  const byPart = {};
  for (const [k, v] of Object.entries(parts)) byPart[k] = v;
  return {
    meta: {
      units: 'mm',
      coordinate_system: 'car frame (X forward, Y right, Z up, origin: front axle center @ ground)',
      total_points: total,
      generated_at: new Date().toISOString(),
      ...meta,
    },
    parts: byPart,
  };
}

/** CSV rows: x,y,z,part */
export function pointSetToCSV(root) {
  const { parts } = collectPointSet(root);
  const rows = ['x,y,z,part'];
  for (const [part, pts] of Object.entries(parts)) {
    for (const [x, y, z] of pts) rows.push(`${x},${y},${z},${part}`);
  }
  return rows.join('\n');
}

/** Trigger a browser download of the point set. */
export function downloadPointSet(root, format = 'json') {
  const isCSV = format === 'csv';
  const content = isCSV ? pointSetToCSV(root) : JSON.stringify(pointSetToJSON(root), null, 2);
  const blob = new Blob([content], {
    type: isCSV ? 'text/csv;charset=utf-8' : 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fsae_pointset_${Date.now()}.${isCSV ? 'csv' : 'json'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return content;
}

/** Compact per-part summary for the UI panel: {part, points} list. */
export function pointSetSummary(root) {
  const { parts, total } = collectPointSet(root);
  return {
    total,
    items: Object.entries(parts)
      .map(([part, pts]) => ({ part, points: pts.length }))
      .sort((a, b) => b.points - a.points),
  };
}
