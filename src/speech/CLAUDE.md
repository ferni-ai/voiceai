# Speech Module (`src/speech/`)

> "We believe in making AI human, and the decisions we make will reflect that."

The speech module provides voice-based capabilities that make Ferni feel truly human. It handles everything from SSML generation to emotion detection from voice prosody.

## 🎯 Production-Ready Status

This module is **production-ready** with:

- ✅ Full session-scoped service management
- ✅ Comprehensive test coverage (including session-cleanup, ssml-tagger)
- ✅ Memory-safe cleanup for 27+ services
- ✅ Optimized FFT with iterative Cooley-Tukey algorithm
- ✅ Tunable detection thresholds via exported constants

## Architecture Overview

```
src/speech/
├── __tests__/                    # Test files
│   ├── audio-prosody.test.ts    # ✅ Comprehensive
│   ├── human-listening-pipeline.test.ts # ✅ Good
│   ├── voice-humanization.test.ts # ✅ Good
│   ├── session-cleanup.test.ts  # ✅ NEW - Memory safety tests
│   └── ssml-tagger.test.ts      # ✅ NEW - SSML generation tests
├── audio-prosody/                # Voice emotion detection (split module)
│   ├── types.ts                 # Type definitions
│   ├── analyzer.ts              # Main AudioProsodyAnalyzer class
│   ├── feature-extraction.ts    # Audio DSP functions
│   ├── emotion-mapping.ts       # VAD emotion mapping
│   ├── session-management.ts    # Session handling & metrics
│   └── index.ts                 # Re-exports
├── ssml-tagger/                  # SSML generation (split module)
│   ├── types.ts
│   ├── constants.ts
│   ├── detection.ts
│   ├── financial.ts
│   ├── jack-bogle.ts
│   ├── processors.ts
│   └── index.ts
├── voice-manager/                # Session-scoped voice management
│   ├── manager.ts               # VoiceManager class (now session-scoped!)
│   └── index.ts
├── index.ts                      # Main exports
├── session-cleanup.ts            # Unified session cleanup (IMPORTANT!)
└── [other modules]
```

## Key Concepts

### 1. Session-Scoped Services

**ALL services in this module are session-scoped** to prevent cross-session contamination. Each service follows this pattern:

```typescript
// Get or create service for a session
const analyzer = getSessionAudioProsodyAnalyzer(sessionId);

// Clean up when session ends
removeSessionAudioProsodyAnalyzer(sessionId);
```

### 2. Centralized Session Cleanup

**CRITICAL**: Always use `session-cleanup.ts` to clean up sessions!

```typescript
import { cleanupSpeechSession } from './session-cleanup.js';

// When a session ends:
cleanupSpeechSession(sessionId, { reason: 'normal' });
```

This cleans up ALL 27+ session-scoped services automatically. Failing to call this will cause memory leaks.

### 4. Session-Scoped Voice Manager (NEW!)

The VoiceManager is now session-scoped to prevent voice state leakage between sessions:

```typescript
import { getSessionVoiceManager, resetSessionVoiceManager } from './voice-manager.js';

// Get session-scoped voice manager
const voiceManager = getSessionVoiceManager(sessionId);
voiceManager.switchVoice('ferni');

// Clean up on session end (automatically called by cleanupSpeechSession)
resetSessionVoiceManager(sessionId);
```

### 5. Session-Scoped Catchphrase Tracking (NEW!)

Catchphrase tracking is now session-scoped:

```typescript
import { getSessionCatchphraseTracker, shouldInjectCatchphrase } from './response-naturalness.js';

// New session-scoped API
const tracker = getSessionCatchphraseTracker(sessionId);
if (tracker.shouldInject(personaId, turnCount, isPositive)) {
  // Add catchphrase
}

// Or use the convenience function with sessionId
shouldInjectCatchphrase(sessionId, personaId, turnCount, isPositive);
```

### 3. Human Listening Pipeline

The `human-listening-pipeline.ts` orchestrates all listening capabilities:

```typescript
import { getHumanListeningPipeline } from './human-listening-pipeline.js';

const pipeline = getHumanListeningPipeline(sessionId);
const result = await pipeline.analyze({
  sessionId,
  text: userText,
  turnNumber: 5,
  // Optional: audioSamples, prosodyFeatures, etc.
});

// Result includes:
// - audio: breath, tremor, volume, energy analysis
// - text: cognitive load, hedging, self-soothing
// - conversation: narrative arc, engagement
// - emotionalUndercurrent: synthesized emotional state
// - agentGuidance: what the agent should do
// - ssmlSuggestions: speed, pause, volume adjustments
```

## Adding New Services

### Pattern to Follow

```typescript
// 1. Create the service class
export class MyNewService {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  reset(): void {
    // Reset internal state
  }
}

// 2. Session management
const instances = new Map<string, MyNewService>();

export function getMyNewService(sessionId: string): MyNewService {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new MyNewService(sessionId));
  }
  return instances.get(sessionId)!;
}

export function resetMyNewService(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

// 3. Add to session-cleanup.ts!
// IMPORTANT: Add your reset function to cleanupSpeechSession()
```

