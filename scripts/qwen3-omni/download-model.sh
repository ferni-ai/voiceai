#!/usr/bin/env bash
#
# Download Qwen3-Omni-30B-A3B-Instruct from Hugging Face for Candle/NAPI pipeline.
#
# Size: ~70.5 GB (15 safetensors shards). Needs ~75 GB free disk.
#
# Prerequisites:
#   - huggingface-cli (pip install huggingface-hub[cli])
#   - git-lfs (brew install git-lfs / apt install git-lfs)
#   - HF token for gated repos: https://huggingface.co/settings/tokens
#
# Usage:
#   ./scripts/qwen3-omni/download-model.sh [output_dir]
#   HF_TOKEN=hf_xxx ./scripts/qwen3-omni/download-model.sh
#
# After download, set in .env or shell:
#   OMNI_MODEL_PATH=/path/to/output_dir
#   OMNI_TOKENIZER_PATH=/path/to/output_dir/tokenizer.json
#

set -e

MODEL_ID="Qwen/Qwen3-Omni-30B-A3B-Instruct"
REQUIRED_GB=75
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CHECK_ONLY=false
OUTPUT_ARG=""
for a in "$@"; do
  if [ "$a" = "--check-only" ]; then
    CHECK_ONLY=true
  else
    OUTPUT_ARG="$a"
  fi
done
DEFAULT_OUTPUT="${OUTPUT_ARG:-$REPO_ROOT/models/Qwen3-Omni-30B-A3B-Instruct}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Qwen3-Omni model download ===${NC}"
echo "Model: $MODEL_ID"
echo "Size:  ~70.5 GB (15 shards)"
echo "Output: $DEFAULT_OUTPUT"
echo ""

# -----------------------------------------------------------------------------
# 1. Check disk space
# -----------------------------------------------------------------------------
output_parent="$(dirname "$DEFAULT_OUTPUT")"
output_parent="$(cd "$output_parent" 2>/dev/null && pwd || echo "$DEFAULT_OUTPUT")"
available_kb=$(df -k "$output_parent" 2>/dev/null | tail -1 | awk '{print $4}')
available_gb=$((available_kb / 1024 / 1024))

echo -e "${YELLOW}[1/4] Disk space${NC}"
echo "  Target: $DEFAULT_OUTPUT"
echo "  Available: ${available_gb} GB (need ${REQUIRED_GB} GB)"

if [ "$available_gb" -lt "$REQUIRED_GB" ]; then
  echo -e "  ${RED}Not enough space.${NC}"
  echo ""
  echo "  Free space ideas:"
  echo "    docker system prune -a    # Remove unused images/containers"
  echo "    rm -rf ~/.cache/huggingface/hub/*  # Clear HF cache (if re-downloadable)"
  echo "    du -sh ~/.* 2>/dev/null | sort -hr | head -20  # Find large dirs"
  echo ""
  echo "  Or use another drive: ./scripts/qwen3-omni/download-model.sh /Volumes/LargeDrive/models/Qwen3-Omni"
  echo ""
  if [ "$CHECK_ONLY" = true ]; then
    echo "  Run without --check-only after freeing space, or pass a path on a larger volume."
    exit 0
  fi
  read -p "  Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[yY]$ ]]; then
    exit 1
  fi
else
  echo "  OK"
fi
echo ""

# -----------------------------------------------------------------------------
# 2. Prerequisites
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[2/4] Prerequisites${NC}"

HF_CMD=""
if command -v huggingface-cli &>/dev/null; then
  HF_CMD="huggingface-cli"
elif command -v hf &>/dev/null; then
  HF_CMD="hf"
fi
if [ -z "$HF_CMD" ]; then
  echo -e "  ${RED}huggingface-cli / hf not found.${NC}"
  echo "  Install: pipx install 'huggingface-hub[cli]' or pip install 'huggingface-hub[cli]'"
  exit 1
fi
echo "  ✓ $HF_CMD"

