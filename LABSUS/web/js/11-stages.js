"use strict";

function buildShanghaiCircuit() {
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
  return new CircuitPath(wp, 1.35);
}

class UniversalAutoPilot {
  constructor(S_config) {
    this.wb = (S_config.wb || 2600) / 1000.0; 
    this.a = this.wb * 0.48; // Dist from CG to Front Axle
    
    this.pid_speed = { p: 1.1, i: 0.15, d: 0.08, integral: 0, last_err: 0 };
    this.last_steer = 0;
    this.active = false;
    this.path = null;
  }
  
  setPath(newPath) {
    this.path = newPath;
    this.pid_speed.integral = 0;
    this.pid_speed.last_err = 0;
    this.last_steer = 0;
  }

  drive(state, dt) {
    if (!this.path || !this.active) return { steer: 0, throttle: 0, brake: 0, target: null };
    
    const u = Math.max(0.1, state.u || 0);
    // Dynamic lookahead distance adapting to speed (4m in hairpins, up to 35m at 320km/h)
    const lookDist = Math.max(3.8, Math.min(38.0, 0.40 * u * this.wb));
    
    // Front Axle coordinates (World Frame) with speed-adaptive lookahead lead
    const fx = state.X - this.a * Math.sin(state.psi) + (-Math.sin(state.psi)) * (lookDist * 0.22);
    const fy = state.Y + this.a * Math.cos(state.psi) + (Math.cos(state.psi)) * (lookDist * 0.22);
    
    const target = this.path.getLookahead(fx, fy, u);
    
    let e_heading = target.targetHeading - state.psi;
    while(e_heading > Math.PI) e_heading -= 2 * Math.PI;
    while(e_heading < -Math.PI) e_heading += 2 * Math.PI;
    
    let safe_ey = target.crossTrackError;
    if (safe_ey > 6.0) safe_ey = 6.0;
    if (safe_ey < -6.0) safe_ey = -6.0;
    
    // Adaptive Stanley gain: softer at high speed (320km/h), responsive in hairpins
    const k_st = 1.6 / (1.0 + 0.022 * u);
    const k_soft = 1.6;
    const steer_fb = -e_heading - Math.atan2(k_st * safe_ey, k_soft + u);
    const steer_ff = -Math.atan2(this.wb * target.targetCurvature * 0.95, 1.0);
    
    let raw_steer = (steer_fb + steer_ff) * (180.0 / Math.PI);
    raw_steer = Math.max(-28, Math.min(28, raw_steer));
    
    // Rate limit steering to avoid sudden snap-oversteer
    const max_steer_rate = 140.0; // deg/s
    const d_steer = Math.max(-max_steer_rate * dt, Math.min(max_steer_rate * dt, raw_steer - this.last_steer));
    let ctrl_steer = this.last_steer + d_steer;
    this.last_steer = ctrl_steer;
    
    let e_v = target.targetSpeed - u;
    this.pid_speed.integral += e_v * dt;
    this.pid_speed.integral = Math.max(-10, Math.min(10, this.pid_speed.integral));
    
    const d_err = (e_v - this.pid_speed.last_err) / (dt + 1e-6);
    this.pid_speed.last_err = e_v;
    
    const accel_cmd = this.pid_speed.p * e_v + this.pid_speed.i * this.pid_speed.integral + this.pid_speed.d * d_err;
    
    let ctrl_throttle = 0, ctrl_brake = 0;
    // G-G Friction circle allocation: reduce brake/throttle if steering heavily
    const steer_ratio = Math.abs(ctrl_steer) / 28.0;
    const long_avail = Math.max(0.20, 1.0 - 0.70 * steer_ratio);
    
    if (accel_cmd > 0) {
      ctrl_throttle = Math.min(1.0, accel_cmd * 0.32) * long_avail; 
    } else {
      ctrl_brake = Math.min(1.0, -accel_cmd * 0.75) * long_avail; 
    }
    
    return { steer: ctrl_steer, throttle: ctrl_throttle, brake: ctrl_brake, target: target };
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
    this.Iw = 1.2; // Wheel rotational inertia (kg*m^2)
    
    this.Fz0_F = (this.m * 9.81 * (this.b / this.wb)) / 2.0;
    this.Fz0_R = (this.m * 9.81 * (this.a / this.wb)) / 2.0;
    
    // F-32（2026-08-30）：MR 从 SIM_data.mrRefF/R（内核扫掠的真实值）取，
    // 旧代码只读 S_config.front.mr —— 该字段在 VEHICLE_PRESETS 中不存在，
    // 恒走 0.75/0.78 默认，Kw/Cw 与准静态求解口径脱节。
    const mrF = Math.abs(SIM_data && SIM_data.mrRefF) || Math.abs(S_config.front.mr || 0.75);
    const mrR = Math.abs(SIM_data && SIM_data.mrRefR) || Math.abs(S_config.rear.mr || 0.78);
    const kS_F = S_config.front ? S_config.front.kS : 60;
    const kS_R = S_config.rear ? S_config.rear.kS : 65;
    const cR_F = S_config.front ? S_config.front.cR : 3.5;
    const cR_R = S_config.rear ? S_config.rear.cR : 4.0;

    this.Kw_F = (kS_F * 1000) * (mrF * mrF);
    this.Kw_R = (kS_R * 1000) * (mrR * mrR);
    this.Cw_F = (cR_F * 1000) * (mrF * mrF);
    this.Cw_R = (cR_R * 1000) * (mrR * mrR);
    
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
      alpha: { FL: 0, FR: 0, RL: 0, RR: 0 }, 
      kappa: { FL: 0, FR: 0, RL: 0, RR: 0 },
      ax: 0, ay: 0, az: 0
    };
  }

  magicFormula(Fz, alpha, kappa, mu_peak = 1.35) {
    if (Fz <= 1.0) return { Fx: 0, Fy: 0 };
    const Cx = 1.65, Bx = 11.0, Ex = -0.15;
    const Cy = 1.45, By = 12.5, Ey = -0.20;
    const C_kappa = 160000.0, C_alpha = 110000.0;
    
    const s_x = (C_kappa * kappa) / Math.max(1, mu_peak * Fz);
    const s_y = (C_alpha * Math.tan(alpha)) / Math.max(1, mu_peak * Fz);
    const s = Math.max(1e-6, Math.hypot(s_x, s_y));
    
    const mu_x = mu_peak * Math.sin(Cx * Math.atan(Bx * s - Ex * (Bx * s - Math.atan(Bx * s))));
    const mu_y = mu_peak * Math.sin(Cy * Math.atan(By * s - Ey * (By * s - Math.atan(By * s))));
    
    const Fx = (s_x / s) * (mu_x * Fz);
    const Fy = -(s_y / s) * (mu_y * Fz); // Lateral cornering force opposes lateral slip velocity
    return { Fx, Fy };
  }

  step(ctrl, env, dt_sec) {
    const MAX_SUB_DT = 0.001; // 1000Hz Sub-stepping
    let t_remain = Math.min(0.05, dt_sec);
    const alpha_slope = env.grade || 0;
    const cosA = Math.cos(alpha_slope);
    const sinA = Math.sin(alpha_slope);
    
    while(t_remain > 0) {
      const dt = Math.min(MAX_SUB_DT, t_remain);
      const st = this.state;
      
      // 1. Suspension Corner Displacements (Pitch theta > 0: nose up; Roll phi > 0: right down, left up)
      // FL: x = -tF/2, y = +a;  FR: x = +tF/2, y = +a;
      // RL: x = -tR/2, y = -b;  RR: x = +tR/2, y = -b;
      const z_FL = st.Z + this.a * st.theta + (this.tF / 2.0) * st.phi;
      const z_FR = st.Z + this.a * st.theta - (this.tF / 2.0) * st.phi;
      const z_RL = st.Z - this.b * st.theta + (this.tR / 2.0) * st.phi;
      const z_RR = st.Z - this.b * st.theta - (this.tR / 2.0) * st.phi;
      
      const bump = env.bumpNoise || 0;
      const tr_FL = -(z_FL - bump);
      const tr_FR = -(z_FR - bump);
      const tr_RL = -(z_RL - bump);
      const tr_RR = -(z_RR - bump);
      
      // Suspension deflection velocities
      const dz_FL = st.w + this.a * st.q + (this.tF / 2.0) * st.p;
      const dz_FR = st.w + this.a * st.q - (this.tF / 2.0) * st.p;
      const dz_RL = st.w - this.b * st.q + (this.tR / 2.0) * st.p;
      const dz_RR = st.w - this.b * st.q - (this.tR / 2.0) * st.p;
      
      const dtr_FL = -dz_FL;
      const dtr_FR = -dz_FR;
      const dtr_RL = -dz_RL;
      const dtr_RR = -dz_RR;
      
      // 2. Normal Forces Fz with equilibrium static pre-load
      const Fz0_F_slope = this.Fz0_F * cosA;
      const Fz0_R_slope = this.Fz0_R * cosA;
      
      const Fz_FL = Math.max(10.0, Fz0_F_slope + this.Kw_F * tr_FL + ((this.S.front.damperMode==="table"&&this.S.front.vfTable)?vfDamper(this.S.front.vfTable,dtr_FL,this.Cw_F*dtr_FL):this.Cw_F*dtr_FL));
      const Fz_FR = Math.max(10.0, Fz0_F_slope + this.Kw_F * tr_FR + ((this.S.front.damperMode==="table"&&this.S.front.vfTable)?vfDamper(this.S.front.vfTable,dtr_FR,this.Cw_F*dtr_FR):this.Cw_F*dtr_FR));
      const Fz_RL = Math.max(10.0, Fz0_R_slope + this.Kw_R * tr_RL + ((this.S.rear.damperMode==="table"&&this.S.rear.vfTable)?vfDamper(this.S.rear.vfTable,dtr_RL,this.Cw_R*dtr_RL):this.Cw_R*dtr_RL));
      const Fz_RR = Math.max(10.0, Fz0_R_slope + this.Kw_R * tr_RR + ((this.S.rear.damperMode==="table"&&this.S.rear.vfTable)?vfDamper(this.S.rear.vfTable,dtr_RR,this.Cw_R*dtr_RR):this.Cw_R*dtr_RR));
      
      // Anti-roll bar torque (Opposes differential wheel displacement)
      const K_arb_F = (this.S.front && this.S.front.arb && this.S.front.arb.d > 0) ? 32000.0 : 0.0;
      const K_arb_R = (this.S.rear && this.S.rear.arb && this.S.rear.arb.d > 0) ? 22000.0 : 0.0;
      const F_arb_F = K_arb_F * (tr_FL - tr_FR);
      const F_arb_R = K_arb_R * (tr_RL - tr_RR);
      
      const F_susp = {
        FL: Math.max(10.0, Fz_FL + F_arb_F),
        FR: Math.max(10.0, Fz_FR - F_arb_F),
        RL: Math.max(10.0, Fz_RL + F_arb_R),
        RR: Math.max(10.0, Fz_RR - F_arb_R)
      };
      
      let SumFx_tire = 0.0, SumFy_tire = 0.0;
      let SumMz_tire = 0.0;
      
      const wheels = [
        { id: 'FL', x: -this.tF/2.0, y: this.a,  Re: this.ReF, axle: 'front', Fz: Fz_FL, tr: tr_FL },
        { id: 'FR', x: this.tF/2.0,  y: this.a,  Re: this.ReF, axle: 'front', Fz: Fz_FR, tr: tr_FR },
        { id: 'RL', x: -this.tR/2.0, y: -this.b, Re: this.ReR, axle: 'rear',  Fz: Fz_RL, tr: tr_RL },
        { id: 'RR', x: this.tR/2.0,  y: -this.b, Re: this.ReR, axle: 'rear',  Fz: Fz_RR, tr: tr_RR }
      ];
      
      for(const w of wheels) {
        // Wheel contact point velocities (+X right, +Y forward)
        const v_cp_x = st.v - st.r * w.y;
        const v_cp_y = st.u + st.r * w.x;
        
        // Steer angle delta (rad)
        const steer = (w.axle === 'front' ? (ctrl.steer * Math.PI / 180.0) : 0.0);
        
        // Transform velocities into wheel heading frame
        const v_tire_long = v_cp_x * Math.sin(steer) + v_cp_y * Math.cos(steer);
        const v_tire_lat  = v_cp_x * Math.cos(steer) - v_cp_y * Math.sin(steer);
        
        const alpha = Math.atan2(v_tire_lat, Math.max(0.5, Math.abs(v_tire_long)));
        const v_rot = st.omega[w.id] * w.Re;
        const kappa = (v_rot - v_tire_long) / Math.max(0.5, Math.abs(v_tire_long));
        
        // Pacejka tire forces (Fx_t: tractive/braking along tire rolling, Fy_t: cornering grip)
        const { Fx: Fx_t, Fy: Fy_t } = this.magicFormula(w.Fz, alpha, kappa);
        
        // Transform tire forces back to vehicle body frame (+X right, +Y forward)
        const Fx_body = Fx_t * Math.sin(steer) + Fy_t * Math.cos(steer);
        const Fy_body = Fx_t * Math.cos(steer) - Fy_t * Math.sin(steer);
        
        SumFx_tire += Fx_body;
        SumFy_tire += Fy_body;
        // Yaw moment around +Z (Up): r x F = w.x * Fy_body - w.y * Fx_body
        SumMz_tire += w.x * Fy_body - w.y * Fx_body;
        
        // Wheel spin acceleration
        const T_drive = (w.axle === 'rear' ? (ctrl.throttle * 480.0) : (ctrl.throttle * 120.0));
        const T_brake = (ctrl.brake * 1400.0) * (w.axle === 'front' ? 0.6 : 0.4);
        const sgn_w = st.omega[w.id] >= 0 ? 1.0 : -1.0;
        const T_net = T_drive - T_brake * sgn_w - Fx_t * w.Re;
        const d_omega = T_net / this.Iw;
        st.omega[w.id] += d_omega * dt;
        
        this.telemetry.Fz[w.id] = w.Fz;
        this.telemetry.Fx[w.id] = Fx_body;
        this.telemetry.Fy[w.id] = Fy_body;
        this.telemetry.tr[w.id] = w.tr;
        this.telemetry.kappa[w.id] = kappa;
        this.telemetry.alpha[w.id] = alpha;
      }
      
      // Gravity component and Aero
      const v2 = st.u * st.u;
      const F_drag = 0.5 * 1.225 * 0.35 * 1.8 * v2 * (st.u >= 0 ? 1.0 : -1.0);
      const F_down = 0.5 * 1.225 * 1.2 * 1.8 * v2;
      const F_gravity_slope = this.m * 9.81 * sinA;
      
      // Accelerations in body frame (+Y Forward, +X Right, +Z Up)
      const SumFy = SumFy_tire - F_gravity_slope - F_drag;
      const SumFx = SumFx_tire;
      const SumFz = (F_susp.FL + F_susp.FR + F_susp.RL + F_susp.RR) - (this.m * 9.81 * cosA + F_down);
      
      // Restoring Pitch moment: front pushing up (+), rear pushing up (-), gravity on CG pushes nose up (+)
      // F-30（2026-08-30）：制动阻力项符号修正——F_drag 是减速力，作用于质心高度
      // 时力矩方向为**点头**（减速→车头下沉），旧公式 `(F_gravity_slope + F_drag)*h_cg`
      // 把阻力也当作抬头项，刹车时俯仰符号错反。重力坡道分量（助力/减速都是沿
      // 坡方向的加速度源）仍按抬头计入。
      const SumM_pitch = (F_susp.FL + F_susp.FR) * this.a - (F_susp.RL + F_susp.RR) * this.b
                       + F_gravity_slope * this.h_cg - F_drag * this.h_cg;
      // Restoring Roll moment: left pushing up (+), right pushing up (-)
      // F-30（2026-08-30）：侧倾力臂按轴取 tF/tR——旧公式前后都乘 tF/2，
      // 混合胎布局（前窄后宽）后轴力臂被错算成前轴。
      const SumM_roll  = (F_susp.FL - F_susp.FR) * (this.tF / 2.0)
                       + (F_susp.RL - F_susp.RR) * (this.tR / 2.0)
                       - SumFx * this.h_cg;
      const SumM_yaw   = SumMz_tire;
      
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
      const cPsi = Math.cos(st.psi), sPsi = Math.sin(st.psi);
      const v_world_X = -st.u * sPsi + st.v * cPsi;
      const v_world_Y =  st.u * cPsi + st.v * sPsi;
      
      st.X += v_world_X * dt;
      st.Y += v_world_Y * dt;
      st.Z += st.w * dt;
      st.theta += st.q * dt;
      st.phi += st.p * dt;
      st.psi += st.r * dt;
      
      this.telemetry.ax = SumFy / (this.m * 9.81);
      this.telemetry.ay = -SumFx / (this.m * 9.81);
      this.telemetry.az = SumFz / (this.m * 9.81);
      
      t_remain -= dt;
    }
  }
}
window.VehicleDynamics15DOF = VehicleDynamics15DOF;

