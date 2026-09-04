/* G29 诊断：实证核验 test_lap_15dof 两项先验 FAIL 的根因
   ——峰值侧偏角（注释称 T12 入弯、学习 margin 0.92+ 超包络）
   ——峰值纵向滑移率（注释称 T14 trail-brake 内侧前轮卸荷抱死）
   方法：复用 test_lap_15dof 的 loadReal/runLaps 骨架，捕获越限事件上下文 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const webDir = path.join(__dirname, '..', 'web');
const lap = require(path.join(__dirname, '..', 'web', 'test', 'test_lap_15dof.js'));

// 复用其内部函数：直接 require 拿不到（未导出），故重抄 loadReal 骨架
/* 直接内联 test_lap_15dof 的 makeS/makeSweep/loadReal（避免括号配平提取的字符串陷阱） */
const loaderSrc = [];
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'test', 'test_lap_15dof.js'), 'utf8');
  const lines = src.split(/\r?\n/);
  let grabbing = null;
  for (const ln of lines) {
    if (grabbing === null) {
      const m = ln.match(/^function (makeS|makeSweep|loadReal)/);
      if (m) { grabbing = m[1]; loaderSrc.push(ln); }
    } else {
      loaderSrc.push(ln);
      if (ln === "}") grabbing = null;   // 三个函数均以顶格 "}" 结束
    }
  }
}
const loader = new Function('vm', 'fs', 'path', loaderSrc.join('\n') + '\nreturn loadReal;')(vm, fs, path);
const R = loader(webDir);

const mkSweepFn = new Function('return function makeSweep(k){' +
  'const rows=[]; for (const tr of [-55,-30,-10,0,10,30,60]) rows.push({tr, cam:-(3.20+0.0225*tr*k)+0.000040*tr*tr, toe:-0.15+0.0028*tr*k, mr:0.75+0.0004*tr, kw:67500, rcH:52+0.06*tr}); return {rows,min:-55,max:60}; }')();
const SIM_A = { mrRefF: 0.75, mrRefR: 0.78, rcH_F: 52, rcH_R: 63, swF: mkSweepFn(1.0), swR: mkSweepFn(1.0) };

const P = new R.ctx.window.CircuitPath(R.wp, 1.35, 1.0);
const pts = P.pts, N = pts.length;
const S = (new Function(loaderSrc.join('\n').split('function makeSweep')[0] + '; return makeS;'))();
const eng = new R.ctx.window.VehicleDynamics15DOF(S, SIM_A, 5.0);
const p0 = pts[0];
Object.assign(eng.state, {
  X: p0.x, Y: p0.y, Z: 0, phi: 0, theta: 0, psi: p0.heading,
  u: 5, v: 0, w: 0, p: 0, q: 0, r: 0,
  omega: { FL: 5 / 0.30, FR: 5 / 0.30, RL: 5 / 0.30, RR: 5 / 0.30 }
});
const pilot = new R.ctx.window.UniversalAutoPilotMPC(S);
pilot.setPath(P); pilot.active = true;
pilot.eng = eng;   // G30：与产品/test 同口径
if (pilot.initLapLearning) pilot.initLapLearning(P.cornerCount || 0);
P._hintCtrl = 0; P._hintRoad = 0;

const dt = 1 / 240;
const R2D = 180 / Math.PI;
let t = 0, ci = 0, lastS = 0, lapNo = 0;
const events = [];
let lapMarks = [];
const TH_SLIP = 14 * Math.PI / 180, TH_KAPPA = 0.45;
// 按 弯×圈 聚合：峰值 α / κ / 触发时的 u / thr / brk
const agg = {};
function aggRec(cid, lap, tel, st) {
  const key = cid + '_L' + lap;
  const a = agg[key] || (agg[key] = { aMax: 0, kMax: 0, uAtA: 0, thrAtA: 0, brkAtA: 0, uAtK: 0 });
  for (const w of ['FL', 'FR', 'RL', 'RR']) {
    const al = Math.abs(tel.alpha[w] || 0), ka = Math.abs(tel.kappa[w] || 0);
    if (al > a.aMax) { a.aMax = al; a.uAtA = st.u; a.thrAtA = st.throttle; a.brkAtA = st.brake; }
    if (ka > a.kMax) { a.kMax = ka; a.uAtK = st.u; }
  }
}
// 事件窗口内的持续记录（前后 2s 采样）
const windows = [];
let curWin = null;

