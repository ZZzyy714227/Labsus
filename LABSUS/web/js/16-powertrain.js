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
    if (sp.architecture === "ev" && !sp.motorF && !sp.motorR) errs.push("motor(required for ev)");
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
    if (!sp || !st || !sp.gearbox || st.shiftT > 0) return;
    const ni = st.gearIdx + dir;
    if (ni < 0 || ni >= sp.gearbox.ratios.length) return;
    st.shiftDir = dir;
    st.shiftT = Math.max(1, sp.gearbox.shiftTimeMs || 1);
  },
  /* 自动换挡策略（type=auto/dct）：rpm/redline 超 autoUpFrac 升、低于 autoDownFrac 降。
     manual/single 不自动换挡（manual 由 requestShift 显式驱动）。 */
  autoShift(iceRpm) {
    const sp = this.spec, st = this.state;
    if (!sp || !st || !sp.gearbox) return;
    if (sp.gearbox.type === "single" || sp.gearbox.type === "manual" || st.shiftT > 0) return;
    const rr = iceRpm / (sp.ice ? sp.ice.redlineRpm : 9000);
    if (rr > (sp.gearbox.autoUpFrac !== undefined ? sp.gearbox.autoUpFrac : 0.92) &&
        st.gearIdx < sp.gearbox.ratios.length - 1) this.requestShift(1);
    else if (rr < (sp.gearbox.autoDownFrac !== undefined ? sp.gearbox.autoDownFrac : 0.55) && st.gearIdx > 0) this.requestShift(-1);
  }
};
if (typeof window !== "undefined") window.POWERTRAIN = POWERTRAIN;
POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());
