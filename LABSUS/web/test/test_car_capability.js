/* test_car_capability.js —— 车能力表回归（2026-11-20）
 *
 * 锁定的东西（对应 P29：速度包络由硬编码常数决定，与车无关）：
 *   1. 三项能力实测在物理合理区间（横向 / 制动 / 加速）
 *   2. 气动项：下压力随 v² 增长 ⇒ 横向/制动极限随速度上升（gt3 有翼）
 *   3. 剖面不变量：v_max 不超过横向极限（含气动增益）
 *   4. 确定性：同样配置两次构建，v_max 逐点一致（**没有逐圈学习**）
 *   5. opt-in：`S.carEnvelope` 未开时 capabilityMode='legacy'（逐位不变）
 *   6. 几何/刚度变化会改变剖面（P29 病根的直接回归网）
 *
 * 单独跑：node web/test/test_car_capability.js
 */
'use strict';
const path = require('path');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');

const webDir = path.join(__dirname, '..');
let passed = 0, total = 0;
const failures = [];
function assert(cond, msg) {
  total++;
  if (cond) { passed++; console.log(`  [PASS] ${msg}`); }
  else { failures.push(msg); console.log(`  [FAIL] ${msg}`); }
}
function note(msg) { console.log(`   ··  ${msg}`); }

const files = MODULES_01_11.concat(['18-ride-bench.js', '20-lat-bench.js', '21-car-capability.js']);
const { ctx } = loadStage(files);
const CC = ctx.window.CAR_CAPABILITY;
if (!CC) { console.log('CAR_CAPABILITY 未加载'); process.exit(1); }
const S = ctx.S;

const mkPath = () => {
  const wp = [];
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    wp.push({ x: 55 * Math.cos(a), y: 55 * Math.sin(a), turn: 'T1', sector: 1 });
  }
  return new ctx.window.CircuitPath(wp, 1.35, 1.0);
};

/* ── 1. 能力实测 ─────────────────────────────────────────── */
console.log('=== 1. 能力实测 ===');
ctx.loadVehiclePreset('formula');
CC.invalidate();
const t0 = Date.now();
const cap = CC.measure({ force: true });
const ms = Date.now() - t0;
assert(!!cap, '能力表可实测');
assert(cap.ay0 > 0.7 && cap.ay0 < 1.8,
  `横向极限 ${cap.ay0.toFixed(3)} g 在 0.7~1.8 之间（真实 FSAE 1.0~1.6）`);
assert(cap.brk0 > 6 && cap.brk0 < 20, `制动减速 ${cap.brk0.toFixed(2)} m/s² 在 6~20 之间`);
assert(cap.acc0 > 1.0 && cap.acc0 < 15, `低速加速 ${cap.acc0.toFixed(2)} m/s² 在 1~15 之间`);
note(`耗时 ${ms} ms（构建期一次，带缓存）`);

/* ── 2. 气动 v² 项 ──────────────────────────────────────── */
console.log('=== 2. 气动 v² 项 ===');
ctx.loadVehiclePreset('gt3');          // 有翼（qs.aeroF=3600）
CC.invalidate();
const f3 = CC.forPath();
assert(!!f3, 'gt3 能力表可用');
assert(f3.lateral(60) > f3.lateral(15) * 1.05,
  `有翼车横向极限随速度上升（15 m/s ${f3.lateral(15).toFixed(1)} → 60 m/s ${f3.lateral(60).toFixed(1)} m/s²）`);
assert(f3.brake(60) > f3.brake(15),
  `制动极限随速度上升（${f3.brake(15).toFixed(1)} → ${f3.brake(60).toFixed(1)} m/s²）`);
assert(f3.accel(50) < f3.accel(8),
  `加速极限随速度下降（功率受限：${f3.accel(8).toFixed(2)} → ${f3.accel(50).toFixed(2)} m/s²）`);

