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
// DYNAMIC TRACK PANEL
// ============================================================
import { simulate, togglePlay, seekTo, setSpeed } from './playback.js';
import { initDashboard, clearDashboard } from './dashboard.js';

window._obstacles = [];

document.getElementById('runSimBtn')?.addEventListener('click', async () => {
    const pathPts = readPathTable();
    const obstacles = [...(window._obstacles || [])];
    const speed = parseFloat(document.getElementById('simSpeed').value) || 12000;
    const duration = parseFloat(document.getElementById('simDuration').value) || 5;
    if (pathPts.length < 2) { alert('至少需要 2 个路径点'); return; }
    clearDashboard();
    await simulate({ path: pathPts, obstacles, speed, duration });
    document.getElementById('playbackControls').style.display = '';
    document.getElementById('dashboardCharts').style.display = '';
    initDashboard();
    state.isPlaying = true;
    state.lastFrameTime = 0;
    document.getElementById('playPauseBtn').textContent = '⏸';
});

document.getElementById('playPauseBtn')?.addEventListener('click', togglePlay);
document.getElementById('playbackSeek')?.addEventListener('input', (e) => seekTo(parseFloat(e.target.value)));
document.getElementById('speed05Btn')?.addEventListener('click', () => { setSpeed(0.5);
    ['speed05Btn','speed1Btn','speed2Btn'].forEach(id => document.getElementById(id)?.classList.remove('dyn-active'));
    document.getElementById('speed05Btn')?.classList.add('dyn-active'); });
document.getElementById('speed1Btn')?.addEventListener('click', () => { setSpeed(1.0);
    ['speed05Btn','speed1Btn','speed2Btn'].forEach(id => document.getElementById(id)?.classList.remove('dyn-active'));
    document.getElementById('speed1Btn')?.classList.add('dyn-active'); });
document.getElementById('speed2Btn')?.addEventListener('click', () => { setSpeed(2.0);
    ['speed05Btn','speed1Btn','speed2Btn'].forEach(id => document.getElementById(id)?.classList.remove('dyn-active'));
    document.getElementById('speed2Btn')?.classList.add('dyn-active'); });
document.getElementById('loopToggleBtn')?.addEventListener('click', function() {
    state.playbackLoop = !state.playbackLoop;
    this.classList.toggle('dyn-active', state.playbackLoop);
});

// Path table buttons
document.getElementById('addPathPtBtn')?.addEventListener('click', () => {
    const tbody = document.querySelector('#pathTable tbody');
    const row = tbody.insertRow();
    const n = tbody.rows.length;
    row.innerHTML = `<td class="text-[#8B7355]">${n}</td>
        <td><input class="dyn-input w-full" type="number" value="0" step="100"></td>
        <td><input class="dyn-input w-full" type="number" value="0" step="100"></td>
        <td><button class="dyn-btn-ghost" onclick="this.closest('tr').remove()">✕</button></td>`;
});
document.getElementById('clearPathBtn')?.addEventListener('click', () => {
    document.querySelector('#pathTable tbody').innerHTML = '';
});
// Seed 4 default points
setTimeout(() => { for (let i = 0; i < 4; i++) document.getElementById('addPathPtBtn')?.click(); }, 300);

// Obstacle buttons
document.getElementById('addBumpBtn')?.addEventListener('click', () => addObstacle('bump'));
document.getElementById('addKerbBtn')?.addEventListener('click', () => addObstacle('kerb'));
document.getElementById('addRampBtn')?.addEventListener('click', () => addObstacle('ramp'));

function readPathTable() {
    const rows = document.querySelectorAll('#pathTable tbody tr');
    const pts = [];
    rows.forEach(r => {
        const ins = r.querySelectorAll('input');
        if (ins.length >= 2) pts.push([parseFloat(ins[0].value)||0, parseFloat(ins[1].value)||0]);
    });
    return pts;
}

function addObstacle(type) {
    const obs = { type };
    if (type === 'bump') { obs.x = 1000; obs.y = 0; obs.length = 300; obs.width = 150; obs.height = 30; }
    if (type === 'kerb') { obs.x_start = -500; obs.y_start = 380; obs.x_end = 500; obs.y_end = 380; obs.width = 200; obs.height = 50; }
    if (type === 'ramp') { obs.x_start = -500; obs.y_start = -380; obs.x_end = 500; obs.y_end = -380; obs.width = 200; obs.h_start = 0; obs.height = 40; }
    window._obstacles.push(obs);
    renderObstacleList();
}

function renderObstacleList() {
    const el = document.getElementById('obstacleList');
    if (!el) return;
    el.innerHTML = (window._obstacles||[]).map((o,i) =>
        `<div class="flex justify-between items-center"><span>${o.type}#${i+1} ${o.type==='bump'?`@(${o.x},${o.y})`:''}</span> <button class="dyn-btn-ghost text-xs" onclick="window._obstacles.splice(${i},1);renderObstacleList()">✕</button></div>`).join('');
}

// ============================================================
// START
// ============================================================

init();

// E2E test hook — allow calling solveAndUpdate from page.evaluate()
window.__solveNow = solveAndUpdate;
