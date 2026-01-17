# 🔄 Backchannel & Silence Repetition Audit

> **Date**: December 20, 2025  
> **Issue**: Ferni keeps repeating the same backchannels and silence responses - feels robotic

## Executive Summary

**THE ROOT CAUSE**: There are **11+ overlapping feedback systems**, each with their **own hardcoded phrase pools** that use **`Math.random()`** without history tracking. This means:

1. Same phrases get selected repeatedly within a session
2. No memory of what was just said
3. Dynamic persona bundles exist but **aren't being used**

---

## 🚨 Critical Finding: 11 Overlapping Systems

| # | System | File | Uses Dynamic? | Tracks History? |
|---|--------|------|--------------|-----------------|
| 1 | BackchannelingSystem | `src/speech/backchanneling.ts` | ❌ Hardcoded | ❌ None |
| 2 | ActiveListeningEngine | `src/conversation/active-listening.ts` | ❌ Hardcoded | ⚠️ Last 5 only |
| 3 | HumanTurnIntelligence | `src/agents/voice-agent/human-turn-intelligence.ts` | ❌ Hardcoded | ❌ None |
| 4 | LiveBackchannelingService | `src/speech/live-backchanneling/service.ts` | ❌ Hardcoded | ⚠️ Last 5 only |
| 5 | SoftBackchannels | `src/speech/persona-phrases.ts` | ❌ Hardcoded | ❌ None |
| 6 | AcknowledgmentPrefixes | `src/speech/persona-phrases.ts` | ❌ Hardcoded | ❌ None |
| 7 | SilencePresencePhrases | `src/speech/persona-phrases.ts` | ❌ Hardcoded | ❌ None |
| 8 | ThinkingFillers | `src/speech/persona-phrases.ts` | ❌ Hardcoded | ❌ None |
| 9 | AnticipatoryComfort | `src/speech/persona-phrases.ts` | ❌ Hardcoded | ❌ None |
| 10 | ResponseNaturalness | `src/speech/response-naturalness.ts` | ❌ Hardcoded | ❌ None |
| 11 | PersonaVoiceLoader | `src/speech/persona-voice-loader.ts` | ✅ **Dynamic** | ❌ None |

**Key insight**: System #11 (`persona-voice-loader.ts`) loads from persona bundles dynamically... but almost **nothing uses it**!

---

## 🔍 Phrase Repetition Analysis

### Same phrases appear in MULTIPLE places:

| Phrase | Occurrences | Files |
|--------|-------------|-------|
| "Mm-hmm" | 8+ | backchanneling.ts, active-listening.ts, persona-phrases.ts, human-turn-intelligence.ts, live-backchanneling/constants.ts |
| "Yeah" | 9+ | ALL of the above + response-naturalness.ts |
| "I'm here" | 5+ | persona-phrases.ts (3x), active-listening.ts, backchannels.json |
| "I hear you" | 6+ | persona-phrases.ts (2x), active-listening.ts, backchannels.json, human-turn-intelligence.ts |
| "Mm" | 7+ | All backchannel systems |
| "Take your time" | 4+ | persona-phrases.ts, active-listening.ts, backchannels.json |

### The Math.random() Problem

Every system uses bare `Math.random()` which has NO context:

```typescript
// ❌ CURRENT (in all systems)
const phrases = ['Mm-hmm', 'Yeah', 'Mm'];
return phrases[Math.floor(Math.random() * phrases.length)];

// This can easily return "Mm-hmm" 3 times in a row!
```

---

## 📂 Dynamic Bundles Exist But Aren't Used

The persona bundle `src/personas/bundles/ferni/content/behaviors/backchannels.json` has rich, varied phrases:

