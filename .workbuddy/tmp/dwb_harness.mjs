// DWB-SIM headless repro harness: run the page script in Node with a minimal DOM stub.
// Usage: node dwb_harness.mjs <html-path> <scenario:fresh|prod|sport-rear|fsr06>
import fs from "node:fs";
import vm from "node:vm";
import process from "node:process";

const htmlPath = process.argv[2];
const scenario = process.argv[3] || "fresh";
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> found"); process.exit(2); }
const code = m[1];

/* ---------------- DOM stubs ---------------- */
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
      if (!el._btns) { el._btns = [makeEl("button"), makeEl("button")]; }
      return el._btns;
    },
    addEventListener() {}, focus() {}, click() {},
    getBoundingClientRect: () => ({ width: 430, height: 290, left: 0, top: 0 }),
    clientWidth: 300, clientHeight: 86,
    files: []
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
  activeElement: null,
  body: makeEl("body")
};

function makeStorage(seedObj) {
  const map = new Map();
  if (seedObj) for (const [k, v] of Object.entries(seedObj)) map.set(k, v);
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _dump: () => Object.fromEntries(map)
  };
}

/* ---------------- driver injected after page script ---------------- */
const DRIVER = `
;globalThis.__H = (function(){
  let err=null, errStack=null;
  return {
    get err(){return err}, get errStack(){return errStack},
    state:null, sim:null, views:null, seed:null,
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
      let ts=1000; const times=[]; const trSamples=[];
      for(let i=0;i<n;i++){
        const a=performance.now();
        try{ loop(ts); }catch(e){ err=e; errStack=e&&e.stack; break; }
        ts+=16.7; times.push(performance.now()-a);
        if(i%30===0 && SIM.mR) trSamples.push(+SIM.mR.tr.toFixed(2));
      }
      return {n:times.length, maxMs:+Math.max(...times).toFixed(1),
              avgMs:+(times.reduce((s,x)=>s+x,0)/Math.max(1,times.length)).toFixed(2),
              totalS:+(times.reduce((s,x)=>s+x,0)/1000).toFixed(2),
              play:S.play, t:+S.t.toFixed(2), trSamples,
              res:+(SIM.R?SIM.R.res:-1).toFixed(4)};
    },
    snap(){
      return {trMin:+S.trMin.toFixed(2), trMax:+S.trMax.toFixed(2),
        geo:SIM.geo&&SIM.geo.map(x=>+x.toFixed(2)), limR:SIM.limR&&SIM.limR.map(x=>+x.toFixed(2)),
        geoRR:SIM.geoRR&&SIM.geoRR.map(x=>+x.toFixed(2)),
        travel:+S.travel.toFixed(2), exc:S.exc,
        iter:SIM.R.iter, ms:+SIM.R.ms.toFixed(1), ok:SIM.R.ok};
    },
    check(){
      const g=SIM.geo, gR=SIM.geoRR;
      const okGeo = g && g[0]<=-60 && g[1]>=60 && gR && gR[0]<=-60 && gR[1]>=60;
      return {geo:g&&g.map(x=>+x.toFixed(0)), geoRR:gR&&gR.map(x=>+x.toFixed(0)), // 整数形式对齐 ≤−60/≥60 谓词
              okGeo, resR:+SIM.R.res.toFixed(4), okR:SIM.R.ok};
    },
    diag(){
      const out={scan:[]};
      const origSweep=sweepProj;
      for(const mB of [0.005,0.02,0.05]){
        for(const K of [1,4,12]){
          loadPreset(PRESET_KEYS.find(k=>k==="FSR-06 前推后拉正式版")||PRESET_KEYS[0]);
          HPDEF[HPI.RK_B][5]=mB;
          const M=buildMech("front");
          const rocker=M.cl.find(c=>c.name==="ROCKER");
          const rod=M.L.find(l=>l.grp==="rod");
          /* 变体 sweepProj：全局扫一遍 + 摇臂/推杆局部内迭代 K 次 */
          const sweep=(drvZ)=>{
            origSweep(M,drvZ===undefined?null:drvZ);   // 复用原序（已含一次 rocker→rod）
            for(let k=1;k<K;k++){ projHinge(M,rocker); projLink(M,rod); }
          };
          const run=(target,maxIt,tol)=>{
            let it=-1,res=1;
            for(it=0;it<maxIt;it++){ sweep(target); res=residual(M,target); if(res<tol)break; }
            return {it:it+1,res:+res.toExponential(2)};
          };
          resetMech(M);setChassis(M,0);
          const z0=M.n[M.i.WC].p0[2];
          const A=run(z0+6,4000,2e-7);      // 单子步 +6mm
          resetMech(M);setChassis(M,0);
          const B=run(z0+30,4000,2e-7);     // 单子步 +30mm
          out.scan.push({mB,K,A,B});
        }
      }
      return out;
    },
  };
})();`;

