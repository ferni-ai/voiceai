# Speech Coordination System

> **Intelligent, adaptive speech coordination to prevent overlap and ensure human-like interactions.**

## Philosophy

This system replaces hardcoded values and boolean flags with **learned, adaptive behavior**:

- ❌ No hardcoded `800ms` echo prevention window
- ❌ No hardcoded lists of "slow tools"
- ❌ No hardcoded acknowledgment phrases
- ❌ No boolean flags like `suppressMode`, `waitForMoreContext`

Instead:

- ✅ **Adaptive timing** learned from actual speech patterns
- ✅ **Tool timing database** that learns from real execution times
- ✅ **Persona-aware acknowledgments** loaded from bundles
- ✅ **Clean state machine** for stream processing

---

## Components

### 1. SpeechCoordinator (`speech-coordinator.ts`)

**Centralized control for ALL speech output.**

```typescript
import { getSpeechCoordinator, SpeechPriority } from './speech/coordination';

const coordinator = getSpeechCoordinator();
coordinator.attachSession(session);

// Request to speak with priority
await coordinator.requestSpeak({
  text: 'Here are the latest headlines',
  priority: SpeechPriority.TOOL_RESULT,
  source: 'tool',
});

// Convenience methods
await coordinator.speakToolResult(resultText, 'news');
await coordinator.speakAcknowledgment('Let me check on that');
await coordinator.speakBackchannel('mm-hmm');
```

**Priority Levels:**

| Priority              | Value | Use Case                    |
| --------------------- | ----- | --------------------------- |
| BACKCHANNEL           | 10    | "mm-hmm" - can be skipped   |
| ACKNOWLEDGMENT        | 20    | Filler while loading        |
| RESPONSE              | 30    | Normal LLM response         |
| TOOL_RESULT           | 40    | Tool execution results      |
| CLARIFICATION         | 50    | Asking for user input       |
| INTERRUPT_RECOVERY    | 60    | After user interrupted us   |
| CRISIS                | 100   | Crisis resources - NEVER skip |

**Adaptive Features:**

- **Echo Prevention Window**: Calculated based on actual utterance duration + learned echo delays
- **Post-Speech Cooldown**: Adapts based on observed speech patterns
- **Priority Queue**: Higher priority speech can preempt lower priority

### 2. StreamStateMachine (`stream-state-machine.ts`)

**Clean state transitions for LLM output stream processing.**

```typescript
import { createStreamStateMachine, StreamState } from './speech/coordination';

const fsm = createStreamStateMachine();

// Process each chunk
const result = fsm.processChunk(chunk);

if (result.executeTool) {
  // Execute detected tool
  await executeTool(result.executeTool);
  fsm.toolStarted(toolId, promise);
}

if (result.emit) {
  // Safe to emit this text
  controller.enqueue(result.emit);
}
```

**States:**

| State                | What Happens                        |
| -------------------- | ----------------------------------- |
| NORMAL               | Pass through text                   |
| BUFFERING_JSON       | Accumulating possible JSON          |
| EXECUTING_TOOL       | Tool running, suppressing output    |
| AWAITING_BOUNDARY    | Tool done, waiting for sentence end |
| SUPPRESSING_LEAKAGE  | Leakage detected, suppressing       |

### 3. PersonaAcknowledgments (`persona-acknowledgments.ts`)

**Persona-aware, preference-learning acknowledgments.**

```typescript
import {
  generateAcknowledgment,
  shouldAcknowledge,
  recordAcknowledgmentFeedback,
} from './speech/coordination';

// Generate persona-appropriate acknowledgment
const ack = generateAcknowledgment({
  personaId: 'ferni',
  userId: 'user123',
  toolId: 'news',
  estimatedWaitMs: 3000,
});

// Record user feedback for learning
recordAcknowledgmentFeedback('user123', ack, 'searching', wasPositive);
```

**Learning Features:**

- Tracks which phrases user responds well to
- Infers length preference (short vs long acknowledgments)
- Avoids phrases user has shown annoyance at
- Weighted random selection favoring preferred phrases

### 4. CoordinatedToolExecutor (`coordinated-tool-executor.ts`)

**Wraps tool execution with intelligent coordination.**

