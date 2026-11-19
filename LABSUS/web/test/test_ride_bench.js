/**
 * test_ride_bench.js —— 垂向 ride 测试台验收（Phase C，2026-11-19）
 *
 * 存在理由：ride 台的价值全在"**绝对量可复现且符合物理**"。三条硬验收：
 *   ① 可重复性：同一配置连跑两次，指标**逐位一致**（否则曲线不可信）
 *   ② 单调性：刚度↑ ⇒ 共振频率↑；阻尼↑ ⇒ 振荡衰减更快（方向必须对）
 *   ③ 解析锚：零悬挂阻尼时扫频峰值 ≈ √(Σk_eff/mSprung)/2π（弹簧与轮胎串联）
 *
 * 第 ③ 条是这个台子唯一的"外部真值"——没有它，四个测试只是四条曲线。
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
                 '18-ride-bench.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx, { filename: f });
}

const G = 9.81;
const RB = ctx.RIDE_BENCH;
const S = ctx.S;
let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

/** 沙箱里真实的 SIM（`mrRefF` 由几何扫掠算出，不是 0.75 的缺省值——
 *  用 ctx.SIM 会拿到 undefined，解析式就会用错运动比，实测 4.32 vs 5.25 Hz 即此） */
const SIMx = vm.runInContext('(typeof SIM !== "undefined") ? SIM : {}', ctx);

/** 轮跳模态阻尼比估计：ζ = (Cw + cT) / (2√((Kw+kT)·mU))，全部取内核实算值 */
function car_damp_est() {
  const car = new (ctx.window.VehicleDynamics15DOF || ctx.VehicleDynamics15DOF)(S, SIMx, 0);
  const zeta = (car.Cw_F + car.cT_f) / (2 * Math.sqrt((car.Kw_F + car.kT_f) * car.mU_f));
  return { zeta: zeta, KwF: car.Kw_F, CwF: car.Cw_F, cT: car.cT_f };
}

/* ── 0. 模块加载 ─────────────────────────────────────────────── */
console.log('=== 0. 模块与 schema ===');
{
  assert(RB && typeof RB.run === 'function', 'RIDE_BENCH 已加载且暴露 run()');
  assert(typeof RB.toCsv === 'function' && typeof RB.isoRmsMm === 'function',
    'CSV 导出与 ISO 路面助手可用');
}

/* ── 1. 阶跃：T63 / 超调 / 稳态 ──────────────────────────────── */
console.log('=== 1. 阶跃 STEP（5 mm 四轮同步）===');
const step1 = RB.run('step', { ampMm: 5, dur: 2.5 });
{
  const m = step1.metrics;
  note(`稳态 ${m.steadyMm.toFixed(2)} mm（输入 5 mm，刚体跟随应 ≈5）· T63 ${m.t63Ms.toFixed(0)} ms · `
    + `超调 ${m.overshootPct.toFixed(2)}% · 稳定 ${m.settleMs.toFixed(0)} ms · 峰值 ${m.peakMm.toFixed(2)} mm`);
  assert(Math.abs(m.steadyMm - 5) / 5 < 0.03,
    `稳态跟随路面阶跃（${m.steadyMm.toFixed(2)} mm vs 5 mm，误差 ${(100 * Math.abs(m.steadyMm - 5) / 5).toFixed(1)}%）`);
  assert(Number.isFinite(m.t63Ms) && m.t63Ms > 0, `T63 有限且为正（${m.t63Ms.toFixed(0)} ms）`);
  assert(step1.series.Z.length > 1000, `序列已记录（${step1.series.Z.length} 点）`);
}

/* ── 2. 可重复性：逐位一致 ───────────────────────────────────── */
console.log('=== 2. 可重复性（同配置连跑两次）===');
{
  const a = RB.run('step', { ampMm: 5, dur: 1.2 });
  const b = RB.run('step', { ampMm: 5, dur: 1.2 });
  const da = JSON.stringify(a.metrics), db = JSON.stringify(b.metrics);
  assert(da === db, '同一配置两次运行指标逐位一致');
  let maxDiff = 0;
  for (let i = 0; i < a.series.Z.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a.series.Z[i] - b.series.Z[i]));
  note(`序列最大逐点差 ${maxDiff.toExponential(2)} m`);
  assert(maxDiff === 0, `时间序列逐位一致（最大差 ${maxDiff.toExponential(2)}）`);
}