/* ── 3. 剖面不变量 ──────────────────────────────────────── */
console.log('=== 3. 剖面不变量 ===');
ctx.loadVehiclePreset('formula');
CC.invalidate();
ctx.S.carEnvelope = true;
const P = mkPath();
assert(P.capabilityMode === 'car', `opt-in 后 capabilityMode = ${P.capabilityMode}`);
const cap2 = P.capability;
const capFn = P.capabilityFn || null;
const G = 9.81;
let worstRatio = 0, worstAt = -1;
for (let i = 0; i < P.pts.length; i++) {
  const pt = P.pts[i];
  const k = Math.abs(pt.refCurvature !== undefined ? pt.refCurvature : pt.curvature);
  if (k < 1e-4) continue;
  /* 自洽不变量：v²·κ ≤ a_lat(v)（a_lat 已含气动 v² 增益，故不能拿常数 ay0 比） */
  const aLat = (capFn && typeof capFn.lateral === 'function')
    ? capFn.lateral(pt.v_max)
    : cap2.ay0 * G * (1 + (CC._aeroDown(S, pt.v_max) / (cap2.W || 1)));
  const ratio = (pt.v_max * pt.v_max * k) / Math.max(1e-6, aLat);
  if (ratio > worstRatio) { worstRatio = ratio; worstAt = i; }
}
assert(worstRatio <= 1.02,
  `v²κ 不超过横向极限 a_lat(v)（最差 ${worstRatio.toFixed(4)} @ 点 ${worstAt}）`);
const vs = P.pts.map(p => p.v_max);
assert(Math.min(...vs) > 1 && Math.max(...vs) < 120,
  `v_max 范围 ${Math.min(...vs).toFixed(1)}~${Math.max(...vs).toFixed(1)} m/s 合理`);

/* ── 4. 确定性 ──────────────────────────────────────────── */
console.log('=== 4. 确定性（无学习）===');
const P2 = mkPath();
let maxDiff = 0;
for (let i = 0; i < P.pts.length; i++) maxDiff = Math.max(maxDiff, Math.abs(P.pts[i].v_max - P2.pts[i].v_max));
assert(maxDiff === 0, `两次构建 v_max 逐点一致（最大差 ${maxDiff}）——确定性最快圈`);

/* ── 5. opt-in 边界 ─────────────────────────────────────── */
console.log('=== 5. opt-in 边界 ===');
ctx.S.carEnvelope = false;
const P3 = mkPath();
assert(P3.capabilityMode === 'legacy', `关闭时 capabilityMode = ${P3.capabilityMode}（回退旧常数）`);
const P4 = mkPath();
let d34 = 0;
for (let i = 0; i < P3.pts.length; i++) d34 = Math.max(d34, Math.abs(P3.pts[i].v_max - P4.pts[i].v_max));
assert(d34 === 0, `legacy 路径同样确定（差 ${d34}）`);

/* ── 6. 几何敏感性（P29 回归网）─────────────────────────── */
console.log('=== 6. 几何敏感性 ===');
ctx.loadVehiclePreset('formula');
CC.invalidate();
ctx.S.carEnvelope = true;
const base = mkPath();
const baseMax = Math.max(...base.pts.map(p => p.v_max));
ctx.S.front.kS *= 0.6;                       // 降低侧倾刚度 ⇒ 载荷转移变大 ⇒ 极限 ay 下降
ctx.S.rear.kS *= 0.6;
CC.invalidate();
const soft = mkPath();
const softMax = Math.max(...soft.pts.map(p => p.v_max));
const relChange = Math.abs(softMax - baseMax) / Math.max(1e-9, baseMax) * 100;
note(`kS ×0.6：剖面峰值 ${baseMax.toFixed(2)} → ${softMax.toFixed(2)} m/s`);
assert(relChange > 0.05,
  `降低侧倾刚度后剖面变化 ${relChange.toFixed(3)}%（P29：旧实现被常数掩盖，此处必须 >0.05%）`);
ctx.S.front.kS /= 0.6;
ctx.S.rear.kS /= 0.6;
ctx.S.carEnvelope = false;

console.log(`\n========================================`);
if (failures.length) {
  console.log(`车能力表检查 FAIL：${failures.length}/${total} 项失败`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log(`车能力表检查 PASS：${passed}/${total} 项全过`);
console.log(`========================================`);
process.exit(0);
