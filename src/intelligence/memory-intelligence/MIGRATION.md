# Memory Intelligence Migration Guide

This document describes how to migrate from the old scattered memory context builders to the new unified Memory Intelligence system.

## Overview

The new Memory Intelligence system consolidates 8+ separate memory context builders into a unified architecture:

```
OLD (Scattered):
├── context-builders/memory-insights.ts
├── context-builders/commitment-context.ts
├── context-builders/superhuman-memory-context.ts
├── context-builders/relationship-context.ts
└── ... 4+ more scattered builders

NEW (Unified):
├── memory-intelligence/
│   ├── core.ts                 # Main MemoryIntelligence implementation
│   ├── timing/                 # When to surface memories
│   ├── phrasing/               # How to phrase memory callbacks
│   └── learning/               # Learn from user responses
├── associative-cortex/
│   ├── cortex.ts               # Graph-based associations
│   ├── activation/             # Spreading activation
│   ├── graph/                  # Link detection
│   └── discovery/              # Pattern finding
└── lifecycle/
    ├── decay-manager.ts        # Graceful forgetting
    ├── consolidation-manager.ts # Memory merging
    └── preference-predictor.ts  # User preference learning
```

## Migration Steps

### 1. Replace Direct Memory Context Builders

**Before:**
```typescript
import { buildMemoryContext } from './context-builders/memory-insights.js';
import { buildCommitmentContext } from './context-builders/commitment-context.js';

const memoryContext = await buildMemoryContext(userId, ...);
const commitmentContext = await buildCommitmentContext(userId, ...);
```

**After:**
```typescript
import { getMemoryInjection, initMemorySession } from './memory-intelligence/turn-processor-integration.js';

// Initialize session once
await initMemorySession(userId);

// Get unified memory injection per turn
const injection = await getMemoryInjection({
  userId,
  sessionId,
  transcript,
  personaId,
  // ... other context
});

// Use injection in turn processor
if (injection) {
  injections.push(injection);
}
```

### 2. Replace Manual Memory Recall

**Before:**
```typescript
import { recallMemories } from './memory-store.js';

const memories = await recallMemories({
  userId,
  query: transcript,
  limit: 10,
});

// Manually format and inject
const formattedMemories = formatMemories(memories);
```

**After:**
```typescript
import { getMemoryIntelligenceCore } from './memory-intelligence/core.js';

const core = getMemoryIntelligenceCore();
const prepared = await core.prepareForTurn({
  userId,
  sessionId,
  turn: { userMessage: transcript },
  persona: { id: personaId, ... },
  // ... other context
});

// Formatted content ready for injection
if (prepared.shouldSurface) {
  const content = prepared.formattedContent;
}
```

### 3. Use Associative Memory

**Before:**
```typescript
// Manual similarity search
const similar = await findSimilarMemories(memoryId);
```

**After:**
```typescript
import { getAssociativeCortex } from './associative-cortex/index.js';

const cortex = getAssociativeCortex();

// Spreading activation finds associated memories
const activated = await cortex.spreadActivation([memoryId]);

// Or find specific connections
const connections = await cortex.findConnections(memoryId);

// Or build narrative arcs
const narratives = await cortex.getUserNarratives(userId);
```

### 4. Use Memory Lifecycle

**Before:**
```typescript
// No decay, memories accumulated forever
// No consolidation, duplicates everywhere
```

**After:**
```typescript
import { getScheduledMaintenance } from './lifecycle/index.js';

const maintenance = getScheduledMaintenance();

// Run maintenance jobs (typically via Cloud Scheduler)
await maintenance.runJob('daily-decay', userId, getMemories);
await maintenance.runJob('weekly-consolidation', userId, getMemories);
```

### 5. Memory-Aware Tools

**Before:**
```typescript
// Tools had no memory access
function executeTool(input) {
  return doSomething(input);
}
```

**After:**
```typescript
import { createMemoryAwareTool, executeWithMemory } from './memory-aware/index.js';

const tool = createMemoryAwareTool({
  name: 'my_tool',
  relatedTopics: ['topic1'],
  async execute(input, context) {
    // Access memory in tool
    const memories = await context.memory.recall({ topics: ['topic1'] });
    return doSomething(input, memories);
  },
});

// Execute with memory context
const result = await executeWithMemory(tool, input, memoryContext);
```

## Deprecated Files (To Be Removed)

The following files are deprecated and should be removed after migration:

1. `context-builders/memory-insights.ts` → Use `memory-intelligence/core.ts`
2. `context-builders/commitment-context.ts` → Use unified memory recall
3. `context-builders/superhuman-memory-context.ts` → Use Memory Intelligence
4. `context-builders/relationship-context.ts` → Use Associative Cortex
5. `processors/ftis-v2-integration.ts` → Already deleted, replaced by tool-classifier

## Key Benefits

1. **Unified timing logic** - One place to decide when to surface memories
2. **Persona-aware phrasing** - Memories spoken in persona's voice
3. **Learning from responses** - System learns user preferences
4. **Associative recall** - Human-like memory associations
5. **Graceful forgetting** - Decay with protection for important memories
6. **Tool memory access** - Tools can read and write memories

## Testing

Run the new memory tests:

```bash
# Memory Intelligence tests
pnpm vitest run src/intelligence/memory-intelligence/__tests__/

# Associative Cortex tests
pnpm vitest run src/memory/associative-cortex/__tests__/

# Lifecycle tests
pnpm vitest run src/memory/lifecycle/__tests__/
```
