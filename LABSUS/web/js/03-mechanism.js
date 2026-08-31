"use strict";
function buildMech(axis){
  const state = S[axis];
  const isDirect = state.arch === "direct";
  const n=[], idx={};
  HP_META.forEach((d,k)=>{
    const p=cpy(state.hp[d[0]] || [0,0,0]);
    n.push({id:d[0],zh:d[1],en:d[2],grp:d[3],fix:!!d[4],m:d[5],
            p:p,p0:cpy(p),pp:cpy(p),v:[0,0,0],w:d[4]?0:(d[5]>0?1/d[5]:0),f:[0,0,0]});
    idx[d[0]]=k;
  });

  const L=[
    {a:idx.LCA_F,b:idx.LBJ,id:"LCA_F-LBJ",type:"R",grp:"lca"},
    {a:idx.LCA_R,b:idx.LBJ,id:"LCA_R-LBJ",type:"R",grp:"lca"},
    {a:idx.LCA_F,b:idx.LCA_R,id:"LCA_AXIS",type:"R",grp:"lca"},
    {a:idx.UCA_F,b:idx.UBJ,id:"UCA_F-UBJ",type:"R",grp:"uca"},
    {a:idx.UCA_R,b:idx.UBJ,id:"UCA_R-UBJ",type:"R",grp:"uca"},
    {a:idx.UCA_F,b:idx.UCA_R,id:"UCA_AXIS",type:"R",grp:"uca"},
    {a:idx.LBJ,b:idx.UBJ,id:"KINGPIN",type:"R",grp:"knuckle"},
    {a:idx.LBJ,b:idx.WC,id:"KNK_L",type:"R",grp:"knuckle"},
    {a:idx.UBJ,b:idx.WC,id:"KNK_U",type:"R",grp:"knuckle"},
    {a:idx.LBJ,b:idx.TRO,id:"KNK_T1",type:"R",grp:"knuckle"},
    {a:idx.UBJ,b:idx.TRO,id:"KNK_T2",type:"R",grp:"knuckle"},
    {a:idx.WC, b:idx.TRO,id:"KNK_T3",type:"R",grp:"knuckle"},
    {a:idx.RACK,b:idx.TRO,id:"TIEROD",type:"R",grp:"steer"}
  ];

  /* 补全核心刚性拓扑网格，构成刚体力学传递路径 */
  const att = state.strutOutAttach || "lca";
  const baseF = att==="lca" ? idx.LCA_F : idx.UCA_F;
  const baseR = att==="lca" ? idx.LCA_R : idx.UCA_R;
  const baseB = att==="lca" ? idx.LBJ : idx.UBJ;
  
  L.push(
    {a:baseF, b:idx.STRUT_OUT, id:"ATT_F-ST_O", type:"R", grp:att},
    {a:baseR, b:idx.STRUT_OUT, id:"ATT_R-ST_O", type:"R", grp:att},
    {a:baseB, b:idx.STRUT_OUT, id:"ATT_B-ST_O", type:"R", grp:att}
  );

  if(isDirect){
    L.push({a:idx.STRUT_OUT, b:idx.DMP_BODY, id:"DIRECT_COILOVER", type:"E", grp:"damper"});
  } else {
    L.push(
      {a:idx.STRUT_OUT, b:idx.STRUT_IN, id:"STRUT_ROD", type:"R", grp:"strut"},
      {a:idx.RCK_DMP,  b:idx.DMP_BODY, id:"INBOARD_COIL", type:"E", grp:"damper"},
      // Rocker 刚体成型
      {a:idx.RCK_AX_A, b:idx.STRUT_IN, id:"RA-SI", type:"R", grp:"rocker"},
      {a:idx.RCK_AX_B, b:idx.STRUT_IN, id:"RB-SI", type:"R", grp:"rocker"},
      {a:idx.RCK_AX_A, b:idx.RCK_DMP,  id:"RA-RD", type:"R", grp:"rocker"},
      {a:idx.RCK_AX_B, b:idx.RCK_DMP,  id:"RB-RD", type:"R", grp:"rocker"},
      {a:idx.STRUT_IN, b:idx.RCK_DMP,  id:"SI-RD", type:"R", grp:"rocker"}
    );
  }

  L.forEach(l=>{ l.L0=dst(n[l.a].p,n[l.b].p); l.Ld=l.L0; });
  const tie=L.find(l=>l.grp==="steer");
  tie.L0=tie.Ld+state.tieTrim;

  function hinge(name, axA, axB, driverId, slaveIds){
    const o=n[idx[axA]].p0;
    const allMembers=[driverId].concat(slaveIds||[]);
    return{
      kind:"hinge",name:name,axA:idx[axA],axB:idx[axB],
      driverId:idx[driverId], driverRel:sub(n[idx[driverId]].p0,o),
      ids:allMembers.map(m=>idx[m]), rel:allMembers.map(m=>sub(n[idx[m]].p0,o))
    };
  }
  function freeBody(name,members){
    const ids=members.map(m=>idx[m]);
    const wt=ids.map(k=>Math.max(n[k].m,1e-3));
    let ws=0,c=[0,0,0];
    ids.forEach((k,j)=>{ws+=wt[j];c=add(c,mul(n[k].p0,wt[j]));});
    c=mul(c,1/ws);
    return{kind:"body",name:name,ids:ids,wt:wt,ws:ws,rc:c,
           rel:ids.map(k=>sub(n[k].p0,c)),q:qId()};
  }

  const cl=[
    hinge("LCA","LCA_F","LCA_R","LBJ", state.strutOutAttach==="lca"?["STRUT_OUT"]:[]),
    hinge("UCA","UCA_F","UCA_R","UBJ", state.strutOutAttach==="uca"?["STRUT_OUT"]:[]),
    freeBody("KNUCKLE",["LBJ","UBJ","WC","TRO"])
  ];

  let rocker = null;
  if(!isDirect){
    const oRck=n[idx.RCK_AX_A].p0;
    const relIn=sub(n[idx.STRUT_IN].p0,oRck);
    const relDmp=sub(n[idx.RCK_DMP].p0,oRck);
    const strutRod=L.find(l=>l.id==="STRUT_ROD");

    rocker={
      iAxA:idx.RCK_AX_A, iAxB:idx.RCK_AX_B,
      iInNode:idx.STRUT_IN, iDmpNode:idx.RCK_DMP, iOutNode:idx.STRUT_OUT,
      relIn:relIn, relDmp:relDmp, rodL0:strutRod?strutRod.L0:100, angle:0,
      lastTheta:null   /* F-04（2026-08-30）：摇臂根分支连续性——记录上一步 θ 选最近根 */
    };
  }

  const camb=state.cam0*D2R, toe=state.toe0*D2R;
  const axW=nrm([cos(toe)*cos(camb),sin(toe),-sin(camb)]);
  const damper=L.find(l=>l.grp==="damper");

  const M={
    n:n, idx:idx, L:L, cl:cl, tie:tie, rocker:rocker,
    damper:damper, damperL0:damper?damper.Ld:0, axL:axW,
    nFree:n.filter(x=>!x.fix).length,
    nRig:L.filter(l=>l.type==="R").length,
    nEla:L.filter(l=>l.type==="E").length,
    nCons:L.filter(l=>l.type==="R"&&(!n[l.a].fix||!n[l.b].fix)).length,
    res:0,iter:0,ms:0,ok:true, springF0:0
  };
  M.dof=3*M.nFree-M.nCons;
  return M;
}

