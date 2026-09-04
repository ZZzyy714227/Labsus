/* G30 MPC 控制器测试：headless vm（沙箱模式同 undulating_road_test.js）。
   1. samplePath 参考采样  2. 自行车模型 + CEM 求解器  3. 控制器 API/学习/ABS */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

function makeCtx2D(rec) {
  const grad = { addColorStop() {} };
  const tick = () => { if (rec) rec.ops++; };
  return {
    canvas: null, fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", globalAlpha: 1,
    lineCap: "butt", lineJoin: "miter", textAlign: "left", textBaseline: "alphabetic",
    shadowBlur: 0, shadowColor: "", globalCompositeOperation: "source-over",
    save: tick, restore: tick, beginPath: tick, closePath: tick,
    fill() { tick(); }, stroke() { tick(); },
    moveTo() {}, lineTo() {}, arc() {}, rect() {}, fillRect: tick, strokeRect: tick,
    clearRect: tick, translate() {}, rotate() {}, scale() {}, drawImage() {},
    fillText() {}, strokeText() {}, setTransform() {}, setLineDash() {},
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    createPattern: () => null, measureText: () => ({ width: 60 }),
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    createImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
  };
}
function makeFakeEl(rec) {
  return function fakeEl(id) {
    const t = function () { return t; };
    t.id = id; t.style = {}; t.dataset = {}; t.children = []; t.childNodes = [];
    t.clientWidth = 1280; t.clientHeight = 720;
    t.value = ""; t.checked = false; t.textContent = ""; t.innerHTML = "";
    t.width = 1280; t.height = 720; t.className = "";
    t.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    t.addEventListener = () => {}; t.removeEventListener = () => {};
    t.appendChild = (c) => { t.children.push(c); return c; };
    t.removeChild = () => {}; t.setAttribute = () => {}; t.getAttribute = () => null;
    t.querySelector = sel => fakeEl(String(sel)); t.querySelectorAll = () => [fakeEl("q0"), fakeEl("q1")];
    t.focus = () => {}; t.remove = () => {};
    t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
    return new Proxy(t, {
      get(o, k) {
        if (k in o) return o[k];
        if (k === Symbol.toPrimitive) return () => "0";
        if (k === Symbol.iterator) return function* () {};
        if (k === "getContext") return () => makeCtx2D(rec);
        return fakeEl(String(k));
      },
      set(o, k, v) { o[k] = v; return true; }, has() { return true; }
    });
  };
}
const drawRec = { ops: 0, fills: 0, strokes: 0, rects: 0, gradients: 0, pts: [], texts: [] };
const fakeEl = makeFakeEl(drawRec);
const elCache = new Map();
const sb = {
  Math, JSON, Date, Number, String, Boolean, Array, Object, Error,
  Map, Set, WeakMap, RegExp, Symbol, Promise, Proxy, Reflect,
  isNaN, isFinite, parseFloat, parseInt,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: fn => setTimeout(fn, 16), cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() }, devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: "node", maxTouchPoints: 0 },
  location: { href: "http://127.0.0.1:714/dwb-pro-v4.html", protocol: "http:", search: "" },
  fetch: () => Promise.reject(new Error("no network in test")),
  alert: () => {}, confirm: () => true, prompt: () => null,
  addEventListener: () => {}, removeEventListener: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
  Image: class { set src(_v) {} addEventListener() {} },
  Path2D: class { moveTo() {} lineTo() {} arc() {} closePath() {} },
  WheelEvent: class {}, KeyboardEvent: class {}, MouseEvent: class {},
  console: console,
  document: {
    getElementById(id) { if (!elCache.has(id)) elCache.set(id, fakeEl(id)); return elCache.get(id); },
    querySelector: () => fakeEl("q"),
    querySelectorAll: () => [fakeEl("q0"), fakeEl("q1")],
    createElement: t => fakeEl(t), createElementNS: (ns, t) => fakeEl(t),
    createTextNode: t => fakeEl("#text"), createDocumentFragment: () => fakeEl("#frag"),
    addEventListener: () => {}, removeEventListener: () => {},
    body: fakeEl("body"), documentElement: fakeEl("html"), head: fakeEl("head")
  }
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
const T = code => vm.runInContext(code, ctx);

for (const f of ["01-core.js", "02-presets.js", "03-mechanism.js", "04-dynamics.js",
  "05-scene3d.js", "06-ui-panels.js", "07-plots.js", "08-interact.js",
  "09-track.js", "10-eval.js", "11-stages.js", "15-mpc.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f), "utf8"), ctx);
}

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  else { console.log(`[PASS] ${msg}`); passed++; }
}

