#!/usr/bin/env bash
# =============================================================================
# Fine-tune Kyutai TTS 1.6B for Ferni persona voice (LoRA)
# =============================================================================
# Use when voice cloning (Phase 2a) quality is insufficient. Requires paired
# (text, audio) from Ferni conversations (~1–10 hours) and a GPU (e.g. A100).
#
# Prerequisites:
#   - Training data: (text, audio) pairs from Firestore L2 / TTS cache
#   - moshi-finetune or Kyutai delayed-streams-modeling training pipeline
#   - GPU: 1x A100 80GB (RunPod/Lambda ~$2/hr)
#
# References:
#   - https://github.com/nu-dialogue/moshi-finetune
#   - https://github.com/kyutai-labs/delayed-streams-modeling
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="${1:-$REPO_ROOT/data/kyutai-tts-training}"
OUTPUT_DIR="${2:-$REPO_ROOT/models/ferni-tts-finetuned}"
DSM_REPO="${DSM_REPO:-/tmp/delayed-streams-modeling}"

echo "Fine-tune Kyutai TTS for Ferni (LoRA)"
echo "  Data dir:   $DATA_DIR"
echo "  Output dir: $OUTPUT_DIR"
echo "  DSM repo:   $DSM_REPO"
echo ""

mkdir -p "$DATA_DIR" "$OUTPUT_DIR"

# Training data: expect (text, audio) pairs (e.g. manifest JSON + WAVs)
# Source: conversation transcripts + TTS audio cache (see src/memory/dynamic/)
if [[ ! -f "$DATA_DIR/manifest.jsonl" && ! -d "$DATA_DIR/wavs" ]]; then
  echo "No manifest.jsonl or wavs/ found in $DATA_DIR."
  echo "Add paired (text, audio) from Ferni conversations (1–10 hours target)."
  echo "See docs/guides/KYUTAI-DSM-SETUP.md Phase 2b."
  exit 1
fi

# If moshi-finetune or DSM training script exists, run it
for candidate in \
  "$DSM_REPO/scripts/train_tts_lora.py" \
  "$DSM_REPO/finetune_tts.py" \
  "/tmp/moshi-finetune/train_tts.py" \
  ; do
  if [[ -f "$candidate" ]]; then
    echo "Running: $candidate"
    (cd "$(dirname "$candidate")" && python "$(basename "$candidate")" \
      --data-dir "$DATA_DIR" \
      --output-dir "$OUTPUT_DIR" \
      "$@") || true
    exit 0
  fi
done

echo "No training script found. Clone and use:"
echo "  git clone https://github.com/kyutai-labs/delayed-streams-modeling.git $DSM_REPO"
echo "  # or: https://github.com/nu-dialogue/moshi-finetune"
echo "Then re-run this script or run their TTS LoRA training steps manually."
echo "After training, quantize for MLX (4-bit/8-bit) for Mac inference."
