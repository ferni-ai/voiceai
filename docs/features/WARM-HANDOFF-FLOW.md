# Warm Handoff Flow - Technical Documentation

This document describes the "warm handoff" flow between personas in Ferni, where the departing persona introduces the arriving persona with spoken banter before the voice switch.

## Overview

A **warm handoff** creates a more human, conversational experience by having personas acknowledge each other during transfers. Instead of an abrupt voice switch, the current persona introduces the next one.

## Event Sequence

```
User clicks team member → handoff_request
                              ↓
                        handoff_acknowledged (backend received)
                              ↓
                        handoff_started (transition begins)
                              ↓
                  [Departing persona speaks soft open banter]
                              ↓
                        soft_open_complete (banter finished)
                              ↓
                  [Voice switch occurs]
                              ↓
                  [Arriving persona speaks greeting]
                              ↓
                        handoff_complete (ready to interact)
```

## Data Messages

### handoff_request (Frontend → Backend)

```typescript
{
  type: 'handoff_request',
  target: PersonaId,    // e.g., 'peter-john'
  timestamp: number,
  attempt?: number      // Retry attempt number
}
```

### handoff_acknowledged (Backend → Frontend)

```typescript
{
  type: 'handoff_acknowledged',
  target: PersonaId,
  success: boolean,
  error?: string
}
```

### handoff_started (Backend → Frontend)

```typescript
{
  type: 'handoff_started',
  newAgent: PersonaId,
  previousAgent: PersonaId,
  greeting?: string,         // What arriving persona will say
  softOpenBanter?: string,   // What departing persona says
  handoffId?: string,
  seq?: number,
  timestamp: number
}
```

### soft_open_complete (Backend → Frontend)

```typescript
{
  type: 'soft_open_complete',
  newAgent: PersonaId,
  previousAgent: PersonaId,
  timestamp: number
}
```

### handoff_complete (Backend → Frontend)

```typescript
{
  type: 'handoff_complete',
  newAgent: PersonaId,
  previousAgent: PersonaId,
  greeting?: string,
  timestamp: number
}
```

## Frontend Handling

### HandoffService (handoff.service.ts)

The `HandoffService` manages all handoff state and coordinates UI updates:

1. **Rate Limiting**: 800ms debounce between requests
2. **State Tracking**: `isTransitioning`, `targetPersona`, `handoffPhase`
3. **Callbacks**: Registered listeners for each phase

```typescript
// Register phase callbacks
handoffService.onStart((toPersona, fromPersona, banter) => {
  // Show visual feedback, play sounds
});

handoffService.onSoftOpenComplete((toPersona, fromPersona) => {
  // Begin visual transition (avatar swap, roster animation)
});

handoffService.onComplete((toPersona) => {
  // End loading state, update UI
});
```

### Visual Transition Timing

The visual transition is synchronized with the voice:

1. **soft_open_complete** → Start avatar swap animation
2. **Wait for animation** → ~600ms
3. **handoff_complete** → End loading state

This ensures the visual change happens when the voice changes, not before.

## Backend Handling

### HandoffHandler (handoff-handler.ts)

The backend handler orchestrates the full handoff:

```typescript
// Simplified flow
async function handleHandoff() {
  // 1. Emit handoff_started
  await publishData({ type: 'handoff_started', ... });

  // 2. Speak soft open banter (in current voice)
  if (softOpenBanter) {
    session.say(softOpenBanter);
    await sleep(1500);
    // 3. Send soft_open_complete
    await publishData({ type: 'soft_open_complete', ... });
  }

  // 4. Switch voice
  voiceManager.switchVoice(newPersonaId);

  // 5. Update LLM instructions
  voiceAgent.setPersona(newPersona);

  // 6. Speak greeting (in new voice)
  session.say(greeting);

  // 7. Emit handoff_complete
  await publishData({ type: 'handoff_complete', ... });
}
```

## Banter Generation

Banter is generated using the team engagement service:

```typescript
// Get soft open banter (departing persona introduces arriving)
const softOpenBanter = await getHandoffBanter(fromPersona, toPersona, context);
// e.g., "You know what? Peter would be perfect for this. Let me get him."

// Get arriving banter (arriving persona's greeting)
const arrivingBanter = await getArrivingBanter(toPersona, context);
// e.g., "Hey there! Ferni said you wanted to talk about investing."
```

## Error Handling

### Timeout Protection

- Frontend timeout: 15 seconds
- Backend timeout: 30 seconds
- If timeout occurs, state is reset and `handoff_failed` is emitted

### Recovery

- If voice switch fails, retry up to 2 times
- If soft_open_complete is never received, fallback to direct transition
- If handoff_complete is never received, timeout triggers reset

## Race Condition Protection

### Phase Tracking

The frontend tracks the current phase to handle out-of-order messages:

```typescript
_handoffPhase: 'idle' | 'started' | 'complete' | 'failed';
```

### soft_open_complete Before handoff_started

If `soft_open_complete` arrives before `handoff_started` (race condition), it's queued and executed when `handoff_started` arrives.

## Mutex Protection

Handoffs and Cameos are mutually exclusive:

```typescript
// In handoffService.sendHandoffRequest()
if (cameoService.isInCameo()) {
  return false; // Block handoff during cameo
}

// In cameoService.handleCameoStarting()
if (handoffService.isTransitioning) {
  return; // Block cameo during handoff
}
```

## Testing

See `e2e/handoff-flow.test.ts` for integration tests covering:

- Happy path handoff
- Timeout handling
- Race conditions
- Cancellation
- Error recovery

---

_Last updated: December 14, 2025_
