# Realtime Event Dispatchers

> **Bridge between voice agent and frontend for real-time UI updates.**

This module contains event dispatchers that publish state changes to the frontend via WebSocket/DataChannel. These enable the "Better Than Human" emotional intelligence features in the UI.

---

## Architecture Overview

```
Voice Agent (Backend)                    Frontend (Browser)
─────────────────────                    ─────────────────────
turn-handler.ts                          better-than-human.ui.ts
     │                                        ▲
     ▼                                        │
emotion-event-dispatcher.ts ──────────────────┘
behavior-event-dispatcher.ts                  │
speech-state-dispatcher.ts ───────────────────┘
frontend-publisher.ts ────────────────────────┘
```

---

## Event Dispatchers

| Dispatcher | File | Events Published |
|------------|------|------------------|
| **Emotion** | `emotion-event-dispatcher.ts` | `humanization_signal`, mood changes |
| **Behavior** | `behavior-event-dispatcher.ts` | Persona behaviors, quirks |
| **Speech State** | `speech-state-dispatcher.ts` | Speaking, listening, thinking |
| **Frontend Publisher** | `frontend-publisher.ts` | All state → frontend channel |

---

## Event Types

### Humanization Signals (`humanization_signal`)

```typescript
interface HumanizationSignal {
  type: 'humanization_signal';
  signalType:
    | 'concern_detected'      // User seems worried
    | 'voice_state_detected'  // Tone change detected
    | 'emotional_trajectory'  // Mood trending up/down
    | 'micro_expression';     // Trigger avatar micro-expression
  payload: {
    intensity: number;        // 0-1
    expression?: string;      // For micro_expression
    trajectory?: 'improving' | 'declining' | 'stable';
  };
}
```

### Speech State Events

```typescript
interface SpeechStateEvent {
  type: 'speech_state';
  state: 'speaking' | 'listening' | 'thinking' | 'idle';
  energy?: number;            // Voice energy level
  confidence?: number;        // Speech recognition confidence
}
```

### Behavior Events

```typescript
interface BehaviorEvent {
  type: 'behavior';
  behaviorType: 'quirk' | 'easter_egg' | 'ritual';
  content: string;
  personaId: string;
}
```

---

## Integration with Frontend

The `frontend-publisher.ts` handles the actual publishing:

```typescript
import { publishToFrontend } from './frontend-publisher.js';

// From any dispatcher
publishToFrontend(sessionId, {
  type: 'humanization_signal',
  signalType: 'concern_detected',
  payload: { intensity: 0.8 },
});
```

Frontend receives via LiveKit DataChannel:

```typescript
// In apps/web/src/ui/better-than-human.ui.ts
room.on('dataReceived', (payload) => {
  const event = JSON.parse(payload);
  if (event.type === 'humanization_signal') {
    handleBetterThanHumanSignal(event);
  }
});
```

---

## Emotion Event Dispatcher

The main dispatcher for emotional intelligence:

```typescript
import { dispatchEmotionEvent } from './emotion-event-dispatcher.js';

// Dispatch concern detection
await dispatchEmotionEvent(sessionId, {
  type: 'concern_detected',
  intensity: 0.7,
  source: 'voice_strain',
});

// Dispatch emotional trajectory
await dispatchEmotionEvent(sessionId, {
  type: 'emotional_trajectory',
  trajectory: 'improving',
  delta: 0.2,
});
```

---

## When Events Fire

| Trigger | Dispatcher | Event |
|---------|------------|-------|
| User sounds worried | Emotion | `concern_detected` |
| Mood changes detected | Emotion | `emotional_trajectory` |
| User voice strain | Emotion | `voice_state_detected` |
| Persona quirk triggered | Behavior | `quirk` |
| Speech recognition starts | Speech State | `listening` |
| TTS starts playing | Speech State | `speaking` |
| Processing user input | Speech State | `thinking` |

---

## Rules

### Do
- Keep events lightweight (minimal payload)
- Use appropriate dispatcher for event type
- Debounce rapid state changes
- Include sessionId for routing

### Don't
- Send raw audio data through events
- Create new event types without frontend handler
- Block on event dispatch (fire and forget)
- Send PII in event payloads

---

## Testing

```bash
# Run dispatcher tests
pnpm vitest run src/agents/realtime/__tests__/

# Integration test with frontend
# (Requires running frontend dev server)
```

---

## Related Documentation

- `../CLAUDE.md` - Voice agent overview
- `apps/web/src/ui/better-than-human.ui.ts` - Frontend handlers
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - EQ philosophy

---

*Last updated: January 2026*
