#!/usr/bin/env bash
#
# Full E2E: Qwen3-Omni (Candle) + Ferni.
# Prints exact commands to run full speech-in → speech-out with the real 30B-A3B model.
#
# Prerequisites:
#   - Model downloaded: ./scripts/qwen3-omni/download-model.sh
#   - Rust (for Candle server)
#   - Node/pnpm (for Ferni)
#
# Usage:
#   ./scripts/qwen3-omni/full-e2e.sh              # print steps
#   ./scripts/qwen3-omni/full-e2e.sh --start      # print steps + start Candle server in foreground
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_MODEL="$REPO_ROOT/models/Qwen3-Omni-30B-A3B-Instruct"

START_SERVER=false
for a in "$@"; do
  [ "$a" = "--start" ] && START_SERVER=true
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODEL_PATH="${OMNI_MODEL_PATH:-$DEFAULT_MODEL}"

echo -e "${GREEN}=== Full E2E: Qwen3-Omni (Candle) + Ferni ===${NC}"
echo ""

if [ ! -d "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH/tokenizer.json" ]; then
  echo -e "${YELLOW}Model not found at: $MODEL_PATH${NC}"
  echo "Download first (one-time, ~70 GB):"
  echo "  ./scripts/qwen3-omni/download-model.sh"
  echo ""
  [ "$START_SERVER" = true ] && exit 1
else
  echo "Model: $MODEL_PATH"
  echo ""
fi

echo "1) Start Candle Omni server (in its own terminal, port 8000):"
echo "   cd $REPO_ROOT/apps/rust-perf"
echo "   export OMNI_MODEL_PATH=\"$MODEL_PATH\""
echo "   cargo run --bin qwen3-omni-server --features server --no-default-features -- --model-path \"\$OMNI_MODEL_PATH\""
echo ""

echo "2) Start Ferni (4 terminals):"
echo "   Terminal 1: pnpm token-server"
echo "   Terminal 2: pnpm ui-server"
echo "   Terminal 3: cd apps/web && pnpm dev"
echo "   Terminal 4: USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8000 QWEN3_TTS_URL=http://localhost:8000 LOG_FULL_RESPONSES=true pnpm dev"
echo ""

echo "3) Open http://localhost:3004, start a voice room, and talk. Full E2E with real model."
echo ""

echo "Runbook: docs/guides/FULL-E2E-QWEN3-OMNI.md"
echo ""

if [ "$START_SERVER" = true ]; then
  echo -e "${GREEN}Starting Candle server...${NC}"
  cd "$REPO_ROOT/apps/rust-perf"
  export OMNI_MODEL_PATH="$MODEL_PATH"
  exec cargo run --bin qwen3-omni-server --features server --no-default-features -- --model-path "$OMNI_MODEL_PATH"
fi
