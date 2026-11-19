/**
 * test_compare.js —— 三层对比 + 受控赛道指标（Phase D，2026-11-19）
 *
 * 验收重点（对应 P29）：
 *   ① 三张表都非空（静态 KPI / 动态 ride / 赛道受控极限）
 *   ② `trackLimit` **可复现**（两次逐位一致）——被学习掩盖的圈速做不到这点
 *   ③ `trackLimit` **对真实调校杠杆敏感**：静态外倾 ±2° ⇒ 峰值 ay 必须变
 *      （圈速口径下几何差异只有 0.017%，这条是本轮要修的洞）
 *   ④ A/B 对比：配置不同 ⇒ 指纹不同、差异非零；CSV 可导出
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtx2D() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return new Proxy({ canvas: null, measureText: () => ({ width: 60 }),
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    createImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createPattern: () => null }, {
    get(o, k) { return (k in o) ? o[k] : noop; },
    set(o, k, v) { o[k] = v; return true; }
  });
}
function makeFakeEl() {
  return function fakeEl(id) {
    const t = function () { return t; };
    Object.assign(t, {
      id, style: {}, dataset: {}, children: [], childNodes: [],
      clientWidth: 1280, clientHeight: 720, value: '0', checked: false,
      textContent: '', innerHTML: '', width: 1280, height: 720,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, removeEventListener() {},
      appendChild() {}, setAttribute() {}, getAttribute() { return null; },
      querySelector: s => fakeEl(String(s)),
      querySelectorAll: () => [fakeEl('q0'), fakeEl('q1'), fakeEl('q2')],
      focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
    });
    return new Proxy(t, {
      get(o, k) {
        if (k in o) return o[k];
        if (k === Symbol.toPrimitive) return () => '0';
        if (k === Symbol.iterator) return function* () {};
        if (k === 'getContext') return () => makeCtx2D();
        return fakeEl(String(k));
      },
      set(o, k, v) { o[k] = v; return true; },
      has() { return true; },
      apply() { return fakeEl('call'); }
    });
  };
}

const fakeEl = makeFakeEl();
const elCache = new Map();
const sb = {
  Math, JSON, Date, Number, String, Boolean, Array, Object, Error,
  Map, Set, WeakMap, RegExp, Symbol, Promise, Proxy, Reflect,
  isNaN, isFinite, parseFloat, parseInt,
  setTimeout: () => 0, clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: fn => setTimeout(fn, 16), cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() }, devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  location: { href: 'http://127.0.0.1:714/dwb-pro-v4.html', protocol: 'http:', search: '' },
  fetch: () => Promise.reject(new Error('no network')),
  alert() {}, confirm: () => true, prompt: () => null,
  addEventListener() {}, removeEventListener() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
  Image: class { set src(_v) {} addEventListener() {} },
  Path2D: class { moveTo() {} lineTo() {} arc() {} closePath() {} },
  WheelEvent: class {}, KeyboardEvent: class {}, MouseEvent: class {},
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  console,
  document: {
    getElementById(id) { if (!elCache.has(id)) elCache.set(id, fakeEl(id)); return elCache.get(id); },
    querySelector: () => fakeEl('q'), querySelectorAll: () => [fakeEl('q0'), fakeEl('q1'), fakeEl('q2')],
    createElement: t => fakeEl(t), createElementNS: (ns, t) => fakeEl(t),
    createTextNode: t => fakeEl('#text'), createDocumentFragment: () => fakeEl('#frag'),
    addEventListener() {}, removeEventListener() {},
    body: fakeEl('body'), documentElement: fakeEl('html'), head: fakeEl('head')
  }
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);

for (const f of ['01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js',
                 '05-scene3d.js', '06-ui-panels.js', '07-plots.js', '08-interact.js',
                 '09-track.js', '10-eval.js', '10b-vehicle-core.js', '11-stages.js',
                 '18-ride-bench.js', '19-compare.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx, { filename: f });
}

const CMP = ctx.COMPARE;
const S = ctx.S;
let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

console.log('=== 0. 模块 ===');
{
  assert(CMP && typeof CMP.capture === 'function', 'COMPARE 已加载');
  assert(typeof CMP.trackLimit === 'function' && typeof CMP.diff === 'function', 'trackLimit / diff 可用');
}

console.log('=== 1. 三层表非空 ===');
{
  const st = CMP.staticRows(), dy = CMP.dynamicRows(), tk = CMP.trackRows();
  note(`静态 ${st.length} 项 · 动态 ${dy.length} 项 · 赛道 ${tk.length} 项`);
  assert(st.length >= 5, `静态层有 KPI（${st.length} 项）`);
  assert(dy.length === 4, `动态层四项（${dy.length}）`);
  assert(tk.length === 4, `赛道层四项（${tk.length}）`);
  note('静态样例：' + st.slice(0, 3).map(r => r.name + '=' + r.value).join(' · '));
  note('动态：' + dy.map(r => r.name + '=' + r.value + r.unit).join(' · '));
  note('赛道：' + tk.map(r => r.name + '=' + r.value + r.unit).join(' · '));
}

console.log('=== 2. 赛道指标可复现（逐位一致）===');
{
  const a = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  const b = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  assert(JSON.stringify(a.metrics) === JSON.stringify(b.metrics), '两次运行指标逐位一致');
  assert(JSON.stringify(a.points) === JSON.stringify(b.points), '逐速度点也逐位一致');
  note(`峰值 ay ${a.metrics.peakAyG.toFixed(3)} g @ ${a.metrics.speedAtPeak} m/s`);
}

console.log('=== 3. 赛道指标对调校杠杆敏感（P29 的洞）===');
{
  const base = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  /* 杠杆：前轴弹簧刚度 +30%（真实调校动作，直接改轮端刚度与载荷转移）。
     ⚠ 不用 cam0：实测 `S.front.cam0` 根本不进 K1（改 −2° 峰值 ay 变化 0.00%），
     那是显示/机构层的参数，不是物理输入。 */
  const kS0 = S.front.kS;
  S.front.kS = kS0 * 1.3;
  const more = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  S.front.kS = kS0;
  const back = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });

  const dPct = 100 * (more.metrics.peakAyG - base.metrics.peakAyG) / base.metrics.peakAyG;
  note(`前簧 +30%：峰值 ay ${base.metrics.peakAyG.toFixed(3)} → ${more.metrics.peakAyG.toFixed(3)} g（${dPct.toFixed(2)}%）`);
  note(`半径 ${base.metrics.radiusAtPeak.toFixed(2)} → ${more.metrics.radiusAtPeak.toFixed(2)} m（${(100*(more.metrics.radiusAtPeak-base.metrics.radiusAtPeak)/base.metrics.radiusAtPeak).toFixed(2)}%）`);
  note(`还原后：${back.metrics.peakAyG.toFixed(3)} g（应与基准一致）`);
  assert(Math.abs(dPct) > 0.2,
    `前簧 +30% 让峰值 ay 变化 ${dPct.toFixed(2)}%（门限 0.2%，圈速口径只有 0.017%）`);
  assert(Math.abs(back.metrics.peakAyG - base.metrics.peakAyG) / base.metrics.peakAyG < 1e-9,
    '还原参数后指标回到基准（无残留状态）');
}

