# 底板 + 扩散器实施计划

> 规范: `docs/superpowers/specs/2026-06-10-floor-diffuser-design.md`
> 目标: 为 FSAE 3D 可视化工具新增参数化底板 (undertray) 和扩散器 (diffuser) 组件
> 架构: 与前后翼完全一致的参数化范式 —— config.py 数据 → FastAPI 端点 → Three.js 渲染
> 技术栈: Python (FastAPI) + JavaScript (Three.js, 原生 ES modules)

## 文件修改总览

| 文件 | 任务 | 修改类型 |
|------|------|----------|
| `src/config.py` | T1 | 新增 UNDERTRAY_CONFIG, DIFFUSER_CONFIG 常量 |
| `src/persistence.py` | T2 | 新增 `_save_undertray_to_source()`, `_save_diffuser_to_source()` |
| `src/main.py` | T3 | 扩展 /api/defaults, 新增 save_undertray / save_diffuser 端点 |
| `web/js/state.js` | T4 | 新增 state 字段和 sceneObjects 容器 |
| `web/js/builders.js` | T5 | 新增 `buildUndertray()` 和 `buildDiffuser()` |
| `web/js/ui.js` | T6 | 新增底板/扩散器面板渲染和事件处理 |
| `web/js/solver.js` | T7 | loadDefaults 扩展两行 |
| `web/index.html` | T8 | 空气动力学区域新增面板容器 |
| `web/js/main.js` | 无修改 | rebuildScene 已通过 ui.js 间接调用 |
| `src/api_models.py` | 无修改 | 与 save_rear_wing 一样用 Request.json()，无需新 Pydantic model |

---

## Task 1: 配置数据 — config.py

**文件**: `src/config.py`
**位置**: FRONT_WING 之后, CHASSIS_KEYS 之前 (约第 544 行)

插入以下两个常量定义:

```python
# ============================================================
# UNDERTRAY — parametric floor panel
# ============================================================

UNDERTRAY_CONFIG = {
    "enabled": True,
    "front_x": 250.0,
    "rear_x": -895.0,
    "ground_clearance": 28.0,
    "half_width": 360.0,
    "venturi_depth": 15.0,
    "venturi_start_ratio": 0.3,
    "venturi_end_ratio": 0.6,
    "edge_flipups": [
        {
            "name": "FLIPUP_R",
            "side": "right",
            "start_ratio": 0.55,
            "length": 300.0,
            "height": 40.0,
            "angle": 35.0,
        },
        {
            "name": "FLIPUP_L",
            "side": "left",
            "start_ratio": 0.55,
            "length": 300.0,
            "height": 40.0,
            "angle": 35.0,
        },
    ],
    "strakes": [
        {
            "name": "STRAKE_R1",
            "side": "right",
            "y_ratio": 0.85,
            "start_ratio": 0.35,
            "length": 400.0,
            "height": 25.0,
            "angle": 50.0,
        },
        {
            "name": "STRAKE_R2",
            "side": "right",
            "y_ratio": 0.45,
            "start_ratio": 0.40,
            "length": 350.0,
            "height": 20.0,
            "angle": 45.0,
        },
        {
            "name": "STRAKE_L1",
            "side": "left",
            "y_ratio": 0.85,
            "start_ratio": 0.35,
            "length": 400.0,
            "height": 25.0,
            "angle": 50.0,
        },
        {
            "name": "STRAKE_L2",
            "side": "left",
            "y_ratio": 0.45,
            "start_ratio": 0.40,
            "length": 350.0,
            "height": 20.0,
            "angle": 45.0,
        },
    ],
    "mounts": [
        {"name": "UT_MOUNT_FR", "frame_node": "FB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_FL", "frame_node": "FB_LWR_L", "local_y": -80},
        {"name": "UT_MOUNT_RR", "frame_node": "RB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_RL", "frame_node": "RB_LWR_L", "local_y": -80},
    ],
    "color": "#22c55e",
    "opacity": 0.70,
}

# ============================================================
# DIFFUSER — parametric rear diffuser
# ============================================================

DIFFUSER_CONFIG = {
    "enabled": True,
    "start_x": -895.0,
    "length": 200.0,
    "angle": 10.0,
    "channels": 3,
    "strake_height": 35.0,
    "strake_angle": 75.0,
    "exit_half_width": 390.0,
    "exit_overhang": 20.0,
    "mounts": [
        {"name": "DIFF_MOUNT_R", "frame_node": "RB_LWR_R", "local_y": 80, "local_x": -20},
        {"name": "DIFF_MOUNT_L", "frame_node": "RB_LWR_L", "local_y": -80, "local_x": -20},
    ],
    "color": "#f43f5e",
    "opacity": 0.60,
}
```

