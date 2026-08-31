"use strict";
function EC(key, fallback){
  if(!S.show.entityColor) return fallback;
  return ENTITY_COLORS[key] || fallback;
}

function circPts(c,ax,r,n,e1,e2){
  const u=e1||perpOf(ax),v=e2||cross(nrm(ax),u),o=[];
  for(let k=0;k<=n;k++){const a=2*PI*k/n;o.push(add(c,add(mul(u,r*cos(a)),mul(v,r*sin(a)))));}
  return o;
}
function cylinder(sc,a,b,r,col,w,nseg,fillCol){
  const ax=nrm(sub(b,a)),u=perpOf(ax),v=cross(ax,u);
  const cA=circPts(a,ax,r,nseg||14,u,v), cB=circPts(b,ax,r,nseg||14,u,v);
  PL(sc,cA,col,w||1,null,fillCol); PL(sc,cB,col,w||1,null,fillCol);
  for(let k=0;k<4;k++){const an=PI/4+k*PI/2;
    const o=add(mul(u,r*cos(an)),mul(v,r*sin(an)));
    L3(sc,add(a,o),add(b,o),col,w||1);}
}
function box3D(sc,c,sz,col,w,fillCol){
  const hx=sz[0]/2, hy=sz[1]/2, hz=sz[2]/2;
  const P=[
    add(c,[-hx,-hy,-hz]), add(c,[hx,-hy,-hz]), add(c,[hx,hy,-hz]), add(c,[-hx,hy,-hz]),
    add(c,[-hx,-hy, hz]), add(c,[hx,-hy, hz]), add(c,[hx,hy, hz]), add(c,[-hx,hy, hz])
  ];
  const E=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  E.forEach(e=>L3(sc,P[e[0]],P[e[1]],col,w||1));
  if(fillCol){
    PL(sc,[P[0],P[1],P[2],P[3],P[0]],col,1,null,fillCol);
    PL(sc,[P[4],P[5],P[6],P[7],P[4]],col,1,null,fillCol);
  }
}
function springPts(a,b,r,turns,seg){
  const d=sub(b,a),L=len(d)||1,u=mul(d,1/L);
  let ref=[0,1,0]; if(abs(dot(ref,u))>0.9)ref=[1,0,0];
  const e1=nrm(sub(ref,mul(u,dot(ref,u)))),e2=cross(u,e1);
  const pts=[a]; const t0=0.08,t1=0.92;
  for(let k=0;k<=seg;k++){
    const t=t0+(t1-t0)*k/seg,an=2*PI*turns*(k/seg);
    pts.push(add(add(a,mul(u,L*t)),add(mul(e1,r*cos(an)),mul(e2,r*sin(an)))));
  }
  pts.push(b); return pts;
}
function bellows3D(sc,a,b,rMin,rMax,folds,col){
  const d=sub(b,a), L=len(d)||1, u=mul(d,1/L);
  const u1=perpOf(u), u2=cross(u,u1);
  const total = folds*2;
  for(let i=0;i<total;i++){
    const t=i/total, p=add(a,mul(u,L*t));
    const r = (i%2===0)?rMax:rMin;
    PL(sc,circPts(p,u,r,12,u1,u2),col,1);
    if(i>0){
      const pPrev=add(a,mul(u,L*(i-1)/total)), rPrev=(i%2===1)?rMax:rMin;
      L3(sc,add(pPrev,mul(u1,rPrev)),add(p,mul(u1,r)),col,1);
      L3(sc,add(pPrev,mul(u1,-rPrev)),add(p,mul(u1,-r)),col,1);
    }
  }
}
function arcTube(sc, pts, r, col, w){
  for(let i=0; i<pts.length-1; i++){
    cylinder(sc, pts[i], pts[i+1], r, col, w||1.2, 10);
  }
}

/* ================================ 5. 定形防撞区与自适应悬架舱总装 ================================ */
function buildScenePRO(){
  const sc=[];
  const yF = S.wb/2, yR = -S.wb/2;

  // 根据当前车型切换对应的车架与空间架构
  if(S.vehicleType === "gt3" || S.vehicleType === "gt3_sport") {
    buildGT3Spaceframe(sc, yF, yR);
  } else if(S.vehicleType === "baja") {
    buildBajaSpaceframe(sc, yF, yR);
  } else {
    buildDecoupledImpactSpaceframe(sc, yF, yR);
  }

  // 传动系：EDU 电驱动总成与差速器
  if(S.show.powertrain) buildPowertrainEDU(sc, yF, yR);

  // 转向系：中置单座方程式转向总成
  if(S.show.steer_col) buildFormulaCentralSteering(sc, yF);

  // 制动系：中置双回路主缸与踏板
  if(S.show.master_cyl) buildBrakeHydraulicSystem(sc, yF, yR);

  // 悬架与车轮端各系统实例装配 /* F-40: 保证车轮转向与外倾角随机构实时精确计算 */
  const mF = (SIM.FR ? metrics(SIM.FR, 'front') : null);
  const mR = (SIM.RR ? metrics(SIM.RR, 'rear') : null);
  const mFL = (SIM.FL && S.show.mirror ? metrics(SIM.FL, 'front') : null);
  const mRL = (SIM.RL && S.show.mirror ? metrics(SIM.RL, 'rear') : null);

  addAxleAssemblyPRO(sc, SIM.FR, mF, 1, yF, 'front');
  addAxleAssemblyPRO(sc, SIM.RR, mR, 1, yR, 'rear');
  if(S.show.mirror){
    addAxleAssemblyPRO(sc, SIM.FL, mFL, -1, yF, 'front');
    addAxleAssemblyPRO(sc, SIM.RL, mRL, -1, yR, 'rear');
  }
  return sc;
}

/* ================================ B. FIA GT3 房车赛车 (Coupe Proportions) ================================ */
function buildGT3Spaceframe(sc, yF, yR){
  const T = (a, b, r, col) => cylinder(sc, a, b, r||16, col||"#5a728c", 1.3, 12);
  const D = (a, b, r, col) => cylinder(sc, a, b, r||12, col||"#3d5168", 1.1, 10);
  const WING = (a, b, r, col) => cylinder(sc, a, b, r||14, col||"#e67e22", 1.4, 12);

  const Z_floor = 120, Z_belt = 600, Z_roof = 980;
  const Z_nose = 380, Z_tail = 620;
  const W_floor = 780, W_belt = 800, W_roof = 520, W_nose = 650, W_tail = 750;
  
  const Y_nose = yF + 650;
  const Y_dash = yF - 400;
  const Y_roof_front = Y_dash - 650;
  const Y_roof_rear = yR + 750;
  const Y_rearHoop = yR + 150;
  const Y_tail = yR - 650;

  const F_FL = [-W_floor, Y_dash, Z_floor], F_FR = [W_floor, Y_dash, Z_floor];
  const F_RL = [-W_floor, Y_rearHoop, Z_floor], F_RR = [W_floor, Y_rearHoop, Z_floor];
  const B_FL = [-W_belt, Y_dash, Z_belt], B_FR = [W_belt, Y_dash, Z_belt];
  const B_RL = [-W_belt, Y_rearHoop, Z_belt], B_RR = [W_belt, Y_rearHoop, Z_belt];
  const R_FL = [-W_roof, Y_roof_front, Z_roof], R_FR = [W_roof, Y_roof_front, Z_roof];
  const R_RL = [-W_roof, Y_roof_rear, Z_roof], R_RR = [W_roof, Y_roof_rear, Z_roof];
  const N_TL = [-W_nose, Y_nose, Z_nose], N_TR = [W_nose, Y_nose, Z_nose];
  const N_BL = [-W_nose, Y_nose, Z_floor+30], N_BR = [W_nose, Y_nose, Z_floor+30];
  const T_TL = [-W_tail, Y_tail, Z_tail], T_TR = [W_tail, Y_tail, Z_tail];
  const T_BL = [-W_tail, Y_tail, Z_floor+50], T_BR = [W_tail, Y_tail, Z_floor+50];

  if(S.show.frame_main){
    const tbCol = "#1a2530";
    T(F_FL, F_FR, 20, tbCol); T(F_RL, F_RR, 20, tbCol);
    T(F_FL, F_RL, 25, tbCol); T(F_FR, F_RR, 25, tbCol);
    T(B_FL, B_FR, 20, tbCol); T(B_RL, B_RR, 20, tbCol);
    T(B_FL, B_RL, 25, tbCol); T(B_FR, B_RR, 25, tbCol);
    T(R_FL, R_FR, 18, tbCol); T(R_RL, R_RR, 18, tbCol);
    T(R_FL, R_RL, 18, tbCol); T(R_FR, R_RR, 18, tbCol);
    T(B_FL, R_FL, 22, tbCol); T(B_FR, R_FR, 22, tbCol); 
    T(B_RL, R_RL, 24, tbCol); T(B_RR, R_RR, 24, tbCol); 
    T(F_FL, B_FL, 22, tbCol); T(F_FR, B_FR, 22, tbCol);
    T(F_RL, B_RL, 22, tbCol); T(F_RR, B_RR, 22, tbCol);
    
    const cageCol = "#d2543f"; 
    const C_FL = [-W_roof-20, Y_roof_front+20, Z_roof-30], C_FR = [W_roof+20, Y_roof_front+20, Z_roof-30];
    const C_RL = [-W_roof-20, Y_roof_rear-20, Z_roof-30], C_RR = [W_roof+20, Y_roof_rear-20, Z_roof-30];
    const C_B_RL = [-W_belt+40, Y_rearHoop-40, Z_belt-40], C_B_RR = [W_belt-40, Y_rearHoop-40, Z_belt-40];
    T(C_FL, C_FR, 16, cageCol); T(C_RL, C_RR, 16, cageCol); T(C_FL, C_RL, 16, cageCol); T(C_FR, C_RR, 16, cageCol); 
    D(C_FL, C_RR, 12, cageCol); D(C_FR, C_RL, 12, cageCol); 
    T(C_RL, C_B_RL, 18, cageCol); T(C_RR, C_B_RR, 18, cageCol); 
    D(C_RL, C_B_RR, 15, cageCol); D(C_RR, C_B_RL, 15, cageCol); 
    T(C_B_RL, C_B_RR, 18, cageCol); 
  }

  if(S.show.frame_side){
    const bodyCol = "rgba(40, 48, 56, 0.95)"; 
    const hoodCol = "rgba(45, 55, 65, 0.90)"; 
    PL(sc, [F_FL, B_FL, B_RL, F_RL, F_FL], bodyCol, 1, null, bodyCol);
    PL(sc, [F_FR, B_FR, B_RR, F_RR, F_FR], bodyCol, 1, null, bodyCol);
    PL(sc, [B_FL, B_FR, N_TR, N_TL, B_FL], hoodCol, 1, null, hoodCol);
    PL(sc, [F_FL, B_FL, N_TL, N_BL, F_FL], bodyCol, 1, null, bodyCol);
    PL(sc, [F_FR, B_FR, N_TR, N_BR, F_FR], bodyCol, 1, null, bodyCol);
    PL(sc, [B_RL, B_RR, T_TR, T_TL, B_RL], hoodCol, 1, null, hoodCol);
    PL(sc, [F_RL, B_RL, T_TL, T_BL, F_RL], bodyCol, 1, null, bodyCol);
    PL(sc, [F_RR, B_RR, T_TR, T_BR, F_RR], bodyCol, 1, null, bodyCol);
    PL(sc, [R_FL, R_FR, R_RR, R_RL, R_FL], hoodCol, 1, null, hoodCol);
    
    const glass = "rgba(120, 160, 200, 0.25)";
    PL(sc, [B_FL, B_FR, R_FR, R_FL, B_FL], "rgba(100,150,200,0.5)", 1.5, null, glass);
    PL(sc, [B_FL, R_FL, R_RL, B_RL, B_FL], "rgba(100,150,200,0.5)", 1.5, null, glass);
    PL(sc, [B_FR, R_FR, R_RR, B_RR, B_FR], "rgba(100,150,200,0.5)", 1.5, null, glass);
    PL(sc, [B_RL, B_RR, R_RR, R_RL, B_RL], "rgba(100,150,200,0.5)", 1.5, null, glass);
  }

  const hF = S.front.hp;
  if(S.show.frame_front){
    const sfC = "#7a8a9e";
    T(N_TL, N_TR, 16, sfC); T(N_BL, N_BR, 18, sfC); 
    T(N_TL, N_BL, 16, sfC); T(N_TR, N_BR, 16, sfC);
    const R_DMP_F = [hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];
    const L_DMP_F = [-hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];
    T(R_DMP_F, B_FR, 18, "#d2543f"); T(L_DMP_F, B_FL, 18, "#d2543f");
    T(R_DMP_F, L_DMP_F, 20, "#d2543f"); 
    const R_UCA_F = [hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]], L_UCA_F = [-hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]];
    const R_LCA_F = [hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]], L_LCA_F = [-hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]];
    const R_UCA_R = [hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]], L_UCA_R = [-hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]];
    const R_LCA_R = [hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]], L_LCA_R = [-hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]];
    T(R_UCA_F, N_TR, 14, sfC); T(L_UCA_F, N_TL, 14, sfC);
    T(R_LCA_F, N_BR, 16, sfC); T(L_LCA_F, N_BL, 16, sfC);
    T(R_UCA_R, B_FR, 14, sfC); T(L_UCA_R, B_FL, 14, sfC);
    T(R_LCA_R, F_FR, 16, sfC); T(L_LCA_R, F_FL, 16, sfC);
  }

  const hR = S.rear.hp;
  if(S.show.frame_rear){
    const sfC = "#7a8a9e";
    T(T_TL, T_TR, 16, sfC); T(T_BL, T_BR, 18, sfC); 
    T(T_TL, T_BL, 16, sfC); T(T_TR, T_BR, 16, sfC);
    const R_DMP_R = [hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];
    const L_DMP_R = [-hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];
    T(R_DMP_R, B_RR, 18, sfC); T(L_DMP_R, B_RL, 18, sfC);
    T(R_DMP_R, L_DMP_R, 20, "#d2543f"); 
    const R_UCA_F = [hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]], L_UCA_F = [-hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]];
    const R_LCA_F = [hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]], L_LCA_F = [-hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]];
    const R_UCA_R = [hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]], L_UCA_R = [-hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]];
    const R_LCA_R = [hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]], L_LCA_R = [-hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]];
    T(R_UCA_F, B_RR, 14, sfC); T(L_UCA_F, B_RL, 14, sfC);
    T(R_LCA_F, F_RR, 16, sfC); T(L_LCA_F, F_RL, 16, sfC);
    T(R_UCA_R, T_TR, 14, sfC); T(L_UCA_R, T_TL, 14, sfC);
    T(R_LCA_R, T_BR, 16, sfC); T(L_LCA_R, T_BL, 16, sfC);

    const Pylon_Y = Y_tail + 100, Pylon_Z = Z_roof + 80, Pylon_W = 280;
    const Pylon_L_Base = [-Pylon_W, Pylon_Y, Z_tail], Pylon_R_Base = [Pylon_W, Pylon_Y, Z_tail];
    const Pylon_L_Top = [-Pylon_W, Pylon_Y-100, Pylon_Z], Pylon_R_Top = [Pylon_W, Pylon_Y-100, Pylon_Z];
    WING(Pylon_L_Base, Pylon_L_Top, 16); WING(Pylon_R_Base, Pylon_R_Top, 16);
    D(Pylon_L_Base, Pylon_R_Top, 10); D(Pylon_R_Base, Pylon_L_Top, 10);

    const Wing_Span = 850, Wing_Y = Pylon_Y - 120;
    const W_L_Lead = [-Wing_Span, Wing_Y+80, Pylon_Z+10], W_R_Lead = [Wing_Span, Wing_Y+80, Pylon_Z+10];
    const W_L_Trail = [-Wing_Span, Wing_Y-120, Pylon_Z+40], W_R_Trail = [Wing_Span, Wing_Y-120, Pylon_Z+40];
    WING(W_L_Lead, W_R_Lead, 20); WING(W_L_Trail, W_R_Trail, 12);
    T(W_L_Lead, W_L_Trail, 14); T(W_R_Lead, W_R_Trail, 14);

    const EP_L_Bot = [-Wing_Span, Wing_Y-30, Pylon_Z-70], EP_R_Bot = [Wing_Span, Wing_Y-30, Pylon_Z-70];
    const EP_L_Top = [-Wing_Span, Wing_Y-30, Pylon_Z+80], EP_R_Top = [Wing_Span, Wing_Y-30, Pylon_Z+80];
    WING(EP_L_Bot, EP_L_Top, 10); WING(EP_R_Bot, EP_R_Top, 10);
  }
}

