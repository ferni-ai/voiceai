# 🔄 Bidirectional Behavior System

> **Making Ferni's behaviors truly dynamic - code triggers speech, speech triggers code**

## ✅ Implementation Status: FULLY INTEGRATED

All components have been implemented and tested end-to-end:

### Core Components

| Component | File | Status |
|-----------|------|--------|
| Types & Interfaces | `src/agents/realtime/behavior-types.ts` | ✅ Complete |
| Event Dispatcher | `src/agents/realtime/behavior-event-dispatcher.ts` | ✅ Complete |
| Processing Intelligence | `src/intelligence/processing-intelligence.ts` | ✅ Complete |
| Behavior Tools | `src/tools/domains/behavior/index.ts` | ✅ Complete |
| Frontend Service | `apps/web/src/services/behavior-signal.service.ts` | ✅ Complete |
| Frontend EQ Handlers | `apps/web/src/ui/better-than-human.ui.ts` | ✅ Complete |
| Turn Handler Integration | `src/agents/voice-agent/turn-handler.ts` | ✅ Complete |
| Function Calling Guide | `src/personas/bundles/ferni/identity/function-calling.md` | ✅ Complete |

### Extended Integrations (NEW)

| Integration | File | Status |
|-------------|------|--------|
| AliveOrchestrator → Behavior | `src/services/alive-orchestrator.ts` | ✅ Complete |
| Advanced Humanization Loader | `src/personas/bundles/advanced-humanization-loader.ts` | ✅ Complete |
| Shared Persona Personality | `src/personas/shared/persona-turn-personality.ts` | ✅ Complete |
| E2E Test Suite | `src/tests/behavior-system-e2e.test.ts` | ✅ Complete |
| All Persona Function Calling | `src/personas/bundles/*/identity/function-calling.md` | ✅ Complete |

### AliveOrchestrator Integration

Music/game events now trigger behavior mode shifts automatically:

| Alive Event | Behavior Mode |
|-------------|---------------|
| `voice_music_offer` | `exploration` |
| `our_song_callback` | `presence` |
| `musical_personality` | `exploration` |
| `game_milestone` | `celebration` |
| `game_intensity_change` | `celebration` |
| `first_turn_notice` | `presence` |

### Advanced Humanization

Persona-specific humanization JSON files are now loaded and integrated:

- Subtext responses (deflection, minimizing, testing_waters)
- Emotional aftercare (holding, grounding)
- Energy regulation (matching_low, leading_up)
- Micro-affirmations (acknowledgments, validations, encouragements)
- Paradoxical interventions (for resistance patterns)

See `src/personas/bundles/{persona}/content/behaviors/advanced-humanization.json`

---

## Current State: One-Way Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LLM (Ferni)                         System                    │
│   ┌─────────┐                         ┌─────────┐              │
│   │ Decides │ ──── JSON call ────────>│ Execute │              │
│   │ to act  │                         │ function│              │
│   └─────────┘                         └────┬────┘              │
│        ▲                                   │                    │
│        │                                   │                    │
│        └──────── Return result ────────────┘                    │
│                                                                 │
│   Context injections happen, but don't trigger BEHAVIORS        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Target State: Bidirectional Behavior Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                   BIDIRECTIONAL ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LLM (Ferni)                         System                    │
│   ┌─────────┐                         ┌─────────┐              │
│   │ Decides │ ──── JSON call ────────>│ Execute │              │
│   │ to act  │                         │ function│              │
│   └────┬────┘                         └────┬────┘              │
│        │                                   │                    │
│        │   ┌───────────────────────────────┘                    │
│        │   │                                                    │
│        │   │  NEW: System-Initiated Behavior Events             │
│        │   │                                                    │
│        ▼   ▼                                                    │
│   ┌─────────────────────────────────────────────┐              │
│   │            BEHAVIOR DISPATCHER              │              │
│   │  ┌────────────────────────────────────────┐ │              │
│   │  │ Events from system:                    │ │              │
│   │  │  • voice_tremor_detected               │ │              │
│   │  │  • extended_silence                    │ │              │
│   │  │  • emotional_shift                     │ │              │
│   │  │  • tool_completed                      │ │              │
│   │  │  • time_of_day_changed                 │ │              │
│   │  └────────────────────────────────────────┘ │              │
│   │                                             │              │
│   │  ┌────────────────────────────────────────┐ │              │
│   │  │ Behavior commands TO LLM:              │ │              │
│   │  │  • shift_mode(presence)                │ │              │
│   │  │  • slow_pacing()                       │ │              │
│   │  │  • express(micro_expression)           │ │              │
│   │  │  • hold_space(duration)                │ │              │
│   │  └────────────────────────────────────────┘ │              │
│   └─────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## New Category: Behavior Functions

