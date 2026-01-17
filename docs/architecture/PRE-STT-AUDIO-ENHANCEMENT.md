# Pre-STT Audio Enhancement System

> Rust-accelerated inbound audio processing for improved transcription accuracy

## Overview

The Pre-STT (Speech-to-Text) Audio Enhancement system applies real-time audio processing to user speech **before** it reaches the STT model. This significantly improves transcription accuracy for:

- **Quiet speakers** - AGC normalizes volume levels
- **Noisy environments** - Spectral noise suppression removes background sounds
- **Telephone audio** - Bandwidth extension reconstructs missing high frequencies (8kHz → 16kHz)
- **DC offset** - High-pass filter removes rumble and DC bias

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUDIO INPUT SOURCES                                │
├─────────────────────────────────┬───────────────────────────────────────────┤
│     WebRTC (LiveKit)            │         Twilio (Telephone)                │
│     16kHz Linear PCM            │         8kHz μ-law                        │
└───────────────┬─────────────────┴─────────────────┬─────────────────────────┘
                │                                   │
                ▼                                   ▼
┌───────────────────────────────┐   ┌─────────────────────────────────────────┐
│   audio-processor.ts          │   │   twilio-stream-bridge.ts               │
│   (Parallel Analysis Mode)    │   │   (Full Enhancement Mode)               │
│                               │   │                                         │
│   • Runs alongside LLM audio  │   │   • μ-law → Linear PCM                  │
│   • Collects quality metrics  │   │   • Rust enhancement pipeline           │
│   • Detects clipping/issues   │   │   • 8kHz → 16kHz upsampling             │
└───────────────┬───────────────┘   └─────────────────┬───────────────────────┘
                │                                     │
                ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRE-STT PROCESSING LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    TypeScript Wrapper Layer                          │   │
│   │                                                                      │   │
│   │   pre-stt-transform.ts          twilio-audio-enhance.ts             │   │
│   │   ├── PreSTTProcessor           ├── getTwilioEnhancer()             │   │
│   │   ├── PreSTTPresets             ├── Session management              │   │
│   │   └── Session management        └── Buffer conversion               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Rust Native Module (NAPI)                         │   │
│   │                    apps/rust-audio/                                  │   │
│   │                                                                      │   │
│   │   NativePreSttProcessor                                             │   │
│   │   ├── High-pass filter (DC removal, 80Hz cutoff)                    │   │
│   │   ├── Bandwidth extension (8kHz → 16kHz, harmonic regeneration)     │   │
│   │   ├── AGC (automatic gain control, ±20dB range)                     │   │
│   │   └── Noise suppression (spectral subtraction)                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              STT / LLM                                       │
│                    (Gemini Live, OpenAI Realtime)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Rust Native Module (`apps/rust-audio/`)

The core DSP processing is implemented in Rust for performance:

| File | Purpose |
|------|---------|
| `src/pre_stt.rs` | Main Pre-STT processor implementation |
| `src/agc.rs` | Automatic Gain Control |
| `src/noise_suppression.rs` | Spectral noise suppression |
| `src/bandwidth_extension.rs` | 8kHz → 16kHz harmonic regeneration |
| `src/lib.rs` | NAPI bindings for Node.js |

**Key Rust Types:**

```rust
pub struct NativePreSttProcessor {
    config: PreSttConfig,
    highpass: Option<BiquadFilter>,
    agc: AgcProcessor,
    noise_suppressor: NoiseSuppressionProcessor,
    bandwidth_extender: Option<BandwidthExtender>,
    frames_processed: u64,
}

impl NativePreSttProcessor {
    pub fn new(config: NativePreSttConfig) -> Self;
    pub fn for_twilio() -> Self;  // Factory for 8kHz telephony
    pub fn process_frame(&mut self, samples: &[f32], is_speech: bool) -> Vec<f32>;
    pub fn process_frame_i16(&mut self, samples: &[i16], is_speech: bool) -> Vec<f32>;
    pub fn get_stats(&self) -> PreSttStats;
    pub fn reset(&mut self);
}
```

