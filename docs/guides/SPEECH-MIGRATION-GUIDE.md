# Speech Module Migration Guide

This guide helps you migrate from deprecated APIs in the speech module to their modern replacements.

## Quick Migration Reference

| Before | After |
|--------|-------|
| `import { ... } from './ssml-tagger'` | `import { ... } from '../ssml'` |
| `tagTextWithSsml(text)` | `tagTextWithSsmlPersonaAware(text, { personaId })` |
| `getAudioProsodyAnalyzer()` | `getSessionAudioProsodyAnalyzer(sessionId)` |
| `getVoiceManager()` | `getSessionVoiceManager(sessionId)` |
| `removeSession*()` | `resetSession*()` |
| `getThinkingFiller(personaId)` | `getContextAwareThinkingFiller(personaId, options)` |

---

## 1. SSML Module Migration

### Status: ✅ COMPLETED

The `ssml-tagger/` subdirectory has been **removed**. All SSML functionality is now in `src/ssml/`.

### Before (Removed - Will Not Compile!)
```typescript
// ❌ These imports will fail - the module no longer exists
import { 
  tagTextWithSsml, 
  sanitizeSsml,
  FINANCIAL_PRONUNCIATIONS 
} from '../speech/ssml-tagger/index.js';

import { detectEmotion } from '../speech/ssml-tagger/detection.js';
import { EMOTION_KEYWORDS } from '../speech/ssml-tagger/constants.js';
```

### After (Current)
```typescript
import {
  tagTextWithSsmlPersonaAware,
  sanitizeSsml,
  FINANCIAL_PRONUNCIATIONS,
  detectEmotion,
  EMOTION_KEYWORDS,
} from '../ssml/index.js';

// Use with persona context for better results:
const ssml = tagTextWithSsmlPersonaAware(text, {
  personaId: 'ferni',
  humanize: true,
  baseSpeed: 0.95,
});
```

### Jack Bogle Speech Traits

The `jack-bogle.ts` file has been **removed**. Peter John-specific speech traits are now in the persona bundle.

**Before (Removed):**
```typescript
// ❌ This import will fail - the file no longer exists
import { addCatchphraseEmphasis, addWisdomCadence } from '../speech/ssml-tagger/jack-bogle.js';
```

**After:**
```typescript
import {
  addCatchphraseEmphasis,
  addWisdomCadence,
  applyPeterJohnSpeechTraits,
} from '../personas/bundles/peter-john/speech-traits.js';
```

---

## 2. Session-Scoped Service Migration

### Problem
Global singleton services caused cross-session contamination. All services are now session-scoped.

### Before (Deprecated)
```typescript
// Global singletons (dangerous in multi-session environments!)
const analyzer = getAudioProsodyAnalyzer();
const voiceManager = getVoiceManager();
const backchanneling = getBackchannelingSystem();
```

### After (Current)
```typescript
// Session-scoped (safe for production)
const analyzer = getSessionAudioProsodyAnalyzer(sessionId);
const voiceManager = getSessionVoiceManager(sessionId);
const backchanneling = getSessionBackchannelingSystem(sessionId);

// Always clean up when session ends!
cleanupSpeechSession(sessionId, { reason: 'normal' });
```

### Full List of Session-Scoped Migrations

| Deprecated | Session-Scoped Replacement |
|------------|---------------------------|
| `getAudioProsodyAnalyzer()` | `getSessionAudioProsodyAnalyzer(sessionId)` |
| `getBackchannelingSystem()` | `getSessionBackchannelingSystem(sessionId)` |
| `getVoiceManager()` | `getSessionVoiceManager(sessionId)` |
| `resetVoiceManager()` | `resetSessionVoiceManager(sessionId)` |
| `getWPMTracker()` | `getSessionWPMTracker(sessionId)` |
| `shouldInjectCatchphrase(persona, turn, positive)` | `shouldInjectCatchphrase(sessionId, persona, turn, positive)` |

---

## 3. Naming Convention Migration

### Problem
Some functions used `remove*` naming which doesn't clearly indicate the operation.

### Before (Deprecated)
```typescript
removeSessionAudioProsodyAnalyzer(sessionId);
removeSessionWPMTracker(sessionId);
removeSessionBackchannelingSystem(sessionId);
removeEnhancedBackchannelingEngine(sessionId);
```

### After (Preferred)
```typescript
resetSessionAudioProsodyAnalyzer(sessionId);
resetSessionWPMTracker(sessionId);
resetSessionBackchannelingSystem(sessionId);
resetEnhancedBackchannelingEngine(sessionId);
```

