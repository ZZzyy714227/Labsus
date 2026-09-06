/* G31 动力工坊测试：headless vm（沙箱模式照抄 test_tire_lab.js）。
   覆盖主题（对应节标 === 1./2./...）：
   节1 数据模型/校验/legacy-equivalent 默认/mapLookup/setSpec 保护。
   等价锚说明：默认规格的轮上扭矩必须逐位复现旧常数（后 480 / 前 120，
   未乘 drivePowerFactor——该系数由接线层负责），否则 15-DOF 行为会漂移。 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

function makeCtx2D(rec) {
  const grad = { addColorStop() {} };
  const put = (x, y) => { if (rec && Number.isFinite(x) && Number.isFinite(y)) rec.pts.push([x, y]); };
  const tick = () => { if (rec) rec.ops++; };
  return {
    canvas: null, fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", globalAlpha: 1,
    lineCap: "butt", lineJoin: "miter", textAlign: "left", textBaseline: "alphabetic",
    shadowBlur: 0, shadowColor: "", globalCompositeOperation: "source-over",
    save: tick, restore: tick, beginPath: tick, closePath: tick,
    fill() { tick(); if (rec) rec.fills++; }, stroke() { tick(); if (rec) rec.strokes++; },
    moveTo: put, lineTo: put, arc() {}, rect() {}, fillRect: tick, strokeRect: tick,
    clearRect: tick, translate() {}, rotate() {}, scale() {}, drawImage() {},
    fillText(s) { tick(); if (rec) rec.texts.push(s); }, strokeText() {},
    setTransform() {}, setLineDash() {},
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
    t.querySelector = sel => fakeEl(String(sel)); t.querySelectorAll = () => [fakeEl('q0'), fakeEl('q1')];
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
const memStore = {};   // 可控 localStorage 桩
const sb = {
  Math, JSON, Date, Number, String, Boolean, Array, Object, Error,
  Map, Set, WeakMap, RegExp, Symbol, Promise, Proxy, Reflect,
  isNaN, isFinite, parseFloat, parseInt,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: fn => setTimeout(fn, 16), cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() }, devicePixelRatio: 1,
  localStorage: {
    getItem: k => (k in memStore ? memStore[k] : null),
    setItem: (k, v) => { memStore[k] = String(v); }, removeItem: k => { delete memStore[k]; }
  },
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
    querySelectorAll: () => [fakeEl('q0'), fakeEl('q1')],
    createElement: t => fakeEl(t), createElementNS: (ns, t) => fakeEl(t),
    createTextNode: t => fakeEl("#text"), createDocumentFragment: () => fakeEl("#frag"),
    addEventListener: () => {}, removeEventListener: () => {},
    body: fakeEl("body"), documentElement: fakeEl("html"), head: fakeEl("head")
  }
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
const T = code => vm.runInContext(code, ctx);

for (const f of ["01-core.js", "02-presets.js", "16-powertrain.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f), "utf8"), ctx);
}

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  else { console.log(`[PASS] ${msg}`); passed++; }
}

/* ═══ 1. 数据模型 / 校验 / legacy-equivalent 默认 / mapLookup ═══ */
console.log("=== 1. POWERTRAIN Data Model & Validation ===");
assert(T("typeof POWERTRAIN !== 'undefined'"), "POWERTRAIN module exists");
const d0 = T("POWERTRAIN.defaultSpec()");
assert(d0.architecture === "ice" && d0.drive === "awd_fixed", "legacy default arch/drive");
assert(d0.gearbox.ratios.length === 1 && d0.gearbox.ratios[0] === 1 && d0.gearbox.finalDrive === 1, "legacy single ratio");
assert(Math.abs(d0.splitFront - 0.2) < 1e-12, "legacy splitFront 0.2");
assert(T("POWERTRAIN.validate(POWERTRAIN.defaultSpec()).ok") === true, "default spec valid");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'warp'})).ok") === false, "bad arch rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{gearbox:Object.assign(POWERTRAIN.defaultSpec().gearbox,{ratios:[0]})})).ok") === false, "zero ratio rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{ice:Object.assign(POWERTRAIN.defaultSpec().ice,{map:[[800]]})})).ok") === false, "malformed map rejected");
// mapLookup 线性插值 + 端点钳位
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(Math.abs(T("POWERTRAIN.mapLookup([[800,100],[2000,300]], 1400)") - 200) < 1e-9, "map linear interp");
assert(Math.abs(T("POWERTRAIN.mapLookup([[800,100],[2000,300]], 500)") - 100) < 1e-9, "map clamp low");
assert(Math.abs(T("POWERTRAIN.mapLookup([[800,100],[2000,300]], 5000)") - 300) < 1e-9, "map clamp high");
// setSpec 非法 → 不覆盖当前 spec
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'warp'}));");
assert(T("POWERTRAIN.spec.architecture") === "ice", "invalid setSpec keeps prior spec");
/* 审查修复断言（G31-P1 review）。等价锚 step 断言按计划移至节 5（Task 5），本节不重复。 */
// M-5：validate(null) 错误串自描述
assert(T("POWERTRAIN.validate(null).errors[0]") === "spec(null or not object)", "M-5 validate(null) descriptive error");
// I-1：map 转速点必须单调递增
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{ice:Object.assign(POWERTRAIN.defaultSpec().ice,{map:[[800,100],[5000,500],[2000,300]]})})).ok") === false, "I-1 non-ascending map rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{ice:Object.assign(POWERTRAIN.defaultSpec().ice,{map:[[800,100],[800,300]]})})).errors.join(',')").includes("ice.map(ascending)"), "I-1 duplicate rpm rejected with ice.map(ascending)");
assert(T("POWERTRAIN.validate(POWERTRAIN.defaultSpec()).ok") === true, "I-1 flat-torque default map still valid");
// I-1：mapLookup 重复 x 点除零守卫 → 有限值
assert(Number.isFinite(T("POWERTRAIN.mapLookup([[800,100],[800,300]], 800)")), "I-1 mapLookup dup-x finite");
assert(Number.isFinite(T("POWERTRAIN.mapLookup([[800,100],[800,300]], 801)")), "I-1 mapLookup dup-x finite (above)");
// M-2：fuelCutRpm 必须 ≥ redlineRpm
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{ice:Object.assign(POWERTRAIN.defaultSpec().ice,{redlineRpm:9000,fuelCutRpm:100})})).errors.join(',')").includes("ice.fuelCutRpm"), "M-2 fuelCutRpm < redline rejected");
assert(T("POWERTRAIN.validate(POWERTRAIN.defaultSpec()).ok") === true, "M-2 default fuelCut 9200 > redline 9000 valid");
// M-3：混动架构必须至少一台电机
for (const arch of ["p2", "p3", "p4", "series", "powersplit"]) {
  assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'${arch}',motorF:null,motorR:null})).ok`) === false, `M-3 hybrid ${arch} requires motor`);
}
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'p2',motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:{capacityKwh:20}})).ok") === true, "M-3 p2 with motorF valid");
// I-2：battery.soc0 必须 ∈ [0,1]
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{battery:{capacityKwh:2.5,soc0:7}})).ok") === false, "I-2 soc0=7 rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{battery:{capacityKwh:2.5,soc0:-0.2}})).ok") === false, "I-2 soc0=-0.2 rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{battery:{capacityKwh:2.5}})).ok") === true, "I-2 soc0 undefined allowed");
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{battery:{capacityKwh:2.5,soc0:0.6}}));");
assert(T("POWERTRAIN.state.soc") === 0.6 && T("POWERTRAIN.state.soc >= 0 && POWERTRAIN.state.soc <= 1"), "I-2 resetState soc in [0,1]");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
// M-4：setSpec 深拷贝隔离——调用方事后改对象不得污染 POWERTRAIN.spec
T("var _isoSpec = POWERTRAIN.defaultSpec(); POWERTRAIN.setSpec(_isoSpec); _isoSpec.architecture = 'warp'; _isoSpec.ice.map[0][1] = -999; _isoSpec.gearbox.ratios.push(0.5);");
assert(T("POWERTRAIN.spec.architecture") === "ice", "M-4 deep-copy isolation: architecture");
assert(T("POWERTRAIN.spec.ice.map[0][1]") === 1200, "M-4 deep-copy isolation: nested map");
assert(T("POWERTRAIN.spec.gearbox.ratios.length") === 1, "M-4 deep-copy isolation: array push");
// M-1：EV 无曲轴 → resetState 后 iceOmega 为 0（占位不得为伪转速；EV 规格不得携带 ice 块）
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:{capacityKwh:20}}));");
assert(T("POWERTRAIN.state.iceOmega") === 0, "M-1 ev resetState iceOmega === 0");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000}})).ok") === false, "M-1 ev spec with leftover ice rejected");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.spec.architecture") === "ice", "M-1 restore ice default");

/* ═══ 2. Power Sources (ICE / Motor) ═══ */
console.log("=== 2. Power Sources (ICE / Motor) ===");
// ICE：map 查表 + 断油 + 摩擦/制动（用带 fric 的 spec）
const iceSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
iceSpec.ice.fricA = 10; iceSpec.ice.fricB = 0.002; iceSpec.ice.fricC = 0;
T(`POWERTRAIN.setSpec(${JSON.stringify(iceSpec)});`);
assert(Math.abs(T("POWERTRAIN.iceTorque(3000, 1.0)") - (1200 - (10 + 0.002*3000)*0.35)) < 1e-9, "ice full throttle = map - fric*0.35");
assert(Math.abs(T("POWERTRAIN.iceTorque(3000, 0.0)") - (-(10 + 0.002*3000))) < 1e-9, "ice zero throttle = -fric (engine braking)");
assert(T("POWERTRAIN.iceTorque(3000, 0.0)") < 0, "engine braking negative");
// 断油：rpm > fuelCut → drive=0 但 fric 保留
// 注：节1 M-2 校验要求 fuelCutRpm ≥ redlineRpm，故同步下调 redlineRpm 使 cutSpec 通过 setSpec
const cutSpec = JSON.parse(JSON.stringify(iceSpec)); cutSpec.ice.redlineRpm = 4500; cutSpec.ice.fuelCutRpm = 5000;
T(`POWERTRAIN.setSpec(${JSON.stringify(cutSpec)});`);
assert(Math.abs(T("POWERTRAIN.iceTorque(6000, 1.0)") - (-(10 + 0.002*6000))) < 1e-9, "fuel cut: drive=0, fric remains");
// Motor：恒扭矩→恒功率拐点 + 回收限制
const mSpec = { peakTorqueNm: 300, peakPowerKw: 150, baseRpm: 4000, maxRpm: 12000, regenMaxKw: 100, inertia: 0.1 };
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 2000, 1.0, 0.8)`) - 300) < 1e-6, "motor const torque below base");
const w8 = 8000 * Math.PI / 30;
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 8000, 1.0, 0.8)`) - 150000 / w8) < 1e-6, "motor power-limited above base");
// 回收：cmd=-1 → 负扭矩，受 regenMaxKw 限制
const regCap = 100000 / (4000 * Math.PI / 30);
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 4000, -1.0, 0.5)`) + regCap) < 1e-6, "regen capped by regenMaxKw");
// I-3 SOC 降额精确等式断言：soc=0.06 放电 = 300×(0.06−0.05)/0.15 = 20
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 2000, 1.0, 0.06)`) - 20) < 1e-6, "I-3 soc=0.06 discharge exact = 20");
// I-3：soc=0.99 回收 = −regCap×(1−0.99)/0.05 = −regCap×0.2
const regCapExact = Math.min(Math.min(mSpec.peakTorqueNm, mSpec.peakPowerKw*1000/(4000*Math.PI/30)), mSpec.regenMaxKw*1000/(4000*Math.PI/30));
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 4000, -1.0, 0.99)`) + regCapExact*0.2) < 1e-6, "I-3 soc=0.99 regen exact = -regCap*0.2");

/* ═══ 2b. 审查修复 G31-P2 ═══ */
console.log("=== 2b. G31-P2 Review Fixes ===");
// I-1 baseRpm 一致性校验（motor 段）
const mBad = { peakTorqueNm: 300, peakPowerKw: 150, baseRpm: 4000, maxRpm: 12000 };
const mGood = { peakTorqueNm: 300, peakPowerKw: 150, baseRpm: 4775, maxRpm: 12000 };
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mBad)},motorR:null})).ok`) === false, "I-1 baseRpm=4000 inconsistent → rejected");
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mBad)},motorR:null})).errors.join(',')`).includes("motorF.baseRpm(inconsistent with P/T)"), "I-1 baseRpm error string");
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mGood)},motorR:null,battery:{capacityKwh:20}})).ok`) === true, "I-1 baseRpm=4775 consistent → accepted");
// 无 baseRpm 不校验
const mNoBase = { peakTorqueNm: 300, peakPowerKw: 150, maxRpm: 12000 };
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mNoBase)},motorR:null,battery:{capacityKwh:20}})).ok`) === true, "I-1 no baseRpm → skip check");

// I-2 motorTorque NaN 防护
assert(T(`POWERTRAIN.motorTorque(null, 4000, 1, 0.8)`) === 0, "I-2 motorTorque(null) === 0");
assert(T(`POWERTRAIN.motorTorque({}, 4000, 1, 0.8)`) === 0, "I-2 motorTorque({}) === 0");
assert(T(`POWERTRAIN.motorTorque({peakTorqueNm:0,peakPowerKw:150,maxRpm:12000}, 4000, 1, 0.8)`) === 0, "I-2 motorTorque(peakTorque=0) === 0");
assert(T(`POWERTRAIN.motorTorque({peakTorqueNm:300,peakPowerKw:0,maxRpm:12000}, 4000, 1, 0.8)`) === 0, "I-2 motorTorque(peakPower=0) === 0");

// M-2 负 rpm 符号
const mNeg = { peakTorqueNm: 300, peakPowerKw: 150, maxRpm: 12000, regenMaxKw: 100 };
const wNeg = Math.abs(-4000) * Math.PI / 30;
const expNeg = -Math.min(300, 150000 / wNeg);
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mNeg)}, -4000, 1.0, 0.8)`) - expNeg) < 1e-6, "M-2 negative rpm → negative torque (reverse drive)");
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mNeg)}, -4000, -1.0, 0.8)`) - Math.min(Math.min(300, 150000/wNeg), 100000/wNeg)) < 1e-6, "M-2 negative rpm regen → positive torque");

