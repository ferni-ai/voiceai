# Superhuman Trigger Intelligence

> **We believe in making AI human, and the decisions we make will reflect that.**

This module implements the "Better than Human" trigger system that detects emotional signals and contextual cues with superhuman accuracy.

---

## Overview

Traditional chatbots match keywords. The Superhuman Trigger Intelligence system uses **semantic embeddings** to understand the INTENT behind words, catching emotional undertones that humans miss.

### Key Insight

> "I'm fine" + sad voice = trigger `false_fine_detection`
>
> Pattern matching alone would miss this. Semantic matching catches the contradiction.

---

## Architecture (Phase 1: Semantic Core)

```
User Text
     │
     ▼
┌─────────────────────────────────────────────────┐
│              Hybrid Matcher                     │
│                                                 │
│  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   Semantic      │  │    Pattern          │  │
│  │   Matching      │  │    Matching         │  │
│  │                 │  │                     │  │
│  │  • Embeddings   │  │  • Regex patterns   │  │
│  │  • Cosine sim   │  │  • Keyword detect   │  │
│  │  • 0.6 weight   │  │  • 0.4 weight       │  │
│  └────────┬────────┘  └──────────┬──────────┘  │
│           │                      │             │
│           └──────────┬───────────┘             │
│                      ▼                         │
│               Combined Score                   │
│                      │                         │
│           ┌──────────┴──────────┐              │
│           ▼                     ▼              │
│     Best Match            All Matches          │
└─────────────────────────────────────────────────┘
```

---

## Files

### Phase 1: Semantic Core

| File | Purpose |
|------|---------|
| `types.ts` | Type definitions |
| `trigger-embedding-service.ts` | Generate/manage trigger embeddings |
| `semantic-trigger-matcher.ts` | Hybrid semantic + pattern matching |
| `trigger-embedding-cache.ts` | Firestore-backed embedding cache |

### Phase 2: Personal Memory Integration

| File | Purpose |
|------|---------|
| `user-trigger-profile.types.ts` | Profile types (dates, relationships, patterns) |
| `user-trigger-profile-service.ts` | Firestore-backed profile storage |
| `personal-context-integrator.ts` | Generate boosts from personal context |
| `extractors/` | Extract dates, relationships, patterns from text |

### Phase 3: Temporal Intelligence

| File | Purpose |
|------|---------|
| `temporal-pattern-detector.ts` | Day/time/date pattern detection |
| `voice-agent-integration.ts` | Combines Phase 2+3+4 for voice agent |

### Phase 4: Effectiveness Learning

| File | Purpose |
|------|---------|
| `effectiveness-calculator.ts` | Engagement/deflection detection, weighted scoring, feedback loop protection |

### Phase 5: Anticipatory Triggers

| File | Purpose |
|------|---------|
| `anticipatory-signal-learner.ts` | Learn opening phrase patterns, detect anticipatory signals |
| `anticipatory-trigger-engine.ts` | Early trigger firing, response templates, session management |

### Other

| File | Purpose |
|------|---------|
| `index.ts` | Re-exports all modules |

---

## Quick Start

### 1. Initialize for a Persona

```typescript
import { getTriggerEmbeddingService } from './intelligence/triggers/index.js';

const service = getTriggerEmbeddingService();
await service.initializeForPersona({
  personaId: 'ferni',
  triggers: personaBehaviors.proactive_triggers,
  sourceFile: 'emotional-intelligence.json',
  loadedAt: new Date(),
});
```

### 2. Match Triggers

```typescript
import { matchTriggersHybrid } from './intelligence/triggers/index.js';

const result = await matchTriggersHybrid(
  userText,
  triggerContext,
  triggers,
  'ferni',
  { semanticThreshold: 0.65 }
);

if (result.bestMatch) {
  console.log(`Matched: ${result.bestMatch.triggerName}`);
  console.log(`Score: ${result.bestMatch.combinedScore}`);
  console.log(`Strategy: ${result.matchingStrategy}`);
}
```

### 3. Use in Context Builder

```typescript
import { matchTriggersHybrid, recordSemanticMatch } from './intelligence/triggers/index.js';

export const emotionalBuilder: ContextBuilder = {
  name: 'emotional',
  priority: 25,
  category: BuilderCategory.EMOTIONAL,

  build: async (input): Promise<ContextInjection[]> => {
    const triggers = await loadPersonaTriggers(input.persona.id);

    const result = await matchTriggersHybrid(
      input.analysis?.userText || '',
      buildTriggerContext(input),
      triggers,
      input.persona.id
    );

    // Record for analytics
    recordSemanticMatch(result);

    if (result.bestMatch) {
      return [createHintInjection(
        `trigger_${result.bestMatch.triggerName}`,
        result.bestMatch.behavior
      )];
    }

    return [];
  },
};
```

