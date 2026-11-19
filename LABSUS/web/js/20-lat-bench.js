/* 20-lat-bench.js —— 侧倾 / 横向动力学台（线 A · A1，2026-11-19）
 *
 * 存在理由：本会话三次物理改动里，ARB 统一让**侧倾角变了 −33~41%**，24 项门禁零反应。
 * 垂向有 ride 台（绝对量锚），横向/姿态量什么都没有 ⇒ 改动不可审计。
 * 本台补这一块：稳态侧倾角/侧倾梯度/轮荷转移分布/yaw 增益，并给**解析锚**。
 *
 * 口径：准稳态定圆（定转角 + 每步把 u 拉回目标速度），与 trackLimit 同源；
 * 转向阶跃用于瞬态（yaw 上升时间/超调）。纯计算，不碰 DOM。
 */
'use strict';

const LAT_BENCH = (function () {
  const CTRL = (steer, thr) => ({ steer: steer, throttle: thr, brake: 0, drs: false });
  const ENV_FLAT = { grade: 0, bumpNoise: 0 };
  const WHEELS = ['FL', 'FR', 'RL', 'RR'];

  function V() {
    return (typeof VehicleDynamics15DOF !== 'undefined') ? VehicleDynamics15DOF
      : (typeof window !== 'undefined' ? window.VehicleDynamics15DOF : null);
  }

  function cloneS(over) {
    const c = Object.assign({}, S);
    c.front = Object.assign({}, S.front);
    c.rear = Object.assign({}, S.rear);
    if (over) {
      if (over.kS_scale) { c.front.kS *= over.kS_scale; c.rear.kS *= over.kS_scale; }
      if (over.arbF_scale && c.front.arb) c.front.arb = Object.assign({}, c.front.arb, { d: c.front.arb.d * Math.sqrt(over.arbF_scale) });
      if (over.arbR_scale && c.rear.arb) c.rear.arb = Object.assign({}, c.rear.arb, { d: c.rear.arb.d * Math.sqrt(over.arbR_scale) });
    }
    return c;
  }

  function makeCar(over) {
    const Ctor = V();
    if (!Ctor) throw new Error('LAT_BENCH: VehicleDynamics15DOF 未加载');
    return new Ctor(cloneS(over), (typeof SIM !== 'undefined' ? SIM : {}), 0);
  }

  function settle(car, secs, dt) {
    const n = Math.max(1, Math.round(secs / dt));
    for (let i = 0; i < n; i++) car.step(CTRL(0, 0), ENV_FLAT, dt);
  }

  /* ── ① 稳态定圆：侧倾角 / 轮荷转移 / yaw ─────────────────────── */
  function steadyCircle(opts) {
    const o = opts || {};
    const dt = o.dt || 0.002;
    const u0 = o.speed === undefined ? 14 : o.speed;
    const steer = o.steerDeg === undefined ? 5 : o.steerDeg;
    const dur = o.dur === undefined ? 6 : o.dur;
    const avg = o.avgSecs === undefined ? 2 : o.avgSecs;

    const car = makeCar(o.over);
    settle(car, 0.6, dt);
    const n = Math.round(dur / dt), nAvg = Math.round(avg / dt);
    let sp = 0, sa = 0, sr = 0, sfzF = 0, sfzR = 0, c = 0;
    for (let i = 0; i < n; i++) {
      car.step(CTRL(steer, 0.5), ENV_FLAT, dt);
      car.state.u = u0;                       // 速度保持（准稳态）
      if (i >= n - nAvg) {
        sp += car.state.phi; sa += Math.abs(car.state.u * car.state.r); sr += car.state.r;
        const Fz = car.telemetry.Fz;
        sfzF += (Fz.FL - Fz.FR);              // 前轴左右轮荷差（正 = 左转时外侧受压）
        sfzR += (Fz.RL - Fz.RR);
        c++;
      }
    }
    const phiRad = sp / c, ay = sa / c, r = sr / c;
    const dFzF = sfzF / c, dFzR = sfzR / c;
    const sum = Math.abs(dFzF) + Math.abs(dFzR);
    return {
      test: 'steadyCircle',
      spec: { speed: u0, steerDeg: steer, dt: dt, dur: dur, over: o.over || null },
      metrics: {
        phiDeg: phiRad * 180 / Math.PI,
        ayG: ay / 9.81,
        yawRate: r,
        radius: Math.abs(r) > 1e-6 ? u0 / Math.abs(r) : Infinity,
        dFzFront: dFzF,
        dFzRear: dFzR,
        tlltd: sum > 1e-9 ? Math.abs(dFzF) / sum : NaN,
        rollGradDegPerG: ay > 1e-6 ? (phiRad * 180 / Math.PI) / (ay / 9.81) : NaN
      }
    };
  }

  /* ── ② 侧倾梯度：多个 ay 点做线性回归（deg/g）─────────────────── */
  function rollGradient(opts) {
    const o = opts || {};
    const speeds = o.speeds || [8, 10, 12, 14, 16];
    const pts = [];
    for (const u of speeds) {
      const r = steadyCircle(Object.assign({}, o, { speed: u }));
      pts.push({ speed: u, ayG: r.metrics.ayG, phiDeg: r.metrics.phiDeg });
    }
    /* 最小二乘 φ = a + b·ay */
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { sx += p.ayG; sy += p.phiDeg; sxx += p.ayG * p.ayG; sxy += p.ayG * p.phiDeg; }
    const den = n * sxx - sx * sx;
    const slope = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : NaN;
    return { test: 'rollGradient', spec: { speeds: speeds, over: o.over || null },
             metrics: { gradDegPerG: slope, points: pts }, points: pts };
  }

  /* ── ③ 转向阶跃：yaw 上升时间 / 超调（瞬态）──────────────────── */
  function steerStep(opts) {
    const o = opts || {};
    const dt = o.dt || 0.002;
    const u0 = o.speed === undefined ? 14 : o.speed;
    const steer = o.steerDeg === undefined ? 4 : o.steerDeg;
    const dur = o.dur === undefined ? 3 : o.dur;

    const car = makeCar(o.over);
    settle(car, 0.6, dt);
    const n = Math.round(dur / dt);
    const rSeries = [], phiSeries = [];
    for (let i = 0; i < n; i++) {
      car.step(CTRL(steer, 0.5), ENV_FLAT, dt);
      car.state.u = u0;
      rSeries.push(car.state.r); phiSeries.push(car.state.phi);
    }
    const tail = Math.max(1, Math.round(n * 0.2));
    let ss = 0;
    for (let i = n - tail; i < n; i++) ss += rSeries[i];
    const rSS = ss / tail;
    let t10 = NaN, t90 = NaN, peak = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = rSeries[i];
      if (Number.isNaN(t10) && Math.abs(v) >= 0.1 * Math.abs(rSS)) t10 = i * dt;
      if (Number.isNaN(t90) && Math.abs(v) >= 0.9 * Math.abs(rSS)) t90 = i * dt;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    return {
      test: 'steerStep',
      spec: { speed: u0, steerDeg: steer, dt: dt, dur: dur, over: o.over || null },
      metrics: {
        yawRateSS: rSS,
        riseTimeMs: (t90 - t10) * 1000,
        overshootPct: rSS !== 0 ? (peak - Math.abs(rSS)) / Math.abs(rSS) * 100 : NaN,
        phiSSDeg: phiSeries[n - 1] * 180 / Math.PI
      },
      series: { t: rSeries.map((_, i) => i * dt), yawRate: rSeries, phi: phiSeries }
    };
  }

  /* ── ④ 解析锚：侧倾刚度与预测侧倾角 ───────────────────────────────
     ⚠ 关键细节（2026-11-19 实测校准）：防倾杆的行程 Δtr 会被**轮胎垂向柔度折减**——
     杆力抬高一侧轮荷 ⇒ 该侧轮胎被压得更扁 ⇒ 轮心相对车身少走一段。
     联立 F_arb = K_arb·Δtr、ΔFz = (Kw+2K_arb)·Δtr、Δtr = −φ·t − ΔFz/kT 得

        K_roll(每轴) = t²/2 · kT·(Kw + 2·K_arb) / (kT + Kw + 2·K_arb)

     无杆时退化为 t²/2·kT·Kw/(kT+Kw) = t²/2·ke（串联等效），与弹簧路径一致。
     首版漏了这一项，导致 gt3 预测 0.217° 而实测 0.378°（拆杆后 1.099° 与解析
     1.099° 完全吻合 ⇒ 弹簧路径没问题，只有杆路径需要串联折减）。 */
  function analytic(opts) {
    const o = opts || {};
    const car = makeCar(o.over);
    const tF = car.tF, tR = car.tR;
    const keF = (car.Kw_F * car.kT_f) / (car.Kw_F + car.kT_f);
    const keR = (car.Kw_R * car.kT_r) / (car.Kw_R + car.kT_r);
    const axleRoll = (Kw, Karb, kT, t) =>
      (t * t / 2) * (kT * (Kw + 2 * Karb)) / (kT + Kw + 2 * Karb);
    const KrollF = axleRoll(car.Kw_F, car.K_arb_F, car.kT_f, tF);
    const KrollR = axleRoll(car.Kw_R, car.K_arb_R, car.kT_r, tR);
    const Kroll = KrollF + KrollR;
    const KrollSpring = (keF * tF * tF) / 2 + (keR * tR * tR) / 2;
    const KrollArb = Kroll - KrollSpring;
    const mTotal = car.m, mS = car.mSprung, hArm = car.h_roll_arm;
    /* 簧下横向分量（P33 侧向）：簧下质心近似在轮轴高 ≈ 轮胎半径 */
    const _mU = 2 * ((car.mU_f || 0) + (car.mU_r || 0));
    const _rT = (car.rTireM !== undefined) ? car.rTireM : 0.26;
    const _hAxis = (car.h_roll_axis !== undefined) ? car.h_roll_axis : 0.043;
    const _hU = Math.max(0, _rT - _hAxis);
    const rollMom = (ay) => (car.rollInertiaOn === false)
      ? mTotal * ay * hArm
      : (mS * ay * hArm + _mU * ay * _hU);
    return {
      tF: tF, tR: tR, keF: keF, keR: keR,
      KrollSpring: KrollSpring, KrollArb: KrollArb, Kroll: Kroll,
      KrollF: KrollF, KrollR: KrollR,
      hRollArm: hArm, mTotal: mTotal, mSprung: mS,
      /* 2026-11-19（P33 侧向翻默认后）：侧倾力矩的**簧下横向分量**。
         旧式 `mTotal·ay·hArm` 把簧下质量也乘了簧载力臂，实测高估 4~10%。
         物理分解：M = mS·ay·hArm + mU·ay·(rTire − h_axis)。
         `car.rollInertiaOn === false`（显式回退）时保持旧式。 */
      phiPredTotalDeg: (ay) => (rollMom(ay) / Kroll) * 180 / Math.PI,
      phiPredSprungDeg: (ay) => (mS * ay * hArm / Kroll) * 180 / Math.PI
    };
  }

  return {
    steadyCircle: steadyCircle, rollGradient: rollGradient, steerStep: steerStep, analytic: analytic,
    last: null
  };
})();

if (typeof window !== 'undefined') window.LAT_BENCH = LAT_BENCH;
