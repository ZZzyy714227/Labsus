# FSAE 底板 + 扩散器参数化设计规范

> 日期: 2026-06-10
> 状态: 已确认，待实施

## 1. 概述

为 FSAE 悬架分析工具的 3D 可视化系统新增底板 (undertray) 和尾部扩散器 (diffuser) 的参数化定义与渲染能力。采用与前后翼相同的参数化范式：config.py 定义数据结构，前端 Three.js 渲染几何体，API 支持持久化保存。

底板和扩散器分拆为两个独立的配置对象（UNDERTRAY_CONFIG + DIFFUSER_CONFIG），但渲染时作为一个连续的底面组件呈现。

## 2. 设计决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 渲染方式 | 完全参数化 | 与前后翼范式一致，可调参 |
| 几何类型 | 多通道 + 边缘翻转翼 | 最接近现代 F1 底板概念 |
| 数据结构 | UNDERTRAY_CONFIG + DIFFUSER_CONFIG 分拆 | 各部分独立可调，扩散器起始位置可单独微调 |
| 翻转翼归属 | UNDERTRAY_CONFIG | 翻转翼是底板边缘的气动密封装置 |

## 3. UNDERTRAY_CONFIG 数据结构

```python
UNDERTRAY_CONFIG = {
    "enabled": True,

    # 底板轮廓参数
    "front_x": 250.0,       # mm, 底板前缘 X 坐标（前隔板后方）
    "rear_x": -895.0,       # mm, 底板后缘 X 坐标（后轮附近）
    "ground_clearance": 28.0,  # mm, 离地间隙 (≥25.4 FSAE规则)
    "half_width": 360.0,    # mm, 底板半宽（不超轮距375mm）

    # Venturi 微凹（底板中央低于边缘，形成喉部加速）
    "venturi_depth": 15.0,  # mm, 中央下沉量（0=完全平直）
    "venturi_start_ratio": 0.3,  # 从前缘 30% 开始收缩
    "venturi_end_ratio": 0.6,    # 到前缘 60% 收缩结束

    # 边缘翻转翼 (flip-up)
    "edge_flipups": [
        {
            "name": "FLIPUP_R",
            "side": "right",
            "start_ratio": 0.55,   # 从底板前缘 55% 处开始
            "length": 300.0,       # mm, 翻转翼纵向长度
            "height": 40.0,        # mm, 上翻高度
            "angle": 35.0,         # 度, 翻转角度
        },
        {
            "name": "FLIPUP_L",
            "side": "left",
            "start_ratio": 0.55,
            "length": 300.0,
            "height": 40.0,
            "angle": 35.0,
        },
    ],

    # 底板栅条 (underfloor strakes)
    "strakes": [
        {
            "name": "STRAKE_R1",
            "side": "right",
            "y_ratio": 0.85,       # 横向位置 (0=中心, 1=边缘)
            "start_ratio": 0.35,   # 从底板前缘 35% 开始
            "length": 400.0,       # mm
            "height": 25.0,        # mm
            "angle": 50.0,         # 度, 相对底板面的倾斜角
        },
        {
            "name": "STRAKE_R2",
            "side": "right",
            "y_ratio": 0.45,
            "start_ratio": 0.40,
            "length": 350.0,
            "height": 20.0,
            "angle": 45.0,
        },
        {
            "name": "STRAKE_L1",
            "side": "left",
            "y_ratio": 0.85,
            "start_ratio": 0.35,
            "length": 400.0,
            "height": 25.0,
            "angle": 50.0,
        },
        {
            "name": "STRAKE_L2",
            "side": "left",
            "y_ratio": 0.45,
            "start_ratio": 0.40,
            "length": 350.0,
            "height": 20.0,
            "angle": 45.0,
        },
    ],

    # 挂点 (连接车架的支撑位置)
    "mounts": [
        {"name": "UT_MOUNT_FR", "frame_node": "FB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_FL", "frame_node": "FB_LWR_L", "local_y": -80},
        {"name": "UT_MOUNT_RR", "frame_node": "RB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_RL", "frame_node": "RB_LWR_L", "local_y": -80},
    ],

    "color": "#22c55e",
    "opacity": 0.70,
}
```

