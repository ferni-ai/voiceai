# Holistic NLU Guide

> Understanding the multi-layer natural language understanding system for semantic tool routing.

## Overview

The Holistic NLU system enhances semantic tool routing by understanding context beyond keywords and patterns. It detects:

- **Relationships** - Who the user is talking about (family, friends, professional)
- **Emotions** - How the user is feeling (stressed, happy, grieving)
- **Time Context** - When something is happening (morning, deadline, holiday)
- **Life Domains** - What area of life (work, health, relationships)
- **Intent Markers** - What the user wants to do (help, decide, plan)
- **Compound Intents** - Multiple intents in one query ("X and Y")

## Architecture

```
User Input: "I'm stressed about calling my mom tomorrow"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                   Semantic Router                        │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Pattern (regex)           weight: 1.2         │
│  Layer 2: Keyword (term matching)   weight: 0.75        │
│  Layer 3: Embedding (similarity)    weight: 0.90        │
│  Layer 4: Context (conversation)    weight: 0.50        │
│  Layer 5: History (user prefs)      weight: 0.30        │
│  Layer 6: HOLISTIC (this system)    weight: 0.85 ◄──────│
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│               Holistic Layer (holistic-layer.ts)        │
├─────────────────────────────────────────────────────────┤
│  1. analyzeHolisticContext(text)                        │
│     → relationship: family_immediate (mom)              │
│     → emotion: stressed                                 │
│     → time: later (tomorrow)                            │
│                                                         │
│  2. processUserTurn(sessionId, text)                    │
│     → emotionalTrajectory: declining                    │
│     → conversationTopics: [family, stress]              │
│                                                         │
│  3. detectMultipleIntents(text)                         │
│     → isCompound: true ("about calling")                │
│     → intents: [concern, action]                        │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Tool Adjustments:
  ✓ telephony_converse: +35% (personal relationship)
  ✗ telephony_call: -30% (personal = converse preferred)
  ✓ wellness_breathing: +25% (stressed emotion)
```

## Key Files

| File | Purpose |
|------|---------|
| `shared-vocabulary.ts` | All vocabulary definitions (relationship, emotion, time, domain, intent) |
| `holistic-layer.ts` | Main integration layer, caching, scoring adjustments |
| `context-enrichment.ts` | Multi-turn conversation tracking, emotional trajectory |
| `multi-intent.ts` | Compound intent detection ("X and Y") |
| `types.ts` | Type definitions including `MatchLayer` and config |
| `matcher.ts` | Score calculation and layer weight combination |

## Vocabularies

### Relationship Vocabulary

| Category | Examples | Context | Sentiment |
|----------|----------|---------|-----------|
| `family_immediate` | mom, dad, kids | family | personal |
| `family_extended` | grandma, cousin, uncle | family | personal |
| `romantic` | wife, husband, partner | romantic | personal |
| `friends` | friend, bestie, roommate | social | personal |
| `professional` | boss, colleague, client | work | professional |
| `services` | doctor, bank, mechanic | service | transactional |
| `group_team` | committee, department, crew | group | collective |
| `community` | congregation, temple, neighborhood | community | collective |
| `social_group` | book club, meetup, alumni | social | collective |

**Usage:** Personal relationships boost conversational tools, transactional relationships prefer simple calls.

### Emotional Vocabulary

| Category | Valence | Urgency | Boosted Domains |
|----------|---------|---------|-----------------|
| `positive` | positive | low | - |
| `stressed` | negative | medium | wellness, self-compassion |
| `sad` | negative | medium | wellness, connection, grief |
| `angry` | negative | medium | communication, relationships |
| `crisis` | crisis | **critical** | crisis, safety |
| `confused` | neutral | low | decisions, wisdom |
| `exhausted` | negative | medium | wellness, habits, capacity-guardian |
| `scared` | negative | medium | wellness, self-compassion, safety |
| `ashamed` | negative | medium | self-compassion, vulnerability |
| `disgusted` | negative | low | communication, boundaries |
| `surprised` | neutral | low | communication |
| `curious` | positive | low | information, learning |
| `bored` | neutral | low | entertainment, creativity |
| `loving` | positive | low | relationships, connection |
| `grieving` | negative | medium | grief, self-compassion |
| `jealous` | negative | low | self-compassion, meaning |
| `anticipating` | positive | low | life-planning, calendar |

**Crisis Detection:** The `crisis` category has highest priority and weight (1.0). Crisis signals immediately boost safety tools and suppress entertainment.

### Time Context Vocabulary

| Category | Urgency | Period | Boosted Domains |
|----------|---------|--------|-----------------|
| `morning` | - | morning | habits, wellness, productivity |
| `evening` | - | evening | wellness, presence, reflection |
| `weekend` | - | weekend | play, creativity, relationships |
| `workday` | - | workday | productivity, calendar, communication |
| `now` | **high** | immediate | - |
| `later` | low | future | - |
| `emergency` | **critical** | immediate | - |
| `deadline` | **high** | deadline | productivity, calendar, tasks |
| `soon` | medium | near_future | - |
| `seasonal` | - | seasonal | life-planning, calendar, relationships |

