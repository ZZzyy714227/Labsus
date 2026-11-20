/**
 * perf_tier_matrix.cjs —— 性能档位 5×5 圈速矩阵（2026-11-20）
 *
 * 复用**同一套**闭环裁判（`test_lap_15dof.js` 的 CircuitPath + UniversalAutoPilot +
 * VehicleDynamics15DOF），只改"轮胎档 × 动力档"，输出每组合的最快圈时间。
 *
 * 用法：
 *   node tools/perf_tier_matrix.cjs                # 5×5 全矩阵，1 圈
 *   node tools/perf_tier_matrix.cjs 2              # 5×5 全矩阵，2 圈取最快
 *   node tools/perf_tier_matrix.cjs 2 5 5          # 只跑 tire5 × power5（用于长跑校验）
 *
 * ⚠ 这是**测量工具**，不是门禁：没有阈值断言，只负责把数字打出来。
 */
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const nLaps = Number(args[0] || 1);
const onlyT = args[1] ? Number(args[1]) : null;
const onlyP = args[2] ? Number(args[2]) : null;

const webDir = path.join(__dirname, '..', 'web');
const { _internals } = require(path.join(webDir, 'test', 'test_lap_15dof.js'));
const { loadReal, makeSweep, runLaps } = _internals;

const R = loadReal(webDir);
const ctx = R.ctx;
const perf = ctx.window.PERF;
if (!perf) {
  console.error('未加载 PERF 档位表（16-powertrain.js）');
  process.exit(1);
}

const SIM_BASE = {
  mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63,
  swF: makeSweep(1.0), swR: makeSweep(1.0),
};

function runCombo(tierT, tierP) {
  perf.apply({ tire: tierT, power: tierP });
  const tp = perf.tireParams(tierT);
  const sim = Object.assign({}, SIM_BASE, { userTire: tp, tireCalibEy: tp.Ey });
  /* 车能力表（21-car-capability）读的是 `SIMref()` → `SIM` / `window.SIM`。
     必须把当前档位的轮胎同步进去，否则低抓地档仍按缺省胎算"车能跑多快"，
     结果车被按超能力的包络推进赛道外（实测 T1 直接 DIV、横向偏差 80m）。 */
  try { if (ctx.window) ctx.window.SIM = sim; } catch (e) {}
  const t0 = Date.now();
  const r = runLaps(ctx, R.wp, sim, nLaps, { pilotType: process.env.PERF_PILOT || 'stanley' });
  return {
    best: isFinite(r.bestLap) ? r.bestLap : NaN,
    laps: r.lapTimes || [],
    envT: r.envT,
    maxAy: r.maxAy,
    peakSlip: r.peakSlip,
    maxLat: r.maxLat,
    overEdge: r.overEdge,
    diverged: r.diverged, nan: r.nan,
    ms: Date.now() - t0,
  };
}

/* 档位子集：PERF_TIRES="3,4,5" / PERF_POWERS="1,3,5" 只跑关心组合（高抓地档单圈
   仿真步数会暴涨到 1~3 分钟/圈，全 25 格要跑 40 分钟以上）。 */
const pickList = (all, envName) => {
  const raw = process.env[envName];
  if (!raw) return all;
  const ids = raw.split(',').map(x => Number(x.trim())).filter(x => x > 0);
  return all.filter(x => ids.includes(x.id));
};
const T = pickList(perf.TIRE_TIERS, 'PERF_TIRES');
const P = pickList(perf.POWER_TIERS, 'PERF_POWERS');
const grid = [];
console.log(`== 性能档位圈速矩阵（${nLaps} 圈取最快）==`);
console.log('轮胎档：' + T.map(t => `${t.id}:${t.name}(μ${t.mu})`).join('  '));
console.log('动力档：' + P.map(p => `${p.id}:${p.name}(${p.kw}kW)`).join('  '));
console.log('');

if (onlyT && onlyP) {
  const r = runCombo(onlyT, onlyP);
  console.log(`T${onlyT} × P${onlyP}: best=${r.best.toFixed(3)}s env=${r.envT.toFixed(3)}s ` +
    `ratio=${(r.best / r.envT).toFixed(3)} maxAy=${r.maxAy.toFixed(2)}g slip=${r.peakSlip.toFixed(1)}° ` +
    `lat=${r.maxLat.toFixed(2)}m edge=${r.overEdge} nan=${r.nan} div=${r.diverged} (${r.ms}ms)`);
  process.exit(0);
}

for (const t of T) {
  const row = { tire: t.id, cells: [] };
  let line = `T${t.id} ${t.name.padEnd(8)} `;
  for (const p of P) {
    const r = runCombo(t.id, p.id);
    row.cells.push({ power: p.id, ...r });
    grid.push({ t: t.id, p: p.id, ...r });
    const bad = r.nan ? ' NaN' : (r.diverged ? ' DIV' : '');
    line += ` P${p.id}=${isFinite(r.best) ? r.best.toFixed(2) : '----'}s${bad}`;
  }
  console.log(line);
}

/* ── 汇总：与"档1/档1"基线对比 ── */
const base = grid.find(g => g.t === 1 && g.p === 1);
const best = grid.reduce((a, b) => (isFinite(b.best) && (!a || b.best < a.best) ? b : a), null);
console.log('');
if (base && isFinite(base.best)) {
  console.log(`基线 T1×P1 = ${base.best.toFixed(2)}s（包络 ${base.envT.toFixed(2)}s）`);
  console.log(`最快 ${best.t}/${best.p} = ${best.best.toFixed(2)}s → 提升 ${(base.best - best.best).toFixed(2)}s ` +
    `(${(100 * (base.best - best.best) / base.best).toFixed(1)}%)`);
  const d55 = grid.find(g => g.t === 5 && g.p === 5);
  if (d55 && isFinite(d55.best)) {
    console.log(`默认档 T5×P5 = ${d55.best.toFixed(2)}s → 相对基线 ${(base.best - d55.best).toFixed(2)}s ` +
      `(${(100 * (base.best - d55.best) / base.best).toFixed(1)}%)`);
  }
}
/* 轮胎/动力各自的边际贡献（固定另一维在 5 档） */
for (const p of P) {
  const a = grid.find(g => g.t === 1 && g.p === p.id), b = grid.find(g => g.t === 5 && g.p === p.id);
  if (a && b && isFinite(a.best) && isFinite(b.best)) {
    console.log(`  轮胎 T1→T5 @P${p.id}: ${a.best.toFixed(2)} → ${b.best.toFixed(2)}s ` +
      `(${(100 * (a.best - b.best) / a.best).toFixed(1)}%)`);
  }
}
for (const t of T) {
  const a = grid.find(g => g.t === t.id && g.p === 1), b = grid.find(g => g.t === t.id && g.p === 5);
  if (a && b && isFinite(a.best) && isFinite(b.best)) {
    console.log(`  动力 P1→P5 @T${t.id}: ${a.best.toFixed(2)} → ${b.best.toFixed(2)}s ` +
      `(${(100 * (a.best - b.best) / a.best).toFixed(1)}%)`);
  }
}
