# Turn Processors

> **We believe in making AI human, and the decisions we make will reflect that.**

The processors module handles turn-by-turn conversation processing.

---

## Architecture Level

Processors are at **Level 100** (Application layer):

```
Level 100: agents/, api/    ← THIS LAYER (processors/)
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
processors/
├── turn-processor.ts          # Main turn orchestration (needs splitting)
├── types.ts                   # Shared type definitions
├── injection-builders.ts      # Context injection builders
├── injection-filter.ts        # Smart injection filtering
├── index.ts                   # Public exports
└── CLAUDE.md                  # This file
```

---

## Refactoring Plan: turn-processor.ts

**Current state:** 2,386 lines - too large for maintainability

**Target:** Split into focused modules following existing patterns (`injection-builders.ts`, `injection-filter.ts`)

### Phase 1: Analysis (extract)
- [ ] `message-analyzer.ts` - `analyzeMessage()`, `updateConversationState()`
  - Lines: ~150
  - Dependencies: services.analyze, userData updates

### Phase 2: State Building (extract)
- [ ] `emotional-state-builder.ts` - `buildEmotionalState()`
  - Lines: ~50
  - Dependencies: analysis, userData

- [ ] `response-guidance-builder.ts` - `buildResponseGuidance()`
  - Lines: ~100
  - Dependencies: analysis, emotional state, persona

- [ ] `identity-context-builder.ts` - `buildIdentityContext()`
  - Lines: ~90
  - Dependencies: persona, bundleRuntime

### Phase 3: Context Building (extract)
- [ ] `context-builder-orchestrator.ts` - `buildContextInjections()`
  - Lines: ~600
  - Dependencies: all builders, filtering logic
  - Note: This is the largest function, may need sub-splitting

### Phase 4: Advanced Processing (extract)
- [ ] `humanization-processor.ts` - `buildHumanizingContextForTurn()`, `processBundleRuntime()`
  - Lines: ~250
  - Dependencies: conversation engines, bundle runtime

- [ ] `advanced-humanization.ts` - `processAdvancedHumanization()`
  - Lines: ~100
  - Dependencies: context builders, dynamics

### Phase 5: Main Orchestration (keep in turn-processor.ts)
- `processTurn()` - ~500 lines (orchestrates all the above)
- `injectTurnContext()` - ~50 lines (helper)
- `getCelebrationEvents()` - ~50 lines (helper)

---

## Extraction Pattern

Follow the existing `injection-builders.ts` pattern:

```typescript
// new-module.ts
import type { TurnContext, ... } from './types.js';

export function myExtractedFunction(ctx: TurnContext): ResultType {
  // Implementation moved here
}

// turn-processor.ts
import { myExtractedFunction } from './new-module.js';

// Call in processTurn()
const result = myExtractedFunction(ctx);
```

---

## Key Exports

```typescript
// From index.ts
export { processTurn, injectTurnContext, getCelebrationEvents } from './turn-processor.js';
export type { TurnContext, TurnProcessorResult, ... } from './types.js';
```

---

## Testing

Each extracted module should have its own test file:
```
__tests__/
├── turn-processor.test.ts       # Orchestration tests
├── message-analyzer.test.ts     # Analysis tests
├── emotional-state-builder.test.ts
└── ...
```

---

*Created: December 2024*
*Status: Refactoring in progress*
