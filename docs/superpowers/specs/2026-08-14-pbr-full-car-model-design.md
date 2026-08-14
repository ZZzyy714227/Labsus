# 设计规格：FSAE 整车 PBR 3D 重建（第 1 轮）

日期：2026-08-14
状态：待用户评审
来源提示词：`docs/FSAE_3D仿真提示词.md`

## 1. 背景与目标

当前 V10 工作台的 3D 视口（`web/js/scene3d.js`，149 行）只渲染悬架硬点球+连线+黑色轮胎圆柱，
是纯线框示意。用户要求推翻项目原有视觉，按 FSAE 提示词实现**最佳模型效果**：

- 动力学几何分析相关部件（车架、悬架、转向、车轮）建模精度最高；
- 非动力学内容（发动机、轮毂、座椅等）只需大致示意模型；
- 目标是"尽可能还原真车"（无真车 CAD 数据，以现有 RWTH Aachen E99 对齐后的坐标配置为基准）；
- **完整的三维点阵坐标集合**：整车所有零件顶点均以整车坐标系（X 前 / Y 右 / Z 上，原点前轴中心地面，mm）表达，可导出。

## 2. 范围

### 第 1 轮（本规格）

- PBR 场景：环境贴图、阴影、地面、抗锯齿
- 车架：`FRAME_TUBES` 130 根管件渲染为真实圆管（含 3 点 CatmullRom 曲线），节点小球保留（可编辑性）
- 悬架（前后轴，双侧）：A 臂圆管、立柱实体、推/拉杆、摇臂三角板、减震器（筒+活塞杆+弹簧线圈）
- 转向：齿条、横拉杆（含球头）、转向柱、方向盘（随转向角转动）
- 车轮：轮胎（环形实体，用求解器外倾角/加载半径姿态）、轮辋（示意）、制动盘+卡钳（示意）、接地面片
- 车身：`BODYWORK_FACES` 覆盖面三角化渲染为实心漆面/碳纤板
- 空力：前翼/尾翼（翼型采样放样+端板）、底板、扩散器
- 示意件：发动机块（含进气限流器锥、排气歧管）、座椅、头枕、防火墙
- 点阵导出：按零件分组的顶点集合，JSON/CSV 下载，UI 面板显示各零件点数
- 视角预设：俯视/侧视/前视/车手/默认（相机平滑过渡）
- 性能：静态/动态分组重建，滑块拖动 60fps

### 不在第 1 轮（后续轮次路线图）

- 悬停信息卡（中英名/材料/工艺/功能/关键参数）
- 四冲程发动机动画、气流流线示意
- 半透明剖视模式
- 防倾杆、轮毂辐条细节、制动卡钳细节、车手安全带
- 面板 UI 视觉推翻（本轮只动 3D 视口；Neo-Brutalist 面板保留）

## 3. 方案选择

| 方案 | 做法 | 结论 |
|---|---|---|
| A 后端生成网格 | Python 计算顶点经 JSON 传输 | ✗ 每次 solve 传数万顶点，慢且复杂 |
| B 导入外部 CAD 资产 | 需 STEP/GLB 文件 | ✗ 无资产可用，且不随硬点联动 |
| C 前端程序化生成 | Three.js 从现有 API 坐标数据生成网格 | ✓ 选定 |

选择 C 的理由：所有几何都来自现有坐标数据 → 点阵集合天然完整；悬架随求解器实时联动；
后端除新增一个配置段外零改动，求解器/指标/快照/测试全部不受影响。

## 4. 架构设计

### 4.1 数据流

```
init:  GET /api/defaults ──→ frame/nodes/tubes/bodywork/前翼/尾翼/底板/扩散器/params/cabin
                          └─→ hardpoints(front/rear) ──→ car.rebuildStatic(data) + car.rebuildDynamic(design hp)

拖动滑块: POST /api/solve ──→ solved UP1-5/CH5/steering_theta/rocker_*/contact_patch_*
                          └─→ car.rebuildDynamic(solved hp)
```

- 静态件（车架/车身/空力/发动机/座椅）：只在设计变更时重建
- 动态件（悬架/转向/车轮/接地面片）：每次 solve 重建

### 4.2 坐标约定

- 所有构建函数只产出**整车系坐标**（X 前、Y 右、Z 上、mm）
- 世界变换集中在 `carGroup` 一个 `Matrix4` 上：`world = (carX, carZ, -carY)`
  （当前逐点 `toWorld()` 调用全部取消）
- 点阵收集 = 直接读几何 `position` 属性（无需逆变换），保证"坐标即所见"

### 4.3 新模块 `web/js/car3d/`（每文件单一职责）

| 文件 | 职责 |
|---|---|
| `materials.js` | PBR 材质调色板（钢管/机加工铝/碳纤/橡胶/漆面/阳极色）、灯光、RoomEnvironment、地面+阴影 |
| `primitives.js` | 车架系基本体：tube(a,b,r)、box、plate、torus、disc、cone；均挂 `userData.part` |
| `frame.js` | 车架管件（直线+CatmullRom 曲线管）+ 节点球 |
| `suspension.js` | A 臂、立柱（kingpin 轴局部坐标系构建）、推/拉杆、摇臂三角板、减震器+弹簧 |
| `steering.js` | 齿条、横拉杆、转向柱、方向盘（steering_theta × 转向比 3.5） |
| `wheels.js` | 轮胎（外倾角/加载半径姿态）、轮辋、制动盘、卡钳、接地面片 |
| `body.js` | BODYWORK_FACES 三角化漆面/碳纤板、防火墙 |
| `aero.js` | 翼型采样（NACA 拱度+厚度）放样、端板、底板、扩散器 |
| `furniture.js` | 发动机块+限流器锥+排气歧管、座椅、头枕（示意级） |
| `pointset.js` | 顶点收集（按 userData.part 分组）、JSON/CSV 序列化、下载 |
| `car.js` | 编排：`rebuildStatic(data)` / `rebuildDynamic(hp, solveResult)`、static/dynamic 分组、carGroup 矩阵 |