function makeVMContext(store) {
  let rafCb = null;
  const sandbox = {
    console,
    performance,
    document: documentStub,
    localStorage: store,
    ResizeObserver: RO,
    requestAnimationFrame: cb => { rafCb = cb; return 1; },
    setTimeout: (fn, ms) => 0,          // fire-and-forget; don't keep node alive
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

/* ---------------- two-phase: prod seed extraction ---------------- */
let seedStorage = null;
if (scenario === "prod" || scenario === "sport-rear" || scenario === "fsr06") {
  // Phase 1: run script in a scratch context, switch preset, persist, dump storage.
  const scratchStore = makeStorage();
  const ctx1 = makeVMContext(scratchStore);
  vm.runInContext(code + DRIVER, ctx1, { filename: "dwb-inline.js" });
  vm.runInContext(`
    __H.seed = (() => {
      const N=${JSON.stringify(scenario==="fsr06"?"FSR-06 前推后拉正式版":(scenario==="prod"?"PROD 前推后拉（FSAE）":null))};
      if(N){loadPreset(PRESET_KEYS.find(k=>k===N)||PRESET_KEYS[0]);}
      ${scenario==="sport-rear"||scenario==="fsr06"? "S.axleView=\"rear\";":""}
      persistState();
      return localStorage.getItem("dwbFullChassis");
    })();
  `, ctx1, {timeout:120000});
  seedStorage = { dwbFullChassis: ctx1.__H.seed };
  console.log(`[seed] scenario=${scenario} bytes=${ctx1.__H.seed ? ctx1.__H.seed.length : 0}`);
}

/* ---------------- phase 2: the actual repro ---------------- */
const store = makeStorage(seedStorage);
const ctx = makeVMContext(store);

vm.runInContext(code + DRIVER, ctx, { filename: "dwb-inline.js" });

const t0 = Date.now();
const bootInfo = vm.runInContext("__H.boot()", ctx, { timeout: 120000 });
console.log("[boot]", JSON.stringify(bootInfo), `wall=${Date.now() - t0}ms`);

const err1 = vm.runInContext("__H.errStack", ctx);
if (err1) { console.log("\n=== BOOT EXCEPTION ===\n" + err1); }

if (bootInfo) {
  if (scenario === "diag") {
    const d = vm.runInContext("JSON.stringify(__H.diag())", ctx, { timeout: 120000 });
    console.log("[diag]", d);
  } else {
    const t1 = Date.now();
    const r = vm.runInContext("__H.runFrames(300)", ctx, { timeout: 300000 });
    console.log("[frames]", JSON.stringify(r), `wall=${Date.now() - t1}ms`);
    console.log("[snap]", vm.runInContext("JSON.stringify(__H.snap())", ctx));
    console.log("[check]", vm.runInContext("JSON.stringify(__H.check())", ctx, {timeout:60000}));
    const err2 = vm.runInContext("__H.errStack", ctx);
    if (err2) console.log("\n=== LOOP EXCEPTION ===\n" + err2);
    else console.log("[loop] completed without exception");
  }
}
