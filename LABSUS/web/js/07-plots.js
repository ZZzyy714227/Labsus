"use strict";
function plotXYMulti(cv,title,unit,series,xr,curx){
  /* 多实线绘制（plotXYOverlay 的多线版本，供引擎结果面板使用） */
  const dpr=Math.min(3,window.devicePixelRatio||1);
  const w=cv.clientWidth||300,h=cv.clientHeight||84;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;}
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
  const ml=42,mr=8,mt=16,mb=13,pw=w-ml-mr,ph=h-mt-mb;
  let y0=1e9,y1=-1e9;
  series.forEach(s=>s.pts.forEach(p=>{if(p[1]===null||!isFinite(p[1]))return;
    if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}));
  if(y0>y1){y0=0;y1=1;}
  let pad=(y1-y0)*0.15;if(pad<1e-6)pad=Math.max(0.5,abs(y1)*0.1+0.01);
  y0-=pad;y1+=pad;
  const X=x=>ml+(x-xr[0])/((xr[1]-xr[0])||1)*pw;
  const Y=y=>mt+ph-(y-y0)/((y1-y0)||1)*ph;
  ctx.strokeStyle=C.grid;ctx.lineWidth=1;ctx.setLineDash([]);
  for(let i=0;i<=4;i++){const y=mt+ph*i/4;ctx.beginPath();ctx.moveTo(ml,y);ctx.lineTo(ml+pw,y);ctx.stroke();}
  for(let i=0;i<=5;i++){const x=ml+pw*i/5;ctx.beginPath();ctx.moveTo(x,mt);ctx.lineTo(x,mt+ph);ctx.stroke();}
  series.forEach(s=>{
    ctx.strokeStyle=s.c;ctx.lineWidth=s.w||1.4;ctx.setLineDash([]);ctx.beginPath();let st=false;
    s.pts.forEach(p=>{if(p[1]===null||!isFinite(p[1])){st=false;return;}
      const x=X(p[0]),y=Y(p[1]);if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);});
    ctx.stroke();
  });
  if(curx!==null&&curx!==undefined&&series[0]){
    const x=X(curx);
    ctx.strokeStyle=C.dim;ctx.setLineDash([2,2]);
    ctx.beginPath();ctx.moveTo(x,mt);ctx.lineTo(x,mt+ph);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.strokeStyle=C.axis;ctx.lineWidth=1;ctx.strokeRect(ml+.5,mt+.5,pw,ph);
  ctx.fillStyle=C.txt2;ctx.font="10.5px ui-monospace,monospace";
  ctx.fillText(title,ml+1,mt-3.5);
  ctx.fillStyle=C.txt3;ctx.textAlign="right";
  ctx.fillText(fmt(y1,1),ml-3,mt+7);ctx.fillText(fmt(y0,1),ml-3,mt+ph-1);
  ctx.textAlign="left";
}

function fitAll(){ VW.forEach(fitView); }

