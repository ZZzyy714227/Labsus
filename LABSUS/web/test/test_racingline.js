/* LABSUS 赛车线循迹回归测试（G22，2026-09-02）。
 *
 * ── 建立起因 ────────────────────────────────────────────────────
 * 用户实测两个症状：
 *   1) 车"像被吸引一样"非要回中心线行驶，吃不到赛车线；
 *   2) 不会丝滑利用赛道宽度过弯——虽然会吃路肩，但把一个弯扭成好几个弯。
 *
 * ── 根因（scratch/diag_*.cjs 五个诊断脚本实测确认）──────────────
 *   R1  控制器混用两条线的参考量：getLookahead 的横向目标 refX/refY 来自
 *       偏移后的赛车线，但 targetHeading/targetCurvature 仍取中心线的
 *       pt.heading / pt.curvature。drive() 中航向项增益 1.0，横向项增益
 *       k_st/(k_soft+u)≈0.032@108km/h。实测（scratch/diag_beforeafter.cjs，与 git
 *       HEAD 同口径对比）：把车精确放在赛车线上、航向对齐赛车线切向时，
 *       静态舵角偏差均值 2.70°、峰值 18.34°；全圈闭环最大横向偏差 10.02m、
 *       均值 2.45m，弯心处只达成命令偏移的 36%。
 *       ⇒ 症状 1。
 *       ⚠ 数据纠错：本文件初版误用 need=+atan(WB·k)，把偏差虚高到 6.59°/28.69°；
 *         本坐标系下正 steer=右弯=ψ 递减=k<0，正确符号为 need=-atan(WB·k)。
 *         上文为修正后的诚实值（结论方向不变，但幅度比初报小）。
 *   R2  弯道分段碎片化 + 偏移幅度不随段长缩放：T1-T4 蜗牛弯被切成 4 段，
 *       每段独立跑一遍完整"外侧→弯心→外侧"剖面；apexOff/outOff 只由赛道
 *       宽度与 severity 决定。实测 15 段中 11 段的偏移折角 >12°，最大
 *       0.806 m/m = 38.9°（弧长仅 74m / 转角 57.2° 的短弯），并存在弧长 15m /
 *       转角 3.6° 的纯噪声伪弯段；全圈共 4 段总转角 <25°。最关键的无阈值指标：
 *       赛车线曲率总变差 TV(k) 是中心线的 1.83 倍 —— 外-内-外赛车线本应用更大
 *       半径拉直弯道（TV 应 <1），旧实现反而比中心线多扭 83%；赛车线曲率方向
 *       反转 43 次。
 *       ⇒ 症状 2。
 *   注：与赛道宽度无关。hw_m=4.9（总宽 9.8m，比真实 F1 赛道 13~15m 更窄），
 *       且 apexOff/outOff 由 hw_m 推导——加宽赛道只会放大摆幅、扭得更凶。
 *
 * ── 本检查做什么 ────────────────────────────────────────────────
 *   直接加载真实源码（10-eval.js 的 CircuitPath + 11-stages.js 的
 *   UniversalAutoPilot），对赛车线几何与控制权限做数值断言。
 *   全部断言在修复前 FAIL、修复后 PASS。
 *
 * 用法：
 *   作为库：require('./test_racingline')(webDir, ok, fail)
 *   单独跑：node web/test/test_racingline.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 阈值（激进走线口径：吃满路肩、追求圈速）──────────────────── */
const T = {
  MIN_CORNER_TURN_DEG: 25,     // 小于此转角的"弯段"是噪声，必须被合并或丢弃
  MAX_OFFSET_SLOPE: 0.28,      // |d(offset)/ds| 上限 m/m（≈15.6° 目标线折角）
  MEAN_STEER_BIAS_DEG: 2.5,    // 静态舵角偏差均值上限（修复前 2.70°）
  MAX_STEER_BIAS_DEG: 10.0,    // 静态舵角偏差峰值上限（修复前 18.34°）
  APEX_KERB_RIDE_M: 5.20,      // 激进：弯心至少骑上路肩（hw 4.9 之外）
  TRACK_RATIO: 0.85,           // 闭环：弯心处实际偏移须达命令偏移的 85%
  MAX_LAT_DEV_M: 2.50,         // 闭环：全圈最大法向横向偏差
  MEAN_LAT_DEV_M: 0.60,        // 闭环：全圈平均法向横向偏差
  MAX_STEER_FLIPS: 20,         // 闭环：全圈转向方向反转上限（带滞环计数）
  MAX_TV_RATIO: 1.00,          // ★ 赛车线曲率总变差 / 中心线，必须 <1（赛车线应更平直）
  MAX_LINE_DIR_FLIPS: 24       // 赛车线曲率方向反转次数上限（修复前 43）
};

