#!/usr/bin/env bash
# Export xCodec audio tokenizer decoder to ONNX format.
#
# Wraps the Python export script (export_audio_tokenizer.py) which:
#   1. Loads the HiggsAudioTokenizer from model.pth
#   2. Wraps quantizer + fc_post2 + decoder_2 into a single module
#   3. Exports to ONNX with dynamic axes for streaming inference
#
# Prerequisites:
#   pip install torch torchaudio onnx onnxruntime einops \
#       vector-quantize-pytorch transformers huggingface_hub librosa \
#       descript-audiotools descript-audio-codec
#   cd /path/to/higgs-audio && pip install -e .
#
# Usage:
#   bash scripts/higgs/download_xcodec_onnx.sh
#   bash scripts/higgs/download_xcodec_onnx.sh /path/to/higgs-model /path/to/output.onnx

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKENIZER_DIR="${1:-models/higgs-audio-v2-tokenizer}"
OUTPUT_PATH="${2:-models/higgs-audio-v2/xcodec_decoder.onnx}"

echo "╔══════════════════════════════════════════════╗"
echo "║  xCodec Decoder — ONNX Export                ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Tokenizer: ${TOKENIZER_DIR}"
echo "║  Output:    ${OUTPUT_PATH}"
echo "╚══════════════════════════════════════════════╝"

# Check Python3 is available
if ! command -v python3 &>/dev/null; then
    echo "❌ python3 not found. Please install Python 3.10+."
    exit 1
fi

# Check the export script exists
EXPORT_SCRIPT="${SCRIPT_DIR}/export_audio_tokenizer.py"
if [ ! -f "${EXPORT_SCRIPT}" ]; then
    echo "❌ Export script not found: ${EXPORT_SCRIPT}"
    exit 1
fi

# Check tokenizer directory exists
if [ ! -d "${TOKENIZER_DIR}" ]; then
    echo "❌ Tokenizer directory not found: ${TOKENIZER_DIR}"
    echo "   Download the tokenizer first, or provide the correct path."
    exit 1
fi

echo ""
echo "🔧 Running ONNX export..."
echo ""

python3 "${EXPORT_SCRIPT}" \
    --tokenizer-path "${TOKENIZER_DIR}" \
    --output "${OUTPUT_PATH}"

echo ""
if [ -f "${OUTPUT_PATH}" ]; then
    echo "✅ xCodec decoder exported to: ${OUTPUT_PATH}"
    echo ""
    echo "📂 File:"
    ls -lh "${OUTPUT_PATH}"
else
    echo "❌ Export may have failed — file not found at ${OUTPUT_PATH}"
    exit 1
fi
