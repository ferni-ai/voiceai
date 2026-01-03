# Context Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The context module manages LLM context injection, conversation continuity, and handoff tracking. One ContextManager per session orchestrates all context building.

---

## Architecture Level

```
Level 70: context/             ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

---

## Directory Structure

```
context/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
│
├── context-manager.class.ts    # 🎯 Central manager (singleton per session)
├── context-builders.ts         # Build context from various sources
├── registry.ts                 # Session registry for managers
│
├── speech-insights.ts          # 🎤 Speech-based context
├── integrations.ts             # External integrations
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **ContextManager** | `context-manager.class.ts` | Central session manager |
| **Context Builders** | `context-builders.ts` | Build from various sources |
| **Registry** | `registry.ts` | Session-to-manager mapping |
| **Speech Insights** | `speech-insights.ts` | Voice-based context |

---

## ContextManager Pattern

One manager per session:

```typescript
import { getContextManager } from './context/registry.js';

// Get or create manager for session
const manager = getContextManager(sessionId);

// Build full context
const context = await manager.buildContext({
  userId,
  personaId,
  includeEmotional: true,
  includeRelationship: true,
  includeSpeech: true,
});

// Inject into LLM prompt
const prompt = manager.formatForLLM(context);
```

---

## Context Builder Priority

Context builders stack in priority order:

```typescript
const BUILDER_PRIORITY = {
  emotional: 100,      // Highest - current emotional state
  relationship: 90,    // User relationship with Ferni
  continuity: 80,      // Conversation continuity
  topic: 70,           // Current topic context
  speech: 60,          // Speech insights
  memory: 50,          // Retrieved memories
};
```

---

## Speech Insights Integration

Add voice-based context:

```typescript
import { getSpeechInsights } from './context/speech-insights.js';

const insights = getSpeechInsights(sessionId);

// Record speech insight
await insights.record({
  type: 'tone',
  value: 'hesitant',
  confidence: 0.8,
});

// Get current insights
const current = insights.getCurrent();
// { tone: 'hesitant', pace: 'slow', energy: 0.4 }
```

---

## Session Lifecycle

```typescript
import {
  getContextManager,
  cleanupContextManager
} from './context/registry.js';

// Session start
const manager = getContextManager(sessionId);

// During session
const context = await manager.buildContext({ ... });

// Session end (auto-cleanup via TTL, or explicit)
cleanupContextManager(sessionId);
```

---

## Handoff Context Preservation

Context is preserved across persona handoffs:

```typescript
const manager = getContextManager(sessionId);

// Before handoff
const snapshot = manager.getSnapshot();

// After handoff
manager.restoreFromSnapshot(snapshot);
```

---

## Testing

```bash
# Run context tests
pnpm vitest run src/context/__tests__/
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use `getContextManager(sessionId)` | Create managers directly |
| Stack context builders | Replace context entirely |
| Preserve context on handoff | Lose context between personas |
| Clean up on session end | Leave managers orphaned |
| Use priority ordering | Mix priorities randomly |

---

## Related Docs

- `src/intelligence/context-builders/CLAUDE.md` - Builder patterns
- `src/speech/CLAUDE.md` - Speech processing
- `src/handoff/CLAUDE.md` - Handoff system

---

*Last updated: January 2026*
