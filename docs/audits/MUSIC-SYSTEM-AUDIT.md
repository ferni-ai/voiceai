# 🎵 Music System Audit Report

**Date:** December 21, 2024  
**Status:** 🔴 CRITICAL ISSUES FOUND

---

## Executive Summary

The music system has several **critical architectural issues** that can cause crashes, silent failures, and poor user experience. The most severe issue is that the voice agent process must be running separately (`pnpm dev`) for music to work at all.

---

## 🚨 CRITICAL ISSUES

### 1. Voice Agent Not Running (Immediate Crash)

**Severity:** 🔴 CRITICAL  
**File:** N/A (process architecture issue)

**Problem:**
When a user asks Ferni to play music, the gateway server dispatches a job to the voice agent, but if `pnpm dev` is not running, there is NO agent to handle the request. The call simply fails silently or the user gets disconnected.

**Symptoms:**
- User asks for music, Ferni goes silent
- Connection drops
- No error in gateway logs, just "Dispatched agent" with no follow-up

**Fix:**
The documentation must be clearer: **THREE processes must be running:**
1. `npx tsx src/servers/gateway.ts` (ports 3001/3002)
2. `cd apps/web && pnpm dev` (port 3004)
3. `pnpm dev` (voice agent - **THIS WAS MISSING**)

---

### 2. Singleton Pollution Across Sessions

**Severity:** 🟠 HIGH  
**File:** `src/audio/music-player.ts` lines 266-276, 1922-1936

**Problem:**
The music player uses a singleton pattern (`getMusicPlayer()`), but when sessions end and new ones start, the old singleton state can pollute the new session. The `dispose()` method resets state, but if it's called asynchronously while a new session is starting, race conditions occur.

**Code:**
```typescript
// Line 269-275
if (this.sessionId && sessionId && this.sessionId !== sessionId) {
  getLogger().warn(
    { oldSession: this.sessionId, newSession: sessionId },
    '🎵 Singleton pollution detected - resetting player for new session'
  );
  await this.dispose();
}
```

**Symptoms:**
- Music player reports "not initialized" even though initialization was called
- Track end callbacks fire for wrong session
- `sessionId === null` after dispose

**Fix:** The music player already has partial protection, but needs:
1. Better locking mechanism during initialization
2. Session validation before ALL operations
3. Consider session-scoped instances instead of global singleton

---

### 3. Unhandled Promise in waitForPlayout

**Severity:** 🟠 HIGH  
**File:** `src/audio/music-player.ts` lines 868-894

**Problem:**
The `waitForPlayout()` promise can reject with "Output stream closed" errors from fluent-ffmpeg. While there IS a `.catch()` handler, the error is only logged as a warning and the backup timer is relied upon. If the backup timer also fails, the track end is never detected.

**Code:**
```typescript
// Lines 868-893
void this.currentPlayHandle
  .waitForPlayout()
  .then(() => { handleTrackEnd('waitForPlayout'); })
  .catch((err: unknown) => {
    // fluent-ffmpeg can throw "Output stream closed" when tracks end abruptly
    // This is not fatal - the backup timer will handle track completion
    getLogger().warn(
      { track: track.name, error: String(err), elapsedMs },
      '🎧 waitForPlayout error (non-fatal, backup timer will handle)'
    );
  });
```

**Symptoms:**
- Track appears to never end
- No transition phrase spoken
- Music stops but agent is silent

**Fix:**
Add explicit track end handling in the `.catch()` block:
```typescript
.catch((err: unknown) => {
  // If backup timer hasn't fired yet, handle track end now
  if (!this.trackEndHandled) {
    handleTrackEnd('waitForPlayoutError');
  }
});
```

---

### 4. iTunes API Circuit Breaker Opens on Network Issues

**Severity:** 🟡 MEDIUM  
**File:** `src/services/itunes.ts` lines 28-32, 88-94

**Problem:**
The iTunes circuit breaker opens after 5 failures with a 15-second reset. During this time, ALL music requests fail silently with empty results.

**Code:**
```typescript
// Lines 88-94
if (!itunesCircuitBreaker.canRequest()) {
  log.warn(
    { query, circuitState: 'OPEN' },
    '🎵 [DIAG] iTunes circuit breaker is OPEN - skipping request! Music search will fail.'
  );
  return { resultCount: 0, results: [] };
}
```

**Symptoms:**
- User: "Play some jazz"
- Ferni: "Couldn't find any jazz tracks" (but really circuit is open)
- All music fails for 15 seconds

**Fix:**
1. Return a clearer error message when circuit is open
2. Consider exponential backoff instead of flat 15s reset
3. Add a user-facing "music service temporarily unavailable" message

---

### 5. JSON Function Executor - Uncaught Import Errors

**Severity:** 🟡 MEDIUM  
**File:** `src/agents/shared/json-function-executor.ts` lines 328-333

