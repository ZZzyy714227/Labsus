/* LABSUS 前端结构测试（F-59 修复，2026-08-30）。
 *
 * 旧版：无断言、恒 exit 0、且只测 fullchassis——防线形同虚设。
 * 新版：对两个前端入口做真断言（语法可编译 + 关键函数存在 + 已知 bug 模式回访），
 *      任何失败 exit 1。不依赖 jsdom（无 node_modules 依赖，CI 可直接跑）。
 * usage: node web/test/test_dom.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* G10（2026-08-31）：本文件自 web/ 迁入 web/test/，webDir 改指上级目录 */
const webDir = path.join(__dirname, '..');
const failures = [];
let checks = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function readHtml(name) {
  const p = path.join(webDir, name);
  ok(fs.existsSync(p), `${name} 存在`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

/** G9 拆分适配（2026-08-31）：fullchassis 已拆为薄壳 + css/ + js/ 按序 <script src> 加载。
 *  为复用全部既有源码断言，将 js/css 合成回"虚拟单文件源码"后再喂给原有检查。 */
function readFullchassisCombined() {
  let html = readHtml('dwb-pro-fullchassis.html');
  const cssPath = path.join(webDir, 'css', 'fullchassis.css');
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    html = html.replace('<link rel="stylesheet" href="css/fullchassis.css">',
                        '<style>' + css + '</style>');
  }
  const jsDir = path.join(webDir, 'js');
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
  ok(files.length >= 11, `fullchassis: js/ 模块数 ≥ 11（实际 ${files.length}）`);
  const inject = files.map(f =>
    `<script>\n/* === js/${f} === */\n` + fs.readFileSync(path.join(jsDir, f), 'utf8') + '\n</script>'
  ).join('\n');
  return html.replace('</body>', inject + '\n</body>');
}

/** 提取 <script> 内联块并逐块做语法编译检查（不执行）。 */
function scriptBlocks(html, name) {
  const blocks = [];
  const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim();
    if (!src) continue;
    blocks.push(src);
    try {
      new vm.Script(src, { filename: `${name}#inline` });
      checks++;
    } catch (e) {
      failures.push(`${name} 内联脚本语法错误：${e.message}`);
    }
  }
  ok(blocks.length > 0, `${name} 至少含一个内联脚本`);
  return blocks;
}

// ── A. fullchassis ─────────────────────────────────────────────
/* G9 拆分新增：薄壳结构断言（对真实磁盘文件） */
const fcRaw = fs.readFileSync(path.join(webDir, 'dwb-pro-fullchassis.html'), 'utf8');
ok(/<script src="js\/01-core.js"><\/script>/.test(fcRaw) &&
   /<script src="js\/11-stages.js"><\/script>/.test(fcRaw) &&
   fcRaw.indexOf('js/01-core.js') < fcRaw.indexOf('js/11-stages.js'),
  'G9: 薄壳按序引用 js/ 模块（01 首位、11 末位）');
