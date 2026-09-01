"use strict";
/* ================================ 12b. 硬点永久保存（2026-08-23 移植新增） ================================ */
const HP_SAVE_KEY="labsus.hp.v1";
/* F-02（2026-08-30）：硬点数据有限性校验——非法值（"abc"→NaN、null→0）曾直入
   求解器并与 F-01 叠加静默产出垃圾几何。返回 null=合法，否则返回拒绝原因。 */
function hpValidate(d){
  if(!d||!d.front||!d.rear)return "缺少 front/rear 轴对象";
  for(const ax of ["front","rear"]){
    const hp=S[ax].hp, src=d[ax]||{};
    for(const k in hp){
      const a=src[k]; if(a===undefined||a===null)continue;   /* 缺键→保留当前值 */
      if(!Array.isArray(a)||a.length!==3||!a.every(Number.isFinite))
        return `${ax}.${k} 非法（需 3 个有限数，得到 ${JSON.stringify(a)}）`;
    }
  }
  if(d.wb!==undefined&&(!Number.isFinite(d.wb)||d.wb<=0))return "wb 非法";
  if(d.hcg!==undefined&&(!Number.isFinite(d.hcg)||d.hcg<=0))return "hcg 非法";
  if(d.tieTrimF!==undefined&&!Number.isFinite(d.tieTrimF))return "tieTrimF 非法";
  if(d.tieTrimR!==undefined&&!Number.isFinite(d.tieTrimR))return "tieTrimR 非法";
  return null;
}
function hpSnapshot(){
  return {
    vehicleType: S.vehicleType || "formula",
    frontArch: S.front ? S.front.arch : "pushrod",
    rearArch: S.rear ? S.rear.arch : "pushrod",
    front: S.front.hp,
    rear: S.rear.hp,
    tieTrimF: S.front.tieTrim,
    tieTrimR: S.rear.tieTrim,
    wb: S.wb,
    hcg: S.hcg,
    t: Date.now()
  };
}
function hpSave(quiet){
  try {
    const key = HP_SAVE_KEY + "." + (S.vehicleType || "formula");
    localStorage.setItem(key, JSON.stringify(hpSnapshot()));
    localStorage.removeItem(HP_SAVE_KEY); // Clean up unnamespaced legacy cache
    if(!quiet) setKcStatus("硬点已保存 "+new Date().toLocaleTimeString(), C.pathC);
  } catch(e){
    console.warn("hpSave failed",e);
  }
}
function hpLoad(targetType){
  try {
    const vType = targetType || S.vehicleType || "formula";
    const key = HP_SAVE_KEY + "." + vType;
    let raw = localStorage.getItem(key);
    if(!raw) {
      const legRaw = localStorage.getItem(HP_SAVE_KEY);
      if(legRaw) {
        try {
          const legD = JSON.parse(legRaw);
          if(legD && legD.vehicleType === vType) raw = legRaw;
          else localStorage.removeItem(HP_SAVE_KEY); // Clean mismatched legacy cache
        } catch(e){}
      }
    }
    if(!raw) return;
    const d = JSON.parse(raw);
    if(d.vehicleType && d.vehicleType !== vType) return; // Prevent cross-vehicle mismatch
    if(d.frontArch && S.front && d.frontArch !== S.front.arch) return; // Prevent pushrod/direct strut mismatch
    const err = hpValidate(d);
    if(err){
      console.warn("hpLoad rejected:", err);
      return;
    }
    for(const ax of ["front","rear"]){
      const hp = S[ax].hp, saved = d[ax];
      for(const k in hp) {
        if(saved[k] && Array.isArray(saved[k]) && saved[k].length === 3) hp[k] = saved[k].map(Number);
      }
    }
    if(typeof d.tieTrimF === "number") S.front.tieTrim = d.tieTrimF;
    if(typeof d.tieTrimR === "number") S.rear.tieTrim = d.tieTrimR;
    if(typeof d.wb === "number") S.wb = d.wb;
    if(typeof d.hcg === "number") S.hcg = d.hcg;
  } catch(e){
    console.warn("hpLoad failed", e);
  }
}
function hpReset(){
  try {
    const vType = S.vehicleType || "formula";
    localStorage.removeItem(HP_SAVE_KEY + "." + vType);
    localStorage.removeItem(HP_SAVE_KEY);
  } catch(e){}
  loadVehiclePreset(S.vehicleType || "formula");
  setKcStatus("已恢复出厂预设硬点", C.nodeFix);
}
function hpExport(){const blob=new Blob([JSON.stringify(hpSnapshot(),null,1)],
  {type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="labsus-hardpoints-"+new Date().toISOString().slice(0,10)+".json";
  a.click(); URL.revokeObjectURL(a.href);
  setKcStatus("硬点已导出为 JSON 文件", C.pathC);}
function hpImport(){const inp=document.createElement("input");
  inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=()=>{const f=inp.files&&inp.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{try{const d=JSON.parse(rd.result);
      const err=hpValidate(d);
      if(err)throw new Error(err);
      for(const ax of ["front","rear"]){const hp=S[ax].hp;
        for(const k in hp) if(d[ax][k]&&d[ax][k].length===3) hp[k]=d[ax][k].map(Number);}
      /* F-36（2026-08-30）：导出含 tieTrimF/R，导入也要恢复（旧实现漏掉，
         导出→导入后摇臂/横拉杆 trim 静默回到默认值） */
      if(typeof d.tieTrimF==="number")S.front.tieTrim=d.tieTrimF;
      if(typeof d.tieTrimR==="number")S.rear.tieTrim=d.tieTrimR;
      if(typeof d.wb==="number")S.wb=d.wb; if(typeof d.hcg==="number")S.hcg=d.hcg;
      hpSave(true); rebuild(); UI.sync.forEach(f=>f());
      setKcStatus("硬点导入成功并已保存", C.pathC);}
      catch(e){setKcStatus("导入失败：非有效硬点文件（"+e.message+"）", C.nodeFix);}};
    rd.readAsText(f);};
  inp.click();}
function buildPersistencePanel(host){
  let b=sec(host,"硬点永久保存","HARDPOINT PERSISTENCE",false,"grn");
  rowBtns(b,[["保存 SAVE",()=>hpSave()],["复位 RESET",hpReset],
             ["导出 EXPORT",hpExport],["导入 IMPORT",hpImport]]);
  const st=E("div","ro"); st.appendChild(E("span",null,'自动保存 <u>AUTO</u>'));
  const v=E("b",null,"拖拽/编辑后即时写盘"); st.appendChild(v); b.appendChild(st);
  b.appendChild(EH("div",null,'<i style="opacity:.65">localStorage 永久保存（刷新不丢）；导出 JSON 可跨机器备份。</i>'));
}
function buildSystemShowPanel(host){
  let b=sec(host,"系统显示·默认分色","SYSTEM LAYERS",false,"amb");
  chkList(b,[
    ["frame_main","车架·主滚架/乘员舱"],["frame_front","车架·前防撞吸能"],["frame_side","车架·侧防撞梁"],["frame_rear","车架·后防撞尾框"],
    ["powertrain","传动·EDU 电驱"],["halfshaft","传动·半轴"],["cv_boot","传动·CV 防尘套"],
    ["steer_rack","转向·齿条箱"],["steer_col","转向·管柱万向节"],["steer_wheel","转向·方向盘"],
    ["disc_vent","制动·通风盘"],["caliper","制动·卡钳"],["brake_hyd","制动·管路"],["master_cyl","制动·总泵踏瓣"],
    ["rocker","行驶·摇臂"],["elastic","行驶·弹簧减振"],["wheel","行驶·轮胎轮毂"],["face","行驶·臂面/转向节"],["arb","行驶·防倾杆"],["rigid","连杆刚线"],["node","硬点标记"]]);
  let b2=sec(host,"实体着色·按零件分色","ENTITY COLOR",false,"grn");
  chkList(b2,[["entityColor","🎨 实体着色（覆盖系统色）"]]);
}

/* ================================ 13. 交互系统 ================================ */
function hookView(v){
  const cv=v.cv;
  cv.addEventListener("mousedown",e=>{
    cv.focus();
    const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    const hit=pickNode(v,mx,my);
    if(e.button===0&&hit&&v.type==="o"){
      S.axis = hit.axis; UI.selHP = hit.id;
      UI.drag={mode:"hp",v:v,id:hit.id,sx:hit.sx,axis:hit.axis,x0:e.clientX,y0:e.clientY,base:cpy(S[hit.axis].hp[hit.id])};
      UI.sync.forEach(f=>f());
    }else if(e.button===0&&v.type==="p"&&!e.shiftKey){
      UI.drag={mode:"orb",v:v,x0:e.clientX,y0:e.clientY,az:v.az,el:v.elv};
    }else{
      UI.drag={mode:"pan",v:v,x0:e.clientX,y0:e.clientY,cx:v.cx,cy:v.cy,tgt:cpy(v.tgt)};
    }
    e.preventDefault();
  });
  cv.addEventListener("mousemove",e=>{
    const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    if(!UI.drag){
      const hit=pickNode(v,mx,my);
      UI.hover=hit?hit.id:null;
      cv.style.cursor=hit?"crosshair":"default";
      if(hit){
        document.getElementById("sbCur").textContent=(hit.axis==='front'?"[前] ":"[后] ")+hit.id+" ["+
          fmt(S[hit.axis].hp[hit.id][0],1)+", "+fmt(S[hit.axis].hp[hit.id][1],1)+", "+fmt(S[hit.axis].hp[hit.id][2],1)+"]";
      }
    }
  });
  cv.addEventListener("wheel",e=>{
    e.preventDefault();
    const f=Math.pow(1.0015,-e.deltaY); v.s=clamp(v.s*f,0.02,15);
  },{passive:false});
  cv.addEventListener("dblclick",()=>fitView(v));
  cv.addEventListener("contextmenu",e=>e.preventDefault());
}

function pickNode(v,mx,my){
  let best=null,bd=90;
  for(let i=0;i<PICK.length;i++){const p=PICK[i];if(p.v!==v)continue;
    const d=(p.x-mx)*(p.x-mx)+(p.y-my)*(p.y-my);
    if(d<bd){bd=d;best=p;}}
  return best;
}

window.addEventListener("mousemove",e=>{
  const d=UI.drag;if(!d)return;
  const v=d.v;
  if(d.mode==="hp"){
    const da=(e.clientX-d.x0)/v.s,db=-(e.clientY-d.y0)/v.s;
    let w=[v.bx[0]*da+v.by[0]*db,v.bx[1]*da+v.by[1]*db,v.bx[2]*da+v.by[2]*db];
    if(d.sx<0)w[0]=-w[0];
    for(let k=0;k<3;k++) S[d.axis].hp[d.id][k]=Math.round((d.base[k]+w[k])*10)/10;
    /* F-03（2026-08-30）：拖拽每像素全量 rebuild()（内含 2×findLimits +
       runSweep + 准静态）→ 卡顿。拖拽中只做轻量"重建机构+单点求解+渲染指标"
       路径，pointerup 时再一次性 rebuild() 全量刷新派生量（见 mouseup）。 */
    const M=buildMech(d.axis);
    /* F-03：拖拽预览保持当前轮跳 S.travel（正 = 压缩），不加侧倾以便观察 */
    const z0=M.n[M.idx.WC].p0[2];
    driveTo(M, z0+(S.travel||0), 0, d.axis);
    const mm=metrics(M, d.axis);
    if(d.axis==='front'){SIM.FR=M;SIM.mFR=mm;SIM.mFL=null;}
    else{SIM.RR=M;SIM.mRR=mm;SIM.mRL=null;}
    SIM.geoF=null;SIM.geoR=null;SIM.swF=null;SIM.swR=null;   /* 派生缓存置脏，pointerup 重建 */
    drawAll();
  }else if(d.mode==="orb"){
    v.az=d.az-(e.clientX-d.x0)*0.006;
    v.elv=clamp(d.el+(e.clientY-d.y0)*0.005,-85*D2R,85*D2R);
  }else{
    if(v.type==="o"){v.cx=d.cx-(e.clientX-d.x0)/v.s;v.cy=d.cy+(e.clientY-d.y0)/v.s;}
  }
});
window.addEventListener("mouseup",()=>{if(UI.drag&&UI.drag.mode==="hp"){rebuild();hpSave();}UI.drag=null;});

/* ================================ 14. 主仿真循环 ================================ */
function updateSweeps(){
  if(!SIM.dirtySweep)return;
  const now=performance.now();
  if(now-SIM.lastSweep<140)return;
  SIM.lastSweep=now;SIM.dirtySweep=false;
  SIM.swF = runSweep(SIM.FR, S.rack, SIM.limF, 45, 'front');
  SIM.swR = runSweep(SIM.RR, 0, SIM.limR, 45, 'rear');
  SIM.mrRefF = Math.max(0.05, sampleSweep(SIM.swF, 0, "mr") || 0.75);
  SIM.mrRefR = Math.max(0.05, sampleSweep(SIM.swR, 0, "mr") || 0.75);
}

let _last=0,_fps=0,_fc=0,_ft=0,_stageAutoDone=false;
function loop(ts){
  if((typeof SLOPE_STAGE !== 'undefined' && SLOPE_STAGE.active) || (typeof SKIDPAD_STAGE !== 'undefined' && SKIDPAD_STAGE.active)){
    _last = ts;
    requestAnimationFrame(loop);
    return;
  }
  const dt=Math.min(0.045,_last?(ts-_last)/1000:0.016);_last=ts;
  if(S.play){
    S.t+=dt;
    if(S.mode==="rig") S.simT+=dt;
    if(S.mode==="kin"&&S.exc!=="off"){
      const ph=2*PI*S.excF*S.t;
      const u=S.exc==="sine"?sin(ph):(2/PI)*Math.asin(sin(ph));
      S.travel=clamp(S.excA*u,S.trMin,S.trMax);
    }
  }
  updateSweeps();
  /* F-20（2026-08-30）：暂停必须真正冻结时域积分——旧实现 simulate(dt)
     无条件调用，rig 模式下暂停时 stepDyn 仍以真实 dt 积分。传零步长冻结。 */
  try{simulate(S.play?dt:0);}catch(err){console.error(err);S.play=false;}
  drawAll();updateReadouts();drawPlots();
  UI.sync.forEach(f=>f());

  _fc++;_ft+=dt;
  if(_ft>0.4){_fps=_fc/_ft;_fc=0;_ft=0;document.getElementById("tbFps").textContent=fmt(_fps,0);}
  requestAnimationFrame(loop);
  /* F-51（2026-08-30）：`?stage` 定时器曾写在 rAF 循环体内 → 每帧注册一个
     setTimeout，800ms 后每帧弹一次设置窗。一次性 flag 保证只触发一次。 */
  if(!_stageAutoDone){
    if(location.search.indexOf("stagedemo")>=0){_stageAutoDone=true;setTimeout(function(){_stageOpenSetup();setTimeout(function(){trackStageRun();},300);},800);}
    else if(location.search.indexOf("stage")>=0){_stageAutoDone=true;setTimeout(function(){_stageOpenSetup();},800);}
  }
}

/* ================================================================
   TPHYS: built-in track physics engine (JS port of transient.py,
   dual-core parity audited D1).
   3-DOF body, MF tires with composite-slip + relaxation length + camber
   thrust + LS, powertrain envelope, aero downforce/drag, roll/pitch lag,
   pure-pursuit + PI. NOTE: rc/kw LUTs come from SIM.swF/swR sweeps (same
   geometry source the engine path sends as kw_curve).
   ================================================================ */
