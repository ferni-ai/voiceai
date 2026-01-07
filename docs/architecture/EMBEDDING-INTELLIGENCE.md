# Embedding Intelligence Architecture

> "We believe in making AI human, and the decisions we make will reflect that."

This document describes Ferni's **Embedding-Powered Predictive Intelligence** system - 7 capabilities that use vector embeddings to provide semantic understanding beyond pattern matching.

---

## Overview

Traditional pattern detection matches exact strings or keywords. Embedding intelligence understands **meaning** - detecting when a user is *semantically close* to avoided topics, even if they never use the exact words.

```
Traditional:  "father" triggers avoidance detection
Embeddings:   "authority figures who disappointed me" also triggers
              (semantically similar to avoided "father" topic)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMBEDDING INTELLIGENCE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │
│  │  Semantic   │  │ Trajectory  │  │   Breakthrough      │     │
│  │  Avoidance  │  │  Patterns   │  │   Embeddings        │     │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘     │
│         │                │                     │                 │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────────┴──────────┐     │
│  │ Conversation│  │  Cognitive  │  │   Ripple Embedding  │     │
│  │ Trajectory  │  │  Similarity │  │      Space          │     │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘     │
│         │                │                     │                 │
│         └────────────────┼─────────────────────┘                │
│                          │                                       │
│                 ┌────────┴────────┐                              │
│                 │  Intervention   │                              │
│                 │    Matching     │                              │
│                 └────────┬────────┘                              │
│                          │                                       │
├──────────────────────────┼──────────────────────────────────────┤
│                          ▼                                       │
│              ┌───────────────────────┐                           │
│              │  Embedding Persistence │ ← Firestore              │
│              │  (Hydration + Flush)   │                          │
│              └───────────────────────┘                           │
│                          │                                       │
│              ┌───────────┴───────────┐                           │
│              │    Entity Synergy     │ ← Knowledge Graph         │
│              └───────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## The 7 Capabilities

### 1. Semantic Avoidance Detection
**File:** `semantic-avoidance.ts`

Goes beyond exact topic matching to find **thematically related** avoided topics.

**Example:**
- User avoids "relationship:father"
- System also detects avoidance of:
  - "authority figures"
  - "disappointment from men"  
  - "being judged by dad"

**Key Functions:**
- `recordAvoidanceWithEmbedding()` - Record avoided topic with embedding
- `findRelatedAvoidances()` - Find semantically similar avoided topics
- `isNearAvoidedTerritory()` - Check if current topic approaches avoided areas
- `detectSemanticCircling()` - Detect when conversation orbits avoided topic

---

### 2. Trajectory Pattern Library
**File:** `trajectory-patterns.ts`

Embeds past emotional trajectories to match current patterns against history.

**Example:**
```
"Last time you had these signals, anxiety spike happened within 3 days."
```

**Key Functions:**
- `recordTrajectoryPattern()` - Store emotional sequence with embeddings
- `findSimilarPatterns()` - Match current state to historical patterns
- `predictTrajectoryFromPatterns()` - Predict what's coming based on history
- `recordTrajectoryOutcome()` - Learn from outcomes to improve predictions

---

### 3. Breakthrough Embeddings
**File:** `breakthrough-embeddings.ts`

Finds similar past breakthrough moments to recognize when conditions are right.

**Example:**
```
"A similar pattern led to your insight about self-worth 3 months ago."
```

**Key Functions:**
- `recordBreakthroughWithEmbeddings()` - Store breakthrough with context embedding
- `findSimilarBreakthroughs()` - Match current conditions to past breakthroughs
- `predictBreakthroughReadiness()` - Assess how ready user is for insight
- `getOptimalCatalysts()` - What has triggered breakthroughs for this user?

---

### 4. Conversation Semantic Trajectory
**File:** `conversation-trajectory.ts`

Tracks how semantic space shifts **in real-time** during conversation.

**Detects:**
- Circling an avoided topic
- Semantic drift from start
- Depth progression (surface → deep)
- Topic coherence vs scattered

**Key Functions:**
- `startTrajectory()` - Begin tracking for session
- `recordTurn()` - Record each message with embedding
- `analyzeTrajectory()` - Get pattern/depth/coherence analysis
- `checkAvoidanceApproach()` - Detect approaching avoided territory

---

### 5. Cognitive Fingerprint Similarity
**File:** `cognitive-similarity.ts`

Privacy-preserving community learning from similar cognitive profiles.

**Example:**
```
"People with your cognitive pattern respond well to reflective questions."
```

**Key Functions:**
- `registerFingerprintForCommunity()` - Embed cognitive profile
- `findSimilarProfiles()` - Find users with similar patterns
- `getCommunityInsights()` - Aggregated learnings from similar users
- `getCommunityInterventionSuccess()` - What works for similar profiles?

---

### 6. Ripple Embedding Space
**File:** `ripple-embedding-space.ts`

Maps life domains in embedding space to predict cascade effects.

**Example:**
```
Work stress → Sleep quality → Energy → Relationships
(Domains semantically close are likely to influence each other)
```

**Key Functions:**
- `initializeDomainSpace()` - Create embedding for all life domains
- `recordDomainInfluence()` - Track observed cross-domain effects
- `predictRipplePath()` - Predict cascade from event
- `findDomainClusters()` - Find domains that move together

---

### 7. Intervention-Situation Matching
**File:** `intervention-matching.ts`

Embeds situations to find optimal interventions from past success.

**Example:**
```
"In similar situations, validation worked 85% of the time."
```

**Key Functions:**
- `recordSituationOutcome()` - Store situation + intervention + outcome
- `getInterventionRecommendations()` - Get best approaches for current situation
- `getBestIntervention()` - Single best recommendation
- `getInterventionStats()` - User's intervention success rates

---

## Data Flow

### Session Start
```
initializeEmbeddingSession(userId, sessionId)
    │
    ├─→ Load from Firestore (all 6 collections)
    │
    ├─→ Hydrate in-memory Maps:
    │     • semanticAvoidance.hydrateFromPersistence()
    │     • trajectoryPatterns.hydrateFromPersistence()
    │     • breakthroughEmbeddings.hydrateFromPersistence()
    │     • rippleEmbeddingSpace.hydrateFromPersistence()
    │     • interventionMatching.hydrateFromPersistence()
    │     • cognitiveSimilarity.hydrateFromPersistence()
    │
    └─→ Start conversation trajectory tracking