### Checklist for New Services

- [ ] Service class has `reset()` method
- [ ] Session Map uses `new Map<string, ServiceClass>()`
- [ ] Has `get*Service(sessionId)` function
- [ ] Has `reset*Service(sessionId)` function
- [ ] **Added to `session-cleanup.ts`** ← Most important!
- [ ] Exported from `index.ts`
- [ ] Has unit tests

## File Size Guidelines

Files over 500 lines should be split into subdirectories:

```
my-large-module.ts (700 lines)
    ↓
my-large-module/
├── types.ts          # Interfaces and types
├── core.ts           # Main class
├── helpers.ts        # Utility functions
├── session.ts        # Session management
└── index.ts          # Re-exports everything
```

Then update the original file to re-export:

```typescript
// my-large-module.ts
export * from './my-large-module/index.js';
```

## Testing

Run speech module tests:

```bash
npm test -- --run src/speech/__tests__/
```

### Test Coverage

| File                     | Coverage | Priority                    |
| ------------------------ | -------- | --------------------------- |
| audio-prosody            | ✅ Good  | Core functionality          |
| human-listening-pipeline | ✅ Good  | Core functionality          |
| voice-humanization       | ✅ Good  | Core functionality          |
| session-cleanup          | ✅ Good  | Critical for memory safety  |
| ssml-tagger              | ✅ Good  | Important for voice quality |

## Common Patterns

### SSML Generation

```typescript
import { tagTextWithSsmlPersonaAware } from '../ssml/index.js';

const ssml = tagTextWithSsmlPersonaAware(text, {
  personaId: 'ferni',
  baseSpeed: 0.9,
  humanize: true,
});
```

### Emotion Detection

```typescript
import { getSessionAudioProsodyAnalyzer } from './audio-prosody.js';

const analyzer = getSessionAudioProsodyAnalyzer(sessionId);
analyzer.processSamples(audioSamples, sampleRate);
const emotion = analyzer.analyze();

if (emotion && emotion.confidence > 0.5) {
  // User is feeling: emotion.primary
  // Stress level: emotion.stressLevel
}
```

### Voice Humanization

```typescript
import { getVoiceHumanizationService } from './voice-humanization.js';

const humanizer = getVoiceHumanizationService(sessionId);

// Check for interruptions
const interruption = humanizer.detectMicroInterruption(text, isAgentSpeaking);
if (interruption.shouldStopAgent) {
  // Stop agent speech immediately
}

// Get emotional TTS adjustments
const adjustments = humanizer.getEmotionalTtsAdjustments(emotionalArc);
```

## Deprecated APIs

These functions are deprecated and will be removed:

| Deprecated                           | Use Instead                                 |
| ------------------------------------ | ------------------------------------------- |
| `getAudioProsodyAnalyzer()`          | `getSessionAudioProsodyAnalyzer(sessionId)` |
| `getBackchannelingSystem()`          | `getSessionBackchannelingSystem(sessionId)` |
| `tagTextWithSsml()`                  | `tagTextWithSsmlPersonaAware()`             |
| `getVoiceManager()`                  | `getSessionVoiceManager(sessionId)`         |
| `shouldInjectCatchphrase()` (3 args) | `shouldInjectCatchphrase(sessionId, ...)`   |

## Dependencies

This module depends on:

- `@livekit/rtc-node` - Audio frame types
- `../utils/safe-logger.js` - Logging
- `../intelligence/` - Cognitive analysis
- `../conversation/` - Conversation state
- `../ssml/` - Persona-aware SSML

## Performance Considerations

1. **Audio Processing**: The prosody analyzer uses autocorrelation which is O(n²). Keep buffer sizes reasonable (~5 seconds max).

2. **FFT Analysis**: The FFT uses an optimized iterative Cooley-Tukey algorithm with:
   - Pre-computed bit reversal indices (cached per size)
   - Pre-computed twiddle factors (cached per size)
   - In-place computation for reduced memory allocation
   - Call `clearFFTCaches()` to free memory if needed in long-running processes

3. **Pipeline Analysis**: The full `HumanListeningPipeline.analyze()` runs many analyzers. Use `quickAnalyze()` for real-time checks.

4. **Session Cleanup**: Always clean up sessions to prevent memory growth. The `session-cleanup.ts` cleans 27+ services per session.

## Tunable Configuration

Many detection thresholds are now exported as configurable constants:

```typescript
import { BREATH_DETECTION_CONFIG } from './breath-detection.js';

// Access tunable thresholds
console.log(BREATH_DETECTION_CONFIG.SIGH_CONFIDENCE); // 0.6
console.log(BREATH_DETECTION_CONFIG.GASP_MIN_CENTROID); // 500 Hz
```

This allows fine-tuning detection sensitivity for different audio environments without modifying the source code.
