# Habit Coaching Module

> **We believe in making AI human, and the decisions we make will reflect that.**

Habit coaching embodies our principle of "growth through gentleness." We use evidence-based behavior science delivered with warmth and compassion. See `../../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Module Structure

```
habit-coaching/
├── types.ts        # All interfaces and type definitions
├── constants.ts    # LIFE_DOMAINS, LIFE_STAGES, GLIDEPATH_LEVELS, etc.
├── templates.ts    # HABIT_TEMPLATES - pre-built habit blueprints
├── bundles.ts      # HABIT_BUNDLES - curated habit stacks
├── challenges.ts   # THIRTY_DAY_CHALLENGES
├── transitions.ts  # LIFE_TRANSITION_SUPPORT
├── helpers.ts      # Utility functions (diagnosis, motivation, analysis)
├── storage.ts      # Persistence layer
├── tendencies.ts   # Four Tendencies strategies
└── index.ts        # Re-exports for backward compatibility
```

## Import Patterns

```typescript
// Preferred: Direct imports for tree-shaking
import { LIFE_DOMAINS } from './habit-coaching/constants.js';
import type { EnhancedHabit } from './habit-coaching/types.js';

// Also supported: Index imports
import { LIFE_DOMAINS, type EnhancedHabit } from './habit-coaching/index.js';

// Legacy (still works via re-exports in habit-coaching.ts)
import { LIFE_DOMAINS } from '../tools/habit-coaching.js';
```

## Key Types

| Type | Purpose |
|------|---------|
| `EnhancedHabit` | Full habit with tracking, glidepath, loops |
| `HabitTemplate` | Blueprint for creating habits |
| `HabitBundleDefinition` | Pre-built habit stack |
| `GlidepathLevel` | 5-level progression system |
| `HabitLoopTemplate` | Cue-routine-reward structure |
| `LifeDomain` | 8 life areas (health, mind, relationships, etc.) |
| `FourTendency` | Personality type for motivation strategies |

## Behavior Science Concepts

### Glidepath Levels
From Tiny Habits methodology - start small, build up:
1. **Tiny** (2 min) - Just show up
2. **Mini** (5-10 min) - Building consistency
3. **Standard** (15-20 min) - Full engagement
4. **Extended** (20-30 min) - Deep practice
5. **Lifestyle** - Integrated identity

### Habit Loop (cue-routine-reward)
From The Power of Habit:
- **Cue**: Trigger that initiates behavior
- **Routine**: The behavior itself
- **Reward**: Immediate satisfaction

### Templates vs Bundles
- **Templates**: Individual habit blueprints with glidepath versions
- **Bundles**: Curated stacks of synergistic habits (e.g., "Morning Person")

## Adding New Habits

1. Add type definition if needed in `types.ts`
2. Add template to `HABIT_TEMPLATES` in `templates.ts`
3. If part of a bundle, update `bundles.ts`
4. Export from `index.ts`

## Testing

Helper functions in `helpers.ts` are pure and testable:
- `diagnoseHabitFailure()` - Why habits fail
- `analyzeMoodPatterns()` - Mood-habit correlations
- `getMotivationalContent()` - Context-aware encouragement
