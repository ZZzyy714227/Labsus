"""按胎宽配平轴侧偏刚度（M5 B3，2026-09-20）。

背景：本轮修复「前后轴静载对调」后，缺省预设由不足转向翻成中性/轻过度转向。
查明根因——预设里明确区分了前后胎宽（formula 175/205、gt3 265/285、baja 180/230），
但 `tire.W` 只被渲染层消费（`web/js/05-scene3d.js`、`14-tire-lab.js`），**从不进入
侧偏刚度**，于是"后胎更宽 ⇒ 后轴更抓 ⇒ 不足转向"这条真车主平衡机制缺失，模型
只能靠"前重配重"凑不足转向（实测要前轴 58~60% 才进 0.2 °/g 窗口，反物理）。

修复口径（双端同源）：轴刚度系数 k = W_axle / mean(W_f, W_r)，只放大侧偏刚度
因子（引擎 Cα 的 By、前端 MF 的 By），**不动峰值力 D**（μ·Fz 对同配方同胎压基本
与胎宽无关）⇒ G24 的轮胎量级标定（μ=1.50 / 峰值侧偏角 8.27°）不被改动。
等宽或缺字段 ⇒ k≡1，旧行为逐位不变（tphys_parity 锚安全，见本文件末测试）。

本测试在"未实现胎宽配平"的旧代码下必然 FAIL（default 宽窄差会被忽略）。
"""
import pytest

from src.api.chassis import solve_chassis
from src.api.v3models import AxleSpec, ChassisRequest, QuasiInputs, VehicleSpec
from src.api.v3service import DEFAULT_DWB_POINTS


def _vehicle(w_f, w_r, f_ms=330.0, r_ms=330.0) -> VehicleSpec:
    def axle(w, ms, arch, tr, cam, toe):
        d = {"points": DEFAULT_DWB_POINTS, "arch": arch, "camber_deg": cam,
             "toe_deg": toe, "tire_radius": tr, "spring_rate": 110.0,
             "spring_mass_kg": ms, "unsprung_kg": 22.0, "motion_ratio": 0.6}
        if w is not None:
            d["tire_width"] = w
        return d
    return VehicleSpec(**{
        "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
        "hcg_mm": 320.0, "hs_mm": 330.0,
        "front": axle(w_f, f_ms, "pushrod", 305.0, -1.2, 0.05),
        "rear": axle(w_r, r_ms, "pullrod", 310.0, -1.5, 0.1),
    })


def _us(v: VehicleSpec) -> dict:
    # gy=1.0：US 梯度在 |gy|<0.02 有除零保护（置 0），必须给非零侧向工况
    out = solve_chassis(ChassisRequest(
        vehicle=v, quasi=QuasiInputs(gy=1.0, gx=0.0, aero_force_n=0.0, aero_bias=0.5)))
    return {"us": out.loads.us_grad_deg_per_g, "af": out.loads.alpha_f_deg,
            "ar": out.loads.alpha_r_deg}


# ── 系数语义 ────────────────────────────────────────────────────────────

def test_scale_is_normalized_by_axle_mean():
    a = AxleSpec(points=DEFAULT_DWB_POINTS, tire_width=175.0)
    b = AxleSpec(points=DEFAULT_DWB_POINTS, tire_width=205.0)
    assert a.tire_width_scale(b) == pytest.approx(175.0 / 190.0)
    assert b.tire_width_scale(a) == pytest.approx(205.0 / 190.0)
    # 等宽 ⇒ 1（旧行为）
    c = AxleSpec(points=DEFAULT_DWB_POINTS, tire_width=200.0)
    d = AxleSpec(points=DEFAULT_DWB_POINTS, tire_width=200.0)
    assert c.tire_width_scale(d) == pytest.approx(1.0)


def test_scale_is_neutral_when_width_missing():
    """缺 tire_width（旧 payload / 对拍 fixture）⇒ k≡1，不得改变任何数值。"""
    a = AxleSpec(points=DEFAULT_DWB_POINTS)
    b = AxleSpec(points=DEFAULT_DWB_POINTS, tire_width=205.0)
    assert a.tire_width_scale(b) == 1.0
    assert b.tire_width_scale(a) == 1.0
    assert a.tire_width_scale(None) == 1.0


# ── 物理方向 ────────────────────────────────────────────────────────────

def test_wider_rear_increases_understeer():
    """后胎更宽 ⇒ 后轴侧偏角更小 ⇒ US 梯度上升（本机制的核心断言）。"""
    same = _us(_vehicle(200.0, 200.0, f_ms=350.0, r_ms=310.0))
    wide_r = _us(_vehicle(200.0, 240.0, f_ms=350.0, r_ms=310.0))
    assert wide_r["ar"] < same["ar"], (wide_r, same)
    assert wide_r["us"] > same["us"], (wide_r, same)


def test_wider_front_reduces_understeer():
    """前胎更宽 ⇒ 前轴更抓 ⇒ US 下降（对称性锚，防符号写反）。"""
    same = _us(_vehicle(200.0, 200.0, f_ms=350.0, r_ms=310.0))
    wide_f = _us(_vehicle(240.0, 200.0, f_ms=350.0, r_ms=310.0))
    assert wide_f["af"] < same["af"], (wide_f, same)
    assert wide_f["us"] < same["us"], (wide_f, same)


def test_width_ratio_only_shifts_balance_not_level():
    """整车平均刚度不变：等比例放大两侧胎宽，平衡与各轴 α 基本不动。"""
    a = _us(_vehicle(180.0, 220.0, f_ms=350.0, r_ms=310.0))
    b = _us(_vehicle(360.0, 440.0, f_ms=350.0, r_ms=310.0))   # 同比例 ×2
    assert abs(a["us"] - b["us"]) < 1e-6, (a, b)
    assert abs(a["af"] - b["af"]) < 1e-6, (a, b)


def test_missing_width_reproduces_legacy_numbers():
    """回归安全锚：不带 tire_width 的请求结果与带「等宽」请求完全一致。"""
    legacy = _us(_vehicle(None, None, f_ms=350.0, r_ms=310.0))
    equal = _us(_vehicle(200.0, 200.0, f_ms=350.0, r_ms=310.0))
    assert legacy["us"] == pytest.approx(equal["us"], abs=1e-12)
    assert legacy["af"] == pytest.approx(equal["af"], abs=1e-12)
    assert legacy["ar"] == pytest.approx(equal["ar"], abs=1e-12)


def test_transient_tire_construction_uses_width_scale():
    """瞬态（平面 3-DOF）也吃同一条口径：构造后 sy 系数按轴放大。"""
    from src.api.v3models import QuasiInputs, TireParams  # noqa: F401
    from src.solver.transient import VehiclePlanar
    car_eq = VehiclePlanar(_vehicle(200.0, 200.0), TireParams(), {"front": {}, "rear": {}},
                           iz=1800.0, powertrain=None, aero=None)
    car_wr = VehiclePlanar(_vehicle(200.0, 240.0), TireParams(), {"front": {}, "rear": {}},
                           iz=1800.0, powertrain=None, aero=None)
    assert car_eq.kW_F == pytest.approx(1.0) and car_eq.kW_R == pytest.approx(1.0)
    assert car_wr.kW_R > 1.0 > car_wr.kW_F
    # 后轴 MF 的 By 被放大（峰值不变）
    tp_eq = car_eq.tires["RR"]
    tp_wr = car_wr.tires["RR"]
    fy_eq = tp_eq.fy(3.0, 3000.0)
    fy_wr = tp_wr.fy(3.0, 3000.0)
    assert abs(fy_wr) > abs(fy_eq), (fy_wr, fy_eq)
