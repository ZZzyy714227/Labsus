# 前推杆/后拉杆正式悬架（FSR-06）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `dwb-mod/double-wishbone-suspension.html` 中落地正式的前推杆+后拉杆双叉臂拓扑（新节点 PR_L/PR_U、显式推/拉杆分支、前高后低摇臂与水平减振器、泪滴渲染、FSR-06 默认预设），全量保留运动学/动力学仿真并回归验证。

**Architecture:** 单文件 HTML。机构层 `HPDEF/LINKDEF/buildMech/addPushrodMode` 扩展节点与显式分支；求解层不改算法（复用上轮已修复的摇臂 X 轴投影、RK_B 轻质量、K=12 局部内迭代）；渲染层 `addInstance/addShared` 增加泪滴叉臂、摇臂多边形、Heim 关节、水平减振器与配色；验证层用 Node24 + DOM 桩 harness（`.workbuddy/tmp/dwb_harness.mjs`）跑启动+300 帧回归与几何极限断言。

**Tech Stack:** 纯浏览器 JS（ES6+，无构建）；验证用 Node.js `vm` + 自定义 DOM 桩。

---

### Task 1: HPDEF 增加 PR 节点 + 新默认预设 FSR-06 数据

**Files:**
- Modify: `dwb-mod/double-wishbone-suspension.html`（HPDEF、PRESETS、loadPreset 的 rearRk 机制沿用）
- Test: `.workbuddy/tmp/dwb_harness.mjs`（seed 逻辑需按名字查预设，见 Task 6）

- [ ] **Step 1: 检查当前文件关键段**

读 `dwb-mod/double-wishbone-suspension.html` 确认 `HPDEF` 数组与 `PRESETS` 对象现状（约 267-318 行与 343-357 行 `loadPreset`）。

- [ ] **Step 2: HPDEF 追加 PR_L / PR_U 节点**

在 `["SPR_L",...]` 行之后插入两行（保持 ID 顺序与刚体归属）：

```js
 ["PR_L",  "推杆下点",      "PUSHROD LWR END",  "lca",    0, 0.6],
 ["PR_U",  "拉杆上点",      "PULLROD UPR END",  "uca",    0, 0.6],
```

`HPI` 索引自动重建，无需其他改动。

- [ ] **Step 3: 新增 FSR-06 预设（含全部 16 点前后轴数据）**

在 `PRESETS` 对象末尾（`"PROD 前推后拉（FSAE）"` 之后）追加：

```js
 "FSR-06 前推后拉正式版":{
   hp:{LCA_F:[250,165,130],LCA_R:[250,-165,138],LBJ:[745,10,165],SPR_L:[600,12,180],
       PR_L:[700,12,178],
       UCA_F:[430,120,435],UCA_R:[430,-120,440],UBJ:[690,-5,480],
       WC:[800,0,318],TRO:[680,-150,240],RACK:[270,-180,245],
       RK_PIVOT:[320,0,640],RK_A:[360,240,598],RK_B:[320,-107,567],DMP_T:[360,-260,598]},
   /* 后轴差异点（其余前轴平移 Y-1500 自动生成，此表与 spec §4.2 完全一致） */
   rearRk:{PR_U:[695,-1505,495],
           RK_PIVOT:[280,-1500,110],RK_A:[360,-1260,110],
           RK_B:[280,-1500,290],DMP_T:[360,-1230,108]},
   tire:{R:318,W:245,rim:215.9,disc:170,label:"245/40R17"},
   cam0:-3.0,toe0:0.05,mS:300,kS:95,kT:240,cB:8,cR:12,wb:3000,hcg:300
  }
```

> Task 6（ddeacde）已按验收调整 RK_PIVOT/RK_B，此表为最终值。

- [ ] **Step 4: FSR-06 设为默认预设**

`PRESET_KEYS` 来自 `Object.keys(PRESETS)`，顺序即插入顺序。将 FSR-06 条目**插入到 PRESETS 对象的最前面**（SPORT 之前），使 `S.preset=PRESET_KEYS[0]` 默认选中 FSR-06。

- [ ] **Step 5: 验证数据层无语法错误**