### 2. TypeScript Wrapper (`src/agents/shared/performance/pre-stt-transform.ts`)

Provides a TypeScript interface to the Rust module with fallback support:

```typescript
import { PreSTTProcessor, PreSTTPresets } from './pre-stt-transform.js';

// Create processor with preset
const processor = new PreSTTProcessor({
  ...PreSTTPresets.twilio,
  sessionId: 'my-session',
});

// Initialize (loads Rust module)
await processor.initialize();

// Process audio frames
const enhanced = processor.processFrame(audioSamples, isSpeech);
const enhanced16k = processor.processFrameI16(samples8k, isSpeech);

// Check if using Rust or JS fallback
console.log('Using Rust:', processor.isUsingRust());

// Get processing stats
const stats = processor.getStats();

// Cleanup
processor.reset();
```

### 3. Twilio Enhancer (`src/services/voice/twilio-audio-enhance.ts`)

Specialized wrapper for Twilio telephone audio:

```typescript
import { getTwilioEnhancer } from './twilio-audio-enhance.js';

// Create session-scoped enhancer
const enhancer = await getTwilioEnhancer({
  sessionId: callSid,
  enableAgc: true,
  enableNoiseSuppression: true,
  enableBandwidthExtension: true,
  enableHighpass: true,
});

// Process Twilio audio (8kHz Int16 → 16kHz Float32)
const result = enhancer.enhanceFrame(pcm8kHz, isSpeech);
const enhanced16kHz = result.samples;

// Monitor AGC
console.log('Current AGC gain:', enhancer.getAgcGain());

// Cleanup on call end
enhancer.cleanup();
```

### 4. Integration Points

#### Voice Agent Audio Processor

File: `src/agents/voice-agent/audio-processor.ts`

```typescript
// Pre-STT runs in parallel with the main audio flow
if (preSTTEnabled && !preSTTIntegration && !preSTTInitializing) {
  preSTTInitializing = true;
  initializePreSTTIntegration({ sessionId, userId, isTelephony, verbose: false })
    .then((integration) => { preSTTIntegration = integration; })
    .catch((err) => { log.warn({ error: String(err) }, 'Pre-STT init failed'); })
    .finally(() => { preSTTInitializing = false; });
}

// Process frames for analysis (metrics, clipping detection)
if (preSTTIntegration !== null) {
  const analysis = preSTTIntegration.processFrame(frame);
  userData.preSTTAnalysis = analysis;
}
```

#### Twilio Stream Bridge

File: `src/services/voice/twilio-stream-bridge.ts`

```typescript
// Initialize on stream start
if (isExperimentalEnabled('preSTTAudioProcessing')) {
  session.audioEnhancer = await getTwilioEnhancer({
    sessionId: callSid,
    enableAgc: true,
    enableNoiseSuppression: true,
    enableBandwidthExtension: true,
  });
}

// Process each audio frame
if (session.audioEnhancer) {
  const result = session.audioEnhancer.enhanceFrame(int16Array);
  enhancedBuffer = float32ToInt16Buffer(result.samples);
} else {
  enhancedBuffer = upsample8to16(linearBuffer);  // Fallback
}

// Cleanup on disconnect
if (session.audioEnhancer) {
  session.audioEnhancer.cleanup();
}
```

## Configuration

### Feature Flag

```bash
# Environment variable (default: enabled)
USE_PRE_STT_PROCESSING=true
```

```typescript
// In code
import { isExperimentalEnabled } from '../../config/feature-flags.js';

if (isExperimentalEnabled('preSTTAudioProcessing')) {
  // Use Pre-STT processing
}
```

### Presets

| Preset | Sample Rate | AGC | Noise Supp. | Highpass | Bandwidth Ext. | Use Case |
|--------|-------------|-----|-------------|----------|----------------|----------|
| `standard` | 16kHz | ✅ | ✅ | ✅ | ❌ | Normal web audio |
| `twilio` | 8kHz | ✅ | ✅ | ✅ | ✅ | Telephone calls |
| `quietRoom` | 16kHz | ✅ | ❌ | ✅ | ❌ | Quiet environments |
| `noisy` | 16kHz | ✅ | ✅ | ✅ (100Hz) | ❌ | Loud environments |
| `bypass` | Any | ❌ | ❌ | ❌ | ❌ | Debugging |