/* ================================ C. SAE Baja 巴哈越野赛车管架 ================================ */
function buildBajaSpaceframe(sc, yF, yR){
  const hF = S.front.hp, hR = S.rear.hp;
  const T = (a, b, r, col) => cylinder(sc, a, b, r||16, col||"#d23535", 1.3, 12); 
  const D = (a, b, r, col) => cylinder(sc, a, b, r||14, col||"#a82a2a", 1.1, 10);

  /* G15.6（2026-08-31）：Baja 比例再次修正——基于真实设计哲学。
     关键事实（02-presets.js baja 预设）：
       wb  = 2790 mm（轴距）
       WC  = [792, 0, 396] → 前轮中心 X=792 → 半轮距 792 mm，总轮距 1584 mm
     前两版（G15-fix/G15.5）犯的错：只把"长条"改"短条"但还是窄条——
     W_shoulder=460 → 车身总宽 920 mm ≪ 轮距 1584 mm，俯视下仍被轮距包夹。
     前环 Y_front_hoop = yF-150 还在前轮**后方**，没有"前环在轮正前"的真实感。

     本次设计哲学：
       ① 车身宽度接近轮距（肩宽 ≈ 80% 轮距，敞轮结构合理）
       ② 前环/主环就在前后轮正前/正后方，座舱跨度 ≈ 轴距
       ③ 前后悬仅给机器舱/后舱留 ~200mm，不向轮外悬伸
       ④ 塔顶高度与车手头部相当（Baja 塔顶不需要拉很高） */
  const Y_front_bulk = yF + 200;   // 前舱横隔：前轮正前方约 200mm（机器舱）
  const Y_front_hoop = yF - 30;    // 前环：紧贴前轮正前方
  const Y_main_hoop  = yR + 30;    // 主环：紧贴后轮正后方
  const Y_rear_bulk  = yR - 250;   // 后舱横隔：主环后方约 250mm

  const Z_bottom    = 200;
  const Z_sim       = 560;
  const Z_front_hoop = 830;
  const Z_main_hoop = 960;         // 塔顶不需太高
  const Z_nose      = 500;
  const Z_rear      = 640;

  const W_bottom    = 580;         // 车身底半宽（约 73% 半轮距）
  const W_shoulder  = 760;         // 肩半宽 ≈ 96% 半轮距——接近真实轮距
  const W_roof      = 680;         // 车顶半宽
  const W_nose      = 500;         // 前舱半宽

  const FBM_TL = [-W_nose, Y_front_bulk, Z_nose], FBM_TR = [W_nose, Y_front_bulk, Z_nose];
  const FBM_BL = [-W_nose, Y_front_bulk, Z_bottom], FBM_BR = [W_nose, Y_front_bulk, Z_bottom];
  const FHO_TL = [-W_roof, Y_front_hoop, Z_front_hoop], FHO_TR = [W_roof, Y_front_hoop, Z_front_hoop];
  const FHO_ML = [-W_shoulder, Y_front_hoop, Z_sim], FHO_MR = [W_shoulder, Y_front_hoop, Z_sim];
  const FHO_BL = [-W_bottom, Y_front_hoop, Z_bottom], FHO_BR = [W_bottom, Y_front_hoop, Z_bottom];
  const RHO_TL = [-W_roof, Y_main_hoop, Z_main_hoop], RHO_TR = [W_roof, Y_main_hoop, Z_main_hoop];
  const RHO_ML = [-W_shoulder, Y_main_hoop, Z_sim], RHO_MR = [W_shoulder, Y_main_hoop, Z_sim];
  const RHO_BL = [-W_bottom, Y_main_hoop, Z_bottom], RHO_BR = [W_bottom, Y_main_hoop, Z_bottom];
  const RR_TL = [-W_shoulder, Y_rear_bulk, Z_rear], RR_TR = [W_shoulder, Y_rear_bulk, Z_rear];
  const RR_BL = [-W_bottom, Y_rear_bulk, Z_bottom], RR_BR = [W_bottom, Y_rear_bulk, Z_bottom];

  if(S.show.frame_main){
    T(RHO_BL, RHO_ML); T(RHO_BR, RHO_MR); T(RHO_ML, RHO_TL); T(RHO_MR, RHO_TR); T(RHO_TL, RHO_TR);
    D(RHO_TL, RHO_MR); D(RHO_TR, RHO_ML);
    T(RHO_ML, RHO_MR);
    T(FHO_BL, FHO_ML); T(FHO_BR, FHO_MR); T(FHO_ML, FHO_TL); T(FHO_MR, FHO_TR); T(FHO_TL, FHO_TR);
    T(FHO_ML, FHO_MR);
    T(FHO_TL, RHO_TL); T(FHO_TR, RHO_TR);
    D(FHO_TL, RHO_TR); D(FHO_TR, RHO_TL);
  }

  if(S.show.frame_side){
    T(FBM_BL, FHO_BL); T(FBM_BR, FHO_BR);
    T(FBM_TL, FHO_ML); T(FBM_TR, FHO_MR);
    T(FHO_BL, RHO_BL); T(FHO_BR, RHO_BR);
    T(FHO_ML, RHO_ML); T(FHO_MR, RHO_MR);
    D(FHO_ML, RHO_BL); D(FHO_BL, RHO_ML);
    D(FHO_MR, RHO_BR); D(FHO_BR, RHO_MR);
  }

  if(S.show.frame_rear){
    T(RHO_BL, RR_BL); T(RHO_BR, RR_BR);
    T(RHO_ML, RR_TL); T(RHO_MR, RR_TR);
    T(RHO_TL, RR_TL); T(RHO_TR, RR_TR);
    T(RR_TL, RR_TR); T(RR_BL, RR_BR); 
    T(RR_TL, RR_BL); T(RR_TR, RR_BR);
    D(RR_TL, RR_BR); D(RR_TR, RR_BL);
  }

  /* G15.7（2026-08-31）：去除 Baja 的三个灰白色覆盖面（前鼻 + 左/右侧面围）。
     真实 Baja SAE 是纯管架结构（参考图 U18），没有任何覆盖板面；
     保留原座舱底板（黑色，与管架形成对比，标识驾驶员位置）。
     GT3 一字未动。 */
  if(S.show.frame_side){
    PL(sc, [FHO_BL, FHO_BR, RHO_BR, RHO_BL, FHO_BL], "rgba(25,25,25,0.95)", 1, null, "rgba(25,25,25,0.95)");
  }

  if(S.show.frame_front){
    const sfC = "#4a5a6a";
    T(FBM_TL, FBM_TR); T(FBM_BL, FBM_BR); T(FBM_TL, FBM_BL); T(FBM_TR, FBM_BR);
    D(FBM_TL, FBM_BR); D(FBM_TR, FBM_BL);
    const R_UCA_F = [hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]], L_UCA_F = [-hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]];
    const R_LCA_F = [hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]], L_LCA_F = [-hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]];
    const R_UCA_R = [hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]], L_UCA_R = [-hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]];
    const R_LCA_R = [hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]], L_LCA_R = [-hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]];
    T(R_UCA_F, FBM_TR, 14, sfC); T(L_UCA_F, FBM_TL, 14, sfC);
    T(R_LCA_F, FBM_BR, 16, sfC); T(L_LCA_F, FBM_BL, 16, sfC);
    T(R_UCA_R, FHO_MR, 14, sfC); T(L_UCA_R, FHO_ML, 14, sfC);
    T(R_LCA_R, FHO_BR, 16, sfC); T(L_LCA_R, FHO_BL, 16, sfC);
    const R_DMP_F = [hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];
    const L_DMP_F = [-hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];
    T(R_DMP_F, FHO_TR, 16, sfC); T(L_DMP_F, FHO_TL, 16, sfC);
    T(R_DMP_F, L_DMP_F, 18, sfC);
  }

  if(S.show.frame_rear){
    const sfC = "#4a5a6a";
    const R_UCA_F = [hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]], L_UCA_F = [-hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]];
    const R_LCA_F = [hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]], L_LCA_F = [-hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]];
    const R_UCA_R = [hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]], L_UCA_R = [-hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]];
    const R_LCA_R = [hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]], L_LCA_R = [-hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]];
    T(R_UCA_F, RHO_MR, 14, sfC); T(L_UCA_F, RHO_ML, 14, sfC);
    T(R_LCA_F, RHO_BR, 16, sfC); T(L_LCA_F, RHO_BL, 16, sfC);
    T(R_UCA_R, RR_TR, 14, sfC); T(L_UCA_R, RR_TL, 14, sfC);
    T(R_LCA_R, RR_BR, 16, sfC); T(L_LCA_R, RR_BL, 16, sfC);
    const R_DMP_R = [hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];
    const L_DMP_R = [-hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];
    T(R_DMP_R, RHO_TR, 16, sfC); T(L_DMP_R, RHO_TL, 16, sfC);
    T(R_DMP_R, L_DMP_R, 18, sfC);
  }
}

