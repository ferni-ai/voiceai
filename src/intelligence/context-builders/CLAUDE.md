# Context Builders

> **We believe in making AI human, and the decisions we make will reflect that.**

Context builders are how we make AI emotionally intelligent. They inject the awareness, empathy, and memory that transforms responses from robotic to human. See `../../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## What They Do
Context builders inject guidance into each conversation turn. They analyze the current state (emotion, memory, topic, etc.) and return instructions that shape the agent's response.

## Reference Docs
- Architecture: `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md`
- Dynamic Triggers: `docs/architecture/DYNAMIC-TRIGGER-SYSTEM.md` (proactive behavior activation)
- Examples: See `emotional.ts`, `memory.ts`, `crisis.ts` in this directory
- Trigger Utils: `dynamic-trigger-utils.ts` (condition-based trigger matching)

## Quick Start

### 1. Create the Builder
```typescript
// my-builder.ts
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';
import { registerContextBuilder, createStandardInjection } from './index.js';
import { BuilderCategory } from './categories.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:my-builder' });

export const myBuilder: ContextBuilder = {
  name: 'my-builder',
  description: 'What guidance this provides',
  priority: 50,  // 0-100, see priority guide below
  category: BuilderCategory.HUMANIZING, // Required - see categories.ts

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, analysis, userData } = input;

    // Analyze context
    if (!shouldActivate(analysis)) {
      return [];  // Return empty if nothing to inject
    }

    // Return guidance using createStandardInjection
    return [
      createStandardInjection('my_injection', 'Specific instruction for the agent...', {
        category: 'my-category',
      }),
    ];
  },
};

// Register on module load
registerContextBuilder(myBuilder);
```

### 2. Add to Builder Registry
```typescript
// builder-imports.ts - add your import
'my-builder': () => import('./my-builder.js'),

// loader.ts - add to BUILDER_MANIFEST in appropriate category
[BuilderCategory.HUMANIZING]: [
  'humanizing',
  'my-builder', // Add here
],
```

## Priority Guidelines

| Range | Category | Examples |
|-------|----------|----------|
| 0-20 | Critical safety | `crisis.ts` - panic/emergency detection |
| 20-40 | Core context | `memory.ts`, `emotional.ts` |
| 40-60 | Enhancement | `engagement.ts`, `topics.ts` |
| 60-80 | Personalization | `persona-memory.ts`, `cognitive.ts` |
| 80-100 | Polish | `humanizing.ts`, `celebration.ts` |

Lower priority = runs first. Higher priority = runs later (can override earlier).

## Injection Types
```typescript
type InjectionType =
  | 'guidance'      // Behavioral instruction
  | 'context'       // Background information
  | 'constraint'    // Hard rule/limitation
  | 'suggestion';   // Soft recommendation
```

## Injection Priority
```typescript
type InjectionPriority =
  | 'critical'   // Must follow (safety)
  | 'high'       // Should follow
  | 'normal'     // Default
  | 'low';       // Nice to have
