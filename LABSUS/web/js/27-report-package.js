"use strict";
/* ============================================================================
 * LABSUS · 27-report-package.js —— 标准交付层（2026-11-24，AI 闭环 P2）
 *
 * 三件套：
 *   report.html  自包含可视化报告（内嵌 PNG，可打印、无外链）
 *   analysis.json LABSUS_ANALYSIS_V2（数据 + 图表原始数组 + 白名单/边界，供 AI）
 *   prompt.md    AI 提示词（指标表 + 图表清单 + 调校白名单 + 输出格式要求）
 *
 * 依赖：26-report-charts.js（CHART，可选；缺失时 PNG 以空占位降级）
 * 无头沙箱可运行（不触碰 DOM，只有 download() 需要 document）。
 * ============================================================================ */
(function (global) {
  const SCHEMA = "LABSUS_ANALYSIS_V2";
  const PROPOSAL_SCHEMA = "LABSUS_PROPOSAL_V1";

  /* AI 允许修改的参数白名单（前缀通配）——档位（轮胎/动力）刻意不在其中 */
  const EDITABLE = [
    "hardpoints.*",
    "springs.*",
    "arb.*",
    "damperClicks.*",
    "tire.pressures.*",
    "mass.*"
  ];

  /* 物理边界（越界一律拒绝，不做静默夹紧） */
  const BOUNDS = {
    "springs.front.kSNmm": [15, 60],
    "springs.rear.kSNmm": [12, 60],
    "arb.front.dNmPerDeg": [0, 900],
    "arb.rear.dNmPerDeg": [0, 900],
    "damperClicks": [0, 11],
    "tire.pressures": [120, 240],
    "mass.mTotalKg": [200, 380],
    "mass.mSprungKg": [150, 330],
    "mass.hcgMm": [240, 420],
    "hardpoints": [-400, 400]
  };

  const UNITS = { length: "mm", force: "N", angle: "deg", mass: "kg", speed: "m/s", freq: "Hz" };

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* ── 1. 把 25-full-report 的原始 rep 映射为 ANALYSIS_V2 结构 ───────── */
  function toAnalysis(rep) {
    rep = rep || {};
    const v = rep.vehicle || {};
    const sections = [
      { id: "kc", title: "运动学与 K&C", data: rep.staticKC },
      { id: "ride", title: "垂向平顺性与模态", data: rep.ride },
      { id: "lateral", title: "横向稳态与瞬态", data: rep.lateral },
      { id: "longitudinal", title: "纵向加减速与制动", data: rep.longitudinal },
      { id: "capability", title: "整车 G-G 能力包络", data: rep.capability },
      { id: "fsae", title: "FSAE 动态赛", data: rep.fsae },
      { id: "tracks", title: "试验场与赛道包络", data: rep.tracks }
    ].map(s => {
      const d = s.data || {};
      const charts = (Array.isArray(d.charts) ? d.charts : []).map(c => ({
        id: c.id || c.title || "chart",
        title: c.title || "",
        type: c.type || "line",
        unit: c.unit || "",
        xLabel: c.xLabel || "",
        yLabel: c.yLabel || "",
        data: c.data || { x: [], series: [] }
      }));
      return {
        id: s.id,
        title: s.title,
        metrics: stripCharts(d),
        charts: charts
      };
    });
    return {
      schema: SCHEMA,
      generatedAt: rep.generatedAt || new Date().toISOString(),
      hash: "",
      units: UNITS,
      setup: {
        vehicleType: v.vehicleType || "?",
        vehicleName: v.vehicleName || "Custom",
        wbMm: v.wbMm,
        trackFrontMm: v.trackFrontMm,
        trackRearMm: v.trackRearMm,
        mass: { mTotalKg: v.mTotalKg, mSprungKg: v.mSprungKg, hcgMm: v.hcgMm },
        tire: v.front && v.front.tire ? Object.assign({}, v.front.tire) : null,
        springs: {
          front: { kSNmm: v.front && v.front.kSNmm, cRNsmm: v.front && v.front.cRNsmm },
          rear: { kSNmm: v.rear && v.rear.kSNmm, cRNsmm: v.rear && v.rear.cRNsmm }
        },
        arb: {
          front: { dMm: v.front && v.front.arbMm },
          rear: { dMm: v.rear && v.rear.arbMm }
        },
        hardpoints: {
          front: v.front && v.front.hp ? v.front.hp : null,
          rear: v.rear && v.rear.hp ? v.rear.hp : null
        },
        perfTiers: v.perfTiers || null,
        workshop: v.workshop || null
      },
      editable: EDITABLE.slice(),
      bounds: JSON.parse(JSON.stringify(BOUNDS)),
      sections: sections,
      insights: Array.isArray(rep.insights) ? rep.insights : [],
      history: Array.isArray(rep.history) ? rep.history : []
    };
  }

  /** 去掉 charts 字段后的指标副本（避免 JSON 里重复大数组） */
  function stripCharts(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    Object.keys(obj).forEach(k => {
      if (k === "charts") return;
      out[k] = obj[k];
    });
    return out;
  }

  /** 稳定 hash：只对 setup + sections 数据 + insights 计算（不含时间戳） */
  function hash(analysis) {
    const basis = JSON.stringify({
      s: analysis.setup, sec: (analysis.sections || []).map(x => ({ id: x.id, m: x.metrics, c: x.charts })),
      i: analysis.insights
    });
    /* 32-bit FNV-1a，够用于「方案对号」而非安全用途 */
    let h = 0x811c9dc5;
    for (let i = 0; i < basis.length; i++) {
      h ^= basis.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return "A" + h.toString(16).padStart(8, "0");
  }

  /* ── 2. JSON（送 AI 的数据包；不内嵌 PNG，保持体积可控） ────────── */
  function json(rep) {
    const a = toAnalysis(rep);
    a.hash = hash(a);
    return JSON.stringify(a, null, 2);
  }

  /* ── 3. HTML（自包含可视化报告，PNG 内嵌） ─────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtVal(v) {
    if (v == null) return "—";
    if (typeof v === "number") return isNum(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 10 ? 2 : 1)) : "—";
    if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
    return esc(v);
  }

  function renderChartPNG(spec) {
    try {
      if (global.CHART && typeof global.CHART.render === "function") {
        const r = global.CHART.render(spec);
        if (r && r.png && r.png.indexOf("data:image/png") === 0 && r.png.length > 25) return r.png;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function metricsTable(metrics) {
    if (!metrics || typeof metrics !== "object") return "";
    const rows = [];
    Object.keys(metrics).forEach(k => {
      const v = metrics[k];
      if (v && typeof v === "object") {
        Object.keys(v).slice(0, 8).forEach(k2 => {
          if (typeof v[k2] === "number" || typeof v[k2] === "string" || typeof v[k2] === "boolean")
            rows.push([k + "." + k2, fmtVal(v[k2])]);
        });
      } else {
        rows.push([k, fmtVal(v)]);
      }
    });
    if (!rows.length) return "";
    return '<table><tbody>' + rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + r[1] + '</td></tr>').join("") + '</tbody></table>';
  }

  function html(rep) {
    const a = toAnalysis(rep);
    a.hash = hash(a);
    const css = [
      "body{background:#0b111a;color:#dbe6f3;font:13px/1.6 -apple-system,'Segoe UI',sans-serif;margin:0;padding:28px}",
      "h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 10px;border-left:3px solid #4C9BE8;padding-left:10px}",
      "h3{font-size:13px;margin:16px 0 6px;color:#9fb6cf}",
      ".meta{color:#7f95ad;font-size:12px;margin-bottom:18px}",
      ".kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}",
      ".kpi{background:#121b27;border:1px solid #1e2c3d;border-radius:8px;padding:8px 10px}",
      ".kpi b{color:#8fd0ff;font-size:14px}",
      ".charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}",
      ".chart{background:#121b27;border:1px solid #1e2c3d;border-radius:8px;padding:8px}",
      ".chart img{width:100%;border-radius:4px;background:#0E1520}",
      ".badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:9px;margin-right:6px}",
      ".badge.warn{background:#4a3411;color:#f2b84b}.badge.bad{background:#4a1a1a;color:#ef7b7b}.badge.info{background:#12304a;color:#7fc4ff}",
      "table{border-collapse:collapse;width:100%;font-size:12px}td{border-bottom:1px solid #17222f;padding:3px 8px}",
      "td:first-child{color:#8ea6bf;white-space:nowrap}",
      ".insight{margin:4px 0;padding:6px 8px;background:#121b27;border-radius:6px}",
      "ul{list-style:none;padding:0;margin:0}",
      "footer{margin-top:30px;color:#607a93;font-size:11px}"
    ].join("");
    const parts = [];
    parts.push("<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">");
    parts.push("<title>LABSUS 全量分析报告 · " + esc(a.setup.vehicleName) + "</title>");
    parts.push("<style>" + css + "</style></head><body>");
    parts.push("<h1>LABSUS 全量分析报告</h1>");
    parts.push('<div class="meta">' + esc(a.setup.vehicleType) + ' · 轴距 ' + fmtVal(a.setup.wbMm) + ' mm · 整备 ' +
      fmtVal(a.setup.mass.mTotalKg) + ' kg · schema ' + SCHEMA + ' · hash ' + a.hash +
      ' · ' + esc(a.generatedAt) + '</div>');

    /* 结论优先 */
    if (a.insights.length) {
      parts.push("<h2>工程结论与短板</h2>");
      a.insights.forEach(x => {
        const sev = x.severity === "bad" ? "bad" : (x.severity === "warn" ? "warn" : "info");
        parts.push('<div class="insight"><span class="badge ' + sev + '">' + esc(x.severity || "info") + '</span>' +
          esc(x.area || "") + ' · ' + esc(x.text || "") + '</div>');
      });
    }

    a.sections.forEach(sec => {
      if (!sec.metrics && !(sec.charts && sec.charts.length)) return;
      parts.push("<h2>" + esc(sec.title) + "</h2>");
      const mt = metricsTable(sec.metrics);
      if (mt) parts.push(mt);
      if (sec.charts && sec.charts.length) {
        parts.push('<div class="charts">');
        sec.charts.forEach(c => {
          const png = renderChartPNG(c);
          parts.push('<div class="chart">' + (png ? '<img src="' + png + '" alt="' + esc(c.title) + '">'
            : '<h3>' + esc(c.title) + '</h3><div style="color:#8899aa">（无 canvas 环境，图表仅数据见 JSON）</div>') +
            '<div class="meta">' + esc(c.id) + (c.unit ? ' · ' + esc(c.unit) : '') + '</div></div>');
        });
        parts.push('</div>');
      }
    });

    parts.push("<footer>LABSUS · " + SCHEMA + " · 生成于 " + esc(a.generatedAt) +
      " · 本报告自包含（无外部请求）</footer>");
    parts.push("</body></html>");
    return parts.join("");
  }

  /* ── 4. Markdown（AI 提示词） ───────────────────────────────────── */
  function markdown(rep) {
    const a = toAnalysis(rep);
    a.hash = hash(a);
    const L = [];
    L.push("# LABSUS 悬架全量分析 · 给 AI 工程助手的提示词");
    L.push("");
    L.push("> schema `" + SCHEMA + "` · hash `" + a.hash + "` · " + a.generatedAt);
    L.push("> 请基于以下数据给出**可执行的调校方案**，输出格式见文末 `" + PROPOSAL_SCHEMA + "`。");
    L.push("");
    L.push("## 1. 车辆与当前设定");
    L.push("");
    L.push("| 项 | 值 |");
    L.push("|---|---|");
    L.push("| 车型 | " + a.setup.vehicleType + " |");
    L.push("| 轴距 | " + fmtVal(a.setup.wbMm) + " mm |");
    L.push("| 整备质量 | " + fmtVal(a.setup.mass.mTotalKg) + " kg |");
    L.push("| 簧上质量 | " + fmtVal(a.setup.mass.mSprungKg) + " kg |");
    L.push("| 质心高 | " + fmtVal(a.setup.mass.hcgMm) + " mm |");
    L.push("| 前/后弹簧 | " + fmtVal(a.setup.springs.front.kSNmm) + " / " + fmtVal(a.setup.springs.rear.kSNmm) + " N/mm |");
    L.push("| 前/后 ARB | " + fmtVal(a.setup.arb.front.dMm) + " / " + fmtVal(a.setup.arb.rear.dMm) + " mm |");
    if (a.setup.perfTiers) L.push("| 性能档位 | " + JSON.stringify(a.setup.perfTiers) + " |");
    L.push("");

    L.push("## 2. 分析结果");
    a.sections.forEach(sec => {
      if (!sec.metrics && !(sec.charts && sec.charts.length)) return;
      L.push("");
      L.push("### 2." + (a.sections.indexOf(sec) + 1) + " " + sec.title);
      if (sec.metrics) {
        L.push("");
        L.push("```json");
        L.push(JSON.stringify(sec.metrics, null, 1).slice(0, 4000));
        L.push("```");
      }
      if (sec.charts && sec.charts.length) {
        L.push("");
        L.push("图表（数据数组在 `analysis.json` 的 `sections[" + sec.id + "].charts`）：");
        sec.charts.forEach(c => {
          L.push("- `" + c.id + "` · " + c.title + (c.unit ? " · " + c.unit : "") +
            " · x: " + ((c.data && c.data.x) || []).length + " 点 · 序列 " +
            (((c.data && c.data.series) || []).map(s => s.name).join("/") || "—"));
        });
      }
    });

    L.push("");
    L.push("## 3. 工程结论（软件已高亮）");
    L.push("");
    (a.insights || []).forEach(x => L.push("- [" + (x.severity || "info") + "] " + (x.area || "") + "：" + (x.text || "")));
    if (!a.insights || !a.insights.length) L.push("- （无自动结论）");

    L.push("");
    L.push("## 4. 允许修改的参数（白名单）");
    L.push("");
    L.push("只能改下列前缀，**不得修改轮胎档/动力档**（`tireTier` / `powerTier` 不在白名单内）：");
    L.push("");
    L.push("```text");
    EDITABLE.forEach(p => L.push(p));
    L.push("```");
    L.push("");
    L.push("边界（越界会被软件拒绝）：");
    L.push("");
    L.push("```json");
    L.push(JSON.stringify(BOUNDS, null, 1));
    L.push("```");

    L.push("");
    L.push("## 5. 输出格式（必须严格遵守）");
    L.push("");
    L.push("只输出一个 JSON 对象（不要额外解释文本）：");
    L.push("");
    L.push("```json");
    L.push(JSON.stringify({
      schema: PROPOSAL_SCHEMA,
      basedOn: "<上面的 hash>",
      changes: [
        { path: "springs.front.kSNmm", value: 26.0, unit: "N/mm",
          reason: "为什么改这一项（引用上面的具体指标）",
          expected: { understeerDegPerG: -0.05 } }
      ],
      rationale: "整体调校思路（一句话）",
      risk: "可能带来的副作用与需要复测的项"
    }, null, 2));
    L.push("```");
    L.push("");
    L.push("规则：每条 change 的 `path` 必须在白名单内、`value` 在边界内；");
    L.push("不确定的项不要写；如果当前设定已足够好，返回 `changes: []` 并说明。");
    return L.join("\n");
  }

  /* ── 5. 下载（仅浏览器） ─────────────────────────────────────────── */
  function download(filename, text, mime) {
    if (typeof document === "undefined" || !document || typeof document.createElement !== "function") return false;
    try {
      const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 0);
      return true;
    } catch (e) { return false; }
  }

  function build(rep) {
    const analysis = toAnalysis(rep);
    analysis.hash = hash(analysis);
    return { html: html(rep), json: json(rep), markdown: markdown(rep), hash: analysis.hash, analysis: analysis };
  }

  const api = {
    SCHEMA: SCHEMA, PROPOSAL_SCHEMA: PROPOSAL_SCHEMA,
    EDITABLE: EDITABLE, BOUNDS: BOUNDS, UNITS: UNITS,
    toAnalysis: toAnalysis, hash: hash,
    html: html, json: json, markdown: markdown, download: download, build: build
  };
  global.REPORT_PACKAGE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
