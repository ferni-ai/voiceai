# Voice Agent System Audit

> **Date**: December 14, 2024  
> **Scope**: `src/agents/` directory - Full audit of restart, crash, and stability issues

---

## Executive Summary

The voice agent system has **significant issues** with restart/crash recovery, resource cleanup, and state management. The codebase shows evidence of incremental evolution without consistent patterns, leading to:

- **17 critical issues** (crashes, data loss)
- **12 high-priority issues** (memory leaks, race conditions)
- **8 medium-priority issues** (performance, monitoring gaps)

**Root cause**: The system evolved from a simpler design to handle complex features without a unified architectural vision. Cleanup handlers, state management, and error recovery are fragmented.

---

## 🔴 CRITICAL Issues (Fix Immediately)

### 1. **Race Condition in Room Reconnection**

**File**: `voice-agent-entry.ts` (lines 313-321)  
**Issue**: The retry logic calls `ctx.room.disconnect()` before retry, but the room might already be disconnecting, causing "Participant already exists" errors.

```typescript
// PROBLEMATIC CODE
await withResilience(async () => connectToRoom(ctx), {
  onBeforeRetry: async () => {
    await ctx.room.disconnect(); // This can race with LiveKit's internal disconnect
  },
});
```

**Fix**: Add disconnect state check and wait for complete disconnect before retry.

---

### 2. **Orphan Interval Timer in Live Backchanneling**

**File**: `session-state-handler.ts` (lines 394-413)  
**Issue**: Live backchannel interval is created inside the speaking handler but the cleanup relies on checking `userData.userSpeakingStartTime` which can be stale.

```typescript
// PROBLEMATIC CODE
const liveBackchannelInterval = setInterval(() => {
  if (!userData.userSpeakingStartTime) {
    clearInterval(liveBackchannelInterval); // May not trigger reliably
    return;
  }
  // ...
}, 200);

// Failsafe that relies on closure equality check - fragile
setTimeout(() => {
  if (userData.userSpeakingStartTime === originalUserSpeakingStart) {
    clearInterval(liveBackchannelInterval);
  }
}, 30000);
```

**Fix**: Store interval in Map keyed by session, clear on user state change.

---

### 3. **No Error Boundary in Main Entry Loop**

**File**: `voice-agent-entry.ts` (lines 1035-1057)  
**Issue**: The main disconnect listener has no error handling. If cleanup fails, session hangs.

```typescript
// PROBLEMATIC CODE
await new Promise<void>((resolve) => {
  ctx.room.on('disconnected', () => {
    resolve(); // What if cleanup throws?
  });
});
```

**Fix**: Wrap disconnect handler in try/catch with timeout fallback.

---

### 4. **Worker WebSocket Death Detection Too Slow**

**File**: `livekit-keepalive.ts` (lines 98-118)  
**Issue**: 5 minute idle detection means dead connections serve 5 minutes of failed calls before recovery.

```typescript
// PROBLEMATIC CODE
const MAX_IDLE_TIME_MS = 5 * 60 * 1000; // 5 minutes - TOO LONG

if (status.idleTime > MAX_IDLE_TIME_MS) {
  process.exit(0); // Finally restart, but after 5 minutes of failures
}
```

**Fix**: Reduce to 90 seconds. Add proactive ping-pong verification.

---

### 5. **Cleanup Handler Has 27 Try/Catch Blocks**

**File**: `cleanup-handler.ts` (669 lines, 27 catch blocks)  
**Issue**: Each cleanup step is wrapped individually but failures are logged and ignored. A critical cleanup failure (like unregistering from LiveKit) could leave zombie connections.

**Fix**: Prioritize cleanups. Critical cleanups should abort session on failure. Non-critical can continue.

---

### 6. **Uncaught Promise in Worker Job Handling**

**File**: `worker.ts` (lines 527-538)  
**Issue**: Job execution runs with `.catch()` logging only - no retry or notification.

```typescript
// PROBLEMATIC CODE
runJobInProcess({ ... }).catch((error) => {
  log('Job execution failed', { jobId, error: String(error) });
  // No retry, no notification, job just dies
});
```

**Fix**: Implement job failure notifications and optional retry for transient errors.

---

### 7. **Health Check Readiness Logic Has 90-Second Fallback**

