# Semantic Router - Persistence & Vector Store Status

> **Status: ✅ PRODUCTION READY**

This document tracks the persistence implementation status for the semantic router.

---

## Current State Summary

| Component | Storage Type | Persisted? | Production Ready? |
|-----------|-------------|------------|-------------------|
| **Corrections** | Firestore + In-memory | ✅ Yes | ✅ Yes |
| **User Preferences** | Firestore + In-memory | ✅ Yes | ✅ Yes |
| **Routing Analytics** | Firestore + In-memory | ✅ Yes | ✅ Yes |
| **A/B Test Results** | Firestore | ✅ Yes | ✅ Yes |
| **Learning State** | Firestore | ✅ Yes | ✅ Yes |
| **Personalization Profiles** | Firestore + In-memory | ✅ Yes | ✅ Yes |
| **Embedding Cache** | Redis + In-memory | ✅ Yes | ✅ Yes |
| **Tool Embedding Index** | Firestore + Redis | ✅ Yes | ✅ Yes |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 SEMANTIC ROUTER PERSISTENCE                  │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  correction-     │    │  personalization │              │
│  │  store.ts        │    │  .ts             │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│  ┌────────┴───────────────────────┴─────────┐              │
│  │         persistence/firestore-           │              │
│  │         persistence.ts                   │              │
│  │                                          │              │
│  │  • saveCorrection() / loadCorrections()  │              │
│  │  • saveUserProfile() / loadUserProfile() │              │
│  │  • saveRoutingEvent()                    │              │
│  │  • saveToolEmbedding() / loadToolEmbedding()            │
│  │  • saveABTest() / loadABTests()          │              │
│  │  • saveLearningState() / loadLearningState()            │
│  └────────┬─────────────────────────────────┘              │
│           │                                                 │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
   ┌────────────────────┐     ┌────────────────────┐
   │    FIRESTORE       │     │      REDIS         │
   │                    │     │   (Memorystore)    │
   │ Collections:       │     │                    │
   │ • semantic_router_ │     │ Keys:              │
   │   corrections      │     │ • sr:emb:*         │
   │ • semantic_router_ │     │ • sr:scores:*      │
   │   tool_embeddings  │     │ • sr:profile:*     │
   │ • semantic_router_ │     │ • sr:toolidx:*     │
   │   events/{date}/   │     │                    │
   │ • semantic_router_ │     │ TTLs:              │
   │   ab_tests         │     │ • Embeddings: 24h  │
   │ • semantic_router_ │     │ • Scores: 1h       │
   │   learning         │     │ • Profiles: 30m    │
   │ • user_tool_       │     │ • Tool Index: 7d   │
   │   profiles         │     │                    │
   └────────────────────┘     └────────────────────┘
```

---

## Firestore Collections

### `semantic_router_corrections`
Routing corrections for active learning.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique correction ID |
| `timestamp` | timestamp | When correction occurred |
| `userId` | string | User who triggered correction |
| `sessionId` | string | Session ID |
| `originalQuery` | string | User's original query |
| `predictedTool` | string | Tool the router predicted |
| `actualTool` | string | Tool that was actually used |
| `feedbackType` | string | Type of correction |

**Index:** `userId ASC, timestamp DESC`

### `user_tool_profiles`
Per-user personalization data.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | User ID (document ID) |
| `toolBoosts` | map | Per-tool boost multipliers |
| `vocabulary` | map | User's vocabulary mappings |
| `timePatterns` | map | Hour/day usage patterns |
| `totalInteractions` | number | Total interaction count |
| `lastUpdated` | timestamp | Last profile update |

### `semantic_router_tool_embeddings`
Pre-computed tool embeddings.

| Field | Type | Description |
|-------|------|-------------|
| `toolId` | string | Tool ID |
| `version` | string | Index version (e.g., 2024.12.23.1) |
| `descriptionEmbedding` | array | Description embedding vector |
| `exampleEmbeddings` | array | Example embedding vectors |
| `embeddingModel` | string | Model used (e.g., text-embedding-004) |
| `toolHash` | string | Hash for change detection |
| `createdAt` | timestamp | When computed |

**Index:** `version ASC, createdAt DESC`

### `semantic_router_events/{date}/events`
Date-partitioned routing events.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Event ID |
| `timestamp` | timestamp | Event time |
| `userId` | string | User ID |
| `inputText` | string | User input |
| `actionType` | string | Router action taken |
| `toolId` | string | Selected tool (if any) |
| `confidence` | number | Confidence score |
| `latencyMs` | number | Routing latency |
| `outcome` | map | Execution outcome |

### `semantic_router_ab_tests`
A/B test configurations and results.

| Field | Type | Description |
|-------|------|-------------|
| `testId` | string | Test ID |
| `variants` | array | Test variants |
| `metrics` | array | Metrics to track |
| `startDate` | timestamp | Test start |
| `endDate` | timestamp | Test end (optional) |
| `status` | string | running/completed/stopped |
| `results` | map | Aggregated results |

**Index:** `status ASC, startDate DESC`

### `semantic_router_learning`
Global learning state (single document).

| Field | Type | Description |
|-------|------|-------------|
| `confusionMatrix` | map | Tool confusion matrix |
| `lastRetrainTime` | timestamp | Last model retrain |
| `accuracyHistory` | array | Historical accuracy |

---

## Redis Cache Keys

| Key Pattern | TTL | Description |
|-------------|-----|-------------|
| `sr:emb:{model}:{hash}` | 24h | Embedding cache |
| `sr:scores:{context}:{hash}` | 1h | Routing score cache |
| `sr:profile:{userId}` | 30m | User profile cache |
| `sr:toolidx:{version}:{toolId}` | 7d | Tool embedding index |

---

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Redis unavailable | Falls back to in-memory LRU cache |
| Firestore unavailable | Uses in-memory only (no persistence) |
| Both unavailable | Semantic router still works, recomputes on restart |

---

## Deployment Checklist

- [x] Firestore indexes deployed
- [x] Redis configured (Memorystore for MIG, sidecar for single VM)
- [x] Environment variables set (`REDIS_HOST`, `REDIS_PORT`)
- [x] Graceful degradation tested

---

## Monitoring

Metrics available via observability hub:

```bash
curl http://<host>:8080/api/observability | jq '.semanticRouting'
```

| Metric | Description |
|--------|-------------|
| `totalRoutes` | Total routing requests |
| `bypassedLLM` | Requests that skipped LLM |
| `errors` | Error count |
| `p95LatencyMs` | 95th percentile latency |
| `cacheHitRate` | Cache effectiveness |

---

*Last updated: December 2024*
