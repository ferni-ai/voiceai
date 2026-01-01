# Better Than Human Memory Architecture

> **"Your best friend forgets. We don't."**

This document describes how memory, tool calling, vector databases, data stores, Firestore, and semantic routing come together to give Ferni superhuman recall that feels human.

---

## The Vision: What "Better Than Human" Means

Human memory is imperfect in three ways that matter for deep relationships:

| Human Limitation                                           | Ferni's Solution                        |
| ---------------------------------------------------------- | --------------------------------------- |
| **Forget details** ("What was their sister's name again?") | Perfect structured memory (Firestore)   |
| **Can't connect dots** ("Wait, is this related to...?")    | Semantic similarity (Vector DB)         |
| **Bad at patterns** ("I didn't notice I always...")        | Pattern detection (Superhuman Services) |
| **Miss context** ("Why are they upset today?")             | Contextual priming (Context Builders)   |
| **Timing is off** ("Not the right time to bring up...")    | Receptivity scoring (Perfect Timing)    |

But the goal isn't to feel like a database - it's to feel like **a friend who remembers everything** and knows when to surface what.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER INPUT (Voice/Text)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEMANTIC ROUTER (Pre-LLM)                           │
│  • Pattern matching for tool triggers                                       │
│  • Embedding similarity for intent                                          │
│  • High confidence → Execute directly                                       │
│  • Low confidence → Let LLM decide                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌─────────────────┐   ┌─────────────────────┐   ┌─────────────────────────────┐
│  TOOL EXECUTION │   │   CONTEXT BUILDERS  │   │    TURN PROCESSOR / LLM     │
│  (Direct Path)  │   │  (Memory Injection) │   │  (Generates Response)       │
└─────────────────┘   └─────────────────────┘   └─────────────────────────────┘
          │                         │                         │
          │                         ▼                         │
          │           ┌─────────────────────┐                 │
          │           │  MEMORY RETRIEVAL   │                 │
          │           │  • Semantic search  │                 │
          │           │  • Profile lookup   │                 │
          │           │  • Superhuman ctx   │                 │
          │           └─────────────────────┘                 │
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            STORAGE LAYER                                    │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│    Firestore    │   Vector Store  │     Redis       │   In-Memory Cache     │
│  (Structured)   │   (Semantic)    │  (Session L2)   │   (Hot Data)          │
│                 │                 │                 │                       │
│  • User profile │  • Embeddings   │  • Session state│  • Recent context     │
│  • Commitments  │  • Semantic     │  • Tool history │  • Embeddings         │
│  • Relationships│    search       │  • Conversation │  • LRU cache          │
│  • Values/Dreams│  • Similarity   │    cache        │                       │
│  • Patterns     │    matching     │                 │                       │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
```

---

## The Five Memory Pathways

### 1. **Structured Memory → Firestore**

Explicit facts and relationships stored in organized collections.

```
bogle_users/{userId}/
├── profile              # Name, preferences, background
├── relationships/       # People in their life
├── commitments/         # Promises, intentions, decisions
├── values/              # Stated vs demonstrated values
├── dreams/              # Long-term aspirations
├── patterns/            # Behavioral patterns
├── capacity/            # Energy/burnout tracking
├── seasonal/            # Seasonal patterns, personal dates
└── trust_profiles/      # Trust system state
```

**When Used:** Profile lookup, commitment follow-ups, relationship context.

**Files:**

- `src/memory/firestore-store.ts` - Document CRUD
- `src/services/superhuman/*.ts` - Domain-specific stores

### 2. **Semantic Memory → Vector Store**

Unstructured memories searchable by meaning, not keywords.

```typescript
// Store a memory with embedding
await vectorStore.addDocument({
  id: 'conv_123_highlight',
  text: 'User shared that their father passed away last spring. Deep grief, but finding peace through gardening.',
  embedding: await embed(text),
  metadata: {
    userId,
    type: 'key_moment',
    emotionalWeight: 0.9,
    topics: ['grief', 'family', 'gardening'],
  },
});

// Search by meaning
const results = await vectorStore.search(
  'they mentioned losing someone close', // Semantic query
  { topK: 5, filter: { userId }, minScore: 0.7 }
);
```

**When Used:** Contextual recall, connecting dots across sessions.

**Files:**

- `src/memory/firestore-vector-store/` - Vector store implementation
- `src/memory/embeddings.ts` - Embedding generation
- `src/memory/advanced-retrieval.ts` - Smart retrieval with decay/salience

### 3. **Session Memory → Redis + In-Memory**

Hot data for the current conversation.

```
Session State
├── Recent messages (10-turn window)
├── Current topic thread
├── Detected entities (people, places, topics)
├── Emotional trajectory this session
├── Tools called this session
└── Memories already surfaced (dedup)
```

**When Used:** In-session context, conversation continuity.

**Files:**

- `src/services/session-cache.ts` - Redis L2 cache
- `src/memory/in-memory-store.ts` - Fast L1 cache
- `src/conversation/topic-threading.ts` - Topic continuity

### 4. **Superhuman Memory → 19 Services**

Domain-specific intelligence that no human can match.

| Service              | Memory Type            | Recall Trigger         |
| -------------------- | ---------------------- | ---------------------- |
| Commitment Keeper    | Promises made          | Follow-up timing       |
| Predictive Coaching  | Behavioral patterns    | Pattern match          |
| Life Narrative       | Life chapters          | Story continuity       |
| Values Alignment     | Stated vs demonstrated | Contradiction detected |
| Relationship Network | People map             | Person mentioned       |
| Capacity Guardian    | Energy levels          | Overcommitment risk    |
| Dream Keeper         | Long-term aspirations  | Dormant dream check    |
| Seasonal Awareness   | Personal cycles        | Date-based             |
| Pattern Mirror       | Energy patterns        | Topic mentioned        |
| Inside Jokes         | Shared history         | Humor opportunity      |

**Files:**

- `src/services/superhuman/` - All 19 services
- `src/intelligence/context-builders/superhuman-integration.ts` - LLM injection

### 5. **Contextual Memory → Context Builders**

Smart injection based on turn state.

```
Turn Context Injections
├── Memory callbacks (reference earlier in session)
├── Cross-session memory (reference previous conversations)
├── Proactive memories (surface at right moment)
├── Persona-specific memory (what this persona should know)
├── Advanced memory (semantic retrieval)
├── Human memory (natural reference generation)
└── Superhuman context (commitment, predictions, etc.)
```

**Files:**

- `src/intelligence/context-builders/memory/` - Memory-specific builders
- `src/intelligence/context-builders/behavioral-context-builder.ts` - Unified builder

---

## How Memory Flows Into Conversation

### Step 1: Session Start (Turn 0)

```
User: "Hey Ferni"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   SESSION PRIMING                        │
├─────────────────────────────────────────────────────────┤
│ 1. Load user profile from Firestore                     │
│ 2. Build memory index (lazy, ~50ms)                     │
│ 3. Warm superhuman cache (parallel, background)         │
│ 4. Get priming memories:                                │
│    - Recent key moments                                 │
│    - Outstanding commitments                            │
│    - Relationship milestones                            │
│    - Proactive insights ready to surface                │
└─────────────────────────────────────────────────────────┘
         │
         ▼
Context Injection: "Welcome back! [Memory: You mentioned trying meditation last week]"
```

**Code Path:**

1. `src/agents/processors/turn-processor.ts` → `processTurn()`
2. `src/intelligence/context-builders/memory/advanced-memory.ts` → `getPrimingMemories()`
3. `src/services/superhuman/index.ts` → `buildSuperhumanContext()`

### Step 2: Mid-Conversation (Turn N)

```
User: "I'm stressed about the presentation"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│               CONTEXTUAL RETRIEVAL                       │
├─────────────────────────────────────────────────────────┤
│ 1. Semantic search: "stressed presentation"             │
│    → Finds: "User has public speaking anxiety (3mo ago)"│
│    → Finds: "They crushed the Q2 board meeting"         │
│                                                         │
│ 2. Structured lookup:                                   │
│    → Commitment: "Wanted to practice 3x/week"           │
│    → Pattern: "Stress spikes Sunday nights"             │
│    → Capacity: "Energy low this week (4/10)"            │
│                                                         │
│ 3. Relationship context:                                │
│    → "Boss mentioned: Sarah (positive sentiment)"       │
│    → "Colleague: Mike (source of stress)"               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
LLM sees: "[MEMORY] You've mentioned presentation anxiety before.
          But remember - you crushed the Q2 board meeting!
          [PATTERN] Stress tends to peak Sunday nights for you.
          [CAPACITY] You seem low energy this week - be gentle with yourself."
```

**Code Path:**

1. `src/memory/advanced-retrieval.ts` → `retrieveMemories()`
2. `src/services/superhuman/index.ts` → `buildSuperhumanContext()`
3. `src/agents/processors/turn-processor.ts` → `injectTurnContext()`

### Step 3: Natural Callbacks

```
Turn 5: User talks about weekend plans
Turn 8: Topic shifts to work stress
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                MEMORY CALLBACK SYSTEM                    │
├─────────────────────────────────────────────────────────┤
│ Context injection (turn 8):                             │
│ "[MEMORY CALLBACK: Earlier you mentioned hiking plans   │
│  for this weekend. That might be good stress relief     │
│  given what you're describing. Circle back if natural.]"│
└─────────────────────────────────────────────────────────┘
```

**Code Path:**

1. `src/intelligence/context-builders/memory/memory.ts` → Memory callbacks every 4-6 turns
2. `src/conversation/topic-threading.ts` → Track topic history

---

## Making Memory Feel Human

### The "I Remember" Patterns

Instead of saying "According to my records...", Ferni uses human memory phrasing:

```typescript
// From src/memory/natural-reference-generator.ts

const MEMORY_PHRASES = {
  direct: [
    'You mentioned {topic} before...',
    'I remember you saying...',
    'Last time we talked about {topic}...',
  ],
  callback: [
    'This reminds me of what you said about...',
    'Thinking back to when you...',
    'You know, this connects to...',
  ],
  commitment: [
    "How's {commitment} going?",
    'You wanted to {commitment}...',
    "I've been thinking about {commitment}...",
  ],
  relationship: ["How's {person}?", 'You mentioned {person} was...', 'Last time {person}...'],
};
```

### Timing: When NOT to Surface Memory

```typescript
// From src/services/superhuman/perfect-timing.ts

interface ReceptivityScore {
  score: number; // 0-1
  factors: {
    energy: number;
    stress: number;
    timeOfDay: number;
    conversationDepth: number;
  };
  recommendations: {
    canRaiseSensitiveTopics: boolean;
    shouldSurfacePatterns: boolean;
    idealTopics: string[];
  };
}

// Don't surface heavy memories if:
// - User is low energy (< 0.4)
// - User is highly stressed (> 0.7)
// - It's late night (lower inhibition)
// - Conversation is shallow (< 3 turns)
```

### Deduplication: Don't Repeat Yourself

```typescript
// From src/memory/memory-deduplication.ts

// Track what's been surfaced this session
const surfacedMemories = new Set<string>();

// Before surfacing a memory:
function shouldSurfaceMemory(memoryId: string): boolean {
  if (surfacedMemories.has(memoryId)) {
    return false; // Already mentioned this session
  }
  surfacedMemories.add(memoryId);
  return true;
}
```

---

## The Integration Gap: What's Missing

### Current State ✅

1. **Memory storage works** - Firestore + Vector Store operational
2. **Context injection works** - Memory flows into LLM prompts
3. **Superhuman services work** - 19 capabilities available
4. **Semantic router works** - Pre-LLM tool routing

### Gaps to Address 🟡

#### Gap 1: Tool-Memory Integration

**Problem:** Tools like `searchMemory` exist but aren't naturally triggered.

**Solution:** Memory-aware tool selection in semantic router.

```typescript
// PROPOSED: src/tools/semantic-router/memory-aware-routing.ts

async function enhanceRoutingWithMemory(
  userText: string,
  userId: string
): Promise<EnhancedRoutingContext> {
  // Search memory for relevant context
  const memoryMatches = await vectorStore.search(userText, {
    topK: 3,
    filter: { userId },
    minScore: 0.6,
  });

  return {
    userText,
    memoryContext: memoryMatches.map((m) => ({
      content: m.document.text,
      topics: m.document.metadata.topics,
      relevance: m.score,
    })),
    // Pass to router for smarter tool selection
  };
}
```

#### Gap 2: Proactive Memory Surfacing

**Problem:** Memory is reactive (user asks) not proactive (Ferni offers).

**Solution:** Proactive memory triggers based on conversation analysis.

```typescript
// PROPOSED: Enhancement to turn-processor.ts

async function checkProactiveMemory(
  analysis: TurnAnalysis,
  userId: string
): Promise<ProactiveMemoryTrigger | null> {
  // Topic trigger: User mentions something related to past memory
  const topicTrigger = await checkTopicTrigger(analysis.topics, userId);

  // Commitment trigger: Time-based follow-up
  const commitmentTrigger = await checkCommitmentTrigger(userId);

  // Pattern trigger: Behavioral pattern detected
  const patternTrigger = await checkPatternTrigger(analysis, userId);

  // Return highest priority trigger
  return selectTrigger([topicTrigger, commitmentTrigger, patternTrigger]);
}
```

#### Gap 3: Memory Consolidation

**Problem:** Many overlapping memories, no consolidation.

**Solution:** Background memory consolidation service.

```typescript
// PROPOSED: src/memory/memory-consolidator.ts (enhance existing)

async function consolidateUserMemories(userId: string): Promise<void> {
  // 1. Find semantically similar memories
  const memories = await getAllUserMemories(userId);
  const clusters = await clusterBySimilarity(memories, threshold: 0.85);

  // 2. Merge clusters into consolidated memories
  for (const cluster of clusters) {
    if (cluster.length > 1) {
      const consolidated = await mergeMemories(cluster);
      await replaceWithConsolidated(cluster, consolidated);
    }
  }

  // 3. Apply temporal decay to old, unused memories
  await applyDecay(userId, {
    baseDecay: 0.95,
    emotionalBoost: 1.5,  // High emotion memories decay slower
    accessBoost: 1.2,     // Frequently accessed memories decay slower
  });
}
```

#### Gap 4: Cross-Session Threading

**Problem:** Sessions are isolated; connecting dots across sessions is weak.

**Solution:** Thread continuity service.

```typescript
// PROPOSED: Enhancement to src/conversation/thread-context.ts

interface CrossSessionThread {
  threadId: string;
  topic: string;
  sessions: Array<{
    sessionId: string;
    date: Date;
    summary: string;
    emotionalArc: string;
  }>;
  lastDiscussed: Date;
  openQuestions: string[]; // Things to follow up on
}

// On session start, find relevant threads
async function findActiveThreads(userId: string): Promise<CrossSessionThread[]> {
  return threads.filter(
    (t) => t.openQuestions.length > 0 || isRecentEnough(t.lastDiscussed) || hasUpcomingRelevance(t) // e.g., "presentation next week"
  );
}
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (This Week) 🎯

| Task                                     | Impact | Effort  |
| ---------------------------------------- | ------ | ------- |
| Enable all 697 tools via semantic router | High   | Done ✅ |
| Add memory search to tool hint injection | High   | Low     |
| Improve proactive memory triggers        | High   | Medium  |
| Add memory reference in callbacks        | Medium | Low     |

### Phase 2: Core Integration (Next 2 Weeks)

| Task                                | Impact | Effort |
| ----------------------------------- | ------ | ------ |
| Memory-aware semantic routing       | High   | Medium |
| Thread continuity service           | High   | Medium |
| Memory consolidation background job | Medium | Medium |
| Cross-session thread UI             | Medium | High   |

### Phase 3: Superhuman Polish (Month 2)

| Task                                    | Impact | Effort |
| --------------------------------------- | ------ | ------ |
| ML-based receptivity scoring            | High   | High   |
| Predictive memory warming               | Medium | Medium |
| Memory explanation UI                   | Medium | Medium |
| A/B testing memory surfacing strategies | High   | High   |

---

## Key Files Reference

### Memory Core

```
src/memory/
├── index.ts                    # Main exports, initialization
├── advanced-retrieval.ts       # Smart retrieval with scoring
├── semantic-memory-cache.ts    # Query caching
├── embeddings.ts               # Embedding generation
├── firestore-vector-store/     # Vector store implementation
└── natural-reference-generator.ts  # Human-like phrasing
```

### Context Builders

```
src/intelligence/context-builders/
├── memory/
│   ├── advanced-memory.ts      # Semantic memory retrieval
│   ├── human-memory.ts         # Human-like recall
│   ├── proactive-memory.ts     # Proactive surfacing
│   └── unified-memory-orchestrator.ts  # Coordination
├── superhuman-integration.ts   # Superhuman services injection
└── behavioral-context-builder.ts  # Unified context
```

### Superhuman Services

```
src/services/superhuman/
├── index.ts                    # All 19 services
├── commitment-keeper.ts        # Promise tracking
├── predictive-coaching.ts      # Pattern prediction
├── relationship-network.ts     # People mapping
├── semantic-intelligence/      # Correlation, threading
└── README.md                   # Full documentation
```

### Tool Integration

```
src/tools/
├── semantic-router/            # Pre-LLM routing
│   ├── router.ts               # Main router
│   ├── voice-integration.ts    # Voice pipeline
│   └── domain-bridge.ts        # Tool execution
├── domains/                    # 697 tools
│   ├── memory/                 # Memory tools
│   └── ...
└── orchestrator/               # Tool selection
```

---

## Metrics for "Better Than Human"

### Memory Quality Metrics

| Metric              | Target         | Measurement                     |
| ------------------- | -------------- | ------------------------------- |
| Recall accuracy     | >95%           | User confirms memory is correct |
| Recall timing       | "Right moment" | User engagement after recall    |
| False positives     | <5%            | Wrong memories surfaced         |
| Natural phrasing    | >90%           | No "database" language          |
| Callback completion | >30%           | User responds to callbacks      |

### User Experience Metrics

| Signal                       | Meaning                            | Target              |
| ---------------------------- | ---------------------------------- | ------------------- |
| "How did you remember that?" | Memory surprised them              | 5+ per 100 sessions |
| User continues topic         | Memory was relevant                | >70% of recalls     |
| User corrects memory         | Memory was wrong                   | <5% of recalls      |
| Session depth increase       | Memory enabled deeper conversation | Measurable trend    |

---

## Philosophy: The Art of Memory

> **"The goal isn't to show off what we remember. It's to make them feel remembered."**

A great friend doesn't recite facts. They:

1. **Weave memories naturally** - "This reminds me of when you..."
2. **Choose timing carefully** - Not every memory needs surfacing
3. **Prioritize emotional memories** - "That thing about your dad..."
4. **Connect dots for them** - "I notice a pattern here..."
5. **Honor their journey** - "Look how far you've come..."

Ferni should feel like a friend with perfect memory, not a database with a chat interface.

---

_Last updated: December 31, 2024_
