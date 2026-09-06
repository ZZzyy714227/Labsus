"use strict";
/* ================================ 11. UI 控制面板构建 ================================ */
const PICK=[];
const UI={hover:null,selHP:null,drag:null,ro:{},sync:[],plots:[],syncBase:null};

function E(t,c,h){const e=document.createElement(t);if(c)e.className=c;if(h!==undefined)e.textContent=h;return e;} /* F-44（2026-08-30）：innerHTML→textContent，引擎响应入 DOM 不再有 XSS 面 */
function EH(t,c,html){const e=document.createElement(t);if(c)e.className=c;if(html!==undefined)e.innerHTML=html;return e;} /* G12（2026-08-31）：静态 UI 结构专用 innerHTML（代码内常量，非引擎数据）。F-44 的 E() 已改 textContent，含 <b>/<u>/<i> 静态标签的调用点必须走本函数，否则标签字面渲染成"乱码"。 */
/* G12：分组分隔线——用灰色小号字 + hairline 隔开面板内的逻辑组 */
function groupDiv(host,label){
  const d=E("div");
  d.style.cssText="display:flex;align-items:center;gap:8px;padding:6px 12px 2px;color:var(--ink-3);font:500 8px/1 var(--font-ui);letter-spacing:.16em;text-transform:uppercase;user-select:none";
  const l=E("span"); l.style.cssText="flex:1;height:1px;background:var(--hairline)";
  const r=E("span"); r.style.cssText="flex:1;height:1px;background:var(--hairline)";
  d.appendChild(l);d.appendChild(document.createTextNode(label));d.appendChild(r);
  host.appendChild(d);
}
function sec(host,zh,en,col,cls){
  const s=E("div","sec"+(col?" col":""));
  /* F-44/F-56：标题含语义 span（zh 高亮 + 折叠箭头 tg）——E() 已改 textContent，
     这里用节点组装（zh 是代码内静态文案，非引擎数据；en 同理） */
  const h=E("div","sh"+(cls?" "+cls:""));
  const zhEl=E("span","zh",zh); h.appendChild(zhEl);
  h.appendChild(document.createTextNode(en));
  const tg=E("span","tg"); h.appendChild(tg);
  const b=E("div","sb");
  h.onclick=()=>s.classList.toggle("col");
  s.appendChild(h);s.appendChild(b);host.appendChild(s);return b;
}
function rowSlider(b,zh,en,unit,min,max,step,get,set,dec){
  const r=E("div","ctl");
  r.appendChild(EH("label",null,zh+' <u>'+en+(unit?" ["+unit+"]":"")+'</u>'));
  const sl=E("input");sl.type="range";sl.min=min;sl.max=max;sl.step=step;
  const nb=E("input");nb.type="number";nb.step=step;
  r.appendChild(sl);r.appendChild(nb);b.appendChild(r);
  const push=v=>{set(clamp(parseFloat(v),typeof min==="function"?min():min,typeof max==="function"?max():max));};
  sl.oninput=()=>push(sl.value);
  nb.onchange=()=>push(nb.value);
  nb.oninput=()=>{if(nb.value!=="")push(nb.value);};
  UI.sync.push(()=>{
    const v=get();
    sl.min=typeof min==="function"?min():min;sl.max=typeof max==="function"?max():max;
    if(document.activeElement!==sl)sl.value=v;
    if(document.activeElement!==nb)nb.value=fmt(v,dec===undefined?1:dec);
  });
  return r;
}
function rowBtns(b,list){
  const r=E("div","btnrow");
  list.forEach(it=>{const bt=E("button",it[3]||null,it[0]);bt.onclick=it[1];
    if(it[2])UI.sync.push(()=>bt.classList.toggle("on",!!it[2]()));
    r.appendChild(bt);});
  b.appendChild(r);return r;
}
function chkList(b,items){
  const g=E("div","grid2");
  items.forEach(it=>{
    const c=EH("div","chk",'<i></i><span>'+it[1]+'</span>');
    c.onclick=()=>{S.show[it[0]]=S.show[it[0]]?0:1;};
    g.appendChild(c);
    UI.sync.push(()=>c.classList.toggle("on",!!S.show[it[0]]));
  });
  b.appendChild(g);
}
function ro(b,zh,en,unit,id,cls){
  const r=E("div","ro"+(cls?" "+cls:""));
  r.appendChild(EH("span",null,zh+' <u>'+en+'</u>'));
  const v=E("b",null,"--");r.appendChild(v);
  r.appendChild(E("i",null,unit||""));
  b.appendChild(r);UI.ro[id]=v;return v;
}
function setRO(id,txt,warn){const e=UI.ro[id];if(!e)return;e.textContent=txt;
  e.parentElement.classList.toggle("warn",!!warn);}

function buildVehiclePresetSection(host){
  const b = sec(host, "🏎️ 车型平台预设", "VEHICLE PRESET");
  const row = E("div");
  row.style.cssText = "display:flex;gap:4px;padding:4px 8px;";
  
  [
    ["formula", "🏎️ 方程式 (FSC)"],
    ["gt3", "🏁 GT3 赛车"],
    ["gt3_sport", "🚗 GT3 日常"],
    ["baja", "🏜️ Baja 越野"]
  ].forEach(([k, label]) => {
    const btn = E("button", "eng-btn veh-btn-tab");
    btn.dataset.veh = k;
    btn.textContent = label;
    btn.style.cssText = "flex:1;min-width:0;font-size:9.5px;padding:4px 1px;";
    if(S.vehicleType === k) btn.classList.add("on");
    btn.onclick = () => {
      loadVehiclePreset(k);
    };
    row.appendChild(btn);
  });
  b.appendChild(row);
  
  const desc = E("div");
  desc.id = "vehPresetDesc";
  desc.style.cssText = "font:9.5px var(--font-mono);color:var(--ink-2);padding:2px 8px 6px;line-height:1.3;";
  const curName = (VEHICLE_PRESETS[S.vehicleType]||{}).name || "";
  desc.textContent = "当前载入: " + curName;
  b.appendChild(desc);
}

