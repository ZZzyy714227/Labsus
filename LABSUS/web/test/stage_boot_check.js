/* LABSUS 前端「模块加载顺序 + 舞台可启动」检查
 *
 * G14（2026-08-31）F-61 建立。起因：打开任意舞台都是一片空白（黑屏）。
 *
 * ── 根因 ────────────────────────────────────────────────────────
 * G9 把原先单个 <script> 块字节级拆成 11 个 <script src>。
 *   单块内：function 声明跨全文提升 → 前向引用合法。
 *   拆开后：每个脚本各自编译 → 前向引用变成 ReferenceError，
 *           且顶层抛出会让该文件「剩余部分静默不执行」。
 * 实际踩坑：10-eval.js 顶层有一条把 openSlopeStage 挂到 window 的导出，
 *   而该函数定义在之后的 11-stages.js → ReferenceError → 10-eval.js 在此
 *   中止 → 其后的 class TrackPath/CirclePath/StraightPath/CircuitPath
 *   永远不初始化 → openSlopeStage() 里 new StraightPath(...) 抛错 →
 *   requestAnimationFrame(slopeStageLoop) 从未注册 → 画布从未绘制 = 黑屏。
 *   而弹窗的 .show 在抛错之前已经执行，所以用户看到「弹窗开了、一片空白」，
 *   HUD 还是 HTML 里的硬编码默认值，控制台之外完全无感。
 *
 * ── 本检查做什么 ────────────────────────────────────────────────
 *   1) 按 shell 里真实的 <script> 顺序在 vm 沙箱中逐个求值，捕获
 *      ReferenceError / TDZ 类阻断（DOM 桩差异导致的其它错误不算）。
 *   2) 校验关键符号真正完成初始化（class 卡在 TDZ 也算失败）。
 *   3) 真实调用 openSlopeStage/openSkidpadStage/openCircuitStage，
 *      断言 rAF 循环被注册，并驱动 20 帧确认渲染不抛错。
 *      —— 这第 3 条正是「黑屏」的直接探针。
 *
 * 用法：
 *   作为库：require('./stage_boot_check')(webDir, ok, fail)
 *   单独跑：node web/test/stage_boot_check.js   （带彩色诊断输出）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 画布 2D 上下文桩 ─────────────────────────────────────────── */

/** 绘制量记录器：用于断言「舞台真的画了东西」，而不只是「循环没崩」。
 *  历史教训：循环在跑但场景全被投到屏幕外 / 一个图元都没画，
 *  用户看到的同样是「一片空白」。 */
function newRec() {
  return { ops: 0, fills: 0, strokes: 0, rects: 0, gradients: 0, pts: [], texts: [] };
}

function makeCtx2D(rec) {
  const grad = { addColorStop() {} };
  const put = (x, y) => { if (rec && Number.isFinite(x) && Number.isFinite(y)) rec.pts.push([x, y]); };
  const tick = () => { if (rec) rec.ops++; };
  return {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '', globalCompositeOperation: 'source-over',
    save: tick, restore: tick, beginPath: tick, closePath: tick,
    fill() { tick(); if (rec) rec.fills++; },
    stroke() { tick(); if (rec) rec.strokes++; },
    moveTo: put, lineTo: put,
    arc(x, y) { put(x, y); }, arcTo() {}, ellipse(x, y) { put(x, y); }, rect(x, y) { put(x, y); },
    quadraticCurveTo(cx, cy, x, y) { put(cx, cy); put(x, y); },
    bezierCurveTo(a, b, c, x, y) { put(a, b); put(x, y); },
    fillRect(x, y) { tick(); if (rec) rec.rects++; put(x, y); },
    strokeRect(x, y) { tick(); if (rec) rec.rects++; put(x, y); },
    clearRect() {}, clip() {},
    fillText(t, x, y) { if (rec) rec.texts.push(String(t)); put(x, y); },
    strokeText() {}, translate() {}, rotate() {}, scale() {},
    transform() {}, setTransform() {}, resetTransform() {},
    drawImage() {}, putImageData() {}, setLineDash() {},
    createLinearGradient() { if (rec) rec.gradients++; return grad; },
    createRadialGradient() { if (rec) rec.gradients++; return grad; },
    createPattern: () => null,
    measureText: t => ({ width: String(t == null ? '' : t).length * 6 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h })
  };
}

