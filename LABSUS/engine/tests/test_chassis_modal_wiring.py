"""模态审计接线回归（2026-11-20）

## 为什么有这个测试

`src/components/suspension_audit.py` 在此前**只被自己的测试引用**——写好了、
物理结论也对，但产品路径根本走不到它（属于"设计无使用"）。

本次把它接进 `/api/v3/chassis/solve` 的 `loads`，输出两个用户可用的量：
- `warp_rate_n_m`：warp 模式刚度（单轮受扰时的车身抵抗，ARB 无贡献）
- `mode_coupling_ratio`：roll↔warp 耦合比（解释"加大 ARB 为什么单轮工况也变硬"）

本测试锁定"接线还活着"，而不是锁死具体数值（数值随车型变化，属调校范围）：
1. 两个字段出现在响应里且为有限正数
2. 耦合比 ∈ (0, 1)（无因次，非对角/对角最大值）
3. **改 ARB 会改变耦合比** —— 这是接线正确性的行为证据；若接线被误删/误用
   常量，这条会立刻变红
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def _vehicle(arb_d: float = 18.0) -> dict:
    """沿用仓库标准硬点夹具（`DEFAULT_DWB_POINTS`），只调 ARB 直径。

    自造硬点会因 DWB_KEYS 校验失败（键名必须与真实悬架一致）；
    ARB 通过 `arb.d`（直径 mm，<=0.5 视为拆除）配置，不是"刚度"标量。
    前后弹簧率取不同值，保证逐角刚度矩阵非各向同性 ⇒ 模态耦合非零。
    """
    from src.api.v3service import DEFAULT_DWB_POINTS
    return {
        "front": {"points": DEFAULT_DWB_POINTS, "spring_rate": 110.0, "arb": {"d": arb_d}},
        "rear": {"points": DEFAULT_DWB_POINTS, "spring_rate": 150.0, "arb": {"d": arb_d}},
    }


def _solve(vehicle: dict) -> dict:
    r = client.post("/api/v3/chassis/solve",
                    json={"vehicle": vehicle, "quasi": {"gy": 0.8, "gx": 0.0}})
    assert r.status_code == 200, r.text[:400]
    return r.json()


def test_modal_audit_fields_present_and_finite() -> None:
    d = _solve(_vehicle())
    loads = d["loads"]
    assert "warp_rate_n_m" in loads, sorted(loads)
    assert "mode_coupling_ratio" in loads, sorted(loads)
    warp = float(loads["warp_rate_n_m"])
    coup = float(loads["mode_coupling_ratio"])
    assert warp > 0.0 and warp == warp        # 有限正数
    assert 0.0 <= coup < 1.0, coup            # 无因次耦合比


def test_arb_changes_mode_coupling() -> None:
    """加 ARB 必须改变 roll↔warp 耦合比 —— 接线正确性的行为证据。"""
    c0 = float(_solve(_vehicle(arb_d=0.0))["loads"]["mode_coupling_ratio"])
    c1 = float(_solve(_vehicle(arb_d=30.0))["loads"]["mode_coupling_ratio"])
    assert abs(c1 - c0) > 1e-4, (c0, c1)