/* 核心车架建模：前后防撞吸能区与乘员舱完全定形，仅悬架舱过渡管件随硬点自适应 */
function buildDecoupledImpactSpaceframe(sc, yF, yR){
  const hF = S.front.hp, hR = S.rear.hp;

  const T = (a, b, r, col) => cylinder(sc, a, b, r||13, EC(col===SYSTEM_COLORS.frameSec?"frameSec":(col===SYSTEM_COLORS.frameDiag?"frameDiag":"frameMain"), col||SYSTEM_COLORS.frameMain), 1.2, 10);
  const D = (a, b, r, col) => cylinder(sc, a, b, r||10, EC("frameDiag", col||SYSTEM_COLORS.frameDiag), 1.1, 8);

  // =========================================================================
  // 1. 前防撞区与前隔框 (Decoupled & Fixed Front Impact Cell)
  // 尺寸与位置绝对固定，完全解耦，不随任何悬架硬点改变！
  // =========================================================================
  const FBH_Y = yF + 270;
  const FBH_W_Top = 155;
  const FBH_W_Bot = 170;
  const FBH_Z_Top = 310;
  const FBH_Z_Bot = 95;

  const FBH_TL = [-FBH_W_Top, FBH_Y, FBH_Z_Top], FBH_TR = [FBH_W_Top, FBH_Y, FBH_Z_Top];
  const FBH_BL = [-FBH_W_Bot, FBH_Y, FBH_Z_Bot], FBH_BR = [FBH_W_Bot, FBH_Y, FBH_Z_Bot];

  const IA_Y = FBH_Y + 140;
  const IA_W_Top = 110, IA_W_Bot = 120;
  const IA_Z_Top = 270, IA_Z_Bot = 115;
  const IA_TL = [-IA_W_Top, IA_Y, IA_Z_Top], IA_TR = [IA_W_Top, IA_Y, IA_Z_Top];
  const IA_BL = [-IA_W_Bot, IA_Y, IA_Z_Bot], IA_BR = [IA_W_Bot, IA_Y, IA_Z_Bot];

  if(S.show.frame_front){
    // 前隔框闭合主框架
    T(FBH_TL, FBH_TR, 14); T(FBH_BL, FBH_BR, 14);
    T(FBH_TL, FBH_BL, 14); T(FBH_TR, FBH_BR, 14);
    D(FBH_TL, FBH_BR, 10);

    // 吸能盒框架
    T(IA_TL, IA_TR, 8, SYSTEM_COLORS.frameSec); T(IA_BL, IA_BR, 8, SYSTEM_COLORS.frameSec);
    T(IA_TL, IA_BL, 8, SYSTEM_COLORS.frameSec); T(IA_TR, IA_BR, 8, SYSTEM_COLORS.frameSec);
    T(FBH_TL, IA_TL, 8, SYSTEM_COLORS.frameSec); T(FBH_TR, IA_TR, 8, SYSTEM_COLORS.frameSec);
    T(FBH_BL, IA_BL, 8, SYSTEM_COLORS.frameSec); T(FBH_BR, IA_BR, 8, SYSTEM_COLORS.frameSec);
  }

  // =========================================================================
  // 2. 定形独立乘员舱 (Fixed Cockpit Cell - 侧向高度提升 10%)
  // =========================================================================
  const FH_Y = yF - 260;
  const FH_Z_Top = 640;
  const FH_Z_Mid = 400;
  const FH_Z_Bot = 80;
  const FH_W = 260;

  const FH_TopL = [-190, FH_Y, FH_Z_Top], FH_TopR = [190, FH_Y, FH_Z_Top];
  const FH_ML   = [-FH_W, FH_Y, FH_Z_Mid], FH_MR   = [FH_W, FH_Y, FH_Z_Mid];
  const FH_BL   = [-FH_W, FH_Y, FH_Z_Bot], FH_BR   = [FH_W, FH_Y, FH_Z_Bot];

  const CC_Y = (yF + yR)/2 + 50;
  const CC_Z_Top = 420;
  const CC_Z_Bot = 75;
  const CC_W = 320;

  const CC_TL = [-CC_W, CC_Y, CC_Z_Top], CC_TR = [CC_W, CC_Y, CC_Z_Top];
  const CC_BL = [-CC_W, CC_Y, CC_Z_Bot], CC_BR = [CC_W, CC_Y, CC_Z_Bot];

  const MH_Y = yR + 580;
  const MH_Z_Apex = 1200;
  const MH_Z_Top = 1140;
  const MH_Z_Mid = 440;
  const MH_Z_Bot = 70;
  const MH_W = 340;

  const MH_Apex = [0, MH_Y, MH_Z_Apex];
  const MH_TopL = [-180, MH_Y, MH_Z_Top], MH_TopR = [180, MH_Y, MH_Z_Top];
  const MH_ML   = [-MH_W, MH_Y, MH_Z_Mid], MH_MR   = [MH_W, MH_Y, MH_Z_Mid];
  const MH_BL   = [-MH_W, MH_Y, MH_Z_Bot], MH_BR   = [MH_W, MH_Y, MH_Z_Bot];

  if(S.show.frame_front){
    arcTube(sc, [FH_BL, FH_ML, FH_TopL, FH_TopR, FH_MR, FH_BR], 15, SYSTEM_COLORS.frameMain);
    T(FH_BL, FH_BR, 15);
    T(FH_ML, FH_MR, 12, SYSTEM_COLORS.frameSec);
  }

  if(S.show.frame_side){
    T(FH_ML, CC_TL, 14); T(FH_MR, CC_TR, 14);
    T(CC_TL, MH_ML, 14); T(CC_TR, MH_MR, 14);
    T(FH_BL, CC_BL, 15); T(FH_BR, CC_BR, 15);
    T(CC_BL, MH_BL, 15); T(CC_BR, MH_BR, 15);

    D(FH_ML, CC_BL, 12); D(FH_MR, CC_BR, 12);
    D(FH_BL, CC_TL, 12); D(FH_BR, CC_TR, 12);
    D(CC_TL, MH_BL, 12); D(CC_TR, MH_BR, 12);
    D(CC_BL, MH_ML, 12); D(CC_BR, MH_MR, 12);
    T(CC_TL, CC_BL, 12); T(CC_TR, CC_BR, 12);

    T(CC_BL, CC_BR, 14); T(MH_BL, MH_BR, 15);
    D(FH_BL, CC_BR, 11); D(FH_BR, CC_BL, 11);
    D(CC_BL, MH_BR, 11); D(CC_BR, MH_BL, 11);
  }

  if(S.show.frame_main){
    arcTube(sc, [MH_BL, MH_ML, MH_TopL, MH_Apex, MH_TopR, MH_MR, MH_BR], 18, SYSTEM_COLORS.frameMain);
    T(MH_ML, MH_MR, 14, SYSTEM_COLORS.frameSec);
    D(MH_ML, MH_BR, 12); D(MH_MR, MH_BL, 12);
  }

  // =========================================================================
  // 3. 后防撞尾框 (Decoupled & Fixed Rear Impact Structure) - 完全固定
  // =========================================================================
  const RSB2_Y = yR - 180;
  const RSB2_W_Top = 160, RSB2_W_Bot = 175;
  const RSB2_Z_Top = 320, RSB2_Z_Bot = 90;
  const RSB2_TL = [-RSB2_W_Top, RSB2_Y, RSB2_Z_Top], RSB2_TR = [RSB2_W_Top, RSB2_Y, RSB2_Z_Top];
  const RSB2_BL = [-RSB2_W_Bot, RSB2_Y, RSB2_Z_Bot], RSB2_BR = [RSB2_W_Bot, RSB2_Y, RSB2_Z_Bot];

  const REF_Y = RSB2_Y - 130;
  const REF_W_Top = 110, REF_W_Bot = 120;
  const REF_Z_Top = 280, REF_Z_Bot = 115;
  const REF_TL = [-REF_W_Top, REF_Y, REF_Z_Top], REF_TR = [REF_W_Top, REF_Y, REF_Z_Top];
  const REF_BL = [-REF_W_Bot, REF_Y, REF_Z_Bot], REF_BR = [REF_W_Bot, REF_Y, REF_Z_Bot];

  if(S.show.frame_rear){
    T(RSB2_TL, RSB2_TR, 13); T(RSB2_BL, RSB2_BR, 14);
    T(RSB2_TL, RSB2_BL, 13); T(RSB2_TR, RSB2_BR, 13);
    D(RSB2_TL, RSB2_BR, 10);

    T(REF_TL, REF_TR, 10); T(REF_BL, REF_BR, 10);
    T(REF_TL, REF_BL, 10); T(REF_TR, REF_BR, 10);
    T(RSB2_TL, REF_TL, 10); T(RSB2_TR, REF_TR, 10);
    T(RSB2_BL, REF_BL, 10); T(RSB2_BR, REF_BR, 10);
    D(RSB2_TL, REF_BL, 9); D(RSB2_TR, REF_BR, 9);
  }

  // =========================================================================
  // 4. 自适应前后悬架承力舱 (Adaptive Suspension Bays - 动态吸纳硬点变动)
  // =========================================================================
  const R_LCA_F = [hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]];
  const L_LCA_F = [-hF.LCA_F[0], hF.LCA_F[1] + yF, hF.LCA_F[2]];
  const R_LCA_R = [hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]];
  const L_LCA_R = [-hF.LCA_R[0], hF.LCA_R[1] + yF, hF.LCA_R[2]];

  const R_UCA_F = [hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]];
  const L_UCA_F = [-hF.UCA_F[0], hF.UCA_F[1] + yF, hF.UCA_F[2]];
  const R_UCA_R = [hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]];
  const L_UCA_R = [-hF.UCA_R[0], hF.UCA_R[1] + yF, hF.UCA_R[2]];

  const R_RCK_A = [hF.RCK_AX_A[0], hF.RCK_AX_A[1] + yF, hF.RCK_AX_A[2]];
  const L_RCK_A = [-hF.RCK_AX_A[0], hF.RCK_AX_A[1] + yF, hF.RCK_AX_A[2]];
  const R_RCK_B = [hF.RCK_AX_B[0], hF.RCK_AX_B[1] + yF, hF.RCK_AX_B[2]];
  const L_RCK_B = [-hF.RCK_AX_B[0], hF.RCK_AX_B[1] + yF, hF.RCK_AX_B[2]];

  const R_DMP_B = [hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];
  const L_DMP_B = [-hF.DMP_BODY[0], hF.DMP_BODY[1] + yF, hF.DMP_BODY[2]];

  if(S.show.frame_front){
    // 过渡管件：定形前隔框(FBH) ──> 动联前悬架硬点(UCA_F / LCA_F)
    T(FBH_TL, L_UCA_F, 13); T(FBH_TR, R_UCA_F, 13);
    T(FBH_BL, L_LCA_F, 14); T(FBH_BR, R_LCA_F, 14);
    D(FBH_TL, L_LCA_F, 11); D(FBH_TR, R_LCA_F, 11);
    D(FBH_BL, L_UCA_F, 11); D(FBH_BR, R_UCA_F, 11);

    // 前悬架舱内侧自适应刚性结构
    T(L_UCA_F, L_UCA_R, 13); T(R_UCA_F, R_UCA_R, 13);
    T(L_LCA_F, L_LCA_R, 14); T(R_LCA_F, R_LCA_R, 14);
    T(L_UCA_F, L_LCA_F, 12); T(R_UCA_F, R_LCA_F, 12);
    T(L_UCA_R, L_LCA_R, 12); T(R_UCA_R, R_LCA_R, 12);
    D(L_UCA_F, L_LCA_R, 11); D(R_UCA_F, R_LCA_R, 11);
    D(L_LCA_F, L_UCA_R, 11); D(R_LCA_F, R_UCA_R, 11);
    T(L_LCA_F, R_LCA_F, 13); T(L_LCA_R, R_LCA_R, 13);
    D(L_LCA_F, R_LCA_R, 11); D(R_LCA_F, L_LCA_R, 11);

    // 摇臂轴承座与推杆避震安装塔架
    T(L_UCA_F, L_RCK_A, 11, SYSTEM_COLORS.frameSec); T(R_UCA_F, R_RCK_A, 11, SYSTEM_COLORS.frameSec);
    T(L_UCA_R, L_RCK_B, 11, SYSTEM_COLORS.frameSec); T(R_UCA_R, R_RCK_B, 11, SYSTEM_COLORS.frameSec);
    T(L_RCK_A, L_RCK_B, 12, SYSTEM_COLORS.frameSec); T(R_RCK_A, R_RCK_B, 12, SYSTEM_COLORS.frameSec);
    T(L_RCK_A, R_RCK_A, 10, SYSTEM_COLORS.frameSec);
    T(L_DMP_B, [0, L_DMP_B[1], L_DMP_B[2]-40], 11, SYSTEM_COLORS.frameSec);
    T(R_DMP_B, [0, R_DMP_B[1], R_DMP_B[2]-40], 11, SYSTEM_COLORS.frameSec);

    // 过渡管件：动联前悬架后硬点(UCA_R / LCA_R) ──> 定形前防滚架(FH)
    T(L_UCA_R, FH_ML, 14); T(R_UCA_R, FH_MR, 14);
    T(L_LCA_R, FH_BL, 15); T(R_LCA_R, FH_BR, 15);
    D(L_UCA_R, FH_BL, 11); D(R_UCA_R, FH_BR, 11);
    D(L_LCA_R, FH_ML, 11); D(R_LCA_R, FH_MR, 11);
    D(L_UCA_F, FH_TopL, 11); D(R_UCA_F, FH_TopR, 11);
  }

  // 后悬架承力舱
  const R_RLCA_F = [hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]];
  const L_RLCA_F = [-hR.LCA_F[0], hR.LCA_F[1] + yR, hR.LCA_F[2]];
  const R_RLCA_R = [hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]];
  const L_RLCA_R = [-hR.LCA_R[0], hR.LCA_R[1] + yR, hR.LCA_R[2]];

  const R_RUCA_F = [hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]];
  const L_RUCA_F = [-hR.UCA_F[0], hR.UCA_F[1] + yR, hR.UCA_F[2]];
  const R_RUCA_R = [hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]];
  const L_RUCA_R = [-hR.UCA_R[0], hR.UCA_R[1] + yR, hR.UCA_R[2]];

  const R_RRCK_A = [hR.RCK_AX_A[0], hR.RCK_AX_A[1] + yR, hR.RCK_AX_A[2]];
  const L_RRCK_A = [-hR.RCK_AX_A[0], hR.RCK_AX_A[1] + yR, hR.RCK_AX_A[2]];
  const R_RRCK_B = [hR.RCK_AX_B[0], hR.RCK_AX_B[1] + yR, hR.RCK_AX_B[2]];
  const L_RRCK_B = [-hR.RCK_AX_B[0], hR.RCK_AX_B[1] + yR, hR.RCK_AX_B[2]];

  const R_RDMP_B = [hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];
  const L_RDMP_B = [-hR.DMP_BODY[0], hR.DMP_BODY[1] + yR, hR.DMP_BODY[2]];

  if(S.show.frame_rear){
    // 过渡管件：定形主防滚架(MH) ──> 动联后悬架前硬点
    T(MH_TopL, L_RUCA_F, 16, SYSTEM_COLORS.frameMain);
    T(MH_TopR, R_RUCA_F, 16, SYSTEM_COLORS.frameMain);
    T(MH_ML, L_RUCA_F, 14); T(MH_MR, R_RUCA_F, 14);
    T(MH_BL, L_RLCA_F, 15); T(MH_BR, R_RLCA_F, 15);
    D(MH_ML, L_RLCA_F, 12); D(MH_MR, R_RLCA_F, 12);
    D(MH_BL, L_RUCA_F, 12); D(MH_BR, R_RUCA_F, 12);

    // 后悬架舱内部管架结构
    T(L_RUCA_F, L_RUCA_R, 14); T(R_RUCA_F, R_RUCA_R, 14);
    T(L_RLCA_F, L_RLCA_R, 15); T(R_RLCA_F, R_RLCA_R, 15);
    T(L_RUCA_F, L_RLCA_F, 13); T(R_RUCA_F, R_RLCA_F, 13);
    T(L_RUCA_R, L_RLCA_R, 13); T(R_RUCA_R, R_RLCA_R, 13);
    D(L_RUCA_F, L_RLCA_R, 12); D(R_RUCA_F, R_RLCA_R, 12);
    D(L_RLCA_F, L_RUCA_R, 12); D(R_RLCA_F, R_RUCA_R, 12);
    T(L_RLCA_F, R_RLCA_F, 14); T(L_RLCA_R, R_RLCA_R, 14);
    D(L_RLCA_F, R_RLCA_R, 12); D(R_RLCA_F, L_RLCA_R, 12);

    // 后摇臂与拉杆避震安装塔架
    T(L_RUCA_F, L_RRCK_A, 11, SYSTEM_COLORS.frameSec); T(R_RUCA_F, R_RRCK_A, 11, SYSTEM_COLORS.frameSec);
    T(L_RUCA_R, L_RRCK_B, 11, SYSTEM_COLORS.frameSec); T(R_RUCA_R, R_RRCK_B, 11, SYSTEM_COLORS.frameSec);
    T(L_RRCK_A, L_RRCK_B, 12, SYSTEM_COLORS.frameSec); T(R_RRCK_A, R_RRCK_B, 12, SYSTEM_COLORS.frameSec);
    T(L_RRCK_A, R_RRCK_A, 10, SYSTEM_COLORS.frameSec);
    T(L_RDMP_B, [0, L_RDMP_B[1], L_RDMP_B[2]+30], 11, SYSTEM_COLORS.frameSec);
    T(R_RDMP_B, [0, R_RDMP_B[1], R_RDMP_B[2]+30], 11, SYSTEM_COLORS.frameSec);

    // 过渡管件：动联后悬架后硬点 ──> 定形后隔框(RSB2)
    T(L_RUCA_R, RSB2_TL, 13); T(R_RUCA_R, RSB2_TR, 13);
    T(L_RLCA_R, RSB2_BL, 14); T(R_RLCA_R, RSB2_BR, 14);
    D(L_RUCA_R, RSB2_BL, 11); D(R_RUCA_R, RSB2_BR, 11);
    D(L_RLCA_R, RSB2_TL, 11); D(R_RLCA_R, RSB2_TR, 11);
  }

  // 悬架硬点金属安装支耳
  if(S.show.bushing){
    const renderNodeTabs = (nodes) => {
      nodes.forEach(pt => {
        cylinder(sc, sub(pt,[12,0,0]), add(pt,[12,0,0]), 16, EC("frameNode",SYSTEM_COLORS.frameNode), 1.2, 10, "rgba(224,160,64,0.45)");
      });
    };
    renderNodeTabs([R_LCA_F, L_LCA_F, R_LCA_R, L_LCA_R, R_UCA_F, L_UCA_F, R_UCA_R, L_UCA_R]);
    renderNodeTabs([R_RLCA_F, L_RLCA_F, R_RLCA_R, L_RLCA_R, R_RUCA_F, L_RUCA_F, R_RUCA_R, L_RUCA_R]);
  }
}