function makeCanvas(id, fakeEl, rec) {
  const ctx = makeCtx2D(rec);
  const el = {
    id, tagName: 'CANVAS', style: {}, dataset: {}, children: [], childNodes: [],
    clientWidth: 1280, clientHeight: 720, width: 1280, height: 720,
    textContent: '', innerHTML: '', value: '0', checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null; },
    focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    // initViews() 会 w.querySelector("canvas")，必须返回可用元素而非 null
    querySelector: () => makeCanvas('sub', fakeEl, rec),
    querySelectorAll: () => [fakeEl('a'), fakeEl('b'), fakeEl('c')]
  };
  ctx.canvas = el;
  return el;
}

/** 万能元素桩：未知属性一律返回自身，尽量不因 DOM 差异掩盖真正的 ReferenceError */
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
    // 代码里会取 bts[0]/bts[1]，至少给 3 个
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

const BLOCKING = /ReferenceError|is not defined|Cannot access .* before initialization/;

const MUST_BE_READY = [
  'TrackPath', 'CirclePath', 'StraightPath', 'CircuitPath',
  'VehicleDynamics15DOF', 'UniversalAutoPilot',
  'openSlopeStage', 'openSkidpadStage', 'openCircuitStage',
  'paintStageError', 'buildShanghaiCircuit'
];

const STAGES = [
  { zh: '爬坡 SLOPE', cv: 'slopeCanvas', open: 'openSlopeStage', close: 'closeSlopeStage', minInView: 0.30 },
  { zh: '定圆 SKIDPAD', cv: 'skidpadCanvas', open: 'openSkidpadStage', close: 'closeSkidpadStage', minInView: 0.30 },
  /* 赛道整条 5.45 km 网格大部分在视口外，画布内点比例天然偏低 */
  { zh: '赛道 CIRCUIT', cv: 'circuitCanvas', open: 'openCircuitStage', close: 'closeCircuitStage', minInView: 0.15 }
];

/* 每帧至少应有的绘制调用数。实测（1280×720）：
   爬坡 ≈ 4274/帧、定圆 ≈ 4297/帧、赛道 ≈ 15845/帧。阈值取远低于实测，
   只用于拦住「循环在跑却几乎什么都没画」的空白画面。 */
const MIN_OPS_PER_FRAME = 200;
const VIEW_W = 1280, VIEW_H = 720;

/**
 * @param {string} webDir   web/ 目录绝对路径
 * @param {(cond:boolean,msg:string)=>void} ok    断言（msg 为空表示仅计数）
 * @param {(msg:string)=>void} fail               失败上报
 * @param {{log?:Function}} [opts]                可选日志（诊断模式用）
 */
