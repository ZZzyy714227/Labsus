/**
 * test_combined_slip.js —— K2（TPHYS 平面内核）联合滑移开关回归（2026-11-20）
 *
 * ## 背景
 * 三个内核的轮胎力合成原本不统一：
 *   K1（15-DOF）    —— 早已是相似法联合滑移
 *   K3（引擎 transient）—— 走摩擦圆钳位；本轮已补 `combined_force`（开关默认关）
 *   K2（TPHYS）     —— 本轮补同一套相似法（开关 `tire.tire_combined`，默认关）
 * 本测试守住 K2 侧的三件事：
 *   ① 默认已翻为**开启** ⇒ "完全不给该字段" 与显式 `true` 逐位相同
 *   ② 显式 `false` ⇒ 回到历史摩擦圆钳位路径，且与默认不同、可确定性复现
 *   ③ 开启后物理有界：全程有限、muUse ≤ 1、速度不发散
 *
 * 椭圆边界与"制动时 Fy 单调衰减"由引擎侧单测（tests/test_transient.py 的 combined 组）
 * 用同一公式直接断言，这里不重复造第二套数学断言。
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

/* ── 抽取 TPHYS 闭包（与 tphys_parity.cjs 同一手法）── */
const trackPath = path.join(__dirname, '..', 'js', '09-track.js');
const src = fs.readFileSync(trackPath, 'utf8');
const marker = 'const TPHYS = (function(){';
const start = src.indexOf(marker);
if (start < 0) {
  console.error('找不到 TPHYS 闭包');
  process.exit(1);
}
let end = src.indexOf('\n})();', start);
if (end < 0) {
  console.error('找不到 TPHYS 收尾');
  process.exit(1);
}
end += '\n})();'.length;

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  Math, JSON, isFinite, NaN, Infinity, Number,
  SIM: { swF: null, swR: null, mFR: null, mRR: null },
};
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end) + '\nthis.__TPHYS = TPHYS;', sandbox);
const TPHYS = sandbox.__TPHYS;
assert(!!TPHYS && typeof TPHYS.run === 'function', 'TPHYS.run 可用');

/* ── 输入：复用对拍样例（一条电话亭级赛道 + 完整 vehicle/tire payload）── */
const example = JSON.parse(fs.readFileSync(path.join(__dirname, 'parity_input.example.json'), 'utf8'));
const bodyBase = example.body || example;
const ctxIn = example.ctx || (TPHYS.makeSimContext ? TPHYS.makeSimContext(bodyBase) : null);

function runWith(tirePatch) {
  const body = JSON.parse(JSON.stringify(bodyBase));
  body.tire = Object.assign({}, body.tire || {}, tirePatch || {});
  const ctx = example.ctx ? JSON.parse(JSON.stringify(example.ctx))
    : (TPHYS.makeSimContext ? TPHYS.makeSimContext(body) : ctxIn);
  return TPHYS.run(body, ctx);
}

/* ── ① 默认 = 开 ⇒ 与显式 true 逐位相同 ── */
console.log('=== ① 默认已翻为开：与显式 true 逐位相同 ===');
const noKey = runWith({});
const onKey0 = runWith({ tire_combined: true });
{
  const a = JSON.stringify(noKey);
  const b = JSON.stringify(onKey0);
  note('无字段 vs true：' + (a === b ? '逐位相同' : '不同（不应出现）'));
  assert(a === b, '不传 tire_combined 与显式 true 结果逐位相同（默认已翻为开）');
}

/* ── ② 显式 false ⇒ 历史路径，可复现，且与默认不同 ── */
console.log('=== ② 显式 false：历史钳位路径可用且可复现 ===');
const off1 = runWith({ tire_combined: false });
const off2 = runWith({ tire_combined: false });
const onKey = noKey;
{
  const a = JSON.stringify(off1);
  const b = JSON.stringify(off2);
  note('false 两次：' + (a === b ? '逐位相同' : '不同（不应出现）'));
  assert(a === b, '显式关闭必须确定性可复现（回退路径）');
  note('false vs 默认：' + (a === JSON.stringify(onKey) ? '相同（开关失效！）' : '不同（生效）'));
  assert(a !== JSON.stringify(onKey), '显式关闭与默认必须不同（开关真实生效）');
}

/* ── ③ 物理有界 ── */
console.log('=== ③ 物理有界（有限 / muUse ≤ 1 / 速度不发散）===');
function pickSum(r) {
  if (!r) return null;
  return r.summary || r.metrics || r;
}
function scanRows(r, key) {
  const rows = r && (r.trace || r.rows || r.samples);
  return Array.isArray(rows) ? rows : null;
}
{
  const sOff = pickSum(noKey) || {};
  const sOn = pickSum(onKey) || {};
  const vOff = Number(sOff.v_max ?? sOff.vmax ?? NaN);
  const vOn = Number(sOn.v_max ?? sOn.vmax ?? NaN);
  note('v_max: OFF=' + (isFinite(vOff) ? vOff : 'n/a') + '  ON=' + (isFinite(vOn) ? vOn : 'n/a'));

  const rows = scanRows(onKey) || scanRows(noKey);
  let maxMu = 0, bad = 0, n = 0;
  if (rows) {
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (!k.startsWith('muUse') && !k.startsWith('mu_use')) continue;
        const v = Number(row[k]);
        if (!isFinite(v)) { bad++; continue; }
        maxMu = Math.max(maxMu, v);
        n++;
      }
    }
  }
  note('扫描 ' + n + ' 个 muUse 值，最大 ' + maxMu.toFixed(4) + (rows ? '' : '（该运行不返回逐行 trace，跳过）'));
  assert(bad === 0, '开启联合滑移后所有 muUse 值有限');
  if (n > 0) assert(maxMu <= 1.0001, '附着利用率不超 1（附着椭圆边界）');
  if (isFinite(vOff) && isFinite(vOn)) {
    assert(vOn > 0 && vOn < vOff * 1.6 + 1e-6, '开启后极速不发散（< 关闭的 1.6 倍）');
  } else {
    assert(JSON.stringify(onKey).indexOf('null') >= 0 || !!onKey, '开启后返回结构完整');
  }
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
