"use strict";
/* ============================================================================
 * LABSUS · 24-fsae-arena.js
 * 大学生方程式动态赛场 (Formula Student / FSAE / FSC Dynamic Competition Arena)
 *
 * 严格遵循 FSAE / FSG / FSC 动态赛规则组合设计：
 *   1. 直线加速赛 (75m Acceleration)         — 75m 计时 + ≥75m 制动区，DOO +2.0s，满分 100
 *   2. 八字绕环赛 (Figure-8 Skidpad)         — 双切圆心距 18.25m / 内径 15.25m / 宽 3.0m，
 *                                              右圈×2(第2圈计时) → 左圈×2(第2圈计时)，DOO +0.125s，满分 75
 *   3. 单圈赛 / 高速避障 (Autocross / Sprint) — 内置 3 条真实/合规赛道：
 *        - FSG 德国大学生方程式官方赛道 (MIT License: mvanlobensels/random-track-generator)
 *        - FSI 意大利大学生方程式官方赛道 (MIT License: mvanlobensels/random-track-generator)
 *        - FSC 中国大学生方程式 744m 标准组合单圈 (规则全要素：最窄≥3.0m、最长直线≤80m、
 *          发卡弯直径≥9m、5桩蛇形绕桩、高速S弯、定半径回旋弯)
 *   4. 三项组合联测 (Combined Competition)    — 依次跑完 直线加速 → 八字绕环 → 单圈赛，
 *                                              自动汇总 275 分动态赛总成绩单。
 * ============================================================================ */

const FSAE_TRACK_DATA = {"FSG":{"center":[[0.01,1.92],[0.07,5.11],[0.32,9.13],[0.61,13.54],[0.91,18.01],[1.25,22.43],[1.67,26.61],[2.09,30.44],[2.51,33.88],[2.91,36.86],[3.41,39.29],[4.2,41.6],[5.36,43.06],[7.61,44.61],[9.32,45.14],[10.87,45.25],[12.86,45.12],[15.16,44.75],[17.33,44.09],[19.35,43.06],[21.37,41.54],[23.35,39.27],[24.84,36.54],[26.06,33.03],[26.82,29.83],[27.41,26.91],[27.74,23.96],[27.43,20.68],[26.13,17.47],[24.64,15.63],[23.14,14.2],[21.37,12.52],[19.44,10.57],[17.45,8.23],[15.8,5.09],[15.4,1.26],[16.56,-2.56],[20.17,-5.23],[24.05,-6.1],[27.43,-6.12],[30.41,-6.27],[33.22,-7.29],[36.01,-8.7],[39.45,-9.78],[42.47,-9.33],[45.0,-8.06],[47.64,-6.11],[49.79,-3.05],[50.73,1.28],[50.66,5.98],[50.59,9.92],[51.04,12.53],[51.8,14.51],[53.04,16.18],[54.81,17.97],[57.63,19.94],[60.99,21.79],[64.16,23.19],[67.1,23.89],[69.42,23.88],[71.21,23.19],[73.16,20.59],[73.44,17.83],[72.92,14.83],[71.87,11.42],[70.61,7.65],[69.38,3.93],[68.18,0.41],[66.86,-2.89],[64.99,-5.68],[62.45,-8.0],[60.15,-9.71],[57.77,-11.59],[55.11,-13.81],[52.31,-15.95],[49.59,-18.02],[46.79,-20.07],[43.83,-22.19],[40.83,-23.99],[37.23,-25.29],[33.66,-25.48],[30.2,-25.24],[26.62,-24.73],[22.86,-23.84],[19.14,-22.73],[15.43,-21.39],[11.87,-20.01],[8.72,-18.49],[6.2,-16.36],[4.28,-14.08],[2.76,-11.62],[1.53,-8.62],[0.77,-5.6],[0.29,-2.87],[0.07,-0.5]],"left":[[-1.97,-0.12],[-1.83,4.42],[-1.47,8.92],[-1.12,13.66],[-0.83,18.16],[-0.5,22.64],[-0.02,27.41],[0.38,30.57],[0.86,34.39],[1.25,37.57],[1.63,41.13],[2.68,43.25],[4.12,45.09],[6.05,46.46],[8.11,47.13],[10.6,47.19],[13.1,47.09],[15.43,46.74],[17.83,46.0],[19.87,45.08],[22.32,43.44],[24.77,40.93],[26.81,37.27],[27.98,33.89],[28.57,30.44],[29.43,26.56],[29.86,23.56],[29.92,21.0],[28.53,16.94],[25.96,14.34],[24.39,12.96],[22.45,11.0],[20.74,9.07],[19.12,7.4],[17.48,4.82],[17.02,1.36],[17.72,-1.63],[21.03,-3.46],[24.3,-3.83],[26.72,-3.84],[29.39,-3.76],[33.32,-4.73],[36.23,-6.73],[39.35,-8.38],[41.87,-7.9],[44.07,-6.6],[46.77,-4.61],[48.25,-2.4],[48.69,1.51],[48.07,5.55],[48.13,9.46],[48.66,12.42],[49.62,15.0],[50.88,16.87],[53.53,19.69],[56.96,22.15],[60.47,24.05],[63.9,25.4],[67.65,26.03],[70.95,25.83],[73.91,24.68],[75.6,22.24],[75.76,18.99],[75.3,15.23],[73.73,11.07],[72.34,6.99],[71.04,3.12],[69.88,-0.36],[68.5,-4.32],[66.35,-7.52],[64.07,-9.39],[61.42,-10.93],[58.97,-12.85],[56.79,-14.85],[53.18,-17.43],[50.64,-19.33],[48.06,-21.18],[44.28,-24.11],[40.9,-26.75],[37.75,-27.51],[34.31,-27.52],[29.98,-27.04],[26.04,-26.51],[22.15,-25.45],[18.41,-24.43],[14.84,-23.14],[11.39,-21.67],[7.16,-19.97],[4.49,-17.41],[2.01,-14.33],[0.67,-12.19],[-0.43,-10.03],[-1.38,-5.46],[-1.81,-2.48],[-1.97,-0.12]],"right":[[1.97,0.12],[1.83,4.53],[2.08,8.83],[2.34,13.47],[2.67,18.12],[2.97,22.33],[3.49,27.24],[3.79,30.32],[4.2,33.87],[4.67,37.19],[6.01,41.04],[8.88,43.09],[10.64,43.39],[13.02,43.17],[14.63,42.94],[16.6,42.41],[18.24,41.56],[19.85,40.5],[21.79,38.32],[23.07,35.89],[24.28,32.33],[25.42,27.93],[25.86,24.86],[25.97,22.36],[24.6,18.29],[22.37,15.85],[19.58,13.46],[17.94,11.92],[16.55,10.44],[14.03,7.14],[13.47,4.71],[13.4,1.49],[13.53,-2.41],[14.86,-4.59],[18.06,-7.2],[22.1,-8.57],[26.13,-8.63],[30.0,-8.06],[33.74,-9.79],[37.95,-12.07],[42.54,-11.32],[46.53,-9.35],[49.63,-7.29],[51.16,-5.16],[52.34,-3.06],[52.9,-0.89],[53.17,1.21],[53.25,5.81],[52.71,10.12],[53.39,13.52],[55.97,16.46],[58.52,18.07],[64.93,21.4],[67.58,22.12],[69.94,21.87],[71.38,20.3],[71.42,16.7],[70.28,12.55],[68.87,8.31],[67.65,4.46],[66.48,1.07],[65.04,-2.66],[63.34,-4.73],[60.92,-6.82],[58.95,-8.36],[56.21,-10.59],[54.04,-12.4],[51.05,-14.76],[48.7,-16.63],[46.44,-18.31],[44.37,-19.71],[42.38,-21.09],[38.88,-22.71],[37.24,-23.49],[34.65,-23.61],[31.03,-23.57],[27.48,-23.18],[23.42,-22.23],[19.63,-21.07],[16.0,-19.65],[12.39,-18.41],[8.99,-16.81],[7.18,-14.73],[5.73,-12.98],[4.46,-10.76],[3.61,-8.45],[2.73,-5.12],[2.22,-2.5],[1.97,0.12]]},"FSI":{"center":[[0.28,-0.81],[0.16,1.57],[0.89,4.23],[1.66,5.38],[3.22,6.65],[5.95,7.9],[8.85,8.53],[11.73,8.79],[14.71,8.6],[17.63,7.9],[20.24,6.88],[22.52,5.8],[24.86,4.62],[27.35,3.36],[30.25,2.12],[33.64,1.46],[37.48,2.66],[39.84,4.9],[41.42,7.13],[43.07,9.18],[45.19,11.11],[46.98,12.2],[49.31,13.04],[52.0,13.54],[54.2,13.83],[56.5,14.13],[59.76,14.53],[62.91,14.93],[65.68,15.21],[68.46,15.21],[71.59,14.49],[73.67,13.4],[75.73,12.15],[78.49,10.95],[81.76,10.51],[84.71,10.61],[86.91,10.87],[89.11,10.91],[90.9,10.59],[92.61,9.69],[93.47,8.77],[94.08,7.1],[94.18,4.91],[93.62,3.66],[92.34,2.29],[91.2,1.57],[89.75,1.1],[87.69,0.57],[85.13,-0.0],[82.17,-0.6],[79.08,-1.17],[76.26,-2.05],[73.54,-3.74],[71.06,-5.82],[69.0,-7.06],[66.3,-8.06],[62.84,-8.91],[59.03,-9.75],[55.1,-10.5],[50.97,-11.26],[46.78,-11.99],[42.79,-12.67],[39.34,-13.22],[36.56,-13.37],[33.78,-12.85],[31.38,-11.82],[29.78,-10.71],[28.4,-9.47],[26.87,-8.06],[24.78,-6.33],[22.07,-4.58],[18.5,-3.65],[15.3,-4.18],[12.48,-5.43],[9.64,-6.4],[7.24,-6.6],[5.37,-6.33],[3.21,-5.26],[2.03,-4.19],[0.91,-2.58]],"left":[[-2.12,-0.21],[-2.06,2.59],[-1.16,5.12],[0.38,7.11],[2.2,8.79],[4.66,9.84],[7.55,10.47],[11.08,10.69],[14.36,10.77],[17.88,9.96],[20.35,8.87],[23.08,7.33],[25.7,6.0],[28.02,4.82],[31.27,3.61],[33.94,3.01],[36.3,3.98],[38.33,5.95],[40.0,8.46],[41.8,10.72],[43.87,12.55],[46.44,14.09],[49.42,15.12],[51.66,15.32],[54.08,15.48],[55.62,15.81],[59.43,16.26],[63.04,16.69],[66.03,17.09],[69.23,17.26],[72.02,16.47],[74.44,14.95],[76.57,13.68],[79.19,12.6],[81.77,12.48],[84.67,12.53],[87.56,12.98],[90.55,13.06],[92.87,12.38],[94.7,10.99],[96.18,8.88],[96.93,6.87],[96.93,4.67],[96.01,2.7],[94.81,1.19],[93.26,0.07],[91.31,-0.66],[88.95,-1.25],[86.32,-1.73],[82.86,-2.31],[79.32,-3.01],[76.79,-3.76],[74.84,-5.13],[72.97,-6.84],[69.79,-8.71],[66.74,-9.86],[63.7,-10.46],[59.68,-11.31],[55.67,-12.0],[51.19,-12.86],[46.7,-13.7],[42.72,-14.44],[38.55,-15.22],[35.47,-15.27],[32.86,-14.59],[30.65,-13.71],[28.91,-12.4],[27.45,-10.93],[25.89,-9.44],[23.95,-7.89],[21.49,-5.94],[18.35,-5.32],[15.92,-5.86],[13.63,-7.12],[10.67,-8.25],[7.52,-8.5],[4.5,-8.02],[2.26,-6.77],[0.21,-4.93],[-1.21,-2.79]],"right":[[46.79,10.2],[49.73,11.32],[51.89,11.72],[54.16,12.16],[56.3,12.34],[57.11,12.23],[60.76,12.92],[64.26,13.39],[67.78,13.55],[71.09,12.96],[73.45,11.52],[75.98,9.71],[78.61,8.54],[81.1,8.35],[84.07,8.48],[86.98,8.97],[89.72,8.86],[91.56,7.8],[92.01,5.46],[90.48,3.49],[88.53,2.88],[86.18,2.2],[83.36,1.52],[80.87,0.9],[80.19,1.12],[77.49,0.43],[75.18,-0.2],[73.2,-1.27],[71.44,-2.82],[69.64,-4.89],[66.84,-6.17],[63.52,-7.02],[60.55,-7.7],[57.96,-8.36],[54.72,-8.97],[50.87,-9.64],[47.37,-10.23],[43.7,-10.78],[40.08,-11.33],[37.2,-11.79],[34.18,-11.17],[31.52,-9.89],[29.58,-8.23],[27.76,-6.49],[25.89,-4.93],[23.88,-3.48],[21.41,-2.0],[18.96,-1.42],[16.48,-1.5],[14.26,-2.41],[12.1,-3.57],[9.29,-4.78],[5.95,-4.89],[3.8,-3.81],[2.3,-1.54],[2.02,1.23],[2.72,3.63],[4.3,4.98],[6.48,6.04],[9.44,6.67],[11.93,7.04],[14.93,6.7],[17.49,6.01],[20.61,4.92],[23.68,3.45],[25.75,2.34],[27.97,1.09],[30.73,-0.18],[33.61,-0.96],[36.48,-0.68],[38.92,0.59],[40.85,2.74],[42.15,4.92],[43.99,7.58],[46.79,10.2]]},"FSC_CTRL":[[0,0],[0,24],[0,48],[0,70],[8,88],[24,98],[44,96],[60,84],[66,66],[63.8,55],[68.2,44],[63.8,33],[68.2,22],[63.8,11],[66,0],[74,-14],[92,-16],[108,-6],[124,-4],[138,-14],[144,-27],[138,-40],[124,-44],[112,-52],[102,-68],[88,-82],[68,-90],[44,-92],[18,-92],[-6,-92],[-30,-90],[-50,-80],[-64,-62],[-66,-40],[-56,-20],[-38,-12],[-22,-20],[-16,-34],[-6,-38],[4,-30],[2,-16]]};

