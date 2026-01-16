# Data Entity Right-Sizing Strategy

> **"Better than Human" Data Architecture**
>
> A human assistant forgets, loses context, and can't track patterns over time.
> Ferni remembers everything—but only if we architect data to scale.

## Executive Summary

This document outlines a comprehensive strategy for right-sizing entities and data services across the Ferni platform. The goal is to ensure our data architecture supports "Better than Human" memory while remaining performant, cost-effective, and scalable from 10K to 1M+ users.

**Current State:** B+ (Good foundation, needs refinement)
**Target State:** A (Production-ready for scale)

---

## 1. The Problem: Single-Document Anti-Patterns

### What We Found

| Issue | Location | Risk Level |
|-------|----------|------------|
| Unbounded arrays in documents | Communication preferences, decisions | 🔴 High |
| Embeddings stored with metadata | Conversation summaries | 🟡 Medium |
| No TTL/cleanup policies | Superhuman cache, old sessions | 🔴 High |
| Missing composite indexes | Various query patterns | 🟡 Medium |

### Why This Matters

Firestore has a **1MB document size limit**. A single user with:
- 500 conversation summaries with embeddings = ~3MB (💥 FAILS)
- 1000 communication preferences = ~500KB (approaching limit)
- Years of decision records = unbounded growth

**Human analogy:** It's like trying to stuff everything about a person into a single filing cabinet. Eventually, the drawer won't close.

---

## 2. Right-Sizing Principles

### The "Better than Human" Data Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER DATA ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   HOT       │   │   WARM      │   │   COLD      │           │
│  │   (< 7d)    │   │  (7-90d)    │   │  (> 90d)    │           │
│  │             │   │             │   │             │           │
│  │ • Current   │   │ • Recent    │   │ • Archive   │           │
│  │   session   │   │   patterns  │   │ • BigQuery  │           │
│  │ • Active    │   │ • Weekly    │   │   exports   │           │
│  │   goals     │   │   summaries │   │ • Cold      │           │
│  │ • Today's   │   │ • Monthly   │   │   storage   │           │
│  │   context   │   │   trends    │   │             │           │
│  │             │   │             │   │             │           │
│  │ Firestore   │   │ Firestore   │   │ BigQuery    │           │
│  │ (fast)      │   │ (indexed)   │   │ (cheap)     │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Bounded Collections**: Every collection has explicit size limits
2. **Temporal Separation**: Hot/warm/cold data in different storage
3. **Single-Purpose Documents**: One document = one entity
4. **Lazy Denormalization**: Duplicate data only for read performance
5. **TTL by Default**: Every document knows when it expires

---

## 3. Entity Right-Sizing Catalog

### Category A: User Profile (Root)

**Current:** Single document with some embedded arrays
**Target:** Lean root with pointers to subcollections

```typescript
// BEFORE: Fat root document
interface UserProfile {
  id: string;
  name: string;
  conversationSummaries: ConversationSummary[];  // ❌ Unbounded
  keyMoments: KeyMoment[];                        // ❌ Unbounded
  goals: FinancialGoal[];                         // ❌ Unbounded
  preferences: UserPreferences;                   // ✅ OK (small)
}

// AFTER: Lean root with references
interface UserProfile {
  id: string;
  name: string;
  preferences: UserPreferences;              // ✅ Small, bounded
  stats: {
    totalSessions: number;
    lastActiveAt: Date;
    summaryCount: number;                    // ✅ Counter, not array
    momentCount: number;
    goalCount: number;
  };
  // Arrays moved to subcollections
}
```

**Migration Path:**
1. Add counter fields to root
2. Migrate arrays to subcollections
3. Remove array fields from root
4. Update queries to use subcollections

---

### Category B: Conversation Summaries

**Current:** Summaries with embedded 1536-dim embeddings
**Target:** Separate metadata and vector storage

```
BEFORE:
bogle_users/{userId}/summaries/{id}
  ├── timestamp
  ├── mainTopics[]
  ├── keyPoints[]
  └── embedding[1536]  ← 6KB per summary!

AFTER:
bogle_users/{userId}/summaries/{id}
  ├── timestamp
  ├── mainTopics[]
  ├── keyPoints[]
  └── hasEmbedding: true  ← Reference only

bogle_users/{userId}/embeddings/{summaryId}
  └── vector[1536]  ← Isolated, can use vector DB
```

**Benefits:**
- Summaries stay under 1KB each
- Can migrate embeddings to Pinecone/Weaviate later
- Queries that don't need embeddings are 6x faster

---

### Category C: Memory Systems

**Current:** Multiple arrays in single documents
**Target:** One document per memory unit

```
BEFORE:
memory_systems/communication_preferences
  └── preferences: [{...}, {...}, ...]  ← Array grows forever

AFTER:
memory_systems/communication_preferences/{preferenceId}
  ├── type: "call_time"
  ├── value: "morning"
  ├── confidence: 0.85
  ├── observedCount: 12
  ├── firstObserved: Date
  ├── lastObserved: Date
  └── expiresAt: Date  ← TTL!
```

