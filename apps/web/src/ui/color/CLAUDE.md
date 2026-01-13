# Ferni Color Intelligence System

> **Principle**: Colors should respond to emotion and time, not just mode.

This color system implements mood-responsive palettes and time-fading inspired by Josef Albers (color interaction) and James Gurney (atmospheric perspective).

## Source of Truth

```
design-system/tokens/colors.json         # Base colors
design-system/tokens/color-emotional.json # Mood + time fading
```

**NEVER hardcode hex values:**
```css
/* ❌ WRONG - fails brand:check */
color: #4a6741;
background: rgb(74, 103, 65);

/* ✅ CORRECT */
color: var(--color-ferni);
background: var(--persona-maya);
```

---

## Mood-Responsive Palettes

Colors shift subtly based on emotional state:

### State Adjustments

| Mood | Hue Shift | Saturation | Lightness | Character |
|------|-----------|------------|-----------|-----------|
| Calm | -5° | 85% | +3 | Cool, soft |
| Joyful | +10° | 115% | +5 | Warm, bright |
| Anxious | +15° | 90% | -5 | Tense, muted |
| Tired | 0° | 70% | -10 | Desaturated |
| Focused | -10° | 110% | 0 | Cool, clear |
| Reflective | -15° | 80% | +5 | Twilight, soft |
| Stressed | +5° | 75% | -8 | Muted, dim |
| Energized | +5° | 120% | +8 | Vibrant |
| Peaceful | -20° | 75% | +10 | Serene |

### Usage
```typescript
import { getMoodPalette } from './color/mood-palette.js';

const palette = getMoodPalette({
  basePalette: personaPalette,
  mood: 'calm',
  intensity: 0.7,  // 0-1
});
```

### CSS Variables
```css
/* Set by JavaScript */
--mood-color-primary: hsl(var(--mood-hue), var(--mood-saturation), var(--mood-lightness));
--mood-color-secondary: ...;
--mood-color-accent: ...;
--mood-color-background: ...;
```

---

## Time Fading (Gurney's Atmospheric Perspective)

Older memories desaturate like distant mountains:

| Time Period | Saturation | Opacity | Blur |
|-------------|------------|---------|------|
| Now | 100% | 100% | 0px |
| Today | 95% | 98% | 0px |
| Yesterday | 90% | 95% | 0.5px |
| This Week | 85% | 90% | 0.5px |
| Last Week | 75% | 85% | 1px |
| This Month | 65% | 80% | 1px |
| Last Month | 55% | 75% | 1.5px |
| This Quarter | 45% | 70% | 2px |
| Older | 35% | 60% | 2px |

### Additional Effect
Older memories shift toward warm sepia tones (like old photographs).

### Usage
```typescript
import { getTimeFadedColor, getTimeCategory } from './color/time-fading.js';

const category = getTimeCategory(memoryDate);  // 'thisWeek', 'lastMonth', etc.
const fadedColor = getTimeFadedColor(originalColor, category);
```

### CSS
```css
.memory-card {
  filter: saturate(var(--time-fade-saturation))
          opacity(var(--time-fade-opacity))
          blur(var(--time-fade-blur));
}
```

---

## Persona Transitions (Albers)

Smooth color transitions when switching personas:

### Bridge Colors
Instead of abrupt changes, use harmonic bridge colors:

```
Ferni (#4a6741) → Bridge (#7a8866) → Maya (#a67a6a)
       Green         Sage           Terracotta
```

### Transition Durations
- Similar colors (Maya ↔ Jordan): 400ms
- Different colors (Ferni ↔ Alex): 800ms

### Usage
```typescript
import { getTransitionColors } from './color/persona-harmony.js';

const { bridgeColor, duration, intermediateSteps } = getTransitionColors(
  'ferni',
  'maya'
);

// Animate through intermediate steps
steps.forEach((color, i) => {
  setTimeout(() => setColor(color), i * (duration / steps.length));
});
```

---

## Persona Colors

| Persona | Variable | Hex | Usage |
|---------|----------|-----|-------|
| Ferni | `--color-ferni` | #4a6741 | Coordinator |
| Maya | `--color-maya` | #a67a6a | Habits |
| Peter | `--color-peter` | #3a6b73 | Research |
| Jordan | `--color-jordan` | #c4856a | Planning |
| Alex | `--color-alex` | #5a6b8a | Communication |
| Nayan | `--color-nayan` | #b8956a | Wisdom |

---

## Simultaneous Contrast (Albers)

Colors appear different based on neighbors:

```typescript
import { adjustForContrast } from './color/persona-harmony.js';

// When two persona colors are adjacent
const adjusted = adjustForContrast(colorA, colorB, 'enhance');
```

### Rules
- **Avoid clash**: Reduce saturation 10%, adjust lightness ±5
- **Enhance harmony**: Boost saturation 5%, enhance contrast 3

---

## Accessibility

### Contrast Requirements
- Normal text: 4.5:1 minimum
- Large text: 3.0:1 minimum
- UI components: 3.0:1 minimum

### Color Blind Safe
- Never use red/green alone
- Use shape + pattern + color
- Provide text alternatives

```typescript
import { checkContrast, isColorBlindSafe } from './color/accessibility.js';

const contrast = checkContrast(foreground, background);
if (contrast < 4.5) {
  console.warn('Insufficient contrast for normal text');
}
```

---

## Files to Create

```
color/
├── CLAUDE.md           # This file
├── mood-palette.ts     # Mood-responsive colors
├── time-fading.ts      # Atmospheric perspective
├── persona-harmony.ts  # Albers transitions
├── accessibility.ts    # Contrast checks
└── index.ts            # Exports
```

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| Hardcoded `#4a6741` | `var(--color-ferni)` |
| Static colors | Mood-responsive |
| Abrupt persona transitions | Bridge colors |
| Same colors for all memory ages | Time fading |
| Ignoring contrast | Check accessibility |
