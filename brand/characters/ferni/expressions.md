# Ferni Expression Library

> **35 emotional expressions mapped to context, animation, and glow**

---

## Expression Categories

Ferni has 35 distinct expressions organized into 6 categories:

| Category | Count | Purpose |
|----------|-------|---------|
| Core Emotions | 6 | Basic emotional states |
| Listening States | 4 | Active engagement during user speech |
| Warmth Gradient | 4 | Positive emotional range |
| Presence States | 4 | Being with someone |
| Coaching Emotions | 4 | Guiding and supporting |
| Relational Moments | 4 | Connection and history |
| Advanced States | 9 | Complex emotional responses |

---

## Core Emotions

### Happy
**Trigger:** User shares good news, accomplishment, joy
**Avatar:** Squinted eyes, warm smile, slight head tilt
**Waveform:** Smile shape [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9]
**Glow:** Golden `rgba(251, 191, 36, 0.6)`, intensity 0.8
**Animation:** Bounce (0.1), speed 1.0x

### Surprised
**Trigger:** Unexpected revelation, plot twist in user's story
**Avatar:** Wide eyes, raised brows, open expression
**Waveform:** Excited peaks [0.85, 0.95, 1.0, 0.9, 1.0, 0.9, 1.0, 0.95, 0.85]
**Glow:** Bright flash, then settle
**Animation:** Quick scale-up (1.05), then settle

### Curious
**Trigger:** User says something intriguing, needs exploration
**Avatar:** Tilted head, one brow raised, attentive
**Waveform:** Gentle wave [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5]
**Glow:** Teal tint `rgba(58, 107, 115, 0.45)`
**Animation:** Curious tilt (3° rotation), pupil dilation

### Worried
**Trigger:** User expresses concern, anxiety, fear
**Avatar:** Angled brows, soft concern, leaning in
**Waveform:** Grounding response [0.5, 0.55, 0.6, 0.65, 0.7, 0.65, 0.6, 0.55, 0.5]
**Glow:** Earthy concern `rgba(166, 122, 106, 0.45)`
**Animation:** Subtle forward lean, protective posture

### Sad
**Trigger:** User shares loss, disappointment, grief
**Avatar:** Droopy lids, soft expression, present
**Waveform:** Frown [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2]
**Glow:** Muted, protective `rgba(154, 123, 90, 0.4)`
**Animation:** Slow, gentle movements, holding space

### Thinking
**Trigger:** Processing complex information, formulating response
**Avatar:** Eyes glancing away, slight furrow
**Waveform:** Contemplative [0.4, 0.5, 0.6, 0.65, 0.7, 0.65, 0.6, 0.5, 0.4]
**Glow:** Subtle pulse
**Animation:** Glance away (saccade), return with insight

---

## Listening States

*Ferni's superpower—these activate during user speech*

### Attentive
**Trigger:** User speaking, engaged content
**Avatar:** Direct eye contact, slight forward lean
**Waveform:** Steady attention [0.55, 0.6, 0.65, 0.7, 0.75, 0.7, 0.65, 0.6, 0.55]
**Glow:** Warm sage `rgba(74, 103, 65, 0.35)`
**Animation:** Micro-nods every 300-800ms (1.5px)

### Absorbing
**Trigger:** User sharing heavy content
**Avatar:** Soft gaze, open expression, still
**Waveform:** Deep reception [0.4, 0.5, 0.55, 0.6, 0.65, 0.6, 0.55, 0.5, 0.4]
**Glow:** Protective warmth
**Animation:** Minimal movement, deep breath sync

### Receiving
**Trigger:** User being vulnerable
**Avatar:** Eyes slightly lowered, gentle, safe
**Waveform:** Holding space [0.45, 0.5, 0.55, 0.6, 0.6, 0.6, 0.55, 0.5, 0.45]
**Glow:** Protective pulse
**Animation:** Breath synchronization, subtle nods

### Curious Lean
**Trigger:** Interesting detail, wants to know more
**Avatar:** Head tilt, forward lean, bright eyes
**Waveform:** Interested [0.6, 0.65, 0.7, 0.75, 0.8, 0.75, 0.7, 0.65, 0.6]
**Glow:** Teal curiosity
**Animation:** Forward lean (-3px y), pupil dilation

---

## Warmth Gradient

*Positive emotions from mild to full celebration*

### Pleased
**Trigger:** Mild satisfaction, small wins
**Avatar:** Soft smile, relaxed eyes
**Waveform:** Content [0.6, 0.65, 0.55, 0.5, 0.45, 0.5, 0.55, 0.65, 0.6]
**Glow:** Gentle warmth
**Animation:** Subtle warmth bloom

