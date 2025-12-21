# 🏃 Race Conditions & Crash Points Audit

**Date:** December 21, 2024  
**Status:** ✅ FIXES IMPLEMENTED

---

## Executive Summary

The codebase has **good defensive patterns** in many areas (initialization promises, cleanup handlers, error handling). We identified and fixed several race conditions and crash risks.

**Statistics (Pre-Fix):**

- **175** fire-and-forget promises (`void function()`)
- **79** singleton patterns
- **581** `throw new Error` statements (potential unhandled exceptions)
- **64** `process.exit` calls

**Fixes Applied (Dec 21, 2024):**

- ✅ Music player singleton disposal race condition fixed
- ✅ Fire-and-forget promises in tool-call-sanitizer.ts fixed
- ✅ Promise.all patterns in 5 context builders made defensive
- ✅ Fire-and-forget promises in game-engine.ts fixed

---

## ✅ FIXED - HIGH SEVERITY

### 1. Music Player Singleton Disposal Race ✅ FIXED

**File:** `src/audio/music-player.ts` line 1966

**Original Problem:**

```typescript
export function resetMusicPlayer(): void {
  if (musicPlayerInstance) {
    void musicPlayerInstance.dispose(); // ← Fire-and-forget dispose!
    musicPlayerInstance = null;
  }
}
```

**Problem:** The `dispose()` was async but called with `void`, meaning:

1. Code continued immediately after setting `musicPlayerInstance = null`
2. If anything called `getMusicPlayer()` during the async dispose, a NEW instance was created
3. The old instance was still disposing and could interact with the new instance

**✅ Applied Fix:**

```typescript
export async function resetMusicPlayer(): Promise<void> {
  if (musicPlayerInstance) {
    await musicPlayerInstance.dispose(); // Now properly awaited
    musicPlayerInstance = null;
  }
}
```

**Also updated:**

- `src/agents/voice-agent/cleanup-handler.ts` - Now awaits `resetMusicPlayer()`
- `src/audio/__tests__/music-player.test.ts` - Updated tests to await

---

### 2. 175 Fire-and-Forget Promises ✅ PARTIALLY FIXED

Many places use `void someAsyncFunction()` which silently swallows errors.

**High-risk locations (status):**

- `src/agents/voice-agent/turn-handler.ts` (4 occurrences) ✅ Already had .catch()
- `src/agents/shared/tool-call-sanitizer.ts` (3 occurrences) ✅ FIXED - added .catch()
- `src/services/persistence/lifecycle.ts` (3 occurrences) - Lower priority
- `src/agents/voice-agent/user-identification-handler.ts` (3 occurrences) - Lower priority
- `src/startup.ts` (4 occurrences) ✅ Already had .catch()

**✅ Applied Fix to tool-call-sanitizer.ts:**

```typescript
// Before
void tryMusicFallback(musicQuery);

// After
void tryMusicFallback(musicQuery).catch((e) => {
  log.debug({ error: String(e), musicQuery }, '🎵 Music fallback failed (non-critical)');
});
```

---

### 3. Promise.all Without Error Handling ✅ FIXED

**Files Fixed:**

- `src/intelligence/context-builders/personas/jordan-milestone-insights.ts` ✅
- `src/intelligence/context-builders/personas/peter-research-insights.ts` ✅
- `src/intelligence/context-builders/personas/maya-coaching-insights.ts` ✅
- `src/intelligence/context-builders/personas/nayan-wisdom-insights.ts` ✅
- `src/intelligence/context-builders/personas/alex-communication-insights.ts` ✅

**Original Problem:**

```typescript
const [
  goalsOverview,
  peterFinancialInsights,
  // ... 5 more
] = await Promise.all([
  analyzeGoalsOverview(userId),
  getPeterFinancialInsights(userId),
  // ...
]);
```

**Problem:** If ANY one of these fails, the entire `Promise.all` rejects. This could crash context building.

