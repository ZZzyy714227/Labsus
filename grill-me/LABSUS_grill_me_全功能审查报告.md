# LABSUS · /grill-me 全功能严格审查报告

- **审查日期**：2026-08-29
- **审查对象**：`LABSUS/web/dwb-pro-fullchassis.html`（7339 行）、`web/dwb-pro-allinone.html`（4253 行）、`engine/` 全部 Python 源码（约 3800 行）、`web/` 工具脚本、测试与文档
- **审查方法**：前端两文件全量通读（子代理逐行）+ 引擎逐行人工审查；所有 P0/P1 结论均经二次代码取证（引用行号已核实，基于 2026-08-28 版本文件，后续改动可能使行号漂移）
- **基线验证**：`python -m pytest tests/ -q` → **79 passed**（系统 Python 3.13.11，23.3s）。⚠️ WorkBuddy 托管 Python（3.13.12）缺 numpy/scipy/fastapi，**17 个测试模块无法收集**——环境依赖未声明（见 §13-03）

---

## 严重度定义与统计

| 级别 | 定义 | 数量 |
|---|---|---|
| **P0** | 数据正确性根基失效：算错结果/静默污染/数据丢失 | **1** |
| **P1** | 功能性缺陷：特定条件错误行为、整条链路失效、物理方法级错误 | **22** |
| **P2** | 健壮性/性能/安全：边界条件、口径不一致、性能隐患、XSS 面 | **34** |
| **P3** | 代码质量：死代码、重复、魔法数、可维护性 | **26** |

**一句话结论**：这是一个"演示能跑、单点可信、系统性防线缺位"的项目。79 项测试全绿证明的是"设计位基线正确"，而不是"功能正确"——P0 的 NaN 静默通过与 TPHYS 的 RK2 双积分这两条，意味着**用户输入偏离基线或看赛道仿真侧倾曲线时，屏幕上的数字不该被信任**。

---

## §1 机构运动学求解内核（前端 JS solveKin + 引擎 solve_pose）

- **【P0】F-01 · 前端 NaN 几何以"完美收敛"身份通过校验**
  `dwb-pro-fullchassis.html:1470-1497`。`residual()` 用 `if(d>r)r=d` 求最大残差：`d` 为 NaN 时比较恒 false，残差保持 0，`M.ok = res<0.025` 为 true。任何求解发散为 NaN 的路径（导入非法 JSON、极端硬点、`tieTrim` 异常值）都会产出 `ok=true` 的垃圾几何，并沿 metrics → 扫掠 → 报告全链路污染，UI 无任何告警。
  **建议**：`if(!(d<=r))r=d`（NaN 安全写法），并在 `solveKin` 末尾 `if(!isFinite(res)){M.ok=false;res=Infinity}`。引擎侧 `solve_pose` 因 `np.max(abs(NaN))=NaN → ok=False` 天然免疫，前后端行为不一致本身就是对拍盲区。

- **【P1】F-02 · 硬点导入/加载无有限性校验，NaN 直入求解器**
  `:4032, 4051-4056`（hpLoad/hpImport）：`saved[k].map(Number)` 只查 `length===3`，`"abc"→NaN`、`null→0` 均放行，与 F-01 叠加后静默产出垃圾。**建议**：`every(Number.isFinite)` + 单值失败即整文件拒绝并列出拒绝原因。

- **【P1】F-03 · 拖拽/键入直通全量 rebuild，交互必然卡顿**
  `:4134-4135`（拖拽每像素）、`:3387`（tieTrim）、`:3438`（表格 oninput）每次触发 `rebuild()→refreshDerived(true)`，内含 2×findLimits（最多 2×60 次 driveTo）+ 2×runSweep（45×driveTo）+ 准静态迭代。单次毫秒~百毫秒级，拖拽时连续触发。**建议**：拖拽/输入中只做 `buildMech+solveKin` 轻量路径，pointerup / debounce 300ms 后再刷新派生量。

- **【P2】F-04 · projRockerStrut 装配分支无连续性判断**
  `:1459` `branch=phi>=0?1:-1` 仅按当前相位选支，摇臂近直线位形（`hyp<1e-9` 直接 return）或跨越 φ=0 时瞬间跳支 → STRUT_IN/RCK_DMP 突跳。引擎 `solve_rocker` 用符号区间分叉但 bracket 半径表封顶 3.1 rad。**建议**：记录上一步 θ，选最近根。

- **【P2】F-05 · findLimits 在 NaN 化时返回虚假极限**
  `:1632-1639` 以 `driveTo(...)>0.035` 判极限，NaN 残差恒 false → 扫满 ±120mm 把 `S.trMin/trMax` 污染成全行程。**建议**：显式 `isFinite` 判定 + 失败即中断扫描并告警。

- **【P3】F-06 · 簧下质量两套口径**
  `:1790` unsprungMass 按节点质量表 ≈18.5kg/角，与预设字段 `mU`(18/20) 并存；refreshDerived 用前者、solveQuasiStatic 用后者。**建议**：单一来源 + 差异警告。

