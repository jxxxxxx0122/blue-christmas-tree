#!/usr/bin/env bash
# 用无头 Chrome 渲染页面：截图 + 检查场景已启动 + 检查没有页面报错
# 用法: tools/verify.sh <截图路径> [窗口尺寸] [URL 后缀] [虚拟时间毫秒]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${1:-$ROOT/artifacts/shot.png}"
SIZE="${2:-390,844}"
SUFFIX="${3:-}"
BUDGET="${4:-6000}"
mkdir -p "$(dirname "$OUT")" "$ROOT/artifacts"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

WIN_ROOT="$(cygpath -m "$ROOT")"                       # D:/path
ESCAPED="$(printf '%s' "$WIN_ROOT" | sed 's/ /%20/g')"
URL="file:///${ESCAPED}/index.html${SUFFIX}"

COMMON=(--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars)

"$CHROME" "${COMMON[@]}" --window-size="$SIZE" --virtual-time-budget="$BUDGET" \
  --enable-logging=stderr --v=0 --screenshot="$OUT" "$URL" 2> "$ROOT/artifacts/chrome.log"

if grep -E "CONSOLE.*(Uncaught|\[error\]|\[promise\])" "$ROOT/artifacts/chrome.log"; then
  echo "FAIL: console error (see artifacts/chrome.log)"
  exit 1
fi

DOM="$("$CHROME" "${COMMON[@]}" --window-size="$SIZE" --virtual-time-budget=8000 --dump-dom "$URL" 2>/dev/null)"
if ! printf '%s' "$DOM" | grep -q 'data-ready="1"'; then
  echo "FAIL: scene never signalled ready"
  exit 1
fi
if printf '%s' "$DOM" | grep -q 'id="error" class="visible"'; then
  echo "FAIL: page error overlay is visible"
  exit 1
fi

SIZE_BYTES="$(stat -c%s "$OUT")"
if [ "$SIZE_BYTES" -lt 1000 ]; then
  echo "FAIL: screenshot suspiciously small ($SIZE_BYTES bytes)"
  exit 1
fi
echo "OK: $OUT ($SIZE_BYTES bytes, scene ready, no console errors)"