These functions don't DO actions in the world - they change HOW Ferni speaks.

### Add to `function-calling.md`:

```markdown
---

## Behavioral Shifts (Automatic & Manual)

These functions change HOW you speak, not what you do. The system may
call these automatically based on detected signals, OR you can call
them yourself when you sense something.

### `shiftMode` - Change your presence mode

The system detects emotional shifts and may inject this automatically:

\`\`\`json
{ "fn": "shiftMode", "args": { "mode": "deep_listening" } }
\`\`\`

- **mode**: 
  - `deep_listening` - Slow down, more pauses, fewer words
  - `presence` - Just be here, minimal speech
  - `energy_match` - Match user's energy level
  - `celebration` - Upbeat, excited
  - `processing` - Taking time to think (visible)
  - `holding_space` - After heavy content

### `adjustPacing` - Control your speech rhythm

\`\`\`json
{ "fn": "adjustPacing", "args": { "speed": "slower", "pauses": "longer" } }
\`\`\`

- **speed**: `slower` | `normal` | `faster`
- **pauses**: `shorter` | `normal` | `longer`

### `expressPresence` - Show you're here without words

\`\`\`json
{ "fn": "expressPresence", "args": { "type": "nod", "intensity": "subtle" } }
\`\`\`

- **type**: `nod` | `breath` | `hum` | `silence`
- **intensity**: `subtle` | `visible`

### `holdSpace` - Intentional silence

\`\`\`json
{ "fn": "holdSpace", "args": { "duration": "medium", "reason": "letting that land" } }
\`\`\`

- **duration**: `brief` | `medium` | `extended`
- **reason**: Why (helps frontend show appropriate avatar state)
```

---

## System-Initiated Events (NEW!)

The system can now PUSH events to the LLM that trigger behaviors.

### Event Protocol

When the system detects something, it injects an event as a special message:

```json
[SYSTEM_EVENT]
{"event":"emotional_shift","data":{"from":"neutral","to":"distressed","confidence":0.85}}
```

### Events the System Can Send

| Event | When Triggered | Expected Response |
|-------|----------------|-------------------|
| `voice_tremor_detected` | Audio prosody analysis detects shakiness | Slow down, offer comfort |
| `extended_silence` | User quiet > 10 seconds | Check in warmly or hold space |
| `emotional_shift` | Detected emotion change | Match energy, acknowledge |
| `tool_completed` | A tool finished executing | Speak naturally about result |
| `user_interrupted` | User cut off Ferni | Yield, acknowledge |
| `late_night_detected` | Time crosses 11pm | Shift to softer, slower |
| `energy_drop` | Voice energy decreased | Concern, gentle check-in |
| `breakthrough_moment` | User had a realization | Celebrate, let it land |
| `vulnerability_shared` | User shared something deep | Honor it, slow down |

### Implementation: Event Dispatcher

```typescript
// src/agents/events/behavior-event-dispatcher.ts

export interface BehaviorEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
  suggestedResponse?: {
    mode?: string;
    pacing?: string;
    expression?: string;
  };
}

export function dispatchBehaviorEvent(
  turnCtx: llm.ChatContext,
  event: BehaviorEvent
): void {
  // Format as special message the LLM recognizes
  const eventMessage = `[SYSTEM_EVENT]\n${JSON.stringify(event)}`;
  
  turnCtx.addMessage({
    role: 'system',
    content: eventMessage,
  });
}

// Example usage in turn processor:
if (voiceAnalysis.tremorDetected) {
  dispatchBehaviorEvent(turnCtx, {
    event: 'voice_tremor_detected',
    data: {
      intensity: voiceAnalysis.tremorIntensity,
      duration: voiceAnalysis.tremorDuration,
    },
    timestamp: Date.now(),
    suggestedResponse: {
      mode: 'presence',
      pacing: 'slower',
    }
  });
}
```

---

## The Dynamic Loop

### Step-by-Step Flow

