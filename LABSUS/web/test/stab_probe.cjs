/** 临时探针：A3 积分稳定性审计——dt 收敛速度 + 刚度扫描的实际数字（定阈值用） */
'use strict';
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '20-lat-bench.js']));
const S = ctx.S;
const RB = ctx.RIDE_BENCH;
const LB = ctx.LAT_BENCH;
const SIM = vm.runInContext('(typeof SIM !== "undefined") ? SIM : {}', ctx);

console.log('== ① dt 收敛（ISO 8608 E 级随机路面，车身垂向 RMS mm）==');
{
  let prev = null;
  for (const dt of [0.004, 0.002, 0.001, 0.0005, 0.00025]) {
    const r = RB.run('random', { dur: 3, dt: dt, isoClass: 'E', ampScale: 1.0 });
    const rms = r.metrics.bodyRmsMm;
    const finite = Number.isFinite(rms) && r.series.every ? true : true;
    const step = prev === null ? '—' : (100 * (rms - prev) / prev).toFixed(2) + '%';
    console.log(`  dt=${(dt * 1000).toFixed(2)}ms  RMS=${rms.toFixed(6)} mm  Δ=${step}`);
    prev = rms;
  }
}

console.log('\n== ② 刚度扫描（dt=1ms，E 级路面，无 NaN 即稳）==');
{
  ctx.loadVehiclePreset('gt3');
  for (const kS of [1, 2, 4, 8]) {
    const r = RB.run('random', { dur: 2, dt: 0.001, isoClass: 'E', over: { kS_scale: kS } });
    console.log(`  kS ×${kS}:  RMS=${Number.isFinite(r.metrics.bodyRmsMm) ? r.metrics.bodyRmsMm.toFixed(4) : 'NaN'} mm`);
  }
  for (const arb of [1, 4, 16]) {
    const r = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5, over: { arbF_scale: arb, arbR_scale: arb } });
    const ok = Number.isFinite(r.metrics.phiDeg) && Number.isFinite(r.metrics.ayG);
    console.log(`  ARB ×${arb}:  φ=${ok ? r.metrics.phiDeg.toFixed(4) + '°' : 'NaN'}  ay=${ok ? r.metrics.ayG.toFixed(3) + 'g' : 'NaN'}`);
  }
}

console.log('\n== ③ 侧倾角 dt 收敛（gt3 定圆）==');
{
  ctx.loadVehiclePreset('gt3');
  let prev = null;
  for (const dt of [0.004, 0.002, 0.001, 0.0005]) {
    const r = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5, dt: dt });
    const phi = Math.abs(r.metrics.phiDeg);
    const step = prev === null ? '—' : (100 * (phi - prev) / prev).toFixed(3) + '%';
    console.log(`  dt=${(dt * 1000).toFixed(2)}ms  φ=${phi.toFixed(5)}°  Δ=${step}`);
    prev = phi;
  }
}
process.exit(0);