抽取 `<script>` 体做语法检查（参考 Task 6 的 harness 命令），并跑一次 `fresh` 场景 boot。

验证：`node .workbuddy/tmp/dwb_harness.mjs <html> fresh` 输出 `[boot] {"preset":"FSR-06 前推后拉正式版",...}`，无异常。

- [ ] **Step 6: Commit**

```bash
git add dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): HPDEF add PR_L/PR_U; PRESETS add FSR-06 (wb 3000, track 1600) as default"
```

---

### Task 2: buildMech 簇成员存在性过滤 + addPushrodMode 显式前推后拉

**Files:**
- Modify: `dwb-mod/double-wishbone-suspension.html`（buildMech、addPushrodMode、sweepProj 已有内迭代不动）

- [ ] **Step 1: buildMech 的 hinge 簇按存在性组装**

现有代码：

```js
  const cl=[
    hinge("LCA","下摆臂","LCA_F","LCA_R",["LBJ","SPR_L"]),
    hinge("UCA","上摆臂","UCA_F","UCA_R",["UBJ"]),
    freeBody("KNUCKLE","转向节+轮毂总成",["LBJ","UBJ","WC","TRO"])
  ];
```

改为（成员列表先过滤不存在的节点，兼容旧预设/旧存档）：

```js
  const has = id => i[id] !== undefined;
  const cl=[
    hinge("LCA","下摆臂","LCA_F","LCA_R",["LBJ","SPR_L","PR_L"].filter(has)),
    hinge("UCA","上摆臂","UCA_F","UCA_R",["UBJ","PR_U"].filter(has)),
    freeBody("KNUCKLE","转向节+轮毂总成",["LBJ","UBJ","WC","TRO"].filter(has))
  ];
```

`hinge()` 内部 `members.map(m=>i[m])` 与 `n[i[m]]` 均依赖成员存在，过滤后安全。

- [ ] **Step 2: addPushrodMode 改为按 axleKey 显式推/拉**

现有函数体（约 429-449 行）整体替换为：

```js
function addPushrodMode(M){
  if(M.i["RK_PIVOT"]===undefined||M.i["RK_A"]===undefined||M.i["RK_B"]===undefined) return;
  const i=M.i,n=M.n;
  /* 前轴=推杆（LCA 外端 PR_L→RK_B）; 后轴=拉杆（UCA 外端 PR_U→RK_B） */
  const rodFrom = M.axleKey==="rear" ? "PR_U" : "PR_L";
  if(i[rodFrom]===undefined) return;               // 旧预设/旧存档无推拉杆点 → 退回纯叉臂
  m_L_push(M,rodFrom,i,n);
}
function m_L_push(M,rodFrom,i,n){
  const n0=n[i[rodFrom]], n1=n[i["RK_B"]];
  M.L.push({a:i[rodFrom],b:i["RK_B"],id:rodFrom+"_rod",type:"R",
    zh:M.axleKey==="rear"?"拉杆":"推杆",grp:"rod",
    L0:dst(n0.p,n1.p),Ld:dst(n0.p,n1.p)});
  const di=M.L.findIndex(l=>l.grp==="damper");
  if(di>=0){M.L[di].a=i["RK_A"];M.L[di].b=i["DMP_T"];
    M.L[di].L0=dst(n[i["RK_A"]].p,n[i["DMP_T"]].p);M.L[di].Ld=M.L[di].L0;}
  M.cl.push({kind:"hinge",name:"ROCKER",zh:"摇臂",
    axA:i["RK_PIVOT"],axB:i["RK_PIVOT"],
    ids:[i["RK_A"],i["RK_B"]],
    rel:[sub(n[i["RK_A"]].p0,n[i["RK_PIVOT"]].p0),sub(n[i["RK_B"]].p0,n[i["RK_PIVOT"]].p0)],
    wt:[Math.max(n[i["RK_A"]].m,1e-3),Math.max(n[i["RK_B"]].m,1e-3)]});
}
```

（如觉得拆分函数冗余，可合并成一个函数体内完成；此处拆分仅为可读性，允许内联。）

