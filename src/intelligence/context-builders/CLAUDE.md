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
├── core/           # Foundation (types, categories)
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
└── family/         # Family-related context
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

## Behavioral Builders (none run today)

The ten `behavioral/builders/*.behavioral.ts` files were never imported on the live path, so they were deleted with the builder registry (2026-10). `buildIntegratedContext` emits the default style directive plus awareness facts and tool guidance. See `behavioral/README.md` before adding behavioral signals: it changes prompt text, so it needs a flag and a voice eval.

---

## Nothing Runs the Registry

`registerContextBuilder` still records builders, but nothing runs the registry on a call: its runner (`core/loader.ts`, `core/builder-imports.ts`, `buildConversationContext`) was removed in 2026-11. A live turn gets its context from `agents/processors/turn-processor/context-injections.ts`, which imports each builder it uses. A new builder runs only once it is called from there.

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
- Make injections vague ("be nice")
- Duplicate logic from other builders

## Cross-Persona Intelligence Builders

These specialized builders provide deep insights when entering a persona. Most are **directories** with multiple files (data-fetchers, formatting, session management, metrics):

| Builder | Persona | Structure | Purpose |
|---------|---------|-----------|---------|
| `personas/peter-research-insights/` | Peter | 8 files | Deep research briefings, cross-team data |
| `personas/maya-coaching-insights/` | Maya | 8 files | Habit coaching context, Four Tendencies |
| `personas/jordan-milestone-insights/` | Jordan | 8 files | Milestone planning, life stage intelligence |
| `personas/alex-communication-insights/` | Alex | 11 files | Communication coaching, calendar density |
| `personas/nayan-wisdom-insights/` | Nayan | 15 files | Life wisdom synthesis, values alignment |
| `personas/joel-dickson-insights/` | Nate | 1 file | Nate Holloway financial insights |
| `personas/ferni-coordinator-insights.ts` | Ferni | Standalone | Smart handoff suggestions |

On a call these run from `getPersonaBuilder` (`agents/processors/injection-builders/intelligence-builders.ts`), keyed by canonical persona id (`personas/persona-ids.ts`). Maya's, Jordan's, Alex's and Nayan's never ran before #2836 and each waits behind a `PERSONA_BRIEFING_*` flag (off) until it is fixed; the flag file says what is wrong.

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
peter-research-insights/       - Peter's deep research briefings (8 files)
maya-coaching-insights/        - Maya's habit coaching context (8 files)
jordan-milestone-insights/     - Jordan's milestone planning (8 files)
alex-communication-insights/   - Alex's communication coaching (11 files)
nayan-wisdom-insights/         - Nayan's life wisdom synthesis (15 files)
ferni-coordinator-insights.ts  - Ferni's handoff suggestions

# HUMANIZING
humanization/                  - Speech naturalness builders

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
