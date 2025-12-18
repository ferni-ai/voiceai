# Context Module Integration Guide

> Last Updated: December 13, 2024

This guide explains how to integrate with Ferni's context management system.

## Overview

The Context Module manages conversation context for LLM prompts:

1. **Session-scoped context managers** - Per-session instances with TTL cleanup
2. **Trust system integration** - "Better than human" insights
3. **Memory/RAG integration** - Semantic search
4. **Speech insights** - Voice-derived guidance
5. **Cross-persona handoff tracking** - Context continuity

## Quick Start

```typescript
import { getContextManager } from '../context/registry.js';
import { buildFullContext } from '../context/context-builders.js';

// Get or create context manager
const contextManager = getContextManager(sessionId, userProfile);

// Build full context
const context = await buildFullContext(sessionId, {
  currentPersonaId: 'ferni',
  userMessage: 'I had a tough day',
  conversationHistory: [...],
});
```

## Core Components

### 1. Context Registry (registry.ts)

Manages singleton ContextManager instances with TTL-based cleanup.

```typescript
import {
  getContextManager,
  hasContextManager,
  removeContextManager,
  startRegistryCleanup,
  getRegistryStats,
} from '../context/registry.js';

const manager = getContextManager(sessionId, userProfile);
startRegistryCleanup(); // Call once at app startup
```

**Configuration:**
- Session TTL: 30 minutes
- Max cache: 1000 sessions (LRU eviction)
- Cleanup interval: 15 minutes

### 2. Context Manager (context-manager.class.ts)

Coordinates context building for a session.

```typescript
const manager = getContextManager(sessionId, userProfile);
manager.setPersonaId('maya');
manager.recordHandoff({ fromPersona: 'ferni', toPersona: 'maya', ... });
const handoffChain = manager.getHandoffChain();
```

### 3. Context Builders (context-builders.ts)

Assemble rich context from multiple sources.

```typescript
import { buildFullContext } from '../context/context-builders.js';

const fullContext = await buildFullContext(sessionId, {
  currentPersonaId: 'ferni',
  userMessage: '...',
  conversationHistory: [...],
});
```

### 4. Speech Insights (speech-insights.ts)

Extracts coaching guidance from voice analysis.

```typescript
import { deriveSpeechInsights } from '../context/speech-insights.js';

const insights = deriveSpeechInsights(
  humanListeningResult,
  speedControlResult,
  trustContextResult,
  emotionalMomentum,
  prosodyContinuity
);
```

### 5. Trust Integration (integrations.ts)

Integrates "Better than Human" trust systems.

```typescript
import { buildTrustContextFromSession } from '../context/integrations.js';
const trustContext = await buildTrustContextFromSession(sessionId, userProfile);
```

## Best Practices

1. **Always use session IDs** - Never use 'global' or hardcoded IDs
2. **Handle missing data** - Context builders return partial results on failure
3. **Clean up on session end** - Registry handles TTL, but explicit cleanup is fine
4. **Monitor health** - Use getRegistryStats() in health checks

## Troubleshooting

- **"Context manager not found"** - Check session TTL and cleanup
- **Slow context building** - Check timingMs in results
- **Memory leaks** - Ensure startRegistryCleanup() was called