function projLink(M,l){
  const A=M.n[l.a],B=M.n[l.b];
  const wa=A.w,wb=B.w,ws=wa+wb; if(ws<=0)return 0;
  let dx=B.p[0]-A.p[0],dy=B.p[1]-A.p[1],dz=B.p[2]-A.p[2];
  const d=Math.hypot(dx,dy,dz)||1e-12,C=d-l.L0,s=C/(d*ws);
  if(wa>0){A.p[0]+=dx*s*wa;A.p[1]+=dy*s*wa;A.p[2]+=dz*s*wa;}
  if(wb>0){B.p[0]-=dx*s*wb;B.p[1]-=dy*s*wb;B.p[2]-=dz*s*wb;}
  return abs(C);
}

function projHinge(M,c){
  const o=M.n[c.axA].p, b=M.n[c.axB].p, ax=nrm(sub(b,o));
  const r=c.driverRel, rp=dot(r,ax), rq=sub(r,mul(ax,rp));
  const d=sub(M.n[c.driverId].p,o);
  const cs=dot(rq,d), sn=dot(cross(ax,rq),d);
  const th=atan2(sn,cs),ct=cos(th),st=sin(th);
  for(let k=0;k<c.ids.length;k++){
    const rk=c.rel[k], rpk=dot(rk,ax), rqk=sub(rk,mul(ax,rpk));
    const q=add(add(mul(ax,rpk),mul(rqk,ct)),mul(cross(ax,rqk),st));
    const P=M.n[c.ids[k]].p;
    P[0]=o[0]+q[0];P[1]=o[1]+q[1];P[2]=o[2]+q[2];
  }
}