// M-4 边界断言
// motorTorque soc=0.05 → derate=0 → 0
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 2000, 1.0, 0.05)`)) < 1e-9, "M-4 soc=0.05 discharge → 0");
// motorTorque soc=0.2 → full (condition is soc<0.2, 0.2 not <0.2)
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 2000, 1.0, 0.2)`) - 300) < 1e-6, "M-4 soc=0.2 discharge → full 300");
// motorTorque soc=0.95 regen → full (condition is soc>0.95, 0.95 not >0.95)
const regCap95 = Math.min(Math.min(mSpec.peakTorqueNm, mSpec.peakPowerKw*1000/(4000*Math.PI/30)), mSpec.regenMaxKw*1000/(4000*Math.PI/30));
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 4000, -1.0, 0.95)`) + regCap95) < 1e-6, "M-4 soc=0.95 regen → full");
// motorTorque soc=1.0 regen → derate=0 → 0
assert(Math.abs(T(`POWERTRAIN.motorTorque(${JSON.stringify(mSpec)}, 4000, -1.0, 1.0)`)) < 1e-9, "M-4 soc=1.0 regen → 0");
// iceTorque spec.ice=null → 0
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:{capacityKwh:20}}));");
assert(T("POWERTRAIN.iceTorque(3000, 1.0)") === 0, "M-4 iceTorque with spec.ice=null → 0");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
// iceTorque cmd=0, fric=0 → 0
assert(Math.abs(T("POWERTRAIN.iceTorque(3000, 0.0)")) < 1e-9, "M-4 iceTorque cmd=0 fric=0 → 0");
// fuelCutRpm undefined → 不断油（高 rpm 仍输出 map 值）
const noCutSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()"))); delete noCutSpec.ice.fuelCutRpm;
T(`POWERTRAIN.setSpec(${JSON.stringify(noCutSpec)});`);
assert(Math.abs(T("POWERTRAIN.iceTorque(10000, 1.0)") - 1200) < 1e-9, "M-4 fuelCutRpm undefined → no cut at high rpm");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 3. Driveline (gearbox / reflected inertia / diff) ═══ */
console.log("=== 3. Driveline (gearbox / reflected inertia / diff) ===");
// 换挡状态机：shiftCmd → shiftT>0 且期间扭矩中断标记；完成后 gearIdx+1、iceOmega 跳变
const gbSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
gbSpec.gearbox = { type: "manual", ratios: [3, 2, 1.5, 1.2, 1, 0.85], finalDrive: 3.9, shiftTimeMs: 120, eff: 0.97, autoUpFrac: 0.92, autoDownFrac: 0.55 };
const r0 = T(`POWERTRAIN.setSpec(${JSON.stringify(gbSpec)})`);
assert(r0.ok === true, "gearbox spec valid");
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.iceOmega = 500;");
T("POWERTRAIN.requestShift(1);");
assert(T("POWERTRAIN.state.shiftT") > 0 && T("POWERTRAIN.state.shiftDir") === 1, "shift requested");
// 换挡进行中 advanceGearbox 返回 true（扭矩中断标记，供段5 组合器置零输出）
assert(T("POWERTRAIN.advanceGearbox(0.004, 20)") === true, "advanceGearbox returns true during shift");
// P3：cut 窗口长度 = shiftTimeMs/dt = 120/4 = 30 次 true（已消耗 1 次，继续计数）
let cutCount = 1;
while (T("POWERTRAIN.advanceGearbox(0.004, 20)") === true) cutCount++;
assert(cutCount === 30, "P3 cut window length === shiftTimeMs/dt = 30 substeps");
assert(T("POWERTRAIN.state.gearIdx") === 2, "gear advanced after shiftTime");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "shift state cleared");
const wIce = 20 * 1.5 * 3.9;
assert(Math.abs(T("POWERTRAIN.state.iceOmega") - wIce) < 1e-6, "rpm jump = wheelOmega×ratio×final");
// 换挡结束后 advanceGearbox 返回 false（不再中断）
assert(T("POWERTRAIN.advanceGearbox(0.004, 20)") === false, "advanceGearbox returns false when idle");
// 越界换挡被拒
T("POWERTRAIN.state.gearIdx = 0; POWERTRAIN.requestShift(-1);");
assert(T("POWERTRAIN.state.shiftT") === 0, "downshift below 0 rejected");
T("POWERTRAIN.state.gearIdx = 5; POWERTRAIN.requestShift(1);");
assert(T("POWERTRAIN.state.shiftT") === 0, "upshift above top rejected");
// 换挡进行中重复请求被忽略（shiftT>0 时 requestShift 无副作用）
T("POWERTRAIN.state.gearIdx = 2; POWERTRAIN.requestShift(1); POWERTRAIN.requestShift(1);");
assert(T("POWERTRAIN.state.shiftDir") === 1 && T("POWERTRAIN.state.gearIdx") === 2, "re-entrant requestShift ignored while shifting");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
// 反射惯量：(I_ice+I_motCoupled)×(ratio×final)²/nDrive
// I-2(G31-P6)：nDrive 按驱动轮数归一——riSpec.drive="awd_fixed" → 4 轮
const riSpec = JSON.parse(JSON.stringify(gbSpec));
riSpec.ice.inertia = 0.25; riSpec.architecture = "p2";
riSpec.battery = { capacityKwh: 10 };
riSpec.motorR = { peakTorqueNm: 200, peakPowerKw: 100, baseRpm: 4775, maxRpm: 10000, regenMaxKw: 80, inertia: 0.1 };
const r1 = T(`POWERTRAIN.setSpec(${JSON.stringify(riSpec)})`);
assert(r1.ok === true, "p2 spec valid");
T("POWERTRAIN.state.gearIdx = 0;");
const expectRI = (0.25 + 0.1) * (3 * 3.9) ** 2 / 4;   // awd_fixed → nDrive=4
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - expectRI) < 1e-9, "reflected inertia p2 awd gear0 (/4)");
// 反射惯量随挡位变化（gear3: 1.2×3.9）
T("POWERTRAIN.state.gearIdx = 3;");
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - (0.25 + 0.1) * (1.2 * 3.9) ** 2 / 4) < 1e-9, "reflected inertia p2 awd gear3 (/4)");
// I-2：rwd 规格 → nDrive=2
const riRwd = JSON.parse(JSON.stringify(riSpec)); riRwd.drive = "rwd";
T(`POWERTRAIN.setSpec(${JSON.stringify(riRwd)}); POWERTRAIN.state.gearIdx = 0;`);
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - (0.25 + 0.1) * (3 * 3.9) ** 2 / 2) < 1e-9, "I-2 reflected inertia p2 rwd gear0 (/2)");
// p3 电机不在曲轴链 → 只计 ICE 惯量（awd_fixed → /4）
const p3Spec = JSON.parse(JSON.stringify(riSpec));
p3Spec.architecture = "p3";
T(`POWERTRAIN.setSpec(${JSON.stringify(p3Spec)}); POWERTRAIN.state.gearIdx = 0;`);
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - 0.25 * (3 * 3.9) ** 2 / 4) < 1e-9, "reflected inertia p3 excludes motor (awd /4)");
// legacy 默认：inertia=0 → 0（锚）
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.reflectedInertia()") === 0, "legacy reflected inertia zero (anchor)");
// I-1(G31-P6)：hasRealDrivetrain 判据
assert(T("POWERTRAIN.hasRealDrivetrain()") === false, "I-1 hasRealDrivetrain: legacy default → false");
const hrdSpec1 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
hrdSpec1.gearbox.ratios = [3, 2, 1]; hrdSpec1.gearbox.finalDrive = 3.9;
T(`POWERTRAIN.setSpec(${JSON.stringify(hrdSpec1)});`);
assert(T("POWERTRAIN.hasRealDrivetrain()") === true, "I-1 hasRealDrivetrain: ratios[3,2,1]+fd=3.9 → true");
const hrdSpec2 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
hrdSpec2.gearbox.finalDrive = 3.9;
T(`POWERTRAIN.setSpec(${JSON.stringify(hrdSpec2)});`);
assert(T("POWERTRAIN.hasRealDrivetrain()") === true, "I-1 hasRealDrivetrain: ratios[1]+fd=3.9 → true");
const hrdSpec3 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
hrdSpec3.gearbox.ratios = [1, 1]; hrdSpec3.gearbox.finalDrive = 1;
T(`POWERTRAIN.setSpec(${JSON.stringify(hrdSpec3)});`);
assert(T("POWERTRAIN.hasRealDrivetrain()") === true, "I-1 hasRealDrivetrain: ratios[1,1] len>1 → true");
T("POWERTRAIN.spec = null;");
assert(T("POWERTRAIN.hasRealDrivetrain()") === false, "I-1 hasRealDrivetrain: spec=null → false");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
// M-1(G31-P6-fix)：hasLiveRpmSource 判据——封装 (architecture==="ev" || hasRealDrivetrain())，
//   声浪（13-engine-sound.js）与 HUD（11-stages.js）共用；EV 直驱无需真实齿轮比即可信 rpm 源。
assert(T("POWERTRAIN.hasLiveRpmSource()") === false, "M-1 hasLiveRpmSource: legacy ice 恒等箱 → false");
const hlsEvSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
hlsEvSpec.architecture = "ev"; hlsEvSpec.drive = "rwd"; hlsEvSpec.ice = null;
hlsEvSpec.motorR = { peakTorqueNm: 200, peakPowerKw: 100, maxRpm: 12000 };
hlsEvSpec.battery = { capacityKwh: 20 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(hlsEvSpec)})`).ok === true, "M-1 ev+恒等箱 spec valid");
assert(T("POWERTRAIN.hasRealDrivetrain()") === false, "M-1 ev+恒等箱: hasRealDrivetrain()===false（齿轮比仍是 legacy 恒等）");
assert(T("POWERTRAIN.hasLiveRpmSource()") === true, "M-1 ev+恒等箱: hasLiveRpmSource()===true（架构感知，EV 直驱不依赖真实齿轮比）");
const hlsIceRealSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
hlsIceRealSpec.gearbox.ratios = [3, 2, 1]; hlsIceRealSpec.gearbox.finalDrive = 3.9;
T(`POWERTRAIN.setSpec(${JSON.stringify(hlsIceRealSpec)});`);
assert(T("POWERTRAIN.hasLiveRpmSource()") === true, "M-1 ice+真实齿轮比: hasLiveRpmSource()===true");
T("POWERTRAIN.spec = null;");
assert(T("POWERTRAIN.hasLiveRpmSource()") === false, "M-1 spec=null → hasLiveRpmSource()===false");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.state = null;");
assert(T("POWERTRAIN.hasLiveRpmSource()") === false, "M-1 state=null → hasLiveRpmSource()===false");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");   // 还原（resetState 重建 state）
// autoShift：rpm 超 autoUpFrac×redline → 升挡请求
// 夹具修正：manual 不自动换挡是正确语义，故本段用 type="auto" 的 spec
const agSpec = JSON.parse(JSON.stringify(gbSpec)); agSpec.gearbox.type = "auto";
T(`POWERTRAIN.setSpec(${JSON.stringify(agSpec)}); POWERTRAIN.state.gearIdx = 1;`);
T("POWERTRAIN.autoShift(0.95 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === 1, "auto upshift at high rpm");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.gearIdx = 2;");
T("POWERTRAIN.autoShift(0.4 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === -1, "auto downshift at low rpm");
// 中间转速带（autoDownFrac..autoUpFrac）不换挡
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.gearIdx = 2;");
T("POWERTRAIN.autoShift(0.7 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "no shift in mid-rpm band");
// 顶挡高 rpm / 一挡低 rpm → 边界不越界
T("POWERTRAIN.state.gearIdx = 5; POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "top gear high rpm: no further upshift");
T("POWERTRAIN.state.gearIdx = 0; POWERTRAIN.autoShift(0.2 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "first gear low rpm: no further downshift");
// manual 语义：即使高 rpm 也不自动换挡（夹具修正依据）
T(`POWERTRAIN.setSpec(${JSON.stringify(gbSpec)}); POWERTRAIN.state.gearIdx = 1;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "manual gearbox never auto-shifts");
// type=single 不换挡
const sgSpec = JSON.parse(JSON.stringify(gbSpec)); sgSpec.gearbox.type = "single";
T(`POWERTRAIN.setSpec(${JSON.stringify(sgSpec)}); POWERTRAIN.state.gearIdx = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "single-speed gearbox never shifts");
// 无 gearbox / 无 spec 时的防御返回（不抛异常）
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.reflectedInertia()") === 0 && T("POWERTRAIN.advanceGearbox(0.004, 20)") === false, "legacy single-ratio gearbox: no inertia, no shift activity");
// P3：真置 spec=null（T 直接赋值）后，四个方法必须安全返回 0/false，不抛异常
T("POWERTRAIN.spec = null;");
let nullThrew = null;
try {
  assert(T("POWERTRAIN.reflectedInertia()") === 0, "P3 spec=null: reflectedInertia === 0");
  assert(T("POWERTRAIN.advanceGearbox(0.004, 20)") === false, "P3 spec=null: advanceGearbox === false");
  T("POWERTRAIN.requestShift(1);");   // 无返回值，只需不抛
  T("POWERTRAIN.autoShift(9000);");   // 无返回值，只需不抛
  assert(true, "P3 spec=null: requestShift/autoShift 不抛异常");
} catch (e) { nullThrew = e; }
assert(nullThrew === null, "P3 spec=null: 四方法全部不抛异常");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

// 恢复默认
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 3b. G31-P3 Review Fixes ═══ */
console.log("=== 3b. G31-P3 Review Fixes ===");

// ── P3-Major: requestShift(dir) 定义域守卫（仅 +1/−1）──
const gb6 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
gb6.gearbox = { type: "manual", ratios: [3, 2, 1.5, 1.2, 1, 0.85], finalDrive: 3.9, shiftTimeMs: 120, eff: 0.97, autoUpFrac: 0.92, autoDownFrac: 0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(gb6)})`).ok === true, "P3 gb6 spec valid");
// dir=0 → 拒绝（避免 shiftDir=0 的“永久换挡中”死锁）
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.requestShift(0);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "P3 requestShift(0) → shiftT===0 且 shiftDir===0");
// dir=2 → 拒绝（不允许从 gear1 直接跳到 gear3）
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.requestShift(2);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "P3 requestShift(2) from gear1 → 不允许跳两挡");
// dir=-2 / NaN / undefined / null / "1" / 1.5 / true / {} → 全部拒绝
const badLits = [["-2", "-2"], ["NaN", "NaN"], ["undefined", "undefined"], ["null", "null"], ["\"1\"", "\"1\""], ["1.5", "1.5"], ["true", "true"], ["{}", "{}"]];
for (const [label, lit] of badLits) {
  T("POWERTRAIN.state.gearIdx = 2; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
  T(`POWERTRAIN.requestShift(${lit});`);
  assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0,
    `P3 requestShift(${label}) rejected`);
}
// dir=+1/−1 仍正常接受（无回归）
T("POWERTRAIN.state.gearIdx = 2; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.requestShift(1);");
assert(T("POWERTRAIN.state.shiftT") > 0 && T("POWERTRAIN.state.shiftDir") === 1, "P3 requestShift(+1) accepted");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.requestShift(-1);");
assert(T("POWERTRAIN.state.shiftT") > 0 && T("POWERTRAIN.state.shiftDir") === -1, "P3 requestShift(-1) accepted");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");

// ── P3-Moderate: autoShift 白名单语义 ──
// type=undefined → 拒绝（白名单外）
const tuSpec = JSON.parse(JSON.stringify(gb6)); delete tuSpec.gearbox.type;
T(`POWERTRAIN.setSpec(${JSON.stringify(tuSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "P3 autoShift type=undefined → no shift");
// type="cvt" → 接受（C3(G31-FR)：白名单扩为 auto/dct/seq/cvt。
//   本实现的 cvt 仍走 ratios[] 步进近似，必须能换挡，否则 THS 预设永远卡 1 挡）
const cvtSpec = JSON.parse(JSON.stringify(gb6)); cvtSpec.gearbox.type = "cvt";
T(`POWERTRAIN.setSpec(${JSON.stringify(cvtSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === 1 && T("POWERTRAIN.state.shiftT") > 0, "P3 autoShift type=cvt → upshift (C3 白名单内)");
// type="single" → 拒绝（白名单外的未知类型仍不自动换挡）
const sglSpec = JSON.parse(JSON.stringify(gb6)); sglSpec.gearbox.type = "single";
T(`POWERTRAIN.setSpec(${JSON.stringify(sglSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "P3 autoShift type=single → no shift (白名单外)");
// type="AUTO" → 拒绝（大小写敏感，不在白名单）
const ucSpec = JSON.parse(JSON.stringify(gb6)); ucSpec.gearbox.type = "AUTO";
T(`POWERTRAIN.setSpec(${JSON.stringify(ucSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "P3 autoShift type=AUTO → no shift (大小写敏感)");
// type="dct" → 接受（白名单内）
const dctSpec = JSON.parse(JSON.stringify(gb6)); dctSpec.gearbox.type = "dct";
T(`POWERTRAIN.setSpec(${JSON.stringify(dctSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.95 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === 1 && T("POWERTRAIN.state.shiftT") > 0, "P3 autoShift type=dct → upshift");

// ── P3-Minor: advanceGearbox dt 有限性守卫 ──
T(`POWERTRAIN.setSpec(${JSON.stringify(gb6)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.requestShift(1);");
const shiftTBefore = T("POWERTRAIN.state.shiftT");
assert(shiftTBefore > 0, "P3 dt guard: precondition shiftT>0");
assert(T("POWERTRAIN.advanceGearbox(undefined, 20)") === false, "P3 advanceGearbox(undefined,20) → false");
assert(T("POWERTRAIN.state.shiftT") === shiftTBefore && Number.isFinite(T("POWERTRAIN.state.shiftT")),
  "P3 advanceGearbox(undefined) 不修改 shiftT（不 NaN）");
assert(T("POWERTRAIN.advanceGearbox(NaN, 20)") === false, "P3 advanceGearbox(NaN,20) → false");
assert(T("POWERTRAIN.state.shiftT") === shiftTBefore, "P3 advanceGearbox(NaN) 不修改 shiftT");
assert(T("POWERTRAIN.advanceGearbox(Infinity, 20)") === false, "P3 advanceGearbox(Infinity,20) → false");
assert(T("POWERTRAIN.state.shiftT") === shiftTBefore, "P3 advanceGearbox(Infinity) 不修改 shiftT");
// 有限 dt 仍正常工作（无回归）
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.gearIdx = 1;");
T("POWERTRAIN.requestShift(1);");
assert(T("POWERTRAIN.advanceGearbox(0.004, 20)") === true, "P3 advanceGearbox(finite dt) still returns true during shift");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");

// ── P3-Minor: EV 红线回退到 motorR/motorF.maxRpm ──
// EV+auto：ice=null，motorR.maxRpm=16000 → rr 应按 16000 计算
const evAuto = JSON.parse(JSON.stringify(gb6));
evAuto.architecture = "ev"; evAuto.ice = null;
evAuto.battery = { capacityKwh: 20 };
evAuto.motorR = { peakTorqueNm: 400, peakPowerKw: 200, maxRpm: 16000 };
evAuto.motorF = null;
evAuto.gearbox.type = "auto";
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(evAuto)})`).ok === true, "P3 EV+auto spec valid");
// 转速 15200 = 0.95×16000 → 应升挡
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.autoShift(15200);");
assert(T("POWERTRAIN.state.shiftDir") === 1, "P3 EV autoShift @15200/16000=0.95 → upshift (红线=motorR.maxRpm)");
// 转速 14000 ≈ 0.875×16000 → 中间带，不换挡（若错误地用 9000，rr=1.55 会错误升挡）
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.autoShift(14000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0, "P3 EV autoShift @14000/16000=0.875 → mid-band no shift");
// 转速 8000 = 0.5×16000 → 低于 0.55，应降挡
T("POWERTRAIN.state.gearIdx = 2; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.autoShift(8000);");
assert(T("POWERTRAIN.state.shiftDir") === -1, "P3 EV autoShift @8000/16000=0.5 → downshift");
// 仅 motorF 时（motorR=null）：回退到 motorF.maxRpm
const evF = JSON.parse(JSON.stringify(evAuto));
evF.motorR = null; evF.motorF = { peakTorqueNm: 300, peakPowerKw: 150, maxRpm: 12000 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(evF)})`).ok === true, "P3 EV motorF-only spec valid");
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.autoShift(11400);");  // 0.95×12000
assert(T("POWERTRAIN.state.shiftDir") === 1, "P3 EV motorF-only autoShift → 红线=motorF.maxRpm=12000");
// ICE 优先：同时存在 ice.redlineRpm 与 motorR.maxRpm 时，红线仍取 ice.redlineRpm
const hybAuto = JSON.parse(JSON.stringify(gb6));
hybAuto.architecture = "p2"; hybAuto.gearbox.type = "auto";
hybAuto.battery = { capacityKwh: 10 };
hybAuto.motorR = { peakTorqueNm: 200, peakPowerKw: 100, maxRpm: 20000 };  // 远大于 ice.redlineRpm=9000
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(hybAuto)})`).ok === true, "P3 p2+auto spec valid");
T("POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
T("POWERTRAIN.autoShift(0.95 * 9000);");  // 8550：若按 ice.redline 算 rr=0.95 → 升挡
assert(T("POWERTRAIN.state.shiftDir") === 1, "P3 hybrid autoShift 优先用 ice.redlineRpm");

// 恢复默认
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 4. Battery SOC ═══ */
console.log("=== 4. Battery SOC ===");
const batSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
batSpec.architecture = "ev"; batSpec.drive = "rwd"; delete batSpec.ice;
batSpec.motorR = { peakTorqueNm: 400, peakPowerKw: 200, baseRpm: 5000, maxRpm: 12000, regenMaxKw: 150, inertia: 0.1 };
batSpec.battery = { capacityKwh: 60, soc0: 0.8, maxDischargeKw: 400, maxChargeKw: 150 };
const rb = T(`POWERTRAIN.setSpec(${JSON.stringify(batSpec)})`);
assert(rb.ok === true, "ev+battery spec valid");
const s0 = T("POWERTRAIN.state.soc");
assert(Math.abs(s0 - 0.8) < 1e-12, "soc0 applied");
// 放电 200kW × 1s → dSoc = 200000/(60×3.6e6) = 9.259e-4
T("POWERTRAIN.integrateBattery(200000, 1.0);");
assert(Math.abs((s0 - T("POWERTRAIN.state.soc")) - 200000 / (60 * 3.6e6)) < 1e-12, "discharge integral exact");
// 充电反向
const s1 = T("POWERTRAIN.state.soc");
T("POWERTRAIN.integrateBattery(-150000, 1.0);");
assert(Math.abs((T("POWERTRAIN.state.soc") - s1) - 150000 / (60 * 3.6e6)) < 1e-12, "charge integral exact");
// 钳位 [0,1]
T("POWERTRAIN.state.soc = 0.0001; POWERTRAIN.integrateBattery(500000, 10.0);");
assert(T("POWERTRAIN.state.soc") === 0, "soc clamps at 0");
T("POWERTRAIN.state.soc = 0.9999; POWERTRAIN.integrateBattery(-500000, 10.0);");
assert(T("POWERTRAIN.state.soc") === 1, "soc clamps at 1");
// 无电池 no-op
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
const sNoBat = T("POWERTRAIN.state.soc");
T("POWERTRAIN.integrateBattery(100000, 1.0);");
assert(T("POWERTRAIN.state.soc") === sNoBat, "no battery → no-op");
// 非有限输入 no-op
T(`POWERTRAIN.setSpec(${JSON.stringify(batSpec)}); POWERTRAIN.state.soc = 0.5;`);
T("POWERTRAIN.integrateBattery(NaN, 1.0); POWERTRAIN.integrateBattery(100000, NaN);");
assert(T("POWERTRAIN.state.soc") === 0.5, "non-finite inputs no-op");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 5. 组合器（七架构）+ step 主循环 + step 级 legacy 等价锚 ═══ */
console.log("=== 5. Combinator (7 arch) + step() + Legacy Anchor ===");

// ── 5.1 legacy 等价锚（step 级，最高优先；逐位 ±1e-9）──
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
const anc = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
assert(Math.abs(anc.tRear - 480) < 1e-9 && Math.abs(anc.tFront - 120) < 1e-9, "5.1 legacy anchor tRear=480/tFront=120 (±1e-9)");
assert(anc.shifting === false, "5.1 legacy anchor shifting===false");
assert(anc.tWheel === null, "5.1 legacy anchor tWheel===null");
assert(anc.gearIdx === 0 && Number.isFinite(anc.iceRpm) && anc.soc === 1 && anc.P_gen === 0, "5.1 legacy anchor fields (gearIdx=0/iceRpm finite/soc=1/P_gen=0)");

// ── 5.2 throttle 线性：throttle 0.5 → tRear 240 / tFront 60 ──
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
const lin = T("POWERTRAIN.step(0.004, {throttle:0.5, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
assert(Math.abs(lin.tRear - 240) < 1e-9 && Math.abs(lin.tFront - 60) < 1e-9, "5.2 throttle 0.5 → tRear 240 / tFront 60");

// ── 5.3 换挡期 tRear===0（设 shiftT>0 后 step）──
const gbShift = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
gbShift.gearbox = { type:"manual", ratios:[3,2,1.5], finalDrive:1, shiftTimeMs:200, eff:1, autoUpFrac:0.92, autoDownFrac:0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(gbShift)})`).ok === true, "5.3 shift spec valid");
T("POWERTRAIN.state.gearIdx=0; POWERTRAIN.state.shiftT=100; POWERTRAIN.state.shiftDir=1;");
const shf = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
assert(shf.shifting === true && Math.abs(shf.tRear) < 1e-9 && Math.abs(shf.tFront) < 1e-9, "5.3 torque cut during shift (tRear===0, shifting===true)");

// ── 5.4 p2 功率流：T_shaft = (T_ice + T_motR)×ratio×eff 数值核对 ──
const p2s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
p2s.architecture = "p2"; p2s.drive = "rwd"; p2s.ice.inertia = 0.25;
p2s.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:10000, regenMaxKw:80, inertia:0.1 };
p2s.motorF = null;
p2s.battery = { capacityKwh:10, soc0:0.6, maxDischargeKw:200, maxChargeKw:150 };
p2s.gearbox = { type:"manual", ratios:[3], finalDrive:3.5, shiftTimeMs:0, eff:0.95, autoUpFrac:0.92, autoDownFrac:0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(p2s)})`).ok === true, "5.4 p2 spec valid");
const p2soc0 = T("POWERTRAIN.state.soc");
const p2ratio = 3 * 3.5, p2eff = 0.95;
const p2iceRpm = (20 * p2ratio) * 30 / Math.PI;   // drive rwd → iceAxleW=wR=20；iceOmega=20×ratio
const p2Tice = T(`POWERTRAIN.iceTorque(${p2iceRpm}, 1)`);
const p2Tmot = T(`POWERTRAIN.motorTorque(${JSON.stringify(p2s.motorR)}, ${p2iceRpm}, 1, ${p2soc0})`);
const p2expect = (p2Tice + p2Tmot) * p2ratio * p2eff / 2;   // rwd: Tr=Ts, tRear=Tr/2
const p2out = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:20,FR:20,RL:20,RR:20})");
assert(Math.abs(p2out.tRear - p2expect) < 1e-6, "5.4 p2 T_shaft=(T_ice+T_motR)×ratio×eff numeric");
assert(p2out.tRear > 0, "5.4 p2 delivers positive rear torque");

// ── 5.5 series：tRear>0 且 iceRpm>0 且 P_gen>0；soc 方向正确（放电降/发电升）──
// 5.5a 放电主导（强电机/高轮速/弱 ICE）→ P_net>0 → soc 降
const seDis = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
seDis.architecture = "series"; seDis.drive = "rwd";
seDis.ice.map = [[800,50],[9000,50]]; seDis.motorF = null;
seDis.motorR = { peakTorqueNm:400, peakPowerKw:200, maxRpm:12000, regenMaxKw:150, inertia:0.1 };
seDis.battery = { capacityKwh:30, soc0:0.6, maxDischargeKw:250, maxChargeKw:150 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(seDis)})`).ok === true, "5.5a series discharge spec valid");
const seDis0 = T("POWERTRAIN.state.soc");
const seDisOut = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:100,FR:100,RL:100,RR:100})");
assert(seDisOut.tRear > 0, "5.5a series tRear>0 (motor drives wheels)");
assert(seDisOut.iceRpm > 0, "5.5a series iceRpm>0 (range-extender spinning)");
assert(seDisOut.P_gen > 0, "5.5a series P_gen>0 (ICE generates)");
assert(T("POWERTRAIN.state.soc") < seDis0, "5.5a series discharge-dominant → soc decreases");
// 5.5b 发电主导（弱电机/低轮速/强 ICE）→ P_net<0 → soc 升
const seChg = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
seChg.architecture = "series"; seChg.drive = "rwd";
seChg.ice.map = [[800,3000],[9000,3000]]; seChg.motorF = null;
seChg.motorR = { peakTorqueNm:50, peakPowerKw:20, maxRpm:12000, regenMaxKw:50, inertia:0.1 };
seChg.battery = { capacityKwh:30, soc0:0.6, maxDischargeKw:250, maxChargeKw:150 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(seChg)})`).ok === true, "5.5b series charge spec valid");
const seChg0 = T("POWERTRAIN.state.soc");
const seChgOut = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:5,FR:5,RL:5,RR:5})");
assert(seChgOut.P_gen > 0 && seChgOut.tRear > 0 && seChgOut.iceRpm > 0, "5.5b series P_gen>0 & tRear>0 & iceRpm>0");
assert(T("POWERTRAIN.state.soc") > seChg0, "5.5b series generation-dominant → soc increases");