/* 2. 传动系：EDU 电驱动单元与差速器几何 */
function buildPowertrainEDU(sc, yF, yR){
  box3D(sc, [0, yF-30, 250], [220, 170, 150], EC("motor",SYSTEM_COLORS.motor), 1.3, EC("motorBody",SYSTEM_COLORS.motorBody));
  cylinder(sc, [-110, yF-30, 250], [110, yF-30, 250], 75, EC("motor",SYSTEM_COLORS.motor), 1.2, 14);
  cylinder(sc, [-140, yF, 260], [-110, yF, 260], 40, EC("diff",SYSTEM_COLORS.diff), 1.2, 12);
  cylinder(sc, [110, yF, 260], [140, yF, 260], 40, EC("diff",SYSTEM_COLORS.diff), 1.2, 12);

  box3D(sc, [0, yR+60, 250], [250, 200, 170], EC("motor",SYSTEM_COLORS.motor), 1.3, EC("motorBody",SYSTEM_COLORS.motorBody));
  cylinder(sc, [-120, yR+60, 250], [120, yR+60, 250], 85, EC("motor",SYSTEM_COLORS.motor), 1.2, 16);
  box3D(sc, [0, yR+130, 320], [200, 130, 70], EC("motor",SYSTEM_COLORS.motor), 1, "rgba(25,45,65,0.6)");
  cylinder(sc, [-150, yR, 260], [-120, yR, 260], 44, EC("diff",SYSTEM_COLORS.diff), 1.2, 12);
  cylinder(sc, [120, yR, 260], [150, yR, 260], 44, EC("diff",SYSTEM_COLORS.diff), 1.2, 12);
}