function buildLeft(){
  const host=document.getElementById("lp");
  host.innerHTML="";

  /* ═══════════════ GROUP 1: CORE — 车型 · 轴选择 · 几何输入 ═══════════════ */
  groupDiv(host,"CORE");
  buildVehiclePresetSection(host);

  let b=sec(host,"悬架底盘模块编辑","CHASSIS EDITOR");
  rowBtns(b,[["编辑前悬架 (FRONT)",()=>{S.axis='front'; UI.sync.forEach(f=>f());},()=>S.axis==='front'],
             ["编辑后悬架 (REAR)",()=>{S.axis='rear'; UI.sync.forEach(f=>f());},()=>S.axis==='rear']]);

  b=sec(host,"几何与转向输入","INPUT DRIVERS");
  rowSlider(b,"轮心垂向行程","WHEEL TRAVEL","mm",()=>S.trMin,()=>S.trMax,0.5,()=>S.travel,
    v=>{S.travel=v;S.exc="off";},1);
  rowSlider(b,"车身侧倾角","BODY ROLL","°",-5,5,0.1,()=>S.roll,v=>S.roll=v,2);
  rowSlider(b,"前轮转向位移","FRONT RACK","mm",-60,60,0.5,()=>S.rack,
    v=>{S.rack=v;SIM.dirtySweep=true;},1);
  rowSlider(b,"单侧前束微调","TOE TRIM","mm",-15,15,0.1,()=>S[S.axis].tieTrim,
    v=>{S[S.axis].tieTrim=v;rebuild();},2);

  /* ═══════════════ GROUP 2: TUNING — 求解 · 弹簧 · 阻尼 · ARB · 操稳 ═══════════════ */
  groupDiv(host,"TUNING");

  b=sec(host,"多体求解模式","SOLVER CONTROLS",false,"grn");
  /* G32 修复：切 RIG 时若路面激励仍为 none，台架点运行会纹丝不动（用户困惑点）
     → 自动给默认正弦激励（UI.sync 每帧会同步路面激励区块的 select 显示） */
  rowBtns(b,[["运动学 KIN",()=>{S.mode="kin";},()=>S.mode==="kin"],
             ["4-Post 台架 RIG",()=>{S.mode="rig";S.simT=0;if(S.road==="none")S.road="sine";},()=>S.mode==="rig"],
             ["准静态操稳 QS",()=>{S.mode="quasi";},()=>S.mode==="quasi"]]);
  rowBtns(b,[["运行 / 暂停",()=>{S.play=!S.play;},()=>S.play],
             ["复位 RESET",()=>{S.travel=0;S.roll=0;S.rack=0;rebuild();}]]);
  /* G32 修复：这两个滑杆原只写 S.excA/S.excF（仅 KIN 正弦消费）——RIG 模式下
     完全无效（台架激励走 S.rA/S.rF，roadSignal）。rig 时同步下发。 */
  rowSlider(b,"轮跳幅值","TRAVEL AMP","mm",0,75,1,()=>S.excA,v=>{S.excA=v;if(S.mode==="rig")S.rA=v;},0);
  rowSlider(b,"轮跳频率","FREQ","Hz",0.05,1.5,0.01,()=>S.excF,v=>{S.excF=v;if(S.mode==="rig")S.rF=v;},2);

  b=sec(host,"内置弹性与阻尼元件","SPRINGS & DAMPERS",false);
  rowSlider(b,"主弹簧刚度","SPRING RATE","N/mm",40,300,5,()=>S[S.axis].kS,v=>{S[S.axis].kS=v;refreshDerived(false);},0);
  rowSlider(b,"压缩阻尼系数","BUMP DAMP","N·s/mm",1,30,0.5,()=>S[S.axis].cB,v=>S[S.axis].cB=v,1);
  rowSlider(b,"复原阻尼系数","REB DAMP","N·s/mm",1,40,0.5,()=>S[S.axis].cR,v=>S[S.axis].cR=v,1);
  rowSlider(b,"轮胎垂向刚度","TIRE RATE","N/mm",100,450,10,()=>S[S.axis].kT,v=>{S[S.axis].kT=v;refreshDerived(false);},0);
  rowSlider(b,"角簧上质量","SPRUNG MASS","kg",150,700,5,()=>S[S.axis].mS,v=>{S[S.axis].mS=v;refreshDerived(false);},0);
  
  b=sec(host,"横向稳定杆 (ARB)","ANTI-ROLL BAR",true);
  rowSlider(b,"稳定杆直径 (0=拆除)","ARB DIA","mm",0,34,0.5,()=>S[S.axis].arb.d,v=>S[S.axis].arb.d=v,1);
  rowSlider(b,"稳定杆连杆位置比","ARB LINK POS","-",0.25,0.92,0.01,()=>S[S.axis].arb.t,v=>{S[S.axis].arb.t=v;SIM.dirtySweep=true;},2);
  rowSlider(b,"稳定杆纵向偏置","ARB OFFSET Y","mm",-60,180,2,()=>S[S.axis].arb.dy,v=>{S[S.axis].arb.dy=v;SIM.dirtySweep=true;},0);
  rowSlider(b,"稳定杆高度偏置","ARB OFFSET Z","mm",40,300,2,()=>S[S.axis].arb.dz,v=>{S[S.axis].arb.dz=v;SIM.dirtySweep=true;},0);

  b=sec(host,"准静态操稳工况输入","QUASI-STATIC",true,"amb");
  rowSlider(b,"侧向加速度","LATERAL ACC","g",-1.8,1.8,0.05,()=>S.qs.gy,v=>{S.qs.gy=v;simulate(0.016);},2);
  rowSlider(b,"纵向加速度","LONG ACC","g",-1.5,1.5,0.05,()=>S.qs.gx,v=>{S.qs.gx=v;simulate(0.016);},2);
  rowSlider(b,"气动总下压力","AERO DOWNFORCE","N",0,5000,50,()=>S.qs.aeroF,v=>{S.qs.aeroF=v;simulate(0.016);},0);
  rowSlider(b,"气动前轴分配比","AERO FRONT BIAS","-",0.2,0.8,0.01,()=>S.qs.aeroBias,v=>{S.qs.aeroBias=v;simulate(0.016);},2);
  rowSlider(b,"整车总质量","TOTAL MASS","kg",800,2200,10,()=>S.mTotal,v=>{S.mTotal=v;refreshDerived(false);},0);
  rowSlider(b,"簧载总质量","SPRUNG MASS","kg",700,2000,10,()=>S.mSprung,v=>{S.mSprung=v;refreshDerived(false);},0);

  b=sec(host,"Baseline 基准快照","BASELINE SNAPSHOT",true,"amb");
  rowBtns(b,[["快照基准线 SAVE",()=>{takeBaselineSnapshot();buildRight();},null,"hl"],
             ["清除基准线 CLEAR",()=>{clearBaselineSnapshot();buildRight();},null,"danger"]]);

  /* ═══════════════ GROUP 3: ADVANCED — 引擎 · 台架 · 硬点 · 图层 ═══════════════ */
  groupDiv(host,"ADVANCED");

  buildEnginePanel(host);
  buildChassisPanel(host);
  buildTireCalibPanel(host);
  buildKcMeasuredPanel(host);
  buildBushingCalibPanel(host);
  buildTrackPanel(host);
  buildPersistencePanel(host);
  buildSystemShowPanel(host);

  b=sec(host,"4-Post 台架路面激励","4-POST RIG PROFILE",true);
  const roadSel=E("div","ctl");
  roadSel.innerHTML='<label>路面输入信号 <u>ROAD INPUT</u></label>';
  const sel=E("select");
  [["none","平整路面 (NONE)"],["step","阶跃冲击 (STEP)"],["sine","连续正弦 (SINE)"],["pulse","单次脉冲 (PULSE)"],["chirp","扫频激励 (CHIRP)"],["rand","随机粗糙路面 (RAND)"]].forEach(it=>{
    const opt=E("option",null,it[1]);opt.value=it[0];sel.appendChild(opt);
  });
  sel.onchange=()=>{S.road=sel.value;};
  roadSel.appendChild(sel);b.appendChild(roadSel);
  UI.sync.push(()=>{sel.value=S.road;});
  rowSlider(b,"路面位移幅值","ROAD AMP","mm",1,40,1,()=>S.rA,v=>S.rA=v,0);
  rowSlider(b,"路面输入频率","ROAD FREQ","Hz",0.2,8.0,0.1,()=>S.rF,v=>S.rF=v,1);

  b=sec(host,"3D 空间硬点表","HARDPOINTS [mm]",true);
  const tb=E("table","hp");
  tb.innerHTML="<thead><tr><th>硬点 ID</th><th>X 横向</th><th>Y 纵向</th><th>Z 垂向</th></tr></thead>";
  const tbody=E("tbody");
  HP_META.forEach(d=>{
    const tr=E("tr");tr.dataset.id=d[0];
    const td=EH("td","n",'<b>'+d[0]+'</b>');td.title=d[1]+" ("+d[2]+")";tr.appendChild(td);
    for(let k=0;k<3;k++){
      const c=E("td",d[4]?"fx":(d[3]==="rocker"?"rk":"fr"));
      const inp=E("input");inp.type="number";inp.step="0.1";
      inp.oninput=()=>{const v=parseFloat(inp.value);if(isFinite(v)){S[S.axis].hp[d[0]][k]=v;rebuild();}};
      inp.onfocus=()=>{UI.selHP=d[0];};
      c.appendChild(inp);tr.appendChild(c);
      UI.sync.push(()=>{if(document.activeElement!==inp)inp.value=fmt(S[S.axis].hp[d[0]][k],1);});
    }
    tr.onclick=()=>{UI.selHP=d[0];};
    UI.sync.push(()=>{
      const isDir = S[S.axis].arch === "direct";
      const isRck = d[3] === "rocker" || d[0].startsWith("RCK_") || d[0] === "STRUT_IN";
      tr.style.display = (isDir && isRck) ? "none" : "";
      if(isDir && d[0] === "STRUT_OUT") td.title = "减振器下支点 SPR_L (" + d[2] + ")";
      else if(isDir && d[0] === "DMP_BODY") td.title = "减振器塔顶上支点 DMP_T (" + d[2] + ")";
      else td.title = d[1] + " (" + d[2] + ")";
      tr.classList.toggle("sel",UI.selHP===d[0]);
    });
    tbody.appendChild(tr);
  });
  tb.appendChild(tbody);b.appendChild(tb);

  b=sec(host,"显示图层控制","DISPLAY LAYERS",true);
  /* F-43（2026-08-30）：死开关替换——rigid/steer/disc 无任何绘制逻辑读取
     （真消费键为 halfshaft/steer_rack/disc_vent），旧项点开关无效。 */
  chkList(b,[["node","节点"],["label","硬点标号"],["halfshaft","半轴/传动"],["elastic","内置弹簧"],
    ["face","摆臂三角面"],["rocker","摇臂总成"],["wheel","车轮与轮胎"],["disc_vent","制动盘/卡钳"],
    ["arb","横向稳定杆"],["chassis","副车架/机架"],["steer_rack","转向拉杆"],["kp","主销轴线"],
    ["kpsw","主销扫掠"],["path","运动轨迹"],["dim","尺寸/角度辅助"],["ic","瞬心/侧倾中心"],["mirror","对侧镜像悬架"]]);
}

