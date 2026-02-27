# Speech Module (`src/speech/`)

> "We believe in making AI human, and the decisions we make will reflect that."

The speech module (~90K lines across 312+ files) provides voice-based capabilities that make Ferni feel truly human. It handles everything from SSML generation to emotion detection from voice prosody.

## Production-Ready Status

This module is **production-ready** with:

- Full session-scoped service management (29+ services)
- 24 test files in `__tests__/`
- Memory-safe cleanup via `session-cleanup.ts`
- Optimized FFT with iterative Cooley-Tukey algorithm
- Tunable detection thresholds via exported constants
- 48+ subdirectories including `adaptive-ssml/` (50 files), `tts-gateway/` (17 files)
- DDD bounded context organization (Feb 2026): 32 root files organized into 7 BCs with re-export shims

## 🎭 Speech Orchestrator (NEW - Recommended Entry Point)

The **SpeechOrchestrator** is the unified coordination layer for all speech humanization:

```typescript
import { getOrchestrator } from './orchestrator/index.js';

// Initialize once per session
const orchestrator = getOrchestrator(sessionId, 'ferni');
await orchestrator.initialize();

// Humanize LLM responses
const result = await orchestrator.humanize(text, {
  topicWeight: 'medium',
  userEmotion,
});
console.log(result.ssml); // SSML-tagged response

// Analyze user speech
const analysis = await orchestrator.analyzeFull({ text: userText });
if (analysis.agentGuidance.shouldSlowDown) {
  // Adjust pacing
}

// Get backchanneling decisions
const backchannel = orchestrator.getBackchannel({
  sessionId, personaId, userSpeechDuration, ...
});

// Anticipate during user speech (call DURING speech, not after)
const anticipated = orchestrator.anticipate({
  sessionId,
  partialTranscript,
});
```

**Benefits:**

- Single API to learn
- Correct humanization ordering guaranteed
- Built-in feedback coordination
- Session lifecycle management

## 📊 Speech Config (Centralized Constants)

All magic numbers are now in `config/speech-config.ts`:

```typescript
import {
  BACKCHANNELING_CONFIG,
  TURN_PREDICTION_CONFIG,
  EMOTION_DETECTION_CONFIG,
  HUMANIZATION_CONFIG,
} from './config/index.js';

// Easy tuning for A/B testing
const timing = BACKCHANNELING_CONFIG.enhanced;
console.log(timing.minSpeechDuration); // 3000ms
```

## 🎤 Persona Voice Loader (Dynamic Bundle Loading)

Voice data (backchannels, catchphrases, expressions) is loaded dynamically from persona bundles:

```typescript
import {
  loadPersonaVoiceData,
  getBackchannelSync,
  getSilenceFillerSync,
} from './persona-voice-loader.js';

// Preload on session start
await loadPersonaVoiceData('ferni');

// Sync access (uses cache)
const backchannel = getBackchannelSync('ferni', 'empathetic');
const filler = getSilenceFillerSync('ferni', 5000); // 5s silence

// Data comes from persona bundles:
// src/personas/bundles/{persona}/content/behaviors/backchannels.json
// src/personas/bundles/{persona}/content/behaviors/catchphrases.json
// src/personas/bundles/{persona}/content/voice/expressions.json
```

This replaces hardcoded data in `persona-phrases.ts` with dynamic loading from
persona bundles, following clean architecture principles.

## 🔮 Unified Anticipation Pipeline (NEW!)

Combines intent prediction and emotional prosody anticipation for responsive agents:

```typescript
import { getAnticipationPipeline, resetAnticipationPipeline } from './anticipation/index.js';

// Get pipeline for session
const pipeline = getAnticipationPipeline(sessionId);

// Process DURING user speech (not after)
const result = pipeline.process({
  sessionId,
  partialTranscript: 'I just got promoted...',
  isSpeaking: true,
  tone: 'excited',
});

// Check if actionable
if (result?.isActionable) {
  // Intent: 'celebration' | 'emotional_share' | 'question' | etc.
  console.log(result.intent.intent, result.intent.confidence);

  // Emotion: 'rising_excitement' | 'falling_sadness' | etc.
  console.log(result.emotion.trajectory, result.emotion.confidence);

  // Prepared prosody
  const { speedMultiplier, volumeMultiplier, microReactionSsml } = result.prosody;
}

// Get micro-reaction for response start
if (pipeline.shouldUseMicroReaction()) {
  const ssml = pipeline.getLatest()?.prosody.microReactionSsml;
  // Prepend: "<emotion value='excited'/>Oh!<break time='100ms'/>"
}

// Clean up
resetAnticipationPipeline(sessionId);
```

This unifies:

- `response-anticipation/` (intent prediction, templates)
- `sesame-inspired/anticipatory-prosody.ts` (emotional trajectory, micro-reactions)

## Architecture Overview

The speech module contains **312+ .ts files** (~90K lines) across **48+ subdirectories**.

### DDD Bounded Context Organization (Feb 2026)

Root-level files have been organized into bounded context directories. Re-export shims at old paths ensure backward compatibility — all existing imports work unchanged.