/* 3. 转向系：单座方程式中置横向蝴蝶方向盘与转向管柱 */
function buildFormulaCentralSteering(sc, yF){
  const swAngle = S.swAngle * D2R;
  const rackY = S.front.hp.RACK[1] + yF;
  const rackZ = S.front.hp.RACK[2];

  if(S.show.steer_rack){
    cylinder(sc, [-160, rackY, rackZ], [160, rackY, rackZ], 18, EC("rack",SYSTEM_COLORS.rackBody), 1.3, 14, "rgba(45,55,65,0.7)");
    cylinder(sc, [0, rackY, rackZ], [0, rackY + 25, rackZ + 45], 22, EC("rack",SYSTEM_COLORS.rackBody), 1.3, 12, "rgba(60,70,80,0.8)");
    box3D(sc, [-130, rackY, rackZ], [35, 45, 40], EC("rack",SYSTEM_COLORS.rackClevis), 1.2, "rgba(90,105,120,0.5)");
    box3D(sc, [130, rackY, rackZ], [35, 45, 40], EC("rack",SYSTEM_COLORS.rackClevis), 1.2, "rgba(90,105,120,0.5)");
    bellows3D(sc, [-160, rackY, rackZ], [-S.front.hp.RACK[0]-S.rack, rackY, rackZ], 12, 19, 5, EC("bellows",SYSTEM_COLORS.bellows));
    bellows3D(sc, [160, rackY, rackZ], [S.front.hp.RACK[0]-S.rack, rackY, rackZ], 12, 19, 5, EC("bellows",SYSTEM_COLORS.bellows));
  }

  const pPinionTop = [0, rackY + 25, rackZ + 45];
  const pUJoint = [0, yF - 260, rackZ + 200];
  const pWheelCenter = [0, yF - 460, rackZ + 360];

  cylinder(sc, pPinionTop, pUJoint, 11, EC("cols",SYSTEM_COLORS.colShaft), 1.3, 10);
  box3D(sc, pUJoint, [22, 22, 22], EC("ujoint",SYSTEM_COLORS.uJointGold), 1.5, "rgba(241,196,15,0.45)");
  cylinder(sc, sub(pUJoint,[12,0,0]), add(pUJoint,[12,0,0]), 7, EC("ujoint",SYSTEM_COLORS.uJointGold), 1.2, 8);
  cylinder(sc, sub(pUJoint,[0,12,0]), add(pUJoint,[0,12,0]), 7, EC("ujoint",SYSTEM_COLORS.uJointGold), 1.2, 8);
  cylinder(sc, pUJoint, sub(pWheelCenter, [0,15,12]), 14, EC("cols",SYSTEM_COLORS.colShaft), 1.4, 12);

  const colAxis = nrm(sub(pWheelCenter, pUJoint));
  const pQR_Base = sub(pWheelCenter, mul(colAxis, 30));
  cylinder(sc, pQR_Base, pWheelCenter, 28, EC("swHub",SYSTEM_COLORS.swHubBlue), 1.4, 16, "rgba(0,153,255,0.6)");
  cylinder(sc, sub(pWheelCenter, mul(colAxis, 8)), pWheelCenter, 36, EC("swPlate",SYSTEM_COLORS.swHubPlate), 1.3, 16);

  const u0 = [1, 0, 0];
  const v0 = nrm(cross(colAxis, u0));
  
  const uRot = sub(mul(u0, cos(swAngle)), mul(v0, sin(swAngle)));
  const vRot = add(mul(u0, sin(swAngle)), mul(v0, cos(swAngle)));

  for(let i=0; i<6; i++){
    const ang = i*PI/3;
    const pPin = add(pWheelCenter, add(mul(uRot, 24*cos(ang)), mul(vRot, 24*sin(ang))));
    cylinder(sc, sub(pPin, mul(colAxis, 6)), add(pPin, mul(colAxis, 4)), 3.5, EC("cols",SYSTEM_COLORS.colShaft), 1, 6);
  }

  if(S.show.steer_wheel){
    const ptsWheel = [
      add(pWheelCenter, add(mul(uRot, -135), mul(vRot, 55))),
      add(pWheelCenter, add(mul(uRot, -55),  mul(vRot, 55))),
      add(pWheelCenter, add(mul(uRot, 0),    mul(vRot, 35))),
      add(pWheelCenter, add(mul(uRot, 55),   mul(vRot, 55))),
      add(pWheelCenter, add(mul(uRot, 135),  mul(vRot, 55))),
      add(pWheelCenter, add(mul(uRot, 142),  mul(vRot, 15))),
      add(pWheelCenter, add(mul(uRot, 138),  mul(vRot, -50))),
      add(pWheelCenter, add(mul(uRot, 120),  mul(vRot, -75))),
      add(pWheelCenter, add(mul(uRot, 45),   mul(vRot, -75))),
      add(pWheelCenter, add(mul(uRot, 0),    mul(vRot, -50))),
      add(pWheelCenter, add(mul(uRot, -45),  mul(vRot, -75))),
      add(pWheelCenter, add(mul(uRot, -120), mul(vRot, -75))),
      add(pWheelCenter, add(mul(uRot, -138), mul(vRot, -50))),
      add(pWheelCenter, add(mul(uRot, -142), mul(vRot, 15)))
    ];
    ptsWheel.push(ptsWheel[0]);
    PL(sc, ptsWheel, EC("swRim",SYSTEM_COLORS.swRim), 3.2, null, "rgba(25,30,36,0.35)");

    const ptsCutL = [
      add(pWheelCenter, add(mul(uRot, -115), mul(vRot, 38))),
      add(pWheelCenter, add(mul(uRot, -45),  mul(vRot, 38))),
      add(pWheelCenter, add(mul(uRot, -35),  mul(vRot, -18))),
      add(pWheelCenter, add(mul(uRot, -115), mul(vRot, -18)))
    ];
    ptsCutL.push(ptsCutL[0]);
    PL(sc, ptsCutL, EC("swGrip",SYSTEM_COLORS.swGrip), 1.4);

    const ptsCutR = [
      add(pWheelCenter, add(mul(uRot, 115),  mul(vRot, 38))),
      add(pWheelCenter, add(mul(uRot, 45),   mul(vRot, 38))),
      add(pWheelCenter, add(mul(uRot, 35),   mul(vRot, -18))),
      add(pWheelCenter, add(mul(uRot, 115),  mul(vRot, -18)))
    ];
    ptsCutR.push(ptsCutR[0]);
    PL(sc, ptsCutR, EC("swGrip",SYSTEM_COLORS.swGrip), 1.4);

    cylinder(sc, add(pWheelCenter, add(mul(uRot, -132), mul(vRot, 40))), add(pWheelCenter, add(mul(uRot, -132), mul(vRot, -60))), 13, EC("swGrip",SYSTEM_COLORS.swGrip), 1.4, 10, "rgba(15,18,22,0.85)");
    cylinder(sc, add(pWheelCenter, add(mul(uRot, 132),  mul(vRot, 40))), add(pWheelCenter, add(mul(uRot, 132),  mul(vRot, -60))), 13, EC("swGrip",SYSTEM_COLORS.swGrip), 1.4, 10, "rgba(15,18,22,0.85)");
  }
}

/* 4. 制动系：中置双回路总泵、踏板平衡杆与管网 */
function buildBrakeHydraulicSystem(sc, yF, yR){
  const pMC_L = [-40, yF + 120, S.front.hp.LCA_F[2] + 45];
  const pMC_R = [40,  yF + 120, S.front.hp.LCA_F[2] + 45];
  const pBalanceBar = [0, yF + 190, S.front.hp.LCA_F[2] + 45];

  cylinder(sc, [-60, yF + 190, S.front.hp.LCA_F[2] + 45], [60, yF + 190, S.front.hp.LCA_F[2] + 45], 10, EC("pedal",SYSTEM_COLORS.colShaft), 1.2, 8);
  cylinder(sc, pBalanceBar, [0, yF + 190, S.front.hp.LCA_F[2] + 160], 12, EC("pedal",SYSTEM_COLORS.colShaft), 1.3, 10);
  box3D(sc, [0, yF + 190, S.front.hp.LCA_F[2] + 160], [45, 20, 55], EC("pedal",SYSTEM_COLORS.swGrip), 1.2, "rgba(20,25,30,0.8)");

  cylinder(sc, add(pBalanceBar,[-40,0,0]), pMC_L, 16, EC("masterCyl",SYSTEM_COLORS.masterCyl), 1.2, 10, "rgba(217,162,56,0.4)");
  cylinder(sc, add(pBalanceBar,[40,0,0]),  pMC_R, 16, EC("masterCyl",SYSTEM_COLORS.masterCyl), 1.2, 10, "rgba(217,162,56,0.4)");
  
  box3D(sc, add(pMC_L, [0, -30, 45]), [36, 48, 32], EC("masterCyl",SYSTEM_COLORS.masterCyl), 1.1, "rgba(217,162,56,0.45)");
  box3D(sc, add(pMC_R, [0, -30, 45]), [36, 48, 32], EC("masterCyl",SYSTEM_COLORS.masterCyl), 1.1, "rgba(217,162,56,0.45)");

  if(S.show.brake_hyd){
    const hF = S.front.hp, hR = S.rear.hp;
    L3(sc, pMC_L, [-hF.UCA_F[0], yF, hF.UCA_F[2]+20], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.3);
    L3(sc, pMC_L, [hF.UCA_F[0], yF, hF.UCA_F[2]+20], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.3);
    L3(sc, pMC_R, [0, yF-100, hF.LCA_F[2]], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.4);
    L3(sc, [0, yF-100, hF.LCA_F[2]], [0, yR+140, hR.LCA_F[2]], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.4);
    L3(sc, [0, yR+140, hR.LCA_F[2]], [-hR.UCA_F[0], yR, hR.UCA_F[2]+20], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.2);
    L3(sc, [0, yR+140, hR.LCA_F[2]], [hR.UCA_F[0], yR, hR.UCA_F[2]+20], EC("brakeLine",SYSTEM_COLORS.brakeLine), 1.2);
  }
}

