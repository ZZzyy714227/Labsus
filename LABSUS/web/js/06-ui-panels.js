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

  /* M9（T1-1）：灵敏度扫描排在分析组最前——它是"先调哪个杠杆"的入口，
     后面那些（引擎 K&C / 台架对拍 / 轮胎标定）都是单点验证工具。 */
  buildSensitivityPanel(host);
  buildSens2Panel(host);
  buildSetupPanel(host);
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
  [["none","平整路面 (NONE)"],["step","阶跃冲击 (STEP)"],["sine","连续正弦 (SINE)"],["pulse","单次脉冲 (PULSE)"],["isoA","ISO 8608 · A 级 很好"],["isoB","ISO 8608 · B 级 好"],["isoC","ISO 8608 · C 级 一般"],["isoD","ISO 8608 · D 级 差"],["isoE","ISO 8608 · E 级 很差"],["isoF","ISO 8608 · F 级 极差"],["chirp","扫频激励 (CHIRP)"],["rand","随机粗糙路面 (RAND)"]].forEach(it=>{
    const opt=E("option",null,it[1]);opt.value=it[0];sel.appendChild(opt);
  });
  sel.onchange=()=>{ const v=sel.value;
    /* ISO 8608 选项把路面等级编码在值里（isoA~isoH）*/ 
    if(v.indexOf("iso")===0){ S.road="iso"; S.roadCls=v.slice(3); }
    else { S.road=v; } };
  roadSel.appendChild(sel);b.appendChild(roadSel);
  UI.sync.push(()=>{sel.value=S.road;});
  rowSlider(b,"路面位移幅值","ROAD AMP","mm",1,40,1,()=>S.rA,v=>S.rA=v,0);
  rowSlider(b,"路面输入频率","ROAD FREQ","Hz",0.2,8.0,0.1,()=>S.rF,v=>S.rF=v,1);
  rowSlider(b,"车速 (ISO 用)","SPEED","m/s",5,60,1,()=>S.roadV,v=>S.roadV=v,1);
  const isoNote=E("div","eng-status"); isoNote.id="isoNote";
  isoNote.textContent="ISO 8608 模式：幅值由路面等级谱决定（不受 ROAD AMP 影响）；后轴按轮距/车速延迟 L/v。";
  b.appendChild(isoNote);
  UI.sync.push(()=>{ if(S.road!=="iso") return; const cls="iso"+(S.roadCls||"A");
    const el=document.getElementById("isoNote");
    if(el){ const r=isoRmsMm(S.roadCls||"A"); const lag=isoLag("rear");
      el.textContent=`ISO 8608 ${S.roadCls||"A"} 级：目标谱 RMS ${r.toFixed(2)} mm（标准带 0.011~2.83 cycle/m，w=2）· `
        + `车速 ${(S.roadV||20).toFixed(0)} m/s · 后轴延迟 ${(lag*1000).toFixed(0)} ms`; } });

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

/* M7（2026-09-20）：折叠区标题右侧显示"项数"徽标。
   此前右坞站 11 张卡一列到底，其中 5 张默认折叠成"只有一行标题"的空壳，
   读起来像坏掉的行；给出项数后一眼能看出是"折叠的组，里面有 N 条读数"。 */
