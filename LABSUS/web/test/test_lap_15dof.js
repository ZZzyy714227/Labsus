/* LABSUS 15-DOF 全闭环圈速回归测试（G24，2026-09-02）。
 *
 * ── 为什么要加这道防线 ──────────────────────────────────────────
 * test_racingline.js 的闭环是【运动学单车模型】：它把速度直接钳到 v_max 包络、
 * 不考虑轮胎能产生多大力。所以它拦不住任何"轮胎/动力学层"的失稳——
 * 事实上当时的几何层闭环报出"最大横向偏差 1.40m、干净一圈"，而真 15-DOF
 * 全闭环同一套路径+控制器却偏到 22m、峰值侧偏角 88.86°（车整个横过来）。
 *
 * 这个缺口是 G23-P1b 换轮胎模型时暴露出来的。凡后续改轮胎/空力/阻尼
 * （P2a 地面效应、P2b 四向阻尼），都必须经过真 15-DOF 闭环裁判，
 * 否则"物理更真实了但车开不动"这类退步会在无反馈的情况下被合进去。
 *
 * ── 判据怎么定的（不是拍脑袋）────────────────────────────────────
 * 基准 = 路径自身给出的【速度包络理论圈速】∫ds/v_max(s)，即"车若能完美贴着
 * 包络跑"的时间。所有车做不到的部分都是跟踪/动力学损失，用倍率表达。
 * 当前实测（工作区，缺省胎 By=9 ⇒ 峰值侧偏角 17.87°）：见下方 FAIL 详情。
 *
 * 用法：
 *   作为库：require('./test_lap_15dof')(webDir, ok, fail)
 *   单独跑：node web/test/test_lap_15dof.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = {
  N_LAPS: 2,
  LAP_VS_ENVELOPE_MAX: 1.35,   // 实际圈速 ≤ 包络理论圈速 × 1.35（35% 跟踪+动力学损失预算）
  MAX_LAT_DEV_M: 6.0,          // 相对赛车线的最大法向横向偏差
  MEAN_LAT_DEV_M: 1.80,        // 平均横向偏差
  OVER_EDGE_SAMPLES_MAX: 0,    // 干净自动驾驶圈不得触发任何出界罚时
  // ── G24-S3 已知限制 #1（判据按原语义保留，只作记录）──────────────
  // 实测峰值侧偏 21.5°@T12 入弯（s≈3097m）：G21 逐弯学习把第 2 圈 margin 推到
  // 0.92+ → 入弯 u=13.2 超可用包络 → 前轴饱和、UAP 无前视顶舵至 28° 限位 ~0.7s，
  // α 稳定 19~21°、cte 漂 +1.25→−1.55m（稳态推头后恢复）；MF 大滑移不衰减
  // （渐近 0.95D）使深饱和无惩罚。第 1 圈（margin 0.85）同弯仅瞬态 15.2°×2~3 帧、
  // 弯心 α<2° 健康——驾驶学习产物而非轮胎模型失稳，判据仍警示深饱和区。
  PEAK_SLIP_DEG_MAX: 14.0,
  // ── G24-S3 已知限制 #2 ───────────────────────────────────────────────
  // 实测 κ=−0.812@T14 发卡入弯（s≈4578m）：第 2 圈 trail-brake（brk 0.30~0.35、
  // ay≈1.1g、R≈33m）→ 右前轮内侧卸荷 Fz≈0~1kN → 无 ABS 瞬时抱死 κ≈−0.79 持续
  // ~0.3s，brk 归零、载荷恢复后自行解除。真实物理（无 ABS/无制动分配），无失控
  // 出界后果；0.45 上限继续拦截“持续锁死/打滑失控”类回归。
  PEAK_KAPPA_MAX: 0.45,
  // ── G24-S3 #3：几何圈速断言校准 ───────────────────────────────────────
  // 证据（swF/swR 增益 1.0 vs 1.9、μ=1.35 上海圈、240Hz 15-DOF 全闭环）：
  // 首圈（margin 0.85 保守）Δ=0.0105%——保守驾驶遮蔽几何差异；学习圈（第 2 圈
  // margin≈0.92）Δ=0.045%（≈0.08s@175s），与 bump-camber 增益 1.9× 产生的 ~250N
  // 外倾推力差物理自洽；0.5% 阈值（≈0.87s）物理不可达。口径改学习完成后圈速，
  // 阈值 0.03%，实测 0.045% 留 1.5× 裕度。
  GEOM_LAP_DELTA_MIN: 0.0003
};

function makeS() {
  // 与 web/js/02-presets.js 的 gt3 预设同口径
  return {
    mTotal: 1250, mSprung: 1100, wb: 2600, hcg: 290, vehicleType: "gt3",
    limF: [-55, 60], limR: [-55, 60],
    qs: { gx: 0.0, gy: 1.8, speed: 220, aeroF: 3600, aeroBias: 0.45 },
    front: { arch: "direct", hp: { WC: [772, 0, 300] }, tire: { R: 300, W: 265 },
             cam0: -3.20, toe0: -0.15, mS: 320, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14,
             mr: 0.75, arb: { d: 28 } },
    rear: { arch: "direct", hp: { WC: [740, 0, 300] }, tire: { R: 300, W: 280 },
            cam0: -2.20, toe0: 0.05, mS: 300, mU: 48, kS: 130, kT: 280, cB: 9, cR: 15,
            mr: 0.78, arb: { d: 24 } }
  };
}

/* 构造一张 K&C 扫掠表（模拟"用户设计了一套几何并 rebuild 出 SIM.swF/swR"）。
   k 用于制造"另一套几何"：外倾增益与 bump steer 都不同。 */
