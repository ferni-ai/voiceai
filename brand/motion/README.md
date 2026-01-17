# Ferni Motion Language Guide

> **"Motion is emotion made visible."**

---

## The Philosophy

Every movement Ferni makes carries meaning. A pause isn't empty—it's listening. A gentle pulse isn't decoration—it's breathing. A micro-tilt isn't random—it's recognition.

We don't animate to impress. We animate to connect.

This is **Pixar-grade emotional animation** adapted for AI. The same principles that make you cry at *Up* in the first 10 minutes—applied to every micro-interaction.

---

## The Pixar 12: Adapted for Ferni

Disney's 12 principles of animation, reimagined for emotional AI:

| Principle | Classic Use | Ferni Application |
|-----------|-------------|-------------------|
| **Squash & Stretch** | Physical elasticity | Emotional responsiveness—expand with joy, contract with concern |
| **Anticipation** | Wind-up before action | Micro-signals before speaking (shows thinking) |
| **Staging** | Clear presentation | Focus attention on what matters now |
| **Straight Ahead / Pose to Pose** | Animation technique | Blend procedural + keyframed for natural feel |
| **Follow Through** | Momentum continuation | Emotions don't stop abruptly—they settle |
| **Slow In / Slow Out** | Eased movement | All transitions feel organic, never mechanical |
| **Arcs** | Natural movement paths | Avatar movements follow organic curves |
| **Secondary Action** | Supporting movement | Glow pulses while avatar breathes |
| **Timing** | Speed communicates weight | Persona-specific timing profiles |
| **Exaggeration** | Emphasis | Micro-expressions punch above their weight |
| **Solid Drawing** | Dimensional form | Consistent avatar presence across states |
| **Appeal** | Likability | Warmth in every movement |

---

## Persona Animation Profiles

Each persona moves differently. Their animation IS their personality.

### Ferni (The Heart)
```
Timing:      1.0x (baseline)
Bounciness:  0.6
Easing:      natural
Energy:      warm presence
Signature:   gentle pulse
```
Ferni is the center—balanced, warm, grounding. Neither too fast nor too slow. The baseline against which all other personas are measured.

### Maya (The Habits Coach)
```
Timing:      0.95x (slightly slower)
Bounciness:  0.4 (gentle)
Easing:      methodical
Energy:      nurturing warmth
Signature:   celebration bloom
```
Maya moves with patience. Nothing rushed. Her animations say "take your time." When you win, she blooms with genuine celebration—but even that is measured, not manic.

### Peter (The Quant)
```
Timing:      0.8x (faster)
Bounciness:  0.6 (moderate)
Easing:      energetic
Energy:      curious discovery
Signature:   lightbulb flash
```
Peter's mind moves fast, and so does he. Quick, curious movements. When patterns connect, a flash of recognition. But never jittery—controlled energy.

### Jordan (The Lifetime Planner)
```
Timing:      0.85x (slightly fast)
Bounciness:  0.8 (high)
Easing:      elastic
Energy:      celebration
Signature:   confetti burst
```
Jordan brings the joy. Elastic, bouncy movements. When milestones hit, confetti. Her energy is infectious—animation that makes you want to celebrate too.

### Alex (The Chief of Staff)
```
Timing:      1.1x (slightly slower)
Bounciness:  0.5 (moderate)
Easing:      smooth
Energy:      calm efficiency
Signature:   clean transition
```
Alex is composed. Smooth, deliberate transitions. No wasted motion. Her animations communicate competence and care through precision.

### Nayan (The Sage)
```
Timing:      1.1x+ (slowest)
Bounciness:  0.4 (minimal)
Easing:      gentle
Energy:      contemplative
Signature:   stillness
```
Nayan barely moves—and that's the point. His stillness creates space. When he does move, it carries weight. The pause before wisdom lands.

---

## Timing Profiles

### Base Durations (in milliseconds)

