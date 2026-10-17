/**
 * physics_audit.js —— 15-DOF 舞台内核的数值审计（P0 地基工具，2026-10-17）
 *
 * 存在理由（审计 R-1017 实测）：全仓**没有**能量守恒检查、**没有**步长收敛测试、
 * **没有** sim 性能埋点。这三件是 S13 真 15-DOF 与 S15 碰撞的前置——没有它们，
 * 改完无法判断"改对了"还是"改稳了（用人工阻尼压住了）"。
 *
 * 本文件是**诊断工具**（与 preset_balance_sweep / mpc_diag_g30 同类），默认不进
 * 回归清单；但它内部的 assert 项在改动前后都应成立，可按需并入 CI。
 *
 * 覆盖：
 *   A. 惯量读数与来源（服务 S1）—— 抓 `I_yaw = I_pitch + I_roll` 这类恒等式误用
 *   B. 能量审计 L1（硬锚）：平路直线滑行，机械能单调不增
 *   C. 能量审计 L2（软观察）：带转向工况的能量曲线，只打印
 *   D. 步长收敛：dt = 4/2/1/0.5 ms 的末态应收敛
 *   E. 性能埋点：ms/子步（定位"物理慢还是几何慢"）
 *
 * 用法：node web/test/physics_audit.js
 */
const { loadStage } = require('./_stage_harness.js');

const { ctx, run, G, mkCtrl, ENV_FLAT } = loadStage();
const S = ctx.S;
const SIM = ctx.SIM || {};

/* ── 结果收集（gate 在文件最末尾 —— M10 教训：结果块不得落在中段）──────────── */
let passed = 0, total = 0;
const failures = [];
function assert(cond, msg) {
  total++;
  if (cond) { console.log(`[PASS] ${msg}`); passed++; }
  else { console.log(`[FAIL] ${msg}`); failures.push(msg); }
}
/** 只打印、不进 gate 的观察项 */
function note(msg) { console.log(`   ··  ${msg}`); }
function section(t) { console.log(`\n=== ${t} ===`); }

/* 造车（与 test_15dof_steady 同口径：直接用 window.S 的当前预设） */
function mkCar(speed) {
  const V = ctx.VehicleDynamics15DOF;
  return new V(S, SIM, speed === undefined ? 0 : speed);
}
const sumFz = v => v.telemetry.Fz.FL + v.telemetry.Fz.FR + v.telemetry.Fz.RL + v.telemetry.Fz.RR;
/** 平动动能 + 转动动能 + 重力势能（悬挂势能因静载为常数项、Z=0 定义为配平位，单列观察） */
const mechEnergy = v => {
  const st = v.state;
  const lin = 0.5 * v.m * (st.u * st.u + st.v * st.v + st.w * st.w);
  const rot = 0.5 * (v.I_roll * st.p * st.p + v.I_pitch * st.q * st.q + v.I_yaw * st.r * st.r);
  return lin + rot + v.m * G * st.Z;
};

/* ═══════════════════════════════════════════════════════════════════════════
   A. 惯量读数与来源（S1 专项）
   ═══════════════════════════════════════════════════════════════════════════ */
