/* G30 符号校准：4 种 (e_y, e_ψ) 符号组合各跑 12s 闭环，报告最大 |横向偏差|
   与是否自旋——取偏差最小且无自旋的组合。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const lapSrc = fs.readFileSync(path.join(__dirname, '..', 'web', 'test', 'test_lap_15dof.js'), 'utf8');
const lines = lapSrc.split(/\r?\n/);
const keep = []; let g = null;
for (const ln of lines) {
  if (g === null) {
    const m = ln.match(/^function (makeS|makeSweep|loadReal)/);
    if (m) { g = m[1]; keep.push(ln); }
  } else { keep.push(ln); if (ln === '}') g = null; }
}
const loadReal = new Function('vm', 'fs', 'path', keep.join('\n') + '\nreturn loadReal;')(vm, fs, path);

function runCombo(eyS, epsiS) {
  const R = loadReal(path.join(__dirname, '..', 'web'));
  const ctx = R.ctx;
  const mkSweep = new Function('return function makeSweep(k){const rows=[];for(const tr of [-55,-30,-10,0,10,30,60])rows.push({tr,cam:-(3.20+0.0225*tr*k)+0.000040*tr*tr,toe:-0.15+0.0028*tr*k,mr:0.75+0.0004*tr,kw:67500,rcH:52+0.06*tr});return {rows,min:-55,max:60};}')();
  const makeS = new Function('return function makeS(){return { mTotal: 1250, mSprung: 1100, wb: 2600, hcg: 290, vehicleType: "gt3", limF: [-55, 60], limR: [-55, 60], qs: { gx: 0.0, gy: 1.8, speed: 220, aeroF: 3600, aeroBias: 0.45 }, front: { arch: "direct", hp: { WC: [772, 0, 300] }, tire: { R: 300, W: 265 }, cam0: -3.20, toe0: -0.15, mS: 320, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14, mr: 0.75, arb: { d: 28 } }, rear: { arch: "direct", hp: { WC: [740, 0, 300] }, tire: { R: 310, W: 285 }, cam0: -2.20, toe0: 0.05, mS: 300, mU: 48, kS: 130, kT: 280, cB: 9, cR: 15, mr: 0.78, arb: { d: 24 } } };}')();
  const P = new ctx.window.CircuitPath(R.wp, 1.35, 1.0);
  const S = makeS();
  S.qs.drsVms = 40;
  const eng = new ctx.window.VehicleDynamics15DOF(S, { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63, swF: mkSweep(1.0), swR: mkSweep(1.0) }, 5.0);
  const pilot = new ctx.window.UniversalAutoPilotMPC(S);
  pilot.setPath(P); pilot.active = true; pilot.eng = eng;
  pilot._errSign = { ey: eyS, epsi: epsiS };
  if (P.cornerCount) pilot.initLapLearning(P.cornerCount);
  const p0 = P.pts[0];
  Object.assign(eng.state, { X: p0.x, Y: p0.y, psi: p0.heading, u: 5, v: 0, r: 0,
    omega: { FL: 16.7, FR: 16.7, RL: 16.7, RR: 16.7 } });
  const dt = 1 / 240;
  let t = 0, ci = 0, maxLat = 0, spun = false, uEnd = 0, sEnd = 0;
  const N = P.pts.length;
  for (let step = 0; step < 240 * 12; step++) {
    const ctrl = pilot.drive(eng.state, dt);
    if (!isFinite(ctrl.steer) || !isFinite(ctrl.throttle) || !isFinite(ctrl.brake)) {
      const tgt = ctrl.target || {};
      console.log(`  [NaN-ctrl] step=${step} steer=${ctrl.steer} thr=${ctrl.throttle} brk=${ctrl.brake} targetSpeed=${tgt.targetSpeed} cid=${tgt.cornerId} state.u=${eng.state.u}`);
      break;
    }
    eng.step(ctrl, { grade: 0, path: P, bumpNoise: 0 }, dt);
    t += dt;
    const s = eng.state;
    if (!isFinite(s.X)) { spun = true; console.log(`  [NaN-state] step=${step} ctrl.brake=${ctrl.brake} ctrl.throttle=${ctrl.throttle}`); break; }
    let md = Infinity, best = ci;
    for (let k = -200; k <= 200; k++) {
      const i = (ci + k + N) % N;
      const d = (P.pts[i].refX - s.X) ** 2 + (P.pts[i].refY - s.Y) ** 2;
      if (d < md) { md = d; best = i; }
    }
    ci = best;
    const p = P.pts[ci];
    const lat = (s.X - p.refX) * p.refNx + (s.Y - p.refY) * p.refNy;
    maxLat = Math.max(maxLat, Math.abs(lat));
    if (Math.abs(s.r) > 1.0) spun = true;
    uEnd = s.u; sEnd = p.s || 0;
  }
  return { maxLat, spun, uEnd, sEnd };
}

const combos = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
for (const [ey, epsi] of combos) {
  const r = runCombo(ey, epsi);
  console.log(`e_y=${ey >= 0 ? '+' : ''}${ey} e_ψ=${epsi >= 0 ? '+' : ''}${epsi}: ` +
    `maxLat=${r.maxLat.toFixed(2)}m spun=${r.spun} u_end=${r.uEnd.toFixed(1)} s_end=${r.sEnd.toFixed(0)}m`);
}
