# Aero Proportions Optimization — Production FSAE Reference

**Date:** 2026-06-09
**Status:** Draft (pending user review)
**Owner:** zzy
**Scope:** Visual proportions + aero balance for the front wing, rear wing, and nose/engine bay bodywork of the FSAE car visualized by `New_suspension`.

---

## 1. Background & Problem

The current 3D renderings of the FSAE chassis (see screenshots from 2026-06-09 session) show several visual/aero proportion issues that make the car look like a chassis prototype rather than a competition-ready FSAE car:

1. **Rear wing dominance.** The rear wing has 3 elements (chord 300/280/200 mm) with endplates 80 mm above and 100 mm below the outermost element. It visually outweighs the front wing, producing a heavily rear-biased aero balance.
2. **Engine bay too tall.** `BODY_ENG_TOP = Z=380` and `BODY_ENG_MID = Z=280` produce a tall purple block that visually crowds the rear wing's inflow and breaks the teardrop silhouette.
3. **Nose too peaked.** `BODY_NOSE_TOP = Z=160` over a short 200 mm chord makes the front bodywork look like a triangular wedge; FSAE cars use a much lower, more elongated nose.
4. **Front wing under-developed.** Span 1100 mm, main chord 240 mm, modest endplate fences — visually thin compared to the rear wing.
5. **No diffuser / floor detail.** The flat undertray terminates without a visible diffuser, leaving the rear of the car visually unfinished.

User has approved **Approach A: Production FSAE Reference** as the optimization direction. This document specifies the exact parameter changes and the order in which to apply them.

---

## 2. Goals

| # | Goal | Success criterion |
|---|---|---|
| G1 | Make the car visually identifiable as a competition FSAE car | New screenshots reviewed by user show: low pointed nose, low engine bay, dominant front wing, modest rear wing endplates. |
| G2 | Bring front/rear aero balance closer to neutral | Visual mass front:rear moves from ~30:70 to ~45:55. |
| G3 | Avoid adding new frame nodes (no `hardpoints.py` changes) | Differs, mounts, and rocker kinematics unchanged. |
| G4 | Keep all changes reversible via `config.py` only | Roll-back = revert one config block. |

Non-goals:
- No actual CFD/FEA validation — this is a visual/proportion pass, not an aero performance certification.
- No new components (side pods, shark fin) — out of scope; tracked for a later milestone.

---

## 3. Affected files

| File | Lines (approx) | Change type |
|---|---|---|
| `src/config.py` | 102-171 (`DEFAULT_FRAME_NODES` body-contour block) | Modify `BODY_NOSE_TOP`, `BODY_ENG_TOP`, `BODY_ENG_MID` coordinates |
| `src/config.py` | 421-482 (`FRONT_WING`) | Modify `span`, `elements[0].angle`, `endplate.height_above` |
| `src/config.py` | 441-492 (`REAR_WING`) | Modify `reference_point[2]`, `elements[].chord`, `elements[].z_offset`, `endplate.height_*` |
| `docs/PLAN.md` | V8 aero section | Update status, append a note that proportions pass complete |
| (no new file) | — | No new frame nodes, no new mesh builder code |

Files explicitly NOT touched:
- `src/hardpoints.py` — no new mirror points needed
- `src/main.py` — `/api/defaults` and `/api/save_*` already return the modified dicts
- `static/index.html` — `buildFrontWing` / `buildRearWing` already consume the updated parameters
- `src/persistence.py` — existing save functions already write the modified dicts

---

## 4. Design — exact parameter deltas

All units in mm. Coordinates are in the same world frame already in use (X forward, Y right, Z up).

### 4.1 Body contour nodes (`DEFAULT_FRAME_NODES` body block)

| Key | Current `[x, y, z]` | New `[x, y, z]` | Rationale |
|---|---|---|---|
| `BODY_NOSE_TOP` | `[350, 0, 160]` | `[350, 0, 130]` | Lower the nose peak; FSAE nose rarely exceeds front-bulkhead top by > 50 mm. Z=130 keeps `BODY_NOSE_TOP` strictly above `BODY_NOSE_MID_*` (Z=120) so the nose profile still tapers up correctly. |
| `BODY_ENG_TOP` | `[-1000, 0, 380]` | `[-1000, 0, 260]` | Lower engine cover by 120 mm; creates clearance to rear wing |
| `BODY_ENG_MID_R` | `[-1000, 80, 280]` | `[-1000, 80, 200]` | Side mid-height matches new top, keeps the teardrop taper |
| `BODY_ENG_MID_L` | `[-1000, -80, 280]` | `[-1000, -80, 200]` | (mirrored) |

> Note: `BODY_NOSE_MID_*` (Z=120), `BODY_NOSE_BOT` (Z=80), `BODY_LWR_MID_*`, `BODY_UPR_FWD_*` are unchanged — they are part of the suspension/aero lower envelope and shouldn't move in this pass.