function secBadges(host){
  host.querySelectorAll(".sec").forEach(s=>{
    const tg=s.querySelector(".sh .tg"); if(!tg) return;
    const n=s.querySelectorAll(".sb .ro, .sb .ctl, .sb .diffbox, .sb canvas").length;
    if(n){ tg.textContent=n; tg.title=n+" 项读数"; }
  });
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

  /* M7（2026-09-20）：右坞站按语义分组。此前 11 张卡一列到底、无层级、要滚很久；
     分组后形成"定位 → 载荷 → 高阶 → 曲线 → 引擎/赛道 → 诊断"的阅读脉络。 */
  groupDiv(host,"几何与定位 · GEOMETRY");

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

  groupDiv(host,"载荷与操稳 · LOAD & HANDLING");

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

  groupDiv(host,"高阶读数 · ADVANCED");

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

  groupDiv(host,"特性曲线 · CURVES");

  b=sec(host,"运动学特性曲线扫掠 (含双线对比)","CHARACTERISTIC CURVES");
  const pb=E("div","plotbox");
  for(let i=0;i<4;i++){
    const cv=E("canvas","plot");pb.appendChild(cv);UI.plots.push(cv);
    if(i<3){const sp=E("div");sp.style.height="3px";pb.appendChild(sp);}
  }
  b.appendChild(pb);
  groupDiv(host,"引擎 · 台架 · 赛道 · ENGINE & STAGE");
  buildEngineResults(host);
  buildChassisResults(host);
  buildTrackTelemetry(host);

  groupDiv(host,"诊断 · DIAGNOSTICS");

  b=sec(host,"多体求解器状态","SOLVER RESIDUALS",true);
  ro(b,"活动节点数","NODES","","roNodes");
  ro(b,"拓扑刚性约束","RIGID LINKS","","roRigLinks");
  ro(b,"最大约束残差","MAX RESIDUAL","mm","roRes");
  ro(b,"单步迭代耗时","SOLVE TIME","ms","roSolveMs");
  secBadges(host);
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
  /* M7：4 个工况按钮在 280px 栏宽下按 minWidth:64 会折成 3+1 的残行；
     52px 正好一行放下 4 个（4×52+3×3 = 217 < 栏宽），布局由"3+1 残行"变为整齐一排。 */
  [["bump","平行跳动"],["roll","侧倾"],["steer","转向"],["compliance","力偏移"]].forEach(([v,lb])=>{
    const k=E("button","eng-btn");k.textContent=lb;k.dataset.c=v;k.style.flex="1";k.style.minWidth="52px";
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
  /* M7（2026-09-20）：旧实现把「范围 −50 ~ 50 点 21 Fz」8 个元素塞进一条无标签列的
     flex 行，而 .eng-input 固定 62px ⇒ 一行约 500px 宽，在 280px 的左栏里必然挤压
     （实测"范围"被压成竖排两字、输入框互相重叠）。改为两行标准 eng-row，
     复用 74px 标签列；并把"范围"统一为与整车底盘分析一致的"扫掠范围"。 */
  const r1=E("div","eng-row");
  r1.appendChild(E("span","eng-lb w86","扫掠范围"));
  r1.appendChild(kcMin); r1.appendChild(E("span",null,"~")); r1.appendChild(kcMax);
  b.appendChild(r1);
  const r2=E("div","eng-row");
  r2.appendChild(E("span","eng-lb w86","采样点 / Fz"));
  r2.appendChild(kcN); r2.appendChild(E("span",null,"点")); r2.appendChild(kcFz);
  r2.appendChild(E("span",null,"N"));
  b.appendChild(r2);
  const kcBush=E("input");kcBush.type="checkbox";kcBush.checked=ENG.useBush;
  kcBush.onchange=()=>{ENG.useBush=kcBush.checked;};
  /* M7：布尔项改为"先勾选框、后读得懂的说明"，不再塞进固定宽度的标签列 */
  const rB=E("div","eng-row");
  rB.appendChild(kcBush);
  const bLb=E("span",null,"LCA 衬套刚度按 500 N/mm 计入");
  bLb.style.cssText="font-size:9.5px;color:var(--ink-2)";
  rB.appendChild(bLb); b.appendChild(rB);
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
  /* M7：与 K&C 面板同构——标签列 + 标准行，避免无标签列的裸 flex 行在窄栏里挤压 */
  const cMin=engNum(-50,5),cMax=engNum(50,5),cN=engNum(21,2);
  cMin.onchange=()=>{CH.sweep.min=parseFloat(cMin.value)||0;};
  cMax.onchange=()=>{CH.sweep.max=parseFloat(cMax.value)||0;};
  cN.onchange=()=>{CH.sweep.n=Math.max(3,parseInt(cN.value)||3);};
  const cs=E("div","eng-row");
  cs.appendChild(E("span","eng-lb w86","扫掠范围"));
  cs.appendChild(cMin);cs.appendChild(E("span",null,"~"));cs.appendChild(cMax);
  b.appendChild(cs);
  const cs2=E("div","eng-row");
  cs2.appendChild(E("span","eng-lb w86","采样点"));
  cs2.appendChild(cN);cs2.appendChild(E("span",null,"点"));
  b.appendChild(cs2);
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
        /* M11（P12）：把本轴扫掠得到的外倾增益下发，引擎的 US 梯度才能含"侧倾→外倾→抓地"
           这一项；不下发则引擎缺省 0 ⇒ 耦合关闭 ⇒ 双端口径分叉（前端有、引擎无）。 */
        camber_gain_deg_per_25mm:(function(){ const v=sampleSweep(SIM.swF,0,"cg"); return isFinite(v)?v:0; })(),
        tire_radius:f.tire.R,tire_rim_w:f.tire.rimW,tire_et:f.tire.et,tire_width:f.tire.W,
        spring_rate:f.kS,spring_mass_kg:f.mS,unsprung_kg:f.mU,
        motion_ratio:SIM.mrRefF||0.75,
        kw_curve:kwCurve(SIM.swF),
        arb:{d:f.arb.d,t:f.arb.t,dy:f.arb.dy,dz:f.arb.dz,G:f.arb.G}},
      rear:{points:JSON.parse(JSON.stringify(r.hp)),arch:r.arch,camber_deg:r.cam0,toe_deg:r.toe0,
        camber_gain_deg_per_25mm:(function(){ const v=sampleSweep(SIM.swR,0,"cg"); return isFinite(v)?v:0; })(),
        tire_radius:r.tire.R,tire_rim_w:r.tire.rimW,tire_et:r.tire.et,tire_width:r.tire.W,
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

/* ═══════════════════════════════════════════════════════════════════════════
   M9（2026-09-20）· T1-1 灵敏度扫描（SENSITIVITY SWEEP）
   ───────────────────────────────────────────────────────────────────────────
   目的：把工具从"告诉我现在是多少"推进到"告诉我该怎么改"。
   给定**一个**设计参数，扫一段对称范围，看 10 个设计 KPI 各自怎么动，
   再按**归一化敏感度**排序 —— 直接回答"先调哪个杠杆最划算"。

   三条设计约束（都与本项目既有纪律对齐）：
   1. **零引擎往返 / 离线可用**：全部用前端本地求解器（`rebuild()`），
      与 allinone 单文件版的能力边界一致；引擎侧将来若要镜像，口径见下条。
   2. **取值口径与右坞站读数逐字同源**：目标量全部走 `updateReadouts` 用的
      同一条路径（`sampleSweep(sw, m.tr, field)` / `m.rcH` / `kS·mr²` /
      `SIM.qsRes.*`），不另写一份公式 —— 否则扫描结果与面板读数会打架。
   3. **可复现**：扫描结束后**精确还原**参数原值并 `rebuild()` 一次；结果
      存 `SIM.sensRes` 供报告导出（T1-3）与复算。

   敏感度定义：
     斜率 k  = (v(+Δ) − v(−Δ)) / (2Δ)        … 单位：目标单位 / 参数单位
     敏感度 S = (v(+Δ) − v(−Δ)) / |v(基准)| × 100%   … 无量纲，用于跨目标排序
   |v(基准)| 过小时（<1e-6）改用区间中点作分母并标注，避免除零放大。
   ═══════════════════════════════════════════════════════════════════════════ */
const SENS = { key: null, delta: 10, n: 5, busy: false, res: null };

/* 目标量（设计 KPI）。read() 返回 NaN 表示该工况下不可用（如 |gy|<0.02 时的 US 梯度） */
const SENS_OBJ = [
  { key:"us",    label:"不足转向梯度", unit:"°/g",    read:()=> (SIM.qsRes? SIM.qsRes.usGrad : NaN) },
  { key:"rollg", label:"侧倾梯度",     unit:"°/g",    read:()=> (SIM.qsRes? SIM.qsRes.rollGrad : NaN) },
  { key:"cgF",   label:"前轴外倾增益", unit:"°/25mm", read:()=> sensSweepVal("front","cg") },
  { key:"bsF",   label:"前轴跳动转向", unit:"°/25mm", read:()=> sensSweepVal("front","bs") },
  { key:"rcF",   label:"前侧倾中心高", unit:"mm",     read:()=> sensMetricVal("front","rcH") },
  { key:"wrF",   label:"前轮端刚度",   unit:"N/mm",   read:()=> sensWheelRate("front") },
  { key:"cgR",   label:"后轴外倾增益", unit:"°/25mm", read:()=> sensSweepVal("rear","cg") },
  { key:"bsR",   label:"后轴跳动转向", unit:"°/25mm", read:()=> sensSweepVal("rear","bs") },
  { key:"rcR",   label:"后侧倾中心高", unit:"mm",     read:()=> sensMetricVal("rear","rcH") },
  { key:"wrR",   label:"后轮端刚度",   unit:"N/mm",   read:()=> sensWheelRate("rear") },
];

/* —— 目标量取值：与 07-plots.updateReadouts 同路径 —— */
function sensSweepVal(ax, field){
  const m = ax==="front" ? SIM.mFR : SIM.mRR;
  const sw = ax==="front" ? SIM.swF : SIM.swR;
  if(!m || !sw) return NaN;
  const v = sampleSweep(sw, m.tr, field);
  return (v===null || v===undefined || !isFinite(v)) ? NaN : v;
}
function sensMetricVal(ax, field){
  const m = ax==="front" ? SIM.mFR : SIM.mRR;
  if(!m || m[field]===undefined || !isFinite(m[field])) return NaN;
  return m[field];
}
function sensWheelRate(ax){
  const mr = sensSweepVal(ax, "mr");
  if(!isFinite(mr)) return NaN;
  return (ax==="front" ? S.front.kS : S.rear.kS) * mr * mr;
}

/* —— 可扫参数表：整车 / 弹簧与稳定杆 / 轮胎 / 两轴硬点 —— */
function sensParamList(){
  const out = [];
  const axLabel = { front:"前轴", rear:"后轴" };
  ["front","rear"].forEach(ax=>{
    const lb = axLabel[ax];
    out.push({ key:`kS.${ax}`,   g:"弹簧与稳定杆", label:`${lb}主弹簧刚度`,   unit:"N/mm", dDef:20,
               get:()=>S[ax].kS,        set:v=>{ S[ax].kS = Math.max(1, v); } });
    /* dDef：换参数时的默认 ±Δ。ARB 给 10（刚度 ∝ d⁴：±6mm 在 d=0 基准上只动 0.35%，
       太小看不出东西；±10 才是有信息量的行程）。硬点 10mm≈一次真实调整量。 */
    out.push({ key:`arb.${ax}`,  g:"弹簧与稳定杆", label:`${lb}ARB 直径`,     unit:"mm",   dDef:10,
               get:()=>S[ax].arb.d,     set:v=>{ S[ax].arb.d = Math.max(0, v); } });
    out.push({ key:`kT.${ax}`,   g:"弹簧与稳定杆", label:`${lb}轮胎垂向刚度`, unit:"N/mm", dDef:30,
               get:()=>S[ax].kT,        set:v=>{ S[ax].kT = Math.max(1, v); } });
    out.push({ key:`W.${ax}`,    g:"轮胎",         label:`${lb}轮胎宽度`,     unit:"mm",   dDef:20,
               get:()=>S[ax].tire && S[ax].tire.W,
               set:v=>{ if(S[ax].tire) S[ax].tire.W = Math.max(40, v); } });
    Object.keys(S[ax].hp).forEach(k=>{
      ["X","Y","Z"].forEach((c,ci)=>{
        out.push({ key:`hp.${ax}.${k}.${ci}`, g:`${lb}硬点`, label:`${k} · ${c}`, unit:"mm", dDef:10,
                   get:()=>S[ax].hp[k][ci], set:v=>{ S[ax].hp[k][ci] = v; } });
      });
    });
  });
  out.push({ key:"mSprung", g:"整车", label:"簧载总质量", unit:"kg", dDef:15,
             get:()=>S.mSprung, set:v=>{ S.mSprung = Math.max(10, v); } });
  out.push({ key:"mTotal",  g:"整车", label:"整车总质量", unit:"kg", dDef:15,
             get:()=>S.mTotal,  set:v=>{ S.mTotal  = Math.max(10, v); } });
  return out;
}
function sensParamByKey(k){ return sensParamList().find(p=>p.key===k) || null; }

/* —— 面板 —— */
function buildSensitivityPanel(host){
  const b = sec(host,"灵敏度扫描","SENSITIVITY SWEEP",false,"pur");
  const wrap = E("div"); wrap.style.cssText = "padding:4px 10px 8px";
  b.appendChild(wrap);

  const hint = E("div","eng-status");
  hint.textContent = "扫一个参数 ±Δ，看 10 个设计 KPI 各自怎么动，按归一化敏感度排序——回答“先调哪个杠杆最划算”。全部用本地求解器，离线可用。";
  wrap.appendChild(hint);

  /* 参数选择（optgroup 分组，硬点很多） */
  const pRow = E("div","eng-row");
  pRow.appendChild(E("span","eng-lb w86","扫描参数"));
  const sel = E("select","eng-input"); sel.id = "sensParam";
  sel.style.cssText = "flex:1;min-width:0;width:auto!important;text-align:left";
  const groups = {};
  sensParamList().forEach(p=>{ (groups[p.g] = groups[p.g] || []).push(p); });
  Object.keys(groups).forEach(g=>{
    const og = document.createElement("optgroup"); og.label = g;
    groups[g].forEach(p=>{
      const o = document.createElement("option"); o.value = p.key; o.textContent = p.label + (p.unit?` [${p.unit}]`:"");
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  pRow.appendChild(sel); wrap.appendChild(pRow);

  /* 步长 / 点数 */
  const dRow = E("div","eng-row");
  dRow.appendChild(E("span","eng-lb w86","± 步长 / 点数"));
  const dInp = E("input","eng-input"); dInp.id = "sensDelta"; dInp.type = "number"; dInp.step = 1; dInp.value = "10";
  const nSel = E("select","eng-input"); nSel.id = "sensN";
  nSel.style.cssText = "width:52px!important;text-align:left";
  [3,5,7,9].forEach(n=>{ const o = document.createElement("option"); o.value = n; o.textContent = n + " 点"; nSel.appendChild(o); });
  nSel.value = "5";
  dRow.appendChild(dInp); dRow.appendChild(nSel); wrap.appendChild(dRow);

  /* 运行 */
  const run = E("button","eng-run"); run.id = "sensRun"; run.textContent = "运行敏感度扫描 SWEEP";
  run.onclick = runSensitivitySweep; wrap.appendChild(run);
  const st = E("div","eng-status"); st.id = "sensStatus";
  st.textContent = "选参数 → 设 ±Δ 与点数 → 运行。扫描结束后参数会精确还原。";
  wrap.appendChild(st);

  /* 结果区（表格 + 条形图） */
  const out = E("div"); out.id = "sensOut"; wrap.appendChild(out);

  sel.value = SENS.key || (sensParamList()[0] && sensParamList()[0].key);
  SENS.key = sel.value;
  sel.onchange = ()=>{
    SENS.key = sel.value;
    const p = sensParamByKey(SENS.key);
    if(p && p.dDef){ dInp.value = String(p.dDef); SENS.delta = p.dDef; }   /* 换参数给个合理的默认步长 */
  };
  if(SENS.res) renderSensResult(SENS.res);   /* 重建面板（基线快照）后恢复上次结果 */
}

function renderSensResult(res){
  const out = document.getElementById("sensOut"); if(!out) return;
  out.innerHTML = "";
  if(!res || !res.rows || !res.rows.length) return;

  /* 表格：按 |敏感度| 降序（这就是"先调哪个"的答案）。
     M9 布局：左栏只有 280px，四列网格会把"37.5 / 30.4 → 44.7"挤成三行；
     改为每目标两行——首行「名称 + 敏感度」，次行「基准 · 区间」。 */
  const rows = res.rows.slice().sort((a,b)=> Math.abs(b.S) - Math.abs(a.S));
  const tb = E("div"); tb.style.cssText = "margin-top:5px;border-top:1px solid var(--hairline)";
  const head = E("div");
  head.style.cssText = "padding:3px 2px;font:500 8px var(--font-ui);color:var(--ink-3);letter-spacing:.06em";
  head.textContent = "目标 OBJECTIVE（按敏感度降序）";
  tb.appendChild(head);
  rows.forEach(r=>{
    const bad = !isFinite(r.S);
    const col = bad ? "var(--ink-3)" : (Math.abs(r.S) >= 5 ? "var(--warn)" : "var(--ink-2)");
    const d = E("div");
    d.style.cssText = "display:grid;grid-template-columns:1fr 52px;gap:0 4px;padding:3px 2px;" +
                      "border-top:1px solid var(--hairline);align-items:baseline";
    const lb = E("span",null,r.label);
    lb.style.cssText = "font:400 9.5px var(--font-ui);color:var(--ink-2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis";
    const u = E("u",null," "+r.unit);
    u.style.cssText = "text-decoration:none;color:var(--ink-3);font-size:8px";
    lb.appendChild(u);
    const se = E("b",null, bad ? "—" : ((r.S>=0?"+":"")+r.S.toFixed(1)+"%"));
    se.style.cssText = "text-align:right;font:500 10px var(--font-mono);color:"+col;
    const sub = E("span",null, "基准 "+fmt(r.v0,2)+" · "+fmt(r.vLo,2)+" → "+fmt(r.vHi,2));
    sub.style.cssText = "grid-column:1/3;font:400 8px var(--font-mono);color:var(--ink-3);margin-top:1px";
    d.appendChild(lb); d.appendChild(se); d.appendChild(sub);
    tb.appendChild(d);
  });
  out.appendChild(tb);

  /* 条形图：归一化敏感度（龙卷风图），正=目标增大，负=减小 */
  const cv = E("canvas","plot"); cv.id = "sensChart";
  cv.style.cssText = "width:100%;height:" + Math.max(60, rows.length*13 + 12) + "px;margin-top:5px";
  out.appendChild(cv);
  drawSensChart(cv, rows);
}
function drawSensChart(cv, rows){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 260, h = cv.clientHeight || 140;
  cv.width = w*dpr; cv.height = h*dpr;
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const vals = rows.map(r=> isFinite(r.S) ? Math.abs(r.S) : 0);
  const vmax = Math.max(1e-6, Math.max.apply(null, vals));
  const cx = w*0.42, mid = h/2, bh = Math.max(6, (h - 14) / rows.length - 3);
  ctx.font = "8px ui-monospace,monospace";
  ctx.strokeStyle = "rgba(128,140,160,.45)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx+.5, 4); ctx.lineTo(cx+.5, h-4); ctx.stroke();
  rows.forEach((r,i)=>{
    const y = 7 + i*(bh+3);
    const frac = isFinite(r.S) ? Math.abs(r.S)/vmax : 0;
    const len = Math.max(1, frac * (w*0.50));
    const pos = (r.S||0) >= 0;
    ctx.fillStyle = !isFinite(r.S) ? "rgba(128,140,160,.35)" : (pos ? "rgba(240,136,62,.85)" : "rgba(47,169,214,.85)");
    ctx.fillRect(pos ? cx : cx-len, y, len, bh);
    ctx.fillStyle = "rgba(160,170,185,.95)";
    const nm = r.label.length > 7 ? r.label.slice(0,7) : r.label;
    ctx.fillText(nm, 2, y + bh - 1);
  });
  ctx.fillStyle = "rgba(160,170,185,.9)";
  ctx.fillText("← 减小", 2, h-2);
  ctx.fillText("增大 →", cx+4, h-2);
}

/* —— 扫描引擎 —— */
function runSensitivitySweep(){
  if(SENS.busy) return;
  const P = sensParamByKey(SENS.key);
  const st = document.getElementById("sensStatus");
  const dEl = document.getElementById("sensDelta"), nEl = document.getElementById("sensN");
  if(!P){ if(st) st.textContent = "未选中参数。"; return; }
  const delta = Math.abs(parseFloat(dEl && dEl.value)) || 10;
  let n = parseInt(nEl && nEl.value) || 5;
  if(n < 3) n = 3;
  if(n % 2 === 0) n += 1;                       /* 保证含基准点，基准值直接取中点，避免插值 */
  const base = P.get();
  if(!isFinite(base)){ if(st) st.textContent = `参数「${P.label}」当前值不可用（${base}）。`; return; }

  SENS.busy = true;
  const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  const vals = SENS_OBJ.map(()=>[]);
  try{
    for(let i=0;i<n;i++){
      const x = base - delta + (2*delta)*i/(n-1);
      P.set(x);
      rebuild();                                 /* 本地全量重解：机构 + 扫掠 + 准静态 */
      SENS_OBJ.forEach((o,k)=> vals[k].push(o.read()));
    }
  } catch(err){
    SENS.busy = false;
    P.set(base); rebuild();
    if(st) st.textContent = "扫描中断：" + err.message + "（参数已还原）";
    return;
  }
  P.set(base); rebuild();                        /* 精确还原 + 复算，界面回到扫描前状态 */
  const ms = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
  SENS.busy = false;

  const mid = (n-1)/2;
  const rows = SENS_OBJ.map((o,k)=>{
    const arr = vals[k];
    const v0 = arr[mid], vLo = arr[0], vHi = arr[n-1];
    const span = vHi - vLo;
    const denom = Math.abs(v0) > 1e-6 ? Math.abs(v0) : Math.abs((vHi+vLo)/2);
    const S = (isFinite(span) && denom > 1e-6) ? (span/denom)*100 : NaN;
    const slope = isFinite(span) ? span/(2*delta) : NaN;
    return { label:o.label, unit:o.unit, v0:v0, vLo:vLo, vHi:vHi, span:span, S:S, slope:slope };
  });
  SENS.res = { param:P.key, paramLabel:P.label, paramUnit:P.unit, base:base, delta:delta, n:n,
               xs:(()=>{ const a=[]; for(let i=0;i<n;i++) a.push(base-delta+(2*delta)*i/(n-1)); return a; })(),
               rows:rows, ms:ms };
  SIM.sensRes = SENS.res;                        /* 交给报告导出（T1-3）与复算 */

  if(st){
    const top = rows.filter(r=>isFinite(r.S)).sort((a,b)=>Math.abs(b.S)-Math.abs(a.S))[0];
    /* ms 在无头虚拟时钟下恒为 0（performance.now 被虚拟化）——显示成 "<1ms" 而不是 "0ms" */
    const msTxt = ms < 1 ? "<1" : String(Math.round(ms));
    st.textContent = `${P.label} ±${delta}${P.unit||""} · ${n} 点 · ${SENS_OBJ.length} 个目标 · ${msTxt}ms`
      + (top ? `\n最敏感：${top.label}（${top.S>=0?"+":""}${top.S.toFixed(1)}% over range）` : "\n（本工况下目标量均不可用）")
      + `\n参数已还原为 ${fmt(base,2)}${P.unit||""}`;
  }
  renderSensResult(SENS.res);
}

/* ═══════════════════════════════════════════════════════════════════════════
   M10（2026-09-20）· T1-2 方案库与多方案对比（SETUP LIBRARY & COMPARE）
   ───────────────────────────────────────────────────────────────────────────
   目的：让"我们试了 3 套，这是为什么选它"变成可复现的证据链。
   与既有"基准线快照"的分工：baseline 是**一条**临时对照线（存 KPI，不存设计，
   只用于 Active vs Base 的 delta 表）；方案库是**多条命名方案**，每条**同时存
   设计快照（硬点+参数）与保存时的 KPI 快照**，可跨会话（localStorage）：
     存设计 → 能"载入回那套设计"；
     存 KPI  → 对比表不必逐个载入模型即可渲染（快、且绝不污染当前状态）。

   三条纪律：
   1. **载入必须完整还原设计**：`S.front/S.rear` 整体 deepClone（与预设加载同一条
      路径），再 `rebuild() + refreshDerived(true)`；不逐个字段搬，避免漏字段
      （历史教训：硬点导出漏 tieTrimF/R，导入后横拉杆静默回默认）。
   2. **KPI 同源**：与右坞站读数 / 灵敏度扫描 / 设计报告用同一批取值路径。
   3. **不破坏当前状态**：对比只读快照；删除/覆盖均需显式操作；上限 12 条并
      从最旧的开始淘汰（localStorage 有配额，且无限增长迟早写失败）。
   ═══════════════════════════════════════════════════════════════════════════ */
const SETUPS = { lsKey: "labsus-setups-v1", list: [], sel: {}, max: 12 };

/* —— 对比用的 KPI（label/unit/读法）。读法与右坞站、灵敏度扫描同源 —— */
const SETUP_KPI = [
  { k:"us",    label:"不足转向梯度",  unit:"°/g",    read:()=> (SIM.qsRes ? SIM.qsRes.usGrad : NaN) },
  { k:"rollg", label:"侧倾梯度",      unit:"°/g",    read:()=> (SIM.qsRes ? SIM.qsRes.rollGrad : NaN) },
  { k:"tlltd", label:"TLLTD 前轴占比", unit:"%",     read:()=> (SIM.qsRes ? SIM.qsRes.tlltd : NaN) },
  { k:"cgF",   label:"前外倾增益",    unit:"°/25mm", read:()=> sensSweepVal("front","cg") },
  { k:"bsF",   label:"前跳动转向",    unit:"°/25mm", read:()=> sensSweepVal("front","bs") },
  { k:"rcF",   label:"前侧倾中心高",  unit:"mm",     read:()=> sensMetricVal("front","rcH") },
  { k:"wrF",   label:"前轮端刚度",    unit:"N/mm",   read:()=> sensWheelRate("front") },
  { k:"cgR",   label:"后外倾增益",    unit:"°/25mm", read:()=> sensSweepVal("rear","cg") },
  { k:"bsR",   label:"后跳动转向",    unit:"°/25mm", read:()=> sensSweepVal("rear","bs") },
  { k:"rcR",   label:"后侧倾中心高",  unit:"mm",     read:()=> sensMetricVal("rear","rcH") },
  { k:"wrR",   label:"后轮端刚度",    unit:"N/mm",   read:()=> sensWheelRate("rear") },
  { k:"cam",   label:"外倾角",        unit:"°",      read:()=> sensMetricVal(S.axis,"cam") },
  { k:"toe",   label:"前束角",        unit:"°",      read:()=> sensMetricVal(S.axis,"toe") },
  { k:"scrub", label:"主销偏移距",    unit:"mm",     read:()=> sensMetricVal(S.axis,"scrub") },
  { k:"freq",  label:"簧载固有频率",  unit:"Hz",     read:()=>{ const m=sensSweepVal(S.axis,"mr");
      if(!isFinite(m)) return NaN; const kS=(S.axis==="front"?S.front.kS:S.rear.kS);
      const mS=(S.axis==="front"?S.front.mS:S.rear.mS); return mS>0 ? Math.sqrt(kS*m*m*1000/mS)/(2*Math.PI) : NaN; } },
];

function setupKpiSnapshot(){
  const o = {};
  SETUP_KPI.forEach(x=>{ const v = x.read(); o[x.k] = (typeof v === "number" && isFinite(v)) ? +v.toFixed(4) : null; });
  return o;
}
function setupListLoad(){
  try{
    const raw = localStorage.getItem(SETUPS.lsKey);
    const arr = raw ? JSON.parse(raw) : [];
    SETUPS.list = Array.isArray(arr) ? arr.filter(x=>x && x.id && x.name && x.front && x.rear).slice(0, SETUPS.max) : [];
  }catch(e){ SETUPS.list = []; }
  return SETUPS.list;
}
function setupListPersist(){
  try{ localStorage.setItem(SETUPS.lsKey, JSON.stringify(SETUPS.list)); return true; }
  catch(e){ return false; }   /* 配额满/隐私模式：不抛，由调用方提示 */
}
function setupSaveCurrent(name){
  const nm = (name || "").trim();
  if(!nm) return { ok:false, msg:"请先填方案名" };
  setupListLoad();
  const rec = {
    id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    name: nm, at: new Date().toISOString(), veh: S.vehicleType,
    /* seq：单调保存序号。只用 `at`（ISO 毫秒）排序在"同一毫秒内连存两条"时会并列，
       稳定排序退回列表原序（最新在前）⇒ 对比基准列会取成最新那条（实测踩到：
       三条方案同毫秒保存，基准列变成了 C）。序号彻底消除并列歧义。 */
    seq: SETUPS.list.reduce((m,r)=>Math.max(m, r.seq || 0), 0) + 1,
    wb:S.wb, hcg:S.hcg, hs:S.hs, mTotal:S.mTotal, mSprung:S.mSprung,
    /* 设计快照：整体 deepClone，与预设加载同一条路径（不逐个字段搬） */
    front: deepClone(S.front), rear: deepClone(S.rear),
    kpi: setupKpiSnapshot(),
  };
  SETUPS.list.unshift(rec);
  if(SETUPS.list.length > SETUPS.max) SETUPS.list.length = SETUPS.max;   /* 淘汰最旧 */
  if(!setupListPersist()) return { ok:false, msg:"写入 localStorage 失败（配额满或隐私模式）" };
  return { ok:true, msg:`已存「${nm}」`, rec };
}
function setupLoadInto(id){
  const r = SETUPS.list.find(x=>x.id === id); if(!r) return false;
  /* 与 loadVehiclePreset 同一路径：整车标量 + 两轴整体替换 */
  S.vehicleType = r.veh;
  S.wb = r.wb; S.hcg = r.hcg; S.hs = r.hs; S.mTotal = r.mTotal; S.mSprung = r.mSprung;
  S.front = deepClone(r.front); S.rear = deepClone(r.rear);
  S.travel = 0; S.roll = 0; S.rack = 0; S.simT = 0;
  if(typeof SIM !== "undefined"){ SIM.qsRes = null; }
  if(typeof rebuild === "function") rebuild();
  if(typeof refreshDerived === "function") refreshDerived(true);
  return true;
}
function setupDelete(id){
  setupListLoad();
  const i = SETUPS.list.findIndex(x=>x.id === id); if(i < 0) return false;
  SETUPS.list.splice(i,1); delete SETUPS.sel[id];
  setupListPersist();
  return true;
}
function setupCompareRows(){
  /* 基准列取**最早保存**的方案（而不是列表首个 = 最新）：
     "我们试了 A，再试 B"的直觉是拿 A 作基准看 B 差多少；列表展示仍最新在前，
     只有对比列序按保存序号升序（`seq` 单调递增，避免同毫秒保存时并列）。
     旧记录没有 seq 时回退按 `at` 排序。 */
  const sel = SETUPS.list.filter(r=>SETUPS.sel[r.id])
    .sort((a,b)=> ((a.seq||0) - (b.seq||0)) || String(a.at).localeCompare(String(b.at)));
  const ref = sel[0] || null;
  return { sel, ref, rows: SETUP_KPI.map(x=>({
    label:x.label, unit:x.unit,
    vals: sel.map(r=> (r.kpi && typeof r.kpi[x.k] === "number") ? r.kpi[x.k] : null)
  })) };
}

/* —— 面板 —— */
function buildSetupPanel(host){
  const b = sec(host,"方案库与对比","SETUP LIBRARY & COMPARE",false,"pur");
  const wrap = E("div"); wrap.style.cssText = "padding:4px 10px 8px";
  b.appendChild(wrap);
  const hint = E("div","eng-status");
  hint.textContent = "保存命名方案（设计快照 + KPI 快照，跨会话）。勾选 2~3 条生成对比表；Δ 相对第一条。载入会完整还原那套设计。";
  wrap.appendChild(hint);

  /* 保存行 */
  const sv = E("div","eng-row");
  sv.appendChild(E("span","eng-lb w86","存为新方案"));
  const nm = E("input"); nm.id = "setupName"; nm.type = "text"; nm.placeholder = "如：LCA 内点外移 10mm";
  nm.style.cssText = "flex:1;min-width:0;background:var(--well);border:1px solid var(--glass-bd);border-radius:var(--r-sm);color:var(--ink-1);font:400 9.5px var(--font-ui);padding:3px 6px";
  const btn = E("button","eng-btn"); btn.id = "setupSave"; btn.textContent = "保存"; btn.style.flex = "0 0 44px";
  btn.onclick = ()=>{
    const r = setupSaveCurrent(nm.value);
    const st = document.getElementById("setupStatus");
    if(st) st.textContent = r.msg + (r.ok ? `（共 ${SETUPS.list.length} 条）` : "");
    if(r.ok){ nm.value = ""; renderSetupPanel(); }
  };
  sv.appendChild(nm); sv.appendChild(btn); wrap.appendChild(sv);

  const st = E("div","eng-status"); st.id = "setupStatus";
  st.textContent = "尚未保存任何方案。";
  wrap.appendChild(st);
  const out = E("div"); out.id = "setupOut"; wrap.appendChild(out);

  setupListLoad();
  renderSetupPanel();
}

function renderSetupPanel(){
  const out = document.getElementById("setupOut"); if(!out) return;
  out.innerHTML = "";
  setupListLoad();
  const st = document.getElementById("setupStatus");
  if(st && SETUPS.list.length) st.textContent = `${SETUPS.list.length} 套方案（上限 ${SETUPS.max}，超出从最旧淘汰）`;
  if(!SETUPS.list.length) return;

  /* 方案列表：勾选（对比） / 载入 / 删除 */
  SETUPS.list.forEach(r=>{
    const row = E("div");
    row.style.cssText = "display:grid;grid-template-columns:16px 1fr 34px 18px;gap:4px;align-items:center;" +
                        "padding:3px 2px;border-top:1px solid var(--hairline)";
    const cb = E("input"); cb.type = "checkbox"; cb.checked = !!SETUPS.sel[r.id];
    cb.onchange = ()=>{
      const n = Object.keys(SETUPS.sel).filter(k=>SETUPS.sel[k]).length;
      if(cb.checked && n >= 3){ cb.checked = false; if(st) st.textContent = "一次最多对比 3 套（280px 栏宽下的可读性上限）"; return; }
      SETUPS.sel[r.id] = cb.checked; renderSetupPanel();
    };
    const lb = E("span",null,r.name);
    lb.style.cssText = "font:400 9.5px var(--font-ui);color:var(--ink-2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis";
    lb.title = `${r.name} · ${r.veh} · ${new Date(r.at).toLocaleString("zh-CN")}`;
    const ld = E("button","eng-btn"); ld.textContent = "载入"; ld.style.cssText = "padding:2px 0!important;font-size:8.5px";
    ld.onclick = ()=>{
      const ok = setupLoadInto(r.id);
      if(st) st.textContent = ok ? `已载入「${r.name}」（设计已还原，读数已复算）` : "载入失败：记录不存在";
      if(ok){ if(typeof buildRight === "function") buildRight(); if(typeof updateReadouts === "function") updateReadouts(); }
    };
    const del = E("button","eng-btn"); del.textContent = "✕"; del.title = "删除该方案";
    del.style.cssText = "padding:2px 0!important;font-size:8.5px;color:var(--err)";
    del.onclick = ()=>{ if(setupDelete(r.id)) renderSetupPanel(); };
    row.appendChild(cb); row.appendChild(lb); row.appendChild(ld); row.appendChild(del);
    out.appendChild(row);
  });

  /* 对比表（列 = 方案，行 = KPI；Δ 相对第一列） */
  const { sel, ref, rows } = setupCompareRows();
  if(sel.length >= 2){
    const tbl = E("div");
    tbl.style.cssText = "margin-top:6px;border-top:1px solid var(--hairline)";
    const cols = `1fr repeat(${sel.length}, 50px)`;
    const hd = E("div");
    hd.style.cssText = `display:grid;grid-template-columns:${cols};gap:3px;padding:3px 2px;` +
                       "font:500 8px var(--font-ui);color:var(--ink-3);letter-spacing:.04em";
    hd.innerHTML = "<span>对比 KPI（Δ 相对第 1 列）</span>" + sel.map((r,i)=>
      `<span style="text-align:right;overflow:hidden;text-overflow:ellipsis" title="${r.name}">${i===0?"基准":("方案"+String.fromCharCode(65+i))}</span>`).join("");
    tbl.appendChild(hd);
    rows.forEach(x=>{
      const d = E("div");
      d.style.cssText = `display:grid;grid-template-columns:${cols};gap:3px;padding:2px;` +
                        "border-top:1px solid var(--hairline);font:400 8.5px var(--font-mono);align-items:baseline";
      const nmEl = E("span",null,x.label);
      nmEl.style.cssText = "overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--ink-2)";
      d.appendChild(nmEl);
      const v0 = x.vals[0];
      x.vals.forEach((v,i)=>{
        const c = E("b");
        if(v == null){ c.textContent = "—"; c.style.color = "var(--ink-3)"; }
        else if(i === 0){ c.textContent = fmt(v, 2); c.style.color = "var(--ink-1)"; }
        else{
          const dv = (v0 != null) ? v - v0 : NaN;
          c.textContent = fmt(v, 2);
          c.title = isFinite(dv) ? ("Δ " + (dv>=0?"+":"") + dv.toFixed(3) + " " + x.unit) : "";
          /* |Δ| 超过基准 5% 或绝对量显著时标黄，便于一眼看出哪套真的不同 */
          const big = isFinite(dv) && v0 != null && (Math.abs(v0) > 1e-6 ? Math.abs(dv/v0) > 0.05 : Math.abs(dv) > 0.01);
          c.style.color = big ? "var(--warn)" : "var(--ink-3)";
        }
        c.style.textAlign = "right"; c.style.fontWeight = "400";
        d.appendChild(c);
      });
      tbl.appendChild(d);
    });
    out.appendChild(tbl);
    const ex = E("button","eng-run"); ex.textContent = "导出对比 CSV";
    ex.style.marginTop = "4px"; ex.onclick = exportSetupCompareCsv;
    out.appendChild(ex);
    if(ref) { /* 参考列提示 */ }
  } else if(SETUPS.list.length >= 2){
    const t = E("div","eng-status"); t.textContent = "勾选 2~3 条方案即可生成对比表。";
    out.appendChild(t);
  }
}

function exportSetupCompareCsv(){
  const { sel, rows } = setupCompareRows();
  if(sel.length < 2) return;
  const q = s => '"' + String(s == null ? "" : s).replace(/"/g,'""') + '"';
  const head = ["KPI", "单位", ...sel.map(r=>r.name + " (" + new Date(r.at).toLocaleString("zh-CN") + ")")].map(q).join(",");
  const body = rows.map(x => [q(x.label), q(x.unit), ...x.vals.map(v => q(v == null ? "" : v))].join(",")).join("\r\n");
  const veh = ["车型", "轴距mm", "整车质量kg", "簧载质量kg", "前kS", "后kS", "前ARB", "后ARB"];
  const vehRows = sel.map(r => [q(r.name), q(r.wb), q(r.mTotal), q(r.mSprung),
    q(r.front && r.front.kS), q(r.rear && r.rear.kS),
    q(r.front && r.front.arb && r.front.arb.d), q(r.rear && r.rear.arb && r.rear.arb.d)].join(",")).join("\r\n");
  const csv = "\ufeff" + "LABSUS 方案对比\r\n" + head + "\r\n" + body +
              "\r\n\r\n方案参数\r\n" + veh.map(q).join(",") + "\r\n" + vehRows + "\r\n";
  try{
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "LABSUS_方案对比_" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    const st = document.getElementById("setupStatus");
    if(st) st.textContent = `已导出 ${sel.length} 套方案的对比 CSV（${rows.length} 项 KPI）`;
  }catch(e){
    const st = document.getElementById("setupStatus");
    if(st) st.textContent = "导出失败：" + e.message;
  }
}
window.exportSetupCompareCsv = exportSetupCompareCsv;

/* ═══════════════════════════════════════════════════════════════════════════
   M12（2026-09-20）· E12 双参数交互扫描（2-PARAMETER INTERACTION SWEEP）
   ───────────────────────────────────────────────────────────────────────────
   单参数扫描（T1-1）回答"哪个杠杆最划算"，但它有一个隐含前提：**参数之间相互独立**。
   真车上这个前提经常不成立——最典型的是"前 ARB × 前弹簧刚度"（都改前轴侧倾刚度，
   边际效应互相吃掉）、"硬点高度 × 弹簧刚度"（改运动速比）。此时单参数扫描的排序会误导：
   两个各自"很有效"的参数，一起调可能几乎没有额外收益。

   本面板做二维网格扫描（n×n，n=3/5/7），并给出**交互强度**：
     主效应  mainX = f(x_max) − f(x_min)   （Y 取基准行）
             mainY = f(y_max) − f(y_min)   （X 取基准列）
     交互项  I = [f(++,+) − f(+,−)] − [f(−,+) − f(−,−)]   （差分之差）
     相对强度 = |I| / max(|mainX|, |mainY|)
   判定：<20% 基本独立（单参数结论可信）；20~50% 中等耦合；>50% 强耦合
   （**单参数扫描会误导，必须以本网格为准**）。

   纪律与 T1-1 一致：本地 rebuild() 零引擎往返；目标量取值与右坞站读数同源；
   扫完**精确还原**两个参数并复算（放在 finally，中途出错也还原）；结果存 SIM.sens2Res。
   代价：n² 次 rebuild（5×5=25 次），状态栏给出实际耗时。
   ═══════════════════════════════════════════════════════════════════════════ */
const SENS2 = { xKey:"arb.front", yKey:"kS.front", dx:10, dy:20, n:5, objKey:"us", res:null };

function buildSens2Panel(host){
  const b = sec(host,"双参数交互扫描","2-PARAMETER INTERACTION",true,"pur");
  const wrap = E("div"); wrap.style.cssText = "padding:4px 10px 8px";
  b.appendChild(wrap);
  const hint = E("div","eng-status");
  hint.textContent = "两个参数同时扫成网格，并算出交互强度：它告诉你单参数扫描的排序是否可信。n×n 次本地复算，扫完精确还原。";
  wrap.appendChild(hint);

  const plist = sensParamList();
  const mkSel = (label, id, val) => {
    const r = E("div","eng-row");
    r.appendChild(E("span","eng-lb w86",label));
    const s = E("select","eng-input"); s.id = id;
    /* 选项文案必须**参数名在前**：左栏只有 280px，<option> 被截断时只剩前缀——
       旧写法 `分组 · 参数名 [单位]` 截断后只剩"弹簧与稳定杆"，根本看不出选的是哪个参数。 */
    plist.forEach(p=>{ const op=E("option",null,p.label+" ["+p.unit+"] · "+p.g); op.value=p.key; s.appendChild(op); });
    s.value = val; r.appendChild(s); wrap.appendChild(r);
    return s;
  };
  const xSel = mkSel("X 轴参数", "sens2X", SENS2.xKey);
  const ySel = mkSel("Y 轴参数", "sens2Y", SENS2.yKey);
  const dr = E("div","eng-row");
  dr.appendChild(E("span","eng-lb w86","± 步长 X / Y"));
  const dxInp = E("input","eng-input"); dxInp.id="sens2Dx"; dxInp.type="number"; dxInp.min="0"; dxInp.style.flex="1";
  const dyInp = E("input","eng-input"); dyInp.id="sens2Dy"; dyInp.type="number"; dyInp.min="0"; dyInp.style.flex="1";
  dr.appendChild(dxInp); dr.appendChild(dyInp); wrap.appendChild(dr);
  const nr = E("div","eng-row"); nr.appendChild(E("span","eng-lb w86","点数/轴 n"));
  const nSel = E("select","eng-input"); nSel.id="sens2N"; nSel.style.flex="1";
  [3,5,7].forEach(k=>{ const op=E("option",null,k+" × "+k+" = "+(k*k)+" 次"); op.value=String(k); nSel.appendChild(op); });
  nSel.value = String(SENS2.n); nr.appendChild(nSel); wrap.appendChild(nr);
  const orow = E("div","eng-row"); orow.appendChild(E("span","eng-lb w86","目标量"));
  const objSel = E("select","eng-input"); objSel.id="sens2Obj"; objSel.style.flex="1";
  SENS_OBJ.forEach(o=>{ const op=E("option",null,o.label+" ["+o.unit+"]"); op.value=o.key; objSel.appendChild(op); });
  objSel.value = SENS2.objKey; orow.appendChild(objSel); wrap.appendChild(orow);

  const syncDefault = (sel, inp, isX) => {
    const p = sensParamByKey(sel.value); if(!p) return;
    inp.value = String(p.dDef != null ? p.dDef : 10);
    if(isX){ SENS2.xKey = sel.value; SENS2.dx = parseFloat(inp.value)||0; }
    else   { SENS2.yKey = sel.value; SENS2.dy = parseFloat(inp.value)||0; }
  };
  xSel.onchange = ()=> syncDefault(xSel, dxInp, true);
  ySel.onchange = ()=> syncDefault(ySel, dyInp, false);
  nSel.onchange = ()=>{ SENS2.n = parseInt(nSel.value,10); };
  objSel.onchange = ()=>{ SENS2.objKey = objSel.value; };
  syncDefault(xSel, dxInp, true); syncDefault(ySel, dyInp, false);

  const run = E("button","eng-run"); run.id="sens2Run"; run.textContent="运行交互扫描 INTERACTION";
  run.onclick = ()=>{
    SENS2.dx = parseFloat(dxInp.value)||0; SENS2.dy = parseFloat(dyInp.value)||0;
    SENS2.n = parseInt(nSel.value,10); SENS2.objKey = objSel.value;
    SENS2.xKey = xSel.value; SENS2.yKey = ySel.value;
    runSens2Sweep();
  };
  wrap.appendChild(run);
  const st = E("div","eng-status"); st.id="sens2Status";
  st.textContent = "尚未运行。默认给出「前 ARB 直径 × 前主弹簧刚度」——两者都改前轴侧倾刚度，是最典型的耦合对。";
  wrap.appendChild(st);
  const cv = E("canvas"); cv.id="sens2Chart";
  cv.width=520; cv.height=300;
  cv.style.cssText = "width:100%;height:auto;margin-top:5px;background:var(--well);border:1px solid var(--hairline);border-radius:var(--r-sm)";
  wrap.appendChild(cv);
}
window.buildSens2Panel = buildSens2Panel;

function runSens2Sweep(){
  const P = sensParamByKey(SENS2.xKey), Q = sensParamByKey(SENS2.yKey);
  const obj = SENS_OBJ.find(o=>o.key === SENS2.objKey) || SENS_OBJ[0];
  const st = document.getElementById("sens2Status");
  if(!P || !Q || !obj){ if(st) st.textContent = "参数或目标量无效。"; return null; }
  if(P.key === Q.key){ if(st) st.textContent = "X 与 Y 不能是同一个参数（那样只会得到对角线）。"; return null; }
  const n = Math.max(3, Math.min(7, (SENS2.n|0) % 2 ? (SENS2.n|0) : 5));
  const bxp = P.get(), byq = Q.get();
  const lin = (c, d) => { const o=[]; for(let i=0;i<n;i++) o.push(c + (i/(n-1)*2-1)*d); return o; };
  const xs = lin(bxp, SENS2.dx), ys = lin(byq, SENS2.dy);
  /* 钳位检测：setter 可能拒收（最典型：ARB 直径 ≥ 0，基准 0 时 −Δ 全被夹到 0）。
     某轴若有 ≥2 个点落到同一处，网格就不正交、交互项会系统性偏小——必须如实报出，
     而不是把带缺陷的网格当成有效结论。 */
  const probeClamp = (par, vals, base) => {
    const out = [];
    vals.forEach(v=>{ par.set(v); out.push(Math.abs(par.get() - v) > 1e-6); });
    par.set(base);
    return out;
  };
  const ncx = probeClamp(P, xs, bxp).filter(Boolean).length;
  const ncy = probeClamp(Q, ys, byq).filter(Boolean).length;
  const now = ()=> (typeof performance!=="undefined" && performance.now) ? performance.now() : Date.now();
  const t0 = now();
  const M = [];
  try{
    for(let j=0;j<n;j++){
      const row = [];
      for(let i=0;i<n;i++){
        P.set(xs[i]); Q.set(ys[j]); rebuild();
        const v = obj.read();
        row.push((typeof v==="number" && isFinite(v)) ? v : NaN);
      }
      M.push(row);
    }
  } finally {
    /* 无论中途是否出错，两个参数都必须精确还原（与 T1-1 同一条纪律） */
    P.set(bxp); Q.set(byq); rebuild(); refreshDerived(true);
  }
  const flat = M.flat().filter(v=>isFinite(v));
  if(!flat.length){ if(st) st.textContent = "网格内目标量全部不可用（当前工况下该目标无定义）。"; return null; }
  const mid = (n-1)>>1;
  const mainX = M[mid][n-1] - M[mid][0];
  const mainY = M[n-1][mid] - M[0][mid];
  const inter = (M[n-1][n-1] - M[n-1][0]) - (M[0][n-1] - M[0][0]);
  const scale = Math.max(Math.abs(mainX), Math.abs(mainY), 1e-12);
  const res = {
    xKey:P.key, xLabel:P.label, xUnit:P.unit, xBase:+bxp.toFixed(4), dx:SENS2.dx, xs,
    yKey:Q.key, yLabel:Q.label, yUnit:Q.unit, yBase:+byq.toFixed(4), dy:SENS2.dy, ys,
    objKey:obj.key, objLabel:obj.label, objUnit:obj.unit,
    M, n, min:Math.min.apply(null,flat), max:Math.max.apply(null,flat),
    mainX, mainY, inter, rel:Math.abs(inter)/scale,
    /* 钳位计数：某轴被 setter 夹住的点数（≥2 即网格非正交、交互项会系统性偏小） */
    clamped:{ x:ncx, y:ncy, n },
    ms: now()-t0, at:new Date().toISOString(),
  };
  SENS2.res = res; SIM.sens2Res = res;
  renderSens2Result(res);
  return res;
}
window.runSens2Sweep = runSens2Sweep;

/* 交互强度判定（单一真源：面板与设计报告共用，避免两处阈值漂移） */
function sens2Verdict(rel){
  return rel < 0.20 ? "两参数基本独立（单参数扫描结论可信）"
       : (rel < 0.50 ? "中等耦合（排序仍可用，但幅度会偏）"
                     : "强耦合（单参数扫描会误导，以本网格为准）");
}
window.sens2Verdict = sens2Verdict;

function renderSens2Result(res){
  const st = document.getElementById("sens2Status");
  if(st){
    st.textContent =
      `X ${res.xLabel} ±${res.dx}${res.xUnit} × Y ${res.yLabel} ±${res.dy}${res.yUnit} · `
      + `${res.n}×${res.n} · 目标 ${res.objLabel} [${res.objUnit}] · `
      + (res.ms<1 ? "<1" : Math.round(res.ms)) + `ms\n`
      + `主效应 X ${res.mainX>=0?"+":""}${res.mainX.toFixed(4)} / Y ${res.mainY>=0?"+":""}${res.mainY.toFixed(4)} · `
      + `交互项 ${res.inter>=0?"+":""}${res.inter.toFixed(4)}（相对强度 ${(res.rel*100).toFixed(0)}%）→ ${sens2Verdict(res.rel)}\n`
      + `区间 ${fmt(res.min,3)} ~ ${fmt(res.max,3)} ${res.objUnit} · 两参数已精确还原 `
      + `(${fmt(res.xBase,2)} / ${fmt(res.yBase,2)})`
      /* 钳位警告：ARB 直径这类"≥0"参数在基准 0 附近扫 ±Δ 时，负半轴全被夹到 0
         ⇒ 该轴出现重复列/行，网格不再正交、交互项偏小。不提示就等于给人假结论。 */
      + ((res.clamped && (res.clamped.x >= 2 || res.clamped.y >= 2))
          ? `\n⚠ 钳位警告：${res.clamped.x >= 2 ? `X 轴 ${res.clamped.x}/${res.n} 点` : ""}`
            + `${(res.clamped.x >= 2 && res.clamped.y >= 2) ? "、" : ""}`
            + `${res.clamped.y >= 2 ? `Y 轴 ${res.clamped.y}/${res.n} 点` : ""}`
            + `被参数 setter 夹住（如 ARB 直径 ≥ 0）⇒ 网格非正交、交互项会偏小。`
            + `请把基准值移到区间中部，或收窄 ±Δ。`
          : "");
  }
  drawSens2Chart(res);
}

function drawSens2Chart(res){
  const cv = document.getElementById("sens2Chart"); if(!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const L=8, R=8, T=24, B=42;
  const gw = W-L-R, gh = H-T-B;
  ctx.clearRect(0,0,W,H);
  const n = res.n, cw = gw/n, ch = gh/n;
  const span = Math.max(1e-12, res.max - res.min);
  for(let j=0;j<n;j++){
    for(let i=0;i<n;i++){
      const v = res.M[j][i];
      const x = L + i*cw, y = T + (n-1-j)*ch;      /* Y 轴向上增大 */
      let fill, fg, txt;
      if(!isFinite(v)){ fill="rgba(120,130,145,.18)"; fg="rgba(180,190,205,.75)"; txt="—"; }
      else{
        const t = (v - res.min)/span;              /* 0..1：低=蓝 → 高=橙 */
        fill = `rgba(${Math.round(70+t*175)},${Math.round(120-t*40)},${Math.round(190-t*120)},.62)`;
        fg = "rgba(12,16,22,.92)"; txt = fmt(v,2);
      }
      ctx.fillStyle = fill; ctx.fillRect(x, y, cw-1, ch-1);
      if(n <= 5){
        ctx.fillStyle = fg; ctx.font = "600 10px ui-monospace,monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(txt, x + cw/2, y + ch/2);
      }
    }
  }
  if(n % 2 === 1){                                  /* 基准格（两参数当前值）描边 */
    const b = (n-1)>>1;
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(L + b*cw + .5, T + (n-1-b)*ch + .5, cw-2, ch-2);
  }
  ctx.fillStyle = "rgba(200,210,225,.95)"; ctx.font = "500 10px sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText(`↑ Y ${res.yLabel}  ${fmt(res.ys[0],1)} → ${fmt(res.ys[n-1],1)} ${res.yUnit}`, 4, 2);
  ctx.textAlign = "center";
  ctx.fillText(`X ${res.xLabel}  ${fmt(res.xs[0],1)} → ${fmt(res.xs[n-1],1)} ${res.xUnit}`, L + gw/2, H-B+16);
  ctx.textAlign = "left"; ctx.font = "400 9px sans-serif"; ctx.fillStyle = "rgba(160,170,185,.9)";
  ctx.fillText(`${res.objLabel}：低 ${fmt(res.min,3)} / 高 ${fmt(res.max,3)} ${res.objUnit}`
             + `（白框 = 当前基准）`, 4, H-14);
}
