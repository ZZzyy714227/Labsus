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
  /* I-1(G31-P6)：判断当前规格是否携带真实传动比（非 legacy 恒等箱）。
     legacy 默认 gearbox = { ratios:[1], finalDrive:1 } → 恒等传动 → iceOmega=轮速，
     HUD/声浪若直接读 iceOmega 会塌到轮速/怠速。本方法供下游判据：
     true = 存在真实齿轮比，可信任 iceOmega 作为 rpm 源。 */
  hasRealDrivetrain() {
    const g = this.spec && this.spec.gearbox;
    return !!(g && !(g.ratios.length === 1 && g.ratios[0] === 1 && g.finalDrive === 1));
  },
  /* M-1(G31-P6-fix)：封装 rpm 源判据——architecture==="ev"（直驱，无曲轴/iceOmega
     不可用，rpm 源必须落到驱动轮速）或 hasRealDrivetrain()（存在真实齿轮比，
     iceOmega 可信）二者任一为真时，state.iceOmega/驱动轮速才作为 HUD/声浪 rpm 源。
     13-engine-sound.js（声浪）与 11-stages.js（HUD renderCircuitTelemetry）共用此判据，
     避免两处各写一份、语义漂移。legacy 恒等箱 + 非 EV → false（回退轮速×齿比估算，保对拍锚）。 */
  hasLiveRpmSource() {
    return !!(this.spec && this.state &&
      (this.spec.architecture === "ev" || this.hasRealDrivetrain()));
  },
  /* ═══ 段3 传动链：gearbox 换挡状态机 + 反射惯量 ═══
     反射到轮端的旋转惯量（kg·m²/轮）：(I_ice + I_motCoupled)×(ratio×final)²/nDrive。
     I-2(G31-P6)：nDrive 按驱动轮数归一——awd/tv=4 轮、fwd/rwd=2 轮。
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
    const nDrive = (sp.drive === "awd_fixed" || sp.drive === "awd_center" || sp.drive === "tv") ? 4 : 2;
    return I * r * r / nDrive;
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
       demand     = { throttle, brake, shiftCmd?, tvBias?, tcsRear? }
       wheelOmega = { FL, FR, RL, RR }（rad/s）
     返回 { tFront, tRear, tWheel|null, iceRpm, gearIdx, soc, shifting, P_gen }
       tFront/tRear = 单轮驱动扭矩（轴扭矩 / 2，与 legacy 常数 480/120 同量纲，未乘 drivePowerFactor）
       tWheel       = 仅 drive==='tv' 时逐轮 [FL,FR,RL,RR]，否则 null
       P_gen        = ICE 发电功率（W，仅 series/powersplit > 0）
     tWheel 为逐轮扭矩（不再 /2）；tFront/tRear 为轴扭矩/2——接线层勿对 tWheel 再除 2。
     七架构功率流见各 case 注释。TCS 机械通道不在本层（接线层按轮滑移切轮扭矩）。
     I-3(G31-P6-fix)：dm.tcsRear（默认 1）为 TCS 能量通道——仅缩放 P_mot 中后电机
       贡献（T_motR×tcsRear 进 P_mot，用于 SOC/油耗积分的能量近似守恒），不影响
       tFront/tRear/tWheel 轮扭矩输出（机械通道由接线层轮循环内 tcsScale 单独切）。 */
  step(dt, demand, wheelOmega) {
    const sp = this.spec || this.defaultSpec();
    if (!this.state) this.resetState();
    const st = this.state;
    const g = sp.gearbox || { ratios: [1], finalDrive: 1, eff: 1, type: "manual" };
    const dm = demand || {}, wo = wheelOmega || {};
    /* I-3(G31-P6-fix)：TCS 能量通道——dm.tcsRear（默认 1，钳位 [0,1]，NaN/非数值回退 1）
       仅用于下方 P_mot 中后电机贡献的缩放，不进入任何扭矩输出路径。 */
    const tcsRear = (typeof dm.tcsRear === "number" && Number.isFinite(dm.tcsRear))
      ? Math.max(0, Math.min(1, dm.tcsRear)) : 1;
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
    const P_mot = (T_motF * wMotF + T_motR * tcsRear * wMotR) / 0.95;
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
  },

  /* ═══ 段6 UI：动力工坊弹窗 + 内置预设 + localStorage 持久化 + 下拉集成 ═══
     覆盖层语义（同 G29 轮胎工坊）：不改 VEHICLE_PRESETS / 15-DOF 缺省，只写
     POWERTRAIN.spec（+ S.ptSpec 引用）；「恢复内置」= 回 defaultSpec（legacy-equivalent 锚）。
     G29 教训：弹窗在 appendChild 之前 document.getElementById 取不到内部元素 →
     事件绑定一律走元素级 m.querySelector("#id")；表单值读写走 getElementById
     （open() 时弹窗已入文档、innerHTML 已解析）。
     编辑监听用委托式绑在 modal 根：栏位 innerHTML 重建后监听仍在、且不会重复注册。 */
  MAX_CUSTOMS: 20,
  LS_KEY: "labsus-powertrain-customs",
  _modal: null, _draft: null,
  /* map textarea 校验错误（null = 无错）。readMap 只记录、updateDerived 只渲染——
     单一写者，避免 ⚠ 提示被随后的概要覆盖（M-8）。 */
  _mapErr: null,
  /* 七架构卡片（与 validate 白名单同集） */
  ARCHS: [
    { k: "ice",        zh: "内燃机",   en: "ICE",        hint: "单动力源经变速箱到驱动轴" },
    { k: "ev",         zh: "纯电",     en: "EV",         hint: "电机直驱，无曲轴" },
    { k: "p2",         zh: "P2 并联",  en: "P2",         hint: "电机在 ICE 与变速箱之间同轴" },
    { k: "p3",         zh: "P3 并联",  en: "P3",         hint: "电机在箱后，与 ICE 并联到轮" },
    { k: "p4",         zh: "P4 双轴",  en: "P4",         hint: "ICE 驱一轴 + 电机驱另一轴" },
    { k: "series",     zh: "串联增程", en: "SERIES",     hint: "ICE 只发电，轮只由电机驱动" },
    { k: "powersplit", zh: "功率分流", en: "POWERSPLIT", hint: "行星排：机械路径 + 发电分流" }
  ],
  /* 驱动形式按架构可用性过滤：tv 需 motorF&&motorR（validate 硬约束）→ 仅 ev/p4；
     series 的轮只由电机驱，中央差速无意义 → 不给 awd_center */
  DRIVES: {
    ice:        ["fwd", "rwd", "awd_fixed", "awd_center"],
    ev:         ["fwd", "rwd", "awd_fixed", "awd_center", "tv"],
    p2:         ["fwd", "rwd", "awd_fixed", "awd_center"],
    p3:         ["fwd", "rwd", "awd_fixed", "awd_center"],
    p4:         ["fwd", "rwd", "awd_fixed", "awd_center", "tv"],
    series:     ["fwd", "rwd", "awd_fixed"],
    powersplit: ["fwd", "rwd", "awd_fixed", "awd_center"]
  },
  DRIVE_ZH: { fwd: "前驱 FWD", rwd: "后驱 RWD", awd_fixed: "四驱 固定分裂", awd_center: "四驱 中央差速", tv: "双电机扭矩矢量 TV" },
  GB_TYPES: [["manual", "手动 MT"], ["auto", "自动 AT"], ["dct", "双离合 DCT"], ["seq", "序列式 SEQ"], ["cvt", "无级 CVT"]],
  DIFF_TYPES: [["open", "开放式"], ["lsd", "限滑 LSD"], ["locked", "锁止"]],
  /* 表单缺省块：勾选启用时填入 sane 值（不写 baseRpm——由 P/T 拐点导出） */
  MOTOR_DEF: { peakTorqueNm: 300, peakPowerKw: 150, maxRpm: 12000, regenMaxKw: 100, inertia: 0.1 },
  BAT_DEF: { capacityKwh: 20, soc0: 0.8, maxDischargeKw: 0, maxChargeKw: 0 },   // 0 = 不限

  archZh(k) { const a = this.ARCHS.filter(x => x.k === k)[0]; return a ? a.zh + " " + a.en : String(k || "?"); },
  /* 电机恒扭矩→恒功率拐点（rpm）= 30·P·1000/(π·T) = 9549.3·P/T，与 validate 的 I-1 同式 */
  kneeRpm(m) {
    if (!m || !(m.peakTorqueNm > 0) || !(m.peakPowerKw > 0)) return 0;
    return 30 * m.peakPowerKw * 1000 / (Math.PI * m.peakTorqueNm);
  },
  drivesFor(arch) { const l = this.DRIVES[arch]; return l ? l.slice() : ["fwd", "rwd", "awd_fixed"]; },
  /* 用户可输入的预设名会进 innerHTML / option 文本 → 转义，不信任 localStorage 回读值 */
  _esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  _el(id) { try { return (typeof document !== "undefined") ? document.getElementById(id) : null; } catch (e) { return null; } },
  _setVal(id, v) { const e = this._el(id); if (e) e.value = v; },
  _getVal(id) { const e = this._el(id); return e ? e.value : ""; },
  /* 空/非法输入 → 回退旧值（表单自愈，不把 NaN 写进草稿） */
  _num(id, dflt) { const v = parseFloat(this._getVal(id)); return Number.isFinite(v) ? v : dflt; },
  _setChk(id, b) { const e = this._el(id); if (e) e.checked = !!b; },
  _getChk(id) { const e = this._el(id); return !!(e && e.checked); },
  _show(id, on) { const e = this._el(id); if (e && e.style) e.style.display = on ? "block" : "none"; },

  open() {
    if (!this._modal) {
      this._modal = this.buildModal();
      try { document.body.appendChild(this._modal); } catch (e) { console.warn("POWERTRAIN modal mount failed:", e); }
    }
    /* 草稿 = 当前生效规格的深拷贝：取消即丢弃，应用才 setSpec */
    this._draft = JSON.parse(JSON.stringify(this.spec || this.defaultSpec()));
    this.renderForm();
    if (this._modal && this._modal.style) this._modal.style.display = "flex";
  },
  close() { if (this._modal && this._modal.style) this._modal.style.display = "none"; },

  /* ── 表单控件生成器（样式与轮胎工坊同风格暗色面板） ── */
  _numRow(id, label, step, min, max, unit) {
    return `<label style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin:2px 0;">
      <span style="font:10px var(--font-ui);color:#8b949e;">${label}${unit ? " <i style=\"font-style:normal;color:#6e7681;\">" + unit + "</i>" : ""}</span>
      <input id="${id}" type="number" step="${step}"${min === undefined ? "" : ` min="${min}"`}${max === undefined ? "" : ` max="${max}"`}
        style="width:92px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 5px;font:11px monospace;text-align:right;">
    </label>`;
  },
  _txtRow(id, label, w) {
    return `<label style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin:2px 0;">
      <span style="font:10px var(--font-ui);color:#8b949e;">${label}</span>
      <input id="${id}" type="text" spellcheck="false"
        style="width:${w || 92}px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 5px;font:11px monospace;text-align:right;">
    </label>`;
  },
  _selRow(id, label, opts) {
    return `<label style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin:2px 0;">
      <span style="font:10px var(--font-ui);color:#8b949e;">${label}</span>
      <select id="${id}" style="width:132px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 4px;font:11px var(--font-ui);">
        ${opts.map(o => `<option value="${o[0]}">${this._esc(o[1])}</option>`).join("")}
      </select></label>`;
  },
  _secBox(id, title, body, extra) {
    return `<div${id ? ` id="${id}"` : ""} style="background:#10151d;border:1px solid #21262d;border-radius:8px;padding:7px 9px;margin-bottom:8px;">
      <div style="font:700 11px var(--font-ui);color:#58a6ff;margin-bottom:4px;">${title}${extra || ""}</div>${body}</div>`;
  },

  /* ── 左栏：架构 7 卡片 → 驱动形式 → ICE(+map) → motor×2 → battery ── */
  leftColumnHTML(arch) {
    const cards = this.ARCHS.map(a =>
      `<label title="${this._esc(a.hint)}" style="display:inline-flex;align-items:center;gap:4px;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:3px 7px;margin:2px 2px 0 0;cursor:pointer;">
        <input id="pt_arch_${a.k}" name="pt_arch" type="radio" value="${a.k}" style="margin:0;">
        <span style="font:600 10px var(--font-ui);color:#c9d1d9;">${a.zh}<i style="font-style:normal;color:#6e7681;"> ${a.en}</i></span>
      </label>`).join("");
    const driveOpts = this.drivesFor(arch).map(d => [d, this.DRIVE_ZH[d] || d]);
    const iceBody =
      `<div style="display:flex;gap:8px;">
        <div style="flex:1;">${this._numRow("pt_ice_cyl", "缸数", 1, 1, 16, "")}${this._txtRow("pt_ice_layout", "布局", 60)}${this._numRow("pt_ice_dispL", "排量", 0.05, 0.05, 20, "L")}${this._numRow("pt_ice_inertia", "转动惯量", 0.01, 0, 10, "kg·m²")}${this._numRow("pt_ice_throttleTau", "油门时间常数", 0.01, 0, 2, "s")}</div>
        <div style="flex:1;">${this._numRow("pt_ice_idleRpm", "怠速", 50, 200, 4000, "rpm")}${this._numRow("pt_ice_redlineRpm", "红线", 100, 1000, 25000, "rpm")}${this._numRow("pt_ice_fuelCutRpm", "断油", 100, 1000, 26000, "rpm")}${this._numRow("pt_ice_fricA", "摩擦 A", 0.5, undefined, undefined, "N·m")}${this._numRow("pt_ice_fricB", "摩擦 B", 0.0005, undefined, undefined, "N·m/rpm")}${this._numRow("pt_ice_fricC", "摩擦 C", 1e-7, undefined, undefined, "N·m/rpm²")}</div>
      </div>
      <div style="font:10px var(--font-ui);color:#8b949e;margin:6px 0 2px;">扭矩特性图 map（控制点 JSON，rpm 升序；插值见 mapLookup）</div>
      <textarea id="pt_ice_map" rows="3" spellcheck="false" style="width:100%;box-sizing:border-box;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:4px 6px;font:10px monospace;"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:3px;">
        <span id="pt_ice_mapHint" style="font:10px monospace;color:#8b949e;">格式 [[rpm, N·m], …]</span>
        <button id="ptMapApply" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:5px;padding:2px 9px;cursor:pointer;font:600 10px var(--font-ui);">应用 map</button>
      </div>`;
    return `${this._secBox("", "架构 ARCHITECTURE", `<div>${cards}</div>` + this._selRow("pt_drive", "驱动形式", driveOpts))}
      ${this._secBox("ptSecIce", "内燃机 ICE（曲轴端）", iceBody)}
      ${this._secBox("ptSecMotorF", "前电机 MOTOR-F", this.motorBlockHTML("motorF"))}
      ${this._secBox("ptSecMotorR", "后电机 MOTOR-R", this.motorBlockHTML("motorR"))}
      ${this._secBox("ptSecBat", "电池 BATTERY", this.batteryBlockHTML())}`;
  },
  motorBlockHTML(key) {
    return `<label style="display:inline-flex;align-items:center;gap:5px;margin-bottom:4px;cursor:pointer;">
        <input id="pt_${key}_on" type="checkbox" style="margin:0;"><span style="font:10px var(--font-ui);color:#7ee787;">启用该电机</span>
      </label>` +
      this._numRow(`pt_${key}_peakTorqueNm`, "峰值扭矩", 5, 0, 5000, "N·m") +
      this._numRow(`pt_${key}_peakPowerKw`, "峰值功率", 1, 0, 3000, "kW") +
      this._numRow(`pt_${key}_baseRpm`, "基速（拐点）", 10, 0, 60000, "rpm") +
      this._numRow(`pt_${key}_maxRpm`, "最高转速", 100, 0, 60000, "rpm") +
      this._numRow(`pt_${key}_regenMaxKw`, "回收功率上限", 1, 0, 3000, "kW") +
      this._numRow(`pt_${key}_inertia`, "转动惯量", 0.01, 0, 10, "kg·m²") +
      `<div id="pt_${key}_knee" style="font:10px monospace;color:#8b949e;margin-top:3px;"></div>`;
  },
  batteryBlockHTML() {
    return `<label style="display:inline-flex;align-items:center;gap:5px;margin-bottom:4px;cursor:pointer;">
        <input id="pt_bat_on" type="checkbox" style="margin:0;"><span style="font:10px var(--font-ui);color:#d29922;">携带电池（电气化架构必需）</span>
      </label>` +
      this._numRow("pt_bat_capacityKwh", "容量", 0.5, 0.1, 500, "kWh") +
      this._numRow("pt_bat_soc0", "初始 SOC", 0.05, 0, 1, "0–1") +
      this._numRow("pt_bat_maxDischargeKw", "放电上限（0=不限）", 5, 0, 5000, "kW") +
      this._numRow("pt_bat_maxChargeKw", "充电上限（0=不限）", 5, 0, 5000, "kW");
  },

  /* ── 右栏：内置预设载入 + gearbox（逐行挡位可增删）+ diff + 中央差速 ── */
  rightColumnHTML() {
    const presetNames = Object.keys(POWERTRAIN_PRESETS);
    const presetBody = this._selRow("ptPresetPick", "内置预设", presetNames.map(n => [n, n])) +
      `<button id="ptPresetLoad" style="width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:5px;padding:3px 9px;cursor:pointer;font:600 10px var(--font-ui);margin-top:2px;">载入到草稿（不立即生效）</button>`;
    const gbBody = this._selRow("pt_gb_type", "变速箱类型", this.GB_TYPES) +
      `<div style="font:10px var(--font-ui);color:#8b949e;margin:5px 0 2px;">挡位传动比（逐行编辑）</div>
       <input id="pt_gb_rn" type="hidden">
       <div id="ptRatios"></div>
       <button id="ptRatioAdd" style="width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:5px;padding:2px 9px;cursor:pointer;font:600 10px var(--font-ui);margin-top:3px;">＋ 加一挡</button>` +
      this._numRow("pt_gb_finalDrive", "主减速比", 0.01, 0.05, 30, "") +
      this._numRow("pt_gb_shiftTimeMs", "换挡时间", 5, 0, 2000, "ms") +
      this._numRow("pt_gb_eff", "传动效率", 0.005, 0.5, 1, "") +
      this._numRow("pt_gb_autoUpFrac", "自动升挡转速比", 0.01, 0.05, 1, "×红线") +
      this._numRow("pt_gb_autoDownFrac", "自动降挡转速比", 0.01, 0.02, 1, "×红线");
    const diffBody = this._selRow("pt_diff_type", "差速器类型", this.DIFF_TYPES) +
      this._numRow("pt_diff_bias", "扭矩偏置比", 0.1, 1, 10, "") +
      this._numRow("pt_diff_lockNm", "锁止预紧", 1, 0, 3000, "N·m");
    const centerBody = this._numRow("pt_splitFront", "前轴扭矩分配", 0.01, 0, 1, "0–1");
    return `${this._secBox("", "内置预设 BUILTIN", presetBody)}
      ${this._secBox("", "变速箱 GEARBOX", gbBody)}
      ${this._secBox("", "差速器 DIFF", diffBody)}
      ${this._secBox("ptSecCenter", "中央差速 CENTER（四驱）", centerBody)}`;
  },
  ratiosHTML(n) {
    let rows = "";
    for (let i = 0; i < n; i++) {
      rows += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
        <span style="width:30px;font:10px monospace;color:#8b949e;">${i + 1} 挡</span>
        <input id="pt_gb_r${i}" type="number" step="0.01" min="0.05" style="flex:1;min-width:0;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 5px;font:11px monospace;text-align:right;">
        <button data-pt-rdel="${i}" title="删除该挡" style="background:none;border:1px solid #30363d;color:#f85149;border-radius:4px;padding:0 6px;cursor:pointer;font:11px var(--font-ui);">−</button>
      </div>`;
    }
    return rows;
  },

  buildModal() {
    const m = document.createElement("div");
    m.id = "powertrainModal";
    m.style.cssText = "position:fixed;inset:0;z-index:400;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);";
    m.innerHTML = `<div style="width:880px;max-height:90vh;overflow:auto;background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:16px;color:#e6edf3;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
        <b style="font:700 15px var(--font-ui);">🔧 动力工坊 POWERTRAIN LAB</b>
        <span style="flex:1;font:10px var(--font-ui);color:#8b949e;">架构 · 动力源 · 传动链 · 实时扭矩/功率曲线预览</span>
        <button id="ptClose" style="background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="flex:1;min-width:0;" id="ptLeft"></div>
        <div style="flex:1;min-width:0;" id="ptRight"></div>
      </div>
      <canvas id="ptCurve" width="840" height="190" style="width:100%;height:190px;margin-top:6px;background:#0b0f16;border:1px solid #21262d;border-radius:6px;"></canvas>
      <div id="ptDerived" style="font:10px monospace;color:#8b949e;margin-top:4px;min-height:14px;"></div>
      <div id="ptSavedList" style="margin-top:6px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
        <button id="ptRestore" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">恢复内置</button>
        <button id="ptSave" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">保存预设</button>
        <button id="ptCancel" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">取消</button>
        <button id="ptApply" style="background:#238636;border:1px solid #2ea043;color:#fff;border-radius:6px;padding:5px 14px;cursor:pointer;font:700 11px var(--font-ui);">应用 APPLY</button>
      </div>
    </div>`;
    /* G29 教训：此刻 m 尚未插入文档，document.getElementById 找不到 innerHTML 内元素；
       用 m.querySelector 子树查找（未连接状态也能命中，真实浏览器 + 沙箱桩均安全） */
    try {
      const q = id => m.querySelector("#" + id);
      q("ptClose").onclick = () => this.close();
      q("ptCancel").onclick = () => this.close();
      q("ptApply").onclick = () => this.applyFromForm();
      q("ptSave").onclick = () => this.saveFromForm();
      q("ptRestore").onclick = () => this.restoreBuiltin();
    } catch (e) { console.warn("POWERTRAIN modal bind failed:", e); }
    /* 实时预览：任何 input/change → readForm →（架构变了才重建栏位）→ 派生量 + 曲线重绘 */
    try {
      const onEdit = () => {
        const before = this._draft ? this._draft.architecture : null;
        this.readForm();
        if (this._draft && this._draft.architecture !== before) { this.renderForm(); return; }
        this.updateDerived(); this.drawCurve();
      };
      m.addEventListener("input", onEdit);
      m.addEventListener("change", onEdit);
    } catch (e) { console.warn("POWERTRAIN modal bind failed:", e); }
    return m;
  },

  /* ── renderForm：草稿 → DOM（栏位重建 + 写值 + 局部事件绑定 + 重绘）──
     重建时机：open() / 架构变更 / 挡位增删 / 载入预设。普通数值输入不重建
     （只走 readForm+drawCurve），避免打字中焦点丢失。 */
  renderForm() {
    const d = this._draft || (this._draft = JSON.parse(JSON.stringify(this.spec || this.defaultSpec())));
    const arch = this.ARCHS.some(a => a.k === d.architecture) ? d.architecture : "ice";
    d.architecture = arch;
    const L = this._el("ptLeft"), R = this._el("ptRight");
    if (L) L.innerHTML = this.leftColumnHTML(arch);
    if (R) R.innerHTML = this.rightColumnHTML();
    /* 架构 radio（同 name 互斥，浏览器自行保证单选） */
    this.ARCHS.forEach(a => this._setChk("pt_arch_" + a.k, a.k === arch));
    /* 驱动形式：不在本架构白名单内 → 钳到首选（tv 需双电机，series 无中央差速） */
    const ds = this.drivesFor(arch);
    if (!ds.includes(d.drive)) d.drive = ds.includes("awd_fixed") && d.drive && d.drive.indexOf("awd") === 0 ? "awd_fixed" : ds[0];
    this._setVal("pt_drive", d.drive);
    /* ICE（ev 时隐藏但仍写值：切回 ice 时不丢上次参数） */
    const ice = d.ice || this.defaultSpec().ice;
    this._setVal("pt_ice_cyl", ice.cyl); this._setVal("pt_ice_layout", ice.layout);
    this._setVal("pt_ice_dispL", ice.dispL); this._setVal("pt_ice_idleRpm", ice.idleRpm);
    this._setVal("pt_ice_redlineRpm", ice.redlineRpm);
    this._setVal("pt_ice_fuelCutRpm", ice.fuelCutRpm !== undefined ? ice.fuelCutRpm : ice.redlineRpm);
    this._setVal("pt_ice_fricA", ice.fricA || 0); this._setVal("pt_ice_fricB", ice.fricB || 0);
    this._setVal("pt_ice_fricC", ice.fricC || 0); this._setVal("pt_ice_inertia", ice.inertia || 0);
    this._setVal("pt_ice_throttleTau", ice.throttleTau || 0);
    this._setVal("pt_ice_map", JSON.stringify(Array.isArray(ice.map) ? ice.map : []));
    this._mapErr = null;   // textarea 已由草稿重写 → 旧的解析错误作废
    /* motor×2：未启用也写 MOTOR_DEF，使「勾选即得合理值」 */
    for (const k of ["motorF", "motorR"]) {
      const m = d[k] || null, src = m || this.MOTOR_DEF;
      this._setChk("pt_" + k + "_on", !!m);
      this._setVal(`pt_${k}_peakTorqueNm`, src.peakTorqueNm);
      this._setVal(`pt_${k}_peakPowerKw`, src.peakPowerKw);
      /* baseRpm 缺省 = P/T 拐点（motorTorque 不读它，仅 validate 校一致性） */
      this._setVal(`pt_${k}_baseRpm`, (m && m.baseRpm !== undefined) ? m.baseRpm : Math.round(this.kneeRpm(src)));
      this._setVal(`pt_${k}_maxRpm`, src.maxRpm);
      this._setVal(`pt_${k}_regenMaxKw`, src.regenMaxKw !== undefined ? src.regenMaxKw : src.peakPowerKw);
      this._setVal(`pt_${k}_inertia`, src.inertia || 0);
    }
    const b = d.battery || null, bsrc = b || this.BAT_DEF;
    this._setChk("pt_bat_on", !!b);
    this._setVal("pt_bat_capacityKwh", bsrc.capacityKwh);
    this._setVal("pt_bat_soc0", bsrc.soc0 !== undefined ? bsrc.soc0 : 0.8);
    this._setVal("pt_bat_maxDischargeKw", bsrc.maxDischargeKw !== undefined ? bsrc.maxDischargeKw : 0);
    this._setVal("pt_bat_maxChargeKw", bsrc.maxChargeKw !== undefined ? bsrc.maxChargeKw : 0);
    /* gearbox：挡位数写入隐藏计数域（readForm 的唯一行数真相源）+ 逐行 input */
    const g = d.gearbox || this.defaultSpec().gearbox;
    const ratios = (Array.isArray(g.ratios) && g.ratios.length) ? g.ratios : [1];
    const rb = this._el("ptRatios");
    if (rb) rb.innerHTML = this.ratiosHTML(ratios.length);
    this._setVal("pt_gb_rn", ratios.length);
    for (let i = 0; i < ratios.length; i++) this._setVal("pt_gb_r" + i, ratios[i]);
    this._setVal("pt_gb_type", g.type);
    this._setVal("pt_gb_finalDrive", g.finalDrive);
    this._setVal("pt_gb_shiftTimeMs", g.shiftTimeMs !== undefined ? g.shiftTimeMs : 0);
    this._setVal("pt_gb_eff", g.eff !== undefined ? g.eff : 1);
    this._setVal("pt_gb_autoUpFrac", g.autoUpFrac !== undefined ? g.autoUpFrac : 0.92);
    this._setVal("pt_gb_autoDownFrac", g.autoDownFrac !== undefined ? g.autoDownFrac : 0.55);
    const df = d.diff || this.defaultSpec().diff;
    this._setVal("pt_diff_type", df.type); this._setVal("pt_diff_bias", df.bias);
    this._setVal("pt_diff_lockNm", df.lockNm || 0);
    this._setVal("pt_splitFront", d.splitFront);
    this.bindFormButtons();
    this.syncVisibility();
    this.renderSavedList();
    this.updateDerived();
    this.drawCurve();
  },

  /* 栏位内动态按钮（innerHTML 重建后需重绑；用 onclick 赋值而非 addEventListener，不累积） */
  bindFormButtons() {
    const mb = this._el("ptMapApply");
    if (mb) mb.onclick = () => { this.readForm(); this.updateDerived(); this.drawCurve(); };
    const pl = this._el("ptPresetLoad");
    if (pl) pl.onclick = () => this.loadBuiltinPreset(String(this._getVal("ptPresetPick")));
    const ab = this._el("ptRatioAdd");
    if (ab) ab.onclick = () => this.changeRatioCount(1);
    const box = this._el("ptRatios");
    const dels = (box && box.querySelectorAll) ? box.querySelectorAll("button[data-pt-rdel]") : [];
    for (let i = 0; i < dels.length; i++) {
      const btn = dels[i];
      let idx = NaN;
      try { idx = parseInt(btn.getAttribute ? btn.getAttribute("data-pt-rdel") : (btn.dataset ? btn.dataset.ptRdel : null), 10); } catch (e) { idx = NaN; }
      btn.onclick = () => this.deleteRatioRow(idx);
    }
  },
  /* 按架构/驱动形式显隐分区：ev 无 ICE；ice 无电机/电池；非四驱无中央差速 */
  syncVisibility() {
    const d = this._draft || {};
    const arch = d.architecture || "ice", elec = arch !== "ice";
    this._show("ptSecIce", arch !== "ev");
    this._show("ptSecMotorF", elec);
    this._show("ptSecMotorR", elec);
    this._show("ptSecBat", elec);
    this._show("ptSecCenter", d.drive === "awd_fixed" || d.drive === "awd_center");
  },

  /* ── readForm：DOM → 草稿（带自愈：空值回退旧值、红线/断油/分配比钳位）── */
  readForm() {
    const d = this._draft || (this._draft = this.defaultSpec());
    /* 架构 radio */
    let arch = d.architecture;
    for (const a of this.ARCHS) if (this._getChk("pt_arch_" + a.k)) arch = a.k;
    d.architecture = arch;
    /* 驱动形式（非白名单值 → 保留旧值或首选） */
    const ds = this.drivesFor(arch), dv = String(this._getVal("pt_drive") || "");
    d.drive = ds.includes(dv) ? dv : (ds.includes(d.drive) ? d.drive : ds[0]);
    d.splitFront = Math.max(0, Math.min(1, this._num("pt_splitFront", d.splitFront)));
    /* ICE：ev 架构必须无 ice（validate M-1）；其余架构空块→默认块 */
    if (arch === "ev") d.ice = null;
    else {
      const prev = d.ice || this.defaultSpec().ice;
      const idle = this._num("pt_ice_idleRpm", prev.idleRpm);
      /* 自愈：redline > idle（validate ice.rpm）、fuelCut ≥ redline（M-2） */
      const red = Math.max(this._num("pt_ice_redlineRpm", prev.redlineRpm), idle + 1);
      const cut = Math.max(this._num("pt_ice_fuelCutRpm", prev.fuelCutRpm !== undefined ? prev.fuelCutRpm : red), red);
      d.ice = {
        cyl: Math.max(1, Math.round(this._num("pt_ice_cyl", prev.cyl))),
        layout: String(this._getVal("pt_ice_layout") || prev.layout),
        dispL: this._num("pt_ice_dispL", prev.dispL),
        idleRpm: idle, redlineRpm: red, fuelCutRpm: cut,
        map: this.readMap(prev.map),
        fricA: this._num("pt_ice_fricA", prev.fricA || 0),
        fricB: this._num("pt_ice_fricB", prev.fricB || 0),
        fricC: this._num("pt_ice_fricC", prev.fricC || 0),
        inertia: this._num("pt_ice_inertia", prev.inertia || 0),
        throttleTau: Math.max(0, this._num("pt_ice_throttleTau", prev.throttleTau || 0))
      };
    }
    /* motor×2：ice 架构禁带电机（validate）；未勾选 → null */
    for (const k of ["motorF", "motorR"]) {
      const prev = d[k] || this.MOTOR_DEF;
      if (arch === "ice" || !this._getChk("pt_" + k + "_on")) { d[k] = null; continue; }
      const base = this._num(`pt_${k}_baseRpm`, this.kneeRpm(prev));
      const m = {
        peakTorqueNm: this._num(`pt_${k}_peakTorqueNm`, prev.peakTorqueNm),
        peakPowerKw: this._num(`pt_${k}_peakPowerKw`, prev.peakPowerKw),
        maxRpm: this._num(`pt_${k}_maxRpm`, prev.maxRpm),
        regenMaxKw: this._num(`pt_${k}_regenMaxKw`, prev.regenMaxKw !== undefined ? prev.regenMaxKw : prev.peakPowerKw),
        inertia: Math.max(0, this._num(`pt_${k}_inertia`, prev.inertia || 0))
      };
      /* baseRpm 仅在 >0 时写入（≤0/缺省 → 不校一致性）；不静默吸附拐点，
         不一致时由 updateDerived 实时提示 + applyFromForm 的 validate 报错，不隐藏用户意图 */
      if (base > 0) m.baseRpm = base;
      d[k] = m;
    }
    /* battery：电气化架构必需（validate）；ice 架构 → null */
    if (arch === "ice" || !this._getChk("pt_bat_on")) d.battery = null;
    else {
      const prev = d.battery || this.BAT_DEF;
      const bb = {
        capacityKwh: this._num("pt_bat_capacityKwh", prev.capacityKwh),
        soc0: Math.max(0, Math.min(1, this._num("pt_bat_soc0", prev.soc0 !== undefined ? prev.soc0 : 0.8)))
      };
      /* 0 = 不限：不写入字段（step 中 undefined → Infinity；写 0 会错义为零功率） */
      const md = this._num("pt_bat_maxDischargeKw", prev.maxDischargeKw !== undefined ? prev.maxDischargeKw : 0);
      const mc = this._num("pt_bat_maxChargeKw", prev.maxChargeKw !== undefined ? prev.maxChargeKw : 0);
      if (md > 0) bb.maxDischargeKw = md;
      if (mc > 0) bb.maxChargeKw = mc;
      d.battery = bb;
    }
    /* gearbox：行数取自隐藏计数域（增删挡时同步），逐行 input 空/非正 → 回退旧值 */
    const gp = d.gearbox || this.defaultSpec().gearbox;
    const nRaw = parseInt(this._getVal("pt_gb_rn"), 10);
    const nPrev = (Array.isArray(gp.ratios) && gp.ratios.length) ? gp.ratios.length : 1;
    const n = Number.isFinite(nRaw) ? Math.max(1, Math.min(16, nRaw)) : nPrev;
    const ratios = [];
    for (let i = 0; i < n; i++) {
      const v = parseFloat(this._getVal("pt_gb_r" + i));
      const fb = (Array.isArray(gp.ratios) && gp.ratios[i] !== undefined) ? gp.ratios[i] : 1;
      ratios.push((Number.isFinite(v) && v > 0) ? v : fb);
    }
    const gt = String(this._getVal("pt_gb_type") || "");
    d.gearbox = {
      type: this.GB_TYPES.some(x => x[0] === gt) ? gt : (this.GB_TYPES.some(x => x[0] === gp.type) ? gp.type : "manual"),
      ratios,
      finalDrive: this._num("pt_gb_finalDrive", gp.finalDrive),
      shiftTimeMs: Math.max(0, this._num("pt_gb_shiftTimeMs", gp.shiftTimeMs !== undefined ? gp.shiftTimeMs : 0)),
      eff: this._num("pt_gb_eff", gp.eff !== undefined ? gp.eff : 1),
      autoUpFrac: Math.max(0.05, Math.min(1, this._num("pt_gb_autoUpFrac", gp.autoUpFrac !== undefined ? gp.autoUpFrac : 0.92))),
      autoDownFrac: Math.max(0.02, Math.min(1, this._num("pt_gb_autoDownFrac", gp.autoDownFrac !== undefined ? gp.autoDownFrac : 0.55)))
    };
    const dp = d.diff || this.defaultSpec().diff, dt = String(this._getVal("pt_diff_type") || "");
    d.diff = {
      type: this.DIFF_TYPES.some(x => x[0] === dt) ? dt : (this.DIFF_TYPES.some(x => x[0] === dp.type) ? dp.type : "open"),
      bias: Math.max(1, this._num("pt_diff_bias", dp.bias)),
      lockNm: Math.max(0, this._num("pt_diff_lockNm", dp.lockNm || 0))
    };
    return d;
  },
  /* map textarea → 控制点数组：非法 JSON / 点数<2 / rpm 重复 → 保留旧值并提示（失效安全）；
     乱序录入自动按 rpm 升序（与 validate 的 ice.map(ascending) 规则一致） */
  readMap(prev) {
    const raw = String(this._getVal("pt_ice_map") || "").trim();
    const keep = () => Array.isArray(prev) ? prev : this.defaultSpec().ice.map;
    /* 校验失败只记 _mapErr，不直接写 hint：hint 的唯一写者是 updateDerived，
       否则 onEdit 链中随后的 updateDerived 会把 ⚠ 覆盖成概要 → 用户看不到错误（M-8）。 */
    if (!raw) { this._mapErr = null; return keep(); }
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) { arr = null; }
    if (!Array.isArray(arr) || arr.length < 2 ||
        arr.some(p => !Array.isArray(p) || p.length !== 2 || !(Number(p[0]) > 0) || !(Number(p[1]) >= 0))) {
      this._mapErr = "map 非法：需 [[rpm, N·m], …] 且 ≥2 点、rpm>0";
      return keep();
    }
    const out = arr.map(p => [Number(p[0]), Number(p[1])]).sort((a, b) => a[0] - b[0]);
    if (out.some((p, i) => i > 0 && p[0] <= out[i - 1][0])) {
      this._mapErr = "map rpm 重复：插值分母为零，请删重后重试";
      return keep();
    }
    this._mapErr = null;
    return out;
  },

  /* 派生量回显：电机拐点一致性 / ICE 峰值与功率 / 传动链概要 */
  updateDerived() {
    const d = this._draft; if (!d) return;
    for (const k of ["motorF", "motorR"]) {
      const e = this._el("pt_" + k + "_knee"); if (!e) continue;
      const m = d[k];
      if (!m) { e.textContent = "（未启用）"; continue; }
      const knee = this.kneeRpm(m);
      const bad = (m.baseRpm !== undefined && knee > 0 && Math.abs(m.baseRpm - knee) / m.baseRpm >= 0.05);
      e.textContent = bad
        ? `⚠ 基速 ${Math.round(m.baseRpm)} rpm 与 P/T 拐点 ${Math.round(knee)} rpm 不一致（需 ±5%）`
        : `P/T 拐点 ≈ ${Math.round(knee)} rpm（基速需与之一致 ±5%）`;
      e.style.color = bad ? "#f85149" : "#8b949e";
    }
    const ice = d.ice, hint = this._el("pt_ice_mapHint");
    if (hint && this._mapErr) {
      /* ⚠ 优先于概要：readMap 失效安全地保留了旧 map，必须让用户看见原因 */
      hint.textContent = `⚠ ${this._mapErr}（已保留原 map：${(ice && Array.isArray(ice.map)) ? ice.map.length : 0} 点）`;
      hint.style.color = "#f85149";
    } else if (hint && ice && Array.isArray(ice.map) && ice.map.length) {
      let pk = ice.map[0], pmax = 0, prpm = 0;
      for (const p of ice.map) if (p[1] > pk[1]) pk = p;
      const lo = Number.isFinite(ice.idleRpm) ? ice.idleRpm : 500;
      const hi = Number.isFinite(ice.redlineRpm) ? ice.redlineRpm : lo + 6000;
      const stp = Math.max(10, (hi - lo) / 400);
      for (let rpm = lo; rpm <= hi; rpm += stp) {
        const P = this.mapLookup(ice.map, rpm) * rpm / 9550;
        if (P > pmax) { pmax = P; prpm = rpm; }
      }
      hint.textContent = `${ice.map.length} 控制点 · 峰值 ${pk[1].toFixed(0)} N·m @${Math.round(pk[0])} rpm · 最大功率 ${pmax.toFixed(0)} kW @${Math.round(prpm)} rpm`;
      hint.style.color = "#8b949e";
    }
    const der = this._el("ptDerived");
    if (der) {
      const g = d.gearbox || {}, rr = Array.isArray(g.ratios) ? g.ratios : [];
      const fd = Number.isFinite(g.finalDrive) ? g.finalDrive : 1;
      const pw = [];
      if (ice && Array.isArray(ice.map) && ice.map.length) {
        let pmax = 0;
        const lo = Number.isFinite(ice.idleRpm) ? ice.idleRpm : 500;
        const hi = Number.isFinite(ice.redlineRpm) ? ice.redlineRpm : lo + 6000;
        const stp = Math.max(10, (hi - lo) / 400);
        for (let rpm = lo; rpm <= hi; rpm += stp) pmax = Math.max(pmax, this.mapLookup(ice.map, rpm) * rpm / 9550);
        pw.push(`ICE ${pmax.toFixed(0)}kW`);
      }
      if (d.motorF) pw.push(`前电机 ${(+d.motorF.peakPowerKw).toFixed(0)}kW`);
      if (d.motorR) pw.push(`后电机 ${(+d.motorR.peakPowerKw).toFixed(0)}kW`);
      if (d.battery) pw.push(`电池 ${(+d.battery.capacityKwh).toFixed(1)}kWh`);
      der.textContent = `${this.archZh(d.architecture)} · ${this.DRIVE_ZH[d.drive] || d.drive} · ${rr.length} 挡` +
        (rr.length ? ` · 1挡总比 ${(rr[0] * fd).toFixed(2)} · 顶挡总比 ${(rr[rr.length - 1] * fd).toFixed(2)}` : "") +
        ` · ${pw.join(" / ") || "⚠ 无动力源"}`;
    }
  },

  /* ── drawCurve：扭矩曲线（控制点折线）+ 功率叠加（P=T·ω/9550 kW）+ 红线/断油竖线 + 坐标轴刻度 ──
     对 _draft 求值（非 this.spec）→ 未应用即可预览。mapLookup/motorTorque 均为纯函数，
     不需临时改 spec。只用 moveTo/lineTo/stroke/fillText/setLineDash——headless ctx 桩的
     arc()/rect() 是空实现，控制点标记用十字而不依赖 arc。 */
  drawCurve() {
    const cv = this._el("ptCurve");
    if (!cv || typeof cv.getContext !== "function") return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = Number(cv.width) > 0 ? Number(cv.width) : 840;
    const H = Number(cv.height) > 0 ? Number(cv.height) : 190;
    const L = 48, Rr = W - 50, Tt = 16, Bb = H - 22;
    ctx.clearRect(0, 0, W, H);
    const d = this._draft || this.spec || this.defaultSpec();
    const ice = d.ice || null, mF = d.motorF || null, mR = d.motorR || null;
    /* rpm 轴上限：红线/断油/电机最高转速取大，钳 [1000, 30000] */
    let rpmMax = Math.max(ice ? (Number.isFinite(ice.redlineRpm) ? ice.redlineRpm : 0) : 0,
                          ice ? (Number.isFinite(ice.fuelCutRpm) ? ice.fuelCutRpm : 0) : 0,
                          mF && Number.isFinite(mF.maxRpm) ? mF.maxRpm : 0,
                          mR && Number.isFinite(mR.maxRpm) ? mR.maxRpm : 0, 1000);
    if (!Number.isFinite(rpmMax) || !(rpmMax > 0)) rpmMax = 1000;
    rpmMax = Math.min(rpmMax, 30000);
    /* 采样：ICE 全负荷 map（断油后置 0）+ 电机恒扭矩→恒功率（soc=undefined → 不降额） */
    const cut = ice ? (ice.fuelCutRpm !== undefined ? ice.fuelCutRpm : Infinity) : Infinity;
    const iceT = rpm => (ice && rpm <= cut) ? this.mapLookup(ice.map, rpm) : 0;
    const motT = (m, rpm) => (m ? this.motorTorque(m, rpm, 1, undefined) : 0);
    const N = 180, rows = [];
    let tMax = 1, pMax = 1;
    for (let i = 0; i <= N; i++) {
      const rpm = rpmMax * i / N;
      const ti = iceT(rpm), tf = motT(mF, rpm), tr = motT(mR, rpm);
      const tot = ti + tf + tr, pw = tot * rpm / 9550;
      rows.push({ rpm, ti, tf, tr, tot, pw });
      if (ti > tMax) tMax = ti; if (tf > tMax) tMax = tf;
      if (tr > tMax) tMax = tr; if (tot > tMax) tMax = tot;
      if (pw > pMax) pMax = pw;
    }
    const X = rpm => L + (Rr - L) * (rpm / rpmMax);
    const YT = t => Bb - (Bb - Tt) * (Math.max(0, t) / tMax);
    const YP = p => Bb - (Bb - Tt) * (Math.max(0, p) / pMax);
    /* 网格 + X 轴刻度（rpm） */
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(139,148,158,0.16)";
    ctx.font = "9px monospace"; ctx.fillStyle = "#8b949e";
    const nx = 6;
    for (let i = 0; i <= nx; i++) {
      const rpm = rpmMax * i / nx, x = X(rpm);
      ctx.beginPath(); ctx.moveTo(x, Tt); ctx.lineTo(x, Bb); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(rpm >= 1000 ? (rpm / 1000).toFixed(1) + "k" : String(Math.round(rpm)), x, Bb + 5);
    }
    /* Y 轴刻度：左 N·m（扭矩）/ 右 kW（功率） */
    const ny = 4;
    ctx.textBaseline = "middle";
    for (let i = 0; i <= ny; i++) {
      const y = Bb - (Bb - Tt) * i / ny;
      ctx.strokeStyle = "rgba(139,148,158,0.16)";
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(Rr, y); ctx.stroke();
      ctx.fillStyle = "#8b949e"; ctx.textAlign = "right";
      ctx.fillText(String(Math.round(tMax * i / ny)), L - 5, y);
      ctx.fillStyle = "#d29922"; ctx.textAlign = "left";
      ctx.fillText(String(Math.round(pMax * i / ny)), Rr + 5, y);
    }
    ctx.fillStyle = "#8b949e"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("N·m", 4, 2);
    ctx.fillStyle = "#d29922"; ctx.textAlign = "right";
    ctx.fillText("kW", W - 4, 2);
    /* 红线 / 断油竖线 */
    const dash = ctx.setLineDash ? ctx.setLineDash.bind(ctx) : null;
    const vline = (rpm, color, label) => {
      if (!(rpm > 0) || rpm > rpmMax) return;
      const x = X(rpm);
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      if (dash) dash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, Tt); ctx.lineTo(x, Bb); ctx.stroke();
      if (dash) dash([]);
      ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(label, Math.min(x + 3, Rr - 34), Tt + 12);
    };
    if (ice) { vline(ice.redlineRpm, "#f85149", "红线"); vline(ice.fuelCutRpm, "#d29922", "断油"); }
    /* 曲线：各动力源 + 合成扭矩（实线）+ 总功率（虚线，右轴） */
    const plot = (key, color, width, useDash) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
      if (useDash && dash) dash([5, 3]);
      for (let i = 0; i < rows.length; i++) {
        const x = X(rows[i].rpm), y = (key === "pw") ? YP(rows[i].pw) : YT(rows[i][key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (useDash && dash) dash([]);
    };
    if (ice) plot("ti", "#f0883e", 1.5, false);
    if (mF) plot("tf", "#58a6ff", 1.5, false);
    if (mR) plot("tr", "#7ee787", 1.5, false);
    plot("tot", "#e6edf3", 2, false);
    plot("pw", "#d29922", 1.5, true);
    /* ICE 控制点十字标记（用户录入的折线节点） */
    if (ice && Array.isArray(ice.map)) {
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
      for (const p of ice.map) {
        if (!(p[0] <= rpmMax)) continue;
        const x = X(p[0]), y = YT(p[1]);
        ctx.beginPath();
        ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y);
        ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5);
        ctx.stroke();
      }
    }
    /* 图例 */
    const legend = [];
    if (ice) legend.push(["ICE", "#f0883e"]);
    if (mF) legend.push(["前电机", "#58a6ff"]);
    if (mR) legend.push(["后电机", "#7ee787"]);
    legend.push(["合成扭矩", "#e6edf3"]);
    legend.push(["功率 kW(右轴)", "#d29922"]);
    ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let lx = L + 2;
    for (const [t, c] of legend) {
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx, Tt + 5); ctx.lineTo(lx + 14, Tt + 5); ctx.stroke();
      ctx.fillStyle = c; ctx.fillText(t, lx + 17, Tt + 5);
      lx += 20 + String(t).length * 6 + 10;
    }
    ctx.lineWidth = 1;
  },

  /* ── 挡位增删 ── */
  changeRatioCount(delta) {
    this.readForm();
    const d = this._draft;
    if (!d.gearbox) d.gearbox = this.defaultSpec().gearbox;
    if (!Array.isArray(d.gearbox.ratios) || !d.gearbox.ratios.length) d.gearbox.ratios = [1];
    const n = Math.max(1, Math.min(16, d.gearbox.ratios.length + (delta > 0 ? 1 : -1)));
    while (d.gearbox.ratios.length < n) {
      /* 新挡取末挡×0.75（递降惯例），用户再改 */
      d.gearbox.ratios.push(Math.max(0.05, d.gearbox.ratios[d.gearbox.ratios.length - 1] * 0.75));
    }
    d.gearbox.ratios.length = n;
    this.renderForm();
  },
  deleteRatioRow(i) {
    if (!(i >= 0)) return;
    this.readForm();
    const g = this._draft.gearbox;
    if (!g || !Array.isArray(g.ratios) || g.ratios.length <= 1) return;   // validate 要求 ratios ≥ 1
    if (i >= g.ratios.length) return;
    g.ratios.splice(i, 1);
    this.renderForm();
  },

  /* ── 内置预设载入（只写草稿，不立即生效——由「应用」提交） ── */
  loadBuiltinPreset(name) {
    const p = POWERTRAIN_PRESETS[name];
    if (!p) return;
    this._draft = JSON.parse(JSON.stringify(p));
    this.renderForm();
  },

  /* ── 主按钮路径 ── */
  applyFromForm() {
    this.readForm();
    const r = this.applyToVehicle();
    if (!r || !r.ok) {
      if (typeof alert === "function") alert("校验失败: " + ((r && r.errors) ? r.errors.join(", ") : "unknown"));
      return;
    }
    this.close();
  },
  saveFromForm() {
    this.readForm();
    const name = (typeof prompt === "function" && prompt("预设名称：", "我的动力")) || null;
    if (!name) return;
    const r = this.saveCustom(name);
    if (!r.ok) {
      /* 失败不关窗（G29-P7）：用户可改名/删旧条后在表单内直接重试 */
      if (typeof alert === "function") {
        alert(r.error === "limit" ? `自定义预设已达 ${this.MAX_CUSTOMS} 条上限，请先删除旧条目。`
          : r.error === "dup" ? "名称已存在。"
          : "校验失败: " + (r.errors || []).join(", "));
      }
      return;
    }
    const a = this.applyToVehicle();
    if (!a || !a.ok) { if (typeof alert === "function") alert("校验失败: " + a.errors.join(", ")); return; }
    this.renderSavedList();
    this.close();
  },
  /* 恢复内置 = legacy-equivalent 默认规格（等价锚：轮上后 480 / 前 120） */
  restoreBuiltin() {
    this._draft = this.defaultSpec();
    const r = this.applyToVehicle();
    if (!r || !r.ok) { if (typeof alert === "function") alert("校验失败: " + r.errors.join(", ")); return; }
    this.renderForm();
  },

  /* ── 生效路径：setSpec(草稿) → 写覆盖层引用 → 重建活跃舞台引擎 ──
     G29 教训：switchScenario 不重建引擎（构造期固化的参数不刷新）→ 直构
     new VehicleDynamics15DOF + resetVehicle。三个舞台各持引擎：
     SLOPE/CIRCUIT → window.physicsEngine；SKIDPAD → window.skidpadEngine。
     CIRCUIT 起跑状态由 openCircuitStage 局部构造 → 重建时保留旧 state，避免赛车瞬移回原点。 */
  applyToVehicle() {
    if (this._draft) {
      const v = this.setSpec(this._draft);
      if (!v.ok) return v;   // 非法草稿 → 不覆盖当前生效 spec
    }
    try { if (typeof S !== "undefined" && S) S.ptSpec = this.spec; } catch (e) {}
    this.rebuildActiveStages();
    return { ok: true, errors: [] };
  },
  rebuildActiveStages() {
    if (typeof VehicleDynamics15DOF !== "function" || typeof S === "undefined" || typeof SIM === "undefined") return;
    const mk = (key, speedMs, keepState) => {
      const old = window[key];
      const oldState = (keepState && old && old.state) ? old.state : null;
      window[key] = new VehicleDynamics15DOF(S, SIM, speedMs);
      if (oldState) { try { Object.assign(window[key].state, oldState); } catch (e) {} }
    };
    try {
      if (typeof SLOPE_STAGE !== "undefined" && SLOPE_STAGE && SLOPE_STAGE.active) {
        const cfg = (SLOPE_STAGE.scenarioConfigs && SLOPE_STAGE.scenarioConfigs[SLOPE_STAGE.scenario]) || {};
        const kmh = (SLOPE_STAGE.scenario === "accel_brake") ? 0 : (cfg.speedKmh || SLOPE_STAGE.speedKmh || 85);
        mk("physicsEngine", kmh * 1000 / 3600, false);
        if (typeof SLOPE_STAGE.resetVehicle === "function") SLOPE_STAGE.resetVehicle();
      }
    } catch (e) {}
    try {
      if (typeof SKIDPAD_STAGE !== "undefined" && SKIDPAD_STAGE && SKIDPAD_STAGE.active) {
        const kmh = SKIDPAD_STAGE.speedKmh || 72;
        mk("skidpadEngine", kmh * 1000 / 3600, true);
        if (typeof SKIDPAD_STAGE.resetVehicle === "function") SKIDPAD_STAGE.resetVehicle();
      }
    } catch (e) {}
    try {
      if (typeof CIRCUIT_STAGE !== "undefined" && CIRCUIT_STAGE && CIRCUIT_STAGE.active) {
        mk("physicsEngine", 5.0, true);
        if (typeof CIRCUIT_STAGE.resetVehicle === "function") CIRCUIT_STAGE.resetVehicle();
      }
    } catch (e) {}
  },

  /* ── 持久化：localStorage（key 前缀 labsus-，≤MAX_CUSTOMS 条） ── */
  persistCustoms() {
    try { localStorage.setItem(this.LS_KEY, JSON.stringify(this.customs)); } catch (e) {}
  },
  loadCustoms() {
    try {
      const o = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(this.LS_KEY)) || "{}");
      this.customs = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { this.customs = {}; }
  },
  saveCustom(name) {
    if (!name) return { ok: false, error: "noname" };
    const sp = this._draft || this.spec;
    const v = this.validate(sp);
    if (!v.ok) return { ok: false, error: "invalid", errors: v.errors };
    if (this.customs[name]) return { ok: false, error: "dup" };
    if (Object.keys(this.customs).length >= this.MAX_CUSTOMS) return { ok: false, error: "limit" };
    this.customs[name] = JSON.parse(JSON.stringify(sp));
    this.persistCustoms(); this.refreshPresetSelect();
    return { ok: true };
  },
  deleteCustom(name) {
    if (!name || !this.customs[name]) return;
    delete this.customs[name];
    this.persistCustoms(); this.refreshPresetSelect();
  },
  /* 下拉激活：写 spec + 同步草稿（弹窗再开即所见）+ 重建舞台 */
  activateCustom(name) {
    const c = this.customs[name];
    if (!c) return { ok: false, errors: ["custom(missing)"] };
    this._draft = JSON.parse(JSON.stringify(c));
    const v = this.setSpec(c);
    if (!v.ok) return v;
    this.applyToVehicle();
    return { ok: true, errors: [] };
  },
  /* 预设下拉追加「自定义动力」分组（与 tirecustom 共用同一 select，data-ptlab 标记供幂等重建） */
  refreshPresetSelect() {
    const sel = (typeof document !== "undefined") ? document.getElementById("topVehSelect") : null;
    if (!sel) return;
    if (sel.querySelectorAll) {
      const olds = sel.querySelectorAll('optgroup[data-ptlab]');
      for (let i = 0; i < olds.length; i++) { try { olds[i].remove(); } catch (e) {} }
    }
    const names = Object.keys(this.customs); if (!names.length) return;
    const g = document.createElement("optgroup");
    g.setAttribute("label", "🔧 自定义动力"); g.setAttribute("data-ptlab", "1");
    names.forEach(n => {
      const o = document.createElement("option");
      o.value = "ptcustom:" + n; o.textContent = "🔧 " + n;
      g.appendChild(o);
    });
    sel.appendChild(g);
  },
  /* 已存自定义管理区：载入 / 删除（解除 20 条上限死锁，同 G29 教训） */
  renderSavedList() {
    const box = this._el("ptSavedList"); if (!box) return;
    const names = Object.keys(this.customs);
    if (!names.length) { box.innerHTML = ""; return; }
    let html = `<div style="font:700 10px var(--font-ui);color:#58a6ff;margin-bottom:3px;">已存自定义动力（${names.length}/${this.MAX_CUSTOMS}）</div>`;
    names.forEach(n => {
      const c = this.customs[n] || {};
      html += `<div style="display:flex;align-items:center;gap:6px;padding:1px 0;">
        <span style="flex:1;font:10px var(--font-ui);color:#c9d1d9;">🔧 ${this._esc(n)}
          <span style="color:#6e7681;">· ${this._esc(c.architecture || "?")} / ${this._esc(c.drive || "?")}</span></span>
        <button data-pt-load="${this._esc(n)}" style="background:none;border:1px solid #30363d;color:#58a6ff;border-radius:4px;padding:1px 8px;cursor:pointer;font:10px var(--font-ui);">载入</button>
        <button data-pt-del="${this._esc(n)}" style="background:none;border:1px solid #30363d;color:#f85149;border-radius:4px;padding:1px 8px;cursor:pointer;font:10px var(--font-ui);">删除</button>
      </div>`;
    });
    box.innerHTML = html;
    const bind = (attr, fn) => {
      const els = box.querySelectorAll ? box.querySelectorAll(`button[${attr}]`) : [];
      for (let i = 0; i < els.length; i++) {
        const b = els[i];
        let nm = null;
        try { nm = b.getAttribute ? b.getAttribute(attr) : null; } catch (e) { nm = null; }
        b.onclick = () => fn(nm);
      }
    };
    bind("data-pt-load", nm => {
      if (!nm || !this.customs[nm]) return;
      this._draft = JSON.parse(JSON.stringify(this.customs[nm]));
      this.renderForm();
    });
    bind("data-pt-del", nm => { if (!nm) return; this.deleteCustom(nm); this.renderSavedList(); });
  }
};
/* ═══ 段6-b 内置预设 POWERTRAIN_PRESETS（name → spec，全部通过 POWERTRAIN.validate）═══
   数值取真实量级，不追求逐位对拍（启用后圈速变化属预期行为，不守 legacy 锚）。
   电机不写 baseRpm：motorTorque 只读 peakTorqueNm/peakPowerKw（min(T, P/ω)），
   拐点由表单按 30·P·1000/(π·T) 自动导出，避免手写值与 validate 的 ±5% 一致性检查冲突。 */
const POWERTRAIN_PRESETS = {
  /* 1) FIA GT3：4.0L 自然吸气 V8（量级：GT3 赛车 ~500–520 N·m / ~600 hp，红线 8500）
     6 速序列式手动 + 主减 3.9（GT3 典型 3.9–4.1）；机械式 LSD 预紧 ~120 N·m。 */
  "GT3 V8 RWD 6MT": {
    architecture: "ice", drive: "rwd", splitFront: 0,
    ice: {
      cyl: 8, layout: "V8", dispL: 4.0, idleRpm: 900, redlineRpm: 8500, fuelCutRpm: 8700,
      /* 全负荷扭矩曲线：低转 300→峰值 520@6500→高转回落 470（NA V8 典型驼峰） */
      map: [[900, 300], [2000, 400], [3500, 470], [5000, 510], [6500, 520], [7500, 505], [8500, 470]],
      fricA: 20, fricB: 0.008, fricC: 0,   // 摩擦+泵气：8500rpm 约 88 N·m（~17% 峰值）
      inertia: 0.35,                        // 曲轴+飞轮+离合 ~0.3–0.5 kg·m²
      throttleTau: 0.06                     // 节气门一阶响应 ~60 ms
    },
    motorF: null, motorR: null, battery: null,
    gearbox: { type: "manual", ratios: [3.0, 2.2, 1.7, 1.4, 1.15, 0.95], finalDrive: 3.9,
               shiftTimeMs: 180, eff: 0.96, autoUpFrac: 0.92, autoDownFrac: 0.55 },
    diff: { type: "lsd", bias: 2.5, lockNm: 120 }
  },

  /* 2) Formula SAE：600cc 直列四缸（摩托式高转，红线 13000）+ 5 速序列式。
     量级：FSAE 限制进气（20mm）后 ~60–70 N·m；齿比密、主减 3.6；惯量极小 ~0.06 kg·m²。 */
  "FSAE I4 RWD 5MT": {
    architecture: "ice", drive: "rwd", splitFront: 0,
    ice: {
      cyl: 4, layout: "I4", dispL: 0.6, idleRpm: 1500, redlineRpm: 13000, fuelCutRpm: 13500,
      map: [[1500, 40], [3000, 55], [5500, 65], [8000, 62], [10500, 55], [13000, 42]],
      fricA: 4, fricB: 0.0012, fricC: 0,   // 13000rpm 约 20 N·m（小排量高转，占峰值 ~30%）
      inertia: 0.06, throttleTau: 0.04
    },
    motorF: null, motorR: null, battery: null,
    gearbox: { type: "seq", ratios: [3.6, 2.4, 1.9, 1.6, 1.35], finalDrive: 3.6,
               shiftTimeMs: 90, eff: 0.97, autoUpFrac: 0.95, autoDownFrac: 0.5 },
    diff: { type: "open", bias: 1.0, lockNm: 0 }   // FSAE 多为开放式/死轴，无预紧
  },

  /* 3) 纯电双电机扭矩矢量：前后各 250 kW / 350 N·m（量级：高性能双电机 EV），
     80 kWh 电池、放电 450 kW / 充电 270 kW；单速减速器 ~9.7（典型 EV 减速比）。 */
  "EV 双电机 AWD-TV": {
    architecture: "ev", drive: "tv", splitFront: 0.5,
    ice: null,
    motorF: { peakTorqueNm: 350, peakPowerKw: 250, maxRpm: 16000, regenMaxKw: 200, inertia: 0.05 },
    motorR: { peakTorqueNm: 350, peakPowerKw: 250, maxRpm: 16000, regenMaxKw: 200, inertia: 0.05 },
    battery: { capacityKwh: 80, soc0: 0.9, maxDischargeKw: 450, maxChargeKw: 270 },
    gearbox: { type: "auto", ratios: [9.73], finalDrive: 1.0, shiftTimeMs: 0, eff: 0.97,
               autoUpFrac: 0.92, autoDownFrac: 0.55 },
    diff: { type: "open", bias: 1.0, lockNm: 0 }   // TV 逐轮由双电机直接分配，无机械差速需求
  },

  /* 4) P3 混动前驱：1.5L 直列四缸（阿特金森，~86 kW/165 N·m）+ 箱后电机 100 kW/300 N·m，
     15 kWh 电池（量级：PHEV/强混），5 速 AT + 主减 4.1（前驱主减速典型 3.9–4.3）。 */
  "P3 混动前驱": {
    architecture: "p3", drive: "fwd", splitFront: 1,
    ice: {
      cyl: 4, layout: "I4", dispL: 1.5, idleRpm: 800, redlineRpm: 6500, fuelCutRpm: 6700,
      map: [[800, 100], [2000, 140], [3500, 160], [5000, 165], [6500, 140]],
      fricA: 12, fricB: 0.004, fricC: 0, inertia: 0.15, throttleTau: 0.10
    },
    motorF: null,
    motorR: { peakTorqueNm: 300, peakPowerKw: 100, maxRpm: 8000, regenMaxKw: 60, inertia: 0.06 },
    battery: { capacityKwh: 15, soc0: 0.6, maxDischargeKw: 120, maxChargeKw: 80 },
    gearbox: { type: "auto", ratios: [3.5, 2.1, 1.5, 1.1, 0.9], finalDrive: 4.1,
               shiftTimeMs: 250, eff: 0.94, autoUpFrac: 0.9, autoDownFrac: 0.55 },
    diff: { type: "open", bias: 1.0, lockNm: 0 }
  },

  /* 5) 串联增程后驱：1.2L 直列三缸只发电（~86 kW@4000rpm），驱动全交给 150 kW/400 N·m 后电机，
     40 kWh 电池（量级：增程电动 SUV）；单速减速 9.0 + LSD。 */
  "串联增程后驱": {
    architecture: "series", drive: "rwd", splitFront: 0,
    ice: {
      cyl: 3, layout: "I3", dispL: 1.2, idleRpm: 1000, redlineRpm: 5500, fuelCutRpm: 5600,
      map: [[1000, 140], [2500, 200], [4000, 210], [5500, 185]],
      fricA: 12, fricB: 0.004, fricC: 0, inertia: 0.12, throttleTau: 0.15
    },
    motorF: null,
    motorR: { peakTorqueNm: 400, peakPowerKw: 150, maxRpm: 12000, regenMaxKw: 100, inertia: 0.08 },
    battery: { capacityKwh: 40, soc0: 0.7, maxDischargeKw: 200, maxChargeKw: 150 },
    gearbox: { type: "auto", ratios: [9.0], finalDrive: 1.0, shiftTimeMs: 0, eff: 0.97,
               autoUpFrac: 0.92, autoDownFrac: 0.55 },
    diff: { type: "lsd", bias: 2.0, lockNm: 60 }
  },

  /* 6) THS 功率分流（行星排）：1.8L 阿特金森 I4（~75 kW/142 N·m，量级：丰田 2ZR-FXE）
     + MG1 前电机 60 kW/150 N·m（发电为主）+ MG2 后电机 80 kW/207 N·m（驱动为主），
     6.5 kWh 电池（功率型，量级：PHEV 版 THS）；e-CVT 无挡位，主减 3.6。 */
  "THS 功率分流": {
    architecture: "powersplit", drive: "fwd", splitFront: 1,
    ice: {
      cyl: 4, layout: "I4", dispL: 1.8, idleRpm: 900, redlineRpm: 6000, fuelCutRpm: 6200,
      map: [[900, 100], [2000, 130], [4000, 142], [5200, 138], [6000, 120]],
      fricA: 14, fricB: 0.004, fricC: 0, inertia: 0.18, throttleTau: 0.12
    },
    motorF: { peakTorqueNm: 150, peakPowerKw: 60, maxRpm: 12000, regenMaxKw: 60, inertia: 0.03 },
    motorR: { peakTorqueNm: 207, peakPowerKw: 80, maxRpm: 13500, regenMaxKw: 60, inertia: 0.04 },
    battery: { capacityKwh: 6.5, soc0: 0.6, maxDischargeKw: 80, maxChargeKw: 60 },
    gearbox: { type: "cvt", ratios: [1], finalDrive: 3.6, shiftTimeMs: 0, eff: 0.95,
               autoUpFrac: 0.92, autoDownFrac: 0.55 },
    diff: { type: "open", bias: 1.0, lockNm: 0 }
  }
};

if (typeof window !== "undefined") {
  window.POWERTRAIN = POWERTRAIN;
  window.POWERTRAIN_PRESETS = POWERTRAIN_PRESETS;   // F-61：导出与定义同文件
}
POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());

/* 段6 启动：读回自定义预设 + 填充预设下拉（同 G29 轮胎工坊）。
   本脚本在 body 底部同步执行，DOM 已就绪；try/catch 防御降级不阻断启动。
   注意：不自动 setSpec 任何自定义条目——默认规格（legacy-equivalent）是圈速基线的守门员，
   自定义动力只在用户从下拉/弹窗显式选择后生效。 */
try {
  POWERTRAIN.loadCustoms();
  POWERTRAIN.refreshPresetSelect();
} catch (e) { console.warn("POWERTRAIN startup load failed:", e); }
