# Music & DJ System Audit

**Date:** December 9, 2025  
**Status:** Issues Identified & Fixed

---

## Executive Summary

Audit of the music playback and DJ capabilities across the Ferni platform. Identified and fixed a race condition in the "Now Playing" card that could cause it to remain visible after music stops.

---

## Architecture Overview

### Backend Components

| Component               | Location        | Purpose                                         |
| ----------------------- | --------------- | ----------------------------------------------- |
| `music-player.ts`       | `src/audio/`    | Core playback via LiveKit BackgroundAudioPlayer |
| `dj-booth.ts`           | `src/audio/`    | DJ orchestration (ducking, crossfade, moments)  |
| `dj-enhancements.ts`    | `src/audio/`    | Emotional offers, thinking music, session flow  |
| `dj-session.service.ts` | `src/services/` | Session-level DJ state management               |
| `dj-orchestrator.ts`    | `src/services/` | High-level DJ coordination                      |
| `dj-service.ts`         | `src/services/` | DJ commentary and read-the-room logic           |

### Frontend Components

| Component                   | Location                            | Purpose                        |
| --------------------------- | ----------------------------------- | ------------------------------ |
| `now-playing.ui.ts`         | `frontend-typescript/src/ui/`       | Floating card with track info  |
| `music-audio.controller.ts` | `frontend-typescript/src/services/` | Web Audio API ducking          |
| `music-dashboard.ui.ts`     | `frontend-typescript/src/ui/`       | Music insights/stats dashboard |
| `toast.ui.ts`               | `frontend-typescript/src/ui/`       | General toast notifications    |
| `spotify.service.ts`        | `frontend-typescript/src/services/` | Spotify Web Playback SDK       |
| `spotify.ui.ts`             | `frontend-typescript/src/ui/`       | Spotify connection UI          |

### Message Flow

```
Backend Music Player
        │
        ▼
┌─────────────────────┐
│ onMusicStateChange  │  Callback registered in voice-agent.ts
│ callback            │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ frontend-publisher  │  sendMusicState()
│ .ts                 │
└─────────────────────┘
        │
        ▼ (LiveKit Data Channel)
┌─────────────────────┐
│ data-message-       │  handleMusic()
│ handlers.ts         │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ now-playing.ui.ts   │  show() / hide() / updateState()
└─────────────────────┘
```

---

## Issues Identified

### 1. ✅ FIXED: Now Playing Card Race Condition

**Problem:** The Now Playing card could remain visible indefinitely if:

- Backend never sends 'stopped' state (crash, disconnect, etc.)
- Hide animation interrupted by new show() call
- State transitions happening faster than animation duration

**Root Cause:** No fallback mechanism to auto-hide the card after the expected track duration.

**Fix Applied:**

1. Added safety timer that auto-hides card after `track.duration + 5s`
2. Cancel pending hide operations when show() is called
3. Track and manage all timeouts properly
4. Clear safety timer on pause (intentional pause)
5. Reset safety timer when playback resumes

**Files Modified:**

- `frontend-typescript/src/ui/now-playing.ui.ts`

---

### 2. ⚠️ POTENTIAL: Backend Not Sending 'stopped'

**Scenario:** If the backend music player crashes or the connection drops, the 'stopped' message may never reach the frontend.

**Mitigation:** The safety timer fix above handles this. If no state update is received for `duration + 5s`, the card auto-hides.

**Files to Monitor:**

- `src/audio/music-player.ts` - `onTrackEnded()` method
- `src/agents/voice-agent.ts` - Music state callback registration

---

### 3. ℹ️ INFO: Multiple Music Sources

The system has two independent music playback paths:

1. **Backend Music Player** (iTunes/Spotify search via agent)
   - Shows Now Playing card via `music_state` data message
   - Controlled by `music-player.ts`

2. **Spotify Web Playback SDK** (direct Spotify control)
   - Shows whisper toast via `messageUI.show()`
   - Controlled by `spotify.service.ts`

These are correctly independent but may cause confusion if both are active.

---

## Music State Flow

### States

| State      | Description               | UI Behavior                   |
| ---------- | ------------------------- | ----------------------------- |
| `playing`  | Music actively playing    | Full waveform animation       |
| `ducking`  | Agent speaking over music | Subdued waveform, 70% opacity |
| `fading`   | Track ending (~5s left)   | Pulse animation               |
| `changing` | DJ crossfade in progress  | Transition animation          |
| `paused`   | Playback paused           | Static waveform               |
| `stopped`  | Playback stopped          | Hide card                     |
| `idle`     | No music loaded           | Hide card                     |

### Typical Flow

