/* G29 轮胎工坊测试：headless vm（沙箱模式照抄 undulating_road_test.js）。
   1. 数据层：存储 CRUD/上限/降级  2. 校验  3. 胎压映射
   4. 应用层：applyToState/restore/车型切换保持  5. resolveTireParams 优先级
   6. chassisPayload 注入  7. 弹窗表单读入与非法拦截  */
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
assert(Math.abs(T("TIRE_LAB.kTFactor(252, 210)") - 1.11) < 1e-9, "kT factor +10% pressure => +5.5% stiffness");
assert(Math.abs(T("TIRE_LAB.lSFactor(252, 210)") - 0.95) < 1e-9, "LS factor +10% pressure => -2.5% LS");

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

console.log(`\n[Part1] ${passed}/${total} passed`);

/* Part2-7 占位（后续任务追加） */
process.exit(passed === total ? 0 : 1);