const FSAE_AUTOCROSS_META = {
  fsg: {
    id: "fsg",
    name: "FSG 德国官方赛道",
    fullName: "Formula Student Germany (FSG Official · GitHub MIT)",
    source: "MIT: mvanlobensels/random-track-generator (FSG.yaml)",
    tMin: 24.5,
    halfWidth: 1.55,
    coneOffset: 0.06
  },
  fsi: {
    id: "fsi",
    name: "FSI 意大利官方赛道",
    fullName: "Formula Student Italy (FSI Official · GitHub MIT)",
    source: "MIT: mvanlobensels/random-track-generator (FSI.yaml)",
    tMin: 18.5,
    halfWidth: 1.50,
    coneOffset: 0.06
  },
  fsc_std: {
    id: "fsc_std",
    name: "FSC 标准组合单圈 (744m)",
    fullName: "FSC 中国大学生方程式规则全要素标准单圈 (744m)",
    source: "LABSUS FSC/FSAE D7 规则自研设计（3.6m道宽 / ≤80m直线 / 5桩绕桩 / R6+发卡弯）",
    tMin: 46.0,
    halfWidth: 1.80,
    coneOffset: 0.22
  }
};

/* ============================================================================
 * 1. FSAE / FSC 官方动态赛积分计算器 (满分 100 + 75 + 100 = 275 分)
 * ============================================================================ */
function computeFsaeAccelScore(tSec) {
  if (!isFinite(tSec) || tSec <= 0) return 0;
  const tMin = 3.85;
  const tMax = tMin * 1.50; // 5.775s
  if (tSec <= tMin) return 100.0;
  if (tSec >= tMax) return 4.5;
  const ratio = ((tMax / tSec) - 1.0) / ((tMax / tMin) - 1.0);
  return Math.max(4.5, Math.min(100.0, 4.5 + 95.5 * ratio));
}

function computeFsaeSkidpadScore(tSec) {
  if (!isFinite(tSec) || tSec <= 0) return 0;
  const tMin = 4.85;
  const tMax = tMin * 1.25; // 6.0625s
  if (tSec <= tMin) return 75.0;
  if (tSec >= tMax) return 3.5;
  const num = Math.pow(tMax / tSec, 2) - 1.0;
  const den = Math.pow(tMax / tMin, 2) - 1.0;
  return Math.max(3.5, Math.min(75.0, 3.5 + 71.5 * (num / den)));
}

function computeFsaeAutocrossScore(tSec, trackId) {
  if (!isFinite(tSec) || tSec <= 0) return 0;
  const meta = FSAE_AUTOCROSS_META[trackId] || FSAE_AUTOCROSS_META.fsg;
  const tMin = meta.tMin;
  const tMax = tMin * 1.45;
  if (tSec <= tMin) return 100.0;
  if (tSec >= tMax) return 4.5;
  const ratio = ((tMax / tSec) - 1.0) / ((tMax / tMin) - 1.0);
  return Math.max(4.5, Math.min(100.0, 4.5 + 95.5 * ratio));
}

/* ============================================================================
 * 2. 通用桩桶碰撞检测（OBB 近似，匹配 FSAE 规则 DOO 撞桶罚时）
 * ============================================================================ */
function checkFsaeCones(cones, hitSet, posX, posY, psi, vehW, vehL) {
  if (!cones || !cones.length) return 0;
  const cPsi = Math.cos(psi), sPsi = Math.sin(psi);
  const halfW = (vehW || 1.42) * 0.5 + 0.08;
  const halfL = (vehL || 2.85) * 0.5 + 0.08;
  let newHits = 0;
  for (let i = 0; i < cones.length; i++) {
    const c = cones[i];
    if (c.hit || hitSet.has(c.id)) continue;
    const dx = c.x - posX;
    const dy = c.y - posY;
    if (Math.abs(dx) > 3.2 || Math.abs(dy) > 3.2) continue;
    // Vehicle frame: forward = (-sin(psi), cos(psi)), right = (cos(psi), sin(psi))
    const lx = dx * cPsi + dy * sPsi;
    const ly = -dx * sPsi + dy * cPsi;
    if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfL) {
      c.hit = true;
      hitSet.add(c.id);
      newHits++;
    }
  }
  return newHits;
}

/* ============================================================================
 * 3. 赛事一：75m 直线加速赛 (FsaeAccelPath)
 * ============================================================================ */
class FsaeAccelPath {
  constructor(mu = 1.35) {
    this.eventType = "accel";
    this.mu = mu;
    this.halfWidth = 1.80; // 3.6m lane width (>= 3.0m FSAE rule)
    this.timedLength = 75.0;
    this.runoffLength = 90.0; // >= 75m FSAE rule
    this.totalLength = 175.0;
    this.startState = { X: 0, Y: -0.30, psi: 0, u: 0 };
    this.cones = [];
    this._hitSet = new Set();
    this.pts = [];
    this._build();
  }

  _build() {
    this.pts = [];
    for (let y = -10; y <= 165; y += 2.0) {
      this.pts.push({
        x: 0, y, refX: 0, refY: y,
        heading: 0, refHeading: 0,
        nx: 1, ny: 0,
        curvature: 0, refCurvature: 0,
        s: y + 10,
        v_max: y < 75.0 ? 55.0 : 0.0,
        turn: y < 0 ? "发车区" : (y <= 75.0 ? "75m 计时加速段" : "制动缓冲区")
      });
    }
    this.cones = [];
    const hw = this.halfWidth;
    let id = 0;
    for (let y = -5; y <= 165; y += 5.0) {
      const isGate = (Math.abs(y) < 0.1 || Math.abs(y - 75.0) < 0.1);
      const isBrakeZone = y > 75.0;
      const colL = isGate ? "orange_big" : (isBrakeZone ? "orange" : "blue");
      const colR = isGate ? "orange_big" : (isBrakeZone ? "orange" : "yellow");
      this.cones.push({ id: `acc_L_${id}`, x: -hw, y, color: colL, hit: false });
      this.cones.push({ id: `acc_R_${id}`, x: hw, y, color: colR, hit: false });
      if (isGate) {
        // Double big-orange timing gate cones per FSG/FSAE rules
        this.cones.push({ id: `acc_Lg_${id}`, x: -hw - 0.45, y, color: "orange_big", hit: false });
        this.cones.push({ id: `acc_Rg_${id}`, x: hw + 0.45, y, color: "orange_big", hit: false });
      }
      id++;
    }
    // End stop barrier cones
    for (let x = -1.2; x <= 1.21; x += 0.8) {
      this.cones.push({ id: `acc_end_${id++}`, x, y: 165, color: "orange", hit: false });
    }
  }

  resetCones() {
    this._hitSet.clear();
    for (const c of this.cones) c.hit = false;
  }

  checkConeCollisions(x, y, psi, vehW, vehL) {
    return checkFsaeCones(this.cones, this._hitSet, x, y, psi, vehW, vehL);
  }

  getLookahead(fx, fy, u, distOverride) {
    const isAccel = (fy < this.timedLength);
    const turn = fy < 0 ? "发车准备区" : (isAccel ? "75m 全油门冲刺" : "终点制动区");
    return {
      targetHeading: 0,
      targetCurvature: 0,
      targetSpeed: isAccel ? 55.0 : 0.0,
      crossTrackError: fx,
      lineError: fx,
      refX: 0,
      refY: Math.max(-10, Math.min(165, fy + (distOverride || 0))),
      idx: Math.max(0, Math.min(this.pts.length - 1, Math.round((fy + 10) / 2))),
      s: Math.max(0, fy),
      turn
    };
  }

  getRoadElevation() {
    return { z_road: 0, isKerb: false, mu: this.mu };
  }
}

/* ============================================================================
 * 4. 赛事二：标准八字绕环赛 (FsaeSkidpadPath)
 *    官方 FSAE / FSG / FSC 几何：
 *      - 双切圆心距 18.25 m，左圆心 (-9.125, 0)，右圆心 (+9.125, 0)
 *      - 行驶中心半径 R_c = 9.125 m (直径 18.25 m)
 *      - 内圈桩桶直径 15.25 m (R_in = 7.625 m)，外圈桩桶直径 21.25 m (R_out = 10.625 m)
 *      - 赛道宽度 3.00 m
 *      - 行驶流程：入场直道 → 右圈×2（第2圈计时）→ 左圈×2（第2圈计时）→ 出场制动
 * ============================================================================ */
class FsaeSkidpadPath {
  constructor(mu = 1.35, capFn = null) {
    this.eventType = "skidpad";
    this.mu = mu;
    this.Rc = 9.125;
    this.Rin = 7.625;
    this.Rout = 10.625;
    this.halfWidth = 1.50;
    this.entryLen = 15.0;
    this.exitLen = 24.0;
    this.circLen = 2 * Math.PI * this.Rc; // 57.334m per circle lap
    this.sEnterR = this.entryLen;
    this.sStartR2 = this.entryLen + this.circLen;
    this.sEndR2 = this.entryLen + 2 * this.circLen;
    this.sStartL2 = this.entryLen + 3 * this.circLen;
    this.sEndL2 = this.entryLen + 4 * this.circLen;
    this.totalLength = this.sEndL2 + this.exitLen;
    this.startState = { X: 0, Y: -this.entryLen + 0.5, psi: 0, u: 0 };

    // Determine safe steady cornering speed on R = 9.125m from vehicle capability (staying below rear breakaway)
    let ayTarget = this.mu * 9.81 * 0.74;
    if (capFn && typeof capFn.lateral === "function") {
      const ayCap = capFn.lateral(11.0);
      if (isFinite(ayCap) && ayCap > 4.0) {
        ayTarget = Math.min(ayTarget, ayCap * 0.78);
      }
    }
    this.vCorner = Math.max(7.8, Math.min(10.6, Math.sqrt(ayTarget * this.Rc)));

    this.pts = [];
    this.cones = [];
    this._hitSet = new Set();
    this._hintIdx = 0;
    this._build();
  }

