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
├── # Core Orchestration
├── turn-processor.ts              # Main turn orchestration (~1400 lines)
├── types.ts                       # Shared type definitions
├── index.ts                       # Public exports
│
├── # Context Injection Pipeline
├── injection-builders.ts          # Context injection builders (safety, trust, coaching)
├── injection-filter.ts            # Smart injection filtering & prioritization
├── context-injection-builder.ts   # Full context injection assembly
├── timing-aware-injection.ts      # Timing-aware injection scheduling
├── live-superhuman-injections.ts  # Live superhuman context injections
├── topic-builder-filter.ts        # Topic-based builder filtering
│
├── # Analysis & Response Shaping
├── message-analyzer.ts            # Message analysis
├── emotional-state-builder.ts     # Emotional state with mismatch detection
├── response-guidance-builder.ts   # Response length, pacing, stories
├── conversation-dynamics.ts       # Narrative arc, engagement, rhythm
├── coaching-intelligence.ts       # Coaching intelligence integration
├── semantic-short-circuit.ts      # Fast semantic intent short-circuit
│
├── # Humanization & Identity
├── identity-context-builder.ts    # Post-handoff identity reinforcement
├── humanizing-context-builder.ts  # Voice emotion, inner world, mood
├── bundle-runtime-processor.ts    # Modes, situational responses
├── advanced-humanization.ts       # 10 deep humanization capabilities
├── easter-egg-handler.ts          # Easter egg detection
│
├── # Learning & Tool Integration
├── realtime-learning.ts           # Real-time learning from conversation
├── tool-routing-integration.ts    # Tool routing integration for turn processing
├── trigger-outcome-handler.ts     # Handle trigger outcomes from intelligence layer
├── team-huddle-recording.ts       # Record team huddle sessions
│
├── # Utilities
├── cached-modules.ts              # Lazy-loaded module caching
├── EXTRACTION-CANDIDATES.md       # Future refactoring candidates
├── __tests__/                     # Test files
└── CLAUDE.md                      # This file
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
| `context-injection-builder.ts` | Full context injection assembly | `buildContextInjections()` |
| `timing-aware-injection.ts` | Timing-aware injection scheduling | `scheduleTimedInjections()` |
| `live-superhuman-injections.ts` | Live superhuman context injections | `buildSuperhumanInjections()` |
| `topic-builder-filter.ts` | Topic-based builder filtering | `filterBuildersByTopic()` |
| `coaching-intelligence.ts` | Coaching intelligence integration | `processCoachingIntelligence()` |
| `semantic-short-circuit.ts` | Fast semantic intent short-circuit | `checkSemanticShortCircuit()` |
| `realtime-learning.ts` | Real-time learning from turns | `processRealtimeLearning()` |
| `tool-routing-integration.ts` | Tool routing for turn processing | `integrateToolRouting()` |
| `trigger-outcome-handler.ts` | Handle intelligence trigger outcomes | `handleTriggerOutcome()` |
| `team-huddle-recording.ts` | Record team huddle sessions | `recordTeamHuddle()` |

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

*Last updated: January 2026*
*Status: 26 TypeScript files + tests (originally refactored from 2277 → 1433 lines, then expanded)*
