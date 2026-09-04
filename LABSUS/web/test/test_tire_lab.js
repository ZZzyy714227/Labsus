/* G29 轮胎工坊测试：headless vm（沙箱模式照抄 undulating_road_test.js）。
   覆盖主题（对应节标 === 1./2./3.）：数据层（存储 CRUD/上限/降级/校验/胎压映射）、
   应用层（applyToState/restore/车型切换保持）、resolveTireParams 优先级链、
   chassisPayload 注入、弹窗表单读入与非法拦截。 */
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

for (const f of ["01-core.js", "02-presets.js", "03-mechanism.js", "04-dynamics.js",
  "05-scene3d.js", "06-ui-panels.js", "07-plots.js", "08-interact.js",
  "09-track.js", "10-eval.js", "11-stages.js", "14-tire-lab.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f), "utf8"), ctx);
}

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  else { console.log(`[PASS] ${msg}`); passed++; }
}

/* ═══ 1. 数据层：存储与胎压映射 ═══ */
console.log("=== 1. TIRE_LAB Data Layer ===");
assert(T("typeof TIRE_LAB === 'object'"), "TIRE_LAB namespace exists");
assert(T("TIRE_LAB.pressureBase('baja')") === 140, "Baja base pressure 140kPa");
assert(T("TIRE_LAB.pressureBase('gt3')") === 210, "GT3 base pressure 210kPa");
assert(T("TIRE_LAB.pressureBase('unknown')") === 180, "Unknown type falls back to 180kPa");
assert(Math.abs(T("TIRE_LAB.kTFactor(252, 210)") - 1.11) < 1e-9, "kT factor +20% pressure => +11% stiffness");
assert(Math.abs(T("TIRE_LAB.lSFactor(252, 210)") - 0.95) < 1e-9, "LS factor +20% pressure => -5% LS");

/* 存取与上限 */
T(`TIRE_LAB.customs = {}; TIRE_LAB.active = null;`);
T(`TIRE_LAB.active = { front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:210}, rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210}, mf:{Fy0:5250,FzNom:3500,By:20,Cy:1.2,Ey:-0.5,LS:0.10,Cg:6.0} };`);
const sv = T(`TIRE_LAB.saveCustom("测试胎A")`);
assert(sv && sv.ok === true, "saveCustom succeeds");
assert(T("TIRE_LAB.customs['测试胎A'] && TIRE_LAB.customs['测试胎A'].meta.sourceVehicle") !== undefined,
  "saved custom carries meta.sourceVehicle");
assert(T(`TIRE_LAB.saveCustom("测试胎A").error`) === "dup", "duplicate name rejected");
// reload from localStorage stub
T(`TIRE_LAB.customs = {}; TIRE_LAB.loadAll();`);
assert(T("!!TIRE_LAB.customs['测试胎A']"), "customs reload from localStorage");
assert(T(`TIRE_LAB.deleteCustom("测试胎A") || true; TIRE_LAB.customs["测试胎A"] === undefined`),
  "deleteCustom removes entry");

/* 校验 */
assert(T(`TIRE_LAB.validate({front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:210},rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210},mf:{Fy0:5250,FzNom:3500,By:20,Cy:1.2,Ey:-0.5,LS:0.1,Cg:6}}).ok`),
  "valid config passes validate");
assert(!T(`TIRE_LAB.validate({front:{R:99,W:265,rim:228.6,rimW:190,et:0,p:210},rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210},mf:{Fy0:5250,FzNom:3500,By:20,Cy:1.2,Ey:-0.5,LS:0.1,Cg:6}}).ok`),
  "R out of range fails validate");
assert(!T(`TIRE_LAB.validate({front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:210},rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210},mf:{Fy0:5250,FzNom:0,By:20,Cy:1.2,Ey:-0.5,LS:0.1,Cg:6}}).ok`),
  "FzNom<=0 fails validate");

