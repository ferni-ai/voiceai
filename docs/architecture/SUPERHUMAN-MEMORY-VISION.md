# Superhuman Memory Vision

> **The goal isn't a database that talks. It's a mind that remembers.**

---

## The Problem with Current Architecture

We have all the **pieces** but no **brain**.

```
CURRENT STATE: Scattered Memory
═══════════════════════════════════════════════════════════════

┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Firestore  │  │Vector Store │  │  Superhuman │  │   Context   │
│  (Facts)    │  │ (Semantic)  │  │  Services   │  │  Builders   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       │                │                │                │
       ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LLM (Gemini)                            │
│                                                                 │
│  Receives: Disconnected context injections                      │
│  Has to: Figure out what's relevant, how to phrase it          │
│  Problem: No coordination, no learning, no timing intelligence │
└─────────────────────────────────────────────────────────────────┘
```

**What's wrong:**
1. **No unified intelligence** - Each system operates independently
2. **LLM does the heavy lifting** - Deciding what/when/how to recall
3. **No feedback loop** - We don't learn what works
4. **No consolidation** - Memories accumulate forever
5. **Passive injection** - Memory is pushed, not pulled intelligently
6. **No emotional weighting** - All memories treated equally
7. **No associative thinking** - Can't connect dots across domains

---

## The Vision: A Memory Brain

```
TARGET STATE: Unified Memory Intelligence
═══════════════════════════════════════════════════════════════

                    ┌─────────────────────────────────────┐
                    │      MEMORY INTELLIGENCE LAYER      │
                    │         (The "Memory Brain")        │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │    Associative Cortex       │    │
                    │  │  - Connects dots            │    │
                    │  │  - Finds patterns           │    │
                    │  │  - Builds narratives        │    │
                    │  └─────────────────────────────┘    │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │    Timing Intelligence      │    │
                    │  │  - When to recall           │    │
                    │  │  - What to surface          │    │
                    │  │  - How to phrase            │    │
                    │  └─────────────────────────────┘    │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │    Learning Engine          │    │
                    │  │  - Feedback from user       │    │
                    │  │  - Consolidation            │    │
                    │  │  - Decay management         │    │
                    │  └─────────────────────────────┘    │
                    │                                     │
                    └───────────────┬─────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
   │   Storage   │          │   Tools     │          │    LLM      │
   │   Layer     │          │   Layer     │          │   Layer     │
   └─────────────┘          └─────────────┘          └─────────────┘
```

---

## What Needs to Be Built

### 1. The Associative Cortex

**What it does:** Connects memories across domains, time, and emotional weight.

**Current state:** Vector store does semantic similarity. That's it.

**Target state:** A graph-based associative memory that:
- Links memories by **causation** ("They were stressed because of the presentation")
- Links by **people** ("Mom" appears in 47 memories with mixed sentiment)
- Links by **emotional thread** ("This anxiety pattern started 6 months ago")
- Links by **life narrative** ("This is part of their career transition chapter")

```typescript
// PROPOSED: src/memory/associative-cortex.ts

interface MemoryNode {
  id: string;
  content: string;
  embedding: number[];
  
  // Associative links
  links: {
    causal: MemoryLink[];      // "Because of" / "Led to"
    temporal: MemoryLink[];    // "Before" / "After"
    emotional: MemoryLink[];   // Similar emotional context
    person: MemoryLink[];      // Same person mentioned
    topic: MemoryLink[];       // Same topic domain
    narrative: MemoryLink[];   // Same life chapter
  };
  
  // Weighting
  emotionalSalience: number;   // How emotionally charged (0-1)
  accessFrequency: number;     // How often recalled
  lastAccessed: Date;
  decayScore: number;          // Current decay state
}

interface AssociativeCortex {
  // Store with automatic linking
  store(memory: RawMemory): Promise<MemoryNode>;
  
  // Retrieve with spreading activation
  recall(
    query: string,
    context: ConversationContext
  ): Promise<MemoryCluster>;
  
  // Find connections human wouldn't see
  findHiddenConnections(
    currentTopic: string,
    userId: string
  ): Promise<Connection[]>;
  
  // Build narrative arc
  getEmotionalJourney(
    topic: string,
    userId: string
  ): Promise<EmotionalArc>;
}
```