- **【P3】F-07 · arbGeom 静默 clamp**
  `:1544-1548` 几何不可达时 `clamp(...,-1,1)` 无告警，`ok` 字段算了没人用。

## §2 K&C 扫掠与指标层（前端 + 引擎 metrics）

- **【P1】F-08 · 同一辆车两处 ARB 侧倾刚度算法不一致**
  前端 `:1710` solveQuasiStatic 硬编码 `arbRate(0.55, …)`，右面板 `:3866-3867` 用 `mra` 动态算法。同一参数改稳定杆直径，准静态 TLLTD 与显示面板给出不同答案。引擎 `chassis.py:111-122` 又是第三套（mrArb=0.55 常量）。**建议**：统一 arbRate 函数，测试断言三处一致。

- **【P1】F-09 · TLLTD 负侧向 g 时被强制 50%（前后端同病）**
  前端 `:1767` 与引擎 `chassis.py:271`：`sum_transfer > 1 ? f/tot*100 : 50`。dFz 各项均 ∝ ay，左转（gy<0）时 sum<0 → 恒显示 50%。方向并不影响比值本身。README 宣称"TLLTD 随 G 单调变化"在负半轴不成立。**建议**：`abs(sum)>1`，或按 `sgn` 归一。

- **【P1】F-10 · 差分窗口硬编码 ±2，单位错配 + 端点钳位**
  引擎 `metrics/kandc.py:5-10` `_slope` 固定 `(y(+2)−y(−2))/4`：compliance 工况 x 轴是**力(N)**，±2N 窗口把 toe 曲线数值噪声放大 ~1000 倍（°/kN 指标脆弱）；sweep 范围 <2 时 `np.interp` 端点钳位静默失真。chassis.py `_slope` 用 ±2**°**窗口于 roll 扫掠同理。前端 `:1661-1670` 端点单侧差商 dt 减半 → 曲线端点增益虚高一倍。**建议**：统一为按最近邻采样点的中央差分（kinematics.py `_slope_at` 已是正确实现，用它），端点用单侧窗口/实际步长。

- **【P1】F-11 · 报告 Ackermann 恒 52%**
  `:4887` `ackermannPct: S.ackermann || 52`——`S.ackermann` 全文无赋值点，评级红绿灯失真。引擎 `run_steer` 的 steer 曲线还混入静态 design toe 偏置（v3service.py:364），口径亦不干净。**建议**：从 steer 扫掠真实计算，零值用 `??` 而非 `||`。

- **【P2】F-12 · 同名指标两套语义**
  `metrics/kinematics.py:78-94`（返回 MetricResult、中央差分）与 `metrics/kandc.py:13-18`（返回 float、±2 窗口）存在同名 `camber_gain_deg_per_25`/`bump_steer_deg_per_25`。调用方极易接错。**建议**：合并为单一实现。

- **【P2】F-13 · `_slope` 三处复制**
  `metrics/kandc.py`、`v3service.py:453`、`chassis.py:472` 三份拷贝，其中 v3service 还从 kandc 局部再 import 覆盖。DRY 违规。

- **【P3】F-14 · ackermann 公式疑似笔误**
  前端 `:1565` `(L?2:2)` 恒为 2，`track` 参数未参与计算。

## §3 准静态操稳与载荷转移（solveQuasiStatic / quasi_loads）

- **【P2】F-15 · 零值被 `||` 兜底吞掉**
  引擎 `chassis.py:213-214` `rcH.get("FR") or 45.0`：侧倾中心恰在地面（0mm）时被替换成 45mm；`mr.get("front") or 0.75` 同。前端 `:4872-4877` `nomF.rcH||45`、`mF.scrub||15`、`nomF.anti||28` 同病，合法 0 值变伪数据。**建议**：`??` + isFinite 判断。

- **【P2】F-16 · 侧翻失稳静默置零**
  引擎 `chassis.py:239,253` `denom>100 else roll=0`：kphi_tot < mS·G·h_arm（甩稳/顶起工况）时侧倾角静默归零，无警告。应输出 warning 或 OUT_OF_RANGE 状态。

- **【P2】F-17 · 报告簧载质量比硬编码 45/55**
  前端 `:4877` `mSprungF=S.mSprung*0.45/2` 与真实 `b/L` 分布无关，偏频/阻尼比指标系统性偏差。

- **【P2】F-18 · 评价打分双轨制**
  前端 `:4891-4897` dimScores 公式与 EVAL_BENCHMARKS 阈值体系独立，雷达图与右侧交通灯可给出矛盾结论。

- **【P3】F-19 · MR 链三路来源**
  `ax.motion_ratio` 显式 > `mr_at_zero` 数值推导 > 0.75/0.78 常量（chassis.py:305-318），transient 又静态回退 `motion_ratio or 0.75/0.78`（transient.py:87-88）——赛道仿真与准静态解算 MR 口径不同。

## §4 4-Post 台架动力学（前端 stepDyn）

- **【P2】F-20 · HUD 加速度读数不可作定量结论**
  `:1837-1853` 子步积分后又由位置反推速度并乘 0.99995（每帧 ~0.9995 强阻尼），`accz=(nv[2]−N.v[2])/h` 混合投影前后速度，物理含义不明。"暂停"不暂停（allinone `:3279` 无条件 simulate，rig 模式 stepDyn 照常积分）。
