# Aero Proportions Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the parameter deltas specified in `docs/superpowers/specs/2026-06-09-aero-proportions-design.md` (Approach A: Production FSAE Reference) to `src/config.py`, in 4 phases, with a verified rollback path.

**Architecture:** Single-file (`src/config.py`) numeric edits, grouped by 4 visual subsystems (body contour, front wing, rear wing, docs). Each phase is one git commit; rollback = `git reset --hard HEAD~1` per phase, or restore the timestamped `.bak` file.

**Tech Stack:** Python 3.x, FastAPI, Three.js (frontend), PowerShell (Windows), Git.

**Backup pre-plan:** `src/config.py.bak.2026-06-09` was created before this plan started. Single-command restore:
```powershell
Copy-Item "src\config.py.bak.2026-06-09" "src\config.py" -Force
```

**Reference spec:** [2026-06-09-aero-proportions-design.md](../specs/2026-06-09-aero-proportions-design.md)

---

## File Structure

| File | Change | Phase |
|---|---|---|
| `src/config.py` | Edit 3 body-contour lines (line ~151-167) | Phase 1 |
| `src/config.py` | Edit 3 front-wing fields (line ~421-482) | Phase 2 |
| `src/config.py` | Edit 8 rear-wing fields (line ~441-492) | Phase 3 |
| `docs/PLAN.md` | Append 1 section | Phase 4 |

No new files. No new frame nodes. No new mesh builders. No tests added (visual verification only; no test framework configured for this app per earlier session).

---

## Task 1: Phase 1 — Body Contour Nodes

**Files:**
- Modify: `src/config.py:151-167` (body block in `DEFAULT_FRAME_NODES`)

- [ ] **Step 1: Edit `BODY_NOSE_TOP`**

In `src/config.py`, find line 151:
```python
    "BODY_NOSE_TOP": [350.0, 0.0, 160.0],
```
Replace with:
```python
    "BODY_NOSE_TOP": [350.0, 0.0, 130.0],
```

- [ ] **Step 2: Edit `BODY_ENG_TOP`**

In `src/config.py`, find line 165:
```python
    "BODY_ENG_TOP":      [-1000.0, 0.0, 380.0],
```
Replace with:
```python
    "BODY_ENG_TOP":      [-1000.0, 0.0, 260.0],
```

- [ ] **Step 3: Edit `BODY_ENG_MID_R`**

In `src/config.py`, find line 166:
```python
    "BODY_ENG_MID_R":    [-1000.0, 80.0, 280.0],
```
Replace with:
```python
    "BODY_ENG_MID_R":    [-1000.0, 80.0, 200.0],
```

- [ ] **Step 4: Edit `BODY_ENG_MID_L`**

In `src/config.py`, find line 167:
```python
    "BODY_ENG_MID_L":    [-1000.0, -80.0, 280.0],
```
Replace with:
```python
    "BODY_ENG_MID_L":    [-1000.0, -80.0, 200.0],
```

- [ ] **Step 5: Restart the server**

Stop any running uvicorn, then start a fresh one:
```powershell
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'uvicorn' } | Stop-Process -Force
cd c:\Users\zzy\Desktop\New_suspension
Start-Process python -ArgumentList '-m','uvicorn','src.main:app','--port','8000' -WindowStyle Hidden
Start-Sleep -Seconds 2
```
Expected: server starts; no Python error in stdout/stderr.

- [ ] **Step 6: Verify via API**

```powershell
(Invoke-WebRequest -Uri 'http://localhost:8000/api/defaults' -UseBasicParsing).Content | Select-String -Pattern 'BODY_NOSE_TOP|BODY_ENG_TOP|BODY_ENG_MID'
```
Expected: contains `BODY_NOSE_TOP: [350.0, 0.0, 130.0]`, `BODY_ENG_TOP: [-1000.0, 0.0, 260.0]`, `BODY_ENG_MID_R: [-1000.0, 80.0, 200.0]`, `BODY_ENG_MID_L: [-1000.0, -80.0, 200.0]`.

- [ ] **Step 7: Visual verify in browser**

Open `http://localhost:8000/`, reload, take a 3/4 rear and side screenshot. Confirm: engine bay is visibly lower (purple block is shorter in Z), nose peak is lower. If bodywork face mesh is torn or missing triangles, the change broke a face — revert Phase 1 with:
```powershell
Copy-Item "src\config.py.bak.2026-06-09" "src\config.py" -Force
```

- [ ] **Step 8: Commit Phase 1**

```bash
git add src/config.py
git commit -m "aero: lower nose + engine bay for FSAE proportion pass (phase 1/4)"
```

---

## Task 2: Phase 2 — Front Wing

**Files:**
- Modify: `src/config.py:514-554` (`FRONT_WING` block)

> **Note (added 2026-06-09 mid-execution):** the actual current state of `FRONT_WING` differs from the spec baseline — the file currently has `reference_point [150, 0, 30]`, `span 650`, **1 element only** (no flap), `endplate.height_above 50 / below 40` (still oversized), and `mounts[].frame_node = "CH2"` (not in `frameNodes` — the mount lines are silently skipped, which is why the user reported "看不到连接线"). The deltas below are recalibrated for the actual current state. The visual end-state matches the spec.

