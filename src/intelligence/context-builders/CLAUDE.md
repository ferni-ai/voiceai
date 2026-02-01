# Context Builders

> **We believe in making AI human, and the decisions we make will reflect that.**

Context builders are how we make AI emotionally intelligent. They inject the awareness, empathy, and memory that transforms responses from robotic to human. See `../../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## 🎯 Architecture Vision (January 2026)

**We are migrating to a cleaner, more discoverable architecture.**

See:
- `docs/architecture/CONTEXT-BUILDERS-RATIONALIZATION.md` - Complete migration plan
- `docs/architecture/CONTEXT-BUILDERS-MIGRATION-TRACKER.md` - Progress tracking

### Two Systems (Legacy → Behavioral)

| System | Status | Use For |
|--------|--------|---------|
| **Legacy** (`buildConversationContext`) | ⚠️ Deprecated | Existing builders |
| **Behavioral** (`buildIntegratedContext`) | ✅ Preferred | New builders |

**Why migrate?** The behavioral system prevents **context leakage** - where internal guidance ("User seems sad") accidentally becomes spoken output.

```typescript
// ❌ LEGACY (can leak)
createContextInjection('emotional', `[CONTEXT: User seems sad. Be supportive.]`);

// ✅ BEHAVIORAL (can't leak)
return { tone: 'gentle', style: 'supportive', questionStyle: 'reflective' };
```

### Directory Organization (Target State)

```
context-builders/
├── core/           # Foundation (types, registry, loader)
├── behavioral/     # NEW SYSTEM - expand this ⭐
├── safety/         # P0 - Crisis, wellbeing (always runs first)
├── intelligence/   # "Better Than Human" capabilities ⭐
├── memory/         # Cross-session memory
├── emotional/      # Emotion handling
├── awareness/      # External/situational facts
├── relationship/   # Trust, social, relationship arc
├── engagement/     # Games, music, rituals
├── personas/       # Persona-specific builders
├── coaching/       # Life coaching
├── session/        # Session state
├── team/           # Multi-persona coordination
├── superhuman/     # Superhuman services
├── humanization/   # Speech naturalness
├── external/       # External integrations
├── learning/       # Collective intelligence
├── cognitive/      # Cognitive pattern recognition builders
├── conversational/ # Conversation-specific context (backchannel, goodbye, silence)
├── family/         # Family-related context
└── proactive/      # Proactive intelligence surfacing
```

---

## What They Do
Context builders inject guidance into each conversation turn. They analyze the current state (emotion, memory, topic, etc.) and return instructions that shape the agent's response.

## Reference Docs
- **Migration Plan**: `docs/architecture/CONTEXT-BUILDERS-RATIONALIZATION.md` ⭐
- **Progress Tracker**: `docs/architecture/CONTEXT-BUILDERS-MIGRATION-TRACKER.md`
- Dynamic Triggers: `docs/architecture/DYNAMIC-TRIGGER-SYSTEM.md` (proactive behavior activation)
- Behavioral System: `behavioral/README.md` (preferred approach)
- Trigger Utils: `dynamic-trigger-utils.ts` (condition-based trigger matching)

---

## Quick Start: Creating a BEHAVIORAL Builder (Preferred)

The behavioral system is architecturally superior - it can't leak. **Use this for new builders.**

```typescript
// behavioral/builders/my-feature.behavioral.ts
import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

async function buildMyFeatureBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis, userData, persona } = input;

  // Analyze context...
  // Return BEHAVIORAL signals, NOT facts about the user

  return {
    source: 'my-feature',
    confidence: 0.8,
    priority: 50,

    // ✅ GOOD: Behavioral guidance
    tone: 'warm',
    style: 'exploratory',
    
    // ✅ GOOD: Behavioral hints (no raw facts)
    callbacks: [{
      type: 'pattern',
      hint: 'They seem interested in exploring this further.',
      strength: 'natural',
    }],

    // ❌ BAD: This would leak raw facts
    // callbacks: [{ hint: 'User mentioned divorce on Dec 15th' }],
  };
}

registerBehavioralBuilder({
  name: 'my-feature',
  description: 'What this builder does',
  priority: 50, // 0=runs first, 100=runs last
  category: 'category-name',
  build: buildMyFeatureBehavior,
});
```

**Key Rule:** Return signals about **HOW to behave**, never facts about the user.

---

## Quick Start: Creating a LEGACY Builder (Deprecated)

Only use this pattern for modifying existing legacy builders.

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

These specialized builders provide deep insights when entering a persona. Most are **directories** with multiple files (data-fetchers, formatting, session management, metrics):

| Builder | Persona | Structure | Purpose |
|---------|---------|-----------|---------|
| `personas/peter-research-insights/` | Peter | 8 files | Deep research briefings, cross-team data |
| `personas/maya-coaching-insights/` | Maya | 8 files | Habit coaching context, Four Tendencies |
| `personas/jordan-milestone-insights/` | Jordan | 8 files | Milestone planning, life stage intelligence |
| `personas/alex-communication-insights/` | Alex | 11 files | Communication coaching, calendar density |
| `personas/nayan-wisdom-insights/` | Nayan | 15 files | Life wisdom synthesis, values alignment |
| `personas/joel-dickson-insights/` | Joel | 1 file | Joel Dickson financial insights |
| `personas/ferni-coordinator-insights.ts` | Ferni | Standalone | Smart handoff suggestions |

The `personas/` directory also contains 20+ standalone builder files for persona-specific context (backstory, catchphrases, humor, vulnerability, voice DNA, etc.).

### Key Files

```
personas/                    - All persona-specific builders (dirs + standalone files)
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
safety/crisis.ts               - Crisis/panic/emergency detection

# MEMORY
memory/                        - Cross-session memory builders

# EMOTIONAL
emotional/                     - Emotion detection, contagion, laughter, voice emotion

# PERSONA (personas/)
persona-identity.ts            - Core persona identity
human-personality.ts           - Semantic matching, callbacks
peter-research-insights/       - Peter's deep research briefings (8 files)
maya-coaching-insights/        - Maya's habit coaching context (8 files)
jordan-milestone-insights/     - Jordan's milestone planning (8 files)
alex-communication-insights/   - Alex's communication coaching (11 files)
nayan-wisdom-insights/         - Nayan's life wisdom synthesis (15 files)
ferni-coordinator-insights.ts  - Ferni's handoff suggestions

# HUMANIZING
humanization/                  - Speech naturalness builders

# See loader.ts for complete list of 90+ builders across 19 categories
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
