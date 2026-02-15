#!/usr/bin/env bash
#
# Test Kyutai STT and TTS via MLX on Mac.
# Requires: clone of delayed-streams-modeling, moshi-mlx installed.
#
# Usage:
#   ./scripts/kyutai/run-mlx-test.sh [stt|tts]
#   Default: prints setup commands and runs TTS test if repo exists.
#
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DSM_REPO="${DSM_REPO:-/tmp/delayed-streams-modeling}"
MODE="${1:-tts}"

echo "=== Kyutai DSM MLX test (mode: $MODE) ==="
echo ""

if [ ! -d "$DSM_REPO" ]; then
  echo "Kyutai repo not found at: $DSM_REPO"
  echo "Clone it with:"
  echo "  git clone https://github.com/kyutai-labs/delayed-streams-modeling.git $DSM_REPO"
  echo ""
  echo "Then install: uv pip install 'moshi-mlx>=0.2.6'"
  exit 1
fi

cd "$DSM_REPO"

if [ "$MODE" = "stt" ]; then
  if [ ! -f "audio/bria.mp3" ]; then
    echo "No audio/bria.mp3 in repo; use any 16kHz mono audio file."
    exit 1
  fi
  echo "Running Kyutai STT (MLX)..."
  python -m moshi_mlx.run_inference --hf-repo kyutai/stt-1b-en_fr-mlx audio/bria.mp3 --temp 0
elif [ "$MODE" = "tts" ]; then
  echo "Running Kyutai TTS (MLX)..."
  echo "Hello from Ferni." | python scripts/tts_mlx.py - - --quantize 8
else
  echo "Unknown mode: $MODE (use stt or tts)"
  exit 1
fi

echo ""
echo "Done."
