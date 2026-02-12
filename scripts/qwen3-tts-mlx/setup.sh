#!/bin/bash
# =============================================================================
# Qwen3-TTS MLX Setup
# =============================================================================
# Downloads the Qwen3-TTS model and installs Python dependencies for
# on-device TTS on Apple Silicon.
#
# Requirements:
#   - macOS with Apple Silicon (M1/M2/M3/M4)
#   - Python 3.11+
#   - ~4GB disk space for model weights
#
# Usage:
#   ./setup.sh              # Full setup (venv + deps + model download)
#   ./setup.sh --deps-only  # Just install Python dependencies
#   ./setup.sh --model-only # Just download model weights
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
MODEL_ID="${QWEN3_TTS_MODEL:-mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[Qwen3-TTS]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[X]${NC} $1"; exit 1; }

# =============================================================================
# PLATFORM CHECK
# =============================================================================

check_platform() {
    if [[ "$(uname)" != "Darwin" ]]; then
        error "MLX requires macOS with Apple Silicon. Use the GPU server (infra/qwen3-omni/deploy.sh) for Linux."
    fi

    if [[ "$(uname -m)" != "arm64" ]]; then
        error "MLX requires Apple Silicon (arm64). Detected: $(uname -m)"
    fi

    # Check Python version
    PYTHON_CMD=""
    for cmd in python3.12 python3.11 python3; do
        if command -v "$cmd" &> /dev/null; then
            version=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
            major=$(echo "$version" | cut -d. -f1)
            minor=$(echo "$version" | cut -d. -f2)
            if [[ "$major" -ge 3 && "$minor" -ge 11 ]]; then
                PYTHON_CMD="$cmd"
                break
            fi
        fi
    done

    if [[ -z "$PYTHON_CMD" ]]; then
        error "Python 3.11+ required. Install: brew install python@3.12"
    fi

    success "Platform OK: macOS arm64, $PYTHON_CMD ($version)"
}

# =============================================================================
# VIRTUAL ENVIRONMENT
# =============================================================================

setup_venv() {
    if [[ -d "$VENV_DIR" ]]; then
        log "Virtual environment exists at $VENV_DIR"
    else
        log "Creating virtual environment..."
        "$PYTHON_CMD" -m venv "$VENV_DIR"
        success "Virtual environment created"
    fi

    # Activate
    source "$VENV_DIR/bin/activate"

    # Upgrade pip
    pip install --quiet --upgrade pip
}

# =============================================================================
# INSTALL DEPENDENCIES
# =============================================================================

install_deps() {
    log "Installing Python dependencies..."
    source "$VENV_DIR/bin/activate"

    pip install --quiet -r "$SCRIPT_DIR/requirements.txt"

    success "Dependencies installed"

    # Verify mlx-audio is available
    python -c "import mlx_audio; print(f'mlx-audio {mlx_audio.__version__} OK')" 2>/dev/null \
        && success "mlx-audio verified" \
        || warn "mlx-audio import check failed (may work at runtime)"
}

# =============================================================================
# DOWNLOAD MODEL
# =============================================================================

download_model() {
    log "Downloading Qwen3-TTS model: $MODEL_ID"
    log "This may take a few minutes (~4GB)..."

    source "$VENV_DIR/bin/activate"

    python -c "
from huggingface_hub import snapshot_download
import os

model_id = '$MODEL_ID'
token = os.environ.get('HF_TOKEN', None)

print(f'Downloading {model_id}...')
path = snapshot_download(
    model_id,
    token=token,
    local_files_only=False,
)
print(f'Model cached at: {path}')
"

    success "Model downloaded: $MODEL_ID"
}

# =============================================================================
# VERIFY SETUP
# =============================================================================

verify() {
    log "Verifying setup..."
    source "$VENV_DIR/bin/activate"

    python -c "
import mlx_audio
import mlx.core as mx
import numpy as np
from fastapi import FastAPI

print(f'  mlx-audio: {mlx_audio.__version__}')
print(f'  MLX device: {mx.default_device()}')
print(f'  NumPy: {np.__version__}')
print(f'  FastAPI: OK')
print()
print('Setup verified! Run ./start.sh to start the server.')
"

    success "Setup complete!"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "  1. Start the server:  ./start.sh"
    echo "  2. In your .env:      TTS_PROVIDER=local"
    echo "  3. Start the agent:   USE_LOCAL_PIPELINE=true pnpm dev"
    echo ""
    echo "  The server runs at http://127.0.0.1:8501 by default."
    echo "  Health check: curl http://127.0.0.1:8501/health"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Qwen3-TTS MLX Setup (Apple Silicon)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo ""

    case "${1:-}" in
        --deps-only)
            check_platform
            setup_venv
            install_deps
            ;;
        --model-only)
            check_platform
            setup_venv
            download_model
            ;;
        *)
            check_platform
            setup_venv
            install_deps
            download_model
            verify
            ;;
    esac
}

main "$@"