function projBody(M,c){
  let cx=0,cy=0,cz=0;
  for(let k=0;k<c.ids.length;k++){const P=M.n[c.ids[k]].p,w=c.wt[k];cx+=P[0]*w;cy+=P[1]*w;cz+=P[2]*w;}
  cx/=c.ws;cy/=c.ws;cz/=c.ws;
  const A=[0,0,0,0,0,0,0,0,0];
  for(let k=0;k<c.ids.length;k++){
    const P=M.n[c.ids[k]].p,w=c.wt[k],r=c.rel[k];
    const px=(P[0]-cx)*w,py=(P[1]-cy)*w,pz=(P[2]-cz)*w;
    A[0]+=px*r[0];A[1]+=px*r[1];A[2]+=px*r[2];
    A[3]+=py*r[0];A[4]+=py*r[1];A[5]+=py*r[2];
    A[6]+=pz*r[0];A[7]+=pz*r[1];A[8]+=pz*r[2];
  }
  c.q=polarQ(A,c.q,14);
  const R=qM(c.q);
  for(let k=0;k<c.ids.length;k++){
    const P=M.n[c.ids[k]].p,r=c.rel[k];
    P[0]=cx+R[0]*r[0]+R[1]*r[1]+R[2]*r[2];
    P[1]=cy+R[3]*r[0]+R[4]*r[1]+R[5]*r[2];
    P[2]=cz+R[6]*r[0]+R[7]*r[1]+R[8]*r[2];
  }
  c.R=R;c.c=[cx,cy,cz];
}

function projRockerStrut(M, rck){
  const oAxis=M.n[rck.iAxA].p, bAxis=M.n[rck.iAxB].p, uAxis=nrm(sub(bAxis,oAxis)), pOut=M.n[rck.iOutNode].p;
  const r0=rck.relIn, rPara=mul(uAxis,dot(r0,uAxis)), rPerp=sub(r0,rPara), vPerp=cross(uAxis,rPerp), R_r=len(rPerp);
  const d0=sub(add(oAxis,rPara),pOut);
  const A=2*dot(d0,rPerp), B=2*dot(d0,vPerp), C=rck.rodL0*rck.rodL0 - dot(d0,d0) - R_r*R_r;
  const hyp=Math.hypot(A, B);
  if(hyp<1e-9) return;
  const cosPsi=clamp(C/hyp, -1, 1), psi=acos(cosPsi), phi=atan2(B, A);
  /* F-04（2026-08-30）：摇臂双根分支连续性——旧实现 `branch=phi>=0?1:-1`
     仅按当前相位选支，摇臂跨 φ=0 或近直线位形时 θ 瞬间跳支（STRUT_IN/
     RCK_DMP 突跳）。改为记录上一步 θ，从 θ=φ±ψ 两根中选**最近根**。
     rck.lastTheta 初始化为 null（首帧用旧相位规则）。 */
  const thA=phi-psi, thB=phi+psi;
  const refTheta = (rck.lastTheta !== null && rck.lastTheta !== undefined) ? rck.lastTheta : 0.0;
  const dA=Math.abs(((thA-refTheta+PI)%(2*PI)+2*PI)%(2*PI)-PI);
  const dB=Math.abs(((thB-refTheta+PI)%(2*PI)+2*PI)%(2*PI)-PI);
  const theta=(dA<=dB?thA:thB);
  rck.lastTheta=theta;
  rck.angle=theta;
  const ct=cos(theta), st=sin(theta);
  const pIn=add(oAxis,add(rPara,add(mul(rPerp,ct),mul(vPerp,st))));
  const pinN=M.n[rck.iInNode].p; pinN[0]=pIn[0]; pinN[1]=pIn[1]; pinN[2]=pIn[2];

  const r0D=rck.relDmp, rParaD=mul(uAxis,dot(r0D,uAxis)), rPerpD=sub(r0D,rParaD), vPerpD=cross(uAxis,rPerpD);
  const pDmp=add(oAxis,add(rParaD,add(mul(rPerpD,ct),mul(vPerpD,st))));
  const pdmpN=M.n[rck.iDmpNode].p; pdmpN[0]=pDmp[0]; pdmpN[1]=pDmp[1]; pdmpN[2]=pDmp[2];
}

