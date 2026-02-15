#!/usr/bin/env bash
# Download all models needed for the Higgs Audio V2 pipeline.
#
# This orchestrator script calls individual download scripts:
#   1. Higgs Audio V2 model (~12GB) — LLM backbone + DualFFN adapter
#   2. Whisper GGML base.en (~140MB) — Speech-to-text
#   3. xCodec decoder ONNX (~200-400MB) — Audio tokenizer decoder
#
# Usage:
#   bash scripts/higgs/download_all_models.sh
#   bash scripts/higgs/download_all_models.sh /custom/models/dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${1:-models}"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Higgs Audio V2 — Full Model Download            ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Models dir: ${MODELS_DIR}"
echo "║                                                  ║"
echo "║  Components:                                     ║"
echo "║    1. Higgs Audio V2 LLM      (~12GB)            ║"
echo "║    2. Whisper GGML base.en    (~140MB)            ║"
echo "║    3. xCodec decoder ONNX    (~200-400MB)         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

FAILED=0

# ── 1. Higgs Audio V2 model ──────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1/3: Higgs Audio V2 LLM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bash "${SCRIPT_DIR}/download_model.sh" "${MODELS_DIR}/higgs-audio-v2"; then
    echo "✅ Higgs Audio V2 model — done"
else
    echo "❌ Higgs Audio V2 model — FAILED"
    FAILED=$((FAILED + 1))
fi
echo ""

# ── 2. Whisper GGML ──────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2/3: Whisper GGML (base.en)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bash "${SCRIPT_DIR}/download_whisper_ggml.sh" "${MODELS_DIR}/whisper"; then
    echo "✅ Whisper GGML — done"
else
    echo "❌ Whisper GGML — FAILED"
    FAILED=$((FAILED + 1))
fi
echo ""

# ── 3. xCodec ONNX export ───────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3/3: xCodec Decoder ONNX Export"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bash "${SCRIPT_DIR}/download_xcodec_onnx.sh" \
    "${MODELS_DIR}/higgs-audio-v2-tokenizer" \
    "${MODELS_DIR}/higgs-audio-v2/xcodec_decoder.onnx"; then
    echo "✅ xCodec ONNX — done"
else
    echo "⚠️  xCodec ONNX export failed (requires Python + boson_multimodal)"
    echo "   You can run it later: bash scripts/higgs/download_xcodec_onnx.sh"
    FAILED=$((FAILED + 1))
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "📊 Total disk usage:"
du -sh "${MODELS_DIR}" 2>/dev/null || echo "  (could not measure)"

echo ""
if [ "${FAILED}" -eq 0 ]; then
    echo "✅ All models downloaded successfully!"
else
    echo "⚠️  ${FAILED} step(s) failed. See output above for details."
fi

echo ""
echo "Next steps:"
echo "  cd apps/rust-higgs-pipeline && cargo build --release"
echo "  ./target/release/higgs-pipeline-server --model-path ${MODELS_DIR}/higgs-audio-v2"
