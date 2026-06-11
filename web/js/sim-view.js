/**
 * Standalone sim-view: full-screen 3D view of the car driving on track.
 * Loads trajectory from sessionStorage (set by main.js) or re-fetches /api/simulate.
 * Reuses builders.js / scene.js / state.js to render the complete car.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';
import { buildSidePoints, buildFrame, buildRearWing, buildFrontWing,
         buildUndertray, buildDiffuser, buildBodyworkFaces } from './builders.js';
import {
    renderPathLine, renderObstaclePreviews, clearTrackElements
} from './scene.js';

// ============================================================
// Three.js scene setup
// ============================================================
const viewport = document.getElementById('simViewport');
const w = window.innerWidth, h = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x1F1612);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1F1612);

const camera = new THREE.PerspectiveCamera(45, w / h, 1, 20000);
camera.position.set(0, 2500, 5000);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.target.set(0, 0, 500);
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 500;
controls.maxDistance = 15000;

// Assign to global state so builders.js can find them
state.scene = scene;
state.camera = camera;
state.renderer = renderer;
state.controls = controls;
state.viewport = viewport;

// Add ambient + directional light
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(2000, 3000, 2000);
scene.add(dirLight);

// Grid helper — horizontal XY-plane at Z=0
const grid = new THREE.GridHelper(8000, 40, 0xFC7607, 0x3A2A20);
grid.rotation.x = Math.PI / 2;  // Rotate from XZ to XY plane
grid.position.z = 0;
scene.add(grid);

// Ground plane (semi-transparent) — XY plane at Z=0
const groundGeom = new THREE.PlaneGeometry(8000, 8000);
const groundMat = new THREE.MeshBasicMaterial({
    color: 0x2A1F18, side: THREE.DoubleSide, transparent: true, opacity: 0.3,
});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.position.z = 0;
scene.add(ground);

// ============================================================
// Load car config
// ============================================================
let trajectory = null;
let frames = [];
let isPlaying = false;
let currentTime = 0;
let playbackSpeed = 1.0;
let totalTime = 0;
let cameraMode = 0; // 0=orbit, 1=chase, 2=top-down
const CAMERA_MODES = [
    { label: '自由', pos: [0, 2500, 5000], target: [0, 0, 500] },
    { label: '跟随', pos: [0, 800, -2000], target: [0, 0, 500] },
    { label: '俯视', pos: [0, 5000, 0], target: [0, 0, 500] },
];
let carGroup = new THREE.Group();
scene.add(carGroup);

// Store sub-scene for car parts (built into carGroup)
state.sceneObjects._carGroup = carGroup;

// ============================================================
// Initialize car from defaults
// ============================================================
async function initCar() {
    const resp = await fetch('/api/defaults');
    const data = await resp.json();

    // Populate state with frame config
    state.frameNodes = data.frame?.nodes || {};
    state.frameTubes = data.frame?.tubes || [];
    state.tubeColors = data.frame?.tube_colors || {};
    state.bodyworkFaces = data.bodywork || {};
    state.rearWingConfig = data.rear_wing || {};
    state.frontWingConfig = data.front_wing || {};
    state.undertrayConfig = data.undertray || {};
    state.diffuserConfig = data.diffuser || {};

    // Hardpoints
    const frontRight = data.front?.right || {};
    const frontLeft = data.front?.left || {};
    const rearRight = data.rear?.right || {};
    const rearLeft = data.rear?.left || {};

    state.hardpointsFrontRight = frontRight;
    state.hardpointsFrontLeft = frontLeft;
    state.hardpointsRearRight = rearRight;
    state.hardpointsRearLeft = rearLeft;

    // Current results = hardpoints (for builders compatibility)
    state.currentResultFrontRight = { ...frontRight };
    state.currentResultFrontLeft = { ...frontLeft };
    state.currentResultRearRight = { ...rearRight };
    state.currentResultRearLeft = { ...rearLeft };

    // Build the full car into carGroup
    const savedScene = state.scene;
    state.scene = carGroup; // redirect builders to add to carGroup

    buildSidePoints(frontRight, 'frontRight', state.FRONT_COLORS, '');
    buildSidePoints(frontLeft, 'frontLeft', state.FRONT_COLORS, '');
    buildSidePoints(rearRight, 'rearRight', state.REAR_COLORS, 'R_');
    buildSidePoints(rearLeft, 'rearLeft', state.REAR_COLORS, 'R_');
    buildFrame();
    buildBodyworkFaces();
    if (data.rear_wing?.enabled) buildRearWing();
    if (data.front_wing?.enabled) buildFrontWing();
    if (data.undertray?.enabled) buildUndertray();
    if (data.diffuser?.enabled) buildDiffuser();

    state.scene = savedScene;
    scene.add(carGroup);
}

// ============================================================
// Load trajectory
// ============================================================
async function loadTrajectory() {
    // Try localStorage first (set by main.js — shared across tabs/windows)
    const stored = localStorage.getItem('simTrajectory');
    if (stored) {
        try {
            trajectory = JSON.parse(stored);
            console.log('Loaded trajectory from localStorage');
            return;
        } catch (e) { /* fall through */ }
    }
    // Try stored params
    const paramsStr = localStorage.getItem('simParams');
    if (paramsStr) {
        const params = JSON.parse(paramsStr);
        const resp = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        if (resp.ok) {
            trajectory = await resp.json();
            console.log('Fetched trajectory from params');
            return;
        }
    }
    // Fallback: elliptic oval default
    const resp = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: [[-4000,0],[-2000,2000],[0,2500],[2000,2000],[4000,0],[2000,-2000],[0,-2500],[-2000,-2000]],
            obstacles: [
                { type: 'kerb', x_start: -2100, y_start: 2100, x_end: -1900, y_end: 1900, width: 200, height: 40 },
                { type: 'bump', x: 0, y: 2600, length: 600, width: 900, height: 30 },
                { type: 'kerb', x_start: 1900, y_start: 1900, x_end: 2100, y_end: 2100, width: 200, height: 40 },
                { type: 'ramp', x_start: 3900, y_start: -200, x_end: 4100, y_end: 200, width: 900, h_start: 0, height: 35 },
                { type: 'bump', x: 0, y: -2600, length: 400, width: 900, height: 25 },
                { type: 'kerb', x_start: -2100, y_start: -1900, x_end: -1900, y_end: -2100, width: 200, height: 40 },
            ],
            speed: 20000,
            duration: 6,
        }),
    });
    if (resp.ok) {
        trajectory = await resp.json();
        console.log('Fetched fallback trajectory');
    } else {
        document.getElementById('statusText').textContent = '❌ 无法获取模拟数据';
    }
}

