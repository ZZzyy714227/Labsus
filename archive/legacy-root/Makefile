# ─────────────────────────────────────────────────────────
# FSAE Suspension — 开发批处理命令
# 用法: make <target>
# ─────────────────────────────────────────────────────────

.PHONY: start test test-cov lint typecheck format fix all clean

# 启动开发服务器
start:
	@echo "==> 启动 FastAPI 服务器 (http://localhost:8000)"
	python run.py

# 运行所有测试
test:
	@echo "==> 运行测试"
	python -m pytest tests/ -v --tb=short

# 运行测试 + 覆盖率报告
test-cov:
	@echo "==> 运行测试 (含覆盖率)"
	python -m pytest tests/ -v --tb=short --cov=src --cov-report=term-missing

# Lint 检查
lint:
	@echo "==> Ruff lint 检查"
	python -m ruff check src/ tests/

# 类型检查
typecheck:
	@echo "==> mypy 类型检查"
	python -m mypy src/

# 自动格式化
format:
	@echo "==> Ruff format 自动格式化"
	python -m ruff format src/ tests/

# 修复可自动修复的 lint 问题
fix:
	@echo "==> Ruff 自动修复"
	python -m ruff check --fix src/ tests/

# 全面检查 (lint + typecheck + test)
all: lint typecheck test
	@echo "==> ✅ 全部通过"

# 安装开发依赖
dev-setup:
	@echo "==> 安装开发依赖"
	pip install -e ".[dev]"
