# Music & DJ System E2E Integration Checklist

**Date:** December 11, 2025  
**Status:** Needs Validation

---

## Executive Summary

This checklist identifies everything that needs to be integrated, validated, implemented, or wired together for the Music & DJ system to work E2E.

---

## 🔴 Critical Issues to Fix

### 1. ✅ FIXED: Potential Double `createMediaElementSource` Call

**Problem:** `createMediaElementSource()` can only be called ONCE per HTMLAudioElement. If the same element is passed to multiple services, it throws.

**Files at risk:**

- `audio.service.ts:310` - For voice visualization (VOICE tracks only)
- `voice-analyzer.service.ts:168` - For voice analysis (VOICE tracks only)
- `music-audio.controller.ts:183` - For music ducking (MUSIC tracks only)

**Fix applied (2025-12-11):**

- [x] Added `connectedElements` WeakMap to track connected audio elements
- [x] `attachMusicTrack()` now reuses existing MediaElementSourceNode if available
- [x] Added retry logic (up to 2 retries) for transient failures
- [x] Returns no-op cleanup instead of throwing on failure (graceful degradation)
- [x] Clear error logging when ducking attachment fails

### 2. ✅ FIXED: Music Track Identification Race Condition

**Problem:** Audio track might arrive BEFORE the `music_state: 'playing'` data message.

**Previous flow (broken):**

```
Backend: play() → sendMusicState('playing') → ... network delay ...
Backend: BackgroundAudioPlayer plays audio → LiveKit sends audio track
Frontend: receives audio track → is it music? Check expectingMusicTrack flag
Frontend: receives data message → calls expectMusicTrack() ← TOO LATE!
```

**Fixed flow:**

```
Backend: play() → sends audio track + data message
Frontend: receives audio track → not expecting music → ADD TO PENDING BUFFER
Frontend: receives data message → calls expectMusicTrack() → CHECKS PENDING BUFFER
Frontend: finds track in buffer → RETROACTIVELY IDENTIFIES AS MUSIC → routes to GainNode
```

**Fix applied (2025-12-11):**

- [x] Added `pendingMusicTracks` buffer for tracks that arrive before data message
- [x] `expectMusicTrack()` now retroactively identifies pending tracks
- [x] Increased timeout window from 3s to 5s
- [x] Added cleanup for pending track interval on disconnect
- [x] Added logging with latency tracking for debugging

### 3. ✅ FIXED: Silent Failure in `attachMusicTrack`

**Problem:** If `attachMusicTrack()` fails, ducking won't work but there's no user-visible error.

**Fix applied (2025-12-11):**

- [x] Added retry logic (up to 2 retries with 100ms delay)
- [x] Clear error logging: `🎚️ Failed to attach music track - DUCKING WILL NOT WORK`
- [x] Graceful degradation: returns no-op cleanup instead of throwing
- [x] App continues working without ducking if attachment fails
- [ ] TODO: Add telemetry metric for attachment failures (future)

---

## 🟡 Integration Gaps to Wire Together

### 4. ✅ VERIFIED: Redundant Ducking Paths Work Correctly

There are TWO ducking trigger paths (by design for redundancy):

| Path     | Trigger                        | Latency   | Priority  |
| -------- | ------------------------------ | --------- | --------- |
| Frontend | `onAudioTrack` event           | ~0ms      | Primary   |
| Backend  | `player.duck()` → data channel | ~50-200ms | Secondary |

**Verified behavior (2025-12-11):**

- [x] Priority system already exists: agent (3) > user (2) > backend (1) > none (0)
- [x] `updateDucking()` returns early if target gain unchanged (line 398-401)
- [x] Redundant triggers logged: "Ducking already at target level (redundant trigger ignored)"
- [x] `rampGain()` cancels any ongoing ramps before starting new one
- [x] Both paths provide redundancy - if one fails, other works

### 5. DJ Outro Not Speaking (Already Fixed Today)

**Root causes fixed:**

- [x] Dynamic imports caused 100-200ms latency
- [x] `isDucked` check skipped outro when agent was speaking
- [x] FFmpeg used wrong duration (30s hardcoded vs actual)

**Validation needed:**

- [ ] Test DJ outro speaks over fading music
- [ ] Verify SSML timing in outro phrases feels natural
- [ ] Check outro includes track/artist info