/* ── 加载真实源码 ─────────────────────────────────────────────── */
function loadReal(webDir) {
  const _n = () => {};
  const stubDoc = {
    documentElement: { setAttribute: _n, getAttribute: () => null },
    body: { appendChild: _n }, head: { appendChild: _n },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: _n, remove: _n, toggle: _n },
      appendChild: _n, addEventListener: _n, setAttribute: _n }),
    addEventListener: _n, readyState: 'complete'
  };
  const ctx = {
    window: {}, console, Math, Number, Array, Object, JSON, String, Boolean,
    document: stubDoc, localStorage: { getItem: () => null, setItem: _n, removeItem: _n },
    navigator: { userAgent: 'node' }, performance: { now: () => 0 },
    requestAnimationFrame: _n, setTimeout: _n, setInterval: _n,
    parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set
  };
  ctx.globalThis = ctx;
  ctx.window.document = stubDoc;
  ctx.window.localStorage = ctx.localStorage;
  ctx.window.addEventListener = _n;
  ctx.window.matchMedia = () => ({ matches: false });
  vm.createContext(ctx);

  // 10-eval.js：剥掉顶层主题 IIFE（依赖 01-core.js 的 C/PAL，与本测试无关）
  let evalSrc = fs.readFileSync(path.join(webDir, 'js', '10-eval.js'), 'utf8');
  const te = evalSrc.indexOf('})();');
  if (te > 0 && evalSrc.slice(0, te).includes('initTheme')) evalSrc = evalSrc.slice(te + 5);
  vm.runInContext(evalSrc, ctx, { filename: '10-eval.js' });

  // 11-stages.js：只切出 UniversalAutoPilot 类（紧邻 VehicleDynamics15DOF 之前），
  // 避开整个文件的 DOM/舞台顶层依赖。
  const stagesSrc = fs.readFileSync(path.join(webDir, 'js', '11-stages.js'), 'utf8');
  const cStart = stagesSrc.indexOf('class UniversalAutoPilot {');
  const cEnd = stagesSrc.indexOf('class VehicleDynamics15DOF {');
  if (cStart < 0 || cEnd < 0 || cEnd <= cStart) throw new Error('无法定位 UniversalAutoPilot 类边界');
  vm.runInContext(stagesSrc.slice(cStart, cEnd) + '\nwindow.UniversalAutoPilot = UniversalAutoPilot;',
    ctx, { filename: '11-stages.js#UniversalAutoPilot' });

  // buildShanghaiCircuit 的 wp 数组
  const wStart = stagesSrc.indexOf('function buildShanghaiCircuit');
  const wEnd = stagesSrc.indexOf('return new CircuitPath(wp, mu, aggressiveness);');
  const wpSrc = stagesSrc.slice(wStart, wEnd)
    .replace('function buildShanghaiCircuit(mu = 1.35, aggressiveness = 1.0) {', '');
  const wp = vm.runInContext(
    '(function(){ const mu=1.35, aggressiveness=1.0; ' + wpSrc + ' return wp; })()',
    ctx, { filename: '11-stages.js#waypoints' });

  return { ctx, wp, CircuitPath: ctx.window.CircuitPath, AutoPilot: ctx.window.UniversalAutoPilot };
}