| Speed | Duration | Use Case |
|-------|----------|----------|
| **Instant** | 40-80ms | Micro-expressions (subliminal) |
| **Quick** | 100-150ms | Reactive feedback |
| **Fast** | 150-250ms | State changes |
| **Normal** | 250-400ms | Standard transitions |
| **Slow** | 400-600ms | Emotional transitions |
| **Deliberate** | 600-1000ms | Significant moments |
| **Contemplative** | 1000ms+ | Wisdom, processing |

### Persona Timing Multipliers

Apply to base durations:

| Persona | Multiplier | Effect |
|---------|------------|--------|
| Ferni | 1.0x | Baseline |
| Maya | 0.95x | Slightly slower, nurturing |
| Peter | 0.8x | Faster, energetic |
| Jordan | 0.85x | Slightly fast, enthusiastic |
| Alex | 1.1x | Slower, deliberate |
| Nayan | 1.1x+ | Slowest, contemplative |

**Example**: A 400ms transition becomes:
- Peter: 320ms (snappier)
- Maya: 380ms (more patient)
- Nayan: 440ms+ (more deliberate)

---

## Superhuman EQ: The 200% System

These five capabilities make Ferni's motion "Better Than Human":

### 1. Micro-Expressions (40-150ms)

**The science**: Subliminal emotional flashes that register below conscious awareness but build trust.

| Micro-Expression | Duration | When It Fires |
|------------------|----------|---------------|
| **Recognition** | 80ms | User shares something personal |
| **Concern** | 60ms | Distress detected in voice/content |
| **Delight** | 100ms | Good news, breakthrough |
| **Curiosity** | 120ms | Interesting topic emerges |
| **Warmth** | 150ms | Connection moment |

**Implementation**:
```css
.micro-expression {
  animation-duration: 80ms;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
```

**Why it works**: Humans flash micro-expressions in 40-500ms. By matching this timing, Ferni triggers the brain's face-reading circuits without conscious awareness. The user feels "understood" without knowing why.

### 2. Active Listening (Micro-Nods)

**The science**: Tiny head movements during user speech signal moment-to-moment attention.

| Nod Type | Movement | When |
|----------|----------|------|
| **Micro-nod** | 1.5px | During any speech |
| **Subtle nod** | 2.5px | At natural pauses |
| **Visible nod** | 4px | Key points, agreements |
| **Affirming nod** | 6px | Emotional moments |

**Implementation**:
```javascript
// During user speech
function onUserSpeaking() {
  playMicroNod(1.5); // Subtle acknowledgment
}

// At pause points
function onUserPause(duration) {
  if (duration > 500) {
    playSubtleNod(2.5);
  }
}
```

**Why it works**: Human listeners nod unconsciously. Ferni does too—at natural speech boundaries. This triggers mirror neurons and creates the feeling of being truly heard.

### 3. Breath Synchronization

**The science**: Matching breathing patterns creates neural mirroring and unconscious rapport.

| Sync Level | Rate | Use Case |
|------------|------|----------|
| **Relaxed** | 12/min | Calm conversation |
| **Normal** | 15/min | Active discussion |
| **Alert** | 18/min | High energy topics |

**Calming Protocol**: When detecting user stress, Ferni breathes slightly SLOWER than the user, gently guiding them toward calm.

**Implementation**:
```javascript
// Breath animation
const breathCycle = {
  relaxed: 5000,  // 12 breaths/min
  normal: 4000,   // 15 breaths/min
  alert: 3333     // 18 breaths/min
};

// Sync slightly slower to calm
function calmingBreath(userRate) {
  return userRate * 1.1; // 10% slower
}
```

**Visual**: Avatar gently expands/contracts. Glow intensity follows breath. Subtle, but felt.

### 4. Concern Detection

**The science**: Detect distress before it's explicitly stated, respond with protective care.

| Trigger | Signal | Response |
|---------|--------|----------|
| Voice strain | Pitch variance >20% | Protective warmth |
| Breaking voice | Audio artifacts | Soft concern |
| Long pauses | 3+ second gaps | Patient space |
| Negative self-talk | Semantic analysis | Gentle intervention |