function residual(M,drvZ){
  let r=0;
  const coreLinks=["LCA_F-LBJ","LCA_R-LBJ","UCA_F-UBJ","UCA_R-UBJ","KINGPIN","TIEROD","KNK_L","KNK_U","KNK_T1",
                   "ATT_F-ST_O", "ATT_R-ST_O", "ATT_B-ST_O", "RA-SI", "RB-SI", "RA-RD", "RB-RD", "SI-RD"];
  for(let k=0;k<M.L.length;k++){
    const l=M.L[k];if(l.type!=="R"||!coreLinks.includes(l.id))continue;
    const d=abs(dst(M.n[l.a].p,M.n[l.b].p)-l.L0);
    if(!(d<=r))r=d;   /* F-01（2026-08-30）：NaN 安全写法——`if(d>r)` 对 NaN 恒 false，
                         发散解曾以 res=0、ok=true 身份静默通过校验并全链路污染 */
  }
  if(drvZ!==null&&drvZ!==undefined) r=Math.max(r,abs(M.n[M.idx.WC].p[2]-drvZ));
  return r;
}

function sweepProj(M,drvZ){
  if(drvZ!==null&&drvZ!==undefined) M.n[M.idx.WC].p[2]=drvZ;
  projLink(M,M.tie); projHinge(M,M.cl[0]); projHinge(M,M.cl[1]); projBody(M,M.cl[2]);
  if(M.rocker) projRockerStrut(M,M.rocker);
}

function solveKin(M,drvZ,maxIt,tol){
  maxIt=maxIt||260; tol=tol||2e-7;
  const t0=performance.now(); let it=0,res=1;
  for(;it<maxIt;it++){
    sweepProj(M,drvZ);
    if((it&3)===3){res=residual(M,drvZ); if(res<tol){it++;break;}}
  }
  res=residual(M,drvZ);
  if(!isFinite(res))res=Infinity;   /* F-01/F-05：NaN 残差显式升级为 ∞，
                                       消费方（findLimits/报告）按"未收敛"处理 */
  M.res=res;M.iter=it;M.ms=performance.now()-t0;M.ok=isFinite(res)&&res<0.025;
  return res;
}

function setChassis(M,rack,axis){
  const state = S[axis];
  for(const d of HP_META){
    if(!d[4])continue;
    const N=M.n[M.idx[d[0]]];
    N.p[0]=state.hp[d[0]][0];N.p[1]=state.hp[d[0]][1];N.p[2]=state.hp[d[0]][2];
  }
  const R=M.n[M.idx.RACK]; R.p[0]-=rack;
}

function resetMech(M){
  M.n.forEach(N=>{N.p=cpy(N.p0);N.pp=cpy(N.p0);N.v=[0,0,0];});
  M.cl.forEach(c=>{if(c.kind==="body")c.q=qId();});
  if(M.rocker){ M.rocker.angle = 0.0; M.rocker.lastTheta = 0.0; }
}

function driveTo(M,targetZ,rack,axis){
  setChassis(M,rack,axis);
  const cur=M.n[M.idx.WC].p[2];
  const d=targetZ-cur, steps=Math.min(28,Math.max(1,Math.ceil(abs(d)/4)));
  for(let s=1;s<=steps;s++) solveKin(M,cur+d*s/steps,s===steps?260:40,2e-7);
  return M.res;
}

/* ================================ 3. 悬架高阶几何与运动学指标 ================================ */
function isect2(p1,d1,p2,d2){
  const den=d1[0]*d2[1]-d1[1]*d2[0];
  if(abs(den)<1e-12)return null;
  const t=((p2[0]-p1[0])*d2[1]-(p2[1]-p1[1])*d2[0])/den;
  return[p1[0]+d1[0]*t,p1[1]+d1[1]*t];
}
function axisAtY(a,b,y){const t=(y-a[1])/((b[1]-a[1])||1e-9);return lerp3(a,b,t);}

