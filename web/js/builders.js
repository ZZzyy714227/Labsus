import { state } from './state.js';
import { THREE, sphere, lineSegment, makeTireRing, makeContactPatchLine, makeContactPatchMesh,
    updateContactPatchMesh, updateTireFromGeometry, updateContactPatchLine,
    chassisTransform, resolveFramePoint, resolveChassisNode,
    rotatePointAroundX, findRockerAngle, disposeGroup, createDamperCylinder, triangulateLoop, sampleAirfoil, buildWingElementMesh } from './scene.js';

// ============================================================
// SUSPENSION SIDE POINTS
// ============================================================

export function buildSidePoints(hp, sideKey, colors, keyPrefix = '') {
    const objs = state.sceneObjects[sideKey];
    Object.values(objs.spheres).forEach(s => state.scene.remove(s));
    Object.values(objs.lines).forEach(l => state.scene.remove(l));
    if (objs.tireGroup) state.scene.remove(objs.tireGroup);
    if (objs.uprightLine) state.scene.remove(objs.uprightLine);
    if (objs.contactPatchLine) state.scene.remove(objs.contactPatchLine);
    objs.spheres = {};
    objs.lines = {};

    const C = (k) => keyPrefix + k;
    const allKeys = state.CHASSIS_KEYS.map(C).concat(state.UPRIGHT_KEYS.map(C)).concat(state.FLOAT_KEYS.map(C));

    for (const key of allKeys) {
        if (!hp[key]) continue;
        const baseKey = key.replace(keyPrefix, '');
        const color = state.CHASSIS_KEYS.includes(baseKey) ? colors.chassis
            : state.UPRIGHT_KEYS.includes(baseKey) ? colors.upright : colors.float;
        const s = sphere(color, state.CHASSIS_KEYS.includes(baseKey) ? 10 : 7);
        const pos = chassisTransform(hp[key]);
        s.position.set(...pos);
        const sideIsLeft = sideKey === 'frontLeft' || sideKey === 'rearLeft';
        s.userData.pointName = key + (sideIsLeft ? '_L' : '');
        s.userData.pointType = 'hardpoint';
        state.scene.add(s);
        objs.spheres[key] = s;
    }

    function mkLine(name, a, b, color, dash) {
        const pa = chassisTransform(hp[a] || [0, 0, 0]);
        const pb = chassisTransform(hp[b] || [0, 0, 0]);
        const l = lineSegment(pa, pb, color, dash);
        l.userData = { lineName: name, lineType: 'suspension', endpoints: [a, b], originalColor: color };
        objs.lines[name] = l;
    }

    if (hp[C('CH1')] && hp[C('UP1')]) mkLine('uca_front', C('CH1'), C('UP1'), colors.uca);
    if (hp[C('CH2')] && hp[C('UP1')]) mkLine('uca_rear', C('CH2'), C('UP1'), colors.uca);
    if (hp[C('CH1')] && hp[C('CH2')]) mkLine('uca_axis', C('CH1'), C('CH2'), colors.ucaAxis);
    if (hp[C('CH3')] && hp[C('UP2')]) mkLine('lca_front', C('CH3'), C('UP2'), colors.lca);
    if (hp[C('CH4')] && hp[C('UP2')]) mkLine('lca_rear', C('CH4'), C('UP2'), colors.lca);
    if (hp[C('CH3')] && hp[C('CH4')]) mkLine('lca_axis', C('CH3'), C('CH4'), colors.lcaAxis);
    if (hp[C('UP1')] && hp[C('UP2')]) mkLine('kingpin', C('UP1'), C('UP2'), colors.kingpin, true);
    if (hp[C('UP3')] && hp[C('FL1')]) mkLine('tie_rod', C('UP3'), C('FL1'), colors.tieRod);
    if (hp[C('UP4')] && hp[C('CH5')]) mkLine('push_rod', C('UP4'), C('CH5'), colors.pushRod);

    const order = [C('UP1'), C('UP3'), C('UP2'), C('UP4'), C('UP1')];
    const pts = order.filter(k => hp[k]).map(k => new THREE.Vector3(...chassisTransform(hp[k])));
    if (pts.length >= 2) {
        const polyGeo = new THREE.BufferGeometry().setFromPoints(pts);
        objs.uprightLine = new THREE.Line(polyGeo, new THREE.LineBasicMaterial({ color: colors.uprightLine }));
        state.scene.add(objs.uprightLine);
    }

    Object.values(objs.lines).forEach(l => state.scene.add(l));

    const cp = state.contactPatches[sideKey];
    const loadR = cp ? cp.loaded_radius : null;
    const rawUP5 = hp[C('UP5')] || [0, 0, 0], rawUP1 = hp[C('UP1')], rawUP2 = hp[C('UP2')];
    objs.tireGroup = makeTireRing(chassisTransform(rawUP5), hp.tire_radius || 230, loadR);
    state.scene.add(objs.tireGroup);
    if (rawUP1 && rawUP2 && rawUP5) {
        updateTireFromGeometry(objs.tireGroup, chassisTransform(rawUP1), chassisTransform(rawUP2), chassisTransform(rawUP5));
    }
    const cpCtr = cp ? chassisTransform(cp.center) : null;
    if (objs.contactPatchLine) { state.scene.remove(objs.contactPatchLine); }
    objs.contactPatchLine = makeContactPatchLine(chassisTransform(rawUP5), cpCtr);
    state.scene.add(objs.contactPatchLine);
    if (objs.patchMesh) { state.scene.remove(objs.patchMesh); }
    if (cpCtr) {
        objs.patchMesh = makeContactPatchMesh(cpCtr, hp.tire_width || 160, cp.loaded_radius || hp.tire_radius || 150);
        state.scene.add(objs.patchMesh);
    }
}