function openWin(kind, w, val) {
  if (curWin) windows.push(curWin);
  curWin = { kind, wheel: w, peakVal: val, samples: [] };
}
for (let step = 0; step < 240 * 900; step++) {
  const T_N_LAPS = 2;
  const ctrl = pilot.drive(eng.state, dt);
  eng.step(ctrl, { grade: 0, path: P, bumpNoise: 0 }, dt);
  t += dt;
  const s = eng.state;
  if (!isFinite(s.X) || !isFinite(s.Y)) break;
  let md = Infinity, best = ci;
  for (let k = -200; k <= 200; k++) {
    const i = (ci + k + N) % N;
    const d = (pts[i].refX - s.X) ** 2 + (pts[i].refY - s.Y) ** 2;
    if (d < md) { md = d; best = i; }
  }
  ci = best;
  const p = pts[ci];
  const cte = (s.X - p.x) * p.nx + (s.Y - p.y) * p.ny;
  if (Math.abs(cte) > (P.hw_m || 4.9) + (P.kerb_m || 1.35) + 0.95) {
    if (pilot.reportRunoff) pilot.reportRunoff(p.cornerId);
  }
  const telNow = eng.telemetry;
  aggRec(p.cornerId, lapNo + 1, telNow, { u: s.u, throttle: ctrl.throttle, brake: ctrl.brake });
  // 稠密时序：MPC 调试用，前 25s 每 0.5s 记录
  if (t <= 25 && step % 120 === 0) {
    const aCG = S.wb * 0.46 / 1000;
    const tg2 = P.getLookahead(s.X - aCG * Math.sin(s.psi), s.Y + aCG * Math.cos(s.psi), s.u);
    console.log(`M t=${t.toFixed(1)} cid=${p.cornerId} u=${s.u.toFixed(1)} v=${(s.v||0).toFixed(2)} r=${((s.r||0)*R2D).toFixed(1)} psi=${(s.psi*R2D).toFixed(1)} psiP=${(tg2.targetHeading*R2D).toFixed(1)} st=${ctrl.steer.toFixed(1)} brk=${ctrl.brake.toFixed(2)} thr=${ctrl.throttle.toFixed(2)} eL=${(pilot.last_line_error||0).toFixed(2)} lat=${(((s.X-p.refX)*p.refNx+(s.Y-p.refY)*p.refNy)).toFixed(2)} cte=${(((s.X-p.x)*p.nx+(s.Y-p.y)*p.ny)).toFixed(2)} s=${(p.s||0).toFixed(0)}`);
  }
  // 越限检测（每个事件开一个窗口，间隔 >1s 才重开）
  let evKind = null, evW = null, evVal = 0;
  for (const w of ['FL', 'FR', 'RL', 'RR']) {
    const al = Math.abs(eng.telemetry.alpha[w] || 0);
    const ka = Math.abs(eng.telemetry.kappa[w] || 0);
    if (al > TH_SLIP && al > evVal) { evKind = 'SLIP'; evW = w; evVal = al; }
    if (ka > TH_KAPPA && ka > evVal) { evKind = 'KAPPA'; evW = w; evVal = ka; }
  }
  const inWin = curWin && (t - curWin.tEnd) < 1.0;
  if (evKind) {
    if (!curWin || curWin.kind !== evKind || (t - curWin.tEnd) > 1.5) openWin(evKind, evW, evVal);
    curWin.tEnd = t;
    curWin.peakVal = Math.max(curWin.peakVal, evVal);
  }
  if (curWin) {
    const tel = eng.telemetry;
    const cid = p.cornerId;
    curWin.samples.push({
      t: +t.toFixed(2), s: +(p.s || 0).toFixed(0), cid, lap: lapNo + 1, wheel: curWin.wheel,
      u: +s.u.toFixed(1), v: +(s.v || 0).toFixed(2), psi_dot: +(s.r * R2D).toFixed(1),
      steer: +ctrl.steer.toFixed(1), brk: +ctrl.brake.toFixed(2), thr: +ctrl.throttle.toFixed(2),
      aFz: [+tel.Fz.FL.toFixed(0), +tel.Fz.FR.toFixed(0), +tel.Fz.RL.toFixed(0), +tel.Fz.RR.toFixed(0)].join('/'),
      kappas: ['FL','FR','RL','RR'].map(w => (tel.kappa[w]||0).toFixed(2)).join('/'),
      alphas: ['FL','FR','RL','RR'].map(w => ((tel.alpha[w]||0)*R2D).toFixed(1)).join('/'),
      ay: +tel.ay.toFixed(2),
      margin: (cid >= 0 && pilot.cornerMargins[cid] !== undefined) ? +pilot.cornerMargins[cid].toFixed(2) : null
    });
  } else if (curWin === null && windows.length && windows[windows.length-1].samples.length > 480) {
    windows[windows.length-1].samples = windows[windows.length-1].samples.filter((_, i) => i % 8 === 0);
  }
  if (p.s < P.totalLength * 0.1 && lastS > P.totalLength * 0.9) {
    lapNo++;
    if (pilot.endLap) pilot.endLap();
    lapMarks.push({ lap: lapNo, t: +t.toFixed(1) });
  if (lapNo >= T_N_LAPS) break;
  }
  lastS = p.s;
}
if (curWin) windows.push(curWin);

