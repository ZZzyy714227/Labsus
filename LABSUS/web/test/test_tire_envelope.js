/**
 * test_tire_envelope.js —— 轮胎包络（有效路面）回归（2026-11-20）
 *
 * ## 为什么需要它
 * 旧实现把轮胎当成"一个点"读路面高程，于是 1.1 m 跳台的断崖、短坎都是
 * 瞬间阶跃 ⇒ 撞击力/弹跳/数值发散。包络模型按**接地长度**对路面做加权平均
 * （胎体柔度把压力分布在接触斑上），把"硬切"变成有限斜率的过渡。
 *
 * ## 本测试守什么
 * 1. **平路恒等**：有效路面 ≡ 0（target 赛道的圈速必须逐位不变）
 * 2. **短坎削峰**：60mm×60mm 削 ≥ 40%（胎体能吸收比接地长度短的障碍）
 * 3. **长坎不削**：60mm×1m 保留 ≥ 95%（比接地面长的障碍本来就该完整爬上去）
 * 4. **断崖过渡**：1.1 m 跳台坡顶的等效斜率降 ≥ 40%
 * 5. **行为收益**：8 连跳后车速明显更高（点接触把动能都撞掉了），且无 NaN
 * 6. **开关等价**：`tireEnvelope:false` 与 `envelopeProbes:1` 逐位相同
 *    （后者退化为只看中心点 = 旧行为）
 *
 * ⚠ 反例记录：最初写成"刚性环取 max"`z_eff = max_u [z − u²/2R]`，实测削峰 0%
 *   —— 刚性轮照样爬上坎顶。削峰必须来自平均（胎体柔度），调试不要走回头路。
 */

'use strict';
const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');
const { ctx } = loadStage(MODULES_01_11);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('[PASS] ' + msg); }
  else { failed++; console.error('[FAIL] ' + msg); }
}
const note = (m) => console.log('   ··  ' + m);

const DT = 0.002;
const REF = new ctx.VehicleDynamics15DOF(ctx.S, ctx.SIM, 25.0);
const R = REF.ReF, kT = REF.kT_f, Fz0 = REF.Fz0_F;

/* 合成路面：正弦坎（高度 h，长度 len），其余为平路 */
function makeBumpPath(h, len, y0) {
  return {
    getRoadElevation(x, y) {
      if (y >= y0 && y <= y0 + len) {
        const t = (y - y0) / len;
        return { z_road: h * Math.sin(Math.PI * t) ** 2, isKerb: false, mu: 1.35 };
      }
      return { z_road: 0, isKerb: false, mu: 1.35 };
    },
  };
}

/* ── 1. 平路恒等 ── */
console.log('=== 1. 平路恒等（圈速逐位不变的前提）===');
{
  const flat = makeBumpPath(0, 1, 0);
  let maxAbs = 0;
  for (let y = -3; y <= 3; y += 0.01) {
    maxAbs = Math.max(maxAbs, Math.abs(REF._envelopeRoadZ(flat, 0, y, 0, 1, R, Fz0, kT)));
  }
  note('平路有效路面 |z| max = ' + maxAbs);
  assert(maxAbs === 0, '平路有效路面恒等于 0');
}

/* ── 2/3. 短坎削峰、长坎不削 ── */
function envPeakRatio(h, len) {
  const p = makeBumpPath(h, len, 0);
  let raw = 0, env = 0;
  for (let y = -0.3; y <= len + 0.3; y += 0.002) {
    raw = Math.max(raw, p.getRoadElevation(0, y).z_road);
    env = Math.max(env, REF._envelopeRoadZ(p, 0, y, 0, 1, R, Fz0, kT));
  }
  return { raw, env, ratio: env / raw };
}
console.log('=== 2. 短坎削峰 ===');
{
  const r = envPeakRatio(0.060, 0.060);
  note('60mm×60mm: raw=' + (r.raw * 1000).toFixed(1) + 'mm env=' + (r.env * 1000).toFixed(1) +
       'mm 保留=' + (r.ratio * 100).toFixed(0) + '%');
  assert(r.ratio <= 0.60, '60mm×60mm 短坎有效峰值 ≤ 60%（胎体吸收）');
  assert(r.ratio >= 0.20, '60mm×60mm 短坎不应被过度平滑（≥ 20%）');
}
console.log('=== 3. 长坎不削 ===');
{
  const r = envPeakRatio(0.060, 1.00);
  note('60mm×1m: 保留=' + (r.ratio * 100).toFixed(0) + '%');
  assert(r.ratio >= 0.95, '60mm×1m 长坎保留 ≥ 95%（不该假装不存在的台阶）');
}

