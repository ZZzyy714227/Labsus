import * as THREE from 'three';
import { state } from './state.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
// SCENE SETUP
// ============================================================
state.viewport = document.getElementById('viewport');
state.scene = new THREE.Scene();
state.scene.background = new THREE.Color(0x1F1612);
state.scene.fog = new THREE.Fog(0x1F1612, 3000, 6000);

state.camera = new THREE.PerspectiveCamera(50, 2, 10, 10000);
state.camera.position.set(350, -1500, 900);
state.camera.up.set(0, 0, 1);

state.renderer = new THREE.WebGLRenderer({ antialias: true });
state.renderer.setPixelRatio(window.devicePixelRatio);
state.renderer.shadowMap.enabled = false;
state.renderer.setClearColor(0x1F1612, 1);
state.viewport.appendChild(state.renderer.domElement);

state.controls = new OrbitControls(state.camera, state.renderer.domElement);
state.controls.target.set(-450, 0, 150);
state.controls.enableDamping = true;
state.controls.dampingFactor = 0.08;
state.controls.update();

state.raycaster = new THREE.Raycaster();
state.mouse = new THREE.Vector2();
state.raycaster.params.Points.threshold = 0.5;
state.raycaster.params.Line = { threshold: 0.5 };

// Lighting
const ambient = new THREE.AmbientLight(0xffe8c8, 3);
state.scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 4);
dirLight.position.set(500, 1000, 800);
state.scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xFC7607, 1.4);
dirLight2.position.set(-500, -500, 200);
state.scene.add(dirLight2);

// Ground grids
const gridHelper = new THREE.PolarGridHelper(800, 40, 20, 256, 0xFC7607, 0xAC8975);
gridHelper.rotation.x = -Math.PI / 2;
gridHelper.material.opacity = 0.55;
gridHelper.material.transparent = true;
state.scene.add(gridHelper);
state.sceneObjects.groundPlane = gridHelper;

const rearGridHelper = new THREE.PolarGridHelper(800, 40, 20, 256, 0xFC7607, 0xAC8975);
rearGridHelper.rotation.x = -Math.PI / 2;
rearGridHelper.position.x = -900;
rearGridHelper.material.opacity = 0.55;
rearGridHelper.material.transparent = true;
state.scene.add(rearGridHelper);
state.sceneObjects.rearGroundPlane = rearGridHelper;

// Coordinate axes
const axGeo = (len) => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(len,0,0)]);
const axLine = (geo, color) => new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
state.scene.add(axLine(axGeo(400), 0xFC7607)); // +X (orange)
const ag2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,400,0)]); // +Y
state.scene.add(axLine(ag2, 0xEFCE7D));
const ag3 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,400)]); // +Z
state.scene.add(axLine(ag3, 0xD83514));

// Centerline
const clGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1200, 0, 0), new THREE.Vector3(500, 0, 0)]);
state.clLine = new THREE.Line(clGeo, new THREE.LineDashedMaterial({ color: 0xEFCE7D, dashSize: 20, gapSize: 20 }));
state.clLine.computeLineDistances();
state.scene.add(state.clLine);

// ============================================================
// 3D OBJECT FACTORIES
// ============================================================

export function sphere(color='#FC7607', radius=8) {
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
    return new THREE.Mesh(geo, mat);
}

export function lineSegment(a, b, color='#ffffff', dash=false) {
    const pts = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dash
        ? new THREE.LineDashedMaterial({ color, dashSize: 12, gapSize: 8 })
        : new THREE.LineBasicMaterial({ color, linewidth: 1.5 });
    const line = new THREE.Line(geo, mat);
    if (dash) line.computeLineDistances();
    return line;
}