```json
{
  "neutral": ["Mmhmm.", "Mm.", "Yeah.", "Okay."],
  "engaged": ["Mm!", "Yeah!", "Oh."],
  "empathetic": ["Mm.", "Yeah...", "I hear you."],
  "celebration": ["Nice!", "That's great!", "Love that.", "That's amazing!"],
  "playful": ["Ha!", "Classic.", "That tracks."],
  "silence_acknowledgment": {
    "brief": ["Take your time.", "No rush."],
    "longer": ["I'm not going anywhere.", "We can just be. That's allowed."]
  }
}
```

And there's a loader: `src/speech/persona-voice-loader.ts` with:
- `getBackchannelSync(personaId, emotionType)`
- `getSilenceFillerSync(personaId, silenceDurationMs)`

**But the main backchannel systems don't call it!**

---

## 🛠️ Fix Plan

### Phase 1: Consolidate to Single Source (PRIORITY)

**Goal**: All phrase selection goes through ONE system that:
1. Loads from persona bundles (not hardcoded)
2. Tracks session history
3. Uses seeded randomness
4. Never repeats within 5 turns

#### 1.1 Create `BackchannelPhraseSelector`

New file: `src/speech/backchannel-phrase-selector.ts`

```typescript
/**
 * Single Source of Truth for Backchannel Phrase Selection
 * 
 * - Loads from persona bundles via persona-voice-loader
 * - Tracks per-session history to prevent repetition
 * - Uses seeded randomness for consistent yet varied selection
 */

import { getBackchannelSync, loadPersonaVoiceData } from './persona-voice-loader.js';
import { seededIndex, seededChance } from '../conversation/utils/random-generator.js';

interface PhraseHistory {
  used: string[];
  lastUsedAt: Map<string, number>;
  turnNumber: number;
}

const sessionHistory = new Map<string, PhraseHistory>();

export function selectBackchannel(
  sessionId: string,
  personaId: string,
  context: {
    emotionType: 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'supportive';
    turnNumber: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
  }
): string {
  const history = getOrCreateHistory(sessionId);
  
  // Load persona-specific phrases (from bundles)
  const phrase = getBackchannelSync(personaId, context.emotionType);
  
  // Check if recently used (within 5 turns)
  const lastUsed = history.lastUsedAt.get(phrase) ?? -10;
  if (context.turnNumber - lastUsed < 5) {
    // Try to get a different one
    const alternatives = getAlternativePhrases(personaId, context.emotionType);
    const fresh = alternatives.filter(p => 
      (context.turnNumber - (history.lastUsedAt.get(p) ?? -10)) >= 5
    );
    
    if (fresh.length > 0) {
      const selected = fresh[seededIndex(`${sessionId}:${context.turnNumber}:bc`, fresh.length)];
      recordPhrase(sessionId, selected, context.turnNumber);
      return selected;
    }
  }
  
  recordPhrase(sessionId, phrase, context.turnNumber);
  return phrase;
}

function recordPhrase(sessionId: string, phrase: string, turnNumber: number): void {
  const history = getOrCreateHistory(sessionId);
  history.used.push(phrase);
  if (history.used.length > 20) history.used.shift();
  history.lastUsedAt.set(phrase, turnNumber);
}
```

#### 1.2 Update BackchannelingSystem to use it

```diff
// src/speech/backchanneling.ts

+ import { selectBackchannel } from './backchannel-phrase-selector.js';

export class BackchannelingSystem {
  getBackchannel(emotion: EmotionResult, topicWeight: TopicWeight, personaId?: string): string {
    let emotionType = this.determineEmotionType(emotion, topicWeight);
    
-   // Old: Use hardcoded arrays with Math.random()
-   const empathyBackchannels = ['Mm-hmm', 'I hear you', ...];
-   return empathyBackchannels[Math.floor(Math.random() * empathyBackchannels.length)];
    
+   // New: Use centralized selector with history tracking
+   return selectBackchannel(this.sessionId, personaId ?? 'ferni', {
+     emotionType,
+     turnNumber: this.turnCount,
+     topicWeight,
+   });
  }
}
```

#### 1.3 Update ActiveListeningEngine

