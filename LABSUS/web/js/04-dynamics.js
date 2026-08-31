"use strict";
function roadSignal(t){
  const A=S.rA;
  switch(S.road){
    case "step":  {const x=(t-0.40)/0.030;return A*0.5*(1+Math.tanh(clamp(x,-6,6)));}
    case "sine":  return A*sin(2*PI*S.rF*t);
    case "pulse": {const x=(t-0.5)/0.06;return A*Math.exp(-x*x);}
    case "chirp": {const f=0.4+ (S.rF)*Math.min(1,t/8);return A*sin(2*PI*f*t);}
    case "rand":  {let v=0;for(let k=1;k<=5;k++)v+=sin(2*PI*(1.1*k*S.rF*0.55)*t+k*2.399)/k;return A*v*0.45;}
    default: return 0;
  }
}

function stepDyn(M,dt,rack,tSim,axis){
  const NS=10,h=dt/NS,g=9810, state=S[axis];
  const kS=state.kS*FS,cB=state.cB*FS,cR=state.cR*FS,kT=state.kT*FS,cT=0.55*FS,kBS=S.kBS*FS;
  const iW=M.idx.WC, iDmpR=M.idx.RCK_DMP, iDmpB=M.idx.DMP_BODY;
  const z0=M.n[iW].p0[2];
  let Fs=0,Fd=0,Ft=0,pen=0,accz=0;
  setChassis(M,rack,axis);

  for(let s=0;s<NS;s++){
    const tt=tSim+s*h, rz=M.roadZ0+roadSignal(tt);
    const rzv=clamp((roadSignal(tt+2e-4)-roadSignal(tt-2e-4))/4e-4,-4000,4000);
    for(let k=0;k<M.n.length;k++){const N=M.n[k];N.f[0]=0;N.f[1]=0;N.f[2]=N.w>0?-N.m*g:0;}

    const A=M.n[iDmpR],B=M.n[iDmpB];
    const d=sub(B.p,A.p),L=len(d)||1e-9,u=mul(d,1/L);
    const rel=dot(sub(B.v,A.v),u);
    const Fk=M.springF0+kS*(M.damperL0-L);
    const Fc=-(rel<0?cB:cR)*rel;
    let F=Fk+Fc; if(F<0)F=0;
    A.f=add(A.f,mul(u,-F));
    Fs=Fk; Fd=Fc;

    const tr=M.n[iW].p[2]-z0;
    if(tr>S.bsU){const x=tr-S.bsU;M.n[iW].f[2]-=kBS*x*x/20;}
    if(tr<-S.bsD){const x=-S.bsD-tr;M.n[iW].f[2]+=kBS*x*x/20;}

    const mm=metrics(M,axis);
    pen=rz-mm.cp[2];
    if(pen>0){
      const vz=M.n[iW].v[2];
      let fz=kT*pen+cT*(rzv-vz); if(fz<0)fz=0;
      M.n[iW].f[2]+=fz; Ft=fz;
    }else Ft=0;

    for(let k=0;k<M.n.length;k++){
      const N=M.n[k];if(N.w<=0)continue;
      N.v[0]+=N.f[0]*h/N.m;N.v[1]+=N.f[1]*h/N.m;N.v[2]+=N.f[2]*h/N.m;
      const sp=Math.hypot(N.v[0],N.v[1],N.v[2]);
      if(sp>2e4){const q=2e4/sp;N.v[0]*=q;N.v[1]*=q;N.v[2]*=q;}
      N.pp[0]=N.p[0];N.pp[1]=N.p[1];N.pp[2]=N.p[2];
      N.p[0]+=N.v[0]*h;N.p[1]+=N.v[1]*h;N.p[2]+=N.v[2]*h;
    }

    for(let it=0;it<12;it++) sweepProj(M,null);

    for(let k=0;k<M.n.length;k++){
      const N=M.n[k];if(N.w<=0)continue;
      const nv=[(N.p[0]-N.pp[0])/h,(N.p[1]-N.pp[1])/h,(N.p[2]-N.pp[2])/h];
      if(k===iW)accz=(nv[2]-N.v[2])/h;
      N.v[0]=nv[0]*0.99995;N.v[1]=nv[1]*0.99995;N.v[2]=nv[2]*0.99995;
    }
  }
  M.res=residual(M,null);M.iter=12*NS;
  return{load:Ft/FS,fs:Fs/FS,fd:Fd/FS,pen:pen,acc:accz/1000,road:roadSignal(tSim)};
}