/* ── 赛车线几何量（独立于被测代码重算，作为断言基准）──────────── */
function lineGeom(pts, i, N) {
  const a = pts[(i - 4 + N) % N], c = pts[i], b = pts[(i + 4) % N];
  const h1 = Math.atan2(-(c.refX - a.refX), c.refY - a.refY);
  const h2 = Math.atan2(-(b.refX - c.refX), b.refY - c.refY);
  let dh = h2 - h1;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const ds = Math.hypot(b.refX - a.refX, b.refY - a.refY);
  // 7 点跨距切向（与中心线 heading 同口径）
  const head = Math.atan2(-(b.refX - a.refX), b.refY - a.refY);
  return { heading: head, curvature: dh / (ds + 1e-9) };
}

/* ── 运动学单车模型闭环（符号约定：右弯→psi 递减，正 steer→右弯）──
 * ★ 两个易错点，已在 scratch/diag_klat.cjs 踩到并修正：
 *   ① 初值必须把车放在【赛车线上 + 航向对齐赛车线切向】。若从中心线起步，
 *      弯心处初始 lineError 就高达 5.8m，测到的是“暴力恢复”而非“循迹能力”；
 *   ② 循迹误差必须用【沿赛车线法向的符号横向偏差】，不能用欧式最近距离
 *      （后者含纵向分量）；且 argmin 不得就地修改窗口基准索引。 */
function closedLoop(P, pilot, pts, N, startIdx, endIdx) {
  const WB = pilot.wb, R_OFF = WB - pilot.a, dt = 1 / 240;
  const head0 = Math.atan2(-(pts[Math.min(N - 1, startIdx + 4)].refX - pts[(startIdx - 4 + N) % N].refX),
                            pts[Math.min(N - 1, startIdx + 4)].refY - pts[(startIdx - 4 + N) % N].refY);
  let RX = pts[startIdx].refX + R_OFF * Math.sin(head0);
  let RY = pts[startIdx].refY - R_OFF * Math.cos(head0);
  let psi = head0, u = Math.max(8, Math.min(70, pts[startIdx].v_max)), ci = startIdx;
  pilot.setPath(P); pilot.active = true;
  P._hintCtrl = startIdx; P._hintRoad = startIdx;
  const endS = pts[endIdx].s;
  let maxLat = 0, sumLat = 0, n = 0, flips = 0, prevSgn = 0, diverged = false;
  let sumRatio = 0, nRatio = 0, maxCte = 0, overEdge = 0;
  // 与 trackLimitsAndLaps 同口径的出界罚时阈值
  const EDGE = (P.hw_m || 4.9) + (P.kerb_m || 1.35) + 0.95;
  for (let step = 0; step < 60000; step++) {
    const stX = RX - R_OFF * Math.sin(psi), stY = RY + R_OFF * Math.cos(psi);
    const ctrl = pilot.drive({ X: stX, Y: stY, Z: 0, psi, u, v: 0, w: 0, p: 0, q: 0, r: 0 }, dt);
    // 方向反转计数（带滞环）：记录上一个【显著符号】，只在符号真正反转时计数。
    const sgn = ctrl.steer > 0.8 ? 1 : (ctrl.steer < -0.8 ? -1 : 0);
    if (sgn !== 0) { if (prevSgn !== 0 && sgn !== prevSgn) flips++; prevSgn = sgn; }
    u += ((ctrl.target ? ctrl.target.targetSpeed : u) - u) * Math.min(1, dt * 1.2);
    psi -= (u / WB) * Math.tan(ctrl.steer * Math.PI / 180) * dt;
    RX += -u * Math.sin(psi) * dt;
    RY += u * Math.cos(psi) * dt;
    let md = Infinity, best = ci;
    for (let k = -150; k <= 150; k++) {
      const i = (ci + k + N) % N;
      const d = (pts[i].refX - stX) ** 2 + (pts[i].refY - stY) ** 2;
      if (d < md) { md = d; best = i; }
    }
    ci = best;
    const p = pts[ci];
    const lat = (stX - p.refX) * p.refNx + (stY - p.refY) * p.refNy;   // ★ 法向横向偏差
    if (!isFinite(lat) || Math.sqrt(md) > 60) { diverged = true; break; }
    maxLat = Math.max(maxLat, Math.abs(lat));
    sumLat += Math.abs(lat); n++;
    // 出界风险：干净自动驾驶圈的最大 |crossTrackError|（相对中心线）。
    // 激进出线（弯心骑路肩 5.76m）叠加循迹偏差后，若超过 EDGE 就会在【未真正
    // 冲出】的情况下吃 +5s 无妄罚时。
    const cte = (stX - p.x) * p.nx + (stY - p.y) * p.ny;
    if (Math.abs(cte) > maxCte) maxCte = Math.abs(cte);
    if (Math.abs(cte) > EDGE) overEdge++;
    // 达成率：只在赛车线确实要求大偏移处统计（相对中心线量）
    if (Math.abs(p.offset) > 3.0) {
      const achieved = (stX - p.x) * p.nx + (stY - p.y) * p.ny;
      if (achieved * p.offset > 0) sumRatio += Math.min(1, Math.abs(achieved) / Math.abs(p.offset));
      nRatio++;
    }
    if (p.s >= endS && step > 200) break;
  }
  return {
    trackRatio: nRatio ? sumRatio / nRatio : 0, nRatio,
    maxLat, meanLat: n ? sumLat / n : 999, flips, diverged,
    maxCte, overEdge, EDGE
  };
}

