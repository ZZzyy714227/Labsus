# DWB 全底盘改造（整车运动学工具台）实施计划

> **执行状态（2026-08-21）**：T1 ✅ `103f1c0`｜T2 ✅ `88b199c`｜T3 ✅（并入 T2）｜T4 ✅ `ae24b56`｜T5 ✅ `a09748c`｜T6 ✅ `80f654c`/`8d4b8ca`/`fa5ffe1`/`3a77e65`。代码侧全部完成并经 DOM 存根全链路冒烟实证；**浏览器 8 项验收待用户实测**（本机 Edge headless 无输出，无法自验渲染）。

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans（本计划推荐本会话内联执行——单文件 2100 行 HTML 强耦合，子代理难以脱离上下文安全修改）。

**Goal:** 在不改动 DWB-SIM 既有资产（轮跳驱动、齿条转向链路、连杆几何约束链、立柱/弹簧建模——均为用户确认正确）的前提下，把 `double-wishbone-suspension.html` 增长式扩展为"前+后轴四轮同屏、硬点可拖可存、整车运动学可分析"的全底盘工具台；唯一建模缺口是后轴。

**Architecture:** 单文件内增长：`SIM.R/L` → `SIM.C={fr,fl,rr,rl}` 同构四机构；`buildMech` 参数化；`S.axles` 双轴硬点 + `axleView` 轴开关；后轴按可编辑轴距布置于 Y≈−wb；前后轴解耦（无车架耦合）。持久化 localStorage + JSON 导入导出。

**Tech Stack:** 纯浏览器 JS/Canvas2D（无依赖），沿用参考既有风格。

**设计规格：** `docs/superpowers/specs/2026-08-21-dwb-full-chassis-design.md`

---

## 文件结构

- Modify：`double-wishbone-suspension.html`（唯一改动的文件；所有任务按函数/行锚点修改，不拆文件）
- Test：手工验收清单（第 9 节）+ headless Edge 引导冒烟（可复用 DEVLOG 记载的 `--headless=new --dump-dom` 方式，注意可能超时，超时则以手动验收为准）
- Docs：`docs/DEVLOG.md`（每任务提交时同步简笔）

> 行号锚点来自 2026-08-21 通读版本（2104 行）。执行者若发现位移，以函数名为准（grep）。

---

### Task 1: 数据层 —— 双轴硬点、轴视图、四轮行程、整车预设

**Files:** Modify `double-wishbone-suspension.html`（`S` L309-333 / `PRESETS` L283-305 / `loadPreset` L326-332 区域）

- [ ] **Step 1: 改造全局状态 `S`（含旧字段兼容）**

在 `const S={...}` 中新增：
```js
axles:{front:{hp:{},tire:null},rear:{hp:{},tire:null}},   // 前后轴独立硬点/轮胎
axleView:"all",              // "all" | "front" | "rear"
wb:2450,                     // 轴距 mm（整车布置用）
trFR:0,trFL:0,trRR:0,trRL:0, // 四轮独立轮跳（mm）
pitch:0,                     // 整车俯仰角输入（°，分轴映射）
vehicle:{kS:80,cB:6,cR:10,kT:200,mS:340},  // 整车弹性参数（沿用现有字段名）
```
现有 `S.hp/S.tire/travel/roll` 保留为"当前轴模板"语义（兼容既有代码路径，Task 2 起逐步迁移消费点）。

- [ ] **Step 2: 预设整车化**

`PRESETS` 每项除现有 `hp/tire/…` 外新增 `hpRear`（后轴硬点 = 前轴几何平移至 Y−wb：`{k:[x, y-wb, z]}`）与 `tireRear`（沿用 front tire）。`loadPreset` 同步填充 `S.axles.front/rear`。

- [ ] **Step 3: 保存/加载**

新增 `persistState()` / `loadPersist()`：
```js
function persistState(){try{localStorage.setItem("dwbFullChassis",JSON.stringify({
  axles:S.axles,wb:S.wb,vehicle:S.vehicle,preset:S.preset,axleView:S.axleView}));}catch(e){}}
function loadPersist(){try{const s=localStorage.getItem("dwbFullChassis");if(s){const j=JSON.parse(s);
  if(j.axles&&j.axles.front&&j.axles.rear){S.axles=j.axles;S.wb=j.wb||2450;
    S.vehicle=Object.assign(S.vehicle,j.vehicle||{});S.preset=j.preset||S.preset;S.axleView=j.axleView||"all";return true;}}
  }catch(e){} return false;}
```
启动（`buildLeft()` 前）`loadPersist()`；每次硬点拖拽/输入变更后 `persistState()`（节流：与 130ms 扫掠节流同频即可）。

- [ ] **Step 4: JSON 导出/导入**

新增 `exportJSON()`（Blob 下载，结构 `{meta,preset,axles,wb,vehicle}`）与 `importJSON(fileInput)`（`FileReader` + 结构校验 + `rebuild()`），并在左栏"输入量"区加按钮【导出整车 JSON】【导入整车 JSON】。

