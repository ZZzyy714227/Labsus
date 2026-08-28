// Bottom snapshot timeline — data rows, select/compare, revert
import { state, restoreSnapshot, worstLightOf } from './state.js';
import { runSolve, runAnalyze, refreshPanels } from './main.js';
import { get } from './theme.js';

const KEY_VALUES = ['bump_steer_f', 'roll_gradient', 'ride_freq_r', 'pushrod_force'];

function worstColor(w) {
  return w === 'red' ? get('bad') : w === 'yellow' ? get('warn') : get('good');
}

export function renderHistory(el) {
  if (!state.snapshots.length) {
    el.innerHTML = '<span class="muted">尚无快照 — 调整参数松开后自动记录</span>';
    return;
  }
  el.innerHTML = state.snapshots.map((s, i) => {
    const worst = worstLightOf(s);
    const sel = state.selected.includes(s.id) ? ' sel' : '';
    const cur = s.id === state.currentSnapshotId ? ' cur' : '';
    const prev = state.snapshots[i - 1];
    return `<div class="snap-row${sel}${cur}" data-id="${s.id}">
      <span class="dot dot-${worst}">${i + 1}</span>
      <span class="snap-info">
        <b>${s.ts}</b> ${s.meta || ''}<br>
        ${KEY_VALUES.map(k => {
          const v = (s.analyze?.lights || []).find(l => l.key === k);
          if (!v) return '';
          const pv = prev ? (prev.analyze?.lights || []).find(l => l.key === k) : null;
          const d = pv && pv.value != null && v.value != null && pv.value !== v.value
            ? `<span class="${v.value - pv.value <= 0 ? 'd-good' : 'd-bad'}">${v.value - pv.value <= 0 ? '▼' : '▲'}${Math.abs(v.value - pv.value).toFixed(2)}</span>`
            : '';
          return `<span class="mini">${k.split('_')[0]}=${v.value == null ? '—' : (+v.value).toFixed(2)}${d}</span>`;
        }).join(' ')}
      </span>
      <span class="light" style="width:12px;height:12px;border:2px solid #000;background:${worstColor(worst)}"></span>
    </div>`;
  }).join('');

  el.querySelectorAll('.snap-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const id = +row.dataset.id;
      if (state.selected[0] === id) {
        state.selected = [];                   // deselect
      } else if (state.selected.length >= 2) {
        state.selected = [id];                 // start new pair
      } else {
        state.selected = [...state.selected, id];
      }
      const cmp = document.getElementById('btnCompare');
      cmp.disabled = state.selected.length !== 2;
      renderHistory(el);
      if (state.selected.length === 2) {
        runAnalyze();                          // refresh dashboard in compare mode
      }
    });
    row.addEventListener('dblclick', () => {
      restoreSnapshot(+row.dataset.id);
      refreshPanels();
      runSolve();
      runAnalyze();
      renderHistory(document.getElementById('snapshotList'));
    });
  });
}

/** Revert to the previous snapshot (topbar button). */
export function revertToPrevious() {
  const curIdx = state.snapshots.findIndex(s => s.id === state.currentSnapshotId);
  const target = state.snapshots[curIdx - 1] || state.snapshots[state.snapshots.length - 1];
  if (!target) return;
  restoreSnapshot(target.id);
  refreshPanels();
  runSolve();
  runAnalyze();
  renderHistory(document.getElementById('snapshotList'));
}
