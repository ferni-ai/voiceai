# Agent Handoff System Architecture

> A comprehensive guide to the multi-persona handoff system in VoiceAI

## Overview

The handoff system enables seamless transitions between AI personas (Ferni, Jack Bogle, Peter Lynch, Alex, Maya, Jordan) during voice conversations. It's designed to feel natural and human-like.

## System Components

### 1. Backend (Node.js/TypeScript)

```
src/
├── tools/handoff.ts         # Core handoff logic, triggers, LLM tools
├── agents/voice-agent.ts    # Main agent, handles voiceSwitch events
├── agents/handlers/handoff-handler.ts  # Orchestrates handoff flow
└── intelligence/context-builders/
    ├── handoff.ts           # Wake word detection, trigger mapping
    └── humanizing.ts        # Mood states, relationship context
```

### 2. Frontend (TypeScript)

```
apps/web/src/
├── services/
│   ├── handoff.service.ts   # Processes handoff events, rate limiting
│   ├── audio.service.ts     # Handoff sound effects
│   └── mood.service.ts      # Applies persona mood CSS
├── config/
│   ├── personas.ts          # Persona registry, ID mapping
│   └── index.ts             # HANDOFF_TIMING, SOUND_EFFECTS constants
├── types/
│   ├── events.ts            # HandoffEvent types, type guards
│   └── persona.ts           # PersonaId type, LEGACY_TO_CANONICAL_MAP
└── ui/
    ├── team.ui.ts           # Team roster, persona selection, ARIA
    └── thinking.ui.ts       # Apple-style thinking indicator
```

## ID Mapping Strategy

**CRITICAL**: Three ID formats exist and must be mapped correctly:

| Persona | Canonical ID | Frontend ID | Short/Alias |
|---------|--------------|-------------|-------------|
| Ferni (Coach) | `ferni` | `jack-b` | `coach`, `ferni` |
| Jack Bogle | `jack-bogle` | `jack-bogle` | `jack`, `bogle` |
| Peter Lynch | `peter-lynch` | `peter-lynch` | `peter`, `lynch` |
| Alex Chen | `alex-chen` | `comm-specialist` | `alex`, `comm` |
| Maya Santos | `maya-santos` | `spend-save` | `maya`, `spend` |
| Jordan Taylor | `jordan-taylor` | `event-planner` | `jordan`, `event` |
| Jaggi Vasudev | `jaggi-vasudev` | `jaggi-vasudev` | `jaggi`, `sage` |
| Joel Dickson | `joel-dickson` | `joel-dickson` | `joel`, `vanguard-expert` |

### Key Functions

- **Backend**: `toCanonicalId()`, `getFrontendPersonaId()` in `handoff.ts`
- **Frontend**: `normalizeAgentId()` in `personas.ts`

## Handoff Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        HANDOFF FLOW                              │
└─────────────────────────────────────────────────────────────────┘

1. TRIGGER DETECTION
   ├── User says "Hey Jack" or topic-based trigger
   ├── detectWakeWord() in context-builders/handoff.ts
   └── detectBestHandoff() in tools/handoff.ts

2. LLM TOOL CALL
   ├── LLM calls handoffToJack(), handoffToMaya(), etc.
   ├── Rate limiting check (1 second minimum)
   ├── Same-agent prevention
   └── Context capture (emotional state, topics)

3. BACKEND HANDOFF EVENTS
   ├── handoffEvents.emit('voiceSwitch', {...})
   ├── voice-agent.ts listener handles event
   └── handoff-handler.ts orchestrates flow

4. FRONTEND NOTIFICATIONS (via LiveKit Data Channel)
   ├── handoff_acknowledged → Request received (with seq number)
   ├── handoff_started → UI shows transition, plays sound
   ├── (wait for synchronized transition delay)
   ├── Voice switches on backend
   ├── handoff_complete → UI ready for new agent
   └── handoff_failed/cancelled → Recovery or user abort

5. UI UPDATES
   ├── Team roster highlights new agent
   ├── Avatar updates with new persona
   ├── Greeting spoken programmatically
   └── Mood state CSS applied
```

## Data Flow Diagram

```
┌─────────────┐    LiveKit     ┌─────────────┐
│   Backend   │ ═══════════════▶   Frontend  │
│             │    Data        │             │
│ voice-agent │    Channel     │ app.ts      │
└─────────────┘                └─────────────┘
      │                              │
      │ handoffEvents                │ onDataMessage
      ▼                              ▼
┌─────────────┐                ┌─────────────┐
│ handoff.ts  │                │ handoff     │
│ (tools)     │                │ .service.ts │
└─────────────┘                └─────────────┘
      │                              │
      │ voiceSwitch                  │ normalizeAgentId
      ▼                              ▼