// ============================================================
// Apply frame to car
// ============================================================
function applyFrame(frame) {
    if (!frame) return;
    const hp = frame.hardpoints;
    if (!hp) return;

    // Update all 4 corners' sphere positions from hardpoints dict
    for (const sideKey of ['frontRight', 'frontLeft', 'rearRight', 'rearLeft']) {
        const objs = state.sceneObjects[sideKey];
        if (!objs) continue;
        for (const [key, sphere] of Object.entries(objs.spheres)) {
            const pos = hp[key];
            if (pos && pos.length === 3) {
                sphere.position.set(pos[0], pos[1], pos[2]);
            }
        }
        // Update lines
        for (const [name, line] of Object.entries(objs.lines)) {
            const [a, b] = (line.userData?.endpoints) || ['', ''];
            if (hp[a] && hp[b]) {
                line.geometry.setFromPoints([
                    new THREE.Vector3(hp[a][0], hp[a][1], hp[a][2]),
                    new THREE.Vector3(hp[b][0], hp[b][1], hp[b][2]),
                ]);
            }
        }
        // Update upright line
        if (objs.uprightLine) {
            // UP1-UP3-UP2-UP4-UP1
            const prefix = sideKey.startsWith('rear') ? 'R_' : '';
            const order = [prefix+'UP1', prefix+'UP3', prefix+'UP2', prefix+'UP4', prefix+'UP1'];
            const pts = order.filter(k => hp[k]).map(k => new THREE.Vector3(hp[k][0], hp[k][1], hp[k][2]));
            if (pts.length >= 2) {
                objs.uprightLine.geometry.setFromPoints(pts);
            }
        }
        // Update tire orientation (UP1, UP2, UP5)
        const prefix = sideKey.startsWith('rear') ? 'R_' : '';
        const up1 = hp[prefix+'UP1'], up2 = hp[prefix+'UP2'], up5 = hp[prefix+'UP5'];
        if (objs.tireGroup && up1 && up2 && up5) {
            objs.tireGroup.position.set(up5[0], up5[1], up5[2]);
            // Simple orientation: align with kingpin axis
            const kp = new THREE.Vector3(up2[0]-up1[0], up2[1]-up1[1], up2[2]-up1[2]);
            const up = new THREE.Vector3(0, 0, 1);
            const q = new THREE.Quaternion().setFromUnitVectors(up, kp.normalize());
            objs.tireGroup.quaternion.copy(q);
        }
        // Contact patch
        const cp = state.contactPatches[sideKey];
        if (objs.contactPatchLine && cp && hp[prefix+'UP5']) {
            const c = cp.center;
            if (c) {
                objs.contactPatchLine.geometry.setFromPoints([
                    new THREE.Vector3(hp[prefix+'UP5'][0], hp[prefix+'UP5'][1], hp[prefix+'UP5'][2]),
                    new THREE.Vector3(c[0], c[1], c[2]),
                ]);
            }
        }
    }

    // Update HUD
    const b = frame.body;
    document.getElementById('hudTime').textContent = `${frame.time.toFixed(2)}s`;
    const speedKmh = 0; // estimate later
    document.getElementById('hudSpeed').textContent = `${speedKmh.toFixed(0)} km/h`;

    const angles = frame.angles || {};
    document.getElementById('valCamber').innerHTML =
        `<span style="color:#FC7607">${(angles.camber?.[0]||0).toFixed(1)}°</span> / <span style="color:#D83514">${(angles.camber?.[1]||0).toFixed(1)}°</span>`;
    document.getElementById('valToe').textContent =
        `${(angles.toe?.[0]||0).toFixed(1)}° / ${(angles.toe?.[1]||0).toFixed(1)}°`;
    document.getElementById('valRP').textContent =
        `${(b.roll*180/Math.PI).toFixed(1)}° / ${(b.pitch*180/Math.PI).toFixed(1)}°`;

    // Update seek slider
    const slider = document.getElementById('seekSlider');
    slider.value = frame.time;
    slider.max = totalTime;
}