/* ================================ 7. 全车多体仿真管理体系 ================================ */
const SIM={
  FR:null, FL:null, RR:null, RL:null,
  mFR:null, mFL:null, mRR:null, mRL:null,
  swF:null, swR:null, geoF:null, geoR:null, limF:[-80,80], limR:[-80,80],
  dirtyGeom:true, dirtySweep:true, lastSweep:0, rc2:null, trace:[],
  qsRes: null
};

function rebuild(){
  SIM.FR=buildMech('front'); SIM.FL=buildMech('front');
  SIM.RR=buildMech('rear');  SIM.RL=buildMech('rear');
  SIM.dirtyGeom=true; SIM.dirtySweep=true; SIM.trace=[];
  refreshDerived(true);
}

function refreshDerived(full){
  const stFR=saveState(SIM.FR), stFL=saveState(SIM.FL);
  const stRR=saveState(SIM.RR), stRL=saveState(SIM.RL);
  if(full||!SIM.geoF) SIM.geoF = findLimits(SIM.FR, 0, 'front');
  if(full||!SIM.geoR) SIM.geoR = findLimits(SIM.RR, 0, 'rear');
  
  S.trMax = Math.min(SIM.geoF[1], SIM.geoR[1], S.bsU+10);
  S.trMin = Math.max(SIM.geoF[0], SIM.geoR[0], -(S.bsD+10));
  SIM.limF = [S.trMin, S.trMax]; SIM.limR = [S.trMin, S.trMax];
  S.travel = clamp(S.travel, S.trMin, S.trMax);
  
  SIM.swF = runSweep(SIM.FR, S.rack, SIM.limF, 45, 'front');
  SIM.swR = runSweep(SIM.RR, 0, SIM.limR, 45, 'rear');
  SIM.mrRefF = Math.max(0.05, sampleSweep(SIM.swF, 0, "mr") || 0.75);
  SIM.mrRefR = Math.max(0.05, sampleSweep(SIM.swR, 0, "mr") || 0.75);
  
  const sprNF = S.front.mS*9.81, corNF = (S.front.mS+unsprungMass('front'))*9.81;
  [SIM.FR, SIM.FL].forEach(m=>{ m.springF0 = sprNF/SIM.mrRefF*FS; m.damperL0 = m.damper.Ld; });
  const sprNR = S.rear.mS*9.81, corNR = (S.rear.mS+unsprungMass('rear'))*9.81;
  [SIM.RR, SIM.RL].forEach(m=>{ m.springF0 = sprNR/SIM.mrRefR*FS; m.damperL0 = m.damper.Ld; });

  resetMech(SIM.FR); setChassis(SIM.FR, 0, 'front'); driveTo(SIM.FR, SIM.FR.n[SIM.FR.idx.WC].p0[2], 0, 'front');
  resetMech(SIM.RR); setChassis(SIM.RR, 0, 'rear');  driveTo(SIM.RR, SIM.RR.n[SIM.RR.idx.WC].p0[2], 0, 'rear');
  
  const m0F=metrics(SIM.FR, 'front'), m0R=metrics(SIM.RR, 'rear');
  const rzF = m0F.cp[2] + corNF/S.front.kT; SIM.FR.roadZ0=rzF; SIM.FL.roadZ0=rzF;
  const rzR = m0R.cp[2] + corNR/S.rear.kT;  SIM.RR.roadZ0=rzR; SIM.RL.roadZ0=rzR;
  
  loadState(SIM.FR, stFR); loadState(SIM.FL, stFL);
  loadState(SIM.RR, stRR); loadState(SIM.RL, stRL);
  SIM.qsRes = solveQuasiStatic();
  SIM.dirtySweep=true;
}

function rollOffset(half, deg){return (half||790)*Math.tan((deg!==undefined?deg:S.roll)*D2R);}
function travelR(half, deg){return clamp(S.travel+rollOffset(half,deg),S.trMin,S.trMax);}
function travelL(half, deg){return clamp(S.travel-rollOffset(half,deg),S.trMin,S.trMax);}

