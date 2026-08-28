// car3d — PBR materials, lights, environment, ground
// All 3D content is built in CAR-FRAME coordinates (X forward, Y right, Z up, mm);
// the YZ swap to Three.js world space lives on carGroup (see car.js).
import * as THREE from 'three';

let envReady = false;

// Shared PBR material palette (MeshStandardMaterial)
export const MAT = {
  steel:       new THREE.MeshStandardMaterial({ color: 0x8fa3bf, metalness: 0.85, roughness: 0.35 }),
  steelDark:   new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.85, roughness: 0.4 }),
  aluminum:    new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.9,  roughness: 0.4 }),
  carbon:      new THREE.MeshStandardMaterial({ color: 0x1c1f24, metalness: 0.55, roughness: 0.5 }),
  rubber:      new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.0,  roughness: 0.95 }),
  rim:         new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.7,  roughness: 0.55 }),
  brakeDisc:   new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.95, roughness: 0.3 }),
  caliper:     new THREE.MeshStandardMaterial({ color: 0xd83514, metalness: 0.5,  roughness: 0.5 }),
  glass:       new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.1, roughness: 0.15 }),
  accent:      new THREE.MeshStandardMaterial({ color: 0xd83514, metalness: 0.4,  roughness: 0.45 }),
  upholstery:  new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.0,  roughness: 0.9 }),
};

// Painted bodywork: cache one material per hex color (config-driven)
const paintCache = new Map();
export function paintMaterial(hex) {
  let m = paintCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      metalness: 0.3,
      roughness: 0.45,
    });
    paintCache.set(hex, m);
  }
  return m;
}

/** PBR environment via RoomEnvironment + PMREM (graceful fallback). */
export function setupEnvironment(renderer, scene) {
  try {
    // Lazy import so a CDN failure doesn't break the whole module
    return import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      envReady = true;
    }).catch(() => { envReady = false; });
  } catch {
    envReady = false;
    return Promise.resolve();
  }
}

/** Lights: ambient + key directional with shadows + hemisphere fill. */
export function setupLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x8a8578, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
  key.position.set(2000, 3000, 1600);       // world space (car X/Z/-Y mapped)
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3500;
  key.shadow.camera.right = 1500;
  key.shadow.camera.top = 2500;
  key.shadow.camera.bottom = -1500;
  key.shadow.camera.near = 100;
  key.shadow.camera.far = 8000;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.8);
  rim.position.set(-1500, 1200, -2000);
  scene.add(rim);
  return key;
}

/** Studio ground: large soft plane receiving shadows. */
export function setupGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 30000),
    new THREE.MeshStandardMaterial({ color: 0x8f969d, metalness: 0.1, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;      // world XZ plane at car Z=0
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

export function hasEnvironment() {
  return envReady;
}