```
src/speech/
│
├── # ── DDD Bounded Contexts (NEW Feb 2026) ──
├── audio-processing/             # Audio analysis & signal processing (12 files)
│   ├── breath-detection.ts       # Breath detection algorithms
│   ├── volume-dynamics.ts        # Volume analysis
│   ├── energy-dynamics.ts        # Energy level tracking
│   ├── word-timing-rhythm.ts     # Word timing & rhythm analysis
│   ├── voice-tremor.ts           # Voice tremor detection
│   ├── consonant-smoothing.ts    # Consonant smoothing
│   ├── fft-analyzer.ts           # FFT analysis (shim → fft-analyzer/)
│   ├── filler-analysis.ts        # Filler word analysis
│   ├── fluency-analysis.ts       # Fluency scoring
│   ├── prosody-turn-bridge.ts    # Prosody-turn bridging
│   └── index.ts                  # Barrel exports
├── output-control/               # Speech output management (7 files)
│   ├── cognitive-speech.ts       # Cognitive speech patterns
│   ├── cognitive-speech-integration.ts
│   ├── speech-context.ts         # Speech context state
│   ├── conversational-presence.ts
│   ├── enhanced-turn-prediction.ts
│   ├── authentic-thinking.ts     # Authentic thinking patterns
│   ├── realtime-preemptive-patch.ts
│   └── index.ts                  # Barrel exports
├── voice-quality/                # Emotion & voice quality (4 files)
│   ├── emotion-profiles.ts       # Persona emotion profiles
│   ├── emotion-matching.ts       # Emotion matching algorithms
│   ├── emotional-contagion.ts    # Emotional contagion system
│   ├── music-reactions.ts        # Music-triggered reactions
│   └── index.ts                  # Barrel exports
├── voice-management/             # Persona voice loading (2 files)
│   ├── persona-voice-loader.ts   # Dynamic voice data loading
│   ├── pronunciation-memory.ts   # Pronunciation learning
│   └── index.ts                  # Barrel exports
├── monitoring/                   # Health & monitoring (1 file)
│   ├── tts-monitoring.ts         # TTS monitoring
│   └── index.ts                  # Barrel exports
├── backchanneling-ext/            # Root-level backchannel modules (6 files)
│   ├── backchannel-phrase-selector.ts
│   ├── enhanced-backchanneling.ts
│   ├── llm-backchannel.ts
│   ├── backchanneling.ts
│   ├── multi-signal-laughter.ts
│   ├── concern-detection-pipeline.ts
│   └── index.ts                  # Barrel exports
├── research-enhancements/        # Experimental features
│   └── index.ts                  # Barrel exports
├── session-mgmt/                 # Session lifecycle (4 files)
│   ├── session-cleanup.ts        # Unified session cleanup (CRITICAL)
│   ├── session-debug.ts          # Diagnostic utility
│   ├── session-service.ts        # Session service abstraction
│   ├── feedback-coordinator.ts   # Feedback coordination
│   └── index.ts                  # Barrel exports
│
├── # ── Existing Domains ──
├── orchestrator/                 # Unified coordination layer (3 files)
├── config/                       # Centralized configuration (2 files)
├── anticipation/                 # Unified anticipation pipeline (5 files)
├── pronunciation-memory/         # Pronunciation learning (5 files)
├── audio-prosody/                # Voice emotion detection (9 files)
├── adaptive-ssml/                # Advanced SSML features (50 files) ← LARGEST
├── advanced-humanization/        # Advanced voice humanization (7 files)
├── ambient-reactivity/           # Ambient sound reactions (4 files)
├── backchanneling/               # Unified backchannel engine (5 files)
├── coordination/                 # Speech coordination (12 files)
├── fft-analyzer/                 # FFT audio analysis (9 files)
├── graceful-interrupt/           # Graceful interruption handling (2 files)
├── human-listening-pipeline/     # Human listening orchestration (6 files)
├── humanization/                 # Speech humanization + behavior-loader (split)
│   └── behavior-loader/          # Split from 1504-line god file (4 modules)
│       ├── profile-loader.ts     # Cache, loading, sync accessors
│       ├── behavior-selector.ts  # All select*() functions
│       ├── context-matching.ts   # Injection config, late-night, energy
│       ├── phrases.ts            # Celebrations, catchphrases, anticipation
│       └── index.ts              # Barrel re-exporting all 4 modules
├── live-backchanneling/          # Real-time backchannel (6 files)
├── metrics/                      # Speech observability metrics (1 file)
├── naturalness/                  # Naturalness scoring + ambient/tool-fillers
├── persona-phrases/              # Persona-specific phrases (8 files)
├── response-anticipation/        # Response anticipation (5 files)
├── sesame-inspired/              # Sesame-inspired prosody features (7 files)
├── tts-gateway/                  # TTS gateway orchestration (17 files)
├── tts/                          # TTS utilities + cartesia patches, bulkhead
├── types/                        # Shared type definitions (1 file)
├── voice-biomarkers/             # Voice health biomarkers (4 files)
├── voice-humanization/           # Voice humanization (5 files)
├── voice-manager/                # Session-scoped voice management (6 files)
├── audio-dsp/                    # Audio DSP utilities (3 files)
├── __tests__/                    # Test files (24 files)
│
├── index.ts                      # Main exports
├── session-cleanup.ts            # Unified session cleanup (CRITICAL)
├── session-service.ts            # Session service abstraction
├── session-debug.ts              # Diagnostic utility
├── # ── Re-export shims (32 files, backward-compat) ──
├── breath-detection.ts           # → audio-processing/breath-detection.js
├── volume-dynamics.ts            # → audio-processing/volume-dynamics.js
├── energy-dynamics.ts            # → audio-processing/energy-dynamics.js
├── emotion-matching.ts           # → voice-quality/emotion-matching.js
├── speech-context.ts             # → output-control/speech-context.js
├── cognitive-speech.ts           # → output-control/cognitive-speech.js
├── tts-context.ts                # → tts/tts-context.js
├── persona-voice-loader.ts       # → voice-management/persona-voice-loader.js
├── ... (32 total shims)
└── [~20 remaining root-level infrastructure files]
```

### DDD Migration Status (Feb 2026)

| Domain | Files Moved | Shims Created | New Location |
|--------|-------------|---------------|--------------|
| Audio Processing | 10 | 10 | `audio-processing/` |
| Output Control | 7 | 3 | `output-control/` |
| Voice Quality | 4 | 2 | `voice-quality/` |
| Voice Management | 2 | 2 | `voice-management/` |
| Monitoring | 2 | 2 | `monitoring/` |
| Naturalness | 3 | 1 | `naturalness/` |
| TTS | 4 | 1 | `tts/` |
| **Total** | **32** | **~21** | |

**God file split**: `humanization/behavior-loader.ts` (1504 lines) → 4 focused modules in `humanization/behavior-loader/` (profile-loader, behavior-selector, context-matching, phrases)

**Import from new paths for new code.** Old paths work via shims but canonical locations are in the BC directories.

