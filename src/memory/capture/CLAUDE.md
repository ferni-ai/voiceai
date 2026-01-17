# Capture Module

Unified entry point for all memory capture operations.

## Quick Start

```typescript
import { captureTurnUnified, captureBatchUnified } from './memory/capture/index.js';

// Capture a single turn
const result = await captureTurnUnified({
  userId: 'user-123',
  sessionId: 'session-456',
  turnNumber: 1,
  transcript: 'I talked to my brother Mike today.',
  emotion: { primary: 'happy', intensity: 0.7 },
});

// Capture batch (post-session)
const results = await captureBatchUnified(userId, sessionId, turns);
```

## Architecture

```
User Speech
    │
    ▼
captureTurnUnified() ─────────────────┐
    │                                  │
    ├─→ fastCapture() [< 50ms]         │
    │       └─→ STM Buffer (L1)        │
    │                                  │
    └─→ AsyncEvents.emit() [async]     │
            │                          │
            ▼                          │
        DeepExtractionWorker           │
            │                          │
            ▼                          │
        Entity Store (L2)              │
            │                          │
            ▼                          │
        Spanner Graph (L3)             │
```

## Key Functions

| Function | Purpose | Latency |
|----------|---------|---------|
| `captureTurnUnified()` | Main capture entry point | < 50ms |
| `captureBatchUnified()` | Post-session batch capture | Variable |
| `fastCapture()` | Inline regex extraction | < 50ms |
| `recordTurn()` | Record to STM buffer | < 1ms |

## What Gets Captured

- **Entity Mentions**: People, places, organizations
- **Emotion Signals**: Happy, sad, anxious, etc.
- **Topic Hints**: Career, relationships, health
- **Date Signals**: "yesterday", "next week"
- **Relationship Signals**: "my brother", "my boss"

## Re-exports

This module re-exports from:
- `dynamic/fast-capture.ts` - Fast regex extraction
- `dynamic/stm-buffer.ts` - Short-term memory buffer
- `entity-store/integration.ts` - Entity capture

## Usage Notes

- Always use `captureTurnUnified()` for new code
- Legacy code can still use direct imports but should migrate
- STM buffer is per-session, automatically cleaned up
- Deep extraction happens async (doesn't block response)
