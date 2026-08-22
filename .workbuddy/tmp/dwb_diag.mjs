// Diagnostic: find what limits FSR-06 front rebound
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
    diag(){
      const out={};
      /* Load FSR-06, build front mech */
      loadPreset(PRESET_KEYS.find(k=>k==="FSR-06 前推后拉正式版")||PRESET_KEYS[0]);
      const M=buildMech("front");
      resetMech(M); setChassis(M, 0);
      const z0=M.n[M.i.WC].p0[2];
      out.z0=z0;
      out.WC_p0=cpy(M.n[M.i.WC].p0);

      /* Print all chassis-mounted hardpoints */
      out.chassisHP={};
      for(const d of HPDEF){
        if(d[4]!==1) continue;
        const idx=M.i[d[0]];
        out.chassisHP[d[0]]=cpy(M.n[idx].p0);
      }

      /* Print rocker/rod geometry */
      const rkPivot=M.n[M.i.RK_PIVOT].p0;
      const rkB=M.n[M.i.RK_B].p0;
      const prL=M.n[M.i.PR_L].p0;
      out.rkPivot=cpy(rkB);
      out.rkB=cpy(rkB);
      out.rkPivotP0=cpy(rkPivot);
      out.rkB_radius=Math.hypot(rkB[0]-rkPivot[0],rkB[2]-rkPivot[2]);
      out.prL=cpy(prL);

      /* Pushrod angle (PR_L to RK_B in XZ plane) */
      const dx=rkB[0]-prL[0], dz=rkB[2]-prL[2];
      out.pushrodAngle=Math.atan2(dz,dx)*180/Math.PI;
      out.pushrodLen=Math.hypot(dx,dz);

      /* Drive to progressively more negative WC positions */
      out.scan=[];
      for(let t=0;t<=80;t+=2){
        resetMech(M); setChassis(M, 0);
        const target=z0-t;
        const res=driveTo(M, target, 0);
        const wcZ=M.n[M.i.WC].p[2];
        const wcActual=wcZ-z0;
        /* Compute each rigid link error */
        const linkErrs=[];
        for(const l of M.L){
          if(l.type!=="R") continue;
          const a=M.n[l.a].p, b=M.n[l.b].p;
          const d=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
          const err=d-l.L0;
          if(Math.abs(err)>0.01) linkErrs.push({a:l.a,b:l.b,name_a:M.n[l.a].name,name_b:M.n[l.b].name,L0:+l.L0.toFixed(2),actual:+d.toFixed(2),err:+err.toFixed(4)});
        }
        /* RK_B distance from RK_PIVOT */
        const rkBCur=M.n[M.i.RK_B].p;
        const rkPivotCur=M.n[M.i.RK_PIVOT].p;
        const rkDist=Math.hypot(rkBCur[0]-rkPivotCur[0],rkBCur[2]-rkPivotCur[2]);
        /* PR_L to RK_B distance (pushrod length in mechanism) */
        const prLCur=M.n[M.i.PR_L].p;
        const prDist=Math.hypot(rkBCur[0]-prLCur[0],rkBCur[2]-prLCur[2]);

        out.scan.push({t, targetZ:+target.toFixed(2), wcActual:+wcActual.toFixed(2),
          res:+res.toFixed(4), rkDist:+rkDist.toFixed(2), prDist:+prDist.toFixed(2),
          bigErrs:linkErrs.filter(e=>Math.abs(e.err)>0.1)});
        if(res>0.03) break;
      }
      return out;
    },
  };
})();`;

const store = makeStorage();
const ctx = makeVMContext(store);
vm.runInContext(code + DRIVER, ctx, { filename: "dwb-diag.js" });

const t0 = Date.now();
const bootInfo = vm.runInContext("__H.boot()", ctx, { timeout: 120000 });
console.log("[boot]", JSON.stringify(bootInfo), `wall=${Date.now() - t0}ms`);

if (bootInfo) {
  const t1 = Date.now();
  const d = vm.runInContext("JSON.stringify(__H.diag())", ctx, { timeout: 120000 });
  console.log("[diag]", d);
  console.log(`wall=${Date.now() - t1}ms`);
}