export function makeTireRing(wheelCenter, tireRadius=230, loadedRadius=null) {
    const r = loadedRadius || tireRadius;
    const group = new THREE.Group();
    const torusGeo = new THREE.TorusGeometry(r, 6, 16, 48);
    const torusMat = new THREE.MeshStandardMaterial({ color: '#8B7355', roughness: 0.6 });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = THREE.MathUtils.degToRad(90);
    group.add(torus);
    if (loadedRadius && Math.abs(loadedRadius - tireRadius) > 0.5) {
        const innerGeo = new THREE.TorusGeometry(loadedRadius, 1.5, 8, 48);
        const innerMat = new THREE.MeshBasicMaterial({ color: '#FC7607' });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.rotation.x = THREE.MathUtils.degToRad(90);
        group.add(inner);
    }
    group.position.set(...wheelCenter);
    return group;
}

export function makeContactPatchLine(wheelCenter, cpCenter) {
    const target = cpCenter || [wheelCenter[0], wheelCenter[1], 0];
    const pts = [new THREE.Vector3(...wheelCenter), new THREE.Vector3(...target)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#AC8975' }));
}

export function makeContactPatchMesh(cpCenter, tireWidth, loadedRadius) {
    const group = new THREE.Group();
    const halfW = (tireWidth || 160) / 2;
    const halfL = (loadedRadius || 148) * 0.25;
    const geo = new THREE.PlaneGeometry(halfW * 2, halfL * 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFC7607, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    group.position.set(cpCenter[0], cpCenter[1], cpCenter[2] + 0.3);
    return group;
}

export function updateContactPatchMesh(patchGroup, cpCenter) {
    if (!patchGroup || !cpCenter) return;
    patchGroup.position.set(cpCenter[0], cpCenter[1], cpCenter[2] + 0.3);
}

export function updateTireFromGeometry(tireGroup, UP1, UP2, UP5) {
    const up1 = new THREE.Vector3(...UP1);
    const up2 = new THREE.Vector3(...UP2);
    const up5 = new THREE.Vector3(...UP5);
    const z = new THREE.Vector3().subVectors(up2, up1).normalize();
    const toWheel = new THREE.Vector3().subVectors(up5, up1);
    const x = new THREE.Vector3().crossVectors(toWheel, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    if (y.length() < 1e-6) return;
    tireGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), y.normalize());
    tireGroup.position.copy(up5);
}

export function updateContactPatchLine(cpLine, UP5, cpCenter) {
    const target = cpCenter || [UP5[0], UP5[1], 0];
    const pts = [new THREE.Vector3(...UP5), new THREE.Vector3(...target)];
    cpLine.geometry.setFromPoints(pts);
}

export function disposeGroup(group) {
    group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });
}

export function createDamperCylinder(chassisPt, rockerPt) {
    const group = new THREE.Group();
    const dir = new THREE.Vector3().subVectors(rockerPt, chassisPt);
    const totalLen = dir.length();
    if (totalLen < 1) return group;
    dir.normalize();
    const up = Math.abs(dir.z) < 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const perp1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
    const bodyLen = totalLen * 0.52;
    const bodyGeo = new THREE.CylinderGeometry(7, 7, bodyLen, 20, 1, true);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFC7607, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.copy(new THREE.Vector3().copy(chassisPt).addScaledVector(dir, bodyLen / 2));
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(body);
    const rodStartOffset = bodyLen * 0.85;
    const rodLen = totalLen - rodStartOffset;
    if (rodLen > 0) {
        const rodGeo = new THREE.CylinderGeometry(4, 4, rodLen, 12, 1);
        const rodMat = new THREE.MeshStandardMaterial({ color: 0xEFCE7D, roughness: 0.2, metalness: 0.4 });
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.copy(new THREE.Vector3().copy(chassisPt).addScaledVector(dir, rodStartOffset + rodLen / 2));
        rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        group.add(rod);
    }
    const coils = 7, springRadius = 10, springStart = bodyLen * 0.1, springEnd = bodyLen * 0.9;
    const springLen = springEnd - springStart, steps = coils * 40;
    const springPts = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        springPts.push(new THREE.Vector3().copy(chassisPt)
            .addScaledVector(dir, springStart + t * springLen)
            .addScaledVector(perp1, Math.cos(t * coils * Math.PI * 2) * springRadius)
            .addScaledVector(perp2, Math.sin(t * coils * Math.PI * 2) * springRadius));
    }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPts), steps, 1.3, 8, false);
    group.add(new THREE.Mesh(springGeo, new THREE.MeshStandardMaterial({ color: 0xD83514, roughness: 0.35, metalness: 0.25 })));
    for (const [offset, radius] of [[0, 7], [bodyLen, 7]]) {
        const ringGeo = new THREE.TorusGeometry(radius, 1.8, 8, 16);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xC25A20, roughness: 0.2, metalness: 0.3 }));
        ring.position.copy(new THREE.Vector3().copy(chassisPt).addScaledVector(dir, offset));
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        group.add(ring);
    }
    return group;
}

