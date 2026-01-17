# Superhuman Memory Implementation Plan

> **Comprehensive Implementation, Integration, Validation, Testing, and Audit Plan**

---

## Executive Summary

This plan transforms Ferni's memory from **scattered components** into a **unified intelligent brain**.

**Timeline:** 10 weeks
**Risk Level:** Medium (building on existing foundations)
**Key Dependencies:** Firestore, OpenAI Embeddings, Redis

### Existing Foundations to Build On

| Component | File | Status | Enhancement Needed |
|-----------|------|--------|-------------------|
| Memory Orchestrator | `memory/orchestrator.ts` | ✅ Exists | Extend with timing intelligence |
| Associative Memory | `memory/associative-memory.ts` | ✅ Exists | Add graph persistence |
| Memory Consolidator | `memory/memory-consolidator.ts` | ✅ Exists | Add background scheduling |
| Unified Persistence | `trust-systems/unified-persistence.ts` | ✅ Exists | Model for unified store |
| Vector Store | `memory/firestore-vector-store/` | ✅ Exists | Add link metadata |
| Advanced Retrieval | `memory/advanced-retrieval.ts` | ✅ Exists | Add spreading activation |

---

# Phase 1: Unified Memory Store (Weeks 1-2)

## 1.1 Overview

**Goal:** Create a single interface for all memory operations without breaking existing code.

**Approach:** Facade pattern over existing systems, gradually migrating internals.

## 1.2 Component Design

### 1.2.1 UnifiedMemoryStore Interface

```typescript
// src/memory/unified-store/index.ts

export interface UnifiedMemoryStore {
  // Core operations
  store(memory: MemoryInput): Promise<StoredMemory>;
  recall(query: RecallQuery): Promise<RecallResult>;
  update(id: string, updates: Partial<Memory>): Promise<void>;
  delete(id: string): Promise<void>;
  
  // Search operations
  search(params: SearchParams): Promise<SearchResult>;
  searchSimilar(embedding: number[], options: SimilarityOptions): Promise<Memory[]>;
  
  // Graph operations (Phase 3 prep)
  getLinks(memoryId: string): Promise<MemoryLink[]>;
  addLink(link: MemoryLink): Promise<void>;
  
  // Lifecycle operations
  consolidate(userId: string): Promise<ConsolidationReport>;
  decay(userId: string): Promise<DecayReport>;
  
  // Health
  health(): Promise<HealthStatus>;
}
```

### 1.2.2 File Structure

```
src/memory/unified-store/
├── index.ts                    # Re-exports + singleton
├── types.ts                    # All type definitions
├── facade.ts                   # Facade implementation
├── adapters/
│   ├── firestore-adapter.ts    # Wraps firestore-store.ts
│   ├── vector-adapter.ts       # Wraps firestore-vector-store/
│   ├── redis-adapter.ts        # Wraps redis-cache.ts
│   └── memory-adapter.ts       # Wraps in-memory-store.ts
├── graph/
│   ├── link-manager.ts         # Memory link CRUD
│   ├── link-types.ts           # Link type definitions
│   └── firestore-links.ts      # Firestore storage for links
└── __tests__/
    ├── facade.test.ts
    ├── adapters.test.ts
    └── integration.test.ts
```

## 1.3 Implementation Tasks

### Week 1: Foundation

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 1.1.1 | Create `unified-store/types.ts` with all interfaces | 2h | - | None |
| 1.1.2 | Create `unified-store/adapters/firestore-adapter.ts` | 4h | - | 1.1.1 |
| 1.1.3 | Create `unified-store/adapters/vector-adapter.ts` | 4h | - | 1.1.1 |
| 1.1.4 | Create `unified-store/adapters/redis-adapter.ts` | 2h | - | 1.1.1 |
| 1.1.5 | Create `unified-store/adapters/memory-adapter.ts` | 2h | - | 1.1.1 |
| 1.1.6 | Create `unified-store/facade.ts` orchestrating adapters | 6h | - | 1.1.2-5 |
| 1.1.7 | Write unit tests for each adapter | 4h | - | 1.1.2-5 |

### Week 2: Integration & Migration

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 1.2.1 | Create `unified-store/graph/link-types.ts` | 2h | - | 1.1.6 |
| 1.2.2 | Create `unified-store/graph/firestore-links.ts` | 4h | - | 1.2.1 |
| 1.2.3 | Create `unified-store/graph/link-manager.ts` | 4h | - | 1.2.2 |
| 1.2.4 | Update `memory/index.ts` to export unified store | 2h | - | 1.1.6 |
| 1.2.5 | Create migration script for existing memories | 4h | - | 1.2.3 |
| 1.2.6 | Integration testing with Firestore emulator | 6h | - | 1.2.4 |
| 1.2.7 | Feature flag for gradual rollout | 2h | - | 1.2.4 |

## 1.4 Integration Points

### 1.4.1 Callers to Update (Phase 1)

```typescript
// BEFORE: Direct calls to multiple systems
import { getUserDocument } from './firestore-store.js';
import { searchMemories } from './firestore-vector-store.js';
import { getCachedEmbedding } from './embedding-cache.js';

// AFTER: Single unified interface
import { getUnifiedStore } from './unified-store/index.js';

const store = getUnifiedStore();
const result = await store.recall({ userId, query });
```