/* ── 3. 单调性：刚度↑ ⇒ 车身主频↑；阻尼↑ ⇒ 超调↓ ───────────── */
console.log('=== 3. 单调性（物理方向必须对）===');
{
  /* 主频用**自由衰减过零**测（零悬挂阻尼），不用阶跃峰时：全车阶跃同时激励
     heave(≈5 Hz) 与 pitch(≈8.8 Hz)，Z 的首峰其实是俯仰耦合进来的，
     拿它做单自由度辨识会得到 8.8 Hz 这种错值（2026-11-19 首版实测）。 */
  const dec = (over) => RB.run('freedecay', { dur: 4.0, skipSecs: 0.05, settleSecs: 2.0, over: Object.assign({ zeroDamping: true }, over || {}) });
  const base = dec();
  const stiff = dec({ kS_scale: 1.6 });
  note(`车身主频：基准 ${base.metrics.dominantFreqHz.toFixed(2)} Hz → 刚度×1.6 ${stiff.metrics.dominantFreqHz.toFixed(2)} Hz`
    + `（理论应 ×√1.6 = ${(base.metrics.dominantFreqHz * Math.sqrt(1.6)).toFixed(2)} Hz）`);
  assert(stiff.metrics.dominantFreqHz > base.metrics.dominantFreqHz,
    `刚度↑ ⇒ 车身主频↑（${base.metrics.dominantFreqHz.toFixed(2)} → ${stiff.metrics.dominantFreqHz.toFixed(2)} Hz）`);

  const st0 = RB.run('step', { ampMm: 5, dur: 2.0 });
  const st1 = RB.run('step', { ampMm: 5, dur: 2.0, over: { cR_scale: 2.5 } });
  note(`车身超调：基准 ${st0.metrics.overshootPct.toFixed(2)}% → 阻尼×2.5 ${st1.metrics.overshootPct.toFixed(2)}%`);
  assert(st1.metrics.overshootPct < st0.metrics.overshootPct,
    `阻尼↑ ⇒ 车身超调↓（${st0.metrics.overshootPct.toFixed(2)}% → ${st1.metrics.overshootPct.toFixed(2)}%）`);

  /* 轮跳模态只做**观察**：预设 cR 把轮跳压到 ζ≈1.9（过阻尼），不拿它验单调性 */
  const imp0 = RB.run('impulse', { ampMm: 10, dur: 1.2, singleWheel: true });
  const est = car_damp_est();
  note(`轮跳：主频 ${imp0.metrics.dominantFreqHz.toFixed(1)} Hz · 包络衰减比 ${imp0.metrics.decayRatio.toFixed(3)} · `
    + `估计 ζ_wheel ≈ ${est.zeta.toFixed(2)}（${est.zeta > 1 ? '过阻尼' : '欠阻尼'}）`);
  assert(imp0.metrics.decayRatio < 1, `轮跳脉冲确实衰减（比值 ${imp0.metrics.decayRatio.toFixed(3)}）`);
}

