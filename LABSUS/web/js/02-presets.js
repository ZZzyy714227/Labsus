"use strict";
/* ================================ 1. 三款预设车型底盘总成与硬点定义 ================================ */
const VEHICLE_PRESETS = {
  formula: {
    name: "🏎️ FSC 方程式 (Formula SAE)",
    wb: 1620, hcg: 290, hs: 310, mTotal: 240, mSprung: 195,
    limF: [-60, 65], limR: [-60, 65],
    qs: { gx: 0.0, gy: 1.6, speed: 110, aeroF: 1200, aeroBias: 0.48 },
    front: {
      arch: "pushrod",
      hp: {
        LCA_F: [260.0, 140.0, 130.0], LCA_R: [260.0, -120.0, 140.0], LBJ: [640.0, 10.0, 150.0],
        UCA_F: [350.0, 110.0, 340.0], UCA_R: [350.0, -100.0, 350.0], UBJ: [590.0, -15.0, 410.0],
        WC: [710.0, 0.0, 280.0], TRO: [600.0, -120.0, 185.0], RACK: [220.0, -135.0, 180.0],
        STRUT_OUT: [595.0, 10.0, 185.0], RCK_AX_A: [300.0, 15.0, 330.0], RCK_AX_B: [300.0, 70.0, 328.0],
        STRUT_IN: [315.0, 45.0, 400.0], RCK_DMP: [230.0, 48.0, 345.0], DMP_BODY: [30.0, 48.0, 170.0]
      },
      strutOutAttach: "lca",
      tire: { R: 280, W: 205, rim: 228.6, disc: 170, label: "205/45R13 FORMULA" },
      cam0: -2.5, toe0: -0.10, mS: 55, mU: 18, kS: 110, kT: 220, cB: 8, cR: 12, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.0,-1600],[-0.5,-950],[-0.2,-450],[-0.05,-120],[0.0,0],[0.05,150],[0.2,550],[0.5,1200],[1.0,2100]],
      bushings: { LCA_F:[2500,2500,2500], LCA_R:[2500,2500,2500], UCA_F:[3500,3500,3500], UCA_R:[3500,3500,3500] },
      arb: { d: 18, dy: 40, dz: 100, t: 0.62, G: 79000 }
    },
    rear: {
      arch: "pullrod",
      hp: {
        LCA_F: [250.0, 140.0, 115.0], LCA_R: [250.0, -130.0, 125.0], LBJ: [630.0, 10.0, 135.0],
        UCA_F: [340.0, 110.0, 320.0], UCA_R: [340.0, -110.0, 330.0], UBJ: [580.0, -15.0, 390.0],
        WC: [700.0, 0.0, 290.0], TRO: [590.0, -120.0, 170.0], RACK: [210.0, -130.0, 160.0],
        STRUT_OUT: [570.0, -15.0, 380.0], RCK_AX_A: [340.0, 25.0, 290.0], RCK_AX_B: [340.0, 75.0, 292.0],
        STRUT_IN: [370.0, 45.0, 255.0], RCK_DMP: [305.0, 60.0, 270.0], DMP_BODY: [25.0, 62.0, 310.0]
      },
      strutOutAttach: "uca",
      tire: { R: 290, W: 245, rim: 228.6, disc: 175, label: "245/40R13 REAR" },
      cam0: -1.8, toe0: 0.08, mS: 65, mU: 20, kS: 130, kT: 250, cB: 9, cR: 14, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.0,-1800],[-0.5,-1100],[-0.2,-520],[-0.05,-150],[0.0,0],[0.05,180],[0.2,650],[0.5,1400],[1.0,2400]],
      bushings: { LCA_F:[2500,2500,2500], LCA_R:[2500,2500,2500], UCA_F:[3500,3500,3500], UCA_R:[3500,3500,3500] },
      arb: { d: 16, dy: 35, dz: 95, t: 0.55, G: 79000 }
    }
  },
  gt3: {
    name: "🏁 FIA GT3 赛车 (GT3 Race - 赛道低趴型)",
    wb: 2600, hcg: 290, hs: 310, mTotal: 1250, mSprung: 1100,
    limF: [-55, 60], limR: [-55, 60],
    qs: { gx: 0.0, gy: 1.8, speed: 220, aeroF: 3600, aeroBias: 0.45 },
    front: {
      arch: "direct",
      hp: {
        LCA_F: [200.0, 155.0, 118.0], LCA_R: [200.0, -155.0, 126.0], LBJ: [706.0, 8.0, 132.0],
        UCA_F: [420.0, 110.0, 392.0], UCA_R: [420.0, -110.0, 396.0], UBJ: [652.0, -20.0, 446.0],
        WC: [772.0, 0.0, 300.0], TRO: [652.0, -142.0, 196.0], RACK: [248.0, -168.0, 178.0],
        STRUT_OUT: [540.0, 10.0, 150.0], RCK_AX_A: [340.0, 20.0, 380.0], RCK_AX_B: [340.0, 80.0, 378.0],
        STRUT_IN: [360.0, 50.0, 450.0], RCK_DMP: [260.0, 55.0, 400.0], DMP_BODY: [338.0, 0.0, 612.0]
      },
      strutOutAttach: "lca",
      tire: { R: 300, W: 265, rim: 228.6, disc: 180, label: "265/35R18 RACE SLICK" },
      cam0: -3.20, toe0: -0.15, mS: 320, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.2,-3200],[-0.5,-2100],[-0.2,-1100],[-0.05,-350],[0.0,0],[0.05,450],[0.2,1600],[0.5,2900],[1.2,4200]],
      bushings: { LCA_F:[8000,8000,8000], LCA_R:[8000,8000,8000], UCA_F:[10000,10000,10000], UCA_R:[10000,10000,10000] },
      arb: { d: 28, dy: 45, dz: 110, t: 0.65, G: 79000 }
    },
    rear: {
      arch: "direct",
      hp: {
        LCA_F: [210.0, 150.0, 125.0], LCA_R: [210.0, -160.0, 130.0], LBJ: [716.0, 8.0, 138.0],
        UCA_F: [430.0, 110.0, 400.0], UCA_R: [430.0, -110.0, 405.0], UBJ: [662.0, -18.0, 452.0],
        WC: [782.0, 0.0, 310.0], TRO: [662.0, -140.0, 202.0], RACK: [255.0, -165.0, 185.0],
        STRUT_OUT: [550.0, 10.0, 155.0], RCK_AX_A: [350.0, 20.0, 390.0], RCK_AX_B: [350.0, 80.0, 388.0],
        STRUT_IN: [370.0, 50.0, 460.0], RCK_DMP: [270.0, 55.0, 410.0], DMP_BODY: [348.0, 0.0, 622.0]
      },
      strutOutAttach: "lca",
      tire: { R: 310, W: 285, rim: 228.6, disc: 180, label: "285/35R18 RACE REAR" },
      cam0: -2.5, toe0: 0.10, mS: 360, mU: 48, kS: 140, kT: 280, cB: 11, cR: 16, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.2,-3600],[-0.5,-2400],[-0.2,-1300],[-0.05,-400],[0.0,0],[0.05,500],[0.2,1800],[0.5,3200],[1.2,4600]],
      bushings: { LCA_F:[8000,8000,8000], LCA_R:[8000,8000,8000], UCA_F:[10000,10000,10000], UCA_R:[10000,10000,10000] },
      arb: { d: 26, dy: 40, dz: 105, t: 0.60, G: 79000 }
    }
  },
  gt3_sport: {
    name: "🚗 FIA GT3 日常 (GT3 Sport - 街道运动型)",
    wb: 2600, hcg: 450, hs: 470, mTotal: 1350, mSprung: 1200,
    limF: [-70, 75], limR: [-70, 75],
    qs: { gx: 0.0, gy: 1.2, speed: 160, aeroF: 1500, aeroBias: 0.46 },
    front: {
      arch: "direct",
      hp: {
        LCA_F: [215.0, 150.0, 152.0], LCA_R: [215.0, -150.0, 162.0], LBJ: [705.0, 8.0, 178.0],
        UCA_F: [395.0, 120.0, 452.0], UCA_R: [395.0, -120.0, 456.0], UBJ: [655.0, -18.0, 512.0],
        WC: [762.0, 0.0, 322.0], TRO: [660.0, -150.0, 225.0], RACK: [250.0, -175.0, 205.0],
        STRUT_OUT: [520.0, 10.0, 205.0], RCK_AX_A: [350.0, 20.0, 420.0], RCK_AX_B: [350.0, 85.0, 418.0],
        STRUT_IN: [370.0, 50.0, 500.0], RCK_DMP: [270.0, 55.0, 450.0], DMP_BODY: [350.0, 0.0, 660.0]
      },
      strutOutAttach: "lca",
      tire: { R: 322, W: 235, rim: 228.6, disc: 172, label: "235/40R18 SPORT ROAD" },
      cam0: -0.75, toe0: 0.10, mS: 340, mU: 45, kS: 80, kT: 200, cB: 6, cR: 10, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.0,-2200],[-0.5,-1400],[-0.2,-700],[-0.05,-200],[0.0,0],[0.05,250],[0.2,950],[0.5,1800],[1.0,2800]],
      bushings: { LCA_F:[5000,5000,5000], LCA_R:[5000,5000,5000], UCA_F:[7000,7000,7000], UCA_R:[7000,7000,7000] },
      arb: { d: 24, dy: 45, dz: 110, t: 0.60, G: 79000 }
    },
    rear: {
      arch: "direct",
      hp: {
        LCA_F: [225.0, 145.0, 158.0], LCA_R: [225.0, -155.0, 168.0], LBJ: [715.0, 8.0, 184.0],
        UCA_F: [405.0, 115.0, 458.0], UCA_R: [405.0, -125.0, 462.0], UBJ: [665.0, -16.0, 518.0],
        WC: [772.0, 0.0, 332.0], TRO: [670.0, -145.0, 230.0], RACK: [255.0, -170.0, 210.0],
        STRUT_OUT: [530.0, 10.0, 210.0], RCK_AX_A: [360.0, 20.0, 430.0], RCK_AX_B: [360.0, 85.0, 428.0],
        STRUT_IN: [380.0, 50.0, 510.0], RCK_DMP: [280.0, 55.0, 460.0], DMP_BODY: [360.0, 0.0, 670.0]
      },
      strutOutAttach: "lca",
      tire: { R: 332, W: 255, rim: 228.6, disc: 175, label: "255/40R18 SPORT REAR" },
      cam0: -0.50, toe0: 0.15, mS: 380, mU: 48, kS: 90, kT: 220, cB: 7, cR: 12, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.0,-2400],[-0.5,-1600],[-0.2,-800],[-0.05,-240],[0.0,0],[0.05,300],[0.2,1100],[0.5,2100],[1.0,3200]],
      bushings: { LCA_F:[5000,5000,5000], LCA_R:[5000,5000,5000], UCA_F:[7000,7000,7000], UCA_R:[7000,7000,7000] },
      arb: { d: 22, dy: 40, dz: 105, t: 0.55, G: 79000 }
    }
  },
  baja: {
    name: "🏜️ SAE Baja 越野 (Baja Off-Road - 长行程越野型)",
    wb: 2790, hcg: 520, hs: 550, mTotal: 360, mSprung: 280,
    limF: [-90, 100], limR: [-90, 100],
    qs: { gx: 0.0, gy: 0.95, speed: 65, aeroF: 150, aeroBias: 0.50 },
    front: {
      arch: "direct",
      hp: {
        LCA_F: [232.0, 168.0, 205.0], LCA_R: [232.0, -168.0, 218.0], LBJ: [724.0, 10.0, 244.0],
        UCA_F: [392.0, 132.0, 562.0], UCA_R: [392.0, -132.0, 568.0], UBJ: [668.0, -22.0, 642.0],
        WC: [792.0, 0.0, 396.0], TRO: [676.0, -162.0, 292.0], RACK: [262.0, -188.0, 272.0],
        STRUT_OUT: [560.0, 12.0, 272.0], RCK_AX_A: [330.0, 20.0, 540.0], RCK_AX_B: [330.0, 80.0, 538.0],
        STRUT_IN: [350.0, 50.0, 640.0], RCK_DMP: [250.0, 55.0, 570.0], DMP_BODY: [362.0, 0.0, 796.0]
      },
      strutOutAttach: "lca",
      tire: { R: 396, W: 265, rim: 216, disc: 176, label: "265/65R17 BAJA ALL-TERRAIN" },
      cam0: -0.30, toe0: 0.15, mS: 75, mU: 26, kS: 60, kT: 170, cB: 7, cR: 12, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.2,-1400],[-0.5,-900],[-0.2,-450],[-0.05,-120],[0.0,0],[0.05,180],[0.2,650],[0.5,1300],[1.2,2200]],
      bushings: { LCA_F:[1200,1200,1200], LCA_R:[1200,1200,1200], UCA_F:[1500,1500,1500], UCA_R:[1500,1500,1500] },
      arb: { d: 16, dy: 45, dz: 120, t: 0.50, G: 79000 }
    },
    rear: {
      arch: "direct",
      hp: {
        LCA_F: [235.0, 160.0, 200.0], LCA_R: [235.0, -160.0, 212.0], LBJ: [720.0, 10.0, 240.0],
        UCA_F: [390.0, 125.0, 550.0], UCA_R: [390.0, -135.0, 555.0], UBJ: [665.0, -18.0, 630.0],
        WC: [790.0, 0.0, 396.0], TRO: [670.0, -150.0, 285.0], RACK: [255.0, -175.0, 265.0],
        STRUT_OUT: [555.0, 10.0, 265.0], RCK_AX_A: [340.0, 25.0, 510.0], RCK_AX_B: [340.0, 75.0, 512.0],
        STRUT_IN: [370.0, 45.0, 440.0], RCK_DMP: [290.0, 60.0, 470.0], DMP_BODY: [355.0, 0.0, 786.0]
      },
      strutOutAttach: "lca",
      tire: { R: 396, W: 265, rim: 216, disc: 176, label: "265/65R17 BAJA REAR" },
      cam0: -0.20, toe0: 0.10, mS: 85, mU: 28, kS: 65, kT: 170, cB: 8, cR: 14, tieTrim: 0,
      damperMode: "table",
      vfTable: [[-1.2,-1600],[-0.5,-1050],[-0.2,-520],[-0.05,-140],[0.0,0],[0.05,200],[0.2,750],[0.5,1500],[1.2,2600]],
      bushings: { LCA_F:[1200,1200,1200], LCA_R:[1200,1200,1200], UCA_F:[1500,1500,1500], UCA_R:[1500,1500,1500] },
      arb: { d: 14, dy: 40, dz: 110, t: 0.48, G: 79000 }
    }
  }
};

