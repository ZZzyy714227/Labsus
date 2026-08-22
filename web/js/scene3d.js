// 3D scene skeleton — renderer, camera, controls, lights, ground + car wiring.
// The car itself is built by car3d/car.js; this module only hosts the scene.
// Coordinate mapping (unchanged project convention): world = (carX, carZ, -carY),
// carried as a matrix on carGroup — never baked into geometry.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupEnvironment, setupGround, setupLights } from './car3d/materials.js';
import { Car } from './car3d/car.js';
import { downloadPointSet, pointSetSummary } from './car3d/pointset.js';

let scene, camera, renderer, controls;
let car = null;

/** 主题联动：改 3D 场景背景 + 雾色（跟随 UI.paper） */
export function setSceneBackground(hex) {
  if (!scene) return;
  scene.background = new THREE.Color(hex);
  scene.fog = new THREE.Fog(hex, 6000, 16000);
}

// View presets — camera position + target in CAR-FRAME coordinates
const VIEWS = {
  default: { pos: [1300, 1700, 1100], tgt: [-775, 0, 300] },
  top:     { pos: [-775, 10, 4200],  tgt: [-775, 0, 0] },
  side:    { pos: [-775, 2600, 420], tgt: [-775, 0, 350] },
  front:   { pos: [2700, 0, 420],    tgt: [-400, 0, 350] },
  driver:  { pos: [-540, 0, 700],    tgt: [-950, 0, 350] },
};

const toWorld = (x, y, z) => new THREE.Vector3(x, z, -y);

export function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE8EAED);
  scene.fog = new THREE.Fog(0xE8EAED, 6000, 16000);

  camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
  camera.position.copy(toWorld(...VIEWS.default.pos));

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(toWorld(...VIEWS.default.tgt));
  controls.maxPolarAngle = Math.PI * 0.495;   // stay above ground
  controls.minDistance = 200;
  controls.maxDistance = 12000;

  setupEnvironment(renderer, scene);
  setupLights(scene);
  setupGround(scene);

  car = new Car();
  scene.add(car.group);

  resize(container);
  window.addEventListener('resize', () => resize(container));
  animate();
}

function resize(container) {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/** Rebuild static car parts from /api/defaults data. */
export function setCarStatic(defaults) {
  car.rebuildStatic(defaults);
}

/** Rebuild dynamic parts (suspension/steering/wheels) for a solve pose. */
export function setCarDynamic(hpFront, hpRear, solved, rack = 0) {
  car.rebuildDynamic(hpFront, hpRear, solved, rack);
}

/** Jump the camera to a preset view. */
export function setView(name) {
  const v = VIEWS[name] ?? VIEWS.default;
  camera.position.copy(toWorld(...v.pos));
  controls.target.copy(toWorld(...v.tgt));
  controls.update();
}

/** Trigger point-set download (format 'json' | 'csv'). */
export function exportPointSet(format = 'json') {
  return car ? downloadPointSet(car.group, format) : null;
}

/** Per-part point counts for the export panel. */
export function getPointSetSummary() {
  return car ? pointSetSummary(car.group) : { total: 0, items: [] };
}
