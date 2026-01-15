# 🎬 Ferni Animation Demo Reel

> **A 90-second cinematic showcase of Ferni's emotional intelligence and animation quality.**

**Version**: 1.0.0  
**Created**: January 2026  
**Duration**: 90 seconds  
**Resolution**: 4K (3840x2160) @ 60fps

---

## Overview

This demo reel serves as:
1. **Brand showcase** - Demonstrates Ferni's character quality
2. **Technical reference** - Shows animation system capabilities
3. **Onboarding tool** - Introduces new team members to animation standards
4. **Marketing asset** - Can be used for external communication

### Tone & Style

- **Pixar-quality** emotional storytelling
- **Warm, intimate** cinematography
- **Subtle, grounded** animation (not cartoonish)
- **Music**: Soft piano, Ólafur Arnalds style

---

## Act Structure

```
Total Duration: 90 seconds

┌─────────────────────────────────────────────────────────┐
│ Act 1: Awakening │ Act 2: Range │ Act 3: Listening │
│     (0-15s)      │   (15-35s)   │     (35-50s)     │
├─────────────────────────────────────────────────────────┤
│ Act 4: Speaking │ Act 5: Team │ Act 6: Celebration │
│    (50-65s)     │  (65-80s)   │      (80-90s)      │
└─────────────────────────────────────────────────────────┘
```

---

## Act 1: Awakening (0-15s)

**Theme**: Birth of presence - Ferni comes to life

### Shot 1.1: Darkness (0-3s)

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│              (black screen)             │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Pure black
- **Audio**: Silence → Soft ambient pad fades in
- **Duration**: 3 seconds
- **Text**: None

### Shot 1.2: First Glow (3-7s)

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                  ✨                      │
│            (tiny glow point)            │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Single point of sage-green light appears center
- **Animation**: 
  - 0-1s: Glow appears (ease-out)
  - 1-3s: Glow expands slowly
  - 3-4s: Glow pulses (breathing begins)
- **Audio**: Single soft piano note (C4)
- **Duration**: 4 seconds

### Shot 1.3: Form Emerges (7-12s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱  ✨✨   ╲                 │
│            │          │                 │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Ferni's form materializes from the glow
- **Animation**:
  - Body fades in (0.5s)
  - Ring appears behind (stagger 0.3s)
  - Eyes appear (stagger 0.5s)
- **Audio**: Chord progression begins (Cmaj7)
- **Duration**: 5 seconds

### Shot 1.4: First Breath (12-15s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱         ╲                 │
│            │   ⌒ ⌒    │  ← Eyes open   │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Ferni takes first breath, eyes open
- **Animation**:
  - Full breath cycle (inhale → hold → exhale)
  - Eyes open with lid animation
  - Slight curious tilt
- **Audio**: Breath sound texture + music continues
- **Duration**: 3 seconds

**Text overlay** (fade in at 14s):
> *"Finally, someone who actually listens."*

---

## Act 2: Emotional Range (15-35s)

**Theme**: Demonstrating the full spectrum of Ferni's expressions

### Shot 2.1: Expression Montage (15-35s)

Rapid but smooth transitions through expressions:

| Time | Expression | Trigger Text (on screen) | Animation Notes |
|------|------------|-------------------------|-----------------|
| 15-17s | Curious | "Tell me more..." | Head tilt, eyes widen |
| 17-19s | Happy | "That's wonderful!" | Eyes curve up, glow brightens |
| 19-21s | Concerned | "That sounds hard." | Brow furrow, forward lean |
| 21-23s | Thinking | "Let me consider..." | Eyes drift up, glow dims |
| 23-25s | Surprised | "Oh!" | Eyes pop wide, slight bounce |
| 25-27s | Empathetic | "I understand." | Soft eyes, warm glow |
| 27-29s | Excited | "You did it!" | Big bounce, bright glow |
| 29-31s | Warm | "I'm here." | Gentle pulse, soft expression |
| 31-33s | Sleepy | "Late night?" | Heavy lids, dim glow |
| 33-35s | Neutral | (back to center) | Settle to default |

**Transition style**: Each expression morphs into the next (no cuts)

**Animation details**:
- Lid paths morph (SVG path interpolation)
- Glow color/intensity shifts
- Body tilts and settles
- Each expression holds for ~0.5s at peak

**Audio**: Music builds slightly, each expression has subtle sound accent

---

## Act 3: Active Listening (35-50s)

**Theme**: Demonstrating real-time empathetic feedback

### Shot 3.1: Listening State (35-40s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱         ╲                 │
│            │   ⌒ ⌒    │                 │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                                         │
│  Audio waveform visualization below     │
│  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                        │
└─────────────────────────────────────────┘
```

- **Visual**: Ferni in listening posture, audio waveform shows "user speaking"
- **Animation**:
  - Micro-nods during pauses (180ms, 1.5px)
  - Breathing syncs with speech rhythm
  - Forward lean at emphasis points
- **Audio**: Muffled "user voice" sample (unintelligible but emotional)
- **Duration**: 5 seconds

### Shot 3.2: Micro-Nod Detail (40-43s)

```
SLOW MOTION HIGHLIGHT