**验证**: `python -c "from config import UNDERTRAY_CONFIG, DIFFUSER_CONFIG; print(UNDERTRAY_CONFIG['front_x'], DIFFUSER_CONFIG['angle'])"`
→ 应输出 `250.0 10.0`

---

## Task 2: 持久化函数 — persistence.py

**文件**: `src/persistence.py`
**位置**: `_save_front_wing_to_source()` 之后 (约第 238 行)

`_save_wing_to_source()` 已经是一个通用函数，支持任意变量名。只需添加两个薄包装器:

```python
def _save_undertray_to_source(ut_config):
    """Rewrite the entire UNDERTRAY_CONFIG dict in config.py source."""
    return _save_wing_to_source('UNDERTRAY_CONFIG', ut_config)


def _save_diffuser_to_source(df_config):
    """Rewrite the entire DIFFUSER_CONFIG dict in config.py source."""
    return _save_wing_to_source('DIFFUSER_CONFIG', df_config)
```

**验证**: 手动测试:
```python
from persistence import _save_undertray_to_source, _save_diffuser_to_source
# 不应抛出异常
```

---

## Task 3: API 端点 — main.py

**文件**: `src/main.py`

### 3a: 更新 import 语句 (第 32-34 行)

将:
```python
from config import (REAR_PREFIX, DESIGN_PARAMS, DEFAULT_FRAME_NODES, FRAME_TUBES,
                    FRAME_TUBE_COLORS, BODYWORK_FACES, REAR_WING, FRONT_WING,
                    CHASSIS_KEYS, UPRIGHT_KEYS, FLOAT_KEYS)
```
改为:
```python
from config import (REAR_PREFIX, DESIGN_PARAMS, DEFAULT_FRAME_NODES, FRAME_TUBES,
                    FRAME_TUBE_COLORS, BODYWORK_FACES, REAR_WING, FRONT_WING,
                    UNDERTRAY_CONFIG, DIFFUSER_CONFIG,
                    CHASSIS_KEYS, UPRIGHT_KEYS, FLOAT_KEYS)
```

### 3b: 更新 persistence import (main.py 顶部或 persistence import 处)

找到 persistence 的 import 行，添加新的函数:
```python
from persistence import (_save_rear_wing_to_source, _save_front_wing_to_source,
                         _save_undertray_to_source, _save_diffuser_to_source, ...)
```
（保留原有 import，只添加 `_save_undertray_to_source` 和 `_save_diffuser_to_source`）

### 3c: 扩展 GET /api/defaults 返回 (第 784-786 行)

在 `return` dict 中 `"front_wing": FRONT_WING,` 之后添加:
```python
        "undertray": UNDERTRAY_CONFIG,
        "diffuser": DIFFUSER_CONFIG,
```

### 3d: 新增 save 端点 (在 save_front_wing 之后, update_params 之前)

```python
# ============================================================
# SAVE UNDERTRAY
# ============================================================

@app.post("/api/save_undertray")
async def save_undertray(request: Request):
    """Persist UNDERTRAY_CONFIG back to config.py and update in-memory."""
    config = await request.json()
    UNDERTRAY_CONFIG.clear()
    UNDERTRAY_CONFIG.update(config)
    permanent = _save_undertray_to_source(UNDERTRAY_CONFIG)
    return {"ok": True, "permanent": permanent}


# ============================================================
# SAVE DIFFUSER
# ============================================================

@app.post("/api/save_diffuser")
async def save_diffuser(request: Request):
    """Persist DIFFUSER_CONFIG back to config.py and update in-memory."""
    config = await request.json()
    DIFFUSER_CONFIG.clear()
    DIFFUSER_CONFIG.update(config)
    permanent = _save_diffuser_to_source(DIFFUSER_CONFIG)
    return {"ok": True, "permanent": permanent}
```

**验证**: 启动服务器后:
```bash
python -c "import requests; r=requests.get('http://127.0.0.1:8000/api/defaults'); d=r.json(); print('undertray' in d, 'diffuser' in d)"
```
→ 应输出 `True True`

---

## Task 4: 状态管理 — state.js

**文件**: `web/js/state.js`

### 4a: sceneObjects 新增容器 (第 44 行后, frontWing 之后)

