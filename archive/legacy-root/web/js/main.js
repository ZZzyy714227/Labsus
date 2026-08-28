// Workbench entry — wiring + solve/analyze flows + snapshot engine
import { state, loadSnapshots, pushSnapshot } from './state.js';
import { api } from './api.js';
import {
  initScene, setCarStatic, setCarDynamic, setView, exportPointSet, getPointSetSummary, setSceneBackground,
} from './scene3d.js';
import {
  loadTheme, saveTheme, resetTheme, applyUI, apply3D, sceneBackgroundHex, PANEL_SECTIONS, get,
} from './theme.js';
import { renderGeometryPanel, renderVehiclePanel, renderTargetsPanel } from './panels.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory, revertToPrevious } from './history.js';

let solveTimer = null, snapTimer = null;

async function init() {
  loadSnapshots();
  const d = await api.defaults();
  state.designParams = { front: d.params.front, rear: d.params.rear };
  state.hardpoints = { front: d.front.right, rear: d.rear.right };
  state.defaultsData = d;
  state.vehicle = (await api.getVehicle()).params;
  state.targets = (await api.getTargets()).bands;
  // initial design reference — snapshots dedup against this
  state.initial = {
    hardpoints: JSON.parse(JSON.stringify(state.hardpoints)),
    vehicle: JSON.parse(JSON.stringify(state.vehicle)),
  };

  initScene(document.getElementById('scene3d'));
  setCarStatic(d);
  setCarDynamic(d.front, d.rear, null, 0);
  wireViewToolbar();
  renderGeometryPanel(document.getElementById('panel-geometry'));
  renderVehiclePanel(document.getElementById('panel-vehicle'));
  renderTargetsPanel(document.getElementById('panel-targets'));
  renderHistory(document.getElementById('snapshotList'));
  initTheme();

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

  window.__workbench = { state, runAnalyze, runSolve, setCarDynamic, getPointSetSummary, setView };   // test hook
}

/** 3D viewport toolbar: view presets + point-set export panel. */
function wireViewToolbar() {
  document.querySelectorAll('#viewToolbar [data-view]').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });
  document.getElementById('btnPointsetJson').addEventListener('click', () => exportPointSet('json'));
  document.getElementById('btnPointsetCsv').addEventListener('click', () => exportPointSet('csv'));

  const panel = document.getElementById('pointsetPanel');
  const renderPanel = () => {
    const s = getPointSetSummary();
    document.getElementById('pointsetList').innerHTML =
      `<div class="ps-total mono">总点数 ${s.total.toLocaleString()}（整车系坐标 mm，X前 Y右 Z上）</div>` +
      s.items.map((i) =>
        `<div class="ps-row"><span>${i.part}</span><span class="mono">${i.points.toLocaleString()}</span></div>`
      ).join('');
  };
  document.getElementById('btnPointsetPanel').addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderPanel();
  });
  document.getElementById('btnPointsetClose').addEventListener('click', () => {
    panel.classList.add('hidden');
  });
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
    const snap = pushSnapshot({ meta: diffMeta() }); // snapshot only design changes
    if (snap) renderHistory(document.getElementById('snapshotList'));
  }, 800);
}

/** Describe design-parameter changes vs the previous snapshot ('' if none). */
function diffMeta() {
  const prev = state.snapshots[state.snapshots.length - 1];
  if (!prev) return '';
  const changes = [];
  for (const axle of ['front', 'rear']) {
    const cur = state.designParams[axle] || {};
    const old = prev.params?.[axle] || {};
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'number' && old[k] !== undefined && old[k] !== v) {
        changes.push(`${k} ${old[k]}→${v}`);
      }
    }
  }
  return changes.slice(0, 3).join(' · ');
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
    // hardpoints stay at DESIGN positions (snapshot dedup relies on this);
    // the 3D view shows the solved travel pose instead
    setCarDynamic(state.hardpoints.front, state.hardpoints.rear,
                  state.solveResult, state.travel.rack);
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
    badge.style.background = nRed ? get('bad') : nYellow ? get('warn') : get('good');
    if (!document.getElementById('rightCol').classList.contains('collapsed')) {
      renderDashboard(document.getElementById('dashboard'));
    }
    document.getElementById('solveStatus').textContent = `分析 ${dt}ms`;
  } catch (e) {
    console.error('analyze failed', e);
  }
}