---

## Configuration

### HybridMatchConfig

| Setting | Default | Description |
|---------|---------|-------------|
| `semanticThreshold` | 0.65 | Min cosine similarity for semantic match |
| `patternThreshold` | 0.5 | Min score for pattern match |
| `semanticWeight` | 0.6 | Weight of semantic score in combined |
| `patternWeight` | 0.4 | Weight of pattern score in combined |
| `maxMatches` | 5 | Max triggers to return |
| `enableHybrid` | true | Use hybrid (vs semantic-only) |
| `fallbackToPattern` | true | Fall back if embeddings fail |

### TriggerEmbeddingCacheConfig

| Setting | Default | Description |
|---------|---------|-------------|
| `maxSize` | 1000 | Max embeddings in memory |
| `ttlMs` | 7 days | Time-to-live |
| `persistToFirestore` | true | Store in Firestore |
| `firestoreCollection` | `trigger_embeddings` | Collection name |

---

## Trigger Categories

Triggers are auto-categorized for filtering and analytics:

| Category | Keywords |
|----------|----------|
| `emotional` | distress, grief, sad, worried, anxious |
| `behavioral` | deflect, avoid, minimize, fine, okay |
| `temporal` | late night, 2am, returning, anniversary |
| `domain` | habit, goal, finance, calendar, work |
| `relational` | relationship, friend, family, partner |
| `existential` | meaning, purpose, point, life |
| `growth` | growth, change, progress, different |

---

## Analytics

### Get Semantic Matching Stats

```typescript
import { getSemanticAnalytics } from './intelligence/triggers/index.js';

const stats = getSemanticAnalytics();
console.log(`Hybrid matches: ${stats.totalHybridMatches}`);
console.log(`Avg semantic score: ${stats.averageSemanticScore.toFixed(2)}`);
console.log(`Avg processing: ${stats.averageProcessingMs.toFixed(1)}ms`);
```

### Get Cache Stats

```typescript
import { getTriggerEmbeddingCache } from './intelligence/triggers/index.js';

const cache = getTriggerEmbeddingCache();
const stats = cache.getStats();
console.log(`Memory: ${stats.memorySize}/${stats.maxSize}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## Testing

```bash
# Run trigger tests
pnpm vitest run src/intelligence/triggers/__tests__/

# With verbose output
pnpm vitest run src/intelligence/triggers/__tests__/ --reporter=verbose
```

---

## Voice Agent Integration

Use the voice agent integration module for session lifecycle:

```typescript
import {
  loadUserTriggerContext,
  recordTriggerOutcome,
  saveUserTriggerContext,
  getCombinedTriggerBoost,
} from './intelligence/triggers/index.js';

// 1. On session start
const triggerContext = await loadUserTriggerContext(userId, sessionId);

// 2. When a trigger fires
recordTriggerOutcome(sessionId, triggerName, category, 'engaged');

// 3. When matching triggers, get combined boost
const boost = getCombinedTriggerBoost(sessionId, triggerName, category);
adjustedScore = originalScore * boost.multiplier;

// 4. On session end
await saveUserTriggerContext(sessionId);
```

### Temporal Pattern Detection

Phase 3 detects patterns like:
- **Sunday night anxiety** - user engages more with emotional triggers on Sunday evenings
- **Late night existential mode** - existential triggers work better at 2am
- **Anniversary approach** - emotional sensitivity increases as significant dates approach

```typescript
import { getTemporalAnalytics } from './intelligence/triggers/index.js';

const stats = getTemporalAnalytics();
console.log(`Boosts near dates: ${stats.nearSignificantDateBoosts}`);
console.log(`Most active day: ${stats.byDayOfWeekArray[0].day}`);
```

### Effectiveness Learning (Phase 4)

Phase 4 learns which triggers actually help each user:

```typescript
import {
  detectEngagementSignals,
  detectDeflectionSignals,
  getEffectivenessAnalytics,
} from './intelligence/triggers/index.js';

// Detect signals from user response
const engagementSignals = detectEngagementSignals(
  userResponse,
  averageResponseLength,
  previousTopics,
  currentTopic
);

const deflectionSignals = detectDeflectionSignals(
  userResponse,
  averageResponseLength,
  previousTopic,
  currentTopic,
  sessionEndedWithin // minutes, or null
);

// Get effectiveness analytics
const stats = getEffectivenessAnalytics();
console.log(`Triggers above boost threshold: ${stats.triggersAboveBoostThreshold}`);
console.log(`Triggers below suppression threshold: ${stats.triggersBelowSuppressionThreshold}`);
console.log(`Exploration events: ${stats.explorationEventsTriggered}`);
```

