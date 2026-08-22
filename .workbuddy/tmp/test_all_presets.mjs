// Test all presets for 300-frame stability
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = "C:\\Users\\zzy\\Desktop\\New_suspension\\dwb-mod\\double-wishbone-suspension.html";
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(2); }
const code = m[1];

function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], style: {}, dataset: {}, _cls: new Set(),
    value: "", min: "", max: "", step: "", type: "", title: "", id: "",
    textContent: "", innerHTML: "",
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      toggle: (c, f) => { const has = el._cls.has(c); const want = f === undefined ? !has : !!f; want ? el._cls.add(c) : el._cls.delete(c); return want; },
      contains: c => el._cls.has(c)
    },
    appendChild(ch) { el.children.push(ch); ch.parentElement = el; return ch; },
    querySelector(sel) {
      if (sel === "canvas") { if (!el._cv) el._cv = makeEl("canvas"); return el._cv; }
      return null;
    },
    querySelectorAll() { if (!el._btns) el._btns = [makeEl("button"), makeEl("button")]; return el._btns; },
    addEventListener() {}, focus() {}, click() {},
    getBoundingClientRect: () => ({ width: 430, height: 290, left: 0, top: 0 }),
    clientWidth: 300, clientHeight: 86, files: []
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
class RO { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} }
const els = {};
const documentStub = {
  createElement: t => makeEl(t),
  getElementById: id => (els[id] ||= makeEl("div")),
  activeElement: null, body: makeEl("body")
};
function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}
function makeVMContext(store) {
  const sandbox = {
    console, performance,
    document: documentStub, localStorage: store, ResizeObserver: RO,
    requestAnimationFrame: cb => 1,
    setTimeout: (fn, ms) => 0, clearTimeout: () => {},
    alert: msg => console.log("[alert]", msg),
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
    FileReader: class { readAsText() { if (this.onload) this.onload({ target: { result: "{}" } }); } },
    devicePixelRatio: 1, addEventListener: () => {},
    Math, Date, JSON, isNaN, parseFloat, parseInt, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, RangeError, Promise, Symbol, Map, Set, WeakMap, WeakSet,
    Uint8Array, Float32Array, Float64Array, ArrayBuffer, isFinite, encodeURIComponent, decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

const driverCode = `
;globalThis.__H = (function(){
  let err=null, errStack=null;
  return {
    get err(){return err}, get errStack(){return errStack},
    testPreset(key, n){
      try {
        loadPreset(key);
        rebuild(); initViews();
        simulate(0.016); simulate(0.016);
        const M = buildMech("front");
        const Mr = buildMech("rear");
        // run n frames
        let ts=1000;
        for(let i=0;i<n;i++){ loop(ts); ts+=16.7; }
        return {
          ok: true,
          err: null,
          preset: S.preset,
          frontCL: M.cl.map(c=>c.name),
          frontRod: M.L.filter(l=>l.grp==="rod").map(l=>l.id),
          frontRocker: !!M.cl.find(c=>c.name==="ROCKER"),
          rearCL: Mr.cl.map(c=>c.name),
          rearRod: Mr.L.filter(l=>l.grp==="rod").map(l=>l.id),
          rearRocker: !!Mr.cl.find(c=>c.name==="ROCKER"),
          res: +(SIM.R?SIM.R.res:-1).toFixed(4)
        };
      } catch(e) {
        return { ok: false, err: e.message, stack: e.stack };
      }
    },
  };
})();`;

const store = makeStorage();
const ctx = makeVMContext(store);
vm.runInContext(code + driverCode, ctx, { filename: "dwb-inline.js" });

const keys = vm.runInContext("PRESET_KEYS", ctx);
console.log("All presets:", keys);
console.log("");

for (const key of keys) {
  const result = vm.runInContext(`__H.testPreset("${key.replace(/"/g, '\\"')}", 300)`, ctx, { timeout: 300000 });
  const icon = result.ok ? "✅" : "❌";
  console.log(`${icon} ${key}: ok=${result.ok} frames=300 res=${result.res}`);
  if (result.frontRocker) console.log(`   front: ROCKER ✅ rod=${JSON.stringify(result.frontRod)}`);
  if (result.rearRocker) console.log(`   rear:  ROCKER ✅ rod=${JSON.stringify(result.rearRod)}`);
  if (!result.ok) console.log(`   ERROR: ${result.err}`);
  console.log("");
}
