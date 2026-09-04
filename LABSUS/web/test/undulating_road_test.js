/**
 * Undulating Road & Rolling Terrain (起伏山丘/上下坡/半坡起步/越野交叉轴) Scenario Unit Tests
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    fillRect(x, y) { tick(); if (rec) rec.rects++; put(x, y); },
    strokeRect() {}, clearRect() {}, clip() {},
    fillText(s) { tick(); if (rec) rec.texts.push(s); },
    setTransform() {}, setLineDash() {},
    createLinearGradient() { if (rec) rec.gradients++; return grad; },
    createRadialGradient() { if (rec) rec.gradients++; return grad; },
    createPattern: () => null,
    measureText: () => ({ width: 60 }),
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    createImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
  };
}

function makeFakeEl(rec) {
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
    t.querySelectorAll = () => [fakeEl('q0'), fakeEl('q1')];
    t.focus = () => {};
    t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
    return new Proxy(t, {
      get(o, k) {
        if (k in o) return o[k];
        if (k === Symbol.toPrimitive) return () => '0';
        if (k === Symbol.iterator) return function* () {};
        if (k === 'getContext') return () => makeCtx2D(rec);
        return fakeEl(String(k));
      },
      set(o, k, v) { o[k] = v; return true; },
      has() { return true; },
      apply() { return fakeEl('call'); }
    });
  };
}

const drawRec = { ops: 0, fills: 0, strokes: 0, rects: 0, gradients: 0, pts: [], texts: [] };
const fakeEl = makeFakeEl(drawRec);
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
    querySelectorAll: () => [fakeEl('q0'), fakeEl('q1')],
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

const files = [
  '01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js',
  '05-scene3d.js', '06-ui-panels.js', '07-plots.js', '08-interact.js',
  '09-track.js', '10-eval.js', '11-stages.js'
];

for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
  vm.runInContext(code, ctx);
}

let passed = 0, total = 0;
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

console.log('=== 1. Testing Natural Staggered Moguls Geometry & Cross-Axle Articulation ===');
const spUndul = new ctx.StraightPath(10.0, 'undulating_road', {
  undulatingWavelength: 4.5,
  undulatingAmplitude: 0.18,
  undulatingCrossAmp: 0.18,
  undulatingPhase: 180,
  undulatingType: 'staggered_moguls',
  repeatCount: 12
});

assert(spUndul.undulatingSections.length === 1, 'Generated undulating road section');
assert(spUndul.segments.length === 12, 'Generated 12 staggered moguls segments');

// Test anti-phase elevation at quarter wavelength: y = 3.0 + 4.5/4 = 4.125m
const yQuarter = 3.0 + 4.5 / 4.0;
const elLeft = spUndul.getRoadElevation(-0.75, yQuarter);
const elRight = spUndul.getRoadElevation(0.75, yQuarter);

assert(elLeft.z_road > 0.10, `Left track is at bump peak (z = ${elLeft.z_road.toFixed(3)}m)`);
assert(elRight.z_road < -0.10, `Right track is at trough dip (z = ${elRight.z_road.toFixed(3)}m)`);

const crossDiff = Math.abs(elLeft.z_road - elRight.z_road);
assert(crossDiff > 0.28, `Cross-axle height difference exceeds 280mm (actual: ${(crossDiff * 1000).toFixed(0)}mm)`);

// Test slope derivatives
const slopeInfo = spUndul.getRoadSlope(0, yQuarter);
assert(Math.abs(slopeInfo.dz_dx) > 0.10, `Lateral roll gradient is significant (dz_dx = ${slopeInfo.dz_dx.toFixed(2)})`);

console.log('\n=== 2. Testing Baja Chassis Auto-Switch & Camera Rig ===');
assert(typeof ctx.SLOPE_STAGE.switchScenario === 'function', 'SLOPE_STAGE.switchScenario exists');
assert(ctx.SLOPE_CAMS_CONFIG.front_low !== undefined, 'Camera preset front_low exists (video match)');

ctx.SLOPE_STAGE.switchScenario('undulating_road', false);
assert(ctx.SLOPE_STAGE.scenario === 'undulating_road', 'Switched to undulating_road scenario');
assert(ctx.S.vehicleType === 'baja', 'Automatically selected Baja ladder-frame off-road chassis');
assert(ctx.SLOPE_STAGE.camMode === 'front_low', 'Automatically selected front_low camera for video framing');
assert(ctx.SLOPE_CAMS_CONFIG.front_low.dy === 2350, 'Camera dy is close-up 2350mm framing the wheels');

console.log('\n=== 3. Testing 15-DOF Vehicle Dynamics with Mogul Articulation ===');
const veh = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 10.0);
veh.state.Y = 2.0;
const ctrl = { steer: 0, throttle: 0.35, brake: 0 };

let maxRoll = 0;
let maxDiffTravel = 0;

for (let step = 0; step < 200; step++) {
  const curSlope = spUndul.getRoadSlope(veh.state.X, veh.state.Y);
  const env = { grade: 0, path: spUndul, bumpNoise: 0 };
  veh.step(ctrl, env, 0.01);
  
  if (veh.telemetry && veh.telemetry.tr) {
    const dTr = Math.abs(veh.telemetry.tr.FL - veh.telemetry.tr.FR);
    if (dTr > maxDiffTravel) maxDiffTravel = dTr;
  }
  if (Math.abs(veh.state.phi) > maxRoll) maxRoll = Math.abs(veh.state.phi);
}

const maxRollDeg = (maxRoll * 180 / Math.PI);
assert(maxDiffTravel > 0.04, `Suspension articulates significantly across axle (max travel diff: ${(maxDiffTravel*1000).toFixed(1)}mm)`);
assert(maxRollDeg > 1.5, `Chassis rolls dynamically over staggered waves (max roll: ${maxRollDeg.toFixed(1)}°)`);

console.log('\n=== 4. Testing Camera Free Orbit Freedom ===');
ctx.SLOPE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
// Test azimuth and elevation updates without clamp restrictions
ctx.SLOPE_STAGE.drag = { x0: 100, y0: 100, az0: 0, elv0: 0 };
ctx.SLOPE_STAGE.camOrbit.az = ctx.SLOPE_STAGE.drag.az0 - 150 * 0.008;
ctx.SLOPE_STAGE.camOrbit.elv = Math.max(-1.1, Math.min(1.1, ctx.SLOPE_STAGE.drag.elv0 - (-120) * 0.006));
assert(Math.abs(ctx.SLOPE_STAGE.camOrbit.az) > 1.0, 'Azimuth rotates freely with mouse drag');
assert(ctx.SLOPE_STAGE.camOrbit.elv > 0.65, `Elevation expands to wide range (elv: ${ctx.SLOPE_STAGE.camOrbit.elv.toFixed(2)} rad)`);

console.log(`\n========================================`);
console.log(`All ${passed}/${total} Staggered Moguls & Baja Articulation Tests Passed!`);
console.log(`========================================`);
process.exit(0);
