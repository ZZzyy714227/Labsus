"""POST /api/simulate — run dynamics simulation."""
from fastapi import APIRouter

from api_models import SimulateRequest
from dynamics.simulation import run_simulation

router = APIRouter()


@router.post("/api/simulate")
async def simulate(req: SimulateRequest):
    """Run a dynamics simulation and return trajectory frames."""
    result = run_simulation(
        path_pts=req.path,
        obstacles=req.obstacles,
        speed=req.speed,
        duration=req.duration,
        params=req.params,
    )
    return result
