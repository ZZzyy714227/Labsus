"use strict";
/* ============================================================
   LABSUS v4 · 主题管理器 + 布局重组适配器（12 号脚本）
   在 01–11 模块全部加载并完成启动（buildLeft/buildRight/initViews）
   之后执行，零侵入地把旧产物重排为「舞台 + 坞站」新版布局，
   并提供三套预设配色 + 自由配色方案（CSS 变量 + 画布 PAL 双通道）。
   ============================================================ */
const V4={theme:"classic",mode:"dark",custom:{},vcur:3,quad:false,runMode:"geo"};

/* ---------- 工具 ---------- */
function v4Rgba(hex,a){
  const h=hex.replace("#","");
  const n=parseInt(h.length===3?h.split("").map(c=>c+c).join(""):h,16);
  return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
}

/* ---------- 主题令牌键（clearOverrides 用） ---------- */
const V4_TOKEN_KEYS=["bg-base","glass","glass-2","glass-3","glass-hov","sh-bg",
  "glass-bd","glass-bd-2","hairline","ink-1","ink-2","ink-3","cream",
  "pri","pri-strong","pri-fill","pri-bd","ok","warn","err","ok-fill","warn-fill","err-fill",
  "track","well","knob","acc-in","acc-out","acc-in-fill","acc-out-fill"];

/* ============================================================
   预设 1/2：玫瑰紫韵（配色卡 No.44 + No.48）· 落日靛蓝（配色卡 No.64）
   css = CSS 变量覆盖；pal = 画布调色板对 PAL[模式] 的替换映射
   ============================================================ */