- **【P2】F-21 · 每帧 40 次全量 metrics**
  allinone `:1049` stepDyn 10 子步 × 4 机构各调一次 metrics()，子步内其实只需 cp[2]。**建议**：抽轻量版。

## §5 赛道瞬态仿真（引擎 transient.py + 前端 TPHYS）

- **【P1】F-22 · RK2 中间步双积分滞后状态（前后端同病）**
  引擎 `transient.py:180-226`：`derivs` 内直接推进 `roll_deg/pitch_deg`（L186-188）与 `ts.alpha_lat`（L150），`step()` 调 derivs 两次（k1/k2）→ 每步侧倾滞后以 2× 速率积分，**τ_eff=0.09s 而非 0.18s**；k2 评估的状态已被 k1 污染，中点法不成立。allinone `:3780-3818` 完全同构（"JS 直译"连 bug 一起直译）。所有赛道仿真的侧倾/俯仰建立过程系统性偏快。**建议**：把滞后状态推进移出 derivs，仅在 step 末尾积分一次；对拍用例必须覆盖侧倾时标。

- **【P1】F-23 · 阻力被当成下压力压到车轴上（前后端同病）**
  引擎 `transient.py:110-112`：`q.aero_force_n = df + dr` 且 `aero_bias = df/(df+dr)`——水平阻力进入垂向载荷分配，40m/s 时 Fz 虚高 ~560N（约 4% 车重）。allinone `Veh.loads`（:3726-3729）同。**建议**：垂向仅 `df`，drag 只进 `Fx`。

- **【P1】F-24 · 松弛一阶滤波无稳定性钳制（两端实现）**
  引擎 `transient.py:149-150`：`sigma=max(0.3,Ls)` 但 `dt·vx/σ` 在 dt=0.05（请求允许上限）、vx=40 时 =6.7，远超显式滤波稳定极限 → alpha_lat 振荡发散 → 整车仿真报废（仅有 diverged 兜底）。allinone 更糟：Ls 允许 0.05（设置面板最小值），无 σ 地板。**建议**：`dt*vx/σ = min(dt*vx/σ, 1.5)` 或解析精确解 `α += (αst−α)(1−e^(−dt·vx/σ))`。

- **【P1】F-25 · 发散仿真返回非法 JSON**
  `transient.py:337-348`：diverged 后 `state` 含 NaN → `summary.v_end=round(NaN)=NaN` → FastAPI 默认 `json.dumps(allow_nan=True)` 输出 `NaN` 字面量 → **前端 `JSON.parse` 直接抛 SyntaxError**，错误处理路径本身会炸。run_pose 对 NaN 指标同理（v3service.py:439）。**建议**：响应序列化前 `allow_nan=False` + 全字段 isFinite 洗刷为 null。

- **【P2】F-26 · 动力包络/制动常数与整车参数脱钩**
  `transient.py:159` `T_max/0.30` 轮半径硬编码（默认 tire_radius=325mm 却按 300 算力）；`:169` 制动上限 14000N 常数；allinone `:3761,3771` 同。

- **【P2】F-27 · 驾驶员 PI 积分未按 dt 缩放**
  `transient.py:269` `e_int += e*0.05` 假设 dt=0.05；请求 dt 允许 0.0005~0.05 → 积分增益随步长漂移最多 100 倍，调参不可移植。

- **【P2】F-28 · TPHYS 忽略 ARB**
  allinone `:3932` `karb_f:0, karb_r:0`——改稳定杆直径对赛道仿真零影响，与 solveQuasiStatic 物理分叉。

- **【P3】F-29 · 指标口径不一**
  `transient.py:335-347` max_ay 全程逐步统计，max_slip_deg 只统计末段 1200 个降采样点；`Math.round(...)||0.01`（前端 :4259）优先级错误使 `||0.01` 永不生效。

## §6 15-DOF 直线爬坡 / Skidpad 舞台（fullchassis）

- **【P1】F-30 · 15-DOF 俯仰/侧倾力矩符号与力臂错误**
  `:5518` 制动时 F_drag>0 却乘入"抬头"力矩（刹车应点头）；`:5520` 前后轴侧倾力臂都乘 `tF/2`，`tR` 被忽略——GT3 305/315 混合胎布局侧倾力臂错。
- **【P1】F-31 · 双舞台并发互搏**
  `:6156` openSkidpadStage 不像 openCircuitStage（:6882）先关其它舞台 → slope+skidpad 双 rAF 并行争写同一 `SIM.FR/FL/RR/RL`。
- **【P2】F-32 · 15-DOF 读不到真实 MR**
  `:5340-5341` 读 `S_config.front.mr`——该字段不存在（:1082-1086），恒走默认 0.75/0.78，`SIM.mrRefF/R` 从未传入。
- **【P2】F-33 · circuitStage 监听器泄漏与固定 dt**
  `:6933-6934` 每次开舞台新增 window mouseup/mousemove 监听（不清理）；`:6970` 固定 `dt=1/60`，高刷屏仿真时间被拉慢。