**Implementation approach:**
1. **Graph database** (Neo4j or Firestore with graph overlay) for link storage
2. **Spreading activation** algorithm for recall (like human memory)
3. **Background job** to build/maintain links
4. **Embedding + graph hybrid** for retrieval

---

### 2. Timing Intelligence

**What it does:** Knows WHEN to surface memories and HOW to phrase them.

**Current state:** Context builders inject on schedule or topic match. No intelligence.

**Target state:** A decision engine that considers:
- User's current emotional state
- Conversation depth and flow
- Time since last memory surface
- Relevance score to current moment
- Potential impact (positive/negative)
- Privacy context (who's listening?)

```typescript
// PROPOSED: src/intelligence/timing-engine.ts

interface TimingDecision {
  shouldSurface: boolean;
  confidence: number;
  
  // If yes, how
  timing: 'immediate' | 'wait_for_pause' | 'next_turn' | 'hold';
  phrasing: 'direct' | 'callback' | 'question' | 'observation';
  
  // Reasoning (for debugging)
  factors: {
    relevanceScore: number;
    emotionalReadiness: number;
    conversationFlow: number;
    timeSinceLastRecall: number;
    potentialImpact: number;
  };
}

interface TimingEngine {
  // Should we surface this memory right now?
  evaluate(
    memory: MemoryNode,
    context: ConversationContext,
    userState: UserEmotionalState
  ): Promise<TimingDecision>;
  
  // Generate natural phrasing
  generatePhrasing(
    memory: MemoryNode,
    decision: TimingDecision,
    personaVoice: PersonaVoice
  ): Promise<string>;
  
  // Learn from feedback
  recordOutcome(
    memoryId: string,
    userResponse: UserResponse
  ): Promise<void>;
}
```

**Key insight:** This replaces the current "inject context and hope LLM uses it well" approach with **active intelligence** about surfacing.

---

### 3. The Learning Engine

**What it does:** Learns what memory behaviors work for each user.

**Current state:** No learning. Same behavior for everyone.

**Target state:** Per-user memory personality that learns:
- What kinds of memories they respond to
- When they're receptive to callbacks
- How direct/subtle they prefer
- What topics are sensitive
- When they want to be surprised vs. when they want control

```typescript
// PROPOSED: src/intelligence/memory-learning-engine.ts

interface UserMemoryProfile {
  // Preferences (learned)
  receptivityPatterns: {
    timeOfDay: Map<number, number>;      // Hour -> receptivity score
    conversationDepth: Map<number, number>; // Turn count -> receptivity
    emotionalState: Map<string, number>;    // Emotion -> receptivity
  };
  
  // Response patterns (observed)
  responseToRecall: {
    positive: string[];   // Topics where recall was welcomed
    negative: string[];   // Topics where recall was deflected
    neutral: string[];    // Topics with no strong signal
  };
  
  // Sensitivity map
  sensitiveTopics: Set<string>;
  
  // Phrasing preferences
  preferredPhrasingStyle: 'direct' | 'subtle' | 'question' | 'mixed';
  
  // Timing preferences
  typicalRecallFrequency: number; // Memories per session
}

interface LearningEngine {
  // Update profile from interaction
  learn(
    userId: string,
    memoryId: string,
    surfacingContext: SurfacingContext,
    userResponse: UserResponse
  ): Promise<void>;
  
  // Get current profile
  getProfile(userId: string): Promise<UserMemoryProfile>;
  
  // Predict user's preference
  predictReceptivity(
    userId: string,
    memory: MemoryNode,
    context: ConversationContext
  ): Promise<number>;
}
```

---

### 4. Memory Consolidation & Decay

**What it does:** Manages memory lifecycle - consolidation, reinforcement, decay.

**Current state:** Memories accumulate forever. No cleanup.

**Target state:** Organic memory management like human brain:
- **Consolidation:** Merge related memories into richer nodes
- **Reinforcement:** Strengthen memories that are accessed
- **Decay:** Fade memories that aren't relevant
- **Pruning:** Remove truly irrelevant memories
- **Emotional protection:** High-emotion memories decay slower

```typescript
// PROPOSED: src/memory/memory-lifecycle.ts

interface MemoryLifecycle {
  // Run consolidation pass
  consolidate(userId: string): Promise<ConsolidationReport>;
  
  // Apply decay to all memories
  applyDecay(userId: string): Promise<DecayReport>;
  
  // Reinforce a memory (called on access)
  reinforce(memoryId: string): Promise<void>;
  
  // Prune low-value memories
  prune(userId: string, threshold: number): Promise<PruneReport>;
}

interface ConsolidationStrategy {
  // How to merge similar memories
  merge(memories: MemoryNode[]): Promise<MemoryNode>;
  
  // How to detect mergeable clusters
  findClusters(
    memories: MemoryNode[],
    similarityThreshold: number
  ): Promise<MemoryNode[][]>;
}

interface DecayStrategy {
  // Calculate decay factor
  calculateDecay(
    memory: MemoryNode,
    daysSinceCreation: number,
    daysSinceAccess: number
  ): number;
  
  // Emotional salience protection
  emotionalProtection(memory: MemoryNode): number;
}
```

---

## What Needs to Be Refactored

### Refactor 1: Unify Memory Storage

**Current:** 5+ storage systems that don't talk to each other.

**Target:** Single source of truth with views.

```
CURRENT:
├── firestore-store.ts        # Documents
├── firestore-vector-store.ts # Embeddings
├── redis-cache.ts            # Session
├── in-memory-store.ts        # Hot
└── superhuman/*.ts           # Domain-specific

TARGET:
├── unified-memory-store.ts   # Single API
│   ├── storage/
│   │   ├── graph-layer.ts    # Associative links
│   │   ├── vector-layer.ts   # Semantic search
│   │   ├── document-layer.ts # Structured data
│   │   └── cache-layer.ts    # Hot data
│   └── index.ts              # Unified interface
```

```typescript
// PROPOSED: src/memory/unified-memory-store.ts

interface UnifiedMemoryStore {
  // Write (handles all storage concerns)
  store(memory: Memory): Promise<StoredMemory>;
  
  // Read (intelligent retrieval)
  recall(query: RecallQuery): Promise<RecallResult>;
  
  // Search (semantic + structured + graph)
  search(params: SearchParams): Promise<SearchResult>;
  
  // Update
  update(id: string, updates: Partial<Memory>): Promise<void>;
  
  // Lifecycle
  consolidate(): Promise<void>;
  decay(): Promise<void>;
}
```

---

### Refactor 2: Merge Context Builders into Intelligence Layer

**Current:** 8+ context builders all inject separately.

**Target:** Single intelligence layer that coordinates.

```typescript
// CURRENT: Scattered injection
const injections = [];
injections.push(await buildMemoryContext(...));
injections.push(await buildProactiveMemoryContext(...));
injections.push(await buildHumanMemoryContext(...));
injections.push(await buildSuperhumanContext(...));
// ...more

// TARGET: Coordinated intelligence
const intelligence = await memoryIntelligence.prepareForTurn({
  userText,
  conversationContext,
  userState,
  persona,
});

// Intelligence decides what to inject
const injection = intelligence.formatForLLM();
```

---

### Refactor 3: Memory-First Tool Architecture

**Current:** Tools are separate from memory. Memory is "context".

**Target:** Tools are memory-aware at their core.

```typescript
// CURRENT: Tool receives context as afterthought
async function someCoachingTool(params, context) {
  // Context has some memory, maybe
  const memory = context.userData?.memories;
  // Tool does its thing, maybe uses memory
}

// TARGET: Tool is built on memory foundation
async function someCoachingTool(params, context) {
  const memoryIntel = context.memoryIntelligence;
  
  // Tool asks intelligence for relevant memories
  const relevantHistory = await memoryIntel.getRelevantHistory(params.topic);
  
  // Tool can store new memories
  await memoryIntel.recordInsight({
    content: userResponse,
    importance: 'high',
    topic: params.topic,
  });
  
  // Tool response is memory-informed
  return generateResponse(params, relevantHistory);
}
```

---

### Refactor 4: Replace Semantic Router with Memory-Aware Router

**Current:** Semantic router matches tools by pattern/embedding.

**Target:** Router considers user's full memory context.

```typescript
// CURRENT: Pattern matching only
const match = semanticRouter.route("I'm stressed about work");
// Returns: stress-management tools

// TARGET: Memory-informed routing
const match = memoryAwareRouter.route("I'm stressed about work", {
  userId,
  
  // Router KNOWS user's history
  memoryContext: {
    previousStressDiscussions: 12,
    lastStressTool: 'burnoutAssessment',
    toolsThatHelped: ['breathingExercise', 'prioritizationMatrix'],
    toolsThatDidnt: ['timeBlocking'], // User abandoned it
    relatedMemories: ["Presentation anxiety", "Boss conflict"],
  }
});

// Returns: Tools that WORKED for this user, not just pattern match
```

---

## What Can Be Removed

### Remove: Redundant Memory Systems

- `emotional-memory-unified.ts` → Merge into unified store
- `emotional-threading.ts` → Part of associative cortex
- `tiered-memory-storage.ts` → Handled by unified store
- `memory-decay.ts` → Part of lifecycle manager
- `memory-deduplication.ts` → Part of consolidation
- `lsh-deduplication.ts` → Part of consolidation

### Remove: Overlapping Context Builders

- `memory/memory.ts` 
- `memory/advanced-memory.ts`
- `memory/proactive-memory.ts`
- `memory/human-memory.ts`
- `memory/unified-memory-orchestrator.ts`

→ **Replace all with single `MemoryIntelligence` class**

### Remove: Scattered Superhuman Services

Keep the **logic** but consolidate the **storage and retrieval**:

- `commitment-keeper.ts` → Logic stays, storage moves to unified
- `predictive-coaching.ts` → Logic stays, storage moves to unified
- etc.

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Unified memory store without breaking existing functionality.

1. Create `unified-memory-store.ts` as facade over existing systems
2. Route all memory reads/writes through it
3. Add associative link tracking (start building graph)
4. Deploy behind feature flag

### Phase 2: Intelligence Layer (Weeks 3-4)

**Goal:** Memory Intelligence replaces context builders.

1. Create `MemoryIntelligence` class
2. Implement timing engine
3. Replace scattered context builders with single injection point
4. Add basic learning (track user responses)

### Phase 3: Associative Cortex (Weeks 5-6)

**Goal:** Graph-based memory with spreading activation.

1. Build graph overlay on Firestore (or migrate to Neo4j)
2. Implement link detection algorithm
3. Implement spreading activation recall
4. Enable "hidden connection" discovery

### Phase 4: Learning & Lifecycle (Weeks 7-8)

**Goal:** Memory that learns and evolves.

1. Implement consolidation algorithm
2. Implement decay with emotional protection
3. Train per-user timing model
4. Add feedback loop from user responses

### Phase 5: Tool Integration (Weeks 9-10)

**Goal:** Tools are memory-native.

1. Refactor tool context to include memory intelligence
2. Update tools to read/write through intelligence layer
3. Memory-aware semantic router
4. Remove legacy memory access patterns

---

## Success Metrics

| Metric | Current | Target | Why It Matters |
|--------|---------|--------|----------------|
| Memory recall accuracy | Unknown | >95% | Users trust the recall |
| "How did you know?" moments | Rare | 5+ per 100 sessions | The magic moment |
| Time to relevant memory | ~200ms | <50ms | Feels instant |
| Memory storage efficiency | Unbounded | Stable | System sustainability |
| User satisfaction with recall | Unknown | >4.5/5 | Core value prop |
| Cross-session continuity | Weak | Strong | Relationship depth |

---

## The North Star

> **A year from now, a user should be able to say:**
> 
> "Ferni remembered that conversation I had with my mom six months ago, 
> connected it to what I was feeling today about the job offer, 
> and helped me see a pattern I never would have noticed on my own.
> 
> It felt like talking to someone who truly knows me."

That's Better Than Human.

---

*December 31, 2024*