function buildRight(){
  /* F-53（2026-08-30）：buildRight 会被基线快照等重复调用（takeBaselineSnapshot
     后重建），旧实现每次 push 全部读数闭包且从不清理 → UI.sync 只增不减，
     主循环每帧全量执行，越用越卡。改为记录首次构建前的闭包基线，重建前
     先截断回基线（纯 UI 同步闭包随 DOM 一起重建）。 */
  if(UI.syncBase===null)UI.syncBase=UI.sync.length;
  else if(UI.sync.length>UI.syncBase)UI.sync.length=UI.syncBase;
  const host=document.getElementById("rp");
  host.innerHTML="";
  UI.plots.length=0;

  let b=sec(host,"车轮定位参数","WHEEL ALIGNMENT");
  ro(b,"车轮外倾角","CAMBER","°","roCam","k hero");
  ro(b,"车轮前束角","TOE","°","roToe","k");
  ro(b,"主销内倾角","KPI / SAI","°","roKpi");
  ro(b,"主销后倾角","CASTER","°","roCast");
  ro(b,"主销接地偏移距","SCRUB RADIUS","mm","roScrub","hl");
  ro(b,"主销后倾拖距","CASTER TRAIL","mm","roTrail");

  b=sec(host,"运动学导数与动态","KINEMATICS DERIVATIVES");
  ro(b,"外倾角增益","CAMBER GAIN","°/25","roCG","hl");
  ro(b,"跳动转向","BUMP STEER","°/25","roBS");
  ro(b,"侧倾中心高度","ROLL CTR H","mm","roRC","k hero");
  ro(b,"抗俯仰率","ANTI-DIVE","%","roAnti");
  ro(b,"Jacking 抬升","JACKING","mm","roJacking");
  ro(b,"簧载固有频率","RIDE FREQ","Hz","roFreq");

  b=sec(host,"准静态载荷转移分析","LOAD TRANSFER BREAKDOWN",false,"amb");
  ro(b,"稳态车身侧倾角","ROLL ANGLE","°","roQsRoll","hl");
  ro(b,"整车侧倾梯度","ROLL GRADIENT","°/g","roQsRollGrad","k hero");
  ro(b,"前轴侧倾刚度","FRONT ROLL K","Nm/°","roQsKf");
  ro(b,"后轴侧倾刚度","REAR ROLL K","Nm/°","roQsKr");
  ro(b,"左前轮接触载荷 FL","LOAD FL","N","roFzFL");
  ro(b,"右前轮接触载荷 FR","LOAD FR","N","roFzFR","hl");
  ro(b,"左后轮接触载荷 RL","LOAD RL","N","roFzRL");
  ro(b,"右后轮接触载荷 RR","LOAD RR","N","roFzRR","hl");
  const bb=E("div","bar-box");
  bb.innerHTML='<div class="bar-fill-f" id="tlltdBar" style="width:52%"></div><div class="bar-lbl" style="left:6px" id="tlltdLblF">前: 52%</div><div class="bar-lbl" style="right:6px" id="tlltdLblR">后: 48%</div>';
  b.appendChild(bb);
  ro(b,"不足转向梯度","US GRADIENT","°/g","roUsGrad","k hero");
  ro(b,"前轴侧偏角","SLIP ANG F","°","roAlphaF");
  ro(b,"后轴侧偏角","SLIP ANG R","°","roAlphaR");
  ro(b,"操稳倾向判断","HANDLING BIAS","","roHandling","g");
  /* 不足转向特性 δ-ay 曲线（usSweepCompute 节流重算，drawPlots 绘制） */
  const uc=E("canvas","plot");uc.id="usCurvePlot";
  uc.style.cssText="height:110px;width:100%;margin-top:4px";
  b.appendChild(uc);

  b=sec(host,"推拉杆与摇臂高阶读数","PUSH/PULL & ROCKER METRICS",true);
  ro(b,"构型模式","ARCH MODE","","roArch","k");
  ro(b,"摇臂转角","ROCKER ANGLE","°","roRckDeg","hl");
  ro(b,"瞬态运动速比","MOTION RATIO","-","roMR","k");
  ro(b,"减振器行程","DAMPER DISP","mm","roDmpDisp");
  ro(b,"内置弹簧弹力","SPRING FORCE","N","roSprF","hl");
  ro(b,"轮端等效刚度","WHEEL RATE","N/mm","roWR","k");

  b=sec(host,"转向与侧倾刚度 (ARB)","STEERING & ROLL STIFFNESS",true);
  ro(b,"阿克曼率 (前桥)","ACKERMANN","%","roAck","hl");
  ro(b,"转弯半径","TURN RADIUS","m","roTrad");
  ro(b,"扭杆扭转角","ARB TWIST","°","roArbTw");
  ro(b,"扭杆扭转刚度","ARB TORSION","N·m/°","roArbKt");
  ro(b,"稳定杆侧倾刚度","ARB ROLL K","N·m/°","roArbKr");
  ro(b,"轴总侧倾刚度","AXLE ROLL K","N·m/°","roArbTot","k");
  ro(b,"稳定杆占比","ARB SHARE","%","roArbSh","hl");

  if(S.hasBaseline){
    b=sec(host,"基准线差异分析 (Delta Diff)","BASELINE DELTA",false,"purp");
    const db=E("div",null);
    db.innerHTML='<div class="diffbox head"><span>项目 PARAM</span><b>ACTIVE</b><b>BASE</b><b>DELTA</b></div>';
    const items=[["外倾增益 CG","cg","°/25mm"],["跳动转向 BS","bs","°/25mm"],["运动速比 MR","mr","-"],["侧倾中心 RC","rcH","mm"],["轮端刚度 WR","kw","N/mm"]];
    items.forEach(it=>{
      const row=E("div","diffbox");
      row.innerHTML='<span>'+it[0]+'</span><b class="act" id="df_a_'+it[1]+'">--</b><b class="base" id="df_b_'+it[1]+'">--</b><b class="delta" id="df_d_'+it[1]+'">--</b>';
      db.appendChild(row);
    });
    b.appendChild(db);
  }

  b=sec(host,"运动学特性曲线扫掠 (含双线对比)","CHARACTERISTIC CURVES");
  const pb=E("div","plotbox");
  for(let i=0;i<4;i++){
    const cv=E("canvas","plot");pb.appendChild(cv);UI.plots.push(cv);
    if(i<3){const sp=E("div");sp.style.height="3px";pb.appendChild(sp);}
  }
  b.appendChild(pb);
  buildEngineResults(host);
  buildChassisResults(host);
  buildTrackTelemetry(host);

  b=sec(host,"多体求解器状态","SOLVER RESIDUALS",true);
  ro(b,"活动节点数","NODES","","roNodes");
  ro(b,"拓扑刚性约束","RIGID LINKS","","roRigLinks");
  ro(b,"最大约束残差","MAX RESIDUAL","mm","roRes");
  ro(b,"单步迭代耗时","SOLVE TIME","ms","roSolveMs");
}

