/**
 * Playback engine — fetches trajectory from /api/simulate, interpolates
 * frames at 60fps, updates 3D scene + dashboard charts.
 */
import { state } from './state.js';

/** POST /api/simulate and store trajectory. */
export async function simulate(params) {
    const resp = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!resp.ok) {
        console.error('Simulation failed:', resp.status);
        return;
    }
    state.trajectory = await resp.json();
    state.playbackTime = 0;
    console.log(`Trajectory: ${state.trajectory.frames.length} frames, dt=${state.trajectory.dt}`);
}

/** Call each requestAnimationFrame. */
export function playbackTick(now) {
    if (!state.trajectory || !state.isPlaying) {
        state.lastFrameTime = now;
        return;
    }
    const traj = state.trajectory;
    if (state.lastFrameTime === 0) state.lastFrameTime = now;
    const dt = (now - state.lastFrameTime) / 1000.0;
    state.lastFrameTime = now;
    state.playbackTime += dt * state.playbackSpeed;
    const total = traj.total_time;

    if (state.playbackTime >= total) {
        if (state.playbackLoop) {
            state.playbackTime -= total;
        } else {
            state.playbackTime = total;
            state.isPlaying = false;
            updatePlayButtonUI();
        }
    }

    // Interpolate between frames
    const frames = traj.frames;
    const ft = state.playbackTime / traj.dt;
    const idx = Math.floor(ft);
    const frac = ft - idx;

    let frame;
    if (idx >= frames.length - 1) {
        frame = frames[frames.length - 1];
    } else {
        const f0 = frames[idx], f1 = frames[idx + 1];
        frame = interpolateFrames(f0, f1, frac);
    }
    applyFrame(frame);
    updatePlaybackUI();
}

/** Linear interpolation between two frames. */
function interpolateFrames(f0, f1, t) {
    const lerp = (a, b) => a + (b - a) * t;
    return {
        time: f0.time + (f1.time - f0.time) * t,
        body: {
            x: lerp(f0.body.x, f1.body.x),
            y: lerp(f0.body.y, f1.body.y),
            z: lerp(f0.body.z, f1.body.z),
            roll: lerp(f0.body.roll, f1.body.roll),
            pitch: lerp(f0.body.pitch, f1.body.pitch),
            yaw: lerp(f0.body.yaw, f1.body.yaw),
        },
        wheels: f1.wheels,
        angles: f1.angles,
        hardpoints: f1.hardpoints,
    };
}

/** Apply a frame's data to the scene and dashboard. */
function applyFrame(frame) {
    // Update dashboard if loaded
    if (typeof window.updateDashboard === 'function') {
        window.updateDashboard(frame);
    }
    // 3D scene update — wired in Task 9
    if (typeof window.applyFrameToScene === 'function') {
        window.applyFrameToScene(frame);
    }
}

/** Update slider and time label. */
function updatePlaybackUI() {
    const slider = document.getElementById('playbackSeek');
    const label = document.getElementById('playbackTime');
    if (slider && state.trajectory) {
        slider.value = state.playbackTime;
        slider.max = state.trajectory.total_time;
    }
    if (label && state.trajectory) {
        label.textContent =
            `${state.playbackTime.toFixed(2)}s / ${state.trajectory.total_time.toFixed(2)}s`;
    }
}

function updatePlayButtonUI() {
    const btn = document.getElementById('playPauseBtn');
    if (btn) btn.textContent = state.isPlaying ? '⏸' : '▶';
}

/** Play/pause toggle. */
export function togglePlay() {
    state.isPlaying = !state.isPlaying;
    state.lastFrameTime = 0;
    updatePlayButtonUI();
}

/** Seek to time in seconds. */
export function seekTo(time) {
    state.playbackTime = Math.max(0, Math.min(time, state.trajectory?.total_time || 0));
    state.lastFrameTime = 0;
    updatePlaybackUI();
}

/** Set playback speed multiplier. */
export function setSpeed(s) {
    state.playbackSpeed = s;
}