const HP_META=[
  ["LCA_F","下摆臂前铰点","LWR ARM FRT PIVOT","chassis",1,0],
  ["LCA_R","下摆臂后铰点","LWR ARM RR PIVOT","chassis",1,0],
  ["LBJ",  "下球头销",    "LWR BALL JOINT", "lca",    0,2.0],
  ["UCA_F","上摆臂前铰点","UPR ARM FRT PIVOT","chassis",1,0],
  ["UCA_R","上摆臂后铰点","UPR ARM RR PIVOT","chassis",1,0],
  ["UBJ",  "上球头销",    "UPR BALL JOINT", "uca",    0,1.5],
  ["WC",   "轮心点",      "WHEEL CENTRE",   "knuckle",0,10.2],
  ["TRO",  "转向拉杆外点","TIE ROD OUTER",  "knuckle",0,0.9],
  ["RACK", "转向齿条内点","TIE ROD INNER",  "chassis",1,0],
  ["STRUT_OUT","推/拉杆外侧支点","STRUT OUT MOUNT","strut_out",0,1.2],
  ["RCK_AX_A", "摇臂转轴前基点","ROCKER PIVOT IN", "chassis",  1,0],
  ["RCK_AX_B", "摇臂转轴后基点","ROCKER PIVOT OUT","chassis",  1,0],
  ["STRUT_IN", "摇臂推拉杆输入点","ROCKER STRUT IN","rocker",  0,1.5],
  ["RCK_DMP",  "摇臂减振器输出点","ROCKER DAMPER OUT","rocker", 0,1.2],
  ["DMP_BODY", "内置减振器车身点","INBOARD DMP BODY","chassis", 1,0]
];

