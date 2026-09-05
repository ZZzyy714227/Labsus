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
assert(T("POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'p2',motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000}})).ok") === true, "M-3 p2 with motorF valid");
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
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000}}));");
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
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mGood)},motorR:null})).ok`) === true, "I-1 baseRpm=4775 consistent → accepted");
// 无 baseRpm 不校验
const mNoBase = { peakTorqueNm: 300, peakPowerKw: 150, maxRpm: 12000 };
assert(T(`POWERTRAIN.validate(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:${JSON.stringify(mNoBase)},motorR:null})).ok`) === true, "I-1 no baseRpm → skip check");

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
T("POWERTRAIN.setSpec(Object.assign(POWERTRAIN.defaultSpec(),{architecture:'ev',ice:null,motorF:{peakTorqueNm:300,peakPowerKw:150,maxRpm:16000}}));");
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
// 反射惯量：(I_ice+I_motCoupled)×(ratio×final)²/2
const riSpec = JSON.parse(JSON.stringify(gbSpec));
riSpec.ice.inertia = 0.25; riSpec.architecture = "p2";
riSpec.motorR = { peakTorqueNm: 200, peakPowerKw: 100, baseRpm: 4775, maxRpm: 10000, regenMaxKw: 80, inertia: 0.1 };
const r1 = T(`POWERTRAIN.setSpec(${JSON.stringify(riSpec)})`);
assert(r1.ok === true, "p2 spec valid");
T("POWERTRAIN.state.gearIdx = 0;");
const expectRI = (0.25 + 0.1) * (3 * 3.9) ** 2 / 2;
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - expectRI) < 1e-9, "reflected inertia p2 gear0");
// 反射惯量随挡位变化（gear3: 1.2×3.9）
T("POWERTRAIN.state.gearIdx = 3;");
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - (0.25 + 0.1) * (1.2 * 3.9) ** 2 / 2) < 1e-9, "reflected inertia p2 gear3");
// p3 电机不在曲轴链 → 只计 ICE 惯量
const p3Spec = JSON.parse(JSON.stringify(riSpec));
p3Spec.architecture = "p3";
T(`POWERTRAIN.setSpec(${JSON.stringify(p3Spec)}); POWERTRAIN.state.gearIdx = 0;`);
assert(Math.abs(T("POWERTRAIN.reflectedInertia()") - 0.25 * (3 * 3.9) ** 2 / 2) < 1e-9, "reflected inertia p3 excludes motor");
// legacy 默认：inertia=0 → 0（锚）
T("POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());");
assert(T("POWERTRAIN.reflectedInertia()") === 0, "legacy reflected inertia zero (anchor)");
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

console.log(`\n[cumulative] ${passed}/${total} passed`);

process.exit(passed === total ? 0 : 1);
