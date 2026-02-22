#!/usr/bin/env bash
# One-step install for all local models (Higgs + Parakeet + xCodec).
#
# Run from repo root. Downloads:
#   1. Higgs Audio V2 LLM (~12GB)
#   2. Higgs Audio V2 tokenizer (~806MB) — for xCodec export
#   3. Parakeet TDT 1.1B (~400MB) — STT
#   4. xCodec decoder ONNX (~200-400MB) — requires Python + boson_multimodal
#
# Models are placed under: apps/rust-higgs-pipeline/models/
#
# Usage:
#   bash scripts/install-local-models.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="${REPO_ROOT}/apps/rust-higgs-pipeline/models"
SCRIPT_DIR="${REPO_ROOT}/scripts/higgs"

cd "${REPO_ROOT}"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Install All Local Models (Owned Stack)          ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Models dir: ${MODELS_DIR}"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Ensure HuggingFace CLI is available (download_tokenizer and download_model use it)
if ! command -v huggingface-cli &>/dev/null && ! command -v hf &>/dev/null; then
    echo "Installing HuggingFace CLI..."
    if command -v pipx &>/dev/null; then
        pipx install huggingface_hub[cli]
    elif command -v pip &>/dev/null; then
        pip install --user "huggingface_hub[cli]"
    else
        echo "❌ Install pip or pipx, then: pip install huggingface_hub[cli]"
        exit 1
    fi
fi

bash "${SCRIPT_DIR}/download_all_models.sh" "${MODELS_DIR}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Next steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If xCodec export failed (step 4), set up Python and run it manually:"
echo "  1. Clone Higgs Audio repo: git clone https://github.com/boson-ai/higgs-audio.git && cd higgs-audio"
echo "  2. pip install -r requirements.txt && pip install -e ."
echo "  3. pip install torch torchaudio onnx onnxruntime"
echo "  4. From repo root: bash scripts/higgs/download_xcodec_onnx.sh \\"
echo "       apps/rust-higgs-pipeline/models/higgs-audio-v2-tokenizer \\"
echo "       apps/rust-higgs-pipeline/models/higgs-audio-v2/xcodec_decoder.onnx"
echo ""
echo "Build and run Higgs pipeline:"
echo "  cd apps/rust-higgs-pipeline && cargo build --release"
echo "  ./target/release/higgs-voice-pipeline --port 8600 \\"
echo "    --higgs-model ./models/higgs-audio-v2 \\"
echo "    --xcodec-model ./models/higgs-audio-v2/xcodec_decoder.onnx \\"
echo "    --parakeet-model ./models/parakeet-tdt-1.1b \\"
echo "    --ollama-url http://127.0.0.1:11434 --ollama-model llama3.2"
echo ""
echo "Full runbook: docs/runbooks/OWNED-STACK-E2E.md"
echo ""