```

## Rules

### Do
- Return empty array if nothing to inject (not null)
- Keep injections concise (1-2 sentences)
- Use specific, actionable language
- Log when builder activates (debug level)
- Test with various conversation states

### Don't
- Return too many injections (causes prompt bloat)
- Skip priority (causes ordering issues)
- Forget to register (builder won't run)
- Make injections vague ("be nice")
- Duplicate logic from other builders

## Builder Categories

Builders are organized by category and loaded in priority order. See `loader.ts` for the full manifest.

| Category | Examples | Purpose |
|----------|----------|---------|
| SAFETY | `crisis.ts`, `wellbeing-context.ts` | Must run first, can override everything |
| EMOTIONAL | `emotional.ts`, `celebration.ts` | Core emotion handling |
| VOICE | `voice-emotion.ts`, `human-listening.ts` | Voice emotion analysis |
| MEMORY | `memory.ts`, `proactive-memory.ts` | Cross-session persistence |
| PERSONA | `persona-identity.ts`, `human-personality.ts` | Character and identity |
| COACHING | `coaching-context.ts`, `therapeutic-frameworks.ts` | Life coaching |
| COGNITIVE | `awareness.ts`, `cognitive-distortions.ts` | Pattern recognition |
| ENGAGEMENT | `engagement.ts`, `game-context.ts` | User engagement |
| TEAM | `team-availability.ts`, `handoff.ts` | Multi-persona |
| CONTEXT | `topics.ts`, `session-flow.ts` | Situational awareness |
| EXTERNAL | `biometrics.ts`, `world-awareness.ts` | External data |
| HUMANIZING | `humanizing.ts`, `tool-humanization.ts` | Natural speech |
| LEARNING | `community-learning.ts`, `wisdom-synthesis.ts` | Collective intelligence |

## Cross-Persona Intelligence Builders

These specialized builders provide deep insights when entering a persona:

| Builder | Persona | Purpose |
|---------|---------|---------|
| `peter-research-insights.ts` | Peter | Deep research briefings, cross-team data |
| `maya-coaching-insights.ts` | Maya | Habit coaching context, Four Tendencies |
| `jordan-milestone-insights.ts` | Jordan | Milestone planning, life stage intelligence |
| `alex-communication-insights.ts` | Alex | Communication coaching, calendar density |
| `nayan-wisdom-insights.ts` | Nayan | Life wisdom synthesis, values alignment |
| `ferni-coordinator-intelligence.ts` | Ferni | Smart handoff suggestions |

### Key Files

```
shared-types.ts              - Common interfaces (MoodInsights, MemoryInsights, etc.)
superhuman-integration.ts    - Bridges superhuman services to persona builders
```

### Using Superhuman Services

```typescript
import { getSuperhuman } from './superhuman-integration.js';

// In your builder
const superhuman = await getSuperhuman(userId, 'peter');
if (superhuman) {
  injections.push(
    createStandardInjection('superhuman_context', superhuman, { category: 'superhuman' })
  );
}
```

### Cross-Team Data Pattern

```typescript
// Fetch data from other personas' domains
const [habitData, goalData, calendarData] = await Promise.all([
  getHabitDataForPeter(userId),      // Maya's domain
  getGoalDataForPeter(userId),        // Jordan's domain
  getCalendarDataForPeter(userId),    // Alex's domain
]);
```

### Full Documentation

See `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md` for complete architecture docs.

---

## Existing Builders Reference
```
# SAFETY
crisis.ts               - Crisis/panic/emergency detection
wellbeing-context.ts    - Wellbeing signals and support

# EMOTIONAL
emotional.ts            - Emotion detection & validation
celebration.ts          - Milestone acknowledgment

# MEMORY
memory.ts               - Cross-session memory callbacks
proactive-memory.ts     - Proactive memory surfacing

# PERSONA
persona-identity.ts     - Core persona identity
human-personality.ts    - Semantic matching, callbacks
peter-research-insights.ts   - Peter's deep research briefings
maya-coaching-insights.ts    - Maya's habit coaching context
jordan-milestone-insights.ts - Jordan's milestone planning
alex-communication-insights.ts - Alex's communication coaching
nayan-wisdom-insights.ts     - Nayan's life wisdom synthesis
ferni-coordinator-intelligence.ts - Ferni's handoff suggestions

# HUMANIZING
humanizing.ts           - Self-correction, humor, naturalness
tool-humanization.ts    - Natural tool usage framing

# See loader.ts for complete list of 90+ builders
```

## Testing
```typescript
// src/tests/context-builders/my-builder.test.ts
import { describe, it, expect } from 'vitest';
import { myBuilder } from '../../intelligence/context-builders/my-builder.js';

describe('myBuilder', () => {
  it('should return injection when condition met', async () => {
    const input = createMockInput({ /* condition */ });
    const result = await myBuilder.build(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('expected guidance');
  });

  it('should return empty array when condition not met', async () => {
    const input = createMockInput({ /* no condition */ });
    const result = await myBuilder.build(input);
    expect(result).toHaveLength(0);
  });
});
```