const V4THEMES={
rose:{
  name:"玫瑰紫韵",desc:"No.44 · 48",
  dots:["#f25d9c","#b61aae","#9e579d","#574b90"],
  css:{
  dark:{"bg-base":"#141127","glass":"rgba(27,23,53,0.82)","glass-2":"rgba(27,23,53,0.65)","glass-3":"rgba(38,32,72,0.70)",
    "glass-hov":"rgba(122,96,180,0.30)","sh-bg":"rgba(30,25,58,0.80)",
    "glass-bd":"rgba(255,255,255,0.10)","glass-bd-2":"rgba(255,255,255,0.15)","hairline":"rgba(255,255,255,0.06)",
    "ink-1":"#ece9f6","ink-2":"#a9a3c2","ink-3":"#6f6890","cream":"#fc85ae",
    "pri":"#b79ce8","pri-strong":"#9d7fd8","pri-fill":"rgba(158,87,157,0.25)","pri-bd":"rgba(183,156,232,0.35)",
    "ok":"#9e579d","warn":"#f25d9c","err":"#b61aae",
    "ok-fill":"rgba(158,87,157,0.18)","warn-fill":"rgba(242,93,156,0.12)","err-fill":"rgba(182,26,174,0.22)",
    "track":"rgba(255,255,255,0.08)","well":"rgba(12,9,30,0.60)","knob":"#fc85ae",
    "acc-in":"#fc85ae","acc-out":"#9e579d","acc-in-fill":"rgba(252,133,174,0.10)","acc-out-fill":"rgba(158,87,157,0.09)"},
  light:{"bg-base":"#f7f2f6","glass":"rgba(255,255,255,0.88)","glass-2":"rgba(247,240,246,0.75)","glass-3":"rgba(240,231,240,0.80)",
    "glass-hov":"rgba(255,255,255,0.95)","sh-bg":"rgba(240,231,240,0.85)",
    "glass-bd":"rgba(42,36,64,0.10)","glass-bd-2":"rgba(42,36,64,0.16)","hairline":"rgba(42,36,64,0.06)",
    "ink-1":"#2a2440","ink-2":"#675f85","ink-3":"#9d95b5","cream":"#ee6f9f",
    "pri":"#7b5fc0","pri-strong":"#64489f","pri-fill":"rgba(158,87,157,0.12)","pri-bd":"rgba(123,95,192,0.30)",
    "ok":"#8a4a89","warn":"#e2448a","err":"#a0139a",
    "ok-fill":"rgba(138,74,137,0.14)","warn-fill":"rgba(226,68,138,0.12)","err-fill":"rgba(160,19,154,0.10)",
    "track":"rgba(42,36,64,0.10)","well":"rgba(255,255,255,0.70)","knob":"#ee6f9f",
    "acc-in":"#ee6f9f","acc-out":"#8a4a89","acc-in-fill":"rgba(238,111,159,0.08)","acc-out-fill":"rgba(138,74,137,0.07)"}},
  pal:{
  dark:{bg:"#141127",grid:"#1e1938",grid2:"#2a2350",axis:"#3d3568",
    rig:"#a99fc4",rigArm:"#c0b8da",arm:"rgba(180,160,220,0.06)",
    strut:"#b79ce8",rocker:"#fc85ae",rockerF:"rgba(252,133,174,0.14)",
    ela:"#fc85ae",elaF:"rgba(252,133,174,0.10)",
    node:"#b79ce8",nodeFix:"#b61aae",nodeSel:"#f2ecfa",
    knu:"#f25d9c",knuF:"rgba(242,93,156,0.08)",
    tire:"#5a5470",tread:"#3b3748",rim:"#7a748f",disc:"#665f7a",cal:"#b07a92",
    kp:"#b61aae",kpsw:"rgba(182,26,174,0.16)",kpg:"#b61aae",
    tie:"#9e579d",rack:"#4a4363",chas:"#3d3752",chas2:"#2f2a40",
    gnd:"#363046",path:"#b61aae",pathC:"#9e579d",pathK:"#fc85ae",
    ic:"#f25d9c",rc:"#9e579d",dim:"#7a7090",dimT:"#b5abc9",
    arb:"#8a79c9",frc:"#b61aae",txt:"#ece9f6",txt2:"#a9a3c2",txt3:"#6f6890",base:"#6f6890"},
  light:{bg:"#f7f2f6",grid:"#e9e0ee",grid2:"#dcd0e6",axis:"#c6b8d4",
    rig:"#8c86a2",rigArm:"#6e6883",arm:"rgba(120,90,160,0.05)",
    strut:"#7b5fc0",rocker:"#ee6f9f",rockerF:"rgba(238,111,159,0.14)",
    ela:"#ee6f9f",elaF:"rgba(238,111,159,0.10)",
    node:"#7b5fc0",nodeFix:"#a0139a",nodeSel:"#2a2440",
    knu:"#e2448a",knuF:"rgba(226,68,138,0.08)",
    tire:"#7c7a8b",tread:"#5c5a6b",rim:"#9a98a7",disc:"#8a8898",cal:"#b07a82",
    kp:"#a0139a",kpsw:"rgba(160,19,154,0.14)",kpg:"#a0139a",
    tie:"#8a4a89",rack:"#8a8898",chas:"#a9a6b5",chas2:"#b9b6c3",
    gnd:"#e0d8e4",path:"#a0139a",pathC:"#8a4a89",pathK:"#ee6f9f",
    ic:"#e2448a",rc:"#8a4a89",dim:"#9a98a7",dimT:"#5c5a6b",
    arb:"#8a6bb0",frc:"#a0139a",txt:"#2a2440",txt2:"#675f85",txt3:"#9d95b5",base:"#a9a6b5"}}
},
sunset:{
  name:"落日靛蓝",desc:"No.64",
  dots:["#ffbd39","#e61c5d","#930077","#3a0088"],
  css:{
  dark:{"bg-base":"#130b2e","glass":"rgba(26,17,69,0.82)","glass-2":"rgba(26,17,69,0.65)","glass-3":"rgba(38,26,94,0.70)",
    "glass-hov":"rgba(120,90,200,0.28)","sh-bg":"rgba(30,20,76,0.80)",
    "glass-bd":"rgba(255,255,255,0.10)","glass-bd-2":"rgba(255,255,255,0.15)","hairline":"rgba(255,255,255,0.06)",
    "ink-1":"#efecf7","ink-2":"#aaa2c8","ink-3":"#6f6694","cream":"#ffbd39",
    "pri":"#9f7fe8","pri-strong":"#8a66d6","pri-fill":"rgba(147,0,119,0.22)","pri-bd":"rgba(159,127,232,0.35)",
    "ok":"#ffbd39","warn":"#e61c5d","err":"#e61c5d",
    "ok-fill":"rgba(255,189,57,0.14)","warn-fill":"rgba(230,28,93,0.12)","err-fill":"rgba(230,28,93,0.22)",
    "track":"rgba(255,255,255,0.08)","well":"rgba(10,5,32,0.60)","knob":"#ffbd39",
    "acc-in":"#ffbd39","acc-out":"#e61c5d","acc-in-fill":"rgba(255,189,57,0.10)","acc-out-fill":"rgba(230,28,93,0.09)"},
  light:{"bg-base":"#f8f5ef","glass":"rgba(255,255,255,0.88)","glass-2":"rgba(244,239,229,0.75)","glass-3":"rgba(238,231,218,0.80)",
    "glass-hov":"rgba(255,255,255,0.95)","sh-bg":"rgba(238,231,218,0.85)",
    "glass-bd":"rgba(34,26,58,0.10)","glass-bd-2":"rgba(34,26,58,0.16)","hairline":"rgba(34,26,58,0.06)",
    "ink-1":"#221a3a","ink-2":"#5d5480","ink-3":"#9790b5","cream":"#e8a41e",
    "pri":"#6b4fc0","pri-strong":"#57409e","pri-fill":"rgba(147,0,119,0.10)","pri-bd":"rgba(107,79,192,0.30)",
    "ok":"#d99a12","warn":"#d91257","err":"#d91257",
    "ok-fill":"rgba(217,154,18,0.14)","warn-fill":"rgba(217,18,87,0.10)","err-fill":"rgba(217,18,87,0.10)",
    "track":"rgba(34,26,58,0.10)","well":"rgba(255,255,255,0.70)","knob":"#e8a41e",
    "acc-in":"#e8a41e","acc-out":"#d91257","acc-in-fill":"rgba(232,164,30,0.08)","acc-out-fill":"rgba(217,18,87,0.07)"}},
  pal:{
  dark:{bg:"#130b2e",grid:"#1c1245",grid2:"#291b5e",axis:"#3c2e78",
    rig:"#a9a2c4",rigArm:"#c0bada",arm:"rgba(170,150,230,0.06)",
    strut:"#9f7fe8",rocker:"#ffbd39",rockerF:"rgba(255,189,57,0.14)",
    ela:"#ffbd39",elaF:"rgba(255,189,57,0.10)",
    node:"#9f7fe8",nodeFix:"#e61c5d",nodeSel:"#f4eefa",
    knu:"#ffbd39",knuF:"rgba(255,189,57,0.08)",
    tire:"#5a5470",tread:"#3b3448",rim:"#7a7490",disc:"#665f7c",cal:"#c98c65",
    kp:"#e61c5d",kpsw:"rgba(230,28,93,0.16)",kpg:"#e61c5d",
    tie:"#c04aa8",rack:"#4a4363",chas:"#3b3452",chas2:"#2d2740",
    gnd:"#342c46",path:"#e61c5d",pathC:"#ffbd39",pathK:"#ffbd39",
    ic:"#ffbd39",rc:"#ffbd39",dim:"#7a7090",dimT:"#b8aecc",
    arb:"#a44ac0",frc:"#e61c5d",txt:"#efecf7",txt2:"#aaa2c8",txt3:"#6f6694",base:"#6f6694"},
  light:{bg:"#f8f5ef",grid:"#eae2d4",grid2:"#ddd2be",axis:"#c6b9a2",
    rig:"#8c8a9a",rigArm:"#6e6c7b",arm:"rgba(120,80,180,0.05)",
    strut:"#6b4fc0",rocker:"#e8a41e",rockerF:"rgba(232,164,30,0.14)",
    ela:"#e8a41e",elaF:"rgba(232,164,30,0.10)",
    node:"#6b4fc0",nodeFix:"#d91257",nodeSel:"#221a3a",
    knu:"#e8a41e",knuF:"rgba(232,164,30,0.08)",
    tire:"#7c7e85",tread:"#5c5e65",rim:"#9a9ca3",disc:"#8a8c93",cal:"#b07a52",
    kp:"#d91257",kpsw:"rgba(217,18,87,0.14)",kpg:"#d91257",
    tie:"#930077",rack:"#8a8c93",chas:"#aba9b2",chas2:"#bbb9c1",
    gnd:"#e2dcce",path:"#d91257",pathC:"#d99a12",pathK:"#e8a41e",
    ic:"#e8a41e",rc:"#d99a12",dim:"#9a9ca3",dimT:"#5c5e65",
    arb:"#93538f",frc:"#d91257",txt:"#221a3a",txt2:"#5d5480",txt3:"#9790b5",base:"#aba9b2"}}
}};