/* 5. 车轮端与悬架总成装配 */
function addAxleAssemblyPRO(sc, M, m, sx, yOff, axis){
  if(!M || !M.n || !m) return;
  const state = S[axis];
  const T=p=>[p[0]*sx, p[1]+yOff, p[2]];
  const N=id=>T(M.n[M.idx[id]].p);
  const LBJ=N("LBJ"), UBJ=N("UBJ"), WC=N("WC"), TRO=N("TRO");
  const LAF=N("LCA_F"), LAR=N("LCA_R"), UAF=N("UCA_F"), UAR=N("UCA_R");
  const ST_O=N("STRUT_OUT"), ST_I=N("STRUT_IN");
  const RK_A=N("RCK_AX_A"), RK_B=N("RCK_AX_B"), RK_D=N("RCK_DMP"), DMP_B=N("DMP_BODY");

  const ax=nrm([m.ax[0]*sx, m.ax[1], m.ax[2]]);
  const kg=T(m.kg);
  const tR=state.tire.R, tW=state.tire.W, rimR=state.tire.rim, dR=state.tire.disc;
    const _eU0=nrm(sub([0,0,1],mul(ax,dot([0,0,1],ax)))), _eV0=cross(ax,_eU0);
  let _spin = 0;
  if(window._tireSpinAngles) {
    if(M === SIM.FL) _spin = window._tireSpinAngles.FL;
    else if(M === SIM.FR) _spin = window._tireSpinAngles.FR;
    else if(M === SIM.RL) _spin = window._tireSpinAngles.RL;
    else if(M === SIM.RR) _spin = window._tireSpinAngles.RR;
  } else {
    _spin = window._tireSpinAngle || 0;
  }
  const _cosS = Math.cos(_spin*sx), _sinS = Math.sin(_spin*sx);
  const eU = add(mul(_eU0, _cosS), mul(_eV0, _sinS));
  const eV = add(mul(_eU0, -_sinS), mul(_eV0, _cosS));

  if(S.show.face){
    PL(sc,[LAF,LBJ,LAR,LAF],EC("lca",SYSTEM_COLORS.rigArm),1,null,EC("lcaFill",SYSTEM_COLORS.arm));
    PL(sc,[UAF,UBJ,UAR,UAF],EC("uca",SYSTEM_COLORS.rigArm),1,null,EC("ucaFill",SYSTEM_COLORS.arm));
    PL(sc,[LBJ,UBJ,WC,LBJ],EC("knu",SYSTEM_COLORS.knu),1,null,EC("knuFill",SYSTEM_COLORS.knuF));
  }

  if(state.arch === "direct"){
    if(S.show.elastic){
      // 传统双叉臂直立外置减振弹簧一体柱 (Direct Coilover Damper Strut)
      const u = nrm(sub(DMP_B, ST_O)), L = dst(ST_O, DMP_B);
      const bodyA = add(ST_O, mul(u, L * 0.06)), bodyB = add(ST_O, mul(u, L * 0.54));
      cylinder(sc, bodyA, bodyB, 22, EC("damper", SYSTEM_COLORS.damper), 1.2, 14);
      L3(sc, bodyB, DMP_B, EC("damper", SYSTEM_COLORS.damper), 2.2);
      cylinder(sc, add(ST_O, mul(u, -6)), bodyA, 14, EC("damper", SYSTEM_COLORS.damper), 1, 10);
      PL(sc, springPts(add(ST_O, mul(u, L * 0.08)), add(DMP_B, mul(u, -L * 0.05)), 46, 7.5, 140), EC("spring", SYSTEM_COLORS.spring), 2.0);
      PL(sc, circPts(add(ST_O, mul(u, L * 0.08)), u, 54, 20), EC("spring", SYSTEM_COLORS.spring), 1.2);
      PL(sc, circPts(add(DMP_B, mul(u, -L * 0.05)), u, 54, 20), EC("spring", SYSTEM_COLORS.spring), 1.2);
    }
  } else {
    if(S.show.rocker){
      const rckCenter=lerp3(RK_A,RK_B,0.5);
      PL(sc,[rckCenter,ST_I,RK_D,rckCenter],EC("rocker",SYSTEM_COLORS.rocker),1.5,null,EC("rockerFill",SYSTEM_COLORS.rockerF));
      cylinder(sc,RK_A,RK_B,11,EC("rocker",SYSTEM_COLORS.rocker),1.2,12);
    }

    cylinder(sc,ST_O,ST_I,8.5,EC("strut",SYSTEM_COLORS.strut),1.5,12);

    if(S.show.elastic){
      const u=nrm(sub(DMP_B,RK_D)), L=dst(RK_D,DMP_B);
      cylinder(sc,add(RK_D,mul(u,L*0.06)),add(RK_D,mul(u,L*0.54)),19,EC("damper",SYSTEM_COLORS.damper),1,12);
      PL(sc,springPts(add(RK_D,mul(u,L*0.08)),add(DMP_B,mul(u,-L*0.05)),36,7.5,130),EC("spring",SYSTEM_COLORS.spring),1.8);
    }
  }

  if(S.show.halfshaft){
    const diffP = [140*sx, yOff, 260];
    const hubP = sub(WC, mul(ax, 20*sx));
    cylinder(sc, add(diffP, mul(nrm(sub(hubP,diffP)), 40)), sub(hubP, mul(nrm(sub(hubP,diffP)), 35)), 12.5, EC("shaft",SYSTEM_COLORS.shaft), 1.4, 10);
    if(S.show.cv_boot){
      bellows3D(sc, diffP, add(diffP, mul(nrm(sub(hubP,diffP)), 40)), 15, 25, 4, EC("cvBoot",SYSTEM_COLORS.cvBoot));
      bellows3D(sc, sub(hubP, mul(nrm(sub(hubP,diffP)), 35)), hubP, 17, 27, 4, EC("cvBoot",SYSTEM_COLORS.cvBoot));
    }
  }

  if(S.show.disc_vent){
    const d1 = add(WC, mul(ax, -14)), d2 = add(WC, mul(ax, 4));
    PL(sc, circPts(d1, ax, dR, 28, eU, eV), EC("disc",SYSTEM_COLORS.disc), 1.2);
    PL(sc, circPts(d2, ax, dR, 28, eU, eV), EC("disc",SYSTEM_COLORS.disc), 1.2);
    for(let k=0; k<6; k++){
      const an = k*PI/3;
      const pInner = add(WC, add(mul(eU, dR*0.55*cos(an)), mul(eV, dR*0.55*sin(an))));
      const pOuter = add(WC, add(mul(eU, dR*0.92*cos(an+0.35)), mul(eV, dR*0.92*sin(an+0.35))));
      L3(sc, add(pInner, mul(ax,4)), add(pOuter, mul(ax,4)), EC("discSlot",SYSTEM_COLORS.discSlot), 1.1);
    }
  }

  if(S.show.caliper){
    const ang = axis==='front' ? -2.1 : 2.1;
    const ca = add(mul(eU, cos(ang)), mul(eV, sin(ang)));
    const cb = cross(ax, ca);
    const cc = add(WC, mul(ca, dR*0.88));
    box3D(sc, cc, [65, 85, 40], EC("caliper",SYSTEM_COLORS.caliper), 1.5, "rgba(210,77,62,0.4)");
    cylinder(sc, add(cc, mul(ax, -20)), add(cc, mul(ax, 20)), 15, EC("caliper",SYSTEM_COLORS.caliperPin), 1.1, 10);
    if(S.show.brake_hyd){
      const hoseChassis = [state.hp.UCA_F[0]*sx, yOff, state.hp.UCA_F[2]+20];
      const pMid = lerp3(hoseChassis, cc, 0.5); pMid[2] -= 25;
      PL(sc, [hoseChassis, pMid, cc], EC("hose",SYSTEM_COLORS.hose), 2.2);
    }
  }

  if(S.show.wheel){
    const ci=add(WC,mul(ax,-tW/2)), co=add(WC,mul(ax,tW/2));
    const ro=add(WC,mul(ax,tW/2-14));
    PL(sc,circPts(ci,ax,tR,36,eU,eV),EC("tire",SYSTEM_COLORS.tire),1.3);
    PL(sc,circPts(co,ax,tR,36,eU,eV),EC("tire",SYSTEM_COLORS.tire),1.3);
    for(let k=0;k<18;k++){const an=2*PI*k/18;
      const o=add(mul(eU,tR*cos(an)),mul(eV,tR*sin(an)));
      L3(sc,add(ci,o),add(co,o),EC("tread",SYSTEM_COLORS.tread),1);}
    PL(sc,circPts(ro,ax,rimR,28,eU,eV),EC("rim",SYSTEM_COLORS.rim),1.2);
    for(let k=0;k<5;k++){const an=2*PI*k/5;
      const o=add(mul(eU,rimR*0.88*cos(an)),mul(eV,rimR*0.88*sin(an)));
      L3(sc,add(ro,mul(ax,-6)),add(ro,o),EC("rim",SYSTEM_COLORS.rim),1.5);}
  }

  // ARB merged from legacy addInstance
  if(S.show.arb && state.arb.d > 0.5){
    const g = arbGeom(state.hp.LBJ, state);
    const A0 = T([g.xa, g.ay, g.az]), E = T(g.E), Pd = T(g.P);
    L3(sc, A0, E, EC("arb",SYSTEM_COLORS.arb), 3.0);
    cylinder(sc, E, Pd, 7, EC("arb",SYSTEM_COLORS.arb), 1, 8);
    PL(sc, circPts(Pd, [1,0,0], 9, 10), EC("arb",SYSTEM_COLORS.arb), 1);
    PL(sc, circPts(E, [1,0,0], 9, 10), EC("arb",SYSTEM_COLORS.arb), 1);
  }

  if(axis==='front'){
    const RCK = [S.front.hp.RACK[0]*sx - S.rack, S.front.hp.RACK[1]+yOff, S.front.hp.RACK[2]];
    cylinder(sc, RCK, TRO, 8.5, EC("tierod",SYSTEM_COLORS.tie), 1.3, 10);
  }

  if(S.show.kp){
    const d=nrm(sub(LBJ,UBJ));
    const a=add(UBJ,mul(d,-55)), b=add(UBJ,mul(d,dst(UBJ,LBJ)+dst(LBJ,kg)+12));
    L3(sc,a,b,EC("kp",SYSTEM_COLORS.kp),1.5,[5,3]);
  }

  M.L.forEach(l=>{
    const a=T(M.n[l.a].p),b=T(M.n[l.b].p);
    if(l.type==="R") L3(sc,a,b,l.grp==="strut"?EC("strut",SYSTEM_COLORS.strut):(l.grp==="steer"?EC("tierod",SYSTEM_COLORS.tie):EC("rig",SYSTEM_COLORS.rig)),1.1);
  });
  if(S.show.node) M.n.forEach(n=>ND(sc,T(n.p),n.fix,n.id,n.zh,sx,axis));
}

function buildScene(){
  /* PRO 渲染入口：完整底盘模型（2026-08-27 已清除 legacy addShared/drawSubframe/addInstance 死代码） */
  return buildScenePRO();
}

