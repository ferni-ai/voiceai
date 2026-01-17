# Context Builder Consolidation Guide

## Current State

The context-builders directory has 70+ builders, which creates:

- Performance overhead (conditional loading helps, but still complex)
- Difficult maintenance (hard to understand which builder does what)
- Potential for conflicting injections

## Consolidation Strategy

### Phase 1: Enable Conditional Loading (DONE)

The `determineActiveCategories()` function now only runs builders relevant to the current context. This reduces per-turn execution from 70+ to ~20-30 builders.

### Phase 2: Merge Related Builders

Group related builders into unified entry points. Each unified builder:

1. Imports logic from the original builders
2. Decides internally what to inject based on context
3. Returns a single coherent set of injections

### Proposed Consolidations

| Unified Builder           | Original Builders                                                                                        | Priority |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| `persona-unified.ts`      | persona-identity.ts, persona-mood.ts, persona-quirks.ts, persona-playful.ts, persona-vulnerability.ts    | P0       |
| `memory-unified.ts`       | memory.ts, human-memory.ts, persona-memory.ts, advanced-memory.ts, proactive-memory.ts                   | P1       |
| `humanization-unified.ts` | humanizing.ts, deep-humanization.ts, conversation-humanizing.ts                                          | P1       |
| `voice-unified.ts`        | voice-emotion.ts, advanced-voice-emotion.ts, voice-emotion-intelligence.ts, human-listening.ts           | P2       |
| `engagement-unified.ts`   | engagement.ts, engagement-context.ts, game-context.ts, storytelling.ts                                   | P2       |
| `team-unified.ts`         | team-availability.ts, team-dynamics.ts, handoff.ts, role-boundaries.ts, cameo-opportunities.ts           | P2       |
| `cognitive-unified.ts`    | cognitive.ts, cognitive-quirks.ts, cognitive-distortions.ts, cognitive-insights.ts, pattern-surfacing.ts | P3       |

### Target: 70+ → ~30 builders

After consolidation:

- ~7 unified builders (from ~35 merged)
- ~25 unchanged builders (already atomic)
- Better organized, easier to debug

## Consolidation Pattern

```typescript
/**
 * Unified [Category] Context Builder
 *
 * Consolidates:
 * - builder1.ts - description
 * - builder2.ts - description
 * - builder3.ts - description
 *
 * @module context-builders/[category]-unified
 */

import {} from /* helpers */ './index.js';
import {} from /* original logic */ './builder1.js';
import {} from /* original logic */ './builder2.js';

async function buildUnifiedCategoryContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // Decide which sub-builders to run based on context
  if (shouldRunBuilder1(input)) {
    const result = await buildBuilder1Logic(input);
    injections.push(...result);
  }

  if (shouldRunBuilder2(input)) {
    const result = await buildBuilder2Logic(input);
    injections.push(...result);
  }

  return injections;
}

registerContextBuilder({
  name: 'category_unified',
  description: 'Unified [category] context',
  priority: 50,
  category: BuilderCategory.CATEGORY,
  build: buildUnifiedCategoryContext,
});
```

## Migration Steps

1. Create unified builder file
2. Import logic from original builders (don't duplicate)
3. Add internal decision logic
4. Register unified builder with appropriate priority
5. Add `@deprecated` to original builders pointing to unified
6. Test thoroughly
7. Remove original builders after verification

## Example: persona-unified.ts

See `persona-unified.ts` for a working example of this pattern.

## Metrics to Track

Before/after consolidation:

- Average builders executed per turn
- Total context build time (p50, p95)
- Injection count per turn
- Memory usage

## Timeline

- Phase 1 (conditional loading): COMPLETE
- Phase 2 (persona consolidation): This PR
- Phase 3 (remaining consolidations): Future PRs
