/**
 * mass_split_probe.cjs —— 质量分配一致性探针（2026-11-19，A3 决策门）
 *
 * **诊断件，不参与回归**（同 preset_balance_sweep.cjs 定位）。
 *
 * 存在理由：S13（wheelDof）给每轮加了 mU 的**惯性**，但
 *   ① 簧下方程 `a = (F_tire − F_susp)/mU` 没有 `+ mU·g`（10b:1010）
 *   ② 车身垂向 `d_w = ΣFz / m`，而 `m = mTotal`（10b:297/1325）
 * ⇒ 簧下质量在**惯性上被数了两次**（车身 mTotal 里一次 + 轮上 mU 一次），
 *   重量却全由弹簧承担。总重与静载因此自洽（所以 physics_audit 的 2% 断言能过），
 *   但**簧上/轮跳模态频率**与"簧载质量"口径不一致，而它们正是 ride 测试台的核心指标。
 *
 * 测法：**把悬挂阻尼临时归零**后给纯 heave 初速，量自由振荡频率——避免过阻尼
 * 把响应压成单调衰减（初版探针就栽在这里：formula/baja 数不到过零）。
 * 解析侧同时给"固定车身"与"2-DOF 耦合"两种估计，避免用单自由度公式误导。
 *
 * 用法：`node web/test/mass_split_probe.cjs`
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 沙箱（与 test_15dof_steady.js 同构，裁掉无关 stub）──────────────── */
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
      querySelectorAll: () => [fakeEl('q0'), fakeEl('q1')],
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
  location: { href: 'http://127.0.0.1:714/x.html', protocol: 'http:', search: '' },
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
  console,
  document: {
    getElementById(id) { if (!elCache.has(id)) elCache.set(id, fakeEl(id)); return elCache.get(id); },
    querySelector: () => fakeEl('q'), querySelectorAll: () => [fakeEl('q0')],
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
                 '09-track.js', '10-eval.js', '10b-vehicle-core.js', '11-stages.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx, { filename: f });
}

const G = 9.81;
const ENV_FLAT = { grade: 0, bumpNoise: 0 };
const CTRL0 = { steer: 0, throttle: 0, brake: 0, drs: false };

/** 过零检测 → 频率：n 次过零 = (n−1)/2 个周期。先做线性去趋势，避免 DC 漂移吞掉过零 */
function freqFromZeroCrossings(t, y) {
  const n = y.length;
  if (n < 8) return NaN;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += t[i]; sy += y[i]; sxx += t[i] * t[i]; sxy += t[i] * y[i]; }
  const den = n * sxx - sx * sx;
  const slope = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : 0;
  const icpt = (sy - slope * sx) / n;
  const zc = [];
  for (let i = 1; i < n; i++) {
    const a = y[i - 1] - (slope * t[i - 1] + icpt);
    const b = y[i] - (slope * t[i] + icpt);
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) zc.push(t[i]);
  }
  if (zc.length < 4) return NaN;
  return ((zc.length - 1) / 2) / (zc[zc.length - 1] - zc[0]);
}

/** 2-DOF 四分之一车（无阻尼）两个模态频率，Hz。mS 为单角簧载质量 */
function quarterCarModes(kS, kT, mS, mU) {
  const p = kS / mS + (kS + kT) / mU;
  const q = (kS * kT) / (mS * mU);
  const disc = Math.max(0, p * p - 4 * q);
  const w1 = Math.sqrt(Math.max(0, (p - Math.sqrt(disc)) / 2));
  const w2 = Math.sqrt(Math.max(0, (p + Math.sqrt(disc)) / 2));
  return [w1 / (2 * Math.PI), w2 / (2 * Math.PI)];
}

/** heave 等效：四角同时运动，弹簧与轮胎**串联** ⇒ k_eff = Kw·kT/(Kw+kT) */
function heaveFreq(KwF, KwR, kT_f, kT_r, m) {
  const keF = (KwF * kT_f) / (KwF + kT_f);
  const keR = (KwR * kT_r) / (KwR + kT_r);
  return Math.sqrt((2 * (keF + keR)) / m) / (2 * Math.PI);
}

