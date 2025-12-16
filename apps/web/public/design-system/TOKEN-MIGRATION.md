# Design Token Migration Guide

This document maps deprecated token names to their canonical replacements.

## Token Naming Convention

**Canonical format:** `--{category}-{subcategory}-{variant}`

Examples:
- `--color-background-primary` (background color, primary variant)
- `--color-text-primary` (text color, primary)
- `--font-body` (typography, body text)
- `--ma-rest` (spacing, medium - using MA system)
- `--duration-base` (animation, base timing)

## Deprecated Tokens → Canonical Replacements

### Colors

| Deprecated | Canonical | Notes |
|------------|-----------|-------|
| `--color-bg-primary` | `--color-background-primary` | Full name preferred |
| `--color-bg-secondary` | `--color-background-secondary` | |
| `--color-bg-elevated` | `--color-background-elevated` | |
| `--color-bg-glass` | `--color-background-glass` | |
| `--background` | `--color-background-primary` | Too generic |
| `--foreground` | `--color-text-primary` | Use semantic name |
| `--glass-background` | `--color-background-glass` | Use full path |
| `--glass-blur` | `--blur-glass` | Separate blur category |
| `--glass-border` | `--color-border-subtle` | No glass-specific border |

### Typography

| Deprecated | Canonical | Notes |
|------------|-----------|-------|
| `--font-primary` | `--font-body` | Use semantic purpose |
| `--font-secondary` | `--font-display` | |
| `--font-mono` | `--font-code` | |

### Spacing

Use **MA spacing system** (based on Fibonacci):

| Deprecated | Canonical | Value | Meaning |
|------------|-----------|-------|---------|
| `--space-xs` | `--ma-breath` | 4px | Quick pause |
| `--space-sm` | `--ma-pause` | 8px | Brief moment |
| `--space-md` | `--ma-rest` | 16px | Comfortable rest |
| `--space-lg` | `--ma-silence` | 24px | Meaningful pause |
| `--space-xl` | `--ma-meditation` | 40px | Deep contemplation |
| `--space-2xl` | `--ma-emptiness` | 64px | Vast space |

**Note:** Both systems work, but new code should prefer `--ma-*` names.

### Glass Effects

| Deprecated | Canonical | Notes |
|------------|-----------|-------|
| `--glass-background` | `--color-background-glass` | Full color path |
| `--glass-blur` | `--blur-glass` | In blur category |
| `--glass-border` | `--color-border-subtle` | Use standard border |

### Animation

| Deprecated | Canonical | Notes |
|------------|-----------|-------|
| Hardcoded `300ms` | `DURATION.BASE` | Import from animation-constants.ts |
| Hardcoded `200ms` | `DURATION.FAST` | |
| Hardcoded `500ms` | `DURATION.SLOW` | |
| Hardcoded `ease-out` | `EASING.SMOOTH` | |

## File-Specific Migrations

### onboarding.html

Replace these undefined variables:

```css
/* Before (broken) */
background: var(--glass-background);
backdrop-filter: blur(var(--glass-blur));
border: 1px solid var(--glass-border);

/* After (working) */
background: var(--color-bg-glass);
backdrop-filter: var(--backdrop-blur-md);
border: 1px solid var(--color-border-subtle);
```

### UI Components

Replace hardcoded colors:

```typescript
// Before
backgroundColor: '#1a1a2e'
color: '#fff'

// After
backgroundColor: 'var(--color-bg-primary)'
color: 'var(--color-text-primary)'
```

## Quick Reference: Common Token Categories

### Backgrounds
- `--color-background-primary` - Main background
- `--color-background-secondary` - Card/section backgrounds
- `--color-background-elevated` - Raised elements
- `--color-background-glass` - Glassmorphism panels

### Text
- `--color-text-primary` - Main text
- `--color-text-secondary` - Supporting text
- `--color-text-muted` - Subtle text
- `--color-text-dimmed` - Very subtle text

### Borders
- `--color-border-subtle` - Light borders
- `--color-border-medium` - Standard borders

### Accents
- `--color-accent-primary` - Primary action color
- `--color-accent-glow` - Glow effects

### Persona Colors
- `--persona-primary` - Current persona's main color
- `--persona-secondary` - Current persona's accent
- `--persona-glow` - Current persona's glow effect

## Validation

Run the token validation script:

```bash
npm run lint:tokens
```

This will identify all hardcoded values that should use tokens.