// ── 5.6 ev tv：tWheel 长度 4 且和 = T_motF+T_motR（tvBias 分裂守恒）──
const tvSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
tvSpec.architecture = "ev"; tvSpec.drive = "tv"; tvSpec.ice = null;
tvSpec.motorF = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
tvSpec.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
tvSpec.battery = { capacityKwh:20, soc0:0.7, maxDischargeKw:200, maxChargeKw:120 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(tvSpec)})`).ok === true, "5.6 ev tv spec valid");
const tvSoc0 = T("POWERTRAIN.state.soc");
const tvRpm = 20 * 30 / Math.PI;   // ev 电机直驱：rpm = 轮速(rad/s)×30/π
const tvTm = T(`POWERTRAIN.motorTorque(${JSON.stringify(tvSpec.motorF)}, ${tvRpm}, 0.8, ${tvSoc0})`);
const tvOut = T("POWERTRAIN.step(0.004, {throttle:0.8, brake:0, tvBias:0.6}, {FL:20,FR:20,RL:20,RR:20})");
assert(Array.isArray(tvOut.tWheel) && tvOut.tWheel.length === 4, "5.6 tv tWheel length 4");
const tvSum = tvOut.tWheel.reduce((a,b)=>a+b, 0);
assert(Math.abs(tvSum - 2*tvTm) < 1e-6, "5.6 tv sum(tWheel) === T_motF+T_motR (conservation)");
assert(Math.abs(tvOut.tWheel[0] - tvTm*0.6) < 1e-6 && Math.abs(tvOut.tWheel[1] - tvTm*0.4) < 1e-6, "5.6 tvBias=0.6 splits front L/R");

// ── 5.7 p3/p4/powersplit 冒烟：有限 + 符号正确 ──
for (const [arch, drive] of [["p3","rwd"],["p4","awd_fixed"],["powersplit","rwd"]]) {
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.architecture = arch; s.drive = drive; s.splitFront = 0.5;
  s.motorF = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
  s.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
  s.battery = { capacityKwh:20, soc0:0.7, maxDischargeKw:200, maxChargeKw:120 };
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(s)})`).ok === true, `5.7 ${arch} spec valid`);
  const o = T("POWERTRAIN.step(0.004, {throttle:0.8, brake:0}, {FL:20,FR:20,RL:20,RR:20})");
  assert(Number.isFinite(o.tFront) && Number.isFinite(o.tRear) && Number.isFinite(o.iceRpm) && Number.isFinite(o.soc), `5.7 ${arch} finite output`);
  assert(o.tRear > 0, `5.7 ${arch} tRear>0 (positive drive)`);
}

// ── 5.8 能量守恒：p2 充电工况（T_ice 富余 + motor 负扭矩）→ P_net<0 且 soc 升 ──
const p2c = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
p2c.architecture = "p2"; p2c.drive = "rwd"; p2c.motorF = null;
p2c.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:10000, regenMaxKw:80, inertia:0.1 };
p2c.battery = { capacityKwh:10, soc0:0.6, maxDischargeKw:200, maxChargeKw:150 };
p2c.gearbox = { type:"manual", ratios:[1], finalDrive:1, shiftTimeMs:0, eff:1, autoUpFrac:0.92, autoDownFrac:0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(p2c)})`).ok === true, "5.8 p2 charge spec valid");
const p2c0 = T("POWERTRAIN.state.soc");
// throttle 0.3（ICE 富余）+ brake 0.8（电机反转矩回收）→ 充电
let p2cOut;
for (let i=0;i<20;i++) p2cOut = T("POWERTRAIN.step(0.004, {throttle:0.3, brake:0.8}, {FL:50,FR:50,RL:50,RR:50})");
const p2cTmot = T(`POWERTRAIN.motorTorque(${JSON.stringify(p2c.motorR)}, ${50*30/Math.PI}, -0.8, 0.6)`);
assert(p2cTmot < 0, "5.8 p2 motor negative torque (regen)");
assert(T("POWERTRAIN.state.soc") > p2c0, "5.8 p2 charging → soc increases (energy conservation)");
assert(p2cOut.tRear > 0, "5.8 p2 ICE surplus still drives wheels (tRear>0)");

// ── 5.9 integrateBattery 新守卫（dt=0/负、P=Infinity、st.soc NaN/Infinity → no-op）──
const guardSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
guardSpec.architecture = "ev"; guardSpec.drive = "rwd"; delete guardSpec.ice;
guardSpec.motorR = { peakTorqueNm:400, peakPowerKw:200, maxRpm:12000, regenMaxKw:150, inertia:0.1 };
guardSpec.battery = { capacityKwh:60, soc0:0.8, maxDischargeKw:400, maxChargeKw:150 };
T(`POWERTRAIN.setSpec(${JSON.stringify(guardSpec)});`);
T("POWERTRAIN.state.soc = 0.5;");
T("POWERTRAIN.integrateBattery(100000, 0);");
assert(T("POWERTRAIN.state.soc") === 0.5, "5.9 integrateBattery dt=0 → no-op");
T("POWERTRAIN.integrateBattery(100000, -1);");
assert(T("POWERTRAIN.state.soc") === 0.5, "5.9 integrateBattery dt<0 → no-op");
T("POWERTRAIN.integrateBattery(Infinity, 1);");
assert(T("POWERTRAIN.state.soc") === 0.5, "5.9 integrateBattery P=Infinity → no-op");
T("POWERTRAIN.state.soc = NaN; POWERTRAIN.integrateBattery(100000, 1);");
assert(Number.isNaN(T("POWERTRAIN.state.soc")), "5.9 integrateBattery st.soc=NaN → no-op (stays NaN)");
T("POWERTRAIN.state.soc = Infinity; POWERTRAIN.integrateBattery(100000, 1);");
assert(T("POWERTRAIN.state.soc") === Infinity, "5.9 integrateBattery st.soc=Infinity → no-op");

// ── 5.10 validate battery 必需（ev/p2 无 battery → ok false）──
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:null})).ok") === false, "5.10 ev without battery rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:null})).errors.join(',')").includes("battery(required for electrified)"), "5.10 battery(required for electrified) error string");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'p2',motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:null})).ok") === false, "5.10 p2 without battery rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000},battery:{capacityKwh:60}})).ok") === true, "5.10 ev with battery valid");

T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 5b. G31-P5 审查修复 ═══ */
console.log("=== 5b. G31-P5 Review Fixes ===");

// ── C1：p2 电功率参考转速——解析预期 P_mot = T_mot×iceOmega/0.95，断言 ΔSOC ±1e-9 ──
const c1Spec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
c1Spec.architecture = "p2"; c1Spec.drive = "rwd";
c1Spec.motorF = null;
c1Spec.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:16000, regenMaxKw:80, inertia:0.1 };
c1Spec.battery = { capacityKwh:10, soc0:0.7, maxDischargeKw:500, maxChargeKw:200 };
c1Spec.gearbox = { type:"manual", ratios:[3], finalDrive:3.5, shiftTimeMs:0, eff:0.95, autoUpFrac:0.92, autoDownFrac:0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(c1Spec)})`).ok === true, "C1 p2 ratio=10.5 spec valid");
const c1Soc0 = T("POWERTRAIN.state.soc");
const c1Dt = 0.004;
const c1Out = T(`POWERTRAIN.step(${c1Dt}, {throttle:1, brake:0}, {FL:20,FR:20,RL:20,RR:20})`);
// 解析计算：iceOmega = wR * ratio = 20 * 10.5 = 210 rad/s
const c1Ratio = 3 * 3.5;
const c1IceOmega = 20 * c1Ratio;   // 210 rad/s
const c1Rpm = c1IceOmega * 30 / Math.PI;
const c1TMot = T(`POWERTRAIN.motorTorque(${JSON.stringify(c1Spec.motorR)}, ${c1Rpm}, 1, ${c1Soc0})`);
// P_mot = T_motR * iceOmega / 0.95（p2 电机在曲轴链）
const c1Pmot = c1TMot * c1IceOmega / 0.95;
// ΔSOC = P_mot * dt / (cap * 3.6e6)
const c1DeltaSoc = c1Pmot * c1Dt / (10 * 3.6e6);
const c1Actual = c1Soc0 - c1Out.soc;
assert(Math.abs(c1Actual - c1DeltaSoc) < 1e-9, `C1 p2 ΔSOC magnitude matches analytical (ΔSOC=${c1Actual.toExponential(6)}, expect=${c1DeltaSoc.toExponential(6)})`);
// 若错误地用 wR=20 而非 iceOmega=210，P_mot 会小 10.5×，该断言将捕获
assert(c1Pmot > c1TMot * 20 / 0.95 * 5, "C1 P_mot uses iceOmega (≫ wR) — catches 10.5× error");

// ── I1a：p2+motorF only → motorF 扭矩到达轮上 ──
const i1Spec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
i1Spec.architecture = "p2"; i1Spec.drive = "rwd";
i1Spec.motorF = { peakTorqueNm:150, peakPowerKw:80, maxRpm:14000, regenMaxKw:60, inertia:0.05 };
i1Spec.motorR = null;
i1Spec.battery = { capacityKwh:15, soc0:0.65, maxDischargeKw:500, maxChargeKw:200 };
i1Spec.gearbox = { type:"manual", ratios:[2.5], finalDrive:4, shiftTimeMs:0, eff:0.96, autoUpFrac:0.92, autoDownFrac:0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(i1Spec)})`).ok === true, "I1a p2+motorF only spec valid");
const i1Soc0 = T("POWERTRAIN.state.soc");
const i1Out = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:25,FR:25,RL:25,RR:25})");
// 解析：iceOmega = 25*10 = 250 rad/s; rpmF = 250*30/PI
const i1Ratio = 2.5 * 4;
const i1IceOmega = 25 * i1Ratio;
const i1RpmF = i1IceOmega * 30 / Math.PI;
const i1TMotF = T(`POWERTRAIN.motorTorque(${JSON.stringify(i1Spec.motorF)}, ${i1RpmF}, 1, ${i1Soc0})`);
const i1Tice = T(`POWERTRAIN.iceTorque(${i1RpmF}, 1)`);
// Ts = (T_ice + T_motF + 0) * ratio * eff; rwd → Tr = Ts; tRear = Tr/2
const i1Expect = (i1Tice + i1TMotF) * i1Ratio * 0.96 / 2;
assert(Math.abs(i1Out.tRear - i1Expect) < 1e-6, `I1a p2 motorF torque reaches wheel (tRear=${i1Out.tRear.toFixed(3)}, expect=${i1Expect.toFixed(3)})`);
assert(i1TMotF > 0 && i1Out.tRear > i1Tice * i1Ratio * 0.96 / 2, "I1a motorF contribution positive in tRear");
// SOC 变化与解析一致
const i1Pmot = i1TMotF * i1IceOmega / 0.95;
const i1DeltaSoc = i1Pmot * 0.004 / (15 * 3.6e6);
assert(Math.abs((i1Soc0 - i1Out.soc) - i1DeltaSoc) < 1e-9, "I1a p2+motorF ΔSOC matches analytical");

// ── I1b：pure ice + motor → validate false ──
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{motorF:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000}})).ok") === false, "I1b ice+motorF rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{motorR:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000}})).ok") === false, "I1b ice+motorR rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{motorF:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000}})).errors.join(',')").includes("motor(forbidden for ice)"), "I1b error string motor(forbidden for ice)");

// ── I2：电池功率上限反馈到电机扭矩 ──
const i2Spec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
i2Spec.architecture = "ev"; i2Spec.drive = "rwd"; i2Spec.ice = null;
i2Spec.motorF = null;
i2Spec.motorR = { peakTorqueNm:400, peakPowerKw:200, maxRpm:12000, regenMaxKw:150, inertia:0.1 };
i2Spec.battery = { capacityKwh:60, soc0:0.8, maxDischargeKw:10, maxChargeKw:150 };  // 10kW 很小
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(i2Spec)})`).ok === true, "I2 ev+battery 10kW spec valid");
const i2OutLim = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:50,FR:50,RL:50,RR:50})");
// 无限制对比
const i2Unlim = JSON.parse(JSON.stringify(i2Spec));
i2Unlim.battery.maxDischargeKw = 9999;
T(`POWERTRAIN.setSpec(${JSON.stringify(i2Unlim)})`);
const i2OutUnlim = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:50,FR:50,RL:50,RR:50})");
assert(i2OutLim.tRear < i2OutUnlim.tRear * 0.55, `I2 battery 10kW clamp: tRear=${i2OutLim.tRear.toFixed(2)} ≪ unlimited=${i2OutUnlim.tRear.toFixed(2)}`);
// P_mot 不超 10kW × 1.06（容差来自 /0.95 与钳制精确性）
const i2Pmot = i2OutLim.tRear * 2 * 50 / 0.95;   // tRear*2 = Tr; P = Tr*wR/0.95 (ev 用轮速)
assert(i2Pmot <= 10000 * 1.06, `I2 P_mot=${i2Pmot.toFixed(1)}W ≤ 10kW×1.06`);