/* ---------- 画布调色板：基于经典 PAL 做键替换 ---------- */
function v4TintPal(mode,map){
  const o={};for(const k in PAL[mode])o[k]=(map&&map[k]!==undefined)?map[k]:PAL[mode][k];return o;
}

/* ---------- 自定义配色 ---------- */
const V4_CUSTOM_DEF={bg:"#130b2e",panel:"#1a1145",pri:"#9f7fe8",acc:"#ffbd39",ok:"#ffbd39",warn:"#e61c5d",err:"#e61c5d",ink:"#efecf7"};
const V4_CUSTOM_LB={bg:"背景",panel:"面板",pri:"主色",acc:"强调",ok:"成功",warn:"警告",err:"危险",ink:"文字"};
function v4CustomCss(mode){
  const k=V4.custom,dk=mode==="dark";
  return {"bg-base":k.bg,
    "glass":v4Rgba(k.panel,dk?0.82:0.88),"glass-2":v4Rgba(k.panel,dk?0.65:0.75),"glass-3":v4Rgba(k.panel,dk?0.70:0.80),
    "glass-hov":v4Rgba(k.pri,dk?0.18:0.10),"sh-bg":v4Rgba(k.panel,dk?0.80:0.85),
    "ink-1":k.ink,"ink-2":v4Rgba(k.ink,0.68),"ink-3":v4Rgba(k.ink,0.42),
    "cream":k.acc,"pri":k.pri,"pri-strong":k.pri,
    "pri-fill":v4Rgba(k.pri,dk?0.25:0.10),"pri-bd":v4Rgba(k.pri,0.35),
    "ok":k.ok,"warn":k.warn,"err":k.err,
    "ok-fill":v4Rgba(k.ok,0.15),"warn-fill":v4Rgba(k.warn,0.12),"err-fill":v4Rgba(k.err,0.20),
    "well":v4Rgba(k.bg,dk?0.60:0.70),"knob":k.acc,
    "acc-in":k.acc,"acc-out":k.ok,"acc-in-fill":v4Rgba(k.acc,0.10),"acc-out-fill":v4Rgba(k.ok,0.09)};
}
function v4CustomPal(mode){
  const k=V4.custom,dk=mode==="dark";
  return {bg:k.bg,strut:k.pri,node:k.pri,nodeSel:dk?"#ffffff":"#1a1a2e",
    rocker:k.acc,rockerF:v4Rgba(k.acc,0.14),ela:k.acc,elaF:v4Rgba(k.acc,0.10),pathK:k.acc,
    kp:k.err,kpsw:v4Rgba(k.err,0.16),kpg:k.err,frc:k.err,nodeFix:k.err,
    path:k.warn,pathC:k.ok,rc:k.ok,tie:k.ok,ic:k.acc,
    knu:k.acc,knuF:v4Rgba(k.acc,0.08),txt:k.ink,txt2:v4Rgba(k.ink,0.68),txt3:v4Rgba(k.ink,0.42)};
}

