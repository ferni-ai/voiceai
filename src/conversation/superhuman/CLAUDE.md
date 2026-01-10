# Conversation Superhuman Features

> **Making Ferni feel like a real friend, not just an AI.**

This module implements the conversational patterns that make interactions feel genuinely human: shared history, inside jokes, emotional memory, and relationship rituals.

---

## Philosophy

These features go beyond NLP tricks - they create **authentic relationship artifacts**:

- **Quote Memory**: "Last time you said you were nervous about this..."
- **Inside Jokes**: Shared humor that evolves over time
- **Nicknames**: Natural terms of endearment
- **Rituals**: "Our thing" - patterns unique to this relationship
- **Emotional Forecasting**: Anticipating tough days

---

## Feature Categories

### Relationship Memory

| Feature | File | What It Does |
|---------|------|--------------|
| **Quote Memory** | `quote-memory.ts` | Remember meaningful things user said |
| **Story Continuity** | `story-continuity.ts` | Track people in user's life |
| **Inside Jokes** | `inside-jokes.ts` | Shared humor that evolves |
| **Nicknames** | `nicknames.ts` | Natural naming patterns |
| **Shared Language** | `shared-language.ts` | "Our words" - unique vocabulary |

### Emotional Intelligence

| Feature | File | What It Does |
|---------|------|--------------|
| **Emotional Memory** | `emotional-memory.ts` | Remember emotional patterns |
| **Emotional Forecasting** | `emotional-forecasting.ts` | Anticipate difficult days |
| **Vulnerability Matching** | `vulnerability-matching.ts` | Reciprocal depth |
| **Empathetic Reflections** | `empathetic-reflections.ts` | Structured empathy |

### Presence & Connection

| Feature | File | What It Does |
|---------|------|--------------|
| **Presence Mode** | `presence-mode.ts` | "Just be here" moments |
| **Meta-Moments** | `meta-moments.ts` | "This is nice" observations |
| **Conversational Rituals** | `conversational-rituals.ts` | "Our thing" patterns |
| **Anticipatory Presence** | `anticipatory-presence.ts` | Knowing what's needed |

### Natural Speech

| Feature | File | What It Does |
|---------|------|--------------|
| **Natural Speech** | `natural-speech.ts` | Fillers, self-corrections |
| **Linguistic Mirroring** | `linguistic-mirroring.ts` | Match user's style |
| **Evolving Jokes** | `evolving-jokes.ts` | Humor that grows |

---

## Architecture

```
src/conversation/superhuman/
├── index.ts                    # Unified exports + cleanup functions
├── types.ts                    # Shared type definitions
├── orchestrator.ts             # BetterThanHumanOrchestrator
├── content-loader.ts           # Load behavior configs
├── analytics.ts                # Usage tracking
├── analytics-persistence.ts    # Persist analytics
│
├── quote-memory.ts             # User quotes
├── story-continuity.ts         # People tracking
├── inside-jokes.ts             # Shared humor
├── nicknames.ts                # Naming patterns
├── shared-language.ts          # Unique vocabulary
├── emotional-memory.ts         # Emotional patterns
├── emotional-forecasting.ts    # Anticipating days
├── vulnerability-matching.ts   # Reciprocal depth
├── empathetic-reflections.ts   # Structured empathy
├── presence-mode.ts            # Being present
├── meta-moments.ts             # Relationship observations
├── conversational-rituals.ts   # "Our thing"
├── natural-speech.ts           # Speech patterns
├── linguistic-mirroring.ts     # Style matching
├── anticipatory-presence.ts    # Knowing needs
├── evolving-jokes.ts           # Growing humor
│
└── [additional feature files]
```

---

## Integration Pattern

Use the `BetterThanHumanOrchestrator` for unified access:

```typescript
import {
  getBetterThanHuman,
  clearBetterThanHuman,
} from '../conversation/superhuman/index.js';

// Get or create orchestrator for session
const bth = getBetterThanHuman(userId, sessionId);

// Generate context for prompt
const context = await bth.generateContext({
  userMessage,
  emotionalState,
  turnCount,
});

// Cleanup on session end
clearBetterThanHuman(userId, sessionId);
```

---

## Session Cleanup (Memory Leak Prevention)

**Critical:** Call cleanup on session end to prevent memory leaks:

```typescript
import {
  clearAllSuperhumanEngines,
  clearAllSuperhumanSessionState,
} from '../conversation/superhuman/index.js';

// Per-user/session cleanup
clearAllSuperhumanEngines(userId, sessionId);

// Full shutdown only (clears ALL users)
clearAllSuperhumanSessionState();
```

---

## Feature Usage Patterns

### Quote Memory

```typescript
import { captureQuote, findRelevantQuote } from './quote-memory.js';

// Capture during conversation
const quote = await captureQuote(userId, userMessage, context);

// Find relevant quote for current topic
const relevant = await findRelevantQuote(userId, currentTopic);
if (relevant) {
  // Inject: "Last time you said: '{relevant.text}'"
}
```

### Inside Jokes

```typescript
import { captureJoke, findRelevantJoke } from './inside-jokes.js';

// Capture funny moment
await captureJoke(userId, { text, trigger, createdAt });

// Find joke for callback
const joke = await findRelevantJoke(userId, context);
if (joke) {
  // Reference naturally: "Speaking of {joke.trigger}..."
}
```

### Emotional Forecasting

```typescript
import { generateForecast, shouldMentionForecast } from './emotional-forecasting.js';

// Generate forecast based on patterns
const forecast = await generateForecast(userId, upcomingEvents);

// Check if appropriate to mention
if (shouldMentionForecast(context)) {
  // "Tomorrow might be tough with {forecast.reason}..."
}
```

---

## State Management

Each engine maintains session-scoped state in Maps:

```typescript
// Engine state pattern
const states = new Map<string, EngineState>();

export function getEngine(userId: string): Engine {
  if (!states.has(userId)) {
    states.set(userId, createInitialState());
  }
  return states.get(userId)!;
}

export function clearEngine(userId: string): void {
  states.delete(userId);
}
```

---

## Rules

### Do
- Clear session state on disconnect
- Use userId for state keying
- Keep detection lightweight
- Persist significant moments to Firestore
- Format guidance for natural LLM output

### Don't
- Store state without cleanup functions
- Make synchronous calls to Firestore
- Overuse features (subtlety is key)
- Leak implementation details to user
- Create features that feel "stalker-y"

---

## Testing

```bash
# Run all superhuman conversation tests
pnpm vitest run src/conversation/superhuman/__tests__/

# Run specific feature tests
pnpm vitest run quote-memory
pnpm vitest run inside-jokes

# Watch mode
pnpm vitest src/conversation/superhuman/
```

---

## Related Documentation

- `../CLAUDE.md` - Conversation module overview
- `../../services/superhuman/CLAUDE.md` - Backend services
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - Philosophy
- `../../intelligence/context-builders/superhuman/` - Integration

---

*Last updated: January 2026*
