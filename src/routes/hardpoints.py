"""
Hardpoint defaults, save, and parameter update endpoints.
"""
from fastapi import APIRouter, HTTPException

from api_models import ApplyParamsRequest, SavePointRequest, UpdateParamsRequest
from config import (
    BODYWORK_FACES,
    CABIN,
    DEFAULT_FRAME_NODES,
    DESIGN_PARAMS,
    DIFFUSER_CONFIG,
    FRAME_TUBE_COLORS,
    FRAME_TUBES,
    FRONT_WING,
    REAR_PREFIX,
    REAR_WING,
    UNDERTRAY_CONFIG,
)
from hardpoints import (
    DEFAULT_HARDPOINTS,
    DEFAULT_REAR_HARDPOINTS,
    _load_overrides,
    _save_overrides,
    derive_hardpoints,
    mirror_left,
    strip_prefix,
)
from persistence import _save_frame_node
from solver.angles import compute_alignment_angles, fix_left_angles as _fix_left_angles
from tire import _upright_y_axis, compute_contact_patch

router = APIRouter()


@router.get("/api/defaults")
async def get_defaults():
    """Return default hardpoints for both front and rear axles."""
    hp_right_f = dict(DEFAULT_HARDPOINTS)
    hp_left_f = mirror_left(hp_right_f)
    angles_right_f = compute_alignment_angles(hp_right_f, hp=hp_right_f)
    angles_left_raw_f = compute_alignment_angles(hp_left_f, hp=hp_left_f)
    angles_left_f = _fix_left_angles(angles_left_raw_f, angles_right_f)

    hp_right_r = dict(DEFAULT_REAR_HARDPOINTS)
    hp_left_r = mirror_left(hp_right_r)
    hp_right_stripped = strip_prefix(hp_right_r, REAR_PREFIX)
    hp_left_stripped = strip_prefix(hp_left_r, REAR_PREFIX)
    angles_right_r = compute_alignment_angles(hp_right_stripped, hp=hp_right_stripped)
    angles_left_raw_r = compute_alignment_angles(hp_left_stripped, hp=hp_left_stripped)
    angles_left_r = _fix_left_angles(angles_left_raw_r, angles_right_r)

    cp_fr = compute_contact_patch(hp_right_f["UP5"], _upright_y_axis(hp_right_f), hp_right_f)
    cp_fl = compute_contact_patch(hp_left_f["UP5"], _upright_y_axis(hp_left_f), hp_left_f)
    cp_rr = compute_contact_patch(hp_right_r["R_UP5"], _upright_y_axis(hp_right_stripped), hp_right_stripped)
    cp_rl = compute_contact_patch(hp_left_r["R_UP5"], _upright_y_axis(hp_left_stripped), hp_left_stripped)

    return {
        "front": {
            "right": hp_right_f,
            "left": hp_left_f,
            "angles_right": angles_right_f,
            "angles_left": angles_left_f,
            "contact_patch_right": cp_fr,
            "contact_patch_left": cp_fl,
        },
        "rear": {
            "right": hp_right_r,
            "left": hp_left_r,
            "angles_right": angles_right_r,
            "angles_left": angles_left_r,
            "contact_patch_right": cp_rr,
            "contact_patch_left": cp_rl,
        },
        "frame": {
            "nodes": DEFAULT_FRAME_NODES,
            "tubes": FRAME_TUBES,
            "tube_colors": FRAME_TUBE_COLORS,
        },
        "bodywork": BODYWORK_FACES,
        "rear_wing": REAR_WING,
        "front_wing": FRONT_WING,
        "undertray": UNDERTRAY_CONFIG,
        "diffuser": DIFFUSER_CONFIG,
        "cabin": CABIN,
        "params": DESIGN_PARAMS,
    }