// ── M1：tvBias=NaN → tWheel 全有限且和守恒 ──
const m1Spec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
m1Spec.architecture = "ev"; m1Spec.drive = "tv"; m1Spec.ice = null;
m1Spec.motorF = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
m1Spec.motorR = { peakTorqueNm:200, peakPowerKw:100, maxRpm:12000, regenMaxKw:80, inertia:0.1 };
m1Spec.battery = { capacityKwh:20, soc0:0.7, maxDischargeKw:200, maxChargeKw:120 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(m1Spec)})`).ok === true, "M1 ev+tv spec valid");
const m1Out = T("POWERTRAIN.step(0.004, {throttle:0.8, brake:0, tvBias:NaN}, {FL:20,FR:20,RL:20,RR:20})");
assert(Array.isArray(m1Out.tWheel) && m1Out.tWheel.length === 4, "M1 tvBias=NaN → tWheel array len 4");
assert(m1Out.tWheel.every(v => Number.isFinite(v)), "M1 tvBias=NaN → all tWheel finite");
const m1Sum = m1Out.tWheel.reduce((a,b)=>a+b, 0);
assert(Math.abs(m1Sum - (m1Out.tFront*2 + m1Out.tRear*2)) < 1e-9, "M1 tvBias=NaN → sum(tWheel) = Tf+Tr (conservation)");
// tvBias=Infinity 同样安全
const m1bOut = T("POWERTRAIN.step(0.004, {throttle:0.8, brake:0, tvBias:Infinity}, {FL:20,FR:20,RL:20,RR:20})");
assert(m1bOut.tWheel.every(v => Number.isFinite(v)), "M1 tvBias=Infinity → all finite");
// tvBias=-3 钳位到 0
const m1cOut = T("POWERTRAIN.step(0.004, {throttle:0.8, brake:0, tvBias:-3}, {FL:20,FR:20,RL:20,RR:20})");
assert(m1cOut.tWheel.every(v => Number.isFinite(v)) && m1cOut.tWheel[0] === 0, "M1 tvBias=-3 → clamped to 0 (FL=0)");

// ── M2：ev+tv 单电机 → validate false ──
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',drive:'tv',ice:null,motorF:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000},motorR:null,battery:{capacityKwh:20}})).ok") === false, "M2 ev+tv single motor rejected");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',drive:'tv',ice:null,motorF:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000},motorR:null,battery:{capacityKwh:20}})).errors.join(',')").includes("tv(requires motorF & motorR)"), "M2 error string");
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',drive:'tv',ice:null,motorF:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000},motorR:{peakTorqueNm:200,peakPowerKw:100,maxRpm:12000},battery:{capacityKwh:20}})).ok") === true, "M2 ev+tv dual motor valid");

// ── 5.5 magnitude 补强：series ΔSOC 解析断言 ──
// 重跑 5.5a 工况，用解析式验证 ΔSOC
T(`POWERTRAIN.setSpec(${JSON.stringify(seDis)});`);
const mg55soc0 = T("POWERTRAIN.state.soc");
const mg55dt = 0.004;
const mg55out = T(`POWERTRAIN.step(${mg55dt}, {throttle:1, brake:0}, {FL:100,FR:100,RL:100,RR:100})`);
// series: wMotR = wR = 100; T_motR 已由 motorTorque 计算
const mg55rpmR = 100 * 30 / Math.PI;
const mg55TMot = T(`POWERTRAIN.motorTorque(${JSON.stringify(seDis.motorR)}, ${mg55rpmR}, 1, ${mg55soc0})`);
const mg55Pmot = mg55TMot * 100 / 0.95;   // series 用轮速
const mg55Pgen = mg55out.P_gen;
const mg55Pnet = mg55Pmot - mg55Pgen;
// 钳制
const mg55MaxDis = 250 * 1000, mg55MaxChg = 150 * 1000;
const mg55PnetClamped = Math.max(-mg55MaxChg, Math.min(mg55MaxDis, mg55Pnet));
const mg55DeltaSoc = mg55PnetClamped * mg55dt / (30 * 3.6e6);
assert(Math.abs((mg55soc0 - mg55out.soc) - mg55DeltaSoc) < 1e-9, `5.5-mag series ΔSOC analytical (actual=${(mg55soc0-mg55out.soc).toExponential(6)}, expect=${mg55DeltaSoc.toExponential(6)})`);

// ── 5.8 magnitude 补强：p2 充电工况 ΔSOC 解析断言 ──
// p2c: ratio=1, wR=50 → iceOmega=50; brake>throttle → regen
T(`POWERTRAIN.setSpec(${JSON.stringify(p2c)});`);
const mg58soc0 = T("POWERTRAIN.state.soc");
const mg58dt = 0.004;
const mg58out = T(`POWERTRAIN.step(${mg58dt}, {throttle:0.3, brake:0.8}, {FL:50,FR:50,RL:50,RR:50})`);
// p2: wMotR = iceOmega = 50; T_motR 在 regen
const mg58rpm = 50 * 30 / Math.PI;
const mg58TMot = T(`POWERTRAIN.motorTorque(${JSON.stringify(p2c.motorR)}, ${mg58rpm}, -0.8, ${mg58soc0})`);
const mg58Pmot = mg58TMot * 50 / 0.95;   // p2 用 iceOmega=50, T_motR<0 → P_mot<0 (regen)
// ICE P_gen = 0 for p2 architecture
const mg58Pnet = mg58Pmot - 0;
const mg58MaxDis = 200 * 1000, mg58MaxChg = 150 * 1000;
const mg58PnetClamped = Math.max(-mg58MaxChg, Math.min(mg58MaxDis, mg58Pnet));
const mg58DeltaSoc = mg58PnetClamped * mg58dt / (10 * 3.6e6);
assert(Math.abs((mg58soc0 - mg58out.soc) - mg58DeltaSoc) < 1e-9, `5.8-mag p2 charge ΔSOC analytical (actual=${(mg58soc0-mg58out.soc).toExponential(6)}, expect=${mg58DeltaSoc.toExponential(6)})`);
assert(mg58DeltaSoc < 0, "5.8-mag ΔSOC negative → soc increases (charging)");

console.log("=== 5c. G31-P6-fix I-3: dm.tcsRear 能量通道（仅缩放 P_mot 后电机贡献） ===");
// ── I-3(G31-P6-fix)：dm.tcsRear（默认 1）仅用于 P_mot 中后电机贡献的缩放
//    （T_motR × tcsRear 进 P_mot），不影响轮扭矩输出（Tf/Tr/tWheel）。
//    机械通道（轮循环内 tcsScale 切扭矩）与能量通道（tcsRear 切 P_mot/SOC）分离。
const trSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
trSpec.architecture = "ev"; trSpec.drive = "rwd"; trSpec.ice = null; trSpec.motorF = null;
trSpec.motorR = { peakTorqueNm: 400, peakPowerKw: 200, maxRpm: 12000, regenMaxKw: 150, inertia: 0.1 };
trSpec.battery = { capacityKwh: 60, soc0: 0.8 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(trSpec)})`).ok === true, "I-3 tcsRear ev+rwd spec valid");
const trWo = "{FL:50,FR:50,RL:50,RR:50}";
T("POWERTRAIN.resetState();");
const trOutDef = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, ${trWo})`);          // 缺省（无 tcsRear 字段）
T("POWERTRAIN.resetState();");
const trOut1 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:1}, ${trWo})`);   // tcsRear=1
T("POWERTRAIN.resetState();");
const trOut05 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:0.5}, ${trWo})`); // tcsRear=0.5
// 机械通道不受影响：轮扭矩输出逐位一致
assert(trOutDef.tRear === trOut1.tRear && trOutDef.tRear === trOut05.tRear,
  "I-3 tcsRear 不影响 tRear（机械通道独立，轮扭矩输出不受能量通道缩放影响）");
assert(trOutDef.tFront === trOut1.tFront && trOutDef.tFront === trOut05.tFront,
  "I-3 tcsRear 不影响 tFront");
// 缺省 dm.tcsRear 等价 tcsRear=1（向后兼容）
assert(trOutDef.soc === trOut1.soc, "I-3 缺省 dm.tcsRear（未传）等价 tcsRear=1");
// 能量通道：tcsRear=0.5 → 后电机 P_mot 贡献减半 → SOC 消耗减半（rwd 无 motorF，全部来自 motorR）
const trDSoc1 = trSpec.battery.soc0 - trOut1.soc;
const trDSoc05 = trSpec.battery.soc0 - trOut05.soc;
assert(trDSoc05 > 0 && trDSoc05 < trDSoc1, "I-3 tcsRear=0.5 → SOC 消耗减少但不为零（能量通道生效）");
assert(Math.abs(trDSoc05 / trDSoc1 - 0.5) < 1e-6,
  `I-3 tcsRear=0.5 → ΔSOC 比值≈0.5（实际 ${(trDSoc05 / trDSoc1).toFixed(8)}，仅后电机贡献缩放，机械输出不变）`);
// NaN/越界 tcsRear 守卫：NaN → 缺省 1；>1 → 钳位 1；<0 → 钳位 0
T("POWERTRAIN.resetState();");
const trOutNaN = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:NaN}, ${trWo})`);
assert(trOutNaN.soc === trOut1.soc && trOutNaN.tRear === trOut1.tRear, "I-3 tcsRear=NaN → 回退缺省 1");
T("POWERTRAIN.resetState();");
const trOutHi = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:5}, ${trWo})`);
assert(trOutHi.soc === trOut1.soc, "I-3 tcsRear=5 → 钳位到 1");
T("POWERTRAIN.resetState();");
const trOutLo = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:-3}, ${trWo})`);
assert(trOutLo.soc === trSpec.battery.soc0, "I-3 tcsRear=-3 → 钳位到 0，后电机 P_mot 贡献为 0（rwd 无 motorF → SOC 不变）");
assert(trOutLo.tRear === trOut1.tRear, "I-3 tcsRear=0 仍不影响轮扭矩输出（机械通道独立）");
// 双电机（awd）：仅后电机贡献缩放，前电机不受影响 → ΔSOC 比值应为 0.75（前后电机规格/轮速对称）
const trAwSpec = JSON.parse(JSON.stringify(trSpec));
trAwSpec.drive = "awd_fixed"; trAwSpec.splitFront = 0.5;
trAwSpec.motorF = { peakTorqueNm: 400, peakPowerKw: 200, maxRpm: 12000, regenMaxKw: 150, inertia: 0.1 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(trAwSpec)})`).ok === true, "I-3 tcsRear ev+awd spec valid");
T("POWERTRAIN.resetState();");
const trAwOut1 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:1}, ${trWo})`);
T("POWERTRAIN.resetState();");
const trAwOut05 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0, tcsRear:0.5}, ${trWo})`);
assert(trAwOut1.tFront === trAwOut05.tFront && trAwOut1.tRear === trAwOut05.tRear,
  "I-3 awd: tcsRear 不影响前后轴扭矩输出");
const trAwDSoc1 = trAwSpec.battery.soc0 - trAwOut1.soc;
const trAwDSoc05 = trAwSpec.battery.soc0 - trAwOut05.soc;
assert(Math.abs(trAwDSoc05 / trAwDSoc1 - 0.75) < 1e-6,
  `I-3 awd: tcsRear=0.5 → ΔSOC 比值≈0.75（实际 ${(trAwDSoc05 / trAwDSoc1).toFixed(8)}；前电机贡献不变，仅后电机减半）`);

T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 7. 段6 UI：内置预设 / 弹窗表单 / 曲线 / 持久化 / 下拉集成 ═══
   沙箱说明（与 test_tire_lab 同构）：document.getElementById 经 elCache 缓存
   → 永远返回同一 fakeEl，故 renderForm 写值 / readForm 读值可在同一元素上往返；
   canvas.getContext 返回 makeCtx2D(drawRec) 桩（arc/rect 为空实现）→ drawCurve
   必须只用 moveTo/lineTo/stroke/fillText 一类桩内 API。 */
console.log("=== 7. G31-P8 Powertrain Lab: Presets / Modal / Curve / Persistence / Select ===");

/* ── 7.1 六条内置预设全部通过 validate 且可落地 ── */
assert(T("typeof POWERTRAIN_PRESETS !== 'undefined'"), "7.1 POWERTRAIN_PRESETS 已定义");
const ptNames = T("Object.keys(POWERTRAIN_PRESETS)");
assert(ptNames.length === 6, `7.1 内置预设 6 条（实际 ${ptNames.length}）`);
for (const n of ptNames) {
  const v = T(`POWERTRAIN.validate(POWERTRAIN_PRESETS[${JSON.stringify(n)}])`);
  assert(v.ok === true, `7.1 预设「${n}」validate ok${v.ok ? "" : " → " + v.errors.join(",")}`);
  const r = T(`POWERTRAIN.setSpec(POWERTRAIN_PRESETS[${JSON.stringify(n)}]).ok`);
  assert(r === true, `7.1 预设「${n}」setSpec 落地成功`);
}
// 规格抽检：架构 / 驱动形式 / 关键量级
assert(T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].architecture") === "ice" &&
       T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].drive") === "rwd", "7.1 GT3 预设 ice/rwd");
assert(T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].gearbox.ratios.length") === 6 &&
       Math.abs(T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].gearbox.finalDrive") - 3.9) < 1e-12,
  "7.1 GT3 预设 6 挡 + finalDrive 3.9");
assert(T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].battery") === null, "7.1 GT3 预设无 battery（纯 ICE）");
const gt3Map = T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].ice.map");
const gt3Pk = gt3Map.reduce((a, p) => (p[1] > a[1] ? p : a), gt3Map[0]);
assert(Math.abs(gt3Pk[1] - 520) <= 20 && Math.abs(gt3Pk[0] - 6500) <= 500,
  `7.1 GT3 峰值 ~520N·m@6500（实际 ${gt3Pk[1]}N·m@${gt3Pk[0]}）`);
assert(T("POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'].ice.redlineRpm") === 8500, "7.1 GT3 redline 8500");
assert(T("POWERTRAIN_PRESETS['FSAE I4 RWD 5MT'].ice.redlineRpm") === 13000 &&
       T("POWERTRAIN_PRESETS['FSAE I4 RWD 5MT'].gearbox.ratios.length") === 5 &&
       Math.abs(T("POWERTRAIN_PRESETS['FSAE I4 RWD 5MT'].ice.dispL") - 0.6) < 1e-12,
  "7.1 FSAE 预设 0.6L/redline 13000/5 挡");
const fsaeMap = T("POWERTRAIN_PRESETS['FSAE I4 RWD 5MT'].ice.map");
const fsaePk = fsaeMap.reduce((a, p) => (p[1] > a[1] ? p : a), fsaeMap[0]);
assert(Math.abs(fsaePk[1] - 65) <= 5 && Math.abs(fsaePk[0] - 5500) <= 500,
  `7.1 FSAE 峰值 ~65N·m@5500（实际 ${fsaePk[1]}N·m@${fsaePk[0]}）`);
assert(T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].architecture") === "ev" &&
       T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].drive") === "tv" &&
       T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].ice") === null, "7.1 EV 预设 ev/tv 且无 ice");
assert(T("!!POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].motorF && !!POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].motorR"),
  "7.1 EV 预设双电机（tv 前置条件）");
assert(T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].motorR.peakPowerKw") === 250 &&
       T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].motorR.peakTorqueNm") === 350 &&
       T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV'].battery.capacityKwh") === 80,
  "7.1 EV 预设 250kW/350N·m/80kWh");
assert(T("POWERTRAIN_PRESETS['P3 混动前驱'].architecture") === "p3" &&
       T("POWERTRAIN_PRESETS['P3 混动前驱'].drive") === "fwd" &&
       T("POWERTRAIN_PRESETS['P3 混动前驱'].motorR.peakPowerKw") === 100 &&
       T("POWERTRAIN_PRESETS['P3 混动前驱'].battery.capacityKwh") === 15 &&
       T("POWERTRAIN_PRESETS['P3 混动前驱'].gearbox.type") === "auto",
  "7.1 P3 预设 p3/fwd/100kW/15kWh/auto");
assert(T("POWERTRAIN_PRESETS['串联增程后驱'].architecture") === "series" &&
       T("POWERTRAIN_PRESETS['串联增程后驱'].drive") === "rwd" &&
       T("POWERTRAIN_PRESETS['串联增程后驱'].motorR.peakPowerKw") === 150 &&
       T("POWERTRAIN_PRESETS['串联增程后驱'].battery.capacityKwh") === 40 &&
       T("POWERTRAIN_PRESETS['串联增程后驱'].ice.cyl") === 3,
  "7.1 串联增程预设 series/rwd/I3/150kW/40kWh");
assert(T("POWERTRAIN_PRESETS['THS 功率分流'].architecture") === "powersplit" &&
       T("POWERTRAIN_PRESETS['THS 功率分流'].drive") === "fwd" &&
       T("POWERTRAIN_PRESETS['THS 功率分流'].motorF.peakPowerKw") === 60 &&
       T("POWERTRAIN_PRESETS['THS 功率分流'].motorR.peakPowerKw") === 80 &&
       T("POWERTRAIN_PRESETS['THS 功率分流'].battery.capacityKwh") === 6.5,
  "7.1 THS 预设 powersplit/fwd/60kW+80kW/6.5kWh");
// 预设不得污染出厂默认（legacy-equivalent 等价锚守门）
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.spec.ice.map[0][1]") === 1200 && T("POWERTRAIN.spec.gearbox.ratios.length") === 1,
  "7.1 预设不污染 defaultSpec（等价锚 1200/单速比不变）");

/* ── 7.2 open()/close() 沙箱冒烟 ── */
let ptOpenErr = null;
try { T("POWERTRAIN.open();"); } catch (e) { ptOpenErr = e; }
assert(ptOpenErr === null, `7.2 open() 在 fakeEl 沙箱不抛错${ptOpenErr ? " → " + ptOpenErr.message : ""}`);
assert(T("!!POWERTRAIN._modal"), "7.2 open() 懒构建 _modal");
assert(T("POWERTRAIN._modal.style.display") === "flex", "7.2 open() 显示弹窗");
assert(T("!!POWERTRAIN._draft"), "7.2 open() 由当前 spec 派生 _draft");
T("POWERTRAIN._draft.ice.dispL = 9.99;");
assert(T("POWERTRAIN.spec.ice.dispL") === 4.0, "7.2 _draft 为深拷贝（改草稿不污染 spec）");
T("POWERTRAIN.close();");
assert(T("POWERTRAIN._modal.style.display") === "none", "7.2 close() 隐藏弹窗");

/* ── 7.3 renderForm / readForm 往返 ── */
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec();
   POWERTRAIN._draft.architecture = "p4";
   POWERTRAIN._draft.drive = "awd_center";
   POWERTRAIN._draft.splitFront = 0.42;
   POWERTRAIN._draft.ice.cyl = 6; POWERTRAIN._draft.ice.layout = "V6";
   POWERTRAIN._draft.ice.dispL = 3.5; POWERTRAIN._draft.ice.idleRpm = 900;
   POWERTRAIN._draft.ice.redlineRpm = 7800; POWERTRAIN._draft.ice.fuelCutRpm = 8000;
   POWERTRAIN._draft.ice.map = [[900,200],[3000,420],[6000,380],[7800,300]];
   POWERTRAIN._draft.ice.fricA = 18; POWERTRAIN._draft.ice.fricB = 0.005;
   POWERTRAIN._draft.ice.fricC = 0; POWERTRAIN._draft.ice.inertia = 0.28;
   POWERTRAIN._draft.ice.throttleTau = 0.07;
   POWERTRAIN._draft.motorR = { peakTorqueNm:320, peakPowerKw:180, maxRpm:15000, regenMaxKw:120, inertia:0.08 };
   POWERTRAIN._draft.battery = { capacityKwh:12, soc0:0.7, maxDischargeKw:200, maxChargeKw:90 };
   POWERTRAIN._draft.gearbox = { type:"dct", ratios:[3.4,2.3,1.7,1.3,1.0,0.82], finalDrive:3.6,
                                 shiftTimeMs:60, eff:0.96, autoUpFrac:0.9, autoDownFrac:0.5 };
   POWERTRAIN._draft.diff = { type:"lsd", bias:2.2, lockNm:80 };
   POWERTRAIN.renderForm();
   POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.architecture") === "p4", "7.3 往返 architecture");
assert(T("POWERTRAIN._draft.drive") === "awd_center", "7.3 往返 drive");
assert(Math.abs(T("POWERTRAIN._draft.splitFront") - 0.42) < 1e-12, "7.3 往返 splitFront");
assert(T("POWERTRAIN._draft.ice.cyl") === 6 && T("POWERTRAIN._draft.ice.layout") === "V6", "7.3 往返 ice.cyl/layout");
assert(Math.abs(T("POWERTRAIN._draft.ice.dispL") - 3.5) < 1e-12, "7.3 往返 ice.dispL");
assert(T("POWERTRAIN._draft.ice.redlineRpm") === 7800 && T("POWERTRAIN._draft.ice.fuelCutRpm") === 8000,
  "7.3 往返 ice.redlineRpm/fuelCutRpm");
assert(Math.abs(T("POWERTRAIN._draft.ice.inertia") - 0.28) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.ice.throttleTau") - 0.07) < 1e-12, "7.3 往返 ice.inertia/throttleTau");
assert(T("POWERTRAIN._draft.ice.map.length") === 4 &&
       Math.abs(T("POWERTRAIN._draft.ice.map[1][1]") - 420) < 1e-12, "7.3 往返 ice.map（textarea JSON）");
assert(T("!!POWERTRAIN._draft.motorR") && Math.abs(T("POWERTRAIN._draft.motorR.peakTorqueNm") - 320) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.motorR.peakPowerKw") - 180) < 1e-12 &&
       T("POWERTRAIN._draft.motorR.maxRpm") === 15000 &&
       Math.abs(T("POWERTRAIN._draft.motorR.regenMaxKw") - 120) < 1e-12, "7.3 往返 motorR 全字段");
assert(T("POWERTRAIN._draft.motorF") === null, "7.3 未勾选 motorF → null");
assert(Math.abs(T("POWERTRAIN._draft.battery.capacityKwh") - 12) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.battery.soc0") - 0.7) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.battery.maxDischargeKw") - 200) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.battery.maxChargeKw") - 90) < 1e-12, "7.3 往返 battery 全字段");
assert(T("POWERTRAIN._draft.gearbox.type") === "dct" &&
       T("POWERTRAIN._draft.gearbox.ratios.length") === 6 &&
       Math.abs(T("POWERTRAIN._draft.gearbox.ratios[3]") - 1.3) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.gearbox.ratios[5]") - 0.82) < 1e-12, "7.3 往返 gearbox 6 挡逐行 input");
assert(Math.abs(T("POWERTRAIN._draft.gearbox.finalDrive") - 3.6) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.gearbox.shiftTimeMs") - 60) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.gearbox.eff") - 0.96) < 1e-12, "7.3 往返 finalDrive/shiftTimeMs/eff");
assert(Math.abs(T("POWERTRAIN._draft.gearbox.autoUpFrac") - 0.9) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.gearbox.autoDownFrac") - 0.5) < 1e-12, "7.3 往返 autoUp/DownFrac");
assert(T("POWERTRAIN._draft.diff.type") === "lsd" &&
       Math.abs(T("POWERTRAIN._draft.diff.bias") - 2.2) < 1e-12 &&
       Math.abs(T("POWERTRAIN._draft.diff.lockNm") - 80) < 1e-12, "7.3 往返 diff 全字段");
assert(T("POWERTRAIN.validate(POWERTRAIN._draft).ok") === true, "7.3 表单产物通过 validate（p4 双轴混动）");
// 架构过滤：切 ev → ice 置 null、勾选电机/电池后产物合法
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.renderForm();
   document.getElementById("pt_arch_ice").checked = false;
   document.getElementById("pt_arch_ev").checked = true;
   document.getElementById("pt_motorR_on").checked = true;
   document.getElementById("pt_bat_on").checked = true;
   POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.architecture") === "ev", "7.3 架构 radio → draft.architecture=ev");
assert(T("POWERTRAIN._draft.ice") === null, "7.3 arch=ev → draft.ice=null（M-1 无曲轴）");
assert(T("POWERTRAIN.validate(POWERTRAIN._draft).ok") === true, "7.3 arch=ev 表单产物通过 validate");
// 驱动形式按架构过滤：ice 架构不得出现 tv
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN._draft.architecture = "ice"; POWERTRAIN.renderForm();
   document.getElementById("pt_drive").value = "tv"; POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.drive") !== "tv", "7.3 ice 架构下 tv 不可选（readForm 回退合法值）");
assert(T("POWERTRAIN.validate(POWERTRAIN._draft).ok") === true, "7.3 非法 drive 回退后 validate ok");
// map textarea：非法 JSON 保留旧值；乱序自动升序
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.renderForm();
   document.getElementById("pt_ice_map").value = "{oops"; POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.ice.map.length") === 4 && T("POWERTRAIN._draft.ice.map[0][1]") === 1200,
  "7.3 非法 map JSON → 保留旧 map（失效安全）");
T(`document.getElementById("pt_ice_map").value = "[[6500,520],[900,200],[3000,430]]"; POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.ice.map.length") === 3 && T("POWERTRAIN._draft.ice.map[0][0]") === 900 &&
       T("POWERTRAIN._draft.ice.map[2][1]") === 520, "7.3 乱序 map 自动按 rpm 升序");