/* =====================================================================
   SLOPE STAGE: 60-FPS HIGH-PERFORMANCE AUTONOMOUS 15-DOF CLIMBING STAGE
   ===================================================================== */

/* =====================================================================
   SLOPE STAGE: 60-FPS ZERO-ALLOCATION AUTONOMOUS 15-DOF CLIMBING STAGE
   ===================================================================== */
const SLOPE_STAGE = {
  active: false,
  playing: true,
  autoPilot: true,
  grade: 0.15,
  speedKmh: 70.0,
  distTraveled: 0,
  camMode: "behind",
  camOrbit: { az: 0, elv: 0, distFactor: 1.0 },
  lastTime: 0,
  drag: null,
  cachedScene: null,
  rebuildCadence: 0,
  keys: { w: false, s: false, a: false, d: false, space: false }
};

/* G14（2026-08-31）：舞台渲染错误的「上屏」兜底。
   历史教训：三个舞台主循环都用 try/catch 包住渲染，异常只 console.error，
   画面却停在背景渐变上 = 用户看到的就是"一片空白/黑屏"，且控制台无人看。
   现在任何渲染异常都会把错误文字直接画到画布上，问题当场可见。 */
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
  } catch(_e){ /* 兜底的兜底：绝不因报错而二次抛错 */ }
}