const rows = [];
for (const key of ['formula', 'gt3', 'gt3_sport', 'baja']) {
  ctx.loadVehiclePreset(key);
  const S = ctx.S, SIM = ctx.SIM || {};

  /* 静态口径：原样（预压弹簧，设计位 = 静平衡位） */
  S.wheelDof = true;
  const car0 = new ctx.VehicleDynamics15DOF(S, SIM, 0);
  const mU_f = car0.mU_f, mU_r = car0.mU_r;
  const kT_f = car0.kT_f, kT_r = car0.kT_r;
  const mTotal = car0.m;
  const mSprungInv = mTotal - 2 * (mU_f + mU_r);
  const mSprungPreset = S.mSprung;
  for (let i = 0; i < 2000; i++) car0.step(CTRL0, ENV_FLAT, 0.001);
  const sumFz = car0.telemetry.Fz.FL + car0.telemetry.Fz.FR
              + car0.telemetry.Fz.RL + car0.telemetry.Fz.RR;
  const trF = car0.telemetry.tr.FL;
  /* A2 恒等式：静平衡时 F_tire = F_susp + mU·g，而 F_susp = FzSprF（簧载口径预压） */
  const identF = car0.telemetry.Fz.FL - mU_f * G - car0.FzSprF;
  const identR = car0.telemetry.Fz.RL - mU_r * G - car0.FzSprR;

  /* 频响口径：悬挂阻尼临时归零，避免过阻尼吃掉振荡 */
  const saveDamp = {
    fB: S.front.cB, fR: S.front.cR, rB: S.rear.cB, rR: S.rear.cR
  };
  S.front.cB = 0; S.front.cR = 0; S.rear.cB = 0; S.rear.cR = 0;
  const car = new ctx.VehicleDynamics15DOF(S, SIM, 0);
  for (let i = 0; i < 2000; i++) car.step(CTRL0, ENV_FLAT, 0.001);   // 静平衡
  const Z0 = car.state.Z;

  /* B 车身 heave：纯初速激励；8 s 窗口（低至 1.2 Hz 的 gt3_sport 也够 9 个周期） */
  car.state.w = 0.05;
  const tb = [], zb = [];
  for (let i = 0; i < 8000; i++) {
    car.step(CTRL0, ENV_FLAT, 0.001);
    if (i > 300) { tb.push(i * 0.001); zb.push(car.state.Z - Z0); }
  }
  const fBodyMeas = freqFromZeroCrossings(tb, zb);

  /* C 轮跳：单轮接地点 2 mm 位移；只取前 150 ms（车身尚未响应，避免低频污染） */
  for (let i = 0; i < 500; i++) car.step(CTRL0, ENV_FLAT, 0.001);
  car.zw.FL += 0.002;
  const tw = [], vw = [];
  for (let i = 0; i < 150; i++) {
    car.step(CTRL0, ENV_FLAT, 0.001);
    tw.push(i * 0.001); vw.push(car.vzw.FL);
  }
  const fWheelMeas = freqFromZeroCrossings(tw, vw);

  S.front.cB = saveDamp.fB; S.front.cR = saveDamp.fR;
  S.rear.cB = saveDamp.rB; S.rear.cR = saveDamp.rR;

  const mrF = Math.abs(SIM.mrRefF) || Math.abs(S.front.mr || 0.75);
  const mrR = Math.abs(SIM.mrRefR) || Math.abs(S.rear.mr || 0.78);
  const KwF = S.front.kS * 1000 * mrF * mrF;
  const KwR = S.rear.kS * 1000 * mrR * mrR;

  /* 单角等效：前轴 2 角承担 mTotal 的前轴份额 */
  const shareF = car0.b / car0.wb;
  const mS_total = mSprungInv;
  const modesTotal = quarterCarModes(KwF, kT_f, (mTotal * shareF) / 2, mU_f);
  const modesSprung = quarterCarModes(KwF, kT_f, (mS_total * shareF) / 2, mU_f);

  rows.push({
    key, mTotal, mSprungPreset, mSprungInv, mU_f, kT_f, KwF,
    sumFz, ratioFz: sumFz / (mTotal * G), trF,
    FzSprF: car0.FzSprF, identF, identR,
    fBodyMeas,
    fBodyTotal: heaveFreq(KwF, KwR, kT_f, kT_r, mTotal),
    fBodySprung: heaveFreq(KwF, KwR, kT_f, kT_r, mSprungInv),
    fWheelMeas,
    fWheelTotal2dof: modesTotal[1],
    fWheelSprung2dof: modesSprung[1]
  });
}

