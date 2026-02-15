#!/usr/bin/env bash
# Download Whisper GGML model for STT in the Higgs pipeline.
#
# Downloads ggml-base.en.bin (~140MB) from ggerganov/whisper.cpp on HuggingFace.
# This is the quantized Whisper base.en model used by whisper-rs for
# real-time speech-to-text in the Rust pipeline.
#
# Usage:
#   bash scripts/higgs/download_whisper_ggml.sh
#   bash scripts/higgs/download_whisper_ggml.sh /custom/output/dir

set -euo pipefail

MODEL_ID="ggerganov/whisper.cpp"
MODEL_FILE="ggml-base.en.bin"
TARGET_DIR="${1:-models/whisper}"

echo "╔══════════════════════════════════════════════╗"
echo "║  Whisper GGML — Model Download               ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Model:  ${MODEL_ID}"
echo "║  File:   ${MODEL_FILE}"
echo "║  Target: ${TARGET_DIR}"
echo "╚══════════════════════════════════════════════╝"

# Find a working HuggingFace CLI
HF_CLI=""
if command -v huggingface-cli &>/dev/null; then
    HF_CLI="huggingface-cli"
elif command -v hf &>/dev/null; then
    HF_CLI="hf"
elif [ -f "$HOME/.local/bin/hf" ]; then
    HF_CLI="$HOME/.local/bin/hf"
else
    echo "⚠️  HuggingFace CLI not found. Installing via pipx..."
    if command -v pipx &>/dev/null; then
        pipx install huggingface_hub[cli]
        HF_CLI="hf"
    else
        echo "❌ Neither huggingface-cli, hf, nor pipx found."
        echo "   Install with: pipx install huggingface_hub[cli]"
        echo "   Or: brew install pipx && pipx install huggingface_hub[cli]"
        exit 1
    fi
fi

echo "Using CLI: ${HF_CLI}"

# Create target directory
mkdir -p "${TARGET_DIR}"

echo ""
echo "📥 Downloading ${MODEL_FILE} (~140MB)..."
echo ""

${HF_CLI} download "${MODEL_ID}" \
    --local-dir "${TARGET_DIR}" \
    --include "${MODEL_FILE}"

echo ""
echo "✅ Whisper GGML model downloaded to: ${TARGET_DIR}/${MODEL_FILE}"
echo ""

# Verify file exists and show size
if [ -f "${TARGET_DIR}/${MODEL_FILE}" ]; then
    echo "📂 File:"
    ls -lh "${TARGET_DIR}/${MODEL_FILE}"
else
    echo "❌ Download may have failed — file not found at ${TARGET_DIR}/${MODEL_FILE}"
    exit 1
fi
