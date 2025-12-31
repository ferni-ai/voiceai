# 🎵 Ferni Sonic Identity
## Complete Audio Brand System

**Version 1.0 | December 2024**  
**Classification:** Creative + Technical Specification

---

> *"Sound is 50% of the movie experience."*  
> — George Lucas

---

# Table of Contents

1. [Audio Philosophy](#1-audio-philosophy)
2. [The Ferni Sound](#2-the-ferni-sound)
3. [Sound Events Library](#3-sound-events-library)
4. [Persona Audio Signatures](#4-persona-audio-signatures)
5. [Emotional Audio Cues](#5-emotional-audio-cues)
6. [Ambient Soundscapes](#6-ambient-soundscapes)
7. [Voice Characteristics](#7-voice-characteristics)
8. [Technical Specifications](#8-technical-specifications)
9. [Implementation Guidelines](#9-implementation-guidelines)
10. [Accessibility](#10-accessibility)

---

# 1. Audio Philosophy

## Sound as Connection

Ferni's audio isn't decorative—it's communicative. Every sound should:

1. **Feel inevitable** — Like it couldn't be any other way
2. **Convey warmth** — Even functional sounds feel human
3. **Support, not distract** — Audio serves the experience
4. **Create memory** — Sounds become associated with feelings

## Audio Aesthetic Reference

Our sonic inspiration draws from:

| Reference | What We Take |
|-----------|--------------|
| **Ólafur Arnalds** | Warm piano, gentle electronics, breathing space |
| **Max Richter** | Emotional depth, cinematic restraint |
| **Nils Frahm** | Organic imperfection, felt piano hammers |
| **Apple** | Functional clarity, satisfying feedback |
| **Studio Ghibli** | Whimsy without excess, natural sounds |

## What Ferni Sound Is NOT

❌ Clinical beeps and boops  
❌ Aggressive notification sounds  
❌ Generic UI sounds  
❌ Synthesized without humanity  
❌ Loud or startling  
❌ Emotionally manipulative  

---

# 2. The Ferni Sound

## 2.1 Core Audio Elements

### The Ferni Note
**The foundational sound of Ferni's identity.**

- **Note:** C4 (Middle C) — Universal, grounding
- **Timbre:** Warm piano with soft felt, slight reverb
- **Character:** Like a breath, not a strike
- **Duration:** 800ms with natural decay
- **Usage:** Basis for all Ferni-specific sounds

### The Warmth Pad
**Ambient undertone for presence.**

- **Chord:** C major 7 (C-E-G-B) — Warm, resolved but open
- **Timbre:** Soft synth pad with slight warmth filter
- **Character:** Barely noticeable, subconscious comfort
- **Usage:** Subtle background during active connection

### The Breath
**Organic rhythm element.**

- **Sound:** Soft inhale/exhale texture
- **Character:** Not literal breath, but the feeling
- **Usage:** Transitions, thinking moments

---

## 2.2 Sonic Color Palette

Each persona has a sonic "color"—subtle variations on the Ferni foundation:

| Persona | Sonic Character | Key Interval | Texture |
|---------|----------------|--------------|---------|
| **Ferni** | Warm, centered | Unison/Perfect 5th | Felt piano |
| **Jack** | Wise, resonant | Major 3rd | Lower register, wood |
| **Peter** | Curious, bright | Major 6th | Higher register, clear |
| **Alex** | Clear, empathetic | Perfect 4th | Bell-like, pure |
| **Maya** | Steady, reliable | Root | Rhythmic, grounded |
| **Jordan** | Joyful, sparkly | Major 7th | Light, effervescent |
| **Nayan** | Deep, integrative | Octave | Full range, resonant |

---

# 3. Sound Events Library

## 3.1 Core System Sounds

### ferni-startup.mp3
**The first moment—Ferni coming alive.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 2.0 seconds |
| **Character** | Soft piano note rising, like waking up gently |
| **Emotional Goal** | "Hello, I'm here" |
| **Technical** | Start at -12dB, crescendo to -6dB |
| **Layers** | Felt piano + subtle breath texture |

**Musical Specification:**
```
Time:   0ms    400ms   800ms   1200ms  1600ms  2000ms
Note:   C4     (hold)  E4      G4      (fade)  (silence)
Vel:    pp     (swell) mp      p       ppp     -
```

---

### connection-success.mp3
**Trust established—connection made.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 1.2 seconds |
| **Character** | Warm resolution, like a gentle "yes" |
| **Emotional Goal** | "We're connected" |
| **Technical** | Peak at -6dB with natural decay |
| **Layers** | Piano chord + soft pad resolution |

**Musical Specification:**
```
Time:   0ms    300ms   600ms   900ms   1200ms
Chord:  -      Cmaj7   (hold)  (fade)  (silence)
Vel:    -      mp      (decay) pp      -
```

---

### connection-lost.mp3
**Graceful goodbye—disconnection.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 1.5 seconds |
| **Character** | Gentle descent, like a soft "see you soon" |
| **Emotional Goal** | "Goodbye for now" (not sad) |
| **Technical** | Descending notes, fade to silence |
| **Layers** | Piano arpeggio down |

**Musical Specification:**
```
Time:   0ms    300ms   600ms   900ms   1200ms  1500ms
Note:   G4     E4      C4      (hold)  (fade)  (silence)
Vel:    mp     p       pp      ppp     -       -
```

---

### thinking.mp3 (Loopable)
**Processing—AI is considering.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 3.0 seconds (seamless loop) |
| **Character** | Subtle ambient texture, contemplative |
| **Emotional Goal** | "I'm really thinking about this" |
| **Technical** | -18dB, loopable without click |
| **Layers** | Soft pad + gentle modulation |

---

### message-sent.mp3
**User message acknowledged.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 0.4 seconds |
| **Character** | Light, confirming |
| **Emotional Goal** | "Got it" |
| **Technical** | Quick, subtle, -9dB |
| **Layers** | Single soft tone |

---

### celebration-small.mp3
**Small win detected.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 1.8 seconds |
| **Character** | Ascending warmth, like a gentle cheer |
| **Emotional Goal** | "That's worth celebrating" |
| **Technical** | Ascending arpeggio, warm |
| **Layers** | Piano + subtle sparkle |

**Musical Specification:**
```
Time:   0ms    300ms   500ms   700ms   1000ms  1800ms
Note:   C4     E4      G4      C5      (hold)  (fade)
Vel:    p      mp      mf      mp      p       -
```

---

### celebration-big.mp3
**Major milestone.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 2.5 seconds |
| **Character** | Full celebration, triumphant but tasteful |
| **Emotional Goal** | "This is a big deal" |
| **Technical** | Chord progression with resolution |
| **Layers** | Piano chord + pad + subtle bells |

**Musical Specification:**
```
Time:   0ms    500ms   1000ms  1500ms  2000ms  2500ms
Chord:  Fmaj7  G       Am7     Cmaj7   (hold)  (fade)
Vel:    p      mp      mf      f       mp      -
```

---

### notification-gentle.mp3
**"Thinking of you" push notification.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 0.8 seconds |
| **Character** | Single warm bell, like a gentle tap |
| **Emotional Goal** | "I thought of you" |
| **Technical** | -9dB, clear but not startling |
| **Layers** | Soft bell + resonance |

---

### error-graceful.mp3
**Something went wrong—gracefully.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 0.6 seconds |
| **Character** | Soft, questioning, not alarming |
| **Emotional Goal** | "Hmm, that didn't work" |
| **Technical** | Minor inflection, not harsh |
| **Layers** | Soft piano, minor 2nd interval |

**Musical Specification:**
```
Time:   0ms    200ms   400ms   600ms
Note:   C4     Db4     (hold)  (fade)
Vel:    mp     p       pp      -
Character: Questioning, not alarming
```

---

### session-end.mp3
**Satisfying close—session ending.**

| Attribute | Specification |
|-----------|---------------|
| **Duration** | 2.0 seconds |
| **Character** | Warm resolution, complete feeling |
| **Emotional Goal** | "That was meaningful" |
| **Technical** | Full cadence, satisfying close |
| **Layers** | Piano resolution + pad |

**Musical Specification:**
```
Time:   0ms    500ms   1000ms  1500ms  2000ms
Chord:  Am7    G/B     Cmaj7   (hold)  (silence)
Vel:    mp     mp      p       pp      -
```

---

## 3.2 Persona Handoff Sounds

Each handoff has a unique sound that blends the source and target persona's sonic colors.

### handoff-to-ferni.mp3
| Duration | 1.5s |
| Character | Returning home, warm welcome |
| Musical | C major resolution, felt piano |

### handoff-to-jack.mp3
| Duration | 1.8s |
| Character | Wise, lower, resonant |
| Musical | C → E (major 3rd), wood timbre |

### handoff-to-peter.mp3
| Duration | 1.2s |
| Character | Curious, ascending, bright |
| Musical | C → A (major 6th), clear tone |

### handoff-to-alex.mp3
| Duration | 1.4s |
| Character | Clear, empathetic, bell-like |
| Musical | C → F (perfect 4th), pure |

### handoff-to-maya.mp3
| Duration | 1.3s |
| Character | Steady, grounded, rhythmic |
| Musical | C → C (octave), stable |

### handoff-to-jordan.mp3
| Duration | 1.5s |
| Character | Joyful, sparkly, uplifting |
| Musical | C → B (major 7th), light |

### handoff-to-nayan.mp3
| Duration | 2.0s |
| Character | Deep, full, integrative |
| Musical | Full octave spread, resonant |

---

## 3.3 Interaction Feedback Sounds

### button-press.mp3
| Duration | 0.15s |
| Character | Subtle click with warmth |
| Technical | -12dB, tactile |

### toggle-on.mp3
| Duration | 0.2s |
| Character | Ascending tone, positive |
| Technical | -10dB, satisfying |

### toggle-off.mp3
| Duration | 0.2s |
| Character | Descending tone, neutral |
| Technical | -10dB, not negative |

### scroll-stop.mp3
| Duration | 0.1s |
| Character | Subtle settling |
| Technical | -18dB, barely perceptible |

### typing-indicator.mp3 (Loopable)
| Duration | 1.0s loop |
| Character | Soft rhythmic pattern |
| Technical | -20dB, ambient |

---

# 4. Persona Audio Signatures

## 4.1 Entrance Motifs

Each persona has a brief (0.5-1.0s) motif that plays on their first message in a session:

### Ferni
```
Notes: C4 - G4 (perfect 5th, ascending)
Character: Open, welcoming
Timbre: Felt piano
```

### Jack
```
Notes: G3 - B3 (major 3rd, lower)
Character: Wise, grounded
Timbre: Wood resonance
```

### Peter
```
Notes: E4 - C#5 (major 6th, bright)
Character: Curious, eager
Timbre: Clean piano
```

### Alex
```
Notes: C4 - F4 (perfect 4th)
Character: Clarifying, empathetic
Timbre: Bell-like
```

### Maya
```
Notes: C4 - C4 (octave down/up pulse)
Character: Steady, reliable
Timbre: Rhythmic piano
```

### Jordan
```
Notes: C4 - B4 (major 7th)
Character: Anticipatory, joyful
Timbre: Sparkle/bells
```

### Nayan
```
Notes: C3 - C4 - C5 (octave spread)
Character: Expansive, integrative
Timbre: Full, resonant pad
```

---

## 4.2 Persona Ambient Tones

For extended interactions, each persona has a subtle ambient bed:

| Persona | Ambient Character | BPM Equivalent |
|---------|------------------|----------------|
| Ferni | Warm pad, breathing | 60 BPM |
| Jack | Lower drone, wise | 50 BPM |
| Peter | Slightly rhythmic | 72 BPM |
| Alex | Clear, open | 66 BPM |
| Maya | Subtle pulse | 80 BPM |
| Jordan | Light, anticipatory | 90 BPM |
| Nayan | Deep, spacious | 54 BPM |

---

# 5. Emotional Audio Cues

## 5.1 Emotion Detection Response

When the AI detects specific emotions, audio subtly shifts:

### User Seems Happy
- Ambient warmth increases slightly
- Higher overtones present
- Tempo imperceptibly lifts

### User Seems Sad
- Ambient becomes more spacious
- Lower, more resonant tones
- More silence between sounds

### User Seems Anxious
- Ambient becomes steadier, predictable
- Grounding, lower frequencies
- Rhythmic stability

### User Seems Excited
- Quick, light responses
- Ascending intervals
- More presence

### User Seems Thoughtful
- More silence, space
- Single tones, not chords
- Contemplative pauses

---

## 5.2 Celebration Sounds by Type

| Win Type | Sound Character | Duration |
|----------|----------------|----------|
| **followed_through** | Satisfying completion | 1.5s |
| **courage_moment** | Triumphant, proud | 2.0s |
| **self_care** | Nurturing, warm | 1.8s |
| **boundary_held** | Strong, grounded | 1.6s |
| **hard_conversation** | Brave, resolute | 2.0s |
| **tried_new_thing** | Curious, bright | 1.7s |
| **asked_for_help** | Warm, supported | 1.5s |

---

# 6. Ambient Soundscapes

## 6.1 Background Ambience (Optional)

Users can optionally enable ambient soundscapes:

### Zen Garden
- Soft wind, distant birds
- Water element (gentle stream)
- Nature textures

### Cozy Interior
- Fireplace crackle
- Rain on windows
- Soft room tone

### Focused Calm
- Minimal pad drone
- No natural elements
- Pure concentration

### Night Mode
- Very quiet ambience
- Lower frequencies only
- Breathing space

---

## 6.2 Soundscape Technical Specs

| Soundscape | Frequency Range | Max Volume | Loop Length |
|------------|-----------------|------------|-------------|
| Zen Garden | 200Hz-8kHz | -24dB | 3 min |
| Cozy Interior | 100Hz-6kHz | -24dB | 3 min |
| Focused Calm | 80Hz-4kHz | -30dB | 2 min |
| Night Mode | 80Hz-2kHz | -36dB | 5 min |

---

# 7. Voice Characteristics

## 7.1 AI Voice Guidelines

When using text-to-speech or voice synthesis:

### Overall Character
- **Pace:** Unhurried, natural pauses
- **Tone:** Warm, engaged, not performative
- **Breath:** Natural breathing points
- **Pitch:** Medium, not artificially raised

### Persona Voice Variations

| Persona | Pitch | Pace | Character |
|---------|-------|------|-----------|
| Ferni | Medium | Moderate | Warm, curious |
| Jack | Lower | Slower | Wise, deliberate |
| Peter | Medium-high | Faster when excited | Enthusiastic |
| Alex | Medium | Measured | Clear, empathetic |
| Maya | Medium | Efficient | Direct, practical |
| Jordan | Higher | Energetic | Joyful, expressive |
| Nayan | Medium-low | Spacious | Deep, integrative |

---

## 7.2 Backchannel Sounds

Non-word acknowledgments during user speech:

| Sound | Usage | Phonetic |
|-------|-------|----------|
| "Mm-hmm" | Agreement, following | /m̩ˈhm̩/ |
| "Hmm" | Thinking | /hm̩/ |
| "Mhmm" | Continued listening | /ˈm.m̩/ |
| Soft inhale | Before speaking | [breath] |
| "Uh-huh" | Acknowledgment | /ˈʌhʌ/ |

---

# 8. Technical Specifications

## 8.1 Audio File Formats

| Use Case | Format | Sample Rate | Bit Depth |
|----------|--------|-------------|-----------|
| UI Sounds | MP3 | 44.1kHz | 128kbps |
| Ambience | MP3 | 44.1kHz | 192kbps |
| High-fidelity | WAV | 48kHz | 24-bit |
| Looping | WAV | 44.1kHz | 24-bit |

---

## 8.2 Volume Levels

| Sound Type | Peak Level | Average Level |
|------------|------------|---------------|
| Notifications | -6dB | -12dB |
| UI Feedback | -9dB | -15dB |
| Ambient | -18dB | -24dB |
| Celebrations | -3dB | -9dB |
| Error | -9dB | -15dB |

---

## 8.3 Audio Mixing Guidelines

### Layering Priority
1. Voice (highest priority)
2. UI Feedback
3. Persona signatures
4. Ambient/Background (lowest priority)

### Ducking
- When voice is active, ambient ducks to -30dB
- UI sounds duck ambient by 6dB momentarily
- Celebrations pause ambient briefly

### Crossfades
- Soundscape transitions: 3s crossfade
- Persona handoffs: 1s crossfade
- Loop points: 50ms crossfade

---

# 9. Implementation Guidelines

## 9.1 Audio Engine Requirements

```typescript
interface FerniAudioEngine {
  // Core playback
  playSound(soundId: FerniSoundId, options?: PlayOptions): Promise<void>;
  stopSound(soundId: FerniSoundId): void;
  
  // Ambient management
  setAmbient(ambientId: AmbientId | null): void;
  setAmbientVolume(volume: number): void;
  
  // Persona audio
  playPersonaEntrance(personaId: PersonaId): Promise<void>;
  playHandoff(fromPersona: PersonaId, toPersona: PersonaId): Promise<void>;
  
  // Emotional response
  setEmotionalContext(emotion: EmotionalState): void;
  
  // Volume control
  setMasterVolume(volume: number): void;
  setCategory(category: SoundCategory, volume: number): void;
  
  // Accessibility
  isMuted(): boolean;
  setMuted(muted: boolean): void;
}
```

---

## 9.2 Sound Event Triggers

```typescript
// Connection lifecycle
onConnectionStart → play('connection-success')
onConnectionEnd → play('connection-lost')
onReconnecting → play('thinking', { loop: true })

// Persona lifecycle
onPersonaChange → play(`handoff-to-${personaId}`)
onPersonaFirstMessage → play(`persona-entrance-${personaId}`)

// User interaction
onMessageSent → play('message-sent')
onButtonPress → play('button-press')

// Trust system events
onSmallWinDetected → play('celebration-small')
onMilestoneReached → play('celebration-big')
onBoundaryRespected → play('acknowledgment-soft')

// Errors
onConnectionError → play('error-graceful')
```

---

## 9.3 Preloading Strategy

```typescript
// Critical sounds - preload immediately
const PRELOAD_IMMEDIATE = [
  'connection-success',
  'connection-lost',
  'message-sent',
  'button-press',
];

// Session sounds - preload on connection
const PRELOAD_ON_CONNECT = [
  'thinking',
  'celebration-small',
  'persona-entrance-ferni',
  'session-end',
];

// Persona sounds - preload on handoff
const PRELOAD_ON_HANDOFF = (personaId) => [
  `handoff-to-${personaId}`,
  `persona-entrance-${personaId}`,
];
```

---

# 10. Accessibility

## 10.1 Visual Alternatives

Every sound must have a visual equivalent:

| Sound | Visual Alternative |
|-------|-------------------|
| Connection success | Green checkmark animation |
| Connection lost | Status indicator change |
| Thinking | Animated dots / loading state |
| Celebration | Sparkle animation, color pulse |
| Error | Gentle shake, icon change |
| Notification | Badge, visual indicator |

---

## 10.2 Sound Settings

Users must be able to:

- **Mute all sounds** — Master mute
- **Mute by category** — UI, Ambient, Notifications separately
- **Adjust volume** — Master and per-category
- **Enable visual only mode** — Sounds disabled, visuals enhanced

---

## 10.3 Hearing Accessibility

### Considerations
- No critical information conveyed by sound alone
- Captions available for voice content
- Vibration alternatives for mobile
- Visual rhythm indicators for ambient sounds

### Screen Reader Compatibility
- Sound events trigger ARIA announcements
- Sound state is queryable ("Sound is muted")
- Alternative text describes sound character

---

# Appendix A: Sound File Naming Convention

```
ferni-[category]-[name][-variant].mp3

Examples:
ferni-system-startup.mp3
ferni-system-connection-success.mp3
ferni-handoff-to-maya.mp3
ferni-celebration-small-boundary.mp3
ferni-ambient-zen-garden.mp3
```

---

# Appendix B: Sound Asset Checklist

## Core System (Required)
- [ ] ferni-startup.mp3
- [ ] connection-success.mp3
- [ ] connection-lost.mp3
- [ ] thinking.mp3
- [ ] message-sent.mp3
- [ ] session-end.mp3

## Celebrations (Required)
- [ ] celebration-small.mp3
- [ ] celebration-big.mp3
- [ ] milestone-reached.mp3

## Notifications (Required)
- [ ] notification-gentle.mp3
- [ ] error-graceful.mp3

## Persona Handoffs (Required)
- [ ] handoff-to-ferni.mp3
- [ ] handoff-to-jack.mp3
- [ ] handoff-to-peter.mp3
- [ ] handoff-to-alex.mp3
- [ ] handoff-to-maya.mp3
- [ ] handoff-to-jordan.mp3
- [ ] handoff-to-nayan.mp3

## UI Feedback (Required)
- [ ] button-press.mp3
- [ ] toggle-on.mp3
- [ ] toggle-off.mp3

## Ambient (Optional)
- [ ] ambient-zen-garden.mp3
- [ ] ambient-cozy-interior.mp3
- [ ] ambient-focused-calm.mp3
- [ ] ambient-night-mode.mp3

---

# Appendix C: Music Licensing Notes

All Ferni sounds must be:
- Original compositions, OR
- Fully licensed for commercial use, OR
- Royalty-free with appropriate attribution

**Recommended sound libraries:**
- Artlist (subscription)
- Epidemic Sound (subscription)
- Custom composition (preferred for core sounds)

**For iconic sounds (startup, notifications):**
- Commission original composition
- Ensure trademark protection

---

**© 2024 Ferni. All rights reserved.**

*Sound is the soul of the experience. Every audio decision should ask: "Does this feel like Ferni?"*