**Query Change:**
```typescript
// BEFORE: Load all, filter in memory
const prefs = await getDoc('communication_preferences');
const morningPref = prefs.preferences.find(p => p.type === 'call_time');

// AFTER: Query only what you need
const morningPref = await getDocs(
  query(
    collection('communication_preferences'),
    where('type', '==', 'call_time'),
    orderBy('confidence', 'desc'),
    limit(1)
  )
);
```

---

### Category D: CEO Coaching Data

**Current:** Already well-structured with subcollections ✅
**Enhancement:** Add TTL and archival policies

```typescript
// Already good structure:
ceo_wins/{id}           // One win per document ✅
ceo_energy/{id}         // One entry per document ✅
ceo_decisions/{id}      // One decision per document ✅

// ADD: TTL fields
interface CEOWin {
  // ... existing fields
  createdAt: Date;
  expiresAt: Date;      // Auto-delete after 2 years
  archived: boolean;     // Moved to cold storage
}
```

---

### Category E: Superhuman Cache

**Current:** Unbounded cache growth
**Target:** TTL-based auto-expiration

```typescript
// ADD to all cache documents
interface CachedInsight {
  userId: string;
  serviceId: string;
  data: unknown;
  createdAt: Date;
  expiresAt: Date;        // TTL: 7 days for most
  hitCount: number;       // Track usage
  lastAccessedAt: Date;   // LRU eviction
}

// Scheduled cleanup job
async function cleanupExpiredCache() {
  const expired = await getDocs(
    query(
      collectionGroup('superhuman_cache'),
      where('expiresAt', '<', new Date()),
      limit(500)
    )
  );
  await batchDelete(expired.docs);
}
```

---

## 4. Implementation Roadmap

### Phase 1: Immediate (This Sprint) - Prevent Growth

| Task | File | Effort |
|------|------|--------|
| Add TTL to superhuman cache | `firestore-utils.ts` | 2h |
| Add TTL to session documents | `session-manager.ts` | 2h |
| Create cleanup scheduled job | `scheduled-jobs.ts` | 4h |
| Add document size monitoring | `observability-routes.ts` | 4h |

**Cleanup Job Pattern:**
```typescript
// src/services/data-hygiene/ttl-cleanup.ts
export async function runTTLCleanup() {
  const collections = [
    'superhuman_cache',
    'sessions',
    'tool_executions',
    'intents'
  ];

  for (const coll of collections) {
    const expired = await getDocs(
      query(
        collectionGroup(coll),
        where('expiresAt', '<', new Date()),
        limit(500)
      )
    );

    log.info({ collection: coll, count: expired.size }, 'Cleaning expired documents');
    await batchDelete(expired.docs);
  }
}
```

### Phase 2: Short-term (Next 2 Sprints) - Restructure

| Task | File | Effort |
|------|------|--------|
| Separate embeddings from summaries | `firestore-store.ts` | 8h |
| Migrate preferences to subcollection | `firestore-memory-persistence.ts` | 8h |
| Add composite indexes | `firestore.indexes.json` | 4h |
| Update queries for new structure | Various | 8h |

**Embedding Separation Migration:**
```typescript
// Migration script
async function migrateEmbeddings(userId: string) {
  const summaries = await getDocs(collection(`bogle_users/${userId}/summaries`));

  const batch = db.batch();
  for (const doc of summaries.docs) {
    const data = doc.data();
    if (data.embedding) {
      // Move embedding to separate collection
      const embeddingRef = doc.ref.parent.parent
        .collection('embeddings')
        .doc(doc.id);
      batch.set(embeddingRef, {
        vector: data.embedding,
        createdAt: data.timestamp
      });

      // Remove from summary
      batch.update(doc.ref, {
        embedding: deleteField(),
        hasEmbedding: true
      });
    }
  }
  await batch.commit();
}
```

### Phase 3: Long-term (Roadmap) - Scale Architecture

| Task | Timeline | Benefit |
|------|----------|---------|
| Vector DB integration (Pinecone) | Q2 | Semantic search at scale |
| BigQuery archival pipeline | Q2 | 90% cost reduction for cold data |
| Multi-region replication | Q3 | Global latency improvement |
| Spanner migration for graph | Q3 | True relational queries |

---

## 5. Index Strategy

### Required Composite Indexes

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "summaries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "superhuman_cache",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "ceo_energy",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "ceo_wins",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "communication_preferences",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "confidence", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### Deploy Indexes Before Queries

```bash
# Deploy indexes
firebase deploy --only firestore:indexes

# Verify index status
firebase firestore:indexes
```

---

## 6. Monitoring & Alerts

### Document Size Monitoring

