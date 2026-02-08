#!/usr/bin/env bash
#
# Download and prepare emotional speech datasets for Qwen3-TTS fine-tuning.
#
# Datasets:
#   - RAVDESS: Zenodo 1188976 (7,356 files, 8 emotions, 2 intensities)
#   - NonverbalTTS: HuggingFace deepvk/NonverbalTTS (17h, nonverbal + emotions)
#   - EmoV-DB: OpenSLR 115 (5 emotions, 4 speakers)
#
# Optional: Cartesia-generated persona samples (run clone-voices.ts, place refs in data/ref/)
#
# Usage:
#   ./scripts/qwen3-omni/prepare-tts-data.sh [--ravdess-only] [--skip-ravdess]
#   Or from repo root: bash scripts/qwen3-omni/prepare-tts-data.sh
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
RAVDESS_DIR="$DATA_DIR/ravdess"
NONVERBAL_DIR="$DATA_DIR/NonverbalTTS"
EMOV_DIR="$DATA_DIR/EmoV-DB"
REF_DIR="$DATA_DIR/ref"

SKIP_RAVDESS=false
RAVDESS_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --skip-ravdess) SKIP_RAVDESS=true ;;
    --ravdess-only) RAVDESS_ONLY=true ;;
  esac
done

mkdir -p "$DATA_DIR" "$REF_DIR"

# ---------------------------------------------------------------------------
# RAVDESS (Zenodo 1188976)
# ---------------------------------------------------------------------------
if [[ "$SKIP_RAVDESS" != "true" ]]; then
  echo "=== RAVDESS (Zenodo 1188976) ==="
  mkdir -p "$RAVDESS_DIR"
  if command -v jq &>/dev/null; then
    # Fetch file list from Zenodo API and download first archive if present
    RECORD_JSON=$(curl -sL "https://zenodo.org/api/records/1188976")
    if [[ -n "$RECORD_JSON" ]]; then
      DOWNLOAD_URL=$(echo "$RECORD_JSON" | jq -r '.files[0].links.self // empty')
      if [[ -n "$DOWNLOAD_URL" ]]; then
        echo "Downloading RAVDESS from Zenodo..."
        curl -sL -o "$RAVDESS_DIR/ravdess.zip" "$DOWNLOAD_URL" || true
        if [[ -f "$RAVDESS_DIR/ravdess.zip" ]]; then
          (cd "$RAVDESS_DIR" && unzip -o -q ravdess.zip 2>/dev/null || true)
        fi
      fi
    fi
  fi
  if [[ ! -d "$RAVDESS_DIR/Audio_Speech_Actors_01-24" && ! -d "$RAVDESS_DIR"/*/ ]]; then
    echo "RAVDESS: Download manually from https://zenodo.org/records/1188976 and extract to $RAVDESS_DIR"
  else
    echo "RAVDESS: $RAVDESS_DIR ready"
  fi
fi

[[ "$RAVDESS_ONLY" == "true" ]] && exit 0

# ---------------------------------------------------------------------------
# NonverbalTTS (HuggingFace)
# ---------------------------------------------------------------------------
echo "=== NonverbalTTS (HuggingFace deepvk/NonverbalTTS) ==="
mkdir -p "$NONVERBAL_DIR"
if command -v huggingface-cli &>/dev/null; then
  huggingface-cli download deepvk/NonverbalTTS --repo-type dataset --local-dir "$NONVERBAL_DIR" --local-dir-use-symlinks False || true
else
  echo "Install: pip install huggingface_hub[cli]"
  echo "Then: huggingface-cli download deepvk/NonverbalTTS --repo-type dataset --local-dir $NONVERBAL_DIR"
fi
if [[ -d "$NONVERBAL_DIR" && "$(ls -A $NONVERBAL_DIR 2>/dev/null)" ]]; then
  echo "NonverbalTTS: $NONVERBAL_DIR ready"
fi

# ---------------------------------------------------------------------------
# EmoV-DB (OpenSLR 115)
# ---------------------------------------------------------------------------
echo "=== EmoV-DB (OpenSLR 115) ==="
mkdir -p "$EMOV_DIR"
# OpenSLR 115 uses .tar.gz format. Josh only has amused/neutral/sleepy.
EMOV_NAMES=(
  bea_amused bea_angry bea_disgusted bea_neutral bea_sleepy
  jenie_amused jenie_angry jenie_disgusted jenie_neutral jenie_sleepy
  sam_amused sam_angry sam_disgusted sam_neutral sam_sleepy
  josh_amused josh_neutral josh_sleepy
)
EMOV_DL_COUNT=0
for name in "${EMOV_NAMES[@]}"; do
  dest="$EMOV_DIR/${name}.tar.gz"
  [[ -f "$dest" ]] && { echo "  $name already downloaded"; EMOV_DL_COUNT=$((EMOV_DL_COUNT+1)); continue; }
  url="https://www.openslr.org/resources/115/${name}.tar.gz"
  HTTP_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "Downloading $name..."
    curl -sL -o "$dest" "$url" && EMOV_DL_COUNT=$((EMOV_DL_COUNT+1)) || true
  else
    echo "  $name not found (HTTP $HTTP_CODE), skipping"
  fi
done
echo "EmoV-DB: downloaded $EMOV_DL_COUNT archives"
# Extract all downloaded archives
for f in "$EMOV_DIR"/*.tar.gz; do
  [[ -f "$f" ]] && (cd "$EMOV_DIR" && tar -xzf "$f" 2>/dev/null || true)
done
if [[ ! -d "$EMOV_DIR"/*/ ]]; then
  echo "EmoV-DB: If downloads failed, get files from https://www.openslr.org/115/ and extract to $EMOV_DIR"
else
  echo "EmoV-DB: $EMOV_DIR ready"
fi

# ---------------------------------------------------------------------------
# Reference audio (Cartesia / clone-voices)
# ---------------------------------------------------------------------------
echo "=== Reference audio ==="
echo "For persona-specific fine-tuning, add 3–10s reference WAVs to $REF_DIR (e.g. ferni_ref.wav)."
echo "Optional: npx tsx scripts/qwen3-omni/clone-voices.ts then copy generated refs to $REF_DIR"

echo "Done. Next: run format-tts-data.py to produce train_raw.jsonl"
