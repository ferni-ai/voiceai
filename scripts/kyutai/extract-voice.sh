#!/usr/bin/env bash
# =============================================================================
# Extract Kyutai TTS voice embedding from ~10s reference audio
# =============================================================================
# Usage:
#   ./scripts/kyutai/extract-voice.sh <input.wav> [output_name]
#
# Example:
#   ./scripts/kyutai/extract-voice.sh /path/to/ferni-10s.wav ferni
#   # Writes models/ferni-voices/ferni/ferni-voice.safetensors (if DSM repo has script)
#
# Prerequisites:
#   - Clone: git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
#   - Python env with moshi-mlx or moshi deps (see Kyutai repo scripts)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INPUT_WAV="${1:?Usage: $0 <input.wav> [output_name]}"
OUTPUT_NAME="${2:-ferni}"
VOICES_DIR="${REPO_ROOT}/models/ferni-voices"
DSM_REPO="${DSM_REPO:-/tmp/delayed-streams-modeling}"

mkdir -p "$VOICES_DIR/$OUTPUT_NAME"

if [[ ! -f "$INPUT_WAV" ]]; then
  echo "Error: Input file not found: $INPUT_WAV"
  exit 1
fi

# Check for Kyutai extraction script (location may vary by repo version)
EXTRACT_SCRIPT=""
for candidate in \
  "$DSM_REPO/scripts/extract_voice_embedding.py" \
  "$DSM_REPO/scripts/extract_embedding.py" \
  "$DSM_REPO/tts_pytorch.ipynb" \
  ; do
  if [[ -f "$candidate" ]]; then
    EXTRACT_SCRIPT="$candidate"
    break
  fi
done

if [[ -n "$EXTRACT_SCRIPT" ]]; then
  echo "Using Kyutai script: $EXTRACT_SCRIPT"
  cd "$DSM_REPO"
  if [[ "$EXTRACT_SCRIPT" == *.py ]]; then
    python "$EXTRACT_SCRIPT" --audio "$INPUT_WAV" --output "$VOICES_DIR/$OUTPUT_NAME/${OUTPUT_NAME}-voice.safetensors" || true
  fi
  # If script not found or fails, fall through to instructions
fi

if [[ ! -f "$VOICES_DIR/$OUTPUT_NAME"/*.safetensors ]]; then
  echo ""
  echo "Voice embedding not yet produced by this script."
  echo "Either:"
  echo "  1. Clone Kyutai repo and run their voice extraction pipeline:"
  echo "     git clone https://github.com/kyutai-labs/delayed-streams-modeling.git $DSM_REPO"
  echo "     # Then follow scripts in $DSM_REPO for TTS voice extraction"
  echo "  2. Use Kyutai/Unmute docs: https://github.com/kyutai-labs/delayed-streams-modeling"
  echo "  3. Place a pre-made .safetensors embedding at: $VOICES_DIR/$OUTPUT_NAME/${OUTPUT_NAME}-voice.safetensors"
  echo ""
  echo "Input audio: $INPUT_WAV"
  echo "Output dir:  $VOICES_DIR/$OUTPUT_NAME/"
  exit 0
fi

echo "Done. Voice embedding: $VOICES_DIR/$OUTPUT_NAME/"
ls -la "$VOICES_DIR/$OUTPUT_NAME/"
