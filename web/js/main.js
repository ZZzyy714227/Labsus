import { state } from './state.js';
import { solveAndUpdate, requestSolve, loadDefaults, mirrorHardpoints, readHardpointsFromTables, readFrameNodesFromTable, readDamperMountsFromTable, resetSolveState } from './solver.js';
import { rebuildScene, applyToUI, renderParamSliders, updateChassisMode, updateChassisDisplay, onChassisSliderInput, applyParams } from './ui.js';
import { onDoubleClick, addMultiSelect, clearMultiSelect, addTubeFromSelection, savePoint, deleteTube, saveTubePermanent, saveTubeColor, createFace, deleteFace, updateFace } from './interactions.js';
import { loadKinCurves, updateKinChart } from './chart.js';
import { playbackTick } from './playback.js';

// ============================================================
// INITIALIZATION
// ============================================================

function init() {
    console.log('init() started');
    const w = state.viewport.clientWidth, h = state.viewport.clientHeight;
    state.renderer.setSize(w, h);
    state.camera.aspect = w / Math.max(h, 1);
    state.camera.updateProjectionMatrix();
    loadDefaults().then(() => {
        console.log('loadDefaults resolved, calling rebuildScene');
        rebuildScene();
        console.log('rebuildScene done, calling applyToUI');
        applyToUI();
        console.log('applyToUI done, calling solveAndUpdate');
        solveAndUpdate();
        loadKinCurves();
        console.log('init complete');
    }).catch(e => {
        console.error('init error in loadDefaults chain:', e);
    });
    animate();
    lucide.createIcons();
    setTimeout(() => lucide.createIcons(), 600);
}

function animate() {
    requestAnimationFrame(animate);
    playbackTick(performance.now());
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

// ============================================================
// EVENT HANDLERS — SLIDERS
// ============================================================

document.getElementById('frontTravelSlider').addEventListener('input', () => {
    document.getElementById('frontTravelVal').textContent = document.getElementById('frontTravelSlider').value + ' mm';
    requestSolve();
});
document.getElementById('rearTravelSlider').addEventListener('input', () => {
    document.getElementById('rearTravelVal').textContent = document.getElementById('rearTravelSlider').value + ' mm';
    requestSolve();
});
// 齿条位移：input 事件只触发轻量 solve，change 事件（松开）才触发 sweep 扫描
const _rackSlider = document.getElementById('rackSlider');
_rackSlider.addEventListener('input', () => {
    document.getElementById('rackVal').textContent = _rackSlider.value + ' mm';
    requestSolve();
});
_rackSlider.addEventListener('change', () => {
    loadKinCurves();
});
document.getElementById('resetBtn').addEventListener('click', () => {
    // 先清除求解锁，防止死锁导致重置后无响应
    resetSolveState();
    document.getElementById('frontTravelSlider').value = 0;
    document.getElementById('rearTravelSlider').value = 0;
    document.getElementById('rackSlider').value = 0;
    document.getElementById('frontTravelVal').textContent = '0.0 mm';
    document.getElementById('rearTravelVal').textContent = '0.0 mm';
    document.getElementById('rackVal').textContent = '0.0 mm';
    if (state.chassisMode) {
        document.getElementById('heaveSlider').value = 0;
        document.getElementById('pitchSlider').value = 0;
        document.getElementById('rollSlider').value = 0;
        state.chassisPose = { heave: 0, pitch: 0, roll: 0 };
        updateChassisDisplay();
    }
    loadDefaults().then(() => {
        rebuildScene();
        applyToUI();
        solveAndUpdate();
        loadKinCurves();
    });
});

// ============================================================
// CHASSIS MODE
// ============================================================

document.getElementById('chassisModeToggle').addEventListener('change', function () {
    state.chassisMode = this.checked;
    document.getElementById('chassisControls').classList.toggle('js-hide', !state.chassisMode);
    document.getElementById('frontTravelSlider').disabled = state.chassisMode;
    document.getElementById('rearTravelSlider').disabled = state.chassisMode;
    if (state.chassisMode) {
        updateChassisMode();
    } else {
        state.chassisPose = { heave: 0, pitch: 0, roll: 0 };
        requestSolve();
    }
});

document.getElementById('pitchSlider').addEventListener('input', onChassisSliderInput);
document.getElementById('rollSlider').addEventListener('input', onChassisSliderInput);
document.getElementById('heaveSlider').addEventListener('input', onChassisSliderInput);

// ============================================================
// APPLY BUTTON
// ============================================================

document.getElementById('applyBtn').addEventListener('click', () => {
    readHardpointsFromTables();
    readFrameNodesFromTable();
    readDamperMountsFromTable();
    state.hardpointsFrontLeft = mirrorHardpoints(state.hardpointsFrontRight);
    state.hardpointsRearLeft = mirrorHardpoints(state.hardpointsRearRight);
    state.currentResultFrontRight = { ...state.hardpointsFrontRight };
    state.currentResultFrontLeft = { ...state.hardpointsFrontLeft };
    state.currentResultRearRight = { ...state.hardpointsRearRight };
    state.currentResultRearLeft = { ...state.hardpointsRearLeft };
    rebuildScene();
    requestSolve();
    loadKinCurves();
});

// ============================================================
// CURVE PARAMETER SELECTOR
// ============================================================

document.getElementById('curveParam').addEventListener('change', updateKinChart);

// ============================================================
// CANVAS EVENTS
// ============================================================

window.addEventListener('resize', () => {
    const w = state.viewport.clientWidth, h = state.viewport.clientHeight;
    state.camera.aspect = w / Math.max(h, 1);
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
});

state.renderer.domElement.addEventListener('dblclick', onDoubleClick);
state.renderer.domElement.addEventListener('click', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const rect = state.renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.mouse, state.camera);
    const allS = [];
    for (const sk of ['frontRight', 'frontLeft', 'rearRight', 'rearLeft'])
        for (const s of Object.values(state.sceneObjects[sk].spheres)) allS.push(s);
    for (const s of Object.values(state.sceneObjects.frame.spheres)) allS.push(s);
    const hits = state.raycaster.intersectObjects(allS, false);
    if (hits.length > 0) {
        const m = hits[0].object;
        if (m.isMesh && m.userData.pointName) { addMultiSelect(m.userData.pointName, m); event.preventDefault(); }
    }
});

