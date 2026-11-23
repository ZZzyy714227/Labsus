(function (global) {
  "use strict";

  /* ================================
     22. 正向硬点运动学优化器（Coordinate-Descent Bounded Optimizer）
     给定目标 Bump Steer(°/25mm)、Roll Center H(mm)、Camber Gain(°/25mm)，
     在约束边界 [-boundMm, +boundMm] 内对可选硬点坐标做多尺度坐标轮换寻优。
     ================================ */

  const DOF_META = {
    RACK_Z:  { hp: "RACK",  idx: 2, label: "齿条 Z" },
    RACK_X:  { hp: "RACK",  idx: 0, label: "齿条 X" },
    TRO_Z:   { hp: "TRO",   idx: 2, label: "横拉杆外点 Z" },
    LCA_F_Z: { hp: "LCA_F", idx: 2, label: "下臂前点 Z" },
    LCA_R_Z: { hp: "LCA_R", idx: 2, label: "下臂后点 Z" },
    UCA_F_Z: { hp: "UCA_F", idx: 2, label: "上臂前点 Z" },
    UCA_R_Z: { hp: "UCA_R", idx: 2, label: "上臂后点 Z" },
    LCA_F_X: { hp: "LCA_F", idx: 0, label: "下臂前点 X" },
    UCA_F_X: { hp: "UCA_F", idx: 0, label: "上臂前点 X" },
  };

  const DEFAULT_DOFS = ["RACK_Z", "TRO_Z", "LCA_F_Z", "LCA_R_Z", "UCA_F_Z", "UCA_R_Z"];

  let _lastResult = null;
  let _activeSnap = null;

  function cloneHp(hp) {
    const out = {};
    for (const k of Object.keys(hp)) {
      out[k] = Array.isArray(hp[k]) ? hp[k].slice() : hp[k];
    }
    return out;
  }

  function captureSnapshot(axis) {
    const ax = axis || S.axis || "front";
    _activeSnap = { axis: ax, hp: cloneHp(S[ax].hp) };
    return { axis: ax, hp: cloneHp(_activeSnap.hp) };
  }

  function syncUiAfterHpChange() {
    if (typeof refreshDerived === "function") refreshDerived(false);
    if (typeof SIM !== "undefined") SIM.dirtySweep = true;
    if (typeof simulate === "function") simulate(0);
    if (typeof UI !== "undefined" && Array.isArray(UI.sync)) {
      for (let i = 0; i < UI.sync.length; i++) UI.sync[i]();
    }
  }

  function restoreSnapshot(snap) {
    const src = snap || _activeSnap;
    if (!src || !S[src.axis]) return false;
    S[src.axis].hp = cloneHp(src.hp);
    syncUiAfterHpChange();
    return true;
  }

  function interpSweep(rows, trVal, key) {
    if (!rows || rows.length < 2) return null;
    if (trVal <= rows[0].tr) return rows[0][key];
    if (trVal >= rows[rows.length - 1].tr) return rows[rows.length - 1][key];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (trVal >= a.tr && trVal <= b.tr) {
        const va = a[key], vb = b[key];
        if (va == null || vb == null || !isFinite(va) || !isFinite(vb)) return null;
        const u = (trVal - a.tr) / ((b.tr - a.tr) || 1e-9);
        return va + (vb - va) * u;
      }
    }
    return null;
  }

  function evaluateMetrics(axis, sweepLim, nSteps) {
    const ax = axis || S.axis || "front";
    const lim = sweepLim || [-30, 30];
    const n = nSteps || 13;
    const M = buildMech(ax, 1);
    const sw = runSweep(M, 0, lim, n, ax);
    const rows = (sw && sw.rows) ? sw.rows : [];
    const finiteRows = rows.filter(r =>
      isFinite(r.tr) && isFinite(r.cam) && isFinite(r.toe) && isFinite(r.mr) && r.rcH != null && isFinite(r.rcH)
    );
    if (finiteRows.length < Math.max(5, Math.floor(n * 0.7))) {
      return { valid: false, cost: 1e12, finiteCount: finiteRows.length };
    }
    const cam0 = interpSweep(finiteRows, 0, "cam");
    const toe0 = interpSweep(finiteRows, 0, "toe");
    const rcH0 = interpSweep(finiteRows, 0, "rcH");
    const mr0 = interpSweep(finiteRows, 0, "mr");
    if (![cam0, toe0, rcH0, mr0].every(v => v != null && isFinite(v))) {
      return { valid: false, cost: 1e12, finiteCount: finiteRows.length };
    }
    const hGain = Math.min(25, Math.abs(lim[0]), Math.abs(lim[1])) || 25;
    const camP = interpSweep(finiteRows, hGain, "cam");
    const camM = interpSweep(finiteRows, -hGain, "cam");
    const toeP = interpSweep(finiteRows, hGain, "toe");
    const toeM = interpSweep(finiteRows, -hGain, "toe");
    if (![camP, camM, toeP, toeM].every(v => v != null && isFinite(v))) {
      return { valid: false, cost: 1e12, finiteCount: finiteRows.length };
    }
    const scale = 25.0 / (2.0 * hGain);
    const cg = (camP - camM) * scale;
    const bs = (toeP - toeM) * scale;

    let sumToe2 = 0, rcMin = Infinity, rcMax = -Infinity;
    for (let i = 0; i < finiteRows.length; i++) {
      const r = finiteRows[i];
      const dt = r.toe - toe0;
      sumToe2 += dt * dt;
      if (r.rcH < rcMin) rcMin = r.rcH;
      if (r.rcH > rcMax) rcMax = r.rcH;
    }
    const toeRms = Math.sqrt(sumToe2 / finiteRows.length);
    const rcMig = rcMax - rcMin;
    const m0Design = metrics(M, ax);
    return {
      valid: true,
      bs: bs,
      toeRms: toeRms,
      cg: cg,
      rcH0: rcH0,
      rcMig: rcMig,
      mr0: mr0,
      cam0: cam0,
      toe0: toe0,
      anti: (m0Design && m0Design.anti != null && isFinite(m0Design.anti)) ? m0Design.anti : 0,
    };
  }

  function computeCost(m, target, weights) {
    if (!m || !m.valid) return 1e12;
    const w = weights || {};
    const wBs = w.bs != null ? w.bs : 120.0;
    const wRc = w.rcH != null ? w.rcH : 1.0;
    const wCg = w.cg != null ? w.cg : 40.0;
    const wMig = w.rcMig != null ? w.rcMig : 0.25;
    const wAnti = w.anti != null ? w.anti : 0.08;
    const bsErr = m.bs - (target.bs != null ? target.bs : 0);
    const rcErr = target.rcH != null ? (m.rcH0 - target.rcH) : 0;
    const cgErr = target.cg != null ? (m.cg - target.cg) : 0;
    const antiErr = target.anti != null ? (m.anti - target.anti) : 0;
    return wBs * (bsErr * bsErr + 0.35 * m.toeRms * m.toeRms)
      + wRc * (rcErr * rcErr)
      + wCg * (cgErr * cgErr)
      + wMig * (m.rcMig * m.rcMig)
      + wAnti * (antiErr * antiErr);
  }

  function optimize(opts) {
    const o = opts || {};
    const ax = o.axis || S.axis || "front";
    if (!S[ax] || !S[ax].hp) {
      throw new Error("OPTIMIZER.optimize: invalid axis " + ax);
    }
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const baseSnap = captureSnapshot(ax);
    const baseHp = baseSnap.hp;

    const dofs = (Array.isArray(o.dofs) && o.dofs.length ? o.dofs : DEFAULT_DOFS)
      .filter(k => DOF_META[k] && Array.isArray(baseHp[DOF_META[k].hp]));
    const boundMm = Math.max(1, Math.min(40, o.boundMm != null ? Number(o.boundMm) : 15));
    const sweepLim = o.sweepLim || [-30, 30];
    const nSteps = o.nSteps || 13;

    const m0 = evaluateMetrics(ax, sweepLim, nSteps);
    if (!m0.valid) {
      return { ok: false, reason: "initial geometry invalid", axis: ax, initial: m0, best: m0 };
    }

    const target = {
      bs: o.target && o.target.bs != null ? Number(o.target.bs) : 0.0,
      rcH: o.target && o.target.rcH != null ? Number(o.target.rcH) : m0.rcH0,
      cg: o.target && o.target.cg != null ? Number(o.target.cg) : m0.cg,
      anti: o.target && o.target.anti != null ? Number(o.target.anti) : m0.anti,
    };
    const weights = o.weights || { bs: 120.0, rcH: 1.0, cg: 40.0, rcMig: 0.25 };

    let bestM = m0;
    let bestCost = computeCost(m0, target, weights);
    const cost0 = bestCost;
    const hp = S[ax].hp;

    const scales = o.scales || [4.0, 2.0, 1.0, 0.4, 0.15];
    const maxIters = o.maxIters || 240;
    let evals = 1;

    for (let si = 0; si < scales.length; si++) {
      const step = scales[si];
      for (let pass = 0; pass < 4; pass++) {
        let improved = false;
        for (let di = 0; di < dofs.length; di++) {
          if (evals >= maxIters) break;
          const meta = DOF_META[dofs[di]];
          const pName = meta.hp, ci = meta.idx;
          const vBase = baseHp[pName][ci];
          const lo = vBase - boundMm, hi = vBase + boundMm;
          const cur = hp[pName][ci];

          let bestVal = cur;
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            const cand = Math.max(lo, Math.min(hi, cur + sgn * step));
            if (Math.abs(cand - cur) < 1e-6) continue;
            hp[pName][ci] = cand;
            const mCand = evaluateMetrics(ax, sweepLim, nSteps);
            evals++;
            const cCand = computeCost(mCand, target, weights);
            if (cCand + 1e-9 < bestCost) {
              bestCost = cCand;
              bestM = mCand;
              bestVal = cand;
              improved = true;
            }
          }
          hp[pName][ci] = bestVal;
        }
        if (!improved || evals >= maxIters) break;
      }
    }

    const bestHp = cloneHp(hp);
    const deltas = {};
    for (let di = 0; di < dofs.length; di++) {
      const k = dofs[di], meta = DOF_META[k];
      deltas[k] = Number((bestHp[meta.hp][meta.idx] - baseHp[meta.hp][meta.idx]).toFixed(3));
    }

    if (o.apply === false) {
      S[ax].hp = cloneHp(baseHp);
    } else {
      syncUiAfterHpChange();
    }

    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    _lastResult = {
      ok: true,
      axis: ax,
      dofs: dofs,
      boundMm: boundMm,
      target: target,
      weights: weights,
      initial: m0,
      best: bestM,
      cost0: cost0,
      costBest: bestCost,
      evals: evals,
      elapsedMs: Number((t1 - t0).toFixed(1)),
      deltas: deltas,
      baselineSnap: baseSnap,
      bestHp: bestHp,
    };
    return _lastResult;
  }

  function saveToSetup(name) {
    if (typeof setupSaveCurrent !== "function") {
      return { ok: false, msg: "setupSaveCurrent 不可用" };
    }
    const ax = _lastResult ? _lastResult.axis : (S.axis || "front");
    const nm = (name && String(name).trim()) || ("OPT-" + ax.toUpperCase());
    return setupSaveCurrent(nm);
  }

  const api = {
    DOF_META: DOF_META,
    DEFAULT_DOFS: DEFAULT_DOFS,
    evaluateMetrics: evaluateMetrics,
    computeCost: computeCost,
    captureSnapshot: captureSnapshot,
    restoreSnapshot: restoreSnapshot,
    optimize: optimize,
    saveToSetup: saveToSetup,
    getLastResult: function () { return _lastResult; },
  };

  global.OPTIMIZER = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
