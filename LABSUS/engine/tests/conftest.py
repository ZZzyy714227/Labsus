"""
Engine 隔离工作区 conftest —— 挂载 engine 与 engine/src 到 sys.path。
不引入旧仓库的 config/hardpoints/routes 依赖（隔离边界）。
"""
import os
import sys

_engine_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_src = os.path.join(_engine_root, "src")
for _p in (_engine_root, _src):
    if _p not in sys.path:
        sys.path.insert(0, _p)