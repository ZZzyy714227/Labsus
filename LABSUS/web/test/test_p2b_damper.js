/* P2b 前端 15-DOF 四象限减振器测试（2026-09-02）：cB/cR 独立 + 双拐点 blow-off。
   state-hold 单步 A/B（确定性）：用车身垂向速度 w 精确制造轮跳速度
   dtr = −w（w<0 车体下坠 = 压缩 +，w>0 上抛 = 回弹 −），路面/姿态零扰动下
   轮载增量 ΔFz = telemetry.Fz − Fz0_axle 即为阻尼力（弹簧/ARB/bumpstop/空力全零）：
   1. 低速线性段精确解析（ΔFz = C·v，压缩走 cB、回弹走 cR）
   2. 高速 blow-off 斜率比 ≈ 0.38（与旧 blow 常数同源）
   3. 四象限解耦：压缩响应只随 cB、回弹响应只随 cR（交叉 A/B 零差）
   4. 双拐点轴级标定接线（S.front/rear.vkB、vkR）
   5. 前后轴独立读取（rear.cB 不影响前轮）
   6. 向后兼容：无 cB 的旧 S → 压缩=回弹同系数（缺省链 cB??cR）
   7. 闭环烟测 3s 无 NaN
   无 DOM / 无 rAF —— 直接 node 运行。 */
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

function makeS(fOver, rOver) {
  return {
    mTotal: 1250, mSprung: 1100, wb: 2600, hcg: 290, vehicleType: "gt3",
    limF: [-55, 60], limR: [-55, 60],
    front: Object.assign({ arch: "direct", hp: { WC: [772, 0, 300] }, tire: { R: 300, W: 265 },
      cam0: -3.20, toe0: -0.15, mS: 320, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14, mr: 0.75, arb: { d: 28 } },
      fOver || {}),
    rear: Object.assign({ arch: "direct", hp: { WC: [740, 0, 300] }, tire: { R: 300, W: 280 },
      cam0: -2.20, toe0: 0.05, mS: 300, mU: 48, kS: 130, kT: 280, cB: 9, cR: 15, mr: 0.78, arb: { d: 24 } },
      rOver || {})
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
  return new ctx.window.VD(S, makeSIM(), 1.0);
}
function setState(eng, over) {
  Object.assign(eng.state, Object.assign({
    X: 0, Y: 0, Z: 0, phi: 0, theta: 0, psi: 0, u: 1, v: 0, w: 0, p: 0, q: 0, r: 0,
    omega: { FL: 3.33, FR: 3.33, RL: 3.33, RR: 3.33 }
  }, over || {}));
  return eng;
}
const DT = 1 / 240;
// 解析锚用小步长：dt≪MAX_SUB_DT 时 step 只走单子步 → 帧内状态漂移 <0.2%，
// telemetry.Fz 精确回到“设定状态下的阻尼响应”（积分漂移只影响多子步帧）。
// 烟测仍用真实 240Hz DT（见文末）。
const STEP_DT = 1e-4;
// 单步：车身垂向速度 w → 全轮同 dtr = −w；返回引擎（telemetry.Fz 已记录帧初响应）
function frameW(eng, w) {
  setState(eng, { w: w });
  eng.step({ throttle: 0, brake: 0, drs: false, steer: 0 }, { grade: 0, path: null, bumpNoise: 0 }, STEP_DT);
  return eng;
}
const dFz_FR = (eng) => eng.telemetry.Fz.FR - eng.Fz0_F;   // 前轴阻尼力（FR 轮）
const dFz_RR = (eng) => eng.telemetry.Fz.RR - eng.Fz0_R;   // 后轴阻尼力（RR 轮）

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log("[PASS] " + name); }
  else { fail++; console.log("[FAIL] " + name + (extra !== undefined ? "  " + extra : "")); }
}