ok(/<link rel="stylesheet" href="css\/fullchassis.css">/.test(fcRaw), 'G9: 薄壳外链 css/fullchassis.css');
ok(!/<script>/.test(fcRaw), 'G9: 薄壳已无内联大块脚本');
const fc = readFullchassisCombined();
/* G12（2026-08-31）：F-44 textContent 化的配套断言——静态标签必须走 EH()，禁止 E() 直传 HTML 字符串 */
ok(/function EH\(t,c,html\)/.test(fc), 'G12: EH 静态结构 helper 在位');
ok(!/E\("div","chk",'<i>/.test(fc), 'G12: chkList 不再经 textContent 字面渲染标签');
ok(!/E\("span",null,zh\+' <u>/.test(fc), 'G12: ro 读数标签不再字面渲染 <u>');
ok(!/E\("label",null,zh\+' <u>/.test(fc), 'G12: rowSlider 标签不再字面渲染 <u>');
scriptBlocks(fc, 'fullchassis');
ok(fc.includes('function solveKin'), 'fullchassis: solveKin 存在');
ok(fc.includes('function residual'), 'fullchassis: residual 存在');
ok(fc.includes('function trackPayload'), 'fullchassis: trackPayload 存在');
ok(/openSlopeStage|openSkidpadStage/.test(fc), 'fullchassis: 舞台入口存在');
/* 已修复 bug 的回访断言（防回归） */
ok(fc.includes('if(!(d<=r))r=d'), 'fullchassis: F-01 NaN 安全残差在位');
ok(/_stageAutoDone/.test(fc), 'fullchassis: F-51 ?stage 一次性 flag 在位');
ok(!/getElementById\("trkLook"\)\.value/.test(fc), 'fullchassis: F-52 trkLook 无裸 .value 访问');
/* F-11：假 Ackermann 已移除。注意源码注释会保留旧写法字样（`S.ackermann || 52` 是假数据），
 * 因此正则应锚定"真代码位"：isFinite 卫哨必须在，且不得再有 `S.ackermann||52` 取默认值表达式。 */
ok(!/S\.ackermann\s*\|\|\s*52/.test(fc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')),
  'fullchassis: F-11 假 Ackermann 已移除');
ok(/Number\.isFinite\(S\.ackermann\)/.test(fc), 'fullchassis: F-11 isFinite 卫哨在位');
ok(/hpValidate/.test(fc), 'fullchassis: F-02 硬点导入校验在位');
/* R-0830-3 波次新增修复的回访断言（2026-08-30 第二波） */
ok(/F-53|UI\.sync\.length=UI\.syncBase/.test(fc), 'fullchassis: F-53 UI.sync 重建截断在位');
ok(/F-36|d\.tieTrimF/.test(fc), 'fullchassis: F-36 导入恢复 tieTrim 在位');
ok(/F-37|ENG\.result=null/.test(fc), 'fullchassis: F-37 换车型清基线在位');
ok(/F-30|F_gravity_slope \* this\.h_cg - F_drag/.test(fc), 'fullchassis: F-30 制动阻力点头符号在位');
ok(/F-30|\(F_susp\.FL - F_susp\.FR\) \* \(this\.tF/.test(fc), 'fullchassis: F-30 后轴侧倾力臂 tR 在位');
ok(/F-32|SIM_data\.mrRefF/.test(fc), 'fullchassis: F-32 15-DOF 读真实 MR 在位');
ok(/F-33|_circuitDragHandlers/.test(fc), 'fullchassis: F-33 舞台监听器防泄漏在位');
ok(/F-33|CIRCUIT_STAGE\.lastTime/.test(fc), 'fullchassis: F-33 circuit dt 走真实帧间隔');
ok(/F-34|o\.k === "p"/.test(fc), 'fullchassis: F-34 circuit 渲染补多边形面');
ok(/F-35|lastSpinS/.test(fc), 'fullchassis: F-35 slope 轮胎转角积分式');
ok(/F-35|lastSpinK/.test(fc), 'fullchassis: F-35 skidpad 轮胎转角积分式');
ok(/F-40|SIM\.mFR\) \|\|/.test(fc), 'fullchassis: F-40 buildScenePRO 复用 SIM 指标');
ok(/F-42|icS\[1\]\+7/.test(fc), 'fullchassis: F-42 IC 十字线竖线修正');
ok(/F-43|halfshaft/.test(fc) && /disc_vent/.test(fc) && /steer_rack/.test(fc),
  'fullchassis: F-43 死开关替换为真实消费键');
ok(/F-44|\.textContent=h/.test(fc), 'fullchassis: F-44 E() innerHTML→textContent');
ok(/F-47|kcSetMin/.test(fc), 'fullchassis: F-47 扫掠输入 min/max 校验在位');
ok(/F-55|TRK\.active&&TRK\.res/.test(fc), 'fullchassis: F-55 空格仅在回放激活态生效');
ok(/F-18|sc\(EVAL_BENCHMARKS\.camberGainF/.test(fc), 'fullchassis: F-18 dimScores 与基准同源');
ok(/F-17|msF \/ \(msF \+ msR\)/.test(fc), 'fullchassis: F-17 簧载质量按轴比例分配');
ok(/F-05|!isFinite\(r\)/.test(fc), 'fullchassis: F-05 findLimits NaN 中断扫描');
ok(/F-04|rck\.lastTheta/.test(fc), 'fullchassis: F-04 摇臂分支最近根连续性');
ok(/F-14|\* 2;   \/\* F-14/.test(fc), 'fullchassis: F-14 ackermann track 笔误修正');
ok(/F-20|simulate\(S\.play\?dt:0\)/.test(fc), 'fullchassis: F-20 暂停真正冻结积分');
ok(/F-03|拖拽预览保持当前轮跳/.test(fc), 'fullchassis: F-03 拖拽轻量预览路径在位');
/* Milestone 1 / FSAE 赛道升级新增断言 */
ok(fc.includes('const TPHYS'), 'fullchassis: TPHYS 闭包存在');
(function () {
  const marker = 'const TPHYS = (function(){';
  const start = fc.indexOf(marker);
  if (start < 0) { failures.push('fullchassis: TPHYS 闭包不可抽取'); return; }
  const end = fc.indexOf('\n})();', start);
  if (end < 0) { failures.push('fullchassis: TPHYS 闭包未闭合'); return; }
  checks++;
  try {
    const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, isFinite, NaN, Infinity, Number };
    vm.createContext(sandbox);
    vm.runInContext(fc.slice(start, end + '\n})();'.length) + '\nthis.__T = TPHYS;', sandbox);
    const T = sandbox.__T;
    ok(T && typeof T.run === 'function', 'fullchassis: TPHYS.run 可导出');
    ok(T && typeof T.makeSimContext === 'function', 'fullchassis: TPHYS.makeSimContext 可导出');
  } catch (e) {
    failures.push('fullchassis: TPHYS 闭包求值失败：' + e.message);
  }
})();
ok(/autocross:\{zh:"FSAE 官方 Autocross/.test(fc), 'fullchassis: FSAE Autocross 预设在位');
ok(/skidpad8:\{zh:"FSAE 官方 8字定圆/.test(fc), 'fullchassis: FSAE 8字定圆 预设在位');
ok(/accel:\{zh:"FSAE 官方 75m 加速/.test(fc), 'fullchassis: FSAE 75m加速 预设在位');
ok(/shanghai:\{zh:"上海国际赛车场/.test(fc), 'fullchassis: Shanghai 5.45km 全赛道预设在位');
ok(/respawnCircuitVehicle/.test(fc), 'fullchassis: 脱轨保险函数 respawnCircuitVehicle 在位');
ok(/nx:\s*pt\.nx,\s*ny:\s*pt\.ny/.test(fc), 'fullchassis: CircuitPath.getLookahead 导出 nx/ny 法向矢');
ok(/gt3_sport:/.test(fc), 'fullchassis: GT3 日常运动型 (gt3_sport) 预设在位');
ok(/baja:\s*\{[\s\S]*?Baja Off-Road - 长行程越野型/.test(fc), 'fullchassis: Baja 长行程越野型预设在位');
ok(/initCircuitStageEvents/.test(fc), 'fullchassis: initCircuitStageEvents 独立机位切换事件在位');
ok(/data-cam="nose"/.test(fc) && /data-cam="wheel"/.test(fc) && /data-cam="rear"/.test(fc) && /data-cam="heli"/.test(fc),
  'fullchassis: 8 种赛道动力学与悬架特写机位在位');

// ── B. allinone ────────────────────────────────────────────────
const ai = readHtml('dwb-pro-allinone.html');
/* G12：allinone 同套断言 */
ok(/function EH\(t,c,html\)/.test(ai), 'allinone: EH 静态结构 helper 在位');
ok(!/E\("div","chk",'<i>/.test(ai), 'allinone: chkList 不再字面渲染标签');
ok(!/E\("span",null,zh\+' <u>/.test(ai), 'allinone: ro 读数标签不再字面渲染 <u>');
scriptBlocks(ai, 'allinone');
ok(ai.includes('const TPHYS'), 'allinone: TPHYS 闭包存在');
/* TPHYS 闭包可在沙箱中求值，且导出 run/makeSimContext */
(function () {
  const marker = 'const TPHYS = (function(){';
  const start = ai.indexOf(marker);
  if (start < 0) { failures.push('allinone: TPHYS 闭包不可抽取'); return; }
  const end = ai.indexOf('\n})();', start);
  if (end < 0) { failures.push('allinone: TPHYS 闭包未闭合'); return; }
  checks++;
  try {
    const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, isFinite, NaN, Infinity, Number };
    vm.createContext(sandbox);
    vm.runInContext(ai.slice(start, end + '\n})();'.length) + '\nthis.__T = TPHYS;', sandbox);
    const T = sandbox.__T;
    ok(T && typeof T.run === 'function', 'allinone: TPHYS.run 可导出');
    ok(T && typeof T.makeSimContext === 'function', 'allinone: TPHYS.makeSimContext 可导出');
  } catch (e) {
    failures.push('allinone: TPHYS 闭包求值失败：' + e.message);
  }
})();
ok(ai.includes('if(!(d<=r))r=d'), 'allinone: F-01 NaN 安全残差在位');
ok(/_stageAutoDone/.test(ai), 'allinone: F-51 ?stage 一次性 flag 在位');
ok(!/this\.alphaLat\[w\]\s*\+=\s*dt\*\(vx\/this\.LsT\)/.test(ai),
  'allinone: F-22 旧松弛推进已移出 derivs');
ok(/1-Math\.exp\(-dt\*vxNow\/sig\)/.test(ai), 'allinone: F-24 解析松弛推进在位');
ok(ai.includes('Math.max(0.3,this.LsT)'), 'allinone: F-24 σ 地板在位');
/* R-0830-3 波次新增修复的回访断言 */
ok(/F-28|karb_f:kf\*1000/.test(ai), 'allinone: F-28 TPHYS ARB 刚度注入');
ok(/F-38|isFinite\(p\.x\)/.test(ai), 'allinone: F-38 赛道路点字段/有限性校验');
ok(/F-44|\.textContent=h/.test(ai), 'allinone: F-44 E() innerHTML→textContent');
ok(/F-54|TRK\.lookahead/.test(ai), 'allinone: F-54 预瞄增益真状态');
ok(/F-57|TRK\._acc/.test(ai), 'allinone: F-57 回放倍率时间累积');
ok(/F-20|simulate\(S\.play\?dt:0\)/.test(ai), 'allinone: F-20 暂停真正冻结积分');
ok(/F-21|cosCam/.test(ai), 'allinone: F-21 stepDyn 轻量接地点 z');
ok(/F-04|rck\.lastTheta/.test(ai), 'allinone: F-04 摇臂分支最近根连续性');
/* Milestone 1 / FSAE 赛道升级新增断言 */
ok(/autocross:\{zh:"FSAE 官方 Autocross/.test(ai), 'allinone: FSAE Autocross 预设在位');
ok(/skidpad8:\{zh:"FSAE 官方 8字定圆/.test(ai), 'allinone: FSAE 8字定圆 预设在位');
ok(/accel:\{zh:"FSAE 官方 75m 加速/.test(ai), 'allinone: FSAE 75m加速 预设在位');
ok(/shanghai:\{zh:"上海国际赛车场/.test(ai), 'allinone: Shanghai 5.45km 全赛道预设在位');

/* ══════════════════════════════════════════════════════════════════
 * G14（2026-08-31）F-61：模块加载顺序 / 跨模块前向引用 / 舞台可启动检查
 *
 * 起因：G9 把单个 <script> 块字节级拆成 11 个 <script src> 后，
 * 10-eval.js 顶层一条越界的 openSlopeStage 导出抛 ReferenceError，
 * 导致该文件剩余部分静默不执行 → class StraightPath 等卡在 TDZ →
 * 三个舞台初始化抛错、rAF 循环从未注册 → 打开即黑屏（画布一片空白）。
 * 完整根因与检查项见 web/test/stage_boot_check.js 顶部注释。
 ══════════════════════════════════════════════════════════════════ */
/* ── 稳态不足转向梯度 + Jacking（底盘开发 KPI，双端同构防线）──
 * US Gradient / 前后侧偏角 / Jacking 抬升：前端 solveQuasiStatic 与引擎
 * chassis.quasi_loads 逐字同构；TIRE_MF_QS 与引擎 TireParams 缺省值同源，
 * 改一侧必须同步另一侧，否则双内核对拍漂移。 */
ok(/usGradient:\s*\{\s*name: "稳态不足转向梯度/.test(fc), 'fullchassis: US Gradient 评价基准在位');
ok(/let TIRE_MF_QS = \{ Fy0: 5250, FzNom: 3500, By: 20, Cy: 1\.2, LS: 0\.10 \}/.test(fc),
  'fullchassis: 准静态 MF 参数集与引擎 TireParams 缺省同源（模块级可变，标定可覆写）');
ok(/usGrad: usGrad, alphaF: alphaFDeg/.test(fc) && /jackingN: jackingN/.test(fc),
  'fullchassis: solveQuasiStatic 输出 usGrad/α/Jacking');
ok(/roUsGrad/.test(fc) && /roJacking/.test(fc), 'fullchassis: 右面板 US Gradient / Jacking 读数在位');
ok(/setRO\("roUsGrad"/.test(fc), 'fullchassis: 07-plots 绑定 US Gradient 读数');
/* 轮胎实测标定链（讲义 EP08 数据链）：面板 + 辨识入口 + 应用函数 + 舞台接入 */
ok(/buildTireCalibPanel\(host\)/.test(fc), 'fullchassis: 轮胎实测标定面板已挂入左坞站');
ok(/\/api\/v3\/tire\/fit/.test(fc), 'fullchassis: 辨识走引擎 /api/v3/tire/fit');
ok(/function applyTireCalib/.test(fc) && /SIM\.qsRes = solveQuasiStatic\(\);/.test(fc),
  'fullchassis: applyTireCalib 覆写实胎后重算准静态');
ok(/SIM\.tireCalib/.test(fc) && /body\.tire,\{Fy0:tc\.Fy0/.test(fc),
  'fullchassis: 赛道舞台轮胎参数接入标定结果');
/* K&C 台架对拍链（仿真预测↔台架验证闭环）：导入面板 + RMS + 轮跳图第三条线 */
ok(/buildKcMeasuredPanel\(host\)/.test(fc), 'fullchassis: K&C 台架对拍面板已挂入左坞站');
ok(/function kcMeasuredRMS/.test(fc) && /function kcMeasuredParse/.test(fc),
  'fullchassis: 实测解析 + RMS 偏差函数在位');
ok(/plotXYOverlay\(UI\.plots\[i\][^)]*, msr\)/.test(fc),
  'fullchassis: 轮跳图叠画实测曲线（第三条点划线）');
/* 不足转向特性 δ-ay（US Curve，底盘开发汇报核心图）：双端同构 + 引擎 us_curve */
ok(/function usSweepCompute/.test(fc) && /function plotUsCurve/.test(fc)
   && /usCurvePlot/.test(fc), 'fullchassis: δ-ay 特性图链路在位（扫掠/绘制/画布）');
ok(/function rollSteerRate/.test(fc) && /usTire:usTire/.test(fc),
  'fullchassis: δ-ay 完整版含侧倾转向分量（双线叠画）');
ok(/function buildBushingCalibPanel/.test(fc) && /SIM\.bushCalib/.test(fc),
  'fullchassis: 衬套刚度标定面板 + presetBushings 标定优先通道');
ok(/gyOverride!==undefined\?gyOverride:S\.qs\.gy/.test(fc),
  'fullchassis: solveQuasiStatic 支持 gy 覆写（扫掠扫描基础）');
/* 双端对拍锚：JS 准静态 MF 参数必须与引擎 v3models TireParams 缺省逐字一致 */
const engModels = fs.readFileSync(path.join(webDir, '..', 'engine', 'src', 'api', 'v3models.py'), 'utf8');
ok(/Fy0: float = 5250\.0/.test(engModels) && /FzNom: float = 3500\.0/.test(engModels)
   && /By: float = 20\.0/.test(engModels) && /LS: float = 0\.10/.test(engModels)
   && /Cg: float = 6\.0/.test(engModels),
   'engine: TireParams 缺省值未变（双端对拍锚；G24 已换为真实 GT3 胎 μ=1.50/By=20，G24-S3 Cg=6.0）');
const engChassis = fs.readFileSync(path.join(webDir, '..', 'engine', 'src', 'api', 'chassis.py'), 'utf8');
ok(/us_grad_deg_per_g/.test(engChassis) && /jacking_heave_mm/.test(engChassis),
  'engine: chassis solve 输出 US Gradient / Jacking');
ok(/us_curve: dict\[str, list\]/.test(engModels), 'engine: ChassisPoseResponse.us_curve 字段在位');
ok(/_us_curve\(req\.vehicle/.test(engChassis), 'engine: solve_chassis 输出 us_curve 扫掠');
ok(/let TIRE_MF_QS/.test(ai) && /usGrad: usGrad/.test(ai) && /jackingN: jackingN/.test(ai),
  'allinone: 准静态 US Gradient / Jacking 同构同步');
ok(/roUsGrad/.test(ai) && /roJacking/.test(ai), 'allinone: US Gradient / Jacking 读数在位');
ok(/function applyTireCalib/.test(ai) && /buildTireCalibPanel\(host\)/.test(ai),
  'allinone: 轮胎实测标定链同构（面板 + 应用函数）');
ok(/buildKcMeasuredPanel\(host\)/.test(ai) && /function kcMeasuredRMS/.test(ai),
  'allinone: K&C 台架对拍链同构');
ok(/function usSweepCompute/.test(ai) && /function plotUsCurve/.test(ai)
   && /usCurvePlot/.test(ai), 'allinone: δ-ay 特性图链路同构');
ok(/function rollSteerRate/.test(ai) && /function bushPayload/.test(ai)
   && /buildBushingCalibPanel\(host\)/.test(ai),
  'allinone: δ-ay 完整版 + 衬套标定链同构');

require('./stage_boot_check')(webDir, ok, failures.push.bind(failures), { log(){} });

/* G22（2026-09-02）第四道防线：赛车线循迹回归。
 * 用户实测两个症状（车被"吸"回中心线、一个弯扭成好几个弯）的根因回归网：
 * 锁定 getLookahead 的三个控制参考量必须同源于赛车线、弯道不得碎片化、
 * 偏移折角受限、以及全圈闭环的横向偏差与转向翻转次数。
 * 单独跑：node web/test/test_racingline.js */
require('./test_racingline')(webDir, ok, failures.push.bind(failures), { log(){} });

/* G23（2026-09-02）第五道防线：K&C 接线回归。
 * 锁定“改悬架几何必须改变赛道行为”：前端 15DOF 引擎必须查 SIM.swF/swR
 * 扫掠表取 camber/toe，而不是用硬编码梯度常数（接线前实测：两套不同几何
 * 跑 300 步，Δψ/Δv/Δcamber 均为 0）。同时把守 LUT 缺失时的安全回退。
 * 单独跑：node web/test/test_kc_wiring.js */
require('./test_kc_wiring')(webDir, ok, failures.push.bind(failures), { log(){} });

/* G23-P1b（2026-09-02）第六道防线：轮胎模型接线回归。
 * 锁定前端 magicFormula 必须消费 SIM.tireCalib / SIM.tireCalibEy，且具备真实
 * 轮胎的物理性质：峰值侧偏角 3~25°（接线前 0.32° = 纯库仑摩擦）、
 * C_alpha/Fz 8~40（接线前 604）、载荷敏感性（Jensen）、摩擦圆不超、
 * 路面 μ 仍定绝对上限（保证速度包络语义不变）。
 * 单独跑：node web/test/test_tire_wiring.js */
require('./test_tire_wiring')(webDir, ok, failures.push.bind(failures), { log(){} });

// ── 结果 ───────────────────────────────────────────────────────
if (failures.length) {
  console.error(`DOM/结构测试 FAIL：${failures.length}/${checks} 项失败`);
  failures.forEach((f, i) => console.error(`  [${i + 1}] ${f}`));
  process.exit(1);
}
console.log(`DOM/结构测试 PASS：${checks} 项断言全过`);
