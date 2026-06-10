/**
 * Shared application state — exported as a mutable object.
 * Every module imports { state } and reads/writes state.xxx properties.
 */
export const state = {
    // === Hardpoints ===
    hardpointsFrontRight: {},
    hardpointsFrontLeft: {},
    hardpointsRearRight: {},
    hardpointsRearLeft: {},

    // === Solver results ===
    currentResultFrontRight: {},
    currentResultFrontLeft: {},
    currentResultRearRight: {},
    currentResultRearLeft: {},
    anglesFrontRight: {},
    anglesFrontLeft: {},
    anglesRearRight: {},
    anglesRearLeft: {},

    // === Frame ===
    frameNodes: {},
    frameTubes: [],

    // === Caches ===
    rockerCache: {},
    contactPatches: {},

    // === Key lists ===
    CHASSIS_KEYS: ['CH1','CH2','CH3','CH4','CH5'],
    UPRIGHT_KEYS: ['UP1','UP2','UP3','UP4','UP5'],
    FLOAT_KEYS: ['FL1'],

    // === Scene objects container ===
    sceneObjects: {
        frontRight: { spheres: {}, lines: {}, tireGroup: null, uprightLine: null, contactPatchLine: null, patchMesh: null },
        frontLeft:  { spheres: {}, lines: {}, tireGroup: null, uprightLine: null, contactPatchLine: null, patchMesh: null },
        rearRight:  { spheres: {}, lines: {}, tireGroup: null, uprightLine: null, contactPatchLine: null, patchMesh: null },
        rearLeft:   { spheres: {}, lines: {}, tireGroup: null, uprightLine: null, contactPatchLine: null, patchMesh: null },
        frame: { spheres: {}, tubes: [], rockerFaces: [], damperGroups: {} },
        bodyworkFaces: [],
        rearWing: { meshes: [], mountSpheres: [], mountLines: [] },
        frontWing: { meshes: [], mountSpheres: [], mountLines: [] },
        undertray: { meshes: [], flipups: [], strakes: [], mountSpheres: [], mountLines: [] },
        diffuser: { meshes: [], strakeMeshes: [], mountSpheres: [], mountLines: [] },
        groundPlane: null,
        rearGroundPlane: null,
        originAxes: null,
    },

    // === Three.js objects (set during scene init) ===
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: null,
    mouse: null,
    viewport: null,

    // === Selection state ===
    selectedSphere: null,
    selectedLine: null,
    selectedPointName: '',
    selectedPointType: '',
    selectedLineEndpoints: null,
    selectedLineType: '',
    multiSelectedPoints: new Set(),
    multiHighlightedSpheres: [],

    // === Colors / config from API ===
    tubeColors: {},
    bodyworkFaces: {},
    rearWingConfig: null,
    frontWingConfig: null,
    undertrayConfig: null,
    diffuserConfig: null,
    designParams: {},

    // === Face editing ===
    selectedFace: null,
    selectedFaceName: '',
    selectedFaceDef: null,

    // === Chassis pose ===
    chassisMode: false,
    chassisPose: { heave: 0, pitch: 0, roll: 0 },
    CHASSIS_TRACK_FRONT: 375,
    CHASSIS_TRACK_REAR: 360,
    CHASSIS_WHEELBASE_HALF: 450,

    // === Solver flow ===
    solveScheduled: false,
    solveRunning: false,
    _solveId: 0,

    // === Chart ===
    kinCurveData: null,
    kinChart: null,
};

// Derived lists
state.HP_ORDER = [...state.CHASSIS_KEYS, ...state.UPRIGHT_KEYS, ...state.FLOAT_KEYS];
state.REAR_HP_ORDER = state.HP_ORDER.map(k => 'R_' + k);
state.FRAME_NODE_ORDER = [
    'FB_TOP_R','FB_LWR_R','FH_TOP_R','FH_UPR_R','MH_TOP_R','MH_UPR_R','RB_TOP_R','RB_LWR_R',
    'RK_PIVOT_R','RK_DAMPER_R','R_RK_PIVOT_R','R_RK_DAMPER_R',
    'DAMPER_CHASSIS_FR','R_DAMPER_CHASSIS_RR',
    'BODY_NOSE_TOP','BODY_NOSE_MID_R','BODY_NOSE_BOT',
    'BODY_LWR_MID_R','BODY_UPR_FWD_R',
    'BODY_ENG_TOP','BODY_ENG_MID_R',
];
state.DAMPER_MOUNT_ORDER = ['DAMPER_CHASSIS_FR','DAMPER_CHASSIS_FL','R_DAMPER_CHASSIS_RR','R_DAMPER_CHASSIS_RL'];