**File**: `worker-readiness.ts` (lines 238-239)  
**Issue**: After 90 seconds, system assumes ready even if workers never registered. This hides actual failures.

```typescript
// PROBLEMATIC CODE
const FALLBACK_READY_UPTIME_MS = 90 * 1000;
const ready = readyWorkerCount > 0 || uptime > FALLBACK_READY_UPTIME_MS;
```

**Fix**: Remove fallback. If workers don't register, that's a real failure to report.

---

## 🟠 HIGH Priority Issues

### 8. **Session State Manager Not Used Consistently**

**Observation**: `SessionStateManager` was created for unified state (see `REFACTORING-GUIDE.md`), but `voice-agent-entry.ts` still uses raw `userData` object directly. Two sources of truth exist.

**Fix**: Complete the migration per the refactoring guide.

---

### 9. **Memory Leak: Silence Analysis Not Cleared**

**File**: `session-state-handler.ts` (lines 523-549)  
**Issue**: `userData.lastSilenceAnalysis` is set but only cleared when user self-initiates speech. If session ends during silence, analysis data persists.

---

### 10. **Stale Worker Detection Uses `require()` Inside `getReadinessState()`**

**File**: `worker-readiness.ts` (line 218-223)  
**Issue**: Synchronous `require()` in a frequently-called function. Can fail silently, blocks event loop.

```typescript
// PROBLEMATIC CODE
try {
  const keepalive = require('./livekit-keepalive.js'); // Blocking!
  livekitActuallyConnected = keepalive.isConnectionAlive?.() ?? livekitConnected;
} catch {
  // Silently ignored
}
```

**Fix**: Use dynamic import at module level, not per-call.

---

### 11. **Frontend Publisher Errors Are Fire-and-Forget**

**File**: `transcript-handler.ts` (lines 310-326)  
**Issue**: `publishData()` errors are logged at debug level and ignored. Silent frontend disconnections.

---

### 12. **No Circuit Breaker for External Services**

**Observation**: `lightweight-resilience.ts` has a `FailureTracker` but it's not integrated anywhere. Services like Firestore, Cartesia TTS, and Spotify retry infinitely.

---

### 13. **Echo Prevention Uses Hardcoded 2-Second Cooldown**

**File**: `transcript-handler.ts` (line 106)  
**Issue**: `ECHO_PREVENTION_COOLDOWN_MS = 2000` is hardcoded. Different TTS systems have different latencies.

---

### 14. **Event Listeners Accumulate on Retry**

**File**: `session-state-handler.ts` (lines 478-490)  
**Issue**: `AgentStateChanged` listener is added inside another handler but cleanup is via setTimeout. Multiple retries = multiple listeners.

```typescript
// PROBLEMATIC CODE
const agentStateHandler = (agentEvent) => { ... };
session.on(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);
setTimeout(() => {
  session.off(..., agentStateHandler);
}, 10000);
```

---

### 15. **Dynamic Import Caching Is Fragmented**

**Observation**: `shared/cached-imports.ts` exists but many handlers still use direct `await import()`. Module loading happens multiple times per session.

---

### 16. **Tool Count Warning Ignored**

**File**: `voice-agent-entry.ts` (lines 148-156)  
**Issue**: Tool count > 25 logs a warning but continues anyway. Gemini function calling degrades with too many tools.

---

### 17. **Handoff Event Listener Never Removed on Error**

**File**: `voice-agent-entry.ts` (lines 743-746)  
**Issue**: Handoff handler is added to `cleanupHandlers` array, but if session setup fails early, the cleanup array may not run.

---

### 18. **In-Process Executor Has No Job Timeout**

**File**: `in-process-executor.ts`  
**Issue**: Jobs can run forever. The 30-second graceful close timeout is only for disconnect, not for runaway jobs.

---

### 19. **VAD Not Reused Between Sessions**

**File**: `voice-agent-entry.ts` (line 408)  
**Issue**: `silero.VAD.load()` is called per session even though worker preloads it. The preloaded VAD isn't passed through.

---

## 🟡 MEDIUM Priority Issues

### 20. **Diagnostic Logging Uses Multiple Systems**

**Observation**: Code uses `process.stderr.write()`, `log()`, `diag.state()`, `createLogger()`, and `console.*` (violations). No unified telemetry.

---

### 21. **Cleanup Order Not Documented**

