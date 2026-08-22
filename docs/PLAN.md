# 开发计划

## 里程碑

```
V1-V9:  ✅ 悬架分析器（见 DEVLOG，2026-06 前完成）
V10:    ✅ 快速迭代设计工作台（2026-08-12）— 求解器健康修复 + 4 维指标层 + Neo-Brutalist 前端重写
```

## 当前进度：V10 ✅ 快速迭代设计工作台

### 核心闭环（已可用）

```
[拖动参数/3D] → 运动学单点实时（42ms）→ 松手 → analyze 全量（290ms）+ 目标带红绿灯 → 自动快照
→ 时间线着色/回退/双快照对比
```

### 设计文档

`docs/superpowers/specs/2026-08-12-rapid-iteration-workbench-design.md`
实施计划：`docs/superpowers/plans/2026-08-12-rapid-iteration-workbench.md`

### 后续候选（未开始）

- [ ] 快速 sweep 曲线接入指标盘（MR 精确值、RC 随轮跳曲线、jacking/rc_height_delta 实算）
- [ ] 管件 CRUD / 覆盖面 / 空力面板迁移回工作台
- [ ] 多配置 A/B 保存（命名方案）
- [ ] 目标带数值按实际车校准（当前预置 FSAE 草案，结构力阈值明显偏严）
- [ ] 前后轴独立轮跳滑块（当前仅前轴 + 转向）

---

# 历史背景（2026-06 旧版 V1–V9，已被 V10 取代，以下仅供存档查阅）

## 旧里程碑

```
V1:  ✅ 前轴双侧 + 线框 + 纯轮跳 + 纯转向 + 硬点表格 + 实时角度
V1.5:✅ 后轴双侧双叉臂+拉杆 + 四轮 3D + toe link + 双轴 API
V2:   ✅ 车架管阵 + 前后摇臂三角面 + 联动运动学
V3:   ✅ 渐进式车架 — 主环 + 前环 + 前隔板 + 后隔板（28 节点，80 管）
V2.5:✅ 运动学曲线图 + 独立轮跳 + 减震器 3D 圆柱体
V4:   ✅ 轮胎缩小 + A 臂重匹配 + camber 调优 + 车架节点下移
V5:   ✅ 求解器升级（PBD→scipy LS）+ 摇臂运动学后端化 + 运动比分析
V2.8:✅ 跳转转向抑制 + 后拉杆摇臂修复 + 双击选点编辑 + 管件颜色/覆盖面
V3.0:✅ UI 重设计（双面版 + 汉化 + 3D居中）+ 硬点调整 + 转向求解器跳枝修复
V6:   ✅ 求解器延续法 + 健康标记 + 双轴 toe 参考线 + ~~束角调校面板~~（已删除）
V7:   ✅ 后轴 FL1 手动重调 + bump steer 设计层面收窄
V8:   ✅ 空力套件（尾翼+前翼+底板+扩散器）+ 车身控制点 + CatmullRom 曲线
V9:   ✅ E99 几何大修 — 整车对齐 RWTH Aachen E99 参考图（2026-06-11）
```

## 历史进度：V9（已完结，属于前代产品）

### V9 E99 几何大修（2026-06-11）

基于 RWTH Aachen E99 参考图（轴侧/侧视/俯视/前视四张）全面重建整车几何：

- **前 track 750→840mm**，后 track 720→690mm（匹配 E99）
- **ride height 前 150→120mm**，后 153→125mm（更贴地）
- **前 A 臂外扩 +43mm**，后 A 臂收窄 -15mm
- **车架节点全部 Z 降低**，主环高 530→550mm
- **新增 25+ 车身控制点**：鼻锥加密、沙漏形侧箱、引擎盖、尾翼过渡
- **前翼展宽 600→950mm**，chord 240→320mm
- **后翼展宽 600→750mm**，位置后移至 X=-1100
- **底板 clearance 28→22mm**，strakes 加密到 3+3
- **扩散器 length 200→280mm**，channels 4→5

备份：`src/config_backup_20260611.py`
设计文档：`docs/superpowers/specs/2026-06-11-e99-geometry-redesign-design.md`

### V8 空力套件（已完成）

