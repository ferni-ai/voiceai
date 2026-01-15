# Shared Agent Utilities

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains shared utilities used by all voice agents. These are critical infrastructure components that handle everything from session setup to tool execution.

---

## Quick Reference

| What | Where |
|------|-------|
| Tool Sanitizer | `sanitizer/` |
| Performance | `performance/` |
| Handoff | `handoff/` |
| Health Server | `health-server.ts` |
| TTS Wrapper | `tts-wrapper.ts` |
| Session Setup | `session-setup.ts` |

---

## Directory Structure

```
shared/
├── sanitizer/           # Tool call detection & sanitization
│   ├── detectors/       # Leakage detection
│   ├── executors/       # Deduplication, retry
│   └── streams/         # Transform streams
├── performance/         # Performance optimizations
│   ├── cache-aware-tts.ts
│   ├── parallel-executor.ts
│   └── speculative-preloading.ts
├── handoff/             # Multi-agent handoff coordination
│   ├── coordinator-adapter.ts
│   ├── event-handler.ts
│   └── session-state.ts
├── tool-executors/      # Tool execution utilities
├── __tests__/           # Test suites
└── *.ts                 # Core utilities
```

---

## Core Components

### Health Server (`health-server.ts`)

Provides health and readiness endpoints for deployment:

```typescript
// Endpoints:
// GET /health       - Liveness check
// GET /health/ready - Readiness check (workers initialized)
```

### Session Setup (`session-setup.ts`)

Initializes voice agent sessions:

```typescript
import { setupSession } from './session-setup.js';

const session = await setupSession({
  ctx, room, userParticipant,
  personaId, services, userData,
});
```

### TTS Wrapper (`tts-wrapper.ts`)

Wraps TTS with SSML support and caching:

```typescript
import { wrapTTS } from './tts-wrapper.js';

const tts = await wrapTTS(baseTTS, {
  persona,
  enableCache: true,
  enableSSML: true,
});
```

### Tool Call Sanitizer (`tool-call-sanitizer.ts`)

Intercepts and sanitizes tool calls from LLM output:

```typescript
import { createToolCallSanitizer } from './tool-call-sanitizer.js';

const sanitizer = createToolCallSanitizer({
  onToolCall: (call) => executeToolCall(call),
  onLeakage: (text) => log.warn('Tool call leaked to speech'),
});
```

---

## Key Files

| File | Purpose |
|------|---------|
| `constants.ts` | Shared constants |
| `context-helpers.ts` | Context building utilities |
| `conversation-priming.ts` | Initial conversation setup |
| `crash-analytics.ts` | Crash tracking and reporting |
| `disconnect-diagnostics.ts` | Disconnect analysis |
| `e2e-diagnostics.ts` | End-to-end tracing |
| `e2e-latency-tracker.ts` | Latency measurement |
| `function-call-format.ts` | JSON function call types |
| `generate-reply-gateway.ts` | Reply generation |
| `greeting-audio-cache.ts` | Pre-cached greetings |
| `helpers.ts` | General utilities |
| `intelligence-hooks.ts` | Context builder hooks |
| `json-function-executor.ts` | JSON tool execution |
| `lazy-loader.ts` | Lazy module loading |
| `livekit-keepalive.ts` | Connection keep-alive |
| `room-event-handlers.ts` | LiveKit room events |
| `safe-generate-reply.ts` | Error-safe reply generation |
| `session-metrics.ts` | Session telemetry |
| `shutdown-handler.ts` | Graceful shutdown |
| `startup-health.ts` | Startup validation |
| `warm-greeting.ts` | Pre-warmed greeting audio |
| `worker-readiness.ts` | Worker initialization signals |

---

## Performance Optimizations

See `performance/CLAUDE.md` for detailed documentation on:

- Parallel execution
- TTS caching
- Speculative preloading
- Pre-STT audio transforms
- Streaming TTS transforms

---

## Handoff Coordination

See `handoff/CLAUDE.md` for multi-agent handoff:

- Session state management
- Coordinator adapters
- Event handling

---

## Tool Sanitizer

See `sanitizer/CLAUDE.md` for tool call interception:

- Pattern matching
- Leakage detection
- Deduplication
- Retry logic

---

## Rules

### Do ✅
- Use session-scoped state
- Clean up resources on disconnect
- Log with context (sessionId, userId)
- Handle all errors gracefully
- Write tests for new utilities

### Don't ❌
- Store state in module-level variables
- Skip cleanup
- Throw unhandled errors
- Use `console.log` - use `getLogger()`
- Add persona-specific logic (use context)

---

## Reference Docs

- Voice Agents: `../CLAUDE.md`
- Performance: `performance/CLAUDE.md`
- Sanitizer: `sanitizer/CLAUDE.md`
- Handoff: `handoff/CLAUDE.md`

---

*Last updated: January 2026*