/* ---------- 应用主题（双通道：CSS 变量 + 画布 C） ---------- */
function v4Apply(theme,mode,save){
  V4.theme=theme;V4.mode=mode;
  document.documentElement.setAttribute("data-theme",mode);
  const st=document.documentElement.style;
  V4_TOKEN_KEYS.forEach(k=>st.removeProperty("--"+k));
  let css=null,pal=null;
  if(theme==="custom"){css=v4CustomCss(mode);pal=v4TintPal(mode,v4CustomPal(mode));}
  else if(V4THEMES[theme]){css=V4THEMES[theme].css[mode];pal=v4TintPal(mode,V4THEMES[theme].pal[mode]);}
  if(css)for(const k in css)st.setProperty("--"+k,css[k]);
  if(pal)Object.assign(C,pal);else Object.assign(C,PAL[mode]);
  try{localStorage.setItem("labsus-theme",mode);}catch(e){}
  if(save!==false){try{localStorage.setItem("labsus-theme-v4",JSON.stringify({theme:theme,mode:mode,custom:V4.custom}));}catch(e){}}
  v4RenderThemePop();
}

/* ---------- 主题选择浮层 ---------- */
function v4BuildThemePop(){
  const pop=document.getElementById("v4ThemePop");if(!pop)return;
  pop.innerHTML="";
  const h=document.createElement("div");h.className="tp-h";h.textContent="配色方案 THEME";pop.appendChild(h);
  const presets=[["classic","墨蓝经典","原版 · 普鲁士蓝",["#8AB4D8","#E8D4BF","#943948","#7A8C7E"]],
    ["rose",V4THEMES.rose.name,V4THEMES.rose.desc,V4THEMES.rose.dots],
    ["sunset",V4THEMES.sunset.name,V4THEMES.sunset.desc,V4THEMES.sunset.dots],
    ["custom","自由配色","自定义 8 令牌",null]];
  presets.forEach(([key,nm,ds,dots])=>{
    const b=document.createElement("button");b.className="tp-preset";b.dataset.th=key;
    const d=document.createElement("span");d.className="tp-dots";
    (dots||Object.values(V4_CUSTOM_DEF).slice(0,4)).forEach(c=>{const i=document.createElement("i");i.style.background=c;d.appendChild(i);});
    const s1=document.createElement("span");s1.className="nm";s1.textContent=nm;
    const s2=document.createElement("span");s2.className="ds";s2.textContent=ds;
    b.appendChild(d);b.appendChild(s1);b.appendChild(s2);
    b.onclick=()=>{v4Apply(key,V4.mode,true);};
    pop.appendChild(b);
  });
  const sub=document.createElement("div");sub.className="tp-sub";sub.textContent="明暗模式 MODE";pop.appendChild(sub);
  const seg=document.createElement("div");seg.className="v4-seg";seg.id="v4ModeSeg2";
  [["dark","深色"],["light","浅色"]].forEach(([m,lb])=>{
    const b=document.createElement("button");b.dataset.m=m;b.textContent=lb;
    b.onclick=()=>{v4Apply(V4.theme,m,true);};seg.appendChild(b);});
  pop.appendChild(seg);
  const sub2=document.createElement("div");sub2.className="tp-sub";sub2.textContent="自定义令牌 CUSTOM TOKENS";pop.appendChild(sub2);
  const grid=document.createElement("div");grid.className="tp-custom";
  Object.keys(V4_CUSTOM_DEF).forEach(k=>{
    const lb=document.createElement("label");
    const inp=document.createElement("input");inp.type="color";inp.dataset.tk=k;inp.value=V4.custom[k]||V4_CUSTOM_DEF[k];
    inp.oninput=()=>{V4.custom[k]=inp.value;};
    const sp=document.createElement("span");sp.textContent=V4_CUSTOM_LB[k];
    lb.appendChild(inp);lb.appendChild(sp);grid.appendChild(lb);
  });
  pop.appendChild(grid);
  const act=document.createElement("div");act.className="tp-actions";
  const apply=document.createElement("button");apply.className="main";apply.textContent="应用自定义";
  apply.onclick=()=>{v4Apply("custom",V4.mode,true);};
  const reset=document.createElement("button");reset.textContent="恢复预设默认";
  reset.onclick=()=>{V4.custom=Object.assign({},V4_CUSTOM_DEF);
    grid.querySelectorAll("input").forEach(i=>i.value=V4.custom[i.dataset.tk]);
    v4Apply("classic",V4.mode,true);};
  act.appendChild(apply);act.appendChild(reset);pop.appendChild(act);
}
function v4RenderThemePop(){
  const pop=document.getElementById("v4ThemePop");if(!pop||!pop.innerHTML)return;
  pop.querySelectorAll(".tp-preset").forEach(b=>b.classList.toggle("on",b.dataset.th===V4.theme));
  const seg=document.getElementById("v4ModeSeg2");
  if(seg)seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.m===V4.mode));
}
function v4InitThemePicker(){
  const btn=document.getElementById("v4ThemeBtn"),pop=document.getElementById("v4ThemePop");
  if(!btn||!pop)return;
  btn.onclick=e=>{e.stopPropagation();
    if(pop.style.display==="none"){const r=btn.getBoundingClientRect();
      pop.style.top=(r.bottom+8)+"px";pop.style.right=Math.max(8,window.innerWidth-r.right)+"px";
      pop.style.display="block";}
    else pop.style.display="none";};
  document.addEventListener("click",e=>{if(pop.style.display==="block"&&!pop.contains(e.target))pop.style.display="none";});
  const tg=document.getElementById("themeTg");
  if(tg)tg.onclick=()=>{v4Apply(V4.theme,V4.mode==="light"?"dark":"light",true);};
}