  _build() {
    this.pts = [];
    const Rc = this.Rc;
    const ds = 0.45;
    let sAcc = 0;
    const pushPt = (x, y, heading, k, vMax, turn, phase) => {
      const nx = Math.cos(heading), ny = Math.sin(heading);
      this.pts.push({
        x, y, refX: x, refY: y,
        heading, refHeading: heading,
        nx, ny,
        curvature: k, refCurvature: k,
        s: sAcc, v_max: vMax, turn, phase
      });
    };

    // Phase 0: Entry chute y = -15 -> 0
    const nEnt = Math.round(this.entryLen / ds);
    for (let i = 0; i < nEnt; i++) {
      const d = (i / nEnt) * this.entryLen;
      sAcc = d;
      // Gently blend curvature in final 1.8m before circle entry
      const blend = d > (this.entryLen - 1.8) ? (d - (this.entryLen - 1.8)) / 1.8 : 0;
      const k = (-1.0 / Rc) * blend * 0.45;
      pushPt(0, -this.entryLen + d, 0, k, this.vCorner * 0.94, "入场直道", "ENTRY");
    }

    // Phase 1 & 2: Two CW laps around Right Circle (+Rc, 0)
    // Angle theta: 0 -> 4*PI. At theta=0: (0,0), heading=0 (+Y), turning RIGHT (CW => k = -1/Rc, heading = -theta)
    const nCirc = Math.round((2 * this.circLen) / ds);
    for (let i = 0; i < nCirc; i++) {
      const frac = i / nCirc;
      const theta = frac * 4 * Math.PI;
      const x = Rc * (1.0 - Math.cos(theta));
      const y = Rc * Math.sin(theta);
      let heading = -theta;
      while (heading > Math.PI) heading -= 2 * Math.PI;
      while (heading < -Math.PI) heading += 2 * Math.PI;
      sAcc = this.entryLen + frac * 2 * this.circLen;
      const isLap2 = (theta >= 2 * Math.PI);
      // Slight speed trim right before the figure-8 inflection at theta -> 4*PI
      const distToSwitch = (4 * Math.PI - theta) * Rc;
      const vTar = distToSwitch < 6.0 ? this.vCorner * 0.82 : this.vCorner;
      pushPt(x, y, heading, -1.0 / Rc, vTar, isLap2 ? "右环第2圈 (计时)" : "右环第1圈 (热身)", isLap2 ? "R_LAP2" : "R_LAP1");
    }

    // Phase 3 & 4: Two CCW laps around Left Circle (-Rc, 0)
    // Angle phi: 0 -> 4*PI. At phi=0: (0,0), heading=0 (+Y), turning LEFT (CCW => k = +1/Rc, heading = +phi)
    for (let i = 0; i < nCirc; i++) {
      const frac = i / nCirc;
      const phi = frac * 4 * Math.PI;
      const x = -Rc * (1.0 - Math.cos(phi));
      const y = Rc * Math.sin(phi);
      let heading = phi;
      while (heading > Math.PI) heading -= 2 * Math.PI;
      while (heading < -Math.PI) heading += 2 * Math.PI;
      sAcc = this.sEndR2 + frac * 2 * this.circLen;
      const isLap2 = (phi >= 2 * Math.PI);
      const distFromSwitch = phi * Rc;
      const vTar = distFromSwitch < 4.0 ? this.vCorner * 0.90 : this.vCorner;
      pushPt(x, y, heading, +1.0 / Rc, vTar, isLap2 ? "左环第2圈 (计时)" : "左环第1圈 (热身)", isLap2 ? "L_LAP2" : "L_LAP1");
    }

    // Phase 5: Exit chute y = 0 -> +24m (brake to stop)
    const nExt = Math.round(this.exitLen / ds);
    for (let i = 0; i <= nExt; i++) {
      const d = (i / nExt) * this.exitLen;
      sAcc = this.sEndL2 + d;
      const vTar = d < 4.0 ? this.vCorner * 0.65 : 0.0;
      pushPt(0, d, 0, 0, vTar, "出场制动区", "EXIT");
    }

    // Build regulation Figure-8 cones (16 inner + outer with gate clearances + entry/exit chutes)
    this.cones = [];
    let cid = 0;
    const addCircleCones = (cx, isRight) => {
      // 16 inner cones (R_in = 7.625m)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * 2 * Math.PI;
        const x = cx + this.Rin * Math.cos(a);
        const y = this.Rin * Math.sin(a);
        // Right circle CW: inner is right (yellow); Left circle CCW: inner is left (blue)
        this.cones.push({ id: `sp_in_${cid++}`, x, y, color: isRight ? "yellow" : "blue", hit: false });
      }
      // 16 outer cones (R_out = 10.625m), omitting the center crossing chute (|x| < 1.85m and |y| < 6.5m)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * 2 * Math.PI;
        const x = cx + this.Rout * Math.cos(a);
        const y = this.Rout * Math.sin(a);
        if (Math.abs(x) < 2.2 && Math.abs(y) < 7.2) continue;
        this.cones.push({ id: `sp_out_${cid++}`, x, y, color: isRight ? "blue" : "yellow", hit: false });
      }
    };
    addCircleCones(+Rc, true);
    addCircleCones(-Rc, false);

    // Entry & Exit chute cones strictly outside outer circle intersection (y = +-7.40m per FSAE D6 diagram)
    for (let y = -16.5; y <= -7.5; y += 3.0) {
      this.cones.push({ id: `sp_entL_${cid++}`, x: -1.65, y, color: "orange", hit: false });
      this.cones.push({ id: `sp_entR_${cid++}`, x: +1.65, y, color: "orange", hit: false });
    }
    for (let y = 7.5; y <= 24.0; y += 3.0) {
      this.cones.push({ id: `sp_extL_${cid++}`, x: -1.65, y, color: "orange", hit: false });
      this.cones.push({ id: `sp_extR_${cid++}`, x: +1.65, y, color: "orange", hit: false });
    }
    // Center timing gate big-orange cones at y = 0, x = +-1.90 (outside 3.0m chute per FSAE D6)
    this.cones.push({ id: `sp_gateL`, x: -1.90, y: 0, color: "orange_big", hit: false });
    this.cones.push({ id: `sp_gateR`, x: +1.90, y: 0, color: "orange_big", hit: false });
  }

  resetCones() {
    this._hitSet.clear();
    this._hintIdx = 0;
    for (const c of this.cones) c.hit = false;
  }

  checkConeCollisions(x, y, psi, vehW, vehL) {
    return checkFsaeCones(this.cones, this._hitSet, x, y, psi, vehW, vehL);
  }

  getLookahead(fx, fy, u, distOverride) {
    const pts = this.pts, N = pts.length;
    // Monotonic forward-biased local window prevents Figure-8 center crossing ambiguity!
    const lo = Math.max(0, this._hintIdx - 4);
    const hi = Math.min(N - 1, this._hintIdx + 24);
    let bestI = this._hintIdx, bestD2 = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = fx - pts[i].x, dy = fy - pts[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; }
    }
    // Only update hint on primary call (not preview distOverride)
    if (distOverride === undefined) {
      this._hintIdx = bestI;
    }
    const leadM = (typeof distOverride === "number") ? distOverride : 0.0;
    const stepAhead = Math.round(leadM / 0.45);
    const lookIdx = Math.min(N - 1, bestI + stepAhead);
    const cp = pts[bestI];
    const lp = pts[lookIdx];
    const ey = (fx - cp.x) * cp.nx + (fy - cp.y) * cp.ny;
    return {
      targetHeading: cp.heading,
      targetCurvature: (typeof distOverride === "number") ? lp.curvature : cp.curvature,
      targetSpeed: cp.v_max,
      crossTrackError: ey,
      lineError: ey,
      refX: cp.x,
      refY: cp.y,
      idx: bestI,
      s: cp.s,
      turn: cp.turn,
      phase: cp.phase
    };
  }

  getRoadElevation() {
    return { z_road: 0, isKerb: false, mu: this.mu };
  }
}

/* ============================================================================
 * 5. 赛事三：单圈赛 / 高速避障赛 (FsaeAutocrossPath)
 *    支持：FSG 德国官方 / FSI 意大利官方 / FSC 744m 规则全要素标准单圈
 * ============================================================================ */
class FsaeAutocrossPath {
  constructor(trackId = "fsg", mu = 1.35, capFn = null) {
    this.eventType = "autocross";
    this.trackId = FSAE_AUTOCROSS_META[trackId] ? trackId : "fsg";
    this.meta = FSAE_AUTOCROSS_META[this.trackId];
    this.mu = mu;
    this.halfWidth = this.meta.halfWidth;
    this.pts = [];
    this.cones = [];
    this._hitSet = new Set();
    this._hintIdx = 0;
    this.totalLength = 0;
    this.startState = { X: 0, Y: 0, psi: 0, u: 0 };
    this.capabilityMode = "car";
    this.capabilityFn = capFn;
    this._build(capFn);
  }

