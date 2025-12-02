# VoiceAI Design System

A centralized design token system for theming the VoiceAI landing page and application.

## Quick Start

```bash
# Build tokens (generates CSS, TypeScript, and Tailwind config)
npm run build:tokens

# Start the style guide with hot reload
npm run design-system:dev
# Open http://localhost:3333

# Run visual regression tests
npm run design-system:test
```

## Structure

```
design-system/
├── tokens/                    # Source of truth (edit these)
│   ├── colors.json           # Theme colors + persona colors
│   ├── typography.json       # Fonts, sizes, weights
│   ├── spacing.json          # Spacing scale, shadows, z-index
│   └── animation.json        # Easings, durations, keyframes
├── dist/                      # Generated output (don't edit)
│   ├── tokens.css            # CSS custom properties
│   ├── tokens.ts             # TypeScript types + utilities
│   ├── tailwind.config.js    # Tailwind v3 config
│   └── tailwind-theme.css    # Tailwind v4 @theme block
├── preview/
│   └── index.html            # Visual style guide
├── tests/
│   └── visual.test.ts        # Playwright visual tests
├── build.js                   # Token compiler
├── dev-server.js             # Style guide server + watch
└── README.md
```

## Themes

### Midnight Gold (Dark)
The default dark theme with warm gold accents.
- Background: Deep blacks (#08080c)
- Accent: Warm gold (#c8a45c)
- Mode: `data-theme="midnight"`

### Zen Garden (Light)
Apple.com meets Fidelity meets Claude.ai meets Japan.
- Background: Warm whites (#fafaf9)
- Accent: Natural green (#166534)
- Natural colors: wood, bamboo, stone, sand, moss
- Mode: `data-theme="zen"`

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

### Accessibility

The build automatically validates WCAG AA contrast ratios:

```bash
npm run build:tokens
# Output includes:
# ✅ Primary text on background: 19.15:1 (AAA)
# ✅ Secondary text on background: 7.87:1 (AAA)
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
