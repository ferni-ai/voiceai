#!/usr/bin/env bash
# Benchmark Kyutai bridge: STT first interim, STT final, TTS TTFB vs better-than-human targets.
# Usage:
#   ./scripts/kyutai/benchmark-bridge.sh           # Bridge must already be running (real mode)
#   ./scripts/kyutai/benchmark-bridge.sh --start   # Start bridge in background, then run benchmark
#
# Targets: STT first interim < 150 ms, STT final < 300 ms, TTS TTFB < 250 ms
#   (see docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STT_PORT="${KYUTAI_STT_PORT:-8089}"
TTS_PORT="${KYUTAI_TTS_PORT:-8090}"

cd "$REPO_ROOT"

START_BRIDGE=false
for arg in "$@"; do
  if [[ "$arg" == "--start" ]]; then
    START_BRIDGE=true
    break
  fi
done

BRIDGE_PID=""
if [[ "$START_BRIDGE" == "true" ]]; then
  echo "Starting bridge in background (real mode)..."
  (cd "$REPO_ROOT/services/kyutai-bridge" && cargo run --release 2>&1) &
  BRIDGE_PID=$!
  echo "Bridge PID: $BRIDGE_PID"
  echo "Waiting for bridge to be ready (health check)..."
  for i in $(seq 1 120); do
    if curl -s "http://127.0.0.1:${STT_PORT}/health" 2>/dev/null | grep -q '"status"'; then
      echo "Bridge ready."
      break
    fi
    if ! kill -0 $BRIDGE_PID 2>/dev/null; then
      echo "Bridge process exited."
      exit 1
    fi
    sleep 2
  done
  if ! curl -s "http://127.0.0.1:${STT_PORT}/health" | grep -q '"status"'; then
    kill $BRIDGE_PID 2>/dev/null || true
    echo "Bridge failed to become ready in time."
    exit 1
  fi
fi

export KYUTAI_STT_URL="ws://127.0.0.1:${STT_PORT}/api/asr-streaming"
export KYUTAI_TTS_URL="ws://127.0.0.1:${TTS_PORT}/api/tts_streaming"

if ! curl -s "http://127.0.0.1:${STT_PORT}/health" 2>/dev/null | grep -q '"status"'; then
  echo "Bridge not reachable. Start it first:"
  echo "  cd services/kyutai-bridge && cargo run --release"
  echo "  Or run: ./scripts/kyutai/benchmark-bridge.sh --start"
  exit 1
fi

echo "Running latency benchmark..."
npx tsx "$SCRIPT_DIR/benchmark-latency.ts"

if [[ -n "$BRIDGE_PID" ]] && kill -0 $BRIDGE_PID 2>/dev/null; then
  echo ""
  echo "Stopping bridge (PID $BRIDGE_PID)..."
  kill $BRIDGE_PID 2>/dev/null || true
  wait $BRIDGE_PID 2>/dev/null || true
fi

echo "Done. Update docs/plans/KYUTAI-DSM-GAPS.md with measured values if needed."
