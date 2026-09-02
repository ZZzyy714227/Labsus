/* P2a 前端 15-DOF 空力测试（2026-09-02）：cl(h) 地面效应 + 分轴分配 + DRS。
   state-hold A/B 相对断言（确定性、无 flaky）：
   1. DRS 一步开翼：同状态同速度下 drag ×0.72、后轴下压 ×0.90、前轴不动
   2. ge(h) 单调：抬头（前 h 增）→ geF 衰减；低头 → geF 增强（量级方向双锁）
   3. 闭环烟测：高速巡航 3s 无 NaN、下压把车身吸低（ge 版沉得更低）
   无 DOM / 无 rAF —— 直接 node 运行（不受事件循环挂起影响）。 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const _n = () => {};
const stubDoc = {
  documentElement: { setAttribute: _n, getAttribute: () => null },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add: _n, remove: _n, toggle: _n }, appendChild: _n }),
  addEventListener: _n, readyState: "complete"
};
const ctx = {
  window: { S: { vehicleType: "gt3" } }, console, Math, Number, Array, Object, JSON, String, Boolean,
  document: stubDoc, localStorage: { getItem: () => null, setItem: _n },
  performance: { now: () => 0 }, requestAnimationFrame: _n, setTimeout: _n,
  parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set
};
ctx.globalThis = ctx; ctx.window.document = stubDoc; ctx.window.addEventListener = _n;
ctx.window.matchMedia = () => ({ matches: false }); ctx.CIRCUIT_STAGE = undefined;
vm.createContext(ctx);
const st = fs.readFileSync(path.join(ROOT, "web/js/11-stages.js"), "utf8");
vm.runInContext(st.slice(st.indexOf("class UniversalAutoPilot {"),
  st.indexOf("window.VehicleDynamics15DOF = VehicleDynamics15DOF;")) +
  "\nwindow.UAP=UniversalAutoPilot;window.VD=VehicleDynamics15DOF;", ctx);

const QS_BASE = { gx: 0, gy: 1.8, speed: 220, aeroF: 3600, aeroBias: 0.45,
  geHrefMm: 100, geGain: 0.5, geHminMm: 30, geFloor: 0.8,
  drsVms: 40, drsCdScale: 0.72, drsClScale: 0.9 };
function makeS(qsOver) {
  return {
    mTotal: 1250, mSprung: 1100, wb: 2600, hcg: 290, vehicleType: "gt3",
    limF: [-55, 60], limR: [-55, 60],
    qs: Object.assign({}, QS_BASE, qsOver || {}),
    front: { arch: "direct", hp: { WC: [772, 0, 300] }, tire: { R: 300, W: 265 },
             cam0: -3.20, toe0: -0.15, mS: 320, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14, mr: 0.75, arb: { d: 28 } },
    rear: { arch: "direct", hp: { WC: [740, 0, 300] }, tire: { R: 300, W: 280 },
            cam0: -2.20, toe0: 0.05, mS: 300, mU: 48, kS: 130, kT: 280, cB: 9, cR: 15, mr: 0.78, arb: { d: 24 } }
  };
}
function makeSweep() {
  const rows = [];
  for (const tr of [-55, -30, -10, 0, 10, 30, 60]) {
    rows.push({ tr, cam: -(3.20 + 0.0225 * tr) + 0.000040 * tr * tr,
      toe: -0.15 + 0.0028 * tr, mr: 0.75 + 0.0004 * tr, kw: 67500, rcH: 52 + 0.06 * tr });
  }
  return { rows, min: -55, max: 60 };
}
function makeSIM() {
  return { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63, swF: makeSweep(), swR: makeSweep() };
}
function fresh(S) {
  const eng = new ctx.window.VD(S, makeSIM(), 5.0);
  return eng;
}
function setState(eng, over) {
  Object.assign(eng.state, Object.assign({
    X: 0, Y: 0, Z: 0, phi: 0, theta: 0, psi: 0, u: 60, v: 0, w: 0, p: 0, q: 0, r: 0,
    omega: { FL: 200, FR: 200, RL: 200, RR: 200 }
  }, over || {}));
  // 注意：不重建 telemetry（step 依赖构造器初始化的 Fz/alpha 等嵌套结构）
  return eng;
}
const DT = 1 / 240;
function frame(eng, drs, theta, u) {
  setState(eng, { u: u, theta: theta });
  // 手动 ctrl 必须带 steer（pilot.drive() 产出的 ctrl 含 steer；缺失 → undefined 传播 → NaN）
  eng.step({ throttle: 0, brake: 0, drs: drs, steer: 0 }, { grade: 0, path: null, bumpNoise: 0 }, DT);
  return eng.telemetry.aero;
}

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log("[PASS] " + name); }
  else { fail++; console.log("[FAIL] " + name + (extra !== undefined ? "  " + extra : "")); }
}

// ── 1. DRS 一步开翼 A/B：drag ×0.72、后轴下压 ×0.90、前轴不变 ──
{
  const S = makeS({ geGain: 0 });        // ge 隔离（geGain 0 → ge 恒 1）
  const a = frame(fresh(S), false, 0, 60);
  const b = frame(fresh(S), true, 0, 60);
  T("DRS 开翼 drag 比 ≈ 0.72", Math.abs(b.drag / a.drag - 0.72) < 0.01,
    "ratio=" + (b.drag / a.drag).toFixed(4));
  T("DRS 开翼后轴 downF 比 ≈ 0.90", Math.abs(b.downF_r / a.downF_r - 0.90) < 0.02,
    "ratio=" + (b.downF_r / a.downF_r).toFixed(4));
  T("DRS 不影响前轴下压（一步内）", Math.abs(b.downF_f / a.downF_f - 1.0) < 0.03,
    "ratio=" + (b.downF_f / a.downF_f).toFixed(4));
  T("telemetry 三态字段齐全", b.drs === true && a.drs === false
    && isFinite(b.geF) && isFinite(a.geR) && isFinite(b.hF) && isFinite(a.hR));
}

// ── 2. ge(h) 单调性：θ=+0.04 抬头前 h 增（cl 衰减）；θ=−0.04 低头前 h 减（cl 增强）──
{
  const S = makeS({ geGain: 0.5 });
  const up = frame(fresh(S), false, +0.04, 60);     // 抬头
  const dn = frame(fresh(S), false, -0.04, 60);     // 低头
  // 手算（wb=2600 → a=1196mm）：前 h up=157.8mm→geF≈0.82 / dn=62.2mm→geF≈1.30 ⇒ 比≈1.6
  T("geF 单调：低头(前净高小)增强 > 抬头", dn.geF > up.geF * 1.2,
    "geF dn=" + dn.geF.toFixed(3) + " up=" + up.geF.toFixed(3));
  // 后轴反向：抬头后 h 减 → geR 增强
  T("geR 反向：抬头(后净高小)增强 > 低头", up.geR > dn.geR * 1.1,
    "geR up=" + up.geR.toFixed(3) + " dn=" + dn.geR.toFixed(3));
  T("geF 量级：低头增强 >1、抬头衰减 <1", dn.geF > 1.05 && up.geF < 0.95,
    "geF dn=" + dn.geF.toFixed(3) + " up=" + up.geF.toFixed(3));
  T("ge 增强传导到前轴下压（同 v 同 aeroScale）", dn.downF_f > up.downF_f * 1.2,
    "downF_f dn=" + dn.downF_f.toFixed(0) + " up=" + up.downF_f.toFixed(0));
  // geFloor/geHmin 饱和锚：h 极大 → ge = floor；h < hmin → ge = geMax
  const S2 = makeS({ geGain: 0.5 });
  const hi = frame(fresh(S2), false, +0.5, 60);     // 前 h=0.11+1.196·0.5≈0.708m >> href
  const lo = frame(fresh(S2), false, -0.5, 60);     // 前 h≈−0.49 → max(h,hmin)=hmin
  T("高离地衰减止于 geFloor≈0.8", Math.abs(hi.geF - 0.8) < 0.01, "geF=" + hi.geF.toFixed(3));
  T("触底饱和止于 geMax≈2.167", Math.abs(lo.geF - (1 + 0.5 * (0.1 / 0.03 - 1))) < 0.02,
    "geF=" + lo.geF.toFixed(3));
}

// ── 3. 闭环烟测：高速巡航 3s，下压吸低车身（ge 版沉得更低），全程无 NaN ──
{
  const run3s = (S) => {
    const eng = fresh(S);
    setState(eng, { u: 75 });
    let nan = false;
    for (let i = 0; i < 240 * 3; i++) {
      eng.step({ throttle: 0, brake: 0, drs: false, steer: 0 }, { grade: 0, path: null, bumpNoise: 0 }, DT);
      const s = eng.state;
      if (!isFinite(s.u) || !isFinite(s.Z) || !isFinite(s.theta)) { nan = true; break; }
    }
    return { eng, nan };
  };
  const r0 = run3s(makeS({ geGain: 0 }));
  const rg = run3s(makeS({ geGain: 0.5 }));
  const hF = (r) => 0.11 + r.eng.state.Z;      // zRoad=0 平路
  const ag = hF(rg), a0 = hF(r0);
  T("ge 版巡航无 NaN 且稳定", !r0.nan && !rg.nan && isFinite(ag) && ag > 0.02 && ag < 0.115,
    "hF=" + (ag * 1000).toFixed(1) + "mm");
  T("高速下压把车身吸低（hF < 静态 0.11）", ag < 0.104 && a0 < 0.108,
    "ge hF=" + (ag * 1000).toFixed(1) + "mm, ge0 hF=" + (a0 * 1000).toFixed(1) + "mm");
  T("ge 增强闭环：ge 版沉得更低", ag < a0,
    "ge hF=" + (ag * 1000).toFixed(1) + "mm < ge0 hF=" + (a0 * 1000).toFixed(1) + "mm");
  T("高速下压与阻力同现（下压随 v² 放大）", rg.eng.telemetry.aero.downF > 2500
    && rg.eng.telemetry.aero.drag > 1000,
    "downF=" + rg.eng.telemetry.aero.downF.toFixed(0) + " drag=" + rg.eng.telemetry.aero.drag.toFixed(0));
}

console.log("\n========================================");
console.log("P2a 前端空力测试 " + pass + "/" + (pass + fail) + " Passed");
if (fail > 0) { console.log("FAILED: " + fail); process.exit(1); }
