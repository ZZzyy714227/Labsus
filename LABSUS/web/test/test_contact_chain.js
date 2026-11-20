/**
 * test_contact_chain.js —— 接触力链重排 + 落地冲量（2026-11-20 · L1 ②）
 *
 * ## 背景（为什么改）
 * 旧链：轮胎法向力 `Fz` 按轮心积分**之前**的穿透量算出，随后直接进入 Fx/Fy
 * （纵向力 = μ·Fz·滑移）。落地瞬间的假峰值（实测 18~25 kN）被放大成纵向冲量，
 * 于是**同一工况只改外层 dt（内核实为同一 1 ms 子步），末速在 24.8 / 24.8 /
 * 11.8 / 15.3 m/s 之间乱跳** —— 比发散更隐蔽的错误。
 *
 * ## 改动（三处，互为前提）
 * 1. **接触力链重排**：轮心先积分，再用积分后的穿透量重算 `Fz`，下游 Fx/Fy 消费它。
 * 2. **轮胎压缩上限**：`penMax = 0.28·Re`（约胎壁高度）。旧模型允许穿透 100+ mm，
 *    超过侧壁高度后还在长力，是冲量失控的直接来源。
 * 3. **落地冲量事件**：离地→接地**首次**接触时把法向相对速度归零（完全非弹性）。
 *    冲量按速度定义 ⇒ 与 dt 无关，这是"不再随离散化跳变"的关键。
 *    用 `contact` 状态做一次性判定，避免每步都当新落地而反复施加冲量。
 *
 * ## 本测试守什么
 * ① dt 扫描（0.5/1/2/5 ms）8 连跳末速极差 < 5%，且 `diverged` 恒为 0
 * ② 平路/转向锚不被改动（漂移 < 1e-6，实测 ~1e-9）
 * ③ 落地后不反弹成"持续飞行"（末态 Z 贴地）
 * ④ 轮心垂向速度不越物理上限（8 m/s 钳位内）
 */

'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('[PASS] ' + msg); }
  else { failed++; console.error('[FAIL] ' + msg); }
}
const note = (m) => console.log('   ··  ' + m);

const DT_LIST = [0.0005, 0.001, 0.002, 0.005];

function jumpRun(dt) {
  const veh = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 25.0);
  const path = new ctx.StraightPath(25, 'jump_ramp', { rampY: 30.0, rampHeight: 1.10, rampSpacing: 65.0 });
  const env = { grade: 0, path, bumpNoise: 0 };
  let maxVzw = 0;
  for (let i = 0; i < Math.round(16 / dt); i++) {
    const err = 25 - veh.state.u;
    veh.step({ steer: 0, throttle: Math.max(0, Math.min(1, err * 0.8)), brake: 0 }, env, dt);
    for (const id of ['FL', 'FR', 'RL', 'RR']) maxVzw = Math.max(maxVzw, Math.abs(veh.vzw[id] || 0));
    if (!isFinite(veh.state.Z) || !isFinite(veh.state.w)) {
      return { dt, nan: true };
    }
  }
  return { dt, nan: false, endU: veh.state.u, endZ: veh.state.Z, div: veh.diverged || 0, maxVzw };
}

/* ── ① dt 收敛 ── */
console.log('=== ① dt 扫描（8 连跳 16 s）===');
const runs = DT_LIST.map(jumpRun);
for (const r of runs) {
  note('dt=' + (r.dt * 1000) + 'ms 末速=' + (r.nan ? 'NaN' : r.endU.toFixed(2)) +
       ' m/s 末态Z=' + (r.nan ? '-' : r.endZ.toFixed(3)) + ' div=' + (r.div === undefined ? '-' : r.div));
}
const finite = runs.every((r) => !r.nan);
assert(finite, '全部 dt 均无 NaN');
assert(runs.every((r) => (r.div || 0) === 0), '全部 dt 下 diverged 恒为 0');
const us = runs.filter((r) => !r.nan).map((r) => r.endU);
const avg = us.reduce((a, b) => a + b, 0) / us.length;
const spread = (Math.max(...us) - Math.min(...us)) / Math.max(1e-9, Math.abs(avg));
note('末速极差比 = ' + (spread * 100).toFixed(1) + '%（目标 < 5%）');
assert(spread < 0.05, 'dt 扫描末速极差 < 5%（实测 ' + (spread * 100).toFixed(1) + '%）');

/* ── ② 平路/转向锚 ── */
console.log('=== ② 平路与转向锚（不得被接触力链改动）===');
{
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 20.0);
  for (let i = 0; i < 300; i++) v.step({ steer: 0, throttle: 0.3, brake: 0 }, { grade: 0, path: null, bumpNoise: 0 }, 0.002);
  const s = v.state;
  note('平路 20 m/s：Z=' + s.Z.toFixed(9) + ' w=' + s.w.toFixed(9) + ' u=' + s.u.toFixed(6));
  /* 锚值来自改动前 HEAD 实测：Z=-0.005233037 w=-0.000218114 u=20.608527654
     物理改动允许 1e-9 量级浮点漂移，但不允许出现物理性变化。 */
  assert(Math.abs(s.Z - (-0.005233037)) < 1e-6, '平路 Z 锚漂移 < 1e-6');
  assert(Math.abs(s.w - (-0.000218114)) < 1e-6, '平路 w 锚漂移 < 1e-6');
  assert(Math.abs(s.u - 20.608527654) < 1e-4, '平路车速锚漂移 < 1e-4');

  const v2 = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 15.0);
  for (let i = 0; i < 1500; i++) v2.step({ steer: 2.0, throttle: 0.35, brake: 0 }, { grade: 0, path: null, bumpNoise: 0 }, 0.002);
  note('转向 2°：u=' + v2.state.u.toFixed(6) + ' r=' + v2.state.r.toFixed(6));
  assert(Math.abs(v2.state.u - 18.778597001) < 1e-4, '转向稳态车速锚漂移 < 1e-4');
  assert(Math.abs(v2.state.r - (-0.318668781)) < 1e-4, '转向稳态横摆锚漂移 < 1e-4');
}

/* ── ③ 落地后不持续飞行 ── */
console.log('=== ③ 落地后应贴地 ===');
{
  const r = runs.find((x) => x.dt === 0.002) || runs[0];
  note('dt=2ms 末态 Z=' + r.endZ.toFixed(3) + ' m');
  assert(Math.abs(r.endZ) < 0.25, '8 连跳结束后车身贴地（|Z| < 0.25 m）');
}

/* ── ④ 轮心速度物理上限 ── */
console.log('=== ④ 轮心垂向速度上限 ===');
{
  const worst = Math.max(...runs.filter((r) => !r.nan).map((r) => r.maxVzw));
  note('最大 |vzw| = ' + worst.toFixed(2) + ' m/s（钳位 8.0）');
  assert(worst <= 8.05, '轮心垂向速度不超物理上限');
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