/* ============================================================
   布局重组：左坞站三 Tab
   ============================================================ */
const V4_TUNE_T=/车型平台预设|悬架底盘模块编辑|几何与转向输入|多体求解模式|内置弹性与阻尼元件|横向稳定杆|准静态操稳工况/;
const V4_ANA_T=/引擎连接|整车底盘分析|动态驾驶测试|赛道动态遥测|4-Post|Baseline|轮胎实测标定|台架对拍|衬套刚度标定/;
const V4_SET_T=/硬点永久保存|系统显示|实体着色|3D 空间硬点表|显示图层控制/;
function v4ArrangeLeft(){
  const lp=document.getElementById("lp");if(!lp||lp.dataset.v4)return;lp.dataset.v4="1";
  const kids=[...lp.children];
  const bar=document.createElement("div");bar.className="v4-ltabs";
  const panes={};
  [["tune","调校"],["analyze","分析"],["setup","配置"]].forEach(([k,lb])=>{
    const b=document.createElement("button");b.className="v4-ltab";b.dataset.pane=k;b.textContent=lb;
    b.onclick=()=>{V4.lpane=k;
      bar.querySelectorAll(".v4-ltab").forEach(x=>x.classList.toggle("on",x===b));
      Object.keys(panes).forEach(p=>panes[p].classList.toggle("on",p===k));
      try{localStorage.setItem("labsus-v4-lpane",k);}catch(e){}};
    bar.appendChild(b);
    const p=document.createElement("div");p.className="v4-pane";p.dataset.pane=k;panes[k]=p;
  });
  lp.appendChild(bar);Object.keys(panes).forEach(k=>lp.appendChild(panes[k]));
  kids.forEach(el=>{
    if(el.classList.contains("sec")){
      const zh=el.querySelector(".sh .zh");
      const t=(zh?zh.textContent:"")+" "+(el.textContent||"").slice(0,40);
      const dst=V4_ANA_T.test(t)?"analyze":(V4_SET_T.test(t)?"setup":"tune");
      panes[dst].appendChild(el);
    } /* groupDiv 分隔符丢弃，由 Tab 替代分组语义 */
  });
  let saved="tune";try{saved=localStorage.getItem("labsus-v4-lpane")||"tune";}catch(e){}
  if(!panes[saved])saved="tune";
  bar.querySelector('[data-pane="'+saved+'"]').click();
  v4RestoreAccordions(lp);
  lp.addEventListener("click",e=>{
    const sh=e.target.closest(".sh");if(!sh)return;
    const s=sh.closest(".sec");if(!s)return;
    setTimeout(()=>{try{
      const acc=JSON.parse(localStorage.getItem("labsus-v4-acc")||"{}");
      const zh=s.querySelector(".sh .zh");
      acc[zh?zh.textContent:"?"]=s.classList.contains("col");
      localStorage.setItem("labsus-v4-acc",JSON.stringify(acc));
    }catch(err){}},0);
  });
  /* Baseline 快照后 buildRight 重建 DOM，补一次读数刷新消除 Delta 首帧 "--" */
  lp.addEventListener("click",e=>{
    const bt=e.target.closest("button");
    if(bt&&/快照基准线/.test(bt.textContent))setTimeout(()=>{if(typeof updateReadouts==="function")updateReadouts();},60);
  });
}
function v4RestoreAccordions(lp){
  let acc={};try{acc=JSON.parse(localStorage.getItem("labsus-v4-acc")||"{}");}catch(e){}
  lp.querySelectorAll(".sec").forEach(s=>{
    const zh=s.querySelector(".sh .zh");if(!zh)return;
    if(acc[zh.textContent]===true)s.classList.add("col");
    else if(acc[zh.textContent]===false)s.classList.remove("col");
  });
}
/* 折叠头摘要数字：折叠态也能扫到首条参数当前值（定时镜像，不依赖 UI.sync 以免被 buildRight 截断） */
function v4AccSummaries(){
  const secs=document.querySelectorAll("#lp .sec");
  secs.forEach(s=>{
    const sh=s.querySelector(".sh");if(!sh||sh.querySelector(".v4-sum"))return;
    const ctl=s.querySelector(".ctl");
    const inp=ctl?ctl.querySelector("input[type=number]"):null;
    const nCtl=s.querySelectorAll(".ctl").length;
    if(!inp&&!nCtl)return;
    let unit="";
    if(ctl){const m=(ctl.querySelector("label")?ctl.querySelector("label").textContent:"").match(/\[([^\]]+)\]/);if(m)unit=" "+m[1];}
    const sp=document.createElement("span");sp.className="v4-sum";
    const tg=sh.querySelector(".tg");
    if(tg)sh.insertBefore(sp,tg);else sh.appendChild(sp);
    s._v4sum=()=>{sp.textContent=(inp&&inp.value!=="")?(inp.value+unit):(nCtl+" 项");};
    s._v4sum();
  });
  setInterval(()=>{secs.forEach(s=>{if(s._v4sum)s._v4sum();});},500);
}