### 6. Crossfade Gap Too Long

**Problem:** 1.5s gap during track transitions feels unnatural.

**Current limitation:** BackgroundAudioPlayer only plays one track at a time.

**Workaround implemented:**

- DJ phrase fills the gap
- 'changing' state shown in UI

**Enhancement opportunity:**

- [ ] Pre-buffer next track during fade-out
- [ ] Reduce gap to <500ms with DJ phrase timing

---

## 🟢 Validation Checklist

### Backend → Frontend Data Flow

```
[ ] music-player.ts: notifyStateChange() called for all states
[ ] music-handler.ts: setOnMusicStateChangeCallback() registered
[ ] frontend-publisher.ts: sendMusicState() sends via data channel
[ ] data-message-handlers.ts: handleMusic() receives all states
[ ] now-playing.ui.ts: All states update UI correctly
```

### Ducking Flow

```
[ ] Backend: player.duck() called when agent speaks
[ ] Backend: notifyStateChange('ducking') fires
[ ] Frontend: data message 'ducking' received
[ ] Frontend: getMusicAudioController().duckFromBackend() called
[ ] Frontend: GainNode ramps to 12% in 150ms
[ ] Backend: player.unduck() called when agent stops
[ ] Frontend: GainNode ramps to 100% in 400ms
```

### DJ Outro Flow

```
[ ] Backend: fadeTimer fires at (duration - 5000)ms
[ ] Backend: notifyStateChange('fading') fires
[ ] Backend: session.say(getDJOutroPhrase()) called
[ ] Frontend: 'fading' state received, avatar shows appreciation
[ ] Audio: FFmpeg fade-out audible in last 5 seconds
[ ] Audio: Agent voice heard over fading music
```

### Music Track Identification

```
[ ] Backend: music_state 'playing' sent BEFORE audio track
[ ] Frontend: expectMusicTrack() sets flag
[ ] Frontend: LiveKit audio track arrives
[ ] Frontend: Track identified as music (not voice)
[ ] Frontend: attachMusicTrack() succeeds
[ ] Frontend: GainNode chain established
```

---

## 🔵 E2E Tests to Create

### File: `frontend-typescript/src/__tests__/music-ducking.e2e.test.ts`

```typescript
describe('Music Ducking E2E', () => {
  // Track identification
  it('should identify music track when data message arrives first');
  it('should identify music track when audio arrives first (fallback)');
  it('should not confuse voice track for music track');

  // GainNode attachment
  it('should attach music track to Web Audio GainNode');
  it('should handle attachment failure gracefully');
  it('should not double-attach same track');

  // Ducking behavior
  it('should duck to 12% in 150ms when agent speaks');
  it('should duck to 20% in 150ms when user speaks');
  it('should unduck to 100% in 400ms when speech ends');
  it('should handle rapid duck/unduck without glitches');

  // Priority handling
  it('should prioritize agent duck over user duck');
  it('should not unduck user when agent is still speaking');
});
```

### File: `src/tests/music-dj-outro.e2e.test.ts`

```typescript
describe('DJ Outro E2E', () => {
  it('should fire fading state at (duration - 5000)ms');
  it('should speak DJ outro phrase over fading music');
  it('should include track/artist in outro phrase');
  it('should not skip outro when agent was speaking');
  it('should use actual audio duration from ffprobe');
});
```

---

## 📊 Metrics to Track

Add these to telemetry for production monitoring:

| Metric                                  | Purpose                              |
| --------------------------------------- | ------------------------------------ |
| `music.track_identification_success`    | % of tracks correctly identified     |
| `music.track_identification_latency_ms` | Time from audio to identification    |
| `music.gainnode_attachment_success`     | % of successful GainNode attachments |
| `music.ducking_triggered`               | Count of duck events                 |
| `music.ducking_latency_ms`              | Time from trigger to gain change     |
| `music.outro_spoken`                    | Count of DJ outros delivered         |
| `music.outro_timing_delta_ms`           | Difference from ideal timing         |

---

## 🚀 Next Steps (Priority Order)

1. **Manual E2E test** - Play music, verify ducking works (browser console)
2. **Fix race condition** - Ensure track identification works reliably
3. **Add error handling** - Make attachment failures visible
4. **Create E2E tests** - Automate the validation checklist
5. **Add metrics** - Track success rates in production
