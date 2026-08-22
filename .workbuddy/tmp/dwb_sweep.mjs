// Sweep RK_B positions to find best rebound travel
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
    sweepRK(){
      const results=[];
      loadPreset(PRESET_KEYS.find(k=>k==="FSR-06 前推后拉正式版")||PRESET_KEYS[0]);
      const baseRK_B=cpy(S.hp.RK_B);
      const baseRK_PIVOT=cpy(S.hp.RK_PIVOT);
      const basePR_L=cpy(S.hp.PR_L);
      const baseRKA_X=S.hp.RK_A[0];
      const baseDMP_X=S.hp.DMP_T[0];

      // Sweep RK_B positions
      for(const rz of [530,540,550,560]){
        for(const bz of [380,400,420,440,460]){
          for(const bx of [240,260,280,300]){
            S.hp.RK_B=[bx,0,bz];
            S.hp.RK_PIVOT=[baseRK_PIVOT[0],0,rz];
            S.hp.RK_A=[baseRKA_X,240,rz-2];
            S.hp.DMP_T=[baseDMP_X,-260,rz-2];

            const M=buildMech("front");
            resetMech(M);setChassis(M,0);
            const z0=M.n[M.i.WC].p0[2];

            // Test rebound (WC goes down)
            let maxDn=0;
            for(let t=2;t<=140;t+=2){
              resetMech(M);setChassis(M,0);
              if(driveTo(M,z0-t,0)>0.03) break;
              maxDn=t;
            }

            // Test compression (WC goes up)
            let maxUp=0;
            for(let t=2;t<=140;t+=2){
              resetMech(M);setChassis(M,0);
              if(driveTo(M,z0+t,0)>0.03) break;
              maxUp=t;
            }

            const rkr=Math.hypot(bx-baseRK_PIVOT[0],bz-rz);
            const dx=bx-basePR_L[0], dz=bz-basePR_L[2];
            const pAngle=Math.atan2(dz,dx)*180/Math.PI;

            if(maxDn>=14){ // Report anything above original
              results.push({bx,bz,rz,rkr:+rkr.toFixed(1),pAngle:+pAngle.toFixed(1),dn:maxDn,up:maxUp});
            }
          }
        }
      }
      results.sort((a,b)=>b.dn-a.dn);
      return results;
    }
  };
})();`;

const store = makeStorage();
const ctx = makeVMContext(store);
vm.runInContext(code + DRIVER, ctx, { filename: "dwb-sweep.js" });

const bootInfo = vm.runInContext("__H.boot()", ctx, { timeout: 120000 });
console.log("[boot]", JSON.stringify(bootInfo));

if (bootInfo) {
  const results = vm.runInContext("JSON.stringify(__H.sweepRK())", ctx, { timeout: 600000 });
  console.log("[sweep]", results);
}