在 `frontWing: { meshes: [], mountSpheres: [], mountLines: [] },` 之后添加:
```javascript
        undertray: { meshes: [], flipups: [], strakes: [], mountSpheres: [], mountLines: [] },
        diffuser: { meshes: [], strakeMeshes: [], mountSpheres: [], mountLines: [] },
```

### 4b: state 根级新增配置引用 (第 73 行后, frontWingConfig 之后)

在 `frontWingConfig: null,` 之后添加:
```javascript
    undertrayConfig: null,
    diffuserConfig: null,
```

---

## Task 5: 3D 渲染 — builders.js

**文件**: `web/js/builders.js`
**位置**: `buildFrontWing()` 函数之后 (约第 514 行后)

### 5a: buildUndertray()

```javascript
// ============================================================
// UNDERTRAY (floor panel)
// ============================================================

export function buildUndertray() {
    const uobj = state.sceneObjects.undertray;
    // Cleanup
    const allMeshes = [...uobj.meshes, ...uobj.flipups, ...uobj.strakes, ...uobj.mountSpheres, ...uobj.mountLines];
    allMeshes.forEach(m => { state.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    uobj.meshes = []; uobj.flipups = []; uobj.strakes = []; uobj.mountSpheres = []; uobj.mountLines = [];

    if (!state.undertrayConfig || !state.undertrayConfig.enabled) return;

    const cfg = state.undertrayConfig;
    const frontX = cfg.front_x, rearX = cfg.rear_x;
    const gc = cfg.ground_clearance, hw = cfg.half_width;
    const vDepth = cfg.venturi_depth;
    const vStart = cfg.venturi_start_ratio, vEnd = cfg.venturi_end_ratio;
    const color = cfg.color || '#22c55e';
    const opacity = cfg.opacity ?? 0.70;
    const totalLen = frontX - rearX; // front_x > rear_x (front is positive X)

    // --- 1. Floor panel surface ---
    // Sample longitudinal profile points (x and ratio only; z computed per-vertex below)
    const nSamples = 24;
    const profilePts = [];
    for (let i = 0; i <= nSamples; i++) {
        const t = i / nSamples; // 0 = front edge, 1 = rear edge
        const x = frontX - t * totalLen;
        profilePts.push({ x, t });
    }

    // Build mesh grid: longitudinal × lateral
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const indices = [];
    const nLateral = 8; // lateral subdivisions
    for (let i = 0; i < profilePts.length; i++) {
        const p = profilePts[i];
        for (let j = 0; j <= nLateral; j++) {
            const latT = j / nLateral;
            const y = -hw + latT * 2 * hw;
            // Apply venturi dip to center region (y near 0)
            let z = gc;
            const yRatio = Math.abs(y) / hw; // 0 at center, 1 at edge
            if (p.t >= vStart && p.t <= vEnd) {
                // Deeper at center, zero at edges
                const centerFactor = 1.0 - yRatio;
                const localT = (p.t - vStart) / (vEnd - vStart);
                z = gc - vDepth * Math.sin(localT * Math.PI) * centerFactor;
            }
            verts.push(p.x, y, z);
        }
    }
    const stride = nLateral + 1;
    for (let i = 0; i < profilePts.length - 1; i++) {
        for (let j = 0; j < nLateral; j++) {
            const a = i * stride + j;
            const b = a + 1;
            const c = (i + 1) * stride + j;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Apply chassisTransform to all vertices
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const wp = chassisTransform([pos.getX(i), pos.getY(i), pos.getZ(i)]);
        pos.setXYZ(i, ...wp);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, transparent: true, opacity, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { aeroType: 'undertray_panel' };
    state.scene.add(mesh);
    uobj.meshes.push(mesh);

    // --- 2. Edge flip-ups ---
    for (const fu of (cfg.edge_flipups || [])) {
        const isRight = fu.side === 'right';
        const ySign = isRight ? 1 : -1;
        const baseY = ySign * hw;
        const startX = frontX - fu.start_ratio * totalLen;
        const endX = startX - fu.length;
        const flipAngle = (fu.angle || 35) * Math.PI / 180;
        const flipH = fu.height || 40;

        const fuSamples = 12;
        const fuVerts = [];
        const fuIndices = [];
        for (let i = 0; i <= fuSamples; i++) {
            const t = i / fuSamples;
            const x = startX - t * (startX - endX);
            // Smooth ramp from base to full height
            const ramp = Math.sin(t * Math.PI * 0.5);
            const zBase = gc;
            const zTip = gc + flipH * ramp;
            const yBase = baseY;
            const yTip = baseY + ySign * (flipH * 0.3) * ramp; // slight outward lean
            // Bottom edge (attached to floor edge)
            fuVerts.push(x, yBase, zBase);
            // Top edge (flipped up)
            fuVerts.push(x, yTip, zTip);
        }
        for (let i = 0; i < fuSamples; i++) {
            const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
            fuIndices.push(a, c, b, b, c, d);
        }
        const fuGeo = new THREE.BufferGeometry();
        fuGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fuVerts), 3));
        fuGeo.setIndex(fuIndices);
        fuGeo.computeVertexNormals();
        const fuPos = fuGeo.attributes.position;
        for (let i = 0; i < fuPos.count; i++) {
            const wp = chassisTransform([fuPos.getX(i), fuPos.getY(i), fuPos.getZ(i)]);
            fuPos.setXYZ(i, ...wp);
        }
        fuGeo.computeVertexNormals();
        const fuMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15, transparent: true, opacity: opacity * 0.9, side: THREE.DoubleSide });
        const fuMesh = new THREE.Mesh(fuGeo, fuMat);
        fuMesh.userData = { aeroType: 'undertray_flipup', name: fu.name };
        state.scene.add(fuMesh);
        uobj.flipups.push(fuMesh);
    }

    // --- 3. Underfloor strakes ---
    for (const sk of (cfg.strakes || [])) {
        const isRight = sk.side === 'right';
        const ySign = isRight ? 1 : -1;
        const skY = ySign * hw * (sk.y_ratio || 0.5);
        const startX = frontX - (sk.start_ratio || 0.3) * totalLen;
        const endX = startX - (sk.length || 300);
        const skH = sk.height || 20;
        const skAngle = (sk.angle || 45) * Math.PI / 180;

        const skSamples = 8;
        const skVerts = [];
        const skIndices = [];
        for (let i = 0; i <= skSamples; i++) {
            const t = i / skSamples;
            const x = startX - t * (startX - endX);
            // Taper height at start and end
            const taper = Math.sin(t * Math.PI);
            const h = skH * taper;
            // Bottom edge (on floor surface)
            skVerts.push(x, skY, gc);
            // Top edge (angled outward)
            const yOff = ySign * h * Math.cos(skAngle);
            const zOff = h * Math.sin(skAngle);
            skVerts.push(x, skY + yOff, gc + zOff);
        }
        for (let i = 0; i < skSamples; i++) {
            const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
            skIndices.push(a, c, b, b, c, d);
        }
        const skGeo = new THREE.BufferGeometry();
        skGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(skVerts), 3));
        skGeo.setIndex(skIndices);
        skGeo.computeVertexNormals();
        const skPos = skGeo.attributes.position;
        for (let i = 0; i < skPos.count; i++) {
            const wp = chassisTransform([skPos.getX(i), skPos.getY(i), skPos.getZ(i)]);
            skPos.setXYZ(i, ...wp);
        }
        skGeo.computeVertexNormals();
        const skMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15, transparent: true, opacity: opacity * 0.85, side: THREE.DoubleSide });
        const skMesh = new THREE.Mesh(skGeo, skMat);
        skMesh.userData = { aeroType: 'undertray_strake', name: sk.name };
        state.scene.add(skMesh);
        uobj.strakes.push(skMesh);
    }

    // --- 4. Mounts ---
    // Determine front/rear from mount name, not from Y sign
    for (const m of (cfg.mounts || [])) {
        const fn = m.frame_node;
        const isRight = (m.local_y ?? 0) >= 0;
        const chassisPt = resolveChassisNode(fn, isRight);
        if (!chassisPt) continue;
        // Mount X: front mounts near front_x, rear mounts near rear_x
        const isFrontMount = m.name.includes('_FR') || m.name.includes('_FL');
        const mountX = isFrontMount ? frontX * 0.8 + rearX * 0.2 : frontX * 0.2 + rearX * 0.8;
        const mountTarget = chassisTransform([mountX, m.local_y ?? 0, gc]);
        const s = sphere('#fbbf24', 5);
        s.position.set(...chassisPt);
        s.userData = { aeroType: 'mount', pointName: m.name };
        state.scene.add(s);
        uobj.mountSpheres.push(s);
        const l = lineSegment(chassisPt, mountTarget, '#fbbf24');
        l.userData = { aeroType: 'mount_line' };
        state.scene.add(l);
        uobj.mountLines.push(l);
    }
}
```