- **【P2】F-34 · Circuit 渲染丢图元**
  `:7272-7275` 只画 `k==="l"`，多边形面与节点全部跳过，与 slope/skidpad 渲染器不一致。
- **【P3】F-35 · 轮胎转角非积分量**
  slope/skidpad `omega*(now/1000)`（:5694, :6316）在 ω 变化时角度回跳；circuit 版（:7030）才是正确积分。

## §7 硬点管理与持久化

- **【P2】F-36 · 导出再导入丢 tieTrim**
  `:4024-4025` hpSnapshot 保存 tieTrimF/R，`:4053-4055` hpImport 不恢复。
- **【P2】F-37 · 换车型不清基线**
  `:1236` loadVehiclePreset 后 `S.baseline`/`ENG.result`/`CH.result` 残留 → Baseline Diff 拿旧车型曲线对比新车型。
- **【P2】F-38 · allinone 赛道 JSON 导入无字段校验**
  `:4172` 接受 `[[x,y],…]` → 下游 `p.x` undefined → NaN 路点静默发散。
- **【P3】F-39 · deepClone 与 JSON.parse(JSON.stringify) 双轨**（:1062 vs :1258/:3574）。

## §8 3D 渲染与四视口

- **【P2】F-40 · buildScenePRO 每帧重复计算指标 6-8 次**
  `:2167-2170` 无条件对 4 机构调 metrics()，叠加 simulate 内 2-4 次 → 单帧 6-8 次全量指标（含 isect2/arbGeom）。allinone `drawAll` 每帧重建全场景数千对象（GC 压力）。**建议**：复用 SIM 结果、脏标记重建。
- **【P3】F-41 · 死代码/重复定义**
  `:2020/2085`（circPts）、`:2025/2090`（cylinder）、`:2033/2111`（springPts）各定义两次，后者覆盖前者；allinone 同（:1239/1280 等）。改错份即白改。
- **【P3】F-42 · IC 十字线竖线画成斜线**
  `:3066-3068` 第二条应为 `(icS[0],icS[1]+7)`。
- **【P3】F-43 · 无消费方的开关**
  `:3450-3453` rigid/steer/disc 勾选无任何绘制逻辑读取；`S.show.bushing`（:2650）从未定义 → 分支永假；两套系统显示面板重复。

## §9 引擎连接层与 REST API（前端 ↔ FastAPI）

- **【P2】F-44 · XSS 面：引擎响应经 innerHTML 入 DOM**
  前端 `:3275` `E(t,c,h)` 走 innerHTML，`engineRender`（:3600-3607）/`chassisRender`（:3784，allinone :2711/:2893）把引擎 JSON 的 gains 键值、case、status 直接塞入。本机 8001 被占持即可注入 HTML。**建议**：全部改 textContent（页面其余状态栏已正确用 textContent）。
- **【P2】F-45 · 请求参数校验缺口（pydantic 层）**
  `v3models.py`：`points` 值列表不查长度/有限性（`allow_inf_nan` 默认 True，NaN 硬点可达求解器）；SweepSpec 无 min<max 校验；TireParams 无 FzNom>0/By>0 约束（FzNom=0 → `_d` 除零）；TrackPoint target_speed 无正数约束。**建议**：model_validator 补 isFinite + 范围。
- **【P2】F-46 · CORS 默认全开 + 异常 detail 泄漏**
  `server.py:56-62` 默认 `*`（任何网页可打本地引擎）；`:89,105,115` 把原始异常串进 detail 返回客户端。本地工具可接受，但应默认收紧 + detail 脱敏。
- **【P2】F-47 · 扫掠输入无 min<max 前端校验**
  前端 `:3640-3641` `parseFloat(...)||0`——清空输入静默变 0，可造 min>max payload。
- **【P3】F-48 · 超时/AbortController 四处复制**（engineRun/chassisRun/trackRun/trackStageRun）。
- **【P3】F-49 · run_pose 冗余调用**：`v3service.py:422` `make_bushings([], points)` 无意义。

## §10 综合评价报告

（F-11 Ackermann 恒 52%、F-17 硬编码轴荷比、F-18 打分双轨制已列。）
- **【P3】F-50 · 报告基准与 15-DOF/TPHYS 参数脱钩**：TRK.mu=8000/3500、ARB 32000/22000 N/m（:5440）、muPeak=1.45（:6661）等魔法数各说各话。

## §11 UI 状态 / 主题 / 快捷键 / 事件

- **【P1】F-51 · `?stage` 定时器风暴（两文件同病）**
  fullchassis `:4182`、allinone `:3286`：`setTimeout(_stageOpenSetup,…)` 写在 rAF 主循环体内 → 带参数打开后**每帧注册一个定时器**，800ms 后每帧弹一次设置窗，点取消会被反复弹回。**建议**：一次性 flag 或移出 loop。