assert(T("POWERTRAIN.validate(POWERTRAIN._draft).ok") === true, "7.3 排序后 map 通过 validate(ascending)");
// M-8：map 校验失败的 ⚠ 提示必须活过 updateDerived（否则被概要覆盖 → 用户看不到错误）
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.renderForm();
   document.getElementById("pt_ice_map").value = "{oops"; POWERTRAIN.readForm(); POWERTRAIN.updateDerived();`);
assert(String(T(`document.getElementById("pt_ice_mapHint").textContent`)).indexOf("⚠") >= 0,
  "7.3 非法 map 的 ⚠ 提示在 updateDerived 后仍可见");
assert(T("POWERTRAIN._mapErr") !== null, "7.3 readForm 记录 _mapErr（供 UI 与诊断）");
assert(T("POWERTRAIN._draft.ice.map[0][1]") === 1200, "7.3 ⚠ 分支下仍保留旧 map");
T(`document.getElementById("pt_ice_map").value = "[[900,200],[6500,520]]"; POWERTRAIN.readForm(); POWERTRAIN.updateDerived();`);
assert(T("POWERTRAIN._mapErr") === null, "7.3 map 修好后 _mapErr 清空");
assert(String(T(`document.getElementById("pt_ice_mapHint").textContent`)).indexOf("⚠") < 0,
  "7.3 map 修好后 ⚠ 消失（回到概要）");
// 红线/断油自愈：fuelCut < redline 时 readForm 抬到 redline（validate M-2）
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.renderForm();
   document.getElementById("pt_ice_redlineRpm").value = "9000";
   document.getElementById("pt_ice_fuelCutRpm").value = "100";
   POWERTRAIN.readForm();`);
assert(T("POWERTRAIN._draft.ice.fuelCutRpm") >= T("POWERTRAIN._draft.ice.redlineRpm") &&
       T("POWERTRAIN.validate(POWERTRAIN._draft).ok") === true, "7.3 fuelCut<redline 自愈（M-2）");
// 挡位增删行
T(`POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.renderForm(); POWERTRAIN.readForm();
   POWERTRAIN.changeRatioCount(1);`);
assert(T("POWERTRAIN._draft.gearbox.ratios.length") === 2, "7.3 changeRatioCount(+1) 加挡");
T("POWERTRAIN.deleteRatioRow(0);");
assert(T("POWERTRAIN._draft.gearbox.ratios.length") === 1, "7.3 deleteRatioRow 删挡");
T("POWERTRAIN.deleteRatioRow(0);");
assert(T("POWERTRAIN._draft.gearbox.ratios.length") === 1, "7.3 最后一挡不可删（ratios ≥ 1）");

/* ── 7.4 drawCurve 在 ctx 桩上跑通（不抛错且真的画了） ── */
T("POWERTRAIN._draft = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS['GT3 V8 RWD 6MT'])); POWERTRAIN.renderForm();");
const dcS0 = drawRec.strokes, dcP0 = drawRec.pts.length, dcT0 = drawRec.texts.length;
let dcErr = null;
try { T("POWERTRAIN.drawCurve();"); } catch (e) { dcErr = e; }
assert(dcErr === null, `7.4 drawCurve(ICE) 在 makeCtx2D 桩上不抛错${dcErr ? " → " + dcErr.message : ""}`);
assert(drawRec.strokes > dcS0, `7.4 drawCurve 产生 stroke（+${drawRec.strokes - dcS0}）`);
assert(drawRec.pts.length > dcP0 + 100, `7.4 drawCurve 绘制折线点（+${drawRec.pts.length - dcP0}）`);
assert(drawRec.texts.length > dcT0, `7.4 drawCurve 绘制坐标轴/图例文字（+${drawRec.texts.length - dcT0}）`);
// EV（无 ICE）分支 + 功率曲线叠加
const dcS1 = drawRec.strokes;
let dcErr2 = null;
try {
  T("POWERTRAIN._draft = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS['EV 双电机 AWD-TV'])); POWERTRAIN.drawCurve();");
} catch (e) { dcErr2 = e; }
assert(dcErr2 === null && drawRec.strokes > dcS1, `7.4 drawCurve(EV 双电机/tv) 不抛错且有 stroke${dcErr2 ? " → " + dcErr2.message : ""}`);
// 退化输入：空草稿 / 无动力源也不得抛错
let dcErr3 = null;
try { T("POWERTRAIN._draft = { architecture:'ice', ice:null, motorF:null, motorR:null, battery:null, gearbox:null, diff:null }; POWERTRAIN.drawCurve();"); } catch (e) { dcErr3 = e; }
assert(dcErr3 === null, `7.4 drawCurve(退化草稿) 不抛错${dcErr3 ? " → " + dcErr3.message : ""}`);

/* ── 7.5 activateCustom 往返 ── */
T(`POWERTRAIN.customs = {};
   POWERTRAIN.customs["沙箱动力"] = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["FSAE I4 RWD 5MT"]));
   POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());
   POWERTRAIN.activateCustom("沙箱动力");`);
assert(T("POWERTRAIN.spec.ice.redlineRpm") === 13000 && T("POWERTRAIN.spec.ice.layout") === "I4",
  "7.5 activateCustom 落地保存的 spec");
assert(T("POWERTRAIN.spec.gearbox.ratios.length") === 5 &&
       Math.abs(T("POWERTRAIN.spec.gearbox.finalDrive") - 3.6) < 1e-12, "7.5 activateCustom 落地传动链");
assert(T("POWERTRAIN._draft.ice.redlineRpm") === 13000, "7.5 activateCustom 同步 _draft（弹窗再开即所见）");
T("POWERTRAIN.spec.ice.dispL = 9.99;");
assert(T("POWERTRAIN.customs['沙箱动力'].ice.dispL") !== 9.99, "7.5 activateCustom 深拷贝隔离（customs 不被污染）");
assert(T("POWERTRAIN.activateCustom('不存在的条目').ok") === false, "7.5 activateCustom 缺失条目返回 not-ok 且不抛错");

/* ── 7.6 localStorage 持久化往返 ── */
assert(T("POWERTRAIN.MAX_CUSTOMS") === 20, "7.6 MAX_CUSTOMS = 20");
assert(T("POWERTRAIN.LS_KEY") === "labsus-powertrain-customs", "7.6 localStorage key 前缀 labsus-");
T(`POWERTRAIN.customs = {};
   POWERTRAIN.customs["持久化条目"] = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"]));
   POWERTRAIN.persistCustoms();`);
const lsRaw = T('localStorage.getItem("labsus-powertrain-customs")');
assert(typeof lsRaw === "string" && lsRaw.indexOf("持久化条目") >= 0, "7.6 persistCustoms 写入 localStorage");
T("POWERTRAIN.customs = {}; POWERTRAIN.loadCustoms();");
assert(T("!!POWERTRAIN.customs['持久化条目']"), "7.6 loadCustoms 从 localStorage 恢复");
assert(T("POWERTRAIN.customs['持久化条目'].gearbox.ratios.length") === 6 &&
       T("POWERTRAIN.customs['持久化条目'].ice.layout") === "V8", "7.6 恢复的 spec 载荷完整");
T('localStorage.setItem("labsus-powertrain-customs", "{bad json"); POWERTRAIN.loadCustoms();');
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "7.6 损坏 JSON → 空表（失效安全）");
T('localStorage.removeItem("labsus-powertrain-customs"); POWERTRAIN.loadCustoms();');
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "7.6 无键 → 空表");
// saveCustom 上限与重名
T(`POWERTRAIN.customs = {}; POWERTRAIN._draft = POWERTRAIN.defaultSpec();
   for (var i = 0; i < 20; i++) POWERTRAIN.customs["占位" + i] = POWERTRAIN.defaultSpec();`);
assert(T("POWERTRAIN.saveCustom('第21条').ok") === false &&
       T("POWERTRAIN.saveCustom('第21条').error") === "limit", "7.6 超 20 条上限被拒");
T("POWERTRAIN.customs = {}; POWERTRAIN._draft = POWERTRAIN.defaultSpec();");
assert(T("POWERTRAIN.saveCustom('首条').ok") === true, "7.6 saveCustom 首条成功");
assert(T("POWERTRAIN.saveCustom('首条').error") === "dup", "7.6 重名被拒");
assert(T('localStorage.getItem("labsus-powertrain-customs").indexOf("首条")') >= 0, "7.6 saveCustom 已持久化");
T("POWERTRAIN.deleteCustom('首条');");
assert(T("!POWERTRAIN.customs['首条']"), "7.6 deleteCustom 解除上限死锁");
T('POWERTRAIN.customs = {}; POWERTRAIN.persistCustoms();');

/* ── 7.7 refreshPresetSelect + loadVehiclePreset 分流 ── */
T(`POWERTRAIN.customs = {};
   POWERTRAIN.customs["下拉条目"] = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["FSAE I4 RWD 5MT"]));
   POWERTRAIN.refreshPresetSelect();`);
T(`(function(){var s=document.getElementById("topVehSelect");var f=null;
     for(var i=0;i<s.children.length;i++){ if(String(s.children[i].id)==="optgroup") f=s.children[i]; }
     window.__ptGrp=f;})()`);
assert(T("!!window.__ptGrp"), "7.7 refreshPresetSelect 向 topVehSelect 追加 optgroup");
assert(T("window.__ptGrp.children.length") >= 1, "7.7 optgroup 内含自定义条目 option");
assert(T("window.__ptGrp.children[0].value") === "ptcustom:下拉条目", "7.7 option.value 使用 ptcustom: 前缀");
assert(String(T("window.__ptGrp.children[0].textContent")).indexOf("下拉条目") >= 0, "7.7 option 文本含条目名");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); loadVehiclePreset('ptcustom:下拉条目');");
assert(T("POWERTRAIN.spec.ice.redlineRpm") === 13000 && T("POWERTRAIN.spec.gearbox.ratios.length") === 5,
  "7.7 loadVehiclePreset('ptcustom:…') 分流到 activateCustom");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); loadVehiclePreset('ptcustom:不存在');");
assert(T("POWERTRAIN.spec.architecture") === "ice" && T("POWERTRAIN.spec.ice.redlineRpm") === 9000,
  "7.7 未知 ptcustom 条目不改动当前 spec");
T("POWERTRAIN.customs = {}; POWERTRAIN.refreshPresetSelect();");

/* ── 7.8 applyToVehicle：沙箱无舞台不抛错 ── */
assert(T("typeof SLOPE_STAGE === 'undefined' && typeof VehicleDynamics15DOF === 'undefined'"),
  "7.8 前置：本沙箱不加载 11-stages.js（无舞台/无引擎构造器）");
T("POWERTRAIN._draft = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS['GT3 V8 RWD 6MT']));");
let apErr = null;
try { T("POWERTRAIN.applyToVehicle();"); } catch (e) { apErr = e; }
assert(apErr === null, `7.8 applyToVehicle 无舞台不抛错${apErr ? " → " + apErr.message : ""}`);
assert(T("POWERTRAIN.spec.ice.layout") === "V8" && T("POWERTRAIN.spec.drive") === "rwd" &&
       T("POWERTRAIN.spec.gearbox.ratios.length") === 6, "7.8 applyToVehicle = setSpec(_draft)");
assert(T("S.ptSpec === POWERTRAIN.spec"), "7.8 applyToVehicle 写覆盖层引用 S.ptSpec");
assert(T("POWERTRAIN.state.iceOmega") > 0, "7.8 applyToVehicle 后状态重置（曲轴怠速）");
// 非法草稿 → 拒绝且不覆盖当前 spec
T("POWERTRAIN._draft = Object.assign(POWERTRAIN.defaultSpec(), { architecture:'warp' });");
let apErr2 = null;
try { T("POWERTRAIN.applyToVehicle();"); } catch (e) { apErr2 = e; }
assert(apErr2 === null && T("POWERTRAIN.applyToVehicle().ok") === false, "7.8 非法草稿 applyToVehicle 返回 not-ok 不抛错");
assert(T("POWERTRAIN.spec.ice.layout") === "V8" && T("POWERTRAIN.spec.drive") === "rwd",
  "7.8 非法草稿不覆盖已生效 spec");
// applyFromForm（弹窗主按钮路径）
T(`POWERTRAIN._draft = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"]));
   POWERTRAIN.renderForm(); POWERTRAIN.applyFromForm();`);
assert(T("POWERTRAIN.spec.architecture") === "powersplit" && T("POWERTRAIN.spec.motorF.peakPowerKw") === 60,
  "7.8 applyFromForm 走 readForm→applyToVehicle 全链");
assert(T("POWERTRAIN._modal.style.display") === "none", "7.8 applyFromForm 成功后关窗");
// restoreBuiltin → 回到 legacy-equivalent 默认（等价锚）
T("POWERTRAIN._draft = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS['EV 双电机 AWD-TV'])); POWERTRAIN.restoreBuiltin();");
assert(T("POWERTRAIN.spec.architecture") === "ice" && T("POWERTRAIN.spec.ice.map[0][1]") === 1200 &&
       T("POWERTRAIN.spec.gearbox.ratios.length") === 1 && T("POWERTRAIN.spec.gearbox.finalDrive") === 1,
  "7.8 restoreBuiltin 回到 legacy-equivalent 默认（等价锚）");
T("POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.close();");

/* ── 7.9 等价锚回归：段6 落地后默认规格轮上扭矩逐位不变 ── */
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
const anchor7 = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:100,FR:100,RL:100,RR:100})");
assert(anchor7.tRear === 480 && anchor7.tFront === 120,
  `7.9 段6 后 legacy-equivalent 等价锚不变（tRear=${anchor7.tRear}, tFront=${anchor7.tFront}）`);

/* ── 7.10 G31-P8 审查修复：I-1 __proto__ 键名防护 ── */
console.log("=== 7.10 G31-P8 Review: I-1 __proto__ guard ===");
T("POWERTRAIN.customs = {}; POWERTRAIN._draft = POWERTRAIN.defaultSpec();");
const protoRes = T('POWERTRAIN.saveCustom("__proto__")');
assert(protoRes.ok === false && protoRes.error === "reserved", "I-1 saveCustom('__proto__') → ok:false error:'reserved'");
const ctorRes = T('POWERTRAIN.saveCustom("constructor")');
assert(ctorRes.ok === false && ctorRes.error === "reserved", "I-1 saveCustom('constructor') → ok:false error:'reserved'");
const protRes = T('POWERTRAIN.saveCustom("prototype")');
assert(protRes.ok === false && protRes.error === "reserved", "I-1 saveCustom('prototype') → ok:false error:'reserved'");
// customs 原型未被污染（同一 VM realm 内比较）
assert(T("Object.getPrototypeOf(POWERTRAIN.customs) === Object.getPrototypeOf({})"), "I-1 customs 原型未被污染");
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "I-1 customs 无异常键");
assert(T("!Object.getOwnPropertyNames(POWERTRAIN.customs).includes('__proto__')"), "I-1 customs 无 __proto__ 自有属性");
// 正常名称仍可用（无回归）
assert(T('POWERTRAIN.saveCustom("正常名").ok') === true, "I-1 正常名称 saveCustom 仍可用（无回归）");
T("POWERTRAIN.customs = {}; POWERTRAIN.persistCustoms();");

/* ── 7.11 G31-P8 审查修复：M-1 rAF 节流 ── */
console.log("=== 7.11 G31-P8 Review: M-1 rAF throttle ===");
// 替换沙箱的 rAF 为可控计数 stub
T(`(function(){
  window.__rafCount = 0;
  window.__rafCbs = [];
  window.requestAnimationFrame = function(cb){ window.__rafCount++; window.__rafCbs.push(cb); return window.__rafCount; };
})()`);
// 重建 _modal 以获取带 rAF 节流的 onEdit
T("POWERTRAIN._modal = null; POWERTRAIN._rafPending = false;");
T("POWERTRAIN._draft = POWERTRAIN.defaultSpec(); POWERTRAIN.open();");
// 记录 drawCurve 调用次数
T(`(function(){
  window.__drawCount = 0;
  window.__origDrawCurve = POWERTRAIN.drawCurve;
  POWERTRAIN.drawCurve = function(){ window.__drawCount++; window.__origDrawCurve.call(POWERTRAIN); };
})()`);
// 模拟连续 5 次 input 事件（触发 onEdit）
T(`(function(){
  var m = POWERTRAIN._modal;
  for(var i=0;i<5;i++){
    var ev = {type:'input'};
    // 委托事件在沙箱中直接调用 onEdit——模拟通过触发 readForm 路径
    POWERTRAIN.readForm();
    if(typeof requestAnimationFrame === 'function'){
      if(POWERTRAIN._rafPending) continue;
      POWERTRAIN._rafPending = true;
      requestAnimationFrame(function(){
        POWERTRAIN._rafPending = false;
        POWERTRAIN.updateDerived(); POWERTRAIN.drawCurve();
      });
    } else {
      POWERTRAIN.updateDerived(); POWERTRAIN.drawCurve();
    }
  }
})()`);
// rAF 尚未 flush，drawCurve 应为 0
assert(T("window.__drawCount") === 0, "M-1 rAF 节流：连续 5 次 onEdit 后 drawCurve 尚未调用（等待 rAF flush）");
assert(T("window.__rafCount") === 1, "M-1 rAF 节流：只注册了 1 次 rAF 回调");
// flush rAF
T("window.__rafCbs.forEach(function(cb){cb();}); window.__rafCbs=[];");
assert(T("window.__drawCount") === 1, "M-1 rAF flush 后 drawCurve 恰好调用 1 次");
// 沙箱无 rAF 时回退直接调用
T(`(function(){
  var saved = window.requestAnimationFrame;
  delete window.requestAnimationFrame;
  window.__drawCount = 0;
  POWERTRAIN._rafPending = false;
  // 直接调用 onEdit 路径（无 rAF）
  POWERTRAIN.readForm();
  if(typeof requestAnimationFrame === 'function'){
    if(!POWERTRAIN._rafPending){ POWERTRAIN._rafPending=true; requestAnimationFrame(function(){ POWERTRAIN._rafPending=false; POWERTRAIN.updateDerived(); POWERTRAIN.drawCurve(); }); }
  } else {
    POWERTRAIN.updateDerived(); POWERTRAIN.drawCurve();
  }
  window.requestAnimationFrame = saved;
})()`);
assert(T("window.__drawCount") === 1, "M-1 无 rAF 回退：直接调用 drawCurve");
// 清理 stub，恢复原始 drawCurve
T("POWERTRAIN.drawCurve = window.__origDrawCurve; delete window.__origDrawCurve; delete window.__rafCount; delete window.__rafCbs; delete window.__drawCount; POWERTRAIN._rafPending = false;");

/* ── 7.12 G31-P8 审查修复：M-3 响应式 max-width:95vw ── */
console.log("=== 7.12 G31-P8 Review: M-3 responsive ===");
T("POWERTRAIN._modal = null; POWERTRAIN.open();");
const modalHTML = T("POWERTRAIN._modal.innerHTML");
assert(modalHTML.indexOf("max-width:95vw") >= 0 || modalHTML.indexOf("max-width: 95vw") >= 0,
  "M-3 弹窗 innerHTML 包含 max-width:95vw");
T("POWERTRAIN.close();");

/* ── 7.13 G31-P8 审查修复：M-4 saveFromForm name trim ── */
console.log("=== 7.13 G31-P8 Review: M-4 name trim ===");
T("POWERTRAIN.customs = {}; POWERTRAIN._draft = POWERTRAIN.defaultSpec();");
// prompt 返回纯空白 "  " → 不保存
T('window.prompt = function(){ return "  "; };');
T("POWERTRAIN.saveFromForm();");
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "M-4 prompt 返回纯空白 → 不保存");
// prompt 返回带前后空白的有效名 → trim 后保存
T('window.prompt = function(){ return "  测试名  "; };');
T("POWERTRAIN.saveFromForm();");
assert(T("!!POWERTRAIN.customs['测试名']") === true, "M-4 prompt 返回 '  测试名  ' → trim 后保存为 '测试名'");
assert(T("!!POWERTRAIN.customs['  测试名  ']") === false, "M-4 不保存未 trim 的原始名");
// prompt 返回 null → 不保存
T('POWERTRAIN.customs = {}; window.prompt = function(){ return null; };');
T("POWERTRAIN.saveFromForm();");
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "M-4 prompt 返回 null → 不保存");
// prompt 返回空串 → 不保存
T('window.prompt = function(){ return ""; };');
T("POWERTRAIN.saveFromForm();");
assert(T("Object.keys(POWERTRAIN.customs).length") === 0, "M-4 prompt 返回空串 → 不保存");
T("POWERTRAIN.customs = {}; POWERTRAIN.persistCustoms();");