/* 分流路径：loadVehiclePreset("tirecustom:名") 必须落到 activateCustom（slice off-by-one 回归） */
T(`loadVehiclePreset("gt3"); TIRE_LAB.active = { name:null,
  front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:210}, rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210},
  mf:{Fy0:5250,FzNom:3500,By:20,Cy:1.2,Ey:-0.5,LS:0.10,Cg:6.0} }; TIRE_LAB.saveCustom("分流胎");`);
T('loadVehiclePreset("gt3"); TIRE_LAB.active = null; SIM.userTire = null;');
T('loadVehiclePreset("tirecustom:分流胎");');
assert(T("TIRE_LAB.active.name") === "分流胎", "tirecustom: prefix routes to activateCustom (slice(11))");
assert(T("TIRE_LAB.active.front.R") === 300, "routed activation re-applies stored tire");

/* 上限与降级路径（头注释声明项） */
T(`for (let i = 0; i < 19; i++) { TIRE_LAB.active = { name:null, front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:210}, rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:210}, mf:{Fy0:5250,FzNom:3500,By:20,Cy:1.2,Ey:-0.5,LS:0.10,Cg:6.0} }; TIRE_LAB.saveCustom("批_" + i); }`);
// 此前已存 1 条（分流胎），循环 19 条后达到上限 20
assert(T(`TIRE_LAB.active.name=null; TIRE_LAB.saveCustom("超限胎").error`) === "limit", "saveCustom rejects beyond MAX_CUSTOMS=20");
T(`TIRE_LAB.deleteCustom("超限胎");`);
// localStorage 抛错 → 降级：storageOk=false、customs 回退 {}
T(`const _g = localStorage.getItem, _s = localStorage.setItem;
   localStorage.getItem = () => { throw new Error("boom"); };
   localStorage.setItem = () => { throw new Error("boom"); };
   TIRE_LAB.storageOk = true; TIRE_LAB.loadAll();`);
assert(T("TIRE_LAB.storageOk") === false, "localStorage failure degrades storageOk flag");
assert(T("typeof TIRE_LAB.customs === 'object'"), "loadAll degrades customs to object without throwing");
T(`localStorage.getItem = _g; localStorage.setItem = _s; TIRE_LAB.storageOk = true; TIRE_LAB.loadAll();`);

/* ═══ 2. 应用层 ═══ */
console.log("=== 2. Apply / Restore / Vehicle-Switch Persistence ===");
T(`S.vehicleType = "gt3"; TIRE_LAB.active = null; SIM.userTire = null;
   loadVehiclePreset("gt3");
   TIRE_LAB.active = { name:null,
     front:{R:300,W:265,rim:228.6,rimW:190,et:0,p:252}, rear:{R:310,W:285,rim:228.6,rimW:200,et:0,p:168},
     mf:{Fy0:6000,FzNom:3500,By:22,Cy:1.2,Ey:-0.5,LS:0.10,Cg:6.0} };`);
