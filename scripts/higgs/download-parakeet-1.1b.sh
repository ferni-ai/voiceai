#!/usr/bin/env bash
# Download Parakeet TDT 1.1B ONNX from Hugging Face to apps/rust-higgs-pipeline/models/parakeet-tdt-1.1b.
# Run from repo root. Requires: huggingface-cli (pip install huggingface_hub) or git + git-lfs.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
OUT_DIR="${1:-apps/rust-higgs-pipeline/models/parakeet-tdt-1.1b}"
HF_REPO="dtgagnon/parakeet-tdt-1.1b-onnx"

mkdir -p "$(dirname "$OUT_DIR")"

if command -v huggingface-cli &>/dev/null; then
  echo "Downloading $HF_REPO with huggingface-cli to $OUT_DIR ..."
  huggingface-cli download "$HF_REPO" --local-dir "$OUT_DIR" --local-dir-use-symlinks false
  echo "Done. Use: --parakeet-model $OUT_DIR"
elif command -v git &>/dev/null && git lfs version &>/dev/null; then
  echo "Downloading $HF_REPO with git clone (LFS) to $OUT_DIR ..."
  rm -rf "$OUT_DIR"
  git clone "https://huggingface.co/$HF_REPO" "$OUT_DIR"
  echo "Done. Use: --parakeet-model $OUT_DIR"
else
  echo "Install huggingface-cli (pip install huggingface_hub) or git + git-lfs, then re-run."
  echo "  pip install huggingface_hub && huggingface-cli download $HF_REPO --local-dir $OUT_DIR"
  exit 1
fi