- **尾翼（已完成）**：参数化多翼片定义（NACA 翼型截面 + 弦长/攻角/拱度/厚度），自动3D网格生成，端板+挂点，右侧管理面板
  - 3片翼：主翼面（350mm -2°）+ 襟翼一（180mm 15°）+ 襟翼二（100mm 30°）
  - 展长 900mm，参考点主环顶部 [-650, 0, 620]
  - 翼型：NACA 拱度线 + 00xx 厚度分布，攻角绕前缘旋转
  - 车身联动：`chassisTransform()` 统一坐标系
- **前翼（已完成）**:镜像尾翼架构,2 元素(主翼面 240mm 3° + 襟翼 160mm 15° camber_pct=-8),展长 1100mm(>前轮距 750mm 形成 outwash),Z=40mm 贴地布置,小型端板+鼻锥挂点
  - 参考点 [500, 0, 40](前轴前 500mm,离地 40mm,低于车架下管 Z=50-60 避免重叠)
  - 襟翼 x_offset=260 z_offset=5(LE 紧贴主翼 TE X=740,襟翼 X 范围 760-915 完全在车架 X<350 之前)
  - 端板小型化:height_above/below=10,overhang 0.02,端板 431×76mm,端板/翼面 Z 比 1.4x(原 2.1x 过大)
  - 端板不再探到地面以下(原 height_below=50 导致 Z=-36)
  - 挂点接主翼 LE 下表面:chassis (350, 60, 120) → wing LE (500, 200, 35)
  - 悬挂方向:从 chassis 上方斜向下前方到主翼 LE,ΔX=+150, ΔY=+140, ΔZ=-85
  - 挂点球半径 5→8 让连接点在缩略图更明显
  - 颜色 #34d399(绿色),与尾翼蓝色区分
  - 独立 API: `/api/save_front_wing`,独立管理面板
- **底板+扩散器（已完成）**：底部平整面+尾部上翘曲面
- **侧箱（已完成）**：前后轮之间车身包覆

### V6 已完成

- **延续法**：sweep 循环用上一步 θ 作初值，±30mm 全范围无跳枝
- **求解器健康标记**：`_solver_healthy` 字段（healthy / healthy_but_fallback / unhealthy / not_applicable）
- **双轴 toe 对比**：±1°/0° 虚线参考线 + 图例附带 toe 变化范围
- **覆盖面功能修复**：`persistence.py` 写路径 main.py→config.py，永久创建/删除可用，新增管理面板
- ~~束角调校面板~~（已删除：与参数管理流程冲突）
- 后轴 bump steer Δ10.80° 是设计问题（FL1 位置需手动重调），求解器本身稳定准确

### V3.0 已完成

- **UI 重设计**：Tailwind 暗色主题 + 双面版（左操控 300px / 右数据 340px）+ 全汉化 + 3D 摄像头居中
- **硬点调整**：前 CH1 Z 175→215，后 R_CH1/R_CH2 Y 171→204.8 / Z 135→235
- **DESIGN_PARAMS 同步**：参数化设计与手动修改统一，`hardpoint_overrides.json` 清空
- **转向求解器跳枝修复**：牛顿法收敛后分支合理性检查（|θ|>45° → 全局扫描回退），消除 25-30mm 区间 toe 104° 突变
- **求解器精度**：全范围 ±30mm 残差 0.0000mm

### V2.8 已完成

- 跳转转向抑制：前 8.57°→0.62°，后 24.81°→0.91°
- 后拉杆摇臂运动学修复：pushrod_upright_ratio 分前后配置
- 双击选点编辑 + 临时/永久保存
- 管件改色 + 加管件 + 覆盖面创建/编辑

### V2.5–V5 已完成

**求解器**：
- PBD 串行投影 → `scipy.optimize.least_squares`（`trf` 方法）混合方案
- 策略：PBD 初值 + LS 紧邻域抛光（|dz| ≤ 15mm），极端位置仅 PBD
- 正常行驶范围（±15mm）：约束残差从 ~0.2mm 降至 **机器精度**（0.000000mm）
- 极端位置（±30mm）：PBD 保持物理正确分支，残差 ~1mm
- 依赖：`scipy>=1.10.0`，无 scipy 自动回退纯 PBD

