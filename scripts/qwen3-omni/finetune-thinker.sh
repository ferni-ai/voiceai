#!/usr/bin/env bash
#
# Qwen3-Omni Thinker LoRA SFT + DPO fine-tuning via MS-Swift.
#
# Prerequisites:
#   - pip install ms-swift -U transformers -U
#   - Optional: pip install deepspeed  # multi-GPU
#   - HF_TOKEN or ModelScope token for model access
#   - Run extract-training-data.ts and generate-dpo-pairs.ts first to produce:
#       data/ferni-coaching-sft.jsonl
#       data/ferni-coaching-dpo.jsonl
#
# Usage:
#   ./scripts/qwen3-omni/finetune-thinker.sh [--sft-only] [--dpo-only]
#   Or from repo root: bash scripts/qwen3-omni/finetune-thinker.sh
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/output/qwen3-omni-thinker}"
MODEL_NAME="${MODEL_NAME:-Qwen/Qwen3-Omni-30B-A3B-Instruct}"

SFT_JSONL="${DATA_DIR}/ferni-coaching-sft.jsonl"
DPO_JSONL="${DATA_DIR}/ferni-coaching-dpo.jsonl"
SFT_ONLY=false
DPO_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --sft-only) SFT_ONLY=true ;;
    --dpo-only) DPO_ONLY=true ;;
  esac
done

if [[ ! -f "$SFT_JSONL" ]]; then
  echo "Missing $SFT_JSONL. Run: npx tsx scripts/qwen3-omni/extract-training-data.ts"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
export HF_TOKEN="${HF_TOKEN:-}"

# Stage 1: LoRA SFT
if [[ "$DPO_ONLY" != "true" ]]; then
  echo "=== Stage 1: LoRA SFT ==="
  swift sft \
    --model "$MODEL_NAME" \
    --train_type lora \
    --lora_rank 16 \
    --lora_alpha 32 \
    --target_modules all-linear \
    --dataset "$SFT_JSONL" \
    --max_length 4096 \
    --num_train_epochs 3 \
    --per_device_train_batch_size 1 \
    --gradient_accumulation_steps 16 \
    --learning_rate 1e-4 \
    --torch_dtype bfloat16 \
    --output_dir "$OUTPUT_DIR/thinker-sft" \
    --save_steps 100 \
    --save_total_limit 2 \
    --logging_steps 5
fi

# Resolve latest SFT checkpoint for DPO
SFT_CHECKPOINT="$OUTPUT_DIR/thinker-sft"
if [[ -d "$SFT_CHECKPOINT" ]]; then
  LATEST=$(ls -td "$SFT_CHECKPOINT"/checkpoint-* 2>/dev/null | head -1)
  if [[ -n "$LATEST" ]]; then
    SFT_CHECKPOINT="$LATEST"
  fi
fi

# Stage 2: DPO alignment
if [[ "$SFT_ONLY" != "true" && -f "$DPO_JSONL" ]]; then
  echo "=== Stage 2: DPO alignment ==="
  swift rlhf \
    --rlhf_type dpo \
    --model "$MODEL_NAME" \
    --adapters "$SFT_CHECKPOINT" \
    --dataset "$DPO_JSONL" \
    --learning_rate 5e-7 \
    --num_train_epochs 1 \
    --per_device_train_batch_size 1 \
    --gradient_accumulation_steps 8 \
    --output_dir "$OUTPUT_DIR/thinker-dpo" \
    --save_steps 50 \
    --save_total_limit 1
  echo "DPO output: $OUTPUT_DIR/thinker-dpo"
else
  if [[ "$SFT_ONLY" != "true" && ! -f "$DPO_JSONL" ]]; then
    echo "DPO skipped: $DPO_JSONL not found. Run: npx tsx scripts/qwen3-omni/generate-dpo-pairs.ts"
  fi
fi

echo "Done. SFT checkpoints: $OUTPUT_DIR/thinker-sft"
