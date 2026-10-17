"use strict";
/* ================================ 1. 三款预设车型底盘总成与硬点定义 ================================ */
/* M8（2026-09-20）· 质量口径（四条不变量，改预设必须同时满足）：
     mTotal  = 整车总质量（含驾驶员）——**锚**，按真实车型取值
     mU      = 单侧非簧载质量（前/后各一）
     mSprung = mTotal − 2·(mU_f + mU_r)          …（不变量 1）
     mS_f + mS_r = mSprung                        …（不变量 2）
   改前两处都不成立：方程式 mSprung=185 而两轴 mS 之和=106、mTotal=235 而
   mSprung+非簧载=237（GT3 差 36kg、Baja 差 19kg）。后果不是"算错"——两内核
   都只用 **比例** mS_f/(mS_f+mS_r) 定静载分配，所以静载不受影响；问题是
   ①读数撒谎（用户看到 53+53=106 却写着簧载 185）②任何"绝对质量"用途
   （RIG 预载、固有频率、圈速）与分配链口径不一致，改一个字段就静默漂移。
   本轮按上式重标定：**比例逐位保持 ⇒ 静载分配零物理影响**（实测四款预设
   静载占比与 US 梯度未变），只把数字改对，并由 test_dom.js 的正则不变量守住。 */
/* M11（2026-09-20）· P12 外倾→抓地耦合上线后，预设按"减小前外倾 / 略增后外倾"重新配平：
   前轴外倾推力（Cg·(−γ)·Fz）在 1.65g 工况下占轴侧向力约 19%，而预设原本前外倾大于后外倾
   （−2.0 vs −1.5）⇒ 前轴多拿外倾推力、基线 US 从 0.21 掉到 0.14（越出 0.2~2.0 目标带）。
   实测敏感度：前外倾 +0.2° ⇒ US +0.024；后外倾 −0.3° ⇒ US +0.030。
   故 formula −1.5/−1.75、gt3 −2.70/−2.80、gt3_sport −0.55/−0.60；baja 越野工况外倾本就小、不动。
   改动幅度 ≤0.5°，落在真实调校范围内；重配平后四款 US 回到 0.22~0.27。 */