// ============================================================
// AIRFOIL GEOMETRY
// ============================================================

export function sampleAirfoil(chord, camberPct, thicknessPct, angleDeg, nPts) {
    const m = camberPct / 100, t = thicknessPct / 100, p = 0.4;
    const angleRad = angleDeg * Math.PI / 180;
    const upper = [], lower = [];
    for (let i = 0; i < nPts; i++) {
        const xc = i / (nPts - 1);
        let zc, dzc;
        if (xc <= p) { zc = (m / (p * p)) * (2 * p * xc - xc * xc); dzc = (2 * m / (p * p)) * (p - xc); }
        else { zc = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * xc - xc * xc); dzc = (2 * m / ((1 - p) * (1 - p))) * (p - xc); }
        const sx = Math.sqrt(xc), x2 = xc * xc, x3 = x2 * xc, x4 = x3 * xc;
        const zt = 5 * t * (0.2969 * sx - 0.1260 * xc - 0.3516 * x2 + 0.2843 * x3 - 0.1015 * x4);
        const th = Math.atan(dzc);
        const ct = Math.cos(th), st = Math.sin(th);
        upper.push([(xc - zt * st) * chord, (zc + zt * ct) * chord]);
        lower.push([(xc + zt * st) * chord, (zc - zt * ct) * chord]);
    }
    const ca = Math.cos(angleRad), sa = Math.sin(angleRad);
    const rot = pt => [pt[0] * ca - pt[1] * sa, pt[0] * sa + pt[1] * ca];
    return { upper: upper.map(rot), lower: lower.map(rot) };
}