/* 横向稳定杆几何学解算 */
function arbGeom(lbj, state){
  const F=state.hp.LCA_F, B=state.hp.LBJ, t=state.arb.t;
  const P0=lerp3(F,B,t);
  const xa=P0[0], ay=F[1]+state.arb.dy, az=F[2]+state.arb.dz;
  const a=ay-P0[1];
  const E0=[xa,ay-a,az];
  const ldl=dst(E0,P0);
  const P=lerp3(F,lbj,t);
  const A=ay-P[1], Bz=az-P[2], R=Math.hypot(A,Bz);
  const K=(xa-P[0])*(xa-P[0])+A*A+Bz*Bz+a*a-ldl*ldl;
  const c=clamp(K/(2*a*R||1e-9),-1,1);
  const f0=atan2(Bz,A), sg=atan2(az-P0[2],ay-P0[1])>=0?1:-1;
  const psi=f0-sg*Math.acos(c);
  const E=[xa,ay-a*cos(psi),az-a*sin(psi)];
  return{xa:xa,ay:ay,az:az,a:a,ldl:ldl,P:P,P0:P0,E:E,psi:psi,ok:abs(K/(2*a*R||1e-9))<=1};
}

function arbRate(mrArb, state){
  const d=state.arb.d; if(d<=0.5)return{k:0,J:0,kt:0};
  const J=PI*Math.pow(d,4)/32, g=arbGeom(state.hp.LBJ, state);
  const L=2*g.xa;
  const kt=state.arb.G*J/L;
  return{k:kt/(g.a*g.a)*mrArb*mrArb, J:J, kt:kt, a:g.a, L:L};
}

/* 阿克曼转向解算 */
function ackermann(axis){
  const R = axis==='front' ? SIM.mFR : SIM.mRR;
  const L = axis==='front' ? SIM.mFL : SIM.mRL;
  if(!R) return null;
  const dR = -R.toe, dL = L ? L.toe : null;
  const track = abs(R.cp[0]) * 2;   /* F-14（2026-08-30）：旧 `(L?2:2)` 恒为 2 的笔误，实为双侧轮距 */
  let pct=null, rad=null, icr=null;
  if(L){
    const inner = dR>0 ? dR : dL, outer = dR>0 ? dL : dR;
    if(abs(inner)>0.8 && abs(outer)>0.8 && inner*outer>0){
      const d = 1/Math.tan(abs(outer)*D2R) - 1/Math.tan(abs(inner)*D2R);
      pct = d / ((abs(R.cp[0])+abs(L.cp[0]))/S.wb) * 100;
      rad = S.wb / Math.tan((abs(inner)+abs(outer))/2*D2R) / 1000;
    }
    const pR=[R.cp[0], R.cp[1]], aR=[R.ax[0], R.ax[1]];
    const pL=[-L.cp[0], L.cp[1]], aL=[-L.ax[0], L.ax[1]];
    icr = isect2(pR, aR, pL, aL);
  }
  return {dR:dR, dL:dL, pct:pct, R:rad, icr:icr, track:track};
}

function metrics(M, axis){
  const state = S[axis];
  const P=id=>M.n[M.idx[id]].p;
  const KN=M.cl[2], R=KN.R||qM(KN.q);
  const wc=cpy(P("WC")),lbj=cpy(P("LBJ")),ubj=cpy(P("UBJ")),tro=cpy(P("TRO"));
  const strutIn=cpy(P("STRUT_IN")), strutOut=cpy(P("STRUT_OUT"));
  const rckDmp=cpy(P("RCK_DMP")), dmpB=cpy(P("DMP_BODY"));

  const ax=nrm(mApply(R,M.axL));
  const cam=-Math.asin(clamp(ax[2],-1,1))*R2D;
  const toe=atan2(ax[1],ax[0])*R2D;

  const rad=nrm(sub([0,0,1],mul(ax,dot([0,0,1],ax))));
  const cp=sub(wc,mul(rad,state.tire.R));

  const dz=ubj[2]-lbj[2];
  const kpi=atan2(-(ubj[0]-lbj[0]),dz)*R2D;
  const cast=atan2(-(ubj[1]-lbj[1]),dz)*R2D;
  const t0=(cp[2]-ubj[2])/((lbj[2]-ubj[2])||1e-9);
  const kg=lerp3(ubj,lbj,t0);
  const scrub=cp[0]-kg[0];
  const trail=kg[1]-cp[1];

  const lp=axisAtY(state.hp.LCA_F,state.hp.LCA_R,wc[1]);
  const up=axisAtY(state.hp.UCA_F,state.hp.UCA_R,wc[1]);
  const ic=isect2([lp[0],lp[2]],[lbj[0]-lp[0],lbj[2]-lp[2]],[up[0],up[2]],[ubj[0]-up[0],ubj[2]-up[2]]);
  let rcH=null;
  if(ic){const r=isect2([cp[0],cp[2]],[ic[0]-cp[0],ic[1]-cp[2]],[0,0],[0,1]); if(r)rcH=r[1];}

  const ld=[state.hp.LCA_R[1]-state.hp.LCA_F[1],state.hp.LCA_R[2]-state.hp.LCA_F[2]];
  const ud=[state.hp.UCA_R[1]-state.hp.UCA_F[1],state.hp.UCA_R[2]-state.hp.UCA_F[2]];
  const svic=isect2([lbj[1],lbj[2]],ld,[ubj[1],ubj[2]],ud);
  let anti=null;
  if(svic){const dy=cp[1]-svic[0],dzz=svic[1]-cp[2];
    if(abs(dy)>1) anti=(dzz/dy)*S.brkF*(S.wb/S.hcg)*100;}

  const curDamperL = state.arch === "direct" ? dst(strutOut, dmpB) : dst(rckDmp, dmpB);
  const rockerDeg = M.rocker ? M.rocker.angle * R2D : 0;
  const ag = arbGeom(lbj, state);

  return{
    tr:wc[2]-M.n[M.idx.WC].p0[2],cam:cam,toe:toe,cast:cast,kpi:kpi,incl:kpi+cam,
    scrub:scrub,trail:trail,cp:cp,wc:wc,lbj:lbj,ubj:ubj,tro:tro,
    strutIn:strutIn,strutOut:strutOut,rckDmp:rckDmp,dmpB:dmpB,
    kg:kg,ax:ax,ic:ic,rcH:rcH,svic:svic,anti:anti,
    apsi:ag.psi*R2D, alz:ag.P[2],
    damperL:curDamperL, rockerDeg:rockerDeg, half:cp[0],steer:-toe,R:R
  };
}

