// Left column panels: geometry / vehicle / targets
import { state } from './state.js';
import { api } from './api.js';
import { finishDesignChange } from './main.js';

const GEOM_FIELDS = {
  front: ['track', 'wheel_center_z', 'caster', 'kpi', 'kingpin_length',
          'uca_front_y', 'uca_front_z', 'uca_rear_y', 'uca_rear_z',
          'lca_front_y', 'lca_front_z', 'lca_rear_y', 'lca_rear_z',
          'tierod_inner_y', 'tierod_inner_z'],
  rear: ['track', 'wheel_center_z', 'caster', 'kpi',
         'uca_front_y', 'uca_rear_y', 'lca_front_y', 'lca_rear_y'],
};
const VEHICLE_FIELDS = ['mass_kg', 'front_axle_frac', 'rear_axle_frac', 'cg_height_mm',
                        'wheelbase_mm', 'front_track_mm', 'rear_track_mm',
                        'k_spring_f', 'k_spring_r', 'c_damper_f', 'c_damper_r',
                        'k_arb_f', 'k_arb_r', 'ax_brake', 'ax_accel', 'ay_corner'];

export function renderGeometryPanel(el) {
  el.innerHTML =
    ['front', 'rear'].map(axle => `
      <div class="grp-head">${axle === 'front' ? '■ 前轴' : '■ 后轴'}</div>
      ${GEOM_FIELDS[axle].map(f => `
        <label class="field">${f}
          <input type="number" step="0.1" data-axle="${axle}" data-field="${f}"
                 value="${state.designParams?.[axle]?.[f] ?? ''}">
        </label>`).join('')}`).join('') +
    '<button id="btnApplyGeom" class="btn btn-lime" style="width:100%; margin-top:6px;">应用参数</button>';

  el.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.designParams[inp.dataset.axle][inp.dataset.field] = parseFloat(inp.value);
    });
  });
  el.querySelector('#btnApplyGeom').addEventListener('click', applyGeometry);
}

/** Apply edited geometry params → re-derive hardpoints → solve + analyze + snapshot. */
async function applyGeometry() {
  document.querySelectorAll('#panel-geometry input[data-field]').forEach(inp => {
    state.designParams[inp.dataset.axle][inp.dataset.field] = parseFloat(inp.value);
  });
  for (const axle of ['front', 'rear']) {
    const params = {};
    GEOM_FIELDS[axle].forEach(f => { params[f] = state.designParams[axle][f]; });
    const resp = await api.applyParams(axle, params);
    state.hardpoints[axle] = resp.hardpoints;   // fresh derived hardpoints
  }
  finishDesignChange();
}

export function renderVehiclePanel(el) {
  if (!state.vehicle) return;
  el.innerHTML = VEHICLE_FIELDS.map(f => `
    <label class="field">${f}
      <input type="number" step="0.1" data-field="${f}" value="${state.vehicle[f] ?? ''}">
    </label>`).join('') +
    '<button id="btnSaveVehicle" class="btn btn-cyan" style="width:100%; margin-top:6px;">保存整车参数</button>';

  el.querySelector('#btnSaveVehicle').addEventListener('click', async () => {
    const params = {};
    el.querySelectorAll('input[data-field]').forEach(inp => {
      params[inp.dataset.field] = parseFloat(inp.value);
    });
    state.vehicle = params;
    await api.saveVehicle(params);
    runAnalyze();
  });
}

export function renderTargetsPanel(el) {
  if (!state.targets) return;
  el.innerHTML = Object.entries(state.targets).map(([k, band]) => `
    <div class="grp-head">${k}</div>
    <label class="field">绿带 hi <input type="number" step="0.1" data-key="${k}" data-idx="1" value="${band[1]}"></label>
    <label class="field">黄带 hi <input type="number" step="0.1" data-key="${k}" data-idx="3" value="${band[3]}"></label>
  `).join('') +
  '<button id="btnSaveTargets" class="btn btn-orange" style="width:100%; margin-top:6px;">保存目标带</button>';

  el.querySelector('#btnSaveTargets').addEventListener('click', async () => {
    const bands = {};
    el.querySelectorAll('input[data-key]').forEach(inp => {
      const k = inp.dataset.key;
      bands[k] = bands[k] || [...state.targets[k]];
      bands[k][+inp.dataset.idx] = parseFloat(inp.value);
    });
    state.targets = { ...state.targets, ...bands };
    await api.saveTargets(bands);
    runAnalyze();
  });
}