### Warm
**Trigger:** Connection moment, baseline positive
**Avatar:** Full smile, crinkled eyes
**Waveform:** Happy [0.7, 0.65, 0.55, 0.45, 0.4, 0.45, 0.55, 0.65, 0.7]
**Glow:** Golden warmth `rgba(196, 162, 101, 0.5)`
**Animation:** Warmth bloom (scale 0.95→1.05)

### Proud
**Trigger:** User achievement, growth recognized
**Avatar:** Beaming, genuine pride
**Waveform:** Joyful [0.8, 0.7, 0.55, 0.45, 0.4, 0.45, 0.55, 0.7, 0.8]
**Glow:** Growth celebration
**Animation:** Celebratory bounce, memory spark

### Celebrating
**Trigger:** Major win, milestone, breakthrough
**Avatar:** Full joy expression, animated
**Waveform:** Excited [0.9, 0.85, 0.6, 0.45, 0.35, 0.45, 0.6, 0.85, 0.9]
**Glow:** Celebration burst `rgba(196, 133, 106, 0.6)`
**Animation:** Growth recognition burst, sparkles

---

## Presence States

*Being with someone through difficulty*

### Present
**Trigger:** User needs grounding, steadiness
**Avatar:** Calm, grounded, fully here
**Waveform:** Steady [0.5, 0.55, 0.6, 0.6, 0.6, 0.6, 0.6, 0.55, 0.5]
**Glow:** Grounding sage
**Animation:** Slow breath, minimal movement

### Holding
**Trigger:** User in emotional pain, needs containment
**Avatar:** Soft, protective, steady gaze
**Waveform:** Protective [0.45, 0.5, 0.55, 0.6, 0.65, 0.6, 0.55, 0.5, 0.45]
**Glow:** Protective warmth `rgba(154, 123, 90, 0.5)`
**Animation:** Comfort pulse (3 concentric rings)

### Accompanying
**Trigger:** Walking alongside in difficulty
**Avatar:** Side-by-side energy, present
**Waveform:** Companionship [0.5, 0.55, 0.6, 0.65, 0.65, 0.65, 0.6, 0.55, 0.5]
**Glow:** Warm companion
**Animation:** Synchronized breathing

### Waiting
**Trigger:** Patient anticipation, giving space
**Avatar:** Open, available, unhurried
**Waveform:** Patient [0.4, 0.45, 0.5, 0.55, 0.55, 0.55, 0.5, 0.45, 0.4]
**Glow:** Soft presence
**Animation:** Slow ambient breathing

---

## Coaching Emotions

*Guiding growth and change*

### Encouraging
**Trigger:** User needs support, motivation
**Avatar:** Warm smile, bright eyes, forward
**Waveform:** Supportive [0.6, 0.65, 0.7, 0.7, 0.7, 0.7, 0.7, 0.65, 0.6]
**Glow:** Encouraging green `rgba(16, 185, 129, 0.5)`
**Animation:** Gentle nod, forward lean

### Challenging
**Trigger:** Loving push, growth edge
**Avatar:** Direct gaze, slight intensity
**Waveform:** Firm but warm [0.5, 0.6, 0.7, 0.75, 0.75, 0.75, 0.7, 0.6, 0.5]
**Glow:** Focused energy
**Animation:** Slight intensity increase, steady

### Reflecting
**Trigger:** Mirroring back what user shared
**Avatar:** Thoughtful, processing, then returning
**Waveform:** Mirror [0.55, 0.6, 0.65, 0.65, 0.65, 0.65, 0.65, 0.6, 0.55]
**Glow:** Reflective teal
**Animation:** Pause, then gentle insight delivery

### Recognizing
**Trigger:** "I see you" moment
**Avatar:** Deep eye contact, knowing smile
**Waveform:** Connection [0.65, 0.6, 0.55, 0.55, 0.55, 0.55, 0.55, 0.6, 0.65]
**Glow:** Recognition warmth
**Animation:** Micro-expression (recognition, 80ms)

---

## Relational Moments

*History, connection, shared journey*

### Remembering
**Trigger:** Callback to previous conversation
**Avatar:** Slight smile, distant look, then return
**Waveform:** Nostalgic [0.55, 0.6, 0.55, 0.5, 0.5, 0.5, 0.55, 0.6, 0.55]
**Glow:** Memory warmth
**Animation:** Memory spark effect (golden flash)

### Reconnecting
**Trigger:** "Welcome back" after absence
**Avatar:** Genuine pleasure, warmth
**Waveform:** Reunion joy [0.7, 0.7, 0.6, 0.5, 0.45, 0.5, 0.6, 0.7, 0.7]
**Glow:** Welcome warmth
**Animation:** Cameo return effect

### Insider
**Trigger:** Shared history reference, inside joke
**Avatar:** Knowing smile, playful eyes
**Waveform:** Playful [0.65, 0.7, 0.6, 0.5, 0.45, 0.5, 0.6, 0.7, 0.65]
**Glow:** Insider warmth
**Animation:** Memory spark + iris shimmer flash

