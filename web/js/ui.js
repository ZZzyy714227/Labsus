import { state } from './state.js';
import { THREE, chassisTransform, resolveFramePoint, renderColorPalette } from './scene.js';
import { buildSidePoints, buildFrame, buildBodyworkFaces, buildRearWing, buildFrontWing, buildUndertray, buildDiffuser, buildDamperCylinders, updateRockerKinematics } from './builders.js';
import { requestSolve, solveAndUpdate, mirrorHardpoints, readHardpointsFromTables, readFrameNodesFromTable, readDamperMountsFromTable, loadDefaults } from './solver.js';
import { loadKinCurves } from './chart.js';

// ============================================================
// HARD POINT TABLE
// ============================================================

export function buildHardpointTable(hp, tbodyId, order) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    for (const key of order) {
        if (!hp[key]) continue;
        const tr = document.createElement('tr');
        const lt = document.createElement('td');
        lt.textContent = key;
        tr.appendChild(lt);
        for (const axis of [0, 1, 2]) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = '0.5';
            inp.value = hp[key][axis];
            inp.dataset.key = key;
            inp.dataset.axis = axis;
            inp.dataset.table = tbodyId;
            inp.addEventListener('change', () => readHardpointsFromTables());
            td.appendChild(inp);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

export function buildFrameNodeTable() {
    const tbody = document.getElementById('frameNodeTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (const key of state.FRAME_NODE_ORDER) {
        if (!state.frameNodes[key]) continue;
        const tr = document.createElement('tr');
        const lt = document.createElement('td');
        lt.textContent = key;
        tr.appendChild(lt);
        for (const axis of [0, 1, 2]) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = '0.5';
            inp.value = state.frameNodes[key][axis];
            inp.dataset.key = key;
            inp.dataset.axis = axis;
            td.appendChild(inp);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    document.getElementById('frameTubeCount').textContent = state.frameTubes.length;
}

export function buildDamperMountTable() {
    const tbody = document.getElementById('damperMountTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (const key of state.DAMPER_MOUNT_ORDER) {
        if (!state.frameNodes[key]) continue;
        const tr = document.createElement('tr');
        const lt = document.createElement('td');
        lt.textContent = key;
        tr.appendChild(lt);
        for (const axis of [0, 1, 2]) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = '0.5';
            inp.value = state.frameNodes[key][axis];
            inp.dataset.key = key;
            inp.dataset.axis = axis;
            inp.dataset.table = 'damperMount';
            td.appendChild(inp);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

// ============================================================
// ANGLE DISPLAY
// ============================================================

export function updateAngleDisplay() {
    const sv = (id, aFR, aFL, aRR, aRL, s = '') => {
        document.getElementById(id + 'FR').textContent = aFR != null ? aFR + s : '--';
        document.getElementById(id + 'FL').textContent = aFL != null ? aFL + s : '--';
        document.getElementById(id + 'RR').textContent = aRR != null ? aRR + s : '--';
        document.getElementById(id + 'RL').textContent = aRL != null ? aRL + s : '--';
    };
    const a = (o, k) => o != null ? o[k] : null;
    sv('camber', a(state.anglesFrontRight, 'camber_deg'), a(state.anglesFrontLeft, 'camber_deg'), a(state.anglesRearRight, 'camber_deg'), a(state.anglesRearLeft, 'camber_deg'), '°');
    sv('toe', a(state.anglesFrontRight, 'toe_deg'), a(state.anglesFrontLeft, 'toe_deg'), a(state.anglesRearRight, 'toe_deg'), a(state.anglesRearLeft, 'toe_deg'), '°');
    sv('caster', a(state.anglesFrontRight, 'caster_deg'), a(state.anglesFrontLeft, 'caster_deg'), a(state.anglesRearRight, 'caster_deg'), a(state.anglesRearLeft, 'caster_deg'), '°');
    sv('kpi', a(state.anglesFrontRight, 'kpi_deg'), a(state.anglesFrontLeft, 'kpi_deg'), a(state.anglesRearRight, 'kpi_deg'), a(state.anglesRearLeft, 'kpi_deg'), '°');
    sv('scrub', a(state.anglesFrontRight, 'scrub_radius_mm'), a(state.anglesFrontLeft, 'scrub_radius_mm'), a(state.anglesRearRight, 'scrub_radius_mm'), a(state.anglesRearLeft, 'scrub_radius_mm'), 'mm');
    sv('trail', a(state.anglesFrontRight, 'caster_trail_mm'), a(state.anglesFrontLeft, 'caster_trail_mm'), a(state.anglesRearRight, 'caster_trail_mm'), a(state.anglesRearLeft, 'caster_trail_mm'), 'mm');
}

export function updateDerivedInfo() {
    const div = document.getElementById('derivedInfo');
    const pFR = state.currentResultFrontRight.push_rod_length?.toFixed(1) || '--',
        pFL = state.currentResultFrontLeft.push_rod_length?.toFixed(1) || '--';
    const pRR = state.currentResultRearRight.push_rod_length?.toFixed(1) || '--',
        pRL = state.currentResultRearLeft.push_rod_length?.toFixed(1) || '--';
    function dl(rk, ck) {
        const a = state.rockerCache[rk], b = state.frameNodes[ck];
        if (!a || !b) return '--';
        return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2).toFixed(1);
    }
    const dFR = dl('RK_DAMPER_R', 'DAMPER_CHASSIS_FR'), dFL = dl('RK_DAMPER_L', 'DAMPER_CHASSIS_FL'),
        dRR = dl('R_RK_DAMPER_R', 'R_DAMPER_CHASSIS_RR'), dRL = dl('R_RK_DAMPER_L', 'R_DAMPER_CHASSIS_RL');
    const dfe = document.getElementById('damperLenFR'), dre = document.getElementById('damperLenRR');
    if (dfe) dfe.textContent = dFR + ' / ' + dFL;
    if (dre) dre.textContent = dRR + ' / ' + dRL;
    const cpFR = state.contactPatches.frontRight, cpRR = state.contactPatches.rearRight;
    const loadRF = cpFR?.loaded_radius?.toFixed(1) || '--', deflF = cpFR?.deflection?.toFixed(1) || '--';
    const loadRR = cpRR?.loaded_radius?.toFixed(1) || '--', deflR = cpRR?.deflection?.toFixed(1) || '--';
    div.innerHTML = '<div class="info-row"><span class="label">前推/拉杆 R/L</span><span class="val">' + pFR + ' / ' + pFL + ' mm</span></div>' +
        '<div class="info-row"><span class="label">后推/拉杆 R/L</span><span class="val">' + pRR + ' / ' + pRL + ' mm</span></div>' +
        '<div class="info-row"><span class="label">前减震器长度 R/L</span><span class="val">' + dFR + ' / ' + dFL + ' mm</span></div>' +
        '<div class="info-row"><span class="label">后减震器长度 R/L</span><span class="val">' + dRR + ' / ' + dRL + ' mm</span></div>' +
        '<div class="info-row"><span class="label">轮胎加载半径 前/后</span><span class="val">' + loadRF + ' / ' + loadRR + ' mm</span></div>' +
        '<div class="info-row"><span class="label">轮胎压缩量 前/后</span><span class="val">' + deflF + ' / ' + deflR + ' mm</span></div>';
}

// ============================================================
// REBUILD SCENE
// ============================================================

export function rebuildScene() {
    try {
        for (const k of Object.keys(state.rockerCache)) delete state.rockerCache[k];
        buildSidePoints(state.hardpointsFrontRight, 'frontRight', state.FRONT_COLORS);
        buildSidePoints(state.hardpointsFrontLeft, 'frontLeft', state.FRONT_COLORS);
        buildSidePoints(state.hardpointsRearRight, 'rearRight', state.REAR_COLORS, 'R_');
        buildSidePoints(state.hardpointsRearLeft, 'rearLeft', state.REAR_COLORS, 'R_');
        buildFrame();
        buildBodyworkFaces();
        buildRearWing();
        buildFrontWing();
        try { buildUndertray(); } catch (e) { console.error('buildUndertray failed:', e); }
        try { buildDiffuser(); } catch (e) { console.error('buildDiffuser failed:', e); }
        buildDamperCylinders();
        renderFacesPanel();
        renderRearWingPanel();
        renderFrontWingPanel();
        renderUndertrayPanel();
        renderDiffuserPanel();
    } catch (e) { console.error('rebuildScene failed:', e); }
}

// ============================================================
// FACES PANEL
// ============================================================

export function renderFacesPanel() {
    const container = document.getElementById('faceListBody');
    if (!container) return;
    const entries = Object.entries(state.bodyworkFaces);
    if (entries.length === 0) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">无覆盖面</div>';
        return;
    }
    container.innerHTML = entries.map(([name, def]) => {
        const color = def.color || '#94a3b8';
        const opacity = def.opacity ?? 0.30;
        const isSelected = name === state.selectedFaceName;
        return '<div class="face-row flex items-center justify-between px-2 py-1.5 hover:bg-white/5 cursor-pointer transition-colors ' +
            (isSelected ? 'bg-white/10' : '') + '" data-face-name="' + name + '">' +
            '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-3 h-3 rounded-sm inline-block shrink-0" style="background:' + color + '; opacity:' + opacity + '"></span>' +
            '<span class="text-[#e4e4ec] text-[0.65rem] truncate">' + name + '</span></div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
            '<span class="text-dim text-[0.55rem]">' + opacity.toFixed(2) + '</span>' +
            '<button class="face-delete-btn text-rose-400/70 hover:text-rose-300 transition-colors p-0.5" data-face-name="' + name + '" title="删除">' +
            '<i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div>';
    }).join('');
    container.querySelectorAll('.face-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.face-delete-btn')) return;
            selectFaceFromPanel(row.dataset.faceName);
        });
    });
    container.querySelectorAll('.face-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation();
            deleteFaceFromPanel(btn.dataset.faceName); });
    });
    if (window.lucide) lucide.createIcons();
}