/** Solve + analyze + snapshot after a design change (apply button). */
export async function finishDesignChange() {
  runSolve();
  await runAnalyze();
  const snap = pushSnapshot({ meta: diffMeta() });
  if (snap) renderHistory(document.getElementById('snapshotList'));
}

init();

/* ================= 统一配色入口 ================= */

/** 把当前主题一次性应用到位（CSS 变量 + 3D 材质 + 场景背景） */
function applyThemeAll() {
  applyUI();
  apply3D();
  setSceneBackground(sceneBackgroundHex());
}

/** 构建配色编辑器浮层，绑定切换 / 编辑 / 导出 / 重置 */
function initTheme() {
  loadTheme();
  applyThemeAll();

  const overlay = document.getElementById('themeOverlay');
  const list = document.getElementById('themeList');

  // 渲染三个分组的颜色行
  list.innerHTML = PANEL_SECTIONS.map((sec) => {
    const rows = sec.keys.map(([key, label]) => {
      const seg = key in loadTheme().ui ? loadTheme().ui
        : key in loadTheme().semantic ? loadTheme().semantic : loadTheme().mat;
      const val = seg[key];
      return `<label class="theme-row">
        <span class="theme-name">${label}</span>
        <span class="theme-swatch" data-swatch="${key}" style="background:${val}"></span>
        <input type="color" class="theme-input" data-key="${key}" value="${val}">
        <span class="theme-hex" data-hex="${key}">${val}</span>
      </label>`;
    }).join('');
    return `<div class="theme-grp"><div class="theme-grp-title">${sec.title}</div>${rows}</div>`;
  }).join('');

  // 打开 / 关闭
  const openBtn = document.getElementById('btnTheme');
  const setOpen = (on) => overlay.classList.toggle('hidden', !on);
  openBtn.addEventListener('click', () => setOpen(overlay.classList.contains('hidden')));
  document.getElementById('btnThemeClose').addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });

  // 实时改色 → 更新数据源 + 应用 + 持久化
  list.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.classList.contains('theme-input')) return;
    const t = loadTheme();
    const key = input.dataset.key;
    const seg = key in t.ui ? t.ui : key in t.semantic ? t.semantic : t.mat;
    seg[key] = input.value.toUpperCase();
    const swatch = list.querySelector(`[data-swatch="${key}"]`);
    const hex = list.querySelector(`[data-hex="${key}"]`);
    if (swatch) swatch.style.background = input.value;
    if (hex) hex.textContent = input.value.toUpperCase();
    applyThemeAll();
    saveTheme();
  });

  // 导出为 JSON（复制到剪贴板）
  document.getElementById('btnThemeExport').addEventListener('click', async () => {
    const json = JSON.stringify(loadTheme(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert('配色 JSON 已复制到剪贴板');
    } catch {
      alert(json);
    }
  });

  // 重置为默认配色
  document.getElementById('btnThemeReset').addEventListener('click', () => {
    resetTheme();
    applyThemeAll();
    list.querySelectorAll('.theme-input').forEach((i) => {
      const t = loadTheme();
      const key = i.dataset.key;
      const seg = key in t.ui ? t.ui : key in t.semantic ? t.semantic : t.mat;
      i.value = seg[key];
      const swatch = list.querySelector(`[data-swatch="${key}"]`);
      const hexEl = list.querySelector(`[data-hex="${key}"]`);
      if (swatch) swatch.style.background = seg[key];
      if (hexEl) hexEl.textContent = seg[key];
    });
  });
}