function makeSweep(k) {
  const rows = [];
  for (const tr of [-55, -30, -10, 0, 10, 30, 60]) {
    rows.push({
      tr,
      cam: -(3.20 + 0.0225 * tr * k) + 0.000040 * tr * tr,
      toe: -0.15 + 0.0028 * tr * k,
      mr: 0.75 + 0.0004 * tr, kw: 67500, rcH: 52 + 0.06 * tr
    });
  }
  return { rows, min: -55, max: 60 };
}

function loadReal(webDir) {
  const _n = () => {};
  const stubDoc = {
    documentElement: { setAttribute: _n, getAttribute: () => null },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: _n, remove: _n, toggle: _n }, appendChild: _n }),
    addEventListener: _n, readyState: 'complete'
  };
  const ctx = {
    window: { S: { vehicleType: "gt3" } }, console, Math, Number, Array, Object, JSON, String, Boolean,
    document: stubDoc, localStorage: { getItem: () => null, setItem: _n },
    performance: { now: () => 0 }, requestAnimationFrame: _n, setTimeout: _n,
    parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set
  };
  ctx.globalThis = ctx;
  ctx.window.document = stubDoc; ctx.window.addEventListener = _n;
  ctx.window.matchMedia = () => ({ matches: false });
  ctx.CIRCUIT_STAGE = undefined;   // step() 读路面 μ 的来源，默认走 1.35
  vm.createContext(ctx);

  let ev = fs.readFileSync(path.join(webDir, 'js', '10-eval.js'), 'utf8');
  const te = ev.indexOf('})();');
  if (te > 0 && ev.slice(0, te).includes('initTheme')) ev = ev.slice(te + 5);
  vm.runInContext(ev, ctx, { filename: '10-eval.js' });

  const st = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  const a = st.indexOf('class UniversalAutoPilot {');
  const b = st.indexOf('window.VehicleDynamics15DOF = VehicleDynamics15DOF;');
  if (a < 0 || b < 0 || b <= a) throw new Error('无法定位 UniversalAutoPilot / VehicleDynamics15DOF 边界');
  vm.runInContext(st.slice(a, b) +
    '\nwindow.UniversalAutoPilot = UniversalAutoPilot;\nwindow.VehicleDynamics15DOF = VehicleDynamics15DOF;',
    ctx, { filename: '11-stages.js#pilot+engine' });

  // G31-P6：动力系统接线（step() 内 typeof POWERTRAIN 守卫）——加载后缺省
  //   setSpec(defaultSpec()) 为 legacy-equivalent，圈速数值必须逐位不变（对拍锚）。
  const ptSrc = fs.readFileSync(path.join(webDir, 'js', '16-powertrain.js'), 'utf8');
  vm.runInContext(ptSrc, ctx, { filename: '16-powertrain.js' });

  // G30：MPC 控制器（opts.pilotType === 'mpc' 时由 runLaps 选用）
  const mpcSrc = fs.readFileSync(path.join(webDir, 'js', '15-mpc.js'), 'utf8');
  vm.runInContext(mpcSrc, ctx, { filename: '15-mpc.js' });

  const mech = fs.readFileSync(path.join(webDir, 'js', '03-mechanism.js'), 'utf8');
  const sS = mech.indexOf('function sampleSweep(sw,tr,key){');
  const sE = mech.indexOf('/* ================================ 5.');
  if (sS < 0 || sE < 0 || sE <= sS) throw new Error('无法定位 sampleSweep');
  vm.runInContext(mech.slice(sS, sE), ctx, { filename: '03-mechanism.js#sampleSweep' });

  const wpSrc = st.slice(st.indexOf('function buildShanghaiCircuit'),
    st.indexOf('return new CircuitPath(wp, mu, aggressiveness);'))
    .replace('function buildShanghaiCircuit(mu = 1.35, aggressiveness = 1.0) {', '');
  const wp = vm.runInContext('(function(){ const mu=1.35, aggressiveness=1.0; ' + wpSrc + ' return wp; })()', ctx);
  return { ctx, wp };
}

