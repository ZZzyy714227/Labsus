'use strict';
/* ============================================================================
 * LABSUS · web/test/test_full_report.js
 * 一键全量分析与终极数据报告集成测试
 * usage: node web/test/test_full_report.js
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
  '18-ride-bench.js',
  '19-compare.js',
  '20-lat-bench.js',
  '21-car-capability.js',
  '22-optimizer.js',
  '23-long-bench.js',
  '24-fsae-arena.js',
  '25-full-report.js'
]);

(async () => {
  console.log('=== 1. HTML Entry Points & Export Contract ===');
  for (const fn of ['dwb-pro-v4.html', 'dwb-pro-fullchassis.html']) {
    const src = fs.readFileSync(path.join(__dirname, '..', fn), 'utf8');
    assert(src.includes('id="fullReportBtn"'), `${fn} contains #fullReportBtn`);
    assert(src.includes('js/25-full-report.js'), `${fn} loads js/25-full-report.js`);
  }
  assert(ctx.FULL_REPORT && typeof ctx.FULL_REPORT.runAll === 'function', 'FULL_REPORT.runAll exported');

  console.log('\n=== 2. Run Full Analysis Suite (Formula SAE) ===');
  Object.assign(ctx.S, JSON.parse(JSON.stringify(ctx.VEHICLE_PRESETS.formula)));
  ctx.rebuild();
  const rep = await ctx.FULL_REPORT.runAll({ includeFsae: true, includeFsc: false, includeProving: true, includeShanghaiLap: false });

  assert(rep && rep.schema === 'LABSUS_ULTIMATE_REPORT_V1', 'Report schema valid');
  assert(rep.vehicle && rep.vehicle.vehicleType === 'formula', 'Vehicle snapshot matches formula');
  assert(rep.staticKC && rep.staticKC.kpis.length === 21, `Static K&C collected 21 KPIs (got ${rep.staticKC && rep.staticKC.kpis.length})`);
  assert(rep.ride && rep.ride.step && rep.ride.sweep && rep.ride.randomIsoC60kmh, 'Ride bench metrics complete');
  assert(rep.lateral && rep.lateral.skidpadLimit && isFinite(rep.lateral.rollGradientDegPerG), 'Lateral bench metrics complete');
  assert(rep.longitudinal && rep.longitudinal.brake100kmh && rep.longitudinal.brakeBiasSweep, 'Longitudinal bench & bias sweep complete');
  assert(rep.capability && isFinite(rep.capability.ayMaxG) && rep.capability.ayMaxG > 0.8, `Capability ayMaxG valid (${rep.capability && rep.capability.ayMaxG.toFixed(2)}g)`);
  assert(rep.fsae && rep.fsae.accel && rep.fsae.skidpad && rep.fsae.autocrossFsg, 'FSAE 3-event results collected');
  assert(rep.fsae.total275 > 100, `FSAE total score realistic (${rep.fsae.total275.toFixed(1)}/275)`);
  assert(rep.tracks && rep.tracks.provingGround.length === 3 && rep.tracks.shanghaiEnvelope.theoreticalLapSec > 60, 'Proving ground + Shanghai envelope collected');
  assert(Array.isArray(rep.insights) && rep.insights.length >= 4, `Engineering insights generated (${rep.insights.length})`);
  assert(typeof rep.markdown === 'string' && rep.markdown.includes('## 🤖 给 AI 工程助手的提示词') && rep.markdown.length > 1500, `AI Markdown report generated (${rep.markdown.length} chars)`);

  console.log('\n========================================');
  console.log(`Full Report Tests: ${passed} passed, ${failed} failed`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
})();
