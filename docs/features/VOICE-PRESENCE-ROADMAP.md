# Voice Presence Roadmap: Crossing the Uncanny Valley

*Inspired by [Sesame's research on conversational voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)*

## Executive Summary

Sesame's research identifies four key components for "voice presence":
1. **Emotional intelligence** - reading and responding to emotional contexts
2. **Conversational dynamics** - natural timing, pauses, interruptions, emphasis
3. **Contextual awareness** - adjusting tone and style to match the situation
4. **Consistent personality** - maintaining a coherent, reliable presence

This document maps Ferni's current capabilities against these pillars and proposes enhancements.

---

## 📊 Current State Assessment

### What Ferni Already Has ✅

| Capability | Implementation | File |
|------------|----------------|------|
| **VAD (Voice Activity Detection)** | Silero VAD via LiveKit | `voice-agent.ts` |
| **Interruption Handling** | `InterruptionHandler` with persona-specific recovery | `interruption-handler.ts` |
| **Turn-Taking Monitor** | Balance tracking, invitation prompts | `turn-taking.ts` |
| **Emotion Matching** | Prosody adjustment based on user emotion | `emotion-matching.ts` |
| **Backchanneling** | Persona-specific "mm-hmm" interjections | `backchanneling.ts` |
| **SSML Prosody** | Speed, volume, emotion tags | `ssml-tagger.ts`, `adaptive-ssml.ts` |
| **Speech Context** | Energy/pace adaptation | `speech-context.ts` |
| **Voice Options** | Configurable endpointing | `voice-agent.ts` |

### Current Voice Configuration

```typescript
voiceOptions: {
  allowInterruptions: true,
  minEndpointingDelay: 400,    // ms before considering user done
  maxEndpointingDelay: 1200,   // max wait time
  minInterruptionWords: 1,
  minInterruptionDuration: 300, // ms
  preemptiveGeneration: true,   // start generating while user finishes
}
```

---

## 🎯 Gap Analysis

### Pillar 1: Emotional Intelligence

| Feature | Sesame | Ferni | Gap |
|---------|--------|-------|-----|
| Real-time emotion detection | ✅ From audio | ✅ From text + some audio | Minor |
| Emotion mirroring in TTS | ✅ Native | ✅ Via SSML | None |
| Emotional arc tracking | ✅ | ✅ `emotional-arc.ts` | None |
| Voice stress detection | ✅ | ⚠️ Basic | Medium |

**Recommendation**: Enhance audio-based stress detection using pitch/energy analysis.

### Pillar 2: Conversational Dynamics

| Feature | Sesame | Ferni | Gap |
|---------|--------|-------|-----|
| Natural interruption handling | ✅ | ✅ | None |
| Backchannel during user speech | ✅ | ⚠️ After pause only | Medium |
| Adaptive endpointing | ✅ Context-aware | ❌ Fixed thresholds | **HIGH** |
| Turn prediction | ✅ | ❌ | **HIGH** |
| Thinking pauses vs end-of-turn | ✅ | ⚠️ Basic | Medium |

**Recommendation**: Implement adaptive endpointing based on:
- Sentence completion likelihood (use LLM)
- Topic complexity (longer pauses for heavy topics)
- User's speaking pattern (fast talkers get shorter endpointing)

### Pillar 3: Contextual Awareness

| Feature | Sesame | Ferni | Gap |
|---------|--------|-------|-----|
| Conversation history for prosody | ✅ | ❌ | **HIGH** |
| Topic-aware speech rate | ✅ | ✅ | None |
| Time-of-day adaptation | ✅ | ✅ | None |
| Pronunciation consistency | ✅ | ❌ | Medium |

**Recommendation**: Pass conversation history to TTS for context-aware prosody.

### Pillar 4: Consistent Personality

| Feature | Sesame | Ferni | Gap |
|---------|--------|-------|-----|
| Persona-specific speech patterns | ✅ | ✅ | None |
| Persona backchannels | ✅ | ✅ | None |
| Voice consistency across turns | ✅ | ✅ | None |
| Persona-specific imperfections | ❌ | ✅ (NEW) | **Ahead!** |

---

## 🚀 Proposed Enhancements

### Priority 1: Adaptive Endpointing (HIGH IMPACT)

**Problem**: Fixed 400-1200ms endpointing doesn't account for:
- Thinking pauses (user is formulating, not done)
- Topic complexity (heavy topics need more silence)
- User's natural speaking rhythm

**Solution**:

```typescript
// src/conversation/adaptive-endpointing.ts

interface EndpointingContext {
  topicWeight: 'light' | 'medium' | 'heavy';
  userSpeakingRateLast30s: number; // words per minute
  sentenceCompleteness: number; // 0-1 from LLM
  emotionalIntensity: number;
  conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing';
}

function calculateEndpointingDelay(ctx: EndpointingContext): {
  minDelay: number;
  maxDelay: number;
} {
  let baseMin = 400;
  let baseMax = 1200;

  // Heavy topics = more thinking time
  if (ctx.topicWeight === 'heavy') {
    baseMin += 200;
    baseMax += 400;
  }

  // Slow speakers get more time
  if (ctx.userSpeakingRateLast30s < 100) {
    baseMin += 150;
  }

  // Incomplete sentences = probably thinking
  if (ctx.sentenceCompleteness < 0.5) {
    baseMin += 300;
    baseMax += 500;
  }

  // High emotion = give space
  if (ctx.emotionalIntensity > 0.7) {
    baseMin += 100;
    baseMax += 300;
  }

  return {
    minDelay: Math.min(baseMin, 800),
    maxDelay: Math.min(baseMax, 2000),
  };
}
```

### Priority 2: Live Backchanneling (MEDIUM-HIGH IMPACT)

**Problem**: Current backchannels only happen after user pauses. Sesame does "live" backchannels during user speech without interrupting.

**Solution**: Use a separate audio channel for soft backchannels:

```typescript
// Enhanced backchanneling with overlap support

interface LiveBackchannelEvent {
  // Trigger during user speech at natural breath points
  triggerOn: 'breath_pause' | 'sentence_boundary' | 'emotional_peak';
  
  // Very soft so it doesn't interrupt
  volumeLevel: 0.3; // 30% of normal volume
  
  // Short, unobtrusive
  phrases: ['mmhm', 'yeah', 'right', 'uh-huh'];
  
  // Don't wait for user to stop
  overlapAllowed: true;
}
```

**Implementation approach**:
1. Detect natural breath pauses (100-300ms) during speech
2. Send backchannel on separate audio stream at low volume
3. Don't reset VAD - user is still "talking"

### Priority 3: Conversation-Aware Prosody (HIGH IMPACT)

**Problem**: TTS generates each utterance in isolation. It doesn't know:
- What the previous turn sounded like
- The emotional trajectory of the conversation
- Whether this is a continuation or topic change

**Solution**: Context injection for TTS (Cartesia or Google TTS):

```typescript
interface TtsContextWindow {
  // Last 3 turns summarized for prosody guidance
  recentTurns: Array<{
    speaker: 'user' | 'agent';
    emotion: string;
    energy: number;
    wasInterrupted: boolean;
  }>;
  
  // Overall conversation state
  emotionalArc: 'escalating' | 'stable' | 'de-escalating';
  rapport: number; // 0-1
  
  // Prosody guidance derived from context
  suggestedProsody: {
    openingBeat: boolean; // Add pause before speaking
    warmth: 'high' | 'medium' | 'low';
    pace: 'faster' | 'match' | 'slower';
    emphasis: string[]; // words to emphasize
  };
}
```

### Priority 4: Turn Prediction (MEDIUM IMPACT)

**Problem**: We wait for silence to know user is done. Sesame predicts turn completion.

**Solution**: Use sentence completion detection:

```typescript
// Real-time turn prediction
interface TurnPrediction {
  // Current transcript fragment
  currentText: string;
  
  // Is this likely a complete thought?
  completionLikelihood: number; // 0-1
  
  // Predicted remaining words
  estimatedRemainingWords: number;
  
  // Should we start generating?
  readyToRespond: boolean;
}

function predictTurnCompletion(transcript: string): TurnPrediction {
  // Use lightweight LLM or heuristics:
  // - Ends with "?" or "." = likely complete
  // - Contains "so yeah", "you know?" = probably done
  // - Trailing off = might be done
  // - Rising intonation on statement = continue listening
}
```

### Priority 5: Pronunciation Memory (LOW-MEDIUM IMPACT)

**Problem**: Inconsistent pronunciation of names, technical terms across turns.

**Solution**: Pronunciation dictionary per session:

```typescript
interface PronunciationMemory {
  // User's name and how they said it
  userName?: {
    text: string;
    phonetic: string; // IPA or SSML phoneme
    source: 'user_introduction' | 'user_correction';
  };
  
  // Technical terms user used
  terms: Map<string, {
    userPronunciation: string;
    contextClue?: string; // "route" in travel context = /ruːt/
  }>;
}
```

---

## 📈 Implementation Phases

### Phase 1: Quick Wins (1-2 weeks) ✅ COMPLETED
- [x] Alive intros with imperfections ✅ (`alive-intros.ts`)
- [x] Add sentence completeness heuristics to endpointing ✅ (`adaptive-endpointing.ts`)
- [x] Increase endpointing delay for heavy topics ✅
- [x] Add conversation phase to speech context ✅

### Phase 2: Medium Effort (2-4 weeks) ✅ COMPLETED
- [x] Implement adaptive endpointing service ✅ (`adaptive-endpointing.ts`)
- [x] Add breath-pause detection for live backchannels ✅ (`live-backchanneling.ts`)
- [x] Create pronunciation memory system ✅ (`pronunciation-memory.ts`)
- [x] Add conversation history to TTS context ✅ (`tts-context.ts`)

### Phase 3: Advanced (4-8 weeks) ✅ COMPLETED
- [x] Turn prediction with heuristics ✅ (`turn-prediction.ts`)
- [x] Full duplex backchannel support ✅ (soft overlapping backchannels)
- [x] Prosody continuation across turns ✅ (`tts-context.ts`)
- [x] User speaking pattern learning ✅ (WPM tracking in `adaptive-endpointing.ts`)

### Future Enhancements
- [ ] LLM-based turn prediction (upgrade from heuristics)
- [ ] IPA phoneme injection (when TTS supports it)
- [ ] Real-time audio intonation detection

---

## 🔧 Technical Requirements

### For Adaptive Endpointing
- Access to real-time transcript
- Topic classification (already have)
- User WPM tracking (already have)
- Sentence completion model (new)

### For Live Backchanneling
- Separate audio channel OR very low volume mixing
- Breath pause detection (< 300ms silence during speech)
- Non-interrupting TTS calls

### For Context-Aware TTS
- TTS API that accepts context (Cartesia API supports some context)
- Conversation state summarization
- Turn history buffer (last 3-5 turns)

---

## 📊 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Interruption recovery naturalness | Good | Excellent | User rating |
| Turn-taking balance | 55/45 agent/user | 45/55 | Turn duration ratio |
| Response latency (P50) | ~800ms | ~500ms | Instrumentation |
| "Felt like talking to a person" | TBD | 4.5/5 | User survey |
| Awkward silence incidents | TBD | -50% | Silence duration tracking |

---

## 🔗 References

- [Sesame: Crossing the Uncanny Valley of Voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [Sesame CSM GitHub](https://github.com/SesameAILabs/csm) - Open source model
- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [Cartesia SSML Reference](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags)

---

## Summary

Ferni now has **comprehensive voice presence**:

### ✅ Completed Systems
| System | File | What It Does |
|--------|------|--------------|
| Adaptive Endpointing | `adaptive-endpointing.ts` | Context-aware VAD timing |
| Live Backchanneling | `live-backchanneling.ts` | Soft overlays during user speech |
| TTS Context | `tts-context.ts` | Prosody continuity across turns |
| Pronunciation Memory | `pronunciation-memory.ts` | Consistent name/term pronunciation |
| Turn Prediction | `turn-prediction.ts` | Pre-emptive response generation |
| Alive Intros | `alive-intros.ts` | Human-like imperfections |

### Core Strengths
- **Emotional intelligence** - emotion detection, mirroring, emotional arc
- **Personality consistency** - persona-specific everything
- **Advanced conversational dynamics** - interruptions, live backchannels, turn prediction
- **Natural speech** - pronunciation memory, prosody continuity
- **Authentic personality** - imperfections, inner-world bleed, self-aware humor

### Future Enhancements
1. **LLM-based turn prediction** - Upgrade from heuristics for higher accuracy
2. **IPA phoneme injection** - When TTS engines support `<phoneme>` tags
3. **Real-time intonation detection** - Audio-based rising/falling pitch analysis

---

## ⚠️ Known Limitations

### 1. VAD Cannot Update at Runtime
**Issue**: LiveKit's `voiceOptions` (minEndpointingDelay, maxEndpointingDelay) are set at session creation and cannot be changed mid-session.

**Impact**: Adaptive endpointing calculates recommended thresholds but can only log them; they apply to future sessions.

**Workaround**: Config changes via dashboard apply to new sessions immediately.

### 2. Cartesia Context ID Not Supported
**Issue**: Cartesia's WebSocket API supports `context_id` for prosody continuity, but the `@livekit/agents-plugin-cartesia` doesn't expose this option.

**Impact**: TTS Context service generates context IDs that aren't actually passed to Cartesia.

**Workaround**: Prosody guidance is applied via SSML (breaks, speed, emotion tags) instead.

### 3. Breath Pause Detection Limited
**Issue**: The BreathPauseDetector requires continuous audio frame updates to detect pauses, but the sttNode audio stream isn't easily accessible from the UserStateChanged handler.

**Impact**: Live backchanneling's `isBreathPause()` may not fire accurately.

**Workaround**: Live backchannels still fire based on speaking duration and probability; breath pause detection is a future enhancement when audio routing is improved.

### 4. Preemptive Generation Not Wired
**Issue**: Turn prediction identifies when user is likely done, but LiveKit's agent architecture doesn't support starting LLM generation before the final transcript.

**Impact**: Turn prediction records accuracy but doesn't reduce latency yet.

**Future**: May require custom STT integration or LiveKit feature request.

---

## 🔧 Tuning & Analytics System

### Voice Presence Analytics (`src/services/voice-presence-analytics.ts`)

Collects metrics for all voice presence features to enable monitoring and auto-tuning.

**Metrics Tracked:**

| Feature | Metrics |
|---------|---------|
| Adaptive Endpointing | avgMinDelay, avgMaxDelay, cutOffRate, overWaitRate, completenessAccuracy |
| Live Backchanneling | totalFired, positiveRate, negativeRate, avgTriggerTime |
| Turn Prediction | totalPredictions, accuracy, avgLatencySaved, falsePositiveRate |
| Pronunciation Memory | namesLearned, correctionsReceived, applicationsCount |

### Voice Presence Dashboard (`apps/web/public/voice-presence-dashboard.html`)

Interactive dashboard for monitoring and tuning voice presence features.

**Features:**
- 📊 Real-time metrics display
- 🎛️ Manual parameter tuning controls
- 🤖 AI-generated tuning recommendations
- ⚡ One-click recommendation application
- 🔄 Auto-tune toggle for hands-off optimization

**Access:** `/voice-presence-dashboard.html` (linked from Observability Hub)

### API Endpoints (`src/api/voice-presence-routes.ts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice-presence/dashboard` | GET | Full dashboard data |
| `/api/voice-presence/metrics` | GET | All feature metrics |
| `/api/voice-presence/config` | GET/POST | Read/update configuration |
| `/api/voice-presence/recommendations` | GET | AI tuning recommendations |
| `/api/voice-presence/apply-recommendation` | POST | Apply a recommendation |
| `/api/voice-presence/auto-tune` | POST | Toggle auto-tuning |

### Auto-Tuning Logic

The system generates recommendations when metrics cross thresholds:

```typescript
// Example: High cut-off rate → recommend longer delays
if (endpointingMetrics.cutOffRate > 0.15) {
  recommend({
    parameter: 'baseMinDelay',
    currentValue: 400,
    recommendedValue: 500,
    reason: 'High cut-off rate (15%) suggests we need longer pauses',
    impact: 'high'
  });
}

// Example: Low backchannel success → recommend lower probability
if (backchannelMetrics.positiveRate < 0.4) {
  recommend({
    parameter: 'baseProbability',
    currentValue: 0.25,
    recommendedValue: 0.20,
    reason: 'Low positive reaction rate suggests backchannels may be annoying',
    impact: 'medium'
  });
}
```

### Configuration Parameters

```typescript
interface VoicePresenceConfig {
  adaptiveEndpointing: {
    baseMinDelay: number;           // Default: 400ms
    baseMaxDelay: number;           // Default: 1200ms
    heavyTopicMultiplier: number;   // Default: 1.3
    emotionalMultiplier: number;    // Default: 1.5
    slowSpeakerThreshold: number;   // Default: 100 WPM
  };
  liveBackchanneling: {
    minSpeakingDuration: number;    // Default: 4000ms
    minInterval: number;            // Default: 8000ms
    baseProbability: number;        // Default: 0.25
    emotionalProbability: number;   // Default: 0.4
    softVolumeRatio: number;        // Default: 0.3
  };
  turnPrediction: {
    completionConfidenceThreshold: number;    // Default: 0.6
    preemptiveGenerationThreshold: number;    // Default: 0.65
  };
}

