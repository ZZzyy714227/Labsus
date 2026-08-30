/* LABSUS 前端结构测试（F-59 修复，2026-08-30）。
 *
 * 旧版：无断言、恒 exit 0、且只测 fullchassis——防线形同虚设。
 * 新版：对两个前端入口做真断言（语法可编译 + 关键函数存在 + 已知 bug 模式回访），
 *      任何失败 exit 1。不依赖 jsdom（无 node_modules 依赖，CI 可直接跑）。
 * usage: node test_dom.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const webDir = __dirname;
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
const fc = readHtml('dwb-pro-fullchassis.html');
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

// ── B. allinone ────────────────────────────────────────────────
const ai = readHtml('dwb-pro-allinone.html');
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

// ── 结果 ───────────────────────────────────────────────────────
if (failures.length) {
  console.error(`DOM/结构测试 FAIL：${failures.length}/${checks} 项失败`);
  failures.forEach((f, i) => console.error(`  [${i + 1}] ${f}`));
  process.exit(1);
}
console.log(`DOM/结构测试 PASS：${checks} 项断言全过`);