console.log(`圈: ${lapMarks.map(m => `#${m.lap}@${m.t}s`).join(' ')} | 弯数: ${P.cornerCount}`);
console.log('\n===== 按弯×圈聚合（aMax 单位 °，kMax 比值）=====');
const keys = Object.keys(agg).sort((x, y) => {
  const [cx, lx] = x.split('_'), [cy, ly] = y.split('_');
  return (+lx - +ly) || (+cx - +cy);
});
for (const k of keys) {
  const a = agg[k];
  const flag = (a.aMax * R2D > 14 || a.kMax > 0.45) ? ' <<<' : '';
  console.log(`${k}: α=${(a.aMax * R2D).toFixed(1)}°@u=${a.uAtA.toFixed(1)}(thr=${a.thrAtA.toFixed(2)},brk=${a.brkAtA.toFixed(2)}) κ=${a.kMax.toFixed(2)}@u=${a.uAtK.toFixed(1)}${flag}`);
}
for (const w of windows) {
  console.log(`\n===== ${w.kind} 事件 · 峰值 ${w.kind === 'SLIP' ? (w.peakVal * R2D).toFixed(1) + '°' : w.peakVal.toFixed(2)} · 轮 ${w.wheel} · 采样 ${w.samples.length} =====`);
  // 打印窗口首、峰、尾的代表性样本（每 24 条取 1 + 峰值样本）
  const ss = w.samples;
  const stride = Math.max(1, Math.floor(ss.length / 14));
  for (let i = 0; i < ss.length; i += stride) {
    const x = ss[i];
    console.log(`t=${x.t} s=${x.s} cid=${x.cid} L${x.lap} u=${x.u} v=${x.v} r=${x.psi_dot}°/s st=${x.steer} brk=${x.brk} thr=${x.thr} Fz=${x.aFz} κ=${x.kappas} α=${x.alphas} ay=${x.ay} m=${x.margin}`);
  }
  const last = ss[ss.length - 1];
  console.log(`t=${last.t} s=${last.s} cid=${last.cid} L${last.lap} u=${last.u} st=${last.steer} brk=${last.brk} Fz=${last.aFz} κ=${last.kappas} α=${last.alphas} m=${last.margin}  [窗口尾]`);
}
