# VoiceAI Design System

A centralized design token system for theming the VoiceAI landing page and application.

## Quick Start

```bash
# Build everything (tokens + assets) - recommended
npm run build:design-system

# Build tokens only (CSS, TypeScript, Tailwind config)
npm run build:tokens

# Build assets only (copies to frontend)
npm run build:assets

# Start the style guide with hot reload
npm run design-system:dev
# Open http://localhost:3333

# Run visual regression tests
npm run design-system:test
```

## Structure

This is the **single source of truth** for all Ferni brand assets and design tokens.

```
design-system/
├── tokens/                    # 🎯 Source of truth - JSON tokens (edit these)
│   ├── colors.json           # Theme colors + persona colors
│   ├── typography.json       # Fonts, sizes, weights
│   ├── spacing.json          # Spacing scale, shadows, z-index
│   ├── animation.json        # Easings, durations, keyframes
│   └── effects.json          # Gradients, glows, blur effects
├── assets/                    # 🎨 Brand assets (edit these)
│   ├── logos/                # Logo SVGs + generated PNGs
│   │   ├── ferni-logo.svg    # Master logo
│   │   ├── ferni-logo-dark.svg
│   │   ├── ferni-logo-simple.svg
│   │   └── ...
│   ├── icons/                # App icons for iOS/Android
│   │   ├── app-icon-1024.svg
│   │   ├── app-icon-ios-simple.svg
│   │   └── app-icon-android.svg
│   ├── favicons/             # Browser/PWA icons
│   │   ├── favicon-16.svg
│   │   ├── favicon-32.svg
│   │   └── favicon-192.svg
│   └── sounds/               # Audio assets
│       ├── connect.mp3
│       ├── disconnect.mp3
│       └── handoff-to-*.mp3
├── brand/                     # 📚 Brand documentation
│   ├── GUIDELINES.md         # Full brand identity guide
│   ├── SCREEN-GUIDELINES.md  # Digital design standards
│   └── brand-book.html       # Interactive brand book
├── dist/                      # ⚙️ Generated output (DON'T EDIT)
│   ├── tokens.css            # CSS custom properties
│   ├── tokens.ts             # TypeScript types + utilities
│   ├── tailwind.config.js    # Tailwind v3 config
│   └── components.css        # Component styles
├── preview/
│   └── index.html            # Visual style guide
├── tests/
│   └── visual.test.ts        # Playwright visual tests
├── build.js                   # Token compiler
├── build-assets.js            # Asset builder + copier
├── dev-server.js             # Style guide server + watch
└── README.md
```

### Build Output

Running `npm run build:design-system` generates and copies assets to:

```
frontend-typescript/public/design-system/
├── tokens.css                # CSS custom properties
├── tokens.ts                 # TypeScript utilities
├── assets/                   # All brand assets
│   ├── logos/
│   ├── icons/
│   └── favicons/
├── sounds/                   # Audio files
├── brand/                    # Brand documentation
└── manifest.json             # Asset inventory
```

Legacy paths (`/sounds/`, `/icons/`, `/logo.svg`) are also maintained for backwards compatibility.

## Themes

### Midnight Gold (Dark)
Warm dark theme with golden light - like a candlelit evening.
- Background: Warm brown-blacks (`#0c0a08`)
- Text: Cream-tinted whites (`#faf6f0`)
- Accent: Rich gold (`#d4a84a`)
- Borders: Golden-tinted for warmth
- Mode: `data-theme="midnight"`

### Zen Garden (Light)
Warm paper, natural ink, Japanese garden serenity.
- Background: Warm paper cream (`#faf8f5`)
- Text: Natural ink tones (`#2c2520`)
- Accent: Forest green (`#2d5a3d`)
- Natural colors: wood, bamboo, stone, sand, moss, paper, ink, tea
- Mode: `data-theme="zen"`

### Typography
- **Midnight Display**: DM Serif Display (elegant serif)
- **Zen Display**: Fraunces (organic variable serif)
- **Midnight Body**: DM Sans (friendly geometric)
- **Zen Body**: Source Sans 3 (humanist)
- **Mono**: JetBrains Mono

## External Dependencies

### GSAP (Optional)
The landing page shoji screen animation requires GSAP for smooth door sliding effects.

```html
<!-- Add before closing </body> tag -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

**TypeScript usage:**
```typescript
import { animateLandingReveal, LANDING_CLASSES } from '@design-system/tokens';

