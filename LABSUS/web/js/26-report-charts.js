"use strict";
/* ============================================================================
 * LABSUS · 26-report-charts.js —— 图表层（2026-11-24，AI 闭环 P1）
 *
 * 职责：chart spec → canvas → PNG dataURL。
 * 设计：**数据与绘图分离** —— spec.data 保留原始数组（进 JSON），PNG 只用于 HTML/MD 展示。
 *
 * 支持类型：
 *   · line  —— 多序列折线（K&C 曲线族 / 振动时程 / 台架曲线 / FSAE 事件）
 *   · radar —— 六维雷达（评价报告复用）
 * 无头沙箱（web/test/_stage_harness.js）无真实 canvas ⇒ 返回占位 PNG，**绝不抛错**。
 * ============================================================================ */
(function (global) {
  const W = 640, H = 360, PAD = 44;
  const PALETTE = ["#4C9BE8", "#E8A04C", "#6FCF97", "#EB5757", "#BB6BD9", "#56CCF2"];
  const BG = "#0E1520";

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /** 校验 chart spec；返回 {ok, errors[]} */
  function validate(spec) {
    const errs = [];
    if (!spec || typeof spec !== "object") return { ok: false, errors: ["spec 不是对象"] };
    if (spec.type === "radar") {
      if (!Array.isArray(spec.axes) || spec.axes.length < 3) errs.push("radar.axes 至少 3 个");
      if (!Array.isArray(spec.values) || spec.values.length !== (spec.axes || []).length)
        errs.push("radar.axes/values 长度必须一致");
      if ((spec.values || []).some(v => !isNum(v))) errs.push("radar.values 必须全是有限数值");
      return { ok: errs.length === 0, errors: errs };
    }
    if (spec.type !== "line") errs.push("未知 type: " + spec.type);
    const data = spec.data || {};
    if (!Array.isArray(data.x) || data.x.length < 2) errs.push("data.x 至少 2 点");
    if (!Array.isArray(data.series) || data.series.length < 1) errs.push("data.series 为空");
    (data.series || []).forEach((s, i) => {
      if (!s || typeof s !== "object") { errs.push("series[" + i + "] 非对象"); return; }
      if (!Array.isArray(s.y) || s.y.length !== (data.x || []).length)
        errs.push("series[" + i + "] y 长度须与 x 一致");
      if (!Array.isArray(s.y) || !s.y.some(isNum)) errs.push("series[" + i + "] 无有效数值");
    });
    return { ok: errs.length === 0, errors: errs };
  }

  /** 构造 line spec（数据仍原样保存） */
  function line(o) {
    o = o || {};
    return {
      type: "line",
      title: o.title || "",
      unit: o.unit || "",
      xLabel: o.xLabel || "",
      yLabel: o.yLabel || "",
      data: {
        x: (o.x || []).slice(),
        series: (o.series || []).map(s => ({ name: s.name || "", y: (s.y || []).slice() }))
      },
      opts: { zero: !!o.zero }
    };
  }

  /** 构造 radar spec */
  function radar(o) {
    o = o || {};
    return {
      type: "radar",
      title: o.title || "",
      axes: (o.axes || []).slice(),
      values: (o.values || []).slice(),
      max: isNum(o.max) ? o.max : null,
      data: { x: [], series: [] }
    };
  }

  function makeCanvas() {
    try {
      if (typeof document !== "undefined" && document && typeof document.createElement === "function") {
        const cv = document.createElement("canvas");
        if (cv && typeof cv.getContext === "function" && typeof cv.toDataURL === "function") {
          cv.width = W; cv.height = H; return cv;
        }
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function drawGrid(g) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD + (H - 2 * PAD) * i / 4;
      g.beginPath(); g.moveTo(PAD, y); g.lineTo(W - PAD, y); g.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const x = PAD + (W - 2 * PAD) * i / 5;
      g.beginPath(); g.moveTo(x, PAD); g.lineTo(x, H - PAD); g.stroke();
    }
  }

  function drawLine(g, spec) {
    drawGrid(g);
    const xs = spec.data.x;
    const ss = spec.data.series.filter(s => s.y.some(isNum));
    let lo = Infinity, hi = -Infinity;
    ss.forEach(s => s.y.forEach(v => { if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    if (spec.opts && spec.opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const xsN = xs.filter(isNum);
    const xa = Math.min.apply(null, xsN), xb = Math.max.apply(null, xsN);
    const xr = (xb - xa) || 1;
    const px = v => PAD + (W - 2 * PAD) * ((v - xa) / xr);
    const py = v => PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo));

    ss.forEach((s, si) => {
      g.strokeStyle = PALETTE[si % PALETTE.length];
      g.lineWidth = 2;
      g.beginPath();
      let started = false;
      s.y.forEach((v, i) => {
        if (!isNum(v) || !isNum(xs[i])) { started = false; return; }
        const x = px(xs[i]), y = py(v);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      });
      g.stroke();
    });

    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.beginPath(); g.moveTo(PAD, H - PAD); g.lineTo(W - PAD, H - PAD); g.stroke();

    g.fillStyle = "rgba(225,234,245,0.92)";
    g.font = "12px sans-serif"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText(spec.title || "", PAD, 24);
    if (spec.yLabel) { g.save(); g.translate(13, H / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText(spec.yLabel, 0, 0); g.restore(); }
    if (spec.xLabel) { g.textAlign = "center"; g.fillText(spec.xLabel, W / 2, H - 12); }
    g.font = "11px sans-serif"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText((lo).toFixed(2) + " ~ " + (hi).toFixed(2), W - PAD - 96, 24);
    let lx = PAD;
    ss.forEach((s, si) => {
      g.fillStyle = PALETTE[si % PALETTE.length];
      g.fillRect(lx, H - 26, 10, 8);
      g.fillStyle = "rgba(225,234,245,0.92)";
      g.fillText(s.name || ("S" + si), lx + 14, H - 18);
      lx += 14 + Math.max(36, String(s.name || "").length * 8);
    });
  }

  function drawRadar(g, spec) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 8, R = Math.min(W, H) / 2 - 62;
    const n = Math.max(3, spec.axes.length);
    let max = spec.max;
    if (!isNum(max)) max = Math.max.apply(null, spec.values.concat([1])) || 1;
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1;
    for (let ring = 1; ring <= 3; ring++) {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + 2 * Math.PI * i / n, r = R * ring / 3;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,0.22)";
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.stroke();
    }
    g.fillStyle = "rgba(76,155,232,0.35)"; g.strokeStyle = "#4C9BE8"; g.lineWidth = 2;
    g.beginPath();
    spec.values.forEach((v, i) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n;
      const r = R * Math.max(0, Math.min(1, (v || 0) / max));
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(225,234,245,0.92)"; g.font = "12px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    spec.axes.forEach((name, i) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n;
      g.fillText(String(name), cx + (R + 22) * Math.cos(a), cy + (R + 22) * Math.sin(a));
    });
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText(spec.title || "", PAD, 24);
  }

  /**
   * 渲染：返回 { ok, errors[], png, data, width, height }
   * data 始终回带原始数组（即使渲染失败），保证 JSON 导出不丢数据。
   */
  function render(spec) {
    const v = validate(spec);
    const data = {
      x: ((spec && spec.data && spec.data.x) || []).slice(),
      series: (((spec && spec.data && spec.data.series) || [])).map(s => ({ name: s.name, y: (s.y || []).slice() }))
    };
    let png = null;
    const cv = makeCanvas();
    if (cv && v.ok) {
      try {
        const g = cv.getContext("2d");
        if (spec.type === "radar") drawRadar(g, spec); else drawLine(g, spec);
        png = cv.toDataURL("image/png");
      } catch (e) { png = null; }
    }
    return {
      ok: v.ok,
      errors: v.errors,
      png: png || "data:image/png;base64,",
      data: data,
      type: spec && spec.type,
      title: (spec && spec.title) || "",
      width: W,
      height: H
    };
  }

  global.CHART = { validate: validate, line: line, radar: radar, render: render, W: W, H: H, PALETTE: PALETTE };
})(typeof window !== "undefined" ? window : globalThis);
