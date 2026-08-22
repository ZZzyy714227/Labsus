// Test PROD scenario by loading the HTML and running buildMech
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = "C:\\Users\\zzy\\Desktop\\New_suspension\\dwb-mod\\double-wishbone-suspension.html";
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(2); }
const code = m[1];

// DOM stubs (simplified from harness)
function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], style: {}, dataset: {}, _cls: new Set(),
    value: "", min: "", max: "", step: "", type: "", title: "", id: "",
    textContent: "", innerHTML: "",
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      toggle: (c, f) => {
        const has = el._cls.has(c);
        const want = f === undefined ? !has : !!f;
        want ? el._cls.add(c) : el._cls.delete(c);
        return want;
      },
      contains: c => el._cls.has(c)
    },
    appendChild(ch) { el.children.push(ch); ch.parentElement = el; return ch; },
    querySelector(sel) {
      if (sel === "canvas") { if (!el._cv) el._cv = makeEl("canvas"); return el._cv; }
      return null;
    },
    querySelectorAll() {
      if (!el._btns) el._btns = [makeEl("button"), makeEl("button")];
      return el._btns;
    },
    addEventListener() {}, focus() {}, click() {},
    getBoundingClientRect: () => ({ width: 430, height: 290, left: 0, top: 0 }),
    clientWidth: 300, clientHeight: 86,
    files: []
  };
  if (tag === "canvas") {
    Object.defineProperty(el, "getContext", { value: () => new Proxy({}, {
      get(t, p) {
        if (p === "measureText") return (s) => ({ width: String(s).length * 5 });
        if (p === "canvas") return el;
        return () => undefined;
      },
      set(t, p, v) { t[p] = v; return true; }
    }) });
    el.width = 0; el.height = 0;
  }
  return el;
}

const els = {};
const documentStub = {
  createElement: t => makeEl(t),
  getElementById: id => (els[id] ||= makeEl("div")),
  activeElement: null,
  body: makeEl("body")
};

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
}

let rafCb = null;
const store = makeStorage();
const sandbox = {
  console,
  performance,
  document: documentStub,
  localStorage: store,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  setTimeout: (fn, ms) => 0,
  clearTimeout: () => {},
  alert: msg => console.log("[alert]", msg),
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  FileReader: class { readAsText() { if (this.onload) this.onload({ target: { result: "{}" } }); } },
  devicePixelRatio: 1,
  addEventListener: () => {},
  window: null,  // will self-reference below
  Math, Date, JSON, isNaN, parseFloat, parseInt, Object, Array, String, Number, Boolean,
  Map, Set, RegExp, Error, TypeError, RangeError, SyntaxError, ReferenceError,
  parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity, Symbol,
  WeakMap, WeakSet, Promise, Proxy, Reflect, DataView, ArrayBuffer,
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array,
  Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array,
  BigInt, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController,
  AbortSignal, Event, EventTarget, performance
};

const ctx = vm.createContext(sandbox);

// Set window to self-reference
sandbox.window = sandbox;

// Run the page script
vm.runInContext(code, ctx, { filename: "dwb-inline.js" });

// Now test PROD by finding it by name
console.log("=== Testing PROD scenario ===");
console.log("PRESET_KEYS:", ctx.PRESET_KEYS);

// Find PROD index
const prodIdx = ctx.PRESET_KEYS.findIndex(k => k.includes("PROD"));
console.log("PROD index:", prodIdx);

// Load PROD preset
vm.runInContext(`
  loadPreset(PRESET_KEYS[${prodIdx}]);
  persistState();
`, ctx);

// Build front mechanism
console.log("\n--- Building front mechanism ---");
const frontM = vm.runInContext(`buildMech("front")`, ctx);
console.log("Front M.cl length:", frontM.cl.length);
console.log("Front M.cl names:", frontM.cl.map(c => c.name));
console.log("Front M.L length:", frontM.L.length);

// Check for PR_L_rod in front links
const frontRod = frontM.L.find(l => l.id === "PR_L_rod");
console.log("Front PR_L_rod found:", !!frontRod);
if (frontRod) {
  console.log("  a:", frontRod.a, "b:", frontRod.b, "type:", frontRod.type, "zh:", frontRod.zh);
}

// Check damper re-anchored
const frontDamper = frontM.L.find(l => l.grp === "damper");
console.log("Front damper found:", !!frontDamper);
if (frontDamper) {
  console.log("  a:", frontDamper.a, "b:", frontDamper.b);
}

// Check ROCKER cluster
const frontRocker = frontM.cl.find(c => c.name === "ROCKER");
console.log("Front ROCKER found:", !!frontRocker);
if (frontRocker) {
  console.log("  axA:", frontRocker.axA, "axB:", frontRocker.axB);
  console.log("  ids:", frontRocker.ids);
}

// Build rear mechanism
console.log("\n--- Building rear mechanism ---");
const rearM = vm.runInContext(`buildMech("rear")`, ctx);
console.log("Rear M.cl length:", rearM.cl.length);
console.log("Rear M.cl names:", rearM.cl.map(c => c.name));
console.log("Rear M.L length:", rearM.L.length);

// Check for PR_U_rod in rear links
const rearRod = rearM.L.find(l => l.id === "PR_U_rod");
console.log("Rear PR_U_rod found:", !!rearRod);
if (rearRod) {
  console.log("  a:", rearRod.a, "b:", rearRod.b, "type:", rearRod.type, "zh:", rearRod.zh);
}

// Check damper re-anchored
const rearDamper = rearM.L.find(l => l.grp === "damper");
console.log("Rear damper found:", !!rearDamper);
if (rearDamper) {
  console.log("  a:", rearDamper.a, "b:", rearDamper.b);
}

// Check ROCKER cluster
const rearRocker = rearM.cl.find(c => c.name === "ROCKER");
console.log("Rear ROCKER found:", !!rearRocker);
if (rearRocker) {
  console.log("  axA:", rearRocker.axA, "axB:", rearRocker.axB);
  console.log("  ids:", rearRocker.ids);
}

// Test 300 frames simulation
console.log("\n--- Running 300 frames ---");
vm.runInContext(`
  S.exc = "sine";
  S.travel = 0;
  VW.forEach(v => { sizeView(v); fitView(v); });
`, ctx);

let errors = [];
for (let i = 0; i < 300; i++) {
  try {
    vm.runInContext(`loop(${1000 + i * 16.7})`, ctx);
  } catch (e) {
    errors.push({ frame: i, error: e.message });
    if (errors.length > 5) break; // Stop after 5 errors
  }
}

console.log("Frames run: 300");
console.log("Errors:", errors.length);
if (errors.length > 0) {
  console.log("First errors:", errors.slice(0, 3));
} else {
  console.log("✓ No errors during 300-frame simulation");
}

// Final check: sim result
const simResult = vm.runInContext(`SIM.R ? SIM.R.res : -1`, ctx);
console.log("Final residual:", simResult);
console.log("=== PROD test complete ===");