/* ================================ 4. 扫掠分析与多维导数 ================================ */
function findLimits(M,rack,axis){
  /* F-05（2026-08-30）：driveTo 返回残差，NaN 时 `>0.035` 恒 false → 扫满
     ±120mm 把行程污染成全行程。显式 isFinite 判定，残差失稳即中断扫描。 */
  const z0=M.n[M.idx.WC].p0[2];let up=0,dn=0,bad=false;
  resetMech(M);setChassis(M,rack,axis);
  for(let t=2;t<=120;t+=2){const r=driveTo(M,z0+t,rack,axis);if(!isFinite(r)||r>0.035){if(!isFinite(r))bad=true;break;}up=t;}
  resetMech(M);setChassis(M,rack,axis);
  for(let t=2;t<=120;t+=2){const r=driveTo(M,z0-t,rack,axis);if(!isFinite(r)||r>0.035){if(!isFinite(r))bad=true;break;}dn=t;}
  resetMech(M);setChassis(M,rack,axis);
  if(bad)S.scanLimited={axis:axis,note:"行程扫描遇 NaN 残差，扫描中断"} ;
  return[-Math.max(40, dn-2), Math.max(40, up-2)];
}

function saveState(M){
  return{p:M.n.map(N=>cpy(N.p)),v:M.n.map(N=>cpy(N.v)),pp:M.n.map(N=>cpy(N.pp)),
         q:M.cl.map(c=>c.q?c.q.slice():null),rAngle:M.rocker?M.rocker.angle:0,
         rLastTheta:M.rocker?M.rocker.lastTheta:0};
}
function loadState(M,st){
  M.n.forEach((N,j)=>{N.p=cpy(st.p[j]);N.v=cpy(st.v[j]);N.pp=cpy(st.pp[j]);});
  M.cl.forEach((c,j)=>{if(st.q[j])c.q=st.q[j].slice();});
  if(M.rocker){
    if(st.rAngle!==undefined) M.rocker.angle=st.rAngle;
    if(st.rLastTheta!==undefined) M.rocker.lastTheta=st.rLastTheta;
  }
}

