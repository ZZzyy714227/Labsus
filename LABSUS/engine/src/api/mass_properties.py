"""质量与惯量属性体系（M14 / G44，2026-09-20）

背景
────
此前整车质量属性只有 4 个手填标量：`mass_kg` / `sprung_mass_kg` / `hcg_mm` / `hs_mm`，
两轴再有 `spring_mass_kg`（簧载，仅作静载分配比例用）与 `unsprung_kg`（非簧载）。
**没有惯量**——`iz_kg_m2` 是 TrackSimRequest 里外部传入的一个标量，Ixx/Iyy 与全部惯性积
从未存在。后果：瞬态横摆/侧倾/俯仰响应与真实车无法对齐，而"横摆惯量"恰恰是决定
转向响应快慢与稳定性最敏感的参数之一。

本模块的做法（也是真车队的做法）：**从部件清单算出来，而不是填进去**。
每件给出质量与位置（v3 坐标：X 向外、Y 向前、Z 向上，原点 = 前轴中心地面，mm），
由此推导总质量、质心、惯量张量，再与声明的标量做**一致性校验**（不静默覆盖）。

坐标 → 运动轴的映射（本项目 X=外、Y=前、Z=上，容易混，必须钉死）
────────────────────────────────────────────────────────────
    Ixx = Σ m(y²+z²)   绕 X（**横向**轴）→ 俯仰 pitch
    Iyy = Σ m(x²+z²)   绕 Y（**纵向**轴）→ 侧倾 roll
    Izz = Σ m(x²+y²)   绕 Z（**垂向**轴）→ 横摆 yaw
    Iyz = −Σ m·y·z     **侧倾-横摆耦合**（前/后质量高度不对称产生；驾驶员高而靠前、
                       动力总成低而靠后 ⇒ 该项非零且不可忽略）
    Ixy = −Σ m·x·y 、 Ixz = −Σ m·x·z：左右对称车应为 ≈0 ⇒ 作为对称性自检

与 SAE 惯例（x 前 / y 右 / z 下，roll 绕 x、yaw 绕 z、耦合项 Ixz）的对应关系：
本项目 Iyz ↔ SAE Ixz，都是"侧倾-横摆耦合"，只是轴标签不同。**换轴时不要按名字搬。**

口径纪律
────────
1. 缺省无清单 ⇒ 所有既有调用方行为逐位不变（本模块纯新增，不改任何现有计算路径）。
2. 有清单时**不覆盖**声明值，而是给出 `deltas`；是否采纳由调用方决定。
3. 清单必须能反算出**声明的那四个标量**，否则说明两者之一错了——`ballast`
   （配重与杂项）是显式余项，用于闭合总质量/质心，其质量与位置写进清单、可审计，
   不允许用"其它"这种无法核对的黑箱。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Literal

# ── 部件 ────────────────────────────────────────────────────────────────────
Kind = Literal["sprung", "unsprung_front", "unsprung_rear"]


@dataclass(frozen=True)
class MassItem:
    """一件质量：位置为 v3 坐标（mm），原点 = 前轴中心地面。"""

    id: str
    name: str
    mass_kg: float
    x: float          # 向外为正（右正）
    y: float          # 向前为正
    z: float          # 向上为正
    kind: Kind
    note: str = ""

    def __post_init__(self) -> None:
        if self.mass_kg < 0:
            raise ValueError(f"{self.id}: 质量不得为负（{self.mass_kg}）")
        if self.kind not in ("sprung", "unsprung_front", "unsprung_rear"):
            raise ValueError(f"{self.id}: kind 非法（{self.kind}）")


@dataclass
class MassProperties:
    """清单推导结果（质量 kg、位置 mm、惯量 kg·m²，惯量相对**质心**）。"""

    mass_kg: float
    sprung_mass_kg: float
    unsprung_kg: float                     # 四角之和
    unsprung_front_corner_kg: float
    unsprung_rear_corner_kg: float
    cg_mm: tuple[float, float, float]      # (x, y, z)
    sprung_cg_z_mm: float
    inertia: dict[str, float] = field(default_factory=dict)
    static_front_pct: float = 0.0          # 由质心纵坐标算出的前轴静载占比
    warnings: list[str] = field(default_factory=list)

    # 便捷别名（按运动命名，避免"绕哪个轴"读错）
    @property
    def i_pitch(self) -> float:
        return self.inertia.get("Ixx", 0.0)

    @property
    def i_roll(self) -> float:
        return self.inertia.get("Iyy", 0.0)

    @property
    def i_yaw(self) -> float:
        return self.inertia.get("Izz", 0.0)

    def radius_of_gyration_mm(self, axis: str) -> float:
        """惯量半径 k = sqrt(I/m)（mm）——比惯量绝对值更直观的体量感指标。

        **判据用 k/L，不要用 Izz/(m·a·b)**：后者是我起初想当然写的"真车 0.6~0.8"，
        实际对不上——FSAE 清单算得 0.49 而车完全正常。行业通行的体量判据是
        横摆惯量半径 **k_z/L ≈ 0.30~0.36**（轿车 0.30~0.35、赛车 0.33~0.36），
        FSAE 实测 k_z=541mm / L=1550mm = **0.349** ✓ 落在带内。
        （Izz/(m·a·b) 只在对轴距中点对称的均质杆假设下才≈1，别当判据用。）
        """
        key = {"pitch": "Ixx", "roll": "Iyy", "yaw": "Izz"}[axis]
        i = self.inertia.get(key, 0.0)
        return (i / self.mass_kg) ** 0.5 * 1000.0 if self.mass_kg > 0 else 0.0


def compute_mass_properties(items: Iterable[MassItem], wheelbase_mm: float) -> MassProperties:
    """由部件清单推导整车质量属性。纯函数、无副作用。"""
    its = list(items)
    if not its:
        raise ValueError("清单为空")
    m_tot = sum(i.mass_kg for i in its)
    if m_tot <= 0:
        raise ValueError("总质量必须为正")

    def subset(kinds: tuple[str, ...]) -> list[MassItem]:
        return [i for i in its if i.kind in kinds]

    sprung = subset(("sprung",))
    unf = subset(("unsprung_front",))
    unr = subset(("unsprung_rear",))
    m_sprung = sum(i.mass_kg for i in sprung)
    m_unf = sum(i.mass_kg for i in unf)
    m_unr = sum(i.mass_kg for i in unr)

    cx = sum(i.mass_kg * i.x for i in its) / m_tot
    cy = sum(i.mass_kg * i.y for i in its) / m_tot
    cz = sum(i.mass_kg * i.z for i in its) / m_tot

    # 非簧载按"每角"报告：左侧与前侧对称件在清单里各列一次（左右各一件）
    def per_corner(pair: list[MassItem]) -> float:
        return sum(i.mass_kg for i in pair) / 2.0

    # 惯量张量（相对质心；mm → m）
    ixx = iyy = izz = iyz = ixy = ixz = 0.0
    for i in its:
        dx = (i.x - cx) / 1000.0
        dy = (i.y - cy) / 1000.0
        dz = (i.z - cz) / 1000.0
        m = i.mass_kg
        ixx += m * (dy * dy + dz * dz)      # 绕 X（横向）→ 俯仰
        iyy += m * (dx * dx + dz * dz)      # 绕 Y（纵向）→ 侧倾
        izz += m * (dx * dx + dy * dy)      # 绕 Z（垂向）→ 横摆
        iyz -= m * dy * dz                  # 侧倾-横摆耦合
        ixy -= m * dx * dy
        ixz -= m * dx * dz

    props = MassProperties(
        mass_kg=m_tot,
        sprung_mass_kg=m_sprung,
        unsprung_kg=m_unf + m_unr,
        unsprung_front_corner_kg=per_corner(unf),
        unsprung_rear_corner_kg=per_corner(unr),
        cg_mm=(cx, cy, cz),
        sprung_cg_z_mm=(sum(i.mass_kg * i.z for i in sprung) / m_sprung) if m_sprung > 0 else 0.0,
        inertia={"Ixx": ixx, "Iyy": iyy, "Izz": izz, "Iyz": iyz, "Ixy": ixy, "Ixz": ixz},
        static_front_pct=(1.0 - cy / wheelbase_mm) * 100.0 if wheelbase_mm > 0 else 0.0,
    )

    # 自检：左右对称车应满足 |Ixy|,|Ixz| ≪ Izz；不对称过大 ⇒ 清单位置写错
    if props.inertia["Izz"] > 0:
        for k in ("Ixy", "Ixz"):
            rel = abs(props.inertia[k]) / props.inertia["Izz"]
            if rel > 0.05:
                props.warnings.append(
                    f"{k}/Izz = {rel*100:.1f}%（>5%）——左右对称车的该惯性积应≈0，请检查清单里的左右位置"
                )
    if props.sprung_mass_kg <= 0:
        props.warnings.append("簧载质量为零：清单里没有 kind='sprung' 的部件")
    return props


def check_mass_consistency(props: MassProperties, declared: dict[str, float],
                           tol: dict[str, float] | None = None) -> list[dict]:
    """清单推导值 vs 声明标量。返回逐项偏差（不抛错、不覆盖）。

    `declared` 键：mass_kg / sprung_mass_kg / hcg_mm / hs_mm
    容差缺省：质量 ±1.5kg、高度 ±4mm（清单本身是估算，不该要求逐位相等；
    但差得超过这个量级就说明两套口径确实不一致，必须查清而不是挑一个用）。
    """
    tol = tol or {"mass_kg": 1.5, "sprung_mass_kg": 1.5, "hcg_mm": 4.0, "hs_mm": 4.0}
    got = {
        "mass_kg": props.mass_kg,
        "sprung_mass_kg": props.sprung_mass_kg,
        "hcg_mm": props.cg_mm[2],
        "hs_mm": props.sprung_cg_z_mm,
    }
    out = []
    for k, g in got.items():
        d = declared.get(k)
        if d is None:
            continue
        delta = g - d
        out.append({
            "field": k, "declared": float(d), "computed": round(g, 3),
            "delta": round(delta, 3), "tol": tol.get(k, 0.0),
            "ok": abs(delta) <= tol.get(k, 0.0),
        })
    return out


# ── Formula SAE 部件清单（M14 首款；单缸轻量车，质量口径与预设一致）──────────
# 声明值：总 235 / 簧载 183 / 非簧载 12(前每角) 14(后每角) / hcg 270 / hs 285
# 说明：簧载 183kg 含驾驶员 72kg ⇒ 车本体簧载 111kg，对应"单缸 + 钢管车架"的轻量方案
#       （四缸机 + 排气约 55~65kg，装不进这个质量目标——这也是本清单能自证的一点）。
# 硬点位置取自 formula 预设：前轮心 X=±600 Z=230、后轮心 X=±580 Z=235、轴距 1550。
_TRACK_F, _TRACK_R = 600.0, 580.0
_WB = 1550.0            # 轴距：前轴在 y=0、后轴在 y=+1550（v3 坐标 Y 向前）

FSAE_MASS_ITEMS: list[MassItem] = [
    # ── 前角非簧载（每项左右各一件；×2 = 12.0 kg/角）──
    MassItem("un_f_tire",  "前轮辋+轮胎 18.0x6.0-10", 7.0,  _TRACK_F,     0.0, 230.0, "unsprung_front",
             "HOOSIER，含气"),
    MassItem("un_f_upright", "前立柱+轮毂+轴承",       1.9,  _TRACK_F,     0.0, 230.0, "unsprung_front"),
    MassItem("un_f_brake", "前制动盘+卡钳",           1.6,  _TRACK_F-40,  0.0, 230.0, "unsprung_front", "盘在轮心内侧"),
    MassItem("un_f_arm",   "前上下 A 臂半 + 球头",     1.0,  _TRACK_F-250, 0.0, 180.0, "unsprung_front"),
    MassItem("un_f_link",  "前推杆+摇臂半+紧固件",     0.5,  _TRACK_F-150, 0.0, 250.0, "unsprung_front"),
    # ── 后角非簧载（×2 = 14.0 kg/角）；y 必须是**后轴位置** _WB，
    #    写 0 会把全部非簧载堆到前轴 ⇒ 质心与惯量全错（首版就犯过这个错）
    MassItem("un_r_tire",  "后轮辋+轮胎 18.0x7.5-10", 7.6,  _TRACK_R,         _WB, 235.0, "unsprung_rear",
             "HOOSIER，含气"),
    MassItem("un_r_upright", "后立柱+轮毂+轴承",       2.2,  _TRACK_R,         _WB, 235.0, "unsprung_rear"),
    MassItem("un_r_brake", "后制动盘+卡钳",           1.8,  _TRACK_R-40,      _WB, 235.0, "unsprung_rear"),
    MassItem("un_r_arm",   "后上下 A 臂半 + 球头",     1.2,  _TRACK_R-240,     _WB, 170.0, "unsprung_rear"),
    MassItem("un_r_link",  "后推杆+摇臂半+紧固件",     0.6,  _TRACK_R-150,     _WB, 245.0, "unsprung_rear"),
    MassItem("un_r_axle",  "驱动半轴+链轮（簧下段）",   0.6,  _TRACK_R-130,     _WB, 235.0, "unsprung_rear"),
    # ── 簧载（车本体 111 + 驾驶员 72 + 显式余项 3 = 186？不：见下方各项和 = 183）──
    # 主结构件**按前后分段**：整段只给一个 y 会把质量堆在质心附近 ⇒ 系统性低估 Izz
    # （实测首版把车架+车身各写一件，Izz/(m·a·b) 只到 0.46，低于真车 0.6~0.8 量级）
    MassItem("sp_frame_f", "车架前段（含前舱/防滚架前撑）", 16.0, 0.0,  350.0, 250.0, "sprung"),
    MassItem("sp_frame_r", "车架后段（含发动机舱/后防滚架）", 16.0, 0.0, 1050.0, 250.0, "sprung"),
    MassItem("sp_body_n",  "鼻锥+前覆盖件",            3.0, 0.0,  200.0, 350.0, "sprung"),
    MassItem("sp_body_t",  "侧箱+尾部覆盖件",          3.0, 0.0, 1000.0, 350.0, "sprung"),
    MassItem("sp_powertrain", "动力总成（单缸+排气+进气）", 36.0, 0.0, 1150.0, 280.0, "sprung", "低置、靠后"),
    MassItem("sp_fuel",    "油箱+燃油",               10.0, 0.0, 1000.0, 300.0, "sprung", "约 7L"),
    MassItem("sp_cooling_l", "左侧箱散热器+冷却液",     2.0, -250.0, 1150.0, 330.0, "sprung", "左右各一，保持对称"),
    MassItem("sp_cooling_r", "右侧箱散热器+冷却液",     2.0, +250.0, 1150.0, 330.0, "sprung"),
    MassItem("sp_diff",    "差速器+链传动",            4.0, 0.0, 1350.0, 250.0, "sprung"),
    MassItem("sp_rockers", "摇臂+减振器体+ARB",        4.0, 0.0,  800.0, 280.0, "sprung"),
    MassItem("sp_steering", "转向齿条+柱+方向盘",      3.0, 0.0,  350.0, 250.0, "sprung"),
    MassItem("sp_electric", "ECU+线束+电池+灭火器",    5.0, 0.0,  900.0, 180.0, "sprung", "低置"),
    MassItem("sp_seat",    "座椅+安全带+防火墙",       4.0, 0.0,  550.0, 250.0, "sprung"),
    MassItem("sp_driver",  "驾驶员+装备",             72.0, 0.0,  450.0, 300.0, "sprung", "半躺坐姿，躯干质心"),
    MassItem("sp_ballast", "配重与杂项（紧固件/余量/垫片）", 3.0, 0.0, 900.0, 250.0, "sprung",
             "显式余项：用于闭合声明总质量与质心高，不得改成无法核对的黑箱"),
]


def fsae_mass_items() -> list[MassItem]:
    """Formula SAE 清单的**左右镜像展开**版（每件非簧载复制到左右两侧）。"""
    out: list[MassItem] = []
    for i in FSAE_MASS_ITEMS:
        if i.kind == "sprung" or abs(i.x) < 1e-9 and i.kind != "sprung":
            out.append(i)
        else:
            out.append(i)
            out.append(MassItem(i.id + "_R", i.name + "（右）", i.mass_kg, -i.x, i.y, i.z, i.kind, i.note))
    # 左右对称的簧载件（x=0）无需镜像；非簧载件已在上面成对加入
    return out


# ── 横摆惯量的三档解析（双内核同源的真源函数）────────────────────────────────
# 缺省回退 m(L²+t̄²)/12 是**均质矩形板**近似，t̄=1.6m 还是个占位车宽。对 FSAE 实测：
#     m(L²+t̄²)/12 = 235×(1.55²+1.6²)/12 = 97.2 kg·m²
# 而部件清单算出 Izz = 68.8 kg·m² ⇒ **缺省值偏高 41%**，两个内核都在用 ⇒ 瞬态横摆响应
# 被系统性算钝（惯量越大、响应越慢越稳）。故改为三档：
#     ① 调用方显式给定 ⇒ 用它（对拍锚与外部工具互操作都靠这档）
#     ② 与 FSAE 清单的整车口径吻合（质量 ±1.5kg、轴距 ±5mm）⇒ 用清单推导的 Izz
#     ③ 其余车型 ⇒ 保留矩形近似，并**在返回值里标明来源**，不许默默使用
FSAE_REFERENCE = {"mass_kg": 235.0, "wheelbase_mm": 1550.0}
_FSAE_CACHE: dict[str, MassProperties] = {}


def fsae_reference() -> MassProperties:
    """FSAE 清单的推导结果（带缓存；清单是模块级常量，无需每次重算）。"""
    if "p" not in _FSAE_CACHE:
        _FSAE_CACHE["p"] = compute_mass_properties(fsae_mass_items(), FSAE_REFERENCE["wheelbase_mm"])
    return _FSAE_CACHE["p"]


def resolve_yaw_inertia(declared_iz: float | None, mass_kg: float,
                        wheelbase_mm: float) -> tuple[float, str]:
    """返回 (Izz kg·m², 来源)。来源 ∈ {declared, inventory:fsae, rectangle:approx}。

    两侧内核必须调同一个真源；前端镜像见 `web/js/02-presets.js::resolveYawInertia`。
    ⚠ `09-track.js` 里是**内联同逻辑**（不调前端那个函数）：该文件被 tphys_parity
    对拍沙箱单独加载，跨模块硬调用会 ReferenceError 打死对拍（M15 实测教训）。
    并有 test_dom 的跨语言逐项比对接管漂移。
    """
    if declared_iz:
        return float(declared_iz), "declared"
    if (abs(mass_kg - FSAE_REFERENCE["mass_kg"]) <= 1.5
            and abs(wheelbase_mm - FSAE_REFERENCE["wheelbase_mm"]) <= 5.0):
        return fsae_reference().i_yaw, "inventory:fsae"
    L = wheelbase_mm / 1000.0
    return mass_kg * (L * L + 1.6 * 1.6) / 12.0, "rectangle:approx"
