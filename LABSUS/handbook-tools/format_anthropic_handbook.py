import os
import re
from pathlib import Path

handbook_dir = Path(r'c:\Users\zzy\Desktop\New_suspension\LABSUS\handbook')
output_md = handbook_dir / '全车底盘悬架力学与动力学工程全书.md'

parts_info = [
    {
        'folder': 'part1-spatial-kinematics',
        'title': '第一篇 空间机构运动学与几何学第一性原理',
        'loc': '底盘工程链条的几何基石——从三维空间向量代数、刚体李代数旋转与 SVD 姿态估计出发，建立空间双横臂与推拉杆摇臂多体运动学模型。',
        'mech': '三维空间欧拉角姿态解耦、空间铰链圆约束方程、60 轮二分法摇臂求解、非线性信赖域反射 (TRF) 求解器与主销定位角/瞬心/侧倾中心空间投影。'
    },
    {
        'folder': 'part2-statics-and-compliance',
        'title': '第二篇 静力平衡与 K&C 弹性力学体系',
        'loc': '连接纯刚体几何与全车动力学的弹性力学纽带——建立悬架连杆受力求解、6-DOF 橡胶衬套本构与弹性 K&C 仿真体系。',
        'mech': '6-DOF 载荷平移、5 二力杆空间 Plücker 矩阵伪逆分解、Brodlie-Fritsch 单调保形 PCHIP 样条、两层嵌套求解器与 Anderson-M 历史加速。'
    },
    {
        'folder': 'part3-quasi-static-handling',
        'title': '第三篇 准静态操稳与载荷转移控制理论',
        'loc': '车辆操纵稳定性的准静态力学内核——从空间侧倾轴线与载荷转移三路径，揭示整车稳态转向平衡与几何抬升规律。',
        'mech': '空间侧倾力矩平衡、P-Δ 几何负刚度失稳证明、TLLTD 三路径动载分配、Jensen 抓地力损失不等式证明与不足转向梯度 Kus 支配机制。'
    },
    {
        'folder': 'part4-advanced-tire-mechanics',
        'title': '第四篇 现代非线性轮胎力学与实测辨识',
        'loc': '全车地面抓地力源泉——深入微观刷子摩擦模型与宏观 Pacejka 魔术公式，完成试验台架多载荷实测数据参数辨识。',
        'mech': 'Fiala 刷子模型第一性原理推导、Pacejka 四主参数物理意义、归一化复合滑移摩擦力椭圆封闭证明、松弛长度指数解与有界 TRF 最小二乘辨识。'
    },
    {
        'folder': 'part5-transient-dynamics-15dof',
        'title': '第五篇 15-DOF 全车多体瞬态动力学',
        'loc': '赛道极限全时域高保真物理底座——建立车身 6-DOF + 四轮跳动 4-DOF + 四轮自转 4-DOF 的 15 自由度状态空间方程组。',
        'mech': '非惯性坐标系牛顿-欧拉方程、1000Hz 半隐式欧拉积分、四象限非对称减振器双速 Blow-off 泄压阀、聚氨酯限位块击穿与文丘里地面效应 ge(h) 耦合。'
    },
    {
        'folder': 'part6-track-and-autopilot',
        'title': '第六篇 赛道环境、最优赛车线与自动驾驶',
        'loc': '虚拟试验场与极限赛车线控制中枢——将连续赛道微分流形与高动态车速规划、同源 Stanley 跟踪控制器深度融合。',
        'mech': 'Catmull-Rom 闭合连续三次样条、7 点移动加权平滑滤波、外内外四段余弦赛车线、双向斜率硬限幅、同源 Stanley 反馈与逐圈自适应刹车学习。'
    },
    {
        'folder': 'part7-proving-ground-and-rig',
        'title': '第七篇 试验场测试工况与 4-Post 台架动力学',
        'loc': '汽车综合试验场极限冲击验证与四柱液压振动台架频域动力学测试体系。',
        'mech': '飞坡抛体着陆冲击动能耗散、ISO 3888-2 双移线麋鹿测试、μ-Split 对开制动、4-Post 液压台架单角 2-DOF 状态空间双峰共振解析与 DLC 贴地率优化。'
    },
    {
        'folder': 'part8-evaluation-and-correlation',
        'title': '第八篇 底盘综合评价体系、实测标定与调校闭环（核心精华）',
        'loc': '全书最高潮与终极工程闭环——建立 19 项黄金 KPI 偏导数图谱、三大台架对标闭环、赛道排障决策树与三大车型全案解剖。',
        'mech': '19 KPI 显式偏导数敏感性导数、三大台架（轮胎/K&C/衬套）对标 SOP、时域四阶段排障决策树、四级调校响应链与 FSAE/GT3/Baja 物理参数全案。'
    }
]

