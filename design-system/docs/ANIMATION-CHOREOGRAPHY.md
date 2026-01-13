# Animation Choreography Guide

> *"Animation is not the art of drawings that move, but rather the art of movements that are drawn."* — Norman McLaren

This guide documents Ferni's animation system, built on principles from Pixar, Disney, and Material Design to create animations that feel alive, intentional, and emotionally intelligent.

---

## Core Philosophy

Ferni's animations serve three purposes:

1. **Guide Attention** — Motion directs focus without demanding it
2. **Convey Emotion** — Timing and easing communicate feeling
3. **Feel Alive** — The interface breathes, anticipates, and responds

We don't animate for decoration. Every animation has a job.

---

## The Animation Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  MACRO TRANSITIONS (300-600ms)                          │
│  Page transitions, modal reveals, major state changes   │
├─────────────────────────────────────────────────────────┤
│  MICRO INTERACTIONS (100-300ms)                         │
│  Button presses, toggles, hover states                  │
├─────────────────────────────────────────────────────────┤
│  AMBIENT MOTION (continuous)                            │
│  Breath sync, idle states, loading indicators           │
├─────────────────────────────────────────────────────────┤
│  MICRO-EXPRESSIONS (40-150ms)                           │
│  Subliminal emotional flashes, recognition cues         │
└─────────────────────────────────────────────────────────┘
```

---

## Easing Curves (Semantic Motion)

Each easing curve has a personality. Use the right one for the emotional context.

### Available Curves

| Name | CSS Variable | Cubic Bezier | Personality |
|------|-------------|--------------|-------------|
| **Smooth** | `var(--easing-smooth)` | `cubic-bezier(0.4, 0, 0.2, 1)` | Professional, reliable |
| **Spring** | `var(--easing-spring)` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Playful, energetic |
| **Bounce** | `var(--easing-bounce)` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Fun, surprising |
| **Snappy** | `var(--easing-snappy)` | `cubic-bezier(0.4, 0, 0, 1)` | Quick, decisive |
| **Gentle** | `var(--easing-gentle)` | `cubic-bezier(0.4, 0, 0.6, 1)` | Calm, soothing |
| **Anticipate** | `var(--easing-anticipate)` | `cubic-bezier(0.68, -0.6, 0.32, 1.6)` | Dramatic, theatrical |

### When to Use Each

```css
/* Smooth — Default for most UI transitions */
.modal { transition: opacity 300ms var(--easing-smooth); }

/* Spring — Interactive elements that respond to user action */
.button:active { transition: transform 200ms var(--easing-spring); }

/* Bounce — Celebratory moments, achievements */
.achievement-badge { animation: pop 400ms var(--easing-bounce); }

/* Snappy — System responses, immediate feedback */
.toggle { transition: background 150ms var(--easing-snappy); }

/* Gentle — Ambient motion, background elements */
.background-pattern { animation: drift 20s var(--easing-gentle) infinite; }

/* Anticipate — Important reveals, dramatic moments */
.hero-reveal { animation: anticipate 600ms var(--easing-anticipate); }
```

---

## Duration Tokens

Durations are semantic, not arbitrary numbers.

| Token | Duration | Use Case |
|-------|----------|----------|
| `var(--duration-instant)` | 50ms | Micro-expressions, immediate feedback |
| `var(--duration-fast)` | 150ms | Hover states, small interactions |
| `var(--duration-normal)` | 200ms | Button presses, toggles |
| `var(--duration-slow)` | 400ms | Page transitions, modals |
| `var(--duration-slower)` | 600ms | Complex animations, reveals |
| `var(--duration-deliberate)` | 800ms | Dramatic moments, celebrations |

### The 12 Principles Applied to Duration

Following Disney's principles:

- **Timing** — Fast = urgent/light, Slow = heavy/important
- **Staging** — Important elements animate slightly slower to draw focus
- **Anticipation** — Add 100-150ms wind-up before major actions

---

## Breath Sync System

The avatar and ambient elements use breath-synchronized animation to feel alive.

### Four Emotional Presets

```css
/* Calm — Deep, slow breathing for peaceful moments */
.avatar { animation: breathSync-calm 6s ease-in-out infinite; }

/* Relaxed — Natural conversational rhythm */
.avatar { animation: breathSync-relaxed 5s ease-in-out infinite; }

/* Attentive — Engaged, listening actively */
.avatar { animation: breathSync-attentive 4s ease-in-out infinite; }

