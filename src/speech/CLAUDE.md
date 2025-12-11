# Speech Module (`src/speech/`)

> "We believe in making AI human, and the decisions we make will reflect that."

The speech module provides voice-based capabilities that make Ferni feel truly human. It handles everything from SSML generation to emotion detection from voice prosody.

## 🎯 Production-Ready Status

This module is **production-ready** with:

- ✅ Full session-scoped service management
- ✅ Comprehensive test coverage (including session-cleanup, ssml-tagger)
- ✅ Memory-safe cleanup for 29+ services
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

### Recommended Pattern: Use SessionServiceManager

Use the `createSessionManager` abstraction to reduce boilerplate:

```typescript
import { createSessionManager, type SessionService } from './session-service.js';

// 1. Create the service class (implement SessionService interface)
export class MyNewService implements SessionService {
  private sessionId: string;
  private state: SomeState;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = initialState();
  }

  // Required: reset method for cleanup
  reset(): void {
    this.state = initialState();
  }

  // Your service methods...
}

// 2. Create session manager (replaces 15+ lines of boilerplate!)
const manager = createSessionManager('MyNewService', (sessionId) => new MyNewService(sessionId));

export const getMyNewService = manager.get;
export const resetMyNewService = manager.reset;
export const resetAllMyNewServices = manager.resetAll;
export const getActiveMyNewServiceCount = manager.getActiveCount;

// 3. Add to session-cleanup.ts!
// IMPORTANT: Add your reset function to cleanupSpeechSession()
```

### Legacy Pattern (Still Supported)

```typescript
// Manual session management (use SessionServiceManager instead)
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
```

### Checklist for New Services

- [ ] Service class implements `SessionService` interface with `reset()` method
- [ ] Uses `createSessionManager()` for session management (preferred)
- [ ] Has `get*Service(sessionId)` function
- [ ] Has `reset*Service(sessionId)` function
- [ ] **Added to `session-cleanup.ts`** ← Most important!
- [ ] Exported from `index.ts`
- [ ] Has unit tests

### Services Cleaned Up by session-cleanup.ts (29+ total)

| Category                  | Services                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Core Speech**           | audioProsody, wpmTracker, backchanneling, cognitiveSpeech, ttsContext, pronunciationMemory, cartesiaContext                 |
| **Listening & Analysis**  | humanListening, voiceHumanization, turnPrediction, emotionalContagion                                                       |
| **Audio Analysis**        | voiceTremor, volumeDynamics, energyDynamics, fluencyAnalyzer, fillerAnalyzer, fftAnalyzer, laughterDetector, breathDetector |
| **Timing & Rhythm**       | wordTiming, responseAnticipation                                                                                            |
| **Context & Environment** | ambientAwareness, realtimePreemptive                                                                                        |
| **Voice Manager**         | voiceManager                                                                                                                |
| **Backchanneling**        | enhancedBackchanneling, catchphraseTracker                                                                                  |

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

These functions are deprecated and will be removed in a future version:

### Session-Scoped Replacements

| Deprecated                           | Use Instead                                 |
| ------------------------------------ | ------------------------------------------- |
| `getAudioProsodyAnalyzer()`          | `getSessionAudioProsodyAnalyzer(sessionId)` |
| `getBackchannelingSystem()`          | `getSessionBackchannelingSystem(sessionId)` |
| `getVoiceManager()`                  | `getSessionVoiceManager(sessionId)`         |
| `resetVoiceManager()`                | `resetSessionVoiceManager(sessionId)`       |
| `getWPMTracker()`                    | `getSessionWPMTracker(sessionId)`           |
| `shouldInjectCatchphrase()` (3 args) | `shouldInjectCatchphrase(sessionId, ...)`   |

### Unified Module Replacements

| Deprecated                 | Use Instead                                          |
| -------------------------- | ---------------------------------------------------- |
| `tagTextWithSsml()`        | `tagTextWithSsmlPersonaAware()` from `../ssml/`      |
| `BackchannelType`          | `BackchannelCategory` from `persona-phrases.ts`      |
| `LegacyBackchannelContext` | `BackchannelContext` from `backchanneling/types.ts`  |
| `LegacyBackchannelResult`  | `BackchannelDecision` from `backchanneling/types.ts` |

### Naming Convention Updates

| Deprecated                             | Use Instead (Preferred)               |
| -------------------------------------- | ------------------------------------- |
| `removeSessionAudioProsodyAnalyzer()`  | `resetSessionAudioProsodyAnalyzer()`  |
| `removeSessionWPMTracker()`            | `resetSessionWPMTracker()`            |
| `removeSessionBackchannelingSystem()`  | `resetSessionBackchannelingSystem()`  |
| `removeEnhancedBackchannelingEngine()` | `resetEnhancedBackchannelingEngine()` |

### Other Deprecated

| Deprecated                          | Notes                                     |
| ----------------------------------- | ----------------------------------------- |
| `patchCartesiaForPersistentContext` | Use `getCartesiaContextOptions()` instead |
| `isCartesiaPatched()`               | Always returns false, no longer needed    |
| `PersonaAwareTTS.switchAccent()`    | Use `switchToLocalizedAccent()` instead   |

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

## Future Refactoring Opportunities

### 1. Consolidate Backchanneling Systems

There are currently **three** backchanneling implementations:

- `backchanneling.ts` - Original system (5-8 second triggers)
- `enhanced-backchanneling.ts` - Research-backed (3-5 second triggers, context-aware)
- `live-backchanneling/` - Real-time during speech (breath-pause detection)

**Recommendation**: Unify into a single `backchanneling/` module with:

```
backchanneling/
├── types.ts            # Unified types
├── timing-config.ts    # Standard, enhanced, live timing configs
├── phrase-library.ts   # All persona phrases in one place
├── decision-engine.ts  # Unified decision logic with mode parameter
├── session.ts          # Session management
└── index.ts
```

### 2. Consolidate Persona Phrases

Persona-specific phrases are duplicated across:

- `response-naturalness.ts` (ACKNOWLEDGMENT_PREFIXES, THINKING_FILLERS, PERSONA_CATCHPHRASES)
- `enhanced-backchanneling.ts` (BACKCHANNEL_LIBRARY, PERSONA_BACKCHANNEL_STYLE)
- `live-backchanneling/constants.ts` (SOFT_BACKCHANNELS)
- `backchanneling.ts` (inline backchannels)

**Recommendation**: Create `persona-phrases.ts` as single source of truth.

### 3. Naming Conventions (Standardized)

**Preferred naming pattern:**

- `get*Service(sessionId)` or `get*Manager(sessionId)` - Get or create
- `reset*Service(sessionId)` - Reset and remove (preferred naming)

**Backward compatibility:**
Legacy `remove*` functions now have `reset*` aliases:

- `removeSessionAudioProsodyAnalyzer` → `resetSessionAudioProsodyAnalyzer`
- `removeSessionWPMTracker` → `resetSessionWPMTracker`
- `removeSessionBackchannelingSystem` → `resetSessionBackchannelingSystem`
- `removeEnhancedBackchannelingEngine` → `resetEnhancedBackchannelingEngine`

New code should use the `reset*` naming for consistency.

### 4. Type Consolidation

Types are scattered across many files. Consider a `types/` directory:

```
types/
├── prosody.ts      # ProsodyFeatures, VoiceEmotion, etc.
├── backchannel.ts  # All backchannel types
├── listening.ts    # HumanListeningResult, etc.
└── index.ts        # Re-exports all
```