**Key capabilities:**
- **Engagement signals**: `longer_response`, `deeper_topic`, `emotional_expression`, `question_asked`, `gratitude_expressed`, `vulnerability_shared`, `continuation_requested`
- **Deflection signals**: `topic_change`, `short_response`, `minimization`, `deflection_phrase`, `dismissive_tone`, `session_ended`
- **Weighted scoring**: Engagement (50%) + Sentiment shift (30%) + Session impact (20%)
- **Feedback loop protection**: 0.5x-1.5x multiplier bounds, 8% exploration rate
- **Rolling window**: Last 30 days for relevance

### Anticipatory Triggers (Phase 5)

Phase 5 fires triggers BEFORE full expression, creating "Better than Human" anticipation:

```typescript
import {
  processPartialInput,
  checkPendingAnticipation,
  recordAnticipatoryOutcome,
  detectAnticipatorySignals,
  learnFromUtterance,
} from './intelligence/triggers/index.js';

// 1. On each partial transcript update
const result = processPartialInput(
  sessionId,
  partialTranscript,
  profile.anticipatoryIntelligence,
  voiceProsody,  // Optional: { cues: VoiceProsodyCue[], overallScore: number }
  currentTopic
);

if (result.shouldFire) {
  // Deliver anticipatory response
  speak(result.verbalResponse);  // e.g., "I'm here."
  showAvatarCue(result.responseTemplate.nonVerbal);  // e.g., lean-in, soften
}

// 2. On pause in user speech
const pendingResult = checkPendingAnticipation(sessionId, pauseDurationMs);
if (pendingResult?.shouldFire) {
  speak(pendingResult.verbalResponse);
}

// 3. After user finishes speaking, record outcome for learning
profile = recordAnticipatoryOutcome(
  profile,
  sessionId,
  result.detection,
  userReaction,  // 'appreciated' | 'continued' | 'ignored' | 'corrected' | 'annoyed'
  'space_creating',
  voiceProsodyScore,
  predictionWasCorrect
);

// 4. Learn from completed utterances
profile = learnFromUtterance(profile, {
  fullUtterance: transcript,
  actualOutcome: detectedOutcome,
  voiceCues: detectedCues,
  sessionId,
  activatedTriggers: [],
});
```

**Key capabilities:**
- **Common phrase detection**: Pre-loaded patterns for vulnerability, distress, celebration, processing, avoidance, request
- **Voice prosody integration**: Tremor, pause patterns, speed/pitch/volume changes boost confidence
- **Signal learning**: Learns user-specific opening phrases over time
- **Safeguards**: Min confidence 0.7, min input length 15 chars, max 3 per session, 2 min cooldown, topic/time blacklists
- **Response templates**: Persona-voiceable space-creating responses with avatar cues

**Anticipated outcome types:**
- `vulnerability` - "So... I was thinking..." + tremor
- `distress` - "I'm worried about..." + voice strain
- `celebration` - "Guess what!" + excited tone
- `processing` - "I've been trying to figure out..."
- `avoidance` - "It's not a big deal..." + minimization
- `request` - "Could you help me with..."

---

## Implementation Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Semantic Core | ✅ Implemented |
| 2 | Personal Memory Integration | ✅ Implemented |
| 3 | Temporal Intelligence | ✅ Implemented |
| 4 | Effectiveness Learning | ✅ Implemented |
| 5 | Anticipatory Triggers | ✅ Implemented |
| 6 | Cross-Domain Synthesis | Planned |

See `docs/plans/SUPERHUMAN-TRIGGER-INTELLIGENCE-PLAN.md` for full roadmap.

---

## Best Practices

### Do

- Initialize embeddings during session warmup
- Use hybrid matching for best accuracy
- Record matches for analytics
- Cache aggressively (triggers change rarely)
- Fall back to pattern matching on embedding failures

### Don't

- Skip caching (embeddings are expensive)
- Use semantic-only (patterns catch edge cases)
- Ignore the `processingTimeMs` metric
- Hardcode thresholds (make them configurable)
- Block on analytics recording

---

*Last updated: December 2024 (Phase 5 complete)*