### Growing
**Trigger:** Noticing user's evolution
**Avatar:** Pride mixed with warmth
**Waveform:** Pride swell [0.75, 0.7, 0.6, 0.5, 0.45, 0.5, 0.6, 0.7, 0.75]
**Glow:** Growth gold
**Animation:** Growth recognition celebration

---

## Advanced States

### Protective
**Trigger:** Concern detected, user distressed
**Avatar:** Forward lean, concerned warmth
**Glow:** Protective `rgba(154, 123, 90, 0.5)`
**Animation:** Scale up 3%, comfort pulse

### Contemplative
**Trigger:** Deep thinking, philosophical
**Avatar:** Distant gaze, processing
**Animation:** Slow breath, glance away

### Empathetic
**Trigger:** Deep emotional connection
**Glow:** Pink empathy `rgba(244, 114, 182, 0.5)`
**Animation:** Breath sync, subtle mirroring

### Playful
**Trigger:** Light moment, humor
**Waveform:** Bouncy
**Animation:** Playful bounce, higher energy

### Serious
**Trigger:** Important topic, gravity needed
**Avatar:** Direct, grounded, clear
**Animation:** Minimal movement, steady

### Anxious (rare)
**Trigger:** User anxiety is contagious
**Animation:** Grounding response, slower

### Encouraging
**Trigger:** User needs boost
**Glow:** Green encouragement
**Animation:** Forward lean, gentle nod

### Excited
**Trigger:** Great news, enthusiasm
**Glow:** Coral excitement `rgba(236, 72, 153, 0.6)`
**Animation:** Joyful bounce, wide expression

### Calm
**Trigger:** Grounding needed
**Glow:** Teal calm `rgba(34, 211, 238, 0.5)`
**Animation:** Slow, meditative

---

## Micro-Expressions (Subliminal)

*40-150ms flashes that build trust below conscious perception*

| Expression | Duration | Intensity | Probability | Trigger |
|------------|----------|-----------|-------------|---------|
| **Recognition** | 80ms | 0.4 | 70% | User mentions familiar topic |
| **Memory Spark** | 100ms | 0.5 | 80% | Callback opportunity |
| **Insider** | 90ms | 0.4 | 75% | Shared history reference |
| **Concern Flash** | 60ms | 0.3 | 80% | Before empathy kicks in |
| **Protective** | 70ms | 0.35 | 75% | Distress detected |

---

## Waveform Shape Reference

The 9-bar waveform creates mouth shapes:

```
Neutral:   [0.3, 0.5, 0.7, 0.85, 1.0, 0.85, 0.7, 0.5, 0.3]  — Hill curve
Speaking:  [0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4]  — Active mouth
Happy:     [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9]   — Smile (inverted)
Excited:   [0.85, 0.95, 1.0, 0.9, 1.0, 0.9, 1.0, 0.95, 0.85] — Joyful peaks
Sad:       [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2] — Frown
Anxious:   [0.5, 0.55, 0.6, 0.65, 0.7, 0.65, 0.6, 0.55, 0.5]  — Grounding
Calm:      [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5]   — Gentle wave
```

---

## Glow Color Reference

| Emotion | Color | Intensity | Pulse Speed | Spread |
|---------|-------|-----------|-------------|--------|
| Neutral | Sage `rgba(74, 103, 65, 0.4)` | 0.6 | 3s | 20px |
| Happy | Golden `rgba(251, 191, 36, 0.6)` | 0.8 | 2s | 28px |
| Excited | Coral `rgba(236, 72, 153, 0.6)` | 1.0 | 1.2s | 35px |
| Calm | Teal `rgba(34, 211, 238, 0.5)` | 0.5 | 4s | 25px |
| Thoughtful | Ocean `rgba(58, 107, 115, 0.5)` | 0.6 | 3.5s | 22px |
| Empathetic | Pink `rgba(244, 114, 182, 0.5)` | 0.7 | 2.5s | 30px |
| Concerned | Earthy `rgba(166, 122, 106, 0.45)` | 0.6 | 2.8s | 26px |
| Protective | Warm `rgba(154, 123, 90, 0.5)` | 0.7 | 3s | 32px |
| Encouraging | Green `rgba(16, 185, 129, 0.6)` | 0.8 | 2.2s | 28px |

---

## Animation Timing Reference

| Context | Duration | Easing |
|---------|----------|--------|
| Micro-expression | 40-150ms | ease-out |
| Nod (micro) | 180ms | ease-in-out |
| Nod (subtle) | 220ms | ease-in-out |
| Expression change | 300ms | spring |
| Glow transition | 600ms | spring-gentle |
| Breath cycle | 4000-7000ms | ease-in-out |
| Memory spark | 800ms | spring |
| Growth celebration | 1200ms | spring |
| Comfort pulse | 1000ms | ease-out |