// ============================================================
// Playback loop
// ============================================================
function interpolateFrame(t) {
    if (!trajectory || !trajectory.frames.length) return null;
    const traj = trajectory;
    const ft = t / traj.dt;
    const idx = Math.floor(ft);
    const frac = ft - idx;

    if (idx >= traj.frames.length - 1) return traj.frames[traj.frames.length - 1];
    if (idx < 0) return traj.frames[0];

    const f0 = traj.frames[idx], f1 = traj.frames[idx + 1];
    const lerp = (a, b) => a + (b - a) * frac;

    // Interpolate body pose
    const body = {
        x: lerp(f0.body.x, f1.body.x),
        y: lerp(f0.body.y, f1.body.y),
        z: lerp(f0.body.z, f1.body.z),
        roll: lerp(f0.body.roll, f1.body.roll),
        pitch: lerp(f0.body.pitch, f1.body.pitch),
        yaw: lerp(f0.body.yaw, f1.body.yaw),
    };
    return { time: lerp(f0.time, f1.time), body,
             wheels: f1.wheels, angles: f1.angles, hardpoints: f1.hardpoints };
}

let lastTickTime = 0;

function animate(time) {
    requestAnimationFrame(animate);

    if (isPlaying && trajectory && trajectory.frames.length > 0) {
        if (lastTickTime === 0) lastTickTime = time;
        const dt = (time - lastTickTime) / 1000;
        lastTickTime = time;

        currentTime += dt * playbackSpeed;

        if (currentTime >= totalTime) {
            currentTime = 0; // loop
        }

        const frame = interpolateFrame(currentTime);
        if (frame) applyFrame(frame);
    }

    controls.update();
    renderer.render(scene, camera);
}

