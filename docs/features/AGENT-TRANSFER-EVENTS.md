# Agent Transfer Events - Complete Reference

This document lists all data channel events used in agent transfers (handoffs and cameos).

## Event Types

### Handoff Events

| Event                  | Direction          | Description                       |
| ---------------------- | ------------------ | --------------------------------- |
| `handoff_request`      | Frontend → Backend | User requested a handoff          |
| `handoff_acknowledged` | Backend → Frontend | Backend received the request      |
| `handoff_started`      | Backend → Frontend | Transition is beginning           |
| `soft_open_complete`   | Backend → Frontend | Departing persona finished banter |
| `handoff_complete`     | Backend → Frontend | New persona is ready              |
| `handoff_failed`       | Backend → Frontend | Handoff could not complete        |
| `handoff_cancelled`    | Backend → Frontend | Handoff was cancelled             |

### Cameo Events

| Event             | Direction          | Description                            |
| ----------------- | ------------------ | -------------------------------------- |
| `cameo_starting`  | Backend → Frontend | Cameo is about to begin (early signal) |
| `cameo_start`     | Backend → Frontend | Voice has switched, cameo is active    |
| `cameo_ending`    | Backend → Frontend | Cameo is wrapping up                   |
| `cameo_complete`  | Backend → Frontend | Cameo finished, back to host           |
| `cameo_cancelled` | Backend → Frontend | Cameo was cancelled                    |
| `cameo_failed`    | Backend → Frontend | Cameo could not complete               |

## Handoff Event Flow

### Successful Handoff

```
┌─────────────────┐                    ┌─────────────────┐
│    Frontend     │                    │     Backend     │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  handoff_request (target: peter)     │
         │─────────────────────────────────────>│
         │                                      │
         │  handoff_acknowledged (success: true)│
         │<─────────────────────────────────────│
         │                                      │
         │  handoff_started                     │
         │<─────────────────────────────────────│
         │                                      │
         │  [Ferni speaks soft open banter]     │
         │                                      │
         │  soft_open_complete                  │
         │<─────────────────────────────────────│
         │                                      │
         │  [Voice switches to Peter]           │
         │                                      │
         │  [Peter speaks greeting]             │
         │                                      │
         │  handoff_complete                    │
         │<─────────────────────────────────────│
         │                                      │
```

### Failed Handoff

```
┌─────────────────┐                    ┌─────────────────┐
│    Frontend     │                    │     Backend     │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  handoff_request                     │
         │─────────────────────────────────────>│
         │                                      │
         │  handoff_acknowledged (success: true)│
         │<─────────────────────────────────────│
         │                                      │
         │  handoff_started                     │
         │<─────────────────────────────────────│
         │                                      │
         │  [Error during voice switch]         │
         │                                      │
         │  handoff_failed (error: "...")       │
         │<─────────────────────────────────────│
         │                                      │
```

## Cameo Event Flow

### Successful Cameo

```
┌─────────────────┐                    ┌─────────────────┐
│    Frontend     │                    │     Backend     │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  [LLM decides to invoke cameo]       │
         │                                      │
         │  cameo_starting (personaId: alex)    │
         │<─────────────────────────────────────│
         │                                      │
         │  [Play arrival sound, prep UI]       │
         │                                      │
         │  cameo_start                         │
         │<─────────────────────────────────────│
         │                                      │
         │  [Alex avatar appears, speaks]       │
         │                                      │
         │  [Alex says handback phrase]         │
         │                                      │
         │  cameo_ending                        │
         │<─────────────────────────────────────│
         │                                      │
         │  [Play return sound, start exit]     │
         │                                      │
         │  cameo_complete                      │
         │<─────────────────────────────────────│
         │                                      │
         │  [Alex avatar exits, Ferni returns]  │
         │                                      │
```

## Event Payloads

### handoff_request

```typescript
interface HandoffRequest {
  type: 'handoff_request';
  target: PersonaId;
  timestamp: number;
  attempt?: number;
}
```

### handoff_acknowledged

```typescript
interface HandoffAcknowledged {
  type: 'handoff_acknowledged';
  target: PersonaId;
  success: boolean;
  error?: string;
}
```

### handoff_started