export function buildWingElementMesh(el, refPt, halfSpan, nPts) {
    const { upper, lower } = sampleAirfoil(el.chord, el.camber_pct, el.thickness_pct, el.angle, nPts);
    const elX = refPt[0] + el.x_offset, elZ = refPt[2] + el.z_offset;
    const spanFrac = el.span_fraction ?? 1.0;
    const hs = halfSpan * spanFrac;
    const verts = [];
    function addPt(x, z, y) { verts.push(elX + x, y, elZ + z); }
    for (const [x, z] of upper) addPt(x, z, -hs);
    for (const [x, z] of upper) addPt(x, z, +hs);
    for (const [x, z] of lower) addPt(x, z, -hs);
    for (const [x, z] of lower) addPt(x, z, +hs);
    const N = nPts;
    const indices = [];
    for (let i = 0; i < N - 1; i++) { const a = i, b = i + 1, c = i + N + 1, d = i + N; indices.push(a, b, c, a, c, d); }
    const L0 = 2 * N;
    for (let i = 0; i < N - 1; i++) { const a = L0 + i, b = L0 + i + 1, c = L0 + i + N + 1, d = L0 + i + N; indices.push(a, d, c, a, c, b); }
    indices.push(0, N, 3 * N, 0, 3 * N, 2 * N);
    indices.push(N - 1, 3 * N - 1, 4 * N - 1, N - 1, 4 * N - 1, 2 * N - 1);
    function capIndices(baseIdx, flip) {
        const outline = [];
        for (let i = 0; i < N; i++) outline.push(baseIdx + i);
        for (let i = N - 1; i >= 0; i--) outline.push(baseIdx + 2 * N + i);
        let area2 = 0;
        for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; area2 += verts[outline[i]*3] * verts[outline[j]*3+2] - verts[outline[j]*3] * verts[outline[i]*3+2]; }
        const ccw = area2 > 0;
        for (let i = 1; i < outline.length - 1; i++) {
            if (ccw !== flip) indices.push(outline[0], outline[i], outline[i + 1]);
            else indices.push(outline[0], outline[i + 1], outline[i]);
        }
    }
    capIndices(0, false); capIndices(N, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// CHASSIS UTILITIES
// ============================================================

export function chassisTransform(pt) {
    if (!state.chassisMode || (!state.chassisPose.heave && !state.chassisPose.pitch && !state.chassisPose.roll)) return pt.slice();
    const h = state.chassisPose.heave, pR = state.chassisPose.pitch * Math.PI / 180, rR = state.chassisPose.roll * Math.PI / 180;
    const cp = Math.cos(pR), sp = -Math.sin(pR);
    const cr = Math.cos(rR), sr = -Math.sin(rR);
    let x = pt[0], y = pt[1], z = pt[2];
    const x0 = x + 445;
    x = x0 * cp + z * sp - 445;
    z = -x0 * sp + z * cp;
    const y1 = y * cr - z * sr;
    const z2 = y * sr + z * cr;
    return [x, y1, z2 + h];
}

export function resolveChassisNode(name, isRight) {
    if (state.frameNodes[name]) return chassisTransform(state.frameNodes[name]);
    const leftPool = [state.currentResultFrontLeft, state.currentResultRearLeft];
    const rightPool = [state.currentResultFrontRight, state.currentResultRearRight];
    const first = isRight ? rightPool : leftPool;
    const second = isRight ? leftPool : rightPool;
    for (const hp of [...first, ...second]) { if (hp && hp[name]) return chassisTransform(hp[name]); }
    return null;
}

export function resolveFramePoint(name) {
    if (state.rockerCache[name]) return state.rockerCache[name];
    if (state.frameNodes[name]) return state.frameNodes[name];
    const isLeft = name.endsWith('_L');
    const baseName = isLeft ? name.slice(0, -2) : name;
    let hpDict;
    if (baseName.startsWith('R_')) hpDict = isLeft ? state.hardpointsRearLeft : state.hardpointsRearRight;
    else hpDict = isLeft ? state.hardpointsFrontLeft : state.hardpointsFrontRight;
    if (hpDict[baseName]) return hpDict[baseName];
    return null;
}

export function rotatePointAroundX(point, pivot, angleRad) {
    const ct = Math.cos(angleRad), st = Math.sin(angleRad);
    const dy = point[1] - pivot[1], dz = point[2] - pivot[2];
    return [point[0], pivot[1] + dy * ct - dz * st, pivot[2] + dy * st + dz * ct];
}

export function findRockerAngle(ch5Design, pivot, up4Current, pushRodLen) {
    const targetSq = pushRodLen * pushRodLen;
    function distSq(theta) { const c = rotatePointAroundX(ch5Design, pivot, theta); return (c[0]-up4Current[0])**2 + (c[1]-up4Current[1])**2 + (c[2]-up4Current[2])**2; }
    function error(theta) { return distSq(theta) - targetSq; }
    const e0 = error(0);
    if (Math.abs(e0) < 1e-6 * targetSq) return 0;
    const dir = (Math.abs(error(0.001)) < Math.abs(error(-0.001))) ? 1 : -1;
    let lo = 0, hi = 0, found = false;
    for (let r = 0.01; r <= Math.PI; r *= 1.5) { const t = dir * r; if (error(0) * error(t) <= 0) { if (dir > 0) { lo = 0; hi = t; } else { lo = t; hi = 0; } found = true; break; } }
    if (!found) { let best = 0, bestE = Math.abs(e0); for (let t = -Math.PI; t <= Math.PI; t += 0.005) { const e = Math.abs(error(t)); if (e < bestE) { bestE = e; best = t; } } return best; }
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (error(lo) * error(mid) <= 0) hi = mid; else lo = mid; if (hi - lo < 1e-8) break; }
    return (lo + hi) / 2;
}

