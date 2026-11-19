/* 19-compare.js —— 三层对比：静态 / 动态 / 赛道（Phase D，2026-11-19）
 *
 * 存在理由：三张表各自有真源，但从来没有并排过；更关键的是**赛道层没有受控指标**——
 * `test_lap_15dof` 的圈速由自动驾驶逐圈学习决定，几何差异被压到 0.017%（P29）。
 * 本模块给赛道层一个**不受学习掩盖**的指标：受控定圆极限（定转角 + 速度保持，
 * 扫速度找峰值 ay），几何/外倾/刚度差异会直接体现在峰值侧向加速度上。
 *
 * 三层口径：
 *   静态 = `calculateEvaluationData()` 的 KPI（外倾增益/跳动转向/侧倾中心/…）
 *   动态 = `RIDE_BENCH`（阶跃/自由衰减）
 *   赛道 = 本文件 `trackLimit()`（受控定圆极限，不是圈速）
 *
 * A/B 两个槽位：改完底盘点「采集 A」，再改，点「采集 B」，然后对比。
 */
'use strict';

const COMPARE = (function () {
  const CTRL = (steer, thr) => ({ steer: steer, throttle: thr, brake: 0, drs: false });
  const ENV_FLAT = { grade: 0, bumpNoise: 0 };
  const slots = { A: null, B: null };

  function V() {
    return (typeof VehicleDynamics15DOF !== 'undefined') ? VehicleDynamics15DOF
      : (typeof window !== 'undefined' ? window.VehicleDynamics15DOF : null);
  }

  /** 配置指纹：预设 + 两轴关键参数 + 硬点。用于确认 A/B 确实是两个方案 */
  function configHash() {
    const hp = (typeof HP !== 'undefined' && HP) ? HP : null;
    const src = JSON.stringify({
      v: (typeof S !== 'undefined' && S.vehicleType) || '?',
      kS: [S.front.kS, S.rear.kS], cR: [S.front.cR, S.rear.cR],
      mU: [S.front.mU, S.rear.mU], kT: [S.front.kT, S.rear.kT],
      cam0: [S.front.cam0, S.rear.cam0],
      hp: hp ? JSON.stringify(hp).length : 0
    });
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }

  /* ── 静态层：直接复用评价引擎的 KPI（不自造口径）───────────────── */
  function staticRows() {
    if (typeof calculateEvaluationData !== 'function' || typeof EVAL_BENCHMARKS === 'undefined') return [];
    let ev = null;
    try { ev = calculateEvaluationData(); } catch (e) { return []; }
    const m = (ev && ev.metrics) || {};
    const out = [];
    for (const k of Object.keys(EVAL_BENCHMARKS)) {
      const bm = EVAL_BENCHMARKS[k];
      const cell = m[k];
      const val = (cell && cell.formatted !== undefined) ? cell.formatted
        : (cell && cell.value !== undefined ? String(cell.value) : '—');
      out.push({ key: k, name: bm.name, unit: bm.unit || '', value: val });
    }
    return out;
  }

  /* ── 动态层：ride 台的绝对量 ───────────────────────────────────── */
  function dynamicRows() {
    if (typeof RIDE_BENCH === 'undefined') return [];
    const st = RIDE_BENCH.run('step', { ampMm: 5, dur: 2.0 });
    const fd = RIDE_BENCH.run('freedecay', { dur: 3.0, over: { zeroDamping: true } });
    return [
      { key: 't63', name: '阶跃 T63', unit: 'ms', value: st.metrics.t63Ms.toFixed(0) },
      { key: 'overshoot', name: '阶跃超调', unit: '%', value: st.metrics.overshootPct.toFixed(1) },
      { key: 'settle', name: '稳定时间', unit: 'ms', value: st.metrics.settleMs.toFixed(0) },
      { key: 'fn', name: '车身主频（去阻尼）', unit: 'Hz', value: fd.metrics.dominantFreqHz.toFixed(2) }
    ];
  }

  /* ── 赛道层：受控定圆极限（替代被学习掩盖的圈速）───────────────────
     做法：定转角 + **每步把 u 拉回目标速度**（准稳态定圆，纵向自由度不参与），
     跑 4 s 让横向平衡，取后 1.5 s 的平均 ay = u·r。
     扫一串速度，峰值 ay 即"这套底盘在这个转角下能吃到的极限侧向加速度"。
     ⚠ 这不是瞬态极限（不含驾驶员修正），是**准稳态**口径——正因如此才可复现、
       才对几何/外倾敏感，而不会被逐圈学习抹平。 */
  function trackLimit(opts) {
    const o = opts || {};
    const Ctor = V();
    if (!Ctor) return null;
    const dt = o.dt || 0.002;
    const steer = o.steerDeg === undefined ? 8.0 : o.steerDeg;
    const speeds = o.speeds || [8, 10, 12, 14, 16, 18];
    const settle = o.settleSecs === undefined ? 4.0 : o.settleSecs;
    const avgWin = o.avgSecs === undefined ? 1.5 : o.avgSecs;

    const rows = [];
    for (const u0 of speeds) {
      const car = new Ctor(S, (typeof SIM !== 'undefined' ? SIM : {}), u0);
      const n = Math.round(settle / dt);
      const nAvg = Math.round(avgWin / dt);
      let sumAy = 0, cnt = 0, maxR = 0;
      for (let i = 0; i < n; i++) {
        car.step(CTRL(steer, 0.55), ENV_FLAT, dt);
        car.state.u = u0;                     // 速度保持（准稳态定圆）
        if (i >= n - nAvg) {
          const ay = Math.abs(car.state.u * car.state.r);
          sumAy += ay; cnt++;
          const R = Math.abs(car.state.r) > 1e-6 ? Math.abs(car.state.u / car.state.r) : 1e9;
          if (R > maxR) maxR = R;
        }
      }
      const ay = cnt ? sumAy / cnt : NaN;
      rows.push({ u: u0, ayG: ay / 9.81, radius: cnt ? Math.abs(u0) / Math.max(1e-6, Math.abs(ay / Math.max(1e-6, u0))) : NaN, maxR: maxR });
    }

    let best = rows[0];
    for (const r of rows) if (r.ayG > best.ayG) best = r;
    /* 单调性守卫：ay 应随速度先升后饱和/下降；若最高速仍最高，说明还没到极限 */
    const atLimit = best.u < speeds[speeds.length - 1];

    return {
      kind: 'track',
      spec: { steerDeg: steer, dt: dt, settleSecs: settle, avgSecs: avgWin, speeds: speeds },
      metrics: {
        peakAyG: best.ayG,
        speedAtPeak: best.u,
        radiusAtPeak: best.radius,
        reachedLimit: atLimit
      },
      points: rows
    };
  }

  function trackRows(opts) {
    const r = trackLimit(opts);
    if (!r) return [];
    return [
      { key: 'peakAy', name: '峰值侧向加速度', unit: 'g', value: r.metrics.peakAyG.toFixed(3) },
      { key: 'speedAtPeak', name: '峰值对应车速', unit: 'm/s', value: r.metrics.speedAtPeak.toFixed(0) },
      { key: 'radiusAtPeak', name: '峰值对应半径', unit: 'm', value: r.metrics.radiusAtPeak.toFixed(1) },
      { key: 'atLimit', name: '是否到极限', unit: '', value: r.metrics.reachedLimit ? '是' : '否（可再加高速）' }
    ];
  }

  /* ── 采集与对比 ────────────────────────────────────────────────── */
  function capture(slot) {
    const s = (slot === 'B') ? 'B' : 'A';
    const rec = {
      slot: s,
      hash: configHash(),
      at: new Date().toISOString(),
      preset: (typeof S !== 'undefined' && S.vehicleType) || '?',
      statics: staticRows(),
      dynamics: dynamicRows(),
      tracks: trackRows()
    };
    slots[s] = rec;
    return rec;
  }

  /** 把 A/B 按 key 合并成行：[{name, unit, a, b, delta, pct}] */
  function diff() {
    const A = slots.A, B = slots.B;
    if (!A || !B) return null;
    const out = [];
    const push = (layer, aRows, bRows) => {
      const mapB = {};
      for (const r of bRows) mapB[r.key] = r;
      for (const ra of aRows) {
        const rb = mapB[ra.key];
        if (!rb) continue;
        const na = parseFloat(ra.value), nb = parseFloat(rb.value);
        const num = Number.isFinite(na) && Number.isFinite(nb);
        out.push({
          layer: layer, key: ra.key, name: ra.name, unit: ra.unit,
          a: ra.value, b: rb.value,
          delta: num ? (nb - na) : null,
          pct: (num && na !== 0) ? (100 * (nb - na) / Math.abs(na)) : null
        });
      }
    };
    push('静态', A.statics, B.statics);
    push('动态', A.dynamics, B.dynamics);
    push('赛道', A.tracks, B.tracks);
    return { A: A, B: B, rows: out, sameConfig: A.hash === B.hash };
  }

  function toCsv(d) {
    if (!d) return '';
    const lines = ['# COMPARE A=' + d.A.hash + ' B=' + d.B.hash];
    lines.push('layer,metric,unit,A,B,delta,pct');
    for (const r of d.rows) {
      lines.push([r.layer, '"' + r.name + '"', r.unit, r.a, r.b,
        r.delta === null ? '' : r.delta.toFixed(4),
        r.pct === null ? '' : r.pct.toFixed(2)].join(','));
    }
    return lines.join('\n');
  }

  return {
    capture: capture, diff: diff, toCsv: toCsv, slots: slots,
    staticRows: staticRows, dynamicRows: dynamicRows, trackRows: trackRows,
    trackLimit: trackLimit, configHash: configHash
  };
})();

if (typeof window !== 'undefined') window.COMPARE = COMPARE;
