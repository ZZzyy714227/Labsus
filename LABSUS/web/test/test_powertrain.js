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

console.log(`\n[cumulative] ${passed}/${total} passed`);

process.exit(passed === total ? 0 : 1);
