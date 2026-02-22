#!/usr/bin/env bash
# Try Higgs pipeline STT (Parakeet or Whisper in Rust).
#
# 1. Start the Higgs pipeline with STT models (see apps/rust-higgs-pipeline/README.md):
#      STREAM_CHUNK_STEPS=12 ./target/release/higgs-voice-pipeline --port 8600 \
#        --higgs-model ./models/higgs-audio-v2 --xcodec-model ./models/xcodec \
#        --parakeet-model ./models/parakeet-tdt --parakeet-eou-model ./models/parakeet-eou
#    Or with Whisper only:
#      cargo run --release --no-default-features --features "whisper-fallback" -- \
#        --port 8600 --higgs-model ./models/higgs-audio-v2 --xcodec-model ./models/xcodec \
#        --whisper-model ./models/whisper-base.bin
#
# 2. From repo root, run the voice agent with Higgs STT enabled:
#      ./scripts/higgs/try-higgs-stt.sh
#    Or export and run manually:
#      export TTS_PROVIDER=higgs-pipeline
#      export HIGGS_PIPELINE_URL=ws://localhost:8600/ws
#      export USE_HIGGS_STT=true
#      pnpm dev
#
# You should see "[voice-agent-entry] 🎯 Higgs STT enabled" and transcripts from the pipeline.
#
# For full local e2e (Higgs STT + Ollama LLM, no Gemini): ./scripts/higgs/start-higgs-e2e.sh

set -e
cd "$(dirname "$0")/../.."
export TTS_PROVIDER=higgs-pipeline
export HIGGS_PIPELINE_URL="${HIGGS_PIPELINE_URL:-ws://localhost:8600/ws}"
export USE_HIGGS_STT=true
echo "TTS_PROVIDER=$TTS_PROVIDER HIGGS_PIPELINE_URL=$HIGGS_PIPELINE_URL USE_HIGGS_STT=$USE_HIGGS_STT"
exec pnpm dev