参数说明：
- `front_x` / `rear_x` 使用绝对车坐标（X 前方为正），不采用 reference_point + 偏移的模式，因为底板位置需要精确对齐车架节点（前后隔板位置）
- `venturi_*` 用 ratio 而不是绝对坐标，这样底板长度改变时微凹区域自动跟随
- 左侧翻转翼/栅条的 `side: "left"` 会被渲染器镜像处理（Y 取负）
- `y_ratio` 控制栅条在底板宽度上的位置（0=中心线，1=最外边缘）

## 4. DIFFUSER_CONFIG 数据结构

```python
DIFFUSER_CONFIG = {
    "enabled": True,

    # 扩散器起始位置
    "start_x": -895.0,      # mm, 扩散器入口 X 坐标（=底板后缘）
    "length": 200.0,        # mm, 扩散器纵向长度（从入口到出口）
    "angle": 10.0,          # 度, 扩散器扩张角 (推荐 8-12°, >12° 气流分离)

    # 通道参数
    "channels": 3,          # 纵向栅条数量，将扩散器分为 4 个通道
    "strake_height": 35.0,  # mm, 扩散器栅条高度（竖直隔板）
    "strake_angle": 75.0,   # 度, 栅条相对底板的倾斜角（越陡密封越好）

    # 出口参数
    "exit_half_width": 390.0,  # mm, 扩散器出口半宽（比底板宽 30mm）
    "exit_overhang": 20.0,     # mm, 出口向后方延伸量

    # 挂点
    "mounts": [
        {"name": "DIFF_MOUNT_R", "frame_node": "RB_LWR_R", "local_y": 80, "local_x": -20},
        {"name": "DIFF_MOUNT_L", "frame_node": "RB_LWR_L", "local_y": -80, "local_x": -20},
    ],

    "color": "#f43f5e",
    "opacity": 0.60,
}
```

参数说明：
- `start_x` 默认等于底板 `rear_x`，但可以独立微调（比如让扩散器入口比底板后缘稍前几毫米）
- `channels` = 3 表示 3 条栅条，将扩散器分为 4 个通道
- `exit_half_width` = 390mm = 360+30，出口比底板更宽，这是物理正确的（扩散器出口通常比入口宽）
- `strake_height` 和 `strake_angle` 不同于底板栅条（undertray strakes 是外推涡流的小翼，diffuser strakes 是竖直隔板），后者更陡更高

## 5. 前端渲染架构

### 5.1 渲染组件清单

| 组件 | 渲染方式 | 文件位置 |
|------|----------|----------|
| 底板面板 | MeshStandardMaterial, 半透明绿色 | builders.js: `buildUndertray()` |
| Venturi 微凹 | 底板面板 Z 坐标按 ratio 下沉 | 同上 |
| 边缘翻转翼 | 独立 mesh，从底板边缘上翘 | 同上 |
| 底板栅条 | 小型竖直面板，沿底板纵向布置 | 同上 |
| 底板挂点 | Sphere + LineSegment，与前后翼挂点同模式 | 同上 |
| 扩散器面板 | MeshStandardMaterial, 半透明红色 | builders.js: `buildDiffuser()` |
| 扩散器栅条 | 独立竖直隔板 mesh | 同上 |
| 扩散器挂点 | Sphere + LineSegment | 同上 |

### 5.2 底板渲染细节

底板面板是一个横向长条形 mesh，前缘到后缘用 CatmullRom 曲线定义纵向轮廓（平直段 → Venturi 微凹 → 平直段 → 扩散器起始）。横截面为矩形，宽度 = 2 × half_width。

具体步骤：
1. 沿 X 方向采样若干点（前缘到后缘），每个点的 Z 坐标根据 venturi 参数计算：前段平直，中间下沉 venturi_depth，后段平直
2. 用这些点构造 CatmullRomCurve3 定义纵向脊线
3. 横向展开：左右各 half_width，构成网格
4. 用 chassisTransform() 转换到世界坐标

边缘翻转翼渲染：
- 从 start_ratio 对应的 X 坐标开始，沿底板边缘纵向延伸 length mm
- 用 CatmullRomCurve3 定义翻转翼的曲率（从底板平面逐渐上翘到 height，角度 = angle）
- 渲染为独立的面板 mesh，贴在底板侧缘

