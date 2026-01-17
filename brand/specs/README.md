# Ferni Implementation Specs

> **"The source of truth for building Ferni."**

---

## Quick Reference

| System | Source File | Generated |
|--------|-------------|-----------|
| Colors | `design-system/tokens/colors.json` | CSS variables |
| Animation | `design-system/tokens/animation.json` | TS constants |
| Typography | `design-system/tokens/typography.json` | CSS variables |
| Personas | `design-system/tokens/personas.json` | Theme configs |

---

## Color System

### Brand Colors

```css
/* Core */
--color-accent: #3D5A45;           /* CTA buttons, links */
--color-natural-ink: #2C2520;      /* Primary text */
--color-natural-ink-muted: #4A4540; /* Secondary text */

/* Surfaces */
--color-surface: #FAF9F7;          /* Light background */
--color-surface-elevated: #FFFFFF;  /* Cards, modals */
--color-surface-dark: #1a1a2e;     /* Dark mode bg */
```

### Persona Colors

| Persona | Primary | Tint | RGB |
|---------|---------|------|-----|
| Ferni | `#4a6741` | `rgba(74, 103, 65, 0.1)` | `74, 103, 65` |
| Maya | `#a67a6a` | `rgba(166, 122, 106, 0.1)` | `166, 122, 106` |
| Peter | `#3a6b73` | `rgba(58, 107, 115, 0.1)` | `58, 107, 115` |
| Jordan | `#c4856a` | `rgba(196, 133, 106, 0.1)` | `196, 133, 106` |
| Alex | `#5a6b8a` | `rgba(90, 107, 138, 0.1)` | `90, 107, 138` |
| Nayan | `#b8956a` | `rgba(184, 149, 106, 0.1)` | `184, 149, 106` |

### CSS Variable Pattern

```css
:root {
    /* Persona colors */
    --persona-ferni: #4a6741;
    --persona-ferni-rgb: 74, 103, 65;
    --persona-ferni-tint: rgba(74, 103, 65, 0.1);

    /* Current persona (set dynamically) */
    --persona-current: var(--persona-ferni);
    --persona-current-rgb: var(--persona-ferni-rgb);
}

/* Usage */
.avatar-glow {
    box-shadow: 0 0 30px rgba(var(--persona-current-rgb), 0.4);
}
```

---

## Typography System

### Font Stack

