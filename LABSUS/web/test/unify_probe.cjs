/** 临时探针：ARB 统一 + 簧载质心侧倾力臂 的影响面（P35 统一，2026-11-19）
 *  4 路分解：{旧ARB, 物理ARB} × {整车质心力臂, 簧载质心力臂}，隔离两项改动各自的贡献。 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const vm = require('vm');
const { ctx } = loadStage(MODULES_01_11);
const S = ctx.S;
/* SIM 在沙箱里是 const 词法绑定，不是 ctx 的属性 ⇒ 只能进沙箱取 */
const SIM = vm.runInContext('(typeof SIM !== "undefined") ? SIM : {}', ctx);
const V = ctx.window.VehicleDynamics15DOF || ctx.VehicleDynamics15DOF;
const presets = ['formula', 'gt3', 'gt3_sport', 'baja'];

/** 定速定圆 4 s，取后 1.5 s 均值；返回侧倾角、ay、轮荷转移 */
function corner(car, u, steerDeg) {
  const dt = 0.002, n = Math.round(4 / dt), avg = Math.round(1.5 / dt);
  let sr = 0, sa = 0, sfz = 0, c = 0;
  for (let i = 0; i < n; i++) {
    car.step({ steer: steerDeg, throttle: 0.5, brake: 0, drs: false }, { grade: 0, bumpNoise: 0 }, dt);
    car.state.u = u;
    if (i >= n - avg) {
      sr += Math.abs(car.state.phi); sa += Math.abs(car.state.u * car.state.r);
      sfz += Math.abs(car.telemetry.Fz.FL - car.telemetry.Fz.FR); c++;
    }
  }
  return { rollDeg: (sr / c) * 180 / Math.PI, ayG: (sa / c) / 9.81, dFz: sfz / c };
}

function variant(preset, physArb, physArm, u, steer) {
  ctx.loadVehiclePreset(preset);
  const car = new V(S, SIM, 0);
  if (!physArb) {
    const dF = (S.front.arb && S.front.arb.d) || 0, dR = (S.rear.arb && S.rear.arb.d) || 0;
    car.K_arb_F = dF > 0 ? dF ** 4 * 0.05 : 0;
    car.K_arb_R = dR > 0 ? dR ** 4 * 0.05 : 0;
  }
  if (!physArm) {
    const ax = ((SIM.rcH_F ?? 50) + (SIM.rcH_R ?? 65)) / 2 / 1000;
    car.h_roll_arm = Math.max(0.06, car.h_cg - ax);
  }
  return corner(car, u, steer);
}

console.log('== 行程限位真源 ==');
for (const p2 of presets) { ctx.loadVehiclePreset(p2); console.log(p2.padEnd(11), 'trMin=' + S.trMin, 'trMax=' + S.trMax, 'bsU=' + S.bsU, 'bsD=' + S.bsD); }
console.log('');
console.log('== 定速定圆 14 m/s / 5° ==');
console.log('预设         arb.d  旧ARB      物理ARB    倍数   |  旧力臂  新力臂(mm) | 侧倾角 旧/仅ARB/仅力臂/新 (°) | ay(g) 旧→新');
for (const p of presets) {
  ctx.loadVehiclePreset(p);
  const d = (S.front.arb && S.front.arb.d) || 0;
  const c00 = variant(p, false, false, 14, 5);
  const c10 = variant(p, true, false, 14, 5);
  const c01 = variant(p, false, true, 14, 5);
  const c11 = variant(p, true, true, 14, 5);
  ctx.loadVehiclePreset(p);
  const car = new V(S, SIM, 0);
  const ax = ((SIM.rcH_F ?? 50) + (SIM.rcH_R ?? 65)) / 2 / 1000;
  const armOld = Math.max(0.06, car.h_cg - ax), armNew = car.h_roll_arm;
  const kOld = car.K_arb_F; // 物理值；旧值另算
  const kLegacy = d > 0 ? d ** 4 * 0.05 : 0;
  console.log(
    p.padEnd(11), String(d).padStart(4),
    kLegacy.toFixed(0).padStart(8), kOld.toFixed(0).padStart(10),
    (d > 0 ? (kOld / kLegacy).toFixed(2) : '—').padStart(6), '|',
    (armOld * 1000).toFixed(1).padStart(7), (armNew * 1000).toFixed(1).padStart(7),
    '|',
    `${c00.rollDeg.toFixed(3)}/${c10.rollDeg.toFixed(3)}/${c01.rollDeg.toFixed(3)}/${c11.rollDeg.toFixed(3)}`.padStart(24),
    '|', `${c00.ayG.toFixed(4)}→${c11.ayG.toFixed(4)}`.padStart(16)
  );
}
process.exit(0);
