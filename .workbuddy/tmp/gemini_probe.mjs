// One-off probe for gemini chassis features: 4-corner travel, pitch, wheelbase, axleView.
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("C:/Users/zzy/Desktop/New_suspension/dwb-mod/gemini-code-1787322645956.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
const code = m[1];

function makeCtx() { return new Proxy({}, { get: () => () => undefined, set: () => true }); }
function makeEl(tag) {
  const el = {
    children: [], style: {}, dataset: {}, _cls: new Set(),
    value: "", min: "", max: "", step: "", type: "", title: "",
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    appendChild(ch) { el.children.push(ch); ch.parentElement = el; return ch; },
    querySelector: () => makeEl("canvas"),
    querySelectorAll: () => [makeEl("button"), makeEl("button")],
    addEventListener() {}, focus() {}, click() {},
    getBoundingClientRect: () => ({ width: 430, height: 290, left: 0, top: 0 }),
    clientWidth: 300, clientHeight: 84
  };
  el.getContext = () => makeCtx();
  return el;
}
const els = {};
const documentStub = {
  createElement: t => makeEl(t),
  getElementById: id => (els[id] ||= makeEl("div")),
  activeElement: null, body: makeEl("body")
};
function makeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), _dump: () => Object.fromEntries(map) };
}
const store = makeStorage();
const sandbox = {
  console, performance, document: documentStub, localStorage: store,
  ResizeObserver: class { observe() {} }, requestAnimationFrame: () => 1,
  setTimeout: () => 0, alert: () => {}, addEventListener: () => {},
  Math, Date, JSON, isNaN, parseFloat, parseInt,
  Object, Array, String, Number, Boolean, RegExp, Error, Promise, Symbol, Map, Set, isFinite
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
const DRIVER = `
;globalThis.__P=(function(){
  return {
    boot(){ buildLeft();buildRight(); (typeof loadPersist==="function")&&loadPersist(); rebuild(); initViews(); simulate(0.016);simulate(0.016); },
    step(){ simulate(0.016); },
    sums(){
      const sc=buildScene();
      const nodeCount=sc.filter(o=>o.k==="n").length;
      let minY=1e9,maxY=-1e9;
      sc.forEach(o=>{const pts=o.k==="l"?[o.a,o.b]:(o.k==="p"?o.pts:[]);pts.forEach(p=>{if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1];});});
      return {nodeCount, minY:+minY.toFixed(0), maxY:+maxY.toFixed(0),
        trFR:+(SIM.mFR?SIM.mFR.tr:null), trFL:+(SIM.mFL?SIM.mFL.tr:null),
        trRR:+(SIM.mRR?SIM.mRR.tr:null), trRL:+(SIM.mRL?SIM.mRL.tr:null)};
    }
  };
})();`;
vm.runInContext(code + DRIVER, ctx, { filename: "gemini.js" });

const P = ctx.__P;
P.boot();
console.log("A base tr:", JSON.stringify(P.sums()));

vm.runInContext(`S.travel=0;S.trFR=0;S.trFL=0;S.trRR=20;S.trRL=0;S.exc="off";simulate(0.016);`, ctx);
console.log("B trRR=20 :", JSON.stringify(P.sums()), "(expect trRR≈20, others≈0)");

vm.runInContext(`S.pitch=2;simulate(0.016);`, ctx);
console.log("C pitch=2 :", JSON.stringify(P.sums()), "(expect front −8, rear +8 added)");

vm.runInContext(`S.pitch=0;S.trRR=0;S.wb=3200;rebuild();simulate(0.016);`, ctx);
console.log("D wb=3200 :", JSON.stringify(P.sums()), "(expect minY≈−1600−240, maxY≈1600+240)");

vm.runInContext(`S.axleView="front";`, ctx);
console.log("E view=FRONT:", JSON.stringify(P.sums()), "(expect minY≈−240 only = rear hidden)");
vm.runInContext(`S.axleView="rear";`, ctx);
console.log("F view=REAR :", JSON.stringify(P.sums()), "(expect maxY≈+240 only = front hidden)");
vm.runInContext(`S.axleView="all";`, ctx);

vm.runInContext(`S.wb=2750;rebuild();S.steerExc="sine";S.stA=30;S.stF=0.2;`, ctx);
vm.runInContext(`for(let i=0;i<240;i++)loop(1000+i*16.7);`, ctx);
const r1 = vm.runInContext(`({rack:+S.rack.toFixed(1), trF:+SIM.mFR.tr.toFixed(1)})`, ctx);
console.log("G steerExc :", JSON.stringify(r1), "(expect |rack|≤30 and varying)");

// H: persistence round-trip — mutate, persist, reload in a fresh context with same storage
vm.runInContext(`S.front.kS=150; S.rear.hp.LBJ=[730,12,171]; S.wb=2900; S.axleView="rear"; persistState();`, ctx);
const store2 = { getItem: k => store.getItem(k), setItem: (k, v) => store.setItem(k, v), removeItem: k => store.removeItem(k) };
const sb2 = { ...sandbox, localStorage: store2 };
const ctx2 = vm.createContext(sb2);   // same storage, isolated globals
vm.runInContext(code + DRIVER, ctx2, { filename: "gemini2.js" });
const P2 = ctx2.__P;
P2.boot();
const r2 = vm.runInContext(`({kSF:S.front.kS, lbjR:S.rear.hp.LBJ.join('/'), wb:S.wb, view:S.axleView, kSR:S.rear.kS})`, ctx2);
console.log("H persist :", JSON.stringify(r2), "(expect kSF=150, lbjR=730/12/171, wb=2900, view=rear, kSR=130)");