### 4.2 Front wing (`FRONT_WING`)

| Field | Current | New | Rationale |
|---|---|---|---|
| `span` | `1100` | `1300` | Wider than front track (750 mm) by 1.7× for visible outwash |
| `elements[0].angle` | `3` | `5` | Stronger main-element AOA gives a more visible leading edge and front downforce |
| `endplate.height_above` | `10` | `25` | 25 mm tip fence is the standard visual cue for a real front-wing endplate |
| `endplate.height_below` | `10` | `15` | Slight downward fence to seal the slot flow |

All other front-wing fields unchanged: `reference_point [500,0,40]`, flap chord/angle, mount positions.

### 4.3 Rear wing (`REAR_WING`)

| Field | Current | New | Rationale |
|---|---|---|---|
| `reference_point[2]` | `550` | `480` | Lower rear wing to clear the new lower engine bay; keeps ≥ 50 mm gap |
| `elements[0].chord` (main) | `300` | `240` | Reduce visual mass of main element |
| `elements[1].chord` (flap 1) | `280` | `220` | Matched scale-down of flap |
| `elements[2].chord` (flap 2) | `200` | `150` | Matched scale-down of upper flap |
| `elements[1].z_offset` | `-75` | `-50` | Tighten element spacing to match new chord |
| `elements[2].z_offset` | `-140` | `-95` | Same |
| `endplate.height_above` | `80` | `30` | Real rear-wing endplates extend ~ element-chord/4 above the top element |
| `endplate.height_below` | `100` | `40` | Same logic below |
| `endplate.overhang_forward` | `0.12` | `0.10` | Slight trim, no visual change |
| `endplate.overhang_rear` | `0.06` | `0.04` | Same |

All other rear-wing fields unchanged: AOA values, camber, mount positions.

### 4.4 Order of application

1. **Phase 1 — body contour** (4.1)
   - Edit `DEFAULT_FRAME_NODES` body block.
   - Restart server, verify chassis + bodywork face render correctly.
2. **Phase 2 — front wing** (4.2)
   - Edit `FRONT_WING` span, element[0].angle, endplate heights.
   - Verify front wing renders, mount lines visible from `CH2_L` and `BODY_NOSE_MID_R`.
3. **Phase 3 — rear wing** (4.3)
   - Edit `REAR_WING` reference_point.z, element chords/z_offsets, endplate.
   - Verify rear wing still clears engine bay (visually + manually check Z gap ≥ 50 mm).
4. **Phase 4 — documentation** (4.4 docs)
   - Update `docs/PLAN.md` V8 aero subsection with the proportion pass results.

### 4.5 Optional follow-up (NOT in this spec)

- Add a diffuser block to `FRONT_WING` (or new `DIFFUSER` dict) — requires new mesh builder, deferred.
- Add side-pod model — deferred to V8.x.
- Add shark-fin — deferred.

---

## 5. Risk & rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engine bay lowered too much, intersects with rear-wing mounts | Low | Medium | Phase 3 includes a manual Z-gap check; if intersect, raise `BODY_ENG_TOP` by 20 mm |
| Front wing wider than chassis tube (`FB_LWR_R/L` at Y=±93.8) collides with endplate | Low | Low | Phase 2 manual check: front wing endplate at Y=±650, FB at Y=±94, no collision (557 mm clearance) |
| New nose height causes `BODY_NOSE_MID_*` (Z=120) to be higher than `BODY_NOSE_TOP` (Z=110) — inverted profile | Resolved at design time | n/a | `BODY_NOSE_TOP` set to Z=130 (above mid Z=120) per 4.1. No collision possible. |
| Cached Python import doesn't pick up the new config | High (known issue from earlier session) | Low | Hard restart server with `Stop-Process` before each phase verification |

**Rollback:** Revert the four `Edit` operations in `src/config.py`. All changes are within a single file, so a single `git diff` shows the full delta.

---

## 6. Verification

After each phase:

1. Restart uvicorn (force kill + restart, not reload — reload is known to be unreliable here).
2. Hit `GET /api/defaults`; confirm the new values come back.
3. Reload the browser; visually verify in the 3D scene:
   - **Phase 1:** bodywork face mesh is lower and more streamlined; no torn/missing triangles.
   - **Phase 2:** front wing extends beyond front tires; endplate has visible 25 mm fence.
   - **Phase 3:** rear wing is smaller; endplate no longer dwarfs the elements; ≥ 50 mm gap to engine bay.
4. After all three phases, take 4 screenshots (3/4 front, side, front, top, 3/4 rear) and confirm visual quality.

---

## 7. Out of scope / future work

- Diffuser block (new mesh builder, new config dict)
- Side pods (new bodywork face group)
- Shark fin engine cover
- Front wing 3rd element (currently 2)
- Any actual downforce/drag measurement (would need OpenFOAM or similar)
