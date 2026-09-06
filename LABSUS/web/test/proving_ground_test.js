/**
 * Proving Ground Multi-Scenario & Airborne Physics Unit Tests
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

// Load files 01 through 11
const files = [
  '01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js',
  '05-scene3d.js', '06-ui-panels.js', '07-plots.js', '08-interact.js',
  '09-track.js', '10-eval.js', '11-stages.js'
];

for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
  vm.runInContext(code, ctx);
}

let passed = 0;
let total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${msg}`);
    passed++;
  }
}

console.log("=== 1. Testing StraightPath Multi-Scenario Engine ===");

// 1.1 Jump Ramp Scenario (10x Consecutive Ramps)
const spJump = new ctx.StraightPath(25, "jump_ramp", { rampY: 30.0, rampHeight: 1.2, rampLen: 15.0, repeatCount: 10 });
assert(spJump.ramps.length === 10, `Generated 10 consecutive jump ramps (count=${spJump.ramps.length})`);

const el0 = spJump.getRoadElevation(0, 10);
const elRampMid = spJump.getRoadElevation(0, 37.5);
const elRampTop = spJump.getRoadElevation(0, 44.9);
const elAfterRamp = spJump.getRoadElevation(0, 46.0);

assert(el0.z_road === 0, "Flat road before ramp has z_road=0");
assert(elRampMid.z_road > 0.4 && elRampMid.z_road < 0.8, `Ramp midpoint height is progressive (${elRampMid.z_road}m)`);
assert(elRampTop.z_road > 1.15, `Ramp apex height matches rampHeight parameter (${elRampTop.z_road}m)`);
assert(elAfterRamp.z_road === 0, "Road drops to 0 immediately after ramp lip (launch drop-off)");

// Test second ramp in the 10-ramp series
const r2 = spJump.ramps[1];
const elR2Mid = spJump.getRoadElevation(0, r2.y0 + 7.5);
assert(elR2Mid.z_road > 0.4, `Second ramp in series has progressive height (${elR2Mid.z_road}m)`);

// 1.2 Moose Test Scenario (5x Consecutive Double Lane Changes)
const spMoose = new ctx.StraightPath(20, "moose_test", { repeatCount: 5 });
assert(spMoose.mooseSections.length === 5, `Generated 5 consecutive moose test sections (count=${spMoose.mooseSections.length})`);
assert(spMoose._cones && spMoose._cones.length >= 50, `Moose test generates ${spMoose._cones.length} ISO 3888-2 cones`);

// Check alternating left/right evasion
assert(spMoose.mooseSections[0].offset < 0, "First moose section evades left");
assert(spMoose.mooseSections[1].offset > 0, "Second moose section evades right");

const hitsNoCollision = spMoose.checkConeCollisions(0, 0, 0, 1.8, 4.0);
assert(hitsNoCollision === 0, "No cone collisions at starting point");

const c0 = spMoose._cones[0];
const hitsCollided = spMoose.checkConeCollisions(c0.x, c0.y, 0, 2.0, 4.5);
assert(hitsCollided >= 1, `Cone collision properly registered (hits=${hitsCollided})`);

// 1.3 Split-Mu Scenario
const spSplitMu = new ctx.StraightPath(20, "split_mu", { muLeft: 1.3, muRight: 0.3 });
assert(spSplitMu.getMu(-1.0, 50) === 1.3, "Left surface has high mu (1.3)");
assert(spSplitMu.getMu(1.0, 50) === 0.3, "Right surface has low mu (0.3)");

// 1.4 Speed Bumps & Cleats Scenario
const spBumps = new ctx.StraightPath(15, "bumps_cleats", { bumpStartY: 25.0, bumpHeight: 0.06, bumpSpacing: 4.0 });
const elBumpPeak = spBumps.getRoadElevation(-1.2, 25.5);
assert(elBumpPeak.z_road > 0.058, `Speed bump peak elevation detected (${elBumpPeak.z_road.toFixed(3)}m)`);

// 1.5 Washboard & Potholes Scenario
const spWash = new ctx.StraightPath(15, "washboard_potholes", { washboardAmplitude: 0.035, potholeDepth: -0.055 });
const elWash = spWash.getRoadElevation(0, 22.0);
assert(Math.abs(elWash.z_road) > 0.01, `Washboard ripple elevation generated (${elWash.z_road.toFixed(3)}m)`);

// 1.6 Default Comprehensive Master Loop
const spComp = new ctx.StraightPath(23.6, "comprehensive");
assert(spComp.segments.length >= 7, `Comprehensive mode compiles 7-segment proving ground loop (count=${spComp.segments.length})`);
assert(spComp.ramps.length === 3, `Comprehensive mode contains 3x consecutive ramps`);
assert(spComp.mooseSections.length === 2, `Comprehensive mode contains 2x continuous moose tests`);
assert(spComp.gantries.length >= 7, `Comprehensive mode generates overhead gantries`);

console.log("=== 2. Testing VehicleDynamics15DOF 6-DOF Airborne Dynamics ===");
const veh = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 25.0);

// Place vehicle in air
veh.state.Z = 1.5; // 1.5m in the air
veh.state.w = 2.0; // rising

const ctrl = { steer: 0, throttle: 0, brake: 0 };
const env = { grade: 0, path: spJump, bumpNoise: 0 };

veh.step(ctrl, env, 0.05);

assert(veh.telemetry.Fz.FL === 0 && veh.telemetry.Fz.FR === 0, "Normal forces are 0 when airborne");
assert(veh.state.w < 2.0, `Vehicle accelerates downward under gravity (w=${veh.state.w.toFixed(2)} m/s)`);

console.log("=== 3. Testing SLOPE_STAGE Suite API ===");
assert(typeof ctx.SLOPE_STAGE.switchScenario === 'function', "SLOPE_STAGE.switchScenario is exposed");
assert(typeof ctx.SLOPE_STAGE.resetVehicle === 'function', "SLOPE_STAGE.resetVehicle is exposed");

ctx.SLOPE_STAGE.switchScenario("comprehensive", false);
assert(ctx.SLOPE_STAGE.scenario === "comprehensive", "Switched scenario to comprehensive (default)");

ctx.SLOPE_STAGE.switchScenario("jump_ramp", false);
assert(ctx.SLOPE_STAGE.scenario === "jump_ramp", "Switched scenario to jump_ramp");

ctx.SLOPE_STAGE.switchScenario("moose_test", false);
assert(ctx.SLOPE_STAGE.scenario === "moose_test", "Switched scenario to moose_test");

ctx.SLOPE_STAGE.switchScenario("bumps_cleats", false);
assert(ctx.SLOPE_STAGE.scenario === "bumps_cleats", "Switched scenario to bumps_cleats");

ctx.SLOPE_STAGE.switchScenario("accel_brake", false);
assert(ctx.SLOPE_STAGE.scenario === "accel_brake", "Switched scenario to accel_brake");

ctx.SLOPE_STAGE.switchScenario("split_mu", false);
assert(ctx.SLOPE_STAGE.scenario === "split_mu", "Switched scenario to split_mu");

ctx.SLOPE_STAGE.switchScenario("undulating_road", false);
assert(ctx.SLOPE_STAGE.scenario === "undulating_road", "Switched scenario to undulating_road");
assert(ctx.SLOPE_STAGE.camMode === "front_low", "Auto-switched camera to front_low for undulating_road");

// ── G32 修复回归：RIG 模式暂停（simulate(0)）不得 NaN 毒化机构 ──
// 根因：暂停帧 dt=0 进入 stepDyn 后 h=dt/NS=0，速度差分 (p-pp)/0=NaN 污染全部
// 节点，复位前不可自愈（用户报告：RIG 点一次暂停画面冻死、读数全 "--"）。
console.log("=== G32-fix: RIG pause (dt=0) must not poison mechanism ===");
vm.runInContext("S.mode='rig'; S.road='sine'; S.play=true;", ctx);
vm.runInContext("simulate(0.016); simulate(0.016);", ctx);
const trRun = vm.runInContext("SIM.mFR.tr", ctx);
assert(isFinite(trRun), `RIG run frames produce finite travel (tr=${trRun.toFixed(3)})`);
vm.runInContext("simulate(0); simulate(0); simulate(0);", ctx);
const trPause = vm.runInContext("SIM.mFR.tr", ctx);
assert(isFinite(trPause), `RIG pause frames (dt=0) keep travel finite (tr=${trPause})`);
vm.runInContext("simulate(0.016);", ctx);
const trResume = vm.runInContext("SIM.mFR.tr", ctx);
assert(isFinite(trResume), `RIG resume after pause stays finite (tr=${trResume})`);
assert(trResume !== trPause, "RIG actually integrates again after resume");

console.log(`\n========================================`);
console.log(`All ${passed}/${total} Proving Ground Unit Tests Passed!`);
console.log(`========================================`);
process.exit(0);
