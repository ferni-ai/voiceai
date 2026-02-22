#!/usr/bin/env bash
# Download NVIDIA Parakeet TDT 0.6B v2 + Silero VAD models for the Higgs voice pipeline.
#
# Usage:
#   ./scripts/parakeet/download_models.sh [--models-dir /path/to/models]
#
# Models downloaded:
#   1. Parakeet TDT 0.6B v2 (ONNX) - Batch STT with word timestamps (1.69% WER)
#   2. Parakeet EOU 0.6B (ONNX)     - Streaming STT with end-of-utterance detection
#   3. Silero VAD v5 (ONNX)         - Neural voice activity detection (~2MB)

set -euo pipefail

MODELS_DIR="${1:-models}"
PARAKEET_TDT_DIR="$MODELS_DIR/parakeet-tdt-0.6b"
PARAKEET_EOU_DIR="$MODELS_DIR/parakeet-eou-0.6b"
SILERO_VAD_DIR="$MODELS_DIR/silero-vad"

# HuggingFace model IDs
PARAKEET_TDT_HF="nvidia/parakeet-tdt-0.6b-v2"
PARAKEET_EOU_HF="nvidia/parakeet-tdt_eou-0.6b-v2"
SILERO_VAD_URL="https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx"

echo "============================================"
echo "  Ferni Voice Pipeline - Model Downloader"
echo "============================================"
echo ""
echo "Models directory: $MODELS_DIR"
echo ""

# Check for huggingface-cli
if ! command -v huggingface-cli &>/dev/null; then
    echo "Installing huggingface_hub CLI..."
    pip install -q huggingface_hub
fi

# 1. Download Parakeet TDT 0.6B v2 (batch transcription)
echo "--- [1/3] Parakeet TDT 0.6B v2 (batch STT) ---"
if [ -d "$PARAKEET_TDT_DIR" ] && [ -f "$PARAKEET_TDT_DIR/model.onnx" ]; then
    echo "  Already downloaded, skipping."
else
    echo "  Downloading from $PARAKEET_TDT_HF..."
    mkdir -p "$PARAKEET_TDT_DIR"
    huggingface-cli download "$PARAKEET_TDT_HF" \
        --include "*.onnx" "*.json" "vocab.txt" "tokenizer*" \
        --local-dir "$PARAKEET_TDT_DIR" \
        --local-dir-use-symlinks False
    echo "  Done."
fi
echo ""

# 2. Download Parakeet EOU 0.6B (streaming transcription)
echo "--- [2/3] Parakeet EOU 0.6B (streaming STT) ---"
if [ -d "$PARAKEET_EOU_DIR" ] && [ -f "$PARAKEET_EOU_DIR/model.onnx" ]; then
    echo "  Already downloaded, skipping."
else
    echo "  Downloading from $PARAKEET_EOU_HF..."
    mkdir -p "$PARAKEET_EOU_DIR"
    huggingface-cli download "$PARAKEET_EOU_HF" \
        --include "*.onnx" "*.json" "vocab.txt" "tokenizer*" \
        --local-dir "$PARAKEET_EOU_DIR" \
        --local-dir-use-symlinks False
    echo "  Done."
fi
echo ""

# 3. Download Silero VAD v5
echo "--- [3/3] Silero VAD v5 (voice activity detection) ---"
if [ -f "$SILERO_VAD_DIR/silero_vad.onnx" ]; then
    echo "  Already downloaded, skipping."
else
    echo "  Downloading from GitHub..."
    mkdir -p "$SILERO_VAD_DIR"
    curl -sSL "$SILERO_VAD_URL" -o "$SILERO_VAD_DIR/silero_vad.onnx"
    echo "  Done."
fi
echo ""

# Print summary
echo "============================================"
echo "  Download Complete"
echo "============================================"
echo ""
echo "Model locations:"
echo "  Parakeet TDT: $PARAKEET_TDT_DIR"
echo "  Parakeet EOU: $PARAKEET_EOU_DIR"
echo "  Silero VAD:   $SILERO_VAD_DIR/silero_vad.onnx"
echo ""
echo "Start the pipeline with:"
echo "  cargo run -- \\"
echo "    --parakeet-model $PARAKEET_TDT_DIR \\"
echo "    --parakeet-eou-model $PARAKEET_EOU_DIR \\"
echo "    --silero-vad $SILERO_VAD_DIR/silero_vad.onnx"
echo ""
echo "Or set environment variables:"
echo "  export PARAKEET_MODEL_DIR=$PARAKEET_TDT_DIR"
echo "  export PARAKEET_EOU_MODEL_DIR=$PARAKEET_EOU_DIR"
echo "  export SILERO_VAD_PATH=$SILERO_VAD_DIR/silero_vad.onnx"