  _catmullRomClosed(ctrl, stepM) {
    const n = ctrl.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n];
      const p1 = ctrl[i];
      const p2 = ctrl[(i + 1) % n];
      const p3 = ctrl[(i + 2) % n];
      const segL = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const m = Math.max(2, Math.round(segL / stepM));
      for (let j = 0; j < m; j++) {
        const t = j / m, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        out.push([x, y]);
      }
    }
    return out;
  }

  _build(capFn) {
    let rawCtrl, rawLeft = null, rawRight = null;
    if (this.trackId === "fsg") {
      rawCtrl = FSAE_TRACK_DATA.FSG.center;
      rawLeft = FSAE_TRACK_DATA.FSG.left;
      rawRight = FSAE_TRACK_DATA.FSG.right;
    } else if (this.trackId === "fsi") {
      rawCtrl = FSAE_TRACK_DATA.FSI.center;
      rawLeft = FSAE_TRACK_DATA.FSI.left;
      rawRight = FSAE_TRACK_DATA.FSI.right;
    } else {
      rawCtrl = FSAE_TRACK_DATA.FSC_CTRL;
    }

    const stepM = (this.trackId === "fsc_std") ? 1.0 : 0.85;
    const dense = this._catmullRomClosed(rawCtrl, stepM);
    const N = dense.length;

    // 1. Centerline geometry (heading, normal, arc length, raw curvature)
    this.pts = new Array(N);
    let sAcc = 0;
    for (let i = 0; i < N; i++) {
      const prev = dense[(i - 1 + N) % N];
      const cur = dense[i];
      const next = dense[(i + 1) % N];
      if (i > 0) sAcc += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      const dx = next[0] - prev[0], dy = next[1] - prev[1];
      const heading = Math.atan2(-dx, dy);
      const nx = Math.cos(heading), ny = Math.sin(heading);
      this.pts[i] = {
        x: cur[0], y: cur[1],
        refX: cur[0], refY: cur[1],
        heading, refHeading: heading,
        nx, ny,
        s: sAcc,
        curvature: 0, refCurvature: 0,
        offset: 0,
        v_max: 25.0,
        turn: "赛道段"
      };
    }
    const lastSeg = Math.hypot(dense[0][0] - dense[N - 1][0], dense[0][1] - dense[N - 1][1]);
    this.totalLength = sAcc + lastSeg;

    // 2. Smooth curvature over +-2 samples (stable on tight R=4..6m hairpins)
    const rawK = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.pts[(i - 2 + N) % N];
      const b = this.pts[(i + 2) % N];
      let dh = b.heading - a.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const ds2 = Math.max(0.4, Math.hypot(b.x - a.x, b.y - a.y));
      rawK[i] = dh / ds2;
    }
    for (let pass = 0; pass < 2; pass++) {
      const tmp = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        tmp[i] = 0.25 * rawK[(i - 1 + N) % N] + 0.50 * rawK[i] + 0.25 * rawK[(i + 1) % N];
      }
      rawK.set(tmp);
    }

    // 3. Narrow-corridor racing line offset (gentle apex clipping inside safe cone clearance)
    const maxOff = this.meta.coneOffset;
    const offArr = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // Positive curvature = left turn -> clip inside left (-offset); negative = right turn -> (+offset)
      const desired = -Math.tanh(rawK[i] * 8.0) * maxOff;
      offArr[i] = desired;
    }
    for (let pass = 0; pass < 6; pass++) {
      const tmp = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        tmp[i] = 0.25 * offArr[(i - 1 + N) % N] + 0.50 * offArr[i] + 0.25 * offArr[(i + 1) % N];
      }
      offArr.set(tmp);
    }
    for (let i = 0; i < N; i++) {
      const pt = this.pts[i];
      pt.offset = offArr[i];
      pt.refX = pt.x + pt.nx * pt.offset;
      pt.refY = pt.y + pt.ny * pt.offset;
      pt.curvature = rawK[i];
    }
    // Recompute refHeading & refCurvature on shifted racing line
    for (let i = 0; i < N; i++) {
      const a = this.pts[(i - 1 + N) % N];
      const b = this.pts[(i + 1) % N];
      this.pts[i].refHeading = Math.atan2(-(b.refX - a.refX), b.refY - a.refY);
    }
    for (let i = 0; i < N; i++) {
      const a = this.pts[(i - 2 + N) % N];
      const b = this.pts[(i + 2) % N];
      let dh = b.refHeading - a.refHeading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const ds2 = Math.max(0.4, Math.hypot(b.refX - a.refX, b.refY - a.refY));
      this.pts[i].refCurvature = dh / ds2;
    }

    // 4. Sector names & Forward-Backward Friction-Circle Speed Envelope
    let ayMax = this.mu * 9.81 * 0.78;
    let aAcc = 7.8;
    let aBrk = 10.5;
    if (capFn && typeof capFn.lateral === "function") {
      const ayMid = capFn.lateral(18.0);
      if (isFinite(ayMid) && ayMid > 4.0) ayMax = Math.min(ayMax, ayMid * 0.84);
      if (typeof capFn.brake === "function") {
        const bMid = capFn.brake(20.0);
        if (isFinite(bMid) && bMid > 4.0) aBrk = Math.min(aBrk, bMid * 0.80);
      }
    }
    const vCapTop = 36.0; // ~130 km/h realistic FSAE autocross ceiling
    const vArr = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const pt = this.pts[i];
      const absK = Math.max(Math.abs(pt.refCurvature), Math.abs(pt.curvature) * 0.90);
      // Extra conservatism on ultra-tight R < 9m hairpins so vehicle never clips inner/outer cones
      const tightScale = absK > 0.11 ? 0.68 : (absK > 0.07 ? 0.85 : 1.0);
      vArr[i] = Math.min(vCapTop, Math.sqrt((ayMax * tightScale) / (absK + 1e-4)));
      const sFrac = pt.s / Math.max(1, this.totalLength);
      if (absK > 0.11) pt.turn = sFrac < 0.33 ? "S1 发卡急弯" : (sFrac < 0.67 ? "S2 紧弯区" : "S3 末端急弯");
      else if (absK > 0.045) pt.turn = sFrac < 0.33 ? "S1 连续弯道" : (sFrac < 0.67 ? "S2 绕桩/高速弯" : "S3 回旋组合弯");
      else pt.turn = sFrac < 0.12 ? "发车直道" : (sFrac < 0.67 ? "S2 短加速直道" : "S3 冲刺直道");
    }
    // 2 cyclic passes forward (accel) + backward (braking)
    for (let cyc = 0; cyc < 2; cyc++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const d = Math.hypot(this.pts[j].refX - this.pts[i].refX, this.pts[j].refY - this.pts[i].refY);
        const vNext = Math.sqrt(vArr[i] * vArr[i] + 2 * aAcc * d);
        if (vNext < vArr[j]) vArr[j] = vNext;
      }
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        const d = Math.hypot(this.pts[j].refX - this.pts[i].refX, this.pts[j].refY - this.pts[i].refY);
        const vPrev = Math.sqrt(vArr[j] * vArr[j] + 2 * aBrk * d);
        if (vPrev < vArr[i]) vArr[i] = vPrev;
      }
    }
    for (let i = 0; i < N; i++) this.pts[i].v_max = Math.max(4.5, vArr[i]);

    // 5. Build Cone Array (real cones for FSG/FSI; rule-generated +-1.8m blue/yellow + orange gate for FSC_STD)
    this.cones = [];
    let cid = 0;
    if (rawLeft && rawRight) {
      for (const p of rawLeft) {
        const isGate = Math.hypot(p[0] - this.pts[0].x, p[1] - this.pts[0].y) < 3.0;
        this.cones.push({ id: `ac_L_${cid++}`, x: p[0], y: p[1], color: isGate ? "orange_big" : "blue", hit: false });
      }
      for (const p of rawRight) {
        const isGate = Math.hypot(p[0] - this.pts[0].x, p[1] - this.pts[0].y) < 3.0;
        this.cones.push({ id: `ac_R_${cid++}`, x: p[0], y: p[1], color: isGate ? "orange_big" : "yellow", hit: false });
      }
    } else {
      // FSC_STD: place cones every ~4.0m along both track edges (halfWidth = 1.8m -> 3.6m lane)
      let nextConeS = 0;
      for (let i = 0; i < N; i++) {
        const pt = this.pts[i];
        if (pt.s >= nextConeS) {
          const isGate = (pt.s < 2.0);
          const hw = this.halfWidth;
          this.cones.push({
            id: `fsc_L_${cid++}`,
            x: pt.x - pt.nx * hw, y: pt.y - pt.ny * hw,
            color: isGate ? "orange_big" : "blue", hit: false
          });
          this.cones.push({
            id: `fsc_R_${cid++}`,
            x: pt.x + pt.nx * hw, y: pt.y + pt.ny * hw,
            color: isGate ? "orange_big" : "yellow", hit: false
          });
          if (isGate) {
            this.cones.push({ id: `fsc_Lg`, x: pt.x - pt.nx * (hw + 0.45), y: pt.y - pt.ny * (hw + 0.45), color: "orange_big", hit: false });
            this.cones.push({ id: `fsc_Rg`, x: pt.x + pt.nx * (hw + 0.45), y: pt.y + pt.ny * (hw + 0.45), color: "orange_big", hit: false });
          }
          // Closer spacing in tight corners/slalom (3.2m) vs straights (4.5m)
          nextConeS = pt.s + (Math.abs(pt.curvature) > 0.06 ? 3.2 : 4.5);
        }
      }
    }

    const p0 = this.pts[0];
    this.startState = { X: p0.refX, Y: p0.refY, psi: p0.refHeading, u: 0 };
  }

  resetCones() {
    this._hitSet.clear();
    this._hintIdx = 0;
    for (const c of this.cones) c.hit = false;
  }

  checkConeCollisions(x, y, psi, vehW, vehL) {
    return checkFsaeCones(this.cones, this._hitSet, x, y, psi, vehW, vehL);
  }

  _nearestIdx(x, y, hint) {
    const pts = this.pts, N = pts.length;
    let bestI = hint, bestD2 = Infinity;
    const win = 35;
    for (let d = -win; d <= win; d++) {
      const idx = (hint + d + N) % N;
      const dx = x - pts[idx].refX, dy = y - pts[idx].refY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestI = idx; }
    }
    if (bestD2 > 144) {
      for (let i = 0; i < N; i++) {
        const dx = x - pts[i].refX, dy = y - pts[i].refY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestI = i; }
      }
    }
    return bestI;
  }

  getLookahead(fx, fy, u, distOverride) {
    const pts = this.pts, N = pts.length;
    const bestI = this._nearestIdx(fx, fy, this._hintIdx);
    if (distOverride === undefined) this._hintIdx = bestI;
    const avgDs = this.totalLength / Math.max(1, N);
    const leadM = (typeof distOverride === "number") ? distOverride : 0.0;
    const lookIdx = (bestI + Math.round(leadM / avgDs)) % N;
    const cp = pts[bestI];
    const lp = pts[lookIdx];
    const rNx = Math.cos(cp.refHeading), rNy = Math.sin(cp.refHeading);
    const lineError = (fx - cp.refX) * rNx + (fy - cp.refY) * rNy;
    const crossTrackError = (fx - cp.x) * cp.nx + (fy - cp.y) * cp.ny;
    return {
      targetHeading: cp.refHeading,
      targetCurvature: (typeof distOverride === "number") ? lp.refCurvature : cp.refCurvature,
      targetSpeed: cp.v_max,
      crossTrackError,
      lineError,
      refX: cp.refX,
      refY: cp.refY,
      idx: bestI,
      s: cp.s,
      turn: cp.turn
    };
  }

  getRoadElevation() {
    return { z_road: 0, isKerb: false, mu: this.mu };
  }
}

/* ============================================================================
 * 6. 大学生方程式动态赛场控制器 (FSAE_STAGE)
 * ============================================================================ */
const FSAE_CAMS_CONFIG = {
  behind:  { dx: 0,     dy: -3800, dz: 1150, lookDy: 1200, lookDz: 320, fov: 1.55 },
  cockpit: { dx: 0,     dy: -120,  dz: 660,  lookDy: 2600, lookDz: 340, fov: 1.28 },
  nose:    { dx: 0,     dy: 1650,  dz: 420,  lookDy: -300, lookDz: 220, fov: 1.55 },
  wheel:   { dx: 1550,  dy: 900,   dz: 360,  lookDy: 400,  lookDz: 240, fov: 1.85 },
  aerial:  { dx: 0,     dy: -8000, dz: 28000, lookDy: 0,   lookDz: 0,   fov: 1.35 }
};

const FSAE_STAGE = {
  active: false,
  headless: false,       // true ⇒ 批量分析（25-full-report.js）：跳过 3D 场景重建 / 悬架驱动 / DOM 同步
  playing: true,
  autoPilot: true,
  event: "accel",        // "accel" | "skidpad" | "autocross" | "combined"
  activeSubEvent: "accel", // actual running event when in combined mode
  autocrossTrack: "fsg", // "fsg" | "fsi" | "fsc_std"
  mu: 1.35,
  timeScale: 1.0,
  camMode: "behind",
  camOrbit: { az: 0, elv: 0, distFactor: 1.0 },
  keys: { w: false, s: false, a: false, d: false, space: false },
  lastTime: 0,
  cachedScene: null,
  prevVehType: null,
  path: null,
  eng: null,
  pilot: null,
  simTime: 0,
  phaseTimer: 0,
  combinedQueue: ["accel", "skidpad", "autocross"],
  combinedIdx: 0,
  combinedHoldT: 0,
  bannerMsg: "",
  bannerUntil: 0,

  // Live run telemetry & official scorecard
  run: {
    started: false,
    finished: false,
    startTime: 0,
    elapsed: 0,
    coneHits: 0,
    peakAxG: 0,
    peakAyG: 0,
    peakAyR: 0,
    peakAyL: 0,
    peakSpeedKmh: 0,
    trapSpeedKmh: 0,
    t0_100: null,
    brakeDist: null,
    // Skidpad split stamps
    tR2Start: null, tR2: null,
    tL2Start: null, tL2: null,
    lastS: 0,
    // Autocross splits
    lap: 0,
    lapStartTime: 0,
    bestLap: null,
    lastLap: null
  },

  scores: {
    accel:     { rawTime: null, penalty: 0, finalTime: null, pts: 0, trapKmh: 0, coneHits: 0 },
    skidpad:   { tRight: null, tLeft: null, rawTime: null, penalty: 0, finalTime: null, pts: 0, peakAyG: 0, coneHits: 0 },
    autocross: { trackId: "fsg", rawTime: null, penalty: 0, finalTime: null, pts: 0, coneHits: 0 }
  }
};