/* Concerned — Faster, showing empathy/urgency */
.avatar { animation: breathSync-concerned 3s ease-in-out infinite; }
```

### Breath Ratio Explanation

Each preset has a specific inhale:hold:exhale ratio:

| Preset | Cycle | Ratio | Scale Range |
|--------|-------|-------|-------------|
| Calm | 6s | 4:1:5 | 1.0 → 1.06 |
| Relaxed | 5s | 3:0.5:4 | 1.0 → 1.05 |
| Attentive | 4s | 2:0.3:2 | 1.0 → 1.04 |
| Concerned | 3s | 1.5:0.2:1.5 | 1.0 → 1.03 |

### Implementation

```html
<!-- Using data attribute -->
<div class="avatar" data-breath="calm"></div>

<!-- Using utility class -->
<div class="avatar breath-sync-relaxed"></div>

<!-- Dynamic switching -->
<script>
  function setEmotionalState(element, state) {
    element.setAttribute('data-breath', state);
  }
</script>
```

---

## Circadian-Aware Animation

Animation speed adapts to time of day, respecting the user's energy levels.

### Time Periods

| Period | Time | Animation Speed | Rationale |
|--------|------|-----------------|-----------|
| Early Morning | 5-7 AM | 0.8x | Gentle wake-up |
| Morning | 7-10 AM | 1.0x | Full energy |
| Midday | 10 AM-2 PM | 1.0x | Peak alertness |
| Afternoon | 2-5 PM | 0.95x | Slight slowdown |
| Evening | 5-8 PM | 0.9x | Winding down |
| Night | 8-10 PM | 0.85x | Relaxed |
| Late Night | 10 PM-1 AM | 0.7x | Drowsy |
| Deep Night | 1-5 AM | 0.6x | Minimal stimulation |

### CSS Variables

```css
/* Applied automatically via data-circadian attribute */
:root {
  --circadian-animation-speed: 1;
}

[data-circadian="lateNight"] {
  --circadian-animation-speed: 0.7;
}

/* Usage */
.animated-element {
  animation-duration: calc(var(--base-duration) / var(--circadian-animation-speed));
}
```

### JavaScript Integration

```javascript
// Auto-detect and apply circadian period
function applyCircadianPeriod() {
  const hour = new Date().getHours();
  let period = 'midday';

  if (hour >= 5 && hour < 7) period = 'earlyMorning';
  else if (hour >= 7 && hour < 10) period = 'morning';
  else if (hour >= 10 && hour < 14) period = 'midday';
  else if (hour >= 14 && hour < 17) period = 'afternoon';
  else if (hour >= 17 && hour < 20) period = 'evening';
  else if (hour >= 20 && hour < 22) period = 'night';
  else if (hour >= 22 || hour < 1) period = 'lateNight';
  else period = 'deepNight';

  document.documentElement.setAttribute('data-circadian', period);
}

// Update every hour
setInterval(applyCircadianPeriod, 3600000);
applyCircadianPeriod();
```

---

## Pixar's 12 Principles in Practice

### 1. Squash & Stretch

Gives weight and flexibility. Used for buttons and interactive elements.

```css
@keyframes squash {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.1, 0.9); }
}

.button:active {
  animation: squash 200ms var(--easing-bounce);
}
```

### 2. Anticipation

Wind-up before action. Signals something is about to happen.

```css
@keyframes anticipate {
  0% { transform: scale(1); }
  30% { transform: scale(0.95); }  /* Pull back */
  100% { transform: scale(1.1); }  /* Release */
}

.cta-button:hover {
  animation: anticipate 300ms var(--easing-spring) forwards;
}
```

### 3. Staging

Clear presentation of an idea. Only one thing demands attention at a time.

```css
/* Stagger child animations to guide the eye */
.card:nth-child(1) { animation-delay: 0ms; }
.card:nth-child(2) { animation-delay: 50ms; }
.card:nth-child(3) { animation-delay: 100ms; }
```

### 4. Follow Through & Overlapping Action

Elements don't stop abruptly; they settle naturally.

```css
@keyframes settle {
  0% { transform: translateY(-20px); }
  60% { transform: translateY(4px); }   /* Overshoot */
  80% { transform: translateY(-2px); }  /* Bounce back */
  100% { transform: translateY(0); }    /* Settle */
}
```

### 5. Slow In & Slow Out (Ease)

Nothing in nature moves at constant speed. Always use easing.

```css
/* WRONG */
.element { transition: transform 300ms linear; }

/* RIGHT */
.element { transition: transform 300ms var(--easing-smooth); }
```

### 6. Arc

Natural motion follows curved paths, not straight lines.

```css
@keyframes arc {
  0% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(50px, -30px);  /* Curve up */
  }
  100% {
    transform: translate(100px, 0);
  }
}
```

---

## Choreography Patterns

### Staggered Entrance

For lists, grids, and collections. Each item enters slightly after the previous.

```css
.list-item {
  opacity: 0;
  transform: translateY(20px);
  animation: fadeUp 300ms var(--easing-smooth) forwards;
}

