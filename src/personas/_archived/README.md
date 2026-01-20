# Archived Persona Intelligence Files

This directory contains archived modules that have been superseded by the new architecture in `src/intelligence/`.

## Why Archived?

These modules contained valuable concepts and implementations but were **NOT wired** to the voice agent. The new implementations in `src/intelligence/` are:

1. **End-to-end wired** - Automatically loaded at session start, used during turns, and persisted at session end
2. **Using registered context builders** - Injections happen through the standard builder system
3. **Following clean architecture** - Proper separation of concerns with types, engine, persistence layers

## Archived Modules

### Relationship Memory (Phases 1-6)

**Original Location:** `src/personas/relationship-memory/`

**New Location:** `src/intelligence/relationship/`

**What Changed:**
- Types simplified and aligned with wired implementation
- Engine refactored with proper async/await patterns
- Persistence layer using @google-cloud/firestore
- Context builders: `relationship-stage.ts`, `callback-opportunities.ts`
- Wired in: `session-init-handler.ts`, `turn-handler.ts`, `cleanup-handler.ts`

### Predictive Intelligence (Phase 7 - Planned)

**Original Location:** `src/personas/predictive-intelligence.ts`

**New Location:** (Planned) `src/intelligence/predictive/persona-patterns.ts`

**Status:** Deprecation notice added. Will be rebuilt to connect persona-specific patterns to the existing `src/intelligence/predictive/` infrastructure (34 files).

### Cognitive Differentiation (Phase 8 - Planned)

**Original Location:** `src/personas/cognitive-differentiation.ts`

**New Location:** (Planned) `src/intelligence/cognitive/differentiation-engine.ts`

**Status:** Deprecation notice will be added. Will be rebuilt as an extension of the existing `cognitive-profiles.ts`.

### Intelligence Integration

**Original Location:** `src/agents/shared/intelligence-integration.ts`

**Status:** Deprecation notice added. Functionality is now handled directly by session lifecycle handlers.

## Migration Guide

### For Relationship Memory

```typescript
// OLD (deprecated)
import { getRelationshipEngine } from '../personas/relationship-memory/index.js';

// NEW
import { getRelationshipEngine, initializeRelationship } from '../intelligence/relationship/index.js';

// The new implementation is automatically initialized in session-init-handler.ts
// Just use getRelationshipEngine() to access the already-loaded engine
```

### For Predictive Intelligence

The new implementation will connect to `src/intelligence/predictive/` infrastructure. See Phase 7 of the rebuild plan.

### For Cognitive Differentiation

The new implementation will extend `cognitive-profiles.ts`. See Phase 8 of the rebuild plan.

## Reference

The full rebuild plan is documented in:
`~/.cursor/plans/relationship_memory_rebuild_*.plan.md`

Core Principle #2: **Relationship Over Transaction**
> "Every interaction is part of an ongoing relationship, not a one-time transaction."