```typescript
import { executeToolWithCoordination } from './speech/coordination';

const result = await executeToolWithCoordination(
  {
    toolId: 'searchNews',
    args: { query: 'tech news' },
    personaId: 'ferni',
    userId: 'user123',
    session,
  },
  myToolExecutor
);
```

**Features:**

- **Learned Tool Timings**: Records actual execution times, calculates p95
- **Intelligent Acknowledgments**: Only shows acknowledgment if tool is expected to be slow
- **Coordinated Speaking**: Uses SpeechCoordinator for result delivery

---

## Integration Points

### Session State Handler

The `session-state-handler.ts` now uses adaptive echo prevention:

```typescript
// OLD: Hardcoded
const ECHO_GRACE_PERIOD_MS = 800;

// NEW: Adaptive
const echoGracePeriod = getEchoGracePeriod(lastUtteranceDurationMs);
```

The coordinator learns from:

- Actual speech durations
- Echo detection events
- Natural pacing gaps

### Tool Call Sanitizer

The coordinator can be used to replace the hardcoded slow tool list and acknowledgments:

```typescript
// OLD: Hardcoded list
const slowTools = ['searchnews', 'getnews', 'getweather', ...];

// NEW: Learned timing
if (isSlowTool(toolId)) {
  const ack = generateAcknowledgment({ personaId, toolId });
  await coordinator.speakAcknowledgment(ack);
}
```

---

## How Learning Works

### Echo Prevention Learning

```
1. Agent speaks for X ms
2. Agent stops speaking
3. Mic picks up echo Y ms later
4. System records echo at Y ms delay
5. Future echo window = max(Y * 1.5, X * 0.2)
```

### Tool Timing Learning

```
1. Tool executes
2. Actual duration recorded
3. Rolling window of 50 samples
4. p95 used for acknowledgment decisions
5. Tools with p95 > 1000ms get acknowledgment
```

### Acknowledgment Preference Learning

```
1. User hears acknowledgment
2. User responds positively (continues) or negatively (sighs, pauses)
3. Phrase marked as preferred/disliked
4. Future selections weighted toward preferred
5. Length preference inferred from average liked phrase length
```

---

## Files

| File                           | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `speech-coordinator.ts`        | Central speech queue + adaptive timing |
| `stream-state-machine.ts`      | State machine for stream processing  |
| `persona-acknowledgments.ts`   | Persona-aware acknowledgment generation |
| `coordinated-tool-executor.ts` | Tool execution wrapper               |
| `index.ts`                     | Module exports                       |

---

## Migration Guide

### Replacing Hardcoded Echo Prevention

```typescript
// BEFORE
const ECHO_GRACE_PERIOD_MS = 800;
if (timeSinceAgentStopped < ECHO_GRACE_PERIOD_MS) return;

// AFTER
const coordinator = getSpeechCoordinator();
const echoWindow = coordinator.getEchoWindow(lastUtteranceDurationMs);
if (timeSinceAgentStopped < echoWindow) return;
```

### Replacing Hardcoded Acknowledgments

```typescript
// BEFORE
const newsAcks = ['Hold on, let me grab that for you.', ...];
const ack = newsAcks[Math.floor(Math.random() * newsAcks.length)];

// AFTER
const ack = generateAcknowledgment({
  personaId,
  toolId: 'news',
  toolCategory: 'searching',
});
```

### Replacing Boolean Flags

```typescript
// BEFORE
let suppressMode = false;
let waitForMoreContext = false;
let jsonAccumulatorActive = false;

// AFTER
const fsm = createStreamStateMachine();
const result = fsm.processChunk(chunk);
if (result.suppress) return; // Clean state management
```

---

## Monitoring

```typescript
// Get coordinator stats
const stats = coordinator.getStats();
// { totalRequests, requestsSpoken, requestsDropped, overlapsPrevented, ... }

// Get tool timing stats
const toolStats = getToolTimingStats();
// Map<toolId, { avgDurationMs, p95DurationMs, sampleCount }>

// Get adaptive timing
const timing = coordinator.getAdaptiveTiming();
// { avgSpeechDurationMs, avgEchoDelayMs, postSpeechCooldownMs, ... }
```

---

## Future Enhancements

1. **Persist learning across sessions** (currently in-memory)
2. **Cross-user learning** (anonymized patterns)
3. **A/B testing for acknowledgments** (which phrases work best)
4. **Voice prosody integration** (adjust timing based on speaking rate)

