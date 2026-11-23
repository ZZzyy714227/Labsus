"use strict";
/* ============================================================================
   LABSUS · 05b-car3d-webgl.js
   Formula SAE 完整参数化三维实体建模与 Three.js WebGL 实时渲染引擎
   ----------------------------------------------------------------------------
   特性：
   1. 离线零外部请求（依赖 web/vendor/three.min.js），Node 无头沙箱优雅降级为 false。
   2. 与 LABSUS 运动学求解器实时联动：车身随俯仰/侧倾/垂跳，四轮悬架、推杆、摇臂、
      螺旋弹簧、转向拉杆、通风制动盘、随动卡钳及轮胎由 SIM.FR/FL/RR/RL 精确驱动。
   3. 摄像机与 05-scene3d.js (P2) / 11-stages.js (projFast) 像素级矩阵对齐。
   4. 支持「实体涂装 / 半透工程 / CAD 线框」模式与多种团队涂装配色，配合顶部“透视”键。
   ============================================================================ */

(function (global) {
  const LS_KEY = "labsus-car3d-v1";

  const LIVERIES = {
    green:  { name: "竞速绿", hex: "#0e6b3a", paint: 0x0e6b3a, accent: 0xfacc15, rim: 0xd4dce6, cal: 0xdc2626 },
    red:    { name: "赛道红", hex: "#b91c1c", paint: 0xb91c1c, accent: 0xf8fafc, rim: 0xd4dce6, cal: 0xf59e0b },
    blue:   { name: "深海蓝", hex: "#1d4ed8", paint: 0x1d4ed8, accent: 0x38bdf8, rim: 0xd8dee9, cal: 0xef4444 },
    cyan:   { name: "实验室青", hex: "#0284c7", paint: 0x0284c7, accent: 0xf97316, rim: 0xe2e8f0, cal: 0xef4444 },
    pearl:  { name: "钛银白", hex: "#cbd5e1", paint: 0xdbe3ec, accent: 0xef4444, rim: 0x262c36, cal: 0xdc2626 },
    carbon: { name: "暗夜碳纤", hex: "#1f2937", paint: 0x1e242e, accent: 0x10b981, rim: 0xd97706, cal: 0xef4444 }
  };

  const CFG = {
    enabled: true,
    shellMode: "solid", // 'solid' | 'xray' | 'wire'
    livery: "green",
    shadows: true
  };

  try {
    const saved = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) || "null");
    if (saved && typeof saved === "object") {
      if (saved.shellMode === "solid" || saved.shellMode === "xray" || saved.shellMode === "wire") CFG.shellMode = saved.shellMode;
      if (saved.livery && LIVERIES[saved.livery]) CFG.livery = saved.livery;
      if (typeof saved.enabled === "boolean") CFG.enabled = saved.enabled;
    }
  } catch (e) {}

  function saveCfg() {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(CFG));
    } catch (e) {}
  }

  let _glChecked = false;
  let _glSupported = false;

  function isAvailable() {
    if (_glChecked) return _glSupported;
    _glChecked = true;
    try {
      if (typeof THREE === "undefined" || typeof document === "undefined" || typeof WebGLRenderingContext === "undefined") {
        _glSupported = false;
        return false;
      }
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2", { alpha: true }) || c.getContext("webgl", { alpha: true }) || c.getContext("experimental-webgl", { alpha: true });
      _glSupported = !!gl;
    } catch (e) {
      _glSupported = false;
    }
    return _glSupported;
  }

  function supportsCurrentVehicle() {
    return typeof S !== "undefined" && S && ["formula", "baja", "gt3", "gt3_sport"].includes(S.vehicleType);
  }

  function isPureSuspActive() {
    if (typeof S === "undefined" || !S || !S.show) return false;
    return !S.show.frame_main && !S.show.frame_front && !S.show.frame_side && !S.show.frame_rear && !S.show.powertrain;
  }

  function isActiveForView() {
    return CFG.enabled && CFG.shellMode !== "wire" && supportsCurrentVehicle() && isAvailable();
  }

  function isActiveForStage() {
    return CFG.enabled && CFG.shellMode !== "wire" && supportsCurrentVehicle() && isAvailable();
  }

  /* ============================================================================
     内部 Three.js 状态与资源管理
     ============================================================================ */
  const ST = {
    initAttempted: false,
    failed: false,
    renderer: null,
    glCanvas: null,
    scene: null,
    camera: null,
    envRT: null,
    lights: null,
    studioGroup: null,
    studioFloor: null,
    studioGrid: null,
    stageShadowPlane: null,
    stageShadowMat: null,
    carRoot: null,
    carKey: "",
    parts: null,
    mats: null,
    tex: null,
    lastW: 0,
    lastH: 0,
    lastDpr: 0,
    tmpV1: null,
    tmpV2: null,
    tmpV3: null,
    tmpM4: null,
    tmpQ: null,
    upY: null
  };

  function makeCarbonTexture() {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const g = cv.getContext("2d");
    g.fillStyle = "#171b22";
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      for (let x = 0; x < 64; x += 8) {
        const shift = ((y >> 3) & 1) * 4;
        g.fillStyle = "#2d3440";
        g.fillRect((x + shift) % 64, y, 4, 4);
        g.fillStyle = "#232933";
        g.fillRect((x + shift + 4) % 64, y + 4, 4, 4);
        g.fillStyle = "#12151a";
        g.fillRect((x + shift + 4) % 64, y, 4, 4);
      }
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.wrapS = THREE.RepeatWrapping;
    tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(14, 14);
    tx.anisotropy = 4;
    tx.encoding = THREE.sRGBEncoding;
    return tx;
  }

  function makeTireSidewallTexture() {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 512;
    const g = cv.getContext("2d");
    g.fillStyle = "#1b1e24";
    g.fillRect(0, 0, 512, 512);
    // Subtle brushed rubber radial grain
    g.strokeStyle = "rgba(255,255,255,0.03)";
    g.lineWidth = 2;
    for (let r = 135; r <= 245; r += 6) {
      g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
    }
    // Classic racing tire sidewall stripe & stencil
    g.strokeStyle = "rgba(226, 232, 240, 0.42)";
    g.lineWidth = 4;
    g.beginPath(); g.arc(256, 256, 178, 0.25, 1.35); g.stroke();
    g.beginPath(); g.arc(256, 256, 178, Math.PI + 0.25, Math.PI + 1.35); g.stroke();
    g.fillStyle = "rgba(241, 245, 249, 0.65)";
    g.font = "bold 22px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.save();
    g.translate(256, 256);
    g.rotate(-0.6);
    g.fillText("LABSUS", 0, -192);
    g.rotate(Math.PI);
    g.fillText("SLICK", 0, -192);
    g.restore();
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4;
    tx.encoding = THREE.sRGBEncoding;
    return tx;
  }

  function makeBrakeDiscTexture() {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#8a94a0";
    g.fillRect(0, 0, 256, 256);
    for (let r = 64; r <= 122; r += 4) {
      g.strokeStyle = (r % 8 === 0) ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)";
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = "#2b3038";
    for (let k = 0; k < 18; k++) {
      const a0 = (k / 18) * Math.PI * 2;
      for (let s = 0; s < 3; s++) {
        const r = 74 + s * 17;
        const a = a0 + s * 0.08;
        g.beginPath();
        g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4;
    tx.encoding = THREE.sRGBEncoding;
    return tx;
  }

  function buildStudioEnvMap(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();

    // Procedural sky-to-tarmac studio dome
    const domeGeo = new THREE.SphereGeometry(50, 24, 16);
    const pos = domeGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(0x4a7cc7);
    const cHor = new THREE.Color(0xdce8f8);
    const cBot = new THREE.Color(0x1f2630);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y >= 0) tmp.copy(cHor).lerp(cTop, Math.pow(y, 0.7));
      else tmp.copy(cHor).lerp(cBot, Math.pow(-y, 0.45));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    domeGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    // Crisp studio reflection softboxes for car paint clearcoat highlights
    const addLightCard = (x, y, z, w, h, color, intensity) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    addLightCard(0, 22, 18, 28, 10, 0xffffff, 1.8);
    addLightCard(22, 8, -10, 18, 8, 0xd8ebff, 1.3);
    addLightCard(-20, 10, 12, 16, 8, 0xfff3df, 1.1);

    const rt = pmrem.fromScene(envScene, 0.035);
    pmrem.dispose();
    return rt;
  }

  function initEngine() {
    if (ST.initAttempted) return !ST.failed;
    ST.initAttempted = true;
    if (!isAvailable()) { ST.failed = true; return false; }

    try {
      if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      const cv = document.createElement("canvas");
      const renderer = new THREE.WebGLRenderer({
        canvas: cv,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 40, 260000);
      camera.matrixAutoUpdate = false;

      const envRT = buildStudioEnvMap(renderer);
      scene.environment = envRT.texture;

      // Lights (+Z is UP in LABSUS coordinates)
      const hemi = new THREE.HemisphereLight(0xdcebff, 0x262d38, 0.55);
      const sun = new THREE.DirectionalLight(0xfffaf0, 2.15);
      sun.position.set(3200, 4200, 5000);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 500;
      sun.shadow.camera.far = 16000;
      sun.shadow.camera.left = -2200;
      sun.shadow.camera.right = 2200;
      sun.shadow.camera.top = 2200;
      sun.shadow.camera.bottom = -2200;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 8;

      const fill = new THREE.DirectionalLight(0x9ec5ff, 0.35);
      fill.position.set(-3600, -2400, 2200);

      const rim = new THREE.DirectionalLight(0xffffff, 0.38);
      rim.position.set(0, -4500, 1800);

      scene.add(hemi, sun, sun.target, fill, rim);

      // Studio Floor (ShadowMaterial matches exact theme C.bg seamlessly!)
      const studioGroup = new THREE.Group();
      const studioFloorGeo = new THREE.PlaneGeometry(16000, 16000);
      const studioFloorMat = new THREE.ShadowMaterial({ opacity: 0.42 });
      const studioFloor = new THREE.Mesh(studioFloorGeo, studioFloorMat);
      studioFloor.position.set(0, 0, -1);
      studioFloor.receiveShadow = true;
      studioGroup.add(studioFloor);

      const studioGrid = new THREE.GridHelper(9000, 36, 0x3b4d68, 0x1e2838);
      studioGrid.rotation.x = Math.PI / 2; // Put grid in XY plane (+Z up)
      studioGrid.position.set(0, 0, 0.5);
      const studioGridLight = new THREE.GridHelper(9000, 36, 0xb8ae9c, 0xdfd7c6);
      studioGridLight.rotation.x = Math.PI / 2;
      studioGridLight.position.set(0, 0, 0.5);
      studioGridLight.visible = false;
      studioGroup.add(studioGrid, studioGridLight);
      scene.add(studioGroup);

      // Stage Shadow Receiver (used in Slope / Skidpad / Circuit stages)
      const stageShadowMat = new THREE.ShadowMaterial({ opacity: 0.62 });
      const stageShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(6800, 6800), stageShadowMat);
      stageShadowPlane.receiveShadow = true;
      stageShadowPlane.visible = false;
      scene.add(stageShadowPlane);

      const tex = {
        carbon: makeCarbonTexture(),
        sidewall: makeTireSidewallTexture(),
        disc: makeBrakeDiscTexture()
      };

      const liv = LIVERIES[CFG.livery] || LIVERIES.green;
      const mats = {
        paint: new THREE.MeshPhysicalMaterial({
          color: liv.paint,
          metalness: 0.16,
          roughness: 0.22,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.15
        }),
        accent: new THREE.MeshPhysicalMaterial({
          color: liv.accent,
          metalness: 0.25,
          roughness: 0.26,
          clearcoat: 0.85,
          clearcoatRoughness: 0.08
        }),
        carbon: new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: tex.carbon,
          roughness: 0.36,
          metalness: 0.14,
          clearcoat: 0.45,
          clearcoatRoughness: 0.16
        }),
        darkTrim: new THREE.MeshStandardMaterial({
          color: 0x12151b,
          roughness: 0.65,
          metalness: 0.15
        }),
        aluminum: new THREE.MeshStandardMaterial({
          color: 0xd0d7e2,
          metalness: 0.86,
          roughness: 0.22
        }),
        steelTube: new THREE.MeshStandardMaterial({
          color: 0x5d6c7d,
          metalness: 0.72,
          roughness: 0.32
        }),
        wishbone: new THREE.MeshStandardMaterial({
          color: 0x262c36,
          metalness: 0.55,
          roughness: 0.28
        }),
        pushrod: new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          metalness: 0.65,
          roughness: 0.24
        }),
        tieRod: new THREE.MeshStandardMaterial({
          color: 0x2dd4bf,
          metalness: 0.60,
          roughness: 0.26
        }),
        rocker: new THREE.MeshStandardMaterial({
          color: 0xd99b26,
          metalness: 0.80,
          roughness: 0.24
        }),
        spring: new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          metalness: 0.35,
          roughness: 0.24
        }),
        damper: new THREE.MeshStandardMaterial({
          color: 0x475569,
          metalness: 0.78,
          roughness: 0.28
        }),
        caliper: new THREE.MeshStandardMaterial({
          color: liv.cal,
          metalness: 0.50,
          roughness: 0.28,
          emissive: 0x000000
        }),
        disc: new THREE.MeshStandardMaterial({
          color: 0xd4dce6,
          map: tex.disc,
          metalness: 0.82,
          roughness: 0.30,
          emissive: 0x000000
        }),
        tireTread: new THREE.MeshStandardMaterial({
          color: 0x181b21,
          roughness: 0.80,
          metalness: 0.04
        }),
        tireSide: new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: tex.sidewall,
          roughness: 0.76,
          metalness: 0.05
        }),
        rim: new THREE.MeshStandardMaterial({
          color: liv.rim,
          metalness: 0.88,
          roughness: 0.20
        }),
        centerLock: new THREE.MeshStandardMaterial({
          color: 0xef4444,
          metalness: 0.75,
          roughness: 0.22
        }),
        helmet: new THREE.MeshPhysicalMaterial({
          color: 0xf8fafc,
          metalness: 0.15,
          roughness: 0.14,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05
        }),
        visor: new THREE.MeshPhysicalMaterial({
          color: 0x0f172a,
          metalness: 0.85,
          roughness: 0.08,
          clearcoat: 1.0
        }),
        harness: new THREE.MeshStandardMaterial({
          color: 0xdc2626,
          roughness: 0.70,
          metalness: 0.05
        }),
        rainLight: new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 1.6,
          roughness: 0.25
        }),
        edu: new THREE.MeshStandardMaterial({
          color: 0x263f57,
          metalness: 0.60,
          roughness: 0.38
        }),
        joint: new THREE.MeshStandardMaterial({
          color: 0xf1c40f,
          metalness: 0.82,
          roughness: 0.20
        }),
        glass: new THREE.MeshPhysicalMaterial({
          color: 0x0f172a,
          metalness: 0.12,
          roughness: 0.08,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.62,
          depthWrite: false
        }),
        headlight: new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          emissive: 0xe0f2fe,
          emissiveIntensity: 1.45,
          roughness: 0.14,
          metalness: 0.20
        }),
        skid: new THREE.MeshStandardMaterial({
          color: 0xc2cbd6,
          metalness: 0.78,
          roughness: 0.36
        })
      };

      const carRoot = new THREE.Group();
      carRoot.matrixAutoUpdate = false;
      scene.add(carRoot);

      ST.renderer = renderer;
      ST.glCanvas = cv;
      ST.scene = scene;
      ST.camera = camera;
      ST.envRT = envRT;
      ST.lights = { hemi, sun, fill, rim };
      ST.studioGroup = studioGroup;
      ST.studioFloor = studioFloor;
      ST.studioGrid = studioGrid;
      ST.studioGridLight = studioGridLight;
      ST.stageShadowPlane = stageShadowPlane;
      ST.stageShadowMat = stageShadowMat;
      ST.tex = tex;
      ST.mats = mats;
      ST.carRoot = carRoot;
      ST.tmpV1 = new THREE.Vector3();
      ST.tmpV2 = new THREE.Vector3();
      ST.tmpV3 = new THREE.Vector3();
      ST.tmpM4 = new THREE.Matrix4();
      ST.tmpQ = new THREE.Quaternion();
      ST.upY = new THREE.Vector3(0, 1, 0);

      return true;
    } catch (e) {
      console.warn("CAR3D_GL init failed:", e);
      ST.failed = true;
      return false;
    }
  }

  /* ============================================================================
     几何体生成器：放样曲面 / 翼型截面 / 螺旋弹簧 / 轮胎轮毂
     ============================================================================ */
  function buildLoftGeometry(rings, closedEnds) {
    const nR = rings.length;
    const nP = rings[0].length;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let r = 0; r < nR; r++) {
      const v = nR > 1 ? r / (nR - 1) : 0;
      const ring = rings[r];
      for (let p = 0; p < nP; p++) {
        const pt = ring[p];
        positions.push(pt[0], pt[1], pt[2]);
        uvs.push(p / (nP - 1), v);
      }
    }

    for (let r = 0; r < nR - 1; r++) {
      for (let p = 0; p < nP; p++) {
        const pNext = (p + 1) % nP;
        const a = r * nP + p;
        const b = r * nP + pNext;
        const c = (r + 1) * nP + pNext;
        const d = (r + 1) * nP + p;
        indices.push(a, b, c, a, c, d);
      }
    }

    if (closedEnds) {
      const addCap = (ringIdx, reverse) => {
        const ring = rings[ringIdx];
        let cx = 0, cy = 0, cz = 0;
        for (let p = 0; p < nP; p++) { cx += ring[p][0]; cy += ring[p][1]; cz += ring[p][2]; }
        const centerIdx = positions.length / 3;
        positions.push(cx / nP, cy / nP, cz / nP);
        uvs.push(0.5, ringIdx === 0 ? 0 : 1);
        const base = ringIdx * nP;
        for (let p = 0; p < nP; p++) {
          const pNext = (p + 1) % nP;
          if (reverse) indices.push(centerIdx, base + pNext, base + p);
          else indices.push(centerIdx, base + p, base + pNext);
        }
      };
      addCap(0, true);
      addCap(nR - 1, false);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Watertight multi-material loft builder: ONE continuous shared-vertex mesh with per-quad material groups (zero shell overlap!)
  function buildMultiMatLoftGeometry(rings, closedEnds, quadMatFn, capMats) {
    const nR = rings.length;
    const nP = rings[0].length;
    const stride = nP + 1; // duplicate ring[0] at col=nP for seamless UV wrap
    const positions = [];
    const uvs = [];

    for (let r = 0; r < nR; r++) {
      const ring = rings[r];
      const yCoord = ring[0][1];
      for (let c = 0; c <= nP; c++) {
        const pt = ring[c % nP];
        positions.push(pt[0], pt[1], pt[2]);
        uvs.push(c / nP, yCoord / 600);
      }
    }

    const buckets = [[], [], [], [], []];
    for (let r = 0; r < nR - 1; r++) {
      for (let p = 0; p < nP; p++) {
        const a = r * stride + p;
        const b = r * stride + p + 1;
        const c = (r + 1) * stride + p + 1;
        const d = (r + 1) * stride + p;
        const m = quadMatFn ? (quadMatFn(r, p, nP) || 0) : 0;
        while (buckets.length <= m) buckets.push([]);
        buckets[m].push(a, b, c, a, c, d);
      }
    }

    if (closedEnds) {
      const addCap = (ringIdx, reverse, matIdx) => {
        const ring = rings[ringIdx];
        let cx = 0, cy = 0, cz = 0;
        for (let p = 0; p < nP; p++) { cx += ring[p][0]; cy += ring[p][1]; cz += ring[p][2]; }
        const centerIdx = positions.length / 3;
        positions.push(cx / nP, cy / nP, cz / nP);
        uvs.push(0.5, cy / nP / 600);
        const base = ringIdx * stride;
        const bkt = buckets[matIdx || 0];
        for (let p = 0; p < nP; p++) {
          if (reverse) bkt.push(centerIdx, base + p + 1, base + p);
          else bkt.push(centerIdx, base + p, base + p + 1);
        }
      };
      addCap(0, true, capMats ? capMats[0] : 0);
      addCap(nR - 1, false, capMats ? capMats[1] : 0);
    }

    const indices = [];
    const geo = new THREE.BufferGeometry();
    for (let m = 0; m < buckets.length; m++) {
      if (buckets[m].length > 0) {
        geo.addGroup(indices.length, buckets[m].length, m);
        for (let i = 0; i < buckets[m].length; i++) indices.push(buckets[m][i]);
      }
    }

    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // Unified 32-vertex monocoque cross-section ring: seamlessly morphs from closed nose -> open U-cockpit -> closed engine cover!
  function monocoqueRing(s) {
    const y = s.y, rx = s.rx, rxBot = s.rxBot, zBot = s.zBot, zSplit = s.zSplit, zTop = s.zTop, zCrown = s.zCrown;
    const open = s.open || 0;
    const rxIn = s.rxIn || (rx * 0.65);
    const zFloor = s.zFloor !== undefined ? s.zFloor : zBot + 14;
    const right = [];

    // p = 1..3: lower right carbon belly (zBot -> zSplit)
    right.push([rxBot * 0.62, y, zBot]);
    right.push([rxBot * 0.96, y, zBot + (zSplit - zBot) * 0.18]);
    right.push([rxBot * 0.35 + rx * 0.65, y, zBot + (zSplit - zBot) * 0.56]);
    // p = 4: right waist seam
    right.push([rx, y, zSplit]);
    // p = 5..8: smooth painted outer right wall rising to shoulder (p=8 at th = 0.24*PI -> xSh ≈ 0.87*rx)
    const maxTh = Math.PI * 0.24;
    const sinMax = Math.sin(maxTh);
    for (let k = 1; k <= 4; k++) {
      const u = k / 4;
      const th = u * maxTh;
      const x = rx * Math.pow(Math.cos(th), 0.44);
      const z = zSplit + (zTop - zSplit) * Math.pow(Math.sin(th) / sinMax, 0.76);
      right.push([x, y, z]);
    }
    const xSh = right[7][0]; // p = 8

    // p = 9..16: blend smoothly between closed convex dome (open=0) and open U-cockpit coaming + inner wall + floor (open=1)
    const openRight = [
      [xSh * 0.88 + rxIn * 0.12, zTop + 6],                       // p = 9: outer coaming crest
      [rxIn + 6,                 zTop + 3],                       // p = 10: inner coaming lip
      [rxIn,                     zTop - 24],                      // p = 11: upper inner cockpit wall
      [rxIn * 0.97,              zFloor + (zTop - zFloor) * 0.62],// p = 12: mid-upper inner wall
      [rxIn * 0.93,              zFloor + (zTop - zFloor) * 0.30],// p = 13: mid-lower inner wall
      [rxIn * 0.82,              zFloor + 20],                    // p = 14: inner floor fillet
      [rxIn * 0.46,              zFloor],                         // p = 15: inner floor
      [0,                        zFloor]                          // p = 16: centerline floor
    ];
    for (let j = 1; j <= 8; j++) {
      const ang = (j / 8) * Math.PI * 0.5;
      const xc = xSh * Math.cos(ang);
      const zc = zTop + (zCrown - zTop) * Math.sin(ang);
      const op = openRight[j - 1];
      right.push([
        xc + (op[0] - xc) * open,
        y,
        zc + (op[1] - zc) * open
      ]);
    }

    // Assemble 32-point CCW ring: p=0 (bottom center), p=1..16 (right->top/center), p=17..31 (mirror of p=15..1)
    const pts = [[0, y, zBot]];
    for (let i = 0; i < right.length; i++) pts.push(right[i]);
    for (let i = right.length - 2; i >= 0; i--) pts.push([-right[i][0], y, right[i][2]]);
    return pts;
  }

  // Smooth superellipse section ring in XZ plane at fixed Y (CCW viewed from +Y so normals face outward)
  function superSectionRing(y, rx, zBot, zTop, expTop, expBot, nPts, xOffset) {
    const pts = [];
    const ox = xOffset || 0;
    const zMid = (zBot + zTop) * 0.5;
    const rz = (zTop - zBot) * 0.5;
    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * Math.PI * 2;
      const ct = Math.cos(th), st = Math.sin(th);
      const ex = st >= 0 ? expTop : expBot;
      const x = ox + Math.sign(ct) * Math.pow(Math.abs(ct), ex) * rx;
      const z = zMid + Math.sign(st) * Math.pow(Math.abs(st), ex) * rz;
      pts.push([x, y, z]);
    }
    return pts;
  }

  // U-shaped open cockpit tub section ring (smooth rounded shoulder tumblehome matching monocoque nose cleanly)
  function cockpitRing(y, rxOut, rxIn, zBot, zTop, zFloorIn, nSide) {
    const pts = [];
    const xTopOut = rxOut * 0.82;
    const xCoamMid = (xTopOut + rxIn) * 0.5;
    const wCoam = Math.max(8, xTopOut - rxIn);
    const sideX = t => (t < 0.35
      ? rxOut * (0.92 + 0.08 * Math.sin((t / 0.35) * Math.PI * 0.5))
      : rxOut * (1.0 - 0.16 * Math.pow((t - 0.35) / 0.65, 1.4)));

    pts.push([0, y, zBot]);
    pts.push([rxOut * 0.72, y, zBot]);
    pts.push([rxOut * 0.92, y, zBot + 24]);
    for (let i = 1; i <= nSide; i++) {
      const t = i / nSide;
      const z = zBot + 24 + (zTop - zBot - 44) * t;
      pts.push([sideX(t), y, z]);
    }
    // Right top coaming roll
    pts.push([xTopOut, y, zTop - 6]);
    pts.push([xCoamMid, y, zTop + 4]);
    pts.push([rxIn + wCoam * 0.16, y, zTop - 3]);
    // Right inner wall down
    pts.push([rxIn, y, zTop - 28]);
    pts.push([rxIn * 0.94, y, zFloorIn + 40]);
    pts.push([rxIn * 0.75, y, zFloorIn]);
    // Inner floor
    pts.push([0, y, zFloorIn]);
    // Left inner wall up
    pts.push([-rxIn * 0.75, y, zFloorIn]);
    pts.push([-rxIn * 0.94, y, zFloorIn + 40]);
    pts.push([-rxIn, y, zTop - 28]);
    // Left top coaming roll
    pts.push([-rxIn - wCoam * 0.16, y, zTop - 3]);
    pts.push([-xCoamMid, y, zTop + 4]);
    pts.push([-xTopOut, y, zTop - 6]);
    // Left outer wall down
    for (let i = nSide; i >= 1; i--) {
      const t = i / nSide;
      const z = zBot + 24 + (zTop - zBot - 44) * t;
      pts.push([-sideX(t), y, z]);
    }
    pts.push([-rxOut * 0.92, y, zBot + 24]);
    pts.push([-rxOut * 0.72, y, zBot]);
    return pts;
  }

  // Cambered airfoil ExtrudeGeometry along X axis (span); positive aoaDeg = downforce nose-down/tail-up
  function makeAirfoilGeo(chord, thickness, camber, aoaDeg, span) {
    const shape = new THREE.Shape();
    const N = 20;
    const aoa = -aoaDeg * Math.PI / 180;
    const ca = Math.cos(aoa), sa = Math.sin(aoa);
    const rot = (py, pz) => [py * ca - pz * sa, py * sa + pz * ca];

    const topPts = [], botPts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N; // 0 = leading edge (+Y), 1 = trailing edge (-Y)
      const yc = (0.5 - u) * chord;
      const yt = 5 * thickness * (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
      const zc = -camber * 4 * u * (1 - u); // convex underside for downforce
      topPts.push(rot(yc, zc + yt));
      botPts.push(rot(yc, zc - yt));
    }
    shape.moveTo(topPts[0][0], topPts[0][1]);
    for (let i = 1; i < topPts.length; i++) shape.lineTo(topPts[i][0], topPts[i][1]);
    for (let i = botPts.length - 2; i >= 0; i--) shape.lineTo(botPts[i][0], botPts[i][1]);
    shape.closePath();

    const raw = new THREE.ExtrudeGeometry(shape, {
      depth: span,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 1.2,
      bevelThickness: 1.8
    });
    // Raw coords: x_raw = yc (+front), y_raw = zc (+up), z_raw = span [0..span]
    // Even permutation (x,y,z) -> (z,x,y) keeps outward face winding intact
    const pos = raw.attributes.position;
    const uv = raw.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const xr = pos.getX(i), yr = pos.getY(i), zr = pos.getZ(i);
      pos.setXYZ(i, zr - span * 0.5, xr, yr);
      if (uv) uv.setXY(i, (zr - span * 0.5) / 600, xr / 600);
    }
    raw.computeVertexNormals();
    raw.computeBoundingSphere();
    return raw;
  }

  function makeExtrudedPlateYZ(ptsYZ, thicknessX) {
    const shape = new THREE.Shape();
    shape.moveTo(ptsYZ[0][0], ptsYZ[0][1]);
    for (let i = 1; i < ptsYZ.length; i++) shape.lineTo(ptsYZ[i][0], ptsYZ[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thicknessX,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 1.5,
      bevelThickness: 1.5
    });
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const xr = pos.getX(i), yr = pos.getY(i), zr = pos.getZ(i);
      pos.setXYZ(i, zr - thicknessX * 0.5, xr, yr);
      if (uv) uv.setXY(i, xr / 600, yr / 600);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // Build Lathe-profiled slick tire along +X axis (outboard at +X, wheel centered at origin)
  function makeTireGeometries(tR, tW, rimR, rimHalf) {
    const hw = tW * 0.5;
    const shoulder = Math.min(26, tW * 0.14);
    const bulge = 6;
    const treadR = tR;
    const beadR = rimR + 2;

    // LatheGeometry revolves around Y axis -> we generate profile in (radius, X_axial), then rotateZ(-PI/2) so Y_lathe -> +X_wheel
    const treadPts = [
      new THREE.Vector2(beadR, -hw + 8),
      new THREE.Vector2(rimR + (tR - rimR) * 0.48, -hw - bulge),
      new THREE.Vector2(tR - shoulder * 0.65, -hw - 1),
      new THREE.Vector2(treadR, -hw + shoulder),
      new THREE.Vector2(treadR + 1.5, 0),
      new THREE.Vector2(treadR, hw - shoulder),
      new THREE.Vector2(tR - shoulder * 0.65, hw + 1),
      new THREE.Vector2(rimR + (tR - rimR) * 0.48, hw + bulge),
      new THREE.Vector2(beadR, hw - 8)
    ];
    const tireGeo = new THREE.LatheGeometry(treadPts, 40);
    tireGeo.rotateZ(-Math.PI / 2); // Y_lathe -> +X_wheel
    tireGeo.computeVertexNormals();

    // Sidewall planar stencil rings on outer & inner faces (for crisp tire lettering & spin cue)
    const sideRingGeo = new THREE.RingGeometry(rimR + 4, tR - shoulder * 0.5, 36, 1);
    // Rotate plane normal +Z -> +X
    sideRingGeo.rotateY(Math.PI / 2);

    // Deep-dish rim barrel (Lathe)
    const rimOutX = hw - 8;
    const rimInX = -hw + 12;
    const barrelPts = [
      new THREE.Vector2(rimR + 3, rimInX),
      new THREE.Vector2(rimR - 4, rimInX),
      new THREE.Vector2(rimR - 10, rimInX + 12),
      new THREE.Vector2(rimR - 12, rimOutX - rimHalf * 1.4),
      new THREE.Vector2(rimR - 4, rimOutX - 6),
      new THREE.Vector2(rimR + 3, rimOutX),
      new THREE.Vector2(rimR - 4, rimOutX + 1.5),
      new THREE.Vector2(rimR - 9, rimOutX - 4),
      new THREE.Vector2(rimR - 16, rimOutX - rimHalf)
    ];
    const barrelGeo = new THREE.LatheGeometry(barrelPts, 32);
    barrelGeo.rotateZ(-Math.PI / 2);
    barrelGeo.computeVertexNormals();

    return { tireGeo, sideRingGeo, barrelGeo };
  }

  function makeHelicalSpringGeo(sprR, L, turns, wireR) {
    const pts = [];
    const seg = 96;
    const t0 = 0.08, t1 = 0.92;
    for (let k = 0; k <= seg; k++) {
      const frac = k / seg;
      const y = (t0 + (t1 - t0) * frac) * L;
      const an = 2 * Math.PI * turns * frac;
      pts.push(new THREE.Vector3(sprR * Math.cos(an), y, sprR * Math.sin(an)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 96, wireR || 4.0, 8, false);
  }

  /* ============================================================================
     全车型 3D 共享构建辅助 & 受力/侧倾中心可视化工具
     ============================================================================ */
  function buildCarKey() {
    const f = S.front, r = S.rear;
    const isDirect = (ax) => ax.arch === "direct" ? 1 : 0;
    return [
      S.vehicleType, S.wb,
      f.arch, f.tire.R, f.tire.W, f.tire.rim, f.tire.disc, f.tire.et || 0, f.tire.rimW || 0,
      isDirect(f) ? dst(f.hp.STRUT_OUT, f.hp.DMP_BODY).toFixed(1) : dst(f.hp.RCK_DMP, f.hp.DMP_BODY).toFixed(1),
      r.arch, r.tire.R, r.tire.W, r.tire.rim, r.tire.disc, r.tire.et || 0, r.tire.rimW || 0,
      isDirect(r) ? dst(r.hp.STRUT_OUT, r.hp.DMP_BODY).toFixed(1) : dst(r.hp.RCK_DMP, r.hp.DMP_BODY).toFixed(1),
      f.arb ? f.arb.d : 0, f.arb ? f.arb.t : 0,
      r.arb ? r.arb.d : 0, r.arb ? r.arb.t : 0
    ].join("|");
  }
  const buildFormulaKey = buildCarKey;

  function clearGroup(g) {
    while (g.children.length) {
      const ch = g.children[g.children.length - 1];
      g.remove(ch);
      ch.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o._ownsMat && o.material && o.material.dispose) o.material.dispose();
      });
    }
  }

  function createUnitCylinder() {
    return new THREE.CylinderGeometry(1, 1, 1, 14);
  }

  function addTubeMesh(grp, unitCyl, a, b, r, mat) {
    const m = new THREE.Mesh(unitCyl, mat);
    orientBetween(m, a, b, r);
    m.castShadow = true;
    grp.add(m);
    return m;
  }

  function addBoxMesh(grp, center, size, mat, rotXYZ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.set(center[0], center[1], center[2]);
    if (rotXYZ) m.rotation.set(rotXYZ[0] || 0, rotXYZ[1] || 0, rotXYZ[2] || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  }

  // Regularized 6x6 solver (A * x = b) for two-force suspension link tension/compression estimation
  function solveLinear6(A, b) {
    const n = 6;
    const M = Array.from({ length: n }, () => new Float64Array(n + 1));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = i === j ? 1e-4 : 0;
        for (let k = 0; k < n; k++) s += A[k][i] * A[k][j];
        M[i][j] = s;
      }
      let rhs = 0;
      for (let k = 0; k < n; k++) rhs += A[k][i] * b[k];
      M[i][n] = rhs;
    }
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (piv !== col) { const t = M[col]; M[col] = M[piv]; M[piv] = t; }
      const d = M[col][col];
      if (Math.abs(d) < 1e-12) continue;
      for (let j = col; j <= n; j++) M[col][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
      }
    }
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Number.isFinite(M[i][n]) ? M[i][n] : 0;
    return x;
  }

  function solveCornerLinkLoadsJS(pts, wc, cp, fCp) {
    // Each link axis u_i points chassis -> knuckle so T_i > 0 means tension (pulling knuckle inward)
    const pairs = [
      [pts.LCA_F, pts.LBJ, pts.LBJ],
      [pts.LCA_R, pts.LBJ, pts.LBJ],
      [pts.UCA_F, pts.UBJ, pts.UBJ],
      [pts.UCA_R, pts.UBJ, pts.UBJ],
      [pts.RACK, pts.TRO, pts.TRO],
      [pts.STRUT_BASE, pts.ST_O, pts.ST_O]
    ];
    const A = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let i = 0; i < 6; i++) {
      const a = pairs[i][0], b = pairs[i][1], app = pairs[i][2];
      const u = nrm(sub(b, a));
      const r = sub(app, wc);
      const tau = cross(r, u);
      A[0][i] = u[0];   A[1][i] = u[1];   A[2][i] = u[2];
      A[3][i] = tau[0]; A[4][i] = tau[1]; A[5][i] = tau[2];
    }
    const rCp = sub(cp, wc);
    const mCp = cross(rCp, fCp);
    const rhs = [fCp[0], fCp[1], fCp[2], mCp[0], mCp[1], mCp[2]];
    return solveLinear6(A, rhs);
  }

  function buildSuspensionCorners(unitCyl, unitSphere, cornerOpts) {
    const co = cornerOpts || {};
    const fState = S.front, rState = S.rear;
    const frontGeos = makeTireGeometries(
      fState.tire.R || 230, fState.tire.W || 175, fState.tire.rim || 127,
      fState.tire.rimW ? Math.max(18, fState.tire.rimW * 0.30) : 6
    );
    const rearGeos = makeTireGeometries(
      rState.tire.R || 235, rState.tire.W || 205, rState.tire.rim || 127,
      rState.tire.rimW ? Math.max(18, rState.tire.rimW * 0.30) : 6
    );

    const forceConeGeo = new THREE.ConeGeometry(1, 1, 12);
    const forceRingGeo = new THREE.RingGeometry(0.76, 1.0, 36);
    const corners = {};

    [["FR", "front", +1], ["FL", "front", -1], ["RR", "rear", +1], ["RL", "rear", -1]].forEach(([key, axis, sx]) => {
      const state = S[axis];
      const geos = axis === "front" ? frontGeos : rearGeos;
      const tR = state.tire.R || 230, tW = state.tire.W || 175, rimR = state.tire.rim || 127, dR = state.tire.disc || 95;
      const etOff = -(state.tire.et || 0);
      const isDirect = state.arch === "direct";
      const grp = new THREE.Group();

      const lcaF = new THREE.Mesh(unitCyl, ST.mats.wishbone);
      const lcaR = new THREE.Mesh(unitCyl, ST.mats.wishbone);
      const ucaF = new THREE.Mesh(unitCyl, ST.mats.wishbone);
      const ucaR = new THREE.Mesh(unitCyl, ST.mats.wishbone);
      const strut = new THREE.Mesh(unitCyl, ST.mats.pushrod);
      const tieRod = new THREE.Mesh(unitCyl, ST.mats.tieRod);
      const halfshaft = new THREE.Mesh(unitCyl, ST.mats.steelTube);
      [lcaF, lcaR, ucaF, ucaR, strut, tieRod, halfshaft].forEach(m => { m.castShadow = true; grp.add(m); });

      const joints = {};
      ["LBJ", "UBJ", "TRO", "ST_O", "ST_I"].forEach(j => {
        const jm = new THREE.Mesh(unitSphere, ST.mats.joint);
        jm.scale.setScalar(10);
        grp.add(jm);
        joints[j] = jm;
      });

      const knk1 = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      const knk2 = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      const knk3 = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      [knk1, knk2, knk3].forEach(m => { m.castShadow = true; grp.add(m); });

      const rockerMesh = new THREE.Mesh(new THREE.BufferGeometry(), ST.mats.rocker);
      const rockerAxle = new THREE.Mesh(unitCyl, ST.mats.steelTube);
      const dmpBody    = new THREE.Mesh(unitCyl, ST.mats.damper);
      const dmpShaft   = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      const L_spr0 = isDirect
        ? (dst(state.hp.STRUT_OUT, state.hp.DMP_BODY) || 350)
        : (dst(state.hp.RCK_DMP, state.hp.DMP_BODY) || 180);
      const sprR = co.isBaja ? 26 : (co.isGT3 ? 23 : 19);
      const sprTurns = co.isBaja ? 9.5 : (co.isGT3 ? 8.5 : 7.5);
      const sprWire = co.isBaja ? 5.2 : (co.isGT3 ? 4.4 : 4.0);
      const springGeo = makeHelicalSpringGeo(sprR, L_spr0, sprTurns, sprWire);
      const springMesh = new THREE.Mesh(springGeo, ST.mats.spring);
      [rockerMesh, rockerAxle, dmpBody, dmpShaft, springMesh].forEach(m => { m.castShadow = true; grp.add(m); });

      const carrierGrp = new THREE.Group();
      carrierGrp.matrixAutoUpdate = false;
      const calGroup = new THREE.Group();
      const calSz = co.isGT3 ? [48, 64, 92] : [44, 54, 76];
      const calBody = new THREE.Mesh(new THREE.BoxGeometry(calSz[0], calSz[1], calSz[2]), ST.mats.caliper);
      calBody.castShadow = true;
      calGroup.add(calBody);
      carrierGrp.add(calGroup);

      const spinGrp = new THREE.Group();
      const discMesh = new THREE.Mesh(new THREE.CylinderGeometry(dR, dR, 14, 28), ST.mats.disc);
      discMesh.rotation.z = Math.PI / 2;
      discMesh.position.set(-5, 0, 0);
      const discBell = new THREE.Mesh(new THREE.CylinderGeometry(dR * 0.56, dR * 0.60, 22, 20), ST.mats.darkTrim);
      discBell.rotation.z = Math.PI / 2;
      discBell.position.set(-8, 0, 0);
      spinGrp.add(discMesh, discBell);

      const tireMesh = new THREE.Mesh(geos.tireGeo, ST.mats.tireTread);
      tireMesh.castShadow = true;
      tireMesh.receiveShadow = true;
      const sideOut = new THREE.Mesh(geos.sideRingGeo, ST.mats.tireSide);
      sideOut.position.set(tW * 0.5 + 1.5, 0, 0);
      const sideIn = new THREE.Mesh(geos.sideRingGeo, ST.mats.tireSide);
      sideIn.rotation.y = Math.PI;
      sideIn.position.set(-tW * 0.5 - 1.5, 0, 0);
      spinGrp.add(tireMesh, sideOut, sideIn);

      // Baja off-road tread lugs
      if (co.isBaja) {
        const lugCount = 20;
        const lugGeo = new THREE.BoxGeometry(tW * 0.36, 22, 13);
        for (let l = 0; l < lugCount; l++) {
          const ang = (l / lugCount) * Math.PI * 2;
          const rowSign = (l % 2 === 0) ? 1 : -1;
          const lug = new THREE.Mesh(lugGeo, ST.mats.tireTread);
          lug.position.set(rowSign * tW * 0.22, Math.cos(ang) * (tR - 2), Math.sin(ang) * (tR - 2));
          lug.rotation.x = ang;
          spinGrp.add(lug);
        }
      }

      const rimGrp = new THREE.Group();
      rimGrp.position.set(etOff, 0, 0);
      const barrelMesh = new THREE.Mesh(geos.barrelGeo, ST.mats.rim);
      barrelMesh.castShadow = true;
      rimGrp.add(barrelMesh);

      const spokeX = tW * 0.5 - (co.isBaja ? 32 : 24);
      if (co.isGT3) {
        const pairCount = 5;
        for (let s = 0; s < pairCount; s++) {
          const baseAng = (s / pairCount) * Math.PI * 2;
          for (const da of [-0.17, 0.17]) {
            const ang = baseAng + da;
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(10, 12, rimR * 0.88), ST.mats.rim);
            spoke.position.set(spokeX, Math.cos(ang) * rimR * 0.49, Math.sin(ang) * rimR * 0.49);
            spoke.rotation.x = ang + Math.PI / 2 + da * 0.65;
            rimGrp.add(spoke);
          }
        }
      } else {
        const spokeCount = co.isBaja ? 6 : 8;
        for (let s = 0; s < spokeCount; s++) {
          const ang = (s / spokeCount) * Math.PI * 2;
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(10, co.isBaja ? 20 : 15, rimR * 0.92), ST.mats.rim);
          spoke.position.set(spokeX, Math.cos(ang) * rimR * 0.48, Math.sin(ang) * rimR * 0.48);
          spoke.rotation.x = ang + Math.PI / 2;
          rimGrp.add(spoke);
        }
      }
      if (co.isBaja) {
        const beadRing = new THREE.Mesh(new THREE.TorusGeometry(rimR - 4, 5, 8, 28), ST.mats.aluminum);
        beadRing.rotation.y = Math.PI / 2;
        beadRing.position.set(tW * 0.5 - 10, 0, 0);
        rimGrp.add(beadRing);
      }

      const centerHub = new THREE.Mesh(new THREE.CylinderGeometry(28, 32, 34, 16), ST.mats.rim);
      centerHub.rotation.z = Math.PI / 2;
      centerHub.position.set(spokeX - 2, 0, 0);
      const centerNut = new THREE.Mesh(new THREE.CylinderGeometry(14, 17, 22, 6), ST.mats.centerLock);
      centerNut.rotation.z = Math.PI / 2;
      centerNut.position.set(spokeX + 16, 0, 0);
      rimGrp.add(centerHub, centerNut);

      spinGrp.add(rimGrp);
      carrierGrp.add(spinGrp);
      grp.add(carrierGrp);

      // 3D Force Overlay (Friction circle + horizontal traction vector + vertical Fz column)
      const forceGrp = new THREE.Group();
      const fricMat = new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false });
      const fricFillMat = new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.14, depthWrite: false });
      const vecHMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.90 });
      const vecZMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
      const fricRing = new THREE.Mesh(forceRingGeo, fricMat);
      const fricDisk = new THREE.Mesh(new THREE.CircleGeometry(1, 32), fricFillMat);
      fricDisk.position.z = -0.5;
      const vecHShaft = new THREE.Mesh(unitCyl, vecHMat);
      const vecHHead = new THREE.Mesh(forceConeGeo, vecHMat);
      const vecZCol = new THREE.Mesh(unitCyl, vecZMat);
      [fricRing, fricDisk, vecHShaft, vecHHead, vecZCol].forEach(m => { m._ownsMat = true; forceGrp.add(m); });
      forceGrp.visible = false;
      grp.add(forceGrp);

      ST.carRoot.add(grp);

      corners[key] = {
        key, axis, sx, grp, isDirect,
        lcaF, lcaR, ucaF, ucaR, strut, tieRod, halfshaft, joints,
        knk1, knk2, knk3,
        rockerMesh, rockerAxle, dmpBody, dmpShaft, springMesh, L_spr0,
        carrierGrp, spinGrp, calGroup, dR, discMesh,
        forceGrp, fricRing, fricDisk, vecHShaft, vecHHead, vecZCol,
        linkForceMats: null
      };
    });
    return corners;
  }

  function buildArbAssemblies(unitCyl) {
    const arbs = {};
    const arbGrp = new THREE.Group();
    for (const ax of ["front", "rear"]) {
      const bar = new THREE.Mesh(unitCyl, ST.mats.pushrod);
      const armR = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      const armL = new THREE.Mesh(unitCyl, ST.mats.aluminum);
      const dropR = new THREE.Mesh(unitCyl, ST.mats.tieRod);
      const dropL = new THREE.Mesh(unitCyl, ST.mats.tieRod);
      [bar, armR, armL, dropR, dropL].forEach(m => { m.castShadow = true; arbGrp.add(m); });
      arbs[ax] = { bar, armR, armL, dropR, dropL };
    }
    ST.carRoot.add(arbGrp);
    return { arbGrp, arbs };
  }

  function buildRcOverlay(unitSphere) {
    const rcGrp = new THREE.Group();
    const rcMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.92 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.85 });
    const frontDot = new THREE.Mesh(unitSphere, rcMat);
    const rearDot = new THREE.Mesh(unitSphere, rcMat);
    frontDot.scale.setScalar(18);
    rearDot.scale.setScalar(18);
    frontDot._ownsMat = true;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const rcLine = new THREE.Line(lineGeo, lineMat);
    rcLine._ownsMat = true;
    rcGrp.add(frontDot, rearDot, rcLine);
    rcGrp.visible = false;
    ST.carRoot.add(rcGrp);
    return { rcGrp, frontDot, rearDot, rcLine };
  }

  /* ============================================================================
     Formula SAE 完整三维总成构建
     ============================================================================ */

  // Asymmetric chamfered monocoque tub ring: narrow tapered keel at bottom (clears LCA & Rack) + crisp upper shoulder
  function tubSectionRing(y, rxTop, rxBot, zBot, zSplit, zTop, nPts) {
    const pts = [];
    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * Math.PI * 2;
      const ct = Math.cos(th), st = Math.sin(th);
      const sx = Math.sign(ct), ax = Math.abs(ct);
      let x, z;
      if (st >= 0) {
        // Upper sculpted dome above zSplit
        const rx = rxTop * 0.96;
        x = sx * Math.pow(ax, 0.42) * rx;
        z = zSplit + Math.pow(st, 0.52) * (zTop - zSplit);
      } else {
        // Lower V-tapered carbon belly from zSplit down to flat bottom keel zBot
        const tDown = -st; // 0 at waist -> 1 at bottom center
        const rxAtZ = rxTop * (1 - tDown) + rxBot * tDown;
        x = sx * Math.pow(ax, 0.30) * rxAtZ;
        z = zSplit - Math.pow(tDown, 0.65) * (zSplit - zBot);
      }
      pts.push([x, y, z]);
    }
    return pts;
  }

  function buildFormulaCar() {
    clearGroup(ST.carRoot);

    const wb = S.wb || 1550;
    const yF = wb * 0.5;
    const yR = -wb * 0.5;
    const hpF = S.front.hp, hpR = S.rear.hp;
    const tRf = S.front.tire.R || 230;
    const tWf = S.front.tire.W || 175;
    const tRr = S.rear.tire.R || 235;
    const tWr = S.rear.tire.W || 205;

    // Hardpoint-derived safe chassis envelopes (guarantees zero wishbone/rocker/rack/tire interpenetration)
    const fLcaX = Math.min(Math.abs(hpF.LCA_F[0]), Math.abs(hpF.LCA_R[0]));
    const fRackX = Math.abs(hpF.RACK[0]);
    const fUcaX = Math.min(Math.abs(hpF.UCA_F[0]), Math.abs(hpF.UCA_R[0]));
    const fRckX = Math.min(Math.abs(hpF.RCK_AX_A[0]), Math.abs(hpF.RCK_AX_B[0]));
    const fSafeBotX = Math.max(85, Math.min(fLcaX, fRackX) - 22);   // ~153 mm at bottom arms
    const fSafeMidX = Math.max(96, Math.min(fUcaX, fRckX) - 24);    // ~171 mm at upper bay

    const rLcaX = Math.min(Math.abs(hpR.LCA_F[0]), Math.abs(hpR.LCA_R[0]));
    const rRackX = Math.abs(hpR.RACK[0]);
    const rUcaX = Math.min(Math.abs(hpR.UCA_F[0]), Math.abs(hpR.UCA_R[0]));
    const rRckX = Math.min(Math.abs(hpR.RCK_AX_A[0]), Math.abs(hpR.RCK_AX_B[0]));
    const rSafeBotX = Math.max(84, Math.min(rLcaX, rRackX) - 22);   // ~148 mm at rear lower bay
    const rSafeMidX = Math.max(92, Math.min(rUcaX, rRckX) - 26);    // ~164 mm at rear upper bay

    const unitCyl = createUnitCylinder();
    const unitSphere = new THREE.SphereGeometry(1, 12, 10);

    const aeroBodyGroup = new THREE.Group();
    const paintMeshes = [];
    const carbonMeshes = [];
    const accentMeshes = [];

    const addBody = (geo, mat, list) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      aeroBodyGroup.add(m);
      if (list) list.push(m);
      return m;
    };

    // Longitudinal stations (mm)
    const Y_tip  = yF + 595;
    const Y_ia   = yF + 485;
    const Y_fbh  = yF + 235;
    const Y_fh   = yF - 205;
    const Y_mh   = yR + 510;
    const Y_tail = yR - 235;

    // ------------------------------------------------------------------------
    // 1. 一体化无缝单体壳（鼻锥 → 开放式碳纤驾驶舱 → 后引擎/电池罩，单一连续网格零重叠！）
    // ------------------------------------------------------------------------
    const noseFullW = Math.max(242, fRckX + 46); // ~242 mm wraps front rockers & pushrod inner joints cleanly inside
    const rearFullW = Math.max(238, rRckX + 46); // ~238 mm wraps rear rockers, dampers & differential cleanly inside
    const fKeelHalf = Math.min(150, fSafeBotX + 6);

    const monoStations = [
      // Nosecone (closed smooth convex dome; r=0 tip pure paint, r>=1 two-tone carbon belly + accent center stripe)
      { y: Y_tip,           rx: 24,            rxBot: 18,             zBot: 148, zSplit: 166, zTop: 178, zCrown: 186, open: 0,    stripe: false },
      { y: Y_tip - 55,      rx: 64,            rxBot: 44,             zBot: 104, zSplit: 162, zTop: 200, zCrown: 216, open: 0,    stripe: true  },
      { y: Y_ia,            rx: 96,            rxBot: 66,             zBot:  78, zSplit: 160, zTop: 226, zCrown: 244, open: 0,    stripe: true  },
      { y: Y_fbh + 75,      rx: 148,           rxBot: 104,            zBot:  60, zSplit: 158, zTop: 274, zCrown: 296, open: 0,    stripe: true  },
      { y: Y_fbh,           rx: 188,           rxBot: 136,            zBot:  52, zSplit: 160, zTop: 322, zCrown: 346, open: 0,    stripe: true  },
      { y: yF + 115,        rx: noseFullW - 6, rxBot: fKeelHalf,      zBot:  50, zSplit: 164, zTop: 370, zCrown: 394, open: 0,    stripe: true  },
      { y: yF + 42,         rx: noseFullW,     rxBot: fKeelHalf + 8,  zBot:  50, zSplit: 168, zTop: 404, zCrown: 428, open: 0,    stripe: true  },
      { y: yF - 80,         rx: 238,           rxBot: 176,            zBot:  50, zSplit: 172, zTop: 456, zCrown: 480, open: 0,    stripe: true  },
      { y: Y_fh + 18,       rx: 232,           rxBot: 184,            zBot:  50, zSplit: 176, zTop: 498, zCrown: 516, open: 0,    stripe: true  },
      // Seamless front cockpit rim transition (continuous shared vertices -> zero crack / zero overlap!)
      { y: Y_fh - 2,        rx: 232,           rxBot: 188,            zBot:  50, zSplit: 176, zTop: 508, zCrown: 520, open: 0.06, rxIn: 112, zFloor: 455 },
      { y: Y_fh - 24,       rx: 236,           rxBot: 192,            zBot:  50, zSplit: 176, zTop: 508, zCrown: 516, open: 0.50, rxIn: 152, zFloor: 210 },
      { y: Y_fh - 56,       rx: 242,           rxBot: 198,            zBot:  50, zSplit: 174, zTop: 504, zCrown: 508, open: 1.0,  rxIn: 172, zFloor:  64 },
      // Open cockpit U-tub (matte carbon interior, glossy painted outer wall & rolled coaming)
      { y: Y_fh - 135,      rx: 250,           rxBot: 206,            zBot:  48, zSplit: 170, zTop: 498, zCrown: 502, open: 1.0,  rxIn: 184, zFloor:  60 },
      { y: (Y_fh + Y_mh)/2, rx: 256,           rxBot: 212,            zBot:  48, zSplit: 168, zTop: 494, zCrown: 498, open: 1.0,  rxIn: 188, zFloor:  60 },
      { y: Y_mh + 145,      rx: 254,           rxBot: 210,            zBot:  48, zSplit: 170, zTop: 514, zCrown: 518, open: 1.0,  rxIn: 186, zFloor:  64 },
      // Seamless rear firewall transition back into closed engine cover
      { y: Y_mh + 62,       rx: 248,           rxBot: 202,            zBot:  48, zSplit: 172, zTop: 542, zCrown: 548, open: 0.78, rxIn: 166, zFloor: 165 },
      { y: Y_mh + 22,       rx: 244,           rxBot: 196,            zBot:  48, zSplit: 174, zTop: 558, zCrown: 568, open: 0.24, rxIn: 128, zFloor: 435 },
      { y: Y_mh - 8,        rx: 242,           rxBot: 190,            zBot:  48, zSplit: 174, zTop: 552, zCrown: 574, open: 0 },
      // Smooth full-bodied rear engine/battery cowling enclosing rear rockers, dampers & differential
      { y: Y_mh - 115,      rx: 236,           rxBot: 180,            zBot:  52, zSplit: 170, zTop: 526, zCrown: 552, open: 0 },
      { y: yR + 185,        rx: rearFullW,     rxBot: 174,            zBot:  54, zSplit: 168, zTop: 468, zCrown: 494, open: 0 },
      { y: yR + 40,         rx: rearFullW,     rxBot: 164,            zBot:  58, zSplit: 168, zTop: 392, zCrown: 418, open: 0 },
      { y: yR - 95,         rx: 162,           rxBot: 116,            zBot:  84, zSplit: 165, zTop: 298, zCrown: 318, open: 0 },
      { y: Y_tail + 18,     rx: 92,            rxBot:  72,            zBot: 130, zSplit: 172, zTop: 236, zCrown: 250, open: 0 }
    ];

    const bodyMats = [ST.mats.paint, ST.mats.carbon, ST.mats.accent, ST.mats.darkTrim];
    const monoRings = monoStations.map(monocoqueRing);
    const monoGeo = buildMultiMatLoftGeometry(monoRings, true, (r, p) => {
      const s0 = monoStations[r], s1 = monoStations[r + 1];
      if (r >= 1 && (p <= 3 || p >= 28)) return 1; // lower carbon belly skirt
      if ((s0.open > 0.02 || s1.open > 0.02) && p >= 10 && p <= 21) return 1; // carbon cockpit interior tub
      if (s0.stripe && s1.stripe && p >= 14 && p <= 17) return 2; // flush center nose racing stripe
      return 0; // glossy painted upper bodywork
    }, [0, 1]);
    const monoMesh = new THREE.Mesh(monoGeo, bodyMats);
    monoMesh.castShadow = true;
    monoMesh.receiveShadow = true;
    aeroBodyGroup.add(monoMesh);
    paintMeshes.push(monoMesh);

    // ------------------------------------------------------------------------
    // 2. 驾驶舱内部桶形座椅（无车手）+ 低阻碳纤后视镜 (Carbon Seat & Aero Mirrors, NO Driver)
    // ------------------------------------------------------------------------
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(270, 32, 385), ST.mats.carbon);
    seatBack.position.set(0, Y_mh + 150, 290);
    seatBack.rotation.x = 0.38;
    seatBack.castShadow = true;
    const seatPan = new THREE.Mesh(new THREE.BoxGeometry(276, 285, 22), ST.mats.darkTrim);
    seatPan.position.set(0, Y_mh + 295, 88);
    seatPan.rotation.x = -0.14;
    [-128, 128].forEach(bx => {
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(24, 72, 260), ST.mats.darkTrim);
      bolster.position.set(bx, Y_mh + 178, 262);
      bolster.rotation.x = 0.38;
      aeroBodyGroup.add(bolster);
    });
    const headrest = new THREE.Mesh(new THREE.BoxGeometry(152, 40, 128), ST.mats.darkTrim);
    headrest.position.set(0, Y_mh + 58, 635);
    headrest.castShadow = true;
    const headrestShell = new THREE.Mesh(new THREE.BoxGeometry(172, 24, 152), ST.mats.paint);
    headrestShell.position.set(0, Y_mh + 34, 638);
    aeroBodyGroup.add(seatBack, seatPan, headrest, headrestShell);
    carbonMeshes.push(seatBack);
    paintMeshes.push(headrestShell);

    // Empty driverGroup retained solely for external visibility interface compatibility (no driver rendered)
    const driverGroup = new THREE.Group();

    // Compact FSAE aero carbon mirrors neatly tucked at cockpit front shoulders
    [-1, 1].forEach(side => {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 10), ST.mats.carbon);
      stalk.position.set(222 * side, Y_fh - 68, 510);
      stalk.rotation.z = 0.22 * side;
      const housing = new THREE.Mesh(new THREE.SphereGeometry(25, 14, 10), ST.mats.carbon);
      housing.scale.set(1.25, 0.72, 0.58);
      housing.position.set(250 * side, Y_fh - 64, 522);
      housing.castShadow = true;
      aeroBodyGroup.add(stalk, housing);
      carbonMeshes.push(stalk, housing);
    });

    // ------------------------------------------------------------------------
    // 3. 敞开式管状主防滚环 + 鲨鱼鳍 + 后防撞结构 (Tubular Main Roll Hoop + Shark Fin + Crash Box)
    // ------------------------------------------------------------------------
    const hoopPts = [
      new THREE.Vector3(-224, Y_mh, 85),
      new THREE.Vector3(-230, Y_mh, 420),
      new THREE.Vector3(-135, Y_mh - 8, 905),
      new THREE.Vector3(0,    Y_mh - 12, 965),
      new THREE.Vector3(135,  Y_mh - 8, 905),
      new THREE.Vector3(230,  Y_mh, 420),
      new THREE.Vector3(224,  Y_mh, 85)
    ];
    const hoopGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoopPts), 40, 17, 12, false);
    addBody(hoopGeo, ST.mats.darkTrim);

    // High-visibility FSAE top marshal/towing loop marker on roll hoop crown
    const topTag = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 34), ST.mats.accent);
    topTag.position.set(0, Y_mh - 12, 982);
    aeroBodyGroup.add(topTag);
    accentMeshes.push(topTag);

    // Twin main roll hoop diagonal rear stays anchored cleanly into rear cowling
    [-125, 125].forEach(sx => {
      const stay = new THREE.Mesh(unitCyl, ST.mats.darkTrim);
      const pA = [sx * 0.92, Y_mh - 8, 895], pB = [sx * 0.76, yR + 150, 325];
      orientBetween(stay, pA, pB, 13);
      stay.castShadow = true;
      aeroBodyGroup.add(stay);
    });

    // Clean Shark Fin spine connecting headrest fairing to rear crashbox along upper centerline
    const sharkFin = makeExtrudedPlateYZ([
      [Y_mh - 35, 745], [yR + 120, 485], [yR - 140, 335], [yR - 140, 245], [Y_mh - 35, 480]
    ], 12);
    addBody(sharkFin, ST.mats.carbon, carbonMeshes);

    // Compact Rear Gearbox / Crash Box + FIA Red LED Rain Light
    const crashBox = new THREE.Mesh(new THREE.BoxGeometry(138, 125, 120), ST.mats.carbon);
    crashBox.position.set(0, Y_tail - 30, 192);
    crashBox.castShadow = true;
    aeroBodyGroup.add(crashBox);
    carbonMeshes.push(crashBox);

    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(54, 16, 44), ST.mats.rainLight);
    rainLight.position.set(0, Y_tail - 94, 194);
    aeroBodyGroup.add(rainLight);

    // ------------------------------------------------------------------------
    // 4. 一体化收腰侧箱 + 导流鳍 (Single-Mesh Multi-Material Sidepods — Zero Lip Overlap!)
    // ------------------------------------------------------------------------
    const spFrontY = Math.min(Y_fh - 35, yF - tRf - 130);
    const spRearY  = yR + tRr + 68;
    const spMidY   = (spFrontY + spRearY) * 0.5;
    const spSpanY  = spFrontY - spRearY;

    [-1, 1].forEach(side => {
      // Single continuous multi-material sidepod: recessed radiator core -> carbon intake lip -> painted undercut body!
      const spStations = [
        [spFrontY + 4,             44, 102, 278, 294 * side], // r=0: recessed radiator throat core
        [spFrontY + 24,            58,  84, 302, 296 * side], // r=1: carbon intake outer lip
        [spFrontY,                 68,  72, 316, 300 * side], // r=2: painted cowl transition
        [spFrontY - spSpanY*0.18, 108,  56, 338, 326 * side],
        [spMidY,                  116,  50, 335, 322 * side],
        [spRearY + spSpanY*0.24,   90,  52, 305, 278 * side],
        [spRearY + 45,             58,  58, 255, 225 * side],
        [spRearY,                  36,  68, 208, 178 * side]
      ];
      const spRings = spStations.map(s => superSectionRing(s[0], s[1], s[2], s[3], 0.36, 0.28, 22, s[4]));
      const spGeo = buildMultiMatLoftGeometry(spRings, true, (r, p) => {
        if (r === 0) return 3; // dark recessed radiator intake throat
        if (r === 1) return 1; // carbon intake bezel lip
        if (p >= 12 && p <= 20) return 1; // lower carbon undercut skirt
        return 0; // glossy painted outer sidepod
      }, [3, 0]);
      const spMesh = new THREE.Mesh(spGeo, bodyMats);
      spMesh.castShadow = true;
      spMesh.receiveShadow = true;
      aeroBodyGroup.add(spMesh);
      paintMeshes.push(spMesh);

      // Twin curved aero turning vanes ahead of sidepod (matching reference e77659f6)
      [0, 1].forEach(vi => {
        const vane = makeExtrudedPlateYZ([
          [spFrontY + 90 - vi * 36, 48],
          [spFrontY + 68 - vi * 36, 158 - vi * 20],
          [spFrontY + 18 - vi * 30, 148 - vi * 20],
          [spFrontY + 12 - vi * 30, 48]
        ], 6);
        vane.translate((292 + vi * 70) * side, 0, 0);
        vane.rotateZ(-0.16 * side);
        addBody(vane, ST.mats.carbon, carbonMeshes);
      });

      // Sidepod upper exit louver slots
      for (let v = 0; v < 4; v++) {
        const louver = new THREE.Mesh(new THREE.BoxGeometry(92, 16, 6), ST.mats.darkTrim);
        louver.position.set(314 * side, spMidY - 55 - v * 38, 330 - v * 5);
        louver.rotation.x = 0.28;
        aeroBodyGroup.add(louver);
      }
    });

    // ------------------------------------------------------------------------
    // 5. 碳纤维平底板 + 后悬后置扩散器 (Carbon Undertray Floor + Clear Rear Diffuser)
    // ------------------------------------------------------------------------
    // Floor stays narrow (<= fSafeBotX / rSafeBotX) around front & rear suspension bays, wide only between axles!
    const fFloorClearY = yF - tRf - 65;
    const rFloorClearY = yR + tRr + 50;
    const floorShape = new THREE.Shape();
    const fW_front = Math.min(116, fSafeBotX - 24);
    const fW_side  = 450;
    const fW_rearSpine = Math.min(126, rSafeBotX - 20); // strictly narrower than rear LCA & Rack!
    floorShape.moveTo(-fW_front, yF + 135);
    floorShape.lineTo( fW_front, yF + 135);
    floorShape.lineTo( fW_front + 22, fFloorClearY + 35);
    floorShape.lineTo( fW_side, spFrontY + 75);
    floorShape.lineTo( fW_side, spRearY - 12);
    floorShape.lineTo( fW_rearSpine, rFloorClearY - 35);
    floorShape.lineTo( fW_rearSpine, yR - 140);
    floorShape.lineTo(-fW_rearSpine, yR - 140);
    floorShape.lineTo(-fW_rearSpine, rFloorClearY - 35);
    floorShape.lineTo(-fW_side, spRearY - 12);
    floorShape.lineTo(-fW_side, spFrontY + 75);
    floorShape.lineTo(-fW_front - 22, fFloorClearY + 35);
    floorShape.closePath();

    const floorGeo = new THREE.ExtrudeGeometry(floorShape, { depth: 10, bevelEnabled: true, bevelSegments: 1, bevelSize: 2, bevelThickness: 1.5 });
    const fUv = floorGeo.attributes.uv;
    if (fUv) {
      for (let i = 0; i < fUv.count; i++) fUv.setXY(i, fUv.getX(i) / 600, fUv.getY(i) / 600);
    }
    const floorMesh = new THREE.Mesh(floorGeo, ST.mats.carbon);
    floorMesh.position.set(0, 0, 38);
    floorMesh.castShadow = true;
    floorMesh.receiveShadow = true;
    aeroBodyGroup.add(floorMesh);
    carbonMeshes.push(floorMesh);

    // Side floor edge aero flicks cleanly ahead of rear tires
    [-1, 1].forEach(side => {
      const fence = makeExtrudedPlateYZ([
        [spRearY + 125, 48], [spRearY + 75, 138], [spRearY - 8, 108], [spRearY - 12, 48]
      ], 8);
      fence.translate((fW_side - 6) * side, 0, 0);
      addBody(fence, ST.mats.carbon, carbonMeshes);
    });

    // ------------------------------------------------------------------------
    // 6. 双层翼型前翼 + 中心桥拱 + 远胎端板 (Gull-Wing Multi-Element Front Wing — Zero Tire Overlap!)
    // ------------------------------------------------------------------------
    const fwSpan = Math.max(1220, (hpF.WC[0] + tWf * 0.5) * 2 - 20);
    const fwHalf = fwSpan * 0.5;
    // Trailing edge of mainplane/endplates stays strictly >= yF + tRf + 68 ahead of front tires!
    const fwTrailClearY = yF + tRf + 68;
    const fwLeadY = Math.max(yF + 645, fwTrailClearY + 340);
    const fwY = (fwLeadY + fwTrailClearY) * 0.5 + 45;

    // Lower carbon mainplane + subtle silver/accent front splitter lip
    const fwMain = makeAirfoilGeo(215, 22, 14, 4, fwSpan);
    const fwMainM = addBody(fwMain, ST.mats.carbon, carbonMeshes);
    fwMainM.position.set(0, fwY, 64);

    const fwLip = new THREE.Mesh(new THREE.BoxGeometry(fwSpan - 16, 16, 8), ST.mats.accent);
    fwLip.position.set(0, fwY + 106, 62);
    aeroBodyGroup.add(fwLip);
    accentMeshes.push(fwLip);

    // Separate left & right outer upper flaps cleanly flanking the nosecone (never cutting through nose or tire!)
    const flapInX = 128;
    const outerFlapSpan = Math.max(240, fwHalf - flapInX - 10);
    const outerFlapMidX = flapInX + outerFlapSpan * 0.5;
    [-1, 1].forEach(side => {
      const f1 = makeAirfoilGeo(110, 14, 9, 18, outerFlapSpan);
      const f1M = addBody(f1, ST.mats.carbon, carbonMeshes);
      f1M.position.set(outerFlapMidX * side, Math.max(fwTrailClearY + 95, fwY - 115), 96);

      const f2 = makeAirfoilGeo(88, 11, 7, 30, outerFlapSpan - 12);
      const f2M = addBody(f2, ST.mats.paint, paintMeshes);
      f2M.position.set((outerFlapMidX + 4) * side, Math.max(fwTrailClearY + 42, fwY - 180), 136);
    });

    // Front wing nose pylons anchored strictly inside carbon belly width (zero nose-tip side poke!)
    [-34, 34].forEach(px => {
      const pylon = makeExtrudedPlateYZ([
        [fwY + 20, 70], [fwY - 95, 72], [fwY - 95, 152], [fwY - 15, 146]
      ], 10);
      pylon.translate(px, 0, 0);
      addBody(pylon, ST.mats.carbon, carbonMeshes);
    });

    // Sculpted trapezoidal carbon endplates + painted side chevrons (trailing edge >= fwTrailClearY -> 68mm clear of tire!)
    const epFrontY = fwY + 122;
    const epRearY  = fwTrailClearY;
    [-1, 1].forEach(side => {
      const ep = makeExtrudedPlateYZ([
        [epFrontY, 50], [epRearY, 50], [epRearY, 210], [epRearY + 85, 208], [epFrontY - 35, 118]
      ], 12);
      ep.translate(fwHalf * side, 0, 0);
      addBody(ep, ST.mats.carbon, carbonMeshes);

      const epTrim = makeExtrudedPlateYZ([
        [epFrontY - 55, 62], [epRearY + 12, 62], [epRearY + 12, 165], [epRearY + 95, 165]
      ], 4);
      epTrim.translate((fwHalf + 6) * side, 0, 0);
      addBody(epTrim, ST.mats.paint, paintMeshes);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(52, epFrontY - epRearY - 12, 9), ST.mats.carbon);
      foot.position.set((fwHalf - 16) * side, (epFrontY + epRearY) * 0.5, 52);
      aeroBodyGroup.add(foot);
      carbonMeshes.push(foot);
    });

    // ------------------------------------------------------------------------
    // 7. 曲臂端板尾翼 + DRS 副翼 (Swan-Swept Rear Wing Mounted Strictly Behind Axle/Tires!)
    // ------------------------------------------------------------------------
    const rwSpan = Math.max(1020, (hpR.WC[0] + tWr * 0.42) * 2 - 44);
    const rwHalf = rwSpan * 0.5;
    const rwY = yR - 265;
    const rwZ = 830;

    const rwMain  = makeAirfoilGeo(235, 28, 22, 8, rwSpan);
    const rwFlap1 = makeAirfoilGeo(130, 16, 11, 22, rwSpan - 18);
    const rwFlap2 = makeAirfoilGeo(110, 14, 9,  34, rwSpan - 18);

    const rwMainM = addBody(rwMain, ST.mats.carbon, carbonMeshes);
    rwMainM.position.set(0, rwY + 35, rwZ);
    const rwFlap1M = addBody(rwFlap1, ST.mats.carbon, carbonMeshes);
    rwFlap1M.position.set(0, rwY - 82, rwZ + 54);
    const rwFlap2M = addBody(rwFlap2, ST.mats.paint, paintMeshes);
    rwFlap2M.position.set(0, rwY - 146, rwZ + 118);

    // Tall Rear Wing Endplates supported cleanly on twin central carbon pylons (zero overlap with rear tires or rockers!)
    [-1, 1].forEach(side => {
      const ep = makeExtrudedPlateYZ([
        [rwY + 145, rwZ - 160], [rwY - 125, rwZ - 105], [rwY - 225, rwZ - 45], [rwY - 225, rwZ + 215], [rwY + 125, rwZ + 185]
      ], 14);
      ep.translate(rwHalf * side, 0, 0);
      addBody(ep, ST.mats.carbon, carbonMeshes);

      // Painted upper endplate trim stripe
      const epPaint = makeExtrudedPlateYZ([
        [rwY + 110, rwZ + 15], [rwY - 210, rwZ + 35], [rwY - 210, rwZ + 195], [rwY + 100, rwZ + 165]
      ], 4);
      epPaint.translate((rwHalf + 7) * side, 0, 0);
      addBody(epPaint, ST.mats.paint, paintMeshes);

      // Sleek twin rear wing mounting pylons anchored strictly BEHIND rear axle & rockers (Y <= yR - 170!)
      const pylon = makeExtrudedPlateYZ([
        [yR - 175, 220], [yR - 310, 220], [rwY - 55, rwZ + 18], [rwY + 45, rwZ + 12]
      ], 12);
      pylon.translate(92 * side, 0, 0);
      addBody(pylon, ST.mats.carbon, carbonMeshes);
    });

    // Lower beam wing connecting rear pylons cleanly behind R_LCA_R
    const beamWing = makeAirfoilGeo(115, 14, 9, 12, 460);
    const beamWingM = addBody(beamWing, ST.mats.carbon, carbonMeshes);
    beamWingM.position.set(0, yR - 265, 340);

    ST.carRoot.add(aeroBodyGroup);

    // ------------------------------------------------------------------------
    // 8. 内部空间管架 + 电驱总成 + 转向管柱方向盘 (Frame + EDU + Steering)
    // ------------------------------------------------------------------------
    const frameGroup = new THREE.Group();
    const addTube = (grp, a, b, r, mat) => {
      const m = new THREE.Mesh(unitCyl, mat);
      orientBetween(m, a, b, r);
      m.castShadow = true;
      grp.add(m);
      return m;
    };

    const FBH_Y = yF + 235, IA_Y = FBH_Y + 200;
    const FBH_TL = [-120, FBH_Y, 265], FBH_TR = [120, FBH_Y, 265], FBH_BL = [-125, FBH_Y, 72], FBH_BR = [125, FBH_Y, 72];
    const IA_TL = [-80, IA_Y, 215], IA_TR = [80, IA_Y, 215], IA_BL = [-85, IA_Y, 88], IA_BR = [85, IA_Y, 88];
    const FH_Y = yF - 205, CC_Y = (yF + yR) / 2 + 40, MH_Y = yR + 510;
    const FH_TopL = [-142, FH_Y, 500], FH_TopR = [142, FH_Y, 500], FH_ML = [-185, FH_Y, 330], FH_MR = [185, FH_Y, 330], FH_BL = [-175, FH_Y, 62], FH_BR = [175, FH_Y, 62];
    const CC_TL = [-235, CC_Y, 360], CC_TR = [235, CC_Y, 360], CC_BL = [-235, CC_Y, 58], CC_BR = [235, CC_Y, 58];
    const MH_ML = [-235, MH_Y, 380], MH_MR = [235, MH_Y, 380], MH_BL = [-235, MH_Y, 55], MH_BR = [235, MH_Y, 55];

    const fFront = new THREE.Group();
    [[FBH_TL,FBH_TR,12],[FBH_BL,FBH_BR,12],[FBH_TL,FBH_BL,12],[FBH_TR,FBH_BR,12],[FBH_TL,FBH_BR,9],
     [IA_TL,IA_TR,8],[IA_BL,IA_BR,8],[IA_TL,IA_BL,8],[IA_TR,IA_BR,8],[FBH_TL,IA_TL,8],[FBH_TR,IA_TR,8],[FBH_BL,IA_BL,8],[FBH_BR,IA_BR,8],
     [FH_BL,FH_ML,13],[FH_ML,FH_TopL,13],[FH_TopL,FH_TopR,13],[FH_TopR,FH_MR,13],[FH_MR,FH_BR,13],[FH_BL,FH_BR,13],[FH_ML,FH_MR,10]
    ].forEach(t => addTube(fFront, t[0], t[1], t[2], ST.mats.steelTube));
    frameGroup.add(fFront);

    const fSide = new THREE.Group();
    [[FH_ML,CC_TL,12],[FH_MR,CC_TR,12],[CC_TL,MH_ML,12],[CC_TR,MH_MR,12],
     [FH_BL,CC_BL,13],[FH_BR,CC_BR,13],[CC_BL,MH_BL,13],[CC_BR,MH_BR,13],
     [FH_ML,CC_BL,10],[FH_MR,CC_BR,10],[CC_TL,MH_BL,10],[CC_TR,MH_BR,10],
     [CC_TL,CC_BL,10],[CC_TR,CC_BR,10],[CC_BL,CC_BR,12],[MH_BL,MH_BR,13]
    ].forEach(t => addTube(fSide, t[0], t[1], t[2], ST.mats.steelTube));
    frameGroup.add(fSide);

    const fMain = new THREE.Group();
    for (let i = 0; i < hoopPts.length - 1; i++) {
      addTube(fMain, [hoopPts[i].x, hoopPts[i].y, hoopPts[i].z], [hoopPts[i+1].x, hoopPts[i+1].y, hoopPts[i+1].z], 15, ST.mats.steelTube);
    }
    addTube(fMain, MH_ML, MH_MR, 12, ST.mats.steelTube);
    frameGroup.add(fMain);

    const fRear = new THREE.Group();
    const RSB2_Y = yR - 155;
    const RSB_TL = [-115, RSB2_Y, 270], RSB_TR = [115, RSB2_Y, 270], RSB_BL = [-125, RSB2_Y, 68], RSB_BR = [125, RSB2_Y, 68];
    [[RSB_TL,RSB_TR,11],[RSB_BL,RSB_BR,12],[RSB_TL,RSB_BL,11],[RSB_TR,RSB_BR,11],[RSB_TL,RSB_BR,9]
    ].forEach(t => addTube(fRear, t[0], t[1], t[2], ST.mats.steelTube));
    frameGroup.add(fRear);
    ST.carRoot.add(frameGroup);

    // Powertrain EDU (tucked cleanly forward of rear suspension bay so dampers stay exposed!)
    const powertrainGroup = new THREE.Group();
    const rMotor = new THREE.Mesh(new THREE.BoxGeometry(185, 165, 145), ST.mats.edu);
    rMotor.position.set(0, yR + 225, 215);
    const rCyl = new THREE.Mesh(new THREE.CylinderGeometry(64, 64, 185, 16), ST.mats.edu);
    rCyl.rotation.z = Math.PI / 2;
    rCyl.position.set(0, yR + 225, 215);
    const rDiff = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 104, 14), ST.mats.darkTrim);
    rDiff.rotation.z = Math.PI / 2;
    rDiff.position.set(0, yR, 232); // compact differential housing cleanly clear of rear springs/dampers!
    const rInv = new THREE.Mesh(new THREE.BoxGeometry(165, 115, 52), ST.mats.darkTrim);
    rInv.position.set(0, yR + 245, 315);
    powertrainGroup.add(rMotor, rCyl, rDiff, rInv);
    ST.carRoot.add(powertrainGroup);

    // Steering Rack, Column & Rotating Butterfly Steering Wheel
    const steerGroup = new THREE.Group();
    const rackY = hpF.RACK[1] + yF;
    const rackZ = hpF.RACK[2];
    const rackHousing = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, Math.min(285, fRackX * 1.65), 14), ST.mats.darkTrim);
    rackHousing.rotation.z = Math.PI / 2;
    rackHousing.position.set(0, rackY, rackZ);
    const rackRod = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, hpF.RACK[0] * 2, 12), ST.mats.aluminum);
    rackRod.rotation.z = Math.PI / 2;
    rackRod.position.set(0, rackY, rackZ);
    steerGroup.add(rackHousing, rackRod);

    const pPinion = [0, rackY + 25, rackZ + 45];
    const pUJoint = [0, yF - 205, rackZ + 160];
    const pWheelC = [0, yF - 370, rackZ + 255];
    addTube(steerGroup, pPinion, pUJoint, 10, ST.mats.aluminum);
    addTube(steerGroup, pUJoint, pWheelC, 12, ST.mats.aluminum);

    // Butterfly steering wheel assembly aligned to column axis
    const swPivot = new THREE.Group();
    swPivot.position.set(pWheelC[0], pWheelC[1], pWheelC[2]);
    const colDir = new THREE.Vector3(pWheelC[0] - pUJoint[0], pWheelC[1] - pUJoint[1], pWheelC[2] - pUJoint[2]).normalize();
    swPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), colDir);

    const swSpin = new THREE.Group();
    const swPlate = new THREE.Mesh(new THREE.BoxGeometry(265, 130, 14), ST.mats.carbon);
    const swGripL = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 108, 12), ST.mats.darkTrim);
    swGripL.position.set(-128, 0, 4);
    const swGripR = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 108, 12), ST.mats.darkTrim);
    swGripR.position.set(128, 0, 4);
    const swDash = new THREE.Mesh(new THREE.BoxGeometry(78, 44, 8), new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));
    swDash.position.set(0, 26, 7);
    const swHub = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 32, 14), ST.mats.pushrod);
    swHub.rotation.x = Math.PI / 2;
    swHub.position.set(0, 0, -14);
    swSpin.add(swPlate, swGripL, swGripR, swDash, swHub);
    swPivot.add(swSpin);
    steerGroup.add(swPivot);
    ST.carRoot.add(steerGroup);

    // ------------------------------------------------------------------------
    // 9. 四轮独立悬架 + 摇臂推杆 + 螺旋弹簧 + ARB + 受力叠层
    // ------------------------------------------------------------------------
    const corners = buildSuspensionCorners(unitCyl, unitSphere, { isFormula: true });
    const { arbGrp, arbs } = buildArbAssemblies(unitCyl);
    const rcOverlay = buildRcOverlay(unitSphere);

    ST.parts = {
      vehicleType: "formula",
      isOpenFrame: false,
      aeroBodyGroup, paintMeshes, carbonMeshes, accentMeshes,
      driverGroup, rwFlap2M, rwFlap2BaseY: rwY - 146, rwFlap2BaseZ: rwZ + 118,
      frameGroup, fFront, fSide, fMain, fRear,
      powertrainGroup, steerGroup, rackRod, swSpin,
      arbGrp, arbs, rcOverlay,
      corners
    };
    ST.carKey = buildCarKey();
    applyMaterialModes();
  }

  /* ============================================================================
     SAE Baja 全地形越野赛车 3D 总成（管状防滚笼 + 直推螺旋避震 + 越野大花纹胎）
     ============================================================================ */
  function buildBajaCar() {
    clearGroup(ST.carRoot);

    const wb = S.wb || 1400;
    const yF = wb * 0.5;
    const yR = -wb * 0.5;
    const hpF = S.front.hp, hpR = S.rear.hp;
    const unitCyl = createUnitCylinder();
    const unitSphere = new THREE.SphereGeometry(1, 12, 10);

    const aeroBodyGroup = new THREE.Group();
    const paintMeshes = [], carbonMeshes = [], accentMeshes = [];
    const addBody = (geo, mat, list) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      aeroBodyGroup.add(m);
      if (list) list.push(m);
      return m;
    };

    // Parameterized clearances derived from hardpoints so coilovers & arms never clip cage
    const fLcaX = Math.min(Math.abs(hpF.LCA_F[0]), Math.abs(hpF.LCA_R[0]));
    const rLcaX = Math.min(Math.abs(hpR.LCA_F[0]), Math.abs(hpR.LCA_R[0]));
    const fRailX = Math.max(115, fLcaX - 18);
    const rRailX = Math.max(115, rLcaX - 18);
    const fDmpX = Math.abs(hpF.DMP_BODY[0]), fDmpY = yF + hpF.DMP_BODY[1], fDmpZ = hpF.DMP_BODY[2];
    const rDmpX = Math.abs(hpR.DMP_BODY[0]), rDmpY = yR + hpR.DMP_BODY[1], rDmpZ = hpR.DMP_BODY[2];
    const zBelly = Math.min(165, hpF.LCA_F[2] - 12, hpR.LCA_F[2] - 12);
    const wCock = 345;
    const zRoof = 1145;

    // 1. Sculpted Baja Nose Hood, Skid Plate, Side Panels, Roof Panel & LED Lightbar
    const hoodRings = [
      superSectionRing(yF + 325, 118, 255, 365, 1.35, 1.5, 22),
      superSectionRing(yF + 190, 148, 285, 435, 1.35, 1.5, 22),
      superSectionRing(yF + 15,  172, 325, 520, 1.4,  1.6, 22),
      superSectionRing(yF - 200, 235, 370, 625, 1.5,  1.7, 22)
    ];
    addBody(buildMultiMatLoftGeometry(hoodRings, true, (r, q, n) => {
      const th = (q / n) * Math.PI * 2;
      if (Math.sin(th) < -0.25) return 2; // dark under-hood tray
      if (Math.abs(Math.cos(th)) < 0.22 && Math.sin(th) > 0.35) return 1; // top center accent stripe
      return 0;
    }, [0, 2]), [ST.mats.paint, ST.mats.accent, ST.mats.darkTrim], paintMeshes);

    // Lower Aluminum Skid / Bash Plate (front nose up-kick -> flat cockpit belly -> rear engine tray)
    const skidPts = [
      superSectionRing(yF + 360, 115, 210, 240, 2.2, 2.2, 16),
      superSectionRing(yF + 80,  fRailX - 5, zBelly - 14, zBelly + 6, 2.2, 2.2, 16),
      superSectionRing(yF - 230, wCock * 0.72, zBelly - 16, zBelly + 4, 2.2, 2.2, 16),
      superSectionRing(yR + 220, wCock * 0.72, zBelly - 16, zBelly + 4, 2.2, 2.2, 16),
      superSectionRing(yR - 230, rRailX + 10, zBelly, zBelly + 24, 2.2, 2.2, 16)
    ];
    addBody(buildLoftGeometry(skidPts, true), ST.mats.skid, carbonMeshes);

    // Side Hip Number Plates + Rear Mudguard Wings + Roof Skin & Lightbar
    for (const sx of [-1, 1]) {
      const sidePanel = makeExtrudedPlateYZ([
        [yF - 235, 240], [yR + 480, 240], [yR + 360, 520], [yF - 245, 515]
      ], 14);
      const spM = addBody(sidePanel, ST.mats.paint, paintMeshes);
      spM.position.x = sx * (wCock + 10);

      const mudF = makeExtrudedPlateYZ([
        [yR - 10, 485], [yR - 250, 575], [yR - 295, 520], [yR - 60, 425]
      ], 165);
      const mfM = addBody(mudF, ST.mats.darkTrim, carbonMeshes);
      mfM.position.x = sx * 395;
    }

    // Roof visor + LED bar
    const roofPlate = new THREE.Mesh(new THREE.BoxGeometry(580, 490, 16), ST.mats.carbon);
    roofPlate.position.set(0, (yF + yR) * 0.5 - 60, zRoof + 10);
    roofPlate.rotation.x = -0.04;
    roofPlate.castShadow = true;
    aeroBodyGroup.add(roofPlate);
    carbonMeshes.push(roofPlate);

    addBoxMesh(aeroBodyGroup, [0, yF - 355, zRoof + 24], [420, 44, 34], ST.mats.darkTrim);
    addBoxMesh(aeroBodyGroup, [0, yF - 332, zRoof + 24], [385, 10, 20], ST.mats.headlight);
    addBoxMesh(aeroBodyGroup, [0, yR - 305, 495], [140, 16, 36], ST.mats.rainLight);
    ST.carRoot.add(aeroBodyGroup);

    // 2. Exposed Tubular Steel Spaceframe Roll Cage (always visible when frame_main on)
    const frameGroup = new THREE.Group();
    const fFront = new THREE.Group();
    const fSide = new THREE.Group();
    const fMain = new THREE.Group();
    const fRear = new THREE.Group();

    const Y_fw = yF - 210, Y_brow = yF - 380, Y_b = yR + 350, Y_eng = yR - 290;
    const FBL = [-fRailX, yF + 140, zBelly], FBR = [fRailX, yF + 140, zBelly];
    const FTL = [-fRailX - 25, yF + 120, 405], FTR = [fRailX + 25, yF + 120, 405];
    const NOSE_BL = [-115, yF + 375, 225], NOSE_BR = [115, yF + 375, 225];
    const NOSE_TL = [-105, yF + 355, 390], NOSE_TR = [105, yF + 355, 390];
    const FST_L = [-fDmpX, fDmpY, fDmpZ], FST_R = [fDmpX, fDmpY, fDmpZ];

    const FW_BL = [-275, Y_fw, zBelly], FW_BR = [275, Y_fw, zBelly];
    const FW_TL = [-270, Y_fw, 640], FW_TR = [270, Y_fw, 640];
    const BRW_L = [-285, Y_brow, zRoof - 10], BRW_R = [285, Y_brow, zRoof - 10];
    const MH_TL = [-300, Y_b, zRoof], MH_TR = [300, Y_b, zRoof];
    const MH_ML = [-wCock, Y_b, 560], MH_MR = [wCock, Y_b, 560];
    const MH_BL = [-wCock, Y_b, zBelly], MH_BR = [wCock, Y_b, zBelly];
    const NERF_FL = [-wCock - 85, Y_fw - 55, 240], NERF_FR = [wCock + 85, Y_fw - 55, 240];
    const NERF_RL = [-wCock - 85, Y_b - 20, 240], NERF_RR = [wCock + 85, Y_b - 20, 240];

    const RST_L = [-rDmpX, rDmpY, rDmpZ], RST_R = [rDmpX, rDmpY, rDmpZ];
    const RBL = [-rRailX, yR, zBelly + 10], RBR = [rRailX, yR, zBelly + 10];
    const ENG_TL = [-190, Y_eng, 495], ENG_TR = [190, Y_eng, 495];
    const ENG_BL = [-185, Y_eng, 260], ENG_BR = [185, Y_eng, 260];

    [
      [NOSE_BL, NOSE_BR, 14], [NOSE_TL, NOSE_TR, 14], [NOSE_BL, NOSE_TL, 14], [NOSE_BR, NOSE_TR, 14],
      [NOSE_BL, FBL, 13], [NOSE_BR, FBR, 13], [NOSE_TL, FTL, 12], [NOSE_TR, FTR, 12],
      [FBL, FBR, 13], [FTL, FTR, 12], [FBL, FTL, 12], [FBR, FTR, 12],
      [FTL, FST_L, 12], [FTR, FST_R, 12], [FBL, FST_L, 11], [FBR, FST_R, 11],
      [FST_L, FST_R, 14], [FST_L, FW_TL, 13], [FST_R, FW_TR, 13],
      [FBL, FW_BL, 14], [FBR, FW_BR, 14]
    ].forEach(t => addTubeMesh(fFront, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));

    [
      [FW_BL, FW_BR, 14], [FW_TL, FW_TR, 14], [FW_BL, FW_TL, 14], [FW_BR, FW_TR, 14],
      [FW_TL, BRW_L, 15], [FW_TR, BRW_R, 15], [BRW_L, BRW_R, 15],
      [BRW_L, MH_TL, 16], [BRW_R, MH_TR, 16], [BRW_L, MH_TR, 10],
      [MH_TL, MH_TR, 17], [MH_TL, MH_ML, 16], [MH_TR, MH_MR, 16],
      [MH_ML, MH_BL, 16], [MH_MR, MH_BR, 16], [MH_BL, MH_BR, 15],
      [MH_ML, MH_MR, 14], [FW_BL, MH_BL, 15], [FW_BR, MH_BR, 15],
      [FW_TL, MH_ML, 12], [FW_TR, MH_MR, 12]
    ].forEach(t => addTubeMesh(fMain, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));

    [
      [FW_BL, NERF_FL, 13], [MH_BL, NERF_RL, 13], [NERF_FL, NERF_RL, 15],
      [FW_BR, NERF_FR, 13], [MH_BR, NERF_RR, 13], [NERF_FR, NERF_RR, 15],
      [NERF_FL, FW_TL, 10], [NERF_FR, FW_TR, 10]
    ].forEach(t => addTubeMesh(fSide, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));

    [
      [MH_TL, RST_L, 14], [MH_TR, RST_R, 14], [MH_BL, RBL, 14], [MH_BR, RBR, 14],
      [MH_ML, ENG_TL, 12], [MH_MR, ENG_TR, 12],
      [RST_L, RST_R, 14], [RBL, RBR, 13], [RBL, RST_L, 12], [RBR, RST_R, 12],
      [RST_L, ENG_TL, 12], [RST_R, ENG_TR, 12], [RBL, ENG_BL, 12], [RBR, ENG_BR, 12],
      [ENG_TL, ENG_TR, 13], [ENG_BL, ENG_BR, 13], [ENG_TL, ENG_BL, 12], [ENG_TR, ENG_BR, 12],
      [ENG_TL, ENG_BR, 9]
    ].forEach(t => addTubeMesh(fRear, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));

    frameGroup.add(fFront, fSide, fMain, fRear);
    ST.carRoot.add(frameGroup);

    // 3. Baja Seat & Visor Helmet Driver
    const driverGroup = new THREE.Group();
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(330, 52, 460), ST.mats.darkTrim);
    seatBack.position.set(0, Y_b + 105, zBelly + 255);
    seatBack.rotation.x = -0.26;
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(330, 310, 48), ST.mats.darkTrim);
    seatBase.position.set(0, Y_b + 235, zBelly + 50);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(118, 18, 16), ST.mats.helmet);
    helm.position.set(0, Y_b + 150, zBelly + 575);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(155, 58, 52), ST.mats.visor);
    visor.position.set(0, Y_b + 230, zBelly + 585);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(148, 72, 10), ST.mats.paint);
    peak.position.set(0, Y_b + 235, zBelly + 655);
    peak.rotation.x = 0.25;
    driverGroup.add(seatBack, seatBase, helm, visor, peak);
    ST.carRoot.add(driverGroup);

    // 4. Baja Engine / CVT / Rear Differential Powertrain
    const powertrainGroup = new THREE.Group();
    addBoxMesh(powertrainGroup, [0, yR + 120, 295], [220, 240, 210], ST.mats.edu);
    addBoxMesh(powertrainGroup, [-135, yR + 65, 290], [65, 280, 145], ST.mats.darkTrim);
    const diffC = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 130, 14), ST.mats.darkTrim);
    diffC.rotation.z = Math.PI / 2;
    diffC.position.set(0, yR, 275);
    powertrainGroup.add(diffC);
    addTubeMesh(powertrainGroup, unitCyl, [65, yR + 30, 360], [115, yR - 255, 395], 22, ST.mats.aluminum);
    ST.carRoot.add(powertrainGroup);

    // 5. Steering Rack & Off-road Steering Wheel
    const steerGroup = new THREE.Group();
    const rackY = yF + hpF.RACK[1], rackZ = hpF.RACK[2];
    const rHousing = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, Math.min(260, Math.abs(hpF.RACK[0]) * 1.6), 14), ST.mats.darkTrim);
    rHousing.rotation.z = Math.PI / 2;
    rHousing.position.set(0, rackY, rackZ);
    const rackRod = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, hpF.RACK[0] * 2, 12), ST.mats.aluminum);
    rackRod.rotation.z = Math.PI / 2;
    rackRod.position.set(0, rackY, rackZ);
    steerGroup.add(rHousing, rackRod);
    const pPin = [0, rackY + 20, rackZ + 45], pWhl = [0, Y_fw - 135, 595];
    addTubeMesh(steerGroup, unitCyl, pPin, pWhl, 11, ST.mats.aluminum);
    const swPivot = new THREE.Group();
    swPivot.position.set(pWhl[0], pWhl[1], pWhl[2]);
    const colD = new THREE.Vector3(pWhl[0] - pPin[0], pWhl[1] - pPin[1], pWhl[2] - pPin[2]).normalize();
    swPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), colD);
    const swSpin = new THREE.Group();
    const rimTorus = new THREE.Mesh(new THREE.TorusGeometry(132, 15, 10, 28), ST.mats.darkTrim);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(250, 26, 10), ST.mats.aluminum);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(26, 125, 10), ST.mats.aluminum);
    barV.position.set(0, -60, 0);
    swSpin.add(rimTorus, barH, barV);
    swPivot.add(swSpin);
    steerGroup.add(swPivot);
    ST.carRoot.add(steerGroup);

    const corners = buildSuspensionCorners(unitCyl, unitSphere, { isBaja: true });
    const { arbGrp, arbs } = buildArbAssemblies(unitCyl);
    const rcOverlay = buildRcOverlay(unitSphere);

    ST.parts = {
      vehicleType: "baja",
      isOpenFrame: true,
      aeroBodyGroup, paintMeshes, carbonMeshes, accentMeshes,
      driverGroup, rwFlap2M: null, rwFlap2BaseY: 0, rwFlap2BaseZ: 0,
      frameGroup, fFront, fSide, fMain, fRear,
      powertrainGroup, steerGroup, rackRod, swSpin,
      arbGrp, arbs, rcOverlay,
      corners
    };
    ST.carKey = buildCarKey();
    applyMaterialModes();
  }

  /* ============================================================================
     FIA GT3 房车赛车连续水密多材质蒙皮 + 鹅颈尾翼 + 车架/副车架 3D 总成
     ============================================================================ */
  function gt3SectionRing(y, cfg) {
    const smoothBand = (dist, halfW) => {
      const u = Math.abs(dist) / halfW;
      return u < 1 ? Math.pow(Math.cos(u * Math.PI * 0.5), 0.72) : 0;
    };
    const uLen = clamp((cfg.yNose - y) / (cfg.yNose - cfg.yTail), 0, 1);

    let rxMax = cfg.halfBodyW;
    if (y > cfg.yF + 160) {
      const fn = clamp((y - (cfg.yF + 160)) / (cfg.yNose - (cfg.yF + 160)), 0, 1);
      rxMax = cfg.halfBodyW * (1 - 0.34 * Math.pow(fn, 1.55));
    } else if (y < cfg.yR - 140) {
      const rn = clamp(((cfg.yR - 140) - y) / ((cfg.yR - 140) - cfg.yTail), 0, 1);
      rxMax = cfg.halfBodyW * (1 - 0.16 * Math.pow(rn, 1.4));
    }

    const fArch = smoothBand(y - cfg.yF, cfg.tRf + 95);
    const rArch = smoothBand(y - cfg.yR, cfg.tRr + 95);
    const arch = Math.max(fArch, rArch);
    const wellRx = fArch >= rArch ? cfg.fWellRx : cfg.rWellRx;
    const rxLower = rxMax * (1 - arch) + wellRx * arch;
    const zArchTop = (fArch >= rArch ? cfg.tRf : cfg.tRr) + 86;

    let zBot = 58;
    if (y > cfg.yNose - 140) {
      const k = (y - (cfg.yNose - 140)) / 140;
      zBot += k * k * 55;
    } else if (y < cfg.yR - 160) {
      const k = ((cfg.yR - 160) - y) / (cfg.yR - 160 - cfg.yTail);
      zBot += clamp(k, 0, 1) * 155;
    }

    let zBelt = 690;
    if (y > cfg.yF + 60) {
      const k = clamp((y - (cfg.yF + 60)) / (cfg.yNose - (cfg.yF + 60)), 0, 1);
      zBelt = 690 - 470 * Math.pow(k, 1.35);
    } else if (y < cfg.yR + 120) {
      const k = clamp(((cfg.yR + 120) - y) / (cfg.yR + 120 - cfg.yTail), 0, 1);
      zBelt = 690 + 115 * Math.sin(k * Math.PI * 0.65);
    }

    let zCrown = zBelt + 42;
    let rxRoof = rxMax * 0.88;
    const yWs = cfg.yF - 250, yRfF = cfg.yF - 680, yRfR = cfg.yR + 540, yTailTop = cfg.yTail + 30;
    if (y < yWs && y > yTailTop) {
      if (y >= yRfF) {
        const k = clamp((yWs - y) / (yWs - yRfF), 0, 1);
        const s = k * k * (3 - 2 * k);
        zCrown = zBelt + 35 + s * (cfg.zRoofMax - (zBelt + 35));
        rxRoof = rxMax * (0.90 - 0.24 * s);
      } else if (y >= yRfR) {
        const midU = (yRfF - y) / Math.max(1, yRfF - yRfR);
        zCrown = cfg.zRoofMax + Math.sin(midU * Math.PI) * 16;
        rxRoof = cfg.halfBodyW * 0.65;
      } else {
        const k = clamp((yRfR - y) / Math.max(1, yRfR - yTailTop), 0, 1);
        const s = k * k * (3 - 2 * k);
        zCrown = cfg.zRoofMax - s * (cfg.zRoofMax - (zBelt + 25));
        rxRoof = cfg.halfBodyW * (0.65 + 0.19 * s);
      }
    } else if (y >= yWs) {
      zCrown = zBelt + (y > cfg.yNose - 120 ? 18 : 42) - Math.max(0, 26 * (1 - uLen * 2.5));
      rxRoof = rxMax * 0.86;
    }

    const right = [
      [rxLower * 0.55, zBot],
      [rxLower * 0.94, zBot + 16],
      [rxLower,        zBot + 115],
      [rxLower * 0.35 + rxMax * 0.65, Math.max(zBot + 185, zArchTop - 25)],
      [rxMax * 0.96,   Math.max(zBot + 245, zArchTop + 48)],
      [rxMax,          zArchTop + (zBelt - zArchTop) * 0.45],
      [rxMax * 0.95,   zBelt - 25],
      [rxMax * 0.88,   zBelt],
      [rxMax * 0.55 + rxRoof * 0.45, zBelt + (zCrown - zBelt) * 0.42],
      [rxRoof * 0.92,  zBelt + (zCrown - zBelt) * 0.80],
      [rxRoof * 0.56,  zCrown - 12],
      [rxRoof * 0.22,  zCrown - 2],
      [0,              zCrown]
    ];
    const pts = [[0, y, zBot]];
    for (let i = 0; i < right.length; i++) pts.push([right[i][0], y, right[i][1]]);
    for (let i = right.length - 2; i >= 0; i--) pts.push([-right[i][0], y, right[i][1]]);
    return { pts, meta: { y, zBelt, zCrown, arch } };
  }

  function buildGT3Car() {
    clearGroup(ST.carRoot);

    const isSport = S.vehicleType === "gt3_sport";
    const wb = S.wb || 2600;
    const yF = wb * 0.5, yR = -wb * 0.5;
    const hpF = S.front.hp, hpR = S.rear.hp;
    const tRf = S.front.tire.R || 300, tWf = S.front.tire.W || 265;
    const tRr = S.rear.tire.R || 310, tWr = S.rear.tire.W || 285;

    const unitCyl = createUnitCylinder();
    const unitSphere = new THREE.SphereGeometry(1, 12, 10);

    const aeroBodyGroup = new THREE.Group();
    const paintMeshes = [], carbonMeshes = [], accentMeshes = [];
    const addBody = (geo, mat, list) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      aeroBodyGroup.add(m);
      if (list) list.push(m);
      return m;
    };

    const wcXf = Math.abs(hpF.WC[0]), wcXr = Math.abs(hpR.WC[0]);
    const halfBodyW = Math.max(wcXf + tWf * 0.36, wcXr + tWr * 0.38, 865);
    const fWellRx = Math.min(wcXf - tWf * 0.5 - 65, 520);
    const rWellRx = Math.min(wcXr - tWr * 0.5 - 55, 530);
    const Y_nose = yF + 760, Y_tail = yR - 640;
    const zRoofMax = isSport ? 1235 : 1190;

    // 1. Watertight multi-material sculpted GT3 Coupe Body Loft
    const ys = [];
    for (let i = 0; i <= 36; i++) {
      const u = i / 36;
      ys.push(Y_nose + (Y_tail - Y_nose) * u);
    }
    const secData = ys.map(y => gt3SectionRing(y, {
      yF, yR, tRf, tRr, halfBodyW, fWellRx, rWellRx, yNose: Y_nose, yTail: Y_tail, zRoofMax
    }));
    const rings = secData.map(d => d.pts);
    const bodyGeo = buildMultiMatLoftGeometry(rings, true, (r, q, n) => {
      const ym = (secData[r].meta.y + secData[r + 1].meta.y) * 0.5;
      const arch = Math.max(secData[r].meta.arch, secData[r + 1].meta.arch);
      const halfN = n / 2;
      const symIdx = q < halfN ? q : (n - 1 - q);
      if (symIdx <= 2) return 1;
      if (arch > 0.35 && symIdx <= 4) return 2;
      if (ym < yF - 255 && ym > yR + 120) {
        if (ym > yF - 690 && symIdx >= 9) return 4;
        if (ym < yF - 670 && ym > yR + 510 && symIdx >= 9 && symIdx <= 10) return 4;
        if (ym <= yR + 520 && ym > yR + 150 && symIdx >= 10) return 4;
      }
      if (!isSport && symIdx >= 12) return 3;
      return 0;
    }, [2, 2]);
    const bodyMesh = addBody(bodyGeo, [ST.mats.paint, ST.mats.carbon, ST.mats.darkTrim, ST.mats.accent, ST.mats.glass], paintMeshes);
    bodyMesh.castShadow = true;

    // 2. Carbon Front Splitter, Side Skirts & Mirrors
    const spPts = [
      [yF + 810, 48], [yF + 755, 42], [yF + 560, 42], [yF + 560, 62], [yF + 785, 68]
    ];
    for (const sx of [-1, 1]) {
      const sm = addBody(makeExtrudedPlateYZ(spPts, halfBodyW * 0.92), ST.mats.carbon, carbonMeshes);
      sm.position.x = sx * halfBodyW * 0.45;
      const sk = new THREE.Mesh(new THREE.BoxGeometry(58, wb - 520, 18), ST.mats.carbon);
      sk.position.set(sx * (halfBodyW - 14), (yF + yR) * 0.5, 62);
      sk.castShadow = true;
      aeroBodyGroup.add(sk);
      carbonMeshes.push(sk);
      addBoxMesh(aeroBodyGroup, [sx * (halfBodyW - 75), yF - 460, 745], [140, 82, 52], ST.mats.carbon);
    }

    // 3. LED Headlight Strips & Full-Width Rear Lightbar + Multi-Strake Rear Diffuser
    for (const sx of [-1, 1]) {
      addBoxMesh(aeroBodyGroup, [sx * 545, Y_nose - 230, 465], [160, 56, 38], ST.mats.headlight, [0.35, 0, -sx * 0.25]);
    }
    addBoxMesh(aeroBodyGroup, [0, Y_tail - 8, 690], [halfBodyW * 1.48, 22, 30], ST.mats.rainLight);
    for (let k = -2; k <= 2; k++) {
      addBoxMesh(aeroBodyGroup, [k * 235, Y_tail + 150, 145], [14, 340, 125], ST.mats.carbon);
    }

    // 4. GT3 Swan-Neck Wing vs GT3 Sport Track Spoiler
    let rwFlap2M = null;
    const rwY = isSport ? (yR - 565) : (yR - 615);
    const rwZ = isSport ? 965 : 1145;
    const rwSpan = isSport ? 1480 : 1760;
    const rwChord = isSport ? 185 : 265;
    const rwMainGeo = makeAirfoilGeo(rwChord, Math.round(rwChord * 0.11), 16, isSport ? 8 : 11, rwSpan);
    addBody(rwMainGeo, ST.mats.carbon, carbonMeshes).position.set(0, rwY, rwZ);

    let rwFlap2BaseY = 0, rwFlap2BaseZ = 0;
    if (!isSport) {
      const flapGeo = makeAirfoilGeo(110, 14, 10, 24, rwSpan - 20);
      rwFlap2M = addBody(flapGeo, ST.mats.paint, paintMeshes);
      rwFlap2BaseY = rwY - 175;
      rwFlap2BaseZ = rwZ + 52;
      rwFlap2M.position.set(0, rwFlap2BaseY, rwFlap2BaseZ);
    }

    const pylonPts = [[rwY + 180, 770], [rwY + 80, rwZ + 45], [rwY - 50, rwZ + 45], [rwY + 40, 770]];
    for (const sx of [-1, 1]) {
      const py = addBody(makeExtrudedPlateYZ(pylonPts, 14), ST.mats.carbon, carbonMeshes);
      py.position.x = sx * 305;
      const epPts = [[rwY + 130, rwZ - 55], [rwY - 260, rwZ - 40], [rwY - 270, rwZ + 125], [rwY + 120, rwZ + 75]];
      const ep = addBody(makeExtrudedPlateYZ(epPts, 10), ST.mats.carbon, carbonMeshes);
      ep.position.x = sx * (rwSpan * 0.5 + 5);
    }
    ST.carRoot.add(aeroBodyGroup);

    // 5. Internal Rollbar & Front/Rear Subframes
    const frameGroup = new THREE.Group();
    const fFront = new THREE.Group(), fSide = new THREE.Group(), fMain = new THREE.Group(), fRear = new THREE.Group();
    const fSubX = Math.max(210, hpF.LCA_F[0] - 15), rSubX = Math.max(210, hpR.LCA_F[0] - 15);
    const Y_fh = yF - 260, Y_b = yR + 480;
    [
      [[-fSubX, yF + 260, 155], [fSubX, yF + 260, 155], 16],
      [[-fSubX, yF + 260, 155], [-fSubX, Y_fh, 130], 16], [[fSubX, yF + 260, 155], [fSubX, Y_fh, 130], 16],
      [[-hpF.DMP_BODY[0], yF, hpF.DMP_BODY[2]], [hpF.DMP_BODY[0], yF, hpF.DMP_BODY[2]], 15],
      [[-fSubX, yF + 240, 155], [-hpF.DMP_BODY[0], yF, hpF.DMP_BODY[2]], 13],
      [[fSubX, yF + 240, 155], [hpF.DMP_BODY[0], yF, hpF.DMP_BODY[2]], 13]
    ].forEach(t => addTubeMesh(fFront, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));
    [
      [[-580, Y_fh, 120], [-580, Y_b, 120], 16], [[580, Y_fh, 120], [580, Y_b, 120], 16],
      [[-560, Y_fh, 700], [-500, Y_b, zRoofMax - 45], 15], [[560, Y_fh, 700], [500, Y_b, zRoofMax - 45], 15],
      [[-500, Y_b, zRoofMax - 45], [500, Y_b, zRoofMax - 45], 16],
      [[-500, Y_b, zRoofMax - 45], [-580, Y_b, 120], 16], [[500, Y_b, zRoofMax - 45], [580, Y_b, 120], 16]
    ].forEach(t => addTubeMesh(fMain, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));
    [
      [[-580, Y_fh, 280], [-580, Y_b, 420], 14], [[580, Y_fh, 280], [580, Y_b, 420], 14]
    ].forEach(t => addTubeMesh(fSide, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));
    [
      [[-rSubX, Y_b, 130], [-rSubX, yR - 260, 180], 16], [[rSubX, Y_b, 130], [rSubX, yR - 260, 180], 16],
      [[-hpR.DMP_BODY[0], yR, hpR.DMP_BODY[2]], [hpR.DMP_BODY[0], yR, hpR.DMP_BODY[2]], 15],
      [[-500, Y_b, zRoofMax - 45], [-hpR.DMP_BODY[0], yR, hpR.DMP_BODY[2]], 13],
      [[500, Y_b, zRoofMax - 45], [hpR.DMP_BODY[0], yR, hpR.DMP_BODY[2]], 13]
    ].forEach(t => addTubeMesh(fRear, unitCyl, t[0], t[1], t[2], ST.mats.steelTube));
    frameGroup.add(fFront, fSide, fMain, fRear);
    ST.carRoot.add(frameGroup);

    // 6. Cockpit Helmet, V8 Powertrain & GT Steering
    const driverGroup = new THREE.Group();
    const helm = new THREE.Mesh(new THREE.SphereGeometry(112, 18, 16), ST.mats.helmet);
    helm.position.set(-285, Y_b + 240, 895);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(142, 52, 48), ST.mats.visor);
    visor.position.set(-285, Y_b + 320, 902);
    driverGroup.add(helm, visor);
    ST.carRoot.add(driverGroup);

    const powertrainGroup = new THREE.Group();
    addBoxMesh(powertrainGroup, [0, yF - 35, 310], [340, 520, 320], ST.mats.edu);
    addBoxMesh(powertrainGroup, [0, yR + 120, 295], [260, 420, 220], ST.mats.darkTrim);
    addTubeMesh(powertrainGroup, unitCyl, [-160, yR - 220, 195], [-160, yR - 590, 185], 26, ST.mats.aluminum);
    addTubeMesh(powertrainGroup, unitCyl, [160, yR - 220, 195], [160, yR - 590, 185], 26, ST.mats.aluminum);
    ST.carRoot.add(powertrainGroup);

    const steerGroup = new THREE.Group();
    const rackY = yF + hpF.RACK[1], rackZ = hpF.RACK[2];
    const rHousing = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, Math.min(340, Math.abs(hpF.RACK[0]) * 1.4), 14), ST.mats.darkTrim);
    rHousing.rotation.z = Math.PI / 2;
    rHousing.position.set(0, rackY, rackZ);
    const rackRod = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, hpF.RACK[0] * 2, 12), ST.mats.aluminum);
    rackRod.rotation.z = Math.PI / 2;
    rackRod.position.set(0, rackY, rackZ);
    steerGroup.add(rHousing, rackRod);
    const pPin = [-220, rackY, rackZ + 55], pWhl = [-285, Y_fh - 360, 680];
    addTubeMesh(steerGroup, unitCyl, pPin, pWhl, 12, ST.mats.aluminum);
    const swPivot = new THREE.Group();
    swPivot.position.set(pWhl[0], pWhl[1], pWhl[2]);
    const colD = new THREE.Vector3(pWhl[0] - pPin[0], pWhl[1] - pPin[1], pWhl[2] - pPin[2]).normalize();
    swPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), colD);
    const swSpin = new THREE.Group();
    const gtWheel = new THREE.Mesh(new THREE.BoxGeometry(285, 165, 16), ST.mats.carbon);
    swSpin.add(gtWheel);
    swPivot.add(swSpin);
    steerGroup.add(swPivot);
    ST.carRoot.add(steerGroup);

    const corners = buildSuspensionCorners(unitCyl, unitSphere, { isGT3: true });
    const { arbGrp, arbs } = buildArbAssemblies(unitCyl);
    const rcOverlay = buildRcOverlay(unitSphere);

    ST.parts = {
      vehicleType: S.vehicleType,
      isOpenFrame: false,
      aeroBodyGroup, paintMeshes, carbonMeshes, accentMeshes,
      driverGroup, rwFlap2M, rwFlap2BaseY, rwFlap2BaseZ,
      frameGroup, fFront, fSide, fMain, fRear,
      powertrainGroup, steerGroup, rackRod, swSpin,
      arbGrp, arbs, rcOverlay,
      corners
    };
    ST.carKey = buildCarKey();
    applyMaterialModes();
  }

  function orientBetween(mesh, a, b, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1e-4;
    mesh.position.set((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5);
    ST.tmpV1.set(dx / L, dy / L, dz / L);
    mesh.quaternion.setFromUnitVectors(ST.upY, ST.tmpV1);
    mesh.scale.set(r, L, r);
  }

  function buildTrianglePlate(mesh, p1, p2, p3, halfThick) {
    // 3D triangular rocker plate with front/back faces and bevel walls
    const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
    const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx = (nx / nl) * halfThick; ny = (ny / nl) * halfThick; nz = (nz / nl) * halfThick;

    const a1 = [p1[0] + nx, p1[1] + ny, p1[2] + nz], b1 = [p2[0] + nx, p2[1] + ny, p2[2] + nz], c1 = [p3[0] + nx, p3[1] + ny, p3[2] + nz];
    const a2 = [p1[0] - nx, p1[1] - ny, p1[2] - nz], b2 = [p2[0] - nx, p2[1] - ny, p2[2] - nz], c2 = [p3[0] - nx, p3[1] - ny, p3[2] - nz];

    const verts = new Float32Array([
      ...a1, ...b1, ...c1,
      ...a2, ...c2, ...b2,
      ...a1, ...a2, ...b2, ...a1, ...b2, ...b1,
      ...b1, ...b2, ...c2, ...b1, ...c2, ...c1,
      ...c1, ...c2, ...a2, ...c1, ...a2, ...a1
    ]);
    if (mesh.geometry) mesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    mesh.geometry = geo;
  }

  function applyMaterialModes(opts) {
    if (!ST.mats || !ST.parts) return;
    const liv = LIVERIES[CFG.livery] || LIVERIES.green;
    ST.mats.paint.color.setHex(liv.paint);
    ST.mats.accent.color.setHex(liv.accent);
    ST.mats.rim.color.setHex(liv.rim);
    ST.mats.caliper.color.setHex(liv.cal);

    const forceXray = !!(opts && opts.forceXray);
    const onlyAxis = opts && opts.onlyAxis;
    const xray = CFG.shellMode === "xray" || forceXray;
    const pureSusp = isPureSuspActive();

    const setXray = (mat, op, baseOp) => {
      const nextOp = xray ? op : (baseOp !== undefined ? baseOp : 1.0);
      const trans = xray || (baseOp !== undefined && baseOp < 1.0);
      const dw = !trans;
      if (mat.transparent !== trans || mat.opacity !== nextOp || mat.depthWrite !== dw) {
        mat.transparent = trans;
        mat.opacity = nextOp;
        mat.depthWrite = dw;
      }
    };
    const isAutoFrontGhost = forceXray && CFG.shellMode !== "xray";
    setXray(ST.mats.paint, isAutoFrontGhost ? 0.20 : 0.24);
    setXray(ST.mats.carbon, isAutoFrontGhost ? 0.22 : 0.26);
    setXray(ST.mats.accent, isAutoFrontGhost ? 0.26 : 0.30);
    setXray(ST.mats.darkTrim, isAutoFrontGhost ? 0.18 : 0.22);
    if (ST.mats.skid) setXray(ST.mats.skid, isAutoFrontGhost ? 0.22 : 0.30);
    if (ST.mats.glass) setXray(ST.mats.glass, isAutoFrontGhost ? 0.14 : 0.20, 0.62);

    const p = ST.parts;
    p.aeroBodyGroup.visible = !pureSusp && !!S.show.frame_main;
    p.fFront.visible = !!S.show.frame_front;
    p.fSide.visible  = !!S.show.frame_side;
    p.fMain.visible  = !!S.show.frame_main;
    p.fRear.visible  = !!S.show.frame_rear;
    p.frameGroup.visible = p.isOpenFrame ? !!S.show.frame_main : (xray || !S.show.frame_main);
    p.powertrainGroup.visible = (xray || !p.aeroBodyGroup.visible || p.isOpenFrame) && !!S.show.powertrain;
    p.steerGroup.visible = (!onlyAxis || onlyAxis === "front") && (!!S.show.steer_rack || !!S.show.steer_col || !!S.show.steer_wheel);
    if (p.arbGrp) p.arbGrp.visible = !!S.show.arb;

    const showInternalSusp = xray || !p.aeroBodyGroup.visible || p.isOpenFrame;
    p.showInternalSusp = showInternalSusp;
    for (const key of ["FR", "FL", "RR", "RL"]) {
      const c = p.corners && p.corners[key];
      if (!c) continue;
      c.rockerMesh.visible = !c.isDirect && showInternalSusp;
      c.rockerAxle.visible = !c.isDirect && showInternalSusp;
      c.dmpBody.visible    = showInternalSusp || c.isDirect;
      c.dmpShaft.visible   = showInternalSusp || c.isDirect;
      c.springMesh.visible = showInternalSusp || c.isDirect;
      if (c.joints && c.joints.ST_I) c.joints.ST_I.visible = !c.isDirect && showInternalSusp;
    }
  }

  function buildActiveVehicle() {
    if (typeof S !== "undefined" && S) {
      if (S.vehicleType === "baja") { buildBajaCar(); return; }
      if (S.vehicleType === "gt3" || S.vehicleType === "gt3_sport") { buildGT3Car(); return; }
    }
    buildFormulaCar();
  }

  function linkHeatColor(ratio) {
    // ratio > 0 (tension): coral/amber-red; ratio < 0 (compression): cyan-blue; near 0: steel slate
    const a = Math.min(1, Math.abs(ratio));
    if (ratio >= 0) {
      return new THREE.Color(0x3b4454).lerp(new THREE.Color(0xef4444), a);
    }
    return new THREE.Color(0x3b4454).lerp(new THREE.Color(0x06b6d4), a);
  }

  function ensureCornerForceMats(c) {
    if (c.linkForceMats) return c.linkForceMats;
    const mk = (base) => base.clone();
    c.linkForceMats = {
      lcaF: mk(ST.mats.wishbone),
      lcaR: mk(ST.mats.wishbone),
      ucaF: mk(ST.mats.wishbone),
      ucaR: mk(ST.mats.wishbone),
      tieRod: mk(ST.mats.tieRod),
      strut: mk(ST.mats.pushrod)
    };
    return c.linkForceMats;
  }

  function estimateAnalysisCornerLoads(wb) {
    const fW = ((S.front.mS || 0) * 0.5 + (S.front.mU || 0)) * 9.81;
    const rW = ((S.rear.mS || 0) * 0.5 + (S.rear.mU || 0)) * 9.81;
    const gy = (S.qs && Number.isFinite(S.qs.gy)) ? S.qs.gy : 0;
    const gx = (S.qs && Number.isFinite(S.qs.gx)) ? S.qs.gx : 0;
    const fz = { FL: fW, FR: fW, RL: rW, RR: rW };
    if (typeof solveQuasiStatic === "function") {
      try {
        const qs = solveQuasiStatic(gy, gx);
        if (qs && qs.fz && Number.isFinite(qs.fz.FL)) {
          fz.FL = qs.fz.FL; fz.FR = qs.fz.FR; fz.RL = qs.fz.RL; fz.RR = qs.fz.RR;
        }
      } catch (e) {}
    }
    return {
      FR: { fx: fz.FR * gy, fy: fz.FR * gx, fz: fz.FR },
      FL: { fx: fz.FL * gy, fy: fz.FL * gx, fz: fz.FL },
      RR: { fx: fz.RR * gy, fy: fz.RR * gx, fz: fz.RR },
      RL: { fx: fz.RL * gy, fy: fz.RL * gx, fz: fz.RL }
    };
  }

  function syncCarPose(opts) {
    if (!ST.parts || ST.carKey !== buildCarKey()) buildActiveVehicle();
    applyMaterialModes(opts);

    const p = ST.parts;
    const wb = S.wb || 1550;
    const yF = wb * 0.5, yR = -wb * 0.5;

    // Driver helmet visibility (hide in cockpit POV)
    p.driverGroup.visible = !(opts && opts.hideDriver);

    // Optional DRS rear flap visual pitch
    if (p.rwFlap2M) {
      const drsOpen = !!(opts && opts.drs);
      p.rwFlap2M.rotation.x = drsOpen ? 0.30 : 0.0;
      p.rwFlap2M.position.set(0, p.rwFlap2BaseY, p.rwFlap2BaseZ + (drsOpen ? 4 : 0));
    }

    // Steering rack & wheel live angle
    if (p.rackRod) p.rackRod.position.x = -(S.rack || 0);
    if (p.swSpin) p.swSpin.rotation.z = -(S.swAngle || 0) * (Math.PI / 180);

    // Braking thermal glow on rotor & caliper
    const brk = (opts && opts.brakeIntensity) ? Math.max(0, Math.min(1, opts.brakeIntensity)) : 0;
    ST.mats.disc.emissive.setRGB(brk * 0.55, brk * 0.14, 0.02 * brk);

    const mapCorner = {
      FR: { M: SIM.FR, m: SIM.mFR, yOff: yF, driven: false },
      FL: { M: SIM.FL, m: SIM.mFL, yOff: yF, driven: false },
      RR: { M: SIM.RR, m: SIM.mRR, yOff: yR, driven: true  },
      RL: { M: SIM.RL, m: SIM.mRL, yOff: yR, driven: true  }
    };

    if (typeof POWERTRAIN !== "undefined" && POWERTRAIN.getActiveSpec) {
      try {
        const spec = POWERTRAIN.getActiveSpec();
        if (spec && spec.drive) {
          mapCorner.FR.driven = spec.drive === "FWD" || spec.drive === "AWD" || spec.drive === "4WD";
          mapCorner.FL.driven = mapCorner.FR.driven;
          mapCorner.RR.driven = spec.drive === "RWD" || spec.drive === "AWD" || spec.drive === "4WD";
          mapCorner.RL.driven = mapCorner.RR.driven;
        }
      } catch (e) {}
    }

    const forceOn = !!(typeof S !== "undefined" && S && S.show && S.show.force);
    const stageTel = opts && opts.telemetry && opts.telemetry.Fz ? opts.telemetry : null;
    // Note: VehicleDynamics15DOF uses +Fx = longitudinal forward (+Y here), +Fy = right lateral (+X here)
    const cornerLoads = forceOn ? (stageTel ? {
      FR: { fx: (stageTel.Fy && stageTel.Fy.FR) || 0, fy: (stageTel.Fx && stageTel.Fx.FR) || 0, fz: stageTel.Fz.FR || 0 },
      FL: { fx: (stageTel.Fy && stageTel.Fy.FL) || 0, fy: (stageTel.Fx && stageTel.Fx.FL) || 0, fz: stageTel.Fz.FL || 0 },
      RR: { fx: (stageTel.Fy && stageTel.Fy.RR) || 0, fy: (stageTel.Fx && stageTel.Fx.RR) || 0, fz: stageTel.Fz.RR || 0 },
      RL: { fx: (stageTel.Fy && stageTel.Fy.RL) || 0, fy: (stageTel.Fx && stageTel.Fx.RL) || 0, fz: stageTel.Fz.RL || 0 }
    } : estimateAnalysisCornerLoads(wb)) : null;

    const onlyAxis = opts && opts.onlyAxis;

    // Update 3D ARB torsion bars & LCA drop-links when enabled
    if (p.arbs) {
      for (const [ax, yOff, rK, lK] of [["front", yF, "FR", "FL"], ["rear", yR, "RR", "RL"]]) {
        const ab = p.arbs[ax];
        const stAx = S[ax];
        const showAx = !!S.show.arb && stAx && stAx.arb && stAx.arb.d > 0.5 && (!onlyAxis || onlyAxis === ax) && typeof arbGeom === "function";
        [ab.bar, ab.armR, ab.armL, ab.dropR, ab.dropL].forEach(mesh => { mesh.visible = showAx; });
        if (showAx) {
          const mrInfo = mapCorner[rK], mlInfo = mapCorner[lK];
          const lbjR = (mrInfo && mrInfo.M && mrInfo.M.n) ? mrInfo.M.n[mrInfo.M.idx.LBJ].p : stAx.hp.LBJ;
          const lbjL = (mlInfo && mlInfo.M && mlInfo.M.n) ? mlInfo.M.n[mlInfo.M.idx.LBJ].p : stAx.hp.LBJ;
          const gR = arbGeom(lbjR, stAx), gL = arbGeom(lbjL, stAx);
          const brR = Math.max(4, Math.min(18, stAx.arb.d * 0.44));
          const pBarR = [gR.xa, gR.ay + yOff, gR.az], pBarL = [-gL.xa, gL.ay + yOff, gL.az];
          const pArmR = [gR.E[0], gR.E[1] + yOff, gR.E[2]], pArmL = [-gL.E[0], gL.E[1] + yOff, gL.E[2]];
          const pAttR = [gR.P[0], gR.P[1] + yOff, gR.P[2]], pAttL = [-gL.P[0], gL.P[1] + yOff, gL.P[2]];
          orientBetween(ab.bar, pBarL, pBarR, brR);
          orientBetween(ab.armR, pBarR, pArmR, Math.max(4, brR * 0.72));
          orientBetween(ab.armL, pBarL, pArmL, Math.max(4, brR * 0.72));
          orientBetween(ab.dropR, pArmR, pAttR, 4.5);
          orientBetween(ab.dropL, pArmL, pAttL, 4.5);
        }
      }
    }

    // Update 3D Roll Center markers when enabled
    if (p.rcOverlay) {
      const showRc = !!(S.show.ic && (forceOn || CFG.shellMode === "xray" || (opts && opts.forceXray)) && !isPureSuspActive());
      p.rcOverlay.rcGrp.visible = showRc;
      if (showRc) {
        const rcF = (SIM.mFR && Number.isFinite(SIM.mFR.rcH)) ? SIM.mFR.rcH : 45;
        const rcR = (SIM.mRR && Number.isFinite(SIM.mRR.rcH)) ? SIM.mRR.rcH : 65;
        p.rcOverlay.frontDot.position.set(0, yF, rcF);
        p.rcOverlay.rearDot.position.set(0, yR, rcR);
        const posAttr = p.rcOverlay.rcLine.geometry.getAttribute("position");
        posAttr.setXYZ(0, 0, yF, rcF);
        posAttr.setXYZ(1, 0, yR, rcR);
        posAttr.needsUpdate = true;
      }
    }
    for (const key of ["FR", "FL", "RR", "RL"]) {
      const c = p.corners[key];
      const info = mapCorner[key];
      const showMirror = key === "FR" || key === "RR" || S.show.mirror;
      if (!showMirror || (onlyAxis && c.axis !== onlyAxis) || !info.M || !info.M.n) {
        c.grp.visible = false;
        continue;
      }
      c.grp.visible = true;
      const sx = c.sx;
      const yOff = info.yOff;
      const m = info.m || metrics(info.M, c.axis);
      const T = pt => [pt[0] * sx, pt[1] + yOff, pt[2]];
      const N = id => T(info.M.n[info.M.idx[id]].p);

      const LBJ = N("LBJ"), UBJ = N("UBJ"), WC = N("WC"), TRO = N("TRO");
      const LAF = N("LCA_F"), LAR = N("LCA_R"), UAF = N("UCA_F"), UAR = N("UCA_R");
      const ST_O = N("STRUT_OUT"), ST_I = N("STRUT_IN");
      const RK_A = N("RCK_AX_A"), RK_B = N("RCK_AX_B"), RK_D = N("RCK_DMP"), DMP_B = N("DMP_BODY");

      orientBetween(c.lcaF, LAF, LBJ, 7.5);
      orientBetween(c.lcaR, LAR, LBJ, 7.5);
      orientBetween(c.ucaF, UAF, UBJ, 6.5);
      orientBetween(c.ucaR, UAR, UBJ, 6.5);

      orientBetween(c.knk1, LBJ, UBJ, 11);
      orientBetween(c.knk2, LBJ, WC, 12);
      orientBetween(c.knk3, UBJ, WC, 11);

      c.joints.LBJ.position.set(LBJ[0], LBJ[1], LBJ[2]);
      c.joints.UBJ.position.set(UBJ[0], UBJ[1], UBJ[2]);
      c.joints.TRO.position.set(TRO[0], TRO[1], TRO[2]);
      c.joints.ST_O.position.set(ST_O[0], ST_O[1], ST_O[2]);
      c.joints.ST_I.position.set(ST_I[0], ST_I[1], ST_I[2]);

      const RCK = c.axis === "front"
        ? [S.front.hp.RACK[0] * sx - (S.rack || 0), S.front.hp.RACK[1] + yOff, S.front.hp.RACK[2]]
        : [S.rear.hp.RACK[0] * sx, S.rear.hp.RACK[1] + yOff, S.rear.hp.RACK[2]];
      if (c.axis === "front") {
        c.tieRod.visible = !!S.show.steer;
        orientBetween(c.tieRod, RCK, TRO, 6.5);
      } else {
        c.tieRod.visible = false;
      }

      const showInt = !!p.showInternalSusp;
      const isDirect = S[c.axis].arch === "direct";
      if (isDirect) {
        c.rockerMesh.visible = false;
        c.rockerAxle.visible = false;
        c.strut.visible = false;
        c.joints.ST_I.visible = false;
        const showEl = !!S.show.elastic && (showInt || isDirect);
        c.dmpBody.visible = showEl; c.dmpShaft.visible = showEl; c.springMesh.visible = showEl;
        if (showEl) {
          const midD = lerp3(ST_O, DMP_B, 0.52);
          orientBetween(c.dmpBody, ST_O, midD, 16);
          orientBetween(c.dmpShaft, midD, DMP_B, 9);
          const Lnow = dst(ST_O, DMP_B) || c.L_spr0;
          orientBetween(c.springMesh, ST_O, DMP_B, 1);
          c.springMesh.position.set(ST_O[0], ST_O[1], ST_O[2]);
          c.springMesh.scale.set(1, Lnow / c.L_spr0, 1);
        }
      } else {
        const showRck = !!S.show.rocker && showInt;
        c.rockerMesh.visible = showRck;
        c.rockerAxle.visible = showRck;
        c.strut.visible = true;
        c.joints.ST_I.visible = showInt;
        orientBetween(c.strut, ST_O, ST_I, 7.5);
        if (showRck) {
          const rMid = lerp3(RK_A, RK_B, 0.5);
          buildTrianglePlate(c.rockerMesh, rMid, ST_I, RK_D, 6);
          orientBetween(c.rockerAxle, RK_A, RK_B, 10);
        }
        const showEl = !!S.show.elastic && showInt;
        c.dmpBody.visible = showEl; c.dmpShaft.visible = showEl; c.springMesh.visible = showEl;
        if (showEl) {
          const midD = lerp3(RK_D, DMP_B, 0.54);
          orientBetween(c.dmpBody, RK_D, midD, 15);
          orientBetween(c.dmpShaft, midD, DMP_B, 8.5);
          const Lnow = dst(RK_D, DMP_B) || c.L_spr0;
          orientBetween(c.springMesh, RK_D, DMP_B, 1);
          c.springMesh.position.set(RK_D[0], RK_D[1], RK_D[2]);
          c.springMesh.scale.set(1, Lnow / c.L_spr0, 1);
        }
      }

      // Halfshaft on driven axle
      if (S.show.halfshaft && info.driven) {
        c.halfshaft.visible = true;
        const diffP = [135 * sx, yOff, 245];
        orientBetween(c.halfshaft, diffP, WC, 11);
      } else {
        c.halfshaft.visible = false;
      }

      // Wheel Carrier Basis (Right-handed on BOTH sides, +X_local = outboard ax, +Z_local = uUp)
      c.carrierGrp.visible = !!S.show.wheel;
      if (S.show.wheel) {
        const axOut = nrm([m.ax[0] * sx, m.ax[1], m.ax[2]]);
        const uUp = nrm(sub([0, 0, 1], mul(axOut, dot([0, 0, 1], axOut))));
        const uBack = cross(axOut, uUp); // Right: -Y (rear), Left: +Y (fwd)
        // Right: Y_local = -uBack (+Y fwd), Left: Y_local = -uBack (-Y rear) => cross(axOut, Y_local) == uUp on BOTH!
        const yLoc = mul(uBack, -1);
        c.carrierGrp.matrix.set(
          axOut[0], yLoc[0], uUp[0], WC[0],
          axOut[1], yLoc[1], uUp[1], WC[1],
          axOut[2], yLoc[2], uUp[2], WC[2],
          0, 0, 0, 1
        );

        // Caliper aligned to wheel plane (toward rear of rotor on front axle, front of rotor on rear axle)
        c.calGroup.visible = !!S.show.caliper;
        if (S.show.caliper) {
          const calSignY = (c.axis === "front" ? -1 : 1) * sx; // matches world -Y on front, +Y on rear
          const calAng = calSignY > 0 ? 0.35 : Math.PI - 0.35;
          const rCal = c.dR * 0.85;
          c.calGroup.position.set(-4, Math.cos(calAng) * rCal, Math.sin(calAng) * rCal);
          c.calGroup.rotation.x = calAng;
        }
        c.discMesh.visible = !!S.show.disc_vent;

        // Spin wheel around local +X axle
        let spin = 0;
        if (global._tireSpinAngles && global._tireSpinAngles[key] !== undefined) {
          spin = global._tireSpinAngles[key];
        } else {
          spin = global._tireSpinAngle || 0;
        }
        // Right side: Y_local = +Y fwd => top (+Z) moves fwd (+Y) with -spin around +X_local
        // Left side:  Y_local = -Y rear => top (+Z) moves fwd (+Y) with +spin around +X_local (-X world)
        c.spinGrp.rotation.x = sx > 0 ? -spin : spin;
      }

      // 3D Force Overlay: Link Tension/Compression Coloring + Contact Patch Friction Circle & Vectors
      if (forceOn && cornerLoads) {
        const ld = cornerLoads[key];
        const CP = m.cp ? T(m.cp) : [WC[0], WC[1], WC[2] - (S[c.axis].tire.R || 230)];
        const fzVal = Math.max(0, ld.fz || 0);
        const fzNorm = Math.max(800, fzVal);
        const mags = solveCornerLinkLoadsJS({
          LCA_F: LAF, LCA_R: LAR, LBJ,
          UCA_F: UAF, UCA_R: UAR, UBJ,
          RACK: RCK, TRO,
          STRUT_BASE: isDirect ? DMP_B : ST_I, ST_O
        }, WC, CP, [ld.fx || 0, ld.fy || 0, fzVal]);

        const fm = ensureCornerForceMats(c);
        const mapLink = [
          [c.lcaF, fm.lcaF, 0], [c.lcaR, fm.lcaR, 1],
          [c.ucaF, fm.ucaF, 2], [c.ucaR, fm.ucaR, 3],
          [c.tieRod, fm.tieRod, 4], [c.strut, fm.strut, 5]
        ];
        for (const [mesh, mat, idx] of mapLink) {
          const col = linkHeatColor(mags[idx] / fzNorm);
          mat.color.copy(col);
          mat.emissive.copy(col).multiplyScalar(0.35);
          mesh.material = mat;
        }

        c.forceGrp.visible = true;
        const refFz = Math.max(400, ((S[c.axis].mS || 0) * 0.5 + (S[c.axis].mU || 0)) * 9.81);
        const fCap = Math.max(120, 1.45 * fzVal);
        const tW = S[c.axis].tire.W || 200;
        const rMax = Math.max(60, Math.min(300, tW * 0.92 * Math.sqrt(Math.max(0.05, fzVal / refFz))));
        const fh = Math.hypot(ld.fx || 0, ld.fy || 0);
        const sat = Math.min(1.15, fh / fCap);
        const fCol = sat > 0.88 ? 0xef4444 : (sat > 0.58 ? 0xf59e0b : 0x34d399);
        c.fricRing.material.color.setHex(fCol);
        c.fricDisk.material.color.setHex(fCol);
        c.fricRing.position.set(CP[0], CP[1], CP[2] + 3);
        c.fricRing.scale.set(rMax, rMax, 1);
        c.fricDisk.position.set(CP[0], CP[1], CP[2] + 2);
        c.fricDisk.scale.set(rMax, rMax, 1);

        const fzLen = Math.min(340, Math.max(16, (fzVal / refFz) * 145));
        orientBetween(c.vecZCol, [CP[0], CP[1], CP[2] + 3], [CP[0], CP[1], CP[2] + 3 + fzLen], 7.5);

        const hLen = Math.min(rMax * 1.15, rMax * (fh / fCap));
        if (hLen > 14) {
          c.vecHShaft.visible = true; c.vecHHead.visible = true;
          const hx = (ld.fx || 0) / fh, hy = (ld.fy || 0) / fh;
          const tipLen = Math.min(34, Math.max(16, hLen * 0.34));
          const p0 = [CP[0], CP[1], CP[2] + 9];
          const pMid = [CP[0] + hx * (hLen - tipLen), CP[1] + hy * (hLen - tipLen), CP[2] + 9];
          orientBetween(c.vecHShaft, p0, pMid, 7.5);
          c.vecHHead.position.set(CP[0] + hx * (hLen - tipLen * 0.5), CP[1] + hy * (hLen - tipLen * 0.5), CP[2] + 9);
          ST.tmpV1.set(hx, hy, 0);
          c.vecHHead.quaternion.setFromUnitVectors(ST.upY, ST.tmpV1);
          c.vecHHead.scale.set(17, tipLen, 17);
        } else {
          c.vecHShaft.visible = false; c.vecHHead.visible = false;
        }
      } else {
        c.forceGrp.visible = false;
        if (c.linkForceMats) {
          c.lcaF.material = ST.mats.wishbone;
          c.lcaR.material = ST.mats.wishbone;
          c.ucaF.material = ST.mats.wishbone;
          c.ucaR.material = ST.mats.wishbone;
          c.tieRod.material = ST.mats.tieRod;
          c.strut.material = ST.mats.pushrod;
        }
      }
    }
  }
  const syncFormulaPose = syncCarPose;

  function ensureSize(w, h, dpr) {
    const rw = Math.max(10, Math.round(w));
    const rh = Math.max(10, Math.round(h));
    const rd = Math.min(2, dpr || 1);
    if (ST.lastW !== rw || ST.lastH !== rh || ST.lastDpr !== rd) {
      ST.lastW = rw; ST.lastH = rh; ST.lastDpr = rd;
      ST.renderer.setPixelRatio(rd);
      ST.renderer.setSize(rw, rh, false);
    }
  }

  function setCameraBasis(eye, rt, up, fw, fovDist, w, h) {
    const cam = ST.camera;
    const f = Math.max(10, fovDist);
    cam.aspect = Math.max(0.1, w / Math.max(1, h));
    cam.fov = 2 * Math.atan((h * 0.5) / f) * (180 / Math.PI);
    cam.near = 40;
    cam.far = 260000;
    cam.updateProjectionMatrix();
    cam.matrixWorld.set(
      rt[0], up[0], -fw[0], eye[0],
      rt[1], up[1], -fw[1], eye[1],
      rt[2], up[2], -fw[2], eye[2],
      0, 0, 0, 1
    );
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }

  /* ============================================================================
     对外渲染入口 1：主工作台 4 号等轴测 3D 视口 (Iso Viewport)
     ============================================================================ */
  function renderIso(v) {
    if (!isActiveForView() || !initEngine()) return false;
    try {
      ensureSize(v.w, v.h, v.dpr || 1);

      // Reset carRoot to identity (local mm frame)
      ST.carRoot.matrix.identity();
      syncFormulaPose({ hideDriver: false, drs: false, brakeIntensity: 0 });

      // Studio lighting & theme background
      const isDark = typeof V4 !== "undefined" ? V4.mode === "dark" : true;
      const bgHex = (typeof C !== "undefined" && C.bg) ? C.bg : (isDark ? "#111621" : "#f5efe4");
      ST.renderer.setClearColor(new THREE.Color(bgHex), 1.0);

      ST.studioGroup.visible = true;
      ST.stageShadowPlane.visible = false;
      ST.studioFloor.material.opacity = isDark ? 0.48 : 0.24;
      ST.studioGrid.visible = !!S.show.ground && isDark;
      if (ST.studioGridLight) ST.studioGridLight.visible = !!S.show.ground && !isDark;

      const s = ST.lights;
      s.sun.position.set(2800, 3800, 4800);
      s.sun.target.position.set(0, 0, 200);
      s.sun.updateMatrixWorld();
      s.sun.target.updateMatrixWorld();
      s.sun.intensity = isDark ? 2.0 : 2.25;
      s.hemi.intensity = isDark ? 0.55 : 0.72;

      setCameraBasis(v.eye, v.rt, v.up, v.fw, v.dist * v.s, v.w, v.h);
      ST.renderer.render(ST.scene, ST.camera);

      v.ctx.drawImage(ST.glCanvas, 0, 0, v.w, v.h);
      return true;
    } catch (e) {
      console.warn("CAR3D_GL.renderIso error:", e);
      return false;
    }
  }

  function setOrthoBasis(v) {
    if (!ST.orthoCam) {
      ST.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 100, 30000);
      ST.orthoCam.matrixAutoUpdate = false;
    }
    const cam = ST.orthoCam;
    const s = Math.max(1e-4, v.s || 0.5);
    const hw = (v.w * 0.5) / s;
    const hh = (v.h * 0.5) / s;
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;
    cam.bottom = -hh;
    cam.near = 100;
    cam.far = 30000;
    cam.updateProjectionMatrix();

    const rt = v.bx;
    const up = v.by;
    const camZ = [
      rt[1] * up[2] - rt[2] * up[1],
      rt[2] * up[0] - rt[0] * up[2],
      rt[0] * up[1] - rt[1] * up[0]
    ];
    const DIST = 12000;
    const eyeX = rt[0] * v.cx + up[0] * v.cy + camZ[0] * DIST;
    const eyeY = rt[1] * v.cx + up[1] * v.cy + camZ[1] * DIST;
    const eyeZ = rt[2] * v.cx + up[2] * v.cy + camZ[2] * DIST;

    cam.matrixWorld.set(
      rt[0], up[0], camZ[0], eyeX,
      rt[1], up[1], camZ[1], eyeY,
      rt[2], up[2], camZ[2], eyeZ,
      0, 0, 0, 1
    );
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }

  function renderOrtho(v) {
    if (!isActiveForView() || !v || v.type !== "o" || !initEngine()) return false;
    try {
      ensureSize(v.w, v.h, v.dpr || 1);

      ST.carRoot.matrix.identity();
      const isFront = v.key === "front";
      syncFormulaPose({
        hideDriver: false,
        drs: false,
        brakeIntensity: 0,
        forceXray: isFront,
        onlyAxis: isFront ? ((typeof S !== "undefined" && S && S.axis) || "front") : null
      });

      const isDark = typeof V4 !== "undefined" ? V4.mode === "dark" : true;
      ST.renderer.setClearColor(0x000000, 0.0);
      ST.studioGroup.visible = false;
      ST.stageShadowPlane.visible = false;

      const s = ST.lights;
      if (isFront) {
        s.sun.position.set(2200, -4200, 3800);
      } else if (v.key === "side") {
        s.sun.position.set(4600, 2200, 4200);
      } else {
        s.sun.position.set(2400, 3200, 5200);
      }
      s.sun.target.position.set(0, 0, 220);
      s.sun.updateMatrixWorld();
      s.sun.target.updateMatrixWorld();
      s.sun.intensity = isDark ? 2.0 : 2.2;
      s.hemi.intensity = isDark ? 0.68 : 0.80;

      setOrthoBasis(v);
      ST.renderer.render(ST.scene, ST.orthoCam);

      v.ctx.drawImage(ST.glCanvas, 0, 0, v.w, v.h);
      return true;
    } catch (e) {
      console.warn("CAR3D_GL.renderOrtho error:", e);
      return false;
    }
  }

  /* ============================================================================
     对外渲染入口 2：三大动态舞台 (Slope / Skidpad / Circuit)
     ============================================================================ */
  function renderStageCar(ctx, opts) {
    if (!isActiveForStage() || !initEngine()) return false;
    try {
      const w = opts.w, h = opts.h, dpr = opts.dpr || 1;
      ensureSize(w, h, dpr);

      // Update vehicle body matrix in stage frame
      const R = opts.R; // 9-element row-major rotation matrix
      const pos = opts.carPos;
      ST.carRoot.matrix.set(
        R[0], R[1], R[2], pos[0],
        R[3], R[4], R[5], pos[1],
        R[6], R[7], R[8], pos[2],
        0, 0, 0, 1
      );

      syncCarPose({
        hideDriver: !!opts.hideDriver,
        drs: !!opts.drs,
        brakeIntensity: opts.brakeIntensity || 0,
        telemetry: opts.telemetry || null
      });

      // Transparent clear over stage 2D tarmac
      ST.renderer.setClearColor(0x000000, 0.0);
      ST.studioGroup.visible = false;

      // Ground shadow plane aligned beneath the vehicle
      const groundZ = opts.groundZ !== undefined ? opts.groundZ : 2;
      ST.stageShadowPlane.visible = !!CFG.shadows && opts.shadowAlpha !== 0;
      ST.stageShadowPlane.position.set(pos[0], pos[1], groundZ);
      ST.stageShadowPlane.rotation.set(0, 0, opts.yaw || 0);
      ST.stageShadowMat.opacity = opts.shadowAlpha !== undefined ? opts.shadowAlpha : 0.62;

      // Sun & lighting adaptation (lower sun angle produces crisp diagonal tarmac shadow)
      const s = ST.lights;
      const sd = opts.sunDir || [0.52, 0.38, 0.68];
      const slen = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      s.sun.position.set(
        pos[0] + (sd[0] / slen) * 5500,
        pos[1] + (sd[1] / slen) * 5500,
        groundZ + Math.max(0.25, Math.min(0.68, Math.abs(sd[2] / slen))) * 5500
      );
      s.sun.target.position.set(pos[0], pos[1], pos[2]);
      s.sun.updateMatrixWorld();
      s.sun.target.updateMatrixWorld();

      if (opts.lightMode === "night") {
        s.sun.intensity = 1.15; s.sun.color.setHex(0xcbe2ff);
        s.hemi.intensity = 0.45;
        ST.stageShadowMat.opacity = 0.38;
      } else if (opts.lightMode === "sunset") {
        s.sun.intensity = 2.05; s.sun.color.setHex(0xffb36b);
        s.hemi.intensity = 0.55;
      } else {
        s.sun.intensity = 2.25; s.sun.color.setHex(0xfffaf0);
        s.hemi.intensity = 0.58;
      }

      setCameraBasis(opts.eye, opts.rt, opts.up, opts.fw, opts.fovDist, w, h);
      ST.renderer.render(ST.scene, ST.camera);

      ctx.drawImage(ST.glCanvas, 0, 0, w, h);
      return true;
    } catch (e) {
      console.warn("CAR3D_GL.renderStageCar error:", e);
      return false;
    }
  }

  /* ============================================================================
     对外 API 与 UI 同步
     ============================================================================ */
  function setMode(m) {
    if (m === "solid" || m === "xray" || m === "wire") {
      CFG.shellMode = m;
      saveCfg();
      syncControlsUI();
      if (typeof VW !== "undefined" && Array.isArray(VW)) {
        VW.forEach(v => { if (!v.sLocked) v.geoFitted = false; });
      }
      if (typeof drawAll === "function") drawAll();
    }
  }

  function setLivery(l) {
    if (LIVERIES[l]) {
      CFG.livery = l;
      saveCfg();
      applyMaterialModes();
      syncControlsUI();
      if (typeof drawAll === "function") drawAll();
    }
  }

  function syncControlsUI() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-car3d-mode]").forEach(el => {
      el.classList.toggle("on", el.dataset.car3dMode === CFG.shellMode);
    });
    document.querySelectorAll("[data-car3d-livery]").forEach(el => {
      el.classList.toggle("on", el.dataset.car3dLivery === CFG.livery);
    });
    const wrap = document.getElementById("v4Car3dTools");
    if (wrap) {
      wrap.style.display = supportsCurrentVehicle() ? "inline-flex" : "none";
    }
  }

  function bindControls() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-car3d-mode]").forEach(el => {
      el.onclick = () => setMode(el.dataset.car3dMode);
    });
    document.querySelectorAll("[data-car3d-livery]").forEach(el => {
      el.onclick = () => setLivery(el.dataset.car3dLivery);
    });
    syncControlsUI();
  }

  global.CAR3D_GL = {
    CFG,
    LIVERIES,
    isAvailable,
    supportsCurrentVehicle,
    isActiveForView,
    isActiveForStage,
    renderIso,
    renderOrtho,
    renderStageCar,
    setMode,
    setLivery,
    syncControlsUI,
    bindControls
  };
})(typeof window !== "undefined" ? window : globalThis);
