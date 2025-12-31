# Pre-STT Audio Transform

> Rust-accelerated inbound audio enhancement for improved transcription accuracy

## Overview

The Pre-STT (Speech-to-Text) transform applies audio processing to user speech **before** it reaches the STT model. This significantly improves transcription accuracy, especially for:

- **Quiet speakers** - AGC normalizes volume levels
- **Noisy environments** - Spectral noise suppression removes background sounds
- **Telephone audio** - Bandwidth extension reconstructs missing high frequencies

## Pipeline

```
User Mic → LiveKit → [PRE-STT TRANSFORM] → Gemini STT
                            ↓
                      Rust DSP (STATEFUL):
                      1. High-pass filter (DC removal)
                      2. Bandwidth extension (8kHz → 16kHz for Twilio)
                      3. Automatic Gain Control (AGC)
                      4. Noise suppression (spectral subtraction)
```

## Components

| Component | File | Purpose |
|-----------|------|---------|
| **PreSTTProcessor** | `pre-stt-transform.ts` | Main processor class |
| **PreSTT Integration** | `../integrations/pre-stt-audio-integration.ts` | Voice agent integration |
| **Twilio Enhancer** | `../../services/voice/twilio-audio-enhance.ts` | Twilio-specific wrapper |
| **Rust Module** | `apps/rust-audio/` | Native NAPI bindings |

## Usage

### Basic Usage (Standard 16kHz Audio)

```typescript
import { PreSTTProcessor } from './pre-stt-transform.js';

// Create and initialize processor
const processor = new PreSTTProcessor({
  sessionId: 'my-session',
  enableAgc: true,
  enableNoiseSuppression: true,
  enableHighpass: true,
});
await processor.initialize();

// Process audio frames
const enhanced = processor.processFrame(audioSamples, isSpeech);
```

### Twilio 8kHz Audio

```typescript
import { PreSTTProcessor } from './pre-stt-transform.js';

// Create Twilio processor (8kHz → 16kHz with enhancement)
const processor = PreSTTProcessor.forTwilio('call-sid');
await processor.initialize();

// Process telephony audio
const enhanced = processor.processFrameI16(samples8kHz, true);
// Output is 16kHz Float32Array with high-frequency reconstruction
```

### Session Management

```typescript
import {
  getOrCreateProcessor,
  removeSessionProcessor,
  getActiveProcessorCount,
} from './pre-stt-transform.js';

// Get/create session-scoped processor
const processor = await getOrCreateProcessor(sessionId, config);

// Process audio...

// Cleanup when session ends
removeSessionProcessor(sessionId);
```

## Presets

| Preset | Sample Rate | Features | Use Case |
|--------|-------------|----------|----------|
| `standard` | 16kHz | AGC + Noise + Highpass | Normal web audio |
| `twilio` | 8kHz | All + Bandwidth Extension | Telephone calls |
| `quietRoom` | 16kHz | AGC + Highpass only | Quiet environments |
| `noisy` | 16kHz | Aggressive processing | Loud environments |
| `bypass` | Any | None | Debugging |

```typescript
import { PreSTTPresets } from './pre-stt-transform.js';

const processor = new PreSTTProcessor({
  ...PreSTTPresets.twilio,
  sessionId: 'my-session',
});
```

## Feature Flags

The Pre-STT system is controlled by feature flags:

```bash
# Enable Pre-STT processing (default: enabled)
USE_PRE_STT_PROCESSING=true
```

In code:
```typescript
import { isExperimentalEnabled } from '../../config/feature-flags.js';

if (isExperimentalEnabled('preSTTAudioProcessing')) {
  // Use Pre-STT processing
}
```

## Performance

| Metric | Target | Typical |
|--------|--------|---------|
| Frame processing | <2ms | 0.3-0.5ms |
| Real-time factor | <10% | 2-3% |
| Memory per session | <1MB | ~500KB |

The Rust implementation is optimized for real-time audio processing:

- **SIMD acceleration** for DSP operations
- **Zero-copy audio buffers** when possible
- **Stateful processing** for optimal noise estimation

## Architecture

### Rust Native Module (`apps/rust-audio/`)

```rust
// Native Pre-STT Processor (exposed via NAPI)
pub struct NativePreSttProcessor {
    highpass: Option<HighpassFilter>,
    agc: AgcProcessor,
    noise_suppressor: NoiseSuppressionProcessor,
    bandwidth_extender: Option<BandwidthExtender>,
}

impl NativePreSttProcessor {
    pub fn process_frame(&mut self, samples: &[f32], is_speech: bool) -> Vec<f32>;
    pub fn process_frame_i16(&mut self, samples: &[i16], is_speech: bool) -> Vec<f32>;
}
```

### TypeScript Wrapper (`pre-stt-transform.ts`)

```typescript
class PreSTTProcessor {
  private rustProcessor: NativePreSTTProcessorInstance | null = null;
  private jsAgc: SimpleJSAgc | null = null;  // Fallback

  async initialize(): Promise<void>;
  processFrame(samples: Float32Array, isSpeech: boolean): Float32Array;
  processFrameI16(samples: Int16Array, isSpeech: boolean): Float32Array;
}
```

## Fallback Behavior

When the Rust module is unavailable, the system falls back to JavaScript:

| Feature | Rust | JavaScript Fallback |
|---------|------|---------------------|
| AGC | ✅ Full | ✅ Simple envelope |
| Noise Suppression | ✅ Spectral | ❌ Not available |
| Highpass | ✅ Biquad | ✅ Simple IIR |
| Bandwidth Extension | ✅ Harmonic | ❌ Not available |

## Metrics

```typescript
import { getPreSTTMetrics, resetPreSTTMetrics } from './pre-stt-transform.js';

const metrics = getPreSTTMetrics();
console.log({
  totalFrames: metrics.totalFramesProcessed,
  avgTimeMs: metrics.avgProcessingTimeMs,
  maxTimeMs: metrics.maxProcessingTimeMs,
  avgAgcGain: metrics.avgAgcGain,
});
```

## Twilio Integration

For Twilio phone calls, use the specialized wrapper:

```typescript
import { getTwilioEnhancer } from '../../services/voice/twilio-audio-enhance.js';

const enhancer = await getTwilioEnhancer({
  sessionId: callSid,
  enableAgc: true,
  enableNoiseSuppression: true,
  enableBandwidthExtension: true,
});

// In audio processing loop
const result = enhancer.enhanceFrame(pcm8kHz);
const enhanced16kHz = result.samples;
```

## Testing

```bash
# Run Pre-STT tests
pnpm vitest run src/agents/shared/performance/__tests__/pre-stt-transform.test.ts

# Run Twilio enhancement tests
pnpm vitest run src/services/voice/__tests__/twilio-audio-enhance.test.ts
```

## Related Files

- `apps/rust-audio/src/pre_stt.rs` - Rust implementation
- `apps/rust-audio/src/lib.rs` - NAPI bindings
- `src/agents/integrations/pre-stt-audio-integration.ts` - Voice agent integration
- `src/services/voice/twilio-stream-bridge.ts` - Twilio WebSocket bridge
- `src/config/feature-flags.ts` - Feature flag configuration
