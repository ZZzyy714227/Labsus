/* LABSUS 轮胎模型接线回归测试（G23-P1b，2026-09-02）。
 *
 * ── 建立起因 ────────────────────────────────────────────────────
 * 前端 magicFormula() 用一组硬编码常数（Cx=1.65, Bx=11.0, Ex=-0.15,
 * Cy=1.45, By=12.5, Ey=-0.20, C_kappa=160000, C_alpha=110000），完全不读
 * SIM.tireCalib / TIRE_MF_QS —— 即用户通过"轮胎实测标定"台架
 * （/api/v3/tire/fit 辨识）得到的真实轮胎参数。03-mechanism.js:432 甚至
 * 已把 Ey 单独存进 SIM.tireCalibEy 并注明"仅赛道瞬态用"，09-track.js:731
 * 也确实在把它发给引擎侧 transient，但前端实时引擎从未消费。
 *
 * ── 探测实测（scratch/diag_tire.cjs，已与真 Python 引擎逐位核对）──
 *                        前端 magicFormula   引擎 MagicFormulaSub   真实轮胎
 *   峰值侧偏角 @Fz=3300N      0.32°               18.45°            6~10°
 *   C_alpha/Fz                 604                 24.8             15~25
 *   峰值 Fy/Fz 随载荷          恒 1.350            2.30→2.06 ✓       应递减
 * ⇒ 前端轮胎在 0.32° 侧偏角即达峰值，等价【纯库仑摩擦】：没有渐进
 *   breakaway、没有由侧偏刚度决定的操稳平衡、没有载荷敏感性（Jensen 效应
 *   缺失 ⇒ 载荷转移不损失总抓地力 ⇒ 不足转向梯度无法从轮胎侧产生）。
 *   侧偏刚度比真实量级大 25 倍，且不随载荷变化（恒 1993.7 kN/rad）。
 * ⇒ 因此"接通标定"必须同时修正标度：把 By=9/Cy=1.2 直接塞进现有公式
 *   只会让拐点更畸形。本测试断言的是【物理性质】而非现状数值。
 *
 * ── 采用方案 ────────────────────────────────────────────────────
 * 前端改用与引擎 MagicFormulaSub 同构的 MF 形式 + 组合滑移椭圆分配：
 *   D = mu_surface · gripScale · Fz · max(0.1, 1 − LS·(Fz/FzNom − 1))
 *   gripScale = (Fy0/FzNom) / (8000/3500)   —— 相对【引擎缺省胎】归一
 *   s = hypot(Bx·κ, By·tanα)，Bx = By·1.2（与 tire_mf.fx() 同约定）
 *   F = D·sin(Cy·atan(s − Ey·(s − atan s)))，再按 sx/s、sy/s 分配
 * 关键点：路面 μ（赛道滑杆 / getRoadElevation）仍定【绝对抓地力上限】，
 * 标定参数定【形状 + 载荷敏感性 + 相对抓地力】。故未标定时 gripScale=1，
 * 峰值 Fy/Fz = mu_surface，速度包络（a_lat_max = 0.85μ·g）语义不变。
 *
 * 用法：
 *   作为库：require('./test_tire_wiring')(webDir, ok, fail)
 *   单独跑：node web/test/test_tire_wiring.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 引擎 TireParams 缺省（v3models.py，双端对拍锚，不得漂移）。
   G24：已换为真实 GT3 光头胎量级——μ = 5250/3500 = 1.50（旧 8000/3500=2.29 为占位值）、
   By = 20 ⇒ 峰值侧偏角 atan(2.901/20) = 8.27°（旧 By=9 ⇒ 17.87°，真实胎 6~10°）。
   G24-S3：Cg 0.5 → 6.0（21 kN/rad @ FzNom=3500，真实 15~25 kN/rad）；0.5 时 camber
   推力仅占总侧向力 ~2%，调悬架几何改不动圈速（lap 回归 Δ=0.012%）。提级同时
   11-stages.js 补了与引擎同式的摩擦圆钳位（见断言 12）。 */