```diff
// src/conversation/active-listening.ts

+ import { selectBackchannel } from '../speech/backchannel-phrase-selector.js';

-const BACKCHANNELS: Record<...> = {
-  acknowledgment: [
-    { verbal: 'Mm-hmm.', ... },
-    { verbal: 'Mm.', ... },
-    ...
-  ],
-  ...
-};

export class ActiveListeningEngine {
  getBackchannel(personaId: string, context: BackchannelContext): Backchannel | null {
+   // Use centralized selector
+   const phrase = selectBackchannel(this.sessionId, personaId, {
+     emotionType: this.mapContextToEmotionType(context),
+     turnNumber: context.turnCount ?? 0,
+     topicWeight: context.topicSeriousness === 'serious' ? 'heavy' : 'light',
+   });
+   
+   return {
+     verbal: phrase,
+     ssml: this.wrapWithSsml(phrase, context),
+     type: this.mapContextToType(context),
+     energy: this.determineEnergy(context),
+   };
  }
}
```

#### 1.4 Update HumanTurnIntelligence

```diff
// src/agents/voice-agent/human-turn-intelligence.ts

+ import { selectBackchannel } from '../../speech/backchannel-phrase-selector.js';

-const BACKCHANNELS = {
-  neutral: ['Mmhmm.', 'Yeah.', 'Okay.', 'Right.'],
-  empathetic: ['I hear you.', 'Yeah.', 'Mmm.', "That's hard."],
-  ...
-};

export function generateBackchannel(context: {...}): string {
- const neutral = ['Mmhmm.', 'Yeah.', 'Okay.', 'Right.'];
- return neutral[Math.floor(Math.random() * neutral.length)];

+ return selectBackchannel(context.sessionId, context.personaId ?? 'ferni', {
+   emotionType: mapEmotionToType(context.emotion),
+   turnNumber: context.turnCount,
+ });
}
```

### Phase 2: Expand Persona Bundles (Variety)

Add more phrases to the bundles for variety:

```json
// src/personas/bundles/ferni/content/behaviors/backchannels.json
{
  "neutral": [
    "Mmhmm.", "Mm.", "Yeah.", "Okay.",
    // ADD:
    "Right.", "Got it.", "Uh-huh.", "Sure.", "Yep.", "Alright."
  ],
  "engaged": [
    "Mm!", "Yeah!", "Oh.",
    // ADD:
    "Ooh.", "Interesting!", "Hm!", "Ah.", "Oh wow."
  ],
  "empathetic": [
    "Mm.", "Yeah...", "I hear you.",
    // ADD:
    "I feel that.", "That's real.", "Of course.", "I can imagine.",
    "That makes sense.", "Yeah, that's hard."
  ],
  // ADD NEW CATEGORIES:
  "thinking_with_user": [
    "Hmm...", "Let me think...", "Good question...", "Interesting..."
  ],
  "gentle_acknowledgment": [
    "Mm.", "Yeah.", "Okay.", "..."
  ],
  "warm_presence": [
    "I'm here.", "I'm with you.", "I'm listening.", "Take your time."
  ]
}
```

### Phase 3: Add Silence-Specific Phrases

Currently silence handling reuses the same phrases. Add dedicated silence phrases:

```json
// src/personas/bundles/ferni/content/behaviors/backchannels.json
{
  "silence_responses": {
    "comfortable_3s": [
      "...",  // Just presence - don't say anything
      null,   // Explicit "say nothing"
      "Mm."   // Very soft acknowledgment
    ],
    "checking_in_5s": [
      "I'm here.",
      "Take your time.",
      "No rush.",
      "Still with you."
    ],
    "extended_8s": [
      "I'm not going anywhere.",
      "We can just be. That's okay.",
      "Sometimes we just need space.",
      "I'm still here when you're ready."
    ],
    "after_heavy_content": [
      "...",  // Silence IS appropriate
      "Mm.",  // Soft presence
      "I'm here."
    ]
  }
}
```

### Phase 4: Fix Feedback Coordinator Integration