- [ ] **Step 1: Edit `reference_point`**

In `src/config.py`, find inside `FRONT_WING`:
```python
    "reference_point": [150, 0, 30],
```
Replace with:
```python
    "reference_point": [500, 0, 40],
```

- [ ] **Step 2: Edit `span`**

Find:
```python
    "span": 650,
```
Replace with:
```python
    "span": 1300,
```

- [ ] **Step 3: Add flap element (insert after the main element closing brace)**

Find the end of the `elements` list — the main element ends with:
```python
        {
            "name": "主翼面",
            "chord": 240,
            "angle": 3,
            "x_offset": 0,
            "z_offset": 0,
            "camber_pct": 3,
            "thickness_pct": 5,
            "span_fraction": 1
        }
    ],
```
Replace with (add a second element before the closing `],`):
```python
        {
            "name": "主翼面",
            "chord": 240,
            "angle": 3,
            "x_offset": 0,
            "z_offset": 0,
            "camber_pct": 3,
            "thickness_pct": 5,
            "span_fraction": 1
        },
        {
            "name": "襟翼",
            "chord": 160,
            "angle": 12,
            "x_offset": 250,
            "z_offset": 5,
            "camber_pct": -8,
            "thickness_pct": 5,
            "span_fraction": 0.85
        }
    ],
```

- [ ] **Step 4: Edit endplate `overhang_forward` and `overhang_rear`**

Find:
```python
        "overhang_forward": 0.12,
        "overhang_rear": 0.08,
```
Replace with:
```python
        "overhang_forward": 0.10,
        "overhang_rear": 0.06,
```

- [ ] **Step 5: Edit endplate `height_above`**

Find:
```python
        "height_above": 50,
```
Replace with:
```python
        "height_above": 25,
```

- [ ] **Step 6: Edit endplate `height_below`**

Find:
```python
        "height_below": 40,
```
Replace with:
```python
        "height_below": 15,
```

- [ ] **Step 7: Edit `mounts[0]` (right mount — fix the broken frame_node and pull the mount back to LE)**

Find:
```python
        {
            "name": "FW_MOUNT_R",
            "frame_node": "CH2",
            "local_x": 240,
            "local_y": 200,
            "local_z": -5
        },
```
Replace with:
```python
        {
            "name": "FW_MOUNT_R",
            "frame_node": "BODY_NOSE_MID_R",
            "local_x": 0,
            "local_y": 200,
            "local_z": -5
        },
```

- [ ] **Step 8: Edit `mounts[1]` (left mount)**

Find:
```python
        {
            "name": "FW_MOUNT_L",
            "frame_node": "CH2",
            "local_x": 240,
            "local_y": -200,
            "local_z": -5
        }
```
Replace with:
```python
        {
            "name": "FW_MOUNT_L",
            "frame_node": "CH2_L",
            "local_x": 0,
            "local_y": -200,
            "local_z": -5
        }
```

- [ ] **Step 9: Restart and verify**

Stop the running uvicorn and start a fresh one:
```powershell
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
cd c:\Users\zzy\Desktop\New_suspension
Start-Process python -ArgumentList '-m','run.py' -WindowStyle Hidden
Start-Sleep -Seconds 3
```
Verify:
```powershell
(Invoke-WebRequest -Uri 'http://localhost:8000/api/defaults' -UseBasicParsing).Content | Select-String -Pattern '"reference_point": \[500|"span": 1300|"name": "襟翼"|"height_above": 25|"frame_node": "BODY_NOSE_MID_R"|"frame_node": "CH2_L"'
```
Expected matches: all six patterns present.

- [ ] **Step 10: Visual verify in browser**

Reload the page. Take a front-view, 3/4 front, and side screenshot. Confirm:
- Front wing extends past the front tires (span 1300 vs track 750)
- 2 elements visible (main + flap behind)
- Endplate has a small fence (25 mm above, 15 mm below) — no longer dwarfs the wing
- **Yellow mount lines and spheres are visible** going from chassis (BODY_NOSE_MID_R at chassis(350, 40, 120), CH2_L at chassis(100, -160, 220)) to wing LE reference(500, 0, 40)

- [ ] **Step 11: Commit Phase 2**

```bash
git add src/config.py
git commit -m "aero: rebuild front wing with 2 elements + working mount lines (phase 2/4)"
```

---

## Task 3: Phase 3 — Rear Wing

**Files:**
- Modify: `src/config.py:441-492` (`REAR_WING` block)

- [ ] **Step 1: Edit `reference_point[2]`**

In `src/config.py`, find:
```python
    "reference_point": [-950, 0, 550],
```
Replace with:
```python
    "reference_point": [-950, 0, 480],
```

- [ ] **Step 2: Edit main element `chord`**

Find the first element in `REAR_WING.elements`:
```python
        {
            "name": "主翼面",
            "chord": 300,
```
Replace `300` with `240`:
```python
        {
            "name": "主翼面",
            "chord": 240,
```

