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
    if (!sp || typeof sp !== "object") return { ok: false, errors: ["spec"] };
    if (!["ice","ev","p2","p3","p4","series","powersplit"].includes(sp.architecture)) errs.push("architecture");
    if (!["fwd","rwd","awd_fixed","awd_center","tv"].includes(sp.drive)) errs.push("drive");
    if (!(sp.splitFront >= 0 && sp.splitFront <= 1)) errs.push("splitFront");
    if (sp.ice) {
      if (!Array.isArray(sp.ice.map) || sp.ice.map.length < 2 ||
          sp.ice.map.some(p => !Array.isArray(p) || p.length !== 2 || !(p[0] > 0) || !(p[1] >= 0))) errs.push("ice.map");
      if (!(sp.ice.idleRpm > 0) || !(sp.ice.redlineRpm > sp.ice.idleRpm)) errs.push("ice.rpm");
    }
    if (sp.architecture !== "ev" && !sp.ice) errs.push("ice(required for non-ev)");
    if (sp.architecture === "ev" && !sp.motorF && !sp.motorR) errs.push("motor(required for ev)");
    if (sp.gearbox) {
      if (!Array.isArray(sp.gearbox.ratios) || sp.gearbox.ratios.length < 1 ||
          sp.gearbox.ratios.some(r => !(r > 0))) errs.push("gearbox.ratios");
      if (!(sp.gearbox.finalDrive > 0)) errs.push("gearbox.finalDrive");
      if (!(sp.gearbox.shiftTimeMs >= 0)) errs.push("gearbox.shiftTimeMs");
    }
    for (const k of ["motorF", "motorR"]) if (sp[k]) {
      if (!(sp[k].peakTorqueNm > 0) || !(sp[k].peakPowerKw > 0) || !(sp[k].maxRpm > 0)) errs.push(k);
    }
    if (sp.battery && !(sp.battery.capacityKwh > 0)) errs.push("battery.capacityKwh");
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
      iceOmega: (sp.ice ? sp.ice.idleRpm : 800) * Math.PI / 30,
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
  }
};
if (typeof window !== "undefined") window.POWERTRAIN = POWERTRAIN;
POWERTRAIN.setSpec(POWERTRAIN.defaultSpec());