console.log('=== 4. A/B 对比 ===');
{
  const a = CMP.capture('A');
  /* 用真正进 K1 的杠杆（弹簧刚度），不用 cam0——实测 cam0 不改任何物理输出 */
  const kS0 = S.front.kS;
  S.front.kS = kS0 * 1.2;
  const b = CMP.capture('B');
  S.front.kS = kS0;

  assert(a.hash !== b.hash, `两方案指纹不同（${a.hash} vs ${b.hash}）`);
  const d = CMP.diff();
  assert(d && d.rows.length > 5, `对比行数 ${d && d.rows.length}`);
  assert(d.sameConfig === false, 'diff 判定为不同配置');
  const changed = d.rows.filter(r => r.pct !== null && Math.abs(r.pct) > 0.1);
  note(`差异 >0.1% 的项：${changed.length} 条`);
  note(changed.slice(0, 4).map(r => `${r.layer}/${r.name} ${r.a}→${r.b} (${r.pct.toFixed(2)}%)`).join(' · '));
  assert(changed.length > 0, '至少一项出现可见差异');

  const csv = CMP.toCsv(d);
  assert(csv.split('\n').length === d.rows.length + 2, `CSV 行数 ${csv.split('\n').length} = 行 + 表头 + 注释`);
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} compare checks passed!`);
console.log(`========================================`);
process.exit(0);
