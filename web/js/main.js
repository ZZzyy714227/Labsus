// Workbench entry — wiring + solve/analyze flows + snapshot engine
import { state, loadSnapshots, pushSnapshot } from './state.js';
import { api } from './api.js';
import { initScene, rebuildCar } from './scene3d.js';
import { renderGeometryPanel, renderVehiclePanel, renderTargetsPanel } from './panels.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory, revertToPrevious } from './history.js';

let solveTimer = null, snapTimer = null;

async function init() {
  loadSnapshots();
  const d = await api.defaults();
  state.designParams = { front: d.params.front, rear: d.params.rear };
  state.hardpoints = { front: d.front.right, rear: d.rear.right };
  state.vehicle = (await api.getVehicle()).params;
  state.targets = (await api.getTargets()).bands;

  initScene(document.getElementById('scene3d'));
  rebuildCar(state.hardpoints.front, state.hardpoints.rear);
  renderGeometryPanel(document.getElementById('panel-geometry'));
  renderVehiclePanel(document.getElementById('panel-vehicle'));
  renderTargetsPanel(document.getElementById('panel-targets'));
  renderHistory(document.getElementById('snapshotList'));

  // tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.panel-body').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${t.dataset.tab}`).classList.remove('hidden');
  }));

  // dashboard toggle (push-based layout)
  const dash = document.getElementById('rightCol');
  document.getElementById('btnDash').addEventListener('click', () => {
    dash.classList.toggle('collapsed');
    document.getElementById('workbench').classList.toggle('dash-open', !dash.classList.contains('collapsed'));
    if (!dash.classList.contains('collapsed')) runAnalyze();
    renderDashboard(document.getElementById('dashboard'));
  });
  document.getElementById('btnDashClose').addEventListener('click', () => {
    dash.classList.add('collapsed');
    document.getElementById('workbench').classList.remove('dash-open');
  });

  // sliders → lightweight solve (throttled), release → analyze + snapshot
  for (const id of ['frontTravel', 'rackTravel']) {
    document.getElementById(id).addEventListener('input', onSliderInput);
    document.getElementById(id).addEventListener('change', onSliderRelease);
  }

  // topbar actions
  document.getElementById('btnCompare').addEventListener('click', () => {
    if (state.selected.length !== 2) {
      state.selected = state.snapshots.slice(-2).map(s => s.id);
    }
    runAnalyze();
    renderDashboard(document.getElementById('dashboard'));
    renderHistory(document.getElementById('snapshotList'));
  });
  document.getElementById('btnRevert').addEventListener('click', revertToPrevious);

  window.__workbench = { state, runAnalyze, runSolve };   // test hook
}

function onSliderInput() {
  state.travel.front = parseFloat(document.getElementById('frontTravel').value);
  state.travel.rack = parseFloat(document.getElementById('rackTravel').value);
  document.getElementById('frontTravelVal').textContent = state.travel.front.toFixed(1) + ' mm';
  document.getElementById('rackVal').textContent = state.travel.rack.toFixed(1) + ' mm';
  document.getElementById('solveStatus').textContent = '计算中…';
  clearTimeout(solveTimer);
  solveTimer = setTimeout(runSolve, 80);          // throttled lightweight solve
}

function onSliderRelease() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(async () => {
    await runAnalyze();                             // heavy metrics first
    const snap = pushSnapshot({});                  // then snapshot with fresh analyze
    if (snap) renderHistory(document.getElementById('snapshotList'));
  }, 800);
}

/** Re-render left panels (after snapshot restore). */
export function refreshPanels() {
  renderGeometryPanel(document.getElementById('panel-geometry'));
  renderVehiclePanel(document.getElementById('panel-vehicle'));
  renderTargetsPanel(document.getElementById('panel-targets'));
}

export async function runSolve() {
  const body = {
    front_hardpoints: state.hardpoints.front,
    rear_hardpoints: state.hardpoints.rear,
    front_travel: state.travel.front,
    rear_travel: 0,
    rack_displacement: state.travel.rack,
  };
  try {
    const t0 = performance.now();
    state.solveResult = await api.solve(body);
    const dt = Math.round(performance.now() - t0);
    document.getElementById('solveStatus').textContent = `求解 ${dt}ms`;
    // merge solved uprights back into hardpoints so the 3D view shows bump
    for (const axleKey of ['front', 'rear']) {
      const side = state.solveResult[axleKey]?.right;
      if (side) {
        for (const k of ['UP1', 'UP2', 'UP3', 'UP4', 'UP5']) {
          if (side[k]) state.hardpoints[axleKey][k] = side[k];
        }
      }
    }
    rebuildCar(state.hardpoints.front, state.hardpoints.rear);
  } catch (e) {
    document.getElementById('solveStatus').textContent = '求解失败';
    console.error('solve failed', e);
  }
}

export async function runAnalyze() {
  try {
    const t0 = performance.now();
    const res = await api.analyze({
      front_hardpoints: state.hardpoints.front,
      rear_hardpoints: state.hardpoints.rear,
      vehicle: state.vehicle,
    });
    state.analyzeResult = res;
    const dt = Math.round(performance.now() - t0);
    const nRed = res.lights.filter(l => l.light === 'red').length;
    const nYellow = res.lights.filter(l => l.light === 'yellow').length;
    const total = res.lights.length;
    const badge = document.getElementById('summaryLight');
    badge.textContent = nRed === 0 && nYellow === 0
      ? `● ${total}/${total}`
      : nRed === 0
        ? `● ${total - nYellow}/${total} ⚠`
        : `✗ ${total - nRed}/${total}`;
    badge.style.background = nRed ? '#ff1744' : nYellow ? '#ffd600' : '#00e676';
    if (!document.getElementById('rightCol').classList.contains('collapsed')) {
      renderDashboard(document.getElementById('dashboard'));
    }
    document.getElementById('solveStatus').textContent = `分析 ${dt}ms`;
  } catch (e) {
    console.error('analyze failed', e);
  }
}

init();
