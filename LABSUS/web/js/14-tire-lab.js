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
    /* M-1：舞台重建统一走本路径——SLOPE 引擎构造期固化 ReF，
       activateCustom/restoreBuiltin/applyFromForm 全部经由 applyToState 收敛 */
    this.rebuildActiveStages();
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
    if (typeof loadVehiclePreset === "function") {
      loadVehiclePreset(S.vehicleType);
      /* 预设重载 deepClone 轴对象后 _kTBase 失效——恢复内置后状态即预设，
         重捕基准使 kT === _kTBase 不变式成立（与 applyToState 捕获逻辑幂等） */
      ["front", "rear"].forEach(ax => {
        const A = S[ax];
        if (A && typeof A.kT === "number") A._kTBase = A.kT;
      });
    }
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
  },

  /* 已存预设管理区：名称 + 保存时间 + 删除（规格 §7 删除入口，解除 20 条上限死锁） */
  renderSavedList() {
    const box = document.getElementById("tlSavedList"); if (!box) return;
    const names = Object.keys(this.customs);
    if (!names.length) { box.innerHTML = ""; return; }
    let html = `<div style="font:700 11px var(--font-ui);color:#58a6ff;margin-bottom:4px;">已存预设（${names.length}/${this.MAX_CUSTOMS}）</div>`;
    names.forEach(n => {
      const c = this.customs[n];
      const when = (c.meta && c.meta.savedAt) ? c.meta.savedAt.slice(0, 10) : "";
      html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
        <span style="flex:1;font:11px var(--font-ui);color:#c9d1d9;">🛞 ${n}` +
        `<span style="color:#8b949e;"> · ${when} · ${c.meta && c.meta.sourceVehicle ? c.meta.sourceVehicle : ""}</span></span>` +
        `<button data-tl-del="${n}" style="background:none;border:1px solid #30363d;color:#f85149;border-radius:4px;padding:1px 8px;cursor:pointer;font:11px var(--font-ui);">删除</button>` +
        `</div>`;
    });
    box.innerHTML = html;
    const dels = box.querySelectorAll ? box.querySelectorAll("button[data-tl-del]") : [];
    for (let i = 0; i < dels.length; i++) {
      const btn = dels[i];
      btn.onclick = () => { this.deleteCustom(btn.dataset ? btn.dataset.tlDel : btn.getAttribute("data-tl-del")); this.renderSavedList(); };
    }
  },

  /* ── 弹窗 UI（懒构建；样式内联，与舞台 modal 同风格暗色面板）── */
  open() {
    if (!this._modal) { this._modal = this.buildModal(); document.body.appendChild(this._modal); }
    this._form = this.captureFromPreset();
    this.renderForm();
    this._modal.style.display = "flex";
  },
  close() { if (this._modal) this._modal.style.display = "none"; },

  /* MF 峰值侧偏角（度）：与 11-stages.js resolveTireParams 的 sPeak 二分同构。
     Cy<1 无内部峰值 → NaN（UI 显示 ∞） */
  alphaPeakDeg(By, Cy, Ey) {
    if (!(Cy >= 1.0) || !(By > 0)) return NaN;
    const argT = Math.tan(Math.PI / (2 * Cy));
    const f = s => s - Ey * (s - Math.atan(s)) - argT;
    let lo = 1e-6, hi = 50.0;
    if (f(lo) > 0) return Math.atan(lo / By) * 180 / Math.PI;
    if (f(hi) < 0) return NaN;
    for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (f(m) > 0) hi = m; else lo = m; }
    return Math.atan((0.5 * (lo + hi)) / By) * 180 / Math.PI;
  },

  /* 派生量回显：名义规格 / 扁平比 / 滚动半径 / 接地面积（@FzNom 与胎压） */
  updateDerived() {
    const f = this.readForm(); if (!f) return;
    ["F", "R"].forEach(ax => {
      const a = f[ax.toLowerCase()], e = document.getElementById("tl_derive_" + ax);
      if (!e || !a) return;
      const side = a.R - a.rim / 2, aspect = a.W > 0 ? (side / a.W * 100) : 0;
      const area = a.p > 0 ? (f.mf.FzNom / (a.p * 1000) * 1e4) : 0;  // cm²
      e.textContent = `${Math.round(a.W)}/${Math.round(aspect)}R${(a.rim / 25.4).toFixed(0)}` +
        ` · 扁平比 ${aspect.toFixed(0)}% · 滚动半径 ${(a.R / 1000).toFixed(3)}m · 接地 ${area.toFixed(0)}cm²@FzNom`;
    });
    const mfe = document.getElementById("tl_derive_MF");
    if (mfe) {
      const ap = this.alphaPeakDeg(f.mf.By, f.mf.Cy, f.mf.Ey);
      mfe.textContent = `峰值侧偏角 ≈ ${isFinite(ap) ? ap.toFixed(1) : "∞"}° · μ=${(f.mf.Fy0 / f.mf.FzNom).toFixed(2)}`;
    }
  },

  axleCol(key, label) {
    const n = (k, t, u, lo, hi, st) =>
      `<label style="display:flex;justify-content:space-between;gap:6px;margin:3px 0;">
         <span>${t}${u ? " (" + u + ")" : ""}</span>
         <input id="tl_${key}_${k}" type="number" step="${st}" min="${lo}" max="${hi}"
           style="width:76px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 5px;font:11px monospace;">
       </label>`;
    return `<div style="flex:1;background:#10151d;border:1px solid #21262d;border-radius:8px;padding:8px 10px;">
      <div style="font:700 11px var(--font-ui);color:#58a6ff;margin-bottom:5px;">${label}</div>
      ${n("R", "外径 R", "mm", 200, 800, 1)}${n("W", "胎宽 W", "mm", 100, 400, 1)}
      ${n("rim", "轮毂直径", "mm", 203, 533, 0.1)}${n("rimW", "轮毂宽度", "mm", 127, 330, 1)}
      ${n("et", "偏距 ET", "mm", -20, 60, 1)}${n("p", "胎压", "kPa", 120, 350, 1)}
      <div id="tl_derive_${key}" style="font:10px monospace;color:#8b949e;margin-top:5px;min-height:24px;"></div>
    </div>`;
  },

  buildModal() {
    const m = document.createElement("div");
    m.id = "tireLabModal";
    m.style.cssText = "position:fixed;inset:0;z-index:400;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);";
    const nMF = (k, t, lo, hi, st) =>
      `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;">
         <span style="font:10px var(--font-ui);color:#8b949e;">${t}</span>
         <input id="tl_mf_${k}" type="number" step="${st}" min="${lo}" max="${hi}"
           style="width:84px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 5px;font:11px monospace;text-align:center;">
       </label>`;
    m.innerHTML = `<div style="width:760px;max-height:88vh;overflow:auto;background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:16px;color:#e6edf3;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <b style="font:700 15px var(--font-ui);">🛞 轮胎工坊 TIRE LAB</b>
        <button id="tlClose" style="background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;">✕</button>
      </div>
      <div id="tlCalibNote" style="display:none;font:11px var(--font-ui);color:#d29922;margin-bottom:8px;">
        ⚠ 实测标定结果存在，力学参数以标定为准（本弹窗自定义仅在标定清除后生效）
      </div>
      <div style="display:flex;gap:10px;">
        ${this.axleCol("F", "前轴 FRONT")}
        ${this.axleCol("R", "后轴 REAR")}
      </div>
      <div style="background:#10151d;border:1px solid #21262d;border-radius:8px;padding:8px 10px;margin-top:10px;">
        <div style="font:700 11px var(--font-ui);color:#58a6ff;margin-bottom:5px;">力学参数 MF（四轮共用）</div>
        <div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:6px;">
          ${nMF("Fy0", "Fy0 (N)", 1000, 20000, 50)}${nMF("FzNom", "FzNom (N)", 500, 10000, 50)}
          ${nMF("By", "By", 8, 32, 0.5)}${nMF("Cy", "Cy", 1.0, 1.6, 0.05)}
          ${nMF("Ey", "Ey", -1.0, 0, 0.05)}${nMF("LS", "LS", 0, 1, 0.01)}${nMF("Cg", "Cg", 0.2, 12, 0.1)}
        </div>
        <div id="tl_derive_MF" style="font:10px monospace;color:#8b949e;margin-top:6px;min-height:14px;"></div>
      </div>
      <div id="tlSavedList" style="margin-top:10px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button id="tlRestore" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">恢复内置</button>
        <button id="tlSave" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">保存为预设</button>
        <button id="tlCancel" style="background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 12px;cursor:pointer;font:600 11px var(--font-ui);">取消</button>
        <button id="tlApply" style="background:#238636;border:1px solid #2ea043;color:#fff;border-radius:6px;padding:5px 14px;cursor:pointer;font:700 11px var(--font-ui);">应用 APPLY</button>
      </div>
    </div>`;
    /* 事件绑定：m 此刻尚未插入 document，document.getElementById 找不到
       innerHTML 内元素（未连接树）；用 m.querySelector 子树查找，
       未连接状态也可命中（真实浏览器 + 沙箱桩均安全） */
    try {
      const q = id => m.querySelector("#" + id);
      q("tlClose").onclick = () => this.close();
      q("tlCancel").onclick = () => this.close();
      q("tlApply").onclick = () => this.applyFromForm();
      q("tlSave").onclick = () => this.saveFromForm();
      q("tlRestore").onclick = () => { this.restoreBuiltin(); this.rebuildActiveStages(); this.close(); };
    } catch (e) { console.warn("TIRE_LAB modal bind failed:", e); }
    try { m.addEventListener("input", () => this.updateDerived()); } catch (e) { console.warn("TIRE_LAB modal bind failed:", e); }
    return m;
  },

  renderForm() {
    const f = this._form; if (!f) return;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    ["front", "rear"].forEach(ax => {
      const K = ax === "front" ? "F" : "R";
      ["R", "W", "rim", "rimW", "et", "p"].forEach(k => set(`tl_${K}_${k}`, f[ax][k]));
    });
    Object.keys(f.mf).forEach(k => set("tl_mf_" + k, f.mf[k]));
    const calibNote = document.getElementById("tlCalibNote");
    if (calibNote) calibNote.style.display = (SIM.tireCalib) ? "block" : "none";
    /* M-3：实测标定存在时 MF 输入置灰——优先级 tireCalib > userTire，
       自定义暂不生效；标定清除后恢复可编辑 */
    const calib = !!SIM.tireCalib;
    ["Fy0", "FzNom", "By", "Cy", "Ey", "LS", "Cg"].forEach(k => {
      const e = document.getElementById("tl_mf_" + k);
      if (e) { e.disabled = calib; e.style.opacity = calib ? "0.45" : "1"; }
    });
    this.updateDerived();
    this.renderSavedList();
  },

  readForm() {
    const num = id => { const e = document.getElementById(id); return e ? parseFloat(e.value) : NaN; };
    const g = (k, ax) => num(ax ? `tl_${ax}_${k}` : `tl_mf_${k}`);
    return {
      front: { R: g("R", "F"), W: g("W", "F"), rim: g("rim", "F"), rimW: g("rimW", "F"), et: g("et", "F"), p: g("p", "F") },
      rear: { R: g("R", "R"), W: g("W", "R"), rim: g("rim", "R"), rimW: g("rimW", "R"), et: g("et", "R"), p: g("p", "R") },
      mf: { Fy0: g("Fy0"), FzNom: g("FzNom"), By: g("By"), Cy: g("Cy"), Ey: g("Ey"), LS: g("LS"), Cg: g("Cg") }
    };
  },

  markErrors(errors) {
    ["F", "R"].forEach(ax => ["R", "W", "rim", "rimW", "et", "p"].forEach(k => {
      const e = document.getElementById(`tl_${ax}_${k}`); if (e) e.style.borderColor = "#30363d";
    }));
    ["Fy0", "FzNom", "By", "Cy", "Ey", "LS", "Cg"].forEach(k => {
      const e = document.getElementById("tl_mf_" + k); if (e) e.style.borderColor = "#30363d";
    });
    errors.forEach(label => {
      const parts = label.split(".");           // "front.R" | "mf.Fy0"
      const id = parts[0] === "mf" ? "tl_mf_" + parts[1]
        : "tl_" + (parts[0] === "front" ? "F" : "R") + "_" + parts[1];
      const e = document.getElementById(id); if (e) e.style.borderColor = "#f85149";
    });
  },

  applyFromForm() {
    const cfg = this.readForm();
    const v = this.validate(cfg);
    if (!v.ok) { this.markErrors(v.errors); return; }
    this.applyToState(cfg);   // M-1：rebuildActiveStages 已由 applyToState 统一触发
    this.close();
  },

  saveFromForm() {
    const cfg = this.readForm();
    const v = this.validate(cfg);
    if (!v.ok) { this.markErrors(v.errors); return; }
    const name = (typeof prompt === "function" && prompt("预设名称：", "我的轮胎")) || null;
    if (!name) return;
    // 先应用后保存：保存失败（dup/limit）时配置已生效，与「应用」语义一致（有意顺序）
    this.applyToState(cfg);
    const r = this.saveCustom(name);
    if (!r.ok) {
      /* G29-P7：失败不关窗——用户可改名/删除旧条目后在表单内直接重试 */
      if (r.error === "limit" && typeof alert === "function") alert("自定义预设已达 20 条上限，请先删除旧条目。");
      else if (r.error === "dup" && typeof alert === "function") alert("名称已存在。");
      return;
    }
    this.close();
  },

  /* 舞台生效路径：SLOPE 打开期间直接重建 15-DOF 引擎——switchScenario 仅在
     undulating_road 进/出分支重建（L1110/L1134），其余场景只 resetVehicle，
     构造期固化的 ReF/ReR（L301-302）不会刷新；
     SKIDPAD/CIRCUIT 引擎在打开舞台时构造，重新打开舞台后生效 */
  rebuildActiveStages() {
    try {
      if (typeof SLOPE_STAGE !== "undefined" && SLOPE_STAGE.active &&
          typeof VehicleDynamics15DOF === "function" && typeof SIM !== "undefined") {
        const cfg = SLOPE_STAGE.scenarioConfigs[SLOPE_STAGE.scenario] || {};
        const kmh = (SLOPE_STAGE.scenario === "accel_brake") ? 0
                  : (cfg.speedKmh || SLOPE_STAGE.speedKmh || 85);
        window.physicsEngine = new VehicleDynamics15DOF(S, SIM, (kmh * 1000) / 3600);
        SLOPE_STAGE.resetVehicle();  // 位置/姿态/omega 与新 Re 对齐（速度优先级与 openSlopeStage 一致）
      }
    } catch (e) {}
  }
};
if (typeof window !== "undefined") window.TIRE_LAB = TIRE_LAB;
TIRE_LAB.loadAll();

/* G29 启动恢复：刷新后重放激活的自定义轮胎 + 填充预设下拉（规格 §7）。
   本脚本在 body 底部同步执行，DOM 已就绪；try/catch 防御降级不阻断启动。 */
try {
  if (TIRE_LAB.active) TIRE_LAB.applyToState(deepClone(TIRE_LAB.active));
  TIRE_LAB.refreshPresetSelect();
} catch (e) { console.warn("TIRE_LAB startup restore failed:", e); }