```
idle → playing → ducking → playing → fading → stopped → idle
```

### Crossfade Flow

```
playing → changing → playing (new track)
```

---

## FFmpeg Audio Fade-Out ✅ IMPLEMENTED

The DJ-style audio fade-out uses ffmpeg to create professional radio-quality endings.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AUDIO FADE-OUT FLOW                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Track Downloaded          2. FFmpeg Applied         3. Faded File Plays │
│  ┌─────────────────┐         ┌─────────────────┐        ┌─────────────────┐ │
│  │ song_raw.mp3    │ ──────▶ │ afade=out:st=25 │ ────▶  │ song_faded.mp3  │ │
│  │ (30 seconds)    │         │ :d=5            │        │ (fade @ 25-30s) │ │
│  └─────────────────┘         └─────────────────┘        └─────────────────┘ │
│                                                                             │
│  4. State Timer Fires (@ 25s)     5. Voice Agent Speaks Outro               │
│  ┌─────────────────────────┐      ┌─────────────────────────────────────┐   │
│  │ notifyStateChange       │ ───▶ │ "That was nice. How are you        │   │
│  │   ('fading')            │      │  feeling?"                         │   │
│  └─────────────────────────┘      └─────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Details

| Step                       | Location                  | Code                                                          |
| -------------------------- | ------------------------- | ------------------------------------------------------------- |
| 1. Check ffmpeg available  | `music-player.ts:227`     | `this.ffmpegAvailable = await this.checkFfmpegAvailability()` |
| 2. Download audio          | `music-player.ts:746-787` | `downloadAudio()` - fetches raw MP3                           |
| 3. Apply fade              | `music-player.ts:773`     | `applyAudioFadeOut(rawFilepath, durationMs)`                  |
| 4. FFmpeg command          | `music-player.ts:815`     | `ffmpeg -af "afade=t=out:st=${start}:d=5"`                    |
| 5. Schedule 'fading' state | `music-player.ts:518`     | `setTimeout(() => notifyStateChange('fading'), fadeOutTime)`  |
| 6. Voice agent handles     | `voice-agent.ts:3278`     | `if (state === 'fading' && !isAmbient && track)`              |

### FFmpeg Availability

**Docker Agent Image**: ✅ ffmpeg IS installed