// Elements
const shojiLeft = document.querySelector(`.${LANDING_CLASSES.shojiLeft}`);
const shojiRight = document.querySelector(`.${LANDING_CLASSES.shojiRight}`);
const contentCard = document.querySelector(`.${LANDING_CLASSES.contentCard}`);

// Animate reveal on click
animateLandingReveal(shojiLeft, shojiRight, contentCard);
```

> **Note**: If GSAP is not loaded, the landing animation gracefully falls back to a simple fade-in.

## Usage

### HTML (Plain)

```html
<!-- 1. Import the tokens -->
<link rel="stylesheet" href="design-system/dist/tokens.css">

<!-- 2. Set theme on html element -->
<html data-theme="midnight">

<!-- 3. Set persona on body (optional) -->
<body data-persona="ferni">

<!-- 4. Use CSS variables -->
<style>
  .card {
    background: var(--color-background-elevated);
    color: var(--color-text-primary);
    border-radius: var(--radius-xl);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-lg);
  }

  .button {
    background: var(--color-accent-primary);
    transition: all var(--duration-fast) var(--ease-ease-out-expo);
  }

  /* Persona-aware styling */
  .persona-ring {
    border-color: var(--persona-primary);
    box-shadow: 0 0 20px var(--persona-glow);
  }
</style>
```

### TypeScript Frontend

```typescript
import {
  initTheme,
  setTheme,
  toggleTheme,
  setPersona,
  getTheme,
  onThemeChange,
  getCSSVar,
} from './theme';

// Initialize on app load
initTheme(); // Reads from localStorage or system preference

// Toggle theme
document.querySelector('.theme-toggle').addEventListener('click', () => {
  const newTheme = toggleTheme();
  console.log('Switched to:', newTheme);
});

// Listen for changes
onThemeChange((theme) => {
  console.log('Theme changed to:', theme);
});

// Set persona when agent changes
setPersona('jack-bogle');

// Read CSS variable values
const accentColor = getCSSVar('--color-accent-primary');
```

### Tailwind v4

```css
/* In your main CSS file */
@import "design-system/dist/tokens.css";
@import "design-system/dist/tailwind-theme.css";
@import "tailwindcss";
```

```html
<!-- Theme-aware utilities -->
<div class="bg-background-primary text-text-primary">
  <button class="bg-accent hover:bg-accent-hover rounded-xl shadow-lg">
    Click me
  </button>
</div>
```

## Token Categories

### Colors

| Variable | Description |
|----------|-------------|
| `--color-background-*` | Background colors (primary, secondary, tertiary, elevated) |
| `--color-text-*` | Text colors (primary, secondary, muted, dimmed, inverse) |
| `--color-border-*` | Border colors (subtle, medium, strong) |
| `--color-accent-*` | Accent colors (primary, hover, pressed, glow, subtle) |
| `--color-semantic-*` | Status colors (success, error, warning, info + glow variants) |
| `--persona-*` | Persona colors (primary, secondary, glow, tint) |

### Typography

| Variable | Description |
|----------|-------------|
| `--font-display` | Display/heading font family |
| `--font-body` | Body text font family |
| `--font-mono` | Monospace font family |
| `--text-*` | Font sizes (2xs through 6xl) |
| `--font-weight-*` | Font weights (light through extrabold) |
| `--leading-*` | Line heights (none, tight, snug, normal, relaxed, loose) |
| `--tracking-*` | Letter spacing (tighter through widest) |

### Spacing

| Variable | Description |
|----------|-------------|
| `--space-*` | Spacing scale (0-96, px, 0.5, 1.5, etc.) |
| `--spacing-*` | Semantic spacing (2xs through 4xl) |
| `--radius-*` | Border radius (none through full) |
| `--z-*` | Z-index scale (hide through tooltip) |

### Shadows

| Variable | Description |
|----------|-------------|
| `--shadow-xs` | Extra small shadow |
| `--shadow-sm` | Small shadow |
| `--shadow-md` | Medium shadow |
| `--shadow-lg` | Large shadow |
| `--shadow-xl` | Extra large shadow |
| `--shadow-glow` | Accent glow effect |
| `--shadow-inner` | Inset shadow |

### Animation

| Variable | Description |
|----------|-------------|
| `--ease-*` | Easing functions (linear, ease-out-expo, spring, etc.) |
| `--duration-*` | Durations (instant through glacial) |
| `--transition-*` | Pre-composed transitions |

## Personas

Each persona has unique accent colors:

| Persona | Primary | Use Case |
|---------|---------|----------|
| ferni | Purple (#8b5cf6) | Life Coach |
| jack-bogle | Gold (#c8a45c) | Sage Mentor |
| peter-lynch | Green (#22c55e) | Research |
| alex-chen | Blue (#3b82f6) | Appointments |
| maya-santos | Pink (#f472b6) | Travel |
| jordan-taylor | Orange (#fb923c) | Life Planning |

Set persona: `<body data-persona="jack-bogle">`

## Premium Features

### Time-Aware Ambient Warmth
The UI automatically adjusts warmth based on time of day, creating a WALL-E style "living light":

| Time | Effect |
|------|--------|
| Dawn (5-7am) | Golden pink warmth |
| Morning (7-11am) | Warm gold |
| Midday (11am-2pm) | Neutral (no tint) |
| Afternoon (2-5pm) | Slight warmth |
| Evening (5-9pm) | Amber glow |
| Night (9pm-5am) | Cool, calm |

```typescript
import { startAmbientCycle, getAmbientInfo } from './theme';

