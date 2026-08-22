// theme.js — 统一配色数据源（Single Source of Truth）
// 同时驱动：
//   1) UI 主题  → CSS 变量写进 :root（style.css 里的 :root 只是兜底默认值）
//   2) 3D 材质  → 更新 car3d/materials.js 里共享的 MAT 材质颜色
//   3) 语义色   → good / warn / bad 供 main/history/dashboard 读取
// 持久化到 localStorage，快速改色后可导出/重置。
import { MAT } from './car3d/materials.js';

const STORE_KEY = 'fsae_theme_v1';

// ---- 默认配色（与 style.css 的 :root 兜底一致）----
const DEFAULTS = {
  ui: {
    black: '#0B0D0E',
    white: '#FFFFFF',
    teal: '#0AFFCE',        // 主品牌色 → 派生 tealBright
    purple: '#540AFF',      // 次强调色 → 派生 purpleBright
    silver: '#C5C9CE',      // 中性面 → 派生 silverLight，silverDark 独立
    silverDark: '#8A9099',
    bg: '#F4F5F7',          // 页面底色
    paper: '#E8EAED',       // 面板底 + 3D 场景背景
    ink: '#0B0D0E',         // 主文字
    muted: '#5F6A76',
  },
  semantic:             // 工程状态色（pass / warn / fail）
    {
      good: '#00E676',
      warn: '#FFD600',
      bad: '#FF1744',
    },
  mat:                  // 3D 车身材料（与 materials.js 的 MAT 键一一对应）
    {
      steel: '#8FA3BF',
      steelDark: '#4B5563',
      aluminum: '#C9CDD2',
      carbon: '#1C1F24',
      rubber: '#141414',
      rim: '#2B2F36',
      brakeDisc: '#9AA0A8',
      caliper: '#D83514',
      glass: '#223344',
      accent: '#D83514',  // 摇臂/弹簧高亮色
      upholstery: '#2A2A30',
    },
};

// ---- 颜色工具 ----
function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
}
/** 朝 target('#ffffff'/'#000000') 混合 amt(0..1) */
function mix(hex, target, amt) {
  const a = hexToRgb(hex), t = hexToRgb(target);
  const v = (s, d) => Math.round((d - s) * amt + s);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return '#' + toHex(v(a.r, t.r)) + toHex(v(a.g, t.g)) + toHex(v(a.b, t.b));
}
const lighten = (h, a) => mix(h, '#ffffff', a);
const darken = (h, a) => mix(h, '#000000', a);

// 派生态（不手动改，由基础色自动生成，保证整套和谐）
function derived(ui) {
  return {
    tealBright: lighten(ui.teal, 0.35),
    purpleBright: lighten(ui.purple, 0.35),
    silverLight: lighten(ui.silver, 0.45),
  };
}

// ---- 持久化 ----
let cache = null;
export function loadTheme() {
  if (cache) return cache;
  cache = { ui: { ...DEFAULTS.ui }, semantic: { ...DEFAULTS.semantic }, mat: { ...DEFAULTS.mat } };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(cache.ui, saved.ui || {});
      Object.assign(cache.semantic, saved.semantic || {});
      Object.assign(cache.mat, saved.mat || {});
    }
  } catch { /* 忽略损坏数据，用默认 */ }
  return cache;
}
export function saveTheme() {
  if (cache) localStorage.setItem(STORE_KEY, JSON.stringify(cache));
}
export function resetTheme() { cache = null; localStorage.removeItem(STORE_KEY); return loadTheme(); }

export function get(key) {
  const t = loadTheme();
  if (t.semantic[key]) return t.semantic[key];
  if (t.ui[key]) return t.ui[key];
  if (t.mat[key]) return t.mat[key];
  return undefined;
}

// ---- 应用 ----
/** 把 UI + 语义色写进 :root 的 CSS 变量 */
export function applyUI(root = document.documentElement) {
  const t = loadTheme(), d = derived(t.ui);
  const set = (k, v) => root.style.setProperty(k, v);
  set('--black', t.ui.black); set('--white', t.ui.white);
  set('--teal', t.ui.teal); set('--teal-bright', d.tealBright);
  set('--purple', t.ui.purple); set('--purple-bright', d.purpleBright);
  set('--silver-light', d.silverLight); set('--silver', t.ui.silver); set('--silver-dark', t.ui.silverDark);
  set('--bg', t.ui.bg); set('--paper', t.ui.paper);
  set('--ink', t.ui.ink); set('--muted', t.ui.muted);
  set('--good', t.semantic.good); set('--warn', t.semantic.warn); set('--bad', t.semantic.bad);
}

/** 更新 3D 共享材质颜色（共享材质引用，改色即时作用于所有网格） */
export function apply3D() {
  const t = loadTheme();
  for (const k in t.mat) {
    if (MAT[k]) MAT[k].color.set(t.mat[k]);
  }
}

/** 场景背景色（绑定 UI.paper，面板底与 3D 背景联动改色） */
export function sceneBackgroundHex() {
  return loadTheme().ui.paper;
}

// ---- 面板规范（供 main.js 构建配色编辑器）----
export const PANEL_SECTIONS = [
  {
    title: 'UI 界面',
    keys: [
      ['black', '炭黑'], ['white', '纯白'],
      ['teal', '主色 Teal'], ['purple', '强调 Purple'],
      ['silver', '中性 Silver'], ['silverDark', '中性深 Silver'],
      ['bg', '页面底色'], ['paper', '面板/场景背景'],
      ['ink', '主文字'], ['muted', '次要文字'],
    ],
  },
  {
    title: '状态语义色',
    keys: [['good', '通过 Good'], ['warn', '警告 Warn'], ['bad', '失败 Bad']],
  },
  {
    title: '3D 车身材料',
    keys: [
      ['steel', '悬架钢'], ['steelDark', '钢材深'], ['aluminum', '铝件'],
      ['carbon', '碳纤维'], ['rubber', '轮胎'], ['rim', '轮辋'],
      ['brakeDisc', '刹车盘'], ['caliper', '卡钳'], ['glass', '玻璃'],
      ['accent', '摇臂/弹簧'], ['upholstery', '内饰'],
    ],
  },
];