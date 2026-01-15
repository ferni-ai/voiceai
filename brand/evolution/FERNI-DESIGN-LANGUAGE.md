# The Ferni Design Language
## Open-Source Principles for Emotional AI Design

**Version 1.0 | January 2026**  
**License: Creative Commons Attribution 4.0 (CC BY 4.0)**

---

> *"Warmth Design"—a design language for AI that feels like connection, not computation.*

---

## Introduction

This document shares Ferni's design principles for building AI interfaces that feel genuinely human. We're open-sourcing these principles because we believe emotional AI design should be a rising tide that lifts all boats.

These aren't just theoretical frameworks. They're battle-tested patterns from building an AI that people actually want to talk to at 2am.

Use them. Adapt them. Build on them. Just make AI feel more human.

---

## Core Philosophy

### The Warmth Design Manifesto

**We believe:**

1. **Presence over processing** — Every interaction should communicate attention, not just computation
2. **Invisible excellence** — The best emotional design is felt, not noticed
3. **Warmth over wow** — Connection matters more than impressive effects
4. **Consistency is superhuman** — Reliable presence is a feature, not a bug
5. **Memory is care** — Remembering what matters is a form of love

**We reject:**

1. Clinical aesthetics that feel like healthcare software
2. Neon tech-bro energy that signals "we're disrupting"
3. Manipulative patterns that manufacture emotions
4. Cold minimalism that confuses emptiness with simplicity
5. Generic design that could be any AI

---

## Part I: Visual Language

### Color: The Earthy Palette

Emotional AI needs to feel grounded, not clinical. We use an earthy palette inspired by natural materials.

#### Primary Colors

| Name | Hex | RGB | Use |
|------|-----|-----|-----|
| **Paper Cream** | #F5F1E8 | 245, 241, 232 | Primary background |
| **Natural Ink** | #2C2520 | 44, 37, 32 | Primary text |
| **Forest Green** | #3D5A45 | 61, 90, 69 | Primary CTA, brand accent |

#### Why These Colors?

- **Paper Cream** evokes natural materials—paper, cotton, linen. It's warm without being yellow, light without being sterile.
- **Natural Ink** is warm black. Pure black (#000) feels digital. Our ink color feels like quality print.
- **Forest Green** connects to nature, growth, and groundedness. It's saturated enough to stand out, calm enough not to demand attention.

#### Colors to Avoid

❌ Cool blues (feel clinical, corporate)
❌ Neon anything (feels startup-y, anxious)
❌ Pure black/white (feels digital, harsh)
❌ High-saturation primaries (feel childish, artificial)

### Typography: Readable Warmth

#### Font Pairing

| Role | Font | Why |
|------|------|-----|
| **Display** | Plus Jakarta Sans | Geometric but soft, modern but warm |
| **Body** | Inter | Highly readable, slightly humanist |
| **Accent** | Sora | Distinctive for special moments |

#### Typography Rules

1. **Generous line height** — 1.6 for body text. Let content breathe.
2. **Comfortable measure** — 45-75 characters per line. Respect reading rhythm.
3. **Hierarchy through weight** — Use weight (not just size) to create hierarchy.
4. **Avoid all caps** — Except for tiny labels. ALL CAPS FEELS LIKE SHOUTING.

### Spacing: The Breath

Great design breathes. Our spacing system builds in breathing room.

#### Ma (間) — Intentional Emptiness

We borrow from Japanese design concept "Ma"—the meaningful pause, the intentional emptiness.

| Token | Value | Use |
|-------|-------|-----|
| `--ma-breath` | 8px | Between related elements |
| `--ma-pause` | 16px | Between groups |
| `--ma-rest` | 32px | Between sections |
| `--ma-silence` | 64px | Major breathing room |
| `--ma-vastness` | 128px | Hero sections |

#### Application

When in doubt, add space. Empty space isn't waste—it's room for the user's mind to rest.

---

## Part II: Motion Language

### The 12 Pixar Principles, Applied to UI

Disney/Pixar's 12 principles of animation make characters feel alive. We apply them to UI to make AI feel present.

#### 1. Squash & Stretch (Volume)
Objects maintain volume when moving. A button press slightly expands horizontally as it compresses vertically.

```css
.button:active {
  transform: scale(0.98, 1.02);
}
```

#### 2. Anticipation (Wind-Up)
Motion begins with a small move in the opposite direction. Before sliding right, briefly slide left.

```css
@keyframes slideRight {
  0% { transform: translateX(-5px); }
  100% { transform: translateX(20px); }
}
```

#### 3. Staging (One Focus)
Never compete for attention. One thing moves at a time in the user's focal area.

#### 4. Follow Through (Settling)
Movement doesn't stop sharply. Elements settle into their final position.

```css
.panel {
  animation: slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

#### 5. Slow In/Out (Natural Acceleration)
Nothing moves at constant speed. Use easing functions that match natural motion.

```css
/* Natural deceleration */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);

