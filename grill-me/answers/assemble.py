# -*- coding: utf-8 -*-
"""Assemble the LABSUS grill-me Q&A archive from 4 answer section files."""
import re
from pathlib import Path

BASE = Path(r"C:\Users\zzy\Desktop\New_suspension\grill-me")
ANS = BASE / "answers"

PARTS = [
    ("qa_section1.md", "第一部分", "前端/图形", "题 1–25",
     "三代渲染架构演进、Canvas 2D 软渲染器、四视口拖拽联动、Web 工程化与性能"),
    ("qa_section2.md", "第二部分", "数值/算法", "题 26–50",
     "闭式投影迭代与 TRF 联合收敛、18 维状态机构求解、衬套 6DOF 力平衡、K&C 双层求解、Pacejka 瞬态模型"),
    ("qa_section3.md", "第三部分", "车辆动力学", "题 51–75",
     "K&C 四工况定义与指标提取、4-Post 台架建模、赛道瞬态仿真、参数量级与结果可信度"),
    ("qa_section4.md", "第四部分", "项目/工程", "题 76–100",
     "三代重构时间线与取舍复盘、双实现一致性对拍、验证方法与 golden file、可复现性与边界坦白"),
]

def normalize(text: str) -> str:
    # unify answer marker: "**NN. 回答**" -> "**回答**"
    text = re.sub(r"^\*\*\d+\.\s*回答\*\*", "**回答**", text, flags=re.M)
    # strip the original H1 of each section (will be replaced by part heading)
    lines = text.splitlines()
    out = []
    skipping = True
    for ln in lines:
        if skipping:
            if ln.startswith("# "):
                continue
            if ln.strip() in ("", "---"):
                continue
            skipping = False
        out.append(ln)
    return "\n".join(out).strip()

chapters = []
for fname, part, topic, rng, desc in PARTS:
    raw = (ANS / fname).read_text(encoding="utf-8")
    body = normalize(raw)
    n_q = len(re.findall(r"^\*\*\d+\. \[难度", body, flags=re.M))
    n_a = len(re.findall(r"^\*\*回答\*\*", body, flags=re.M))
    assert n_q == 25 and n_a == 25, f"{fname}: 题干 {n_q} / 回答 {n_a}，应为 25/25"
    chapters.append((part, topic, rng, desc, body))

header = """# LABSUS /grill-me 高压技术拷问 · 100 题问答实录

> **项目**：SAE 整车悬架仿真分析平台 LABSUS（个人独立开发）
> **拷问对象**：简历声明——三代架构重构（Three.js 原型 → 原生单文件渲染 → Python/FastAPI 引擎双实现）、原生 Web 前端 + 计算引擎双实现、四视口硬点拖拽实时联动、K&C 四工况 / 4-Post 台架 / 赛道瞬态仿真全链路、自研多体机构求解（闭式投影迭代 + 最小二乘 TRF 联合收敛）、衬套 6DOF 力平衡 + 机构重解耦合的 K&C 双层求解、Pacejka 轮胎瞬态模型
> **回答原则**：全部回答以候选人身份第一人称作答，逐条锚定仓库真实代码、commit 历史与实测数据；凡简历声明与实际实现有出入处（如"闭式投影迭代"实为早期探索后被 TRF 取代、bush_force_jac 写了未接、kappa_dyn 死代码等），一律如实坦白并给出工程权衡理由——面试中诚实与证据比包装更值钱。
> **详略规则**：难度 4–5 的核心题深入展开（结论 → 实现/推导 → 数字 → 失效边界 → 复盘）；难度 1–3 的题简明作答。

## 目录

"""

for part, topic, rng, desc, _ in chapters:
    header += f"- **{part}　{topic}（{rng}）**——{desc}\n"
header += "\n---\n"

parts_md = []
for part, topic, rng, desc, body in chapters:
    parts_md.append(f"\n# {part}　{topic}（{rng}）\n\n> 本章考察：{desc}\n\n{body}\n")

final = header + "\n\n---\n".join(parts_md) + """
---

## 附：作答后遗留的改进清单（自测结论）

本次逐题作答暴露、且已在回答中承诺修复的事项：

1. **简历措辞修正**："闭式投影迭代与 TRF 联合收敛" → 改为"约束残差联合最小二乘（TRF）求解，含投影迭代探索与不收敛复盘"。
2. **死代码清理**：`bush_force_jac`（写了未接）、`kappa_dyn`、`fx()/mz()` 零调用、compliance.py 中 Anderson 兜底死分支——删除或接线，二选一。
3. **`cp_rel` 力矩项丢失**：瞬态模型中滑移率松弛后的力矩整项蒸发，需在 transient.py 补回并加回归用例。
4. **对拍脚本归位**：`web/test_dom.js` 未入 git，tphys_parity 比对对象说明需写进文档；前端 7339 行单文件应拆分或引入最小构建步骤。
5. **阈值一致性**：`find_limits` thr=0.03 与求解判定 0.02mm 的倒挂需统一或注释说明层级关系。
6. **README 测试数过期**（75 vs 实际 76+2 benchmark）与 DEVLOG.md 位置说明修正。
"""

out = BASE / "LABSUS_grill_me_100题_问答实录.md"
out.write_text(final, encoding="utf-8")
n_all = len(re.findall(r"^\*\*\d+\. \[难度", final, flags=re.M))
print(f"OK -> {out}")
print(f"题干总数 {n_all}（应 100），全文 {len(final)} 字符")