Frame 1 (0ms):     Frame 2 (90ms):    Frame 3 (180ms):
   ╭───────╮          ╭───────╮          ╭───────╮
  │  ⌒ ⌒   │         │  ⌒ ⌒   │ ↓       │  ⌒ ⌒   │
   ╰───────╯          ╰───────╯          ╰───────╯
```

- **Visual**: Slow-motion replay of micro-nod (at 25% speed)
- **Animation**: Shows the subtle 1.5px movement
- **Audio**: Slowed, reverbed music
- **Text overlay**: "Micro-nod: 180ms, 1.5px - builds trust unconsciously"
- **Duration**: 3 seconds

### Shot 3.3: Anticipatory Response (43-47s)

```
┌─────────────────────────────────────────┐
│                                         │
│  User: "I've been thinking about..."    │
│                                         │
│              ╭───────╮                  │
│             ╱         ╲                 │
│            │   ⌒ ⌒    │  ← Expression   │
│             ╲        ╱     changes      │
│              ╰──────╯      BEFORE user  │
│                            finishes     │
└─────────────────────────────────────────┘
```

- **Visual**: User text appears, Ferni shifts to "contemplative" before user finishes
- **Animation**: Expression change starts at "about..."
- **Audio**: User voice + subtle emotion detection sound
- **Text overlay**: "Anticipation: Showing emotion before user finishes"
- **Duration**: 4 seconds

### Shot 3.4: Breath Sync (47-50s)

```
┌─────────────────────────────────────────┐
│                                         │
│  ╭───────╮              ╭───────╮       │
│ │ ⌒ ⌒   │     sync    │  User │       │
│  ╰───────╯    ←→        breathing      │
│                                         │
│  Ferni breath          User breath     │
│  ▁▂▃▄▃▂▁               ▁▂▃▄▃▂▁         │
└─────────────────────────────────────────┘
```

- **Visual**: Split screen showing Ferni's breathing syncing with user
- **Animation**: Breath curves align over 3 seconds
- **Audio**: Ambient breath textures
- **Text overlay**: "Breath Sync: Neural mirroring builds connection"
- **Duration**: 3 seconds

---

## Act 4: Speaking System (50-65s)

**Theme**: How Ferni communicates without a mouth

### Shot 4.1: Speaking Activation (50-55s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱  ~~~    ╲  ← Body pulses  │
│            │   ⌒ ⌒    │                 │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                 ∿∿∿     ← Halo waves    │
│                                         │
│  Ferni: "I hear you. That matters."     │
└─────────────────────────────────────────┘
```

- **Visual**: Ferni speaking with body, halo, and lid animation
- **Animation**:
  - Body: Bass-speaker style pulse (scaleY 1.08, scaleX 0.97)
  - Halo: Expanding sound wave rings
  - Lids: Subtle articulation
- **Audio**: Ferni's actual voice (sample)
- **Duration**: 5 seconds

### Shot 4.2: Three-Layer System Diagram (55-60s)

```
┌─────────────────────────────────────────┐
│                                         │
│  BODY (Primary)     ← "Bass speaker"    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓                         │
│                                         │
│  HALO (Ambient)     ← "Sound waves"     │
│  ░░░░░░░░░░░░░                         │
│                                         │
│  LIDS (Detail)      ← "Articulation"    │
│  ▪▪▪▪▪▪▪▪▪▪▪▪▪                         │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Diagram showing the three layers, each animating
- **Animation**: Each layer pulses in sync with explanation
- **Audio**: Voice-over or text explaining each layer
- **Duration**: 5 seconds

### Shot 4.3: Emotional Speaking (60-65s)

Quick montage showing speaking with different emotions:

| Time | Emotion | Speaking Style |
|------|---------|---------------|
| 60-62s | Excited | Faster pulses, brighter halo |
| 62-63s | Calm | Slower, gentler movement |
| 63-65s | Concerned | Smaller movements, warmer glow |

- **Audio**: Voice samples matching each emotion
- **Duration**: 5 seconds

---

## Act 5: The Team (65-80s)

**Theme**: Introducing the persona family and handoffs

### Shot 5.1: Team Assembly (65-72s)

```
┌─────────────────────────────────────────┐
│                                         │
│   Peter    Alex    Ferni    Maya    Jordan
│    🟦       🟪      🟢       🟫       🟧  │
│                                         │
│  "Six perspectives. One conversation."  │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: All personas appear one by one, settling into formation
- **Animation**:
  - Each persona enters with their signature animation style
  - Ferni in center, others orbit or line up
  - Each glows with their unique color