.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
/* ... */

@keyframes fadeUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Best Practices:**
- Max delay: 500ms total (don't make users wait)
- Stagger increment: 30-80ms
- Direction: Usually top-to-bottom or center-out

### Cascade Reveal

For important content reveals. Content unfolds in sequence.

```css
.hero-title {
  animation: fadeUp 400ms var(--easing-smooth) 0ms forwards;
}
.hero-subtitle {
  animation: fadeUp 400ms var(--easing-smooth) 100ms forwards;
}
.hero-cta {
  animation: fadeUp 400ms var(--easing-smooth) 200ms forwards;
}
```

### Connected Transitions

When navigating between states, elements that persist should animate together.

```css
/* Shared element transition */
.card-image {
  view-transition-name: card-image;
}

::view-transition-old(card-image),
::view-transition-new(card-image) {
  animation-duration: 400ms;
  animation-timing-function: var(--easing-smooth);
}
```

### Modal Choreography

1. Backdrop fades in (200ms)
2. Modal scales up from 0.95 with opacity (300ms, 100ms delay)
3. Content fades in (200ms, 200ms delay)

```css
.modal-backdrop {
  animation: fadeIn 200ms var(--easing-smooth);
}

.modal {
  animation: scaleIn 300ms var(--easing-spring) 100ms both;
}

.modal-content {
  animation: fadeIn 200ms var(--easing-smooth) 200ms both;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

---

## Micro-Expressions (Superhuman EQ)

Subliminal emotional cues lasting 40-150ms. The user doesn't consciously see them, but feels them.

### Recognition Flash

When Ferni recognizes something the user mentioned before:

```css
@keyframes recognition {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
}

.avatar.recognition {
  animation: recognition 80ms ease-out;
}
```

### Concern Pulse

When detecting emotional distress:

```css
@keyframes concern {
  0%, 100% { box-shadow: 0 0 0 0 var(--persona-glow); }
  50% { box-shadow: 0 0 20px 5px var(--persona-glow); }
}

.avatar.concern {
  animation: concern 120ms ease-out;
}
```

### Anticipation Lean

When Ferni is about to respond:

```css
@keyframes lean {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02) translateY(-2px); }
}

.avatar.anticipating {
  animation: lean 150ms var(--easing-anticipate);
}
```

---

## Performance Guidelines

### Hardware Acceleration

Only animate properties that trigger GPU acceleration:
- `transform` (translate, scale, rotate)
- `opacity`
- `filter` (use sparingly)

```css
/* GOOD - GPU accelerated */
.element {
  transform: translateX(100px);
  opacity: 0.5;
}

/* BAD - Causes layout/paint */
.element {
  left: 100px;
  width: 200px;
  background-color: red;
}
```

### Will-Change

Use sparingly for complex animations:

```css
.complex-animation {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.complex-animation.done {
  will-change: auto;
}
```

### Reduced Motion

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Testing Animations

### Slow Motion Testing

```javascript
// Slow down all animations for debugging
document.documentElement.style.setProperty('--debug-animation-speed', '0.25');

// In CSS
.animated {
  animation-duration: calc(var(--base-duration) / var(--debug-animation-speed, 1));
}
```

### Animation Debugging Checklist

- [ ] Does it serve a purpose? (Guide, convey, or feel alive)
- [ ] Is the timing appropriate for the action?
- [ ] Does it use semantic easing?
- [ ] Does it respect reduced motion preferences?
- [ ] Is it hardware accelerated?
- [ ] Does it feel right at circadian extremes (6 AM and 2 AM)?

---

## Quick Reference

### Duration + Easing Combos

| Action | Duration | Easing |
|--------|----------|--------|
| Hover state | 150ms | smooth |
| Button press | 200ms | spring |
| Modal open | 300ms | spring |
| Page transition | 400ms | smooth |
| Loading pulse | 1500ms | gentle |
| Celebration | 600ms | bounce |
| Error shake | 400ms | bounce |
| Subtle pulse | 2000ms | gentle |

### Data Attributes

```html
<!-- Circadian (time-aware) -->
<div data-circadian="morning">...</div>

<!-- Breath sync (emotional state) -->
<div data-breath="calm">...</div>

<!-- Persona (color context) -->
<div data-persona="ferni">...</div>
```

---

## Related Documentation

- **Token Explorer**: `brand/visualizations/token-explorer.html`
- **Design Tokens**: `design-system/tokens/animation.json`
- **Build System**: `design-system/build.js`
- **Generated CSS**: `design-system/dist/tokens.css`
- **Superhuman EQ**: `design-system/docs/brand/BETTER-THAN-HUMAN.md`

---

*Last updated: January 2026*