### 1.4.2 Backward Compatibility

Keep old exports working during migration:

```typescript
// src/memory/index.ts

// Legacy exports (deprecated, will remove in Phase 5)
export { getUserDocument, setUserDocument } from './firestore-store.js';
export { searchMemories, addMemory } from './firestore-vector-store.js';

// New unified export (preferred)
export { getUnifiedStore, type UnifiedMemoryStore } from './unified-store/index.js';
```

## 1.5 Validation Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| All existing tests pass | `pnpm test src/memory` | 100% |
| Unified store tests pass | `pnpm test src/memory/unified-store` | 100% |
| Memory read latency | P50 latency | < 50ms |
| Memory write latency | P50 latency | < 100ms |
| No regressions | Production metrics | Baseline ± 5% |

## 1.6 Testing Plan

### 1.6.1 Unit Tests

```typescript
// src/memory/unified-store/__tests__/facade.test.ts

describe('UnifiedMemoryStore', () => {
  describe('store()', () => {
    it('should store memory and generate embedding', async () => {});
    it('should store memory with pre-computed embedding', async () => {});
    it('should deduplicate similar memories', async () => {});
    it('should gracefully handle Firestore unavailable', async () => {});
  });
  
  describe('recall()', () => {
    it('should return semantic matches', async () => {});
    it('should respect userId filter', async () => {});
    it('should apply score threshold', async () => {});
    it('should include associative links', async () => {});
  });
  
  describe('consolidate()', () => {
    it('should merge similar memories', async () => {});
    it('should preserve emotional salience', async () => {});
    it('should update links after consolidation', async () => {});
  });
});
```

### 1.6.2 Integration Tests

```typescript
// src/memory/unified-store/__tests__/integration.test.ts

describe('UnifiedMemoryStore Integration', () => {
  beforeAll(async () => {
    // Start Firestore emulator
  });
  
  it('should round-trip memory through all layers', async () => {
    const store = getUnifiedStore();
    
    // Store
    const memory = await store.store({
      userId: 'test-user',
      content: 'User mentioned loving hiking',
      type: 'preference',
    });
    
    // Recall
    const result = await store.recall({
      userId: 'test-user',
      query: 'outdoor activities',
    });
    
    expect(result.memories).toContainEqual(
      expect.objectContaining({ id: memory.id })
    );
  });
});
```

### 1.6.3 Performance Tests

```typescript
// src/memory/unified-store/__tests__/performance.test.ts

describe('Performance Benchmarks', () => {
  it('should recall within 50ms P50', async () => {
    const latencies: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await store.recall({ userId: 'benchmark-user', query: 'test query' });
      latencies.push(performance.now() - start);
    }
    
    const p50 = percentile(latencies, 50);
    expect(p50).toBeLessThan(50);
  });
});
```

## 1.7 Rollout Plan

| Stage | Duration | Traffic | Criteria to Proceed |
|-------|----------|---------|---------------------|
| Canary | 2 days | 1% | No errors, latency OK |
| Beta | 3 days | 10% | No errors, latency OK |
| GA | 2 days | 100% | All metrics healthy |

## 1.8 Audit Checklist

- [ ] All adapters have error handling
- [ ] Graceful degradation when dependencies unavailable
- [ ] No direct Firestore calls outside adapters
- [ ] All public methods have JSDoc
- [ ] Types exported from index.ts
- [ ] Migration script tested on production data copy
- [ ] Feature flag implemented and documented
- [ ] Metrics/logging added for observability

---

# Phase 2: Memory Intelligence Layer (Weeks 3-4)

## 2.1 Overview

**Goal:** Replace scattered context builders with coordinated intelligence.

**Key Insight:** Current system has 8+ context builders all injecting separately. LLM has to figure out what's relevant. New system makes intelligent decisions about what/when/how to surface.

## 2.2 Component Design

### 2.2.1 MemoryIntelligence Interface

```typescript
// src/intelligence/memory-intelligence/index.ts

export interface MemoryIntelligence {
  // Main entry point for turn processing
  prepareForTurn(context: TurnContext): Promise<MemoryPreparedContext>;
  
  // Timing intelligence
  shouldSurfaceMemory(
    memory: Memory,
    context: ConversationContext,
    userState: UserState
  ): Promise<TimingDecision>;
  
  // Phrasing generation
  generateNaturalReference(
    memory: Memory,
    style: PhrasingStyle,
    persona: PersonaId
  ): Promise<string>;
  
  // Learning
  recordUserResponse(
    memoryId: string,
    response: UserResponseSignal
  ): Promise<void>;
  
  // Profile
  getUserProfile(userId: string): Promise<UserMemoryProfile>;
}
```

### 2.2.2 File Structure

