# Superhuman Memory: Deep Dive Index

> **Architecture documentation for "Better Than Human" memory system**

---

## Overview

This directory contains detailed design documents for each component of the Superhuman Memory architecture. These documents provide the technical specifications needed to implement memory that truly exceeds human capabilities.

---

## Components (by Phase)

### Phase 1: Foundation (Weeks 1-2)
**[01-UNIFIED-MEMORY-STORE.md](./01-UNIFIED-MEMORY-STORE.md)**
- Facade pattern for unified access
- Firestore adapter (documents)
- Vector adapter (semantic search)  
- Cache adapter (Redis + in-memory)
- Graph link storage (preparation)
- Migration strategy

### Phase 2: Intelligence (Weeks 3-4)
**[02-MEMORY-INTELLIGENCE.md](./02-MEMORY-INTELLIGENCE.md)**
- Timing Engine (IF to surface)
- Selection Engine (WHAT to surface)
- Phrasing Generator (HOW to phrase)
- Learning Engine (adaptation)
- Orchestrator integration

### Phase 3: Association (Weeks 5-6)
**[03-ASSOCIATIVE-CORTEX.md](./03-ASSOCIATIVE-CORTEX.md)**
- Link types (causal, temporal, person, narrative)
- Graph store implementation
- Automatic link detection
- LLM-based link detection (causal, narrative)
- Spreading activation
- Graph-enhanced selection

### Phase 4: Lifecycle (Weeks 7-8)
**[04-LIFECYCLE-MANAGER.md](./04-LIFECYCLE-MANAGER.md)**
- Consolidation engine (merge duplicates, form patterns)
- Decay engine (fade without reinforcement)
- Reinforcement engine (strengthen on access)
- Protection engine (preserve important memories)
- Scheduled maintenance

### Phase 5: Integration (Weeks 9-10)
**[05-TOOL-INTEGRATION.md](./05-TOOL-INTEGRATION.md)**
- Memory-native tools (recallMemory, rememberFact, etc.)
- Memory-aware semantic router
- Context carrier (cross-tool state)
- Unified context builder (replaces 5 builders)
- Tool registration

---

## Implementation Order

```
Phase 1: Unified Store     ←── Foundation for everything
         │
         ▼
Phase 2: Intelligence      ←── Makes memory smart
         │
         ▼
Phase 3: Associative       ←── Makes memory connected
         │
         ▼
Phase 4: Lifecycle         ←── Makes memory evolve
         │
         ▼
Phase 5: Integration       ←── Makes memory accessible
```

Each phase builds on the previous. **Do not skip phases.**

---

## Key Principles

### 1. Single Source of Truth
Everything flows through the Unified Memory Store. No direct storage access.

### 2. Intelligence Over Quantity
The Intelligence Layer decides IF, WHAT, and HOW. More isn't better.

### 3. Natural Connections
The Associative Cortex mirrors how human memory works - networks, not lists.

### 4. Active Evolution
The Lifecycle Manager ensures memory evolves - important things protected, clutter fades.

### 5. Seamless Access
Tools and router are memory-aware. Memory feels natural, not mechanical.

---

## Quick Reference: What Gets Replaced

### Old Components → New Components

| Old | New | Phase |
|-----|-----|-------|
| `firestore-store.ts` | Unified Store (Firestore Adapter) | 1 |
| `firestore-vector-store/` | Unified Store (Vector Adapter) | 1 |
| `redis-cache.ts` | Unified Store (Cache Adapter) | 1 |
| `in-memory-store.ts` | Unified Store (Cache Adapter L1) | 1 |
| `superhuman/*.ts` stores | Unified Store | 1 |
| `trust-systems/*.ts` stores | Unified Store | 1 |
| `advanced-memory.ts` | Memory Intelligence | 2 |
| `proactive-memory.ts` | Memory Intelligence | 2 |
| `human-memory.ts` | Memory Intelligence | 2 |
| `persona-memory.ts` | Memory Intelligence | 2 |
| `unified-memory-orchestrator.ts` | Memory Intelligence | 2 |
| (none - new capability) | Associative Cortex | 3 |
| (none - new capability) | Lifecycle Manager | 4 |
| `memory tools (basic)` | Memory-Native Tools | 5 |
| `semantic-router (basic)` | Memory-Aware Router | 5 |

---

## File Structure After Implementation

```
src/memory/
├── unified-store/
│   ├── types.ts                 # Core interfaces
│   ├── facade.ts                # Main orchestrator
│   ├── index.ts                 # Factory/exports
│   └── adapters/
│       ├── types.ts             # Adapter interfaces
│       ├── firestore-adapter.ts # Document storage
│       ├── vector-adapter.ts    # Semantic search
│       └── cache-adapter.ts     # Tiered caching
│
├── intelligence/
│   ├── types.ts                 # Intelligence interfaces
│   ├── timing-engine.ts         # IF to surface
│   ├── selection-engine.ts      # WHAT to surface
│   ├── phrasing-generator.ts    # HOW to phrase
│   ├── learning-engine.ts       # User adaptation
│   ├── orchestrator.ts          # Coordinates all
│   └── index.ts                 # Factory/exports
│
├── graph/
│   ├── link-types.ts            # Link definitions
│   ├── graph-store.ts           # Graph operations
│   ├── link-detector.ts         # Auto link creation
│   ├── llm-link-detector.ts     # LLM-based detection
│   ├── spreading-activation.ts  # Activation spread
│   └── index.ts                 # Factory/exports
│
├── lifecycle/
│   ├── consolidation-engine.ts  # Merge/patterns
│   ├── decay-engine.ts          # Fade mechanics
│   ├── reinforcement-engine.ts  # Access strengthening
│   ├── protection-engine.ts     # Important memory protection
│   ├── lifecycle-manager.ts     # Orchestrator
│   └── index.ts                 # Factory/exports
│
└── index.ts                     # Public API

src/tools/domains/memory/
├── enhanced-memory-tools.ts     # Memory-native tools
└── index.ts                     # Registration

src/tools/semantic-router/
├── memory-aware-router.ts       # Enhanced router
└── ... existing files ...

src/tools/context/
├── context-carrier.ts           # Cross-tool state
└── index.ts                     # Factory/exports

src/intelligence/context-builders/
├── unified-memory-context.ts    # Replaces 5 builders
└── ... other builders ...
```

---

## Success Metrics Summary

| Component | Key Metric | Target |
|-----------|------------|--------|
| Unified Store | Recall latency | <50ms P50 |
| Intelligence | Engagement rate | >60% |
| Associative | Memories with links | >80% |
| Lifecycle | Storage growth | <5%/month |
| Tools | Tool success rate | >90% |

---

## Getting Started

**Ready to implement?** Start with Phase 1:

👉 **[01-UNIFIED-MEMORY-STORE.md](./01-UNIFIED-MEMORY-STORE.md)**

---

*Last updated: December 2024*
