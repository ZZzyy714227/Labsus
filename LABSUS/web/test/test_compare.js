'use strict';
/* 沙箱统一走 _stage_harness.js —— 不再内联第四份（见该文件头注释） */
const vm = require('vm');
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js', '19-compare.js', '20-lat-bench.js']));
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

/* ── 8. 多方案对比（线 C · C1）────────────────────────────────────
   从 A/B 两槽扩到方案库 N 条：逐条灌入快照 → 跑三层台 → 还原。 */
console.log('=== 8. 多方案对比（C1）===');
{
  const mk = (name, kSscale) => ({
    name: name, veh: S.vehicleType, wb: S.wb, hcg: S.hcg, hs: S.hs,
    mTotal: S.mTotal, mSprung: S.mSprung,
    front: Object.assign({}, S.front, { kS: S.front.kS * kSscale }),
    rear: Object.assign({}, S.rear, { kS: S.rear.kS * kSscale })
  });
  const beforeFront = JSON.stringify(S.front), beforeRear = JSON.stringify(S.rear);
  const recs = [mk('基准', 1), mk('硬簧', 1.2), mk('软簧', 0.8)].map(r => CMP.captureScheme(r));
  assert(JSON.stringify(S.front) === beforeFront && JSON.stringify(S.rear) === beforeRear,
    '采集后 S 完全还原（无残留）');
  assert(recs.every(r => r.statics.length > 0 && r.dynamics.length === 4 && r.tracks.length === 4),
    `三个方案都采到三层指标（各 ${recs[0].statics.length}/${recs[0].dynamics.length}/${recs[0].tracks.length}）`);

  const d = CMP.diffMulti(recs);
  assert(d && d.labels.length === 3, `对比表 3 列（${d && d.labels.join('/')}）`);
  assert(d.rows.length === recs[0].statics.length + 4 + 4, `行数 = 三层之和（${d.rows.length}）`);
  assert(d.rows.every(r => r.pcts[0] === null), '基准列无 Δ%');
  const changed = d.rows.filter(r => r.pcts[1] !== null && Math.abs(r.pcts[1]) > 0.5);
  note(`硬簧方案可见差异 ${changed.length} 项：` +
    changed.slice(0, 3).map(r => `${r.name} ${r.pcts[1].toFixed(2)}%`).join(' · '));
  assert(changed.length > 0, '硬簧方案相对基准有可见差异');

  const csv = CMP.toCsvMulti(d);
  assert(csv.split('\n').length === d.rows.length + 1, `多方案 CSV 行数 ${csv.split('\n').length} = 行 + 表头`);
}

/* ── 9. 开发看板（线 C · C2）────────────────────────────────────
   判定只用两种真源：EVAL_BENCHMARKS 目标带、解析锚；无判据的量 grade=null。 */
console.log('=== 9. 开发看板（C2）===');
{
  const d = CMP.dashboard();
  note(`达标 ${d.good} · 边缘 ${d.warn} · 越界 ${d.bad} · 无判据 ${d.unknown}`);
  assert(d.rows.length >= 20, `看板指标数 ${d.rows.length} >= 20`);
  assert(d.good + d.warn + d.bad >= 10, `有判据的指标 >= 10（实测 ${d.good + d.warn + d.bad}）`);
  assert(d.rows.every(r => r.grade === null || ['good', 'warn', 'bad'].includes(r.grade)),
    '状态取值合法（good/warn/bad/null）');
  const byLayer = (L) => d.rows.filter(r => r.layer === L).length;
  assert(byLayer('静态') > 0 && byLayer('动态') > 0 && byLayer('赛道') > 0,
    `三层都有指标（静态 ${byLayer('静态')} / 动态 ${byLayer('动态')} / 赛道 ${byLayer('赛道')}）`);
  /* 解析锚项必须带偏差，否则"有锚却不算偏差"是假看板 */
  const anchored = d.rows.filter(r => r.errPct !== null);
  assert(anchored.length >= 2, `有解析锚的指标 ${anchored.length} 项带偏差`);
  assert(anchored.every(r => r.errPct < 10), '锚偏差都在 10% 内（模型自洽）');
}

console.log(`\n========================================`);
console.log(`All ${passed}/${total} compare checks passed!`);
console.log(`========================================`);
process.exit(0);