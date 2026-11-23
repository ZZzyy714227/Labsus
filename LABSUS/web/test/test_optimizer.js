#!/usr/bin/env node
/**
 * Stage 4 · 22-optimizer.js 正向硬点运动学优化器自检
 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['22-optimizer.js']));
const OPT = ctx.OPTIMIZER;

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

console.log('=== 1. OPTIMIZER API & Snapshot Restore ===');
assert(OPT && typeof OPT.optimize === 'function', 'OPTIMIZER.optimize 已导出');
ctx.loadVehiclePreset('formula');
const snap0 = OPT.captureSnapshot('front');
const origRackZ = snap0.hp.RACK[2];
ctx.S.front.hp.RACK[2] += 8.5;
OPT.restoreSnapshot(snap0);
assert(Math.abs(ctx.S.front.hp.RACK[2] - origRackZ) < 1e-12,
  'restoreSnapshot 逐位还原修改前硬点');

console.log('=== 2. Formula Bump-Steer + RC Target Optimization ===');
{
  const res = OPT.optimize({
    axis: 'front',
    dofs: ['RACK_Z', 'TRO_Z', 'LCA_F_Z', 'LCA_R_Z', 'UCA_F_Z', 'UCA_R_Z'],
    boundMm: 15,
    target: { bs: 0.0, rcH: 45.0, cg: -0.95 },
    weights: { bs: 180.0, rcH: 2.0, cg: 60.0, rcMig: 0.2 },
  });
  assert(res.ok, 'Formula 优化返回 ok=true');
  assert(res.costBest < res.cost0,
    `目标函数显著下降 (${res.cost0.toFixed(2)} → ${res.costBest.toFixed(2)}, ${res.evals} evals)`);
  assert(Math.abs(res.best.bs) < Math.abs(res.initial.bs) || Math.abs(res.best.bs) < 0.05,
    `Bump Steer 收敛 (${res.initial.bs.toFixed(3)} → ${res.best.bs.toFixed(3)} °/25mm)`);
  for (const k of res.dofs) {
    assert(Math.abs(res.deltas[k]) <= 15.0 + 1e-6,
      `硬点步幅遵守 ±15mm 边界 (${k}: ${res.deltas[k]}mm)`);
  }
  OPT.restoreSnapshot(res.baselineSnap);
  assert(Math.abs(ctx.S.front.hp.RACK[2] - origRackZ) < 1e-12,
    '取消/还原后硬点零残留恢复初值');
}

console.log('=== 3. apply=false 预演不污染全局预设 ===');
{
  ctx.loadVehiclePreset('gt3');
  const rackBefore = ctx.S.front.hp.RACK[2];
  const res = OPT.optimize({
    axis: 'front',
    dofs: ['RACK_Z', 'TRO_Z'],
    boundMm: 12,
    target: { bs: 0.0 },
    weights: { bs: 200.0, rcH: 0.0, cg: 0.0, rcMig: 0.0 },
    apply: false,
  });
  assert(res.ok && res.costBest <= res.cost0, 'GT3 apply=false 寻优收敛');
  assert(Math.abs(ctx.S.front.hp.RACK[2] - rackBefore) < 1e-12,
    'apply=false 保证全局 S.front.hp 保持原样');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} optimizer checks passed!`);
console.log(`========================================`);
process.exit(0);
