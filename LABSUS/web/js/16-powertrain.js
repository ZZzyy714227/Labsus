/* =====================================================================
   16-powertrain.js — G31 动力工坊（2026-09-05）
   段1 数据模型/校验/默认(legacy-equivalent)/状态/mapLookup
   段2 动力源(ICE/Motor) 段3 传动链 段4 电池 段5 组合器+step 段6 UI
   设计：docs/superpowers/specs/2026-09-05-powertrain-design.md
   计划：docs/superpowers/plans/2026-09-05-powertrain.md
   legacy 等价锚：默认规格轮上扭矩 == 旧常数（后 480 / 前 120，未乘 drivePowerFactor）
     曲轴 map 平直 1200 N·m × ratio(1) × final(1) = 轴 1200
     → splitFront 0.2 → 前轴 240（轮 120）/ 后轴 960（轮 480）
   F-61：window 导出与定义同文件
   ===================================================================== */
"use strict";
const POWERTRAIN = {
  spec: null, state: null, customs: {},
  defaultSpec() {
    return {
      architecture: "ice", drive: "awd_fixed", splitFront: 0.2,
      ice: { cyl: 8, layout: "V8", dispL: 4.0, idleRpm: 800, redlineRpm: 9000, fuelCutRpm: 9200,
             map: [[800, 1200], [2000, 1200], [5000, 1200], [9000, 1200]],
             fricA: 0, fricB: 0, fricC: 0, inertia: 0, throttleTau: 0 },
      motorF: null, motorR: null,
      battery: null,
      gearbox: { type: "manual", ratios: [1], finalDrive: 1, shiftTimeMs: 0, eff: 1.0,
                 autoUpFrac: 0.92, autoDownFrac: 0.55 },
      diff: { type: "open", bias: 1.0, lockNm: 0 }
    };
  },
  validate(sp) {
    const errs = [];
    if (!sp || typeof sp !== "object") return { ok: false, errors: ["spec(null or not object)"] };
    if (!["ice","ev","p2","p3","p4","series","powersplit"].includes(sp.architecture)) errs.push("architecture");
    if (!["fwd","rwd","awd_fixed","awd_center","tv"].includes(sp.drive)) errs.push("drive");
    if (!(sp.splitFront >= 0 && sp.splitFront <= 1)) errs.push("splitFront");
    if (sp.ice) {
      if (!Array.isArray(sp.ice.map) || sp.ice.map.length < 2 ||
          sp.ice.map.some(p => !Array.isArray(p) || p.length !== 2 || !(p[0] > 0) || !(p[1] >= 0))) errs.push("ice.map");
      /* I-1：map 转速点必须严格单调递增，否则插值分母可为零或负 */
      if (Array.isArray(sp.ice.map) && sp.ice.map.some((p, i) => i > 0 && !(p[0] > sp.ice.map[i - 1][0]))) errs.push("ice.map(ascending)");
      if (!(sp.ice.idleRpm > 0) || !(sp.ice.redlineRpm > sp.ice.idleRpm)) errs.push("ice.rpm");
      /* M-2：断油转速必须 ≥ 红线，否则物理上不可达 */
      if (sp.ice.fuelCutRpm !== undefined && !(sp.ice.fuelCutRpm >= sp.ice.redlineRpm)) errs.push("ice.fuelCutRpm");
    }
    if (sp.architecture !== "ev" && !sp.ice) errs.push("ice(required for non-ev)");
    if (sp.architecture === "ev" && sp.ice) errs.push("ice(forbidden for ev)");
    if (sp.architecture === "ice" && (sp.motorF || sp.motorR)) errs.push("motor(forbidden for ice)");
    if (sp.architecture === "ev" && !sp.motorF && !sp.motorR) errs.push("motor(required for ev)");
    if (sp.drive === "tv" && !(sp.motorF && sp.motorR)) errs.push("tv(requires motorF & motorR)");
    /* M-3：混动架构必须至少一台电机 */
    if (["p2","p3","p4","series","powersplit"].includes(sp.architecture) && !sp.motorF && !sp.motorR) errs.push("motor(required for hybrid)");
    if (sp.gearbox) {
      if (!Array.isArray(sp.gearbox.ratios) || sp.gearbox.ratios.length < 1 ||
          sp.gearbox.ratios.some(r => !(r > 0))) errs.push("gearbox.ratios");
      if (!(sp.gearbox.finalDrive > 0)) errs.push("gearbox.finalDrive");
      if (!(sp.gearbox.shiftTimeMs >= 0)) errs.push("gearbox.shiftTimeMs");
    }
    for (const k of ["motorF", "motorR"]) if (sp[k]) {
      if (!(sp[k].peakTorqueNm > 0) || !(sp[k].peakPowerKw > 0) || !(sp[k].maxRpm > 0)) errs.push(k);
      /* I-1：baseRpm 一致性校验——若提供则必须与 P/T 拐点匹配（±5%） */
      if (sp[k].baseRpm !== undefined && sp[k].peakTorqueNm > 0 && sp[k].peakPowerKw > 0) {
        const knee = 30 * sp[k].peakPowerKw * 1000 / (Math.PI * sp[k].peakTorqueNm);
        if (Math.abs(sp[k].baseRpm - knee) / sp[k].baseRpm >= 0.05) errs.push(`${k}.baseRpm(inconsistent with P/T)`);
      }
    }
    if (sp.battery) {
      if (!(sp.battery.capacityKwh > 0)) errs.push("battery.capacityKwh");
      if (sp.battery.soc0 !== undefined && !(sp.battery.soc0 >= 0 && sp.battery.soc0 <= 1)) errs.push("battery.soc0");
    }
    /* Task4 审查修复：电气化架构（ev + 含 motor 的混动 p2/p3/p4/series/powersplit）必须携带 battery，
       否则段5 组合器的 SOC 积分/充放钳制无落点，能量流不守恒。 */
    if (sp.architecture === "ev" && !sp.battery) errs.push("battery(required for electrified)");
    if (["p2","p3","p4","series","powersplit"].includes(sp.architecture) &&
        (sp.motorF || sp.motorR) && !sp.battery) errs.push("battery(required for electrified)");
    return { ok: errs.length === 0, errors: errs };
  },
  setSpec(sp) {
    const v = this.validate(sp);
    if (!v.ok) return v;
    this.spec = JSON.parse(JSON.stringify(sp));
    this.resetState();
    return v;
  },
  resetState() {
    const sp = this.spec || this.defaultSpec();
    this.state = {
      /* M-1：EV 无曲轴，iceOmega 置 0（非 EV 无 ice 时同样置 0，不伪造怠速）；
         下游组合器（段5）不得对该值做除法或扭矩计算 */
      iceOmega: (sp.architecture !== "ev" && sp.ice) ? sp.ice.idleRpm * Math.PI / 30 : 0,
      gearIdx: 0, shiftT: 0, shiftDir: 0,
      soc: sp.battery ? (sp.battery.soc0 !== undefined ? sp.battery.soc0 : 0.8) : 1,
      thrSm: 0
    };
  },
  /* 扭矩 map 查表：控制点线性插值，端点外钳位 */
  mapLookup(map, x) {
    if (!Array.isArray(map) || map.length === 0) return 0;
    if (x <= map[0][0]) return map[0][1];
    for (let i = 1; i < map.length; i++) {
      if (x <= map[i][0]) {
        const x0 = map[i - 1][0], y0 = map[i - 1][1], x1 = map[i][0], y1 = map[i][1];
        return y0 + (y1 - y0) * (x - x0) / Math.max(1e-9, x1 - x0);
      }
    }
    return map[map.length - 1][1];
  },
  /* ICE 曲轴扭矩：map×cmd − 摩擦/泵气损失。
     断油（rpm>fuelCut）后驱动=0 但摩擦保留 → 负扭矩=发动机制动。
     摩擦随油门减小而占比升高（泵气损失在节气门关闭时最大）：
       fric_eff = fric × (0.35 + 0.65×(1−c_eff))
     M-3：0.35 = WOT 机械摩擦占比经验值；0.65 = 泵气损失占比，可后续替换为 MAP 模型。
     断油时节气门视为全关（c_eff=0）→ 满泵气损失，与"节气门关闭时最大"一致。 */
  iceTorque(rpm, cmd) {
    const ice = this.spec ? this.spec.ice : null;
    if (!ice) return 0;
    const c = Math.max(0, Math.min(1, cmd));
    const tMap = this.mapLookup(ice.map, rpm);
    const fric = (ice.fricA || 0) + (ice.fricB || 0) * rpm + (ice.fricC || 0) * rpm * rpm;
    const cut = rpm > (ice.fuelCutRpm !== undefined ? ice.fuelCutRpm : 1e9);
    const drive = cut ? 0 : tMap * c;
    const c_eff = cut ? 0 : c;
    return drive - fric * (0.35 + 0.65 * (1 - c_eff));
  },
  /* Motor 扭矩：恒扭矩区(rpm<base)→恒功率区(T=P/ω)。
     cmd<0 = 回收：受 regenMaxKw 与 SOC 双重限制。
     SOC 降额：放电 soc<0.2 线性降额至 0（soc=0.05 截止）；回收 soc>0.95 线性降额。
     M-2：支持负 rpm（反转）——ω 取绝对值，扭矩乘 sgn(rpm)。 */
  motorTorque(motor, rpm, cmd, soc) {
    /* I-2：NaN 防护——缺少有效 peakTorqueNm/peakPowerKw 时直接返回 0 */
    if (!motor || !(motor.peakTorqueNm > 0) || !(motor.peakPowerKw > 0)) return 0;
    const wAbs = Math.max(1, Math.abs(rpm) * Math.PI / 30);
    const sgn = (rpm < 0) ? -1 : 1;
    const Tp = motor.peakPowerKw * 1000 / wAbs;
    const cap = Math.min(motor.peakTorqueNm, Tp);
    if (cmd >= 0) {
      let derate = 1;
      if (soc !== undefined && soc < 0.2) derate = Math.max(0, (soc - 0.05) / 0.15);
      return cap * Math.min(1, cmd) * derate * sgn;
    }
    const Rcap = Math.min(cap, (motor.regenMaxKw !== undefined ? motor.regenMaxKw : motor.peakPowerKw) * 1000 / wAbs);
    let derate = 1;
    if (soc !== undefined && soc > 0.95) derate = Math.max(0, (1 - soc) / 0.05);
    return -Rcap * Math.min(1, -cmd) * derate * sgn;
  },
  /* ═══ 段3 传动链：gearbox 换挡状态机 + 反射惯量 ═══
     反射到轮端的旋转惯量（kg·m²/轮）：(I_ice + I_motCoupled)×(ratio×final)²/2轮。
     legacy 默认 inertia=0 → 0，15-DOF 的 Iw 不变（等价锚）。
     p2 架构电机在 ICE 与 gearbox 之间同轴 → 计入；p3/p4/ev 电机不在曲轴链 → 不计。 */
  reflectedInertia() {
    const sp = this.spec, st = this.state;
    if (!sp || !st || !sp.gearbox) return 0;
    const r = (sp.gearbox.ratios[st.gearIdx] || 1) * sp.gearbox.finalDrive;
    let I = sp.ice ? (sp.ice.inertia || 0) : 0;
    if (sp.architecture === "p2") {
      I += (sp.motorF ? (sp.motorF.inertia || 0) : 0) + (sp.motorR ? (sp.motorR.inertia || 0) : 0);
    }
    return I * r * r / 2;
  },
  /* 换挡状态机推进（每子步调用）。返回 true = 本子步处于扭矩中断期。
     完成时：gearIdx += shiftDir、iceOmega 跳变 = wheelOmegaAxle×ratio_new×final
     （刚性传动链运动学耦合；离合器结合瞬态不做半联动物理，见设计非目标）。 */
  advanceGearbox(dt, wheelOmegaAxle) {
    const sp = this.spec, st = this.state;
    if (!sp || !st || !sp.gearbox) return false;
    /* M：dt 必须有限，否则 shiftT -= NaN 会把状态机推入 NaN 死锁 */
    if (!Number.isFinite(dt)) return false;
    if (st.shiftT > 0) {
      st.shiftT -= dt * 1000;
      if (st.shiftT <= 0) {
        st.gearIdx = Math.max(0, Math.min(sp.gearbox.ratios.length - 1, st.gearIdx + st.shiftDir));
        st.shiftDir = 0; st.shiftT = 0;
        st.iceOmega = (wheelOmegaAxle || 0) * (sp.gearbox.ratios[st.gearIdx] || 1) * sp.gearbox.finalDrive;
      }
      return true;
    }
    return false;
  },
  /* 换挡请求（dir=+1 升 / −1 降）。越界或正在换挡时忽略（幂等，无副作用）。 */
  requestShift(dir) {
    const sp = this.spec, st = this.state;
    /* M：dir 定义域守卫——仅允许 +1/−1，其他值（0/2/NaN/字符串）一律拒绝，
       避免 ni = gearIdx + 2 造成的跳挡与 shiftDir=0 的“永久换挡中”死锁。 */
    if (dir !== 1 && dir !== -1) return;
    if (!sp || !st || !sp.gearbox || st.shiftT > 0) return;
    const ni = st.gearIdx + dir;
    if (ni < 0 || ni >= sp.gearbox.ratios.length) return;
    st.shiftDir = dir;
    st.shiftT = Math.max(1, sp.gearbox.shiftTimeMs || 1);
  },
  /* 自动换挡策略（白名单：仅 type=auto/dct）：rpm/redline 超 autoUpFrac 升、低于 autoDownFrac 降。
     白名单语义：未知/未声明的 gearbox.type（undefined、"cvt"、"AUTO" 等）一律不自动换挡，
     由 requestShift 显式驱动；EV 无 ICE 时红线回退到 motorR/motorF 的 maxRpm。 */
  autoShift(iceRpm) {
    const sp = this.spec, st = this.state;
    if (!sp || !st || !sp.gearbox) return;
    if (sp.gearbox.type !== "auto" && sp.gearbox.type !== "dct") return;
    if (st.shiftT > 0) return;
    const red = (sp.ice ? sp.ice.redlineRpm : (sp.motorR ? sp.motorR.maxRpm : (sp.motorF ? sp.motorF.maxRpm : 9000)));
    const rr = iceRpm / red;
    if (rr > (sp.gearbox.autoUpFrac !== undefined ? sp.gearbox.autoUpFrac : 0.92) &&
        st.gearIdx < sp.gearbox.ratios.length - 1) this.requestShift(1);
    else if (rr < (sp.gearbox.autoDownFrac !== undefined ? sp.gearbox.autoDownFrac : 0.55) && st.gearIdx > 0) this.requestShift(-1);
  },
  /* 电池 SOC 积分：dSoc = −P_net·dt/(cap×3.6e6)。P_net>0=放电、<0=充电。
     钳位 [0,1]；无 battery / 非有限输入 → no-op（失效安全）。
     充放功率上限（maxDischargeKw/maxChargeKw）由调用方（段 5 组合器）在
     计算 P_net 前钳制——本方法只做积分，保持单一职责。 */
  integrateBattery(P_net_W, dt) {
    const b = this.spec ? this.spec.battery : null;
    const st = this.state;
    if (!b || !st) return;
    if (!Number.isFinite(P_net_W) || !Number.isFinite(dt)) return;
    /* Task4 审查修复：dt 必须为正（dt=0/负 → no-op，避免零步长或倒流积分） */
    if (!(dt > 0)) return;
    /* Task4 审查修复：soc 已损坏（NaN/Infinity）时不再积分，防止污染扩散 */
    if (!Number.isFinite(st.soc)) return;
    st.soc = Math.max(0, Math.min(1, st.soc - P_net_W * dt / (b.capacityKwh * 3.6e6)));
  },
  /* ═══ 段5 组合器 + step 主循环 ═══
     step(dt, demand, wheelOmega)：每子步调用一次（在 15-DOF 轮循环之前）。
       demand     = { throttle, brake, shiftCmd?, tvBias? }
       wheelOmega = { FL, FR, RL, RR }（rad/s）
     返回 { tFront, tRear, tWheel|null, iceRpm, gearIdx, soc, shifting, P_gen }
       tFront/tRear = 单轮驱动扭矩（轴扭矩 / 2，与 legacy 常数 480/120 同量纲，未乘 drivePowerFactor）
       tWheel       = 仅 drive==='tv' 时逐轮 [FL,FR,RL,RR]，否则 null
       P_gen        = ICE 发电功率（W，仅 series/powersplit > 0）
     tWheel 为逐轮扭矩（不再 /2）；tFront/tRear 为轴扭矩/2——接线层勿对 tWheel 再除 2。
     七架构功率流见各 case 注释。TCS 不在本层（接线层按轮滑移切 throttle）。 */
  step(dt, demand, wheelOmega) {
    const sp = this.spec || this.defaultSpec();
    if (!this.state) this.resetState();
    const st = this.state;
    const g = sp.gearbox || { ratios: [1], finalDrive: 1, eff: 1, type: "manual" };
    const dm = demand || {}, wo = wheelOmega || {};
    /* 轴平均轮速（rad/s） */
    const wF = 0.5 * ((wo.FL || 0) + (wo.FR || 0));
    const wR = 0.5 * ((wo.RL || 0) + (wo.RR || 0));
    const iceAxleW = (sp.drive === "fwd") ? wF : wR;   // ICE 运动学耦合参考轴
    const thr = Math.max(0, Math.min(1, dm.throttle || 0));
    const brk = Math.max(0, Math.min(1, dm.brake || 0));
    /* 电机指令：油门驱动为正；制动强于油门时反转矩回收（regen） */
    const motCmd = (brk > thr) ? -brk : thr;
    /* 油门一阶惯性（throttleTau）；tau→0.001 时单步即达目标（legacy 等价锚要求瞬时响应） */
    const tau = Math.max(0.001, sp.ice ? (sp.ice.throttleTau || 0) : 0);
    if (Number.isFinite(dt)) st.thrSm += (thr - st.thrSm) * Math.min(1, dt / tau);
    const cmd = Math.max(0, Math.min(1, st.thrSm));
    /* 显式换挡请求（仅 +1/−1 生效，requestShift 内自守卫） */
    if (dm.shiftCmd === 1 || dm.shiftCmd === -1) this.requestShift(dm.shiftCmd);
    /* 换挡状态机推进：返回 true = 本子步处于扭矩中断期 */
    const shifting = this.advanceGearbox(dt, iceAxleW);
    const ratio = (g.ratios[st.gearIdx] || 1) * (g.finalDrive !== undefined ? g.finalDrive : 1);
    const eff = g.eff !== undefined ? g.eff : 1;
    /* 刚性传动链运动学耦合：非 series/powersplit 且非换挡期 → iceOmega = 轴轮速 × 总传动比。
       series/powersplit 的 ICE 与轮无刚性耦合，转速由下方发电控制律决定。 */
    if (!shifting && sp.ice && sp.architecture !== "series" && sp.architecture !== "powersplit") {
      st.iceOmega = iceAxleW * ratio;
    }
    /* 电机转速（rpm）：p2 电机在曲轴链 → iceOmega 换算；其余电机直驱/箱后 → 对应轴轮速换算 */
    const rpmF = (sp.architecture === "p2") ? st.iceOmega * 30 / Math.PI : wF * 30 / Math.PI;
    const rpmR = (sp.architecture === "p2") ? st.iceOmega * 30 / Math.PI : wR * 30 / Math.PI;
    let T_motF = 0, T_motR = 0;
    if (sp.motorF) T_motF = this.motorTorque(sp.motorF, rpmF, motCmd, st.soc);
    if (sp.motorR) T_motR = this.motorTorque(sp.motorR, rpmR, motCmd, st.soc);
    /* C1：电机消耗电功率（W）：p2 电机在曲轴链 → 参考 iceOmega；其余在轮端 → wF/wR */
    const wMotF = (sp.architecture === "p2") ? st.iceOmega : wF;
    const wMotR = (sp.architecture === "p2") ? st.iceOmega : wR;
    /* I2：电池功率上限反馈——在组合器前对电机扭矩做功率钳制 */
    const pLim = (sp.battery && sp.battery.maxDischargeKw !== undefined) ? sp.battery.maxDischargeKw * 1000 : Infinity;
    const pMotRaw = Math.abs(T_motF * wMotF) + Math.abs(T_motR * wMotR);
    if (pMotRaw > pLim && pMotRaw > 0) {
      const scale = pLim / pMotRaw;
      T_motF *= scale; T_motR *= scale;
    }
    const P_mot = (T_motF * wMotF + T_motR * wMotR) / 0.95;
    /* series/powersplit：ICE 转速不跟轮速，按增程/功率分流控制律。
       iceOmega = max(idle, min(redline, idle + (P_demand/P_rated)×(redline−idle)))，P_demand = 电机消耗功率估计。 */
    if ((sp.architecture === "series" || sp.architecture === "powersplit") && sp.ice) {
      const idle = sp.ice.idleRpm * Math.PI / 30, red = sp.ice.redlineRpm * Math.PI / 30;
      let P_rated = 0;
      if (Array.isArray(sp.ice.map)) for (const p of sp.ice.map) P_rated = Math.max(P_rated, p[1] * p[0] * Math.PI / 30);
      if (!(P_rated > 0)) P_rated = 1;
      const P_demand = Math.max(0, P_mot);
      st.iceOmega = Math.max(idle, Math.min(red, idle + (P_demand / P_rated) * (red - idle)));
    }
    const iceRpm = st.iceOmega * 30 / Math.PI;
    this.autoShift(iceRpm);   // 自守卫：仅 gearbox.type=auto/dct 生效
    /* ICE 曲轴扭矩（换挡中断期置 0） */
    const T_ice = (sp.ice && !shifting) ? this.iceTorque(iceRpm, cmd) : 0;
    const T_ice_wheel = shifting ? 0 : T_ice * ratio * eff;   // ICE 经变速箱到轴的扭矩
    /* ── 七架构组合器 → 轴扭矩 Tf/Tr（N·m/轴） ── */
    let Tf = 0, Tr = 0, P_gen = 0;
    switch (sp.architecture) {
      case "ice":
        /* 单动力源经 gearbox；fwd/rwd 单轴，awd_* 按 splitFront 前后分裂 */
        if (sp.drive === "fwd") Tf = T_ice_wheel;
        else if (sp.drive === "rwd") Tr = T_ice_wheel;
        else { Tf = T_ice_wheel * sp.splitFront; Tr = T_ice_wheel * (1 - sp.splitFront); }
        break;
      case "ev":
        /* 电机直驱（无 ICE）；drive==='tv' 逐轮在下方 tv 块处理 */
        if (sp.drive === "tv") { /* 见下方 tv 块 */ }
        else if (sp.drive === "fwd") Tf = T_motF;
        else if (sp.drive === "rwd") Tr = T_motR;
        else { Tf = T_motF; Tr = T_motR; }
        break;
      case "p2": {
        /* I1：电机在 ICE 与 gearbox 之间同轴：T_shaft = (T_ice + T_motF + T_motR)×ratio×eff；换挡期整轴切断 */
        const Ts = (T_ice + T_motF + T_motR) * ratio * eff * (shifting ? 0 : 1);
        if (sp.drive === "fwd") Tf = Ts;
        else if (sp.drive === "rwd") Tr = Ts;
        else { Tf = Ts * sp.splitFront; Tr = Ts * (1 - sp.splitFront); }
        break;
      }
      case "p3": {
        /* I1：电机在箱后（与 ICE 输出并联到轮）：T_axle = T_ice×ratio×eff + T_motF + T_motR */
        const Ta = T_ice_wheel + T_motF + T_motR;
        if (sp.drive === "fwd") Tf = Ta;
        else if (sp.drive === "rwd") Tr = Ta;
        else { Tf = Ta * sp.splitFront; Tr = Ta * (1 - sp.splitFront); }
        break;
      }
      case "p4": {
        /* ICE 驱一轴 + 电机驱另一轴（through-the-road）；awd_x/tv 时 ICE 轴扭矩按 splitFront 分裂 */
        const iceF = (sp.drive === "fwd") ? 1 : (sp.drive === "rwd") ? 0 : sp.splitFront;
        const iceR = (sp.drive === "fwd") ? 0 : (sp.drive === "rwd") ? 1 : (1 - sp.splitFront);
        Tf = T_ice_wheel * iceF + (sp.motorF ? T_motF : 0);
        Tr = T_ice_wheel * iceR + (sp.motorR ? T_motR : 0);
        break;
      }
      case "series":
        /* 增程：轮只由电机驱动；ICE 仅发电 P_gen = max(0,T_ice)×iceOmega×0.9（不接轮） */
        P_gen = Math.max(0, T_ice) * st.iceOmega * 0.9;
        Tf = sp.motorF ? T_motF : 0;
        Tr = sp.motorR ? T_motR : 0;
        break;
      case "powersplit": {
        /* 功率分流（行星排简化）：72% 机械路径到轮，28% 发电；motorB 叠加到轮 */
        const Tmech = T_ice * 0.72 * ratio * eff * (shifting ? 0 : 1);
        P_gen = Math.max(0, T_ice) * 0.28 * st.iceOmega * 0.9;
        if (sp.drive === "fwd") { Tf = Tmech + (sp.motorF ? T_motF : 0); Tr = sp.motorR ? T_motR : 0; }
        else if (sp.drive === "rwd") { Tr = Tmech + (sp.motorR ? T_motR : 0); Tf = sp.motorF ? T_motF : 0; }
        else { Tf = Tmech * sp.splitFront + (sp.motorF ? T_motF : 0); Tr = Tmech * (1 - sp.splitFront) + (sp.motorR ? T_motR : 0); }
        break;
      }
    }
    /* tv 逐轮：tvBias 将前/后电机扭矩分裂到左右轮（守恒：四轮和 = T_motF + T_motR） */
    let tWheel = null;
    if (sp.drive === "tv" && sp.motorF && sp.motorR) {
      /* M1：tvBias 钳位 [0,1]，NaN/undefined 回退 0.5 */
      const b = Math.max(0, Math.min(1, Number.isFinite(dm.tvBias) ? dm.tvBias : 0.5));
      tWheel = [T_motF * b, T_motF * (1 - b), T_motR * b, T_motR * (1 - b)];
      Tf = T_motF; Tr = T_motR;
    }
    /* 电池能量流：P_net = 电机耗电 − ICE 发电；按 maxDischargeKw/maxChargeKw 钳制后积分 SOC */
    let P_net = P_mot - P_gen;
    const bat = sp.battery;
    if (bat) {
      const maxDis = (bat.maxDischargeKw !== undefined ? bat.maxDischargeKw : Infinity) * 1000;
      const maxChg = (bat.maxChargeKw !== undefined ? bat.maxChargeKw : Infinity) * 1000;
      P_net = Math.max(-maxChg, Math.min(maxDis, P_net));
    }
    this.integrateBattery(P_net, dt);
    return { tFront: Tf / 2, tRear: Tr / 2, tWheel, iceRpm, gearIdx: st.gearIdx,
             soc: st.soc, shifting, P_gen };
  }
};
if (typeof window !== "undefined") window.POWERTRAIN = POWERTRAIN;
POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());
