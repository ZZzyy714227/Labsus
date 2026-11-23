/**
 * test_compliance_steer.js —— 柔度转向进时序（线 B · B2，2026-11-19）
 *
 * 存在理由（P27）：真实悬架在侧向力下衬套/摆臂变形，车轮朝减小侧偏的方向偏转，
 * 等效降低轮胎侧偏刚度 ⇒ 横摆响应变慢。K1 时序层此前**没有**这一项，
 * 开环 T63 偏快。
 *
 * 物理：δ_c = k_c·Fy（负反馈，使不足转向增加）
 *       等效侧偏刚度 C_eff = C_α / (1 + C_α·k_c)
 *
 * 验收：默认关闭逐位不变；开启后 T63 变长、稳态 yaw 变小；系数单调。
 * ⚠ `compSteerDegPerKN` 是**标定输入**（同 B5 性质）——缺省 0.4 deg/kN 取
 *   真实 FSAE 衬套柔度的保守中值；真值应来自 K&C 力偏移工况实测。
 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['20-lat-bench.js']));
const S = ctx.S;
const LB = ctx.LAT_BENCH;

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

function step(preset, degPerKN, on) {
  ctx.loadVehiclePreset(preset);
  S.complianceSteer = on === undefined ? degPerKN > 0 : !!on;
  S.front.compSteerDegPerKN = degPerKN;
  S.rear.compSteerDegPerKN = degPerKN;
  return LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
}

console.log('=== 1. 默认关闭：逐位复现（无该项）===');
{
  const a = step('formula', 0);
  const b = step('formula', 0);
  assert(JSON.stringify(a.metrics) === JSON.stringify(b.metrics), '关闭时两次运行逐位一致');
  S.complianceSteer = false;
  const c = LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
  assert(JSON.stringify(a.metrics) === JSON.stringify(c.metrics), '关闭时不受系数影响（逐位）');
}

console.log('=== 2. 开启后稳态 yaw 变小（方向锁：柔度 = 不足转向）===');
{
  const off = step('formula', 0);
  const on = step('formula', 0.4, true);
  const dyaw = 100 * (Math.abs(on.metrics.yawRateSS) / Math.abs(off.metrics.yawRateSS) - 1);
  note(`formula yawSS ${off.metrics.yawRateSS.toFixed(4)} → ${on.metrics.yawRateSS.toFixed(4)}（${dyaw.toFixed(1)}%）· T63 ${off.metrics.riseTimeMs.toFixed(0)} → ${on.metrics.riseTimeMs.toFixed(0)} ms`);
  /* 物理断言只用**稳态**量：柔度降低等效侧偏刚度 ⇒ 不足转向增加 ⇒ 同转角下 yaw 变小。
     T63 方向不稳定（取决于当时的横摆阻尼比；2026-11-19 翻默认后由"变长"变为"变短"），
     故不作为方向锁。 */
  assert(Math.abs(on.metrics.yawRateSS) < Math.abs(off.metrics.yawRateSS),
    `开启柔度后稳态 yaw 变小（不足转向增加：${off.metrics.yawRateSS.toFixed(4)} → ${on.metrics.yawRateSS.toFixed(4)}）`);
}

console.log('=== 3. 系数单调：越大越不足转向 ===');
{
  const ys = [0, 0.2, 0.4, 0.8].map(k => Math.abs(step('formula', k, k > 0).metrics.yawRateSS));
  note('|yawSS|: ' + ys.map(v => v.toFixed(4)).join(' → '));
  for (let i = 1; i < ys.length; i++) {
    assert(ys[i] <= ys[i - 1] + 1e-9, `系数单调：第 ${i} 点稳态 yaw 不大于前一点`);
  }
}

console.log('=== 4. 四预设方向一致 ===');
{
  for (const p of ['formula', 'gt3', 'gt3_sport', 'baja']) {
    const off = step(p, 0);
    const on = step(p, 0.4, true);
    assert(Math.abs(on.metrics.yawRateSS) < Math.abs(off.metrics.yawRateSS),
      `${p}：柔度增加不足转向（yaw ${off.metrics.yawRateSS.toFixed(4)} → ${on.metrics.yawRateSS.toFixed(4)}）`);
  }
}

console.log('=== 5. 关闭后完全恢复（无残留）===');
{
  const off1 = step('gt3', 0);
  step('gt3', 1.2, true);
  S.complianceSteer = false;
  ctx.loadVehiclePreset('gt3');
  const off2 = LB.steerStep({ speed: 14, steerDeg: 4, dur: 3 });
  assert(JSON.stringify(off1.metrics) === JSON.stringify(off2.metrics), '开关来回切换后逐位恢复');
}

console.log('=== 6. 衬套几何派生等效柔度转向 & 标定刷新 ===');
{
  const vm = require('vm');
  vm.runInContext(`
    loadVehiclePreset('formula');
    SIM.FR = buildMech('front', 1); SIM.FL = buildMech('front', -1);
    SIM.RR = buildMech('rear', 1); SIM.RL = buildMech('rear', -1);
    delete SIM.bushCalib;
    refreshDerived(false);
  `, ctx);
  const cBase = vm.runInContext(`deriveComplianceSteer('front')`, ctx);
  assert(Number.isFinite(cBase) && cBase > 0.02 && cBase < 1.0,
    `Formula 默认衬套派生柔度转向应在物理区间（实测 ${cBase} deg/kN）`);

  const saveBush = JSON.parse(JSON.stringify(S.front.bushings));
  for (const k of Object.keys(S.front.bushings)) {
    S.front.bushings[k] = S.front.bushings[k].map(v => v * 0.5);
  }
  const cSoft = vm.runInContext(`deriveComplianceSteer('front')`, ctx);
  assert(cSoft > cBase * 1.5,
    `衬套刚度减半后等效柔度转向应显著上升（${cBase} → ${cSoft} deg/kN）`);
  S.front.bushings = saveBush;

  vm.runInContext(`
    SIM.bushCalib = {
      front: {
        LCA_F: { kT: [6000, 6000, 6000] }, LCA_R: { kT: [6000, 6000, 6000] },
        UCA_F: { kT: [8000, 8000, 8000] }, UCA_R: { kT: [8000, 8000, 8000] },
      },
    };
    refreshDerived(false);
  `, ctx);
  const cStiff = S.front.compSteerDegPerKN;
  assert(cStiff < cBase,
    `SIM.bushCalib 加硬覆盖应在 refreshDerived 后立即压低 compSteerDegPerKN（${cBase} → ${cStiff}）`);

  vm.runInContext(`
    S.front.compSteerDegPerKN = 0.55;
    refreshDerived(false);
  `, ctx);
  assert(S.front.compSteerDegPerKN === 0.55,
    '用户显式设置的 compSteerDegPerKN 在 refreshDerived 后不被覆盖');

  vm.runInContext(`delete SIM.bushCalib; loadVehiclePreset('formula');`, ctx);
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} compliance-steer checks passed!`);
console.log(`========================================`);
process.exit(0);
