# Context Builder Interactions

> **We believe in making AI human, and the decisions we make will reflect that.**

This document describes how context builders interact and depend on each other.

---

## Overview

The context builder system consists of **70+ modular builders** organized into **13 categories**. Each builder analyzes specific aspects of the conversation and produces context injections that guide the AI's response.

### Key Files

| File            | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `index.ts`      | Main orchestrator, registry, injection helpers |
| `types.ts`      | Canonical type definitions                     |
| `categories.ts` | Builder categories and mapping                 |
| `metrics.ts`    | Performance tracking                           |
| `loader.ts`     | Auto-discovery and loading                     |

---

## Category Load Order

Builders are loaded and execute in category priority order:

```
1. SAFETY      → Crisis detection, wellbeing (runs first, can override)
2. EMOTIONAL   → Emotion detection, validation
3. VOICE       → Voice prosody analysis
4. MEMORY      → Cross-session memory
5. PERSONA     → Character identity
6. COACHING    → Life coaching frameworks
7. COGNITIVE   → Cognitive patterns
8. ENGAGEMENT  → Games, music, stories
9. TEAM        → Multi-persona coordination
10. CONTEXT    → Topics, intent, situational
11. EXTERNAL   → External data (biometrics, weather)
12. HUMANIZING → Natural speech patterns
13. LEARNING   → Collective intelligence
```

---

## Builder Interactions

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ContextBuilderInput                           │
│  - userText          (what user said)                               │
│  - analysis          (emotion, intent, topics, state)               │
│  - services          (session, user profile, search)                │
│  - userData          (turn count, topics, moments)                  │
│  - voiceEmotion      (if available)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────────┐
         │        All Builders Run in Parallel       │
         └──────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ContextInjection[]                            │
│  Sorted by priority: critical > high > standard > hint              │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Interactions

#### 1. Emotional → Crisis

**emotional.ts** calculates `mergedDistress` (text + voice), which **crisis.ts** uses for panic detection.

```typescript
// emotional.ts sets:
analysis.emotion.distressLevel = mergedDistress;

// crisis.ts reads:
const distressLevel = analysis.emotion.distressLevel ?? 0;
if (distressLevel > 0.4 && MARKET_PANIC_PATTERNS.test(userText)) {
  // Crisis intervention
}
```

#### 2. Voice Emotion Pipeline

Multiple builders process voice emotion in sequence:

```
VoiceEmotionInput
    │
    ├─→ emotional.ts       (merges with text emotion)
    │
    ├─→ voice-emotion.ts   (cognitive adjustments)
    │
    ├─→ advanced-voice-emotion.ts (Hume AI)
    │
    └─→ human-listening.ts (tremor, breath, hedging)
```

**Recommendation:** Use `VoiceEmotionOrchestrator` (new) for unified handling.

#### 3. Memory Coordination

Memory builders share session state to prevent repetition:

```typescript
// Track referenced memories
userData.referencedMemories?.push(memoryId);

// Check before referencing
if (!userData.referencedMemories?.includes(memoryId)) {
  // Safe to reference
}
```

| Builder               | Responsibility                 |
| --------------------- | ------------------------------ |
| `memory.ts`           | Cross-session memory callbacks |
| `advanced-memory.ts`  | Semantic memory with decay     |
| `proactive-memory.ts` | Spontaneous recall             |
| `persona-memory.ts`   | Persona-specific memories      |

#### 4. Persona Identity Stack

Persona builders build on each other:

```
persona-identity.ts     → Core identity (name, role, values)
        │
        ├─→ persona-quirks.ts      → Behavioral quirks
        │
        ├─→ persona-mood.ts        → Current mood state
        │
        ├─→ persona-vulnerability.ts → Authentic moments
        │
        └─→ lovable-presence.ts    → Orchestrates personality
```

#### 5. Team Handoff Coordination

```
team-availability.ts   → Which personas are unlocked
        │
        ├─→ team-dynamics.ts    → Cross-persona awareness
        │
        ├─→ role-boundaries.ts  → Domain ownership
        │
        └─→ handoff.ts          → Actual handoff logic
```

---

## Session State

Session state is centralized in `SessionStateManager`:

```typescript
import { getSessionState } from '../session-state.js';

const state = getSessionState(sessionId);
// Access:
//   state.voiceEmotion
//   state.emotionalTrajectory
//   state.patterns
//   state.cognitiveLoad
//   state.conversationFlow
```

### State Components

| Component             | Data                                | Used By                       |
| --------------------- | ----------------------------------- | ----------------------------- |
| `voiceEmotion`        | Emotion history, arc, stress        | voice-emotion-\*, emotional   |
| `emotionalTrajectory` | Start/current emotion, trend        | emotional, celebration        |
| `patterns`            | Topic mentions, intentions, actions | pattern-surfacing, cognitive  |
| `cognitiveLoad`       | Load level, simplification needs    | cognitive-\*, response-length |
| `conversationFlow`    | Phase, topics, moments, stories     | many builders                 |

---

## Distress Levels

Use centralized distress constants from `distress-levels.ts`:

