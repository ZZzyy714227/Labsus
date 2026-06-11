/**
 * Real-time dashboard charts during playback.
 * Chart 1: body attitude (roll°, pitch°, heave mm)
 * Chart 2: suspension angles (camber°, toe°)
 */
import { state } from './state.js';

let attitudeChart = null;
let angleChart = null;
const MAX_POINTS = 300;

/** Create Chart.js instances. Called after DOM has chart canvases. */
export function initDashboard() {
    const ctx1 = document.getElementById('attitudeChart')?.getContext('2d');
    const ctx2 = document.getElementById('angleChart')?.getContext('2d');
    if (!ctx1 || !ctx2) return;

    // Destroy existing charts if re-initializing
    if (attitudeChart) attitudeChart.destroy();
    if (angleChart) angleChart.destroy();

    const darkOpts = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            x: { ticks: { color: '#A88B6F', font: { size: 9 } },
                 grid: { color: '#3A2A20' } },
            y: { ticks: { color: '#A88B6F', font: { size: 9 } },
                 grid: { color: '#3A2A20' } },
        },
        plugins: { legend: { labels: { color: '#8B7355', font: { size: 9 },
                                       boxWidth: 10, padding: 4 } } },
    };

    attitudeChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Roll°', data: [], borderColor: '#FC7607',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
                { label: 'Pitch°', data: [], borderColor: '#D83514',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
                { label: 'Heave mm', data: [], borderColor: '#EFCE7D',
                  borderWidth: 1, pointRadius: 0, tension: 0.1, yAxisID: 'y1' },
            ],
        },
        options: {
            ...darkOpts,
            scales: {
                ...darkOpts.scales,
                y1: { position: 'right', ticks: { color: '#EFCE7D', font: { size: 9 } },
                      grid: { display: false } },
            },
        },
    });

    angleChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Camber FL', data: [], borderColor: '#FC7607',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
                { label: 'Camber FR', data: [], borderColor: '#D83514',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
                { label: 'Toe FL', data: [], borderColor: '#EFCE7D',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
                { label: 'Toe FR', data: [], borderColor: '#10b981',
                  borderWidth: 1, pointRadius: 0, tension: 0.1 },
            ],
        },
        options: darkOpts,
    });
}

/** Append a frame to both charts. */
export function updateDashboard(frame) {
    if (!attitudeChart || !angleChart) return;
    const t = frame.time.toFixed(2);

    // Attitude
    const ac = attitudeChart;
    ac.data.labels.push(t);
    ac.data.datasets[0].data.push(frame.body.roll * 180 / Math.PI);
    ac.data.datasets[1].data.push(frame.body.pitch * 180 / Math.PI);
    ac.data.datasets[2].data.push(frame.body.z);
    if (ac.data.labels.length > MAX_POINTS) {
        ac.data.labels.shift();
        ac.data.datasets.forEach(d => d.data.shift());
    }
    ac.update('none');

    // Angles
    const gc = angleChart;
    gc.data.labels.push(t);
    gc.data.datasets[0].data.push(frame.angles?.camber?.[0] || 0);
    gc.data.datasets[1].data.push(frame.angles?.camber?.[1] || 0);
    gc.data.datasets[2].data.push(frame.angles?.toe?.[0] || 0);
    gc.data.datasets[3].data.push(frame.angles?.toe?.[1] || 0);
    if (gc.data.labels.length > MAX_POINTS) {
        gc.data.labels.shift();
        gc.data.datasets.forEach(d => d.data.shift());
    }
    gc.update('none');
}

/** Clear all chart data. */
export function clearDashboard() {
    [attitudeChart, angleChart].forEach(c => {
        if (!c) return;
        c.data.labels = [];
        c.data.datasets.forEach(d => d.data = []);
        c.update('none');
    });
}

// Expose to playback.js
window.updateDashboard = updateDashboard;