/* ================================ 9. 四视口正交/透视投影引擎 ================================ */
const VDEF=[
  {key:"front",zh:"正视图",en:"FRONT VIEW",ax:"X-Z",bx:[1,0,0],by:[0,0,1],type:"o",note:"+Y⊗车头  +X→外侧"},
  {key:"top",  zh:"俯视图",en:"PLAN VIEW", ax:"X-Y",bx:[1,0,0],by:[0,1,0],type:"o",note:"+Z⊙向上  ↑车头"},
  {key:"side", zh:"侧视图",en:"SIDE VIEW", ax:"Y-Z",bx:[0,1,0],by:[0,0,1],type:"o",note:"+X⊙外侧  →车头"},
  {key:"iso",  zh:"等轴测",en:"ISOMETRIC", ax:"3D", type:"p",note:"左键旋转 · 滚轮缩放"}
];
const VW=[];

function initViews(){
  const vp=document.getElementById("vp");
  VDEF.forEach((d)=>{
    const w=document.createElement("div");w.className="vw";w.dataset.k=d.key;
    w.innerHTML='<div class="vwh"><b>'+d.zh+'</b>'+d.en+' <span class="vax">['+d.ax+']</span>'+
      '<span class="vi">'+d.note+'</span><span class="vb" title="适应">F</span><span class="vb" title="最大化">M</span></div>'+
      '<canvas></canvas>';
    vp.appendChild(w);
    const v=Object.assign({},d,{el:w,cv:w.querySelector("canvas"),w:10,h:10,dpr:1,
      s:0.5,cx:0,cy:0,az:-35*D2R,elv:24*D2R,dist:3200,tgt:[420,0,340],mx:false});
    v.ctx=v.cv.getContext("2d"); VW.push(v);
    const bts=w.querySelectorAll(".vb");
    bts[0].onclick=e=>{e.stopPropagation();fitView(v);};
    bts[1].onclick=e=>{e.stopPropagation();toggleMax(v);};
    hookView(v);
    w.addEventListener("mouseenter",()=>{VW.forEach(q=>q.el.classList.remove("act"));w.classList.add("act");});
  });
  const ro=new ResizeObserver(()=>{VW.forEach(sizeView);});
  ro.observe(vp); VW.forEach(sizeView);
}

function sizeView(v){
  const r=v.cv.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(10,Math.round(r.width)),h=Math.max(10,Math.round(r.height));
  if(v.w!==w||v.h!==h||v.dpr!==dpr){
    v.w=w;v.h=h;v.dpr=dpr;v.cv.width=w*dpr;v.cv.height=h*dpr;
    v.ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!v.inited){fitView(v);v.inited=true;}
  }
}
function toggleMax(v){
  const vp=document.getElementById("vp"); const on=!v.mx;
  VW.forEach(q=>{q.mx=false;q.el.classList.remove("mx");});
  if(on){v.mx=true;v.el.classList.add("mx");vp.classList.add("max0");}else vp.classList.remove("max0");
  setTimeout(()=>VW.forEach(sizeView),0);
}
function camIso(v){
  const ce=cos(v.elv),se=sin(v.elv), dir=[ce*cos(v.az),ce*sin(v.az),se];
  v.eye=add(v.tgt,mul(dir,v.dist)); v.fw=nrm(sub(v.tgt,v.eye));
  v.rt=nrm(cross(v.fw,[0,0,1])); v.up=cross(v.rt,v.fw);
}
function P2(v,p){
  if(v.type==="o") return[v.w/2+(dot(p,v.bx)-v.cx)*v.s, v.h/2-(dot(p,v.by)-v.cy)*v.s];
  const q=sub(p,v.eye),z=dot(q,v.fw); if(z<80)return null;
  const f=v.dist/z; return[v.w/2+dot(q,v.rt)*f*v.s, v.h/2-dot(q,v.up)*f*v.s];
}
function fitPoints(){
  const pts=[]; if(!SIM.FR)return[[0,0,0],[900,-1400,760],[-900,1400,0]];
  const yF = S.wb/2, yR = -S.wb/2;
  const inst=[[SIM.FR,1,yF], [SIM.RR,1,yR]];
  if(S.show.mirror){inst.push([SIM.FL,-1,yF]); inst.push([SIM.RL,-1,yR]);}
  inst.forEach(q=>{
    const M=q[0],sx=q[1],yOff=q[2];
    M.n.forEach(n=>pts.push([n.p[0]*sx, n.p[1]+yOff, n.p[2]]));
  });
  pts.push([0,0,0]); return pts;
}
function fitView(v){
  if(v.w<20||v.h<20){v.s=0.5;return;}   // 防初次布局竞态 (2026-08-24)
  const pts=fitPoints();
  if(v.type==="o"){
    let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    pts.forEach(p=>{const a=dot(p,v.bx),b=dot(p,v.by);
      if(a<a0)a0=a;if(a>a1)a1=a;if(b<b0)b0=b;if(b>b1)b1=b;});
    v.cx=(a0+a1)/2;v.cy=(b0+b1)/2;
    v.s=Math.min((v.w-30)/Math.max(1,a1-a0),(v.h-34)/Math.max(1,b1-b0));
  }else{
    let c=[0,0,0];pts.forEach(p=>c=add(c,p));c=mul(c,1/pts.length);
    let r=1;pts.forEach(p=>r=Math.max(r,dst(p,c)));
    v.tgt=c;v.dist=Math.max(2600,r*4.2);v.s=Math.min(v.w,v.h)/(r*2.2);
    camIso(v);
  }
}

/* ================================ 10. 渲染绘制与 HUD ================================ */
function dash(ctx,d){ctx.setLineDash(d||[]);}

function dimLine(ctx,A,B,txt,off,col){
  const dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy);
  if(L<1)return;
  const nx=-dy/L,ny=dx/L;
  const a=[A[0]+nx*off,A[1]+ny*off],b=[B[0]+nx*off,B[1]+ny*off];
  ctx.strokeStyle=col||C.dim;ctx.lineWidth=1;dash(ctx,[]);
  ctx.beginPath();
  ctx.moveTo(A[0]+nx*(off>0?4:-4),A[1]+ny*(off>0?4:-4));ctx.lineTo(a[0]+nx*5,a[1]+ny*5);
  ctx.moveTo(B[0]+nx*(off>0?4:-4),B[1]+ny*(off>0?4:-4));ctx.lineTo(b[0]+nx*5,b[1]+ny*5);
  ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);
  const ux=dx/L,uy=dy/L,t=4.5;
  ctx.moveTo(a[0]-ux*t+nx*t,a[1]-uy*t+ny*t);ctx.lineTo(a[0]+ux*t-nx*t,a[1]+uy*t-ny*t);
  ctx.moveTo(b[0]-ux*t+nx*t,b[1]-uy*t+ny*t);ctx.lineTo(b[0]+ux*t-nx*t,b[1]+uy*t-ny*t);
  ctx.stroke();
  const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
  ctx.font="8.5px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
  const w=ctx.measureText(txt).width+5;
  ctx.fillStyle=C.bg;ctx.fillRect(mx-w/2,my-6,w,11);
  ctx.fillStyle=C.dimT;ctx.fillText(txt,mx,my);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
}

function angArc(ctx,O,r,a0,a1,txt,col){
  if(!O||!(r>0))return;   // 防负半径竞态 (2026-08-24)
  ctx.strokeStyle=col||C.dim;ctx.lineWidth=1;dash(ctx,[3,2]);
  ctx.beginPath();ctx.arc(O[0],O[1],r,Math.min(a0,a1),Math.max(a0,a1));ctx.stroke();dash(ctx,[]);
  const am=(a0+a1)/2;
  ctx.font="8.5px ui-monospace,monospace";ctx.fillStyle=col||C.dimT;ctx.textAlign="left";
  ctx.fillText(txt,O[0]+cos(am)*(r+6),O[1]+sin(am)*(r+6));
}

