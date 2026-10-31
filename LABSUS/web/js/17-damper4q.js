/* ═══════════════════════════════════════════════════════════════════════════
   17-damper4q.js —— 减振器四象限表求值（T5 / P4 接入，2026-10-20）

   数据：Multimatic DSSV VC01 实车台架数据，**12 档 × 25 速度点**（±500 mm/s）。
   上游：Simplified-Vehicle-Models tests/fixtures/damper_vc01.csv（逐字节 vendored
         到 engine/data/dampers/multimatic_dssv_vc01_front.csv，溯源见文件头）。
   可信级别：**实测**（台架），但上游标注 "RAW and uncorrected"。
   ⚠ 上游自述缺陷原样保留：click 8 @ +300 mm/s = 671 N（应为 761 N）。

   形式（从上游 suspension/damper_table.py 核对）：
     · 压缩(v≥0) 与 复原(v<0) 共用本表的对称速度轴；
     · 沿速度：**保形单调三次 Hermite**（与引擎 suspension_lut 同一算法）；
     · 沿档位：相邻整数档**线性混合**；
     · 表外：**端点斜率线性外推**，并置越界计数；
     · 契约：零速度零力。

   与 04-dynamics.js 的旧模型关系：旧模型是 `Fc = -(rel<0?cB:cR)*rel`（两个常数）。
   本模块提供**速度相关 + 档位相关**的替代，由 `SIM.damperTableOn` 开关控制（默认关）。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function (global) {
  // 速度轴 [mm/s]（与表格列一致）
  const V = [-500,-450,-400,-350,-300,-250,-200,-150,-100,-50,-25,-10,0,10,25,50,100,150,200,250,300,350,400,450,500];
  // 12 档 × 25 点，力 [N]；正 = 压缩
  const F = [
    [-813,-736,-656,-574,-490,-403,-314,-223,-132,-52,-25,-17,0,17,24,48,124,216,312,408,503,597,690,783,874],
    [-841,-763,-682,-600,-515,-427,-336,-241,-146,-58,-27,-17,0,17,25,54,138,235,335,434,531,626,721,814,906],
    [-870,-791,-710,-626,-540,-451,-358,-261,-161,-66,-29,-18,0,17,27,61,154,257,360,461,560,657,752,846,939],
    [-899,-819,-738,-654,-567,-476,-382,-282,-178,-75,-32,-18,0,18,30,69,172,280,387,490,590,688,784,879,973],
    [-928,-849,-767,-682,-594,-503,-407,-305,-197,-86,-36,-19,0,18,33,90,192,306,415,520,622,721,818,913,1007],
    [-959,-879,-796,-711,-623,-531,-433,-330,-218,-99,-43,-20,0,19,39,93,215,333,445,552,655,755,853,948,1043],
    [-990,-909,-827,-741,-652,-559,-461,-356,-241,-115,-51,-21,0,20,47,110,241,363,477,585,689,790,888,984,1079],
    [-1021,-941,-858,-772,-683,-589,-490,-384,-267,-132,-62,-24,0,23,59,131,270,395,511,620,725,826,925,1021,1116],
    [-1053,-973,-889,-803,-714,-620,-520,-413,-294,-157,-78,-29,0,27,74,156,301,429,546,656,671,863,962,1059,1164],
    [-1086,-1005,-922,-836,-746,-652,-551,-443,-323,-182,-98,-38,0,35,96,185,335,465,583,694,799,901,1000,1097,1193],
    [-1119,-1038,-955,-869,-779,-684,-584,-475,-354,-211,-123,-57,0,56,125,219,372,502,621,732,838,940,1040,1137,1233],
    [-1153,-1072,-989,-902,-812,-718,-617,-508,-387,-243,-153,-83,0,86,160,256,410,542,661,772,878,980,1080,1177,1273]
  ];

  const OUT = { count: 0 };   // 越界外推次数（诊断用）

  /** 保形单调三次 Hermite 的节点斜率（Fritsch–Carlson，与引擎端同算法） */
  function slopes(x, y) {
    const n = x.length, h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
    if (n === 2) { m[0] = d[0]; m[1] = d[0]; return m; }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = 0.5 * (d[i - 1] + d[i]);
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return m;
  }

  /** 在轴内插值一档（速度 mm/s），返回 [力, 斜率] */
  function oneClick(x, y, v) {
    const n = x.length;
    const m = slopes(x, y);
    if (v >= x[n - 1]) return [y[n - 1], m[n - 1]];
    let k = 0;
    while (k < n - 2 && v > x[k + 1]) k++;
    if (v <= x[0]) return [y[0], m[0]];
    const h = x[k + 1] - x[k], u = (v - x[k]) / h;
    const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
    const f = h00 * y[k] + h10 * h * m[k] + h01 * y[k + 1] + h11 * h * m[k + 1];
    const d00 = (6 * u * u - 6 * u) / h, d10 = 3 * u * u - 4 * u + 1;
    const d01 = (-6 * u * u + 6 * u) / h, d11 = 3 * u * u - 2 * u;
    const s = d00 * y[k] + d10 * m[k] + d01 * y[k + 1] + d11 * m[k + 1];
    return [f, s];
  }

  /**
   * 四象限表力 [N]。vMs：减振器速度 [m/s]，正 = 压缩；click 0..11（可小数）。
   * 表外按端点斜率线性外推，并把越界次数计入 OUT.count。
   */
  function damperForce4Q(vMs, clickC, clickR) {
    if (!Number.isFinite(vMs)) return 0;
    const v = vMs * 1000;                 // → mm/s
    let click = v >= 0 ? clickC : clickR;
    if (!Number.isFinite(click)) click = 0;
    const lo = Math.max(0, Math.min(11, Math.floor(click)));
    const frac = Math.max(0, Math.min(1, click - lo));
    const a = oneClick(V, F[lo], v);
    const b = frac > 0 && lo + 1 < F.length ? oneClick(V, F[lo + 1], v) : null;
    let f = b ? a[0] * (1 - frac) + b[0] * frac : a[0];
    const s = b ? a[1] * (1 - frac) + b[1] * frac : a[1];
    const vmax = V[V.length - 1], vmin = V[0];
    let clamped = false;
    if (v > vmax) { f += s * (v - vmax); clamped = true; }
    else if (v < vmin) { f += s * (v - vmin); clamped = true; }
    if (clamped) OUT.count++;
    return f;
  }

  global.DAMPER4Q = { V: V, F: F, out: OUT, force: damperForce4Q, slopes: slopes, oneClick: oneClick };
  global.damperForce4Q = damperForce4Q;
  if (typeof module !== "undefined" && module.exports) module.exports = global.DAMPER4Q;
})(typeof globalThis !== "undefined" ? globalThis : this);