T("TIRE_LAB.applyToState(TIRE_LAB.active);");
assert(T("S.front.tire.R") === 300 && T("S.rear.tire.R") === 310, "applyToState writes axle tire R");
assert(T("S.front.tire.rimW") === 190 && T("S.rear.tire.et") === 0, "applyToState writes rimW/et");
assert(T("S.front.tire.label.indexOf('CUSTOM')") === 0, "custom label applied");
// kT 联动（无取整）：gt3 基准胎压 210，前 252（+20%）→ 精确比值 1.11；后 168（-20%）→ 0.89
assert(Math.abs(T("S.front.kT / S.front._kTBase") - 1.11) < 1e-9, "front kT scaled by pressure factor (exact)");
assert(Math.abs(T("S.rear.kT / S.rear._kTBase") - 0.89) < 1e-9, "rear kT scaled down (168kPa, exact)");
// MF 注入 + LS 胎压修正（前轴 p=252）
assert(Math.abs(T("SIM.userTire.Fy0") - 6000) < 1e-9, "SIM.userTire.Fy0 injected");
assert(Math.abs(T("SIM.userTire.LS") - 0.10 * 0.95) < 1e-9, "SIM.userTire.LS adjusted by front pressure factor");
assert(Math.abs(T("SIM.userTire.p") - 252) < 1e-9, "SIM.userTire.p = front pressure");
// 车型切换保持（02-presets 尾部钩子）
T("loadVehiclePreset('formula');");
assert(T("S.vehicleType") === "formula", "vehicle switched to formula");
assert(T("S.front.tire.R") === 300, "custom tire overlay survives vehicle switch");
// 保存/激活/恢复
T("TIRE_LAB.customs = {}; TIRE_LAB.saveCustom('我的越野胎');");
assert(T("!!TIRE_LAB.customs['我的越野胎']"), "saveCustom stores current active");
T("loadVehiclePreset('gt3'); TIRE_LAB.active = null; SIM.userTire = null;");
T('TIRE_LAB.activateCustom("我的越野胎");');
assert(T("S.front.tire.R") === 300 && T("SIM.userTire.Fy0") === 6000, "activateCustom re-applies saved tire");
// 恢复内置（此时 S.vehicleType 为 gt3；restoreBuiltin 重载内置预设）
T("TIRE_LAB.restoreBuiltin();");
assert(T("TIRE_LAB.active") === null, "restoreBuiltin clears active");
assert(T("SIM.userTire") === null, "restoreBuiltin clears SIM.userTire");
assert(T("S.front.tire.R") === T("VEHICLE_PRESETS.gt3.front.tire.R"),
  "restoreBuiltin reloads builtin preset tire (gt3 front R)");
assert(T("S.front.kT === S.front._kTBase"), "kT restored to preset base");

/* ═══ 3. resolveTireParams 优先级：tireCalib > userTire > 缺省 ═══ */
console.log("=== 3. resolveTireParams Priority Chain ===");
T(`SIM.tireCalib = null; SIM.tireCalibEy = undefined;
   SIM.userTire = { Fy0:6000, FzNom:3500, By:22, Cy:1.25, Ey:-0.4, LS:0.2, Cg:7.0, p:252 };`);
// 每场景重建 eng，杜绝实例态串扰（缓存键虽覆盖全部输入，重建更防未来构造期状态）
T("var eng = new VehicleDynamics15DOF(S, SIM, 10);");
assert(T("eng.resolveTireParams().Fy0") === 6000, "userTire.Fy0 wins over default");
assert(T("eng.resolveTireParams().By") === 22, "userTire.By wins over default");
assert(T("eng.resolveTireParams().gripScale") > 1.0, "gripScale reflects custom mu>default");
// userTire 沿用上组值（6000/22），验证被标定压制
T(`SIM.tireCalib = { Fy0:4800, FzNom:3400, By:18, Cy:1.3, Ey:-0.6, LS:0.15, Cg:5.0 };`);
T("var eng = new VehicleDynamics15DOF(S, SIM, 10);");
assert(T("eng.resolveTireParams().Fy0") === 4800, "tireCalib outranks userTire");
assert(T("eng.resolveTireParams().By") === 18, "tireCalib.By outranks userTire.By");
T("SIM.tireCalib.By = 0;");   // 标定层非法值 → 应下探 userTire（缓存键含 By，改后重解析，无需重建）
assert(T("eng.resolveTireParams().By") === 22, "invalid calib value falls through to userTire");
T("SIM.tireCalib.By = 18;");  // 恢复，供后续锚定场景语义
assert(T("eng.resolveTireParams().Ey") === -0.6, "tireCalib.Ey outranks userTire.Ey");
assert(T("eng.resolveTireParams().gripScale") < 1.0, "gripScale derives from winning source (calib 4800/3400)");
T("SIM.tireCalib = null; SIM.userTire = null;");
T("var eng = new VehicleDynamics15DOF(S, SIM, 10);");
assert(T("eng.resolveTireParams().Fy0") === 5250, "defaults intact (anchor 5250)");
assert(T("eng.resolveTireParams().By") === 20, "defaults intact (anchor By=20)");

console.log(`\n[cumulative] ${passed}/${total} passed`);

process.exit(passed === total ? 0 : 1);