/* 全局活动仿真状态 (包含完整底盘与增量分析参数) */
const S={
  axis: "front", front: null, rear: null, vehicleType: "formula",
  mode:"kin", // 'kin' | 'rig' | 'quasi'
  play:true, travel:0, roll:0, rack:0, swAngle:0, driveTorque:250, brakePedal:35,
  exc:"sine", excA:50, excF:0.25, steerExc:"off", stA:40, stF:0.12,
  bsU:70, bsD:75, kBS:1000,
  road:"none", rA:15, rF:2.0, wb:1620, hcg:290, hs:310, brkF:0.60,
  mTotal:240, mSprung:195,
  trMin:-60, trMax:65,
  
  // 准静态工况增量参数
  qs:{
    gx: 0.0,
    gy: 1.6,
    speed: 110,
    aeroF: 1200,
    aeroBias: 0.48
  },
  
  // Baseline 快照比对
  baseline: null,
  hasBaseline: false,

  show:{entityColor:0,node:1,label:1,rigid:1,elastic:1,face:1,wheel:1,disc:1,chassis:1,steer:1,ground:1,
        dim:1,kp:1,kpsw:1,path:1,ic:1,force:0,mirror:1,axis:1,tirefill:0,arb:1,rocker:1,
        frame_main:1,frame_front:1,frame_side:1,frame_rear:1,powertrain:1,halfshaft:1,cv_boot:1,disc_vent:1,caliper:1,brake_hyd:1,master_cyl:1,steer_rack:1,steer_col:1,steer_wheel:1},
  t:0, simT:0, dyn:{on:false,z:0,v:0,load:0,fs:0,fd:0,pen:0,acc:0}
};

