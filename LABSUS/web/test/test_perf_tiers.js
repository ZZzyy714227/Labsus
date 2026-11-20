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

/* ── 轮胎工坊桩（模拟 TIRE_LAB 的正统入口）：只记录 applyToState 调用 ── */
let tireLabCalls = [];
ctx.TIRE_LAB = {
  pressureBase: () => 180,
  applyToState(cfg) {
    tireLabCalls.push(JSON.parse(JSON.stringify(cfg)));
    // 真实工坊会写 SIM.userTire；这里同步一份，便于 activeTireParams 读取
    if (!ctx.SIM) ctx.SIM = {};
    ctx.SIM.userTire = Object.assign({}, cfg.mf, { p: cfg.front.p });
    this.active = { name: cfg.name || null };
  }
};
ctx.SIM = {};

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
  /* 2026-11-20 融合后：有工坊时走 TIRE_LAB（Ey 随 userTire 一起进去）；
     无工坊的兜底路径才写 SIM.tireCalibEy。这里两种都要能同口径读到 Ey。 */
  const eyNow = (ctx.SIM && ctx.SIM.userTire && ctx.SIM.userTire.Ey);
  assert(eyNow === W.TIRE_TIERS[0].Ey, 'Ey 随轮胎参数同口径生效（userTire.Ey）');
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

/* ── ⑥ 与两个既有设计系统的融合（2026-11-20）── */
console.log('=== ⑥ 融合：档位 seed 工坊 / 工坊改参数后档位显示自定义 ===');
{
  const W = ctx.window;
  // (1) 档位 seed 走 TIRE_LAB.applyToState（不是旁路写 SIM）
  tireLabCalls = [];
  W.PERF.apply({ tire: 4, power: 3 });
  assert(tireLabCalls.length === 1, '选档位时调用轮胎工坊 applyToState（走正统入口）');
  const seeded = tireLabCalls[0];
  assert(seeded.mf.Fy0 === W.TIRE_TIERS[3].Fy0, '灌入工坊的是该档 MF 参数（T4 Fy0=' + W.TIRE_TIERS[3].Fy0 + '）');
  assert(String(seeded.name).indexOf('档位T4') === 0, '工坊里能看到来源档位（name=档位T4…）');
  assert(W.PERF_TIERS.tire === 4, '自己 seed 不被误判成"自定义"');

  // (2) 工坊手动应用（非档位名）⇒ 档位标记自定义，且不再覆盖用户值
  tireLabCalls = [];
  W.PERF.onTireChanged('我的胎');
  assert(W.PERF_TIERS.tire === 'custom', '工坊应用轮胎后档位变"自定义"');
  W.PERF.apply();
  assert(tireLabCalls.length === 0, '自定义态下再 apply 不会覆盖工坊轮胎');
  const at = W.PERF.activeTireParams();
  assert(at.tier === 'custom' && at.Fy0 === seeded.mf.Fy0, 'activeTireParams 取工坊实际值（K2/K3 载荷同源）');

  // (3) 动力同理：工坊改 spec ⇒ 自定义；再选档位以工坊规格为基准乘倍率
  W.PERF.apply({ tire: 5, power: 2 });
  const baseSpec = W.POWERTRAIN.spec;
  const basePeak = Math.max(...baseSpec.ice.map.map(x => x[1]));
  // 模拟工坊选了一个 2 倍扭矩的预设（不带 perfTier 标记 ⇒ 视为用户自定义）
  const custom = JSON.parse(JSON.stringify(baseSpec));
  delete custom.perfTier; delete custom.perfTierName;
  custom.ice.map = custom.ice.map.map(([r, t]) => [r, t * 2]);
  W.POWERTRAIN.setSpec(custom);
  assert(W.PERF_TIERS.power === 'custom', '工坊改动力规格后档位变"自定义"');
  assert(W.PERF_TIERS.tire === 5, '动力自定义不影响轮胎档位');
  // 再选 P5：以工坊基准（2×）乘 1.8
  W.PERF.apply({ power: 5 });
  const peak5 = Math.max(...W.POWERTRAIN.spec.ice.map.map(x => x[1]));
  assert(Math.abs(peak5 - basePeak * 2 * 1.8) < 1e-6,
    '再选档位以工坊规格为基准叠加倍率（实测 ' + peak5.toFixed(0) + ' vs 期望 ' + (basePeak * 2 * 1.8).toFixed(0) + '）');
  assert(W.PERF_TIERS.power === 5, '重新选档位后回到档位模式');
}