// Start automatic updates (every 5 minutes)
startAmbientCycle();

// Get current time info
const { timeOfDay, config } = getAmbientInfo();
```

### Pixar Animation Philosophy

Our animations follow the **12 Principles of Animation** from Disney/Pixar, adapted for UI. This makes our AI personas feel alive and human.

#### The 12 Principles Applied

| # | Principle | Description | Our Implementation |
|---|-----------|-------------|-------------------|
| 1 | **Squash & Stretch** | Objects deform based on speed/mass | Avatar compresses horizontally when stretching vertically (`scaleX: 0.988` when `scaleY: 1.025`) |
| 2 | **Anticipation** | Wind-up before action | 80ms "wind up" before reactions (slight scale down) |
| 3 | **Staging** | Clear visual hierarchy | Single animation system - no competing animations |
| 4 | **Straight Ahead** | Continuous motion | Continuous breathing animation, always alive |
| 5 | **Follow-Through** | Overshoot and settle | All reactions have 92% settle keyframe before return |
| 6 | **Slow In/Out** | Natural acceleration | Custom easing on all animations - never linear |
| 7 | **Arcs** | Natural curved paths | `translateY` creates gentle lift during breathing |
| 8 | **Secondary Action** | Supporting movements | Glow brightness pulse slightly out of phase with breathing |
| 9 | **Timing** | Speed conveys weight | Different speeds per state (5s idle, 3s speaking) |
| 10 | **Exaggeration** | Push for clarity | Pushed movements just enough to feel alive (1.025 scale when speaking) |
| 11 | **Solid Drawing** | Weight and depth | Consistent `transform-origin: center center` |
| 12 | **Appeal** | Likeable characters | WALL-E inspired curious eye-tracking |

#### Avatar Squash & Stretch Parameters

From `animation.json` - use these values for consistent avatar animations:

```typescript
import { AVATAR_SQUASH_STRETCH, getAvatarParams } from 'design-system/dist/tokens';

// Get params for current state
const params = getAvatarParams('speaking');
// { scaleY: 1.025, scaleX: 0.988, translateY: -3, rotate: 0.8 }
```

| State | scaleY | scaleX | translateY | rotate |
|-------|--------|--------|------------|--------|
| idle | 1.012 | 0.994 | -1.5px | 0.3° |
| connected | 1.018 | 0.991 | -2px | 0.5° |
| speaking | 1.025 | 0.988 | -3px | 0.8° |
| listening | 1.015 | 0.993 | -1.8px | -0.4° |

#### Golden Ratio Timing

All animations use timing based on the golden ratio (φ = 1.618) for natural rhythm:

```typescript
import { PHI, PHI_INVERSE, FIBONACCI_TIMING } from 'design-system/dist/tokens';

// φ = 1.618033988749895
// Fibonacci sequence for timing: 233ms, 377ms, 610ms, 987ms, 1597ms
```

#### Avatar Animation CSS Classes

```html
<!-- Reactions (apply to avatar container) -->
<div class="avatar-container animate-avatar-nod">...</div>
<div class="avatar-container animate-avatar-shake">...</div>
<div class="avatar-container animate-avatar-bounce">...</div>
<div class="avatar-container animate-avatar-pulse">...</div>
<div class="avatar-container animate-avatar-curious">...</div>
<div class="avatar-container animate-avatar-attentive">...</div>

<!-- Continuous animations -->
<div class="animate-pixar-breathe">Living presence</div>
<div class="animate-pixar-float">Floating like balloons in Up</div>

