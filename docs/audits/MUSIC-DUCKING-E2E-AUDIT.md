# Music Ducking E2E Audit

> **Created**: January 2026  
> **Status**: 🟡 Architecture Limitation Documented  
> **Updated**: Added diagnostic tools and verified wiring is correct

## Executive Summary

Music ducking (lowering volume when agent speaks) has **two parallel paths** that can get out of sync:

| Path | Where | What Controls Audio |
|------|-------|---------------------|
| **Frontend-initiated** | LiveKit speech callbacks → `MusicAudioController` | ✅ Web Audio GainNode |
| **Backend-initiated** | DJController → `music_state: 'ducking'` message | ❌ State only, no audio |

**Critical Finding**: Backend ducking is **state-only**, not actual volume control. The backend explicitly documents:
> "LiveKit's BackgroundAudioPlayer does NOT support real-time volume changes"

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AgentSpeakingStart ──→ session-state-handler.ts                            │
│                              │                                               │
│                              ▼                                               │
│                     notifyAgentSpeakingStart()                               │
│                              │                                               │
│                              ▼                                               │
│                      DJController.dispatch({ type: 'AGENT_SPEAKING_START' })│
│                              │                                               │
│                              ▼                                               │
│                    State: playing → ducking                                  │
│                              │                                               │
│                              ├──→ MusicPlayer.duck() (STATE ONLY!)          │
│                              │         │                                     │
│                              │         └──→ Pauses ambient music OR         │
│                              │              notifies 'ducking' state         │
│                              │              (NO actual volume change!)       │
│                              │                                               │
│                              └──→ FrontendPublisher.sendMusicState('ducking')│
│                                        │                                     │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │ WebSocket data channel
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────┐      ┌────────────────────────────────────────┐│
│  │ PATH A: LiveKit Events  │      │ PATH B: Data Channel Messages         ││
│  │ (CONTROLS ACTUAL AUDIO) │      │ (VISUAL STATE ONLY)                   ││
│  └───────────┬─────────────┘      └──────────────┬─────────────────────────┘│
│              │                                    │                          │
│              ▼                                    ▼                          │
│  LiveKit agentStartedSpeaking      handleMusic(music_state: 'ducking')      │
│              │                                    │                          │
│              ▼                                    ▼                          │
│  getMusicAudioController()         MusicStateManager.handleStateChange()    │
│       .duckForAgent()                             │                          │
│              │                                    ▼                          │
│              ▼                         emit({ type: 'ducking_started' })    │
│  Web Audio GainNode.gain                          │                          │
│  linearRampToValueAtTime(0.04)                    ▼                          │
│              │                         NowPlayingUI.updateState('ducking')  │
│              ▼                                    │                          │
│  ✅ ACTUAL AUDIO DUCKED               ⚠️ VISUAL ONLY (opacity: 0.6)        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What Actually Works

### ✅ Frontend Ducking (Path A)

**Location**: `apps/web/src/app.ts` lines ~2978-3091

```typescript
// In setupLiveKitCallbacks:
onAgentStartedSpeaking: () => {
  getMusicAudioController().duckForAgent();  // ✅ Actually ducks audio
},
onAgentStoppedSpeaking: () => {
  getMusicAudioController().unduckForAgent();  // ✅ Actually restores audio
},
onUserSpeakingChange: (isActive) => {
  if (isActive) {
    controller.duckForUser();  // ✅ Actually ducks audio
  } else {
    controller.unduckForUser();  // ✅ Actually restores audio
  }
}
```

**Mechanism**: Web Audio API GainNode with smooth ramping
- Duck: 0.04 (4% volume) in 150ms
- Restore: 1.0 (100% volume) in 400ms
- Fallback: Direct `HTMLAudioElement.volume` if Web Audio fails

### ⚠️ Backend Ducking (Path B)

**Location**: `src/audio/music-player.ts` lines ~1927-1988

```typescript
// Backend duck() method:
duck(): void {
  if (!this.state.isDucked) {
    this.state.isDucked = true;
    
    if (this.state.isAmbientMode && this.state.isPlaying) {
      this.pause();  // Pauses ambient music entirely
    } else if (this.state.isPlaying) {
      this.notifyStateChange('ducking');  // Just notifies - NO volume change!
    }
  }
}
```

**The explicit limitation** (lines 29-41):
```typescript
/**
 * ⚠️ VOLUME LIMITATIONS (IMPORTANT):
 * LiveKit's BackgroundAudioPlayer does NOT support real-time volume changes.
 * Volume can only be set at play time - it cannot be changed during playback.
 *
 * This means:
 * - setVolume() only affects the NEXT track, not currently playing audio
 * - True audio ducking during playback is NOT possible
 */
```

---

## Identified Issues

### 🔴 Issue 1: Backend Ducking is Cosmetic Only

**Problem**: Backend sends `music_state: 'ducking'` but it doesn't actually change audio volume.

**Impact**: If frontend ducking fails (Path A), music will NOT duck.

**Root Cause**: LiveKit `BackgroundAudioPlayer` limitation - volume can only be set at play time.

### 🔴 Issue 2: Two Parallel Ducking Systems Can Desync

**Problem**: Frontend has its own ducking state (`MusicAudioController`) separate from backend (`DJController`).

**Scenario**:
1. Backend thinks music is ducked (state = 'ducking')
2. Frontend never received the LiveKit speech callback
3. Music plays at full volume despite "ducking" state

### 🔴 Issue 3: Web Audio Attachment Race Condition

**Problem**: Music track might start playing before `attachMusicTrack()` is called.

**Location**: `apps/web/src/services/connection.service.ts`

