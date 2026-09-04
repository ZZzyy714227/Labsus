# 第 11 章 TLLTD 三路径载荷转移完整力学推导

---

## 1. 物理图景与工程痛点

在赛车动力学与底盘调校中，**总侧倾载荷转移前轴占比 (Total Lateral Load Transfer Distribution, TLLTD%)** 被誉为**“决定赛车稳态操控平衡的唯一上帝旋钮”**。

在车辆以侧向加速度 $a_y$ 过弯时，全车总侧向载荷转移量由整车总质量、质心高度与轮距由物理定律硬性锁定（$\Delta F_{z,tot} = m_{total} a_y \frac{h_{cg}}{Track}$）。（一阶意义上）无论如何调整弹簧和防倾杆，都无法改变全车总载荷转移量——严格而言，计入第 10 章 P-Δ 修正后实际总转移比该锁定值高约 2%，下文算例三路径之和即含此高阶项；**但工程师可以通过调整悬架刚度与几何，自由分配前轴与后轴所分担的载荷转移比例**。

在传统简化教学中，通常只计算弹性弹簧的转移，忽略了多体运动学中的三路径机理：
1. **非簧载质量惯性路径 (Path 1)**：轮总成、制动盘与半轴自身受侧向力直接向地面传力，完全不经过弹簧；
2. **侧倾中心几何刚性路径 (Path 2)**：簧载质量通过摆臂几何铰链力线瞬间传递给车轮，无任何时间滞后；
3. **弹簧与防倾杆弹性变形路径 (Path 3)**：由车身侧倾角 $\phi$ 压缩主弹簧并扭转防倾杆（ARB）产生的弹性力矩。

---

## 2. 底层数学力学严密推导

```
   [总侧向载荷转移 ΔF_z,tot = m · ay · (h_cg / Track)]
                     |
        +------------+------------+
        |                         |
   [前轴载荷转移 ΔF_z,f]     [后轴载荷转移 ΔF_z,r]
        |                         |
   +----+----+               +----+----+
   | 路径 1: 非簧载质量惯性   | 路径 1: 非簧载质量惯性
   | 路径 2: 侧倾中心几何力臂 | 路径 2: 侧倾中心几何力臂
   | 路径 3: 弹簧+ARB 弹性力矩| 路径 3: 弹簧+ARB 弹性力矩
```

### 2.1 载荷转移三路径严格正交力学分解

设车辆总质量为 $m_T$，簧载质量为 $m_s$，前/后非簧载质量分别为 $m_{u,f}, m_{u,r}$。
前/后轮距分别为 $t_f, t_r$，质心距前/后轴距离为 $a, b$，前/后侧倾中心高度为 $z_{rc,f}, z_{rc,r}$。

#### 路径 1：非簧载质量直接惯性载荷转移 ($\Delta F_{z,path1}$)
非簧载质量质心高度为车轮滚动半径 $h_u \approx R_{tire}$：
$$\Delta F_{z,path1,f} = m_{u,f} a_y \frac{R_{tire}}{t_f}, \quad \Delta F_{z,path1,r} = m_{u,r} a_y \frac{R_{tire}}{t_r}$$

#### 路径 2：侧倾中心几何力臂刚性载荷转移 ($\Delta F_{z,path2}$)
簧载质量在前/后轴由几何瞬心力线瞬间传递的分量为：
$$\Delta F_{z,path2,f} = m_s a_y \left(\frac{b}{L}\right) \frac{z_{rc,f}}{t_f}, \quad \Delta F_{z,path2,r} = m_s a_y \left(\frac{a}{L}\right) \frac{z_{rc,r}}{t_r}$$

#### 路径 3：车身侧倾弹性恢复力矩载荷转移 ($\Delta F_{z,path3}$)
车身产生稳态侧倾角 $\phi$ 时，前/后轴弹簧与防倾杆产生的弹性恢复力矩分解为左右轮垂向力偶：
$$\Delta F_{z,path3,f} = \frac{K_{\phi,f} \cdot \phi}{t_f}, \quad \Delta F_{z,path3,r} = \frac{K_{\phi,r} \cdot \phi}{t_r}$$

