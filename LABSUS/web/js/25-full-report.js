"use strict";
/* ============================================================================
 * LABSUS · 25-full-report.js
 * 一键全量分析与终极数据报告生成器 (One-Click Full Analysis & Ultimate Report)
 *
 * 一键串联并汇总全平台 8 大分析维度（无副作用，分析完毕自动还原现场状态）：
 *   1. 整车与悬架基准参数快照 (Vehicle, Tire, Powertrain, Hardpoints)
 *   2. 静态运动学 K&C、准静态侧倾载荷与 21 项红绿灯评分 (10-eval + OPTIMIZER)
 *   3. 垂向平顺性与模态台架 (RIDE_BENCH: step / sweep / impulse / random / freedecay)
 *   4. 横向稳态、侧倾梯度与极限圆台架 (LAT_BENCH + COMPARE.trackLimit)
 *   5. 纵向加减速与制动力分配扫描 (LONG_BENCH: accel / brake / brakeBiasSweep)
 *   6. 整车 G-G 动力学能力包络 (CAR_CAPABILITY.measure)
 *   7. 大学生方程式动态赛组合实测 (FSAE_STAGE headless: 75m Accel + Fig-8 Skidpad + FSG/FSC)
 *   8. 试验场直道极限工况快检 + 上海赛道理论包络 / 可选 1 圈 15-DOF 闭环仿真
 *
 * 输出：
 *   - 工程诊断简报（自动高亮短板、异常与调校建议）
 *   - AI 专用结构化 Markdown 提示词报告（一键复制直接喂给大模型分析 / 导出 .md）
 *   - 完整原始 JSON 数据包（预览 / 导出 .json）
 * ============================================================================ */

