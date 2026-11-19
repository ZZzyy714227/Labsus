/**
 * test_stability_audit.js —— 积分稳定性审计（线 A · A3，2026-11-19）
 *
 * 存在理由：P36 证明"约束变硬就可能炸"（行程限位接线 ⇒ ISO E 级 NaN），
 * 而此前没有任何稳定域证据。本套给两条：
 *   ① dt 扫描（生产 dt=1ms 上下各扩 4×）：全程无 NaN/Inf
 *   ② dt 收敛：侧倾角（线性区间）随 dt 减半收敛；E 级垂向 RMS 只断"有界带"
 *      （实测各 dt 间 ±2.75% 抖动——撞限位的非线性区间，不假装单调收敛）
 *   ③ 刚度扫描（用户真能调到的范围）：kS ×8、ARB ×16 无 NaN 且响应有界
 *
 * ⚠ 阈值全部来自 stab_probe.cjs 实测（2026-11-19），不是拍的：
 *   - 侧倾 dt 收敛实测 0.006% ⇒ 门限 1%（170 倍余量，防的是"炸"不是"准"）
 *   - RMS 带宽实测 ±2.75% ⇒ 门限 ±15%（~5 倍余量）
 */
'use strict';
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '20-lat-bench.js']));

const S = ctx.S;
const RB = ctx.RIDE_BENCH;
const LB = ctx.LAT_BENCH;
let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);
const load = (p) => ctx.loadVehiclePreset(p);
const allFinite = (r) => {
  for (const k of Object.keys(r.metrics)) {
    const v = r.metrics[k];
    if (typeof v === 'number' && !Number.isFinite(v)) return false;
  }
  return true;
};

console.log('=== 1. dt 扫描无 NaN（ISO E 级，4ms→0.5ms）===');
{
  load('gt3');
  const rmsByDt = {};
  for (const dt of [0.004, 0.002, 0.001, 0.0005]) {
    const r = RB.run('random', { dur: 2.5, dt: dt, isoClass: 'E' });
    assert(allFinite(r), `dt=${(dt * 1000).toFixed(1)}ms E 级全程有限（无 NaN/Inf）`);
    rmsByDt[dt] = r.metrics.bodyRmsMm;
  }
  note(`RMS: ` + Object.keys(rmsByDt).map(d => `${(d * 1000).toFixed(1)}ms=${rmsByDt[d].toFixed(2)}`).join(' · '));
  const ref = rmsByDt[0.001];
  for (const dt of [0.004, 0.002, 0.001, 0.0005]) {
    assert(Math.abs(rmsByDt[dt] - ref) / ref < 0.15,
      `dt=${(dt * 1000).toFixed(1)}ms RMS 在基准 ±15% 带内（实测偏差 ${(100 * (rmsByDt[dt] - ref) / ref).toFixed(2)}%）`);
  }
}

console.log('=== 2. 侧倾角 dt 收敛（线性区间，真收敛）===');
{
  load('gt3');
  const phi = {};
  for (const dt of [0.004, 0.002, 0.001, 0.0005]) {
    const r = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5, dt: dt });
    assert(allFinite(r), `dt=${(dt * 1000).toFixed(1)}ms 定圆有限`);
    phi[dt] = Math.abs(r.metrics.phiDeg);
  }
  const ref = phi[0.0005];
  for (const dt of [0.004, 0.002, 0.001]) {
    const err = Math.abs(phi[dt] - ref) / ref * 100;
    assert(err < 1.0, `dt=${(dt * 1000).toFixed(1)}ms 侧倾角收敛（偏差 ${err.toFixed(3)}% < 1%）`);
  }
  note(`φ: ` + Object.keys(phi).map(d => `${(d * 1000).toFixed(1)}ms=${phi[d].toFixed(4)}°`).join(' · '));
}

