# Processing Timeline: User Stops → Agent Speaks

## Executive Summary

This document maps exactly what Ferni does and says while waiting for the LLM to produce text. Understanding this timeline is critical for debugging dead air issues and improving the user experience.

**Key Insight:** The gap between user finishing speaking and agent starting to speak can be 0.5-5+ seconds. During this time, we employ multiple overlapping systems to prevent awkward silence.

---

## 🎬 The Complete Timeline

### Phase 1: User Stops Speaking (0ms)

When `UserStateChanged: listening` fires:

| Action                         | Trigger Time | What Happens                                   |
| ------------------------------ | ------------ | ---------------------------------------------- |
| **DJ Booth Processing Start**  | Immediate    | `onProcessingStart()` schedules thinking music |
| **Early Acknowledgment Timer** | Immediate    | Schedules filler at 4s                         |
| **Turn Processing Begins**     | Immediate    | `processTurn()` starts building context        |
| **Music Unduck**               | Immediate    | Restores music volume if playing               |

**Files:** `session-state-handler.ts:449-507`

---

### Phase 2: Turn Processing (0-2500ms typical)

The `processTurn()` function does extensive work BEFORE sending to the LLM:

```
                 Time →
    0ms    100ms   200ms   300ms   400ms   500ms   1s    1.5s    2s
    │       │       │       │       │       │      │      │      │
    ├───────────────────────────────────────────────────────────────┤
    │  Message Analysis (~50ms)                                     │
    ├───────────────────────────────────────────────────────────────┤
    │  Conversation State Update (~30ms)                            │
    ├───────────────────────────────────────────────────────────────┤
    │  Easter Egg Check (~20ms)                                     │
    ├───────────────────────────────────────────────────────────────┤
    │  Emotional State Building (~50ms)                             │
    ├───────────────────────────────────────────────────────────────┤
    │  Response Guidance (~30ms)                                    │
    ├───────────────────────────────────────────────────────────────┤
    │  Context Injections (PARALLELIZED) (~150ms)                   │
    │    ├─ Memory Context                                          │
    │    ├─ Trust Context                                           │
    │    ├─ Emotional Context                                       │
    │    ├─ Topic Tracking                                          │
    │    └─ Superhuman Insights                                     │
    ├───────────────────────────────────────────────────────────────┤
    │  Advanced Humanization (~100ms)                               │
    └───────────────────────────────────────────────────────────────┘

    Total: 300-600ms typical (can spike to 2s+ under load)
```

**Files:** `turn-processor.ts:365-507`

---

### Phase 3: Soft Timeout Filler (2500ms)

If turn processing exceeds the soft timeout:

```typescript
// turn-handler.ts - Uses ProcessingIntelligence for context-aware phrases
const fillerPromise = new Promise<void>((resolve) => {
  fillerTimeout = setTimeout(() => {
    if (!spokeFiller && currentSession) {
      spokeFiller = true;
      const emotionIntensity = voiceEmotion?.confidence ?? 0.5;
      const filler = getContextAwareThinkingFiller(persona.id, {
        type: 'thinking',
        weight: emotionIntensity > 0.7 ? 'heavy' : emotionIntensity > 0.4 ? 'medium' : 'light',
        emotionalState: voiceEmotion
          ? { primary: voiceEmotion.primary, intensity: voiceEmotion.confidence }
          : undefined,
        hourOfDay: new Date().getHours(),
      });
      currentSession.say(filler, { allowInterruptions: true });
    }
    resolve();
  }, PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT); // 2500ms
});
```

**What We Say (context-aware via ProcessingIntelligence):**

| Weight     | Example Phrases                                         |
| ---------- | ------------------------------------------------------- |
| **Light**  | "One moment." / "Hmm." / "Let me see..."                |
| **Medium** | "I'm sitting with that." / "Let me think about that."   |
| **Heavy**  | "That's a lot to hold." / "Give me a moment with that." |

Phrases vary by:

- **Emotional intensity** (detected from voice)
- **Time of day** (late night gets 40% longer pauses)
- **Relationship stage** (new users get more explicit signals)

**Files:** `src/intelligence/processing-intelligence.ts`

---

### Phase 4: Early Acknowledgment Backup (4000ms)

If agent STILL hasn't spoken by 4 seconds:

```typescript
// session-state-handler.ts - Uses ProcessingIntelligence for context-aware phrases
earlyAckTimer = setTimeout(() => {
  if (!conversationManager.isAgentSpeaking()) {
    const emotionIntensity = lastEmotionAnalysis?.intensity ?? 0.5;
    const filler = getContextAwareThinkingFiller(sessionPersona.id, {
      type: 'thinking',
      weight: emotionIntensity > 0.7 ? 'heavy' : emotionIntensity > 0.4 ? 'medium' : 'light',
      emotionalState: lastEmotionAnalysis,
      hourOfDay: new Date().getHours(),
    });
    session.say(filler, { allowInterruptions: true });
    diag.state('Early acknowledgment (agent processing)');
  }
}, SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000); // 4000ms
```

**Note:** This is a BACKUP that only fires if the 2.5s filler didn't happen (e.g., turn processing completed but LLM is slow).

---

### Phase 5: Thinking Music (800ms - 8s delay)

DJ Booth schedules ambient music to fill silence:

```typescript
// dj-enhancements.ts:402-416
onProcessingStart(): void {
  this.startTimer = setTimeout(() => {
    void this.startThinkingMusic();
  }, this.config.startDelay); // 800ms default, varies by persona
}
```

**Persona DJ Styles:**

| Style              | Start Delay | Personas                                        |
| ------------------ | ----------- | ----------------------------------------------- |
| `fill-immediately` | 2000ms      | Jordan (energetic planners)                     |
| `wait-for-moment`  | 5000ms      | Default                                         |
| `ambient-only`     | 8000ms      | Nayan (philosophical, comfortable with silence) |

**Music:** Plays at 8% volume from ambient music collection.

**Files:** `dj-enhancements.ts:367-585`, `dj-session.service.ts:332-350`

---

### Phase 6: Hard Timeout (5000ms)

If processing exceeds 5 seconds, we give up on rich context:

```typescript
// turn-handler.ts:252-265
const result = await Promise.race([
  processTurn(turnContext),
  new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error('Turn processing hard timeout')),
      PROCESSING_TIMEOUTS.TURN_PROCESSING_HARD_TIMEOUT // 5000ms
    );
  }),
]);
```

---

## 🔊 What We Say During Tool Execution

When tools run (calendar, search, music), there's CURRENTLY no verbal feedback:

```typescript
// tool-tracking-handler.ts:92-108
session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
  // Only logging, no verbal feedback during execution
  logger.info({ event }, '🔧 FUNCTION TOOLS EXECUTED');
});
```

**Gap Identified:** Tools like calendar lookup, web search, or weather can take 1-10+ seconds with no verbal acknowledgment.

**Suggested Fix (from Dead Air Audit):**

```typescript
const toolFillers = {
  calendar: 'Let me check your calendar...',
  search: 'Looking that up...',
  weather: 'Checking the weather...',
  music: 'Finding something good...',
  default: 'Give me just a moment...',
};
```

---

## 🎤 Backchanneling Systems

### While User Is Speaking

| System                  | Timing                                  | What We Say                 |
| ----------------------- | --------------------------------------- | --------------------------- |
| **Regular Backchannel** | After 3s of speaking (if turn ≥3)       | "Mm-hmm" / "Right" / "Yeah" |
| **Live Backchannel**    | During breath pauses (every 200ms poll) | Soft "Mm-hmm" (if turn ≥2)  |

### During User Silence

| Duration  | Response Type              | Example                      |
| --------- | -------------------------- | ---------------------------- |
| **4-10s** | Medium silence backchannel | "I'm here when you're ready" |
| **10s**   | Meaningful silence #1      | Persona-appropriate presence |
| **22s**   | Meaningful silence #2      | Gentle check-in              |
| **38s**   | Meaningful silence #3      | Offer music or space         |

**Files:** `session-state-handler.ts:591-708`

---

## ⏱️ All Timing Constants (Consolidated)