/* ================================ 11.5 引擎接入 /api/v3（S2-2 双模，移植并入 Gemini 基线） ================================ */
const ENG={url:"http://127.0.0.1:8001",ok:false,busy:false,kcCase:"bump",
  sweep:{min:-50,max:50,n:21},fz:3000,useBush:true,result:null};
function engRow(lb,el){const d=E("div","eng-row");
  const s=E("span","eng-lb");s.textContent=lb;
  d.appendChild(s);d.appendChild(el);return d;}
function engNum(def,step){const i=E("input","eng-input");i.type="number";i.value=def;i.step=step;return i;}
function setKcStatus(t,c){const e=document.getElementById("kcStatus");if(e){e.textContent=t;e.style.color=c||C.txt3;}}
function engineSyncTb(){const e=document.getElementById("tbEng");if(!e)return;
  e.textContent=ENG.ok?"引擎 v3":"内置 JS";e.className=ENG.ok?"g":"";
  const btn=document.getElementById("engBtn");if(btn)btn.textContent=ENG.ok?"断开引擎":"连接引擎";}
async function engineConnect(){
  const url=ENG.url.replace(/\/+$/,"");
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),4000);
    const r=await fetch(url+"/api/v3/health",{signal:ctl.signal});clearTimeout(to);
    if(!r.ok)throw new Error("HTTP "+r.status);
    const h=await r.json();
    if(h.status!=="ok")throw new Error("engine status="+h.status);
    ENG.ok=true;ENG.url=url;
    setKcStatus("已连接引擎 "+url+"\nK&C 工况: "+h.kandc.join(" / "),C.pathC);engineSyncTb();
  }catch(err){
    ENG.ok=false;setKcStatus("连接失败："+err.message+"\n→ 本地 JS 仅运动学/几何扫掠；K&C/整车/赛道需引擎 ("+ENG.url+")",C.nodeFix);engineSyncTb();
  }
}
function engineDisconnect(){ENG.ok=false;setKcStatus("已断开引擎 → 内置 JS 求解器",C.txt3);engineSyncTb();}
/* 衬套刚度预设 → 引擎 payload（VEHICLE_PRESETS[vehicleType].bushings；缺省回退 bLCA_F 500N/mm）。
   F-70（2026-09-01）：供应商实测衬套刚度标定（SIM.bushCalib，左坞站面板）优先于预设——
   真实悬架柔度标定通道，影响引擎 K&C 力偏移（compliance）工况。 */
