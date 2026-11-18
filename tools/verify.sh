#!/usr/bin/env bash
# 渲染页面并检查：截图 + 场景就绪 + 无页面报错
# 用法: tools/verify.sh <截图路径> [窗口 "390,844"] [URL 后缀] [等待毫秒] [DPR]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-$ROOT/artifacts/shot.png}"
SIZE="${2:-390,844}"
SUFFIX="${3:-}"
WAIT="${4:-2500}"
DPR="${5:-2}"

IFS=',' read -r W H <<< "$SIZE"
mkdir -p "$(dirname "$OUT")" "$ROOT/artifacts"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

node "$ROOT/tools/shoot.mjs" "$OUT" "$W" "$H" "$DPR" "$SUFFIX" "$WAIT"

BYTES="$(stat -c%s "$OUT")"
if [ "$BYTES" -lt 1000 ]; then
  echo "FAIL: screenshot suspiciously small ($BYTES bytes)"
  exit 1
fi
echo "OK: $OUT ($BYTES bytes, scene ready, no console errors)"