function drawOverlay(v){
  if(v.key==="top")drawTrackOverlay(v);
  const ctx = v.ctx;
  const yF = S.wb/2, yR = -S.wb/2;

  /* ---- 1. 正视图：瞬心 IC / 侧倾中心 RC / KPI / Camber / 主销偏移距 ---- */
  if(v.key === "front"){
    const isF = S.axis === 'front';
    const m = isF ? SIM.mFR : SIM.mRR;
    const mL = isF ? SIM.mFL : SIM.mRL;
    const state = S[S.axis];
    const yOff = isF ? yF : yR;
    if(!m) return;

    if(S.show.ic && m.ic){
      const cpS = P2(v, [m.cp[0], yOff, m.cp[2]]);
      const icS = P2(v, [m.ic[0], yOff, m.ic[1]]);
      const lp = axisAtY(state.hp.LCA_F, state.hp.LCA_R, m.wc[1]);
      const up = axisAtY(state.hp.UCA_F, state.hp.UCA_R, m.wc[1]);
      const l1 = P2(v, [lp[0], yOff, lp[2]]), l2 = P2(v, [m.lbj[0], yOff, m.lbj[2]]);
      const u1 = P2(v, [up[0], yOff, up[2]]), u2 = P2(v, [m.ubj[0], yOff, m.ubj[2]]);
      
      dash(ctx, [6,3]); ctx.lineWidth = 1; ctx.strokeStyle = C.ic;
      ctx.beginPath();
      ctx.moveTo(l1[0], l1[1]); ctx.lineTo(icS[0], icS[1]);
      ctx.moveTo(u1[0], u1[1]); ctx.lineTo(icS[0], icS[1]);
      ctx.moveTo(cpS[0], cpS[1]); ctx.lineTo(icS[0], icS[1]);
      ctx.stroke(); dash(ctx, []);

      ctx.strokeStyle = C.ic; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(icS[0]-7, icS[1]); ctx.lineTo(icS[0]+7, icS[1]);
      ctx.moveTo(icS[0], icS[1]-7); ctx.lineTo(icS[0], icS[1]+7);   /* F-42（2026-08-30）：竖线端点应为 (x,y+7)，旧实现写成斜线 */
      ctx.stroke();
      ctx.fillStyle = C.ic; ctx.font = "8.5px ui-monospace,monospace";
      ctx.fillText("IC 瞬心", icS[0]+9, icS[1]-4);

      // RC 侧倾中心
      const rc = SIM.rc2 ? SIM.rc2 : (m.rcH!==null ? [0, m.rcH] : null);
      if(rc){
        const rS = P2(v, [rc[0], yOff, rc[1]]);
        if(mL && mL.ic){
          const cl = P2(v, [-mL.cp[0], yOff, mL.cp[2]]);
          dash(ctx, [6,3]); ctx.strokeStyle = C.ic;
          ctx.beginPath(); ctx.moveTo(cl[0], cl[1]); ctx.lineTo(rS[0], rS[1]); ctx.stroke(); dash(ctx, []);
        }
        ctx.strokeStyle = C.rc; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(rS[0], rS[1], 4.5, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rS[0]-9, rS[1]); ctx.lineTo(rS[0]+9, rS[1]);
        ctx.moveTo(rS[0], rS[1]-9); ctx.lineTo(rS[0]+9, rS[1]+9); ctx.stroke();
        ctx.fillStyle = C.rc; ctx.fillText("RC 侧倾中心 "+fmt(rc[1],1)+"mm", rS[0]+11, rS[1]-4);
      }
    }

    if(S.show.dim){
      const O = P2(v, [0, yOff, m.cp[2]]), Cp = P2(v, [m.cp[0], yOff, m.cp[2]]);
      dimLine(ctx, O, Cp, "轮距半宽 "+fmt(m.cp[0],1), 34, C.dim);
      const K = P2(v, [m.kg[0], yOff, m.kg[2]]);
      dimLine(ctx, K, Cp, "主销偏移距 "+fmt(m.scrub,1), -30, C.kpg);
      
      const Mcur = isF ? SIM.FR : SIM.RR;
      const W0 = P2(v, [m.wc[0], yOff, Mcur.n[Mcur.idx.WC].p0[2]]), W1 = P2(v, [m.wc[0], yOff, m.wc[2]]);
      if(abs(m.tr) > 0.5) dimLine(ctx, W0, W1, "轮跳 "+sfmt(m.tr,1), 46, C.path);

      // KPI 主销内倾角
      const kb = P2(v, [m.lbj[0], yOff, m.lbj[2]]), kt = P2(v, [m.ubj[0], yOff, m.ubj[2]]);
      const a0 = atan2(kt[1]-kb[1], kt[0]-kb[0]);
      angArc(ctx, kb, 52, -PI/2, a0, "KPI "+fmt(m.kpi,2)+"°", C.kp);

      // Camber 外倾角
      const wcS = P2(v, [m.wc[0], yOff, m.wc[2]]);
      const up = [-m.ax[2], m.ax[0]];
      const a1 = atan2(-up[1], up[0]);
      angArc(ctx, wcS, state.tire.R * v.s * 0.72, -PI/2, a1, "γ "+fmt(m.cam,2)+"°", C.knu);
    }
  }

  /* ---- 2. 侧视图：后倾角 Caster / 拖距 Trail / 侧视瞬心 SVIC & Anti-Dive ---- */
  if(v.key === "side" && S.show.dim){
    const isF = S.axis === 'front';
    const m = isF ? SIM.mFR : SIM.mRR;
    const yOff = isF ? yF : yR;
    if(!m) return;

    const kb = P2(v, [0, m.lbj[1]+yOff, m.lbj[2]]), kt = P2(v, [0, m.ubj[1]+yOff, m.ubj[2]]);
    const a0 = atan2(kt[1]-kb[1], kt[0]-kb[0]);
    angArc(ctx, kb, 55, -PI/2, a0, "后倾 "+fmt(m.cast,2)+"°", C.kp);
    const K = P2(v, [0, m.kg[1]+yOff, m.kg[2]]), Cp = P2(v, [0, m.cp[1]+yOff, m.cp[2]]);
    dimLine(ctx, Cp, K, "拖距 "+fmt(m.trail,1), -26, C.kpg);

    if(m.svic){
      const A = P2(v, [0, m.cp[1]+yOff, m.cp[2]]), B = P2(v, [0, m.svic[0]+yOff, m.svic[1]]);
      dash(ctx, [6,3]); ctx.strokeStyle = C.ic; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); dash(ctx, []);
      ctx.fillStyle = C.ic; ctx.font = "8.5px ui-monospace,monospace";
      ctx.fillText("→侧视瞬心 抗俯仰 "+(m.anti===null?"--":fmt(m.anti,0)+"%"), A[0]+14, A[1]-8);
    }
  }

  /* ---- 3. 俯视图：车轮中心基准线 / 角度扇形弧 / Toe-In & Toe-Out 辅助线 / 转向中心 ---- */
  if(v.key === "top"){
    const drawSteerGuide = (mm, sx, yAxisOff, labelPrefix, state) => {
      if(!mm) return;
      const wc = [mm.wc[0]*sx, mm.wc[1]+yAxisOff, mm.wc[2]];
      const fWheel = nrm([-mm.ax[1]*sx, mm.ax[0], 0]);
      
      const extL = 580;
      const A_wheel = P2(v, sub(wc, mul(fWheel, extL)));
      const B_wheel = P2(v, add(wc, mul(fWheel, extL)));
      dash(ctx, [7,4]); ctx.strokeStyle = C.knu; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(A_wheel[0], A_wheel[1]); ctx.lineTo(B_wheel[0], B_wheel[1]); ctx.stroke();

      const A_axis = P2(v, [wc[0], wc[1]-extL, wc[2]]);
      const B_axis = P2(v, [wc[0], wc[1]+extL, wc[2]]);
      dash(ctx, [4,4]); ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(A_axis[0], A_axis[1]); ctx.lineTo(B_axis[0], B_axis[1]); ctx.stroke();
      dash(ctx, []);

      const O = P2(v, wc);
      const aa = atan2(B_axis[1]-O[1], B_axis[0]-O[0]);
      const bb = atan2(B_wheel[1]-O[1], B_wheel[0]-O[0]);
      const currentToe = sx > 0 ? -mm.toe : mm.toe;
      const toeState = abs(mm.toe) < 0.005 ? "PARALLEL" : (mm.toe > 0 ? "TOE-IN" : "TOE-OUT");
      const lbl = labelPrefix + " " + sfmt(currentToe, 2) + "° (" + toeState + ")";
      angArc(ctx, O, state.tire.R * v.s * 0.95, aa, bb, lbl, C.knu);
    };

    drawSteerGuide(SIM.mFR, 1, yF, "前右 FR", S.front);
    if(S.show.mirror) drawSteerGuide(SIM.mFL, -1, yF, "前左 FL", S.front);

    drawSteerGuide(SIM.mRR, 1, yR, "后右 RR", S.rear);
    if(S.show.mirror) drawSteerGuide(SIM.mRL, -1, yR, "后左 RL", S.rear);

    if(S.show.dim && SIM.mFL && abs(S.rack) > 2){
      const ak = ackermann('front');
      if(ak && ak.icr){
        const P = P2(v, [ak.icr[0], ak.icr[1]+yF, 0]);
        if(P && P[0] > -4000 && P[0] < 8000){
          ctx.strokeStyle = C.ic; ctx.lineWidth = 1; dash(ctx, [4,3]);
          const a = P2(v, [SIM.mFR.cp[0], SIM.mFR.cp[1]+yF, 0]);
          const b = P2(v, [-SIM.mFL.cp[0], SIM.mFL.cp[1]+yF, 0]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(P[0], P[1]);
          ctx.moveTo(b[0], b[1]); ctx.lineTo(P[0], P[1]); ctx.stroke(); dash(ctx, []);
          ctx.strokeStyle = C.ic; ctx.beginPath();
          ctx.moveTo(P[0]-6, P[1]); ctx.lineTo(P[0]+6, P[1]);
          ctx.moveTo(P[0], P[1]-6); ctx.lineTo(P[0]+6, P[1]);
          ctx.stroke();
          ctx.fillStyle = C.ic; ctx.fillText("转向中心 ICR", P[0]+8, P[1]-4);
        }
      }
    }
  }
}

function drawAll(){
  const sc=buildScene(); PICK.length=0;
  VW.forEach(v=>{if(document.getElementById("vp").classList.contains("max0")&&!v.mx)return;drawView(v,sc);});
}
function drawView(v,sc){
  const ctx=v.ctx; if(v.type==="p") camIso(v);
  ctx.save(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,v.w,v.h);
  ctx.lineJoin="round";ctx.lineCap="butt";

  drawGrid(v);

  for(let i=0;i<sc.length;i++){
    const o=sc[i];
    if(o.k==="l"){
      const A=P2(v,o.a),B=P2(v,o.b);if(!A||!B)continue;
      ctx.beginPath();dash(ctx,o.d);ctx.strokeStyle=o.c;ctx.lineWidth=o.w;
      if(o.al!==undefined)ctx.globalAlpha=o.al;
      ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();ctx.globalAlpha=1;
    }else if(o.k==="p"){
      ctx.beginPath();dash(ctx,o.d);let st=false;
      for(let j=0;j<o.pts.length;j++){const Q=P2(v,o.pts[j]);
        if(!Q){st=false;continue;}
        if(!st){ctx.moveTo(Q[0],Q[1]);st=true;}else ctx.lineTo(Q[0],Q[1]);}
      if(o.f){ctx.fillStyle=o.f;ctx.fill();}
      ctx.strokeStyle=o.c;ctx.lineWidth=o.w;ctx.stroke();
    }else if(o.k==="n"){
      const A=P2(v,o.p);if(!A)continue;
      PICK.push({x:A[0],y:A[1],id:o.id,v:v,p:o.p,sx:o.sx||1,axis:o.axis});
      const sel=(UI.hover===o.id || UI.selHP===o.id) && S.axis===o.axis;
      dash(ctx,[]);
      ctx.fillStyle=C.bg;ctx.strokeStyle=sel?C.nodeSel:(o.fix?C.nodeFix:C.node);ctx.lineWidth=sel?1.8:1.3;
      if(o.fix){ctx.beginPath();ctx.rect(A[0]-3.5,A[1]-3.5,7,7);ctx.fill();ctx.stroke();}
      else{ctx.beginPath();ctx.arc(A[0],A[1],3.5,0,6.2832);ctx.fill();ctx.stroke();}
      if(S.show.label&&sel){
        ctx.fillStyle=C.nodeSel;ctx.font="8.5px ui-monospace,monospace";
        ctx.fillText(o.id,A[0]+6,A[1]-5);
      }
    }
  }
  dash(ctx,[]); 
  drawOverlay(v);
  drawHUD(v); 
  ctx.restore();
}

function drawGrid(v){
  const ctx=v.ctx; if(v.type==="p")return;
  const step=100,maj=500;
  const a0=v.cx-v.w/2/v.s,a1=v.cx+v.w/2/v.s,b0=v.cy-v.h/2/v.s,b1=v.cy+v.h/2/v.s;
  if((a1-a0)/step>280)return;
  ctx.lineWidth=1;dash(ctx,[]);
  for(let a=Math.ceil(a0/step)*step;a<=a1;a+=step){
    const x=Math.round(v.w/2+(a-v.cx)*v.s)+.5;
    ctx.beginPath();ctx.strokeStyle=(a%maj===0)?C.grid2:C.grid;
    ctx.moveTo(x,0);ctx.lineTo(x,v.h);ctx.stroke();
  }
  for(let b=Math.ceil(b0/step)*step;b<=b1;b+=step){
    const y=Math.round(v.h/2-(b-v.cy)*v.s)+.5;
    ctx.beginPath();ctx.strokeStyle=(b%maj===0)?C.grid2:C.grid;
    ctx.moveTo(0,y);ctx.lineTo(v.w,y);ctx.stroke();
  }
}

function drawHUD(v){
  const ctx=v.ctx;
  if(S.show.axis){
    const ox=48,oy=v.h-28,L0=24;
    const A=[["X",[1,0,0],"#d2543f"],["Y",[0,1,0],"#54a06a"],["Z",[0,0,1],"#2fa9d6"]];
    ctx.font="8.5px ui-monospace,monospace";
    A.forEach(a=>{
      let dx,dy;
      if(v.type==="o"){dx=dot(a[1],v.bx);dy=-dot(a[1],v.by);}
      else{const q=a[1];dx=dot(q,v.rt);dy=-dot(q,v.up);}
      ctx.strokeStyle=a[2];ctx.lineWidth=1.3;ctx.beginPath();
      ctx.moveTo(ox,oy);ctx.lineTo(ox+dx*L0,oy+dy*L0);ctx.stroke();
      ctx.fillStyle=a[2];ctx.fillText(a[0],ox+dx*L0*1.3-2,oy+dy*L0*1.3+3);
    });
  }
  ctx.fillStyle=C.txt3;ctx.font="8.5px ui-monospace,monospace";
  ctx.fillText("1:"+fmt(1/v.s,1),8,14);
}

