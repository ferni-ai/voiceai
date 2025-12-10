# 🎵 Ferni Sound Asset Manifest
## Audio Commissioning Brief

**Version 1.0 | December 2024**  
**Status:** Ready for Commissioning

---

# Overview

This document specifies all audio assets required for the Ferni brand experience. These should be commissioned from a professional sound designer or composer.

**Total Assets:** 25 sounds  
**Estimated Budget:** $3,000-5,000  
**Timeline:** 2-3 weeks for complete delivery

---

# Priority Tiers

| Priority | Description | Assets | Deadline |
|----------|-------------|--------|----------|
| **P0** | Critical for launch | 6 | Week 1 |
| **P1** | Important for experience | 10 | Week 2 |
| **P2** | Nice to have | 9 | Week 3 |

---

# Brand Audio Guidelines

## Musical Reference

Our sonic inspiration draws from:
- **Ólafur Arnalds** — Warm piano, gentle electronics
- **Max Richter** — Emotional depth, cinematic restraint
- **Nils Frahm** — Organic imperfection, felt piano
- **Apple** — Functional clarity, satisfying feedback

## Core Characteristics

- **Key:** C major family (C, G, Am, F)
- **Timbre:** Warm, felt piano with soft reverb
- **Character:** Organic, never synthesized-feeling
- **Volume:** Soft, never startling

## What Ferni Sound is NOT

❌ Clinical beeps and boops  
❌ Aggressive notification sounds  
❌ Generic UI sounds  
❌ Synthesized without humanity  
❌ Loud or attention-demanding  

---

# P0 Assets (Critical)

## 1. ferni-startup.mp3

**Purpose:** Brand signature, first moment when Ferni comes alive

| Spec | Value |
|------|-------|
| Duration | 2.0 seconds |
| Peak Level | -6dB |
| Character | Soft piano note rising, like waking up gently |
| Emotional Goal | "Hello, I'm here" |

**Musical Specification:**
```
Time:   0ms    400ms   800ms   1200ms  1600ms  2000ms
Note:   C4     (hold)  E4      G4      (fade)  (silence)
Vel:    pp     (swell) mp      p       ppp     -
```

**Layers:**
- Felt piano (primary)
- Subtle breath texture
- Soft reverb tail

---

## 2. connection-success.mp3

**Purpose:** Trust established, connection made

| Spec | Value |
|------|-------|
| Duration | 1.2 seconds |
| Peak Level | -6dB |
| Character | Warm resolution, like a gentle "yes" |
| Emotional Goal | "We're connected" |

**Musical Specification:**
```
Time:   0ms    300ms   600ms   900ms   1200ms
Chord:  -      Cmaj7   (hold)  (fade)  (silence)
Vel:    -      mp      (decay) pp      -
```

---

## 3. connection-lost.mp3

**Purpose:** Graceful disconnection

| Spec | Value |
|------|-------|
| Duration | 1.5 seconds |
| Peak Level | -9dB |
| Character | Gentle descent, "see you soon" (not sad) |
| Emotional Goal | "Goodbye for now" |

**Musical Specification:**
```
Time:   0ms    300ms   600ms   900ms   1200ms  1500ms
Note:   G4     E4      C4      (hold)  (fade)  (silence)
Vel:    mp     p       pp      ppp     -       -
```

---

## 4. celebration-small.mp3

**Purpose:** Daily wins, small progress

| Spec | Value |
|------|-------|
| Duration | 1.8 seconds |
| Peak Level | -3dB |
| Character | Ascending warmth, gentle cheer |
| Emotional Goal | "That's worth celebrating" |

**Musical Specification:**
```
Time:   0ms    300ms   500ms   700ms   1000ms  1800ms
Note:   C4     E4      G4      C5      (hold)  (fade)
Vel:    p      mp      mf      mp      p       -
```

**Layers:**
- Piano arpeggio
- Subtle sparkle/bell

---

## 5. celebration-big.mp3

**Purpose:** Major milestones, significant wins

| Spec | Value |
|------|-------|
| Duration | 2.5 seconds |
| Peak Level | 0dB |
| Character | Full celebration, triumphant but tasteful |
| Emotional Goal | "This is a big deal" |

**Musical Specification:**
```
Time:   0ms    500ms   1000ms  1500ms  2000ms  2500ms
Chord:  Fmaj7  G       Am7     Cmaj7   (hold)  (fade)
Vel:    p      mp      mf      f       mp      -
```

**Layers:**
- Piano chord progression
- Warm pad swell
- Subtle bells/sparkle

---

## 6. notification-gentle.mp3

**Purpose:** "Thinking of you" notifications

| Spec | Value |
|------|-------|
| Duration | 0.8 seconds |
| Peak Level | -9dB |
| Character | Single warm bell, gentle tap |
| Emotional Goal | "I thought of you" |

**Layers:**
- Soft bell tone
- Warm resonance

---

# P1 Assets (Important)

## 7. error-graceful.mp3