```
1. User speaks: "My dad died last week"
   
2. System detects:
   - Heavy topic (topic analysis)
   - Slow speech pace (prosody)
   - Voice tremor (audio analysis)
   
3. System dispatches events:
   [SYSTEM_EVENT] {"event":"vulnerability_shared","data":{"topic":"loss","weight":"heavy"}}
   [SYSTEM_EVENT] {"event":"voice_tremor_detected","data":{"intensity":0.7}}
   
4. LLM (Ferni) receives events + user message together
   
5. Ferni can now:
   a) Respond to the events by calling behavior functions:
      {"fn":"shiftMode","args":{"mode":"presence"}}
      {"fn":"holdSpace","args":{"duration":"medium","reason":"honoring loss"}}
   
   b) OR respond naturally (events inform but don't require action)
   
6. Frontend receives behavior signals:
   - Avatar shifts to "holding space" expression
   - Waveform slows and softens
   
7. Ferni speaks (or holds silence) appropriately

8. LOOP CONTINUES:
   - Ferni's response analyzed
   - New events generated if needed
   - Behaviors adapt in real-time
```

### Code Integration Point

In `turn-handler.ts`, after analysis:

```typescript
// After emotional analysis
if (emotionalState.primary === 'distressed' && emotionalState.intensity > 0.7) {
  dispatchBehaviorEvent(turnCtx, {
    event: 'emotional_shift',
    data: {
      from: previousState.primary,
      to: emotionalState.primary,
      intensity: emotionalState.intensity,
    },
    suggestedResponse: {
      mode: 'presence',
      pacing: 'slower',
    }
  });
}

// After silence detection
if (silenceDuration > 10000) {
  dispatchBehaviorEvent(turnCtx, {
    event: 'extended_silence',
    data: {
      duration: silenceDuration,
      context: emotionalState.primary === 'heavy' ? 'processing' : 'disengaged',
    },
    suggestedResponse: silenceDuration > 20000 
      ? { expression: 'warm_checkin' }
      : { mode: 'holding_space' }
  });
}
```

---

## Connecting to Processing Intelligence

This system ties directly into the **Processing Intelligence Consolidation**:

### Before (Scattered)

```
meaningful-silence.ts    →  Random "thinking" phrase
persona-phrases.ts       →  Random "thinking" phrase  
natural-tool-calling.ts  →  Random "processing" phrase
```

### After (Unified + Event-Driven)

```
System Event: {"event":"tool_started","data":{"tool":"memory_recall"}}
       │
       ▼
Processing Intelligence: composeProcessingExpression({
  trigger: 'tool_call',
  emotionalWeight: ctx.emotionalWeight,
  relationshipStage: ctx.relationshipStage,
  ...
})
       │
       ▼
Context-aware response: "Hmm. <break time='200ms'/>" (trusted user, light context)
                   OR: "Let me think about that..." (new user, any context)
```

### New Tool: `processing` 

Ferni can explicitly call the processing system:

```json
{ "fn": "processing", "args": { "type": "emotional", "weight": "heavy" } }
```

This calls `composeProcessingExpression()` and:
1. Returns the appropriate phrase
2. Signals frontend to show "processing" avatar state
3. Adds appropriate SSML pauses

---

## Frontend Integration

The behavior system needs to signal the frontend for avatar/waveform updates.

### New Event Protocol to Frontend

```typescript
// In emotion-event-dispatcher.ts

export function emitBehaviorSignal(signal: BehaviorSignal): void {
  // Emit via existing humanization signal emitter
  humanizationSignalEmitter.behaviorShift({
    type: signal.type,
    mode: signal.mode,
    pacing: signal.pacing,
    duration: signal.duration,
  });
}

// Types
export interface BehaviorSignal {
  type: 'mode_shift' | 'pacing_change' | 'expression' | 'hold_space';
  mode?: 'presence' | 'deep_listening' | 'celebration' | 'processing';
  pacing?: 'slower' | 'normal' | 'faster';
  duration?: number;
}
```

### Frontend Handler

```typescript
// In better-than-human.ui.ts

document.addEventListener('ferni:behavior-shift', (e: CustomEvent<BehaviorSignal>) => {
  const { type, mode, pacing, duration } = e.detail;
  
  if (type === 'mode_shift') {
    switch (mode) {
      case 'presence':
        ferniAvatar.enterPresenceMode();
        waveform.slowDown(0.7);
        break;
      case 'deep_listening':
        ferniAvatar.showActiveListening();
        break;
      case 'processing':
        ferniAvatar.showThinking();
        break;
      case 'celebration':
        ferniAvatar.expressJoy();
        waveform.energize();
        break;
    }
  }
  
  if (type === 'hold_space') {
    ferniAvatar.holdingSpace(duration);
  }
});
```

