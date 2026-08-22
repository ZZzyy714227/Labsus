"""
Engine 隔离工作区 conftest —— 只挂载 engine/src 到 sys.path。
不引入旧仓库的 config/hardpoints/routes 依赖（隔离边界）。
"""
import os
import sys

_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
if _src not in sys.path:
    sys.path.insert(0, _src)