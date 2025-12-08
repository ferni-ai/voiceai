# 🎬 Ferni Micro-Interaction Choreography
## Frame-by-Frame Animation Specifications

**Version 1.0 | December 2024**

---

> *"Animation is not the art of drawings that move, but the art of movements that are drawn."*  
> — Norman McLaren

---

# Purpose

This folder contains precise, frame-by-frame specifications for every micro-interaction in Ferni. Unlike general animation guidelines, these are **choreographed**—each phase has exact timing, easing, and property values.

## Why Choreography Matters

1. **Consistency** — Every button press feels the same across the app
2. **Intentionality** — Nothing moves by accident
3. **Personality** — Motion conveys Ferni's warmth
4. **Quality** — No janky, uncoordinated animations

---

# File Structure

```
choreography/
├── README.md (this file)
├── index.ts                    # Exports all choreographies
├── button-interactions.ts      # Button press, hover, focus
├── card-interactions.ts        # Card hover, press, flip
├── modal-transitions.ts        # Modal open, close, backdrop
├── avatar-animations.ts        # Avatar breathe, react, celebrate
├── connection-states.ts        # Connect, disconnect, reconnect
├── handoff-transitions.ts      # Persona handoffs
├── celebration-moments.ts      # Win celebrations
├── error-recovery.ts           # Error shake, retry
├── scroll-reveals.ts           # Scroll-triggered animations
├── toast-notifications.ts      # Toast enter, exit, stack
└── loading-states.ts           # Skeleton, spinner, progress
```

---

# How to Use

## Import in Code

```typescript
import { BUTTON_PRESS_CHOREOGRAPHY, animate } from '@design-system/choreography';

// Apply choreography
await animate(buttonElement, BUTTON_PRESS_CHOREOGRAPHY);
```

## Choreography Structure

Each choreography follows this structure:

```typescript
interface Choreography {
  name: string;
  description: string;
  totalDuration: number;  // Total time in ms
  
  phases: Array<{
    name: string;         // Phase name (anticipation, action, settle)
    start: number;        // Start time in ms
    end: number;          // End time in ms
    properties: {
      [cssProperty: string]: [startValue, endValue];
    };
    easing: string;       // CSS easing function
  }>;
  
  // For prefers-reduced-motion
  reducedMotion: {
    totalDuration: number;
    properties: { [key: string]: [start, end] };
  };
}
```

---

# Animation Principles Applied

## Pixar's 12 Principles in UI

| Principle | Application |
|-----------|-------------|
| **Squash & Stretch** | Buttons compress on press |
| **Anticipation** | Wind-up before action |
| **Staging** | Focus user attention |
| **Follow-through** | Elements settle after action |
| **Slow In/Out** | Natural acceleration |
| **Arcs** | Curved motion paths |
| **Secondary Action** | Glow, shadow follow primary |
| **Timing** | Speed conveys weight |
| **Exaggeration** | Subtle emphasis |
| **Appeal** | Everything feels likeable |

---

# Global Timing Constants

From `design-system/tokens/animation.json`:

```typescript
// Duration scale
MICRO: 50,       // Immediate feedback
FAST: 100,       // Hover states
NORMAL: 200,     // Standard transitions
SLOW: 300,       // Deliberate moves
MODERATE: 400,   // Panel slides
DELIBERATE: 500, // Emphasis
DRAMATIC: 600,   // Celebrations
CELEBRATION: 800 // Major moments
```

---

# Easing Reference

```typescript
// Core easings
STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)',    // Material standard
SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Overshoot bounce
GENTLE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',  // Organic, natural
ANTICIPATE: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)', // Wind-up
EXPO_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)',   // Dramatic exit
```

---

# Accessibility

All choreographies include `reducedMotion` alternatives that:
- Use opacity changes instead of transforms
- Complete in ≤ 100ms
- Never use oscillating animations

```typescript
// Check before animating
if (prefersReducedMotion()) {
  await animate(element, choreography.reducedMotion);
} else {
  await animate(element, choreography);
}
```

---

**See individual files for specific choreographies.**