function _fsaeGetCapFn() {
  try {
    if (typeof CAR_CAPABILITY !== "undefined" && typeof CAR_CAPABILITY.compute === "function" && typeof S !== "undefined") {
      const cap = CAR_CAPABILITY.compute(S);
      if (cap && typeof cap.lateral === "function") return cap;
    }
  } catch (e) {}
  return null;
}

function buildFsaePath(eventId, trackId, mu) {
  const capFn = _fsaeGetCapFn();
  if (eventId === "accel") return new FsaeAccelPath(mu);
  if (eventId === "skidpad") return new FsaeSkidpadPath(mu, capFn);
  return new FsaeAutocrossPath(trackId || FSAE_STAGE.autocrossTrack, mu, capFn);
}

function _fsaeResetRunState() {
  FSAE_STAGE.simTime = 0;
  FSAE_STAGE.combinedHoldT = 0;
  FSAE_STAGE.run = {
    started: false, finished: false, startTime: 0, elapsed: 0,
    coneHits: 0, peakAxG: 0, peakAyG: 0, peakAyR: 0, peakAyL: 0,
    peakSpeedKmh: 0, trapSpeedKmh: 0, t0_100: null, brakeDist: null,
    tR2Start: null, tR2: null, tL2Start: null, tL2: null,
    lastS: 0, lap: 0, lapStartTime: 0, bestLap: null, lastLap: null
  };
}

function fsaeBuildSubEvent(subEvent) {
  FSAE_STAGE.activeSubEvent = subEvent;
  FSAE_STAGE.path = buildFsaePath(subEvent, FSAE_STAGE.autocrossTrack, FSAE_STAGE.mu);
  const st0 = FSAE_STAGE.path.startState || { X: 0, Y: 0, psi: 0, u: 0 };
  const uInit = (subEvent === "autocross") ? 4.5 : (subEvent === "skidpad" ? 3.0 : 0.0);
  FSAE_STAGE.eng = new VehicleDynamics15DOF(S, SIM, uInit);
  const reF = FSAE_STAGE.eng.ReF || 0.255;
  const reR = FSAE_STAGE.eng.ReR || 0.255;
  Object.assign(FSAE_STAGE.eng.state, {
    X: st0.X, Y: st0.Y, Z: 0,
    phi: 0, theta: 0, psi: st0.psi,
    u: uInit, v: 0, w: 0, p: 0, q: 0, r: 0,
    omega: { FL: uInit / reF, FR: uInit / reF, RL: uInit / reR, RR: uInit / reR }
  });
  FSAE_STAGE.pilot = new UniversalAutoPilot(S);
  FSAE_STAGE.pilot.setPath(FSAE_STAGE.path);
  FSAE_STAGE.pilot.eng = FSAE_STAGE.eng;
  FSAE_STAGE.pilot.active = FSAE_STAGE.autoPilot;
  // Tighter lateral tracking on 3m narrow cone courses
  FSAE_STAGE.pilot.kLat = (subEvent === "skidpad") ? 3.5 : (subEvent === "autocross" ? 3.4 : 1.8);
  FSAE_STAGE.path.resetCones();
  _fsaeResetRunState();
  if (subEvent === "autocross") {
    FSAE_STAGE.run.started = true;
    FSAE_STAGE.run.startTime = 0;
    FSAE_STAGE.run.lapStartTime = 0;
  }
  if (!FSAE_STAGE.headless && typeof buildScenePRO === "function") {
    try { FSAE_STAGE.cachedScene = buildScenePRO(); } catch (e) {}
  }
  if (!FSAE_STAGE.headless) syncFsaeUI();
}

function fsaeSwitchEvent(ev) {
  FSAE_STAGE.event = ev;
  if (ev === "combined") {
    FSAE_STAGE.combinedIdx = 0;
    FSAE_STAGE.scores.accel = { rawTime: null, penalty: 0, finalTime: null, pts: 0, trapKmh: 0, coneHits: 0 };
    FSAE_STAGE.scores.skidpad = { tRight: null, tLeft: null, rawTime: null, penalty: 0, finalTime: null, pts: 0, peakAyG: 0, coneHits: 0 };
    FSAE_STAGE.scores.autocross = { trackId: FSAE_STAGE.autocrossTrack, rawTime: null, penalty: 0, finalTime: null, pts: 0, coneHits: 0 };
    FSAE_STAGE.bannerMsg = "🏆 三项组合联测启动：第 1/3 项 · 75m 直线加速赛";
    FSAE_STAGE.bannerUntil = (typeof performance !== "undefined" ? performance.now() : 0) + 3200;
    fsaeBuildSubEvent("accel");
  } else {
    fsaeBuildSubEvent(ev);
  }
}

function fsaeSwitchAutocrossTrack(trackId) {
  if (!FSAE_AUTOCROSS_META[trackId]) return;
  FSAE_STAGE.autocrossTrack = trackId;
  if (FSAE_STAGE.activeSubEvent === "autocross") {
    fsaeBuildSubEvent("autocross");
  } else {
    syncFsaeUI();
  }
}

function fsaeSwitchVehicle(vtype) {
  if (typeof loadVehiclePreset === "function" && VEHICLE_PRESETS && VEHICLE_PRESETS[vtype]) {
    loadVehiclePreset(vtype);
    fsaeBuildSubEvent(FSAE_STAGE.activeSubEvent);
  }
}

/* ============================================================================
 * 7. 单步仿真逻辑（独立可供 Headless 单元测试调用）
 * ============================================================================ */
function fsaeStepSimulation(dt) {
  if (!FSAE_STAGE.eng || !FSAE_STAGE.path) return null;
  const eng = FSAE_STAGE.eng;
  const path = FSAE_STAGE.path;
  const sub = FSAE_STAGE.activeSubEvent;
  const run = FSAE_STAGE.run;

  const isManual = (FSAE_STAGE.keys.w || FSAE_STAGE.keys.s || FSAE_STAGE.keys.a || FSAE_STAGE.keys.d || FSAE_STAGE.keys.space);
  let ctrl = { steer: 0, throttle: 0, brake: 0 };
  if (isManual) {
    FSAE_STAGE.autoPilot = false;
    if (FSAE_STAGE.pilot) FSAE_STAGE.pilot.active = false;
    if (FSAE_STAGE.keys.a) ctrl.steer -= 18;
    if (FSAE_STAGE.keys.d) ctrl.steer += 18;
    if (FSAE_STAGE.keys.w) ctrl.throttle = 1.0;
    if (FSAE_STAGE.keys.s || FSAE_STAGE.keys.space) ctrl.brake = 1.0;
  } else if (FSAE_STAGE.autoPilot && FSAE_STAGE.pilot) {
    FSAE_STAGE.pilot.active = true;
    ctrl = FSAE_STAGE.pilot.drive(eng.state, dt);
    // Standing launch boost for 75m Acceleration so standing start launches decisively
    if (sub === "accel" && eng.state.Y < path.timedLength) {
      ctrl.throttle = 1.0;
      ctrl.brake = 0.0;
    } else if (sub === "accel" && eng.state.Y >= path.timedLength) {
      ctrl.throttle = 0.0;
      ctrl.brake = eng.state.u > 0.25 ? 0.92 : 1.0;
    }
  }

  const prevY = eng.state.Y;
  const prevT = FSAE_STAGE.simTime;
  const env = {
    grade: 0,
    path,
    bumpNoise: 0,
    roadIso: (typeof stageRoadIso === "function") ? stageRoadIso() : null
  };
  eng.step(ctrl, env, dt);
  FSAE_STAGE.simTime += dt;

  const st = eng.state;
  const tel = eng.telemetry || {};
  const spdKmh = st.u * 3.6;
  if (spdKmh > run.peakSpeedKmh) run.peakSpeedKmh = spdKmh;
  const axG = Math.abs(tel.ax || 0);
  const ayG = Math.abs(tel.ay || 0);
  if (axG > run.peakAxG) run.peakAxG = axG;
  if (ayG > run.peakAyG) run.peakAyG = ayG;

  // Cone collision check (OBB using actual vehicle width & wheelbase)
  const vehW = (S && S.front && S.front.hp && S.front.hp.WC) ? (Math.abs(S.front.hp.WC[0]) * 2 / 1000 + 0.18) : 1.42;
  const vehL = ((S && S.wb) ? S.wb / 1000 : 1.62) + 1.15;
  const newHits = path.checkConeCollisions(st.X, st.Y, st.psi, vehW, vehL);
  if (newHits > 0) run.coneHits += newHits;

  const tp = path.getLookahead(st.X, st.Y, st.u);

  // ---- Event-specific Timing & Scoring ----
  if (sub === "accel") {
    if (!run.started && st.Y >= 0.0) {
      const frac = (st.Y - prevY) > 1e-6 ? Math.max(0, Math.min(1, (0.0 - prevY) / (st.Y - prevY))) : 0;
      run.started = true;
      run.startTime = prevT + frac * dt;
    }
    if (run.started && !run.finished) {
      run.elapsed = FSAE_STAGE.simTime - run.startTime;
      if (run.t0_100 === null && spdKmh >= 100.0) run.t0_100 = run.elapsed;
      if (st.Y >= path.timedLength) {
        const frac = (st.Y - prevY) > 1e-6 ? Math.max(0, Math.min(1, (path.timedLength - prevY) / (st.Y - prevY))) : 1;
        const finT = prevT + frac * dt;
        run.elapsed = finT - run.startTime;
        run.trapSpeedKmh = spdKmh;
        run.finished = true;
        const pen = run.coneHits * 2.0;
        const finalT = run.elapsed + pen;
        const pts = computeFsaeAccelScore(finalT);
        FSAE_STAGE.scores.accel = {
          rawTime: run.elapsed, penalty: pen, finalTime: finalT,
          pts, trapKmh: run.trapSpeedKmh, coneHits: run.coneHits
        };
      }
    } else if (run.finished && run.brakeDist === null && st.u < 0.35) {
      run.brakeDist = Math.max(0, st.Y - path.timedLength);
    }
  } else if (sub === "skidpad") {
    const curS = tp.s;
    if (tp.phase === "R_LAP2" && ayG > run.peakAyR) run.peakAyR = ayG;
    if (tp.phase === "L_LAP2" && ayG > run.peakAyL) run.peakAyL = ayG;

    if (!run.started && curS >= path.sEnterR) {
      run.started = true;
      run.startTime = FSAE_STAGE.simTime;
    }
    if (run.started && !run.finished) {
      run.elapsed = FSAE_STAGE.simTime - run.startTime;
      if (run.tR2Start === null && curS >= path.sStartR2) run.tR2Start = FSAE_STAGE.simTime;
      if (run.tR2 === null && run.tR2Start !== null && curS >= path.sEndR2) {
        run.tR2 = FSAE_STAGE.simTime - run.tR2Start;
      }
      if (run.tL2Start === null && curS >= path.sStartL2) run.tL2Start = FSAE_STAGE.simTime;
      if (run.tL2 === null && run.tL2Start !== null && curS >= path.sEndL2) {
        run.tL2 = FSAE_STAGE.simTime - run.tL2Start;
        run.finished = true;
        const rawAvg = 0.5 * ((run.tR2 || 6.0) + run.tL2);
        const pen = run.coneHits * 0.125;
        const finalT = rawAvg + pen;
        const pts = computeFsaeSkidpadScore(finalT);
        FSAE_STAGE.scores.skidpad = {
          tRight: run.tR2, tLeft: run.tL2, rawTime: rawAvg,
          penalty: pen, finalTime: finalT, pts,
          peakAyG: Math.max(run.peakAyR, run.peakAyL, run.peakAyG),
          coneHits: run.coneHits
        };
      }
    }
    run.lastS = curS;
  } else if (sub === "autocross") {
    const curS = tp.s;
    run.elapsed = FSAE_STAGE.simTime - run.lapStartTime;
    if (run.lastS > path.totalLength * 0.85 && curS < path.totalLength * 0.15 && run.elapsed > 8.0) {
      run.lap++;
      run.lastLap = run.elapsed;
      const pen = run.coneHits * 2.0;
      const finalT = run.lastLap + pen;
      if (run.bestLap === null || finalT < run.bestLap) {
        run.bestLap = finalT;
        const pts = computeFsaeAutocrossScore(finalT, FSAE_STAGE.autocrossTrack);
        FSAE_STAGE.scores.autocross = {
          trackId: FSAE_STAGE.autocrossTrack,
          rawTime: run.lastLap, penalty: pen, finalTime: finalT,
          pts, coneHits: run.coneHits
        };
      }
      run.finished = true;
      run.lapStartTime = FSAE_STAGE.simTime;
    }
    run.lastS = curS;
  }

  // Combined 3-Event Competition auto-advance
  if (FSAE_STAGE.event === "combined" && run.finished) {
    const readyToAdvance = (sub === "accel" && (st.u < 0.8 || FSAE_STAGE.combinedHoldT > 2.2))
      || (sub === "skidpad" && (st.u < 1.2 || FSAE_STAGE.combinedHoldT > 2.0))
      || (sub === "autocross");
    if (readyToAdvance) {
      FSAE_STAGE.combinedHoldT += dt;
      if (FSAE_STAGE.combinedHoldT >= 1.6) {
        const nextIdx = FSAE_STAGE.combinedIdx + 1;
        if (nextIdx < FSAE_STAGE.combinedQueue.length) {
          FSAE_STAGE.combinedIdx = nextIdx;
          const nextEv = FSAE_STAGE.combinedQueue[nextIdx];
          const names = { accel: "75m 直线加速赛", skidpad: "八字绕环赛 (Skidpad)", autocross: "单圈赛 (Autocross)" };
          FSAE_STAGE.bannerMsg = `🏆 组合联测切换：第 ${nextIdx + 1}/3 项 · ${names[nextEv]}`;
          FSAE_STAGE.bannerUntil = (typeof performance !== "undefined" ? performance.now() : 0) + 3200;
          fsaeBuildSubEvent(nextEv);
        } else if (FSAE_STAGE.combinedHoldT < 1.8) {
          const totPts = (FSAE_STAGE.scores.accel.pts || 0) + (FSAE_STAGE.scores.skidpad.pts || 0) + (FSAE_STAGE.scores.autocross.pts || 0);
          FSAE_STAGE.bannerMsg = `🏁 三项组合联测完赛！动态总分 ${totPts.toFixed(1)} / 275.0 分`;
          FSAE_STAGE.bannerUntil = (typeof performance !== "undefined" ? performance.now() : 0) + 6000;
        }
      }
    }
  }

  // Drive live 4-corner 3D suspension rack & wheel travel (skipped in headless batch analysis)
  if (!FSAE_STAGE.headless && typeof SIM !== "undefined" && typeof driveTo === "function" && tel && tel.tr) {
    const z0F = (S && S.front && S.front.hp && S.front.hp.WC) ? S.front.hp.WC[2] : 255;
    const z0R = (S && S.rear && S.rear.hp && S.rear.hp.WC) ? S.rear.hp.WC[2] : 255;
    const rackDisp = (ctrl.steer || 0) * 1.15;
    S.rack = rackDisp;
    S.swAngle = (ctrl.steer || 0) * 4.5;
    if (SIM.FR) driveTo(SIM.FR, z0F + (tel.tr.FR || 0) * 1000, rackDisp, "front");
    if (SIM.RR) driveTo(SIM.RR, z0R + (tel.tr.RR || 0) * 1000, 0, "rear");
    if (SIM.FL) driveTo(SIM.FL, z0F + (tel.tr.FL || 0) * 1000, -rackDisp, "front");
    if (SIM.RL) driveTo(SIM.RL, z0R + (tel.tr.RL || 0) * 1000, 0, "rear");
  }

  return { st, tel, ctrl, tp };
}

