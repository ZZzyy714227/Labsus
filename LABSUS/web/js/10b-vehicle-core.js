/* ═══════════════════════════════════════════════════════════════════════════
   10b-vehicle-core.js —— 15-DOF 车辆物理与自动驾驶内核（P2 拆分，2026-10-31）

   从 11-stages.js 抽出（原 L95–L1440）。这里只有**数值层**：
     · UniversalAutoPilot   —— 曲率前馈 + Stanley 横向 + G-G 摩擦圆纵向协调
     · WHEEL_IDX            —— 轮位索引常量（FL/FR/RL/RR）
     · applyWallCollision   —— 纯函数：车-墙冲量碰撞（法向反弹 + 切向摩擦 + 防卡死）
     · stageRoadIso         —— ISO 8608 路面激励入口（三处舞台共用）
     · VehicleDynamics15DOF —— 整车积分内核（「15-DOF」是历史命名，口径见
                               INTENTIONAL_DIFFERENCES.md）

   为什么拆（P2，2026-10-31）：
     这 1350 行只依赖 S / SIM 这类全局配置，**完全不碰 DOM / Canvas**；而
     11-stages.js 剩下的 5000 行全是舞台渲染、HUD、事件与场景编排。把两者
     放在同一文件里，任何 HUD 改动都要在物理代码旁边编辑，任何物理审计
     都必须先造一套 DOM 沙箱。

   兼容面（刻意保持零改动）：
     · 仍以经典 <script> 加载，不引入 ES module / 构建步骤；
     · 仍挂全局符号（VehicleDynamics15DOF 显式挂 window，其余为顶层声明），
       舞台层与测试的调用代码一行不改；
     · **加载顺序必须在 11-stages.js 之前**：舞台层在顶层就引用
       VehicleDynamics15DOF（TDZ 检查见 web/test/stage_boot_check.js）。

   下一步（未做）：把 SLOPE/SKIDPAD/CIRCUIT 三套 stage 的 DOM 与绘制进一步
   抽成 adapter，让场景新增不必触碰积分器。
   ═══════════════════════════════════════════════════════════════════════════ */

