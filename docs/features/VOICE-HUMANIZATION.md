# Voice Humanization System

> "We believe in making AI human, and the decisions we make will reflect that."

This document describes the voice humanization capabilities implemented to make Ferni feel truly human in conversation.

## Overview

The Voice Humanization System enhances Ferni's conversational presence through:

| Capability | Description | Impact |
|------------|-------------|--------|
| **Prosody-Aware Turn Prediction** | Uses voice intonation (rising/falling pitch) to detect end-of-turn | Reduces awkward cutoffs |
| **Micro-Interruption Detection** | Stops agent when user says "wait", "hold on", "actually" | Natural interruption flow |
| **Emotional Arc TTS** | Adjusts pauses, warmth, speed based on emotional trajectory | Consistent emotional presence |
| **Laughter Detection** | Detects user laughter and responds naturally | Shared humor moments |
| **Speech Rhythm Mirroring** | Matches user's speech patterns (flowing vs staccato) | Conversational sync |
| **Emotional Contagion** | Maintains prosody continuity across utterances | No jarring resets |
| **Ambient Awareness** | Detects noisy environments and adjusts | Adaptive communication |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Voice Agent                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ Audio Input      │───▶│ Prosody Analyzer │───▶│ Turn          │ │
│  │ (User Speech)    │    │                  │    │ Prediction    │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│           │                       │                     │           │
│           │                       ▼                     │           │
│           │              ┌──────────────────┐           │           │
│           │              │ Voice            │           │           │
│           │              │ Humanization     │◀──────────┤           │
│           │              │ Service          │           │           │
│           │              └──────────────────┘           │           │
│           │                       │                     │           │
│           │                       ▼                     │           │
│           │   ┌─────────────────────────────────────┐   │           │
│           │   │ Detectors                           │   │           │
│           │   ├─────────────────────────────────────┤   │           │
│           ├───│ • Micro-Interruption               │   │           │
│           │   │ • Laughter Detection               │   │           │
│           │   │ • Ambient Awareness                │   │           │
│           │   │ • Rhythm Analysis                   │   │           │
│           │   └─────────────────────────────────────┘   │           │
│           │                       │                     │           │
│           │                       ▼                     │           │
│           │              ┌──────────────────┐           │           │
│           │              │ Emotional        │           │           │
│           │              │ Contagion        │           │           │
│           │              └──────────────────┘           │           │
│           │                       │                     │           │
│           │                       ▼                     │           │
│           │              ┌──────────────────┐           │           │
│           │              │ SSML Enhancement │───────────▶ TTS       │
│           │              └──────────────────┘                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Voice Humanization Service (`src/speech/voice-humanization.ts`)

The core orchestration service that integrates all humanization capabilities.

```typescript
import { getVoiceHumanizationService } from '../speech/voice-humanization.js';

const service = getVoiceHumanizationService(sessionId);

// Detect micro-interruptions
const interruption = service.detectMicroInterruption(transcript, isAgentSpeaking);
if (interruption.shouldStopAgent) {
  session.interrupt();
}

// Get emotional TTS adjustments
const adjustments = service.getEmotionalTtsAdjustments(emotionalArc);
const ssml = service.applyEmotionalSsml(text, adjustments);

// Detect laughter
const laughter = service.detectLaughter(prosody, duration);
if (laughter.isLaughing) {
  const response = service.getLaughterResponse(laughter, personaId);
}
```

### 2. Micro-Interruption Detection

Detects when user wants to interrupt the agent mid-speech.

**Immediate Stop Words:**
- "wait"
- "hold on"
- "stop"
- "actually"
- "hang on"
- "one sec"

**Pre-Interruption Patterns:**
- "yeah but"
- "no, that's not"
- "right, actually"

**Soft Interruption Signals:**
- "but"
- "no"
- "um"
- "well"

### 3. Emotional Arc TTS Adjustments

Adjusts TTS prosody based on emotional trajectory.

| Condition | Adjustment |
|-----------|------------|
| High emotional temperature | +400ms pause, slower speed, add breaths |
| User needs support | Slower, softer, warmer, "empathetic" tag |
| Sudden emotional shift | +350ms pause, soft start |
| Improving trajectory | Slightly faster, more energy |
| Recent distress | Maintain high warmth |
| Volatile emotions | Steady, grounding pace |