- [ ] **Step 3: 验证四机制可构建**

`node .workbuddy/tmp/dwb_harness.mjs <html> fresh` → boot 无异常；随后 Task 6 完整回归。

- [ ] **Step 4: Commit**

```bash
git add dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): explicit pushrod(front)/pullrod(rear) branch by axleKey; hinge members existence filter"
```

---

### Task 3: metrics.sl 改按实际弹性线端点

**Files:**
- Modify: `dwb-mod/double-wishbone-suspension.html`（metrics 函数返回值）

- [ ] **Step 1: 修改 metrics 返回值中的 sl 字段**

现有（约 698 行）：

```js
    ic:ic,rcH:rcH,svic:svic,anti:anti,sl:dst(spl,P("DMP_T")),
```

改为（弹簧长度取实际弹性线端点，推杆模式= RK_A→DMP_T，旧预设= SPR_L→DMP_T）：

```js
    ic:ic,rcH:rcH,svic:svic,anti:anti,
    sl:(M.spring?dst(M.n[M.spring.a].p,M.n[M.spring.b].p):dst(spl,P("DMP_T"))),
```

`M.spring` 已在 buildMech 末尾赋值（`M.spring=sp; M.springL0=sp.Ld`）。确认无其他使用 `sl` 假设。

- [ ] **Step 2: 验证读数不崩**

Task 6 回归时检查 `[frames]` 无异常、`snap()` 中行程正常（updateReadouts 内部走 sampleSweep(sw,...,"sl") 与 setRO("sl")）。

- [ ] **Step 3: Commit**

```bash
git add dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): metrics.sl uses actual elastic line endpoints (RK_A->DMP_T in pushrod mode)"
```

---

### Task 4: 渲染 —— 泪滴叉臂 + 摇臂 + 推/拉杆 + Heim 关节 + 配色

**Files:**
- Modify: `dwb-mod/double-wishbone-suspension.html`（C 调色板、addInstance、新增 teardropPts）

- [ ] **Step 1: 调色板新增碳纤黑/钛银**

在 `C` 对象（约 906-920 行）追加：

```js
  carbon:"#23282e",rocker:"#b9c2c9",
```

- [ ] **Step 2: 新增泪滴轮廓生成器**

在 `cylinder(...)` 函数之后插入：

```js
/* 泪滴形杆体轮廓：a=外端(圆钝半圆) → b=内端(收尖)
   w=最大宽度；多边形近似，供 PL() 填充+描边 */
function teardropPts(a,b,w){
  const d=sub(b,a),L=len(d)||1,u=mul(d,1/L);
  let ref=[0,1,0]; if(abs(dot(ref,u))>0.9)ref=[1,0,0];
  const v=nrm(sub(ref,mul(u,dot(ref,u)))), R=w*0.5, pts=[];
  /* 圆钝端：以 a 为心半圆（外法向 u） */
  const N=8;
  for(let k=0;k<=N;k++){
    const an=-PI/2+PI*k/N;
    pts.push([a[0]+u[0]*R*Math.cos(an)+v[0]*R*Math.sin(an),
              a[1]+u[1]*R*Math.cos(an)+v[1]*R*Math.sin(an),
              a[2]+u[2]*R*Math.cos(an)+v[2]*R*Math.sin(an)]);
  }
  /* 收尖段：从 a+R 到 b，半宽线性收窄至 0 */
  const T=14;
  for(let k=1;k<=T;k++){
    const t=k/T, x0=R, x=R+(L-R)*t, ww=R*(1-t);
    pts.push([a[0]+u[0]*x+v[0]*ww,
              a[1]+u[1]*x+v[1]*ww,
              a[2]+u[2]*x+v[2]*ww]);
  }
  return pts;   // 首尾由调用方闭合（PL 需显式闭合点）
}
```

- [ ] **Step 3: addInstance 中把叉臂面片替换为泪滴**

现有（约 1064-1073 行）：

```js
  if(S.show.face){
    PL(sc,[LAF,LBJ,LAR,LAF],C.rigArm,1,null,C.arm);
    PL(sc,[UAF,UBJ,UAR,UAF],C.rigArm,1,null,C.arm);
    ...
```