```typescript
import { DISTRESS, getDistressCategory, shouldBeGentle } from '../distress-levels.js';

// Thresholds
DISTRESS.CRISIS = 0.8; // Immediate intervention
DISTRESS.HIGH = 0.7; // Full support mode
DISTRESS.MODERATE = 0.5; // Acknowledge feelings
DISTRESS.ELEVATED = 0.4; // Be mindful
DISTRESS.MILD = 0.2; // Light awareness
DISTRESS.LOW = 0.0; // Normal

// Usage
if (distressLevel >= DISTRESS.HIGH) {
  // Switch to gentle approach
}

const category = getDistressCategory(distressLevel); // 'HIGH', 'MODERATE', etc.
```

---

## Metrics & Observability

Track builder performance with `metrics.ts`:

```typescript
import { getMetricsSummary, checkPerformanceIssues, getBuilderMetrics } from './metrics.js';

// After build
const summary = getMetricsSummary();
console.log(summary.slowestBuilders);
console.log(summary.avgBuildTimeMs);

// Performance alerts
const warnings = checkPerformanceIssues();
// ["Builder 'X' averaging 75ms", ...]
```

---

## Adding a New Builder

### 1. Create the file

```typescript
// my-builder.ts
import { createLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { BuilderCategory } from './categories.js';
import { DISTRESS } from '../distress-levels.js';

const log = createLogger({ module: 'context:my-builder' });

export const myBuilder: ContextBuilder = {
  name: 'my-builder',
  description: 'What this builder does',
  priority: 55, // See category ranges
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userText, analysis, services, userData } = input;

    // Early return if not applicable
    if (!shouldActivate(analysis)) {
      return [];
    }

    return [
      createStandardInjection('my-builder', 'Specific guidance for the AI...', {
        category: 'context',
      }),
    ];
  },
};

// Register on module load
registerContextBuilder(myBuilder);
```

### 2. Add to categories.ts

```typescript
// In BUILDER_CATEGORIES
'my-builder': BuilderCategory.CONTEXT,
```

### 3. Add to loader.ts

```typescript
// In BUILDER_MANIFEST[BuilderCategory.CONTEXT]
'my-builder',
```

---

## Priority Guidelines

| Category   | Priority Range | Example Builders                 |
| ---------- | -------------- | -------------------------------- |
| SAFETY     | 0-20           | crisis, wellbeing-context        |
| EMOTIONAL  | 15-35          | emotional, celebration           |
| VOICE      | 20-40          | voice-emotion, human-listening   |
| MEMORY     | 25-45          | memory, proactive-memory         |
| PERSONA    | 40-60          | persona-identity, persona-quirks |
| COACHING   | 45-65          | coaching-context, therapeutic    |
| COGNITIVE  | 50-70          | cognitive, pattern-surfacing     |
| ENGAGEMENT | 55-75          | engagement, game-context         |
| TEAM       | 60-80          | team-dynamics, handoff           |
| CONTEXT    | 50-70          | topics, intent, discovery        |
| EXTERNAL   | 65-85          | biometrics, world-awareness      |
| HUMANIZING | 75-95          | humanizing, response-length      |
| LEARNING   | 80-100         | community-learning               |

**Note:** Lower priority = runs earlier in sort. Higher priority builders can override lower ones.

---

## Common Patterns

### Check Distress Before Advice

```typescript
if (analysis.emotion.distressLevel >= DISTRESS.MODERATE) {
  // Lead with empathy, not advice
  return createStandardInjection('my-builder', 'Acknowledge feelings before practical guidance.');
}
```

### Prevent Repetition

```typescript
const sessionState = getSessionState(input.services.sessionId);
if (sessionState.conversationFlow.referencedMemories.has(memoryId)) {
  return []; // Already referenced
}
sessionState.conversationFlow.referencedMemories.add(memoryId);
```

### Use Session State

```typescript
import { updateEmotionalTrajectory } from '../session-state.js';

// Track emotional changes
updateEmotionalTrajectory(sessionId, emotion, distressLevel);
```

### Log Appropriately

```typescript
// Debug for normal operation
log.debug({ topic }, 'Processing topic');

// Info for significant events
log.info({ milestone }, 'Milestone detected');

// Warn for issues
log.warn({ error }, 'Failed to fetch data');
```

---

## Testing

```typescript
// src/tests/context-builders/my-builder.test.ts
import { describe, it, expect } from 'vitest';
import { myBuilder } from '../../intelligence/context-builders/my-builder.js';
import { createMockInput } from './test-utils.js';

describe('myBuilder', () => {
  it('should return injection when condition met', async () => {
    const input = createMockInput({
      /* setup */
    });
    const result = await myBuilder.build(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('expected guidance');
  });

  it('should return empty when not applicable', async () => {
    const input = createMockInput({
      /* no trigger */
    });
    const result = await myBuilder.build(input);
    expect(result).toHaveLength(0);
  });
});
```

---

## Troubleshooting

### Builder Not Running?

1. Check it's in `loader.ts` manifest
2. Check it calls `registerContextBuilder()` on load
3. Check for errors: `checkPerformanceIssues()`

### Duplicate Injections?

1. Multiple builders might be producing similar content
2. Check `referencedMemories` before injecting
3. Use unique `source` names

### Performance Issues?

```typescript
const summary = getMetricsSummary();
console.log('Slow builders:', summary.slowestBuilders);
console.log('High skip rate:', summary.highestSkipRate);
```

Target: < 200ms total build time, < 50ms per builder.

---

## Future Improvements

- [ ] Dependency resolution (run B after A)
- [ ] Conditional builder loading (only load coaching for coaches)
- [ ] A/B testing infrastructure
- [ ] Builder composition (combine small builders)
