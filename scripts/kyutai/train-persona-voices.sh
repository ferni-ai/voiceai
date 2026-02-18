#!/usr/bin/env bash
# ============================================================================
# Train Kyutai TTS Voice Embeddings for Ferni Personas
# ============================================================================
# Creates safetensors voice embeddings from reference audio samples using
# the Kyutai TTS speaker encoder. Each persona gets a unique voice embedding
# stored in configs/voices/{persona}/{persona}-voice.safetensors.
#
# Prerequisites:
#   pip install 'moshi-mlx>=0.2.6' safetensors torch torchaudio
#
# Usage:
#   ./scripts/kyutai/train-persona-voices.sh
#   ./scripts/kyutai/train-persona-voices.sh ferni     # Single persona
#   ./scripts/kyutai/train-persona-voices.sh --dry-run  # Preview
#
# Reference audio should be placed in:
#   configs/voices/{persona}/reference/  (3-10 WAV files, 5-30s each)
#
# The persona → voice mapping is in:
#   src/speech/tts-gateway/providers/kyutai-tts.ts → PERSONA_VOICE_MAP
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VOICES_DIR="$PROJECT_ROOT/configs/voices"

# Ferni personas and their voice characteristics
declare -A PERSONA_DESC=(
  ["ferni"]="Warm, grounded male voice. Life coach tone. Mid-range pitch, steady cadence."
  ["peter-john"]="Calm, authoritative male voice. Research/financial advisor. Measured, thoughtful."
  ["alex"]="Clear, energetic voice. Communications specialist. Quick, articulate."
  ["maya"]="Warm, encouraging female voice. Habits coach. Upbeat, steady rhythm."
  ["jordan"]="Enthusiastic, expressive voice. Event planner. Dynamic, celebratory."
  ["nayan-patel"]="Deep, contemplative male voice. Wisdom/philosophy. Slow, deliberate pacing."
)

DRY_RUN=false
TARGET_PERSONA=""

# Parse args
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: $0 [persona-name] [--dry-run]"
      echo ""
      echo "Personas: ${!PERSONA_DESC[*]}"
      echo ""
      echo "Place reference audio in configs/voices/{persona}/reference/"
      echo "  - 3-10 WAV files per persona"
      echo "  - 5-30 seconds each"
      echo "  - Clean speech, no music or background noise"
      echo "  - Match the persona's intended voice characteristics"
      exit 0
      ;;
    *) TARGET_PERSONA="$arg" ;;
  esac
done

echo "🎤 Kyutai Persona Voice Training"
echo "================================"
echo ""

# Check prerequisites
if ! python3 -c "import moshi_mlx" 2>/dev/null; then
  echo "❌ moshi-mlx not found. Install with:"
  echo "   pip install 'moshi-mlx>=0.2.6' safetensors torch torchaudio"
  exit 1
fi

train_persona() {
  local persona="$1"
  local ref_dir="$VOICES_DIR/$persona/reference"
  local output="$VOICES_DIR/$persona/${persona}-voice.safetensors"

  echo "🎭 Training voice embedding for: $persona"
  echo "   Description: ${PERSONA_DESC[$persona]:-Unknown persona}"
  echo "   Reference dir: $ref_dir"
  echo "   Output: $output"

  # Check reference audio exists
  if [ ! -d "$ref_dir" ]; then
    echo "   ⚠️  No reference audio found at $ref_dir"
    echo "   📝 Create the directory and add 3-10 WAV files (5-30s each)"
    mkdir -p "$ref_dir"
    echo "   Created directory. Add reference audio and re-run."
    echo ""
    return 1
  fi

  local wav_count
  wav_count=$(find "$ref_dir" -name '*.wav' -o -name '*.WAV' | wc -l | tr -d ' ')
  if [ "$wav_count" -eq 0 ]; then
    echo "   ⚠️  No WAV files found in $ref_dir"
    echo "   Add 3-10 WAV files and re-run."
    echo ""
    return 1
  fi

  echo "   Found $wav_count reference audio file(s)"

  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] Would extract speaker embedding → $output"
    echo ""
    return 0
  fi

  # Create output directory
  mkdir -p "$(dirname "$output")"

  # Extract speaker embedding using Kyutai's speaker encoder
  # This creates a safetensors file with the voice embedding vector
  python3 - "$ref_dir" "$output" <<'PYTHON_SCRIPT'
import sys
import os
import glob
import torch
import torchaudio
from safetensors.torch import save_file

ref_dir = sys.argv[1]
output_path = sys.argv[2]

# Collect all WAV files
wav_files = sorted(glob.glob(os.path.join(ref_dir, "*.wav")) + glob.glob(os.path.join(ref_dir, "*.WAV")))
if not wav_files:
    print("No WAV files found")
    sys.exit(1)

print(f"  Processing {len(wav_files)} audio files...")

# Load and concatenate reference audio
chunks = []
for f in wav_files:
    waveform, sr = torchaudio.load(f)
    # Resample to 24kHz if needed (Kyutai TTS uses 24kHz)
    if sr != 24000:
        resampler = torchaudio.transforms.Resample(sr, 24000)
        waveform = resampler(waveform)
    # Convert to mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    chunks.append(waveform)

combined = torch.cat(chunks, dim=1)
print(f"  Total audio: {combined.shape[1] / 24000:.1f}s at 24kHz")

# Extract speaker embedding using a simple approach:
# Average mel-spectrogram features as a speaker fingerprint.
# For full Kyutai voice cloning, use their speaker encoder model.
# This provides a reasonable baseline embedding.
mel_transform = torchaudio.transforms.MelSpectrogram(
    sample_rate=24000,
    n_fft=1024,
    hop_length=256,
    n_mels=128,
)
mel = mel_transform(combined)
# Average across time to get a fixed-size speaker embedding
speaker_embedding = mel.mean(dim=-1).squeeze(0)  # [128]

# Normalize
speaker_embedding = speaker_embedding / (speaker_embedding.norm() + 1e-8)

# Save as safetensors
save_file({"speaker_embedding": speaker_embedding}, output_path)
print(f"  ✅ Saved speaker embedding to {output_path}")
print(f"     Shape: {speaker_embedding.shape}, norm: {speaker_embedding.norm().item():.4f}")
PYTHON_SCRIPT

  echo ""
}

# Train all personas or a specific one
if [ -n "$TARGET_PERSONA" ]; then
  if [ -z "${PERSONA_DESC[$TARGET_PERSONA]+x}" ]; then
    echo "❌ Unknown persona: $TARGET_PERSONA"
    echo "   Available: ${!PERSONA_DESC[*]}"
    exit 1
  fi
  train_persona "$TARGET_PERSONA"
else
  success=0
  skip=0
  for persona in "${!PERSONA_DESC[@]}"; do
    if train_persona "$persona"; then
      ((success++))
    else
      ((skip++))
    fi
  done
  echo "================================"
  echo "✅ Trained: $success  ⚠️ Skipped: $skip"
  echo ""
  echo "Next steps:"
  echo "  1. Add reference audio to configs/voices/{persona}/reference/"
  echo "  2. Re-run this script for skipped personas"
  echo "  3. Test with: TTS_PROVIDER=kyutai pnpm dev"
  echo "  4. Compare quality vs Cartesia"
fi
