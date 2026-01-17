# Handoff Coordination

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory manages seamless handoffs between Ferni team members (personas). A handoff should feel like a warm introduction, not a cold transfer.

---

## Quick Reference

| What | Where |
|------|-------|
| Coordinator Adapter | `coordinator-adapter.ts` |
| Event Handler | `event-handler.ts` |
| Session State | `session-state.ts` |
| Types | `types.ts` |
| Index | `index.ts` |

---

## How Handoffs Work

```
User: "I need help with my budget"
          ↓
Ferni recognizes finance topic
          ↓
Ferni: "Maya is great with budgets. Let me bring her in..."
          ↓
[Handoff initiated]
          ↓
Maya: "Hey! Ferni mentioned you want to work on your budget..."
          ↓
[Context transferred, conversation continues]
```

---

## Components

### Coordinator Adapter (`coordinator-adapter.ts`)

Adapts multi-agent orchestrator for handoff operations:

```typescript
import { createCoordinatorAdapter } from './coordinator-adapter.js';

const adapter = createCoordinatorAdapter(orchestrator);

await adapter.initiateHandoff({
  fromPersona: 'ferni',
  toPersona: 'maya',
  reason: 'User wants budget help',
  context: conversationContext,
});
```

### Event Handler (`event-handler.ts`)

Handles handoff-related events:

```typescript
import { HandoffEventHandler } from './event-handler.js';

const handler = new HandoffEventHandler({
  onHandoffStart: (from, to) => log.info(`Handoff: ${from} → ${to}`),
  onHandoffComplete: (to) => log.info(`Now with ${to}`),
  onHandoffFailed: (error) => log.error('Handoff failed', error),
});
```

### Session State (`session-state.ts`)

Manages handoff state during transitions:

```typescript
import { HandoffSessionState } from './session-state.ts';

const state = new HandoffSessionState(sessionId);

// Track handoff progress
state.setHandoffInProgress('ferni', 'maya');
state.setHandoffComplete();

// Check state
const inProgress = state.isHandoffInProgress();
const currentPersona = state.getCurrentPersona();
```

---

## Handoff Types

### Standard Handoff
User-initiated or topic-triggered persona change.

### Cameo Appearance
Brief appearance by another team member without full handoff.

### Return Handoff
Returning to Ferni after specialist conversation.

---

## Context Transfer

Context is preserved during handoffs:

```typescript
interface HandoffContext {
  // What was discussed
  conversationSummary: string;
  recentTopics: string[];
  
  // User state
  userMood: string;
  userGoals: string[];
  
  // Why the handoff
  handoffReason: string;
  
  // What the new persona should know
  briefing: string;
}
```

---

## Rules

### Do ✅
- Transfer full context to new persona
- Use warm introduction language
- Preserve user's emotional state
- Handle handoff failures gracefully
- Log handoff metrics

### Don't ❌
- Lose conversation context
- Make abrupt transitions
- Handoff during crisis situations
- Skip the briefing step
- Leave users confused about who they're talking to

---

## Reference Docs

- Multi-Agent: `../../multi-agent/CLAUDE.md`
- Handoff Module: `../../../handoff/CLAUDE.md`
- Cross-Persona: `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md`

---

*Last updated: January 2026*
