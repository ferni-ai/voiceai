#!/usr/bin/env bash
# Validate Kyutai Rust/Candle bridge: mock mode (protocol + health) and optional real-weight run.
# Usage:
#   ./scripts/kyutai/validate-bridge.sh           # Mock only (fast)
#   ./scripts/kyutai/validate-bridge.sh --real    # Start bridge with real weights (long download)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BRIDGE_DIR="$REPO_ROOT/services/kyutai-bridge"

cd "$REPO_ROOT"

echo "=== Kyutai bridge validation ==="

# 1. Unit + integration tests (mock protocol)
echo "[1/3] Running cargo test in services/kyutai-bridge..."
(cd "$BRIDGE_DIR" && cargo test 2>&1)
echo "Tests passed."

# 2. Mock mode: start bridge, hit health/ready, stop
echo "[2/3] Mock mode: start bridge and check health..."
(cd "$BRIDGE_DIR" && cargo run --release -- --mock 2>&1) &
PID=$!
STT_PORT=8089
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${STT_PORT}/health" 2>/dev/null | grep -q '"status"'; then
    break
  fi
  if ! kill -0 $PID 2>/dev/null; then
    echo "Bridge process exited early"
    exit 1
  fi
  sleep 1
done
if ! curl -s "http://127.0.0.1:${STT_PORT}/health" | grep -q '"status"'; then
  kill $PID 2>/dev/null || true
  echo "Health check failed (bridge may still be compiling)"
  exit 1
fi
echo "Health OK"
if ! curl -s "http://127.0.0.1:${STT_PORT}/health/ready" | grep -q '"ready":true'; then
  kill $PID 2>/dev/null || true
  echo "Ready check failed"
  exit 1
fi
echo "Ready OK"
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true
echo "Mock mode validation passed."

# 3. Real weights (optional)
if [[ "${1:-}" == "--real" ]]; then
  echo "[3/3] Real weights: starting bridge (downloads from HuggingFace; use Ctrl+C to stop)..."
  echo "  STT: ws://127.0.0.1:${STT_PORT}/api/asr-streaming"
  echo "  TTS: ws://127.0.0.1:8090/api/tts_streaming"
  echo "  Measure: first interim, final, TTFB per docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md"
  (cd "$BRIDGE_DIR" && cargo run --release 2>&1)
else
  echo "[3/3] Skip real weights. Run with --real to start bridge with real models (KYUTAI_MOSHI_REPO=kyutai/moshiko-candle-bf16, ~15GB download)."
fi

echo "=== Validation done ==="
