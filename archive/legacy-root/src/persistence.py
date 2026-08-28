"""
JSON-based persistence for mutable configuration state.

Replaces the old regex-based source file modification approach.
All mutable state (tubes, colors, bodywork, wings, undertray, diffuser)
is stored in a single JSON file: data/persistent_state.json.
"""
import json
import os

from config import DEFAULT_TUBE_COLOR

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
STATE_FILE = os.path.join(DATA_DIR, "persistent_state.json")


# ============================================================
# Internal helpers
# ============================================================

def _load_state():
    """Load persistent state from JSON file. Returns empty dict if missing."""
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_state(state):
    """Write persistent state to JSON file. Creates data dir lazily."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    return True


def _with_state(mutator):
    """Load state, apply mutator, save. Returns True."""
    state = _load_state()
    mutator(state)
    return _save_state(state)


def tube_endpoints_match(endpoints, tube):
    """Check if tube's endpoint list matches the given endpoints.
    For 2-point tubes, ordering is indifferent (A-B = B-A).
    For 3+ tubes, order matters.
    """
    n = len(endpoints)
    if len(tube) != n:
        return False
    if n == 2:
        return sorted(tube) == sorted(endpoints)
    return all(tube[j] == endpoints[j] for j in range(n))


# ============================================================
# Startup loader — called once at server import time
# ============================================================

def load_persistent_state():
    """Load persistent state on startup and merge into config module dicts.

    Must be called AFTER config.py is imported so the module-level dicts
    (FRAME_TUBES, BODYWORK_FACES, REAR_WING, etc.) can be mutated in-place.
    This is safe because the import chain already holds references to the
    original mutable objects.
    """
    from config import (
        BODYWORK_FACES,
        DEFAULT_FRAME_NODES,
        DIFFUSER_CONFIG,
        FRAME_TUBE_COLORS,
        FRAME_TUBES,
        FRONT_WING,
        REAR_WING,
        UNDERTRAY_CONFIG,
        VEHICLE_PARAMS,
    )
    state = _load_state()
    if not state:
        return

    # Frame nodes — merge deltas (each save writes one node at a time)
    if "frame_nodes" in state:
        DEFAULT_FRAME_NODES.update(state["frame_nodes"])

    # Frame tubes — merge: only add persisted tubes that don't already exist.
    # NOTE: This cannot handle deletions (a deleted default tube comes back on reload).
    # If tube delete-tracking is needed later, store a "frame_tubes_deleted" list.
    if "frame_tubes" in state:
        for tube in state["frame_tubes"]:
            if not any(tube_endpoints_match(tube, existing) for existing in FRAME_TUBES):
                FRAME_TUBES.append(tube)

    # Tube colours — merge deltas
    if "frame_tube_colors" in state:
        for k, v in state["frame_tube_colors"].items():
            FRAME_TUBE_COLORS[int(k) if k.isdigit() else k] = v

    # Bodywork faces — merge deltas (each save writes one face at a time)
    if "bodywork_faces" in state:
        BODYWORK_FACES.update(state["bodywork_faces"])

    # Wing / aero configs — full snapshots (save writes the entire config dict)
    for cfg_key, cfg_target in [
        ("rear_wing", REAR_WING),
        ("front_wing", FRONT_WING),
        ("undertray", UNDERTRAY_CONFIG),
        ("diffuser", DIFFUSER_CONFIG),
    ]:
        if cfg_key in state:
            cfg_target.clear()
            cfg_target.update(state[cfg_key])

    # Vehicle params + target-band overrides — merge deltas
    if "vehicle_params" in state and isinstance(state["vehicle_params"], dict):
        VEHICLE_PARAMS.update(state["vehicle_params"])
    if "target_bands" in state and isinstance(state["target_bands"], dict):
        from metrics.targets import TARGET_BANDS_OVERRIDES
        TARGET_BANDS_OVERRIDES.update(state["target_bands"])


# ============================================================
# Individual save helpers — called from API endpoints
# ============================================================

def _save_frame_node(name, coords):
    """Persist a frame-node coordinate override to state JSON.
    (Hardpoints use the separate hardpoint_overrides.json mechanism.)
    """
    def _mut(s):
        s.setdefault("frame_nodes", {})[name] = [round(c, 1) for c in coords]
    return _with_state(_mut)


def _delete_frame_tube(endpoints):
    """Remove a tube from persistent state by its endpoint list."""
    state = _load_state()
    tubes = state.get("frame_tubes", [])
    for i, tube in enumerate(tubes):
        if tube_endpoints_match(endpoints, tube):
            state["frame_tubes"].pop(i)
            return _save_state(state)
    return False  # not found — skip save


def _add_frame_tube(endpoints, color):
    """Append a tube to persistent state."""
    def _mut(s):
        idx = len(s.get("frame_tubes", []))
        s.setdefault("frame_tubes", []).append(list(endpoints))
        if color != DEFAULT_TUBE_COLOR:
            s.setdefault("frame_tube_colors", {})[str(idx)] = color
    return _with_state(_mut)


def _save_bodywork_face(name, loop, color, opacity):
    """Add/update a bodywork face in persistent state."""
    def _mut(s):
        s.setdefault("bodywork_faces", {})[name] = {
            "loops": [list(loop)],
            "color": color,
            "opacity": opacity,
        }
    return _with_state(_mut)


def _delete_bodywork_face(name):
    """Remove a bodywork face from persistent state."""
    def _mut(s):
        s.get("bodywork_faces", {}).pop(name, None)
    return _with_state(_mut)


def _persist_aero_config(wing_name, wing_config):
    """Persist a wing/aero config dict."""
    def _mut(s):
        s[wing_name] = wing_config
    return _with_state(_mut)
