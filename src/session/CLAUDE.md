# Session Module

Session-level orchestration of core modules for conversation turns.

## Purpose

Provides the `SessionCoordinator` that orchestrates the flow between four core modules for each conversation turn:

1. **Memory** - Retrieves relevant context from past conversations
2. **Intelligence** - Analyzes user message (emotion, intent, topics)
3. **Personality** - Determines personal moments/callbacks
4. **Conversation** - Humanizes response after LLM generation

## Architecture Layer

**Layer 70 (Domain)** - Coordinates domain modules, used by agents.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Public exports |
| `session-coordinator.ts` | Main orchestrator implementation |

## SessionCoordinator Flow

```
User Message
     │
     ▼
┌─────────────────────────────────────┐
│  PRE-TURN PROCESSING                │
│  processPreTurn(userMessage)        │
│                                     │
│  1. Memory retrieval (parallel)     │
│  2. Intelligence analysis           │
│  3. Personality injection           │
│  4. Context building for LLM        │
└─────────────────────────────────────┘
     │
     ▼
     LLM
     │
     ▼
┌─────────────────────────────────────┐
│  POST-TURN PROCESSING               │
│  processPostTurn(llmResponse)       │
│                                     │
│  1. Conversation humanization       │
│  2. Bonding event recording         │
└─────────────────────────────────────┘
     │
     ▼
Humanized Response
```

## Usage

```typescript
import { getSessionCoordinator, removeSessionCoordinator } from '../session/index.js';

// Get or create coordinator for session
const coordinator = getSessionCoordinator({
  userId: 'user_123',
  sessionId: 'session_456',
  personaId: 'ferni',
  persona: personaConfig,
  userProfile: profile,
  vectorStore: vectorStore,
  isReturningUser: true,
});

// Process before LLM
const preTurn = await coordinator.processPreTurn(userMessage);
// preTurn.formattedContext -> inject into LLM prompt
// preTurn.analysis -> emotion, intent, topics

// Get LLM response...
const llmResponse = await llm.generate(...);

// Process after LLM
const postTurn = await coordinator.processPostTurn(llmResponse, preTurn);
// postTurn.humanizedResponse -> send to user

// End session
removeSessionCoordinator(sessionId);
```

## PreTurnContext

What you get from `processPreTurn()`:

| Field | Contents |
|-------|----------|
| `memory.relevantMemories` | RAG context from vector store |
| `memory.emotionalState` | Current emotional memory state |
| `analysis` | Unified analysis (emotion, intent, topics, signals) |
| `personality.relevantMoment` | Personal moment to share |
| `personality.pendingCallbacks` | Promises to follow up on |
| `personality.timingGuidance` | When to share personal moment |
| `contextInjections` | All context to inject into LLM |
| `formattedContext` | Ready-to-use prompt string |

## PostTurnContext

What you get from `processPostTurn()`:

| Field | Contents |
|-------|----------|
| `humanizedResponse` | Processed response text |
| `turnResult` | Full turn metadata from conversation module |
| `processingTimeMs` | Time taken |

## Session State

```typescript
const state = coordinator.getSessionState();
// {
//   sessionId: string,
//   userId: string,
//   personaId: string,
//   turnCount: number,
//   emotionalState: {...},
//   relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend'
// }
```

## Factory Pattern

Coordinators are cached by session ID:

```typescript
// Creates new or returns existing
const coord1 = getSessionCoordinator(config);
const coord2 = getSessionCoordinator(config);  // Same instance

// Clean up when done
removeSessionCoordinator(sessionId);

// Clear all (for shutdown)
clearAllSessionCoordinators();
```

## Rules for Modification

1. **Keep orchestration thin** - Logic belongs in domain modules
2. **Parallel when possible** - Memory retrieval runs parallel to analysis
3. **Handle failures gracefully** - Partial results better than failures
4. **Clean up sessions** - Always call `removeSessionCoordinator()` when done
5. **Log timing** - Track `processingTimeMs` for performance monitoring

## Integration Points

- `src/memory/` - RAG retrieval, emotional memory
- `src/intelligence/` - Unified analyzer, context builders
- `src/personality/` - Moments, callbacks, timing
- `src/conversation/` - Response humanization
- `src/agents/` - Voice agents use coordinator for turn processing
