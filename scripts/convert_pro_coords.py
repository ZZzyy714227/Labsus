"""DWB-SIM PRO 预设坐标 -> 产品坐标系（X=前/Y=右）-> FSAE 尺寸缩放。

映射：product = (PRO_y, PRO_x * s, PRO_z)；s = 产品半轨 / PRO 半轨。
产出：STRUT_OUT/RCK_AX_A/RCK_AX_B 前/后轴默认坐标。
"""
import sys
sys.path.insert(0, "src")
import numpy as np
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix

# 产品半轨：前 1220/2=610，后 1180/2=590
PRODUCT_HALF_TRACK = {"front": 610.0, "rear": 590.0}

PRO = {
    "front": {  # PRO 前悬架推杆预设（DWB 坐标 X=外侧 Y=向前）
        "half_track": 810.0,
        "STRUT_OUT": [683.4, 12.0, 205.5],
        "RCK_AX_A":  [305.3, 20.0, 366.4],
        "RCK_AX_B":  [306.1, 90.0, 365.0],
    },
    "rear": {   # PRO 后悬架拉杆预设
        "half_track": 790.0,
        "STRUT_OUT": [645.0, -15.0, 425.0],
        "RCK_AX_A":  [377.0, 30.0, 318.9],
        "RCK_AX_B":  [376.7, 90.0, 320.1],
    },
}

def to_product(pro_pt, s):
    return [round(pro_pt[1], 1), round(pro_pt[0] * s, 1), round(pro_pt[2], 1)]

def main():
    for axle, cfg in PRO.items():
        s = PRODUCT_HALF_TRACK[axle] / cfg["half_track"]
        print(f"== {axle} ==  s={s:.4f}")
        for k in ("STRUT_OUT", "RCK_AX_A", "RCK_AX_B"):
            print(k, to_product(cfg[k], s))
    # 对照现有 FSAE 尺寸
    f = DEFAULT_HARDPOINTS
    print("front LBJ(UP2)", f["UP2"], " CH5", f["CH5"], " STRUT_OUT", f["STRUT_OUT"])
    r = strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_")
    print("rear  UBJ(UP1)", r["UP1"], " CH5", r["CH5"], " STRUT_OUT", r["STRUT_OUT"])

if __name__ == "__main__":
    main()