function simulate(dt){
  if(TRK.active){trackStep(dt);return;}
  if(STAGE.open){requestAnimationFrame(loop);return;}   // 舞台打开时挂起主渲染（省帧率）
  if((typeof SLOPE_STAGE !== 'undefined' && SLOPE_STAGE.active) || (typeof SKIDPAD_STAGE !== 'undefined' && SKIDPAD_STAGE.active)){requestAnimationFrame(loop);return;} // 爬坡舞台打开时挂起主仿真，避免双写 SIM
  const MF=SIM.FR, NF=SIM.FL, MR=SIM.RR, NR=SIM.RL;
  if(S.mode==="kin"){
    const z0F=MF.n[MF.idx.WC].p0[2], z0R=MR.n[MR.idx.WC].p0[2];
    driveTo(MF, z0F+travelR(SIM.halfF), S.rack, 'front'); SIM.mFR = metrics(MF, 'front');
    driveTo(MR, z0R+travelR(SIM.halfR), 0, 'rear');       SIM.mRR = metrics(MR, 'rear');
    
    if(S.show.mirror){
      driveTo(NF, z0F+travelL(SIM.halfF), -S.rack, 'front'); SIM.mFL = metrics(NF, 'front');
      driveTo(NR, z0R+travelL(SIM.halfR), 0, 'rear');        SIM.mRL = metrics(NR, 'rear');
    }else{SIM.mFL=null; SIM.mRL=null;}
    S.dyn.on=false;
  }else if(S.mode==="quasi"){
    const z0F=MF.n[MF.idx.WC].p0[2], z0R=MR.n[MR.idx.WC].p0[2];
    const rDeg = SIM.qsRes ? SIM.qsRes.rollDeg : 0;
    driveTo(MF, z0F+travelR(SIM.halfF, rDeg), S.rack, 'front'); SIM.mFR = metrics(MF, 'front');
    driveTo(MR, z0R+travelR(SIM.halfR, rDeg), 0, 'rear');       SIM.mRR = metrics(MR, 'rear');
    if(S.show.mirror){
      driveTo(NF, z0F+travelL(SIM.halfF, rDeg), -S.rack, 'front'); SIM.mFL = metrics(NF, 'front');
      driveTo(NR, z0R+travelL(SIM.halfR, rDeg), 0, 'rear');        SIM.mRL = metrics(NR, 'rear');
    }else{SIM.mFL=null; SIM.mRL=null;}
    S.dyn.on=false;
  }else{
    const rF=stepDyn(MF, dt, S.rack, S.simT, 'front'); SIM.mFR=metrics(MF, 'front');
    const rR=stepDyn(MR, dt, 0, S.simT, 'rear');       SIM.mRR=metrics(MR, 'rear');
    S.dyn={on:true,load:rF.load,fs:rF.fs,fd:rF.fd,pen:rF.pen,acc:rF.acc,road:rF.road,z:SIM.mFR.tr};
    if(S.show.mirror){
      stepDyn(NF, dt, -S.rack, S.simT, 'front'); SIM.mFL=metrics(NF, 'front');
      stepDyn(NR, dt, 0, S.simT, 'rear');        SIM.mRL=metrics(NR, 'rear');
    }else{SIM.mFL=null; SIM.mRL=null;}
    SIM.trace.push({t:S.simT,tr:SIM.mFR.tr,load:rF.load,fs:rF.fs,fd:rF.fd,road:rF.road});
    if(SIM.trace.length>1400)SIM.trace.shift();
  }
  SIM.halfF = SIM.mFR?abs(SIM.mFR.cp[0]):790;
  SIM.halfR = SIM.mRR?abs(SIM.mRR.cp[0]):790;
  
  SIM.rc2=null;
  const isF = S.axis==='front', mmR=isF?SIM.mFR:SIM.mRR, mmL=isF?SIM.mFL:SIM.mRL;
  if(mmR&&mmL&&mmR.ic&&mmL.ic){
    const a=[mmR.cp[0],mmR.cp[2]], ad=[mmR.ic[0]-a[0],mmR.ic[1]-a[1]];
    const b=[-mmL.cp[0],mmL.cp[2]], bd=[-mmL.ic[0]-b[0],mmL.ic[1]-b[1]];
    SIM.rc2=isect2(a,ad,b,bd);
  }
  SIM.qsRes = solveQuasiStatic();
}

