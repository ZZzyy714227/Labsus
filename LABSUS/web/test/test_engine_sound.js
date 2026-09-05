/* P2-Sound 引擎声浪测试（2026-09-02）：纯逻辑层 headless 锁定。
   EngineAudioModel 挡位状态机 + 声学映射（无 DOM / 无 AudioContext）：
   1. 四车型声线档案（cyl/redline/idle 互异 → 声线随预设变化）
   2. 升挡链：omega 递增 → 1→2→3、换挡帧 RPM 断落（齿轮比切换）、shift 事件
   3. 换挡迟滞防抖：临界转速噪声不引起反复换挡
   4. 换挡断油 cut：gain 瞬时闷响
   5. 重刹降挡回火 pop 事件
   6. 怠速基础声
   7. 声学映射单调（油门→增益/亮度；转速→点火频率）
   8. 打滑啸叫层
   9. EngineSound 单例 headless：无 AudioContext 不抛错、S.vehicleType 联动换声线、
      watchdog 兜底（vm 沙箱无 setInterval → 心跳不注册，单例逻辑直接断言）
   无 DOM / 无 rAF —— 直接 node 运行。 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const _n = () => {};
const stubDoc = {
  documentElement: { setAttribute: _n, getAttribute: () => null },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => null,        // 故意返回 null：按钮注入须安全跳过
  body: null,                        // 无 body → 不注入
  addEventListener: _n, readyState: "complete"
};
const lsCalls = [];
const ctx = {
  window: { S: { vehicleType: "gt3" } }, console, Math, Number, Array, Object, JSON, String, Boolean,
  document: stubDoc, localStorage: { getItem: () => null, setItem: (k, v) => lsCalls.push([k, v]) },
  performance: { now: () => 0 }, requestAnimationFrame: _n, setTimeout: _n,
  parseInt, parseFloat, isFinite, isNaN, Error, Date, RegExp, Map, Set
};
ctx.globalThis = ctx; ctx.window.document = stubDoc; ctx.window.addEventListener = _n;
vm.createContext(ctx);
const src = fs.readFileSync(path.join(ROOT, "web/js/13-engine-sound.js"), "utf8");
vm.runInContext(src, ctx, { filename: "13-engine-sound.js" });

const Model = ctx.window.EngineAudioModel;
const PROFILES = ctx.window.ENGINE_SOUND_PROFILES;
const EngineSound = ctx.window.EngineSound;

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log("[PASS] " + name); }
  else { fail++; console.log("[FAIL] " + name + (extra !== undefined ? "  " + extra : "")); }
}

// ── 1. 四车型声线档案 ──
{
  const keys = ["formula", "gt3", "gt3_sport", "baja"];
  T("四车型声线档案齐全", keys.every(k => PROFILES[k] && PROFILES[k].ratios.length >= 3));
  T("缸数互异（V8 / I4 / 单缸）", PROFILES.gt3.cyl === 8 && PROFILES.formula.cyl === 4
    && PROFILES.gt3_sport.cyl === 4 && PROFILES.baja.cyl === 1);
  T("redline 互异且 idle < redline",
    PROFILES.gt3.redline === 9000 && PROFILES.formula.redline === 11000
    && PROFILES.baja.redline === 8200 && PROFILES.gt3_sport.redline === 7200
    && keys.every(k => PROFILES[k].idle < PROFILES[k].redline));
}

// ── 2. 升挡链：omega 递增 → 1→2→3 + RPM 断落 + shift 事件 ──
{
  const m = new Model("gt3");
  const frames = [];
  // 1→2 临界 omega≈79.9；2→3 临界≈108.8。dt=0.025：换挡间隔 0.35s > 0.30s cooldown
  for (let w = 5; w <= 135; w += 2) {
    frames.push(m.update(0.025, { wheelOmega: w, throttle: 1.0, brake: 0, kappaMax: 0, isKerb: false }));
  }
  const gears = frames.map(f => f.gear);
  T("升挡链 1→2→3", gears[0] === 1 && gears.includes(2) && gears.includes(3),
    "gears=" + [...new Set(gears)].join(","));
  const shiftIdx = frames.findIndex(f => f.events.includes("shift"));
  T("换挡帧带 shift 事件", shiftIdx > 0);
  // RPM 滑落（独立场景）：1 挡 rpm 道平后固定 omega 越临界 → 齿轮比切换 →
  // target 8266→6373，惯性 τ≈83ms 滑落（升挡后继续加速 target 回升是真实行为，
  // 故滑落断言必须在固定 omega 下测）
  const m3 = new Model("gt3");
  for (let i = 0; i < 10; i++) m3.update(0.025, { wheelOmega: 78, throttle: 1.0, brake: 0 });
  const seq = [];
  for (let i = 0; i < 12; i++) seq.push(m3.update(0.025, { wheelOmega: 82, throttle: 1.0, brake: 0 }));
  const after = Math.min(...seq.map(f => f.rpm));
  T("换挡后 RPM 滑落（齿轮比切换）", seq[0].events.includes("shift") && after < seq[0].rpm * 0.9,
    "滑落至=" + after.toFixed(0) + " 换挡帧=" + seq[0].rpm.toFixed(0));
}

// ── 3. 迟滞防抖：临界转速噪声不反复换挡 ──
{
  const m = new Model("gt3");
  m.update(0.01, { wheelOmega: 5, throttle: 1.0, brake: 0 });        // 1 挡起步
  let shifts = 0;
  for (let i = 0; i < 40; i++) {
    const w = 79 + (i % 2 ? 1.5 : -1.5);                             // 临界 ±噪声
    const f = m.update(0.01, { wheelOmega: w, throttle: 1.0, brake: 0 });
    if (f.events.includes("shift")) shifts++;
  }
  T("临界转速噪声换挡次数 ≤ 1（迟滞防抖）", shifts <= 1, "shifts=" + shifts);
}

// ── 4. 换挡断油 cut：gain 瞬时闷响 ──
{
  const m = new Model("gt3");
  let prev = null, cutGain = null, normGain = null;
  for (let w = 5; w <= 100; w += 2) {
    const f = m.update(0.01, { wheelOmega: w, throttle: 1.0, brake: 0 });
    if (prev && f.events.includes("shift")) { cutGain = f.gain; normGain = prev.gain; }
    prev = f;
  }
  T("换挡帧 gain 断油闷响（<50%）", cutGain !== null && cutGain < normGain * 0.5,
    "cut=" + (cutGain || 0).toFixed(3) + " norm=" + (normGain || 0).toFixed(3));
}

// ── 5. 重刹降挡回火 pop ──
{
  const m = new Model("gt3");
  for (let w = 5; w <= 100; w += 4) {
    m.update(0.01, { wheelOmega: w, throttle: 1.0, brake: 0 });       // 先升到 2 挡
  }
  // 等 0.30s 换挡 cooldown 清零（期间保持 2 挡：omega 80 < 2→3 临界）
  for (let i = 0; i < 35; i++) {
    m.update(0.01, { wheelOmega: 80, throttle: 0.5, brake: 0 });
  }
  const f = m.update(0.01, { wheelOmega: 5, throttle: 0, brake: 1.0 }); // 重刹低转 → 降 1 挡
  T("重刹降挡触发 pop 回火", f.events.includes("pop") && f.gear === 1,
    "events=" + JSON.stringify(f.events) + " gear=" + f.gear);
}

// ── 6. 怠速基础声 ──
{
  const m = new Model("gt3");
  let f = null;
  for (let i = 0; i < 30; i++) f = m.update(0.05, { wheelOmega: 0, throttle: 0, brake: 0 });
  T("怠速收敛到 idle 且有基础声", Math.abs(f.rpm - PROFILES.gt3.idle) < 200
    && f.gain > 0.05, "rpm=" + f.rpm.toFixed(0) + " gain=" + f.gain.toFixed(3));
  T("怠速点火频率 = idle/60 × cyl/2 × baseMul", 
    Math.abs(f.f2 - PROFILES.gt3.idle / 60 * 4 * PROFILES.gt3.baseMul) < 8,
    "f2=" + f.f2.toFixed(1) + " 期望 " + (PROFILES.gt3.idle / 60 * 4 * PROFILES.gt3.baseMul).toFixed(1));
}

// ── 7. 声学映射单调 ──
{
  const m = new Model("gt3");
  const lo = m.update(0.01, { wheelOmega: 20, throttle: 0, brake: 0 });
  const hi = m.update(0.05, { wheelOmega: 20, throttle: 1.0, brake: 0 });
  T("油门↑ → 增益/亮度↑", hi.gain > lo.gain * 2 && hi.bright > lo.bright * 2,
    "gain " + lo.gain.toFixed(2) + "→" + hi.gain.toFixed(2) + " bright " + lo.bright.toFixed(0) + "→" + hi.bright.toFixed(0));
  const m2 = new Model("gt3");
  const rLo = m2.update(0.05, { wheelOmega: 10, throttle: 1.0, brake: 0 });
  const rHi = m2.update(0.05, { wheelOmega: 40, throttle: 1.0, brake: 0 });
  T("转速↑ → 点火频率↑", rHi.f2 > rLo.f2 * 2, "f2 " + rLo.f2.toFixed(0) + "→" + rHi.f2.toFixed(0));
  T("V8 半阶排气主频（f1 = f2/2）", Math.abs(rHi.f1 - rHi.f2 / 2) < 1e-6);
}

// ── 8. 打滑啸叫层 ──
{
  const m = new Model("gt3");
  const grip = m.update(0.01, { wheelOmega: 20, throttle: 0.5, brake: 0, kappaMax: 0.05 });
  const spin = m.update(0.01, { wheelOmega: 20, throttle: 0.5, brake: 0, kappaMax: 0.5 });
  T("驱动轮打滑 → 啸叫层增益", spin.slipGain > grip.slipGain && spin.slipGain > 0.05,
    "grip=" + grip.slipGain.toFixed(3) + " spin=" + spin.slipGain.toFixed(3));
}

// ── 9. EngineSound 单例 headless（无 AudioContext）──
{
  T("headless 加载无 AudioContext 不抛错（sink inert）", EngineSound.sink.ok === false);
  const st = { omega: { FL: 5, FR: 5, RL: 30, RR: 30 } };
  const tel = { kappa: { FL: 0, FR: 0, RL: 0.3, RR: 0 }, isKerb: { FL: true } };
  const p = EngineSound.update(0.016, st, tel, { throttle: 1.0, brake: 0, steer: 0 });
  T("单例 update 输出参数帧（isKerb/κ 提取）", isFinite(p.gain) && isFinite(p.f2) && p.slipGain > 0);
  T("S.vehicleType 联动声线（gt3→baja）", (() => {
    ctx.window.S.vehicleType = "baja";
    EngineSound.update(0.016, st, tel, { throttle: 1.0, brake: 0 });
    const okBaja = EngineSound.model.profileKey === "baja";
    ctx.window.S.vehicleType = "gt3";
    return okBaja;
  })());
  T("初始静音 → toggle 后有声态", EngineSound.muted === true && EngineSound.toggle() === true
    && EngineSound.muted === false && EngineSound.toggle() === false);
  T("开关状态持久化（localStorage labsus-sound-muted）", lsCalls.length >= 2
    && lsCalls[lsCalls.length - 2][0] === "labsus-sound-muted" && lsCalls[lsCalls.length - 2][1] === "0"
    && lsCalls[lsCalls.length - 1][1] === "1",
    JSON.stringify(lsCalls.slice(-2)));
}

// ── 10. G31-P10-3：POWERTRAIN 统一（rpm/gear 源接管 + 回退路径） ──
{
  /* 沙箱注意：本测试不加载 16-powertrain.js（其顶层含 DOM 交互，stub 风险更低）。
     EngineAudioModel 内部以自由变量 POWERTRAIN（vm 沙箱运行时查 ctx 全局）与
     window.physicsEngine._ptOut（11-stages 接线层存的 step 回传帧）取源——
     在已 contextify 的沙箱上注入等价 stub 即模拟真实接线；
     第 1-9 节在无 POWERTRAIN 的沙箱运行 = 回退路径（逐位不变保证）。 */
  ctx.POWERTRAIN = {
    spec: { architecture: "ice", drive: "rwd" },
    state: { iceOmega: 523.598, gearIdx: 2 },          // 5000 rpm 曲轴，3 挡（0-based 2）
    hasLiveRpmSource() { return true; }
  };
  ctx.window.physicsEngine = { _ptOut: null };         // 非 EV：rpm 走 state.iceOmega

  // a) rpm 直读曲轴（state.iceOmega×30/π = 5000；dt=0.5 → 一阶惯性单帧到位），
  //    wheelOmega 用干扰值（999→旧换算约 57000 rpm）验证其不泄漏
  const m = new Model("gt3");
  let f = m.update(0.5, { wheelOmega: 999, throttle: 1, brake: 0 });
  T("POWERTRAIN 接管：rpm = state.iceOmega 曲轴值", Math.abs(f.rpm - 5000) < 1,
    "rpm=" + f.rpm.toFixed(1));
  T("POWERTRAIN 接管：gear = state.gearIdx+1（0-based→1-based）", f.gear === 3,
    "gear=" + f.gear);

  // b) 挡位状态机不自推进：rpm 超 redline×shiftUp（9000×0.94=8460）仍不上 4 挡、
  //    无 shift 事件（换挡唯一来源 = POWERTRAIN gearbox 状态机）
  ctx.POWERTRAIN.state.iceOmega = 10000 * Math.PI / 30;   // 10000 rpm
  let shifts = 0; const gearSet = new Set();
  for (let i = 0; i < 8; i++) {
    f = m.update(0.05, { wheelOmega: 999, throttle: 1, brake: 0 });
    if (f.events.includes("shift")) shifts++;
    gearSet.add(f.gear);
  }
  T("POWERTRAIN 接管：挡位不自行推进（超红线不升挡/无 shift 事件）",
    shifts === 0 && gearSet.size === 1 && f.gear === 3,
    "gear=" + [...gearSet].join(",") + " shifts=" + shifts);

  // c) EV：rpm 源 = POWERTRAIN.step 回传 shiftRpm（经 EngineSound.update 读
  //    window.physicsEngine._ptOut；减速器齿比与 fwd/rwd 架构感知已在
  //    16-powertrain 内算好）——wheelOmega 旧换算 30×30/π≈286 不得泄漏
  ctx.POWERTRAIN.spec = { architecture: "ev", drive: "rwd" };
  ctx.POWERTRAIN.state = { iceOmega: 0, gearIdx: 0 };
  ctx.window.physicsEngine._ptOut = { iceRpm: 0, shiftRpm: 4200, gearIdx: 0, soc: 0.87, P_out: -52000 };
  const _stEv = { omega: { FL: 0, FR: 0, RL: 30, RR: 30 } };
  f = EngineSound.update(0.5, _stEv, null, { throttle: 1, brake: 0 });
  T("EV：rpm = POWERTRAIN.shiftRpm（电机轴，非轮速换算）", Math.abs(f.rpm - 4200) < 1,
    "rpm=" + f.rpm.toFixed(1));

  // d) EV ptOut 缺失（早期帧/其他舞台）：guard 回退轮速换算（100×30/π≈954.9 > idle）
  ctx.window.physicsEngine._ptOut = null;
  f = EngineSound.update(0.5, { omega: { FL: 0, FR: 0, RL: 100, RR: 100 } }, null, { throttle: 1, brake: 0 });
  T("EV：ptOut 缺失 guard 回退轮速换算", Math.abs(f.rpm - 100 * 30 / Math.PI) < 1,
    "rpm=" + f.rpm.toFixed(1));

  // e) 清除 stub → 回退旧路径逐位复现（与第 2 节同场景：升挡 + RPM 滑落）
  delete ctx.POWERTRAIN; delete ctx.window.physicsEngine;
  const mR = new Model("gt3");
  for (let i = 0; i < 10; i++) mR.update(0.025, { wheelOmega: 78, throttle: 1, brake: 0 });
  const seqR = [];
  for (let i = 0; i < 12; i++) seqR.push(mR.update(0.025, { wheelOmega: 82, throttle: 1, brake: 0 }));
  const afterR = Math.min(...seqR.map(fr => fr.rpm));
  T("回退路径：升挡 + RPM 滑落逐位复现（无 POWERTRAIN）",
    seqR[0].events.includes("shift") && afterR < seqR[0].rpm * 0.9,
    "滑落至=" + afterR.toFixed(0));
}

console.log("\n========================================");
console.log("P2-Sound 引擎声浪测试 " + pass + "/" + (pass + fail) + " Passed");
if (fail > 0) { console.log("FAILED: " + fail); process.exit(1); }