| Duration | 0.6s | Character | Soft, questioning, not alarming |

**Musical:** Minor 2nd interval (C4 → Db4), questioning inflection

---

## 8. session-end.mp3

| Duration | 2.0s | Character | Warm resolution, complete feeling |

**Musical:** Am7 → G/B → Cmaj7 cadence

---

## 9-15. handoff-to-[persona].mp3 (×7)

One sound per persona for handoff transitions:

| Persona | Duration | Character | Interval |
|---------|----------|-----------|----------|
| ferni | 1.5s | Returning home | C major resolution |
| jack | 1.8s | Wise, lower | Major 3rd, wood timbre |
| peter | 1.2s | Curious, ascending | Major 6th, bright |
| alex | 1.4s | Clear, empathetic | Perfect 4th, bell-like |
| maya | 1.3s | Steady, grounded | Octave, rhythmic |
| jordan | 1.5s | Joyful, sparkly | Major 7th, light |
| nayan | 2.0s | Deep, integrative | Full octave, resonant |

---

## 16. thinking.mp3 (Loopable)

| Duration | 3.0s loop | Character | Contemplative ambient texture |

**Requirements:**
- Seamless loop point
- Subtle modulation
- Can layer under voice

---

# P2 Assets (Nice to Have)

## 17. message-sent.mp3

| Duration | 0.4s | Character | Light confirmation |

---

## 18. button-press.mp3

| Duration | 0.15s | Character | Subtle click with warmth |

---

## 19. toggle-on.mp3

| Duration | 0.2s | Character | Ascending, positive |

---

## 20. toggle-off.mp3

| Duration | 0.2s | Character | Descending, neutral (not negative) |

---

## 21-27. persona-entrance-[persona].mp3 (×7)

Brief motifs (0.5-1.0s) for first message from each persona:

| Persona | Notes | Character |
|---------|-------|-----------|
| ferni | C4-G4 | Open, welcoming |
| jack | G3-B3 | Wise, grounded |
| peter | E4-C#5 | Curious, eager |
| alex | C4-F4 | Clarifying |
| maya | C4 octave pulse | Steady |
| jordan | C4-B4 | Anticipatory |
| nayan | C3-C4-C5 | Expansive |

---

# Ambient Soundscapes (Optional)

If budget allows, 4 ambient loops (3 min each, seamless):

## 28. ambient-zen-garden.mp3
- Soft wind, distant birds, gentle stream
- Frequency: 200Hz-8kHz
- Volume: -24dB

## 29. ambient-cozy-interior.mp3
- Fireplace crackle, rain on windows
- Frequency: 100Hz-6kHz
- Volume: -24dB

## 30. ambient-focused-calm.mp3
- Minimal pad drone, no natural elements
- Frequency: 80Hz-4kHz
- Volume: -30dB

## 31. ambient-night-mode.mp3
- Very quiet, lower frequencies only
- Frequency: 80Hz-2kHz
- Volume: -36dB

---

# Technical Requirements

## File Format

| Deliverable | Format | Sample Rate | Bit Depth/Rate |
|-------------|--------|-------------|----------------|
| Primary | MP3 | 44.1kHz | 192kbps |
| Source | WAV | 48kHz | 24-bit |

## Naming Convention

```
ferni-[category]-[name].mp3

Examples:
ferni-system-startup.mp3
ferni-celebration-small.mp3
ferni-handoff-to-maya.mp3
```

## Delivery Structure

```
/ferni-sounds-v1/
├── /mp3/                    # Delivery format
│   ├── ferni-system-startup.mp3
│   ├── ...
├── /wav/                    # Source files
│   ├── ferni-system-startup.wav
│   ├── ...
└── /stems/ (optional)       # Individual layers
    ├── startup-piano.wav
    ├── startup-breath.wav
    └── ...
```

---

# Budget Breakdown

| Category | Assets | Estimated Cost |
|----------|--------|----------------|
| P0 Critical | 6 | $1,200-1,500 |
| P1 Important | 10 | $1,000-1,500 |
| P2 Nice to Have | 9 | $800-1,200 |
| Ambient (optional) | 4 | $400-600 |
| **Total** | **29** | **$3,000-5,000** |

---

# Recommended Sound Designers

1. **Sixieme Son** — Brand audio specialists
2. **Made Music Studio** — Tech brand experience
3. **Antfood** — Warm, emotional sound design
4. **Freelance platforms:** Artlist, Musicbed

---

# Acceptance Criteria

Each sound must:
- [ ] Match specified duration (±10%)
- [ ] Meet peak level requirements
- [ ] Evoke specified emotional goal
- [ ] Work in both quiet and noisy environments
- [ ] Sound professional on phone speakers
- [ ] Feel cohesive with other Ferni sounds
- [ ] Not be startling or attention-demanding

---

# Contact

For questions about this brief:
- Reference: `brand/FERNI-SONIC-IDENTITY.md`
- Full specifications in brand documentation

---

**Ready for commissioning. Let's make Ferni sound as good as it feels. 🎵**

