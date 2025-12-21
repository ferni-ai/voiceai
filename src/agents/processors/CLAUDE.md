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
├── turn-processor.ts          # Main turn orchestration (~1400 lines)
├── types.ts                   # Shared type definitions
├── injection-builders.ts      # Context injection builders
├── injection-filter.ts        # Smart injection filtering
├── message-analyzer.ts        # Message analysis
├── cached-modules.ts          # Lazy-loaded module caching
├── conversation-dynamics.ts   # Narrative arc, engagement, rhythm
├── easter-egg-handler.ts      # Easter egg detection
├── emotional-state-builder.ts # Emotional state with mismatch detection
├── response-guidance-builder.ts # Response length, pacing, stories
├── identity-context-builder.ts  # Post-handoff identity reinforcement
├── humanizing-context-builder.ts # Voice emotion, inner world, mood
├── bundle-runtime-processor.ts  # Modes, situational responses
├── advanced-humanization.ts     # 10 deep humanization capabilities
├── index.ts                   # Public exports
├── __tests__/                 # Test files
└── CLAUDE.md                  # This file
```

---

## Module Responsibilities

### Core Orchestration (turn-processor.ts)
The main orchestrator that coordinates all processing:
- `processTurn()` - Main entry point
- `buildContextInjections()` - Builds LLM context
- `injectTurnContext()` - Injects context into LLM
- `getCelebrationEvents()` - Detects celebration moments

### Extracted Modules

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `message-analyzer.ts` | Analyze user messages | `analyzeMessage()`, `updateConversationState()` |
| `cached-modules.ts` | Lazy-load performance-critical modules | `getContextBuilders()`, `getTaskManagerCached()` |
| `conversation-dynamics.ts` | Track conversation flow | `processConversationDynamics()` |
| `easter-egg-handler.ts` | Handle special moments | `checkEasterEggs()` |
| `emotional-state-builder.ts` | Build emotional context | `buildEmotionalState()` |
| `response-guidance-builder.ts` | Response shaping | `buildResponseGuidance()` |
| `identity-context-builder.ts` | Post-handoff identity | `buildIdentityContext()` |
| `humanizing-context-builder.ts` | Human-like responses | `buildHumanizingContextForTurn()` |
| `bundle-runtime-processor.ts` | Persona behaviors | `processBundleRuntime()` |
| `advanced-humanization.ts` | Deep capabilities | `processAdvancedHumanization()` |

### Injection Builders (injection-builders.ts)
Builds specific context injections:
- Safety injections
- Trust system injections
- Life coaching injections
- Health awareness injections
- Cross-persona insights

### Injection Filter (injection-filter.ts)
Smart filtering to prevent prompt bloat:
- `filterInjections()` - Prioritize and limit injections
- `detectConversationMode()` - Adapt to conversation type

---

## Extraction Pattern

Each extracted module follows this pattern:

```typescript
// new-module.ts
import type { TurnContext, TurnAnalysisResult } from './types.js';

export function myExtractedFunction(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): ResultType {
  // Implementation
}

// turn-processor.ts
import { myExtractedFunction } from './new-module.js';

// In processTurn():
const result = myExtractedFunction(ctx, analysisResult);
```

---

## Key Exports

```typescript
// From index.ts
export { processTurn, injectTurnContext, getCelebrationEvents } from './turn-processor.js';
export type { TurnContext, TurnProcessorResult, EmotionalState, ... } from './types.js';
```

---

## Testing

Each module has corresponding tests:
```
__tests__/
├── turn-processor.test.ts       # Orchestration tests
├── message-analyzer.test.ts     # Analysis tests
├── emotional-state-builder.test.ts
└── ...
```

Run tests:
```bash
pnpm vitest run src/agents/processors/__tests__/
```

---

*Created: December 2024*
*Status: Refactoring complete (2277 → 1433 lines)*
