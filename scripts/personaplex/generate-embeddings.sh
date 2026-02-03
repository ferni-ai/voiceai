#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# PersonaPlex Voice Embedding Generator
# ═══════════════════════════════════════════════════════════════════════════════
#
# This script generates PersonaPlex voice embeddings (.pt files) from WAV samples.
# Run this on a machine with:
#   - NVIDIA GPU
#   - PersonaPlex installed (pip install moshi/.)
#   - HuggingFace token with PersonaPlex model access
#
# Usage:
#   ./scripts/personaplex/generate-embeddings.sh
#   ./scripts/personaplex/generate-embeddings.sh --persona ferni
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SAMPLES_DIR="$PROJECT_ROOT/voice-embeddings/samples"
OUTPUT_DIR="$PROJECT_ROOT/voice-embeddings"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PersonaPlex Voice Embedding Generator                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for HuggingFace token
if [ -z "$HF_TOKEN" ]; then
    echo -e "${RED}❌ Error: HF_TOKEN environment variable is required${NC}"
    echo ""
    echo "Set it with:"
    echo "  export HF_TOKEN=your-huggingface-token"
    echo ""
    echo "Get your token from: https://huggingface.co/settings/tokens"
    echo "Accept the PersonaPlex license: https://huggingface.co/nvidia/personaplex-7b-v1"
    exit 1
fi

# Check for samples directory
if [ ! -d "$SAMPLES_DIR" ]; then
    echo -e "${RED}❌ Error: Samples directory not found: $SAMPLES_DIR${NC}"
    echo ""
    echo "Generate voice samples first:"
    echo "  pnpm tsx scripts/personaplex/generate-voice-samples.ts"
    exit 1
fi

# Check for silence sample
if [ ! -f "$SAMPLES_DIR/silence-10s.wav" ]; then
    echo -e "${RED}❌ Error: Silence sample not found: $SAMPLES_DIR/silence-10s.wav${NC}"
    echo ""
    echo "Generate voice samples first (includes silence):"
    echo "  pnpm tsx scripts/personaplex/generate-voice-samples.ts"
    exit 1
fi

# Check for Python and PersonaPlex
if ! python -c "import moshi" 2>/dev/null; then
    echo -e "${RED}❌ Error: PersonaPlex (moshi) not installed${NC}"
    echo ""
    echo "Install PersonaPlex:"
    echo "  git clone https://github.com/NVIDIA/personaplex"
    echo "  cd personaplex"
    echo "  pip install moshi/."
    exit 1
fi

# Parse arguments
PERSONA_FILTER=""
if [[ "$1" == "--persona" && -n "$2" ]]; then
    PERSONA_FILTER="$2"
    echo -e "${YELLOW}🎯 Filtering to persona: $PERSONA_FILTER${NC}"
fi

# List of personas to process
PERSONAS=("ferni" "maya" "alex" "peter" "jordan" "nayan")

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Process each persona
SUCCESSFUL=0
FAILED=0

for PERSONA in "${PERSONAS[@]}"; do
    # Skip if filtering and doesn't match
    if [[ -n "$PERSONA_FILTER" && "$PERSONA" != "$PERSONA_FILTER" ]]; then
        continue
    fi

    SAMPLE_FILE="$SAMPLES_DIR/${PERSONA}.wav"
    OUTPUT_FILE="$OUTPUT_DIR/${PERSONA}.pt"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}🎙️  Processing: $PERSONA${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    # Check if sample exists
    if [ ! -f "$SAMPLE_FILE" ]; then
        echo -e "${YELLOW}⚠️  Sample not found: $SAMPLE_FILE (skipping)${NC}"
        ((FAILED++))
        continue
    fi

    echo "  Input:  $SAMPLE_FILE"
    echo "  Output: $OUTPUT_FILE"

    # Run PersonaPlex offline mode with save_voice_prompt_embeddings
    # This creates a .pt file alongside the input WAV
    echo "  Running PersonaPlex..."

    if HF_TOKEN="$HF_TOKEN" python -m moshi.offline \
        --voice-prompt "$SAMPLE_FILE" \
        --text-prompt "Hello, this is a voice sample." \
        --input-wav "$SAMPLES_DIR/silence-10s.wav" \
        --output-wav "/dev/null" \
        --save-voice-prompt-embeddings 2>&1 | head -20; then

        # The embedding is saved alongside the input file
        GENERATED_PT="${SAMPLE_FILE%.wav}.pt"

        if [ -f "$GENERATED_PT" ]; then
            # Move to output directory
            mv "$GENERATED_PT" "$OUTPUT_FILE"
            echo -e "${GREEN}  ✅ Generated: $OUTPUT_FILE${NC}"
            ((SUCCESSFUL++))
        else
            echo -e "${RED}  ❌ Embedding file not created${NC}"
            ((FAILED++))
        fi
    else
        echo -e "${RED}  ❌ PersonaPlex command failed${NC}"
        ((FAILED++))
    fi
done

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✅ Successful: $SUCCESSFUL${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}❌ Failed: $FAILED${NC}"
fi
echo ""

# List generated embeddings
echo "Generated embeddings:"
ls -la "$OUTPUT_DIR"/*.pt 2>/dev/null || echo "  (none)"

if [ $SUCCESSFUL -gt 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Voice embeddings ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Set environment variable:"
    echo "     export PERSONAPLEX_VOICE_DIR=$OUTPUT_DIR"
    echo ""
    echo "  2. Start PersonaPlex server:"
    echo "     python -m moshi.server --voice-prompt-dir $OUTPUT_DIR"
    echo ""
    echo "  3. Enable PersonaPlex in Ferni:"
    echo "     export USE_PERSONAPLEX=true"
fi
