/**
 * test_15dof_steady.js —— `VehicleDynamics15DOF` 解析稳态锚（M5，2026-09-20）
 *
 * 存在理由：这台 15-DOF 舞台内核是前端唯一"整车瞬态"物理内核，但此前**没有任何
 * 跨语言或解析锚**——test_lap_15dof / proving_ground / stage_boot 都只做行为阈值
 * 断言（"不 NaN"、"会继续积分"、"跑完 2 圈"）。跨语言对拍（tphys_parity.cjs）
 * 校验的是 allinone 内联 TPHYS（Python transient 的 JS 移植），**不覆盖本内核**。
 *
 * 本文件用**可直接手算的解析关系**钉住它：
 *   1. 积分器重力锚：空中自由落体 w(t) = -g·t（验证 d_w = ΣFz/m 里含重力）
 *   2. 静态垂向平衡：ΣFz = m·g；前后轴分配 = b/wb（几何+弹簧静平衡）
 *   3. 直线守恒：无输入直行时 u 守恒、ψ/r 不漂
 *   4. 滑行单调：无驱动力时只减速不加速（阻力符号锚）
 *   5. 定圆稳态：r ≈ u·tanδ/wb（自行车模型），ay ≈ u·r
 *   6. 左右对称：δ→−δ 时 r 与 ay 反号且幅值一致（符号/镜像锚）
 *
 * 容差取"物理量级"而非"逐位"：本内核含 ARB/缓冲块/摩擦圆钳位等非线性环节，
 * 目标是"解析关系在 ±30% 内成立"，而不是数值复现。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtx2D() {
  const grad = { addColorStop() {} };
  return {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '', globalCompositeOperation: 'source-over',
    save() {}, restore() {}, beginPath() {}, closePath() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, ellipse() {}, rect() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, clip() {},
    fillText() {}, strokeText() {}, translate() {}, rotate() {}, scale() {},
    transform() {}, setTransform() {}, resetTransform() {},
    drawImage() {}, putImageData() {}, setLineDash() {},
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    createPattern: () => null,
    measureText: () => ({ width: 60 }),
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    createImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
  };
}

function makeFakeEl() {
  return function fakeEl(id) {
    const t = function () { return t; };
    t.id = id; t.style = {}; t.dataset = {}; t.children = []; t.childNodes = [];
    t.clientWidth = 1280; t.clientHeight = 720;
    t.value = '0'; t.checked = false; t.textContent = ''; t.innerHTML = '';
    t.width = 1280; t.height = 720;
    t.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    t.addEventListener = () => {}; t.removeEventListener = () => {};
    t.appendChild = () => {}; t.setAttribute = () => {}; t.getAttribute = () => null;
    t.querySelector = sel => fakeEl(String(sel));
    t.querySelectorAll = () => [fakeEl('q0'), fakeEl('q1'), fakeEl('q2')];
    t.focus = () => {};
    t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
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
  requestAnimationFrame: fn => setTimeout(fn, 16),
  cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  location: { href: 'http://127.0.0.1:714/dwb-pro-fullchassis.html', protocol: 'http:', search: '' },
  fetch: () => Promise.reject(new Error('no network in test')),
  alert: () => {}, confirm: () => true, prompt: () => null,
  addEventListener: () => {}, removeEventListener: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
  Image: class { set src(_v) {} addEventListener() {} },
  Path2D: class { moveTo() {} lineTo() {} arc() {} closePath() {} },
  WheelEvent: class {}, KeyboardEvent: class {}, MouseEvent: class {},
  console: console,
  document: {
    getElementById(id) {
      if (!elCache.has(id)) elCache.set(id, fakeEl(id));
      return elCache.get(id);
    },
    querySelector: () => fakeEl('q'),
    querySelectorAll: () => [fakeEl('q0'), fakeEl('q1'), fakeEl('q2')],
    createElement: t => fakeEl(t),
    createElementNS: (ns, t) => fakeEl(t),
    createTextNode: t => fakeEl('#text'),
    createDocumentFragment: () => fakeEl('#frag'),
    addEventListener: () => {}, removeEventListener: () => {},
    body: fakeEl('body'), documentElement: fakeEl('html'), head: fakeEl('head')
  }
};
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);

for (const f of ['01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js',
                 '05-scene3d.js', '06-ui-panels.js', '07-plots.js', '08-interact.js',
                 '09-track.js', '10-eval.js', '11-stages.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx, { filename: f });
}

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const G = 9.81;
const mkCtrl = o => Object.assign({ steer: 0, throttle: 0, brake: 0, drs: false }, o || {});
const ENV_FLAT = { grade: 0, bumpNoise: 0 };   // 无 path ⇒ 平路（getRoadElevation 缺省 0）
const sumFz = v => v.telemetry.Fz.FL + v.telemetry.Fz.FR + v.telemetry.Fz.RL + v.telemetry.Fz.RR;
const run = (v, ctrl, env, secs, dt) => {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) v.step(ctrl, env, dt);
};

console.log('=== 1. 积分器重力锚：空中自由落体 w(t) = -g·t ===');
{
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 0);
  v.state.Z = 2.0; v.state.w = 0;
  const T = 0.5;
  run(v, mkCtrl(), ENV_FLAT, T, 0.01);
  const expW = -G * T;
  assert(Math.abs(v.state.w - expW) / Math.abs(expW) < 0.03,
    `自由落体 0.5s 后 w=${v.state.w.toFixed(3)} m/s（解析 ${expW.toFixed(3)}，误差 ${(Math.abs(v.state.w - expW) / Math.abs(expW) * 100).toFixed(2)}%）`);
  const expZ = 2.0 - 0.5 * G * T * T;
  assert(Math.abs(v.state.Z - expZ) < 0.02,
    `自由落体 0.5s 后 Z=${v.state.Z.toFixed(3)} m（解析 ${expZ.toFixed(3)}）`);
}

console.log('=== 2. 静态垂向平衡：ΣFz = m·g，前后轴分配 = b/wb ===');
{
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 0);
  run(v, mkCtrl(), ENV_FLAT, 1.0, 0.01);
  const m = v.m;
  const tot = sumFz(v);
  assert(Math.abs(tot - m * G) / (m * G) < 0.03,
    `静载四轮合力 ΣFz=${tot.toFixed(1)} N ≈ m·g=${(m * G).toFixed(1)} N（误差 ${(Math.abs(tot - m * G) / (m * G) * 100).toFixed(2)}%）`);
  const shareF = (v.telemetry.Fz.FL + v.telemetry.Fz.FR) / tot;
  const expShare = v.b / v.wb;
  assert(Math.abs(shareF - expShare) < 0.03,
    `前轴静载占比 ${(shareF * 100).toFixed(1)}% ≈ b/wb=${(expShare * 100).toFixed(1)}%`);
  assert(Math.abs(v.state.phi) < 0.01 && Math.abs(v.state.theta) < 0.01,
    `静态无侧倾/俯仰（roll=${(v.state.phi * 180 / Math.PI).toFixed(3)}°, pitch=${(v.state.theta * 180 / Math.PI).toFixed(3)}°）`);
}

console.log('=== 3. 直线守恒：无输入直行 u 守恒、ψ/r 不漂 ===');
{
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 15);
  run(v, mkCtrl(), ENV_FLAT, 1.0, 0.01);
  assert(Math.abs(v.state.u - 15) / 15 < 0.05,
    `直行 1s 后 u=${v.state.u.toFixed(3)} m/s（仅空气阻力，起点 15）`);
  assert(Math.abs(v.state.psi) < 0.02 && Math.abs(v.state.r) < 0.02,
    `直行无横摆漂移（psi=${v.state.psi.toFixed(4)} rad, r=${v.state.r.toFixed(4)} rad/s）`);
}

console.log('=== 4. 滑行单调：无驱动时只减速不加速 ===');
{
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 25);
  let last = v.state.u, monotone = true;
  for (let i = 0; i < 100; i++) { v.step(mkCtrl(), ENV_FLAT, 0.02); if (v.state.u > last + 1e-9) monotone = false; last = v.state.u; }
  assert(monotone, '滑行 2s 内 u 单调不增（阻力方向锚）');
  assert(last < 25, `滑行 2s 末端 u=${last.toFixed(3)} < 25 m/s（确实在减速）`);
}

console.log('=== 5. 定圆稳态：|r| ≈ u·tanδ/wb，ay ≈ u·r（符号口径见下）===');
/* 符号口径（本轮实测钉死，勿当笔误）：
     本内核 X=右 / Y=前 / Z=上（state 注释同款），正 ψ = 车头偏向 −X = **左转**；
     `ctrl.steer` 正 = **右转**（UI：A 键 steer−=14 左转 / D 键 steer+=14 右转）。
   ⇒ r 与 steer **反号**。解析关系按 |r| = |u·tanδ/wb| 断言，符号单独断言。 */
