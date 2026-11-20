/* 21-car-capability.js —— 车能力表（CAR_CAPABILITY，2026-11-20）
 *
 * 存在理由（P29 的病根）
 * ─────────────────────────────────────────────────────────────────────
 * `CircuitPath` 的速度包络此前用**三个硬编码常数**：
 *     a_lat_max = max(4.5, mu·9.81·0.85·aggr)   // 质点经验值
 *     a_brake   = 5.5 m/s²                       // 0.56 g
 *     a_accel   = 5.8 m/s²
 * 它们与 15-DOF 车模型**完全无关**。实测偏差：
 *     横向：包络 11.25 m/s²（1.15 g） vs 真车 0.860 g  → 乐观 33%
 *     制动：包络 5.5 m/s²（0.56 g）   vs 真车 1.17 g   → 保守 2 倍
 * 弯里给太快、直道刹车太早，两边错叠加；驾驶员再用「逐圈学习」调 margin 去补，
 * 于是**圈速由常数决定而不是由悬架决定**——这正是 P29「几何差异被压平」的根因。
 *
 * 本模块做的事
 * ─────────────────────────────────────────────────────────────────────
 * 用 15-DOF 实测三个基础能力（低速、气动可忽略）：
 *     ay0     横向极限（g）      ← 低速定圆扫角找饱和
 *     brk0    制动减速（m/s²）   ← 直线全力制动
 *     acc0    低速加速（m/s²）   ← 直线全油门
 *     accHi   高速加速（m/s²）   ← 高速全油门（用于功率受限段）
 * 然后用**与内核同一个气动公式**把下压力带来的抓地增益接上：
 *     F_down(v) = aeroF · (v / aeroRefSpeed)²        （与 10b step() 同式）
 *     ay(v)    = ay0 · (1 + F_down(v)/W)
 *     brake(v) = brk0·(1 + F_down(v)/W)
 *     accel(v) = min(acc0·(1+F_down/W), accHi·vHi/v)  ← 低速附着受限 / 高速功率受限
 *
 * ⚠ 横向口径：按用户 2026-11-20 决策用**峰值 ay**（理论最快），不留安全余量。
 *   控制器跟踪时可能跑宽，靠驾驶员跟踪误差而不是降能力来兜底。
 *
 * 兜底：拿不到 15-DOF（旧沙箱/单文件快照）时 `forPath()` 返回 null，
 *       `CircuitPath` 走原来的常数分支 ⇒ **逐位不变**。
 */
'use strict';

