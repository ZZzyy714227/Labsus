"""轮胎实测数据 → MF 参数辨识防线（真实开发数据链，讲义 EP08）。

合成策略：用已知 MF 参数生成多层级 (Fz, α, Fy) 曲线 + 轻量噪声，
断言辨识结果回收参数（容差内），且载荷敏感性（LS）仅在多层级时辨识。
"""
import numpy as np
from fastapi.testclient import TestClient

from server import app  # noqa: E402
from src.solver.tire_fit import fit_tire_params

client = TestClient(app)

TRUE = {"Fy0": 8000.0, "By": 9.0, "Cy": 1.2, "Ey": -0.5, "LS": 0.10,
        "FzNom": 3500.0}


def _fy(alpha_deg: np.ndarray, fz: float, p: dict = TRUE, noise: float = 0.0) -> np.ndarray:
    r = fz / p["FzNom"]
    d = p["Fy0"] * r * max(0.1, 1.0 - p["LS"] * (r - 1.0))
    a = np.deg2rad(alpha_deg)
    x = p["By"] * a
    y = d * np.sin(p["Cy"] * np.arctan(x - p["Ey"] * (x - np.arctan(x))))
    if noise > 0:
        rng = np.random.default_rng(714)
        y = y + rng.normal(0.0, noise * d, size=y.shape)
    return y


def _curves(fzs=(2000.0, 3500.0, 5000.0), noise=0.0):
    al = np.linspace(0, 20, 41).tolist()
    return [{"fz": fz, "alpha_deg": al,
             "fy": [float(v) for v in _fy(np.asarray(al), fz, noise=noise)]}
            for fz in fzs]


def test_tire_fit_recovers_params():
    """多层级无噪声：Fy0/By/Cy/Ey 回收误差 <2%，LS 辨识出非零。"""
    r = fit_tire_params(_curves())
    assert r["status"] == "VALID"
    p = r["params"]
    assert abs(p["Fy0"] - TRUE["Fy0"]) / TRUE["Fy0"] < 0.02
    assert abs(p["By"] - TRUE["By"]) / TRUE["By"] < 0.02
    assert abs(p["Cy"] - TRUE["Cy"]) / TRUE["Cy"] < 0.02
    assert abs(p["Ey"] - TRUE["Ey"]) < 0.15
    assert p["LS"] > 0.04                      # 载荷敏感性被辨识出
    assert r["rms_pct"] is not None and r["rms_pct"] < 2.0
    assert r["n_loads"] == 3 and r["n_points"] == 123


def test_tire_fit_noisy_still_bounded():
    """3% 峰值噪声：参数仍应收敛在 8% 容差内（实测数据鲁棒性）。"""
    r = fit_tire_params(_curves(noise=0.03))
    assert r["status"] == "VALID"
    p = r["params"]
    assert abs(p["Fy0"] - TRUE["Fy0"]) / TRUE["Fy0"] < 0.08
    assert abs(p["By"] - TRUE["By"]) / TRUE["By"] < 0.08
    assert r["rms_pct"] < 8.0


def test_tire_fit_single_load_ls_fixed_zero():
    """单层级：LS 不可辨识 → 固定 0 + 显式标注（禁止伪造）。"""
    r = fit_tire_params(_curves(fzs=(3500.0,)))
    assert r["status"] == "VALID"
    assert r["params"]["LS"] == 0.0
    assert "LS" in r["note"]


def test_tire_fit_invalid_inputs():
    """欠定输入：显式 NOT_APPLICABLE，不给假参数。"""
    assert fit_tire_params([])["status"] == "NOT_APPLICABLE"
    r = fit_tire_params([{"fz": 3500.0, "alpha_deg": [0, 1], "fy": [0, 100]}])
    assert r["status"] == "NOT_APPLICABLE" and r["params"] is None


def test_tire_fit_endpoint():
    """/api/v3/tire/fit：返回 TireParams 完整形态（可直接回传仿真）。"""
    r = client.post("/api/v3/tire/fit", json={"curves": _curves(), "fit_ls": True})
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID"
    for k in ("Fy0", "By", "Cy", "Ey", "FzNom", "LS", "Cg", "Ls"):
        assert k in b["params"]
    assert len(b["per_load_rms_pct"]) == 3


def test_tire_fit_endpoint_validation_422():
    """曲线长度不一致 / 点数不足 → 422。"""
    bad = {"curves": [{"fz": 3500.0, "alpha_deg": [0, 1, 2], "fy": [0, 100]}]}
    assert client.post("/api/v3/tire/fit", json=bad).status_code == 422
    bad2 = {"curves": [{"fz": 3500.0, "alpha_deg": [0, 1, 2, 3, 4],
                        "fy": [0, 1, 2, 3]}]}
    assert client.post("/api/v3/tire/fit", json=bad2).status_code == 422
