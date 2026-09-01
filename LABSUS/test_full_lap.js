// Full Lap Autonomous Driving & Telemetry Smoothness Inspection
const fs = require('fs');
const vm = require('vm');

// Comprehensive Browser mock environment
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

// Provide vehicle & simulation globals
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

console.log("=== SHANGHAI INTERNATIONAL CIRCUIT (5.45km) TELEMETRY QUALITY CHECK ===");

const path = buildShanghaiCircuit(1.35, 1.0);
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
let maxAx = 0.0;
let maxEy = 0.0;
let kerbHits = 0;
let completed = false;

let s1Time = null, s2Time = null, s3Time = null;
let lastSector = 1;

const logData = [];
const P = path.pts.length;
let maxIdxSeen = 0;
let chatterTransitions = 0; // count of instant switches from throttle > 50% directly to brake > 50% in consecutive steps
let lastThr = 0, lastBrk = 0;

for (let step = 0; step < 20000; step++) {
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
  if (Math.abs(eng.telemetry.ax) > maxAx) maxAx = Math.abs(eng.telemetry.ax);
  
  const ptLook = path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
  const ey = ptLook.crossTrackError;
  if (Math.abs(ey) > maxEy) maxEy = Math.abs(ey);
  
  if (ptLook.idx > maxIdxSeen) maxIdxSeen = ptLook.idx;
  
  const onKerb = eng.telemetry.isKerb && (eng.telemetry.isKerb.FL || eng.telemetry.isKerb.FR || eng.telemetry.isKerb.RL || eng.telemetry.isKerb.RR);
  if (onKerb) kerbHits++;

  // Check chatter
  if ((ctrl.throttle > 0.4 && lastBrk > 0.4) || (ctrl.brake > 0.4 && lastThr > 0.4)) {
    chatterTransitions++;
  }
  lastThr = ctrl.throttle;
  lastBrk = ctrl.brake;

  const curSector = ptLook.sector || 1;
  if (lastSector === 1 && curSector === 2 && !s1Time) {
    s1Time = simTime;
  } else if (lastSector === 2 && curSector === 3 && !s2Time) {
    s2Time = simTime - s1Time;
  }
  lastSector = curSector;
  
  if (step % 10 === 0) {
    logData.push({
      t: simTime,
      s: totalDist,
      v: v_kmh,
      v_tar: (ptLook.targetSpeed * 3.6),
      thr: ctrl.throttle * 100,
      brk: ctrl.brake * 100,
      steer: ctrl.steer,
      ay: eng.telemetry.ay,
      ax: eng.telemetry.ax,
      tr_FL: eng.telemetry.tr.FL * 1000,
      tr_FR: eng.telemetry.tr.FR * 1000,
      tr_RL: eng.telemetry.tr.RL * 1000,
      tr_RR: eng.telemetry.tr.RR * 1000,
      Fz_FL: eng.telemetry.Fz.FL,
      Fz_FR: eng.telemetry.Fz.FR,
      Fz_RL: eng.telemetry.Fz.RL,
      Fz_RR: eng.telemetry.Fz.RR,
      camber_FL: eng.telemetry.camber.FL,
      camber_FR: eng.telemetry.camber.FR,
      isKerb: onKerb,
      turn: ptLook.turnZh || ptLook.turn || "",
      sector: ptLook.sector || 1
    });
  }
  
  if (totalDist > 5200 && maxIdxSeen > (P - 150) && ptLook.idx < 50) {
    completed = true;
    s3Time = simTime - (s1Time || 0) - (s2Time || 0);
    break;
  }
}

console.log("\n================ SIMULATION RESULTS ================");
console.log(`Full Lap Completed:        ${completed ? "✅ YES (100% FINISHED)" : "❌ NO"}`);
console.log(`Lap Time:                  ${Math.floor(simTime / 60)}m ${(simTime % 60).toFixed(2)}s (${simTime.toFixed(3)}s)`);
console.log(`Sector 1 / 2 / 3:          ${s1Time ? s1Time.toFixed(2)+'s' : '--'} / ${s2Time ? s2Time.toFixed(2)+'s' : '--'} / ${s3Time ? s3Time.toFixed(2)+'s' : '--'}`);
console.log(`Top Speed:                 ${maxSpeed.toFixed(1)} km/h`);
console.log(`Max Lateral Grip:          ${maxAy.toFixed(2)} g`);
console.log(`Max Cross-Track Error:     ${maxEy.toFixed(2)} m`);
console.log(`Throttle/Brake Chatter:    ${chatterTransitions} transitions (Target: 0)`);
console.log(`Telemetry Sample Records:  ${logData.length} records`);
console.log("====================================================\n");

if (!completed || chatterTransitions > 5) {
  process.exit(1);
}