export function renderColorPalette(containerId, currentColor, onClick) {
    const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
    state.PALETTE.forEach(p => {
        const s = document.createElement('div');
        s.style.cssText = 'width:20px;height:20px;background:' + p.hex + ';border-radius:4px;cursor:pointer;border:2px solid ' + (p.hex === currentColor ? '#fff' : 'transparent') + ';transition:transform .15s';
        s.title = p.name;
        s.onclick = () => onClick(p.hex);
        s.onmouseenter = () => s.style.transform = 'scale(1.15)';
        s.onmouseleave = () => s.style.transform = 'scale(1)';
        c.appendChild(s);
    });
}

export function triangulateLoop(pts3D) {
    if (pts3D.length < 3) return [];
    if (pts3D.length === 3) return [[0, 1, 2]];
    const n = pts3D.length;
    const cx = pts3D.reduce((s, p) => s + p.x, 0) / n, cy = pts3D.reduce((s, p) => s + p.y, 0) / n, cz = pts3D.reduce((s, p) => s + p.z, 0) / n;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; nx += (pts3D[i].y - pts3D[j].y) * (pts3D[i].z + pts3D[j].z); ny += (pts3D[i].z - pts3D[j].z) * (pts3D[i].x + pts3D[j].x); nz += (pts3D[i].x - pts3D[j].x) * (pts3D[i].y + pts3D[j].y); }
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz); if (nLen < 1e-9) return [[0, 1, 2]];
    nx /= nLen; ny /= nLen; nz /= nLen;
    const up = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const ux = ny * up[2] - nz * up[1], uy = nz * up[0] - nx * up[2], uz = nx * up[1] - ny * up[0];
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz); const uA = uLen > 0 ? [ux / uLen, uy / uLen, uz / uLen] : [1, 0, 0];
    const vA = [ny * uA[2] - nz * uA[1], nz * uA[0] - nx * uA[2], nx * uA[1] - ny * uA[0]];
    const angles = pts3D.map(p => { const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz; return Math.atan2(dx * vA[0] + dy * vA[1] + dz * vA[2], dx * uA[0] + dy * uA[1] + dz * uA[2]); });
    const order = angles.map((a, i) => i).sort((a, b) => angles[a] - angles[b]);
    const ix = [];
    for (let i = 1; i < order.length - 1; i++) ix.push([order[0], order[i], order[i + 1]]);
    return ix;
}

// ============================================================
// DYNAMIC TRACK — terrain, path, obstacle preview rendering
// ============================================================
// World → Three.js mapping: (wx, wy, wz) → (wx, wy, wz) direct.
// Ground grid is horizontal XY-plane at Z=0 (PolarGridHelper rotated π/2 around X).
// Obstacles / path sit at Three.js Z=0 (world Z=0 = ground).

/** Build a Catmull-Rom curve in world XY for smooth path preview. */
function catmullRomPoints(pts, nPerSeg) {
    if (pts.length < 2) return pts;
    const p = pts;
    const padded = [ [2*p[0][0]-p[1][0], 2*p[0][1]-p[1][1]], ...p, [2*p[p.length-1][0]-p[p.length-2][0], 2*p[p.length-1][1]-p[p.length-2][1]] ];
    const result = [];
    for (let s = 0; s < p.length - 1; s++) {
        for (let j = 0; j < nPerSeg; j++) {
            const t = j / nPerSeg, t2 = t * t, t3 = t2 * t;
            const p0 = padded[s], p1 = padded[s+1], p2 = padded[s+2], p3 = padded[s+3];
            const x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);
            const y = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);
            result.push([x, y]);
        }
    }
    return result;
}

