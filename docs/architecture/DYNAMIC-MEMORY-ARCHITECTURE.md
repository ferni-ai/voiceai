# Dynamic Memory Architecture

> **State-of-the-Art Memory for Voice AI (January 2026)**

## The Problem with Static Patterns

Our current 33+ capture definitions are:
- **Brittle** - Miss anything we didn't pattern for
- **Labor-intensive** - Manual regex for everything  
- **Non-adaptive** - Doesn't learn what matters to THIS user
- **Context-blind** - Can't understand nuance or implication

## State of the Art (2026)

| System | Key Innovation | Paper/Source |
|--------|----------------|--------------|
| **Mem0** | Graph memory with 91% latency reduction | arxiv 2504.19413 |
| **PMFR** | Temporal decoupling: fast path + async deep | arxiv 2510.08175 |
| **HiMem** | Hierarchical memory (episodes + notes) | arxiv 2601.06377 |
| **ProMem** | Self-questioning iterative extraction | arxiv 2601.04463 |
| **Membox** | Topic-grouped memory boxes | arxiv 2601.03785 |
| **RxT** | Event-driven with fixed STM | arxiv 2510.03561 |

## Our New Architecture

### Three-Layer Memory System

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FERNI DYNAMIC MEMORY (2026)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  L1: SHORT-TERM (Firestore/Redis)                                   │
│  ─────────────────────────────────                                  │
│  TTL: Current session + 1 hour                                      │
│  Content: Last 10 turns, current topic, active entities             │
│  Access: < 10ms (hot cache)                                         │
│  Purpose: Immediate context for LLM                                 │
│                                                                      │
│  L2: WORKING MEMORY (Firestore + Embeddings)                        │
│  ──────────────────────────────────────────                         │
│  TTL: 7 days                                                        │
│  Content: Recent conversations, extracted facts, open loops         │
│  Access: < 100ms (vector search)                                    │
│  Purpose: Cross-session continuity                                  │
│                                                                      │
│  L3: LONG-TERM MEMORY (Spanner Graph)                               │
│  ─────────────────────────────────────                              │
│  TTL: Forever (with decay)                                          │
│  Content: Entities, relationships, patterns, insights               │
│  Access: < 200ms (graph traversal)                                  │
│  Purpose: "Better than Human" recall                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Real-Time vs Async Processing

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PROCESSING PATHS                             │
├──────────────────────────────┬──────────────────────────────────────┤
│  REAL-TIME (< 50ms)          │  ASYNC (background worker)           │
├──────────────────────────────┼──────────────────────────────────────┤
│                              │                                      │
│  User: "My mom's surgery     │  ┌────────────────────────────────┐  │
│         is tomorrow"         │  │  DeepMemoryWorker               │  │
│         │                    │  │  (Pub/Sub subscription)         │  │
│         ▼                    │  │                                 │  │
│  ┌──────────────────┐        │  │  1. LLM Entity Extraction       │  │
│  │ FastCapture      │        │  │     "mom" → Person entity       │  │
│  │                  │        │  │     "surgery" → Event           │  │
│  │ • Keyword detect │        │  │     "tomorrow" → Date           │  │
│  │ • Entity mention │        │  │                                 │  │
│  │ • Emotion signal │        │  │  2. Relationship Mapping        │  │
│  │ • Topic tag      │        │  │     mom → HAS_EVENT → surgery   │  │
│  └────────┬─────────┘        │  │     surgery → WHEN → tomorrow   │  │
│           │                  │  │                                 │  │
│           │ Fire & forget    │  │  3. Self-Questioning (ProMem)   │  │
│           │ event            │  │     "Is this new info?"         │  │
│           └──────────────────┼──│     "What's missing?"           │  │
│                              │  │     "Any contradictions?"       │  │
│  ┌──────────────────┐        │  │                                 │  │
│  │ ContextRetrieval │        │  │  4. Graph Update                │  │
│  │                  │        │  │     → Spanner Graph             │  │
│  │ • L1: STM hit?   │        │  │                                 │  │
│  │ • L2: Working?   │        │  │  5. Insight Generation          │  │
│  │ • L3: Graph?     │        │  │     "Mom's health is a concern" │  │
│  └────────┬─────────┘        │  └────────────────────────────────┘  │
│           │                  │                                      │
│           ▼                  │                                      │
│  [Context for LLM response]  │                                      │
│                              │                                      │
└──────────────────────────────┴──────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Temporal Decoupling (Week 1-2)