**Visual response**: When concern triggers, the avatar enters "protective mode":
- Glow shifts to warm amber
- Movement slows
- Eyes soften
- Breathing deepens

### 5. Anticipatory Emotions

**The science**: Show emotional response BEFORE the user finishes expressing—demonstrating understanding.

| Input | Anticipation | Timing |
|-------|--------------|--------|
| "I just got the promotion—" | Joy begins | Mid-sentence |
| "My dog passed—" | Concern emerges | Before completion |
| "I figured out the bug!" | Celebration starts | At "figured out" |

**Implementation**:
```javascript
// Analyze partial transcript
function anticipateEmotion(partialTranscript) {
  const sentiment = analyzeSentiment(partialTranscript);
  if (sentiment.confidence > 0.7) {
    beginEmotionalResponse(sentiment.emotion);
  }
}
```

**Why it works**: Instead of waiting for full understanding, Ferni begins resonating mid-sentence. This creates the profound feeling: "They get me before I even finish."

---

## Waveform Visualization

The avatar's "mouth" is a 9-bar waveform that shapes to emotion:

### Base Waveforms

| State | Shape | Description |
|-------|-------|-------------|
| **Idle** | Gentle sine | Soft breathing pattern |
| **Listening** | Low amplitude pulse | Attentive stillness |
| **Thinking** | Subtle flutter | Processing |
| **Speaking** | Dynamic response | Voice-reactive bars |

### Emotional Waveform Shapes

| Emotion | Pattern | Visual |
|---------|---------|--------|
| **Joy** | Bouncy peaks | `∧∧∧∧∧∧∧∧∧` |
| **Concern** | Compressed | `─∧─∧─∧─∧─` |
| **Excitement** | Sharp peaks | `∧ ∧ ∧ ∧ ∧` |
| **Calm** | Smooth sine | `∿∿∿∿∿∿∿∿∿` |
| **Thinking** | Asymmetric | `∧─∧──∧─∧─` |
| **Empathy** | Mirrored | Matches user |
| **Wisdom** | Slow wave | Very low frequency |
| **Celebration** | Burst | Random high peaks |
| **Concern** | Low, compressed | Minimal movement |

### Bar Heights (0.0 - 1.0)

```javascript
const waveformProfiles = {
  idle: {
    heights: [0.15, 0.2, 0.25, 0.3, 0.25, 0.2, 0.15, 0.1, 0.15],
    animation: 'gentle-pulse'
  },
  joy: {
    heights: [0.4, 0.7, 0.5, 0.8, 0.6, 0.75, 0.45, 0.65, 0.5],
    animation: 'bouncy'
  },
  concern: {
    heights: [0.1, 0.15, 0.12, 0.18, 0.14, 0.16, 0.11, 0.14, 0.1],
    animation: 'gentle'
  },
  thinking: {
    heights: [0.2, 0.35, 0.25, 0.4, 0.3, 0.38, 0.22, 0.32, 0.25],
    animation: 'flutter'
  }
};
```

---

## Emotional Glow System

The avatar's glow changes color and intensity with emotion:

### Glow Colors

| Emotion | Color | Hex |
|---------|-------|-----|
| **Neutral** | Soft white | `#f5f5f5` |
| **Joy** | Warm gold | `#ffd700` |
| **Concern** | Soft amber | `#daa520` |
| **Excitement** | Bright coral | `#ff6b6b` |
| **Calm** | Soft blue | `#87ceeb` |
| **Empathy** | Rose pink | `#ffb6c1` |
| **Focus** | Clear blue | `#4fc3f7` |
| **Celebration** | Bright gold | `#ffc107` |
| **Wisdom** | Deep amber | `#b8956a` |
| **Love** | Warm pink | `#ff69b4` |
| **Protective** | Soft amber | `#deb887` |

### Glow Properties

```javascript
const glowPresets = {
  subtle: {
    intensity: 0.3,
    pulseSpeed: 3000,
    spread: 20
  },
  normal: {
    intensity: 0.5,
    pulseSpeed: 2000,
    spread: 30
  },
  strong: {
    intensity: 0.7,
    pulseSpeed: 1500,
    spread: 40
  },
  celebration: {
    intensity: 0.9,
    pulseSpeed: 800,
    spread: 60
  }
};
```