替换叉臂两行为泪滴绘制（转向节面片保留原样）：

```js
  if(S.show.face){
    const tear=(A,B,w)=>{
      const P=teardropPts(A,B,w); P.push(P[0]);
      PL(sc,P,C.carbon,1.15,null,"rgba(35,40,46,0.45)");
    };
    tear(LAF,LBJ,34); tear(LAR,LBJ,34);
    tear(UAF,UBJ,30); tear(UAR,UBJ,30);
    PL(sc,[LBJ,UBJ,WC,LBJ],C.knu,1,null,C.knuF);
    PL(sc,[LBJ,UBJ,TRO,LBJ],C.knu,1,null,C.knuF);
    PL(sc,[LBJ,WC,TRO,LBJ],C.knu,1,null,C.knuF);
    PL(sc,[UBJ,WC,TRO,UBJ],C.knu,1,null,C.knuF);
    PL(sc,[LAF,SPL,LAR,LAF],C.rigArm,1,null,C.arm);
  }
```

泪滴宽度 30-34mm（叉臂中段直径），球头端圆钝、铰端收尖。

- [ ] **Step 4: 推/拉杆 + 摇臂 + Heim 关节绘制**

现有推杆模式渲染块（约 1138-1154 行）`if(M.cl.find(c=>c.name==="ROCKER")){...}` 整体替换为：

```js
  if(M.cl.find(c=>c.name==="ROCKER")){
    const i=M.i;
    const piv=T(M.n[i.RK_PIVOT].p), rkA=T(M.n[i.RK_A].p), rkB=T(M.n[i.RK_B].p);
    /* 摇臂本体（钛银）：枢轴→两臂端多边形 */
    PL(sc,[piv,rkA,piv,rkB,piv],C.rocker,1.1,null,"rgba(185,194,201,0.35)");
    cylinder(sc,piv,rkA,7,C.rocker,1,8);
    cylinder(sc,piv,rkB,5,C.rocker,1,6);
    /* 推杆/拉杆（碳纤黑圆柱 + Heim 球头） */
    const rod=M.L.find(l=>l.grp==="rod");
    if(rod){
      const rA=T(M.n[rod.a].p),rB=T(M.n[rod.b].p);
      cylinder(sc,rA,rB,8,C.carbon,1.2,10);
      L3(sc,rA,rB,C.carbon,2.2);
      [[rA,12],[rB,12]].forEach(q=>{
        PL(sc,circPts(q[0],[1,0,0],q[1],12),C.rig,1);
        PL(sc,circPts(q[0],[0,1,0],q[1],12),C.rig,1);
        PL(sc,circPts(q[0],[0,0,1],q[1],12),C.rig,1);
      });
    }
    cylinder(sc,sub(piv,[0,0,12]),add(piv,[0,0,12]),12,C.chas,1,8);
  }
```

- [ ] **Step 5: 验证渲染路径无异常**

`node .workbuddy/tmp/dwb_harness.mjs <html> fresh` → `[loop] completed without exception`（drawAll 构建场景含新图元，桩 ctx 全 no-op，纯 JS 层验证）。

- [ ] **Step 6: Commit**

```bash
git add dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): teardrop A-arms (carbon), titanium rocker, push/pull-rod cylinders + Heim joints"
```

---

### Task 5: 渲染 —— 水平减振器支架（addShared 改造）

**Files:**
- Modify: `dwb-mod/double-wishbone-suspension.html`（addShared 减振器塔区）

- [ ] **Step 1: 现有"减振器塔"块替换为按轴水平支架**

现有约 984-1000 行的 `减振器塔` 双循环（前/后轴各绘垂直塔）整体替换为（if/else 双分支：新预设走水平支架，旧预设保留原垂直塔）：