function selectFaceFromPanel(name) {
    const mesh = state.sceneObjects.bodyworkFaces.find(m => m.userData?.faceName === name);
    if (mesh) {
        if (state.selectedFace) { state.selectedFace.material.opacity = state.selectedFace.userData?.baseOpacity || 0.3; }
        state.selectedFace = mesh;
        state.selectedFaceName = name;
        state.selectedFaceDef = state.bodyworkFaces[name] || null;
        mesh.material.opacity = Math.min(0.8, (mesh.userData.baseOpacity || 0.3) + 0.2);
        const { showEditPanel } = await_import_interactions();
        showEditPanel();
        renderFacesPanel();
    }
}

// Dynamic import helper to break circular dependency
let _interactions = null;
async function await_import_interactions() {
    if (!_interactions) _interactions = await import('./interactions.js');
    return _interactions;
}

async function deleteFaceFromPanel(name) {
    if (!confirm('确定删除覆盖面 "' + name + '"？')) return;
    const st = document.getElementById('saveStatus');
    delete state.bodyworkFaces[name];
    if (state.selectedFaceName === name) { state.selectedFace = null;
        state.selectedFaceName = '';
        state.selectedFaceDef = null; }
    rebuildScene();
    renderFacesPanel();
    try {
        const r = await fetch('/api/delete_face', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, permanent: true }) });
        const d = await r.json();
        st.textContent = d.ok ? '✓ 覆盖面 "' + name + '" 已删除' : '✗ 删除失败';
    } catch (e) { st.textContent = '✗ 网络错误'; }
}