### 5b: buildDiffuser()

```javascript
// ============================================================
// DIFFUSER
// ============================================================

export function buildDiffuser() {
    const dobj = state.sceneObjects.diffuser;
    const allMeshes = [...dobj.meshes, ...dobj.strakeMeshes, ...dobj.mountSpheres, ...dobj.mountLines];
    allMeshes.forEach(m => { state.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    dobj.meshes = []; dobj.strakeMeshes = []; dobj.mountSpheres = []; dobj.mountLines = [];

    if (!state.diffuserConfig || !state.diffuserConfig.enabled) return;

    const cfg = state.diffuserConfig;
    const utCfg = state.undertrayConfig;
    const startX = cfg.start_x;
    const length = cfg.length;
    const angle = cfg.angle * Math.PI / 180;
    const channels = cfg.channels || 3;
    const strakeH = cfg.strake_height || 35;
    const strakeAngle = (cfg.strake_angle || 75) * Math.PI / 180;
    const exitHW = cfg.exit_half_width || 390;
    const exitOverhang = cfg.exit_overhang || 20;
    const color = cfg.color || '#f43f5e';
    const opacity = cfg.opacity ?? 0.60;

    // Entry matches undertray rear edge
    const entryHW = utCfg ? utCfg.half_width : 360;
    const entryZ = utCfg ? utCfg.ground_clearance : 28;
    const exitX = startX - length - exitOverhang;
    const exitZ = entryZ + length * Math.tan(angle);

    // --- 1. Diffuser panel (trapezoidal expanding surface) ---
    const nLong = 12, nLat = 12;
    const diffVerts = [];
    const diffIndices = [];
    for (let i = 0; i <= nLong; i++) {
        const t = i / nLong; // 0 = entry, 1 = exit
        const x = startX - t * length;
        const z = entryZ + t * (exitZ - entryZ);
        const hw = entryHW + t * (exitHW - entryHW);
        for (let j = 0; j <= nLat; j++) {
            const latT = j / nLat;
            const y = -hw + latT * 2 * hw;
            diffVerts.push(x, y, z);
        }
    }
    const dStride = nLat + 1;
    for (let i = 0; i < nLong; i++) {
        for (let j = 0; j < nLat; j++) {
            const a = i * dStride + j;
            const b = a + 1;
            const c = (i + 1) * dStride + j;
            const d = c + 1;
            diffIndices.push(a, c, b, b, c, d);
        }
    }
    const diffGeo = new THREE.BufferGeometry();
    diffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(diffVerts), 3));
    diffGeo.setIndex(diffIndices);
    diffGeo.computeVertexNormals();
    const diffPos = diffGeo.attributes.position;
    for (let i = 0; i < diffPos.count; i++) {
        const wp = chassisTransform([diffPos.getX(i), diffPos.getY(i), diffPos.getZ(i)]);
        diffPos.setXYZ(i, ...wp);
    }
    diffGeo.computeVertexNormals();
    const diffMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, transparent: true, opacity, side: THREE.DoubleSide });
    const diffMesh = new THREE.Mesh(diffGeo, diffMat);
    diffMesh.userData = { aeroType: 'diffuser_panel' };
    state.scene.add(diffMesh);
    dobj.meshes.push(diffMesh);

    // --- 2. Diffuser strakes (vertical dividers) ---
    // channels=3 means 3 strakes dividing into 4 passages
    for (let ch = 1; ch <= channels; ch++) {
        const yRatio = ch / (channels + 1); // evenly spaced
        const strakeSamples = 8;
        const skVerts = [];
        const skIndices = [];
        // Determine which direction is "inward" (toward centerline y=0)
        const ySign = y > 0 ? -1 : 1; // inward means toward y=0
        for (let i = 0; i <= strakeSamples; i++) {
            const t = i / strakeSamples;
            const x = startX - t * length;
            const z = entryZ + t * (exitZ - entryZ);
            const hw = entryHW + t * (exitHW - entryHW);
            const y = -hw + yRatio * 2 * hw;
            // Taper height at entry and exit
            const taper = Math.sin(t * Math.PI);
            const h = strakeH * taper;
            // Bottom edge (on diffuser surface)
            skVerts.push(x, y, z);
            // Top edge (angled inward per strake_angle)
            const inwardY = ySign * h * Math.cos(strakeAngle);
            const zOff = h * Math.sin(strakeAngle);
            skVerts.push(x, y + inwardY, z + zOff);
        }
        for (let i = 0; i < strakeSamples; i++) {
            const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
            skIndices.push(a, c, b, b, c, d);
        }
        const skGeo = new THREE.BufferGeometry();
        skGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(skVerts), 3));
        skGeo.setIndex(skIndices);
        skGeo.computeVertexNormals();
        const skPos = skGeo.attributes.position;
        for (let k = 0; k < skPos.count; k++) {
            const wp = chassisTransform([skPos.getX(k), skPos.getY(k), skPos.getZ(k)]);
            skPos.setXYZ(k, ...wp);
        }
        skGeo.computeVertexNormals();
        const skMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15, transparent: true, opacity: opacity * 0.9, side: THREE.DoubleSide });
        const skMesh = new THREE.Mesh(skGeo, skMat);
        skMesh.userData = { aeroType: 'diffuser_strake', index: ch };
        state.scene.add(skMesh);
        dobj.strakeMeshes.push(skMesh);
    }

    // --- 3. Mounts ---
    for (const m of (cfg.mounts || [])) {
        const fn = m.frame_node;
        const isRight = (m.local_y ?? 0) >= 0;
        const chassisPt = resolveChassisNode(fn, isRight);
        if (!chassisPt) continue;
        const mountTarget = chassisTransform([startX + (m.local_x ?? 0), m.local_y ?? 0, entryZ]);
        const s = sphere('#fbbf24', 5);
        s.position.set(...chassisPt);
        s.userData = { aeroType: 'mount', pointName: m.name };
        state.scene.add(s);
        dobj.mountSpheres.push(s);
        const l = lineSegment(chassisPt, mountTarget, '#fbbf24');
        l.userData = { aeroType: 'mount_line' };
        state.scene.add(l);
        dobj.mountLines.push(l);
    }
}
```

