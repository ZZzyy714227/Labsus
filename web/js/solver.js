import { state } from './state.js';
import { updateSidePoints, updateRockerKinematics, buildBodyworkFaces, buildFrontWing, buildRearWing, updateFramePositions, updateDamperCylinders } from './builders.js';
import { updateAngleDisplay, updateDerivedInfo, chassisPoseToTravel } from './ui.js';

// ============================================================
// MIRROR HARD POINTS
// ============================================================

export function mirrorHardpoints(hpR) {
    const hpL = {};
    for (const [k, v] of Object.entries(hpR)) hpL[k] = Array.isArray(v) && v.length === 3 ? [v[0], -v[1], v[2]] : v;
    return hpL;
}

// ============================================================
// HARD POINT / FRAME TABLE READS
// ============================================================

export function readHardpointsFromTables() {
    document.querySelectorAll('#hpTableBody input').forEach(inp => {
        const k = inp.dataset.key, a = parseInt(inp.dataset.axis);
        if (state.hardpointsFrontRight[k]) state.hardpointsFrontRight[k][a] = parseFloat(inp.value);
    });
    state.hardpointsFrontLeft = mirrorHardpoints(state.hardpointsFrontRight);
    document.querySelectorAll('#rearHpTableBody input').forEach(inp => {
        const k = inp.dataset.key, a = parseInt(inp.dataset.axis);
        if (state.hardpointsRearRight[k]) state.hardpointsRearRight[k][a] = parseFloat(inp.value);
    });
    state.hardpointsRearLeft = mirrorHardpoints(state.hardpointsRearRight);
}

export function readFrameNodesFromTable() {
    document.querySelectorAll('#frameNodeTableBody input').forEach(inp => {
        const k = inp.dataset.key, a = parseInt(inp.dataset.axis);
        if (state.frameNodes[k]) state.frameNodes[k][a] = parseFloat(inp.value);
    });
}

export function readDamperMountsFromTable() {
    document.querySelectorAll('#damperMountTableBody input').forEach(inp => {
        const k = inp.dataset.key, a = parseInt(inp.dataset.axis);
        if (state.frameNodes[k]) state.frameNodes[k][a] = parseFloat(inp.value);
    });
}

// ============================================================
// DEFAULT DATA LOADING
// ============================================================

export async function loadDefaults() {
    let data;
    try { const r = await fetch('/api/defaults'); if (!r.ok) throw new Error('HTTP ' + r.status); data = await r.json(); }
    catch (e) { console.error('Failed to load defaults:', e); alert('无法连接后端服务器，请确认 python run.py 已启动'); return; }
    state.hardpointsFrontRight = data.front.right;
    state.hardpointsFrontLeft = data.front.left;
    state.anglesFrontRight = data.front.angles_right;
    state.anglesFrontLeft = data.front.angles_left;
    state.currentResultFrontRight = { ...data.front.right };
    state.currentResultFrontLeft = { ...data.front.left };
    state.hardpointsRearRight = data.rear.right;
    state.hardpointsRearLeft = data.rear.left;
    state.anglesRearRight = data.rear.angles_right;
    state.anglesRearLeft = data.rear.angles_left;
    state.currentResultRearRight = { ...data.rear.right };
    state.currentResultRearLeft = { ...data.rear.left };
    state.contactPatches.frontRight = data.front.contact_patch_right || null;
    state.contactPatches.frontLeft = data.front.contact_patch_left || null;
    state.contactPatches.rearRight = data.rear.contact_patch_right || null;
    state.contactPatches.rearLeft = data.rear.contact_patch_left || null;
    state.frameNodes = data.frame.nodes || {};
    state.frameTubes = data.frame.tubes || [];
    state.tubeColors = data.frame.tube_colors || {};
    state.bodyworkFaces = data.bodywork || {};
    state.rearWingConfig = data.rear_wing || null;
    state.frontWingConfig = data.front_wing || null;
    state.undertrayConfig = data.undertray || null;
    state.diffuserConfig = data.diffuser || null;
    state.designParams = data.params || {};
}

// ============================================================
// SOLVE FLOW
// ============================================================

export function requestSolve() {
    if (state.solveRunning || state.solveScheduled) return;
    state.solveScheduled = true;
    requestAnimationFrame(() => {
        state.solveScheduled = false;
        state.solveRunning = true;
        _doSolveInternal().finally(() => { state.solveRunning = false; });
    });
}

async function _doSolveInternal() {
    const myId = ++state._solveId;

    let ft, rt, fL, rL;
    const rack = parseFloat(document.getElementById('rackSlider').value);
    if (state.chassisMode) {
        const t = chassisPoseToTravel();
        ft = t.front_right;
        rt = t.rear_right;
        fL = t.front_left;
        rL = t.rear_left;
    } else {
        ft = parseFloat(document.getElementById('frontTravelSlider').value);
        rt = parseFloat(document.getElementById('rearTravelSlider').value);
        fL = ft;
        rL = rt;
    }
    readHardpointsFromTables();
    let data;
    try {
        const r = await fetch('/api/solve', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                front_hardpoints: state.hardpointsFrontRight, rear_hardpoints: state.hardpointsRearRight,
                front_travel: ft, rear_travel: rt, front_left_travel: fL, rear_left_travel: rL,
                rack_displacement: rack, mirror: true
            })
        });
        if (!r.ok) return;
        data = await r.json();
    } catch (e) { console.error('Solve error:', e); return; }

    state.currentResultFrontRight = data.front.right;
    state.currentResultFrontLeft = data.front.left;
    state.anglesFrontRight = data.front.angles_right;
    state.anglesFrontLeft = data.front.angles_left;
    state.contactPatches.frontRight = data.front.contact_patch_right || null;
    state.contactPatches.frontLeft = data.front.contact_patch_left || null;
    updateSidePoints(data.front.right, 'frontRight');
    updateSidePoints(data.front.left, 'frontLeft');
    state.currentResultRearRight = data.rear.right;
    state.currentResultRearLeft = data.rear.left;
    state.anglesRearRight = data.rear.angles_right;
    state.anglesRearLeft = data.rear.angles_left;
    state.contactPatches.rearRight = data.rear.contact_patch_right || null;
    state.contactPatches.rearLeft = data.rear.contact_patch_left || null;
    updateSidePoints(data.rear.right, 'rearRight', 'R_');
    updateSidePoints(data.rear.left, 'rearLeft', 'R_');
    updateRockerKinematics();
    updateAngleDisplay();
    updateDerivedInfo();
    if (state.chassisMode) {
        updateFramePositions();
        updateDamperCylinders();
        buildBodyworkFaces();
        buildRearWing();
        buildFrontWing();
    }
}

// Non-throttled solve for "Apply" button / save actions
export async function solveAndUpdate() {
    state.solveRunning = true;
    try { await _doSolveInternal(); } finally { state.solveRunning = false; }
}