### 4. Laughter Detection

Detects user laughter from audio characteristics:

| Feature | Threshold |
|---------|-----------|
| Energy peaks per second | ≥ 3 |
| Max duration | ≤ 3000ms |
| Pitch variance | ≥ 30 Hz |

**Laugh Types & Responses:**

| Type | Characteristics | Suggested Response |
|------|-----------------|-------------------|
| Chuckle | Short, quiet | Smile (acknowledge) |
| Giggle | Short bursts | Acknowledge |
| Laugh | Medium | Acknowledge |
| Hearty | Loud, sustained | Join in |

### 5. Speech Rhythm Mirroring

Analyzes and mirrors user's speech patterns.

**Pattern Types:**

| Pattern | Characteristics | Mirror Adjustment |
|---------|-----------------|-------------------|
| Staccato | Short phrases, long pauses | +20% pauses |
| Flowing | Long continuous speech | -20% pauses |
| Burst | Quick bursts, short pauses | -10% pauses |
| Measured | Deliberate, thoughtful | +30% pauses |

### 6. Emotional Contagion (`src/speech/emotional-contagion.ts`)

Maintains prosody continuity across utterances.

```typescript
const contagion = getEmotionalContagionService(sessionId);

// Record each utterance's emotional state
contagion.recordUtterance({
  emotion: 'supportive',
  valence: 0.3,
  arousal: 0.4,
  warmth: 'high',
  wasSupporting: true,
});

// Get continuity hints for next utterance
const hints = contagion.getContinuityHints(emotionalArc);
const ssml = contagion.applyContinuityToSsml(text, hints);
```

### 7. Ambient Awareness (`src/speech/ambient-awareness.ts`)

Detects environmental context from background audio.

**Environment Types:**
- `quiet_room` - Low noise, clear audio
- `office` - Moderate ambient
- `coffee_shop` - High ambient, voices
- `car` - Road noise, engine
- `noisy` - Generic high noise

**Recommendations:**
- `speakClearer` - Noisy environment
- `offerToPause` - Very noisy
- `increaseVolume` - Moderate noise
- `addPauses` - Clarity needed

---

## Integration

### Voice Agent Integration

The voice humanization is integrated into `voice-agent.ts`:

```typescript
// Initialize at session start
const voiceHumanization = quickSetupVoiceHumanization(
  sessionId,
  personaId,
  emotionalArcTracker,
  {
    onInterrupt: () => session.interrupt(),
    onLaughter: (type) => console.log(`User laughed: ${type}`),
  }
);

// In UserInputTranscribed handler
session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
  // Check for micro-interruptions
  const interruption = voiceHumanization.processStreamingWord(
    event.transcript,
    conversationManager.isAgentSpeaking()
  );
});

// In sttNode (audio processing)
const laughter = voiceHumanization.processAudioFrame(prosody, duration);

// In transcriptionNode (TTS enhancement)
const enhancedSsml = voiceHumanization.enhanceSsml(text);

// Cleanup on disconnect
voiceHumanization.cleanup();
```

---

## Feature Flags

Feature flags enable gradual rollout (`src/config/voice-humanization-flags.ts`):

```typescript
import { getFlags, isFeatureEnabled, isEnabledForSession } from '../config/voice-humanization-flags.js';

// Check if feature is enabled globally
if (isFeatureEnabled('enableMicroInterruptions')) {
  // Feature is on
}

// Check if enabled for specific session (respects rollout %)
if (isEnabledForSession(sessionId)) {
  // This session has voice humanization
}
```

### Environment Variables

```bash
# Master kill switch
VOICE_HUMANIZATION_DISABLED=true

# Individual features
VOICE_HUMANIZATION_ENABLE_MICRO_INTERRUPTIONS=true
VOICE_HUMANIZATION_ENABLE_LAUGHTER_DETECTION=false

# Rollout percentage (0-100)
VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE=50
```

---

## Testing

### Unit Tests

```bash
npm run test -- --run src/speech/__tests__/voice-humanization.test.ts
```

### Test Coverage