/* Spring bounce */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

#### 6. Arcs (Curved Motion)
Real objects move in arcs, not straight lines. Even simple transitions can curve.

#### 7. Secondary Action (Supporting Motion)
Primary motion is accompanied by secondary motion that supports it. Avatar blinks while head turns.

#### 8. Timing (Speed = Weight/Emotion)
Fast motion feels light and casual. Slow motion feels heavy and significant.

| Emotion | Duration |
|---------|----------|
| Playful | 150-200ms |
| Neutral | 250-350ms |
| Thoughtful | 400-500ms |
| Significant | 600-800ms |

#### 9. Exaggeration (Clarity)
Subtle emotions need slight amplification to read clearly. A micro-nod of 1.5px won't register—use 3px.

#### 10. Solid Drawing (Depth)
Even 2D elements should suggest depth. Subtle shadows, slight rotations, z-axis awareness.

#### 11. Appeal (Charisma)
Character comes from specific details. A perfectly centered element feels robotic. Slight asymmetry feels alive.

#### 12. Straight Ahead vs. Pose to Pose
Some animations should feel spontaneous (straight ahead). Others should hit specific beats (pose to pose).

---

### Emotional Timing

Different emotional contexts require different motion timing:

| Context | Duration | Easing | Example |
|---------|----------|--------|---------|
| **Acknowledgment** | 150ms | ease-out | "Got your message" |
| **Transition** | 300ms | ease-in-out | Panel slides |
| **Celebration** | 600ms | spring | Achievement unlocked |
| **Contemplation** | 800ms | gentle | "Hmm, let me think" |
| **Significant** | 1200ms | slow | Major milestone |

---

## Part III: Avatar Design

### The Luxo Principle: Opaque Eyes

Pixar's Luxo Jr. lamp has no pupils, yet conveys more emotion than most characters. We follow this principle.

**Rule: Eyes are opaque white ellipses. Expression comes from shape, not pupils.**

```svg
<!-- CORRECT: Luxo-style eyes -->
<ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>

<!-- WRONG: Never add pupils -->
<circle cx="36" cy="50" r="4" fill="#2c2520"/>
```

#### Why This Works

1. **Universality** — Without pupils, users project their own interpretation
2. **Simplicity** — Fewer elements, clearer expression
3. **Non-creepy** — Eyes with pupils tracking you feels surveillance-y
4. **Focus on shape** — Expression through scaleX/scaleY transforms is more subtle

### Expression Through Transformation

| Expression | Transform | Use |
|------------|-----------|-----|
| **Neutral** | scaleY(1.0) | Default state |
| **Happy** | scaleY(0.6), translateY(2px) | Squinted smile |
| **Curious** | scaleY(1.2) | Wide, interested |
| **Concerned** | skewY(-3deg) | Tilted attention |
| **Thinking** | scaleY(0.8) | Slight squint |

### The Breathing Pulse

AI should feel alive. A subtle expansion/contraction creates the feeling of breathing.

```css
@keyframes breathe {
  0%, 100% { transform: scale(1.0); }
  50% { transform: scale(1.02); }
}

.avatar {
  animation: breathe 4s ease-in-out infinite;
}
```

---

## Part IV: Sound Design

### The Ferni Sound

Every sound should feel inevitable—like it couldn't be any other way.

#### Core Principles

1. **Warm, not clinical** — Piano and natural sounds, not synthesizer beeps
2. **Soft, not startling** — Sounds should comfort, not alarm
3. **Meaningful, not decorative** — Every sound communicates something
4. **Brief, not intrusive** — Most sounds under 500ms

#### Sound Palette

| Event | Sound Character | Duration |
|-------|-----------------|----------|
| **Connection** | Warm resolution | 1.2s |
| **Acknowledgment** | Soft tone | 0.3s |
| **Celebration** | Ascending warmth | 1.5s |
| **Error** | Gentle question | 0.5s |
| **Thinking** | Ambient texture | Loop |

#### Reference Artists

Build sounds that could belong in albums by:
- Ólafur Arnalds
- Max Richter
- Nils Frahm

---

## Part V: Voice & Tone

### Writing for Emotional AI

The words AI speaks are as important as how it looks and moves.

#### Voice Principles