// ============================================================
// FRAME
// ============================================================

export function buildFrame() {
    const fobjs = state.sceneObjects.frame;
    Object.values(fobjs.spheres).forEach(s => state.scene.remove(s));
    fobjs.tubes.forEach(l => state.scene.remove(l));
    fobjs.spheres = {};
    fobjs.tubes = [];

    for (const [name, pos] of Object.entries(state.frameNodes)) {
        const s = sphere(state.FRAME_NODE_COLOR, 6);
        const p = chassisTransform(pos);
        s.position.set(...p);
        s.userData.pointName = name;
        s.userData.pointType = 'frame_node';
        state.scene.add(s);
        fobjs.spheres[name] = s;
    }

    let tubeIdx = 0;
    for (const tube of state.frameTubes) {
        const pts = tube.map(n => resolveFramePoint(n)).filter(Boolean);
        if (pts.length < 2) continue;
        const [a, b] = [tube[0], tube[tube.length - 1]];
        let color = state.tubeColors[tubeIdx] || state.FRAME_COLOR;
        if (!state.tubeColors[tubeIdx]) {
            if (a.startsWith('DAMPER') || b.startsWith('DAMPER')) color = state.DAMPER_COLOR;
            else if (a.startsWith('RK_') || b.startsWith('RK_') || a.startsWith('R_RK_') || b.startsWith('R_RK_')
                || a === 'CH5' || b === 'CH5' || a === 'CH5_L' || b === 'CH5_L'
                || a === 'R_CH5' || b === 'R_CH5' || a === 'R_CH5_L' || b === 'R_CH5_L') color = state.ROCKER_COLOR;
        }

        if (tube.length === 2) {
            const pA = chassisTransform(pts[0]), pB = chassisTransform(pts[1]);
            const line = lineSegment(pA, pB, color);
            line.userData = { endpoints: [a, b], lineType: 'frame_tube', tubeIndex: tubeIdx, originalColor: color, isCurve: false };
            state.scene.add(line);
            fobjs.tubes.push(line);
        } else {
            const worldPts = pts.map(p => new THREE.Vector3(...chassisTransform(p)));
            const curve = new THREE.CatmullRomCurve3(worldPts, false, 'catmullrom', 0.5);
            const curveSamples = curve.getPoints(tube.length * 16);
            const geo = new THREE.BufferGeometry().setFromPoints(curveSamples);
            const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), linewidth: 1.5 });
            const line = new THREE.Line(geo, mat);
            line.userData = { endpoints: tube, lineType: 'frame_tube', tubeIndex: tubeIdx, originalColor: color, isCurve: true };
            state.scene.add(line);
            fobjs.tubes.push(line);
        }
        tubeIdx++;
    }

    fobjs.rockerFaces.forEach(f => state.scene.remove(f));
    fobjs.rockerFaces = [];
    function addRockerFace(keysR, keysL, hexColor) {
        for (const keys of [keysR, keysL]) {
            const pts = keys.map(k => resolveFramePoint(k)).filter(Boolean);
            if (pts.length !== 3) continue;
            const geo = new THREE.BufferGeometry();
            const verts = new Float32Array([pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2], pts[2][0], pts[2][1], pts[2][2]]);
            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setIndex([0, 1, 2]);
            geo.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            state.scene.add(mesh);
            fobjs.rockerFaces.push(mesh);
        }
    }
    addRockerFace(['CH5', 'RK_PIVOT_R', 'RK_DAMPER_R'], ['CH5_L', 'RK_PIVOT_L', 'RK_DAMPER_L'], 0xf97316);
    addRockerFace(['R_CH5', 'R_RK_PIVOT_R', 'R_RK_DAMPER_R'], ['R_CH5_L', 'R_RK_PIVOT_L', 'R_RK_DAMPER_L'], 0xd97706);
}

// ============================================================
// DAMPER CYLINDERS
// ============================================================

export function buildDamperCylinders() {
    const fobjs = state.sceneObjects.frame;
    for (const g of Object.values(fobjs.damperGroups)) { state.scene.remove(g); disposeGroup(g); }
    fobjs.damperGroups = {};
    const defs = [
        { rockerKey: 'RK_DAMPER_R', chassisKey: 'DAMPER_CHASSIS_FR', side: 'FR' },
        { rockerKey: 'RK_DAMPER_L', chassisKey: 'DAMPER_CHASSIS_FL', side: 'FL' },
        { rockerKey: 'R_RK_DAMPER_R', chassisKey: 'R_DAMPER_CHASSIS_RR', side: 'RR' },
        { rockerKey: 'R_RK_DAMPER_L', chassisKey: 'R_DAMPER_CHASSIS_RL', side: 'RL' },
    ];
    for (const def of defs) {
        const rp = resolveFramePoint(def.rockerKey), cp = resolveFramePoint(def.chassisKey);
        if (!rp || !cp) continue;
        const g = createDamperCylinder(new THREE.Vector3(...chassisTransform(cp)), new THREE.Vector3(...chassisTransform(rp)));
        state.scene.add(g);
        fobjs.damperGroups[def.side] = g;
    }
}