**Scenario**:
1. Backend starts music
2. Audio element created and playing
3. `music_state: 'playing'` arrives
4. Frontend tries to attach Web Audio
5. Agent starts speaking before attachment completes
6. `duckForAgent()` returns `false` - no track attached!

### 🟡 Issue 4: MusicStateManager Ducking Events Unused

**Problem**: `MusicStateManager` emits `ducking_started`/`ducking_ended` events but they're only used for visual updates, not actual audio control.

**Location**: `apps/web/src/services/music-state-manager.ts` lines 185-193

**Impact**: Backend ducking state is tracked but doesn't control audio.

---

## Verification Tests

### Test 1: Backend Ducking State Machine

```bash
pnpm vitest run src/tests/music-state-e2e.test.ts
pnpm vitest run src/audio/__tests__/dj-controller.test.ts
```

**What it tests**:
- DJController transitions to `ducking` state on `AGENT_SPEAKING_START`
- `ducking_started` event is emitted
- State returns to `playing` on `AGENT_SPEAKING_END`

### Test 2: Frontend Audio Ducking

```typescript
// In browser console:
window.__ferniMusicDebug = true;

// Play music, then check:
const controller = window.__ferniMusicAudioController;
controller.getDuckingDiagnostics();
// Expected: { hasTrack: true, hasGainNode: true, currentGain: 1.0 }

// Simulate agent speaking:
controller.duckForAgent();
controller.getDuckingDiagnostics();
// Expected: { agentSpeaking: true, currentGain: 0.04, targetGain: 0.04 }
```

### Test 3: E2E Flow

```bash
# Enable speech event logging in browser console:
window.__ferniSpeechEvents.enableLogging();

# Play music and speak - should see:
# ✅ ferni:agent-speech-start
# [MusicAudio] 🎚️ RAMPING GAIN from 1.0 to 0.04
# ✅ ferni:agent-speech-end
# [MusicAudio] 🎚️ RAMPING GAIN from 0.04 to 1.0
```

---

## Recommendations

### 1. Consolidate Ducking to Single Path

**Current**: Two parallel paths (frontend LiveKit + backend state)
**Recommended**: Frontend-only ducking (already the only path that works)

Remove backend ducking pretense:
```typescript
// music-player.ts - be honest about limitations
duck(): void {
  // Backend CANNOT duck audio during playback.
  // This only pauses ambient music or notifies frontend.
  // Real ducking happens via frontend Web Audio API.
}
```

### 2. Wire MusicStateManager to MusicAudioController

If backend `music_state: 'ducking'` is meant to trigger ducking, actually wire it:

```typescript
// In app.ts or data-message-handlers.ts
const stateManager = getMusicStateManager();
stateManager.subscribe((event) => {
  if (event.type === 'ducking_started') {
    getMusicAudioController().duckFromBackend();
  } else if (event.type === 'ducking_ended') {
    getMusicAudioController().unduckFromBackend();
  }
});
```

### 3. Add Ducking Diagnostics to Dev Panel

```typescript
// Add to dev-panel.ui.ts Music section
const diagnostics = getMusicAudioController().getDuckingDiagnostics();
// Show: hasTrack, hasGainNode, currentGain, targetGain, agentSpeaking
```

### 4. Fix Race Condition with Eager Attachment

```typescript
// In connection.service.ts
// Attach Web Audio as soon as audio element is created, not when music_state arrives
if (isLikelyMusicTrack) {
  getMusicAudioController().attachMusicTrack(audioElement, trackId);
}
```

---

## Diagnostic Tools Added

### Dev Panel Music Diagnostics

The dev panel now shows comprehensive ducking diagnostics:

1. **Backend Player** - Is the backend music player initialized
2. **Playing** - Is music currently playing
3. **Backend Vol** - Backend volume setting (state only)
4. **Frontend Ducking** - Real-time ducking status:
   - "Ready" - Track attached, no ducking
   - "🔉 Agent Ducking" - Agent is speaking
   - "🔉 User Ducking" - User is speaking
   - "🔉 Backend Ducking" - Backend requested duck
   - "⚠️ No Track" - No track attached (ducking won't work)
5. **Gain Level** - Current/target gain percentage
6. **Test Ducking** button - Manually test ducking

### Console Commands

```javascript
// Enable speech event logging
window.__ferniSpeechEvents.enableLogging();

// Get ducking diagnostics
window.__ferniMusicAudioController?.getDuckingDiagnostics();
```

---

## Files Involved

| File | Role |
|------|------|
| `src/audio/music-player.ts` | Backend music playback (NO real ducking) |
| `src/audio/dj-controller.ts` | Backend state machine |
| `src/agents/voice-agent/music-handler.ts` | Wires DJController to MusicPlayer |
| `src/agents/voice-agent/session-state-handler.ts` | Triggers ducking on speech |
| `apps/web/src/app.ts` | Frontend LiveKit callbacks → ducking |
| `apps/web/src/services/music-audio.controller.ts` | Actual Web Audio ducking |
| `apps/web/src/services/music-state-manager.ts` | Frontend state tracking |
| `apps/web/src/services/speech-event-dispatcher.ts` | Notifies MusicStateManager |

---

## Conclusion

**Does ducking work?** Partially.

- ✅ **Frontend LiveKit path** works when Web Audio is properly attached
- ❌ **Backend ducking** is state-only, no actual volume control
- ⚠️ **Race conditions** can prevent Web Audio attachment
- ⚠️ **Two parallel systems** can desync

**Is it really supported?** 

The backend explicitly documents that LiveKit `BackgroundAudioPlayer` does NOT support real-time volume changes. The entire backend ducking system is essentially cosmetic - it tracks state but cannot control audio volume during playback.

The **frontend Web Audio GainNode** is the only mechanism that actually ducks audio.