```typescript
// src/services/observability/document-size-monitor.ts
export async function checkDocumentSizes() {
  const alerts: SizeAlert[] = [];

  // Sample users to check
  const users = await getDocs(
    query(collection('bogle_users'), limit(100))
  );

  for (const user of users.docs) {
    const subcollections = [
      'summaries',
      'communication_preferences',
      'superhuman_cache'
    ];

    for (const subcoll of subcollections) {
      const docs = await getDocs(collection(`bogle_users/${user.id}/${subcoll}`));

      // Estimate document sizes
      for (const doc of docs.docs) {
        const size = JSON.stringify(doc.data()).length;
        if (size > 500_000) {  // 500KB warning threshold
          alerts.push({
            userId: user.id,
            collection: subcoll,
            docId: doc.id,
            size,
            threshold: 'warning'
          });
        }
        if (size > 900_000) {  // 900KB critical threshold
          alerts.push({
            userId: user.id,
            collection: subcoll,
            docId: doc.id,
            size,
            threshold: 'critical'
          });
        }
      }
    }
  }

  if (alerts.length > 0) {
    log.warn({ alerts }, 'Document size alerts detected');
    // Send to PagerDuty/Slack
  }

  return alerts;
}
```

### Scheduled Health Check

```typescript
// Run daily at 3 AM
export const dataHealthJob = {
  schedule: '0 3 * * *',
  handler: async () => {
    await runTTLCleanup();
    await checkDocumentSizes();
    await reportStorageMetrics();
  }
};
```

---

## 7. Cost Optimization

### Current vs Target Costs (per 100K users)

| Category | Current | After Optimization |
|----------|---------|-------------------|
| Firestore reads | $500/mo | $300/mo (-40%) |
| Firestore storage | $200/mo | $80/mo (-60%) |
| Firestore writes | $150/mo | $100/mo (-33%) |
| **Total** | **$850/mo** | **$480/mo** |

### How We Save

1. **TTL cleanup**: Remove 60% of stale data
2. **Embedding separation**: Reduce query transfer by 80%
3. **Batch reads**: Fewer round trips
4. **Cold storage**: BigQuery is 90% cheaper for archival

---

## 8. Migration Safety

### Blue-Green Data Migration

```typescript
async function safeDataMigration(userId: string) {
  // 1. Write to NEW structure
  await writeNewStructure(userId);

  // 2. Verify data integrity
  const valid = await verifyMigration(userId);
  if (!valid) {
    log.error({ userId }, 'Migration verification failed');
    return { success: false };
  }

  // 3. Update flag to read from NEW
  await updateMigrationFlag(userId, 'v2');

  // 4. Keep OLD data for 7 days (rollback window)
  await scheduleCleanup(userId, 'v1', addDays(new Date(), 7));

  return { success: true };
}
```

### Rollback Plan

```typescript
async function rollbackMigration(userId: string) {
  // Check if old data still exists
  const oldData = await getOldStructure(userId);
  if (!oldData) {
    throw new Error('Rollback window expired');
  }

  // Revert flag
  await updateMigrationFlag(userId, 'v1');

  // Clean up new structure
  await deleteNewStructure(userId);

  log.info({ userId }, 'Migration rolled back');
}
```

---

## 9. Success Metrics

### Before/After Targets

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Max document size | ~800KB | < 100KB | Size monitor |
| Query latency P95 | 200ms | < 100ms | Observability |
| TTL coverage | 20% | 100% | Schema audit |
| Storage per user | 5MB | 1MB | Firebase console |
| Cold data ratio | 0% | 60% | BigQuery export |

### Validation Queries

```typescript
// Monitor progress
export async function getDataHealthMetrics() {
  return {
    avgDocumentSize: await calculateAvgDocSize(),
    documentsWithTTL: await countDocsWithTTL(),
    expiredDocsRemaining: await countExpiredDocs(),
    embeddingsSeparated: await countSeparatedEmbeddings(),
    coldDataArchived: await countArchivedRecords()
  };
}
```

---

## 10. Summary: The Path to "Better than Human" Data

| Phase | Timeline | Outcome |
|-------|----------|---------|
| **Phase 1** | This sprint | Stop unbounded growth with TTL |
| **Phase 2** | Next 2 sprints | Right-size all entities |
| **Phase 3** | Q2-Q3 | Scale to 1M+ users |

### Key Actions

1. **Today**: Add TTL to cache and session documents
2. **This Week**: Deploy document size monitoring
3. **This Sprint**: Create cleanup scheduled job
4. **Next Sprint**: Separate embeddings from summaries
5. **Q2**: Integrate vector database for semantic search
6. **Q3**: BigQuery archival for cold data

---

## Appendix: Entity Size Guidelines

| Entity Type | Max Size | TTL | Archive After |
|-------------|----------|-----|---------------|
| User profile root | 50KB | Never | Never |
| Conversation summary | 10KB | 2 years | 90 days |
| Embedding vector | 10KB | 2 years | 90 days |
| Communication pref | 1KB | 1 year | Never |
| CEO win | 2KB | 2 years | 1 year |
| CEO energy | 500B | 1 year | 90 days |
| Superhuman cache | 50KB | 7 days | Never |
| Session state | 20KB | 24 hours | Never |
| Tool execution | 5KB | 30 days | 7 days |

---

*Document created: January 2026*
*Owner: Platform Architecture*
*Review cycle: Quarterly*
