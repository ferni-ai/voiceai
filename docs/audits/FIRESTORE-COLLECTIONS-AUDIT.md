# Firestore Collections Audit

**Date:** December 2024
**Status:** Analysis Complete - Action Required

## Executive Summary

This audit identifies issues with Firestore collections including duplicates, test data, and consolidation opportunities.

---

## Issue 1: Duplicate Voting Collections (RESOLVED)

### Status: ✅ FIXED (December 2024)

### What Was Done
Consolidated voting collections to use consistent patterns:

| Collection | Purpose | ID Pattern |
|------------|---------|------------|
| `feature_votes` | Individual user votes | `${userId}_${featureId}` |
| `roadmap_feature_stats` | Aggregate feature stats | `${featureId}` |

### Changes Made
1. **Updated `src/api/roadmap-routes.ts`**:
   - Changed from `roadmap_votes` to `feature_votes`
   - Now uses deterministic IDs (`${userId}_${featureId}`)
   - Direct document access instead of queries

2. **Updated `src/api/waitlist-routes.ts`**:
   - Changed from `roadmap_votes` to `roadmap_feature_stats`
   - Aggregate feature vote counts now use the proper stats collection

### Migration Needed
If `roadmap_votes` collection has existing data in production:
```javascript
// Migration script to run once
const roadmapVotes = await db.collection('roadmap_votes').get();
for (const doc of roadmapVotes.docs) {
  const data = doc.data();
  // Individual votes -> feature_votes
  if (data.userId && data.featureId) {
    const newId = `${data.userId}_${data.featureId}`;
    await db.collection('feature_votes').doc(newId).set(data, { merge: true });
  }
  // Aggregate counts -> roadmap_feature_stats
  if (data.votes && !data.userId) {
    await db.collection('roadmap_feature_stats').doc(doc.id).set(data, { merge: true });
  }
}
```

---

## Issue 2: Test Collections in Production

### Problem
Test collections may exist in production Firestore:
- `_test`
- `_test_connection`
- `_verification`

### Verification Needed
Run this query in Firebase Console:
```javascript
// Check for test collections
const collections = await db.listCollections();
const testCollections = collections.filter(c =>
  c.id.startsWith('_test') || c.id.startsWith('test_')
);
```

### Recommended Fix
1. Export test data (if needed for reference)
2. Delete test collections
3. Add CI check to prevent test collection creation

---

## Issue 3: Timestamp Inconsistencies

### Problem
Mixed timestamp formats across collections:
- Some use `admin.firestore.FieldValue.serverTimestamp()`
- Some use `new Date().toISOString()`
- Some use `Date.now()`

### Standard
Use `admin.firestore.FieldValue.serverTimestamp()` for all server-side timestamps:
- Consistent server time
- No timezone issues
- Firestore-native format

### Pattern
```typescript
// Correct
{
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}

// Convert for API response
const isoDate = doc.data().createdAt?.toDate?.()?.toISOString();
```

---

## Issue 4: Optimization Collections (OK - Keep)

### Status: No Action Needed

The following collections are actively used by optimization services:
- `optimization_feedback`
- `optimization_feedback_summary`
- `optimization_patterns`
- `optimization_sessions`
- `optimization_recommendations`
- `optimization_experiments`
- `optimization_journeys`
- `optimization_gaps`
- `landing_optimization_reports`

These are properly referenced in:
- `src/services/optimization-persistence.ts`
- `src/services/landing-intelligence/optimization-agent.ts`
- `src/api/landing-optimization-handler.ts`

---

## Collection Inventory (Reference)

### User Data (per-user)
| Collection | Path | Purpose |
|------------|------|---------|
| bogle_users | `/bogle_users/{userId}` | User profiles |
| user_seeds | `/user_seeds/{userId}` | Seed balance |
| user_sessions | `/bogle_users/{userId}/sessions` | Session history |
| preferences | `/bogle_users/{userId}/preferences` | User prefs |

### Feature/Roadmap
| Collection | Purpose | Keep? |
|------------|---------|-------|
| features | Feature definitions | Yes |
| feature_votes | User votes (deterministic IDs) | Yes - Primary |
| roadmap_votes | Legacy votes | Migrate then delete |
| roadmap_feature_stats | Aggregated stats | Yes |

### Optimization
| Collection | Purpose | Keep? |
|------------|---------|-------|
| optimization_* | Landing optimization data | Yes |
| landing_optimization_reports | AI reports | Yes |

---

## Action Items

- [x] ~~Run migration script for roadmap_votes -> feature_votes~~ (Code updated, migration script provided)
- [x] ~~Update roadmap-routes.ts to use feature_votes~~ (Done)
- [x] ~~Update waitlist-routes.ts to use roadmap_feature_stats~~ (Done)
- [ ] Run migration script in production if roadmap_votes has data
- [ ] Verify no test collections in production
- [ ] Audit timestamp usage in high-traffic collections
- [ ] Add Firestore security rules for new patterns

---

## Priority

1. ~~**High**: Consolidate voting collections (data integrity)~~ ✅ DONE
2. **Medium**: Clean test collections (hygiene)
3. **Low**: Standardize timestamps (consistency)

---

*Last Updated: December 2024*
