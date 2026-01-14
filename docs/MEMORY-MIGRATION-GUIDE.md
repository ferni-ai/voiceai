# Memory Module Migration Guide

This guide helps you migrate from the old memory imports to the new **Memory facade**.

## Why Migrate?

The new `Memory` facade provides:
- **Simpler API** - One import, one object
- **Better types** - Unified types from `interfaces/`
- **Automatic STM** - Capture handles STM buffer recording
- **Health checks** - Built-in monitoring
- **Clean architecture** - Easier to test and maintain

## Quick Migration

### Before (Old)

```typescript
import { fastCapture } from '../../memory/dynamic/index.js';
import { recordTurn } from '../../memory/dynamic/stm-buffer.js';
import { retrieveMemories } from '../../memory/advanced-retrieval.js';
import { initializeMemorySystem } from '../../memory/index.js';

// Initialize
await initializeMemorySystem();

// Capture
const result = await fastCapture({
  userId,
  sessionId,
  turnNumber,
  transcript,
});
recordTurn(sessionId, userId, result, transcript, turnNumber);

// Retrieve
const memories = await retrieveMemories(userId, { query: 'family' });
```

### After (New)

```typescript
import { Memory } from '../../memory/facade.js';

// Initialize
await Memory.initialize();

// Capture (STM recording is automatic!)
const result = await Memory.capture({
  userId,
  sessionId,
  turnNumber,
  transcript,
});

// Retrieve
const { memories } = await Memory.retrieve(userId, 'family');
```

## Migration Patterns

### Pattern 1: Simple Capture

```typescript
// OLD
import { fastCapture } from '../../memory/dynamic/fast-capture.js';
const result = await fastCapture({ userId, sessionId, turnNumber, transcript });

// NEW
import { Memory } from '../../memory/facade.js';
const result = await Memory.capture({ userId, sessionId, turnNumber, transcript });
// Note: Memory.capture() returns CaptureResultUnified, which includes result.fast
```

### Pattern 2: Capture + STM Recording

```typescript
// OLD
import { fastCapture } from '../../memory/dynamic/fast-capture.js';
import { recordTurn } from '../../memory/dynamic/stm-buffer.js';

const captureResult = await fastCapture({ userId, sessionId, turnNumber, transcript });
recordTurn(sessionId, userId, captureResult, transcript, turnNumber);

// NEW - STM recording is automatic!
import { Memory } from '../../memory/facade.js';

const result = await Memory.capture({ userId, sessionId, turnNumber, transcript });
// result.stmRecorded is true if STM was recorded
```

### Pattern 3: Memory Retrieval

```typescript
// OLD
import { retrieveMemories } from '../../memory/advanced-retrieval.js';
const memories = await retrieveMemories(userId, { query: 'family' });

// NEW
import { Memory } from '../../memory/facade.js';
const { memories } = await Memory.retrieve(userId, 'family');
```

### Pattern 4: Entity Search

```typescript
// OLD
import { findEntityByAlias } from '../../memory/entity-store/storage.js';
const entity = await findEntityByAlias(userId, 'Mike', 'person');

// NEW
import { Memory } from '../../memory/facade.js';
const entity = await Memory.findEntity(userId, 'Mike');
```

### Pattern 5: Health Checks

```typescript
// OLD
import { getMemorySystemHealth } from '../../memory/index.js';
const health = await getMemorySystemHealth();

// NEW
import { Memory } from '../../memory/facade.js';
const health = await Memory.getHealth();
// Or quick check:
const isOk = await Memory.isHealthy();
```

### Pattern 6: Session End

```typescript
// OLD
import { onSessionEnd } from '../../memory/dynamic/stm-promotion.js';
import { cleanupSession } from '../../memory/dynamic/stm-buffer.js';

await onSessionEnd(sessionId, userId);
cleanupSession(sessionId);

// NEW
import { Memory } from '../../memory/facade.js';

await Memory.onSessionEnd(sessionId, userId);
await Memory.clearSession(sessionId);
```

### Pattern 7: Knowledge Graph Queries

```typescript
// OLD
import { executeNaturalQuery } from '../../memory/knowledge-graph/index.js';
const result = await executeNaturalQuery(userId, 'What do we know about Mike?');

// NEW
import { Memory } from '../../memory/facade.js';
const { answer, entities } = await Memory.ask(userId, 'What do we know about Mike?');
```

## Type Migrations

### Import Types from Interfaces

```typescript
// OLD - types scattered across modules
import type { FastCaptureResult } from '../../memory/dynamic/fast-capture.js';
import type { Entity } from '../../memory/entity-store/types.js';
import type { RetrievedMemory } from '../../memory/advanced-retrieval.js';

// NEW - all types from interfaces
import type {
  FastCaptureResult,
  Entity,
  RetrievedMemory,
} from '../../memory/interfaces/index.js';

// Or from facade for convenience
import type {
  CaptureResultUnified,
  RetrievalResult,
  HealthStatus,
} from '../../memory/facade.js';
```

## Files to Migrate

These files currently use old memory imports:

| File | Current Import | Migration Priority |
|------|---------------|-------------------|
| `src/agents/voice-agent/turn-handler.ts` | `fastCapture` | High |
| `src/agents/processors/turn-processor.ts` | `fastCapture` | High |
| `src/agents/gce-voice-worker.ts` | `memory/dynamic` | High |
| `src/agents/shared/intelligence-integration.ts` | `memory/index` | Medium |
| `src/services/session-manager/end-session.ts` | `memory/dynamic` | Medium |

## Migration Checklist

- [ ] Update import to `Memory` from `facade.js`
- [ ] Replace `fastCapture()` with `Memory.capture()`
- [ ] Remove manual `recordTurn()` calls (automatic now)
- [ ] Replace `retrieveMemories()` with `Memory.retrieve()`
- [ ] Replace `executeNaturalQuery()` with `Memory.ask()`
- [ ] Replace `onSessionEnd()` with `Memory.onSessionEnd()`
- [ ] Update types to import from `interfaces/index.js`
- [ ] Run tests to verify behavior unchanged

## Backward Compatibility

All old imports continue to work. Migration is optional but recommended for:
- New code
- Refactored code
- Test improvements

The facade uses the same underlying implementations, so behavior is identical.

## Questions?

See the module CLAUDE.md files:
- `src/memory/CLAUDE.md` - Overview
- `src/memory/facade.ts` - API documentation
- `src/memory/capture/CLAUDE.md` - Capture details
- `src/memory/retrieval/CLAUDE.md` - Retrieval details
