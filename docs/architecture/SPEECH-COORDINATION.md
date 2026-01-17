# Speech Coordination System

> **Status: ✅ PRODUCTION INTEGRATED** (Updated December 24, 2024)
>
> Intelligent, adaptive speech coordination to prevent overlap and ensure human-like interactions.

---

## Philosophy

This system replaces hardcoded values and boolean flags with **learned, adaptive behavior**:

| ❌ Eliminated | ✅ Replaced With |
|--------------|------------------|
| Hardcoded `800ms` echo prevention | Adaptive timing learned from actual speech |
| Hardcoded "slow tools" list | Tool timing database from real execution |
| Hardcoded acknowledgment phrases | Persona-aware, preference-learning acks |
| Boolean flags (`suppressMode`, etc.) | Clean state machine transitions |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        SPEECH COORDINATION SYSTEM                          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     SpeechCoordinator                                │  │
│  │  • Priority queue for all speech requests                           │  │
│  │  • Adaptive echo prevention window                                  │  │
│  │  • Post-speech cooldown learning                                    │  │
│  │  • Session attachment & lifecycle                                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│           │                                                                │
│           ├──────────────────────┬──────────────────────┐                 │
│           ▼                      ▼                      ▼                 │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────────┐      │
│  │StreamStateMachine│    │ PersonaAcks    │    │CoordinatedToolExec│      │
│  │                │    │                │    │                    │      │
│  │• NORMAL        │    │• Persona-aware │    │• Learned timings   │      │
│  │• BUFFERING_JSON│    │• User prefs    │    │• Smart acknowledge │      │
│  │• EXECUTING_TOOL│    │• Feedback loop │    │• Priority speaking │      │
│  │• AWAITING_BOUND│    │                │    │                    │      │
│  │• SUPPRESSING   │    │                │    │                    │      │
│  └────────────────┘    └────────────────┘    └────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/speech/coordination/
├── index.ts                         # Module exports
├── speech-coordinator.ts            # Central speech queue + adaptive timing
├── stream-state-machine.ts          # State machine for stream processing
├── persona-acknowledgments.ts       # Persona-aware acknowledgment generation
├── coordinated-tool-executor.ts     # Tool execution wrapper
├── sanitizer-integration.ts         # Bridge to tool-call-sanitizer
└── acknowledgment-persistence.ts    # Firestore persistence for preferences
```

---

## Components

### 1. SpeechCoordinator

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

| Priority | Value | Use Case |
|----------|-------|----------|
| BACKCHANNEL | 10 | "mm-hmm" - can be skipped |
| ACKNOWLEDGMENT | 20 | Filler while loading |
| RESPONSE | 30 | Normal LLM response |
| TOOL_RESULT | 40 | Tool execution results |
| CLARIFICATION | 50 | Asking for user input |
| INTERRUPT_RECOVERY | 60 | After user interrupted us |
| CRISIS | 100 | Crisis resources - NEVER skip |

### 2. StreamStateMachine

**Clean state transitions for LLM output stream processing.**

```typescript
import { createStreamStateMachine } from './speech/coordination';

const fsm = createStreamStateMachine();
const result = fsm.processChunk(chunk);

if (result.executeTool) {
  await executeTool(result.executeTool);
  fsm.toolStarted(toolId, promise);
}

if (result.emit) {
  controller.enqueue(result.emit);
}
```

**States:**

| State | What Happens |
|-------|-------------|
| NORMAL | Pass through text |
| BUFFERING_JSON | Accumulating possible JSON |
| EXECUTING_TOOL | Tool running, suppressing output |
| AWAITING_BOUNDARY | Tool done, waiting for sentence end |
| SUPPRESSING_LEAKAGE | Leakage detected, suppressing |

### 3. PersonaAcknowledgments

**Persona-aware, preference-learning acknowledgments.**

```typescript
import { generateAcknowledgment, recordAcknowledgmentFeedback } from './speech/coordination';

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