// ============================================================
// DESIGN PARAMETERS PANEL
// ============================================================

document.getElementById('paramAxle').addEventListener('change', renderParamSliders);
document.getElementById('applyParamsBtn').addEventListener('click', applyParams);
setTimeout(renderParamSliders, 500);

// ============================================================
// BUTTON LISTENERS
// ============================================================

document.getElementById('addTubeFromSelectBtn').addEventListener('click', addTubeFromSelection);
document.getElementById('createFaceBtn').addEventListener('click', createFace);
document.getElementById('clearMultiBtn').addEventListener('click', clearMultiSelect);

const saveTempEl = document.getElementById('saveTempBtn'),
    savePermEl = document.getElementById('savePermBtn');
if (saveTempEl) saveTempEl.addEventListener('click', () => savePoint(false));
if (savePermEl) savePermEl.addEventListener('click', () => savePoint(true));

const delTempEl = document.getElementById('deleteTempBtn'),
    delPermEl = document.getElementById('deletePermBtn');
if (delTempEl) delTempEl.addEventListener('click', () => deleteTube(false));
if (delPermEl) delPermEl.addEventListener('click', () => deleteTube(true));

const stpEl = document.getElementById('saveTubePermBtn');
if (stpEl) stpEl.addEventListener('click', saveTubePermanent);

const tcTempEl = document.getElementById('tubeColorTempBtn'),
    tcPermEl = document.getElementById('tubeColorPermBtn');
if (tcTempEl) tcTempEl.addEventListener('click', () => saveTubeColor(false));
if (tcPermEl) tcPermEl.addEventListener('click', () => saveTubeColor(true));

const fuTempEl = document.getElementById('faceUpdateTempBtn'),
    fuPermEl = document.getElementById('faceUpdatePermBtn');
if (fuTempEl) fuTempEl.addEventListener('click', () => updateFace(false));
if (fuPermEl) fuPermEl.addEventListener('click', () => updateFace(true));

const fdTempEl = document.getElementById('faceDeleteTempBtn'),
    fdPermEl = document.getElementById('faceDeletePermBtn');
if (fdTempEl) fdTempEl.addEventListener('click', () => deleteFace(false));
if (fdPermEl) fdPermEl.addEventListener('click', () => deleteFace(true));

// ============================================================
// START
// ============================================================

init();

// E2E test hook — allow calling solveAndUpdate from page.evaluate()
window.__solveNow = solveAndUpdate;