export function updateDamperCylinders() {
    const fobjs = state.sceneObjects.frame;
    for (const g of Object.values(fobjs.damperGroups)) { state.scene.remove(g); disposeGroup(g); }
    fobjs.damperGroups = {};
    buildDamperCylinders();
}

// ============================================================
// ROCKER KINEMATICS
// ============================================================

export function updateRockerKinematics() {
    const fobjs = state.sceneObjects.frame;
    const rockerDefs = [
        ['CH5', 'RK_PIVOT_R', 'RK_DAMPER_R', state.hardpointsFrontRight, state.currentResultFrontRight, 'UP4', 'frontRight', ''],
        ['CH5', 'RK_PIVOT_L', 'RK_DAMPER_L', state.hardpointsFrontLeft, state.currentResultFrontLeft, 'UP4', 'frontLeft', '_L'],
        ['R_CH5', 'R_RK_PIVOT_R', 'R_RK_DAMPER_R', state.hardpointsRearRight, state.currentResultRearRight, 'R_UP4', 'rearRight', ''],
        ['R_CH5', 'R_RK_PIVOT_L', 'R_RK_DAMPER_L', state.hardpointsRearLeft, state.currentResultRearLeft, 'R_UP4', 'rearLeft', '_L'],
    ];
    for (const [ch5Key, pivKey, dmpKey, hpDesign, hpCurrent, up4Key, sideKey, cacheSuffix] of rockerDefs) {
        const ch5D = hpDesign[ch5Key], up4D = hpDesign[up4Key], up4C = hpCurrent[up4Key];
        if (!ch5D || !up4D || !up4C) continue;
        const pivot = resolveFramePoint(pivKey);
        if (!pivot) continue;
        const L = Math.hypot(up4D[0] - ch5D[0], up4D[1] - ch5D[1], up4D[2] - ch5D[2]);
        if (L < 1) continue;
        const theta = findRockerAngle(ch5D, pivot, up4C, L);
        const dmpDesign = state.frameNodes[dmpKey];
        if (!dmpDesign) continue;
        const newCH5 = rotatePointAroundX(ch5D, pivot, theta);
        const newDMP = rotatePointAroundX(dmpDesign, pivot, theta);
        state.rockerCache[ch5Key + cacheSuffix] = newCH5;
        state.rockerCache[dmpKey] = newDMP;
        const so = state.sceneObjects[sideKey];
        const wCH5 = chassisTransform(newCH5), wDMP = chassisTransform(newDMP);
        if (so && so.spheres[ch5Key]) so.spheres[ch5Key].position.set(...wCH5);
        if (fobjs.spheres[dmpKey]) fobjs.spheres[dmpKey].position.set(...wDMP);
        if (so && so.lines['push_rod'] && hpCurrent[up4Key]) {
            const wUP4 = chassisTransform(hpCurrent[up4Key]);
            so.lines['push_rod'].geometry.setFromPoints([new THREE.Vector3(...wUP4), new THREE.Vector3(...wCH5)]);
        }
    }
    for (const line of fobjs.tubes) {
        const ep = line.userData?.endpoints;
        if (!ep) continue;
        if (line.userData?.isCurve) {
            const pts = ep.map(n => resolveFramePoint(n)).filter(Boolean);
            if (pts.length < 2) continue;
            const worldPts = pts.map(p => new THREE.Vector3(...chassisTransform(p)));
            const curve = new THREE.CatmullRomCurve3(worldPts, false, 'catmullrom', 0.5);
            const samples = curve.getPoints(ep.length * 16);
            line.geometry.setFromPoints(samples);
        } else {
            const a = resolveFramePoint(ep[0]), b = resolveFramePoint(ep[1]);
            if (a && b) { const wa = chassisTransform(a), wb = chassisTransform(b);
                line.geometry.setFromPoints([new THREE.Vector3(...wa), new THREE.Vector3(...wb)]); }
        }
    }
    for (let i = 0; i < fobjs.rockerFaces.length; i++) {
        const mesh = fobjs.rockerFaces[i], isFront = i < 2, sfx = (i % 2 === 0) ? '' : '_L';
        const pts = [resolveFramePoint((isFront ? 'CH5' : 'R_CH5') + sfx),
            resolveFramePoint((isFront ? 'RK_PIVOT_' : 'R_RK_PIVOT_') + (sfx ? 'L' : 'R')),
            resolveFramePoint((isFront ? 'RK_DAMPER_' : 'R_RK_DAMPER_') + (sfx ? 'L' : 'R'))].filter(Boolean);
        if (pts.length !== 3) continue;
        const w = pts.map(p => chassisTransform(p));
        const v = new Float32Array([w[0][0], w[0][1], w[0][2], w[1][0], w[1][1], w[1][2], w[2][0], w[2][1], w[2][2]]);
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(v, 3));
        mesh.geometry.setIndex([0, 1, 2]);
        mesh.geometry.computeVertexNormals();
    }
    updateDamperCylinders();
}

