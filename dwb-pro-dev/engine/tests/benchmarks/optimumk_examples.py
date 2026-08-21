"""OptimumKinematics 文档示例对照（S1 后置项）。

从 ref/OptimumKinematics - Help File.pdf 摘录双叉臂示例需 PDF 解析任务（独立于 S1）。
S1 门禁以「两套独立数值路径一致」（机制求解器 vs 手算）替代；
PDF 示例数值对照列为 S1 后置 Open Item：
- [ ] 解析 PDF 示例硬点表 → 填入 OPTIMUMK_CORNER["points"]
- [ ] 对照 KPI/Caster/Scrub/Trail 并填充 expected
"""
OPTIMUMK_CORNER = {
    "points": {},            # 待 PDF 解析录入
    "expected": {},          # 待 PDF 解析录入
    "note": "S1 后置：PDF 解析任务（tests/benchmarks/optimumk_examples.py）",
}