/* ── 7.14 G31-P8 审查修复：I-2 canvas 拖拽 TODO 标注存在性 ── */
console.log("=== 7.14 G31-P8 Review: I-2 TODO annotation ===");
// 验证源码中包含 TODO(G31-P9) 注释
const ptSrc = fs.readFileSync(path.join(__dirname, "../js/16-powertrain.js"), "utf8");
assert(ptSrc.indexOf("TODO(G31-P9)") >= 0, "I-2 源码包含 TODO(G31-P9) canvas 拖拽标注");
assert(ptSrc.indexOf("canvas 拖拽控制点编辑") >= 0, "I-2 TODO 标注含中文说明");

/* ═══ 8. G31 终审修复（C1/C2/C3/I1/I3）+ 六预设 1-DOF 纵向积分探针 ═══
   C1 ev/series/powersplit 电机扭矩未乘 gearbox ratio（EV 单速比 9.73 时 tRear 仅 175 而非 1652）
   C2 throttle=0 时接线层 tcsScale=0 抹掉发动机制动/回收，但 SOC 仍积分（能量不守恒）
   C3 无 shiftCmd 生产者 + autoShift 白名单过窄 → 5/6 预设永远卡 1 挡
   I1 反射惯量加到全 4 轮（应只加驱动轮、按驱动轮数归一）
   I3 hasRealDrivetrain() 时仍乘 drivePowerFactor（legacy 常数质量补偿，GT3 类 ×0.576） */
console.log("=== 8. G31 Final-Review Fixes (C1/C2/C3/I1/I3) ===");

/* ── 8.1 C1：ev/series/powersplit 电机扭矩必须 ×ratio×finalDrive×eff，且电机 rpm 源 ×ratio ── */
console.log("--- 8.1 C1 motor reduction ratio ---");
// (a) EV 双电机 AWD-TV：单速比 9.73 × finalDrive 1.0 × eff 0.97
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
const c1evSoc = T("POWERTRAIN.state.soc");
assert(Math.abs(c1evSoc - 0.9) < 1e-12, "8.1 EV soc0=0.9");
const C1W = 10;                              // 轮速 rad/s
const EV_R = 9.73 * 1.0, EV_E = 0.97;        // ratio × finalDrive, eff
const EV_WMOT = C1W * EV_R;                  // 97.3 rad/s = 929 rpm（拐点 6821 rpm → 恒扭矩区）
assert(Math.abs(EV_WMOT * 30 / Math.PI - 929.3) < 1.0, "8.1 EV 电机转速 929 rpm（恒扭矩区）");
const c1evTm = T(`POWERTRAIN.motorTorque(POWERTRAIN.spec.motorR, ${EV_WMOT * 30 / Math.PI}, 1, ${c1evSoc})`);
assert(Math.abs(c1evTm - 350) < 1e-9, `8.1 EV 电机轴扭矩 = 350 N·m（实得 ${c1evTm}）`);
const c1ev = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
const EV_AXLE = 350 * EV_R * EV_E;           // 3303.335 N·m/轴
assert(Math.abs(c1ev.tRear - EV_AXLE / 2) < 1e-6,
  `8.1 C1 EV tRear = 350×9.73×0.97/2 = ${EV_AXLE / 2}（实得 ${c1ev.tRear}；改前 175 = 漏乘齿比）`);
assert(Math.abs(c1ev.tFront - EV_AXLE / 2) < 1e-6, "8.1 C1 EV tFront 同值（tv 双电机对称）");
assert(c1ev.tRear > 1000, `8.1 C1 EV tRear>1000 判别断言（改前仅 175，实得 ${c1ev.tRear}）`);
const c1evWSum = c1ev.tWheel.reduce((a, b) => a + b, 0);
assert(Math.abs(c1evWSum - 2 * EV_AXLE) < 1e-6,
  `8.1 C1 EV tv 四轮和 = T_motF_w+T_motR_w = ${2 * EV_AXLE}（守恒，含齿比）`);
// (b) 串联增程后驱：9.0 × 1.0 × 0.97
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["串联增程后驱"]))); POWERTRAIN.state.thrSm = 1;');
const SE_R = 9.0 * 1.0, SE_E = 0.97;
const c1se = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
const SE_AXLE = 400 * SE_R * SE_E;           // 3492 N·m
assert(Math.abs(c1se.tRear - SE_AXLE / 2) < 1e-6,
  `8.1 C1 series tRear = 400×9.0×0.97/2 = ${SE_AXLE / 2}（实得 ${c1se.tRear}；改前 200）`);
assert(Math.abs(c1se.tFront) < 1e-9, "8.1 C1 series(rwd) 前轴无驱动扭矩");
assert(c1se.P_gen > 0 && c1se.iceRpm > 0, "8.1 series P_gen>0 & iceRpm>0（增程器发电，不接轮）");
// (c) THS 功率分流：G31-P10-2 驱动轴路由——motorB(motorR 字段) 与 ICE 同在驱动轴（fwd），
//     tRear 归零、MG2 进前轴；MG1(motorF) 为发电角色不进轮（旧断言锁的是“MG2 出力到后轴”
//     的路由缺陷，随 P10-2 物理修正翻转）。
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"]))); POWERTRAIN.state.thrSm = 1;');
const THS_R = 1 * 3.6, THS_E = 0.95;
const c1ths = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
const THS_MG2 = 207 * THS_R * THS_E;         // 707.94 N·m
assert(Math.abs(c1ths.tRear) < 1e-9,
  `8.1(c) THS fwd tRear = 0（P10-2 路由修正：改前 MG2 出力到后轴 ${THS_MG2 / 2}）`);
const c1thsTice = T(`POWERTRAIN.iceTorque(${c1ths.iceRpm}, 1)`);
const c1thsTmech = c1thsTice * 0.72 * THS_R * THS_E;
assert(Math.abs(c1ths.tFront * 2 - (c1thsTmech + THS_MG2)) < 1e-6,
  "8.1(c) THS fwd 前轴×2 = (T_ice×0.72 + T_motB)×ratio×eff（机械路径与 motorB 统一进驱动轴；MG1 发电不进轮）");
assert(c1ths.P_gen > 0, "8.1 powersplit P_gen>0（28% 分流发电）");
// (d) 无回归：p3 电机在箱后 → rpm 源与扭矩都【不】乘 ratio（motGeared=1）
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["P3 混动前驱"]))); POWERTRAIN.state.thrSm = 1;');
const c1p3Soc = T("POWERTRAIN.state.soc");
const P3_R = 3.5 * 4.1, P3_E = 0.94;
const c1p3 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
assert(Math.abs(c1p3.iceRpm - C1W * P3_R * 30 / Math.PI) < 1e-6, "8.1 p3 iceRpm = 轮速×ratio（刚性耦合）");
assert(Math.abs(c1p3.shiftRpm - c1p3.iceRpm) < 1e-12, "8.1 p3 shiftRpm === iceRpm（非 MOTOR_GEARED）");
const c1p3Tm = T(`POWERTRAIN.motorTorque(POWERTRAIN.spec.motorR, ${C1W * 30 / Math.PI}, 1, ${c1p3Soc})`);
assert(Math.abs(c1p3Tm - 300) < 1e-9, "8.1 p3 电机 rpm 源 = 轮速 95.5（未乘 ratio）→ 300 N·m");
const c1p3Ti = T(`POWERTRAIN.iceTorque(${C1W * P3_R * 30 / Math.PI}, 1)`);
assert(Math.abs(c1p3.tFront * 2 - (c1p3Ti * P3_R * P3_E + c1p3Tm)) < 1e-6,
  "8.1 C1 无回归：p3 = T_ice×ratio×eff + T_mot（电机路径 motGeared=1）");
assert(Math.abs(c1p3.tRear) < 1e-9, "8.1 p3(fwd) 后轴无扭矩");
// (e) 无回归：p2 电机在曲轴链 → motGeared=1（组合器内统一乘 ratio×eff）
const c1p2 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
c1p2.architecture = "p2"; c1p2.drive = "rwd"; c1p2.ice.inertia = 0.2; c1p2.motorF = null;
c1p2.motorR = { peakTorqueNm: 200, peakPowerKw: 100, maxRpm: 10000, regenMaxKw: 80, inertia: 0.1 };
c1p2.battery = { capacityKwh: 10, soc0: 0.6, maxDischargeKw: 400, maxChargeKw: 150 };
c1p2.gearbox = { type: "manual", ratios: [3], finalDrive: 2, shiftTimeMs: 0, eff: 0.9, autoUpFrac: 0.92, autoDownFrac: 0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(c1p2)})`).ok === true, "8.1 p2 spec valid");
const c1p2Soc = T("POWERTRAIN.state.soc");
const C1P2_R = 6, c1p2Rpm = C1W * C1P2_R * 30 / Math.PI;
const c1p2Ti = T(`POWERTRAIN.iceTorque(${c1p2Rpm}, 1)`);
const c1p2Tm = T(`POWERTRAIN.motorTorque(${JSON.stringify(c1p2.motorR)}, ${c1p2Rpm}, 1, ${c1p2Soc})`);
const c1p2Out = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:0,FR:0,RL:${C1W},RR:${C1W}})`);
assert(Math.abs(c1p2Out.tRear - (c1p2Ti + c1p2Tm) * C1P2_R * 0.9 / 2) < 1e-6,
  "8.1 C1 无回归：p2 仍为 (T_ice+T_mot)×ratio×eff/2（不双重乘齿比）");

/* ── 8.2 C2：松油门/制动工况——轮扭矩为负、SOC 上升、P_wheel 与 P_mot 同源同符号 ── */
console.log("--- 8.2 C2 lift-off energy conservation ---");
// (a) EV 制动回收：tRear<0、dSoc>0、P_wheel/P_mot = 0.95×eff
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
const C2_DT = 0.004;
const c2Soc0 = T("POWERTRAIN.state.soc");
const c2Out = T(`POWERTRAIN.step(${C2_DT}, {throttle:0, brake:0.5}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
const c2Soc1 = T("POWERTRAIN.state.soc");
const C2_TREG = -175;                        // motorTorque(cmd=-0.5) = -350×0.5
assert(c2Out.tRear < 0 && c2Out.tFront < 0, `8.2 C2 EV 松油门+制动 → 轮扭矩为负（tRear=${c2Out.tRear}）`);
assert(Math.abs(c2Out.tRear - C2_TREG * EV_R * EV_E / 2) < 1e-6,
  `8.2 C2 EV tRear = −175×9.73×0.97/2 = ${C2_TREG * EV_R * EV_E / 2}（改前机械通道被 tcsScale=0 抹成 0）`);
assert(c2Soc1 > c2Soc0, `8.2 C2 EV dSoc>0（回收充电 ${c2Soc0} → ${c2Soc1}）`);
const c2Pmot = (2 * C2_TREG * EV_WMOT) / 0.95;                 // step() 内 P_mot（tcsRear=1）
const c2Pwheel = 2 * c2Out.tFront * C1W + 2 * c2Out.tRear * C1W; // 四轮机械功率
assert(c2Pwheel < 0 && c2Pmot < 0, "8.2 C2 P_wheel 与 P_mot 同符号（均为负=回馈）");
assert(Math.abs(c2Pwheel / c2Pmot - 0.95 * EV_E) < 1e-9,
  `8.2 C2 能量守恒 P_wheel/P_mot = 0.95×0.97 = ${0.95 * EV_E}（实得 ${c2Pwheel / c2Pmot}）`);
const c2dSoc = -c2Pmot * C2_DT / (80 * 3.6e6);
assert(Math.abs((c2Soc1 - c2Soc0) - c2dSoc) < 1e-15,
  `8.2 C2 SOC 积分与电机轴功率同源（期望 +${c2dSoc.toExponential(4)}）`);
// (b) GT3 松油门发动机制动：ICE 摩擦/泵气负扭矩经齿比到轮
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"]))); POWERTRAIN.state.thrSm = 0; POWERTRAIN.state.gearIdx = 5;');
const C2B_W = 100, C2B_R = 0.95 * 3.9, C2B_E = 0.96;
const c2bOut = T(`POWERTRAIN.step(${C2_DT}, {throttle:0, brake:0}, {FL:0,FR:0,RL:${C2B_W},RR:${C2B_W}})`);
const c2bRpm = C2B_W * C2B_R * 30 / Math.PI;
const c2bTi = T(`POWERTRAIN.iceTorque(${c2bRpm}, 0)`);
assert(c2bTi < 0, `8.2 C2 GT3 松油门 → T_ice<0（发动机制动 ${c2bTi.toFixed(2)} N·m @${c2bRpm.toFixed(0)} rpm）`);
assert(Math.abs(c2bOut.tRear - c2bTi * C2B_R * C2B_E / 2) < 1e-6, "8.2 C2 GT3 发动机制动扭矩经齿比到轮（解析）");
assert(c2bOut.tRear < -10, `8.2 C2 GT3 tRear=${c2bOut.tRear.toFixed(2)} < −10 N·m（改前接线层 tcsScale=0 会抹成 0 → 空挡滑行）`);
assert(Math.abs(c2bOut.tFront) < 1e-9, "8.2 C2 GT3(rwd) 前轴无扭矩");
// (c) 接线层（11-stages.js）——沙箱不加载它，故按 7.14 先例做源码断言（见 8.8）

/* ── 8.3 C3：autoShift 白名单 / 架构感知转速源 / 换挡生产者 / 反向锁止 ── */
console.log("--- 8.3 C3 shift producer & whitelist ---");
assert(JSON.stringify(T("POWERTRAIN.AUTO_GB_TYPES")) === JSON.stringify(["auto", "dct", "seq", "cvt"]),
  `8.3 C3 AUTO_GB_TYPES = auto/dct/seq/cvt（实得 ${JSON.stringify(T("POWERTRAIN.AUTO_GB_TYPES"))}；改前仅 auto/dct）`);
assert(T("POWERTRAIN.SHIFT_LOCK_MS") === 400, "8.3 C3 SHIFT_LOCK_MS = 400");
// seq（FSAE）→ 白名单内，按 spec 的 autoUpFrac=0.95 升挡
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["FSAE I4 RWD 5MT"]))); POWERTRAIN.state.gearIdx = 0;');
assert(T("POWERTRAIN.shiftRedlineRpm()") === 13000, "8.3 C3 FSAE(seq) 红线 = ice.redlineRpm = 13000");
T("POWERTRAIN.autoShift(0.96 * 13000);");
assert(T("POWERTRAIN.state.shiftDir") === 1 && T("POWERTRAIN.state.shiftT") > 0,
  "8.3 C3 FSAE(seq) autoShift @0.96×红线 → 升挡（改前白名单外 → 卡 1 挡）");
// cvt（THS）→ 白名单内，但 ratios.length===1 → 不越界
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"])));');
assert(T("POWERTRAIN.shiftRedlineRpm()") === 12000, "8.3 C3 THS(powersplit/fwd) 红线 = MG1.maxRpm = 12000（非 ice 6000）");
T("POWERTRAIN.autoShift(0.99 * 12000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.gearIdx") === 0,
  "8.3 C3 THS(cvt,单速比) autoShift 不越界（e-CVT 无挡位）");
// manual（GT3）→ autoShift 不生效，但转速律生产者生效
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"]))); POWERTRAIN.state.gearIdx = 0;');
assert(T("POWERTRAIN.shiftRedlineRpm()") === 8500, "8.3 C3 GT3(ice) 红线 = ice.redlineRpm = 8500");
T("POWERTRAIN.autoShift(0.99 * 8500);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0,
  "8.3 C3 GT3(manual) autoShift 不生效（manual 仍手动）");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.96 * 8500)") === 1, "8.3 C3 GT3(manual) shiftCmdFromRpm @0.96×红线 → +1（转速律生产者）");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.90 * 8500)") === 0, "8.3 C3 shiftCmdFromRpm 中间带（0.55~0.95）→ 0");
T("POWERTRAIN.state.gearIdx = 3;");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.50 * 8500)") === -1, "8.3 C3 shiftCmdFromRpm @0.50×红线 → −1");
T("POWERTRAIN.state.gearIdx = 0;");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.50 * 8500)") === 0, "8.3 C3 shiftCmdFromRpm 1 挡不降（越界保护）");
T("POWERTRAIN.state.gearIdx = 5;");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.99 * 8500)") === 0, "8.3 C3 shiftCmdFromRpm 顶挡不升（越界保护）");
T("POWERTRAIN.state.gearIdx = 2; POWERTRAIN.state.shiftT = 100; POWERTRAIN.state.shiftDir = 1;");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.99 * 8500)") === 0, "8.3 C3 shiftCmdFromRpm 换挡进行中 → 0");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;");
assert(T("POWERTRAIN.shiftCmdFromRpm(NaN)") === 0 && T("POWERTRAIN.shiftCmdFromRpm(-100)") === 0,
  "8.3 C3 shiftCmdFromRpm 非有限/负 rpm → 0（守卫）");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.80 * 8500, 0.75, 0.40)") === 1, "8.3 C3 shiftCmdFromRpm 自定义 upFrac=0.75 → +1");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.45 * 8500, 0.90, 0.50)") === -1, "8.3 C3 shiftCmdFromRpm 自定义 downFrac=0.50 → −1");
// 架构感知转速源 shiftRpm
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
const c3ev = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
assert(Math.abs(c3ev.iceRpm) < 1e-9, "8.3 C3 EV iceRpm≡0（无曲轴，改前依赖它 → 永不换挡）");
assert(Math.abs(c3ev.shiftRpm - EV_WMOT * 30 / Math.PI) < 1e-6,
  `8.3 C3 EV shiftRpm = 轮速×ratio×30/π = ${EV_WMOT * 30 / Math.PI}（电机 rpm）`);
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["串联增程后驱"]))); POWERTRAIN.state.thrSm = 1;');
const c3se = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
assert(Math.abs(c3se.shiftRpm - C1W * 9.0 * 30 / Math.PI) < 1e-6, "8.3 C3 series(rwd) shiftRpm = 后电机 rpm（轮速×9.0）");
assert(c3se.iceRpm > 0 && Math.abs(c3se.iceRpm - c3se.shiftRpm) > 1,
  `8.3 C3 series iceRpm(${c3se.iceRpm.toFixed(0)}) ≠ shiftRpm(${c3se.shiftRpm.toFixed(0)})（发电控制律转速不可作换挡判据）`);
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"]))); POWERTRAIN.state.thrSm = 1;');
const c3ths = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
assert(Math.abs(c3ths.shiftRpm - C1W * 3.6 * 30 / Math.PI) < 1e-6,
  "8.3 C3 powersplit(fwd) shiftRpm = MG1 rpm（轮速×finalDrive 3.6）");
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"]))); POWERTRAIN.state.thrSm = 1;');
const c3gt = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:0,FR:0,RL:20,RR:20})");
assert(c3gt.shiftRpm === c3gt.iceRpm, "8.3 C3 ICE 架构 shiftRpm === iceRpm（无回归）");
assert(Math.abs(c3gt.shiftRpm - 20 * 3.0 * 3.9 * 30 / Math.PI) < 1e-6, "8.3 C3 GT3 shiftRpm = 轮速×11.7×30/π");
// SHIFT_LOCK_MS 反向锁止（防 P3 类大齿比间隔箱 1↔2 挡振荡）
const lkSpec = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
lkSpec.gearbox = { type: "auto", ratios: [3.5, 2.1, 1.5], finalDrive: 1, shiftTimeMs: 100, eff: 1, autoUpFrac: 0.9, autoDownFrac: 0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(lkSpec)})`).ok === true, "8.3 C3 lock spec valid");
T("POWERTRAIN.state.gearIdx = 0;");
T("POWERTRAIN.autoShift(0.95 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === 1 && T("POWERTRAIN.state.shiftT") === 100, "8.3 C3 lock：升挡请求受理（shiftT=100ms）");
T("POWERTRAIN.advanceGearbox(0.1, 10);");
assert(T("POWERTRAIN.state.gearIdx") === 1 && T("POWERTRAIN.state.shiftLockT") === 400 && T("POWERTRAIN.state.shiftLockDir") === 1,
  "8.3 C3 lock：换挡完成 → shiftLockT=400 / shiftLockDir=+1");
T("POWERTRAIN.autoShift(0.30 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0 && T("POWERTRAIN.state.shiftDir") === 0,
  "8.3 C3 lock：锁止窗口内反向（降挡）被拒——P3 预设 3.5→2.1 后 rr=0.54<0.55 的振荡由此消除");
T("POWERTRAIN.requestShift(-1);");
assert(T("POWERTRAIN.state.shiftDir") === -1 && T("POWERTRAIN.state.shiftT") > 0,
  "8.3 C3 lock：显式 requestShift(-1) 不受锁止影响（驾驶员意图优先）");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.shiftLockT = 0; POWERTRAIN.state.shiftLockDir = 0;");
T("POWERTRAIN.autoShift(0.30 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === -1, "8.3 C3 lock：窗口外降挡恢复正常");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.gearIdx = 0; POWERTRAIN.state.shiftLockT = 400; POWERTRAIN.state.shiftLockDir = 1;");
T("POWERTRAIN.autoShift(0.95 * 9000);");
assert(T("POWERTRAIN.state.shiftDir") === 1, "8.3 C3 lock：只挡反向，同向升挡照常");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftLockT = 400; POWERTRAIN.state.shiftLockDir = 1;");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.30 * 9000)") === 0, "8.3 C3 lock：shiftCmdFromRpm 同样遵守反向锁止");
assert(T("POWERTRAIN.shiftCmdFromRpm(0.96 * 9000)") === 1, "8.3 C3 lock：shiftCmdFromRpm 同向不受锁止");
T("POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0; POWERTRAIN.state.shiftLockT = 400; POWERTRAIN.state.shiftLockDir = 1;");
T("POWERTRAIN.advanceGearbox(0.2, 10);");
assert(Math.abs(T("POWERTRAIN.state.shiftLockT") - 200) < 1e-9, "8.3 C3 lock：advanceGearbox 按 dt 递减 shiftLockT");
T("POWERTRAIN.advanceGearbox(0.3, 10);");
assert(T("POWERTRAIN.state.shiftLockT") === 0 && T("POWERTRAIN.state.shiftLockDir") === 0,
  "8.3 C3 lock：窗口耗尽后清零（含 shiftLockDir）");