/* ================================ 12. 读数更新与双线曲线绘制 ================================ */
function updateReadouts(){
  const isF = S.axis === 'front';
  const m = isF ? SIM.mFR : SIM.mRR;
  const M = isF ? SIM.FR : SIM.RR;
  const sw = isF ? SIM.swF : SIM.swR;
  const state = S[S.axis];
  if(!m)return;
  
  const mr = sampleSweep(sw, m.tr, "mr") || (isF?SIM.mrRefF:SIM.mrRefR);
  const cg = sampleSweep(sw, m.tr, "cg"), bs = sampleSweep(sw, m.tr, "bs");
  const wr = state.kS * mr * mr;
  const frq = sqrt(wr * 1000 / state.mS) / (2 * PI);

  const archLabel = state.arch === "direct" ? "直连 (Direct Coilover)" : (state.arch === "pushrod" ? "推杆 (Pushrod)" : "拉杆 (Pullrod)");
  setRO("roArch", archLabel);
  setRO("roRckDeg", state.arch === "direct" ? "--" : sfmt(m.rockerDeg, 2));
  setRO("roMR", fmt(mr, 3));
  setRO("roDmpDisp", sfmt(M.damperL0 - m.damperL, 1));
  setRO("roSprF", fmt(M.springF0/FS + state.kS*(M.damperL0 - m.damperL), 0));
  setRO("roWR", fmt(wr, 1));

  setRO("roCam", fmt(m.cam, 2));
  setRO("roToe", sfmt(m.toe, 3));
  setRO("roKpi", fmt(m.kpi, 2));
  setRO("roCast", fmt(m.cast, 2));
  setRO("roScrub", sfmt(m.scrub, 1));
  setRO("roTrail", sfmt(m.trail, 1));
  
  /* 阿克曼计算 (仅前悬) */
  const ak = ackermann('front');
  setRO("roAck", ak&&ak.pct!==null ? fmt(ak.pct, 0) : "--");
  setRO("roTrad", ak&&ak.R!==null ? fmt(abs(ak.R), 2) : "--");
  
  /* ARB 刚度计算 */
  const mra = sampleSweep(sw, m.tr, "mra") || 0.55;
  const ar = arbRate(mra, state);
  const track = abs(m.cp[0])*2;
  const psiL = sampleSweep(sw, travelL(isF?SIM.halfF:SIM.halfR), "apsi");
  const dpsi = (psiL===null?0:m.apsi-psiL);
  const kRoll = q => q*track*track/2/1e6*PI/180*1000;
  const Ks = kRoll(wr), Ka = kRoll(ar.k);
  
  setRO("roArbTw", sfmt(dpsi, 2));
  setRO("roArbKt", ar.kt?fmt(ar.kt*D2R/1000,1):"0");
  setRO("roArbKr", fmt(Ka, 0));
  setRO("roArbTot", fmt(Ks+Ka, 0));
  setRO("roArbSh", fmt(100*Ka/Math.max(1e-6, Ks+Ka), 0));

  /* 准静态分析结果读数 */
  const qs = SIM.qsRes;
  if(qs){
    setRO("roQsRoll", fmt(qs.rollDeg, 2));
    setRO("roQsRollGrad", fmt(qs.rollGrad, 2));
    setRO("roQsKf", fmt(qs.kphi_f, 0));
    setRO("roQsKr", fmt(qs.kphi_r, 0));
    setRO("roFzFL", fmt(qs.fz.FL, 0));
    setRO("roFzFR", fmt(qs.fz.FR, 0));
    setRO("roFzRL", fmt(qs.fz.RL, 0));
    setRO("roFzRR", fmt(qs.fz.RR, 0));
    /* US Gradient / 前后侧偏角 / Jacking（准静态新增，镜像引擎） */
    setRO("roUsGrad", Math.abs(qs.usGrad) > 1e-9 ? fmt(qs.usGrad, 2) : "—");
    setRO("roAlphaF", fmt(qs.alphaF, 2));
    setRO("roAlphaR", fmt(qs.alphaR, 2));
    setRO("roJacking", fmt(qs.jackingMm, 2));

    const tb=document.getElementById("tlltdBar");
    if(tb){
      tb.style.width=qs.tlltd.toFixed(1)+"%";
      document.getElementById("tlltdLblF").textContent="前轴: "+qs.tlltd.toFixed(1)+"%";
      document.getElementById("tlltdLblR").textContent="后轴: "+(100-qs.tlltd).toFixed(1)+"%";
    }
    const bias = qs.tlltd > 54 ? "倾向不足转向 (UNDERSTEER)" : (qs.tlltd < 47 ? "倾向过度转向 (OVERSTEER)" : "中性偏稳定 (NEUTRAL)");
    setRO("roHandling", bias);

    document.getElementById("sbTLLTD").textContent = qs.tlltd.toFixed(1)+"%";
    document.getElementById("sbRollGrad").textContent = qs.rollGrad.toFixed(2)+" °/g";
  }

  /* Baseline 差异读数 */
  if(S.hasBaseline && S.baseline){
    const b_sw = isF ? S.baseline.swF : S.baseline.swR;
    const updateDiff = (id, key, scale)=>{
      const aVal = sampleSweep(sw, 0, key) || 0;
      const bVal = sampleSweep(b_sw, 0, key) || 0;
      const elA=document.getElementById("df_a_"+id), elB=document.getElementById("df_b_"+id), elD=document.getElementById("df_d_"+id);
      if(elA&&elB&&elD){
        elA.textContent = fmt(aVal * (scale||1), 2);
        elB.textContent = fmt(bVal * (scale||1), 2);
        elD.textContent = sfmt((aVal - bVal) * (scale||1), 2);
      }
    };
    updateDiff("cg","cg",1); updateDiff("bs","bs",1); updateDiff("mr","mr",1); updateDiff("rcH","rcH",1); updateDiff("kw","kw",1);
  }

  setRO("roCG", cg===null?"--":sfmt(cg, 3));
  setRO("roBS", bs===null?"--":sfmt(bs, 3));
  const rcv = SIM.rc2 ? SIM.rc2[1] : m.rcH;
  setRO("roRC", rcv===null?"--":fmt(rcv, 1));
  setRO("roAnti", m.anti===null?"--":fmt(m.anti, 1));
  setRO("roFreq", fmt(frq, 2));

  setRO("roNodes", M.n.length+" ("+M.nFree+" 自由)");
  setRO("roRigLinks", M.nRig+" 条约束");
  setRO("roRes", M.res<1e-4?M.res.toExponential(2):fmt(M.res,5), M.res>0.025);
  setRO("roSolveMs", fmt(M.ms,2));

  document.getElementById("sbNode").textContent=M.n.length;
  document.getElementById("sbRig").textContent=M.nRig;
  document.getElementById("sbDof").textContent=M.dof;
  document.getElementById("sbRes").textContent=M.res<1e-4?M.res.toExponential(1):fmt(M.res,4);
  document.getElementById("sbResC").className="c "+(M.res<0.001?"ok":(M.res<0.025?"hl":"bad"));
  document.getElementById("sbMs").textContent=fmt(M.ms,2)+" ms";
  document.getElementById("tbState").textContent=S.play?"运行":"暂停";
  document.getElementById("tbStateBox").className=S.play?"g":"a";
  document.getElementById("tbStateDot").className="dot "+(S.play?"g":"a");
  
  const archText = state.arch === "direct" ? "直连 DIRECT" : (state.arch === "pushrod" ? "推杆 PUSHROD" : "拉杆 PULLROD");
  const archName = state.arch === "direct" ? "直连双叉臂" : (state.arch === "pushrod" ? "推杆摇臂" : "拉杆摇臂");
  document.getElementById("tbArch").textContent = (isF ? "前 " : "后 ") + archText;
  document.getElementById("sbArchName").textContent = (isF ? "前悬架 (" : "后悬架 (") + archName + ")";
}

