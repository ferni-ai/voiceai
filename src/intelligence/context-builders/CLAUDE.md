# Context Builders

> **We believe in making AI human, and the decisions we make will reflect that.**

Context builders are how we make AI emotionally intelligent. They inject the awareness, empathy, and memory that transforms responses from robotic to human. See `../../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## What They Do
Context builders inject guidance into each conversation turn. They analyze the current state (emotion, memory, topic, etc.) and return instructions that shape the agent's response.

## Reference Docs
- Architecture: `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md`
- Examples: See `emotional.ts`, `memory.ts`, `crisis.ts` in this directory

## Quick Start

### 1. Create the Builder
```typescript
// my-builder.ts
import {
  registerContextBuilder,
  createContextInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection
} from './registry.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:my-builder' });

export const myBuilder: ContextBuilder = {
  name: 'my-builder',
  description: 'What guidance this provides',
  priority: 50,  // 0-100, see priority guide below

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { conversationState, userProfile, sessionServices } = input;

    // Analyze context
    if (!shouldActivate(conversationState)) {
      return [];  // Return empty if nothing to inject
    }

    // Return guidance
    return [
      createContextInjection({
        type: 'guidance',
        priority: 'normal',
        content: 'Specific instruction for the agent...',
        source: 'my-builder',
      }),
    ];
  },
};

// Register on module load
registerContextBuilder(myBuilder);
```

### 2. Export from Index
```typescript
// index.ts
export * from './my-builder.js';
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

## Existing Builders Reference
```
emotional.ts      - Emotion detection & validation
crisis.ts         - Crisis/panic/emergency detection
celebration.ts    - Milestone acknowledgment
memory.ts         - Cross-session memory callbacks
engagement.ts     - Curiosity & conversation depth
discovery.ts      - New user onboarding
personal.ts       - Name usage, personal details
topics.ts         - Topic threading & transitions
humanizing.ts     - Self-correction, humor, naturalness
cognitive.ts      - Persona-specific reasoning style
persona-memory.ts - Persona-specific memories
storytelling.ts   - When to share anecdotes
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
