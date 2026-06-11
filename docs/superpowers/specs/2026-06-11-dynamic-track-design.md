# 动态赛道演示 — 设计文档

> 日期：2026-06-11 | 状态：设计中 | 对应 PLAN 条目：动态赛道驾驶演示

## 目标

让 FSAE 赛车在可配置的赛道上"跑起来"，实时展示悬架动态效果 + 基本工程数据。先做视觉效果 + 简单工程分析，后续逐步加深动力学精度。

## 核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 赛道类型 | 平面 + 自定义障碍物 | 灵活度最高，可摆路肩/减速带/斜坡 |
| 动力学深度 | 简单动力学（弹簧-质量-阻尼） | 能自然产生侧倾/俯仰，工程基础 |
| 操控方式 | V1 自动路径跟随，V2+ 手动驾驶 | 工程分析需要可复现工况 |
| 数据显示 | V1 车体姿态 + camber/toe，V2+ 轮胎载荷 | 逐步递进 |
| 路径编辑 | 混合模式（3D 视口拖拽 + 面板数值） | 日常快摆 + 精确复现 |
| 计算架构 | Python 离线计算 + 前端回放 | 复用现有 solver，零延迟播放 |

## 架构概览

```
用户编辑路径+障碍物 → POST /api/simulate → Python 动力学仿真
                                            ├─ 1000Hz RK4 积分（车体 3-DOF）
                                            └─ 60fps 输出帧（调用现有悬架求解器）
→ trajectory JSON → 前端回放引擎 → 60fps 3D 动画 + 实时图表
```

**关键原则：** 动力学只决定车体姿态 + 4 轮位置；悬架几何解算仍由现有 solver 完成。solver 不变，仿真层薄封装。

## §1 简化动力学模型

### 自由度

车体 3 个动力学自由度：
- **Heave (z)**：车体 CG 垂向位移
- **Roll (φ)**：绕车体 X 轴（纵向）转角
- **Pitch (θ)**：绕车体 Y 轴（横向）转角

水平运动（x, y, yaw）由路径约束，不作为动力学自由度。

### 状态向量

```
s = [z, ż, φ, φ̇, θ, θ̇]  （6 维）
```

### 单步计算（1000Hz）

1. 路径跟随 → 车体参考位姿 (x₀, y₀, ψ₀)
2. 从车体状态投影 4 轮接地点世界坐标
3. 查地形高度场：ground_z = terrain.height(x_wheel, y_wheel)
4. 轮胎压缩量 = z_contact - tire_radius - ground_z（clamp ≥ 0）
5. 弹簧力 F = k · Δz + c · Δż（每轮独立）
6. 计算合力 + 合力矩 → 刚体运动方程
7. RK4 积分 → 新状态

### V1 包含

- 车体质量 + 转动惯量（Ixx, Iyy, Izz）
- 4 轮独立垂向弹簧-阻尼（wheel rate = tire spring + suspension spring 串联）
- 重力 + 地面法向力
- 路面高度场（障碍物叠加）
- 悬架运动学联动（每输出帧调 solver/bump.py）

### V1 不含（留给后续）

- 轮胎侧向/纵向力
- Anti-dive / anti-squat 几何
- 阻尼器非线性曲线
- 轮胎滑移 / 侧偏

### 参数

| 参数 | 来源 | 默认值 |
|------|------|--------|
| sprung_mass | 新增 | 150 kg（前轴 75 + 后轴 75） |
| cg_height | 新增 | 280 mm |
| Ixx / Iyy / Izz | 新增 | 40 / 80 / 80 kg·m²（估算） |
| wheel_rate | config.py | 150 N/mm（tire_spring_rate） |
| damper_rate | 新增 | 3 N·s/mm |
| tire_radius | config.py | 150 mm |
| track (front/rear) | config.py | 750 / 720 mm |
| wheelbase | 新增 | ~900 mm（从硬点派生） |

## §2 路径与地形模型

### 路径

Catmull-Rom 样条：
- 控制点 ∈ ℝ²（X-Y 平面），曲线精确通过所有点
- C¹ 连续，切线方向光滑
- Three.js 内置 `CatmullRomCurve3`（前端预览用）
- 弧长参数化输出 s → (x, y, ψ)

**速度曲线：** V1 恒定速度，V2 支持 s → v(s)（弯道减速）。

### 障碍物类型

| 类型 | 形状 | 参数 |
|------|------|------|
| 凸块 Bump | 半圆柱体（半正弦波截面） | 位置(x,y)、长度、宽度、高度 |
| 路肩 Kerb | 矩形凸台 + 倒角 | 起止点、宽度、高度 |
| 斜坡 Ramp | 梯形截面 | 起止点、宽度、起止高度 |

### 地形高度场

```
h(x, y) = max( obstacle_i.height(x, y) for all i )
```

基准平面 h=0（世界 Z=0 地面），障碍物叠加取 max。空间哈希网格缓存加速查询。

