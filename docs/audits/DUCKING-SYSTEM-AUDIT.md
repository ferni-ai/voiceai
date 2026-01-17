# 🎚️ Audio Ducking System - Full Architecture Audit

> **Status**: ✅ Working (with custom implementation)
> **Date**: January 2026
> **Why Custom**: LiveKit doesn't support native audio ducking - it just passes through raw WebRTC audio tracks

---

## Overview

**Ducking** = Automatically lowering music volume when someone speaks, then restoring it.

Ferni's ducking system is **entirely custom-built** because LiveKit only delivers raw audio tracks - it has no mixing or volume control capabilities.

### Why LiveKit Can't Duck

LiveKit audio tracks arrive as raw `HTMLAudioElement`s via WebRTC. Out of the box:

1. You can only control volume by setting `audioElement.volume` (which is instantaneous, not smooth)
2. There's no built-in awareness of "agent speaking" vs "music playing"
3. Multiple audio tracks play independently with no mixing

**Our solution**: Route music audio through the **Web Audio API** to get a `GainNode` for real-time volume control with smooth ramping.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    Commands    ┌──────────────────┐                       │
│  │ Voice Agent  │ ─────────────► │   DJController   │                       │
│  │ (speaking)   │                │  (state machine) │                       │
│  └──────────────┘                └────────┬─────────┘                       │
│                                           │                                 │
│    AGENT_SPEAKING_START ──────────────────┤                                 │
│    AGENT_SPEAKING_END   ──────────────────┤                                 │
│                                           ▼                                 │
│                           ┌───────────────────────────┐                     │
│                           │   music-handler.ts        │                     │
│                           │   (event wiring)          │                     │
│                           └───────────┬───────────────┘                     │
│                                       │                                     │
│                           ducking_started / ducking_ended                   │
│                                       │                                     │
│                                       ▼                                     │
│                           ┌───────────────────────────┐                     │
│                           │   FrontendPublisher       │                     │
│                           │   .sendMusicState()       │                     │
│                           └───────────┬───────────────┘                     │
│                                       │                                     │
└───────────────────────────────────────┼─────────────────────────────────────┘
                                        │
                    LiveKit Data Channel (reliable)
                    { type: 'music_state', state: 'ducking' }
                                        │
┌───────────────────────────────────────┼─────────────────────────────────────┐
│                              FRONTEND (Browser)                             │
├───────────────────────────────────────┼─────────────────────────────────────┤
│                                       ▼                                     │
│                           ┌───────────────────────────┐                     │
│                           │  data-message-handlers.ts │                     │
│                           │  handleMusic()            │                     │
│                           └───────────┬───────────────┘                     │
│                                       │                                     │
│              ┌────────────────────────┼────────────────────────┐            │
│              │                        │                        │            │
│              ▼                        ▼                        ▼            │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│   │ MusicStateManager│    │MusicAudioController   │ NowPlayingUI     │      │
│   │ (state tracking) │    │ (Web Audio ducking)│    │ (visual state)  │      │
│   └──────────────────┘    └─────────┬──────────┘    └──────────────────┘      │
│                                     │                                       │
│                         ┌───────────┴───────────────────────┐               │
│                         │          WEB AUDIO API            │               │
│                         │                                   │               │
│   HTMLAudioElement ──►  MediaElementSource                  │               │
│   (from LiveKit)              │                             │               │
│                               ▼                             │               │
│                         AnalyserNode (visualization)        │               │
│                               │                             │               │
│                               ▼                             │               │
│                         GainNode (volume control) ◄─────────┤               │
│                               │                    RAMP TO  │               │
│                               │                    0.12 for agent           │
│                               │                    0.20 for user            │
│                               │                    1.00 for normal          │
│                               ▼                             │               │
│                         AudioDestination (speakers)         │               │
│                         └───────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Backend: DJController (`src/audio/dj-controller.ts`)

**State Machine**:
```
idle ──► playing ──► ducking ──► playing
              │          │
              ▼          ▼
           fading ──► stopped ──► idle
```

**Ducking States**:
- `playing`: Music at full volume
- `ducking`: Music at reduced volume (someone speaking)

**Commands that trigger ducking**:
```typescript
type DJCommand =
  | { type: 'AGENT_SPEAKING_START' }
  | { type: 'AGENT_SPEAKING_END' }
  | { type: 'USER_SPEAKING_START' }
  | { type: 'USER_SPEAKING_END' }
  | { type: 'DUCK'; reason: DuckReason }
  | { type: 'UNDUCK' };
```

**Events emitted**:
```typescript
| { type: 'ducking_started'; reason: DuckReason }
| { type: 'ducking_ended' }
```

### 2. Backend: music-handler.ts (`src/agents/voice-agent/music-handler.ts`)

Wires DJController events to frontend messages:

```typescript
djController.on('ducking_started', (event) => {
  publisher.sendMusicState('ducking', track, isAmbient);
});

djController.on('ducking_ended', (event) => {
  publisher.sendMusicState('playing', track, isAmbient);
});
```

### 3. Frontend: MusicAudioController (`apps/web/src/services/music-audio.controller.ts`)

**The Core Ducking Implementation**

**Audio Chain**:
```
HTMLAudioElement → MediaElementSource → AnalyserNode → GainNode → Destination
```

**Gain Levels**:
```typescript
const GAIN = {
  NORMAL: 1.0,          // Full volume
  AGENT_SPEAKING: 0.12, // Very quiet for agent speech
  USER_SPEAKING: 0.2,   // Slightly louder for user speech
  MINIMUM: 0.05,        // Never fully silent
};
```

**Ramp Durations**:
```typescript
const RAMP = {
  DUCK_DOWN_MS: 150, // Fast duck (150ms)
  DUCK_UP_MS: 400,   // Slower restore (400ms)
};
```

**Priority System**:
```typescript
enum DuckPriority {
  NONE = 0,
  BACKEND_MESSAGE = 1, // Lowest
  USER_SPEAKING = 2,
  AGENT_SPEAKING = 3,  // Highest
}
```

**Key Methods**:
```typescript
// Attach track to Web Audio (called when music starts)
attachMusicTrack(audioElement, trackId): Promise<() => void>

// Ducking triggers
duckForAgent(): boolean    // Agent speaking (highest priority)
duckForUser(): boolean     // User speaking (VAD detected)
duckFromBackend(): boolean // Backend message (fallback)

// Unduck triggers
unduckForAgent(): boolean
unduckForUser(): boolean
unduckFromBackend(): boolean
```

