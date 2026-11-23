'use strict';
/* ============================================================================
 * LABSUS · web/test/test_fsae_arena.js
 * 大学生方程式动态赛场 (FSAE / FSC Dynamic Arena) 规则几何、计分与 15-DOF 闭环验证
 * usage: node web/test/test_fsae_arena.js
 * ============================================================================ */
const fs = require('fs');
const path = require('path');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); passed++; }
  else { console.error('[FAIL] ' + msg); failed++; }
}

const { ctx } = loadStage([
  ...MODULES_01_11,
  '16-powertrain.js',
  '20-lat-bench.js',
  '21-car-capability.js',
  '24-fsae-arena.js'
]);

console.log('=== 1. HTML / Modal / Launcher Contract ===');
const html = fs.readFileSync(path.join(__dirname, '..', 'dwb-pro-fullchassis.html'), 'utf8');
assert(html.includes('id="fsaeStageModal"'), 'HTML contains fsaeStageModal');
assert(html.includes('id="fsaeCanvas"'), 'HTML contains fsaeCanvas');
assert(html.includes('js/24-fsae-arena.js'), 'HTML loads js/24-fsae-arena.js');
assert(typeof ctx.openFsaeStage === 'function' && typeof ctx.closeFsaeStage === 'function', 'openFsaeStage / closeFsaeStage exported');

console.log('\n=== 2. FSAE / FSC Official Rulebook Track Geometry ===');
const pAcc = new ctx.FsaeAccelPath(1.35);
assert(pAcc.timedLength === 75.0, 'Accel timed length is exactly 75.0 m');
assert(pAcc.runoffLength >= 75.0, `Accel runoff length >= 75 m (actual ${pAcc.runoffLength}m)`);
assert(pAcc.halfWidth * 2 >= 3.0, `Accel lane width >= 3.0 m (actual ${(pAcc.halfWidth * 2).toFixed(1)}m)`);
assert(pAcc.cones.length >= 60, `Accel generates cone corridor (count=${pAcc.cones.length})`);

const pSkid = new ctx.FsaeSkidpadPath(1.35);
assert(Math.abs(pSkid.Rc * 2 - 18.25) < 1e-6, 'Skidpad center-to-center distance = 18.25 m');
assert(Math.abs(pSkid.Rin * 2 - 15.25) < 1e-6, 'Skidpad inner diameter = 15.25 m');
assert(Math.abs(pSkid.Rout * 2 - 21.25) < 1e-6, 'Skidpad outer diameter = 21.25 m');
assert(Math.abs((pSkid.Rout - pSkid.Rin) - 3.00) < 1e-6, 'Skidpad lane width = 3.00 m');

const pFsg = new ctx.FsaeAutocrossPath('fsg', 1.35);
const pFsi = new ctx.FsaeAutocrossPath('fsi', 1.35);
const pFsc = new ctx.FsaeAutocrossPath('fsc_std', 1.35);
assert(pFsg.totalLength > 280 && pFsg.cones.length >= 150, `FSG official dataset loaded (${pFsg.totalLength.toFixed(1)}m, ${pFsg.cones.length} cones)`);
assert(pFsi.totalLength > 190 && pFsi.cones.length >= 130, `FSI official dataset loaded (${pFsi.totalLength.toFixed(1)}m, ${pFsi.cones.length} cones)`);
assert(pFsc.totalLength > 700 && pFsc.cones.length >= 250, `FSC standard circuit built (${pFsc.totalLength.toFixed(1)}m, ${pFsc.cones.length} cones)`);

console.log('\n=== 3. Official FSAE Dynamic Scoring Formulas ===');
assert(ctx.computeFsaeAccelScore(3.85) === 100.0, 'Accel score at Tmin = 100.0 pts');
assert(ctx.computeFsaeAccelScore(5.80) === 4.5, 'Accel score beyond Tmax = 4.5 pts');
assert(ctx.computeFsaeSkidpadScore(4.85) === 75.0, 'Skidpad score at Tmin = 75.0 pts');
assert(ctx.computeFsaeAutocrossScore(24.5, 'fsg') === 100.0, 'Autocross FSG score at Tmin = 100.0 pts');

console.log('\n=== 4. Full 15-DOF Closed-Loop Formula SAE Dynamic Events ===');
Object.assign(ctx.S, JSON.parse(JSON.stringify(ctx.VEHICLE_PRESETS.formula)));
ctx.rebuild();
ctx.FSAE_STAGE.active = true;
ctx.FSAE_STAGE.playing = true;
ctx.FSAE_STAGE.autoPilot = true;