<!-- Thinking dots with stagger -->
<div class="avatar-dots">
  <span class="animate-pixar-bounce">●</span>
  <span class="animate-pixar-bounce">●</span>
  <span class="animate-pixar-bounce">●</span>
</div>
```

#### Persona Animation Profiles

Each persona has a distinct animation personality (see `animation.json`):

| Persona | Inspiration | Timing | Bounciness | Style |
|---------|-------------|--------|------------|-------|
| Ferni | WALL-E (curious, gentle) | 1.0x | High (0.7) | Playful, warm |
| Jack Bogle | Carl from Up (wise) | 1.4x | Low (0.3) | Measured, deliberate |
| Peter Lynch | Linguini (energetic) | 0.8x | Medium (0.6) | Quick, practical |
| Alex Chen | Joy (warm, articulate) | 1.1x | Medium (0.5) | Smooth, empathetic |
| Maya Santos | EVE (focused) | 0.95x | Low (0.4) | Methodical |
| Jordan Taylor | Dory (joyful) | 0.85x | High (0.8) | Expressive |

#### Pixar Keyframes (Full List)

```css
/* Avatar reactions with squash & stretch */
@keyframes avatarNod { /* Agreement - like WALL-E acknowledging */ }
@keyframes avatarShake { /* Gentle disagreement */ }
@keyframes avatarBounce { /* Luxo Jr. excited hop */ }
@keyframes avatarPulse { /* Warm heartbeat acknowledgment */ }
@keyframes avatarCuriousTilt { /* WALL-E examining something */ }
@keyframes avatarAttentiveLean { /* Focused listening */ }

/* General Pixar animations */
@keyframes pixarBounce { /* Full squash & stretch bounce */ }
@keyframes pixarBreathe { /* Living organic breathing */ }
@keyframes pixarFloat { /* Balloons in Up */ }
@keyframes pixarJoyBounce { /* Excited hop */ }
@keyframes pixarAnticipate { /* Wind-up before action */ }
@keyframes pixarSettle { /* Overshoot and settle */ }
@keyframes pixarThinkingTilt { /* Curious head tilt */ }
@keyframes pixarAttention { /* Snap to attention - like EVE */ }
@keyframes pixarSadSlump { /* Weight of sadness */ }
```

#### Using in TypeScript

```typescript
import {
  PHI,
  PHI_INVERSE,
  AVATAR_SQUASH_STRETCH,
  AVATAR_BREATH_TIMING,
  REACTION_PHASES,
  getAvatarParams,
} from 'design-system/dist/tokens';