底板栅条渲染：
- 每条栅条是一个小型竖直面板（从底板面上方 angle° 倾斜，高度 height）
- 起始位置由 start_ratio 和 y_ratio 计算
- 沿纵向延伸 length mm

### 5.3 扩散器渲染细节

扩散器是一个从底板后缘开始上翘的扩张面。入口与底板平齐（Z = ground_clearance），出口上抬 length × tan(angle) mm。

具体步骤：
1. 入口宽度 = 底板宽度 (2 × half_width)，出口宽度 = 2 × exit_half_width
2. 入口 Z = ground_clearance，出口 Z = ground_clearance + length × tan(angle)
3. 用三角网格构造扩张面板（入口到出口的梯形曲面）
4. 栅条：3 条竖直隔板，从入口到出口，高度 strake_height，倾斜 strake_angle°

### 5.4 状态管理

在 state.js 中新增：
```javascript
state.undertrayConfig = null;   // 从 /api/defaults 获取
state.diffuserConfig = null;
state.sceneObjects.undertray = {
    meshes: [],       // 底板面板 mesh
    flipups: [],      // 翻转翼 mesh 列表
    strakes: [],      // 栅条 mesh 列表
    mountSpheres: [],  // 挂点球体
    mountLines: [],    // 挂点连线
};
state.sceneObjects.diffuser = {
    meshes: [],       // 扩散器面板 mesh
    strakeMeshes: [], // 扩散器栅条 mesh
    mountSpheres: [],
    mountLines: [],
};
```

## 6. 后端 API 变化

### 6.1 GET /api/defaults 响应扩展

当前响应结构新增：
```json
{
  "undertray": UNDERTRAY_CONFIG,
  "diffuser": DIFFUSER_CONFIG
}
```

### 6.2 新增 API 端点

```
POST /api/save_undertray   — 持久化 UNDERTRAY_CONFIG 到 config.py
POST /api/save_diffuser    — 持久化 DIFFUSER_CONFIG 到 config.py
```

与 save_rear_wing / save_front_wing 实现模式相同：接收 JSON body，更新内存数据，调用 persistence.py 写回源文件。

## 7. 前端 UI 变化

在右侧面板的 "空气动力学" 区域新增两个可折叠面板：

- **底板参数**：列出 UNDERTRAY_CONFIG 的可调参数（front_x, rear_x, ground_clearance, half_width, venturi_depth），每个参数有滑块 + 数值显示
- **扩散器参数**：列出 DIFFUSER_CONFIG 的可调参数（angle, length, channels, strake_height），每个参数有滑块 + 数值显示
- 翻转翼和栅条的参数暂时不需要 UI 滑块（它们是更细粒度的调参，后续可以加）

## 8. 涉及的文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/config.py` | 新增 UNDERTRAY_CONFIG 和 DIFFUSER_CONFIG 常量 |
| `src/main.py` | /api/defaults 返回新增字段；新增 /api/save_undertray 和 /api/save_diffuser 端点 |
| `src/api_models.py` | 无需新增（与 save_rear_wing 一样用 Request.json()） |
| `src/persistence.py` | 新增 `_save_undertray_to_source()` 和 `_save_diffuser_to_source()` |
| `web/js/state.js` | 新增 state.undertrayConfig / diffuserConfig / sceneObjects |
| `web/js/builders.js` | 新增 buildUndertray() / buildDiffuser() 函数 |
| `web/js/ui.js` | 空气动力学面板新增底板和扩散器参数显示与交互 |
| `web/js/solver.js` | 无变化 |
| `web/js/main.js` | 初始化时加载底板/扩散器配置并调用构建函数 |
| `web/js/scene.js` | 可能需要新增底板轮廓曲线生成辅助函数 |
| `web/index.html` | 右侧面板新增底板和扩散器参数区域 |

## 9. 不在本次范围内

- Venturi 通道的 CFD 模拟或性能计算
- 底板前缘锯齿 (floor leading edge teeth) 的建模
- 侧裙的建模
- 底板与悬架的干涉检查
- 参数化优化（如自动寻找最佳扩散器角度）