- **Audio**: Each entrance has their sonic signature
- **Duration**: 7 seconds

### Shot 5.2: Handoff Demonstration (72-78s)

```
┌─────────────────────────────────────────┐
│                                         │
│   Ferni: "Peter would love this..."     │
│                                         │
│     ╭───╮      ~~~>      ╭───╮         │
│    │ 🟢 │    handoff    │ 🟦 │         │
│     ╰───╯                ╰───╯         │
│                                         │
│   Peter: "Oh, fascinating question!"    │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Smooth handoff transition from Ferni to Peter
- **Animation**:
  - Ferni glows, gestures toward Peter
  - Light "travels" between them
  - Peter activates, becomes primary
  - Colors blend during transition
- **Audio**: Handoff sound + Peter's voice
- **Duration**: 6 seconds

### Shot 5.3: Team Harmony (78-80s)

```
┌─────────────────────────────────────────┐
│                                         │
│         All personas breathing          │
│              in sync                    │
│                                         │
│       🟦   🟪   🟢   🟫   🟧            │
│       ∿    ∿    ∿    ∿    ∿             │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: All personas in frame, breathing in harmony
- **Audio**: Ambient chord with all persona tones
- **Duration**: 2 seconds

---

## Act 6: Celebration (80-90s)

**Theme**: Demonstrating celebration and closing with warmth

### Shot 6.1: Small Win (80-83s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱   ✨    ╲                 │
│            │   ◠ ◠    │  ← Happy eyes   │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                 🎊                       │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Small celebration - sparkles, bright eyes
- **Animation**: Gentle bounce, sparkle effects
- **Audio**: celebration-small.mp3
- **Duration**: 3 seconds

### Shot 6.2: Big Win / Milestone (83-87s)

```
┌─────────────────────────────────────────┐
│              🎉    🎊    ✨              │
│         ✨              🎉              │
│              ╭───────╮                  │
│     🎊      ╱   !!!   ╲      ✨        │
│            │   ◠ ◠    │                 │
│             ╲        ╱                  │
│       ✨     ╰──────╯     🎉           │
│                 🎊                       │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Full celebration - confetti, joyful expression
- **Animation**: 
  - Big bounce (avatarBounce keyframe)
  - Confetti particle system
  - Glow at maximum
- **Audio**: celebration-big.mp3
- **Duration**: 4 seconds

### Shot 6.3: Closing / Brand (87-90s)

```
┌─────────────────────────────────────────┐
│                                         │
│              ╭───────╮                  │
│             ╱         ╲                 │
│            │   ⌒ ⌒    │                 │
│             ╲        ╱                  │
│              ╰──────╯                   │
│                                         │
│              f e r n i                  │
│                                         │
│    "Better than human."                 │
│                                         │
└─────────────────────────────────────────┘
```

- **Visual**: Ferni settles to warm neutral, logo fades in below
- **Animation**: Gentle breathing continues, peaceful settle
- **Audio**: Music resolves to warm chord, fades to silence
- **Duration**: 3 seconds

---

## Technical Specifications

### Render Settings

| Setting | Value |
|---------|-------|
| Resolution | 3840x2160 (4K) |
| Frame Rate | 60fps |
| Color Space | sRGB |
| Format | MP4 (H.265) + WebM (VP9) |
| Bitrate | 50 Mbps |

### Animation Tooling

| Tool | Purpose |
|------|---------|
| After Effects | Primary animation |
| Lottie | Export for web |
| GSAP | Web implementation reference |
| Figma | Storyboard source |

### Sound Design

| Element | Source |
|---------|--------|
| Music | Original composition (Ólafur Arnalds style) |
| UI Sounds | From `assets/sounds/` |
| Voice | TTS samples or voice actor |

---

## Production Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Storyboard Approval | 3 days | This document approved |
| Asset Preparation | 5 days | All SVGs, audio ready |
| Animation (rough) | 7 days | First pass at 50% quality |
| Animation (polish) | 7 days | Final quality |
| Sound Design | 3 days | Full audio mix |
| Export & Review | 2 days | Multiple formats |

**Total**: ~4 weeks

---

## Variations to Create

### Full Version (90s)
- Marketing, onboarding, presentations

### Short Version (30s)
- Social media, ads
- Acts 1 + 2 only (awakening + expressions)

### Loop Version (15s)
- Website hero background
- Breathing + subtle expressions only

### GIF Exports
- Individual expressions for documentation
- Celebration moments for Slack/Discord

---

## Success Criteria

- [ ] Every frame could be a screenshot in marketing
- [ ] Animation feels alive, not robotic
- [ ] Emotions are clearly readable
- [ ] Timing feels natural (not rushed or slow)
- [ ] Audio enhances without distracting
- [ ] Brand identity is unmistakable

---

**© 2026 Ferni. Animation demo reel specification.**

*"The goal isn't to show what Ferni can do. It's to make people feel what Ferni is."*