Split current inline extraction into fast + async paths:

```typescript
// NEW: Fast path (< 50ms)
export async function fastCapture(
  transcript: string,
  context: CaptureContext
): Promise<FastCaptureResult> {
  return {
    // Lightweight detection only
    mentionedEntities: detectEntityMentions(transcript), // regex, fast
    emotionSignal: detectEmotionKeywords(transcript),    // regex, fast  
    topicHint: detectTopicKeywords(transcript),          // regex, fast
    
    // Fire async worker
    asyncJobId: await queueDeepExtraction(transcript, context),
  };
}

// NEW: Async path (background, LLM-powered)
export class DeepMemoryWorker extends LocalWorker {
  async processExtraction(job: ExtractionJob): Promise<void> {
    const { transcript, userId, sessionId, turnNumber } = job;
    
    // 1. LLM Entity Extraction (Gemini)
    const entities = await this.extractEntities(transcript);
    
    // 2. LLM Fact Extraction
    const facts = await this.extractFacts(transcript, entities);
    
    // 3. LLM Relationship Extraction
    const relationships = await this.extractRelationships(transcript, entities);
    
    // 4. Self-Questioning (ProMem pattern)
    const refined = await this.selfQuestion(entities, facts, relationships);
    
    // 5. Write to graph
    await this.writeToGraph(userId, refined);
  }
}
```

### Phase 2: Hierarchical Memory (Week 3-4)

Implement L1/L2/L3 with proper promotion/demotion:

```typescript
// Memory tiers with automatic promotion
interface MemoryTier {
  level: 'L1_STM' | 'L2_WORKING' | 'L3_LONGTERM';
  storage: 'redis' | 'firestore' | 'spanner_graph';
  ttl: number;
  promotionThreshold: number; // mentions to promote
  demotionDecay: number;      // decay rate
}

// Automatic promotion based on mention frequency
async function maybePromote(memory: Memory): Promise<void> {
  if (memory.tier === 'L1_STM' && memory.mentionCount >= 3) {
    await promoteToWorking(memory);
  }
  if (memory.tier === 'L2_WORKING' && memory.mentionCount >= 5) {
    await promoteToLongTerm(memory);
  }
}
```

### Phase 3: Spanner Graph Integration (Week 5-6)

Move from Firestore-as-graph to native Spanner Graph:

```sql
-- Spanner Graph schema
CREATE PROPERTY GRAPH FerniMemory
  NODE TABLES (
    entities AS Entity
      PROPERTIES (id, type, name, created_at, last_mentioned, importance),
    facts AS Fact
      PROPERTIES (id, content, confidence, source_session)
  )
  EDGE TABLES (
    relationships AS Relationship
      SOURCE KEY (source_id) REFERENCES entities (id)
      DESTINATION KEY (target_id) REFERENCES entities (id)
      PROPERTIES (type, strength, created_at)
  );

-- Query: "What do we know about mom?"
SELECT entity.name, fact.content, rel.type, target.name
FROM GRAPH_TABLE (FerniMemory
  MATCH (entity:Entity {name: 'mom'})-[rel:Relationship]->(target:Entity),
        (entity)-[:HAS_FACT]->(fact:Fact)
  COLUMNS (entity.name, fact.content, rel.type, target.name)
);
```

### Phase 4: Self-Improving Extraction (Week 7-8)

Implement ProMem's self-questioning pattern:

```typescript
// Self-questioning extraction (ProMem pattern)
async function selfQuestionExtraction(
  transcript: string,
  initialExtraction: ExtractionResult
): Promise<RefinedExtraction> {
  
  const questions = [
    "What entities might I have missed?",
    "What implicit relationships are there?",
    "What emotional context is present?",
    "Does this contradict anything we know?",
    "What follow-up would be helpful?",
  ];
  
  let refined = initialExtraction;
  
  for (const question of questions) {
    const probe = await llm.generate({
      prompt: `Given this extraction: ${JSON.stringify(refined)}
               And this question: ${question}
               What additional information should we capture from: "${transcript}"`,
      schema: ExtractionRefinementSchema,
    });
    
    refined = mergeExtractions(refined, probe);
  }
  
  return refined;
}
```

### Phase 5: Dynamic Schema Discovery (Week 9-10)

Let the system discover new categories automatically:

```typescript
// Instead of 33 hardcoded capture definitions...
interface DynamicMemory {
  id: string;
  userId: string;
  
  // LLM-extracted fields (no predefined schema!)
  content: string;           // Raw extracted content
  category: string;          // LLM-inferred category
  entities: string[];        // Mentioned entities
  sentiment: number;         // Detected sentiment
  importance: number;        // LLM-scored importance
  
  // Metadata
  extractionModel: string;   // Which model extracted this
  confidence: number;        // Extraction confidence
  sourceTranscript: string;  // Original text
  
  // Learning
  userFeedback?: 'relevant' | 'irrelevant';
  wasUsedInContext: boolean; // Did we surface this?
  surfaceCount: number;      // How often surfaced
}

// System learns what categories matter for THIS user
async function discoverCategories(userId: string): Promise<string[]> {
  const memories = await getRecentMemories(userId, 100);
  
  const categoryAnalysis = await llm.generate({
    prompt: `Analyze these memories and identify the top categories 
             that matter to this specific user: ${JSON.stringify(memories)}`,
    schema: CategoryDiscoverySchema,
  });
  
  return categoryAnalysis.topCategories;
}
```

## Cost Analysis

| Operation | Current Cost | New Cost | Savings |
|-----------|-------------|----------|---------|
| Per-turn extraction | $0.002 (Gemini inline) | $0.001 (async, batched) | 50% |
| Session summarization | $0.01 (session end) | $0.005 (incremental) | 50% |
| Context retrieval | $0.001 (embedding) | $0.0005 (cached) | 50% |
| **Monthly (10K users)** | ~$2,000 | ~$800 | **60%** |

## Latency Impact

| Operation | Current | New | Target |
|-----------|---------|-----|--------|
| Fast capture | 150-300ms | < 50ms | ✅ |
| Context retrieval | 200-400ms | < 100ms | ✅ |
| Deep extraction | N/A (inline) | Background | ✅ |
| Graph query | N/A | < 200ms | ✅ |

## Google Cloud Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD INFRASTRUCTURE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐  │
│  │   Cloud Run     │     │   Pub/Sub       │     │  Cloud Tasks  │  │
│  │   (Voice Agent) │────►│   (Events)      │────►│  (Async Jobs) │  │
│  └────────┬────────┘     └─────────────────┘     └───────┬───────┘  │
│           │                                              │          │
│           │                                              │          │
│           ▼                                              ▼          │
│  ┌─────────────────┐                            ┌───────────────┐   │
│  │   Memorystore   │                            │  Vertex AI    │   │
│  │   (Redis L1)    │                            │  (Gemini)     │   │
│  │   TTL: 1 hour   │                            │  Extraction   │   │
│  └────────┬────────┘                            └───────┬───────┘   │
│           │                                              │          │
│           ▼                                              ▼          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐  │
│  │   Firestore     │     │  Spanner Graph  │◄────│  Memory       │  │
│  │   (L2 Working)  │────►│  (L3 Long-term) │     │  Worker       │  │
│  │   TTL: 7 days   │     │  TTL: Forever   │     └───────────────┘  │
│  └─────────────────┘     └─────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Migration Path

### What We Keep
- Firestore for L2 working memory (already battle-tested)
- Existing entity store structure (upgrade to graph edges)
- Async summarization worker (extend for deep extraction)
- 33 capture definitions (as fast-path fallback)

### What We Add
- Redis/Memorystore for L1 STM (< 10ms retrieval)
- Spanner Graph for L3 (native graph queries)
- DeepMemoryWorker (LLM-powered async extraction)
- Self-questioning refinement (ProMem pattern)
- Dynamic schema discovery (auto-categorization)

### What We Retire
- Inline LLM extraction (move to async)
- Pattern-only capture (hybrid: fast patterns + LLM)
- Flat Firestore "graph" (real graph in Spanner)

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Fast-path latency | 150-300ms | < 50ms |
| Memory recall accuracy | ~70% | > 90% |
| Categories discovered | 33 (manual) | Dynamic |
| User-specific learning | None | Personalized |
| Cross-domain patterns | Manual rules | Auto-discovered |

## References

- [Mem0: Scalable Memory Architecture](https://arxiv.org/abs/2504.19413)
- [PMFR: Temporal Decoupling](https://arxiv.org/abs/2510.08175)
- [HiMem: Hierarchical Memory](https://arxiv.org/abs/2601.06377)
- [ProMem: Self-Questioning Extraction](https://arxiv.org/abs/2601.04463)
- [Spanner Graph Documentation](https://cloud.google.com/spanner/docs/graph/overview)
- [Letta/MemGPT Architecture](https://docs.letta.com/concepts/memgpt)
