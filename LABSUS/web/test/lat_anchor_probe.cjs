/** 临时探针：校准侧倾解析锚（A1），比较"整车质量"与"簧载质量"两种力矩口径 */
'use strict';
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '20-lat-bench.js']));
const S = ctx.S;
const LB = ctx.LAT_BENCH;
const presets = ['formula', 'gt3', 'gt3_sport', 'baja'];

console.log('预设        tF     tR    keF     keR    Karb_F   Karb_R   Kspring  Karb    Kroll');
for (const p of presets) {
  ctx.loadVehiclePreset(p);
  const st = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
  const carObj = LB.analytic();
  const carKarbF = () => (S.front.arb && S.front.arb.d > 0 ? (typeof arbRate==='function' ? arbRate(SIM.mrRefF, S.front).k*1000 : 0) : 0);
  const carKarbR = () => (S.rear.arb && S.rear.arb.d > 0 ? (typeof arbRate==='function' ? arbRate(SIM.mrRefR, S.rear).k*1000 : 0) : 0);
  const an = LB.analytic();
  const ay = st.metrics.ayG * 9.81;
  const phiM = an.phiPredTotalDeg(ay);
  const phiMS = an.phiPredSprungDeg(ay);
  const eM = Math.abs(phiM - st.metrics.phiDeg) / Math.max(1e-9, st.metrics.phiDeg) * 100;
  const eMS = Math.abs(phiMS - st.metrics.phiDeg) / Math.max(1e-9, st.metrics.phiDeg) * 100;
  console.log(
    p.padEnd(10),
    an.tF.toFixed(3).padStart(5), an.tR.toFixed(3).padStart(6),
    an.keF.toFixed(0).padStart(7), an.keR.toFixed(0).padStart(7),
    carKarbF().toFixed(0).padStart(8), carKarbR().toFixed(0).padStart(8),
    an.KrollSpring.toFixed(0).padStart(9), an.KrollArb.toFixed(0).padStart(7),
    an.Kroll.toFixed(0).padStart(8),
    '| φ实测', st.metrics.phiDeg.toFixed(3), 'φ解析(m)', phiM.toFixed(3)
  );
}
console.log('\n注：h_roll_arm 用 hs（簧载质心高）− 侧倾轴；Kroll 用串联等效 ke。');
process.exit(0);
