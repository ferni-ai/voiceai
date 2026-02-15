#!/usr/bin/env bash
# Run Kyutai MLX bridge (real STT/TTS). Uses scripts/kyutai/.venv if present.
# If the bridge crashes with SIGSEGV on your Mac (MLX/Metal), try:
#   MLX_FORCE_CPU=1 pnpm dev:kyutai-bridge
# or run without --use-mlx for mock mode (see docs/guides/KYUTAI-LOCAL-TEST.md).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PY=python3
if [ -x "scripts/kyutai/.venv/bin/python" ]; then
  PY="scripts/kyutai/.venv/bin/python"
fi
exec "$PY" scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090 --use-mlx "$@"
