#!/usr/bin/env bash
# Live voice test: create minimal MLX model (if needed), start MLX server, print Ferni env.
# Run from repo root. Start Ferni in separate terminals (see docs/guides/LIVE-VOICE-TEST-MLX.md).

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MLX_APP="$REPO_ROOT/apps/mlx-qwen3-omni"
MODEL_DIR="${MLX_MODEL_PATH:-$MLX_APP/.test-model}"
PORT="${MLX_PORT:-8800}"

echo "=== MLX Qwen3-Omni live voice test ==="
echo ""

if [[ ! -d "$MODEL_DIR" ]] || [[ ! -f "$MODEL_DIR/model.safetensors" ]]; then
  echo "Creating minimal test model at $MODEL_DIR ..."
  (cd "$MLX_APP" && PYTHONPATH=src python scripts/create_minimal_test_model.py -o "$MODEL_DIR")
  echo ""
fi

echo "Start the MLX server in this terminal (leave it running):"
echo ""
echo "  cd $MLX_APP"
echo "  PYTHONPATH=src python -m mlx_qwen3_omni.server --model $MODEL_DIR --tokenizer Qwen/Qwen2.5-0.5B-Instruct --port $PORT"
echo ""
echo "Then in 4 other terminals start Ferni (see docs/guides/LIVE-VOICE-TEST-MLX.md)."
echo "Voice agent env:"
echo ""
echo "  USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:$PORT QWEN3_TTS_URL=http://localhost:$PORT QWEN3_OMNI_BACKEND=mlx LOG_FULL_RESPONSES=true pnpm dev"
echo ""