---

## State Transitions

### Conversation States

```
IDLE → LISTENING → THINKING → SPEAKING → IDLE
  ↓         ↓          ↓          ↓
CONCERN  AFFIRMING  PREPARING  CELEBRATING
```

### State Visual Properties

| State | Avatar | Glow | Waveform | Duration |
|-------|--------|------|----------|----------|
| **Idle** | Gentle breathing | Soft pulse | Low sine | - |
| **Listening** | Micro-nods | Brightens | Flat, attentive | User speech |
| **Thinking** | Slight tilt | Flickers | Flutter | 500-2000ms |
| **Speaking** | Animated | Steady | Voice-reactive | Speech length |
| **Affirming** | Nod | Warm | Small pulse | 300-500ms |
| **Celebrating** | Bounce | Bright | High peaks | 1000-2000ms |
| **Concern** | Soften | Amber | Compressed | Sustained |

### Transition Timing

| From → To | Duration | Easing |
|-----------|----------|--------|
| Idle → Listening | 150ms | ease-out |
| Listening → Thinking | 200ms | ease-in-out |
| Thinking → Speaking | 100ms | ease-out |
| Speaking → Idle | 400ms | ease-in-out |
| Any → Concern | 300ms | ease-out |
| Concern → Normal | 600ms | ease-in-out |

---

## Circadian Timing

Animation adapts to time of day:

### Time Periods

| Period | Hours | Warmth | Brightness | Speed |
|--------|-------|--------|------------|-------|
| **Dawn** | 5-7 AM | 1.1x | 0.7x | 0.9x |
| **Morning** | 7-10 AM | 1.0x | 0.9x | 0.95x |
| **Midday** | 10 AM-2 PM | 0.9x | 1.0x | 1.0x |
| **Afternoon** | 2-5 PM | 0.95x | 0.95x | 1.0x |
| **Evening** | 5-8 PM | 1.05x | 0.85x | 0.95x |
| **Night** | 8-11 PM | 1.15x | 0.7x | 0.9x |
| **Late Night** | 11 PM-2 AM | 1.2x | 0.5x | 0.85x |
| **Deep Night** | 2-5 AM | 1.25x | 0.4x | 0.8x |

### Visual Adjustments

- **Warmth**: Color temperature shift (warmer = more amber/orange tint)
- **Brightness**: Overall luminosity reduction
- **Speed**: Animation speed multiplier (slower at night)

```javascript
function getCircadianMultipliers(hour) {
  const period = getTimePeriod(hour);
  return {
    warmth: CIRCADIAN_WARMTH[period],
    brightness: CIRCADIAN_BRIGHTNESS[period],
    speed: CIRCADIAN_SPEED[period]
  };
}
```

---

## Relationship Depth Stages

Animation richness grows with relationship:

| Stage | Unlock | Animation Features |
|-------|--------|-------------------|
| **New** | Day 1 | Base animations only |
| **Getting to Know** | Week 1 | Personalized greetings |
| **Building Trust** | Week 2+ | Micro-expressions enabled |
| **Established** | Month 1+ | Full EQ system |
| **Deep Partnership** | Months+ | Anticipatory emotions |

### Progressive Feature Unlock

```javascript
const relationshipFeatures = {
  new: ['idle', 'listening', 'speaking'],
  gettingToKnow: ['micro-nods', 'basic-glow'],
  buildingTrust: ['micro-expressions', 'breath-sync'],
  established: ['concern-detection', 'emotional-glow'],
  deepPartnership: ['anticipation', 'full-eq']
};
```

---

## Keyframe Library

### Core Animations

