#!/usr/bin/env bash
# E2E audio validation: send test PCM through STT, text through TTS; verify transcript and audio.
# Document procedure: docs/plans/KYUTAI-DSM-GAPS.md (E2E audio validation).
#
# Usage:
#   ./scripts/kyutai/e2e-audio-test.sh                    # Use 5s silence (generated or --input required)
#   ./scripts/kyutai/e2e-audio-test.sh path/to/speech.pcm # Use your 16kHz mono PCM file
#
# Prereqs: Bridge running (real mode). Optional: sox for generating 5s silence.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STT_PORT="${KYUTAI_STT_PORT:-8089}"
TTS_PORT="${KYUTAI_TTS_PORT:-8090}"
STT_URL="ws://127.0.0.1:${STT_PORT}/api/asr-streaming"
TTS_URL="ws://127.0.0.1:${TTS_PORT}/api/tts_streaming"

cd "$REPO_ROOT"

echo "=== Kyutai E2E audio test ==="
echo "  STT: $STT_URL"
echo "  TTS: $TTS_URL"
echo ""

# 1. Bridge health
if ! curl -s "http://127.0.0.1:${STT_PORT}/health" 2>/dev/null | grep -q '"status"'; then
  echo "Bridge not reachable. Start it first:"
  echo "  cd services/kyutai-bridge && cargo run --release"
  echo "  (Or use scripts/kyutai/validate-bridge.sh --real)"
  exit 1
fi
echo "Bridge OK"
echo ""

# 2. Test PCM: user path or generate 5s 16kHz mono silence
INPUT_PCM=""
if [[ -n "${1:-}" ]]; then
  INPUT_PCM="$1"
  if [[ ! -f "$INPUT_PCM" ]]; then
    echo "No such file: $INPUT_PCM"
    exit 1
  fi
  echo "Using input: $INPUT_PCM"
else
  GEN_PCM="$SCRIPT_DIR/test-5s-16k.pcm"
  if command -v sox &>/dev/null; then
    echo "⚠️  Generating 5s 16kHz mono SILENCE: $GEN_PCM"
    echo "   NOTE: Using silence input — STT transcript will be empty."
    echo "   Provide real speech audio for quality validation: ./scripts/kyutai/e2e-audio-test.sh path/to/speech.pcm"
    sox -n -r 16000 -c 1 -b 16 "$GEN_PCM" trim 0 5
    INPUT_PCM="$GEN_PCM"
  else
    echo "No --input given and sox not found. Provide a 16kHz mono PCM file:"
    echo "  ./scripts/kyutai/e2e-audio-test.sh path/to/your-5s.pcm"
    echo "Or install sox to auto-generate 5s silence."
    exit 1
  fi
fi
echo ""

# 3. Run STT -> TTS round-trip (uses local-proof.ts; reports STT latency, TTS latency)
export KYUTAI_STT_URL="$STT_URL"
export KYUTAI_TTS_URL="$TTS_URL"
OUT_WAV="$SCRIPT_DIR/e2e-tts-output.wav"
echo "Running STT then TTS (local-proof)..."
npx tsx "$SCRIPT_DIR/local-proof.ts" --input "$INPUT_PCM" --output "$OUT_WAV"
echo ""
echo "Output audio: $OUT_WAV (play with: afplay $OUT_WAV)"
echo ""
echo "Update docs/plans/KYUTAI-DSM-GAPS.md with the measured STT/TTS latency above (table: Measured latency)."
echo "=== E2E audio test done ==="