- **【P1】F-52 · TRK 赛道遥测链路整体死亡**
  `:4214-4215` `getElementById("trkLook")`——该元素（及 trkV0/trkRun/trkStatus 面板）从未在 DOM 创建（全文件仅此一处引用）→ trackPayload 必抛 TypeError，"赛道动态遥测"功能不可用。同文件 :4219/:4353 却写了 null 防御——半途而废的功能痕迹。**建议**：补建面板或删链路；此类"永不渲染控件"应加 DOM 存在性测试。
- **【P2】F-53 · UI.sync 只增不减**
  `:3456` buildRight 每次触发都 push 全部读数闭包，`:4177` 主循环每帧全量执行——使用时间越长越卡。**建议**：重建前按区间截断。
- **【P2】F-54 · allinone 预瞄增益滑条是死控件**
  `:4182-4183` `set: v=>{}` 且每帧被 UI.sync 重置 0.9——用户拖动无效。
- **【P2】F-55 · 空格键拦截与舞台冲突**
  `:4756-4761` TRK.res 永不清空 → 空格永远被 TRK 播放分支吃掉，slope/skidpad 手刹失效。
- **【P3】F-56 · 杂项**：`initSlopeStageEvents` 绑定不存在的 `slopeStageBtn`（:4025）；`sec(...,"blu")` 类无 CSS 定义；文件头注释连抄三遍（:5048-5058）；`window._tireSpinAngles` 全局暴露；allinone `renderTrackTelemetry` canvas 只比 width 不比 height（:3411/:3433）；机位右向量靠 0.0001 兜底（allinone :4045）。
- **【P3】F-57 · 回放倍率随刷新率漂移（allinone）**
  `:3364` `Math.round(dt*speed/Δt)` 60Hz 下 adv 恒 2 → 回放 ~2 倍速。**建议**：累积时间基 `acc+=dt*speed; while(acc>=Δt){i++;acc-=Δt}`。

## §12 测试与对拍基础设施（本项目的"防线"，当前形同虚设）

- **【P1】F-58 · tphys_parity.cjs 不是对拍**
  `:30-39` 只汇总 JS 单边结果，无 Python 输入、无比较、无公差；SOLVER_FAILED 仍 `exit 0`——CI 永绿。TPHYS↔Python 的"数值逐位对标"承诺（README:88）没有机器保障，F-22 的双积分 bug 正是这样两边一起漏进来的。
- **【P1】F-59 · test_dom.js 无断言、恒 exit 0，且测错文件**
  `:4` 指向 fullchassis（旧版函数），allinone 零 DOM 测试覆盖；jsdom 无 canvas 后端会导致启动脚本中断。
- **【P2】F-60 · 测试盲区清单**
  ① NaN/极端硬点注入（F-01/F-02 若有测试当场暴露）；② compliance `_node_name` 匹配失败 → 零载荷静默路径（§13 F-61）；③ 前后端同指标一致性（ARB 三套、MR 三路、TLLTD 负 g）；④ 响应 JSON 严格性（NaN 字面量）。
- **【P3】F-61 · 对拍 runner 提取方式脆弱**：`tphys_parity.cjs:15-21` 按首个顶格 `})();` 切片，TPHYS 内部格式变化即截断错位；usage 文本写 .mjs 实为 .cjs。
- **【P3】F-62 · 文档漂移**：README.md:65 "75 项全部通过" vs 实际 79（CLAUDE.md 正确）；README:113 称 DEVLOG.md 在 LABSUS/ 下，实际在 `docs/`。

## §13 引擎求解器与组件（Python 内核补充）

- **【P1】F-63 · compliance 载荷映射失败 → 静默零载荷**
  `compliance.py:316-334`：`_node_name` 以 `allclose(atol=1.0)` 模糊匹配车身端节点，匹配失败返回 `""` → `per_node.get(node, zeros)` → 衬套载荷为 0 → compliance toe 变化恒 0，**结果看起来正常实际完全没施载**。两节点相距 <1mm 时还会错误聚合。**建议**：匹配失败抛异常（宁可 422 不可静默）；atol 收紧到 1e-6 并查重。
- **【P2】F-64 · cp_rel 默认值自相矛盾 + APPROXIMATE 承诺未兑现**
  `compliance.py:312` 默认 `[0,0,−320]` 而 API 默认 tire_radius=325；docstring（:286）承诺"标注 APPROXIMATE"但代码从不设置该状态；`corner_to_anchor_loads` 的残差（超静定）也未进入状态机（forces.py:148 → compliance.py 未消费）。CaseLoad 的 mx/my/mz 参数被 `_ = cp_rel` 式忽略（forces.py:146）——**API 收下力矩输入却不生效，无警告**。
- **【P2】F-65 · 衬套解析雅可比闲置，外层全数值差分**
  `compliance.py:200-204` TRF 数值雅可比 = 每迭代 (6·nd+1) 次残差评估 × 每次内层 200-nfev 机构重解；`bush_force_jac`（bushing.py:80）完整实现却无人调用。多衬套工况性能按 O(nd) 恶化。
- **【P2】F-66 · bushing table/spline 越界静默归零刚度**
  `bushing.py:30-33` `clip(lo,hi)` 使表外刚度按端点斜率（≈0）外推——衬套表现为"屈服变软"，物理相反且无警告；x 非严格递增 → PchipInterpolator 抛错（仅 422 兜底）。
