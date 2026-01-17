# Data Persistence Fixes - Implementation Audit

> What we missed, got wrong, or didn't fully implement

## ✅ CRITICAL: Fixed (Dec 28, 2024)

### 1. **Firestore Security Rules** ✅ FIXED

**File:** `firestore.rules`

**Fix applied:** Added security rule for `social_graph` subcollection:
```javascript
// Added to firestore.rules under bogle_users/{userId}
match /social_graph/{docId} {
  allow read, write: if isOwner(userId) || isServiceAccount();
}
```

---

### 2. **`extractedDetails` in UserProfile Type** ✅ FIXED

**File:** `src/types/user-profile.ts`

**Fix applied:** Added to UserProfile interface around line 699:
```typescript
/** Extracted details from conversations (names, places, pets) */
extractedDetails?: Array<{
  type: 'person_name' | 'pet_name' | 'place' | 'company' | 'date' | 'amount' | 'user_name' | 'other';
  value: string;
}>;
```

---

### 3. **atomicProfileUpdate Type Safety** ✅ FIXED

**File:** `src/services/realtime-persistence.ts`

**Fix applied:** Proper type handling with justified type assertion:
```typescript
type ProfileDetailType = NonNullable<
  Awaited<ReturnType<typeof store.getProfile>>
>['extractedDetails'];
await store.atomicProfileUpdate(userId, (currentProfile) => ({
  ...currentProfile,
  extractedDetails: mergedDetails as ProfileDetailType,
}));
```

---

## 🟡 MEDIUM: Should Fix

### 4. **No Tests Written**

No automated tests for any of the new functionality:

| Component | Test Needed | Priority |
|-----------|-------------|----------|
| `realtime-persistence.ts` | Unit tests for all functions | High |
| `persistGraphToFirestore()` | Integration test with Firestore emulator | High |
| `loadGraphFromFirestore()` | Test data shape validation | High |
| Turn processor integration | E2E test verifying name extraction | Medium |
| Session start/end hooks | Integration test for full lifecycle | Medium |

**Files to create:**
- `src/tests/realtime-persistence.test.ts`
- `src/tests/social-graph-persistence.test.ts`
- `src/tests/e2e/data-capture-e2e.test.ts`

---

### 5. **No Validation of Loaded Data**

**File:** `src/services/social-graph/index.ts` (loadGraphFromFirestore)

**Problem:** Data loaded from Firestore is blindly cast without validation:
```typescript
const person: Person = {
  ...personData,
  lastMentioned: new Date(personData.lastMentioned),  // Could crash if undefined
  createdAt: new Date(personData.createdAt),
  updatedAt: new Date(personData.updatedAt),
};
```

**Fix needed:** Add Zod schema validation:
```typescript
import { z } from 'zod';

const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  relationship: z.string().default('unknown'),
  // ... etc
});

// Then validate before using:
const validated = PersonSchema.safeParse(personData);
if (!validated.success) {
  log.warn({ personData }, 'Invalid person data in Firestore');
  continue;
}
```

---

### 6. **Rate Limiting State Lost on Restart**

**File:** `src/services/realtime-persistence.ts`

**Problem:** In-memory rate limiting state is lost on process restart:
```typescript
const lastSaveTimestamps = new Map<string, { details: number; socialGraph: number }>();
```

**Impact:**
- After deploy, all users get immediate saves (could spike Firestore costs)
- In multi-instance deployments, rate limiting doesn't coordinate

**Potential fixes:**
1. Accept the behavior (simplest - saves are already idempotent)
2. Use Redis for distributed rate limiting
3. Store timestamps in Firestore (but adds read cost)

**Recommendation:** Accept for now, document as known behavior.

---

## 🟢 LOW: Nice to Have

### 7. **Social Graph Data Not Used in Context**

**Problem:** I'm saving the social graph, but it's not loaded into:
- Context builders (so LLM doesn't see it)
- Superhuman services (relationship-network, etc.)

**Integration needed:**
```typescript
// In context builder for personal:
const socialGraph = await loadGraphFromFirestore(userId);
const importantPeople = getImportantPeople(userId);
// Inject into context
```

---

### 8. **Data Capture Results Not Used**

**File:** `src/agents/processors/turn-processor.ts`

**Problem:** I call `processDataCapture()` but don't use the returned `contextForLLM`:
```typescript
const captureResult = await processDataCapture({...});
// captureResult.contextForLLM is never injected!
```

**Fix:** Inject the acknowledgment into context:
```typescript
if (captureResult.contextForLLM) {
  // Add to context injections
  injections.push({
    category: 'data_captured',
    content: captureResult.contextForLLM,
    priority: 45,
  });
}
```

---

### 9. **No Monitoring/Alerting**

**Problem:** No way to know if persistence is failing in production:
- No metrics on save success/failure rates
- No alerts on persistent failures
- No dashboard for data capture rates

**Recommendation:** Add basic logging metrics that can be queried:
```typescript
log.info(
  { 
    metric: 'realtime_persistence',
    action: 'save',
    success: true,
    userId,
    detailCount: newDetails.length,
  },
  'Realtime persistence completed'
);
```

---

## 📝 E2E Validation Checklist

To fully validate the implementation, manually test:

- [ ] Start conversation as new user
- [ ] Mention a person by name ("I talked to my mom Sarah today")
- [ ] Check logs for `📇 Recorded person mention`
- [ ] After 3 turns, check for `🔄 Triggered auto-save`
- [ ] Check Firestore for `social_graph/current` document
- [ ] End session
- [ ] Check for `📇 Final social graph persistence`
- [ ] Start new conversation with same user
- [ ] Verify graph was loaded (check logs)
- [ ] Mention the same person again
- [ ] Verify deduplication works (mention count increases, not new person)

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| 🔴 Critical (blocks deploy) | 3 | Must fix |
| 🟡 Medium (should fix) | 3 | Should fix before production |
| 🟢 Low (nice to have) | 3 | Future improvement |

**Next steps:**
1. Add Firestore security rule for `social_graph`
2. Add `extractedDetails` to `UserProfile` type
3. Write unit tests for `realtime-persistence.ts`
4. Add E2E test for data capture flow

---

*Generated: December 28, 2024*
