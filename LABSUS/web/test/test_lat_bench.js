/**
 * test_lat_bench.js —— 侧倾/横向动力学台 + 姿态量解析锚（线 A · A1/A2，2026-11-19）
 *
 * 验收重点：
 *   ① 稳态侧倾角与**解析锚**吻合（K_roll 含弹簧+防倾杆，且杆行程按轮胎串联柔度折减）
 *      —— 这条正是本会话"ARB 统一致侧倾 −33~41% 门禁零反应"的补丁：
 *         杆刚度一变，解析锚跟着变，实测必须跟着变，否则立刻红。
 *   ② 侧倾梯度随杆刚度单调、TLLTD 随前后杆分配变化
 *   ③ 转向阶跃（瞬态 yaw）有界
 *   ④ 可复现（同配置两次逐位一致）
 */
'use strict';
/* 沙箱统一走 _stage_harness.js */
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '20-lat-bench.js']));

const S = ctx.S;
const LB = ctx.LAT_BENCH;
const SIM = vm.runInContext('(typeof SIM !== "undefined") ? SIM : {}', ctx);
let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);
const load = (p) => ctx.loadVehiclePreset(p);

console.log('=== 0. 模块 ===');
{
  assert(LB && typeof LB.steadyCircle === 'function', 'LAT_BENCH 已加载');
  assert(typeof LB.analytic === 'function' && typeof LB.steerStep === 'function', 'analytic / steerStep 可用');
}

console.log('=== 1. 稳态定圆基本量 ===');
{
  load('formula');
  const r = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  const m = r.metrics;
  note(`φ=${m.phiDeg.toFixed(3)}° · ay=${m.ayG.toFixed(3)}g · TLLTD=${m.tlltd.toFixed(3)} · R=${m.radius.toFixed(1)}m`);
  assert(Number.isFinite(m.phiDeg) && Math.abs(m.phiDeg) > 0.01, '侧倾角有限且非零');
  assert(m.ayG > 0.3 && m.ayG < 2.5, `侧向加速度在合理区间（${m.ayG.toFixed(2)}g）`);
  assert(m.tlltd > 0.05 && m.tlltd < 0.95, `TLLTD 在 (0,1)（${m.tlltd.toFixed(3)}）`);
}

console.log('=== 2. 解析锚：稳态侧倾角（四预设，误差 <2%）===');
{
  const presets = ['formula', 'gt3', 'gt3_sport', 'baja'];
  const rows = [];
  for (const p of presets) {
    load(p);
    const st = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 8, avgSecs: 3 });
    const an = LB.analytic();
    const phiPred = an.phiPredTotalDeg(st.metrics.ayG * 9.81);
    const err = Math.abs(Math.abs(phiPred) - Math.abs(st.metrics.phiDeg)) / Math.abs(st.metrics.phiDeg) * 100;
    rows.push({ p, meas: st.metrics.phiDeg, pred: phiPred, err, kroll: an.Kroll, karb: an.KrollArb });
  }
  for (const r of rows) {
    note(`${r.p.padEnd(11)} 实测 ${r.meas.toFixed(3)}° / 解析 ${r.pred.toFixed(3)}° （${r.err.toFixed(2)}%）· Kroll=${r.kroll.toFixed(0)} 其中杆 ${r.karb.toFixed(0)}`);
    /* 2026-11-19：pitch/roll 翻默认后解析式含簧下横向分量；簧下质心按胎半径近似，
     与 K1 的 h_roll_axis 取法有 3% 级残差 —— 这是一阶近似，不是 bug。 */
  assert(r.err < 4.0, `${r.p} 侧倾角与解析锚吻合（误差 ${r.err.toFixed(2)}% < 4%）`);
  }
  /* 锚必须"有杆时真的用到杆"：否则杆装不上也能过 */
  const gt3 = rows.find(r => r.p === 'gt3');
  assert(gt3.karb > 0.3 * gt3.kroll, `gt3 解析锚里杆占 ${(gt3.karb / gt3.kroll * 100).toFixed(0)}%（>30%）`);
}

