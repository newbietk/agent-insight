#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
#  Context Insight — Pre-install 环境检测 & Web 包拉取
# ───────────────────────────────────────────────────────────
set -euo pipefail

TARGET_DIR="${HOME}/context-insight"
WEB_PACK_URL="${WEB_PACK_URL:-}"   # 由外部环境变量覆盖

echo "========================================="
echo " Context Insight Pre-install"
echo "========================================="
echo ""

# ── Step 1: 检测目标目录 ─────────────────────────────────
echo "[1/3] 检查目标目录 ${TARGET_DIR} ..."
if [ -d "${TARGET_DIR}" ]; then
  echo "  ✓ 目录已存在: ${TARGET_DIR}"
else
  echo "  ✗ 目录不存在: ${TARGET_DIR}"
  echo "  → 创建目录..."
  mkdir -p "${TARGET_DIR}"
  echo "  ✓ 已创建: ${TARGET_DIR}"
fi
echo ""

# ── Step 2: 检测运行环境 ─────────────────────────────────
echo "[2/3] 检测运行环境 ..."
echo "  OS: $(uname -s)"
echo "  Arch: $(uname -m)"
echo "  Node.js: $(node --version 2>/dev/null || echo '未安装')"
echo "  npm: $(npm --version 2>/dev/null || echo '未安装')"
echo "  git: $(git --version 2>/dev/null || echo '未安装')"
echo ""

# ── Step 3: Web 包拉取（占位，后续补充） ─────────────────
echo "[3/3] Web 包拉取 ..."
if [ -n "${WEB_PACK_URL}" ]; then
  echo "  → 从 ${WEB_PACK_URL} 下载..."
  # TODO: 实际下载逻辑
  echo "  ✓ 下载完成（占位）"
else
  echo "  ⚠ WEB_PACK_URL 未设置，跳过下载（占位步骤）"
  echo "  提示: 后续补充实际的 web 包拉取逻辑"
fi
echo ""

echo "========================================="
echo " Pre-install 完成"
echo "========================================="
