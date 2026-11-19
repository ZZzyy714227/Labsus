/**
 * test_load_transfer.js —— 纵向载荷转移锚（线 B · B1，2026-11-19）
 *
 * 存在理由：P33 的另一半。修前实测「全力制动 1.19 g 时 |θ| 仅 0.03°、前后轴荷几乎
 * 不转移」——俯仰方程里**没有**纵向惯性力矩项 `SumFy_tire·h_cg`，刹车/加速台架
 * 在物理上无意义。修后必须用**解析锚**锁住：
 *
 *     ΔFz_axle = m · ax · h_cg / wb
 *
 * 这是刚体载荷转移的教科书式（忽略悬架柔度与侧倾分配），对本模型的准稳态足够。
 * 阈值来自实测（2026-11-19，formula 预设）：制动 1.3%、加速 ~7%（瞬态未完全稳态）。
 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js']));
const S = ctx.S;
const V = ctx.window.VehicleDynamics15DOF;
const ENV = { grade: 0, bumpNoise: 0 };
const CTRL0 = { steer: 0, throttle: 0, brake: 0, drs: false };
const G = 9.81;

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

/** 配平后施加 ctrl，返回轴荷增量、俯仰角、纵向加速度 */
function runManeuver(preset, ctrl, secs, legacy) {
  ctx.loadVehiclePreset(preset);
  S.pitchInertia = !legacy;      // 本套件测的就是新物理，故显式开启
  const v = new V(S, {}, 20);
  const dt = 0.001;
  for (let i = 0; i < 2000; i++) v.step(CTRL0, ENV, dt);
  const f0 = v.telemetry.Fz.FL + v.telemetry.Fz.FR;
  const r0 = v.telemetry.Fz.RL + v.telemetry.Fz.RR;
  const n = Math.round((secs || 0.6) / dt);
  let thMax = 0;
  for (let i = 0; i < n; i++) {
    v.step(ctrl, ENV, dt);
    const th = Math.abs(v.state.theta);
    if (Number.isFinite(th) && th > thMax) thMax = th;
  }
  S.legacyPitchInertia = false;
  return {
    dF: (v.telemetry.Fz.FL + v.telemetry.Fz.FR) - f0,
    dR: (v.telemetry.Fz.RL + v.telemetry.Fz.RR) - r0,
    thetaDeg: thMax * 180 / Math.PI,
    axG: v.telemetry.ax,
    m: v.m, wb: v.wb, hcg: v.h_cg
  };
}

const BRAKE = { steer: 0, throttle: 0, brake: 1, drs: false };
const ACCEL = { steer: 0, throttle: 1, brake: 0, drs: false };

console.log('=== 1. 制动：前轴加载 / 后轴减载（方向锁）===');
{
  const r = runManeuver('formula', BRAKE, 0.6);
  note(`ax=${r.axG.toFixed(2)} g · ΔFz前=${r.dF.toFixed(0)} N · ΔFz后=${r.dR.toFixed(0)} N · |θ|=${r.thetaDeg.toFixed(2)}°`);
  assert(r.dF > 50, `制动时前轴加载（ΔFz前 ${r.dF.toFixed(0)} N > 0）`);
  assert(r.dR < -50, `制动时后轴减载（ΔFz后 ${r.dR.toFixed(0)} N < 0）`);
  assert(r.thetaDeg > 0.1, `制动时车身点头（|θ| ${r.thetaDeg.toFixed(2)}° > 0.1°）`);
}

console.log('=== 2. 制动：载荷转移量 vs 解析锚 m·ax·h/wb ===');
{
  const r = runManeuver('formula', BRAKE, 0.6);
  const ax = Math.abs(r.axG) * G;
  const pred = r.m * ax * r.hcg / r.wb;
  const meas = (r.dF - r.dR) / 2;      // 前后增量对称部分 = 转移量
  const err = Math.abs(meas - pred) / pred * 100;
  note(`解析 ${pred.toFixed(0)} N · 实测 ${meas.toFixed(0)} N（${err.toFixed(2)}%）`);
  assert(err < 8, `制动转移量与解析锚吻合（误差 ${err.toFixed(2)}% < 8%）`);
}

console.log('=== 3. 加速：后轴加载 / 前轴减载 ===');
{
  const r = runManeuver('formula', ACCEL, 0.6);
  note(`ax=${r.axG.toFixed(2)} g · ΔFz前=${r.dF.toFixed(0)} N · ΔFz后=${r.dR.toFixed(0)} N`);
  assert(r.dR > 30, `加速时后轴加载（ΔFz后 ${r.dR.toFixed(0)} N > 0）`);
  assert(r.dF < -10, `加速时前轴减载（ΔFz前 ${r.dF.toFixed(0)} N < 0）`);
  const pred = r.m * Math.abs(r.axG) * G * r.hcg / r.wb;
  const meas = (r.dR - r.dF) / 2;
  const err = Math.abs(meas - pred) / pred * 100;
  note(`加速解析 ${pred.toFixed(0)} N · 实测 ${meas.toFixed(0)} N（${err.toFixed(2)}%）`);
  assert(err < 20, `加速转移量与解析锚同量级（误差 ${err.toFixed(2)}% < 20%，瞬态未完全稳态）`);
}

console.log('=== 4. legacy 开关：旧行为无转移（A/B 对照可复现）===');
{
  const oldR = runManeuver('formula', BRAKE, 0.6, true);
  const newR = runManeuver('formula', BRAKE, 0.6, false);
  note(`旧 ΔFz前=${oldR.dF.toFixed(0)} / 新 ΔFz前=${newR.dF.toFixed(0)}`);
  assert(Math.abs(newR.dF) > Math.abs(oldR.dF) * 2.5,
    `新物理的转移显著大于旧行为（${newR.dF.toFixed(0)} vs ${oldR.dF.toFixed(0)} N）`);
  assert(oldR.thetaDeg < 0.1, `旧行为几乎不点头（${oldR.thetaDeg.toFixed(3)}°）`);
}

console.log('=== 5. 四预设方向一致 ===');
{
  for (const p of ['formula', 'gt3', 'gt3_sport', 'baja']) {
    const r = runManeuver(p, BRAKE, 0.5);
    assert(r.dF > 0 && r.dR < 0, `${p}：制动方向正确（前 ${r.dF.toFixed(0)} / 后 ${r.dR.toFixed(0)} N）`);
  }
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} load-transfer checks passed!`);
console.log(`========================================`);
process.exit(0);