let rPos = null, ayPos = null;
{
  const deltaDeg = 2.0, u0 = 10.0;
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, u0);
  run(v, mkCtrl({ steer: deltaDeg }), ENV_FLAT, 3.0, 0.01);
  const rRef = v.state.u * Math.tan(deltaDeg * Math.PI / 180) / v.wb;   // 幅值参考
  rPos = v.state.r;
  /* 通道口径：telemetry.ax = ΣFy/(m·g) 是**纵向**；telemetry.ay = −ΣFx/(m·g) 是**横向**。
     定圆稳态下横向加速度应与 v·r 同号同量级（这是比"非零"强得多的锚）。 */
  const ayMeas = v.telemetry.ay * G;
  const ayRef = v.state.u * v.state.r;
  ayPos = ayMeas;
  assert(v.state.r < 0 && Math.abs(Math.abs(v.state.r) - rRef) / rRef < 0.10,
    `定圆 |r|=${Math.abs(v.state.r).toFixed(4)} rad/s（自行车模型 ${rRef.toFixed(4)}，误差 ${(Math.abs(Math.abs(v.state.r) - rRef) / rRef * 100).toFixed(1)}%）；steer=+2°（右转）→ r<0 符合符号口径`);
  assert(Math.abs(Math.abs(ayRef) / G - 0.22) < 0.05,
    `横向加速度 |ay|=|v·r|=${(Math.abs(ayRef) / G).toFixed(3)} g（10 m/s @ 2° 定圆约 0.22 g）`);
  assert(Math.sign(ayMeas) === Math.sign(ayRef) && Math.abs(ayMeas - ayRef) / Math.abs(ayRef) < 0.15,
    `telemetry.ay 通道与 v·r 一致（实测 ${(ayMeas / G).toFixed(3)} g vs 解析 ${(ayRef / G).toFixed(3)} g）`);
}

console.log('=== 6. 左右对称：δ→−δ 时 r 反号且幅值一致 ===');
{
  const u0 = 10.0;
  const v = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, u0);
  run(v, mkCtrl({ steer: -2.0 }), ENV_FLAT, 3.0, 0.01);
  const rNeg = v.state.r;
  assert(rPos < 0 && rNeg > 0,
    `转向反号 ⇒ 横摆角速度反号（+2°(右) → r=${rPos.toFixed(4)}；−2°(左) → r=${rNeg.toFixed(4)}）`);
  assert(Math.abs(Math.abs(rNeg) - Math.abs(rPos)) / Math.abs(rPos) < 0.05,
    `左右幅值对称（|r| 相对差 ${(Math.abs(Math.abs(rNeg) - Math.abs(rPos)) / Math.abs(rPos) * 100).toFixed(2)}%）`);
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} 15-DOF steady-state anchor checks passed!`);
console.log(`========================================`);
process.exit(0);