```
src/intelligence/memory-intelligence/
├── index.ts                     # Main exports
├── types.ts                     # Type definitions
├── core.ts                      # MemoryIntelligence implementation
├── timing/
│   ├── timing-engine.ts         # When to surface
│   ├── receptivity-scorer.ts    # User receptivity
│   ├── impact-predictor.ts      # Memory impact prediction
│   └── timing-rules.ts          # Rule-based timing
├── phrasing/
│   ├── phrasing-generator.ts    # Natural language generation
│   ├── persona-voice.ts         # Per-persona voice
│   └── templates.ts             # Phrasing templates
├── learning/
│   ├── response-tracker.ts      # Track user responses
│   ├── profile-builder.ts       # Build user memory profile
│   └── preference-learner.ts    # Learn preferences
└── __tests__/
    ├── timing.test.ts
    ├── phrasing.test.ts
    └── learning.test.ts
```

## 2.3 Implementation Tasks

### Week 3: Core Intelligence

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 2.1.1 | Create `memory-intelligence/types.ts` | 2h | - | Phase 1 |
| 2.1.2 | Create `timing/receptivity-scorer.ts` | 4h | - | 2.1.1 |
| 2.1.3 | Create `timing/impact-predictor.ts` | 4h | - | 2.1.1 |
| 2.1.4 | Create `timing/timing-engine.ts` | 6h | - | 2.1.2, 2.1.3 |
| 2.1.5 | Create `phrasing/templates.ts` | 2h | - | 2.1.1 |
| 2.1.6 | Create `phrasing/persona-voice.ts` | 4h | - | 2.1.5 |
| 2.1.7 | Create `phrasing/phrasing-generator.ts` | 4h | - | 2.1.6 |

### Week 4: Learning & Integration

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 2.2.1 | Create `learning/response-tracker.ts` | 4h | - | 2.1.4 |
| 2.2.2 | Create `learning/profile-builder.ts` | 4h | - | 2.2.1 |
| 2.2.3 | Create `learning/preference-learner.ts` | 4h | - | 2.2.2 |
| 2.2.4 | Create `core.ts` integrating all components | 6h | - | 2.2.1-3 |
| 2.2.5 | Replace context builders with intelligence | 8h | - | 2.2.4 |
| 2.2.6 | Update turn-processor.ts to use intelligence | 4h | - | 2.2.4 |
| 2.2.7 | Write comprehensive tests | 6h | - | 2.2.4 |

## 2.4 Integration with Turn Processor

### 2.4.1 Before (Scattered)

```typescript
// src/agents/processors/turn-processor.ts (current)

// Many separate context builders
const memoryContext = await buildMemoryContext(input);
const advancedMemory = await buildAdvancedMemoryContext(input);
const proactiveMemory = await buildProactiveMemoryContext(input);
const humanMemory = await buildHumanMemoryContext(input);
const personaMemory = await buildPersonaMemoryContext(input);
const superhumanContext = await buildSuperhumanContext(userId);

// All injected separately
injections.push(...memoryContext);
injections.push(...advancedMemory);
// ...etc
```

### 2.4.2 After (Coordinated)

```typescript
// src/agents/processors/turn-processor.ts (new)

import { getMemoryIntelligence } from '../intelligence/memory-intelligence/index.js';

const memoryIntel = getMemoryIntelligence();

// Single coordinated call
const memoryContext = await memoryIntel.prepareForTurn({
  userId,
  userText,
  conversationContext,
  emotionalState,
  turnCount,
  persona,
});

// Single injection with all relevant memories
if (memoryContext.shouldInject) {
  injections.push({
    category: 'memory',
    content: memoryContext.formattedContent,
    priority: memoryContext.priority,
  });
}

// After user responds, record signal
memoryIntel.recordUserResponse(
  memoryContext.surfacedMemoryIds,
  analyzeUserResponse(userResponse)
);
```

## 2.5 Context Builders to Deprecate

| Builder | File | Replacement |
|---------|------|-------------|
| buildMemoryContext | `memory/memory.ts` | `memoryIntel.prepareForTurn()` |
| buildAdvancedMemoryContext | `memory/advanced-memory.ts` | `memoryIntel.prepareForTurn()` |
| buildProactiveMemoryContext | `memory/proactive-memory.ts` | `memoryIntel.prepareForTurn()` |
| buildHumanMemoryContext | `memory/human-memory.ts` | `memoryIntel.prepareForTurn()` |
| buildPersonaMemoryContext | `personas/persona-memory.ts` | `memoryIntel.prepareForTurn()` |
| buildUnifiedMemoryContext | `memory/unified-memory-orchestrator.ts` | `memoryIntel.prepareForTurn()` |

## 2.6 Timing Rules

### 2.6.1 When NOT to Surface

```typescript
// src/intelligence/memory-intelligence/timing/timing-rules.ts

const BLOCKING_CONDITIONS: TimingRule[] = [
  {
    name: 'crisis_active',
    condition: (ctx) => ctx.crisisDetected,
    reason: 'Never interrupt crisis support with memory callbacks',
  },
  {
    name: 'emotional_intensity_high',
    condition: (ctx) => ctx.emotionalState.intensity > 0.8,
    reason: 'Let intense emotions be processed first',
  },
  {
    name: 'user_energy_low',
    condition: (ctx) => ctx.userState.energy < 0.3,
    reason: 'User is depleted, keep it light',
  },
  {
    name: 'recently_surfaced',
    condition: (ctx) => ctx.turnsSinceLastMemory < 3,
    reason: 'Avoid memory overload',
  },
  {
    name: 'conversation_shallow',
    condition: (ctx) => ctx.turnCount < 3,
    reason: 'Build rapport before callbacks',
  },
];
```