- **【P2】F-67 · mr_at_zero 吞异常 + 后轴回退值错误**
  `chassis.py:80-81` `except Exception: return 0.75`——后轴也回退到前轴常量（应 0.78），且吞掉一切求解异常；内部 `solve_pose` 未查 `rep.ok`，失败解的 damper 长度照进 MR（:72-78）。
- **【P2】F-68 · `_apply` 视图别名**
  `solver.py:48-50` `m.nodes[i].pos = x[3k:3k+3]` 把 res.x 的切片赋给 node.pos，`set_drives`（:40）原地写 `pos[2]` 会反写 x 数组——当前调用序无害，属易踩雷别名。
- **【P2】F-69 · 角度实现双权威**
  `solver/angles.py`（UP5 当接地点）与 `v3service.pose_metrics`（:152-203，轮胎投影接地点）两套定位角数学并存、scrub/trail 口径不同；`mechanism/project.py` 192 行 PBD 投影原语**零消费者**（纯死模块）；forces.py 三个静力函数仅测试使用。
- **【P2】F-70 · axle_rc_sweep 模块级缓存线程安全**
  `chassis.py:125-153` FastAPI 同步端点跑线程池，dict 淘汰/写入无锁（CPython 下竞态良性但非零风险）。
- **【P3】F-71 · 杂项**：`solve_rocker` bisection 每次 `err(mid)*err(lo)` 重复算 err(lo)（solver.py:149）；convention.py 宣称"单一真源"（X 前/Y 右）而 API 层用 X 外/Y 前——坐标系旋转在层间手工换算，真源已被绕开；`core/models.py` V1 结构（AnalysisCase 等）几乎无消费者；DEFAULT_DWB_POINTS 与前端 PRESETS 手工同步漂移风险（v3service.py:43-53）。

## §14 服务器与工具脚本

- **【P3】F-72 · serve_nocache.py**：整体干净（127.0.0.1、ThreadingHTTPServer、no-store）。改进点：端口占用无提示；建议 `protocol_version="HTTP/1.1"`；`.cjs` MIME 落 octet-stream。
- **【P2】F-73 · 环境依赖未声明**：仓库无 requirements.txt/pyproject.toml；README 只有一句 `pip install fastapi uvicorn pydantic numpy scipy`（版本未钉）；换解释器即 17 模块无法收集（本次实测）。

---

## 最大风险 Top 5（按"错误结果到达用户的概率 × 后果"排序）

1. **F-01 + F-02（P0/P1）**：NaN 几何静默通过校验并全链路污染——数据正确性根基失效，且导入/本地存储/极端硬点均可触发。**修复成本一行代码，优先级最高。**
2. **F-22 + F-24（P1）**：TPHYS/transient 的 RK2 双积分与松弛失稳——所有赛道仿真的侧倾时标系统性偏差，高速挡直接发散；且因"JS 直译 Python"而两侧同病，对拍永远抓不到。
3. **F-52 + F-31 + F-51（P1）**：TRK 遥测链路死亡、双舞台并发互搏、`?stage` 定时器风暴——三个"新功能无回归验证"的直接证据，说明舞台类功能的验收只有肉眼。
4. **F-58 + F-59（P1）**：对拍与 DOM 测试恒 exit 0——数值回归完全没有防线，两版前端继续漂移只是时间问题。
5. **F-08/F-09/F-10/F-63（P1 集群）**：同一物理量多处实现（ARB 三套、MR 三路、差分窗口三份、载荷映射静默零）——即使单项都"基本对"，组合口径已经互相矛盾，工程结论不可交叉引用。

## 修复路线图建议

| 波次 | 内容 | 预估量级 |
|---|---|---|
| **W1（止血）** | F-01 NaN 卫哨（1 行）+ F-02 导入校验 + F-25 响应 NaN 洗刷 + F-11 删除假 Ackermann | 半天内 |
| **W2（物理正确性）** | F-22 滞后状态移出 derivs（JS/Py 同步改）+ F-23 aero 拆分 + F-24 松弛钳制 + F-09 TLLTD 符号 | 1-2 天，需重跑对拍与黄金基线 |
| **W3（防线）** | tphys_parity 改真对拍（双端输入+容差+exit 1）+ test_dom 换 allinone + 加 NaN 注入测试 | 1 天 |
| **W4（口径统一）** | ARB/MR/_slope/角度实现各归一处 + F-63 抛异常化 + F-64 状态机兑现 | 2-3 天 |
| **W5（体验与偿债）** | F-03 轻量重解算路径 + F-53 UI.sync 截断 + 死代码清理（project.py、重复定义、死开关）+ requirements.txt | 渐进 |

---

## 总体评价

**值得肯定的地方**：单文件工程完成度很高——least_squares 联合收敛 + continuation 热启动的机构求解器（残差 1e-13mm 级）、K&C 两层求解器的 TRF+Anderson 兜底、准静态三路径分解与侧倾耦合迭代、七状态可信度状态机（core/metrics.py 的 model_post_init 约束）、以及大量诚实标注（APPROXIMATE/NOT_IMPLEMENTED/OpenItem 登记），这些是有真实工程素养的设计。引擎侧 NaN 处理天然优于前端，79 项测试在基线几何上提供了真实保障。