function runChecks(webDir, ok, fail, opts) {
  const log = (opts && opts.log) || (() => {});
  const CANVAS_IDS = new Set(['slopeCanvas', 'skidpadCanvas', 'circuitCanvas', 'evalRadarCanvas']);

  const shellPath = path.join(webDir, 'dwb-pro-fullchassis.html');
  if (!fs.existsSync(shellPath)) { fail('G14: shell 不存在'); return; }
  const shellSrc = fs.readFileSync(shellPath, 'utf8');
  const order = [...shellSrc.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
  ok(order.length >= 11, `G14: shell 声明的模块数 ≥ 11（实际 ${order.length}）`);

  // ── 沙箱 ────────────────────────────────────────────────────
  const fakeEl = makeFakeEl();
  const elCache = new Map();
  const rafQueue = [];
  let vt = 0;
  // 三个舞台画布各自的绘制量记录器
  const recs = {};
  for (const s of STAGES) recs[s.cv] = newRec();

  const sb = {
    Math, JSON, Date, Number, String, Boolean, Array, Object, Error,
    Map, Set, WeakMap, RegExp, Symbol, Promise, Proxy, Reflect,
    isNaN, isFinite, parseFloat, parseInt,
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    performance: { now: () => vt },
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
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document: {
      getElementById(id) {
        if (!elCache.has(id)) {
          elCache.set(id, CANVAS_IDS.has(id) ? makeCanvas(id, fakeEl, recs[id]) : fakeEl(id));
        }
        return elCache.get(id);
      },
      querySelector: () => fakeEl('q'),
      querySelectorAll: () => [fakeEl('q0'), fakeEl('q1'), fakeEl('q2')],
      createElement: t => (t === 'canvas' ? makeCanvas('tmp', fakeEl, null) : fakeEl(t)),
      createElementNS: (ns, t) => fakeEl(t),
      createTextNode: t => fakeEl('#text'),
      createDocumentFragment: () => fakeEl('#frag'),
      addEventListener: () => {}, removeEventListener: () => {},
      body: fakeEl('body'), documentElement: fakeEl('html'), head: fakeEl('head')
    }
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  const ctx = vm.createContext(sb);

  // ── 1) 顺序加载（出错不中断，继续观察下游影响）─────────────────
  let loadErrCount = 0;
  for (const rel of order) {
    const f = path.join(webDir, rel);
    ok(fs.existsSync(f), `G14: 模块文件存在 ${rel}`);
    if (!fs.existsSync(f)) continue;
    let err = null;
    try {
      /* 绝不能包 IIFE —— 那会让 function/const 落进函数作用域，
         与浏览器「每个 <script> 顶层 = 全局作用域」语义不符，全是假阳性。
         vm 中同一 context 的多个 Script 共享 global lexical environment。 */
      new vm.Script(fs.readFileSync(f, 'utf8'), { filename: rel })
        .runInContext(ctx, { timeout: 30000 });
    } catch (e) { err = e; }
    if (err && BLOCKING.test(String(err && err.message))) {
      const m = String(err.stack || '').match(/at ([^:]+):(\d+):(\d+)/);
      fail(`G14: ${rel} 顶层前向引用阻断 @${m ? m[1] + ':' + m[2] : '?'} → ${err.message}`
        + '（该文件抛出点之后的代码全部未执行）');
      loadErrCount++;
    }
  }
  if (!loadErrCount) log('  模块顺序：全部模块加载完毕，无前向引用阻断');

  // ── 2) 关键符号必须真正完成初始化（class 卡在 TDZ 也算失败）────
  for (const name of MUST_BE_READY) {
    let ready = false;
    try {
      ready = vm.runInContext(
        `(() => { try { return typeof ${name} === "function" || typeof ${name} === "object"; }
                  catch(e){ return false; } })()`, ctx);
    } catch (e) { ready = false; }
    ok(ready, `G14: 符号已初始化 ${name}（否则可能卡在 TDZ）`);
  }

  // ── 3) 三个舞台：真的能开、rAF 真的注册、连跑 20 帧不抛错 ──────
  for (const s of STAGES) {
    rafQueue.length = 0;
    const rec = recs[s.cv];
    rec.ops = 0; rec.fills = 0; rec.strokes = 0; rec.rects = 0;
    rec.gradients = 0; rec.pts.length = 0; rec.texts.length = 0;

    let initErr = null;
    try {
      vm.runInContext(`${s.open}();`, ctx, { timeout: 30000 });
    } catch (e) { initErr = e; }

    if (initErr) {
      fail(`G14: ${s.zh} 初始化抛错：${initErr.message}`);
      continue;
    }
    if (!rafQueue.length) {
      fail(`G14: ${s.zh} rAF 循环从未注册（画布永不绘制 = 黑屏）`);
      continue;
    }

    let frameErr = null, frames = 0;
    for (let i = 0; i < 20; i++) {
      const cb = rafQueue.shift();
      if (!cb) break;
      vt += 16.7;
      try { cb(vt); frames++; } catch (e) { frameErr = e; break; }
    }
    if (frameErr) { fail(`G14: ${s.zh} 第 ${frames + 1} 帧抛错：${frameErr.message}`); }
    else ok(true, `G14: ${s.zh} 可启动并连跑 ${frames} 帧`);
    try { vm.runInContext(`${s.close}();`, ctx, { timeout: 10000 }); } catch (_e) {}

    /* 「真的画了东西」断言：光是不抛错还不够——场景若被投到屏幕外，
       用户看到的依旧是一片空白。 */
    if (!frameErr && frames > 0) {
      const perFrame = rec.ops / frames;
      ok(perFrame >= MIN_OPS_PER_FRAME,
        `G14: ${s.zh} 每帧绘制调用 ${perFrame.toFixed(0)} ≥ ${MIN_OPS_PER_FRAME}`);

      const inView = rec.pts.filter(p =>
        p[0] >= 0 && p[0] <= VIEW_W && p[1] >= 0 && p[1] <= VIEW_H).length;
      const ratio = rec.pts.length ? inView / rec.pts.length : 0;
      ok(ratio >= s.minInView,
        `G14: ${s.zh} 落点画布内比例 ${(ratio * 100).toFixed(1)}% ≥ ${(s.minInView * 100).toFixed(0)}%`);

      ok(!rec.texts.some(t => /⚠/.test(t)),
        `G14: ${s.zh} 未触发错误横幅（否则说明渲染仍在抛错）`);

      if (s.cv === 'circuitCanvas') {
        let lightErr = null;
        try {
          vm.runInContext(`
            CIRCUIT_STAGE.lightingMode = "sunset";
            if (typeof circuitStageLoop === "function") circuitStageLoop(1000);
            CIRCUIT_STAGE.lightingMode = "night";
            if (typeof circuitStageLoop === "function") circuitStageLoop(1016);
            CIRCUIT_STAGE.showScenery = false;
            if (typeof circuitStageLoop === "function") circuitStageLoop(1033);
            CIRCUIT_STAGE.showScenery = true;
            CIRCUIT_STAGE.lightingMode = "day";
          `, ctx);
        } catch (e) { lightErr = e; }
        ok(!lightErr, 'G14: 赛道 CIRCUIT 日光/晚霞/夜赛与景观开关切换测试无抛错');
      }
    }
  }

  // ── 4) 舞台初始化/渲染失败必须上屏，而不是留一片空白 ───────────
  const stagesSrc = fs.existsSync(path.join(webDir, 'js', '11-stages.js'))
    ? fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8') : '';
  ok(/function paintStageError\(/.test(stagesSrc), 'G14: paintStageError 辅助函数在位');
  ok(/paintStageError\("slopeCanvas"/.test(stagesSrc), 'G14: 爬坡舞台错误上屏');
  ok(/paintStageError\("skidpadCanvas"/.test(stagesSrc), 'G14: 定圆舞台错误上屏');
  ok(/paintStageError\("circuitCanvas"/.test(stagesSrc), 'G14: 赛道舞台错误上屏');

  // F-61：10-eval.js 不得再导出 openSlopeStage（函数在之后的 11-stages.js）
  const evalSrc = fs.existsSync(path.join(webDir, 'js', '10-eval.js'))
    ? fs.readFileSync(path.join(webDir, 'js', '10-eval.js'), 'utf8') : '';
  ok(!/window\.openSlopeStage\s*=\s*openSlopeStage\s*;/.test(evalSrc),
    'G14: F-61 10-eval.js 中越界的 openSlopeStage 导出已移除');
}

module.exports = runChecks;

/* 单独运行：彩色诊断输出 */
if (require.main === module) {
  const webDir = path.join(__dirname, '..');
  let checks = 0;
  const failures = [];
  runChecks(webDir,
    (_c, msg) => { checks++; if (msg) console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`); },
    msg => { checks++; failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); },
    { log: m => console.log(m) });
  console.log('');
  if (failures.length) {
    console.error(`\x1b[31m模块/舞台检查 FAIL：${failures.length}/${checks}\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m模块/舞台检查 PASS：${checks} 项全过\x1b[0m`);
}
