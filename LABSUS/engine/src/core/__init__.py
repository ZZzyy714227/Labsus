"""核心层：坐标规范、V1 数据模型、七状态指标模型与 JSON 清洗工具。

导入约定（M5 统一）：引擎内部一律使用 `src.` 绝对导入根，sys.path 只挂
`engine/`，不再挂 `engine/src/`——否则同一文件会被加载成 `src.geometry` 与
`geometry` 两个模块对象，isinstance / 身份比较会静默失效（F-74）。
"""
