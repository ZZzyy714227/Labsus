"""
Aerodynamic element save endpoints (wings, undertray, diffuser).
Uses a mapping dict rather than four nearly identical handlers.
"""
from fastapi import APIRouter, Request

from config import DIFFUSER_CONFIG, FRONT_WING, REAR_WING, UNDERTRAY_CONFIG
from persistence import _persist_aero_config

router = APIRouter()

# Mapping: URL suffix → (config dict, persistence key)
_AERO_CONFIGS = {
    "rear_wing": (REAR_WING, "rear_wing"),
    "front_wing": (FRONT_WING, "front_wing"),
    "undertray": (UNDERTRAY_CONFIG, "undertray"),
    "diffuser": (DIFFUSER_CONFIG, "diffuser"),
}


for _suffix, (_cfg, _key) in _AERO_CONFIGS.items():

    @router.post(f"/api/save_{_suffix}")
    async def _save_aero(request: Request, _cfg=_cfg, _key=_key):
        """Persist aero config and update in-memory."""
        config = await request.json()
        _cfg.clear()
        _cfg.update(config)
        permanent = _persist_aero_config(_key, _cfg)
        return {"ok": True, "permanent": permanent}
