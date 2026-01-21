# 🎵 Sound Asset Completion Plan

> **Audit and plan for completing Ferni's sonic identity.**

**Version**: 1.0.0  
**Created**: January 2026  
**Status**: Active Planning

---

## Current State

### Existing Sounds (10)

| File | Duration | Status | Quality |
|------|----------|--------|---------|
| `connect.mp3` | ~1.2s | ✅ Exists | Good |
| `disconnect.mp3` | ~1.5s | ✅ Exists | Good |
| `dramatic-entrance.mp3` | ~2.0s | ✅ Exists | Good |
| `handoff-to-ferni.mp3` | ~1.5s | ✅ Exists | Good |
| `handoff-to-alex.mp3` | ~1.4s | ✅ Exists | Good |
| `handoff-to-jack.mp3` | ~1.8s | ✅ Exists | Good |
| `handoff-to-jordan.mp3` | ~1.5s | ✅ Exists | Good |
| `handoff-to-maya.mp3` | ~1.3s | ✅ Exists | Good |
| `handoff-to-nayan.mp3` | ~2.0s | ✅ Exists | Good |
| `handoff-to-peter.mp3` | ~1.2s | ✅ Exists | Good |

### Per Sonic Identity Spec (Target: 30+)

Reference: `docs/brand/FERNI-SONIC-IDENTITY.md`

---

## Missing Sounds

### Priority 1: Core System Sounds (Required)

| Sound | Spec Duration | Purpose | Priority |
|-------|---------------|---------|----------|
| `ferni-startup.mp3` | 2.0s | Ferni coming alive | P1 |
| `thinking.mp3` | 3.0s loop | AI processing | P1 |
| `message-sent.mp3` | 0.4s | User message acknowledged | P1 |
| `celebration-small.mp3` | 1.8s | Small win | P1 |
| `celebration-big.mp3` | 2.5s | Major milestone | P1 |
| `notification-gentle.mp3` | 0.8s | Push notification | P1 |
| `error-graceful.mp3` | 0.6s | Error state | P1 |
| `session-end.mp3` | 2.0s | Satisfying close | P1 |

### Priority 2: UI Feedback Sounds

| Sound | Spec Duration | Purpose | Priority |
|-------|---------------|---------|----------|
| `button-press.mp3` | 0.15s | Tactile click | P2 |
| `toggle-on.mp3` | 0.2s | Switch enabled | P2 |
| `toggle-off.mp3` | 0.2s | Switch disabled | P2 |
| `scroll-stop.mp3` | 0.1s | Settling | P2 |
| `typing-indicator.mp3` | 1.0s loop | User typing | P2 |

### Priority 3: Celebration Variants

| Sound | Spec Duration | Purpose | Priority |
|-------|---------------|---------|----------|
| `milestone-reached.mp3` | 2.0s | Generic milestone | P3 |
| `streak-3.mp3` | 1.5s | 3-day streak | P3 |
| `streak-7.mp3` | 2.0s | 7-day streak | P3 |
| `streak-21.mp3` | 2.5s | 21-day streak | P3 |
| `streak-30.mp3` | 3.0s | 30-day streak | P3 |
| `team-unlock.mp3` | 2.5s | New persona available | P3 |
| `deep-moment.mp3` | 2.0s | Emotional breakthrough | P3 |

### Priority 4: Ambient Soundscapes

| Sound | Spec Duration | Purpose | Priority |
|-------|---------------|---------|----------|
| `ambient-zen-garden.mp3` | 3 min loop | Nature sounds | P4 |
| `ambient-cozy-interior.mp3` | 3 min loop | Fireplace, rain | P4 |
| `ambient-focused-calm.mp3` | 2 min loop | Minimal pad | P4 |
| `ambient-night-mode.mp3` | 5 min loop | Very quiet | P4 |

---

## Sound Specifications

### The Ferni Sound Palette

Reference from Sonic Identity:

#### Foundation
- **The Ferni Note**: C4 (Middle C), warm piano with soft felt
- **The Warmth Pad**: C major 7 chord, soft synth
- **The Breath**: Soft inhale/exhale texture

#### Persona Sonic Colors

| Persona | Key Interval | Timbre |
|---------|--------------|--------|
| Ferni | Unison/Perfect 5th | Felt piano |
| Jack | Major 3rd (lower) | Wood resonance |
| Peter | Major 6th (bright) | Clear piano |
| Alex | Perfect 4th | Bell-like, pure |
| Maya | Root/Octave | Rhythmic, grounded |
| Jordan | Major 7th | Light, effervescent |
| Nayan | Full octave | Resonant, deep |

---

## Technical Specifications

### Audio Format

| Use Case | Format | Sample Rate | Bit Depth/Rate |
|----------|--------|-------------|----------------|
| UI Sounds | MP3 | 44.1kHz | 128kbps |
| Ambience | MP3 | 44.1kHz | 192kbps |
| High-fidelity | WAV | 48kHz | 24-bit |
| Looping | WAV | 44.1kHz | 24-bit |

### Volume Levels

| Sound Type | Peak Level | Average Level |
|------------|------------|---------------|
| Notifications | -6dB | -12dB |
| UI Feedback | -9dB | -15dB |
| Ambient | -18dB | -24dB |
| Celebrations | -3dB | -9dB |
| Error | -9dB | -15dB |

### Loop Requirements

For looping sounds:
- Seamless loop point (no click)
- 50ms crossfade at loop boundaries
- Consistent volume throughout

---

## Production Notes

### ferni-startup.mp3

```
Duration: 2.0 seconds
Character: Soft piano note rising, like waking up gently
Emotional Goal: "Hello, I'm here"
Technical: Start at -12dB, crescendo to -6dB

Musical Specification:
Time:   0ms    400ms   800ms   1200ms  1600ms  2000ms
Note:   C4     (hold)  E4      G4      (fade)  (silence)
Vel:    pp     (swell) mp      p       ppp     -
```

### thinking.mp3

```
Duration: 3.0 seconds (seamless loop)
Character: Subtle ambient texture, contemplative
Emotional Goal: "I'm really thinking about this"
Technical: -18dB, loopable without click

Sound design:
- Soft pad with gentle modulation
- Slight shimmer/sparkle
- No rhythmic elements (could feel impatient)
```

### celebration-small.mp3

```
Duration: 1.8 seconds
Character: Ascending warmth, like a gentle cheer
Emotional Goal: "That's worth celebrating"
Technical: Ascending arpeggio, warm

Musical Specification:
Time:   0ms    300ms   500ms   700ms   1000ms  1800ms
Note:   C4     E4      G4      C5      (hold)  (fade)
Vel:    p      mp      mf      mp      p       -
```

### celebration-big.mp3

```
Duration: 2.5 seconds
Character: Full celebration, triumphant but tasteful
Emotional Goal: "This is a big deal"
Technical: Chord progression with resolution

Musical Specification:
Time:   0ms    500ms   1000ms  1500ms  2000ms  2500ms
Chord:  Fmaj7  G       Am7     Cmaj7   (hold)  (fade)
Vel:    p      mp      mf      f       mp      -
```

### error-graceful.mp3

```
Duration: 0.6 seconds
Character: Soft, questioning, not alarming
Emotional Goal: "Hmm, that didn't work"
Technical: Minor inflection, not harsh

Musical Specification:
Time:   0ms    200ms   400ms   600ms
Note:   C4     Db4     (hold)  (fade)
Vel:    mp     p       pp      -
```

---

## Implementation Checklist

### Phase 1: Core Sounds (Week 1)