// ============================================================
// UPDATE SIDE POINTS FROM SOLVER RESULTS
// ============================================================

export function updateSidePoints(result, sideKey, keyPrefix = '') {
    const objs = state.sceneObjects[sideKey], hp = result, K = (k) => keyPrefix + k;
    const ch5Key = K('CH5');
    for (const key of Object.keys(objs.spheres)) {
        if (key !== ch5Key && hp[key]) { const p = chassisTransform(hp[key]);
            objs.spheres[key].position.set(...p); }
    }
    const ul = (n, a, b) => { if (objs.lines[n] && hp[a] && hp[b]) { const pa = chassisTransform(hp[a]), pb = chassisTransform(hp[b]);
            objs.lines[n].geometry.setFromPoints([new THREE.Vector3(...pa), new THREE.Vector3(...pb)]); } };
    ul('uca_front', K('CH1'), K('UP1'));
    ul('uca_rear', K('CH2'), K('UP1'));
    ul('uca_axis', K('CH1'), K('CH2'));
    ul('lca_front', K('CH3'), K('UP2'));
    ul('lca_rear', K('CH4'), K('UP2'));
    ul('lca_axis', K('CH3'), K('CH4'));
    ul('kingpin', K('UP1'), K('UP2'));
    ul('tie_rod', K('UP3'), K('FL1'));
    if (objs.uprightLine) {
        const o = [K('UP1'), K('UP3'), K('UP2'), K('UP4'), K('UP1')];
        objs.uprightLine.geometry.setFromPoints(o.filter(k => hp[k]).map(k => new THREE.Vector3(...chassisTransform(hp[k]))));
    }
    if (objs.tireGroup && hp[K('UP1')] && hp[K('UP2')] && hp[K('UP5')])
        updateTireFromGeometry(objs.tireGroup, chassisTransform(hp[K('UP1')]), chassisTransform(hp[K('UP2')]), chassisTransform(hp[K('UP5')]));
    const cp = state.contactPatches[sideKey];
    if (objs.contactPatchLine && hp[K('UP5')]) {
        const cpCtr = cp ? chassisTransform(cp.center) : null;
        updateContactPatchLine(objs.contactPatchLine, chassisTransform(hp[K('UP5')]), cpCtr);
    }
    if (objs.patchMesh && cp) updateContactPatchMesh(objs.patchMesh, chassisTransform(cp.center));
}

// ============================================================
// BODYWORK FACES
// ============================================================