function plotXYOverlay(cv,title,unit,seriesActive,seriesBase,xr,curx,seriesMeas){
  const dpr=Math.min(3,window.devicePixelRatio||1);
  const w=cv.clientWidth||300,h=cv.clientHeight||84;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;}
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
  const ml=42,mr=8,mt=16,mb=13,pw=w-ml-mr,ph=h-mt-mb;
  
  let y0=1e9,y1=-1e9;
  const allPts = [].concat(seriesActive.pts, seriesBase?seriesBase.pts:[], seriesMeas?seriesMeas.pts:[]);
  allPts.forEach(p=>{if(p[1]===null||!isFinite(p[1]))return;
    if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];});
  if(y0>y1){y0=0;y1=1;}
  let pad=(y1-y0)*0.15;if(pad<1e-6)pad=Math.max(0.5,abs(y1)*0.1+0.01);
  y0-=pad;y1+=pad;

  const X=x=>ml+(x-xr[0])/((xr[1]-xr[0])||1)*pw;
  const Y=y=>mt+ph-(y-y0)/((y1-y0)||1)*ph;

  ctx.strokeStyle=C.grid;ctx.lineWidth=1;ctx.setLineDash([]);
  for(let i=0;i<=4;i++){const y=mt+ph*i/4;ctx.beginPath();ctx.moveTo(ml,y);ctx.lineTo(ml+pw,y);ctx.stroke();}
  for(let i=0;i<=5;i++){const x=ml+pw*i/5;ctx.beginPath();ctx.moveTo(x,mt);ctx.lineTo(x,mt+ph);ctx.stroke();}

  // 1. 绘制 Baseline 基准曲线 (虚线)
  if(seriesBase && seriesBase.pts.length){
    ctx.strokeStyle=C.base;ctx.lineWidth=1.3;ctx.setLineDash([4,3]);ctx.beginPath();let st=false;
    seriesBase.pts.forEach(p=>{if(p[1]===null||!isFinite(p[1])){st=false;return;}
      const x=X(p[0]),y=Y(p[1]);if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);});
    ctx.stroke();
  }

  // 1.5 绘制台架实测曲线 (点划线，K&C 对拍，讲义 EP02“仿真预测↔台架验证”闭环)
  if(seriesMeas && seriesMeas.pts.length){
    ctx.strokeStyle=seriesMeas.c||C.frc;ctx.lineWidth=1.2;ctx.setLineDash([6,2,1.5,2]);
    ctx.beginPath();let stm=false;
    seriesMeas.pts.forEach(p=>{if(p[1]===null||!isFinite(p[1])){stm=false;return;}
      const x=X(p[0]),y=Y(p[1]);if(!stm){ctx.moveTo(x,y);stm=true;}else ctx.lineTo(x,y);});
    ctx.stroke();ctx.setLineDash([]);
  }

  // 2. 绘制 Active 活动曲线 (实线)
  ctx.strokeStyle=seriesActive.c;ctx.lineWidth=seriesActive.w||1.4;ctx.setLineDash([]);ctx.beginPath();let st=false;
  seriesActive.pts.forEach(p=>{if(p[1]===null||!isFinite(p[1])){st=false;return;}
    const x=X(p[0]),y=Y(p[1]);if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);});
  ctx.stroke();

  if(curx!==null&&curx!==undefined&&seriesActive.pts[0]){
    const x=X(curx);
    ctx.strokeStyle=C.dim;ctx.setLineDash([2,2]);
    ctx.beginPath();ctx.moveTo(x,mt);ctx.lineTo(x,mt+ph);ctx.stroke();ctx.setLineDash([]);
  }

  ctx.strokeStyle=C.axis;ctx.lineWidth=1;ctx.strokeRect(ml+.5,mt+.5,pw,ph);
  ctx.fillStyle=C.txt2;ctx.font="10.5px ui-monospace,monospace";
  ctx.fillText(title,ml+1,mt-3.5);
  ctx.fillStyle=C.txt3;ctx.textAlign="right";
  ctx.fillText(fmt(y1,1),ml-3,mt+7);ctx.fillText(fmt(y0,1),ml-3,mt+ph-1);
  ctx.textAlign="left";
}

