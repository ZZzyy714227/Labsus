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
// type="cvt" → 拒绝（未知类型不在白名单）
const cvtSpec = JSON.parse(JSON.stringify(gb6)); cvtSpec.gearbox.type = "cvt";
T(`POWERTRAIN.setSpec(${JSON.stringify(cvtSpec)}); POWERTRAIN.state.gearIdx = 1; POWERTRAIN.state.shiftT = 0; POWERTRAIN.state.shiftDir = 0;`);
T("POWERTRAIN.autoShift(0.99 * 9000);");
assert(T("POWERTRAIN.state.shiftT") === 0, "P3 autoShift type=cvt → no shift (白名单外)");
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

T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");

console.log(`\n[cumulative] ${passed}/${total} passed`);

process.exit(passed === total ? 0 : 1);