export function buildBodyworkFaces() {
    state.sceneObjects.bodyworkFaces.forEach(m => { state.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    state.sceneObjects.bodyworkFaces = [];
    for (const [name, def] of Object.entries(state.bodyworkFaces)) {
        for (const loop of (def.loops || [])) {
            const pts3D = loop.map(n => resolveFramePoint(n)).filter(Boolean).map(p => new THREE.Vector3(...chassisTransform(p)));
            if (pts3D.length < 3) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts3D.flatMap(v => [v.x, v.y, v.z])), 3));
            geo.setIndex(triangulateLoop(pts3D).flat());
            geo.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({ color: def.color || '#94a3b8', roughness: 0.5, metalness: 0.1, transparent: true, opacity: def.opacity ?? 0.30, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { faceName: name, baseOpacity: def.opacity ?? 0.30 };
            state.scene.add(mesh);
            state.sceneObjects.bodyworkFaces.push(mesh);
        }
    }
}

// ============================================================
// REAR WING
// ============================================================

export function buildRearWing() {
    const wobj = state.sceneObjects.rearWing;
    wobj.meshes.forEach(m => { state.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    wobj.mountSpheres.forEach(s => { state.scene.remove(s); if (s.geometry) s.geometry.dispose(); if (s.material) s.material.dispose(); });
    wobj.mountLines.forEach(l => { state.scene.remove(l); if (l.geometry) l.geometry.dispose(); if (l.material) l.material.dispose(); });
    wobj.meshes = [];
    wobj.mountSpheres = [];
    wobj.mountLines = [];

    if (!state.rearWingConfig || !state.rearWingConfig.enabled) return;

    const ref = state.rearWingConfig.reference_point || [0, 0, 0];
    const span = state.rearWingConfig.span || 900;
    const halfSpan = span / 2;
    const elements = state.rearWingConfig.elements || [];
    const color = state.rearWingConfig.color || '#60a5fa';
    const opacity = state.rearWingConfig.opacity ?? 0.45;
    const endplate = state.rearWingConfig.endplate;
    const mounts = state.rearWingConfig.mounts || [];

    for (const el of elements) {
        const nPts = Math.max(16, Math.round(el.chord / 15));
        const geo = buildWingElementMesh(el, ref, halfSpan, nPts);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const wp = chassisTransform([pos.getX(i), pos.getY(i), pos.getZ(i)]);
            pos.setXYZ(i, ...wp);
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15, transparent: true, opacity, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { aeroType: 'wing_element', elementName: el.name };
        state.scene.add(mesh);
        wobj.meshes.push(mesh);
    }

    if (endplate) {
        const allPts = [];
        for (const el of elements) {
            const { upper, lower } = sampleAirfoil(el.chord, el.camber_pct, el.thickness_pct, el.angle, 8);
            const elX = ref[0] + el.x_offset, elZ = ref[2] + el.z_offset;
            for (const [x, z] of [...upper, ...lower]) { allPts.push([elX + x, elZ + z]); }
        }
        if (allPts.length > 0) {
            const minX = Math.min(...allPts.map(p => p[0]));
            const maxX = Math.max(...allPts.map(p => p[0]));
            const minZ = Math.min(...allPts.map(p => p[1]));
            const maxZ = Math.max(...allPts.map(p => p[1]));
            const fwd = endplate.overhang_forward || 0.15;
            const rear = endplate.overhang_rear || 0.05;
            const above = endplate.height_above || 150;
            const below = endplate.height_below || 100;
            const dx = maxX - minX;
            const epX0 = minX - dx * fwd;
            const epX1 = maxX + dx * rear;
            const epZ0 = minZ - below;
            const epZ1 = maxZ + above;
            for (const sign of [-1, 1]) {
                const y = sign * halfSpan;
                const epVerts = [epX0, y, epZ0, epX1, y, epZ0, epX1, y, epZ1, epX0, y, epZ1];
                const wVerts = [];
                for (let i = 0; i < 4; i++) {
                    const wp = chassisTransform([epVerts[i * 3], epVerts[i * 3 + 1], epVerts[i * 3 + 2]]);
                    wVerts.push(wp[0], wp[1], wp[2]);
                }
                const epGeo = new THREE.BufferGeometry();
                epGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wVerts), 3));
                epGeo.setIndex([0, 1, 2, 0, 2, 3]);
                epGeo.computeVertexNormals();
                const epMat = new THREE.MeshStandardMaterial({ color: '#a5b4fc', roughness: 0.3, metalness: 0.1, transparent: true, opacity: opacity * 0.8, side: THREE.DoubleSide });
                const epMesh = new THREE.Mesh(epGeo, epMat);
                epMesh.userData = { aeroType: 'endplate', side: sign > 0 ? 'R' : 'L' };
                state.scene.add(epMesh);
                wobj.meshes.push(epMesh);
            }
        }
    }

    for (const m of mounts) {
        const fn = m.frame_node;
        const isRight = (m.local_y ?? 0) >= 0;
        const chassisPt = resolveChassisNode(fn, isRight);
        if (!chassisPt) continue;
        const wingLE = chassisTransform([ref[0] + m.local_x, m.local_y ?? 0, ref[2] + m.local_z]);
        const s = sphere('#fbbf24', 8);
        s.position.set(...chassisPt);
        s.userData = { aeroType: 'mount', pointName: m.name };
        state.scene.add(s);
        wobj.mountSpheres.push(s);
        const l = lineSegment(chassisPt, wingLE, '#fbbf24');
        l.userData = { aeroType: 'mount_line' };
        state.scene.add(l);
        wobj.mountLines.push(l);
    }
}

// ============================================================
// FRONT WING
// ============================================================