> **Note:** The `remove*` functions still work (they're aliases), but prefer `reset*` for new code.

---

## 4. Thinking Filler Migration

### Problem
`getThinkingFiller()` returns static phrases. The new `getContextAwareThinkingFiller()` uses ProcessingIntelligence for context-aware phrases.

### Before (Deprecated)
```typescript
import { getThinkingFiller } from '../speech/persona-phrases.js';

const filler = getThinkingFiller('ferni');
// Returns static phrase like "Hmm..." without context
```

### After (Current)
```typescript
import { getContextAwareThinkingFiller } from '../speech/persona-phrases.js';

const filler = getContextAwareThinkingFiller('ferni', {
  type: 'thinking', // or 'emotional', 'tool_call', 'memory_recall'
  weight: 'medium', // 'light', 'medium', 'heavy'
  emotionalState: { primary: 'curious', intensity: 0.7 },
  hourOfDay: 14,
  relationshipStage: 'established',
});
// Returns context-appropriate phrase
```

---

## 5. Acknowledgment Prefix Migration

### Problem
`ACKNOWLEDGMENT_PREFIXES` and `getAcknowledgmentPrefix()` returned static phrases. The LLM now generates natural acknowledgments from behavioral guidance.

### Before (Deprecated)
```typescript
import { getAcknowledgmentPrefix } from '../speech/persona-phrases.js';

const prefix = getAcknowledgmentPrefix('ferni', 'empathetic');
const response = prefix + generatedResponse;
```

### After (Current)
```typescript
// Don't inject static prefixes!
// The LLM generates natural acknowledgments based on:
// 1. What the user actually said
// 2. The persona's identity and voice
// 3. Behavioral guidance from dynamic-speech-guidance.ts

// If you need a brief pause, use:
import { breakTag } from '../ssml/cartesia.js';
const response = breakTag('150ms') + generatedResponse;
```

---

## 6. Backchanneling Migration

### Problem
Multiple backchanneling implementations existed. They've been unified into the `backchanneling/` module.

### Before (Scattered)
```typescript
// Standard backchanneling
import { getSessionBackchannelingSystem } from '../speech/backchanneling.js';

// Enhanced backchanneling
import { getEnhancedBackchannelingEngine } from '../speech/enhanced-backchanneling.js';

// Live backchanneling
import { getLiveBackchannelingService } from '../speech/live-backchanneling.js';
```

### After (Unified)
```typescript
import { getBackchannelEngine } from '../speech/backchanneling/index.js';

// All modes available through one API:
const standard = getBackchannelEngine(sessionId, 'standard');
const enhanced = getBackchannelEngine(sessionId, 'enhanced');
const live = getBackchannelEngine(sessionId, 'live');
const adaptive = getBackchannelEngine(sessionId, 'adaptive'); // Auto-switches!
```

---

## 7. Using the Speech Orchestrator

For new code, consider using the unified `SpeechOrchestrator`:

```typescript
import { getOrchestrator } from '../speech/orchestrator/index.js';

// Initialize once per session
const orchestrator = getOrchestrator(sessionId, 'ferni');
await orchestrator.initialize();

// Humanize responses (replaces multiple calls)
const result = await orchestrator.humanize(text, {
  topicWeight: 'medium',
  userEmotion,
});

// Analyze user speech
const analysis = await orchestrator.analyzeFull({ text: userText });

// Get backchanneling decisions
const backchannel = orchestrator.getBackchannel(context);

// Anticipate during user speech
const anticipated = orchestrator.anticipate({ partialTranscript });
```

---

## Checklist for Migration

- [ ] Replace `ssml-tagger` imports with `ssml` imports
- [ ] Update `tagTextWithSsml()` to `tagTextWithSsmlPersonaAware()`
- [ ] Convert global service calls to session-scoped
- [ ] Change `remove*` to `reset*` function names
- [ ] Replace `getThinkingFiller()` with `getContextAwareThinkingFiller()`
- [ ] Remove static acknowledgment prefix injection
- [ ] Switch to unified backchanneling API
- [ ] Add `cleanupSpeechSession()` to session teardown
- [ ] Consider using `SpeechOrchestrator` for new code

---

## Need Help?

- **Code examples:** `src/speech/__tests__/` contains comprehensive examples
- **Type definitions:** `src/speech/types/index.ts` has type guards for validation
- **Documentation:** `src/speech/CLAUDE.md` has full API documentation