function runSim(ev, trk, maxSec) {
  if (trk) ctx.FSAE_STAGE.autocrossTrack = trk;
  ctx.fsaeSwitchEvent(ev);
  let maxBeta = 0, maxEy = 0, hasNaN = false;
  for (let i = 0; i < Math.round(maxSec * 60); i++) {
    const r = ctx.fsaeStepSimulation(1 / 60);
    const st = r.st;
    if (!isFinite(st.X) || !isFinite(st.Y) || !isFinite(st.u)) { hasNaN = true; break; }
    const beta = Math.atan2(st.v, Math.max(1, st.u)) * 180 / Math.PI;
    maxBeta = Math.max(maxBeta, Math.abs(beta));
    maxEy = Math.max(maxEy, Math.abs(r.tp.crossTrackError));
    if (ev !== 'combined' && ctx.FSAE_STAGE.run.finished) {
      if (ev === 'accel' && st.u < 0.35) break;
      if (ev === 'skidpad' && st.u < 0.5) break;
      if (ev === 'autocross') break;
    }
    if (ev === 'combined' && ctx.FSAE_STAGE.combinedIdx === 2 && ctx.FSAE_STAGE.run.finished) break;
  }
  return { run: ctx.FSAE_STAGE.run, sc: ctx.FSAE_STAGE.scores, maxBeta, maxEy, hasNaN };
}

// 4a. 75m Acceleration
const rAcc = runSim('accel', null, 15);
assert(!rAcc.hasNaN && rAcc.run.finished, `75m Accel completed (${rAcc.sc.accel.finalTime.toFixed(3)}s, trap ${rAcc.sc.accel.trapKmh.toFixed(1)} km/h, score ${rAcc.sc.accel.pts.toFixed(1)}/100)`);
assert(rAcc.sc.accel.rawTime > 3.5 && rAcc.sc.accel.rawTime < 5.5, `75m Accel realistic time (${rAcc.sc.accel.rawTime.toFixed(3)}s)`);
assert(rAcc.run.coneHits === 0, `75m Accel zero cone hits (actual ${rAcc.run.coneHits})`);
assert(rAcc.run.brakeDist !== null && rAcc.run.brakeDist < 75.0, `75m Accel stops cleanly within runoff (${rAcc.run.brakeDist.toFixed(1)}m < 75m)`);

// 4b. Figure-8 Skidpad
const rSkid = runSim('skidpad', null, 45);
assert(!rSkid.hasNaN && rSkid.run.finished, `Figure-8 Skidpad completed (R=${rSkid.sc.skidpad.tRight.toFixed(2)}s, L=${rSkid.sc.skidpad.tLeft.toFixed(2)}s, avg=${rSkid.sc.skidpad.rawTime.toFixed(2)}s, cones=${rSkid.run.coneHits}, score=${rSkid.sc.skidpad.pts.toFixed(1)}/75)`);
assert(Math.abs(rSkid.sc.skidpad.tRight - rSkid.sc.skidpad.tLeft) < 0.25, `Skidpad L/R symmetry < 0.25s`);
assert(rSkid.run.coneHits === 0, `Skidpad zero cone hits (actual ${rSkid.run.coneHits})`);
assert(rSkid.maxBeta < 15.0, `Skidpad no spinout (maxBeta=${rSkid.maxBeta.toFixed(1)} deg)`);

// 4c. Autocross FSG, FSI, FSC_STD
for (const [trk, maxSec, maxCones] of [['fsg', 55, 1], ['fsi', 45, 2], ['fsc_std', 95, 0]]) {
  const rAc = runSim('autocross', trk, maxSec);
  assert(!rAc.hasNaN && rAc.run.finished, `Autocross [${trk}] completed (${rAc.sc.autocross.rawTime.toFixed(2)}s, cones=${rAc.run.coneHits}, maxBeta=${rAc.maxBeta.toFixed(1)}deg, score=${rAc.sc.autocross.pts.toFixed(1)}/100)`);
  assert(rAc.run.coneHits <= maxCones, `Autocross [${trk}] clean cone tracking (cones=${rAc.run.coneHits} <= ${maxCones})`);
  assert(rAc.maxBeta < 16.0, `Autocross [${trk}] no spinout (maxBeta=${rAc.maxBeta.toFixed(1)} deg)`);
}

// 4d. Combined 3-event competition mode
const rComb = runSim('combined', 'fsc_std', 180);
const totPts = (rComb.sc.accel.pts || 0) + (rComb.sc.skidpad.pts || 0) + (rComb.sc.autocross.pts || 0);
assert(!rComb.hasNaN && ctx.FSAE_STAGE.combinedIdx === 2 && rComb.run.finished, `Combined 3-event competition finished all 3 stages (Total: ${totPts.toFixed(1)} / 275.0 pts)`);
assert(totPts > 120.0, `Combined FSAE dynamic score competitive (${totPts.toFixed(1)} / 275.0 pts)`);

console.log(`\n========================================`);
console.log(`FSAE Dynamic Arena Tests: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