function presetBushings(){
  const cal=SIM.bushCalib&&SIM.bushCalib[S.axis];
  if(cal&&Object.keys(cal).length){
    return Object.keys(cal).map(n=>({name:"b_"+n,node:n,
      kT:cal[n].kT.slice(0,3),
      kR:(Array.isArray(cal[n].kR)?cal[n].kR:[8e4,8e4,8e4]).slice(0,3),
      preload:[0,0,0,0,0,0]}));
  }
  const p=(VEHICLE_PRESETS[S.vehicleType]||{})[S.axis]||{};
  const bp=p.bushings;
  if(!bp||!Object.keys(bp).length)return[{name:"bLCA_F",node:"LCA_F",kT:[500,500,500],kR:[8e4,8e4,8e4],preload:[0,0,0,0,0,0]}];
  return Object.keys(bp).map(n=>({name:"b_"+n,node:n,kT:bp[n].slice(0,3),kR:[8e4,8e4,8e4],preload:[0,0,0,0,0,0]}));
}
function enginePayload(){
  const st=S[S.axis];
  return {
    points:JSON.parse(JSON.stringify(st.hp)), arch:st.arch, tire_radius:st.tire.R,
    design:{camber_deg:st.cam0,toe_deg:st.toe0},
    sweep:{min:ENG.sweep.min,max:ENG.sweep.max,n:ENG.sweep.n},
    case:{fx:0,fy:0,fz:ENG.fz,mx:0,my:0,mz:0},
    track_width:2*st.hp.WC[0],
    bushings:ENG.useBush?presetBushings():[]
  };
}
async function engineRun(){
  if(!ENG.ok){setKcStatus("未连接引擎 → 请先连接（或继续使用内置 JS）",C.ela);return;}
  if(ENG.busy)return;ENG.busy=true;
  const runBtn=document.getElementById("kcRun");if(runBtn)runBtn.textContent="求解中…";
  setKcStatus("求解 "+ENG.kcCase+" …",C.txt2);
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),60000);
    const r=await fetch(ENG.url+"/api/v3/kandc/"+ENG.kcCase,
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(enginePayload()),signal:ctl.signal});
    clearTimeout(to);
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.slice(0,140));}
    ENG.result=await r.json();
    engineRender();
  }catch(err){setKcStatus("求解失败："+err.message,C.nodeFix);}
  finally{ENG.busy=false;if(runBtn)runBtn.textContent="运行 K&C 分析 RUN";}
}
function engineRender(){
  const d=ENG.result;if(!d)return;
  const g=document.getElementById("kcGains");if(g){g.innerHTML="";
    const mk=(lb,val,col)=>{const r=E("div","ro"+(col?((col===C.pathC)?"":" warn"):""));
      r.appendChild(E("span",null,lb));
      const v=E("b",null,String(val));if(col)v.style.color=col;r.appendChild(v);g.appendChild(r);};
    mk("状态 STATUS · "+d.case,d.status+" · "+d.ms.toFixed(0)+"ms",
       d.status==="VALID"?C.pathC:C.nodeFix);
    for(const k in d.gains)mk(k,d.gains[k]);
  }
  const cv=document.getElementById("kcPlot");if(!cv||!d.curves)return;
  const xk=d.case==="steer"?"rack":(d.case==="compliance"?"force":"travel");
  const xs=d.curves[xk];if(!xs||!xs.length)return;
  const ser=[];
  const pairs=d.case==="roll"?
    [["cam_r",C.knu],["cam_l",C.path],["toe_r",C.ela],["toe_l",C.tie]]:
    [["cam",C.knu],["toe",C.ela],["cast",C.kp]];
  pairs.forEach(([k,c])=>{if(!d.curves[k])return;
    ser.push({pts:xs.map((x,i)=>[x,d.curves[k][i]]),c:c,w:1.4});});
  const title={bump:"外倾/前束 ← 轮跳 [mm]",roll:"左右外倾/前束 ← 轮跳 [mm]",
    steer:"前束/外倾/后倾 ← 齿条 [mm]",compliance:"前束/外倾/后倾 ← 力 [N]"}[d.case]||d.case;
  plotXYMulti(cv,title,"°",ser,[xs[0],xs[xs.length-1]],null);
  setKcStatus(d.case+" 完成 · status="+d.status+" · "+d.ms.toFixed(1)+"ms"+(d.warnings&&d.warnings.length?"\n⚠ "+d.warnings.join("；"):""),C.pathC);
}
/* ── 衬套刚度标定（真实柔度数据链：供应商实测 → K&C compliance 工况） ── */
function bushCalibParse(text){
  try{
    const j=JSON.parse(text);
    if(!j||typeof j!=="object"||Array.isArray(j))return null;
    const out={};
    for(const n in j){
      const e=j[n];
      if(!e||!Array.isArray(e.kT)||e.kT.length!==3||!e.kT.every(isFinite))return null;
      out[n]={kT:e.kT.map(Number),
        kR:(Array.isArray(e.kR)&&e.kR.length===3&&e.kR.every(isFinite))?e.kR.map(Number):[8e4,8e4,8e4]};
    }
    return Object.keys(out).length?out:null;
  }catch(err){return null;}
}
function bushCalibApply(){
  const st=document.getElementById("bushCalibStatus");
  const setSt=(t,col)=>{if(st){st.textContent=t;st.style.color=col||"";}};
  const ta=document.getElementById("bushCalibData");
  const d=bushCalibParse(ta?ta.value:"");
  if(!d){setSt("解析失败：JSON 形如 {\"LCA_F\":{\"kT\":[x,y,z],\"kR\":[..]}}，kT 必须为 3 个平移刚度 N/mm",C.nodeFix);return;}
  if(!SIM.bushCalib)SIM.bushCalib={};
  SIM.bushCalib[S.axis||"front"]=d;
  const nodes=Object.keys(d).join("、");
  setSt("✓ 已应用"+(S.axis==="rear"?"后轴":"前轴")+"实测衬套（"+nodes+"）→ 重跑“力偏移 COMPLIANCE”工况生效",C.pathC);
}
function bushCalibReset(){
  const st=document.getElementById("bushCalibStatus");
  if(SIM.bushCalib)delete SIM.bushCalib[S.axis||"front"];
  if(st)st.textContent="已恢复车型预设衬套刚度。",st.style.color="";
}
function buildBushingCalibPanel(host){
  const b=sec(host,"衬套刚度标定","BUSHING CALIBRATION",true);
  const hint=E("div","eng-status");
  hint.textContent="供应商实测衬套刚度（平移 kT N/mm×3，可选旋转 kR N·mm/°×3）→ 覆盖车型预设，用于引擎 K&C 力偏移 (COMPLIANCE) 工况——真实悬架柔度数据链（当前轴随左侧轴选择切换）。";
  b.appendChild(hint);
  const ta=E("textarea");ta.id="bushCalibData";ta.rows=5;
  ta.placeholder='JSON: {"LCA_F":{"kT":[2500,2500,2500],"kR":[80000,80000,80000]},\n        "UCA_F":{"kT":[3500,3500,3500]}}';
  ta.style.cssText="width:calc(100% - 16px);margin:2px 8px;font:10px/1.4 ui-monospace,monospace;background:var(--well);color:var(--ink-2);border:1px solid var(--glass-bd);padding:4px;box-sizing:border-box";
  b.appendChild(ta);
  const row=E("div");row.style.cssText="display:flex;gap:3px;padding:3px 8px";
  const apBtn=E("button","eng-run");apBtn.id="bushCalibApply";apBtn.textContent="应用实测刚度 APPLY";apBtn.style.flex="2";
  apBtn.onclick=bushCalibApply;
  const rsBtn=E("button","eng-btn");rsBtn.textContent="恢复预设 RESET";rsBtn.style.flex="1";
  rsBtn.onclick=bushCalibReset;
  row.appendChild(apBtn);row.appendChild(rsBtn);b.appendChild(row);
  const st=E("div","eng-status");st.id="bushCalibStatus";
  st.textContent="当前生效：车型预设衬套（在前轴 LCA/UCA 2500~3500 N/mm 量级）。";
  b.appendChild(st);
}
function buildEnginePanel(host){
  let b=sec(host,"引擎连接与 K&C 分析","ENGINE /api/v3");
  const urlInp=E("input");urlInp.type="text";urlInp.value=ENG.url;
  urlInp.className="eng-input";urlInp.style.cssText="flex:1;min-width:0";
  urlInp.onchange=()=>{ENG.url=urlInp.value.replace(/\/+$/,"");};
  b.appendChild(engRow("引擎地址",urlInp));
  const engBtn=E("button","eng-btn");engBtn.id="engBtn";engBtn.textContent="连接引擎";
  engBtn.onclick=()=>{ENG.ok?engineDisconnect():engineConnect();};
  b.appendChild(engRow("连接",engBtn));
  const kcCaseBtns=E("div");kcCaseBtns.id="kcCaseBtns";
  kcCaseBtns.style.cssText="display:flex;gap:3px;padding:3px 8px;flex-wrap:wrap";
  [["bump","平行跳动"],["roll","侧倾"],["steer","转向"],["compliance","力偏移"]].forEach(([v,lb])=>{
    const k=E("button","eng-btn");k.textContent=lb;k.dataset.c=v;k.style.flex="1";k.style.minWidth="64px";
    k.onclick=()=>{ENG.kcCase=v;kcCaseBtns.querySelectorAll("button").forEach(x=>x.style.borderColor="");k.style.borderColor=C.strut;};
    kcCaseBtns.appendChild(k);
  });
  b.appendChild(kcCaseBtns);
  const kcMin=engNum(-50,5),kcMax=engNum(50,5),kcN=engNum(21,2),kcFz=engNum(3000,100);
  /* F-47（2026-08-30）：min/max 交互式校验——旧 `parseFloat(...)||0` 清空输入
     静默变 0，可造 min>max 的非法 payload（引擎侧 F-45 会 422）。前端先纠偏： */
  const kcSetMin=()=>{const v=parseFloat(kcMin.value); if(!isFinite(v)){ENG.sweep.min=-50;kcMin.value=-50;return;} if(v>ENG.sweep.max){ENG.sweep.max=v;} ENG.sweep.min=v;};
  const kcSetMax=()=>{const v=parseFloat(kcMax.value); if(!isFinite(v)){ENG.sweep.max=50;kcMax.value=50;return;} if(v<ENG.sweep.min){ENG.sweep.min=v;} ENG.sweep.max=v;};
  kcMin.onchange=kcSetMin;kcMax.onchange=kcSetMax;
  kcN.onchange=()=>{ENG.sweep.n=Math.max(3,parseInt(kcN.value)||3);};kcFz.onchange=()=>{ENG.fz=parseFloat(kcFz.value)||0;};
  const r1=E("div");r1.style.cssText="display:flex;align-items:center;gap:4px;padding:2px 8px";
  r1.appendChild(E("span",null,"范围"));r1.appendChild(kcMin);r1.appendChild(E("span",null,"~"));r1.appendChild(kcMax);
  r1.appendChild(E("span",null,"点"));r1.appendChild(kcN);r1.appendChild(E("span",null,"Fz"));r1.appendChild(kcFz);
  b.appendChild(r1);
  const kcBush=E("input");kcBush.type="checkbox";kcBush.checked=ENG.useBush;
  kcBush.onchange=()=>{ENG.useBush=kcBush.checked;};
  b.appendChild(engRow("LCA 衬套 500N/mm",kcBush));
  const kcRun=E("button","eng-run");kcRun.id="kcRun";kcRun.textContent="运行 K&C 分析 RUN";
  kcRun.onclick=engineRun;b.appendChild(kcRun);
  const kcStatus=E("div","eng-status");kcStatus.id="kcStatus";
  kcStatus.textContent="未连接 → 本地 JS 仅运动学/几何扫掠；K&C 曲线需引擎（"+ENG.url+"）";
  b.appendChild(kcStatus);
}
function buildEngineResults(host){
  const b2=sec(host,"引擎 K&C 结果","ENGINE K&C RESULTS",true);
  const kcGains=E("div");kcGains.id="kcGains";b2.appendChild(kcGains);
  const kcPlot=E("canvas","plot");kcPlot.id="kcPlot";kcPlot.style.height="150px";kcPlot.style.width="100%";
  b2.appendChild(kcPlot);
}
/* ── 整车底盘分析（S2-5：四角+整车参数 → /api/v3/chassis/*，双模） ── */
const CH={busy:false,kcCase:"solve",sweep:{min:-50,max:50,n:21},result:null};
function buildChassisPanel(host){
  let b=sec(host,"整车底盘分析 (引擎)","FULL-CHASSIS ENGINE");
  const ck=E("div");ck.style.cssText="display:flex;gap:3px;padding:3px 8px;flex-wrap:wrap";
  [["solve","单点 SOLVE"],["bump","整车 BUMP"],["roll","整车 ROLL"],["steer","整车 STEER"]].forEach(([v,lb])=>{
    const k=E("button","eng-btn");k.textContent=lb;k.dataset.c=v;k.style.flex="1";k.style.minWidth="58px";
    k.onclick=()=>{CH.kcCase=v;ck.querySelectorAll("button").forEach(x=>x.style.borderColor="");k.style.borderColor=C.rc;};
    ck.appendChild(k);
  });
  b.appendChild(ck);
  const cs=E("div");cs.style.cssText="display:flex;align-items:center;gap:4px;padding:2px 8px";
  const cMin=engNum(-50,5),cMax=engNum(50,5),cN=engNum(21,2);
  cMin.onchange=()=>{CH.sweep.min=parseFloat(cMin.value)||0;};
  cMax.onchange=()=>{CH.sweep.max=parseFloat(cMax.value)||0;};
  cN.onchange=()=>{CH.sweep.n=Math.max(3,parseInt(cN.value)||3);};
  cs.appendChild(E("span",null,"扫掠"));cs.appendChild(cMin);cs.appendChild(E("span",null,"~"));
  cs.appendChild(cMax);cs.appendChild(E("span",null,"点"));cs.appendChild(cN);
  b.appendChild(cs);
  const cRun=E("button","eng-run ch");cRun.id="chRun";cRun.textContent="运行整车分析 RUN";
  cRun.onclick=chassisRun;b.appendChild(cRun);
  const cSt=E("div","eng-status");cSt.id="chStatus";
  cSt.textContent="整车分析：四角硬点+整车参数 → /api/v3/chassis/*（需先连接引擎）";
  b.appendChild(cSt);
}
function buildChassisResults(host){
  const b2=sec(host,"整车引擎结果","FULL-CHASSIS ENGINE RESULTS",true);
  const box=E("div");box.id="chResult";b2.appendChild(box);
  const cv=E("canvas","plot");cv.id="chPlot";cv.style.height="150px";cv.style.width="100%";
  b2.appendChild(cv);
}
/* ── 轮胎实测标定（讲义 EP08 数据链：实测 Fy-α → /api/v3/tire/fit 辨识 MF） ── */
function tireCalibParse(text){
  const t=(text||"").trim();
  if(!t)return null;
  if(t[0]==="["||t[0]==="{"){
    try{
      const j=JSON.parse(t);
      const arr=Array.isArray(j)?j:(j.curves||[]);
      return arr.map(c=>({fz:+c.fz,
        alpha_deg:(c.alpha_deg||[]).map(Number),
        fy:(c.fy||[]).map(Number)}));
    }catch(e){return null;}
  }
  /* CSV：每行 fz,alpha,fy（一行一点，按 fz 自动分组） */
  const byFz={};
  for(const line of t.split(/\r?\n/)){
    const p=line.split(/[,;\t]+/).map(s=>parseFloat(s));
    if(p.length>=3&&isFinite(p[0])&&isFinite(p[1])&&isFinite(p[2])){
      if(!byFz[p[0]])byFz[p[0]]={a:[],f:[]};
      byFz[p[0]].a.push(p[1]);byFz[p[0]].f.push(p[2]);
    }
  }
  const out=Object.keys(byFz).map(k=>({fz:+k,alpha_deg:byFz[k].a,fy:byFz[k].f}));
  return out.length?out:null;
}
function tireCalibSample(){
  /* 示例：用引擎缺省 GT3 MF 在 2000/3500/5000 N 三个载荷层级合成曲线 */
  const P={Fy0:5250,By:20,Cy:1.2,Ey:-0.5,LS:0.10,FzNom:3500};
  const al=[];for(let a=0;a<=20;a+=0.5)al.push(a);
  return [2000,3500,5000].map(fz=>{
    const r=fz/P.FzNom, d=P.Fy0*r*Math.max(0.1,1-P.LS*(r-1));
    return {fz:fz,alpha_deg:al,fy:al.map(a=>{
      const x=P.By*a*Math.PI/180;
      return + (d*Math.sin(P.Cy*Math.atan(x-P.Ey*(x-Math.atan(x))))).toFixed(1);})};
  });
}
async function tireCalibRun(){
  const st=document.getElementById("tireCalibStatus");
  const setSt=(t,col)=>{if(st){st.textContent=t;st.style.color=col||"";}};
  if(!ENG.ok){setSt("引擎未连接 → 先在“引擎连接”面板连接（辨识走 /api/v3/tire/fit）",C.nodeFix);return;}
  const ta=document.getElementById("tireCalibData");
  const curves=tireCalibParse(ta?ta.value:"");
  if(!curves){setSt("解析失败：请填 JSON 数组（[{fz, alpha_deg[], fy[]}]）或 CSV（每行 fz,alpha,fy）",C.nodeFix);return;}
  const btn=document.getElementById("tireCalibRun");if(btn)btn.textContent="辨识中…";
  setSt("辨识中（"+curves.length+" 个载荷层级）…",C.txt2);
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),30000);
    const r=await fetch(ENG.url+"/api/v3/tire/fit",
      {method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({curves:curves,fit_ls:true}),signal:ctl.signal});
    clearTimeout(to);
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.slice(0,120));}
    const d=await r.json();
    if(d.status!=="VALID"||!d.params)throw new Error(d.note||d.status);
    applyTireCalib(d.params);
    const p=d.params;
    setSt("✓ 已应用实胎特性：Fy0 "+p.Fy0+"N · By "+p.By+" · Cy "+p.Cy+" · Ey "+p.Ey+
      " · LS "+p.LS+" · RMS "+d.rms_pct+"%（"+d.n_loads+" 层级 · "+d.n_points+" 点）"+
      (d.note?"\n⚠ "+d.note:""),C.pathC);
  }catch(err){setSt("辨识失败："+err.message,C.nodeFix);}
  finally{if(btn)btn.textContent="辨识 MF 参数 FIT";}
}
function buildTireCalibPanel(host){
  const b=sec(host,"轮胎实测标定","TIRE CALIBRATION",true);
  const hint=E("div","eng-status");
  hint.textContent="实测 Fy-α 曲线（≥2 个载荷层级可辨识载荷敏感性 LS）→ 引擎辨识 Pacejka MF 参数，即时应用于准静态操稳指标（US Gradient）与赛道仿真（讲义 EP08）。";
  b.appendChild(hint);
  const ta=E("textarea");ta.id="tireCalibData";ta.rows=5;
  ta.placeholder='JSON: [{"fz":2000,"alpha_deg":[0,1,2,...],"fy":[0,500,...]},...]\n或 CSV：每行 fz,alpha,fy（一行一点）';
  ta.style.cssText="width:calc(100% - 16px);margin:2px 8px;font:10px/1.4 ui-monospace,monospace;background:var(--well);color:var(--ink-2);border:1px solid var(--glass-bd);padding:4px;box-sizing:border-box";
  b.appendChild(ta);
  const row=E("div");row.style.cssText="display:flex;gap:3px;padding:3px 8px";
  const exBtn=E("button","eng-btn");exBtn.textContent="示例 SAMPLE";exBtn.style.flex="1";
  exBtn.onclick=()=>{ta.value=JSON.stringify(tireCalibSample());};
  const runBtn=E("button","eng-run");runBtn.id="tireCalibRun";
  runBtn.textContent="辨识 MF 参数 FIT";runBtn.style.flex="2";
  runBtn.onclick=tireCalibRun;
  row.appendChild(exBtn);row.appendChild(runBtn);b.appendChild(row);
  const st=E("div","eng-status");st.id="tireCalibStatus";
  st.textContent="当前缺省胎（引擎 TireParams）：Fy0 5250 N · μ 1.50 · LS 0.10；辨识成功后此处显示实胎参数。";
  b.appendChild(st);
}
/* ── K&C 台架对拍（真实开发闭环：仿真预测 ↔ 台架验证，讲义 EP02“仿真 vs 实测”纪律） ── */
function kcMeasuredParse(text){
  const lines=(text||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length)return null;
  /* 表头自动映射：含 travel/tr/行程、camber/cam/外倾、toe/前束关键词的列 */
  let ci={travel:0,cam:1,toe:2};
  let start=0;
  const head=lines[0].toLowerCase();
  if(/[a-z\u4e00-\u9fa5]/.test(head.replace(/[\d.,;\t -]/g,""))){
    const cols=lines[0].split(/[,;\t]+/).map(s=>s.trim().toLowerCase());
    const find=(re,d)=>{const i=cols.findIndex(c=>re.test(c));return i>=0?i:d;};
    ci={travel:find(/travel|^tr$|行程/,0),cam:find(/camber|^cam$|外倾/,1),toe:find(/toe|前束/,2)};
    start=1;
    if(ci.cam<0&&ci.toe<0)return null;
  }
  const d={travel:[],cam:[],toe:[]};
  for(let i=start;i<lines.length;i++){
    const p=lines[i].split(/[,;\t ]+/).map(parseFloat);
    if(!isFinite(p[ci.travel]))continue;
    d.travel.push(p[ci.travel]);
    d.cam.push(isFinite(p[ci.cam])?p[ci.cam]:null);
    d.toe.push(isFinite(p[ci.toe])?p[ci.toe]:null);
  }
  return (d.travel.length>=3)?d:null;
}
function kcMeasuredApply(){
  const st=document.getElementById("kcMeasStatus");
  const setSt=(t,col)=>{if(st){st.textContent=t;st.style.color=col||"";}};
  const ta=document.getElementById("kcMeasData");
  const d=kcMeasuredParse(ta?ta.value:"");
  if(!d){setSt("解析失败：需 ≥3 行数据；表头行自动识别 travel/camber/toe 列（或按此顺序无表头）",C.nodeFix);return;}
  const axis=S.axis||"front";
  if(!SIM.kcMeasured)SIM.kcMeasured={};
  SIM.kcMeasured[axis]=d;
  const rc=kcMeasuredRMS(axis,"cam"), rt=kcMeasuredRMS(axis,"toe");
  setSt("✓ 已载入"+(axis==="front"?"前轴":"后轴")+"实测曲线（"+d.travel.length+" 点） · "
    +"Camber RMS "+(rc===null?"—":rc.toFixed(3)+"°")
    +" · Toe RMS "+(rt===null?"—":rt.toFixed(3)+"°")
    +" → 轮跳图已叠画点划线（红色）",C.pathC);
  if(typeof drawPlots==="function")drawPlots();
}
function kcMeasuredClear(){
  const st=document.getElementById("kcMeasStatus");
  if(SIM.kcMeasured)delete SIM.kcMeasured[S.axis||"front"];
  if(st)st.textContent="已清除当前轴实测曲线 → 轮跳图恢复仿真/基准双线。",st.style.color="";
  if(typeof drawPlots==="function")drawPlots();
}
function buildKcMeasuredPanel(host){
  const b=sec(host,"K&C 台架对拍","RIG CORRELATION",true);
  const hint=E("div","eng-status");
  hint.textContent="导入台架实测轮跳曲线（travel, camber, toe），与仿真曲线同图叠画点划线，并给出重叠区间 RMS 偏差——仿真预测↔台架验证闭环（当前轴随左侧轴选择切换）。";
  b.appendChild(hint);
  const ta=E("textarea");ta.id="kcMeasData";ta.rows=5;
  ta.placeholder="CSV（可带表头）：\ntravel,camber,toe\n-40,-3.9,-0.2\n-20,-3.4,-0.1\n0,-2.0,0.05\n20,-0.6,0.2 ...";
  ta.style.cssText="width:calc(100% - 16px);margin:2px 8px;font:10px/1.4 ui-monospace,monospace;background:var(--well);color:var(--ink-2);border:1px solid var(--glass-bd);padding:4px;box-sizing:border-box";
  b.appendChild(ta);
  const row=E("div");row.style.cssText="display:flex;gap:3px;padding:3px 8px";
  const impBtn=E("button","eng-run");impBtn.id="kcMeasApply";impBtn.textContent="导入并叠画 IMPORT";impBtn.style.flex="2";
  impBtn.onclick=kcMeasuredApply;
  const clrBtn=E("button","eng-btn");clrBtn.textContent="清除 CLEAR";clrBtn.style.flex="1";
  clrBtn.onclick=kcMeasuredClear;
  row.appendChild(impBtn);row.appendChild(clrBtn);b.appendChild(row);
  const st=E("div","eng-status");st.id="kcMeasStatus";
  st.textContent="尚无实测曲线：粘入台架导出 CSV 后点导入。";
  b.appendChild(st);
}
function chassisPayload(){
  const f=S.front,r=S.rear;
  const halfF=Math.abs(f.hp.WC[0]),halfR=Math.abs(r.hp.WC[0]);
  const kwCurve=sw=>(sw&&sw.rows&&sw.rows.length>=2)
    ?{travel:sw.rows.map(q=>q.tr),kw:sw.rows.map(q=>q.kw)}:undefined;
  /* G29 轮胎工坊：自定义激活时注入 MF 参数与胎压（读 SIM.userTire，LS 已含
     胎压修正，p 为前轴胎压单值）；未激活时 undefined——JSON.stringify 丢弃
     undefined 键，payload 与未自定义时逐字节一致（回归安全）。vehicle 轴的
     tire_rim_w/tire_et 无条件注入，同样依赖"预设态无此键→undefined→JSON 丢弃" */
  const ut = (typeof SIM !== "undefined" && SIM.userTire) ? SIM.userTire : null;
  return {
    vehicle:{
      wheelbase_mm:S.wb,mass_kg:S.mTotal,sprung_mass_kg:S.mSprung,hcg_mm:S.hcg,hs_mm:S.hs,
      front:{points:JSON.parse(JSON.stringify(f.hp)),arch:f.arch,camber_deg:f.cam0,toe_deg:f.toe0,
        tire_radius:f.tire.R,tire_rim_w:f.tire.rimW,tire_et:f.tire.et,
        spring_rate:f.kS,spring_mass_kg:f.mS,unsprung_kg:f.mU,
        motion_ratio:SIM.mrRefF||0.75,
        kw_curve:kwCurve(SIM.swF),
        arb:{d:f.arb.d,t:f.arb.t,dy:f.arb.dy,dz:f.arb.dz,G:f.arb.G}},
      rear:{points:JSON.parse(JSON.stringify(r.hp)),arch:r.arch,camber_deg:r.cam0,toe_deg:r.toe0,
        tire_radius:r.tire.R,tire_rim_w:r.tire.rimW,tire_et:r.tire.et,
        spring_rate:r.kS,spring_mass_kg:r.mS,unsprung_kg:r.mU,
        motion_ratio:SIM.mrRefR||0.78,
        kw_curve:kwCurve(SIM.swR),
        arb:{d:r.arb.d,t:r.arb.t,dy:r.arb.dy,dz:r.arb.dz,G:r.arb.G}}
    },
    quasi:{gy:S.qs.gy,gx:S.qs.gx,aero_force_n:S.qs.aeroF,aero_bias:S.qs.aeroBias},
    travel:{fl:travelL(halfF,S.roll),fr:travelR(halfF,S.roll),
            rl:travelL(halfR,S.roll),rr:travelR(halfR,S.roll)},
    rack:S.rack,
    sweep:{min:CH.sweep.min,max:CH.sweep.max,n:CH.sweep.n},
    tire: ut ? { Fy0:ut.Fy0, FzNom:ut.FzNom, By:ut.By, Cy:ut.Cy, Ey:ut.Ey, LS:ut.LS, Cg:ut.Cg, p:ut.p } : undefined
  };
}
function setChStatus(t,c){const e=document.getElementById("chStatus");if(e){e.textContent=t;e.style.color=c||C.txt3;}}
async function chassisRun(){
  if(!ENG.ok){setChStatus("未连接引擎 → 请先连接引擎（连接后整车分析走 /api/v3/chassis/*）",C.ela);return;}
  if(CH.busy)return;CH.busy=true;
  const runBtn=document.getElementById("chRun");if(runBtn)runBtn.textContent="求解中…";
  setChStatus("整车 "+CH.kcCase+" 求解中…（四角机制 + 准静态载荷）",C.txt2);
  const ep=CH.kcCase==="solve"?"solve":"kandc/"+CH.kcCase;
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),90000);
    const r=await fetch(ENG.url+"/api/v3/chassis/"+ep,
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(chassisPayload()),signal:ctl.signal});
    clearTimeout(to);
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.slice(0,140));}
    CH.result=await r.json();
    chassisRender();
  }catch(err){setChStatus("整车求解失败："+err.message,C.nodeFix);}
  finally{CH.busy=false;if(runBtn)runBtn.textContent="运行整车分析 RUN";}
}
function chassisRender(){
  const d=CH.result;if(!d)return;
  const box=document.getElementById("chResult");if(!box)return;
  box.innerHTML="";
  if(d.pose){
    /* 单点：四轮定位表 + 姿态 + 载荷 */
    const tb=E("table","hp");
    tb.innerHTML="<thead><tr><th>角</th><th>CAM°</th><th>TOE°</th><th>CAST°</th><th>KPI°</th><th>SCRUB</th><th>TRAIL</th><th>RC</th></tr></thead>";
    const tbb=E("tbody");
    ["FL","FR","RL","RR"].forEach(k=>{
      const m=d.pose[k]||{};
      const tr=E("tr");tr.appendChild(EH("td","n","<b>"+k+"</b>"));
      ["cam","toe","cast","kpi","scrub","trail","rc_h"].forEach(kk=>{
        const v=m[kk];const c=E("td","pose-cell");
        c.textContent=(v===null||v===undefined)?"--":Number(v).toFixed(2);
        tr.appendChild(c);
      });
      tbb.appendChild(tr);
    });
    tb.appendChild(tbb);box.appendChild(tb);
    const L=d.loads||{},att=d.attitude||{},fz=L.fz||{};
    const rows=[
      ["整车姿态","heave "+fmt(att.heave_mm,1)+"mm · roll "+fmt(att.roll_deg,2)+"° · pitch "+fmt(att.pitch_deg,2)+"°",C.pathC],
      ["稳态侧倾",""+fmt(L.roll_deg,2)+"° @ "+fmt(L.roll_grad_deg_per_g,2)+"°/g",C.knu],
      ["侧倾刚度","Kφ前 "+fmt(L.kphi_f,0)+" · 后 "+fmt(L.kphi_r,0)+" N·m/°（ARB 占 "+fmt(L.arb_share_f,1)+"/"+fmt(L.arb_share_r,1)+"%）",C.ela],
      ["前轴载荷转移","UNS "+fmt(L.dFz_u_f,0)+" + GEO "+fmt(L.dFz_geo_f,0)+" + ELA "+fmt(L.dFz_elas_f,0)+" = "+fmt(L.dFz_f_tot,0)+" N",C.tie],
      ["四轮接地载荷","FL "+fmt(fz.FL,0)+" · FR "+fmt(fz.FR,0)+" · RL "+fmt(fz.RL,0)+" · RR "+fmt(fz.RR,0)+" N",C.kp],
      ["TLLTD 前轴占比",""+fmt(L.tlltd_pct,1)+"%",(L.tlltd_pct>54)?C.nodeFix:((L.tlltd_pct<47)?C.ela:C.pathC)],
    ];
    rows.forEach(([lb,val,col])=>{
      const r2=E("div","ro");r2.appendChild(E("span",null,lb));
      const v2=E("b",null,val);if(col)v2.style.color=col;r2.appendChild(v2);box.appendChild(r2);
    });
    setChStatus("整车单点完成 · status="+d.status+" · "+d.ms.toFixed(1)+"ms"+(d.warnings&&d.warnings.length?"\n⚠ "+d.warnings.join("；"):""),C.pathC);
  } else if(d.curves){
    /* 扫掠：四轮 cam 曲线 + 增益 */
    const cv=document.getElementById("chPlot");
    const xk=d.case==="steer"?"rack":(d.case==="roll"?"roll_deg":"travel");
    const xs=d.curves[xk];
    if(cv&&xs&&xs.length){
      const ser=[];
      [["cam_FL",C.knu],["cam_FR",C.ela],["cam_RL",C.path],["cam_RR",C.kp]].forEach(([k,c])=>{
        if(!d.curves[k])return;ser.push({pts:xs.map((x,i)=>[x,d.curves[k][i]]),c:c,w:1.4});});
      plotXYMulti(cv,d.case+" 四轮外倾 CAMBER ← "+(d.case==="roll"?"roll [°]":(d.case==="steer"?"rack [mm]":"travel [mm]")),
        "°",ser,[xs[0],xs[xs.length-1]],null);
    }
    const gx=E("div");
    for(const k in (d.gains||{})){
      const r3=E("div","ro");r3.appendChild(E("span",null,k));r3.appendChild(E("b",null,String(d.gains[k])));gx.appendChild(r3);
    }
    box.appendChild(gx);
    setChStatus("整车 "+d.case+" 完成 · status="+d.status+" · "+d.ms.toFixed(1)+"ms"+(d.warnings&&d.warnings.length?"\n⚠ "+d.warnings.join("；"):""),C.pathC);
  } else {
    setChStatus("响应无 pose/curves 字段："+JSON.stringify(d).slice(0,120),C.nodeFix);
  }
}