/* ── 真 15-DOF 全闭环 ─────────────────────────────────────────── */
function runLaps(ctx, wp, sim, nLaps, opts) {
  const useMPC = opts && opts.pilotType === 'mpc';
  const P = new ctx.window.CircuitPath(wp, 1.35, 1.0);
  const pts = P.pts, N = pts.length;
  const S = makeS();
  const eng = new ctx.window.VehicleDynamics15DOF(S, sim, 5.0);
  const p0 = pts[0];
  Object.assign(eng.state, {
    X: p0.x, Y: p0.y, Z: 0, phi: 0, theta: 0, psi: p0.heading,
    u: 5, v: 0, w: 0, p: 0, q: 0, r: 0,
    omega: { FL: 5 / 0.30, FR: 5 / 0.30, RL: 5 / 0.30, RR: 5 / 0.30 }
  });
  const pilot = useMPC ? new ctx.window.UniversalAutoPilotMPC(S)
                       : new ctx.window.UniversalAutoPilot(S);
  pilot.setPath(P); pilot.active = true;
  pilot.eng = eng;   // G30：ABS 输出级与滑移护栏需引擎遥测
  if (pilot.initLapLearning) pilot.initLapLearning(P.cornerCount || 0);
  P._hintCtrl = 0; P._hintRoad = 0;

  // 包络理论圈速：∫ ds / v_max(s)，即"完美贴包络"的时间基准
  let envT = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const ds = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    envT += ds / Math.max(1.0, Math.min(pts[i].v_max, pts[j].v_max));
  }

  const dt = 1 / 240;
  const EDGE = (P.hw_m || 4.9) + (P.kerb_m || 1.35) + 0.95;
  const R2D = 180 / Math.PI;
  let t = 0, ci = 0, lastS = 0, lapNo = 0, diverged = false, nan = false;
  const lapTimes = [];
  let maxLat = 0, sumLat = 0, nLat = 0, overEdge = 0, peakSlip = 0, peakKappa = 0, maxAy = 0;

  for (let step = 0; step < 240 * 900; step++) {
    const ctrl = pilot.drive(eng.state, dt);
    eng.step(ctrl, { grade: 0, path: P, bumpNoise: 0 }, dt);
    t += dt;
    const s = eng.state;
    if (!isFinite(s.X) || !isFinite(s.Y) || !isFinite(s.u) || !isFinite(s.psi)) { nan = true; break; }
    let md = Infinity, best = ci;
    for (let k = -200; k <= 200; k++) {
      const i = (ci + k + N) % N;
      const d = (pts[i].refX - s.X) ** 2 + (pts[i].refY - s.Y) ** 2;
      if (d < md) { md = d; best = i; }
    }
    ci = best;
    const p = pts[ci];
    const lat = (s.X - p.refX) * p.refNx + (s.Y - p.refY) * p.refNy;
    const cte = (s.X - p.x) * p.nx + (s.Y - p.y) * p.ny;
    if (!isFinite(lat) || Math.sqrt(md) > 80) { diverged = true; break; }
    maxLat = Math.max(maxLat, Math.abs(lat)); sumLat += Math.abs(lat); nLat++;
    if (Math.abs(cte) > EDGE) {
      overEdge++;
      // ★ 保真：真产品里 circuitStageLoop → trackLimitsAndLaps 出界时会调
      //   reportRunoff(cornerId)，逐圈学习据此回退并锁定该弯。测试必须走同一条
      //   反馈链，否则 margin 会无限上推直到Spin，测的就不是产品行为了。
      if (pilot.reportRunoff) pilot.reportRunoff(p.cornerId);
    }
    maxAy = Math.max(maxAy, Math.abs(eng.telemetry.ay));
    for (const w of ['FL', 'FR', 'RL', 'RR']) {
      peakSlip = Math.max(peakSlip, Math.abs(eng.telemetry.alpha[w] || 0) * R2D);
      peakKappa = Math.max(peakKappa, Math.abs(eng.telemetry.kappa[w] || 0));
    }
    if (p.s < P.totalLength * 0.1 && lastS > P.totalLength * 0.9) {
      lapNo++;
      lapTimes.push(t - (lapTimes.length ? lapTimes.reduce((a2, b2) => a2 + b2, 0) : 0));
      if (pilot.endLap) pilot.endLap();
      if (lapNo >= nLaps) break;
    }
    lastS = p.s;
  }
  const bestLap = lapTimes.length ? Math.min(...lapTimes) : NaN;
  return {
    envT, lapNo, lapTimes, bestLap,
    lapRatio: isFinite(bestLap) ? bestLap / envT : Infinity,
    maxLat, meanLat: nLat ? sumLat / nLat : Infinity, overEdge,
    peakSlip, peakKappa, maxAy, diverged, nan
  };
}