console.log('=== 3. 刚度扫描（用户可调范围，无 NaN 且有界）===');
{
  load('gt3');
  for (const kS of [2, 4, 8]) {
    const r = RB.run('random', { dur: 2, dt: 0.001, isoClass: 'E', over: { kS_scale: kS } });
    assert(allFinite(r) && r.metrics.bodyRmsMm > 0 && r.metrics.bodyRmsMm < 1000,
      `kS ×${kS}：E 级响应有限（RMS ${r.metrics.bodyRmsMm.toFixed(2)} mm）`);
  }
  for (const arb of [4, 16]) {
    const r = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5, over: { arbF_scale: arb, arbR_scale: arb } });
    assert(allFinite(r) && Math.abs(r.metrics.phiDeg) < 30 && r.metrics.ayG < 3,
      `ARB ×${arb}：定圆有限（φ ${r.metrics.phiDeg.toFixed(3)}° / ay ${r.metrics.ayG.toFixed(3)}g）`);
  }
  /* 杆变硬 ⇒ 侧倾必须变小（物理方向锁） */
  const base = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5 });
  const stiff = LB.steadyCircle({ speed: 14, steerDeg: 5, dur: 4, avgSecs: 1.5, over: { arbF_scale: 4, arbR_scale: 4 } });
  assert(Math.abs(stiff.metrics.phiDeg) < Math.abs(base.metrics.phiDeg),
    `ARB ×4 侧倾变小（${base.metrics.phiDeg.toFixed(3)}° → ${stiff.metrics.phiDeg.toFixed(3)}°）`);
}

console.log('=== 4. 生产步长锚（dt=1ms 与 0.5ms 的侧倾角一致）===');
{
  load('formula');
  const a = LB.steadyCircle({ speed: 12, steerDeg: 4, dur: 4, avgSecs: 1.5, dt: 0.001 });
  const b = LB.steadyCircle({ speed: 12, steerDeg: 4, dur: 4, avgSecs: 1.5, dt: 0.0005 });
  const err = Math.abs(Math.abs(a.metrics.phiDeg) - Math.abs(b.metrics.phiDeg)) / Math.abs(b.metrics.phiDeg) * 100;
  note(`formula φ: 1ms=${a.metrics.phiDeg.toFixed(4)}° / 0.5ms=${b.metrics.phiDeg.toFixed(4)}°（${err.toFixed(3)}%）`);
  assert(err < 1.0, `生产步长锚：1ms vs 0.5ms 偏差 ${err.toFixed(3)}% < 1%`);
}

/* ── 5. 行程限位接线（A4/P36，2026-11-19）──────────────────────────
   锁的是"参数真的进物理"：把 S.trMin/trMax 收窄，同一工况的响应必须变。
   改动前 K1 硬编码 0.080/0.090 与 0.055/0.065，这两个参数完全无效。
   ⚠ 必须用**会撞限位**的工况（单轮 80mm 脉冲）；稳态定圆永远碰不到限位。
   ⚠ 也必须在物理包线内（E 级 12 m/s）——20 m/s 时车会翻，差异被淹没。 */
console.log('=== 5. 行程限位接线（A4）===');
{
  load('formula');
  const trMin0 = S.trMin, trMax0 = S.trMax;
  const run = (trMin, trMax) => {
    S.trMin = trMin; S.trMax = trMax;
    return RB.run('impulse', { singleWheel: true, ampMm: 80, dur: 1.5 });
  };
  const wide = run(-90, 90);
  const narrow = run(-20, 20);
  S.trMin = trMin0; S.trMax = trMax0;
  const back = run(-90, 90);
  const d = Math.abs(narrow.metrics.rmsEarly - wide.metrics.rmsEarly);
  note(`行程 -90/90 → -20/20：早期 RMS ${wide.metrics.rmsEarly.toExponential(4)} → ${narrow.metrics.rmsEarly.toExponential(4)}（Δ ${d.toExponential(2)}）`);
  assert(d > 1e-6, `S.trMin/trMax 真的进物理（响应变化 ${d.toExponential(2)}）`);
  assert(Math.abs(back.metrics.rmsEarly - wide.metrics.rmsEarly) < 1e-9, '还原后回到基准（无残留状态）');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} stability checks passed!`);
console.log(`========================================`);
process.exit(0);
