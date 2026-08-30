#!/usr/bin/env node
// TPHYS(JS) <-> transient.py(Python) 真对拍 runner（F-58 修复，2026-08-30）。
// 同一输入分别喂 JS TPHYS 与 Python transient，比较 summary 关键字段（相对差<5%），
// 任一端 SOLVER_FAILED / 字段超差 / 状态不一致 → exit 1。
// usage: node tphys_parity.cjs [input.json]   （缺省用同目录 parity_input.example.json）
// 环境变量：TPHYS_HTML=被测 HTML；LABSUS_PY=python 解释器（需含 numpy/scipy/fastapi）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const htmlPath = process.env.TPHYS_HTML || path.join(__dirname, 'dwb-pro-allinone.html');
const pyBin = process.env.LABSUS_PY || 'python';
const inPath = process.argv[2] || path.join(__dirname, 'parity_input.example.json');
const TOL = 0.05;   // 第十一讲钦定：TPHYS Parity 相对差 < 5%

function fail(msg) { console.error('PARITY FAIL: ' + msg); process.exit(1); }

// ── 1. 抽取并执行 JS TPHYS ─────────────────────────────────────
const html = fs.readFileSync(htmlPath, 'utf8');
const marker = 'const TPHYS = (function(){';
const start = html.indexOf(marker);
if (start < 0) fail('TPHYS closure not found');
let end = html.indexOf('\n})();', start);
if (end < 0) fail('TPHYS close not found');
end += '\n})();'.length;
const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, isFinite, NaN, Infinity, Number };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end) + '\nthis.__TPHYS = TPHYS;', sandbox);
const TPHYS = sandbox.__TPHYS;
if (!TPHYS || typeof TPHYS.run !== 'function') fail('TPHYS.run missing');

// ── 2. 双端运行 ────────────────────────────────────────────────
const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
// F-58 修复（2026-08-30 复核）：ctx 必须以 input.ctx 优先 —— 测试端
// (engine/tests/test_tphys_parity.py) 已用 Python axle_rc_sweep 生成与
// 引擎同源的 rc/kw 上下文；HTML 内 makeSimContext 依赖页面全局 SIM
// （vm 抽取 TPHYS 闭包时不可见），沙箱下必然 ReferenceError。
let ctx = null;
if (input.ctx && typeof input.ctx === 'object') {
  ctx = input.ctx;
} else if (TPHYS.makeSimContext) {
  try { ctx = TPHYS.makeSimContext(input.body); }
  catch (e) { fail('makeSimContext 失败（无 SIM 上下文时请传入 input.ctx）: ' + e.message); }
}
if (!ctx) fail('无有效仿真上下文（input.ctx 缺失且 makeSimContext 不可用）');
const jsRaw = TPHYS.run(input.body, ctx);
const js = {
  status: jsRaw.status, finished: !!jsRaw.finished,
  summary: jsRaw.summary || {}, warnings: jsRaw.warnings || []
};
// F-58 修复（2026-08-30 复核）：必须把 JS 端结果写入 argv[3]（测试端
// engine/tests/test_tphys_parity.py 从该文件读取 JS 端摘要做 pytest 断言）；
// 旧版只做内部比较从不落盘 out → 测试读 None → 静默失守。
const outPath = process.argv[3] || inPath.replace(/\.json$/, '') + '.js.json';
fs.writeFileSync(outPath, JSON.stringify(js));

const pyOut = path.join(require('os').tmpdir(), 'parity_py_' + process.pid + '.json');
execFileSync(pyBin, [path.join(__dirname, 'tphys_ref.py'), inPath, pyOut], { stdio: 'inherit' });
const py = JSON.parse(fs.readFileSync(pyOut, 'utf8'));

// ── 3. 比较 ────────────────────────────────────────────────────
function rel(a, b) {
  a = Number(a); b = Number(b);
  if (!isFinite(a) && !isFinite(b)) return 0;
  const m = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / m;
}
if (js.status !== py.status) fail(`status mismatch: JS=${js.status} PY=${py.status}`);
if (js.status !== 'VALID') fail(`both sides non-VALID (${js.status}) — 对拍无意义，先修仿真`);
const fields = ['path_length_m', 'v_end', 'v_max', 'max_ay_g'];
const rows = [];
let worst = 0;
for (const f of fields) {
  const d = rel(js.summary[f], py.summary[f]);
  worst = Math.max(worst, d);
  rows.push(`${f}: JS=${js.summary[f]} PY=${py.summary[f]} rel=${(d * 100).toFixed(2)}%`);
  if (!(d <= TOL)) fail(`${f} 超差 ${(d * 100).toFixed(2)}% > ${(TOL * 100).toFixed(0)}%`);
}
console.log('PARITY PASS (worst rel diff = ' + (worst * 100).toFixed(2) + '%)');
rows.forEach(r => console.log('  ' + r));