- [ ] **Step 5: 验证**

用浏览器打开文件：改后轴硬点→刷新→仍在（localStorage）；导出→导入→数值一致。无 console error。提交（含 DEVLOG 一行）。

---

### Task 2: 机构层 —— buildMech 参数化 + 四角配置 + 整车驱动

**Files:** `buildMech` L357-411 / `setChassis` L492-497 / `resetMech` L499-502 / `simulate` L738-765 / `refreshDerived` L709-733

- [ ] **Step 1: buildMech(axleKey, sideKey)**

`buildMech(axleKey="front", sideKey="r")`：从 `S.axles[axleKey]` 取该轮硬点：
```js
function buildMech(axleKey,sideKey){
  const s=sideKey==="r"?1:-1;
  const hp=S.axles[axleKey].hp;            // 存储侧=右模板；左侧镜像
  const P=id=>{const p=hp[id];return [p[0]*s,p[1],p[2]];};
  // 用 P(id) 替代原 buildMech 内直接读 S.hp 的 9 处（节点/刚线/cluster rel）
  // 其余（LINKDEF 装配、HPDEF、铰链/刚体簇、DOF）逻辑逐字保持不变
}
```
`HPDEF` 增加"所属轴"字段或在 builder 内按 `axleKey` 映射 `RACK/FL1` 语义：后轴 `steer=false`（`S.axles.rear.steer=false`，驱动时 rack 恒 0，FL1 保持设计位）。

- [ ] **Step 2: SIM.C 四机构**

`SIM.C={fr:null,fl:null,rr:null,rl:null}`；`rebuild()` 改为 `SIM.C.fr=buildMech("front","r"); SIM.C.fl=buildMech("front","l"); SIM.C.rr=buildMech("rear","r"); SIM.C.rl=buildMech("rear","l");` 旧 `SIM.R/L` 消费点统一改走 `SIM.C.fr/fl`（前轴语义）或按轮取用。

- [ ] **Step 3: 整车驱动合成（simulate 重构）**

新增 `cornerTravel(corner)`：
```js
function cornerTravel(c){
  let t=S.trFL; if(c==="fr")t=S.trFR; if(c==="rr")t=S.trRR; if(c==="rl")t=S.trRL;
  const front=c[0]==="f", left=c[1]==="l";
  // 整车侧倾：各轴左右差 = 半轮距·tan(roll)（DWB rollOffset 分轴应用）
  const half=SIM.m[c]&&SIM.m[c].cp?Math.abs(SIM.m[c].cp[0]):762;
  t+=(left?-1:1)*half*Math.tan(S.roll*D2R);
  // 整车俯仰：前组 +、后组 −（Δ=可编辑 pitch * 前轴一半；近似按 wb 比例）
  t+=(front?1:-1)*S.pitch*4;   // 4mm/° 为默认换算，后续可加滑块
  return clamp(t,S.trMin,S.trMax);
}
```
`simulate()`：四角分别 `driveTo(SIM.C[k], z0_k+cornerTravel(k), rackOf(k))`（`rackOf=fr/fl,前轴:S.rack；rr/rl:0`）；前轴转角读数沿用，后轴恒 0。双侧 RC/整车 RC 轴线综合在 Task 5。

- [ ] **Step 4: 残留残差与状态栏**

状态栏残差改为四轮 max（`SIM.C` 各 `residual` 取 max）；"node/rigid/dof"读数以 `SIM.C` 任一机构为准（四机构同构，数值一致）。

---

### Task 3: 轴语义 —— 后轴无转向，前轴转向视觉保持（不动立柱/弹簧）

**Files:** `setChassis` L492-497 / `simulate` 四角驱动（Task2 已建）/ `drawOverlay` L1331-1433（前束弧/阿克曼）/ `addInstance` 弹簧接线核对（只核对不改）

> 用户裁定（2026-08-21）：参考的立柱（主销）与弹簧连接是正确的，本轮**不做**"主销旋转修复/弹簧连接统一"——四轴同构自动沿用参考建模；此处仅保证新后轴的"无转向"语义与既有前轴转向视觉不回归。

- [ ] **Step 1: 后轴无转向语义**

后轴驱动 `rack=0`（`rackOf("rr"/"rl")→0`），`FL1` 保持设计位（`setChassis` 不施加 rack 平移）；`S.steerExc`/转向激励仅作用于前轴。

- [ ] **Step 2: 前轴转向视觉保持**

俯视图转向弧/阿克曼/转向中心仅前轴（现状如此，四轮同框后确认不串到后轴）；后轴显示静态前束弧（toe0 读数）。

- [ ] **Step 3: 弹簧接线核对（只核对不改建模）**

`addInstance` 后轴实例的弹簧两端（SPR↔DMP_T）从 `S.axles.rear.hp` 取值，确认接对；如有取值错误只修取值路径。

---

### Task 4: 视图/场景层 —— 整车同框 + 轴开关

**Files:** `buildScene` L816-822 / `addInstance` L893-1043 / `addShared` L824-891 / `fitPoints` L1114-1127 / 顶栏/左栏 UI

