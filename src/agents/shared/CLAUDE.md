# Shared Agent Utilities

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains shared utilities used by all voice agents. These are critical infrastructure components that handle everything from session setup to tool execution.

---

## Quick Reference

| What             | Where                  |
| ---------------- | ---------------------- |
| Tool dispatcher  | `tool-dispatcher.ts`   |
| Tool Sanitizer   | `sanitizer/`           |
| Performance    | `performance/`     |
| Handoff        | `handoff/`         |
| Health Server  | `health-server.ts` |
| TTS Wrapper    | `tts-wrapper.ts`   |
| Session Setup  | `session-setup.ts` |

---

## Directory Structure

```
shared/
├── sanitizer/           # Leakage detection & TTS safety
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
  ctx,
  room,
  userParticipant,
  personaId,
  services,
  userData,
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
import { sanitizeToolCallLeakage } from './sanitizer/index.js';

const sanitizer = createToolCallSanitizer({
  onToolCall: (call) => executeToolCall(call),
  onLeakage: (text) => log.warn('Tool call leaked to speech'),
});
```

---

## Key Files (52 .ts files total)

### Session & Health

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `health-server.ts`            | Health and readiness endpoints      |
| `session-setup.ts`            | Voice agent session initialization  |
| `session-metrics.ts`          | Session telemetry                   |
| `session-closing-tracker.ts`  | Track session close reasons         |
| `session-health-monitor.ts`   | Monitor session health in real-time |
| `startup-health.ts`           | Startup validation                  |
| `shutdown-handler.ts`         | Graceful shutdown                   |
| `worker-readiness.ts`         | Worker initialization signals       |

### LLM & Reply Generation

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `generate-reply-gateway.ts`   | Reply generation gateway            |
| `safe-generate-reply.ts`      | Error-safe reply generation         |
| `response-orchestrator.ts`    | Multi-step response orchestration   |
| `tts-wrapper.ts`              | TTS with SSML + caching             |
| `conversational-audio-cache.ts` | Conversational audio caching      |
| `warm-greeting.ts`            | Pre-warmed greeting audio           |
| `greeting-audio-cache.ts`     | Pre-cached greetings                |

### Tool Execution

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `function-call-format.ts`     | Registered tool names / types       |
| `tool-dispatcher.ts`          | Neutral executeTool for /api/chat   |
| `function-call-telemetry.ts`  | Tool call telemetry tracking        |
| `parallel-tool-executor.ts`   | Parallel tool execution             |
| `tool-updater.ts`             | Dynamic tool list updates           |
| `turn-tool-optimizer.ts`      | Per-turn tool selection optimization|
| `gemini-fc-config.ts`         | Gemini function calling configuration|

### Diagnostics & Monitoring

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `crash-analytics.ts`          | Crash tracking and reporting        |
| `disconnect-diagnostics.ts`   | Disconnect analysis                 |
| `e2e-diagnostics.ts`          | End-to-end tracing                  |
| `e2e-latency-tracker.ts`      | Latency measurement                 |
| `openai-health-monitor.ts`    | OpenAI API health monitoring        |

### Connection & LiveKit

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `room-event-handlers.ts`      | LiveKit room events                 |
| `livekit-keepalive.ts`        | Connection keep-alive               |
| `resource-server.ts`          | Resource server for agent assets    |
| `vad-preloader.ts`            | Voice Activity Detection preloading |
| `vad-worker.ts`               | VAD worker process                  |

### Context & Conversation

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `constants.ts`                | Shared constants                    |
| `context-helpers.ts`          | Context building utilities          |
| `conversation-priming.ts`     | Initial conversation setup          |
| `helpers.ts`                  | General utilities                   |
| `lazy-loader.ts`              | Lazy module loading                 |
| `cameo-handler.ts`            | Cameo appearance handler            |

### Additional Utilities

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `action-approval-handler.ts`  | User approval for actions           |
| `action-history.ts`           | Action execution history            |
| `adaptive-endpointing-integration.ts` | Adaptive speech endpoint integration |
| `cache-reader.ts`             | Cache reading utilities             |
| `lightweight-resilience.ts`   | Lightweight resilience patterns     |
| `native-json-parser.ts`       | Native JSON parsing for tool calls  |
| `types.ts`                    | Shared type definitions             |
| `domain-tool-ids.generated.ts`| Generated tool ID mappings          |

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

_Last updated: January 2026_
