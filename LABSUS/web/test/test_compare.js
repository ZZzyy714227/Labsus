'use strict';
/* 沙箱统一走 _stage_harness.js —— 不再内联第四份（见该文件头注释） */
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '19-compare.js']));
const CMP = ctx.COMPARE;
const S = ctx.S;
let passed = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (!cond) { console.error(`[FAIL] ${msg}`); process.exit(1); }
  console.log(`[PASS] ${msg}`); passed++;
}
const note = (m) => console.log('   ··  ' + m);

console.log('=== 0. 模块 ===');
{
  assert(CMP && typeof CMP.capture === 'function', 'COMPARE 已加载');
  assert(typeof CMP.trackLimit === 'function' && typeof CMP.diff === 'function', 'trackLimit / diff 可用');
}

console.log('=== 1. 三层表非空 ===');
{
  const st = CMP.staticRows(), dy = CMP.dynamicRows(), tk = CMP.trackRows();
  note(`静态 ${st.length} 项 · 动态 ${dy.length} 项 · 赛道 ${tk.length} 项`);
  assert(st.length >= 5, `静态层有 KPI（${st.length} 项）`);
  assert(dy.length === 4, `动态层四项（${dy.length}）`);
  assert(tk.length === 4, `赛道层四项（${tk.length}）`);
  note('静态样例：' + st.slice(0, 3).map(r => r.name + '=' + r.value).join(' · '));
  note('动态：' + dy.map(r => r.name + '=' + r.value + r.unit).join(' · '));
  note('赛道：' + tk.map(r => r.name + '=' + r.value + r.unit).join(' · '));
}

console.log('=== 2. 赛道指标可复现（逐位一致）===');
{
  const a = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  const b = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  assert(JSON.stringify(a.metrics) === JSON.stringify(b.metrics), '两次运行指标逐位一致');
  assert(JSON.stringify(a.points) === JSON.stringify(b.points), '逐速度点也逐位一致');
  note(`峰值 ay ${a.metrics.peakAyG.toFixed(3)} g @ ${a.metrics.speedAtPeak} m/s`);
}

console.log('=== 3. 赛道指标对调校杠杆敏感（P29 的洞）===');
{
  const base = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  /* 杠杆：前轴弹簧刚度 +30%（真实调校动作，直接改轮端刚度与载荷转移）。
     ⚠ 不用 cam0：实测 `S.front.cam0` 根本不进 K1（改 −2° 峰值 ay 变化 0.00%），
     那是显示/机构层的参数，不是物理输入。 */
  const kS0 = S.front.kS;
  S.front.kS = kS0 * 1.3;
  const more = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });
  S.front.kS = kS0;
  const back = CMP.trackLimit({ steerDeg: 8, speeds: [8, 10, 12, 14, 16], settleSecs: 3.0, dt: 0.002 });

  const dPct = 100 * (more.metrics.peakAyG - base.metrics.peakAyG) / base.metrics.peakAyG;
  note(`前簧 +30%：峰值 ay ${base.metrics.peakAyG.toFixed(3)} → ${more.metrics.peakAyG.toFixed(3)} g（${dPct.toFixed(2)}%）`);
  note(`半径 ${base.metrics.radiusAtPeak.toFixed(2)} → ${more.metrics.radiusAtPeak.toFixed(2)} m（${(100*(more.metrics.radiusAtPeak-base.metrics.radiusAtPeak)/base.metrics.radiusAtPeak).toFixed(2)}%）`);
  note(`还原后：${back.metrics.peakAyG.toFixed(3)} g（应与基准一致）`);
  assert(Math.abs(dPct) > 0.2,
    `前簧 +30% 让峰值 ay 变化 ${dPct.toFixed(2)}%（门限 0.2%，圈速口径只有 0.017%）`);
  assert(Math.abs(back.metrics.peakAyG - base.metrics.peakAyG) / base.metrics.peakAyG < 1e-9,
    '还原参数后指标回到基准（无残留状态）');
}

console.log('=== 4. A/B 对比 ===');
{
  const a = CMP.capture('A');
  /* 用真正进 K1 的杠杆（弹簧刚度），不用 cam0——实测 cam0 不改任何物理输出 */
  const kS0 = S.front.kS;
  S.front.kS = kS0 * 1.2;
  const b = CMP.capture('B');
  S.front.kS = kS0;

  assert(a.hash !== b.hash, `两方案指纹不同（${a.hash} vs ${b.hash}）`);
  const d = CMP.diff();
  assert(d && d.rows.length > 5, `对比行数 ${d && d.rows.length}`);
  assert(d.sameConfig === false, 'diff 判定为不同配置');
  const changed = d.rows.filter(r => r.pct !== null && Math.abs(r.pct) > 0.1);
  note(`差异 >0.1% 的项：${changed.length} 条`);
  note(changed.slice(0, 4).map(r => `${r.layer}/${r.name} ${r.a}→${r.b} (${r.pct.toFixed(2)}%)`).join(' · '));
  assert(changed.length > 0, '至少一项出现可见差异');

  const csv = CMP.toCsv(d);
  assert(csv.split('\n').length === d.rows.length + 2, `CSV 行数 ${csv.split('\n').length} = 行 + 表头 + 注释`);
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} compare checks passed!`);
console.log(`========================================`);
process.exit(0);