**验证**: 启动服务器后打开浏览器，3D 视窗中应显示绿色底板和红色扩散器。

---

## Task 6: UI 面板 — ui.js

**文件**: `web/js/ui.js`

### 6a: 添加 import

在文件顶部的 builders import 中添加 `buildUndertray` 和 `buildDiffuser`:
```javascript
import { ..., buildUndertray, buildDiffuser } from './builders.js';
```

### 6b: rebuildScene() 扩展

在 `rebuildScene()` 中 `buildFrontWing()` 之后添加:
```javascript
        buildUndertray();
        buildDiffuser();
```

同时在 `renderFrontWingPanel()` 之后添加:
```javascript
        renderUndertrayPanel();
        renderDiffuserPanel();
```

### 6c: 新增 renderUndertrayPanel()

遵循 `renderRearWingPanel()` 的 DOM 生成模式，但更简单（没有嵌套 element 数组）。核心结构:

```javascript
export function renderUndertrayPanel() {
    const container = document.getElementById('undertrayListBody');
    if (!container) return;
    if (!state.undertrayConfig || !state.undertrayConfig.enabled) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">底板未配置</div>';
        return;
    }
    const cfg = state.undertrayConfig;
    let html = '';

    // 参数网格：每个参数一个 label + input
    const params = [
        { key: 'front_x', label: '前缘X', step: 5, min: -100, max: 500 },
        { key: 'rear_x', label: '后缘X', step: 5, min: -1200, max: -500 },
        { key: 'ground_clearance', label: '离地间隙', step: 1, min: 25, max: 60 },
        { key: 'half_width', label: '半宽', step: 5, min: 200, max: 400 },
        { key: 'venturi_depth', label: 'Venturi深度', step: 1, min: 0, max: 30 },
    ];
    html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1 mb-2">';
    for (const p of params) {
        html += '<label class="flex items-center justify-between gap-1">' +
            '<span class="text-[0.52rem] text-dim">' + p.label + '</span>' +
            '<input class="ut-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" ' +
            'data-ut="' + p.key + '" type="number" value="' + cfg[p.key] + '" step="' + p.step + '" min="' + p.min + '" max="' + p.max + '"></label>';
    }
    html += '</div>';

    html += '<div class="flex gap-1.5 mt-2">';
    html += '<button id="applyUtBtn" class="flex-1 bg-accent2 hover:bg-accent2/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">应用</button>';
    html += '<button id="saveUtPermBtn" class="flex-1 bg-accent hover:bg-accent/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">永久保存</button>';
    html += '</div>';

    container.innerHTML = html;
    setTimeout(() => {
        const applyBtn = document.getElementById('applyUtBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyUndertrayChanges);
        const saveBtn = document.getElementById('saveUtPermBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveUndertrayPermanent);
    }, 0);
}

function applyUndertrayChanges() {
    if (!state.undertrayConfig) return;
    const cfg = state.undertrayConfig;
    document.querySelectorAll('.ut-input').forEach(inp => {
        const key = inp.dataset.ut;
        const val = parseFloat(inp.value);
        if (!isNaN(val)) cfg[key] = val;
    });
    buildUndertray();
    const st = document.getElementById('saveStatus');
    if (st) { st.textContent = '✓ 底板已更新'; setTimeout(() => { if (st.textContent === '✓ 底板已更新') st.textContent = ''; }, 1500); }
}

async function saveUndertrayPermanent() {
    applyUndertrayChanges();
    const st = document.getElementById('saveStatus');
    try {
        const r = await fetch('/api/save_undertray', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.undertrayConfig) });
        const d = await r.json();
        if (st) st.textContent = d.ok ? '✓ 底板已永久保存到 config.py' : '✗ 保存失败';
    } catch (e) { if (st) st.textContent = '✗ 网络错误'; }
}
```

