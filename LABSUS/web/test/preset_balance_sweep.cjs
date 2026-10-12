/**
 * preset_balance_sweep.cjs —— 预设配平扫描**诊断工具**（不是回归测试）
 *
 * 用途：用前端自身的准静态内核（solveQuasiStatic）扫描「前轴簧载份额 × 前 ARB
 * 直径」，观察稳态不足转向梯度 US 与 TLLTD 的响应，用于给 `web/js/02-presets.js`
 * 的四款预设配平。
 *
 * 背景（M5，2026-09-20）：修复「前后轴静载对调」后缺省预设翻成中性/轻过度转向。
 * 实测结论：US 几乎是前轴簧载份额的纯函数（无胎宽配平时 ≈0.4·(share−0.478) °/g），
 * 而**ARB 是死杠杆**（前 ARB 0→40 使 TLLTD 45%→83%，US 只动 +0.01 °/g）。引入
 * 按胎宽配平的轴刚度系数（k = W_axle / mean(W_f, W_r)）后，四款预设以物理合理
 * 的配重即可落回 README 的 0.2~2.0 °/g 目标窗口。
 *
 * 用法：node web/test/preset_balance_sweep.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'js');

function makeCtx2D() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return new Proxy({ canvas: null, createLinearGradient: () => grad,
    createRadialGradient: () => grad, measureText: () => ({ width: 60 }),
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }) }, {
    get(o, k) { return (k in o) ? o[k] : noop; },
    set(o, k, v) { o[k] = v; return true; }
  });
}
function makeEl(id) {
  const t = function () { return t; };
  t.id = id; t.style = {}; t.dataset = {}; t.children = []; t.childNodes = [];
  t.clientWidth = 1280; t.clientHeight = 720; t.width = 1280; t.height = 720;
  t.value = '0'; t.textContent = ''; t.innerHTML = '';
  t.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  t.addEventListener = () => {}; t.removeEventListener = () => {};
  t.appendChild = () => {}; t.setAttribute = () => {}; t.getAttribute = () => null;
  t.querySelector = s => makeEl(String(s));
  t.querySelectorAll = () => [];
  t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getContext') return () => makeCtx2D();
      if (k === Symbol.toPrimitive) return () => '0';
      if (k === Symbol.iterator) return function* () {};
      return makeEl(String(k));
    },
    set(o, k, v) { o[k] = v; return true; },
    has: () => true
  });
}
const cache = new Map();
const sb = {
  Math, JSON, Date, Number, String, Boolean, Array, Object, Error, Map, Set, RegExp,
  isNaN, isFinite, parseFloat, parseInt,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() }, devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node' }, location: { href: 'file:///x', protocol: 'file:' },
  fetch: () => Promise.reject(new Error('no net')),
  addEventListener: () => {}, removeEventListener: () => {}, console,
  document: {
    getElementById(id) { if (!cache.has(id)) cache.set(id, makeEl(id)); return cache.get(id); },
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    createElement: t => makeEl(t), createTextNode: t => makeEl('#t'),
    addEventListener: () => {}, body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head')
  }
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
const load = f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
['01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js', '05-scene3d.js',
 '06-ui-panels.js', '07-plots.js', '08-interact.js'].forEach(load);

const presets = vm.runInContext('Object.keys(VEHICLE_PRESETS)', ctx);

function measure(preset, frontShare, arbFrontD, gy) {
  vm.runInContext(`loadVehiclePreset(${JSON.stringify(preset)})`, ctx);
  vm.runInContext(`S.front.mS = ${frontShare}; S.rear.mS = ${1 - frontShare};`, ctx);
  if (arbFrontD !== null) vm.runInContext(`S.front.arb.d = ${arbFrontD};`, ctx);
  vm.runInContext('rebuild();', ctx);
  return vm.runInContext(`(function(){ const r = solveQuasiStatic(${gy});
     return { usGrad: r.usGrad, aF: r.alphaF, aR: r.alphaR, tlltd: r.tlltd, roll: r.rollDeg };
   })()`, ctx);
}

console.log('== 各预设：前轴簧载份额扫描（gy=1.0，ARB 保持预设值）==');
for (const p of presets) {
  const cur = vm.runInContext(`(function(){ loadVehiclePreset(${JSON.stringify(p)});
      return { f: S.front.mS, r: S.rear.mS, arbF: S.front.arb.d, arbR: S.rear.arb.d }; })()`, ctx);
  console.log(`\n--- ${p}（现值 front mS=${cur.f} / rear mS=${cur.r} → 前份额 ${(cur.f / (cur.f + cur.r) * 100).toFixed(1)}%；ARB d 前 ${cur.arbF} 后 ${cur.arbR}）`);
  const row = [];
  for (const share of [0.40, 0.43, 0.45, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60]) {
    const m = measure(p, share, null, 1.0);
    row.push(`  share=${share.toFixed(2)}  US=${m.usGrad.toFixed(4)} °/g  αf=${m.aF.toFixed(3)}  αr=${m.aR.toFixed(3)}  TLLTD=${m.tlltd.toFixed(1)}%  roll=${m.roll.toFixed(3)}°`);
  }
  console.log(row.join('\n'));
}

console.log('\n\n== 现值核验（不改任何参数，直接测预设）==');
for (const p of presets) {
  const info = vm.runInContext(`(function(){ loadVehiclePreset(${JSON.stringify(p)});
      return { wf: S.front.tire.W, wr: S.rear.tire.W, mf: S.front.mS, mr: S.rear.mS }; })()`, ctx);
  const share = info.mf / (info.mf + info.mr);
  const rows = [];
  for (const gy of [0.5, 1.0, 1.65, 2.0]) {
    const m = measure(p, share, null, gy);
    rows.push(`gy=${gy}: US=${m.usGrad.toFixed(3)} TLLTD=${m.tlltd.toFixed(1)}%`);
  }
  console.log(`  ${p.padEnd(11)} 胎宽 ${info.wf}/${info.wr}  前轴份额 ${(share * 100).toFixed(1)}%  |  ` + rows.join('  '));
}

console.log('\n\n== ARB 前轴刚度扫描（gy=1.0，簧载份额取现值）==');
for (const p of presets) {
  const cur = vm.runInContext(`(function(){ loadVehiclePreset(${JSON.stringify(p)});
      return { f: S.front.mS, r: S.rear.mS, arbF: S.front.arb.d, arbR: S.rear.arb.d,
               share: S.front.mS / (S.front.mS + S.rear.mS) }; })()`, ctx);
  console.log(`\n--- ${p}（份额 ${cur.share.toFixed(3)}，后 ARB=${cur.arbR}）`);
  const row = [];
  for (const d of [0, 10, 18, 24, 30, 38, 46]) {
    const m = measure(p, cur.share, d, 1.0);
    row.push(`  dF=${String(d).padStart(2)}  US=${m.usGrad.toFixed(4)}  TLLTD=${m.tlltd.toFixed(1)}%  roll=${m.roll.toFixed(3)}°`);
  }
  console.log(row.join('\n'));
}

console.log('\n\n== 组合扫描：份额 × 前 ARB（目标 US ∈ [0.2, 2.0] °/g @1g）==');
for (const p of presets) {
  const cur = vm.runInContext(`(function(){ loadVehiclePreset(${JSON.stringify(p)});
      return { arbR: S.rear.arb.d }; })()`, ctx);
  console.log(`\n--- ${p}（后 ARB=${cur.arbR}）`);
  for (const share of [0.45, 0.48, 0.50, 0.52]) {
    const cells = [];
    for (const d of [0, 14, 22, 30, 40]) {
      const m = measure(p, share, d, 1.0);
      const hit = (m.usGrad >= 0.2 && m.usGrad <= 2.0) ? ' *' : '  ';
      cells.push(`dF=${String(d).padStart(2)}:${m.usGrad.toFixed(3)}${hit}`);
    }
    console.log(`  share=${share.toFixed(2)}  ` + cells.join('  '));
  }
}