### Key Root-Level Files (Not Shims)

| Category     | Files                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| **Barrel**   | `index.ts` (main exports)                                                    |
| **Pipeline** | `human-listening-pipeline.ts`, `response-anticipation.ts`                    |
| **Other**    | `advanced-humanization.ts`, `persona-phrases.ts`, `adaptive-ssml.ts`         |
| **Shims**    | ~42 re-export shims pointing to BC canonical locations                        |

## SSML Architecture

### Canonical SSML Source: `src/ssml/`

The **canonical source** for all SSML functionality is `src/ssml/`. The `ssml-tagger/` subdirectory has been removed.

```
src/ssml/                    ← CANONICAL SSML SOURCE
    ↑
    │ imports
    │
src/speech/                  ← Voice/audio processing
├── adaptive-ssml/           ← Advanced SSML features (50 files, uses src/ssml/)
└── ...
```

### Import Guidelines

```typescript
// ✅ CORRECT - Import from canonical ssml module
import {
  tagTextWithSsmlPersonaAware,
  sanitizeSsml,
  detectEmotion,
  FINANCIAL_PRONUNCIATIONS,
  CARTESIA_EMOTIONS,
} from '../ssml/index.js';

// ⚠️ ALSO OK - Import through speech module (re-exports canonical)
import { tagTextWithSsmlPersonaAware, sanitizeSsml } from '../speech/index.js';
```

### Character Speech Traits

Character-specific speech patterns are in persona bundles:

```typescript
import {
  applyPeterJohnSpeechTraits,
  addCatchphraseEmphasis,
  addWisdomCadence,
  PETER_JOHN_SPEECH_CONFIG,
} from '../personas/bundles/peter-john/speech-traits.js';
```

See `src/ssml/CLAUDE.md` for complete SSML module documentation.

---

## TTS Provider (Sonata)

After the Sonata migration (Feb 2026), all TTS goes through Sonata (pocket-voice: Kyutai DSM 1.6B on Metal GPU via NAPI).

### Key Files

- NAPI addon: `apps/sonata/`
- TS provider: `src/speech/tts-gateway/providers/sonata.ts`
- STT adapter: `src/speech/providers/sonata-stt-adapter.ts`
- Factory: `src/speech/tts-gateway/providers/index.ts` → always returns Sonata

### Note on Cartesia references

`cartesia-expressiveness.ts` and `cartesia-context-patch.ts` are **domain utilities** (emotion mapping, prosody continuity), not TTS providers. They are used across the speech pipeline and should NOT be deleted.

`CARTESIA_API_KEY` is still needed for the Cartesia REST API (voice cloning, localization, outbound calls).

---

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

These functions are deprecated and will be removed according to the timeline below.

### 📅 Deprecation Timeline

