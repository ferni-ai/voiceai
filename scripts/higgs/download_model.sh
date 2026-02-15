#!/usr/bin/env bash
# Download Higgs Audio V2 model from HuggingFace.
#
# Downloads:
#   - config.json (model architecture)
#   - tokenizer.json (Llama tokenizer)
#   - *.safetensors (model weights, ~12GB total)
#   - generation_config.json
#
# Usage:
#   bash scripts/higgs/download_model.sh
#   bash scripts/higgs/download_model.sh /custom/path

set -euo pipefail

MODEL_ID="bosonai/higgs-audio-v2-generation-3B-base"
TARGET_DIR="${1:-models/higgs-audio-v2}"

echo "╔══════════════════════════════════════════════╗"
echo "║  Higgs Audio V2 — Model Download             ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Model:  ${MODEL_ID}"
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
echo "📥 Downloading model files (this may take a while — ~12GB)..."
echo ""

# Download specific files we need (skip large unnecessary files)
${HF_CLI} download "${MODEL_ID}" \
    --local-dir "${TARGET_DIR}" \
    --include "config.json" \
    --include "tokenizer.json" \
    --include "tokenizer_config.json" \
    --include "special_tokens_map.json" \
    --include "generation_config.json" \
    --include "*.safetensors"

echo ""
echo "✅ Model downloaded to: ${TARGET_DIR}"
echo ""

# List downloaded files
echo "📂 Files:"
ls -lh "${TARGET_DIR}"/*.json "${TARGET_DIR}"/*.safetensors 2>/dev/null || true

echo ""
echo "📊 Total size:"
du -sh "${TARGET_DIR}"

echo ""
echo "Next steps:"
echo "  1. Export audio tokenizer: python scripts/higgs/export_audio_tokenizer.py"
echo "  2. Build server: cd apps/rust-higgs-tts && cargo build --release"
echo "  3. Run: ./target/release/higgs-tts-server --model-path ${TARGET_DIR}"