---

### 2.2 横向稳定杆 (ARB) 扭转力学刚度推导

横向稳定杆（Anti-Roll Bar）由扭杆主体（Torsion Tube）与两侧驱动力臂（Lever Arm）构成。
设外径为 $d_o$、内径为 $d_i$（实心杆 $d_i = 0$），有效扭转段长度为 $L_{bar}$，剪切模量为 $G$（弹簧钢取 $7.93 \times 10^{10}\,\text{Pa}$）。

#### (1) 极惯性矩与扭转线刚度：
$$J_p = \frac{\pi (d_o^4 - d_i^4)}{32}, \quad K_{twist} = \frac{G J_p}{L_{bar}} \quad [\text{N}\cdot\text{m/rad}]$$

#### (2) 转换为车身侧倾角刚度贡献 ($K_{\phi,arb}$)：
设 ARB 驱动力臂长度为 $L_{arm}$，安装运动比为 $MR_{arb}$：
$$K_{\phi,arb} = K_{twist} \cdot \left(\frac{t}{L_{arm}}\right)^2 \cdot MR_{arb}^2 \quad [\text{N}\cdot\text{m/rad}]$$

#### (3) 轴侧倾总刚度：
$$K_{\phi,f} = \frac{1}{2} K_{w,f} t_f^2 + K_{\phi,arb,f}, \quad K_{\phi,r} = \frac{1}{2} K_{w,r} t_r^2 + K_{\phi,arb,r}$$

---

### 2.3 TLLTD% 与四轮动态垂向载荷闭式方程

前轴与后轴单侧总载荷转移量为：
$$\Delta F_{z,f} = \Delta F_{z,path1,f} + \Delta F_{z,path2,f} + \Delta F_{z,path3,f}$$
$$\Delta F_{z,r} = \Delta F_{z,path1,r} + \Delta F_{z,path2,r} + \Delta F_{z,path3,r}$$

#### 前轴总载荷转移占比 (TLLTD%)：
$$\text{TLLTD}\% = \frac{\Delta F_{z,f}}{\Delta F_{z,f} + \Delta F_{z,r}} \times 100\%$$

#### 四轮瞬态垂向动态正压力：
设静态四轮分配轴荷为 $F_{z0,FL}, F_{z0,FR}, F_{z0,RL}, F_{z0,RR}$（满足 $F_{z0,FL} + F_{z0,FR} = m_T g \frac{b}{L}$）。
在左转工况（向右侧移）：
$$\begin{cases} F_{z,FL} = F_{z0,FL} - \Delta F_{z,f} \\ F_{z,FR} = F_{z0,FR} + \Delta F_{z,f} \\ F_{z,RL} = F_{z0,RL} - \Delta F_{z,r} \\ F_{z,RR} = F_{z0,RR} + \Delta F_{z,r} \end{cases}$$

---

## 3. 核心控制变量与参数灵敏度分析

```
前轴载荷转移占比 TLLTD%
   ^
   |        [TLLTD > 54%: 强不足转向 (推头 Understeer)]
54 +-----------------------------------------------------
   |        [51.5% ~ 54.0%: 赛车黄金中性操控窗口]
51 +-----------------------------------------------------
   |        [TLLTD < 48%: 严重过度转向 (甩尾 Oversteer)]
   v
```