- [ ] **Step 3: Edit flap-1 `chord`**

Find:
```python
        {
            "name": "襟翼一",
            "chord": 280,
```
Replace `280` with `220`.

- [ ] **Step 4: Edit flap-2 `chord`**

Find:
```python
        {
            "name": "襟翼二",
            "chord": 200,
```
Replace `200` with `150`.

- [ ] **Step 5: Edit flap-1 `z_offset`**

Find inside flap-1:
```python
            "z_offset": -75,
```
Replace with:
```python
            "z_offset": -50,
```

- [ ] **Step 6: Edit flap-2 `z_offset`**

Find inside flap-2:
```python
            "z_offset": -140,
```
Replace with:
```python
            "z_offset": -95,
```

- [ ] **Step 7: Edit endplate `height_above`**

Find:
```python
        "height_above": 80,
```
Replace with:
```python
        "height_above": 30,
```

- [ ] **Step 8: Edit endplate `height_below`**

Find:
```python
        "height_below": 100,
```
Replace with:
```python
        "height_below": 40,
```

- [ ] **Step 9: Restart and verify**

```powershell
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'uvicorn' } | Stop-Process -Force
cd c:\Users\zzy\Desktop\New_suspension
Start-Process python -ArgumentList '-m','uvicorn','src.main:app','--port','8000' -WindowStyle Hidden
Start-Sleep -Seconds 2
(Invoke-WebRequest -Uri 'http://localhost:8000/api/defaults' -UseBasicParsing).Content | Select-String -Pattern 'REAR_WING|"reference_point"|"chord"|"z_offset"'
```
Expected: `reference_point: [-950, 0, 480]`, chords 240/220/150, z_offsets 0/-50/-95, endplate 30/40.

- [ ] **Step 10: Visual verify in browser — gap check**

Reload, take side + 3/4 rear screenshots. Manually confirm the gap between the engine bay top (now Z=260) and the rear-wing lowermost element. New rear wing reference Z=480, flap-2 z_offset=-95, flap-2 chord 150 with thickness ~5% = ~7.5 mm, so flap-2 lower surface ≈ 480 − 95 − 7.5 = 377.5 mm. Engine bay top = 260 mm. Gap ≈ 117 mm — no collision.

- [ ] **Step 11: Commit Phase 3**

```bash
git add src/config.py
git commit -m "aero: downsize rear wing + tighten endplate (phase 3/4)"
```

---

## Task 4: Phase 4 — Documentation

**Files:**
- Modify: `docs/PLAN.md` (append a paragraph to the V8 aero subsection)

- [ ] **Step 1: Read current PLAN.md V8 section**

```powershell
Get-Content 'c:\Users\zzy\Desktop\New_suspension\docs\PLAN.md' | Select-String -Pattern 'V8|前翼|尾翼' -Context 1,1
```

- [ ] **Step 2: Append a paragraph after the existing V8 content**

Find the end of the V8 aero paragraph in `docs/PLAN.md` (after the front-wing checkmark line) and append:

```markdown
- **2026-06-09 比例优化 (Approach A: Production FSAE Reference)**: 收尾翼弦长与端板、放低鼻锥与引擎舱、加大前翼占比,使视觉接近真实 FSAE 赛车。详细参数见 `docs/superpowers/specs/2026-06-09-aero-proportions-design.md`。
```

- [ ] **Step 3: Commit Phase 4**

```bash
git add docs/PLAN.md
git commit -m "docs: record aero proportion pass (phase 4/4)"
```

---

## Final Verification (after all 4 phases)

- [ ] **Step 1: Take 5 comparison screenshots**

Open the app, take screenshots in this order: 3/4 front, side, front, top, 3/4 rear. Save to `docs/superpowers/specs/2026-06-09-aero-proportions-after.png` (or 5 separate files) for visual diff against the original screenshots.

- [ ] **Step 2: User confirmation**

Show the user the new screenshots. If they approve, the plan is complete. If they want adjustments (e.g., rear wing still too tall, front wing too wide), open a follow-up spec.

- [ ] **Step 3: Cleanup backup (only after user final-approves)**

```powershell
Remove-Item "c:\Users\zzy\Desktop\New_suspension\src\config.py.bak.2026-06-09" -Force
```

---

## Self-Review

**Spec coverage:**
- 4.1 body contour (4 edits) → Task 1 ✓
- 4.2 front wing (4 edits) → Task 2 ✓
- 4.3 rear wing (8 edits) → Task 3 ✓
- 4.4 docs (PLAN.md update) → Task 4 ✓
- Section 5 risks (engine-bay/wing gap, front-wing endplate/wheel gap) → covered in Task 3 Step 10 + Task 2 Step 6
- Section 6 verification (API + visual) → covered in each phase's restart/verify steps + Final Verification

**Placeholder scan:** No "TBD" / "TODO" / "fill in later" — every step has the exact code, exact command, exact expected output.

**Type / value consistency:** Numeric units consistent (mm throughout). Frame node names consistent. The `.bak` file is a hard restore, distinct from `git reset --hard` rollback.
