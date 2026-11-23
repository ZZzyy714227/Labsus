(function (global) {
  "use strict";

  /* ================================
     23. 纵向加减速与制动台架（Longitudinal Accel & Braking Bench）
     基于 15-DOF VehicleDynamics15DOF（强制开启 S.pitchInertia 纵倾惯性耦合），
     提供 75m 起步加速、100→0 km/h 制动距离/点头/抱死裕度与 Brake-Bias 扫掠。
     ================================ */

  const ENV_FLAT = { grade: 0, path: null, bumpNoise: 0 };
  const G = 9.81;

  let _lastResult = null;

  function simRef() {
    return (typeof SIM !== "undefined") ? SIM : undefined;
  }

  function settleEngine(eng, dt, secs) {
    const n = Math.round((secs || 0.25) / dt);
    for (let i = 0; i < n; i++) {
      eng.step({ throttle: 0, brake: 0, steer: 0, drs: false }, ENV_FLAT, dt);
    }
  }

  function accelTest(opts) {
    const o = opts || {};
    if (typeof VehicleDynamics15DOF !== "function") {
      throw new Error("LONG_BENCH.accelTest requires VehicleDynamics15DOF");
    }
    const distTarget = Math.max(10, o.distM || 75);
    const dt = o.dt || (1 / 240);
    const maxSecs = o.maxSecs || 12.0;
    const throttle = o.throttle != null ? o.throttle : 1.0;

    const prevPitch = S.pitchInertia;
    S.pitchInertia = true;
    try {
      const eng = new VehicleDynamics15DOF(S, simRef(), 0.5);
      settleEngine(eng, dt, 0.25);

      const y0 = eng.state.Y;
      const u0 = eng.state.u;
      const fzF0 = eng.telemetry ? (eng.telemetry.Fz.FL + eng.telemetry.Fz.FR) : (S.mTotal * G * 0.5);
      const maxSteps = Math.round(maxSecs / dt);
      const stride = Math.max(1, Math.round(0.05 / dt));
      const trace = [];

      let peakAxG = 0, maxSquatDeg = 0, minFzFrontN = Infinity, maxFzRearN = 0;
      let tEnd = 0, reached = false;

      for (let i = 0; i < maxSteps; i++) {
        eng.step({ throttle: throttle, brake: 0, steer: 0, drs: false }, ENV_FLAT, dt);
        tEnd = (i + 1) * dt;
        const dist = eng.state.Y - y0;
        const tel = eng.telemetry || {};
        const pitchDeg = (eng.state.theta || 0) * 180 / Math.PI;
        const fz = tel.Fz || { FL: 0, FR: 0, RL: 0, RR: 0 };
        const fzF = fz.FL + fz.FR, fzR = fz.RL + fz.RR;

        if ((tel.ax || 0) > peakAxG) peakAxG = tel.ax;
        if (pitchDeg > maxSquatDeg) maxSquatDeg = pitchDeg;
        if (fzF < minFzFrontN) minFzFrontN = fzF;
        if (fzR > maxFzRearN) maxFzRearN = fzR;

        if (i % stride === 0) {
          trace.push({ t: Number(tEnd.toFixed(3)), dist: dist, vKmh: eng.state.u * 3.6, axG: tel.ax || 0, pitchDeg: pitchDeg });
        }
        if (dist >= distTarget) {
          reached = true;
          break;
        }
      }

      const distDone = eng.state.Y - y0;
      const avgAxG = tEnd > 1e-3 ? ((eng.state.u - u0) / tEnd) / G : 0;
      const res = {
        kind: "accel",
        distTargetM: distTarget,
        distActualM: Number(distDone.toFixed(2)),
        reached: reached,
        timeSec: Number(tEnd.toFixed(3)),
        vEndKmh: Number((eng.state.u * 3.6).toFixed(2)),
        peakAxG: Number(peakAxG.toFixed(3)),
        avgAxG: Number(avgAxG.toFixed(3)),
        maxSquatDeg: Number(maxSquatDeg.toFixed(3)),
        frontLoadDropN: Number(Math.max(0, fzF0 - minFzFrontN).toFixed(1)),
        minFzFrontN: Number(minFzFrontN.toFixed(1)),
        maxFzRearN: Number(maxFzRearN.toFixed(1)),
        trace: trace,
      };
      _lastResult = res;
      return res;
    } finally {
      S.pitchInertia = prevPitch;
    }
  }

  function brakeTest(opts) {
    const o = opts || {};
    if (typeof VehicleDynamics15DOF !== "function") {
      throw new Error("LONG_BENCH.brakeTest requires VehicleDynamics15DOF");
    }
    const vStartKmh = Math.max(20, o.vStartKmh || 100);
    const pedal = Math.max(0.05, Math.min(1.0, o.pedal != null ? o.pedal : 0.95));
    const brakeBias = Math.max(0.3, Math.min(0.9, o.brakeBias != null ? o.brakeBias : (S.brkF || 0.62)));
    const dt = o.dt || (1 / 240);
    const maxSecs = o.maxSecs || 8.0;

    const prevPitch = S.pitchInertia;
    S.pitchInertia = true;
    try {
      const eng = new VehicleDynamics15DOF(S, simRef(), vStartKmh / 3.6);
      settleEngine(eng, dt, 0.25);

      const y0 = eng.state.Y;
      const uStart = eng.state.u;
      const maxSteps = Math.round(maxSecs / dt);
      const stride = Math.max(1, Math.round(0.05 / dt));
      const trace = [];

      let peakDecelG = 0, maxDiveDeg = 0, maxFzFrontN = 0, minFzRearN = Infinity;
      let lockupFront = false, lockupRear = false, firstLockup = null;
      let minKappaF = 0, minKappaR = 0;
      let tEnd = 0;

      for (let i = 0; i < maxSteps; i++) {
        eng.step({ throttle: 0, brake: pedal, brakeBias: brakeBias, steer: 0, drs: false }, ENV_FLAT, dt);
        tEnd = (i + 1) * dt;
        const dist = eng.state.Y - y0;
        const tel = eng.telemetry || {};
        const decelG = -(tel.ax || 0);
        const diveDeg = -((eng.state.theta || 0) * 180 / Math.PI);
        const fz = tel.Fz || { FL: 0, FR: 0, RL: 0, RR: 0 };
        const fzF = fz.FL + fz.FR, fzR = fz.RL + fz.RR;

        if (decelG > peakDecelG) peakDecelG = decelG;
        if (diveDeg > maxDiveDeg) maxDiveDeg = diveDeg;
        if (fzF > maxFzFrontN) maxFzFrontN = fzF;
        if (fzR < minFzRearN) minFzRearN = fzR;

        if (tel.kappa) {
          const kf = Math.min(tel.kappa.FL || 0, tel.kappa.FR || 0);
          const kr = Math.min(tel.kappa.RL || 0, tel.kappa.RR || 0);
          if (kf < minKappaF) minKappaF = kf;
          if (kr < minKappaR) minKappaR = kr;
        }
        if (eng.state.u > 2.0 && eng.state.omega) {
          const lF = eng.state.omega.FL <= 1.0 || eng.state.omega.FR <= 1.0;
          const lR = eng.state.omega.RL <= 1.0 || eng.state.omega.RR <= 1.0;
          if (lF) { lockupFront = true; if (!firstLockup) firstLockup = "front"; }
          if (lR) { lockupRear = true; if (!firstLockup) firstLockup = "rear"; }
        }

        if (i % stride === 0) {
          trace.push({ t: Number(tEnd.toFixed(3)), dist: dist, vKmh: eng.state.u * 3.6, decelG: decelG, diveDeg: diveDeg });
        }
        if (eng.state.u <= 0.3) break;
      }

      const rawDist = eng.state.Y - y0;
      // Scale distance cleanly if settle slightly shaved uStart below nominal vStartKmh
      const vNom = vStartKmh / 3.6;
      const stopDistM = uStart > 1.0 ? rawDist * ((vNom * vNom) / (uStart * uStart)) : rawDist;
      const avgDecelG = tEnd > 1e-3 ? ((uStart - eng.state.u) / tEnd) / G : 0;

      const res = {
        kind: "brake",
        vStartKmh: vStartKmh,
        pedal: pedal,
        brakeBias: brakeBias,
        stopDistM: Number(stopDistM.toFixed(2)),
        stopTimeSec: Number(tEnd.toFixed(3)),
        peakDecelG: Number(peakDecelG.toFixed(3)),
        avgDecelG: Number(avgDecelG.toFixed(3)),
        maxDiveDeg: Number(maxDiveDeg.toFixed(3)),
        maxFzFrontN: Number(maxFzFrontN.toFixed(1)),
        minFzRearN: Number(minFzRearN.toFixed(1)),
        lockupFront: lockupFront,
        lockupRear: lockupRear,
        firstLockup: firstLockup,
        minKappaF: Number(minKappaF.toFixed(3)),
        minKappaR: Number(minKappaR.toFixed(3)),
        trace: trace,
      };
      _lastResult = res;
      return res;
    } finally {
      S.pitchInertia = prevPitch;
    }
  }

  function brakeBiasSweep(opts) {
    const o = opts || {};
    const biases = Array.isArray(o.biases) && o.biases.length
      ? o.biases
      : [0.50, 0.55, 0.60, 0.65, 0.70, 0.75];
    const points = biases.map(b => brakeTest({
      vStartKmh: o.vStartKmh || 100,
      pedal: o.pedal != null ? o.pedal : 0.95,
      brakeBias: b,
      dt: o.dt || (1 / 240),
      maxSecs: o.maxSecs || 8.0,
    }));

    let bestAny = points[0], bestSafe = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.stopDistM < bestAny.stopDistM) bestAny = p;
      if (!p.lockupRear && (!bestSafe || p.stopDistM < bestSafe.stopDistM)) {
        bestSafe = p;
      }
    }
    const chosen = bestSafe || bestAny;
    const res = {
      kind: "brake_sweep",
      points: points,
      bestBias: chosen.brakeBias,
      minStopDistM: bestAny.stopDistM,
      safeBestDistM: chosen.stopDistM,
    };
    _lastResult = res;
    return res;
  }

  const api = {
    accelTest: accelTest,
    brakeTest: brakeTest,
    brakeBiasSweep: brakeBiasSweep,
    getLastResult: function () { return _lastResult; },
  };

  global.LONG_BENCH = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