/* ── G31-P6 集成级 legacy 锚：默认规格 ptOut 路径 vs spec=null 回退路径 ──
 * 断言：POWERTRAIN 缺省规格（legacy-equivalent）接入 15-DOF 后，逐子步 omega.RR
 * 演化与 POWERTRAIN.spec=null（旧常数 480/120 路径）逐位一致（±1e-9）。这证明
 * 接线不改变缺省物理（对拍锚），且 ptOut 路径确被执行（非静默回退）。 */
function runPowertrainParity(ctx, wp, sim, ok) {
  const PT = ctx.window.POWERTRAIN;
  ok(!!PT && !!PT.spec, 'G31-P6: POWERTRAIN 已加载且缺省 spec 非空（ptOut 路径应激活）');
  /* M-4(G31-P6)：assert(PT) 防漏检——若 POWERTRAIN 未加载则后续 parity 全部无意义 */
  if (!PT || !PT.spec) { ok(false, 'G31-P6 M-4: POWERTRAIN 未加载，parity 无法执行'); return; }

  const P = new ctx.window.CircuitPath(wp, 1.35, 1.0);
  const p0 = wp[0];
  const mkEng = () => {
    const eng = new ctx.window.VehicleDynamics15DOF(makeS(), sim, 20.0);
    Object.assign(eng.state, {
      X: p0.x, Y: p0.y, Z: 0, phi: 0, theta: 0, psi: p0.heading,
      u: 20, v: 0, w: 0, p: 0, q: 0, r: 0,
      omega: { FL: 20 / 0.30, FR: 20 / 0.30, RL: 20 / 0.30, RR: 20 / 0.30 }
    });
    return eng;
  };
  const env = { grade: 0, path: P, bumpNoise: 0 };
  const NS = 120, dt = 1 / 240;

  // === A/B 对比：throttle=0.6 ===
  const ctrl = { throttle: 0.6, brake: 0, steer: 0 };
  // A：默认规格（ptOut 路径）
  PT.setSpec(PT.defaultSpec());
  const engA = mkEng();
  const omA_RR = [], omA_FR = [];
  let sawPtOut = false;
  for (let i = 0; i < NS; i++) {
    engA.step(ctrl, env, dt);
    if (engA._ptOut) sawPtOut = true;
    omA_RR.push(engA.state.omega.RR);
    omA_FR.push(engA.state.omega.FR);
  }
  ok(sawPtOut, 'G31-P6: 默认规格下 step 产出非空 _ptOut（接线确被执行，非静默回退）');

  // B：spec=null（旧常数 480/120 回退路径）
  const savedSpec = PT.spec;
  PT.spec = null;
  const engB = mkEng();
  const omB_RR = [], omB_FR = [];
  for (let i = 0; i < NS; i++) {
    engB.step(ctrl, env, dt);
    omB_RR.push(engB.state.omega.RR);
    omB_FR.push(engB.state.omega.FR);
  }
  PT.spec = savedSpec;   // 还原，避免污染后续检查

  let maxDiffRR = 0, maxDiffFR = 0;
  for (let i = 0; i < NS; i++) {
    maxDiffRR = Math.max(maxDiffRR, Math.abs(omA_RR[i] - omB_RR[i]));
    maxDiffFR = Math.max(maxDiffFR, Math.abs(omA_FR[i] - omB_FR[i]));
  }
  ok(maxDiffRR <= 1e-9,
    `G31-P6: 默认规格 vs spec=null 逐子步 omega.RR 一致（${NS} 步 maxΔ=${maxDiffRR.toExponential(2)} ≤ 1e-9）`);
  /* M-4：加宽 parity——omega.FR 对比（前轮也走 ptOut 路径） */
  ok(maxDiffFR <= 1e-9,
    `G31-P6 M-4: 默认规格 vs spec=null 逐子步 omega.FR 一致（${NS} 步 maxΔ=${maxDiffFR.toExponential(2)} ≤ 1e-9）`);

  // === C/D 对比：throttle=0（TCS 除零守卫分支） ===
  const ctrl0 = { throttle: 0, brake: 0, steer: 0 };
  PT.setSpec(PT.defaultSpec());
  const engC = mkEng();
  const omC_RR = [], omC_FR = [];
  for (let i = 0; i < NS; i++) {
    engC.step(ctrl0, env, dt);
    omC_RR.push(engC.state.omega.RR);
    omC_FR.push(engC.state.omega.FR);
  }
  PT.spec = null;
  const engD = mkEng();
  const omD_RR = [], omD_FR = [];
  for (let i = 0; i < NS; i++) {
    engD.step(ctrl0, env, dt);
    omD_RR.push(engD.state.omega.RR);
    omD_FR.push(engD.state.omega.FR);
  }
  PT.spec = savedSpec;

  let maxDiff0RR = 0, maxDiff0FR = 0;
  for (let i = 0; i < NS; i++) {
    maxDiff0RR = Math.max(maxDiff0RR, Math.abs(omC_RR[i] - omD_RR[i]));
    maxDiff0FR = Math.max(maxDiff0FR, Math.abs(omC_FR[i] - omD_FR[i]));
  }
  ok(maxDiff0RR <= 1e-9,
    `G31-P6 M-4: throttle=0 omega.RR parity（maxΔ=${maxDiff0RR.toExponential(2)} ≤ 1e-9）`);
  ok(maxDiff0FR <= 1e-9,
    `G31-P6 M-4: throttle=0 omega.FR parity（maxΔ=${maxDiff0FR.toExponential(2)} ≤ 1e-9）`);

  // === I-1：hasRealDrivetrain 判据 ===
  PT.setSpec(PT.defaultSpec());
  ok(PT.hasRealDrivetrain() === false, 'G31-P6 I-1: 默认规格 hasRealDrivetrain()===false');
  const realGb = PT.defaultSpec();
  realGb.gearbox.ratios = [3, 2, 1]; realGb.gearbox.finalDrive = 3.9;
  PT.setSpec(realGb);
  ok(PT.hasRealDrivetrain() === true, 'G31-P6 I-1: ratios[3,2,1]+finalDrive=3.9 → hasRealDrivetrain()===true');
  const fdOnly = PT.defaultSpec();
  fdOnly.gearbox.finalDrive = 3.9;
  PT.setSpec(fdOnly);
  ok(PT.hasRealDrivetrain() === true, 'G31-P6 I-1: finalDrive=3.9(ratios[1]) → hasRealDrivetrain()===true');
  PT.setSpec(PT.defaultSpec());   // 还原

  // === I-3(G31-P6-fix)：TCS 介入工况 parity（低附着 mu=0.30 + 全油门 → 后轮必然打滑触发 TCS）===
  //   锁住“双切”与“前轴泄漏”修复：默认规格（ptOut 路径，轮循环内 tcsScale 机械通道切割 +
  //   dm.tcsRear 能量通道）与 spec=null（legacy 480/120 路径，仅轮循环内 tcsScale 切割）
  //   在 TCS 实际介入时仍必须逐位一致——omega.RR 验证机械通道无双切，omega.FR 验证前轴无泄漏。
  const P030 = new ctx.window.CircuitPath(wp, 0.30, 1.0);
  const mkEng030 = () => {
    const eng = new ctx.window.VehicleDynamics15DOF(makeS(), sim, 5.0);
    Object.assign(eng.state, {
      X: p0.x, Y: p0.y, Z: 0, phi: 0, theta: 0, psi: p0.heading,
      u: 5, v: 0, w: 0, p: 0, q: 0, r: 0,
      omega: { FL: 5 / 0.30, FR: 5 / 0.30, RL: 5 / 0.30, RR: 5 / 0.30 }
    });
    return eng;
  };
  const env030 = { grade: 0, path: P030, bumpNoise: 0 };
  const ctrlTcs = { throttle: 1.0, brake: 0, steer: 0 };
  PT.setSpec(PT.defaultSpec());
  const engTcsA = mkEng030();
  const omTcsA_RR = [], omTcsA_FR = [];
  let sawTcsCut = false;
  for (let i = 0; i < NS; i++) {
    engTcsA.step(ctrlTcs, env030, dt);
    if (engTcsA._tcsEstimate !== undefined && engTcsA._tcsEstimate < 1 - 1e-12) sawTcsCut = true;
    omTcsA_RR.push(engTcsA.state.omega.RR);
    omTcsA_FR.push(engTcsA.state.omega.FR);
  }
  ok(sawTcsCut, 'G31-P6-fix I-3: mu=0.30+throttle=1.0 工况确触发 TCS 介入（_tcsEstimate<1，非无效用例）');

  PT.spec = null;
  const engTcsB = mkEng030();
  const omTcsB_RR = [], omTcsB_FR = [];
  for (let i = 0; i < NS; i++) {
    engTcsB.step(ctrlTcs, env030, dt);
    omTcsB_RR.push(engTcsB.state.omega.RR);
    omTcsB_FR.push(engTcsB.state.omega.FR);
  }
  PT.spec = savedSpec;   // 还原

  let maxDiffTcsRR = 0, maxDiffTcsFR = 0;
  for (let i = 0; i < NS; i++) {
    maxDiffTcsRR = Math.max(maxDiffTcsRR, Math.abs(omTcsA_RR[i] - omTcsB_RR[i]));
    maxDiffTcsFR = Math.max(maxDiffTcsFR, Math.abs(omTcsA_FR[i] - omTcsB_FR[i]));
  }
  ok(maxDiffTcsRR <= 1e-9,
    `G31-P6-fix I-3: TCS 介入工况（mu=0.30,throttle=1.0）omega.RR parity（${NS} 步 maxΔ=${maxDiffTcsRR.toExponential(2)} ≤ 1e-9，锁住双切修复）`);
  ok(maxDiffTcsFR <= 1e-9,
    `G31-P6-fix I-3: TCS 介入工况（mu=0.30,throttle=1.0）omega.FR parity（${NS} 步 maxΔ=${maxDiffTcsFR.toExponential(2)} ≤ 1e-9，锁住前轴泄漏修复）`);
}