### 2.6.2 When TO Surface

```typescript
const SURFACING_TRIGGERS: TimingRule[] = [
  {
    name: 'topic_connection',
    condition: (ctx) => ctx.topicRelevance > 0.8,
    priority: 'high',
    reason: 'Strong topic match',
  },
  {
    name: 'commitment_followup',
    condition: (ctx) => ctx.hasOutstandingCommitment && ctx.daysSince > 3,
    priority: 'medium',
    reason: 'Time to check in on commitment',
  },
  {
    name: 'emotional_callback',
    condition: (ctx) => ctx.emotionalSimilarity > 0.7,
    priority: 'medium',
    reason: 'Similar emotional context',
  },
  {
    name: 'person_mentioned',
    condition: (ctx) => ctx.personMentioned && ctx.hasPersonHistory,
    priority: 'high',
    reason: 'Opportunity to show we remember them',
  },
];
```

## 2.7 Validation Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Context builder tests pass | `pnpm test intelligence/memory` | 100% |
| Timing decision accuracy | Manual review of 100 samples | >85% appropriate |
| Phrasing naturalness | User feedback | >4/5 rating |
| Response tracking | Signals captured | >95% |
| Latency | prepareForTurn() P50 | <100ms |

## 2.8 Testing Plan

### 2.8.1 Timing Engine Tests

```typescript
describe('TimingEngine', () => {
  describe('shouldSurface()', () => {
    it('should block during crisis', async () => {
      const decision = await timingEngine.shouldSurface(memory, {
        crisisDetected: true,
      });
      expect(decision.shouldSurface).toBe(false);
      expect(decision.reason).toContain('crisis');
    });
    
    it('should trigger on strong topic match', async () => {
      const decision = await timingEngine.shouldSurface(memory, {
        topicRelevance: 0.9,
        turnCount: 5,
      });
      expect(decision.shouldSurface).toBe(true);
    });
  });
});
```

### 2.8.2 Phrasing Tests

```typescript
describe('PhrasingGenerator', () => {
  it('should use persona voice for Ferni', async () => {
    const phrase = await generator.generate(memory, { persona: 'ferni' });
    // Ferni is warm and grounded
    expect(phrase).not.toContain('According to my records');
    expect(phrase).toMatch(/remember|mentioned|last time/i);
  });
  
  it('should use different voice for Peter', async () => {
    const phrase = await generator.generate(memory, { persona: 'peter' });
    // Peter is analytical
    expect(phrase).toMatch(/noted|observed|pattern/i);
  });
});
```

## 2.9 Audit Checklist

- [ ] All context builders have deprecation warnings
- [ ] Turn processor uses new intelligence
- [ ] Timing rules documented and reviewed
- [ ] Phrasing templates reviewed by brand
- [ ] Learning signals captured correctly
- [ ] Feature flag for gradual rollout
- [ ] Rollback plan documented
- [ ] Latency monitoring in place

---

# Phase 3: Associative Cortex (Weeks 5-6)

## 3.1 Overview

**Goal:** Transform associative memory from pattern matching to graph-based with spreading activation.

**Key Enhancement:** Build on existing `associative-memory.ts` to add:
1. Graph persistence in Firestore
2. Spreading activation algorithm
3. Hidden connection discovery

## 3.2 Component Design

### 3.2.1 Enhanced Associative Memory

```typescript
// src/memory/associative-cortex/index.ts

export interface AssociativeCortex {
  // Store memory with automatic link detection
  store(memory: MemoryInput): Promise<MemoryNode>;
  
  // Recall with spreading activation
  recall(
    triggers: Trigger[],
    context: RecallContext
  ): Promise<ActivatedMemorySet>;
  
  // Discover hidden connections
  findConnections(
    topics: string[],
    userId: string
  ): Promise<Connection[]>;
  
  // Build narrative arc
  getEmotionalJourney(
    topic: string,
    userId: string,
    timeRange: TimeRange
  ): Promise<EmotionalArc>;
  
  // Link management
  addLink(link: MemoryLink): Promise<void>;
  getLinks(memoryId: string, type?: LinkType): Promise<MemoryLink[]>;
  
  // Background maintenance
  maintainLinks(userId: string): Promise<MaintenanceReport>;
}
```

### 3.2.2 File Structure

```
src/memory/associative-cortex/
├── index.ts                      # Exports
├── types.ts                      # Types
├── cortex.ts                     # Main implementation
├── graph/
│   ├── graph-store.ts            # Firestore graph storage
│   ├── link-detector.ts          # Auto-detect links
│   └── link-types.ts             # Link type definitions
├── activation/
│   ├── spreading-activation.ts   # Spreading activation algorithm
│   ├── activation-config.ts      # Algorithm parameters
│   └── decay-functions.ts        # Activation decay
├── discovery/
│   ├── connection-finder.ts      # Find hidden connections
│   ├── pattern-extractor.ts      # Extract patterns
│   └── narrative-builder.ts      # Build narratives
└── __tests__/
    ├── spreading-activation.test.ts
    ├── link-detector.test.ts
    └── connection-finder.test.ts
```