| API Category                | Status        | Migration Guide                       |
| --------------------------- | ------------- | ------------------------------------- |
| **ssml-tagger/** module     | ✅ Removed    | Migrate to `src/ssml/`                |
| **jack-bogle.ts**           | ✅ Removed    | Use persona bundles                   |
| **Legacy global managers**  | ⚠️ Deprecated | Use session-scoped APIs               |
| **remove\* naming**         | ⚠️ Deprecated | Use `reset*` naming                   |
| **ACKNOWLEDGMENT_PREFIXES** | ⚠️ Deprecated | LLM generates naturally               |
| **getThinkingFiller()**     | ⚠️ Deprecated | Use `getContextAwareThinkingFiller()` |

---

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

### Naming Convention Updates (COMPLETED)

The `remove*` naming has been replaced with `reset*`:

- `resetSessionAudioProsodyAnalyzer()`
- `resetSessionWPMTracker()`
- `resetSessionBackchannelingSystem()`
- `resetEnhancedBackchannelingEngine()`

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

## Recent Improvements

### 1. ✅ Unified Backchanneling with Adaptive Mode

The backchanneling systems have been consolidated into `backchanneling/`:

```typescript
import { getBackchannelEngine } from './backchanneling/index.js';

// Standard mode: Basic verbal nods (5-8s triggers)
const standard = getBackchannelEngine(sessionId, 'standard');

// Enhanced mode: Context-aware, research-backed (3-5s triggers)
const enhanced = getBackchannelEngine(sessionId, 'enhanced');

// Live mode: Real-time during speech (breath-pause detection)
const live = getBackchannelEngine(sessionId, 'live');

// NEW: Adaptive mode - automatically switches between modes
const adaptive = getBackchannelEngine(sessionId, 'adaptive');

// Adaptive mode switches based on:
// - Early conversation → standard (less intrusive)
// - Heavy topics → enhanced (more thoughtful)
// - High emotional intensity → live (immediate support)
// - Breath pause available → live (natural timing)
```

### 2. ✅ Type Guards & Complete Type Barrel

Type guards are now available for runtime validation:

```typescript
import {
  isProsodyFeatures,
  isVoiceEmotionResult,
  isBackchannelContext,
  isHumanListeningResult,
  validateProsodyFeatures,
  validateVoiceEmotionResult,
} from './types/index.js';

// Runtime validation
if (isProsodyFeatures(data)) {
  // TypeScript knows data is ProsodyFeatures
}

// Validation with null return
const prosody = validateProsodyFeatures(untrustedData);
if (prosody) {
  // Safe to use
}
```

### 3. ✅ Dynamic Speed Control

Real-time speech speed adjustment based on context:

```typescript
import {
  calculateDynamicSpeed,
  applyDynamicSpeedSsml,
} from './adaptive-ssml/dynamic-speed-control.js';

const speedResult = calculateDynamicSpeed({
  userEngagement: 0.8, // High engagement → slightly faster
  contentComplexity: 0.3, // Low complexity → no slowdown needed
  emotionalIntensity: 0.4, // Moderate → slight adjustment
  baseSpeed: 1.0,
  userWPM: 140, // Mirror user's pace
  topicWeight: 'medium',
});

// speedResult.speedMultiplier might be 1.05 (slightly faster)
// speedResult.addExtraPauses = false
// speedResult.reason = "high engagement, mirroring fast pace"

const ssml = applyDynamicSpeedSsml(text, speedResult);
```

### 4. ✅ Real-Time Audio Analyzer

Optimized for streaming audio analysis with lower latency:

```typescript
import {
  getRealTimeAnalyzer,
  type PartialProsodyFeatures,
} from './audio-prosody/real-time-analyzer.js';

const analyzer = getRealTimeAnalyzer(sessionId);

// Process audio chunks as they arrive
function onAudioFrame(samples: Float32Array): void {
  const partial = analyzer.processChunk(samples);

  if (partial) {
    // Real-time features available:
    // - pitchEstimate, pitchConfidence
    // - energyDb, energyVariance
    // - isSpeech, currentSilenceMs
    // - pitchTrend: 'rising' | 'falling' | 'stable'

    if (partial.pitchTrend === 'falling' && partial.currentSilenceMs > 500) {
      // User might be finishing their turn
    }
  }
}

// At end of utterance, get full features
const fullFeatures = analyzer.getFullFeatures();
```

### 5. ✅ Speech Metrics & Observability

Performance and quality metrics collection:

```typescript
import {
  recordLatency,
  recordEmotionConfidence,
  withTiming,
  getSpeechMetricsSnapshot,
} from './metrics/index.js';

// Record latency manually
recordLatency('humanListening.analyze', 45);

// Or use timing wrapper
const result = await withTiming('humanListening.analyze', async () => {
  return await pipeline.analyze(context);
});

// Record quality metrics
recordEmotionConfidence(voiceEmotion.confidence);
recordTurnPredictionAccuracy(wasCorrect);

// Get all metrics
const snapshot = getSpeechMetricsSnapshot();
// {
//   timestamp: 1234567890,
//   uptimeSec: 3600,
//   metrics: {
//     latency: { avgAnalysisLatencyMs: 42, p99LatencyMs: 120, ... },
//     quality: { avgEmotionConfidence: 0.72, highConfidenceRate: 0.85, ... },
//     usage: { activeSessionCount: 5, totalSessionsCreated: 100, ... },
//     operations: { ... }
//   }
// }
```

### 6. ✅ Enhanced Emergency Cleanup

The `emergencySpeechCleanup()` function now properly clears ALL service Maps
and is async to ensure all cleanups complete before returning:

```typescript
import { emergencySpeechCleanup } from './session-cleanup.js';

// Clears ALL state from ALL services (use with caution!)
// NOTE: This is async - always await it!
await emergencySpeechCleanup();
// Logs: "Emergency speech cleanup complete (14/14 services cleared)"
```

### 7. ✅ Comprehensive E2E Test Coverage

New test files:

- `__tests__/e2e-speech-pipeline.test.ts` - Full pipeline integration tests
- `__tests__/emotional-contagion.test.ts` - Emotional continuity tests
- `__tests__/enhanced-turn-prediction.test.ts` - Turn prediction tests
- `__tests__/prosody-turn-bridge.test.ts` - Voice-turn integration tests

Run all speech tests:

```bash
npm test -- --run src/speech/__tests__/
```

### 8. ✅ Module Splitting for Large Files

Files over 500 lines have been split into subdirectories:

| Original File              | New Directory            | Contents                                                    |
| -------------------------- | ------------------------ | ----------------------------------------------------------- |
| `advanced-humanization.ts` | `advanced-humanization/` | emotions, fillers, breath-groups, rhythm, pipeline          |
| `fft-analyzer.ts`          | `fft-analyzer/`          | fft-core, spectral-analysis, environment, laughter, service |
| `response-anticipation.ts` | `response-anticipation/` | types, patterns, prefetch, service                          |

The original files now re-export from subdirectories for backwards compatibility.

### 9. ✅ Session Debug & Monitoring

New diagnostic utility for production monitoring:

```typescript
import {
  getSpeechModuleDebugInfo,
  checkForLeaks,
  logModuleState,
  trackSessionStart,
} from './session-debug.js';

// Get full module state
const info = getSpeechModuleDebugInfo();
// { totalSessions, serviceCounts, metrics, uptimeSeconds }

// Check for memory leaks
const { hasIssues, issues } = checkForLeaks();

// Log current state (for debugging)
logModuleState();
```

### 10. ✅ Additional Type Guards

Runtime validation for more types:

```typescript
import {
  isSpectralAnalysis,
  isAnticipatedResponse,
  isSpeechContext,
  validateBackchannelContext,
  validateHumanListeningResult,
  validateTurnPredictionResult,
} from './types/index.js';
```

### 11. ✅ TUNING.md Documentation

See `TUNING.md` for production calibration:

- Backchanneling timing configurations
- Emotion detection thresholds
- Turn prediction parameters
- Performance tuning guidelines
- Environment-specific settings

## Naming Conventions (Standardized)

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

## 🎭 Alive Voice - Making Agents Come Alive

The `alive-voice` module (`adaptive-ssml/alive-voice.ts`) adds human-like qualities to speech:

### Features

| Feature                     | Description                                       | Example                                              |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| **Emotion Arcs**            | Mid-sentence emotion shifts based on content      | "That's great! `<emotion caring>` But be careful..." |
| **Dynamic Pauses**          | Longer pauses for heavy topics, shorter for light | Heavy: 400ms, Light: 150ms                           |
| **Speed Variation**         | Slow for emphasis, fast for asides                | `<speed 0.88>` for important words                   |
| **Opening Sounds**          | Context-aware micro-reactions                     | "Oh!" for good news, "Hmm..." for questions          |
| **Persona Fingerprints**    | Distinct SSML patterns per persona                | Nayan: 0.85 speed, Ferni: 0.92 speed                 |
| **Future-Proof Nonverbals** | Config-driven nonverbal support                   | Ready for when Sonata adds `[sigh]`                  |
| **Contextual Laughter**     | Smart laugh timing based on conversation mood     | Knows when "haha" feels natural vs awkward           |

### Usage

```typescript
import { makeVoiceAlive, PERSONA_FINGERPRINTS } from './adaptive-ssml/alive-voice.js';

const result = makeVoiceAlive("That's wonderful, but take care of yourself.", {
  personaId: 'ferni',
  topicWeight: 'medium',
  isGoodNews: true,
});

console.log(result.text);
// <emotion value="happy"/><speed ratio="0.92"/>Oh!<break time="80ms"/> That's wonderful, <emotion value="caring"/>but take care of yourself.
console.log(result.appliedFeatures);
// ['persona_fingerprint', 'opening_sound', 'emotion_arcs']
```

### Persona Fingerprints

Each persona has distinct voice characteristics:

| Persona    | Speed | Default Emotion | Special Patterns                          |
| ---------- | ----- | --------------- | ----------------------------------------- |
| **Ferni**  | 0.92  | affectionate    | Slows for "Wyoming", "second chance"      |
| **Peter**  | 0.88  | calm            | Slows for "index fund", "stay the course" |
| **Alex**   | 1.02  | curious         | Speeds up for scheduling words            |
| **Maya**   | 0.98  | happy           | Energizes habit/streak mentions           |
| **Jordan** | 1.05  | excited         | Celebrates milestones, events             |
| **Nayan**  | 0.85  | calm            | Long pauses for wisdom, poetry            |

### Emotion Arc Patterns

Detects content shifts and injects appropriate emotion changes:

- **Positive → Concern**: "That's great, but..." → happy → caring
- **Empathy → Encouragement**: "That's hard, but you've got this" → sympathetic → affectionate
- **Surprise → Curiosity**: "Wow! Tell me more" → surprised → curious
- **Thinking → Realization**: "Hmm... actually..." → contemplative → curious

### Integration

Alive Voice is automatically applied in `tagTextWithSsmlAdaptive()`:

```typescript
// Already integrated in adaptation.ts
export function tagTextWithSsmlAdaptive(
  text: string,
  context: SpeechContext,
  personaId?: string
): string {
  // ... existing tagging ...

  // Alive voice enhancements are automatically applied
  const aliveResult = makeVoiceAlive(tagged, {
    personaId,
    userEmotion: context.userEmotion,
    topicWeight: context.topicWeight,
    // ...
  });

  return aliveResult.text;
}
```

### Future-Proofing Nonverbals

When the TTS provider adds support for new nonverbals, just flip the config:

```typescript
// In alive-voice.ts
export const NONVERBAL_CONFIG = {
  laughter: { supported: true, bracket: '[laughter]', ... },
  sigh: { supported: false, bracket: '[sigh]', fallback: '', ... }, // Flip to true when ready!
};
```

### Contextual Laughter Timing

The `contextual-laughter.ts` module determines when the agent should laugh:

```typescript
import { addContextualLaughter } from './adaptive-ssml/contextual-laughter.js';

const { text, decision } = addContextualLaughter(
  "You're so predictable! Just kidding.",
  {
    personaId: 'ferni',
    turnCount: 5,
    topicWeight: 'light',
    comfortLevel: 0.7,
  },
  sessionId
);

// Result: "You're so predictable! Just kidding <break time="100ms"/>haha<break time="150ms"/>."
```

**When agents WILL laugh:**

- After their own jokes ("Just kidding!", "Don't judge me")
- After playful teasing ("I'm just teasing you!")
- When user just laughed (joining in)
- During light, comfortable moments

**When agents WON'T laugh:**

- During heavy topics (grief, crisis, anxiety)
- When user is distressed
- During supportive responses ("I'm so sorry")
- Too frequently (cooldown per persona)

**Persona Laugh Styles:**

| Persona | Base Probability | Laughs at Own Jokes | Min Turns Between |
| ------- | ---------------- | ------------------- | ----------------- |
| Ferni   | 35%              | Yes                 | 3                 |
| Peter   | 20%              | No (deadpan)        | 5                 |
| Alex    | 40%              | Yes                 | 2                 |
| Maya    | 45%              | Yes                 | 2                 |
| Jordan  | 50%              | Yes                 | 2                 |
| Nayan   | 15%              | No (subtle)         | 6                 |
