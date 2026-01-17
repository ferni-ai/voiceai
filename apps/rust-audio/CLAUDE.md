# Rust Audio DSP (@ferni/audio)

Zero-allocation real-time audio processing library for the Ferni voice agent, written in Rust with NAPI-RS bindings.

## Purpose

High-performance audio processing that cannot be done efficiently in JavaScript:
- **YIN Pitch Detection** - O(n) algorithm (~40x faster than JS autocorrelation)
- **Pre-STT Audio Enhancement** - AGC, noise suppression, bandwidth extension
- **Post-TTS Processing** - Humanization, compression, de-esser
- **SIMD-Optimized DSP** - FFT, energy, ZCR, statistics
- **Zero-Allocation Streaming** - Ring buffers prevent allocations in hot path

## Key Files

```
apps/rust-audio/
├── Cargo.toml              # Rust dependencies
├── build.rs                # NAPI build script
├── package.json            # NPM package config
└── src/
    ├── lib.rs              # Main library, NAPI exports
    ├── audio_processor.rs  # Core audio pipeline
    ├── buffer_pool.rs      # Zero-allocation buffer management
    ├── feature_extraction.rs # Audio feature extraction (autocorrelation)
    ├── fft.rs              # SIMD-optimized FFT
    ├── post_tts_processor.rs # Post-TTS processing
    ├── post_tts.rs         # Post-TTS utilities
    ├── pre_stt.rs          # Pre-STT enhancement (AGC, noise suppression)
    ├── sola.rs             # SOLA time-stretching
    └── yin.rs              # YIN pitch detection (NEW - SIMD accelerated)
```

## TypeScript Integration

The module is consumed via the unified TypeScript wrapper:

```typescript
// Recommended: Use the audio-dsp wrapper (graceful fallbacks)
import { 
  detectPitch,       // YIN pitch detection (~40x faster)
  calculateRms,      // SIMD-accelerated RMS
  calculateZcr,      // Zero crossing rate
  detectVoiceActivity,  // Combined VAD
  createPreSttProcessor,  // Full pre-STT pipeline
} from '@/speech/audio-dsp';

// Example: Pitch detection
const result = detectPitch(samples, 16000);
console.log(result.pitchHz, result.confidence);

// Example: Pre-STT enhancement
const processor = createPreSttProcessor({ enableAgc: true });
const enhanced = processor.processFrame(samples, isSpeech);
```

## Files That Use This Module

| TypeScript File | What It Uses |
|-----------------|--------------|
| `src/speech/audio-dsp/native-audio-dsp.ts` | Unified wrapper with fallbacks |
| `src/speech/voice-tremor.ts` | YIN pitch detection, RMS, statistics |
| `src/speech/audio-prosody/real-time-analyzer.ts` | Energy, ZCR, pitch, VAD |
| `src/agents/shared/performance/pre-stt-transform.ts` | Full pre-STT pipeline |

## Build

```bash
cd apps/rust-audio

# Prerequisites
# - Rust 1.75+ (rustup.rs)
# - Node.js 18+

# Build release
pnpm build

# Debug build (faster compile)
pnpm build:debug

# Run Rust tests
pnpm test
cargo test

# Run benchmarks
cargo bench
```

## Output

Produces native Node.js addon:
- `ferni-audio.darwin-arm64.node` (macOS ARM)
- `ferni-audio.darwin-x64.node` (macOS Intel)
- `ferni-audio.linux-x64-gnu.node` (Linux)
- `ferni-audio.win32-x64-msvc.node` (Windows)

## Usage

```typescript
import { processAudio, enhanceForSTT } from '@ferni/audio';

// Pre-STT enhancement
const enhanced = enhanceForSTT(rawAudio, {
  agc: true,
  noiseSuppression: true,
  bandwidthExtension: true,
});

// Post-TTS processing
const processed = processPostTTS(ttsAudio, {
  normalization: true,
  deEsser: true,
});
```

## Performance Comparison

| Operation | JavaScript | Rust | Speedup |
|-----------|------------|------|---------|
| **YIN Pitch Detection** (512 samples) | ~2ms | ~0.05ms | **40x** |
| **RMS Energy** | ~0.1ms | ~0.005ms | **20x** |
| **Zero Crossing Rate** | ~0.08ms | ~0.004ms | **20x** |
| **FFT** (4096 samples) | 2ms | 0.05ms | 40x |
| **AGC processing** | 5ms | 0.1ms | 50x |
| **Noise suppression** | 10ms | 0.2ms | 50x |

Total per-turn savings: ~50-100ms (pitch detection runs ~5-10x per utterance)

## Why Rust?

- **No GC** - Predictable latency for real-time audio
- **SIMD** - AVX2/SSE/NEON vectorized operations via `wide` crate
- **Zero-allocation** - Ring buffers prevent allocations in hot path
- **O(n) YIN** - Pitch detection is O(n) vs O(n²) JS autocorrelation

## Key Algorithms

### YIN Pitch Detection (yin.rs)

The YIN algorithm provides accurate pitch detection in O(n) time:

1. **Difference function** - d(τ) = Σ (x[j] - x[j+τ])²
2. **Cumulative Mean Normalized Difference** - Normalizes for amplitude
3. **Absolute Threshold** - Finds first dip below threshold
4. **Parabolic Interpolation** - Sub-sample accuracy

```rust
// NAPI export
pub fn estimate_pitch_yin(
    samples: Float32Array,
    sample_rate: u32,
    min_pitch: Option<f64>,  // Default: 50 Hz
    max_pitch: Option<f64>,  // Default: 500 Hz
) -> NativeYinResult
```

### Pre-STT Pipeline (pre_stt.rs)

```
User Audio → DC Removal → Bandwidth Extension → AGC → Noise Suppression → STT
                (80Hz HP)    (8kHz→16kHz)    (±20dB)   (Spectral Subtraction)
```

### Post-TTS Pipeline (post_tts_processor.rs)

```
TTS Audio → Warmth EQ → Presence EQ → Compression → De-Esser → Limiter
              (300Hz)     (3kHz)       (2:1)       (Split-band)  (-1dB)
            + Breath + Micro-pitch + Vocal Fry + Lip Smacks (humanization)
```

## Dependencies

```toml
[dependencies]
napi = "2.16"           # Node.js bindings
napi-derive = "2.16"
ringbuf = "0.4"         # Zero-allocation ring buffers
wide = "0.7"            # SIMD operations (f32x8)
thiserror = "1.0"       # Error handling
lazy_static = "1.5"     # Global state (session registries)
```

## Testing

**Important**: NAPI-RS projects cannot run `cargo test` directly for code that uses NAPI types. Use TypeScript integration tests instead:

```bash
# Build the native module first
pnpm build

# Run TypeScript integration tests
cd ../../  # Back to repo root
pnpm vitest run src/speech/audio-dsp/__tests__/native-audio-dsp.test.ts
```

For pure Rust unit tests (no NAPI types), they can be run with `cargo test`.

## Related Docs

- `docs/architecture/PRE-STT-AUDIO-ENHANCEMENT.md` - Full DSP documentation
- `src/speech/audio-dsp/native-audio-dsp.ts` - TypeScript wrapper with fallbacks
- `src/speech/audio-dsp/__tests__/` - Integration tests
- `apps/rust-perf/` - SIMD performance utilities (cosine similarity, etc.)