if command -v git-lfs &>/dev/null; then
  git lfs install &>/dev/null || true
  echo "  ✓ git-lfs"
else
  echo -e "  ${YELLOW}git-lfs not found; huggingface-cli may still download LFS files.${NC}"
fi
echo ""

# -----------------------------------------------------------------------------
# 3. Download
# -----------------------------------------------------------------------------
if [ "$CHECK_ONLY" = true ]; then
  echo -e "${YELLOW}[3/4] (check-only) Would run:${NC}"
  echo "  $HF_CMD download $MODEL_ID --local-dir $DEFAULT_OUTPUT --local-dir-use-symlinks False"
  echo ""
  echo "Run without --check-only to download. Need HF_TOKEN for gated repos."
  echo ""
  exit 0
fi

echo -e "${YELLOW}[3/4] Downloading $MODEL_ID ...${NC}"
mkdir -p "$(dirname "$DEFAULT_OUTPUT")"

args=(download "$MODEL_ID" --local-dir "$DEFAULT_OUTPUT")
if [ "$HF_CMD" = "huggingface-cli" ]; then
  args+=(--local-dir-use-symlinks "False")
fi
if [ -n "${HF_TOKEN:-}" ]; then
  args+=(--token "$HF_TOKEN")
  echo "  Using HF_TOKEN"
else
  echo "  Using existing login (hf whoami); set HF_TOKEN for gated repos if needed."
fi

"$HF_CMD" "${args[@]}"
echo ""

# -----------------------------------------------------------------------------
# 4. Tokenizer and env
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[4/4] Tokenizer and env${NC}"

tokenizer_json="$DEFAULT_OUTPUT/tokenizer.json"
if [ -f "$tokenizer_json" ]; then
  echo "  ✓ tokenizer.json found"
else
  echo "  tokenizer.json not in repo; creating from vocab.json + merges.txt..."
  if [ -f "$DEFAULT_OUTPUT/vocab.json" ] && [ -f "$DEFAULT_OUTPUT/merges.txt" ]; then
    (python3 -c "
import sys
from pathlib import Path
from tokenizers import Tokenizer
from tokenizers.models import BPE
p = Path(sys.argv[1])
bpe = BPE.from_file(str(p / 'vocab.json'), str(p / 'merges.txt'))
tokenizer = Tokenizer(bpe)
tokenizer.save(str(p / 'tokenizer.json'))
print('  Created tokenizer.json')
" "$DEFAULT_OUTPUT" 2>/dev/null) || {
      echo -e "  ${YELLOW}Could not create tokenizer.json (install: pip install tokenizers).${NC}"
      echo "  Or export from Python:"
      echo "    from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('$MODEL_ID').save_pretrained('$DEFAULT_OUTPUT')"
    }
  else
    echo -e "  ${YELLOW}vocab.json/merges.txt not found. Export tokenizer from Python:${NC}"
    echo "    from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('$MODEL_ID').save_pretrained('$DEFAULT_OUTPUT')"
  fi
fi
echo ""

echo -e "${GREEN}=== Done ===${NC}"
echo ""
echo "Add to .env or export:"
echo "  OMNI_MODEL_PATH=$DEFAULT_OUTPUT"
echo "  OMNI_TOKENIZER_PATH=$tokenizer_json"
echo ""
echo "Then run E2E:"
echo "  OMNI_MODEL_PATH=$DEFAULT_OUTPUT OMNI_TOKENIZER_PATH=$tokenizer_json ./scripts/qwen3-omni/e2e-validate-omni-pipeline.sh"
echo ""
echo "Or start the Candle server (full E2E):"
echo "  OMNI_MODEL_PATH=$DEFAULT_OUTPUT cargo run --bin qwen3-omni-server --features server --no-default-features -p rust-perf -- --model-path $DEFAULT_OUTPUT"
echo ""
echo "Full E2E runbook: docs/guides/FULL-E2E-QWEN3-OMNI.md"
echo ""