// 手算锚（makeS：mrF=0.75 → CwB_F=9·1000·0.75²=5062.5 N·s/m，Cw_F(cR14)=7875）
{
  const eng = fresh(makeS());
  // 低速压缩 w=−0.05（dtr=+0.05 < vkB=0.13）→ ΔFz = CwB_F·0.05 = 253.1 N
  const a = dFz_FR(frameW(eng, -0.05));
  T("低速压缩线性精确：ΔFz = Cb·v", Math.abs(a - 5062.5 * 0.05) < 5062.5 * 0.05 * 0.02,
    "Δ=" + a.toFixed(1) + " 期望 253.1");
  // 低速回弹 w=+0.05（dtr=−0.05 < vkR=0.18）→ ΔFz = −Cw_F·0.05 = −393.8 N
  const b = dFz_FR(frameW(fresh(makeS()), 0.05));
  T("低速回弹线性精确：ΔFz = −Cr·v", Math.abs(b + 7875 * 0.05) < 7875 * 0.05 * 0.02,
    "Δ=" + b.toFixed(1) + " 期望 −393.8");
  T("压缩/回弹系数不同（cB=9 < cR=14）", a > 0 && b < 0 && Math.abs(a) < Math.abs(b) * 0.9,
    "bump Δ=" + a.toFixed(1) + " reb Δ=" + b.toFixed(1));
}

// ── 高速 blow-off：力被斜率 ×0.38 截断（不随速度线性猛增）──
{
  const g = (v) => dFz_FR(frameW(fresh(makeS()), -v));       // 压缩 |v| m/s
  const lin = (g(0.08) - g(0.03)) / 0.05;                    // 低速线性斜率 = Cb
  const blo = (g(0.60) - g(0.30)) / 0.30;                    // 高速 blow 斜率 = 0.38·Cb
  T("高速段斜率比 ≈ 0.38（blow-off 截断）", Math.abs(blo / lin - 0.38) < 0.05,
    "ratio=" + (blo / lin).toFixed(3));
  T("高速压缩力 < 线性外推（截断生效）", g(0.60) < 5062.5 * 0.60 * 0.65,
    "F(0.6)=" + g(0.60).toFixed(0));
}

// ── 四象限解耦：压缩只随 cB、回弹只随 cR（交叉 A/B 零差）──
{
  const aF = fresh(makeS()), bF = fresh(makeS({ cB: 20 })), cF = fresh(makeS({ cR: 30 }));
  const da_c = dFz_FR(frameW(aF, -0.12));     // 压缩 0.12 < 双拐点（线性区）
  const db_c = dFz_FR(frameW(bF, -0.12));     // 仅 cB 20（原 9）
  const dc_c = dFz_FR(frameW(cF, -0.12));     // 仅 cR 30（原 14）
  T("压缩响应随 cB 放大（20/9≈2.22）", db_c > da_c * 1.9, "ΔcB20=" + db_c.toFixed(1) + " ΔcB9=" + da_c.toFixed(1));
  T("压缩响应不受 cR 影响（解耦）", Math.abs(dc_c - da_c) < 1.0,
    "ΔcR30=" + dc_c.toFixed(2) + " ΔcR14=" + da_c.toFixed(2));
  const da_r = dFz_FR(frameW(fresh(makeS()), 0.12));      // 回弹 0.12 线性区
  const db_r = dFz_FR(frameW(fresh(makeS({ cB: 20 })), 0.12));
  const dc_r = dFz_FR(frameW(fresh(makeS({ cR: 30 })), 0.12));
  T("回弹响应随 cR 放大（30/14≈2.14）", Math.abs(dc_r) > Math.abs(da_r) * 1.8,
    "|ΔcR30|=" + Math.abs(dc_r).toFixed(1) + " |ΔcR14|=" + Math.abs(da_r).toFixed(1));
  T("回弹响应不受 cB 影响（解耦）", Math.abs(db_r - da_r) < 1.0,
    "ΔcB20=" + db_r.toFixed(2) + " ΔcB9=" + da_r.toFixed(2));
}

// ── 双拐点轴级标定：S.front.vkB 提高 → 高速点回到线性段 ──
{
  const def = dFz_FR(frameW(fresh(makeS()), -0.30));     // 默认 vkB=0.13 → 0.3 在 blow 段
  const vk = dFz_FR(frameW(fresh(makeS({ vkB: 0.5 })), -0.30)); // vkB=0.5 → 0.3 线性
  T("vkB 标定接线：0.3 由 blow 段转回线性段", Math.abs(vk - 5062.5 * 0.30) < 5062.5 * 0.30 * 0.02
    && vk > def * 1.4, "vk0.5=" + vk.toFixed(1) + " def=" + def.toFixed(1));
}

