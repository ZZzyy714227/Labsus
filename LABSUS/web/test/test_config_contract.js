/* test_config_contract.js —— 配置字段契约（N1，2026-11-20）
 *
 * 存在理由
 * ─────────────────────────────────────────────────────────────────────
 * `CAR_CAPABILITY` 曾读 `S.m` —— 预设里根本没有这个字段 ⇒ 恒回落 235 kg，
 * 使 gt3（1250 kg）的气动增益分母错 5 倍，50 m/s 处加速极限谎报 4.39 m/s²（真值 ~2.2）。
 * 同类事故还有 `S.tire`（预设只有 `S.front.tire`/`S.rear.tire`）：
 * 视图自适应恒按 260 mm 留白，gt3 胎半径 300 时轮胎被裁。
 *
 * 本测试把"代码读的 `S.*` 字段"与"预设/运行时真实提供的字段"对撞，
 * 任何**新增的隐式缺字段读取**都会让门禁变红。
 *
 * 白名单分三类（都写清理由）：
 *   A. 可选功能开关：undefined 就是默认值，是设计行为（不是 bug）
 *   B. 诚实降级：明知无值就以 null/"—" 显示，不伪造数字（如 ackermannPct）
 *   C. 静态误报：局部变量恰好叫 S（如 `S.toFixed`）
 *
 * 单独跑：node web/test/test_config_contract.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const webDir = path.join(__dirname, '..');
const jsDir = path.join(webDir, 'js');

/* ── 白名单 ─────────────────────────────────────────────────────────── */
const OPTIONAL_FLAGS = new Set([
  'carEnvelope', 'tireMuFromParams', 'complianceSteer', 'rollInertia', 'pitchInertia',
  'tireRelax', 'yawDampK', 'pitchDampK', 'rollDampK', 'wheelDof', 'wallCollision',
  'legacyPitchInertia', 'road', 'roadCls', 'roadOn', 'kerbOn', 'show',
]);
const HONEST_NULL = new Set(['ackermann']);   // 未计算 ⇒ 显示 "—"
const FALSE_POSITIVE = new Set(['toFixed', 'length', 'map', 'forEach', 'filter', 'concat']);

/* ── 1. 预设真实拥有的键 ─────────────────────────────────────────── */
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11);
const presetKeys = new Set();
for (const p of ['formula', 'gt3', 'gt3_sport', 'baja']) {
  try { ctx.loadVehiclePreset(p); } catch (e) { continue; }
  Object.keys(ctx.S).forEach(k => presetKeys.add(k));
}

/* ── 2. 剥离注释后扫描 {读取, 赋值} ───────────────────────────────── */
function stripComments(src) {
  /* 保留换行以维持行号；块注释与行注释都去掉 */
  let out = '', i = 0, n = src.length, inBlock = false, inLine = false, inStr = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } else out += ' '; i++; continue; }
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; out += '  '; i += 2; } else { out += (c === '\n' ? c : ' '); i++; } continue; }
    if (inStr) { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '/' && d === '/') { inLine = true; out += '  '; i += 2; continue; }
    if (c === '/' && d === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const reads = new Map(), assigned = new Set();
const RE_ASSIGN = /\bS\.([a-zA-Z_]\w*)\s*=(?!=)/g;
const RE_NESTED = /\bS\.(front|rear|qs)\.([a-zA-Z_]\w*)/g;
const RE_READ = /\bS\.([a-zA-Z_]\w*)/g;

for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js'))) {
  const clean = stripComments(fs.readFileSync(path.join(jsDir, f), 'utf8'));
  clean.split('\n').forEach((ln, i) => {
    let m;
    RE_ASSIGN.lastIndex = 0; while ((m = RE_ASSIGN.exec(ln))) assigned.add(m[1]);
    RE_NESTED.lastIndex = 0; while ((m = RE_NESTED.exec(ln))) assigned.add(m[1] + '.' + m[2]);
    RE_READ.lastIndex = 0;
    while ((m = RE_READ.exec(ln))) {
      const k = m[1];
      if (k === 'front' || k === 'rear' || k === 'qs') continue;
      if (!reads.has(k)) reads.set(k, []);
      reads.get(k).push(f + ':' + (i + 1));
    }
  });
}

/* ── 3. 判定 ─────────────────────────────────────────────────────── */
let pass = 0, fail = 0;
const failures = [];
const chk = (cond, msg) => {
  if (cond) { pass++; console.log('  [PASS] ' + msg); }
  else { fail++; failures.push(msg); console.log('  [FAIL] ' + msg); }
};

console.log('=== 1. 字段契约 ===');
const unexpected = [];
for (const [k, where] of reads) {
  if (presetKeys.has(k) || assigned.has(k)) continue;
  if (OPTIONAL_FLAGS.has(k) || HONEST_NULL.has(k) || FALSE_POSITIVE.has(k)) continue;
  unexpected.push({ key: k, count: where.length, sample: where.slice(0, 3) });
}
unexpected.sort((a, b) => b.count - a.count);
if (unexpected.length) {
  unexpected.forEach(u => console.log(`   ··  未登记字段 S.${u.key}（${u.count} 处）：${u.sample.join(', ')}`));
}
chk(unexpected.length === 0,
  `无"读了但从不提供"的 S.* 字段（发现 ${unexpected.length} 个未登记）`);

/* ── 4. 预设不变量（02-presets.js 头部声明）──────────────────────── */
console.log('=== 2. 预设不变量 ===');
const inv = [];
for (const p of ['formula', 'gt3', 'gt3_sport', 'baja']) {
  try { ctx.loadVehiclePreset(p); } catch (e) { continue; }
  const S = ctx.S;
  const mU = 2 * ((S.front.mU || 0) + (S.rear.mU || 0));
  const mSSum = (S.front.mS || 0) + (S.rear.mS || 0);
  const dSprung = Math.abs(mSSum - S.mSprung) / S.mSprung * 100;
  const dTotal = Math.abs(S.mSprung + mU - S.mTotal) / S.mTotal * 100;
  inv.push({ p, dSprung, dTotal, mTotal: S.mTotal });
  console.log(`   ··  ${p}: mTotal=${S.mTotal} mSprung=${S.mSprung} 两轴mS和=${mSSum.toFixed(1)} 非簧载=${mU}`);
  chk(dTotal < 0.5, `${p} 质量不变量：mSprung+2(mU_f+mU_r) = mTotal（差 ${dTotal.toFixed(3)}%）`);
  chk(dSprung < 0.5, `${p} 簧载不变量：mS_f+mS_r = mSprung（差 ${dSprung.toFixed(3)}%）`);
  chk(S.mTotal > 150 && S.mTotal < 2000, `${p} mTotal=${S.mTotal} kg 在合理区间`);
}

/* ── 5. 能力表缓存键含真实质量（N1 直接回归）────────────────────── */
console.log('=== 3. 能力表缓存键 ===');
{
  const src = fs.readFileSync(path.join(jsDir, '21-car-capability.js'), 'utf8');
  const clean = stripComments(src);
  chk(/\bS\.mTotal\b/.test(clean), 'CAR_CAPABILITY 的配置指纹读 mTotal（真实字段）');
  chk(!/\bS\.m\b(?!Total)/.test(clean.replace(/S\.mTotal/g, '')),
    'CAR_CAPABILITY 不再读不存在的 S.m');

}

console.log(`\n========================================`);
if (fail) {
  console.log(`配置契约检查 FAIL：${fail}/${pass + fail} 项失败`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log(`配置契约检查 PASS：${pass}/${pass + fail} 项全过`);
console.log(`========================================`);
process.exit(0);