```typescript
import { PreSTTPresets } from './pre-stt-transform.js';

const processor = new PreSTTProcessor({
  ...PreSTTPresets.twilio,
  sessionId: 'my-session',
});
```

### Custom Configuration

```typescript
const processor = new PreSTTProcessor({
  sessionId: 'custom-session',
  sampleRate: 16000,
  enableAgc: true,
  enableNoiseSuppression: true,
  enableHighpass: true,
  highpassCutoffHz: 80,
  enableBandwidthExtension: false,
  inputIs8Khz: false,
  enableMetrics: true,
});
```

## Processing Pipeline Details

### 1. High-Pass Filter (DC Removal)

- **Purpose**: Removes DC offset and low-frequency rumble
- **Implementation**: Biquad IIR filter
- **Cutoff**: 80Hz (configurable)
- **Order**: First-order for minimal latency

### 2. Bandwidth Extension (Twilio Only)

- **Purpose**: Reconstruct high frequencies lost in 8kHz telephony
- **Input**: 8kHz audio
- **Output**: 16kHz audio
- **Method**: Harmonic regeneration + spectral envelope shaping
- **Benefit**: Significantly improves STT accuracy for phone audio

### 3. Automatic Gain Control (AGC)

- **Purpose**: Normalize volume levels across speakers
- **Range**: ±20dB (0.1x to 10x gain)
- **Target**: -12 dBFS (0.25 linear)
- **Attack**: Fast (10ms) to catch sudden loud sounds
- **Release**: Slow (100ms) for smooth adaptation
- **Features**: Envelope following, soft limiting

### 4. Noise Suppression

- **Purpose**: Remove background noise (fans, AC, traffic)
- **Method**: Spectral subtraction
- **Adaptation**: Learns noise floor during silence
- **Preservation**: Protects speech frequencies

## Performance

### Benchmarks

| Metric | Target | Typical | Notes |
|--------|--------|---------|-------|
| Frame processing | <2ms | 0.3-0.5ms | Per 20ms frame |
| Real-time factor | <10% | 2-3% | Processing time / audio duration |
| Memory per session | <1MB | ~500KB | Processor state |
| Rust module load | <100ms | ~50ms | One-time startup |

### Real-Time Safety

The Rust implementation ensures real-time safety:

- **No allocations** in hot path
- **SIMD acceleration** for DSP operations
- **Fixed-size buffers** for predictable performance
- **Lock-free** design for thread safety

## Fallback Behavior

When the Rust module is unavailable, JavaScript fallbacks are used:

| Feature | Rust | JavaScript Fallback |
|---------|------|---------------------|
| AGC | ✅ Full (envelope + limiting) | ✅ Simple (peak following) |
| Noise Suppression | ✅ Spectral subtraction | ❌ Not available |
| Highpass | ✅ Biquad filter | ✅ Simple IIR |
| Bandwidth Extension | ✅ Harmonic regeneration | ❌ Not available |

The system logs which mode is active:

```
🦀 Rust pre-STT module loaded (AGC + noise suppression + bandwidth extension)
# or
📦 Pre-STT JavaScript fallback initialized (limited features)
```

## Metrics & Monitoring

### Getting Metrics

```typescript
import { getPreSTTMetrics, resetPreSTTMetrics } from './pre-stt-transform.js';

const metrics = getPreSTTMetrics();
console.log({
  totalFrames: metrics.totalFramesProcessed,
  avgTimeMs: metrics.avgProcessingTimeMs,
  maxTimeMs: metrics.maxProcessingTimeMs,
  avgAgcGain: metrics.avgAgcGain,
  bypassedFrames: metrics.bypassedFrames,
});
```

### Per-Session Stats