```dockerfile
# docker/Dockerfile.agent:44-49
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

**Local Development**: Depends on system. Check with:

```bash
ffmpeg -version
```

If missing, the system gracefully degrades:

```typescript
// music-player.ts:849
'🎧 ffmpeg not available - DJ fade-out will be skipped (audio will end abruptly)';
```

### Fade Parameters

| Parameter           | Value           | Description                             |
| ------------------- | --------------- | --------------------------------------- |
| Fade duration       | 5 seconds       | How long the fade lasts                 |
| Fade start          | `duration - 5s` | When fade begins (minimum 0s)           |
| Fade type           | `out`           | Volume decreases to 0                   |
| State notification  | `duration - 5s` | When 'fading' state fires               |
| Minimum fadeOutTime | 10 seconds      | Prevents premature fade on short tracks |

### E2E Flow Verification

To verify the e2e flow is working:

1. **Check logs for ffmpeg availability**:

   ```
   🎧 Music player initialized with BackgroundAudioPlayer { ffmpegAvailable: true }
   ```

2. **Check logs for fade application**:

   ```
   🎧 Applying DJ fade-out { fadeOutStart: 25, fadeOutDuration: 5 }
   🎧 DJ fade-out applied successfully
   ```

3. **Check logs for state transition**:
   ```
   🎧 DJ fade-out starting... { track: "Song Name" }
   Music state changed { state: 'fading', previousState: 'playing' }
   🎧 DJ outro - speaking over fading music { track: "Song Name" }
   ```

### Potential Issues

| Issue                | Symptom                          | Status/Fix                                  |
| -------------------- | -------------------------------- | ------------------------------------------- |
| ffmpeg not installed | `ffmpegAvailable: false` in logs | Install ffmpeg on host                      |
| Track too short      | Fade never triggers              | ✅ FIXED: Now uses 70% of duration for <15s |
| Outro not spoken     | No log for `DJ outro`            | Check `isAmbient` flag or `isDucked` state  |
| Audio ends abruptly  | No fade heard                    | Verify ffmpeg command runs                  |
| Duration is 0        | Wrong fade timing                | ✅ FIXED: Uses `??` instead of `\|\|`       |

---

## DJ Booth Features

### Phase 1: Core DJ Functionality

- Talk-over: Agent speaks while music ducks
- Fade-out: Smooth 5-second fade at track end
- DJ outro phrases before track ends

### Phase 2-8: DJ Enhancements

- **Thinking Music:** Ambient music during processing
- **Emotion Offers:** Mood-based music suggestions
- **Session Flow:** Track topics, emotions, handoffs
- **Music Callbacks:** "We played jazz earlier..."
- **Our Songs:** Shared musical memories with users

### DJ Moments Scheduled

| Moment Type  | Timing           | Probability |
| ------------ | ---------------- | ----------- |
| Buildup      | 55-70% through   | 30%         |
| Drop         | 3s after buildup | 20%         |
| Appreciation | 15-25s in        | 30%         |
| Check-in     | 60s+ tracks      | 100%        |
| Outro        | 5s before end    | 100%        |

---

## DJ Intro & Outro System ✅ WORKING

The DJ intro and outro system creates a professional radio/DJ experience.

### DJ Intro (Track Start)

**When a track starts playing**, the agent announces it with personality:

| Scenario                     | Function                              | Location                 |
| ---------------------------- | ------------------------------------- | ------------------------ |
| Fresh start                  | `getPlayfulMusicIntro()` + track info | `src/tools/music.ts:320` |
| Crossfade (switching tracks) | `getDJDropPhrase()`                   | `src/tools/music.ts:291` |
| Genre-specific               | `getGenreReaction()`                  | `src/tools/music.ts:317` |
| Air DJ moment (rare, 8%)     | `getAirDJMoment()`                    | `src/tools/music.ts:313` |
| Fun DJ moment (rare, 10%)    | `getFunDJMoment()`                    | `src/tools/music.ts:302` |

**Example intro responses:**

```
"Here's "Bohemian Rhapsody" by Queen!"
"Ooh, great choice! Here's "Billie Jean" by Michael Jackson!"
"Coming right up! "Sweet Child O' Mine" by Guns N' Roses!"
```

**Persona-specific intros** in `src/audio/dj-enhancements.ts:274`:

- **Ferni:** "Let me find something perfect...", "Here's some music to brighten things up..."
- **Jack:** "Coming right up!", "Here's a good one!"
- **Peter:** "Got it. Here's what I found.", "Let me play that for you."

### DJ Outro (Track Ending)

**When a track is fading (~5s before end)**, the agent speaks over the fading music like a real DJ:

| Trigger           | Function             | Location                         |
| ----------------- | -------------------- | -------------------------------- |
| State: `'fading'` | `getDJOutroPhrase()` | `src/agents/voice-agent.ts:3281` |

**How it works:**

1. Backend `music-player.ts` detects track is ~5s from ending
2. State changes to `'fading'` via `notifyStateChange('fading')`
3. `voice-agent.ts` receives callback and calls `getDJOutroPhrase()`
4. Agent speaks the outro via `session.say()` WHILE music fades

**Example outro responses** (from `src/audio/ambient-music.ts:375`):

```
"That was nice. I love when we can just share a moment like that."
"Good music. How are you feeling?"
"Beautiful. Sometimes we just need a musical pause."
```

**With track callout (30% chance):**

```
"That was "Bohemian Rhapsody" by Queen. Good music. How are you feeling?"
```

### DJ Crossfade Transition

**When switching tracks** (user requests new music while one is playing):

| Trigger             | Function                   | Location                         |
| ------------------- | -------------------------- | -------------------------------- |
| State: `'changing'` | `getDJTrackChangePhrase()` | `src/agents/voice-agent.ts:3257` |

**Example transition phrases:**

```
"Sure! Let me change that."
"Coming right up."
"New music on the way."
```

### Verification

To verify DJ intro/outro is working:

1. **DJ Intro Test:**
   - Ask: "Play Bohemian Rhapsody"
   - Expected: Agent says something like "Here's Bohemian Rhapsody by Queen!"

2. **DJ Outro Test:**
   - Wait for track to reach last ~5 seconds
   - Expected: Agent speaks over fading music: "That was nice..."

3. **DJ Crossfade Test:**
   - While music is playing, ask: "Play a different song"
   - Expected: Agent says "Coming right up!" then plays new track

### Files Involved

| File                            | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `src/audio/ambient-music.ts`    | `getDJOutroPhrase()`, `getDJTrackChangePhrase()`, `getDJDropPhrase()` |
| `src/audio/dj-enhancements.ts`  | `getPersonaMusicIntro()`, persona-specific phrases                    |
| `src/speech/music-reactions.ts` | `getPlayfulMusicIntro()`, `getMusicReaction()`                        |
| `src/tools/music.ts`            | Builds intro response when music starts                               |
| `src/agents/voice-agent.ts`     | Handles `'fading'` and `'changing'` states                            |

---

## Testing Recommendations

### Manual Tests

1. **Play a track, wait for it to end**
   - ✓ Now Playing card should hide when track ends
   - ✓ Safety timer should not trigger (normal flow)

2. **Play a track, disconnect mid-playback**
   - ✓ Safety timer should auto-hide after duration + 5s

3. **Play a track, pause, wait**
   - ✓ Card should stay visible (paused state)
   - ✓ Safety timer should be cleared

4. **Play multiple tracks in queue**
   - ✓ Card should update for each track
   - ✓ Card should hide after last track ends

5. **DJ crossfade (play new track while one is playing)**
   - ✓ 'changing' state should show briefly
   - ✓ Card should update with new track info

### Automated Tests to Add

```typescript
// frontend-typescript/src/tests/now-playing.test.ts

