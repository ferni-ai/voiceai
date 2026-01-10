# Personality Module

> **"Better than human: We notice what they don't notice about themselves."**

The personality module enables **superhuman emotional intelligence** through clean architecture. Personality emerges through behavior, not repetition.

---

## Architecture Level

```
Level 70: personality/         ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

---

## Clean Architecture Overview

```
personality/
├── domain/                    # Pure business logic (NO I/O)
│   ├── model/                 # Entities and Value Objects
│   │   ├── value-objects/     # Immutable domain primitives
│   │   │   ├── relationship-depth.ts
│   │   │   ├── emotional-state.ts
│   │   │   └── anticipated-emotion.ts
│   │   ├── personality-profile.ts  # Aggregate Root
│   │   ├── emotional-pattern.ts
│   │   ├── vulnerability-deposit.ts
│   │   └── growth-milestone.ts
│   ├── services/              # Domain services (pure logic)
│   │   ├── anticipation-engine.ts
│   │   ├── timing-calculator.ts
│   │   └── vulnerability-scorer.ts
│   └── interfaces/            # Ports (abstractions)
│       ├── personality-repository.ts
│       ├── voice-analyzer.ts
│       └── emotion-detector.ts
│
├── application/               # Use cases (orchestration)
│   ├── build-personality-context.ts
│   └── record-emotional-moment.ts
│
├── infrastructure/            # Implementations (I/O)
│   ├── firestore-personality-repository.ts
│   └── in-memory-personality-repository.ts
│
├── v2/                        # Public API
│   └── index.ts               # Main exports + factory functions
│
└── [legacy files]             # Original implementation (to be migrated)
```

---

## Quick Start

```typescript
import { createPersonalityService } from './personality/v2';

// Create service (uses Firestore by default)
const personality = createPersonalityService();

// Build context for LLM injection
const context = await personality.buildContext({
  userId: 'user_123',
  personaId: 'ferni',
  currentMessage: "I've been feeling overwhelmed lately",
  topics: ['stress', 'work'],
});

// Inject into LLM prompt
const prompt = basePrompt + context.formattedContext;

// Record emotional moment
await personality.recordMoment({
  userId: 'user_123',
  personaId: 'ferni',
  message: "I've been feeling overwhelmed lately",
  topics: ['stress', 'work'],
});
```

---

## Superhuman Capabilities

### 1. 🔮 Anticipation Engine

**Predicts emotions BEFORE they're expressed.**

```typescript
const anticipated = anticipationEngine.anticipateFromContext({
  partialTranscript: "I've been thinking about...",
  voiceTone: 'falling',
}, patterns);

if (anticipated?.shouldPrepareEmpathy) {
  // Show contemplative micro-expression NOW
}
```

**Human limitation:** Wait for the full message before responding.
**Superhuman:** Understand them before they finish.

### 2. ⏱️ Timing Calculator

**Knows when to share vs. listen.**

```typescript
const timing = timingCalculator.analyzeMessageTiming(message);

if (!timing.personalMomentAppropriate) {
  // Just listen - they need to be heard
}
```

| Intent | Response |
|--------|----------|
| `needs_to_be_heard` | Deep listening |
| `just_venting` | Validation |
| `vulnerable_share` | Hold space |
| `seeking_perspective` | Can share story |

### 3. 💝 Vulnerability Scorer

**Detects and honors vulnerable shares.**

```typescript
const vuln = vulnerabilityScorer.detectVulnerability(message);

if (vuln.isFirstTime) {
  // This is sacred - honor the courage it took
  console.log(vuln.suggestedAcknowledgment);
}
```

**Levels:** `surface` → `personal` → `vulnerable` → `sacred`

### 4. 🌱 Growth Tracking

**Remembers where they started, celebrates progress.**

```typescript
// "Remember a few months ago when you couldn't even talk about this?
//  Look at you now. That's real growth."

if (milestone.isReadyToCelebrate) {
  console.log(milestone.celebrationMessage);
}
```

### 5. 🔍 Pattern Detection

**Notices patterns they miss about themselves.**

```typescript
// "I've noticed you seem more stressed when work comes up lately"
// "Every Sunday evening you seem to get anxious"

if (pattern.isReadyToSurface) {
  console.log(pattern.insightToShare);
}
```

---

## Domain Model

### Value Objects (Immutable)

| Value Object | Purpose |
|--------------|---------|
| `RelationshipDepth` | Trust velocity, emotional safety, shared history |
| `EmotionalState` | Current emotion with trajectory and contradictions |
| `AnticipatedEmotion` | Predicted emotion from partial input |

### Entities (With Identity)

| Entity | Purpose |
|--------|---------|
| `PersonalityProfile` | Aggregate root - all personality data |
| `EmotionalPattern` | Detected topic→emotion or temporal patterns |
| `VulnerabilityDeposit` | Record of vulnerable share for callbacks |
| `GrowthMilestone` | Baseline→progress tracking for celebration |

### RelationshipDepth (Value Object)

Goes beyond simple stages:

```typescript
const depth = RelationshipDepth.create({
  vulnerabilityScore: 45,    // 0-100
  trustVelocity: 2.5,        // -10 to +10
  sharedHistoryDensity: 30,  // 0-100
  emotionalSafetyIndex: 65,  // 0-100
});

depth.stage;           // 'friend'
depth.isTrustGrowing;  // true
depth.feelsSafe;       // true
depth.canHandle('deep'); // true (considers multiple factors)
```

### EmotionalState (Value Object)

Captures nuance humans miss:

```typescript
const state = EmotionalState.create({
  primary: 'fear',
  granular: 'anxious',
  intensity: 0.7,
  confidence: 0.85,
});

