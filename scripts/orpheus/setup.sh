#!/usr/bin/env bash
# Setup script for Orpheus TTS — downloads models and exports SNAC ONNX.
#
# This script:
#   1. Downloads the Orpheus 3B GGUF model (Q4_K_M quantization, ~1.8GB)
#   2. Exports SNAC 24kHz decoder to ONNX via Python
#   3. Verifies everything is ready
#
# Usage:
#   cd apps/rust-orpheus-tts
#   bash ../../scripts/orpheus/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../apps/rust-orpheus-tts" && pwd)"
MODELS_DIR="$PROJECT_DIR/models"

GGUF_MODEL="orpheus-3b-0.1-ft-q4_k_m.gguf"
GGUF_URL="https://huggingface.co/QuantFactory/orpheus-3b-0.1-ft-GGUF/resolve/main/orpheus-3b-0.1-ft.Q4_K_M.gguf"
SNAC_ONNX="snac_24khz_decoder.onnx"

echo "═══════════════════════════════════════════════════════"
echo "  Orpheus TTS Setup"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Project dir: $PROJECT_DIR"
echo "Models dir:  $MODELS_DIR"
echo ""

mkdir -p "$MODELS_DIR"

# ── Step 1: Download Orpheus GGUF ─────────────────────────

if [ -f "$MODELS_DIR/$GGUF_MODEL" ]; then
    echo "✅ GGUF model already exists: $GGUF_MODEL"
    ls -lh "$MODELS_DIR/$GGUF_MODEL"
else
    echo "📥 Downloading Orpheus 3B GGUF (Q4_K_M, ~1.8GB)..."
    echo "   URL: $GGUF_URL"
    echo ""

    if command -v wget &>/dev/null; then
        wget -O "$MODELS_DIR/$GGUF_MODEL" "$GGUF_URL"
    elif command -v curl &>/dev/null; then
        curl -L -o "$MODELS_DIR/$GGUF_MODEL" "$GGUF_URL"
    else
        echo "❌ Neither wget nor curl found. Please install one."
        exit 1
    fi

    echo "✅ Downloaded: $MODELS_DIR/$GGUF_MODEL"
    ls -lh "$MODELS_DIR/$GGUF_MODEL"
fi
echo ""

# ── Step 2: Export SNAC ONNX ──────────────────────────────

if [ -f "$MODELS_DIR/$SNAC_ONNX" ]; then
    echo "✅ SNAC ONNX already exists: $SNAC_ONNX"
    ls -lh "$MODELS_DIR/$SNAC_ONNX"
else
    echo "🔧 Exporting SNAC 24kHz decoder to ONNX..."
    echo "   Installing Python dependencies..."

    pip install --quiet snac torch onnx onnxruntime 2>/dev/null || {
        echo ""
        echo "⚠️  pip install failed. Try in a venv:"
        echo "   python3 -m venv .venv && source .venv/bin/activate"
        echo "   pip install snac torch onnx onnxruntime"
        echo "   python $SCRIPT_DIR/export_snac_onnx.py --output $MODELS_DIR/$SNAC_ONNX"
        exit 1
    }

    python3 "$SCRIPT_DIR/export_snac_onnx.py" --output "$MODELS_DIR/$SNAC_ONNX"

    echo "✅ Exported: $MODELS_DIR/$SNAC_ONNX"
    ls -lh "$MODELS_DIR/$SNAC_ONNX"
fi
echo ""

# ── Step 3: Check llama-server ────────────────────────────

echo "── Checking llama-server ──"
if command -v llama-server &>/dev/null; then
    echo "✅ llama-server found: $(which llama-server)"
elif command -v llama.cpp/llama-server &>/dev/null; then
    echo "✅ llama-server found (llama.cpp dir)"
elif [ -f "/opt/homebrew/bin/llama-server" ]; then
    echo "✅ llama-server found: /opt/homebrew/bin/llama-server"
else
    echo "⚠️  llama-server not found. Install with:"
    echo "   brew install llama.cpp"
    echo "   # OR build from source:"
    echo "   git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp"
    echo "   cmake -B build -DGGML_METAL=ON && cmake --build build --config Release"
fi
echo ""

# ── Summary ───────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
echo "  Setup Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "To run Orpheus TTS:"
echo ""
echo "  # Terminal 1: Start llama-server"
echo "  llama-server -m $MODELS_DIR/$GGUF_MODEL \\"
echo "    -c 8192 --port 8502 -ngl 99 --flash-attn"
echo ""
echo "  # Terminal 2: Start Orpheus TTS server"
echo "  cd $PROJECT_DIR"
echo "  cargo run --release -- --port 8501 --snac-model models/$SNAC_ONNX"
echo ""
echo "  # Test:"
echo "  curl -X POST http://localhost:8501/v1/audio/speech \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"input\": \"Hello there!\", \"voice\": \"tara\"}' \\"
echo "    --output test.wav && afplay test.wav"
echo ""
