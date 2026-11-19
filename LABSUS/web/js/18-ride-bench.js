/* 18-ride-bench.js —— 垂向 ride 测试台（Phase C，2026-11-19）
 *
 * 存在理由：K1 的动力学此前**没有任何绝对量灵敏度锚**——S13 转正（簧下质量 + 胎垂向柔度）
 * 这种物理换代，赛道/试验场/起伏路三套件全部原样通过（自动驾驶逐圈学习把差异吃掉）。
 * 本测试台测的是**绝对量**：阶跃的 T63/超调、扫频的共振频率/阻尼比、脉冲的对数衰减率、
 * 随机路面的 RMS。这些量自动驾驶消化不掉。
 *
 * 驱动的是**真 15-DOF 内核**（不是 04-dynamics 的单角台架）：台架没有簧下质量，
 * 测不到刚打开的 10~16 Hz 轮跳模态。四路路面通过 `env.rig[id]` 逐轮给（真 4-Post）。
 *
 * 四个标准测试 + 统一结果 schema + CSV 导出。纯计算，不碰 DOM。
 */
'use strict';

const RIDE_BENCH = (function () {
  const WHEELS = ['FL', 'FR', 'RL', 'RR'];
  const CTRL0 = { steer: 0, throttle: 0, brake: 0, drs: false };

  /* ── 基础设施 ─────────────────────────────────────────────────── */

  function V() {
    return (typeof VehicleDynamics15DOF !== 'undefined') ? VehicleDynamics15DOF
      : (typeof window !== 'undefined' ? window.VehicleDynamics15DOF : null);
  }

  /** 浅克隆 S（只深拷两轴）：构造器只读 S_config，克隆后改刚度/阻尼不会污染界面状态 */
  function cloneS(over) {
    const c = Object.assign({}, S);
    c.front = Object.assign({}, S.front);
    c.rear = Object.assign({}, S.rear);
    if (over) {
      if (over.zeroDamping) {
        c.front.cB = 0; c.front.cR = 0; c.rear.cB = 0; c.rear.cR = 0;
      }
      if (over.kS_scale) { c.front.kS *= over.kS_scale; c.rear.kS *= over.kS_scale; }
      if (over.cR_scale) { c.front.cR *= over.cR_scale; c.rear.cR *= over.cR_scale; }
      if (over.mTotal_scale) { c.mTotal *= over.mTotal_scale; }
    }
    return c;
  }

  function rig(h) {
    const z = (h === undefined) ? 0 : h;
    return { grade: 0, bumpNoise: 0, rig: { FL: z, FR: z, RL: z, RR: z } };
  }
  function rig4(a) {
    return { grade: 0, bumpNoise: 0, rig: { FL: a[0], FR: a[1], RL: a[2], RR: a[3] } };
  }

  function makeCar(over) {
    const Ctor = V();
    if (!Ctor) throw new Error('RIDE_BENCH: VehicleDynamics15DOF 未加载');
    return new Ctor(cloneS(over), (typeof SIM !== 'undefined' ? SIM : {}), 0);
  }

  /** 静平衡：平路跑到稳态（初值按静载预压缩，通常 0.6 s 足够） */
  function settle(car, secs, dt) {
    const n = Math.max(1, Math.round(secs / dt));
    const e = rig(0);
    for (let i = 0; i < n; i++) car.step(CTRL0, e, dt);
  }

  function series() {
    const o = { t: [], Z: [], w: [] };
    for (const id of WHEELS) { o['zw_' + id] = []; o['Fz_' + id] = []; o['tr_' + id] = []; }
    return o;
  }
  function sample(car, s, t) {
    s.t.push(t); s.Z.push(car.state.Z); s.w.push(car.state.w);
    for (const id of WHEELS) {
      s['zw_' + id].push(car.zw[id]);
      s['Fz_' + id].push(car.telemetry.Fz[id]);
      s['tr_' + id].push(car.telemetry.tr[id]);
    }
  }

  /* ── ① 阶跃 STEP：T63 / 超调 / 稳定时间 ───────────────────────── */

  function runStep(opts) {
    const o = opts || {};
    const dt = o.dt || 0.001;
    const amp = (o.ampMm === undefined ? 5 : o.ampMm) / 1000;
    const settleSecs = o.settleSecs === undefined ? 0.6 : o.settleSecs;
    const dur = o.dur === undefined ? 3.0 : o.dur;

    const car = makeCar(o.over);
    settle(car, settleSecs, dt);
    const z0 = car.state.Z;

    const s = series();
    const n = Math.round(dur / dt);
    const e = rig(amp);
    for (let i = 0; i < n; i++) {
      car.step(CTRL0, e, dt);
      sample(car, s, i * dt);
    }

    /* 稳态 = 末 15% 均值；刚体跟随 ⇒ 理论上等于 amp */
    const tail = Math.max(1, Math.round(n * 0.15));
    let sum = 0;
    for (let i = n - tail; i < n; i++) sum += s.Z[i] - z0;
    const steady = sum / tail;

    /* T63：首次达到 63% 稳态的时刻 */
    let t63 = NaN, peak = -Infinity, tPeak = NaN;
    for (let i = 0; i < n; i++) {
      const dz = s.Z[i] - z0;
      if (Number.isNaN(t63) && dz >= 0.63 * steady) t63 = s.t[i];
      if (dz > peak) { peak = dz; tPeak = s.t[i]; }
    }
    const overshoot = steady !== 0 ? (peak - steady) / steady : NaN;

    /* 稳定时间：最后一次偏离稳态 >2% 之后 */
    let settleT = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs((s.Z[i] - z0) - steady) > 0.02 * Math.abs(steady)) settleT = s.t[i];
    }

    return {
      test: 'step',
      spec: { ampMm: amp * 1000, dt, settleSecs, dur, over: o.over || null },
      metrics: {
        steadyMm: steady * 1000,
        t63Ms: t63 * 1000,
        overshootPct: overshoot * 100,
        settleMs: settleT * 1000,
        peakMm: peak * 1000,
        tPeakMs: tPeak * 1000
      },
      series: s
    };
  }

  /* ── ② 扫频 SWEEP：共振频率 / 传递率峰值 / 半功率阻尼比 ──────── */

  const SWEEP_F = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0];

  function runSweep(opts) {
    const o = opts || {};
    const dt = o.dt || 0.002;
    const amp = (o.ampMm === undefined ? 2 : o.ampMm) / 1000;
    const freqs = o.freqs || SWEEP_F;
    const settleSecs = o.settleSecs === undefined ? 0.6 : o.settleSecs;
    const cycles = o.cycles === undefined ? 6 : o.cycles;   // 每点至少 6 个周期

    const car0 = makeCar(o.over);
    settle(car0, settleSecs, dt);

    const pts = [];
    for (const f of freqs) {
      /* ⚠ 每个频点**重建并静平衡**：高 Q 系统（零阻尼时 Q≈64）时间常数可达数秒，
         沿用同一辆车会让上一点的余振污染下一点，测出的"峰值"其实是扫频顺序的假象
         （2026-11-19 实测：假峰 4.45 Hz vs 真值 5.2 Hz）。 */
      const car = makeCar(o.over);
      settle(car, settleSecs, dt);
      const z0 = car.state.Z;
      const secs = Math.max(1.0, cycles / f);
      const n = Math.round(secs / dt);
      const skip = Math.round(n * 0.4);            // 前 40% 让瞬态衰减
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const h = amp * Math.sin(2 * Math.PI * f * (i * dt));
        car.step(CTRL0, rig(h), dt);
        if (i >= skip) {
          const dz = car.state.Z - z0;
          if (dz < lo) lo = dz;
          if (dz > hi) hi = dz;
        }
      }
      const ampZ = (hi - lo) / 2;
      pts.push({ f: f, trans: ampZ / amp, ampZmm: ampZ * 1000 });
    }

    /* 峰值 + 半功率带宽 ⇒ ζ = (f2−f1)/(2·f_peak) */
    let k = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].trans > pts[k].trans) k = i;
    const peak = pts[k];
    const half = peak.trans / Math.SQRT2;
    let f1 = NaN, f2 = NaN;
    for (let i = k; i > 0; i--) if (pts[i].trans <= half) { f1 = pts[i].f; break; }
    for (let i = k; i < pts.length - 1; i++) if (pts[i].trans <= half) { f2 = pts[i].f; break; }
    const zeta = (Number.isFinite(f1) && Number.isFinite(f2)) ? (f2 - f1) / (2 * peak.f) : NaN;

    return {
      test: 'sweep',
      spec: { ampMm: amp * 1000, dt, cycles, over: o.over || null },
      metrics: {
        peakFreqHz: peak.f,
        peakTrans: peak.trans,
        zeta: zeta,
        bandLowHz: f1,
        bandHighHz: f2
      },
      points: pts
    };
  }

  /* ── ③ 脉冲 IMPULSE：包络衰减 / 主频 ─────────────────────────── */

  /** 线性去趋势后数过零 ⇒ 主频（n 次过零 = (n−1)/2 个周期）。
      高 Q 系统的自由衰减比扫频可靠得多：不用等稳态。 */
  function freqFromZeroCrossings(t, y) {
    const n = y.length;
    if (n < 8) return NaN;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += t[i]; sy += y[i]; sxx += t[i] * t[i]; sxy += t[i] * y[i]; }
    const den = n * sxx - sx * sx;
    const slope = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : 0;
    const icpt = (sy - slope * sx) / n;
    const zc = [];
    for (let i = 1; i < n; i++) {
      const a = y[i - 1] - (slope * t[i - 1] + icpt);
      const b = y[i] - (slope * t[i] + icpt);
      if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) zc.push(t[i]);
    }
    if (zc.length < 4) return NaN;
    return ((zc.length - 1) / 2) / (zc[zc.length - 1] - zc[0]);
  }

  function runImpulse(opts) {
    const o = opts || {};
    const dt = o.dt || 0.001;
    const amp = (o.ampMm === undefined ? 10 : o.ampMm) / 1000;
    const widthMs = o.widthMs === undefined ? 10 : o.widthMs;
    const settleSecs = o.settleSecs === undefined ? 0.6 : o.settleSecs;
    const dur = o.dur === undefined ? 2.0 : o.dur;
    const single = !!o.singleWheel;               // true ⇒ 只激励 FL（看轮跳），false ⇒ 四轮（看车身）

    const car = makeCar(o.over);
    settle(car, settleSecs, dt);
    const z0 = car.state.Z;
    const zw0 = {};
    for (const id of WHEELS) zw0[id] = car.zw[id];

    const s = series();
    const n = Math.round(dur / dt);
    const wN = Math.max(1, Math.round((widthMs / 1000) / dt));
    for (let i = 0; i < n; i++) {
      let h = 0;
      if (i < wN) h = amp * Math.sin(Math.PI * i / wN);   // 半正弦
      const e = single ? rig4([h, 0, 0, 0]) : rig(h);
      car.step(CTRL0, e, dt);
      sample(car, s, i * dt);
    }

    /* 信号：车身取 Z−z0；单轮取 zw−zw0（**必须去静平衡值**，否则 |zw| 被直流
       ≈−3 mm 主导，峰值检测抓的全是噪声——2026-11-19 首版就栽在这）。 */
    const sig = single ? s['zw_FL'].map((z) => z - zw0.FL) : s.Z.map((z) => z - z0);

    /* 包络衰减比：两个窗口的 RMS 之比。比"峰值对数衰减率"抗噪，
       且不需要知道周期数（峰值检测在非线性/含噪信号上不可靠）。 */
    const win = (a, b) => {
      const i0 = Math.max(0, Math.round(a / dt)), i1 = Math.min(n - 1, Math.round(b / dt));
      let ss = 0, c = 0;
      for (let i = i0; i <= i1; i++) { ss += sig[i] * sig[i]; c++; }
      return c ? Math.sqrt(ss / c) : NaN;
    };
    const tPulse = (widthMs / 1000);
    const rmsEarly = win(tPulse + 0.02, tPulse + 0.12);
    const rmsLate = win(tPulse + 0.30, tPulse + 0.40);
    const decayRatio = (rmsEarly > 0) ? rmsLate / rmsEarly : NaN;

    /* 峰数只作展示（用去直流的信号） */
    let peaks = 0;
    for (let i = 1; i < sig.length - 1; i++) {
      if (Math.abs(sig[i]) > Math.abs(sig[i - 1]) && Math.abs(sig[i]) >= Math.abs(sig[i + 1])
          && Math.abs(sig[i]) > 1e-7) peaks++;
    }

    /* 衰减到 5% 的时间（相对首峰） */
    let decayT = NaN;
    let aMax = 0;
    for (let i = 0; i < sig.length; i++) aMax = Math.max(aMax, Math.abs(sig[i]));
    if (aMax > 0) {
      for (let i = sig.length - 1; i >= 0; i--) {
        if (Math.abs(sig[i]) > 0.05 * aMax) { decayT = s.t[i]; break; }
      }
    }

    /* 主频：自由衰减过零（跳过脉冲段，避免激励本身被当成振荡） */
    const iStart = Math.min(n - 8, Math.round((tPulse + 0.02) / dt));
    const domF = freqFromZeroCrossings(s.t.slice(iStart), sig.slice(iStart));

    return {
      test: 'impulse',
      spec: { ampMm: amp * 1000, widthMs, dt, singleWheel: single, over: o.over || null },
      metrics: {
        peakCount: peaks,
        rmsEarly: rmsEarly,
        rmsLate: rmsLate,
        decayRatio: decayRatio,
        decayTo5PctMs: decayT * 1000,
        peakAmp: aMax,
        dominantFreqHz: domF
      },
      series: s
    };
  }

  /* ── ④ 随机路面 RANDOM：ISO 8608 谱合成 + RMS ─────────────────── */

  /** 线性同余伪随机（固定种子 ⇒ 结果可复现，测试要求"连跑两次逐位一致"） */
  function lcg(seed) {
    let s = seed >>> 0;
    return function () { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  }

  /** ISO 8608 一维路面：h(s) = Σ √(2·Gd(n_i)·Δn)·sin(2π n_i s + φ_i)，w=2 */
  function isoRoadProfile(cls, seed, nHarm) {
    const G0 = { A: 16e-6, B: 64e-6, C: 256e-6, D: 1024e-6, E: 4096e-6, F: 16384e-6 }[cls] || 256e-6;
    const n0 = 0.1, nLo = 0.011, nHi = 2.83;
    const N = nHarm || 60;
    const rnd = lcg(seed || 20261119);
    const dn = (nHi - nLo) / N;
    const terms = [];
    for (let i = 0; i < N; i++) {
      const n = nLo + (i + 0.5) * dn;
      const Gd = G0 * Math.pow(n / n0, -2);
      terms.push({ n: n, A: Math.sqrt(2 * Gd * dn), phi: 2 * Math.PI * rnd() });
    }
    return function h(s) {
      let z = 0;
      for (let i = 0; i < terms.length; i++) {
        z += terms[i].A * Math.sin(2 * Math.PI * terms[i].n * s + terms[i].phi);
      }
      return z;
    };
  }

  function runRandom(opts) {
    const o = opts || {};
    const dt = o.dt || 0.001;
    const dur = o.dur === undefined ? 10 : o.dur;
    const cls = o.isoClass || 'C';
    const speed = o.speedMs === undefined ? 16.7 : o.speedMs;   // 60 km/h
    const seed = o.seed === undefined ? 20261119 : o.seed;

    const car = makeCar(o.over);
    settle(car, 0.6, dt);
    const z0 = car.state.Z;
    const prof = isoRoadProfile(cls, seed, o.harmonics);

    const s = series();
    const n = Math.round(dur / dt);
    const wb = car.wb;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const sF = speed * t;
      const hF = prof(sF), hR = prof(sF - wb);   // 后轴经过前轴碾过的位置
      car.step(CTRL0, rig4([hF, hF, hR, hR]), dt);
      sample(car, s, t);
    }

    /* 统计量（跳过前 1 s 瞬态） */
    const skip = Math.min(n - 1, Math.round(1.0 / dt));
    let sum2 = 0, cnt = 0, pk = 0;
    let fzSum = 0, fzSum2 = 0;
    for (let i = skip; i < n; i++) {
      const dz = s.Z[i] - z0;
      sum2 += dz * dz; cnt++;
      if (Math.abs(dz) > pk) pk = Math.abs(dz);
      const fz = s.Fz_FL[i];
      fzSum += fz; fzSum2 += fz * fz;
    }
    const rms = Math.sqrt(sum2 / cnt);
    const fzMean = fzSum / cnt;
    const fzRms = Math.sqrt(Math.max(0, fzSum2 / cnt - fzMean * fzMean));

    return {
      test: 'random',
      spec: { isoClass: cls, speedMs: speed, seed: seed, dt: dt, dur: dur, over: o.over || null },
      metrics: {
        bodyRmsMm: rms * 1000,
        bodyPeakMm: pk * 1000,
        loadRmsN: fzRms,
        loadMeanN: fzMean,
        roadRmsMm: isoRmsMm(cls)
      },
      series: s
    };
  }

  /** 理论路面 RMS（mm）：√(∫Gd dn)，区间 0.011~2.83 cycle/m */
  function isoRmsMm(cls) {
    const G0 = { A: 16e-6, B: 64e-6, C: 256e-6, D: 1024e-6, E: 4096e-6, F: 16384e-6 }[cls] || 256e-6;
    const n0 = 0.1, nLo = 0.011, nHi = 2.83;
    const v = G0 * n0 * n0 * (1 / nLo - 1 / nHi);
    return Math.sqrt(v) * 1000;
  }

  /* ── ⑤ 自由衰减 FREEDECAY：给车身一个纯垂向初速，量主频 ────────
     用途：解析锚。**不能**用路面脉冲代替——路面脉冲同时激励 heave 与 pitch
     （前后轮率不同 ⇒ 纯垂向位移也会产生俯仰力矩），过零计数会被拍频污染
     （实测 4.33 Hz vs 真值 5.14 Hz）。车身初速只激励 heave，干净。 */
  function runFreeDecay(opts) {
    const o = opts || {};
    const dt = o.dt || 0.001;
    const dur = o.dur === undefined ? 4.0 : o.dur;
    const car = makeCar(o.over);
    settle(car, o.settleSecs === undefined ? 0.6 : o.settleSecs, dt);
    const z0 = car.state.Z;
    car.state.w = (o.w0 === undefined ? 0.05 : o.w0);   // m/s 纯垂向初速

    const s = series();
    const n = Math.round(dur / dt);
    const e = rig(0);
    for (let i = 0; i < n; i++) { car.step(CTRL0, e, dt); sample(car, s, i * dt); }

    const sig = s.Z.map(function (z) { return z - z0; });
    /* 跳过起始 0.3 s：初速阶跃会先激起轮跳振子的瞬态，混进来会把过零数拉偏
       （实测 4.33 vs 5.14 Hz —— 探针当年就跳过了这段） */
    const iStart = Math.min(n - 8, Math.round((o.skipSecs === undefined ? 0.3 : o.skipSecs) / dt));
    const f = freqFromZeroCrossings(s.t.slice(iStart), sig.slice(iStart));
    let amp = 0;
    for (let i = 0; i < sig.length; i++) amp = Math.max(amp, Math.abs(sig[i]));

    return {
      test: 'freedecay',
      spec: { w0: car.state.w, dt: dt, dur: dur, over: o.over || null },
      metrics: { dominantFreqHz: f, peakAmpMm: amp * 1000 },
      series: s
    };
  }

  /* ── 统一入口 + CSV ───────────────────────────────────────────── */

  function run(test, opts) {
    let r;
    if (test === 'step') r = runStep(opts);
    else if (test === 'sweep') r = runSweep(opts);
    else if (test === 'impulse') r = runImpulse(opts);
    else if (test === 'random') r = runRandom(opts);
    else if (test === 'freedecay') r = runFreeDecay(opts);
    else throw new Error('RIDE_BENCH.run: 未知测试 ' + test);
    r.preset = (typeof S !== 'undefined' && S.vehicleType) || '?';
    r.at = new Date().toISOString();
    RIDE_BENCH.last = r;
    return r;
  }

  /** 结果 → CSV（有 series 导 series，sweep 导频响表） */
  function toCsv(r) {
    if (!r) return '';
    const lines = [];
    lines.push('# RIDE_BENCH ' + r.test + ' preset=' + r.preset + ' at=' + r.at);
    lines.push('# spec=' + JSON.stringify(r.spec));
    lines.push('# metrics=' + JSON.stringify(r.metrics));
    if (r.points) {
      lines.push('freq_hz,transmissibility,amp_mm');
      for (const p of r.points) lines.push(p.f + ',' + p.trans.toFixed(6) + ',' + p.ampZmm.toFixed(4));
      return lines.join('\n');
    }
    const s = r.series;
    if (!s) return lines.join('\n');
    const keys = Object.keys(s);
    lines.push(keys.join(','));
    const n = s[keys[0]].length;
    for (let i = 0; i < n; i++) {
      lines.push(keys.map(function (k) { return Number(s[k][i]).toFixed(6); }).join(','));
    }
    return lines.join('\n');
  }

  function download(r) {
    const csv = toCsv(r || RIDE_BENCH.last);
    if (!csv) return false;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ride_' + (r || RIDE_BENCH.last).test + '_' + Date.now() + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    return true;
  }

  return {
    run: run,
    step: runStep, sweep: runSweep, impulse: runImpulse, random: runRandom, freeDecay: runFreeDecay,
    toCsv: toCsv, download: download, isoRmsMm: isoRmsMm, isoRoadProfile: isoRoadProfile,
    SWEEP_F: SWEEP_F, last: null
  };
})();

if (typeof window !== 'undefined') window.RIDE_BENCH = RIDE_BENCH;