## 3.3 Spreading Activation Algorithm

```typescript
// src/memory/associative-cortex/activation/spreading-activation.ts

interface ActivationNode {
  memoryId: string;
  activation: number;
  sources: string[];  // Which nodes activated this
}

export async function spreadActivation(
  startNodes: string[],
  graph: MemoryGraph,
  config: ActivationConfig
): Promise<ActivatedMemorySet> {
  const activations = new Map<string, ActivationNode>();
  const queue = new PriorityQueue<string>();
  
  // Initialize start nodes
  for (const nodeId of startNodes) {
    activations.set(nodeId, {
      memoryId: nodeId,
      activation: 1.0,
      sources: ['initial'],
    });
    queue.enqueue(nodeId, 1.0);
  }
  
  // Spread activation
  let iterations = 0;
  while (!queue.isEmpty() && iterations < config.maxIterations) {
    const currentId = queue.dequeue();
    const current = activations.get(currentId)!;
    
    // Get links from current node
    const links = await graph.getLinks(currentId);
    
    for (const link of links) {
      const targetId = link.targetId;
      const spreadAmount = current.activation * link.weight * config.decayFactor;
      
      // Skip if below threshold
      if (spreadAmount < config.minActivation) continue;
      
      // Update target activation
      const existing = activations.get(targetId);
      if (existing) {
        existing.activation = Math.min(
          existing.activation + spreadAmount,
          config.maxActivation
        );
        existing.sources.push(currentId);
      } else {
        activations.set(targetId, {
          memoryId: targetId,
          activation: spreadAmount,
          sources: [currentId],
        });
        queue.enqueue(targetId, spreadAmount);
      }
    }
    
    iterations++;
  }
  
  // Return top activated memories
  return sortAndFilter(activations, config.topK);
}
```

## 3.4 Link Types

```typescript
// src/memory/associative-cortex/graph/link-types.ts

export type LinkType =
  | 'causal'       // "Because of" / "Led to"
  | 'temporal'     // "Before" / "After"
  | 'emotional'    // Similar emotional context
  | 'person'       // Same person mentioned
  | 'topic'        // Same topic domain
  | 'narrative'    // Same life chapter
  | 'semantic';    // High embedding similarity

export interface MemoryLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
  weight: number;  // 0-1
  metadata: {
    createdAt: Date;
    detectedBy: 'auto' | 'manual' | 'llm';
    confidence: number;
  };
}

// Auto-detection rules
export const LINK_DETECTION_RULES: LinkDetectionRule[] = [
  {
    type: 'person',
    detect: (m1, m2) => {
      const persons1 = extractPersons(m1.content);
      const persons2 = extractPersons(m2.content);
      const overlap = intersection(persons1, persons2);
      return overlap.length > 0 ? overlap[0] : null;
    },
    weightFn: (overlap) => 0.8,
  },
  {
    type: 'temporal',
    detect: (m1, m2) => {
      const daysBetween = daysDiff(m1.timestamp, m2.timestamp);
      return daysBetween < 7 ? 'recent_sequence' : null;
    },
    weightFn: (_, daysBetween) => Math.max(0.3, 1 - daysBetween * 0.1),
  },
  {
    type: 'emotional',
    detect: (m1, m2) => {
      if (m1.emotionalWeight > 0.5 && m2.emotionalWeight > 0.5) {
        const emotionSimilarity = compareEmotions(m1.emotion, m2.emotion);
        return emotionSimilarity > 0.7 ? 'emotional_resonance' : null;
      }
      return null;
    },
    weightFn: (_, similarity) => similarity,
  },
  {
    type: 'semantic',
    detect: (m1, m2) => {
      if (!m1.embedding || !m2.embedding) return null;
      const similarity = cosineSimilarity(m1.embedding, m2.embedding);
      return similarity > 0.75 ? 'semantic_similarity' : null;
    },
    weightFn: (_, similarity) => similarity,
  },
];
```

## 3.5 Implementation Tasks

### Week 5: Graph Infrastructure

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 3.1.1 | Create `associative-cortex/types.ts` | 2h | - | Phase 1 |
| 3.1.2 | Create `graph/link-types.ts` with detection rules | 4h | - | 3.1.1 |
| 3.1.3 | Create `graph/graph-store.ts` for Firestore | 6h | - | 3.1.2 |
| 3.1.4 | Create `graph/link-detector.ts` | 4h | - | 3.1.2 |
| 3.1.5 | Migrate existing associative-memory.ts | 4h | - | 3.1.4 |
| 3.1.6 | Write Firestore indexes for links | 2h | - | 3.1.3 |

### Week 6: Activation & Discovery

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 3.2.1 | Create `activation/spreading-activation.ts` | 6h | - | 3.1.3 |
| 3.2.2 | Create `activation/decay-functions.ts` | 2h | - | 3.2.1 |
| 3.2.3 | Create `discovery/connection-finder.ts` | 4h | - | 3.2.1 |
| 3.2.4 | Create `discovery/narrative-builder.ts` | 4h | - | 3.2.3 |
| 3.2.5 | Create `cortex.ts` main implementation | 6h | - | 3.2.1-4 |
| 3.2.6 | Integration with unified store | 4h | - | 3.2.5 |
| 3.2.7 | Comprehensive testing | 6h | - | 3.2.5 |

