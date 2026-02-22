#!/usr/bin/env bash
# Download Higgs Audio V2 tokenizer from HuggingFace (config.json + model.pth).
#
# Required for xCodec ONNX export. The tokenizer contains the audio codec
# (quantizer + decoder) used to decode TTS codes to waveform.
#
# Repo: https://huggingface.co/bosonai/higgs-audio-v2-tokenizer
#
# Usage:
#   bash scripts/higgs/download_tokenizer.sh
#   bash scripts/higgs/download_tokenizer.sh /custom/path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_ID="bosonai/higgs-audio-v2-tokenizer"
TARGET_DIR="${1:-}"

# If no path given, default to models/higgs-audio-v2-tokenizer relative to rust-higgs-pipeline
if [ -z "${TARGET_DIR}" ]; then
    REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
    TARGET_DIR="${REPO_ROOT}/apps/rust-higgs-pipeline/models/higgs-audio-v2-tokenizer"
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  Higgs Audio V2 — Tokenizer Download          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Model:  ${MODEL_ID}"
echo "║  Target: ${TARGET_DIR}"
echo "╚══════════════════════════════════════════════╝"

# Find HuggingFace CLI
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
        echo "   Install: pip install huggingface_hub[cli]  # or: pipx install huggingface_hub[cli]"
        exit 1
    fi
fi

echo "Using CLI: ${HF_CLI}"
mkdir -p "${TARGET_DIR}"

echo ""
echo "📥 Downloading tokenizer (config.json + model.pth, ~806MB)..."
echo ""

"${HF_CLI}" download "${MODEL_ID}" \
    --local-dir "${TARGET_DIR}" \
    --include "config.json" \
    --include "model.pth"

echo ""
echo "✅ Tokenizer downloaded to: ${TARGET_DIR}"
echo ""
ls -la "${TARGET_DIR}"
echo ""
echo "Next: run xCodec ONNX export (requires Python + boson_multimodal):"
echo "  bash scripts/higgs/download_xcodec_onnx.sh ${TARGET_DIR} <path-to-higgs-audio-v2>/xcodec_decoder.onnx"
echo "  Or from apps/rust-higgs-pipeline: bash ../../scripts/higgs/download_xcodec_onnx.sh"
echo ""
