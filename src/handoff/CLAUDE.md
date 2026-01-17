# Handoff Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The handoff module manages persona transitions, voice ID tracking, and the cameo system. Unified state consolidates 4 previous handoff systems into one session-scoped module.

---

## Architecture Level

```
Level 70: handoff/             ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

---

## Directory Structure

```
handoff/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
├── constants.ts                # Handoff constants
│
├── unified-state.ts            # 🎯 Central state (consolidates 4 systems)
├── actions.ts                  # Handoff actions
├── voice-id.ts                 # 🎤 Voice ID tracking
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Unified State** | `unified-state.ts` | Central handoff state |
| **Actions** | `actions.ts` | `startHandoff`, `completeHandoff` |
| **Voice ID** | `voice-id.ts` | Track voice across handoffs |

---

## Unified State

Consolidates previous scattered state:

```typescript
import { getHandoffState } from './handoff/unified-state.js';

// Get immutable snapshot
const state = getHandoffState(sessionId);

// Check current persona
console.log(state.currentPersona);    // 'ferni'
console.log(state.previousPersona);   // 'maya'
console.log(state.handoffCount);      // 2
```

---

## Handoff Actions

```typescript
import {
  startHandoff,
  completeHandoff,
  cancelHandoff
} from './handoff/actions.js';

// Start handoff
await startHandoff(sessionId, {
  from: 'ferni',
  to: 'maya',
  reason: 'user needs habit coaching',
  preserveContext: true,
});

// Complete handoff
await completeHandoff(sessionId, {
  success: true,
  transitionMessage: 'Maya here! Ready to help with habits.',
});

// Cancel if needed
await cancelHandoff(sessionId, {
  reason: 'user changed topic',
});
```

---

## Cameo vs Handoff

| Type | What | Example |
|------|------|---------|
| **Handoff** | Full persona switch | Ferni → Maya for habit coaching |
| **Cameo** | Brief appearance | Peter drops in for quick financial insight |

```typescript
import { startCameo, endCameo } from './handoff/actions.js';

// Brief cameo appearance
await startCameo(sessionId, {
  persona: 'peter',
  context: 'quick financial question',
  duration: 'brief',  // one response
});

// End cameo, return to main persona
await endCameo(sessionId);
```

---

## Voice ID Tracking

Maintain voice identity across handoffs:

```typescript
import { getVoiceIdTracker } from './handoff/voice-id.js';

const tracker = getVoiceIdTracker(sessionId);

// Record voice ID for persona
await tracker.setVoiceId('maya', 'cartesia-maya-voice-id');

// Get voice ID for current persona
const voiceId = tracker.getVoiceId(currentPersona);
```

---

## Session Lifecycle

```typescript
// State is session-scoped
const state = getHandoffState(sessionId);

// Immutable reads
const snapshot = state.getSnapshot();

// State auto-cleans on session end
// No manual cleanup needed
```

---

## Testing

```bash
# Run handoff tests
pnpm vitest run src/handoff/__tests__/
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use unified state | Access old scattered state |
| Session-scoped state | Global state |
| Immutable snapshots for reads | Mutate state directly |
| Preserve context on handoff | Lose context |
| Use cameo for brief appearances | Full handoff for quick questions |

---

## Migration Note

This module consolidates 4 previous systems:
1. `handoff-coordinator.ts` (deprecated)
2. `persona-transitions.ts` (deprecated)
3. `agent-handoff.ts` (deprecated)
4. `transfer-state.ts` (deprecated)

All new code should use `unified-state.ts`.

---

## Related Docs

- `src/personas/CLAUDE.md` - Persona definitions
- `src/context/CLAUDE.md` - Context preservation
- `docs/architecture/HANDOFF_ARCHITECTURE.md`

---

*Last updated: January 2026*