/* ============================================================
   右坞站：核心结论卡 + 诊断卡（镜像 #rp 内的实时读数）
   ============================================================ */
const V4_WIN={roCam:[-1.6,-0.6,"目标 −1.2°±0.4"],roToe:[-0.9,0.3,"目标窗口 −0.9~+0.3"],
  roRC:[30,75,"目标 30–75 mm"],roQsRollGrad:[0.1,0.8,"理想 ≤0.8 °/g"],
  roUsGrad:[0.2,2.0,"目标 0.2–2.0 °/g"]};
function v4BuildHero(){
  const host=document.getElementById("v4Hero");if(!host)return;
  host.innerHTML='<div class="v4-hero-hd"><b>核心结论</b><i>Key Results</i><span class="v4-live">实时</span></div>'+
  '<div class="v4-hero-grid">'+
  '<div class="v4-hc" id="hcCam"><div class="en">Camber 外倾</div><div class="v">--</div><div class="hint">'+V4_WIN.roCam[2]+'</div></div>'+
  '<div class="v4-hc" id="hcToe"><div class="en">Toe 前束</div><div class="v">--</div><div class="hint">'+V4_WIN.roToe[2]+'</div></div>'+
  '<div class="v4-hc" id="hcRc"><div class="en">Roll Center 侧倾中心</div><div class="v">--</div><div class="hint">'+V4_WIN.roRC[2]+'</div></div>'+
  '<div class="v4-hc" id="hcRg"><div class="en">Roll Gradient 侧倾梯度</div><div class="v">--</div><div class="hint">'+V4_WIN.roQsRollGrad[2]+'</div></div>'+
  '<div class="v4-hc" id="hcUs"><div class="en">US Gradient 不足转向梯度</div><div class="v">--</div><div class="hint">'+V4_WIN.roUsGrad[2]+'</div></div>'+
  '<div class="v4-hc" id="hcTl"><div class="en">TLLTD 前轴占比</div><div class="v">--</div><div class="v4-bar"><i id="hcTlBar"></i></div><div class="hint" id="hcTlHint">前 52% · 后 48%</div></div>'+
  '<div class="v4-hc" id="hcBias"><div class="en">Handling Bias 操稳倾向</div><div class="v" style="font-size:13px">--</div><div class="hint">准静态载荷转移判定</div></div>'+
  '</div>';
  const dg=document.getElementById("v4Diag");
  if(dg)dg.innerHTML='<div class="v4-hero-hd" style="margin-bottom:0"><b>诊断建议</b><i>Diagnostics</i>'+
    '<span class="v4-live" id="v4Score">--</span></div>'+
    '<p id="v4DiagTxt">运行分析后，此处给出综合评分与调校优先级建议；完整 24 项交通灯矩阵见评价报告。</p>'+
    '<button class="v4-mini" style="margin-top:8px;width:100%;justify-content:center" id="v4OpenEval">打开完整评价报告 →</button>';
  const oe=document.getElementById("v4OpenEval");
  if(oe)oe.onclick=()=>{if(typeof openSuspensionEvaluation==="function")openSuspensionEvaluation();};
  setInterval(v4MirrorHero,250);
}
function v4HcSet(id,val,good,warn){
  const c=document.getElementById(id);if(!c)return;
  const v=c.querySelector(".v");if(v)v.textContent=val;
  c.classList.remove("ok","warn","bad");
  if(good===true)c.classList.add("ok");else if(good===false)c.classList.add(warn==="bad"?"bad":"warn");
}
function v4MirrorHero(){
  if(typeof UI==="undefined"||!UI.ro)return;
  const txt=id=>{const e=UI.ro[id];return e?e.textContent:"--";};
  const num=s=>{const v=parseFloat(String(s).replace(/[^\d.\-]/g,""));return isFinite(v)?v:null;};
  [["hcCam","roCam"],["hcToe","roToe"],["hcRc","roRC"],["hcRg","roQsRollGrad"],["hcUs","roUsGrad"]].forEach(([hc,ro])=>{
    const t=txt(ro),v=num(t),w=V4_WIN[ro];
    v4HcSet(hc,t,v===null?null:(v>=w[0]&&v<=w[1]));
  });
  const bar=document.getElementById("tlltdBar"),lf=document.getElementById("tlltdLblF"),lr=document.getElementById("tlltdLblR");
  if(bar){const w=parseFloat(bar.style.width)||52;
    const hcTl=document.getElementById("hcTl");
    if(hcTl){hcTl.querySelector(".v").textContent=w.toFixed(1)+" %";
      hcTl.classList.remove("ok","warn","bad");hcTl.classList.add((w<47||w>54)?"warn":"ok");}
    const bb=document.getElementById("hcTlBar");if(bb)bb.style.width=w+"%";
    const hh=document.getElementById("hcTlHint");
    if(hh)hh.textContent=(lf?lf.textContent:"")+" · "+(lr?lr.textContent:"");
  }
  const bias=txt("roHandling");
  const hb=document.getElementById("hcBias");
  if(hb){hb.querySelector(".v").textContent=bias;
    hb.classList.remove("ok","warn","bad");
    if(/中性|平衡/.test(bias))hb.classList.add("ok");
    else if(bias!=="--")hb.classList.add("warn");}
  /* 诊断建议：基于 US Gradient 与操稳倾向给出调校优先级（底盘开发第一 KPI） */
  const dgTxt=document.getElementById("v4DiagTxt");
  if(dgTxt){const ku=num(txt("roUsGrad"));
    if(ku===null)dgTxt.textContent="请施加侧向工况（准静态 gy ≥ 0.02g）后，此处给出不足转向梯度诊断。";
    else if(ku<0)dgTxt.textContent="⚠ 梯度为负（过度转向）：建议软化后轴侧倾刚度（后 ARB/后弹簧）、或提高后轴负外倾增益，恢复稳定裕度。";
    else if(ku<0.2)dgTxt.textContent="梯度偏低（近中性）：高速稳定性裕度小；可前移侧倾刚度分配（加粗前 ARB）或增大前轴载荷转移占比。";
    else if(ku>2.0)dgTxt.textContent="梯度过大（强不足转向）：入弯迟钝；建议加粗后 ARB / 硬化后弹簧释放后轴，或核查前轴侧偏刚度是否过低。";
    else dgTxt.textContent="✓ 梯度在目标窗口（0.2–2.0 °/g）：转向平衡健康；结合侧倾梯度与 TLLTD 微调前后侧倾刚度分配。";}
  /* 引擎胶囊与评分同步 */
  if(typeof ENG!=="undefined"){
    const pill=document.getElementById("engPillV4");
    if(pill){pill.classList.toggle("warn",!ENG.ok);pill.classList.toggle("ok",!!ENG.ok);}
  }
  const sc=document.getElementById("evalOverallScore"),out=document.getElementById("v4Score");
  if(sc&&out)out.textContent=sc.textContent+" 分";
}

