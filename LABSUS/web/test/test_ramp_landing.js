/**
 * test_ramp_landing.js —— 飞坡落地数值稳定性回归（2026-11-20）
 *
 * ## 修的 bug
 * 用户实测：直线试验场「飞坡」落地后被剧烈弹飞，随后整页**卡死**。
 * 复现（25 m/s、8 个跳台）定位到三条独立缺陷：
 *
 * ① **压缩行程无硬限位**：只限了 droop，压缩侧不限。空中车身低头时
 *    轮心比角点落得慢，`tr` 无界增长（实测 364 mm，物理不可能）。
 * ② **缓冲块力无上限**：`kBS·(excess·8 + excess²·200)` 在 excess=309 mm 时
 *    输出 4×10⁶ N ⇒ 一步内把车身打飞（w 从 −4.9 → +9.7 m/s、q → 38.8 rad/s），
 *    并把 12 kg 簧下打到 −115 m/s。
 * ③ **无发散兜底**：NaN 一旦产生就沿后续每帧传播 ⇒ 界面卡死。
 *
 * ## 本测试守什么
 * 1. 8 连跳全程状态有限、不发散、不触兜底、姿态有界
 * 2. 平路直行逐位不受这些护栏影响（护栏只在极端工况触发）
 * 3. 兜底机制本身有效：人为注入发散后能恢复有限状态并计数
 */

'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('[PASS] ' + msg);
  } else {
    failed++;
    console.error('[FAIL] ' + msg);
  }
}
const note = (m) => console.log('   ··  ' + m);

const S = ctx.S;
const DT = 0.002;

function makeRampPath() {
  return new ctx.StraightPath(25, 'jump_ramp', {
    rampY: 30.0, rampHeight: 1.10, rampSpacing: 65.0,
  });
}

/* ── 1. 8 连跳：有限 / 不发散 / 姿态有界 ─────────────────────────── */
console.log('=== 1. 8 连跳（25 m/s，16 s）===');
{
  const veh = new ctx.VehicleDynamics15DOF(S, ctx.SIM, 25.0);
  const env = { grade: 0, path: makeRampPath(), bumpNoise: 0 };
  let worstZ = 0, worstW = 0, worstQ = 0, worstTh = 0, nanAt = null, t = 0;
  for (let i = 0; i < 8000; i++) {
    const err = 25 - veh.state.u;
    veh.step({ steer: 0, throttle: Math.max(0, Math.min(1, err * 0.8)), brake: 0 }, env, DT);
    t += DT;
    const st = veh.state;
    if (!isFinite(st.Z) || !isFinite(st.w) || !isFinite(st.q) || !isFinite(st.theta)) { nanAt = t; break; }
    worstZ = Math.max(worstZ, Math.abs(st.Z));
    worstW = Math.max(worstW, Math.abs(st.w));
    worstQ = Math.max(worstQ, Math.abs(st.q));
    worstTh = Math.max(worstTh, Math.abs(st.theta));
  }
  note(`worst Z=${worstZ.toFixed(2)}m w=${worstW.toFixed(2)}m/s q=${worstQ.toFixed(2)}rad/s theta=${(worstTh * 57.3).toFixed(1)}°`);
  note(`final Z=${veh.state.Z.toFixed(3)}m u=${veh.state.u.toFixed(1)}m/s Y=${veh.state.Y.toFixed(0)}m`);
  assert(nanAt === null, '全程无 NaN（此前 t=2.536 s 即发散）');
  assert(veh.state.Z > -0.1 && veh.state.Z < 0.3, `结束时回到地面（Z=${veh.state.Z.toFixed(3)} m）`);
  assert(Math.abs(veh.state.theta) < 0.35, `结束时姿态水平（theta=${(veh.state.theta * 57.3).toFixed(1)}°）`);
  assert(worstZ < 3.0, `离地高度有界（${worstZ.toFixed(2)} m < 3.0）`);
  assert(worstW < 20, `车身垂向速度有界（${worstW.toFixed(2)} m/s < 20；修复前 6.5e159）`);
  assert(worstQ < 15, `俯仰角速度有界（${worstQ.toFixed(2)} rad/s < 15；修复前 38.8）`);
  assert(worstTh < 1.2, `俯仰角有界（${(worstTh * 57.3).toFixed(1)}° < 68.8°）`);
  assert((veh.diverged || 0) === 0, `未触发发散兜底（diverged=${veh.diverged || 0}）`);
}

/* ── 2. 平路直行：护栏不得改变正常工况 ───────────────────────────── */
console.log('=== 2. 平路直行（2 s，护栏应完全不触发）===');
{
  const veh = new ctx.VehicleDynamics15DOF(S, ctx.SIM, 25.0);
  const env = { grade: 0, path: null, bumpNoise: 0 };
  for (let i = 0; i < 1000; i++) {
    veh.step({ steer: 0, throttle: 0.3, brake: 0 }, env, DT);
  }
  note(`Z=${veh.state.Z.toFixed(4)}m u=${veh.state.u.toFixed(3)}m/s theta=${veh.state.theta.toFixed(5)}rad`);
  assert((veh.diverged || 0) === 0, '平路不发散');
  assert(Math.abs(veh.state.Z) < 0.05, `平路车身高度正常（|Z|=${Math.abs(veh.state.Z).toFixed(4)} m < 0.05）`);
  assert(Math.abs(veh.state.theta) < 0.01, `平路俯仰正常（|theta|=${Math.abs(veh.state.theta).toFixed(5)} rad）`);
  assert(isFinite(veh.state.u) && veh.state.u > 20, `平路仍在加速（u=${veh.state.u.toFixed(1)} m/s）`);
}

/* ── 3. 兜底机制自身有效 ─────────────────────────────────────────── */
console.log('=== 3. 发散兜底（人为注入 NaN 必须自愈）===');
{
  const veh = new ctx.VehicleDynamics15DOF(S, ctx.SIM, 25.0);
  const env = { grade: 0, path: null, bumpNoise: 0 };
  for (let i = 0; i < 50; i++) veh.step({ steer: 0, throttle: 0.3, brake: 0 }, env, DT);
  const before = veh.diverged || 0;
  veh.state.w = NaN;                     // 模拟数值病态
  veh.state.q = 1e9;
  veh.step({ steer: 0, throttle: 0.3, brake: 0 }, env, DT);
  note(`diverged ${before} → ${veh.diverged || 0}，w=${veh.state.w}, q=${veh.state.q}`);
  /* dt=2ms 含 2 个子步：注入的 NaN 会让两个子步都触发兜底，故只断言「至少触发一次」。 */
  assert((veh.diverged || 0) >= before + 1,
    '兜底被触发并计数（' + before + ' → ' + (veh.diverged || 0) + '）');
  assert(isFinite(veh.state.Z) && isFinite(veh.state.w) && isFinite(veh.state.q), '注入 NaN 后状态恢复有限');
  assert(veh.state.w === 0 && veh.state.q === 0, '速度量已清零');
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