// ============================================================
// UI wiring
// ============================================================
document.getElementById('btnPlay')?.addEventListener('click', () => {
    if (!trajectory || !trajectory.frames.length) return;
    isPlaying = !isPlaying;
    lastTickTime = 0;
    document.getElementById('btnPlay').textContent = isPlaying ? '⏸' : '▶';
    document.getElementById('statusText').textContent = isPlaying ? '▶ 播放中' : '⏸ 已暂停';
});

document.getElementById('btnReset')?.addEventListener('click', () => {
    currentTime = 0;
    isPlaying = false;
    lastTickTime = 0;
    document.getElementById('btnPlay').textContent = '▶';
    document.getElementById('statusText').textContent = '⟳ 已重置';
    if (trajectory?.frames?.[0]) applyFrame(trajectory.frames[0]);
});

document.getElementById('seekSlider')?.addEventListener('input', (e) => {
    const t = parseFloat(e.target.value);
    currentTime = t;
    if (!isPlaying) {
        const frame = interpolateFrame(t);
        if (frame) applyFrame(frame);
    }
});

document.getElementById('btnSpeed')?.addEventListener('click', function() {
    const speeds = [0.5, 1, 2, 3];
    const idx = speeds.indexOf(playbackSpeed);
    playbackSpeed = speeds[(idx + 1) % speeds.length];
    this.textContent = playbackSpeed + '×';
    this.classList.add('active');
    document.getElementById('statusText').textContent = `⏩ ${playbackSpeed}×`;
});

document.getElementById('btnCam')?.addEventListener('click', function() {
    cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
    const mode = CAMERA_MODES[cameraMode];
    this.title = mode.label;
    // Smooth camera transition would be nice, but instant is fine
    camera.position.set(mode.pos[0], mode.pos[1], mode.pos[2]);
    controls.target.set(mode.target[0], mode.target[1], mode.target[2]);
    document.getElementById('statusText').textContent = `🎥 视角: ${mode.label}`;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); document.getElementById('btnPlay')?.click(); }
    if (e.key === 'r' || e.key === 'R') document.getElementById('btnReset')?.click();
});

// ============================================================
// Init
// ============================================================
function setStatus(msg) {
    const el = document.getElementById('statusText');
    if (el) el.textContent = msg;
    console.log('[sim]', msg);
}

async function init() {
    try {
        setStatus('⏳ 加载车辆...');
        await initCar();

        setStatus('⏳ 加载赛道...');
        await loadTrajectory();

        if (trajectory && trajectory.frames.length > 0) {
            frames = trajectory.frames;
            totalTime = trajectory.total_time;
            // Render track
            const params = localStorage.getItem('simParams');
            if (params) {
                const p = JSON.parse(params);
                renderPathLine(p.path || []);
                renderObstaclePreviews(p.obstacles || []);
            }
            // Apply first frame
            applyFrame(frames[0]);
            const slider = document.getElementById('seekSlider');
            slider.max = totalTime;
            slider.value = 0;
            setStatus(`✅ ${frames.length} 帧 · ${totalTime.toFixed(2)}s 赛道 · 就绪`);
            // Auto-start
            isPlaying = true;
            document.getElementById('btnPlay').textContent = '⏸';
        } else {
            setStatus('❌ 无模拟数据');
        }
    } catch (err) {
        console.error('init error:', err);
        setStatus('❌ 错误: ' + (err.message || err));
        // Show error on screen
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#D83514;color:#FDF6E3;padding:20px;font-size:14px;z-index:9999;font-family:monospace;white-space:pre-wrap;';
        div.textContent = 'ERROR: ' + (err.stack || err.message || err);
        document.body.appendChild(div);
    }
}

init();

// Resize handler
window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});
