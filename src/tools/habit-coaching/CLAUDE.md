# Habit Coaching Module

> Growth through gentleness — evidence-based behavior science delivered with warmth.

---

## Module Structure

```
habit-coaching/
├── types.ts        # All interfaces and type definitions (including Four Tendencies)
├── constants.ts    # LIFE_DOMAINS, LIFE_STAGES, GLIDEPATH_LEVELS, etc.
├── templates.ts    # HABIT_TEMPLATES - pre-built habit blueprints
├── bundles.ts      # HABIT_BUNDLES - curated habit stacks
├── challenges.ts   # THIRTY_DAY_CHALLENGES
├── transitions.ts  # LIFE_TRANSITION_SUPPORT
├── helpers.ts      # Utility functions (diagnosis, motivation, analysis)
├── storage.ts      # Persistence layer
├── tools.ts        # Tool implementations (LLM-callable habit tools)
└── index.ts        # Re-exports for backward compatibility
```

## Key Files

| File | Purpose | Size |
|------|---------|------|
| `tools.ts` | Main tool implementations — LLM-callable habit coaching tools | Largest file |
| `types.ts` | All interfaces: `EnhancedHabit`, `HabitTemplate`, `FourTendency`, etc. |
| `templates.ts` | Pre-built habit blueprints with glidepath versions |
| `bundles.ts` | Curated habit stacks (e.g., "Morning Person") |
| `helpers.ts` | Pure utility functions for diagnosis and analysis |
| `storage.ts` | Firestore persistence layer |

## Import Patterns

```typescript
// Preferred: Direct imports for tree-shaking
import { LIFE_DOMAINS } from './habit-coaching/constants.js';
import type { EnhancedHabit } from './habit-coaching/types.js';

// Also supported: Index imports
import { LIFE_DOMAINS, type EnhancedHabit } from './habit-coaching/index.js';
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
From Tiny Habits methodology — start small, build up:
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
4. Add tool implementation in `tools.ts`
5. Export from `index.ts`

## Testing

Helper functions in `helpers.ts` are pure and testable:
- `diagnoseHabitFailure()` - Why habits fail
- `analyzeMoodPatterns()` - Mood-habit correlations
- `getMotivationalContent()` - Context-aware encouragement

---

*Last updated: January 2026*