## 3.6 Firestore Schema for Links

```typescript
// Collection: bogle_users/{userId}/memory_links/{linkId}

interface FirestoreMemoryLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
  weight: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata: {
    detectedBy: string;
    confidence: number;
  };
}

// Indexes needed (firestore.indexes.json)
{
  "collectionGroup": "memory_links",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sourceId", "order": "ASCENDING" },
    { "fieldPath": "type", "order": "ASCENDING" }
  ]
}
```

## 3.7 Validation Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Link detection accuracy | Manual review | >90% appropriate |
| Spreading activation latency | P50 | <200ms |
| Connection discovery relevance | User feedback | >80% relevant |
| Graph query performance | P95 | <500ms |

## 3.8 Testing Plan

```typescript
describe('SpreadingActivation', () => {
  it('should activate directly linked memories', async () => {
    // Setup: A -> B -> C with weights
    await graph.addLink({ source: 'A', target: 'B', weight: 0.8 });
    await graph.addLink({ source: 'B', target: 'C', weight: 0.6 });
    
    const result = await spreadActivation(['A'], graph, defaultConfig);
    
    expect(result.get('B')?.activation).toBeGreaterThan(0.5);
    expect(result.get('C')?.activation).toBeGreaterThan(0);
    expect(result.get('C')?.activation).toBeLessThan(result.get('B')?.activation);
  });
  
  it('should respect max iterations', async () => {
    // Create deep chain
    const result = await spreadActivation(['start'], deepGraph, {
      ...defaultConfig,
      maxIterations: 3,
    });
    
    // Should not reach nodes beyond depth 3
    expect(result.has('depth_4_node')).toBe(false);
  });
});
```

## 3.9 Audit Checklist

- [ ] Link detection rules reviewed
- [ ] Firestore indexes deployed
- [ ] Spreading activation parameters tuned
- [ ] Graph visualization tool created (for debugging)
- [ ] Background link maintenance job scheduled
- [ ] Memory usage bounded
- [ ] Query performance tested at scale

---

# Phase 4: Learning & Lifecycle (Weeks 7-8)

## 4.1 Overview

**Goal:** Memory that learns per-user preferences and manages its own lifecycle.

## 4.2 Component Design

### 4.2.1 Learning Engine

```typescript
// src/intelligence/memory-intelligence/learning/learning-engine.ts

export interface LearningEngine {
  // Record interaction outcomes
  recordOutcome(event: MemoryInteractionEvent): Promise<void>;
  
  // Get learned preferences
  getPreferences(userId: string): Promise<UserMemoryPreferences>;
  
  // Predict receptivity
  predictReceptivity(
    userId: string,
    memory: Memory,
    context: Context
  ): Promise<number>;
  
  // Get optimal timing
  getOptimalTiming(userId: string, memoryType: MemoryType): Promise<TimingPreference>;
}

export interface UserMemoryPreferences {
  // When they're receptive
  receptivityPatterns: {
    byTimeOfDay: Map<number, number>;
    byConversationDepth: Map<number, number>;
    byEmotionalState: Map<string, number>;
  };
  
  // How they respond
  responsePatterns: {
    topicsWelcomed: string[];
    topicsDeflected: string[];
    preferredPhrasingStyle: PhrasingStyle;
  };
  
  // Sensitivity
  sensitiveTopics: Set<string>;
  
  // Frequency
  idealRecallFrequency: number; // per session
}
```

### 4.2.2 Lifecycle Manager

```typescript
// src/memory/lifecycle/lifecycle-manager.ts

export interface MemoryLifecycleManager {
  // Consolidation
  runConsolidation(userId: string): Promise<ConsolidationReport>;
  
  // Decay
  runDecay(userId: string): Promise<DecayReport>;
  
  // Reinforcement
  reinforceMemory(memoryId: string): Promise<void>;
  
  // Pruning
  pruneMemories(userId: string, threshold: number): Promise<PruneReport>;
  
  // Scheduled maintenance
  scheduleMaintenanceJob(userId: string): void;
}
```

## 4.3 Implementation Tasks

### Week 7: Learning

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 4.1.1 | Create learning engine types | 2h | - | Phase 2 |
| 4.1.2 | Create response-tracker.ts | 4h | - | 4.1.1 |
| 4.1.3 | Create preference-learner.ts | 6h | - | 4.1.2 |
| 4.1.4 | Create receptivity-predictor.ts | 4h | - | 4.1.3 |
| 4.1.5 | Create timing-optimizer.ts | 4h | - | 4.1.3 |
| 4.1.6 | Firestore schema for preferences | 2h | - | 4.1.3 |
| 4.1.7 | Unit tests for learning | 4h | - | 4.1.4 |

