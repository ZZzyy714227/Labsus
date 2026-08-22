// Direct PROD verification: load page script, switch to PROD by name, buildMech, check rod + run 300 frames.
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = "C:\\Users\\zzy\\Desktop\\New_suspension\\dwb-mod\\double-wishbone-suspension.html";
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(2); }
const code = m[1];

/* ---- DOM stubs ---- */
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
  activeElement: null,
  body: makeEl("body")
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
  let rafCb = null;
  const sandbox = {
    console, performance,
    document: documentStub,
    localStorage: store,
    ResizeObserver: RO,
    requestAnimationFrame: cb => { rafCb = cb; return 1; },
    setTimeout: (fn, ms) => 0,
    clearTimeout: () => {},
    alert: msg => console.log("[alert]", msg),
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
    FileReader: class { readAsText() { if (this.onload) this.onload({ target: { result: "{}" } }); } },
    devicePixelRatio: 1,
    addEventListener: () => {},
    Math, Date, JSON, isNaN, parseFloat, parseInt, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, RangeError, Promise, Symbol, Map, Set, WeakMap, WeakSet,
    Uint8Array, Float32Array, Float64Array, ArrayBuffer, isFinite, encodeURIComponent, decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  ctx.__getRaf = () => rafCb;
  return ctx;
}

/* ---- Phase 1: boot ---- */
const store = makeStorage();
const ctx = makeVMContext(store);

const driverCode = `
;globalThis.__H = (function(){
  let err=null, errStack=null;
  return {
    get err(){return err}, get errStack(){return errStack},
    state:null, sim:null, views:null,
    boot(){
      try{
        buildLeft();buildRight();
        const loaded=loadPersist();
        rebuild();
        initViews();
        simulate(0.016);simulate(0.016);
        S.exc="sine";S.travel=0;
        VW.forEach(v=>{sizeView(v);fitView(v);});
        this.state=S; this.sim=SIM; this.views=VW;
        return {loaded, preset:S.preset, axleView:S.axleView};
      }catch(e){err=e;errStack=e&&e.stack;return null;}
    },
    runFrames(n){
      let ts=1000; const times=[];
      for(let i=0;i<n;i++){
        try{ loop(ts); }catch(e){ err=e; errStack=e&&e.stack; break; }
        ts+=16.7; times.push(performance.now());
      }
      return {n:times.length, play:S.play, t:+S.t.toFixed(2),
              res:+(SIM.R?SIM.R.res:-1).toFixed(4)};
    },
  };
})();`;

vm.runInContext(code + driverCode, ctx, { filename: "dwb-inline.js" });

const bootInfo = vm.runInContext("__H.boot()", ctx, { timeout: 120000 });
console.log("[boot]", JSON.stringify(bootInfo));

const err0 = vm.runInContext("__H.errStack", ctx);
if (err0) { console.error("\n=== BOOT EXCEPTION ===\n" + err0); process.exit(1); }

/* ---- Phase 2: Switch to PROD by name ---- */
console.log("\n=== Switching to PROD preset ===");
vm.runInContext(`
  const prodKey = PRESET_KEYS.find(k => k.includes("PROD"));
  console.log("Found PROD key:", prodKey);
  loadPreset(prodKey);
  rebuild();
  initViews();
  simulate(0.016);
  simulate(0.016);
`, ctx);

const presetNow = vm.runInContext("S.preset", ctx);
console.log("Current preset:", presetNow);

/* ---- Phase 3: Build front & rear mechanisms, inspect ---- */
console.log("\n=== Building front mechanism ===");
const frontM = vm.runInContext(`
  (function(){
    const M = buildMech("front");
    return {
      clNames: M.cl.map(c=>c.name),
      clCount: M.cl.length,
      rodLinks: M.L.filter(l=>l.grp==="rod").map(l=>({id:l.id, a:l.a, b:l.b, zh:l.zh})),
      damperLinks: M.L.filter(l=>l.grp==="damper").map(l=>({id:l.id, a:l.a, b:l.b})),
      rockerCluster: M.cl.find(c=>c.name==="ROCKER") || null,
      hasPR_L_rod: M.L.some(l=>l.id==="PR_L_rod"),
    };
  })()
`, ctx);
console.log("Front cl:", frontM.clCount, "names:", frontM.clNames);
console.log("Front rod links:", JSON.stringify(frontM.rodLinks));
console.log("Front damper:", JSON.stringify(frontM.damperLinks));
console.log("Front ROCKER:", frontM.rockerCluster ? "YES" : "NO");
console.log("Front has PR_L_rod:", frontM.hasPR_L_rod);

console.log("\n=== Building rear mechanism ===");
const rearM = vm.runInContext(`
  (function(){
    const M = buildMech("rear");
    return {
      clNames: M.cl.map(c=>c.name),
      clCount: M.cl.length,
      rodLinks: M.L.filter(l=>l.grp==="rod").map(l=>({id:l.id, a:l.a, b:l.b, zh:l.zh})),
      damperLinks: M.L.filter(l=>l.grp==="damper").map(l=>({id:l.id, a:l.a, b:l.b})),
      rockerCluster: M.cl.find(c=>c.name==="ROCKER") || null,
      hasPR_U_rod: M.L.some(l=>l.id==="PR_U_rod"),
    };
  })()
`, ctx);
console.log("Rear cl:", rearM.clCount, "names:", rearM.clNames);
console.log("Rear rod links:", JSON.stringify(rearM.rodLinks));
console.log("Rear damper:", JSON.stringify(rearM.damperLinks));
console.log("Rear ROCKER:", rearM.rockerCluster ? "YES" : "NO");
console.log("Rear has PR_U_rod:", rearM.hasPR_U_rod);

/* ---- Phase 4: Run 300 frames ---- */
console.log("\n=== Running 300 frames ===");
const frameResult = vm.runInContext("__H.runFrames(300)", ctx, { timeout: 300000 });
console.log("[frames]", JSON.stringify(frameResult));

const err2 = vm.runInContext("__H.errStack", ctx);
if (err2) console.error("\n=== LOOP EXCEPTION ===\n", err2);
else console.log("[loop] completed without exception");

/* ---- Summary ---- */
console.log("\n========== SUMMARY ==========");
const pass1 = frontM.hasPR_L_rod && rearM.hasPR_U_rod;
const pass2 = frontM.rockerCluster !== null && rearM.rockerCluster !== null;
const pass3 = !err0 && !err2;
const pass4 = frameResult.res >= -1; // just check it didn't crash
console.log("Front PR_L_rod present:", pass1 ? "✅" : "❌");
console.log("Both ROCKER clusters:", pass2 ? "✅" : "❌");
console.log("No boot/loop exceptions:", pass3 ? "✅" : "❌");
console.log("300 frames completed:", frameResult.n === 300 ? "✅" : "❌");
console.log("Final residual:", frameResult.res);