### 4. CoordinatedToolExecutor

**Wraps tool execution with intelligent coordination.**

```typescript
import { executeToolWithCoordination } from './speech/coordination';

const result = await executeToolWithCoordination(
  { toolId: 'searchNews', args: { query: 'tech news' }, personaId: 'ferni', userId: 'user123', session },
  myToolExecutor
);
```

---

## Integration Status

| Integration Point | Status | Location |
|------------------|--------|----------|
| Session attachment | ✅ | `voice-agent-entry.ts` |
| `coordinatedSay()` export | ✅ | `speech/coordination/index.ts` |
| Echo detection recording | ✅ | `transcript-handler.ts` |
| Tool acknowledgments | ✅ | `tool-call-sanitizer.ts` |
| StreamStateMachine wiring | ✅ | `sanitizer-integration.ts` |
| Cleanup on session end | ✅ | `voice-agent-entry.ts` |

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

## Usage Examples

### Basic Coordinated Speech

```typescript
import { coordinatedSay, initializeSpeechCoordination } from './speech/coordination';

// In voice-agent-entry.ts
initializeSpeechCoordination({ session, sessionId, personaId, userId });

// Anywhere else
coordinatedSay(sessionId, 'Let me check that for you', { allowInterruptions: true });
```

### Replacing Hardcoded Values

```typescript
// BEFORE: Hardcoded echo prevention
const ECHO_GRACE_PERIOD_MS = 800;
if (timeSinceAgentStopped < ECHO_GRACE_PERIOD_MS) return;

// AFTER: Adaptive
const coordinator = getSpeechCoordinator();
const echoWindow = coordinator.getEchoWindow(lastUtteranceDurationMs);
if (timeSinceAgentStopped < echoWindow) return;

// BEFORE: Hardcoded acknowledgments
const newsAcks = ['Hold on, let me grab that for you.', ...];
const ack = newsAcks[Math.floor(Math.random() * newsAcks.length)];

// AFTER: Persona-aware
const ack = generateAcknowledgment({ personaId, toolId: 'news' });
```

---

## E2E Testing

### Prerequisites

```bash
# Terminal 1-3: Standard dev servers
node token-server.js
PORT=3002 node ui-server.js
cd apps/web && pnpm dev

# Terminal 4: Voice agent with debug logging
DEBUG_SPEECH_COORDINATION=true pnpm dev
```

### Test Cases

1. **Greeting doesn't overlap with backchannels** - Start speaking immediately after greeting
2. **Tool results don't overlap with response** - Say "Play some jazz music"
3. **Handoff banter uses coordination** - Say "Talk to Peter about investing"
4. **Multiple quick requests queue properly** - Rapid speak/pause/speak
5. **Error recovery speech works** - Disconnect/reconnect network

### Success Criteria

- ✅ No audio overlap during normal conversation
- ✅ Handoffs sound natural (goodbye → greeting)
- ✅ Tool results don't interrupt responses  
- ✅ Backchannels respect speaking state
- ✅ Queue stays bounded (< 5 items typically)

---

## Monitoring

```typescript
// Get coordinator stats
const stats = coordinator.getStats();
// { totalRequests, requestsSpoken, requestsDropped, overlapsPrevented }

// Get tool timing stats
const toolStats = getToolTimingStats();
// Map<toolId, { avgDurationMs, p95DurationMs, sampleCount }>

// Get adaptive timing
const timing = coordinator.getAdaptiveTiming();
// { avgSpeechDurationMs, avgEchoDelayMs, postSpeechCooldownMs }
```

---

## Related Documentation

- Function Calling: `docs/architecture/FUNCTION-CALLING-SYSTEM.md`
- Voice Agent: `docs/architecture/VOICE-AGENT-PERFORMANCE.md`
- Tool Loading: `docs/architecture/TOOL-LOADING-SYSTEM.md`

---

*Last updated: December 24, 2024*

