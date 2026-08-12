"""
Frame tube CRUD endpoints.
"""
from fastapi import APIRouter, HTTPException

from api_models import (
    AddTubeRequest,
    DeleteTubeRequest,
    TubeColorRequest,
)
from config import DEFAULT_TUBE_COLOR, FRAME_TUBE_COLORS, FRAME_TUBES
from persistence import (
    tube_endpoints_match,
    _add_frame_tube,
    _delete_frame_tube,
)

router = APIRouter()


def _find_tube_index(endpoints):
    """Find index of a tube by its endpoint list, or None if not found."""
    for i, tube in enumerate(FRAME_TUBES):
        if tube_endpoints_match(endpoints, tube):
            return i
    return None


@router.post("/api/delete_tube")
async def delete_tube(req: DeleteTubeRequest):
    """Remove a tube from FRAME_TUBES. If permanent, also persist."""
    tube_idx = _find_tube_index(req.endpoints)
    if tube_idx is None:
        raise HTTPException(status_code=404, detail=f"Tube {req.endpoints} not found")

    FRAME_TUBES.pop(tube_idx)

    # Rebuild color index after removal: shift keys above idx down by one
    new_colors = {}
    for k, v in FRAME_TUBE_COLORS.items():
        if isinstance(k, int):
            if k < tube_idx:
                new_colors[k] = v
            elif k > tube_idx:
                new_colors[k - 1] = v
            # k == tube_idx: color belonged to deleted tube, drop it
    FRAME_TUBE_COLORS.clear()
    FRAME_TUBE_COLORS.update(new_colors)

    permanent = False
    if req.permanent:
        permanent = _delete_frame_tube(req.endpoints)

    return {
        "ok": True,
        "endpoints": req.endpoints,
        "permanent": permanent,
    }


@router.post("/api/save_tube_color")
async def save_tube_color(req: TubeColorRequest):
    """Update tube color in-memory.
    Note: tube colors are not persisted across restarts (index-based
    mapping is fragile). The `permanent` flag is accepted but returns
    False since no durable storage is implemented.
    """
    tube_idx = _find_tube_index(req.endpoints)
    if tube_idx is None:
        raise HTTPException(status_code=404, detail=f"Tube {req.endpoints} not found")
    FRAME_TUBE_COLORS[tube_idx] = req.color
    return {"ok": True, "tube_index": tube_idx, "color": req.color, "permanent": False}


@router.post("/api/add_tube")
async def add_tube(req: AddTubeRequest):
    """Add a new tube."""
    pts = req.endpoints
    if len(pts) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 points")
    if _find_tube_index(pts) is not None:
        raise HTTPException(status_code=400, detail=f"Tube {pts} already exists")
    FRAME_TUBES.append(pts)
    new_idx = len(FRAME_TUBES) - 1
    if req.color != DEFAULT_TUBE_COLOR:
        FRAME_TUBE_COLORS[new_idx] = req.color
    permanent = _add_frame_tube(req.endpoints, req.color) if req.permanent else False
    return {"ok": True, "tube_index": new_idx, "permanent": permanent}
