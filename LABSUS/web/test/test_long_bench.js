#!/usr/bin/env node
/**
 * Stage 4 · 23-long-bench.js 纵向加减速与制动台架自检
 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['23-long-bench.js']));
const LB = ctx.LONG_BENCH;

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  passed++;
  console.log(`[PASS] ${msg}`);
}

console.log('=== 1. LONG_BENCH API & Config Preservation ===');
assert(LB && typeof LB.accelTest === 'function' && typeof LB.brakeBiasSweep === 'function',
  'LONG_BENCH 导出 accelTest / brakeTest / brakeBiasSweep');

ctx.loadVehiclePreset('formula');
const origPitch = ctx.S.pitchInertia;

console.log('=== 2. 75m 直线起步加速（纵倾抬头 & 载荷后移）===');
{
  const r = LB.accelTest({ distM: 75 });
  assert(r.reached && r.timeSec > 3.5 && r.timeSec < 8.5,
    `Formula 75m 加速用时合理 (${r.timeSec}s, vEnd=${r.vEndKmh}km/h)`);
  assert(r.maxSquatDeg > 0.05 && r.peakAxG > 0.5,
    `纵倾抬头为正 (${r.maxSquatDeg}°, peakAx=${r.peakAxG}g)`);
  assert(ctx.S.pitchInertia === origPitch, 'accelTest 不污染 S.pitchInertia 状态');
}

console.log('=== 3. 100→0 km/h 制动与 Brake Bias 扫掠 ===');
{
  const sw = LB.brakeBiasSweep({ vStartKmh: 100, pedal: 0.9, biases: [0.50, 0.58, 0.66, 0.74, 0.80] });
  const b50 = sw.points[0];
  const b66 = sw.points[2];
  assert(sw.points.length === 5, 'Brake Bias 扫掠完成 5 档');
  assert(b66.maxDiveDeg > 0.1 && b66.peakDecelG > 0.8,
    `制动点头为正且减速度 >0.8g (dive=${b66.maxDiveDeg}°, decel=${b66.peakDecelG}g)`);
  assert(b50.firstLockup === 'rear' && b50.lockupRear,
    `低分配比 50% 应触发后轮先抱死 (firstLockup=${b50.firstLockup})`);
  assert(!b66.lockupRear && b66.stopDistM < b50.stopDistM,
    `最优分配比无后轴抱死且刹距更短 (${b66.stopDistM}m < ${b50.stopDistM}m)`);
  assert(sw.bestBias >= 0.60 && sw.bestBias <= 0.74,
    `最优安全 Brake Bias 落在物理合理区间 (${sw.bestBias})`);
  assert(ctx.S.pitchInertia === origPitch, 'brakeBiasSweep 不污染 S.pitchInertia 状态');
}

console.log('=== 4. GT3 高车重/高速制动一致性 ===');
{
  ctx.loadVehiclePreset('gt3');
  const r = LB.brakeTest({ vStartKmh: 100, pedal: 0.9, brakeBias: 0.65 });
  assert(Number.isFinite(r.stopDistM) && r.stopDistM > 25 && r.stopDistM < 65,
    `GT3 100→0 km/h 制动距离合理 (${r.stopDistM}m, decel=${r.peakDecelG}g, dive=${r.maxDiveDeg}°)`);
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} longitudinal bench checks passed!`);
console.log(`========================================`);
process.exit(0);