- [ ] **Step 1: 整车坐标布置**

`buildScene()`：四轮实例位置——前轴 `T` 变换保留；后轴实例在构建时整体平移 `[0,-S.wb,0]`（`addInstance` 增加 `trans` 参数，或场景图元写入时叠加）。`addShared` 车架盒纵跨 `[-wb-余量, +余量]`，减振器塔/转向机按轴分别绘。

- [ ] **Step 2: 轴开关**

`S.axleView` 切换按钮（顶栏三态：ALL/FRONT/REAR）；`buildScene` 按 `axleView` 过滤实例；`fitPoints` 同过滤；`fitView` 联动。

- [ ] **Step 3: 图元段数自适应**

四轮全开时若掉帧：轮圈 44→32、弹簧段 190→120、制动盘 32→24（对齐 DEVLOG 2026-08-20 的降段先例），并保留 `S.show.mirror` 语义为"对侧轮开/关"。

---

### Task 5: 分析读数/曲线 —— 四轮同表 + 整车指标 + 新曲线

**Files:** `buildRight` L1644-1728 / `updateReadouts` L1803-1879 / `drawPlots` L1937-1961

- [ ] **Step 1: 四轮定位角同表**

右栏"车轮定位参数"改为 4×N 小表（列=fr/fl/rr/rl，行=camber/toe/caster/kpi/scrub/trail/incl），`updateReadouts` 同时刷新四角 `metrics` 值；保留旧单角行高亮（当前 `axleView==="all"` 时显示四角，否则单轴）。

- [ ] **Step 2: 整车读数**

新增分组"整车 VEHICLE"：`rcF/rcR`（各轴在 0 行程的 RC 高）、`rcAxle`（前后 RC 连线高——在 X=0 剖面按线性插值）、`antiDive/antiSquat`；`wbChg = max(abs(cp_x_rr - cp_x_fr_...))` 用四角接地点几何差；`trackChg` 同 DWB 每轴逻辑分轴报。

- [ ] **Step 3: 曲线**

现有 5 条曲线加轴开关（front/rear 切换，复用 `SIM.swF/swR`）；新增第 6 组（右栏曲线区加子标签或复用 5 条之一切换）：整车 RC 随 roll、整车轴距变化随轮跳、前后 camber 对比（双线同图）。
`runSweep` 扩展：`axleKey` 参数（扫当前轴 45 点），整车曲线用两侧同向/反向驱动扫掠合成。

---

### Task 6: 交互与性能收口

**Files:** `loop` L2069-2092 / `drawPlots` / 快捷键 L2041-2056 / 左栏

- [ ] **Step 1: 快捷键与轴开关**

`1-4` 保持视图最大化；新增 `A`=axleView 轮换；方向键轮跳作用于"当前视图轴的对应侧"（all 时作用于前轴，维持旧手感）。

- [ ] **Step 2: 性能实测与降级**

headless Edge 冒烟（如超时则以手动为准）+ 手动跟帧：全显示层开、四轮同框、播放扫掠的帧率；超预算按 Task4 Step3 降段 + 扫掠节流 130→180ms。

- [ ] **Step 3: DEVLOG + 提交**

DEVLOG 记录本轮改造要点与验收打勾结果（参照第 9 节清单）。

---

## 7. 测试策略

- 无自动化测试载体（单文件前端）；以**浏览器手动验收清单**为主 + headless 冒烟辅助：
  - headless：`msedge --headless=new --virtual-time-budget=6000 --dump-dom file:///...`（注意可能超时/无输出，超时以手动为准）；
  - 手动：第 9 节 8 项逐条打勾。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 单文件行数膨胀（2100→~3000+） | 严格沿用编号分区；新增代码自成区块注释；不改既有函数内部逻辑（只扩展） |
| localStorage 在 file:// 受限 | try/catch 静默 + JSON 文件兜底（Task1 Step3 已设计） |
| 四轮同框掉帧 | 图元降段 + 节流放宽（Task4/6） |
| 解耦不彻底（隐式耦合） | 验收项 #8：单轴输入→另一轴读数不变 |
| 现有 46 项 v2 测试无关（后端不动） | 本改造不触碰 src/，仅 html + docs |

## 9. 验收清单（手动，逐项打勾）

- [ ] 1 四轮同框 + 轴开关（all/front/rear）正确
- [ ] 2 拖后轴节点只改后轴；保存后刷新仍在
- [ ] 3 转向时前轮 toe in/out 视觉+读数正确、后轮不动
- [ ] 4 曲线随整车工况常驻 + 游标正确
- [ ] 5 四轮全行程残差 ≤0.02mm、无 console error
- [ ] 6 预设/JSON 导出/导入往返一致
- [ ] 7 拖动不卡（肉眼 60fps 目标）
- [ ] 8 前后轴解耦：仅后轴轮跳→前轴读数不变（反之亦然）

## 10. 提交节奏

每 Task 一个 commit（`docs: full-chassis Tn …`）；最终 commit 含验收清单打勾结果与 DEVLOG。