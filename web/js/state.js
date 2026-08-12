// Global shared state — single source of truth
export const state = {
  hardpoints: { front: null, rear: null },   // {CH1: [x,y,z], ...} + scalars
  designParams: { front: null, rear: null },
  vehicle: null,                             // vehicle params dict
  targets: null,                             // band dict
  travel: { front: 0, rear: 0, rack: 0 },
  solveResult: null,                         // last /api/solve response
  analyzeResult: null,                       // last /api/analyze response
  snapshots: [],                             // [{id, ts, params, hardpoints, vehicle, analyze, meta}]
  selected: [],                              // snapshot ids for compare
  currentSnapshotId: null,
  ui: { dashOpen: false, activeTab: 'geometry' },
};

const SNAPSHOT_KEY = 'workbench.snapshots.v1';
const MAX_SNAPSHOTS = 100;

export function loadSnapshots() {
  try { state.snapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); }
  catch { state.snapshots = []; }
}

export function pushSnapshot(meta = {}) {
  const snap = {
    id: Date.now(),
    ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    params: JSON.parse(JSON.stringify(state.designParams)),
    hardpoints: JSON.parse(JSON.stringify(state.hardpoints)),
    vehicle: JSON.parse(JSON.stringify(state.vehicle)),
    analyze: state.analyzeResult,            // full result for compare mode
    ...meta,
  };
  // dedup against the previous snapshot — or the initial design for the
  // very first snapshot (so a pure slider drag never records one)
  const last = state.snapshots[state.snapshots.length - 1];
  const ref = last ?? state.initial;
  if (ref && JSON.stringify(ref.hardpoints) === JSON.stringify(snap.hardpoints)
      && JSON.stringify(ref.vehicle) === JSON.stringify(snap.vehicle)) {
    return null;                              // no design change → skip
  }
  state.snapshots.push(snap);
  if (state.snapshots.length > MAX_SNAPSHOTS) state.snapshots.shift();
  state.currentSnapshotId = snap.id;
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(state.snapshots));
  return snap;
}

export function restoreSnapshot(id) {
  const snap = state.snapshots.find(s => s.id === id);
  if (!snap) return null;
  state.designParams = JSON.parse(JSON.stringify(snap.params));
  state.hardpoints = JSON.parse(JSON.stringify(snap.hardpoints));
  state.vehicle = JSON.parse(JSON.stringify(snap.vehicle));
  state.currentSnapshotId = id;
  return snap;
}

export function worstLightOf(snap) {
  const order = { red: 3, yellow: 2, green: 1 };
  let worst = 'green';
  for (const l of (snap.analyze?.lights || [])) {
    if (order[l.light] > order[worst]) worst = l.light;
  }
  return worst;
}
