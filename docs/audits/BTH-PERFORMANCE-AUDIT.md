# BTH Performance Audit

**Date:** December 19, 2025  
**Target:** P50 < 200ms, P99 < 800ms response latency

---

## ✅ FIXES IMPLEMENTED

All critical performance issues have been resolved:

| Fix | Status | File |
|-----|--------|------|
| Session cache (deep-relationship) | ✅ Done | `deep-relationship.ts` |
| Session cache (temporal) | ✅ Done | `temporal-intelligence.ts` |
| Parallel Firestore reads | ✅ Done | `deep-relationship.ts` |
| Early-turn skip (turns 0-2) | ✅ Done | `deep-relationship.ts` |
| Rate-limit pattern writes | ✅ Done | `turn-learning.ts` |

### Expected Latency After Fixes

| Builder | Before | After (cache hit) | After (cache miss) |
|---------|--------|-------------------|-------------------|
| `deep-relationship.ts` | 100-200ms | **<5ms** | <100ms |
| `temporal-intelligence.ts` | 50-150ms | **<5ms** | <80ms |
| **TOTAL** | 150-350ms | **<10ms** | <180ms |

### Write Reduction

| Operation | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Temporal pattern writes | Every turn | Every 5 turns | 80% ↓ |
| Shared moment writes | Every emotional turn | Every 3rd emotional | 67% ↓ |

---

## 📜 ORIGINAL FINDINGS (for reference)

### 1. Uncached Firestore Calls on Every Turn

**Severity: HIGH**

The new BTH context builders make Firestore calls on **every single turn** without caching:

| Builder | Firestore Reads | Firestore Writes | Estimated Latency |
|---------|-----------------|------------------|-------------------|
| `deep-relationship.ts` | 2 reads | 0 writes* | 100-200ms |
| `temporal-intelligence.ts` | 1 read | 1 write** | 50-150ms |
| `commitment-follow-up.ts` | 0 | 0 | <5ms ✅ |
| `proactive-noticing.ts` | 0 | 0 | <5ms ✅ |
| **TOTAL** | **3 reads** | **1 write** | **150-350ms** |

\* Writes happen in `recordSharedMoment()` and `markMilestoneCelebrated()` - fire-and-forget
\** Write happens in `learnTemporalPattern()` - fire-and-forget in turn-learning.ts

### Impact Analysis

```
Current Turn Budget:      300-600ms
+ BTH Firestore Reads:    150-350ms
= New Total:              450-950ms 😱

Target P50:               200ms
Target P99:               800ms
```

**We are exceeding the P99 budget with these additions!**

---

## 📊 Specific Performance Issues

### Issue 1: `getRelationshipHistory()` - 2 Sequential Reads

**Location:** `src/intelligence/context-builders/deep-relationship.ts:92-109`

```typescript
// READ 1: Get user profile
const userDoc = await db.collection('bogle_users').doc(userId).get();

// READ 2: Get shared moments  
const momentsSnapshot = await db
  .collection('bogle_users').doc(userId)
  .collection('shared_moments')
  .where('type', 'in', [...])
  .limit(20)
  .get();
```

**Latency:** 100-200ms (2 sequential Firestore reads)

### Issue 2: `getUserTemporalPatterns()` - 1 Read

**Location:** `src/intelligence/context-builders/temporal-intelligence.ts:138`

```typescript
const doc = await db.collection('bogle_users').doc(userId).get();
```

**Latency:** 50-100ms per read

### Issue 3: No Per-Session Caching

All builders fetch fresh data on **every turn**, even within the same session where data hasn't changed.

---

## ✅ RECOMMENDED FIXES

### Fix 1: Add Session-Scoped Cache (IMMEDIATE)

Add caching to both builders using the existing `EdgeCache`:

```typescript
// deep-relationship.ts
import { EdgeCache } from '../../agents/shared/performance/edge-cache.js';

const relationshipCache = new EdgeCache<RelationshipHistory>({
  maxSize: 100,
  defaultTtlMs: 60000, // 1 minute per session turn cycle
  staleWhileRevalidate: true,
});

async function getRelationshipHistory(userId: string): Promise<Partial<RelationshipHistory>> {
  const cacheKey = `relationship:${userId}`;
  
  return relationshipCache.getOrFetch(cacheKey, async () => {
    const db = await getFirestoreDb();
    // ... existing logic
  });
}
```

**Expected Improvement:** 100-200ms → <5ms (cache hit)

### Fix 2: Batch Firestore Reads

Combine the 2 reads in `deep-relationship.ts` into a single batched read:

```typescript
// Before: 2 sequential reads (~200ms)
const userDoc = await db.collection('bogle_users').doc(userId).get();
const momentsSnapshot = await db...get();

// After: 1 batched read (~100ms)
const [userDoc, momentsSnapshot] = await Promise.all([
  db.collection('bogle_users').doc(userId).get(),
  db.collection('bogle_users').doc(userId).collection('shared_moments')...get(),
]);
```

**Expected Improvement:** 50-100ms

### Fix 3: Skip on Early Turns

Don't fetch relationship/temporal data on turns 0-2 when we don't have enough context:

```typescript
async function buildDeepRelationshipContext(input: ContextBuilderInput) {
  // Skip early turns - no relationship data needed yet
  if (input.turnCount < 3) {
    return [];
  }
  // ... rest of logic
}
```

### Fix 4: Rate-Limit Firestore Writes

The write operations in turn-learning.ts fire on every turn. Add rate limiting:

```typescript
// Only learn patterns every 5 turns
if (ctx.turnCount % 5 === 0 && ctx.userId) {
  void learnTemporalPattern(ctx.userId, {...});
}
```

---

## 📈 Performance Impact Summary

| Fix | Effort | Latency Reduction |
|-----|--------|-------------------|
| Session cache | Medium | 150-300ms |
| Batch reads | Low | 50-100ms |
| Skip early turns | Low | 150-350ms (turns 0-2) |
| Rate-limit writes | Low | 10-50ms |

**Total potential improvement:** 200-400ms per turn

---

## 🔧 IMPLEMENTATION PRIORITY

### P0 - Do Immediately
1. Add session cache to `deep-relationship.ts`
2. Add session cache to `temporal-intelligence.ts`

### P1 - Do This Week
3. Batch Firestore reads in `deep-relationship.ts`
4. Add early-turn skip

### P2 - Optional
5. Rate-limit write operations
6. Add builder-level performance metrics

---

## Monitoring

After fixes, track these metrics:

```typescript
// Add to each builder
const startTime = Date.now();
// ... builder logic
log.debug({ 
  builder: 'deep-relationship',
  durationMs: Date.now() - startTime,
  cacheHit: wasCacheHit,
}, 'Builder completed');
```

Target post-fix latencies:
- `deep-relationship.ts`: <10ms (cache hit), <150ms (cache miss)
- `temporal-intelligence.ts`: <5ms (cache hit), <100ms (cache miss)