def format_chapter(raw_text, ch_num):
    lines = raw_text.splitlines()
    formatted = []
    
    # Extract title from # 第 X 章 ...
    title_line = ""
    start_idx = 0
    for idx, l in enumerate(lines):
        if l.startswith('# 第') or l.startswith('# 第 '):
            title_line = l
            start_idx = idx + 1
            break
    
    if not title_line:
        # fallback
        title_line = f"## 第 {ch_num} 章"
    else:
        # Convert # to ## for Anthropic style h2::before bar!
        title_line = re.sub(r'^#\s*', '## ', title_line)
    
    formatted.append(title_line)
    formatted.append("")
    
    # Process the body
    body_lines = lines[start_idx:]
    
    for l in body_lines:
        # Replace section headers
        # ## 1. 物理图景 -> ### X.1 物理图景与工程痛点
        m_sec = re.match(r'^##\s*([0-9]+)[\.、\s]*(.*)', l)
        if m_sec:
            sec_num = m_sec.group(1)
            sec_title = m_sec.group(2).strip()
            formatted.append(f"### {ch_num}.{sec_num} {sec_title}")
            continue
        
        # Replace subsection headers
        # ### 2.1 状态向量 -> #### (1) 状态向量 / #### 2.1 状态向量
        m_subsec = re.match(r'^###\s*([0-9]+)\.([0-9]+)[\.、\s]*(.*)', l)
        if m_subsec:
            s1 = m_subsec.group(1)
            s2 = m_subsec.group(2)
            st = m_subsec.group(3).strip()
            formatted.append(f"#### {ch_num}.{s1}.{s2} {st}")
            continue
            
        m_sub4 = re.match(r'^####\s*(.*)', l)
        if m_sub4:
            sub4_title = m_sub4.group(1).strip()
            formatted.append(f"#### {sub4_title}")
            continue
            
        # Clean file:/// links to clean textual paths
        l_clean = re.sub(r'\[(.*?)\]\(file:///[^\)]+/(engine|web)/([^\)]+)\)', r'*\1* (\2/\3)', l)
        l_clean = re.sub(r'\[(.*?)\]\(file:///[^\)]+\)', r'*\1*', l_clean)
        
        # Insert Anthropic tag badges naturally if not present
        if "Worked Example" in l_clean or "算例背景" in l_clean:
            l_clean = l_clean.replace("Worked Example", "【演算】Worked Example")
        if "物理图景与工程痛点" in l_clean and "【前置】" not in l_clean:
            l_clean = l_clean.replace("物理图景与工程痛点", "物理图景与工程痛点【前置】")
        if "底层数学力学严密推导" in l_clean and "【推导】" not in l_clean:
            l_clean = l_clean.replace("底层数学力学严密推导", "底层数学力学严密推导【推导】")
        if "赛道工程师实战" in l_clean and "【案例】" not in l_clean:
            l_clean = l_clean.replace("赛道工程师实战", "赛道工程师实战【案例】")
            
        formatted.append(l_clean)
        
    return '\n'.join(formatted)

master = []

# 1. Master Cover Block (h1 + blockquote)
master.append("# 全车底盘悬架力学与动力学工程全书\n")
master.append("> **LABSUS 赛车动力学与底盘工程研发团队 · 编著**  \n"
              "> 世界级赛车与高性能乘用车底盘悬架力学、非线性多体动力学、实测标定与赛道调校工程专著  \n"
              "> 全书 8 大篇章 · 27 篇专业章节 · 包含完整底层数学力学推导、代码对偶映射、参数敏感性导数图谱、手把手工程数值算例与赛道排障决策树  \n"
              "> 出版与合订日期：2026-09-02\n")

# 2. Master Table of Contents
master.append("## 总目录\n")
master.append("- 第一篇 空间机构运动学与几何学第一性原理（第 1–5 章）\n"
              "- 第二篇 静力平衡与 K&C 弹性力学体系（第 6–9 章）\n"
              "- 第三篇 准静态操稳与载荷转移控制理论（第 10–12 章）\n"
              "- 第四篇 现代非线性轮胎力学与实测辨识（第 13–15 章）\n"
              "- 第五篇 15-DOF 全车多体瞬态动力学（第 16–18 章）\n"
              "- 第六篇 赛道环境、最优赛车线与自动驾驶（第 19–21 章）\n"
              "- 第七篇 试验场测试工况与 4-Post 台架动力学（第 22–23 章）\n"
              "- 第八篇 底盘综合评价体系、实测标定与调校闭环（第 24–27 章）· 全书总结与附录\n")
master.append("\n---\n")

# 3. Global Norms
readme_path = handbook_dir / 'README.md'
if readme_path.exists():
    rm_text = readme_path.read_text(encoding='utf-8')
    master.append("## 全书总纲与全局工程规范\n")
    rm_lines = rm_text.splitlines()
    filtered = []
    skip = True
    for line in rm_lines:
        if line.startswith('## 1. 全局坐标系与符号约定'):
            skip = False
        if not skip:
            # Change ## to ###
            if line.startswith('## '):
                filtered.append('### ' + line[3:])
            elif line.startswith('### '):
                filtered.append('#### ' + line[4:])
            else:
                filtered.append(line)
    master.append('\n'.join(filtered))
    master.append('\n\n---\n\n')

# 4. Process all Parts and Chapters
ch_counter = 1
for part in parts_info:
    master.append(f"# {part['title']}\n")
    master.append(f"> **在全书的位置**：{part['loc']}  \n"
                  f"> **核心力学机制**：{part['mech']}\n")
    master.append("\n---\n\n")
    
    p_dir = handbook_dir / part['folder']
    ch_files = sorted(list(p_dir.glob('*.md')))
    for ch in ch_files:
        ch_raw = ch.read_text(encoding='utf-8')
        ch_fmt = format_chapter(ch_raw, ch_counter)
        master.append(ch_fmt)
        master.append('\n\n---\n\n')
        ch_counter += 1

final_text = '\n'.join(master)
output_md.write_text(final_text, encoding='utf-8')
print(f"Successfully generated Anthropic-formatted master handbook: {output_md}")
print(f"Total Lines: {len(final_text.splitlines())}, Size: {len(final_text.encode('utf-8'))/1024:.1f} KB")