/* ============================================================
   中央舞台：单视口 / 四宫格 / 全屏
   ============================================================ */
function v4ShowView(i,silent){
  if(typeof VW==="undefined"||!VW.length)return;
  V4.vcur=i;
  const vp=document.getElementById("vp");
  if(!V4.quad){vp.classList.add("vp-single");
    VW.forEach((v,k)=>v.el.classList.toggle("v4-cur",k===i));}
  const seg=document.getElementById("v4ViewSeg");
  if(seg)seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",+b.dataset.vi===i));
  const tt=document.getElementById("v4VpTitle");
  if(tt&&typeof VDEF!=="undefined"&&VDEF[i])tt.textContent=VDEF[i].zh+" "+VDEF[i].en+" ["+VDEF[i].ax+"]";
  if(!silent)setTimeout(()=>{VW.forEach(v=>{const had=v.w>60;sizeView(v);if(!had)fitView(v);});},80);
}
function v4SetQuad(q){
  V4.quad=q;
  const vp=document.getElementById("vp");
  vp.classList.toggle("vp-single",!q);
  if(q)VW.forEach(v=>v.el.classList.remove("v4-cur"));else v4ShowView(V4.vcur,true);
  const b=document.getElementById("v4QuadBtn");if(b)b.classList.toggle("on",q);
  setTimeout(()=>{VW.forEach(v=>{const had=v.w>60;sizeView(v);if(!had)fitView(v);});},80);
}
function v4InitViewport(){
  const seg=document.getElementById("v4ViewSeg");
  if(seg)seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{v4SetQuad(false);v4ShowView(+b.dataset.vi);});
  const qb=document.getElementById("v4QuadBtn");if(qb)qb.onclick=()=>v4SetQuad(!V4.quad);
  const fb=document.getElementById("v4FullBtn");
  if(fb)fb.onclick=()=>{const st=document.getElementById("v4stage");
    if(document.fullscreenElement)document.exitFullscreen();
    else if(st&&st.requestFullscreen)st.requestFullscreen();};
  v4SetQuad(false);v4ShowView(V4.vcur);
}