const CAR_CAPABILITY = (function () {
  const G = 9.81;
  const CTRL_ZERO = { steer: 0, throttle: 0, brake: 0, drs: false };
  const ENV_FLAT = { grade: 0, bumpNoise: 0 };

  let _cache = null;
  let _cacheKey = '';

  function V() {
    if (typeof VehicleDynamics15DOF !== 'undefined') return VehicleDynamics15DOF;
    if (typeof window !== 'undefined' && window.VehicleDynamics15DOF) return window.VehicleDynamics15DOF;
    return null;
  }
  function Sref() {
    if (typeof S !== 'undefined' && S) return S;
    if (typeof window !== 'undefined' && window.S) return window.S;
    return null;
  }
  function SIMref() {
    if (typeof SIM !== 'undefined' && SIM) return SIM;
    if (typeof window !== 'undefined' && window.SIM) return window.SIM;
    return {};
  }

  /** 配置指纹：任何会影响能力的参数变了就重测（缓存失效） */
  function cfgKey(S) {
    const ax = (a) => [
      a && a.kS, a && a.cR, a && a.kT, a && a.mU, a && a.mS,
      a && a.arb && a.arb.d, a && a.arb && a.arb.t,
    ].join(',');
    const q = (S && S.qs) || {};
    /* 2026-11-20（N1）：质量必须用**真实字段** `mTotal`（预设里没有 `S.m`）。
       旧式写 `S && S.m` ⇒ 指纹里恒为 "undefined"，用户只改总质量时缓存不失效，
       能力表会沿用旧测值。同理去掉不存在的 `S.tire` / `S.powertrain` 探测。 */
    const _tR = (a) => (a && a.tire && a.tire.R) || 0;
    /* ★ 2026-11-20（性能档位）：**胎种与动力必须进指纹**。
       旧实现只含轮胎半径（几何），换配方/换档位时缓存不失效 ⇒ 能力表沿用旧测值，
       表现为"界面换了 T5 顶级胎，圈速与判定完全不变"（实测 T3/T4/T5 圈速差 <0.2 s）。
       真源取 `SIM.userTire`（性能档位写入点）与 `POWERTRAIN.spec` 的峰值扭矩。 */
    let _ut = null;
    try {
      if (typeof SIM !== 'undefined' && SIM && SIM.userTire) _ut = SIM.userTire;
      else if (typeof window !== 'undefined' && window.SIM && window.SIM.userTire) _ut = window.SIM.userTire;
    } catch (e) { _ut = null; }
    let _peak = 0;
    try {
      const _sp = (typeof POWERTRAIN !== 'undefined' && POWERTRAIN && POWERTRAIN.spec) || null;
      if (_sp && _sp.ice && Array.isArray(_sp.ice.map)) {
        _peak = _sp.ice.map.reduce((m, r) => Math.max(m, Number(r[1]) || 0), 0);
      }
    } catch (e) { _peak = 0; }
    return [
      (S && S.vehicleType) || '?',
      (S && S.mTotal) || 0, (S && S.mSprung) || 0,
      S && S.wb, S && S.hcg, S && S.hs,
      ax(S && S.front), ax(S && S.rear),
      q.aeroF, q.speed,
      Math.max(_tR(S && S.front), _tR(S && S.rear)),
      _ut ? [_ut.Fy0, _ut.By, _ut.LS, _ut.Cg, _ut.Ls].join(',') : 'dt',
      _peak,
    ].join('|');
  }

  /** 横向极限：稳态定圆扫角，取饱和峰值（气动在此速度下可忽略）
   *
   * ⚠ 2026-11-20 修正两处：
   *   ① 早期版本每步强制 `state.u = u0`（准稳态 hack）⇒ 假抓地 1.085 g。
   *   ② 自己写速度保持器与 LAT_BENCH 的控制器不同 ⇒ 偏高 4%。
   *   现**优先复用 `LAT_BENCH.steadyCircle`**（已有锚的稳态定圆实现），
   *   拿不到时才退回内部简化实现。
   *   实测（formula）：13 m/s 峰值 1.083 g、17 m/s 峰值 1.141 g —— 取高者。
   *   注：用户口头引用的 "0.860 g" 是**5° 转向那一点**的读数，不是峰值。 */
  function measureLateral(Ctor, S, dt) {
    const LB = (typeof window !== 'undefined' && window.LAT_BENCH)
      ? window.LAT_BENCH
      : ((typeof LAT_BENCH !== 'undefined') ? LAT_BENCH : null);

    if (LB && typeof LB.steadyCircle === 'function') {
      let best = 0, bestAt = null;
      for (const speed of [16]) {
        for (const st of [7, 9, 11, 13]) {
          const r = LB.steadyCircle({ speed: speed, steerDeg: st, dur: 6, avgSecs: 2 });
          const ayG = r && r.metrics ? r.metrics.ayG : NaN;
          if (isFinite(ayG) && ayG > best) { best = ayG; bestAt = { u0: speed, st: st, ayG: ayG }; }
        }
      }
      if (best > 0) return { ay0: best, at: bestAt, via: 'LAT_BENCH' };
    }

    /* 兜底：内部简化扫角（无 LAT_BENCH 时） */
    let best = 0, bestAt = null;
    for (const u0 of [13, 16]) {
      for (const st of [7, 9, 11, 13]) {
        const car = new Ctor(S, SIMref(), u0);
        const n = Math.round(6.0 / dt);
        let sum = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
          const thr = Math.max(0, Math.min(1, 0.5 + 0.15 * (u0 - car.state.u)));
          car.step({ steer: st, throttle: thr, brake: 0, drs: false }, ENV_FLAT, dt);
          if (i >= n * 0.6) {
            const ay = Math.abs(car.state.u * car.state.r);
            if (isFinite(ay)) { sum += ay; cnt++; }
          }
        }
        if (!cnt) continue;
        const ay = sum / cnt;
        if (ay > best) { best = ay; bestAt = { u0, st, ayG: ay / G }; }
      }
    }
    return { ay0: best / G, at: bestAt, via: 'internal' };
  }

  /** 直线制动：全力踩刹车，取稳定窗内的平均减速度 */
  /** 直线制动：多点实测（2026-11-20 改）
   *
   * 早期版本只测 22/30 m/s 两点的最大值，然后 `brake(v) = brk0 · (1+F_down/W)`
   * 用**解析气动增益**外推高速——实测该外推高估 16%（gt3 @70 m/s：预测 15.6，
   * 实车 13.4 m/s²）。后果：剖面以为高速刹得住，实跑刹不住 ⇒ 长直末端冲出赛道
   * （实测第 2 圈 T1 处侧偏 78.5°）。改为与加速同理的**多点实测分段线性插值**。 */
  function measureBrake(Ctor, S, dt) {
    const at = (u0) => {
      const car = new Ctor(S, SIMref(), u0);
      const nSettle = Math.round(0.4 / dt);
      for (let i = 0; i < nSettle; i++) car.step(CTRL_ZERO, ENV_FLAT, dt);
      const n = Math.round(1.2 / dt);
      const uA = car.state.u;
      for (let i = 0; i < n; i++) car.step({ steer: 0, throttle: 0, brake: 1, drs: false }, ENV_FLAT, dt);
      const decel = (uA - car.state.u) / 1.2;
      return (isFinite(decel) && decel > 0.3) ? decel : NaN;
    };
    const pts = [];
    for (const u0 of [25, 45, 65, 85]) {
      const a = at(u0);
      if (isFinite(a)) pts.push({ v: u0, a: a });
    }
    if (!pts.length) return { best: 6.0, pts: [{ v: 25, a: 6.0 }] };
    pts.sort((p, q) => p.v - q.v);
    let best = 0;
    for (const p of pts) best = Math.max(best, p.a);
    return { best: best, pts: pts };
  }

  /** 直线加速：多点实测（2026-11-20 改）
   *
   * 早期版本只测 8 / 42 m/s 两点，然后用 `accHi·vHi/v` 外推功率段——
   * 实测偏差很大（剖面假设 4.33 m/s²，实跑 ~2.7），导致包络在直道上过分乐观。
   * 现改为在 10 / 25 / 40 / 60 m/s 四点实测，`accel(v)` 用**分段线性插值**，
   * 超出范围按端点外推（低速用首段斜率、高速用末段斜率，且不为负）。 */
  function measureAccel(Ctor, S, dt) {
    const at = (u0, secs) => {
      const car = new Ctor(S, SIMref(), u0);
      const n = Math.round(secs / dt);
      const uA = car.state.u;
      let ok = true;
      for (let i = 0; i < n; i++) {
        car.step({ steer: 0, throttle: 1, brake: 0, drs: false }, ENV_FLAT, dt);
        if (!isFinite(car.state.u)) { ok = false; break; }
      }
      return ok ? (car.state.u - uA) / secs : NaN;
    };
    const pts = [];
    for (const u0 of [10, 25, 40, 60]) {
      const a = at(u0, 1.8);
      if (isFinite(a) && a > 0.05) pts.push({ v: u0, a: a });
    }
    if (!pts.length) return { pts: [{ v: 10, a: 1.0 }], acc0: 1.0, accHi: 0, vHi: 42 };
    pts.sort((p, q) => p.v - q.v);
    return {
      pts: pts,
      acc0: pts[0].a,
      accHi: pts[pts.length - 1].a,
      vHi: pts[pts.length - 1].v
    };
  }

  /** 分段线性插值加速能力（v → m/s²），端点按相邻段斜率外推且下限 0.3 */
  function accelAt(pts, v) {
    if (!pts || !pts.length) return 1.0;
    const n = pts.length;
    if (n === 1) return pts[0].a;
    let a;
    if (v <= pts[0].v) {
      const k = (pts[1].a - pts[0].a) / (pts[1].v - pts[0].v);
      a = pts[0].a + k * (v - pts[0].v);
    } else if (v >= pts[n - 1].v) {
      const k = (pts[n - 1].a - pts[n - 2].a) / (pts[n - 1].v - pts[n - 2].v);
      a = pts[n - 1].a + k * (v - pts[n - 1].v);
    } else {
      a = pts[n - 1].a;
      for (let i = 1; i < n; i++) {
        if (v <= pts[i].v) {
          const t = (v - pts[i - 1].v) / Math.max(1e-9, pts[i].v - pts[i - 1].v);
          a = pts[i - 1].a + t * (pts[i].a - pts[i - 1].a);
          break;
        }
      }
    }
    return Math.max(0.3, a);
  }

  /** 气动下压力（N）——与 10b step() 同式：aeroF·(v/vRef)² */
  function aeroDown(S, v) {
    const q = (S && S.qs) || {};
    const aeroF = (typeof q.aeroF === 'number' && isFinite(q.aeroF)) ? q.aeroF : 500;
    const vRef = (typeof q.speed === 'number' && isFinite(q.speed) ? q.speed : 160) * (1000 / 3600);
    if (!(vRef > 0)) return 0;
    return aeroF * (v * v) / (vRef * vRef);
  }

  /**
   * 实测并缓存能力表。返回 null 表示不具备测量条件（无 15-DOF / 无配置）。
   * @param {{dt?:number, force?:boolean}} [opts]
   */
  function measure(opts) {
    const o = opts || {};
    const Ctor = V();
    const S = Sref();
    if (!Ctor || !S || !S.front) return null;
    const key = cfgKey(S);
    if (!o.force && _cache && _cacheKey === key) return _cache;

    const dt = o.dt || 0.002;
    const lat = measureLateral(Ctor, S, dt);
    const brk = measureBrake(Ctor, S, dt);
    const acc = measureAccel(Ctor, S, dt);
    /* 质量口径与内核一致（`10b`: this.m = max(150, S_config.mTotal || 1000)）。
       ⚠ 2026-11-20 修正：早期取 `S.m`（预设里根本没有这个字段）⇒ 恒回落 235 kg，
       于是气动增益 `1 + F_down/W` 对 gt3 被放大 5 倍（W 本该 12.3 kN 却按 2.3 kN 算），
       实测 gt3 加速极限在 50 m/s 处谎报 4.39 m/s²（真值 ~2.2）。 */
    const m = Math.max(150,
      (typeof S.mTotal === 'number' && S.mTotal > 0) ? S.mTotal : 1000);
    const W = m * G;

    _cache = {
      source: 'car',
      ay0: lat.ay0, ayAt: lat.at,
      brk0: brk.best, brkPts: brk.pts, acc0: acc.acc0, accHi: acc.accHi, vHi: acc.vHi, accPts: acc.pts,
      m: m, W: W,
      measuredAt: { dt: dt }
    };
    _cacheKey = key;
    return _cache;
  }

  /**
   * 给 CircuitPath 用的封装：返回 v 相关的三个极限函数。
   * @returns {{source:string, lateral:function, brake:function, accel:function, cap:object}|null}
   */
  function forPath() {
    const cap = measure();
    if (!cap) return null;
    const S = Sref() || {};
    const W = cap.W || 1;
    const gain = (v) => 1 + aeroDown(S, Math.max(0, v || 0)) / W;
    return {
      source: 'car',
      cap: cap,
      /** 横向加速度上限（m/s²）——按用户决策用峰值 ay 口径 */
      lateral: (v) => cap.ay0 * G * gain(v),
      /** 制动减速度上限（m/s²） */
      /* 制动：四点实测分段线性插值（不再用解析气动增益——实测高估 16%） */
      brake: (v) => accelAt(cap.brkPts, Math.max(1, v || 1)),
      /** 加速上限（m/s²）：四点实测分段线性插值（附气动增益） */
      accel: (v) => accelAt(cap.accPts, Math.max(1, v || 1)) * gain(v)
    };
  }

  function invalidate() { _cache = null; _cacheKey = ''; }
  function peek() { return _cache; }

  return {
    measure: measure,
    forPath: forPath,
    invalidate: invalidate,
    peek: peek,
    _aeroDown: aeroDown
  };
})();
if (typeof window !== 'undefined') window.CAR_CAPABILITY = CAR_CAPABILITY;
