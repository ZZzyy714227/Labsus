"""
Pydantic request/response models for the FSAE suspension API.
"""
from typing import Optional
from pydantic import BaseModel


class SolveRequest(BaseModel):
    front_hardpoints: dict
    rear_hardpoints: dict
    front_travel: float = 0.0
    rear_travel: float = 0.0
    front_left_travel: Optional[float] = None
    rear_left_travel: Optional[float] = None
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