section('A. 惯量读数与来源（S1 专项）');
{
  const v = mkCar(0);
  note(`整车质量 m = ${v.m.toFixed(1)} kg，轴距 wb = ${(v.wb * 1000).toFixed(0)} mm`);
  note(`I_pitch(Ixx) = ${v.I_pitch.toFixed(2)} kg·m²`);
  note(`I_roll (Iyy) = ${v.I_roll.toFixed(2)} kg·m²`);
  note(`I_yaw  (Izz) = ${v.I_yaw.toFixed(2)} kg·m²`);
  note(`惯量来源 inertiaSrc = ${String(v.inertiaSrc)}`);
  const sum = v.I_pitch + v.I_roll;
  note(`I_pitch + I_roll  = ${sum.toFixed(2)} kg·m²（垂直轴定理只对平面薄板成立）`);

  /* S1 的核心断言：横摆惯量不得由"俯仰+侧倾"恒等式导出。
     三维车体 Izz = Σm(x²+y²)，与 Ixx+Iyy = Σm[(y²+z²)+(x²+z²)] 差 2Σm·z² ——
     对 h_cg≈0.28 m 的车是显著量。 */
  assert(Math.abs(v.I_yaw - sum) > 1e-6,
    `I_yaw 不得等于 I_pitch + I_roll（实测差 ${(v.I_yaw - sum).toFixed(2)}）`);

  /* 惯量量级判据：横摆惯量半径 k_z/L 应落在行业带 0.30~0.36 */
  const kz = Math.sqrt(v.I_yaw / v.m);
  const ratio = kz / v.wb;
  note(`横摆惯量半径 k_z = ${(kz * 1000).toFixed(0)} mm，k_z/L = ${ratio.toFixed(3)}`);
  assert(ratio > 0.25 && ratio < 0.45,
    `k_z/L = ${ratio.toFixed(3)} 落在合理带（0.25~0.45，行业带 0.30~0.36）`);

  /* 三维车体的方向性恒等式：Izz = Σm(x²+y²)，Ixx+Iyy = Σm[(y²+z²)+(x²+z²)]，
     两者差 2Σm·z² > 0 ⇒ **I_yaw 必须严格小于 I_pitch + I_roll**。
     这条比"不等于"强得多：它能抓住任何把垂直轴定理搬到三维车体的写法。 */
  assert(v.I_yaw < sum - 1e-9,
    `I_yaw 必须严格小于 I_pitch + I_roll（差 ${(sum - v.I_yaw).toFixed(3)} = 2Σm·z² > 0）`);

  /* 来源必须可审计（不许默默使用经验式） */
  assert(typeof v.inertiaSrc === 'string' && v.inertiaSrc.length > 0,
    `惯量来源必须可审计（inertiaSrc = ${String(v.inertiaSrc)}）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   B. 能量审计 L1（硬锚）：平路直线滑行 ⇒ 机械能单调不增
   ═══════════════════════════════════════════════════════════════════════════ */
section('B. 能量审计 L1（硬锚）：平路直线滑行 5s，机械能单调不增');
{
  const v = mkCar(20);
  const dt = 0.001;
  const E0 = mechEnergy(v);
  let prev = E0, maxRise = 0, mono = true;
  const samples = [];
  for (let k = 0; k < 5000; k++) {
    v.step(mkCtrl(), ENV_FLAT, dt);
    if (k % 500 === 499) {
      const E = mechEnergy(v);
      const d = E - prev;
      if (d > 1e-6) { mono = false; maxRise = Math.max(maxRise, d); }
      samples.push(E);
      prev = E;
    }
  }
  const E1 = mechEnergy(v);
  note(`E0 = ${E0.toFixed(1)} J → E1 = ${E1.toFixed(1)} J（耗散 ${(100 * (1 - E1 / E0)).toFixed(1)}%）`);
  note(`采样：${samples.map(e => e.toFixed(0)).join(' → ')}`);
  assert(mono, `滑行全程机械能单调不增（最大回升 ${maxRise.toExponential(2)} J）`);
  assert(E1 < E0, `滑行末态机械能低于初态（阻力确实耗散，Δ = ${(E1 - E0).toFixed(1)} J）`);
  assert(Number.isFinite(E1), `滑行末态机械能有限（无 NaN/Inf）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   C. 能量审计 L2（软观察）：带转向 + 驱动
   ═══════════════════════════════════════════════════════════════════════════ */
section('C. 能量审计 L2（软观察）：定圆转向的能量与耗散');
{
  const v = mkCar(15);
  const dt = 0.001;
  const ctrl = mkCtrl({ steer: 3.0, throttle: 0.35 });
  const E0 = mechEnergy(v);
  for (let k = 0; k < 4000; k++) v.step(ctrl, ENV_FLAT, dt);
  const E1 = mechEnergy(v);
  note(`驱动+转向 4s：E0 = ${E0.toFixed(0)} J → E1 = ${E1.toFixed(0)} J`);
  note(`末态 u = ${v.state.u.toFixed(2)} m/s、r = ${v.state.r.toFixed(4)} rad/s、φ = ${(v.state.phi * 180 / Math.PI).toFixed(2)}°`);
  note(`末态 ΣFz = ${sumFz(v).toFixed(0)} N（m·g = ${(v.m * G).toFixed(0)} N）`);
  assert(Number.isFinite(E1), `带驱动转向工况能量有限（无 NaN/Inf）`);
  assert(Math.abs(v.state.r) > 1e-3, `定圆工况确实建立横摆（r = ${v.state.r.toFixed(4)}）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   D. 步长收敛：dt 4 / 2 / 1 / 0.5 ms 的瞬态末态应收敛
   ⚠ 工况必须是**瞬态窗口**：首版取 2.0 s，实测四档 dt 结果逐位相同（0.000%）——
     因为那时车已进入稳态，稳态解与积分步长无关，测不到积分器。
     现取 0.256 s（转向阶跃后尚未建立稳态），且 0.256/dt 对四档都是整数
     （64 / 128 / 256 / 512 步），消除 round 误差带来的假差异。
   ═══════════════════════════════════════════════════════════════════════════ */
section('D. 步长收敛（dt = 4 / 2 / 1 / 0.5 ms，瞬态窗口 0.256 s）');
{
  const dts = [0.004, 0.002, 0.001, 0.0005];
  const res = dts.map(dt => {
    const v = mkCar(15);
    const ctrl = mkCtrl({ steer: 3.0, throttle: 0.35 });
    run(v, ctrl, ENV_FLAT, 0.256, dt);
    return { dt, u: v.state.u, r: v.state.r, phi: v.state.phi, Z: v.state.Z };
  });
  res.forEach(x => note(`dt=${(x.dt * 1000).toFixed(1)}ms → u=${x.u.toFixed(4)}  r=${x.r.toFixed(5)}  φ=${(x.phi * 180 / Math.PI).toFixed(4)}°  Z=${x.Z.toFixed(5)}`));

  const allFinite = res.every(x => Number.isFinite(x.u) && Number.isFinite(x.r) && Number.isFinite(x.phi));
  assert(allFinite, `全部步长档末态有限（无 NaN/Inf）`);

  const relDiff = (a, b, key) => Math.abs(a[key] - b[key]) / Math.max(1e-9, Math.abs(b[key]));
  const finest = res[3], second = res[2];
  const dU = relDiff(finest, second, 'u');
  const dR = relDiff(finest, second, 'r');
  note(`最细两档相对差：u = ${(dU * 100).toFixed(3)}%，r = ${(dR * 100).toFixed(3)}%`);
  assert(dU < 0.10, `u 在最细两档收敛（${(dU * 100).toFixed(3)}% < 10%）`);
  assert(dR < 0.10, `r 在最细两档收敛（${(dR * 100).toFixed(3)}% < 10%）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   E. 性能埋点：ms/子步
   ═══════════════════════════════════════════════════════════════════════════ */
section('E. 性能埋点（ms/子步）');
{
  const v = mkCar(20);
  const ctrl = mkCtrl({ steer: 2.0, throttle: 0.4 });
  const N = 4000, dt = 0.001;
  const t0 = Date.now();
  for (let k = 0; k < N; k++) v.step(ctrl, ENV_FLAT, dt);
  const ms = Date.now() - t0;
  const perSub = ms / N;
  note(`${N} 子步耗时 ${ms} ms ⇒ ${perSub.toFixed(4)} ms/子步（${(1000 / perSub).toFixed(0)} 子步/s）`);
  note(`60fps 单帧 17 子步 ⇒ 物理约 ${(perSub * 17).toFixed(2)} ms/帧`);
  if (v._simStat) note(`内建计数：steps=${v._simStat.steps} subSteps=${v._simStat.subSteps} roadQueries=${v._simStat.roadQueries}`);
  assert(perSub < 2.0, `单子步耗时 ${perSub.toFixed(4)} ms < 2.0 ms（物理不是帧瓶颈）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   F. 开环阶跃转向响应（S1 / S2 的效果锚）
   ───────────────────────────────────────────────────────────────────────────
   为什么必须有这一项：实测发现 **闭环圈速对横摆惯量不敏感** —— S1 把 I_yaw 从
   162.94 降到 68.78（−58%）后，test_lap_15dof 的圈速/包络/峰值侧偏**逐位不变**
   （自动驾驶闭环会自适应车的响应）。也就是说，圈速回归**守不住**惯量正确性，
   必须有一个开环瞬态锚。
   本项测：阶跃转向后 r 达到 63.2% 稳态值的时间 T63（一阶系统时间常数）与超调。
   ⚠ 注意 C_yaw_damp = I_yaw·0.75 ⇒ 人工阻尼时间常数恒为 1/0.75 = 1.33 s，
     与 I_yaw 无关；I_yaw 变小只放大力矩增益 ⇒ 响应变快。
   ═══════════════════════════════════════════════════════════════════════════ */
section('F. 开环阶跃转向响应（S1/S2 效果锚）');
{
  const dt = 0.001, T = 4.0;
  const probe = (v) => {
    const ctrl = mkCtrl({ steer: 3.0 });
    const trace = [];
    const n = Math.round(T / dt);
    for (let k = 0; k < n; k++) { v.step(ctrl, ENV_FLAT, dt); trace.push(v.state.r); }
    const r_ss = trace[trace.length - 1];
    let t63 = NaN;
    for (let k = 0; k < trace.length; k++) {
      if (Math.abs(trace[k]) >= Math.abs(0.632 * r_ss)) { t63 = k * dt; break; }
    }
    let peak = 0;
    for (const r of trace) if (Math.abs(r) > Math.abs(peak)) peak = r;
    return {
      r_ss, t63, peak,
      over: Math.abs(r_ss) > 1e-9 ? (Math.abs(peak) / Math.abs(r_ss) - 1) * 100 : 0,
      tail: trace.filter((_, i) => i % 500 === 499).map(r => r.toFixed(3)).join(' → ')
    };
  };

  /* F-1：当前（S1 后，部件清单惯量） */
  const vNew = mkCar(15);
  const a = probe(vNew);
  note(`[S1 后] I_yaw=${vNew.I_yaw.toFixed(2)} ⇒ r_ss=${a.r_ss.toFixed(4)}、T63=${(a.t63 * 1000).toFixed(0)} ms、超调 ${a.over.toFixed(1)}%`);
  note(`[S1 后] 每 0.5s 采样：${a.tail}`);

  /* F-2：对照 —— 强制回退到旧经验式惯量（I_yaw = I_pitch + I_roll），
     证明 F-1 的差异确实由 S1 造成，而不是工况噪声。 */
  const vOld = mkCar(15);
  vOld.I_pitch = vOld.m * (vOld.wb * 0.42) ** 2;
  vOld.I_roll = vOld.m * ((vOld.tF + vOld.tR) * 0.22) ** 2;
  vOld.I_yaw = vOld.I_pitch + vOld.I_roll;
  const b = probe(vOld);
  note(`[S1 前] I_yaw=${vOld.I_yaw.toFixed(2)} ⇒ r_ss=${b.r_ss.toFixed(4)}、T63=${(b.t63 * 1000).toFixed(0)} ms、超调 ${b.over.toFixed(1)}%`);
  note(`[S1 前] 每 0.5s 采样：${b.tail}`);
  note(`对照：T63 ${(b.t63 * 1000).toFixed(0)} ms → ${(a.t63 * 1000).toFixed(0)} ms；` +
       `稳态 |r| ${Math.abs(b.r_ss).toFixed(4)} → ${Math.abs(a.r_ss).toFixed(4)}`);

  assert(Number.isFinite(a.t63) && a.t63 > 0, `阶跃转向能测到 T63（${(a.t63 * 1000).toFixed(0)} ms）`);
  assert(a.over < 40, `阶跃超调 ${a.over.toFixed(1)}% < 40%（无病态振荡）`);
  /* 稳态 r 应**基本不变**（定圆稳态 r = u·tanδ/L 是几何量）。
     ⚠ 但不会严格为 0：S1 同时把 I_roll 从 63.35 降到 16.79（**−73%**，比 I_yaw 的
        −58% 还大）⇒ 侧倾响应快 ⇒ 载荷转移建立更快 ⇒ 经载荷敏感性影响稳态侧偏力。
        首版断言取 2% 实测为 2.34% 而 FAIL —— 是我把"自行车模型"的几何结论套到了
        带侧倾/载荷转移的实车上。5% 是"没有量级错误"的判据。 */
  const dRss = Math.abs(a.r_ss - b.r_ss) / Math.max(1e-9, Math.abs(b.r_ss));
  note(`稳态相对差 = ${(dRss * 100).toFixed(2)}%（自行车模型下应≈0；含侧倾/载荷转移故不严格为 0）`);
  assert(dRss < 0.05, `S1 未改变量级（稳态相对差 ${(dRss * 100).toFixed(2)}% < 5%）`);

  /* ⚠ T63 的绝对量级当前**不合格**：实测 30 ms，真实车 150~350 ms。
     根因是**没有轮胎松弛长度**（α 瞬时 ⇒ 打方向瞬间侧偏力就满值，
     r 立刻跳到峰值再缓慢衰减），不是惯量问题。
     登记为 S2 的验收目标：S2 落地后 T63 应升入 150~350 ms 带。
     当前只守"不病态"（>0 且有限），不掩盖。 */
  note(`⚠ T63 = ${(a.t63 * 1000).toFixed(0)} ms 显著快于真实车（150~350 ms）——登记为 S2 验收目标`);
  assert(a.t63 > 0.005, `T63 = ${(a.t63 * 1000).toFixed(0)} ms 非病态瞬时（> 5 ms）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   G. 阿克曼几何（S4 专项）
   ───────────────────────────────────────────────────────────────────────────
   阿克曼的精确判据（可直接手算，不依赖任何阈值标定）：
     cot(δ_out) − cot(δ_in) = t / L        （t = 轮距，L = 轴距）
   推导：cot δ_in = (R − hf)/L、cot δ_out = (R + hf)/L ⇒ 差 = 2hf/L = t/L。
   ═══════════════════════════════════════════════════════════════════════════ */
section('G. 阿克曼几何（S4 专项）');
{
  const v = mkCar(0);
  const D2R = Math.PI / 180;
  const rhs = v.tF / v.wb;
  note(`轮距/轴距 t/L = ${rhs.toFixed(4)}（判据目标值）`);
  for (const deg of [2, 10, 20]) {
    const a = v.ackermann(deg * D2R);          // δ>0 = 右转 ⇒ right 为内轮
    const cotIn = 1 / Math.tan(a.right), cotOut = 1 / Math.tan(a.left);
    const lhs = cotOut - cotIn;
    note(`δ=${deg}° → 内(右)=${(a.right / D2R).toFixed(3)}°、外(左)=${(a.left / D2R).toFixed(3)}°` +
         `；cot外−cot内=${lhs.toFixed(4)}`);
    assert(Math.abs(lhs - rhs) < 0.02,
      `δ=${deg}° 满足阿克曼判据 cotδ_out − cotδ_in = t/L（${lhs.toFixed(4)} vs ${rhs.toFixed(4)}）`);
  }
  /* 内外轮必须真的不同（否则等于没接） */
  const a20 = v.ackermann(20 * D2R);
  assert(Math.abs(a20.left - a20.right) > 1e-3,
    `δ=20° 内外轮转角确实不同（差 ${((a20.left - a20.right) / D2R).toFixed(2)}°）`);
  /* 左右转镜像对称 */
  const p = v.ackermann(10 * D2R), n = v.ackermann(-10 * D2R);
  assert(Math.abs(p.left + n.right) < 1e-12 && Math.abs(p.right + n.left) < 1e-12,
    `左右转镜像对称（δ→−δ 时内外互换且反号）`);
  /* 小转角应退化：Δδ 是二阶量 */
  const s = v.ackermann(0.5 * D2R);
  note(`δ=0.5° → 内外差 ${((s.left - s.right) / D2R).toFixed(5)}°（小转角下为高阶小量）`);
  assert(Math.abs(s.left - s.right) < 0.01 * Math.abs(0.5 * D2R) + 1e-9,
    `小转角退化：内外差远小于 δ 本身（高阶修正，高速工况不受影响）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   H. ISO 8608 随机路面（S3 专项）
   ───────────────────────────────────────────────────────────────────────────
   验收三件事：① 能级单调（A < C < E）② 后轴 = 前轴 wb 之前的同一条路
   ③ 开启后的性能开销（本审计 R-1017 曾担心 160 谐波 × 4 轮太贵，须实测）
   ═══════════════════════════════════════════════════════════════════════════ */
section('H. ISO 8608 随机路面（S3 专项）');
{
  const probeIso = (cls, T, speed) => {
    const v = mkCar(speed === undefined ? 20 : speed);
    const env = { grade: 0, bumpNoise: 0, roadIso: cls };
    const dt = 0.001, n = Math.round(T / dt);
    let sum2 = 0, cnt = 0;
    const t0 = Date.now();
    for (let k = 0; k < n; k++) {
      v.step(mkCtrl(), env, dt);
      sum2 += v.state.w * v.state.w; cnt++;
    }
    return {
      rmsW: Math.sqrt(sum2 / cnt), ms: Date.now() - t0, n,
      finite: Number.isFinite(v.state.Z) && Number.isFinite(v.state.w),
      roadS: v._roadS
    };
  };

  const off = probeIso(null, 2.0);
  const A = probeIso('A', 2.0), C = probeIso('C', 2.0), E = probeIso('E', 2.0);
  note(`关闭路面：垂向速度 RMS = ${off.rmsW.toExponential(2)} m/s（平路应≈0）`);
  note(`A 级：RMS = ${A.rmsW.toFixed(5)} m/s（解析谱 RMS 3.81 mm）`);
  note(`C 级：RMS = ${C.rmsW.toFixed(5)} m/s`);
  note(`E 级：RMS = ${E.rmsW.toFixed(5)} m/s`);
  note(`性能：关闭 ${(off.ms / off.n).toFixed(4)} ms/子步 → 开启 ${(A.ms / A.n).toFixed(4)} ms/子步`);

  assert(off.finite && A.finite && C.finite && E.finite, `四级路面工况全部有限（无 NaN/Inf）`);
  /* ⚠ 别用响应 RMS 判"关闭"：平路滑行时车在减速 ⇒ 俯仰平衡变化 ⇒ 车身仍有
     3.2e-3 m/s 的垂向本底，与"路面是否为 0"无关（首版用 RMS 比值判据，卡在
     4.9× vs 阈值 5× 上 —— 是本底噪声，不是缺陷）。
     真正的逐位兼容判据是**路面高程恒为 0**： */
  {
    const vOff = mkCar(20);
    let maxZroad = 0;
    for (let k = 0; k < 1000; k++) {
      vOff.step(mkCtrl(), { grade: 0, bumpNoise: 0 }, 0.001);
      for (const id of ['FL', 'FR', 'RL', 'RR']) {
        maxZroad = Math.max(maxZroad, Math.abs(vOff.telemetry.z_road[id]));
      }
    }
    assert(maxZroad === 0,
      `不传 roadIso 时 z_road 恒为 0（max = ${maxZroad}，逐位兼容）`);
  }
  note(`平路本底垂向速度 RMS = ${off.rmsW.toExponential(2)} m/s（滑行减速引起，非路面）`);
  assert(A.rmsW > 1e-6, `A 级路面确实产生了垂向激励（RMS = ${A.rmsW.toFixed(5)}）`);
  /* 能级单调：每升一档，谱密度 ×4 ⇒ 幅值 ×2 ⇒ 响应 RMS 应严格递增 */
  assert(A.rmsW < C.rmsW && C.rmsW < E.rmsW,
    `路面等级响应严格递增（A ${A.rmsW.toFixed(5)} < C ${C.rmsW.toFixed(5)} < E ${E.rmsW.toFixed(5)}）`);
  const perOpen = A.ms / A.n, perOff = off.ms / off.n;
  assert(perOpen < 1.0,
    `开启 ISO 后单子步 ${perOpen.toFixed(4)} ms < 1.0 ms（开销 ${(perOpen / Math.max(perOff, 1e-9)).toFixed(1)}×，仍在预算内）`);

  /* 后轴 = 前轴 wb 之前的同一条路（空间域，比时间延迟 L/v 更严格） */
  const vv = mkCar(20);
  const envC = { grade: 0, bumpNoise: 0, roadIso: 'C' };
  for (let k = 0; k < 2000; k++) vv.step(mkCtrl(), envC, 0.001);
  const isoAt = ctx.isoProfileAtMm;
  const zF_exp = isoAt(vv._roadS, 'C') / 1000;
  const zR_exp = isoAt(vv._roadS - vv.wb, 'C') / 1000;
  const zF = vv.telemetry.z_road.FL, zR = vv.telemetry.z_road.RL;
  note(`s=${vv._roadS.toFixed(2)} m：前轴 z=${zF.toFixed(6)}（解析 ${zF_exp.toFixed(6)}）、` +
       `后轴 z=${zR.toFixed(6)}（解析 ${zR_exp.toFixed(6)}，偏移 ${vv.wb.toFixed(3)} m）`);
  assert(Math.abs(zF - zF_exp) < 1e-9, `前轴路面高程 == isoProfileAtMm(s)`);
  assert(Math.abs(zR - zR_exp) < 1e-9, `后轴路面高程 == isoProfileAtMm(s − wb)（空间域延迟）`);
  assert(Math.abs(zF - zR) > 1e-9, `前后轴路面**不同**（否则等于四轮同步抖动）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   I. 人工横摆阻尼扫描（S2(c) 的选档依据）
   ───────────────────────────────────────────────────────────────────────────
   `C_yaw_damp = I_yaw · yawDampK` 是**补偿器不是物理**：它存在的唯一理由是
   "无轮胎松弛 + 无回正力矩"时横摆没有天然阻尼。S2(a)(b) 落地后应由物理阻尼接管。
   本段扫描各档，给出"最低可退到哪一档仍稳定"的依据。
   判据：① 阶跃后 r 单调收敛不振荡 ② 自由衰减（松输入）不发散 ③ 稳态值不变
   ═══════════════════════════════════════════════════════════════════════════ */
section('I. 人工横摆阻尼扫描（S2(c) 选档依据）');
{
  const dt = 0.001;
  const stepProbe = (k) => {
    const v = mkCar(15);
    v.yawDampK = k;
    const ctrl = mkCtrl({ steer: 3.0 });
    const tr = [];
    for (let i = 0; i < 4000; i++) { v.step(ctrl, ENV_FLAT, dt); tr.push(v.state.r); }
    const ss = tr[tr.length - 1];
    let t63 = NaN;
    for (let i = 0; i < tr.length; i++) if (Math.abs(tr[i]) >= Math.abs(0.632 * ss)) { t63 = i * dt; break; }
    let peak = 0;
    for (const r of tr) if (Math.abs(r) > Math.abs(peak)) peak = r;
    /* 振荡判据：后 2 s 内 r 的符号翻转次数（稳态后不应来回摆） */
    let flips = 0;
    for (let i = 2001; i < tr.length; i++) if (Math.sign(tr[i]) !== Math.sign(tr[i - 1])) flips++;
    const over = Math.abs(ss) > 1e-9 ? (Math.abs(peak) / Math.abs(ss) - 1) * 100 : 0;
    return { k, ss, t63, over, flips, finite: Number.isFinite(ss) };
  };
  /* 自由衰减：给初速横摆后松手，看是否收敛到 0 */
  const decayProbe = (k) => {
    const v = mkCar(15);
    v.yawDampK = k;
    v.state.r = 0.5;
    for (let i = 0; i < 3000; i++) v.step(mkCtrl(), ENV_FLAT, dt);
    return { rEnd: v.state.r, finite: Number.isFinite(v.state.r) };
  };

  const rows = [0.75, 0.45, 0.25, 0.15, 0.05, 0.0].map(k => {
    const a = stepProbe(k), d = decayProbe(k);
    note(`yawDampK=${k.toFixed(2)} ⇒ r_ss=${a.ss.toFixed(4)}、T63=${(a.t63 * 1000).toFixed(0)} ms、` +
         `超调 ${a.over.toFixed(1)}%、稳态翻转 ${a.flips}；自由衰减 r_end=${d.rEnd.toExponential(2)}`);
    return { ...a, d };
  });

  assert(rows.every(r => r.finite && r.d.finite), `全部阻尼档末态有限（无 NaN/Inf）`);
  assert(rows.every(r => r.d.rEnd < 0.05),
    `全部阻尼档自由衰减都收敛（r_end 最大 ${Math.max(...rows.map(r => r.d.rEnd)).toExponential(2)} < 0.05）`);
  assert(rows.every(r => r.flips === 0),
    `全部阻尼档稳态无符号翻转（无持续振荡；最大 ${Math.max(...rows.map(r => r.flips))}）`);
  /* 稳态值不应随阻尼系数变（阻尼只影响瞬态）——这是"退阻尼不改变稳态"的判据 */
  const ssSpread = Math.max(...rows.map(r => Math.abs(r.ss))) - Math.min(...rows.map(r => Math.abs(r.ss)));
  note(`稳态 |r| 跨阻尼档极差 = ${ssSpread.toFixed(5)}（阻尼只应影响瞬态）`);
  assert(ssSpread / Math.abs(rows[0].ss) < 0.06,
    `稳态不随人工阻尼变化（相对极差 ${(100 * ssSpread / Math.abs(rows[0].ss)).toFixed(2)}% < 6%）`);

  const best = rows.filter(r => r.flips === 0 && Math.abs(r.d.rEnd) < 0.05).sort((a, b) => a.k - b.k)[0];
  note(`⇒ 可退到的最低档：yawDampK = ${best.k}（更低会失去稳定性余量）`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   J. 转向系统延迟扫描（S6 / P27 的选档依据）
   ───────────────────────────────────────────────────────────────────────────
   P27：S1（惯量）+ S2（松弛+回正）都做完后，开环阶跃 T63 仍只有 **41 ms**，
   而真实车是 150~350 ms。已排除惯量与轮胎松弛，剩余嫌疑：
     ① 转向系统动力学（方向柱→齿条→车轮，实车 50~100 ms）← 本段验证
     ② 悬架柔度 compliance steer 未进时序
     ③ 侧倾建立偏快（人工 C_roll_damp）
   本段扫描转向一阶滞后时间常数 τ，看 T63 能否进入真实带，且稳态不被破坏。
   ═══════════════════════════════════════════════════════════════════════════ */
section('J. 转向系统延迟扫描（S6 / P27）');
{
  const dt = 0.001;
  const probe = (tau) => {
    const v = mkCar(15);
    v.steerTau = tau;
    const ctrl = mkCtrl({ steer: 3.0 });
    const tr = [];
    for (let i = 0; i < 4000; i++) { v.step(ctrl, ENV_FLAT, dt); tr.push(v.state.r); }
    const ss = tr[tr.length - 1];
    let t63 = NaN;
    for (let i = 0; i < tr.length; i++) if (Math.abs(tr[i]) >= Math.abs(0.632 * ss)) { t63 = i * dt; break; }
    let peak = 0;
    for (const r of tr) if (Math.abs(r) > Math.abs(peak)) peak = r;
    let flips = 0;
    for (let i = 2001; i < tr.length; i++) if (Math.sign(tr[i]) !== Math.sign(tr[i - 1])) flips++;
    const over = Math.abs(ss) > 1e-9 ? (Math.abs(peak) / Math.abs(ss) - 1) * 100 : 0;
    /* 转向滞后量：阶跃后 100 ms 时实际齿条位置相对指令的百分比 */
    const v2 = mkCar(15); v2.steerTau = tau;
    for (let i = 0; i < 100; i++) v2.step(mkCtrl({ steer: 3.0 }), ENV_FLAT, dt);
    return { tau, ss, t63, over, flips, lag100: v2.steerActual / 3.0,
             finite: Number.isFinite(ss) && Number.isFinite(t63) };
  };

  const rows = [0.0, 0.02, 0.05, 0.08, 0.12, 0.20].map(probe);
  rows.forEach(r => note(
    `τ=${r.tau.toFixed(2)}s ⇒ T63=${(r.t63 * 1000).toFixed(0)} ms、超调 ${r.over.toFixed(1)}%、` +
    `稳态 |r|=${Math.abs(r.ss).toFixed(4)}、翻转 ${r.flips}；阶跃 100 ms 时齿条到位 ${(r.lag100 * 100).toFixed(0)}%`));

  assert(rows.every(r => r.finite), `全部 τ 档末态有限（无 NaN/Inf）`);
  assert(rows.every(r => r.flips === 0), `全部 τ 档稳态无振荡（最大翻转 ${Math.max(...rows.map(r => r.flips))}）`);
  /* 稳态必须与 τ 无关（延迟只影响瞬态）——这是"加延迟不改操稳平衡"的判据 */
  const ssMax = Math.max(...rows.map(r => Math.abs(r.ss))), ssMin = Math.min(...rows.map(r => Math.abs(r.ss)));
  note(`稳态 |r| 跨 τ 极差 = ${(ssMax - ssMin).toFixed(5)}（延迟只应影响瞬态）`);
  assert((ssMax - ssMin) / ssMin < 0.06,
    `稳态不随转向延迟变化（相对极差 ${(100 * (ssMax - ssMin) / ssMin).toFixed(2)}% < 6%）`);
  /* 延迟确实生效：τ 越大，100 ms 时齿条到位越少，且 T63 单调不减 */
  assert(rows[5].lag100 < rows[0].lag100 - 0.3,
    `转向延迟确实生效（τ=0.20 时 100 ms 到位 ${(rows[5].lag100 * 100).toFixed(0)}% < τ=0 的 ${(rows[0].lag100 * 100).toFixed(0)}%）`);
  let mono = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].t63 < rows[i - 1].t63 - 1e-9) mono = false;
  assert(mono, `T63 随 τ 单调不减（延迟确实转化为响应变慢）`);

  const inBand = rows.filter(r => r.t63 >= 0.15 && r.t63 <= 0.35);
  note(inBand.length
    ? `⇒ 落入真实带(150~350 ms)的档位：${inBand.map(r => `τ=${r.tau}s(T63=${(r.t63 * 1000).toFixed(0)}ms)`).join('、')}`
    : `⇒ 无档位落入真实带；实测范围 ${(rows[0].t63 * 1000).toFixed(0)}~${(rows[rows.length - 1].t63 * 1000).toFixed(0)} ms`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   K. 俯仰/侧倾人工阻尼扫描（P28 的选档依据）
   ───────────────────────────────────────────────────────────────────────────
   `C_pitch_damp`/`C_roll_damp` 与已移除的 `C_yaw_damp` 是**同一类**经验阻尼
   （`k·√(K·I)`）。减振器力 `calcDamper(dtr)` 本来就在 `Fz` 里提供了真实的
   俯仰/侧倾阻尼 ⇒ 这两条大概率也是重复计入。照 I 段的方法扫描。
   ⚠ 旧式的额外缺陷：参考临界阻尼**只用前轴刚度 Kw_F** 算，忽略后轴 ⇒ 实际阻尼比
     低于名义的 0.225。
   判据：阶跃转向后 phi/theta 的**残余振荡峰峰值**（后 1 s），以及路面激励下的稳定性。
   ═══════════════════════════════════════════════════════════════════════════ */
section('K. 俯仰/侧倾人工阻尼扫描（P28）');
{
  const dt = 0.001;
  const probe = (k) => {
    const v = mkCar(15);
    v.pitchDampK = k; v.rollDampK = k;
    const ctrl = mkCtrl({ steer: 3.0 });
    const phiT = [], thT = [];
    for (let i = 0; i < 4000; i++) { v.step(ctrl, ENV_FLAT, dt); phiT.push(v.state.phi); thT.push(v.state.theta); }
    const pp = a => { const s = a.slice(3000); return Math.max(...s) - Math.min(...s); };
    /* 路面激励工况：ISO C 级 + 20 m/s，看车身是否被激出持续振荡 */
    const v2 = mkCar(20);
    v2.pitchDampK = k; v2.rollDampK = k;
    const envC = { grade: 0, bumpNoise: 0, roadIso: 'C' };
    const p2 = [];
    for (let i = 0; i < 3000; i++) { v2.step(mkCtrl(), envC, dt); p2.push(v2.state.phi); }
    const s2 = p2.slice(2000);
    return { k, ppPhi: pp(phiT), ppTheta: pp(thT), roadPP: Math.max(...s2) - Math.min(...s2),
             finite: Number.isFinite(v.state.phi) && Number.isFinite(v2.state.phi) };
  };
  const rows = [0.45, 0.25, 0.10, 0.0].map(probe);
  rows.forEach(r => note(
    `k=${r.k.toFixed(2)} ⇒ 阶跃后残余振荡：φ ${(r.ppPhi * 180 / Math.PI).toFixed(4)}°、` +
    `θ ${(r.ppTheta * 180 / Math.PI).toFixed(4)}°；ISO C 路面 φ 峰峰 ${(r.roadPP * 180 / Math.PI).toFixed(3)}°`));

  assert(rows.every(r => r.finite), `全部阻尼档末态有限（无 NaN/Inf）`);
  /* 主判据：路面激励下不得发散。ISO C 级是"一般"路面，车身侧倾角峰峰值应远小于 10° */
  assert(rows.every(r => r.roadPP * 180 / Math.PI < 10),
    `ISO C 路面下侧倾不发散（最大峰峰 ${Math.max(...rows.map(r => r.roadPP * 180 / Math.PI)).toFixed(3)}° < 10°）`);
  /* 阶跃后残余振荡：应收敛（峰峰值很小），不能持续摆动 */
  assert(rows.every(r => r.ppPhi * 180 / Math.PI < 0.5),
    `阶跃后侧倾残余振荡收敛（最大峰峰 ${Math.max(...rows.map(r => r.ppPhi * 180 / Math.PI)).toFixed(4)}° < 0.5°）`);
  const best = rows.filter(r => r.roadPP * 180 / Math.PI < 10 && r.ppPhi * 180 / Math.PI < 0.5)
    .sort((a, b) => a.k - b.k)[0];
  note(`⇒ 可退到的最低档：k = ${best.k}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   L. 真 15-DOF（簧下质量 + 轮胎垂向 DOF，S13）
   ───────────────────────────────────────────────────────────────────────────
   验收三件事：
     ① **逐位兼容**：wheelDof=false 时与旧行为完全一致（这是可回退的保证）
     ② **静载守恒**：开启后四轮接触力之和仍 = m·g
     ③ **轮跳模态确实出现**：给簧下一个位移扰动，测自由振荡频率
        理论 f_wheel = √(kT/mU)/(2π)，f_body = √(4·Kw/m)/(2π)
   ═══════════════════════════════════════════════════════════════════════════ */
section('L. 真 15-DOF（S13）');
{
  const dt = 0.001;
  const settle = (v, n) => { for (let i = 0; i < n; i++) v.step(mkCtrl(), ENV_FLAT, dt); };

  /* ① 逐位兼容：开关关闭时，与强制关闭的对照必须逐步一致 */
  {
    const a = mkCar(15); settle(a, 600);
    const b = mkCar(15); b.wheelDof = false; settle(b, 600);
    const d = Math.abs(a.state.Z - b.state.Z) + Math.abs(a.state.u - b.state.u)
            + Math.abs(a.state.phi - b.state.phi);
    note(`关闭 wheelDof：与对照末态差 = ${d.toExponential(2)}（应严格 0）`);
    assert(d === 0, `wheelDof 默认关闭时逐位兼容（差 ${d.toExponential(2)}）`);
  }

  /* ② 静载守恒 + ③ 轮跳模态 */
  {
    const v = mkCar(0);
    v.wheelDof = true;
    settle(v, 1500);
    const sumC = ['FL', 'FR', 'RL', 'RR'].reduce((s, id) => s + v.telemetry.Fz[id], 0);
    note(`开启 wheelDof：ΣFz = ${sumC.toFixed(1)} N（m·g = ${(v.m * G).toFixed(1)} N）`);
    assert(Math.abs(sumC - v.m * G) / (v.m * G) < 0.02,
      `真 15-DOF 下静载守恒（ΣFz ${sumC.toFixed(1)} vs m·g ${(v.m * G).toFixed(1)}，误差 ${(100 * Math.abs(sumC - v.m * G) / (v.m * G)).toFixed(2)}%）`);

    /* 轮跳模态：扰动 FL 轮的簧下位置，数 zw 的零交叉估周期 */
    const base = v.zw.FL;
    v.zw.FL = base + 0.004;
    const tr = [];
    for (let i = 0; i < 1500; i++) { v.step(mkCtrl(), ENV_FLAT, dt); tr.push(v.zw.FL - base); }
    let cross = 0;
    for (let i = 1; i < tr.length; i++) if (Math.sign(tr[i]) !== Math.sign(tr[i - 1]) && tr[i] !== 0) cross++;
    const freq = cross > 1 ? (cross / 2) / (tr.length * dt) : 0;
    const fTheory = Math.sqrt(v.kT_f / v.mU_f) / (2 * Math.PI);
    note(`簧下扰动后 1.5 s 内零交叉 ${cross} 次 ⇒ 实测轮跳频率 ≈ ${freq.toFixed(1)} Hz`);
    note(`理论 f = √(kT/mU)/2π = ${fTheory.toFixed(1)} Hz（kT=${(v.kT_f / 1000).toFixed(0)} N/mm、mU=${v.mU_f.toFixed(1)} kg）`);
    note(`⚠ 真实车轮跳模态 10~16 Hz；当前偏高说明 kT/mU 组合偏硬（**标定问题不是模型问题**）`);
    assert(Number.isFinite(freq) && freq > 5 && freq < 60,
      `轮跳模态确实出现（实测 ≈ ${freq.toFixed(1)} Hz，落在可研带 5~60 Hz）`);
    /* 衰减：扰动必须被阻尼掉，不能等幅振荡（否则接触/阻尼没接对） */
    const ampEarly = Math.max(...tr.slice(0, 300).map(Math.abs));
    const ampLate = Math.max(...tr.slice(1200).map(Math.abs));
    note(`振幅衰减：前 0.3 s ${(ampEarly * 1000).toFixed(3)} mm → 末 0.3 s ${(ampLate * 1000).toFixed(3)} mm`);
    assert(ampLate < ampEarly, `簧下扰动确实衰减（无等幅振荡）`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   M. 车-墙碰撞动力学（S15）
   ───────────────────────────────────────────────────────────────────────────
   旧实现没有碰撞动力学（出界只罚时 + μ 降级，车径直穿过缓冲区继续跑）。
   `applyWallCollision` 是**纯函数**，可直接单测——这是本项能被验证的前提。
   最硬的验收锚：**恢复系数 e < 1 ⇒ 碰撞必须耗能**（动能不增）。
   ═══════════════════════════════════════════════════════════════════════════ */
section('M. 车-墙碰撞动力学（S15）');
{
  const awc = ctx.applyWallCollision;
  assert(typeof awc === 'function', `applyWallCollision 已导出（可单测）`);
  const EDGE = 7.2;
  const KE = s => 0.5 * (s.u * s.u + s.v * s.v);

  /* ① 未超界 ⇒ 完全不动作 */
  {
    const s = { u: 20, v: 0.5, r: 0 };
    const hit = awc(s, 3.0, EDGE, null);
    assert(hit === false && s.v === 0.5 && s.u === 20, `未超界时不动作（逐位兼容的前提）`);
  }
  /* ② 超界且继续外冲 ⇒ 法向速度反向、动能下降 */
  {
    const s = { u: 25, v: 3.0, r: 0 };        // ey>0（右侧外）+ v>0（继续外冲）
    const k0 = KE(s);
    const hit = awc(s, 9.0, EDGE, null);
    const k1 = KE(s);
    note(`撞击前 KE=${k0.toFixed(1)}、v=${3.0}；撞击后 KE=${k1.toFixed(1)}、v=${s.v.toFixed(3)}、u=${s.u.toFixed(2)}`);
    assert(hit === true, `超界且外冲时判定为碰撞`);
    assert(s.v < 0, `法向速度反向（v ${3.0} → ${s.v.toFixed(3)}，车被弹回赛道内侧）`);
    assert(k1 < k0, `**碰撞耗能**（KE ${k0.toFixed(1)} → ${k1.toFixed(1)}，恢复系数 e=0.2 < 1）`);
    assert(Math.abs(s.u) < 25, `切向摩擦使纵向减速（u 25 → ${s.u.toFixed(2)}）`);
    assert(Number.isFinite(s.r), `擦墙横摆扰动有限（r=${s.r.toFixed(4)}）`);
  }
  /* ③ 多次碰撞能量单调不增（不得出现"越撞越快"） */
  {
    const s = { u: 25, v: 4.0, r: 0 };
    let prev = KE(s), mono = true;
    for (let i = 0; i < 12; i++) {
      awc(s, 9.0, EDGE, null);
      const k = KE(s);
      if (k > prev + 1e-9) mono = false;
      prev = k;
    }
    note(`连续 12 次碰撞后 KE=${prev.toFixed(2)}、v=${s.v.toFixed(3)}`);
    assert(mono, `连续碰撞能量单调不增（无"越撞越快"）`);
    assert(Number.isFinite(prev), `连续碰撞后能量有限（无 NaN）`);
  }
  /* ④ 已往回走但仍嵌在墙里 ⇒ 被推回（防卡死） */
  {
    const s = { u: 10, v: -0.5, r: 0 };       // ey>0，v<0 已在往回
    awc(s, 9.0, EDGE, null);
    note(`回撤工况：v −0.5 → ${s.v.toFixed(3)}（应被推回内侧，即更负）`);
    assert(s.v < -0.5, `已往回走时被推回（防卡在墙里）`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   结果块 —— 必须留在文件最末尾（M10 教训）
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.error(`physics_audit FAILED：${failures.length}/${total}`);
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`physics_audit PASS：${passed}/${total}`);
/* ⚠ 必须显式退出：vm 沙箱内加载的舞台模块会留下非 daemon 的引用，
   事件循环不会自然排空（实测：断言全部跑完、耗时 1.4 s，进程却挂住不退出）。
   本文件是诊断工具，跑完即退是正确语义。 */
process.exit(0);
