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
    return [
      (S && S.vehicleType) || '?', S && S.m, S && S.wb, S && S.hcg,
      ax(S && S.front), ax(S && S.rear),
      q.aeroF, q.speed, (S && S.tire && S.tire.R),
      (S && S.powertrain && S.powertrain.power_kW) || (S && S.power) || 0,
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
  function measureBrake(Ctor, S, dt) {
    let best = 0;
    for (const u0 of [22, 30]) {
      const car = new Ctor(S, SIMref(), u0);
      const nSettle = Math.round(0.6 / dt);
      for (let i = 0; i < nSettle; i++) car.step(CTRL_ZERO, ENV_FLAT, dt);
      const n = Math.round(1.2 / dt);
      const uA = car.state.u;
      for (let i = 0; i < n; i++) car.step({ steer: 0, throttle: 0, brake: 1, drs: false }, ENV_FLAT, dt);
      const decel = (uA - car.state.u) / 1.2;
      if (isFinite(decel) && decel > best) best = decel;
    }
    return best;
  }

  /** 直线加速：全油门，测低速（附着段）与高速（功率段）两点 */
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
    const lo = at(8, 1.5);
    const hi = at(42, 2.0);
    return { acc0: isFinite(lo) && lo > 0 ? lo : 0, accHi: isFinite(hi) && hi > 0 ? hi : 0, vHi: 42 };
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
    const m = (typeof S.m === 'number' && S.m > 0) ? S.m : 235;
    const W = m * G;

    _cache = {
      source: 'car',
      ay0: lat.ay0, ayAt: lat.at,
      brk0: brk, acc0: acc.acc0, accHi: acc.accHi, vHi: acc.vHi,
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
      brake: (v) => cap.brk0 * gain(v),
      /** 加速上限（m/s²）：低速附着受限、高速功率受限 */
      accel: (v) => {
        const vv = Math.max(1, v || 1);
        const traction = cap.acc0 * gain(vv);
        const power = (cap.accHi > 0) ? cap.accHi * (cap.vHi / vv) : Infinity;
        return Math.min(traction, power);
      }
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