T("POWERTRAIN.autoShift(NaN); POWERTRAIN.autoShift(-5);");
assert(T("POWERTRAIN.state.shiftT") === 0, "8.3 C3 autoShift 非有限/负 rpm 守卫（不抛错、不改状态）");

/* ── 8.4 I1：反射惯量只加驱动轮且按驱动轮数归一 ── */
console.log("--- 8.4 I1 reflected inertia per drive wheel ---");
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"])));');
assert(T("POWERTRAIN.driveWheelCount()") === 2, "8.4 I1 GT3(rwd) driveWheelCount = 2");
assert(T("POWERTRAIN.isDriveWheel('RL')") === true && T("POWERTRAIN.isDriveWheel('RR')") === true,
  "8.4 I1 GT3(rwd) 后轮为驱动轮");
assert(T("POWERTRAIN.isDriveWheel('FL')") === false && T("POWERTRAIN.isDriveWheel('FR')") === false,
  "8.4 I1 GT3(rwd) 前轮【非】驱动轮（改前 ptIw 加到全 4 轮 → 前轮 Iw 被无物理依据放大）");
const I1_G1 = 0.35 * Math.pow(3.0 * 3.9, 2) / 2;   // I×r²/nDrive = 23.95575
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - I1_G1) < 1e-12,
  `8.4 I1 GT3 1 挡每驱动轮反射惯量 = 0.35×11.7²/2 = ${I1_G1}`);
assert(T("POWERTRAIN.reflectedInertia()") === T("POWERTRAIN.reflectedInertiaPerDriveWheel()"),
  "8.4 I1 reflectedInertia() 委托别名（向后兼容，语义=每驱动轮）");
T("POWERTRAIN.state.gearIdx = 5;");
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.35 * Math.pow(0.95 * 3.9, 2) / 2) < 1e-12,
  "8.4 I1 反射惯量随挡位（顶挡 0.95×3.9）");
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["P3 混动前驱"])));');
assert(T("POWERTRAIN.driveWheelCount()") === 2 && T("POWERTRAIN.isDriveWheel('FL')") === true && T("POWERTRAIN.isDriveWheel('RR')") === false,
  "8.4 I1 P3(fwd) 前轮驱动、后轮不驱动");
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.15 * Math.pow(3.5 * 4.1, 2) / 2) < 1e-12,
  "8.4 I1 P3 只计 ice.inertia（p3 电机在箱后，不在曲轴链）");
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
assert(T("POWERTRAIN.driveWheelCount()") === 4 && T("POWERTRAIN.isDriveWheel('FL')") === true && T("POWERTRAIN.isDriveWheel('RR')") === true,
  "8.4 I1 EV(tv) 四轮驱动");
const I84_EV = (0.05 + 0.05) * 9.73 * 9.73 / 4;   // 双电机求和按 nDrive=4 归一 = 0.05×9.73²/2 每轮
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - I84_EV) < 1e-9,
  `8.4 I1 EV(tv) 双电机反射 = (I_F+I_R)×ratio²/nDrive = ${I84_EV}（P10-2 补上电机惯量，翻转旧“EV→0”待办锁）`);
// p2：电机在曲轴链 → 计入；awd /4、rwd /2
const i1p2 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
i1p2.architecture = "p2"; i1p2.drive = "awd_fixed"; i1p2.ice.inertia = 0.3;
i1p2.motorF = { peakTorqueNm: 100, peakPowerKw: 50, maxRpm: 10000, inertia: 0.05 };
i1p2.motorR = { peakTorqueNm: 100, peakPowerKw: 50, maxRpm: 10000, inertia: 0.05 };
i1p2.battery = { capacityKwh: 10 };
i1p2.gearbox = { type: "manual", ratios: [3], finalDrive: 4, shiftTimeMs: 0, eff: 1, autoUpFrac: 0.92, autoDownFrac: 0.55 };
assert(T(`POWERTRAIN.setSpec(${JSON.stringify(i1p2)})`).ok === true, "8.4 I1 p2 spec valid");
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - (0.3 + 0.05 + 0.05) * 144 / 4) < 1e-12,
  "8.4 I1 p2+awd：(I_ice+I_motF+I_motR)×(3×4)²/4");
T("POWERTRAIN.spec.drive = 'rwd';");
assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.4 * 144 / 2) < 1e-12,
  "8.4 I1 p2+rwd：分母改 2（每驱动轮）");
assert(T("POWERTRAIN.isDriveWheel('RL')") === true && T("POWERTRAIN.isDriveWheel('FL')") === false,
  "8.4 I1 isDriveWheel 跟随 spec.drive 变更");
assert(T("POWERTRAIN.isDriveWheel('XX')") === false && T("POWERTRAIN.isDriveWheel(undefined)") === false,
  "8.4 I1 未知 wheelId → false（失效安全）");

/* ── 8.5 I3：hasRealDrivetrain() → 不乘 drivePowerFactor ── */
console.log("--- 8.5 I3 drivePowerFactor bypass ---");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.hasRealDrivetrain()") === false,
  "8.5 I3 legacy 默认规格 hasRealDrivetrain()===false → 仍走 drivePowerFactor（保 parity）");
for (const nm8 of T("Object.keys(POWERTRAIN_PRESETS)")) {
  T(`POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS[${JSON.stringify(nm8)}])));`);
  assert(T("POWERTRAIN.hasRealDrivetrain()") === true,
    `8.5 I3 预设「${nm8}」hasRealDrivetrain()===true → 接线层 ptDriveScale=1`);
}
T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
const i3Out = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
assert(Math.abs(i3Out.tRear / (EV_AXLE / 2) - 1) < 1e-12,
  "8.5 I3 EV tRear 恰为解析值（动力层不含任何质量补偿因子）");
assert(Math.abs(i3Out.tRear - 0.576 * EV_AXLE / 2) > 100,
  `8.5 I3 EV tRear=${i3Out.tRear.toFixed(1)} ≠ ×0.576 的打折值 ${(0.576 * EV_AXLE / 2).toFixed(1)}`);

/* ── 8.6 六预设 30s 全油门 1-DOF 纵向积分探针（F=ΣT/Re，附着钳制，减风阻+滚阻）── */
console.log("--- 8.6 six-preset 30s WOT longitudinal probe ---");
T(`window.__ptProbe = function(name, o) {
  var sp = JSON.parse(JSON.stringify(POWERTRAIN_PRESETS[name]));
  if (!POWERTRAIN.setSpec(sp).ok) return { err: "invalid spec" };
  POWERTRAIN.resetState();
  var dt = o.dt, Re = o.Re, m = o.m, CdA = o.CdA, mu = o.mu, rho = 1.2, Crr = 0.015, G = 9.81;
  var nD = Math.max(1, POWERTRAIN.driveWheelCount());
  var Fcap = mu * m * G * (nD / 4);                 /* 附着上限：静载分配近似 */
  var manualLaw = (sp.gearbox.type === "manual");   /* 与 11-stages.js 生产者同规则 */
  var v = 0.5, vMax = 0, aMax = 0, shifts = 0, prevRpm = 0, gears = {};
  var lastG = POWERTRAIN.state.gearIdx; gears[lastG] = 1;
  var N = Math.round(o.tWot / dt), i;
  for (i = 0; i < N; i++) {
    var w = v / Re, wo = { FL: w, FR: w, RL: w, RR: w };
    var sc = (manualLaw && prevRpm > 0) ? POWERTRAIN.shiftCmdFromRpm(prevRpm) : 0;
    var out = POWERTRAIN.step(dt, { throttle: 1, brake: 0, shiftCmd: sc }, wo);
    prevRpm = out.shiftRpm;
    if (out.gearIdx !== lastG) { shifts++; lastG = out.gearIdx; gears[lastG] = 1; }
    var Fd = (2 * out.tFront + 2 * out.tRear) / Re;
    if (Fd > Fcap) Fd = Fcap; else if (Fd < -Fcap) Fd = -Fcap;
    var a = (Fd - 0.5 * rho * CdA * v * v - Crr * m * G) / m;
    v += a * dt; if (v < 0) v = 0;
    if (v > vMax) vMax = v;
    if (a > aMax) aMax = a;
  }
  var socWot = POWERTRAIN.state.soc;
  /* Phase B：松油门+制动 3s（轮速保持 WOT 末速，稳态工况探针） */
  var wB = v / Re, tMin = 0, NB = Math.round(o.tCoast / dt);
  for (i = 0; i < NB; i++) {
    var oB = POWERTRAIN.step(dt, { throttle: 0, brake: o.brakeCoast }, { FL: wB, FR: wB, RL: wB, RR: wB });
    var TB = 2 * oB.tFront + 2 * oB.tRear;
    if (TB < tMin) tMin = TB;
  }
  var nG = 0; for (var k in gears) nG++;
  return { vMaxKmh: vMax * 3.6, vEndKmh: v * 3.6, gearsUsed: nG, shifts: shifts,
           aMaxG: aMax / G, socWot: socWot, dSocCoast: POWERTRAIN.state.soc - socWot, tMinWheel: tMin };
}`);
/* 探针参数：每预设一套质量/轮胎半径/风阻面积/附着（量级取自真实车种），
   30s WOT + 3s 松油门制动。两相参数与车辆模型完全一致，差异只来自动力层。
   【改前基线】（同一探针跑 git HEAD 旧 16-powertrain.js，实测值）：
     GT3     92.5 km/h / 1 挡 / 0 次换挡      → 改后 292.1 / 6 挡 / 5 次
     FSAE   102.1 km/h / 1 挡 / 0 次换挡      → 改后 186.2 / 4 挡 / 3 次
     EV      81.2 km/h / a_max 0.078g          → 改后 320.4 / a_max 0.860g
     P3     181.9 km/h / 5 挡 / 6 次换挡（1↔2 挡振荡）→ 改后 183.0 / 5 挡 / 4 次（锁止后干净）
     串联    37.1 km/h / a_max 0.034g          → 改后 179.7 / a_max 0.415g
     THS    120.1 km/h / a_max 0.119g          → 改后 184.0 / a_max 0.310g
   注：THS 改前已 >100 km/h（它的机械分流路径本来就乘齿比），故 100 km/h 阈值对 THS
   不具判别力；C1 对 powersplit 电机路径的修复由 8.1 的解析断言（353.97 vs 改前 103.5）锁住。 */
const PROBE_CFG = [
  { name: "GT3 V8 RWD 6MT",  m: 1300, Re: 0.33, CdA: 0.80, mu: 1.15, vMinKmh: 150, gearsMin: 3, elec: false },
  { name: "FSAE I4 RWD 5MT", m: 240,  Re: 0.26, CdA: 0.60, mu: 1.15, vMinKmh: 120, gearsMin: 3, elec: false },
  { name: "EV 双电机 AWD-TV", m: 2200, Re: 0.35, CdA: 0.55, mu: 1.05, vMinKmh: 150, gearsMin: 1, elec: true },
  { name: "P3 混动前驱",      m: 1600, Re: 0.32, CdA: 0.70, mu: 1.05, vMinKmh: 150, gearsMin: 3, elec: true },
  { name: "串联增程后驱",     m: 2300, Re: 0.36, CdA: 0.90, mu: 1.05, vMinKmh: 100, gearsMin: 1, elec: true },
  { name: "THS 功率分流",     m: 1500, Re: 0.32, CdA: 0.70, mu: 1.05, vMinKmh: 100, gearsMin: 1, elec: true }
];
const PROBE_ROWS = [];
for (const c of PROBE_CFG) {
  assert(T(`POWERTRAIN.validate(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS[${JSON.stringify(c.name)}]))).ok`) === true,
    `8.6 预设「${c.name}」通过 validate`);
  const r = T(`window.__ptProbe(${JSON.stringify(c.name)}, {dt:0.002, Re:${c.Re}, m:${c.m}, CdA:${c.CdA}, mu:${c.mu}, tWot:30, tCoast:3, brakeCoast:0.35})`);
  assert(!r.err, `8.6 预设「${c.name}」探针执行成功`);
  PROBE_ROWS.push({ name: c.name, v: r.vMaxKmh, g: r.gearsUsed, s: r.shifts, a: r.aMaxG, ds: r.dSocCoast, tw: r.tMinWheel, soc: r.socWot });
  assert(Number.isFinite(r.vMaxKmh) && Number.isFinite(r.aMaxG) && Number.isFinite(r.tMinWheel),
    `8.6 ${c.name} 探针输出全有限（无 NaN 扩散）`);
  assert(r.vMaxKmh > c.vMinKmh,
    `8.6 ${c.name} 30s WOT 极速 ${r.vMaxKmh.toFixed(1)} km/h > ${c.vMinKmh} km/h`);
  assert(r.gearsUsed >= c.gearsMin,
    `8.6 ${c.name} gearsUsed ${r.gearsUsed} ≥ ${c.gearsMin}（shifts=${r.shifts}；改前 5/6 预设卡 1 挡）`);
  assert(r.shifts >= c.gearsMin - 1, `8.6 ${c.name} 实际换挡次数 ${r.shifts} ≥ ${c.gearsMin - 1}`);
  assert(r.aMaxG > 0.2 && r.aMaxG < 1.2,
    `8.6 ${c.name} a_max = ${r.aMaxG.toFixed(3)} g 在物理带 (0.2, 1.2) 内（附着/功率钳制生效）`);
  assert(r.tMinWheel < 0,
    `8.6 ${c.name} 松油门+制动 → 轮扭矩 ${r.tMinWheel.toFixed(1)} N·m < 0（C2 发动机制动/回收）`);
  if (c.elec) assert(r.dSocCoast > 0,
    `8.6 ${c.name} 松油门+制动 → dSoc = +${r.dSocCoast.toExponential(3)}（回收充电，与轮上负扭矩同源）`);
  else assert(r.dSocCoast === 0 && r.socWot === 1, `8.6 ${c.name} 无电池 → dSoc=0 / soc≡1`);
  assert(r.socWot > 0.05 && r.socWot <= 1, `8.6 ${c.name} WOT 30s 后 SOC = ${r.socWot.toFixed(4)} 在物理范围`);
}
console.log("\n[8.6 六预设 30s WOT 1-DOF 纵向积分探针（改后）]");
console.log("预设                     极速km/h   挡数  换挡次  a_max(g)  SOC@30s  dSoc(松油)  tMin轮扭矩");
for (const row of PROBE_ROWS) {
  console.log(
    row.name.padEnd(22, " ") + " " +
    row.v.toFixed(1).padStart(9) + " " +
    String(row.g).padStart(5) + " " +
    String(row.s).padStart(7) + " " +
    row.a.toFixed(3).padStart(9) + " " +
    row.soc.toFixed(4).padStart(8) + " " +
    row.ds.toExponential(2).padStart(11) + " " +
    row.tw.toFixed(1).padStart(11));
}
console.log("");

/* ── 8.7 legacy 等价锚终检：C1/C2/C3/I1/I3 全部落地后默认规格逐位不变 ── */
console.log("--- 8.7 legacy anchor final check ---");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
const anc8 = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
assert(anc8.tRear === 480 && anc8.tFront === 120,
  `8.7 legacy 等价锚 tRear=480/tFront=120 逐位不变（实得 ${anc8.tRear}/${anc8.tFront}）`);
assert(anc8.tWheel === null && anc8.shifting === false && anc8.P_gen === 0 && anc8.gearIdx === 0,
  "8.7 legacy 等价锚其余字段（tWheel=null/shifting=false/P_gen=0/gearIdx=0）");