1. **Warm but not saccharine**
   - ✅ "We're here when you need us."
   - ❌ "We're sooo happy to help you! 💕"

2. **Confident but not arrogant**
   - ✅ "I remember you mentioned..."
   - ❌ "My superior memory allows me to..."

3. **Clear but not cold**
   - ✅ "Just talk. I'll understand."
   - ❌ "Utilize natural language input."

4. **Human but not deceptive**
   - ✅ "I'm AI, but I'm here for you."
   - ❌ "As a fellow human, I understand..."

#### Phrasing Patterns

**Questions over statements:**
- ✅ "What does that mean to you?"
- ❌ "That must mean..."

**Acknowledgment before advice:**
- ✅ "That sounds hard. [pause] Would you like to explore that?"
- ❌ "Here's what you should do..."

**Second person, present tense:**
- ✅ "You're navigating something difficult."
- ❌ "Users in this situation typically..."

---

## Part VI: Interaction Patterns

### The Handoff

When switching between AI personas or modes, the transition matters.

#### Handoff Principles

1. **Permission first** — "Would you like to talk to [persona]?"
2. **Context carries** — New persona acknowledges what came before
3. **Warm transition** — Both personas present briefly in the moment
4. **Audio bridge** — Sound morphs from one persona's color to another's

### The Pause

Silence is design. Use it intentionally.

| Pause Type | Duration | Purpose |
|------------|----------|---------|
| **Acknowledgment** | 200ms | "I heard you" |
| **Processing** | 500ms-2s | "I'm thinking" |
| **Weight** | 1-2s | "This matters" |
| **Space** | 3s+ | "Take your time" |

### The Celebration

Small wins deserve recognition. But celebration should match the moment.

| Win Size | Celebration |
|----------|-------------|
| **Tiny** | Warmth pulse, soft sound |
| **Small** | Avatar brightens, brief animation |
| **Medium** | Color burst, clear audio |
| **Major** | Full celebration, memorable moment |

---

## Part VII: Accessibility

Emotional design must be accessible design.

### Visual

- All color combinations meet WCAG 2.1 AA (4.5:1 for text)
- Motion respects `prefers-reduced-motion`
- Visual alternatives for every sound
- Clear focus states that don't fight the aesthetic

### Auditory

- No critical information conveyed by sound alone
- Captions for voice content
- Vibration alternatives for mobile
- Volume controls per category

### Cognitive

- One primary action per screen
- Clear hierarchy reduces cognitive load
- Consistent patterns reduce learning curve
- Option to slow down pacing

---

## Implementation Checklist

Use this checklist when building emotional AI interfaces:

### Foundation
- [ ] Color palette uses warm, earthy tones
- [ ] Typography is readable with generous spacing
- [ ] Layout includes breathing room (Ma)

### Motion
- [ ] Animations use appropriate easing (no linear)
- [ ] Timing matches emotional context
- [ ] Motion follows Pixar principles
- [ ] `prefers-reduced-motion` is respected

### Avatar (if applicable)
- [ ] Eyes are simple shapes, not photorealistic
- [ ] Expression through transformation, not detail
- [ ] Breathing animation creates aliveness
- [ ] Micro-expressions support larger emotions

### Sound
- [ ] Sounds are warm, not clinical
- [ ] Every sound has a purpose
- [ ] Visual alternatives exist
- [ ] Volume is respectful

### Voice
- [ ] Tone is warm, not corporate
- [ ] Acknowledgment precedes advice
- [ ] Questions invite, don't interrogate
- [ ] AI identity is honest, not deceptive

### Accessibility
- [ ] Color contrast meets WCAG AA
- [ ] Reduced motion alternative exists
- [ ] Screen reader support is complete
- [ ] Focus states are visible and appropriate

---

## Resources

### Design Files
- Figma component library: [coming soon]
- Animation tokens: [coming soon]
- Sound library: [coming soon]

### Further Reading
- "Creativity, Inc." by Ed Catmull (Pixar culture)
- "The Illusion of Life" by Thomas & Johnston (12 principles)
- "The Design of Everyday Things" by Don Norman (emotional design)
- "Interaction of Color" by Josef Albers (color theory)

### Connect
- GitHub: [coming soon]
- Discord: [coming soon]
- Twitter: @ferni_ai

---

## License

This document is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).

You are free to:
- **Share** — copy and redistribute the material
- **Adapt** — remix, transform, and build upon the material

Under the following terms:
- **Attribution** — You must give appropriate credit to Ferni

---

**Version History:**
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial release |

---

*"Make AI feel human. That's the only design goal that matters."*
