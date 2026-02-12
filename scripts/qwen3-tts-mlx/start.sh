#!/bin/bash
# =============================================================================
# Start Qwen3-TTS MLX Server
# =============================================================================
# Starts the local TTS server for on-device voice synthesis.
#
# Usage:
#   ./start.sh                    # Start on default port 8501
#   ./start.sh --port 8001        # Custom port
#   ./start.sh --background       # Run in background (logs to file)
#
# Stop:
#   ./start.sh --stop             # Kill background server
#
# Environment:
#   QWEN3_TTS_PORT=8501           # Server port
#   QWEN3_TTS_MODEL=...           # HuggingFace model ID
#   LOCAL_TTS_URL=http://...      # Used by the Node.js agent (auto-set)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
PID_FILE="${SCRIPT_DIR}/.server.pid"
LOG_FILE="${SCRIPT_DIR}/.server.log"
PORT="${QWEN3_TTS_PORT:-8501}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[Qwen3-TTS]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# =============================================================================
# STOP
# =============================================================================

stop_server() {
    if [[ -f "$PID_FILE" ]]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping server (PID: $pid)..."
            kill "$pid"
            rm -f "$PID_FILE"
            success "Server stopped"
        else
            rm -f "$PID_FILE"
            warn "PID file exists but process not running"
        fi
    else
        warn "No PID file found. Checking for running servers..."
        pids=$(lsof -ti ":$PORT" 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            log "Found process on port $PORT: $pids"
            kill $pids 2>/dev/null || true
            success "Killed process on port $PORT"
        else
            log "No server running on port $PORT"
        fi
    fi
    exit 0
}

# =============================================================================
# HEALTH CHECK
# =============================================================================

wait_for_health() {
    local max_wait=120
    local waited=0

    log "Waiting for server to be ready (model loading may take 10-30s)..."

    while [[ $waited -lt $max_wait ]]; do
        if curl -sf "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
        if (( waited % 10 == 0 )); then
            log "Still loading... (${waited}s)"
        fi
    done

    return 1
}

# =============================================================================
# START
# =============================================================================

start_server() {
    local background=false
    local extra_args=()

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --stop)
                stop_server
                ;;
            --background|-b)
                background=true
                shift
                ;;
            --port)
                PORT="$2"
                shift 2
                ;;
            *)
                extra_args+=("$1")
                shift
                ;;
        esac
    done

    # Check venv
    if [[ ! -d "$VENV_DIR" ]]; then
        echo -e "${RED}[X]${NC} Virtual environment not found. Run ./setup.sh first."
        exit 1
    fi

    # Check if already running
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        warn "Server already running (PID: $(cat "$PID_FILE"))"
        warn "Use --stop to stop it first, or hit the health endpoint:"
        echo "  curl http://127.0.0.1:${PORT}/health"
        exit 0
    fi

    # Activate venv
    source "$VENV_DIR/bin/activate"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Qwen3-TTS MLX Server${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "  Port:    ${GREEN}${PORT}${NC}"
    echo -e "  Model:   ${GREEN}${QWEN3_TTS_MODEL:-mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16}${NC}"
    echo -e "  Backend: ${GREEN}MLX (Apple Silicon)${NC}"
    echo ""

    if $background; then
        log "Starting in background (logs: $LOG_FILE)"

        nohup python "$SCRIPT_DIR/server.py" \
            --port "$PORT" \
            "${extra_args[@]}" \
            > "$LOG_FILE" 2>&1 &

        echo $! > "$PID_FILE"
        log "Server PID: $(cat "$PID_FILE")"

        if wait_for_health; then
            success "Server ready at http://127.0.0.1:${PORT}"
            echo ""
            echo "  Health:     curl http://127.0.0.1:${PORT}/health"
            echo "  Synthesize: curl -X POST http://127.0.0.1:${PORT}/synthesize \\"
            echo "                -H 'Content-Type: application/json' \\"
            echo "                -d '{\"text\": \"Hello world\", \"voice_id\": \"ferni\"}' \\"
            echo "                --output test.pcm"
            echo "  Stop:       ./start.sh --stop"
            echo "  Logs:       tail -f $LOG_FILE"
            echo ""
            echo -e "  Set in .env: ${GREEN}TTS_PROVIDER=local${NC}"
            echo -e "               ${GREEN}LOCAL_TTS_URL=http://127.0.0.1:${PORT}${NC}"
        else
            warn "Server started but health check timed out."
            warn "Check logs: tail -f $LOG_FILE"
        fi
    else
        log "Starting in foreground (Ctrl+C to stop)"
        echo ""

        # Export for the Node.js agent to discover
        export LOCAL_TTS_URL="http://127.0.0.1:${PORT}"

        exec python "$SCRIPT_DIR/server.py" \
            --port "$PORT" \
            "${extra_args[@]}"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

# Handle --stop before anything else
if [[ "${1:-}" == "--stop" ]]; then
    stop_server
fi

start_server "$@"