**根本问题**：①**前端没有 NaN/异常输入的任何防线**，而前端恰是唯一接受用户输入的层；②**同一物理量 2-4 处实现**（ARB、MR、差分、定位角、载荷映射），既无一致性测试也无单一真源的强制力；③**测试与对拍基础设施只验证"happy path"且永不失败**（双 exit-0），对新增功能（舞台、TRK 面板）完全没有回归覆盖；④"演示可跑"与"数据可信"之间的鸿沟正随功能增长而扩大——本次审查的全部 P0/P1 中，没有一项会被现有测试套件捕获。

**建议的最小可信标准**：W1+W2+W3 完成前，README 中"结果具有仿真性质，使用前请自行验证"的免责声明应升级为明示"负 g 侧 TLLTD、赛道侧倾时标、导入了非法硬点的 K&C 曲线不可信"。

---

# 附录：讲义对照（第一~十一讲全量精读，2026-08-29）

> 按用户要求，在修复前完整精读 `learning/explainers/` 全部 11 讲（约 252KB），与 83 项发现交叉对照。三向结论：**印证 / 修订 / 互补**。

## A.0 讲义地图

| 讲 | 主题 | 与代码的对应 |
|---|---|---|
| 一 | 坐标系/单位/硬点语言（X 外/Y 前/Z 上；镜像生成；k_w=k_S·10³·mr²；k_φ=½k_w·t²） | 量纲纪律；2026-08-22 TLLTD 千倍量纲事故 |
| 二 | 刚体位姿与旋转（Rodrigues、四元数、Kabsch/Wahba、γ=−asin(a_z)、α=atan2(a_y,a_x)） | `_estimate_rotation` |
| 三 | 约束即数学（19 方程 2+2+10+1+1+3；转向输入轴裂缝 20.8:1） | `_build_residual` |
| 四 | 数值求解（TRF 5 evals→1e-13；GS 三宗罪；前向差分 ε_opt≈1e-8；延拓=分支保险） | `solve_pose`/`drive_to` |
| 五 | K&C 几何指标（RC 三步构造、kg/scrub/trail、中心差分 h=2 钦定） | `pose_metrics` |
| 六 | 摇臂/MR/ARB（k_w=k_S·mr²；ARB 四级链；mr_arb=0.55 校准值；摇臂三病例） | `solve_rocker`、arbRate |
| 七 | 静力链/二力杆/衬套 6DOF（四档状态机；锚点反力守恒 3.7e-12；两层求解器） | `compliance.py` |
| 八 | Pacejka MF（B/C/D/E 语义；D 载荷敏感性 Jensen 论证；松弛长度 σ=0.15~0.30m） | `tire_mf.py` |
| 九 | 准静态载荷转移三路径（φ=ma_y·h_arm/(k_φ−m_s·g·h_arm)；TLLTD 齐次陷阱；h_weighted 6% 不闭合） | `chassis.py` quasi_loads |
| 十 | 4-Post 时域（PBD 三段循环；ω·h<2；9.7× 裕度；"先算后改"） | 前端 stepDyn |
| 十一 | 验证方法论（六层金字塔；TPHYS Parity<5%；双内核"故意不同清单"） | 测试/对拍体系 |

## A.1 讲义印证的发现（修复方向不变，获背书）

- **F-01（P0）NaN 残差静默通过**：第四讲钦定 ok 判据 r<0.02、生产残差 1e-13 级。NaN 使 `d>r` 恒 false 直接架空该判据——修复（有限性卫哨）有讲义根基。
- **F-22 RK2 双积分 + F-24 松弛失稳**：第十一讲明确赛道瞬态细节"讲义未出现"（自研区），但第十讲"改参数前先算稳定性题"（ω·h<2）的纪律直接适用 dt·vx/σ≤1。两处修复照原建议执行。
- **F-23 阻力计入垂向载荷**：第九讲四轮组装公式中**只有下压力**按 bias 计入静态轴荷，第十讲确认"空气阻力未出现"。`aero_force_n = df + dr` 无任何讲义依据，删除 dr 有背书。
- **F-63 compliance 静默零载荷**：第七讲四档状态机（VALID/APPROXIMATE/COMPLIANCE_DIVERGED/SOLVER_FAILED）+ 锚点反力守恒 3.7e-12 是讲义级自检纪律。`_node_name` 匹配失败静默返零同时违背两者——抛异常化照原建议执行。
- **F-58 对拍恒 exit 0**：第十一讲验证金字塔明列 TPHYS Parity（相对差<5%）为独立一层，当前脚本使该层名存实亡。改真对拍照原建议执行。
- **F-02/F-31/F-51/F-52** 等前端 UI 项：讲义无覆盖，独立有效。

## A.2 需按讲义修订的审查建议

