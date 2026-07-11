#!/bin/bash
# Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Detect OS for correct kill command
IS_WINDOWS=false
case "$(uname -s 2>/dev/null || echo 'Windows')" in
  MINGW*|MSYS*|CYGWIN*|Windows) IS_WINDOWS=true ;;
esac

kill_proc() {
  local pid=$1
  if [ "$IS_WINDOWS" = true ]; then
    cmd.exe //c "taskkill /PID $pid /F" >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
}

BASE_PORT=21025
MAX_PORT=$((BASE_PORT + 127))
STOPPED=false

# ── Method 1: PID from Next.js dev lock file ──
LOCK_FILE=".next/dev/lock"
if [ -f "$LOCK_FILE" ]; then
  PID=$(python3 -c "import json; print(json.load(open('$LOCK_FILE'))['pid'])" 2>/dev/null || \
        cat "$LOCK_FILE" | grep -o '"pid":[0-9]*' | grep -o '[0-9]*')
  if [ -n "$PID" ]; then
    echo "[stop] Stopping dev server (PID $PID from lock file)..."
    kill_proc "$PID"
    STOPPED=true
  fi
  rm -f "$LOCK_FILE"
fi

# ── Method 2: scan port range for remaining node processes ──
for PORT in $(seq $BASE_PORT $MAX_PORT); do
  if [ "$IS_WINDOWS" = true ]; then
    # Windows: netstat + taskkill
    PID=$(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $NF}' | head -1 || true)
  else
    PID=$(lsof -ti :$PORT 2>/dev/null || true)
  fi
  if [ -n "$PID" ]; then
    echo "[stop] Killing process on port $PORT (PID $PID)..."
    kill_proc "$PID"
    STOPPED=true
  fi
done

if [ "$STOPPED" = false ]; then
  echo "[stop] No running KirinAI-Insight server found."
else
  echo "[stop] Done."
fi
