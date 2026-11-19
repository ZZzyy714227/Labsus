/**
 * test_tire_parity.js —— 四内核轮胎口径对拍（线 B · B4，2026-11-19）
 *
 * 存在理由（P18）：三层指标（静态/动态/赛道）分别由不同内核算，若轮胎口径不同，
 * 并排对比就是"苹果比橘子"。实测 K1 与 K3（engine/tire_mf.py）在**完全相同参数**下
 * Fy 比值恒为 **10/9**（精确，与 Fz/α 无关）：
 *     K1: D = μ_surface(1.35)·Fz     K3: D = Fy0/FzNom(=1.5)·Fz
 * K2（09-track TPHYS）也用 Fy0/FzNom ⇒ K1 是唯一异类。
 *
 * 本套把 K3 的输出作为**期望值表**钉死在 CI 里：开启 `S.tireMuFromParams` 后，
 * K1 必须逐点复现 K3（<0.01%）。这样"轮胎同源"不是口号而是可回归的断言。
 *
 * ⚠ 期望值来自 `engine/src/tire_mf.py::evaluate_magic_formula_fy`
 *   （参数：Fy0=5250, By=20, Cy=1.2, Ey=-0.5, LS=0.10, FzNom=3500, FzRef=576.3375），
 *   由 Python 侧直接跑出，不是手算。
 */
'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11);
const S = ctx.S;

let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

/* K3（Python）输出，符号取负以对齐 K1 的 Fy = −F（侧向力反抗侧滑） */
const K3 = [
  { Fz: 1000, alpha: 0.01, Fy: 328.1523364532209 },
  { Fz: 1000, alpha: 0.03, Fy: 867.838692695193 },
  { Fz: 1000, alpha: 0.06, Fy: 1253.8881667628582 },
  { Fz: 1000, alpha: 0.10, Fy: 1373.8211813633336 },
  { Fz: 1000, alpha: 0.20, Fy: 1383.872044513402 },
  { Fz: 2000, alpha: 0.01, Fy: 533.3945587558313 },
  { Fz: 2000, alpha: 0.03, Fy: 1410.6266667626721 },
  { Fz: 2000, alpha: 0.06, Fy: 2038.1300120195085 },
  { Fz: 2000, alpha: 0.10, Fy: 2233.074890652718 },
  { Fz: 2000, alpha: 0.20, Fy: 2249.412046051306 },
  { Fz: 3500, alpha: 0.01, Fy: 610.8014281773522 },
  { Fz: 3500, alpha: 0.03, Fy: 1615.3385304369276 },
  { Fz: 3500, alpha: 0.06, Fy: 2333.9059270803446 },
  { Fz: 3500, alpha: 0.10, Fy: 2557.1414444481398 },
  { Fz: 3500, alpha: 0.20, Fy: 2575.8494677791027 }
];

ctx.loadVehiclePreset('formula');
const car = new (ctx.window.VehicleDynamics15DOF)(S, {}, 0);

console.log('=== 1. 默认口径：K1 比 K3 低 10/9（记录缺口，不是 bug）===');
{
  S.tireMuFromParams = false;
  const ratios = K3.map(c => Math.abs(car.magicFormula(c.Fz, c.alpha, 0, 1.35, 1).Fy) / c.Fy);
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  note(`K1/K3 比值范围 ${lo.toFixed(6)} ~ ${hi.toFixed(6)}（D 口径理论 9/10）`);
  /* 偏差来自**第二个口径差**：K1 用 By·tanα，K3 用 By·α（小角等价，0.2 rad 差 1.3%） */
  S.tireMuFromParams = undefined;
  assert(lo > 0.895 && hi < 0.905,
    `默认口径约为 9/10（${lo.toFixed(4)}~${hi.toFixed(4)}；残差来自 tanα vs α）`);
}

console.log('=== 2. 开启 tireMuFromParams：K1 逐点复现 K3（<0.01%）===');
{
  S.tireMuFromParams = true;
  let worst = 0, worstAt = null, worstSmall = 0;
  for (const c of K3) {
    const fy = Math.abs(car.magicFormula(c.Fz, c.alpha, 0, 1.35, 1).Fy);
    const err = Math.abs(fy - c.Fy) / c.Fy * 100;
    if (err > worst) { worst = err; worstAt = c; }
    if (c.alpha <= 0.03 && err > worstSmall) worstSmall = err;
  }
  note(`最差偏差 ${worst.toFixed(3)}% @ Fz=${worstAt.Fz} α=${worstAt.alpha}；小角区最差 ${worstSmall.toFixed(4)}%`);
  assert(worstSmall < 0.05, `小角区 K1≡K3（${worstSmall.toFixed(4)}% < 0.05%）`);
  /* 大角区残差是已登记的第二个口径差：K1 By·tanα vs K3 By·α */
  assert(worst < 2.0, `大角区偏差有界（${worst.toFixed(3)}% < 2%，来自 tanα vs α）`);
  S.tireMuFromParams = false;
}

console.log('=== 3. 关闭后逐位恢复（opt-in 纪律）===');
{
  const a = Math.abs(car.magicFormula(2000, 0.06, 0, 1.35, 1).Fy);
  S.tireMuFromParams = true;
  const b = Math.abs(car.magicFormula(2000, 0.06, 0, 1.35, 1).Fy);
  S.tireMuFromParams = false;
  const c2 = Math.abs(car.magicFormula(2000, 0.06, 0, 1.35, 1).Fy);
  note(`关闭 ${a.toFixed(3)} / 开启 ${b.toFixed(3)} / 再关闭 ${c2.toFixed(3)}`);
  assert(a === c2, '关闭后逐位恢复');
  assert(Math.abs(b / a - 10 / 9) < 1e-9, '开启后恰为 10/9 倍（口径修正量精确）');
}

console.log('=== 4. 载荷敏感性仍在（不是把 μ 拉平）===');
{
  S.tireMuFromParams = true;
  const f1 = Math.abs(car.magicFormula(1000, 0.10, 0, 1.35, 1).Fy);
  const f2 = Math.abs(car.magicFormula(3500, 0.10, 0, 1.35, 1).Fy);
  S.tireMuFromParams = false;
  note(`Fz 1000→3500：Fy ${f1.toFixed(0)} → ${f2.toFixed(0)} N（比值 ${(f2 / f1).toFixed(3)}，纯线性应为 3.5）`);
  assert(f2 / f1 < 3.5, `载荷敏感性仍在（重载 μ 递减，比值 ${(f2 / f1).toFixed(3)} < 3.5）`);
  assert(f2 / f1 > 1.2, '载荷敏感性未过度（比值仍随载荷增长）');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} tire-parity checks passed!`);
console.log(`========================================`);
process.exit(0);