| 调校控制变量 | 影响的转移路径 | 偏导数敏感性方程 | 操稳平衡调校方向 |
| :--- | :--- | :--- | :--- |
| **前防倾杆直径 ($d_{o,f}$)** | 路径 3 (弹性力矩) | $\frac{\partial \text{TLLTD}}{\partial d_{o,f}} \propto d_{o,f}^3 > 0$ | 加粗前 ARB $\implies$ TLLTD 升高 $\implies$ 增大推头 |
| **后防倾杆直径 ($d_{o,r}$)** | 路径 3 (弹性力矩) | $\frac{\partial \text{TLLTD}}{\partial d_{o,r}} < 0$ | 加粗后 ARB $\implies$ TLLTD 降低 $\implies$ 释放车尾增加甩尾 |
| **前侧倾中心高度 ($z_{rc,f}$)** | 路径 2 (几何力矩) | $\frac{\partial \text{TLLTD}}{\partial z_{rc,f}} = \frac{100\, \Delta F_{z,r}}{(\Delta F_{z,f}+\Delta F_{z,r})^2} \cdot \frac{m_s a_y}{L\, t_f / b} \; > 0$ | 抬高前 RC $\implies$ 加快前轴瞬态载荷建立，入弯指向敏锐 |
| **后主弹簧刚度 ($K_{s,r}$)** | 路径 3 (弹性力矩) | $\frac{\partial \text{TLLTD}}{\partial K_{s,r}} < 0$ | 加硬后弹簧 $\implies$ 后轴抓地衰减 $\implies$ 辅助慢速弯出弯旋转 |

---

## 4. LABSUS 代码实现与数值稳定性技巧