function takeBaselineSnapshot(){
  S.baseline = {
    front: deepClone(S.front),
    rear: deepClone(S.rear),
    swF: deepClone(SIM.swF),
    swR: deepClone(SIM.swR),
    qsRes: deepClone(SIM.qsRes)
  };
  S.hasBaseline = true;
  document.getElementById("tbBase").textContent = "已锁定 (双线比对)";
  document.getElementById("tbBase").className = "a";
}
function clearBaselineSnapshot(){
  S.baseline = null;
  S.hasBaseline = false;
  document.getElementById("tbBase").textContent = "未锁定 (无比对)";
  document.getElementById("tbBase").className = "";
}

/* ================================ 8. 渲染色彩与全局装配 ================================ */
/* 双主题画布调色板：浅色（奶杏米白基底）/ 深色（深普鲁士蓝灰基底），
   数据分类专属映射：普鲁士蓝=主操作/速比 · 陶土棕=外倾/转向节 · 鼠尾灰绿=前束/拉杆 ·
   蜜橘赭=摇臂/弹性 · 灰薰紫=轨迹 · 雾蓝灰=稳定杆 · 暗铜金=瞬心 · 酒红=固定点/力 */
const PAL={
light:{bg:"#F5EFE4",grid:"#E9DFCE",grid2:"#DCD0BA",axis:"#C6B89F",
 rig:"#8C96A2",rigArm:"#6E7883",arm:"rgba(64,90,120,0.05)",
 strut:"#405A78",rocker:"#B98A4F",rockerF:"rgba(185,138,79,0.14)",
 ela:"#B98A4F",elaF:"rgba(185,138,79,0.10)",
 node:"#405A78",nodeFix:"#943948",nodeSel:"#292E36",
 knu:"#A66B58",knuF:"rgba(166,107,88,0.08)",
 tire:"#7C828B",tread:"#5C626B",rim:"#9A9FA7",disc:"#8A9098",cal:"#B07A52",
 kp:"#943948",kpsw:"rgba(148,57,72,0.14)",kpg:"#943948",
 tie:"#7A8C7E",rack:"#8A9098",
 chas:"#A9AEB5",chas2:"#B9BDC3",
 gnd:"#C4BBA9",path:"#8B7A9E",pathC:"#6E8F77",pathK:"#B98A4F",
 ic:"#C98C65",rc:"#6E8F77",dim:"#9A9FA7",dimT:"#5C626B",
 arb:"#637B94",frc:"#943948",txt:"#292E36",txt2:"#5C626B",txt3:"#9A9FA7",base:"#A9AEB5"},
dark:{bg:"#111621",grid:"#1C2432",grid2:"#273246",axis:"#3A4658",
 rig:"#8C96A2",rigArm:"#A5AFBB",arm:"rgba(165,175,187,0.06)",
 strut:"#8FB0D4",rocker:"#E0BE8E",rockerF:"rgba(224,190,142,0.14)",
 ela:"#E0BE8E",elaF:"rgba(224,190,142,0.10)",
 node:"#8FB0D4",nodeFix:"#D27886",nodeSel:"#F2EDE4",
 knu:"#D89A83",knuF:"rgba(216,154,131,0.08)",
 tire:"#5A6470",tread:"#383F47",rim:"#76828F",disc:"#636E7A",cal:"#B07A52",
 kp:"#D27886",kpsw:"rgba(210,120,134,0.16)",kpg:"#D27886",
 tie:"#A3BCA9",rack:"#4A5663",
 chas:"#3D4752",chas2:"#2F3740",
 gnd:"#363E46",path:"#B3A3C6",pathC:"#9CC4A8",pathK:"#E0BE8E",
 ic:"#DDAE85",rc:"#9CC4A8",dim:"#7E7A70",dimT:"#BAB3A6",
 arb:"#96B1C6",frc:"#D27886",txt:"#F2EDE4",txt2:"#BAB3A6",txt3:"#7E7A70",base:"#6A7280"}
};
const C=Object.assign({},PAL.dark);

