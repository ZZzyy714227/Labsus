# 开发日志

## 2026-08-20 — 真实浏览器白屏修复（mock 漏检的真实运行错误）

- 症状：界面完整但四个 canvas 全空白。此前 mock DOM 测试"通过"但因 ctx 桩过宽 / 未走真实画布而漏报。
- 用机器上安装的 Edge 无头模式（--headless=new --dump-dom）注入诊断逐层定位，真实错误链：
  1. `let SCENE=[];` 未声明 —— drawAll 赋值与 drawView 读取直接 ReferenceError，四条 canvas 全停。
  2. HTML 缺 `id="gamma"`（重写时误删外倾输入）与 `id="tbCase"`（工具栏工况格）→ bind() 对 null 调 addEventListener，init() 异步抛错，requestSolve 从未执行。
  3. 若干 PL(...) 把半透明 al 或填充色 CC.knuF 误放进第 6 位 dash 槽 → 真实 ctx.setLineDash(字符串) 抛 "cannot be converted to a sequence"，drawView 中断 → 白屏。
- 修复：补 `let SCENE=[];`、补 gamma/tbCase 元素、把 8 处 PL 调用的 alpha/填充移回正确实参位。
- 验证（真实浏览器）：headless Edge 全流程 errs=0；tbState 显示 `VALID · sequential-bump-steer-v1 · modeler`；solver 栏就位；canvas×7；scene=314 图元/44 节点。提交 fd4bee2。

# 开发日志

## 2026-08-20 — 建模器重构：整车底盘（前+后轴同屏）+ 3D 车轮 + 交互 + 全结果展示

- 背景（用户反馈 4 点）：① 后悬架轮胎轴线呈汽车前后方向（错误）；② 后端计算完成但前端未完整展示；③ 模型应是完整底盘（前后轴同时），而非按钮切换单轴；④ 三维视图无交互。并按用户要求重新研读示例 double-wishbone-suspension.html（DWB-SIM）。
- 重写 web/modeler.html（渲染/交互架构移植 DWB-SIM 的 P2 投影/camIso/fitView/orbit/circPts 图元管线，保留后端 /api/v2/solve/hardpoints 集成）：
  1. **整车同屏**：右前(x≈0)+右后(x≈−1550)由 legacy-import 载入，两轴同时绘制；左轮由镜像生成并在求解中一起运动。删除「前轴/后轴」模型切换按钮（硬点表改「右前/右后」编辑轴标签，仅决定表格编辑对象；曲线面板保留轴的图选择）。
  2. **3D 车轮**：按外倾/前束构建自旋轴 ax=[sin t, ±cosεcos t, −sinεcos t]（右轮+Y/左轮−Y），circPts 画轮胎圆盘+轮辋+辐条+接地点；解算对 UP3/UP4 用刚性转向节局部坐标重建。实测：静态外倾−0.75°→轴指向横向(Y)且顶内倾 ✓。
  3. **三维视图交互**：等轴测左键旋转(AZ/EL)、Shift/中键平移、滚轮缩放、双击/F 适应；正交视图拖硬点(±1/snap shift 0.1)、滚轮缩放、中键平移、双击适应。4 视口各带 F/M 按钮与最大化。
  4. **全结果展示**：定位角表(4 轮 FL/FR/RL/RR 状态+6 指标)、轮边受力表(4 轮 Fz/Fx/Fy/μ/离地+推杆/横拉杆/球头残差)、整车站姿(heave/roll/pitch)、曲线(camber/toe/scrub/trail)、操稳 K(ay)/yaw/回正/调平、敏感性、CSV/JSON 导出；状态栏整批 4 轮残差。
- 修复过程：块注释 CH*/FL1 提前闭合吞掉 displayCorner；删除残留无效行 const TI=…；拖拽时清空硬点表 tbody 的 bug；重置后轴误用前种子(改 _seedR 捕获)；statusBox 累积/无 parentElement 防护。
- 验证：node --check 语法 OK；mock DOM + vm 全流程(init→solve→renderAll→drawAll)不抛异常；wheelAxis 数学抽查正确；骨骼重建(后轴 UP3/UP4 与模板吻合)、侧视图投影 后轴在左 ✓；真后端 POST solve/hardpoints 返回四角 VALID、轮心 [0,610] 与 [−1550,590]、含载荷。modeler.html 200 且新内容在线上。
- 注意：本机 8000 旧 python 进程(38632)已结束，已重启新服务(作业 pwsh-1)，浏览器刷新即见新模型；如重启服务请用 start_modeler.bat。