/* ============================================================================
 * 8. 3D 赛场渲染器 (空军机场式 FSAE 沥青试车坪 + 蓝/黄/橙桩桶 + WebGL 方程式赛车 + 鸟瞰雷达)
 * ============================================================================ */
function renderFsaeScene(st, tel, ctrl) {
  const cv = document.getElementById("fsaeCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr) {
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  }
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Crisp Daylight Airfield Sky & Tarmac Horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, "#3b669e");
  skyGrad.addColorStop(0.35, "#8cb5db");
  skyGrad.addColorStop(0.47, "#cedfeb");
  skyGrad.addColorStop(0.49, "#2d3540");
  skyGrad.addColorStop(1, "#1e242d");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Camera Matrix
  const camCfg = FSAE_CAMS_CONFIG[FSAE_STAGE.camMode] || FSAE_CAMS_CONFIG.behind;
  const distFactor = FSAE_STAGE.camOrbit.distFactor;
  let cam_dx = camCfg.dx * distFactor, cam_dy = camCfg.dy * distFactor, cam_dz = camCfg.dz * distFactor;
  if (FSAE_STAGE.camOrbit.az !== 0 || FSAE_STAGE.camOrbit.elv !== 0) {
    const rH = Math.hypot(cam_dx, cam_dy);
    const angH = Math.atan2(cam_dx, cam_dy) + FSAE_STAGE.camOrbit.az;
    cam_dx = Math.sin(angH) * rH;
    cam_dy = Math.cos(angH) * rH;
    cam_dz = cam_dz + Math.tan(FSAE_STAGE.camOrbit.elv) * rH;
  }

  const carX_mm = st.X * 1000, carY_mm = st.Y * 1000, carYaw = st.psi || 0;
  let E_x, E_y, E_z, look_x, look_y, look_z;
  if (FSAE_STAGE.camMode === "aerial") {
    E_x = carX_mm + cam_dx;
    E_y = carY_mm + cam_dy;
    E_z = Math.max(9000, cam_dz);
    look_x = carX_mm; look_y = carY_mm; look_z = 0;
  } else {
    const cY = Math.cos(carYaw), sY = Math.sin(carYaw);
    E_x = carX_mm + (-sY * cam_dy + cY * cam_dx);
    E_y = carY_mm + (cY * cam_dy + sY * cam_dx);
    E_z = Math.max(150, cam_dz);
    look_x = carX_mm + (-sY * camCfg.lookDy);
    look_y = carY_mm + (cY * camCfg.lookDy);
    look_z = camCfg.lookDz || 320;
  }

  const fw_un = [look_x - E_x, look_y - E_y, look_z - E_z];
  const l_fw = Math.hypot(fw_un[0], fw_un[1], fw_un[2]) || 1;
  const fw = [fw_un[0] / l_fw, fw_un[1] / l_fw, fw_un[2] / l_fw];
  let rt_un = [fw[1], -fw[0], 0];
  if (Math.hypot(rt_un[0], rt_un[1]) < 1e-4) rt_un = [1, 0, 0];
  const l_rt = Math.hypot(rt_un[0], rt_un[1], rt_un[2]) || 1;
  const rt = [rt_un[0] / l_rt, rt_un[1] / l_rt, rt_un[2] / l_rt];
  const up = [
    rt[1] * fw[2] - rt[2] * fw[1],
    rt[2] * fw[0] - rt[0] * fw[2],
    rt[0] * fw[1] - rt[1] * fw[0]
  ];

  const fovDist = Math.min(w, h) * (camCfg.fov || 1.5);
  const halfW = w / 2, halfH = h / 2;
  const m11 = rt[0], m12 = rt[1], m13 = rt[2], v0x = -(rt[0] * E_x + rt[1] * E_y + rt[2] * E_z);
  const m21 = up[0], m22 = up[1], m23 = up[2], v0y = -(up[0] * E_x + up[1] * E_y + up[2] * E_z);
  const m31 = fw[0], m32 = fw[1], m33 = fw[2], v0z = -(fw[0] * E_x + fw[1] * E_y + fw[2] * E_z);

  const projFast = (x, y, z) => {
    const zc = m31 * x + m32 * y + m33 * z + v0z;
    if (zc < 90) return null;
    const f = fovDist / zc;
    return [halfW + (m11 * x + m12 * y + m13 * z + v0x) * f, halfH - (m21 * x + m22 * y + m23 * z + v0y) * f, zc];
  };

  // 3. Airfield Concrete Pad Grid around vehicle
  const gridStep = 10000; // 10m slabs
  const gx0 = Math.floor(carX_mm / gridStep) * gridStep;
  const gy0 = Math.floor(carY_mm / gridStep) * gridStep;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let gx = gx0 - 80000; gx <= gx0 + 80000; gx += gridStep) {
    const a = projFast(gx, gy0 - 80000, 0), b = projFast(gx, gy0 + 80000, 0);
    if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  }
  for (let gy = gy0 - 80000; gy <= gy0 + 80000; gy += gridStep) {
    const a = projFast(gx0 - 80000, gy, 0), b = projFast(gx0 + 80000, gy, 0);
    if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  }

  // 4. Render Track Ribbon & Chalk Markings
  const path = FSAE_STAGE.path;
  if (path && path.pts && path.pts.length > 2) {
    const pts = path.pts;
    const hwMm = (path.halfWidth || 1.65) * 1000;
    const closed = (path.eventType === "autocross");
    const step = (pts.length > 350) ? 2 : 1;
    const totalSeg = closed ? pts.length : pts.length - step;
    for (let i = 0; i < totalSeg; i += step) {
      const a = pts[i];
      const b = pts[(i + step) % pts.length];
      if (!closed && i + step >= pts.length) break;
      const dx = a.x * 1000 - carX_mm, dy = a.y * 1000 - carY_mm;
      if (dx * dx + dy * dy > 150000 * 150000) continue;
      const p1 = projFast(a.x * 1000 - a.nx * hwMm, a.y * 1000 - a.ny * hwMm, 1);
      const p2 = projFast(a.x * 1000 + a.nx * hwMm, a.y * 1000 + a.ny * hwMm, 1);
      const p3 = projFast(b.x * 1000 + b.nx * hwMm, b.y * 1000 + b.ny * hwMm, 1);
      const p4 = projFast(b.x * 1000 - b.nx * hwMm, b.y * 1000 - b.ny * hwMm, 1);
      if (p1 && p2 && p3 && p4) {
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
        ctx.closePath();
        ctx.fillStyle = ((i / step) % 2 === 0) ? "rgba(22, 27, 34, 0.88)" : "rgba(27, 33, 42, 0.88)";
        ctx.fill();
      }
      // Subtle chalk racing guide line
      const c1 = projFast(a.refX * 1000, a.refY * 1000, 3);
      const c2 = projFast(b.refX * 1000, b.refY * 1000, 3);
      if (c1 && c2) {
        ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.55)"; ctx.lineWidth = 2.0; ctx.stroke();
      }
    }

    // Start / Finish timing chalk line & infrared gate posts
    const drawGateLine = (gx, gy, nx, ny, label) => {
      const l = projFast((gx - nx * 1.9) * 1000, (gy - ny * 1.9) * 1000, 5);
      const r = projFast((gx + nx * 1.9) * 1000, (gy + ny * 1.9) * 1000, 5);
      if (l && r) {
        ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(r[0], r[1]);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.stroke();
      }
      const postL = projFast((gx - nx * 2.15) * 1000, (gy - ny * 2.15) * 1000, 950);
      const baseL = projFast((gx - nx * 2.15) * 1000, (gy - ny * 2.15) * 1000, 0);
      const postR = projFast((gx + nx * 2.15) * 1000, (gy + ny * 2.15) * 1000, 950);
      const baseR = projFast((gx + nx * 2.15) * 1000, (gy + ny * 2.15) * 1000, 0);
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3;
      if (postL && baseL) { ctx.beginPath(); ctx.moveTo(baseL[0], baseL[1]); ctx.lineTo(postL[0], postL[1]); ctx.stroke(); }
      if (postR && baseR) { ctx.beginPath(); ctx.moveTo(baseR[0], baseR[1]); ctx.lineTo(postR[0], postR[1]); ctx.stroke(); }
      if (postL && postR && label) {
        ctx.fillStyle = "#f97316"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
        ctx.fillText(label, (postL[0] + postR[0]) * 0.5, Math.min(postL[1], postR[1]) - 6);
        ctx.textAlign = "left";
      }
    };
    if (path.eventType === "accel") {
      drawGateLine(0, 0, 1, 0, "START 0m");
      drawGateLine(0, 75, 1, 0, "FINISH 75m");
    } else if (path.eventType === "skidpad") {
      drawGateLine(0, 0, 1, 0, "TIMING GATE");
    } else if (path.pts.length) {
      drawGateLine(path.pts[0].x, path.pts[0].y, path.pts[0].nx, path.pts[0].ny, "START / FINISH");
    }
  }

  // 5. Render Authentic FSAE Blue / Yellow / Orange 3D Cones (sorted back-to-front)
  if (path && path.cones && path.cones.length) {
    const visible = [];
    for (let i = 0; i < path.cones.length; i++) {
      const c = path.cones[i];
      const cx = c.x * 1000, cy = c.y * 1000;
      const d2 = (cx - carX_mm) * (cx - carX_mm) + (cy - carY_mm) * (cy - carY_mm);
      if (d2 > 130000 * 130000) continue;
      const base = projFast(cx, cy, 0);
      if (!base) continue;
      const coneH = (c.color === "orange_big") ? 505 : 325;
      const top = c.hit
        ? projFast(cx + 280, cy + 120, 80) // Knocked cone visibly tips over!
        : projFast(cx, cy, coneH);
      if (!top) continue;
      visible.push({ c, base, top, zc: base[2] });
    }
    visible.sort((a, b) => b.zc - a.zc);
    for (let i = 0; i < visible.length; i++) {
      const { c, base, top, zc } = visible[i];
      const rPix = Math.max(2.0, Math.min(18.0, (c.color === "orange_big" ? 160 : 120) * fovDist / zc));
      const bodyCol = c.hit ? "#ef4444"
        : (c.color === "blue" ? "#2563eb"
        : (c.color === "yellow" ? "#facc15" : "#f97316"));
      const stripeCol = (c.color === "yellow") ? "#111827" : "#ffffff";
      ctx.beginPath();
      ctx.moveTo(base[0] - rPix, base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.lineTo(base[0] + rPix, base[1]);
      ctx.closePath();
      ctx.fillStyle = bodyCol;
      ctx.fill();
      if (!c.hit && rPix > 3.2) {
        const bL = [base[0] * 0.56 + top[0] * 0.44 - rPix * 0.56, base[1] * 0.56 + top[1] * 0.44];
        const bR = [base[0] * 0.56 + top[0] * 0.44 + rPix * 0.56, base[1] * 0.56 + top[1] * 0.44];
        const tL = [base[0] * 0.30 + top[0] * 0.70 - rPix * 0.30, base[1] * 0.30 + top[1] * 0.70];
        const tR = [base[0] * 0.30 + top[0] * 0.70 + rPix * 0.30, base[1] * 0.30 + top[1] * 0.70];
        ctx.beginPath();
        ctx.moveTo(bL[0], bL[1]); ctx.lineTo(bR[0], bR[1]); ctx.lineTo(tR[0], tR[1]); ctx.lineTo(tL[0], tL[1]);
        ctx.closePath();
        ctx.fillStyle = stripeCol;
        ctx.fill();
      }
    }
  }

  // 6. Render 3D WebGL Car (Full Formula SAE / GT3 / Baja 3D model)
  const tireR = S && S.front && S.front.tire && S.front.tire.R ? S.front.tire.R : 255;
  const wcZ = S && S.front && S.front.hp && S.front.hp.WC ? S.front.hp.WC[2] : 255;
  const carZ_mm = (st.Z || 0) * 1000 + (tireR - wcZ);
  const cP = Math.cos(st.theta || 0), sP = Math.sin(st.theta || 0);
  const cR = Math.cos(st.phi || 0),   sR = Math.sin(st.phi || 0);
  const cY = Math.cos(st.psi || 0),   sY = Math.sin(st.psi || 0);
  const R11 = cY * cR - sY * sP * sR, R12 = -sY * cP, R13 = cY * sR + sY * sP * cR;
  const R21 = sY * cR + cY * sP * sR, R22 =  cY * cP, R23 = sY * sR - cY * sP * cR;
  const R31 = -cP * sR,               R32 =  sP,      R33 = cP * cR;

  const glActive = (typeof CAR3D_GL !== "undefined" && CAR3D_GL.isActiveForStage());
  const glRendered = glActive && CAR3D_GL.renderStageCar(ctx, {
    w, h, dpr,
    eye: [E_x, E_y, E_z],
    rt, up, fw,
    fovDist,
    carPos: [carX_mm, carY_mm, carZ_mm],
    R: [R11, R12, R13, R21, R22, R23, R31, R32, R33],
    yaw: st.psi || 0,
    groundZ: 2,
    shadowAlpha: 0.48,
    hideDriver: FSAE_STAGE.camMode === "cockpit",
    brakeIntensity: ctrl ? ctrl.brake : 0,
    telemetry: tel || null
  });
  if (!glRendered) {
    // Wireframe fallback when WebGL is disabled (e.g., headless tests)
    const pCar = projFast(carX_mm, carY_mm, carZ_mm + 200);
    if (pCar) {
      ctx.fillStyle = "#58a6ff";
      ctx.beginPath(); ctx.arc(pCar[0], pCar[1], 10, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 7. Top-Right 2D Live Bird's-Eye Cone Map Overlay
  _renderFsaeMinimap(ctx, w, h, st, path);

  // 8. Center Competition Banner (Combined mode transitions / Finish callouts)
  const nowMs = (typeof performance !== "undefined") ? performance.now() : 0;
  if (FSAE_STAGE.bannerMsg && nowMs < FSAE_STAGE.bannerUntil) {
    ctx.save();
    ctx.fillStyle = "rgba(13, 17, 23, 0.88)";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    const bw = Math.min(w - 40, 440), bh = 36, bx = (w - bw) * 0.5, by = 14;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fde68a"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(FSAE_STAGE.bannerMsg, w * 0.5, by + 23);
    ctx.restore();
  }
}

function _renderFsaeMinimap(ctx, w, h, st, path) {
  if (!path || !path.pts || !path.pts.length) return;
  const mw = 176, mh = 176;
  const mx = w - mw - 14, my = 14;
  ctx.save();
  ctx.fillStyle = "rgba(13, 17, 23, 0.82)";
  ctx.strokeStyle = "rgba(88, 166, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 8); ctx.fill(); ctx.stroke();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const scan = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].x < minX) minX = arr[i].x;
      if (arr[i].x > maxX) maxX = arr[i].x;
      if (arr[i].y < minY) minY = arr[i].y;
      if (arr[i].y > maxY) maxY = arr[i].y;
    }
  };
  scan(path.pts);
  if (path.cones && path.cones.length) scan(path.cones);
  const pad = 6;
  const spanX = Math.max(12, maxX - minX + pad * 2);
  const spanY = Math.max(12, maxY - minY + pad * 2);
  const scale = Math.min((mw - 20) / spanX, (mh - 28) / spanY);
  const cx = mx + mw * 0.5, cy = my + mh * 0.5 + 6;
  const midX = (minX + maxX) * 0.5, midY = (minY + maxY) * 0.5;
  const toM = (x, y) => [cx + (x - midX) * scale, cy - (y - midY) * scale];

  // Path polyline
  ctx.beginPath();
  for (let i = 0; i < path.pts.length; i += Math.max(1, Math.floor(path.pts.length / 260))) {
    const [px, py] = toM(path.pts[i].refX, path.pts[i].refY);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  if (path.eventType === "autocross") ctx.closePath();
  ctx.strokeStyle = "rgba(250, 204, 21, 0.6)"; ctx.lineWidth = 1.6; ctx.stroke();

  // Cones
  if (path.cones) {
    for (let i = 0; i < path.cones.length; i++) {
      const c = path.cones[i];
      const [px, py] = toM(c.x, c.y);
      ctx.fillStyle = c.hit ? "#ef4444" : (c.color === "blue" ? "#3b82f6" : (c.color === "yellow" ? "#facc15" : "#f97316"));
      ctx.fillRect(px - 1.3, py - 1.3, 2.6, 2.6);
    }
  }

  // Vehicle marker
  const [vx, vy] = toM(st.X, st.Y);
  ctx.fillStyle = "#22c55e";
  ctx.beginPath(); ctx.arc(vx, vy, 4.0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();

  ctx.fillStyle = "#8b949e"; ctx.font = "bold 9.5px monospace";
  const lbl = path.eventType === "accel" ? "75m ACCEL PAD"
    : (path.eventType === "skidpad" ? "FIGURE-8 SKIDPAD" : ("AUTOCROSS · " + FSAE_STAGE.autocrossTrack.toUpperCase()));
  ctx.fillText(lbl, mx + 8, my + 13);
  ctx.restore();
}

/* ============================================================================
 * 9. HUD 更新 & 生命周期（openFsaeStage / closeFsaeStage / fsaeStageLoop）
 * ============================================================================ */
function syncFsaeUI() {
  document.querySelectorAll(".fsae-ev-btn").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.ev === FSAE_STAGE.event);
  });
  document.querySelectorAll(".fsae-trk-btn").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.trk === FSAE_STAGE.autocrossTrack);
  });
  document.querySelectorAll(".fsae-cam-btn").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.cam === FSAE_STAGE.camMode);
  });
  const trkRow = document.getElementById("fsaeTrackSelectorRow");
  if (trkRow) {
    trkRow.style.display = (FSAE_STAGE.event === "autocross" || FSAE_STAGE.event === "combined") ? "flex" : "none";
  }
  const elPlay = document.getElementById("fsaePlayBtn");
  if (elPlay) elPlay.textContent = FSAE_STAGE.playing ? "⏸ 暂停" : "▶ 继续";
  const elAuto = document.getElementById("fsaeAutoBtn");
  if (elAuto) {
    elAuto.textContent = FSAE_STAGE.autoPilot ? "🤖 自动驾驶: 开" : "🎮 手动驾驶 (WASD)";
    elAuto.classList.toggle("on", FSAE_STAGE.autoPilot);
  }
  const elVeh = document.getElementById("fsaeVehSelect");
  if (elVeh && typeof S !== "undefined" && S.vehicleType) elVeh.value = S.vehicleType;
}

