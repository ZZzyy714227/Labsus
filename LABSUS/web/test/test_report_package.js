'use strict';
/* ============================================================================
 * LABSUS · web/test/test_report_package.js
 * 27-report-package.js 三件套测试（2026-11-24，AI 闭环 P2）
 *   - JSON: LABSUS_ANALYSIS_V2 / hash 稳定 / 白名单与边界 / 图表数据保留
 *   - HTML: 自包含（无外链）、内嵌 PNG、含结论与各面标题
 *   - MD:  含给 AI 的提示词、白名单、PROPOSAL_V1 输出格式
 * usage: node web/test/test_report_package.js
 * ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const webDir = path.join(__dirname, '..');
const _n = () => {};
function stubCanvas() {
  const g = {
    setTransform: _n, clearRect: _n, fillRect: _n, beginPath: _n, moveTo: _n, lineTo: _n,
    stroke: _n, fill: _n, arc: _n, closePath: _n, fillText: _n, save: _n, restore: _n,
    setLineDash: _n, rotate: _n, translate: _n, measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: _n }),
    strokeStyle: '', fillStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
  };
  return { width: 640, height: 360, getContext: () => g, toDataURL: () => 'data:image/png;base64,PNGSTUB' };
}
const doc = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, href: '', download: '', click: _n, remove: _n }),
  getElementById: () => null, body: { appendChild: _n }, addEventListener: _n,
};

const ctx = {
  window: {}, document: doc, console, Math, Number, Array, Object, JSON, String, Boolean,
  isFinite, isNaN, Error, Date, RegExp, Map, Set, parseInt, parseFloat, Blob: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: _n }, setTimeout: _n,
};
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['26-report-charts.js', '27-report-package.js']) {
  vm.runInContext(fs.readFileSync(path.join(webDir, 'js', f), 'utf8'), ctx, { filename: f });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); passed++; }
  else { console.error('[FAIL] ' + msg); failed++; }
}

const PKG = ctx.REPORT_PACKAGE;
assert(PKG && typeof PKG.build === 'function', 'REPORT_PACKAGE.build 导出');
assert(PKG.SCHEMA === 'LABSUS_ANALYSIS_V2', 'ANALYSIS schema 常量正确');
assert(PKG.PROPOSAL_SCHEMA === 'LABSUS_PROPOSAL_V1', 'PROPOSAL schema 常量正确');

/* 最小 rep（形状与 25-full-report 的 runAll 输出一致） */
const rep = {
  generatedAt: '2026-11-24T00:00:00.000Z',
  vehicle: {
    vehicleType: 'formula', vehicleName: 'Formula SAE', wbMm: 1550,
    mTotalKg: 300, mSprungKg: 240, hcgMm: 300,
    front: { kSNmm: 30, cRNsmm: 1.8, arbMm: 12, tire: { Fy0: 6650, W: 175 }, hp: { UCA_in: { x: -120, y: 150, z: 250 } } },
    rear: { kSNmm: 32, cRNsmm: 1.9, arbMm: 10, tire: { Fy0: 7000, W: 190 }, hp: { UCA_in: { x: -130, y: 160, z: 260 } } },
    perfTiers: { tire: 'T5', power: 'P5' }, workshop: { tire: null, powerSpec: { architecture: 'ice' } },
  },
  staticKC: {
    overallScore: 72.4,
    dimScores: { 几何: 80, 刚度: 70, 平顺: 60, 操稳: 75, 纵向: 68, 综合: 72 },
    counts: { good: 12, warn: 7, bad: 2, total: 21 },
    charts: [ctx.CHART.line({ title: 'Camber vs 轮跳', unit: 'deg', xLabel: 'mm', yLabel: 'deg',
      x: [0, 10, 20], series: [{ name: '前轴', y: [0, -0.1, -0.2] }] })],
  },
  ride: { step: { t63Ms: 28 }, charts: [ctx.CHART.line({ title: '阶跃响应', unit: 'mm', x: [0, 1], series: [{ name: 'Z', y: [0, 1] }] })] },
  lateral: { rollGradientDegPerG: 0.45, charts: [] },
  longitudinal: { brake100kmh: { stopDistM: 29.5 }, charts: [] },
  capability: { ayMaxG: 1.22, charts: [] },
  fsae: { total275: 150.3, charts: [] },
  tracks: { provingGround: [{}, {}, {}] },
  insights: [
    { severity: 'warn', area: 'geometry', text: '前磨地半径 44.3 mm 超出目标 5~25 mm' },
    { severity: 'bad', area: 'damper', text: '前阻尼比 1.50 偏高' },
  ],
};

