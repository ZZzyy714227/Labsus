# P6 前端整车底盘建模 + 分析面板

架构：web/chassis.html（新正式页，不破坏旧 index.html）+ web/js/chassis/* 模块，
three.js 本地 ES 模块（node_modules/three/build/three.module.js，免 CDN）。

里程碑：
1. 3D 底盘视图（整车四轮悬架 + 车架/摇臂/减震/防倾杆）+ 定位角/状态/工况 + 扫掠曲线面板
2. 载荷/受力面板 + 操稳面板 + 调平面板
3. A/B 对比 + 敏感性矩阵 + 导出按钮

数据全走 v2（/api/v2/designs、/solve、/handling、/sweep、/compare、/sensitivity）。
交互：工况/硬点 → 防抖请求 → 面板刷新；视图保持最新几何。
验证：端点契约已在后端测试锁定；前端渲染数据取自端点返回值，逐面板核对关键指标。
