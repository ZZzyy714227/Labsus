"""
Pydantic request/response models for the FSAE suspension API.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SolveRequest(BaseModel):
    front_hardpoints: dict
    rear_hardpoints: dict
    front_travel: float = 0.0
    rear_travel: float = 0.0
    front_left_travel: float | None = None
    rear_left_travel: float | None = None
    rack_displacement: float = 0.0
    mirror: bool = True


class SweepRequest(BaseModel):
    front_hardpoints: dict
    rear_hardpoints: dict
    start: float = -30.0
    end: float = 30.0
    steps: int = 61
    rack_displacement: float = 0.0


class SavePointRequest(BaseModel):
    name: str
    coords: list
    permanent: bool = False


class DeleteTubeRequest(BaseModel):
    endpoints: list
    permanent: bool = False


class TubeColorRequest(BaseModel):
    endpoints: list
    color: str
    permanent: bool = False


class AddTubeRequest(BaseModel):
    endpoints: list
    color: str = "#8899cc"
    permanent: bool = False


class FaceRequest(BaseModel):
    name: str
    loop: list
    color: str = "#8899cc"
    opacity: float = 0.30
    permanent: bool = False


class DeleteFaceRequest(BaseModel):
    name: str
    permanent: bool = False


class UpdateParamsRequest(BaseModel):
    axle: str
    key: str
    value: float


class OptimizeFL1Request(BaseModel):
    axle: str = "front"  # "front" or "rear"
    travel_start: float = -25.0
    travel_end: float = 25.0
    travel_steps: int = 51


class SimulateRequest(BaseModel):
    path: List[List[float]]              # [[x, y], ...] control points
    obstacles: List[Dict[str, Any]] = []  # obstacle definitions
    speed: float = 12000.0               # mm/s
    duration: float = 5.0                # seconds
    params: Optional[Dict[str, float]] = None  # vehicle param overrides