### Week 8: Lifecycle

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 4.2.1 | Create lifecycle manager types | 2h | - | Phase 1 |
| 4.2.2 | Enhance memory-consolidator.ts | 4h | - | 4.2.1 |
| 4.2.3 | Create decay-manager.ts | 4h | - | 4.2.1 |
| 4.2.4 | Create reinforcement-tracker.ts | 2h | - | 4.2.1 |
| 4.2.5 | Create scheduled-maintenance.ts | 4h | - | 4.2.2-4 |
| 4.2.6 | Cloud Scheduler integration | 4h | - | 4.2.5 |
| 4.2.7 | Integration testing | 6h | - | 4.2.5 |

## 4.4 Decay Algorithm

```typescript
// src/memory/lifecycle/decay-manager.ts

export function calculateDecay(memory: Memory, config: DecayConfig): number {
  const daysSinceCreation = daysDiff(memory.createdAt, new Date());
  const daysSinceAccess = daysDiff(memory.lastAccessedAt, new Date());
  
  // Base decay: exponential over time
  const baseDecay = Math.pow(config.decayRate, daysSinceCreation / 30);
  
  // Access boost: recent access slows decay
  const accessBoost = Math.pow(config.accessBoostRate, 1 + memory.accessCount);
  const accessRecency = Math.max(0.5, 1 - daysSinceAccess * 0.05);
  
  // Emotional protection: high emotion memories decay slower
  const emotionalProtection = 1 + memory.emotionalWeight * config.emotionalMultiplier;
  
  // Commitment protection: active commitments don't decay
  const commitmentProtection = memory.isActiveCommitment ? 2.0 : 1.0;
  
  // Final decay score (higher = more likely to prune)
  const decayScore = baseDecay / (accessBoost * accessRecency * emotionalProtection * commitmentProtection);
  
  return Math.min(1.0, Math.max(0.0, decayScore));
}
```

## 4.5 Validation Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Preference learning accuracy | A/B test | 15% improvement in engagement |
| Decay preserves emotional memories | Audit | 0 important memories lost |
| Consolidation efficiency | Memory count | 30% reduction in duplicates |
| Scheduled jobs reliability | Success rate | >99% |

---

# Phase 5: Tool Integration (Weeks 9-10)

## 5.1 Overview

**Goal:** Make tools memory-native so they read/write through the intelligence layer.

## 5.2 Implementation Tasks

### Week 9: Tool Context Enhancement

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 5.1.1 | Create MemoryAwareToolContext | 4h | - | Phase 2 |
| 5.1.2 | Update tool registry with memory | 4h | - | 5.1.1 |
| 5.1.3 | Update memory domain tools | 6h | - | 5.1.2 |
| 5.1.4 | Update coaching domain tools | 6h | - | 5.1.2 |
| 5.1.5 | Update wellness domain tools | 4h | - | 5.1.2 |
| 5.1.6 | Tool memory access patterns doc | 2h | - | 5.1.3 |

### Week 10: Router & Cleanup

| Task ID | Task | Effort | Owner | Dependencies |
|---------|------|--------|-------|--------------|
| 5.2.1 | Memory-aware semantic router | 6h | - | 5.1.2 |
| 5.2.2 | Remove deprecated context builders | 4h | - | Phase 2 done |
| 5.2.3 | Remove redundant memory files | 4h | - | 5.2.2 |
| 5.2.4 | Final integration testing | 8h | - | 5.2.3 |
| 5.2.5 | Documentation update | 4h | - | 5.2.4 |
| 5.2.6 | Production rollout | 6h | - | 5.2.5 |

## 5.3 Memory-Aware Tool Context

```typescript
// src/tools/registry/memory-context.ts

export interface MemoryAwareToolContext extends ToolContext {
  // Memory intelligence access
  memory: {
    // Read relevant memories for this tool
    getRelevant(topic: string): Promise<Memory[]>;
    
    // Store insight from tool execution
    storeInsight(insight: ToolInsight): Promise<void>;
    
    // Check if user discussed this before
    hasDiscussed(topic: string): Promise<boolean>;
    
    // Get user's history with this tool
    getToolHistory(): Promise<ToolExecution[]>;
  };
}

// Tool uses memory naturally
export const careerCoachingTool: ToolDefinition = {
  id: 'clarifyCareerGoals',
  // ...
  create: (ctx: MemoryAwareToolContext): Tool => {
    return llm.tool({
      execute: async ({ timeHorizon }, { ctx }) => {
        // Check if we've discussed this before
        const previousDiscussions = await ctx.memory.getRelevant('career goals');
        
        if (previousDiscussions.length > 0) {
          // Acknowledge previous work
          const previous = previousDiscussions[0];
          return `Last time we talked about your ${previous.content}. Has anything changed?`;
        }
        
        // Store this discussion
        await ctx.memory.storeInsight({
          type: 'career_goals',
          content: `Discussed ${timeHorizon} career planning`,
          importance: 'high',
        });
        
        return generateInitialGoalExploration(timeHorizon);
      },
    });
  },
};
```

---

# Comprehensive Testing Strategy

## Test Levels

| Level | Scope | Coverage Target | Tools |
|-------|-------|-----------------|-------|
| Unit | Individual functions | 80% | Vitest |
| Integration | Component interactions | 70% | Vitest + Emulators |
| E2E | Full user journeys | Key flows | Playwright |
| Performance | Latency, throughput | Benchmarks | Custom |
| Chaos | Failure scenarios | Critical paths | Custom |