| Constant                       | Value   | Location                 | Purpose                         |
| ------------------------------ | ------- | ------------------------ | ------------------------------- |
| `TURN_PROCESSING_SOFT_TIMEOUT` | 2500ms  | constants.ts             | Speak filler if processing slow |
| `TURN_PROCESSING_HARD_TIMEOUT` | 5000ms  | constants.ts             | Skip rich context if exceeded   |
| `EARLY_ACKNOWLEDGMENT_SECONDS` | 4.0s    | constants.ts             | Backup filler (if LLM slow)     |
| `THINKING_MUSIC_DELAY`         | 800ms   | dj-session.service.ts    | Default delay before music      |
| `THINKING_MUSIC_MAX_DURATION`  | 15000ms | dj-session.service.ts    | Auto-stop thinking music        |
| `BACKCHANNEL_TRIGGER_MS`       | 3000ms  | session-state-handler.ts | When to try backchannel         |
| `BACKCHANNEL_MIN_INTERVAL_MS`  | 4000ms  | session-state-handler.ts | Cooldown between backchannels   |
| `MEDIUM_SILENCE_THRESHOLD_SEC` | 4s      | session-state-handler.ts | When to acknowledge silence     |
| `MEDIUM_SILENCE_COOLDOWN_MS`   | 12000ms | session-state-handler.ts | Cooldown for silence acks       |

---

## 📊 What's Missing (Observability Gaps)

### 1. No Time-to-First-Audio Metric

We don't track how long users wait for the first audio after they stop speaking.

**Suggestion:**

```typescript
// Record when user stops speaking
const userStoppedAt = Date.now();

// Record when agent starts speaking
session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
  if (event.newState === 'speaking') {
    const ttfa = Date.now() - userStoppedAt;
    metrics.recordTimeToFirstAudio(ttfa);
  }
});
```

### 2. No Phase-by-Phase Visibility

During long waits, we don't know which phase is slow:

- Is it turn processing?
- Is it the LLM?
- Is it TTS?

### 3. No Tool Execution Duration Tracking

We don't track how long individual tools take or whether they contribute to dead air.

### 4. No Frontend "Processing" State

The frontend doesn't know when the backend is:

- Processing the turn
- Waiting for LLM
- Waiting for TTS
- Executing tools

---

## 🎯 Improvement Recommendations

### Priority 1: Tool Execution Verbal Fillers

Add pre-tool verbal fillers for long-running tools:

```typescript
// Before tool executes
session.on(voice.AgentSessionEventTypes.FunctionCallsCollected, (event) => {
  for (const call of event.calls) {
    if (LONG_RUNNING_TOOLS.includes(call.name)) {
      const filler = getToolFiller(call.name, persona.id);
      session.say(filler, { allowInterruptions: true });
    }
  }
});
```

### Priority 2: Processing State Events

Emit events to frontend for processing visibility:

```typescript
// Emit processing phases to frontend
sendDataMessage('processing_state', { phase: 'turn_processing' });
sendDataMessage('processing_state', { phase: 'llm_generating' });
sendDataMessage('processing_state', { phase: 'tool_executing', tool: 'calendar' });
```

### Priority 3: Time-to-First-Audio Metrics

Track and alert on slow responses:

```typescript
const TTFA_THRESHOLDS = {
  good: 800, // <800ms is excellent
  acceptable: 1500, // <1.5s is okay
  warning: 2500, // >2.5s needs attention
  critical: 5000, // >5s is a bug
};
```

---

## 📂 Key Files Reference

| File                                              | Purpose                                            |
| ------------------------------------------------- | -------------------------------------------------- |
| `src/agents/shared/constants.ts`                  | Timing constants                                   |
| `src/agents/voice-agent/session-state-handler.ts` | User state changes, backchannels, silence handling |
| `src/agents/voice-agent/turn-handler.ts`          | Turn processing with timeouts                      |
| `src/agents/voice-agent/tool-tracking-handler.ts` | Tool execution tracking                            |
| `src/agents/processors/turn-processor.ts`         | The hot path that builds context                   |
| `src/services/dj-session.service.ts`              | DJ booth, thinking music                           |
| `src/audio/dj-enhancements.ts`                    | Thinking music controller                          |
| `src/speech/persona-phrases.ts`                   | Thinking fillers, backchannels                     |
| `src/personas/meaningful-silence.ts`              | Long silence responses                             |
| `docs/audits/DEAD-AIR-AUDIT.md`                   | Complete dead air audit                            |

---

_Last Updated: December 2024_
_Author: AI Performance Team_
