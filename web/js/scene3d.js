// 3D scene — suspension rendering + slider linkage
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
const group = new THREE.Group();

const FRONT_COLOR = 0xff9500, REAR_COLOR = 0xd83514;
const BALL_COLOR = 0x00d9ff;
const AXIS_X = { front: 0, rear: -895 };      // wheel center X

export function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  camera.position.set(500, 650, 700);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-450, 0, 150);

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  scene.add(new THREE.DirectionalLight(0xffffff, 1.2));

  const grid = new THREE.GridHelper(3000, 30, 0x000000, 0xcccccc);
  scene.add(grid);
  scene.add(group);
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

function ball(pos, color = BALL_COLOR, r = 5) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  m.position.set(...pos);
  return m;
}

function link(a, b, color, thickness = 3) {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...a), new THREE.Vector3(...b),
  ]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}

/** Rebuild both axles from hardpoint dicts (solve responses). */
export function rebuildCar(hpFront, hpRear) {
  group.clear();
  buildAxle(hpFront, 'front', FRONT_COLOR);
  buildAxle(hpRear, 'rear', REAR_COLOR);
}

function buildAxle(hp, axle, color) {
  if (!hp) return;
  const axis = AXIS_X[axle];
  for (const side of ['right', 'left']) {
    const p = side === 'right' ? hp : mirrorLeft(hp);
    const toWorld = (pt) => [pt[0] + axis, side === 'left' ? -pt[1] : pt[1], pt[2]];

    for (const k of ['CH1', 'CH2', 'CH3', 'CH4', 'CH5']) {
      if (p[k]) group.add(ball(toWorld(p[k]), 0x333333, 5));
    }
    for (const k of ['UP1', 'UP2', 'UP3', 'UP4', 'UP5']) {
      if (p[k]) group.add(ball(toWorld(p[k]), BALL_COLOR, 4));
    }
    if (p.FL1) group.add(ball(toWorld(p.FL1), 0xccff00, 4));

    const L = (a, b, c) => { if (p[a] && p[b]) group.add(link(toWorld(p[a]), toWorld(p[b]), c)); };
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
      tire.rotation.z = Math.PI / 2;
      tire.position.set(...toWorld(p.UP5));
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