describe('NowPlayingUI', () => {
  it('should hide after track ends', async () => {
    /* ... */
  });
  it('should auto-hide via safety timer if stopped never received', async () => {
    /* ... */
  });
  it('should not trigger safety timer during pause', async () => {
    /* ... */
  });
  it('should reset safety timer on resume', async () => {
    /* ... */
  });
  it('should handle rapid show/hide without race conditions', async () => {
    /* ... */
  });
});
```

---

## Performance Considerations

### Animation Timers

- Hide animation: `DURATION.NORMAL` (200ms)
- Safety timer: `duration + 5000ms` or default 45000ms
- Waveform animation: 50ms intervals

### Memory Management

All timers are properly cleared on:

- `hide()` - clears both safety and hide timeout
- `destroy()` - clears all intervals and timeouts
- HMR reload - cleans up orphaned elements

---

## Related Documentation

- `design-system/brand/BETTER-THAN-HUMAN.md` - Avatar emotion during music
- `docs/guides/RUNBOOK.md` - Deployment procedures
- `CLAUDE.md` - Code quality standards

---

## E2E Verification Checklist

Use this checklist to verify the full DJ experience is working:

### Audio Fade-Out (FFmpeg)

- [ ] `ffmpegAvailable: true` in music player init logs
- [ ] `🎧 Applying DJ fade-out` appears when track plays
- [ ] `🎧 DJ fade-out applied successfully` confirms processing
- [ ] Track audio actually fades (listen at end of song)

### DJ Outro (Agent Speech)

- [ ] `🎧 DJ fade-out starting...` appears ~5s before end
- [ ] `Music state changed { state: 'fading' }` in logs
- [ ] `🎧 DJ outro - speaking over fading music` confirms trigger
- [ ] Agent actually speaks over fading music

### DJ Intro (Track Start)

- [ ] Agent announces track when music starts
- [ ] Playful intro variations appear ("Here's...", "Coming up...")
- [ ] Persona-specific intros used (check persona ID)

### DJ Crossfade (Track Change)

- [ ] Request new song while one is playing
- [ ] `Music state changed { state: 'changing' }` in logs
- [ ] Agent speaks transition phrase
- [ ] Smooth crossfade heard (both tracks overlap briefly)

---

## Known Limitations (LiveKit)

These issues cannot be fixed due to LiveKit BackgroundAudioPlayer limitations:

| Issue                       | Limitation                   | Workaround                                    |
| --------------------------- | ---------------------------- | --------------------------------------------- |
| No real-time volume control | Volume set at play time only | Low default volume (25%), pause during speech |
| Ambient music pauses        | Can't duck, only pause       | Quick pause/resume feels natural              |
| No smooth crossfade audio   | Single track at a time       | 1.5s gap during transition + DJ phrase        |

---

## Changelog

### 2025-12-09 (Batch 2)

- **Fixed:** Duration `0` treated as falsy - changed `||` to `??` in:
  - `music-player.ts` (3 locations)
  - `dj-booth.ts` (1 location)
  - `dj-enhancements.ts` (2 locations)
- **Fixed:** Short track fade timing - now uses 70% of duration for tracks <15s
- **Fixed:** DJ outro fires even when ducked - added `!isDucked` check
- **Fixed:** Music track detection race - `expectMusicTrack()` called before async import

### 2025-12-09 (Batch 1)

- **Documented:** FFmpeg audio fade-out implementation and e2e flow
- **Documented:** DJ intro/outro system with all trigger locations
- **Fixed:** Race condition in Now Playing card that could leave it visible
- **Added:** Safety timer to auto-hide card after expected duration
- **Added:** Proper timeout management to prevent memory leaks
- **Added:** Comprehensive logging for debugging music state transitions
