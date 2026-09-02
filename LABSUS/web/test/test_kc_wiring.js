/* LABSUS K&C 接线回归测试（G23，2026-09-02）。
 *
 * ── 建立起因 ────────────────────────────────────────────────────
 * 前端实时引擎 VehicleDynamics15DOF 只从 SIM 读了 mrRefF/mrRefR（运动比）与
 * rcH_F/rcH_R（侧倾中心高度），【完全没有读 SIM.swF / SIM.swR】——即用户自己
 * 解算出来的 K&C 扫掠 LUT（camber / toe / mr / kw / rcH 随行程变化）。取而代之
 * 是 6 个硬编码常数：
 *     dCamber_dz_F = -0.038 deg/mm      staticCamber = -2.8 / -1.8
 *     dCamber_dz_R = -0.026 deg/mm      C_gamma      = 4500 / 3500 N/rad
 *     dBumpSteer_dz_F = 0.012 deg/mm
 *     dBumpSteer_dz_R = 0.007 deg/mm
 * 后果：重新设计整套双叉臂硬点，车在赛道上的行为几乎不变（只经运动比、
 * 侧倾中心高度、轮距三条弱通道生效）。对一个定位"真实赛车底盘悬架开发"的
 * 工具，这是最伤的一条断线。
 *
 * 而数据本来就已经算好了：SIM.swF/swR 由 runSweep() 产出完整行程表，
 * 09-track.js:398 已在把它打包成 kc_luts 发给引擎侧，transient.py 也确实在用。
 * 只有前端实时引擎没接。
 *
 * ── 行程口径（已与渲染层核对一致）───────────────────────────────
 * step() 里 tr_w（米，正=压缩）× 1000 == runSweep 的 tr（毫米）==
 * 渲染层 driveTo(SIM.FR, z0F + tr.FR*1000, ...) 用的同一个量。三处同口径。
 *
 * ── 本检查做什么 ────────────────────────────────────────────────
 * 用受控 LUT 夹具断言：camber/toe 必须来自 LUT 插值而非硬编码常数；
 * 改几何必须改变车辆行为；LUT 缺失时必须安全回退；左右镜像与行程钳位正确。
 * 全部断言在接线前 FAIL、接线后 PASS。
 *
 * 用法：
 *   作为库：require('./test_kc_wiring')(webDir, ok, fail)
 *   单独跑：node web/test/test_kc_wiring.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 受控 LUT 夹具 ──────────────────────────────────────────────
 * cam 单位 deg（负=上端内倾），toe 单位 deg，tr 单位 mm（正=压缩）。
 * 故意造成【非线性】且与旧硬编码常数完全不同的数值，这样一旦接线成功，
 * 结果不可能与"staticCamber + dCamber_dz*tr"巧合相等。 */
function makeSweep(tag) {
  const k = tag === 'B' ? 1.6 : 1.0;     // B 套件 = 不同的悬架几何
  const rows = [];
  for (const tr of [-60, -40, -20, 0, 20, 40, 65]) {
    rows.push({
      tr,
      cam: -(2.20 + 0.0155 * tr + 0.000045 * tr * tr) * k,   // 非线性外倾增益
      toe: (0.02 + 0.0021 * tr - 0.000012 * tr * tr) * k,    // 非线性 bump steer
      mr: 0.74 + 0.0004 * tr,
      kw: 60000 * Math.pow(0.74 + 0.0004 * tr, 2),
      rcH: 52 + 0.06 * tr
    });
  }
  return { rows, min: -60, max: 65 };
}

function makeS(tag) {
  return {
    mTotal: 1250, wb: 2600, hcg: 350,
    front: { hp: { WC: [750, 0, 300] }, tire: { R: 330, W: 280, rim: 240, disc: 150 },
             kS: 60, cR: 3.5, mr: 0.75, arb: { d: 20 }, limF: [-60, 65] },
    rear:  { hp: { WC: [700, 0, 300] }, tire: { R: 330, W: 300, rim: 240, disc: 150 },
             kS: 65, cR: 4.0, mr: 0.78, arb: { d: 18 }, limR: [-60, 65] },
    qs: { aeroF: 500, speed: 160 }
  };
}