function runSweep(M,rack,lim,nS,axis){
  nS=nS||45;
  const st=saveState(M), state=S[axis], z0=M.n[M.idx.WC].p0[2], a=lim[0], b=lim[1], rows=[];
  resetMech(M);setChassis(M,rack,axis);driveTo(M,z0+a,rack,axis);
  for(let k=0;k<nS;k++){
    const tr=a+(b-a)*k/(nS-1);
    driveTo(M,z0+tr,rack,axis);
    const m=metrics(M,axis);m.trq=tr;rows.push(m);
  }
  for(let k=0;k<rows.length;k++){
    const k0=Math.max(0,k-1),k1=Math.min(rows.length-1,k+1);
    const dt=rows[k1].tr-rows[k0].tr||1e-9;
    rows[k].mr=-(rows[k1].damperL-rows[k0].damperL)/dt;
    rows[k].cg=(rows[k1].cam-rows[k0].cam)/dt*25;
    rows[k].bs=(rows[k1].toe-rows[k0].toe)/dt*25;
    rows[k].rRatio=(rows[k1].rockerDeg-rows[k0].rockerDeg)/dt;
    rows[k].kw=state.kS*rows[k].mr*rows[k].mr;
    rows[k].mra=(rows[k1].alz-rows[k0].alz)/dt;
  }
  loadState(M,st);
  return{rows:rows,min:a,max:b};
}

function sampleSweep(sw,tr,key){
  if(!sw||!sw.rows.length)return null;
  const R=sw.rows;
  if(tr<=R[0].tr)return R[0][key];
  if(tr>=R[R.length-1].tr)return R[R.length-1][key];
  for(let k=1;k<R.length;k++){
    if(tr<=R[k].tr){
      const t=(tr-R[k-1].tr)/((R[k].tr-R[k-1].tr)||1e-9);
      const a=R[k-1][key],b=R[k][key];
      return(a===null||b===null)?null:a+(b-a)*t;
    }
  }
  return R[R.length-1][key];
}