/* K&C 台架对拍：实测 vs 仿真 RMS 偏差（°，重叠行程区间，线性插值到仿真网格） */
function kcMeasuredRMS(axis,key){
  const meas = SIM.kcMeasured ? SIM.kcMeasured[axis] : null;
  const sw = axis==="front" ? SIM.swF : SIM.swR;
  if(!meas||!sw||!sw.rows||!meas.travel||meas.travel.length<2)return null;
  const lo=Math.max(sw.rows[0].tr, Math.min(meas.travel[0],meas.travel[meas.travel.length-1]));
  const hi=Math.min(sw.rows[sw.rows.length-1].tr, Math.max(meas.travel[0],meas.travel[meas.travel.length-1]));
  if(!(hi>lo))return null;
  const interp=(xs,ys,x)=>{
    if(x<=xs[0])return ys[0];if(x>=xs[xs.length-1])return ys[ys.length-1];
    let i=1;while(i<xs.length&&xs[i]<x)i++;
    const t=(x-xs[i-1])/((xs[i]-xs[i-1])||1e-9);return ys[i-1]+(ys[i]-ys[i-1])*t;};
  let s2=0,n=0;
  for(const r of sw.rows){ if(r.tr<lo||r.tr>hi)continue;
    const mv=interp(meas.travel,meas[key],r.tr);
    const sv=interp(sw.rows.map(q=>q.tr),sw.rows.map(q=>q[key]),r.tr);
    if(isFinite(mv)&&isFinite(sv)){s2+=(mv-sv)*(mv-sv);n++;}}
  return n>1?Math.sqrt(s2/n):null;
}