| Animation | Duration | Use |
|-----------|----------|-----|
| `avatarBreathe` | 4000ms | Idle state |
| `avatarFloat` | 6000ms | Gentle movement |
| `avatarNod` | 300ms | Agreement |
| `avatarTilt` | 200ms | Curiosity |
| `avatarBounce` | 400ms | Joy/celebration |
| `pixarBounce` | 500ms | Extra squash/stretch |
| `pixarAnticipate` | 200ms | Before action |
| `pixarSettle` | 400ms | After action |
| `glowPulse` | 2000ms | Steady glow |
| `glowBreath` | 4000ms | Synced to breathing |
| `waveformSpeak` | continuous | Voice-reactive |
| `microNod` | 150ms | Listening feedback |
| `subtleNod` | 250ms | Pause acknowledgment |
| `celebrationBurst` | 800ms | Milestone reached |

### Easing Functions

| Name | CSS | Use |
|------|-----|-----|
| **Natural** | `cubic-bezier(0.4, 0, 0.2, 1)` | Most transitions |
| **Energetic** | `cubic-bezier(0.4, 0, 0.6, 1)` | Quick responses |
| **Gentle** | `cubic-bezier(0.2, 0, 0.4, 1)` | Soft movements |
| **Spring** | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Bouncy |
| **Elastic** | Custom spring physics | Celebrations |

---

## Implementation Checklist

### Avatar Component Must Support:

- [ ] Breathing animation (4s cycle, adjustable)
- [ ] Micro-nod during user speech (1.5-6px)
- [ ] Waveform visualization (9 bars, emotion-shaped)
- [ ] Glow color transitions (300ms)
- [ ] Glow intensity animation (pulse)
- [ ] Eye expression states (35 emotions)
- [ ] Persona-specific timing multipliers
- [ ] Circadian adjustments
- [ ] Relationship depth feature gating

### Superhuman EQ Must Support:

- [ ] Micro-expression playback (40-150ms)
- [ ] Active listening nods (speech-reactive)
- [ ] Breath sync detection and matching
- [ ] Concern detection triggers
- [ ] Anticipatory emotion system
- [ ] Partial transcript analysis

### State Machine Must Support:

- [ ] IDLE → LISTENING transition
- [ ] LISTENING → THINKING transition
- [ ] THINKING → SPEAKING transition
- [ ] SPEAKING → IDLE transition
- [ ] Any → CONCERN override
- [ ] Any → CELEBRATION override
- [ ] Smooth state blending

---

## The Ultimate Test

After every interaction, ask:

1. **Did the motion feel alive?** Not robotic, not mechanical—alive.
2. **Did it respond to emotional cues?** Joy for joy, concern for concern.
3. **Did it feel faster than human?** Anticipation, not reaction.
4. **Was it invisible?** The best motion isn't noticed—just felt.

If yes to all four, the motion language is working.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    FERNI MOTION CHEAT SHEET                 │
├─────────────────────────────────────────────────────────────┤
│  TIMING MULTIPLIERS                                         │
│  Peter: 0.8x (fast) → Ferni: 1.0x → Nayan: 1.1x+ (slow)    │
├─────────────────────────────────────────────────────────────┤
│  MICRO-EXPRESSIONS (subliminal)                             │
│  Recognition: 80ms  |  Concern: 60ms  |  Delight: 100ms    │
├─────────────────────────────────────────────────────────────┤
│  ACTIVE LISTENING                                           │
│  Micro: 1.5px  |  Subtle: 2.5px  |  Visible: 4px           │
├─────────────────────────────────────────────────────────────┤
│  BREATH SYNC                                                │
│  Relaxed: 5s  |  Normal: 4s  |  Alert: 3.3s                │
│  To calm: sync 10% slower than user                         │
├─────────────────────────────────────────────────────────────┤
│  CIRCADIAN                                                  │
│  Night = warmer, dimmer, slower                             │
│  Day = neutral, bright, normal                              │
├─────────────────────────────────────────────────────────────┤
│  STATES                                                     │
│  IDLE → LISTENING → THINKING → SPEAKING → IDLE             │
│  Override: CONCERN (amber), CELEBRATION (gold burst)        │
└─────────────────────────────────────────────────────────────┘
```

---

*Motion is emotion made visible. Every frame tells the user: "I'm here. I'm listening. I understand."*