```js
    const sgn2=[1].concat(mir?[-1]:[]);
    const axHps2=[h];if(S.axles&&S.axles.rear&&S.axles.rear.hp)axHps2.push(S.axles.rear.hp);
    sgn2.forEach(s=>axHps2.forEach(hpA=>{
      if(hpA.RK_A&&hpA.DMP_T){
        /* 水平减振器支架（前高后低按轴数据） */
        const A=[hpA.RK_A[0]*s,hpA.RK_A[1],hpA.RK_A[2]];
        const B=[hpA.DMP_T[0]*s,hpA.DMP_T[1],hpA.DMP_T[2]];
        cylinder(sc,A,B,14,C.chas,1,10);                        // 水平筒体
        cylinder(sc,sub(A,[0,0,10]),add(A,[0,0,10]),20,C.chas,1,8);  // 摇臂端支承
        cylinder(sc,sub(B,[0,0,10]),add(B,[0,0,10]),20,C.chas,1,8);  // 支架端支承
        L3(sc,B,[B[0],B[1],0],C.chas2,1,[4,4]);                 // 落地立柱
      }else{
        /* 旧预设：原垂直塔（逐字保留原代码） */
        const T=[hpA.DMP_T[0]*s,hpA.DMP_T[1],hpA.DMP_T[2]];
        const tw=62,tl=78,tz=T[2]+16;
        const top=[[T[0]-tw,T[1]-tl,tz],[T[0]+tw,T[1]-tl,tz],[T[0]+tw,T[1]+tl,tz],[T[0]-tw,T[1]+tl,tz]];
        PL(sc,top.concat([top[0]]),C.chas,1.2);
        L3(sc,top[0],[s*bx,T[1]-tl,z1],C.chas,1);
        L3(sc,top[1],[s*bx,T[1]-tl,z1],C.chas,1);
        L3(sc,top[2],[s*bx,T[1]+tl,z1],C.chas,1);
        L3(sc,top[3],[s*bx,T[1]+tl,z1],C.chas,1);
        L3(sc,[s*bx,T[1]-tl,z1],[s*bx,T[1]+tl,z1],C.chas,1);
        /* 上支点座 */
        cylinder(sc,[T[0],T[1],T[2]-10],[T[0],T[1],T[2]+10],34,C.chas,1,14);
      }
    }));
```

实现时若两分支冗长，可接受最小化：仅当 `hpA.RK_A&&hpA.DMP_T` 存在时走新块，否则沿用未被改动的原垂直塔代码（即保留原代码并把新块作为先行分支）。

- [ ] **Step 2: 验证 fresh（FSR-06）/旧预设两路径**

`node .workbuddy/tmp/dwb_harness.mjs <html> fresh` 与 `... <html> sport-rear` 均零异常。

- [ ] **Step 3: Commit**

```bash
git add dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): per-axle horizontal damper cradle (front high / rear low), guarded for legacy presets"
```

---

### Task 6: harness 扩展 + 全量回归验收（含 FSR-06 专项断言）

**Files:**
- Modify: `.workbuddy/tmp/dwb_harness.mjs`（seed 按名字查预设；新增 check 断言）

- [ ] **Step 1: seed 逻辑按预设名字查找**

现有 `__H.seed` 注入段用 `PRESET_KEYS[3]`（PROD）。替换为按场景名匹配：

```js
  vm.runInContext(`
    __H.seed = (() => {
      const N=${JSON.stringify(scenario==="fsr06"?"FSR-06 前推后拉正式版":(scenario==="prod"?"PROD 前推后拉（FSAE）":null))};
      if(N){loadPreset(PRESET_KEYS.find(k=>k===N)||PRESET_KEYS[0]);}
      if(${scenario==="sport-rear"}) S.axleView="rear";
      persistState();
      return localStorage.getItem("dwbFullChassis");
    })();
  `, ctx1, {timeout:120000});
```

并允许 `scenario="fsr06"` 走 phase-1 种子流程（条件 `scenario === "prod" || scenario === "sport-rear"` 改为含 fsr06）。

- [ ] **Step 2: 新增专项断言 check()**

在 DRIVER 的 `__H` 对象中追加：

