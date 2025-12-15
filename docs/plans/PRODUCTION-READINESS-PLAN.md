# 🚀 Production Readiness Plan

**Created:** December 10, 2024  
**Last Updated:** December 13, 2024  
**Status:** ✅ Major features complete - see CURRENT-STATE-SUMMARY.md  
**Priority:** Critical path to production

This document tracks all major features that need work to be production-ready E2E.

### December 2024 Update

Comprehensive audit revealed many "incomplete" items are actually implemented:
- ✅ Voice Identity - FULLY WIRED to voice-agent
- ✅ Self-Healing System - 90% complete (circuit breaker, retry, AI diagnostics)
- ✅ Trust Systems - All 29 phases implemented
- ✅ Celebration & Growth - Complete with context builder integration

See [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) for authoritative status.

---

## Executive Summary

| Category                      | Issues       | Effort  | Priority | Status      |
| ----------------------------- | ------------ | ------- | -------- | ----------- |
| 🔴 Blocking (Breaks Build/CI) | 3            | 2 hours | P0       | ✅ COMPLETE |
| 🟠 API Gaps (Broken Features) | 6 endpoints  | 4 hours | P1       | ✅ COMPLETE |
| 🟡 Code Quality (Tech Debt)   | 1 major file | 4 hours | P2       | ✅ STARTED  |
| 🔵 Feature Completion         | 2 features   | 6 hours | P3       | ✅ COMPLETE |

**Completed:** All priorities (P0, P1, P2 started, P3)
**Dev Panel:** Split started - 268 lines extracted to modules

---

## 🔴 P0: Blocking Issues (Fix First)

### 1. TypeScript Errors in Backend

**Files:** `src/services/stripe-subscription.ts`  
**Lines:** 485, 541  
**Error:** Missing `sessionLimitMinutes` and `teamAccess` properties  
**Effort:** 15 minutes

**Fix:**

```typescript
// Line 485 and 541 - add missing properties:
return {
  tier: 'free',
  usage: createFreshUsage(),
  conversationsRemaining: null,
  minutesRemaining: null,
  sessionLimitMinutes: 7, // ADD THIS
  canStartConversation: true,
  statusMessage: "Something went wrong, but let's keep talking.",
  approachingLimit: false,
  atLimit: false,
  teamAccess: 'ferni-only', // ADD THIS
};
```

---

### 2. Failing Subscription E2E Tests

**File:** `src/tests/subscription-e2e.test.ts`  
**Issue:** Tests expect old "conversation limits" model, but code now uses "Ferni free forever" model  
**Effort:** 1 hour

**Root Cause:**  
`calculateUsageStatus()` now always returns:

- `canStartConversation: true`
- `atLimit: false`
- `approachingLimit: false`

The tests mock profiles with high conversation counts expecting blocks, but the new model never blocks.

**Fix Options:**

A) **Update tests to match new model** (Recommended)

- Remove/update tests for `atLimit` behavior
- Add tests for session time limits instead
- Add tests for team access gating

B) **Re-add conversation limits** (Not recommended - contradicts product direction)

---

### 3. Run Quality Gates

**After P0 fixes, verify:**

```bash
npm run typecheck      # Should pass
npm test -- --run      # Should pass (after test updates)
npm run quality:check  # Should pass
```

---

## 🟠 P1: Missing API Endpoints (Proactive Outreach)

The dev panel calls 6 endpoints that don't exist. Users clicking these buttons get failures.

### Missing Endpoints

| Endpoint                             | Purpose                  | Used By             |
| ------------------------------------ | ------------------------ | ------------------- |
| `GET /api/outreach/contact`          | Get user's phone/email   | Check Config button |
| `POST /api/outreach/contact`         | Set user's phone/email   | Setup flow          |
| `POST /api/outreach/test/send`       | Send test SMS/email/call | Test buttons        |
| `POST /api/outreach/trigger`         | Create outreach trigger  | Trigger buttons     |
| `POST /api/outreach/thinking-of-you` | Queue thinking-of-you    | TOY button          |
| `GET /api/outreach/history`          | Get outreach history     | History button      |

**File to modify:** `src/api/outreach-routes.ts`  
**Effort:** 4 hours