/* ── 输出 ───────────────────────────────────────────────────────── */
const f2 = x => Number.isFinite(x) ? x.toFixed(2) : 'n/a';
const pct = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  ? (100 * Math.abs(a - b) / Math.abs(b)).toFixed(1) + '%' : 'n/a';

console.log('\n=== A. 静载自洽（ΣF_tire vs mTotal·g）与静态行程 ===');
console.log('预设        mTotal   mSprung(不变量)  ΣF_tire    比值      tr_F(mm)');
for (const r of rows) {
  console.log(`${r.key.padEnd(11)} ${f2(r.mTotal).padStart(7)} ${f2(r.mSprungInv).padStart(14)} `
    + `${f2(r.sumFz).padStart(9)} ${(r.ratioFz * 100).toFixed(2).padStart(7)}% `
    + `${(r.trF * 1000).toFixed(3).padStart(9)}`);
}
console.log('注：tr≈0 是**预压弹簧**的设计选择（设计位 = 静平衡位），不是缺陷；'
  + '质量口径体现在"弹簧预压多少"而非"下沉多少"。');

console.log('\n=== A2. 簧下承重恒等式：F_tire − mU·g − FzSpr 应 ≈ 0 ===');
console.log('预设        FzSpr_F(N)  前角残差(N)   后角残差(N)');
for (const r of rows) {
  console.log(`${r.key.padEnd(11)} ${f2(r.FzSprF).padStart(10)} ${r.identF.toExponential(2).padStart(12)} `
    + `${r.identR.toExponential(2).padStart(12)}`);
}

console.log('\n=== B. 车身 heave 频率（Hz，悬挂阻尼临时归零）===');
console.log('预设        实测   串联等效(mTotal)  串联等效(mSprung)   实测vs总重   实测vs簧载');
for (const r of rows) {
  console.log(`${r.key.padEnd(11)} ${f2(r.fBodyMeas).padStart(6)} ${f2(r.fBodyTotal).padStart(16)} `
    + `${f2(r.fBodySprung).padStart(17)} ${pct(r.fBodyMeas, r.fBodyTotal).padStart(12)} `
    + `${pct(r.fBodyMeas, r.fBodySprung).padStart(12)}`);
}

console.log('\n=== C. 轮跳频率（Hz）===');
console.log('预设        实测    2DOF(mTotal)  2DOF(mSprung)  实测vs 2DOF总重');
for (const r of rows) {
  console.log(`${r.key.padEnd(11)} ${f2(r.fWheelMeas).padStart(6)} ${f2(r.fWheelTotal2dof).padStart(13)} `
    + `${f2(r.fWheelSprung2dof).padStart(14)} ${pct(r.fWheelMeas, r.fWheelTotal2dof).padStart(16)}`);
}

console.log('\n=== D. 决策门 ===');
const gap = rows.map(r => Math.abs(r.fBodySprung - r.fBodyTotal) / r.fBodyTotal);
const maxGap = Math.max(...gap);
const errTotal = rows.map(r => Math.abs(r.fBodyMeas - r.fBodyTotal) / r.fBodyTotal);
const errSprung = rows.map(r => Math.abs(r.fBodyMeas - r.fBodySprung) / r.fBodySprung);
const maxErrTotal = Math.max(...errTotal);
const maxErrSprung = Math.max(...errSprung);
console.log(`两种质量口径的 heave 频率差：最大 ${(maxGap * 100).toFixed(1)}%（门限 5%）`);
console.log(`实测 vs 串联等效(mTotal) 最大偏差：${(maxErrTotal * 100).toFixed(1)}%`);
console.log(`实测 vs 串联等效(mSprung) 最大偏差：${(maxErrSprung * 100).toFixed(1)}%`);
if (maxGap > 0.05 && maxErrTotal < maxErrSprung) {
  console.log('⇒ **建议拆分**：实测贴 mTotal 口径，说明车身垂向确实用了总质量；'
    + `按簧载质量算应高 ${(maxGap * 100).toFixed(1)}%`);
  console.log('   拆法：车身垂向用 mSprung、簧下方程补 mU·g；平面方程保持 mTotal（总惯性是对的）');
} else if (maxGap <= 0.05) {
  console.log('⇒ **不必拆分**：差异 <5%，登记为有意简化即可');
} else {
  console.log('⇒ **先查实测**：实测既不贴 mTotal 也不贴 mSprung，说明还有别的耦合项在主导');
}
process.exit(0);
