"""P5 深化 (4b)：转向回正（kingpin moment）分析。

前轮绕主销的回正力矩来源：
- 主销拖距 × 侧向力：M_trail = −trail·Fy（侧向力经拖距产生回正，正=回正）
- 主销偏移（scrub） × 制动/驱动力：M_scrub = scrub·Fx（制动时经 scrub 产生力矩）
- 主销几何倾斜（camber/KPI 引起的法向分量贡献，PVC 简化为可选项）
输出：每前轮回正力矩、总转向力矩需求（直线 vs 制动 vs 侧向工况）。
"""
from __future__ import annotations


def kingpin_moment(trail_mm: float, scrub_mm: float,
                   fy_n: float, fx_n: float, fz_n: float) -> dict:
    """单前轮绕主销的力矩分量（N·mm）。trail/scrub 取 P2-0 约定。

    约定：M_trail = −trail·Fy（Fy 为正（向外）→ 力矩为负=回正倾向随转向方向相反）；
    M_scrub = scrub·Fx（制动 Fx<0 时 scrub 贡献）。
    """
    m_trail = -trail_mm * fy_n
    m_scrub = scrub_mm * fx_n
    m_total = m_trail + m_scrub
    return {
        "trail_moment_nmm": round(m_trail, 3),
        "scrub_moment_nmm": round(m_scrub, 3),
        "total_moment_nmm": round(m_total, 3),
        "self_centering": bool(m_total < 0),   # 负=趋向回正（与转向方向相反）
    }


def align_moment_summary(trail_f: float, scrub_f: float,
                         fy_fl: float, fy_fr: float,
                         fx_fl: float, fx_fr: float,
                         fz_fl: float, fz_fr: float) -> dict:
    """前轴回正力矩汇总（左右合计）。"""
    lm = kingpin_moment(trail_f, scrub_f, fy_fl, fx_fl, fz_fl)
    rm = kingpin_moment(trail_f, scrub_f, fy_fr, fx_fr, fz_fr)
    return {
        "left": lm, "right": rm,
        "total_nmm": round(lm["total_moment_nmm"] + rm["total_moment_nmm"], 3),
        "self_centering": bool(lm["self_centering"] and rm["self_centering"]),
    }