**Urgency Levels:** `critical` > `high` > `medium` > `low`

### Life Domain Vocabulary

| Category | Domain | Boosted Tool Categories |
|----------|--------|------------------------|
| `work` | work | career, productivity, communication, calendar |
| `health` | health | wellness, habits, information |
| `finance` | finance | finance, research, decisions |
| `relationships` | relationships | relationships, communication, connection |
| `personal_growth` | personal_growth | habits, meaning, learning, life-planning |
| `mental_health` | mental_health | wellness, self-compassion, crisis, trauma |

### Intent Marker Vocabulary

| Category | Intent | Mood | Boosted Domains |
|----------|--------|------|-----------------|
| `help` | help | request | - |
| `decide` | decide | question | decisions, wisdom |
| `plan` | plan | request | life-planning, calendar, productivity |
| `understand` | understand | question | information, wisdom, research |
| `action` | action | command | - |
| `reflect` | reflect | request | wisdom, meaning, self-compassion |

## Multi-Intent Detection

The system detects compound intents using markers:

| Compound Type | Markers | Example |
|---------------|---------|---------|
| `parallel` | and, also, plus | "I'm stressed about work and my relationship" |
| `sequential` | then, after, before | "Call my mom and then check my calendar" |
| `conditional` | if, when, unless | "If I feel better, let's go out" |
| `comparative` | or, versus, compared to | "Should I call or text?" |

**Behavior:** Compound intents suggest multiple tool categories, enabling multi-tool flows.

## Caching

The holistic layer implements LRU caching for performance:

```typescript
import {
  getHolisticCacheStats,
  clearHolisticCache,
  pruneHolisticCache,
} from './semantic-router';

// Check cache performance
const stats = getHolisticCacheStats();
// {
//   holisticContextHits: 42,
//   holisticContextMisses: 15,
//   multiIntentHits: 40,
//   multiIntentMisses: 15,
//   cacheSize: 30
// }

// Cache hit rate
const hitRate = stats.holisticContextHits /
  (stats.holisticContextHits + stats.holisticContextMisses);
// Typically 60-80% within a session

// Clear cache (testing, fresh start)
clearHolisticCache();

// Prune expired entries (>5 min TTL)
pruneHolisticCache();
```

**Cache Parameters:**
- Max size: 100 entries per cache
- TTL: 5 minutes
- Key normalization: lowercase, trimmed, single spaces

## Scoring & Weights

The holistic layer contributes to the final tool score:

```
finalScore = pattern * 1.2 +
             keyword * 0.75 +
             embedding * 0.90 +
             context * 0.50 +
             history * 0.30 +
             holistic * 0.85   ← This layer
```

**Holistic Score Calculation:**
1. Base domain boosts from detected context
2. Relationship-aware routing (personal → conversational)
3. Emotional state routing (stressed → wellness)
4. Crisis override (safety tools boosted, entertainment suppressed)
5. Multi-turn trajectory (conversation enrichment)

## Integration

### Using Holistic Context in Routing Results

The `routeUserInput()` function returns holistic context in the `SemanticRouterResult`:

```typescript
import { routeUserInput } from './semantic-router';
import type { HolisticContextSummary } from './semantic-router/types';

const result = await routeUserInput("I'm stressed about calling my mom", {
  sessionId: 'session-123',
  userId: 'user-456',
});

// HolisticContextSummary is included in the result
const holistic: HolisticContextSummary | undefined = result.holisticContext;

if (holistic) {
  // Relationship detection
  if (holistic.relationshipType === 'family_immediate') {
    // Personal relationship - prefer conversational tools
  }

  // Emotion detection
  if (holistic.emotionType === 'stressed') {
    // User is stressed - boost wellness tools
  }

  // Crisis detection
  if (holistic.isCrisis) {
    // CRITICAL - route to safety tools immediately
  }

  // Urgency level
  if (holistic.urgency === 'critical') {
    // Handle with highest priority
  }

  // Compound intent
  if (holistic.isCompoundIntent) {
    // Multi-intent query - may need multiple tools
  }

  // Domain boosts (Record, not Map)
  const wellnessBoost = holistic.domainBoosts['wellness'];
}
```

### Data Flow Through Turn Processing

The holistic context flows through the entire turn processing pipeline:

```
                    routeUserInput()
                          │
                          ▼
               SemanticRouterResult
           (holisticContext?: HolisticContextSummary)
                          │
                          ▼
           ┌──────────────────────────────┐
           │  turn-processor-integration   │
           │     startSemanticRouting()    │
           └──────────────────────────────┘
                          │
                          ▼
                   TurnRouterResult
           (holisticContext?: HolisticContextSummary)
                          │
                          ▼
           ┌──────────────────────────────┐
           │      applyRoutingResult()     │
           │  Converts to processor types  │
           └──────────────────────────────┘
                          │
                          ▼
               SemanticRoutingResult
           (holisticContext?: HolisticContextSummary)
                          │
                          ▼
           ┌──────────────────────────────┐
           │       TurnProcessorResult     │
           │   (semanticRouting field)     │
           └──────────────────────────────┘
```