export function buildFrontWing() {
    const wobj = state.sceneObjects.frontWing;
    wobj.meshes.forEach(m => { state.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    wobj.mountSpheres.forEach(s => { state.scene.remove(s); if (s.geometry) s.geometry.dispose(); if (s.material) s.material.dispose(); });
    wobj.mountLines.forEach(l => { state.scene.remove(l); if (l.geometry) l.geometry.dispose(); if (l.material) l.material.dispose(); });
    wobj.meshes = [];
    wobj.mountSpheres = [];
    wobj.mountLines = [];

    if (!state.frontWingConfig || !state.frontWingConfig.enabled) return;

    const ref = state.frontWingConfig.reference_point || [0, 0, 0];
    const span = state.frontWingConfig.span || 1100;
    const halfSpan = span / 2;
    const elements = state.frontWingConfig.elements || [];
    const color = state.frontWingConfig.color || '#34d399';
    const opacity = state.frontWingConfig.opacity ?? 0.5;
    const endplate = state.frontWingConfig.endplate;
    const mounts = state.frontWingConfig.mounts || [];

    for (const el of elements) {
        const nPts = Math.max(16, Math.round(el.chord / 15));
        const geo = buildWingElementMesh(el, ref, halfSpan, nPts);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const wp = chassisTransform([pos.getX(i), pos.getY(i), pos.getZ(i)]);
            pos.setXYZ(i, ...wp);
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15, transparent: true, opacity, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { aeroType: 'wing_element', elementName: el.name };
        state.scene.add(mesh);
        wobj.meshes.push(mesh);
    }

    if (endplate) {
        const allPts = [];
        for (const el of elements) {
            const { upper, lower } = sampleAirfoil(el.chord, el.camber_pct, el.thickness_pct, el.angle, 8);
            const elX = ref[0] + el.x_offset, elZ = ref[2] + el.z_offset;
            for (const [x, z] of [...upper, ...lower]) { allPts.push([elX + x, elZ + z]); }
        }
        if (allPts.length > 0) {
            const minX = Math.min(...allPts.map(p => p[0]));
            const maxX = Math.max(...allPts.map(p => p[0]));
            const minZ = Math.min(...allPts.map(p => p[1]));
            const maxZ = Math.max(...allPts.map(p => p[1]));
            const fwd = endplate.overhang_forward || 0.10;
            const rear = endplate.overhang_rear || 0.18;
            const above = endplate.height_above || 35;
            const below = endplate.height_below || 35;
            const dx = maxX - minX;
            const epX0 = minX - dx * fwd;
            const epX1 = maxX + dx * rear;
            const epZ0 = minZ - below;
            const epZ1 = maxZ + above;
            for (const sign of [-1, 1]) {
                const y = sign * halfSpan;
                const epVerts = [epX0, y, epZ0, epX1, y, epZ0, epX1, y, epZ1, epX0, y, epZ1];
                const wVerts = [];
                for (let i = 0; i < 4; i++) {
                    const wp = chassisTransform([epVerts[i * 3], epVerts[i * 3 + 1], epVerts[i * 3 + 2]]);
                    wVerts.push(wp[0], wp[1], wp[2]);
                }
                const epGeo = new THREE.BufferGeometry();
                epGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wVerts), 3));
                epGeo.setIndex([0, 1, 2, 0, 2, 3]);
                epGeo.computeVertexNormals();
                const epMat = new THREE.MeshStandardMaterial({ color: '#a7f3d0', roughness: 0.3, metalness: 0.1, transparent: true, opacity: opacity * 0.8, side: THREE.DoubleSide });
                const epMesh = new THREE.Mesh(epGeo, epMat);
                epMesh.userData = { aeroType: 'endplate', side: sign > 0 ? 'R' : 'L' };
                state.scene.add(epMesh);
                wobj.meshes.push(epMesh);
            }
        }
    }

    for (const m of mounts) {
        const fn = m.frame_node;
        const isRight = (m.local_y ?? 0) >= 0;
        const chassisPt = resolveChassisNode(fn, isRight);
        if (!chassisPt) continue;
        const wingLE = chassisTransform([ref[0] + (m.local_x ?? 0), m.local_y ?? 0, ref[2] + (m.local_z ?? 0)]);
        const s = sphere('#fbbf24', 5);
        s.position.set(...chassisPt);
        s.userData = { aeroType: 'mount', pointName: m.name };
        state.scene.add(s);
        wobj.mountSpheres.push(s);
        const l = lineSegment(chassisPt, wingLE, '#fbbf24');
        l.userData = { aeroType: 'mount_line' };
        state.scene.add(l);
        wobj.mountLines.push(l);
    }
}

// ============================================================
// UNDERTRAY (floor panel)
// ============================================================