### 编辑交互

- **3D 视口：** 点击放路径点、拖放障碍物（V1 基础，V2 完善拖拽）
- **面板：** 坐标表格、参数表单、预设模板、JSON 导入导出

## §3 前端回放与仪表盘

### 回放引擎 `web/js/playback.js`

- 接收 trajectory JSON（60fps 帧数组）
- 帧间线性插值，保证流畅
- 控件：播放/暂停、逐帧、进度条拖拽、循环、速度 0.5x/1x/2x
- 播放时更新 3D 场景 + 仪表盘图表

### 仪表盘 `web/js/dashboard.js`

扩展现有 Chart.js：
- **图 1：车体姿态** — roll(°)、pitch(°)、heave(mm) 随时间
- **图 2：悬架角度** — camber(°)、toe(°) 随时间
- 竖线光标同步播放位置，可折叠面板

### 3D 场景新增

- 地形网格（半透明平面 + 障碍物色块）
- 路径线（橙色曲线）
- 障碍物预览（放置前半透明）

## §4 API 与数据流

### POST /api/simulate

请求：
```json
{
  "path": [[x0,y0], [x1,y1], ...],
  "obstacles": [
    {"type": "bump", "x": 500, "y": 200, "length": 300, "width": 150, "height": 30},
    {"type": "kerb", "x_start": -200, "y_start": 600, "x_end": 200, "y_end": 600, "width": 100, "height": 50}
  ],
  "speed": 12000,
  "duration": 8.0,
  "params": {}
}
```

响应：
```json
{
  "dt": 0.016667,
  "total_time": 8.0,
  "frames": [
    {
      "time": 0.0,
      "body": {"x": 0, "y": 0, "z": 150.0, "roll": 0, "pitch": 0, "yaw": 0},
      "wheels": [
        {"x": 0, "y": 750, "z": 0, "compression": 2.33},
        ...
      ],
      "angles": {
        "camber": [0.5, 0.5, 0.3, 0.3],
        "toe": [1.2, 1.2, 0.8, 0.8]
      },
      "hardpoints": {"CH1": [...], "UP1": [...], ...}
    },
    ...
  ]
}
```

**数据量估算：** 8 秒 × 60fps = 480 帧，每帧含全部硬点坐标（~100 个 3D 点）约 2-3KB，总量约 1-1.5MB。FastAPI 默认 gzip 压缩（JSON 压缩比约 5:1），实际传输 ~200-300KB。后续可优化为仅传变化量或二进制格式。

### 数据流

```
[浏览器] 用户编辑路径+障碍物
    │
    ▼ POST /api/simulate
[Python] src/dynamics/simulation.py
    │  1000Hz 循环：vehicle.step(dt, terrain)
    │  每 16.7ms：调 solver/bump.py → 记入输出帧
    │
    ▼ 返回 trajectory JSON
[浏览器] playback.js 逐帧插值 → 60fps 渲染
    ├─ 3D 场景更新（全部硬点 + 车体 + 轮子）
    └─ 仪表盘图表更新
```

## 文件变更

### 新增文件

```
src/dynamics/
├── __init__.py              # 模块入口
├── vehicle.py               # RigidBody3DOF + spring-damper 模型
├── terrain.py               # 高度场（基准平面 + 障碍物叠加 + 空间缓存）
├── integrator.py            # RK4 积分器
├── path.py                  # Catmull-Rom 弧长参数化
└── simulation.py            # 仿真编排（循环 + 帧输出 + 调 solver）

src/routes/dynamics.py       # POST /api/simulate 路由

web/js/
├── playback.js              # 回放引擎（插值 + 控件 + 场景更新）
└── dashboard.js             # 实时仪表盘（Chart.js）

tests/
└── test_dynamics.py         # 动力学模型单元测试
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main.py` | 注册 dynamics 路由 `app.include_router(dynamics_router)` |
| `web/js/main.js` | 接入 playback + dashboard 模块 |
| `web/js/scene.js` | 新增 terrain 渲染、路径线、障碍物色块 |
| `web/index.html` | 新增路径编辑面板 + 障碍物面板 + 回放控件栏 |
| `web/style.css` | 新面板/控件样式 |
| `src/config.py` | 新增动力学参数（sprung_mass, cg_height, Ixx, Iyy, Izz, damper_rate） |

## 实现顺序（建议）

1. **`src/dynamics/` 模块** — 纯 Python，可独立测试（先做 terrain → vehicle → integrator → path → simulation）
2. **`src/routes/dynamics.py`** — API 端点，用 curl 验证
3. **`web/js/playback.js`** — 回放引擎，用 mock 数据验证动画
4. **`web/js/dashboard.js`** — 仪表盘图表
5. **面板 UI** — index.html 路径/障碍物编辑面板 + 回放控件
6. **`web/js/scene.js`** — 地形/路径 3D 渲染
7. **端到端联调** — 完整流程跑通