| 原发现 | 讲义出处 | 修订版 |
|---|---|---|
| F-10 `_slope` ±2 固定窗口 | 第五讲 | **h=2mm 是讲义为位移扫掠钦定的折中**（前提：位移残差噪声 1e-13）。原发现收窄为：仅 kandc.py 的**力轴**差分不适用（力噪声量级完全不同），位移轴保留 ±2 |
| chassis.py `denom>100` 静默置零 | 第九讲 | **该防线本身是讲义钦定的侧倾失稳判据**（k_φ,tot ≤ m_s·g·h_arm 时 φ 发散）。保留检查，但失稳时应显式报错/标记输出不可信，而非静默置零 |
| F-11 前端 `arbRate(0.55,…)` 硬编码 | 第六讲 | **0.55 是讲义打包校准值**（且 ½ 系数被讲义自标为校准包袱：严格单端定义应为 k·t² 非 k·t²/2）。不算 bug；改法=参数化+文档标注"绝对侧倾刚度携带模型不确定性，相对比较可信" |
| F-09 前端 TLLTD 负 g 恒 50% | 第九讲 | **"ay=0 占位 50%"是讲义钦定约定，保留**。bug 仅在负 g 分支未按 sgn(g_y) 镜像翻转，修复面比原建议小 |
| F-08 集群"多实现应合并" | 第十一讲 | **双内核互为审计器是刻意架构**。W4 从"合并成单一真源"改为：建立讲义要求的"**故意不同清单**"（转向输入轴、kw 来源等）+ 一致性对拍——允许合理分叉，禁止意外漂移 |

## A.3 讲义 OpenItem 代码现状取证（2026-08-29 grep 实证）

| 讲义判决项 | 讲义出处 | 代码现状 |
|---|---|---|
| 转向输入轴裂缝 20.8:1 | 第三讲 3.5 | ✅ 已修：v3service.py:217 显式 `steer_axis=(−1,0,0)`，测试对齐（2026-08-22）。⚠️ **残留**：mechanism/models.py:170 默认 fallback 仍为旧约定 `(0,1,0)`，legacy 快照同——建议改默认值防误用 |
| 回退 μ=0.9 vs MF μ≈2.25 | 第八讲 | ✅ 已修：tire_mf.py:44-46 `mu = Fy0/FzNom`（注释"2026-08-22 不再独立硬编码"），transient.py 同源 |
| kg/scrub 符号 bug（scrub 229/trail −54.7） | 第五讲 | ✅ 已修：v3service.py:179-184 注释"2026-08-22 修复符号"。⚠️ F-69 双权威（angles.py）仍在 |
| h_weighted 质心自洽断言 | 第九讲 | ✅ 已实现：chassis.py:338-344，阈 20mm warning（"第 9 讲发现"即此） |
| D(Fz) 载荷敏感性（Jensen） | 第八讲 | ✅ 引擎已实现：tire_mf.py:30-36 `LS` 参数（默认 LS=0 线性基线）。⚠️ **新增对拍点**：前端 TPHYS 的 MF 是否同步了 LS 未验证——若 JS 未带上，两侧 TLLTD 会漂移 |
| Mz 常数拖距 60mm | 第八讲 | ✅ 仍在但已标注 APPROXIMATE（tire_mf.py:61-67），符合讲义"诚实标注"纪律 |

**结论**：讲义活捉清单（5+1 项）已全部在 2026-08-22 波次落码修复。本次 83 项发现与该波次**基本互补不重叠**——讲义修的是"物理公式层"的 bug，本次抓的是"工程防线层"（NaN 卫哨、对拍失效、口径漂移、UI 死链）的洞。修复主力按本报告 W1-W3 执行。

## A.4 讲义知识 → 修复规范增补

1. **量纲纪律**（第一讲 TLLTD 千倍事故）：变量出生即注释单位、单位换算只在边界做一次、数值对不上先查量纲——写入 W1 修复规范与代码评审清单。
2. **坐标系双血脉是已知设计**（第一讲）：X 外/Y 前/Z 上为 v3 主线，X 前/Y 右/Z 上为 V1 冻结线。F-71 的"convention.py 真源被绕开"降级为文档问题，不是 bug。
3. **阻尼非对称约定**（第十讲）：压缩 c_B=8 / 回弹 c_R=12 N·s/mm（回弹更硬防弹跳），ζ=0.50/0.75——涉及阻尼默认值的修复需对照。
4. **验证金字塔 L6（OptimumK 外部基准）**：`tests/benchmarks/test_optimumk_examples.py` 已存在，L6 空位部分已补；W3 建议核对其覆盖度。
5. **稳定性计算先行**（第十讲"先算后改"）：任何改 k_t/质量/步长的修复，先算 ω·h 裕度再动代码。

## A.5 对修复路线图的影响

- **W1/W2/W3 优先级与内容不变**，W1-W3 获讲义背书；W2 增补两条：TLLTD 修复保留 50% 占位语义、检查前端 TPHYS 是否同步 LS 参数。
- **W4 重定义**：从"口径合并"改为"故意不同清单 + 一致性对拍"（讲义第十一讲架构决策）。
- **W5 增补**：mechanism/models.py steer_axis 默认值改 (−1,0,0)；requirements.txt 钉版本（F-73）。