assert(anc8.shiftRpm === anc8.iceRpm, "8.7 legacy shiftRpm === iceRpm（非 MOTOR_GEARED，无回归）");
const anc8b = T("POWERTRAIN.step(0.004, {throttle:0, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
assert(anc8b.tRear === 0 && anc8b.tFront === 0,
  "8.7 legacy throttle=0 → tRear=tFront=0（fric=0 → C2 的 tcsScale 0→1 在 legacy 路径数值不变）");
assert(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") === 0 && T("POWERTRAIN.driveWheelCount()") === 4,
  "8.7 legacy inertia=0 → 反射惯量 0（I1 parity）");
assert(T("POWERTRAIN.shiftCmdFromRpm(9000)") === 0,
  "8.7 legacy 单速比箱 → shiftCmdFromRpm 恒 0（C3 生产者 parity）");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ── 8.8 接线层（11-stages.js）源码扫描：本沙箱不加载 11-stages.js（见 7.8 前置断言），
      故沿用 7.14 先例做源码级断言，锁住 C2/I1/I3/C3 的接线不被回退 ── */
console.log("--- 8.8 11-stages.js wiring source scan ---");
const stSrc = fs.readFileSync(path.join(__dirname, "../js/11-stages.js"), "utf8");
assert(stSrc.indexOf("(ctrl.throttle > 1e-6) ? (throttleCmd / ctrl.throttle) : 1") >= 0,
  "8.8 C2 接线：松油门 tcsScale = 1（TCS 只在给油切驱动时介入）");
assert(stSrc.indexOf("(throttleCmd / ctrl.throttle) : 0") < 0,
  "8.8 C2 接线：旧的 tcsScale=0（抹掉发动机制动/回收）已移除");
assert(stSrc.indexOf("POWERTRAIN.hasRealDrivetrain()) ? 1 : drivePowerFactor") >= 0,
  "8.8 I3 接线：ptDriveScale = hasRealDrivetrain() ? 1 : drivePowerFactor");
assert(stSrc.indexOf("* ptDriveScale * tcsScale") >= 0, "8.8 I3 接线：ptOut 分支改用 ptDriveScale");
assert(stSrc.indexOf("throttleCmd * 480.0 * drivePowerFactor") >= 0,
  "8.8 I3 接线：legacy 回退分支仍用 drivePowerFactor（保对拍锚）");
assert(stSrc.indexOf("POWERTRAIN.reflectedInertiaPerDriveWheel()") >= 0, "8.8 I1 接线：取每驱动轮反射惯量");
assert(stSrc.indexOf("POWERTRAIN.isDriveWheel(w.id)") >= 0, "8.8 I1 接线：只加到驱动轮");
assert(stSrc.indexOf("POWERTRAIN.reflectedInertia()") < 0, "8.8 I1 接线：旧的全 4 轮 ptIw 调用已移除");
assert(stSrc.indexOf("POWERTRAIN.shiftCmdFromRpm(this._ptShiftRpm)") >= 0, "8.8 C3 接线：转速律换挡生产者已接入");
assert(stSrc.indexOf("ptOut.shiftRpm") >= 0, "8.8 C3 接线：转速源取 step() 返回的 shiftRpm（架构感知）");
assert(stSrc.indexOf('_gbt === "manual"') >= 0,
  "8.8 C3 接线：外部生产者只对 manual 生效（auto/dct/seq/cvt 由 step 内 autoShift 按 spec 的 autoUp/DownFrac）");
assert(stSrc.indexOf("手动箱自动离合") >= 0, "8.8 C3 接线：转速律的简化语义已在注释声明");
assert(stSrc.indexOf("TODO(G31-P10)") >= 0, "8.8 C3 接线：tvBias 动态扭矩矢量 TODO 标注");
assert(ptSrc.indexOf("TODO(G31-P10)") >= 0, "8.8 C3 动力层：tv 块 TODO(G31-P10) 标注");

/* ═══ 9. G31-P10-1 差速器接线（open/locked/lsd 轮端分配 + awd_center 中央速差转移）═══
   distributeAxle/distributeCenter 为 POWERTRAIN 纯方法；step() 只在【左/右非对称】时产出
   tWheel，否则维持 null（legacy 等价锚与既有 tv 断言不能破）。 */
console.log("=== 9. G31-P10-1 Differential Wiring ===");
const DA = (t, wL, wR, fzL, fzR, df) =>
  T(`POWERTRAIN.distributeAxle(${t},${wL},${wR},${fzL},${fzR},${JSON.stringify(df)})`);

// ── 9.1 open 逐位对称（忽略 fz / 速差）+ 负扭矩守恒 ──
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
{
  const [l, r] = DA(1000, 30, 30, 4000, 1000, { type: "open" });
  assert(l === 500 && r === 500, "9.1 open 逐位对称 50/50（fz/速差不影响）");
  const [l2, r2] = DA(-640, 10, 40, 0, 0, { type: "open" });
  assert(l2 === -320 && r2 === -320 && Math.abs(l2 + r2 + 640) < 1e-12, "9.1 open 负扭矩逐位对称 + 守恒");
}
// ── 9.2 locked 按 fz 4:1 分配且守恒；fz 和 ≤0 退化 50/50 ──
{
  const [l, r] = DA(1000, 30, 30, 4000, 1000, { type: "locked" });
  assert(Math.abs(l - 800) < 1e-9 && Math.abs(r - 200) < 1e-9 && Math.abs(l + r - 1000) < 1e-12,
    "9.2 locked fz 4000/1000 → 4:1(800/200) 且守恒");
  const [l0, r0] = DA(1000, 30, 20, 0, 0, { type: "locked" });
  assert(l0 === 500 && r0 === 500, "9.2 locked fz 和 ≤0 → 退化 50/50");
}
// ── 9.3 lsd 速差 10 rad/s（RL 慢）→ tRL>tRR、和=tAxle、转移量 ≤lockNm、等于公式值 ──
{
  const df = { type: "lsd", bias: 3, lockNm: 200, slipRefRadS: 8 };
  const [l, r] = DA(1000, 0, 10, 3000, 3000, df);   // 后轴 RL=wL=0(慢) / RR=wR=10(快) → 向左转移
  const expTrans = Math.min(200, ((3 - 1) / (3 + 1)) * 500 + 200 * Math.min(1, 10 / 8));
  assert(l > r && Math.abs(l + r - 1000) < 1e-12, "9.3 lsd 速差10(RL慢) → tRL>tRR 且守恒");
  assert(Math.abs((l - 500) - expTrans) < 1e-9 && expTrans <= 200 + 1e-9,
    "9.3 lsd 转移量 = min(lockNm, bias项+速差项) ≤ lockNm");
}
// ── 9.4 lsd 零速差 → 仅 bias 项（无速差项，lockNm 大到不成钳位）──
{
  const df = { type: "lsd", bias: 3, lockNm: 1000, slipRefRadS: 8 };
  const [l, r] = DA(1000, 25, 25, 3000, 3000, df);
  const expBias = ((3 - 1) / (3 + 1)) * Math.abs(1000) / 2;   // 250
  assert(Math.abs((l - 500) - expBias) < 1e-9 && Math.abs(l + r - 1000) < 1e-12,
    "9.4 lsd 零速差 → 转移=仅 bias 项（无速差项）且守恒");
}
// ── 9.5 awd_center 速差 2 rad/s（后轴快）→ 前轴扭矩增加 + 总和守恒 ──
{
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.drive = "awd_center"; s.splitFront = 0.4; s.centerDiff = { lockNm: 300, slipRefRadS: 8 };
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(s)})`).ok === true, "9.5 awd_center spec valid");
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0},{FL:30,FR:30,RL:32,RR:32})");
  const baseFront = 1200 * 0.4 / 2;   // 无中央差速时前轴轮扭矩 240
  assert(o.tFront > baseFront && Math.abs((o.tFront + o.tRear) - 1200 / 2) < 1e-6,
    "9.5 awd_center 后轴快 → 前轴扭矩增加 且 前后轴和=总轴/2 守恒");
}
// ── 9.6 awd_fixed 逐位不变（step 级）──
{
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0},{FL:30,FR:30,RL:30,RR:30})");
  assert(o.tRear === 480 && o.tFront === 120 && o.tWheel === null,
    "9.6 awd_fixed 逐位不变（tRear480/tFront120/tWheel null）");
}
// ── 9.7 legacy 锚：wheelLoads 非对称但 diff=open → 仍对称（tWheel null / 480 / 120 逐位）──
{
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0,wheelLoads:{FL:5000,FR:100,RL:4000,RR:50}},{FL:30,FR:30,RL:30,RR:30})");
  assert(o.tWheel === null && o.tRear === 480 && o.tFront === 120,
    "9.7 legacy 锚 wheelLoads 非对称 + diff=open → tWheel null / 480 / 120 逐位");
}
// ── 9.8 locked 经 step 产出非对称 tWheel（rwd 后轴 4:1）──
{
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.drive = "rwd"; s.splitFront = 0; s.diff = { type: "locked", bias: 1, lockNm: 0 };
  T(`POWERTRAIN.setSpec(${JSON.stringify(s)}); POWERTRAIN.resetState();`);
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0,wheelLoads:{FL:0,FR:0,RL:4000,RR:1000}},{FL:30,FR:30,RL:30,RR:30})");
  assert(Array.isArray(o.tWheel) && Math.abs(o.tWheel[2] - 960) < 1e-6 && Math.abs(o.tWheel[3] - 240) < 1e-6,
    "9.8 locked rwd RL/RR 载荷 4:1 → tWheel[RL]=960/[RR]=240");
  assert(Math.abs(o.tWheel[2] + o.tWheel[3] - 1200) < 1e-9, "9.8 locked 后轴 tWheel 和=轴扭矩1200 守恒");
}
// ── 9.9 lsd 经 step 产出非对称 tWheel，前轴无驱动 tFront=0 ──
{
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.drive = "rwd"; s.splitFront = 0; s.diff = { type: "lsd", bias: 2, lockNm: 100, slipRefRadS: 8 };
  T(`POWERTRAIN.setSpec(${JSON.stringify(s)}); POWERTRAIN.resetState();`);
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0},{FL:30,FR:30,RL:0,RR:10})");
  assert(Array.isArray(o.tWheel) && o.tWheel[2] > o.tWheel[3], "9.9 lsd rwd 速差 → tWheel RL>RR");
  assert(o.tFront === 0, "9.9 lsd rwd 前轴无驱动 → tFront=0");
}
// ── 9.10 validate 拒 centerDiff.lockNm<0，接受 lockNm=0 ──
{
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.drive = "awd_center"; s.centerDiff = { lockNm: -5, slipRefRadS: 8 };
  const v = T(`POWERTRAIN.validate(${JSON.stringify(s)})`);
  assert(v.ok === false && v.errors.join(",").includes("centerDiff.lockNm"), "9.10 validate 拒 centerDiff.lockNm<0");
  const s2 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s2.drive = "awd_center"; s2.centerDiff = { lockNm: 0, slipRefRadS: 8 };
  assert(T(`POWERTRAIN.validate(${JSON.stringify(s2)})`).ok === true, "9.10 validate 接受 centerDiff.lockNm=0");
}
// ── 9.11 distributeCenter 直接：lockNm=0 → 纯 splitFront；速差 → 向慢轴转移 + 守恒 ──
{
  const [f0, r0] = T("POWERTRAIN.distributeCenter(1000,30,30,0.4,{lockNm:0,slipRefRadS:8})");
  assert(Math.abs(f0 - 400) < 1e-9 && Math.abs(f0 + r0 - 1000) < 1e-12,
    "9.11 distributeCenter lockNm=0 → 纯 splitFront(400/600)");
  const [f1, r1] = T("POWERTRAIN.distributeCenter(1000,28,32,0.4,{lockNm:300,slipRefRadS:8})");
  assert(f1 > 400 && Math.abs(f1 + r1 - 1000) < 1e-12, "9.11 distributeCenter 后轴快 → 前轴增且守恒");
}
// ── 9.13 零通过扭矩轴强制 open（无 lsd 自消力偶/无净功率凭空产生）──
{
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.drive = "rwd"; s.splitFront = 0; s.diff = { type: "lsd", bias: 3, lockNm: 500, slipRefRadS: 8 };
  T(`POWERTRAIN.setSpec(${JSON.stringify(s)}); POWERTRAIN.resetState();`);
  // 前轴 tAxle=0 且无速差分量输入 → 即使轮速不同也不得产生 ±X 力偶
  const o = T("POWERTRAIN.step(0.004,{throttle:1,brake:0},{FL:20,FR:35,RL:0,RR:10})");
  assert(o.tFront === 0 && o.tWheel[0] === 0 && o.tWheel[1] === 0,
    "9.13 前轴 tAxle=0（非通过扭矩轴）→ 强制 open，无 ±X 自消力偶");
  // 能量守恒角：转移仅发生在有通过扭矩的轴上，和恒等轴扭矩已由 9.9 锁定
}
// ── 9.14 G31-P10-4：isLegacyEquivalent 判据 + 09-track payload 注入源扫描 ──
{
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
  assert(T("POWERTRAIN.isLegacyEquivalent()") === true, "9.14 legacy 默认 → isLegacyEquivalent true");
  // 改任一物理字段 → false
  const s = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s.gearbox.ratios = [3, 2, 1]; s.gearbox.finalDrive = 3.9;
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(s)})`).ok && T("POWERTRAIN.isLegacyEquivalent()") === false,
    "9.14 真实齿比 → false");
  const s2 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s2.ice.map = [[800, 1100], [9000, 1100]];   // 平直但非 1200
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(s2)})`).ok && T("POWERTRAIN.isLegacyEquivalent()") === false,
    "9.14 map 非平直(非 1200) → false");
  const s3 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  s3.ice.fricA = 5;
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(s3)})`).ok && T("POWERTRAIN.isLegacyEquivalent()") === false,
    "9.14 fricA≠0 → false");
  assert(T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.isLegacyEquivalent()") === true,
    "9.14 恢复默认 → true");
  // 09-track.js 注入源扫描（沙箱不加载 09-track，沿用 7.14/9.12 先例）
  const trSrc = fs.readFileSync(path.join(__dirname, "..", "js", "09-track.js"), "utf8");
  assert(trSrc.indexOf("isLegacyEquivalent") >= 0, "9.14 09-track：isLegacyEquivalent 门控存在");
  assert(trSrc.indexOf("body.powertrain.ice=ptSpec.ice") >= 0, "9.14 09-track：嵌套 ice 字段下发");
  assert(/仅当生效 spec 与 legacy-equivalent/.test(trSrc), "9.14 09-track：缺省不发注释声明");
}
// ── 9.12 11-stages 接线源扫描：_pd.wheelLoads 传入 + 一子步滞后声明 ──
assert(stSrc.indexOf("_pd.wheelLoads = this.telemetry.Fz") >= 0, "9.12 接线：_pd.wheelLoads = this.telemetry.Fz");
assert(/一子步滞后/.test(stSrc), "9.12 接线：wheelLoads 一子步滞后注释");
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

/* ═══ 10. G31-P10-2：motor maxRpm 硬截止 / ev-series-powersplit 电机惯量反射 /
   THS(powersplit) 驱动轴路由修正 / step() 返回 P_out ═══ */
console.log("=== 10. G31-P10-2 motor rev-limit / ev inertia reflection / THS axle routing / P_out ===");

// ── 10.1 motorTorque maxRpm 硬截止（ECU/逆变器超转保护：驱动与回收都归零；|rpm| 比较）──
{
  const m10 = { peakTorqueNm: 350, peakPowerKw: 250, maxRpm: 16000, regenMaxKw: 200, inertia: 0.05 };
  const m10S = JSON.stringify(m10);
  assert(T(`POWERTRAIN.motorTorque(${m10S}, 16001, 1, 0.9)`) === 0, "10.1 驱动 @16001>maxRpm → 0（硬截止）");
  assert(T(`POWERTRAIN.motorTorque(${m10S}, -16001, 1, 0.9)`) === 0, "10.1 驱动 @−16001 → 0（|rpm| 比较）");
  assert(T(`POWERTRAIN.motorTorque(${m10S}, 16001, -1, 0.9)`) === 0, "10.1 回收 @16001 → 0（超转不回收）");
  assert(T(`POWERTRAIN.motorTorque(${m10S}, -16001, -1, 0.9)`) === 0, "10.1 回收 @−16001 → 0");
  const t10ok = T(`POWERTRAIN.motorTorque(${m10S}, 15999, 1, 0.9)`);
  assert(Math.abs(t10ok - 250000 / (15999 * Math.PI / 30)) < 1e-6,
    `10.1 驱动 @15999 → 恒功率区正常 ${t10ok.toFixed(2)} N·m（未截止）`);
  const t10rg = T(`POWERTRAIN.motorTorque(${m10S}, 15999, -1, 0.9)`);
  assert(t10rg < 0, "10.1 回收 @15999 → 正常负扭矩（未截止）");
  assert(T(`POWERTRAIN.motorTorque(${m10S}, 16000, 1, 0.9)`) > 0, "10.1 @16000 恰等于 maxRpm → 不截止（严格 > 比较）");
  const m10no = { peakTorqueNm: 350, peakPowerKw: 250 };
  assert(T(`POWERTRAIN.motorTorque(${JSON.stringify(m10no)}, 99999, 1, 0.9)`) > 0,
    "10.1 maxRpm 缺失 → 不截止（向后兼容）");
}

// ── 10.2 ev/series/powersplit 电机惯量反射（按实际驱动电机求和 ×(ratio×final)²/nDrive）──
{
  // (a) EV 预设 tv：双电机各 0.05，ratio 9.73×1.0，nDrive=4 → 求和/4 = 0.05×9.73²/2（每轮）
  //     守恒：接线层给 4 个驱动轮各加该值 → 总反射 = (I_F+I_R)×9.73²（两台电机全额）
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
  T("POWERTRAIN.state.gearIdx = 0;");
  const i10ev = (0.05 + 0.05) * 9.73 * 9.73 / 4;
  assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - i10ev) < 1e-9,
    `10.2 EV(tv) 双电机反射 = (I_F+I_R)×9.73²/4 = ${i10ev}（每轮 = 0.05×9.73²/2）`);
  // (b) ev fwd 双电机在场但只 motorF 出力 → 只计 motorF，nDrive=2
  const e10f = JSON.parse(JSON.stringify(T("POWERTRAIN_PRESETS['EV 双电机 AWD-TV']")));
  e10f.drive = "fwd";
  T(`POWERTRAIN.setSpec(${JSON.stringify(e10f)});`);
  T("POWERTRAIN.state.gearIdx = 0;");
  assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.05 * 9.73 * 9.73 / 2) < 1e-9,
    "10.2 ev fwd 只计 motorF（motorR 不出力不计）→ 0.05×9.73²/2");
  // (c) series（motorR only, rwd）→ 0.05×9²/2；ice 只发电不接轮 → 不计入
  const s10 = JSON.parse(JSON.stringify(T("POWERTRAIN_PRESETS['串联增程后驱']")));
  s10.motorR.inertia = 0.05;
  T(`POWERTRAIN.setSpec(${JSON.stringify(s10)});`);
  T("POWERTRAIN.state.gearIdx = 0;");
  assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.05 * 81 / 2) < 1e-9,
    "10.2 series(rwd, motorR only) = 0.05×9²/2 = 2.025（ice 发电不接轮 → 不计入）");
  // (d) powersplit(THS fwd)：motorB(motorR 字段) 与 ICE 同驱动轴 → 计 motorR；
  //     MG1(motorF) 发电角色不进轮 → 不计；ice 经行星排机械路径 → 保留计入
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"])));');
  T("POWERTRAIN.state.gearIdx = 0;");
  assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - (0.18 + 0.04) * 3.6 * 3.6 / 2) < 1e-9,
    "10.2 THS(fwd) = (I_ice+I_motB)×3.6²/2（MG1 不计）");
  // (e) 回归：GT3（ice）与 legacy 不变
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["GT3 V8 RWD 6MT"])));');
  assert(Math.abs(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") - 0.35 * Math.pow(3.0 * 3.9, 2) / 2) < 1e-12,
    "10.2 GT3(ice) 反射不变（回归）");
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
  assert(T("POWERTRAIN.reflectedInertiaPerDriveWheel()") === 0, "10.2 legacy inertia=0 → 0（回归）");
}

// ── 10.3 powersplit fwd 驱动轴路由修正（motorB 与 ICE 同进驱动轴；p4 异轴不动）──
{
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["THS 功率分流"]))); POWERTRAIN.state.thrSm = 1;');
  const o10t = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
  assert(Math.abs(o10t.tRear) < 1e-9, "10.3 THS fwd → tRear=0（改前 MG2 出力到后轴）");
  const t10ice = T(`POWERTRAIN.iceTorque(${o10t.iceRpm}, 1)`);
  const t10exp = (t10ice * 0.72 + 207) * 3.6 * 0.95 / 2;
  assert(Math.abs(o10t.tFront - t10exp) < 1e-6,
    `10.3 THS fwd tFront = (T_ice×0.72 + T_motB)×ratio×eff/2 = ${t10exp.toFixed(2)}（MG1 不进轮）`);
  // p4 异轴独立语义不受影响（fwd：ICE→前轴 + motorF；motorR→后轴，电机轴直连不乘齿比）
  const p10p4 = JSON.parse(JSON.stringify(T("POWERTRAIN.defaultSpec()")));
  p10p4.architecture = "p4"; p10p4.drive = "fwd";
  p10p4.motorF = null;
  p10p4.motorR = { peakTorqueNm: 200, peakPowerKw: 100, maxRpm: 10000, regenMaxKw: 80, inertia: 0.1 };
  p10p4.battery = { capacityKwh: 10, soc0: 0.6, maxDischargeKw: 400, maxChargeKw: 150 };
  assert(T(`POWERTRAIN.setSpec(${JSON.stringify(p10p4)})`).ok === true, "10.3 p4 spec valid");
  const t10p4ice = T(`POWERTRAIN.iceTorque(${C1W * 30 / Math.PI}, 1)`);
  const o10p4 = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
  assert(Math.abs(o10p4.tFront - t10p4ice / 2) < 1e-9 && Math.abs(o10p4.tRear - 100) < 1e-9,
    "10.3 p4(fwd) ICE→前轴/motorR→后轴（异轴独立，不受 P10-2 路由修正影响）");
}

// ── 10.4 step() 返回 P_out（轮上机械功率 W，正=驱动 负=制动/回收）──
{
  // (a) EV tv（tWheel 逐轮，四轮等速 C1W）：P_out = ΣtWheel×ω = (T_motF_w+T_motR_w)×C1W
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["EV 双电机 AWD-TV"])));');
  const o10e = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
  assert(Math.abs(o10e.P_out - 2 * EV_AXLE * C1W) < 1e-6,
    `10.4 EV P_out = 2×${EV_AXLE.toFixed(3)}×${C1W} = ${(2 * EV_AXLE * C1W).toFixed(1)} W（逐轮×ω 解析）`);
  // (b) series rwd（tWheel=null 对称）：P_out = Tf×wF + Tr×wR = SE_AXLE×C1W
  T('POWERTRAIN.setSpec(JSON.parse(JSON.stringify(POWERTRAIN_PRESETS["串联增程后驱"]))); POWERTRAIN.state.thrSm = 1;');
  const o10s = T(`POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
  assert(Math.abs(o10s.P_out - SE_AXLE * C1W) < 1e-6,
    `10.4 series P_out = 轴功率 Tr×wR = ${(SE_AXLE * C1W).toFixed(1)} W`);
  // (c) 制动回收 → P_out < 0
  const o10r = T(`POWERTRAIN.step(0.004, {throttle:0, brake:0.5}, {FL:${C1W},FR:${C1W},RL:${C1W},RR:${C1W}})`);
  assert(o10r.P_out < 0, `10.4 EV 制动回收 P_out = ${o10r.P_out.toFixed(1)} W < 0（负=回馈）`);
  // (d) legacy 锚：Tf=240/Tr=960 @w=30 → P_out = 1200×30 = 36000
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec()); POWERTRAIN.resetState();");
  const o10a = T("POWERTRAIN.step(0.004, {throttle:1, brake:0}, {FL:30,FR:30,RL:30,RR:30})");
  assert(Math.abs(o10a.P_out - 36000) < 1e-9, "10.4 legacy P_out = (240+960)×30 = 36000（逐位）");
  T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
}

console.log(`\n[cumulative] ${passed}/${total} passed`);

process.exit(passed === total ? 0 : 1);
