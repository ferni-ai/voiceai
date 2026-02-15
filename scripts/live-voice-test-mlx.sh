#!/usr/bin/env bash
# Live voice test: start Rust MLX Omni server with a FULL model, print Ferni env.
# Run from repo root. For full E2E use a full Qwen3-Omni checkpoint (see docs/guides/LIVE-VOICE-TEST-MLX.md).
# No Python required.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUST_OMNI="$REPO_ROOT/apps/rust-mlx-omni"
# Default: full model path. Set MLX_MODEL_PATH to your full checkpoint dir for real E2E.
MODEL_DIR="${MLX_MODEL_PATH:-}"
PORT="${MLX_PORT:-8800}"

echo "=== Qwen3-Omni (Rust/MLX) live voice test ==="
echo ""

if [[ -z "$MODEL_DIR" ]]; then
  echo "No model path set. For FULL E2E (good quality) set MLX_MODEL_PATH to your full Qwen3-Omni checkpoint dir:"
  echo "  export MLX_MODEL_PATH=/path/to/full/model"
  echo ""
  echo "Optional smoke test only (poor quality): use the test checkpoint:"
  echo "  export MLX_MODEL_PATH=$RUST_OMNI/.test-model"
  echo "  (Add tokenizer.json to .test-model or set QWEN3_OMNI_TOKENIZER_PATH)"
  echo ""
  exit 1
fi

if [[ ! -d "$MODEL_DIR" ]]; then
  echo "Model dir not found: $MODEL_DIR"
  exit 1
fi

if [[ ! -f "$MODEL_DIR/model.safetensors" ]] && [[ ! -f "$MODEL_DIR/model.safetensors.index.json" ]]; then
  echo "No model.safetensors (or sharded index) in $MODEL_DIR"
  exit 1
fi

if [[ ! -f "$MODEL_DIR/tokenizer.json" ]] && [[ -z "$QWEN3_OMNI_TOKENIZER_PATH" ]]; then
  echo "Tokenizer: $MODEL_DIR/tokenizer.json not found and QWEN3_OMNI_TOKENIZER_PATH not set."
  echo "Set QWEN3_OMNI_TOKENIZER_PATH or add tokenizer.json to the model dir."
  echo ""
fi

echo "Start the Rust MLX server (leave it running):"
echo ""
echo "  cd $RUST_OMNI"
echo "  cargo run --bin mlx-omni-server --features server -- --model $MODEL_DIR --port $PORT"
echo ""
echo "Then start Ferni in 4 other terminals (see docs/guides/LIVE-VOICE-TEST-MLX.md)."
echo "Voice agent env:"
echo ""
echo "  USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:$PORT QWEN3_TTS_URL=http://localhost:$PORT QWEN3_OMNI_BACKEND=mlx LOG_FULL_RESPONSES=true pnpm dev"
echo ""