function updateFsaeHUD(res) {
  if (!res) return;
  const { st, tel, ctrl, tp } = res;
  const run = FSAE_STAGE.run;
  const sc = FSAE_STAGE.scores;
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  const evBadge = FSAE_STAGE.activeSubEvent === "accel" ? "⚡ 直线加速 (75m)"
    : (FSAE_STAGE.activeSubEvent === "skidpad" ? "∞ 八字绕环 (18.25m)"
    : `🏁 单圈赛 · ${(FSAE_AUTOCROSS_META[FSAE_STAGE.autocrossTrack] || {}).name || "FSG"}`);
  setTxt("fsaeHudEventBadge", FSAE_STAGE.event === "combined" ? `🏆 组合联测 (${FSAE_STAGE.combinedIdx + 1}/3) · ${evBadge}` : evBadge);
  setTxt("fsaeHudPhase", tp ? (tp.turn || "--") : "--");
  setTxt("fsaeHudSpeed", (st.u * 3.6).toFixed(1) + " km/h");
  setTxt("fsaeHudTimer", (run.elapsed || 0).toFixed(2) + " s");
  setTxt("fsaeHudAxAy", `${(tel.ax || 0).toFixed(2)} g / ${(tel.ay || 0).toFixed(2)} g`);
  setTxt("fsaeHudSteer", (ctrl.steer || 0).toFixed(1) + "°");
  setTxt("fsaeHudCones", run.coneHits > 0 ? `${run.coneHits} 桶 (罚时!)` : "0 桶 (干净)");

  // Scorecard table
  setTxt("fsaeScAccelTime", sc.accel.finalTime !== null ? `${sc.accel.finalTime.toFixed(3)}s (${sc.accel.trapKmh.toFixed(0)}km/h)` : "--");
  setTxt("fsaeScAccelPts", `${(sc.accel.pts || 0).toFixed(1)} / 100`);

  setTxt("fsaeScSkidTime", sc.skidpad.finalTime !== null
    ? `${sc.skidpad.finalTime.toFixed(3)}s (R:${(sc.skidpad.tRight || 0).toFixed(2)} L:${(sc.skidpad.tLeft || 0).toFixed(2)})`
    : (run.tR2 !== null ? `右环 ${run.tR2.toFixed(2)}s · 左环进行中` : "--"));
  setTxt("fsaeScSkidPts", `${(sc.skidpad.pts || 0).toFixed(1)} / 75`);

  setTxt("fsaeScAutoTime", sc.autocross.finalTime !== null ? `${sc.autocross.finalTime.toFixed(2)}s (罚+${sc.autocross.penalty.toFixed(0)}s)` : "--");
  setTxt("fsaeScAutoPts", `${(sc.autocross.pts || 0).toFixed(1)} / 100`);

  const totPts = (sc.accel.pts || 0) + (sc.skidpad.pts || 0) + (sc.autocross.pts || 0);
  setTxt("fsaeScTotalPts", `${totPts.toFixed(1)} / 275.0`);

  // Rule info card
  const ruleText = FSAE_STAGE.activeSubEvent === "accel"
    ? "FSAE D5 规则：静止起步 75m 计时 + ≥75m 制动区，道宽 3.6m (≥3.0m)，撞桶 +2.0s。"
    : (FSAE_STAGE.activeSubEvent === "skidpad"
      ? "FSAE D6 规则：双切圆心距 18.25m、内径 15.25m、道宽 3.0m；右2圈(第2圈计时)+左2圈(第2圈计时)，撞桶 +0.125s。"
      : `FSAE D7 规则：${(FSAE_AUTOCROSS_META[FSAE_STAGE.autocrossTrack] || {}).source || ""}，撞桶 +2.0s。`);
  setTxt("fsaeRuleHint", ruleText);
}

