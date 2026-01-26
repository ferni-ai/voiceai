# Shared Agent Utilities

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains shared utilities used by all voice agents. These are critical infrastructure components that handle everything from session setup to tool execution.

---

## Quick Reference

| What           | Where              |
| -------------- | ------------------ |
| LLMCompiler    | `llm-compiler/`    |
| Tool Sanitizer | `sanitizer/`       |
| Performance    | `performance/`     |
| Handoff        | `handoff/`         |
| Health Server  | `health-server.ts` |
| TTS Wrapper    | `tts-wrapper.ts`   |
| Session Setup  | `session-setup.ts` |

---

## Directory Structure

```
shared/
├── llm-compiler/        # ⚡ Parallel function calling (ICML 2024)
│   ├── types.ts         # DAG task types
│   ├── planner.ts       # Plan parsing, DAG validation
│   ├── executor.ts      # Parallel execution
│   └── joiner.ts        # Result aggregation
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

## Key Files

| File                        | Purpose                       |
| --------------------------- | ----------------------------- |
| `constants.ts`              | Shared constants              |
| `context-helpers.ts`        | Context building utilities    |
| `conversation-priming.ts`   | Initial conversation setup    |
| `crash-analytics.ts`        | Crash tracking and reporting  |
| `disconnect-diagnostics.ts` | Disconnect analysis           |
| `e2e-diagnostics.ts`        | End-to-end tracing            |
| `e2e-latency-tracker.ts`    | Latency measurement           |
| `function-call-format.ts`   | JSON function call types      |
| `generate-reply-gateway.ts` | Reply generation              |
| `greeting-audio-cache.ts`   | Pre-cached greetings          |
| `helpers.ts`                | General utilities             |
| `json-function-executor.ts` | JSON tool execution           |
| `lazy-loader.ts`            | Lazy module loading           |
| `livekit-keepalive.ts`      | Connection keep-alive         |
| `room-event-handlers.ts`    | LiveKit room events           |
| `safe-generate-reply.ts`    | Error-safe reply generation   |
| `session-metrics.ts`        | Session telemetry             |
| `shutdown-handler.ts`       | Graceful shutdown             |
| `startup-health.ts`         | Startup validation            |
| `warm-greeting.ts`          | Pre-warmed greeting audio     |
| `worker-readiness.ts`       | Worker initialization signals |

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

## LLMCompiler (Parallel Function Calling)

Based on ICML 2024 research. Enables **3.7x latency reduction** and **6.7x cost savings** through parallel tool execution.

### How It Works

```
LLM outputs DAG format:
[
  {"id":"t1","fn":"getWeather","args":{"city":"NYC"},"dependsOn":[]},
  {"id":"t2","fn":"playMusic","args":{"genre":"jazz"},"dependsOn":[]},
  {"id":"t3","fn":"summarize","args":{"data":"$t1"},"dependsOn":["t1"]}
]
     ↓
planner.ts: Parse and validate DAG
     ↓
executor.ts: Execute via ParallelExecutor (batches by dependencies)
     ↓
Batch 1: [t1, t2] run in parallel
Batch 2: [t3] runs after t1 completes (uses $t1 result)
     ↓
joiner.ts: Aggregate results
```

### Usage

Enabled via feature flag:
```bash
USE_LLMCOMPILER=true pnpm dev
```

### Key Components

| File | Purpose |
|------|---------|
| `types.ts` | `LLMCompilerTask`, `LLMCompilerPlan`, `LLMCompilerResult` |
| `planner.ts` | `containsLLMCompilerPlan()`, `parseLLMCompilerPlan()`, `validateDAG()` |
| `executor.ts` | `executeLLMCompilerPlan()` - leverages `ParallelExecutor` |
| `joiner.ts` | `aggregateResults()` - combines task outputs |

### Variable Substitution

Tasks can reference outputs from dependencies using `$taskId`:

```json
{"id":"t2","fn":"summarize","args":{"weather":"$t1"},"dependsOn":["t1"]}
```

The `$t1` is replaced with the actual output from task t1 before execution.

### Integration

The `json-function-executor.ts` automatically detects DAG format:

```typescript
// Detection is automatic in parseAndExecuteAll()
if (USE_LLMCOMPILER && containsLLMCompilerPlan(text)) {
  // Uses LLMCompiler parallel execution
}
```

### Metrics

Results include parallelism stats:

```typescript
interface LLMCompilerStats {
  totalTasks: number;       // Total tasks in plan
  parallelBatches: number;  // Number of execution batches
  successCount: number;     // Successful task count
  failureCount: number;     // Failed task count
  parallelismRatio: number; // totalTasks / parallelBatches (higher = more parallel)
}
```

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
- LLMCompiler: `llm-compiler/` (parallel function calling)
- Performance: `performance/CLAUDE.md`
- Sanitizer: `sanitizer/CLAUDE.md`
- Handoff: `handoff/CLAUDE.md`

---

_Last updated: January 2026_