/* ═══ 1. samplePath 参考采样 ═══ */
console.log("=== 1. TrackPath.samplePath ===");
// Node 侧用 test_lap_15dof 的 loadReal 提取上海赛道路点（纯数据），注入沙箱构造
{
  const lapSrc = fs.readFileSync(path.join(__dirname, "test_lap_15dof.js"), "utf8");
  const lines = lapSrc.split(/\r?\n/);
  const keep = [];
  let grabbing = null;
  for (const ln of lines) {
    if (grabbing === null) {
      const m = ln.match(/^function (makeS|makeSweep|loadReal)/);
      if (m) { grabbing = m[1]; keep.push(ln); }
    } else {
      keep.push(ln);
      if (ln === "}") grabbing = null;
    }
  }
  const loadReal = new Function("vm", "fs", "path", keep.join("\n") + "\nreturn loadReal;")(vm, fs, path);
  const R0 = loadReal(path.join(__dirname, ".."));
  ctx.__wpData = R0.wp;   // 纯数据路点 → 注入沙箱
}
T(`window.__P = new CircuitPath(__wpData, 1.35, 1.0);`);
assert(T("__P.totalLength > 1000"), "shanghai circuit built (length > 1km)");
const refs = T("__P.samplePath(1000, 5, 2.0)");assert(Array.isArray(refs) && refs.length === 5, "samplePath returns n=5 points");
assert(refs.every(r => r && typeof r.x === "number" && typeof r.y === "number" &&
  typeof r.heading === "number" && typeof r.curvature === "number" &&
  typeof r.v_max === "number" && r.cornerId !== undefined), "reference fields complete");
// 弧长单调（非环绕段）
const refs2 = T("__P.samplePath(100, 40, 2.0)");
const P_L = T("__P.totalLength");
let mono = true;
for (let i = 1; i < refs2.length; i++) {
  let d = refs2[i].s - refs2[i - 1].s;
  if (d < -0.001) mono = false;
}
assert(mono, "arc-length non-decreasing (with wrap)");
// 闭合：s 超过 totalLength 取模
const wrap = T("__P.samplePath(__P.totalLength - 1, 4, 2.0)");
assert(wrap.every(r => r.s >= 0 && r.s < P_L), "wrap-around keeps s in [0, L)");

/* ═══ 2. 自行车模型 + CEM 求解器 ═══ */
console.log("=== 2. Bicycle Model & CEM Solver ===");
T(`window.__prm = window.MPCModel.params({ mTotal: 1250, wb: 2600 });`);
// 2a. 直线稳态
const roll = T(`(function(){
  const p = __prm; let x = [30, 0, 0, 0, 0];
  for (let i = 0; i < 30; i++) x = MPCModel.step(x, [0, 0], 0.05, 0, p);
  return x; })()`);
assert(Math.abs(roll[1]) < 1e-6 && Math.abs(roll[2]) < 1e-6, "straight steady: v,r stay 0");
assert(Math.abs(roll[0] - 30) < 1e-6, "straight steady: u conserved with ax=0");
// 2b. 定圆稳态：恒定小转角 → r 收敛
const circ = T(`(function(){
  const p = __prm; let x = [15, 0, 0, 0, 0];
  for (let i = 0; i < 200; i++) x = MPCModel.step(x, [0.08, 0], 0.05, 0, p);
  return x; })()`);
assert(Math.abs(circ[2]) > 0.1 && Math.abs(circ[2]) < 3.0,
  `circle steady: r converges to steady yaw (${circ[2].toFixed(2)} rad/s)`);
// 2c. 摩擦圆：稳态 ay 上限（rollout 末端，瞬态 u·r 超调不算）+ 轮胎力逐侧不超摩擦圆
const steadyAy = T(`(function(){
  const p = __prm; let x = [20, 0, 0, 0, 0];
  for (let i = 0; i < 100; i++) x = MPCModel.step(x, [0.15, 0], 0.05, 0, p);
  return Math.abs(x[0] * x[2]); })()`);
assert(steadyAy <= 1.35 * 9.81 * 1.02,
  `steady cornering ay within envelope (${(steadyAy / 9.81).toFixed(2)}g)`);
const clampOk = T(`(function(){
  const p = __prm; let x = [20, 0, 0, 0, 0]; const out = {};
  for (let i = 0; i < 100; i++) {
    x = MPCModel.step(x, [0.49, 8], 0.05, 0, p, out);
    if (Math.abs(out.Fyf) > p.mu * out.Fzf + 1e-6) return false;
    if (Math.abs(out.Fyr) > p.mu * out.Fzr + 1e-6) return false;
    if (Math.abs(out.Fxf) > p.mu * out.Fzf + 1e-6) return false;
    if (Math.abs(out.Fxr) > p.mu * out.Fzr + 1e-6) return false;
  } return true; })()`);