---

## New Function Calling Section for `function-calling.md`

Add this entire section:

```markdown
---

## 🔄 Behavior System (NEW - Bidirectional)

### Understanding System Events

Sometimes I'll receive `[SYSTEM_EVENT]` messages. These tell me what's
happening that I might not have noticed:

- Voice tremor detected → User may be upset, slow down
- Extended silence → Check in or hold space
- Emotional shift → Acknowledge the change
- Energy drop → Be more gentle

I don't HAVE to act on every event, but I should be aware.

### Behavior Functions (Change HOW I speak)

#### `shiftMode` - Change presence mode

\`\`\`json
{ "fn": "shiftMode", "args": { "mode": "presence" } }
\`\`\`

Modes:
- `presence` - Just be here, minimal words
- `deep_listening` - Slow, receptive, few words  
- `processing` - Visibly thinking (shows in avatar)
- `celebration` - Upbeat energy
- `holding_space` - After something heavy landed

#### `processing` - Take visible thinking time

\`\`\`json
{ "fn": "processing", "args": { "type": "emotional", "weight": "heavy" } }
\`\`\`

Types: `thinking` | `emotional` | `tool_call`
Weight: `light` | `medium` | `heavy`

Returns appropriate pause/phrase for the context.

#### `holdSpace` - Intentional meaningful silence

\`\`\`json
{ "fn": "holdSpace", "args": { "duration": "medium", "reason": "letting that land" } }
\`\`\`

Duration: `brief` (3s) | `medium` (5s) | `extended` (8s)

#### `expressPresence` - Non-verbal presence

\`\`\`json
{ "fn": "expressPresence", "args": { "type": "breath" } }
\`\`\`

Types: `breath` | `hum` | `nod` | `sigh`

### When to Use Behavior Functions

| Situation | Function |
|-----------|----------|
| User shared something heavy | `shiftMode({mode:"holding_space"})` |
| Need to think about something | `processing({type:"thinking"})` |
| User seems overwhelmed | `shiftMode({mode:"presence"})` |
| Good news! | `shiftMode({mode:"celebration"})` |
| Let something land | `holdSpace({duration:"medium"})` |

### Responding to System Events

When I see `[SYSTEM_EVENT]`, I should:

1. **Acknowledge internally** - Understand what's happening
2. **Optionally call a behavior function** - If the moment calls for it
3. **Respond naturally** - The event informs but doesn't script me

Example:
```
[SYSTEM_EVENT]
{"event":"voice_tremor_detected","data":{"intensity":0.7}}

User: "I'm fine, really. Just tired."

My response:
{"fn":"shiftMode","args":{"mode":"presence"}}
{"fn":"processing","args":{"type":"emotional","weight":"medium"}}

Then speak: "I hear you saying you're fine... <pause> ...but I'm here if there's more."
```

---
```

---

## Implementation Plan

### Phase 1: Event Infrastructure (Week 1)

1. Create `src/agents/events/behavior-event-dispatcher.ts`
2. Define event types and protocol
3. Wire into `turn-handler.ts`

### Phase 2: Behavior Functions (Week 2)

1. Add `shiftMode`, `processing`, `holdSpace`, `expressPresence` to tool registry
2. Connect `processing` function to ProcessingIntelligence
3. Update `function-calling.md` with new section

### Phase 3: Frontend Integration (Week 3)

1. Add behavior signal handlers to `better-than-human.ui.ts`
2. Create avatar states for each mode
3. Wire waveform responses

### Phase 4: Refinement (Week 4)

1. Tune event thresholds
2. A/B test behavior responsiveness
3. Add more nuanced events

---

## Summary

| Current | Proposed |
|---------|----------|
| LLM calls functions → gets results | LLM calls functions → gets results |
| System injects context (passive) | **System dispatches events (active)** |
| Processing phrases scattered | **Processing via unified function** |
| No behavioral control | **Behavior functions change HOW Ferni speaks** |
| One-way communication | **True bidirectional loop** |

This creates the **dynamic loop** you're asking about:
- Code detects → dispatches event → LLM responds → calls behavior → frontend reacts → user responds → loop continues

The system becomes **alive**, not just responsive.