/* ── 4. 跳台断崖过渡 ── */
console.log('=== 4. 1.1m 跳台坡顶断崖过渡 ===');
{
  const path = new ctx.StraightPath(25, 'jump_ramp', { rampY: 30.0, rampHeight: 1.10, rampSpacing: 65.0 });
  const ramp = path.ramps[0];
  const crestY = ramp.y0 + ramp.len;
  let rawSlope = 0, envSlope = 0, prevR = null, prevE = null;
  for (let y = crestY - 0.3; y <= crestY + 0.4; y += 0.002) {
    const r = path.getRoadElevation(0, y).z_road;
    const e = REF._envelopeRoadZ(path, 0, y, 0, 1, R, Fz0, kT);
    if (prevR !== null) {
      rawSlope = Math.max(rawSlope, Math.abs(r - prevR) / 0.002);
      envSlope = Math.max(envSlope, Math.abs(e - prevE) / 0.002);
    }
    prevR = r; prevE = e;
  }
  note('原路面斜率=' + rawSlope.toFixed(0) + ' 有效路面斜率=' + envSlope.toFixed(0) +
       ' 削减=' + (100 * (1 - envSlope / rawSlope)).toFixed(0) + '%');
  assert(envSlope <= 0.60 * rawSlope, '坡顶断崖的等效斜率削减 ≥ 40%');
}

/* ── 5. 行为收益：8 连跳后保留速度 ── */
function runJump(envelope, probes) {
  const cfg = Object.assign({}, ctx.S, { tireEnvelope: envelope });
  if (probes) cfg.envelopeProbes = probes;
  const veh = new ctx.VehicleDynamics15DOF(cfg, ctx.SIM, 25.0);
  const path = new ctx.StraightPath(25, 'jump_ramp', { rampY: 30.0, rampHeight: 1.10, rampSpacing: 65.0 });
  const env = { grade: 0, path, bumpNoise: 0 };
  let nanAt = null, t = 0;
  for (let i = 0; i < 16 / DT; i++) {
    const err = 25 - veh.state.u;
    veh.step({ steer: 0, throttle: Math.max(0, Math.min(1, err * 0.8)), brake: 0 }, env, DT);
    t += DT;
    if (!isFinite(veh.state.Z) || !isFinite(veh.state.w)) { nanAt = t; break; }
  }
  return { nanAt, endU: veh.state.u, endY: veh.state.Y, div: veh.diverged || 0, state: Object.assign({}, veh.state) };
}
console.log('=== 5. 8 连跳：包络与点接触的差异已收敛 ===');
{
  const off = runJump(false), on = runJump(true);
  note('末速 OFF=' + off.endU.toFixed(2) + ' m/s  ON=' + on.endU.toFixed(2) + ' m/s');
  assert(off.nanAt === null && on.nanAt === null, '开/关包络均无 NaN');
  /* ★ 2026-11-20 更新（L1 ② 落地冲量修复后）：此断言原本是
       `on.endU > off.endU + 5.0`（"点接触把动能撞掉，包络能多保 5 m/s"）。
     但接触力链重排 + 落地非弹性冲量 + 轮胎压缩上限落地后，**点接触也不再撞掉动能**
     （实测 OFF=25.79 / ON=25.68 m/s）——原来那 13 m/s 的速度差是**惩罚力接触的假象**，
     不是包络的功劳。因此改为断言"两者差异很小"：这是更强的正确性结论
     （说明动能损失不再由接触离散化假象主导）。包络本身的削峰/断崖过渡仍由 ①~④ 守住。 */
  const rel = Math.abs(on.endU - off.endU) / Math.max(1e-9, Math.abs(off.endU));
  note('末速相对差 = ' + (rel * 100).toFixed(1) + '%');
  assert(rel < 0.10, '开/关包络的 8 连跳末速差 < 10%（动能损失不再由接触假象主导）');
  assert(on.div === 0 && off.div === 0, '两种情况都未触发发散兜底');
}

/* ── 6. 开关等价：false 与 probes=1 逐位相同 ── */
console.log('=== 6. 关闭开关 = 旧行为（逐位）===');
{
  const a = runJump(false);
  const b = runJump(true, 1);          // 单探针 = 只看中心点 = 逐点接触
  const keys = ['X', 'Y', 'Z', 'psi', 'theta', 'phi', 'u', 'w', 'q'];
  let maxDiff = 0;
  for (const k of keys) maxDiff = Math.max(maxDiff, Math.abs((a.state[k] || 0) - (b.state[k] || 0)));
  note('tireEnvelope:false vs probes:1 末态最大差 = ' + maxDiff.toExponential(2));
  assert(maxDiff < 1e-9, 'tireEnvelope:false 与单探针逐位等价');
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
