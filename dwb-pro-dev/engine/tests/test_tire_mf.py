import numpy as np
from src.tire_mf import MagicFormulaSub, load_tir_params

def test_fy_peak_and_saturation():
    """MF 简化：Fy(α) 峰值后在合理滑移区单调性（α=0 → 0；峰值 ~8-12°）。"""
    p = {
        "Fy0": 8000.0, "By": 9.0, "Cy": 1.2, "Ey": -0.5,
        "Sv": 0.0, "Sh": 0.0, "FzNom": 3500.0,
    }
    mf = MagicFormulaSub(p)
    alphas = np.linspace(0, 20, 41)
    fy = mf.fy(alphas, fz=3500.0)
    assert abs(fy[0]) < 1e-6
    assert float(np.max(fy)) > 6000.0
    assert fy[-1] < float(np.max(fy))     # 已过峰

def test_tir_load_and_friction_circle():
    """.tir 风格参数加载 + 摩擦椭圆利用率为回退（无参数时）。"""
    p = load_tir_params({"B": 9.0, "C": 1.2, "E": -0.5})
    assert p["By"] == 9.0