**File**: `cleanup-handler.ts`  
**Issue**: 17 cleanup steps in a specific order, but no documentation on why the order matters.

---

### 22. **WebSocket Ping Interval Inconsistent**

- `worker.ts`: `PING_INTERVAL_MS = 15_000`
- `livekit-keepalive.ts`: `KEEPALIVE_INTERVAL_MS = 30_000`

Should be unified.

---

### 23. **Session ID Generation Not Collision-Proof**

**File**: `voice-agent-entry.ts` (line 188)

```typescript
const sessionId = `session-${jobId}-${Date.now()}`;
```

Two concurrent requests in same millisecond = collision.

---

### 24. **Test Coverage Gaps**

- No tests for `voice-agent-entry.ts` main flow
- Error recovery tests are pattern tests, not integration
- No chaos testing for network partitions

---

### 25. **No Metrics for Session Health**

**Observation**: Session state changes are logged but not aggregated. Can't answer "how many sessions are in each phase?"

---

### 26. **Bundle Runtime State Restored But Not Validated**

**File**: `voice-agent-entry.ts` (lines 883-895)  
**Issue**: Bundle runtime state is restored from userData without validation. Corrupt state causes runtime errors.

---

### 27. **ProcessExit in Keep-Alive Can Corrupt Data**

**File**: `livekit-keepalive.ts` (line 117)

```typescript
process.exit(0); // No cleanup, data may be lost
```

---

## Architecture Recommendations

### 1. **Implement Session Supervisor Pattern**

Create a `SessionSupervisor` that:
- Owns all session state
- Manages cleanup lifecycle
- Handles restart/recovery
- Reports health to monitoring

### 2. **Unify State Management**

Complete migration to `SessionStateManager`:
- Remove raw `userData` mutations
- Use Proxy pattern (already implemented, just not used everywhere)
- Add state change events for monitoring

### 3. **Implement Circuit Breakers for External Services**

Priority order:
1. LiveKit (already has some handling)
2. Firestore (critical for persistence)
3. TTS (Cartesia)
4. LLM (Gemini)

### 4. **Add Session Health Dashboard**

Track:
- Active sessions by phase
- Cleanup success/failure rates
- Average session duration
- Error distribution by type

### 5. **Consolidate Error Handling**

Create unified `SessionError` types:
```typescript
type SessionErrorKind = 
  | 'CONNECTION'
  | 'PERSONA_LOAD'
  | 'SERVICE_INIT'
  | 'HANDLER_SETUP'
  | 'GREETING'
  | 'RUNTIME'
  | 'CLEANUP';
```

Each error type has specific recovery strategy.

---

## Immediate Action Items

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Fix race condition in room reconnect | 2h | High |
| P0 | Fix orphan interval timers | 3h | High |
| P0 | Reduce keepalive detection to 90s | 30m | High |
| P0 | Add error boundary in main loop | 1h | High |
| P1 | Remove 90s fallback in readiness | 30m | Medium |
| P1 | Fix stale worker require() | 1h | Medium |
| P1 | Add job timeout to in-process executor | 2h | Medium |
| P2 | Complete SessionStateManager migration | 8h | Medium |
| P2 | Add session health metrics | 4h | Low |

---

## Files Requiring Most Attention

| File | Lines | Issues | Priority |
|------|-------|--------|----------|
| `voice-agent-entry.ts` | 1147 | 8 | 🔴 Critical |
| `cleanup-handler.ts` | 669 | 3 | 🔴 Critical |
| `session-state-handler.ts` | 689 | 4 | 🟠 High |
| `worker.ts` | 616 | 3 | 🟠 High |
| `worker-readiness.ts` | 325 | 2 | 🟠 High |
| `transcript-handler.ts` | 813 | 2 | 🟡 Medium |

---

## Conclusion

The voice agent system works but is fragile. The main issues are:

1. **No unified session lifecycle management** - State is scattered
2. **Cleanup is defensive but not strategic** - Everything is try/catch'd but failures don't trigger recovery
3. **Reconnection/restart logic is incomplete** - Dead connections detected too late
4. **Testing doesn't cover actual failure modes** - Tests are patterns, not scenarios

**Recommended next step**: Implement `SessionSupervisor` pattern to own lifecycle, then migrate existing handlers to use it.




