// Create Pixar-style breathing animation
function createBreathingKeyframes(state: 'idle' | 'speaking') {
  const p = getAvatarParams(state);
  return [
    { transform: 'scale3d(1, 1, 1) translate3d(0, 0, 0)' },
    { transform: \`scale3d(\${p.scaleX}, \${p.scaleY}, 1) translate3d(0, \${p.translateY}px, 0) rotate(\${p.rotate}deg)\` },
    { transform: 'scale3d(1, 1, 1) translate3d(0, 0, 0)' },
  ];
}

// Apply with Web Animations API
avatarElement.animate(createBreathingKeyframes('speaking'), {
  duration: parseInt(AVATAR_BREATH_TIMING.speaking),
  iterations: Infinity,
  easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
});
```

### WALL-E Inspired Animations
CSS classes for delightful micro-interactions:

| Class | Effect |
|-------|--------|
| `.breathing` | Gentle idle animation (avatar breathes) |
| `.blink-animation` | Eye blink effect |
| `.curious-hover` | Curious head tilt on hover |
| `.excited` | Happy wiggle |
| `.happy-bounce` | Bounce for positive events |
| `.sad-droop` | Sympathetic droop |
| `.eve-float` | Smooth floating (like EVE) |
| `.thinking-animation` | Thoughtful lean |
| `.attention` | Attention grab |

### Magnetic Hover
Buttons "reach toward" the cursor like WALL-E's curiosity:

```typescript
// Automatically enabled for .btn-magnetic, .btn-primary, .btn-connect
// CSS variables --magnetic-x and --magnetic-y are updated on mousemove
```

## Testing

### Visual Regression Tests

```bash
# Install Playwright (first time only)
npm install -D @playwright/test
npx playwright install

# Run tests
npm run design-system:test

# Update snapshots after intentional changes
npm run design-system:test:update
```

### Accessibility (WCAG 2.1 AA Compliance)

The design system enforces WCAG 2.1 AA accessibility standards through automated checks in the build pipeline.

#### Automated Checks

```bash
# Build with accessibility validation (warns on issues)
npm run build

# Build with strict mode (fails on accessibility errors)
npm run build:strict

# Run standalone accessibility check
npm run check:a11y

# Run check with fix suggestions
npm run check:a11y:fix

# Full test (build + codebase scan)
npm run test:a11y
```

#### WCAG 2.1 AA Requirements

| Text Type | Minimum Contrast | Tokens |
|-----------|-----------------|--------|
| Normal text (<18pt) | 4.5:1 | `--color-text-primary`, `--color-text-secondary`, `--color-text-muted` |
| Large text (≥18pt) | 3.0:1 | `--color-text-dimmed`, `--color-accent-text` |
| UI components | 3.0:1 | Borders, icons, focus indicators |

#### Dark Theme Text Colors (Cedar Night)

All text colors tested against `#70605a` (elevated background):

| Token | Color | Contrast | Use |
|-------|-------|----------|-----|
| `--color-text-primary` | `#faf6f0` | 5.56:1 ✅ | Headings, important content |
| `--color-text-secondary` | `#f0ebe4` | 5.05:1 ✅ | Body text, descriptions |
| `--color-text-muted` | `#e8e2da` | 4.65:1 ✅ | Labels, eyebrows, hints |
| `--color-text-dimmed` | `#ddd6cc` | 4.15:1 ✅ | Large text only (18pt+) |
| `--color-accent-text` | `#e8c870` | 3.68:1 ✅ | Gold accent text (large only) |

#### ⚠️ PROHIBITED: Persona Colors as Text

**NEVER use `--persona-primary` or `--member-color` as text colors on dark backgrounds.** These colors fail WCAG AA:

| Color | Contrast on Dark BG | Status |
|-------|---------------------|--------|
| Ferni Green (`#4a6741`) | 1.06:1 | ❌ FAIL |
| Jack Brown (`#9a7b5a`) | 1.53:1 | ❌ FAIL |
| Peter Teal (`#3a6b73`) | 1.01:1 | ❌ FAIL |
| Alex Blue (`#5a6b8a`) | 1.18:1 | ❌ FAIL |
| Maya Terracotta (`#a67a6a`) | 1.60:1 | ❌ FAIL |
| Jordan Coral (`#c4856a`) | 2.03:1 | ❌ FAIL |

```typescript
// ❌ WRONG - fails accessibility
color: var(--persona-primary)
color: #4a6741

// ✅ CORRECT - use text tokens
color: var(--color-text-primary)      // For body text
color: var(--color-accent-text)       // For accent text (large only)
```

#### Persona Colors - Correct Usage

Persona colors should ONLY be used for:
- ✅ Backgrounds and fills
- ✅ Borders and outlines
- ✅ Decorative elements
- ✅ Glows and shadows
- ❌ **NEVER for text**

```css
/* Correct persona usage */
.persona-card {
  border-color: var(--persona-primary);
  box-shadow: 0 0 20px var(--persona-glow);
  background: var(--persona-tint);
}

/* Text should use text tokens */
.persona-card h2 {
  color: var(--color-text-primary);  /* NOT --persona-primary */
}
```

#### CI/CD Integration

The accessibility checks run automatically:
1. **Pre-commit hook**: `lint-staged` runs `check-a11y-colors.js --strict` on UI files
2. **Build time**: `build.js --strict` validates all token contrast ratios
3. **Quality gate**: `npm run quality` includes accessibility in the check suite

To skip checks (not recommended):
```bash
npm run build -- --skip-a11y
```

## Modifying Tokens

1. Edit the JSON files in `tokens/`
2. Run `npm run build:tokens` (or use `npm run design-system:dev` for auto-rebuild)
3. Verify in the style guide at http://localhost:3333
4. Commit both the JSON and generated files

## Adding a New Theme

1. Add theme object to `tokens/colors.json`:
```json
{
  "themes": {
    "newTheme": {
      "meta": { "name": "New Theme", "mode": "dark" },
      "background": { ... },
      "text": { ... },
      ...
    }
  }
}
```

2. Rebuild: `npm run build:tokens`

3. Add theme button to style guide preview

## Adding a New Persona

1. Add to `tokens/colors.json`:
```json
{
  "personas": {
    "new-persona": {
      "primary": "#hexcolor",
      "secondary": "#hexcolor",
      "glow": "rgba(...)",
      "tint": "rgba(...)"
    }
  }
}
```

2. Rebuild and update TypeScript types