```typescript
interface HandoffStarted {
  type: 'handoff_started';
  newAgent: PersonaId;
  previousAgent?: PersonaId;
  greeting?: string;
  softOpenBanter?: string;
  isFirstMeeting?: boolean;
  handoffId?: string;
  seq?: number;
  timestamp: number;
}
```

### soft_open_complete

```typescript
interface SoftOpenComplete {
  type: 'soft_open_complete';
  newAgent: PersonaId;
  previousAgent: PersonaId;
  timestamp: number;
}
```

### handoff_complete

```typescript
interface HandoffComplete {
  type: 'handoff_complete';
  newAgent: PersonaId;
  previousAgent?: PersonaId;
  greeting?: string;
  timestamp: number;
}
```

### handoff_failed

```typescript
interface HandoffFailed {
  type: 'handoff_failed';
  newAgent: PersonaId;
  error: string;
  timestamp: number;
}
```

### cameo_starting

```typescript
interface CameoStarting {
  type: 'cameo_starting';
  personaId: PersonaId;
  personaName: string;
  personaColor: string;
  isFirstCameo?: boolean;
  cameoId?: string;
}
```

### cameo_start

```typescript
interface CameoStart {
  type: 'cameo_start';
  personaId: PersonaId;
  personaName: string;
  personaColor: string;
  greeting?: string;
  voiceId?: string;
  cameoId?: string;
}
```

### cameo_ending

```typescript
interface CameoEnding {
  type: 'cameo_ending';
  personaId: PersonaId;
  personaName: string;
  personaColor: string;
  cameoId?: string;
  duration?: number;
}
```

### cameo_complete

```typescript
interface CameoComplete {
  type: 'cameo_complete';
  personaId: PersonaId;
  personaName: string;
  personaColor: string;
  cameoId?: string;
}
```

## Frontend Service Callbacks

### HandoffService

```typescript
// When handoff begins
handoffService.onStart((toPersona, fromPersona, banter?) => void);

// When soft open banter completes (visual transition time)
handoffService.onSoftOpenComplete((toPersona, fromPersona) => void);

// When handoff is fully complete
handoffService.onComplete((toPersona) => void);

// When handoff fails
handoffService.onFailed((error, targetPersona) => void);

// When handoff is cancelled
handoffService.onCancelled((targetPersona, reason?) => void);

// When request is acknowledged
handoffService.onAcknowledged((target, success, error?) => void);

// When rate limited
handoffService.onRateLimited((remainingMs) => void);
```

### CameoService

```typescript
// When cameo begins
cameoService.onCameoStart((personaId, personaName, isFirstCameo) => void);

// When cameo ends
cameoService.onCameoEnd((personaId, duration?) => void);

// When cameo fails
cameoService.onCameoFailed((personaId, error) => void);
```

## Timing Constants

From `config/handoff-timing.ts`:

| Constant             | Value  | Description                            |
| -------------------- | ------ | -------------------------------------- |
| `DEBOUNCE_MS`        | 800ms  | Minimum time between handoff requests  |
| `FIRST_MEETING`      | 400ms  | Extra time for first-meeting greetings |
| `RETURN_TO_COACH`    | 300ms  | Time when returning to Ferni           |
| `MAX_FEEDBACK_DELAY` | 3000ms | Max time for visual feedback           |

From `config/cameo-config.ts`:

| Constant       | Value   | Description                        |
| -------------- | ------- | ---------------------------------- |
| `ENTRY_DELAY`  | 200ms   | Delay before cameo entry animation |
| `RETURN_DELAY` | 300ms   | Delay before voice returns to host |
| `MAX_DURATION` | 60000ms | Maximum cameo duration             |

## Error Codes

| Code                    | Description                        |
| ----------------------- | ---------------------------------- |
| `RATE_LIMITED`          | Too many requests in time window   |
| `INVALID_TARGET`        | Unknown persona ID                 |
| `ALREADY_TRANSITIONING` | Handoff already in progress        |
| `CAMEO_IN_PROGRESS`     | Cannot handoff during active cameo |
| `CONNECTION_LOST`       | Data channel disconnected          |
| `VOICE_SWITCH_FAILED`   | Voice manager error                |
| `TIMEOUT`               | Handoff took too long              |

---

_Last updated: December 14, 2025_