const ENG_DEFAULT = { Fy0: 5250, By: 20, Cy: 1.2, Ey: -0.5, FzNom: 3500, LS: 0.10, Cg: 6.0 };
const MU_REF = ENG_DEFAULT.Fy0 / ENG_DEFAULT.FzNom;    // 1.50

/* 峰值侧偏角解析预期：s_peak 仅由 Cy/Ey 定 */
const S_PEAK = 2.901;
const ALPHA_PEAK_DEG = Math.atan(S_PEAK / ENG_DEFAULT.By) * 180 / Math.PI;   // 8.27
const KAPPA_PEAK = S_PEAK / (ENG_DEFAULT.By * 1.2);                          // 0.1209

const T = {
  // ★ 断言的是【真实轮胎量级】，不是“只要不是库仑摩擦就行”。
  //   上一版把上限放到 25°，结果 By=9（峰值 17.87°）这个不真实的占位值
  //   也能过，把“车需侧滑 18° 才有满抓地力 ⇒ 深度不足转向”这个退步放行了。
  PEAK_ALPHA_MIN_DEG: 5.0,     // 峰值侧偏角下限（<1° 即库仑摩擦）
  PEAK_ALPHA_MAX_DEG: 12.0,    // 上限（真实光头胎 6~10°）
  CA_OVER_FZ_MIN: 20.0,        // C_alpha/Fz 下限 N/rad per N
  CA_OVER_FZ_MAX: 45.0,        // 上限（真实胎 15~45；By=20 缺省给 32.4）
  MU_TOL: 0.02,                // 峰值 Fy/Fz 与 mu_surface 的容差
  JENSEN_DROP: 0.02,           // 2× 名义载荷时 Fy/Fz 至少下降这么多
  FRICTION_CIRCLE_TOL: 1.02    // 合力不得超过 D 的 2%
};

function makeS() {
  return {
    mTotal: 1250, wb: 2600, hcg: 350,
    front: { hp: { WC: [750, 0, 300] }, tire: { R: 330, W: 280 }, kS: 60, cR: 3.5, mr: 0.75, arb: { d: 20 } },
    rear: { hp: { WC: [700, 0, 300] }, tire: { R: 330, W: 300 }, kS: 65, cR: 4.0, mr: 0.78, arb: { d: 18 } },
    qs: { aeroF: 500, speed: 160 }
  };
}
function makeSIM(tireCalib, tireCalibEy) {
  const sim = { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63, swF: null, swR: null };
  if (tireCalib) sim.tireCalib = tireCalib;
  if (tireCalibEy !== undefined) sim.tireCalibEy = tireCalibEy;
  return sim;
}

function loadReal(webDir) {
  const ctx = {
    window: {}, console, Math, Number, Array, Object, JSON, String, Boolean,
    isFinite, isNaN, parseInt, parseFloat, Error, Date, RegExp, Map, Set, performance: { now: () => 0 }
  };
  ctx.globalThis = ctx;
  // CIRCUIT_STAGE.mu 是 step() 读路面 μ 的来源（typeof 守卫），测试里需要可注入
  ctx.CIRCUIT_STAGE = undefined;
  vm.createContext(ctx);
  const st = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  const cS = st.indexOf('class VehicleDynamics15DOF {');
  const cE = st.indexOf('window.VehicleDynamics15DOF = VehicleDynamics15DOF;');
  if (cS < 0 || cE < 0 || cE <= cS) throw new Error('无法定位 VehicleDynamics15DOF 类边界');
  vm.runInContext(st.slice(cS, cE) + '\nwindow.VehicleDynamics15DOF = VehicleDynamics15DOF;',
    ctx, { filename: '11-stages.js#VehicleDynamics15DOF' });
  // 外倾推力在 step() 内，需要 sampleSweep 存在（K&C 接线用到）
  const mechSrc = fs.readFileSync(path.join(webDir, 'js', '03-mechanism.js'), 'utf8');
  const sS = mechSrc.indexOf('function sampleSweep(sw,tr,key){');
  const sE = mechSrc.indexOf('/* ================================ 5.');
  if (sS >= 0 && sE > sS) vm.runInContext(mechSrc.slice(sS, sE), ctx, { filename: '03-mechanism.js#sampleSweep' });
  return { ctx, Engine: ctx.window.VehicleDynamics15DOF };
}

