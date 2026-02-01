# Memory Intelligence Module

> "Better than Human" memory - remembering what matters, when it matters.

## Overview

The Memory Intelligence system provides superhuman memory capabilities:
- **Perfect recall** with intelligent timing
- **Persona-aware phrasing** in each AI's voice
- **Learning from responses** to improve over time
- **Associative recall** like human memory
- **Graceful forgetting** with protection for important memories

## Architecture

```
Memory Intelligence (src/intelligence/memory-intelligence/)
├── timing/                          # When to surface memories
│   ├── timing-rules.ts              # Blocking/triggering rules
│   ├── receptivity-scorer.ts        # User receptiveness scoring
│   └── timing-engine.ts             # Orchestrates timing decisions
├── phrasing/                        # How to phrase memories
│   ├── templates.ts                 # Phrasing templates by style
│   ├── persona-voice.ts             # Persona-specific voice characteristics
│   └── phrasing-generator.ts        # Generates natural phrases
├── learning/                        # Learn from user responses
│   ├── response-tracker.ts          # Track user responses to memories
│   ├── profile-builder.ts           # Build user preference profiles
│   ├── preference-learner.ts        # Predict optimal timing
│   └── persistence.ts               # Firestore persistence for learning data
├── core.ts                          # Main MemoryIntelligence implementation
├── turn-processor-integration.ts    # Bridge to turn processor
├── types.ts                         # Shared type definitions
├── metrics.ts                       # Observability metrics
├── index.ts                         # Re-exports
└── MIGRATION.md                     # Migration notes
```

## Quick Start

### Per-Turn Integration

```typescript
import {
  getMemoryInjection,
  initMemorySession,
  endMemorySession,
  recordMemoryResponse,
} from './turn-processor-integration.js';

// Session start
await initMemorySession(userId);

// Per turn
const injection = await getMemoryInjection({
  userId,
  sessionId,
  transcript: userMessage,
  personaId: 'ferni',
  turnCount: 5,
  emotionalState: { intensity: 0.4, valence: 0.2 },
});

if (injection) {
  // Add to turn processor injections
  injections.push(injection);
}

// Track response
await recordMemoryResponse(userId, userMessage, memoryIds);

// Session end
await endMemorySession(userId);
```

### Direct Core Access

```typescript
import { getMemoryIntelligenceCore } from './core.js';

const core = getMemoryIntelligenceCore();

const prepared = await core.prepareForTurn({
  userId,
  sessionId,
  turn: {
    userMessage: 'I was thinking about what we discussed last week...',
    turnCount: 8,
    timeSinceLastMemory: 5 * 60 * 1000, // 5 minutes
  },
  persona: { id: 'ferni', name: 'Ferni' },
  userState: { energy: 0.7, cognitiveLoad: 0.3 },
  emotionalState: { intensity: 0.5, vulnerability: 0.4 },
});

if (prepared.shouldSurface) {
  console.log(prepared.formattedContent);
  // Output: "You know, that reminds me of what you said about wanting to
  //          learn Spanish. How's that going?"
}
```

## Key Concepts

### Timing Rules

**Blocking rules** (prevent surfacing):
- Crisis active
- High emotional intensity
- Low user energy
- Recently surfaced (cooldown)
- Shallow conversation
- Insufficient trust
- User previously deflected
- Cognitive overload
- User seems rushed
- Late night sensitivity

**Triggering rules** (encourage surfacing):
- Topic connection (high priority)
- Person with history (high priority)
- Commitment followup (medium)
- Emotional callback (low)

### Phrasing Styles

| Style | Use Case | Example |
|-------|----------|---------|
| warm_recall | General memories | "I remember you mentioned..." |
| gentle_callback | Commitments | "How's that [commitment] going?" |
| curious_connection | Topic links | "That reminds me of..." |
| supportive_reference | Challenges | "You've faced this before..." |
| celebratory | Wins | "This is like when you..." |
| analytical | Research (Peter) | "The data suggests..." |

### Persona Voices

Each persona has distinct characteristics:

| Persona | Warmth | Analytical | Preferred Styles |
|---------|--------|------------|------------------|
| Ferni | 9 | 5 | warm, gentle, supportive |
| Peter | 6 | 9 | analytical, matter_of_fact |
| Maya | 8 | 6 | warm, gentle, supportive |
| Jordan | 7 | 6 | celebratory, curious |
| Alex | 6 | 7 | curious, analytical |
| Nayan | 8 | 7 | warm, supportive, curious |

## Testing

```bash
# Run memory intelligence tests
pnpm vitest run src/intelligence/memory-intelligence/__tests__/

# 33 tests covering:
# - Timing rules (12)
# - Receptivity scoring (6)
# - Phrasing templates (3)
# - Persona voices (3)
# - Phrasing generator (2)
# - Response tracking (5)
# - Profile building (4)
```

## Configuration

```typescript
const config: MemoryIntelligenceConfig = {
  timing: {
    cooldownMinutes: 5,
    maxPerSession: 8,
    minTurnCount: 3,
    minTrustLevel: 0.3,
  },
  phrasing: {
    alternativeCount: 2,
    minConfidence: 0.5,
  },
  learning: {
    minDataPoints: 3,
    decayRate: 0.95,
  },
};
```

## Integration Points

1. **Turn Processor** - `turn-processor-integration.ts` provides clean bridge
2. **Unified Store** - Retrieves memories via `UnifiedStore` interface
3. **Persona System** - Uses persona profiles for voice adaptation
4. **Session Manager** - Tracks session state for timing decisions

## Related Modules

- `../associative-cortex/` - Graph-based memory associations
- `../../memory/lifecycle/` - Decay and consolidation
- `../../tools/memory-aware/` - Memory access in tools