| Component | Tests |
|-----------|-------|
| Micro-Interruption Detection | 9 |
| Laughter Detection | 4 |
| Emotional TTS Adjustments | 6 |
| Speech Rhythm Analysis | 4 |
| State Management | 3 |
| Singleton Management | 3 |
| **Total** | **28** |

---

## Performance

### Latency Impact

| Operation | Typical Latency |
|-----------|-----------------|
| Micro-interruption check | < 1ms |
| Laughter detection | < 2ms |
| Emotional TTS adjustment | < 1ms |
| Rhythm analysis | < 1ms |
| SSML enhancement | < 1ms |

**Net Impact:** < 5ms additional processing per turn (negligible).

### Memory Usage

- Per-session state: ~10KB
- Prosody history: ~2KB (rolling window)
- Rhythm profile: ~500B

---

## Files

| File | Description |
|------|-------------|
| `src/speech/voice-humanization.ts` | Core orchestration service |
| `src/speech/emotional-contagion.ts` | Prosody continuity |
| `src/speech/ambient-awareness.ts` | Environment detection |
| `src/agents/integrations/voice-humanization-integration.ts` | Voice agent hooks |
| `src/config/voice-humanization-flags.ts` | Feature flags |
| `src/speech/__tests__/voice-humanization.test.ts` | Unit tests |

---

## Deployment

### Staging

```bash
# Deploy to staging
npm run deploy:ui

# Test with verbose logging
VOICE_HUMANIZATION_ENABLE_VERBOSE_LOGGING=true
```

### Production

```bash
# Gradual rollout
VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE=10

# Monitor and increase
VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE=50
VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE=100
```

---

## Post-TTS Audio Enhancement Pipeline

The Post-TTS system enhances TTS output to make it sound more human. It's implemented in **Rust** for high-performance real-time audio processing, with full TypeScript integration.

### Architecture

```
TTS Output (Cartesia) → Post-TTS Transform → Enhanced Audio → Speaker
                              │
                              ├── Core Processing (always on)
                              │   ├── Crossfade (butter-smooth chunks)
                              │   ├── Warmth Filter (analog character)
                              │   ├── Presence Boost (clarity)
                              │   ├── Compression (consistent levels)
                              │   └── Limiter (-1dB ceiling)
                              │
                              ├── Basic Humanization
                              │   ├── Amplitude Jitter (±0.5dB micro-variations)
                              │   ├── Pitch Drift (subtle wandering)
                              │   ├── Noise Floor (room ambience)
                              │   └── Breath Sounds (natural pauses)
                              │
                              └── Advanced Humanization (opt-in)
                                  ├── Vocal Fry (20-80Hz trailing off)
                                  ├── Lip Smacks (phrase boundaries)
                                  └── Tempo Variation (±3% micro-timing)
```

### Rust Implementation

The core processing is implemented in Rust (`apps/rust-audio/`) using NAPI-RS for Node.js bindings:

| Module | File | Purpose |
|--------|------|---------|
| **PostTtsProcessor** | `post_tts.rs` | Main stateful processor |
| **VocalFry** | `post_tts.rs` | 20-80Hz LFO modulation |
| **LipSmackGenerator** | `post_tts.rs` | Broadband noise bursts |
| **TempoMicroVariation** | `post_tts.rs` | Tempo drift via interpolation |
| **SOLA** | `sola.rs` | Synchronous Overlap-Add pitch shifting |
| **FFT** | `fft.rs` | Frequency analysis for breath detection |

### Configuration

#### PostTTSConfig Interface