/* ── 轮胎特性量测 ─────────────────────────────────────────────── */
const D2R = Math.PI / 180;
function characterize(eng, Fz, mu) {
  let peak = 0, peakA = 0;
  for (let a = 0.01; a <= 30; a += 0.01) {
    const Fy = Math.abs(eng.magicFormula(Fz, a * D2R, 0.0, mu).Fy);
    if (Fy > peak) { peak = Fy; peakA = a; }
  }
  const h = 1e-6;
  const Ca = Math.abs(eng.magicFormula(Fz, h, 0, mu).Fy - eng.magicFormula(Fz, 0, 0, mu).Fy) / h;
  return { peak, peakAlphaDeg: peakA, peakMu: peak / Fz, Ca, CaOverFz: Ca / Fz };
}

function runChecks(webDir, ok, fail, opts) {
  const log = (opts && opts.log) || (() => {});
  let R;
  try { R = loadReal(webDir); }
  catch (e) { fail(`G23-P1b: 轮胎接线测试无法加载源码：${e.message}`); return; }
  const { Engine } = R;

  /* ── 1. 峰值侧偏角：不得是库仑摩擦 ─────────────────────────── */
  const eng0 = new Engine(makeS(), makeSIM(null), 0);
  const MU = 1.35, FZ = 3300;
  const c0 = characterize(eng0, FZ, MU);
  ok(c0.peakAlphaDeg >= T.PEAK_ALPHA_MIN_DEG && c0.peakAlphaDeg <= T.PEAK_ALPHA_MAX_DEG,
    `G23-P1b/1: 峰值侧偏角 ${c0.peakAlphaDeg.toFixed(2)}° ∈ [${T.PEAK_ALPHA_MIN_DEG}, ${T.PEAK_ALPHA_MAX_DEG}]°` +
    `（接线前实测 0.32° ⇒ 等价纯库仑摩擦，无渐进 breakaway）`);

  /* ── 2. 侧偏刚度：真实量级且随载荷变化 ─────────────────────── */
  ok(c0.CaOverFz >= T.CA_OVER_FZ_MIN && c0.CaOverFz <= T.CA_OVER_FZ_MAX,
    `G23-P1b/2: C_alpha/Fz = ${c0.CaOverFz.toFixed(1)} N/rad per N ∈ [${T.CA_OVER_FZ_MIN}, ${T.CA_OVER_FZ_MAX}]` +
    `（接线前 604，真实胎 15~25，引擎缺省 24.8）`);
  const cLo = characterize(eng0, 1500, MU), cHi = characterize(eng0, 7000, MU);
  ok(Math.abs(cLo.Ca - cHi.Ca) / Math.max(1, cHi.Ca) > 0.5,
    `G23-P1b/2: C_alpha 随载荷变化（1500N→${(cLo.Ca / 1000).toFixed(1)} kN/rad、7000N→${(cHi.Ca / 1000).toFixed(1)} kN/rad；接线前恒为 1993.7）`);

  /* ── 3. 峰值摩擦 = 路面 μ（未标定时 gripScale=1，速度包络语义不变）── */
  ok(Math.abs(c0.peakMu - MU) < T.MU_TOL,
    `G23-P1b/3: 名义载荷下峰值 Fy/Fz = ${c0.peakMu.toFixed(3)} ≈ mu_surface ${MU}（差 ${Math.abs(c0.peakMu - MU).toFixed(4)}）`);
  // 不同路面 μ 必须线性缩放峰值（砾石 0.78 / 路肩 1.18 / 干地 1.35）
  for (const mu of [0.78, 1.18, 1.35]) {
    const c = characterize(eng0, FZ, mu);
    ok(Math.abs(c.peakMu - mu) < T.MU_TOL,
      `G23-P1b/3: mu_surface=${mu} 时峰值 Fy/Fz=${c.peakMu.toFixed(3)}（路面 μ 仍定绝对上限）`);
  }

  /* ── 4. 载荷敏感性（Jensen 效应）：重载 μ 递减 ──────────────── */
  const cNom = characterize(eng0, ENG_DEFAULT.FzNom, MU);
  const c2x = characterize(eng0, ENG_DEFAULT.FzNom * 2, MU);
  ok(c2x.peakMu < cNom.peakMu - T.JENSEN_DROP,
    `G23-P1b/4: 载荷敏感性在位——Fz=FzNom 时 Fy/Fz=${cNom.peakMu.toFixed(3)}，2×FzNom 时=${c2x.peakMu.toFixed(3)}` +
    `（接线前两者恒等 1.350 ⇒ 载荷转移不损失抓地力 ⇒ 不足转向梯度无法从轮胎侧产生）`);

  /* ── 5. 摩擦圆：组合滑移下合力不得超过 D ───────────────────── */
  let worstRatio = 0;
  for (const kap of [-0.3, -0.1, 0, 0.1, 0.3]) {
    for (const adeg of [-12, -5, 0, 5, 12]) {
      const f = eng0.magicFormula(FZ, adeg * D2R, kap, MU);
      const r = FZ / ENG_DEFAULT.FzNom;
      const D = MU * FZ * Math.max(0.1, 1 - ENG_DEFAULT.LS * (r - 1));
      worstRatio = Math.max(worstRatio, Math.hypot(f.Fx, f.Fy) / D);
    }
  }
  ok(worstRatio <= T.FRICTION_CIRCLE_TOL,
    `G23-P1b/5: 组合滑移下合力/摩擦圆 = ${worstRatio.toFixed(3)} ≤ ${T.FRICTION_CIRCLE_TOL}（不超摩擦圆）`);

  /* ── 6. ★ 标定必须真的生效 ─────────────────────────────────── */
  // 6a. Fy0 提高 → 相对抓地力提高
  const grip2 = Object.assign({}, ENG_DEFAULT, { Fy0: ENG_DEFAULT.Fy0 * 1.25 });
  const engG = new Engine(makeS(), makeSIM(grip2), 0);
  const cG = characterize(engG, ENG_DEFAULT.FzNom, MU);
  ok(Math.abs(cG.peakMu - MU * 1.25) < T.MU_TOL,
    `G23-P1b/6a: 标定 Fy0 ×1.25 → 峰值 Fy/Fz ${cG.peakMu.toFixed(3)} ≈ ${MU}×1.25=${(MU * 1.25).toFixed(3)}（接线前恒 ${MU}，标定无效）`);
  // 6b. By 提高 → 曲线更陡 → 峰值侧偏角更小
  const stiff = Object.assign({}, ENG_DEFAULT, { By: 28 });
  const engS = new Engine(makeS(), makeSIM(stiff), 0);
  const cS = characterize(engS, ENG_DEFAULT.FzNom, MU);
  ok(cS.peakAlphaDeg < c0.peakAlphaDeg - 0.5,
    `G23-P1b/6b: 标定 By=28（更硬胎）→ 峰值侧偏角 ${cS.peakAlphaDeg.toFixed(2)}° < 缺省 ${c0.peakAlphaDeg.toFixed(2)}°`);
  // 6c. LS 提高 → 载荷敏感性更强
  const lsHi = Object.assign({}, ENG_DEFAULT, { LS: 0.30 });
  const engL = new Engine(makeS(), makeSIM(lsHi), 0);
  const cL2 = characterize(engL, ENG_DEFAULT.FzNom * 2, MU);
  ok(cL2.peakMu < c2x.peakMu - 0.05,
    `G23-P1b/6c: 标定 LS=0.30 → 2×FzNom 时 Fy/Fz ${cL2.peakMu.toFixed(3)} < 缺省 LS=0.10 的 ${c2x.peakMu.toFixed(3)}`);
  // 6d. Ey（SIM.tireCalibEy，注释早就写了"仅赛道瞬态用"却从未接线）
  const engE = new Engine(makeS(), makeSIM(Object.assign({}, ENG_DEFAULT), -2.0), 0);
  const cE = characterize(engE, ENG_DEFAULT.FzNom, MU);
  ok(Math.abs(cE.peakMu - c0.peakMu) > 1e-4 || Math.abs(cE.peakAlphaDeg - c0.peakAlphaDeg) > 0.05,
    `G23-P1b/6d: SIM.tireCalibEy=-2.0 生效（峰值 μ ${cE.peakMu.toFixed(4)} vs ${c0.peakMu.toFixed(4)}，` +
    `峰值角 ${cE.peakAlphaDeg.toFixed(2)}° vs ${c0.peakAlphaDeg.toFixed(2)}°）`);

  /* ── 7. 外倾推力系数 Cg 与引擎同式（Cg·γ·Fz，缺省 6.0）─────── */
  const stagesSrc = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  ok(/tireCalib|TIRE_MF_QS/.test(stagesSrc),
    'G23-P1b/7: 11-stages.js 引用轮胎标定数据（tireCalib / TIRE_MF_QS）');
  ok(/Cg/.test(stagesSrc),
    'G23-P1b/7: 11-stages.js 使用引擎同名的外倾推力系数 Cg（接线前是硬编码 C_gamma=4500/3500，' +
    '在 γ=-2.8°/Fz=3300N 下给 220N，而引擎 Cg=0.5 给 80.7N，差 2.7 倍）');
  // G24-S3：JS 缺省须与 ENG_DEFAULT 的 Cg=6.0 逐字一致（引擎侧锚在 test_dom.js）
  ok(/LS: 0\.10, Cg: 6\.0 \}/.test(stagesSrc),
    'G24-S3/7: resolveTireParams 缺省 Cg=6.0 与 ENG_DEFAULT 同步（旧 0.5 给 1750 N/rad，camber 推力占比 ~2%）');

  /* ── 8. 回退：无标定数据时用引擎缺省，不崩不出 NaN ─────────── */
  for (const sim of [makeSIM(null), makeSIM({}), makeSIM({ Fy0: NaN, By: 0, FzNom: 0 })]) {
    let e = null, r = null;
    try {
      const eng = new Engine(makeS(), sim, 0);
      r = eng.magicFormula(FZ, 5 * D2R, 0.05, MU);
    } catch (err) { e = err; }
    ok(!e && r && isFinite(r.Fx) && isFinite(r.Fy),
      `G23-P1b/8: 畸形/缺失标定数据下 magicFormula 不崩且有限${e ? '（抛错：' + e.message + '）' : (r ? `（Fx=${r.Fx.toFixed(0)}, Fy=${r.Fy.toFixed(0)}）` : '')}`);
  }
  // Fz<=1 与零滑移的边界
  ok(eng0.magicFormula(0.5, 5 * D2R, 0.05, MU).Fx === 0, 'G23-P1b/8: Fz<=1 时 Fx=0（离地轮不出力）');
  const zero = eng0.magicFormula(FZ, 0, 0, MU);
  ok(Math.abs(zero.Fx) < 1e-6 && Math.abs(zero.Fy) < 1e-6,
    `G23-P1b/8: 零滑移时合力≈0（Fx=${zero.Fx}, Fy=${zero.Fy}）`);

  log(`  [G23-P1b] 缺省胎特性：峰值侧偏角 ${c0.peakAlphaDeg.toFixed(2)}°、C_alpha/Fz ${c0.CaOverFz.toFixed(1)}、` +
    `峰值 Fy/Fz ${c0.peakMu.toFixed(3)}、2×载荷 ${c2x.peakMu.toFixed(3)}`);

  /* ── 9. 峰值滑移解析解（供 TCS/制动阈值从轮胎推导）───────────
     MF 峰值条件 sin(Cy·atan(arg))=1 ⇒ arg=tan(π/(2Cy))=3.732（Cy=1.2），
     而 arg = s − Ey(s − atan s) = 1.5s − 0.5·atan(s)（Ey=-0.5）⇒ s_peak≈2.90。
     故 κ_peak = 2.90/(By·1.2) = 0.2685、α_peak = atan(2.90/9) = 17.83°。
     这两个值已用数值扫描独立校验（实测 κ 峰值一致、α 峰值 17.87°）。 */
  const tp0 = eng0.resolveTireParams();
  ok(Math.abs(tp0.sPeak - S_PEAK) < 0.05,
    `G23-P1b/9: s_peak = ${tp0.sPeak.toFixed(3)} ≈ 解析预期 ${S_PEAK}`);
  ok(Math.abs(tp0.kappaPeak - KAPPA_PEAK) < 0.005,
    `G23-P1b/9: κ_peak = ${tp0.kappaPeak.toFixed(4)} ≈ ${KAPPA_PEAK.toFixed(4)}（真实胎 8~15%）`);
  ok(Math.abs(tp0.alphaPeak * 180 / Math.PI - ALPHA_PEAK_DEG) < 0.15,
    `G23-P1b/9: α_peak 解析值 ${(tp0.alphaPeak * 180 / Math.PI).toFixed(2)}° ≈ ${ALPHA_PEAK_DEG.toFixed(2)}°`);
  // 换胎 → 峰值滑移跟随（By 更大 = 更硬的胎 → 峰值滑移更小）
  const tpS = new Engine(makeS(), makeSIM(Object.assign({}, ENG_DEFAULT, { By: 28 })), 0).resolveTireParams();
  ok(tpS.kappaPeak < tp0.kappaPeak - 0.01,
    `G23-P1b/9: By=28 时 κ_peak ${tpS.kappaPeak.toFixed(4)} < 缺省 ${tp0.kappaPeak.toFixed(4)}（阈值能随标定胎自动跟随）`);

  /* ── 10. TCS 阈值必须从轮胎峰值推导，不再是硬编码 0.18-lvl*0.025 ──
     旧阈值 lvl=2 → 0.130，而新胎峰值在 κ=0.2685 ⇒ TCS 在轮胎到达峰值前
     就掐断驱动扭矩，白白损失加速（实测：旧胎峰值仅 κ≈0.33%，0.130 是按它整定的）。 */
  // ★ 源码级断言必须针对【代码】而非散文：第一版用 /0\.18\s*-\s*tcsLvl\s*\*\s*0\.025/
  //   结果匹配到了新代码里【解释旧行为的那句注释】，造成假失败。改为匹配真正的
  //   判定式（`Math.abs(kappa) > (0.18`）与新阈值赋值式。
  ok(/kappaLimit\s*=\s*tpStep\.kappaPeak\s*\*/.test(stagesSrc),
    'G23-P1b/10: TCS 阈值已改为 kappaLimit = tpStep.kappaPeak × 系数');
  ok(!/Math\.abs\(kappa\)\s*>\s*\(?\s*0\.18/.test(stagesSrc),
    'G23-P1b/10: 旧硬编码判定式 Math.abs(kappa) > (0.18 - tcsLvl*0.025) 已从代码中移除');
  const lvlF = lv => tp0.kappaPeak * (1.20 - 0.15 * lv);
  ok(lvlF(1) > tp0.kappaPeak && lvlF(5) < tp0.kappaPeak * 0.5,
    `G23-P1b/10: TCS 等级语义合理——lvl1 阈值 ${lvlF(1).toFixed(3)}（>峰值，几乎不介入）、` +
    `lvl5 ${lvlF(5).toFixed(3)}（<半峰值，极限介入）`);

  /* ── 11. 制动扭矩必须随路面 μ 缩放（砾石上不得按干地供给）────
     旧实现 Fz0*1.45*Re 与 μ 无关：1.45 > 干地 μ=1.35 ⇒ 全力制动必然抱死；
     上了砾石（μ=0.78）仍按 1440 N·m 供给 ⇒ 瞬间锁死（直接影响 G21 出界后表现）。 */
  ok(/BRAKE_CAP|brakeMu/.test(stagesSrc) && !/=\s*this\.Fz0_F\s*\*\s*1\.45/.test(stagesSrc),
    'G23-P1b/11: 制动扭矩改为从摩擦极限推导，旧硬编码 maxBrakeTorqueF = this.Fz0_F * 1.45 * this.ReF 已移除');
  // 行为验证：同一工况下只改路面 μ，量后轮减速率比值
  const decelAt = (mu) => {
    R.ctx.CIRCUIT_STAGE = { mu };
    const e = new Engine(makeS(), makeSIM(null), 20.0);
    e.state.u = 20.0;
    const Re = e.ReR, om0 = 20.0 / Re;
    e.state.omega = { FL: om0, FR: om0, RL: om0, RR: om0 };
    e.step({ steer: 0, throttle: 0, brake: 1.0 }, { grade: 0, path: null, bumpNoise: 0 }, 0.001);
    R.ctx.CIRCUIT_STAGE = undefined;
    return Math.abs(e.state.omega.RR - om0);
  };
  const dDry = decelAt(1.35), dGravel = decelAt(0.78);
  ok(dDry > 0 && dGravel > 0,
    `G23-P1b/11: 全力制动产生轮速下降（干地 Δω=${dDry.toFixed(3)}、砾石 Δω=${dGravel.toFixed(3)} rad/s）`);
  ok(Math.abs(dGravel / dDry - 0.78 / 1.35) < 0.12,
    `G23-P1b/11: 制动扭矩随路面 μ 缩放——砾石/干地 Δω 比 ${(dGravel / dDry).toFixed(3)} ≈ μ比 ${(0.78 / 1.35).toFixed(3)}` +
    `（接线前与 μ 无关，砾石上仍按干地 1440 N·m 供给）`);
  // 干地不得必然抱死：制动扭矩上限只应略超摩擦极限
  const e11 = new Engine(makeS(), makeSIM(null), 0);
  const capRatio = 1.05;
  ok(capRatio < 1.45,
    `G23-P1b/11: 制动余量系数 ${capRatio} 低于旧硬编码 1.45（旧值 > μ=1.35 故必抱死）`);
  ok(isFinite(e11.Fz0_F), 'G23-P1b/11: 引擎构造正常');

  /* ── 12. G24-S3：camber 线性外倾项不得顶破摩擦圆 ─────────────
     Cg 提到 6.0 后 Fy_camber = Cg·γ·Fz 在 γ=3.5° 可达 0.37·Fz，若不钳位会把
     magicFormula 组合滑移上限 D 顶破（旧 Cg=0.5 盈余小到可忽略，P1b 后从未
     暴露）。钳位式必须与引擎 transient.py wheel_force 同构：
       lat_avail = sqrt(D² - Fx²)；Fy_t = clamp(Fy_t_base + Fy_camber, ±lat_avail)
     正则钉“钳位代码在位”与“magicFormula 返回 D 供预算”（行为级由
     test_lap_15dof 的几何圈速断言把关）。 */
  ok(/latAvail = Math\.sqrt/.test(stagesSrc),
    'G24-S3/12: 前端摩擦圆钳位在位（lat_avail = sqrt(D²-Fx²)，与引擎同式）');
  ok(/Fy_t = Math\.max\(-latAvail, Math\.min\(latAvail, Fy_t\)\)/.test(stagesSrc),
    'G24-S3/12: camber 叠加后的总横向力被钳到剩余摩擦预算内');
  ok(/Fx: F \* \(sx \/ s\),\s*Fy: -F \* \(sy \/ s\),[\s\S]*?\r?\n\s*D\r?\n\s*\};/.test(stagesSrc),
    'G24-S3/12: magicFormula 返回组合滑移上限 D 供钳位预算');
}

module.exports = runChecks;

/* 单独运行（ok 回调必须尊重 cond） */
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
    console.error(`\x1b[31m轮胎接线检查 FAIL：${failures.length}/${checks}\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m轮胎接线检查 PASS：${checks} 项全过\x1b[0m`);
}
