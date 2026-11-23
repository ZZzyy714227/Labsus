#!/usr/bin/env node
/**
 * Stage 3 · K&C 跨语言数学对拍（JS 03-mechanism.js ⇄ Python v3service / chassis）
 *
 * 覆盖四预设（formula / baja / gt3 / gt3_sport）across both pushrod and direct coilover:
 *   1. -40..+40 mm 9 点轮跳扫掠：cam / toe / rc_h / damper / mr（< 1e-4 级对齐）
 *   2. 空心/实心横向稳定杆刚度 arbRate(wall) ⇄ chassis.arb_rate（< 1e-6）
 *   3. 四角刚度矩阵模态审计 modalAuditJS() ⇄ chassis.modal_audit warp_rate & coupling_ratio（< 0.5%）
 *
 * 用法：
 *   node web/test/kc_parity.cjs --json   # 输出 JS 快照 JSON（供 pytest/test_kc_parity.py 消费）
 *   node web/test/kc_parity.cjs          # 自举调用 Python 引擎完成双端断言（check_all gate）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function collectJsSnapshots() {
  const ctx = vm.createContext({
    console, Math, Array, Object, Number, String, Boolean, JSON,
    Float64Array, Float32Array, Int32Array, Set, Map, Date, RegExp, Error,
    isFinite, isNaN, parseFloat, parseInt,
    performance: { now: () => Date.now() },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {}, appendChild: () => {}, setAttribute: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    }),
  };

  for (const f of ['01-core.js', '02-presets.js', '03-mechanism.js', '04-dynamics.js']) {
    const code = fs.readFileSync(path.join(ROOT, 'web', 'js', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }

  const out = {};
  for (const p of ['formula', 'baja', 'gt3', 'gt3_sport']) {
    vm.runInContext(`
      loadVehiclePreset(${JSON.stringify(p)});
      if (S.front.arb.d <= 0) { S.front.arb.d = 14; S.rear.arb.d = 12; }
      S.front.arb.wall = ${p === 'gt3' ? 3.5 : 2.0};
      SIM.FR = buildMech('front', 1); SIM.FL = buildMech('front', -1);
      SIM.RR = buildMech('rear', 1); SIM.RL = buildMech('rear', -1);
      refreshDerived();
    `, ctx);
    const snap = vm.runInContext(`({
      S_wb: S.wb, S_mTotal: S.mTotal, S_mSprung: S.mSprung, S_hcg: S.hcg, S_hs: S.hs,
      front: JSON.parse(JSON.stringify(S.front)),
      rear: JSON.parse(JSON.stringify(S.rear)),
      mrRefF: SIM.mrRefF, mrRefR: SIM.mrRefR,
      swF: runSweep(SIM.FR, 0, [-40, 40], 9, 'front').rows.map(r => ({ tr: r.tr, cam: r.cam, toe: r.toe, rcH: r.rcH, mr: r.mr, damper: r.damperL })),
      swR: runSweep(SIM.RR, 0, [-40, 40], 9, 'rear').rows.map(r => ({ tr: r.tr, cam: r.cam, toe: r.toe, rcH: r.rcH, mr: r.mr, damper: r.damperL })),
      arbF: arbRate(0.55, S.front),
      arbR: arbRate(0.55, S.rear),
      modal: modalAuditJS(),
    })`, ctx);
    out[p] = snap;
  }
  return out;
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(collectJsSnapshots()));
  process.exit(0);
}

// Standalone mode: verify JS snapshots directly against Python engine
const pyScript = `
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(${JSON.stringify(ROOT)}) / "engine"))
from src.api import chassis, v3models, v3service

data = json.loads(sys.stdin.read())
worst = {"cam": 0.0, "toe": 0.0, "rc": 0.0, "dmp": 0.0, "mr": 0.0, "arb": 0.0, "warp": 0.0, "couple": 0.0}
for name, d in data.items():
    f, r = d["front"], d["rear"]
    for side, ax_d, sw_rows in (("front", f, d["swF"]), ("rear", r, d["swR"])):
        req = v3models.KandcRequest(
            points=ax_d["hp"], arch=ax_d["arch"],
            sweep=v3models.SweepSpec(min=-40, max=40, n=9),
            design=v3models.DesignSpec(camber_deg=ax_d["cam0"], toe_deg=ax_d["toe0"]),
            tire_radius=ax_d["tire"]["R"], track_width=abs(ax_d["hp"]["WC"][0]) * 2,
        )
        res = v3service.run_bump(req)
        c = res.curves
        dc = max(abs(a - b) for a, b in zip(c["cam"], [x["cam"] for x in sw_rows]))
        dt = max(abs(a - b) for a, b in zip(c["toe"], [x["toe"] for x in sw_rows]))
        drc = max(abs(a - b) for a, b in zip(c["rc_h"], [x["rcH"] for x in sw_rows]))
        ddmp = max(abs(a - b) for a, b in zip(c["damper"], [x["damper"] for x in sw_rows]))
        dmr = max(abs(a - b) for a, b in zip(c["mr"], [x["mr"] for x in sw_rows]))
        worst["cam"] = max(worst["cam"], dc)
        worst["toe"] = max(worst["toe"], dt)
        worst["rc"] = max(worst["rc"], drc)
        worst["dmp"] = max(worst["dmp"], ddmp)
        worst["mr"] = max(worst["mr"], dmr)
        assert dc < 1e-4, f"{name}.{side} cam diff {dc}"
        assert dt < 1e-4, f"{name}.{side} toe diff {dt}"
        assert drc < 1e-3, f"{name}.{side} rc_h diff {drc}"
        assert ddmp < 1e-3, f"{name}.{side} damper diff {ddmp}"
        assert dmr < 1e-4, f"{name}.{side} mr diff {dmr}"
    ax = v3models.AxleSpec(
        points=f["hp"], arch=f["arch"], camber_deg=f["cam0"], toe_deg=f["toe0"],
        tire_radius=f["tire"]["R"], tire_rim_w=f["tire"].get("rimW", 178), tire_et=f["tire"].get("et", 20),
        tire_width=f["tire"]["W"], spring_rate=f["kS"], spring_mass_kg=f["mS"],
        unsprung_kg=f["mU"], motion_ratio=d["mrRefF"], arb=v3models.ArbSpec(**f["arb"]),
    )
    rax = v3models.AxleSpec(
        points=r["hp"], arch=r["arch"], camber_deg=r["cam0"], toe_deg=r["toe0"],
        tire_radius=r["tire"]["R"], tire_rim_w=r["tire"].get("rimW", 178), tire_et=r["tire"].get("et", 20),
        tire_width=r["tire"]["W"], spring_rate=r["kS"], spring_mass_kg=r["mS"],
        unsprung_kg=r["mU"], motion_ratio=d["mrRefR"], arb=v3models.ArbSpec(**r["arb"]),
    )
    py_arbF = chassis.arb_rate(ax)
    darb = abs(py_arbF["k"] - d["arbF"]["k"])
    worst["arb"] = max(worst["arb"], darb)
    assert darb < 1e-6, f"{name} arb diff {darb}"
    creq = v3models.ChassisRequest(
        vehicle=v3models.VehicleSpec(
            wheelbase_mm=d["S_wb"], mass_kg=d["S_mTotal"], sprung_mass_kg=d["S_mSprung"],
            hcg_mm=d["S_hcg"], hs_mm=d["S_hs"], front=ax, rear=rax,
        )
    )
    ld = chassis.solve_chassis(creq).loads
    rwarp = abs(ld.warp_rate_n_m - d["modal"]["kWarp"]) / max(1.0, ld.warp_rate_n_m)
    dcoup = abs(ld.mode_coupling_ratio - d["modal"]["coupleRatio"])
    worst["warp"] = max(worst["warp"], rwarp)
    worst["couple"] = max(worst["couple"], dcoup)
    assert rwarp < 5e-3, f"{name} warp rel diff {rwarp}"
    assert dcoup < 5e-3, f"{name} couple diff {dcoup}"
print(f"[PASS] K&C parity 4 presets x 2 axles: dCam={worst['cam']:.2e} dToe={worst['toe']:.2e} dRC={worst['rc']:.2e} dDmp={worst['dmp']:.2e} dMR={worst['mr']:.2e} dArb={worst['arb']:.2e} warpRel={worst['warp']:.2e} couple={worst['couple']:.2e}")
`;

const snap = JSON.stringify(collectJsSnapshots());
const pyExe = process.env.LABSUS_PYTHON || 'python';
const out = execFileSync(pyExe, ['-c', pyScript], { input: snap, encoding: 'utf8', cwd: ROOT });
process.stdout.write(out);