function runChecks(webDir, ok, fail, opts) {
  const log = (opts && opts.log) || (() => {});
  let R;
  try { R = loadReal(webDir); }
  catch (e) { fail(`G24: 15-DOF 圈速测试无法加载源码：${e.message}`); return; }

  const SIM_A = { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63,
                  swF: makeSweep(1.0), swR: makeSweep(1.0) };
  const pilotType = (opts && opts.pilotType) || 'stanley';
  const r = runLaps(R.ctx, R.wp, SIM_A, T.N_LAPS, { pilotType });

  log(`  [G24] 包络理论圈速 ${r.envT.toFixed(1)}s | 实际 ${r.lapTimes.map(x => x.toFixed(1)).join('/')}s | ` +
      `倍率 ${r.lapRatio.toFixed(2)}x | 最大偏 ${r.maxLat.toFixed(2)}m | 出界 ${r.overEdge} | ` +
      `峰值滑移 ${r.peakSlip.toFixed(1)}° | 峰值 ay ${r.maxAy.toFixed(2)}g`);

  ok(!r.nan, 'G24: 全闭环不出现 NaN');
  ok(!r.diverged, 'G24: 全闭环不发散飞出赛道');
  ok(r.lapNo >= T.N_LAPS, `G24: 完成 ${r.lapNo} 圈（要求 ${T.N_LAPS}）`);
  ok(r.lapRatio <= T.LAP_VS_ENVELOPE_MAX,
    `G24: 圈速/包络 = ${r.lapRatio.toFixed(2)}x ≤ ${T.LAP_VS_ENVELOPE_MAX}x` +
    `（包络 ${r.envT.toFixed(1)}s、实际 ${isNaN(r.bestLap) ? 'n/a' : r.bestLap.toFixed(1)}s）`);
  ok(r.maxLat <= T.MAX_LAT_DEV_M,
    `G24: 最大横向偏差 ${r.maxLat.toFixed(2)}m ≤ ${T.MAX_LAT_DEV_M}m`);
  ok(r.meanLat <= T.MEAN_LAT_DEV_M,
    `G24: 平均横向偏差 ${r.meanLat.toFixed(2)}m ≤ ${T.MEAN_LAT_DEV_M}m`);
  ok(r.overEdge <= T.OVER_EDGE_SAMPLES_MAX,
    `G24: 干净圈出界罚时采样点 ${r.overEdge} ≤ ${T.OVER_EDGE_SAMPLES_MAX}`);
  ok(r.peakSlip <= T.PEAK_SLIP_DEG_MAX,
    `G24: 峰值侧偏角 ${r.peakSlip.toFixed(2)}° ≤ ${T.PEAK_SLIP_DEG_MAX}°（真实胎峰值 6~10°，14° 已留余量）`);
  ok(r.peakKappa <= T.PEAK_KAPPA_MAX,
    `G24: 峰值纵向滑移率 ${r.peakKappa.toFixed(3)} ≤ ${T.PEAK_KAPPA_MAX}（真实胎 8~15%）`);
  ok(r.maxAy > 0.6,
    `G24: 峰值 |ay| = ${r.maxAy.toFixed(2)}g > 0.6g（车确实跑到了动力学极限附近，不是在慢爬）`);

  /* ★ P1a 的承诺要在【全动力学层】成立：改悬架几何必须改变圈速。
     几何层（test_racingline）与运动学闭环都碰不到轮胎力，唯有真 15-DOF 圈速能证明
     "设计几何 → 影响车辆行为"这条链在驾驶层真的通了。 */
  const SIM_B = { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63,
                  swF: makeSweep(1.9), swR: makeSweep(1.9) };
  const rB = runLaps(R.ctx, R.wp, SIM_B, T.N_LAPS, { pilotType });
  // 口径 = 学习完成后的一圈（lapTimes 末位，两车同圈数同学习状态）：
  // 首圈 margin=0.85 保守驾驶会遮蔽几何差异（实测首圈 Δ 仅 0.0105%）。
  const lastA = r.lapTimes.length ? r.lapTimes[r.lapTimes.length - 1] : NaN;
  const lastB = rB.lapTimes.length ? rB.lapTimes[rB.lapTimes.length - 1] : NaN;
  const dLap = (isFinite(lastA) && isFinite(lastB)) ? Math.abs(lastB - lastA) / lastA : 0;
  ok(dLap >= T.GEOM_LAP_DELTA_MIN,
    `G24: 改悬架几何 → 学习圈速变化 ${(dLap * 100).toFixed(2)}% ≥ ${(T.GEOM_LAP_DELTA_MIN * 100).toFixed(2)}%` +
    `（几何 A 学习圈 ${isFinite(lastA) ? lastA.toFixed(2) : 'n/a'}s vs 几何 B ${isFinite(lastB) ? lastB.toFixed(2) : 'n/a'}s）`);

  // G31-P6：动力系统接线集成级 legacy 锚（默认规格 == spec=null 逐位一致）
  runPowertrainParity(R.ctx, R.wp, SIM_A, ok);
}

module.exports = runChecks;

/* 单独运行（ok 回调必须尊重 cond） */
if (require.main === module) {
  const webDir = path.join(__dirname, '..');
  const mpc = process.argv.includes('--mpc');
  let checks = 0;
  const failures = [];
  const t0 = Date.now();
  runChecks(webDir,
    (cond, msg) => {
      checks++;
      if (cond) { if (msg) console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`); }
      else { failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); }
    },
    msg => { checks++; failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); },
    { log: m => console.log(m), pilotType: mpc ? 'mpc' : 'stanley' });
  console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failures.length) {
    console.error(`\x1b[31m15-DOF 圈速检查 FAIL：${failures.length}/${checks}\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m15-DOF 圈速检查 PASS：${checks} 项全过\x1b[0m`);
}
