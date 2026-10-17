/**
 * _stage_harness.js —— 15-DOF 舞台内核的 node 沙箱加载器（P0 地基工具，2026-10-17）
 *
 * 存在理由：`test_15dof_steady.js` / `test_lap_15dof.js` / `proving_ground_test.js`
 * 各自**内联复制了一整份 DOM 沙箱**（约 100 行）。要做能量审计 / 步长收敛这类
 * 新诊断工具时，再抄第四份会让沙箱口径漂移（一处改了别处没改 ⇒ 诊断结果不可比）。
 * 本文件把沙箱抽成单一真源，供新增诊断工具复用。
 *
 * ⚠ 不改动既有测试文件 —— 它们的内联沙箱保持原样（回归面为零）；
 *   新工具一律 `require('./_stage_harness.js')`。
 *
 * 沙箱内容逐字取自 `test_15dof_steady.js`（同一套 fakeEl / Proxy / vm context），
 * 保证与既有测试同口径。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** 默认加载 01~11（与 test_15dof_steady 同一份清单） */
const MODULES_01_11 = ['01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js',
  '05-scene3d.js', '06-ui-panels.js', '07-plots.js', '08-interact.js',
  '09-track.js', '10-eval.js', '11-stages.js'];

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

/**
 * 建一个新沙箱并加载指定模块。
 * @param {string[]} [files] 模块清单，缺省 MODULES_01_11
 * @returns {{ctx: object, run: Function, G: number, mkCtrl: Function, ENV_FLAT: object}}
 */
function loadStage(files) {
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

  const list = files || MODULES_01_11;
  for (const f of list) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx, { filename: f });
  }

  const G = 9.81;
  const mkCtrl = o => Object.assign({ steer: 0, throttle: 0, brake: 0, drs: false }, o || {});
  const ENV_FLAT = { grade: 0, bumpNoise: 0 };   // 无 path ⇒ 平路（getRoadElevation 缺省 0）
  /** 推进 secs 秒（dt 秒一步） */
  const run = (v, ctrl, env, secs, dt) => {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) v.step(ctrl, env, dt);
    return v;
  };

  return { ctx, run, G, mkCtrl, ENV_FLAT };
}

module.exports = { loadStage, MODULES_01_11, makeCtx2D, makeFakeEl };