### 6d: 新增 renderDiffuserPanel()

与 renderUndertrayPanel() 结构相同:

```javascript
export function renderDiffuserPanel() {
    const container = document.getElementById('diffuserListBody');
    if (!container) return;
    if (!state.diffuserConfig || !state.diffuserConfig.enabled) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">扩散器未配置</div>';
        return;
    }
    const cfg = state.diffuserConfig;
    let html = '';

    const params = [
        { key: 'angle', label: '扩张角°', step: 0.5, min: 5, max: 15 },
        { key: 'length', label: '长度', step: 5, min: 100, max: 350 },
        { key: 'channels', label: '通道栅条数', step: 1, min: 1, max: 5 },
        { key: 'strake_height', label: '栅条高度', step: 1, min: 15, max: 60 },
        { key: 'exit_half_width', label: '出口半宽', step: 5, min: 250, max: 450 },
    ];
    html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1 mb-2">';
    for (const p of params) {
        html += '<label class="flex items-center justify-between gap-1">' +
            '<span class="text-[0.52rem] text-dim">' + p.label + '</span>' +
            '<input class="df-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" ' +
            'data-df="' + p.key + '" type="number" value="' + cfg[p.key] + '" step="' + p.step + '" min="' + p.min + '" max="' + p.max + '"></label>';
    }
    html += '</div>';

    html += '<div class="flex gap-1.5 mt-2">';
    html += '<button id="applyDfBtn" class="flex-1 bg-accent2 hover:bg-accent2/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">应用</button>';
    html += '<button id="saveDfPermBtn" class="flex-1 bg-accent hover:bg-accent/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">永久保存</button>';
    html += '</div>';

    container.innerHTML = html;
    setTimeout(() => {
        const applyBtn = document.getElementById('applyDfBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyDiffuserChanges);
        const saveBtn = document.getElementById('saveDfPermBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveDiffuserPermanent);
    }, 0);
}

function applyDiffuserChanges() {
    if (!state.diffuserConfig) return;
    const cfg = state.diffuserConfig;
    document.querySelectorAll('.df-input').forEach(inp => {
        const key = inp.dataset.df;
        const val = parseFloat(inp.value);
        if (!isNaN(val)) cfg[key] = val;
    });
    buildDiffuser();
    const st = document.getElementById('saveStatus');
    if (st) { st.textContent = '✓ 扩散器已更新'; setTimeout(() => { if (st.textContent === '✓ 扩散器已更新') st.textContent = ''; }, 1500); }
}

async function saveDiffuserPermanent() {
    applyDiffuserChanges();
    const st = document.getElementById('saveStatus');
    try {
        const r = await fetch('/api/save_diffuser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.diffuserConfig) });
        const d = await r.json();
        if (st) st.textContent = d.ok ? '✓ 扩散器已永久保存到 config.py' : '✗ 保存失败';
    } catch (e) { if (st) st.textContent = '✗ 网络错误'; }
}
```