const SLOPE_CAMS_CONFIG = {
  behind:  { dx: 0,    dy: -3800, dz: 950,  lookDy: 600,  lookDz: 300, fov: 1.6 },
  front:   { dx: 0,    dy: 3200,  dz: 700,  lookDy: -400, lookDz: 250, fov: 1.6 },
  side:    { dx: 3800, dy: 0,     dz: 650,  lookDy: 0,    lookDz: 300, fov: 1.6 },
  threeq:  { dx: 3000, dy: -3400, dz: 1400, lookDy: 400,  lookDz: 300, fov: 1.5 },
  cockpit: { dx: 0,    dy: -150,  dz: 620,  lookDy: 2500, lookDz: 350, fov: 1.3 }
};

function openSlopeStage(){
  const modal = document.getElementById("slopeStageModal");
  if(!modal) return;
  /* F-31（2026-08-30）：先关其它舞台，防止多 rAF 循环并行争写 SIM 轮端状态。 */
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
  
  /* G14（2026-08-31）F-61：初始化整段包 try/catch。
     此前 `new StraightPath(...)` 抛错时，弹窗已经 show 了、rAF 却没注册，
     于是画面停在一片背景色上——用户只看到"打开就是空白"，控制台才是真相。
     现在初始化失败会直接把异常画到画布上。 */
  try {
    const initSpeedMs = (SLOPE_STAGE.speedKmh * 1000) / 3600;
    window.physicsEngine = new VehicleDynamics15DOF(S, SIM, initSpeedMs);
    window.slopePilot = new UniversalAutoPilot(S);
    window.slopePilot.setPath(new StraightPath(initSpeedMs));
    window.slopePilot.active = true;

    requestAnimationFrame(slopeStageLoop);
  } catch(err) {
    console.error("Slope Stage Init Error:", err);
    SLOPE_STAGE.active = false;
    paintStageError("slopeCanvas", "爬坡舞台初始化失败", err);
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
  const dt = Math.min(0.033, (now - (SLOPE_STAGE.lastTime || now)) / 1000);
  SLOPE_STAGE.lastTime = now;

  const env = { 
    grade: Math.atan(SLOPE_STAGE.grade), 
    bumpNoise: SLOPE_STAGE.playing ? (Math.sin(SLOPE_STAGE.distTraveled * 0.008) * 0.006 + Math.cos(SLOPE_STAGE.distTraveled * 0.02) * 0.003) : 0 
  };
  
  // 1. 全自动巡航与居中保持 (Autonomous Drive)
  let ctrl = { steer: 0, throttle: 0, brake: 0 };
  const targetSpeedMs = (SLOPE_STAGE.speedKmh * 1000) / 3600;

  const isUserManual = (SLOPE_STAGE.keys.w || SLOPE_STAGE.keys.s || SLOPE_STAGE.keys.a || SLOPE_STAGE.keys.d || SLOPE_STAGE.keys.space);
  
  if(isUserManual) {
    SLOPE_STAGE.autoPilot = false;
    if (window.slopePilot) window.slopePilot.active = false;
    if(SLOPE_STAGE.keys.a) ctrl.steer -= 8;
    if(SLOPE_STAGE.keys.d) ctrl.steer += 8;
    if(SLOPE_STAGE.keys.w) ctrl.throttle = 1.0;
    if(SLOPE_STAGE.keys.s || SLOPE_STAGE.keys.space) ctrl.brake = 1.0;
  } else {
    // Universal Auto Pilot Integration
    SLOPE_STAGE.autoPilot = true;
    if (window.slopePilot && window.physicsEngine) {
      window.slopePilot.active = true;
      if (window.slopePilot.path) {
        window.slopePilot.path.targetSpeed = targetSpeedMs;
      } else {
        window.slopePilot.setPath(new StraightPath(targetSpeedMs));
      }
      ctrl = window.slopePilot.drive(window.physicsEngine.state, dt);
    }
  }

  if(SLOPE_STAGE.playing && window.physicsEngine) {
    window.physicsEngine.step(ctrl, env, dt);
    SLOPE_STAGE.distTraveled += Math.max(0, window.physicsEngine.state.u) * dt * 1000;
  }

  try {
    const st = window.physicsEngine.state;
    const tel = window.physicsEngine.telemetry;
    
    // 2. 悬架多体杆系运动学更新 (每 3 帧更新一次几何骨架，极度轻量)
    SLOPE_STAGE.rebuildCadence++;
    if(SLOPE_STAGE.rebuildCadence % 3 === 0 || !SLOPE_STAGE.cachedScene) {
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

      /* G13（2026-08-31）：z0F/z0R 此前是未定义自由变量（R-0830 修 skidpad/circuit
         时补了防御式定义，唯独 slope 漏了）→ 首帧 ReferenceError 被 catch 吞掉 →
         renderSlopeScene 永不执行 = 打开即黑屏。与 skidpad/circuit 同款修法。 */
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
    
    /* F-35（2026-08-30）：轮胎转角改为真积分——旧 `omega*(now/1000)` 在 ω 变化
       时角度回跳（每次都是"从 t=0 累计"的伪转角）。用 window._tireSpinAngles
       按上一帧 dt 累加（与 circuitStageLoop 的积分式一致）。 */
    const lastSpinS = window._tireSpinAngles || {FL:0,FR:0,RL:0,RR:0};
    const spinDtS = Math.max(0, Math.min(0.033, (now - (SLOPE_STAGE.lastDt || now)) / 1000));
    SLOPE_STAGE.lastDt = now;
    window._tireSpinAngles = {
      FL: lastSpinS.FL + st.omega.FL * spinDtS,
      FR: lastSpinS.FR + st.omega.FR * spinDtS,
      RL: lastSpinS.RL + st.omega.RL * spinDtS,
      RR: lastSpinS.RR + st.omega.RR * spinDtS
    };
    
    const alpha = env.grade;
    renderSlopeScene(alpha, st);

    const F_gx = window.physicsEngine.m * 9.81 * Math.sin(alpha);
    updateSlopeHUD(st.u, alpha, F_gx, tel);
  } catch(err) {
    console.error("Physics Loop Error:", err);
    paintStageError("slopeCanvas", "爬坡舞台渲染失败", err);
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

  // Background Sky / Atmosphere
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, "#080c14");
  skyGrad.addColorStop(0.55, "#101622");
  skyGrad.addColorStop(1, "#05070a");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Road Orientation vectors (Slope angle alpha: pitch up around X)
  const cosA = Math.cos(alpha), sinA = Math.sin(alpha);
  const u_road = [0, cosA, sinA];    // Road forward vector (+Y, +Z)
  const n_road = [0, -sinA, cosA];   // Road normal vector (Up)
  const t_road = [1, 0, 0];          // Road lateral vector (Right)

  // Combined 3D Projection Matrix (Zero GC Allocation)
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

  // Camera Eye and LookTarget relative to road plane
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

  // Direct fast projection function (Zero Object Allocation)
  const projFast = (x, y, z) => {
    const zc = m31*x + m32*y + m33*z + v0z;
    if(zc < 50) return null;
    const f = fovDist / zc;
    return [
      halfW + (m11*x + m12*y + m13*z + v0x) * f,
      halfH - (m21*x + m22*y + m23*z + v0y) * f
    ];
  };

  // 1. Draw 3D Dynamic Slope Road & Curbs
  const roadHalfW = 4200;
  const roadNearY = -15000, roadFarY = 90000;
  const roadGridStep = 3000;
  const animOffset = (SLOPE_STAGE.distTraveled % roadGridStep);

  const pL_near = projFast(-roadHalfW, roadNearY, 0), pR_near = projFast(roadHalfW, roadNearY, 0);
  const pR_far  = projFast(roadHalfW, roadFarY, 0),  pL_far  = projFast(-roadHalfW, roadFarY, 0);

  if(pL_near && pR_near && pR_far && pL_far){
    ctx.beginPath();
    ctx.moveTo(pL_near[0], pL_near[1]);
    ctx.lineTo(pR_near[0], pR_near[1]);
    ctx.lineTo(pR_far[0], pR_far[1]);
    ctx.lineTo(pL_far[0], pL_far[1]);
    ctx.closePath();
    const roadGrad = ctx.createLinearGradient(halfW, h, halfW, 0);
    roadGrad.addColorStop(0, "#1c222d");
    roadGrad.addColorStop(0.6, "#141922");
    roadGrad.addColorStop(1, "#0d1117");
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

    // White Center Dash Line
    const d1 = projFast(0, curY + 600, 2);
    const d2 = projFast(0, curY + 2200, 2);
    if(d1 && d2){
      ctx.beginPath(); ctx.moveTo(d1[0], d1[1]); ctx.lineTo(d2[0], d2[1]);
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3; ctx.stroke();
    }
  }

  // 2. Soft Contact Ground Shadow under the 4 wheels and chassis
  const shadowW = Math.max(1200, (S.front.tire.R || 300) * 3);
  const shadowL = (S.wb || 2600) + 800;
  
  const cX_shad = (st && st.X ? st.X : 0) * 1000;
  const cY_shad = Math.cos(st && st.psi ? st.psi : 0);
  const sY_shad = Math.sin(st && st.psi ? st.psi : 0);

  const projShad = (lx, ly) => {
    const rx = cY_shad * lx - sY_shad * ly + cX_shad;
    const ry = sY_shad * lx + cY_shad * ly; // Y is statically 0 relative to car frame
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill();
  }

  // 3. Render 3D Full Chassis Multibody Scene (Ultra-fast cached draw)
  let sc;
  try {
    sc = SLOPE_STAGE.cachedScene || buildScenePRO();
  } catch(e) {
    console.error("buildScenePRO error:", e);
    sc = [];
  }
  
  // Transform car local coordinates to world coordinates before projection
  const cx = (st && st.X ? st.X : 0) * 1000;
  const cy = 0; // The road slides backward relative to the car
  
  // Calculate static Z offset so the wheels sit exactly on the road surface
  const tireR = S.front && S.front.tire && S.front.tire.R ? S.front.tire.R : 330;
  const wcZ = S.front && S.front.hp && S.front.hp.WC ? S.front.hp.WC[2] : 300;
  const staticZOffset = tireR - wcZ;
  
  const cz = (st && st.Z ? st.Z : 0) * 1000 + staticZOffset;

  const cP = Math.cos(st && st.theta ? st.theta : 0), sP = Math.sin(st && st.theta ? st.theta : 0);
  const cR = Math.cos(st && st.phi ? st.phi : 0), sR = Math.sin(st && st.phi ? st.phi : 0);
  const cY = Math.cos(st && st.psi ? st.psi : 0), sY = Math.sin(st && st.psi ? st.psi : 0);

  // Yaw-Pitch-Roll rotation matrix
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

function updateSlopeHUD(speedMs, alpha, F_gx, tel){
  const speedKmh = Math.max(0, speedMs * 3.6);
  const gradePct = SLOPE_STAGE.grade * 100;
  const angleDeg = alpha * (180 / Math.PI);
  
  const elSpeed = document.getElementById("slopeHudSpeed");
  if(elSpeed) elSpeed.textContent = `${speedKmh.toFixed(1)} km/h (${speedMs.toFixed(1)} m/s)`;
  
  const elAngle = document.getElementById("slopeHudAngle");
  if(elAngle) elAngle.textContent = `${angleDeg.toFixed(2)}° (Grade ${gradePct.toFixed(1)}%)`;
  
  const elGx = document.getElementById("slopeHudGx");
  if(elGx) elGx.textContent = `-${Math.sin(alpha).toFixed(2)} g (${Math.round(F_gx)} N 阻力)`;
  
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
  if(elSquat) elSquat.textContent = `${squatR > 0 ? '+' : ''}${squatR.toFixed(1)} mm`;
  
  const elLift = document.getElementById("slopeHudLift");
  if(elLift) elLift.textContent = `${squatF > 0 ? '+' : ''}${squatF.toFixed(1)} mm`;
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

  const gradeSlider = document.getElementById("slopeGradeSlider");
  if(gradeSlider) {
    gradeSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SLOPE_STAGE.grade = v / 100;
      document.getElementById("slopeGradeVal").textContent = v + "%";
    };
  }

  const speedSlider = document.getElementById("slopeSpeedSlider");
  if(speedSlider) {
    speedSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      SLOPE_STAGE.speedKmh = v;
      document.getElementById("slopeSpeedVal").textContent = v + " km/h";
    };
  }

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
      SLOPE_STAGE.camOrbit.elv = Math.max(-0.6, Math.min(0.6, SLOPE_STAGE.drag.elv0 - dy * 0.006));
    });

    window.addEventListener("mouseup", () => {
      SLOPE_STAGE.drag = null;
    });

    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.08 : 0.92;
      SLOPE_STAGE.camOrbit.distFactor = Math.max(0.4, Math.min(2.5, SLOPE_STAGE.camOrbit.distFactor * delta));
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

