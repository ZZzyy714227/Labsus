# 开发日志

## 2026-08-20 — UI 细节打磨 + 补齐「计算全部呈现」（整车指标面板/轴级曲线/主销接地点）

- 用户：面板功能不如参考丰富？计算是否都被合适呈现？UI 细节再优化一轮。
- 根因：后端 v2/sweep_v2 其实算了全套指标（运动速比/外倾增益/跳动转向/包容角/阿克曼/抗俯仰-抗蹲/顶升/轴距-轮距变化/侧视瞬心），但内联 /solve/hardpoints 用的 _sweep_curves 只回 curves、不回 metrics —— 前端根本没拿到，即"算了却没呈现"。
- 后端（v2.py）：抽出共享 _sweep_metrics(dv,cv,axle,axis,sw)，内联求解的 sweep 也携带 metrics；sweep_v2 复用同一函数（删除重复块）。回归 test_v2_api 43 passed。
- 前端新增/增强：
  1. 右栏新增「整车指标 Vehicle Metrics」面板：运动速比/外倾增益°/25/跳动转向°/25/包容角R-L/侧倾中心高RC@0/抗俯仰(前)-抗蹲(后)/顶升/轴距Δ/轮距Δ/侧视瞬心，随所选轴&扫描轴切换；行带悬停说明与状态色。
  2. 曲线区新增「轴级指标曲线」：travel 显示 RC 高 + 轮距Δ（双轴）、rack 显示阿克曼%。
  3. 定位角表新增「主销接地 X / Y」两行（来自 steering_axis.ground_point）。
  4. UI 细节：右侧分节可折叠（＋/−）；节标题 2px 强调条 + hover；指标表行悬停 title 说明；轴级图注脚说明。
- 验证：strict-ctx mock 指标面板/主销接地/动画全绿、错误 0；真实 Edge 无头 — 8 画布、求解跑、指标面板显示 运动速比·抗俯仰、主销接地 Y、可折叠、非加载中。live 200。
- 提交：后端 v2.py + 前端 modeler.html + DEVLOG。

# 开发日志

## 2026-08-20 — 动画流畅度 + 右侧黄色提示闪烁修复

- 用户：① 最右侧黄色提示反复闪、重叠看不清；② 动画帧率偏低、卡顿。
- 黄色提示根因：状态区 #statusBox 用了 .ctl 两列 grid 布局，放入多行警告后挤压重叠；且播放中每次求解(~90ms)都会把 4 轮残差警告(非零行程时 APPROXIMATE → 超阈值警告)整块重绘 → 右侧黄字持续闪。
- 修复：statusBox 改为普通块(行高1.7)不重叠；**播放中只显示一行"播放中：实时求解"、警告压缩到暂停后显示**；图表在播放中不再反复清空(无 sweep 时不重绘)。
- 帧率：后端求解节流 90→78ms；每帧场景重建成本大幅下降 — 螺旋弹簧 150→72 段、车轮/轮胎圆 40→26、轮辋/制动盘 32→24、辐条毂 22~16、球头 12→10、盘辐 16→12、胎带 22→14、转向机壳体 14→12；暂停空闲时不再每帧重绘(needsDraw 节流)。
- 验证：strict-ctx mock(setLineDash 非数组即抛) 全绿、动画 travel 自走、四角点正确、错误 0；真实 Edge 无头 — 7 画布、求解跑起来、状态显示"播放中"(无警告闪)、非"加载中"。live 200。

# 开发日志

## 2026-08-20 — 完整交互 + 动画仿真 + 建模细节对齐参考（DWB-SIM）

- 痛点（用户）：交互不够、建模细节与参考有差、要求完整交互/完整功能，含初始状态自动轮跳与转向等模式；再次研习 double-wishbone-suspension.html 后重写 web/modeler.html。
- **仿真动画**：requestAnimationFrame 动画循环；运行/暂停(Space)；跳动激励(静态/正弦/三角)+幅值/频率；转向激励(静态/正弦/三角)+幅值/频率；侧倾 ROLL 输入映射四轮行程差；初始默认 播放+正弦轮跳 随页面自动滚动。后端求解按 90ms 节流 + **姿态插值**(两帧间平滑运动，60fps 视觉) 。
- **交互补全**：等轴测 左键旋转/Shift·中键平移/滚轮缩放；正交 拖动硬点(Shift 0.1mm 捕捉)/滚轮缩放/中键平移/双击+F 适应/F 键/1-4 最大化；键盘 Space/方向键(轮跳)/Shift+方向键(齿条)/F；左栏 AZ/EL 滑块+全部适应+还原视角；显示层开关(节点/标签/连杆/立柱面/弹簧/车轮/制动盘/车架/转向机/防倾杆/尺寸角度/轮胎遮罩/对侧)。
- **建模细节**：螺旋弹簧+减振器(车架 CH5↔推杆 UP4, 弹簧座/减振杆)；转向机(壳体/输入小齿轮/随动齿条轴)；防倾杆(扭杆+连杆→下球头 LBJ)；制动盘+辐条+毂+卡钳骨架；轮胎 3D 圆盘+轮辋5辐条+毂+可开轮胎遮罩；减振塔顶板；球头三向圆环。
- **标注(尺寸/角度)**：正视图 外倾γ弧+主销内倾KPI弧+Scrub尺寸线；侧视图 后倾弧+拖距尺寸线；俯视图 前束弧+轮向线+中心线。
- **面板**：左=仿真控制/输入/视图/硬点/A-B；右=四轮定位角/受力/状态/曲线(前/后轴+travel/rack)/操稳调平/敏感性/导出；状态栏 node/rigid/elastic/残差/fps/cursor/hint；帧率 tbFps。
- 验证：strict-ctx mock(setLineDash 非数组即抛) 全流程无错 — id 全存在、脚本可跑、动画 travel 自 0→17.88mm、四角 UP5 正确、VALD；真实 Edge 无头 — errs=0、动画心跳 t 0→2.17s、scene=565 图元、7 画布、状态 APPROXIMATE(非零行程解算的诚实状态)；live 200。
- 注意：播放中后端按角求解(DWB 风格准静态)；暂停后自动补扫掠曲线。

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