---

## Task 7: 加载配置 — solver.js

**文件**: `web/js/solver.js`
**位置**: `loadDefaults()` 函数中 (第 75 行后)

在 `state.frontWingConfig = data.front_wing || null;` 之后添加:
```javascript
    state.undertrayConfig = data.undertray || null;
    state.diffuserConfig = data.diffuser || null;
```

---

## Task 8: HTML 面板容器 — index.html

**文件**: `web/index.html`
**位置**: 空气动力学区域内, 尾翼面板之后 (约第 287 行)

在 rearWingListContainer 的 `</div>` 闭合标签之后添加:

```html
        <div class="text-[0.58rem] text-dim tracking-wider font-medium flex items-center gap-1 mt-2">
          <span class="w-1.5 h-1.5 rounded-full bg-green-400/60"></span> 底板
        </div>
        <div id="undertrayListContainer" class="max-h-[240px] overflow-y-auto rounded-lg border border-white/5">
          <div id="undertrayListBody" class="text-[0.6rem] text-dim p-2">加载中...</div>
        </div>
        <div class="text-[0.58rem] text-dim tracking-wider font-medium flex items-center gap-1 mt-2">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400/60"></span> 扩散器
        </div>
        <div id="diffuserListContainer" class="max-h-[240px] overflow-y-auto rounded-lg border border-white/5">
          <div id="diffuserListBody" class="text-[0.6rem] text-dim p-2">加载中...</div>
        </div>
```