/* ── JSON ── */
const js = PKG.json(rep);
let A = null;
try { A = JSON.parse(js); } catch (e) {}
assert(A && A.schema === 'LABSUS_ANALYSIS_V2', 'JSON 可解析且 schema 正确');
assert(typeof A.hash === 'string' && A.hash.length >= 5, 'JSON 带 hash（方案对号用）');
assert(A.units && A.units.length === 'mm' && A.units.force === 'N', 'JSON 带单位表');
assert(A.setup && A.setup.vehicleType === 'formula' && A.setup.springs.front.kSNmm === 30, 'setup 参数完整');
assert(Array.isArray(A.editable) && A.editable.indexOf('springs.*') >= 0, 'JSON 带可改白名单');
assert(A.editable.indexOf('tireTier') < 0, '白名单不含档位（tireTier 不可改）');
assert(A.bounds && A.bounds['springs.front.kSNmm'][0] === 15, 'JSON 带边界');
assert(A.sections.length >= 7, 'sections 覆盖 7 个分析面（' + A.sections.length + '）');
const kcSec = A.sections.find(s => s.id === 'kc');
assert(kcSec && kcSec.charts.length === 1 && kcSec.charts[0].data.x.length === 3, 'K&C 图表原始数据保留在 JSON');
assert(kcSec && kcSec.metrics && kcSec.metrics.overallScore === 72.4, 'metrics 保留（不含大数组）');
assert(!js.includes('data:image/png'), 'JSON 不内嵌 PNG（体积可控，数据与渲染分离）');
/* hash 稳定性：同一输入两次一致；改参数会变 */
assert(PKG.hash(PKG.toAnalysis(rep)) === A.hash, 'hash 对同一输入稳定');
const rep2 = JSON.parse(JSON.stringify(rep)); rep2.vehicle.front.kSNmm = 40;
assert(PKG.hash(PKG.toAnalysis(rep2)) !== A.hash, 'hash 对参数变化敏感（调参后 hash 会变）');

/* ── HTML ── */
const h = PKG.html(rep);
assert(h.indexOf('<!DOCTYPE html>') === 0, 'HTML 以 doctype 开头');
assert(h.includes('data:image/png'), 'HTML 内嵌 PNG（自包含）');
assert(!/src="https?:/.test(h) && !/href="https?:/.test(h), 'HTML 无外部网络引用');
assert(h.includes('工程结论与短板') && h.includes('前磨地半径'), 'HTML 含结论区');
assert(h.includes('运动学与 K&amp;C') || h.includes('运动学与 K&C'), 'HTML 含各分析面标题');
assert(h.includes('LABSUS_ANALYSIS_V2'.replace('_', '_')) && h.includes(A.hash), 'HTML 带 schema 与 hash');

/* ── Markdown ── */
const md = PKG.markdown(rep);
assert(md.startsWith('# LABSUS 悬架全量分析'), 'MD 标题正确');
assert(md.includes('## 4. 允许修改的参数') && md.includes('springs.*'), 'MD 含白名单');
assert(md.includes('不得修改轮胎档/动力档'), 'MD 明确档位不可改');
assert(md.includes('LABSUS_PROPOSAL_V1') && md.includes('basedOn'), 'MD 含 AI 输出格式约定');
assert(md.includes(A.hash), 'MD 带 hash（AI 必须回填 basedOn）');
assert(md.includes('前磨地半径'), 'MD 含工程结论');

/* ── build 三件套一次返回 ── */
const b = PKG.build(rep);
assert(b.html && b.json && b.markdown && b.hash, 'build 返回三件套 + hash');
assert(b.hash === A.hash, 'build.hash 与 JSON.hash 一致');

console.log('\nReport Package Tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