// Both/and emotions (SUPERHUMAN)
const withContradiction = state.withContradictingEmotion('joy', 'excited');
// "anxious but also excited" - we validate both
```

---

## Application Use Cases

### BuildPersonalityContext

Orchestrates building complete context for LLM injection:

```typescript
const context = await buildContext.execute({
  userId: 'user_123',
  personaId: 'ferni',
  currentMessage: "I've been feeling overwhelmed",
  partialTranscript: "I've been...",
  voiceFeatures: { ... },
  topics: ['stress'],
});

context.formattedContext;      // String for LLM injection
context.anticipatedEmotion;    // Predicted emotion
context.timing;                // Timing analysis
context.pendingVulnerabilities; // Callbacks needed
context.surfaceablePatterns;   // Patterns ready to share
context.celebratableMilestones; // Growth to celebrate
```

### RecordEmotionalMoment

Records emotional data and updates profile:

```typescript
const result = await recordMoment.execute({
  userId: 'user_123',
  personaId: 'ferni',
  message: "I've never told anyone this, but...",
  topics: ['vulnerability'],
});

result.vulnerabilityDetected;    // true
result.isFirstTimeVulnerability; // true
result.domainEvents;             // Events to publish
```

---

## Infrastructure

### Firestore Repository

Default persistence implementation:

```typescript
const repo = getFirestorePersonalityRepository();

// Collections:
// bogle_users/{userId}/personality_profiles/{personaId}
// bogle_users/{userId}/emotional_patterns/{patternId}
// bogle_users/{userId}/vulnerability_deposits/{depositId}
// bogle_users/{userId}/growth_milestones/{milestoneId}
```

### In-Memory Repository

For testing:

```typescript
const { service, repository } = createTestPersonalityService();

// Run tests...

repository.clear(); // Clean up
```

### Adapters (Bridging with Existing Code)

```typescript
import {
  getVoiceAnalyzerAdapter,
  getEmotionDetectorAdapter,
} from './personality/v2';

// Create service with adapters
const service = createPersonalityService({
  repository: getFirestorePersonalityRepository(),
  voiceAnalyzer: getVoiceAnalyzerAdapter(),
  emotionDetector: getEmotionDetectorAdapter(),
});
```

### Legacy Bridge

For gradual migration from old code:

```typescript
import {
  analyzeMessageTiming,    // Was: timing-intelligence.ts
  detectVulnerability,     // Was: scattered across files
  anticipateEmotion,       // NEW: superhuman capability
  buildPersonalityContext, // Full v2 context builder
} from './personality/v2';

// Legacy-compatible API
const timing = analyzeMessageTiming(message);
const vuln = detectVulnerability(message);
```

### Context Builder Integration

The v2 system integrates with the context builder infrastructure:

```typescript
// Auto-registered on import (added to BUILDER_MANIFEST in loader.ts)
// The personality-v2 builder automatically runs for every turn, injecting:
// - Relationship stage and trust health
// - Timing guidance
// - Anticipated emotions
// - Vulnerability callbacks
// - Pattern insights
// - Growth celebrations

// Manual registration (if needed):
import { registerPersonalityV2Builder } from './intelligence/context-builders/personality-v2';
registerPersonalityV2Builder();
```

### Profile Caching

The v2 system includes automatic profile caching to reduce Firestore reads:

```typescript
// Caching is automatic - no configuration needed
// TTL: 30 seconds (profiles expire and reload after 30s)
// Max entries: 100 profiles (LRU pruning)

// Cache is invalidated when profile is modified:
await service.recordMoment({ ... }); // Automatically invalidates cache

// For testing, you can clear the cache:
import { clearProfileCache } from './personality/application/build-personality-context';
clearProfileCache();
```

---

## Testing

```bash
# Run personality tests
pnpm vitest run src/personality/

# Test with in-memory repository
const { service, repository } = createTestPersonalityService();
```

---

## Migration from Legacy

The v2 implementation coexists with legacy files:

| Legacy File | v2 Equivalent |
|-------------|---------------|
| `timing-intelligence.ts` | `domain/services/timing-calculator.ts` |
| `emotional-patterns.ts` | `domain/model/emotional-pattern.ts` |
| `growth-tracking.ts` | `domain/model/growth-milestone.ts` |
| `memory-adapter.ts` | `infrastructure/firestore-personality-repository.ts` |

**Migration path:**
1. Use v2 API for new features
2. Gradually migrate consumers to v2
3. Deprecate legacy files

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use v2 API for new features | Add to legacy files |
| Put business logic in domain | Put I/O in domain |
| Use value objects for immutability | Mutate state directly |
| Use interfaces for dependencies | Hardcode implementations |
| Let personality emerge | Force personality traits |
| Honor vulnerability | Rush past vulnerable shares |

---

## Key Concepts

### Personality Emerges Through Behavior

- Each user discovers personality uniquely
- No universal personality traits
- The "smile factor" emerges from callbacks
- Timing matters as much as content

### Better Than Human

| Human Limitation | Superhuman Capability |
|------------------|----------------------|
| Wait for full message | Anticipate from partial |
| Miss subtle patterns | Notice what they don't |
| Forget vulnerable shares | Never forget |
| Take growth for granted | Celebrate every step |
| Try to "fix" contradictions | Validate both/and |

---

## Related Docs

- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - Brand philosophy
- `src/intelligence/CLAUDE.md` - Context builders
- `src/memory/CLAUDE.md` - Memory patterns
- `src/services/superhuman/README.md` - Superhuman services

---

*Last updated: January 2026*