**Problem:**
The dynamic import for `playMusicUnified` can fail if the module path changes or there's a bundling issue. This would cause an unhandled rejection.

**Code:**
```typescript
// Lines 328-332
if (fnLower === 'playmusic') {
  const { playMusicUnified } = await import('../../tools/domains/entertainment/music.js');
  const query = (args.query as string) || 'music';
  log.info({ query }, '🎵 Playing music');
  return playMusicUnified(query);  // No try-catch around the playMusicUnified call!
}
```

**Fix:**
Wrap in try-catch:
```typescript
if (fnLower === 'playmusic') {
  try {
    const { playMusicUnified } = await import('../../tools/domains/entertainment/music.js');
    const query = (args.query as string) || 'music';
    log.info({ query }, '🎵 Playing music');
    return playMusicUnified(query);
  } catch (err) {
    log.error({ error: String(err), fn }, '🎵 Music playback failed');
    return "Sorry, I couldn't play music right now. Try again?";
  }
}
```

---

### 6. Tool-Call Sanitizer - Music Fallback Race Condition

**Severity:** 🟡 MEDIUM  
**File:** `src/agents/shared/tool-call-sanitizer.ts` lines 949-990

**Problem:**
The `tryMusicFallback` function uses a flag `musicFallbackInFlight` to prevent concurrent calls, but this flag is in module scope. If two different sessions trigger music fallback, only one will execute.

**Code:**
```typescript
// Lines 949-990
const tryMusicFallback = async (query: string): Promise<void> => {
  if (musicFallbackInFlight) {
    log.debug({ query }, 'Music fallback already in flight, skipping');
    return;
  }
  try {
    musicFallbackInFlight = true;
    // ...
  } finally {
    musicFallbackInFlight = false;
  }
};
```

**Symptoms:**
- Second user's music request silently ignored
- Logs show "Music fallback already in flight, skipping"

**Fix:**
Use session-scoped flags or allow concurrent music fallbacks for different sessions.

---

### 7. Spotify Token Refresh - Swallowed Errors

**Severity:** 🟡 MEDIUM  
**File:** `src/services/identity/spotify-auth.ts`

**Problem:**
When Spotify token refresh fails (e.g., user revoked access), the error is logged but `getSpotifyAccessToken()` returns `null`. The calling code may not handle this gracefully.

**Fix:**
Consider throwing a typed error that can be caught and shown to users:
```typescript
throw new SpotifyAuthError('Please re-link your Spotify account');
```

---

## 🟢 GOOD PATTERNS FOUND

1. **Music Player Initialization Promise** - The `waitForInitialization(timeout)` pattern is good
2. **Backup Timers** - Having fallback timers for track end detection is defensive
3. **Session Pollution Detection** - The `sessionId` tracking is a good pattern
4. **ffmpeg Availability Check** - Graceful degradation when ffmpeg not available
5. **Extensive Logging** - `[DIAG]` logs help debugging

---

## 📋 RECOMMENDED FIXES (Priority Order)

### Immediate (Before Next Deploy)

1. **Document 3-process requirement** in `CLAUDE.md` and `ONBOARDING.md`
2. **Wrap playMusicUnified in try-catch** in json-function-executor.ts
3. **Better error message when circuit breaker open** in itunes.ts

### Short-term (This Week)

4. **Add track end handling in catch block** of waitForPlayout
5. **Session-scoped music fallback flag** in tool-call-sanitizer.ts
6. **Typed Spotify auth errors** with user-friendly messages

### Medium-term (Next Sprint)

7. **Consider session-scoped music player** instead of singleton
8. **Add connection state checks** before ALL async music operations
9. **Create music system integration test** that catches these issues

---

## 📊 Root Cause Analysis

The music system has evolved organically with many features (DJ mode, ambient music, transitions, crossfades) but lacks:

1. **Clear session lifecycle management** - Singleton pattern is brittle
2. **Defensive error handling** - Many async operations lack proper error boundaries
3. **User-facing error messages** - Errors are logged but not communicated
4. **Integration testing** - Unit tests exist but no E2E music flow tests

---

## Files Audited

| File | Lines | Issues Found |
|------|-------|--------------|
| `src/audio/music-player.ts` | 1969 | 2 |
| `src/services/itunes.ts` | 264 | 1 |
| `src/agents/shared/json-function-executor.ts` | 2314 | 1 |
| `src/agents/shared/tool-call-sanitizer.ts` | 1415 | 1 |
| `src/agents/voice-agent/music-handler.ts` | 1145 | 0 (well-structured) |
| `src/tools/domains/entertainment/music.ts` | 1050 | 0 (good error handling) |
| `src/services/identity/spotify-auth.ts` | 475 | 1 |

---

*Report generated by Music System Audit*