// Color constants
state.FRONT_COLORS = {
    chassis: '#f43f5e', upright: '#fbbf24', float: '#38bdf8',
    uca: '#3b82f6', ucaAxis: '#2563eb', lca: '#10b981', lcaAxis: '#059669',
    kingpin: '#e4e4ec', tieRod: '#f97316', pushRod: '#8b5cf6', uprightLine: '#8888aa',
};
state.REAR_COLORS = {
    chassis: '#d97706', upright: '#ca8a04', float: '#0284c7',
    uca: '#2563eb', ucaAxis: '#1d4ed8', lca: '#059669', lcaAxis: '#047857',
    kingpin: '#d4d4d8', tieRod: '#ea580c', pushRod: '#7c3aed', uprightLine: '#71718a',
};
state.FRAME_COLOR = '#94a3b8';
state.FRAME_NODE_COLOR = '#64748b';
state.ROCKER_COLOR = '#f97316';
state.DAMPER_COLOR = '#fbbf24';

// Palette
state.PALETTE = [
    {name:'红', hex:'#f43f5e'}, {name:'橙', hex:'#f97316'},
    {name:'黄', hex:'#f59e0b'}, {name:'绿', hex:'#10b981'},
    {name:'青', hex:'#06b6d4'}, {name:'蓝', hex:'#3b82f6'},
    {name:'紫', hex:'#8b5cf6'}, {name:'白', hex:'#ffffff'},
    {name:'灰', hex:'#94a3b8'}, {name:'粉', hex:'#ec4899'},
];

// Parameter metadata
state.PARAM_META = {
    track:{label:'轮距',unit:'mm',min:500,max:900,step:5},
    wheel_center_x:{label:'轮心 X',unit:'mm',min:-1200,max:200,step:5},
    wheel_center_z:{label:'轮心高度',unit:'mm',min:50,max:300,step:2},
    tire_radius:{label:'轮胎半径',unit:'mm',min:100,max:250,step:2},
    caster:{label:'后倾角',unit:'°',min:0,max:15,step:0.1},
    kpi:{label:'内倾角',unit:'°',min:0,max:10,step:0.1},
    kingpin_length:{label:'主销长度',unit:'mm',min:80,max:160,step:1},
    wheel_offset_y:{label:'轮心-主销Y偏距',unit:'mm',min:5,max:60,step:1},
    uca_front_x:{label:'上A臂前X',unit:'mm',min:-150,max:50,step:2},
    uca_rear_x:{label:'上A臂后X',unit:'mm',min:-50,max:150,step:2},
    uca_front_y:{label:'上A臂前Y',unit:'mm',min:100,max:320,step:2},
    uca_rear_y:{label:'上A臂后Y',unit:'mm',min:100,max:320,step:2},
    uca_front_z:{label:'上A臂前Z',unit:'mm',min:50,max:250,step:2},
    uca_rear_z:{label:'上A臂后Z',unit:'mm',min:100,max:350,step:2},
    lca_front_x:{label:'下A臂前X',unit:'mm',min:-150,max:50,step:2},
    lca_rear_x:{label:'下A臂后X',unit:'mm',min:-50,max:150,step:2},
    lca_front_y:{label:'下A臂前Y',unit:'mm',min:80,max:280,step:2},
    lca_rear_y:{label:'下A臂后Y',unit:'mm',min:80,max:280,step:2},
    lca_front_z:{label:'下A臂前Z',unit:'mm',min:20,max:150,step:2},
    lca_rear_z:{label:'下A臂后Z',unit:'mm',min:20,max:150,step:2},
    tierod_inner_y:{label:'转向拉杆内Y',unit:'mm',min:50,max:180,step:2},
    tierod_inner_z:{label:'转向拉杆内Z',unit:'mm',min:50,max:200,step:2},
    tierod_inner_x:{label:'转向拉杆内X',unit:'mm',min:-150,max:0,step:2},
    pushrod_ch5_x:{label:'推杆CH5 X',unit:'mm',min:-50,max:100,step:2},
    pushrod_ch5_y:{label:'推杆CH5 Y',unit:'mm',min:50,max:200,step:2},
    pushrod_ch5_z:{label:'推杆CH5 Z',unit:'mm',min:150,max:350,step:2},
    tire_spring_rate:{label:'轮胎刚度',unit:'N/mm',min:50,max:400,step:5},
    corner_weight_n:{label:'单轮载荷',unit:'N',min:150,max:800,step:10},
};
