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

## Future Enhancements

1. **LLM-based turn prediction** - Upgrade from heuristics
2. **Real-time VAD tuning** - Waiting on LiveKit support
3. **Enhanced voice fingerprinting** - Household recognition
4. **Spectral analysis (FFT)** - Better ambient detection
5. **Preemptive generation** - Start LLM before turn complete

---

## References

- [Voice Presence Roadmap](./VOICE-PRESENCE-ROADMAP.md)
- [Sesame Research: Crossing the Uncanny Valley](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)