// ============================================================
// REAR WING PANEL
// ============================================================

export function renderRearWingPanel() {
    const container = document.getElementById('rearWingListBody');
    if (!container) return;
    if (!state.rearWingConfig || !state.rearWingConfig.enabled) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">尾翼未配置</div>';
        return;
    }
    const cfg = state.rearWingConfig;
    const els = cfg.elements || [];
    const ref = cfg.reference_point || [0, 0, 0];
    let html = '';

    html += '<div class="grid grid-cols-3 gap-1 mb-2">';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">参考X</span><input class="rw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-rw="ref_x" type="number" value="' + ref[0].toFixed(0) + '" step="5"></label>';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">参考Z</span><input class="rw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-rw="ref_z" type="number" value="' + ref[2].toFixed(0) + '" step="5"></label>';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">展长</span><input class="rw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-rw="span" type="number" value="' + (cfg.span || 660).toFixed(0) + '" step="5"></label>';
    html += '</div>';

    for (let i = 0; i < els.length; i++) {
        const el = els[i];
        html += '<div class="mb-1.5 border border-white/5 rounded p-1.5">';
        html += '<div class="text-[0.6rem] text-accent font-medium mb-1">' + el.name + '</div>';
        html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1">';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">弦长</span><input class="rw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-rw-el="' + i + '" data-rw-key="chord" type="number" value="' + el.chord + '" step="5"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">攻角°</span><input class="rw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-rw-el="' + i + '" data-rw-key="angle" type="number" value="' + el.angle + '" step="0.5"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">拱度%</span><input class="rw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-rw-el="' + i + '" data-rw-key="camber_pct" type="number" value="' + el.camber_pct + '" step="1"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">厚度%</span><input class="rw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-rw-el="' + i + '" data-rw-key="thickness_pct" type="number" value="' + el.thickness_pct + '" step="1"></label>';
        html += '</div></div>';
    }

    const ep = cfg.endplate || {};
    html += '<div class="mb-1.5 border border-white/5 rounded p-1.5">';
    html += '<div class="text-[0.58rem] text-dim font-medium mb-1">端板</div>';
    html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1">';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">前悬伸</span><input class="rw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="overhang_forward" type="number" value="' + (ep.overhang_forward ?? 0.12) + '" step="0.02"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">后悬伸</span><input class="rw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="overhang_rear" type="number" value="' + (ep.overhang_rear ?? 0.06) + '" step="0.02"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">上高度</span><input class="rw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="height_above" type="number" value="' + (ep.height_above ?? 80) + '" step="5"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">下高度</span><input class="rw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="height_below" type="number" value="' + (ep.height_below ?? 140) + '" step="5"></label>';
    html += '</div></div>';

    html += '<div class="flex gap-1.5 mt-2">';
    html += '<button id="applyRwBtn" class="flex-1 bg-accent2 hover:bg-accent2/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">应用</button>';
    html += '<button id="saveRwPermBtn" class="flex-1 bg-accent hover:bg-accent/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">永久保存</button>';
    html += '</div>';

    container.innerHTML = html;

    setTimeout(() => {
        const applyBtn = document.getElementById('applyRwBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyRearWingChanges);
        const saveBtn = document.getElementById('saveRwPermBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveRearWingPermanent);
    }, 0);
}

function applyRearWingChanges() {
    if (!state.rearWingConfig) return;
    const cfg = state.rearWingConfig;
    const refX = document.querySelector('[data-rw="ref_x"]');
    const refZ = document.querySelector('[data-rw="ref_z"]');
    const span = document.querySelector('[data-rw="span"]');
    if (refX) cfg.reference_point[0] = parseFloat(refX.value) || cfg.reference_point[0];
    if (refZ) cfg.reference_point[2] = parseFloat(refZ.value) || cfg.reference_point[2];
    if (span) cfg.span = parseFloat(span.value) || cfg.span;

    document.querySelectorAll('.rw-el-input').forEach(inp => {
        const idx = parseInt(inp.dataset.rwEl);
        const key = inp.dataset.rwKey;
        const val = parseFloat(inp.value);
        if (!isNaN(val) && cfg.elements[idx]) { cfg.elements[idx][key] = val; }
    });
    document.querySelectorAll('.rw-ep-input').forEach(inp => {
        const key = inp.dataset.rwKey;
        const val = parseFloat(inp.value);
        if (!isNaN(val) && cfg.endplate) { cfg.endplate[key] = val; }
    });

    buildRearWing();
    const st = document.getElementById('saveStatus');
    if (st) { st.textContent = '✓ 尾翼已更新'; setTimeout(() => { if (st.textContent === '✓ 尾翼已更新') st.textContent = ''; }, 1500); }
}

async function saveRearWingPermanent() {
    applyRearWingChanges();
    const st = document.getElementById('saveStatus');
    try {
        const r = await fetch('/api/save_rear_wing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.rearWingConfig) });
        const d = await r.json();
        if (st) st.textContent = d.ok ? '✓ 尾翼已永久保存到 config.py' : '✗ 保存失败: ' + (d.detail || '');
    } catch (e) { if (st) st.textContent = '✗ 网络错误'; }
}

// ============================================================
// FRONT WING PANEL
// ============================================================

export function renderFrontWingPanel() {
    const container = document.getElementById('frontWingListBody');
    if (!container) return;
    if (!state.frontWingConfig || !state.frontWingConfig.enabled) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">前翼未配置</div>';
        return;
    }
    const cfg = state.frontWingConfig;
    const els = cfg.elements || [];
    const ref = cfg.reference_point || [0, 0, 0];
    let html = '';

    html += '<div class="grid grid-cols-3 gap-1 mb-2">';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">参考X</span><input class="fw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-fw="ref_x" type="number" value="' + ref[0].toFixed(0) + '" step="5"></label>';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">参考Z</span><input class="fw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-fw="ref_z" type="number" value="' + ref[2].toFixed(0) + '" step="5"></label>';
    html += '<label class="flex flex-col gap-0.5"><span class="text-[0.55rem] text-dim">展长</span><input class="fw-input bg-input border border-white/5 rounded px-1.5 py-0.5 text-[0.62rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50" data-fw="span" type="number" value="' + (cfg.span || 1100).toFixed(0) + '" step="10"></label>';
    html += '</div>';

    for (let i = 0; i < els.length; i++) {
        const el = els[i];
        html += '<div class="mb-1.5 border border-white/5 rounded p-1.5">';
        html += '<div class="text-[0.6rem] text-accent font-medium mb-1">' + el.name + '</div>';
        html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1">';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">弦长</span><input class="fw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-fw-el="' + i + '" data-fw-key="chord" type="number" value="' + el.chord + '" step="5"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">攻角°</span><input class="fw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-fw-el="' + i + '" data-fw-key="angle" type="number" value="' + el.angle + '" step="0.5"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">拱度%</span><input class="fw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-fw-el="' + i + '" data-fw-key="camber_pct" type="number" value="' + el.camber_pct + '" step="1"></label>';
        html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.52rem] text-dim">厚度%</span><input class="fw-el-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-16 text-right" data-fw-el="' + i + '" data-fw-key="thickness_pct" type="number" value="' + el.thickness_pct + '" step="1"></label>';
        html += '</div></div>';
    }

    const ep = cfg.endplate || {};
    html += '<div class="mb-1.5 border border-white/5 rounded p-1.5">';
    html += '<div class="text-[0.58rem] text-dim font-medium mb-1">端板</div>';
    html += '<div class="grid grid-cols-2 gap-x-1.5 gap-y-1">';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">前悬伸</span><input class="fw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="overhang_forward" type="number" value="' + (ep.overhang_forward ?? 0.10) + '" step="0.02"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">后悬伸</span><input class="fw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="overhang_rear" type="number" value="' + (ep.overhang_rear ?? 0.18) + '" step="0.02"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">上高度</span><input class="fw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="height_above" type="number" value="' + (ep.height_above ?? 35) + '" step="5"></label>';
    html += '<label class="flex items-center justify-between gap-1"><span class="text-[0.5rem] text-muted">下高度</span><input class="fw-ep-input bg-input border border-white/5 rounded px-1 py-0.5 text-[0.6rem] text-[#e4e4ec] font-mono outline-none focus:border-accent/50 w-14 text-right" data-rw-key="height_below" type="number" value="' + (ep.height_below ?? 35) + '" step="5"></label>';
    html += '</div></div>';

    html += '<div class="flex gap-1.5 mt-2">';
    html += '<button id="applyFwBtn" class="flex-1 bg-accent2 hover:bg-accent2/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">应用</button>';
    html += '<button id="saveFwPermBtn" class="flex-1 bg-accent hover:bg-accent/85 text-white text-[0.62rem] font-medium py-1 rounded-md transition-colors">永久保存</button>';
    html += '</div>';

    container.innerHTML = html;

    setTimeout(() => {
        const applyBtn = document.getElementById('applyFwBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyFrontWingChanges);
        const saveBtn = document.getElementById('saveFwPermBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveFrontWingPermanent);
    }, 0);
}

function applyFrontWingChanges() {
    if (!state.frontWingConfig) return;
    const cfg = state.frontWingConfig;
    const refX = document.querySelector('[data-fw="ref_x"]');
    const refZ = document.querySelector('[data-fw="ref_z"]');
    const span = document.querySelector('[data-fw="span"]');
    if (refX) cfg.reference_point[0] = parseFloat(refX.value) || cfg.reference_point[0];
    if (refZ) cfg.reference_point[2] = parseFloat(refZ.value) || cfg.reference_point[2];
    if (span) cfg.span = parseFloat(span.value) || cfg.span;

    document.querySelectorAll('.fw-el-input').forEach(inp => {
        const idx = parseInt(inp.dataset.fwEl);
        const key = inp.dataset.fwKey;
        const val = parseFloat(inp.value);
        if (!isNaN(val) && cfg.elements[idx]) { cfg.elements[idx][key] = val; }
    });
    document.querySelectorAll('.fw-ep-input').forEach(inp => {
        const key = inp.dataset.fwKey;
        const val = parseFloat(inp.value);
        if (!isNaN(val) && cfg.endplate) { cfg.endplate[key] = val; }
    });

    buildFrontWing();
    const st = document.getElementById('saveStatus');
    if (st) { st.textContent = '✓ 前翼已更新'; setTimeout(() => { if (st.textContent === '✓ 前翼已更新') st.textContent = ''; }, 1500); }
}

async function saveFrontWingPermanent() {
    applyFrontWingChanges();
    const st = document.getElementById('saveStatus');
    try {
        const r = await fetch('/api/save_front_wing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.frontWingConfig) });
        const d = await r.json();
        if (st) st.textContent = d.ok ? '✓ 前翼已永久保存到 config.py' : '✗ 保存失败: ' + (d.detail || '');
    } catch (e) { if (st) st.textContent = '✗ 网络错误'; }
}

// ============================================================
// UNDERTRAY PANEL
// ============================================================

export function renderUndertrayPanel() {
    const container = document.getElementById('undertrayListBody');
    if (!container) return;
    if (!state.undertrayConfig || !state.undertrayConfig.enabled) {
        container.innerHTML = '<div class="text-[0.6rem] text-dim p-2">底板未配置</div>';
        return;
    }
    const cfg = state.undertrayConfig;
    let html = '';

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

// ============================================================
// DIFFUSER PANEL
// ============================================================

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

// ============================================================
// CHASSIS MODE
// ============================================================

export function chassisPoseToTravel() {
    const h = state.chassisPose.heave, p = state.chassisPose.pitch * Math.PI / 180, r = state.chassisPose.roll * Math.PI / 180;
    const pitchFR = state.CHASSIS_WHEELBASE_HALF * Math.sin(p);
    const rollF = state.CHASSIS_TRACK_FRONT * Math.sin(r) / 2;
    const rollR = state.CHASSIS_TRACK_REAR * Math.sin(r) / 2;
    return {
        front_right: -h - pitchFR + rollF,
        front_left: -h - pitchFR - rollF,
        rear_right: -h + pitchFR + rollR,
        rear_left: -h + pitchFR - rollR,
    };
}

export function updateChassisDisplay() {
    document.getElementById('heaveVal').textContent = state.chassisPose.heave.toFixed(1) + ' mm';
    document.getElementById('pitchVal').textContent = state.chassisPose.pitch.toFixed(1) + '°';
    document.getElementById('rollVal').textContent = state.chassisPose.roll.toFixed(1) + '°';
    const t = chassisPoseToTravel();
    document.getElementById('chassisFrontTravel').textContent = t.front_right.toFixed(1);
    document.getElementById('chassisRearTravel').textContent = t.rear_right.toFixed(1);
    document.getElementById('chassisFLTravel').textContent = t.front_left.toFixed(1);
    document.getElementById('chassisFRTravel').textContent = t.front_right.toFixed(1);
}

export function updateChassisMode() {
    updateChassisDisplay();
    requestSolve();
    buildBodyworkFaces();
    buildRearWing();
    buildFrontWing();
}

export function onChassisSliderInput() {
    state.chassisPose.heave = parseFloat(document.getElementById('heaveSlider').value);
    state.chassisPose.pitch = parseFloat(document.getElementById('pitchSlider').value);
    state.chassisPose.roll = parseFloat(document.getElementById('rollSlider').value);
    updateChassisMode();
}

// ============================================================
// DESIGN PARAMETERS
// ============================================================

export function renderParamSliders() {
    const axle = document.getElementById('paramAxle').value, params = state.designParams[axle] || {},
        container = document.getElementById('paramSliders');
    if (!container) return;
    container.innerHTML = '';
    for (const [key, val] of Object.entries(params)) {
        const meta = state.PARAM_META[key];
        if (!meta) continue;
        const div = document.createElement('div');
        div.innerHTML = '<div class="flex justify-between text-[0.6rem]"><span class="text-muted">' + meta.label + '</span><span class="text-accent font-mono font-medium">' + Number(val).toFixed(1) + ' ' + meta.unit + '</span></div><input type="range" min="' + meta.min + '" max="' + meta.max + '" step="' + meta.step + '" value="' + val + '" data-key="' + key + '">';
        container.appendChild(div);
    }
}

export async function applyParams() {
    const axle = document.getElementById('paramAxle').value,
        sliders = document.getElementById('paramSliders').querySelectorAll('input[type=range]'),
        st = document.getElementById('saveStatus');
    for (const s of sliders) {
        const k = s.dataset.key, v = parseFloat(s.value);
        if (state.designParams[axle]) state.designParams[axle][k] = v;
    }
    try {
        for (const s of sliders) await fetch('/api/update_params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ axle, key: s.dataset.key, value: parseFloat(s.value) }) });
        const r = await fetch('/api/defaults');
        const d = await r.json();
        state.hardpointsFrontRight = d.front.right;
        state.hardpointsFrontLeft = d.front.left;
        state.hardpointsRearRight = d.rear.right;
        state.hardpointsRearLeft = d.rear.left;
        state.designParams = d.params || {};
        rebuildScene();
        try { await solveAndUpdate(); } catch (e) { }
        applyToUI();
        await loadKinCurves();
        st.textContent = '✓ 参数已应用，硬点重新计算';
    } catch (e) { console.error(e); st.textContent = '✗ 参数更新失败'; }
}

// ============================================================
// APPLY TO UI
// ============================================================

export function applyToUI() {
    buildHardpointTable(state.hardpointsFrontRight, 'hpTableBody', state.HP_ORDER);
    buildHardpointTable(state.hardpointsRearRight, 'rearHpTableBody', state.REAR_HP_ORDER);
    buildFrameNodeTable();
    buildDamperMountTable();
    updateAngleDisplay();
    updateDerivedInfo();
}