```

### Each Turn
```
conversationTrajectory.recordTurn(sessionId, {
    text: userMessage,
    speaker: 'user',
    emotionalValence: emotion
})
    │
    └─→ Updates:
          • Turn embeddings
          • Semantic drift metrics
          • Depth progression
          • Avoidance proximity
```

### Session End
```
cleanupEmbeddingSession(userId, sessionId)
    │
    ├─→ End trajectory tracking
    │
    └─→ markEmbeddingDirty(userId)
          │
          └─→ flushEmbeddingState(userId)
                │
                └─→ Save all state to Firestore:
                      • semantic_avoidance
                      • trajectory_patterns
                      • breakthrough_embeddings
                      • ripple_space
                      • intervention_situations
                      • cognitive_fingerprint
```

---

## Firestore Collections

All embedding data is stored in:
```
bogle_users/{userId}/embedding_intelligence/{docName}
```

| Document | Data |
|----------|------|
| `semantic_avoidance` | Avoidance embeddings + clusters |
| `trajectory_patterns` | Historical emotional trajectories |
| `breakthrough_embeddings` | Past breakthrough contexts |
| `ripple_space` | Domain embeddings + influence vectors |
| `intervention_situations` | Situation-intervention-outcome records |
| `cognitive_fingerprint` | User's cognitive profile embedding |

---

## Behavioral Signals

The embedding intelligence emits behavioral signals via `embedding-predictive.behavioral.ts`:

| Condition | Signal |
|-----------|--------|
| Circling detected | `tone: 'gentle'`, callback for naming pattern |
| Approaching avoided | `spiralRiskMode: true`, `tone: 'warm'` |
| Deepening conversation | `tone: 'encouraging'`, `depth: 'deep'` |
| Breakthrough readiness | `breakthroughMode: true`, optimal catalyst callback |
| Emotional decline | `tone: 'warm'`, prevention callback |
| Intervention match | Maps intervention type to tone/style |

---

## Entity Store Synergy

`entity-synergy.ts` connects embedding intelligence with the Entity Store:

| Function | Purpose |
|----------|---------|
| `findEntitiesRelatedToAvoidance()` | Link entities to avoided topics |
| `getEntityContextForTrajectory()` | Which entities involved in pattern? |
| `findEntitiesForBreakthrough()` | Entities related to insight |
| `enrichAvoidanceWithEntities()` | Add entity context to avoidance |

---

## Performance Considerations

### Embedding Generation
- Embeddings are generated via `embed()` and `embedBatch()` from `memory/embeddings.ts`
- Uses OpenAI or Google embedding models
- Cached to avoid redundant API calls

### In-Memory Storage
- All data kept in JavaScript `Map` objects during session
- Fast reads/writes without DB round-trips
- Persisted to Firestore on session end

### Embedding Dimensions
- Default: 1536 dimensions (OpenAI ada-002)
- Similarity: Cosine similarity via `cosineSimilarity()`
- SIMD-accelerated when available via `rust-accelerator.js`

---

## Testing

```bash
# Run embedding capability tests
pnpm vitest run src/intelligence/predictive/embeddings/

# Tests cover:
# - Recording and retrieval for all 7 capabilities
# - Hydration and persistence
# - Similarity matching
# - Context building
```

---

## Key Files

| File | Purpose |
|------|---------|
| `embeddings/index.ts` | Entry point, unified context builder |
| `embeddings/embedding-persistence.ts` | Firestore save/load/hydrate |
| `embeddings/entity-synergy.ts` | Entity Store integration |
| `behavioral/builders/embedding-predictive.behavioral.ts` | Behavioral signals |
| `predictive-intelligence-integration.ts` | Turn processing integration |

---

## Future Enhancements

1. **Streaming Embeddings** - Generate embeddings in real-time as user speaks
2. **Cross-User Learning** - Aggregate patterns while preserving privacy
3. **Embedding Compression** - Reduce storage with quantization
4. **Semantic Caching** - Cache similar queries to reduce embedding calls
5. **Multi-Modal** - Embed voice prosody alongside text

---

## Related Documentation

- `BETTER-THAN-HUMAN-V4.md` - The 8 superhuman predictive capabilities
- `SUPERHUMAN-MEMORY-ARCHITECTURE.md` - Memory system overview
- `UNIFIED-MEMORY-ARCHITECTURE.md` - Entity Store details
- `CONTEXT-BUILDERS-RATIONALIZATION.md` - Behavioral builder patterns