**摇臂运动学**：
- Python 端 `compute_rocker_kinematics()` 计算摇臂旋转角（bisection）
- `/api/solve` 输出 `rocker_right`/`rocker_left`（push_rod_len, rocker_angle, damper_travel）
- `/api/sweep` 新增 `damper_travel` 和 `motion_ratio` 曲线
- 前轴 motion ratio 0.27~0.57，后轴 -0.29~-0.33（拉杆常数）

### V4 已完成

- 轮胎半径 150mm（300mm OD，轴距比 33%）
- 轮胎宽度 160mm
- 立柱等比缩小（kingpin 112mm）
- A 臂硬点重新匹配（CH1/2 Z 175/178，CH3/4 Z 55/60）
- 前后轴独立轮跳滑块
- Chart.js 运动学曲线图（/api/sweep）
- 减震器 3D 圆柱体（透明粉色 + 活塞杆 + 弹簧）
- 静态 camber 修复：UP1 Y 481→491, R_UP1 Y 554→565，前/后 -2.08°
- 车架节点批量下移
- camber 范围 ±30mm bump 仅 -0.11°~-2.46°，变化量 2.35°，非常稳定

### 已知问题（按优先级）

1. **后轴 bump steer 偏大**：±30mm 内 toe 变化 10.8°，因 UCA 外扩后 R_FL1 未重新匹配（设计层面，非求解器问题）
2. **前轴 bump steer**：±30mm 内 toe 变化 3.5°，可进一步优化
3. **Bump+Steer 联动**：顺序执行 bump→steer，大位移下顺序解与同时解有微小差异
4. **多配置对比缺失**：无法保存/加载不同硬点配置进行 A/B 对比

### 下一步候选

- [ ] 后轴 FL1 手动重调（用户拖滑块看曲线 → 找最优 → 写入 config.py）
- [ ] 多配置硬点对比（保存/加载配置）
- [ ] 动力学分析（轮胎力模型代入实际弹簧/减震器参数）
- [ ] 前后轴运动耦合（车身 heave/roll/pitch）

## 历史关键参数速查（V3.0 时代，仅作对照）

| 参数 | 前轴 | 后轴 |
| --- | --- | --- |
| 轮胎半径 | 150mm | 150mm |
| 轮胎宽度 | 160mm | 160mm |
| Track | 750mm | 720mm |
| 轴距 | — | 900mm |
| UCA 内 Y | CH1=202, CH2=166 | R_CH1=205, R_CH2=205 |
| UCA 内 Z | CH1=215, CH2=228 | R_CH1=235, R_CH2=238 |
| LCA 内 Y | CH3=191, CH4=151 | R_CH3=144, R_CH4=144 |
| LCA 内 Z | CH3=55, CH4=60 | R_CH3=50, R_CH4=55 |
| Kingpin | 112mm | 112mm |
| Caster 设计值 | 5.18° | 6.00° |
| KPI 设计值 | 2.07° | 1.80° |
| 静态 camber | -2.06° | -1.79° |
| 外倾角范围 (±30mm) | -2.83° ~ -0.57° | -3.95° ~ +2.56° |
| 前束范围 (±30mm) | -0.02° ~ +3.48° | -2.31° ~ +8.50° |
| 求解器健康 | healthy（全范围） | healthy（全范围） |
| 跳枝 | 无（延续法） | 无（延续法） |

## 架构

- **后端**：`src/main.py` ~1200 行，延续法牛顿求解器 + 全局扫描回退 + 12 个 API 端点
- **前端**：`static/index.html` ~1520 行，Three.js + Chart.js + Tailwind + Lucide
- **模块**：`src/config.py` `src/geometry.py` `src/hardpoints.py` `src/tire.py` `src/persistence.py` `src/api_models.py`
- **入口**：`run.py`
- **数据**：`DESIGN_PARAMS` → `derive_hardpoints()` → `DEFAULT_HARDPOINTS` / `DEFAULT_REAR_HARDPOINTS` + 28 个 `DEFAULT_FRAME_NODES` + 80 根 `FRAME_TUBES`
- **API**：12 个端点（defaults / solve / sweep / save_point / save_tube_color / add_tube / delete_tube / add_face / delete_face / update_face / update_params）
- **持久化**：`hardpoint_overrides.json`（硬点覆盖），`main.py` 源文件写入（管件/覆盖面/车架节点永久保存）
- **测试地址**：http://localhost:8000