┌─────────────┐                ┌─────────────┐
│ handoff-    │                │ personas.ts │
│ handler.ts  │                │ team.ui.ts  │
└─────────────┘                └─────────────┘
```

## Message Types

### Backend → Frontend

```typescript
// Handoff acknowledged (request received) - NEW
{
  type: 'handoff_acknowledged',
  target: string,        // Target persona ID
  success: boolean,      // Whether handoff can proceed
  error?: string,        // Reason if rejected
  sequenceNumber: number,// For event ordering
  timestamp: number
}

// Handoff started (begin transition animation)
{
  type: 'handoff_started',
  newAgent: string,      // Canonical ID
  previousAgent: string,
  direction: 'coach-to-team' | 'team-to-coach' | 'jack-to-peter' | 'peter-to-jack',
  playSound: string,
  sequenceNumber: number,
  timestamp: number
}

// Handoff complete (agent ready)
{
  type: 'handoff_complete',
  newAgent: string,
  previousAgent: string,
  greeting: string,      // Persona's entrance phrase
  sequenceNumber: number,
  timestamp: number
}

// Handoff failed (error recovery)
{
  type: 'handoff_failed',
  newAgent: string,
  previousAgent: string,
  error: string,
  sequenceNumber: number,
  timestamp: number
}

// Handoff cancelled (user aborted) - NEW
{
  type: 'handoff_cancelled',
  handoffId: string,
  reason?: string,
  sequenceNumber: number,
  timestamp: number
}

// State reset (on reconnection) - NEW
{
  type: 'state_reset',
  activePersona: string,
  timestamp: number
}

// Mood update (from humanizing system)
{
  type: 'mood',
  state: MoodState,      // energized, reflective, playful, etc.
  energyLevel: number,   // 0-1
  relationshipStage: string,
  hasTransition: boolean
}
```

## Natural Language Triggers

### Wake Words (Immediate Handoff)
- "Hey Ferni", "Hi Ferni", "Back to coach"
- "Hey Jack", "Hi Jack" (→ Jack Bogle)
- "Hey Peter", "Talk to Peter"

### Topic-Based (Suggested Handoff)
- "index funds", "passive investing" → Jack Bogle
- "stock research", "ten bagger" → Peter Lynch
- "email", "calendar", "schedule" → Alex
- "budget", "savings", "spending" → Maya
- "wedding", "first home", "vacation" → Jordan

## Context-Aware Features

### Emotion-Aware Transitions
```typescript
// Detects user emotion and acknowledges in intro
if (emotion.state === 'stressed') {
  intro = `I can tell you've got a lot on your mind. ${name} will help...`;
}
```

### Relationship-Aware Greetings
```typescript
// Different greeting for first meeting vs returning
if (hasMetPersona(personaId)) {
  greeting = "Back again! Let's dig into this.";
} else {
  greeting = getTheatricalEntrance(personaId);
}
```

### Graceful Failure Recovery
```typescript
// If handoff fails, continue with current persona
if (handoffFailed) {
  return {
    fallbackResponse: `${targetName} seems to be stepping away. I can help...`,
    shouldRetry: isRetryable
  };
}
```

## Rate Limiting

- **Minimum interval**: 1 second between handoffs
- **Debouncing**: Frontend debounces rapid handoff events
- **Same-agent prevention**: Can't handoff to current agent

## Testing

```bash
# Run handoff tests
cd apps/web
npm test -- --run tests/e2e/handoffs.test.ts

# All 38+ handoff-related tests should pass
```

## Common Issues & Solutions

### Issue: "Hey Jack" goes to wrong persona
**Solution**: Check `shouldHandoffToJackBogle()` runs before `shouldHandoffToFerni()` in `detectBestHandoff()`

### Issue: Button styles wrong on initial load
**Solution**: Ensure `data-persona="jack-b"` is set on `<body>` in index.html

### Issue: Thinking indicator causes layout shift
**Solution**: Use Apple-style integrated thinking (avatar glow + floating indicator)

### Issue: Frontend persona ID mismatch
**Solution**: Use `normalizeAgentId()` which maps canonical → frontend IDs

## Architecture Decisions

1. **Canonical IDs internally**: Backend uses consistent IDs (ferni, alex-chen)
2. **Frontend IDs for UI**: CSS selectors use frontend IDs (jack-b, comm-specialist)
3. **Programmatic greeting**: `session.say()` guarantees greeting is spoken
4. **Bundle runtime reload**: Persona-specific content reloads on handoff
5. **Mood states via CSS**: Visual atmosphere changes without layout shift

---

*Last updated: December 2024*