/* ── 主检查 ───────────────────────────────────────────────────── */
function runChecks(webDir, ok, fail, opts) {
  const log = (opts && opts.log) || (() => {});
  let R;
  try {
    R = loadReal(webDir);
  } catch (e) {
    fail(`G22: 赛车线测试无法加载源码：${e.message}`);
    return;
  }
  const P = new R.CircuitPath(R.wp, 1.35, 1.0);
  const pts = P.pts, N = pts.length;
  ok(N > 500, `G22: 样条点数正常（${N}）`);

  /* ── 1. R1 修复：getLookahead 必须返回赛车线的 heading/curvature ── */
  const HW = P.hw_m || 4.9;
  let probe = -1;
  for (let i = 8; i < N - 8; i++) if (Math.abs(pts[i].offset) > 3.0) { probe = i; break; }
  ok(probe > 0, 'G22: 存在 |offset|>3m 的赛车线采样点');
  if (probe > 0) {
    const g = lineGeom(pts, probe, N);
    const t = P.getLookahead(pts[probe].refX, pts[probe].refY, Math.max(10, pts[probe].v_max));
    const dHead = Math.abs(((t.targetHeading - g.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
    const dCurv = Math.abs(t.targetCurvature - g.curvature);
    ok(dHead < 1.0,
      `G22/R1: targetHeading 取自赛车线切向（偏差 ${dHead.toFixed(2)}° < 1°；若为中心线则偏差会很大）`);
    ok(dCurv < 0.004,
      `G22/R1: targetCurvature 取自赛车线曲率（偏差 ${dCurv.toFixed(5)} < 0.004 1/m）`);
  }

  /* ── 2. R1 修复：必须同时给出赛车线横向误差与中心线横向误差 ────── */
  if (probe > 0) {
    const t = P.getLookahead(pts[probe].refX, pts[probe].refY, 25);
    ok(typeof t.lineError === 'number' && isFinite(t.lineError),
      'G22/R1: getLookahead 返回 lineError（赛车线横向误差，控制用）');
    ok(typeof t.crossTrackError === 'number' && isFinite(t.crossTrackError),
      'G22/R1: getLookahead 仍返回 crossTrackError（中心线横向误差，赛道边界判定用）');
    if (typeof t.lineError === 'number') {
      // 车精确在赛车线上 ⇒ lineError≈0，但 crossTrackError≈offset（远离中心线）
      ok(Math.abs(t.lineError) < 0.6,
        `G22/R1: 车在赛车线上时 lineError≈0（实测 ${t.lineError.toFixed(3)}m）`);
      ok(Math.abs(Math.abs(t.crossTrackError) - Math.abs(pts[probe].offset)) < 1.2,
        `G22/R1: 同一点 crossTrackError 仍反映中心线偏移（${t.crossTrackError.toFixed(2)}m vs offset ${pts[probe].offset.toFixed(2)}m）`);
    }
  }

  /* ── 3. R1 修复：静态舵角权限——车在赛车线上时指令须≈需求 ─────── */
  const pilot = new R.AutoPilot({ wb: 2600 });
  pilot.setPath(P); pilot.active = true;
  const WB = pilot.wb;
  let sumBias = 0, maxBias = 0, nBias = 0, satCount = 0;
  for (let i = 8; i < N - 8; i += 10) {
    const p = pts[i];
    if (Math.abs(p.offset) < 0.8) continue;
    const u = Math.max(8, Math.min(70, p.v_max));
    const g = lineGeom(pts, i, N);
    // ★ 舵角符号约定：本坐标系下 heading=atan2(-dx,dy)、forward=(-sinψ,cosψ)，
    //   右弯 ⇒ ψ 递减 ⇒ curvature<0；而 VehicleDynamics15DOF 中正 steer 产生右弯。
    //   故沿曲率 k 的弧线行驶所需舵角 = -atan(WB·k)，与 drive() 的
    //   steer_ff = -atan2(wb·k, 1) 同号。（第一版误用 +atan，把偏差虚高了 ~2|need|）
    const need = -Math.atan(WB * g.curvature) * 180 / Math.PI;
    const c = pilot.drive({ X: p.refX, Y: p.refY, Z: 0, psi: g.heading, u, v: 0, w: 0, p: 0, q: 0, r: 0 }, 1 / 240);
    const bias = Math.abs(c.steer - need);
    sumBias += bias; nBias++;
    if (bias > maxBias) maxBias = bias;
    if (Math.abs(c.steer) > 27.5) satCount++;
  }
  ok(nBias > 30, `G22/R1: 静态权限样本充足（${nBias}）`);
  const meanBias = nBias ? sumBias / nBias : 999;
  ok(meanBias < T.MEAN_STEER_BIAS_DEG,
    `G22/R1: 平均舵角偏差 ${meanBias.toFixed(2)}° < ${T.MEAN_STEER_BIAS_DEG}°（修复前 2.70°）`);
  ok(maxBias < T.MAX_STEER_BIAS_DEG,
    `G22/R1: 最大舵角偏差 ${maxBias.toFixed(2)}° < ${T.MAX_STEER_BIAS_DEG}°（修复前 18.34°）`);
  ok(satCount === 0, `G22/R1: 无舵角撞 ±28° 限幅的采样点（实测 ${satCount} 处）`);

  /* ── 4. R2 修复：无碎片伪弯段 ─────────────────────────────── */
  const segs = {};
  for (let i = 0; i < N; i++) {
    const c = pts[i].cornerId;
    if (c < 0) continue;
    if (!segs[c]) segs[c] = { i0: i, i1: i };
    segs[c].i1 = i;
  }
  const segIds = Object.keys(segs).map(Number).sort((a, b) => a - b);
  ok(segIds.length > 0, `G22/R2: 检测到弯段（${segIds.length} 段）`);
  const tiny = [];
  for (const c of segIds) {
    const s = segs[c];
    let turn = 0;
    for (let i = s.i0; i < s.i1; i++) turn += pts[i].curvature * (pts[i + 1].s - pts[i].s);
    const deg = Math.abs(turn) * 180 / Math.PI;
    if (deg < T.MIN_CORNER_TURN_DEG) tiny.push(`cid${c}(${deg.toFixed(1)}°/${(pts[s.i1].s - pts[s.i0].s).toFixed(0)}m)`);
  }
  ok(tiny.length === 0,
    `G22/R2: 无总转角 <${T.MIN_CORNER_TURN_DEG}° 的碎片伪弯段（修复前 4 段；当前：${tiny.join(' ') || '无'}）`);

  /* ── 5. R2 修复：偏移折角受限 ─────────────────────────────── */
  let maxSlope = 0, slopeAt = -1;
  for (let i = 0; i < N - 1; i++) {
    const ds = Math.max(1e-6, pts[i + 1].s - pts[i].s);
    const k = Math.abs(pts[i + 1].offset - pts[i].offset) / ds;
    if (k > maxSlope) { maxSlope = k; slopeAt = i; }
  }
  ok(maxSlope <= T.MAX_OFFSET_SLOPE,
    `G22/R2: 最大偏移变化率 ${maxSlope.toFixed(3)} m/m（${(Math.atan(maxSlope) * 180 / Math.PI).toFixed(1)}° 折角）` +
    ` ≤ ${T.MAX_OFFSET_SLOPE}（修复前实测 0.806 = 38.9° @idx${slopeAt}）`);

  /* ── 5b. ★ 症状 2（“一个弯扭成好几个弯”）的无阈值度量 ──────────
     赛车线曲率总变差 TV(k)=Σ|Δk|·ds，并与中心线对比。
     物理含义：正确的外-内-外赛车线用【更大半径】过弯，应当比中心线
     【更平直】（比值 < 1）。修复前实测 1.83× —— 赛车线比中心线多扭 83%，
     即它不是在拉直弯道而是在往弯里叠加摆动。比“数符号翻转”健壮，
     因为后者对阈值敏感（直道上样条曲率在零附近游动会误计）。 */
  let tvLine = 0, tvCenter = 0, lineFlips = 0, lSgn = 0;
  for (let i = 0; i < N - 1; i++) {
    const ds = Math.max(1e-6, pts[i + 1].s - pts[i].s);
    const k1 = lineGeom(pts, i, N).curvature, k2 = lineGeom(pts, i + 1, N).curvature;
    tvLine += Math.abs(k2 - k1) * ds;
    tvCenter += Math.abs(pts[i + 1].curvature - pts[i].curvature) * ds;
  }
  for (let i = 0; i < N; i++) {
    const k = lineGeom(pts, i, N).curvature;
    const sg = k > 0.0015 ? 1 : (k < -0.0015 ? -1 : 0);
    if (sg !== 0) { if (lSgn !== 0 && sg !== lSgn) lineFlips++; lSgn = sg; }
  }
  const tvRatio = tvLine / Math.max(1e-9, tvCenter);
  ok(tvRatio <= T.MAX_TV_RATIO,
    `G22/R2: 赛车线曲率总变差/中心线 = ${tvRatio.toFixed(2)}x ≤ ${T.MAX_TV_RATIO}x` +
    `（TV 赛车线 ${tvLine.toFixed(2)} vs 中心线 ${tvCenter.toFixed(2)}；修复前 1.83x —— 赛车线比中心线还扭）`);
  ok(lineFlips <= T.MAX_LINE_DIR_FLIPS,
    `G22/R2: 赛车线曲率方向反转 ${lineFlips} 次 ≤ ${T.MAX_LINE_DIR_FLIPS}（修复前 43 次，即一条弯被扭成多个弯）`);

  /* ── 6. 激进走线：弯心须骑上路肩 ──────────────────────────── */
  const maxAbsOff = Math.max(...pts.map(p => Math.abs(p.offset)));
  ok(maxAbsOff >= T.APEX_KERB_RIDE_M,
    `G22/激进: 弯心最大偏移 ${maxAbsOff.toFixed(2)}m ≥ ${T.APEX_KERB_RIDE_M}m（hw=${HW}m + 路肩内侧，吃满路肩）`);
  const kerbEdge = HW + (P.kerb_m || 1.35);
  ok(maxAbsOff <= kerbEdge - 0.35,
    `G22/激进: 偏移不越出路肩外缘（${maxAbsOff.toFixed(2)}m ≤ ${kerbEdge.toFixed(2)}-0.35m，避免无谓罚时）`);

  /* ── 7. 闭环全圈：赛车线目标必须真的有权限（症状 1/2 的行为级验证）── */
  const cl = closedLoop(P, new R.AutoPilot({ wb: 2600 }), pts, N, 0, N - 2);
  ok(!cl.diverged, 'G22/闭环: 全圈未发散（修复前多个弯区几何层直接发散飞出赛道）');
  ok(cl.nRatio > 500, `G22/闭环: 弯心大偏移统计样本充足（${cl.nRatio}）`);
  ok(cl.trackRatio >= T.TRACK_RATIO,
    `G22/闭环: 弯心处实际偏移达命令偏移的 ${(cl.trackRatio * 100).toFixed(0)}% ≥ ${T.TRACK_RATIO * 100}%` +
    `（修复前：跑赛车线与跑中心线轨迹近乎一致，offset 目标被航向项淹没）`);
  ok(cl.maxLat < T.MAX_LAT_DEV_M,
    `G22/闭环: 全圈最大横向偏差 ${cl.maxLat.toFixed(2)}m < ${T.MAX_LAT_DEV_M}m`);
  ok(cl.meanLat < T.MEAN_LAT_DEV_M,
    `G22/闭环: 全圈平均横向偏差 ${cl.meanLat.toFixed(2)}m < ${T.MEAN_LAT_DEV_M}m`);
  // 转向方向反转（带滞环计数）。★ 旧写法 `steer*prev<0 && |两者|>0.8` 是假指标：
  //   速率限制 140°/s 下转向渐变过零，相邻两采样几乎不可能同时 >0.8° 且异号，恒为 0。
  //   真正区分“丝滑 vs 扭动”的是上面的 TV(k) 比值（静态、无阈值）；本项仅作为
  //   闭环层的约束（不得出现远超弯向切换次数的反复抹舵）。
  ok(cl.flips <= T.MAX_STEER_FLIPS,
    `G22/闭环: 全圈转向方向反转 ${cl.flips} 次 ≤ ${T.MAX_STEER_FLIPS}（无高频抹舵）`);
  // ★ 隐藏症状：激进走线不得引发无妄罚时。修复前实测干净圈最大 |crossTrackError|
  //   达 8.21m > EDGE 7.20m，748 个采样点超阈 —— 自动驾驶自己就在不断吃 +5s 罚时。
  ok(cl.overEdge === 0,
    `G22/闭环: 干净圈无出界罚时（超 EDGE=${cl.EDGE.toFixed(2)}m 的采样点 ${cl.overEdge} 个；修复前 748 个）`);
  ok(cl.maxCte < cl.EDGE - 0.30,
    `G22/闭环: 干净圈最大中心线偏差 ${cl.maxCte.toFixed(2)}m，距罚时阈值余量 ` +
    `${(cl.EDGE - cl.maxCte).toFixed(2)}m ≥ 0.30m（骑路肩与罚时规则不相互干扰）`);
  log(`  [G22] 全圈闭环：最大横向偏差 ${cl.maxLat.toFixed(2)}m、均值 ${cl.meanLat.toFixed(2)}m、` +
    `弯心达成率 ${(cl.trackRatio * 100).toFixed(0)}%、转向反转 ${cl.flips} 次、TV(k)比 ${tvRatio.toFixed(2)}x`);

  /* ── 8. 性能：最近点搜索须支持 hint 窗口 ────────────────────── */
  const evalSrc = fs.readFileSync(path.join(webDir, 'js', '10-eval.js'), 'utf8');
  ok(/_nearestIdx\s*\(x, y, hint, useRef\)/.test(evalSrc),
    'G22/性能: _nearestIdx(x, y, hint, useRef) 在位');
  ok(/this\._nearestIdx\(x, y, this\._hintRoad, false\)/.test(evalSrc),
    'G22/性能: getRoadElevation 已改走 hint 窗口（旧实现每子步 4 轮 × 1000Hz 的 O(P) 全量遍历，P=2884 时 ~18 万次距离计算/帧）');
  ok(/this\._nearestIdx\(x, y, this\._hintCtrl, true\)/.test(evalSrc),
    'G22/性能: getLookahead 对【赛车线】搜索且走 hint 窗口');
}

module.exports = runChecks;

/* 单独运行：彩色诊断输出
 * ★ 注意：ok 回调必须尊重 cond——stage_boot_check.js 的独立运行路径把首参
 *   当 (_c) 丢弃，导致断言失败也一律打印 [OK]（本文件不重蹈）。 */
if (require.main === module) {
  const webDir = path.join(__dirname, '..');
  let checks = 0;
  const failures = [];
  runChecks(webDir,
    (cond, msg) => {
      checks++;
      if (cond) { if (msg) console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`); }
      else { failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); }
    },
    msg => { checks++; failures.push(msg); console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`); },
    { log: m => console.log(m) });
  console.log('');
  if (failures.length) {
    console.error(`\x1b[31m赛车线循迹检查 FAIL：${failures.length}/${checks}\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m赛车线循迹检查 PASS：${checks} 项全过\x1b[0m`);
}
