#!/usr/bin/env bash
#
# Qwen3-TTS-12Hz-1.7B-Base emotional fine-tuning.
#
# Prerequisites:
#   - pip install qwen-tts
#   - Clone Qwen3-TTS and use its finetuning/ scripts:
#       git clone https://github.com/QwenLM/Qwen3-TTS.git
#       cd Qwen3-TTS/finetuning
#   - Run prepare-tts-data.sh and format-tts-data.py to produce train_raw.jsonl
#   - Run prepare_data.py to add audio_codes (see below)
#
# Usage:
#   ./scripts/qwen3-omni/finetune-tts.sh [--prepare-only]
#   Or from repo root: bash scripts/qwen3-omni/finetune-tts.sh
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
OUTPUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR/output/tts-emotional}"
QWEN_TTS_REPO="${QWEN_TTS_REPO:-}"
RAW_JSONL="${DATA_DIR}/train_raw.jsonl"
TRAIN_JSONL="${DATA_DIR}/train_with_codes.jsonl"
TOKENIZER="${TOKENIZER:-Qwen/Qwen3-TTS-Tokenizer-12Hz}"
INIT_MODEL="${INIT_MODEL:-Qwen/Qwen3-TTS-12Hz-1.7B-Base}"
SPEAKER_NAME="${SPEAKER_NAME:-ferni}"
BATCH_SIZE="${BATCH_SIZE:-2}"
LR="${LR:-2e-6}"
EPOCHS="${EPOCHS:-3}"
DEVICE="${DEVICE:-cuda:0}"

PREPARE_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --prepare-only) PREPARE_ONLY=true ;;
  esac
done

mkdir -p "$DATA_DIR" "$OUTPUT_DIR"

if [[ ! -f "$RAW_JSONL" ]]; then
  echo "Missing $RAW_JSONL. Run prepare-tts-data.sh then format-tts-data.py"
  exit 1
fi

# Resolve Qwen3-TTS finetuning directory
FINETUNING_DIR="$QWEN_TTS_REPO"
if [[ -z "$FINETUNING_DIR" ]]; then
  if [[ -d "$SCRIPT_DIR/../../Qwen3-TTS/finetuning" ]]; then
    FINETUNING_DIR="$(cd "$SCRIPT_DIR/../../Qwen3-TTS/finetuning" && pwd)"
  elif [[ -d "$SCRIPT_DIR/Qwen3-TTS/finetuning" ]]; then
    FINETUNING_DIR="$(cd "$SCRIPT_DIR/Qwen3-TTS/finetuning" && pwd)"
  else
    echo "Clone Qwen3-TTS and set QWEN_TTS_REPO or place repo at scripts/qwen3-omni/Qwen3-TTS:"
    echo "  git clone https://github.com/QwenLM/Qwen3-TTS.git $SCRIPT_DIR/Qwen3-TTS"
    exit 1
  fi
fi

# Step 1: prepare_data.py (extract audio_codes)
echo "=== Step 1: Prepare data (extract audio_codes) ==="
if [[ ! -f "$TRAIN_JSONL" ]]; then
  if [[ -f "$FINETUNING_DIR/prepare_data.py" ]]; then
    python "$FINETUNING_DIR/prepare_data.py" \
      --device "$DEVICE" \
      --tokenizer_model_path "$TOKENIZER" \
      --input_jsonl "$RAW_JSONL" \
      --output_jsonl "$TRAIN_JSONL"
  else
    echo "prepare_data.py not found in $FINETUNING_DIR"
    exit 1
  fi
else
  echo "Using existing $TRAIN_JSONL"
fi

[[ "$PREPARE_ONLY" == "true" ]] && echo "Prepare only. Skipping SFT." && exit 0

# Step 2: sft_12hz.py
echo "=== Step 2: Fine-tune (sft_12hz.py) ==="
if [[ -f "$FINETUNING_DIR/sft_12hz.py" ]]; then
  python "$FINETUNING_DIR/sft_12hz.py" \
    --init_model_path "$INIT_MODEL" \
    --output_model_path "$OUTPUT_DIR" \
    --train_jsonl "$TRAIN_JSONL" \
    --batch_size "$BATCH_SIZE" \
    --lr "$LR" \
    --num_epochs "$EPOCHS" \
    --speaker_name "$SPEAKER_NAME"
  echo "Output: $OUTPUT_DIR"
else
  echo "sft_12hz.py not found in $FINETUNING_DIR"
  exit 1
fi
