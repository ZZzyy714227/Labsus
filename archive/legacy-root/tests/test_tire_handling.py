"""P5 验证：轮胎模型 / 稳态转向 / 整车调平（手算 benchmark + 状态机）。"""

import pytest

from metrics.handling import understeer_curve, understeer_gradient
from metrics.ride import ride_level
from metrics.tire_model import alpha_for_fy, cornering_stiffness, fy_magic, tire_corner_force

V = {"mass_kg": 280.0, "front_axle_frac": 0.5, "rear_axle_frac": 0.5,
     "cg_height_mm": 300.0, "wheelbase_mm": 1550.0,
     "front_track_mm": 1220.0, "rear_track_mm": 1180.0,
     "k_spring_f": 26.0, "k_spring_r": 47.0}
FZ_SYM = {"fl": 686.7, "fr": 686.7, "rl": 686.7, "rr": 686.7}


class TestTireMagicFormula:
    def test_cornering_stiffness_race(self):
        """拐点刚度 = B·C·D = Cα；Cα 随 Fz 非线性硬化。"""
        ca = cornering_stiffness(350.0, 1000.0, 1000.0, 0.8)
        assert ca == pytest.approx(350.0, abs=1e-6)
        ca_hi = cornering_stiffness(350.0, 2000.0, 1000.0, 0.8)
        assert ca_hi > ca and ca_hi < 700.0          # 硬化率为 2^0.8≈1.74 而非线性
        assert ca_hi == pytest.approx(350.0 * (2.0 ** 0.8), abs=1e-6)

    def test_mf_zero_and_saturation(self):
        fz, ca = 1000.0, 350.0
        assert fy_magic(0.0, fz, ca, 1.4) == pytest.approx(0.0, abs=1e-9)
        d = 1.4 * fz
        assert fy_magic(20.0, fz, ca, 1.4) < d      # 饱和逼近但不超
        # 峰值在 sin(C·θ)=1 ✓ θ=π/(2C)≈69.2°，即 bx=tan(θ)≈2.69 → x≈14°；之后回落但 ≤D
        assert fy_magic(14.0, fz, ca, 1.4) == pytest.approx(d, abs=2.0)
        assert all(fy_magic(x, fz, ca, 1.4) <= d + 0.5 for x in (5, 20, 45, 90, 180))
        assert fy_magic(90.0, fz, ca, 1.4) < d

    def test_camber_stiffness_term(self):
        """外倾线化项：Fy(α=0, γ=2°) ≈ −Cγ·2 = −120N。"""
        cf = tire_corner_force(V, 0.0, 1000.0, gamma_deg=2.0)
        assert cf["fy_n"] == pytest.approx(-120.0, abs=1.0)

    def test_alpha_inverse(self):
        """反解回代：α_for_Fy(350) 代入 MF → 350N。"""
        al = alpha_for_fy(V, 350.0, 1000.0, 0.0)
        assert al is not None
        ca = cornering_stiffness(350.0, 1000.0, 1000.0, 0.8)
        assert fy_magic(al, 1000.0, ca, 1.4) == pytest.approx(350.0, abs=1e-3)

    def test_alpha_unreachable(self):
        """目标 Fy 超过 μFz（含外倾）→ None（饱和）。"""
        assert alpha_for_fy(V, 99999.0, 1000.0, 0.0) is None


class TestSteadyStateHandling:
    def test_symmetric_neutral(self):
        """对称载荷 → α_f=α_r → K=0（中性转向，标准符号）。"""
        r = understeer_gradient(V, FZ_SYM, 1.0)
        assert r["status"] == "VALID"
        assert r["k_deg_per_g"] == pytest.approx(0.0, abs=0.02)
        assert r["understeer"] == "NEUTRAL"

    def test_front_heavy_understeer(self):
        """前轴载荷偏高 → 前 Cα 占比低 → α_f>α_r → K>0 → 欠转向。"""
        fz = {"fl": 750.0, "fr": 750.0, "rl": 530.0, "rr": 530.0}
        r = understeer_gradient(V, fz, 1.0)
        assert r["status"] == "VALID"
        assert r["k_deg_per_g"] > 0.1
        assert r["understeer"] == "UNDER"

    def test_rear_heavy_oversteer(self):
        fz = {"fl": 530.0, "fr": 530.0, "rl": 750.0, "rr": 750.0}
        r = understeer_gradient(V, fz, 1.0)
        assert r["k_deg_per_g"] < -0.1
        assert r["understeer"] == "OVER"

    def test_load_sensitive_curve_grows(self):
        """载荷敏感转向：对称车 K 随 ay 单调不减（转移→Cα 非线性）。"""
        c = understeer_curve(V, FZ_SYM, ay_max=1.2, points=7)
        ks = [k for k in c["k_deg_per_g"] if k is not None]
        assert len(ks) == 7
        assert all(ks[i + 1] >= ks[i] - 1e-9 for i in range(len(ks) - 1))

    def test_no_mass_solver_failed(self):
        r = understeer_gradient({**V, "mass_kg": 0.0}, FZ_SYM, 1.0)
        assert r["status"] == "SOLVER_FAILED"


class TestRideLeveling:
    def test_ride_zero_preload_equals_static(self):
        """设计位形（ride=0）：预载 = 静载，弹簧力=静载，balance=0。"""
        mr = {"fl": 0.216, "fr": 0.216, "rl": 0.25, "rr": 0.25}
        r = ride_level(V, FZ_SYM, mr, {"fl": 0, "fr": 0, "rl": 0, "rr": 0})
        assert r["status"] == "VALID"
        assert r["balance_residual_n"] == pytest.approx(0.0, abs=1e-6)
        assert r["wheels"]["fl"]["preload_n"] == pytest.approx(686.7, abs=1e-3)
        assert r["wheels"]["fl"]["spring_force_n"] == pytest.approx(686.7, abs=1e-3)

    def test_ride_offset_changes_preload(self):
        """伸张 10mm（ride=-10）→ 需更大预载补足；压缩 +10 → 减小预载。"""
        mr = {"fl": 0.216, "fr": 0.216, "rl": 0.25, "rr": 0.25}
        kw = 26.0 * 0.216 * 0.216
        r_up = ride_level(V, FZ_SYM, mr, {"fl": -10, "fr": -10, "rl": -10, "rr": -10})
        assert r_up["wheels"]["fl"]["preload_n"] == pytest.approx(686.7 + kw * 10.0, abs=1e-3)
        r_down = ride_level(V, FZ_SYM, mr, {"fl": 10, "fr": 10, "rl": 10, "rr": 10})
        assert r_down["wheels"]["fl"]["preload_n"] == pytest.approx(686.7 - kw * 10.0, abs=1e-3)

    def test_roll_pose(self):
        """左右 ride 差 → roll 姿态非零。"""
        mr = {"fl": 0.216, "fr": 0.216, "rl": 0.25, "rr": 0.25}
        r = ride_level(V, FZ_SYM, mr, {"fl": 0, "fr": 20, "rl": 0, "rr": 20})
        assert r["pose"]["roll_deg"] != 0.0
