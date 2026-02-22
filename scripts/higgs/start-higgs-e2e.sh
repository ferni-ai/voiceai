#!/usr/bin/env bash
# Start all servers for local e2e using Higgs (no Gemini).
#
# Stack:
#   - STT: Parakeet 1.1B (Higgs pipeline on 8600)
#   - LLM: Ollama (Gemma 3n or llama3.2) — no Gemini
#   - TTS: Cartesia (pipeline has no TTS models by default; add --higgs-model + --xcodec-model for Higgs TTS)
#
# Prereqs:
#   1. Parakeet 1.1B: ./scripts/higgs/download-parakeet-1.1b.sh  (or already in apps/rust-higgs-pipeline/models/parakeet-tdt-1.1b)
#   2. Ollama: install from https://ollama.com, then: ollama run llama3.2   (or: ollama run gemma3n:e4b)
#
# Usage:
#   ./scripts/higgs/start-higgs-e2e.sh
#   # Then open http://localhost:3004 and start a voice call.
#
# To stop: kill the voice agent (Ctrl+C), then: pkill -f higgs-voice-pipeline; pkill -f "token-server|ui-server"; pkill -f "vite"

set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

HIGGS_PORT="${HIGGS_PIPELINE_PORT:-8600}"
PARAKEET_MODEL="${PARAKEET_MODEL_DIR:-$REPO/apps/rust-higgs-pipeline/models/parakeet-tdt-1.1b}"
OLLAMA_URL="${GEMMA3N_OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${GEMMA3N_MODEL:-llama3.2}"

echo "=== Higgs e2e (no Gemini) ==="
echo "  STT: Parakeet 1.1B (Higgs pipeline :$HIGGS_PORT)"
echo "  LLM: Ollama ($OLLAMA_URL, model=$OLLAMA_MODEL)"
echo "  TTS: Cartesia (set TTS_PROVIDER=higgs-pipeline + add Higgs/xCodec to pipeline for Higgs TTS)"
echo ""

# 1. Token server (3001)
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q 200; then
  echo "Starting token server (3001)..."
  pnpm token-server &
  sleep 2
fi

# 2. UI server (3002)
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health 2>/dev/null | grep -q 200; then
  echo "Starting UI server (3002)..."
  pnpm ui-server &
  sleep 2
fi

# 3. Vite (3004)
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/ 2>/dev/null | grep -q 200; then
  echo "Starting Vite (3004)..."
  (cd apps/web && pnpm dev) &
  sleep 5
fi

# 4. Higgs pipeline (Parakeet STT only)
if ! curl -s http://localhost:$HIGGS_PORT/health 2>/dev/null | grep -q '"status":"ok"'; then
  if [[ ! -d "$PARAKEET_MODEL" ]]; then
    echo "Parakeet 1.1B not found at $PARAKEET_MODEL. Run: ./scripts/higgs/download-parakeet-1.1b.sh"
    exit 1
  fi
  echo "Starting Higgs pipeline (port $HIGGS_PORT, Parakeet STT only)..."
  (cd apps/rust-higgs-pipeline && STREAM_CHUNK_STEPS=12 ./target/release/higgs-voice-pipeline --port "$HIGGS_PORT" --parakeet-model "$PARAKEET_MODEL") &
  sleep 10
fi

# Wait for pipeline STT
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s "http://localhost:$HIGGS_PORT/health/ready" 2>/dev/null | grep -q '"stt_available":true'; then
    break
  fi
  sleep 1
done
if ! curl -s "http://localhost:$HIGGS_PORT/health/ready" 2>/dev/null | grep -q '"stt_available":true'; then
  echo "Higgs pipeline STT not ready. Check apps/rust-higgs-pipeline logs."
  exit 1
fi
echo "Higgs pipeline STT ready."

# Ollama check (required for LLM; set SKIP_OLLAMA_CHECK=1 to start anyway)
if [[ -z "${SKIP_OLLAMA_CHECK:-}" ]]; then
  if ! curl -s -o /dev/null -w "%{http_code}" "$OLLAMA_URL/api/tags" 2>/dev/null | grep -q 200; then
    echo ""
    echo "Ollama not reachable at $OLLAMA_URL. Start it and pull a model:"
    echo "  ollama run $OLLAMA_MODEL"
    echo "  # or: ollama run gemma3n:e4b  (then set GEMMA3N_MODEL=gemma3n:e4b)"
    echo ""
    echo "To start without Ollama (voice agent will fail on LLM): SKIP_OLLAMA_CHECK=1 $0"
    exit 1
  fi
  if ! curl -s "$OLLAMA_URL/api/tags" 2>/dev/null | grep -q "\"name\":\"$OLLAMA_MODEL\""; then
    echo ""
    echo "Model $OLLAMA_MODEL not found. Pull it:"
    echo "  ollama run $OLLAMA_MODEL"
    exit 1
  fi
fi

echo ""
echo "Starting voice agent (Higgs STT + Ollama LLM + Cartesia TTS)..."
echo "  Open http://localhost:3004 and start a voice call."
echo ""

export USE_HIGGS_STT=true
export HIGGS_PIPELINE_URL="ws://localhost:$HIGGS_PORT/ws"
export TTS_PROVIDER=cartesia
export USE_GEMMA3N=true
export GEMMA3N_OLLAMA_URL="$OLLAMA_URL"
export GEMMA3N_MODEL="$OLLAMA_MODEL"
export LOG_FULL_RESPONSES="${LOG_FULL_RESPONSES:-true}"

exec pnpm dev