The `feedback-coordinator.ts` exists but isn't used everywhere:

```diff
// src/agents/voice-agent/session-state-handler.ts

+ import { canAddFeedback, recordFeedback } from '../../speech/feedback-coordinator.js';

// Before any backchannel:
- if (silenceBackchannel) {
-   session.say(silenceBackchannel.ssml);
- }

+ if (silenceBackchannel && canAddFeedback(sessionId, 'backchannel', userData.turnCount)) {
+   session.say(silenceBackchannel.ssml);
+   recordFeedback(sessionId, 'backchannel');
+ }
```

---

## 📊 Before vs After

### Before (Current State)

```
Turn 1: User talks for 8s → "Mm-hmm" 
Turn 2: User talks for 6s → "Mm-hmm"  ← REPEATED
Turn 3: Silence 4s → "I'm here"
Turn 4: User talks for 10s → "Yeah" then "Mm-hmm" ← REPEATED
Turn 5: Silence 5s → "I'm here"  ← REPEATED
```

**User perception**: "Ferni keeps saying the same things"

### After (With Fixes)

```
Turn 1: User talks for 8s → "Mm-hmm"
Turn 2: User talks for 6s → "Yeah"  ← Different (history check)
Turn 3: Silence 4s → "Take your time"
Turn 4: User talks for 10s → "I hear you" ← Different emotion match
Turn 5: Silence 5s → [silence - null returned] ← Appropriate!
Turn 6: User talks for 7s → "Mm" ← Fresh phrase
```

**User perception**: "Ferni feels present but not robotic"

---

## 🧪 Testing Changes

After implementing, test with:

```bash
# Run backchannel tests
pnpm test -- --run src/speech/__tests__/backchanneling

# Run active listening tests  
pnpm test -- --run src/tests/active-listening.test.ts

# Manual test: Have a 10-minute conversation and log all backchannels
# Should see NO phrase repeated within 5 turns
```

---

## 📋 Implementation Checklist

### Immediate (Critical)

- [ ] Create `src/speech/backchannel-phrase-selector.ts`
- [ ] Add session-scoped history tracking
- [ ] Update `BackchannelingSystem` to use selector
- [ ] Update `ActiveListeningEngine` to use selector
- [ ] Update `generateBackchannel` in human-turn-intelligence
- [ ] Update `LiveBackchannelingService` to use selector

### Short-term (Quality)

- [ ] Expand phrase variety in persona bundles
- [ ] Add silence-specific phrases to bundles
- [ ] Ensure `feedback-coordinator` is used everywhere
- [ ] Add metrics for phrase repetition rate

### Medium-term (Polish)

- [ ] A/B test new backchannel frequency
- [ ] Add persona-specific phrase styles (Peter = energetic, Nayan = measured)
- [ ] Consider user preference learning ("this user likes less backchanneling")

---

## 🗂️ Files to Modify

| File | Change |
|------|--------|
| `src/speech/backchannel-phrase-selector.ts` | **CREATE** - Single source of truth |
| `src/speech/backchanneling.ts` | Use selector instead of hardcoded |
| `src/conversation/active-listening.ts` | Use selector, remove hardcoded BACKCHANNELS |
| `src/agents/voice-agent/human-turn-intelligence.ts` | Use selector, remove BACKCHANNELS const |
| `src/speech/live-backchanneling/service.ts` | Use selector |
| `src/speech/live-backchanneling/constants.ts` | Remove SOFT_BACKCHANNELS (moved to bundles) |
| `src/speech/persona-phrases.ts` | Keep as fallback, mark as legacy |
| `src/personas/bundles/*/content/behaviors/backchannels.json` | Expand phrase variety |

---

## Summary

**The problem isn't the phrase content - it's the architecture.**

- 11 systems each with their own phrases
- No history tracking = same phrase repeats
- Dynamic bundles exist but aren't used
- Math.random() with no context

**The fix**: Single selector → history tracking → dynamic bundles → seeded randomness

