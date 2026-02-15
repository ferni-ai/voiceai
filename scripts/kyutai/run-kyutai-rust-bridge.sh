#!/usr/bin/env bash
# Run Kyutai Rust/Candle bridge (services/kyutai-bridge).
# Same protocol as the Python MLX bridge; no Python, no MLX.
# Usage:
#   ./scripts/kyutai/run-kyutai-rust-bridge.sh           # Mock (no models)
#   ./scripts/kyutai/run-kyutai-rust-bridge.sh --real    # Real inference (downloads from HF)
# Env: KYUTAI_STT_PORT=8089, KYUTAI_TTS_PORT=8090, KYUTAI_MOSHI_REPO=kyutai/moshiko-candle-bf16
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/services/kyutai-bridge"
if [[ "${1:-}" == "--real" ]]; then
  exec cargo run --release
else
  exec cargo run --release -- --mock
fi