```typescript
interface PostTTSConfig {
  // Session identification
  sessionId?: string;
  personaId?: string;

  // Sample rate
  sampleRate?: number;  // Default: 24000 (Cartesia)

  // Core processing
  enableBreath?: boolean;         // Natural breath sounds
  enableWarmth?: boolean;         // Analog warmth filter
  enableCompression?: boolean;    // Dynamic compression
  enablePresence?: boolean;       // Presence boost
  enableSoftEdges?: boolean;      // Crossfade between chunks

  // Basic humanization
  enableAmplitudeJitter?: boolean;  // ±0.5dB variations
  enablePitchDrift?: boolean;       // Subtle pitch wandering
  enableNoiseFloor?: boolean;       // Room ambience

  // SOLA pitch shifting
  useSolaPitch?: boolean;           // Artifact-free pitch shift

  // Emotion prosody
  enableEmotionProsody?: boolean;   // Dynamic pitch/rate
  emotion?: number;                 // 0-1 emotional intensity
  enableAdaptivePacing?: boolean;   // Content-aware pacing
  contentComplexity?: number;       // 0-1 complexity for pacing

  // Advanced humanization
  enableVocalFry?: boolean;         // Trailing vocal fry
  vocalFryDepth?: number;           // 0-1 intensity
  vocalFryDurationMs?: number;      // Duration in ms

  enableLipSmacks?: boolean;        // Mouth sounds
  lipSmackProbability?: number;     // 0-1 probability

  enableTempoVariation?: boolean;   // Micro-timing variations
  tempoVariationDepth?: number;     // 0-1 depth (0.03 = ±3%)

  // Processing parameters
  warmthFrequency?: number;         // Warmth filter cutoff
  compressionRatio?: number;        // Compression ratio
  presenceBoostDb?: number;         // Presence gain
}
```

### Presets

Pre-configured presets for common use cases:

| Preset | Use Case | Key Features |
|--------|----------|--------------|
| `betterThanHuman` | Default production | Basic humanization, no advanced |
| `minimal` | Low latency / testing | Only soft edges |
| `warmIntimate` | Intimate conversations (Maya) | Vocal fry enabled |
| `clearEnergetic` | High-energy content (Peter) | Higher compression/presence |
| `ultraRealistic` | Maximum realism (Nayan) | ALL advanced features |
| `bypass` | Debugging | No processing |

#### Preset Details

```typescript
// betterThanHuman (default)
{
  enableAmplitudeJitter: true,
  enablePitchDrift: true,
  enableNoiseFloor: true,
  useSolaPitch: true,
  enableEmotionProsody: true,
  enableVocalFry: false,      // Off for cleaner sound
  enableLipSmacks: false,
  enableTempoVariation: false,
}

// warmIntimate (Maya)
{
  ...betterThanHuman,
  enableVocalFry: true,       // Trailing intimacy
  vocalFryDepth: 0.3,
  vocalFryDurationMs: 150,
  warmthFrequency: 180,       // Warmer filter
}

// ultraRealistic (Nayan)
{
  ...betterThanHuman,
  enableVocalFry: true,
  vocalFryDepth: 0.4,
  enableLipSmacks: true,
  lipSmackProbability: 0.25,
  enableTempoVariation: true,
  tempoVariationDepth: 0.03,
  enableAdaptivePacing: true,
}
```

### Per-Persona Configuration

Each persona has a recommended preset based on their character:

| Persona | Preset | Rationale |
|---------|--------|-----------|
| Ferni | `betterThanHuman` | Balanced, approachable |
| Maya | `warmIntimate` | Warm coaching style, trailing vocal fry |
| Peter | `clearEnergetic` | Clear financial analysis |
| Alex | `betterThanHuman` | Professional communication |
| Jordan | `betterThanHuman` | Goal-focused clarity |
| Nayan | `ultraRealistic` | Deep wisdom, fully human |

#### Configuration Hierarchy

```
DEFAULT_CONFIG (base defaults)
     ↓
Persona Preset (getRecommendedPreset)
     ↓
Persona Config (from persona.manifest.json)
     ↓
Session Config (runtime overrides)
```

#### Usage

```typescript
import {
  buildPersonaPostTTSConfig,
  getRecommendedPreset,
  createPostTTSTransform,
} from '../agents/shared/performance/post-tts-transform.js';

// Get recommended preset for persona
const preset = getRecommendedPreset('maya-santos'); // 'warmIntimate'

// Build full config with all overrides
const config = buildPersonaPostTTSConfig('maya-santos', {
  // Optional persona-level overrides
  enableVocalFry: true,
  vocalFryDepth: 0.35,
}, {
  // Optional session-level overrides
  sessionId: 'abc-123',
});

// Create the transform stream
const transform = createPostTTSTransform(config);
```

#### Manifest Schema

Personas can declare humanization preferences in `persona.manifest.json`:

```json
{
  "identity": { "id": "maya-santos", ... },
  "humanization": {
    "preset": "warmIntimate",
    "enableVocalFry": true,
    "vocalFryDepth": 0.35,
    "enableLipSmacks": false
  }
}
```