/* ── 默认档 = T5 × P5 ── */
console.log('=== 默认档位 ===');
{
  assert(W.PERF_TIERS.tire === 5 && W.PERF_TIERS.power === 5,
    '默认 = 最好的轮胎(T5) + 冗余动力(P5)');
}

/* ── ⑦ 真模块集成：01-core + 14-tire-lab + 16-powertrain 同沙箱 ── */
console.log('=== ⑦ 真模块集成（无头）：档位 ↔ 轮胎工坊/动力工坊 双向同步 ===');
{
  const _n2 = () => {};
  const stubDoc2 = {
    documentElement: { setAttribute: _n2, getAttribute: () => null },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: _n2, remove: _n2, toggle: _n2 }, appendChild: _n2 }),
    addEventListener: _n2, readyState: 'complete',
  };
  const c2 = {
    window: { S: {} }, console, Math, Number, Array, Object, JSON, String, Boolean,
    document: stubDoc2, localStorage: { getItem: () => null, setItem: _n2 },
    setTimeout: _n2, parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set,
  };
  c2.globalThis = c2;
  c2.window.document = stubDoc2;
  c2.S = { vehicleType: 'formula',
           front: { kT: 180, tire: { R: 230, W: 175, rim: 127 } },
           rear: { kT: 190, tire: { R: 235, W: 205, rim: 127 } } };
  c2.SIM = {};
  vm.createContext(c2);
  let loadErr = null;
  for (const f of ['01-core.js', '14-tire-lab.js', '16-powertrain.js']) {
    try { vm.runInContext(fs.readFileSync(path.join(webDir, 'js', f), 'utf8'), c2, { filename: f }); }
    catch (e) { loadErr = f + ': ' + e.message; break; }
  }
  assert(!loadErr, '真模块可无头加载（01-core + 14-tire-lab + 16-powertrain）' + (loadErr ? ' — ' + loadErr : ''));
  if (!loadErr) {
    const TL = c2.window.TIRE_LAB, P2 = c2.window.PERF;
    // 1) 选档位 → 灌进真轮胎工坊（active.name 带来源标记，SIM.userTire 生效）
    P2.apply({ tire: 5, power: 5 });
    assert(String(TL.active && TL.active.name).indexOf('档位T5') === 0,
      '真工坊 active.name 保留档位来源标记（' + (TL.active && TL.active.name) + '）');
    assert(c2.SIM.userTire && c2.SIM.userTire.Fy0 === 6650, '真工坊写出 SIM.userTire.Fy0=6650（T5）');
    assert(c2.window.PERF_TIERS.tire === 5, 'seed 后档位仍是 T5（不被误标自定义）');
    // 2) 工坊手动改 → 档位显示自定义
    TL.applyToState(Object.assign({}, TL.active, { name: '我的自定义胎' }));
    assert(c2.window.PERF_TIERS.tire === 'custom', '真工坊手动应用后档位 = 自定义');
    // 3) 再选 T4 → 档位重新接管（覆盖自定义）
    P2.apply({ tire: 4 });
    assert(c2.window.PERF_TIERS.tire === 4 && String(TL.active.name).indexOf('档位T4') === 0,
      '再选 T4 ⇒ 工坊回到档位基准');
    // 4) 恢复内置 → 回到 T3（内置胎 = 引擎缺省 μ1.50）
    TL.restoreBuiltin();
    assert(c2.window.PERF_TIERS.tire === 3 && !c2.SIM.userTire,
      '恢复内置 ⇒ 档位回 T3 且 userTire 清空');
    // 5) 动力：工坊自定义 → 自定义；再选档位以工坊规格为基准乘倍率
    P2.apply({ power: 2 });
    const PT = c2.window.POWERTRAIN;
    const base2 = Math.max(...PT.spec.ice.map.map(x => x[1]));
    const cust = JSON.parse(JSON.stringify(PT.spec));
    delete cust.perfTier; delete cust.perfTierName;
    cust.ice.map = cust.ice.map.map(([r, t]) => [r, t * 1.5]);
    PT.setSpec(cust);
    assert(c2.window.PERF_TIERS.power === 'custom', '真动力工坊改规格后档位 = 自定义');
    P2.apply({ power: 5 });
    const peak2 = Math.max(...PT.spec.ice.map.map(x => x[1]));
    assert(Math.abs(peak2 - base2 * 1.5 * 1.8) < 1e-6, '再选 P5 ⇒ 工坊基准 × 1.5 × 1.8');
    // 6) 恢复内置动力 → 回到 P3
    PT.setSpec(PT.defaultSpec());
    assert(c2.window.PERF_TIERS.power === 3, '动力恢复内置 ⇒ 档位回 P3');
  }
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
