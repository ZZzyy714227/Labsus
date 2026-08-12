// 3D scene — suspension rendering + slider linkage
// Coordinate convention (FIXED): car frame X = forward, Y = right, Z = up.
// Three.js world: X right, Y up, Z toward viewer.
// Mapping: world = (carX, carZ, -carY)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
const group = new THREE.Group();

const FRONT_COLOR = 0xff9500, REAR_COLOR = 0xd83514;
const BALL_COLOR = 0x00d9ff;
const AXIS_X = { front: 0, rear: -895 };      // wheel center X in car frame

/** Car-frame [x, y, z] → Three.js world Vector3. */
function toWorld(x, y, z) {
  return new THREE.Vector3(x, z, -y);
}

export function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  // car-frame camera (500 forward, 650 right, 700 up) → world
  camera.position.copy(toWorld(500, 650, 700));
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  // car-frame target (-450 forward, 0 right, 150 up) → world
  controls.target.copy(toWorld(-450, 0, 150));

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  scene.add(new THREE.DirectionalLight(0xffffff, 1.2));

  // Ground plane at car Z=0 → world Y=0 (XZ grid), car axes labelled
  const grid = new THREE.GridHelper(4000, 40, 0x000000, 0xcccccc);
  scene.add(grid);
  addAxes();
  scene.add(group);
  resize(container);
  window.addEventListener('resize', () => resize(container));
  animate();
}

/** Car-frame axis markers: X forward (orange), Y right (gold), Z up (red). */
function addAxes() {
  const mk = (dir, color, label) => {
    const len = 400;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(...dir).normalize(),
      new THREE.Vector3(0, 0, 0), len, color, 24, 14);
    scene.add(arrow);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ color }));
    spr.scale.set(60, 60, 1);
    spr.position.set(dir[0] * (len + 60), dir[1] * (len + 60), dir[2] * (len + 60));
    scene.add(spr);
  };
  mk(toWorld(1, 0, 0).toArray(), 0xff9500, 'X 前');
  mk(toWorld(0, 1, 0).toArray(), 0xefce7d, 'Y 右');
  mk(toWorld(0, 0, 1).toArray(), 0xd83514, 'Z 上');
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

function ball(pos, color = BALL_COLOR, r = 5) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  m.position.copy(pos);
  return m;
}

function link(a, b, color) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}

/** Rebuild both axles from hardpoint dicts (solve responses, car frame). */
export function rebuildCar(hpFront, hpRear) {
  group.clear();
  buildAxle(hpFront, 'front', FRONT_COLOR);
  buildAxle(hpRear, 'rear', REAR_COLOR);
}

function buildAxle(hp, axle, color) {
  if (!hp) return;
  const axis = AXIS_X[axle];
  const P = (pt) => toWorld(pt[0] + axis, pt[1], pt[2]);
  for (const side of ['right', 'left']) {
    const p = side === 'right' ? hp : mirrorLeft(hp);   // mirror done in car frame

    for (const k of ['CH1', 'CH2', 'CH3', 'CH4', 'CH5']) {
      if (p[k]) group.add(ball(P(p[k]), 0x333333, 5));
    }
    for (const k of ['UP1', 'UP2', 'UP3', 'UP4', 'UP5']) {
      if (p[k]) group.add(ball(P(p[k]), BALL_COLOR, 4));
    }
    if (p.FL1) group.add(ball(P(p.FL1), 0xccff00, 4));

    const L = (a, b, c) => { if (p[a] && p[b]) group.add(link(P(p[a]), P(p[b]), c)); };
    L('CH1', 'UP1', color); L('CH2', 'UP1', color);
    L('CH3', 'UP2', color); L('CH4', 'UP2', color);
    L('CH5', 'UP4', color);                     // push/pull rod
    L('FL1', 'UP3', 0x00d9ff);                  // tie rod
    L('UP1', 'UP2', 0x000000);                  // kingpin

    if (p.UP5) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(150, 150, 160, 24),
        new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.85 })
      );
      tire.rotation.x = Math.PI / 2;            // spin axis → world Z (= car Y)
      tire.position.copy(P(p.UP5));
      group.add(tire);
    }
  }
}

function mirrorLeft(hp) {
  const out = {};
  for (const [k, v] of Object.entries(hp)) {
    out[k] = Array.isArray(v) ? [v[0], -v[1], v[2]] : v;
  }
  return out;
}