@router.post("/api/save_point")
async def save_point(req: SavePointRequest):
    """Update a point's coordinates in-memory. If permanent=True, write back."""
    name = req.name
    coords = [float(req.coords[0]), float(req.coords[1]), float(req.coords[2])]

    updated = False
    target_dict = None

    if name in DEFAULT_HARDPOINTS:
        DEFAULT_HARDPOINTS[name] = coords
        target_dict = "DEFAULT_HARDPOINTS"
        updated = True
    elif name in DEFAULT_REAR_HARDPOINTS:
        DEFAULT_REAR_HARDPOINTS[name] = coords
        target_dict = "DEFAULT_REAR_HARDPOINTS"
        updated = True
    elif name in DEFAULT_FRAME_NODES:
        DEFAULT_FRAME_NODES[name] = coords
        target_dict = "DEFAULT_FRAME_NODES"
        updated = True

    if not updated:
        if name.endswith('_L'):
            base_name = name[:-2]
            if base_name in DEFAULT_HARDPOINTS:
                DEFAULT_HARDPOINTS[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_HARDPOINTS"
                updated = True
            elif base_name in DEFAULT_REAR_HARDPOINTS:
                DEFAULT_REAR_HARDPOINTS[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_REAR_HARDPOINTS"
                updated = True
            elif base_name in DEFAULT_FRAME_NODES:
                DEFAULT_FRAME_NODES[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_FRAME_NODES"
                updated = True

    if not updated:
        raise HTTPException(status_code=404, detail=f"Point '{name}' not found")

    permanent = False
    if req.permanent:
        if target_dict in ("DEFAULT_HARDPOINTS", "DEFAULT_REAR_HARDPOINTS"):
            overrides = _load_overrides()
            save_name = name
            save_coords = list(coords)
            if name.endswith('_L'):
                save_name = name[:-2]
                save_coords = [coords[0], -coords[1], coords[2]]
            overrides[save_name] = save_coords
            _save_overrides(overrides)
            permanent = True
        else:
            if name.endswith('_L'):
                base_name = name[:-2]
                base_exists = (base_name in DEFAULT_HARDPOINTS or
                               base_name in DEFAULT_REAR_HARDPOINTS or
                               base_name in DEFAULT_FRAME_NODES)
                if base_exists:
                    permanent = _save_frame_node(base_name, [coords[0], -coords[1], coords[2]])
                else:
                    permanent = _save_frame_node(name, coords)
            else:
                permanent = _save_frame_node(name, coords)

    return {"ok": True, "name": name, "coords": coords, "dict": target_dict, "permanent": permanent}


@router.post("/api/update_params")
async def update_params(req: UpdateParamsRequest):
    """Update a design parameter and re-derive all hardpoints."""
    if req.axle not in DESIGN_PARAMS:
        raise HTTPException(status_code=400, detail=f"Unknown axle: {req.axle}")
    if req.key not in DESIGN_PARAMS[req.axle]:
        raise HTTPException(status_code=400, detail=f"Unknown param: {req.key}")

    DESIGN_PARAMS[req.axle][req.key] = float(req.value)

    if req.axle == "front":
        new_hp = derive_hardpoints(DESIGN_PARAMS["front"])
        for k, v in new_hp.items():
            DEFAULT_HARDPOINTS[k] = v
    else:
        new_hp = derive_hardpoints(DESIGN_PARAMS["rear"], prefix="R_")
        for k, v in new_hp.items():
            DEFAULT_REAR_HARDPOINTS[k] = v

    return {
        "ok": True,
        "axle": req.axle,
        "key": req.key,
        "value": req.value,
        "hardpoints": new_hp,
    }


@router.post("/api/apply_params")
async def apply_params(req: ApplyParamsRequest):
    """Batch-apply design parameters for one axle and re-derive hardpoints."""
    if req.axle not in DESIGN_PARAMS:
        raise HTTPException(status_code=400, detail=f"Unknown axle: {req.axle}")
    for k, v in req.params.items():
        if k not in DESIGN_PARAMS[req.axle]:
            raise HTTPException(status_code=400, detail=f"Unknown param: {k}")
        DESIGN_PARAMS[req.axle][k] = float(v)

    if req.axle == "front":
        new_hp = derive_hardpoints(DESIGN_PARAMS["front"])
        for k, v in new_hp.items():
            DEFAULT_HARDPOINTS[k] = v
    else:
        new_hp = derive_hardpoints(DESIGN_PARAMS["rear"], prefix="R_")
        for k, v in new_hp.items():
            DEFAULT_REAR_HARDPOINTS[k] = v

    return {"ok": True, "axle": req.axle, "hardpoints": new_hp}
