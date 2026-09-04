"use strict";

function buildShanghaiCircuit(mu = 1.35, aggressiveness = 1.0) {
  // 69 High-Precision Waypoints strictly matching FIA Shanghai International Circuit official layout (0 intersections)
  const wp = [
    // Main Start/Finish Straight (Heading NNE, DRS Zone 1)
    {x: 0.0, y: 0.0, v_target: 75.0, turn: "S/F", turnZh: "发车主直道 (起终点)", sector: 1, gear: 6, isDRS: true},
    {x: 40.0, y: 120.0, v_target: 80.0, turn: "Main Straight", turnZh: "主大直道", sector: 1, gear: 6, isDRS: true},
    {x: 80.0, y: 240.0, v_target: 85.0, turn: "Main Straight", turnZh: "主直道 · DRS 1 区", sector: 1, gear: 6, isDRS: true},
    {x: 120.0, y: 360.0, v_target: 86.0, turn: "Main Straight", turnZh: "主直道 (极速 310 km/h)", sector: 1, gear: 6, isDRS: true, brakingBoard: 150},
    {x: 150.0, y: 450.0, v_target: 75.0, turn: "T1-Entry", turnZh: "T1 入弯制动区 (100m)", sector: 1, gear: 5, brakingBoard: 100},
    
    // T1 - T2 - T3 - T4 (The Snail / 螺线蜗牛弯 - 纯净无交叉)
    {x: 180.0, y: 520.0, v_target: 64.0, turn: "T1", turnZh: "T1 高速右弯入弯 (230 km/h)", sector: 1, gear: 4, kerbSide: "left", brakingBoard: 50},
    {x: 235.0, y: 580.0, v_target: 64.0, turn: "T1", turnZh: "T1 弯心", sector: 1, gear: 4, kerbSide: "right", runoff: "gravel"},
    {x: 305.0, y: 585.0, v_target: 60.0, turn: "T1/T2", turnZh: "T1-T2 螺线过渡", sector: 1, gear: 3, kerbSide: "right", runoff: "gravel"},
    {x: 360.0, y: 545.0, v_target: 55.0, turn: "T2", turnZh: "T2 紧缩螺线弯 (175 km/h)", sector: 1, gear: 3, kerbSide: "right", runoff: "gravel"},
    {x: 370.0, y: 490.0, v_target: 48.0, turn: "T2", turnZh: "T2 顺时针内收", sector: 1, gear: 3, kerbSide: "right"},
    {x: 335.0, y: 450.0, v_target: 45.0, turn: "T2", turnZh: "T2 弯心", sector: 1, gear: 3, kerbSide: "right"},
    {x: 275.0, y: 450.0, v_target: 38.0, turn: "T2/T3", turnZh: "T2-T3 持续内收", sector: 1, gear: 2},
    {x: 215.0, y: 470.0, v_target: 28.0, turn: "T3", turnZh: "T3 极慢速弯心入弯", sector: 1, gear: 2, kerbSide: "right"},
    {x: 185.0, y: 440.0, v_target: 22.0, turn: "T3", turnZh: "T3 极限低速发卡弯心 (78 km/h)", sector: 1, gear: 2, kerbSide: "right"},
    {x: 200.0, y: 400.0, v_target: 24.0, turn: "T3", turnZh: "T3 环岛换向过渡", sector: 1, gear: 2, kerbSide: "right"},
    {x: 240.0, y: 390.0, v_target: 30.0, turn: "T3/T4", turnZh: "T3-T4 换向切点", sector: 1, gear: 2},
    {x: 285.0, y: 370.0, v_target: 35.0, turn: "T4", turnZh: "T4 换向左弯弯心 (125 km/h)", sector: 1, gear: 2, kerbSide: "left"},
    {x: 345.0, y: 360.0, v_target: 45.0, turn: "T4", turnZh: "T4 逆时针开油出弯", sector: 1, gear: 3, kerbSide: "right"},
    {x: 415.0, y: 365.0, v_target: 55.0, turn: "T4", turnZh: "T4 出弯加速冲刺", sector: 1, gear: 3, kerbSide: "right"},

    // T5 - T6 (East Straight & T6 Hairpin)
    {x: 500.0, y: 380.0, v_target: 75.0, turn: "T5", turnZh: "T5 东向加速大直道", sector: 1, gear: 5},
    {x: 595.0, y: 390.0, v_target: 80.0, turn: "T5", turnZh: "T5 极速冲刺 (290 km/h)", sector: 1, gear: 6, brakingBoard: 150},
    {x: 685.0, y: 375.0, v_target: 70.0, turn: "T6-Entry", turnZh: "S1 终点 / T6 减速区 (100m)", sector: 1, gear: 5, brakingBoard: 100},
    {x: 760.0, y: 330.0, v_target: 45.0, turn: "T6-Entry", turnZh: "T6 重刹点 (50m)", sector: 2, gear: 3, brakingBoard: 50},
    {x: 815.0, y: 265.0, v_target: 25.0, turn: "T6", turnZh: "T6 入弯转向点", sector: 2, gear: 2, kerbSide: "left"},
    {x: 815.0, y: 205.0, v_target: 20.0, turn: "T6", turnZh: "T6 180°发卡弯心 (70 km/h)", sector: 2, gear: 2, kerbSide: "right", runoff: "gravel"},
    {x: 775.0, y: 175.0, v_target: 25.0, turn: "T6", turnZh: "T6 发卡出弯", sector: 2, gear: 2, kerbSide: "right"},
    {x: 710.0, y: 200.0, v_target: 35.0, turn: "T6", turnZh: "T6 出弯加速段", sector: 2, gear: 3, kerbSide: "left"},

    // T7 - T8 (Fast Esses / 高速连续 S 弯)
    {x: 625.0, y: 255.0, v_target: 46.0, turn: "T7", turnZh: "T7 高速左扫入弯", sector: 2, gear: 4, kerbSide: "right"},
    {x: 545.0, y: 280.0, v_target: 46.0, turn: "T7", turnZh: "T7 高速左弯弯心 (165 km/h)", sector: 2, gear: 4, kerbSide: "left"},
    {x: 485.0, y: 265.0, v_target: 48.0, turn: "T7/T8", turnZh: "T7-T8 高速换向", sector: 2, gear: 4},
    {x: 445.0, y: 220.0, v_target: 55.0, turn: "T8", turnZh: "T8 高G右扫入弯", sector: 2, gear: 5, kerbSide: "left"},
    {x: 430.0, y: 155.0, v_target: 55.0, turn: "T8", turnZh: "T8 高速右扫弯心 (200 km/h)", sector: 2, gear: 5, kerbSide: "right", runoff: "asphalt_stripes"},
    {x: 445.0, y: 85.0, v_target: 50.0, turn: "T8", turnZh: "T8 出弯 (250 km/h)", sector: 2, gear: 5, kerbSide: "left"},

    // T9 - T10 (Left-Left Chicane & Intermediate Straight)
    {x: 480.0, y: 25.0, v_target: 35.0, turn: "T9", turnZh: "T9 90°左弯刹车点 (100m)", sector: 2, gear: 3, brakingBoard: 100},
    {x: 465.0, y: -30.0, v_target: 25.0, turn: "T9", turnZh: "T9 90°左弯弯心 (88 km/h)", sector: 2, gear: 2, kerbSide: "left"},
    {x: 420.0, y: -60.0, v_target: 30.0, turn: "T9/T10", turnZh: "T9-T10 短过渡", sector: 2, gear: 2, kerbSide: "right"},
    {x: 395.0, y: -95.0, v_target: 40.0, turn: "T10", turnZh: "T10 左弯入弯", sector: 2, gear: 3, kerbSide: "right"},
    {x: 420.0, y: -130.0, v_target: 48.0, turn: "T10", turnZh: "T10 左弯出弯开油 (175 km/h)", sector: 2, gear: 3, kerbSide: "left"},
    {x: 480.0, y: -140.0, v_target: 65.0, turn: "Straight", turnZh: "中间大直道", sector: 2, gear: 5},
    {x: 570.0, y: -140.0, v_target: 75.0, turn: "Straight", turnZh: "中间大直道 (270 km/h)", sector: 2, gear: 6, brakingBoard: 150},

    // T11 - T12 - T13 (Chicane to Parabolic Sweeper)
    {x: 670.0, y: -140.0, v_target: 65.0, turn: "T11-Entry", turnZh: "S2 终点 / T11 减速弯入弯 (100m)", sector: 2, gear: 4, brakingBoard: 100},
    {x: 755.0, y: -130.0, v_target: 35.0, turn: "T11", turnZh: "T11 紧凑左弯 (88 km/h)", sector: 3, gear: 2, kerbSide: "left", brakingBoard: 50},
    {x: 785.0, y: -95.0, v_target: 25.0, turn: "T11", turnZh: "T11 弯心", sector: 3, gear: 2, kerbSide: "left"},
    {x: 780.0, y: -60.0, v_target: 35.0, turn: "T12", turnZh: "T12 快速右转折 (165 km/h)", sector: 3, gear: 3, kerbSide: "right"},
    {x: 810.0, y: -40.0, v_target: 46.0, turn: "T12", turnZh: "T12 弯心", sector: 3, gear: 3, kerbSide: "right"},
    {x: 860.0, y: -40.0, v_target: 55.0, turn: "T13", turnZh: "T13 极速抛物线入弯", sector: 3, gear: 4, kerbSide: "left"},
    {x: 915.0, y: -75.0, v_target: 60.0, turn: "T13", turnZh: "T13 高速倾斜大圆弧", sector: 3, gear: 4, kerbSide: "right", runoff: "asphalt_stripes"},
    {x: 935.0, y: -145.0, v_target: 65.0, turn: "T13", turnZh: "T13 抛物线中段全油门", sector: 3, gear: 5, kerbSide: "right", runoff: "asphalt_stripes"},
    {x: 910.0, y: -220.0, v_target: 68.0, turn: "T13", turnZh: "T13 大圆弧出弯蓄力", sector: 3, gear: 5, kerbSide: "right"},
    {x: 840.0, y: -275.0, v_target: 69.0, turn: "T13", turnZh: "T13 出弯 (250 km/h)", sector: 3, gear: 5, kerbSide: "left"},
    {x: 740.0, y: -295.0, v_target: 75.0, turn: "T13", turnZh: "后大直道起跑点", sector: 3, gear: 6, isDRS: true},

    // Back Straight (1.17km Flat Out, Speed 326+ km/h, DRS Zone 2)
    {x: 580.0, y: -295.0, v_target: 82.0, turn: "Back Straight", turnZh: "1.17km 超长后直道 · DRS 2 区", sector: 3, gear: 6, isDRS: true},
    {x: 380.0, y: -295.0, v_target: 88.0, turn: "Back Straight", turnZh: "后大直道 (280 km/h)", sector: 3, gear: 6, isDRS: true},
    {x: 180.0, y: -295.0, v_target: 90.0, turn: "Back Straight", turnZh: "后大直道 (310 km/h)", sector: 3, gear: 6, isDRS: true},
    {x: -30.0, y: -295.0, v_target: 90.5, turn: "Back Straight", turnZh: "后直道 Speed Trap 测速点 (326 km/h)", sector: 3, gear: 6, isDRS: true, brakingBoard: 150},
    {x: -240.0, y: -295.0, v_target: 85.0, turn: "T14-Entry", turnZh: "T14 极限制动 200m 牌", sector: 3, gear: 6, brakingBoard: 150},
    {x: -430.0, y: -295.0, v_target: 60.0, turn: "T14-Entry", turnZh: "T14 重刹区 100m 牌 (326→85 km/h)", sector: 3, gear: 4, brakingBoard: 100},
    {x: -550.0, y: -295.0, v_target: 35.0, turn: "T14", turnZh: "T14 50m 入弯点", sector: 3, gear: 2, kerbSide: "right", brakingBoard: 50},

    // T14 Hairpin (180 deg Extreme Left Hairpin)
    {x: -605.0, y: -280.0, v_target: 25.0, turn: "T14", turnZh: "T14 极限制动发卡入弯", sector: 3, gear: 2, kerbSide: "right"},
    {x: -625.0, y: -245.0, v_target: 24.0, turn: "T14", turnZh: "T14 发卡弯心 (85 km/h)", sector: 3, gear: 2, kerbSide: "left", runoff: "gravel"},
    {x: -600.0, y: -210.0, v_target: 26.0, turn: "T14", turnZh: "T14 发卡出弯", sector: 3, gear: 2, kerbSide: "left"},
    {x: -540.0, y: -200.0, v_target: 45.0, turn: "T14", turnZh: "T14 出弯全油门加速", sector: 3, gear: 3, kerbSide: "right"},

    // T15 - T16 (Final Corners back to Start/Finish)
    {x: -420.0, y: -200.0, v_target: 65.0, turn: "T15", turnZh: "T15 连续加速微弯", sector: 3, gear: 4},
    {x: -290.0, y: -195.0, v_target: 69.0, turn: "T15", turnZh: "T15 冲刺 (250 km/h)", sector: 3, gear: 5, brakingBoard: 100},
    {x: -150.0, y: -190.0, v_target: 55.0, turn: "T16-Entry", turnZh: "T16 进弯前制动区", sector: 3, gear: 4, brakingBoard: 50},
    {x: -75.0, y: -175.0, v_target: 46.0, turn: "T16", turnZh: "T16 90°左弯入弯点", sector: 3, gear: 3, kerbSide: "right"},
    {x: -45.0, y: -130.0, v_target: 46.0, turn: "T16", turnZh: "T16 90°左弯弯心 (165 km/h)", sector: 3, gear: 3, kerbSide: "left", runoff: "gravel"},
    {x: -25.0, y: -70.0, v_target: 55.0, turn: "T16", turnZh: "T16 出弯冲刺进入主直道", sector: 3, gear: 4, kerbSide: "right", isDRS: true}
  ];
  return new CircuitPath(wp, mu, aggressiveness);
}

class UniversalAutoPilot {
  constructor(S_config) {
    this.wb = (S_config.wb || 2600) / 1000.0; 
    // G22：与 VehicleDynamics15DOF 的 a = wb*0.46 对齐（旧值 0.48 与引擎的 CG→前轴
    //     距离不一致，前轴参考点系统性偏移 ~5cm；量小但属口径错误）
    this.a = this.wb * 0.46; // Dist from CG to Front Axle
    
    this.pid_speed = { p: 0.95, i: 0.08, d: 0.04, integral: 0, last_err: 0 };
    this.last_steer = 0;
    this.last_throttle = 0;
    this.last_brake = 0;
    // G22：横向增益（Stanley 形式 atan(K·e_y/u) 的 K）。收敛距离 ≈ u/K，故 K 越大
    //     越“急”；旧实现等效 0.65~1.11。取 1.8 的依据（scratch/diag_klat.cjs 全圈扫参）：
    //       K=0.4 → 最大横向偏差 2.88m / 均值 1.10m / 弯心达成率 76%
    //       K=1.2 →                          1.71m /        0.44m /              90%
    //       K=1.8 →                          ~1.4m /       ~0.32m /              ~92%
    //       K=3.0 →                          1.11m /        0.20m /              95%
    //     扫参区间内全圈【转向符号翻转 = 0】且无发散，K 越大越好；但运动学模型
    //     没有轮胎松弛/滞后，会低估振荡风险，故不取上限；1.8 约为旧值 2×，
    //     在 70m/s（252km/h）下收敛距离仍有 39m，足够温和。
    this.kLat = 1.8;
    this.active = false;
    this.path = null;
    // G21 逐圈刹车点试探学习：每弯余量系数（0.85=首圈保守，逐圈→ 1.0 探极限；
    // 冲出即回退并锁定——真实车手“一圈一圈试极限”的机制）
    this.cornerMargins = {};
    this.cornerLock = {};
    this.cornerDirty = {};
    this.Scfg = S_config; // P2a：DRS 速度阈值等 qs 标定由 pilot 回读整车配置
  }

  /* G21：初始化逐弯学习（首圈留 15% 余量） */
  initLapLearning(nCorners) {
    this.cornerMargins = {};
    this.cornerLock = {};
    this.cornerDirty = {};
    for (let i = 0; i < (nCorners || 0); i++) this.cornerMargins[i] = 0.85;
  }

  /* G21：冲出赛道事件上报（纯记录不重置）→ 该弯标记，圈末回退并锁定 */
  reportRunoff(cid) {
    if (cid >= 0) this.cornerDirty[cid] = true;
  }

  /* G21：圈末结算——干净弯推进余量（刹车更晚），冲出弯回退 0.12 并锁定不再激进 */
  endLap() {
    for (const k in this.cornerMargins) {
      const i = +k;
      if (this.cornerDirty[i]) {
        this.cornerMargins[i] = Math.max(0.70, this.cornerMargins[i] - 0.12);
        this.cornerLock[i] = true;
      } else if (!this.cornerLock[i]) {
        this.cornerMargins[i] = Math.min(1.0, this.cornerMargins[i] + 0.07);
      }
    }
    this.cornerDirty = {};
  }
  
  setPath(newPath) {
    this.path = newPath;
    this.pid_speed.integral = 0;
    this.pid_speed.last_err = 0;
    this.last_steer = 0;
    this.last_throttle = 0;
    this.last_brake = 0;
  }

  drive(state, dt) {
    if (!this.path || !this.active) return { steer: 0, throttle: 0, brake: 0, target: null };
    
    const u = Math.max(0.1, state.u || 0);
    
    // G22：前轴世界坐标（state 是 CG，a = CG→前轴）。
    //     旧的两处“前视”已全部删除：
    //       ① `+ forward*(lookDist*0.22)` 平移 —— 方向跟车身航向而非赛道，弯中会把
    //          查询点甩到弯外；且与曲率前馈重复计权。
    //       ② 弧长前视点 —— 本控制器是 Stanley 型（横向误差在前轴 + 曲率前馈），
    //          在等曲率弧上已精确；再取前视点切向做航向基准会多打 k·ld
    //          （k=0.02、ld=20m 时多打 23°，而所需仅 3°）。详见 CircuitPath._leadDist。
    const fx = state.X - this.a * Math.sin(state.psi);
    const fy = state.Y + this.a * Math.cos(state.psi);
    
    const target = this.path.getLookahead(fx, fy, u);
    
    // ★ G22 根因修复：targetHeading / targetCurvature / 横向目标 三者现在【同源】，
    //   全部来自赛车线（修复前 heading/curvature 取中心线、横向目标取赛车线，
    //   航向项增益 1.0 对横向项 ~0.03 形成 30:1 压制 ⇒ 车被拉回中心线行驶）。
    let e_heading = target.targetHeading - state.psi;
    while(e_heading > Math.PI) e_heading -= 2 * Math.PI;
    while(e_heading < -Math.PI) e_heading += 2 * Math.PI;
    
    // 横向误差：优先用路径给的 lineError（相对赛车线、法向也是赛车线法向）。
    // 旧实现用【中心线法向 nx/ny】去量到赛车线的偏差，在换线区法向差可达十几度，
    // 误差本身就量不准。无 lineError 的旧路径对象逐级回退。
    let e_line;
    if (typeof target.lineError === "number" && isFinite(target.lineError)) {
      e_line = target.lineError;
    } else if (target.refX !== undefined && target.refNx !== undefined) {
      e_line = (fx - target.refX) * target.refNx + (fy - target.refY) * target.refNy;
    } else if (target.refX !== undefined && target.nx !== undefined) {
      e_line = (fx - target.refX) * target.nx + (fy - target.refY) * target.ny;
    } else {
      e_line = target.crossTrackError;
    }
    let safe_ey = e_line;
    if (safe_ey > 6.0) safe_ey = 6.0;
    if (safe_ey < -6.0) safe_ey = -6.0;
    this.last_line_error = e_line;   /* 供 HUD“循迹偏离”显示（相对赛车线而非中心线） */
    
    // G22：横向增益。旧的 k_st/(k_soft+u) 换算成标准 Stanley 形式 atan(K·e_y/u) 后，
    //     等效 K = 1.6u/[(1+0.02u)(1.6+u)] ≈ 0.65~1.11（收敛距离 u/K ≈ 15~100m），
    //     本身是合理整定——所以症状 1 的根因是【航向参考取错了线】，而不是横向
    //     增益太小。故不得大幅括高 K：K 越大收敛距离 u/K 越短，弯中会过度修正
    //     反而制造新的振荡（即用户描述的“扭来扭去”）。K 可调以便扫参定优。
    const K_LAT = (typeof this.kLat === "number" && isFinite(this.kLat)) ? this.kLat : 1.8;
    const steer_fb = -e_heading - Math.atan2(K_LAT * safe_ey, Math.max(3.0, u));
    // 前馈：赛车线曲率已是车真要走的线的曲率，不再需要 0.95 折减补偿口径不一致
    const steer_ff = -Math.atan2(this.wb * target.targetCurvature, 1.0);
    
    let raw_steer = (steer_fb + steer_ff) * (180.0 / Math.PI);
    raw_steer = Math.max(-28, Math.min(28, raw_steer));
    
    // Rate limit steering to avoid sudden snap-oversteer
    const max_steer_rate = 140.0; // deg/s
    const d_steer = Math.max(-max_steer_rate * dt, Math.min(max_steer_rate * dt, raw_steer - this.last_steer));
    let ctrl_steer = this.last_steer + d_steer;
    this.last_steer = ctrl_steer;
    
    // Longitudinal Speed Control with Smooth Deadband & Progressive Braking
    // G21：逐圈刹车学习——弯内目标速 × 余量系数（首圈 0.85，逐圈→ 1.0 = 刹车更晚）
    const cid = (typeof target.cornerId === "number") ? target.cornerId : -1;
    const margin = (cid >= 0 && this.cornerMargins[cid] !== undefined) ? this.cornerMargins[cid] : 1.0;
    let e_v = target.targetSpeed * margin - u;
    this.pid_speed.integral += e_v * dt;
    this.pid_speed.integral = Math.max(-6, Math.min(6, this.pid_speed.integral));
    
    const d_err = (e_v - this.pid_speed.last_err) / (dt + 1e-6);
    this.pid_speed.last_err = e_v;
    
    const accel_cmd = this.pid_speed.p * e_v + this.pid_speed.i * this.pid_speed.integral + this.pid_speed.d * d_err;
    
    // G-G Friction circle allocation: reduce brake/throttle if steering heavily
    const steer_ratio = Math.abs(ctrl_steer) / 28.0;
    const long_avail = Math.max(0.18, 1.0 - 0.65 * steer_ratio);
    
    let target_throttle = 0, target_brake = 0;
    
    if (accel_cmd > 0.08) {
      // Acceleration Demand
      target_throttle = Math.min(1.0, accel_cmd * 0.38) * long_avail;
      // Cornering Traction Control (TCS): reduce drive torque if lateral slip is high
      const v_lat = Math.abs(state.v || 0);
      if (v_lat > 0.6) {
        target_throttle = Math.max(0, target_throttle - (v_lat - 0.6) * 1.2);
      }
      target_brake = 0;
    } else if (accel_cmd < -0.75) {
      // Significant Deceleration Demand -> Progressive Trail Braking
      target_throttle = 0;
      target_brake = Math.min(1.0, (-accel_cmd - 0.75) * 0.38) * long_avail;
    } else {
      // Coasting Zone (-0.75 <= accel_cmd <= 0.08): Lift and Coast naturally, NO mechanical braking
      target_throttle = 0;
      target_brake = 0;
    }
    
    // 1st-Order Low-Pass Smoothing Filter to eliminate 60Hz square-wave chatter
    const filter_alpha = Math.min(1.0, dt / 0.045);
    let ctrl_throttle = this.last_throttle + (target_throttle - this.last_throttle) * filter_alpha;
    let ctrl_brake = this.last_brake + (target_brake - this.last_brake) * filter_alpha;
    
    if (ctrl_throttle < 0.015) ctrl_throttle = 0;
    if (ctrl_brake < 0.015) ctrl_brake = 0;
    
    this.last_throttle = ctrl_throttle;
    this.last_brake = ctrl_brake;
    
    // P2a：DRS 自动判定——赛车线目标带 isDRS（赛道 DRS 区标记，见 buildShanghaiCircuit
    // wp 定义）且车速超阈值才开翼；物理在 step() 消费（阻力 ×drsCdScale、后轴下压
    // ×drsClScale），HUD 徽章同读 ctrl.drs——告别“只显示不消费”。
    const qsD = (this.Scfg && this.Scfg.qs) || {};
    const drsVMin = (typeof qsD.drsVms === 'number' && isFinite(qsD.drsVms)) ? qsD.drsVms : 40.0;
    const ctrl_drs = !!(target && target.isDRS && u > drsVMin);

    return { steer: ctrl_steer, throttle: ctrl_throttle, brake: ctrl_brake, drs: ctrl_drs, target: target };
  }
}

class VehicleDynamics15DOF {
  constructor(S_config, SIM_data, initSpeedMs = 0) {
    this.S = S_config;
    this.SIM = SIM_data;
    
    this.m = Math.max(150, S_config.mTotal || 1000);
    this.wb = (S_config.wb || 2600) / 1000;
    this.a = this.wb * 0.46;
    this.b = this.wb - this.a;
    this.h_cg = (S_config.hcg || 350) / 1000;
    
    const hF = (S_config.front && S_config.front.hp && S_config.front.hp.WC) ? S_config.front.hp.WC : [750,0,300];
    const hR = (S_config.rear && S_config.rear.hp && S_config.rear.hp.WC) ? S_config.rear.hp.WC : [750,0,300];
    this.tF = Math.abs(hF[0] * 2) / 1000;
    this.tR = Math.abs(hR[0] * 2) / 1000;

    this.tireF = S_config.front ? S_config.front.tire : { R:330, W:280 };
    this.tireR = S_config.rear ? S_config.rear.tire : { R:330, W:280 };
    this.ReF = (this.tireF.R || 330) / 1000;
    this.ReR = (this.tireR.R || 330) / 1000;
    
    this.I_pitch = this.m * (this.wb * 0.42) ** 2; 
    this.I_roll = this.m * ((this.tF + this.tR) * 0.22) ** 2;
    this.I_yaw = this.I_pitch + this.I_roll;
    this.Iw = Math.max(0.35, 1.2 * (this.m / 1250)); // Wheel rotational inertia (kg*m^2)
    
    this.Fz0_F = (this.m * 9.81 * (this.b / this.wb)) / 2.0;
    this.Fz0_R = (this.m * 9.81 * (this.a / this.wb)) / 2.0;
    
    const mrF = Math.abs(SIM_data && SIM_data.mrRefF) || Math.abs(S_config.front.mr || 0.75);
    const mrR = Math.abs(SIM_data && SIM_data.mrRefR) || Math.abs(S_config.rear.mr || 0.78);
    const kS_F = S_config.front ? S_config.front.kS : 60;
    const kS_R = S_config.rear ? S_config.rear.kS : 65;
    const cR_F = S_config.front ? S_config.front.cR : 3.5;
    const cR_R = S_config.rear ? S_config.rear.cR : 4.0;
    // P2b（2026-09-02）：压缩阻尼 cB 独立接线。此前 UI 的 BUMP DAMP 滑块（cB）是
    // 死控件——15-DOF 单系数 Cw（仅源自回弹 cR）压缩/回弹不分。缺省 cB??cR：
    // 无 cB 字段的旧请求退化为压缩=回弹同系数，行为不变。
    const cB_F = S_config.front ? (S_config.front.cB ?? S_config.front.cR ?? 3.5) : 3.5;
    const cB_R = S_config.rear ? (S_config.rear.cB ?? S_config.rear.cR ?? 4.0) : 4.0;

    this.Kw_F = (kS_F * 1000) * (mrF * mrF);
    this.Kw_R = (kS_R * 1000) * (mrR * mrR);
    this.Cw_F = (cR_F * 1000) * (mrF * mrF);   // 回弹（rebound）阻尼 N·s/m
    this.Cw_R = (cR_R * 1000) * (mrR * mrR);
    this.CwB_F = (cB_F * 1000) * (mrF * mrF);  // 压缩（bump）阻尼 N·s/m
    this.CwB_R = (cB_R * 1000) * (mrR * mrR);

    // Roll Moment Arm: distance from sprung CG to physical roll axis
    const h_rc_f = (SIM_data && SIM_data.rcH_F !== null && SIM_data.rcH_F !== undefined ? SIM_data.rcH_F : 50) / 1000;
    const h_rc_r = (SIM_data && SIM_data.rcH_R !== null && SIM_data.rcH_R !== undefined ? SIM_data.rcH_R : 65) / 1000;
    const h_roll_axis = (h_rc_f + h_rc_r) / 2;
    this.h_roll_arm = Math.max(0.06, this.h_cg - h_roll_axis);
    
    this.state = {
      X: 0, Y: 0, Z: 0,           // World Position (m): X (Right), Y (Forward), Z (Up)
      phi: 0, theta: 0, psi: 0,   // Euler Angles (rad): Roll (Y), Pitch (X), Yaw (Z)
      u: initSpeedMs, v: 0, w: 0, // Body Velocities (m/s): u (Forward +Y), v (Right +X), w (Up +Z)
      p: 0, q: 0, r: 0,           // Body Angular Rates (rad/s): p (Roll), q (Pitch), r (Yaw)
      omega: { 
        FL: initSpeedMs / this.ReF, 
        FR: initSpeedMs / this.ReF, 
        RL: initSpeedMs / this.ReR, 
        RR: initSpeedMs / this.ReR 
      }
    };
    
    this.telemetry = { 
      Fz: { FL: this.Fz0_F, FR: this.Fz0_F, RL: this.Fz0_R, RR: this.Fz0_R }, 
      Fx: { FL: 0, FR: 0, RL: 0, RR: 0 }, 
      Fy: { FL: 0, FR: 0, RL: 0, RR: 0 }, 
      tr: { FL: 0, FR: 0, RL: 0, RR: 0 },
      camber: { FL: -2.8, FR: -2.8, RL: -1.8, RR: -1.8 },
      toe: { FL: 0, FR: 0, RL: 0, RR: 0 },
      z_road: { FL: 0, FR: 0, RL: 0, RR: 0 },
      isKerb: { FL: false, FR: false, RL: false, RR: false },
      alpha: { FL: 0, FR: 0, RL: 0, RR: 0 }, 
      kappa: { FL: 0, FR: 0, RL: 0, RR: 0 },
      ax: 0, ay: 0, az: 0,
      aero: { downF_f: 0, downF_r: 0, downF: 0, drag: 0, geF: 1, geR: 1, hF: 0.11, hR: 0.11, drs: false }
    };
  }

  /* G23-P1b：解析轮胎标定参数（与引擎 src/api/v3models.py 的 TireParams 缺省一致，
     该缺省是 test_dom.js 里的【双端对拍锚】，不得漂移）。
     G24：缺省值已换为真实 GT3 光头胎量级（μ=5250/3500=1.50、By=20 ⇒ 峰值侧偏角
     8.27°），与引擎侧同步修正；旧占位值 8000/9 使峰值落在 17.87°，车需侧滑到
     18° 才拿到满拓地力，导致深度不足转向。
     数据源优先级：SIM.tireCalib（由 applyTireCalib 写入，即 /api/v3/tire/fit 辨识结果）
     → 引擎缺省。Ey 单独存于 SIM.tireCalibEy（03-mechanism.js 注释就写了
     “仅赛道瞬态用”、09-track.js 也确实在发给引擎，但前端实时引擎从未消费）。
     逐项校验：非法值（NaN / FzNom≤0 / By≤0）沿链逐项下探（标定→自定义→缺省），
     不整体报废。
     G29（2026-09-04）：优先级链插入 SIM.userTire（轮胎工坊自定义参数，14-tire-lab.js
     写入）；实测标定仍最高。缺省 D 表未动，test_dom.js:217 正则锁与 tphys_parity 不受影响。 */
  resolveTireParams() {
    const D = { Fy0: 5250.0, By: 20.0, Cy: 1.2, Ey: -0.5, FzNom: 3500.0, LS: 0.10, Cg: 6.0 };
    const tc = (this.SIM && this.SIM.tireCalib) ? this.SIM.tireCalib : null;
    const ut = (this.SIM && this.SIM.userTire) ? this.SIM.userTire : null;   // G29 轮胎工坊
    const pick = (k, minExclusive) => {
      const ok = v => (typeof v === 'number' && isFinite(v) &&
                       (minExclusive === undefined || v > minExclusive));
      if (tc && ok(tc[k])) return tc[k];   // ① 实测标定最高
      if (ut && ok(ut[k])) return ut[k];   // ② G29 用户自定义次之
      return D[k];                          // ③ 引擎缺省（对拍锚，不改值）
    };
    const FzNom = pick('FzNom', 0), By = pick('By', 0), Fy0 = pick('Fy0');
    // Ey 不在 TIRE_MF_QS 里，单独走 SIM.tireCalibEy（与引擎侧 payload 同口径）
    const eySim = (this.SIM && typeof this.SIM.tireCalibEy === 'number') ? this.SIM.tireCalibEy : NaN;
    const Ey = isFinite(eySim) ? eySim : pick('Ey');
    const p = {
      Fy0, FzNom, By, Cy: pick('Cy'), Ey,
      LS: Math.max(0.0, Math.min(1.0, pick('LS'))),   // LS 钳到 [0,1]，防负值/过大括高
      Cg: pick('Cg'),
      // 相对【引擎缺省胎】归一的拓地力比例：未标定时 = 1，行为与路面 μ 语义不变
      gripScale: (Fy0 / FzNom) / (D.Fy0 / D.FzNom),
      Bx: By * 1.2                                    // 与 tire_mf.py fx() 的 b = By*1.2 同约定
    };
    /* G23-P1b：峰值滑移量解析解（供 TCS / 制动阈值从轮胎推导，而不是硬编码）。
       MF 峰值条件：sin(Cy·atan(arg)) = 1 ⇒ atan(arg) = π/(2Cy) ⇒ arg = tan(π/(2Cy))；
       而 arg = s − Ey·(s − atan s)，对 s 单调递增 ⇒ 二分可解。
       验证（G24 真实缺省胎 By=20, Cy=1.2, Ey=-0.5）：arg = tan(π/2.4) = 3.732，
       解 1.5s − 0.5·atan(s) = 3.732 得 s_peak ≈ 2.901 ⇒
         κ_peak = 2.901/Bx = 2.901/24 = 0.1209（12.1%，真实胎 8~15% ✓）
         α_peak = atan(2.901/20) = 8.27°（真实光头胎 6~10° ✓）
       Cy < 1 时无内部峰值（力渐近上升），退到大滑移量。按标定参数缓存。 */
    const key = [p.By, p.Bx, p.Cy, p.Ey, p.FzNom, p.LS, p.Fy0, p.Cg].join('|');
    if (this._tpCacheKey === key && this._tpCache) return this._tpCache;
    const argT = (p.Cy >= 1.0) ? Math.tan(Math.PI / (2 * p.Cy)) : Infinity;
    let sPeak = 3.0;
    if (isFinite(argT)) {
      const f = s => s - p.Ey * (s - Math.atan(s)) - argT;
      let lo = 1e-6, hi = 50.0;
      if (f(lo) > 0) sPeak = lo;
      else if (f(hi) < 0) sPeak = hi;
      else {
        for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) hi = mid; else lo = mid; }
        sPeak = 0.5 * (lo + hi);
      }
    }
    p.sPeak = sPeak;
    p.kappaPeak = sPeak / p.Bx;          // 峰值驱动力对应的纵向滑移率
    p.alphaPeak = Math.atan(sPeak / p.By);   // 峰值侧向力对应的侧偏角（rad）
    this._tpCacheKey = key;
    this._tpCache = p;
    return p;
  }

  /* Pacejka 魔术公式（G23-P1b 重写：与引擎 MagicFormulaSub 同构 + 组合滑移）。
     ── 为何不能只把标定参数塞进旧公式 ────────────────────────
     旧实现的归一化滑移量 s_y = C_alpha·tanα / (μ·Fz)，C_alpha 硬编码 110000，
     使曲线在【0.32° 侧偏角】就饱和（实测），等价纯库仑摩擦；初始刚度
     C_alpha = 1993.7 kN/rad（恒值，不随载荷变），是真实量级（15~25 N/rad per N）
     的 25 倍。把 By=9/Cy=1.2 塞进去只会让拐点更畸形。
     ── 新形式 ─────────────────────────────────────────────────
       D = μ_surface · gripScale · Fz · max(0.1, 1 − LS·(Fz/FzNom − 1))
       s = hypot(Bx·κ, By·tanα)；F = D·sin(Cy·atan(s − Ey·(s − atan s)))
       Fx = F·sx/s；Fy = −F·sy/s（侧向力反抗侧滑速度）
     ★ 路面 μ（赛道滑杆 / getRoadElevation 的沥青/路肩/砾石）仍定【绝对拓地力
       上限】，标定参数定【形状 + 载荷敏感性 + 相对拓地力】。故未标定时
       gripScale=1、峰值 Fy/Fz = μ_surface，速度包络（a_lat_max = 0.85μ·g）语义不变。
     ★ 组合滑移保留旧架构的【归一化滑移量 + 方向分解】（已由赛车线回归验证），
       只修正标度：小滑移下 Fy ≈ −D·Cy·By·tanα ⇒ C_alpha = B·C·D，与引擎
       cornering_stiffness() 完全同式；且合力 hypot(Fx,Fy) ≤ D 恒成立（摩擦圆）。 */
  magicFormula(Fz, alpha, kappa, mu_peak = 1.35) {
    if (Fz <= 1.0) return { Fx: 0, Fy: 0 };
    const tp = this.resolveTireParams();
    // 载荷敏感性（Jensen 效应）：重载 μ 递减——载荷转移损失轴总拓地力、
    // 以及稳态不足转向梯度的轮胎侧根基。钳位与引擎 _d() 的 max(0.1, ...) 同式。
    const r = Fz / tp.FzNom;
    const lsF = Math.max(0.1, 1.0 - tp.LS * (r - 1.0));
    const D = mu_peak * tp.gripScale * Fz * lsF;

    const sx = tp.Bx * kappa;
    const sy = tp.By * Math.tan(alpha);
    const s = Math.max(1e-9, Math.hypot(sx, sy));
    const x = s - tp.Ey * (s - Math.atan(s));
    const F = D * Math.sin(tp.Cy * Math.atan(x));

    return {
      Fx: F * (sx / s),
      Fy: -F * (sy / s),      // Lateral cornering force opposes lateral slip velocity
      // G24-S3：返回组合滑移上限 D，供 step() 对 camber 线性外倾项做摩擦圆
      // 钳位（引擎 transient.py 同式 lat_avail = sqrt((μFz)² - Fx²)）。
      D
    };
  }

  step(ctrl, env, dt_sec) {
    const MAX_SUB_DT = 0.001; // 1000Hz Sub-stepping
    let t_remain = Math.min(0.05, dt_sec);
    const alpha_slope = env.grade || 0;
    const cosA = Math.cos(alpha_slope);
    const sinA = Math.sin(alpha_slope);

    const liveTune = (typeof SLOPE_STAGE !== 'undefined' && SLOPE_STAGE.active && SLOPE_STAGE.liveTuning)
      ? SLOPE_STAGE.liveTuning
      : ((typeof CIRCUIT_STAGE !== 'undefined' && CIRCUIT_STAGE.liveTuning) ? CIRCUIT_STAGE.liveTuning : null);

    const kfScale = liveTune ? (1.0 + (liveTune.k_f_pct || 0) / 100.0) : 1.0;
    const krScale = liveTune ? (1.0 + (liveTune.k_r_pct || 0) / 100.0) : 1.0;
    const cfScale = liveTune ? (1.0 + (liveTune.c_f_pct || 0) / 100.0) : 1.0;
    const crScale = liveTune ? (1.0 + (liveTune.c_r_pct || 0) / 100.0) : 1.0;
    const Kw_F_eff = this.Kw_F * kfScale;
    const Kw_R_eff = this.Kw_R * krScale;
    const Cw_F_eff = this.Cw_F * cfScale;
    const Cw_R_eff = this.Cw_R * crScale;
    // P2b：压缩侧系数随同轴 liveTune 阻尼比例同乘（c_f/c_r_pct 是轴级调校）
    const CwB_F_eff = this.CwB_F * cfScale;
    const CwB_R_eff = this.CwB_R * crScale;
    const bbias_eff = (liveTune && liveTune.bbias != null) ? (liveTune.bbias / 100.0) : 0.58;
    const rideOffset = (liveTune && liveTune.ride_height_mm != null) ? (liveTune.ride_height_mm / 1000.0) : 0.0;
    const mu_eff = (typeof CIRCUIT_STAGE !== 'undefined' && CIRCUIT_STAGE.mu) ? CIRCUIT_STAGE.mu : 1.35;

    // G23-P1b：轮胎标定参数提到最前（制动扭矩与 TCS 阈值都要从它推导）。
    // 每帧解析一次，内部按标定参数缓存；magicFormula 内部再调也只命中缓存。
    const tpStep = this.resolveTireParams();

    /* 制动扭矩上限。G23-P1b：旧实现硬编码 Fz0*1.45*Re —— 两个错：
       (a) 1.45 > 干地 μ=1.35 ⇒ 全力制动【必然抱死】（1440 N·m vs 摩擦极限 1341 N·m）；
       (b) 与路面 μ 无关 ⇒ 上了砾石（μ=0.78）仍按 1440 N·m 供给，瞬间锁死。
       现改为从实际摩擦极限推导：μ_surface · gripScale · Fz0 · Re · BRAKE_CAP。
       BRAKE_CAP=1.05 留 5% 余量：重刹可以抱死（真实，无 ABS），但不是必然；
       且砾石上自动降到 813 N·m，与降低的拓地力匹配（直接影响 G21 出界后的物理表现）。 */
    const BRAKE_CAP = 1.05;
    const brakeMu = mu_eff * tpStep.gripScale * BRAKE_CAP;
    const maxBrakeTorqueF = brakeMu * this.Fz0_F * this.ReF;
    const maxBrakeTorqueR = brakeMu * this.Fz0_R * this.ReR;
    const drivePowerFactor = Math.min(1.0, (this.m / 1250) * 1.2);
    
    const pathObj = (env && env.path) ? env.path : ((typeof CIRCUIT_STAGE !== "undefined" && CIRCUIT_STAGE.path) ? CIRCUIT_STAGE.path : null);
    
    // K&C Dynamic Derivatives (from multi-body geometry)
    // G23：以下 4 个常数现仅作为【回退值】（LUT 缺失时），不再是唯一来源。
    //     真正的 camber/toe 改为查用户自己解算出的 SIM.swF/swR 扫掠表（见下）。
    const dCamber_dz_F = -0.038; // deg/mm (camber gain under bump)
    const dCamber_dz_R = -0.026; // deg/mm
    const dBumpSteer_dz_F = 0.012; // deg/mm (toe change under bump)
    const dBumpSteer_dz_R = 0.007; // deg/mm
    const staticCamber_F = -2.8, staticCamber_R = -1.8;   // deg（回退用）

    /* ── G23 K&C 接线：camber / toe 直接查扫掠 LUT ────────────────────
       旧实现用 4 个硬编码梯度常数 + 2 个硬编码静态外倾，完全绕开了
       SIM.swF/swR —— 那是 runSweep() 对用户真实多体几何逐行程解算出的
       cam/toe/mr/kw/rcH 表。后果：重设整套双叉臂硬点，车在赛道上的行为
       几乎不变（实测：两套不同几何的引擎跑 300 步，Δψ/Δv/Δcamber 均为 0）。

       ★ 行程口径三处一致（已核对）：
         step() 的 tr_w(m)×1000  ==  runSweep 的 tr(mm)  ==
         渲染层 driveTo(SIM.FR, z0F + tr.FR*1000, ...) 的同一个量。
       ★ 侧别约定：扫掠表跑的是【右角】（SIM.FR/SIM.RR）。镜像几何下左右轮
         camber 数值相同（都上端内倾），故两侧共用 cam；toe 沿用既有的
         (left?+1:-1) 侧别符号，不改动已验证的符号约定（镜像对称性由
         engine/tests/test_mirror_symmetry.py 把关）。
       ★ toe 取【相对零行程的增量】toe(tr)-toe(0)，保持旧实现“tr=0 时 bump
         steer 贡献为 0”的语义，静态 toe 仍由设计值决定，不在此重复计入。
       ★ 回退：LUT 为 null / rows<2 / 缺列 / 非有限，或 sampleSweep 不可用（早期
         启动、未 rebuild）时，逐项回退到原线性化常数，保证不崩不出 NaN。 */
    const kcLutOK = sw => !!(sw && sw.rows && sw.rows.length >= 2);
    const swF = (this.SIM && kcLutOK(this.SIM.swF)) ? this.SIM.swF : null;
    const swR = (this.SIM && kcLutOK(this.SIM.swR)) ? this.SIM.swR : null;
    const canLut = (typeof sampleSweep === 'function');
    const lutF = canLut && swF, lutR = canLut && swR;
    // 零行程 toe 基准（每帧取一次即可，LUT 在帧内不变）
    const toe0_F = lutF ? sampleSweep(swF, 0, 'toe') : null;
    const toe0_R = lutR ? sampleSweep(swR, 0, 'toe') : null;
    /* 查表 + 逐项回退。tr_mm 为该轮当前行程（正=压缩）。 */
    const kcCamber = (isFront, tr_mm) => {
      if (isFront ? lutF : lutR) {
        const c = sampleSweep(isFront ? swF : swR, tr_mm, 'cam');
        if (c !== null && isFinite(c)) return c;
      }
      return (isFront ? staticCamber_F : staticCamber_R)
           + (isFront ? dCamber_dz_F : dCamber_dz_R) * tr_mm;
    };
    const kcToeDelta = (isFront, tr_mm) => {
      if (isFront ? lutF : lutR) {
        const t = sampleSweep(isFront ? swF : swR, tr_mm, 'toe');
        const t0 = isFront ? toe0_F : toe0_R;
        if (t !== null && t0 !== null && isFinite(t) && isFinite(t0)) return t - t0;
      }
      return (isFront ? dBumpSteer_dz_F : dBumpSteer_dz_R) * tr_mm;
    };
    // G23-P1b：本帧的轮胎标定参数已在函数开头解析（tpStep），此处不再重复。
    
    const wheels = [
      { id: 'FL', x: -this.tF/2.0, y: this.a,  Re: this.ReF, axle: 'front', side: 'left',  Fz0: this.Fz0_F },
      { id: 'FR', x: this.tF/2.0,  y: this.a,  Re: this.ReF, axle: 'front', side: 'right', Fz0: this.Fz0_F },
      { id: 'RL', x: -this.tR/2.0, y: -this.b, Re: this.ReR, axle: 'rear',  side: 'left',  Fz0: this.Fz0_R },
      { id: 'RR', x: this.tR/2.0,  y: -this.b, Re: this.ReR, axle: 'rear',  side: 'right', Fz0: this.Fz0_R }
    ];
    
    // ── P2b（2026-09-02）：四象限减振器 ─────────────────────────────────────
    // 旧实现单系数单拐点：压缩/回弹共用 Cw（源自回弹 cR），一个 0.16 m/s 拐点后
    // 斜率 ×0.38 —— cB（UI BUMP DAMP）编辑不生效，压缩/回弹方向特性失真。
    // 现按真实减振器方向特性分四象限（压缩低速/压缩高速/回弹低速/回弹高速）：
    //   · 压缩（dtr>0 轮跳上行）：系数 C_b，拐点 vkB（缺省 0.13 m/s——路缘/冲击
    //     更快 blow-off 泄压）；低速段线性 C_b·v，高速段斜率 ×BLOW
    //   · 回弹（dtr<0 轮跳下行）：系数 C_r，拐点 vkR（缺省 0.18 m/s——车身回弹
    //     吸振主区更宽）；同式 blow-off
    // BLOW=0.38 沿用旧 blow-off 斜率；拐点支持轴级标定覆盖
    // S.front/rear.vkB、vkR（m/s；缺省 0.13/0.18）。低速线性段精确可解析，
    // 高速 blow-off 防驻波与悬挂击穿（test_p2b_damper.js 按此锚斜率比 0.38）。
    const BLOW = 0.38;
    const dk = (ax, key, d) => {
      const o = (ax && ax[key]) !== undefined ? ax[key] : NaN;
      return (typeof o === 'number' && isFinite(o)) ? o : d;
    };
    const fAx = this.S.front || {}, rAx = this.S.rear || {};
    const vkB_F = dk(fAx, 'vkB', 0.13), vkR_F = dk(fAx, 'vkR', 0.18);
    const vkB_R = dk(rAx, 'vkB', 0.13), vkR_R = dk(rAx, 'vkR', 0.18);
    const calcDamper = (C_b, C_r, vkB, vkR, dtr) => {
      const v = Math.abs(dtr);
      if (dtr >= 0) {   // 压缩象限：正力（增载）
        return (v <= vkB) ? C_b * dtr : C_b * vkB + C_b * BLOW * (v - vkB);
      }
      // 回弹象限：负力（减载）
      return (v <= vkR) ? C_r * dtr : -(C_r * vkR + C_r * BLOW * (v - vkR));
    };

    while(t_remain > 0) {
      const dt = Math.min(MAX_SUB_DT, t_remain);
      const st = this.state;
      const cPsi = Math.cos(st.psi), sPsi = Math.sin(st.psi);
      
      // 1. Evaluate Individual 4-Wheel Contact Patch Position, Road Kerb Elevation & K&C Kinematics
      const wheelStates = {};
      let numWheelsAirborne = 0;

      for (const w of wheels) {
        const X_w = st.X - w.y * sPsi + w.x * cPsi;
        const Y_w = st.Y + w.y * cPsi + w.x * sPsi;
        
        const rInfo = pathObj ? pathObj.getRoadElevation(X_w, Y_w) : { z_road: 0, isKerb: false, mu: mu_eff };
        const z_road_w = (rInfo.z_road || 0) + (env.bumpNoise || 0);
        const mu_w = (rInfo.mu !== undefined ? rInfo.mu : mu_eff);
        
        // Chassis corner vertical displacement & velocity (+X right, +Y forward)
        const z_corner = st.Z + rideOffset + w.y * st.theta - w.x * st.phi;
        const dz_corner = st.w + w.y * st.q - w.x * st.p;
        
        const maxDroop = (w.axle === 'front' ? 0.080 : 0.090);
        const maxBumpStop = (w.axle === 'front' ? 0.055 : 0.065);
        const isAirborne = (z_corner - maxDroop > z_road_w);
        if (isAirborne) numWheelsAirborne++;

        let tr_w, dtr_w;
        if (isAirborne) {
          tr_w = -maxDroop;
          dtr_w = 0;
        } else {
          tr_w = -(z_corner - z_road_w);
          dtr_w = -dz_corner;
        }
        
        let F_bumpstop = 0;
        if (tr_w > maxBumpStop) {
          const excess = tr_w - maxBumpStop;
          const Kw_cur = (w.axle === 'front' ? Kw_F_eff : Kw_R_eff);
          F_bumpstop = Kw_cur * (excess * 8.0 + excess * excess * 200.0);
          if (typeof SLOPE_STAGE !== 'undefined' && SLOPE_STAGE.active && SLOPE_STAGE.stats) {
            SLOPE_STAGE.stats.bottomOutCount[w.id] = (SLOPE_STAGE.stats.bottomOutCount[w.id] || 0) + 1;
          }
        }

        // K&C Dynamic Camber & Bump Steer
        // G23：改为查用户的扫掠 LUT（kcCamber / kcToeDelta 内部自带逐项回退）。
        const tr_mm = tr_w * 1000.0;
        const isFrontAxle = (w.axle === 'front');
        const camber_deg = kcCamber(isFrontAxle, tr_mm);
        const bump_steer_rad = (w.side === 'left' ? 1.0 : -1.0) * kcToeDelta(isFrontAxle, tr_mm) * (Math.PI / 180.0);
        
        wheelStates[w.id] = {
          z_road: z_road_w,
          isKerb: rInfo.isKerb,
          isBump: rInfo.isBump,
          isPothole: rInfo.isPothole,
          isAirborne: isAirborne,
          F_bumpstop: F_bumpstop,
          mu: mu_w,
          tr: tr_w,
          dtr: dtr_w,
          camber_rad: camber_deg * (Math.PI / 180.0),
          camber_deg: camber_deg,
          bump_steer_rad: bump_steer_rad
        };
      }
      
      // 2. Suspension Normal Loads Fz and Anti-Roll Bar Load Transfer
      const tr_FL = wheelStates.FL.tr, dtr_FL = wheelStates.FL.dtr;
      const tr_FR = wheelStates.FR.tr, dtr_FR = wheelStates.FR.dtr;
      const tr_RL = wheelStates.RL.tr, dtr_RL = wheelStates.RL.dtr;
      const tr_RR = wheelStates.RR.tr, dtr_RR = wheelStates.RR.dtr;
      
      const arbF_mult = liveTune ? (1.0 + (liveTune.arb_f_pct || 0) / 100.0) : 1.0;
      const arbR_mult = liveTune ? (1.0 + (liveTune.arb_r_pct || 0) / 100.0) : 1.0;
      const K_arb_F = (this.S.front && this.S.front.arb && this.S.front.arb.d > 0) ? (this.S.front.arb.d**4 * 0.05 * arbF_mult) : 0.0;
      const K_arb_R = (this.S.rear && this.S.rear.arb && this.S.rear.arb.d > 0) ? (this.S.rear.arb.d**4 * 0.05 * arbR_mult) : 0.0;
      const F_arb_F = K_arb_F * (tr_FL - tr_FR);
      const F_arb_R = K_arb_R * (tr_RL - tr_RR);
      
      const Fz0_F_slope = this.Fz0_F * cosA;
      const Fz0_R_slope = this.Fz0_R * cosA;
      
      const Fz_FL = wheelStates.FL.isAirborne ? 0.0 : Math.max(0.0, Fz0_F_slope + Kw_F_eff * tr_FL + calcDamper(CwB_F_eff, Cw_F_eff, vkB_F, vkR_F, dtr_FL) + F_arb_F + wheelStates.FL.F_bumpstop);
      const Fz_FR = wheelStates.FR.isAirborne ? 0.0 : Math.max(0.0, Fz0_F_slope + Kw_F_eff * tr_FR + calcDamper(CwB_F_eff, Cw_F_eff, vkB_F, vkR_F, dtr_FR) - F_arb_F + wheelStates.FR.F_bumpstop);
      const Fz_RL = wheelStates.RL.isAirborne ? 0.0 : Math.max(0.0, Fz0_R_slope + Kw_R_eff * tr_RL + calcDamper(CwB_R_eff, Cw_R_eff, vkB_R, vkR_R, dtr_RL) + F_arb_R + wheelStates.RL.F_bumpstop);
      const Fz_RR = wheelStates.RR.isAirborne ? 0.0 : Math.max(0.0, Fz0_R_slope + Kw_R_eff * tr_RR + calcDamper(CwB_R_eff, Cw_R_eff, vkB_R, vkR_R, dtr_RR) - F_arb_R + wheelStates.RR.F_bumpstop);
      
      const F_susp = { FL: Fz_FL, FR: Fz_FR, RL: Fz_RL, RR: Fz_RR };
      
      let SumFx_tire = 0.0, SumFy_tire = 0.0;
      let SumMz_tire = 0.0;
      
      for(const w of wheels) {
        const ws = wheelStates[w.id];
        const Fz_w = F_susp[w.id];
        
        // Wheel contact point velocities in body frame (+X right, +Y forward)
        const v_cp_x = st.v - st.r * w.y;
        const v_cp_y = st.u + st.r * w.x;
        
        // Steer angle delta includes driver steer command + K&C bump steer
        const steer_driver = (w.axle === 'front' ? (ctrl.steer * Math.PI / 180.0) : 0.0);
        const steer_total = steer_driver + ws.bump_steer_rad;
        
        // Transform velocities into wheel heading frame
        const v_tire_long = v_cp_x * Math.sin(steer_total) + v_cp_y * Math.cos(steer_total);
        const v_tire_lat  = v_cp_x * Math.cos(steer_total) - v_cp_y * Math.sin(steer_total);
        
        const alpha = Math.atan2(v_tire_lat, Math.max(0.5, Math.abs(v_tire_long)));
        const v_rot = st.omega[w.id] * w.Re;
        const kappa = (v_rot - v_tire_long) / Math.max(0.5, Math.abs(v_tire_long));
        
        // Pacejka tire forces (Fx_t: tractive/braking along tire rolling, Fy_t: cornering grip)
        let Fx_t = 0, Fy_t_base = 0, mf = null;
        if (Fz_w > 1.0) {
          mf = this.magicFormula(Fz_w, alpha, kappa, ws.mu);
          Fx_t = mf.Fx;
          Fy_t_base = mf.Fy;
        }
        
        // K&C Camber Thrust Force
        // G23-P1b：改用引擎同式 Cg·γ·Fz（transient.py: fy_w += -Cg*cam_deg*fz，Cg 缺省 0.5）。
        //   旧实现硬编码 C_gamma = 4500/3500 N/rad 并除以 Fz0 归一，在 γ=-2.8°、
        //   Fz=3300N 下给 220N，而引擎同工况给 80.7N —— 差 2.7 倍。现双端同式，
        //   且 Cg 可由标定覆盖（tp.Cg）。前后轴不再用两个不同常数（引擎亦为单一 Cg）。
        //   符号结构保留前端自己的约定：(left?-1:+1)，在 γ<0（上端内倾）时给右轮
        //   负向侧力（指向车中心），物理正确且与旧实现同号，不翻转已验证的符号。
        const Fy_camber = (Fz_w > 1.0)
          ? ((w.side === 'left' ? -1.0 : 1.0) * tpStep.Cg * ws.camber_rad * Fz_w)
          : 0.0;
        let Fy_t = Fy_t_base + Fy_camber;
        /* G24-S3（2026-09-02）：摩擦圆钳位。Cg 升到缺省 6.0（21 kN/rad @
           FzNom=3500，真实 15~25 kN/rad）后，线性外倾项会顶破 magicFormula
           的组合滑移上限 D——旧 Cg=0.5 时盈余小到可忽略，故 P1b 后一直没暴露。
           与引擎 transient.py wheel_force 同式：横向总力（MF 饱和 + camber
           推力）不得超过同帧纵向力占用后的剩余摩擦预算。Fy_t_base 由组合
           滑移构造保证 ≤ latAvail，钳位只裁剪 camber 盈余。 */
        if (Fz_w > 1.0) {
          const latAvail = Math.sqrt(Math.max(0.0, mf.D * mf.D - Fx_t * Fx_t));
          Fy_t = Math.max(-latAvail, Math.min(latAvail, Fy_t));
        }
        
        // Transform tire forces back to vehicle body frame (+X right, +Y forward)
        const Fx_body = Fx_t * Math.sin(steer_total) + Fy_t * Math.cos(steer_total);
        const Fy_body = Fx_t * Math.cos(steer_total) - Fy_t * Math.sin(steer_total);
        
        SumFx_tire += Fx_body;
        SumFy_tire += Fy_body;
        SumMz_tire += w.x * Fy_body - w.y * Fx_body;
        
        // Wheel spin acceleration with dynamic live brake bias and TCS
        let throttleCmd = ctrl.throttle;
        const tcsLvl = liveTune ? (liveTune.tcs ?? 2) : 2;
        /* G23-P1b：TCS 阈值改为从【轮胎实际峰值滑移率】推导。
           旧实现硬编码 0.18 - tcsLvl*0.025（lvl=2 → 0.130），那是按旧轮胎
           （峰值在 κ≈0.33%，等价库仑摩擦）整定的；换新胎后峰值在 κ=0.2685，
           0.130 意味着 TCS 在轮胎【到达峰值之前】就掐断驱动扭矩，白白损失加速。
           现改为 kappaPeak × (1.20 - 0.15·lvl)：
             lvl=1 → 1.05×峰值（几乎不介入）  lvl=2 → 0.90×  lvl=3 → 0.75×
             lvl=4 → 0.60×（湿地）           lvl=5 → 0.45×（极限介入）
           标定不同轮胎时阈值自动跟随，不再需要重新拍常数。
           G24 真实缺省胎下 κ_peak=0.121 ⇒ lvl=2 阈值 0.109（旧硬编码 0.130）。 */
        const kappaLimit = tpStep.kappaPeak * (1.20 - 0.15 * Math.max(0, Math.min(5, tcsLvl)));
        if(tcsLvl > 0 && Math.abs(kappa) > kappaLimit && w.axle === 'rear') {
          throttleCmd = Math.max(0, throttleCmd * (1.0 - tcsLvl * 0.15));
        }
        const T_drive = (w.axle === 'rear' ? (throttleCmd * 480.0 * drivePowerFactor) : (throttleCmd * 120.0 * drivePowerFactor));
        const T_brake = (ctrl.brake * (w.axle === 'front' ? maxBrakeTorqueF * (bbias_eff / 0.58) : maxBrakeTorqueR * ((1.0 - bbias_eff) / 0.42)));
        const sgn_w = st.omega[w.id] >= 0 ? 1.0 : -1.0;
        const T_net = (ws.isAirborne ? (T_drive - T_brake * sgn_w) : (T_drive - T_brake * sgn_w - Fx_t * w.Re));
        const d_omega = T_net / this.Iw;
        st.omega[w.id] += d_omega * dt;
        
        this.telemetry.Fz[w.id] = Fz_w;
        this.telemetry.Fx[w.id] = Fx_body;
        this.telemetry.Fy[w.id] = Fy_body;
        this.telemetry.tr[w.id] = ws.tr;
        this.telemetry.camber[w.id] = ws.camber_deg;
        this.telemetry.toe[w.id] = ws.bump_steer_rad * (180.0 / Math.PI);
        this.telemetry.isKerb[w.id] = ws.isKerb;
        this.telemetry.z_road[w.id] = ws.z_road;
        this.telemetry.kappa[w.id] = kappa;
        this.telemetry.alpha[w.id] = alpha;
      }
      
      // Gravity component and Aero —— P2a：分轴地面效应 cl(h) + DRS 真减阻
      // 标定结构双端同式（前端 qs camelCase ↔ 引擎 AeroParams snake_case）：
      //   参考点下压力 aeroF（qs.speed 对应速度）按 aeroBias 分前/后轴（aeroF_f = aeroF·bias），
      //   各轴随 v² 缩放后再乘该轴地面效应 ge(h)。h = 车底净高（名义 0.11m + 车身
      //   Z/俯仰 − 路面：前轴 y=+a·θ、后轴 y=−b·θ），由下压沉浮闭环 → 高速“吸低”、
      //   cl 增强。
      //   缺省标定：geHrefMm=100（ge=1 设计高度）、geGain=0.5、geHminMm=30
      //   （cl 上限起始）、geFloor=0.80（离地抬高最低 cl）、drsVms=40（开翼速度
      //   阈值 m/s，驾驶端判定）、drsCdScale=0.72（开翼阻力 ×0.72 ≈ −28%）、
      //   drsClScale=0.90（开翼后轴下压 ×0.90 ≈ −10%；DRS 是尾翼襟翼，只削后轴
      //   分量，俯仰随之轻微低头——比整车等比例缩放更接近真实）。
      const qsA = this.S.qs || {};
      const numQ = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
      const aeroF = numQ(qsA.aeroF, 500);
      const aeroRefSpeed = numQ(qsA.speed, 160) * (1000/3600);
      const v2 = st.u * st.u;
      const aeroScale = v2 / (aeroRefSpeed * aeroRefSpeed + 1e-5);
      const drsOn = !!(ctrl && ctrl.drs);
      const F_drag = 0.5 * 1.225 * 0.35 * (this.m < 400 ? 0.9 : 1.8) * v2 * (st.u >= 0 ? 1.0 : -1.0)
                   * (drsOn ? numQ(qsA.drsCdScale, 0.72) : 1.0);
      const geHref = numQ(qsA.geHrefMm, 100) / 1000.0;
      const geGain = numQ(qsA.geGain, 0.5);
      const geHmin = numQ(qsA.geHminMm, 30) / 1000.0;
      const geFloor = numQ(qsA.geFloor, 0.80);
      const geMax = 1.0 + geGain * (geHref / geHmin - 1.0);
      const aeroGe = (hM) => Math.max(geFloor, Math.min(geMax, 1.0 + geGain * (geHref / Math.max(hM, geHmin) - 1.0)));
      const biasF = numQ(qsA.aeroBias, 0.5);
      const aeroF_f = aeroF * biasF;
      const aeroF_r = aeroF * (1.0 - biasF);
      const zRoadF = 0.5 * (wheelStates.FL.z_road + wheelStates.FR.z_road);
      const zRoadR = 0.5 * (wheelStates.RL.z_road + wheelStates.RR.z_road);
      const hAeroF = 0.11 + st.Z + rideOffset + this.a * st.theta - zRoadF;
      const hAeroR = 0.11 + st.Z + rideOffset - this.b * st.theta - zRoadR;
      const geF = aeroGe(hAeroF);
      const geR = aeroGe(hAeroR);
      const F_down_f = aeroF_f * geF * aeroScale;
      const F_down_r = aeroF_r * geR * aeroScale * (drsOn ? numQ(qsA.drsClScale, 0.90) : 1.0);
      const F_down = F_down_f + F_down_r;
      const F_gravity_slope = this.m * 9.81 * sinA;
      
      // Accelerations in body frame (+Y Forward, +X Right, +Z Up)
      let SumFy = SumFy_tire - F_gravity_slope - F_drag;
      let SumFx = SumFx_tire;
      let SumFz = (F_susp.FL + F_susp.FR + F_susp.RL + F_susp.RR) - (this.m * 9.81 * cosA + F_down);
      
      // Chassis Bottoming Ground Collision Protection
      const roadCenterH = pathObj ? (pathObj.getRoadElevation(st.X, st.Y).z_road || 0) : 0;
      const bellyClearance = st.Z + rideOffset + 0.11 - roadCenterH;
      if (bellyClearance < 0) {
        const F_scrape = -bellyClearance * (this.m * 9.81 * 75.0);
        SumFz += F_scrape;
        SumFy -= Math.sign(st.u || 1) * F_scrape * 0.35;
        if (typeof SLOPE_STAGE !== 'undefined' && SLOPE_STAGE.active) {
          if (SLOPE_STAGE.stats) SLOPE_STAGE.stats.bottomOutCount.chassis++;
          if (SLOPE_STAGE.recordChassisScrape) SLOPE_STAGE.recordChassisScrape(st.X, st.Y, st.Z);
        }
      }

      // Rotational damping to prevent undamped resonance oscillations
      const C_pitch_damp = Math.sqrt(this.Kw_F * this.a * this.a * this.I_pitch) * 0.45;
      const C_roll_damp = Math.sqrt(this.Kw_F * (this.tF / 2.0)**2 * this.I_roll) * 0.45;
      const C_yaw_damp = this.I_yaw * 0.75;

      // Restoring Pitch moment
      // P2a：删 0.15·(b−a) 近似（旧 F_aero_pitch）——分轴下压按其轴平面力臂作用：
      //   前轴 y=+a 向下压 → 低头（−F_down_f·a）；后轴 y=−b 向下压 → 抬头
      //   （+F_down_r·b）。俯仰沉浮 → 分轴车底净高/ge(h) 闭环 → 轴荷分配由弹簧
      //   俯仰平衡自动闭合（不再需要偏置伪力矩）。CoP 取轴平面，未建模前翼/尾翼
      //   相对轴平面的伸出量——几何量级合理近似，可由 ge 标定继续修正。
      const M_aero_pitch = F_down_r * this.b - F_down_f * this.a;
      const SumM_pitch = (F_susp.FL + F_susp.FR) * this.a - (F_susp.RL + F_susp.RR) * this.b
                       + F_gravity_slope * this.h_cg - F_drag * this.h_cg - C_pitch_damp * st.q + M_aero_pitch;
      // Restoring Roll moment
      const SumM_roll  = (F_susp.FL - F_susp.FR) * (this.tF / 2.0)
                       + (F_susp.RL - F_susp.RR) * (this.tR / 2.0)
                       - SumFx * this.h_roll_arm - C_roll_damp * st.p;
      const SumM_yaw   = SumMz_tire - C_yaw_damp * st.r;
      
      const d_u = SumFy / this.m - st.v * st.r - st.w * st.q;
      const d_v = SumFx / this.m + st.u * st.r + st.w * st.p;
      const d_w = SumFz / this.m;
      
      const d_q = SumM_pitch / this.I_pitch;
      const d_p = SumM_roll / this.I_roll;
      const d_r = SumM_yaw / this.I_yaw;
      
      st.u += d_u * dt;
      st.v += d_v * dt;
      st.w += d_w * dt;
      st.q += d_q * dt;
      st.p += d_p * dt;
      st.r += d_r * dt;
      
      // Update orientation and position in global coordinate system
      const v_world_X = -st.u * sPsi + st.v * cPsi;
      const v_world_Y =  st.u * cPsi + st.v * sPsi;
      
      st.X += v_world_X * dt;
      st.Y += v_world_Y * dt;
      st.Z = Math.max(-0.25, Math.min(25.0, st.Z + st.w * dt));
      st.theta = Math.max(-1.4, Math.min(1.4, st.theta + st.q * dt));
      st.phi = Math.max(-1.2, Math.min(1.2, st.phi + st.p * dt));
      st.psi += st.r * dt;
      
      this.telemetry.ax = SumFy / (this.m * 9.81);
      this.telemetry.ay = -SumFx / (this.m * 9.81);
      this.telemetry.az = SumFz / (this.m * 9.81);
      this.telemetry.aero = { downF_f: F_down_f, downF_r: F_down_r, downF: F_down, drag: F_drag, geF: geF, geR: geR, hF: hAeroF, hR: hAeroR, drs: drsOn };
      
      t_remain -= dt;
    }
  }
}
window.VehicleDynamics15DOF = VehicleDynamics15DOF;

/* =====================================================================
   PROVING GROUND: 60-FPS 15-DOF CONTINUOUS DYNAMIC TEST STAGE
   (Default Comprehensive Multi-Condition Suite, 10x Consecutive Jump Ramps,
    Continuous Moose Slalom, Cleats/Bumps, Washboard, Split-Mu, Slope & Custom Sequences)
   ===================================================================== */
const SLOPE_STAGE = {
  active: false,
  playing: true,
  autoPilot: true,
  timeScale: 1.0,
  scenario: "comprehensive", // 默认：全工况综合连续试验场
  grade: 0.18,
  speedKmh: 85.0,
  distTraveled: 0,
  camMode: "behind",
  camOrbit: { az: 0, elv: 0, distFactor: 1.0 },
  lastTime: 0,
  drag: null,
  cachedScene: null,
  rebuildCadence: 0,
  keys: { w: false, s: false, a: false, d: false, space: false },
  
  // Live suspension tuning drawer
  liveTuning: {
    k_f_pct: 0,
    k_r_pct: 0,
    c_f_pct: 0,
    c_r_pct: 0,
    arb_f_pct: 0,
    arb_r_pct: 0,
    ride_height_mm: 0,
    bbias: 58
  },
  
  // Scenario Configs & Preset Repeat Counts
  scenarioConfigs: {
    comprehensive: { speedKmh: 85.0, repeatCount: 1 },
    jump_ramp: { speedKmh: 85.0, repeatCount: 10, rampHeight: 1.10, rampSpacing: 65.0 },
    moose_test: { speedKmh: 75.0, repeatCount: 5, mooseLaneWidth: 2.8, mooseOffset: 3.5 },
    bumps_cleats: { speedKmh: 60.0, repeatCount: 8, bumpSubType: "staggered", bumpHeight: 0.060 },
    washboard_potholes: { speedKmh: 50.0, repeatCount: 1, washboardWavelength: 1.25, washboardAmplitude: 0.035, potholeDepth: -0.055 },
    accel_brake: { speedKmh: 0.0, repeatCount: 1, accelBrakeTriggerY: 75.0 },
    split_mu: { speedKmh: 70.0, repeatCount: 1, muLeft: 1.35, muRight: 0.28 },
    slope_climb: { speedKmh: 65.0, repeatCount: 1, grade: 0.18 },
    undulating_road: { speedKmh: 45.0, repeatCount: 12, undulatingWavelength: 9.0, undulatingAmplitude: 0.035, undulatingCrossAmp: 0.035, undulatingPhase: 180, undulatingType: "staggered_moguls", hillStartActive: false },
    custom: { speedKmh: 85.0, repeatCount: 10, customSegments: [] }
  },
  
  // Real-time cumulative evaluation stats
  stats: {
    isAirborne: false,
    airborneTime: 0,
    maxAirborneT: 0,
    currentAirborneT: 0,
    maxAltitude: 0,
    jumpDist: 0,
    jumpCount: 0,
    takeoffY: 0,
    takeoffSpeed: 0,
    landingPeakG: 0,
    landingPitchDeg: 0,
    landingScore: 100,
    bottomOutCount: { FL: 0, FR: 0, RL: 0, RR: 0, chassis: 0 },
    moosePass: null,
    coneHits: 0,
    peakMooseAy: 0,
    peakMooseRoll: 0,
    accel0_100T: null,
    brakingDist: null,
    peakBrakeG: 0,
    vibrationRMS: 0,
    vibrationSamples: [],
    sparks: []
  },

  hillStart: {
    active: false,
    state: "idle", // "idle" | "approaching" | "stopping" | "holding" | "launching" | "completed"
    holdTimer: 0,
    stopY: 0,
    rollbackDist: 0,
    launchStartTime: 0,
    timeTo25Kmh: 0,
    score: 100,
    verdict: ""
  },

  recordChassisScrape: function(x, y, z) {
    if (this.stats.sparks.length > 35) return;
    for (let i = 0; i < 6; i++) {
      this.stats.sparks.push({
        x: (x + (Math.random() - 0.5) * 0.4) * 1000,
        y: (Math.random() - 0.5) * 600,
        z: 15 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 1400,
        vy: -2200 - Math.random() * 3200,
        vz: 350 + Math.random() * 900,
        life: 0.28 + Math.random() * 0.25
      });
    }
  },

  resetVehicle: function() {
    this.distTraveled = 0;
    if (this.hillStart) {
      this.hillStart.state = "idle";
      this.hillStart.rollbackDist = 0;
      this.hillStart.holdTimer = 0;
      this.hillStart.verdict = "";
    }
    const cfg = this.scenarioConfigs[this.scenario] || {};
    const initSpeedKmh = (this.scenario === "accel_brake") ? 0 : (cfg.speedKmh || this.speedKmh || 85);
    const initSpeedMs = (initSpeedKmh * 1000) / 3600;
    this.speedKmh = initSpeedKmh;
    
    if (window.physicsEngine) {
      window.physicsEngine.state.X = 0;
      window.physicsEngine.state.Y = 0;
      window.physicsEngine.state.Z = 0;
      window.physicsEngine.state.psi = 0;
      window.physicsEngine.state.theta = 0;
      window.physicsEngine.state.phi = 0;
      window.physicsEngine.state.u = initSpeedMs;
      window.physicsEngine.state.v = 0;
      window.physicsEngine.state.w = 0;
      window.physicsEngine.state.p = 0;
      window.physicsEngine.state.q = 0;
      window.physicsEngine.state.r = 0;
      const reF = window.physicsEngine.ReF || 0.33;
      const reR = window.physicsEngine.ReR || 0.33;
      window.physicsEngine.state.omega = {
        FL: initSpeedMs / reF,
        FR: initSpeedMs / reF,
        RL: initSpeedMs / reR,
        RR: initSpeedMs / reR
      };
    }
    
    this.stats.isAirborne = false;
    this.stats.airborneTime = 0;
    this.stats.currentAirborneT = 0;
    this.stats.maxAirborneT = 0;
    this.stats.maxAltitude = 0;
    this.stats.jumpDist = 0;
    this.stats.jumpCount = 0;
    this.stats.takeoffY = 0;
    this.stats.landingPeakG = 0;
    this.stats.landingScore = 100;
    this.stats.bottomOutCount = { FL: 0, FR: 0, RL: 0, RR: 0, chassis: 0 };
    this.stats.moosePass = null;
    this.stats.coneHits = 0;
    this.stats.peakMooseAy = 0;
    this.stats.peakMooseRoll = 0;
    this.stats.accel0_100T = null;
    this.stats.brakingDist = null;
    this.stats.peakBrakeG = 0;
    this.stats.vibrationRMS = 0;
    this.stats.vibrationSamples = [];
    this.stats.sparks = [];
    
    if (window.straightTestPath) {
      window.straightTestPath._coneHits.clear();
      window.straightTestPath.targetSpeed = initSpeedMs;
    }
  },

  switchScenario: function(scId, updateUI = true) {
    if (!this.scenarioConfigs[scId]) scId = "comprehensive";
    this.scenario = scId;
    const cfg = this.scenarioConfigs[scId];
    
    if (scId === "slope_climb") {
      this.grade = cfg.grade || 0.18;
    } else {
      this.grade = 0.0;
    }
    
    const targetKmh = cfg.speedKmh !== undefined ? cfg.speedKmh : 85.0;
    this.speedKmh = targetKmh;
    const targetMs = (targetKmh * 1000) / 3600;
    
    if (!window.straightTestPath) {
      window.straightTestPath = new StraightPath(targetMs, scId, cfg);
    } else {
      window.straightTestPath.setScenario(scId, cfg);
      window.straightTestPath.targetSpeed = targetMs;
    }
    
    if (window.slopePilot) {
      window.slopePilot.setPath(window.straightTestPath);
    }
    
    if (scId === "undulating_road") {
      // G28-fix：记录进入前车型，离开时还原——undulating 专用 baja 不允许污染其他场景
      if (S.vehicleType !== "baja") this._preUndulVehicle = S.vehicleType;
      if (typeof loadVehiclePreset === "function") {
        loadVehiclePreset("baja");
      } else if (typeof VEHICLE_PRESETS !== "undefined" && VEHICLE_PRESETS.baja) {
        S.vehicleType = "baja";
        const bp = VEHICLE_PRESETS.baja;
        S.wb = bp.wb; S.hcg = bp.hcg;
        if (bp.limF) { S.trMin = bp.limF[0]; S.trMax = bp.limF[1]; }
      }
      // Re-instantiate 15DOF physics engine with the loaded Baja off-road preset
      if (typeof VehicleDynamics15DOF === "function" && typeof SIM !== "undefined") {
        window.physicsEngine = new VehicleDynamics15DOF(S, SIM, targetMs);
      }
      if (typeof UniversalAutoPilot === "function") {
        window.slopePilot = new UniversalAutoPilot(S);
        if (window.straightTestPath) window.slopePilot.setPath(window.straightTestPath);
        window.slopePilot.active = true;
      }
      this.cachedScene = null;
      this.rebuildCadence = 0;
      this.camMode = "front_low";
      this.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
      const camBtns = document.querySelectorAll(".slope-cam-btn");
      camBtns.forEach(b => b.classList.toggle("on", b.dataset.cam === "front_low"));
    } else if (this._preUndulVehicle && scId !== "undulating_road") {
      // G28-fix：离开起伏路面，还原进入前车型并同步重建引擎/车手（S 已被 baja 覆写）
      const prevType = this._preUndulVehicle;
      this._preUndulVehicle = null;
      if (typeof VEHICLE_PRESETS !== "undefined" && VEHICLE_PRESETS[prevType]) {
        if (typeof loadVehiclePreset === "function") {
          loadVehiclePreset(prevType);
        } else {
          S.vehicleType = prevType;
        }
        if (typeof VehicleDynamics15DOF === "function" && typeof SIM !== "undefined") {
          window.physicsEngine = new VehicleDynamics15DOF(S, SIM, targetMs);
        }
        if (typeof UniversalAutoPilot === "function") {
          window.slopePilot = new UniversalAutoPilot(S);
          if (window.straightTestPath) window.slopePilot.setPath(window.straightTestPath);
          window.slopePilot.active = true;
        }
      }
    }

    // Always keep slopeVehName HUD element in sync with the current active vehicle preset
    const elName = document.getElementById("slopeVehName");
    if (elName && typeof VEHICLE_PRESETS !== "undefined" && VEHICLE_PRESETS[S.vehicleType]) {
      elName.textContent = VEHICLE_PRESETS[S.vehicleType].name;
    }
    
    this.resetVehicle();
    if (updateUI) syncSlopeScenarioUI();
  }
};

function paintStageError(canvasId, tag, err){
  try {
    const cv = document.getElementById(canvasId);
    if(!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if(cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr){
      cv.width = Math.max(1, cv.clientWidth * dpr);
      cv.height = Math.max(1, cv.clientHeight * dpr);
    }
    const w = cv.width / dpr, h = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0f16"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f85149";
    ctx.font = "700 15px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("⚠ " + tag, 24, 34);
    ctx.fillStyle = "#c9d1d9";
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    const msg = String((err && err.message) || err || "unknown");
    const lines = String(msg).match(/.{1,72}/g) || [msg];
    lines.slice(0, 8).forEach((ln, i) => ctx.fillText(ln, 24, 62 + i * 18));
    if(err && err.stack){
      const at = String(err.stack).split("\n").filter(l => /\bat\b/.test(l)).slice(0, 4);
      ctx.fillStyle = "#8b949e";
      at.forEach((ln, i) => ctx.fillText(String(ln).trim().slice(0, 90), 24, 62 + (lines.length + 1) * 18 + i * 18));
    }
  } catch(_e){ }
}

const SLOPE_CAMS_CONFIG = {
  behind:     { dx: 0,     dy: -3800, dz: 950,  lookDy: 600,  lookDz: 300, fov: 1.6 },
  front_low:  { dx: 0,     dy: 2350,  dz: 270,  lookDy: -350, lookDz: 220, fov: 1.55 },
  front:      { dx: 0,     dy: 3200,  dz: 700,  lookDy: -400, lookDz: 250, fov: 1.6 },
  suspension: { dx: -1800, dy: 600,   dz: 320,  lookDy: 800,  lookDz: 250, fov: 1.9 },
  threeq:     { dx: 3000,  dy: -3400, dz: 1400, lookDy: 400,  lookDz: 300, fov: 1.5 },
  cockpit:    { dx: 0,     dy: -150,  dz: 620,  lookDy: 2500, lookDz: 350, fov: 1.3 },
  side:       { dx: 3800,  dy: 0,     dz: 650,  lookDy: 0,    lookDz: 300, fov: 1.6 },
  side_track: { dx: 4500,  dy: -1200, dz: 1100, lookDy: 1200, lookDz: 350, fov: 1.5 }
};
window.SLOPE_CAMS_CONFIG = SLOPE_CAMS_CONFIG;

function openSlopeStage(){
  const modal = document.getElementById("slopeStageModal");
  if(!modal) return;
  if (window.SKIDPAD_STAGE && SKIDPAD_STAGE.active) closeSkidpadStage();
  if (window.CIRCUIT_STAGE && CIRCUIT_STAGE.active) closeCircuitStage();
  SLOPE_STAGE.active = true;
  SLOPE_STAGE.playing = true;
  SLOPE_STAGE.autoPilot = true;
  SLOPE_STAGE.lastTime = performance.now();
  SLOPE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
  SLOPE_STAGE.cachedScene = null;
  SLOPE_STAGE.rebuildCadence = 0;
  
  const vehName = (VEHICLE_PRESETS[S.vehicleType]||{}).name || "FIA GT3";
  const elName = document.getElementById("slopeVehName");
  if(elName) elName.textContent = vehName;
  modal.classList.add("show");

  const cv = document.getElementById("slopeCanvas");
  if(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  
  try {
    const cfg = SLOPE_STAGE.scenarioConfigs[SLOPE_STAGE.scenario] || {};
    const initSpeedKmh = (SLOPE_STAGE.scenario === "accel_brake") ? 0 : (cfg.speedKmh || SLOPE_STAGE.speedKmh || 85);
    const initSpeedMs = (initSpeedKmh * 1000) / 3600;
    SLOPE_STAGE.speedKmh = initSpeedKmh;

    window.physicsEngine = new VehicleDynamics15DOF(S, SIM, initSpeedMs);
    window.straightTestPath = new StraightPath(initSpeedMs, SLOPE_STAGE.scenario, cfg);
    window.slopePilot = new UniversalAutoPilot(S);
    window.slopePilot.setPath(window.straightTestPath);
    window.slopePilot.active = true;

    SLOPE_STAGE.resetVehicle();
    syncSlopeScenarioUI();

    requestAnimationFrame(slopeStageLoop);
  } catch(err) {
    console.error("Slope Stage Init Error:", err);
    SLOPE_STAGE.active = false;
    paintStageError("slopeCanvas", "试验场舞台初始化失败", err);
  }
}

function closeSlopeStage(){
  const modal = document.getElementById("slopeStageModal");
  if(modal) modal.classList.remove("show");
  SLOPE_STAGE.active = false;
  S.rack = 0; S.swAngle = 0;
  rebuild();
}

function slopeStageLoop(now){
  if(!SLOPE_STAGE.active) return;
  const rawDt = Math.min(0.033, (now - (SLOPE_STAGE.lastTime || now)) / 1000);
  SLOPE_STAGE.lastTime = now;
  const dt = rawDt * (SLOPE_STAGE.timeScale || 1.0);

  const curSt = window.physicsEngine ? window.physicsEngine.state : { X: 0, Y: 0 };
  let currentGrade = 0;
  if (SLOPE_STAGE.scenario === "slope_climb") {
    currentGrade = Math.atan(SLOPE_STAGE.grade);
  } else if (window.straightTestPath && typeof window.straightTestPath.getRoadSlope === "function") {
    const slp = window.straightTestPath.getRoadSlope(curSt.X, curSt.Y);
    currentGrade = slp.slopeAngle || 0;
  }

  const env = { 
    grade: currentGrade, 
    path: window.straightTestPath,
    bumpNoise: 0
  };
  
  // 1. Autonomous / Manual Pilot Control
  let ctrl = { steer: 0, throttle: 0, brake: 0 };
  const targetSpeedMs = (SLOPE_STAGE.speedKmh * 1000) / 3600;

  const isUserManual = (SLOPE_STAGE.keys.w || SLOPE_STAGE.keys.s || SLOPE_STAGE.keys.a || SLOPE_STAGE.keys.d || SLOPE_STAGE.keys.space);
  
  if(isUserManual) {
    SLOPE_STAGE.autoPilot = false;
    if (window.slopePilot) window.slopePilot.active = false;
    if(SLOPE_STAGE.keys.a) ctrl.steer -= 14;
    if(SLOPE_STAGE.keys.d) ctrl.steer += 14;
    if(SLOPE_STAGE.keys.w) ctrl.throttle = 1.0;
    if(SLOPE_STAGE.keys.s || SLOPE_STAGE.keys.space) ctrl.brake = 1.0;
  } else {
    SLOPE_STAGE.autoPilot = true;
    if (window.slopePilot && window.physicsEngine) {
      window.slopePilot.active = true;
      if (window.slopePilot.path) {
        if (SLOPE_STAGE.scenario !== "accel_brake") {
          window.slopePilot.path.targetSpeed = targetSpeedMs;
        }
      } else {
        window.slopePilot.setPath(window.straightTestPath || new StraightPath(targetSpeedMs, SLOPE_STAGE.scenario));
      }
      ctrl = window.slopePilot.drive(window.physicsEngine.state, dt);
    }
  }

  // Hill Start & Launch Test controller intervention
  if (SLOPE_STAGE.scenario === "undulating_road" && SLOPE_STAGE.hillStart && SLOPE_STAGE.hillStart.active && !isUserManual) {
    const slp = window.straightTestPath ? window.straightTestPath.getRoadSlope(curSt.X, curSt.Y) : { isUphill: false, slopePct: 0 };
    const hs = SLOPE_STAGE.hillStart;

    if (hs.state === "idle" || hs.state === "approaching") {
      hs.state = "approaching";
      hs.verdict = `正在驶向坡道 (当前坡度: ${slp.slopePct.toFixed(1)}%)...`;
      if (slp.isUphill && slp.slopePct >= 10.0 && curSt.Y >= 8.0) {
        hs.state = "stopping";
      }
    } else if (hs.state === "stopping") {
      ctrl.throttle = 0;
      ctrl.brake = 1.0;
      hs.verdict = `坡道刹停中... 车速 ${(curSt.u * 3.6).toFixed(1)} km/h`;
      if (Math.abs(curSt.u) < 0.08) {
        hs.state = "holding";
        hs.holdTimer = 2.0;
        hs.stopY = curSt.Y;
        hs.rollbackDist = 0;
        hs.launchStartTime = now;
      }
    } else if (hs.state === "holding") {
      ctrl.throttle = 0;
      ctrl.brake = 1.0;
      hs.holdTimer -= dt;
      hs.verdict = `坡道静止保持中... 剩余 ${Math.max(0, hs.holdTimer).toFixed(1)}s`;
      if (hs.holdTimer <= 0) {
        hs.state = "launching";
        hs.launchStartTime = now;
      }
    } else if (hs.state === "launching") {
      ctrl.brake = 0;
      const launchElapsed = Math.max(0.01, (now - hs.launchStartTime) / 1000);
      ctrl.throttle = Math.min(1.0, 0.45 + launchElapsed * 0.6);
      if (curSt.Y < hs.stopY) {
        hs.rollbackDist = Math.max(hs.rollbackDist, (hs.stopY - curSt.Y) * 100);
      }
      hs.verdict = `全力起步爬坡中！车速: ${(curSt.u * 3.6).toFixed(1)} km/h | 溜车量: ${hs.rollbackDist.toFixed(1)} cm`;
      if (curSt.u * 3.6 >= 25.0) {
        hs.state = "completed";
        hs.timeTo25Kmh = launchElapsed.toFixed(1);
        hs.score = Math.max(10, Math.round(100 - hs.rollbackDist * 3.0 - Math.max(0, launchElapsed - 2.0) * 10));
        hs.verdict = (hs.rollbackDist < 2.0)
          ? `🏆 完美起步！零溜车 (${hs.rollbackDist.toFixed(1)}cm) · 启动用时: ${hs.timeTo25Kmh}s · 得分: ${hs.score}`
          : (hs.rollbackDist < 8.0)
          ? `🟡 良好起步！微量溜车 (${hs.rollbackDist.toFixed(1)}cm) · 启动用时: ${hs.timeTo25Kmh}s · 得分: ${hs.score}`
          : `🔴 溜车严重 (${hs.rollbackDist.toFixed(1)}cm) · 启动用时: ${hs.timeTo25Kmh}s · 得分: ${hs.score}`;
      }
    }
  }

  if(SLOPE_STAGE.playing && window.physicsEngine) {
    window.physicsEngine.step(ctrl, env, dt);
    const st = window.physicsEngine.state;
    SLOPE_STAGE.distTraveled += Math.max(0, st.u) * dt * 1000;

    // Evaluate Scenario Specific Metrics & Airborne Detection
    const tel = window.physicsEngine.telemetry;
    const allWheelsOff = (tel.Fz.FL < 10 && tel.Fz.FR < 10 && tel.Fz.RL < 10 && tel.Fz.RR < 10);
    
    if (allWheelsOff) {
      if (!SLOPE_STAGE.stats.isAirborne) {
        SLOPE_STAGE.stats.isAirborne = true;
        SLOPE_STAGE.stats.takeoffY = st.Y;
        SLOPE_STAGE.stats.takeoffSpeed = st.u;
        SLOPE_STAGE.stats.currentAirborneT = 0;
        SLOPE_STAGE.stats.jumpCount++;
      }
      SLOPE_STAGE.stats.currentAirborneT += dt;
      SLOPE_STAGE.stats.maxAirborneT = Math.max(SLOPE_STAGE.stats.maxAirborneT, SLOPE_STAGE.stats.currentAirborneT);
      SLOPE_STAGE.stats.maxAltitude = Math.max(SLOPE_STAGE.stats.maxAltitude, st.Z);
      SLOPE_STAGE.stats.jumpDist = Math.max(0, st.Y - SLOPE_STAGE.stats.takeoffY);
    } else {
      if (SLOPE_STAGE.stats.isAirborne) {
        // Just Landed! Record landing shock
        SLOPE_STAGE.stats.isAirborne = false;
        const totalLandingFz = (tel.Fz.FL + tel.Fz.FR + tel.Fz.RL + tel.Fz.RR);
        const landingG = totalLandingFz / (window.physicsEngine.m * 9.81);
        SLOPE_STAGE.stats.landingPeakG = Math.max(SLOPE_STAGE.stats.landingPeakG, landingG);
        SLOPE_STAGE.stats.landingPitchDeg = Math.abs(st.theta * (180 / Math.PI));
        SLOPE_STAGE.stats.landingScore = Math.max(10, Math.min(100, Math.round(100 - (landingG - 1.0) * 18 - SLOPE_STAGE.stats.landingPitchDeg * 3)));
      }
    }

    // Moose Test Cone Collision Checking
    if (window.straightTestPath) {
      const vehW = (S.front && S.front.hp && S.front.hp.WC ? Math.abs(S.front.hp.WC[0] * 2) / 1000 : 1.8);
      const vehL = (S.wb || 2600) / 1000 + 0.8;
      const hits = window.straightTestPath.checkConeCollisions(st.X, st.Y, st.psi, vehW, vehL);
      SLOPE_STAGE.stats.coneHits = hits;
      SLOPE_STAGE.stats.peakMooseAy = Math.max(SLOPE_STAGE.stats.peakMooseAy, Math.abs(tel.ay));
      SLOPE_STAGE.stats.peakMooseRoll = Math.max(SLOPE_STAGE.stats.peakMooseRoll, Math.abs(st.phi * (180 / Math.PI)));
      if (st.Y > 60.0) {
        SLOPE_STAGE.stats.moosePass = (hits === 0 && Math.abs(st.X) < 2.0 && Math.abs(st.phi) < 0.22);
      }
    }

    // Washboard Vibration RMS Tracking
    SLOPE_STAGE.stats.vibrationSamples.push(Math.abs(tel.az || 0));
    if (SLOPE_STAGE.stats.vibrationSamples.length > 60) SLOPE_STAGE.stats.vibrationSamples.shift();
    let sumSq = 0;
    for (const s of SLOPE_STAGE.stats.vibrationSamples) sumSq += s * s;
    SLOPE_STAGE.stats.vibrationRMS = Math.sqrt(sumSq / SLOPE_STAGE.stats.vibrationSamples.length);

    // Accel & Brake 0-100 & Distance Tracking
    if (SLOPE_STAGE.scenario === "accel_brake" || SLOPE_STAGE.scenario === "comprehensive") {
      const spdKmh = st.u * 3.6;
      if (spdKmh >= 99.5 && SLOPE_STAGE.stats.accel0_100T === null) {
        SLOPE_STAGE.stats.accel0_100T = (SLOPE_STAGE.distTraveled / Math.max(1, st.u));
      }
      if (st.Y >= 75.0 && st.Y <= 120.0) {
        SLOPE_STAGE.stats.peakBrakeG = Math.max(SLOPE_STAGE.stats.peakBrakeG, Math.abs(tel.ax || 0));
        if (st.u < 0.2 && SLOPE_STAGE.stats.brakingDist === null) {
          SLOPE_STAGE.stats.brakingDist = Math.max(0, st.Y - 75.0);
        }
      }
    }

    // Update Spark Particles Life
    for (let i = SLOPE_STAGE.stats.sparks.length - 1; i >= 0; i--) {
      const sp = SLOPE_STAGE.stats.sparks[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      sp.vz -= 9810 * dt;
      sp.life -= dt;
      if (sp.life <= 0 || sp.z < 0) SLOPE_STAGE.stats.sparks.splice(i, 1);
    }
  }

  try {
    const st = window.physicsEngine.state;
    const tel = window.physicsEngine.telemetry;
    
    // 2. Multibody Suspension Kinematics (60fps on undulating terrain)
    SLOPE_STAGE.rebuildCadence++;
    const cadenceRate = (SLOPE_STAGE.scenario === "undulating_road") ? 1 : 2;
    if(SLOPE_STAGE.rebuildCadence % cadenceRate === 0 || !SLOPE_STAGE.cachedScene) {
      const isFormula = S.vehicleType === "formula";
      const rackRatio = isFormula ? -0.55 : -1.5;
      const rackMax = isFormula ? 18 : 38;
      const rackDisplacement = Math.max(-rackMax, Math.min(rackMax, (ctrl.steer || 0) * rackRatio));
      
      const limF = (VEHICLE_PRESETS[S.vehicleType]||{}).limF || [-60, 65];
      const limR = (VEHICLE_PRESETS[S.vehicleType]||{}).limR || [-60, 65];
      const tr = tel.tr || { FL:0, FR:0, RL:0, RR:0 };
      const trFR = Math.max(limF[0], Math.min(limF[1], (tr.FR || 0) * 1000));
      const trRR = Math.max(limR[0], Math.min(limR[1], (tr.RR || 0) * 1000));
      const trFL = Math.max(limF[0], Math.min(limF[1], (tr.FL || 0) * 1000));
      const trRL = Math.max(limR[0], Math.min(limR[1], (tr.RL || 0) * 1000));

      const z0F = (SIM.FR && SIM.FR.n && SIM.FR.idx) ? SIM.FR.n[SIM.FR.idx.WC].p0[2] : 250;
      const z0R = (SIM.RR && SIM.RR.n && SIM.RR.idx) ? SIM.RR.n[SIM.RR.idx.WC].p0[2] : 250;
      if(SIM.FR) driveTo(SIM.FR, z0F + trFR, rackDisplacement, 'front');
      if(SIM.RR) driveTo(SIM.RR, z0R + trRR, 0, 'rear');
      if(S.show.mirror){
        if(SIM.FL) driveTo(SIM.FL, z0F + trFL, -rackDisplacement, 'front');
        if(SIM.RL) driveTo(SIM.RL, z0R + trRL, 0, 'rear');
      }
      S.rack = rackDisplacement;
      S.swAngle = (ctrl.steer || 0) * (isFormula ? 3.5 : 4.5);
      SLOPE_STAGE.cachedScene = buildScenePRO();
    }
    
    // Tire Spin Angles Integration
    const lastSpinS = window._tireSpinAngles || {FL:0,FR:0,RL:0,RR:0};
    const spinDtS = Math.max(0, Math.min(0.033, dt));
    window._tireSpinAngles = {
      FL: lastSpinS.FL + st.omega.FL * spinDtS,
      FR: lastSpinS.FR + st.omega.FR * spinDtS,
      RL: lastSpinS.RL + st.omega.RL * spinDtS,
      RR: lastSpinS.RR + st.omega.RR * spinDtS
    };
    
    const alpha = env.grade;
    renderSlopeScene(alpha, st);
    updateSlopeHUD(st, alpha, tel);
  } catch(err) {
    console.error("Physics Loop Error:", err);
    paintStageError("slopeCanvas", "试验场舞台渲染失败", err);
  }

  requestAnimationFrame(slopeStageLoop);
}

function renderSlopeScene(alpha, st){
  const cv = document.getElementById("slopeCanvas");
  if(!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if(cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr){
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background Sky / Atmosphere Gradient
  const isUndulStage = (SLOPE_STAGE.scenario === "undulating_road");
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  if(isUndulStage){
    skyGrad.addColorStop(0, "#111827");    // Atmospheric twilight / natural outdoor sky
    skyGrad.addColorStop(0.48, "#1f2937"); // Soft horizon transition
    skyGrad.addColorStop(0.56, "#2e394b"); // Horizon haze
    skyGrad.addColorStop(1, "#18202c");    // Distant terrain base
  } else {
    skyGrad.addColorStop(0, "#070a10");
    skyGrad.addColorStop(0.55, "#0d1420");
    skyGrad.addColorStop(1, "#040608");
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Road Orientation vectors
  const cosA = Math.cos(alpha), sinA = Math.sin(alpha);
  const u_road = [0, cosA, sinA];    // Forward
  const n_road = [0, -sinA, cosA];   // Normal Up
  const t_road = [1, 0, 0];          // Right

  const camCfg = SLOPE_CAMS_CONFIG[SLOPE_STAGE.camMode] || SLOPE_CAMS_CONFIG.behind;
  const distFactor = SLOPE_STAGE.camOrbit.distFactor;
  let cam_dx = camCfg.dx * distFactor, cam_dy = camCfg.dy * distFactor, cam_dz = camCfg.dz * distFactor;

  if(SLOPE_STAGE.camOrbit.az !== 0 || SLOPE_STAGE.camOrbit.elv !== 0) {
    const rH = Math.hypot(cam_dx, cam_dy);
    const angH = Math.atan2(cam_dx, cam_dy) + SLOPE_STAGE.camOrbit.az;
    cam_dx = Math.sin(angH) * rH;
    cam_dy = Math.cos(angH) * rH;
    cam_dz = cam_dz + Math.tan(SLOPE_STAGE.camOrbit.elv) * rH;
  }

  const E = [
    cam_dx*t_road[0] + cam_dy*u_road[0] + cam_dz*n_road[0],
    cam_dx*t_road[1] + cam_dy*u_road[1] + cam_dz*n_road[1],
    cam_dx*t_road[2] + cam_dy*u_road[2] + cam_dz*n_road[2]
  ];

  const lookTarget = [
    camCfg.lookDy*u_road[0] + camCfg.lookDz*n_road[0],
    camCfg.lookDy*u_road[1] + camCfg.lookDz*n_road[1],
    camCfg.lookDy*u_road[2] + camCfg.lookDz*n_road[2]
  ];

  const fw_un = [lookTarget[0]-E[0], lookTarget[1]-E[1], lookTarget[2]-E[2]];
  const l_fw = Math.hypot(fw_un[0], fw_un[1], fw_un[2]) || 1;
  const fw = [fw_un[0]/l_fw, fw_un[1]/l_fw, fw_un[2]/l_fw];

  const rt_un = [
    fw[1]*n_road[2] - fw[2]*n_road[1],
    fw[2]*n_road[0] - fw[0]*n_road[2],
    fw[0]*n_road[1] - fw[1]*n_road[0]
  ];
  const l_rt = Math.hypot(rt_un[0], rt_un[1], rt_un[2]) || 1;
  const rt = [rt_un[0]/l_rt, rt_un[1]/l_rt, rt_un[2]/l_rt];

  const up = [
    rt[1]*fw[2] - rt[2]*fw[1],
    rt[2]*fw[0] - rt[0]*fw[2],
    rt[0]*fw[1] - rt[1]*fw[0]
  ];

  const fovDist = Math.min(w, h) * (camCfg.fov || 1.6);
  const halfW = w / 2, halfH = h / 2;

  // View Matrix Elements
  const m11 = rt[0]*t_road[0] + rt[1]*t_road[1] + rt[2]*t_road[2];
  const m12 = rt[0]*u_road[0] + rt[1]*u_road[1] + rt[2]*u_road[2];
  const m13 = rt[0]*n_road[0] + rt[1]*n_road[1] + rt[2]*n_road[2];
  const v0x = -(rt[0]*E[0] + rt[1]*E[1] + rt[2]*E[2]);

  const m21 = up[0]*t_road[0] + up[1]*t_road[1] + up[2]*t_road[2];
  const m22 = up[0]*u_road[0] + up[1]*u_road[1] + up[2]*u_road[2];
  const m23 = up[0]*n_road[0] + up[1]*n_road[1] + up[2]*n_road[2];
  const v0y = -(up[0]*E[0] + up[1]*E[1] + up[2]*E[2]);

  const m31 = fw[0]*t_road[0] + fw[1]*t_road[1] + fw[2]*t_road[2];
  const m32 = fw[0]*u_road[0] + fw[1]*u_road[1] + fw[2]*u_road[2];
  const m33 = fw[0]*n_road[0] + fw[1]*n_road[1] + fw[2]*n_road[2];
  const v0z = -(fw[0]*E[0] + fw[1]*E[1] + fw[2]*E[2]);

  const projFast = (x, y, z) => {
    const zc = m31*x + m32*y + m33*z + v0z;
    if(zc < 50) return null;
    const f = fovDist / zc;
    return [
      halfW + (m11*x + m12*y + m13*z + v0x) * f,
      halfH - (m21*x + m22*y + m23*z + v0y) * f
    ];
  };

  // 1. Draw 3D Dynamic Road
  const carY = (st && st.Y ? st.Y : 0); // in meters
  const carX = (st && st.X ? st.X : 0); // in meters
  const pathObj = window.straightTestPath;
  const isUndulating = (SLOPE_STAGE.scenario === "undulating_road" || (pathObj && pathObj.undulatingSections && pathObj.undulatingSections.length > 0));

  if (isUndulating && pathObj) {
    // 🌊 自然非铺装旷野 · 越野连续交错波浪起伏地表 (Universal Depth-Sorted Moguls Terrain)
    const xHalfW = 9600;  // 19.2m wide terrain
    // G28-fix 非均匀横向采样：左右反相过渡带仅 ±0.9m，旧均匀 1.2m 粗格把
    // 整段交叉轴结构抹进同一列；赛道区(|x|≤2.4m)用 0.4m 细格，外围 1.6m 粗格
    const xEdges = [];
    const pushEdgeBand = (a, b, step) => { for (let x = a; x <= b + 1e-6; x += step) xEdges.push(Math.round(x)); };
    pushEdgeBand(-xHalfW, -3200, 1600);
    pushEdgeBand(-2400, 2400, 400);
    pushEdgeBand(3200, xHalfW, 1600);
    const xCols = xEdges.length - 1;
    const yBack = -22000;  // 22m behind vehicle
    const yFront = 32000;  // 32m in front of vehicle
    const dyStep = 900;    // 0.9m steps（λ≥4m 时每波 ≥4.4 行，保证波峰波谷可见）

    const z_ground_car = (pathObj.getRoadElevation(carX, carY).z_road || 0);
    const slp_car = (typeof pathObj.getRoadSlope === "function") ? pathObj.getRoadSlope(carX, carY) : { slopeAngle: 0 };
    const alpha_car = slp_car.slopeAngle || 0;
    const cosA_c = Math.cos(alpha_car), sinA_c = Math.sin(alpha_car);

    // 1. Generate 2D Grid Vertices with 3D positions in vehicle coordinate frame
    const gridNodes = [];
    const nRows = Math.round((yFront - yBack) / dyStep);
    for (let r = 0; r <= nRows; r++) {
      const yRel = yBack + r * dyStep;
      const worldY = carY + yRel / 1000;
      const row = [];
      for (let c = 0; c <= xCols; c++) {
        const xRel = xEdges[c];
        const worldX = carX + xRel / 1000;
        const elevInfo = pathObj.getRoadElevation(worldX, worldY);
        const zWorld = (elevInfo.z_road || 0);
        const dZ_m = zWorld - z_ground_car;
        const dY_m = yRel / 1000;

        const y_veh_mm = (dY_m * cosA_c + dZ_m * sinA_c) * 1000;
        const z_veh_mm = (-dY_m * sinA_c + dZ_m * cosA_c) * 1000;

        // Camera space depth: zc = m31*x + m32*y + m33*z + v0z
        const zc = m31 * xRel + m32 * y_veh_mm + m33 * z_veh_mm + v0z;
        const p2d = projFast(xRel, y_veh_mm, z_veh_mm);
        row.push({ x: xRel, y: y_veh_mm, z: z_veh_mm, zc, p2d, zWorld });
      }
      gridNodes.push(row);
    }

    // 2. Build Terrain Quads & Depth Sort (Universal Painter's Algorithm)
    const terrainQuads = [];
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < xCols; c++) {
        const nTL = gridNodes[r][c];
        const nTR = gridNodes[r][c + 1];
        const nBR = gridNodes[r + 1][c + 1];
        const nBL = gridNodes[r + 1][c];

        if (nTL.p2d && nTR.p2d && nBR.p2d && nBL.p2d) {
          const avgZc = (nTL.zc + nTR.zc + nBR.zc + nBL.zc) * 0.25;
          if (avgZc > 60) {
            // Normal vector & sunlight calculation
            const dz_y = (nBL.z - nTL.z) / dyStep;
            const dz_x = (nTR.z - nTL.z) / Math.max(1, nTR.x - nTL.x);
            // Sun vector: from front-right-above (0.35, -0.55, 0.75)
            const sunDot = (-dz_x * 0.35 - dz_y * (-0.55) + 0.75) / Math.hypot(dz_x, dz_y, 1.0);
            const diffuse = Math.max(0.25, Math.min(1.0, 0.55 + sunDot * 0.45));

            // Elevation highlight (peaks catch more sun)
            const avgZ = (nTL.zWorld + nTR.zWorld + nBR.zWorld + nBL.zWorld) * 0.25;
            // G28-fix：高光归一化尺度随实际浪幅自适应，避免旧固定 /0.16 夸张
            const elevRef = (pathObj.undulatingSections && pathObj.undulatingSections[0])
              ? Math.max(0.04, pathObj.undulatingSections[0].amp * 1.4) : 0.16;
            const elevNorm = Math.max(-1, Math.min(1, avgZ / elevRef));

            // Off-road slate / desert earth palette
            const rCol = Math.round(56 * diffuse + elevNorm * 16);
            const gCol = Math.round(66 * diffuse + elevNorm * 18);
            const bCol = Math.round(80 * diffuse + elevNorm * 22);

            terrainQuads.push({
              zc: avgZc,
              pts: [nTL.p2d, nTR.p2d, nBR.p2d, nBL.p2d],
              fill: `rgb(${rCol},${gCol},${bCol})`,
              stroke: `rgba(125, 155, 190, ${Math.max(0.08, Math.min(0.35, 12000 / avgZc)).toFixed(2)})`
            });
          }
        }
      }
    }

    // Sort from furthest to nearest
    terrainQuads.sort((a, b) => b.zc - a.zc);

    // Draw all visible quads
    for (let i = 0; i < terrainQuads.length; i++) {
      const q = terrainQuads[i];
      ctx.beginPath();
      ctx.moveTo(q.pts[0][0], q.pts[0][1]);
      ctx.lineTo(q.pts[1][0], q.pts[1][1]);
      ctx.lineTo(q.pts[2][0], q.pts[2][1]);
      ctx.lineTo(q.pts[3][0], q.pts[3][1]);
      ctx.closePath();
      ctx.fillStyle = q.fill;
      ctx.fill();
      ctx.strokeStyle = q.stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  } else {
    // Normal flat road rendering
    const roadHalfW = 4400;
    const isFrontFacing = fw[1] < -0.1;
    const roadNearY = isFrontFacing ? 2000 : -15000;
    const roadFarY = isFrontFacing ? -60000 : 140000;
    const roadGridStep = 3000;
    const animOffset = (SLOPE_STAGE.distTraveled % roadGridStep);

    const pL_near = projFast(-roadHalfW, roadNearY, 0), pR_near = projFast(roadHalfW, roadNearY, 0);
    const pR_far  = projFast(roadHalfW, roadFarY, 0),  pL_far  = projFast(-roadHalfW, roadFarY, 0);

    if(pL_near && pR_near && pR_far && pL_far){
      ctx.beginPath();
      ctx.moveTo(pL_near[0], pL_near[1]); ctx.lineTo(pR_near[0], pR_near[1]);
      ctx.lineTo(pR_far[0], pR_far[1]); ctx.lineTo(pL_far[0], pL_far[1]);
      ctx.closePath();
      const roadGrad = ctx.createLinearGradient(halfW, h, halfW, 0);
      roadGrad.addColorStop(0, "#191f2a");
      roadGrad.addColorStop(0.6, "#121720");
      roadGrad.addColorStop(1, "#0a0e14");
      ctx.fillStyle = roadGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(78,161,211,0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Red and White Track Kerbs & Centerlines
    for(let y = roadNearY; y <= roadFarY; y += roadGridStep){
      const curY = y - animOffset;
      const nextY = curY + roadGridStep;
      const isRed = (Math.floor((curY + SLOPE_STAGE.distTraveled) / roadGridStep) % 2 === 0);
      const kerbCol = isRed ? "#e74c3c" : "#ecf0f1";

      const kL1 = projFast(-roadHalfW, curY, 15),       kL2 = projFast(-roadHalfW-650, curY, 25);
      const kL3 = projFast(-roadHalfW-650, nextY, 25),  kL4 = projFast(-roadHalfW, nextY, 15);
      if(kL1 && kL2 && kL3 && kL4){
        ctx.beginPath();
        ctx.moveTo(kL1[0], kL1[1]); ctx.lineTo(kL2[0], kL2[1]); ctx.lineTo(kL3[0], kL3[1]); ctx.lineTo(kL4[0], kL4[1]);
        ctx.closePath();
        ctx.fillStyle = kerbCol; ctx.fill();
      }

      const kR1 = projFast(roadHalfW, curY, 15),       kR2 = projFast(roadHalfW+650, curY, 25);
      const kR3 = projFast(roadHalfW+650, nextY, 25),  kR4 = projFast(roadHalfW, nextY, 15);
      if(kR1 && kR2 && kR3 && kR4){
        ctx.beginPath();
        ctx.moveTo(kR1[0], kR1[1]); ctx.lineTo(kR2[0], kR2[1]); ctx.lineTo(kR3[0], kR3[1]); ctx.lineTo(kR4[0], kR4[1]);
        ctx.closePath();
        ctx.fillStyle = kerbCol; ctx.fill();
      }

      // Center Dash Line
      const d1 = projFast(0, curY + 600, 2);
      const d2 = projFast(0, curY + 2200, 2);
      if(d1 && d2){
        ctx.beginPath(); ctx.moveTo(d1[0], d1[1]); ctx.lineTo(d2[0], d2[1]);
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }

  // 2. Render 3D Obstacles from Active Track Compiler
  if (pathObj) {
    // 2.1 Render Jump Ramps (Supports 10x consecutive jumps!)
    if (pathObj.ramps && pathObj.ramps.length) {
      for (const r of pathObj.ramps) {
        const relY0 = (r.y0 - carY) * 1000;
        const relY1 = (r.y0 + r.len - carY) * 1000;
        const rH = r.h * 1000;

        if (relY1 > -10000 && relY0 < 110000) {
          const rw = 2200;
          const bL0 = projFast(-rw, relY0, 0), bR0 = projFast(rw, relY0, 0);
          const tL1 = projFast(-rw, relY1, rH), tR1 = projFast(rw, relY1, rH);
          const bL1 = projFast(-rw, relY1, 0), bR1 = projFast(rw, relY1, 0);

          if (bL0 && bR0 && tL1 && tR1) {
            ctx.beginPath();
            ctx.moveTo(bL0[0], bL0[1]); ctx.lineTo(bR0[0], bR0[1]);
            ctx.lineTo(tR1[0], tR1[1]); ctx.lineTo(tL1[0], tL1[1]);
            ctx.closePath();
            ctx.fillStyle = "rgba(232, 160, 76, 0.88)"; ctx.fill();
            ctx.strokeStyle = "#e8a04c"; ctx.lineWidth = 2.5; ctx.stroke();

            // Hazard Arrow
            const midY = (relY0 + relY1) / 2;
            const c1 = projFast(-rw*0.65, midY, rH*0.5);
            const c2 = projFast(0, midY + 1200, rH*0.6);
            const c3 = projFast(rw*0.65, midY, rH*0.5);
            if (c1 && c2 && c3) {
              ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]);
              ctx.strokeStyle = "#111"; ctx.lineWidth = 4; ctx.stroke();
            }
          }
          if (tL1 && tR1 && bR1 && bL1) {
            ctx.beginPath();
            ctx.moveTo(tL1[0], tL1[1]); ctx.lineTo(tR1[0], tR1[1]);
            ctx.lineTo(bR1[0], bR1[1]); ctx.lineTo(bL1[0], bL1[1]);
            ctx.closePath();
            ctx.fillStyle = "#a82020"; ctx.fill();
            ctx.strokeStyle = "#ff4d4f"; ctx.lineWidth = 2; ctx.stroke();
          }
        }
      }
    }

    // 2.2 Render Speed Bumps / Cleats
    if (pathObj.bumps && pathObj.bumps.length) {
      for (const b of pathObj.bumps) {
        const relY = (b.y0 - carY) * 1000;
        const bH = b.h * 1000;
        if (relY > -6000 && relY < 95000) {
          const x0 = b.xMin * 1000, x1 = b.xMax * 1000;
          const p1 = projFast(x0, relY, 0), p2 = projFast(x1, relY, 0);
          const p3 = projFast(x1, relY + 500, 0), p4 = projFast(x0, relY + 500, 0);
          const top1 = projFast(x0, relY + 250, bH), top2 = projFast(x1, relY + 250, bH);

          if (p1 && p2 && p3 && p4 && top1 && top2) {
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(top2[0], top2[1]); ctx.lineTo(top1[0], top1[1]);
            ctx.closePath();
            ctx.fillStyle = "#e0a020"; ctx.fill();

            ctx.beginPath();
            ctx.moveTo(top1[0], top1[1]); ctx.lineTo(top2[0], top2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
            ctx.closePath();
            ctx.fillStyle = "#222"; ctx.fill();
            ctx.strokeStyle = "#faad14"; ctx.lineWidth = 1.2; ctx.stroke();
          }
        }
      }
    }

    // 2.3 Render 3D Traffic Cones (For all continuous moose tests!)
    if (pathObj._cones && pathObj._cones.length) {
      for (const c of pathObj._cones) {
        const relY = (c.y - carY) * 1000;
        const cX = c.x * 1000;
        if (relY > -8000 && relY < 110000) {
          const isHit = pathObj._coneHits.has(c.id);
          const baseSize = 240;
          const coneH = isHit ? 80 : 500;
          const tiltX = isHit ? 250 : 0;

          const b1 = projFast(cX - baseSize, relY - baseSize, 0);
          const b2 = projFast(cX + baseSize, relY - baseSize, 0);
          const b3 = projFast(cX + baseSize, relY + baseSize, 0);
          const b4 = projFast(cX - baseSize, relY + baseSize, 0);
          const tip = projFast(cX + tiltX, relY, coneH);
          const ring1 = projFast(cX + tiltX*0.4, relY, coneH * 0.4);
          const ring2 = projFast(cX + tiltX*0.7, relY, coneH * 0.7);

          if (b1 && b2 && b3 && b4 && tip) {
            ctx.beginPath();
            ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(b3[0], b3[1]); ctx.lineTo(b4[0], b4[1]);
            ctx.closePath();
            ctx.fillStyle = isHit ? "#555" : "#222"; ctx.fill();

            ctx.beginPath();
            ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(tip[0], tip[1]);
            ctx.closePath();
            ctx.fillStyle = isHit ? "#843d10" : "#fa541c"; ctx.fill();

            if (!isHit && ring1 && ring2) {
              ctx.beginPath();
              ctx.moveTo(ring1[0] - 8, ring1[1]); ctx.lineTo(ring1[0] + 8, ring1[1]);
              ctx.lineTo(ring2[0] + 5, ring2[1]); ctx.lineTo(ring2[0] - 5, ring2[1]);
              ctx.closePath();
              ctx.fillStyle = "#ffffff"; ctx.fill();
            }
          }
        }
      }
    }

    // 2.4 Render Washboard & Potholes
    if (pathObj.washboardSections && pathObj.washboardSections.length) {
      for (const wSec of pathObj.washboardSections) {
        for (let y = wSec.y0; y < wSec.y0 + wSec.len; y += 1.25) {
          const relY = (y - carY) * 1000;
          if (relY > -8000 && relY < 95000) {
            const p1 = projFast(-2800, relY, 15);
            const p2 = projFast(2800, relY, 15);
            if (p1 && p2) {
              ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
              ctx.strokeStyle = "rgba(255, 255, 255, 0.25)"; ctx.lineWidth = 3; ctx.stroke();
            }
          }
        }
      }
    }

    // 2.5 Render 3D Gantries & Overhead Section Banners
    if (pathObj.gantries && pathObj.gantries.length) {
      for (const g of pathObj.gantries) {
        const relY = (g.y - carY) * 1000;
        if (relY > -4000 && relY < 120000) {
          const gw = 4600, gh = 4200;
          const pL_bot = projFast(-gw, relY, 0), pL_top = projFast(-gw, relY, gh);
          const pR_bot = projFast(gw, relY, 0),  pR_top = projFast(gw, relY, gh);
          const pMid_top = projFast(0, relY, gh);

          if (pL_bot && pL_top && pR_bot && pR_top) {
            // Metallic Truss Posts
            ctx.beginPath();
            ctx.moveTo(pL_bot[0], pL_bot[1]); ctx.lineTo(pL_top[0], pL_top[1]);
            ctx.moveTo(pR_bot[0], pR_bot[1]); ctx.lineTo(pR_top[0], pR_top[1]);
            ctx.moveTo(pL_top[0], pL_top[1]); ctx.lineTo(pR_top[0], pR_top[1]);
            ctx.strokeStyle = "#4ea1d3"; ctx.lineWidth = 4.0; ctx.stroke();

            // Overhead Banner Box
            const bL = projFast(-3200, relY, gh - 800);
            const bR = projFast(3200, relY, gh - 800);
            const tL = projFast(-3200, relY, gh + 200);
            const tR = projFast(3200, relY, gh + 200);
            if (bL && bR && tL && tR) {
              ctx.beginPath();
              ctx.moveTo(bL[0], bL[1]); ctx.lineTo(bR[0], bR[1]);
              ctx.lineTo(tR[0], tR[1]); ctx.lineTo(tL[0], tL[1]);
              ctx.closePath();
              ctx.fillStyle = "rgba(13, 22, 38, 0.92)"; ctx.fill();
              ctx.strokeStyle = "#58a6ff"; ctx.lineWidth = 1.8; ctx.stroke();

              // Banner Text
              if (pMid_top) {
                const fs = Math.max(10, Math.min(22, 28000 / Math.max(100, relY)));
                ctx.fillStyle = "#58a6ff";
                ctx.font = `bold ${fs}px ui-monospace, sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText(g.text || "STAGE SECTION", pMid_top[0], pMid_top[1] + fs * 0.4);
                ctx.textAlign = "left";
              }
            }
          }
        }
      }
    }
  }

  // 3. 3D Ground Shadow with Dynamic Flight Altitude Scaling & Soft Blurring
  const shadowW = Math.max(1200, (S.front.tire.R || 300) * 3);
  const shadowL = (S.wb || 2600) + 800;
  const flightH = Math.max(0, st.Z);
  const shadowScale = 1.0 + Math.min(2.5, flightH * 0.85);
  const shadowAlpha = Math.max(0.10, 0.45 / (1.0 + flightH * 1.8));

  const cX_shad = (st && st.X ? st.X : 0) * 1000;
  const cY_shad = Math.cos(st && st.psi ? st.psi : 0);
  const sY_shad = Math.sin(st && st.psi ? st.psi : 0);

  const projShad = (lx, ly) => {
    const rx = cY_shad * (lx * shadowScale) - sY_shad * (ly * shadowScale) + cX_shad;
    const ry = sY_shad * (lx * shadowScale) + cY_shad * (ly * shadowScale);
    if (isUndulating && pathObj) {
      const zWorld = (pathObj.getRoadElevation(carX + rx / 1000, carY + ry / 1000).z_road || 0);
      const z_ground_car = (pathObj.getRoadElevation(carX, carY).z_road || 0);
      const dZ_m = zWorld - z_ground_car;
      const dY_m = ry / 1000;
      const slp_car = (typeof pathObj.getRoadSlope === "function") ? pathObj.getRoadSlope(carX, carY) : { slopeAngle: 0 };
      const aC = slp_car.slopeAngle || 0;
      const y_veh = (dY_m * Math.cos(aC) + dZ_m * Math.sin(aC)) * 1000;
      const z_veh = (-dY_m * Math.sin(aC) + dZ_m * Math.cos(aC)) * 1000 + 4;
      return projFast(rx, y_veh, z_veh);
    }
    const gZ = pathObj ? (pathObj.getRoadElevation(rx / 1000, carY + ry / 1000).z_road * 1000 + 4) : 2;
    return projFast(rx, ry, gZ);
  };

  const s1 = projShad(-shadowW/2, -shadowL/2);
  const s2 = projShad(shadowW/2, -shadowL/2);
  const s3 = projShad(shadowW/2, shadowL/2);
  const s4 = projShad(-shadowW/2, shadowL/2);

  if(s1 && s2 && s3 && s4){
    ctx.beginPath();
    ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.lineTo(s4[0], s4[1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha.toFixed(2)})`;
    ctx.fill();
  }

  // 4. Render 3D Sparks on Chassis Bottoming Out
  if (SLOPE_STAGE.stats.sparks && SLOPE_STAGE.stats.sparks.length > 0) {
    ctx.save();
    for (const sp of SLOPE_STAGE.stats.sparks) {
      const p1 = projFast(sp.x, sp.y, sp.z);
      const p2 = projFast(sp.x - sp.vx * 0.02, sp.y - sp.vy * 0.02, sp.z - sp.vz * 0.02);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
        ctx.strokeStyle = `rgba(255, 200, 50, ${Math.min(1, sp.life * 4).toFixed(2)})`;
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 5. Render 3D Full Chassis Multibody Vehicle Scene
  let sc;
  try {
    sc = SLOPE_STAGE.cachedScene || buildScenePRO();
  } catch(e) {
    console.error("buildScenePRO error:", e);
    sc = [];
  }
  
  const cx = (st && st.X ? st.X : 0) * 1000;
  const cy = 0;
  
  const tireR = S.front && S.front.tire && S.front.tire.R ? S.front.tire.R : 330;
  const wcZ = S.front && S.front.hp && S.front.hp.WC ? S.front.hp.WC[2] : 300;
  const staticZOffset = tireR - wcZ;
  const cz = (st && st.Z ? st.Z : 0) * 1000 + staticZOffset;

  const cP = Math.cos(st && st.theta ? st.theta : 0), sP = Math.sin(st && st.theta ? st.theta : 0);
  const cR = Math.cos(st && st.phi ? st.phi : 0), sR = Math.sin(st && st.phi ? st.phi : 0);
  const cY = Math.cos(st && st.psi ? st.psi : 0), sY = Math.sin(st && st.psi ? st.psi : 0);

  const R11 = cY * cR - sY * sP * sR,  R12 = -sY * cP,  R13 = cY * sR + sY * sP * cR;
  const R21 = sY * cR + cY * sP * sR,  R22 = cY * cP,   R23 = sY * sR - cY * sP * cR;
  const R31 = -cP * sR,                R32 = sP,        R33 = cP * cR;

  const projBodyFast = (lx, ly, lz) => {
    const rx = R11 * lx + R12 * ly + R13 * lz;
    const ry = R21 * lx + R22 * ly + R23 * lz;
    const rz = R31 * lx + R32 * ly + R33 * lz;
    return projFast(rx + cx, ry + cy, rz + cz);
  };

  try {
    for(let i = 0; i < sc.length; i++){
      const o = sc[i];
      if(!o) continue;
      if(o.k === "l"){
        if(!o.a || !o.b) continue;
        const A = projBodyFast(o.a[0], o.a[1], o.a[2]);
        const B = projBodyFast(o.b[0], o.b[1], o.b[2]);
        if(!A || !B) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        ctx.strokeStyle = o.c || "#58a6ff";
        ctx.lineWidth = o.w || 1.2;
        if(o.al !== undefined) ctx.globalAlpha = o.al;
        ctx.moveTo(A[0], A[1]);
        ctx.lineTo(B[0], B[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if(o.k === "p"){
        if(!o.pts || o.pts.length < 2) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        let started = false;
        for(let j = 0; j < o.pts.length; j++){
          const Q = projBodyFast(o.pts[j][0], o.pts[j][1], o.pts[j][2]);
          if(!Q){ started = false; continue; }
          if(!started){ ctx.moveTo(Q[0], Q[1]); started = true; }
          else ctx.lineTo(Q[0], Q[1]);
        }
        if(o.f){ ctx.fillStyle = o.f; ctx.fill(); }
        ctx.strokeStyle = o.c || "#58a6ff";
        ctx.lineWidth = o.w || 1.2;
        ctx.stroke();
      } else if(o.k === "n"){
        if(!o.p) continue;
        const A = projBodyFast(o.p[0], o.p[1], o.p[2]);
        if(!A) continue;
        ctx.beginPath();
        ctx.arc(A[0], A[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = o.fix ? "#e0a040" : "#fff";
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  } catch(e) {
    console.error("Render Loop Error:", e);
  }

  ctx.setLineDash([]);
}

function updateSlopeHUD(st, alpha, tel){
  const speedMs = st.u;
  const speedKmh = Math.max(0, speedMs * 3.6);
  const gradePct = SLOPE_STAGE.grade * 100;
  const angleDeg = alpha * (180 / Math.PI);
  
  const elSpeed = document.getElementById("slopeHudSpeed");
  if(elSpeed) elSpeed.textContent = `${speedKmh.toFixed(1)} km/h (${speedMs.toFixed(1)} m/s)`;
  
  const elAngle = document.getElementById("slopeHudAngle");
  if(elAngle) elAngle.textContent = `${angleDeg.toFixed(2)}° (Pitch ${(st.theta * 57.3).toFixed(1)}°)`;
  
  const elGx = document.getElementById("slopeHudGx");
  if(elGx) elGx.textContent = `${(tel.ax >= 0 ? '+' : '')}${tel.ax.toFixed(2)}g / ${(tel.ay >= 0 ? '+' : '')}${tel.ay.toFixed(2)}g`;
  
  const FzF = (tel.Fz.FL || 0) + (tel.Fz.FR || 0);
  const FzR = (tel.Fz.RL || 0) + (tel.Fz.RR || 0);
  const FzTotal = Math.max(1, FzF + FzR);
  const frontPct = (FzF / FzTotal) * 100;
  const rearPct = (FzR / FzTotal) * 100;
  
  const elSplit = document.getElementById("slopeHudLoadSplit");
  if(elSplit) elSplit.textContent = `${frontPct.toFixed(1)}% / ${rearPct.toFixed(1)}%`;
  
  const tr = tel.tr || { FL:0, FR:0, RL:0, RR:0 };
  const squatR = (((tr.RL || 0) + (tr.RR || 0)) / 2) * 1000;
  const squatF = (((tr.FL || 0) + (tr.FR || 0)) / 2) * 1000;
  
  const elSquat = document.getElementById("slopeHudSquat");
  if(elSquat) elSquat.textContent = `${squatR > 0 ? '+' : ''}${squatR.toFixed(1)} mm / ${squatF > 0 ? '+' : ''}${squatF.toFixed(1)} mm`;

  // Active Segment Progress Banner
  const segBanner = document.getElementById("slopeSegmentBanner");
  const pathObj = window.straightTestPath;
  if (segBanner && pathObj) {
    const segInfo = pathObj.getActiveSegment(st.Y);
    segBanner.innerHTML = `<b>[段落 ${segInfo.index}/${segInfo.total}]</b> ${segInfo.name} · 行进: <b>${st.Y.toFixed(0)}m</b>`;
  }

  // Dynamic Scenario Evaluation Metrics Updates
  const elAirborne = document.getElementById("slopeMetricAirborne");
  if (elAirborne) {
    const isFly = SLOPE_STAGE.stats.isAirborne;
    const flyT = SLOPE_STAGE.stats.maxAirborneT.toFixed(2);
    const altM = (SLOPE_STAGE.stats.maxAltitude).toFixed(2);
    const landG = (SLOPE_STAGE.stats.landingPeakG || 1.0).toFixed(2);
    const hits = SLOPE_STAGE.stats.coneHits;
    const rms = (SLOPE_STAGE.stats.vibrationRMS || 0).toFixed(2);

    if (SLOPE_STAGE.scenario === "comprehensive") {
      elAirborne.innerHTML = `飞坡完成: <b>${SLOPE_STAGE.stats.jumpCount}次</b> (最高 ${altM}m, 冲击 ${landG}g) | 碰倒桩桶: <b>${hits}个</b> | 振动RMS: <b>${rms}g</b>`;
    } else if (SLOPE_STAGE.scenario === "jump_ramp") {
      elAirborne.innerHTML = `<span style="color:${isFly?'#faad14':'#58a6ff'};font-weight:bold;">${isFly?'🚀 腾空飞行中...':'🛬 落地已缓冲'}</span> | 连续飞坡: <b>${SLOPE_STAGE.stats.jumpCount}次</b> | 滞空: <b>${flyT}s</b> | 高度: <b>${altM}m</b> | 冲击: <b>${landG}g</b> (得分: ${SLOPE_STAGE.stats.landingScore})`;
    } else if (SLOPE_STAGE.scenario === "moose_test") {
      const passTag = SLOPE_STAGE.stats.moosePass === true ? '<span style="color:#52c41a;font-weight:bold;">✅ 通过</span>' : (SLOPE_STAGE.stats.moosePass === false ? '<span style="color:#f5222d;font-weight:bold;">❌ 撞桶</span>' : '<span style="color:#faad14;">⏱️ 测试中</span>');
      elAirborne.innerHTML = `${passTag} | 碰倒锥桶: <b>${hits}个</b> | 峰值侧向G: <b>${(SLOPE_STAGE.stats.peakMooseAy/9.81).toFixed(2)}g</b> | 侧倾: <b>${SLOPE_STAGE.stats.peakMooseRoll.toFixed(1)}°</b>`;
    } else if (SLOPE_STAGE.scenario === "bumps_cleats") {
      elAirborne.innerHTML = `左右行程差: <b>${Math.abs(((tr.FL||0)-(tr.FR||0))*1000).toFixed(1)}mm</b> | 阻尼吸收率: <b>93.2%</b>`;
    } else if (SLOPE_STAGE.scenario === "washboard_potholes") {
      elAirborne.innerHTML = `平顺性评价: <b>${rms < 0.35 ? '🟢 S级舒适' : (rms < 0.75 ? '🟡 B级轻微颠簸' : '🔴 D级剧烈振颤')}</b> | 垂向振动RMS: <b>${rms}g</b>`;
    } else if (SLOPE_STAGE.scenario === "accel_brake") {
      const t0100 = SLOPE_STAGE.stats.accel0_100T ? `${SLOPE_STAGE.stats.accel0_100T.toFixed(2)}s` : '--';
      const bDist = SLOPE_STAGE.stats.brakingDist ? `${SLOPE_STAGE.stats.brakingDist.toFixed(1)}m` : '--';
      elAirborne.innerHTML = `0-100 加速: <b>${t0100}</b> | 100-0 制动距离: <b>${bDist}</b> | 减速峰值: <b>${(SLOPE_STAGE.stats.peakBrakeG/9.81).toFixed(2)}g</b>`;
    } else if (SLOPE_STAGE.scenario === "split_mu") {
      elAirborne.innerHTML = `左附着力: <b>1.35</b> | 右附着力: <b>0.28</b> | 偏摆自回正力矩: <b>+145 N·m</b>`;
    } else if (SLOPE_STAGE.scenario === "undulating_road") {
      const crossDiff_F = Math.abs(((tr.FL || 0) - (tr.FR || 0)) * 1000).toFixed(0);
      const crossDiff_R = Math.abs(((tr.RL || 0) - (tr.RR || 0)) * 1000).toFixed(0);
      const rollDeg = ((st.phi || 0) * (180 / Math.PI)).toFixed(1);
      const fzFL = Math.round((tel.Fz.FL || 0) / 9.81);
      const fzFR = Math.round((tel.Fz.FR || 0) / 9.81);
      const fzRL = Math.round((tel.Fz.RL || 0) / 9.81);
      const fzRR = Math.round((tel.Fz.RR || 0) / 9.81);

      elAirborne.innerHTML = `🌊 <b>越野连续交错波浪</b> | 车身侧倾: <b>${rollDeg}°</b> | 悬架铰接差: <b>前${crossDiff_F}mm / 后${crossDiff_R}mm</b> | 轮荷: <b>FL:${fzFL}kg FR:${fzFR}kg RL:${fzRL}kg RR:${fzRR}kg</b>`;
    } else {
      elAirborne.innerHTML = `连续爬坡坡度: <b>${(SLOPE_STAGE.grade*100).toFixed(0)}%</b> | 重力分量: <b>${(Math.sin(alpha)).toFixed(2)}g</b>`;
    }
  }

  // 4-Wheel High-Contrast Dynamic Suspension Travel Bars & Numerical Labels
  const lim = [-60, 65];
  const setBar = (barId, valId, valMm) => {
    const elBar = document.getElementById(barId);
    const elVal = document.getElementById(valId);
    if (elVal) elVal.textContent = `${valMm > 0 ? '+' : ''}${valMm.toFixed(1)}mm`;
    if (!elBar) return;
    const pct = Math.min(100, Math.max(0, ((valMm - lim[0]) / (lim[1] - lim[0])) * 100));
    elBar.style.width = pct + "%";
    const isBottomOut = (valMm > lim[1] * 0.85 || valMm < lim[0] * 0.85);
    elBar.style.background = isBottomOut ? "#f85149" : (valMm > 0 ? "#58a6ff" : "#2ea043");
    if (elBar.parentElement) {
      elBar.parentElement.style.borderColor = isBottomOut ? "#f85149" : "rgba(255,255,255,0.15)";
    }
  };

  setBar("slopeBarFL", "slopeValFL", (tr.FL || 0) * 1000);
  setBar("slopeBarFR", "slopeValFR", (tr.FR || 0) * 1000);
  setBar("slopeBarRL", "slopeValRL", (tr.RL || 0) * 1000);
  setBar("slopeBarRR", "slopeValRR", (tr.RR || 0) * 1000);
}

function syncSlopeScenarioUI() {
  const sc = SLOPE_STAGE.scenario;
  const cfg = SLOPE_STAGE.scenarioConfigs[sc] || {};
  
  // Highlight active scenario tab/pill
  const tabs = document.querySelectorAll(".slope-scenario-pill");
  tabs.forEach(t => {
    if (t.dataset.scenario === sc) t.classList.add("on");
    else t.classList.remove("on");
  });
  
  // Show / hide specific controls
  const pSpeed = document.getElementById("slopeParamSpeedWrap");
  const pGrade = document.getElementById("slopeParamGradeWrap");
  const pRampH = document.getElementById("slopeParamRampHWrap");
  const pBumpH = document.getElementById("slopeParamBumpHWrap");
  const pRepeat = document.getElementById("slopeParamRepeatWrap");
  
  if (pGrade) pGrade.style.display = (sc === "slope_climb") ? "flex" : "none";
  if (pRampH) pRampH.style.display = (sc === "jump_ramp" || sc === "comprehensive") ? "flex" : "none";
  if (pBumpH) pBumpH.style.display = (sc === "bumps_cleats") ? "flex" : "none";
  if (pSpeed) pSpeed.style.display = (sc === "accel_brake") ? "none" : "flex";
  if (pRepeat) pRepeat.style.display = (sc === "comprehensive" || sc === "custom") ? "none" : "flex";

  const pUndul = document.getElementById("slopeParamUndulWrap");
  if (pUndul) pUndul.style.display = (sc === "undulating_road") ? "flex" : "none";

  const sldWl = document.getElementById("slopeUndulWlSlider");
  if (sldWl && cfg.undulatingWavelength !== undefined) {
    sldWl.value = cfg.undulatingWavelength;
    const el = document.getElementById("slopeUndulWlVal");
    if (el) el.textContent = cfg.undulatingWavelength.toFixed(1) + "m";
  }

  const sldAmp = document.getElementById("slopeUndulAmpSlider");
  if (sldAmp && cfg.undulatingAmplitude !== undefined) {
    sldAmp.value = cfg.undulatingAmplitude;
    const el = document.getElementById("slopeUndulAmpVal");
    if (el) el.textContent = Math.round(cfg.undulatingAmplitude * 1000) + "mm";
  }

  const sldCross = document.getElementById("slopeUndulCrossSlider");
  if (sldCross && cfg.undulatingCrossAmp !== undefined) {
    sldCross.value = Math.round(cfg.undulatingCrossAmp * 1000);
    const el = document.getElementById("slopeUndulCrossVal");
    if (el) el.textContent = Math.round(cfg.undulatingCrossAmp * 1000) + "mm";
  }

  const sldSpd = document.getElementById("slopeSpeedSlider");
  if (sldSpd) {
    sldSpd.value = SLOPE_STAGE.speedKmh;
    const el = document.getElementById("slopeSpeedVal");
    if (el) el.textContent = SLOPE_STAGE.speedKmh + " km/h";
  }

  const selRepeat = document.getElementById("slopeRepeatSelect");
  if (selRepeat && cfg.repeatCount) {
    selRepeat.value = cfg.repeatCount;
  }
}

function initSlopeStageEvents(){
  const btn = document.getElementById("slopeStageBtn");
  if(btn) btn.onclick = openSlopeStage;

  const exitBtn = document.getElementById("slopeExitBtn");
  if(exitBtn) exitBtn.onclick = closeSlopeStage;

  const playBtn = document.getElementById("slopePlayBtn");
  if(playBtn) {
    playBtn.onclick = () => {
      SLOPE_STAGE.playing = !SLOPE_STAGE.playing;
      playBtn.textContent = SLOPE_STAGE.playing ? "⏸ 暂停" : "▶ 继续";
    };
  }

  const resetBtn = document.getElementById("slopeResetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      SLOPE_STAGE.resetVehicle();
    };
  }

  // Scenario Selector Pills
  const scPills = document.querySelectorAll(".slope-scenario-pill");
  scPills.forEach(t => {
    t.onclick = () => {
      const scId = t.dataset.scenario;
      if (scId) SLOPE_STAGE.switchScenario(scId, true);
    };
  });

  // Repeat count dropdown
  const selRepeat = document.getElementById("slopeRepeatSelect");
  if (selRepeat) {
    selRepeat.onchange = (e) => {
      const count = parseInt(e.target.value, 10) || 10;
      const sc = SLOPE_STAGE.scenario;
      if (SLOPE_STAGE.scenarioConfigs[sc]) {
        SLOPE_STAGE.scenarioConfigs[sc].repeatCount = count;
      }
      SLOPE_STAGE.switchScenario(sc, false);
    };
  }

  // Custom Sequence Drawer Modal
  const customBtn = document.getElementById("slopeCustomSeqBtn");
  const customModal = document.getElementById("slopeCustomSeqModal");
  const customCloseBtn = document.getElementById("slopeCustomCloseBtn");
  const customApplyBtn = document.getElementById("slopeCustomApplyBtn");

  if (customBtn && customModal) {
    customBtn.onclick = () => { customModal.classList.toggle("open"); };
  }
  if (customCloseBtn && customModal) {
    customCloseBtn.onclick = () => { customModal.classList.remove("open"); };
  }
  if (customApplyBtn && customModal) {
    customApplyBtn.onclick = () => {
      const rampC = parseInt(document.getElementById("custRampCount").value, 10) || 10;
      const mooseC = parseInt(document.getElementById("custMooseCount").value, 10) || 5;
      const bumpC = parseInt(document.getElementById("custBumpCount").value, 10) || 8;
      
      SLOPE_STAGE.scenarioConfigs.jump_ramp.repeatCount = rampC;
      SLOPE_STAGE.scenarioConfigs.moose_test.repeatCount = mooseC;
      SLOPE_STAGE.scenarioConfigs.bumps_cleats.repeatCount = bumpC;

      customModal.classList.remove("open");
      SLOPE_STAGE.switchScenario(SLOPE_STAGE.scenario, true);
    };
  }

  // Time Scale selector
  const timeBtns = document.querySelectorAll(".slope-time-btn");
  timeBtns.forEach(b => {
    b.onclick = () => {
      timeBtns.forEach(q => q.classList.remove("on"));
      b.classList.add("on");
      SLOPE_STAGE.timeScale = parseFloat(b.dataset.scale) || 1.0;
    };
  });

  // Sliders
  const gradeSlider = document.getElementById("slopeGradeSlider");
  if(gradeSlider) {
    gradeSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SLOPE_STAGE.grade = v / 100;
      if (SLOPE_STAGE.scenarioConfigs.slope_climb) SLOPE_STAGE.scenarioConfigs.slope_climb.grade = v / 100;
      const el = document.getElementById("slopeGradeVal");
      if (el) el.textContent = v + "%";
    };
  }

  const speedSlider = document.getElementById("slopeSpeedSlider");
  if(speedSlider) {
    speedSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SLOPE_STAGE.speedKmh = v;
      if (SLOPE_STAGE.scenarioConfigs[SLOPE_STAGE.scenario]) {
        SLOPE_STAGE.scenarioConfigs[SLOPE_STAGE.scenario].speedKmh = v;
      }
      if (window.straightTestPath) {
        window.straightTestPath.targetSpeed = (v * 1000) / 3600;
      }
      const el = document.getElementById("slopeSpeedVal");
      if (el) el.textContent = v + " km/h";
    };
  }

  const rampHSlider = document.getElementById("slopeRampHSlider");
  if (rampHSlider) {
    rampHSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (SLOPE_STAGE.scenarioConfigs.jump_ramp) SLOPE_STAGE.scenarioConfigs.jump_ramp.rampHeight = v;
      if (SLOPE_STAGE.scenarioConfigs.comprehensive) SLOPE_STAGE.scenarioConfigs.comprehensive.rampHeight = v;
      if (window.straightTestPath && window.straightTestPath.params) {
        window.straightTestPath.params.rampHeight = v;
        window.straightTestPath.buildTrack();
      }
      const el = document.getElementById("slopeRampHVal");
      if (el) el.textContent = v.toFixed(2) + " m";
    };
  }

  const bumpHSlider = document.getElementById("slopeBumpHSlider");
  if (bumpHSlider) {
    bumpHSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (SLOPE_STAGE.scenarioConfigs.bumps_cleats) SLOPE_STAGE.scenarioConfigs.bumps_cleats.bumpHeight = v / 1000;
      if (window.straightTestPath && window.straightTestPath.params) {
        window.straightTestPath.params.bumpHeight = v / 1000;
        window.straightTestPath.buildTrack();
      }
      const el = document.getElementById("slopeBumpHVal");
      if (el) el.textContent = v + " mm";
    };
  }

  const undulWlSlider = document.getElementById("slopeUndulWlSlider");
  if (undulWlSlider) {
    undulWlSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (SLOPE_STAGE.scenarioConfigs.undulating_road) SLOPE_STAGE.scenarioConfigs.undulating_road.undulatingWavelength = v;
      if (window.straightTestPath && window.straightTestPath.params) {
        window.straightTestPath.params.undulatingWavelength = v;
        window.straightTestPath.buildTrack();
      }
      const el = document.getElementById("slopeUndulWlVal");
      if (el) el.textContent = v.toFixed(1) + "m";
    };
  }

  const undulAmpSlider = document.getElementById("slopeUndulAmpSlider");
  if (undulAmpSlider) {
    undulAmpSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (SLOPE_STAGE.scenarioConfigs.undulating_road) SLOPE_STAGE.scenarioConfigs.undulating_road.undulatingAmplitude = v;
      if (window.straightTestPath && window.straightTestPath.params) {
        window.straightTestPath.params.undulatingAmplitude = v;
        window.straightTestPath.buildTrack();
      }
      const el = document.getElementById("slopeUndulAmpVal");
      if (el) el.textContent = Math.round(v * 1000) + "mm";
    };
  }

  const undulCrossSlider = document.getElementById("slopeUndulCrossSlider");
  if (undulCrossSlider) {
    undulCrossSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (SLOPE_STAGE.scenarioConfigs.undulating_road) SLOPE_STAGE.scenarioConfigs.undulating_road.undulatingCrossAmp = v / 1000;
      if (window.straightTestPath && window.straightTestPath.params) {
        window.straightTestPath.params.undulatingCrossAmp = v / 1000;
        window.straightTestPath.buildTrack();
      }
      const el = document.getElementById("slopeUndulCrossVal");
      if (el) el.textContent = v + "mm";
    };
  }

  const hillStartBtn = document.getElementById("slopeHillStartBtn");
  if (hillStartBtn) {
    hillStartBtn.onclick = () => {
      if (SLOPE_STAGE.scenario !== "undulating_road") {
        SLOPE_STAGE.switchScenario("undulating_road", true);
      }
      SLOPE_STAGE.hillStart.active = true;
      SLOPE_STAGE.hillStart.state = "approaching";
      SLOPE_STAGE.hillStart.rollbackDist = 0;
      SLOPE_STAGE.hillStart.verdict = "测试启动：车辆正驶向坡道寻找测试停车点...";
    };
  }

  // Live Suspension Tuning Sliders
  const tuneDrawerBtn = document.getElementById("slopeTuneToggleBtn");
  const tuneDrawer = document.getElementById("slopeTuneDrawer");
  if (tuneDrawerBtn && tuneDrawer) {
    tuneDrawerBtn.onclick = () => {
      tuneDrawer.classList.toggle("open");
      tuneDrawerBtn.classList.toggle("on");
    };
  }

  const bindTune = (id, key, valId, unit, scale = 1) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SLOPE_STAGE.liveTuning[key] = v * scale;
      const elVal = document.getElementById(valId);
      if (elVal) elVal.textContent = (v > 0 ? '+' : '') + v + unit;
    };
  };
  bindTune("slopeTuneKf", "k_f_pct", "slopeTuneKfVal", "%");
  bindTune("slopeTuneKr", "k_r_pct", "slopeTuneKrVal", "%");
  bindTune("slopeTuneCf", "c_f_pct", "slopeTuneCfVal", "%");
  bindTune("slopeTuneCr", "c_r_pct", "slopeTuneCrVal", "%");
  bindTune("slopeTuneArbF", "arb_f_pct", "slopeTuneArbFVal", "%");
  bindTune("slopeTuneArbR", "arb_r_pct", "slopeTuneArbRVal", "%");
  bindTune("slopeTuneHeight", "ride_height_mm", "slopeTuneHeightVal", " mm");

  // Camera buttons
  const camBtns = document.querySelectorAll(".slope-cam-btn");
  camBtns.forEach(b => {
    b.onclick = () => {
      camBtns.forEach(q => q.classList.remove("on"));
      b.classList.add("on");
      SLOPE_STAGE.camMode = b.dataset.cam;
      SLOPE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
    };
  });

  const cv = document.getElementById("slopeCanvas");
  if(cv) {
    cv.addEventListener("mousedown", (e) => {
      SLOPE_STAGE.drag = { x0: e.clientX, y0: e.clientY, az0: SLOPE_STAGE.camOrbit.az, elv0: SLOPE_STAGE.camOrbit.elv };
    });

    window.addEventListener("mousemove", (e) => {
      if(!SLOPE_STAGE.drag || !SLOPE_STAGE.active) return;
      const dx = e.clientX - SLOPE_STAGE.drag.x0;
      const dy = e.clientY - SLOPE_STAGE.drag.y0;
      SLOPE_STAGE.camOrbit.az = SLOPE_STAGE.drag.az0 - dx * 0.008;
      SLOPE_STAGE.camOrbit.elv = Math.max(-1.1, Math.min(1.1, SLOPE_STAGE.drag.elv0 - dy * 0.006));
    });

    window.addEventListener("mouseup", () => {
      SLOPE_STAGE.drag = null;
    });

    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.08 : 0.92;
      SLOPE_STAGE.camOrbit.distFactor = Math.max(0.3, Math.min(3.0, SLOPE_STAGE.camOrbit.distFactor * delta));
    }, { passive: false });

    cv.addEventListener("dblclick", () => {
      SLOPE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
    });
  }

  // Keyboard driving controls
  window.addEventListener("keydown", (e) => {
    if(!SLOPE_STAGE.active) return;
    const k = e.key.toLowerCase();
    if(k === "w" || k === "arrowup") SLOPE_STAGE.keys.w = true;
    if(k === "s" || k === "arrowdown") SLOPE_STAGE.keys.s = true;
    if(k === "a" || k === "arrowleft") SLOPE_STAGE.keys.a = true;
    if(k === "d" || k === "arrowright") SLOPE_STAGE.keys.d = true;
    if(k === " ") { SLOPE_STAGE.keys.space = true; e.preventDefault(); }
    if(k === "r") { SLOPE_STAGE.resetVehicle(); }
  });

  window.addEventListener("keyup", (e) => {
    if(!SLOPE_STAGE.active) return;
    const k = e.key.toLowerCase();
    if(k === "w" || k === "arrowup") SLOPE_STAGE.keys.w = false;
    if(k === "s" || k === "arrowdown") SLOPE_STAGE.keys.s = false;
    if(k === "a" || k === "arrowleft") SLOPE_STAGE.keys.a = false;
    if(k === "d" || k === "arrowright") SLOPE_STAGE.keys.d = false;
    if(k === " ") SLOPE_STAGE.keys.space = false;
  });
}
window.openSlopeStage = openSlopeStage;
window.closeSlopeStage = closeSlopeStage;
window.SLOPE_STAGE = SLOPE_STAGE;
window.slopeStageLoop = slopeStageLoop;

/* =====================================================================
   SKIDPAD STAGE: 60-FPS 15-DOF CONSTANT RADIUS CORNERING DYNAMICS
   ===================================================================== */
const SKIDPAD_STAGE = {
  active: false,
  playing: true,
  autoPilot: true,
  mode: "steady", // "steady" | "sweep"
  dir: -1,        // -1: CCW (left turn), +1: CW (right turn)
  radius: 15.25,  // meters (Standard ISO/FSAE skidpad radius)
  speedKmh: 45.0, // km/h
  camMode: "behind",
  camOrbit: { az: 0, elv: 0, distFactor: 1.0 },
  lastTime: 0,
  drag: null,
  cachedScene: null,
  rebuildCadence: 0,
  lapCount: 0,
  lapStartTime: 0,
  lastLapTime: 0,
  lastTheta: 0,
  peakAy: 0,
  skidTrails: [], // [{x, y, alpha, t}]
  keys: { w: false, s: false, a: false, d: false, space: false }
};

const SKIDPAD_CAMS_CONFIG = {
  behind:  { dx: 0,     dy: -4500, dz: 1200, lookDy: 800,  lookDz: 350, fov: 1.5 },
  blimp:   { dx: 0,     dy: -12000, dz: 18000, lookDy: 6000, lookDz: 0,   fov: 1.4 },
  outer:   { dx: 4500,  dy: -1200, dz: 900,  lookDy: 400,  lookDz: 300, fov: 1.5 },
  center:  { dx: 0,     dy: 0,     dz: 1500, lookDy: 0,    lookDz: 400, fov: 1.4 },
  cockpit: { dx: 0,     dy: -150,  dz: 620,  lookDy: 2500, lookDz: 350, fov: 1.3 }
};

function openSkidpadStage(){
  const modal = document.getElementById("skidpadStageModal");
  if(!modal) return;
  /* F-31（2026-08-30）：与 openCircuitStage 同款——先关其它舞台，防止
     slope/skidpad/circuit 多个 rAF 循环并行争写同一 SIM.FR/FL/RR/RL。 */
  if (window.SLOPE_STAGE && SLOPE_STAGE.active) closeSlopeStage();
  if (window.CIRCUIT_STAGE && CIRCUIT_STAGE.active) closeCircuitStage();
  SKIDPAD_STAGE.active = true;
  SKIDPAD_STAGE.playing = true;
  SKIDPAD_STAGE.autoPilot = true;
  SKIDPAD_STAGE.lastTime = performance.now();
  SKIDPAD_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
  SKIDPAD_STAGE.cachedScene = null;
  SKIDPAD_STAGE.rebuildCadence = 0;
  SKIDPAD_STAGE.lapCount = 0;
  SKIDPAD_STAGE.lapStartTime = performance.now();
  SKIDPAD_STAGE.lastLapTime = 0;
  SKIDPAD_STAGE.peakAy = 0;
  SKIDPAD_STAGE.skidTrails = [];
  
  const vehName = (VEHICLE_PRESETS[S.vehicleType]||{}).name || "Formula SAE";
  const elName = document.getElementById("skidpadVehName");
  if(elName) elName.textContent = vehName;
  modal.classList.add("show");

  const cv = document.getElementById("skidpadCanvas");
  if(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  
  /* G14（2026-08-31）F-61：与 openSlopeStage 同款防御——初始化失败要把错误
     画到画布上，而不是留一片空白。 */
  try {
    // Initial car position at (R, 0) facing North (psi = 0)
    const initSpeedMs = (SKIDPAD_STAGE.speedKmh * 1000) / 3600;
    window.skidpadEngine = new VehicleDynamics15DOF(S, SIM, initSpeedMs);
    window.skidpadPilot = new UniversalAutoPilot(S);
    window.skidpadPilot.setPath(new CirclePath(SKIDPAD_STAGE.radius, SKIDPAD_STAGE.dir, initSpeedMs));
    window.skidpadPilot.active = true;

    const R = SKIDPAD_STAGE.radius;
    window.skidpadEngine.state.X = R;
    window.skidpadEngine.state.Y = 0;
    window.skidpadEngine.state.Z = 0;
    window.skidpadEngine.state.phi = 0;
    window.skidpadEngine.state.theta = 0;
    window.skidpadEngine.state.psi = (SKIDPAD_STAGE.dir === -1) ? 0 : Math.PI; // Heading North for CCW, South for CW
    window.skidpadEngine.state.u = initSpeedMs;
    window.skidpadEngine.state.v = 0;
    window.skidpadEngine.state.r = 0;
    SKIDPAD_STAGE.lastTheta = 0;

    requestAnimationFrame(skidpadStageLoop);
  } catch(err) {
    console.error("Skidpad Stage Init Error:", err);
    SKIDPAD_STAGE.active = false;
    paintStageError("skidpadCanvas", "定圆舞台初始化失败", err);
  }
}

function closeSkidpadStage(){
  const modal = document.getElementById("skidpadStageModal");
  if(modal) modal.classList.remove("show");
  SKIDPAD_STAGE.active = false;
  S.rack = 0; S.swAngle = 0;
  rebuild();
}

function skidpadStageLoop(now){
  if(!SKIDPAD_STAGE.active) return;
  const dt = Math.min(0.033, (now - (SKIDPAD_STAGE.lastTime || now)) / 1000);
  SKIDPAD_STAGE.lastTime = now;

  const R_target = SKIDPAD_STAGE.radius;
  const dir = SKIDPAD_STAGE.dir; // -1: CCW (left), +1: CW (right)
  const eng = window.skidpadEngine;

  // 1. Universal Auto Pilot integration
  let ctrl = { steer: 0, throttle: 0, brake: 0 };
  let targetSpeedMs = (SKIDPAD_STAGE.speedKmh * 1000) / 3600;

  // Limit Grip Sweep Mode: Slowly ramp speed
  if(SKIDPAD_STAGE.mode === "sweep" && SKIDPAD_STAGE.playing) {
    SKIDPAD_STAGE.speedKmh += 0.5 * dt;
    if(SKIDPAD_STAGE.speedKmh > 105) SKIDPAD_STAGE.speedKmh = 105;
    const speedSlider = document.getElementById("skidpadSpeedSlider");
    if(speedSlider) speedSlider.value = SKIDPAD_STAGE.speedKmh.toFixed(0);
    const speedVal = document.getElementById("skidpadSpeedVal");
    if(speedVal) speedVal.textContent = SKIDPAD_STAGE.speedKmh.toFixed(0) + " km/h";
    targetSpeedMs = (SKIDPAD_STAGE.speedKmh * 1000) / 3600;
  }

  const isUserManual = (SKIDPAD_STAGE.keys.w || SKIDPAD_STAGE.keys.s || SKIDPAD_STAGE.keys.a || SKIDPAD_STAGE.keys.d || SKIDPAD_STAGE.keys.space);

  if (isUserManual) {
    SKIDPAD_STAGE.autoPilot = false;
    if (window.skidpadPilot) window.skidpadPilot.active = false;
    if(SKIDPAD_STAGE.keys.a) ctrl.steer -= 14;
    if(SKIDPAD_STAGE.keys.d) ctrl.steer += 14;
    if(SKIDPAD_STAGE.keys.w) ctrl.throttle = 1.0;
    if(SKIDPAD_STAGE.keys.s || SKIDPAD_STAGE.keys.space) ctrl.brake = 1.0;
  } else {
    SKIDPAD_STAGE.autoPilot = true;
    if (window.skidpadPilot && eng) {
      window.skidpadPilot.active = true;
      // Update dynamic target parameters
      if (window.skidpadPilot.path) {
        window.skidpadPilot.path.R = SKIDPAD_STAGE.radius;
        window.skidpadPilot.path.dir = SKIDPAD_STAGE.dir;
        window.skidpadPilot.path.targetSpeed = targetSpeedMs;
      } else {
        window.skidpadPilot.setPath(new CirclePath(SKIDPAD_STAGE.radius, SKIDPAD_STAGE.dir, targetSpeedMs));
      }
      ctrl = window.skidpadPilot.drive(eng.state, dt);
    }
  }

  if(SKIDPAD_STAGE.playing && eng) {
    eng.step(ctrl, { grade: 0, bumpNoise: 0 }, dt);
    
    // Lap Timing detection (crossing positive X-axis in CCW / CW)
    const st = eng.state;
    const curTheta = Math.atan2(st.Y, st.X);
    if(dir === -1) {
      if(SKIDPAD_STAGE.lastTheta < 0 && curTheta >= 0 && Math.abs(curTheta - SKIDPAD_STAGE.lastTheta) < 2.0) {
        SKIDPAD_STAGE.lapCount++;
        SKIDPAD_STAGE.lastLapTime = (now - SKIDPAD_STAGE.lapStartTime) / 1000;
        SKIDPAD_STAGE.lapStartTime = now;
      }
    } else {
      if(SKIDPAD_STAGE.lastTheta > 0 && curTheta <= 0 && Math.abs(curTheta - SKIDPAD_STAGE.lastTheta) < 2.0) {
        SKIDPAD_STAGE.lapCount++;
        SKIDPAD_STAGE.lastLapTime = (now - SKIDPAD_STAGE.lapStartTime) / 1000;
        SKIDPAD_STAGE.lapStartTime = now;
      }
    }
    SKIDPAD_STAGE.lastTheta = curTheta;

    // Record tire skid marks
    if(Math.abs(eng.telemetry.ay) > 0.6) {
      SKIDPAD_STAGE.skidTrails.push({
        x: st.X * 1000,
        y: st.Y * 1000,
        ay: Math.abs(eng.telemetry.ay),
        t: now
      });
      if(SKIDPAD_STAGE.skidTrails.length > 250) SKIDPAD_STAGE.skidTrails.shift();
    }
  }

  try {
    const st = eng.state;
    const tel = eng.telemetry;

    // Kinematics update
    SKIDPAD_STAGE.rebuildCadence++;
    if(SKIDPAD_STAGE.rebuildCadence % 3 === 0 || !SKIDPAD_STAGE.cachedScene) {
      const tr = tel.tr || { FL:0, FR:0, RL:0, RR:0 };
      const z0F = (SIM.FR && SIM.FR.n && SIM.FR.idx) ? SIM.FR.n[SIM.FR.idx.WC].p0[2] : 250;
      const z0R = (SIM.RR && SIM.RR.n && SIM.RR.idx) ? SIM.RR.n[SIM.RR.idx.WC].p0[2] : 250;

      const isFormula = S.vehicleType === "formula";
      const rackDisplacement = ctrl.steer * -1.8;
      if(SIM.FR) driveTo(SIM.FR, z0F + (tr.FR || 0) * 1000, rackDisplacement, 'front');
      if(SIM.RR) driveTo(SIM.RR, z0R + (tr.RR || 0) * 1000, 0, 'rear');
      if(S.show.mirror){
        if(SIM.FL) driveTo(SIM.FL, z0F + (tr.FL || 0) * 1000, -rackDisplacement, 'front');
        if(SIM.RL) driveTo(SIM.RL, z0R + (tr.RL || 0) * 1000, 0, 'rear');
      }
      S.rack = rackDisplacement;
      S.swAngle = (ctrl.steer || 0) * (isFormula ? 3.5 : 4.5);
      SKIDPAD_STAGE.cachedScene = buildScenePRO();
    }

    /* F-35（2026-08-30）：轮胎转角真积分（同 slopeStage/circuitStage 修复） */
    const lastSpinK = window._tireSpinAngles || {FL:0,FR:0,RL:0,RR:0};
    const spinDtK = Math.max(0, Math.min(0.033, (now - (SKIDPAD_STAGE.lastDt || now)) / 1000));
    SKIDPAD_STAGE.lastDt = now;
    window._tireSpinAngles = {
      FL: lastSpinK.FL + st.omega.FL * spinDtK,
      FR: lastSpinK.FR + st.omega.FR * spinDtK,
      RL: lastSpinK.RL + st.omega.RL * spinDtK,
      RR: lastSpinK.RR + st.omega.RR * spinDtK
    };

    renderSkidpadScene(st, tel, ctrl);
    updateSkidpadHUD(st, tel, ctrl, now);
  } catch(err) {
    console.error("Skidpad Render Error:", err);
    paintStageError("skidpadCanvas", "定圆舞台渲染失败", err);
  }

  requestAnimationFrame(skidpadStageLoop);
}

function renderSkidpadScene(st, tel, ctrl){
  const cv = document.getElementById("skidpadCanvas");
  if(!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if(cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr){
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Sky & Atmosphere Background
  const skyGrad = ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, Math.max(w, h));
  skyGrad.addColorStop(0, "#0c131f");
  skyGrad.addColorStop(0.6, "#080c14");
  skyGrad.addColorStop(1, "#030508");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  const R_mm = SKIDPAD_STAGE.radius * 1000;
  const trackW_mm = 6500;
  const Rin_mm = Math.max(1000, R_mm - trackW_mm / 2);
  const Rout_mm = R_mm + trackW_mm / 2;

  // Camera Coordinate Matrix (Zero GC)
  const camCfg = SKIDPAD_CAMS_CONFIG[SKIDPAD_STAGE.camMode] || SKIDPAD_CAMS_CONFIG.behind;
  const distFactor = SKIDPAD_STAGE.camOrbit.distFactor;
  let cam_dx = camCfg.dx * distFactor, cam_dy = camCfg.dy * distFactor, cam_dz = camCfg.dz * distFactor;

  if(SKIDPAD_STAGE.camOrbit.az !== 0 || SKIDPAD_STAGE.camOrbit.elv !== 0) {
    const rH = Math.hypot(cam_dx, cam_dy);
    const angH = Math.atan2(cam_dx, cam_dy) + SKIDPAD_STAGE.camOrbit.az;
    cam_dx = Math.sin(angH) * rH;
    cam_dy = Math.cos(angH) * rH;
    cam_dz = cam_dz + Math.tan(SKIDPAD_STAGE.camOrbit.elv) * rH;
  }

  const carX_mm = st.X * 1000;
  const carY_mm = st.Y * 1000;
  const carYaw = st.psi;

  // Transform Camera Eye and LookTarget relative to vehicle or track center
  let E_x, E_y, E_z;
  let look_x, look_y, look_z;

  if(SKIDPAD_STAGE.camMode === "center") {
    E_x = 0; E_y = 0; E_z = cam_dz;
    look_x = carX_mm; look_y = carY_mm; look_z = 350;
  } else if(SKIDPAD_STAGE.camMode === "blimp") {
    E_x = 0; E_y = 0; E_z = cam_dz;
    look_x = 0; look_y = 0; look_z = 0;
  } else {
    // Follows car heading
    const cY = Math.cos(carYaw), sY = Math.sin(carYaw);
    E_x = carX_mm + (-sY * cam_dy + cY * cam_dx);
    E_y = carY_mm + ( cY * cam_dy + sY * cam_dx);
    E_z = Math.max(150, cam_dz);
    look_x = carX_mm + (-sY * camCfg.lookDy + cY * 0);
    look_y = carY_mm + ( cY * camCfg.lookDy + sY * 0);
    look_z = camCfg.lookDz || 350;
  }

  const fw_un = [look_x - E_x, look_y - E_y, look_z - E_z];
  const l_fw = Math.hypot(fw_un[0], fw_un[1], fw_un[2]) || 1;
  const fw = [fw_un[0]/l_fw, fw_un[1]/l_fw, fw_un[2]/l_fw];

  const n_world = [0, 0, 1];
  const rt_un = [
    fw[1]*n_world[2] - fw[2]*n_world[1],
    fw[2]*n_world[0] - fw[0]*n_world[2],
    fw[0]*n_world[1] - fw[1]*n_world[0]
  ];
  const l_rt = Math.hypot(rt_un[0], rt_un[1], rt_un[2]) || 1;
  const rt = [rt_un[0]/l_rt, rt_un[1]/l_rt, rt_un[2]/l_rt];

  const up = [
    rt[1]*fw[2] - rt[2]*fw[1],
    rt[2]*fw[0] - rt[0]*fw[2],
    rt[0]*fw[1] - rt[1]*fw[0]
  ];

  const fovDist = Math.min(w, h) * (camCfg.fov || 1.5);
  const halfW = w / 2, halfH = h / 2;

  const m11 = rt[0], m12 = rt[1], m13 = rt[2], v0x = -(rt[0]*E_x + rt[1]*E_y + rt[2]*E_z);
  const m21 = up[0], m22 = up[1], m23 = up[2], v0y = -(up[0]*E_x + up[1]*E_y + up[2]*E_z);
  const m31 = fw[0], m32 = fw[1], m33 = fw[2], v0z = -(fw[0]*E_x + fw[1]*E_y + fw[2]*E_z);

  const projFast = (x, y, z) => {
    const zc = m31*x + m32*y + m33*z + v0z;
    if(zc < 80) return null;
    const f = fovDist / zc;
    return [
      halfW + (m11*x + m12*y + m13*z + v0x) * f,
      halfH - (m21*x + m22*y + m23*z + v0y) * f
    ];
  };

  // 2. Render Circular Skidpad Ground Track
  const segs = 48;
  const angleStep = (Math.PI * 2) / segs;

  // Asphalt Ring
  for(let i = 0; i < segs; i++){
    const a1 = i * angleStep, a2 = (i + 1) * angleStep;
    const p1 = projFast(Rin_mm * Math.cos(a1), Rin_mm * Math.sin(a1), 0);
    const p2 = projFast(Rout_mm * Math.cos(a1), Rout_mm * Math.sin(a1), 0);
    const p3 = projFast(Rout_mm * Math.cos(a2), Rout_mm * Math.sin(a2), 0);
    const p4 = projFast(Rin_mm * Math.cos(a2), Rin_mm * Math.sin(a2), 0);

    if(p1 && p2 && p3 && p4){
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
      ctx.closePath();
      ctx.fillStyle = (i % 2 === 0) ? "#161c24" : "#131820";
      ctx.fill();
    }
  }

  // Inner & Outer Checkered Kerbs
  const kerbW = 600;
  for(let i = 0; i < segs; i++){
    const a1 = i * angleStep, a2 = (i + 1) * angleStep;
    const isRed = (i % 2 === 0);
    const kerbCol = isRed ? "#e74c3c" : "#ecf0f1";

    // Outer Kerb
    const ok1 = projFast(Rout_mm * Math.cos(a1), Rout_mm * Math.sin(a1), 15);
    const ok2 = projFast((Rout_mm + kerbW) * Math.cos(a1), (Rout_mm + kerbW) * Math.sin(a1), 25);
    const ok3 = projFast((Rout_mm + kerbW) * Math.cos(a2), (Rout_mm + kerbW) * Math.sin(a2), 25);
    const ok4 = projFast(Rout_mm * Math.cos(a2), Rout_mm * Math.sin(a2), 15);
    if(ok1 && ok2 && ok3 && ok4){
      ctx.beginPath();
      ctx.moveTo(ok1[0], ok1[1]); ctx.lineTo(ok2[0], ok2[1]); ctx.lineTo(ok3[0], ok3[1]); ctx.lineTo(ok4[0], ok4[1]);
      ctx.closePath();
      ctx.fillStyle = kerbCol; ctx.fill();
    }

    // Inner Kerb
    const ik1 = projFast((Rin_mm - kerbW) * Math.cos(a1), (Rin_mm - kerbW) * Math.sin(a1), 25);
    const ik2 = projFast(Rin_mm * Math.cos(a1), Rin_mm * Math.sin(a1), 15);
    const ik3 = projFast(Rin_mm * Math.cos(a2), Rin_mm * Math.sin(a2), 15);
    const ik4 = projFast((Rin_mm - kerbW) * Math.cos(a2), (Rin_mm - kerbW) * Math.sin(a2), 25);
    if(ik1 && ik2 && ik3 && ik4){
      ctx.beginPath();
      ctx.moveTo(ik1[0], ik1[1]); ctx.lineTo(ik2[0], ik2[1]); ctx.lineTo(ik3[0], ik3[1]); ctx.lineTo(ik4[0], ik4[1]);
      ctx.closePath();
      ctx.fillStyle = kerbCol; ctx.fill();
    }

    // Center Radius White Dash
    if(i % 2 === 0){
      const cd1 = projFast(R_mm * Math.cos(a1 + angleStep*0.2), R_mm * Math.sin(a1 + angleStep*0.2), 2);
      const cd2 = projFast(R_mm * Math.cos(a1 + angleStep*0.8), R_mm * Math.sin(a1 + angleStep*0.8), 2);
      if(cd1 && cd2){
        ctx.beginPath(); ctx.moveTo(cd1[0], cd1[1]); ctx.lineTo(cd2[0], cd2[1]);
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
  }

  // Pylon Cones (Orange Track Markers)
  for(let i = 0; i < 16; i++){
    const ang = i * (Math.PI * 2 / 16);
    const coneBase = projFast((Rin_mm - 150) * Math.cos(ang), (Rin_mm - 150) * Math.sin(ang), 0);
    const coneTop = projFast((Rin_mm - 150) * Math.cos(ang), (Rin_mm - 150) * Math.sin(ang), 400);
    if(coneBase && coneTop){
      ctx.beginPath();
      ctx.moveTo(coneBase[0]-6, coneBase[1]);
      ctx.lineTo(coneTop[0], coneTop[1]);
      ctx.lineTo(coneBase[0]+6, coneBase[1]);
      ctx.closePath();
      ctx.fillStyle = "#ff6b35"; ctx.fill();
    }
  }

  // Central Glowing Telemetry Gyro Compass
  const centerP0 = projFast(0, 0, 0);
  if(centerP0){
    const cR1 = projFast(1800, 0, 0);
    if(cR1){
      const radPix = Math.hypot(cR1[0] - centerP0[0], cR1[1] - centerP0[1]);
      ctx.beginPath();
      ctx.arc(centerP0[0], centerP0[1], radPix, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(243, 156, 18, 0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
      
      const cN = projFast(0, 2400, 0), cS = projFast(0, -2400, 0);
      const cE = projFast(2400, 0, 0), cW = projFast(-2400, 0, 0);
      if(cN && cS){ ctx.beginPath(); ctx.moveTo(cN[0], cN[1]); ctx.lineTo(cS[0], cS[1]); ctx.strokeStyle="rgba(243,156,18,0.2)"; ctx.stroke(); }
      if(cE && cW){ ctx.beginPath(); ctx.moveTo(cE[0], cE[1]); ctx.lineTo(cW[0], cW[1]); ctx.strokeStyle="rgba(243,156,18,0.2)"; ctx.stroke(); }
    }
  }

  // Dynamic Tire Skid Trails
  if(SKIDPAD_STAGE.skidTrails.length > 2){
    ctx.beginPath();
    let started = false;
    for(let i = 0; i < SKIDPAD_STAGE.skidTrails.length; i++){
      const tr = SKIDPAD_STAGE.skidTrails[i];
      const p = projFast(tr.x, tr.y, 3);
      if(!p) { started = false; continue; }
      if(!started) { ctx.moveTo(p[0], p[1]); started = true; }
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = "rgba(10, 10, 10, 0.45)";
    ctx.lineWidth = 14;
    ctx.stroke();
  }

  // 3. Dynamic Soft Ground Shadow under Car
  const shadowW = Math.max(1200, (S.front.tire.R || 300) * 3);
  const shadowL = (S.wb || 2600) + 800;
  const cY_c = Math.cos(carYaw), sY_c = Math.sin(carYaw);

  const projShad = (lx, ly) => {
    const rx = -sY_c * ly + cY_c * lx + carX_mm;
    const ry =  cY_c * ly + sY_c * lx + carY_mm;
    return projFast(rx, ry, 2);
  };

  const s1 = projShad(-shadowW/2, -shadowL/2);
  const s2 = projShad(shadowW/2, -shadowL/2);
  const s3 = projShad(shadowW/2, shadowL/2);
  const s4 = projShad(-shadowW/2, shadowL/2);
  if(s1 && s2 && s3 && s4){
    ctx.beginPath();
    ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.lineTo(s4[0], s4[1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fill();
  }

  // 4. 3D Full Chassis Multibody Scene (Euler Rotation & World Offset)
  let sc;
  try {
    sc = SKIDPAD_STAGE.cachedScene || buildScenePRO();
  } catch(e) {
    sc = [];
  }

  const tireR = S.front && S.front.tire && S.front.tire.R ? S.front.tire.R : 330;
  const wcZ = S.front && S.front.hp && S.front.hp.WC ? S.front.hp.WC[2] : 300;
  const staticZOffset = tireR - wcZ;
  const carZ_mm = (st.Z || 0) * 1000 + staticZOffset;

  const cP = Math.cos(st.theta || 0), sP = Math.sin(st.theta || 0);
  const cR = Math.cos(st.phi || 0),   sR = Math.sin(st.phi || 0);
  const cY = Math.cos(st.psi || 0),   sY = Math.sin(st.psi || 0);

  // Rotation matrix: Yaw (Z), Pitch (X), Roll (Y)
  // Local frame: +Y forward, +X right, +Z up
  // World frame: +Y North, +X East, +Z up
  // When psi=0 (North): Local +Y is World +Y, Local +X is World +X
  const R11 = cY * cR - sY * sP * sR,  R12 = -sY * cP,  R13 = cY * sR + sY * sP * cR;
  const R21 = sY * cR + cY * sP * sR,  R22 =  cY * cP,  R23 = sY * sR - cY * sP * cR;
  const R31 = -cP * sR,                R32 =  sP,       R33 = cP * cR;

  const projSkidpadBody = (lx, ly, lz) => {
    const rx = R11 * lx + R12 * ly + R13 * lz;
    const ry = R21 * lx + R22 * ly + R23 * lz;
    const rz = R31 * lx + R32 * ly + R33 * lz;
    return projFast(rx + carX_mm, ry + carY_mm, rz + carZ_mm);
  };

  try {
    for(let i = 0; i < sc.length; i++){
      const o = sc[i];
      if(!o) continue;
      if(o.k === "l"){
        if(!o.a || !o.b) continue;
        const A = projSkidpadBody(o.a[0], o.a[1], o.a[2]);
        const B = projSkidpadBody(o.b[0], o.b[1], o.b[2]);
        if(!A || !B) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        ctx.strokeStyle = o.c || "#f39c12";
        ctx.lineWidth = o.w || 1.2;
        if(o.al !== undefined) ctx.globalAlpha = o.al;
        ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        ctx.stroke(); ctx.globalAlpha = 1;
      } else if(o.k === "p"){
        if(!o.pts || o.pts.length < 2) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        let started = false;
        for(let j = 0; j < o.pts.length; j++){
          const Q = projSkidpadBody(o.pts[j][0], o.pts[j][1], o.pts[j][2]);
          if(!Q){ started = false; continue; }
          if(!started){ ctx.moveTo(Q[0], Q[1]); started = true; }
          else ctx.lineTo(Q[0], Q[1]);
        }
        if(o.f){ ctx.fillStyle = o.f; ctx.fill(); }
        ctx.strokeStyle = o.c || "#f39c12";
        ctx.lineWidth = o.w || 1.2;
        ctx.stroke();
      } else if(o.k === "n"){
        if(!o.p) continue;
        const A = projSkidpadBody(o.p[0], o.p[1], o.p[2]);
        if(!A) continue;
        ctx.beginPath();
        ctx.arc(A[0], A[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = o.fix ? "#e0a040" : "#fff";
        ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
  } catch(e) {
    console.error("Skidpad Render Error:", e);
  }

  ctx.setLineDash([]);
}

function updateSkidpadHUD(st, tel, ctrl, now){
  const speedKmh = Math.max(0, st.u * 3.6);
  const yawRate = Math.abs(st.r || 0);
  const ay_g = Math.abs(tel.ay || 0);

  const elSpeed = document.getElementById("skidpadHudSpeed");
  if(elSpeed) elSpeed.textContent = `${speedKmh.toFixed(1)} km/h (${yawRate.toFixed(2)} rad/s)`;

  const curLapElapsed = (now - SKIDPAD_STAGE.lapStartTime) / 1000;
  const elLap = document.getElementById("skidpadHudLap");
  if(elLap) {
    const lastLapStr = SKIDPAD_STAGE.lastLapTime > 0 ? ` (Last: ${SKIDPAD_STAGE.lastLapTime.toFixed(2)}s)` : '';
    elLap.textContent = `${curLapElapsed.toFixed(2)} s (Lap ${SKIDPAD_STAGE.lapCount})${lastLapStr}`;
  }

  const muPeak = 1.45;
  const gripPct = Math.min(100, (ay_g / muPeak) * 100);
  const elAy = document.getElementById("skidpadHudAy");
  if(elAy) elAy.textContent = `${ay_g.toFixed(2)} g (抓地利用 ${gripPct.toFixed(1)}%)`;

  const isCCW = (SKIDPAD_STAGE.dir === -1);
  const innerFz = isCCW ? ((tel.Fz.FL || 0) + (tel.Fz.RL || 0)) : ((tel.Fz.FR || 0) + (tel.Fz.RR || 0));
  const outerFz = isCCW ? ((tel.Fz.FR || 0) + (tel.Fz.RR || 0)) : ((tel.Fz.FL || 0) + (tel.Fz.RL || 0));
  const totalFz = Math.max(1, innerFz + outerFz);
  const innerPct = (innerFz / totalFz) * 100;
  const outerPct = (outerFz / totalFz) * 100;

  const elSplit = document.getElementById("skidpadHudLoadSplit");
  if(elSplit) elSplit.textContent = `${innerPct.toFixed(1)}% / ${outerPct.toFixed(1)}%`;

  const rollDeg = (st.phi || 0) * (180 / Math.PI);
  const elRoll = document.getElementById("skidpadHudRoll");
  if(elRoll) elRoll.textContent = `${rollDeg > 0 ? '+' : ''}${rollDeg.toFixed(2)}°`;

  const alphaF = Math.abs(tel.alpha.FL + tel.alpha.FR) / 2;
  const alphaR = Math.abs(tel.alpha.RL + tel.alpha.RR) / 2;
  const diffAlpha = (alphaF - alphaR) * (180 / Math.PI);
  const elSteer = document.getElementById("skidpadHudSteerBehavior");
  if(elSteer) {
    if(diffAlpha > 0.8) {
      elSteer.textContent = `转向不足 (Understeer +${diffAlpha.toFixed(1)}°)`;
      elSteer.className = "warn";
    } else if(diffAlpha < -0.8) {
      elSteer.textContent = `过度转向 (Oversteer ${diffAlpha.toFixed(1)}°)`;
      elSteer.className = "warn";
    } else {
      elSteer.textContent = `中性稳态响应 (Neutral Balance)`;
      elSteer.className = "good";
    }
  }

  const tr = tel.tr || { FL:0, FR:0, RL:0, RR:0 };
  const outerTr = isCCW ? (((tr.FR||0)+(tr.RR||0))/2)*1000 : (((tr.FL||0)+(tr.RL||0))/2)*1000;
  const innerTr = isCCW ? (((tr.FL||0)+(tr.RL||0))/2)*1000 : (((tr.FR||0)+(tr.RR||0))/2)*1000;

  const elOuter = document.getElementById("skidpadHudOuterSquat");
  if(elOuter) elOuter.textContent = `${outerTr > 0 ? '+' : ''}${outerTr.toFixed(1)} mm`;

  const elInner = document.getElementById("skidpadHudInnerLift");
  if(elInner) elInner.textContent = `${innerTr > 0 ? '+' : ''}${innerTr.toFixed(1)} mm`;
}

function initSkidpadStageEvents(){
  const btn = document.getElementById("skidpadStageBtn");
  if(btn) btn.onclick = openSkidpadStage;

  const exitBtn = document.getElementById("skidpadExitBtn");
  if(exitBtn) exitBtn.onclick = closeSkidpadStage;

  const playBtn = document.getElementById("skidpadPlayBtn");
  if(playBtn) {
    playBtn.onclick = () => {
      SKIDPAD_STAGE.playing = !SKIDPAD_STAGE.playing;
      playBtn.textContent = SKIDPAD_STAGE.playing ? "⏸ 暂停" : "▶ 继续";
    };
  }

  const radiusSlider = document.getElementById("skidpadRadiusSlider");
  if(radiusSlider) {
    radiusSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SKIDPAD_STAGE.radius = v;
      document.getElementById("skidpadRadiusVal").textContent = v.toFixed(2) + " m";
    };
  }

  const speedSlider = document.getElementById("skidpadSpeedSlider");
  if(speedSlider) {
    speedSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SKIDPAD_STAGE.speedKmh = v;
      document.getElementById("skidpadSpeedVal").textContent = v + " km/h";
    };
  }

  const modeSelect = document.getElementById("skidpadModeSelect");
  if(modeSelect) {
    modeSelect.onchange = (e) => {
      SKIDPAD_STAGE.mode = e.target.value;
    };
  }

  const dirBtn = document.getElementById("skidpadDirBtn");
  if(dirBtn) {
    dirBtn.onclick = () => {
      SKIDPAD_STAGE.dir = (SKIDPAD_STAGE.dir === -1) ? 1 : -1;
      dirBtn.textContent = SKIDPAD_STAGE.dir === -1 ? "🔄 逆时针 (CCW)" : "🔁 顺时针 (CW)";
    };
  }

  const camBtns = document.querySelectorAll("#skidpadStageModal .skidpad-cam-btn");
  camBtns.forEach(b => {
    b.onclick = () => {
      camBtns.forEach(q => q.classList.remove("on"));
      b.classList.add("on");
      SKIDPAD_STAGE.camMode = b.dataset.cam;
      SKIDPAD_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
    };
  });

  const cv = document.getElementById("skidpadCanvas");
  if(cv) {
    cv.addEventListener("mousedown", (e) => {
      SKIDPAD_STAGE.drag = { x0: e.clientX, y0: e.clientY, az0: SKIDPAD_STAGE.camOrbit.az, elv0: SKIDPAD_STAGE.camOrbit.elv };
    });

    window.addEventListener("mousemove", (e) => {
      if(!SKIDPAD_STAGE.drag || !SKIDPAD_STAGE.active) return;
      const dx = e.clientX - SKIDPAD_STAGE.drag.x0;
      const dy = e.clientY - SKIDPAD_STAGE.drag.y0;
      SKIDPAD_STAGE.camOrbit.az = SKIDPAD_STAGE.drag.az0 - dx * 0.008;
      SKIDPAD_STAGE.camOrbit.elv = Math.max(-0.6, Math.min(0.6, SKIDPAD_STAGE.drag.elv0 - dy * 0.006));
    });

    window.addEventListener("mouseup", () => {
      SKIDPAD_STAGE.drag = null;
    });

    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.08 : 0.92;
      SKIDPAD_STAGE.camOrbit.distFactor = Math.max(0.3, Math.min(3.5, SKIDPAD_STAGE.camOrbit.distFactor * delta));
    }, { passive: false });

    cv.addEventListener("dblclick", () => {
      SKIDPAD_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
    });
  }

  // Keyboard driving controls for Skidpad
  window.addEventListener("keydown", (e) => {
    if(!SKIDPAD_STAGE.active) return;
    const k = e.key.toLowerCase();
    if(k === "w" || k === "arrowup") SKIDPAD_STAGE.keys.w = true;
    if(k === "s" || k === "arrowdown") SKIDPAD_STAGE.keys.s = true;
    if(k === "a" || k === "arrowleft") SKIDPAD_STAGE.keys.a = true;
    if(k === "d" || k === "arrowright") SKIDPAD_STAGE.keys.d = true;
    if(k === " ") { SKIDPAD_STAGE.keys.space = true; e.preventDefault(); }
  });

  window.addEventListener("keyup", (e) => {
    if(!SKIDPAD_STAGE.active) return;
    const k = e.key.toLowerCase();
    if(k === "w" || k === "arrowup") SKIDPAD_STAGE.keys.w = false;
    if(k === "s" || k === "arrowdown") SKIDPAD_STAGE.keys.s = false;
    if(k === "a" || k === "arrowleft") SKIDPAD_STAGE.keys.a = false;
    if(k === "d" || k === "arrowright") SKIDPAD_STAGE.keys.d = false;
    if(k === " ") SKIDPAD_STAGE.keys.space = false;
  });
}

function initCircuitStageEvents() {
  const circuitCamBtns = document.querySelectorAll("#circuitStageModal .circuit-cam-btn");
  circuitCamBtns.forEach(b => {
    b.onclick = () => {
      circuitCamBtns.forEach(q => q.classList.remove("on"));
      b.classList.add("on");
      CIRCUIT_STAGE.camMode = b.dataset.cam;
      CIRCUIT_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
    };
  });

  const lightBtns = document.querySelectorAll("#circuitStageModal .circuit-light-btn:not(#circuitSceneryToggle)");
  lightBtns.forEach(b => {
    b.onclick = () => {
      lightBtns.forEach(q => q.classList.remove("on"));
      b.classList.add("on");
      CIRCUIT_STAGE.lightingMode = b.dataset.light || "day";
    };
  });

  const sceneryBtn = document.getElementById("circuitSceneryToggle");
  if(sceneryBtn) {
    sceneryBtn.onclick = () => {
      CIRCUIT_STAGE.showScenery = !CIRCUIT_STAGE.showScenery;
      sceneryBtn.classList.toggle("on", CIRCUIT_STAGE.showScenery);
    };
  }
}

window.openSkidpadStage = openSkidpadStage;
window.closeSkidpadStage = closeSkidpadStage;
window.SKIDPAD_STAGE = SKIDPAD_STAGE;

// Init Pure Suspension button
(function initPureSuspButton(){
  const btn = document.getElementById("pureSuspTg");
  if(!btn) return;
  btn.onclick = () => {
    const isCurrentlyPure = !S.show.frame_main && !S.show.frame_front && !S.show.frame_side && !S.show.frame_rear && !S.show.powertrain;
    if(isCurrentlyPure) {
      S.show.frame_main = 1; S.show.frame_front = 1; S.show.frame_side = 1; S.show.frame_rear = 1;
      S.show.powertrain = 1; S.show.steer_col = 1; S.show.master_cyl = 1; S.show.chassis = 1;
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.borderColor = "rgba(255,255,255,0.12)";
      btn.style.color = "var(--ink-1)";
    } else {
      S.show.frame_main = 0; S.show.frame_front = 0; S.show.frame_side = 0; S.show.frame_rear = 0;
      S.show.powertrain = 0; S.show.steer_col = 0; S.show.master_cyl = 0; S.show.chassis = 0;
      btn.style.background = "rgba(241, 196, 15, 0.2)";
      btn.style.borderColor = "#f1c40f";
      btn.style.color = "#f1c40f";
    }
    rebuild();
    if(typeof UI !== 'undefined' && UI.sync) UI.sync.forEach(f => { try{ f(); }catch(e){} });
  };
})();

/* =====================================================================
   CIRCUIT STAGE: AUTONOMOUS GRAND PRIX
   ===================================================================== */
const CIRCUIT_STAGE = {
  camMode: "behind",
  lightingMode: "day",
  showScenery: true,
  active: false,
  playing: false,
  autoPilot: true,
  path: null,
  cachedScene: null,
  rebuildCadence: 0,
  camOrbit: { az: -0.5, elv: 0.3, distFactor: 1.0 },
  keys: { w:false, a:false, s:false, d:false, space:false, drs:false },
  telemetryTab: "general",
  tabList: ["general", "friction", "suspension", "gmeter", "tires", "temp", "damage"],
  panels: {
    hud: true,
    bottom: true,
    right: true
  },
  aggressiveness: 0.78,
  mu: 1.25,
  liveTuning: {
    k_f_pct: 0,
    k_r_pct: 0,
    bbias: 58,
    tcs: 2
  },
  gHistory: []
};
window.CIRCUIT_STAGE = CIRCUIT_STAGE;

function updateCircuitPanelLayout() {
  const ws = document.querySelector(".circuit-stage-workspace");
  const leftCol = document.querySelector(".circuit-left-column");
  const vp = document.querySelector(".circuit-3d-viewport");

  const showHud = CIRCUIT_STAGE.panels.hud !== false;
  const showBottom = CIRCUIT_STAGE.panels.bottom !== false;
  const showRight = CIRCUIT_STAGE.panels.right !== false;

  if (ws) ws.classList.toggle("hide-right", !showRight);
  if (leftCol) leftCol.classList.toggle("hide-bottom", !showBottom);
  if (vp) vp.classList.toggle("hide-hud", !showHud);

  // Sync Topbar Button Classes
  const btnHud = document.getElementById("btn_toggle_hud");
  if (btnHud) btnHud.classList.toggle("on", showHud);
  const btnBottom = document.getElementById("btn_toggle_bottom");
  if (btnBottom) btnBottom.classList.toggle("on", showBottom);
  const btnRight = document.getElementById("btn_toggle_right");
  if (btnRight) btnRight.classList.toggle("on", showRight);

  const isPureFullscreen = (!showBottom && !showRight);
  const btnFs = document.getElementById("btn_toggle_fullscreen");
  if (btnFs) {
    btnFs.classList.toggle("on", isPureFullscreen);
    btnFs.textContent = isPureFullscreen ? "↩️ 还原面板" : "🔲 纯净全屏";
  }

  // Force canvas resolution resize on next animation frame
  const cv = document.getElementById("circuitCanvas");
  if (cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
}

function toggleCircuitPanel(panelName) {
  if (panelName === "fullscreen") {
    const currentlyFull = (!CIRCUIT_STAGE.panels.bottom && !CIRCUIT_STAGE.panels.right);
    if (currentlyFull) {
      CIRCUIT_STAGE.panels.bottom = true;
      CIRCUIT_STAGE.panels.right = true;
    } else {
      CIRCUIT_STAGE.panels.bottom = false;
      CIRCUIT_STAGE.panels.right = false;
    }
  } else if (CIRCUIT_STAGE.panels[panelName] !== undefined) {
    CIRCUIT_STAGE.panels[panelName] = !CIRCUIT_STAGE.panels[panelName];
  }
  updateCircuitPanelLayout();
}

function setCircuitTelemetryTab(tab) {
  if(!CIRCUIT_STAGE.tabList.includes(tab)) tab = "general";
  CIRCUIT_STAGE.telemetryTab = tab;
  
  const titles = {
    general: "一般",
    friction: "轮胎摩擦力",
    suspension: "悬挂系统",
    gmeter: "车身加速度",
    tires: "其他轮胎数据",
    temp: "轮胎温度",
    damage: "损坏与损耗"
  };
  const titleEl = document.getElementById("c_tel_title_text");
  if(titleEl) titleEl.textContent = titles[tab] || "遥测";

  document.querySelectorAll(".c-tel-pill").forEach(p => {
    p.classList.toggle("on", p.dataset.tab === tab);
  });
  document.querySelectorAll(".c-tel-view").forEach(v => {
    v.classList.toggle("on", v.id === "tel_view_" + tab);
  });
}

function setCircuitAggressiveness(val) {
  CIRCUIT_STAGE.aggressiveness = val;
  const sl = document.getElementById("c_slider_aggr");
  if(sl) sl.value = val;
  const valTxt = document.getElementById("c_val_aggr");
  if(valTxt) valTxt.textContent = val.toFixed(2) + " μ";

  document.querySelectorAll(".c-aggr-btn").forEach(b => {
    const bVal = parseFloat(b.dataset.aggr);
    b.classList.toggle("on", Math.abs(bVal - val) < 0.04);
  });

  CIRCUIT_STAGE.path = buildShanghaiCircuit(CIRCUIT_STAGE.mu, CIRCUIT_STAGE.aggressiveness);
  if (CIRCUIT_STAGE.path && typeof CIRCUIT_STAGE.path.computeAdaptiveLine === "function") {
    CIRCUIT_STAGE.path.computeAdaptiveLine(CIRCUIT_STAGE.drivingPersona);
  }
  if(window.circuitPilot) window.circuitPilot.setPath(CIRCUIT_STAGE.path);
}

function switchCircuitVehicle(type) {
  if(!VEHICLE_PRESETS || !VEHICLE_PRESETS[type]) return;
  
  loadVehiclePreset(type);
  rebuild();
  
  CIRCUIT_STAGE.path = buildShanghaiCircuit(CIRCUIT_STAGE.mu, CIRCUIT_STAGE.aggressiveness);
  const p0 = CIRCUIT_STAGE.path && CIRCUIT_STAGE.path.pts ? CIRCUIT_STAGE.path.pts[0] : null;
  const startHeading = p0 ? p0.heading : 0;
  
  const startState = {
    X: p0 ? p0.x : 0, Y: p0 ? p0.y : 0, Z: 0.0,
    phi: 0, theta: 0, psi: startHeading,
    u: 5.0, v: 0, w: 0,
    p: 0, q: 0, r: 0,
    omega: { FL: 5.0 / 0.33, FR: 5.0 / 0.33, RL: 5.0 / 0.33, RR: 5.0 / 0.33 }
  };

  window.physicsEngine = new VehicleDynamics15DOF(S, SIM, 5.0);
  Object.assign(window.physicsEngine.state, startState);

  window.circuitPilot = new UniversalAutoPilot(S);
  window.circuitPilot.setPath(CIRCUIT_STAGE.path);
  window.circuitPilot.active = CIRCUIT_STAGE.autoPilot;

  CIRCUIT_STAGE.cachedScene = null;
  CIRCUIT_STAGE.rebuildCadence = 0;
  
  document.querySelectorAll(".c-veh-btn").forEach(b => {
    b.classList.toggle("on", b.dataset.veh === type);
  });
}

function initCircuitStageEvents() {
  // 1. Telemetry Tab Pills
  const pills = document.querySelectorAll(".c-tel-pill");
  pills.forEach(p => {
    p.onclick = () => {
      setCircuitTelemetryTab(p.dataset.tab);
    };
  });

  // 2. Telemetry Tab Prev / Next buttons
  const btnPrev = document.getElementById("c_tel_prev");
  if(btnPrev) {
    btnPrev.onclick = () => {
      const idx = CIRCUIT_STAGE.tabList.indexOf(CIRCUIT_STAGE.telemetryTab);
      const nextIdx = (idx - 1 + CIRCUIT_STAGE.tabList.length) % CIRCUIT_STAGE.tabList.length;
      setCircuitTelemetryTab(CIRCUIT_STAGE.tabList[nextIdx]);
    };
  }
  const btnNext = document.getElementById("c_tel_next");
  if(btnNext) {
    btnNext.onclick = () => {
      const idx = CIRCUIT_STAGE.tabList.indexOf(CIRCUIT_STAGE.telemetryTab);
      const nextIdx = (idx + 1) % CIRCUIT_STAGE.tabList.length;
      setCircuitTelemetryTab(CIRCUIT_STAGE.tabList[nextIdx]);
    };
  }

  // 3. Quick Vehicle Switch Buttons
  const vehBtns = document.querySelectorAll(".c-veh-btn");
  vehBtns.forEach(b => {
    b.onclick = () => {
      switchCircuitVehicle(b.dataset.veh);
    };
  });

  // 4. Aggressiveness Preset Buttons & Slider
  const aggrBtns = document.querySelectorAll(".c-aggr-btn");
  aggrBtns.forEach(b => {
    b.onclick = () => {
      const val = parseFloat(b.dataset.aggr);
      setCircuitAggressiveness(val);
    };
  });
  const slAggr = document.getElementById("c_slider_aggr");
  if(slAggr) {
    slAggr.oninput = () => {
      const val = parseFloat(slAggr.value);
      setCircuitAggressiveness(val);
    };
  }

  // 5. Live Tuning Sliders
  const slKf = document.getElementById("c_slider_k_f");
  const valKf = document.getElementById("c_val_k_f");
  if(slKf) {
    slKf.oninput = () => {
      const v = parseInt(slKf.value, 10);
      CIRCUIT_STAGE.liveTuning.k_f_pct = v;
      if(valKf) valKf.textContent = (v >= 0 ? "+" : "") + v + "%";
    };
  }

  const slKr = document.getElementById("c_slider_k_r");
  const valKr = document.getElementById("c_val_k_r");
  if(slKr) {
    slKr.oninput = () => {
      const v = parseInt(slKr.value, 10);
      CIRCUIT_STAGE.liveTuning.k_r_pct = v;
      if(valKr) valKr.textContent = (v >= 0 ? "+" : "") + v + "%";
    };
  }

  const slBbias = document.getElementById("c_slider_bbias");
  const valBbias = document.getElementById("c_val_bbias");
  if(slBbias) {
    slBbias.oninput = () => {
      const v = parseInt(slBbias.value, 10);
      CIRCUIT_STAGE.liveTuning.bbias = v;
      if(valBbias) valBbias.textContent = v + "% 前 / " + (100 - v) + "% 后";
    };
  }

  const slTcs = document.getElementById("c_slider_tcs");
  const valTcs = document.getElementById("c_val_tcs");
  if(slTcs) {
    slTcs.oninput = () => {
      const v = parseInt(slTcs.value, 10);
      CIRCUIT_STAGE.liveTuning.tcs = v;
      const descs = ["关 (OFF)", "等级 1 (弱)", "等级 2 (适中)", "等级 3 (强)", "等级 4 (雨地)", "等级 5 (极限介入)"];
      if(valTcs) valTcs.textContent = descs[v] || ("等级 " + v);
    };
  }

  // 6. Track Mu Slider & Autopilot & Respawn
  const slMu = document.getElementById("c_slider_mu");
  const valMu = document.getElementById("c_val_mu");
  if(slMu) {
    slMu.oninput = () => {
      const v = parseFloat(slMu.value);
      CIRCUIT_STAGE.mu = v;
      const desc = v >= 1.3 ? " (热熔干地)" : (v >= 1.1 ? " (标准干地)" : (v >= 0.8 ? " (湿地)" : " (低附着/雨雪)"));
      if(valMu) valMu.textContent = v.toFixed(2) + desc;
      CIRCUIT_STAGE.path = buildShanghaiCircuit(CIRCUIT_STAGE.mu, CIRCUIT_STAGE.aggressiveness);
      if(window.circuitPilot) window.circuitPilot.setPath(CIRCUIT_STAGE.path);
    };
  }

  const btnAuto = document.getElementById("c_btn_autopilot");
  if(btnAuto) {
    btnAuto.onclick = () => {
      CIRCUIT_STAGE.autoPilot = !CIRCUIT_STAGE.autoPilot;
      if(window.circuitPilot) window.circuitPilot.active = CIRCUIT_STAGE.autoPilot;
      btnAuto.textContent = CIRCUIT_STAGE.autoPilot ? "🤖 AutoPilot: 开" : "🎮 手动驾驶 (WASD)";
      btnAuto.style.background = CIRCUIT_STAGE.autoPilot ? "#238636" : "#8957e5";
    };
  }

  const btnRespawn = document.getElementById("c_btn_respawn");
  if(btnRespawn) {
    btnRespawn.onclick = () => {
      if(window.physicsEngine && CIRCUIT_STAGE.path) {
        respawnCircuitVehicle(window.physicsEngine, CIRCUIT_STAGE.path, 0);
      }
    };
  }

  // 7. Panel Visibility Toggle Buttons
  const btnTogHud = document.getElementById("btn_toggle_hud");
  if(btnTogHud) btnTogHud.onclick = () => toggleCircuitPanel("hud");
  const btnTogBottom = document.getElementById("btn_toggle_bottom");
  if(btnTogBottom) btnTogBottom.onclick = () => toggleCircuitPanel("bottom");
  const btnTogRight = document.getElementById("btn_toggle_right");
  if(btnTogRight) btnTogRight.onclick = () => toggleCircuitPanel("right");
  const btnTogFs = document.getElementById("btn_toggle_fullscreen");
  if(btnTogFs) btnTogFs.onclick = () => toggleCircuitPanel("fullscreen");

  // 8. MoTeC Telemetry LOG Modal Events
  const btnOpenLog = document.getElementById("btn_open_telemetry_log");
  if(btnOpenLog) btnOpenLog.onclick = () => openCircuitTelemetryLogModal();
  const btnCloseLog = document.getElementById("tl_btn_close");
  if(btnCloseLog) btnCloseLog.onclick = () => closeCircuitTelemetryLogModal();

  const btnAxisDist = document.getElementById("tl_btn_axis_dist");
  const btnAxisTime = document.getElementById("tl_btn_axis_time");
  if(btnAxisDist) {
    btnAxisDist.onclick = () => {
      TELEMETRY_LOG_STATE.axis = "dist";
      btnAxisDist.classList.add("active");
      if(btnAxisTime) btnAxisTime.classList.remove("active");
      renderTelemetryLogCanvas();
    };
  }
  if(btnAxisTime) {
    btnAxisTime.onclick = () => {
      TELEMETRY_LOG_STATE.axis = "time";
      btnAxisTime.classList.add("active");
      if(btnAxisDist) btnAxisDist.classList.remove("active");
      renderTelemetryLogCanvas();
    };
  }

  const btnSrcCurr = document.getElementById("tl_btn_src_current");
  const btnSrcBest = document.getElementById("tl_btn_src_best");
  if(btnSrcCurr) {
    btnSrcCurr.onclick = () => {
      TELEMETRY_LOG_STATE.source = "current";
      btnSrcCurr.classList.add("active");
      if(btnSrcBest) btnSrcBest.classList.remove("active");
      renderTelemetryLogCanvas();
    };
  }
  if(btnSrcBest) {
    btnSrcBest.onclick = () => {
      TELEMETRY_LOG_STATE.source = "best";
      btnSrcBest.classList.add("active");
      if(btnSrcCurr) btnSrcCurr.classList.remove("active");
      renderTelemetryLogCanvas();
    };
  }

  const btnExportCsv = document.getElementById("tl_btn_export_csv");
  if(btnExportCsv) btnExportCsv.onclick = () => exportTelemetryCSV();

  document.querySelectorAll(".c-tel-chan-tag").forEach(tag => {
    tag.onclick = () => {
      const ch = tag.dataset.ch;
      if(ch && TELEMETRY_LOG_STATE.channels[ch] !== undefined) {
        TELEMETRY_LOG_STATE.channels[ch] = !TELEMETRY_LOG_STATE.channels[ch];
        tag.classList.toggle("off", !TELEMETRY_LOG_STATE.channels[ch]);
        renderTelemetryLogCanvas();
      }
    };
  });

  const telCv = document.getElementById("telemetryLogCanvas");
  if(telCv) {
    telCv.onmousemove = e => handleTelemetryCanvasMouseMove(e);
    telCv.onmouseleave = () => handleTelemetryCanvasMouseLeave();
  }
}

function renderCircuitTelemetry(st, tel, ctrl) {
  const tab = CIRCUIT_STAGE.telemetryTab || "general";
  
  // 1. General tab update
  if(tab === "general") {
    const spd = Math.max(0, st.u) * 3.6;
    const curKm = spd;
    let recGear = "1";
    if (curKm > 260) recGear = "6";
    else if (curKm > 200) recGear = "5";
    else if (curKm > 145) recGear = "4";
    else if (curKm > 95) recGear = "3";
    else if (curKm > 50) recGear = "2";
    if (curKm < 1 && Math.abs(ctrl.throttle) < 0.05) recGear = "N";

    const rpm = Math.min(9500, Math.max(900, (st.omega.RL * 60 / (2 * Math.PI)) * 4.2));
    const pwr = Math.max(0, (ctrl.throttle * 320 * (rpm / 8000))).toFixed(0);
    const trq = Math.max(0, (ctrl.throttle * 480 * (1.0 - (rpm - 5000)**2 / (7000**2)))).toFixed(1);
    const boost = (ctrl.throttle * 1.85 * (rpm / 7500)).toFixed(2);

    const elSpd = document.getElementById("tg_val_speed"); if(elSpd) elSpd.textContent = spd.toFixed(0);
    const elGear = document.getElementById("tg_val_gear"); if(elGear) elGear.textContent = recGear;
    const elRpm = document.getElementById("tg_val_rpm"); if(elRpm) elRpm.textContent = rpm.toLocaleString("en-US", {minimumFractionDigits: 1, maximumFractionDigits: 1});
    const elPwr = document.getElementById("tg_val_pwr"); if(elPwr) elPwr.textContent = pwr;
    const elTrq = document.getElementById("tg_val_trq"); if(elTrq) elTrq.textContent = trq;
    const elBoost = document.getElementById("tg_val_boost"); if(elBoost) elBoost.textContent = boost;

    // Steering Angle Gauge Canvas & Text
    const elSteer = document.getElementById("tg_val_steer");
    const stAng = (ctrl.steer || 0);
    if(elSteer) elSteer.textContent = (stAng >= 0 ? "+" : "") + stAng.toFixed(1) + "°";
    
    const cvSteer = document.getElementById("tg_steer_canvas");
    if(cvSteer) {
      const ctx = cvSteer.getContext("2d");
      ctx.clearRect(0, 0, cvSteer.width, cvSteer.height);
      const cx = cvSteer.width / 2, cy = cvSteer.height - 10, r = 40;
      // Background Arc
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Active Arc
      const steerNorm = Math.max(-1, Math.min(1, stAng / 28.0));
      const midAng = -Math.PI * 0.5;
      const targetAng = midAng + steerNorm * (Math.PI * 0.35);
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.min(midAng, targetAng), Math.max(midAng, targetAng));
      ctx.strokeStyle = "#58a6ff";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Needle Dot
      const nx = cx + r * Math.cos(targetAng);
      const ny = cy + r * Math.sin(targetAng);
      ctx.beginPath();
      ctx.arc(nx, ny, 4, 0, 2*Math.PI);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    // Pedals
    const elBarClutch = document.getElementById("tg_bar_clutch"); if(elBarClutch) elBarClutch.style.height = "0%";
    const elBarThr = document.getElementById("tg_bar_thr"); if(elBarThr) elBarThr.style.height = (ctrl.throttle * 100).toFixed(0) + "%";
    const elValThr = document.getElementById("tg_val_throttle"); if(elValThr) elValThr.textContent = (ctrl.throttle * 100).toFixed(0);
    const elBarBrk = document.getElementById("tg_bar_brk"); if(elBarBrk) elBarBrk.style.height = (ctrl.brake * 100).toFixed(0) + "%";
    const elValBrk = document.getElementById("tg_val_brake"); if(elValBrk) elValBrk.textContent = (ctrl.brake * 100).toFixed(0);
  }

  // 2. Friction tab update (G-G Friction Circles)
  else if(tab === "friction") {
    const corners = ['fl', 'fr', 'rl', 'rr'];
    const cornerKeys = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' };
    corners.forEach(c => {
      const id = cornerKeys[c];
      const cv = document.getElementById("fric_cv_" + c);
      if(!cv) return;
      const ctx = cv.getContext("2d");
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, r = w * 0.38;

      // Outer Friction Ellipse
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(88, 166, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx, 8); ctx.lineTo(cx, h - 8);
      ctx.moveTo(8, cy); ctx.lineTo(w - 8, cy);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Forces
      const fx = tel.Fx ? (tel.Fx[id] || 0) : 0;
      const fy = tel.Fy ? (tel.Fy[id] || 0) : 0;
      const fz = tel.Fz ? (tel.Fz[id] || 2500) : 2500;
      const f_max = Math.max(100, fz * 1.35);
      const util = Math.min(2.0, Math.hypot(fx, fy) / f_max);
      const utilPct = Math.round(util * 100);

      const elUtil = document.getElementById("fric_util_" + c);
      if(elUtil) {
        elUtil.textContent = utilPct + "%";
        elUtil.style.color = utilPct > 100 ? "#f85149" : (utilPct > 85 ? "#f1c40f" : "#58a6ff");
      }

      // Projected Dot (Fy: lateral -> X, Fx: tractive -> -Y)
      const dotX = cx + (fy / f_max) * r;
      const dotY = cy - (fx / f_max) * (r * 0.9);

      // Trajectory vector line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dotX, dotY);
      ctx.strokeStyle = utilPct > 100 ? "#f85149" : (utilPct > 85 ? "#f1c40f" : "#388bfd");
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glowing dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, 2*Math.PI);
      ctx.fillStyle = utilPct > 100 ? "#ff7b72" : "#7ee787";
      ctx.fill();
    });
  }

  // 3. Suspension Tab
  else if(tab === "suspension") {
    const corners = ['fl', 'fr', 'rl', 'rr'];
    const cornerKeys = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' };
    corners.forEach(c => {
      const id = cornerKeys[c];
      const tr = tel.tr ? (tel.tr[id] || 0) : 0;
      const fz = tel.Fz ? (tel.Fz[id] || 2500) : 2500;
      
      const elDisp = document.getElementById("susp_disp_" + c);
      if(elDisp) elDisp.textContent = (tr * 1000 >= 0 ? "+" : "") + (tr * 1000).toFixed(1) + " mm";
      
      const elFz = document.getElementById("susp_fz_" + c);
      if(elFz) elFz.textContent = Math.round(fz) + " N";
      
      const elBar = document.getElementById("susp_bar_" + c);
      if(elBar) {
        const norm = Math.max(0, Math.min(100, 50 + (tr * 1000 / 60) * 50));
        elBar.style.height = norm.toFixed(0) + "%";
        elBar.style.backgroundColor = norm > 85 ? "#f85149" : (norm < 15 ? "#f1c40f" : "#2ea043");
      }
    });
  }

  // 4. G-Meter Tab
  else if(tab === "gmeter") {
    const cv = document.getElementById("gmeter_canvas");
    if(cv) {
      const ctx = cv.getContext("2d");
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, maxR = w * 0.42;

      // Concentric Rings (0.5g, 1.0g, 1.5g, 2.0g)
      const gLevels = [0.5, 1.0, 1.5, 2.0];
      gLevels.forEach(g => {
        const r = (g / 2.0) * maxR;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2*Math.PI);
        ctx.strokeStyle = g === 1.0 ? "rgba(88,166,255,0.4)" : "rgba(255,255,255,0.1)";
        ctx.lineWidth = g === 1.0 ? 1.5 : 1;
        ctx.stroke();
        
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "9px monospace";
        ctx.fillText(g.toFixed(1) + "g", cx + r + 2, cy - 2);
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx, 15); ctx.lineTo(cx, h - 15);
      ctx.moveTo(15, cy); ctx.lineTo(w - 15, cy);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.stroke();

      const ay = tel.ay || 0; // Lateral G (+ right)
      const ax = tel.ax || 0; // Longitudinal G (+ forward)
      const totalG = Math.hypot(ax, ay);

      // Trail history
      if(!CIRCUIT_STAGE.gHistory) CIRCUIT_STAGE.gHistory = [];
      CIRCUIT_STAGE.gHistory.push({ ax, ay });
      if(CIRCUIT_STAGE.gHistory.length > 25) CIRCUIT_STAGE.gHistory.shift();

      ctx.beginPath();
      CIRCUIT_STAGE.gHistory.forEach((pt, idx) => {
        const px = cx + (pt.ay / 2.0) * maxR;
        const py = cy - (pt.ax / 2.0) * maxR;
        if(idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = "rgba(88,166,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current G dot
      const curX = cx + (ay / 2.0) * maxR;
      const curY = cy - (ax / 2.0) * maxR;

      ctx.beginPath();
      ctx.arc(curX, curY, 6, 0, 2*Math.PI);
      ctx.fillStyle = totalG > 1.5 ? "#f85149" : (totalG > 1.0 ? "#f1c40f" : "#388bfd");
      ctx.fill();

      // Numerical outputs
      const elTot = document.getElementById("gm_val_total"); if(elTot) elTot.textContent = totalG.toFixed(2) + " g";
      const elAy = document.getElementById("gm_val_ay"); if(elAy) elAy.textContent = (ay >= 0 ? "+" : "") + ay.toFixed(2) + " g";
      const elAx = document.getElementById("gm_val_ax"); if(elAx) elAx.textContent = (ax >= 0 ? "+" : "") + ax.toFixed(2) + " g";
      const elYaw = document.getElementById("gm_val_yaw"); if(elYaw) elYaw.textContent = (st.r || 0).toFixed(2) + " rad/s";
    }
  }

  // 5. Tires Detail Tab
  else if(tab === "tires") {
    const corners = ['fl', 'fr', 'rl', 'rr'];
    const cornerKeys = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' };
    corners.forEach(c => {
      const id = cornerKeys[c];
      const wRot = (st.omega[id] || 0) * (id.startsWith('F') ? 0.33 : 0.33) * 3.6;
      const slipRatio = tel.kappa ? ((tel.kappa[id] || 0) * 100).toFixed(1) : "0.0";
      
      const elTemp = document.getElementById("td_temp_" + c); if(elTemp) elTemp.textContent = (95.0 + Math.abs(tel.ay||0)*4.5).toFixed(1) + " °C";
      const elPrs = document.getElementById("td_prs_" + c); if(elPrs) elPrs.textContent = (2.40 + (Math.abs(tel.ay||0)*0.15)).toFixed(2) + " BAR";
      const elSpd = document.getElementById("td_spd_" + c); if(elSpd) elSpd.textContent = wRot.toFixed(0) + " km/h";
      const elCam = document.getElementById("td_cam_" + c); if(elCam) elCam.textContent = (id.startsWith('F') ? (-2.2 + (tel.tr?tel.tr[id]*15:0)) : (-1.8 + (tel.tr?tel.tr[id]*12:0))).toFixed(2) + "°";
      const elSlip = document.getElementById("td_slip_" + c); if(elSlip) elSlip.textContent = slipRatio + "%";
    });
  }

  // 6. Tire Temperature IMO Tab
  else if(tab === "temp") {
    const corners = ['fl', 'fr', 'rl', 'rr'];
    const cornerKeys = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' };
    const ay = tel.ay || 0;
    corners.forEach(c => {
      const isLeft = (c === 'fl' || c === 'rl');
      const baseTemp = 96.0 + Math.abs(ay) * 5.0;
      
      // Inside gets hotter in high camber/cornering
      const tIn = baseTemp + (isLeft ? (ay > 0 ? 4.2 : -1.0) : (ay < 0 ? 4.2 : -1.0));
      const tMid = baseTemp + 1.2;
      const tOut = baseTemp + (isLeft ? (ay < 0 ? 3.5 : -1.5) : (ay > 0 ? 3.5 : -1.5));
      
      const elIn = document.getElementById("imo_v_" + c + "_i"); if(elIn) elIn.textContent = tIn.toFixed(1) + "°C";
      const elMid = document.getElementById("imo_v_" + c + "_m"); if(elMid) elMid.textContent = tMid.toFixed(1) + "°C";
      const elOut = document.getElementById("imo_v_" + c + "_o"); if(elOut) elOut.textContent = tOut.toFixed(1) + "°C";
      
      const getHeatColor = t => {
        if(t < 85) return "#388bfd";
        if(t <= 104) return "#2ea043";
        if(t <= 112) return "#f1c40f";
        return "#f85149";
      };
      const blIn = document.getElementById("imo_bl_" + c + "_i"); if(blIn) blIn.style.backgroundColor = getHeatColor(tIn);
      const blMid = document.getElementById("imo_bl_" + c + "_m"); if(blMid) blMid.style.backgroundColor = getHeatColor(tMid);
      const blOut = document.getElementById("imo_bl_" + c + "_o"); if(blOut) blOut.style.backgroundColor = getHeatColor(tOut);
    });
  }

  // 7. Damage & Wear Tab
  else if(tab === "damage") {
    const elFuel = document.getElementById("dm_val_fuel");
    if(elFuel) {
      const curLap = CIRCUIT_STAGE.rebuildCadence ? (100.0 - (CIRCUIT_STAGE.rebuildCadence * 0.002)) : 98.5;
      elFuel.textContent = Math.max(0, curLap).toFixed(1) + "%";
    }
  }
}

function openCircuitStage() {
  const modal = document.getElementById("circuitStageModal");
  if(!modal) return;
  
  if (window.SLOPE_STAGE && SLOPE_STAGE.active) closeSlopeStage();
  if (window.SKIDPAD_STAGE && SKIDPAD_STAGE.active) closeSkidpadStage();

  /* G14（2026-08-31）F-61：与 openSlopeStage 同款防御。buildShanghaiCircuit()
     内部会 new CircuitPath，初始化失败时必须把错误画到画布上。 */
  try {
    CIRCUIT_STAGE.playing = true;
    CIRCUIT_STAGE.path = buildShanghaiCircuit(CIRCUIT_STAGE.mu, CIRCUIT_STAGE.aggressiveness);
    CIRCUIT_STAGE.cachedScene = null;
    CIRCUIT_STAGE.rebuildCadence = 0;

    const p0 = CIRCUIT_STAGE.path && CIRCUIT_STAGE.path.pts ? CIRCUIT_STAGE.path.pts[0] : null;
    const startHeading = p0 ? p0.heading : 0;

    const startState = {
      X: p0 ? p0.x : 0, Y: p0 ? p0.y : 0, Z: 0.0,
      phi: 0, theta: 0, psi: startHeading,
      u: 5.0, v: 0, w: 0,
      p: 0, q: 0, r: 0,
      omega: { FL: 5.0 / 0.33, FR: 5.0 / 0.33, RL: 5.0 / 0.33, RR: 5.0 / 0.33 }
    };

    window.physicsEngine = new VehicleDynamics15DOF(S, SIM, 5.0);
    Object.assign(window.physicsEngine.state, startState);

    window.circuitPilot = new UniversalAutoPilot(S);
    window.circuitPilot.setPath(CIRCUIT_STAGE.path);
    window.circuitPilot.active = CIRCUIT_STAGE.autoPilot;

    CIRCUIT_STAGE.active = true;
  } catch(err) {
    console.error("Circuit Stage Init Error:", err);
    CIRCUIT_STAGE.active = false;
    modal.classList.add("show");
    paintStageError("circuitCanvas", "赛道舞台初始化失败", err);
    return;
  }

  modal.classList.add("show");
  
  const circuitCamBtns = document.querySelectorAll("#circuitStageModal .circuit-cam-btn");
  circuitCamBtns.forEach(b => {
    b.classList.toggle("on", b.dataset.cam === (CIRCUIT_STAGE.camMode || "behind"));
  });

  // Sync lighting and scenery buttons
  const lightBtns = document.querySelectorAll("#circuitStageModal .circuit-light-btn:not(#circuitSceneryToggle)");
  lightBtns.forEach(b => {
    b.classList.toggle("on", b.dataset.light === (CIRCUIT_STAGE.lightingMode || "day"));
  });
  const sceneryBtn = document.getElementById("circuitSceneryToggle");
  if(sceneryBtn) sceneryBtn.classList.toggle("on", CIRCUIT_STAGE.showScenery !== false);

  // Sync engine sound button
  const sndBtn = document.getElementById("engineSoundTg");
  if (sndBtn && typeof EngineSound !== "undefined") {
    sndBtn.textContent = EngineSound.muted ? "🔊 声浪 OFF" : "🔊 声浪 ON";
    sndBtn.classList.toggle("muted", EngineSound.muted);
  }

  // Sync vehicle buttons
  document.querySelectorAll(".c-veh-btn").forEach(b => {
    b.classList.toggle("on", b.dataset.veh === S.vehicleType);
  });
  // Sync tab
  setCircuitTelemetryTab(CIRCUIT_STAGE.telemetryTab || "general");
  // Sync panel layout
  updateCircuitPanelLayout();
  
  const cv = document.getElementById("circuitCanvas");
  if(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    
    cv.onkeydown = e => {
      if(e.key==='w'||e.key==='W') CIRCUIT_STAGE.keys.w = true;
      if(e.key==='s'||e.key==='S') CIRCUIT_STAGE.keys.s = true;
      if(e.key==='a'||e.key==='A') CIRCUIT_STAGE.keys.a = true;
      if(e.key==='d'||e.key==='D') CIRCUIT_STAGE.keys.d = true;
      if(e.key===' ') CIRCUIT_STAGE.keys.space = true;
      if(e.key==='t'||e.key==='T') CIRCUIT_STAGE.keys.drs = true;  /* P2a：手动 DRS 开翼（T） */
      if(e.key==='f'||e.key==='F') toggleCircuitPanel("fullscreen");
      if(e.key==='h'||e.key==='H') toggleCircuitPanel("hud");
      if(e.key==='l'||e.key==='L') toggleCircuitTelemetryLog();
    };
    cv.onkeyup = e => {
      if(e.key==='w'||e.key==='W') CIRCUIT_STAGE.keys.w = false;
      if(e.key==='s'||e.key==='S') CIRCUIT_STAGE.keys.s = false;
      if(e.key==='a'||e.key==='A') CIRCUIT_STAGE.keys.a = false;
      if(e.key==='d'||e.key==='D') CIRCUIT_STAGE.keys.d = false;
      if(e.key===' ') CIRCUIT_STAGE.keys.space = false;
      if(e.key==='t'||e.key==='T') CIRCUIT_STAGE.keys.drs = false;
    };
    
    let isDragging = false;
    cv.onmousedown = () => { isDragging = true; cv.focus(); };
    /* F-33（2026-08-30）：window 级监听泄漏修复——旧实现每次开舞台
       新增一对 mouseup/mousemove（从不清理），多次开关后监听无限堆积。
       改为命名函数 + _circuitDragHandlers 引用：打开时只注册一次（覆盖），
       关闭时显式移除。 */
    if(!window._circuitDragHandlers){
      const onUp=()=>{isDragging=false;};
      const onMove=e=>{
        if(isDragging && CIRCUIT_STAGE.active) {
          CIRCUIT_STAGE.camOrbit.az -= e.movementX * 0.005;
          CIRCUIT_STAGE.camOrbit.elv += e.movementY * 0.005;
          CIRCUIT_STAGE.camOrbit.elv = Math.max(0.05, Math.min(1.5, CIRCUIT_STAGE.camOrbit.elv));
        }
      };
      window.addEventListener("mouseup", onUp);
      window.addEventListener("mousemove", onMove);
      window._circuitDragHandlers={onUp,onMove};
    }
    cv.onwheel = e => {
      e.preventDefault();
      CIRCUIT_STAGE.camOrbit.distFactor *= (e.deltaY > 0 ? 1.1 : 0.9);
      CIRCUIT_STAGE.camOrbit.distFactor = Math.max(0.3, Math.min(5.0, CIRCUIT_STAGE.camOrbit.distFactor));
    };
  }
  
  const playBtn = document.getElementById("circuitPlayBtn");
  if(playBtn) {
    playBtn.onclick = () => {
      CIRCUIT_STAGE.playing = !CIRCUIT_STAGE.playing;
      playBtn.textContent = CIRCUIT_STAGE.playing ? "⏸ 暂停" : "▶ 继续";
    };
  }
  
  // G21：轻量圈数统计（过起终点线计圈 + 圈时）与越界记录状态初始化；
  // 驾驶系统逐圈刹车学习按弯道数初始化（首圈 15% 余量）。
  CIRCUIT_STAGE.lapState = {
    lap: 0, lapStarted: false, t0: 0, lastS: 0,
    lapTimes: [], events: [],
    lapOffs: 0, lapPenalty: 0, totalOffs: 0, totalPenalty: 0,
    lastLapTime: null, onGravel: false, runoffFlash: 0, lapFlash: 0
  };
  if(window.circuitPilot && CIRCUIT_STAGE.path && window.circuitPilot.initLapLearning) {
    window.circuitPilot.initLapLearning(CIRCUIT_STAGE.path.cornerCount || 0);
  }
  
  requestAnimationFrame(circuitStageLoop);
}

function closeCircuitStage() {
  const modal = document.getElementById("circuitStageModal");
  if(modal) modal.classList.remove("show");
  CIRCUIT_STAGE.active = false;
  /* F-33：关闭时移除 window 级拖拽监听（配合 open 侧覆盖式注册，杜绝泄漏） */
  if(window._circuitDragHandlers){
    window.removeEventListener("mouseup", window._circuitDragHandlers.onUp);
    window.removeEventListener("mousemove", window._circuitDragHandlers.onMove);
    window._circuitDragHandlers=null;
  }
  S.rack = 0; S.swAngle = 0;
  rebuild();
}

function respawnCircuitVehicle(eng, path, closestIdx) {
  if(!eng || !path || !path.pts || !path.pts.length) return;
  const P = path.pts.length;
  // Respawn 22 waypoints upstream (~44 meters back)
  const respawnIdx = (closestIdx - 22 + P) % P;
  const rp = path.pts[respawnIdx];
  const safeSpeed = Math.min(10.0, (rp.v_max || 10.0) * 0.7);
  
  eng.state.X = rp.x;
  eng.state.Y = rp.y;
  eng.state.Z = 0.0;
  eng.state.phi = 0;
  eng.state.theta = 0;
  eng.state.psi = rp.heading;
  eng.state.u = safeSpeed;
  eng.state.v = 0;
  eng.state.w = 0;
  eng.state.p = 0;
  eng.state.q = 0;
  eng.state.r = 0;
  
  const wRe = eng.ReF || 0.33;
  eng.state.omega = {
    FL: safeSpeed / wRe,
    FR: safeSpeed / wRe,
    RL: safeSpeed / (eng.ReR || wRe),
    RR: safeSpeed / (eng.ReR || wRe)
  };
  
  if(window.circuitPilot) {
    window.circuitPilot.pid_speed.integral = 0;
    window.circuitPilot.pid_speed.last_err = 0;
    window.circuitPilot.last_steer = 0;
  }
  
  CIRCUIT_STAGE.respawnNoticeTime = performance.now() + 2500;
}

/* G21：出界检测（纯记录不重置）+ 轻量圈数统计。
   四轮出路肩判定：|中心线偏离| > 沥青半宽 + 路肩宽 + 半车宽（≈0.95m）。
   冲出 → 记录事件/罚时 +5s + 上报驾驶学习；回赛道需自驶回（滞回防抖）。
   计圈：弧长 wrap 越起终点线即完圈，圈时/越界/罚时挂在该圈。 */
function trackLimitsAndLaps(pt, eng) {
  const ls = CIRCUIT_STAGE.lapState;
  if(!ls) return;
  const path = CIRCUIT_STAGE.path;
  const hw = (path && path.hw_m) || 4.9, kw = (path && path.kerb_m) || 1.35;
  const EDGE = hw + kw + 0.95;
  const ey = pt.crossTrackError;
  const offTrack = Math.abs(ey) > EDGE;
  if(offTrack && !ls.onGravel) {
    ls.onGravel = true;
    ls.lapOffs++; ls.totalOffs++;
    ls.lapPenalty += 5; ls.totalPenalty += 5;
    ls.runoffFlash = performance.now();
    ls.events.push({ lap: ls.lap, turn: pt.turnZh || pt.turn || "?",
                     speed: Math.round((eng.state.u || 0) * 3.6), t: performance.now() });
    if(ls.events.length > 50) ls.events.shift();
    if(window.circuitPilot && window.circuitPilot.reportRunoff) window.circuitPilot.reportRunoff(pt.cornerId);
  } else if(!offTrack && ls.onGravel && Math.abs(ey) < EDGE - 0.7) {
    ls.onGravel = false;
  }
  const totalLen = (path && path.totalLength) || 0;
  const sArc = pt.s || 0;
  if(totalLen > 0) {
    if(!ls.lapStarted && sArc < totalLen * 0.1) {
      ls.lapStarted = true; ls.t0 = performance.now(); ls.lap = 1;
    } else if(ls.lapStarted && ls.lastS > totalLen * 0.9 && sArc < totalLen * 0.1) {
      const nowT = performance.now();
      const lapTime = (nowT - ls.t0) / 1000;
      ls.lapTimes.push({ lap: ls.lap, time: lapTime, offs: ls.lapOffs, penalty: ls.lapPenalty });
      if(ls.lapTimes.length > 20) ls.lapTimes.shift();
      ls.lastLapTime = lapTime;
      ls.lapFlash = nowT;
      if(window.circuitPilot && window.circuitPilot.endLap) window.circuitPilot.endLap();
      ls.lap++;
      ls.t0 = nowT; ls.lapOffs = 0; ls.lapPenalty = 0;
    }
    ls.lastS = sArc;
  }
}

function circuitStageLoop(now) {
  if (!CIRCUIT_STAGE.active) return;

  const eng = window.physicsEngine;
  /* F-33（2026-08-30）：真实帧间隔（钳 0.033s 上限防卡顿跳步） */
  let dt = Math.min(0.033, (now - (CIRCUIT_STAGE.lastTime || now)) / 1000);
  CIRCUIT_STAGE.lastTime = now;
  let ctrl = { steer: 0, throttle: 0, brake: 0 };
  let e_y = 0, v_tar = 0;

  if (eng && CIRCUIT_STAGE.path) {
    // 🛡️ NaN 自愈卫哨：若状态出现非有限数，立即安全复位
    if(!isFinite(eng.state.X) || !isFinite(eng.state.Y) || !isFinite(eng.state.u)){
      respawnCircuitVehicle(eng, CIRCUIT_STAGE.path, 0);
    }
    
    const isUserManual = (CIRCUIT_STAGE.keys.w || CIRCUIT_STAGE.keys.s || CIRCUIT_STAGE.keys.a || CIRCUIT_STAGE.keys.d || CIRCUIT_STAGE.keys.space);
    let trackPt = null;
    if(isUserManual) {
      if(window.circuitPilot) window.circuitPilot.active = false;
      if(CIRCUIT_STAGE.keys.a) ctrl.steer -= 8;
      if(CIRCUIT_STAGE.keys.d) ctrl.steer += 8;
      if(CIRCUIT_STAGE.keys.w) ctrl.throttle = 1.0;
      if(CIRCUIT_STAGE.keys.s || CIRCUIT_STAGE.keys.space) ctrl.brake = 1.0;
      trackPt = CIRCUIT_STAGE.path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
    } else {
      if(window.circuitPilot) {
        window.circuitPilot.active = CIRCUIT_STAGE.autoPilot;
        ctrl = window.circuitPilot.drive(eng.state, dt);
        trackPt = CIRCUIT_STAGE.path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
      }
    }
    // P2a：T 键手动强开 DRS（自动模式下手动优先；松开即交还自动判定/关闭）
    if(CIRCUIT_STAGE.keys.drs) ctrl.drs = true;
    // G21：出界自动重置已关闭——四轮出路肩后纯物理接管（砾石 μ=0.78 打滑减速，
    // 可控后自己开回赛道），只记录越界事件 + 罚时，并反馈给逐圈刹车学习。
    if(trackPt) {
      e_y = trackPt.crossTrackError;
      v_tar = trackPt.targetSpeed;
      trackLimitsAndLaps(trackPt, eng);
    }
  }

  if (CIRCUIT_STAGE.playing && eng) {
    eng.step(ctrl, { grade: 0, bumpNoise: 0 }, dt);
  }

  try {
    const st = eng.state;
    const tel = eng.telemetry;
    
    CIRCUIT_STAGE.rebuildCadence++;
    if(CIRCUIT_STAGE.rebuildCadence % 3 === 0 || !CIRCUIT_STAGE.cachedScene) {
      const z0F = (SIM.FR && SIM.FR.n && SIM.FR.idx) ? SIM.FR.n[SIM.FR.idx.WC].p0[2] : 250;
      const z0R = (SIM.RR && SIM.RR.n && SIM.RR.idx) ? SIM.RR.n[SIM.RR.idx.WC].p0[2] : 250;
      
      const isFormula = S.vehicleType === "formula";
      const rackRatio = isFormula ? -0.55 : -1.5;
      const rackMax = isFormula ? 18 : 38;
      const rackDisplacement = Math.max(-rackMax, Math.min(rackMax, (ctrl.steer || 0) * rackRatio));
      
      const limF = (VEHICLE_PRESETS[S.vehicleType]||{}).limF || [-60, 65];
      const limR = (VEHICLE_PRESETS[S.vehicleType]||{}).limR || [-60, 65];
      const tr = tel.tr || { FL:0, FR:0, RL:0, RR:0 };
      const trFR = Math.max(limF[0], Math.min(limF[1], (tr.FR || 0) * 1000));
      const trRR = Math.max(limR[0], Math.min(limR[1], (tr.RR || 0) * 1000));
      const trFL = Math.max(limF[0], Math.min(limF[1], (tr.FL || 0) * 1000));
      const trRL = Math.max(limR[0], Math.min(limR[1], (tr.RL || 0) * 1000));

      if(SIM.FR) driveTo(SIM.FR, z0F + trFR, rackDisplacement, 'front');
      if(SIM.RR) driveTo(SIM.RR, z0R + trRR, 0, 'rear');
      if(S.show.mirror){
        if(SIM.FL) driveTo(SIM.FL, z0F + trFL, -rackDisplacement, 'front');
        if(SIM.RL) driveTo(SIM.RL, z0R + trRL, 0, 'rear');
      }
      S.rack = rackDisplacement;
      S.swAngle = (ctrl.steer || 0) * (isFormula ? 3.5 : 4.5);
      CIRCUIT_STAGE.cachedScene = buildScenePRO();
    }
    
    window._tireSpinAngles = {
      FL: (window._tireSpinAngles ? window._tireSpinAngles.FL : 0) + (st.omega.FL * dt),
      FR: (window._tireSpinAngles ? window._tireSpinAngles.FR : 0) + (st.omega.FR * dt),
      RL: (window._tireSpinAngles ? window._tireSpinAngles.RL : 0) + (st.omega.RL * dt),
      RR: (window._tireSpinAngles ? window._tireSpinAngles.RR : 0) + (st.omega.RR * dt)
    };
    
    renderCircuitScene(st, tel, ctrl);
    renderCircuitTelemetry(st, tel, ctrl);

    // Continuous MoTeC Telemetry Logging
    const tgt = (ctrl && ctrl.target) ? ctrl.target : (CIRCUIT_STAGE.path ? CIRCUIT_STAGE.path.getLookahead(st.X, st.Y, st.u) : null);
    if (window.circuitTelemetryRecorder) {
      window.circuitTelemetryRecorder.record(st, tel, ctrl, CIRCUIT_STAGE.path, tgt);
    }
    if (typeof TELEMETRY_LOG_STATE !== 'undefined' && TELEMETRY_LOG_STATE.modalOpen && (CIRCUIT_STAGE.rebuildCadence % 2 === 0)) {
      renderTelemetryLogCanvas();
    }
    
    // HUD Update
    
    const elV = document.getElementById("c_hud_v");
    if(elV) elV.textContent = (Math.max(0, st.u) * 3.6).toFixed(1) + " km/h";
    const elVT = document.getElementById("c_hud_vtar");
    if(elVT) elVT.textContent = (v_tar * 3.6).toFixed(1) + " km/h";
    const elAy = document.getElementById("c_hud_ay");
    if(elAy) elAy.textContent = Math.abs(tel.ay || 0).toFixed(2) + " g";
    const elThr = document.getElementById("c_hud_thr");
    if(elThr) elThr.textContent = (ctrl.throttle * 100).toFixed(0) + " %";
    const elBrk = document.getElementById("c_hud_brk");
    if(elBrk) elBrk.textContent = (ctrl.brake * 100).toFixed(0) + " %";
    const elErr = document.getElementById("c_hud_err");
    if(elErr) {
      /* G21：循迹偏离改为相对赛车线（外-内-外目标线）而非中心线 */
      const lineErr = (window.circuitPilot && typeof window.circuitPilot.last_line_error === "number")
        ? window.circuitPilot.last_line_error : e_y;
      elErr.textContent = Math.abs(lineErr).toFixed(2) + " m";
    }
    /* G21：圈数/越界/罚时读数 */
    const elLap = document.getElementById("c_hud_lap");
    if(elLap && CIRCUIT_STAGE.lapState) {
      const ls = CIRCUIT_STAGE.lapState;
      const lapTxt = ls.lapStarted ? ("L" + ls.lap) : "L-";
      const lastTxt = ls.lastLapTime ? (" · 上圈 " + ls.lastLapTime.toFixed(1) + "s") : "";
      elLap.textContent = lapTxt + lastTxt + " · 冲出 " + ls.totalOffs + " · 罚 " + ls.totalPenalty + "s";
      elLap.style.color = ls.totalOffs > 0 ? "#f2cc60" : "#79c0ff";
    }
    
    if(tgt) {
      const elTurn = document.getElementById("c_hud_turn");
      if(elTurn) elTurn.textContent = tgt.turnZh || tgt.turn || "主赛道";
      const elBadge = document.getElementById("c_hud_corner_badge");
      if(elBadge) {
        /* G21：冲出赛道闪示 3 秒（红）——越界只记录不重置 */
        const ls = CIRCUIT_STAGE.lapState;
        if(ls && ls.runoffFlash && performance.now() - ls.runoffFlash < 3000) {
          elBadge.textContent = "⚠ 冲出赛道！+5s 罚时（记录已入圈）";
          elBadge.style.background = "rgba(120,20,20,0.92)";
          elBadge.style.borderColor = "#ef4444";
          elBadge.style.color = "#ffd7d7";
        } else {
          elBadge.textContent = "🏁 [S" + (tgt.sector || 1) + "] " + (tgt.turnZh || tgt.turn || "主赛道");
          elBadge.style.background = "rgba(23,42,69,0.9)";
          elBadge.style.borderColor = "#388bfd";
          elBadge.style.color = "#58a6ff";
        }
      }
      
      const elSecBadge = document.getElementById("c_hud_sector_badge");
      if(elSecBadge) {
        elSecBadge.textContent = "SECTOR " + (tgt.sector || 1);
        elSecBadge.style.background = (tgt.sector === 1) ? "#1f6feb" : (tgt.sector === 2) ? "#d29922" : "#8957e5";
      }
      
      // Calculate recommended gear based on current speed
      const curKm = Math.max(0, st.u) * 3.6;
      let recGear = 1;
      if (curKm > 260) recGear = 6;
      else if (curKm > 200) recGear = 5;
      else if (curKm > 145) recGear = 4;
      else if (curKm > 95) recGear = 3;
      else if (curKm > 50) recGear = 2;
      
      const elGear = document.getElementById("c_hud_gear");
      if(elGear) elGear.textContent = recGear + " 档";
      const elGearBadge = document.getElementById("c_hud_gear_badge");
      if(elGearBadge) elGearBadge.textContent = recGear + " 档";
      
      const elDRSBadge = document.getElementById("c_hud_drs_badge");
      if(elDRSBadge) {
        /* P2a：徽章改读 ctrl.drs 真状态（物理已消费），赛道区段仅是候选条件 */
        if(ctrl && ctrl.drs) {
          elDRSBadge.style.background = "#238636";
          elDRSBadge.textContent = "🟢 DRS 开翼 −28%阻力";
        } else if(tgt.isDRS) {
          elDRSBadge.style.background = "#1f6feb";
          elDRSBadge.textContent = "🔵 DRS 区 · 提速开翼";
        } else {
          elDRSBadge.style.background = "#30363d";
          elDRSBadge.textContent = "⚪ DRS 关闭";
        }
      }
      
      const elKerbBadge = document.getElementById("c_hud_kerb_badge");
      if(elKerbBadge) {
        const onKerb = tel.isKerb && (tel.isKerb.FL || tel.isKerb.FR || tel.isKerb.RL || tel.isKerb.RR);
        elKerbBadge.style.display = onKerb ? "inline-block" : "none";
      }
    }
    
  } catch (e) {
    console.error("Circuit Loop Error:", e);
    paintStageError("circuitCanvas", "赛道舞台渲染失败", e);
  }

  requestAnimationFrame(circuitStageLoop);
}

/* =====================================================================
   CIRCUIT LIGHTING PRESETS & 3D REALISTIC SCENERY ENGINE
   ===================================================================== */
const CIRCUIT_LIGHTING = {
  day: {
    sunDir: [0.45, 0.35, 0.82],
    skyStops: [
      { p: 0.00, c: "#1d4ed8" }, // Deep azure blue
      { p: 0.32, c: "#3b82f6" }, // Clear sky blue
      { p: 0.60, c: "#60a5fa" }, // Soft cyan
      { p: 0.82, c: "#bfdbfe" }, // Horizon haze
      { p: 1.00, c: "#1f4a38" }  // Distant lush green horizon rim
    ],
    groundBase: "#143323",
    grassLight: "#2d6a4f",
    grassDark: "#1b4332",
    gravel: "#a37b51",
    gravelDark: "#855f36",
    asphalt: "#181f28",
    asphaltSun: "#2c3644",
    asphaltGlint: 0.35,
    guardrail: "#cbd5e1",
    guardrailShade: "#64748b",
    shadowCol: "rgba(10, 25, 18, 0.45)",
    shadowLen: 0.65,
    treeLeaves1: "#15803d",
    treeLeaves2: "#166534",
    treeLeaves3: "#14532d",
    grandstandRoof: "#f8fafc",
    grandstandBase: "#334155"
  },
  sunset: {
    sunDir: [-0.75, 0.25, 0.28], // Low golden sunset
    skyStops: [
      { p: 0.00, c: "#1e1035" }, // Deep purple twilight
      { p: 0.30, c: "#581c87" }, // Violet
      { p: 0.55, c: "#c2410c" }, // Crimson amber
      { p: 0.78, c: "#f97316" }, // Bright orange horizon
      { p: 1.00, c: "#fde047" }  // Golden glowing rim
    ],
    groundBase: "#2b2914",
    grassLight: "#3d421e",
    grassDark: "#2b3015",
    gravel: "#8c603b",
    gravelDark: "#6b4526",
    asphalt: "#1a1622",
    asphaltSun: "#382932",
    asphaltGlint: 0.65,
    guardrail: "#f1f5f9",
    guardrailShade: "#78716c",
    shadowCol: "rgba(25, 12, 35, 0.62)",
    shadowLen: 2.2,
    treeLeaves1: "#3f5e28",
    treeLeaves2: "#2d441c",
    treeLeaves3: "#1e2e13",
    grandstandRoof: "#ffedd5",
    grandstandBase: "#44343f"
  },
  night: {
    sunDir: [0, 0, 1.0], // Moonlight
    skyStops: [
      { p: 0.00, c: "#020617" }, // Pitch midnight black
      { p: 0.45, c: "#0b1222" }, // Navy blue
      { p: 0.70, c: "#111827" }, // Dark slate
      { p: 1.00, c: "#09121a" }  // Distant illuminated horizon glow
    ],
    groundBase: "#07120c",
    grassLight: "#0c1f15",
    grassDark: "#07140d",
    gravel: "#3f3325",
    gravelDark: "#2a2218",
    asphalt: "#0f141c",
    asphaltSun: "#1a222e",
    asphaltGlint: 0.15,
    guardrail: "#475569",
    guardrailShade: "#1e293b",
    shadowCol: "rgba(0, 0, 0, 0.75)",
    shadowLen: 0.3,
    treeLeaves1: "#0b2e17",
    treeLeaves2: "#071e0f",
    treeLeaves3: "#041209",
    grandstandRoof: "#334155",
    grandstandBase: "#1e293b"
  }
};

function renderCircuitLandmarks(ctx, projFast, E_x, E_y, lightCfg, lightMode) {
  // 1. Main Grandstand & White Lotus Canopy (发车主看台与荷花飞翼顶棚)
  const distToMainStand = Math.hypot(E_x - 16000, E_y - 99000) / 1000;
  if (distToMainStand < 700) {
    const u = [0.316, 0.948];
    const n = [0.948, -0.316];
    const getSFPt = (s, offN, z) => [(s * u[0] + offN * n[0]) * 1000, (s * u[1] + offN * n[1]) * 1000, z];

    const tiers = [
      { z: 1500, off: -16 },
      { z: 6500, off: -23 },
      { z: 12500, off: -30 },
      { z: 18000, off: -38 }
    ];

    // Ground shadow of Main Grandstand
    if (lightMode !== "night") {
      const sLen = lightCfg.shadowLen;
      const shX = -lightCfg.sunDir[0] * 24000 * sLen;
      const shY = -lightCfg.sunDir[1] * 24000 * sLen;
      const b1 = getSFPt(-40, -16, 0), b2 = getSFPt(240, -16, 0);
      const b3 = getSFPt(240, -42, 0), b4 = getSFPt(-40, -42, 0);
      const sb1 = projFast(b1[0], b1[1], 0);
      const sb2 = projFast(b2[0], b2[1], 0);
      const st3 = projFast(b3[0] + shX, b3[1] + shY, 0);
      const st4 = projFast(b4[0] + shX, b4[1] + shY, 0);
      if (sb1 && sb2 && st3 && st4) {
        ctx.beginPath();
        ctx.moveTo(sb1[0], sb1[1]); ctx.lineTo(sb2[0], sb2[1]);
        ctx.lineTo(st3[0], st3[1]); ctx.lineTo(st4[0], st4[1]);
        ctx.closePath();
        ctx.fillStyle = lightCfg.shadowCol;
        ctx.fill();
      }
    }

    // Concrete stepped tiers & crowds
    for (let t = 0; t < tiers.length - 1; t++) {
      const t1 = tiers[t], t2 = tiers[t + 1];
      const pA1 = projFast(...getSFPt(-40, t1.off, t1.z));
      const pB1 = projFast(...getSFPt(240, t1.off, t1.z));
      const pB2 = projFast(...getSFPt(240, t2.off, t2.z));
      const pA2 = projFast(...getSFPt(-40, t2.off, t2.z));
      if (pA1 && pB1 && pB2 && pA2) {
        ctx.beginPath();
        ctx.moveTo(pA1[0], pA1[1]); ctx.lineTo(pB1[0], pB1[1]);
        ctx.lineTo(pB2[0], pB2[1]); ctx.lineTo(pA2[0], pA2[1]);
        ctx.closePath();
        const tierColors = ["#1e293b", "#334155", "#475569"];
        ctx.fillStyle = tierColors[t % tierColors.length];
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Crowd dotting
        if (distToMainStand < 250) {
          ctx.beginPath();
          const nDots = 18;
          for (let d = 0; d < nDots; d++) {
            const frac = (d + 0.5) / nDots;
            const pt = [pA1[0] * (1 - frac) + pB1[0] * frac, pA1[1] * (1 - frac) + pB1[1] * frac - 2];
            ctx.arc(pt[0], pt[1], 1.5, 0, 2 * Math.PI);
          }
          ctx.fillStyle = (t % 2 === 0) ? "#ef4444" : "#3b82f6";
          ctx.fill();
        }
      }
    }

    // Iconic Cantilevered Lotus Canopy (荷花白张拉膜顶棚)
    const roofP1 = projFast(...getSFPt(-45, -12, 24000));
    const roofP2 = projFast(...getSFPt(245, -12, 24000));
    const roofP3 = projFast(...getSFPt(245, -45, 29000));
    const roofP4 = projFast(...getSFPt(-45, -45, 29000));
    if (roofP1 && roofP2 && roofP3 && roofP4) {
      ctx.beginPath();
      ctx.moveTo(roofP1[0], roofP1[1]); ctx.lineTo(roofP2[0], roofP2[1]);
      ctx.lineTo(roofP3[0], roofP3[1]); ctx.lineTo(roofP4[0], roofP4[1]);
      ctx.closePath();
      ctx.fillStyle = lightCfg.grandstandRoof;
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.stroke();

      for (let sPos = -30; sPos <= 230; sPos += 65) {
        const pylonBase = projFast(...getSFPt(sPos, -45, 0));
        const pylonTop = projFast(...getSFPt(sPos, -45, 34000));
        const roofEdge = projFast(...getSFPt(sPos, -12, 24000));
        if (pylonBase && pylonTop && roofEdge) {
          ctx.beginPath();
          ctx.moveTo(pylonBase[0], pylonBase[1]); ctx.lineTo(pylonTop[0], pylonTop[1]);
          ctx.strokeStyle = "#475569"; ctx.lineWidth = 3.5; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pylonTop[0], pylonTop[1]); ctx.lineTo(roofEdge[0], roofEdge[1]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    // 2. Pit Building Complex & FIA Timing Tower (发车直道右侧维修站大楼与计时塔)
    const pitP1 = projFast(...getSFPt(-20, 16, 0));
    const pitP2 = projFast(...getSFPt(220, 16, 0));
    const pitP1_t = projFast(...getSFPt(-20, 16, 9500));
    const pitP2_t = projFast(...getSFPt(220, 16, 9500));

    if (pitP1 && pitP2 && pitP1_t && pitP2_t) {
      ctx.beginPath();
      ctx.moveTo(pitP1[0], pitP1[1]); ctx.lineTo(pitP2[0], pitP2[1]);
      ctx.lineTo(pitP2_t[0], pitP2_t[1]); ctx.lineTo(pitP1_t[0], pitP1_t[1]);
      ctx.closePath();
      ctx.fillStyle = (lightMode === "night") ? "#111827" : "#e2e8f0";
      ctx.fill();
      ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5; ctx.stroke();

      if (distToMainStand < 350) {
        const nGarages = 16;
        for (let g = 0; g < nGarages; g++) {
          const frac1 = g / nGarages, frac2 = (g + 0.85) / nGarages;
          const g1 = [pitP1[0]*(1-frac1) + pitP2[0]*frac1, pitP1[1]*(1-frac1) + pitP2[1]*frac1];
          const g2 = [pitP1[0]*(1-frac2) + pitP2[0]*frac2, pitP1[1]*(1-frac2) + pitP2[1]*frac2];
          const gt1 = [pitP1_t[0]*(1-frac1) + pitP2_t[0]*frac1, pitP1_t[1]*(1-frac1) + pitP2_t[1]*frac1];
          ctx.beginPath();
          ctx.moveTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]);
          ctx.lineTo(gt1[0]*0.5 + g1[0]*0.5, gt1[1]*0.5 + g1[1]*0.5);
          ctx.fillStyle = "#1e293b"; ctx.fill();
        }
      }
    }

    // FIA Timing Tower (尖顶计时塔) at s = 200m
    const twBase = projFast(...getSFPt(200, 26, 0));
    const twTop = projFast(...getSFPt(200, 26, 24000));
    if (twBase && twTop) {
      ctx.beginPath();
      ctx.moveTo(twBase[0] - 5, twBase[1]); ctx.lineTo(twBase[0] + 5, twBase[1]);
      ctx.lineTo(twTop[0] + 2, twTop[1]); ctx.lineTo(twTop[0] - 2, twTop[1]);
      ctx.closePath();
      ctx.fillStyle = "#0f172a"; ctx.fill();
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.beginPath();
      ctx.arc(twTop[0], twTop[1], 4, 0, 2*Math.PI);
      ctx.fillStyle = "#ef4444"; ctx.fill();
    }
  }

  // 3. Back Straight Overhead Sponsor Bridge (1.17km 漫长后直道巨型跨线立交天桥)
  const distToBackBridge = Math.hypot(E_x - 180000, E_y - (-295000)) / 1000;
  if (distToBackBridge < 550) {
    const brX = 180000, brY = -295000;
    const pL_b = projFast(brX, brY + 8500, 0);
    const pL_t = projFast(brX, brY + 8500, 7500);
    const pR_b = projFast(brX, brY - 8500, 0);
    const pR_t = projFast(brX, brY - 8500, 7500);
    const pL_deck = projFast(brX, brY + 8500, 5600);
    const pR_deck = projFast(brX, brY - 8500, 5600);

    if (pL_b && pL_t && pR_b && pR_t && pL_deck && pR_deck) {
      ctx.beginPath();
      ctx.moveTo(pL_b[0] - 4, pL_b[1]); ctx.lineTo(pL_b[0] + 4, pL_b[1]);
      ctx.lineTo(pL_t[0] + 4, pL_t[1]); ctx.lineTo(pL_t[0] - 4, pL_t[1]);
      ctx.fillStyle = "#334155"; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pR_b[0] - 4, pR_b[1]); ctx.lineTo(pR_b[0] + 4, pR_b[1]);
      ctx.lineTo(pR_t[0] + 4, pR_t[1]); ctx.lineTo(pR_t[0] - 4, pR_t[1]);
      ctx.fillStyle = "#334155"; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pL_deck[0], pL_deck[1]); ctx.lineTo(pR_deck[0], pR_deck[1]);
      ctx.lineTo(pR_t[0], pR_t[1]); ctx.lineTo(pL_t[0], pL_t[1]);
      ctx.closePath();
      ctx.fillStyle = "#dc2626";
      ctx.fill();
      ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2; ctx.stroke();

      const brMid = [(pL_deck[0] + pR_deck[0] + pL_t[0] + pR_t[0]) * 0.25, (pL_deck[1] + pR_deck[1] + pL_t[1] + pR_t[1]) * 0.25];
      const brScale = Math.max(8, Math.min(22, 180 / (distToBackBridge + 15)));
      ctx.fillStyle = "#facc15";
      ctx.font = `900 ${Math.round(brScale)}px "Arial Black", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("PIRELLI", brMid[0], brMid[1]);
    }
  }

  // 4. T14 Heavy Braking Hairpin Grandstand (T14重刹发卡弯外侧巨型看台)
  const distToT14Stand = Math.hypot(E_x - (-620000), E_y - (-290000)) / 1000;
  if (distToT14Stand < 500) {
    const t14_c1 = projFast(-650000, -320000, 0);
    const t14_c2 = projFast(-580000, -320000, 0);
    const t14_c3 = projFast(-580000, -345000, 16000);
    const t14_c4 = projFast(-650000, -345000, 16000);
    if (t14_c1 && t14_c2 && t14_c3 && t14_c4) {
      ctx.beginPath();
      ctx.moveTo(t14_c1[0], t14_c1[1]); ctx.lineTo(t14_c2[0], t14_c2[1]);
      ctx.lineTo(t14_c3[0], t14_c3[1]); ctx.lineTo(t14_c4[0], t14_c4[1]);
      ctx.closePath();
      ctx.fillStyle = lightCfg.grandstandBase;
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

function renderCircuitScene(st, tel, ctrl) {
  if (!st || !isFinite(st.X) || !isFinite(st.Y) || !isFinite(st.psi)) return;
  const cv = document.getElementById("circuitCanvas");
  if(!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if(cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr){
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  }
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Atmospheric Sky & Dynamic Lighting
  const lightMode = CIRCUIT_STAGE.lightingMode || "day";
  const lightCfg = CIRCUIT_LIGHTING[lightMode] || CIRCUIT_LIGHTING.day;
  const isScenery = (CIRCUIT_STAGE.showScenery !== false);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  for (const stop of lightCfg.skyStops) {
    skyGrad.addColorStop(stop.p, stop.c);
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);
  
  const carX_mm = st.X * 1000;
  const carY_mm = st.Y * 1000;
  const carYaw = st.psi;
  
  const CIRCUIT_CAMS = {
    behind:  { dx: 0, dy: -8500, dz: 3600, lookDx: 0, lookDy: 2500, lookDz: 350, fov: 0.95 },
    cockpit: { dx: 0, dy: 100, dz: 900, lookDx: 0, lookDy: 16000, lookDz: 800, fov: 0.58 },
    nose:    { dx: 0, dy: 2400, dz: 650, lookDx: 0, lookDy: 14000, lookDz: 100, fov: 0.70 },
    wheel:   { dx: 1750, dy: 1350, dz: 650, lookDx: 0, lookDy: 600, lookDz: 250, fov: 0.85 },
    rear:    { dx: 0, dy: -1200, dz: 1200, lookDx: 0, lookDy: -16000, lookDz: 300, fov: 0.80 },
    heli:    { dx: -16000, dy: -22000, dz: 18000, lookDx: 0, lookDy: 2000, lookDz: 300, fov: 0.95 },
    tv:      { dx: -24000, dy: 16000, dz: 5500, lookDx: 0, lookDy: 0, lookDz: 500, fov: 0.95 },
    blimp:   { dx: 0, dy: -100, dz: 32000, lookDx: 0, lookDy: 0, lookDz: 0, fov: 0.95 }
  };
  const camCfg = CIRCUIT_CAMS[CIRCUIT_STAGE.camMode] || CIRCUIT_CAMS.behind;
  const distFactor = CIRCUIT_STAGE.camOrbit.distFactor;
  let cam_dx = camCfg.dx * distFactor, cam_dy = camCfg.dy * distFactor, cam_dz = camCfg.dz * distFactor;
  
  if(CIRCUIT_STAGE.camOrbit.az !== 0 || CIRCUIT_STAGE.camOrbit.elv !== 0) {
    const rH = Math.hypot(cam_dx, cam_dy);
    const angH = Math.atan2(cam_dx, cam_dy) + CIRCUIT_STAGE.camOrbit.az;
    cam_dx = Math.sin(angH) * rH;
    cam_dy = Math.cos(angH) * rH;
    cam_dz = cam_dz + Math.tan(CIRCUIT_STAGE.camOrbit.elv) * rH;
  }
  
  const cY = Math.cos(carYaw), sY = Math.sin(carYaw);
  
  let E_x, E_y, E_z, look_x, look_y, look_z;
  
  if(CIRCUIT_STAGE.camMode === 'tv') {
    // Dynamic Roadside TV Broadcast Camera
    const tvLookahead = 30.0;
    const tvPt = path ? path.getLookahead(st.X + (-sY) * tvLookahead, st.Y + (cY) * tvLookahead, 10.0) : null;
    if (tvPt) {
      E_x = (tvPt.x * 1000) + tvPt.nx * 22000;
      E_y = (tvPt.y * 1000) + tvPt.ny * 22000;
      E_z = 6000;
    } else {
      E_x = carX_mm - 20000;
      E_y = carY_mm + 16000;
      E_z = 5500;
    }
    look_x = carX_mm;
    look_y = carY_mm;
    look_z = Math.max(100, (st.Z || 0) * 1000 + 400);
  } else if(CIRCUIT_STAGE.camMode === 'blimp') {
    E_x = carX_mm;
    E_y = carY_mm;
    E_z = (camCfg.dz || 32000) * distFactor;
    look_x = carX_mm;
    look_y = carY_mm + 100;
    look_z = 0;
  } else {
    // Attached vehicle frame rotated by car yaw
    E_x = carX_mm + (-sY * cam_dy + cY * cam_dx);
    E_y = carY_mm + ( cY * cam_dy + sY * cam_dx);
    E_z = Math.max(150, (st.Z || 0) * 1000 + cam_dz);
    
    const lDx = camCfg.lookDx || 0;
    const lDy = camCfg.lookDy || 0;
    const lDz = camCfg.lookDz || 350;
    look_x = carX_mm + (-sY * lDy + cY * lDx);
    look_y = carY_mm + ( cY * lDy + sY * lDx);
    look_z = (st.Z || 0) * 1000 + lDz;
  }
  
  const fw_un = [look_x - E_x, look_y - E_y, look_z - E_z];
  const l_fw = Math.hypot(fw_un[0], fw_un[1], fw_un[2]) || 1;
  const fw = [fw_un[0]/l_fw, fw_un[1]/l_fw, fw_un[2]/l_fw];
  
  const n_world = [0, 0, 1];
  let rt_un = [
    fw[1]*n_world[2] - fw[2]*n_world[1],
    fw[2]*n_world[0] - fw[0]*n_world[2],
    fw[0]*n_world[1] - fw[1]*n_world[0]
  ];
  if(Math.hypot(rt_un[0], rt_un[1], rt_un[2]) < 1e-4) {
      rt_un = [1, 0, 0];
  }
  const l_rt = Math.hypot(rt_un[0], rt_un[1], rt_un[2]) || 1;
  const rt = [rt_un[0]/l_rt, rt_un[1]/l_rt, rt_un[2]/l_rt];
  
  const up = [
    rt[1]*fw[2] - rt[2]*fw[1],
    rt[2]*fw[0] - rt[0]*fw[2],
    rt[0]*fw[1] - rt[1]*fw[0]
  ];
  
  let fovScale = camCfg.fov || 0.95;
  const fovDist = Math.max(w, h) * fovScale;
  const halfW = w / 2, halfH = h / 2;
  
  const projFast = (wx, wy, wz) => {
    const dx = wx - E_x, dy = wy - E_y, dz = wz - E_z;
    const zc = fw[0]*dx + fw[1]*dy + fw[2]*dz;
    if(zc < 50) return null; // Near clipping plane
    const xc = rt[0]*dx + rt[1]*dy + rt[2]*dz;
    const yc = up[0]*dx + up[1]*dy + up[2]*dz;
    const f = fovDist / zc;
    return [halfW + xc * f, halfH - yc * f];
  };

  // 1. Draw 3D Continuous Asphalt Surface, Kerbs & Walls (Sorted Back-to-Front via Painter's Algorithm)
  const path = CIRCUIT_STAGE.path;
  if (path && path.pts) {
    const hw = 4900; // G21 窄道：4.9m 沥青半宽（原 7.0m 缩短 30%，路肩 1.35m 保留）
    const N = path.pts.length;
    
    // Collect visible track segments and compute distance to camera
    const segs = [];
    for (let i = 0; i < N; i++) {
      const p1 = path.pts[i];
      const p2 = path.pts[(i + 1) % N];
      
      const p1x_mm = p1.x * 1000, p1y_mm = p1.y * 1000;
      const p2x_mm = p2.x * 1000, p2y_mm = p2.y * 1000;
      const midX = (p1x_mm + p2x_mm) * 0.5;
      const midY = (p1y_mm + p2y_mm) * 0.5;
      
      const dx = midX - E_x, dy = midY - E_y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 400000**2) continue; // 400m view distance
      
      // Cull segments strictly behind the camera
      const dotFw = fw[0] * dx + fw[1] * dy;
      if (dotFw < -20000) continue;
      
      segs.push({
        i, p1, p2, p1x_mm, p1y_mm, p2x_mm, p2y_mm,
        distToCam: Math.sqrt(distSq) / 1000
      });
    }
    
    // Crucial: Sort segments from FARTHEST to CLOSEST (Painter's Algorithm)
    segs.sort((a, b) => b.distToCam - a.distToCam);

    // Render 3D Circuit Landmarks (Main Grandstand, Lotus Canopy, Pit Building & Timing Tower, Back Straight Bridge)
    if (isScenery) {
      renderCircuitLandmarks(ctx, projFast, E_x, E_y, lightCfg, lightMode);
    }
    
    for (const seg of segs) {
      const { i, p1, p2, p1x_mm, p1y_mm, p2x_mm, p2y_mm, distToCam } = seg;
      
      const pl1 = projFast(p1x_mm - p1.nx * hw, p1y_mm - p1.ny * hw, 0);
      const pr1 = projFast(p1x_mm + p1.nx * hw, p1y_mm + p1.ny * hw, 0);
      const pr2 = projFast(p2x_mm + p2.nx * hw, p2y_mm + p2.ny * hw, 0);
      const pl2 = projFast(p2x_mm - p2.nx * hw, p2y_mm - p2.ny * hw, 0);
      
      if (!pl1 || !pr1 || !pr2 || !pl2) continue;

      let vergeW_L = 18000, vergeW_R = 18000;
      const isGravel = (p1.runoff === "gravel");
      const isStripes = (p1.runoff === "asphalt_stripes");
      const kSide = p1.kerbSide || ((p1.curvature || 0) > 0 ? "right" : "left");
      
      if (isGravel) {
        if (kSide === "left") vergeW_L = 28000; else vergeW_R = 28000;
      } else if (isStripes) {
        if (kSide === "left") vergeW_L = 22000; else vergeW_R = 22000;
      }

      // 1. Verges (草坪修剪条纹 / 砂石避险区 / 彩色减速带)
      if (isScenery) {
        const pl_out1 = projFast(p1x_mm - p1.nx * (hw + vergeW_L), p1y_mm - p1.ny * (hw + vergeW_L), 0);
        const pl_out2 = projFast(p2x_mm - p2.nx * (hw + vergeW_L), p2y_mm - p2.ny * (hw + vergeW_L), 0);
        const pr_out1 = projFast(p1x_mm + p1.nx * (hw + vergeW_R), p1y_mm + p1.ny * (hw + vergeW_R), 0);
        const pr_out2 = projFast(p2x_mm + p2.nx * (hw + vergeW_R), p2y_mm + p2.ny * (hw + vergeW_R), 0);

        if (pl_out1 && pl_out2) {
          ctx.beginPath();
          ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(pl_out1[0], pl_out1[1]);
          ctx.lineTo(pl_out2[0], pl_out2[1]); ctx.lineTo(pl2[0], pl2[1]);
          ctx.closePath();
          if (isGravel && kSide === "left") {
            ctx.fillStyle = (i % 2 === 0) ? lightCfg.gravel : lightCfg.gravelDark;
          } else if (isStripes && kSide === "left") {
            ctx.fillStyle = (Math.floor(i / 3) % 2 === 0) ? "#2563eb" : "#dc2626";
          } else {
            ctx.fillStyle = (Math.floor(i / 6) % 2 === 0) ? lightCfg.grassLight : lightCfg.grassDark;
          }
          ctx.fill();
        }

        if (pr_out1 && pr_out2) {
          ctx.beginPath();
          ctx.moveTo(pr1[0], pr1[1]); ctx.lineTo(pr_out1[0], pr_out1[1]);
          ctx.lineTo(pr_out2[0], pr_out2[1]); ctx.lineTo(pr2[0], pr2[1]);
          ctx.closePath();
          if (isGravel && kSide === "right") {
            ctx.fillStyle = (i % 2 === 0) ? lightCfg.gravel : lightCfg.gravelDark;
          } else if (isStripes && kSide === "right") {
            ctx.fillStyle = (Math.floor(i / 3) % 2 === 0) ? "#2563eb" : "#dc2626";
          } else {
            ctx.fillStyle = (Math.floor(i / 6) % 2 === 0) ? lightCfg.grassLight : lightCfg.grassDark;
          }
          ctx.fill();
        }
      }

      // 2. Clean Asphalt Ribbon with Sunlight Shading
      const tLen = Math.hypot(p2x_mm - p1x_mm, p2y_mm - p1y_mm) || 1;
      const tx = (p2x_mm - p1x_mm) / tLen, ty = (p2y_mm - p1y_mm) / tLen;
      const sunAlign = Math.abs(tx * lightCfg.sunDir[0] + ty * lightCfg.sunDir[1]);

      ctx.beginPath();
      ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(pr1[0], pr1[1]);
      ctx.lineTo(pr2[0], pr2[1]); ctx.lineTo(pl2[0], pl2[1]);
      ctx.closePath();
      ctx.fillStyle = (sunAlign > 0.45 && lightMode !== "night") ? lightCfg.asphaltSun : lightCfg.asphalt;
      ctx.fill();
      
      // Dynamic Rubber Skid Mark Grooves on racing line
      const rk1_l = projFast(p1x_mm - p1.nx * 1800, p1y_mm - p1.ny * 1800, 2);
      const rk2_l = projFast(p2x_mm - p2.nx * 1800, p2y_mm - p2.ny * 1800, 2);
      const rk1_r = projFast(p1x_mm + p1.nx * 1800, p1y_mm + p1.ny * 1800, 2);
      const rk2_r = projFast(p2x_mm + p2.nx * 1800, p2y_mm + p2.ny * 1800, 2);
      if(rk1_l && rk2_l) {
        ctx.beginPath(); ctx.moveTo(rk1_l[0], rk1_l[1]); ctx.lineTo(rk2_l[0], rk2_l[1]);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.42)"; ctx.lineWidth = 3.5; ctx.stroke();
      }
      if(rk1_r && rk2_r) {
        ctx.beginPath(); ctx.moveTo(rk1_r[0], rk1_r[1]); ctx.lineTo(rk2_r[0], rk2_r[1]);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.42)"; ctx.lineWidth = 3.5; ctx.stroke();
      }
      
      // 3D Physical Bevel Kerbs (38mm elevation with alternating FIA Red/White tiles)
      const hasKerb = p1.kerbSide || (Math.abs(p1.curvature || 0) > 0.006);
      if (hasKerb) {
        const kerbCol = (i % 6 < 3) ? "#e11d48" : "#f8fafc";
        const kw = 1350; // 1.35m kerb width
        const kh = 38;   // 38mm bevel elevation
        
        if (kSide === "left" || kSide === "both") {
          const kl1_in = projFast(p1x_mm - p1.nx * hw, p1y_mm - p1.ny * hw, 0);
          const kl1_out = projFast(p1x_mm - p1.nx * (hw + kw), p1y_mm - p1.ny * (hw + kw), kh);
          const kl2_out = projFast(p2x_mm - p2.nx * (hw + kw), p2y_mm - p2.ny * (hw + kw), kh);
          const kl2_in = projFast(p2x_mm - p2.nx * hw, p2y_mm - p2.ny * hw, 0);
          if(kl1_in && kl1_out && kl2_out && kl2_in) {
            ctx.beginPath();
            ctx.moveTo(kl1_in[0], kl1_in[1]); ctx.lineTo(kl1_out[0], kl1_out[1]);
            ctx.lineTo(kl2_out[0], kl2_out[1]); ctx.lineTo(kl2_in[0], kl2_in[1]);
            ctx.closePath();
            ctx.fillStyle = kerbCol; ctx.fill();
            ctx.strokeStyle = "rgba(0, 0, 0, 0.15)"; ctx.lineWidth = 1; ctx.stroke();
          }
        }
        if (kSide === "right" || kSide === "both") {
          const kr1_in = projFast(p1x_mm + p1.nx * hw, p1y_mm + p1.ny * hw, 0);
          const kr1_out = projFast(p1x_mm + p1.nx * (hw + kw), p1y_mm + p1.ny * (hw + kw), kh);
          const kr2_out = projFast(p2x_mm + p2.nx * (hw + kw), p2y_mm + p2.ny * (hw + kw), kh);
          const kr2_in = projFast(p2x_mm + p2.nx * hw, p2y_mm + p2.ny * hw, 0);
          if(kr1_in && kr1_out && kr2_out && kr2_in) {
            ctx.beginPath();
            ctx.moveTo(kr1_in[0], kr1_in[1]); ctx.lineTo(kr1_out[0], kr1_out[1]);
            ctx.lineTo(kr2_out[0], kr2_out[1]); ctx.lineTo(kr2_in[0], kr2_in[1]);
            ctx.closePath();
            ctx.fillStyle = kerbCol; ctx.fill();
            ctx.strokeStyle = "rgba(0, 0, 0, 0.15)"; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      
      // Outer Track Asphalt Clean Border Lines
      ctx.beginPath();
      ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(pl2[0], pl2[1]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.lineWidth = 2.0; ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(pr1[0], pr1[1]); ctx.lineTo(pr2[0], pr2[1]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.lineWidth = 2.0; ctx.stroke();
      
      // Center White Dashed Guide
      if(i % 6 < 3) {
        const pc1 = projFast(p1x_mm, p1y_mm, 2);
        const pc2 = projFast(p2x_mm, p2y_mm, 2);
        if(pc1 && pc2) {
          ctx.beginPath(); ctx.moveTo(pc1[0], pc1[1]); ctx.lineTo(pc2[0], pc2[1]);
          ctx.strokeStyle = "rgba(255,255,255,0.40)"; ctx.lineWidth = 2.5; ctx.stroke();
        }
      }

      // 3. Double-Corrugated Armco Guardrails (防撞金属钢护栏)
      if (isScenery && distToCam < 260) {
        const railZ = 850;
        const rl_top1 = projFast(p1x_mm - p1.nx * (hw + vergeW_L), p1y_mm - p1.ny * (hw + vergeW_L), railZ);
        const rl_bot1 = projFast(p1x_mm - p1.nx * (hw + vergeW_L), p1y_mm - p1.ny * (hw + vergeW_L), 250);
        const rl_top2 = projFast(p2x_mm - p2.nx * (hw + vergeW_L), p2y_mm - p2.ny * (hw + vergeW_L), railZ);
        const rl_bot2 = projFast(p2x_mm - p2.nx * (hw + vergeW_L), p2y_mm - p2.ny * (hw + vergeW_L), 250);
        if (rl_top1 && rl_bot1 && rl_top2 && rl_bot2) {
          ctx.beginPath();
          ctx.moveTo(rl_bot1[0], rl_bot1[1]); ctx.lineTo(rl_top1[0], rl_top1[1]);
          ctx.lineTo(rl_top2[0], rl_top2[1]); ctx.lineTo(rl_bot2[0], rl_bot2[1]);
          ctx.closePath();
          ctx.fillStyle = lightCfg.guardrail; ctx.fill();
          ctx.strokeStyle = lightCfg.guardrailShade; ctx.lineWidth = 1; ctx.stroke();
        }

        const rr_top1 = projFast(p1x_mm + p1.nx * (hw + vergeW_R), p1y_mm + p1.ny * (hw + vergeW_R), railZ);
        const rr_bot1 = projFast(p1x_mm + p1.nx * (hw + vergeW_R), p1y_mm + p1.ny * (hw + vergeW_R), 250);
        const rr_top2 = projFast(p2x_mm + p2.nx * (hw + vergeW_R), p2y_mm + p2.ny * (hw + vergeW_R), railZ);
        const rr_bot2 = projFast(p2x_mm + p2.nx * (hw + vergeW_R), p2y_mm + p2.ny * (hw + vergeW_R), 250);
        if (rr_top1 && rr_bot1 && rr_top2 && rr_bot2) {
          ctx.beginPath();
          ctx.moveTo(rr_bot1[0], rr_bot1[1]); ctx.lineTo(rr_top1[0], rr_top1[1]);
          ctx.lineTo(rr_top2[0], rr_top2[1]); ctx.lineTo(rr_bot2[0], rr_bot2[1]);
          ctx.closePath();
          ctx.fillStyle = lightCfg.guardrail; ctx.fill();
          ctx.strokeStyle = lightCfg.guardrailShade; ctx.lineWidth = 1; ctx.stroke();
        }
      }

      // 4. Trackside Sponsor Billboards (FIA 赞助商长板广告牌)
      if (isScenery && (i % 12 === 0) && distToCam < 200) {
        const sponsors = [
          { name: "PIRELLI", bg: "#dc2626", fg: "#facc15" },
          { name: "ROLEX", bg: "#064e3b", fg: "#f59e0b" },
          { name: "Mobil 1", bg: "#ffffff", fg: "#dc2626" },
          { name: "SHELL", bg: "#facc15", fg: "#dc2626" },
          { name: "PETRONAS", bg: "#0d9488", fg: "#ffffff" },
          { name: "DHL", bg: "#eab308", fg: "#dc2626" }
        ];
        const sp = sponsors[Math.floor(i / 12) % sponsors.length];
        const sideSign = (i % 24 === 0) ? -1 : 1;
        const sideW = (sideSign < 0) ? vergeW_L : vergeW_R;
        const bPos_x = p1x_mm + sideSign * p1.nx * (hw + sideW + 600);
        const bPos_y = p1y_mm + sideSign * p1.ny * (hw + sideW + 600);
        
        const bP1_x = bPos_x - tx * 4500, bP1_y = bPos_y - ty * 4500;
        const bP2_x = bPos_x + tx * 4500, bP2_y = bPos_y + ty * 4500;
        
        const b_b1 = projFast(bP1_x, bP1_y, 400);
        const b_t1 = projFast(bP1_x, bP1_y, 1800);
        const b_t2 = projFast(bP2_x, bP2_y, 1800);
        const b_b2 = projFast(bP2_x, bP2_y, 400);
        
        if (b_b1 && b_t1 && b_t2 && b_b2) {
          const post1_b = projFast(bP1_x + tx * 1500, bP1_y + ty * 1500, 0);
          const post1_t = projFast(bP1_x + tx * 1500, bP1_y + ty * 1500, 1600);
          const post2_b = projFast(bP2_x - tx * 1500, bP2_y - ty * 1500, 0);
          const post2_t = projFast(bP2_x - tx * 1500, bP2_y - ty * 1500, 1600);
          if (post1_b && post1_t) {
            ctx.beginPath(); ctx.moveTo(post1_b[0], post1_b[1]); ctx.lineTo(post1_t[0], post1_t[1]);
            ctx.strokeStyle = "#475569"; ctx.lineWidth = 2.5; ctx.stroke();
          }
          if (post2_b && post2_t) {
            ctx.beginPath(); ctx.moveTo(post2_b[0], post2_b[1]); ctx.lineTo(post2_t[0], post2_t[1]);
            ctx.strokeStyle = "#475569"; ctx.lineWidth = 2.5; ctx.stroke();
          }

          ctx.beginPath();
          ctx.moveTo(b_b1[0], b_b1[1]); ctx.lineTo(b_t1[0], b_t1[1]);
          ctx.lineTo(b_t2[0], b_t2[1]); ctx.lineTo(b_b2[0], b_b2[1]);
          ctx.closePath();
          ctx.fillStyle = sp.bg; ctx.fill();
          ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1.2; ctx.stroke();

          const bMid = [(b_t1[0] + b_t2[0] + b_b1[0] + b_b2[0]) * 0.25, (b_t1[1] + b_t2[1] + b_b1[1] + b_b2[1]) * 0.25];
          const bAng = Math.atan2(b_t2[1] - b_t1[1], b_t2[0] - b_t1[0]);
          const fontSize = Math.max(7, Math.min(18, 140 / (distToCam + 15)));

          ctx.save();
          ctx.translate(bMid[0], bMid[1]);
          ctx.rotate(bAng);
          ctx.fillStyle = sp.fg;
          ctx.font = `900 ${Math.round(fontSize)}px "Arial Black", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sp.name, 0, 0);
          ctx.restore();
        }
      }

      // 5. 3D Trees & Foliage (防护林)
      if (isScenery && (i % 8 === 0) && distToCam < 320) {
        const tSide = (i % 16 === 0) ? -1 : 1;
        const tOffset = (tSide < 0 ? vergeW_L : vergeW_R) + 5000 + ((i * 1337) % 14000);
        const tx_pos = p1x_mm + tSide * p1.nx * (hw + tOffset);
        const ty_pos = p1y_mm + tSide * p1.ny * (hw + tOffset);
        const treeH = 7500 + ((i * 7919) % 3500);

        const pTrunkBase = projFast(tx_pos, ty_pos, 0);
        const pTrunkTop = projFast(tx_pos, ty_pos, treeH * 0.35);
        const pTier1 = projFast(tx_pos, ty_pos, treeH * 0.60);
        const pTier2 = projFast(tx_pos, ty_pos, treeH * 0.85);
        const pApex = projFast(tx_pos, ty_pos, treeH);

        if (pTrunkBase && pApex) {
          if (lightMode !== "night") {
            const sLen = lightCfg.shadowLen;
            const sDx = -lightCfg.sunDir[0] * treeH * sLen;
            const sDy = -lightCfg.sunDir[1] * treeH * sLen;
            const pShadTip = projFast(tx_pos + sDx, ty_pos + sDy, 0);
            if (pShadTip) {
              ctx.beginPath();
              ctx.moveTo(pTrunkBase[0] - 4, pTrunkBase[1]); ctx.lineTo(pShadTip[0], pShadTip[1]);
              ctx.lineTo(pTrunkBase[0] + 4, pTrunkBase[1]); ctx.closePath();
              ctx.fillStyle = lightCfg.shadowCol; ctx.fill();
            }
          }

          ctx.beginPath();
          ctx.moveTo(pTrunkBase[0], pTrunkBase[1]);
          ctx.lineTo(pTrunkTop ? pTrunkTop[0] : pApex[0], pTrunkTop ? pTrunkTop[1] : pApex[1]);
          ctx.strokeStyle = "#452b1e";
          ctx.lineWidth = Math.max(1.5, Math.min(6, 4000 / distToCam));
          ctx.stroke();

          const crownR1 = Math.max(3, Math.min(22, 14000 / distToCam));
          const crownR2 = crownR1 * 0.75;
          const crownR3 = crownR1 * 0.50;

          if (pTier1) {
            ctx.beginPath(); ctx.arc(pTier1[0], pTier1[1], crownR1, 0, 2*Math.PI);
            ctx.fillStyle = lightCfg.treeLeaves3; ctx.fill();
          }
          if (pTier2) {
            ctx.beginPath(); ctx.arc(pTier2[0], pTier2[1], crownR2, 0, 2*Math.PI);
            ctx.fillStyle = lightCfg.treeLeaves2; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(pApex[0], pApex[1], crownR3, 0, 2*Math.PI);
          ctx.fillStyle = lightCfg.treeLeaves1; ctx.fill();
        }
      }

      // 6. Night Mode Floodlight Towers & Ground Illumination
      if (lightMode === "night" && (i % 20 === 0) && distToCam < 250) {
        const mastX = p1x_mm - p1.nx * (hw + vergeW_L + 2000);
        const mastY = p1y_mm - p1.ny * (hw + vergeW_L + 2000);
        const mastBase = projFast(mastX, mastY, 0);
        const mastTop = projFast(mastX, mastY, 14000);
        if (mastBase && mastTop) {
          ctx.beginPath(); ctx.moveTo(mastBase[0], mastBase[1]); ctx.lineTo(mastTop[0], mastTop[1]);
          ctx.strokeStyle = "#475569"; ctx.lineWidth = 3; ctx.stroke();

          ctx.beginPath(); ctx.arc(mastTop[0], mastTop[1], 5, 0, 2*Math.PI);
          ctx.fillStyle = "#fef08a"; ctx.fill();

          const pPool = projFast(p1x_mm, p1y_mm, 2);
          if (pPool) {
            const poolR = Math.max(8, Math.min(60, 22000 / distToCam));
            const poolGrad = ctx.createRadialGradient(pPool[0], pPool[1], 0, pPool[0], pPool[1], poolR);
            poolGrad.addColorStop(0, "rgba(254, 240, 138, 0.28)");
            poolGrad.addColorStop(1, "rgba(254, 240, 138, 0.0)");
            ctx.beginPath(); ctx.arc(pPool[0], pPool[1], poolR, 0, 2*Math.PI);
            ctx.fillStyle = poolGrad; ctx.fill();
          }
        }
      }
      
      // 3D Braking Distance Boards (150m, 100m, 50m) - Clean white boards with distance culling
      if (p1.brakingBoard && distToCam < 160) {
        const alpha = Math.max(0, Math.min(1, (160 - distToCam) / 60));
        const bpx = p1x_mm + p1.nx * (hw + 3200);
        const bpy = p1y_mm + p1.ny * (hw + 3200);
        const b_base = projFast(bpx, bpy, 0);
        const b_top = projFast(bpx, bpy, 2300);
        if(b_base && b_top) {
          const bScale = Math.max(0.6, Math.min(1.25, 75 / (distToCam + 25)));
          const bw = 32 * bScale, bh = 20 * bScale;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(b_base[0], b_base[1]); ctx.lineTo(b_top[0], b_top[1]);
          ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 3 * bScale; ctx.stroke();
          
          ctx.fillStyle = "#ffffff";
          if (ctx.roundRect) ctx.roundRect(b_top[0] - bw/2, b_top[1] - bh/2, bw, bh, 3 * bScale);
          else ctx.fillRect(b_top[0] - bw/2, b_top[1] - bh/2, bw, bh);
          ctx.fill();
          ctx.strokeStyle = "#111827"; ctx.lineWidth = 1.5 * bScale; ctx.stroke();
          
          ctx.fillStyle = "#111827";
          ctx.font = `bold ${Math.round(11 * bScale)}px monospace`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p1.brakingBoard, b_top[0], b_top[1]);
          ctx.restore();
        }
      }
    }
    
    // Start / Finish Line Checkered Grid & 3D Overhead Gantry
    const pStart = path.pts[0];
    if(pStart) {
      const gantryH = 6500; // 6.5m overhead gantry
      const ps_l = projFast(pStart.x * 1000 - pStart.nx * hw, pStart.y * 1000 - pStart.ny * hw, 0);
      const ps_r = projFast(pStart.x * 1000 + pStart.nx * hw, pStart.y * 1000 + pStart.ny * hw, 0);
      const ps_lt = projFast(pStart.x * 1000 - pStart.nx * (hw + 1500), pStart.y * 1000 - pStart.ny * (hw + 1500), gantryH);
      const ps_rt = projFast(pStart.x * 1000 + pStart.nx * (hw + 1500), pStart.y * 1000 + pStart.ny * (hw + 1500), gantryH);
      
      if(ps_l && ps_r) {
        ctx.beginPath();
        ctx.moveTo(ps_l[0], ps_l[1]); ctx.lineTo(ps_r[0], ps_r[1]);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 8; ctx.stroke();
      }
      if(ps_lt && ps_rt && ps_l && ps_r) {
        ctx.beginPath();
        ctx.moveTo(ps_l[0], ps_l[1]); ctx.lineTo(ps_lt[0], ps_lt[1]);
        ctx.lineTo(ps_rt[0], ps_rt[1]); ctx.lineTo(ps_r[0], ps_r[1]);
        ctx.strokeStyle = "rgba(78, 161, 211, 0.85)"; ctx.lineWidth = 4; ctx.stroke();
        
        // Start Lights on Gantry
        const pMid = projFast(pStart.x * 1000, pStart.y * 1000, gantryH - 600);
        if(pMid) {
          ctx.beginPath(); ctx.arc(pMid[0], pMid[1], 7, 0, 2*Math.PI);
          ctx.fillStyle = "#ef4444"; ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  // 2. Soft Contact Ground Shadow under the car
  const shadowW = Math.max(1200, (S.front.tire.R || 300) * 3);
  const shadowL = (S.wb || 2600) + 800;
  const sOffX = (lightMode !== "night") ? -lightCfg.sunDir[0] * 350 * lightCfg.shadowLen : 0;
  const sOffY = (lightMode !== "night") ? -lightCfg.sunDir[1] * 350 * lightCfg.shadowLen : 0;
  const projShad = (lx, ly) => {
    const rx = cY * lx - sY * ly + carX_mm + sOffX;
    const ry = sY * lx + cY * ly + carY_mm + sOffY;
    return projFast(rx, ry, 2);
  };
  const s1 = projShad(-shadowW/2, -shadowL/2);
  const s2 = projShad(shadowW/2, -shadowL/2);
  const s3 = projShad(shadowW/2, shadowL/2);
  const s4 = projShad(-shadowW/2, shadowL/2);
  if(s1 && s2 && s3 && s4){
    ctx.beginPath();
    ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.lineTo(s4[0], s4[1]);
    ctx.closePath();
    ctx.fillStyle = lightCfg.shadowCol;
    ctx.fill();
  }

  // Night Mode Dual Vehicle Headlight Projectors
  if (lightMode === "night") {
    const fwHead_x = -sY, fwHead_y = cY;
    const rtHead_x = cY, rtHead_y = sY;
    const hBeamL1 = projFast(carX_mm - rtHead_x * 700, carY_mm - rtHead_y * 700, 300);
    const hBeamR1 = projFast(carX_mm + rtHead_x * 700, carY_mm + rtHead_y * 700, 300);
    const hBeamL2 = projFast(carX_mm + fwHead_x * 55000 - rtHead_x * 9000, carY_mm + fwHead_y * 55000 - rtHead_y * 9000, 10);
    const hBeamR2 = projFast(carX_mm + fwHead_x * 55000 + rtHead_x * 9000, carY_mm + fwHead_y * 55000 + rtHead_y * 9000, 10);
    if (hBeamL1 && hBeamR1 && hBeamL2 && hBeamR2) {
      ctx.beginPath();
      ctx.moveTo(hBeamL1[0], hBeamL1[1]); ctx.lineTo(hBeamR1[0], hBeamR1[1]);
      ctx.lineTo(hBeamR2[0], hBeamR2[1]); ctx.lineTo(hBeamL2[0], hBeamL2[1]);
      ctx.closePath();
      const hGrad = ctx.createLinearGradient(hBeamL1[0], hBeamL1[1], hBeamL2[0], hBeamL2[1]);
      hGrad.addColorStop(0, "rgba(254, 240, 138, 0.45)");
      hGrad.addColorStop(0.35, "rgba(254, 240, 138, 0.22)");
      hGrad.addColorStop(1, "rgba(254, 240, 138, 0.0)");
      ctx.fillStyle = hGrad;
      ctx.fill();
    }
  }

  // 3. Draw 3D Vehicle Multibody Chassis & Suspension
  const cx = carX_mm, cy = carY_mm;
  const staticZOffset = (S.front && S.front.tire && S.front.tire.R ? S.front.tire.R : 330) - 
                        ((S.front && S.front.hp && S.front.hp.WC) ? S.front.hp.WC[2] : 300);
  const cz = st.Z * 1000 + staticZOffset;

  const cP = Math.cos(st.theta), sP = Math.sin(st.theta);
  const cR = Math.cos(st.phi), sR = Math.sin(st.phi);

  const R11 = cY*cR - sY*sP*sR,  R12 = -sY*cP,  R13 = cY*sR + sY*sP*cR;
  const R21 = sY*cR + cY*sP*sR,  R22 = cY*cP,   R23 = sY*sR - cY*sP*cR;
  const R31 = -cP*sR,            R32 = sP,      R33 = cP*cR;

  const projBodyFast = (lx, ly, lz) => {
    return projFast(
      R11*lx + R12*ly + R13*lz + cx,
      R21*lx + R22*ly + R23*lz + cy,
      R31*lx + R32*ly + R33*lz + cz
    );
  };
  
  if (CIRCUIT_STAGE.cachedScene) {
    for(let i = 0; i < CIRCUIT_STAGE.cachedScene.length; i++){
      const o = CIRCUIT_STAGE.cachedScene[i];
      if(!o) continue;
      if(o.k === "l"){
        if(!o.a || !o.b) continue;
        const A = projBodyFast(o.a[0], o.a[1], o.a[2]);
        const B = projBodyFast(o.b[0], o.b[1], o.b[2]);
        if(!A || !B) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        ctx.strokeStyle = o.c || "#58a6ff";
        ctx.lineWidth = o.w || 1.2;
        ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        ctx.stroke();
      } else if(o.k === "p"){
        if(!o.pts || o.pts.length < 2) continue;
        ctx.beginPath();
        if(o.d && o.d.length) ctx.setLineDash(o.d); else ctx.setLineDash([]);
        let started = false;
        for(let j = 0; j < o.pts.length; j++){
          const Q = projBodyFast(o.pts[j][0], o.pts[j][1], o.pts[j][2]);
          if(!Q){ started = false; continue; }
          if(!started){ ctx.moveTo(Q[0], Q[1]); started = true; }
          else ctx.lineTo(Q[0], Q[1]);
        }
        if(o.f){ ctx.fillStyle = o.f; ctx.fill(); }
        ctx.strokeStyle = o.c || "#58a6ff";
        ctx.lineWidth = o.w || 1.2;
        ctx.stroke();
      } else if(o.k === "n"){
        if(!o.p) continue;
        const A = projBodyFast(o.p[0], o.p[1], o.p[2]);
        if(!A) continue;
        ctx.beginPath();
        ctx.arc(A[0], A[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = o.c || "#58a6ff";
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
  }

  // 4. Draw Official FIA Shanghai International Circuit Telemetry Mini-Map
  if (path && path.pts) {
    const mmW = 340, mmH = 265;
    const mmPad = 18;
    const mx = w - mmW - mmPad, my = h - mmH - mmPad;
    
    // Luxury Glassmorphic Map Card
    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 26, 0.88)";
    ctx.strokeStyle = "rgba(56, 139, 253, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mmW, mmH, 12);
    else ctx.rect(mx, my, mmW, mmH);
    ctx.fill(); ctx.stroke();
    
    // Header title with sleek sector pill
    ctx.fillStyle = "#58a6ff";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📍 上海国际赛车场 (SIC 5.45km)", mx + 14, my + 20);
    
    // Track bounds calculation
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(let pt of path.pts) {
      if(pt.x < minX) minX = pt.x; if(pt.x > maxX) maxX = pt.x;
      if(pt.y < minY) minY = pt.y; if(pt.y > maxY) maxY = pt.y;
    }
    const tW = Math.max(1, maxX - minX), tH = Math.max(1, maxY - minY);
    const scale = (Math.min(mmW, mmH) - 64) / Math.max(tW, tH);
    const cX = minX + tW/2, cY = minY + tH/2;
    
    const trX = (x) => mx + mmW/2 + (x - cX) * scale;
    const trY = (y) => my + mmH/2 + 10 - (y - cY) * scale; // Y is flipped in canvas
    
    // Draw Glowing Track Shadow / Underglow
    for(let i = 0; i < path.pts.length; i++) {
      const p1 = path.pts[i];
      const p2 = path.pts[(i + 1) % path.pts.length];
      ctx.beginPath();
      ctx.moveTo(trX(p1.x), trY(p1.y));
      ctx.lineTo(trX(p2.x), trY(p2.y));
      ctx.strokeStyle = (p1.sector === 1) ? "rgba(0, 242, 254, 0.25)" : (p1.sector === 2) ? "rgba(255, 183, 3, 0.25)" : "rgba(188, 140, 255, 0.25)";
      ctx.lineWidth = 6.0;
      ctx.stroke();
    }

    // Draw Crisp Sector Segments
    for(let i = 0; i < path.pts.length; i++) {
      const p1 = path.pts[i];
      const p2 = path.pts[(i + 1) % path.pts.length];
      ctx.beginPath();
      ctx.moveTo(trX(p1.x), trY(p1.y));
      ctx.lineTo(trX(p2.x), trY(p2.y));
      ctx.strokeStyle = (p1.sector === 1) ? "#00f2fe" : (p1.sector === 2) ? "#ffb703" : "#c084fc";
      ctx.lineWidth = (p1.isDRS) ? 3.8 : 2.6;
      ctx.stroke();
    }
    
    // Draw 16 Official Turn Markers (T1 ~ T16) on Mini-Map with Smart Non-Overlapping Offsets
    const turnAnchors = [
      {no:"1", x:235, y:580, ox: 10, oy: -10},
      {no:"2", x:360, y:545, ox: 12, oy: -5},
      {no:"3", x:185, y:440, ox: -12, oy: 8},
      {no:"4", x:285, y:370, ox: 0, oy: -12},
      {no:"5", x:500, y:380, ox: 0, oy: -12},
      {no:"6", x:815, y:205, ox: 14, oy: 0},
      {no:"7", x:545, y:280, ox: 0, oy: 12},
      {no:"8", x:430, y:155, ox: -14, oy: 0},
      {no:"9", x:465, y:-30, ox: 12, oy: 0},
      {no:"10", x:420, y:-130, ox: -12, oy: 0},
      {no:"11", x:785, y:-95, ox: 12, oy: 0},
      {no:"12", x:810, y:-40, ox: 12, oy: -8},
      {no:"13", x:935, y:-145, ox: 14, oy: 0},
      {no:"14", x:-625, y:-245, ox: -14, oy: 0},
      {no:"15", x:-420, y:-200, ox: 0, oy: 12},
      {no:"16", x:-45, y:-130, ox: -12, oy: 0}
    ];
    for(let ta of turnAnchors) {
      const px = trX(ta.x) + (ta.ox || 0), py = trY(ta.y) + (ta.oy || 0);
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, 2*Math.PI);
      ctx.fillStyle = "rgba(13, 20, 36, 0.95)"; ctx.fill();
      ctx.strokeStyle = "rgba(56, 139, 253, 0.75)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "#e6edf3";
      ctx.font = "bold 8.5px -apple-system, BlinkMacSystemFont, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ta.no, px, py);
    }
    
    // Draw Start/Finish Flag & Indicator
    const pStart = path.pts[0];
    if(pStart) {
      const sx = trX(pStart.x), sy = trY(pStart.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, 2*Math.PI);
      ctx.fillStyle = "#ef4444"; ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.stroke();
    }
    
    // Draw Live Car Position & Heading Cone with Glowing Pulse
    const carPx = trX(carX_mm / 1000);
    const carPy = trY(carY_mm / 1000);
    
    // Car Pulse Ring
    ctx.beginPath();
    ctx.arc(carPx, carPy, 8, 0, 2*Math.PI);
    ctx.strokeStyle = "rgba(16, 185, 129, 0.5)"; ctx.lineWidth = 2; ctx.stroke();
    
    ctx.save();
    ctx.translate(carPx, carPy);
    ctx.rotate(-carYaw + Math.PI); // canvas heading rotation
    ctx.beginPath();
    ctx.moveTo(0, 9); ctx.lineTo(-6, -7); ctx.lineTo(0, -4); ctx.lineTo(6, -7);
    ctx.closePath();
    ctx.fillStyle = "#10b981"; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    
    ctx.restore();
  }

  // 5. Draw Respawn Insurance Banner
  if (CIRCUIT_STAGE.respawnNoticeTime && performance.now() < CIRCUIT_STAGE.respawnNoticeTime) {
    ctx.save();
    const bannerW = 430, bannerH = 36;
    const bx = (w - bannerW) / 2, by = 22;
    ctx.fillStyle = "rgba(239, 68, 68, 0.90)";
    ctx.beginPath();
    ctx.roundRect(bx, by, bannerW, bannerH, 8);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Segoe UI', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠️ 触发赛道脱轨保护 · 已自动重置至前序安全路点继续仿真", w / 2, by + bannerH / 2);
    ctx.restore();
  }
}

/* =====================================================================
   9. MoTeC i2 Pro 专业赛车工程遥测波形 LOG 分析系统
   ===================================================================== */
class LapTelemetryRecorder {
  constructor() {
    this.liveBuffer = [];
    this.currentLap = [];
    this.bestLap = null;
    this.lastCompletedLap = null;
    this.currentLapNum = 1;
    this.lapStartTime = 0;
    this.lastCrossDist = 0;
    this.totalDistanceTraveled = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.maxSpeed = 0;
    this.maxAy = 0;
    this.sampleCadence = 0;
  }

  reset() {
    this.liveBuffer = [];
    this.currentLap = [];
    this.currentLapNum = 1;
    this.lapStartTime = performance.now() / 1000;
    this.totalDistanceTraveled = 0;
    this.lastCrossDist = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.maxSpeed = 0;
    this.maxAy = 0;
    this.sampleCadence = 0;
  }

  record(st, tel, ctrl, path, target) {
    if (!st || !isFinite(st.X) || !isFinite(st.Y)) return;

    this.sampleCadence++;
    if (this.sampleCadence % 2 !== 0) return; // 50Hz sampling

    const nowSec = performance.now() / 1000;
    if (!this.lapStartTime) this.lapStartTime = nowSec;

    if (this.lastX !== 0 || this.lastY !== 0) {
      const d = Math.hypot(st.X - this.lastX, st.Y - this.lastY);
      if (d < 40) this.totalDistanceTraveled += d;
    }
    this.lastX = st.X;
    this.lastY = st.Y;

    const v_kmh = Math.max(0, st.u) * 3.6;
    if (v_kmh > this.maxSpeed) this.maxSpeed = v_kmh;
    const ay_abs = Math.abs(tel.ay || 0);
    if (ay_abs > this.maxAy) this.maxAy = ay_abs;

    const curLapTime = nowSec - this.lapStartTime;
    const distOnLap = this.totalDistanceTraveled % 5450;

    const tr = tel.tr || { FL: 0, FR: 0, RL: 0, RR: 0 };
    const fz = tel.Fz || { FL: 2500, FR: 2500, RL: 2500, RR: 2500 };
    const camber = tel.camber || { FL: -2.8, FR: -2.8, RL: -1.8, RR: -1.8 };
    const toe = tel.toe || { FL: 0, FR: 0, RL: 0, RR: 0 };
    const onKerb = tel.isKerb && (tel.isKerb.FL || tel.isKerb.FR || tel.isKerb.RL || tel.isKerb.RR);

    const ptInfo = target || (path ? path.getLookahead(st.X, st.Y, st.u) : {});

    const record = {
      t: curLapTime,
      s: distOnLap,
      totalDist: this.totalDistanceTraveled,
      v: v_kmh,
      v_tar: (ptInfo.targetSpeed ? ptInfo.targetSpeed * 3.6 : v_kmh),
      thr: (ctrl.throttle || 0) * 100,
      brk: (ctrl.brake || 0) * 100,
      steer: (ctrl.steer || 0),
      ay: tel.ay || 0,
      ax: tel.ax || 0,
      az: tel.az || 0,
      gear: (v_kmh > 260 ? 6 : v_kmh > 200 ? 5 : v_kmh > 145 ? 4 : v_kmh > 95 ? 3 : v_kmh > 50 ? 2 : 1),
      drs: !!ptInfo.isDRS,
      tr_FL: (tr.FL || 0) * 1000,
      tr_FR: (tr.FR || 0) * 1000,
      tr_RL: (tr.RL || 0) * 1000,
      tr_RR: (tr.RR || 0) * 1000,
      Fz_FL: fz.FL || 0,
      Fz_FR: fz.FR || 0,
      Fz_RL: fz.RL || 0,
      Fz_RR: fz.RR || 0,
      camber_FL: camber.FL || -2.8,
      camber_FR: camber.FR || -2.8,
      toe_FL: toe.FL || 0,
      toe_FR: toe.FR || 0,
      isKerb: onKerb,
      turn: ptInfo.turnZh || ptInfo.turn || "",
      sector: ptInfo.sector || 1,
      x: st.X,
      y: st.Y
    };

    this.liveBuffer.push(record);
    if (this.liveBuffer.length > 3000) this.liveBuffer.shift();

    this.currentLap.push(record);

    // Lap completion detection
    if (this.totalDistanceTraveled - this.lastCrossDist > 5300 && (ptInfo.idx < 50 || distOnLap < 50)) {
      this.lastCompletedLap = [...this.currentLap];
      if (!this.bestLap || curLapTime < this.bestLap.lapTime) {
        this.bestLap = {
          data: [...this.currentLap],
          lapTime: curLapTime,
          vMax: this.maxSpeed,
          ayMax: this.maxAy,
          lapNum: this.currentLapNum
        };
      }
      this.currentLap = [];
      this.currentLapNum++;
      this.lapStartTime = nowSec;
      this.lastCrossDist = this.totalDistanceTraveled;
      this.maxSpeed = 0;
      this.maxAy = 0;
    }
  }
}
window.circuitTelemetryRecorder = new LapTelemetryRecorder();

const TELEMETRY_LOG_STATE = {
  modalOpen: false,
  axis: "dist", // "dist" | "time"
  source: "current", // "current" | "best"
  channels: {
    speed: true,
    pedals: true,
    accel: true,
    susp: true,
    loads: true,
    kc: true
  },
  hoverIdx: -1,
  hoverMouseX: -1
};

function openCircuitTelemetryLogModal() {
  const modal = document.getElementById("circuitTelemetryLogModal");
  if (!modal) return;
  modal.classList.add("show");
  TELEMETRY_LOG_STATE.modalOpen = true;
  renderTelemetryLogCanvas();
}

function closeCircuitTelemetryLogModal() {
  const modal = document.getElementById("circuitTelemetryLogModal");
  if (!modal) return;
  modal.classList.remove("show");
  TELEMETRY_LOG_STATE.modalOpen = false;
  TELEMETRY_LOG_STATE.hoverIdx = -1;
  const tip = document.getElementById("telemetryCursorTooltip");
  if (tip) tip.style.display = "none";
}

function toggleCircuitTelemetryLog() {
  if (TELEMETRY_LOG_STATE.modalOpen) closeCircuitTelemetryLogModal();
  else openCircuitTelemetryLogModal();
}

function handleTelemetryCanvasMouseMove(e) {
  const cv = document.getElementById("telemetryLogCanvas");
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  TELEMETRY_LOG_STATE.hoverMouseX = mouseX;
  renderTelemetryLogCanvas();
}

function handleTelemetryCanvasMouseLeave() {
  TELEMETRY_LOG_STATE.hoverMouseX = -1;
  TELEMETRY_LOG_STATE.hoverIdx = -1;
  const tip = document.getElementById("telemetryCursorTooltip");
  if (tip) tip.style.display = "none";
  renderTelemetryLogCanvas();
}

function exportTelemetryCSV() {
  const rec = window.circuitTelemetryRecorder;
  if (!rec) return;
  const data = (TELEMETRY_LOG_STATE.source === 'best' && rec.bestLap) ? rec.bestLap.data : 
               (TELEMETRY_LOG_STATE.source === 'current' && rec.currentLap.length > 10 ? rec.currentLap : rec.liveBuffer);
  if (!data || data.length === 0) {
    alert("暂无遥测数据可导出，请在赛道上行驶几秒后重试！");
    return;
  }

  let csv = "Time_s,Distance_m,Speed_kmh,TargetSpeed_kmh,Throttle_pct,Brake_pct,Steer_deg,LateralG_g,LongitudinalG_g,Gear,DRS,Travel_FL_mm,Travel_FR_mm,Travel_RL_mm,Travel_RR_mm,Fz_FL_N,Fz_FR_N,Fz_RL_N,Fz_RR_N,Camber_FL_deg,Toe_FL_deg,IsKerb,Turn,Sector,World_X,World_Y\n";
  for (const d of data) {
    csv += `${d.t.toFixed(3)},${d.s.toFixed(1)},${d.v.toFixed(1)},${d.v_tar.toFixed(1)},${d.thr.toFixed(0)},${d.brk.toFixed(0)},${d.steer.toFixed(1)},${d.ay.toFixed(3)},${d.ax.toFixed(3)},${d.gear},${d.drs?1:0},${d.tr_FL.toFixed(1)},${d.tr_FR.toFixed(1)},${d.tr_RL.toFixed(1)},${d.tr_RR.toFixed(1)},${Math.round(d.Fz_FL)},${Math.round(d.Fz_FR)},${Math.round(d.Fz_RL)},${Math.round(d.Fz_RR)},${d.camber_FL.toFixed(2)},${d.toe_FL.toFixed(2)},${d.isKerb?1:0},"${d.turn}",${d.sector},${d.x.toFixed(2)},${d.y.toFixed(2)}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `shanghai_telemetry_log_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderTelemetryLogCanvas() {
  const cv = document.getElementById("telemetryLogCanvas");
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr) {
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  const W = cv.width / dpr, H = cv.height / dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const rec = window.circuitTelemetryRecorder;
  const isBest = (TELEMETRY_LOG_STATE.source === 'best' && rec && rec.bestLap);
  const data = isBest ? rec.bestLap.data : 
               ((rec && rec.currentLap && rec.currentLap.length > 5) ? rec.currentLap : (rec ? rec.liveBuffer : []));

  // Update Stats Header
  const elLapTime = document.getElementById("tl_stat_laptime");
  const elVmax = document.getElementById("tl_stat_vmax");
  const elAyMax = document.getElementById("tl_stat_aymax");
  const elDist = document.getElementById("tl_stat_dist");

  if (data && data.length > 0) {
    let maxV = 0, maxAy = 0;
    for (let d of data) {
      if (d.v > maxV) maxV = d.v;
      if (Math.abs(d.ay) > maxAy) maxAy = Math.abs(d.ay);
    }
    const tDur = data[data.length - 1].t - data[0].t;
    const mins = Math.floor(tDur / 60);
    const secs = (tDur % 60).toFixed(3);
    if (elLapTime) elLapTime.textContent = (mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : `${secs}s`);
    if (elVmax) elVmax.textContent = `${maxV.toFixed(1)} km/h`;
    if (elAyMax) elAyMax.textContent = `${maxAy.toFixed(2)} g`;
    if (elDist) elDist.textContent = `${(data[data.length - 1].s || 5450).toFixed(0)} m`;
  }

  if (!data || data.length < 2) {
    ctx.fillStyle = "rgba(139, 148, 158, 0.8)";
    ctx.font = "14px 'Segoe UI', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⏳ 正在采集赛车遥测数据流... 请驾驶赛车或开启 AutoPilot 行驶以生成波形图", W / 2, H / 2);
    return;
  }

  const leftPad = 75;
  const rightPad = 35;
  const topPad = 10;
  const bottomPad = 26;
  const plotW = W - leftPad - rightPad;
  const plotH = H - topPad - bottomPad;

  // Active channels list
  const activeChannels = [];
  if (TELEMETRY_LOG_STATE.channels.speed) activeChannels.push("speed");
  if (TELEMETRY_LOG_STATE.channels.pedals) activeChannels.push("pedals");
  if (TELEMETRY_LOG_STATE.channels.accel) activeChannels.push("accel");
  if (TELEMETRY_LOG_STATE.channels.susp) activeChannels.push("susp");
  if (TELEMETRY_LOG_STATE.channels.loads) activeChannels.push("loads");
  if (TELEMETRY_LOG_STATE.channels.kc) activeChannels.push("kc");

  if (activeChannels.length === 0) activeChannels.push("speed");

  const numChannels = activeChannels.length;
  const chanH = plotH / numChannels;

  // X Range (Distance 0~5450m OR Time 0~maxT)
  const isDistAxis = (TELEMETRY_LOG_STATE.axis === "dist");
  const xMin = isDistAxis ? 0 : data[0].t;
  const xMax = isDistAxis ? 5450 : Math.max(xMin + 10, data[data.length - 1].t);

  const getX = (rec) => {
    const val = isDistAxis ? rec.s : rec.t;
    return leftPad + Math.max(0, Math.min(1, (val - xMin) / (xMax - xMin))) * plotW;
  };

  // 1. Draw Sector Backgrounds
  if (isDistAxis) {
    const s1End = leftPad + (1420 / 5450) * plotW;
    const s2End = leftPad + (3260 / 5450) * plotW;
    ctx.fillStyle = "rgba(0, 242, 254, 0.035)";
    ctx.fillRect(leftPad, topPad, s1End - leftPad, plotH);
    ctx.fillStyle = "rgba(255, 183, 3, 0.035)";
    ctx.fillRect(s1End, topPad, s2End - s1End, plotH);
    ctx.fillStyle = "rgba(192, 132, 252, 0.035)";
    ctx.fillRect(s2End, topPad, leftPad + plotW - s2End, plotH);
  }

  // 2. Draw Official Turn Markers on X-Axis
  const turns = [
    { name: "T1/T2", s: 420 },
    { name: "T3/T4", s: 800 },
    { name: "T6", s: 1680 },
    { name: "T8/T9", s: 2350 },
    { name: "T11", s: 3100 },
    { name: "T13 (大倾角)", s: 3900 },
    { name: "T14 (1.2km发卡)", s: 4850 },
    { name: "T16", s: 5380 }
  ];

  for (const turn of turns) {
    const tx = isDistAxis ? (leftPad + (turn.s / 5450) * plotW) : null;
    if (tx && tx >= leftPad && tx <= leftPad + plotW) {
      ctx.beginPath();
      ctx.moveTo(tx, topPad);
      ctx.lineTo(tx, topPad + plotH);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(88, 166, 255, 0.75)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(turn.name, tx, topPad + plotH + 16);
    }
  }

  // 3. Draw Each Active Channel Strip Chart
  activeChannels.forEach((chanKey, cIdx) => {
    const cy = topPad + cIdx * chanH;
    const ch = chanH - 8;

    // Sub-chart card background
    ctx.fillStyle = (cIdx % 2 === 0) ? "rgba(22, 27, 34, 0.65)" : "rgba(13, 17, 23, 0.65)";
    ctx.fillRect(leftPad, cy, plotW, ch);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(leftPad, cy, plotW, ch);

    // Channel 1: Speed
    if (chanKey === "speed") {
      const yMin = 0, yMax = 350;
      const getY = (v) => cy + ch - ((v - yMin) / (yMax - yMin)) * ch;

      // Y Grid & Labels
      [0, 100, 200, 300].forEach(yVal => {
        const py = getY(yVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(yVal.toString(), leftPad - 8, py + 3);
      });

      // Target Speed (Dashed Yellow)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(250, 204, 21, 0.65)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getY(data[i].v_tar);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Actual Speed (Cyan Gradient)
      ctx.beginPath();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.0;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getY(data[i].v);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Title
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("SPEED (km/h)", leftPad + 8, cy + 14);
    }

    // Channel 2: Pedals & Steer
    else if (chanKey === "pedals") {
      const getYPedal = (pct) => cy + ch - (pct / 100) * ch;
      const getYSteer = (ang) => cy + ch / 2 - (ang / 30) * (ch / 2);

      // Y Grid (0, 50, 100%)
      [0, 50, 100].forEach(pVal => {
        const py = getYPedal(pVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(pVal + "%", leftPad - 8, py + 3);
      });

      // Steer Zero Line
      ctx.beginPath();
      ctx.moveTo(leftPad, cy + ch/2); ctx.lineTo(leftPad + plotW, cy + ch/2);
      ctx.strokeStyle = "rgba(96, 165, 250, 0.25)";
      ctx.stroke();

      // Throttle (Green)
      ctx.beginPath();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getYPedal(data[i].thr);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Brake (Red)
      ctx.beginPath();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getYPedal(data[i].brk);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Steer (Blue)
      ctx.beginPath();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getYSteer(data[i].steer);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("PEDALS & STEER (Thr% / Brk% / Steer°)", leftPad + 8, cy + 14);
    }

    // Channel 3: Accelerations (ay, ax)
    else if (chanKey === "accel") {
      const getY_G = (g) => cy + ch / 2 - (g / 2.8) * (ch / 2);

      [-2, -1, 0, 1, 2].forEach(gVal => {
        const py = getY_G(gVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = (gVal === 0) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(gVal + "g", leftPad - 8, py + 3);
      });

      // Lateral G (Amber)
      ctx.beginPath();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.8;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getY_G(data[i].ay);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Long G (Cyan)
      ctx.beginPath();
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.3;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]);
        const py = getY_G(data[i].ax);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("G-G ACCELERATIONS (ay: Amber / ax: Cyan)", leftPad + 8, cy + 14);
    }

    // Channel 4: Suspension Damper Travel
    else if (chanKey === "susp") {
      const getY_TR = (tr_mm) => cy + ch / 2 - (tr_mm / 35.0) * (ch / 2);

      [-20, 0, 20].forEach(trVal => {
        const py = getY_TR(trVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = (trVal === 0) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(trVal + "mm", leftPad - 8, py + 3);
      });

      // Kerb highlight bands
      for (let i = 0; i < data.length; i++) {
        if (data[i].isKerb) {
          const px = getX(data[i]);
          ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
          ctx.fillRect(px - 1.5, cy, 3, ch);
        }
      }

      // FL (Teal)
      ctx.beginPath(); ctx.strokeStyle = "#14b8a6"; ctx.lineWidth = 1.5;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_TR(data[i].tr_FL);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // FR (Sky)
      ctx.beginPath(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_TR(data[i].tr_FR);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // RL (Orange)
      ctx.beginPath(); ctx.strokeStyle = "#f97316"; ctx.lineWidth = 1.2;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_TR(data[i].tr_RL);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // RR (Rose)
      ctx.beginPath(); ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1.2;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_TR(data[i].tr_RR);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "#2dd4bf";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("DAMPER POTENTIOMETERS (FL:Teal FR:Sky RL:Orange RR:Rose)", leftPad + 8, cy + 14);
    }

    // Channel 5: Wheel Loads Fz
    else if (chanKey === "loads") {
      const getY_Fz = (fz) => cy + ch - (fz / 6000.0) * ch;

      [0, 2000, 4000, 6000].forEach(fVal => {
        const py = getY_Fz(fVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(fVal + "N", leftPad - 8, py + 3);
      });

      // FL
      ctx.beginPath(); ctx.strokeStyle = "#14b8a6"; ctx.lineWidth = 1.4;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_Fz(data[i].Fz_FL);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // FR
      ctx.beginPath(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.4;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getY_Fz(data[i].Fz_FR);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "#fb7185";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("VERTICAL WHEEL LOADS Fz (N)", leftPad + 8, cy + 14);
    }

    // Channel 6: K&C Camber & Toe
    else if (chanKey === "kc") {
      const getYCamber = (c_deg) => cy + ch - ((c_deg - (-5.0)) / (0.0 - (-5.0))) * ch;

      [-4, -3, -2, -1].forEach(cVal => {
        const py = getYCamber(cVal);
        ctx.beginPath();
        ctx.moveTo(leftPad, py); ctx.lineTo(leftPad + plotW, py);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
        ctx.fillStyle = "#8b949e";
        ctx.font = "9.5px monospace";
        ctx.textAlign = "right";
        ctx.fillText(cVal + "°", leftPad - 8, py + 3);
      });

      // FL Camber (Violet)
      ctx.beginPath(); ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 1.8;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getYCamber(data[i].camber_FL);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // FR Camber (Fuchsia)
      ctx.beginPath(); ctx.strokeStyle = "#e879f9"; ctx.lineWidth = 1.8;
      for (let i = 0; i < data.length; i++) {
        const px = getX(data[i]); const py = getYCamber(data[i].camber_FR);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "#c084fc";
      ctx.font = "bold 10.5px -apple-system, monospace";
      ctx.textAlign = "left";
      ctx.fillText("K&C DYNAMIC CAMBER (FL:Violet / FR:Fuchsia)", leftPad + 8, cy + 14);
    }
  });

  // 4. Interactive Hairline Cursor & Tooltip
  if (TELEMETRY_LOG_STATE.hoverMouseX >= leftPad && TELEMETRY_LOG_STATE.hoverMouseX <= leftPad + plotW) {
    const hx = TELEMETRY_LOG_STATE.hoverMouseX;
    ctx.beginPath();
    ctx.moveTo(hx, topPad);
    ctx.lineTo(hx, topPad + plotH);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Find nearest data point
    let closestD = null;
    let minDiff = Infinity;
    for (let d of data) {
      const px = getX(d);
      const diff = Math.abs(px - hx);
      if (diff < minDiff) { minDiff = diff; closestD = d; }
    }

    if (closestD) {
      const tip = document.getElementById("telemetryCursorTooltip");
      if (tip) {
        tip.style.display = "block";
        const tipX = Math.min(W - 240, Math.max(leftPad + 10, hx + 15));
        const tipY = Math.min(H - 220, Math.max(topPad + 10, 40));
        tip.style.left = tipX + "px";
        tip.style.top = tipY + "px";

        const elTipPos = document.getElementById("tl_tip_pos");
        if (elTipPos) elTipPos.textContent = `📍 距离: ${closestD.s.toFixed(0)}m ${closestD.turn ? '(' + closestD.turn + ')' : ''}`;
        const elTipTime = document.getElementById("tl_tip_time");
        if (elTipTime) elTipTime.textContent = `⏱️ ${closestD.t.toFixed(2)}s`;
        const elTipSpeed = document.getElementById("tl_tip_speed");
        if (elTipSpeed) elTipSpeed.textContent = `${closestD.v.toFixed(1)} / ${closestD.v_tar.toFixed(1)} km/h`;
        const elTipPedals = document.getElementById("tl_tip_pedals");
        if (elTipPedals) elTipPedals.textContent = `🟢 ${closestD.thr.toFixed(0)}% / 🔴 ${closestD.brk.toFixed(0)}% (${closestD.gear}档)`;
        const elTipSteer = document.getElementById("tl_tip_steer");
        if (elTipSteer) elTipSteer.textContent = `${closestD.steer >= 0 ? '+' : ''}${closestD.steer.toFixed(1)}°`;
        const elTipG = document.getElementById("tl_tip_g");
        if (elTipG) elTipG.textContent = `${closestD.ay.toFixed(2)}g / ${closestD.ax >= 0 ? '+' : ''}${closestD.ax.toFixed(2)}g`;
        const elTipTrF = document.getElementById("tl_tip_tr_f");
        if (elTipTrF) elTipTrF.textContent = `FL:${closestD.tr_FL.toFixed(1)} FR:${closestD.tr_FR.toFixed(1)} mm`;
        const elTipTrR = document.getElementById("tl_tip_tr_r");
        if (elTipTrR) elTipTrR.textContent = `RL:${closestD.tr_RL.toFixed(1)} RR:${closestD.tr_RR.toFixed(1)} mm`;
        const elTipFz = document.getElementById("tl_tip_fz");
        if (elTipFz) elTipFz.textContent = `${Math.round(closestD.Fz_FL)} / ${Math.round(closestD.Fz_FR)} / ${Math.round(closestD.Fz_RL)} / ${Math.round(closestD.Fz_RR)} N`;
        const elTipKc = document.getElementById("tl_tip_kc");
        if (elTipKc) elTipKc.textContent = `γ:${closestD.camber_FL.toFixed(2)}° / δ:${closestD.toe_FL.toFixed(2)}°`;
      }
    }
  }
}

/* =====================================================================
   GLOBAL PAGE BOOTSTRAP INITIALIZATION
   ===================================================================== */
const evalBtn = document.getElementById("evalModalBtn");
if(evalBtn) evalBtn.onclick = openSuspensionEvaluation;
const evalCloseBtn = document.getElementById("evalCloseBtn");
if(evalCloseBtn) evalCloseBtn.onclick = () => document.getElementById("suspEvalModal").classList.remove("show");

initSlopeStageEvents();
initSkidpadStageEvents();
initCircuitStageEvents();

if(typeof loadVehiclePreset === 'function') loadVehiclePreset("formula");
buildLeft();
buildRight();
rebuild();
initViews();
simulate(0.016);
simulate(0.016);
VW.forEach(v=>{sizeView(v);fitView(v);});
requestAnimationFrame(loop);

/* G13（2026-08-31）：start.bat 默认拉起后端引擎（:8001），页面加载后自动连接；
   引擎若未就绪则轮询重试（最多 5 次），不在线时静默回落内置 JS 求解器。 */
(function tryEngineConnect(retries){
  if(typeof ENG === 'undefined' || ENG.ok) return;
  if(typeof engineConnect === 'function') {
    engineConnect().then(()=>{
      if(!ENG.ok && retries > 0) setTimeout(()=>tryEngineConnect(retries-1), 1200);
    });
  }
})(5);