function makeSIM(tag) {
  return {
    mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63,
    swF: makeSweep(tag), swR: makeSweep(tag)
  };
}

/* ── 加载真实源码（只切出被测符号，避开无关顶层副作用）────────── */
function loadReal(webDir) {
  const ctx = {
    window: {}, console, Math, Number, Array, Object, JSON, String, Boolean,
    isFinite, isNaN, parseInt, parseFloat, Error, Date, RegExp, Map, Set, performance: { now: () => 0 }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const stagesSrc = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  const cS = stagesSrc.indexOf('class VehicleDynamics15DOF {');
  const cE = stagesSrc.indexOf('window.VehicleDynamics15DOF = VehicleDynamics15DOF;');
  if (cS < 0 || cE < 0 || cE <= cS) throw new Error('无法定位 VehicleDynamics15DOF 类边界');
  vm.runInContext(stagesSrc.slice(cS, cE) + '\nwindow.VehicleDynamics15DOF = VehicleDynamics15DOF;',
    ctx, { filename: '11-stages.js#VehicleDynamics15DOF' });

  // sampleSweep 是 03-mechanism.js 的全局助手，与 11-stages.js 共享同一全局作用域
  const mechSrc = fs.readFileSync(path.join(webDir, 'js', '03-mechanism.js'), 'utf8');
  const sS = mechSrc.indexOf('function sampleSweep(sw,tr,key){');
  const sE = mechSrc.indexOf('/* ================================ 5.');
  if (sS < 0 || sE < 0 || sE <= sS) throw new Error('无法定位 sampleSweep 函数边界');
  vm.runInContext(mechSrc.slice(sS, sE), ctx, { filename: '03-mechanism.js#sampleSweep' });

  return { ctx, Engine: ctx.window.VehicleDynamics15DOF, sampleSweep: ctx.sampleSweep };
}

/* ── 单步探针：把车压到指定行程，读回遥测 ─────────────────────── */
function probeAt(Engine, S, SIM, travelMm, axle) {
  const eng = new Engine(S, SIM, 15.0);
  // z_corner = Z + 0 + 0 - 0；tr_w = -(z_corner - z_road)，z_road=0（env.path=null）
  // ⇒ Z = -travelMm/1000 得到 tr_w = +travelMm/1000 m（正=压缩）
  eng.state.Z = -travelMm / 1000;
  eng.state.w = 0; eng.state.phi = 0; eng.state.theta = 0;
  eng.state.p = 0; eng.state.q = 0; eng.state.r = 0;
  eng.state.u = 15.0; eng.state.v = 0;
  eng.step({ steer: 0, throttle: 0, brake: 0 }, { grade: 0, path: null, bumpNoise: 0 }, 0.001);
  return eng;
}

/* ── 主检查 ───────────────────────────────────────────────────── */
function runChecks(webDir, ok, fail, opts) {
  const log = (opts && opts.log) || (() => {});
  let R;
  try {
    R = loadReal(webDir);
  } catch (e) {
    fail(`G23: K&C 接线测试无法加载源码：${e.message}`);
    return;
  }
  const { Engine, sampleSweep } = R;
  ok(typeof Engine === 'function', 'G23: VehicleDynamics15DOF 已加载');
  ok(typeof sampleSweep === 'function', 'G23: sampleSweep 助手已加载');

  const S = makeS('A'), SIM = makeSIM('A');

  /* ── 1. camber 必须来自 LUT 插值，而非硬编码常数 ────────────── */
  const TR = 30;   // mm 压缩
  const eng = probeAt(Engine, S, SIM, TR, 'front');
  const camFR = eng.telemetry.camber.FR;
  const camFL = eng.telemetry.camber.FL;
  const expectCam = sampleSweep(SIM.swF, TR, 'cam');
  const legacyCam = -2.8 + (-0.038) * TR;                 // 旧硬编码线性化结果
  ok(isFinite(camFR), `G23/1: camber 有限（${camFR}）`);
  ok(Math.abs(camFR - expectCam) < 0.02,
    `G23/1: FR camber 取自 LUT 插值（实测 ${camFR.toFixed(3)}° vs LUT ${expectCam.toFixed(3)}°）`);
  ok(Math.abs(camFR - legacyCam) > 0.05,
    `G23/1: FR camber 不再等于硬编码常数结果（旧值 ${legacyCam.toFixed(3)}°，实测 ${camFR.toFixed(3)}°）`);

  /* ── 2. 多个行程点上 camber 都跟随 LUT（含回弹侧与端点钳位）──── */
  for (const tr of [-55, -20, 0, 15, 45, 64]) {
    const e2 = probeAt(Engine, S, SIM, tr, 'front');
    const exp = sampleSweep(SIM.swF, tr, 'cam');
    ok(Math.abs(e2.telemetry.camber.FR - exp) < 0.02,
      `G23/2: tr=${String(tr).padStart(3)}mm 时 FR camber ${e2.telemetry.camber.FR.toFixed(3)}° ≈ LUT ${exp.toFixed(3)}°`);
  }
  // 超行程钳位：sampleSweep 端点钳位，不得 NaN / 不得线性外推
  const eOver = probeAt(Engine, S, SIM, 79, 'front');   // 79mm > maxDroop? 见下注
  ok(isFinite(eOver.telemetry.camber.FR),
    `G23/2: 超出 LUT 行程范围时 camber 仍有限（${eOver.telemetry.camber.FR}）`);

  /* ── 3. toe（bump steer）必须来自 LUT 的 toe(tr) − toe(0) ─────
     ★ 侧别符号：bump_steer_rad 会被加到 steer_total 上，而 steer_total 是【左右
       共用】的转向坐标系（正 = 右弯）。前束入（toe>0）时右轮指左 = 该坐标系
       下为负，左轮指右 = 正，故右角取 -1、左角取 +1。这是既有约定且物理正确
       （已复核），接线必须保留它，故期望值带 SIDE_R = -1 因子。 */
  const SIDE_R = -1.0;
  const toeFR = eng.telemetry.toe.FR;
  const dToe = sampleSweep(SIM.swF, TR, 'toe') - sampleSweep(SIM.swF, 0, 'toe');
  const legacyToe = SIDE_R * 0.012 * TR;                  // 旧：side_sign × dToe_dz × tr
  ok(Math.abs(toeFR - SIDE_R * dToe) < 0.02,
    `G23/3: FR toe 取自 LUT bump-steer 增量（实测 ${toeFR.toFixed(3)}° vs 期望 ${SIDE_R}*${dToe.toFixed(3)}° = ${(SIDE_R * dToe).toFixed(3)}°）`);
  ok(Math.abs(toeFR - legacyToe) > 0.02,
    `G23/3: FR toe 不再等于硬编码常数结果（旧值 ${legacyToe.toFixed(3)}°，实测 ${toeFR.toFixed(3)}°）`);

  /* ── 4. 左右镜像：camber 幅值相同，toe 按既有约定反号 ───────── */
  ok(Math.abs(Math.abs(camFL) - Math.abs(camFR)) < 0.02,
    `G23/4: FL/FR camber 幅值一致（${camFL.toFixed(3)}° / ${camFR.toFixed(3)}°）`);
  ok(Math.abs(eng.telemetry.toe.FL + toeFR) < 0.02,
    `G23/4: FL/FR toe 符号相反（${eng.telemetry.toe.FL.toFixed(3)}° / ${toeFR.toFixed(3)}°）`);

  /* ── 5. 后轴用后轴 LUT（不得前后共用一张表）────────────────── */
  const engR = probeAt(Engine, S, SIM, TR, 'rear');
  const expCamR = sampleSweep(SIM.swR, TR, 'cam');
  ok(Math.abs(engR.telemetry.camber.RR - expCamR) < 0.02,
    `G23/5: RR camber 取自后轴 LUT（${engR.telemetry.camber.RR.toFixed(3)}° vs ${expCamR.toFixed(3)}°）`);

  /* ── 6. ★ 核心断言：改悬架几何必须改变车辆行为 ──────────────── */
  const SIM_B = makeSIM('B');
  const runN = (sim, n) => {
    const e = new Engine(S, sim, 20.0);
    e.state.u = 20.0;
    for (let i = 0; i < n; i++) {
      e.step({ steer: 6.0, throttle: 0.3, brake: 0 }, { grade: 0, path: null, bumpNoise: 0 }, 0.004);
    }
    return e;
  };
  const eA = runN(SIM, 300), eB = runN(SIM_B, 300);
  const dPsi = Math.abs(eA.state.psi - eB.state.psi);
  const dV = Math.abs(eA.state.v - eB.state.v);
  const dCam = Math.abs(eA.telemetry.camber.FR - eB.telemetry.camber.FR);
  ok(dCam > 0.05,
    `G23/6: 不同悬架几何 → 不同 camber（Δ=${dCam.toFixed(3)}°）`);
  ok(dPsi > 1e-4 || dV > 1e-3,
    `G23/6: ★不同悬架几何 → 不同车辆行为（Δψ=${dPsi.toExponential(2)} rad、Δv=${dV.toExponential(2)} m/s）` +
    `——接线前两者恒等（几何改动车不变）`);
  log(`  [G23] 几何敏感性：Δψ=${dPsi.toExponential(3)} rad, Δv=${dV.toExponential(3)} m/s, Δcamber=${dCam.toFixed(3)}°`);

  /* ── 7. 安全回退：LUT 缺失时不得崩、不得 NaN ────────────────── */
  const SIM_null = makeSIM('A'); SIM_null.swF = null; SIM_null.swR = null;
  let fb = null, fbErr = null;
  try { fb = probeAt(Engine, S, SIM_null, TR, 'front'); } catch (e) { fbErr = e; }
  ok(!fbErr, `G23/7: SIM.swF/swR 为 null 时 step() 不抛错${fbErr ? '（' + fbErr.message + '）' : ''}`);
  if (fb) {
    ok(isFinite(fb.telemetry.camber.FR) && isFinite(fb.telemetry.toe.FR) && isFinite(fb.state.u),
      `G23/7: 回退路径下遥测与状态全有限（camber=${fb.telemetry.camber.FR}）`);
    ok(Math.abs(fb.telemetry.camber.FR - legacyCam) < 0.02,
      `G23/7: 无 LUT 时回退到原线性化常数（${fb.telemetry.camber.FR.toFixed(3)}° ≈ ${legacyCam.toFixed(3)}°）`);
  }
  // 行结构缺列 / 空 rows 也要安全
  const SIM_bad = makeSIM('A'); SIM_bad.swF = { rows: [] };
  let badErr = null;
  try { probeAt(Engine, S, SIM_bad, TR, 'front'); } catch (e) { badErr = e; }
  ok(!badErr, `G23/7: swF.rows 为空时不抛错${badErr ? '（' + badErr.message + '）' : ''}`);

  /* ── 8. 源码级守卫：硬编码常数不得再是唯一来源 ──────────────── */
  const stagesSrc = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  ok(/sampleSweep\s*\(/.test(stagesSrc),
    'G23/8: 11-stages.js 中出现 sampleSweep( 调用（K&C LUT 已接线）');
  ok(/swF|swR/.test(stagesSrc),
    'G23/8: 11-stages.js 引用 SIM 的 swF/swR 扫掠表');
}

module.exports = runChecks;

/* 单独运行：彩色诊断输出（ok 回调必须尊重 cond） */
if (require.main === module) {
  const webDir = path.join(__dirname, '..');
  let checks = 0;
  const failures = [];
  runChecks(webDir,
    (cond, msg) => {
      checks++;
      if (cond) { if (msg) console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`); }
      else { failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); }
    },
    msg => { checks++; failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); },
    { log: m => console.log(m) });
  console.log('');
  if (failures.length) {
    console.error(`\x1b[31mK&C 接线检查 FAIL：${failures.length}/${checks}\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32mK&C 接线检查 PASS：${checks} 项全过\x1b[0m`);
}
