// Right column metric dashboard (4-dimension groups, lights, compare mode)
import { state } from './state.js';

const DIMS = [
  { label: '■ 运动学', color: 'cyan', keys: ['camber_delta_f', 'camber_delta_r', 'bump_steer_f', 'bump_steer_r', 'caster_delta_f', 'caster_delta_r', 'kpi_delta_f', 'scrub_delta_f'] },
  { label: '■ 姿态侧倾', color: 'orange', keys: ['roll_gradient', 'rc_height', 'anti_dive', 'anti_squat'] },
  { label: '■ 动力学', color: 'pink', keys: ['ride_freq_f', 'ride_freq_r', 'freq_ratio', 'damping_ratio_f', 'damping_ratio_r', 'motion_ratio_f', 'motion_ratio_r', 'load_transfer_f'] },
  { label: '■ 结构受力', color: 'lime', keys: ['pushrod_force', 'uca_lca_force'] },
];

function lightColor(light) {
  return light === 'green' ? '#00e676' : light === 'yellow' ? '#ffd600' : '#ff1744';
}

function fmt(v) {
  if (v == null) return '—';
  return Math.abs(v) > 100 ? v.toFixed(0) : v.toFixed(2);
}

export function renderDashboard(el) {
  const res = state.analyzeResult;
  if (!res) {
    el.innerHTML = '<div class="muted">展开后自动分析…</div>';
    return;
  }
  const metrics = res.metrics;
  const byKey = {};
  res.lights.forEach(l => { byKey[l.key] = l; });

  const compare = state.selected.length === 2;
  const oldRes = compare
    ? state.snapshots.find(s => s.id === state.selected[0])?.analyze ?? null
    : null;

  el.innerHTML = DIMS.map(dim => {
    const rows = dim.keys.map(k => {
      const l = byKey[k];
      if (!l) return '';
      const cell = compare && oldRes && oldRes.metrics[k] != null
        ? `<span class="old">${fmt(oldRes.metrics[k])}</span>
           <span class="new">${fmt(l.value)}</span>
           <span class="delta ${l.value - oldRes.metrics[k] <= 0 ? 'd-good' : 'd-bad'}">
             ${(l.value - oldRes.metrics[k] <= 0 ? '▼' : '▲')}${Math.abs(l.value - oldRes.metrics[k]).toFixed(2)}
           </span>`
        : `<span class="val">${fmt(l.value)}</span>`;
      return `<div class="m-row"><span class="light" style="background:${lightColor(l.light)}"></span>
              <span class="name">${k}</span>${cell}</div>`;
    }).join('');
    const nRed = dim.keys.filter(k => byKey[k]?.light === 'red').length;
    const nYellow = dim.keys.filter(k => byKey[k]?.light === 'yellow').length;
    const head = compare ? `⇄ 对比中` : (nRed ? `✗ ${nRed} 红` : nYellow ? `⚠ ${nYellow} 黄` : `✓ 全达标`);
    return `<div class="dim-grp grp-${dim.color}">
      <div class="dim-head"><span>${dim.label}</span><span>${head}</span></div>
      ${rows}</div>`;
  }).join('') +
  '<div class="muted">拖动滑块：运动学秒级刷新；重指标松开后 1-2s 更新。</div>';
}