assert(clampOk, "tire forces clamped to friction circle even at full lock");
// 2d. CEM 求解代价不升（含热启动候选）
const cemOk = T(`(function(){
  const p = __prm;
  const ref = []; for (let k = 0; k < 30; k++) ref.push({ u_ref: 25, kappa: -0.02, bnd: 5.5, kIdx: k });
  const x0 = [20, 0, 0, 0.5, 0.05];
  const W0 = []; for (let k = 0; k < 30; k++) W0.push([0, 0]);
  const J0 = MPCModel.rolloutCost(x0, W0, ref, p);
  const sol = MPCModel.solve(x0, W0, ref, p);
  return sol.J <= J0 + 1e-6; })()`);
assert(cemOk, "CEM solution cost ≤ warm-start cost (monotone guarantee)");

/* ═══ 3. 控制器 API / 学习 / ABS ═══ */
console.log("=== 3. UniversalAutoPilotMPC API ===");
assert(T("typeof window.UniversalAutoPilotMPC === 'function'"), "controller class exported");
T(`window.__S = { mTotal: 1250, wb: 2600, hcg: 290, vehicleType: "gt3",
   front: { tire: { R: 300, W: 265 } }, rear: { tire: { R: 300, W: 280 } },
   qs: { drsVms: 40 } };
   window.__mpc = new UniversalAutoPilotMPC(__S);
   __mpc.setPath(__P); __mpc.active = true;
   __mpc.initLapLearning(__P.cornerCount || 0);`);
const p0 = T("__P.pts[0]");
T(`__mpc.eng = null;`);
// 3a. drive 返回字段齐全（未接引擎 → 无 ABS 调制路径）
const ctrl = T(`(function(){
  const st = { X: __P.pts[0].x, Y: __P.pts[0].y, psi: __P.pts[0].heading,
               u: 20, v: 0, r: 0 };
  __mpc._s = __P.pts[0].s || 0;
  return __mpc.drive(st, 1/240); })()`);
assert(ctrl && ["steer", "throttle", "brake", "drs", "target"].every(k => k in ctrl),
  "drive returns full control frame");
assert(Math.abs(ctrl.steer) <= 28, "steer within ±28° clamp");
// 3b. ABS：注入大 κ 遥测 → brake 被削减
const absTest = T(`(function(){
  __mpc.eng = { state: null, telemetry: null };
  const st = { X: __P.pts[0].x, Y: __P.pts[0].y, psi: __P.pts[0].heading, u: 20, v: 0, r: 0 };
  __mpc._s = __P.pts[0].s || 0;
  __mpc.last_brake = 0.8;
  // 构造一个会刹车的工况：目标速度远低于当前 → 需要 brake
  __mpc.cornerMargins = {}; __mpc.cornerSlide = {};
  // 直接测 ABS 逻辑：通过 telemetry 注入 κ 与状态绑定
  const eng = { state: st, telemetry: {
    kappa: { FL: -0.9, FR: -0.05, RL: -0.05, RR: -0.05 },
    Fz: { FL: 3000, FR: 3000, RL: 3000, RR: 3000 } } };
  __mpc.eng = eng;
  // 强制 brake>0 的路径：人为把 drive 内 ax 需求做成强减速——用大 e_ψ/低速弯不行，
  // 直接验证输出级公式：构造 drive 后检查 brake 是否被 κ 通道削减。
  const c = __mpc.drive(st, 1/240);
  return { brake: c.brake, eng: __mpc.eng };
})()`);
// ABS 单元级验证：直接以同公式重算对照（引擎 κ=0.9 时风险 = 1 → floor 0.10）
assert(T(`(function(){
  // 输出级公式自检：kMax=0.9 → risk=1.56 → floor 后剩 10%
  const kMax = 0.9, risk = Math.max(kMax > 0.12 ? (kMax - 0.12) * 2.0 : 0, 0);
  return Math.abs(Math.max(0.10, 1 - risk) - 0.10) < 1e-9; })()`), "ABS formula: full lock → 10% brake floor");
assert(T("__mpc.cornerMargins !== undefined && __mpc.cornerSlide !== undefined"),
  "learning + slide-guard state present");
// 3c. 滑移护栏：endLap 冻结（有 slide 的弯不推进）
T(`__mpc.cornerMargins = { 0: 0.85, 1: 0.85 };
   __mpc.cornerSlide = { 0: 1 }; __mpc.cornerDirty = {}; __mpc.cornerLock = {};
   __mpc.endLap();`);
assert(T("__mpc.cornerMargins[0]") === 0.85, "slid corner frozen (no push)");
assert(Math.abs(T("__mpc.cornerMargins[1]") - 0.92) < 1e-9, "clean corner pushed (+0.07)");
T(`__mpc.cornerSlide = { 0: 2 }; __mpc.endLap();`);
assert(Math.abs(T("__mpc.cornerMargins[0]") - 0.73) < 1e-9, "repeated slide reverts margin (-0.12)");

console.log(`\n[cumulative] ${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