### 4.1 核心代码映射
* **三路径载荷转移与 4 轮动载计算**（内嵌于 [`engine/src/api/chassis.py`](file:///c:/Users/zzy/Desktop/New_suspension/LABSUS/engine/src/api/chassis.py#L194-L364) 的 `quasi_loads()`，下为三路径分解示意）：
  ```python
  def calc_load_transfer(ms, mu_f, mu_r, ay_g, phi_rad, z_rc_f, z_rc_r, K_phi_f, K_phi_r, tf, tr, a, b, R_tire):
      ay = ay_g * 9.81
      L = a + b

      # 路径 1: 非簧载质量
      dFz_u_f = mu_f * ay * (R_tire / tf)
      dFz_u_r = mu_r * ay * (R_tire / tr)

      # 路径 2: 侧倾中心力臂
      dFz_geo_f = ms * ay * (b / L) * (z_rc_f / 1000.0) / tf
      dFz_geo_r = ms * ay * (a / L) * (z_rc_r / 1000.0) / tr

      # 路径 3: 弹性力矩
      dFz_el_f = (K_phi_f * phi_rad) / tf
      dFz_el_r = (K_phi_r * phi_rad) / tr

      dFz_f = dFz_u_f + dFz_geo_f + dFz_el_f
      dFz_r = dFz_u_r + dFz_geo_r + dFz_el_r
      tlltd = (dFz_f / (dFz_f + dFz_r)) * 100.0
      return dFz_f, dFz_r, tlltd
  ```

---

## 5. 手把手工程数值算例 (Worked Example)

### 算例背景：GT3 赛车在 1.2g 侧向加速度下的全车四轮载荷手算
已知赛车参数：
* 簧载质量 $m_s = 1150\,\text{kg}$，前非簧载 $m_{u,f} = 50\,\text{kg}$，后非簧载 $m_{u,r} = 60\,\text{kg}$，总质量 $m_T = 1260\,\text{kg}$
* 轴距 $L = 2.65\,\text{m}$，质心位置 $a = 1.25\,\text{m}, b = 1.40\,\text{m}$
* 前后轮距 $t_f = t_r = 1.68\,\text{m}$，轮胎半径 $R_{tire} = 0.325\,\text{m}$
* 侧倾中心高：$z_{rc,f} = 0.045\,\text{m}, \; z_{rc,r} = 0.065\,\text{m}$
* 前轴侧倾刚度 $K_{\phi,f} = 45,000\,\text{N}\cdot\text{m/rad}$，后轴 $K_{\phi,r} = 38,000\,\text{N}\cdot\text{m/rad}$
* 稳态侧倾角（引自第 10 章解）：$\phi = 0.062621\,\text{rad}$
* 侧向加速度：$a_y = 1.20 \times 9.81 = 11.772\,\text{m/s}^2$

#### 步骤 1：计算静态 4 轮基准垂向轴荷
* 前轴静态总载荷：$F_{z0,front} = m_T g \frac{b}{L} = 1260 \times 9.81 \times \frac{1.40}{2.65} = 6,530.0\,\text{N} \implies F_{z0,FL} = F_{z0,FR} = 3,265.0\,\text{N}$
* 后轴静态总载荷：$F_{z0,rear} = m_T g \frac{a}{L} = 1260 \times 9.81 \times \frac{1.25}{2.65} = 5,830.6\,\text{N} \implies F_{z0,RL} = F_{z0,RR} = 2,915.3\,\text{N}$

#### 步骤 2：前轴三路径载荷转移计算
* **路径 1（非簧载）**：$\Delta F_{z1,f} = 50.0 \times 11.772 \times \frac{0.325}{1.68} = 113.9\,\text{N}$
* **路径 2（几何瞬心）**：$\Delta F_{z2,f} = 1150.0 \times 11.772 \times \left(\frac{1.40}{2.65}\right) \times \frac{0.045}{1.68} = 191.4\,\text{N}$
* **路径 3（弹性力矩）**：$\Delta F_{z3,f} = \frac{45000.0 \times 0.062621}{1.68} = 1,677.4\,\text{N}$
* **前轴总载荷转移**：
  $$\Delta F_{z,f} = 113.9 + 191.4 + 1677.4 = 1,982.7\,\text{N}$$

#### 步骤 3：后轴三路径载荷转移计算
* **路径 1（非簧载）**：$\Delta F_{z1,r} = 60.0 \times 11.772 \times \frac{0.325}{1.68} = 136.6\,\text{N}$
* **路径 2（几何瞬心）**：$\Delta F_{z2,r} = 1150.0 \times 11.772 \times \left(\frac{1.25}{2.65}\right) \times \frac{0.065}{1.68} = 247.0\,\text{N}$
* **路径 3（弹性力矩）**：$\Delta F_{z3,r} = \frac{38000.0 \times 0.062621}{1.68} = 1,416.4\,\text{N}$
* **后轴总载荷转移**：
  $$\Delta F_{z,r} = 136.6 + 247.0 + 1416.4 = 1,800.0\,\text{N}$$

#### 步骤 4：计算 TLLTD% 与四轮动态垂向载荷
$$\text{TLLTD}\% = \frac{1982.7}{1982.7 + 1800.0} \times 100\% = \frac{1982.7}{3782.7} \times 100\% = \mathbf{52.41\%}$$
* **左前轮 (FL - 内侧减载)**：$F_{z,FL} = 3265.0 - 1982.7 = \mathbf{1,282.3\,\text{N}}$
* **右前轮 (FR - 外侧增载)**：$F_{z,FR} = 3265.0 + 1982.7 = \mathbf{5,247.7\,\text{N}}$
* **左后轮 (RL - 内侧减载)**：$F_{z,RL} = 2915.3 - 1800.0 = \mathbf{1,115.3\,\text{N}}$
* **右后轮 (RR - 外侧增载)**：$F_{z,RR} = 2915.3 + 1800.0 = \mathbf{4,715.3\,\text{N}}$
* **全车总载荷校验**：$1282.3 + 5247.7 + 1115.3 + 4715.3 = 12,360.6\,\text{N} \equiv 1260 \times 9.81\,\text{N}$，严格守恒！

---

## 6. 赛道工程师实战调校与故障排查指南

```mermaid
graph TD
    A["TLLTD 操稳平衡调校"] --> B{"弯中车身姿态稳定但转向严重推头"}
    A --> C{"弯心开油时车尾极易失控甩尾"}
    B -->|前轴载荷转移过大 (TLLTD>55%)| D["调软前防倾杆 1~2 档<br/>或调硬后防倾杆，将 TLLTD 降至 52.5%"]
    C -->|后轴载荷转移过大 (TLLTD<49%)| E["调软后防倾杆或降低后主弹簧刚度<br/>将载荷转移合理转移至前轴保护后轮附着力"]
```

---

### 本章小结
本章把整车总侧倾载荷转移按"非簧载惯性、侧倾中心几何、弹簧+ARB 弹性"三条路径正交分解，给出 TLLTD 与四轮动载的闭式解。它是第 10 章稳态侧倾角的直接下游，也是第 12 章不足转向梯度与第 24 章 TLLTD 调校杠杆的数值基础。