### Implementation Plan

```typescript
// Add to src/api/outreach-routes.ts

// GET /api/outreach/contact - Get user channel config
if (pathname === '/api/outreach/contact' && method === 'GET') {
  const userId = url.searchParams.get('userId');
  // Look up user's stored phone/email from Firestore profiles
  const db = getFirestore();
  const profile = await db.collection('profiles').doc(userId).get();
  const { phone, email } = profile.data()?.contactInfo ?? {};
  return sendJsonResponse(res, 200, { phone, email });
}

// POST /api/outreach/contact - Set user channel config
if (pathname === '/api/outreach/contact' && method === 'POST') {
  const { userId, phone, email } = await parseRequestBody(req);
  // Store to Firestore
  await db.collection('profiles').doc(userId).update({
    'contactInfo.phone': phone,
    'contactInfo.email': email,
  });
  return sendJsonResponse(res, 200, { success: true });
}

// POST /api/outreach/test/send - Test delivery
if (pathname === '/api/outreach/test/send' && method === 'POST') {
  const { userId, channel, message, subject } = await parseRequestBody(req);
  // Get user's contact info
  // Call deliverToUser() from notification-delivery.ts
  // Return result
}

// POST /api/outreach/trigger - Create trigger
if (pathname === '/api/outreach/trigger' && method === 'POST') {
  const { userId, type, priority, reason, ...metadata } = await parseRequestBody(req);
  // Use existing queue functions:
  // - queueThinkingOfYou()
  // - queueCelebration()
  // - queueGrowthReflection()
}

// POST /api/outreach/thinking-of-you - Specific TOY trigger
if (pathname === '/api/outreach/thinking-of-you' && method === 'POST') {
  const { userId, trigger, reason } = await parseRequestBody(req);
  queueThinkingOfYou(userId, { trigger, reason });
  return sendJsonResponse(res, 200, { success: true });
}

// GET /api/outreach/history - Get outreach history
if (pathname === '/api/outreach/history' && method === 'GET') {
  const userId = url.searchParams.get('userId');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  // Query Firestore for sent outreach
  const history = await db
    .collection('outreach_history')
    .where('userId', '==', userId)
    .orderBy('sentAt', 'desc')
    .limit(limit)
    .get();
  return sendJsonResponse(res, 200, { history: history.docs.map((d) => d.data()) });
}
```

### Test Coverage

Create `src/tests/outreach-routes.test.ts`:

- Test each endpoint with mocked Firestore
- Test error cases (missing userId, invalid channel)
- Test rate limiting

---

## 🟡 P2: Code Quality (Tech Debt)

### Dev Panel File Size: 6,879 Lines

**File:** `frontend-typescript/src/ui/dev-panel.ui.ts`  
**Problem:** 14x over 500-line limit, unmaintainable  
**Effort:** 4 hours

### Refactoring Plan

```
frontend-typescript/src/ui/dev-panel/
├── index.ts                 # Main panel shell, exports
├── types.ts                 # Shared types
├── styles.ts                # CSS injection
├── icons.ts                 # Lucide icons
├── sections/
│   ├── subscription.ts      # Tier, stage, team members
│   ├── avatar.ts            # Expressions, lamp, soul
│   ├── music.ts             # Games, player status
│   ├── outreach.ts          # Proactive outreach testing
│   ├── narrative.ts         # Story beats, arcs
│   ├── environment.ts       # Theme, weather, ambient
│   ├── debugging.ts         # State inspector, network sim
│   └── dashboards.ts        # Dashboard links
└── handlers/
    ├── action-handlers.ts   # Button click handlers
    ├── outreach-handlers.ts # Outreach API calls
    └── state-handlers.ts    # State management
```

### Migration Steps

1. Create directory structure
2. Extract types and icons (easy wins)
3. Extract sections one at a time (test after each)
4. Extract handlers
5. Update imports in main index.ts
6. Add barrel exports for backward compatibility
7. Delete old file

---

## 🔵 P3: Feature Completion

### 1. Ferni EQ Breath Synchronization

**Current State:** Infrastructure exists but not connected to real input  
**File:** `frontend-typescript/src/ui/better-than-human.ui.ts`

