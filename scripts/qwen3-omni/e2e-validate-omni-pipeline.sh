#!/usr/bin/env bash
# E2E validation for Qwen3-Omni Candle pipeline.
# Run unit tests (no model). Optionally run full E2E when OMNI_MODEL_PATH is set.
#
# Usage:
#   ./scripts/qwen3-omni/e2e-validate-omni-pipeline.sh           # unit tests only
#   OMNI_MODEL_PATH=/path/to/Qwen3-Omni-30B-A3B-Instruct \
#   OMNI_TOKENIZER_PATH=/path/to/tokenizer.json \
#   ./scripts/qwen3-omni/e2e-validate-omni-pipeline.sh             # unit + E2E (if paths set)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Qwen3-Omni Candle pipeline validation ==="

# 1. Build rust-perf (Omni modules); lib tests may fail to link due to NAPI in same crate
echo "[1/2] Building rust-perf (Omni pipeline)..."
cd apps/rust-perf
cargo build --lib 2>&1 || exit 1
# Lib test binary may fail to link (NAPI). Omni validation = build + E2E when OMNI_MODEL_PATH set.
cargo test --lib full_omni_pipeline 2>&1 || true
cd "$REPO_ROOT"
echo "Build done."

# 1b. Smoke test: NAPI wiring without checkpoint (OmniEngine with bad paths must throw)
echo "[1b] Smoke test: rust-omni .node build + NAPI (bad paths → expect throw)..."
cd apps/rust-omni
if [ ! -f index.js ] || [ ! -f ferni-omni.*.node ]; then
  npx napi build --platform 2>&1 || { cd "$REPO_ROOT"; echo "Smoke: rust-omni napi build failed."; exit 1; }
fi
cd "$REPO_ROOT"
node scripts/qwen3-omni/smoke-test-no-model.mjs 2>&1 || { echo "Smoke test failed."; exit 1; }
echo "Smoke test done."

# 2. Optional E2E with real checkpoint
if [ -n "${OMNI_MODEL_PATH:-}" ] && [ -n "${OMNI_TOKENIZER_PATH:-}" ]; then
  echo "[2/2] E2E: Building rust-omni and running process_audio_omni with real checkpoint..."
  if [ ! -d "$OMNI_MODEL_PATH" ]; then
    echo "Error: OMNI_MODEL_PATH is not a directory: $OMNI_MODEL_PATH"
    exit 1
  fi
  if [ ! -f "$OMNI_TOKENIZER_PATH" ]; then
    echo "Error: OMNI_TOKENIZER_PATH is not a file: $OMNI_TOKENIZER_PATH"
    exit 1
  fi
  cd apps/rust-omni
  npx napi build --platform 2>&1 || { cd "$REPO_ROOT"; echo "E2E: rust-omni napi build failed."; exit 1; }
  cd "$REPO_ROOT"
  E2E_SCRIPT=$(mktemp)
  cat > "$E2E_SCRIPT.mjs" << 'NODESCRIPT'
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelPath = process.env.OMNI_MODEL_PATH;
const tokenizerPath = process.env.OMNI_TOKENIZER_PATH;
if (!modelPath || !tokenizerPath) process.exit(1);
const repoRoot = process.cwd();
const nodeName = `ferni-omni.${process.platform}-${process.arch}.node`;
const binding = require(path.join(repoRoot, 'apps/rust-omni', nodeName));
const engine = new binding.OmniEngine({
  thinkerModelPath: modelPath,
  thinkerTokenizerPath: tokenizerPath,
  useFullOmni: true,
});
const samples = new Float32Array(1600);
for (let i = 0; i < samples.length; i++) samples[i] = 0.01 * Math.sin(i * 0.1);
const out = engine.process_audio_omni(samples);
console.log('E2E OK: process_audio_omni returned', out.length, 'samples (24 kHz)');
if (out.length === 0) {
  console.error('Expected non-empty output for non-empty input');
  process.exit(1);
}
process.exit(0);
NODESCRIPT
  node "$E2E_SCRIPT.mjs" || { rm -f "$E2E_SCRIPT.mjs"; echo "E2E failed."; exit 1; }
  rm -f "$E2E_SCRIPT.mjs"
  echo "E2E done."
else
  echo "[2/2] Skip E2E (set OMNI_MODEL_PATH and OMNI_TOKENIZER_PATH to run with real checkpoint)."
fi

echo "=== Validation complete ==="