const evalBtn = document.getElementById("evalModalBtn");
if(evalBtn) evalBtn.onclick = openSuspensionEvaluation;
const evalCloseBtn = document.getElementById("evalCloseBtn");
if(evalCloseBtn) evalCloseBtn.onclick = () => document.getElementById("suspEvalModal").classList.remove("show");

initSlopeStageEvents();
initSkidpadStageEvents();
initCircuitStageEvents();

hpLoad();
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
  if(ENG.ok) return;
  engineConnect().then(()=>{
    if(!ENG.ok && retries > 0) setTimeout(()=>tryEngineConnect(retries-1), 1200);
  });
})(5);

/* =====================================================================
   CIRCUIT STAGE: AUTONOMOUS GRAND PRIX
   ===================================================================== */
const CIRCUIT_STAGE = {
  camMode: "behind",
  active: false,
  playing: false,
  autoPilot: true,
  path: null,
  cachedScene: null,
  rebuildCadence: 0,
  camOrbit: { az: -0.5, elv: 0.3, distFactor: 1.0 },
  keys: { w:false, a:false, s:false, d:false, space:false }
};

function openCircuitStage() {
  const modal = document.getElementById("circuitStageModal");
  if(!modal) return;
  
  if (window.SLOPE_STAGE && SLOPE_STAGE.active) closeSlopeStage();
  if (window.SKIDPAD_STAGE && SKIDPAD_STAGE.active) closeSkidpadStage();

  /* G14（2026-08-31）F-61：与 openSlopeStage 同款防御。buildShanghaiCircuit()
     内部会 new CircuitPath，初始化失败时必须把错误画到画布上。 */
  try {
    CIRCUIT_STAGE.playing = true;
    CIRCUIT_STAGE.path = buildShanghaiCircuit();
    CIRCUIT_STAGE.cachedScene = null;
    CIRCUIT_STAGE.rebuildCadence = 0;

    const startState = {
      X: 0, Y: 0, Z: 0.0,
      phi: 0, theta: 0, psi: 0,
      u: 0.1, v: 0, w: 0,
      p: 0, q: 0, r: 0,
      z: {FL:0,FR:0,RL:0,RR:0},
      dz: {FL:0,FR:0,RL:0,RR:0},
      omega: {FL:0,FR:0,RL:0,RR:0}
    };

    window.physicsEngine = new VehicleDynamics15DOF(S, SIM, 0.1);
    Object.assign(window.physicsEngine.state, startState);

    window.circuitPilot = new UniversalAutoPilot(S);
    window.circuitPilot.setPath(CIRCUIT_STAGE.path);
    window.circuitPilot.active = true;

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
    };
    cv.onkeyup = e => {
      if(e.key==='w'||e.key==='W') CIRCUIT_STAGE.keys.w = false;
      if(e.key==='s'||e.key==='S') CIRCUIT_STAGE.keys.s = false;
      if(e.key==='a'||e.key==='A') CIRCUIT_STAGE.keys.a = false;
      if(e.key==='d'||e.key==='D') CIRCUIT_STAGE.keys.d = false;
      if(e.key===' ') CIRCUIT_STAGE.keys.space = false;
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
    if(isUserManual) {
      if(window.circuitPilot) window.circuitPilot.active = false;
      if(CIRCUIT_STAGE.keys.a) ctrl.steer -= 8;
      if(CIRCUIT_STAGE.keys.d) ctrl.steer += 8;
      if(CIRCUIT_STAGE.keys.w) ctrl.throttle = 1.0;
      if(CIRCUIT_STAGE.keys.s || CIRCUIT_STAGE.keys.space) ctrl.brake = 1.0;
      
      const pt = CIRCUIT_STAGE.path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
      e_y = pt.crossTrackError;
      v_tar = pt.targetSpeed;
      
      // 手动驾驶冲出赛道脱轨保险：横向偏离 > 6.0m 则自动在安全前置点重置
      if(Math.abs(e_y) > 6.2) {
        respawnCircuitVehicle(eng, CIRCUIT_STAGE.path, pt.idx || 0);
        e_y = 0;
      }
    } else {
      if(window.circuitPilot) {
        window.circuitPilot.active = true;
        ctrl = window.circuitPilot.drive(eng.state, dt);
        const pt = CIRCUIT_STAGE.path.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
        e_y = pt.crossTrackError;
        v_tar = pt.targetSpeed;
        
        // 🔒 AUTO-RESPAWN INSURANCE: 脱轨保险机制（偏离 > 5.8m 自动回退 40 米重新启动）
        if (Math.abs(e_y) > 5.8) {
          respawnCircuitVehicle(eng, CIRCUIT_STAGE.path, pt.idx || 0);
          e_y = 0;
        }
      }
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
    
    // HUD Update
    const tgt = (ctrl && ctrl.target) ? ctrl.target : (CIRCUIT_STAGE.path ? CIRCUIT_STAGE.path.getLookahead(st.X, st.Y, st.u) : null);
    
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
    if(elErr) elErr.textContent = Math.abs(e_y).toFixed(2) + " m";
    
    if(tgt) {
      const elTurn = document.getElementById("c_hud_turn");
      if(elTurn) elTurn.textContent = tgt.turnZh || tgt.turn || "主赛道";
      const elBadge = document.getElementById("c_hud_corner_badge");
      if(elBadge) elBadge.textContent = "🏁 [S" + (tgt.sector || 1) + "] " + (tgt.turnZh || tgt.turn || "主赛道");
      
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
        if(tgt.isDRS) {
          elDRSBadge.style.background = "#238636";
          elDRSBadge.textContent = "🟢 DRS 开启";
        } else {
          elDRSBadge.style.background = "#30363d";
          elDRSBadge.textContent = "⚪ DRS 关闭";
        }
      }
    }
    
  } catch (e) {
    console.error("Circuit Loop Error:", e);
    paintStageError("circuitCanvas", "赛道舞台渲染失败", e);
  }

  requestAnimationFrame(circuitStageLoop);
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

  // Deep Sky Gradient
  const bgGrad = ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, Math.max(w, h));
  bgGrad.addColorStop(0, "#0c131f");
  bgGrad.addColorStop(1, "#03060a");
  ctx.fillStyle = bgGrad;
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

  // 1. Draw 3D Continuous Asphalt Surface, Runoff, Kerbs & Walls
  const path = CIRCUIT_STAGE.path;
  if (path && path.pts) {
    const hw = 7000; // 7.0m half-width (14.0m wide Grand Prix track)
    const N = path.pts.length;
    
    // Step size for drawing performance (skip distant details if dense)
    const step = 1;
    for (let i = 0; i < N; i += step) {
      const p1 = path.pts[i];
      const p2 = path.pts[(i + step) % N];
      
      const p1x_mm = p1.x * 1000, p1y_mm = p1.y * 1000;
      const p2x_mm = p2.x * 1000, p2y_mm = p2.y * 1000;
      
      // Distance culling from camera to maximize silky 60FPS
      const distToCamSq = (p1x_mm - E_x)**2 + (p1y_mm - E_y)**2;
      if (distToCamSq > 500000**2) continue; // 500m view distance
      
      const pl1 = projFast(p1x_mm - p1.nx * hw, p1y_mm - p1.ny * hw, 0);
      const pr1 = projFast(p1x_mm + p1.nx * hw, p1y_mm + p1.ny * hw, 0);
      const pr2 = projFast(p2x_mm + p2.nx * hw, p2y_mm + p2.ny * hw, 0);
      const pl2 = projFast(p2x_mm - p2.nx * hw, p2y_mm - p2.ny * hw, 0);
      
      if(pl1 && pr1 && pr2 && pl2) {
        // Runoff Apron / Gravel Trap Outside Corners
        if (p1.runoff === "gravel") {
          const gr_hw = hw + 10000; // 10m extra gravel width
          const gpl1 = projFast(p1x_mm - p1.nx * gr_hw, p1y_mm - p1.ny * gr_hw, -100);
          const gpr1 = projFast(p1x_mm + p1.nx * gr_hw, p1y_mm + p1.ny * gr_hw, -100);
          const gpr2 = projFast(p2x_mm + p2.nx * gr_hw, p2y_mm + p2.ny * gr_hw, -100);
          const gpl2 = projFast(p2x_mm - p2.nx * gr_hw, p2y_mm - p2.ny * gr_hw, -100);
          if (gpl1 && gpr1 && gpr2 && gpl2) {
            ctx.beginPath();
            ctx.moveTo(gpl1[0], gpl1[1]); ctx.lineTo(gpr1[0], gpr1[1]);
            ctx.lineTo(gpr2[0], gpr2[1]); ctx.lineTo(gpl2[0], gpl2[1]);
            ctx.closePath();
            ctx.fillStyle = "#c29b62"; // Textured sand gravel trap
            ctx.fill();
          }
        } else if (p1.runoff === "asphalt_stripes") {
          const run_hw = hw + 8000; // 8m painted asphalt runoff
          const rpl1 = projFast(p1x_mm - p1.nx * run_hw, p1y_mm - p1.ny * run_hw, 0);
          const rpr1 = projFast(p1x_mm + p1.nx * run_hw, p1y_mm + p1.ny * run_hw, 0);
          const rpr2 = projFast(p2x_mm + p2.nx * run_hw, p2y_mm + p2.ny * run_hw, 0);
          const rpl2 = projFast(p2x_mm - p2.nx * run_hw, p2y_mm - p2.ny * run_hw, 0);
          if (rpl1 && rpr1 && rpr2 && rpl2) {
            ctx.beginPath();
            ctx.moveTo(rpl1[0], rpl1[1]); ctx.lineTo(rpr1[0], rpr1[1]);
            ctx.lineTo(rpr2[0], rpr2[1]); ctx.lineTo(rpl2[0], rpl2[1]);
            ctx.closePath();
            ctx.fillStyle = (i % 6 < 3) ? "#1f4068" : "#e63946"; // FIA Blue/Red Runoff
            ctx.fill();
          }
        }
        
        // Asphalt Ribbon
        ctx.beginPath();
        ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(pr1[0], pr1[1]);
        ctx.lineTo(pr2[0], pr2[1]); ctx.lineTo(pl2[0], pl2[1]);
        ctx.closePath();
        ctx.fillStyle = "#181e26"; // Dark Asphalt
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Dynamic Rubber Skid Mark Grooves on racing line
        const rk1_l = projFast(p1x_mm - p1.nx * 1800, p1y_mm - p1.ny * 1800, 2);
        const rk2_l = projFast(p2x_mm - p2.nx * 1800, p2y_mm - p2.ny * 1800, 2);
        const rk1_r = projFast(p1x_mm + p1.nx * 1800, p1y_mm + p1.ny * 1800, 2);
        const rk2_r = projFast(p2x_mm + p2.nx * 1800, p2y_mm + p2.ny * 1800, 2);
        if(rk1_l && rk2_l) {
          ctx.beginPath(); ctx.moveTo(rk1_l[0], rk1_l[1]); ctx.lineTo(rk2_l[0], rk2_l[1]);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.28)"; ctx.lineWidth = 4; ctx.stroke();
        }
        if(rk1_r && rk2_r) {
          ctx.beginPath(); ctx.moveTo(rk1_r[0], rk1_r[1]); ctx.lineTo(rk2_r[0], rk2_r[1]);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.28)"; ctx.lineWidth = 4; ctx.stroke();
        }
        
        // Red/White FIA Kerbs (with 3D bevel)
        const hasKerb = p1.kerbSide || (Math.abs(p1.curvature) > 0.008);
        if (hasKerb) {
          const kerbCol = (i % 6 < 3) ? "#e63946" : "#f8f9fa";
          const kSide = p1.kerbSide || (p1.curvature > 0 ? "right" : "left");
          
          if (kSide === "left" || kSide === "both") {
            const kl1 = projFast(p1x_mm - p1.nx * (hw + 1400), p1y_mm - p1.ny * (hw + 1400), 60);
            const kl2 = projFast(p2x_mm - p2.nx * (hw + 1400), p2y_mm - p2.ny * (hw + 1400), 60);
            if(kl1 && kl2) {
              ctx.beginPath();
              ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(kl1[0], kl1[1]);
              ctx.lineTo(kl2[0], kl2[1]); ctx.lineTo(pl2[0], pl2[1]);
              ctx.closePath();
              ctx.fillStyle = kerbCol; ctx.fill();
            }
          }
          if (kSide === "right" || kSide === "both") {
            const kr1 = projFast(p1x_mm + p1.nx * (hw + 1400), p1y_mm + p1.ny * (hw + 1400), 60);
            const kr2 = projFast(p2x_mm + p2.nx * (hw + 1400), p2y_mm + p2.ny * (hw + 1400), 60);
            if(kr1 && kr2) {
              ctx.beginPath();
              ctx.moveTo(pr1[0], pr1[1]); ctx.lineTo(kr1[0], kr1[1]);
              ctx.lineTo(kr2[0], kr2[1]); ctx.lineTo(pr2[0], pr2[1]);
              ctx.closePath();
              ctx.fillStyle = kerbCol; ctx.fill();
            }
          }
        }
        
        // 3D Boundary Barrier Walls
        const wallH = 1300; // 1.3m concrete armco wall
        const pl1_top = projFast(p1x_mm - p1.nx * hw, p1y_mm - p1.ny * hw, wallH);
        const pl2_top = projFast(p2x_mm - p2.nx * hw, p2y_mm - p2.ny * hw, wallH);
        const pr1_top = projFast(p1x_mm + p1.nx * hw, p1y_mm + p1.ny * hw, wallH);
        const pr2_top = projFast(p2x_mm + p2.nx * hw, p2y_mm + p2.ny * hw, wallH);
        
        ctx.fillStyle = (i % 6 < 3) ? "rgba(35, 75, 140, 0.95)" : "rgba(235, 235, 235, 0.95)";
        if(pl1_top && pl2_top && pl1 && pl2) {
          ctx.beginPath();
          ctx.moveTo(pl1[0], pl1[1]); ctx.lineTo(pl2[0], pl2[1]);
          ctx.lineTo(pl2_top[0], pl2_top[1]); ctx.lineTo(pl1_top[0], pl1_top[1]);
          ctx.fill();
          ctx.strokeStyle = "#111"; ctx.lineWidth = 1; ctx.stroke();
        }
        if(pr1_top && pr2_top && pr1 && pr2) {
          ctx.beginPath();
          ctx.moveTo(pr1[0], pr1[1]); ctx.lineTo(pr2[0], pr2[1]);
          ctx.lineTo(pr2_top[0], pr2_top[1]); ctx.lineTo(pr1_top[0], pr1_top[1]);
          ctx.fill();
          ctx.strokeStyle = "#111"; ctx.lineWidth = 1; ctx.stroke();
        }
        
        // Center White Dashed Guide
        if(i % 6 < 3) {
          const pc1 = projFast(p1x_mm, p1y_mm, 2);
          const pc2 = projFast(p2x_mm, p2y_mm, 2);
          if(pc1 && pc2) {
            ctx.beginPath(); ctx.moveTo(pc1[0], pc1[1]); ctx.lineTo(pc2[0], pc2[1]);
            ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 3; ctx.stroke();
          }
        }
        
        // 3D Braking Distance Boards (150m, 100m, 50m)
        if (p1.brakingBoard) {
          const bpx = p1x_mm + p1.nx * (hw + 3500);
          const bpy = p1y_mm + p1.ny * (hw + 3500);
          const b_base = projFast(bpx, bpy, 0);
          const b_top = projFast(bpx, bpy, 2400);
          if(b_base && b_top) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(b_base[0], b_base[1]); ctx.lineTo(b_top[0], b_top[1]);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke();
            
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(b_top[0] - 18, b_top[1] - 14, 36, 20);
            ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
            ctx.strokeRect(b_top[0] - 18, b_top[1] - 14, 36, 20);
            
            ctx.fillStyle = "#000000";
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(p1.brakingBoard, b_top[0], b_top[1] - 4);
            ctx.restore();
          }
        }
        
        // 3D Turn Marker Boards ("T1", "T6", "T14", etc.)
        if (p1.turn && p1.turn.startsWith("T") && !p1.turn.includes("-Entry") && i % 12 === 0) {
          const tpx = p1x_mm - p1.nx * (hw + 3500);
          const tpy = p1y_mm - p1.ny * (hw + 3500);
          const t_base = projFast(tpx, tpy, 0);
          const t_top = projFast(tpx, tpy, 2200);
          if(t_base && t_top) {
            ctx.save();
            ctx.fillStyle = "#facc15"; // Yellow Turn Badge
            ctx.fillRect(t_top[0] - 16, t_top[1] - 14, 32, 18);
            ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
            ctx.strokeRect(t_top[0] - 16, t_top[1] - 14, 32, 18);
            ctx.fillStyle = "#000";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(p1.turn, t_top[0], t_top[1] - 5);
            ctx.restore();
          }
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
          ctx.fillStyle = "#e63946"; ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  // 2. Soft Contact Ground Shadow under the car
  const shadowW = Math.max(1200, (S.front.tire.R || 300) * 3);
  const shadowL = (S.wb || 2600) + 800;
  const projShad = (lx, ly) => {
    const rx = cY * lx - sY * ly + carX_mm;
    const ry = sY * lx + cY * ly + carY_mm;
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
    const mmW = 320, mmH = 260;
    const mmPad = 20;
    const mx = w - mmW - mmPad, my = h - mmH - mmPad;
    
    // Map card background with glassmorphism
    ctx.save();
    ctx.fillStyle = "rgba(10, 14, 23, 0.85)";
    ctx.strokeStyle = "#30363d";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mmW, mmH, 10);
    else ctx.rect(mx, my, mmW, mmH);
    ctx.fill(); ctx.stroke();
    
    // Header title
    ctx.fillStyle = "#58a6ff";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📍 上海国际赛车场 (SIC 5.45km)", mx + 12, my + 18);
    
    // Track bounds calculation
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(let pt of path.pts) {
      if(pt.x < minX) minX = pt.x; if(pt.x > maxX) maxX = pt.x;
      if(pt.y < minY) minY = pt.y; if(pt.y > maxY) maxY = pt.y;
    }
    const tW = maxX - minX, tH = maxY - minY;
    const scale = (Math.min(mmW, mmH) - 60) / Math.max(tW, tH);
    const cX = minX + tW/2, cY = minY + tH/2;
    
    const trX = (x) => mx + mmW/2 + (x - cX) * scale;
    const trY = (y) => my + mmH/2 + 8 - (y - cY) * scale; // Y is flipped in canvas
    
    // Draw Sector Colored Segments
    for(let i = 0; i < path.pts.length; i++) {
      const p1 = path.pts[i];
      const p2 = path.pts[(i + 1) % path.pts.length];
      ctx.beginPath();
      ctx.moveTo(trX(p1.x), trY(p1.y));
      ctx.lineTo(trX(p2.x), trY(p2.y));
      ctx.strokeStyle = (p1.sector === 1) ? "#00f2fe" : (p1.sector === 2) ? "#ffb703" : "#bc8cff";
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    
    // Draw 16 Official Turn Markers (T1 ~ T16) on Mini-Map
    const turnAnchors = [
      {no:"1", x:235, y:580}, {no:"2", x:360, y:545}, {no:"3", x:185, y:440}, {no:"4", x:285, y:370},
      {no:"5", x:500, y:380}, {no:"6", x:815, y:205}, {no:"7", x:545, y:280}, {no:"8", x:430, y:155},
      {no:"9", x:465, y:-30}, {no:"10", x:420, y:-130}, {no:"11", x:785, y:-95}, {no:"12", x:810, y:-40},
      {no:"13", x:935, y:-145}, {no:"14", x:-625, y:-245}, {no:"15", x:-420, y:-200}, {no:"16", x:-45, y:-130}
    ];
    for(let ta of turnAnchors) {
      const px = trX(ta.x), py = trY(ta.y);
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, 2*Math.PI);
      ctx.fillStyle = "#1e293b"; ctx.fill();
      ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ta.no, px, py);
    }
    
    // Draw Start/Finish Flag
    const pStart = path.pts[0];
    if(pStart) {
      const sx = trX(pStart.x), sy = trY(pStart.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, 2*Math.PI);
      ctx.fillStyle = "#ef4444"; ctx.fill();
    }
    
    // Draw Live Car Position & Heading Cone
    const carPx = trX(carX_mm / 1000);
    const carPy = trY(carY_mm / 1000);
    
    ctx.save();
    ctx.translate(carPx, carPy);
    ctx.rotate(-carYaw + Math.PI); // canvas heading rotation
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(-5, -6); ctx.lineTo(0, -4); ctx.lineTo(5, -6);
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

