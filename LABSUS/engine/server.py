"""/api/v3 服务入口（S2）：FastAPI 应用。

启动：
    python server.py                 # 默认 http://127.0.0.1:8001
    uvicorn server:app --port 8001

端点：
    GET  /api/v3/health              引擎健康检查
    GET  /api/v3/version             引擎与 API 版本
    POST /api/v3/solve/pose          单点机制求解（姿态 + 定位角）
    POST /api/v3/kandc/bump          平行轮跳扫掠（K&C）
    POST /api/v3/kandc/roll          侧倾扫掠（K&C，双侧合成）
    POST /api/v3/kandc/steer         转向扫掠（K&C）
    POST /api/v3/kandc/compliance    力 Compliance 扫掠（K&C）

CORS：开放所有来源（前端为 file:// 双击打开时亦可直连本服务）。
端口 8001 避开主仓库冻结的 8000（modeler 后端）。
"""
from __future__ import annotations

import os
import sys

# 确保 engine/ 在 sys.path（与 scripts/kandc_run.py 同款注入）。
# F-74：不再挂 engine/src —— 引擎内部统一 `src.` 绝对导入根，避免同一文件
# 被加载成 `src.geometry` 与 `geometry` 两个模块对象导致身份比较失效。
_ENGINE_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ENGINE_ROOT not in sys.path:
    sys.path.insert(0, _ENGINE_ROOT)

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from src.api import chassis as chassis_service  # noqa: E402
from src.api import v3service  # noqa: E402
from src.api.v3models import (  # noqa: E402
    ChassisRequest,
    KandcRequest,
    PoseRequest,
    TireFitRequest,
    TireFitResponse,
    TrackSimRequest,
    TrackSimResponse,
)
from src.core.json_util import wash_json as _wash_json  # noqa: E402
from src.solver.tire_fit import fit_tire_params  # noqa: E402
from src.solver.transient import run_track_sim  # noqa: E402

ENGINE_VERSION = "0.3.0"          # 引擎（S1 内核 + S2 服务层）
API_VERSION = "v3"


def _handle_api_error(exc: Exception, context: str) -> None:
    """F-46 脱敏与错误分流：区分 422 客户端输入/数值发散 vs 500 服务器内部未处理崩溃。"""
    if isinstance(exc, HTTPException):
        raise exc
    import traceback as _tb
    _tb.print_exc()
    if isinstance(exc, (ValueError, KeyError)):
        raise HTTPException(
            status_code=422,
            detail=f"{context} input error ({type(exc).__name__})",
        ) from exc
    raise HTTPException(
        status_code=500,
        detail=f"internal server error ({type(exc).__name__})",
    ) from exc

app = FastAPI(
    title="LABSUS Engine /api/v3",
    description="LABSUS 悬架实验室分析引擎（S1 衬套两层求解器 + S2 工况/API 服务层）",
    version=ENGINE_VERSION,
)

# CORS：默认全开（前端 file:// 双击直连）。部署时可收紧：
#   LABSUS_CORS_ORIGINS="http://127.0.0.1:8921,http://localhost:8921" python server.py
_cors_origins = [o.strip() for o in os.environ.get("LABSUS_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v3/health")
def health() -> dict:
    return {
        "status": "ok",
        "engine": "labsus-engine",
        "engine_version": ENGINE_VERSION,
        "api": API_VERSION,
        "kandc": ["bump", "roll", "steer", "compliance"],
        "solver": "mechanism least_squares TRF + K&C two-level (bushing)",
    }


@app.get("/api/v3/version")
def version() -> dict:
    return {"engine_version": ENGINE_VERSION, "api": API_VERSION}


@app.post("/api/v3/solve/pose")
def solve_pose_api(req: PoseRequest) -> dict:
    try:
        return _wash_json(v3service.run_pose(req).model_dump())
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "solver")


@app.post("/api/v3/kandc/{case}")
def kandc(case: str, req: KandcRequest) -> dict:
    if case not in ("bump", "roll", "steer", "compliance"):
        raise HTTPException(status_code=404, detail=f"unknown K&C case {case!r}")
    runner = {
        "bump": v3service.run_bump,
        "roll": v3service.run_roll,
        "steer": v3service.run_steer,
        "compliance": v3service.run_compliance,
    }[case]
    try:
        return _wash_json(runner(req).model_dump())
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "K&C solver")


@app.post("/api/v3/chassis/solve")
def chassis_solve(req: ChassisRequest) -> dict:
    """整车单点：四角定位角 + 整车姿态 + 准静态载荷转移（TLLTD/侧倾梯度）。"""
    try:
        return _wash_json(chassis_service.solve_chassis(req).model_dump())
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "chassis solve")


@app.post("/api/v3/chassis/kandc/{case}")
def chassis_kandc(case: str, req: ChassisRequest) -> dict:
    if case not in ("bump", "roll", "steer"):
        raise HTTPException(status_code=404, detail=f"unknown chassis case {case!r}")
    runner = {
        "bump": chassis_service.sweep_bump,
        "roll": chassis_service.sweep_roll,
        "steer": chassis_service.sweep_steer,
    }[case]
    try:
        return _wash_json(runner(req).model_dump())
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "chassis K&C")


@app.post("/api/v3/chassis/simulate_track", response_model=TrackSimResponse)
def simulate_track(req: TrackSimRequest) -> dict:
    """整车瞬态赛道仿真（S3-1）：平面 3-DOF + 四轮 MF + 准静态载荷 + 纯追踪驾驶员。

    M5：绑定 response_model —— 这是唯一返回裸 dict 的端点，绑上之后响应键集
    由模型钉死，后端改名会当场红，而不是让前端静默空白。
    其余端点不绑：它们的服务层本就返回 pydantic 模型（`runner(req).model_dump()`），
    键集已由模型保证；再加运行时校验只会把 `_wash_json` 洗出的诚实 null
    （发散工况）变成 500。
    """
    try:
        return _wash_json(run_track_sim(req))
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "transient sim")


@app.post("/api/v3/tire/fit", response_model=TireFitResponse)
def tire_fit(req: TireFitRequest) -> TireFitResponse:
    """轮胎实测曲线 → Pacejka MF 子集参数辨识（讲义 EP08 数据链）。

    辨识出的 params 可直接作为 chassis/solve 的 tire 字段或赛道仿真轮胎参数回传。
    """
    import time as _time
    t0 = _time.perf_counter()
    try:
        r = fit_tire_params([c.model_dump() for c in req.curves],
                            fit_ls=req.fit_ls)
    except Exception as exc:  # noqa: BLE001
        _handle_api_error(exc, "tire fit")
    from src.api.v3models import TireParams
    params = TireParams(**{**r["params"], "Sh": 0.0, "Sv": 0.0,
                           "Cg": 0.5, "Ls": 0.35}) if r["params"] else None
    return TireFitResponse(
        status=r["status"], ms=(_time.perf_counter() - t0) * 1000.0,
        params=params, rms_pct=r["rms_pct"],
        per_load_rms_pct=r["per_load_rms_pct"],
        n_points=r["n_points"], n_loads=r["n_loads"], note=r["note"],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