/* ================================ 5. 准静态载荷转移代数解算 ================================ */
function solveQuasiStatic(){
  const g = 9.81;
  const L = S.wb / 1000;
  const mS = S.mSprung, mT = S.mTotal;
  const mU_f = S.front.mU * 2, mU_r = S.rear.mU * 2;
  
  const b = L * (S.rear.mS / (S.front.mS + S.rear.mS));
  const a = L - b;
  
  const tf = (abs(S.front.hp.WC[0]) * 2) / 1000;
  const tr = (abs(S.rear.hp.WC[0]) * 2) / 1000;
  const huf = S.front.tire.R / 1000;
  const hur = S.rear.tire.R / 1000;
  const hs = S.hs / 1000;
  
  // 运动速比与轮端刚度初值（随行程迁移在迭代内更新）
  const mrF = SIM.mrRefF || 0.75, mrR = SIM.mrRefR || 0.78;
  const kwF0 = (S.front.kS * 1000) * mrF * mrF;
  const kwR0 = (S.rear.kS * 1000) * mrR * mrR;
  const arF = arbRate(0.55, S.front), arR = arbRate(0.55, S.rear);
  const kphi_arb_f = arF.k * 1000 * (tf * tf) / 2;
  const kphi_arb_r = arR.k * 1000 * (tr * tr) / 2;

  const F_aero = S.qs.aeroF;
  const Fzf0 = mS * g * (b / L) + mU_f * g + F_aero * S.qs.aeroBias;
  const Fzr0 = mS * g * (a / L) + mU_r * g + F_aero * (1 - S.qs.aeroBias);

  const Gy = S.qs.gy, Gx = S.qs.gx;
  const ay = Gy * g, ax = Gx * g;

  // —— 侧倾耦合迭代：RC 高度(zrc)取外侧压缩轮、侧倾刚度(kphi)取左右 kw 均值，均随行程迁移 ——
  // 迁移后 dFz_geo / dFz_elas 不再与 ay 线性齐次 → TLLTD 随 gy 真实变化（修复线性恒定观感）。
  const rcHAt=(sw,tr,f0)=>{ if(!sw||!sw.rows||!sw.rows.length)return f0;
    const v=sampleSweep(sw,tr,"rcH"); return (v===null||v===undefined||!isFinite(v))?f0:v; };
  const kwAt=(sw,tr,k0)=>{ if(!sw||!sw.rows||!sw.rows.length)return k0;
    const v=sampleSweep(sw,tr,"kw"); return (v===null||v===undefined||!isFinite(v)||v<=0)?k0:v*1000; };
  const zrcF0=((SIM.mFR?SIM.mFR.rcH:45)||45);   // mm @0 行程
  const zrcR0=((SIM.mRR?SIM.mRR.rcH:65)||65);
  let zrc_f=zrcF0/1000, zrc_r=zrcR0/1000;
  let kphi_f=0.5*kwF0*(tf*tf)+kphi_arb_f, kphi_r=0.5*kwR0*(tr*tr)+kphi_arb_r;
  let kphi_tot=kphi_f+kphi_r, rollAngleRad=0;
  for(let it=0;it<3;it++){
    const hra=zrc_f+(a/L)*(zrc_r-zrc_f);
    const hArm=Math.max(0.05,hs-hra);
    const denom=kphi_tot-mS*g*hArm;
    rollAngleRad=denom>100?(mS*ay*hArm)/denom:0;
    const dtF=rollAngleRad*abs(S.front.hp.WC[0]);   // 滚转角×半轮距 = 轮行程差 mm
    const dtR=rollAngleRad*abs(S.rear.hp.WC[0]);
    zrc_f=rcHAt(SIM.swF,dtF,zrcF0)/1000;            // 外侧（压缩侧）RC 高度
    zrc_r=rcHAt(SIM.swR,dtR,zrcR0)/1000;
    const kf=(kwAt(SIM.swF,dtF,kwF0)+kwAt(SIM.swF,-dtF,kwF0))/2;
    const kr=(kwAt(SIM.swR,dtR,kwR0)+kwAt(SIM.swR,-dtR,kwR0))/2;
    kphi_f=0.5*kf*(tf*tf)+kphi_arb_f;
    kphi_r=0.5*kr*(tr*tr)+kphi_arb_r;
    kphi_tot=kphi_f+kphi_r;
  }
  const hra=zrc_f+(a/L)*(zrc_r-zrc_f);
  const hArm=Math.max(0.05,hs-hra);
  const denom=kphi_tot-mS*g*hArm;
  rollAngleRad=denom>100?(mS*ay*hArm)/denom:0;
  const rollAngleDeg=rollAngleRad*R2D;
  const rollGrad=denom>100?((mS*g*hArm)/denom)*R2D:0;
  
  const dFz_u_f = mU_f * ay * (huf / tf);
  const dFz_u_r = mU_r * ay * (hur / tr);
  
  const dFz_geo_f = (mS * ay * (b / L)) * (zrc_f / tf);
  const dFz_geo_r = (mS * ay * (a / L)) * (zrc_r / tr);
  
  const dFz_elas_f = (kphi_f * rollAngleRad) / tf;
  const dFz_elas_r = (kphi_r * rollAngleRad) / tr;
  
  const dFz_f_tot = dFz_u_f + dFz_geo_f + dFz_elas_f;
  const dFz_r_tot = dFz_u_r + dFz_geo_r + dFz_elas_r;
  
  const sumTransfer = dFz_f_tot + dFz_r_tot;
  /* F-09（2026-08-30）：`sumTransfer>1` 使左转（gy<0，sum<0）恒 50%。
     改 |sum|>1；50% 占位仅用于 ay≈0（讲义第九讲钦定约定，保留）。 */
  const tlltd = Math.abs(sumTransfer) > 1 ? (dFz_f_tot / sumTransfer) * 100 : 50;
  const dFz_long = (mT * ax * (S.hcg / 1000)) / L;
  
  const sgnY = Gy >= 0 ? 1 : -1;
  const fzFL = Math.max(0, (Fzf0 - dFz_long) / 2 - dFz_f_tot * sgnY);
  const fzFR = Math.max(0, (Fzf0 - dFz_long) / 2 + dFz_f_tot * sgnY);
  const fzRL = Math.max(0, (Fzr0 + dFz_long) / 2 - dFz_r_tot * sgnY);
  const fzRR = Math.max(0, (Fzr0 + dFz_long) / 2 + dFz_r_tot * sgnY);
  
  return {
    rollDeg: rollAngleDeg, rollGrad: rollGrad,
    kphi_f: kphi_f * D2R, kphi_r: kphi_r * D2R, kphi_tot: kphi_tot * D2R,
    arb_share_f: (kphi_arb_f / kphi_f) * 100,
    arb_share_r: (kphi_arb_r / kphi_r) * 100,
    dFz_u_f: dFz_u_f, dFz_geo_f: dFz_geo_f, dFz_elas_f: dFz_elas_f, dFz_f_tot: dFz_f_tot,
    dFz_u_r: dFz_u_r, dFz_geo_r: dFz_geo_r, dFz_elas_r: dFz_elas_r, dFz_r_tot: dFz_r_tot,
    tlltd: tlltd,
    fz:{ FL: fzFL, FR: fzFR, RL: fzRL, RR: fzRR }
  };
}

/* ================================ 6. 动力学 (4-Post Rig 显式积分) ================================ */
const FS=1000;
function unsprungMass(axis){let s=0;HP_META.forEach(d=>{if(!d[4])s+=d[5];});return s;}
