/**
 * param_wiring_audit.cjs —— 「参数 → 物理输入」接线审计（P35，2026-11-19）
 *
 * 存在理由：Phase D 实测发现 `S.front.cam0` 改了 **−2° 静态外倾，受控定圆峰值 ay 变化 0.00%**
 * ——它只喂机构/显示层，根本不进 K1。界面上能改的参数**不等于**物理输入，而这种静默失效
 * 最难发现：界面照样给你一个看起来合理的数字。
 *
 * 做法：对 `S` 里每个**数值参数**做一次扰动，跑同一段综合工况（直线加速 → 转向 + 路面凸起 → 回正），
 * 比 15 维状态与轮荷的采样签名。签名变了 ⇒ 该参数确实进了物理；没变 ⇒ 只影响显示/未接线。
 *
 * ⚠ 这是**诊断工具**，不是门禁：物理不敏感也可能是合理的（纯显示参数、冗余参数）。
 *   它给的是"需要人工确认的清单"，不是"必须修的 bug 列表"。
 *
 * 用法：node web/test/param_wiring_audit.cjs [--verbose]
 */
'use strict';

const { loadStage, MODULES_01_11 } = require('./_stage_harness.js');

const { ctx } = loadStage(MODULES_01_11.concat(['18-ride-bench.js']));
const S = ctx.S, SIM = ctx.SIM || {};
const V = (ctx.window && ctx.window.VehicleDynamics15DOF) || ctx.VehicleDynamics15DOF;
if (!V) { console.error('VehicleDynamics15DOF 未加载'); process.exit(1); }

const CTRL = (steer, thr, brk) => ({ steer: steer, throttle: thr, brake: brk || 0, drs: false });
const ENV = (bump) => ({ grade: 0, bumpNoise: bump || 0 });

/* ── 物理签名：一段综合工况，采样状态与轮荷 ───────────────────────
   工况要同时激励纵向/横向/垂向，否则"只影响侧向的参数"会被误判为未接线。 */
function signature() {
  let car;
  try { car = new V(S, SIM, 12); } catch (e) { return 'ERR:' + e.message; }
  const out = [];
  const push = () => {
    out.push(car.state.Z, car.state.u, car.state.v, car.state.r, car.state.p, car.state.q,
             car.telemetry.Fz.FL, car.telemetry.Fz.RR, car.telemetry.tr.FL, car.telemetry.tr.RR);
  };
  const dt = 0.001;
  for (let i = 0; i < 3000; i++) {
    const t = i * dt;
    const steer = t < 1.0 ? 0 : (t < 2.5 ? 4.0 : 0);
    const thr = t < 2.5 ? 0.6 : 0;
    const bump = (t > 1.20 && t < 1.26) ? 0.02 : 0;
    car.step(CTRL(steer, thr), ENV(bump), dt);
    if (i % 300 === 0) push();
  }
  push();
  return out.map((x) => (Number.isFinite(x) ? x.toFixed(10) : 'NaN')).join(',');
}

/* ── 枚举数值参数 ──────────────────────────────────────────────── */
const rows = [];
function collect(obj, path, depth) {
  if (!obj || depth > 2) return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) rows.push({ path: path + k, obj: obj, key: k, value: v });
    else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) collect(v, path + k + '.', depth + 1);
  }
}
collect(S, '', 0);

const base = signature();
if (base.startsWith('ERR')) { console.error('基准签名失败：' + base); process.exit(1); }

const verbose = process.argv.indexOf('--verbose') >= 0;
const results = [];
for (const r of rows) {
  const old = r.obj[r.key];
  const step = Math.abs(old) > 1 ? Math.abs(old) * 0.15 : 0.5;
  r.obj[r.key] = old + step;
  let sig;
  try { sig = signature(); } catch (e) { sig = 'ERR:' + e.message; }
  r.obj[r.key] = old;
  const wired = sig !== base;
  results.push({ path: r.path, old: old, delta: step, wired: wired, err: sig.startsWith('ERR') ? sig : null });
}

/* ── 报告 ──────────────────────────────────────────────────────── */
const wired = results.filter((x) => x.wired);
const dead = results.filter((x) => !x.wired);
console.log('============================================================');
console.log(`参数接线审计（P35）· 共 ${results.length} 个数值参数 · 物理已接线 ${wired.length} · 未接线 ${dead.length}`);
console.log('============================================================');
console.log('\n[已接线] 扰动后物理状态改变：');
for (const x of wired) console.log(`  ✓ ${x.path.padEnd(28)} ${String(x.old).padStart(10)} → +${x.delta.toPrecision(4)}`);
console.log('\n[未接线] 扰动后物理状态**完全不变**（需人工确认是否合理）：');
for (const x of dead) console.log(`  · ${x.path.padEnd(28)} ${String(x.old).padStart(10)}${x.err ? '  ' + x.err : ''}`);
if (verbose) {
  console.log('\n[全部明细]');
  for (const x of results) console.log(`  ${x.wired ? '✓' : '·'} ${x.path} = ${x.old} (+${x.delta.toPrecision(4)})`);
}
console.log('\n判读：未接线里若出现"用户会调、且应该影响操控"的量（如外倾/前束/侧倾中心），');
console.log('      就是 P35 那类静默失效；纯显示参数（颜色/标签/开关）未接线是正常的。');
process.exit(0);
