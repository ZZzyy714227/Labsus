"use strict";
/* 液态玻璃双主题：自动跟随系统偏好，手动切换后持久化 */
function applyTheme(t){
  document.documentElement.setAttribute("data-theme",t);
  try{localStorage.setItem("labsus-theme",t);}catch(e){}
  Object.assign(C,PAL[t]);
  const tg=document.getElementById("themeTg");
  if(tg)tg.title=t==="light"?"当前浅色 · 点击切换深色":"当前深色 · 点击切换浅色";
}
(function initTheme(){
  let t=null;try{t=localStorage.getItem("labsus-theme");}catch(e){}
  if(t!=="light"&&t!=="dark")t=(window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark";
  applyTheme(t);
  const tg=document.getElementById("themeTg");
  if(tg)tg.onclick=()=>applyTheme(document.documentElement.getAttribute("data-theme")==="light"?"dark":"light");
})();

/* =====================================================================
   LABSUS 综合性能评价与AI调校诊断引擎 (Evaluation Engine)
   ===================================================================== */
/* V-F 阻尼曲线插值（速度 m/s → 阻尼力 N）：damperMode==="table" 时替换线性 cB/cR */
function vfDamper(table, v, fallback){
  if(!table||table.length<2)return fallback;
  if(v<=table[0][0])return table[0][1];
  if(v>=table[table.length-1][0])return table[table.length-1][1];
  let i=1;while(i<table.length&&table[i][0]<v)i++;
  const a=table[i-1],b=table[i];
  const t=(v-a[0])/((b[0]-a[0])||1e-9);
  return a[1]+(b[1]-a[1])*t;
}

const EVAL_BENCHMARKS = {
  camberGainF:     { name: "前外倾增益 (Camber Gain)", target: "0.04 ~ 0.08 °/mm", unit: "°/mm", eval: v => (v >= 0.04 && v <= 0.08 ? 'good' : (v >= 0.02 && v <= 0.11 ? 'warn' : 'bad')), desc: "过弯侧倾时补偿接地面积，过小易推头，过大影响制动" },
  camberGainR:     { name: "后外倾增益 (Camber Gain)", target: "0.03 ~ 0.07 °/mm", unit: "°/mm", eval: v => (v >= 0.03 && v <= 0.07 ? 'good' : (v >= 0.015 && v <= 0.09 ? 'warn' : 'bad')), desc: "后轴侧倾附着力支撑，保障高速稳定性" },
  bumpSteerF:      { name: "前跳动转向 (Bump Steer)", target: "< 0.02 °/mm", unit: "°/mm", eval: v => (Math.abs(v) <= 0.02 ? 'good' : (Math.abs(v) <= 0.05 ? 'warn' : 'bad')), desc: "路面颠簸时方向稳定性，过大会引起车头晃动" },
  bumpSteerR:      { name: "后跳动转向 (Bump Steer)", target: "0.00 ~ +0.03 °/mm", unit: "°/mm", eval: v => (v >= 0.0 && v <= 0.03 ? 'good' : (v >= -0.01 && v <= 0.05 ? 'warn' : 'bad')), desc: "跳动后束角变化，轻微压下前束增加高速稳定性" },
  rcHeightF:       { name: "前侧倾中心高度 (Roll Center)", target: "30 ~ 75 mm", unit: "mm", eval: v => (v >= 30 && v <= 75 ? 'good' : (v >= 10 && v <= 100 ? 'warn' : 'bad')), desc: "前轴侧向力几何传递高度，过高易千斤顶效应" },
  rcHeightR:       { name: "后侧倾中心高度 (Roll Center)", target: "45 ~ 95 mm", unit: "mm", eval: v => (v >= 45 && v <= 95 ? 'good' : (v >= 20 && v <= 120 ? 'warn' : 'bad')), desc: "后轴侧倾中心应高于前轴，形成自然前倾侧倾轴线" },
  antiDiveF:       { name: "前抗点头率 (Anti-Dive)", target: "20% ~ 40%", unit: "%", eval: v => (v >= 20 && v <= 40 ? 'good' : (v >= 10 && v <= 55 ? 'warn' : 'bad')), desc: "制动时前悬架抗压缩几何能力，抑制俯仰" },
  antiSquatR:      { name: "后抗下蹲率 (Anti-Squat)", target: "30% ~ 60%", unit: "%", eval: v => (v >= 30 && v <= 60 ? 'good' : (v >= 15 && v <= 80 ? 'warn' : 'bad')), desc: "加速时后悬架抗压缩几何能力，防止重心塌陷" },
  scrubRadiusF:    { name: "前磨地半径 (Scrub Radius)", target: "5 ~ 25 mm", unit: "mm", eval: v => (v >= 5 && v <= 25 ? 'good' : (v >= -5 && v <= 40 ? 'warn' : 'bad')), desc: "方向盘路感反馈与制动跑偏容限" },
  casterTrailF:    { name: "前主销拖距 (Caster Trail)", target: "15 ~ 35 mm", unit: "mm", eval: v => (v >= 15 && v <= 35 ? 'good' : (v >= 5 && v <= 45 ? 'warn' : 'bad')), desc: "轮胎回正力矩杠杆，过大导致打方向沉重" },
  motionRatioF:    { name: "前安装比 (Motion Ratio)", target: "0.65 ~ 0.85", unit: "", eval: v => (v >= 0.65 && v <= 0.85 ? 'good' : (v >= 0.5 && v <= 0.95 ? 'warn' : 'bad')), desc: "弹簧避震器杠杆效率，推荐接近线性" },
  motionRatioR:    { name: "后安装比 (Motion Ratio)", target: "0.70 ~ 0.90", unit: "", eval: v => (v >= 0.70 && v <= 0.90 ? 'good' : (v >= 0.55 && v <= 1.0 ? 'warn' : 'bad')), desc: "后轴弹簧避震器杠杆效率" },
  wheelRateF:      { name: "前轮端刚度 (Wheel Rate)", target: "30 ~ 70 N/mm", unit: "N/mm", eval: v => (v >= 30 && v <= 70 ? 'good' : (v >= 20 && v <= 90 ? 'warn' : 'bad')), desc: "前悬架对路面垂直支撑刚度" },
  wheelRateR:      { name: "后轮端刚度 (Wheel Rate)", target: "35 ~ 75 N/mm", unit: "N/mm", eval: v => (v >= 35 && v <= 75 ? 'good' : (v >= 25 && v <= 95 ? 'warn' : 'bad')), desc: "后悬架对路面垂直支撑刚度" },
  rideFreqF:       { name: "前偏频 (Ride Frequency)", target: "1.8 ~ 3.2 Hz", unit: "Hz", eval: v => (v >= 1.8 && v <= 3.2 ? 'good' : (v >= 1.4 && v <= 4.0 ? 'warn' : 'bad')), desc: "赛车前轴垂向固有振动频率" },
  rideFreqR:       { name: "后偏频 (Ride Frequency)", target: "2.0 ~ 3.5 Hz", unit: "Hz", eval: v => (v >= 2.0 && v <= 3.5 ? 'good' : (v >= 1.5 && v <= 4.2 ? 'warn' : 'bad')), desc: "后偏频通常比前偏频高 10%~15% 消除平顺颠簸" },
  dampingRatioF:   { name: "前阻尼比 (Damping Ratio)", target: "0.55 ~ 0.75", unit: "", eval: v => (v >= 0.55 && v <= 0.75 ? 'good' : (v >= 0.4 && v <= 0.85 ? 'warn' : 'bad')), desc: "前轴振动衰减能力，防止多余弹跳" },
  dampingRatioR:   { name: "后阻尼比 (Damping Ratio)", target: "0.60 ~ 0.80", unit: "", eval: v => (v >= 0.60 && v <= 0.80 ? 'good' : (v >= 0.45 && v <= 0.90 ? 'warn' : 'bad')), desc: "后轴振动衰减能力" },
  rollStiffnessPct:{ name: "前侧倾刚度占比 (F/T Roll)", target: "48% ~ 58%", unit: "%", eval: v => (v >= 48 && v <= 58 ? 'good' : (v >= 40 && v <= 65 ? 'warn' : 'bad')), desc: "决定稳态过弯平衡：>55% 趋向不足转向，<48% 趋向过度" },
  ackermannPct:    { name: "阿克曼转向百分比 (Ackermann)", target: "30% ~ 80%", unit: "%", eval: v => (v == null ? 'warn' : (v >= 30 && v <= 80 ? 'good' : (v >= 10 && v <= 100 ? 'warn' : 'bad'))), desc: "高速赛车通常采用 40%~60% 减少外侧胎拖拽；未从转向扫掠计算时显示 —（不再给出假数据）" },
  usGradient:      { name: "稳态不足转向梯度 (US Gradient)", target: "0.2 ~ 2.0 °/g", unit: "°/g", eval: v => (v == null ? 'warn' : (v >= 0.2 && v <= 2.0 ? 'good' : (v >= 0.05 && v <= 3.5 ? 'warn' : 'bad'))), desc: "底盘开发第一 KPI：前后轴侧偏角差随侧向加速度的斜率；正=不足转向，负=过度。含轮胎载荷敏感性；高 μ 胎组梯度天然偏小（可×μ归一比较）；|gy|<0.02g 时显示 —" }
};

function calculateEvaluationData(){
  const swF = SIM.swF, swR = SIM.swR;
  const mF = SIM.mFR, mR = SIM.mRR;
  if(!swF || !swR || !mF || !mR) return null;

  const sampleSweep = (sw, tr0) => {
    if(!sw.rows || sw.rows.length === 0) return null;
    let closest = sw.rows[0], minDiff = 1e9;
    for(const r of sw.rows){
      const diff = Math.abs(r.tr - tr0);
      if(diff < minDiff){ minDiff = diff; closest = r; }
    }
    return closest;
  };

  const nomF = sampleSweep(swF, 0) || swF.rows[Math.floor(swF.rows.length/2)];
  const nomR = sampleSweep(swR, 0) || swR.rows[Math.floor(swR.rows.length/2)];
  
  const trArrF = swF.rows.map(r => r.tr);
  const trArrR = swR.rows.map(r => r.tr);
  const dTrF = Math.max(1, trArrF[trArrF.length-1] - trArrF[0]);
  const dTrR = Math.max(1, trArrR[trArrR.length-1] - trArrR[0]);

  const camGainF = Math.abs((swF.rows[swF.rows.length-1].cam - swF.rows[0].cam) / dTrF);
  const camGainR = Math.abs((swR.rows[swR.rows.length-1].cam - swR.rows[0].cam) / dTrR);
  const bumpSteerF = Math.abs((swF.rows[swF.rows.length-1].toe - swF.rows[0].toe) / dTrF);
  const bumpSteerR = (swR.rows[swR.rows.length-1].toe - swR.rows[0].toe) / dTrR;

  const mrF = Math.abs(nomF.mr || 0.75);
  const mrR = Math.abs(nomR.mr || 0.78);
  const kwF = (S.front.kS || 60) * (mrF * mrF);
  const kwR = (S.rear.kS || 65) * (mrR * mrR);
  const cwF = (S.front.cR || 3.5) * (mrF * mrF);
  const cwR = (S.rear.cR || 4.0) * (mrR * mrR);

  /* F-17（2026-08-30）：簧载质量前后分配不再硬编码 45/55 —— 用预设
     前后轴簧载质量比例（S.front.mS / S.rear.mS，与准静态内核同源），
     换车型后偏频/阻尼比不再系统性偏差。 */
  const msF = (S.front.mS || 55), msR = (S.rear.mS || 65);
  const mSprTot = (S.mSprung || 400);
  const mSprungF = mSprTot * (msF / (msF + msR)) / 2;   /* 单侧簧载质量 */
  const mSprungR = mSprTot * (msR / (msF + msR)) / 2;
  const freqF = (1 / (2 * Math.PI)) * Math.sqrt((kwF * 1000) / mSprungF);
  const freqR = (1 / (2 * Math.PI)) * Math.sqrt((kwR * 1000) / mSprungR);
  const ccF = 2 * Math.sqrt((kwF * 1000) * mSprungF);
  const ccR = 2 * Math.sqrt((kwR * 1000) * mSprungR);
  const dampRatioF = (cwF * 1000) / (ccF || 1);
  const dampRatioR = (cwR * 1000) / (ccR || 1);

  const tf = Math.abs(S.front.hp.WC[0] * 2);
  const tr = Math.abs(S.rear.hp.WC[0] * 2);
  const kRollF = 0.5 * (kwF * 1000) * (tf * tf / 1e6) + (S.front.arb.d > 0 ? 1200 : 0);
  const kRollR = 0.5 * (kwR * 1000) * (tr * tr / 1e6) + (S.rear.arb.d > 0 ? 900 : 0);
  const rollSplitF = (kRollF / (kRollF + kRollR || 1)) * 100;

  /* F-15（2026-08-30）：`||` 会吞掉合法 0 值（RC 恰在地面=0mm、scrub=0 等）；
     fin() 仅对 undefined/NaN 回退，0 值如实显示。 */
  const fin=(v,d)=>Number.isFinite(v)?v:d;
  const metrics = {
    camberGainF: { val: camGainF, formatted: camGainF.toFixed(3) },
    camberGainR: { val: camGainR, formatted: camGainR.toFixed(3) },
    bumpSteerF:  { val: bumpSteerF, formatted: bumpSteerF.toFixed(3) },
    bumpSteerR:  { val: bumpSteerR, formatted: bumpSteerR.toFixed(3) },
    rcHeightF:   { val: fin(nomF.rcH,45), formatted: fin(nomF.rcH,45).toFixed(1) },
    rcHeightR:   { val: fin(nomR.rcH,65), formatted: fin(nomR.rcH,65).toFixed(1) },
    antiDiveF:   { val: fin(nomF.anti,28), formatted: fin(nomF.anti,28).toFixed(1) },
    antiSquatR:  { val: fin(nomR.anti,42), formatted: fin(nomR.anti,42).toFixed(1) },
    scrubRadiusF:{ val: fin(mF.scrub,15), formatted: fin(mF.scrub,15).toFixed(1) },
    casterTrailF:{ val: fin(mF.trail,22), formatted: fin(mF.trail,22).toFixed(1) },
    motionRatioF:{ val: mrF, formatted: mrF.toFixed(3) },
    motionRatioR:{ val: mrR, formatted: mrR.toFixed(3) },
    wheelRateF:  { val: kwF, formatted: kwF.toFixed(1) },
    wheelRateR:  { val: kwR, formatted: kwR.toFixed(1) },
    rideFreqF:   { val: freqF, formatted: freqF.toFixed(2) },
    rideFreqR:   { val: freqR, formatted: freqR.toFixed(2) },
    dampingRatioF:{ val: dampRatioF, formatted: dampRatioF.toFixed(2) },
    dampingRatioR:{ val: dampRatioR, formatted: dampRatioR.toFixed(2) },
    rollStiffnessPct: { val: rollSplitF, formatted: rollSplitF.toFixed(1) },
    /* F-11（2026-08-30）：`S.ackermann || 52` 是假数据——S.ackermann 全文无赋值点，
       恒 52% 使红绿灯失真。未计算时如实显示 "—"（eval 侧同步处理 null）。 */
    ackermannPct:{ val: Number.isFinite(S.ackermann) ? S.ackermann : null,
                   formatted: Number.isFinite(S.ackermann) ? S.ackermann.toFixed(0) : "—" },
    /* 稳态不足转向梯度：取当前准静态工况（需 |gy|≥0.02g）；镜像引擎
       chassis.quasi_loads 的轮胎分量公式（含 LS 载荷敏感性）。 */
    usGradient:{ val: (SIM.qsRes && Math.abs(S.qs.gy) >= 0.02 && Number.isFinite(SIM.qsRes.usGrad)
                       && Math.abs(SIM.qsRes.usGrad) > 1e-9) ? SIM.qsRes.usGrad : null,
                 formatted: (SIM.qsRes && Math.abs(S.qs.gy) >= 0.02 && Number.isFinite(SIM.qsRes.usGrad)
                       && Math.abs(SIM.qsRes.usGrad) > 1e-9) ? SIM.qsRes.usGrad.toFixed(2) : "—" }
  };

  /* F-18（2026-08-30）：dimScores 与 EVAL_BENCHMARKS 双轨制消除 —— 旧公式
     与右侧交通灯评级独立定义（雷达图可给 good 分数、交通灯同值却 warn）。
     改为复用 EVAL_BENCHMARKS 的 eval() 评级（good=90 / warn=62 / bad=30），
     雷达图与交通灯永远同源、不可能矛盾。 */
  const sc=(bm,val)=>{ if(val==null)return 30;
    const r=(bm&&bm.eval)?bm.eval(val):null;
    return r==="good"?90:(r==="warn"?62:30); };
  const dimScores = {
    "外倾抓地 (Camber)": sc(EVAL_BENCHMARKS.camberGainF, camGainF),
    "跳动转向 (BumpSteer)": sc(EVAL_BENCHMARKS.bumpSteerF, bumpSteerF),
    "侧倾中心 (RollCenter)": sc(EVAL_BENCHMARKS.rcHeightF, nomF.rcH),
    "抗点头俯仰 (AntiDive)": sc(EVAL_BENCHMARKS.antiDiveF, nomF.anti),
    "平顺阻尼 (Damping)": sc(EVAL_BENCHMARKS.dampingRatioF, dampRatioF),
    "转向手感 (Steering)": sc(EVAL_BENCHMARKS.scrubRadiusF, mF.scrub)
  };

  let totalScore = 0, count = 0;
  for(const k in dimScores){ totalScore += dimScores[k]; count++; }
  const overall = Math.round(totalScore / count);

  return { metrics, dimScores, overall };
}
window.calculateEvaluationData = calculateEvaluationData;
window.openSuspensionEvaluation = openSuspensionEvaluation;
/* G14（2026-08-31）F-61：此处原有一条把 openSlopeStage 挂到 window 的导出语句。
   该函数定义在 11-stages.js（本文件之后的脚本），G9 拆分为多个 <script src>
   之后函数不再跨文件提升 → 那行抛 ReferenceError → 本文件在此中止执行 →
   下方的 class TrackPath / CirclePath / StraightPath / CircuitPath 停留在
   TDZ 未初始化 → openSlopeStage() 里 new StraightPath(...) 抛错 →
   requestAnimationFrame(slopeStageLoop) 永不执行 = 打开舞台即黑屏。
   11-stages.js 末尾已有正确的导出，此处不得再重复导出。 */

function openSuspensionEvaluation(){
  const modal = document.getElementById("suspEvalModal");
  if(!modal) return;
  const data = calculateEvaluationData();
  if(!data) return;

  document.getElementById("evalVehSubtitle").textContent = (VEHICLE_PRESETS[S.vehicleType]||{}).name || "FIA GT3";
  document.getElementById("evalOverallScore").textContent = data.overall;
  
  const badge = document.getElementById("evalGradeBadge");
  if(data.overall >= 90){ badge.textContent = "GRADE S+ 极致竞赛"; badge.style.background = "#238636"; }
  else if(data.overall >= 80){ badge.textContent = "GRADE A 优秀调校"; badge.style.background = "#1f6feb"; }
  else if(data.overall >= 70){ badge.textContent = "GRADE B 良好平衡"; badge.style.background = "#d29922"; }
  else { badge.textContent = "GRADE C 存在缺陷"; badge.style.background = "#da3633"; }

  const scoreGrid = document.getElementById("evalDimensionScores");
  scoreGrid.innerHTML = "";
  for(const k in data.dimScores){
    const d = document.createElement("div");
    d.className = "eval-score-item";
    d.innerHTML = `<span>${k}</span><b>${Math.round(data.dimScores[k])} 分</b>`;
    scoreGrid.appendChild(d);
  }

  const adviceList = document.getElementById("evalAdviceList");
  adviceList.innerHTML = "";
  const advices = [];
  if(data.metrics.camberGainF.val < 0.035) advices.push({ type: 'danger', text: "【前外倾增益偏低】当前仅 " + data.metrics.camberGainF.formatted + " °/mm，过弯车身侧倾时前轮接地变差，易造成剧烈推头！建议拉长下控制臂或抬高上控制臂外球销。" });
  if(data.metrics.bumpSteerF.val > 0.03) advices.push({ type: 'danger', text: "【前跳动转向过大】当前为 " + data.metrics.bumpSteerF.formatted + " °/mm，赛车冲过路肩时方向盘将剧烈抢把！建议调整转向机高低 (RACK_Z) 使转向拉杆与下摆臂虚拟瞬心重合。" });
  if(data.metrics.rcHeightF.val < 20) advices.push({ type: 'warn', text: "【前侧倾中心过低】侧倾力臂过大导致过弯侧倾严重，建议适当调整内外球销几何高度。" });
  if(data.metrics.rollStiffnessPct.val < 48) advices.push({ type: 'warn', text: "【前侧倾刚度占比偏低】当前后轴过硬，高速弯出弯时后轮附着力容易被突破，车辆趋向过度转向。" });
  if(advices.length === 0) advices.push({ type: 'good', text: "【完美几何架构】当前悬架各项指标均处于职业赛车最佳黄金视窗内，外倾补偿与跳动转向极其收敛！" });

  advices.forEach(adv => {
    const el = document.createElement("div");
    el.className = `eval-advice-item ${adv.type}`;
    el.textContent = adv.text;
    adviceList.appendChild(el);
  });

  const grid = document.getElementById("evalMetricsGrid");
  grid.innerHTML = "";
  for(const k in data.metrics){
    const def = EVAL_BENCHMARKS[k];
    if(!def) continue;
    const m = data.metrics[k];
    const status = def.eval(m.val);
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="metric-card-top">
        <span class="metric-name">${def.name}</span>
        <span class="metric-status-dot ${status === 'good' ? 'green' : (status === 'warn' ? 'yellow' : 'red')}"></span>
      </div>
      <div class="metric-val-row">
        <span class="metric-val">${m.formatted} <small style="font-size:10px;font-weight:normal;">${def.unit}</small></span>
        <span class="metric-target">目标: ${def.target}</span>
      </div>
      <div class="metric-desc">${def.desc}</div>
    `;
    grid.appendChild(card);
  }

  drawRadarChart(data.dimScores);
  modal.classList.add("show");
}

function drawRadarChart(scores){
  const cv = document.getElementById("evalRadarCanvas");
  if(!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2, R = w * 0.38;
  const keys = Object.keys(scores);
  const total = keys.length;
  const angleStep = (Math.PI * 2) / total;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  for(let layer = 1; layer <= 4; layer++){
    ctx.beginPath();
    const r = (R / 4) * layer;
    for(let i = 0; i < total; i++){
      const ang = i * angleStep - Math.PI / 2;
      const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  for(let i = 0; i < total; i++){
    const ang = i * angleStep - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.stroke();

    const labelX = cx + (R + 22) * Math.cos(ang);
    const labelY = cy + (R + 22) * Math.sin(ang);
    ctx.fillStyle = "#8b949e";
    ctx.font = "10.5px ui-monospace, sans-serif";
    ctx.textAlign = Math.abs(Math.cos(ang)) < 0.2 ? "center" : (Math.cos(ang) > 0 ? "left" : "right");
    ctx.textBaseline = "middle";
    ctx.fillText(keys[i].split(" ")[0], labelX, labelY);
  }

  ctx.beginPath();
  for(let i = 0; i < total; i++){
    const ang = i * angleStep - Math.PI / 2;
    const scorePct = Math.min(100, Math.max(10, scores[keys[i]])) / 100;
    const r = R * scorePct;
    const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(88, 166, 255, 0.25)";
  ctx.fill();
  ctx.strokeStyle = "#58a6ff";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  for(let i = 0; i < total; i++){
    const ang = i * angleStep - Math.PI / 2;
    const scorePct = Math.min(100, Math.max(10, scores[keys[i]])) / 100;
    const r = R * scorePct;
    const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#58a6ff";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/* =====================================================================
   LABSUS 15-DOF HARDCORE MULTI-BODY VEHICLE DYNAMICS ENGINE
   ===================================================================== */
/* =====================================================================
   LABSUS HARDCORE 15-DOF MULTI-BODY VEHICLE DYNAMICS ENGINE
   Coordinate Frame: +Y Forward, +X Right, +Z Up (Pitch around X, Roll around Y, Yaw around Z)
   ===================================================================== */
/* =====================================================================
   LABSUS HARDCORE 15-DOF MULTI-BODY VEHICLE DYNAMICS ENGINE
   Coordinate Frame: +Y Forward, +X Right, +Z Up (Pitch around X, Roll around Y, Yaw around Z)
   ===================================================================== */

/* =====================================================================
   UNIVERSAL AUTONOMOUS PILOT (ADAS / AD)
   ===================================================================== */
class TrackPath {
  getLookahead(x, y, v) { return null; }
}

class CirclePath extends TrackPath {
  constructor(radius, dir, speedMs) {
    super();
    this.R = radius;
    this.dir = dir; // -1: CCW, 1: CW
    this.targetSpeed = speedMs;
  }
  
  getLookahead(x, y, v) {
    const r_cur = Math.hypot(x, y);
    const theta = (r_cur < 1e-3) ? 0 : Math.atan2(y, x);
    
    const psi_tangent = (this.dir === -1) ? theta : (theta + Math.PI);
    
    const tx = -Math.sin(psi_tangent);
    const ty = Math.cos(psi_tangent);
    const nx_norm = ty;
    const ny_norm = -tx;
    
    const nx = this.R * Math.cos(theta);
    const ny = this.R * Math.sin(theta);
    
    const e_y = (x - nx) * nx_norm + (y - ny) * ny_norm;
    
    return {
      targetHeading: psi_tangent,
      targetCurvature: (this.dir === -1) ? (-1.0 / this.R) : (1.0 / this.R), 
      targetSpeed: this.targetSpeed,
      crossTrackError: e_y
    };
  }
}

class StraightPath extends TrackPath {
  constructor(speedMs = 23.6, scenario = "comprehensive", params = {}) {
    super();
    this.targetSpeed = speedMs;
    this.scenario = scenario || "comprehensive";
    this.params = Object.assign({
      repeatCount: 10,
      rampHeight: 1.10,
      rampLen: 14.0,
      rampSpacing: 65.0,
      bumpSubType: "staggered",
      bumpHeight: 0.060,
      bumpSpacing: 4.0,
      mooseLaneWidth: 2.8,
      mooseOffset: 3.5,
      mooseSpeedKmh: 75.0,
      washboardWavelength: 1.25,
      washboardAmplitude: 0.035,
      potholeDepth: -0.055,
      muLeft: 1.35,
      muRight: 0.28,
      grade: 0.18,
      customSegments: null
    }, params);

    this.segments = [];
    this.ramps = [];
    this.bumps = [];
    this.mooseSections = [];
    this.washboardSections = [];
    this.splitMuSections = [];
    this.slopeSections = [];
    this.gantries = [];
    this._cones = [];
    this._coneHits = new Set();

    this.buildTrack();
  }

  setScenario(scenario, params = {}) {
    this.scenario = scenario;
    if (params) Object.assign(this.params, params);
    this._coneHits.clear();
    this.buildTrack();
  }

  buildTrack() {
    this.segments = [];
    this.ramps = [];
    this.bumps = [];
    this.mooseSections = [];
    this.washboardSections = [];
    this.splitMuSections = [];
    this.slopeSections = [];
    this.gantries = [];
    this._cones = [];

    const sc = this.scenario;
    const rCount = Math.max(1, Math.min(50, this.params.repeatCount || 10));

    if (sc === "comprehensive") {
      // 🏆 默认：全工况综合连环大试验场 (7 大工况连续串联)
      let curY = 0;
      
      // 1. 弹射加速与制动区 (0-100 & 100-0)
      this.segments.push({
        id: "seg_accel", type: "accel_brake", name: "⚡ 弹射加速与制动",
        yStart: curY, yEnd: curY + 110.0, targetSpeed: 38.0, triggerY: curY + 75.0
      });
      this.gantries.push({ y: curY, text: "🏁 START · 0-100 ACCEL & BRAKE" });
      curY += 120.0;

      // 2. 三连飞坡跳台 (3x Jump Ramps)
      this.gantries.push({ y: curY, text: "🚀 TRIPLE JUMP RAMPS · 三连飞坡" });
      for (let i = 0; i < 3; i++) {
        const ry = curY + 15.0 + i * 65.0;
        const rH = this.params.rampHeight || 1.10;
        this.ramps.push({
          id: `comp_ramp_${i}`, y0: ry, len: 14.0, h: rH, landingY: ry + 28.0, landingLen: 16.0, index: i + 1, total: 3
        });
      }
      this.segments.push({
        id: "seg_ramp", type: "jump_ramp", name: "🚀 三连飞坡跳台 (3x Ramps)",
        yStart: curY, yEnd: curY + 220.0, targetSpeed: this.targetSpeed
      });
      curY += 230.0;

      // 3. 连续交错坎与减速丘 (Speed Bumps & Cleats)
      this.gantries.push({ y: curY, text: "🚧 SPEED BUMPS & CLEATS · 连续过坎" });
      const bH = this.params.bumpHeight || 0.060;
      for (let i = 0; i < 6; i++) {
        const by = curY + 15.0 + i * 8.0;
        this.bumps.push({
          y0: by, side: (i % 2 === 0 ? "L" : "R"), h: bH,
          xMin: (i % 2 === 0 ? -2.5 : 0.1), xMax: (i % 2 === 0 ? -0.1 : 2.5)
        });
      }
      this.segments.push({
        id: "seg_bumps", type: "bumps_cleats", name: "🚧 连续交错减速坎 (6x Bumps)",
        yStart: curY, yEnd: curY + 80.0, targetSpeed: 16.7
      });
      curY += 90.0;

      // 4. 连续双移线麋鹿避障 (2x Moose Tests, alternating left and right)
      this.gantries.push({ y: curY, text: "🦌 ISO 3888-2 MOOSE TEST · 连续麋鹿避障" });
      for (let i = 0; i < 2; i++) {
        const my = curY + 15.0 + i * 70.0;
        const dir = (i % 2 === 0 ? -1 : 1);
        this.mooseSections.push({
          id: `comp_moose_${i}`, y0: my, offset: dir * (this.params.mooseOffset || 3.5),
          width: this.params.mooseLaneWidth || 2.8, len: 60.0, index: i + 1, total: 2
        });
      }
      this.segments.push({
        id: "seg_moose", type: "moose_test", name: "🦌 连续双移线避障 (2x Moose)",
        yStart: curY, yEnd: curY + 160.0, targetSpeed: (this.params.mooseSpeedKmh || 75.0) / 3.6
      });
      curY += 170.0;

      // 5. 搓板与暗坑耐久路 (Washboard & Potholes)
      this.gantries.push({ y: curY, text: "🪨 WASHBOARD & POTHOLES · 搓板坑洼耐久" });
      this.washboardSections.push({
        id: "comp_wash", y0: curY + 10.0, len: 45.0,
        wavelength: this.params.washboardWavelength || 1.25,
        amp: this.params.washboardAmplitude || 0.035,
        potholeDepth: this.params.potholeDepth || -0.055
      });
      this.segments.push({
        id: "seg_wash", type: "washboard_potholes", name: "🪨 搓板波纹与暗坑路",
        yStart: curY, yEnd: curY + 80.0, targetSpeed: 13.9
      });
      curY += 90.0;

      // 6. 对开冰雪沥青路 ($\mu$-Split Surface)
      this.gantries.push({ y: curY, text: "❄️ SPLIT-MU SURFACE · 对开冰雪制动" });
      this.splitMuSections.push({
        id: "comp_split", y0: curY + 10.0, len: 90.0,
        muLeft: this.params.muLeft || 1.35, muRight: this.params.muRight || 0.28
      });
      this.segments.push({
        id: "seg_split", type: "split_mu", name: "❄️ 对开路面附着偏摆",
        yStart: curY, yEnd: curY + 100.0, targetSpeed: 19.4
      });
      curY += 110.0;

      // 7. 连续极限坡度爬坡 (Slope Climb)
      this.gantries.push({ y: curY, text: "⛰️ EXTREME SLOPE CLIMB · 极限陡坡爬坡" });
      this.slopeSections.push({
        id: "comp_slope", y0: curY + 10.0, len: 120.0, grade: this.params.grade || 0.20
      });
      this.segments.push({
        id: "seg_slope", type: "slope_climb", name: "⛰️ 连续极限陡坡爬坡",
        yStart: curY, yEnd: curY + 130.0, targetSpeed: 18.0
      });
      curY += 140.0;

      this.gantries.push({ y: curY, text: "🏁 FINISH · LAP COMPLETE" });
      this.totalLength = curY;

    } else if (sc === "jump_ramp") {
      // 🚀 连续飞坡极限界 (连续 10 个飞坡跳台)
      const rH = this.params.rampHeight || 1.10;
      const rLen = this.params.rampLen || 14.0;
      const rY0 = this.params.rampY !== undefined ? this.params.rampY : 20.0;
      const sp = this.params.rampSpacing || 65.0;
      let curY = rY0;
      this.gantries.push({ y: 0, text: `🚀 ${rCount}x CONSECUTIVE JUMP RAMPS · 十连飞坡极限界` });

      for (let i = 0; i < rCount; i++) {
        const ry = curY;
        this.ramps.push({
          id: `ramp_${i}`, y0: ry, len: rLen, h: rH, landingY: ry + rLen + 14.0, landingLen: 16.0, index: i + 1, total: rCount
        });
        this.segments.push({
          id: `seg_ramp_${i}`, type: "jump_ramp", name: `🚀 第 ${i + 1}/${rCount} 个飞坡跳台`,
          yStart: ry - 10.0, yEnd: ry + sp - 10.0, targetSpeed: this.targetSpeed
        });
        curY += sp;
      }
      this.totalLength = curY + 50.0;

    } else if (sc === "moose_test") {
      // 🦌 连续麋鹿避障测试 (连续 5~10 组左右交替双移线)
      const off = Math.abs(this.params.mooseOffset || 3.5);
      const w = this.params.mooseLaneWidth || 2.8;
      const mY0 = this.params.mooseStartY !== undefined ? this.params.mooseStartY : 20.0;
      let curY = mY0;
      this.gantries.push({ y: 0, text: `🦌 ${rCount}x CONSECUTIVE MOOSE TESTS · 连续麋鹿避障` });

      for (let i = 0; i < rCount; i++) {
        const my = curY;
        const dir = (i % 2 === 0 ? -1 : 1);
        this.mooseSections.push({
          id: `moose_${i}`, y0: my, offset: dir * off, width: w, len: 60.0, index: i + 1, total: rCount
        });
        this.segments.push({
          id: `seg_moose_${i}`, type: "moose_test", name: `🦌 第 ${i + 1}/${rCount} 组麋鹿双移线 (${dir < 0 ? '向左' : '向右'})`,
          yStart: my - 10.0, yEnd: my + 68.0, targetSpeed: (this.params.mooseSpeedKmh || 75.0) / 3.6
        });
        curY += 75.0;
      }
      this.totalLength = curY + 50.0;

    } else if (sc === "bumps_cleats") {
      // 🚧 连续过坎与减速带
      const bH = this.params.bumpHeight || 0.060;
      const bY0 = this.params.bumpStartY !== undefined ? this.params.bumpStartY : 20.0;
      const bSp = this.params.bumpSpacing || 4.0;
      let curY = bY0;
      this.gantries.push({ y: 0, text: `🚧 ${rCount * 4}x SPEED BUMPS & CLEATS · 连续过坎测试` });

      for (let i = 0; i < rCount * 4; i++) {
        const by = curY + i * bSp;
        this.bumps.push({
          y0: by, side: (i % 2 === 0 ? "L" : "R"), h: bH,
          xMin: (i % 2 === 0 ? -2.5 : 0.1), xMax: (i % 2 === 0 ? -0.1 : 2.5)
        });
      }
      this.segments.push({
        id: "seg_bumps_all", type: "bumps_cleats", name: `🚧 连续交错过坎 (${rCount * 4} 连坎)`,
        yStart: 0, yEnd: curY + rCount * 4 * bSp, targetSpeed: this.targetSpeed
      });
      this.totalLength = curY + rCount * 4 * bSp + 50.0;

    } else if (sc === "washboard_potholes") {
      // 🪨 连续搓板与深坑路
      const wY0 = this.params.washboardStartY !== undefined ? this.params.washboardStartY : 20.0;
      let curY = wY0;
      this.gantries.push({ y: 0, text: "🪨 CONTINUOUS WASHBOARD & POTHOLES · 连续搓板坑洼" });
      const wLen = 120.0;
      this.washboardSections.push({
        id: "wash_main", y0: curY, len: wLen,
        wavelength: this.params.washboardWavelength || 1.25,
        amp: this.params.washboardAmplitude || 0.035,
        potholeDepth: this.params.potholeDepth || -0.055
      });
      this.segments.push({
        id: "seg_wash_all", type: "washboard_potholes", name: "🪨 连续搓板坑洼耐久路",
        yStart: 0, yEnd: curY + wLen + 50.0, targetSpeed: this.targetSpeed
      });
      this.totalLength = curY + wLen + 80.0;

    } else if (sc === "accel_brake") {
      this.gantries.push({ y: 0, text: "⚡ 0-100 ACCELERATION & MAXIMUM BRAKING" });
      this.segments.push({
        id: "seg_accel", type: "accel_brake", name: "⚡ 0-100 弹射加速与全力制动",
        yStart: 0, yEnd: 150.0, targetSpeed: 45.0, triggerY: this.params.accelBrakeTriggerY || 90.0
      });
      this.totalLength = 200.0;

    } else if (sc === "split_mu") {
      this.gantries.push({ y: 0, text: "❄️ SPLIT-MU RUNWAY · 对开路面附着稳定性" });
      this.splitMuSections.push({
        id: "split_main", y0: 10.0, len: 180.0,
        muLeft: this.params.muLeft || 1.35, muRight: this.params.muRight || 0.28
      });
      this.segments.push({
        id: "seg_split", type: "split_mu", name: "❄️ 对开路面附着偏摆测试",
        yStart: 0, yEnd: 200.0, targetSpeed: this.targetSpeed
      });
      this.totalLength = 240.0;

    } else if (sc === "slope_climb") {
      this.gantries.push({ y: 0, text: "⛰️ CONTINUOUS SLOPE CLIMB · 连续大坡度爬坡" });
      this.slopeSections.push({
        id: "slope_main", y0: 10.0, len: 300.0, grade: this.params.grade || 0.18
      });
      this.segments.push({
        id: "seg_slope", type: "slope_climb", name: "⛰️ 连续极限大坡度爬坡",
        yStart: 0, yEnd: 320.0, targetSpeed: this.targetSpeed
      });
      this.totalLength = 350.0;
    }

    this.rebuildCones();
  }

  rebuildCones() {
    this._cones = [];
    if (!this.mooseSections.length) return;

    for (const sec of this.mooseSections) {
      const sy = sec.y0;
      const w = sec.width || 2.8;
      const off = sec.offset || -3.5;
      const prefix = sec.id;

      // Section 1: Entry Lane (Length 12m)
      for (let y = sy; y <= sy + 12; y += 3.0) {
        this._cones.push({ id: `${prefix}_eL_${y}`, x: -w / 2, y: y, side: "L" });
        this._cones.push({ id: `${prefix}_eR_${y}`, x: w / 2, y: y, side: "R" });
      }
      // Section 3: Offset Evasion Lane (Length 11m, lateral offset)
      const s3_start = sy + 12 + 13.5;
      const s3_end = s3_start + 11.0;
      for (let y = s3_start; y <= s3_end; y += 2.75) {
        this._cones.push({ id: `${prefix}_mL_${y}`, x: off - (w * 1.05) / 2, y: y, side: "L" });
        this._cones.push({ id: `${prefix}_mR_${y}`, x: off + (w * 1.05) / 2, y: y, side: "R" });
      }
      // Section 5: Return / Exit Lane (Length 12m)
      const s5_start = s3_end + 12.5;
      const s5_end = s5_start + 12.0;
      for (let y = s5_start; y <= s5_end; y += 3.0) {
        this._cones.push({ id: `${prefix}_xL_${y}`, x: -(w * 1.15) / 2, y: y, side: "L" });
        this._cones.push({ id: `${prefix}_xR_${y}`, x: (w * 1.15) / 2, y: y, side: "R" });
      }
    }
  }

  checkConeCollisions(posX, posY, psi, vehW = 1.8, vehL = 3.8) {
    if (!this._cones.length) return 0;
    const cPsi = Math.cos(psi), sPsi = Math.sin(psi);
    const halfW = vehW / 2 + 0.15;
    const halfL = vehL / 2 + 0.15;

    for (const c of this._cones) {
      if (this._coneHits.has(c.id)) continue;
      // Quick radius reject
      if (Math.abs(c.y - posY) > 4.5 || Math.abs(c.x - posX) > 3.5) continue;
      const dx = c.x - posX;
      const dy = c.y - posY;
      const lx = dx * cPsi + dy * sPsi;
      const ly = -dx * sPsi + dy * cPsi;
      if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfL) {
        this._coneHits.add(c.id);
      }
    }
    return this._coneHits.size;
  }

  getActiveSegment(y) {
    if (!this.segments.length) return { name: "直线道路", type: "straight", index: 1, total: 1, progress: 0 };
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (y >= seg.yStart && y <= seg.yEnd) {
        const prog = (y - seg.yStart) / Math.max(1, seg.yEnd - seg.yStart);
        return { name: seg.name, type: seg.type, index: i + 1, total: this.segments.length, progress: prog, seg };
      }
    }
    const last = this.segments[this.segments.length - 1];
    if (y > last.yEnd) {
      return { name: "🏁 终点冲刺区", type: "finish", index: this.segments.length, total: this.segments.length, progress: 1.0 };
    }
    return { name: this.segments[0].name, type: this.segments[0].type, index: 1, total: this.segments.length, progress: 0 };
  }

  getLookahead(x, y, v) {
    // 1. Check if inside any Moose Section
    for (const sec of this.mooseSections) {
      const sy = sec.y0;
      const off = sec.offset;
      const s1_end = sy + 12.0;
      const s2_end = s1_end + 13.5;
      const s3_end = s2_end + 11.0;
      const s4_end = s3_end + 12.5;

      if (y >= sy && y <= s4_end + 10.0) {
        let targetX = 0;
        let targetHeading = 0;
        let targetCurvature = 0;

        if (y <= s1_end) {
          targetX = 0; targetHeading = 0; targetCurvature = 0;
        } else if (y <= s2_end) {
          const t = (y - s1_end) / 13.5;
          const s_curve = 0.5 - 0.5 * Math.cos(Math.PI * t);
          const ds_dy = (0.5 * Math.PI / 13.5) * Math.sin(Math.PI * t);
          const d2s_dy2 = (0.5 * Math.PI * Math.PI / (13.5 * 13.5)) * Math.cos(Math.PI * t);
          targetX = off * s_curve;
          targetHeading = Math.atan2(off * ds_dy, 1.0);
          targetCurvature = (off * d2s_dy2) / Math.pow(1.0 + (off * ds_dy) ** 2, 1.5);
        } else if (y <= s3_end) {
          targetX = off; targetHeading = 0; targetCurvature = 0;
        } else if (y <= s4_end) {
          const t = (y - s3_end) / 12.5;
          const s_curve = 0.5 + 0.5 * Math.cos(Math.PI * t);
          const ds_dy = -(0.5 * Math.PI / 12.5) * Math.sin(Math.PI * t);
          const d2s_dy2 = -(0.5 * Math.PI * Math.PI / (12.5 * 12.5)) * Math.cos(Math.PI * t);
          targetX = off * s_curve;
          targetHeading = Math.atan2(off * ds_dy, 1.0);
          targetCurvature = (off * d2s_dy2) / Math.pow(1.0 + (off * ds_dy) ** 2, 1.5);
        } else {
          targetX = 0; targetHeading = 0; targetCurvature = 0;
        }

        const e_y = (x - targetX);
        const targetSpeed = (this.params.mooseSpeedKmh || 75.0) * (1000 / 3600);
        return { targetHeading, targetCurvature, targetSpeed, crossTrackError: e_y, targetX };
      }
    }

    // 2. Check if inside Accel & Brake Segment
    for (const seg of this.segments) {
      if (seg.type === "accel_brake" && y >= seg.yStart && y <= seg.yEnd) {
        const triggerY = seg.triggerY || (seg.yStart + 75.0);
        const targetSpeed = (y < triggerY) ? seg.targetSpeed : 0.0;
        return { targetHeading: 0, targetCurvature: 0, targetSpeed, crossTrackError: x, targetX: 0 };
      }
    }

    // Default straight path
    return { targetHeading: 0, targetCurvature: 0, targetSpeed: this.targetSpeed, crossTrackError: x, targetX: 0 };
  }

  getRoadElevation(x, y) {
    let z_road = 0.0;
    let isKerb = false;
    let isBump = false;
    let isPothole = false;
    let isRamp = false;
    let mu = 1.35;

    // 1. Jump Ramps
    for (const r of this.ramps) {
      if (y >= r.y0 && y <= (r.y0 + r.len) && Math.abs(x) <= 3.8) {
        isRamp = true;
        const t = (y - r.y0) / r.len;
        z_road = Math.max(z_road, r.h * (t * t * (3.0 - 2.0 * t)));
      } else if (y > (r.y0 + r.len) && y < r.landingY) {
        // Drop-off flight gap: ground elevation is 0
      } else if (y >= r.landingY && y <= (r.landingY + r.landingLen) && Math.abs(x) <= 4.0) {
        const t = (y - r.landingY) / r.landingLen;
        z_road = Math.max(z_road, (1.0 - t) * 0.04);
      }
    }

    // 2. Speed Bumps & Cleats
    for (const bp of this.bumps) {
      if (y >= bp.y0 && y <= bp.y0 + 1.0 && x >= bp.xMin && x <= bp.xMax) {
        isBump = true;
        const t = (y - bp.y0) / 1.0;
        z_road = Math.max(z_road, bp.h * Math.sin(Math.PI * t) ** 2);
      }
    }

    // 3. Washboard & Potholes
    for (const w of this.washboardSections) {
      if (y >= w.y0 && y <= (w.y0 + w.len) && Math.abs(x) <= 3.8) {
        isBump = true;
        z_road += w.amp * Math.sin((2.0 * Math.PI * (y - w.y0)) / w.wavelength);
      } else if (y > (w.y0 + w.len) && y <= (w.y0 + w.len + 50.0)) {
        const pits = [
          { y0: w.y0 + w.len + 8.0, x0: -0.75, rx: 0.6, ry: 0.8 },
          { y0: w.y0 + w.len + 18.0, x0: 0.85, rx: 0.65, ry: 0.85 },
          { y0: w.y0 + w.len + 28.0, x0: -0.45, rx: 0.7, ry: 0.9 },
          { y0: w.y0 + w.len + 38.0, x0: 0.60, rx: 0.6, ry: 0.8 }
        ];
        for (const p of pits) {
          const dx = (x - p.x0) / p.rx;
          const dy = (y - p.y0) / p.ry;
          const r2 = dx * dx + dy * dy;
          if (r2 <= 1.0) {
            isPothole = true;
            const factor = Math.cos((Math.PI / 2) * Math.sqrt(r2));
            z_road = Math.min(z_road, w.potholeDepth * factor);
          }
        }
        if (Math.abs(x) <= 3.8) {
          z_road += 0.005 * Math.sin(y * 11.3) * Math.cos(x * 9.7);
        }
      }
    }

    // 4. Split-Mu Friction
    for (const sp of this.splitMuSections) {
      if (y >= sp.y0 && y <= (sp.y0 + sp.len)) {
        mu = (x > 0 ? sp.muRight : sp.muLeft);
      }
    }

    return { z_road, isKerb, isBump, isPothole, isRamp, mu };
  }

  getMu(x, y) {
    return this.getRoadElevation(x, y).mu;
  }
}

// -------------------- CIRCUIT TRACK SPLINE & PROFILING --------------------
class CircuitPath extends TrackPath {
  constructor(waypoints, mu = 1.35, aggressiveness = 1.0) {
    super();
    this.mu = mu;
    this.aggressiveness = aggressiveness || 1.0;
    this.pts = [];
    this.waypoints = waypoints;
    
    // 1. Closed-Loop Catmull-Rom Spline with rich telemetry interpolation
    const N = waypoints.length;
    for(let i = 0; i < N; i++){
      const p0 = waypoints[(i - 1 + N) % N];
      const p1 = waypoints[i];
      const p2 = waypoints[(i + 1) % N];
      const p3 = waypoints[(i + 2) % N];
      
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(4, Math.ceil(dist / 2.0)); // 2 meters step
      for(let s = 0; s < steps; s++){
        const t = s / steps, t2 = t*t, t3 = t2*t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        const v_target = (p1.v_target || 45.0) * (1 - t) + (p2.v_target || 45.0) * t;
        
        this.pts.push({ 
          x, y,
          v_max: v_target,
          turn: p1.turn || "",
          turnZh: p1.turnZh || p1.turn || "",
          turnApex: (s === 0 ? !!p1.turnApex : false),
          sector: p1.sector || 1,
          gear: p1.gear || 3,
          isDRS: !!p1.isDRS,
          kerbSide: p1.kerbSide || null,
          runoff: p1.runoff || null,
          brakingBoard: (s === 0 ? (p1.brakingBoard || null) : null)
        });
      }
    }
    
    const P = this.pts.length;
    this.totalPoints = P;
    
    // 2. Heading, Normal & Cumulative Arc-Length Distance
    let totalDist = 0;
    for(let i = 0; i < P; i++){
      const prev = this.pts[(i - 1 + P) % P];
      const curr = this.pts[i];
      const next = this.pts[(i + 1) % P];
      
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      curr.heading = Math.atan2(-dx, dy);
      curr.nx = Math.cos(curr.heading);
      curr.ny = Math.sin(curr.heading);
      
      const stepDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      totalDist += stepDist;
      curr.s = totalDist;
    }
    this.totalLength = totalDist;
    
    // 3. Smooth Curvature Calculation across all points (7-point span)
    for(let i = 0; i < P; i++){
      const prev = this.pts[(i - 4 + P) % P];
      const curr = this.pts[i];
      const next = this.pts[(i + 4) % P];
      
      const ds = Math.hypot(next.x - prev.x, next.y - prev.y);
      let dpsi = next.heading - prev.heading;
      while(dpsi > Math.PI) dpsi -= 2 * Math.PI;
      while(dpsi < -Math.PI) dpsi += 2 * Math.PI;
      
      curr.curvature = dpsi / (ds + 1e-6);
    }
    
    // 3b. G22 赛车线：外-内-外目标线偏移（激进走线——吃满路肩、追求圈速）。
    //     ── G21 原实现的两个根因缺陷（scratch/diag_*.cjs 三脚本实测确认）────
    //     (a) 弯道分段碎片化：退出阈值 0.6× 太紧，T1-T4 蜗牛弯被切成 4 段，每段
    //         独立跑一遍完整「外侧→弯心→外侧」剖面；且存在弧长 15m/转角 3.6°
    //         的样条噪声伪弯段。实测 15 段中 5 段总转角 <25°。
    //     (b) apexOff/outOff 幅度只由赛道宽度与 severity 决定，完全不随段长缩放
    //         ⇒ 弧长仅 74m 的短弯也被要求做 ~10m 横向摆动，实测目标线折角
    //         0.806 m/m = 38.9°，物理上不可跟 → 车把一个弯扭成好几个弯。
    //     ── 修复 ────────────────────────────────────────────────────────────
    //     (1) 退出阈值放宽到 0.30×，减少同一物理弯被局部曲率回落切碎；
    //     (2) 丢弃总转角 < MIN_TURN_DEG 的伪弯段（样条噪声不是弯）；
    //     (3) 偏移剖面改【弧长参数化】并向相邻直道两侧各延伸 EXT_M —— 真实车手
    //         在入弯前的直道上就已靠外侧，横向移动的距离来自直道而非弯内。
    //         这是把折角降下来的关键：靠加长行程，而不是靠砍幅度，故仍能吃满路肩；
    //     (4) 幅度按有效长度限幅。四段余弦剖面的峰值斜率解析式为
    //         peak|d(offset)/ds| = 2π·(apexOff+outOff)/L_eff
    //         （实测校验：L=74m、A=10m → 0.85 m/m，与量到的 0.806 吻合），
    //         故反解 A ≤ SLOPE_MAX·L_eff/(2π)：短弯自动少摆、长弯吃满。
    //     (5) 窗口重叠时用「弯心权重」交叉淡入淡出，而非硬切归属，保证符号连续。
    //     注：与赛道宽度无关。hw_m=4.9（总宽 9.8m，比真实 F1 赛道 13~15m 更窄），
    //         且幅度由 hw_m 推导 —— 加宽赛道只会放大摆幅、扭得更凶。
    const HW_M = 4.9, KERB_M = 1.35;
    const CURV_ENTER = 0.0045;              // 进入弯道阈值（R<222m）
    const CURV_EXIT = CURV_ENTER * 0.30;    // 退出阈值（R<740m）——迟滞放宽防切碎
    const MIN_TURN_DEG = 25.0;              // 段总转角下限，低于此为样条噪声
    const EXT_M = 55.0;                     // 剖面向两侧直道延伸（横向行程的真正来源）
    const SLOPE_MAX = 0.24;                 // |d(offset)/ds| 上限 m/m（≈13.5° 折角）
    this.hw_m = HW_M; this.kerb_m = KERB_M;
    for (let i2 = 0; i2 < P; i2++) { this.pts[i2].offset = 0; this.pts[i2].cornerId = -1; }

    // (1) 曲率分弯（带迟滞）
    const rawSegs = [];
    let ci = 0;
    while (ci < P) {
      if (Math.abs(this.pts[ci].curvature) > CURV_ENTER) {
        let cj = ci + 1;
        while (cj < P && Math.abs(this.pts[cj].curvature) > CURV_EXIT) cj++;
        rawSegs.push([ci, cj - 1]);
        ci = cj;
      } else ci++;
    }
    // (2) 段总转角 = 曲率沿弧长积分；弯心侧由符号定（右弯 curv<0 → 弯心在右 +）
    const turnOf = (i0, i1) => {
      let t = 0;
      for (let k = i0; k < i1; k++) t += this.pts[k].curvature * (this.pts[k + 1].s - this.pts[k].s);
      return t;
    };
    const cornerSegs = [];
    for (const sg of rawSegs) {
      if (Math.abs(turnOf(sg[0], sg[1])) * 180 / Math.PI >= MIN_TURN_DEG) cornerSegs.push(sg);
    }
    this.cornerSegsDropped = rawSegs.length - cornerSegs.length;

    // (3)(4)(5) 逐段生成偏移剖面，交叉淡入淡出累加
    const TL = this.totalLength;
    const offNum = new Array(P).fill(0), offDen = new Array(P).fill(0);
    const cidW = new Array(P).fill(-1), cidBest = new Array(P).fill(-1);
    let cid = 0;
    for (const [i0, i1] of cornerSegs) {
      const s0 = this.pts[i0].s, s1 = this.pts[i1].s;
      const wA = s0 - EXT_M, wB = s1 + EXT_M;              // 延伸后的窗口
      const L_eff = Math.max(1.0, wB - wA);
      const sumCurv = turnOf(i0, i1);
      const apexDir = (sumCurv < 0) ? 1 : -1;
      const avgCurvAbs = Math.abs(sumCurv) / Math.max(1, i1 - i0 + 1) / 2.0;
      const severity = Math.min(1, avgCurvAbs / 0.010);     // 弯越急 → 越贴路肩/越外放
      // 激进口径：弯心骑满路肩内侧（HW+0.65·KERB≈5.78m），入/出弯贴外侧沥青边
      const sevF = 0.62 + 0.38 * severity;
      let apexOff = (HW_M + 0.65 * KERB_M) * sevF;
      let outOff = (HW_M - 0.10) * sevF;
      // (4) 折角预算反解幅度上限
      const ampMax = SLOPE_MAX * L_eff / (2 * Math.PI);
      const ampScale = Math.min(1.0, ampMax / Math.max(0.01, apexOff + outOff));
      apexOff *= ampScale; outOff *= ampScale;

      for (let k = 0; k < P; k++) {
        // 环状窗口：s 可能跨起终点，取落在 [wA,wB] 内的那个镜像
        const sk = this.pts[k].s;
        let cand = null;
        for (let m = -1; m <= 1; m++) {
          const c = sk + m * TL;
          if (c >= wA && c <= wB) { cand = c; break; }
        }
        if (cand === null) continue;
        const phi = (cand - wA) / L_eff;
        // 四段余弦（C¹）：0 → −outOff → +apexOff → −outOff → 0，段边界归零不跳变
        let prof;
        if (phi < 0.25) { const t = phi / 0.25; prof = -outOff * (1 - Math.cos(Math.PI * t)) / 2; }
        else if (phi < 0.5) { const t = (phi - 0.25) / 0.25; prof = -outOff + (apexOff + outOff) * (1 - Math.cos(Math.PI * t)) / 2; }
        else if (phi < 0.75) { const t = (phi - 0.5) / 0.25; prof = apexOff - (apexOff + outOff) * (1 - Math.cos(Math.PI * t)) / 2; }
        else { const t = (phi - 0.75) / 0.25; prof = -outOff * (1 + Math.cos(Math.PI * t)) / 2; }
        // (5) 弯心权重：phi=0.5 处 1，窗口两端 0 —— 重叠段之间平滑过渡
        const w = Math.max(0, 1 - Math.abs(phi - 0.5) * 2);
        if (w <= 0) continue;
        offNum[k] += apexDir * prof * w;
        offDen[k] += w;
        if (w > cidBest[k]) { cidBest[k] = w; cidW[k] = cid; }
      }
      cid++;
    }
    for (let k = 0; k < P; k++) {
      this.pts[k].offset = offDen[k] > 1e-9 ? offNum[k] / offDen[k] : 0;
      this.pts[k].cornerId = offDen[k] > 1e-9 ? cidW[k] : -1;
    }
    this.cornerCount = cid;
    // 移动平均平滑（防段间微跳与离散噪声），环状窗口 7 点
    const offRaw = this.pts.map(p => p.offset);
    for(let i3 = 0; i3 < P; i3++){
      let s = 0;
      for(let w2 = -3; w2 <= 3; w2++) s += offRaw[(i3 + w2 + P) % P];
      this.pts[i3].offset = s / 7;
    }
    // (6) 斜率硬限幅。步骤 (4) 的幅度预算只对【单段】剖面成立（峰值斜率
    //     2π·A/L_eff）；步骤 (5) 的交叉淡入淡出在窗口重叠区会合成出超出该解析界
    //     的斜率（实测 0.291 > 0.24）。故对 offset 数组做前向+后向双向限幅，
    //     使 |d(offset)/ds| ≤ SLOPE_MAX 【恒成立】，不依赖剖面形状的假设。
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let k = 0; k < P - 1; k++) {
        const lim = SLOPE_MAX * Math.max(1e-6, this.pts[k + 1].s - this.pts[k].s);
        const d = this.pts[k + 1].offset - this.pts[k].offset;
        if (d > lim) { this.pts[k + 1].offset = this.pts[k].offset + lim; changed = true; }
        else if (d < -lim) { this.pts[k + 1].offset = this.pts[k].offset - lim; changed = true; }
      }
      for (let k = P - 1; k > 0; k--) {
        const lim = SLOPE_MAX * Math.max(1e-6, this.pts[k].s - this.pts[k - 1].s);
        const d = this.pts[k].offset - this.pts[k - 1].offset;
        if (d > lim) { this.pts[k - 1].offset = this.pts[k].offset - lim; changed = true; }
        else if (d < -lim) { this.pts[k - 1].offset = this.pts[k].offset + lim; changed = true; }
      }
      if (!changed) break;
    }
    for(let i4 = 0; i4 < P; i4++){
      const pt = this.pts[i4];
      pt.refX = pt.x + pt.nx * pt.offset;
      pt.refY = pt.y + pt.ny * pt.offset;
    }

    // 3c. G22 赛车线自身的切向 / 曲率 / 法向 / 弧长（与中心线同口径的 7 点跨距）。
    //     ★ 根因修复核心：控制器此前用【中心线】的 heading/curvature 去追【赛车线】的
    //       横向目标，航向项增益 1.0 对横向项 ~0.03 形成 30:1 压制 ⇒ 车被拉回中线。
    //       这三个量让赛车线成为一等公民，drive() 的三个参考量得以同源。
    for (let i5 = 0; i5 < P; i5++) {
      const pv = this.pts[(i5 - 4 + P) % P], nx5 = this.pts[(i5 + 4) % P];
      this.pts[i5].refHeading = Math.atan2(-(nx5.refX - pv.refX), nx5.refY - pv.refY);
    }
    let sRef = 0;
    for (let i6 = 0; i6 < P; i6++) {
      const pv = this.pts[(i6 - 1 + P) % P], cu = this.pts[i6];
      sRef += Math.hypot(cu.refX - pv.refX, cu.refY - pv.refY);
      cu.sRef = sRef;
    }
    this.totalLengthRef = sRef;
    for (let i7 = 0; i7 < P; i7++) {
      const pv = this.pts[(i7 - 4 + P) % P], nx7 = this.pts[(i7 + 4) % P];
      const ds = Math.hypot(nx7.refX - pv.refX, nx7.refY - pv.refY);
      let dpsi = nx7.refHeading - pv.refHeading;
      while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
      while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
      this.pts[i7].refCurvature = dpsi / (ds + 1e-6);
      this.pts[i7].refNx = Math.cos(this.pts[i7].refHeading);
      this.pts[i7].refNy = Math.sin(this.pts[i7].refHeading);
    }
    this._hintCtrl = 0;   // getLookahead 最近点搜索的 hint 缓存
    this._hintRoad = 0;   // getRoadElevation 的 hint 缓存（每子步 4 轮，热路径）
    
    // 4. Physical Aerodynamic Speed Envelope & Friction Limits
    // G21（2026-09-01）push 升级：横向包络 0.72μ→0.85μ，制动 4.8→5.5，加速 5.2→5.8（真实车手探极限口径）
    // G22：横向包络改用【赛车线曲率 refCurvature】而非中心线曲率 —— 车跑的是赛车线，
    //      可用侧向加速度由赛车线的真实半径决定。弯心处赛车线半径更大 → 曲率更小
    //      → 自然得到更高弯速，这就是「赛车线圈速奖励」的物理来源，无需再拍一个
    //      经验百分比（原 5b 的 +4% 已删）；而换线过渡区 refCurvature 偏大 → 自动压速，
    //      也是正确的（横向移动本身要吃掉一部分抓地力预算）。
    const vehType = (typeof window !== "undefined" && window.S && window.S.vehicleType) ? window.S.vehicleType : "formula";
    const v_top_kmh = (vehType === "formula") ? 335.0 : (vehType === "gt3" || vehType === "sport") ? 295.0 : (vehType === "kart") ? 140.0 : 245.0;
    const v_top_veh = v_top_kmh * (1000.0 / 3600.0);
    const aggrScale = Math.min(1.35, Math.max(0.65, this.aggressiveness));
    const a_lat_max = Math.max(4.5, this.mu * 9.81 * 0.85 * aggrScale);
    
    for(let i = 0; i < P; i++){
      const pt = this.pts[i];
      const kLine = (pt.refCurvature !== undefined) ? pt.refCurvature : pt.curvature;
      const curv_v = Math.sqrt(a_lat_max / (Math.abs(kLine) + 1e-5));
      pt.v_max = Math.min(v_top_veh, Math.min(pt.v_max, curv_v));
    }
    
    // 5. Backward & Forward Braking/Acceleration Passes
    // G21：push 口径——真实车手试探刹车点的包络上限（逐圈学习会在运行时继续压低）
    const a_brake = 5.5 * Math.min(1.2, Math.max(0.8, aggrScale));
    const a_accel = 5.8 * Math.min(1.2, Math.max(0.8, aggrScale));
    
    for(let pass = 0; pass < 60; pass++) {
      let maxDiff = 0;
      for(let i = P - 1; i >= 0; i--){
        const nextIdx = (i + 1) % P;
        const ds = Math.hypot(this.pts[nextIdx].x - this.pts[i].x, this.pts[nextIdx].y - this.pts[i].y);
        const v_limit = Math.sqrt(this.pts[nextIdx].v_max**2 + 2 * a_brake * ds);
        if(v_limit < this.pts[i].v_max){
          maxDiff = Math.max(maxDiff, this.pts[i].v_max - v_limit);
          this.pts[i].v_max = v_limit;
        }
      }
      if(maxDiff < 0.01) break;
    }

    for(let pass = 0; pass < 60; pass++) {
      let maxDiff = 0;
      for(let i = 0; i < P; i++){
        const prevIdx = (i - 1 + P) % P;
        const ds = Math.hypot(this.pts[i].x - this.pts[prevIdx].x, this.pts[i].y - this.pts[prevIdx].y);
        const v_limit = Math.sqrt(this.pts[prevIdx].v_max**2 + 2 * a_accel * ds);
        if(v_limit < this.pts[i].v_max){
          maxDiff = Math.max(maxDiff, this.pts[i].v_max - v_limit);
          this.pts[i].v_max = v_limit;
        }
      }
      if(maxDiff < 0.01) break;
    }

    // 5b. G22：原「弯点 +4% 速度奖励」已删除 —— 该经验加成是在补偿「速度包络用中心线
    //      曲率、但车实际跑赛车线」的口径不一致。步骤 4 改用 refCurvature 后，弯速奖励
    //      由赛车线的真实几何半径直接给出（弯心半径更大 → 曲率更小 → v_max 更高），
    //      物理自洽且逐点连续，不再需要按 cornerId 拍一个全局百分比。
  }

  /* G22：带 hint 窗口的最近点搜索。
     性能根由：VehicleDynamics15DOF.step() 以 1000Hz 子步对【四个车轮】各调一次
     getRoadElevation，单帧约 16 子步 × 4 轮 = 64 次；旧的 O(P) 全量遍历在 P=2884 时
     是 ~18万次距离计算/帧。窗口 ±WIN 点（≈±80m）+ 两道退化护栏后降至 ~5千次。
     useRef=true 时对赛车线(refX/refY)搜索，false 对中心线(x/y)。
     护栏：① 命中窗口边界 ⇒ 可能真最近点在窗外；② 窗口内最近距离 > 25m ⇒
     车辆可能已传送/重生。任一命中则回退全量搜索，保证结果与旧实现一致。 */
  _nearestIdx(x, y, hint, useRef) {
    const P = this.pts.length;
    const WIN = 40;
    const px = p => (useRef ? p.refX : p.x), py = p => (useRef ? p.refY : p.y);
    if (typeof hint === "number" && hint >= 0 && hint < P && P > WIN * 2) {
      let best = -1, bd = Infinity, lo = -1, hi = -1;
      for (let k = -WIN; k <= WIN; k++) {
        const i = (hint + k + P) % P, p = this.pts[i];
        const d = (px(p) - x) ** 2 + (py(p) - y) ** 2;
        if (d < bd) { bd = d; best = i; }
        if (k === -WIN) lo = i;
        if (k === WIN) hi = i;
      }
      if (best !== lo && best !== hi && bd < 625.0) return best;
    }
    let best = 0, bd = Infinity;
    for (let i = 0; i < P; i++) {
      const p = this.pts[i];
      const d = (px(p) - x) ** 2 + (py(p) - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* G22：沿赛车线弧长前进 ld 米，返回目标点索引。
     旧实现名为 getLookahead 但只返回【最近点】，v 参数完全未用。现保留真弧长
     前进能力，但【默认关闭】——原因见 _leadDist。 */
  _advanceIdx(i, ld) {
    if (!(ld > 0)) return i;
    const P = this.pts.length;
    let acc = 0, k = i;
    for (let n = 0; n < P; n++) {
      const kn = (k + 1) % P;
      const a = this.pts[k], b = this.pts[kn];
      const seg = Math.hypot(b.refX - a.refX, b.refY - a.refY);
      if (acc + seg >= ld) return kn;
      acc += seg; k = kn;
    }
    return k;
  }

  /* G22：前视距离——【默认 0】，这是经过推导的结论而非遗漏。
     drive() 是 Stanley 型控制器：横向误差在前轴量 + 曲率前馈。该组合在等曲率
     弧上【精确】：车在线上且对齐时 e_ψ=0、e_y=0 ⇒ δ = -atan(WB·k)，正好等于所需。
     若再对 heading 施加弧长前视 ld，前视点切向相对车身已转过 k·ld，会与曲率
     前馈【重复计权】：k=0.02（R=50m）、ld=20m 时多打 23°，而真正需要的只有 3°。
     旧代码的 `+forward*(lookDist*0.22)` 平移就是这类重复计权（且平移方向跟车身
     航向而非赛道）。如确需预览，请显式传 leadM 并同步下调曲率前馈。 */
  _leadDist(v, leadM, kAt) {
    if (typeof leadM !== "number" || !isFinite(leadM) || leadM <= 0) return 0;
    // 显式启用时：急弯自动少看（发卡弯 R≈25m 里看 30m 等于看到 70° 开外）
    const ldCurv = 0.75 / Math.max(0.004, Math.abs(kAt || 0));
    return Math.max(0, Math.min(45.0, Math.min(leadM, ldCurv)));
  }

  getLookahead(x, y, v, leadM) {
    // ★ G22：最近点对【赛车线】搜索 —— 控制基准必须与目标线同源。
    const closestIdx = this._nearestIdx(x, y, this._hintCtrl, true);
    this._hintCtrl = closestIdx;
    const pt = this.pts[closestIdx];

    // 两套横向误差，语义必须分开：
    //   crossTrackError —— 相对【中心线】，物理赛道边界与罚时判定用（赛道边缘
    //                      关于中心线对称，不能用赛车线量，否则弯心永远不触发）；
    //   lineError       —— 相对【赛车线】，控制用（法向也取赛车线法向 refNx/refNy）。
    const crossTrackError = (x - pt.x) * pt.nx + (y - pt.y) * pt.ny;
    const lineError = (x - pt.refX) * pt.refNx + (y - pt.refY) * pt.refNy;

    const ld = this._leadDist(v, leadM, pt.refCurvature);
    const lookIdx = this._advanceIdx(closestIdx, ld);
    const tp = this.pts[lookIdx];

    return {
      // ★ G22：三个控制参考量全部取自赛车线的前视点（修复前：heading/curvature
      //   取中心线、横向目标取赛车线，两条线互相打架）
      targetHeading: tp.refHeading,
      targetCurvature: tp.refCurvature,
      targetSpeed: tp.v_max,
      crossTrackError: crossTrackError,
      lineError: lineError,
      // 以下 x/y/nx/ny 保持【中心线】语义不变（向后兼容：11-stages.js:3782 的
      // 转播机位用 tvPt.x/y/nx/ny 向赛道侧外推 22m，改成赛车线会偏移最多 5.8m）
      nx: pt.nx,
      ny: pt.ny,
      x: pt.x,
      y: pt.y,
      idx: closestIdx,
      // G21/G22：赛车线目标点与法向（外-内-外）、弯道索引（逐圈刹车学习用）
      offset: pt.offset || 0,
      refX: pt.refX,
      refY: pt.refY,
      refNx: pt.refNx,
      refNy: pt.refNy,
      cornerId: pt.cornerId !== undefined ? pt.cornerId : -1,
      lookIdx: lookIdx,
      leadM: ld,
      s: pt.s || 0,
      sRef: pt.sRef || 0,
      turn: pt.turn,
      turnZh: pt.turnZh,
      sector: pt.sector,
      gear: pt.gear || 3,
      isDRS: pt.isDRS,
      kerbSide: pt.kerbSide,
      runoff: pt.runoff,
      brakingBoard: pt.brakingBoard
    };
  }

  getRoadElevation(x, y) {
    // G22：热路径——VehicleDynamics15DOF.step() 以 1000Hz 子步对四轮各调一次，
    // 单帧 ~64 次。旧的 O(P) 全量遍历在 P=2884 时是 ~18万次距离计算/帧，
    // 改用 hint 窗口后降至 ~5千次。路面高程/路肩/砾石均关于【中心线】定义，
    // 故此处仍对中心线搜索（useRef=false），与 getLookahead 的赛车线基准分开。
    const closestIdx = this._nearestIdx(x, y, this._hintRoad, false);
    this._hintRoad = closestIdx;

    const pt = this.pts[closestIdx];
    const ey = (x - pt.x) * pt.nx + (y - pt.y) * pt.ny;
    const absEy = Math.abs(ey);
    const hw = this.hw_m || 7.0; // G21：窄道——沥青半宽（新 4.9m，旧赛道对象回退 7.0）
    const kw = this.kerb_m || 1.35; // 1.35m FIA Kerb width
    const s = pt.s || (closestIdx * 2.0); // G22：用真实累计弧长（旧实现用 idx*2 估算）
    
    let z_road = 0.0;
    let isKerb = false;
    let kerbRatio = 0.0;
    let mu = this.mu || 1.35;
    
    const hasKerb = pt.kerbSide || (Math.abs(pt.curvature || 0) > 0.006);
    
    if (absEy > hw && absEy <= (hw + kw) && hasKerb) {
      isKerb = true;
      kerbRatio = (absEy - hw) / kw;
      // Smooth sinusoidal bevel slope (up to 38mm kerb crest)
      const z_bevel = 0.038 * Math.sin(kerbRatio * (Math.PI / 2.0));
      // High-frequency Rumble Strip sinusoidal serrations (wavelength 0.35m, amplitude 12mm)
      const lambda = 0.35;
      const z_rumble = 0.012 * Math.sin((Math.PI * s) / lambda)**2;
      z_road = z_bevel + z_rumble * Math.sin(kerbRatio * Math.PI);
      mu = 1.18; // Painted kerb friction coefficient
    } else if (absEy > (hw + kw)) {
      // Off-track grass / gravel apron
      z_road = -0.012 + 0.004 * Math.sin(s * 3.1) * Math.cos(ey * 2.0);
      mu = 0.78;
    } else {
      // Pristine track asphalt
      z_road = 0.0;
      mu = this.mu || 1.35;
    }
    
    return { z_road, isKerb, kerbRatio, mu, ey, s, pt };
  }
}

window.TrackPath = TrackPath;
window.CirclePath = CirclePath;
window.StraightPath = StraightPath;
window.CircuitPath = CircuitPath;