```js
    check(){
      const g=SIM.geo, gR=SIM.geoRR;
      const okGeo = g && g[1]-g[0]>=120 && gR && gR[1]-gR[0]>=120;   // ≥±60
      const tr=R=>{let mn=1e9,mx=-1e9;R.forEach(x=>{mn=Math.min(mn,x);mx=Math.max(mx,x);});return [mn,mx];};
      return {geo:g&&g.map(x=>+x.toFixed(0)), geoRR:gR&&gR.map(x=>+x.toFixed(0)),
              okGeo, resR:+SIM.R.res.toFixed(4), okR:SIM.R.ok};
    }
```

- [ ] **Step 3: 回归命令与预期**

```bash
node .workbuddy/tmp/dwb_harness.mjs <html> fresh      # 默认=FSR-06
node .workbuddy/tmp/dwb_harness.mjs <html> fsr06
node .workbuddy/tmp/dwb_harness.mjs <html> prod       # 旧 PROD 存档兼容
node .workbuddy/tmp/dwb_harness.mjs <html> sport-rear # 旧 SPORT + 后轴视图兼容
```

每个场景期望：
- `[frames]` `n:300`、无 `LOOP EXCEPTION`、`play:true`、`trSamples` 出现 ≥±40 的满幅采样（新预设）
- `[snap]` FSR-06 场景：`geo` 与 `geoRR` 范围 ≥ ±60mm（`okGeo:true`）、`okR:true`

若 `findLimits` 未达 ±60：属数据问题 —— 在 FSR-06 预设微调 `RK_B/RK_PIVOT/PR_*` 坐标（每次 ±10mm 步进）直至达标（推杆角保持 40-50°、拉杆 ≥25°）。

- [ ] **Step 4: Commit**

```bash
git add .workbuddy/tmp/dwb_harness.mjs dwb-mod/double-wishbone-suspension.html
git commit -m "dwb(P1): harness seed by preset name + FSR-06 travel-limit assertions; geometry tuned to findLimits >= ±60mm"
```

---

### Task 7: 文档同步 + 收尾提交

**Files:**
- Modify: `docs/DEVLOG.md`

- [ ] **Step 1: DEVLOG 顶部追加条目**

在 `# 开发日志` 之后插入（沿用现有条目风格）：

```markdown
## 2026-08-21 — 正式构建前推杆/后拉杆悬架（FSR-06 默认预设，dwb-mod）
- 需求：用户批准 spec（docs/superpowers/specs/2026-08-21-front-pushrod-rear-pullrod-design.md）后开工。
- 实现：HPDEF +PR_L/PR_U；addPushrodMode 按 axleKey 显式推/拉分支；hinge 簇成员存在性过滤（旧存档兼容）；metrics.sl 改实际弹性线端点；渲染新增泪滴叉臂/钛银摇臂/Heim/水平减振器支架（前后轴高低分置）；新默认预设 FSR-06（轴距 3000/轮距 1600/cam0 −3°）。
- 验证：harness 四场景 300 帧零异常；FSR-06 前后轴 findLimits ≥ ±60mm、残差达标。
- 提交：dwb-mod HTML + harness + DEVLOG。
```

- [ ] **Step 2: 全量回归再跑一遍 + commit**

```bash
git add docs/DEVLOG.md
git commit -m "docs(dwb): DEVLOG entry for FSR-06 front-pushrod/rear-pullrod build"
```

---

## Self-Review 记录

- **Spec 覆盖**：节点表 §3.1→Task1/2；链路 §3.2→Task2；簇 §3.3→Task2；显式分支 §3.4→Task2；硬点表 §4→Task1；求解适配 §5→Task2（数据驱动，无算法改动）+Task3（sl）；渲染 §7→Task4/5；预设兼容 §8→Task1/2/5 守卫；验收 §9→Task6；非目标 §10 不触碰。
- **类型一致性**：`M.spring` 在 buildMech 已赋值；`has` 过滤器、`teardropPts` 返回闭合前点列（PL 需显式闭合，Task4 已 `push(P[0])`）；`AXRK/DMP_T` 守卫覆盖旧预设。
- **执行者须知**：全部修改都在单 HTML 内；harness 路径为相对仓库根的 `.workbuddy/tmp/dwb_harness.mjs`；任何 findLimits 不达标时按 Task6 Step3 的数据微调指引处理，不轻易改求解器参数。