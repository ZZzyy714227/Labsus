/**
 * test_perf_tiers.js —— 性能档位（轮胎 5 档 × 动力 5 档）回归（2026-11-20）
 *
 * 守五件事：
 *  ① 档位表完整且单调：5 档 × 5 档，id 连续 1..5，轮胎 Fy0/动力扭矩随档位单调递增
 *  ② **单一真源**：`PERF.tireParams()` / `PERF.powerSpec()` 是唯一入口，档位值可从表读出
 *  ③ `PERF.apply()` 真接线：轮胎写 `SIM.userTire`、动力写 `POWERTRAIN.spec`（扭矩曲线按档缩放）
 *  ④ **无头环境不改变历史缺省**（DOM 守卫）：桩 DOM 下加载 16-powertrain 后，
 *     `POWERTRAIN.spec` 必须仍是 LEGACY-EQUIVALENT（否则圈速/动力对拍锚全漂）
 *  ⑤ 引擎侧载荷自洽：`powerPayload()` 的 T_max/P_kw 与档位表同量级
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('[PASS] ' + msg); }
  else { failed++; console.error('[FAIL] ' + msg); }
}
const note = (m) => console.log('   ··  ' + m);

const webDir = path.join(__dirname, '..');
const ptSrc = fs.readFileSync(path.join(webDir, 'js', '16-powertrain.js'), 'utf8');

/* ── 桩 DOM（与 test_lap_15dof 一致的"无头"语义：getElementById 恒 null）── */
const _n = () => {};
const stubDoc = {
  documentElement: { setAttribute: _n, getAttribute: () => null },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add: _n, remove: _n, toggle: _n }, appendChild: _n }),
  addEventListener: _n, readyState: 'complete',
};
const ctx = {
  window: { S: {} }, console, Math, Number, Array, Object, JSON, String, Boolean,
  document: stubDoc,
  localStorage: { getItem: () => null, setItem: _n },
  setTimeout: _n, parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set,
};
ctx.globalThis = ctx;
ctx.window.document = stubDoc;
vm.createContext(ctx);
vm.runInContext(ptSrc, ctx, { filename: '16-powertrain.js' });

const W = ctx.window;
const PERF = W.PERF;
assert(!!PERF, 'PERF 档位表已导出到 window');

/* ── ① 档位表完整 + 单调 ── */
console.log('=== ① 档位表（5×5，单调）===');
{
  assert(W.TIRE_TIERS.length === 5 && W.POWER_TIERS.length === 5, '轮胎/动力各 5 档');
  const tIds = W.TIRE_TIERS.map(t => t.id).join(',');
  const pIds = W.POWER_TIERS.map(p => p.id).join(',');
  assert(tIds === '1,2,3,4,5' && pIds === '1,2,3,4,5', '档位 id 连续 1..5');
  let tMono = true, pMono = true;
  for (let i = 1; i < 5; i++) {
    if (!(W.TIRE_TIERS[i].Fy0 > W.TIRE_TIERS[i - 1].Fy0)) tMono = false;
    if (!(W.POWER_TIERS[i].tqScale > W.POWER_TIERS[i - 1].tqScale)) pMono = false;
  }
  assert(tMono, '轮胎档 Fy0 随档位单调递增（抓地力）');
  assert(pMono, '动力档扭矩缩放随档位单调递增');
  note('轮胎 μ: ' + W.TIRE_TIERS.map(t => t.mu).join(' → '));
  note('动力 kW: ' + W.POWER_TIERS.map(p => p.kw).join(' → '));
  assert(W.TIRE_TIERS[4].mu > W.TIRE_TIERS[0].mu * 1.5, '顶档抓地力比入门档高 50%+（档位有意义）');
}

/* ── ④ 无头环境：不得改动历史缺省 ── */
console.log('=== ④ 无头环境保持 LEGACY-EQUIVALENT（DOM 守卫）===');
{
  const dflt = W.POWERTRAIN.defaultSpec();
  const cur = W.POWERTRAIN.spec;
  const dm = JSON.stringify(dflt.ice.map), cm = JSON.stringify(cur.ice.map);
  note('spec 扭矩峰值: 缺省 ' + Math.max(...dflt.ice.map.map(x => x[1])) +
       ' vs 当前 ' + Math.max(...cur.ice.map.map(x => x[1])));
  assert(dm === cm, '无 DOM 时自动应用被跳过 ⇒ 扭矩曲线与 defaultSpec 逐位相同（对拍锚安全）');
}

/* ── ②③ apply 真接线 ── */
console.log('=== ②③ apply()：轮胎→SIM.userTire，动力→POWERTRAIN.spec ===');
{
  const sim = { userTire: null, tireCalibEy: NaN };
  ctx.SIM = sim;                       // 模拟浏览器里的全局 SIM
  const d1 = PERF.apply({ tire: 1, power: 1 });
  const tp1 = sim.userTire;
  const sp1 = W.POWERTRAIN.spec;
  const peak1 = Math.max(...sp1.ice.map.map(x => x[1]));
  note(`T1×P1：Fy0=${tp1.Fy0} μ=${(tp1.Fy0 / tp1.FzNom).toFixed(2)} 峰值扭矩=${peak1.toFixed(1)}N·m`);
  assert(tp1 && tp1.Fy0 === W.TIRE_TIERS[0].Fy0, '轮胎档写入了 SIM.userTire');
  assert(sim.tireCalibEy === W.TIRE_TIERS[0].Ey, 'Ey 同步写入（与引擎 payload 同口径）');
  const dfltPeak = Math.max(...W.POWERTRAIN.defaultSpec().ice.map.map(x => x[1]));
  assert(Math.abs(peak1 - dfltPeak * W.POWER_TIERS[0].tqScale) < 1e-6,
    '动力档按 tqScale 缩放扭矩曲线（P1 = ×' + W.POWER_TIERS[0].tqScale + '）');

  const d5 = PERF.apply({ tire: 5, power: 5 });
  const tp5 = sim.userTire;
  const peak5 = Math.max(...W.POWERTRAIN.spec.ice.map.map(x => x[1]));
  note(`T5×P5：Fy0=${tp5.Fy0} μ=${(tp5.Fy0 / tp5.FzNom).toFixed(2)} 峰值扭矩=${peak5.toFixed(1)}N·m`);
  assert(tp5.Fy0 > tp1.Fy0, '高档轮胎 Fy0 更大（真接线）');
  assert(peak5 > peak1, '高档动力扭矩更大（真接线）');
  assert(d5.text.indexOf('T5') === 0 && d5.text.indexOf('P5') > 0, 'describe() 反映当前组合：' + d5.text);
}

/* ── ⑤ 引擎载荷自洽 ── */
console.log('=== ⑤ powerPayload()（给 K3 引擎）===');
{
  PERF.apply({ tire: 5, power: 5 });
  const pl = PERF.powerPayload();
  note(`T_max=${pl.T_max}N·m  P_kw=${pl.P_kw}kW  tire.Fy0=${pl.tire.Fy0}`);
  assert(pl.T_max > 0 && pl.P_kw > 0, 'T_max / P_kw 为正');
  assert(pl.tire && pl.tire.Fy0 === W.TIRE_TIERS[4].Fy0, '载荷带当前轮胎档参数');
  assert(pl.P_kw > 100, 'P5 功率 > 100kW（"冗余动力"设定）');
}

/* ── 默认档 = T5 × P5 ── */
console.log('=== 默认档位 ===');
{
  assert(W.PERF_TIERS.tire === 5 && W.PERF_TIERS.power === 5,
    '默认 = 最好的轮胎(T5) + 冗余动力(P5)');
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