**✅ Applied Fix:** Each promise now has its own `.catch()` returning a safe default:

```typescript
// Default fallback values defined
const defaultGoalsOverview: GoalsOverview = { activeGoals: 0, ... };

const [goalsOverview, peterInsights, ...] = await Promise.all([
  analyzeGoalsOverview(userId).catch((e) => {
    log.warn({ error: String(e) }, 'Failed to analyze goals overview');
    return defaultGoalsOverview;  // Graceful degradation
  }),
  // ... same pattern for all promises
]);
```

---

## 🟠 MEDIUM SEVERITY

### 4. Singleton Initialization Race Conditions ✅ AUDITED

**79 singletons** in the codebase follow this pattern:

```typescript
let serviceInstance: MyService | null = null;

export function getMyService(): MyService {
  if (!serviceInstance) {
    serviceInstance = new MyService(); // ← Race: what if called twice?
  }
  return serviceInstance;
}
```

**Problem:** If `getMyService()` is called twice rapidly before the first instantiation completes, you could get two instances.

**Well-Protected (Good Pattern):**

```typescript
// These have initializationPromise protection:
- global-services.ts ✅
- store-factory.ts ✅
- redis-cache.ts ✅
- firestore-store.ts ✅
- music-player.ts ✅
```

**Audited - Safe because synchronous constructors:**

```typescript
// These use simple null check but have SYNCHRONOUS constructors (no async init):
- agent-bus.ts ✅ (just sets up EventEmitter)
- dj-orchestrator.ts ✅ (just sets state variables)
- game-engine.ts ✅ (just initializes state; async init via explicit initializeForUser())
```

**Note:** Singletons with synchronous constructors don't have race conditions - JavaScript's single-threaded event loop ensures the `new MyService()` completes before any callback could run. The race condition only occurs with async initialization.

---

### 5. Event Handler Race in Voice Session

**File:** `src/agents/voice-agent/session-state-handler.ts`

Multiple timers are set/cleared in event handlers:

```typescript
if (backchannelTimer) {
  clearTimeout(backchannelTimer);
  backchannelTimer = null;
}

// Later in different event...
backchannelTimer = setTimeout(() => {
  // ...
}, delay);
```

**Problem:** If events fire rapidly, the timer could be set after being cleared, leading to unexpected behavior.

**Mitigation:** The code does cancel timers before setting new ones, which is good. But there's still a window between events where the timer state could be inconsistent.

---

### 6. Async Callbacks in Synchronous Cleanup

**File:** `src/agents/voice-agent/cleanup-handler.ts`

The cleanup uses `Promise.allSettled` for parallel cleanup, which is good. But some cleanup operations are fire-and-forget:

```typescript
void recordUserSessionEnd(sessionId, userData?.turnCount || 0, []).catch((err) => {
  diag.debug('Session end recording failed (non-critical)', { error: String(err) });
});
```

**Problem:** If the process exits before these complete, data is lost.

**Mitigation:** The 10-second timeout on cleanup helps, but these operations could still be interrupted.

---

### 7. Firestore Instance Race Conditions

Multiple files have this pattern:

```typescript
let firestoreInstance: admin.firestore.Firestore | null = null;

async function getFirestore() {
  if (firestoreInstance) return firestoreInstance;
  // ... async initialization
  firestoreInstance = new Firestore();
  return firestoreInstance;
}
```

**High-risk files:**

- `src/services/scheduling/proactive-insights-service.ts`
- `src/services/security-events.ts`
- `src/services/games/game-analytics.ts`
- `src/api/roadmap-routes.ts`
- `src/api/seeds-routes.ts`
- `src/api/garden-routes.ts`
- `src/api/outreach-routes.ts`
- Many more (26 total)

---

## 🟢 GOOD PATTERNS FOUND

### 1. Initialization Promise Pattern ✅

Many critical services use this correct pattern:

```typescript
let initializationPromise: Promise<T> | null = null;

async function getService(): Promise<T> {
  if (instance) return instance;
  if (initializationPromise) return initializationPromise; // ← Reuse existing promise

  initializationPromise = doInitialize();
  const result = await initializationPromise;
  initializationPromise = null;
  return result;
}
```

### 2. Cleanup Timeout Protection ✅

Session cleanup has a 10-second timeout to prevent zombie processes:

```typescript
await Promise.race([executeSessionCleanup(ctx, cleanupStart), createCleanupTimeout(timeoutMs)]);
```

### 3. Unhandled Exception Handlers ✅

Both the startup and shutdown handler have global exception handling:

```typescript
process.on('uncaughtException', (error: Error, origin: string) => {
  // Logged and tracked
});

process.on('unhandledRejection', (reason: unknown) => {
  // Logged and tracked
});
```

### 4. Event Listener Cleanup Tracking ✅

The voice agent entry has a `cleanupTracker` that properly removes event listeners:

```typescript
ctx.room.on('connectionStateChanged', connectionStateHandler);
cleanupTracker.register('event', 'room.connectionStateChanged', () => {
  ctx.room.off('connectionStateChanged', connectionStateHandler);
});
```

---

## 📋 RECOMMENDED FIXES (Priority Order)

### Immediate ✅ DONE

1. ✅ **Fix music player reset** - Made `resetMusicPlayer()` async, updated callers
2. ✅ **Audit fire-and-forget promises in turn-handler.ts** - Already had .catch() handlers!
3. ✅ **Audit void promises in startup.ts** - Already had .catch() handlers!
4. ✅ **Fix void promises in tool-call-sanitizer.ts** - Added .catch() to 3 music fallback calls

### Short-term ✅ DONE

5. ✅ **Convert high-risk Promise.all to defensive pattern** - 5 context builders fixed with per-promise .catch()
6. ✅ **Audit agent-bus.ts** - Synchronous constructor, no race condition
7. ✅ **Audit dj-orchestrator.ts** - Synchronous constructor, no race condition
8. ✅ **Fix game-engine.ts** - Added .catch() to fire-and-forget persistence calls

### Medium-term (Future)

9. **Create a linting rule** for `void` async calls without `.catch()`
10. **Standardize singleton pattern** with initialization promise where needed
11. **Add integration tests** for race conditions

---

## 📊 Files Most Needing Attention

| File                                                                      | Issue Type    | Severity | Fire-and-Forget Count |
| ------------------------------------------------------------------------- | ------------- | -------- | --------------------- |
| `src/agents/voice-agent/turn-handler.ts`                                  | Void promises | High     | 4                     |
| `src/agents/shared/tool-call-sanitizer.ts`                                | Void promises | High     | 3                     |
| `src/startup.ts`                                                          | Void promises | High     | 4                     |
| `src/services/persistence/lifecycle.ts`                                   | Void promises | Medium   | 3                     |
| `src/agents/voice-agent/user-identification-handler.ts`                   | Void promises | Medium   | 3                     |
| `src/intelligence/context-builders/personas/jordan-milestone-insights.ts` | Promise.all   | Medium   | 1                     |

---

## Testing Recommendations

### Race Condition Tests to Add

```typescript
describe('Singleton Race Conditions', () => {
  it('should return same instance when called concurrently', async () => {
    // Reset singleton
    resetService();

    // Call getService() 10 times in parallel
    const instances = await Promise.all(
      Array(10)
        .fill(null)
        .map(() => getService())
    );

    // All should be the same instance
    const unique = new Set(instances);
    expect(unique.size).toBe(1);
  });
});
```

### Chaos Testing

```typescript
describe('Cleanup Race Conditions', () => {
  it('should handle rapid connect/disconnect cycles', async () => {
    for (let i = 0; i < 10; i++) {
      await session.start();
      await session.close();
    }
    // Should not leak resources or crash
  });
});
```

---

_Report generated by Race Conditions Audit_