/** Draw path preview line on the ground plane. */
export function renderPathLine(pathPoints) {
    clearTrackElements();
    if (!pathPoints || pathPoints.length < 2) return;
    const smooth = catmullRomPoints(pathPoints, 30);
    const pts3 = smooth.map(([x, y]) => new THREE.Vector3(x, y, 0.5));
    const geom = new THREE.BufferGeometry().setFromPoints(pts3);
    const mat = new THREE.LineBasicMaterial({ color: 0xFC7607 });
    const line = new THREE.Line(geom, mat);
    state.scene.add(line);
    state.sceneObjects._trackLines = [line];
}

/** Draw obstacle previews as colored semi-transparent boxes on the ground plane. */
export function renderObstaclePreviews(obstacles) {
    clearObstaclePreviews();
    if (!obstacles || !obstacles.length) return;
    const meshes = [];
    for (const o of obstacles) {
        const color = o.type === 'bump' ? 0x8B5CF6 : o.type === 'kerb' ? 0xFC7607 : 0x10B981;
        const h = o.height || 10;
        let cx, cy, len;

        if (o.type === 'bump') {
            cx = o.x; cy = o.y;
            len = o.length || 200;
            // Bump: box along X, width along Y, height along Z
            const geom = new THREE.BoxGeometry(len, o.width || 150, h);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.set(cx, cy, h / 2);
            meshes.push(mesh);
        } else if (o.type === 'kerb' || o.type === 'ramp') {
            const xs = o.x_start || 0, ys = o.y_start || 0;
            const xe = o.x_end || 100, ye = o.y_end || 0;
            cx = (xs + xe) / 2; cy = (ys + ye) / 2;
            const dx = xe - xs, dy = ye - ys;
            len = Math.sqrt(dx * dx + dy * dy) || 100;
            const w = o.width || 100;
            // Box along the kerb direction, width lateral, height vertical
            const geom = new THREE.BoxGeometry(len, w, h);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.set(cx, cy, h / 2);
            mesh.rotation.z = Math.atan2(dy, dx);
            meshes.push(mesh);
        }
    }
    meshes.forEach(m => state.scene.add(m));
    state.sceneObjects._obstacleMeshes = meshes;
}

/** Clean up all track-related scene objects. */
export function clearTrackElements() {
    if (state.sceneObjects._trackLines) {
        state.sceneObjects._trackLines.forEach(l => { state.scene.remove(l); l.geometry?.dispose(); });
        state.sceneObjects._trackLines = null;
    }
    clearObstaclePreviews();
}

function clearObstaclePreviews() {
    if (state.sceneObjects._obstacleMeshes) {
        state.sceneObjects._obstacleMeshes.forEach(m => {
            state.scene.remove(m);
            m.geometry?.dispose();
            m.material?.dispose();
        });
        state.sceneObjects._obstacleMeshes = null;
    }
}

/**
 * Apply trajectory frame to 3D scene. Moves a marker at the car body position.
 */
export function applyFrameToScene(frame) {
    if (!frame || !frame.body) return;
    const b = frame.body;
    let marker = state.sceneObjects._bodyMarker;
    if (!marker) {
        const geom = new THREE.SphereGeometry(40, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFC7607, transparent: true, opacity: 0.7 });
        marker = new THREE.Mesh(geom, mat);
        state.scene.add(marker);
        state.sceneObjects._bodyMarker = marker;
    }
    // World (bx, by, bz) → Three.js (bx, by, bz) — ground is Z=0
    marker.position.set(b.x, b.y, b.z);
}

// Expose for playback.js + main.js
window.applyFrameToScene = applyFrameToScene;
window.renderPathLine = renderPathLine;
window.renderObstaclePreviews = renderObstaclePreviews;

export { THREE };