---

## 设计简化说明

### CatmullRomCurve3 vs 正弦函数

规范 (spec) 中提到使用 CatmullRomCurve3 定义底板纵向脊线和翻转翼曲率。本计划选择使用 `Math.sin()` 参数化函数代替，原因是:

1. 底板 Venturi 微凹是一个对称的凹槽，正弦函数 `sin(π·t)` 天然匹配这一形态
2. 翻转翼从平面平滑过渡到上翘，`sin(π/2·t)` 提供自然的缓入曲线
3. 避免了额外的控制点定义和 CatmullRom 曲线采样逻辑
4. 视觉效果差异极小——两者都是平滑 C1 连续曲线

如果未来需要非对称或更复杂的轮廓，可以将 profile 点传入 `THREE.CatmullRomCurve3` 替换当前的解析函数。

---

## 执行顺序

建议按以下顺序执行（每个任务可独立提交）:

1. **T1 → T2 → T3**: 后端完整链路 (config → persistence → API)
2. **T4 → T7**: 前端状态加载 (state + solver)
3. **T5**: 3D 渲染核心 (builders)
4. **T6 → T8**: UI 面板交互 (ui.js + index.html)

## 测试验证

### 后端验证
```bash
# 1. 启动服务器
cd src && python main.py

# 2. 验证 API defaults 返回新字段
python -c "import requests; r=requests.get('http://127.0.0.1:8000/api/defaults'); d=r.json(); assert 'undertray' in d and 'diffuser' in d; print('OK: defaults includes undertray and diffuser')"

# 3. 验证 save_undertray 端点
python -c "import requests; r=requests.post('http://127.0.0.1:8000/api/save_undertray', json={'enabled': True, 'front_x': 260, 'rear_x': -895, 'ground_clearance': 30, 'half_width': 350, 'venturi_depth': 12, 'venturi_start_ratio': 0.3, 'venturi_end_ratio': 0.6, 'edge_flipups': [], 'strakes': [], 'mounts': [], 'color': '#22c55e', 'opacity': 0.7}); print(r.json())"

# 4. 验证 save_diffuser 端点
python -c "import requests; r=requests.post('http://127.0.0.1:8000/api/save_diffuser', json={'enabled': True, 'start_x': -895, 'length': 200, 'angle': 10, 'channels': 3, 'strake_height': 35, 'strake_angle': 75, 'exit_half_width': 390, 'exit_overhang': 20, 'mounts': [], 'color': '#f43f5e', 'opacity': 0.6}); print(r.json())"
```

### 前端验证
1. 打开浏览器访问 http://127.0.0.1:8000
2. 展开右侧 "空气动力学" 面板
3. 确认显示 4 个子面板: 前翼、尾翼、底板、扩散器
4. 3D 视窗中应可见绿色底板和红色扩散器
5. 调整底板参数 (如离地间隙) 点击 "应用" → 3D 模型应实时变化
6. 点击 "永久保存" → 检查 config.py 是否已更新

### 视觉检查清单
- [ ] 底板面板: 绿色半透明, 位于车架底部
- [ ] Venturi 微凹: 底板中央可见轻微下沉
- [ ] 边缘翻转翼: 底板两侧后部可见上翘小翼
- [ ] 底板栅条: 底板下方可见纵向小翼片
- [ ] 扩散器面板: 红色半透明, 从底板后缘向上展开
- [ ] 扩散器栅条: 扩散器内部可见竖直隔板
- [ ] 挂点连线: 黄色线段从车架节点连接到底板/扩散器