/* ============================================================
   顶栏：运行路由 / 工作模式 / 轴切换 / 快捷键
   ============================================================ */
function v4Run(){
  const m=V4.runMode;
  if(m==="geo"){if(typeof rebuild==="function")rebuild();}
  else if(m==="kc"){if(typeof engineRun==="function")engineRun();}
  else if(m==="chassis"){if(typeof chassisRun==="function")chassisRun();}
  else if(m==="track"){if(typeof openCircuitStage==="function")openCircuitStage();}
}
function v4InitTopbar(){
  const seg=document.getElementById("v4ModeSeg");
  if(seg)seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    V4.runMode=b.dataset.mode;
    seg.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));});
  const run=document.getElementById("v4RunBtn");if(run)run.onclick=v4Run;
  const pill=document.getElementById("engPillV4");
  if(pill)pill.onclick=()=>{if(typeof ENG==="undefined")return;
    ENG.ok?engineDisconnect():engineConnect();};
  const af=document.getElementById("v4AxisF"),ar=document.getElementById("v4AxisR");
  const setAxis=a=>{if(typeof S!=="undefined"){S.axis=a;UI.sync.forEach(f=>f());}
    if(af)af.classList.toggle("on",a==="front");
    if(ar)ar.classList.toggle("on",a==="rear");};
  if(af)af.onclick=()=>setAxis("front");
  if(ar)ar.onclick=()=>setAxis("rear");
  document.addEventListener("keydown",e=>{
    const tag=(e.target.tagName||"").toUpperCase();
    if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA")return;
    if(e.code==="Space"){e.preventDefault();v4Run();}
    else if(/^Digit[1-4]$/.test(e.code)){v4SetQuad(false);v4ShowView(+e.code.slice(-1)-1);}
  });
}

/* ============================================================
   启动（11 号脚本已同步完成 buildLeft/buildRight/initViews）
   ============================================================ */
(function v4Boot(){
  if(typeof PAL==="undefined"||typeof C==="undefined")return; /* 兜底：旧模块未就绪 */
  V4.custom=Object.assign({},V4_CUSTOM_DEF);
  let cfg=null;try{cfg=JSON.parse(localStorage.getItem("labsus-theme-v4")||"null");}catch(e){}
  let mode=null;try{mode=localStorage.getItem("labsus-theme");}catch(e){}
  if(mode!=="light"&&mode!=="dark")mode=document.documentElement.getAttribute("data-theme")==="light"?"light":"dark";
  if(cfg&&cfg.custom)V4.custom=Object.assign({},V4_CUSTOM_DEF,cfg.custom);
  const th=(cfg&&(cfg.theme==="classic"||cfg.theme==="custom"||V4THEMES[cfg.theme]))?cfg.theme:"classic";
  v4BuildThemePop();
  v4Apply(th,mode,false);
  v4InitThemePicker();
  v4ArrangeLeft();
  v4AccSummaries();
  v4BuildHero();
  v4InitViewport();
  v4InitTopbar();
})();
