import os
import re
from pathlib import Path

handbook_dir = Path(r'c:\Users\zzy\Desktop\New_suspension\LABSUS\handbook')
output_md = handbook_dir / '全车底盘悬架力学与动力学工程全书.md'

parts_meta = [
    ('part1-spatial-kinematics', '第一篇 空间机构运动学与几何学第一性原理', '从三维刚体李代数、Rodrigues 旋转与 SVD 姿态估计出发，建立空间双横臂与推拉杆摇臂多体运动学模型'),
    ('part2-statics-and-compliance', '第二篇 静力平衡与 K&C 弹性力学体系', '基于二力杆 Plücker 矩阵伪逆与 6-DOF PCHIP 非线性衬套本构，构建 K&C 两层嵌套求解器与扫掠导数内核'),
    ('part3-quasi-static-handling', '第三篇 准静态操稳与载荷转移控制理论', '空间侧倾轴线 P-Δ 几何失稳、TLLTD 三路径分解与 Jensen 不等式抓地力损失证明'),
    ('part4-advanced-tire-mechanics', '第四篇 现代非线性轮胎力学与实测辨识', 'Fiala 刷子模型第一性原理、Pacejka 魔术公式复合滑移摩擦椭圆与有界 TRF 试验台架辨识'),
    ('part5-transient-dynamics-15dof', '第五篇 15-DOF 全车多体瞬态动力学', '车体 6-DOF 空间姿态 + 四轮独立垂向 4-DOF + 四轮自转 4-DOF，四象限非线性阻尼与地面效应多物理场'),
    ('part6-track-and-autopilot', '第六篇 赛道环境、最优赛车线与自动驾驶', 'Catmull-Rom 闭合连续样条、外内外赛车线规划、同源 Stanley 跟踪与逐圈刹车自适应学习'),
    ('part7-proving-ground-and-rig', '第七篇 试验场测试工况与 4-Post 台架动力学', '七大综合试验场极端冲击工况与 4-Post 液压台架单角 2-DOF 双模态共振解析与 DLC 贴地率优化'),
    ('part8-evaluation-and-correlation', '第八篇 底盘综合评价体系、实测标定与调校闭环（核心精华）', '19 项黄金 KPI 偏导数导数图谱、三大台架对标闭环、时域四阶段排障决策树与三大车型全案解剖')
]

content = []

# Title & Preface
content.append('# 全车底盘悬架力学与动力学工程全书\n')
content.append('> **作者**：LABSUS 赛车动力学与底盘工程研发团队  \n> **定位**：世界级赛车与高性能乘用车底盘悬架力学、非线性动力学、实测标定与赛道调校工程专著  \n> **适用对象**：赛车工程师、底盘调校工程师、车辆动力学仿真工程师、高校方程式 (FSAE) 队员及高级车辆工程研究学者  \n> **体系**：全书 8 大篇章、27 篇专业章节，包含完整数学推导、代码对偶映射、参数敏感性导数、手把手工程数值算例与排障决策树\n\n')

# Global Coordinate & Sign Conventions from README.md
readme_path = handbook_dir / 'README.md'
if readme_path.exists():
    rm_text = readme_path.read_text(encoding='utf-8')
    content.append('## 📖 全书总纲与全局工程规范\n\n')
    rm_lines = rm_text.splitlines()
    filtered_rm = []
    skip = True
    for line in rm_lines:
        if line.startswith('## 1. 全局坐标系与符号约定'):
            skip = False
        if not skip:
            filtered_rm.append(line)
    content.append('\n'.join(filtered_rm))
    content.append('\n\n---\n\n')

# Process each Part
for part_folder, part_title, part_desc in parts_meta:
    content.append(f'# {part_title}\n\n')
    content.append(f'> **篇章导言**：{part_desc}\n\n')
    content.append('---\n\n')
    
    p_dir = handbook_dir / part_folder
    ch_files = sorted(list(p_dir.glob('*.md')))
    for ch in ch_files:
        ch_text = ch.read_text(encoding='utf-8')
        
        # Clean file:/// links to clean relative code paths
        ch_text = re.sub(r'\[(.*?)\]\(file:///[^\)]+/(engine|web)/([^\)]+)\)', r'[\1](\2/\3)', ch_text)
        ch_text = re.sub(r'\[(.*?)\]\(file:///[^\)]+\)', r'[\1]', ch_text)
        
        content.append(ch_text)
        content.append('\n\n---\n\n')

full_text = '\n'.join(content)
output_md.write_text(full_text, encoding='utf-8')
print(f'Successfully created merged Markdown: {output_md}')
print(f'Total size: {len(full_text.encode("utf-8")) / 1024:.1f} KB, Lines: {len(full_text.splitlines())}')