修改文件：
- `web/js/scene3d.js` — 精简为 init（相机/OrbitControls/渲染器）+ 调用 car 模块；删除旧线框构建
- `web/js/main.js` — 装配 defaults 数据 → car.rebuildStatic；solve 结果 → car.rebuildDynamic
- `web/index.html` — 视口工具栏（视角预设按钮 + 点阵导出按钮/面板）
- `web/style.css` — 视口工具栏样式

后端修改：
- `src/config.py` — 新增 `CABIN` 配置段（方向盘/座椅/发动机/防火墙示意件的坐标与尺寸常量）
- `src/routes/hardpoints.py` — `/api/defaults` 增返 `"cabin": CABIN`

### 4.4 部件清单与精度分级

| 级别 | 部件 | 实现 |
|---|---|---|
| 精 | 车架管件 | TubeGeometry 沿管轴，默认半径 12.7mm |
| 精 | A 臂 | 圆管 V 形 + 两端球铰壳（小圆柱） |
| 精 | 立柱 | kingpin 轴局部系（UP1→UP2 为 z，UP5 叉乘得 x，spin 轴 y）内构建实体板+轴承座 |
| 精 | 推/拉杆 | 圆管 + 球铰壳 |
| 精 | 摇臂 | 三角板（RK_PIVOT/RK_DAMPER/CH5 三点），随求解结果自然旋转 |
| 精 | 减震器 | 外筒 + 活塞杆 + 弹簧螺旋（TubeGeometry 沿螺旋线），长度用 rocker damper 运动学 |
| 精 | 横拉杆/齿条 | 圆管 + 齿条横杆（FL1 位置、随 rack_displacement 平移） |
| 精 | 轮胎 | 环形实体，姿态用求解器 spin 轴 + 加载半径；接地面片用 contact_patch |
| 示 | 轮辋/制动盘/卡钳 | 圆盘+盒体 |
| 示 | 发动机/限流器/排气/座椅/头枕/防火墙 | 盒体/圆柱组合，坐标来自 CABIN |
| 中 | 车身覆盖面/空力 | 三角化漆面板、翼型放样面、端板 |

### 4.5 材质与光照

- 钢管：metalness 0.85 / roughness 0.35，色 #8899cc 基调（尊重 FRAME_TUBE_COLORS 覆盖）
- 机加工铝：0.9 / 0.4；碳纤：0.6 / 0.55 深灰；橡胶：0.05 / 0.95；漆面：0.35 / 0.5 用配置色
- 环境：`three/addons/environments/RoomEnvironment.js` + PMREMGenerator
- 光照：环境光 + 主平行光（castShadow）+ 半球光；地面接收阴影，无背景网格线（保留淡网格可选）

### 4.6 点阵导出（一等交付物）

- 收集器遍历 `carGroup` 下所有 Mesh，按 `userData.part`（零件名，中英）分组
- JSON 结构：`{meta:{units:"mm",coordinate_system:"car frame (X forward, Y right, Z up)"}, parts:{name:[[x,y,z],...]}}`
- CSV：`x,y,z,part`
- 下载按钮 + 复制按钮；面板显示各零件点数与总数
- 全前端实现，无后端接口（几何即数据源，避免双源不一致）

### 4.7 视角预设

俯视/侧视/前视/车手/默认五按钮；相机 position + controls.target 平滑过渡（简单 lerp 或直接设置，
首轮不做补间库）。车手视角 = 座椅前方、眼高约 550mm。

## 5. 错误处理与降级

- 求解失败：动态件保持上一次成功姿态，状态栏提示（现有逻辑）
- 数据缺失：某硬点/节点缺失时跳过该件（现有 rebuildCar 的 `if (p[k])` 风格），不抛异常
- 环境贴图失败（CDN 不可用）：降级为半球光+平行光，材质仍可用

## 6. 验证方案

1. `python run.py` + `web` 目录 `pnpm dev`（Vite 5173 代理 :8000）或 `pnpm build` 后静态访问
2. 视觉清单：整车完整（车架/悬架/转向/车轮/车身/空力/发动机示意）、无 z-fighting、无穿模
3. 联动：拖前轮跳/转向滑块，悬架/摇臂/减震器/车轮/方向盘实时联动
4. 性能：滑块拖动过程 DevTools 帧率 ≥ 55fps
5. 点阵：导出 JSON/CSV，零件名与点数合理（数量级 10⁴–10⁵）
6. 回归：`pytest` 全绿（后端求解器未动）

## 7. 风险

- 覆盖面数据有历史空行/乱序（config 格式冗余）：实现时按内容解析，不改数据
- CDN importmap 依赖网络：RoomEnvironment 失败时降级（见 §5）
- 首轮网格质量是"程序化示意"上限：真车级还原需 CAD 数据（后续路线 B 可插入）