```css
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: 'Cal Sans', 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Scale

| Token | Size | Line Height | Use |
|-------|------|-------------|-----|
| `--text-xs` | 12px | 1.5 | Captions |
| `--text-sm` | 14px | 1.5 | Secondary text |
| `--text-base` | 16px | 1.6 | Body |
| `--text-lg` | 18px | 1.6 | Emphasis |
| `--text-xl` | 20px | 1.4 | Subheadings |
| `--text-2xl` | 24px | 1.3 | Headings |
| `--text-3xl` | 32px | 1.2 | Page titles |
| `--text-4xl` | 48px | 1.1 | Hero |

---

## Animation System

### Timing Tokens

```typescript
export const DURATION = {
    INSTANT: 50,      // Micro-expressions
    QUICK: 100,       // Reactive feedback
    FAST: 150,        // State changes
    NORMAL: 250,      // Standard
    SLOW: 400,        // Emotional
    DELIBERATE: 600,  // Significant
    CONTEMPLATIVE: 1000, // Wisdom
} as const;
```

### Easing Tokens

```typescript
export const EASING = {
    NATURAL: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ENERGETIC: 'cubic-bezier(0.4, 0, 0.6, 1)',
    GENTLE: 'cubic-bezier(0.2, 0, 0.4, 1)',
    SPRING: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    ELASTIC: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;
```

### Persona Timing Multipliers

```typescript
export const PERSONA_TIMING = {
    ferni: 1.0,    // Baseline
    maya: 0.95,    // Slightly slower, nurturing
    peter: 0.8,    // Faster, energetic
    jordan: 0.85,  // Slightly fast, enthusiastic
    alex: 1.1,     // Slower, deliberate
    nayan: 1.15,   // Slowest, contemplative
} as const;
```

### Usage

```typescript
import { DURATION, EASING, PERSONA_TIMING } from './animation-constants';

function getAnimationDuration(base: number, persona: string): number {
    return base * PERSONA_TIMING[persona];
}

// Example
const fadeIn = getAnimationDuration(DURATION.NORMAL, 'peter');
// Returns: 200 (250 * 0.8)
```

---

## Component Specs

### Avatar Component

```typescript
interface AvatarProps {
    persona: 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';
    state: 'idle' | 'listening' | 'thinking' | 'speaking';
    emotion?: EmotionState;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Size mapping
const AVATAR_SIZES = {
    sm: 48,
    md: 80,
    lg: 120,
    xl: 200,
};
```

### Waveform Component

```typescript
interface WaveformProps {
    bars: number;          // Default: 9
    heights: number[];     // 0.0 - 1.0 per bar
    color: string;         // Persona color
    animation: 'idle' | 'speaking' | 'thinking';
}

// Default heights by state
const WAVEFORM_STATES = {
    idle: [0.15, 0.2, 0.25, 0.3, 0.25, 0.2, 0.15, 0.1, 0.15],
    thinking: [0.2, 0.35, 0.25, 0.4, 0.3, 0.38, 0.22, 0.32, 0.25],
    speaking: null, // Dynamic from audio
};
```

### Glow Component

```typescript
interface GlowProps {
    color: string;
    intensity: 0.3 | 0.5 | 0.7 | 0.9;
    pulseSpeed: number;    // ms per cycle
    spread: number;        // px
}

// Presets
const GLOW_PRESETS = {
    subtle: { intensity: 0.3, pulseSpeed: 3000, spread: 20 },
    normal: { intensity: 0.5, pulseSpeed: 2000, spread: 30 },
    strong: { intensity: 0.7, pulseSpeed: 1500, spread: 40 },
    celebration: { intensity: 0.9, pulseSpeed: 800, spread: 60 },
};
```

---

## State Machine

### Conversation States

```typescript
type ConversationState =
    | 'idle'
    | 'listening'
    | 'thinking'
    | 'speaking'
    | 'concern'
    | 'celebrating';

interface StateTransition {
    from: ConversationState;
    to: ConversationState;
    duration: number;
    easing: string;
}

const TRANSITIONS: StateTransition[] = [
    { from: 'idle', to: 'listening', duration: 150, easing: EASING.NATURAL },
    { from: 'listening', to: 'thinking', duration: 200, easing: EASING.NATURAL },
    { from: 'thinking', to: 'speaking', duration: 100, easing: EASING.ENERGETIC },
    { from: 'speaking', to: 'idle', duration: 400, easing: EASING.GENTLE },
    { from: '*', to: 'concern', duration: 300, easing: EASING.GENTLE },
    { from: 'concern', to: '*', duration: 600, easing: EASING.GENTLE },
];
```

---

## Emotion System

### Emotion Categories

```typescript
type CoreEmotion =
    | 'joy' | 'sadness' | 'anger' | 'fear'
    | 'surprise' | 'disgust' | 'trust' | 'anticipation';

type FerniEmotion =
    | CoreEmotion
    | 'warmth' | 'concern' | 'curiosity' | 'celebration'
    | 'empathy' | 'focus' | 'playful' | 'proud'
    | 'protective' | 'contemplative' | 'present';
```

### Emotion to Visual Mapping

```typescript
const EMOTION_VISUALS: Record<FerniEmotion, {
    glowColor: string;
    waveformPattern: string;
    animationSpeed: number;
}> = {
    joy: {
        glowColor: '#ffd700',
        waveformPattern: 'bouncy',
        animationSpeed: 0.8,
    },
    concern: {
        glowColor: '#daa520',
        waveformPattern: 'compressed',
        animationSpeed: 1.2,
    },
    // ... etc
};
```

---

## Micro-Expression System

### Timing Constraints

```typescript
const MICRO_EXPRESSION_TIMING = {
    min: 40,      // Minimum visible
    max: 150,     // Maximum for subliminal
    recognition: 80,
    concern: 60,
    delight: 100,
    curiosity: 120,
    warmth: 150,
} as const;
```

### Implementation

```typescript
function playMicroExpression(type: keyof typeof MICRO_EXPRESSION_TIMING): void {
    const duration = MICRO_EXPRESSION_TIMING[type];

    // Flash the expression
    avatar.setExpression(type);

    // Return to neutral after duration
    setTimeout(() => {
        avatar.setExpression('neutral');
    }, duration);
}
```

---

## Active Listening System

### Nod Amplitudes

```typescript
const NOD_AMPLITUDES = {
    micro: 1.5,    // During any speech
    subtle: 2.5,   // At natural pauses
    visible: 4.0,  // Key points
    affirming: 6.0, // Emotional moments
} as const;
```

### Speech Detection Integration

```typescript
interface SpeechEventHandlers {
    onSpeechStart: () => void;
    onSpeechPause: (duration: number) => void;
    onSpeechEnd: () => void;
    onKeyPoint: () => void;
}

const speechHandlers: SpeechEventHandlers = {
    onSpeechStart: () => startMicroNods(NOD_AMPLITUDES.micro),
    onSpeechPause: (d) => d > 500 && playNod(NOD_AMPLITUDES.subtle),
    onSpeechEnd: () => stopMicroNods(),
    onKeyPoint: () => playNod(NOD_AMPLITUDES.visible),
};
```

---

## Breath Sync System

### Breath Rates

```typescript
const BREATH_RATES = {
    relaxed: 5000,  // 12 breaths/min
    normal: 4000,   // 15 breaths/min
    alert: 3333,    // 18 breaths/min
} as const;

// Calming multiplier (sync slower to calm user)
const CALMING_MULTIPLIER = 1.1;
```

### Implementation

```typescript
function syncBreathing(userBreathRate: number, mode: 'match' | 'calm'): void {
    const targetRate = mode === 'calm'
        ? userBreathRate * CALMING_MULTIPLIER
        : userBreathRate;

    avatar.setBreathingRate(targetRate);
}
```

---

## Circadian System

### Time Period Definitions

```typescript
interface CircadianPeriod {
    start: number;  // Hour (0-23)
    end: number;
    warmth: number;
    brightness: number;
    speed: number;
}

const CIRCADIAN_PERIODS: Record<string, CircadianPeriod> = {
    dawn: { start: 5, end: 7, warmth: 1.1, brightness: 0.7, speed: 0.9 },
    morning: { start: 7, end: 10, warmth: 1.0, brightness: 0.9, speed: 0.95 },
    midday: { start: 10, end: 14, warmth: 0.9, brightness: 1.0, speed: 1.0 },
    afternoon: { start: 14, end: 17, warmth: 0.95, brightness: 0.95, speed: 1.0 },
    evening: { start: 17, end: 20, warmth: 1.05, brightness: 0.85, speed: 0.95 },
    night: { start: 20, end: 23, warmth: 1.15, brightness: 0.7, speed: 0.9 },
    lateNight: { start: 23, end: 2, warmth: 1.2, brightness: 0.5, speed: 0.85 },
    deepNight: { start: 2, end: 5, warmth: 1.25, brightness: 0.4, speed: 0.8 },
};
```

---

## CSS Custom Properties Summary

```css
:root {
    /* Colors */
    --color-accent: #3D5A45;
    --color-surface: #FAF9F7;
    --color-text: #2C2520;

    /* Personas */
    --persona-ferni: #4a6741;
    --persona-maya: #a67a6a;
    --persona-peter: #3a6b73;
    --persona-jordan: #c4856a;
    --persona-alex: #5a6b8a;
    --persona-nayan: #b8956a;
    --persona-current: var(--persona-ferni);

    /* Typography */
    --font-body: 'Inter', sans-serif;
    --font-display: 'Cal Sans', sans-serif;

    /* Animation */
    --duration-instant: 50ms;
    --duration-quick: 100ms;
    --duration-fast: 150ms;
    --duration-normal: 250ms;
    --duration-slow: 400ms;
    --easing-natural: cubic-bezier(0.4, 0, 0.2, 1);
    --easing-spring: cubic-bezier(0.68, -0.55, 0.265, 1.55);

    /* Glow */
    --glow-color: var(--persona-current);
    --glow-intensity: 0.5;
    --glow-spread: 30px;

    /* Circadian (set dynamically) */
    --circadian-warmth: 1.0;
    --circadian-brightness: 1.0;
    --circadian-speed: 1.0;
}
```

---

## File Structure Reference

```
design-system/
├── tokens/
│   ├── colors.json         # Color definitions
│   ├── animation.json      # Animation definitions
│   ├── typography.json     # Type scale
│   └── personas.json       # Persona profiles
├── dist/
│   ├── tokens.css          # Generated CSS
│   └── animation-constants.generated.ts
└── brand/
    ├── FERNI-BRAND-GUIDELINES.md
    └── BETTER-THAN-HUMAN.md
```

---

*Build with intention. Every pixel tells the user: "I was made with care."*
