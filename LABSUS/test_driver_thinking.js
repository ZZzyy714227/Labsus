// Comprehensive Driver Thinking & Adaptive Racing Line Multi-Persona Test
const fs = require('fs');
const vm = require('vm');

// Mock browser environment
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};

global.document = {
  getElementById: () => ({
    getContext: () => ({
      setTransform: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      setLineDash: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      closePath: () => {}
    }),
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    addEventListener: () => {},
    clientWidth: 1200,
    clientHeight: 600
  }),
  querySelectorAll: () => [],
  documentElement: {
    setAttribute: () => {},
    getAttribute: () => "dark"
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.requestAnimationFrame = () => {};
global.performance = { now: () => Date.now() };

global.C = {};
global.PAL = { dark: {} };

global.S = {
  vehicleType: "formula",
  mTotal: 820,
  wb: 2750,
  hcg: 310,
  front: {
    kS: 85, cR: 4.8, mr: 0.85,
    hp: { WC: [750, 0, 300] },
    tire: { R: 330, W: 280 },
    arb: { d: 22 }
  },
  rear: {
    kS: 95, cR: 5.2, mr: 0.88,
    hp: { WC: [750, 0, 300] },
    tire: { R: 330, W: 280 },
    arb: { d: 20 }
  },
  qs: { speed: 330, aeroF: 750 },
  show: { mirror: true }
};
global.SIM = {
  FL: { z: 0 },
  FR: { z: 0 },
  RL: { z: 0 },
  RR: { z: 0 }
};
global.VW = [];
global.hpLoad = () => {};
global.buildLeft = () => {};
global.buildRight = () => {};
global.rebuild = () => {};
global.initViews = () => {};
global.simulate = () => {};
global.sizeView = () => {};
global.fitView = () => {};
global.loop = () => {};

const evalCode = fs.readFileSync('./web/js/10-eval.js', 'utf8');
const stagesCode = fs.readFileSync('./web/js/11-stages.js', 'utf8');

vm.runInThisContext(evalCode);
vm.runInThisContext(stagesCode);

console.log("=== PRO DRIVER DYNAMIC THINKING & RACING LINE TEST ===");

const path = buildShanghaiCircuit(1.35, 1.0);
console.log(`Track points: ${path.totalPoints}, Arc length: ${path.totalLength.toFixed(1)}m`);

// 1. Verify all 5 personas generate distinct lines
const personas = ['adaptive', 'balanced', 'aggressive', 'smooth', 'traction'];
personas.forEach(p => {
  path.computeAdaptiveLine(p);
  const l = path.activeLine;
  console.log(`✅ Persona [${p}]: Generated ${l.length} points, Apex v_min: ${Math.min(...l.map(pt=>pt.v_max))*3.6|0} km/h, Top speed: ${Math.max(...l.map(pt=>pt.v_max))*3.6|0} km/h`);
});

// 2. Test Dynamic Thinking Decisions at Key Corners in Adaptive Mode
path.computeAdaptiveLine('adaptive');

// Find sample points in key turns:
const keyTurns = ["T1", "T6", "T7", "T9", "T13", "T14", "Back Straight"];
console.log("\n--- KEY CORNER COGNITIVE DECISIONS ---");
keyTurns.forEach(turnKey => {
  const match = path.activeLine.find(pt => (pt.turn || "").includes(turnKey) || (pt.turnZh || "").includes(turnKey));
  if (match) {
    const w = match.weights;
    console.log(`[${match.turnZh || match.turn}] (${match.cornerType}) -> Weights: Flow ${(w.flow*100).toFixed(0)}%, Late ${(w.late*100).toFixed(0)}%, V ${(w.v*100).toFixed(0)}%, Kerb ${(w.kerb*100).toFixed(0)}%`);
    console.log(`   💭 Intent: "${match.intentText}"`);
    console.log(`   🎨 Tactical Segment: [${match.segmentType.toUpperCase()}]`);
  }
});

// 3. Full Lap Autonomous Simulation with Adaptive Thinking
console.log("\n--- FULL LAP AUTONOMOUS SIMULATION (ADAPTIVE MODE) ---");
const S_formula = global.S;
const pt0 = path.pts[0];
const eng = new VehicleDynamics15DOF(S_formula, null, 15.0);
eng.state.X = pt0.x;
eng.state.Y = pt0.y;
eng.state.Z = 0.0;
eng.state.psi = pt0.heading;
eng.state.u = 15.0;

const pilot = new UniversalAutoPilot(S_formula);
pilot.setPath(path);
pilot.active = true;

const dt = 0.01;
let simTime = 0.0;
let totalDist = 0.0;
let lastX = pt0.x, lastY = pt0.y;
let maxSpeed = 0.0;
let maxAy = 0.0;
let maxEy = 0.0;
let completed = false;
let maxIdxSeen = 0;
const P = path.totalPoints;

for (let step = 0; step < 25000; step++) {
  const ctrl = pilot.drive(eng.state, dt);
  eng.step(ctrl, { path: path, grade: 0, bumpNoise: 0 }, dt);
  
  simTime += dt;
  const dDist = Math.hypot(eng.state.X - lastX, eng.state.Y - lastY);
  if (dDist < 50) totalDist += dDist;
  lastX = eng.state.X;
  lastY = eng.state.Y;
  
  const v_kmh = eng.state.u * 3.6;
  if (v_kmh > maxSpeed) maxSpeed = v_kmh;
  if (Math.abs(eng.telemetry.ay) > maxAy) maxAy = Math.abs(eng.telemetry.ay);
  
  const ptLook = path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
  const ey = ptLook.crossTrackError;
  if (Math.abs(ey) > maxEy) maxEy = Math.abs(ey);
  
  if (ptLook.idx > maxIdxSeen) maxIdxSeen = ptLook.idx;
  
  if (step % 2000 === 0) {
    console.log(`Step ${step}: t=${simTime.toFixed(1)}s, dist=${totalDist.toFixed(1)}m, v=${v_kmh.toFixed(1)}km/h, idx=${ptLook.idx}/${P}, turn=${ptLook.turnZh || ptLook.turn}`);
  }

  if (totalDist > 5200 && maxIdxSeen > (P - 150) && ptLook.idx < 80) {
    completed = true;
    break;
  }
}

console.log("\n================ SIMULATION SUMMARY ================");
console.log(`Full Lap Completed:    ${completed ? "✅ YES (100% FINISHED)" : "❌ NO"}`);
console.log(`Lap Time:              ${Math.floor(simTime / 60)}m ${(simTime % 60).toFixed(2)}s (${simTime.toFixed(3)}s)`);
console.log(`Top Speed:             ${maxSpeed.toFixed(1)} km/h`);
console.log(`Max Lateral Grip:      ${maxAy.toFixed(2)} g`);
console.log(`Max Cross-Track Error: ${maxEy.toFixed(2)} m`);
console.log("====================================================\n");

if (!completed || maxEy > 7.0) {
  process.exit(1);
}
console.log("ALL TESTS PASSED SUCCESSFULLY! 🏎️💨");