const VEHICLE_PRESETS = {
  formula: {
    name: "🏎️ FSC 方程式 (Formula SAE)",
    wb: 1550, hcg: 270, hs: 285, mTotal: 235, mSprung: 183,
    limF: [-45, 50], limR: [-45, 50],
    qs: { gx: 0.0, gy: 1.65, speed: 110, aeroF: 0, aeroBias: 0.48 },
    front: {
      arch: "pushrod",
      hp: {
        LCA_F: [175.0, 120.0, 105.0], LCA_R: [175.0, -120.0, 115.0], LBJ: [545.0, 8.0, 120.0],
        UCA_F: [225.0, 95.0, 280.0],  UCA_R: [225.0, -90.0, 285.0],  UBJ: [515.0, -14.0, 335.0],
        WC: [600.0, 0.0, 230.0],     TRO: [520.0, -100.0, 155.0],   RACK: [180.0, -110.0, 150.0],
        STRUT_OUT: [515.0, 8.0, 120.0], RCK_AX_A: [195.0, 20.0, 280.0], RCK_AX_B: [195.0, 70.0, 278.0],
        STRUT_IN: [235.0, 42.0, 320.0], RCK_DMP: [135.0, 45.0, 300.0], DMP_BODY: [55.0, 45.0, 150.0]
      },
      strutOutAttach: "lca",
      tire: { R: 230, W: 175, rim: 127, disc: 95, label: "18.0x6.0-10 HOOSIER FSAE" },
      cam0: -1.5, toe0: -0.05, mS: 91.5, mU: 12, kS: 105, kT: 180, cB: 6.0, cR: 11.0, tieTrim: 0,
      bushings: { LCA_F:[2500,2500,2500], LCA_R:[2500,2500,2500], UCA_F:[3500,3500,3500], UCA_R:[3500,3500,3500] },
      arb: { d: 0, dy: 35, dz: 85, t: 0.60, G: 79000 }
    },
    rear: {
      arch: "pushrod",
      hp: {
        LCA_F: [170.0, 120.0, 100.0], LCA_R: [170.0, -115.0, 110.0], LBJ: [530.0, 8.0, 115.0],
        UCA_F: [220.0, 95.0, 275.0],  UCA_R: [220.0, -90.0, 280.0],  UBJ: [500.0, -12.0, 325.0],
        WC: [580.0, 0.0, 235.0],     TRO: [505.0, -100.0, 150.0],   RACK: [175.0, -105.0, 145.0],
        STRUT_OUT: [500.0, 8.0, 115.0], RCK_AX_A: [190.0, 15.0, 280.0], RCK_AX_B: [190.0, 65.0, 278.0],
        STRUT_IN: [230.0, 40.0, 320.0], RCK_DMP: [130.0, 42.0, 300.0], DMP_BODY: [50.0, 42.0, 150.0]
      },
      strutOutAttach: "lca",
      tire: { R: 235, W: 205, rim: 127, disc: 95, label: "18.0x7.5-10 HOOSIER FSAE" },
      cam0: -1.75, toe0: 0.20, mS: 91.5, mU: 14, kS: 125, kT: 200, cB: 7.0, cR: 12.5, tieTrim: 0,
      bushings: { LCA_F:[2500,2500,2500], LCA_R:[2500,2500,2500], UCA_F:[3500,3500,3500], UCA_R:[3500,3500,3500] },
      arb: { d: 0, dy: 30, dz: 80, t: 0.55, G: 79000 }
    }
  },
  gt3: {
    name: "🏁 FIA GT3 赛车 (GT3 Race - 赛道低趴型)",
    wb: 2600, hcg: 290, hs: 310, mTotal: 1250, mSprung: 1064,
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
      cam0: -2.70, toe0: -0.15, mS: 574.3, mU: 45, kS: 120, kT: 260, cB: 9, cR: 14, tieTrim: 0,
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
      cam0: -2.80, toe0: 0.10, mS: 489.7, mU: 48, kS: 140, kT: 280, cB: 11, cR: 16, tieTrim: 0,
      bushings: { LCA_F:[8000,8000,8000], LCA_R:[8000,8000,8000], UCA_F:[10000,10000,10000], UCA_R:[10000,10000,10000] },
      arb: { d: 26, dy: 40, dz: 105, t: 0.60, G: 79000 }
    }
  },
  gt3_sport: {
    name: "🚗 FIA GT3 日常 (GT3 Sport - 街道运动型)",
    wb: 2600, hcg: 450, hs: 470, mTotal: 1350, mSprung: 1164,
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
      cam0: -0.55, toe0: 0.10, mS: 628.9, mU: 45, kS: 80, kT: 200, cB: 6, cR: 10, tieTrim: 0,
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
      cam0: -0.60, toe0: 0.15, mS: 535.1, mU: 48, kS: 90, kT: 220, cB: 7, cR: 12, tieTrim: 0,
      bushings: { LCA_F:[5000,5000,5000], LCA_R:[5000,5000,5000], UCA_F:[7000,7000,7000], UCA_R:[7000,7000,7000] },
      arb: { d: 22, dy: 40, dz: 105, t: 0.55, G: 79000 }
    }
  },
  baja: {
    name: "🏜️ SAE Baja 越野 (Baja Off-Road - 长行程越野型)",
    wb: 1400, hcg: 360, hs: 390, mTotal: 230, mSprung: 156,
    limF: [-75, 90], limR: [-75, 90],
    qs: { gx: 0.0, gy: 1.15, speed: 65, aeroF: 0, aeroBias: 0.48 },
    front: {
      arch: "direct",
      hp: {
        LCA_F: [170.0, 130.0, 185.0], LCA_R: [170.0, -130.0, 195.0], LBJ: [565.0, 10.0, 200.0],
        UCA_F: [220.0, 105.0, 390.0], UCA_R: [220.0, -105.0, 395.0], UBJ: [530.0, -18.0, 440.0],
        WC: [620.0, 0.0, 290.0], TRO: [545.0, -115.0, 240.0], RACK: [180.0, -130.0, 225.0],
        STRUT_OUT: [420.0, 10.0, 215.0], RCK_AX_A: [240.0, 20.0, 410.0], RCK_AX_B: [240.0, 70.0, 408.0],
        STRUT_IN: [260.0, 40.0, 480.0], RCK_DMP: [210.0, 45.0, 440.0], DMP_BODY: [230.0, 0.0, 580.0]
      },
      strutOutAttach: "lca",
      tire: { R: 290, W: 180, rim: 127, disc: 95, label: "23x7-10 BAJA ALL-TERRAIN" },
      cam0: -0.50, toe0: 0.05, mS: 78, mU: 18, kS: 36, kT: 120, cB: 5.5, cR: 9.5, tieTrim: 0,
      bushings: { LCA_F:[1200,1200,1200], LCA_R:[1200,1200,1200], UCA_F:[1500,1500,1500], UCA_R:[1500,1500,1500] },
      arb: { d: 0, dy: 45, dz: 120, t: 0.50, G: 79000 }
    },
    rear: {
      arch: "direct",
      hp: {
        LCA_F: [175.0, 130.0, 180.0], LCA_R: [175.0, -130.0, 190.0], LBJ: [565.0, 10.0, 195.0],
        UCA_F: [225.0, 100.0, 385.0], UCA_R: [225.0, -105.0, 390.0], UBJ: [530.0, -12.0, 435.0],
        WC: [620.0, 0.0, 290.0], TRO: [540.0, -110.0, 235.0], RACK: [180.0, -125.0, 220.0],
        STRUT_OUT: [420.0, 10.0, 210.0], RCK_AX_A: [250.0, 20.0, 410.0], RCK_AX_B: [250.0, 70.0, 408.0],
        STRUT_IN: [270.0, 40.0, 470.0], RCK_DMP: [220.0, 45.0, 430.0], DMP_BODY: [230.0, 0.0, 575.0]
      },
      strutOutAttach: "lca",
      tire: { R: 290, W: 230, rim: 127, disc: 95, label: "23x10-10 BAJA ALL-TERRAIN REAR" },
      cam0: -0.30, toe0: 0.25, mS: 78, mU: 19, kS: 42, kT: 120, cB: 6.0, cR: 10.5, tieTrim: 0,
      bushings: { LCA_F:[1200,1200,1200], LCA_R:[1200,1200,1200], UCA_F:[1500,1500,1500], UCA_R:[1500,1500,1500] },
      arb: { d: 0, dy: 40, dz: 110, t: 0.48, G: 79000 }
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
  /* M8（2026-09-20）：默认暂停。旧值 true 会让时域仿真在页面加载瞬间就开始积分
     （`S.play` 直接喂给 `simulate(dt)`），于是轮跳/外倾/侧偏角全都在跳：
     实测同一参数下两次截图读数不同（轮心垂向行程 -5.9 / 15.2 / 24.8 三个值），
     "调校"场景根本没法对照读数——这是清晰度的头号来源。
     现在默认静止在静力平衡点，由顶栏「▶ 运行」或空格键启动。 */
  play:false, travel:0, roll:0, rack:0, swAngle:0, driveTorque:250, brakePedal:35,
  exc:"sine", excA:50, excF:0.25, steerExc:"off", stA:40, stF:0.12,
  bsU:70, bsD:75, kBS:1000,
  road:"none", rA:15, rF:2.0, roadCls:"A", roadV:20,   /* M13/P6：ISO 8608 路面等级与车速（确定性信号不用）*/ wb:1620, hcg:290, hs:310, brkF:0.60,
  mTotal:240, mSprung:190,
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
  /* G29：tirecustom: 前缀 → 轮胎工坊自定义条目（预设下拉复用同一 select） */
  if (typeof type === "string" && type.indexOf("tirecustom:") === 0) {
    if (typeof TIRE_LAB !== "undefined") TIRE_LAB.activateCustom(type.slice("tirecustom:".length));
    return;
  }
  /* G31：ptcustom: 前缀 → 动力工坊自定义条目（同一 select，模式同 tirecustom） */
  if (typeof type === "string" && type.indexOf("ptcustom:") === 0) {
    if (typeof POWERTRAIN !== "undefined") POWERTRAIN.activateCustom(type.slice("ptcustom:".length));
    return;
  }
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
    S.bsD = Math.abs(p.limF[0]);
    S.bsU = p.limF[1];
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

  /* G29：换车型后重放自定义轮胎覆盖层（否则出厂胎覆盖用户胎） */
  if (typeof TIRE_LAB !== "undefined" && TIRE_LAB.active) TIRE_LAB.syncAfterPreset();
  if (typeof TIRE_LAB !== "undefined") TIRE_LAB.refreshPresetSelect();
  /* G31：换车型会重建下拉 DOM 内容 → 重挂自定义动力 optgroup（覆盖层不受车型影响） */
  if (typeof POWERTRAIN !== "undefined") POWERTRAIN.refreshPresetSelect();
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

/* ═══════════════════════════════════════════════════════════════════════════
   M15（2026-09-20）· 质量与惯量属性（前端镜像；真源 = engine/src/api/mass_properties.py）
   ───────────────────────────────────────────────────────────────────────────
   与引擎逐项同源：清单（33 件，非簧载左右镜像后 37 件）、轴映射、惯量算法、
   横摆惯量三档解析。**任何一侧改动必须同步另一侧**，由 test_dom 的跨语言逐项比对守住
   （解析 Python 的 FSAE_MASS_ITEMS 与本文 MASS_ITEMS_FSAE，逐件比质量与坐标）。

   轴映射（与本项目 X=外/Y=前/Z=上 对应，勿按 SAE 名字搬）：
     Ixx=Σm(y²+z²) 绕横向轴=俯仰 · Iyy=Σm(x²+z²) 绕纵向轴=侧倾 · Izz=Σm(x²+y²)=横摆
     Iyz=−Σm·y·z = 侧倾-横摆耦合（↔ SAE 的 Ixz）
   ═══════════════════════════════════════════════════════════════════════════ */
/* [id, 名称, 质量kg, x, y, z, kind]  —— 非簧载件只写左侧(+x)，由镜像展开 */
const MASS_ITEMS_FSAE = [
  ["un_f_tire","前轮辋+轮胎 18.0x6.0-10",7.0, 600,0,230,"uf"],
  ["un_f_upright","前立柱+轮毂+轴承",1.9, 600,0,230,"uf"],
  ["un_f_brake","前制动盘+卡钳",1.6, 560,0,230,"uf"],
  ["un_f_arm","前上下 A 臂半 + 球头",1.0, 350,0,180,"uf"],
  ["un_f_link","前推杆+摇臂半+紧固件",0.5, 450,0,250,"uf"],
  ["un_r_tire","后轮辋+轮胎 18.0x7.5-10",7.6, 580,1550,235,"ur"],
  ["un_r_upright","后立柱+轮毂+轴承",2.2, 580,1550,235,"ur"],
  ["un_r_brake","后制动盘+卡钳",1.8, 540,1550,235,"ur"],
  ["un_r_arm","后上下 A 臂半 + 球头",1.2, 340,1550,170,"ur"],
  ["un_r_link","后推杆+摇臂半+紧固件",0.6, 430,1550,245,"ur"],
  ["un_r_axle","驱动半轴+链轮（簧下段）",0.6, 450,1550,235,"ur"],
  ["sp_frame_f","车架前段",16.0, 0, 350,250,"sp"],
  ["sp_frame_r","车架后段",16.0, 0,1050,250,"sp"],
  ["sp_body_n","鼻锥+前覆盖件",3.0, 0, 200,350,"sp"],
  ["sp_body_t","侧箱+尾部覆盖件",3.0, 0,1000,350,"sp"],
  ["sp_powertrain","动力总成（单缸+排气+进气）",36.0, 0,1150,280,"sp"],
  ["sp_fuel","油箱+燃油",10.0, 0,1000,300,"sp"],
  ["sp_cooling_l","左侧箱散热器+冷却液",2.0,-250,1150,330,"sp"],
  ["sp_cooling_r","右侧箱散热器+冷却液",2.0, 250,1150,330,"sp"],
  ["sp_diff","差速器+链传动",4.0, 0,1350,250,"sp"],
  ["sp_rockers","摇臂+减振器体+ARB",4.0, 0, 800,280,"sp"],
  ["sp_steering","转向齿条+柱+方向盘",3.0, 0, 350,250,"sp"],
  ["sp_electric","ECU+线束+电池+灭火器",5.0, 0, 900,180,"sp"],
  ["sp_seat","座椅+安全带+防火墙",4.0, 0, 550,250,"sp"],
  ["sp_driver","驾驶员+装备",72.0, 0, 450,300,"sp"],
  ["sp_ballast","配重与杂项（紧固件/余量/垫片）",3.0, 0, 900,250,"sp"],
];
function massItemsFSAE(){
  const out=[];
  MASS_ITEMS_FSAE.forEach(it=>{
    const [id,name,m,x,y,z,kind]=it;
    out.push({id,name,m,x,y,z,kind});
    if(kind!=="sp" && Math.abs(x)>1e-9)
      out.push({id:id+"_R",name:name+"（右）",m,x:-x,y,z,kind});
  });
  return out;
}
function massPropsOf(items, wb){
  const mTot=items.reduce((s,i)=>s+i.m,0);
  const spr=items.filter(i=>i.kind==="sp"), unf=items.filter(i=>i.kind==="uf"), unr=items.filter(i=>i.kind==="ur");
  const mS=spr.reduce((s,i)=>s+i.m,0);
  const cx=items.reduce((s,i)=>s+i.m*i.x,0)/mTot, cy=items.reduce((s,i)=>s+i.m*i.y,0)/mTot,
        cz=items.reduce((s,i)=>s+i.m*i.z,0)/mTot;
  let Ixx=0,Iyy=0,Izz=0,Iyz=0,Ixy=0,Ixz=0;
  items.forEach(i=>{
    const dx=(i.x-cx)/1000, dy=(i.y-cy)/1000, dz=(i.z-cz)/1000, m=i.m;
    Ixx+=m*(dy*dy+dz*dz); Iyy+=m*(dx*dx+dz*dz); Izz+=m*(dx*dx+dy*dy);
    Iyz-=m*dy*dz; Ixy-=m*dx*dy; Ixz-=m*dx*dz;
  });
  const sprZ = mS>0 ? spr.reduce((s,i)=>s+i.m*i.z,0)/mS : 0;
  return {mass_kg:mTot, sprung_mass_kg:mS, unsprung_kg:unf.reduce((s,i)=>s+i.m,0)+unr.reduce((s,i)=>s+i.m,0),
    unFrontCorner:unf.reduce((s,i)=>s+i.m,0)/2, unRearCorner:unr.reduce((s,i)=>s+i.m,0)/2,
    cg:[cx,cy,cz], sprungCgZ:sprZ, Ixx,Iyy,Izz,Iyz,Ixy,Ixz,
    staticFrontPct:(1-cy/wb)*100, kz_mm:Math.sqrt(Izz/mTot)*1000};
}
let _massPropsCache=null;
function fsaeMassProps(){ if(!_massPropsCache) _massPropsCache=massPropsOf(massItemsFSAE(),1550); return _massPropsCache; }
/* 横摆惯量三档解析 —— 真源同 engine/src/api/mass_properties.py::resolve_yaw_inertia
   旧缺省 m(L²+1.6²)/12 是均质矩形板近似（t̄=1.6m 还是占位车宽）：对 FSAE 算得 97.18，
   而部件清单 68.78 ⇒ **偏高 41%**，两个内核都在用 ⇒ 瞬态横摆响应被系统性算钝。 */
function resolveYawInertia(declaredIz, massKg, wheelbaseMm){
  if(declaredIz) return {iz:declaredIz, src:"declared"};
  if(Math.abs(massKg-235)<=1.5 && Math.abs(wheelbaseMm-1550)<=5)
    return {iz:fsaeMassProps().Izz, src:"inventory:fsae"};
  const L=wheelbaseMm/1000;
  return {iz:massKg*(L*L+1.6*1.6)/12, src:"rectangle:approx"};
}