**Fallback System**:
When Web Audio API fails (can't create MediaElementSource), falls back to direct `HTMLAudioElement.volume` control.

### 4. Frontend: MusicStateManager (`apps/web/src/services/music-state-manager.ts`)

Tracks overall music state and coordinates ducking:

```typescript
interface MusicState {
  state: MusicPlaybackState;
  currentTrack: MusicTrack | null;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
  isDucked: boolean;
  duckReason: 'agent_speaking' | 'user_speaking' | 'external' | null;
}
```

**Methods**:
```typescript
notifyAgentSpeakingStart()  // Called by speech-event-dispatcher
notifyAgentSpeakingEnd()
notifyUserSpeakingStart()
notifyUserSpeakingEnd()
```

### 5. Frontend: speech-event-dispatcher.ts

Triggers ducking based on speech events:

```typescript
function handleUserSpeechStart() {
  getMusicStateManager().notifyUserSpeakingStart();
}

function handleAgentSpeechStart() {
  getMusicStateManager().notifyAgentSpeakingStart();
}
```

---

## Data Flow: Agent Starts Speaking

1. **Backend**: Voice agent starts TTS output
2. **Backend**: DJController receives `AGENT_SPEAKING_START` command
3. **Backend**: DJController transitions `playing → ducking`, emits `ducking_started`
4. **Backend**: music-handler.ts catches event, calls `publisher.sendMusicState('ducking')`
5. **Frontend**: data-message-handlers.ts receives `music_state: 'ducking'`
6. **Frontend**: Calls `MusicAudioController.duckFromBackend()`
7. **Frontend**: GainNode.gain ramps from 1.0 → 0.12 over 150ms
8. **Result**: Music volume drops to 12%, agent voice clear

---

## Data Flow: Agent Stops Speaking

1. **Backend**: TTS output completes
2. **Backend**: DJController receives `AGENT_SPEAKING_END` command
3. **Backend**: DJController transitions `ducking → playing`, emits `ducking_ended`
4. **Backend**: music-handler.ts calls `publisher.sendMusicState('playing')`
5. **Frontend**: Receives `music_state: 'playing'`
6. **Frontend**: Calls `MusicAudioController.unduckFromBackend()`
7. **Frontend**: GainNode.gain ramps from 0.12 → 1.0 over 400ms
8. **Result**: Music volume smoothly restores to full

---

## Local Frontend Ducking (Instant)

The frontend also detects speech locally for **instant** ducking (without waiting for backend):

### User Speech (VAD)
```
LiveKit VAD → onTrackSubscribed → speech-event-dispatcher.handleUserSpeechStart()
                                        ↓
                              MusicStateManager.notifyUserSpeakingStart()
                                        ↓
                              MusicAudioController.duckForUser()
                                        ↓
                              GainNode → 0.2 (150ms ramp)
```

### Agent Speech (Audio Track)
```
LiveKit Agent Audio → onTrackSubscribed → speech-event-dispatcher.handleAgentSpeechStart()
                                                ↓
                                    MusicStateManager.notifyAgentSpeakingStart()
                                                ↓
                                    MusicAudioController.duckForAgent()
                                                ↓
                                    GainNode → 0.12 (150ms ramp)
```

---

## Critical Implementation Details

### 1. Web Audio "Already Connected" Error

`createMediaElementSource()` can only be called **once** per HTMLAudioElement. We track connected elements:

```typescript
private connectedElements: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();

// Check before creating
const existing = this.connectedElements.get(audioElement);
if (existing) {
  mediaSource = existing; // Reuse existing connection
} else {
  mediaSource = ctx.createMediaElementSource(audioElement);
  this.connectedElements.set(audioElement, mediaSource);
}
```

### 2. Track Re-attachment for Ducking

When `music_state: 'playing'` arrives, we re-attach the most recent music track:

```typescript
// data-message-handlers.ts
if (event.state === 'playing') {
  connectionService.reattachMusicTrackForDucking();
}
```

This handles cases where a system stinger was attached instead of real music.

### 3. Fallback Ducking (CSS Volume)

When Web Audio fails:

```typescript
private applyFallbackDuck(): void {
  if (!this.fallbackAudioElement) return;
  
  let targetVolume = this.agentSpeaking ? GAIN.AGENT_SPEAKING
                   : this.userSpeaking ? GAIN.USER_SPEAKING
                   : GAIN.NORMAL;
  
  this.fallbackAudioElement.volume = targetVolume;
}
```

No smooth ramping, but works.

### 4. Priority-Based Ducking

Multiple sources can trigger ducking. We use priorities:

```typescript
// Agent trumps user trumps backend
if (this.agentSpeaking) {
  targetGain = GAIN.AGENT_SPEAKING;
  priority = DuckPriority.AGENT_SPEAKING;
} else if (this.userSpeaking) {
  targetGain = GAIN.USER_SPEAKING;
  priority = DuckPriority.USER_SPEAKING;
} else if (this.backendDucking) {
  targetGain = GAIN.USER_SPEAKING;
  priority = DuckPriority.BACKEND_MESSAGE;
} else {
  targetGain = GAIN.NORMAL;
}
```

---

## Diagnostics

```typescript
// Get ducking state
controller.getDuckingDiagnostics()
// Returns:
{
  hasTrack: boolean;
  hasGainNode: boolean;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  backendDucking: boolean;
  currentGain: number;
  targetGain: number;
}
```

---

## Files Involved

### Backend
| File | Purpose |
|------|---------|
| `src/audio/dj-controller.ts` | State machine, ducking commands |
| `src/agents/voice-agent/music-handler.ts` | Wires events to frontend messages |
| `src/agents/realtime/frontend-publisher.ts` | Sends `music_state` messages |

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/src/services/music-audio.controller.ts` | **Core ducking via Web Audio** |
| `apps/web/src/services/music-state-manager.ts` | State tracking, coordinates ducking |
| `apps/web/src/services/speech-event-dispatcher.ts` | Triggers ducking from speech events |
| `apps/web/src/services/connection.service.ts` | Track attachment, music identification |
| `apps/web/src/app/data-message-handlers.ts` | Handles backend `music_state` messages |
| `apps/web/src/app.ts` | `onMusicTrack` callback for attachment |

---

## Known Issues & Edge Cases

### 1. Race Condition: Music arrives before data message
**Problem**: Audio track from LiveKit may arrive before `music_state: 'playing'` message.
**Solution**: Buffer pending tracks in `pendingMusicTracks` Map, re-attach when message arrives.

### 2. System Stingers
**Problem**: Sound effects (stingers) use same audio track mechanism.
**Solution**: `expectMusicTrack` flag distinguishes real music from stingers.

### 3. Multiple Tracks
**Problem**: Multiple audio elements could be playing.
**Solution**: `currentTrack` is singular; old track detached when new one attaches.

### 4. AudioContext Suspended
**Problem**: Browser may suspend AudioContext before user interaction.
**Solution**: `ensureContext()` calls `audioContext.resume()` on each operation.

---

## Testing Checklist

- [ ] Play music, agent speaks → music ducks to ~12%
- [ ] Agent stops speaking → music restores to 100%
- [ ] Play music, user speaks → music ducks to ~20%
- [ ] User stops speaking → music restores to 100%
- [ ] Both speaking → music stays at ~12% (agent priority)
- [ ] Agent stops but user still speaking → music at ~20%
- [ ] `getDuckingDiagnostics()` shows correct state
- [ ] Fallback works when Web Audio fails

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Why Custom** | LiveKit has no native ducking |
| **Implementation** | Web Audio API GainNode |
| **Fallback** | HTMLAudioElement.volume |
| **Triggers** | Agent speech, user speech (VAD), backend messages |
| **Priorities** | Agent (highest) > User > Backend |
| **Ramp Times** | Duck: 150ms, Restore: 400ms |
| **Gain Levels** | Normal: 1.0, Agent: 0.12, User: 0.2 |
