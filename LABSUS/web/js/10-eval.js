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
    
    // 4. Physical Aerodynamic Speed Envelope & Friction Limits
    const vehType = (typeof window !== "undefined" && window.S && window.S.vehicleType) ? window.S.vehicleType : "formula";
    const v_top_kmh = (vehType === "formula") ? 335.0 : (vehType === "gt3" || vehType === "sport") ? 295.0 : (vehType === "kart") ? 140.0 : 245.0;
    const v_top_veh = v_top_kmh * (1000.0 / 3600.0);
    const aggrScale = Math.min(1.35, Math.max(0.65, this.aggressiveness));
    const a_lat_max = Math.max(4.5, this.mu * 9.81 * 0.72 * aggrScale);
    
    for(let i = 0; i < P; i++){
      const pt = this.pts[i];
      const curv_v = Math.sqrt(a_lat_max / (Math.abs(pt.curvature) + 1e-5));
      pt.v_max = Math.min(v_top_veh, Math.min(pt.v_max, curv_v));
    }
    
    // 5. Backward & Forward Braking/Acceleration Passes
    const a_brake = 4.8 * Math.min(1.2, Math.max(0.8, aggrScale));
    const a_accel = 5.2 * Math.min(1.2, Math.max(0.8, aggrScale));
    
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
  }

  getLookahead(x, y, v) {
    const P = this.pts.length;
    let minDist = Infinity;
    let closestIdx = 0;
    
    for(let i = 0; i < P; i++){
      const pt = this.pts[i];
      const d = (pt.x - x)**2 + (pt.y - y)**2;
      if(d < minDist){ minDist = d; closestIdx = i; }
    }
    
    const pt = this.pts[closestIdx];
    const crossTrackError = (x - pt.x) * pt.nx + (y - pt.y) * pt.ny;
    
    return {
      targetHeading: pt.heading,
      targetCurvature: pt.curvature,
      targetSpeed: pt.v_max,
      crossTrackError: crossTrackError,
      nx: pt.nx,
      ny: pt.ny,
      x: pt.x,
      y: pt.y,
      idx: closestIdx,
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
    let minDist = Infinity;
    let closestIdx = 0;
    
    for(let i = 0; i < this.totalPoints; i++){
      const pt = this.pts[i];
      const d = (pt.x - x)**2 + (pt.y - y)**2;
      if(d < minDist){ minDist = d; closestIdx = i; }
    }
    
    const pt = this.pts[closestIdx];
    const ey = (x - pt.x) * pt.nx + (y - pt.y) * pt.ny;
    const absEy = Math.abs(ey);
    const hw = 7.0; // 7.0m asphalt half-width
    const kw = 1.35; // 1.35m FIA Kerb width
    const s = closestIdx * 2.0; // ~2m per interpolated point
    
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



