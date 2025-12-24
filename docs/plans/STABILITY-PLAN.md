# Ferni Voice Agent Stability Plan

> **Goal**: Eliminate all crash vectors and achieve production-grade reliability

---

## 🔴 Critical Issue: Native Mutex Crashes

The `@livekit/rtc-node` native C++ library has a mutex handling bug that causes fatal crashes:

```
libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed: Invalid argument
```

### Crash Vectors Identified

| Vector                            | Trigger                          | Current Protection           | Status         |
| --------------------------------- | -------------------------------- | ---------------------------- | -------------- |
| **1. generateReply timeout**      | Gemini API > 5s                  | `safeGenerateReply` wrapper  | ✅ Protected   |
| **2. Shutdown + reconnect race**  | SIGTERM during active connection | None                         | 🔴 Unprotected |
| **3. Concurrent generateReply**   | Multiple calls overlap           | Mutex in `safeGenerateReply` | ✅ Protected   |
| **4. WebSocket disconnect**       | Network issues                   | None                         | 🔴 Unprotected |
| **5. Room disconnect during TTS** | User leaves during speech        | None                         | 🟡 Partially   |

---

## 🛡️ Defense Layers

### Layer 1: Application-Level Protection (DONE)

- [x] `safeGenerateReply` wrapper with pre-emptive timeout
- [x] Circuit breaker for repeated failures
- [x] Mutual exclusion for concurrent calls
- [x] Context size monitoring
- [x] Graceful fallbacks with `session.say()`

### Layer 2: Worker-Level Protection (TODO)

- [ ] Prevent reconnect during shutdown
- [ ] Graceful signal handling with cleanup delays
- [ ] Drain active jobs before shutdown
- [ ] Handle WebSocket disconnects gracefully

### Layer 3: Process-Level Protection (TODO)

- [ ] PM2 or similar process manager with auto-restart
- [ ] Crash logging and alerting
- [ ] Health check endpoint improvements
- [ ] Container orchestration with restart policies

### Layer 4: SDK-Level Fix (LONG-TERM)

- [ ] Fork `@livekit/rtc-node` and fix mutex handling
- [ ] Upstream PR to LiveKit
- [ ] Or: Migrate to different SDK version/language

---

## 🔧 Immediate Fixes Needed

### Fix 1: Prevent Reconnect During Shutdown

The crash happens because:

1. SIGTERM received → shutdown starts
2. WebSocket closes → reconnect scheduled
3. Native code has mutex conflict between shutdown and reconnect

**Solution**: Cancel reconnect when shutdown is in progress.

Location: `src/agents/voice-agent-entry.ts` or worker initialization

```typescript
// In worker initialization
let isShuttingDown = false;

process.on('SIGTERM', () => {
  isShuttingDown = true;
  // Disable reconnect logic
  worker.setReconnectEnabled(false);
  // Graceful shutdown with delay
  setTimeout(() => process.exit(0), 1000);
});
```

### Fix 2: Add Process Manager

Use PM2 for automatic restart on crash:

```bash
# pm2.config.js
module.exports = {
  apps: [{
    name: 'ferni-agent',
    script: 'pnpm',
    args: 'dev',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 2000,
    watch: false,
  }]
};
```

### Fix 3: Native Crash Handler

Catch native crashes and log them before exit:

```typescript
process.on('uncaughtException', (error) => {
  logger.fatal({ error: String(error) }, 'Uncaught exception - process will exit');
  // Log to external service for alerting
  process.exit(1);
});
```

---

## 📊 Monitoring Additions

### Metrics to Track

- `generateReply` success/failure rate
- Average response latency
- Circuit breaker open count
- Crash count by vector
- Reconnect attempt count

### Alerts to Set Up

- Crash rate > 1/hour
- Circuit breaker opens
- Reconnect loops (> 3 in 5 min)
- Response latency > 3s P95

---

## 🗓️ Implementation Order

### Phase 1: Stop the Bleeding (This Week)

1. ✅ `safeGenerateReply` wrapper
2. ✅ Mutual exclusion for generateReply
3. ⏳ Fix shutdown/reconnect race
4. ⏳ Add PM2 for auto-restart

### Phase 2: Robustness (Next Week)

1. Comprehensive error boundaries
2. WebSocket health monitoring
3. Graceful degradation for all tool calls
4. Crash telemetry

### Phase 3: Long-term (2-4 Weeks)

1. Fork/fix `@livekit/rtc-node` or upstream PR
2. Load testing and chaos engineering
3. Automated stability tests
4. SLA monitoring dashboard

---

## 🐛 Known Issues Tracking

| Issue                                | Severity | Root Cause     | Fix Status |
| ------------------------------------ | -------- | -------------- | ---------- |
| Mutex crash on generateReply timeout | Critical | Native code    | ✅ Wrapped |
| Mutex crash on shutdown              | Critical | Reconnect race | ✅ Fixed   |
| Agent goes silent mid-conversation   | High     | Multiple       | ✅ Fixed   |
| Gemini not emitting JSON             | Medium   | Prompt drift   | ✅ Fixed   |
| Tool results not spoken              | Medium   | Stream closes  | ✅ Fixed   |

## Root Cause Analysis: Tool Results Not Spoken

**Previous (Broken) Flow:**

```
1. Gemini outputs JSON: {"fn":"searchNews","args":{}}
2. Sanitizer detects JSON in TTS stream
3. Tool executes async (fire-and-forget)
4. TTS stream closes (no more text)
5. Tool completes → controller.enqueue() fails (stream closed)
6. User hears "Let me check" then SILENCE
```

**Fixed Flow:**

```
1. Gemini outputs JSON: {"fn":"searchNews","args":{}}
2. Sanitizer detects JSON in TTS stream
3. Tool executes async
4. TTS stream closes (expected)
5. Tool completes → safeGenerateReply() triggers new LLM turn
6. LLM naturally speaks the tool result
7. User hears "Let me check... Here's what I found..."
```

**Key Change:** Tool results now use `safeGenerateReply()` to trigger a NEW LLM turn
instead of trying to inject into the (possibly closed) TTS stream.

---

## 📝 Notes

- Node.js version: v24.1.0 (consider testing with v20 LTS)
- LiveKit SDK: @livekit/agents 0.x
- The native crash cannot be caught by JavaScript try/catch
- Multiple instances might help availability during crashes