export function buildUndertray() {
    const uobj = state.sceneObjects.undertray;
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
    const totalLen = frontX - rearX;
    const thick = 3;
    const splitterH = 8;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, transparent: true, opacity, side: THREE.DoubleSide });
    const matDetail = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.4, metalness: 0.2, transparent: true, opacity: opacity * 0.85, side: THREE.DoubleSide });

    function computeZ(t, yRatio) {
        let z = gc;
        if (t >= vStart && t <= vEnd) {
            const centerFactor = 1.0 - yRatio;
            const localT = (t - vStart) / (vEnd - vStart);
            z = gc - vDepth * Math.sin(localT * Math.PI) * centerFactor;
        }
        return z;
    }

    function addMesh(verts, indices, material, userData) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const wp = chassisTransform([pos.getX(i), pos.getY(i), pos.getZ(i)]);
            pos.setXYZ(i, ...wp);
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, material);
        mesh.userData = userData;
        state.scene.add(mesh);
        uobj.meshes.push(mesh);
        return mesh;
    }

    // ── 1. CLOSED SOLID BODY ──
    // Top surface + bottom surface + 4 perimeter edge strips = one closed 3D slab
    const nLong = 24, nLat = 10;
    const stride = nLat + 1;
    const topCount = (nLong + 1) * stride;
    const verts = [], indices = [];

    // Top surface vertices
    for (let i = 0; i <= nLong; i++) {
        const t = i / nLong;
        const x = frontX - t * totalLen;
        for (let j = 0; j <= nLat; j++) {
            const y = -hw + (j / nLat) * 2 * hw;
            const yRatio = Math.abs(y) / hw;
            verts.push(x, y, computeZ(t, yRatio));
        }
    }
    // Bottom surface vertices (flat at gc - thick)
    for (let i = 0; i <= nLong; i++) {
        const t = i / nLong;
        const x = frontX - t * totalLen;
        for (let j = 0; j <= nLat; j++) {
            const y = -hw + (j / nLat) * 2 * hw;
            verts.push(x, y, gc - thick);
        }
    }
    // Top surface faces
    for (let i = 0; i < nLong; i++) {
        for (let j = 0; j < nLat; j++) {
            const a = i * stride + j, b = a + 1, c = (i + 1) * stride + j, d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    // Bottom surface faces (reversed winding)
    for (let i = 0; i < nLong; i++) {
        for (let j = 0; j < nLat; j++) {
            const a = topCount + i * stride + j, b = a + 1;
            const c = topCount + (i + 1) * stride + j, d = c + 1;
            indices.push(a, b, c, b, d, c);
        }
    }
    // Front edge strip (i=0, top→bottom)
    for (let j = 0; j < nLat; j++) {
        const tL = j, tR = j + 1, bL = topCount + j, bR = topCount + j + 1;
        indices.push(tL, bL, tR, tR, bL, bR);
    }
    // Rear edge strip (i=nLong, top→bottom)
    for (let j = 0; j < nLat; j++) {
        const tL = nLong * stride + j, tR = nLong * stride + j + 1;
        const bL = topCount + nLong * stride + j, bR = topCount + nLong * stride + j + 1;
        indices.push(tL, tR, bL, bL, tR, bR);
    }
    // Left edge strip (j=0, y=-hw)
    for (let i = 0; i < nLong; i++) {
        const tF = i * stride, tB = (i + 1) * stride;
        const bF = topCount + i * stride, bB = topCount + (i + 1) * stride;
        indices.push(tF, bF, tB, tB, bF, bB);
    }
    // Right edge strip (j=nLat, y=+hw)
    for (let i = 0; i < nLong; i++) {
        const tF = i * stride + nLat, tB = (i + 1) * stride + nLat;
        const bF = topCount + i * stride + nLat, bB = topCount + (i + 1) * stride + nLat;
        indices.push(tF, tB, bF, bF, tB, bB);
    }
    addMesh(verts, indices, mat, { aeroType: 'undertray_body' });

    // ── 2. FRONT SPLITTER LIP ──
    // Raised strip at front edge following surface contour, 15mm deep, tapering back
    const lipDepth = 15;
    const sVerts = [], sIdx = [];
    for (let j = 0; j <= nLat; j++) {
        const y = -hw + (j / nLat) * 2 * hw;
        const yRatio = Math.abs(y) / hw;
        const z0 = computeZ(0, yRatio);
        sVerts.push(frontX, y, z0 + splitterH);
        sVerts.push(frontX, y, z0);
        sVerts.push(frontX - lipDepth, y, z0 + splitterH * 0.5);
        sVerts.push(frontX - lipDepth, y, z0);
    }
    const sStride = 4;
    for (let j = 0; j < nLat; j++) {
        const a0 = j * sStride, a1 = a0 + 1, a2 = a0 + 2, a3 = a0 + 3;
        const b0 = (j + 1) * sStride, b1 = b0 + 1, b2 = b0 + 2, b3 = b0 + 3;
        sIdx.push(a0, a1, b0, b0, a1, b1);     // front face
        sIdx.push(a0, b0, a2, a2, b0, b2);      // top face
        sIdx.push(a2, a3, b2, b2, a3, b3);      // back face
    }
    addMesh(sVerts, sIdx, matDetail, { aeroType: 'undertray_splitter' });

    // ── 3. LONGITUDINAL STIFFENING RIBS ──
    // Two ribs at y ≈ ±hw*0.35, following surface contour, 3mm raised, 8mm wide
    const ribH = 3, ribW = 4;
    for (const ribYSign of [-1, 1]) {
        const ribYCenter = ribYSign * hw * 0.35;
        const ribVerts = [], ribIdx = [];
        for (let i = 0; i <= nLong; i++) {
            const t = i / nLong;
            const x = frontX - t * totalLen;
            const yRatio = Math.abs(ribYCenter) / hw;
            const z = computeZ(t, yRatio);
            ribVerts.push(x, ribYCenter - ribW, z);
            ribVerts.push(x, ribYCenter + ribW, z);
            ribVerts.push(x, ribYCenter - ribW, z + ribH);
            ribVerts.push(x, ribYCenter + ribW, z + ribH);
        }
        const rStride = 4;
        for (let i = 0; i < nLong; i++) {
            const a = i * rStride, b = a + 1, c = a + 2, d = a + 3;
            const e = (i + 1) * rStride, f = e + 1, g = e + 2, h = e + 3;
            ribIdx.push(a, e, c, c, e, g);   // left side
            ribIdx.push(b, d, f, f, d, h);   // right side
            ribIdx.push(c, g, d, d, g, h);   // top face
        }
        addMesh(ribVerts, ribIdx, matDetail, { aeroType: 'undertray_rib' });
    }

    // ── 4. Edge flip-ups ──
    for (const fu of (cfg.edge_flipups || [])) {
        const isRight = fu.side === 'right';
        const ySign = isRight ? 1 : -1;
        const baseY = ySign * hw;
        const startX = frontX - fu.start_ratio * totalLen;
        const endX = startX - fu.length;
        const flipH = fu.height || 40;

        const fuSamples = 12;
        const fuVerts = [];
        const fuIndices = [];
        for (let i = 0; i <= fuSamples; i++) {
            const t = i / fuSamples;
            const x = startX - t * (startX - endX);
            const ramp = Math.sin(t * Math.PI * 0.5);
            const zBase = gc;
            const zTip = gc + flipH * ramp;
            const yBase = baseY;
            const yTip = baseY + ySign * (flipH * 0.3) * ramp;
            fuVerts.push(x, yBase, zBase);
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
        const fuMesh = new THREE.Mesh(fuGeo, matDetail);
        fuMesh.userData = { aeroType: 'undertray_flipup', name: fu.name };
        state.scene.add(fuMesh);
        uobj.flipups.push(fuMesh);
    }

    // --- 8. Underfloor strakes ---
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
            const taper = Math.sin(t * Math.PI);
            const h = skH * taper;
            // Top edge (attached to floor surface)
            skVerts.push(x, skY, gc - thick);
            // Bottom edge (hanging downward toward ground)
            const yOff = ySign * h * Math.cos(skAngle);
            const zOff = h * Math.sin(skAngle);
            skVerts.push(x, skY + yOff, Math.max(gc - thick - zOff, 5));
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
        const skMesh = new THREE.Mesh(skGeo, matDetail);
        skMesh.userData = { aeroType: 'undertray_strake', name: sk.name };
        state.scene.add(skMesh);
        uobj.strakes.push(skMesh);
    }

    // --- 9. Mounts ---
    for (const m of (cfg.mounts || [])) {
        const fn = m.frame_node;
        const isRight = (m.local_y ?? 0) >= 0;
        const chassisPt = resolveChassisNode(fn, isRight);
        if (!chassisPt) continue;
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

    const entryHW = utCfg ? utCfg.half_width : 360;
    const entryZ = utCfg ? utCfg.ground_clearance : 28;
    const exitX = startX - length - exitOverhang;
    const exitZ = entryZ + length * Math.tan(angle);

    // --- 1. Diffuser panel ---
    const nLong = 12, nLat = 12;
    const diffVerts = [];
    const diffIndices = [];
    for (let i = 0; i <= nLong; i++) {
        const t = i / nLong;
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

    // --- 2. Diffuser strakes ---
    for (let ch = 1; ch <= channels; ch++) {
        const yRatio = ch / (channels + 1);
        const strakeSamples = 8;
        const skVerts = [];
        const skIndices = [];
        for (let i = 0; i <= strakeSamples; i++) {
            const t = i / strakeSamples;
            const x = startX - t * length;
            const z = entryZ + t * (exitZ - entryZ);
            const hw = entryHW + t * (exitHW - entryHW);
            const y = -hw + yRatio * 2 * hw;
            // Compute ySign AFTER y is defined (fix for ReferenceError in plan)
            const ySign = y > 0 ? -1 : 1;
            const taper = Math.sin(t * Math.PI);
            const h = strakeH * taper;
            skVerts.push(x, y, z);
            // Strakes hang DOWNWARD from diffuser surface toward ground, lean inward
            const inwardY = ySign * h * Math.cos(strakeAngle);
            const zOff = h * Math.sin(strakeAngle);
            skVerts.push(x, y + inwardY, Math.max(z - zOff, 5));
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

// ============================================================
// UPDATE FRAME POSITIONS (chassis mode)
// ============================================================

export function updateFramePositions() {
    const fobjs = state.sceneObjects.frame;
    for (const [name, pos] of Object.entries(state.frameNodes)) {
        if (fobjs.spheres[name]) { const p = chassisTransform(pos);
            fobjs.spheres[name].position.set(...p); }
    }
    for (const line of fobjs.tubes) {
        const ep = line.userData?.endpoints;
        if (!ep) continue;
        if (line.userData?.isCurve) {
            const pts = ep.map(n => resolveFramePoint(n)).filter(Boolean);
            if (pts.length < 2) continue;
            const worldPts = pts.map(p => new THREE.Vector3(...chassisTransform(p)));
            const curve = new THREE.CatmullRomCurve3(worldPts, false, 'catmullrom', 0.5);
            const samples = curve.getPoints(ep.length * 16);
            line.geometry.setFromPoints(samples);
        } else {
            const a = resolveFramePoint(ep[0]), b = resolveFramePoint(ep[1]);
            if (a && b) { const wa = chassisTransform(a), wb = chassisTransform(b);
                line.geometry.setFromPoints([new THREE.Vector3(...wa), new THREE.Vector3(...wb)]); }
        }
    }
    for (let i = 0; i < fobjs.rockerFaces.length; i++) {
        const mesh = fobjs.rockerFaces[i], isFront = i < 2, sfx = (i % 2 === 0) ? '' : '_L';
        const pts = [resolveFramePoint((isFront ? 'CH5' : 'R_CH5') + sfx),
            resolveFramePoint((isFront ? 'RK_PIVOT_' : 'R_RK_PIVOT_') + (sfx ? 'L' : 'R')),
            resolveFramePoint((isFront ? 'RK_DAMPER_' : 'R_RK_DAMPER_') + (sfx ? 'L' : 'R'))].filter(Boolean);
        if (pts.length !== 3) continue;
        const w = pts.map(p => chassisTransform(p));
        const v = new Float32Array([w[0][0], w[0][1], w[0][2], w[1][0], w[1][1], w[1][2], w[2][0], w[2][1], w[2][2]]);
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(v, 3));
        mesh.geometry.setIndex([0, 1, 2]);
        mesh.geometry.computeVertexNormals();
    }
}
