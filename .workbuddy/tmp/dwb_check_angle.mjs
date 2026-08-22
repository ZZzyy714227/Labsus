// Quick check: pushrod angle, MR, and rocker geometry for new FSR-06
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = process.argv[2];
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(2); }
const code = m[1];

function makeCtx(cv) {
  return new Proxy({}, {
    get(t, p) {
      if (p === "measureText") return (s) => ({ width: String(s).length * 5 });
      if (p === "canvas") return cv;
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
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
    querySelector(sel) { if (sel === "canvas") { if (!el._cv) el._cv = makeEl("canvas"); return el._cv; } return null; },
    querySelectorAll() { if (!el._btns) { el._btns = [makeEl("button"), makeEl("button")]; } return el._btns; },
    addEventListener() {}, focus() {}, click() {},
    getBoundingClientRect: () => ({ width: 430, height: 290, left: 0, top: 0 }),
    clientWidth: 300, clientHeight: 86, files: []
  };
  if (tag === "canvas") {
    Object.defineProperty(el, "getContext", { value: () => makeCtx(el) });
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
    _dump: () => Object.fromEntries(map)
  };
}
function makeVMContext(store) {
  let rafCb = null;
  const sandbox = {
    console, performance, document: documentStub, localStorage: store,
    ResizeObserver: RO,
    requestAnimationFrame: cb => { rafCb = cb; return 1; },
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
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  ctx.__getRaf = () => rafCb;
  return ctx;
}

const DRIVER = `
;globalThis.__H = (function(){
  let err=null, errStack=null;
  return {
    get err(){return err}, get errStack(){return errStack},
    boot(){
      try{
        buildLeft();buildRight();
        const loaded=loadPersist();
        rebuild(); initViews();
        simulate(0.016);simulate(0.016);
        S.exc="sine";S.travel=0;
        VW.forEach(v=>{sizeView(v);fitView(v);});
        return {loaded, preset:S.preset};
      }catch(e){err=e;errStack=e&&e.stack;return null;}
    },
    checkAngle(){
      loadPreset(PRESET_KEYS.find(k=>k==="FSR-06 前推后拉正式版")||PRESET_KEYS[0]);
      const hp=S.hp;
      const prL=hp.PR_L, rkB=hp.RK_B, rkPiv=hp.RK_PIVOT, rkA=hp.RK_A, dmpT=hp.DMP_T;

      // Pushrod angle (PR_L → RK_B in XZ plane)
      const dx=rkB[0]-prL[0], dz=rkB[2]-prL[2];
      const pushrodAngle=Math.atan2(Math.abs(dz),Math.abs(dx))*180/Math.PI;

      // Rocker radius
      const rkrRadius=Math.hypot(rkB[0]-rkPiv[0],rkB[1]-rkPiv[1],rkB[2]-rkPiv[2]);

      // RK_A arm length (damper arm)
      const rkADist=Math.hypot(rkA[0]-rkPiv[0],rkA[1]-rkPiv[1],rkA[2]-rkPiv[2]);

      // MR = damper arm / pushrod arm (approximate)
      const rkBDist=rkrRadius;
      const mr=rkADist/rkBDist;

      // Build front mech and compute MR from metrics
      const M=buildMech("front");
      resetMech(M); setChassis(M,0);
      const z0=M.n[M.i.WC].p0[2];

      // Drive to +20mm (compression) and measure damper travel
      resetMech(M); setChassis(M,0);
      driveTo(M, z0+20, 0);
      const mUp=metrics(M);
      const slUp=mUp.sl;

      // Drive to -20mm (rebound) and measure damper travel
      resetMech(M); setChassis(M,0);
      driveTo(M, z0-20, 0);
      const mDn=metrics(M);
      const slDn=mDn.sl;

      // Reset to design
      resetMech(M); setChassis(M,0);
      const m0=metrics(M);
      const sl0=m0.sl;

      // MR from damper travel difference
      const mrUp=(sl0-slUp)/20;  // damper compression per mm wheel compression
      const mrDn=(slDn-sl0)/20;  // damper extension per mm wheel extension

      return {
        pushrodAngle:+pushrodAngle.toFixed(1),
        rkrRadius:+rkrRadius.toFixed(1),
        rkADist:+rkADist.toFixed(1),
        mrApprox:+mr.toFixed(3),
        mrFromSim:{up:+mrUp.toFixed(4), dn:+mrDn.toFixed(4)},
        slDesign:+sl0.toFixed(2),
        rkPivot:rkPiv, rkB:rkB, rkA:rkA, prL:prL, dmpT:dmpT,
        geo:SIM.geo&&SIM.geo.map(x=>+x.toFixed(1)),
        geoRR:SIM.geoRR&&SIM.geoRR.map(x=>+x.toFixed(1))
      };
    }
  };
})();`;

const store = makeStorage();
const ctx = makeVMContext(store);
vm.runInContext(code + DRIVER, ctx, { filename: "dwb-check.js" });
const bootInfo = vm.runInContext("__H.boot()", ctx, { timeout: 120000 });
console.log("[boot]", JSON.stringify(bootInfo));
if (bootInfo) {
  const r = vm.runInContext("JSON.stringify(__H.checkAngle())", ctx, { timeout: 120000 });
  console.log("[angle]", r);
}
