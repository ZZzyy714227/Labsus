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

  /* ── 多方案对比（线 C · C1，2026-11-19）────────────────────────────
     从 A/B 两槽扩到方案库 N 条。做法：逐条把方案快照灌进 S → 跑三层台 → 还原。
     ⚠ 必须刷新几何（rebuild/refreshDerived），否则 SIM.swF/mrRefF 还是上一个方案的，
       量出来的东西是"混合体"。node 沙箱里没有 DOM 刷新时退化为只跑参数派生的量，
       测试用 `_refresh` 钩子显式注入。
     ⚠ 方案库是 localStorage 里的 SETUPS（06-ui-panels），本模块只读不写。 */
  let _refresh = null;
  function setRefreshHook(fn) { _refresh = fn; }
  function snapshotS() {
    return {
      veh: S.vehicleType, wb: S.wb, hcg: S.hcg, hs: S.hs,
      mTotal: S.mTotal, mSprung: S.mSprung,
      front: JSON.parse(JSON.stringify(S.front)),
      rear: JSON.parse(JSON.stringify(S.rear))
    };
  }
  function applyScheme(rec) {
    if (!rec) return;
    if (rec.veh !== undefined) S.vehicleType = rec.veh;
    if (rec.wb !== undefined) S.wb = rec.wb;
    if (rec.hcg !== undefined) S.hcg = rec.hcg;
    if (rec.hs !== undefined) S.hs = rec.hs;
    if (rec.mTotal !== undefined) S.mTotal = rec.mTotal;
    if (rec.mSprung !== undefined) S.mSprung = rec.mSprung;
    if (rec.front) S.front = JSON.parse(JSON.stringify(rec.front));
    if (rec.rear) S.rear = JSON.parse(JSON.stringify(rec.rear));
    if (typeof _refresh === 'function') _refresh();
  }
  function restoreS(snap) {
    S.vehicleType = snap.veh; S.wb = snap.wb; S.hcg = snap.hcg; S.hs = snap.hs;
    S.mTotal = snap.mTotal; S.mSprung = snap.mSprung;
    S.front = snap.front; S.rear = snap.rear;
    if (typeof _refresh === 'function') _refresh();
  }

  /** 对一个方案快照采集三层指标（不动 UI） */
  function captureScheme(rec, label) {
    const snap = snapshotS();
    let out = null;
    try {
      applyScheme(rec);
      out = {
        label: label || rec.name || '?',
        hash: configHash(),
        statics: staticRows(), dynamics: dynamicRows(), tracks: trackRows()
      };
    } finally {
      restoreS(snap);
    }
    return out;
  }

  /** N 方案对比：第一列作基准，其余给 Δ% */
  function diffMulti(records) {
    if (!records || records.length < 2) return null;
    const base = records[0];
    const key = (layer, k) => layer + '|' + k;
    const rows = [];
    const layers = [['静态', 'statics'], ['动态', 'dynamics'], ['赛道', 'tracks']];
    for (const [layerName, prop] of layers) {
      for (const r of base[prop]) {
        const cells = [];
        let anyNum = false;
        for (const rec of records) {
          const hit = (rec[prop] || []).find(x => x.key === r.key);
          const raw = hit ? hit.value : '—';
          const num = parseFloat(raw);
          cells.push({ raw: raw, num: Number.isFinite(num) ? num : null });
          if (Number.isFinite(num)) anyNum = true;
        }
        if (!anyNum) { rows.push({ layer: layerName, key: r.key, name: r.name, unit: r.unit, cells: cells, pcts: cells.map(() => null) }); continue; }
        const baseNum = cells[0].num;
        const pcts = cells.map((c, i) => (i === 0 || c.num === null || baseNum === null || baseNum === 0)
          ? null : (100 * (c.num - baseNum) / Math.abs(baseNum)));
        rows.push({ layer: layerName, key: r.key, name: r.name, unit: r.unit, cells: cells, pcts: pcts });
      }
    }
    return { labels: records.map(r => r.label), hashes: records.map(r => r.hash), rows: rows };
  }

  function toCsvMulti(d) {
    if (!d) return '';
    const head = ['layer', 'metric', 'unit'].concat(d.labels.map((l, i) => l + '(' + d.hashes[i] + ')'))
      .concat(d.labels.slice(1).map(l => l + ' Δ%'));
    const lines = [head.join(',')];
    for (const r of d.rows) {
      const vals = r.cells.map(c => c.raw);
      const pcts = r.pcts.slice(1).map(p => p === null ? '' : p.toFixed(2));
      lines.push([r.layer, '"' + r.name + '"', r.unit].concat(vals).concat(pcts).join(','));
    }
    return lines.join('\n');
  }

  /* ── 开发看板（线 C · C2，2026-11-19）──────────────────────────────
     三层指标并排 + **状态判定**。判定只用两种真源，不编造阈值：
       ① 静态：`EVAL_BENCHMARKS[k].eval()` 的目标带（good/warn/bad）——项目既有口径
       ② 有解析锚的量：实测 vs 锚，偏差 <2% good / <5% warn / 否则 bad
       ③ 既无目标带又无锚的量：只给值，状态 null（不假装有判据） */
  function gradeByError(meas, anchor) {
    if (!Number.isFinite(meas) || !Number.isFinite(anchor) || Math.abs(anchor) < 1e-9) return null;
    const e = Math.abs(Math.abs(meas) - Math.abs(anchor)) / Math.abs(anchor) * 100;
    return { grade: e < 2 ? 'good' : (e < 5 ? 'warn' : 'bad'), errPct: e };
  }

  function dashboard() {
    const rows = [];

    /* ① 静态 KPI —— 复用评价引擎的目标带 */
    if (typeof calculateEvaluationData === 'function' && typeof EVAL_BENCHMARKS !== 'undefined') {
      let ev = null;
      try { ev = calculateEvaluationData(); } catch (e) { ev = null; }
      const m = (ev && ev.metrics) || {};
      for (const k of Object.keys(EVAL_BENCHMARKS)) {
        const bm = EVAL_BENCHMARKS[k], cell = m[k];
        const val = (cell && cell.formatted !== undefined) ? cell.formatted
          : (cell && cell.value !== undefined ? String(cell.value) : '—');
        let g = null;
        /* ⚠ 评价引擎的单元字段名是 `val`（不是 value）——本轮踩过 */
        const num = (cell && cell.val !== undefined) ? cell.val : (cell ? cell.value : undefined);
        if (num !== null && num !== undefined && typeof bm.eval === 'function') {
          try { g = bm.eval(num); } catch (e) { g = null; }
        }
        rows.push({ layer: '静态', key: k, name: bm.name, value: val, target: bm.target || '—', grade: g, errPct: null });
      }
    }

    /* ② 动态 —— ride 台 + 自由衰减频率的解析锚 */
    if (typeof RIDE_BENCH !== 'undefined') {
      const st = RIDE_BENCH.run('step', { ampMm: 5, dur: 2.0 });
      const fd = RIDE_BENCH.run('freedecay', { dur: 3.0, over: { zeroDamping: true } });
      const car = (typeof VehicleDynamics15DOF !== 'undefined')
        ? new (typeof VehicleDynamics15DOF !== 'undefined' ? VehicleDynamics15DOF : Object)(
            S, (typeof SIM !== 'undefined' ? SIM : {}), 0) : null;
      let fAnchor = null;
      if (car) {
        const keF = (car.Kw_F * car.kT_f) / (car.Kw_F + car.kT_f);
        const keR = (car.Kw_R * car.kT_r) / (car.Kw_R + car.kT_r);
        fAnchor = Math.sqrt((2 * keF + 2 * keR) / car.mSprung) / (2 * Math.PI);
      }
      const gr = fAnchor ? gradeByError(fd.metrics.dominantFreqHz, fAnchor) : null;
      rows.push({ layer: '动态', key: 't63', name: '阶跃 T63', value: st.metrics.t63Ms.toFixed(0) + ' ms', target: '越小越好', grade: null, errPct: null });
      rows.push({ layer: '动态', key: 'overshoot', name: '阶跃超调', value: st.metrics.overshootPct.toFixed(1) + ' %', target: '10~25%', grade: (st.metrics.overshootPct >= 10 && st.metrics.overshootPct <= 25) ? 'good' : 'warn', errPct: null });
      rows.push({ layer: '动态', key: 'settle', name: '稳定时间', value: st.metrics.settleMs.toFixed(0) + ' ms', target: '越小越好', grade: null, errPct: null });
      rows.push({
        layer: '动态', key: 'fn', name: '车身主频', value: fd.metrics.dominantFreqHz.toFixed(2) + ' Hz',
        target: fAnchor ? '解析 ' + fAnchor.toFixed(2) + ' Hz' : '—',
        grade: gr ? gr.grade : null, errPct: gr ? gr.errPct : null
      });
    }

    /* ③ 赛道 —— 受控定圆；侧倾角有解析锚 */
    if (typeof LAT_BENCH !== 'undefined') {
      const sc = LAT_BENCH.steadyCircle({ speed: 14, steerDeg: 5, dur: 6 });
      const an = LAT_BENCH.analytic();
      const phiPred = an.phiPredTotalDeg(sc.metrics.ayG * 9.81);
      const gRoll = gradeByError(sc.metrics.phiDeg, phiPred);
      rows.push({ layer: '赛道', key: 'peakAy', name: '峰值侧向加速度', value: sc.metrics.ayG.toFixed(3) + ' g', target: '越大越好', grade: null, errPct: null });
      rows.push({
        layer: '赛道', key: 'roll', name: '稳态侧倾角', value: sc.metrics.phiDeg.toFixed(3) + ' °',
        target: '解析 ' + phiPred.toFixed(3) + ' °', grade: gRoll ? gRoll.grade : null, errPct: gRoll ? gRoll.errPct : null
      });
      rows.push({ layer: '赛道', key: 'tlltd', name: '轮荷转移分布', value: sc.metrics.tlltd.toFixed(3), target: '(0,1)', grade: null, errPct: null });
    }

    const count = (g) => rows.filter(r => r.grade === g).length;
    return { rows: rows, good: count('good'), warn: count('warn'), bad: count('bad'), unknown: rows.filter(r => r.grade === null).length };
  }

  return {
    capture: capture, diff: diff, toCsv: toCsv, slots: slots,
    staticRows: staticRows, dynamicRows: dynamicRows, trackRows: trackRows,
    trackLimit: trackLimit, configHash: configHash,
    captureScheme: captureScheme, diffMulti: diffMulti, toCsvMulti: toCsvMulti,
    setRefreshHook: setRefreshHook, snapshotS: snapshotS,
    dashboard: dashboard
  };
})();

if (typeof window !== 'undefined') window.COMPARE = COMPARE;