## Test Environments

| Environment | Purpose | Data |
|-------------|---------|------|
| Local | Development | Mocked |
| CI | Pull requests | Emulators |
| Staging | Pre-production | Anonymized production |
| Production | Live | Real (read-only tests) |

## Key Test Scenarios

### Memory Recall E2E

```typescript
describe('Memory Recall E2E', () => {
  it('should recall memory from 6 months ago when relevant', async () => {
    // Setup: Create user with old memory
    const userId = await createTestUser();
    await storeMemory(userId, {
      content: "User's daughter Sarah started college",
      timestamp: sixMonthsAgo(),
      emotionalWeight: 0.9,
    });
    
    // Trigger: User mentions daughter
    const response = await simulateConversation(userId, [
      "I was thinking about Sarah today",
    ]);
    
    // Verify: Memory surfaced naturally
    expect(response).toMatch(/college|Sarah/i);
    expect(response).not.toMatch(/according to my records/i);
  });
});
```

### Timing Intelligence E2E

```typescript
describe('Timing Intelligence E2E', () => {
  it('should NOT surface memory during crisis', async () => {
    const userId = await createTestUser();
    await storeMemory(userId, { content: 'Loves hiking' });
    
    // Crisis conversation
    const response = await simulateConversation(userId, [
      "I'm really struggling right now",
      "I don't know what to do anymore",
    ]);
    
    // Memory should NOT be surfaced
    expect(response).not.toMatch(/hiking/i);
    // Should be supportive
    expect(response).toMatch(/here for you|understand|hear/i);
  });
});
```

---

# Audit Framework

## Phase Gate Reviews

Each phase must pass a gate review before proceeding:

### Gate 1: Foundation (End of Week 2)

- [ ] Unified store interface complete
- [ ] All adapters tested
- [ ] Backward compatibility verified
- [ ] Performance baselines established
- [ ] Feature flag working
- [ ] Documentation updated

### Gate 2: Intelligence (End of Week 4)

- [ ] Intelligence layer complete
- [ ] Context builders deprecated
- [ ] Timing rules reviewed
- [ ] Phrasing templates approved
- [ ] Learning signals captured
- [ ] Turn processor integrated

### Gate 3: Cortex (End of Week 6)

- [ ] Graph storage working
- [ ] Spreading activation tested
- [ ] Link detection rules validated
- [ ] Connection discovery working
- [ ] Performance acceptable
- [ ] Firestore indexes deployed

### Gate 4: Learning (End of Week 8)

- [ ] Learning engine complete
- [ ] Lifecycle manager tested
- [ ] Scheduled jobs working
- [ ] Decay algorithm tuned
- [ ] Consolidation tested
- [ ] No data loss scenarios

### Gate 5: Integration (End of Week 10)

- [ ] All tools memory-aware
- [ ] Deprecated code removed
- [ ] Documentation complete
- [ ] Production rollout plan
- [ ] Monitoring dashboards
- [ ] Runbooks for incidents

## Quality Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│              Superhuman Memory Quality Dashboard             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Memory Operations                                          │
│  ├── Store latency (P50):     45ms  ✅                      │
│  ├── Recall latency (P50):    38ms  ✅                      │
│  └── Error rate:              0.02% ✅                      │
│                                                             │
│  Intelligence Layer                                         │
│  ├── Timing accuracy:         87%   ✅                      │
│  ├── User engagement:         +15%  ✅                      │
│  └── Phrasing naturalness:    4.3/5 ⚠️                     │
│                                                             │
│  Graph Health                                               │
│  ├── Avg links per memory:    3.2                          │
│  ├── Activation latency:      120ms ✅                      │
│  └── Orphaned memories:       2.1%  ✅                      │
│                                                             │
│  Learning                                                   │
│  ├── Preference accuracy:     78%   ⚠️                     │
│  └── Receptivity prediction:  82%   ✅                      │
│                                                             │
│  Lifecycle                                                  │
│  ├── Consolidation rate:      28%   ✅                      │
│  ├── Important memories lost: 0     ✅                      │
│  └── Scheduled jobs success:  99.8% ✅                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | High | Low | Backup before migration, shadow writes |
| Latency regression | Medium | Medium | Performance tests in CI, canary deploys |
| Learning produces wrong preferences | Medium | Medium | A/B test, manual review samples |
| Graph grows unbounded | Medium | Low | Consolidation, decay, link limits |
| Rollback needed | High | Low | Feature flags, backward compatibility |

---

# Success Criteria

## North Star Metrics

| Metric | Baseline | Week 5 | Week 10 | Target |
|--------|----------|--------|---------|--------|
| "How did you know?" moments | ~0 | 1/100 | 5/100 | 5/100 |
| Memory recall accuracy | Unknown | 85% | 95% | 95% |
| Cross-session continuity | Weak | Medium | Strong | Strong |
| User trust score | 3.8/5 | 4.0/5 | 4.5/5 | 4.5/5 |
| Memory latency P50 | ~200ms | 100ms | 50ms | <50ms |

---

*Created: December 31, 2024*
*Version: 1.0*