/* 不足转向特性 δ-ay 图（底盘开发汇报核心图；当前工况点红点标记） */
function plotUsCurve(cv){
  const c=SIM.usCurve;if(!c||!c.gy||c.gy.length<3)return;
  const dpr=Math.min(3,window.devicePixelRatio||1);
  const w=cv.clientWidth||300,h=cv.clientHeight||110;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;}
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
  const ml=38,mr=8,mt=16,mb=14,pw=w-ml-mr,ph=h-mt-mb;
  let y0=0,y1=0.1;
  c.us.forEach(v=>{if(isFinite(v)){if(v<y0)y0=v;if(v>y1)y1=v;}});
  const pad=(y1-y0)*0.15+0.05;y0-=pad;y1+=pad;
  const X=x=>ml+(x/2.0)*pw, Y=y=>mt+ph-(y-y0)/((y1-y0)||1)*ph;
  ctx.strokeStyle=C.grid;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=mt+ph*i/4;ctx.beginPath();ctx.moveTo(ml,y);ctx.lineTo(ml+pw,y);ctx.stroke();}
  if(y0<0&&y1>0){ctx.strokeStyle=C.dim;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(ml,Y(0));ctx.lineTo(ml+pw,Y(0));ctx.stroke();ctx.setLineDash([]);}
  // 轮胎分量（虚线）——完整版 δ-ay = 轮胎 + 侧倾转向
  if(c.usTire){
    ctx.strokeStyle=C.base;ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.beginPath();let stt=false;
    c.gy.forEach((gv,i)=>{const v=c.usTire[i];if(!isFinite(v))return;
      const x=X(gv),y=Y(v);if(!stt){ctx.moveTo(x,y);stt=true;}else ctx.lineTo(x,y);});
    ctx.stroke();ctx.setLineDash([]);
  }
  // 总线（实线）：轮胎 + 侧倾转向
  ctx.strokeStyle=C.strut;ctx.lineWidth=1.6;ctx.setLineDash([]);ctx.beginPath();let st=false;
  c.gy.forEach((gv,i)=>{const v=c.us[i];if(!isFinite(v))return;
    const x=X(gv),y=Y(v);if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);});
  ctx.stroke();
  const gyNow=S.qs.gy;
  if(Math.abs(gyNow)<=2.0){
    const idx=Math.round(Math.abs(gyNow)/2.0*(c.gy.length-1));
    if(c.us[idx]!==undefined&&isFinite(c.us[idx])){
      ctx.fillStyle=C.frc;ctx.beginPath();
      ctx.arc(X(Math.abs(gyNow)),Y(c.us[idx]),3,0,7);ctx.fill();
    }
  }
  ctx.strokeStyle=C.axis;ctx.lineWidth=1;ctx.strokeRect(ml+.5,mt+.5,pw,ph);
  ctx.fillStyle=C.txt2;ctx.font="10.5px ui-monospace,monospace";
  ctx.fillText("不足转向特性 US CHARACTERISTIC · 实线=总 δ（轮胎+侧倾转向） · 虚线=轮胎项 · 红点=当前工况",ml+1,mt-3.5);
  ctx.fillStyle=C.txt3;ctx.textAlign="right";
  ctx.fillText(fmt(y1,1),ml-3,mt+7);ctx.fillText(fmt(y0,1),ml-3,mt+ph-1);
  ctx.fillText("0",ml,mt+ph+9);ctx.fillText("2g",ml+pw-8,mt+ph+9);
  ctx.textAlign="left";
}

function drawPlots(){
  const isF = S.axis === 'front';
  const sw = isF ? SIM.swF : SIM.swR;
  const b_sw = (S.hasBaseline && S.baseline) ? (isF ? S.baseline.swF : S.baseline.swR) : null;
  const m = isF ? SIM.mFR : SIM.mRR;
  if(!sw)return;
  const xr=[sw.min,sw.max],cur=m?m.tr:0;
  const S1=(obj,k,col)=>obj?{pts:obj.rows.map(r=>[r.tr,r[k]]),c:col}:null;

  const P=[
    ["瞬态运动速比 MOTION RATIO","-","mr",C.ela],
    ["外倾角变化 CAMBER","°","cam",C.knu],
    ["摇臂旋转角 ROCKER DEG","°","rockerDeg",C.rocker],
    ["前束角变化 (跳动转向) TOE","°","toe",C.tie]
  ];

  const meas = SIM.kcMeasured ? (isF ? SIM.kcMeasured.front : SIM.kcMeasured.rear) : null;
  P.forEach((p,i)=>{
    if(!UI.plots[i]) return;
    const act = S1(sw, p[2], p[3]);
    const bas = S1(b_sw, p[2], C.base);
    const msr = (meas && meas.travel && meas[p[2]] && (p[2]==="cam"||p[2]==="toe"))
      ? {pts:meas.travel.map((t,k)=>[t,meas[p[2]][k]]), c:C.frc} : null;
    plotXYOverlay(UI.plots[i], p[0]+"  ← 轮跳行程 [mm] →", p[1], act, bas, xr, cur, msr);
  });

  /* 不足转向特性 δ-ay（节流：参数 dirty 或每 800ms 重算一次） */
  const nowT=performance.now();
  if(SIM.usCurveDirty!==false||!SIM.usCurve||nowT-(SIM.usCurveT||0)>800){
    if(typeof usSweepCompute==="function")usSweepCompute();
    SIM.usCurveT=nowT;SIM.usCurveDirty=false;
  }
  const uc=document.getElementById("usCurvePlot");
  if(uc)plotUsCurve(uc);
}

