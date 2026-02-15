#!/usr/bin/env bash
# =============================================================================
# Fine-tune Qwen2.5-3B (or 1.5B) on Ferni conversation transcripts (LoRA)
# =============================================================================
# Use for Phase 3: self-hosted LLM on GCE. Training data from Firestore L2
# memory and persona bundles; LoRA with Unsloth; quantize to Q4_K_M GGUF.
#
# Prerequisites:
#   - Training data: Ferni conversation transcripts, persona prompts, tool examples
#   - Base model: Qwen2.5-3B-Instruct (or Qwen2.5-1.5B-Instruct)
#   - GPU: 1x A100 80GB (~2–4 hours)
#
# References:
#   - Unsloth: https://github.com/unslothai/unsloth
#   - Qwen2.5: https://huggingface.co/Qwen/Qwen2.5-3B-Instruct
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="${1:-$REPO_ROOT/data/kyutai-llm-training}"
OUTPUT_DIR="${2:-$REPO_ROOT/models/ferni-llm-finetuned}"
BASE_MODEL="${BASE_MODEL:-Qwen/Qwen2.5-3B-Instruct}"

echo "Fine-tune LLM for Ferni (LoRA)"
echo "  Data dir:   $DATA_DIR"
echo "  Output dir: $OUTPUT_DIR"
echo "  Base model: $BASE_MODEL"
echo ""

mkdir -p "$DATA_DIR" "$OUTPUT_DIR"

# Training data: conversation transcripts (src/memory/dynamic/stm-promotion.ts),
# persona prompts (src/personas/bundles/), tool calling examples
if [[ ! -f "$DATA_DIR/train.jsonl" && ! -f "$DATA_DIR/train.json" ]]; then
  echo "No train.jsonl or train.json in $DATA_DIR."
  echo "Export Ferni conversation transcripts and persona prompts to this dir."
  echo "See docs/guides/KYUTAI-DSM-SETUP.md Phase 3a."
  exit 1
fi

# If Unsloth or a training script exists, run it
for candidate in \
  "$REPO_ROOT/scripts/train-llm-lora.py" \
  "/tmp/unsloth/scripts/run_llm.py" \
  ; do
  if [[ -f "$candidate" ]]; then
    echo "Running: $candidate"
    (cd "$(dirname "$candidate")" && python "$(basename "$candidate")" \
      --data-dir "$DATA_DIR" \
      --output-dir "$OUTPUT_DIR" \
      --base-model "$BASE_MODEL" \
      "$@") || true
    echo "After training, quantize to Q4_K_M GGUF (~2 GB) for deployment."
    exit 0
  fi
done

echo "No training script found. Use Unsloth or similar:"
echo "  pip install unsloth"
echo "  # Export training data from Firestore L2 + persona bundles"
echo "  # Run LoRA fine-tune (rank 8–16), then quantize to GGUF"
echo "See docs/guides/KYUTAI-DSM-SETUP.md Phase 3a."