/* ── 4. 解析锚：自由衰减主频 vs 串联等效解析式 ────────────────── */
console.log('=== 4. 解析锚（零阻尼自由衰减 vs 串联等效刚度）===');
{
  const car = new (ctx.window.VehicleDynamics15DOF || ctx.VehicleDynamics15DOF)(
    Object.assign({}, S, { front: Object.assign({}, S.front, { cB: 0, cR: 0 }),
                           rear: Object.assign({}, S.rear, { cB: 0, cR: 0 }) }),
    SIMx, 0);
  const keF = (car.Kw_F * car.kT_f) / (car.Kw_F + car.kT_f);
  const keR = (car.Kw_R * car.kT_r) / (car.Kw_R + car.kT_r);
  const fTheory = Math.sqrt((2 * (keF + keR)) / car.mSprung) / (2 * Math.PI);

  const dec = RB.run('freedecay', { dur: 4.0, skipSecs: 0.05, settleSecs: 2.0, over: { zeroDamping: true } });
  const fMeas = dec.metrics.dominantFreqHz;
  note(`mSprung ${car.mSprung.toFixed(1)} kg · Kw ${(car.Kw_F / 1000).toFixed(1)}/${(car.Kw_R / 1000).toFixed(1)} N/mm`
    + `（mrF ${(car.Kw_F / (S.front.kS * 1000)).toFixed(4) ** 0.5} 实算）· `
    + `kT ${(car.kT_f / 1000).toFixed(0)}/${(car.kT_r / 1000).toFixed(0)} N/mm ⇒ 理论 ${fTheory.toFixed(2)} Hz`);
  note(`自由衰减实测主频 ${fMeas.toFixed(2)} Hz（过零计数）`);
  const err = Math.abs(fMeas - fTheory) / fTheory;
  assert(Number.isFinite(fMeas) && err < 0.08,
    `自由衰减主频贴串联等效解析式（${fMeas.toFixed(2)} vs ${fTheory.toFixed(2)} Hz，误差 ${(err * 100).toFixed(1)}%，门限 8%）`);

  /* 扫频只验证"存在共振峰"（高 Q 下不等稳态，不拿它定 f_n） */
  const sw = RB.run('sweep', { ampMm: 2, freqs: [3, 4, 5, 6, 8], cycles: 12, dt: 0.002 });
  note('扫频：' + sw.points.map(p => p.f + 'Hz→' + p.trans.toFixed(2)).join('  '));
  assert(sw.metrics.peakTrans > 1.0,
    `扫频存在共振峰（传递率 ${sw.metrics.peakTrans.toFixed(2)} > 1）`);
}

/* ── 5. ISO 8608 路面：合成谱 RMS vs 理论 ────────────────────── */
console.log('=== 5. ISO 8608 路面谱 ===');
{
  const th = RB.isoRmsMm('C');
  note(`C 级理论 RMS ${th.toFixed(2)} mm（0.011~2.83 cycle/m，w=2）`);
  const prof = RB.isoRoadProfile('C', 20261119, 200);
  let s2 = 0, n = 0;
  for (let s = 0; s < 400; s += 0.05) { const h = prof(s); s2 += h * h; n++; }
  const rms = Math.sqrt(s2 / n) * 1000;
  note(`合成路面实测 RMS ${rms.toFixed(2)} mm（${n} 采样）`);
  assert(Math.abs(rms - th) / th < 0.15,
    `合成路面 RMS 贴理论（${rms.toFixed(2)} vs ${th.toFixed(2)} mm，误差 ${(100 * Math.abs(rms - th) / th).toFixed(1)}%）`);
  const rnd = RB.run('random', { dur: 4, dt: 0.002 });
  note(`随机路面跑 4 s：车身 RMS ${rnd.metrics.bodyRmsMm.toFixed(2)} mm · 轮荷 RMS ${rnd.metrics.loadRmsN.toFixed(0)} N`);
  assert(Number.isFinite(rnd.metrics.bodyRmsMm) && rnd.metrics.bodyRmsMm > 0,
    `随机路面响应有限且非零（${rnd.metrics.bodyRmsMm.toFixed(2)} mm）`);
}

/* ── 6. CSV 导出 ─────────────────────────────────────────────── */
console.log('=== 6. CSV 导出 ===');
{
  const csv = RB.toCsv(step1);
  const lines = csv.split('\n');
  assert(lines[0].indexOf('# RIDE_BENCH step') === 0, 'CSV 首行含测试标识');
  assert(lines.length > step1.series.Z.length, `CSV 行数覆盖全部采样（${lines.length} 行）`);
  const sw = RB.run('sweep', { freqs: [4, 5, 6], cycles: 4, dt: 0.004 });
  const csv2 = RB.toCsv(sw);
  assert(csv2.indexOf('freq_hz,transmissibility') > 0, '扫频 CSV 导出频响表而非时间序列');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} ride-bench checks passed!`);
console.log(`========================================`);
process.exit(0);
