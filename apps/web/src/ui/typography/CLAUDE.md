# Ferni Typography System

> **Principle**: Typography should breathe with the user, not shout at them.

This typography system implements emotional typography inspired by Bringhurst and Lupton, where text subtly responds to emotional state.

## Brand Font Stack

```css
/* Display - Headlines, hero text */
font-family: var(--font-display);  /* Plus Jakarta Sans */

/* Body - Content, conversation */
font-family: var(--font-body);     /* Inter */

/* Accent - Special emphasis */
font-family: var(--font-accent);   /* Sora */

/* Mono - Code, data */
font-family: var(--font-mono);     /* JetBrains Mono */
```

**Never hardcode font families:**
```css
/* ❌ WRONG */
font-family: 'Inter', sans-serif;

/* ✅ CORRECT */
font-family: var(--font-body);
```

---

## Breathing Typography

Text subtly expands and contracts with the user's emotional rhythm.

### Rules
- **Scale range**: 1.0 - 1.02 (2% max - barely perceptible)
- **Minimum cycle**: 2000ms (never faster)
- **Apply to**: Hero text, focus elements, avatar labels
- **Never on**: Body text, navigation, buttons, form labels

### Implementation
```typescript
import { applyBreathingTypography } from './typography/breathing-text.js';

// Apply to hero elements
applyBreathingTypography(heroElement, {
  mood: 'calm',       // From user emotional state
  intensity: 0.5,     // 0-1, how pronounced
});
```

### CSS Variables
```css
/* Set by JavaScript based on mood */
--type-breathing-scale: 1.015;
--type-breathing-letter-spacing: 0.3px;
--type-breathing-duration: 2500ms;

/* Use in CSS */
.hero-text {
  transform: scale(var(--type-breathing-scale, 1));
  letter-spacing: var(--type-breathing-letter-spacing, 0);
  transition: transform var(--type-breathing-duration) ease,
              letter-spacing var(--type-breathing-duration) ease;
}
```

---

## Mood-Weight Mapping

Font weight shifts based on emotional state:

| Mood | Heading Weight | Body Weight | Letter Spacing |
|------|----------------|-------------|----------------|
| Calm | 500 | 350 | +0.3px |
| Joyful | 600 | 400 | +0.2px |
| Anxious | 450 | 380 | 0 |
| Tired | 400 | 350 | +0.4px |
| Focused | 550 | 400 | -0.2px |
| Reflective | 450 | 360 | +0.5px |
| Stressed | 500 | 400 | 0 |
| Energized | 600 | 420 | -0.3px |
| Peaceful | 400 | 340 | +0.6px |

### Usage
```typescript
import { getMoodTypography } from './typography/mood-weight.js';

const { headingWeight, bodyWeight, letterSpacing } = getMoodTypography('calm');
```

---

## Persona Typography

Each persona has a distinct typographic voice:

### Ferni (Coordinator)
- **Personality**: Warm, approachable
- **Heading**: 450
- **Body**: 360
- **Letter Spacing**: ×1.05
- **Style**: Rounded

### Maya (Habit Coach)
- **Personality**: Energetic, clear
- **Heading**: 550
- **Body**: 400
- **Letter Spacing**: ×0.95
- **Style**: Crisp

### Peter (Research)
- **Personality**: Precise, analytical
- **Heading**: 500
- **Body**: 400
- **Letter Spacing**: ×0.98
- **Style**: Structured

### Jordan (Planning)
- **Personality**: Organized, optimistic
- **Heading**: 500
- **Body**: 380
- **Letter Spacing**: ×1.0
- **Style**: Balanced

### Alex (Communication)
- **Personality**: Professional, efficient
- **Heading**: 500
- **Body**: 400
- **Letter Spacing**: ×0.97
- **Style**: Clean

### Nayan (Wisdom)
- **Personality**: Deep, contemplative
- **Heading**: 400
- **Body**: 350
- **Letter Spacing**: ×1.1
- **Style**: Spacious

---

## Accessibility

### Reduced Motion
```typescript
if (prefersReducedMotion) {
  // Disable breathing animation
  // Use instant transitions
}
```

### High Contrast
- Minimum font weight: 400
- Minimum font size: 1rem
- Increase letter spacing

### Large Text
```css
@media (prefers-larger-text) {
  :root {
    --font-scale: 1.25;
  }
}
```

---

## Files to Create

```
typography/
├── CLAUDE.md           # This file
├── breathing-text.ts   # Breathing animation system
├── mood-weight.ts      # Mood-to-typography mapping
├── persona-voice-type.ts  # Persona typography profiles
└── index.ts            # Exports
```

---

## Token Source

All typography values come from:
- `design-system/tokens/typography.json`
- `design-system/tokens/typography-emotional.json`

**Never hardcode values. Always use tokens.**