### API Routes

The voice humanization system exposes HTTP endpoints for configuration:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice-humanization/status` | GET | System status |
| `/api/voice-humanization/metrics` | GET | Processing metrics |
| `/api/voice-humanization/config/:sessionId` | GET | Session config |
| `/api/voice-humanization/config/:sessionId` | POST | Update config |
| `/api/voice-humanization/presets` | GET | List all presets |
| `/api/voice-humanization/presets/:name` | GET | Get preset details |
| `/api/voice-humanization/config/default` | GET | Default config |
| `/api/voice-humanization/config/schema` | GET | Config schema |

#### Example Responses

```bash
# GET /api/voice-humanization/presets
{
  "presets": [
    "betterThanHuman",
    "minimal",
    "warmIntimate",
    "clearEnergetic",
    "ultraRealistic",
    "bypass"
  ]
}

# GET /api/voice-humanization/presets/warmIntimate
{
  "name": "warmIntimate",
  "description": "Warm, intimate tone with subtle vocal fry for trailing off...",
  "config": {
    "enableVocalFry": true,
    "vocalFryDepth": 0.3,
    ...
  }
}
```

### Advanced Humanization Features

#### Vocal Fry

Adds subtle vocal fry (20-80Hz modulation) at the end of utterances for natural trailing off.

```
Normal speech → [utterance ending] → LFO modulation (20-80Hz) → Natural fade
```

- **Depth**: 0.0-1.0 (0.3-0.4 typical)
- **Duration**: 100-300ms (150ms typical)
- **Trigger**: Last frame of utterance

#### Lip Smacks

Injects brief broadband noise bursts at phrase boundaries, simulating natural mouth sounds.

```
Phrase boundary detected → Random check (probability) → Noise burst injection
```

- **Probability**: 0.0-1.0 (0.25 typical = 25% of boundaries)
- **Duration**: 15-30ms
- **Characteristics**: Broadband, low amplitude

#### Tempo Micro-Variation

Applies subtle tempo drift (±3%) using sample interpolation for natural timing.

```
Audio frames → Tempo drift calculation → Interpolated output → Subtle timing variation
```

- **Depth**: 0.0-1.0 (0.03 = ±3%)
- **Pattern**: Smooth random walk, no sudden changes

### Performance

| Metric | Value |
|--------|-------|
| Processing latency | < 2ms per frame |
| Memory per session | ~50KB |
| Rust module load time | ~15ms |
| Fallback (JS) available | Yes (limited features) |

### Testing

```bash
# Run all PostTTS tests
pnpm vitest run src/agents/shared/performance/__tests__/post-tts-transform.test.ts

# Test coverage
# - DEFAULT_CONFIG validation
# - All preset configurations
# - Transform stream creation
# - Metrics tracking
# - Persona config functions
# - Feature combinations
```

### Files

| File | Description |
|------|-------------|
| `apps/rust-audio/src/post_tts.rs` | Rust processor implementation |
| `apps/rust-audio/src/sola.rs` | SOLA pitch shifting |
| `apps/rust-audio/src/lib.rs` | NAPI-RS bindings |
| `src/agents/shared/performance/post-tts-transform.ts` | TypeScript integration |
| `src/api/voice-humanization-routes.ts` | API routes |
| `src/personas/bundles/persona-manifest.schema.json` | Schema with humanization |

---

## Future Enhancements

### Input-Side (User Detection)
1. **LLM-based turn prediction** - Upgrade from heuristics
2. **Real-time VAD tuning** - Waiting on LiveKit support
3. **Enhanced voice fingerprinting** - Household recognition
4. **Spectral analysis (FFT)** - Better ambient detection
5. **Preemptive generation** - Start LLM before turn complete

### Output-Side (Post-TTS)
1. **Formant shifting** - More natural pitch changes
2. **Per-word tempo variation** - Content-aware pacing
3. **Emotion-responsive vocal fry** - Deeper fry when tired/sad
4. **Breath timing from punctuation** - Parse-aware breath insertion
5. **User-specific voice matching** - Mirror user's speech characteristics

---

## References

- [Voice Presence Roadmap](./VOICE-PRESENCE-ROADMAP.md)
- [Sesame Research: Crossing the Uncanny Valley](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)