function fsaeStageLoop(now) {
  if (!FSAE_STAGE.active) return;
  const rawDt = Math.min(0.033, Math.max(0.001, (now - (FSAE_STAGE.lastTime || now)) / 1000));
  FSAE_STAGE.lastTime = now;
  const dt = rawDt * (FSAE_STAGE.timeScale || 1.0);

  let res = null;
  if (FSAE_STAGE.playing) {
    res = fsaeStepSimulation(dt);
  } else if (FSAE_STAGE.eng && FSAE_STAGE.path) {
    res = {
      st: FSAE_STAGE.eng.state,
      tel: FSAE_STAGE.eng.telemetry || {},
      ctrl: { steer: FSAE_STAGE.pilot ? FSAE_STAGE.pilot.last_steer : 0, throttle: 0, brake: 0 },
      tp: FSAE_STAGE.path.getLookahead(FSAE_STAGE.eng.state.X, FSAE_STAGE.eng.state.Y, FSAE_STAGE.eng.state.u)
    };
  }
  if (res) {
    renderFsaeScene(res.st, res.tel, res.ctrl);
    updateFsaeHUD(res);
  }
  requestAnimationFrame(fsaeStageLoop);
}

function openFsaeStage(initialEvent) {
  const modal = document.getElementById("fsaeStageModal");
  if (!modal) return;
  if (typeof closeSlopeStage === "function" && window.SLOPE_STAGE && SLOPE_STAGE.active) closeSlopeStage();
  if (typeof closeSkidpadStage === "function" && window.SKIDPAD_STAGE && SKIDPAD_STAGE.active) closeSkidpadStage();
  if (typeof closeCircuitStage === "function" && window.CIRCUIT_STAGE && CIRCUIT_STAGE.active) closeCircuitStage();

  // Auto-switch to Formula SAE vehicle if currently on GT3/Baja, restoring on exit
  FSAE_STAGE.prevVehType = (typeof S !== "undefined" && S.vehicleType) ? S.vehicleType : null;
  if (typeof S !== "undefined" && S.vehicleType !== "formula" && typeof loadVehiclePreset === "function") {
    loadVehiclePreset("formula");
  }

  FSAE_STAGE.active = true;
  FSAE_STAGE.playing = true;
  FSAE_STAGE.autoPilot = true;
  FSAE_STAGE.lastTime = (typeof performance !== "undefined") ? performance.now() : 0;
  FSAE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
  modal.classList.add("show");

  const cv = document.getElementById("fsaeCanvas");
  if (cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = (cv.clientWidth || 960) * dpr;
    cv.height = (cv.clientHeight || 540) * dpr;
  }

  try {
    fsaeSwitchEvent(initialEvent || FSAE_STAGE.event || "accel");
    requestAnimationFrame(fsaeStageLoop);
  } catch (err) {
    console.error("FSAE Stage Init Error:", err);
    FSAE_STAGE.active = false;
    if (typeof paintStageError === "function") paintStageError("fsaeCanvas", "大学生方程式赛场初始化失败", err);
  }
}

function closeFsaeStage() {
  const modal = document.getElementById("fsaeStageModal");
  if (modal) modal.classList.remove("show");
  FSAE_STAGE.active = false;
  if (typeof S !== "undefined") {
    S.rack = 0; S.swAngle = 0;
    if (FSAE_STAGE.prevVehType && FSAE_STAGE.prevVehType !== S.vehicleType && typeof loadVehiclePreset === "function") {
      loadVehiclePreset(FSAE_STAGE.prevVehType);
    } else if (typeof rebuild === "function") {
      rebuild();
    }
  }
  FSAE_STAGE.prevVehType = null;
}

function initFsaeStageEvents() {
  document.querySelectorAll(".fsae-ev-btn").forEach(btn => {
    btn.onclick = () => fsaeSwitchEvent(btn.dataset.ev);
  });
  document.querySelectorAll(".fsae-trk-btn").forEach(btn => {
    btn.onclick = () => fsaeSwitchAutocrossTrack(btn.dataset.trk);
  });
  document.querySelectorAll(".fsae-cam-btn").forEach(btn => {
    btn.onclick = () => {
      FSAE_STAGE.camMode = btn.dataset.cam;
      FSAE_STAGE.camOrbit = { az: 0, elv: 0, distFactor: 1.0 };
      syncFsaeUI();
    };
  });
  const btnPlay = document.getElementById("fsaePlayBtn");
  if (btnPlay) btnPlay.onclick = () => { FSAE_STAGE.playing = !FSAE_STAGE.playing; syncFsaeUI(); };
  const btnReset = document.getElementById("fsaeResetBtn");
  if (btnReset) btnReset.onclick = () => fsaeBuildSubEvent(FSAE_STAGE.activeSubEvent);
  const btnAuto = document.getElementById("fsaeAutoBtn");
  if (btnAuto) btnAuto.onclick = () => { FSAE_STAGE.autoPilot = !FSAE_STAGE.autoPilot; syncFsaeUI(); };
  const selVeh = document.getElementById("fsaeVehSelect");
  if (selVeh) selVeh.onchange = () => fsaeSwitchVehicle(selVeh.value);
  const slMu = document.getElementById("fsaeMuSlider");
  if (slMu) slMu.oninput = () => {
    FSAE_STAGE.mu = parseFloat(slMu.value) || 1.35;
    const lbl = document.getElementById("fsaeMuVal");
    if (lbl) lbl.textContent = FSAE_STAGE.mu.toFixed(2);
    if (FSAE_STAGE.path) FSAE_STAGE.path.mu = FSAE_STAGE.mu;
  };
  const slSpd = document.getElementById("fsaeTimeScale");
  if (slSpd) slSpd.onchange = () => { FSAE_STAGE.timeScale = parseFloat(slSpd.value) || 1.0; };

  // Keyboard controls (WASD / Space / R / Esc)
  window.addEventListener("keydown", e => {
    if (!FSAE_STAGE.active) return;
    const tag = (e.target && e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === "w" || e.key === "ArrowUp") FSAE_STAGE.keys.w = true;
    else if (k === "s" || e.key === "ArrowDown") FSAE_STAGE.keys.s = true;
    else if (k === "a" || e.key === "ArrowLeft") FSAE_STAGE.keys.a = true;
    else if (k === "d" || e.key === "ArrowRight") FSAE_STAGE.keys.d = true;
    else if (e.code === "Space") { e.preventDefault(); FSAE_STAGE.keys.space = true; }
    else if (k === "r") fsaeBuildSubEvent(FSAE_STAGE.activeSubEvent);
    else if (e.key === "Escape") closeFsaeStage();
  });
  window.addEventListener("keyup", e => {
    if (!FSAE_STAGE.active) return;
    const k = e.key.toLowerCase();
    if (k === "w" || e.key === "ArrowUp") FSAE_STAGE.keys.w = false;
    else if (k === "s" || e.key === "ArrowDown") FSAE_STAGE.keys.s = false;
    else if (k === "a" || e.key === "ArrowLeft") FSAE_STAGE.keys.a = false;
    else if (k === "d" || e.key === "ArrowRight") FSAE_STAGE.keys.d = false;
    else if (e.code === "Space") FSAE_STAGE.keys.space = false;
  });

  // Mouse orbit & wheel zoom on fsaeCanvas
  const cv = document.getElementById("fsaeCanvas");
  if (cv) {
    let dragging = false, lx = 0, ly = 0;
    cv.addEventListener("mousedown", e => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", e => {
      if (!dragging || !FSAE_STAGE.active) return;
      FSAE_STAGE.camOrbit.az += (e.clientX - lx) * 0.008;
      FSAE_STAGE.camOrbit.elv = Math.max(-0.25, Math.min(0.85, FSAE_STAGE.camOrbit.elv + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    });
    cv.addEventListener("wheel", e => {
      if (!FSAE_STAGE.active) return;
      e.preventDefault();
      FSAE_STAGE.camOrbit.distFactor = Math.max(0.45, Math.min(2.8, FSAE_STAGE.camOrbit.distFactor * (1 + Math.sign(e.deltaY) * 0.08)));
    }, { passive: false });
  }
}

window.FSAE_TRACK_DATA = FSAE_TRACK_DATA;
window.FSAE_AUTOCROSS_META = FSAE_AUTOCROSS_META;
window.FsaeAccelPath = FsaeAccelPath;
window.FsaeSkidpadPath = FsaeSkidpadPath;
window.FsaeAutocrossPath = FsaeAutocrossPath;
window.computeFsaeAccelScore = computeFsaeAccelScore;
window.computeFsaeSkidpadScore = computeFsaeSkidpadScore;
window.computeFsaeAutocrossScore = computeFsaeAutocrossScore;
window.FSAE_STAGE = FSAE_STAGE;
window.openFsaeStage = openFsaeStage;
window.closeFsaeStage = closeFsaeStage;
window.fsaeSwitchEvent = fsaeSwitchEvent;
window.fsaeSwitchAutocrossTrack = fsaeSwitchAutocrossTrack;
window.fsaeStepSimulation = fsaeStepSimulation;
window.buildFsaePath = buildFsaePath;

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFsaeStageEvents);
  } else {
    initFsaeStageEvents();
  }
}
