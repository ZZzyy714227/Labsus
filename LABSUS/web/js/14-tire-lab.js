/* =====================================================================
   14-tire-lab.js — 轮胎工坊（G29，2026-09-04）

   自定义轮胎/轮毂尺寸 + 四轮共用 MF 力学参数 + 分轴胎压。
   架构：预设覆盖层——写运行时状态 S[axle].tire / SIM.userTire，
   不改 VEHICLE_PRESETS 出厂值、不改 resolveTireParams 缺省表（对拍锚）。

   力学参数优先级：SIM.tireCalib（实测辨识）> SIM.userTire（本模块）> 引擎缺省。
   F-61 约束：window 导出与定义同文件；TIRE_LAB 挂 window。
   ===================================================================== */
"use strict";
const TIRE_LAB = {
  MAX_CUSTOMS: 20,
  KT_K: 0.55,    // 胎压→垂刚：气压承载份额 ~55% 线性近似
  LS_K: 0.25,    // 胎压→载荷敏感度：高压使帘线张紧、胎面变硬，曲线趋平
  KEYS: { customs: "labsus-tire-customs", active: "labsus-tire-active" },
  LIMITS: {
    R: [200, 800], W: [100, 400], rim: [203, 533], rimW: [127, 330], et: [-20, 60], p: [120, 350],
    Fy0: [1000, 20000], FzNom: [500, 10000], By: [8, 32], Cy: [1.0, 1.6], Ey: [-1.0, 0], LS: [0, 1], Cg: [0.2, 12]
  },
  // 基准胎压 p0 随车型（kPa）；缺省 180
  PRESSURE_BASE: { formula: 160, gt3: 210, gt3_sport: 210, baja: 140 },
  // 与 11-stages.js resolveTireParams 的 D 表一致（改这里不会改对拍锚，仅作表单缺省）
  MF_DEFAULTS: { Fy0: 5250, FzNom: 3500, By: 20, Cy: 1.2, Ey: -0.5, LS: 0.10, Cg: 6.0 },

  customs: {}, active: null, storageOk: true, _modal: null, _form: null,

  pressureBase(type) { return this.PRESSURE_BASE[type] !== undefined ? this.PRESSURE_BASE[type] : 180; },
  kTFactor(p, p0) { return 1 + this.KT_K * (p - p0) / p0; },
  lSFactor(p, p0) { return 1 - this.LS_K * (p - p0) / p0; },

  storageGet(key) { try { return localStorage.getItem(key); } catch (e) { this.storageOk = false; return null; } },
  storageSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { this.storageOk = false; } },
  loadAll() {
    try { this.customs = JSON.parse(this.storageGet(this.KEYS.customs) || "{}") || {}; } catch (e) { this.customs = {}; }
    try { this.active = JSON.parse(this.storageGet(this.KEYS.active) || "null"); } catch (e) { this.active = null; }
  },
  persistCustoms() { this.storageSet(this.KEYS.customs, JSON.stringify(this.customs)); },
  persistActive() { this.storageSet(this.KEYS.active, JSON.stringify(this.active)); },

  /* 表单初始值：无激活自定义 → 取当前预设胎 + MF 缺省；有 → 保留用户值 */
  captureFromPreset() {
    const p0 = this.pressureBase(S.vehicleType);
    const cap = (a, old) => ({
      R: a.tire.R, W: a.tire.W, rim: a.tire.rim,
      rimW: (old && old.rimW) || Math.round(a.tire.W * 0.72),
      et: (old && old.et) || 0,
      p: (old && old.p) || p0
    });
    return {
      front: cap(S.front, this.active && this.active.front),
      rear: cap(S.rear, this.active && this.active.rear),
      mf: deepClone((this.active && this.active.mf) || this.MF_DEFAULTS)
    };
  },

  /* 校验：范围 + 可数性；FzNom<=0 / By<=0 由 LIMITS 下限覆盖 */
  validate(cfg) {
    const errors = [];
    const chk = (label, v, lim) => {
      const n = typeof v === "number" ? v : parseFloat(v);
      if (!isFinite(n) || n < lim[0] || n > lim[1]) errors.push(label);
    };
    ["front", "rear"].forEach(ax => {
      const a = (cfg && cfg[ax]) || {};
      chk(ax + ".R", a.R, this.LIMITS.R); chk(ax + ".W", a.W, this.LIMITS.W);
      chk(ax + ".rim", a.rim, this.LIMITS.rim); chk(ax + ".rimW", a.rimW, this.LIMITS.rimW);
      chk(ax + ".et", a.et, this.LIMITS.et); chk(ax + ".p", a.p, this.LIMITS.p);
    });
    const mf = (cfg && cfg.mf) || {};
    ["Fy0", "FzNom", "By", "Cy", "Ey", "LS", "Cg"].forEach(k => chk("mf." + k, mf[k], this.LIMITS[k]));
    return { ok: errors.length === 0, errors };
  },

  /* 应用覆盖层：写 S[axle].tire / kT / SIM.userTire；不触碰 VEHICLE_PRESETS */
  applyToState(cfg) {
    const a = cfg || this.active; if (!a) return;
    const p0 = this.pressureBase(S.vehicleType);
    ["front", "rear"].forEach(ax => {
      const A = S[ax];
      if (A._kTBase === undefined) A._kTBase = A.kT;   // 记住预设基准，恢复用
      A.tire = Object.assign(deepClone(A.tire), {
        R: a[ax].R, W: a[ax].W, rim: a[ax].rim, rimW: a[ax].rimW, et: a[ax].et,
        label: `CUSTOM ${a[ax].W}/${Math.round((a[ax].R - a[ax].rim / 2) / a[ax].W * 100)}R${Math.round(a[ax].rim / 25.4)}`
      });
      A.kT = A._kTBase * this.kTFactor(a[ax].p, p0);
    });
    // MF 单组共用；LS 按前轴胎压修正
    SIM.userTire = Object.assign(deepClone(a.mf), { p: a.front.p, LS: a.mf.LS * this.lSFactor(a.front.p, p0) });
    const nm = (this.active && this.active.name) || null;
    this.active = deepClone(a); this.active.name = nm;
    this.persistActive();
    if (typeof rebuild === "function") { try { rebuild(); } catch (e) {} }
  },

  activateCustom(name) {
    const c = this.customs[name]; if (!c) return;
    this.applyToState({ front: deepClone(c.front), rear: deepClone(c.rear), mf: deepClone(c.mf) });
    this.active.name = name; this.persistActive();
  },

  saveCustom(name) {
    if (!name || !this.active) return { ok: false, error: "noname" };
    if (this.customs[name]) return { ok: false, error: "dup" };
    if (Object.keys(this.customs).length >= this.MAX_CUSTOMS) return { ok: false, error: "limit" };
    this.customs[name] = {
      meta: { savedAt: new Date().toISOString(), sourceVehicle: S.vehicleType },
      front: deepClone(this.active.front), rear: deepClone(this.active.rear), mf: deepClone(this.active.mf)
    };
    this.active.name = name; this.persistActive(); this.persistCustoms();
    this.refreshPresetSelect();
    return { ok: true };
  },

  deleteCustom(name) {
    delete this.customs[name];
    if (this.active && this.active.name === name) { this.active.name = null; this.persistActive(); }
    this.persistCustoms(); this.refreshPresetSelect();
  },

  restoreBuiltin() {
    this.active = null; this.persistActive();
    SIM.userTire = null;
    if (typeof loadVehiclePreset === "function") loadVehiclePreset(S.vehicleType);
  },

  /* 02-presets 钩子：换车型后重放覆盖层（kT 基准随新预设刷新） */
  syncAfterPreset() { if (this.active) this.applyToState(deepClone(this.active)); },

  /* 预设下拉追加「自定义轮胎」分组 */
  refreshPresetSelect() {
    const sel = document.getElementById("topVehSelect"); if (!sel) return;
    if (sel.querySelectorAll) {
      const olds = sel.querySelectorAll('optgroup[data-tirelab]');
      for (let i = 0; i < olds.length; i++) { try { olds[i].remove(); } catch (e) {} }
    }
    const names = Object.keys(this.customs); if (!names.length) return;
    const g = document.createElement("optgroup");
    g.setAttribute("label", "🛞 自定义轮胎"); g.setAttribute("data-tirelab", "1");
    names.forEach(n => {
      const o = document.createElement("option");
      o.value = "tirecustom:" + n; o.textContent = "🛞 " + n;
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
};
if (typeof window !== "undefined") window.TIRE_LAB = TIRE_LAB;
TIRE_LAB.loadAll();