function loadVehiclePreset(type) {
  const p = VEHICLE_PRESETS[type];
  if(!p) return;
  S.vehicleType = type;
  S.wb = p.wb;
  S.hcg = p.hcg;
  S.hs = p.hs || (p.hcg + 20);
  S.mTotal = p.mTotal;
  S.mSprung = p.mSprung || (p.mTotal * 0.85);
  S.travel = 0; S.rack = 0; S.roll = 0; S.simT = 0;
  if(p.limF) {
    S.trMin = p.limF[0];
    S.trMax = p.limF[1];
  }
  if(p.qs) {
    S.qs.gx = p.qs.gx || 0;
    S.qs.gy = p.qs.gy || 1.0;
    S.qs.speed = p.qs.speed || 120;
    S.qs.aeroF = p.qs.aeroF || 1000;
    S.qs.aeroBias = p.qs.aeroBias || 0.5;
  }
  
  /* F-39（2026-08-30）：deepClone 双轨收敛——统一走 deepClone（JSON 深拷贝），
   不再散布 JSON.parse(JSON.stringify(...))。 */
  S.front = deepClone(p.front);
  S.rear = deepClone(p.rear);

  /* F-37（2026-08-30）：换车型必须清基线/引擎结果——旧实现 S.baseline 残留，
     Baseline Diff 拿旧车型曲线对比新车型；ENG/CH 结果同理。 */
  if(typeof S.baseline!=='undefined')S.baseline=null;
  if(typeof ENG!=='undefined'){ENG.result=null;}
  if(typeof CH!=='undefined'){CH.result=null;CH.busy=false;}

  if(typeof rebuild === 'function') rebuild();
  
  // Sync Left & Right UI panels if available
  const sel = document.getElementById("topVehSelect");
  if(sel) sel.value = type;
  
  const vehBtns = document.querySelectorAll(".veh-btn-tab");
  vehBtns.forEach(b => {
    if(b.dataset.veh === type) b.classList.add("on");
    else b.classList.remove("on");
  });
  
  const tbArch = document.getElementById("tbArch");
  if(tbArch) tbArch.textContent = (S.axis==='front'?'前悬架 ':'后悬架 ') + S[S.axis].arch.toUpperCase();
  
  const vehDesc = document.getElementById("vehPresetDesc");
  if(vehDesc) vehDesc.textContent = "当前载入: " + p.name;
  
  if(typeof UI !== 'undefined' && UI.sync) {
    UI.sync.forEach(f => { try{ f(); }catch(e){} });
  }
  if(typeof VW !== 'undefined') {
    VW.forEach(v => { sizeView(v); fitView(v); });
  }
}

function initData(){
  const p = VEHICLE_PRESETS["formula"];
  S.vehicleType = "formula";
  S.wb = p.wb; S.hcg = p.hcg; S.hs = p.hs || (p.hcg + 20);
  S.mTotal = p.mTotal; S.mSprung = p.mSprung || (p.mTotal * 0.85);
  S.front = deepClone(p.front);   /* F-39：统一 deepClone */
  S.rear = deepClone(p.rear);
}
initData();
window.S = S;
window.loadVehiclePreset = loadVehiclePreset;
window.VEHICLE_PRESETS = VEHICLE_PRESETS;

/* ================================ 2. 机构构建与多体投影求解 ================================ */