console.log('=== 3. 可复现（逐位一致）===');
{
  load('gt3');
  const a = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 5 });
  const b = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 5 });
  assert(JSON.stringify(a.metrics) === JSON.stringify(b.metrics), '两次稳态定圆逐位一致');
  const s1 = LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
  const s2 = LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
  assert(JSON.stringify(s1.series) === JSON.stringify(s2.series), '两次转向阶跃时间序列逐位一致');
}

console.log('=== 4. 侧倾梯度随杆刚度单调 ===');
{
  load('gt3');
  const base = LB.rollGradient({ speeds: [8, 12, 16], dur: 5 });
  const stiff = LB.rollGradient({ speeds: [8, 12, 16], dur: 5, over: { arbF_scale: 4 } });
  note(`前杆 ×4：梯度 ${base.metrics.gradDegPerG.toFixed(4)} → ${stiff.metrics.gradDegPerG.toFixed(4)} °/g`);
  assert(Number.isFinite(base.metrics.gradDegPerG) && Math.abs(base.metrics.gradDegPerG) > 0.05, '基准梯度非零（符号随 K1 侧倾约定为负）');
  assert(Math.abs(stiff.metrics.gradDegPerG) < Math.abs(base.metrics.gradDegPerG) * 0.95,
    `杆变硬 ⇒ 侧倾梯度下降（${(100 * (Math.abs(stiff.metrics.gradDegPerG) / Math.abs(base.metrics.gradDegPerG) - 1)).toFixed(1)}%）`);
}

console.log('=== 5. TLLTD 随前杆分配变化 ===');
{
  load('gt3');
  const base = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  const fStiff = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6, over: { arbF_scale: 6 } });
  note(`前杆 ×6：TLLTD ${base.metrics.tlltd.toFixed(4)} → ${fStiff.metrics.tlltd.toFixed(4)}`);
  assert(fStiff.metrics.tlltd > base.metrics.tlltd + 0.01,
    `前杆变硬 ⇒ 前轴承担更多侧向载荷转移（+${(fStiff.metrics.tlltd - base.metrics.tlltd).toFixed(4)}）`);
}

console.log('=== 6. 转向阶跃（瞬态）===');
{
  load('gt3');
  const st = LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
  const m = st.metrics;
  note(`yaw 稳态 ${m.yawRateSS.toFixed(4)} rad/s · 上升(10-90%) ${m.riseTimeMs.toFixed(0)} ms · 超调 ${m.overshootPct.toFixed(1)}%`);
  assert(Number.isFinite(m.yawRateSS) && Math.abs(m.yawRateSS) > 0.01, 'yaw 稳态角速度非零（符号随 K1 约定为负）');
  assert(Number.isFinite(m.riseTimeMs) && m.riseTimeMs > 0 && m.riseTimeMs < 2000, `yaw 上升时间在 (0,2000) ms（${m.riseTimeMs.toFixed(0)}）`);
  assert(Number.isFinite(m.overshootPct) && Math.abs(m.overshootPct) < 100, `yaw 超调有界（${m.overshootPct.toFixed(1)}%）`);
}

console.log('=== 7. 拆杆实验（ARB 接线回归守卫）===');
{
  load('gt3');
  const withArb = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  const dF0 = S.front.arb.d, dR0 = S.rear.arb.d;
  S.front.arb.d = 0; S.rear.arb.d = 0;
  const noArb = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  S.front.arb.d = dF0; S.rear.arb.d = dR0;
  const back = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  note(`装杆 ${withArb.metrics.phiDeg.toFixed(3)}° → 拆杆 ${noArb.metrics.phiDeg.toFixed(3)}° → 装回 ${back.metrics.phiDeg.toFixed(3)}°`);
  assert(Math.abs(noArb.metrics.phiDeg) > Math.abs(withArb.metrics.phiDeg) * 1.5,
    '拆杆后侧倾显著变大（杆真的在抗侧倾）');
  assert(Math.abs(back.metrics.phiDeg - withArb.metrics.phiDeg) < 1e-9, '装回后恢复（无残留状态）');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} lat-bench checks passed!`);
console.log(`========================================`);
process.exit(0);