const L3=(sc,a,b,c,w,d,al)=>sc.push({k:"l",a:a,b:b,c:c,w:w||1,d:d,al:al});
const PL=(sc,pts,c,w,d,f,al)=>sc.push({k:"p",pts:pts,c:c,w:w||1,d:d,f:f,al:al});
const TX=(sc,p,s,c,dx,dy,sz)=>sc.push({k:"t",p:p,s:s,c:c,dx:dx||0,dy:dy||0,sz:sz||9});
const ND=(sc,p,fix,id,zh,sx,axis)=>sc.push({k:"n",p:p,fix:fix,id:id,zh:zh,sx:sx||1,axis:axis});

/* F-41（2026-08-30）：circPts/cylinder/springPts 曾有前后两份定义（后者覆盖
   前者，改错份即白改）。保留后一组（cylinder 带 fillCol 超集），此处仅注释。 */

const SYSTEM_COLORS={
  bg:"#05070a",grid:"#12161c",grid2:"#1a212a",axis:"#242d38",
  frameMain:"#7a8d9f", frameSec:"#4d5e6e", frameDiag:"#3b4855", frameNode:"#e0a040",
  swRim:"#23282f", swGrip:"#181b20", swHubBlue:"#0099ff", swHubPlate:"#2fa9d6",
  colShaft:"#c8d2dc", uJointGold:"#f1c40f", rackBody:"#3e4751", rackClevis:"#5a6775",
  tie:"#43c9c0", bellows:"#15191d",
  rig:"#808e9d", rigArm:"#98abbd", arm:"rgba(140,165,190,0.06)",
  strut:"#2fa9d6", rocker:"#d9a238", rockerF:"rgba(217,162,56,0.25)",
  spring:"#f39c12", damper:"#5c6b77", arb:"#7cae8f",
  knu:"#36bca8", knuF:"rgba(54,188,168,0.10)",
  tire:"#404852", tread:"#22272e", rim:"#6d7987", kp:"#e0603f",
  motor:"#22425d", motorBody:"#15293a", diff:"#3c566e", shaft:"#e67e22", cvBoot:"#15191d",
  caliper:"#d24d3e", caliperPin:"#e67e22", disc:"#95a5a6", discSlot:"#3b464f",
  masterCyl:"#d9a238", brakeLine:"#b0bcc6", hose:"#1b1f23"
};

/* ================================ 实体着色（按零件/实体分色） ================================
   开关 S.show.entityColor=1 时，用 ENTITY_COLORS 覆盖 SYSTEM_COLORS 逐实体分色；
   关闭时完全回退系统分色。EC(key, fallback) 为统一入口。 */
const ENTITY_COLORS={
  frameMain:"#9fb0c0", frameSec:"#5d6f81", frameDiag:"#42536a", frameNode:"#e8b84b",
  lca:"#e0704f", lcaFill:"rgba(224,112,79,0.14)",
  uca:"#5b8fd6", ucaFill:"rgba(91,143,214,0.14)",
  knu:"#3ec3a0", knuFill:"rgba(62,195,160,0.12)",
  rocker:"#e3a03f", rockerFill:"rgba(227,160,63,0.18)",
  strut:"#a9c1dd", spring:"#e68a35", damper:"#8e9cab",
  arb:"#7cae8f", tierod:"#43c9c0", kp:"#e0603f", rig:"#8d9aa8",
  shaft:"#e67e22", cvBoot:"#3d4a57", disc:"#aebbc4", discSlot:"#5a6a76",
  caliper:"#d24d3e", hose:"#b0bcc6",
  tire:"#4c5763", tread:"#2b323b", rim:"#8d99a6",
  motor:"#2e4d6e", motorBody:"#1e3a54", diff:"#4a6b8a",
  rack:"#56636f", bellows:"#21262b", cols:"#c8d2dc", ujoint:"#f1c40f",
  swHub:"#0099ff", swPlate:"#2fa9d6", swRim:"#3a4149", swGrip:"#1a1e24",
  pedal:"#9aa7b5", masterCyl:"#d9a238", brakeLine:"#b0bcc6"
};