```typescript
const processor = await getOrCreateProcessor(sessionId);
const stats = processor.getStats();
console.log({
  framesProcessed: stats.framesProcessed,
  agcGain: stats.agcGain,
  noiseSuppressionReady: stats.noiseSuppressionReady,
  bandwidthExtended: stats.bandwidthExtended,
});
```

### Logging

The system logs key events:

```
🎤 Twilio audio enhancer initialized { sessionId, usingRust, config }
🎤 Pre-STT Rust processor initialized { sessionId, features, inputIs8Khz }
🎤 Twilio audio enhancer cleanup { sessionId, framesProcessed, finalAgcGain }
```

## Testing

### Unit Tests

```bash
# Pre-STT processor tests (41 tests)
pnpm vitest run src/agents/shared/performance/__tests__/pre-stt-transform.test.ts

# Twilio enhancer tests (23 tests)
pnpm vitest run src/services/voice/__tests__/twilio-audio-enhance.test.ts

# All tests
pnpm vitest run src/agents/shared/performance/__tests__/pre-stt-transform.test.ts \
                src/services/voice/__tests__/twilio-audio-enhance.test.ts
```

### E2E Verification

```javascript
// Quick E2E check
const { PreSTTProcessor, isPreSTTAvailable, PreSTTPresets } = require('./dist/agents/shared/performance/pre-stt-transform.js');

async function verify() {
  // 1. Check Rust module
  console.log('Rust available:', await isPreSTTAvailable());

  // 2. Create Twilio processor
  const processor = new PreSTTProcessor({
    ...PreSTTPresets.twilio,
    sessionId: 'test',
  });
  await processor.initialize();
  console.log('Using Rust:', processor.isUsingRust());

  // 3. Process test audio
  const samples8k = new Int16Array(160);
  const result = processor.processFrameI16(samples8k, true);
  console.log('Bandwidth extended:', result.length === 320);
}

verify();
```

## Troubleshooting

### Rust Module Not Loading

**Symptoms:**
- Log shows "JavaScript fallback initialized"
- `isPreSTTAvailable()` returns `false`

**Solutions:**
1. Rebuild Rust module: `cd apps/rust-audio && pnpm build`
2. Check Node.js version compatibility (requires N-API)
3. Verify `@ferni/audio` package is linked

### High Processing Time

**Symptoms:**
- `avgProcessingTimeMs` > 2ms
- Audio glitches or delays

**Solutions:**
1. Reduce noise suppression (most CPU-intensive)
2. Check for other CPU-bound processes
3. Profile with `--inspect` flag

### AGC Not Adapting

**Symptoms:**
- Quiet audio stays quiet
- `agcGain` stays at 1.0

**Solutions:**
1. Verify `enableAgc: true` in config
2. Check `isSpeech` parameter is being passed
3. Allow more frames for adaptation (~50 frames)

### No Bandwidth Extension

**Symptoms:**
- Output length equals input length for 8kHz audio
- Poor STT accuracy on phone calls

**Solutions:**
1. Verify `enableBandwidthExtension: true`
2. Verify `inputIs8Khz: true`
3. Use `PreSTTPresets.twilio` preset

## File Reference

| File | Purpose |
|------|---------|
| `apps/rust-audio/src/pre_stt.rs` | Rust Pre-STT implementation |
| `apps/rust-audio/src/lib.rs` | NAPI bindings |
| `src/agents/shared/performance/pre-stt-transform.ts` | TypeScript wrapper |
| `src/agents/integrations/pre-stt-audio-integration.ts` | Voice agent integration |
| `src/services/voice/twilio-audio-enhance.ts` | Twilio-specific wrapper |
| `src/services/voice/twilio-stream-bridge.ts` | Twilio WebSocket bridge |
| `src/config/feature-flags.ts` | Feature flag configuration |
| `src/agents/voice-agent/audio-processor.ts` | Audio processing loop |

## Related Documentation

- [Tool Loading System](./TOOL-LOADING-SYSTEM.md)
- [Memory Management](./MEMORY-MANAGEMENT.md)
- [Clean Architecture](./CLEAN-ARCHITECTURE.md)

---

*Last updated: December 2024*