// ── 前后轴独立读取（rear.cB 不影响前轮）──
{
  const r20 = fresh(makeS(null, { cB: 20 }));            // 仅后轴 cB 9→20
  const fr = dFz_FR(frameW(fresh(makeS(null, { cB: 20 })), -0.12));
  const rr = dFz_RR(frameW(r20, -0.12));
  const rrBase = dFz_RR(frameW(fresh(makeS()), -0.12));
  T("后轴压缩走 rear.cB（RR Δ 放大 20/9≈2.22）", rr > rrBase * 1.9,
    "RR cB20=" + rr.toFixed(1) + " cB9=" + rrBase.toFixed(1));
  T("rear.cB 不影响前轮压缩", Math.abs(fr - 5062.5 * 0.12) < 5062.5 * 0.12 * 0.02,
    "FR Δ=" + fr.toFixed(1) + " 期望 607.5");
}

// ── 向后兼容：无 cB 的旧 S → 压缩=回弹同系数 cR（缺省链 cB??cR）──
{
  const S = makeS();
  delete S.front.cB; delete S.rear.cB;
  const eng = fresh(S);
  T("缺省链：无 cB 时 CwB == Cw（构造器同值）", eng.CwB_F === eng.Cw_F && eng.CwB_R === eng.Cw_R,
    "CwB_F=" + eng.CwB_F + " Cw_F=" + eng.Cw_F);
  const dn = dFz_FR(frameW(fresh(S), -0.05));   // 压缩（低速）
  const up = dFz_FR(frameW(fresh(S), +0.05));   // 回弹（低速）
  T("无 cB S：压缩/回弹 |ΔFz| 相等（= cR·v）", Math.abs(dn + up) < 2.0 &&
    Math.abs(dn - 7875 * 0.05) < 7875 * 0.05 * 0.02,
    "dn=" + dn.toFixed(2) + " up=" + up.toFixed(2));
}

// ── 构造器系数换算冒烟（cB/cR N·s/mm ×1000 ×mr² → N·s/m）──
{
  const eng = fresh(makeS());
  T("CwB_F = cB·1000·mrF²", Math.abs(eng.CwB_F - 9 * 1000 * 0.75 * 0.75) < 1e-6, "CwB_F=" + eng.CwB_F);
  T("Cw_R = cR·1000·mrR²", Math.abs(eng.Cw_R - 15 * 1000 * 0.78 * 0.78) < 1e-6, "Cw_R=" + eng.Cw_R);
  T("CwB_R = cB·1000·mrR²", Math.abs(eng.CwB_R - 9 * 1000 * 0.78 * 0.78) < 1e-6, "CwB_R=" + eng.CwB_R);
}

// ── 闭环烟测：默认标定巡航 3s 无 NaN 且状态有界 ──
{
  const eng = fresh(makeS());
  setState(eng, { u: 60, omega: { FL: 200, FR: 200, RL: 200, RR: 200 } });
  let nan = false, wMax = 0;
  for (let i = 0; i < 240 * 3; i++) {
    eng.step({ throttle: 0, brake: 0, drs: false, steer: 0 }, { grade: 0, path: null, bumpNoise: 0 }, DT);
    const s = eng.state;
    wMax = Math.max(wMax, Math.abs(s.w));
    if (!isFinite(s.u) || !isFinite(s.Z) || !isFinite(s.theta) || !isFinite(s.w)) { nan = true; break; }
  }
  T("四象限阻尼巡航无 NaN 且 w 有界", !nan && wMax < 0.35,
    "wMax=" + wMax.toFixed(3) + " Z=" + eng.state.Z.toFixed(4) + " u=" + eng.state.u.toFixed(1));
}

console.log("\n========================================");
console.log("P2b 四象限减振器测试 " + pass + "/" + (pass + fail) + " Passed");
if (fail > 0) { console.log("FAILED: " + fail); process.exit(1); }
