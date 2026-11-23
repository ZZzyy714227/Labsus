'use strict';
/* ============================================================================
 * LABSUS · web/test/test_report_charts.js
 * 26-report-charts.js 无头单元测试（2026-11-24，AI 闭环 P1）
 *   - spec 校验（缺数据 / 长度不一致 / 非法 type）
 *   - 数据与绘图分离（render 回带原始 data）
 *   - 无头沙箱无 canvas 时不抛错（占位 PNG）
 * usage: node web/test/test_report_charts.js
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
  return { width: 640, height: 360, getContext: () => g, toDataURL: () => 'data:image/png;base64,STUB' };
}

const doc = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas()
    : { style: {}, classList: { add: _n, remove: _n, toggle: _n }, appendChild: _n }),
  getElementById: () => null,
  body: { appendChild: _n },
  addEventListener: _n,
};

const ctx = {
  window: {}, document: doc, console, Math, Number, Array, Object, JSON, String, Boolean,
  isFinite, isNaN, Error, Date, RegExp, Map, Set, parseInt, parseFloat,
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(webDir, 'js', '26-report-charts.js'), 'utf8'), ctx,
  { filename: '26-report-charts.js' });

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); passed++; }
  else { console.error('[FAIL] ' + msg); failed++; }
}

const CHART = ctx.CHART;
assert(CHART && typeof CHART.render === 'function', 'CHART.render 已导出');
assert(typeof CHART.line === 'function' && typeof CHART.radar === 'function', 'CHART.line / CHART.radar 已导出');

/* ① 校验：缺数据 / 长度不一致 / 非法类型 */
assert(CHART.validate({ type: 'line', title: 't' }).ok === false, '缺 data 的 line spec 校验失败');
assert(CHART.validate({ type: 'line', title: 't', data: { x: [0, 1], series: [{ name: 'a', y: [1, 2] }] } }).ok === true,
  '合法 line spec 校验通过');
assert(CHART.validate({ type: 'line', data: { x: [0, 1, 2], series: [{ name: 'a', y: [1, 2] }] } }).ok === false,
  'x/y 长度不一致被拒绝');
assert(CHART.validate({ type: 'pie', data: { x: [0, 1], series: [{ name: 'a', y: [1, 2] }] } }).ok === false,
  '未知图表类型被拒绝');
assert(CHART.validate({ type: 'radar', axes: ['a', 'b', 'c'], values: [1, 2] }).ok === false,
  'radar axes/values 长度不一致被拒绝');

/* ② 数据与绘图分离：render 回带原始数据 */
const spec = CHART.line({ title: 'Camber vs 轮跳', unit: 'deg', xLabel: 'mm', yLabel: 'deg',
  x: [0, 10, 20], series: [{ name: 'front', y: [0, -0.1, -0.2] }] });
const out = CHART.render(spec);
assert(typeof out.png === 'string' && out.png.indexOf('data:image/png') === 0, 'render 产出 PNG dataURL');
assert(out.data && out.data.x.length === 3 && out.data.series[0].y[1] === -0.1, 'render 回带原始数组（JSON 不丢数据）');
assert(out.ok === true, '合法 spec render ok=true');

/* ③ 非法 spec：render 不抛错、ok=false，但仍回带数据 */
const bad = CHART.line({ x: [0, 1], series: [{ name: 'a', y: [1] }] });
const badOut = CHART.render(bad);
assert(badOut.ok === false && badOut.errors.length > 0, '非法 spec render ok=false 且给出 errors');

/* ④ 无 canvas 的纯无头场景不抛错 */
const nctx = {
  window: {}, document: undefined, console, Math, Number, Array, Object, JSON, String, Boolean,
  isFinite, isNaN, Error, Date, RegExp, Map, Set, parseInt, parseFloat,
};
nctx.globalThis = nctx; nctx.window = nctx;
vm.createContext(nctx);
vm.runInContext(fs.readFileSync(path.join(webDir, 'js', '26-report-charts.js'), 'utf8'), nctx,
  { filename: '26-report-charts.js' });
let threw = false, png = null;
try {
  const r = nctx.CHART.render(nctx.CHART.line({ x: [0, 1], series: [{ name: 'a', y: [1, 2] }] }));
  png = r.png;
} catch (e) { threw = true; }
assert(!threw, '无 document 环境 render 不抛错');
assert(typeof png === 'string' && png.indexOf('data:image/png') === 0, '无 canvas 时返回占位 PNG（下游可降级）');

/* ⑤ radar 可渲染 */
const rad = CHART.radar({ title: '六维雷达', axes: ['a', 'b', 'c', 'd', 'e', 'f'], values: [80, 60, 70, 50, 90, 65] });
const radOut = CHART.render(rad);
assert(radOut.ok === true && radOut.png.indexOf('data:image/png') === 0, 'radar 可渲染');

console.log('\nReport Charts Tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
