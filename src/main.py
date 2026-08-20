"""
FSAE Suspension Kinematics Solver — FastAPI Application

Lightweight entry point that creates the app, includes route handlers,
mounts static files, and loads persistent state at startup.
"""
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.store import DataStore
from persistence import load_persistent_state
from routes.aero import router as aero_router
from routes.analyze import router as analyze_router
from routes.faces import router as face_router
from routes.hardpoints import router as hp_router

# ── Import all route handlers ──────────────────────────────────
from routes.solve import router as solve_router
from routes.tubes import router as tube_router
from routes.v2 import router as v2_router

# ── Create FastAPI app ─────────────────────────────────────────
app = FastAPI(title="FSAE Suspension Solver")

# ── Register route prefix-less routers ─────────────────────────
app.include_router(solve_router)
app.include_router(hp_router)
app.include_router(tube_router)
app.include_router(face_router)
app.include_router(aero_router)
app.include_router(analyze_router)
app.include_router(v2_router)

# Load saved state from JSON into config module-level dicts
load_persistent_state()

# V1 数据地基：幂等导入 legacy 方案与预置工况（设计文档 §11.2/§4.3）
_store = DataStore()
ensure_legacy_import(_store)
ensure_preset_cases(_store)

# ── Static files (web frontend) ────────────────────────────────
web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

# ── Main ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