### Type Definitions

```typescript
// HolisticContextSummary - Clean DTO for downstream consumers
// Located in: src/tools/semantic-router/types.ts
interface HolisticContextSummary {
  relationshipType?: string;      // family_immediate, friends, professional
  relationshipSentiment?: string; // personal, professional, transactional
  emotionType?: string;           // stressed, happy, crisis, grieving
  emotionValence?: string;        // positive, negative, neutral, crisis
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
  isCrisis: boolean;              // true if sentiment === 'crisis'
  isCompoundIntent: boolean;      // true for multi-intent queries
  domainBoosts: Record<string, number>;  // Note: Record, not Map
}
```

### Importing HolisticContextSummary

```typescript
// From semantic router types
import type { HolisticContextSummary } from './semantic-router/types';

// From integration layer (re-exported)
import type { HolisticContextSummary } from './semantic-router/integration';

// From processors types (for turn processing)
import type { SemanticRoutingResult } from './agents/processors/types';
// SemanticRoutingResult includes holisticContext?: HolisticContextSummary
```

### Using Holistic Context Directly

For lower-level access to the internal `HolisticContext` type:

```typescript
import { analyzeHolisticContext } from './semantic-router';

const context = analyzeHolisticContext("I'm stressed about calling my mom");

// Access detected signals (internal type uses overallUrgency, not urgency)
if (context.relationship?.sentiment === 'personal') {
  // Personal relationship detected
}

if (context.emotion?.valence === 'negative') {
  // Negative emotion detected
}

if (context.sentiment === 'crisis') {
  // CRISIS - handle immediately
}

// Get domain boosts (Map type)
const wellnessBoost = context.domainBoosts.get('wellness');
```

### Running the Full Holistic Layer

```typescript
import { runHolisticLayer } from './semantic-router';

const result = runHolisticLayer(
  inputText,
  sessionId,       // For multi-turn context
  allTools,        // Tool definitions
  scoreMap,        // Existing scores to modify
  timings          // Timing metrics
);

// Result contains:
// - holisticContext: Single-turn vocabulary analysis (HolisticContext internal type)
// - enrichedContext: Multi-turn conversation tracking
// - multiIntent: Compound intent detection
// - toolAdjustments: Boosts and penalties per tool
// - timingMs: Processing time
```

### Crisis Integration with Turn Processor

The turn processor can use `holisticContext.isCrisis` for early crisis handling:

```typescript
// In turn-processor.ts or safety logic
const routingResult = await startSemanticRouting(ctx, userText);

if (routingResult.holisticContext?.isCrisis) {
  // Holistic layer detected crisis before LLM even runs
  // Can trigger immediate safety response
}
```

## Adding New Vocabularies

### Adding an Emotion Category

```typescript
// In shared-vocabulary.ts, add to EMOTIONAL_VOCABULARY:

proud: {
  terms: [
    'proud', 'accomplished', 'successful', 'achieved',
    'nailed it', 'crushed it', 'did it',
  ],
  weight: 0.7,
  valence: 'positive',
  urgency: 'low',
  boostDomains: ['celebration', 'communication', 'relationships'],
},
```

### Adding a Relationship Category

```typescript
// In shared-vocabulary.ts, add to RELATIONSHIP_VOCABULARY:

mentor: {
  terms: [
    'mentor', 'mentee', 'coach', 'trainer',
    'advisor', 'protege', 'apprentice',
  ],
  weight: 0.75,
  context: 'guidance',
  sentiment: 'developmental',
},
```

## Testing

Run holistic NLU tests:

```bash
pnpm vitest run src/tools/semantic-router/__tests__/holistic-nlu.test.ts
```

The test suite covers:
- Relationship detection (9 categories)
- Emotional state detection (17 categories)
- Time context detection (10 categories)
- Life domain detection (6 categories)
- Multi-intent detection (parallel, sequential)
- Tool routing adjustments
- Caching behavior

## Performance

Typical holistic layer timing: **0.3-1.0ms**

| Operation | Typical Time |
|-----------|--------------|
| Vocabulary analysis | 0.2-0.5ms |
| Context enrichment | 0.1-0.3ms |
| Multi-intent detection | 0.1-0.2ms |
| Cache lookup | <0.1ms |

With caching enabled, repeated queries hit the cache and return in <0.1ms.

## Best Practices

1. **Don't bypass holistic layer** - It provides critical safety (crisis detection) and accuracy (relationship-aware routing)

2. **Monitor cache stats** - If hit rate drops below 50%, consider increasing cache size

3. **Test vocabulary additions** - Always add tests when adding new vocabulary categories

4. **Handle crisis explicitly** - `context.sentiment === 'crisis'` should always route to safety tools

5. **Use sessionId** - Multi-turn context significantly improves routing accuracy

## Related Documentation

- `docs/architecture/SEMANTIC-ROUTER.md` - Overall semantic router architecture
- `docs/architecture/TOOL-LOADING-SYSTEM.md` - How tools are loaded and configured
- `src/tools/semantic-router/CLAUDE.md` - Semantic router quick reference