- [ ] Commission/create `ferni-startup.mp3`
- [ ] Commission/create `thinking.mp3`
- [ ] Commission/create `message-sent.mp3`
- [ ] Commission/create `celebration-small.mp3`
- [ ] Commission/create `celebration-big.mp3`
- [ ] Commission/create `notification-gentle.mp3`
- [ ] Commission/create `error-graceful.mp3`
- [ ] Commission/create `session-end.mp3`

### Phase 2: UI Feedback (Week 2)

- [ ] Commission/create `button-press.mp3`
- [ ] Commission/create `toggle-on.mp3`
- [ ] Commission/create `toggle-off.mp3`
- [ ] Commission/create `scroll-stop.mp3`
- [ ] Commission/create `typing-indicator.mp3`

### Phase 3: Celebration Variants (Week 3)

- [ ] Commission/create `milestone-reached.mp3`
- [ ] Commission/create all streak sounds
- [ ] Commission/create `team-unlock.mp3`
- [ ] Commission/create `deep-moment.mp3`

### Phase 4: Ambient Soundscapes (Week 4)

- [ ] Commission/create `ambient-zen-garden.mp3`
- [ ] Commission/create `ambient-cozy-interior.mp3`
- [ ] Commission/create `ambient-focused-calm.mp3`
- [ ] Commission/create `ambient-night-mode.mp3`

---

## Production Options

### Option A: Commission Original Compositions

**Recommended for**: Startup, celebrations, error, handoffs

- Unique to Ferni
- Trademark-protectable
- Consistent with brand
- Higher cost (~$200-500 per sound)

**Suggested vendors**:
- Pond5 custom commission
- Fiverr sound designers
- Local composers (Ólafur Arnalds style)

### Option B: Licensed Sound Libraries

**Recommended for**: UI feedback, ambient

- Faster turnaround
- Lower cost
- May need tweaking for brand fit

**Suggested libraries**:
- Artlist (subscription)
- Epidemic Sound (subscription)
- Soundsnap (per-sound)

### Option C: AI-Generated (with human polish)

**Recommended for**: Ambient soundscapes

- Fastest turnaround
- May need significant editing
- Good for background/ambient only

**Tools**:
- Suno AI
- AIVA
- Mubert

---

## Integration

### Update sounds.json

After creating sounds, update `design-system/tokens/sounds.json`:

```json
{
  "sounds": {
    "ferniStartup": {
      "file": "ferni-startup.mp3",
      "duration": 2000,
      "volume": -6,
      "category": "system"
    },
    "thinking": {
      "file": "thinking.mp3",
      "duration": 3000,
      "volume": -18,
      "loop": true,
      "category": "system"
    }
    // ... etc
  }
}
```

### Update Audio Engine

Ensure `src/audio/` can play all new sounds:

```typescript
// Add to preload lists
const PRELOAD_IMMEDIATE = [
  'ferni-startup',
  'message-sent',
  // ...
];
```

### Update Design System Export

Add sounds to generated exports:

```bash
npm run generate-sounds  # Updates sounds.generated.ts
```

---

## Success Criteria

### Quality Gates

- [ ] Every sound matches the Ferni Sound palette
- [ ] Volume levels are consistent across all sounds
- [ ] No jarring or startling sounds
- [ ] All loops are seamless
- [ ] All sounds have visual alternatives (accessibility)

### Brand Alignment

- [ ] Sounds feel warm, not cold
- [ ] Sounds feel human, not robotic
- [ ] Sounds match persona sonic colors
- [ ] Sounds enhance experience, don't distract

---

## Budget Estimate

| Category | Sounds | Estimated Cost |
|----------|--------|----------------|
| Core System | 8 | $1,600 - $4,000 |
| UI Feedback | 5 | $500 - $1,500 |
| Celebrations | 7 | $1,400 - $3,500 |
| Ambient | 4 | $400 - $1,000 |
| **Total** | **24** | **$3,900 - $10,000** |

---

**© 2026 Ferni. Sound is 50% of the experience.**

*"Every sound should ask: Does this feel like Ferni?"*