(function (global) {
  /* 无头沙箱（web/test/_stage_harness.js）把 setTimeout 桩成永不回调的 `() => 0`：
     `new Promise(r => setTimeout(r, 0))` 会永久挂起（实测 test_full_report 卡死在首个 await）。
     只有确认是**原生**定时器才让出主线程，否则立即 resolve（无头批量分析不需要 UI 让渡）。 */
  const _timerIsReal = (function () {
    if (typeof setTimeout !== "function") return false;
    try {
      return /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(setTimeout));
    } catch (e) { return false; }
  })();
  const _tick = () => _timerIsReal ? new Promise(resolve => setTimeout(resolve, 0)) : Promise.resolve();
  const fin = (v, d = null) => (typeof v === "number" && isFinite(v)) ? v : d;
  const fmt = (v, d = 2) => (typeof v === "number" && isFinite(v)) ? v.toFixed(d) : "—";

  let _lastReport = null;
  let _busy = false;
  let _cancelFlag = false;
  let _activeTab = "summary"; // "summary" | "markdown" | "json"

  /* --------------------------------------------------------------------------
   * 1. 整车参数与硬点快照
   * -------------------------------------------------------------------------- */
  function collectVehicleSnapshot() {
    const preset = (typeof VEHICLE_PRESETS !== "undefined" && VEHICLE_PRESETS[S.vehicleType]) || {};
    const tireF = (S.front && S.front.tire) || {};
    const tireR = (S.rear && S.rear.tire) || {};
    const pt = (typeof POWERTRAIN !== "undefined" && POWERTRAIN.spec) ? POWERTRAIN.spec : null;

    let tfMm = null, trMm = null;
    try {
      if (S.front && S.front.hp && S.front.hp.WC) tfMm = Math.abs(S.front.hp.WC[0]) * 2;
      if (S.rear && S.rear.hp && S.rear.hp.WC) trMm = Math.abs(S.rear.hp.WC[0]) * 2;
    } catch (e) {}

    return {
      vehicleType: S.vehicleType || "?",
      vehicleName: preset.name || S.vehicleType || "Custom",
      wbMm: fin(S.wb),
      trackFrontMm: fin(tfMm),
      trackRearMm: fin(trMm),
      mTotalKg: fin(S.mTotal),
      mSprungKg: fin(S.mSprung),
      hcgMm: fin(S.hcg),
      hsMm: fin(S.hs),
      brkF: fin(S.brkF),
      front: {
        arch: S.front && S.front.arch,
        mSKg: fin(S.front && S.front.mS),
        mUKg: fin(S.front && S.front.mU),
        kSNmm: fin(S.front && S.front.kS),
        cRNsmm: fin(S.front && S.front.cR),
        kTNmm: fin(S.front && S.front.kT),
        arbMm: fin(S.front && S.front.arb && S.front.arb.d),
        tire: { W: fin(tireF.W), R: fin(tireF.R), Fy0: fin(tireF.Fy0), FzNom: fin(tireF.FzNom), By: fin(tireF.By), Cy: fin(tireF.Cy), LS: fin(tireF.LS) },
        hp: S.front && S.front.hp ? JSON.parse(JSON.stringify(S.front.hp)) : null
      },
      rear: {
        arch: S.rear && S.rear.arch,
        mSKg: fin(S.rear && S.rear.mS),
        mUKg: fin(S.rear && S.rear.mU),
        kSNmm: fin(S.rear && S.rear.kS),
        cRNsmm: fin(S.rear && S.rear.cR),
        kTNmm: fin(S.rear && S.rear.kT),
        arbMm: fin(S.rear && S.rear.arb && S.rear.arb.d),
        tire: { W: fin(tireR.W), R: fin(tireR.R), Fy0: fin(tireR.Fy0), FzNom: fin(tireR.FzNom), By: fin(tireR.By), Cy: fin(tireR.Cy), LS: fin(tireR.LS) },
        hp: S.rear && S.rear.hp ? JSON.parse(JSON.stringify(S.rear.hp)) : null
      },
      powertrain: pt ? {
        architecture: pt.architecture,
        drive: pt.drive,
        splitFront: pt.splitFront,
        gearboxType: pt.gearbox && pt.gearbox.type,
        finalDrive: pt.gearbox && pt.gearbox.finalDrive,
        diffType: pt.diff && pt.diff.type
      } : null
    };
  }

  /* --------------------------------------------------------------------------
   * 2. 静态运动学 K&C + 准静态 + 21 项红绿灯 + 几何代价
   * -------------------------------------------------------------------------- */
  function collectStaticKC() {
    if (typeof rebuild === "function") {
      try { rebuild(); } catch (e) {}
    }
    const ev = (typeof calculateEvaluationData === "function") ? calculateEvaluationData() : null;
    const bm = (typeof EVAL_BENCHMARKS !== "undefined") ? EVAL_BENCHMARKS : {};
    const kpis = [];
    let good = 0, warn = 0, bad = 0;

    if (ev && ev.metrics) {
      for (const k of Object.keys(bm)) {
        const meta = bm[k];
        const cell = ev.metrics[k];
        const val = cell ? cell.val : null;
        const formatted = cell ? cell.formatted : "—";
        const grade = (meta.eval) ? meta.eval(val) : "warn";
        if (grade === "good") good++;
        else if (grade === "bad") bad++;
        else warn++;
        kpis.push({ key: k, name: meta.name, value: fin(val), formatted, unit: meta.unit || "", target: meta.target || "", grade });
      }
    }

    const qs = (typeof SIM !== "undefined" && SIM.qsRes) ? SIM.qsRes : null;
    const mFR = (typeof SIM !== "undefined" && SIM.mFR) ? SIM.mFR : {};
    const mRR = (typeof SIM !== "undefined" && SIM.mRR) ? SIM.mRR : {};

    let optF = null, optR = null;
    if (typeof OPTIMIZER !== "undefined" && typeof OPTIMIZER.evaluateMetrics === "function") {
      try { optF = OPTIMIZER.evaluateMetrics("front", [-30, 30], 13); } catch (e) {}
      try { optR = OPTIMIZER.evaluateMetrics("rear", [-30, 30], 13); } catch (e) {}
    }

    return {
      overallScore: ev ? ev.overall : null,
      dimScores: ev ? ev.dimScores : null,
      counts: { good, warn, bad, total: kpis.length },
      alignment: {
        front: { camberDeg: fin(mFR.cam), toeDeg: fin(mFR.toe), kpiDeg: fin(mFR.kpi), casterDeg: fin(mFR.cast), scrubMm: fin(mFR.scrub), trailMm: fin(mFR.trail), rcHMm: fin(mFR.rcH), antiDivePct: fin(mFR.anti) },
        rear:  { camberDeg: fin(mRR.cam), toeDeg: fin(mRR.toe), kpiDeg: fin(mRR.kpi), casterDeg: fin(mRR.cast), scrubMm: fin(mRR.scrub), trailMm: fin(mRR.trail), rcHMm: fin(mRR.rcH), antiSquatPct: fin(mRR.anti) }
      },
      quasiStatic: qs ? {
        gyG: fin(S.qs && S.qs.gy),
        gxG: fin(S.qs && S.qs.gx),
        rollDeg: fin(qs.rollDeg),
        rollGradDegPerG: fin(qs.rollGrad),
        kPhiFrontNmDeg: fin(qs.kphi_f),
        kPhiRearNmDeg: fin(qs.kphi_r),
        tlltdPct: fin(qs.tlltd),
        usGradDegPerG: fin(qs.usGrad),
        alphaFDeg: fin(qs.alphaF),
        alphaRDeg: fin(qs.alphaR),
        jackingMm: fin(qs.jackingMm),
        fz: qs.fz ? { FL: fin(qs.fz.FL), FR: fin(qs.fz.FR), RL: fin(qs.fz.RL), RR: fin(qs.fz.RR) } : null
      } : null,
      kinematicAudit: { front: optF, rear: optR },
      kpis
    };
  }

  /* --------------------------------------------------------------------------
   * 3~6. 台架测试封装（Ride / Lat / Long / Capability）
   * -------------------------------------------------------------------------- */
  function collectRideBench() {
    if (typeof RIDE_BENCH === "undefined") return { skipped: true };
    const step = RIDE_BENCH.run("step", { ampMm: 5, dur: 2.5 });
    const sweep = RIDE_BENCH.run("sweep", { ampMm: 2, cycles: 5 });
    const impulse = RIDE_BENCH.run("impulse", { ampMm: 10, dur: 1.8 });
    const randomC = RIDE_BENCH.run("random", { isoClass: "C", speedMs: 16.7, dur: 6.0 });
    const freedecay = RIDE_BENCH.run("freedecay", { dur: 3.0, over: { zeroDamping: true } });
    return {
      step: step && step.metrics,
      sweep: sweep && sweep.metrics,
      impulse: impulse && impulse.metrics,
      randomIsoC60kmh: randomC && randomC.metrics,
      freeDecayNoDamp: freedecay && freedecay.metrics
    };
  }

  function collectLatBench() {
    if (typeof LAT_BENCH === "undefined") return { skipped: true };
    const steady = LAT_BENCH.steadyCircle({ speed: 14, steerDeg: 5, dur: 5.0 });
    const rollGrad = LAT_BENCH.rollGradient({ speeds: [8, 10, 12, 14, 16] });
    const steerStep = LAT_BENCH.steerStep({ speed: 16, steerDeg: 4, dur: 2.5 });
    const analytic = LAT_BENCH.analytic();
    let trackLim = null;
    if (typeof COMPARE !== "undefined" && typeof COMPARE.trackLimit === "function") {
      try {
        const tl = COMPARE.trackLimit({});
        trackLim = tl ? tl.metrics : null;
      } catch (e) {}
    }
    return {
      steadyCircle14ms5deg: steady && steady.metrics,
      rollGradientDegPerG: rollGrad && rollGrad.metrics ? rollGrad.metrics.gradDegPerG : null,
      rollGradientPoints: rollGrad && rollGrad.metrics ? rollGrad.metrics.points : null,
      steerStep: steerStep && steerStep.metrics,
      analyticRollStiffness: analytic ? {
        KrollNmRad: fin(analytic.Kroll),
        KrollSpringNmRad: fin(analytic.KrollSpring),
        KrollArbNmRad: fin(analytic.KrollArb),
        KrollFrontNmRad: fin(analytic.KrollF),
        KrollRearNmRad: fin(analytic.KrollR),
        hRollArmM: fin(analytic.hRollArm)
      } : null,
      skidpadLimit: trackLim
    };
  }

  function collectLongBench() {
    if (typeof LONG_BENCH === "undefined") return { skipped: true };
    const acc = LONG_BENCH.accelTest({ distM: 75, maxSecs: 10.0 });
    const brk = LONG_BENCH.brakeTest({ vStartKmh: 100, pedal: 0.95, maxSecs: 7.0 });
    const sweep = LONG_BENCH.brakeBiasSweep({ vStartKmh: 100, pedal: 0.95 });
    return {
      accel75m: acc ? {
        reached: acc.reached, timeSec: fin(acc.timeSec), vEndKmh: fin(acc.vEndKmh),
        peakAxG: fin(acc.peakAxG), avgAxG: fin(acc.avgAxG),
        maxSquatDeg: fin(acc.maxSquatDeg), frontLoadDropN: fin(acc.frontLoadDropN)
      } : null,
      brake100kmh: brk ? {
        stopDistM: fin(brk.stopDistM), stopTimeSec: fin(brk.stopTimeSec),
        peakDecelG: fin(brk.peakDecelG), avgDecelG: fin(brk.avgDecelG),
        maxDiveDeg: fin(brk.maxDiveDeg), lockupFront: !!brk.lockupFront,
        lockupRear: !!brk.lockupRear, firstLockup: brk.firstLockup || "none"
      } : null,
      brakeBiasSweep: sweep ? {
        bestBias: fin(sweep.bestBias), minStopDistM: fin(sweep.minStopDistM),
        safeBestDistM: fin(sweep.safeBestDistM),
        points: (sweep.points || []).map(p => ({
          bias: fin(p.brakeBias), stopDistM: fin(p.stopDistM),
          peakDecelG: fin(p.peakDecelG), lockupFront: !!p.lockupFront, lockupRear: !!p.lockupRear
        }))
      } : null
    };
  }

  function collectCapability() {
    if (typeof CAR_CAPABILITY === "undefined" || typeof CAR_CAPABILITY.measure !== "function") {
      return { skipped: true };
    }
    const c = CAR_CAPABILITY.measure({ force: true });
    return {
      source: c.source,
      ayMaxG: fin(c.ay0),
      ayTest: c.ayAt,
      brakePeakMs2: fin(c.brk0),
      brakeCurve: c.brkPts,
      accelPeakMs2: fin(c.acc0),
      accelHiSpeedMs2: fin(c.accHi),
      accelCurve: c.accPts
    };
  }

  /* --------------------------------------------------------------------------
   * 7. 大学生方程式动态赛场全套闭环实测 (无头模式，完整保存/恢复现场)
   * -------------------------------------------------------------------------- */
  async function collectFsaeArena(opts) {
    if (typeof FSAE_STAGE === "undefined" || typeof fsaeSwitchEvent !== "function" || typeof fsaeStepSimulation !== "function") {
      return { skipped: true };
    }
    const snap = {
      active: FSAE_STAGE.active,
      playing: FSAE_STAGE.playing,
      autoPilot: FSAE_STAGE.autoPilot,
      headless: FSAE_STAGE.headless,
      event: FSAE_STAGE.event,
      autocrossTrack: FSAE_STAGE.autocrossTrack,
      scores: JSON.parse(JSON.stringify(FSAE_STAGE.scores)),
      rack: S.rack,
      swAngle: S.swAngle
    };

    const out = { accel: null, skidpad: null, autocrossFsg: null, autocrossFsc: null, total275: 0 };
    try {
      FSAE_STAGE.headless = true;
      FSAE_STAGE.active = true;
      FSAE_STAGE.playing = true;
      FSAE_STAGE.autoPilot = true;

      const runOne = async (ev, trk, maxSec) => {
        if (trk) FSAE_STAGE.autocrossTrack = trk;
        fsaeSwitchEvent(ev);
        let maxBeta = 0;
        const steps = Math.round(maxSec * 60);
        for (let i = 0; i < steps; i++) {
          if (_cancelFlag) break;
          const r = fsaeStepSimulation(1 / 60);
          if (r && r.st) {
            const beta = Math.abs(Math.atan2(r.st.v, Math.max(1, r.st.u)) * 180 / Math.PI);
            if (beta > maxBeta) maxBeta = beta;
            if (FSAE_STAGE.run.finished) {
              if (ev === "accel" && r.st.u < 0.35) break;
              if (ev === "skidpad" && r.st.u < 0.5) break;
              if (ev === "autocross") break;
            }
          }
          if (i % 300 === 299) await _tick();
        }
        return { maxBetaDeg: fin(maxBeta), run: JSON.parse(JSON.stringify(FSAE_STAGE.run)) };
      };

      const rA = await runOne("accel", null, 15);
      out.accel = Object.assign({}, FSAE_STAGE.scores.accel, { brakeDistM: fin(rA.run.brakeDist), t0_100: fin(rA.run.t0_100) });
      await _tick();

      const rS = await runOne("skidpad", null, 45);
      out.skidpad = Object.assign({}, FSAE_STAGE.scores.skidpad, { maxBetaDeg: rS.maxBetaDeg });
      await _tick();

      const rFsg = await runOne("autocross", "fsg", 55);
      out.autocrossFsg = Object.assign({}, FSAE_STAGE.scores.autocross, { maxBetaDeg: rFsg.maxBetaDeg });
      await _tick();

      if (opts && opts.includeFsc) {
        const rFsc = await runOne("autocross", "fsc_std", 95);
        out.autocrossFsc = Object.assign({}, FSAE_STAGE.scores.autocross, { maxBetaDeg: rFsc.maxBetaDeg });
        await _tick();
      }

      out.total275 = (out.accel.pts || 0) + (out.skidpad.pts || 0) + (out.autocrossFsg.pts || 0);
    } finally {
      FSAE_STAGE.active = snap.active;
      FSAE_STAGE.playing = snap.playing;
      FSAE_STAGE.autoPilot = snap.autoPilot;
      FSAE_STAGE.headless = snap.headless;
      FSAE_STAGE.event = snap.event;
      FSAE_STAGE.autocrossTrack = snap.autocrossTrack;
      FSAE_STAGE.scores = snap.scores;
      S.rack = snap.rack;
      S.swAngle = snap.swAngle;
    }
    return out;
  }

  /* --------------------------------------------------------------------------
   * 8. 试验场典型工况 + 上海赛道包络（可选 1 圈 15-DOF 实跑）
   * -------------------------------------------------------------------------- */
  async function collectProvingAndCircuit(opts) {
    const out = { provingGround: [], shanghaiEnvelope: null, shanghaiFullLap: null };
    const simObj = (typeof SIM !== "undefined") ? SIM : null;
    if (!simObj || typeof StraightPath !== "function" || typeof VehicleDynamics15DOF !== "function" || typeof UniversalAutoPilot !== "function") {
      return out;
    }

    const scens = [
      { id: "moose_test", name: "ISO 3888-2 麋鹿避障 (75km/h)", speedKmh: 75, maxSec: 12, maxY: 165, cfg: { speedKmh: 75, repeatCount: 2, mooseLaneWidth: 2.8, mooseOffset: 3.5 } },
      { id: "undulating_road", name: "交叉波浪起伏路 (45km/h)", speedKmh: 45, maxSec: 12, maxY: 120, cfg: { speedKmh: 45, repeatCount: 6, undulatingWavelength: 9, undulatingAmplitude: 0.035, undulatingPhase: 180 } },
      { id: "split_mu", name: "对开路面稳定性 (70km/h)", speedKmh: 70, maxSec: 10, maxY: 185, cfg: { speedKmh: 70, repeatCount: 1, muLeft: 1.35, muRight: 0.28 } }
    ];

    for (const sc of scens) {
      if (_cancelFlag) break;
      try {
        const path = new StraightPath(sc.speedKmh / 3.6, sc.id, sc.cfg);
        const eng = new VehicleDynamics15DOF(S, simObj, sc.speedKmh / 3.6);
        const pilot = new UniversalAutoPilot(S);
        pilot.setPath(path);
        pilot.eng = eng;
        pilot.active = true;
        let maxBeta = 0, maxRoll = 0, maxAy = 0, maxSteer = 0, maxX = 0;
        const nSteps = Math.round(sc.maxSec * 60);
        for (let i = 0; i < nSteps; i++) {
          const ctrl = pilot.drive(eng.state, 1 / 60);
          eng.step(ctrl, { grade: 0, path, bumpNoise: 0 }, 1 / 60);
          const st = eng.state, tel = eng.telemetry || {};
          const beta = Math.abs(Math.atan2(st.v, Math.max(1, st.u)) * 180 / Math.PI);
          maxBeta = Math.max(maxBeta, beta);
          maxRoll = Math.max(maxRoll, Math.abs((st.phi || 0) * 180 / Math.PI));
          maxAy = Math.max(maxAy, Math.abs(tel.ay || 0));
          maxSteer = Math.max(maxSteer, Math.abs(ctrl.steer || 0));
          maxX = Math.max(maxX, Math.abs(st.X || 0));
          if (sc.id === "moose_test") {
            const w = (S.front && S.front.hp && S.front.hp.WC) ? Math.abs(S.front.hp.WC[0] * 2) / 1000 : 1.5;
            path.checkConeCollisions(st.X, st.Y, st.psi, w, (S.wb || 1600) / 1000 + 0.8);
          }
          if (st.Y >= sc.maxY) break;
          if (i % 300 === 299) await _tick();
        }
        out.provingGround.push({
          id: sc.id,
          name: sc.name,
          coneHits: path._coneHits ? path._coneHits.size : 0,
          maxAyG: fin(maxAy),
          maxRollDeg: fin(maxRoll),
          maxBetaDeg: fin(maxBeta),
          maxSteerDeg: fin(maxSteer),
          maxLatOffsetM: fin(maxX),
          spinFree: maxBeta < 15.0
        });
      } catch (e) {
        out.provingGround.push({ id: sc.id, name: sc.name, error: e.message });
      }
      await _tick();
    }

    // Shanghai Circuit theoretical envelope (takes ~10ms!)
    if (typeof buildShanghaiCircuit === "function") {
      try {
        const P = buildShanghaiCircuit(1.35, 1.0);
        let tEnv = 0, vTop = 0, vMin = 999;
        for (let i = 0; i < P.pts.length; i++) {
          const a = P.pts[i], b = P.pts[(i + 1) % P.pts.length];
          const ds = Math.hypot((b.refX ?? b.x) - (a.refX ?? a.x), (b.refY ?? b.y) - (a.refY ?? a.y));
          const vm = Math.max(5.0, 0.5 * ((a.v_max || 20) + (b.v_max || 20)));
          tEnv += ds / vm;
          vTop = Math.max(vTop, (a.v_max || 0) * 3.6);
          vMin = Math.min(vMin, (a.v_max || 999) * 3.6);
        }
        out.shanghaiEnvelope = {
          lengthM: fin(P.totalLength),
          theoreticalLapSec: fin(tEnv),
          topSpeedKmh: fin(vTop),
          minApexSpeedKmh: fin(vMin),
          capabilityMode: P.capabilityMode
        };

        // Optional 1-lap 15-DOF closed-loop simulation on Shanghai Circuit
        if (opts && opts.includeShanghaiLap) {
          const eng = new VehicleDynamics15DOF(S, simObj, 5.0);
          const p0 = P.pts[0];
          const r0 = ((S.front && S.front.tire && S.front.tire.R) || 260) / 1000;
          Object.assign(eng.state, {
            X: p0.refX ?? p0.x, Y: p0.refY ?? p0.y, Z: 0,
            phi: 0, theta: 0, psi: p0.refHeading ?? p0.heading,
            u: 5, v: 0, w: 0, p: 0, q: 0, r: 0,
            omega: { FL: 5 / r0, FR: 5 / r0, RL: 5 / r0, RR: 5 / r0 }
          });
          const pilot = new UniversalAutoPilot(S);
          pilot.setPath(P); pilot.eng = eng; pilot.active = true;
          let lastS = 0, simT = 0, lapT = null, maxU = 0, maxAy = 0, maxBeta = 0, offTrack = 0;
          for (let i = 0; i < 60 * 220; i++) {
            if (_cancelFlag) break;
            const ctrl = pilot.drive(eng.state, 1 / 60);
            eng.step(ctrl, { grade: 0, path: P, bumpNoise: 0 }, 1 / 60);
            simT += 1 / 60;
            const tp = P.getLookahead(eng.state.X, eng.state.Y, eng.state.u);
            const tel = eng.telemetry || {};
            maxU = Math.max(maxU, eng.state.u * 3.6);
            maxAy = Math.max(maxAy, Math.abs(tel.ay || 0));
            maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(eng.state.v, Math.max(1, eng.state.u)) * 180 / Math.PI));
            if (Math.abs(tp.crossTrackError) > 7.20) offTrack++;
            if (lastS > P.totalLength * 0.85 && tp.s < P.totalLength * 0.15 && simT > 20) {
              lapT = simT;
              break;
            }
            lastS = tp.s;
            if (i % 360 === 359) await _tick();
          }
          out.shanghaiFullLap = {
            completed: lapT !== null,
            lapTimeSec: fin(lapT),
            topSpeedKmh: fin(maxU),
            peakAyG: fin(maxAy),
            maxBetaDeg: fin(maxBeta),
            offTrackSamples: offTrack
          };
        }
      } catch (e) {
        out.shanghaiEnvelope = { error: e.message };
      }
    }
    return out;
  }

  /* --------------------------------------------------------------------------
   * 9. 自动工程诊断摘要（识别短板、矛盾与可优化项，方便人 & AI 一眼定位）
   * -------------------------------------------------------------------------- */
  function buildEngineeringInsights(rep) {
    const insights = [];
    const sk = rep.staticKC || {};
    const kpiMap = {};
    (sk.kpis || []).forEach(k => { kpiMap[k.key] = k; });

    const badKpis = (sk.kpis || []).filter(k => k.grade === "bad");
    if (badKpis.length) {
      insights.push(`[几何/刚度红灯项 ×${badKpis.length}] ${badKpis.map(k => `${k.name}=${k.formatted}${k.unit} (目标 ${k.target})`).join("；")}`);
    } else {
      insights.push("[几何/刚度达标] 21 项静态评价无红灯异常项。");
    }

    if (sk.quasiStatic) {
      const qs = sk.quasiStatic;
      if (qs.tlltdPct !== null) {
        const balance = qs.tlltdPct > 56 ? "偏转向不足（前轴载荷转移大）" : (qs.tlltdPct < 48 ? "偏转向过度（后轴载荷转移大）" : "前后侧倾均衡");
        insights.push(`[稳态操纵平衡] TLLTD=${fmt(qs.tlltdPct, 1)}% (${balance})，侧倾梯度=${fmt(qs.rollGradDegPerG, 2)} °/g，不足转向梯度=${fmt(qs.usGradDegPerG, 2)} °/g。`);
      }
    }

    if (rep.ride && !rep.ride.skipped) {
      const st = rep.ride.step || {};
      const sw = rep.ride.sweep || {};
      if (st.overshootPct > 25) {
        insights.push(`[垂向阻尼偏欠] 阶跃超调 ${fmt(st.overshootPct, 1)}% > 25%，扫频阻尼比 ζ=${fmt(sw.zeta, 2)}，可适当提高慢速回弹/压缩阻尼。`);
      } else {
        insights.push(`[垂向平顺性] 阶跃 T63=${fmt(st.t63Ms, 0)}ms / 超调 ${fmt(st.overshootPct, 1)}% / 共振峰 ${fmt(sw.peakFreqHz, 1)}Hz (${fmt(sw.peakTrans, 2)}x) / ISO-C 车身 RMS=${fmt(rep.ride.randomIsoC60kmh && rep.ride.randomIsoC60kmh.bodyRmsMm, 1)}mm。`);
      }
    }

    if (rep.longitudinal && !rep.longitudinal.skipped && rep.longitudinal.brake100kmh) {
      const b = rep.longitudinal.brake100kmh;
      const sw = rep.longitudinal.brakeBiasSweep;
      let msg = `[纵向制动] 100→0 km/h 制动距离 ${fmt(b.stopDistM, 1)}m (峰值减速度 ${fmt(b.peakDecelG, 2)}g, 点头 ${fmt(b.maxDiveDeg, 2)}°)`;
      if (b.lockupRear) msg += `，⚠️ 当前制动力分配 (${fmt((rep.vehicle.brkF || 0.6) * 100, 0)}% 前轴) 触发后轮先抱死，易制动甩尾`;
      if (sw && sw.bestBias != null) msg += `；扫描推荐安全最优前轴比 brkF=${fmt(sw.bestBias, 2)} (${fmt(sw.safeBestDistM, 1)}m)。`;
      insights.push(msg);
    }

    if (rep.fsae && !rep.fsae.skipped) {
      const f = rep.fsae;
      insights.push(`[FSAE 动态赛实测] 总分 ${fmt(f.total275, 1)} / 275.0 (75m 加速 ${fmt(f.accel && f.accel.finalTime, 3)}s/${fmt(f.accel && f.accel.pts, 1)}分 · 八字绕环 ${fmt(f.skidpad && f.skidpad.finalTime, 3)}s/${fmt(f.skidpad && f.skidpad.pts, 1)}分 · FSG 单圈 ${fmt(f.autocrossFsg && f.autocrossFsg.finalTime, 2)}s/${fmt(f.autocrossFsg && f.autocrossFsg.pts, 1)}分)。`);
    }

    return insights;
  }

  /* --------------------------------------------------------------------------
   * 10. 生成 AI 友好 Markdown 终极报告
   * -------------------------------------------------------------------------- */
  function toMarkdown(rep) {
    if (!rep) return "";
    const v = rep.vehicle || {};
    const sk = rep.staticKC || {};
    const L = [];

    L.push(`# LABSUS 整车悬架与动力学终极全量分析报告`);
    L.push(`> 生成时间: ${rep.generatedAt} | 测试总耗时: ${(rep.elapsedMs / 1000).toFixed(2)} s | 车型平台: **${v.vehicleName}** (\`${v.vehicleType}\`)`);
    L.push(``);
    L.push(`## 🤖 给 AI 工程助手的提示词（可直接整份粘贴分析）`);
    L.push(`请基于以下完整的 LABSUS 15-DOF 多体动力学、K&C 运动学、台架测试与 FSAE/赛道闭环实测数据，从**机械平衡、悬架硬点几何、刚度阻尼匹配、制动分配与圈速瓶颈**五个维度给出具体可落地的定量调校方案（精确到弹簧刚度 N/mm、ARB 直径 mm、brkF、前后硬点 Z/Y 微调 mm）：`);
    L.push(``);

    L.push(`## 0. 自动工程诊断摘要`);
    for (const s of (rep.insights || [])) L.push(`- ${s}`);
    L.push(``);

    L.push(`## 1. 整车与悬架基准参数`);
    L.push(`| 参数 | 数值 | 参数 | 数值 |`);
    L.push(`|---|---|---|---|`);
    L.push(`| 整车总质量 / 簧载质量 | ${fmt(v.mTotalKg, 0)} / ${fmt(v.mSprungKg, 0)} kg | 轴距 / 前后轮距 | ${fmt(v.wbMm, 0)} / ${fmt(v.trackFrontMm, 0)} / ${fmt(v.trackRearMm, 0)} mm |`);
    L.push(`| 质心高 hcg / 簧载质心高 hs | ${fmt(v.hcgMm, 0)} / ${fmt(v.hsMm, 0)} mm | 前轴制动分配比 brkF | ${fmt(v.brkF, 2)} |`);
    L.push(`| 前悬架 (${v.front && v.front.arch}) | kS=${fmt(v.front && v.front.kSNmm, 0)} N/mm, cR=${fmt(v.front && v.front.cRNsmm, 1)} Ns/mm, ARB=${fmt(v.front && v.front.arbMm, 1)} mm | 后悬架 (${v.rear && v.rear.arch}) | kS=${fmt(v.rear && v.rear.kSNmm, 0)} N/mm, cR=${fmt(v.rear && v.rear.cRNsmm, 1)} Ns/mm, ARB=${fmt(v.rear && v.rear.arbMm, 1)} mm |`);
    L.push(`| 前轮胎 (${fmt(v.front && v.front.tire && v.front.tire.W, 0)}mm, R=${fmt(v.front && v.front.tire && v.front.tire.R, 0)}mm) | Fy0=${fmt(v.front && v.front.tire && v.front.tire.Fy0, 0)}N / FzNom=${fmt(v.front && v.front.tire && v.front.tire.FzNom, 0)}N / LS=${fmt(v.front && v.front.tire && v.front.tire.LS, 2)} | 动力架构 | ${v.powertrain ? `${v.powertrain.architecture} / ${v.powertrain.drive} / diff=${v.powertrain.diffType}` : "内置等效力矩模型"} |`);
    L.push(``);

    L.push(`## 2. 静态运动学 K&C 与 21 项红绿灯评分（综合 ${fmt(sk.overallScore, 0)} / 100，🟢${sk.counts.good} 🟡${sk.counts.warn} 🔴${sk.counts.bad}）`);
    if (sk.dimScores) {
      L.push(`- **六维分项**：` + Object.entries(sk.dimScores).map(([k, val]) => `${k}: **${val}**`).join(" · "));
    }
    if (sk.quasiStatic) {
      const qs = sk.quasiStatic;
      L.push(`- **准静态平衡** (gy=${fmt(qs.gyG, 2)}g, gx=${fmt(qs.gxG, 2)}g): 侧倾角 \`${fmt(qs.rollDeg, 2)}°\`, 侧倾梯度 \`${fmt(qs.rollGradDegPerG, 2)} °/g\`, TLLTD \`${fmt(qs.tlltdPct, 1)}%\`, 不足转向梯度 \`${fmt(qs.usGradDegPerG, 2)} °/g\`, 前/后侧偏角 \`${fmt(qs.alphaFDeg, 2)}° / ${fmt(qs.alphaRDeg, 2)}°\`, 四轮载荷 FL/FR/RL/RR = \`${qs.fz ? [qs.fz.FL, qs.fz.FR, qs.fz.RL, qs.fz.RR].map(x => fmt(x, 0)).join("/") : "—"} N\``);
    }
    L.push(``);
    L.push(`| 指标 | 实测值 | 单位 | 目标带 | 评级 |`);
    L.push(`|---|---|---|---|---|`);
    for (const k of (sk.kpis || [])) {
      const icon = k.grade === "good" ? "🟢 good" : (k.grade === "bad" ? "🔴 bad" : "🟡 warn");
      L.push(`| ${k.name} | ${k.formatted} | ${k.unit} | ${k.target} | ${icon} |`);
    }
    L.push(``);

    if (rep.ride && !rep.ride.skipped) {
      const r = rep.ride;
      L.push(`## 3. 垂向平顺性与模态台架 (RIDE_BENCH)`);
      L.push(`| 测试项目 | 关键实测指标 |`);
      L.push(`|---|---|`);
      if (r.step) L.push(`| 5mm 阶跃响应 | T63=${fmt(r.step.t63Ms, 0)} ms · 超调=${fmt(r.step.overshootPct, 1)}% · 稳定时间=${fmt(r.step.settleMs, 0)} ms · 峰值=${fmt(r.step.peakMm, 2)} mm |`);
      if (r.sweep) L.push(`| 2~15Hz 正弦扫频 | 共振峰频=${fmt(r.sweep.peakFreqHz, 1)} Hz · 峰值传递率=${fmt(r.sweep.peakTrans, 2)}x · 等效阻尼比 ζ=${fmt(r.sweep.zeta, 3)} |`);
      if (r.impulse) L.push(`| 10mm 短脉冲冲击 | 峰数=${fmt(r.impulse.peakCount, 0)} · 衰减至5%时间=${fmt(r.impulse.decayTo5PctMs, 0)} ms · 前后段RMS比=${fmt(r.impulse.decayRatio, 3)} |`);
      if (r.randomIsoC60kmh) L.push(`| ISO 8608 C 级路 (60km/h) | 车身垂向 RMS=${fmt(r.randomIsoC60kmh.bodyRmsMm, 2)} mm (峰值 ${fmt(r.randomIsoC60kmh.bodyPeakMm, 1)} mm) · 轮荷动载 RMS=${fmt(r.randomIsoC60kmh.loadRmsN, 0)} N |`);
      if (r.freeDecayNoDamp) L.push(`| 去阻尼自由衰减 | 主固有频率=${fmt(r.freeDecayNoDamp.dominantFreqHz, 2)} Hz · 峰值=${fmt(r.freeDecayNoDamp.peakAmpMm, 2)} mm |`);
      L.push(``);
    }

    if (rep.lateral && !rep.lateral.skipped) {
      const la = rep.lateral;
      L.push(`## 4. 横向操稳与侧倾特性 (LAT_BENCH & 极限定圆)`);
      L.push(`- **稳态定圆 (14m/s, 5°舵角)**: ay=${fmt(la.steadyCircle14ms5deg && la.steadyCircle14ms5deg.ayG, 3)} g, 侧倾 φ=${fmt(la.steadyCircle14ms5deg && la.steadyCircle14ms5deg.phiDeg, 2)}°, 半径 R=${fmt(la.steadyCircle14ms5deg && la.steadyCircle14ms5deg.radius, 2)} m, 实测 TLLTD=${fmt((la.steadyCircle14ms5deg && la.steadyCircle14ms5deg.tlltd) * 100, 1)}%`);
      L.push(`- **多车速侧倾梯度**: \`${fmt(la.rollGradientDegPerG, 3)} °/g\``);
      if (la.steerStep) L.push(`- **阶跃转向瞬态 (16m/s, 4°)**: 横摆上升时间=${fmt(la.steerStep.riseTimeMs, 0)} ms, 超调=${fmt(la.steerStep.overshootPct, 1)}%, 稳态侧倾=${fmt(la.steerStep.phiSSDeg, 2)}°`);
      if (la.analyticRollStiffness) {
        const an = la.analyticRollStiffness;
        L.push(`- **解析侧倾刚度拆分**: 总侧倾刚度=${fmt(an.KrollNmRad, 0)} N·m/rad (弹簧 ${fmt(an.KrollSpringNmRad, 0)} / ARB ${fmt(an.KrollArbNmRad, 0)}, 前轴 ${fmt(an.KrollFrontNmRad, 0)} / 后轴 ${fmt(an.KrollRearNmRad, 0)})`);
      }
      if (la.skidpadLimit) L.push(`- **定圆极限扫速**: 峰值侧向加速度=${fmt(la.skidpadLimit.peakAyG, 3)} g @ ${fmt(la.skidpadLimit.speedAtPeak, 0)} m/s (R=${fmt(la.skidpadLimit.radiusAtPeak, 1)} m, 触及极限=${la.skidpadLimit.reachedLimit ? "是" : "否"})`);
      L.push(``);
    }

    if (rep.longitudinal && !rep.longitudinal.skipped) {
      const lo = rep.longitudinal;
      L.push(`## 5. 纵向加减速与制动分配 (LONG_BENCH)`);
      if (lo.accel75m) L.push(`- **75m 起步加速**: 用时=${fmt(lo.accel75m.timeSec, 3)} s, 尾速=${fmt(lo.accel75m.vEndKmh, 1)} km/h, 峰值 ax=${fmt(lo.accel75m.peakAxG, 2)} g, 最大后蹲角=${fmt(lo.accel75m.maxSquatDeg, 2)}°`);
      if (lo.brake100kmh) L.push(`- **100→0 km/h 制动**: 制动距离=${fmt(lo.brake100kmh.stopDistM, 2)} m (${fmt(lo.brake100kmh.stopTimeSec, 2)} s), 峰值减速度=${fmt(lo.brake100kmh.peakDecelG, 2)} g, 点头角=${fmt(lo.brake100kmh.maxDiveDeg, 2)}°, 抱死状态=前(${lo.brake100kmh.lockupFront ? "锁" : "稳"})/后(${lo.brake100kmh.lockupRear ? "锁" : "稳"}), 首次抱死=${lo.brake100kmh.firstLockup}`);
      if (lo.brakeBiasSweep) L.push(`- **制动分配比扫描**: 推荐安全最优前轴分配 \`brkF=${fmt(lo.brakeBiasSweep.bestBias, 2)}\` (最短安全距离 ${fmt(lo.brakeBiasSweep.safeBestDistM, 2)} m)`);
      L.push(``);
    }

    if (rep.capability && !rep.capability.skipped) {
      const cp = rep.capability;
      L.push(`## 6. 整车 G-G 能力包络 (CAR_CAPABILITY)`);
      L.push(`- **最大稳态侧向抓地**: \`${fmt(cp.ayMaxG, 3)} g\` | **制动峰值减速度**: \`${fmt((cp.brakePeakMs2 || 0) / 9.81, 2)} g\` (${fmt(cp.brakePeakMs2, 2)} m/s²) | **起步峰值加速**: \`${fmt((cp.accelPeakMs2 || 0) / 9.81, 2)} g\` (${fmt(cp.accelPeakMs2, 2)} m/s²)`);
      L.push(``);
    }

    if (rep.fsae && !rep.fsae.skipped) {
      const f = rep.fsae;
      L.push(`## 7. 大学生方程式动态赛组合实测 (FSAE / FSC 275分制)`);
      L.push(`| 项目 | 净成绩 | 撞桶(DOO) | 罚后最终成绩 | 官方得分 | 备注 |`);
      L.push(`|---|---|---|---|---|---|`);
      if (f.accel) L.push(`| ⚡ 75m 直线加速 | ${fmt(f.accel.rawTime, 3)} s | ${f.accel.coneHits || 0} | ${fmt(f.accel.finalTime, 3)} s | **${fmt(f.accel.pts, 1)} / 100** | 尾速 ${fmt(f.accel.trapKmh, 1)} km/h · 制动 ${fmt(f.accel.brakeDistM, 1)} m |`);
      if (f.skidpad) L.push(`| ∞ 八字绕环 | ${fmt(f.skidpad.rawTime, 3)} s | ${f.skidpad.coneHits || 0} | ${fmt(f.skidpad.finalTime, 3)} s | **${fmt(f.skidpad.pts, 1)} / 75** | 右 ${fmt(f.skidpad.tRight, 2)}s / 左 ${fmt(f.skidpad.tLeft, 2)}s · ay=${fmt(f.skidpad.peakAyG, 2)}g |`);
      if (f.autocrossFsg) L.push(`| 🏁 单圈赛 (FSG 306m) | ${fmt(f.autocrossFsg.rawTime, 2)} s | ${f.autocrossFsg.coneHits || 0} | ${fmt(f.autocrossFsg.finalTime, 2)} s | **${fmt(f.autocrossFsg.pts, 1)} / 100** | 峰值侧偏 ${fmt(f.autocrossFsg.maxBetaDeg, 1)}° |`);
      if (f.autocrossFsc) L.push(`| 🇨🇳 FSC 标准单圈 (744m) | ${fmt(f.autocrossFsc.rawTime, 2)} s | ${f.autocrossFsc.coneHits || 0} | ${fmt(f.autocrossFsc.finalTime, 2)} s | ${fmt(f.autocrossFsc.pts, 1)} / 100 | 峰值侧偏 ${fmt(f.autocrossFsc.maxBetaDeg, 1)}° |`);
      L.push(`- **FSAE 三项动态总分**: **${fmt(f.total275, 1)} / 275.0**`);
      L.push(``);
    }

    if (rep.tracks) {
      L.push(`## 8. 试验场工况与上海赛道评估`);
      for (const pg of (rep.tracks.provingGround || [])) {
        L.push(`- **${pg.name}**: ay=${fmt(pg.maxAyG, 2)}g · 侧倾=${fmt(pg.maxRollDeg, 1)}° · 最大侧偏=${fmt(pg.maxBetaDeg, 1)}° · 撞桶=${pg.coneHits} · ${pg.spinFree ? "✅ 稳定无失控" : "⚠️ 侧偏过大"}`);
      }
      if (rep.tracks.shanghaiEnvelope) {
        const se = rep.tracks.shanghaiEnvelope;
        L.push(`- **上海赛道 (5.45km) 理论包络**: 全长 ${fmt(se.lengthM, 0)}m · 理论极限圈速 **${fmt(se.theoreticalLapSec, 2)} s** · 最高预测极速 ${fmt(se.topSpeedKmh, 1)} km/h`);
      }
      if (rep.tracks.shanghaiFullLap) {
        const fl = rep.tracks.shanghaiFullLap;
        L.push(`- **上海赛道 15-DOF 实跑**: ${fl.completed ? `✅ 完赛 ${fmt(fl.lapTimeSec, 2)} s` : "未完成全圈"} · 极速 ${fmt(fl.topSpeedKmh, 1)} km/h · 峰值 ay=${fmt(fl.peakAyG, 2)} g · 出界=${fl.offTrackSamples}`);
      }
      L.push(``);
    }

    if (v.front && v.front.hp && v.rear && v.rear.hp) {
      L.push(`## 9. 悬架硬点坐标（mm，供结构/几何精修对照）`);
      L.push(`- **前轴硬点**: \`${JSON.stringify(v.front.hp)}\``);
      L.push(`- **后轴硬点**: \`${JSON.stringify(v.rear.hp)}\``);
    }

    return L.join("\n");
  }

  /* --------------------------------------------------------------------------
   * 11. 主流程：分步异步执行所有分析并更新进度
   * -------------------------------------------------------------------------- */
  async function runAll(opts) {
    if (_busy) return _lastReport;
    _busy = true;
    _cancelFlag = false;
    const o = Object.assign({
      includeFsae: true,
      includeFsc: false,
      includeProving: true,
      includeShanghaiLap: false,
      onProgress: null
    }, opts || {});

    const reportProgress = (pct, text) => {
      if (typeof o.onProgress === "function") {
        try { o.onProgress(pct, text); } catch (e) {}
      }
      updateModalProgress(pct, text);
    };

    const tStart = (typeof performance !== "undefined") ? performance.now() : Date.now();
    const report = {
      schema: "LABSUS_ULTIMATE_REPORT_V1",
      generatedAt: new Date().toISOString(),
      elapsedMs: 0,
      vehicle: null,
      staticKC: null,
      ride: null,
      lateral: null,
      longitudinal: null,
      capability: null,
      fsae: { skipped: true },
      tracks: null,
      insights: []
    };

    try {
      reportProgress(5, "1/8 采集整车参数与硬点基准...");
      await _tick();
      report.vehicle = collectVehicleSnapshot();

      reportProgress(15, "2/8 求解静态 K&C、准静态平衡与 21 项指标...");
      await _tick();
      report.staticKC = collectStaticKC();

      reportProgress(28, "3/8 运行垂向平顺性与扫频模态台架...");
      await _tick();
      report.ride = collectRideBench();

      reportProgress(44, "4/8 运行横向稳态定圆与侧倾梯度台架...");
      await _tick();
      report.lateral = collectLatBench();

      reportProgress(58, "5/8 运行纵向加减速与制动力分配扫描...");
      await _tick();
      report.longitudinal = collectLongBench();

      reportProgress(70, "6/8 测绘整车 G-G 动力学极限包络...");
      await _tick();
      report.capability = collectCapability();

      if (o.includeFsae && !_cancelFlag) {
        reportProgress(80, "7/8 跑通 FSAE 三项动态赛（75m 加速 / 八字绕环 / 单圈赛）...");
        await _tick();
        report.fsae = await collectFsaeArena({ includeFsc: !!o.includeFsc });
      }

      if (o.includeProving && !_cancelFlag) {
        reportProgress(92, o.includeShanghaiLap ? "8/8 运行试验场极限工况与上海赛道闭环..." : "8/8 运行试验场极限工况与上海赛道包络...");
        await _tick();
        report.tracks = await collectProvingAndCircuit({ includeShanghaiLap: !!o.includeShanghaiLap });
      }

      report.elapsedMs = ((typeof performance !== "undefined") ? performance.now() : Date.now()) - tStart;
      report.insights = buildEngineeringInsights(report);
      report.markdown = toMarkdown(report);
      _lastReport = report;
      reportProgress(100, `✅ 全量分析完成（耗时 ${(report.elapsedMs / 1000).toFixed(2)} s）`);
      renderModalContent(report);
      return report;
    } finally {
      _busy = false;
    }
  }

  /* --------------------------------------------------------------------------
   * 12. 一键全量分析模态弹窗 UI（自动注入样式与 DOM，兼容 v4 与 fullchassis 双入口）
   * -------------------------------------------------------------------------- */
  function ensureStylesAndModal() {
    if (typeof document === "undefined") return null;
    if (!document.getElementById("fullReportStyle")) {
      const st = document.createElement("style");
      st.id = "fullReportStyle";
      st.textContent = `
        .fr-backdrop{position:fixed;inset:0;z-index:100000;background:rgba(5,9,16,0.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:20px;font-family:var(--font-ui,Inter,sans-serif);color:#e6edf3}
        .fr-backdrop.show{display:flex}
        .fr-box{width:min(1180px,96vw);height:min(860px,92vh);background:#0d1117;border:1px solid #30363d;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 72px rgba(0,0,0,0.65)}
        .fr-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#161b22;border-bottom:1px solid #30363d;flex-wrap:wrap}
        .fr-title{font-size:15px;font-weight:800;color:#f0f6fc;display:flex;align-items:center;gap:8px}
        .fr-opts{display:flex;align-items:center;gap:10px;font-size:11.5px;color:#8b949e;flex-wrap:wrap}
        .fr-opts label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:#c9d1d9}
        .fr-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .fr-btn{background:#21262d;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
        .fr-btn:hover{background:#30363d}
        .fr-btn.pri{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:#60a5fa;color:#fff}
        .fr-btn.ai{background:#059669;border-color:#34d399;color:#fff}
        .fr-btn.cls{background:rgba(248,81,73,0.15);border-color:rgba(248,81,73,0.45);color:#ff7b72}
        .fr-prog-wrap{padding:8px 18px;background:#0d1117;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}
        .fr-prog-bar{flex:1;height:8px;background:#21262d;border-radius:999px;overflow:hidden}
        .fr-prog-fill{height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#10b981);transition:width .2s ease}
        .fr-prog-txt{font-size:11.5px;color:#7ee787;font-family:monospace;min-width:280px}
        .fr-tabs{display:flex;gap:6px;padding:8px 18px;background:#161b22;border-bottom:1px solid #30363d}
        .fr-tab{background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer}
        .fr-tab.on{background:#1f6feb;border-color:#58a6ff;color:#fff}
        .fr-body{flex:1;min-height:0;overflow-y:auto;padding:16px 20px}
        .fr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-bottom:14px}
        .fr-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 14px}
        .fr-card h4{margin:0 0 8px 0;font-size:12.5px;color:#79c0ff;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px}
        .fr-kv{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;color:#8b949e;font-family:monospace;gap:8px}
        .fr-kv b{color:#e6edf3;text-align:right}
        .fr-insight{background:rgba(56,139,253,0.1);border-left:3px solid #58a6ff;padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.55;margin-bottom:6px;color:#e6edf3}
        .fr-pre{width:100%;height:100%;min-height:460px;background:#010409;border:1px solid #30363d;border-radius:8px;padding:14px;color:#c9d1d9;font:12px/1.55 monospace;resize:none;box-sizing:border-box}
      `;
      document.head.appendChild(st);
    }

    let modal = document.getElementById("fullReportModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "fullReportModal";
      modal.className = "fr-backdrop";
      modal.innerHTML = `
        <div class="fr-box">
          <div class="fr-hd">
            <div class="fr-title">🚀 一键全量分析与终极数据报告</div>
            <div class="fr-opts">
              <label><input type="checkbox" id="frOptFsae" checked> 含 FSAE 三项赛</label>
              <label><input type="checkbox" id="frOptFsc"> 含 FSC 744m</label>
              <label><input type="checkbox" id="frOptProving" checked> 含试验场快检</label>
              <label><input type="checkbox" id="frOptShanghai"> 含上海赛道实跑(耗时+25s)</label>
            </div>
            <div class="fr-actions">
              <button class="fr-btn pri" id="frRunBtn">▶ 重新全面分析</button>
              <button class="fr-btn ai" id="frCopyAiBtn">🤖 复制 AI 完整提示词报告</button>
              <button class="fr-btn" id="frExportMdBtn">📄 导出 .md</button>
              <button class="fr-btn" id="frExportJsonBtn">📦 导出 .json</button>
              <button class="fr-btn cls" id="frCloseBtn">✖ 关闭</button>
            </div>
          </div>
          <div class="fr-prog-wrap">
            <div class="fr-prog-bar"><div class="fr-prog-fill" id="frProgFill"></div></div>
            <div class="fr-prog-txt" id="frProgTxt">准备就绪</div>
          </div>
          <div class="fr-tabs">
            <button class="fr-tab on" data-frtab="summary">📊 工程诊断总览</button>
            <button class="fr-tab" data-frtab="markdown">🤖 AI Markdown 原文</button>
            <button class="fr-tab" data-frtab="json">📦 完整 JSON 数据</button>
          </div>
          <div class="fr-body" id="frBody"></div>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelector("#frCloseBtn").onclick = closeModal;
      modal.querySelector("#frRunBtn").onclick = () => runFromUI();
      modal.querySelector("#frCopyAiBtn").onclick = () => copyMarkdown();
      modal.querySelector("#frExportMdBtn").onclick = () => downloadText("md");
      modal.querySelector("#frExportJsonBtn").onclick = () => downloadText("json");
      modal.querySelectorAll(".fr-tab").forEach(btn => {
        btn.onclick = () => {
          _activeTab = btn.dataset.frtab;
          modal.querySelectorAll(".fr-tab").forEach(x => x.classList.toggle("on", x === btn));
          if (_lastReport) renderModalContent(_lastReport);
        };
      });
    }
    return modal;
  }

  function updateModalProgress(pct, text) {
    if (typeof document === "undefined") return;
    const fill = document.getElementById("frProgFill");
    const txt = document.getElementById("frProgTxt");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (txt) txt.textContent = text;
  }

  function renderModalContent(rep) {
    if (typeof document === "undefined" || !rep) return;
    const body = document.getElementById("frBody");
    if (!body) return;

    if (_activeTab === "markdown") {
      body.innerHTML = `<textarea class="fr-pre" readonly>${(rep.markdown || "").replace(/</g, "&lt;")}</textarea>`;
      return;
    }
    if (_activeTab === "json") {
      const clean = Object.assign({}, rep);
      delete clean.markdown;
      body.innerHTML = `<textarea class="fr-pre" readonly>${JSON.stringify(clean, null, 2).replace(/</g, "&lt;")}</textarea>`;
      return;
    }

    const v = rep.vehicle || {}, sk = rep.staticKC || {}, r = rep.ride || {}, la = rep.lateral || {}, lo = rep.longitudinal || {}, cp = rep.capability || {}, f = rep.fsae || {};
    const insHtml = (rep.insights || []).map(s => `<div class="fr-insight">${s.replace(/</g, "&lt;")}</div>`).join("");
    const kv = (k, val) => `<div class="fr-kv"><span>${k}</span><b>${val}</b></div>`;

    body.innerHTML = `
      <div style="margin-bottom:14px;">${insHtml}</div>
      <div class="fr-grid">
        <div class="fr-card">
          <h4>🏎️ 车型与 K&C 静态总评</h4>
          ${kv("车型平台", `${v.vehicleName} (${v.vehicleType})`)}
          ${kv("总质量 / 簧载 / 轴距", `${fmt(v.mTotalKg, 0)}kg / ${fmt(v.mSprungKg, 0)}kg / ${fmt(v.wbMm, 0)}mm`)}
          ${kv("K&C 综合评分", `${fmt(sk.overallScore, 0)} / 100 (🟢${sk.counts.good} 🟡${sk.counts.warn} 🔴${sk.counts.bad})`)}
          ${kv("准静态 TLLTD / 侧倾梯度", `${fmt(sk.quasiStatic && sk.quasiStatic.tlltdPct, 1)}% / ${fmt(sk.quasiStatic && sk.quasiStatic.rollGradDegPerG, 2)} °/g`)}
          ${kv("不足转向梯度", `${fmt(sk.quasiStatic && sk.quasiStatic.usGradDegPerG, 2)} °/g`)}
        </div>
        <div class="fr-card">
          <h4>🌊 垂向平顺性与模态台架</h4>
          ${kv("阶跃 T63 / 超调", `${fmt(r.step && r.step.t63Ms, 0)} ms / ${fmt(r.step && r.step.overshootPct, 1)}%`)}
          ${kv("扫频共振峰 / 传递率", `${fmt(r.sweep && r.sweep.peakFreqHz, 1)} Hz / ${fmt(r.sweep && r.sweep.peakTrans, 2)}x`)}
          ${kv("扫频等效阻尼比 ζ", fmt(r.sweep && r.sweep.zeta, 3))}
          ${kv("ISO-C 车身 RMS (60km/h)", `${fmt(r.randomIsoC60kmh && r.randomIsoC60kmh.bodyRmsMm, 2)} mm`)}
          ${kv("去阻尼主频", `${fmt(r.freeDecayNoDamp && r.freeDecayNoDamp.dominantFreqHz, 2)} Hz`)}
        </div>
        <div class="fr-card">
          <h4>🌀 横向与纵向台架</h4>
          ${kv("定圆极限峰值 ay", `${fmt(la.skidpadLimit && la.skidpadLimit.peakAyG, 3)} g`)}
          ${kv("实测多车速侧倾梯度", `${fmt(la.rollGradientDegPerG, 3)} °/g`)}
          ${kv("阶跃转向超调 / 上升", `${fmt(la.steerStep && la.steerStep.overshootPct, 1)}% / ${fmt(la.steerStep && la.steerStep.riseTimeMs, 0)} ms`)}
          ${kv("100→0 km/h 制动距离", `${fmt(lo.brake100kmh && lo.brake100kmh.stopDistM, 2)} m (推荐 brkF=${fmt(lo.brakeBiasSweep && lo.brakeBiasSweep.bestBias, 2)})`)}
          ${kv("能力包络 (ay / brk / acc)", `${fmt(cp.ayMaxG, 2)}g / ${fmt((cp.brakePeakMs2 || 0) / 9.81, 2)}g / ${fmt((cp.accelPeakMs2 || 0) / 9.81, 2)}g`)}
        </div>
        <div class="fr-card">
          <h4>🏆 FSAE 赛场 & 赛道评估</h4>
          ${f.skipped ? kv("FSAE 三项赛", "已跳过") : (
            kv("75m 直线加速", `${fmt(f.accel && f.accel.finalTime, 3)}s (${fmt(f.accel && f.accel.pts, 1)} / 100)`) +
            kv("八字绕环 Skidpad", `${fmt(f.skidpad && f.skidpad.finalTime, 3)}s (${fmt(f.skidpad && f.skidpad.pts, 1)} / 75)`) +
            kv("FSG 单圈 Autocross", `${fmt(f.autocrossFsg && f.autocrossFsg.finalTime, 2)}s (${fmt(f.autocrossFsg && f.autocrossFsg.pts, 1)} / 100)`) +
            kv("FSAE 组合总分", `${fmt(f.total275, 1)} / 275.0`)
          )}
          ${rep.tracks && rep.tracks.shanghaiEnvelope ? kv("上海赛道包络圈速", `${fmt(rep.tracks.shanghaiEnvelope.theoreticalLapSec, 2)} s`) : ""}
        </div>
      </div>
    `;
  }

  function openAndRun() {
    const modal = ensureStylesAndModal();
    if (!modal) return;
    modal.classList.add("show");
    runFromUI();
  }

  function runFromUI() {
    const g = id => { const el = document.getElementById(id); return el ? !!el.checked : false; };
    runAll({
      includeFsae: document.getElementById("frOptFsae") ? g("frOptFsae") : true,
      includeFsc: g("frOptFsc"),
      includeProving: document.getElementById("frOptProving") ? g("frOptProving") : true,
      includeShanghaiLap: g("frOptShanghai")
    });
  }

  function closeModal() {
    _cancelFlag = true;
    const modal = document.getElementById("fullReportModal");
    if (modal) modal.classList.remove("show");
  }

  function copyMarkdown() {
    if (!_lastReport || !_lastReport.markdown) return;
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_lastReport.markdown).then(() => {
        updateModalProgress(100, "📋 已复制完整 AI 提示词报告到剪贴板！可直接粘贴给 AI");
      }).catch(() => {});
    }
  }

  function downloadText(ext) {
    if (!_lastReport || typeof document === "undefined") return;
    const isJson = (ext === "json");
    const clean = isJson ? Object.assign({}, _lastReport) : null;
    if (clean) delete clean.markdown;
    const content = isJson ? JSON.stringify(clean, null, 2) : (_lastReport.markdown || "");
    const blob = new Blob([content], { type: isJson ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `LABSUS_FullReport_${(_lastReport.vehicle && _lastReport.vehicle.vehicleType) || "car"}_${Date.now()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function bindTopButton() {
    if (typeof document === "undefined") return;
    const btn = document.getElementById("fullReportBtn");
    if (btn) btn.onclick = openAndRun;
  }

  const api = {
    runAll,
    openAndRun,
    closeModal,
    toMarkdown,
    getLastReport: () => _lastReport
  };

  global.FULL_REPORT = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindTopButton);
    else bindTopButton();
  }
})(typeof window !== "undefined" ? window : globalThis);
