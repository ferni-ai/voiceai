#!/bin/bash
# =============================================================================
# Quick test for Qwen3-TTS MLX server
# =============================================================================
# Tests health check and synthesis endpoints.
#
# Usage:
#   ./test-synthesis.sh                          # Test default server
#   ./test-synthesis.sh http://127.0.0.1:8001    # Test custom URL
# =============================================================================

set -euo pipefail

SERVER_URL="${1:-http://127.0.0.1:8501}"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; }

echo ""
echo -e "${BLUE}Qwen3-TTS MLX Server Tests${NC}"
echo -e "${BLUE}Server: ${SERVER_URL}${NC}"
echo ""

# Test 1: Health check
echo "1. Health check"
health=$(curl -sf "${SERVER_URL}/health" 2>&1) && pass "GET /health → $(echo "$health" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status","?"))' 2>/dev/null || echo "ok")" || fail "GET /health"

# Test 2: Synthesize (ferni)
echo "2. Synthesize (ferni)"
size=$(curl -sf -X POST "${SERVER_URL}/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text": "Hello, how are you today?", "voice_id": "ferni"}' \
    --output /tmp/qwen3-test-ferni.pcm \
    -w '%{size_download}' 2>&1) && {
    if [[ "$size" -gt 0 ]]; then
        pass "POST /synthesize → ${size} bytes PCM"
    else
        fail "POST /synthesize → empty response"
    fi
} || fail "POST /synthesize"

# Test 3: Synthesize (maya)
echo "3. Synthesize (maya)"
size=$(curl -sf -X POST "${SERVER_URL}/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text": "Great job keeping up with your workout!", "voice_id": "maya"}' \
    --output /tmp/qwen3-test-maya.pcm \
    -w '%{size_download}' 2>&1) && {
    if [[ "$size" -gt 0 ]]; then
        pass "POST /synthesize (maya) → ${size} bytes PCM"
    else
        fail "POST /synthesize (maya) → empty response"
    fi
} || fail "POST /synthesize (maya)"

# Test 4: Synthesize with emotion
echo "4. Synthesize with emotion"
size=$(curl -sf -X POST "${SERVER_URL}/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text": "I am so happy for you!", "voice_id": "ferni", "emotion": "happy"}' \
    --output /tmp/qwen3-test-emotion.pcm \
    -w '%{size_download}' 2>&1) && {
    if [[ "$size" -gt 0 ]]; then
        pass "POST /synthesize (emotion=happy) → ${size} bytes PCM"
    else
        fail "POST /synthesize (emotion) → empty response"
    fi
} || fail "POST /synthesize (emotion)"

# Test 5: V1 API (Qwen3TTSClient compatibility)
echo "5. V1 TTS API"
size=$(curl -sf -X POST "${SERVER_URL}/v1/tts/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text": "Testing the V1 API", "persona_id": "ferni"}' \
    --output /tmp/qwen3-test-v1.pcm \
    -w '%{size_download}' 2>&1) && {
    if [[ "$size" -gt 0 ]]; then
        pass "POST /v1/tts/synthesize → ${size} bytes PCM"
    else
        fail "POST /v1/tts/synthesize → empty response"
    fi
} || fail "POST /v1/tts/synthesize"

# Test 6: Voice design
echo "6. Voice design"
result=$(curl -sf -X POST "${SERVER_URL}/v1/voice/design" \
    -H 'Content-Type: application/json' \
    -d '{"persona_id": "test-voice", "description": "Young female, bright and cheerful"}' 2>&1) && pass "POST /v1/voice/design → OK" || fail "POST /v1/voice/design"

# Test 7: Empty text (should return empty)
echo "7. Empty text handling"
size=$(curl -sf -X POST "${SERVER_URL}/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text": "", "voice_id": "ferni"}' \
    --output /tmp/qwen3-test-empty.pcm \
    -w '%{size_download}' 2>&1) && {
    if [[ "$size" -eq 0 ]]; then
        pass "POST /synthesize (empty) → 0 bytes (correct)"
    else
        fail "POST /synthesize (empty) → ${size} bytes (expected 0)"
    fi
} || fail "POST /synthesize (empty)"

echo ""
echo -e "${BLUE}Tests complete.${NC}"
echo "Audio files saved to /tmp/qwen3-test-*.pcm"
echo ""
echo "Play audio with: ffplay -f s16le -ar 24000 -ac 1 /tmp/qwen3-test-ferni.pcm"