class UniversalAutoPilot {
  constructor(S_config) {
    this.wb = (S_config.wb || 2600) / 1000.0; 
    /* M5（2026-09-20）：与 VehicleDynamics15DOF 同源就地推导 CG→前轴距离。
       旧值 wb*0.46 源自前后对调的准静态口径（见 VehicleDynamics15DOF 构造器注），
       使前轴参考点系统性偏移；G22 当时只在错值之间对齐（0.48→0.46），
       本次连根修正。缺 mS 的测试桩回落 0.46。 */
    {
      const _mf = (S_config.front && S_config.front.mS) || 0;
      const _mr = (S_config.rear && S_config.rear.mS) || 0;
      this.a = (_mf + _mr) > 0 ? this.wb * (_mr / (_mf + _mr)) : this.wb * 0.46;
    }
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

    /* 线 B 后续 · 驾驶员模型升级（2026-11-19）：**横摆/侧滑稳定反馈**。
       动机：开启载荷转移物理（pitchInertia/rollInertia）后，原控制器把车开转
       （峰值侧偏角 87°、`test_lap_15dof` 4/23）——它只有位置/航向反馈，没有
       "车正在转"的感知：后轴制动卸载 ⇒ 过度转向 ⇒ 无反馈 ⇒ 螺旋发散。
       补两项（都是真实车手的本能反应，也只读 state，不碰物理）：
         ① 横摆角速度闭环：r_target = u·κ（曲率前馈给出的期望 yaw rate），
            偏差 r_target − r 直接加到转角上（等效 ESC 的 yaw-rate feedback）
         ② 质心侧滑角抑制：β 增大时反打，并在 β 过大时**松制动**（后轴卸载时
            继续重刹会加速失稳——这是"松刹车救车"的模型化）
       系数保守起步（kYaw=0.10 deg per (rad/s)，kBeta=25 deg/rad），
       可用 `pilot.kYaw/kBeta` 覆盖以便扫参。 */
    const _r = (typeof state.r === 'number' && isFinite(state.r)) ? state.r : 0;
    const _vv = (typeof state.v === 'number' && isFinite(state.v)) ? state.v : 0;
    const _rTarget = u * (target.targetCurvature || 0);   /* κ>0=左弯，实测负转角→正 r，故同号 */
    const _beta = Math.atan2(_vv, Math.max(3.0, u));            // 质心侧滑角（rad）
    const kYaw = (typeof this.kYaw === 'number' && isFinite(this.kYaw)) ? this.kYaw : 0.04;
    const kBeta = (typeof this.kBeta === 'number' && isFinite(this.kBeta)) ? this.kBeta : 0.0;
    const yaw_deg = -(180.0 / Math.PI) * kYaw * (_rTarget - _r);   /* 左弯 r_err>0 ⇒ 需更负转角 */
    /* β 只在**超出正常不足转向区**（>3°）时介入：稳态过弯 β 本就不为零，
       全程反打会与 Stanley 抢方向（实测横向偏差 79.99m ⇒ 10.55m 那轮已暴露）。 */
    const _bEx = Math.max(0, Math.abs(_beta) - 3.0 * Math.PI / 180);
    const beta_deg = -Math.sign(_beta) * (180.0 / Math.PI) * kBeta * _bEx;   /* 左弯 β<0 ⇒ 反打右=正转角 */
    raw_steer = Math.max(-28, Math.min(28, raw_steer + yaw_deg + beta_deg));
    this.last_beta = _beta;

    this.last_r_err = _rTarget - _r;
    const _betaAbs = Math.abs(_beta);
    
    // Rate limit steering to avoid sudden snap-oversteer
    const max_steer_rate = 140.0; // deg/s
    const d_steer = Math.max(-max_steer_rate * dt, Math.min(max_steer_rate * dt, raw_steer - this.last_steer));
    let ctrl_steer = this.last_steer + d_steer;
    this.last_steer = ctrl_steer;
    
    // Longitudinal Speed Control with Smooth Deadband & Progressive Braking
    // G21：逐圈刹车学习——弯内目标速 × 余量系数（首圈 0.85，逐圈→ 1.0 = 刹车更晚）
    /* 2026-11-20：**车能力表模式下车速已由物理算出**（CircuitPath.capabilityMode
       === 'car'），逐圈学习退化为噪声源（它会把确定性剖面再压低/抬高），
       故 margin 固定 1.0，驾驶员降级为跟踪器。旧路径（'legacy'）行为不变。 */
    const _capMode = !!(this.path && this.path.capabilityMode === 'car');
    /* 车能力表模式下用**单一全局跟踪裕度**（不是逐弯学习）：剖面按峰值能力算
       （理论最快圈），但驾驶员按 95% 跟踪——真实车手也不会每点压着极限开，
       且控制器有 140°/s 转向速率与 45 ms 油门滤波，压极限必然瞬态超调。
       该常数是**标定值**，不随圈数变化 ⇒ 保持确定性。 */
    /* 2026-11-20（N3）：裕度改为**随剖面速度**变化，而不是全局一个数。
       全局 0.85 ⇒ 整圈按 85% 速度跑，理论圈速就变成 156.4/0.85 ≈ 184 s（实测 190.8），
       损失几乎全来自这个常数，而不是跟踪能力。
       物理上需要余量的只有**高速制动区**（无 ABS 时高速抱死风险大）；
       慢弯（v_max < 25 m/s）完全可以贴着极限跑。
           margin(v) = 0.98 − 0.13·clamp(v/70, 0, 1)   ⇒  v=0:0.98，v=35:0.915，v≥70:0.85
       可用 pilot.capMarginLow / capMarginHigh 覆盖两端。 */
    const _vLoc = Math.max(1, target.targetSpeed || 20);      // 局部剖面速度
    const _mLo = (typeof this.capMarginLow === 'number' && isFinite(this.capMarginLow)) ? this.capMarginLow : 0.87;
    const _mHi = (typeof this.capMarginHigh === 'number' && isFinite(this.capMarginHigh)) ? this.capMarginHigh : 1.00;
    const _f = Math.min(1, Math.max(0, _vLoc / 70));
    const capMargin = _mHi + (_mLo - _mHi) * _f;
    const cid = (typeof target.cornerId === "number") ? target.cornerId : -1;
    const margin = _capMode ? capMargin
      : ((cid >= 0 && this.cornerMargins[cid] !== undefined) ? this.cornerMargins[cid] : 1.0);
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

    /* 纵向**前馈**（车能力表模式专用，2026-11-20）。
       动机①：剖面改由车模型生成后刹车点大幅提前，纯 PID（对速度误差反应）追不上。
       动机②：**必须按制动距离前视**——在 80 m/s 时刹到 25 m/s 需要 250 m 以上，
       而默认前视只有 12~20 m，等看到弯再刹车必然冲出去（实测横向偏差 79.97 m）。
       实现：先算当前速度需要的制动距离，再朝那个距离取前视点的目标速度：
           d_brake = (u² − v_min²) / (2·a_brake(u))
           v_far   = getLookahead(..., d_brake).targetSpeed
           a_req   = (u² − v_far²) / (2·d_brake)
       若 a_req > 0 则按 a_req/a_brake 请求制动力，与 PID 输出取大。 */
    if (_capMode) {
      const _capObj = (this.path && this.path.capability) ? this.path.capability : null;
      const _aBrakeMax = _capObj && _capObj.brake ? _capObj.brake(u) : 11.0;
      const dBrake = Math.max(20.0, (u * u - 5.0 * 5.0) / (2.0 * Math.max(2.0, _aBrakeMax)));
      let _vFar = target.targetSpeed * capMargin;
      if (typeof this.path.getLookahead === 'function') {
        const _far = this.path.getLookahead(fx, fy, u, dBrake);
        if (_far && typeof _far.targetSpeed === 'number' && isFinite(_far.targetSpeed)) {
          _vFar = Math.min(_vFar, _far.targetSpeed * capMargin);
        }
      }
      const _aReq = (u * u - _vFar * _vFar) / (2.0 * Math.max(5.0, dBrake));
      if (_aReq > 0.2) {
        /* 前馈制动同样要过摩擦圆限制器（long_avail）——否则弯中仍按 100% 制动，
           无 ABS 的前端必然抱死、失去转向（实测侧偏 83.8°）。 */
        const _ffBrake = Math.min(1.0, _aReq / Math.max(2.0, _aBrakeMax)) * long_avail;
        target_brake = Math.max(target_brake, _ffBrake);
        target_throttle = 0;
      }
    }

    /* 侧滑抑制差动（同属驾驶员模型升级）：β 过大时松制动 + 断油。
       物理依据：后轴在制动中卸载 ⇒ 继续施加制动只会更快失稳；
       真实车手的反应正是"松刹车、回方向"。阈值 4° 起步（FSAE 后轴峰值侧偏
       约 6~10°，4° 已属明显滑动）。 */
    if (_betaAbs > 4.0 * Math.PI / 180) {
      const over = Math.min(1.0, (_betaAbs - 4.0 * Math.PI / 180) / (12.0 * Math.PI / 180));
      target_brake *= (1.0 - 0.85 * over);     // 最多松掉 85% 制动力
      target_throttle *= (1.0 - over);
    }
    
    /* ABS（车能力表模式专用，2026-11-20）。
       动机：能力剖面按 100% 极限给刹车点，而本车**没有 ABS** —— 全力制动即抱死，
       抱死就没有转向，于是"刹车 + 入弯"必然失稳（实测 β=−18°、峰值侧偏 83.8°）。
       实现：用 `state.omega` 与车速算四轮纵向滑移率
           κ = (ω·R − u) / max(2, |u|)        （制动时 κ < 0）
       超过 10% 就开始减制动，35% 时减掉 92%（近似 ABS 的循环保压）。
       半径取 `S.front/rear.tire.R`；缺省 0.23 m。 */
    if (_capMode && state.omega && target_brake > 0.02) {
      const _pickR = (ax) => {
        const t = this.Scfg && this.Scfg[ax] && this.Scfg[ax].tire;
        return (t && typeof t.R === 'number' && t.R > 0) ? t.R / 1000 : 0.23;
      };
      const _Rf = _pickR('front'), _Rr = _pickR('rear');
      const _au = Math.max(2.0, Math.abs(u));
      let _maxSlip = 0;
      const _wheels = [['FL', _Rf], ['FR', _Rf], ['RL', _Rr], ['RR', _Rr]];
      for (const _w of _wheels) {
        const om = state.omega[_w[0]];
        if (typeof om !== 'number' || !isFinite(om) || om < 0) continue;
        const kappa = (om * _w[1] - u) / _au;
        if (kappa < 0 && -kappa > _maxSlip) _maxSlip = -kappa;
      }
      if (_maxSlip > 0.10) {
        const _cut = Math.min(0.92, (_maxSlip - 0.10) / 0.35);
        target_brake *= (1.0 - _cut);
      }
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

/* M-2(G31-P6)：轮索引映射提为模块常量，避免每子步重复创建对象字面量 */
const WHEEL_IDX = { FL: 0, FR: 1, RL: 2, RR: 3 };

/* P26（M20，2026-10-17）· ISO 8608 路面等级的统一取值（三处舞台共用）。
   复用台架面板既有的选择：`S.road === "iso"` + `S.roadCls`（"A"~"H"）。
   S.road 缺省 "none" ⇒ 返回 null ⇒ 内核恒不加路面 ⇒ **逐位兼容**。
   ⚠ 用 `typeof S !== 'undefined'` 探测：本文件会被沙箱单独求值（M15b 教训）。 */
/* S15（M20，2026-10-17）· 车-墙碰撞（**冲量法**，纯函数便于单测）。
   ───────────────────────────────────────────────────────────────────────────
   旧实现：赛道出界只记**罚时 5 s + μ 降级**，`checkConeCollisions` 只是
   "去过一次就记 id"的 OBB 计数 ⇒ **完全没有碰撞动力学**（撞墙不减速、不反弹、
   不改变姿态，车会径直穿过缓冲区继续跑）。
   新：超出物理边界时施加冲量（法向反弹 + 切向摩擦 + 擦墙横摆扰动）。
   ⚠ **简化假设**：车体横向（st.v，车体 X 右）≈ 赛道法向。车头大致沿赛道方向时
     成立；横摆很大的退化工况方向可能不准，但速度修正会持续减小 |ey| ⇒ 自动收敛。
     精确解需要赛道切线/法向向量，属二期（真接触几何）。
   ⚠ **恢复系数 e < 1 ⇒ 碰撞一定耗能**（这是 M 段最硬的验收锚：不增能）。
   参数：`{restitution=0.2, friction=0.5, pushBack=0.6}`。 */
function applyWallCollision(st, ey, EDGE, p) {
  const pen = Math.abs(ey) - EDGE;
  if (!(pen > 0)) return false;
  const e = (p && typeof p.restitution === 'number') ? p.restitution : 0.2;
  const muW = (p && typeof p.friction === 'number') ? p.friction : 0.5;
  const push = (p && typeof p.pushBack === 'number') ? p.pushBack : 0.6;
  const outward = ey > 0 ? 1 : -1;
  const vLat = st.v || 0;
  if ((vLat * outward) > 0) {
    /* 仍在往外冲 ⇒ 法向反弹（e<1 耗能）+ 切向摩擦减速 + 擦墙横摆扰动 */
    st.v = -e * vLat;
    st.u = (st.u || 0) * Math.max(0.20, 1.0 - muW * 0.30);
    st.r = (st.r || 0) - outward * 0.22 * Math.abs(vLat);
  } else {
    /* 已在往回走但仍嵌在墙里 ⇒ 给一个向内的最小速度，防止卡住 */
    st.v = -outward * push;
  }
  return true;
}

function stageRoadIso() {
  return (typeof S !== 'undefined' && S.road === 'iso') ? (S.roadCls || 'A') : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   M5（2026-09-20）自由度口径校准 —— 名称与实现必须对得上

   类名 `VehicleDynamics15DOF` 是历史命名（README/手册第 16 章沿用）。实现的实际
   口径是：

     积分状态（16 个标量 / 10 个机械自由度）
       · 车身 6 DOF：X,Y,Z（世界位置）+ phi,theta,psi（欧拉角）
                     + u,v,w（体速）+ p,q,r（体角速度）
       · 车轮 4 DOF：omega{FL,FR,RL,RR}（自转角，state.omega）

     非积分量（代数/运动学从动，不是独立 DOF）
       · 车轮垂向：`tr_w = -(z_corner - z_road_w)`（本文件 step() 内）——车轮
         被**运动学地钉在路面上**，由 droop/bumpstop 钳位；`Fz` 由
         Kw·tr + 阻尼 + ARB + 缓冲块**代数**算出后作用到车身。
       · 结果：**没有非簧载质量的垂向惯性，也没有轮胎垂向柔度 DOF**；弹簧/阻尼
         力经 `F_susp` 直接进车身，不经过中间质量。

   因此"15-DOF"应理解为「6 车身 DOF + 4 轮自转 + 4 个运动学从动轮」，
   而不是「6 车身 + 4 非簧载垂向 + 4 轮自转」的教科书 15-DOF 形式。
   已知后果（登记于 INTENTIONAL_DIFFERENCES.md「15-DOF 口径」）：
     · 无轮跳共振/轮荷高频振荡能力（轮胎与簧下质量的 10~16Hz 模态缺失）；
     · 过路肩/减速带时车轮不"脱开"路面，只由 droop 行程钳位表达；
     · 车身与路面之间是"弹簧+阻尼+缓冲块"单链，无轮胎垂向弹簧串联。
   若要升级为真 15-DOF，须为每轮引入 zw/vw 状态 + 非簧载质量 + 轮胎垂向刚度/阻尼
   （并重标 test_lap_15dof / proving_ground 全部阈值）——属独立立项，不在本轮。
   ──────────────────────────────────────────────────────────────────────────── */

class VehicleDynamics15DOF {
  constructor(S_config, SIM_data, initSpeedMs = 0) {
    this.S = S_config;
    this.SIM = SIM_data;
    
    this.m = Math.max(150, S_config.mTotal || 1000);
    this.wb = (S_config.wb || 2600) / 1000;
    /* a = CG→前轴距离、b = CG→后轴距离。M5（2026-09-20）修复：
       旧值 `this.wb * 0.46` 是从（当时前后对调的）准静态内核抄来的口径错误值，
       使 Fz0_F = m·g·(b/wb) 把后轴静载份额给了前轴（formula 预设 45.3% ↔ 54.7%
       整体反了）。现按两轴簧载点质量模型就地推导，与 03-mechanism/chassis.py 同源：
         a = L·m_r/(m_f+m_r)、b = L·m_f/(m_f+m_r)
       缺 mS 的测试桩回落 0.46（旧行为）。 */
    {
      const _mf = (S_config.front && S_config.front.mS) || 0;
      const _mr = (S_config.rear && S_config.rear.mS) || 0;
      this.a = (_mf + _mr) > 0 ? this.wb * (_mr / (_mf + _mr)) : this.wb * 0.46;
    }
    this.b = this.wb - this.a;
    /* M5：按胎宽配平的轴侧偏刚度系数 k = W_axle / mean(W_f, W_r)，喂给
       magicFormula 的 axleScale（见该方法注释）。等宽/缺字段 ⇒ 1，旧行为不变。 */
    {
      const _wf = (S_config.front && S_config.front.tire) ? S_config.front.tire.W : null;
      const _wr = (S_config.rear && S_config.rear.tire) ? S_config.rear.tire.W : null;
      if (typeof _wf === 'number' && isFinite(_wf) && _wf > 0 &&
          typeof _wr === 'number' && isFinite(_wr) && _wr > 0) {
        const _ref = 0.5 * (_wf + _wr);
        this.kW_F = _wf / _ref;
        this.kW_R = _wr / _ref;
      } else {
        this.kW_F = 1.0; this.kW_R = 1.0;
      }
    }
    this.h_cg = (S_config.hcg || 350) / 1000;
    
    const hF = (S_config.front && S_config.front.hp && S_config.front.hp.WC) ? S_config.front.hp.WC : [750,0,300];
    const hR = (S_config.rear && S_config.rear.hp && S_config.rear.hp.WC) ? S_config.rear.hp.WC : [750,0,300];
    this.tF = Math.abs(hF[0] * 2) / 1000;
    this.tR = Math.abs(hR[0] * 2) / 1000;

    this.tireF = S_config.front ? S_config.front.tire : { R:330, W:280 };
    this.tireR = S_config.rear ? S_config.rear.tire : { R:330, W:280 };
    this.ReF = (this.tireF.R || 330) / 1000;
    this.ReR = (this.tireR.R || 330) / 1000;
    
    /* ── S1（M20，2026-10-17）· 惯量同源 ────────────────────────────────────
       旧式 `I_yaw = I_pitch + I_roll` 是**平面薄板的垂直轴定理**，对三维车体不成立：
         Izz      = Σm(x²+y²)
         Ixx+Iyy  = Σm[(y²+z²)+(x²+z²)] = Izz + 2Σm·z²
       即两者差 2Σm·z² > 0。实测（formula/FSAE，m=235、wb=1550）：
         旧式 I_yaw = 162.94 kg·m²   vs   部件清单 Izz = 68.78 kg·m²  ⇒ **偏大 137%**
         k_z/L = 0.537（行业带 0.30~0.36）⇒ 横摆响应被系统性算钝。
       现改三档解析，与引擎 `mass_properties.resolve_yaw_inertia` 及 TPHYS
       （09-track.js）同一真源：① 显式给定 → 用它；② 与 FSAE 口径吻合 → 部件清单；
       ③ 其余车型 → 保留旧经验式**并标明来源**（GT3/Baja 数值逐位不变）。
       ⚠ 用 `typeof fsaeMassProps === 'function'` 特性探测而非硬调用：
          本文件可能被单独加载的沙箱求值，硬调用会 ReferenceError（M15b 教训）。
       ⚠ 注意 `C_yaw_damp = I_yaw·0.75` 的时间常数 τ = I_yaw/C = 1/0.75 s，
          **与 I_yaw 无关** ⇒ 本改动不改变人工横摆阻尼的时间常数，只改变
          同样力矩下的角加速度（I_yaw 变小 ⇒ 转向响应变快，这正是修正目的）。 */
    {
      const _wbMm = Number(S_config.wb) || 0;
      let _decIz = 0;
      if (typeof S_config.iz_kg_m2 === 'number' && S_config.iz_kg_m2 > 0) _decIz = S_config.iz_kg_m2;
      else if (typeof S_config.Izz === 'number' && S_config.Izz > 0) _decIz = S_config.Izz;
      if (_decIz > 0) {
        /* 只声明了 Izz 时，Ixx/Iyy 仍走经验式（与引擎单解析 Izz 的口径一致） */
        this.I_pitch = this.m * (this.wb * 0.42) ** 2;
        this.I_roll = this.m * ((this.tF + this.tR) * 0.22) ** 2;
        this.I_yaw = _decIz;
        this.inertiaSrc = 'declared';
      } else if (typeof fsaeMassProps === 'function'
                 && Math.abs(this.m - 235) <= 1.5 && Math.abs(_wbMm - 1550) <= 5) {
        const _mp = fsaeMassProps();
        this.I_pitch = _mp.Ixx;   // 绕 X（横向）→ 俯仰
        this.I_roll = _mp.Iyy;    // 绕 Y（纵向）→ 侧倾
        this.I_yaw = _mp.Izz;     // 绕 Z（垂向）→ 横摆
        this.inertiaSrc = 'inventory:fsae';
      } else {
        this.I_pitch = this.m * (this.wb * 0.42) ** 2;
        this.I_roll = this.m * ((this.tF + this.tR) * 0.22) ** 2;
        this.I_yaw = this.I_pitch + this.I_roll;
        this.inertiaSrc = 'empirical:legacy';
      }
    }
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

    /* 2026-11-19（P35 统一）：防倾杆刚度改走**机构侧同一实现** `arbRate()` ——
       管扭转 G·J/L ÷ 力臂² × 运动比²，不再用 K1 自己那套 `d⁴ × 0.05` 硬编码系数。
       此前同一根杆在两条路径上刚度不同（gt3 d=28：物理 ≈63 kN/m vs 旧式 ≈31 kN/m），
       改材料/力臂在 K1 里毫无反应。现在只有**一个**公式。
       `S_config.arbModel === 'legacy'` 可退回旧式（仅用于 A/B 对比与回退验证）。 */
    const _arbK = (axleState, mr) => {
      if (!axleState || !axleState.arb || !(axleState.arb.d > 0)) return 0;
      const legacy = axleState.arb.d ** 4 * 0.05;
      if (S_config.arbModel === 'legacy') return legacy;
      if (typeof arbRate !== 'function') return legacy;   // 无机构层（精简沙箱）时退回
      try {
        const r = arbRate(mr, axleState);
        return (r && isFinite(r.k) && r.k > 0) ? r.k * 1000.0 : 0;   // N/mm → N/m
      } catch (e) { return legacy; }
    };
    this.K_arb_F = _arbK(S_config.front, mrF);
    this.K_arb_R = _arbK(S_config.rear, mrR);

    // Roll Moment Arm: distance from sprung CG to physical roll axis
    const h_rc_f = (SIM_data && SIM_data.rcH_F !== null && SIM_data.rcH_F !== undefined ? SIM_data.rcH_F : 50) / 1000;
    const h_rc_r = (SIM_data && SIM_data.rcH_R !== null && SIM_data.rcH_R !== undefined ? SIM_data.rcH_R : 65) / 1000;
    const h_roll_axis = (h_rc_f + h_rc_r) / 2;
    /* 2026-11-19（P35 统一）：侧倾力臂用**簧载质心高** `hs`，不是整车质心高 `hcg`。
       物理上侧倾的是簧上质量；簧下质量不随车身滚转（本模型里它只有垂向 DOF）。
       用整车质心会系统性错配——formula 预设 hs=285 vs hcg=270，差 5.6%。
       无 `hs` 时回退 hcg ⇒ 旧行为。 */
    const h_roll_src = (S_config.hs !== undefined && S_config.hs !== null && isFinite(S_config.hs))
      ? S_config.hs : this.h_cg * 1000;
    this.h_roll_arm = Math.max(0.06, h_roll_src / 1000 - h_roll_axis);
    /* P33 侧向（2026-11-19）：侧倾轴高要留到 step() 里算簧下横向分量，挂到实例上 */
    this.h_roll_axis = h_roll_axis;
    /* 线 B · B2：柔度转向系数（rad/N）。deg/1000N → rad/N */
    const _compF = (S_config && S_config.front && isFinite(S_config.front.compSteerDegPerKN))
      ? S_config.front.compSteerDegPerKN : 0.4;
    const _compR = (S_config && S_config.rear && isFinite(S_config.rear.compSteerDegPerKN))
      ? S_config.rear.compSteerDegPerKN : 0.4;
    this.kCompSteer_F = _compF * Math.PI / 180 / 1000;
    this.kCompSteer_R = _compR * Math.PI / 180 / 1000;
    this._FyPrev = { FL: 0, FR: 0, RL: 0, RR: 0 };
    /* 2026-11-19：供 20-lat-bench 的解析侧倾锚读取（P33 侧向翻默认后需要） */
    this.rollInertiaOn = (S_config && S_config.rollInertia !== false);
    this.rTireM = (S_config && S_config.tire && isFinite(S_config.tire.R)) ? S_config.tire.R / 1000 : 0.26;
    
    /* P0（M20）· 性能埋点计数器（整数自增，零开销） */
    this._simStat = { steps: 0, subSteps: 0, roadQueries: 0 };
    /* S3（M20）· 累积行驶距离（m）——ISO 8608 是**空间**谱，路面固定在地上，
       后轴经过的是前轴 wb 之前的位置（比"时间延迟 L/v"更严格：后者只在匀速下成立）。 */
    this._roadS = 0;
    /* S2（M20）· 轮胎松弛状态（一阶滞后）。
       alphaLat/kappaLat = 胎面"实际"滑移（喂给轮胎模型）；_alphaSt/_kappaSt = 本子步
       算出的几何目标值。开关 `S.tireRelax === false` 可关闭（默认开启）。 */
    this.alphaLat = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this.kappaLat = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this._alphaSt = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this._kappaSt = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this.relaxOn = !(S_config && S_config.tireRelax === false);
    /* S2(b)：回正力矩拖距（m）。机械拖距 = 主销后倾拖距（实车 20~40 mm）；
       气动拖距 = 接地印痕变形导致的力心后移（峰值约 0.05~0.08 m，随侧偏角衰减）。 */
    this.alignOn = !(S_config && S_config.tireAlign === false);
    this.trailMech = (S_config && typeof S_config.trailMechM === 'number' && S_config.trailMechM > 0)
      ? S_config.trailMechM : 0.025;
    this.trailPneu0 = (S_config && typeof S_config.trailPneu0M === 'number' && S_config.trailPneu0M > 0)
      ? S_config.trailPneu0M : 0.060;
    /* S2(c)（M20，2026-10-17）· 人工横摆阻尼 C_yaw_damp = I_yaw · yawDampK。
       ⚠ 这是**补偿器不是物理**：它存在的唯一理由是"无轮胎松弛 + 无回正力矩"时
         横摆缺天然阻尼。其时间常数恒为 τ = I_yaw/C = 1/yawDampK 秒（与 I_yaw 无关）。
       **实测（physics_audit I 段扫描，S2(a)(b) 落地后）**：
         yawDampK 从 0.75 退到 0.00，六种工况全部稳定——
           自由衰减 r_end ≈ 5e-17（收敛到 0）、稳态符号翻转 0 次（无持续振荡）、
           T63 恒为 41 ms、稳态 |r| 仅变 1.58%。
       ⇒ 轮胎侧偏力本身 + 回正力矩已提供**全部**横摆阻尼；0.75 是**重复计入**，
         它人为压制横摆（等效给车加了一个 1.33 s 的额外衰减）。故缺省改为 **0**。
       ⚠ 保留通道：若未来某工况出现横摆振荡，可设 `S.yawDampK` 临时调回 0.75。 */
    this.yawDampK = (S_config && typeof S_config.yawDampK === 'number' && isFinite(S_config.yawDampK))
      ? S_config.yawDampK : 0.0;
    /* S6（M20，2026-10-17）· 转向系统动力学。
       `ctrl.steer` 是**驾驶员/控制器给出的指令**（度），真实车要经转向柱 → 齿条 →
       横拉杆 → 车轮，有惯量、扭转柔性、助力阀响应（实车指令→齿条约 50~100 ms）。
       旧实现把指令**直接**当车轮转角用 ⇒ 打方向的瞬间轮胎立刻到位，
       这是开环阶跃 T63 只有 41 ms（真实车 150~350 ms）的主要成因（P27）。
       现插一阶滞后：steerActual →(τ)→ 前轮实际转角。
       **τ 选档依据（audit J 段实测扫描）**：
         τ=0 ⇒ T63 41 ms / 超调 16.7%　τ=0.05 ⇒ 80 ms / **4.8%**　τ=0.20 ⇒ 209 ms / 3.3%
       只有 τ=0.20 能把 T63 顶进真实带(150~350 ms)，但**那是"驾驶员反应"量级，不是机械
       量级**——实车转向柱→齿条→车轮约 50~100 ms。取 **τ = 0.05 s**（机械部分真实值）：
       闭环里 MPC(15-mpc.js) 自身的 0.10 s 低通代表控制器/人，两者叠加后总响应
       ≈0.15 s ⇒ 有效 T63 落入真实带。把机械与人为混在一个 τ 里物理上不诚实。
       ⚠ 与控制器侧的速率限/低通**不重复**：MPC 与 Stanley(11-stages.js:223) 的限幅是
         "手速上限"（人打方向盘的极限），本项是"齿条到车轮的传递"。
       ⚠ 副作用（好的）：超调 16.7%→4.8% —— 原先的大超调是"指令瞬间到位"的假象。 */
    this.steerActual = 0.0;
    this.steerTau = (S_config && typeof S_config.steerTauS === 'number'
                     && isFinite(S_config.steerTauS) && S_config.steerTauS >= 0)
      ? S_config.steerTauS : 0.05;
    /* P28（M20，2026-10-17）· 俯仰/侧倾人工阻尼系数 —— **已退到 0**。
       与已移除的 `C_yaw_damp` 同类（`k·√(K·I)` 形式的经验阻尼），而减振器力
       `calcDamper(dtr)` 已经在 `Fz` 里提供了真实的俯仰/侧倾阻尼。
       **实测（audit K 段扫描 + 本轮对照探针）**：
         k: 0 → 0.45 → 5.0 时，阶跃后 φ 的变化只有 **1e-7 ~ 5e-6 量级**
         （φ −5.2029206397e-3 → −5.2033308479e-3 → −5.2074730442e-3）；
         要到 k=50 才开始明显影响（φ −9.4e-3、p −0.34）。
       ⇒ 在 0~0.45 的**正常工作区间内这两行几乎是死代码**，减振器阻尼远大于它。
         故缺省改为 0（让代码诚实：不再留无作用的"看起来有物理"的项）。
       ⚠ 通道保留（S.pitchDampK / S.rollDampK），若某工况出现俯仰/侧倾振荡可临时调回。 */
    this.pitchDampK = (S_config && typeof S_config.pitchDampK === 'number' && isFinite(S_config.pitchDampK))
      ? S_config.pitchDampK : 0.0;
    this.rollDampK = (S_config && typeof S_config.rollDampK === 'number' && isFinite(S_config.rollDampK))
      ? S_config.rollDampK : 0.0;
    /* ── S13（M20，2026-10-17）· 真 15-DOF：簧下质量 + 轮胎垂向柔度 ──────────
       旧口径（本文件 :291-317 自认）：车轮被**运动学钉在路面上**，
       `tr = z_road − z_corner` 是代数量，`Fz` 由"弹簧+阻尼+ARB+缓冲块"直接算出后
       作用到车身 ⇒ **没有非簧载质量的垂向惯性，也没有轮胎垂向柔度 DOF**。
       已知后果：10~16 Hz 轮跳模态缺失；过路肩/减速带车轮不"脱开"路面。
       新：每轮引入 2 个状态（接地点高度 zw、速度 vzw），轮胎用**穿透量**接触模型
       （同台架 04-dynamics.js:138-144 的 `fz = kT·pen + cT·(żr − żw)`），
       悬挂力作用在簧上与簧下之间。
       ⚠ **默认开启**（2026-11-19 Phase B 转正）：`S.wheelDof === false` 才关闭。
         关闭时逐位复现转正前行为（`physics_audit` 用特征化锚钉住），可随时回退。
       ⚠ 参数：mU（非簧载质量/角，kg）、kT（轮胎垂向刚度 N/mm）、
         cT（轮胎垂向阻尼，由阻尼比 ζ 推导，缺省 0.06）。 */
    this.wheelDof = !(S_config && S_config.wheelDof === false);
    this.zw = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this.vzw = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this._zRoadPrev = { FL: 0, FR: 0, RL: 0, RR: 0 };
    this.mU_f = (S_config && S_config.front && typeof S_config.front.mU === 'number' && S_config.front.mU > 0)
      ? S_config.front.mU : 12.0;
    this.mU_r = (S_config && S_config.rear && typeof S_config.rear.mU === 'number' && S_config.rear.mU > 0)
      ? S_config.rear.mU : 12.0;
    /* P30-a（2026-11-19）：预设把 kT 平铺在**轴级**（02-presets.js:38 `mU:12, kS:105, kT:180`），
       而 `S[axle].tire` 只有 `{R,W,rim,disc,label}`——**没有 kT**。旧实现只读 `.tire.kT`
       ⇒ 四款预设的 120~280 N/mm 全被忽略、恒回退 260。读法改为三级：
       `.tire.kT`（tire-lab 覆盖层）> 轴级 `kT`（预设真源）> 260（旧缺省）。
       `wheelDof` 关闭时 kT 不被消费 ⇒ 本修复对旧行为逐位兼容。 */
    const _kTAxle = (ax) => {
      const a = S_config && S_config[ax];
      const t = a && a.tire && a.tire.kT;
      if (typeof t === 'number' && t > 0) return t;
      const k = a && a.kT;
      return (typeof k === 'number' && k > 0) ? k : 260;
    };
    this.kT_f = _kTAxle('front') * 1000.0;
    this.kT_r = _kTAxle('rear') * 1000.0;
    /* 轮胎垂向阻尼：cT = 2·ζ·√(kT·mU)，ζ 缺省 0.06（轮胎垂向阻尼比典型 0.05~0.1） */
    const _zeta = (S_config && typeof S_config.tireDampRatio === 'number' && S_config.tireDampRatio > 0)
      ? S_config.tireDampRatio : 0.06;
    this.cT_f = 2.0 * _zeta * Math.sqrt(this.kT_f * this.mU_f);
    this.cT_r = 2.0 * _zeta * Math.sqrt(this.kT_r * this.mU_r);

    /* ── A4（2026-11-19）· 质量拆分：簧载 / 非簧载 ──────────────────────────
       旧口径：车身用 mTotal（= 含簧下），簧下质量只提供惯性、不提供重力。
       S13 打开后簧下惯性被**数了两次**（mTotal 里一次 + 轮上 mU 一次），
       而重量全由弹簧承担 ⇒ 总重与静载自洽，但**簧上模态频率偏低**。
       探针实测（web/test/mass_split_probe.cjs，四预设）：实测 heave 频率贴
       "总质量 + 弹簧/轮胎串联"口径（0.8~3.9%），与簧载口径差 11~22% ⇒ 拆分。
       拆法：车身垂向用 mSprung、簧下方程补 mU·g；**平面方程保持 mTotal**
       （纵横向总惯性本来就是对的，簧下随车一起平移）。 */
    this.mSprung = Math.max(50, this.m - 2 * (this.mU_f + this.mU_r));
    /* 弹簧预压（设计位 = 静平衡位）：S13 开时按簧载口径；关时沿用总口径（逐位兼容）。
       注意 Fz0_F/Fz0_R 本身**不改**——那是轮胎额定载荷（接触力口径，= 簧载/4 + mU·g）。 */
    this.FzSprF = (this.mSprung * 9.81 * (this.b / this.wb)) / 2.0;
    this.FzSprR = (this.mSprung * 9.81 * (this.a / this.wb)) / 2.0;

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
      /* 阻尼力（悬挂力的一部分，不含弹簧/ARB/缓冲块）。
         用途：阻尼器接线测试与台架对照；S13 转正后 Fz 是接触力，不能用 Fz 差分取阻尼。 */
      Fdamp: { FL: 0, FR: 0, RL: 0, RR: 0 }, 
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
    /* Ls = 侧偏松弛长度 m（S2，M20 2026-10-17）。缺省 0.35 与引擎 v3models.py:404
       `Ls: float = 0.35` 及 TPHYS 09-track.js:92 同值。 */
    const D = { Fy0: 5250.0, By: 20.0, Cy: 1.2, Ey: -0.5, FzNom: 3500.0, LS: 0.10, Cg: 6.0, Ls: 0.35 };
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
    // Ey 不在 TIRE_MF_QS 里，单独走 SIM.tireCalibEy（与引擎侧 payload 同口径）；
    // G29 后 pick('Ey') 链含 userTire 层（tireCalibEy 仍最优先）。
    const eySim = (this.SIM && typeof this.SIM.tireCalibEy === 'number') ? this.SIM.tireCalibEy : NaN;
    const Ey = isFinite(eySim) ? eySim : pick('Ey');
    const p = {
      Fy0, FzNom, By, Cy: pick('Cy'), Ey,
      LS: Math.max(0.0, Math.min(1.0, pick('LS'))),   // LS 钳到 [0,1]，防负值/过大括高
      Cg: pick('Cg'),
      /* S2：侧偏松弛长度（m），>0 才生效。σ = max(0.3, Ls) 与引擎/TPHYS 同式。 */
      Ls: pick('Ls', 0),
      /* M8（2026-09-20）：载荷敏感性参考载荷 = 当前车型静轮载（mTotal·g/4）。
         与 03-mechanism 的 US 梯度（按轴静载 Fzf0/2、Fzr0/2）同源同量级；
         瞬态层是单胎模型，故取整车均值。缺 S 时退化为 FzNom。 */
      FzRef: (typeof S !== 'undefined' && S.mTotal > 0) ? (S.mTotal * 9.81 / 4) : FzNom,
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
    /* M8：FzRef 必须进缓存键——它由 S.mTotal 导出，换车型/改质量后若不失效，
       会继续沿用上一台车的参考载荷（载荷敏感性口径静默漂移）。 */
    /* S2：Ls 进缓存键（同 FzRef 的理由——换胎/改标定后必须失效） */
    const key = [p.By, p.Bx, p.Cy, p.Ey, p.FzNom, p.LS, p.Fy0, p.Cg, p.FzRef, p.Ls].join('|');
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
  magicFormula(Fz, alpha, kappa, mu_peak = 1.35, axleScale = 1) {
    if (Fz <= 1.0) return { Fx: 0, Fy: 0 };
    const tp = this.resolveTireParams();
    // 载荷敏感性（Jensen 效应）：重载 μ 递减——载荷转移损失轴总拓地力、
    // 以及稳态不足转向梯度的轮胎侧根基。钳位与引擎 _d() 的 max(0.1, ...) 同式。
    // M8（2026-09-20）：参考载荷与 FzNom 分离——FzNom 管 μ 量级，FzRef 管
    // "载荷翻倍 μ 降 LS"相对哪个工作点。缺省退化为 FzNom（旧口径逐位不变）。
    const ref = (typeof tp.FzRef === 'number' && tp.FzRef > 0) ? tp.FzRef : tp.FzNom;
    const r = Fz / ref;
    const lsF = Math.max(0.1, 1.0 - tp.LS * (r - 1.0));
    /* 线 B · B4（2026-11-19）＋ N2（2026-11-20）：**四内核轮胎口径同源**。
       实测 K1 与 K3（engine/tire_mf.py）在完全相同参数下 Fy 比值恒为 **10/9**
       （精确，与 Fz/α 无关）——根因是 D 的量级基准不同：
         K1: D = μ_surface(1.35) · Fz
         K3: D = Fy0/FzNom(=5250/3500=1.5) · Fz      ← 轮胎标定值
       K2（09-track TPHYS）也用 Fy0/FzNom ⇒ **K1 是唯一异类**。

       ⚠ N2 修正（2026-11-20）：初版把 `muTire` 乘在原有 `gripScale` 之上，
       造成**标定被算两遍**——`gripScale` 的定义本身就是
       `(Fy0/FzNom)/(缺省胎 Fy0/FzNom)`，即"轮胎相对引擎缺省胎的 μ 比"。
       于是标定 Fy0 ×1.25 时峰值变成 1.25 × 1.875/1.35 ≈ 2.34（正确应 1.875）。
       现在两口径**互斥**：
         关：D = μ_surface · gripScale · Fz          （旧相对口径，逐位不变）
         开：D = (μ_surface/1.35) · (Fy0/FzNom) · Fz （绝对口径：路面 μ 退化为倍率，
             1.35 = 干沥青基准；峰值在 μ=1.35 时恰为 Fy0/FzNom，与 K3 逐点一致） */
    const _muTire = (tp.Fy0 > 0 && tp.FzNom > 0) ? tp.Fy0 / tp.FzNom : 1.35;
    const _useTireMu = !!(this.S && this.S.tireMuFromParams === true);
    const muBase = _useTireMu ? (mu_peak / 1.35) * _muTire : mu_peak;
    const D = muBase * (_useTireMu ? 1.0 : tp.gripScale) * Fz * lsF;

    /* M5（2026-09-20）：axleScale = 按胎宽配平的轴刚度系数 k = W_axle / mean(W_f, W_r)。
       只放大**刚度因子**（侧向归一化滑移 sy 的 By），不动峰值 D —— 胎宽对接触斑
       刚度近似线性、对同配方同胎压的 μ·Fz 基本中性。等宽/缺字段时 k=1，旧行为
       逐位不变（test_dom 与 test_lap_15dof 的 legacy 锚不受影响）。 */
    const sx = tp.Bx * kappa;
    const sy = axleScale * tp.By * Math.tan(alpha);
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

  /* ── S4（M20，2026-10-17）· 阿克曼转向几何 ─────────────────────────────────
     旧实现左右前轮共用同一个 δ：低速大转角时内外轮同角，两前轮的转向圆心不重合
     ⇒ 轮胎互相"较劲"（内轮被拖、外轮被推），真实梯形转向机构不会这样。
     与 TPHYS（09-track.js::steer）同式，按转弯半径 R = L/tanδ 分内外轮：
       内轮 δ_in  = atan(L / (R − hf))      外轮 δ_out = atan(L / (R + hf))
     符号：δ>0 = 右转 ⇒ 内侧是右轮（wheels 表 FR 的 x = +tF/2）。
       · δ→0 时两者都→δ（阿克曼是小转角下的高阶修正）⇒ 高速小转角工况几乎不变
       · 主要影响：低速掉头、麋鹿测试、定圆（大转角段）
     ⚠ `Math.max(0.5, R − hf)` 防 R→hf 时除零/反号（同 09-track 的保护）。
     ⚠ **必须限幅**：上式在大转角时内轮会发散到非物理值——δ=30° 时 R=2.68 m、
       R−hf=1.93 ⇒ δ_in = atan(1.55/1.93) = **38.8°**；δ=40° 时更到 54.6°。
       实车齿条行程有限，前轮有机械限位（FSAE 典型 30~35°）。
       实测教训：不加限幅直接接线 ⇒ 赛道闭环峰值侧偏角 21.5°→25.1° 击穿 24° 阈值。 */
  ackermann(delta) {
    if (!(Math.abs(delta) > 1e-6)) return { left: 0, right: 0 };
    const L = this.wb, hf = this.tF / 2.0;
    /* 转向机构机械限位（rad）。缺省 32°（FSAE 典型 30~35°），可由轴级覆盖。 */
    let lim = 32.0 * Math.PI / 180.0;
    const _ov = (this.S && this.S.front) ? this.S.front.maxSteerDeg : undefined;
    if (typeof _ov === 'number' && isFinite(_ov) && _ov > 0) lim = _ov * Math.PI / 180.0;
    /* 转弯半径取**几何值** R = L/tanδ（与 TPHYS 09-track.js::steer 同式）。
       ⚠ 曾尝试改用"实际运动学半径" R = u/|r|（想让阿克曼反映真实的不足转向），
         实测**病态**：四轮侧偏角全部塌成 0.000°。原因是形成正反馈自锁——
         用状态量(r)反推控制输入(δ_in/δ_out)，而 r 又由 δ 产生 ⇒ 系统锁定在
         "侧偏恒为零"的退化解上，车不再产生侧偏力。
       ⚠ 结论（重要，别再改回去）：**阿克曼是转向梯形几何，只由转向角决定**，
         与实际转弯半径无关。它在设计上就是按"低速无侧偏"标定的；高速大侧向
         加速度下内轮侧偏反而增大是**真实且工程界熟知的物理**（正因如此赛道车
         才常用反阿克曼 anti-Ackermann），不是 bug。 */
    const sgn = delta > 0 ? 1 : -1;
    const R = Math.abs(L / Math.tan(delta));
    const cl = d => Math.max(-lim, Math.min(lim, d));
    const d_in = cl(Math.atan(L / Math.max(0.5, R - hf)));
    const d_out = cl(Math.atan(L / (R + hf)));
    return sgn > 0 ? { left: sgn * d_out, right: sgn * d_in }
                   : { left: sgn * d_in, right: sgn * d_out };
  }

  step(ctrl, env, dt_sec) {
    /* P0（M20）· 性能埋点：只做整数自增，不调 performance.now()，开销可忽略。
       审计 R-1017 实测：物理 0.023 ms/子步（17 子步 ≈ 0.39 ms/帧），
       **帧瓶颈是每 3 帧一次的 K&C 多体重建，不是物理** —— 埋点用来守住这个结论。 */
    if (this._simStat) this._simStat.steps++;
    const MAX_SUB_DT = 0.001; // 1000Hz Sub-stepping
    let t_remain = Math.min(0.05, dt_sec);
    const alpha_slope = env.grade || 0;
    const cosA = Math.cos(alpha_slope);
    const sinA = Math.sin(alpha_slope);
    /* S3（M20）· ISO 8608 路面开关：env.roadIso = "A"~"H" 才启用；falsy ⇒ 恒 0。
       ⚠ 用 `typeof isoProfileAtMm === 'function'` 特性探测（本文件可能被单独
         加载的沙箱求值，硬调用会 ReferenceError —— M15b 教训）。 */
    const _isoCls = env.roadIso || null;
    const _isoOn = !!(_isoCls && typeof isoProfileAtMm === 'function');

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
    /* N2（2026-11-20）：与 magicFormula 的 D 口径保持一致——开 tireMuFromParams 时
       制动上限也改用绝对口径 `(μ_eff/1.35)·(Fy0/FzNom)`，否则同一次标定在驱动/制动
       两条链上被计成两个不同的量。 */
    const _tireMuAbs = (tpStep.Fy0 > 0 && tpStep.FzNom > 0) ? tpStep.Fy0 / tpStep.FzNom : 1.35;
    const _useTireMuB = !!(this.S && this.S.tireMuFromParams === true);
    const brakeMu = (_useTireMuB ? (mu_eff / 1.35) * _tireMuAbs : mu_eff * tpStep.gripScale) * BRAKE_CAP;
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
      if (this._simStat) this._simStat.subSteps++;
      const st = this.state;
      /* S3：累积行驶距离放在**本子步路面计算之前**，使 `telemetry.z_road` 与
         `_roadS` 严格对应（否则会有一子步偏移，审计对不上）。带符号：倒车时回退。 */
      if (_isoOn) this._roadS += st.u * dt;
      const cPsi = Math.cos(st.psi), sPsi = Math.sin(st.psi);
      
      // 1. Evaluate Individual 4-Wheel Contact Patch Position, Road Kerb Elevation & K&C Kinematics
      const wheelStates = {};
      let numWheelsAirborne = 0;
      /* S6（M20）：转向指令 → 实际齿条位置（一阶滞后，解析精确指数）。
         τ=0 时直接跟随（缺省，逐位兼容）。推进放子步开头 ⇒ 本子步的轮循环
         立刻使用新值，滞后量恰为一个子步，语义清晰。 */
      const _steerCmd = (typeof ctrl.steer === 'number' && isFinite(ctrl.steer)) ? ctrl.steer : 0.0;
      if (this.steerTau > 0) {
        this.steerActual += (_steerCmd - this.steerActual) * (1.0 - Math.exp(-dt / this.steerTau));
      } else {
        this.steerActual = _steerCmd;
      }
      /* S4（M20，2026-10-17）· 阿克曼转向几何：左右前轮不再共用同一个 δ。
         每子步算一次（不随轮变），结果 {left, right} 供下方轮循环取用。 */
      const _ack = this.ackermann(this.steerActual * Math.PI / 180.0);

      for (const w of wheels) {
        const X_w = st.X - w.y * sPsi + w.x * cPsi;
        const Y_w = st.Y + w.y * cPsi + w.x * sPsi;
        
        if (this._simStat) this._simStat.roadQueries++;
        const rInfo = pathObj ? pathObj.getRoadElevation(X_w, Y_w) : { z_road: 0, isKerb: false, mu: mu_eff };
        /* S3（M20）· ISO 8608 随机路面（可选）。
           开关：`env.roadIso` 给等级字符串（"A"~"H"）才启用；未给 ⇒ 恒 0
           ⇒ **缺省逐位不变**（三处舞台调用点现均不传）。
           后轴取 `s − wb`（同一条路，后轴经过前轴 wb 之前碾压过的位置）——
           比台架的"时间延迟 L/v"更严格，后者隐含匀速假设。 */
        let z_iso = 0;
        if (_isoOn && typeof isoProfileAtMm === 'function') {
          const sW = this._roadS - (w.axle === 'rear' ? this.wb : 0.0);
          z_iso = isoProfileAtMm(sW, _isoCls) / 1000.0;   /* mm → m */
        }
        /* 2026-11-19（Phase C · 4-Post ride 台）：`env.rig[id]` 给该轮**绝对**路面高度（m）
           ⇒ 直接顶替 path/ISO/bumpNoise —— 台架的路面就是这四路信号本身，
           可以各轮独立给相位（真 4-Post），这是 2D path 表达不了的。
           未给 ⇒ 完全走旧路径，逐位不变。 */
        const z_rig = (env && env.rig && typeof env.rig[w.id] === 'number') ? env.rig[w.id] : null;
        const z_road_w = (z_rig !== null) ? z_rig
          : ((rInfo.z_road || 0) + z_iso + (env.bumpNoise || 0));
        const mu_w = (rInfo.mu !== undefined ? rInfo.mu : mu_eff);
        
        // Chassis corner vertical displacement & velocity (+X right, +Y forward)
        const z_corner = st.Z + rideOffset + w.y * st.theta - w.x * st.phi;
        const dz_corner = st.w + w.y * st.q - w.x * st.p;
        
        const _limM = (v) => (v !== undefined && v !== null && isFinite(v) && Math.abs(v) > 1e-6)
          ? Math.abs(v) / 1000 : null;
        const _trMaxM = _limM(this.S && this.S.trMax), _trMinM = _limM(this.S && this.S.trMin);
        const maxDroop = (_trMinM !== null) ? _trMinM : (w.axle === 'front' ? 0.080 : 0.090);
        const maxBumpStop = (_trMaxM !== null) ? _trMaxM : (w.axle === 'front' ? 0.055 : 0.065);
        const isAirborne = (z_corner - maxDroop > z_road_w);
        if (isAirborne) numWheelsAirborne++;

        let tr_w, dtr_w, Fz_tire_w = 0;
        if (this.wheelDof) {
          /* ── S13：真簧下质量路径 ──────────────────────────────────────────
             zw = 轮胎**接地点**高度（状态），z_road = 路面高度。
             轮胎穿透 pen = z_road − zw（正 = 压），接触力同台架
             （04-dynamics.js:138-144）：F = kT·pen + cT·(ż_road − ż_w)，只压不拉。
             悬挂行程改为 **tr = zw − z_corner**（簧下相对车身向上 = 压缩）。
             ⚠ 首次进入时按静平衡预压缩初始化 zw = z_road − Fz0/kT，
               否则开局 F_tire=0 ≠ 静载 ⇒ 车会先坠落再弹回（假瞬态）。 */
          const _kT = (w.axle === 'front') ? this.kT_f : this.kT_r;
          const _cT = (w.axle === 'front') ? this.cT_f : this.cT_r;
          if (!this._zwInit) {
            const _Fz0 = (w.axle === 'front') ? this.Fz0_F : this.Fz0_R;
            this.zw[w.id] = z_road_w - _Fz0 / _kT;   // 预压缩
            this._zRoadPrev[w.id] = z_road_w;
          }
          const _dzRoad = dt > 0 ? (z_road_w - this._zRoadPrev[w.id]) / dt : 0;
          this._zRoadPrev[w.id] = z_road_w;
          const pen = z_road_w - this.zw[w.id];
          if (pen > 0) {
            Fz_tire_w = _kT * pen + _cT * (_dzRoad - this.vzw[w.id]);
            if (Fz_tire_w < 0) Fz_tire_w = 0;      // 轮胎只压不拉 ⇒ 天然表达离地
          }
          tr_w = this.zw[w.id] - z_corner;
          dtr_w = this.vzw[w.id] - dz_corner;
          /* 悬挂伸长限位（droop）：tr 不得小于 −maxDroop，撞限位则停住相对速度 */
          if (tr_w < -maxDroop) {
            this.zw[w.id] = z_corner - maxDroop;
            if (this.vzw[w.id] < dz_corner) this.vzw[w.id] = dz_corner;
            tr_w = -maxDroop;
            dtr_w = this.vzw[w.id] - dz_corner;
          }
        } else if (isAirborne) {
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
          /* S5（M20，2026-10-17）· 缓冲块刚度独立参数化（**通道先建，标定待办**）。
             旧式 `Kw_cur * (...)` 把缓冲块刚度**寄生在轮端弹簧刚度**上 ⇒ 调主弹簧
             刚度会连带改缓冲块特性（两个物理环节耦合，无法独立调校；而缓冲块是
             压缩行程末端的主角，实车是两个独立零件）。
             新：优先取轴级 `kBSNm`（N/m）；未提供 ⇒ 回退 Kw_cur ⇒ **数值逐位不变**。
             ⚠⚠ 单位陷阱（本轮实踩）：预设里已有 `S.kBS = 1000`，但那是**台架口径**
               （04-dynamics.js 用 mm 制 + FS 缩放，kBS 单位 N/mm）。直接当 N/m 用
               会得到 1e6 N/m ⇒ excess=10mm 时输出 **10 吨**力（比 Kw_cur 大 30 倍）。
               故**刻意不用** S.kBS，另起字段名 kBSNm 避免两套口径互相污染。
             ⚠ 行程阈值 maxBumpStop 仍硬编码 0.055/0.065 m —— 与预设 `S.bsU`
               （limF[1]，mm，机构限位）语义不同（缓冲块起点 vs 机构行程极限），
               对齐属独立项，此处不动，登记待办。 */
          const _axS = (w.axle === 'front') ? this.S.front : this.S.rear;
          const _kBSnm = _axS ? _axS.kBSNm : undefined;
          const kBS_eff = (typeof _kBSnm === 'number' && isFinite(_kBSnm) && _kBSnm > 0)
            ? _kBSnm : Kw_cur;
          F_bumpstop = kBS_eff * (excess * 8.0 + excess * excess * 200.0);
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
          /* S13：真实轮胎接触力（穿透量模型）。wheelDof 关闭时恒 0（不被消费）。 */
          Fz_tire: Fz_tire_w,
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
      /* 2026-11-19（P35 统一）：刚度来自构造期算好的物理值（管扭转公式），
         此处只乘 liveTune 的实时调整倍率。 */
      const K_arb_F = this.K_arb_F * arbF_mult;
      const K_arb_R = this.K_arb_R * arbR_mult;
      const F_arb_F = K_arb_F * (tr_FL - tr_FR);
      const F_arb_R = K_arb_R * (tr_RL - tr_RR);
      
      /* A4（2026-11-19）：S13 打开时车身只承担**簧载**重量，弹簧预压随之改为簧载口径；
         轮胎额定载荷 Fz0_* 仍是**总**载荷（接触力 = 簧载/4 + mU·g）。关闭时逐位不变。 */
      const Fz0_F_slope = (this.wheelDof ? this.FzSprF : this.Fz0_F) * cosA;
      const Fz0_R_slope = (this.wheelDof ? this.FzSprR : this.Fz0_R) * cosA;
      
      /* 2026-11-19：阻尼力单独暴露（telemetry.Fdamp）。
         动机：S13 转正后 telemetry.Fz 是**轮胎接触力**，不再是悬挂力；
         阻尼器接线测试若继续用 Fz 差分会被轮胎柔度吃掉（实测 Δ≡0）。 */
      const Fd_FL = calcDamper(CwB_F_eff, Cw_F_eff, vkB_F, vkR_F, dtr_FL);
      const Fd_FR = calcDamper(CwB_F_eff, Cw_F_eff, vkB_F, vkR_F, dtr_FR);
      const Fd_RL = calcDamper(CwB_R_eff, Cw_R_eff, vkB_R, vkR_R, dtr_RL);
      const Fd_RR = calcDamper(CwB_R_eff, Cw_R_eff, vkB_R, vkR_R, dtr_RR);
      const Fz_FL = wheelStates.FL.isAirborne ? 0.0 : Math.max(0.0, Fz0_F_slope + Kw_F_eff * tr_FL + Fd_FL + F_arb_F + wheelStates.FL.F_bumpstop);
      const Fz_FR = wheelStates.FR.isAirborne ? 0.0 : Math.max(0.0, Fz0_F_slope + Kw_F_eff * tr_FR + Fd_FR - F_arb_F + wheelStates.FR.F_bumpstop);
      const Fz_RL = wheelStates.RL.isAirborne ? 0.0 : Math.max(0.0, Fz0_R_slope + Kw_R_eff * tr_RL + Fd_RL + F_arb_R + wheelStates.RL.F_bumpstop);
      const Fz_RR = wheelStates.RR.isAirborne ? 0.0 : Math.max(0.0, Fz0_R_slope + Kw_R_eff * tr_RR + Fd_RR - F_arb_R + wheelStates.RR.F_bumpstop);
      const Fdamp = { FL: Fd_FL, FR: Fd_FR, RL: Fd_RL, RR: Fd_RR };
      
      const F_susp = { FL: Fz_FL, FR: Fz_FR, RL: Fz_RL, RR: Fz_RR };

      /* S13：车身受**悬挂力**，轮胎模型受**接触力**（真 15-DOF 下两者不再相等）。
         关闭 wheelDof 时 FzContact ≡ F_susp ⇒ 逐位兼容。 */
      const FzContact = this.wheelDof
        ? { FL: wheelStates.FL.Fz_tire, FR: wheelStates.FR.Fz_tire,
            RL: wheelStates.RL.Fz_tire, RR: wheelStates.RR.Fz_tire }
        : F_susp;
      if (this.wheelDof) {
        /* 簧下质量垂向积分：mU·azw = F_tire − F_susp。
           这是"10~16 Hz 轮跳模态"的来源；轮胎只压不拉 ⇒ 离地时 F_tire=0，
           簧下在悬挂力作用下回落，直到重新接触（天然表达车轮脱开路面）。 */
        for (const w of wheels) {
          const mU = (w.axle === 'front') ? this.mU_f : this.mU_r;
          /* A4：簧下质量也要**承重**（旧式漏了 mU·g，簧下只有惯性没有重力）。
             静平衡时 F_tire = F_susp + mU·g ⇒ 四角接触力之和 = mTotal·g（守恒不变）。 */
          const a = (FzContact[w.id] - F_susp[w.id] - mU * 9.81) / mU;
          this.vzw[w.id] += a * dt;
          this.zw[w.id] += this.vzw[w.id] * dt;
        }
        this._zwInit = true;
      }

      let SumFx_tire = 0.0, SumFy_tire = 0.0;
      let SumMz_tire = 0.0;

      // G31-P6-fix（I-3 阻塞修复）：动力系统每子步步进（缺省 legacy-equivalent → 与旧常数逐位一致；
      //   POWERTRAIN 未加载或 spec=null 时回退旧路径，保对拍锚）。
      //   TCS 机械通道：只在轮循环内用 tcsScale 切一次轮扭矩（demand.throttle 不再乘 tcsEst，
      //     消除“双切”——throttle 与轮扭矩同时被 TCS 削减、且前轴泄漏后轴-only 的削减比例）。
      //   TCS 能量通道：dm.tcsRear（默认 1）仅用于 step() 内 P_mot 中后电机贡献的缩放
      //     （T_motR × tcsRear 进 P_mot，用于 SOC/油耗积分的能量近似守恒），不影响轮扭矩输出。
      //     取上一子步后轮 tcsScale 均值，一帧滞后（子步末尾更新 this._tcsEstimate，下一子步开头读取）。
      //   M-2：复用 scratch 对象避免每子步 GC 压力。
      if (!this._ptDemand) this._ptDemand = { throttle: 0, brake: 0, shiftCmd: 0, tvBias: undefined, tcsRear: 1 };
      if (!this._ptOmega) this._ptOmega = { FL: 0, FR: 0, RL: 0, RR: 0 };
      const _pd = this._ptDemand, _pw = this._ptOmega;
      _pd.throttle = ctrl.throttle; _pd.brake = ctrl.brake;
      /* C3(G31-FR)：换挡指令【生产者】。
         ctrl.shiftCmd（UI/键盘）优先；缺省时对 manual 箱用简单转速律代驾——
         即“手动箱自动离合”简化（无离合器/无换挡杆物理，只是把驾驶员的换挡时机
         用转速律近似）：rpm>0.95×红线 → +1 挡；rpm<0.55×红线 → −1 挡。
         为何只管 manual：auto/dct/seq/cvt 四类已在 POWERTRAIN.AUTO_GB_TYPES 白名单内，
         由 step() 内的 autoShift 按【spec 自带的 autoUpFrac/autoDownFrac】自换挡；
         再叠一个硬编码 0.95/0.55 的外部生产者会覆盖用户规格（例如 FSAE seq 的
         autoDownFrac=0.5）——双重生产者语义模糊，故单一职责：箱内自换的交给箱。
         没有本生产者时 GT3（6MT manual）永远卡 1 挡，极速被 1 挡齿比钳在 ~93 km/h。
         转速源 = 上一子步 step() 返回的 shiftRpm（架构感知：ev/series/powersplit
         取电机 rpm，其余取曲轴 rpm），一帧滞后，与 TCS 能量通道同风格。 */
      if (this._ptShiftRpm === undefined) this._ptShiftRpm = 0;
      let _shiftCmd = (ctrl.shiftCmd === 1 || ctrl.shiftCmd === -1) ? ctrl.shiftCmd : 0;
      if (_shiftCmd === 0 && this._ptShiftRpm > 0 &&
          typeof POWERTRAIN !== "undefined" && typeof POWERTRAIN.shiftCmdFromRpm === "function") {
        const _gbt = (POWERTRAIN.spec && POWERTRAIN.spec.gearbox) ? POWERTRAIN.spec.gearbox.type : "";
        if (_gbt === "manual") _shiftCmd = POWERTRAIN.shiftCmdFromRpm(this._ptShiftRpm);
      }
      _pd.shiftCmd = _shiftCmd;
      /* TODO(G31-P10)：tvBias 暂用默认 0.5（step() 内 dm.tvBias 非有限值即回退 0.5）；
         动态扭矩矢量（按横摆/侧偏目标解算前后左右分配）待后续波次接入。 */
      _pd.tvBias = ctrl.tvBias;
      _pd.tcsRear = (this._tcsEstimate !== undefined) ? this._tcsEstimate : 1;   // I-3：一帧滞后（上一子步末尾算出）
      /* G31-P10-1：差速器轮端分配所需的各轮垂直载荷——取 this.telemetry.Fz（上一子步轮循环末写入），
         step() 在本轮循环【之前】调用 → 天然一子步滞后（与 tcsRear 能量通道同风格）。缺省/未加载
         时为静态设计载荷；open 差速器不读 fz（50/50），仅 locked 按载荷分配、lsd/awd_center 不受影响。 */
      _pd.wheelLoads = this.telemetry.Fz;
      _pw.FL = st.omega.FL; _pw.FR = st.omega.FR; _pw.RL = st.omega.RL; _pw.RR = st.omega.RR;
      const ptOut = (typeof POWERTRAIN !== "undefined" && POWERTRAIN.spec) ?
        POWERTRAIN.step(dt, _pd, _pw) : null;
      /* I3(G31-FR)：drivePowerFactor 旁路。该系数是 legacy 常数扭矩（后 480/前 120 N·m）
         下的质量补偿（min(1, m/1250×1.2)）；真实传动链的扭矩已由 spec 的功率/齿比/效率
         物理推导出来，再乘一次等于凭空打折（GT3 类预设 ×0.576，动力少一半）。 */
      const ptDriveScale = (ptOut && POWERTRAIN.hasRealDrivetrain()) ? 1 : drivePowerFactor;
      /* I1(G31-FR)：反射惯量是“每【驱动】轮”值，只加到实际接收驱动扭矩的轮上
         （fwd→前两轮、rwd→后两轮、awd_fixed/awd_center/tv→四轮）。旧接线加到全 4 轮，
         使非驱动轮 Iw 被无物理依据地放大。 */
      const ptIwDrive = ptOut ? POWERTRAIN.reflectedInertiaPerDriveWheel() : 0;
      this._ptOut = ptOut;   // G31：供 HUD（renderCircuitTelemetry）读挡位/rpm
      this._ptShiftRpm = (ptOut && Number.isFinite(ptOut.shiftRpm)) ? ptOut.shiftRpm : 0;   // C3：下一子步换挡律的转速源
      let _tcsSumRear = 0, _tcsCntRear = 0;   // I-3：累计后轮 tcsScale 供子步末更新（能量通道，一帧滞后）

      for(const w of wheels) {
        const ws = wheelStates[w.id];
        const Fz_w = FzContact[w.id];
        
        // Wheel contact point velocities in body frame (+X right, +Y forward)
        const v_cp_x = st.v - st.r * w.y;
        const v_cp_y = st.u + st.r * w.x;
        
        // Steer angle delta includes driver steer command + K&C bump steer
        /* S4：前轮取阿克曼分角（内轮大、外轮小），后轮 0 */
        const steer_driver = (w.axle === 'front' ? _ack[w.side] : 0.0);
        /* 线 B · B2（2026-11-19）：**柔度转向（compliance steer）**。
           真实悬架在侧向力下衬套/摆臂变形，车轮会朝减小侧偏的方向偏转一个角
           δ_c = −k_c·Fy（负反馈）。它等效于降低轮胎侧偏刚度
           C_eff = C_α/(1 + C_α·k_c)，因此**拖慢横摆响应**（开环 T63 偏快 = P27）。
           用上一子步的轮胎侧向力（1 ms 滞后可忽略）。
           系数 `S.front.compSteerDegPerKN`（deg / 1000 N，缺省 0.015）——
           ⚠ 这是**标定输入**（同 B5 性质），缺省值取保守量级；真实值应来自
           K&C 力偏移工况实测（衬套供应商数据）。
           `S.complianceSteer === true` 显式开启（默认关闭 ⇒ 逐位不变）。 */
        let comp_steer = 0.0;
        if (this.S && this.S.complianceSteer === true) {
          const kc = (w.axle === 'front') ? this.kCompSteer_F : this.kCompSteer_R;
          comp_steer = kc * (this._FyPrev[w.id] || 0);
        }
        const steer_total = steer_driver + ws.bump_steer_rad + comp_steer;
        
        // Transform velocities into wheel heading frame
        const v_tire_long = v_cp_x * Math.sin(steer_total) + v_cp_y * Math.cos(steer_total);
        const v_tire_lat  = v_cp_x * Math.cos(steer_total) - v_cp_y * Math.sin(steer_total);
        
        /* S2（M20）· 轮胎松弛：这里算出的是**瞬时**滑移（几何目标值），
           真正喂给轮胎模型的是 `alphaLat/kappaLat`（一阶滞后后的"胎面实际"滑移）。
           推进在子步末尾用解析精确指数做一次（见该处注释）。 */
        const alpha_inst = Math.atan2(v_tire_lat, Math.max(0.5, Math.abs(v_tire_long)));
        const v_rot = st.omega[w.id] * w.Re;
        const kappa_inst = (v_rot - v_tire_long) / Math.max(0.5, Math.abs(v_tire_long));
        this._alphaSt[w.id] = alpha_inst;
        this._kappaSt[w.id] = kappa_inst;
        const alpha = this.relaxOn ? this.alphaLat[w.id] : alpha_inst;
        const kappa = this.relaxOn ? this.kappaLat[w.id] : kappa_inst;
        
        // Pacejka tire forces (Fx_t: tractive/braking along tire rolling, Fy_t: cornering grip)
        let Fx_t = 0, Fy_t_base = 0, mf = null;
        if (Fz_w > 1.0) {
          mf = this.magicFormula(Fz_w, alpha, kappa, ws.mu,
                                 w.axle === 'front' ? this.kW_F : this.kW_R);
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
        
        this._FyPrev[w.id] = Fy_body;   // B2：柔度转向的反馈源（1 子步滞后）
        SumFx_tire += Fx_body;
        SumFy_tire += Fy_body;
        SumMz_tire += w.x * Fy_body - w.y * Fx_body;

        /* ── S2(b)（M20）· 回正力矩 Mz = trail · Fy_t ──────────────────────
           真实轮胎的侧向力作用点不在轮心正下方，而在接地印痕中心之后（拖距），
           于是产生绕垂轴的回正力矩。这是横摆**天然阻尼**的主要来源之一
           （另一个是松弛长度），缺了它才要靠 `C_yaw_damp = I_yaw·0.75` 人工兜底。
           拖距 = 气动拖距（随侧偏角衰减）+ 机械拖距（主销后倾，近似常数）：
             t_p(α) = t_p0 · exp(−(α/α_peak)²)，t_m ≈ 常数
           **符号推导**（本坐标 X右/Y前/Z上，右手系）：
             印痕相对轮心 r = (0, −t)（沿前进方向反方向）；
             力 F = (Fy_t, Fx_t)（沿侧向、前进）；
             Mz = r_x·F_y − r_y·F_x = t·Fy_t。
           物理校验：右转时 δ>0 ⇒ α = atan2(v_lat, v_long) < 0 ⇒ Fy_t > 0
             ⇒ Mz > 0（逆时针，向左）⇒ 与 r(<0，右转) 反号 ⇒ **提供阻尼** ✓
           ⚠ 若哪天改坐标或改 Fy 符号，这条必须重推——用「阶跃响应超调应下降」实测守。 */
        if (this.alignOn && Fz_w > 1.0) {
          const aPeak = Math.max(0.02, tpStep.alphaPeak || 0.144);
          const q = alpha / aPeak;   // alpha 已是松弛后的值（relaxOn 关闭时 = 瞬时值）
          const tPneu = this.trailPneu0 * Math.exp(-q * q);
          SumMz_tire += (tPneu + this.trailMech) * Fy_t;
        }
        
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
        // G31-P6：TCS 切扭矩比例（ptOut 路径下 throttleCmd 已被 TCS 削减，除以原始
        //   ctrl.throttle 得比例，乘到轮扭矩上，与旧路径直接切 throttleCmd 等效）。
        //   M-2：用模块常量 WHEEL_IDX 替代内联字面量。
        /* C2(G31-FR)：松油门（throttle≤1e-6）时 tcsScale = 1，不是 0。
           TCS 的语义是“给油驱动时切断打滑轮的驱动扭矩”，松油门根本没有驱动意图，
           不存在 TCS 介入；旧写法把整条机械通道归零，连带抹掉了发动机制动与电机
           回收（负扭矩），而 step() 内的 SOC/油耗积分照旧 → 轮上无阻力却在充电，
           能量不守恒。现在负扭矩正常通过机械通道，与 P_mot 同源同符号。 */
        const tcsScale = (ctrl.throttle > 1e-6) ? (throttleCmd / ctrl.throttle) : 1;
        // I-3：累计后轮 tcsScale 供子步末更新 _tcsEstimate
        if (w.axle === 'rear') { _tcsSumRear += tcsScale; _tcsCntRear++; }
        const T_drive = ptOut
          ? ((ptOut.tWheel ? ptOut.tWheel[WHEEL_IDX[w.id]]
                           : (w.axle === 'rear' ? ptOut.tRear : ptOut.tFront)) * ptDriveScale * tcsScale)
          : (w.axle === 'rear' ? (throttleCmd * 480.0 * drivePowerFactor)
                               : (throttleCmd * 120.0 * drivePowerFactor));
        const T_brake = (ctrl.brake * (w.axle === 'front' ? maxBrakeTorqueF * (bbias_eff / 0.58) : maxBrakeTorqueR * ((1.0 - bbias_eff) / 0.42)));
        const sgn_w = st.omega[w.id] >= 0 ? 1.0 : -1.0;
        const T_net = (ws.isAirborne ? (T_drive - T_brake * sgn_w) : (T_drive - T_brake * sgn_w - Fx_t * w.Re));
        /* I1(G31-FR)：只有驱动轮承担传动链反射惯量（每驱动轮值 ptIwDrive）。 */
        const iwEff = this.Iw + ((ptIwDrive > 0 && POWERTRAIN.isDriveWheel(w.id)) ? ptIwDrive : 0);
        const d_omega = T_net / iwEff;
        st.omega[w.id] += d_omega * dt;
        
        this.telemetry.Fz[w.id] = Fz_w;
        this.telemetry.Fdamp[w.id] = Fdamp[w.id];
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
      // I-3(G31-P6-fix)：子步末更新 tcsEstimate（后轮 tcsScale 均值）——仅供下一子步 dm.tcsRear
      //   （能量通道）使用，不再乘到 demand.throttle（机械通道由轮循环内 tcsScale 单独切）。
      //   语义修正：ctrl.throttle<=1e-6（没给油）时置 1——“没给油”≠“TCS 全切”（tcsScale
      //   在除零守卫下恒为 0，若不修正会把“零油门”误当作“TCS 全切”传给下一子步，
      //   导致油门 onset 时能量通道丢一子步）。
      this._tcsEstimate = (ctrl.throttle <= 1e-6) ? 1
        : ((_tcsCntRear > 0) ? (_tcsSumRear / _tcsCntRear) : 1);
      
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
      /* S7（M20）· 气动力改用**合速度** √(u²+v²) 而不是只用 u。
         旧式只取纵向分速 ⇒ 大侧滑角（漂移、高速弯）时阻力与下压力被系统性低估。
         ⚠ 这是一处**修正**不是缺陷补偿：真实气动力取决于相对空气的合速度。 */
      const v2 = st.u * st.u + st.v * st.v;
      const aeroScale = v2 / (aeroRefSpeed * aeroRefSpeed + 1e-5);
      const drsOn = !!(ctrl && ctrl.drs);
      /* S7：CdA 显式参数（m²）。缺省 = 旧拍板常数的乘积（轻车 0.35×0.9=0.315、
         重车 0.35×1.8=0.63）⇒ **缺省逐位兼容**，但现在是**可标定量**而非常数。
         ⚠ 旧式把 Cd(0.35) 与面积(1.8 m²) 糊成一个系数，无法按真车 CdA 标定
            （带翼 GT3 的 CdA 量级与 FSAE 差 2 倍以上）。 */
      const CdA = numQ(qsA.cdA, (this.m < 400 ? 0.35 * 0.9 : 0.35 * 1.8));
      const F_drag = 0.5 * 1.225 * CdA * v2 * (st.u >= 0 ? 1.0 : -1.0)
                   * (drsOn ? numQ(qsA.drsCdScale, 0.72) : 1.0);
      const geHref = numQ(qsA.geHrefMm, 100) / 1000.0;
      const geGain = numQ(qsA.geGain, 0.5);
      const geHmin = numQ(qsA.geHminMm, 30) / 1000.0;
      const geFloor = numQ(qsA.geFloor, 0.80);
      const geMax = 1.0 + geGain * (geHref / geHmin - 1.0);
      /* S7：地面效应**失速段**（可选，缺省关闭 ⇒ 逐位兼容）。
         真实地效车在车底净高过低时气流被截断/分离，下压力会**崩塌**而不是继续按
         1/h 单调上升。旧式 ge(h) 单调 1/h 且钳到 geMax，没有失速环节。
         `geStallMm`：开始失速的净高；低于它用 smoothstep 把 cl 平滑衰减到 0
         （用 smoothstep 而非阶跃：避免与车身 Z 的闭环出现"吸地→失速→弹起→再吸地"
         的双稳态跳变）。缺省 0 = 关闭。 */
      const geStall = numQ(qsA.geStallMm, 0) / 1000.0;
      const aeroGe = (hM) => {
        let g = Math.max(geFloor, Math.min(geMax, 1.0 + geGain * (geHref / Math.max(hM, geHmin) - 1.0)));
        if (geStall > 0 && hM < geStall) {
          const t = Math.max(0.0, hM) / geStall;
          g *= t * t * (3.0 - 2.0 * t);   // smoothstep：h→0 ⇒ g→0
        }
        return g;
      };
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
      /* A4：车身垂向惯量用**簧载质量**（S13 开）；关时沿用总质量，逐位兼容。
         平面方程（SumFy/SumFx 与横摆/侧倾/俯仰力矩）仍用 this.m = mTotal —— 总惯性正确。 */
      const mBody = this.wheelDof ? this.mSprung : this.m;
      let SumFz = (F_susp.FL + F_susp.FR + F_susp.RL + F_susp.RR) - (mBody * 9.81 * cosA + F_down);
      
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
      /* S2(c) 先例（横摆那条已退到 0 且完全稳定）⇒ 这两条同样参数化，便于扫描退阻尼。
         ⚠ 旧式**只用前轴刚度** Kw_F 算参考临界阻尼，忽略后轴 ⇒ 实际阻尼比低于名义值。 */
      const C_pitch_damp = Math.sqrt(this.Kw_F * this.a * this.a * this.I_pitch) * this.pitchDampK;
      const C_roll_damp = Math.sqrt(this.Kw_F * (this.tF / 2.0)**2 * this.I_roll) * this.rollDampK;
      /* S2(c)：系数改为可配置（缺省 0.75 = 历史值）⇒ 退阻尼时不必改代码。 */
      const C_yaw_damp = this.I_yaw * this.yawDampK;

      // Restoring Pitch moment
      // P2a：删 0.15·(b−a) 近似（旧 F_aero_pitch）——分轴下压按其轴平面力臂作用：
      //   前轴 y=+a 向下压 → 低头（−F_down_f·a）；后轴 y=−b 向下压 → 抬头
      //   （+F_down_r·b）。俯仰沉浮 → 分轴车底净高/ge(h) 闭环 → 轴荷分配由弹簧
      //   俯仰平衡自动闭合（不再需要偏置伪力矩）。CoP 取轴平面，未建模前翼/尾翼
      //   相对轴平面的伸出量——几何量级合理近似，可由 ge 标定继续修正。
      const M_aero_pitch = F_down_r * this.b - F_down_f * this.a;
      /* P33 / 线 B · B1（2026-11-19）：**纵向惯性力矩**。
         原式只有重力分量与气动力，**没有**纵向轮胎力 × 质心高这一项 ⇒
         实测全力制动 1.19 g 时 |θ| 仅 0.03°、前后轴荷几乎不转移（物理上应
         ΔFz ≈ m·ax·h_cg/wb ≈ 235·11.7·0.27/1.55 ≈ 480 N，实际只动了 ~110 N
         且前后同向，是纯瞬态残差）。
         该项是"刹车点头 / 加速抬头"的唯一来源，缺了它刹车/加速台架无意义。
         `S_config.legacyPitchInertia === true` 可回退旧行为（逐位不变）作 A/B 对照。 */
      /* 默认**关闭**（决策门，2026-11-19）：物理已验证（制动转移 477N vs 解析 469N），
         但打开后圈速仿真里的车会打转（峰值侧偏角 87°）——驾驶员/轮胎模型跟不上载荷转移。
         待 B4 轮胎同源 + 驾驶员模型升级后再翻默认。S.pitchInertia = true 显式开启。 */
      const _pitchInertia = (this.S && this.S.pitchInertia !== false) ? SumFy_tire * this.h_cg : 0;
      const SumM_pitch = (F_susp.FL + F_susp.FR) * this.a - (F_susp.RL + F_susp.RR) * this.b
                       + F_gravity_slope * this.h_cg - F_drag * this.h_cg - C_pitch_damp * st.q + M_aero_pitch
                       + _pitchInertia;
       /* 线 B · P33 侧向（2026-11-19）：侧倾力矩的**簧下横向分量**。
          原式 `SumFx·h_roll_arm` 把全部横向力（含簧下）都乘簧载臂——簧下质量
          不随车身滚转（本模型里它只有垂向 DOF），其横向惯性力作用在**轮轴高**
          （≈轮胎半径）而非簧载质心。实测口径偏差：formula +4.0% / baja +7.3%。
          正确分解：M_roll_lat = mS·ay·hArm + mU·ay·(rTire − h_axis)。
          `S.rollInertia === true` 显式开启（与 pitchInertia 同为 opt-in 决策门）。 */
       let _rollInertia = SumFx * this.h_roll_arm;
       if (this.S && this.S.rollInertia !== false) {
         const mU_ax = 2 * (this.mU_f + this.mU_r);
         const _rT = (this.S.front && this.S.front.tire && isFinite(this.S.front.tire.R))
           ? this.S.front.tire.R / 1000 : 0.26;
         const hU_ax = Math.max(0, _rT - this.h_roll_axis);
         const ayNow = Math.abs(SumFx) > 1e-9 ? SumFx / this.m : 0;
         _rollInertia = this.mSprung * ayNow * this.h_roll_arm + mU_ax * ayNow * hU_ax;
         if (!Number.isFinite(_rollInertia)) _rollInertia = SumFx * this.h_roll_arm;
       }
       const SumM_roll  = (F_susp.FL - F_susp.FR) * (this.tF / 2.0)
                        + (F_susp.RL - F_susp.RR) * (this.tR / 2.0)
                        - _rollInertia - C_roll_damp * st.p;
      const SumM_yaw   = SumMz_tire - C_yaw_damp * st.r;
      
      const d_u = SumFy / this.m - st.v * st.r - st.w * st.q;
      const d_v = SumFx / this.m + st.u * st.r + st.w * st.p;
      const d_w = SumFz / mBody;
      
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
      this.telemetry.az = SumFz / (mBody * 9.81);
      this.telemetry.aero = { downF_f: F_down_f, downF_r: F_down_r, downF: F_down, drag: F_drag, geF: geF, geR: geR, hF: hAeroF, hR: hAeroR, drs: drsOn };
      
      /* ── S2（M20）· 轮胎松弛推进（子步末尾、每子步一次）────────────────────
         用**解析精确指数** 1 − e^(−dt·vx/σ)，不是显式欧拉：
         引擎侧 transient.py 的注释已实测「显式欧拉在 dt·vx/σ > 2 时发散，
         dt=0.05 / vx=40 / σ=0.3 时比率高达 6.7」。解析解无条件稳定。
         ⚠ 系数与轮无关（同一子步四轮共用），故提到轮循环外只算一次 exp。
         ⚠ 必须在子步末尾统一推进：若在轮循环内逐轮推进，会让同一子步内
           后算的轮"看到"别的轮已更新的状态，破坏对称性（左右不等价）。 */
      if (this.relaxOn) {
        const sigma = Math.max(0.3, tpStep.Ls);
        const fRelax = 1.0 - Math.exp(-dt * Math.abs(st.u) / sigma);
        for (const w of wheels) {
          this.alphaLat[w.id] += (this._alphaSt[w.id] - this.alphaLat[w.id]) * fRelax;
          this.kappaLat[w.id] += (this._kappaSt[w.id] - this.kappaLat[w.id]) * fRelax;
        }
      }

      t_remain -= dt;
    }
  }
}
window.VehicleDynamics15DOF = VehicleDynamics15DOF;