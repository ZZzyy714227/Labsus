"""
Bodywork face CRUD endpoints.
"""
from fastapi import APIRouter, HTTPException

from api_models import DeleteFaceRequest, FaceRequest
from config import BODYWORK_FACES
from persistence import _delete_bodywork_face, _save_bodywork_face

router = APIRouter()


@router.post("/api/add_face")
async def add_face(req: FaceRequest):
    """Add a bodywork face in-memory and optionally to persistent state."""
    if req.name in BODYWORK_FACES:
        raise HTTPException(status_code=400, detail=f"Face '{req.name}' already exists")
    if len(req.loop) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 vertices")
    BODYWORK_FACES[req.name] = {"loops": [req.loop], "color": req.color, "opacity": req.opacity}
    permanent = _save_bodywork_face(req.name, req.loop, req.color, req.opacity) if req.permanent else False
    return {"ok": True, "name": req.name, "permanent": permanent}


@router.post("/api/delete_face")
async def delete_face(req: DeleteFaceRequest):
    """Remove a bodywork face."""
    if req.name not in BODYWORK_FACES:
        raise HTTPException(status_code=404, detail=f"Face '{req.name}' not found")
    del BODYWORK_FACES[req.name]
    permanent = _delete_bodywork_face(req.name) if req.permanent else False
    return {"ok": True, "name": req.name, "permanent": permanent}


@router.post("/api/update_face")
async def update_face(req: FaceRequest):
    """Update an existing face or add if new."""
    is_new = req.name not in BODYWORK_FACES
    loop = req.loop or (BODYWORK_FACES[req.name]["loops"][0] if not is_new else ["_", "_", "_"])
    BODYWORK_FACES[req.name] = {"loops": [loop], "color": req.color, "opacity": req.opacity}
    permanent = False
    if req.permanent:
        # _save_bodywork_face overwrites — no separate delete needed
        permanent = _save_bodywork_face(req.name, loop, req.color, req.opacity)
    return {"ok": True, "name": req.name, "permanent": permanent}