**What's Missing:**

- No actual breath detection from microphone
- `syncStrength` is hardcoded
- No user breath rate estimation

**Implementation Plan:**

```typescript
// Option A: Voice Activity Detection proxy (simpler)
// Detect speaking/silence patterns as proxy for breathing

// In voice state handler:
function onSpeechSegment(duration: number, silenceDuration: number) {
  // Estimate breath rate from speech patterns
  // Average person: ~15 breaths/min = 4 second cycle
  // Speech usually happens on exhale
  const estimatedBreathCycle = silenceDuration + duration * 0.3;
  ferni.updateBreathRate(60 / estimatedBreathCycle);
}

// Option B: WebRTC getStats for VAD (more accurate)
// Use audio level data to detect inhale/exhale patterns
```

**Effort:** 3 hours

---

### 2. Subscription Test Model Update

**Current State:** Tests expect conversation limits, code has "free forever"  
**File:** `src/tests/subscription-e2e.test.ts`

**What to Test Instead:**

```typescript
describe('Session Time Limits', () => {
  it('should enforce 7-minute session limit for free tier', async () => {
    // Test sessionLimitMinutes is returned
  });

  it('should have unlimited sessions for paid tiers', async () => {
    // Test sessionLimitMinutes is null for friend/partner
  });
});

describe('Team Access Gating', () => {
  it('should return ferni-only for free tier', async () => {
    // Test teamAccess: 'ferni-only'
  });

  it('should return full for partner tier', async () => {
    // Test teamAccess: 'full'
  });
});
```

**Effort:** 3 hours

---

## Implementation Order

```
Week 1 (P0 - Blocking)
├── Day 1: Fix TypeScript errors (15 min)
├── Day 1: Update failing tests (1 hour)
└── Day 1: Verify all quality gates pass

Week 1-2 (P1 - API Gaps)
├── Day 2: Implement /api/outreach/contact endpoints
├── Day 3: Implement /api/outreach/test/send
├── Day 4: Implement /api/outreach/trigger + thinking-of-you
├── Day 5: Implement /api/outreach/history
└── Day 5: Add test coverage

Week 2-3 (P2 - Tech Debt)
├── Day 6-7: Split dev-panel.ui.ts into modules
└── Day 8: Test and verify no regressions

Week 3 (P3 - Feature Completion)
├── Day 9: Breath sync implementation
└── Day 10: Additional test coverage
```

---

## Verification Checklist

### P0 Complete When:

- [ ] `npm run typecheck` passes
- [ ] `npm test -- --run` passes (all 6153 tests)
- [ ] `npm run quality:check` passes
- [ ] `npm run quality:arch` passes

### P1 Complete When:

- [ ] All 6 outreach endpoints respond
- [ ] Dev panel outreach buttons work E2E
- [ ] Test coverage for new endpoints

### P2 Complete When:

- [ ] dev-panel.ui.ts is under 500 lines
- [ ] All sections work after split
- [ ] No HMR issues

### P3 Complete When:

- [ ] Breath sync responds to user speech
- [ ] Tests reflect current product model
- [ ] Feature flags work for incomplete features

---

## Files to Modify

| File                                                 | Changes                  | Priority |
| ---------------------------------------------------- | ------------------------ | -------- |
| `src/services/stripe-subscription.ts`                | Add missing properties   | P0       |
| `src/tests/subscription-e2e.test.ts`                 | Update test expectations | P0       |
| `src/api/outreach-routes.ts`                         | Add 6 endpoints          | P1       |
| `src/tests/outreach-routes.test.ts`                  | New test file            | P1       |
| `frontend-typescript/src/ui/dev-panel.ui.ts`         | Split into modules       | P2       |
| `frontend-typescript/src/ui/better-than-human.ui.ts` | Breath sync              | P3       |

---

## Success Metrics

1. **Build Health:** Zero TypeScript errors, zero test failures
2. **Dev Panel:** 100% of buttons functional
3. **Code Quality:** All files under 500 lines
4. **Test Coverage:** 60%+ on new code
5. **Feature Completeness:** All 5 Ferni EQ capabilities connected

---

_This plan should be reviewed and updated as work progresses._
