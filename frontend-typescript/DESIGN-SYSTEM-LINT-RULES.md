# 🎨 Design System Lint Rules

ESLint rules that enforce design system compliance in UI files.

## Overview

These rules prevent hardcoded CSS values in `frontend-typescript/src/ui/**/*.ts` files. All styling should use CSS variables from `tokens.css` or constants from `animation-constants.ts`.

## Rules

### 1. No Hardcoded Hex Colors
```typescript
// ❌ Bad
background: '#4a6741';
color: '#2c2520';

// ✅ Good
background: 'var(--persona-primary)';
color: 'var(--color-text-primary)';
```

**Available Tokens:**
- `--persona-primary`, `--persona-secondary`, `--persona-glow`, `--persona-tint`
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- `--color-background-primary`, `--color-background-elevated`
- `--color-semantic-success`, `--color-semantic-error`, `--color-semantic-warning`

### 2. No Hardcoded rgba() Values
```typescript
// ❌ Bad
background: 'rgba(44, 37, 32, 0.5)';
border: '1px solid rgba(74, 103, 65, 0.08)';

// ✅ Good
background: 'var(--backdrop-medium)';
border: '1px solid var(--color-border-subtle)';
```

**Available Tokens:**
- `--backdrop-light` (30% opacity)
- `--backdrop-medium` (50% opacity)
- `--backdrop-heavy` (70% opacity)
- `--backdrop-menu` (for slide-in menus)
- `--backdrop-page` (for full-page modals)
- `--persona-tint` (persona-specific tint)
- `--color-border-subtle`, `--color-border-medium`

### 3. No Hardcoded Font Families
```typescript
// ❌ Bad
fontFamily: "'Inter', sans-serif";
fontFamily: "var(--font-primary, 'Inter', sans-serif)";

// ✅ Good
fontFamily: 'var(--font-body)';
fontFamily: 'var(--font-display)';
```

**Available Tokens:**
- `--font-body` - Inter (body text)
- `--font-display` - Plus Jakarta Sans (headings)

### 4. No Hardcoded Blur Values
```typescript
// ❌ Bad
backdropFilter: 'blur(8px)';

// ✅ Good
backdropFilter: 'blur(var(--glass-blur-subtle))';
backdropFilter: 'blur(var(--glass-blur-heavy))';
```

**Available Tokens:**
- `--glass-blur-subtle` (8px)
- `--glass-blur-heavy` (12px)

### 5. No Hardcoded Durations
```typescript
// ❌ Bad
transition: 'opacity 300ms ease';
duration: 600

// ✅ Good
import { DURATION, EASING } from '../config/animation-constants.js';
transition: `opacity ${DURATION.SLOW}ms ${EASING.STANDARD}`;
duration: DURATION.DRAMATIC
```

**Available Constants (from animation-constants.ts):**
| Constant | Value | Use Case |
|----------|-------|----------|
| `DURATION.MICRO` | 50ms | Immediate feedback |
| `DURATION.FAST` | 100ms | Hover, focus |
| `DURATION.NORMAL` | 200ms | Standard transitions |
| `DURATION.SLOW` | 300ms | Deliberate moves |
| `DURATION.MODERATE` | 400ms | Panel slides |
| `DURATION.DELIBERATE` | 500ms | Emphasis |
| `DURATION.DRAMATIC` | 600ms | Celebrations |
| `DURATION.CELEBRATION` | 800ms | Major events |
| `DURATION.GLACIAL` | 1500ms | Ambient effects |

### 6. No Hardcoded Box Shadows
```typescript
// ❌ Bad
boxShadow: '0 4px 12px rgba(44, 37, 32, 0.15)';

// ✅ Good
boxShadow: 'var(--shadow-md)';
boxShadow: 'var(--shadow-2xl)';
```

**Available Tokens:**
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`
- `--shadow-button-rest`, `--shadow-button-hover`, `--shadow-button-pressed`
- `--shadow-inset-subtle`

## How to Fix Violations

1. **Find the right token** in `public/design-system/tokens.css`
2. **Replace the hardcoded value** with the CSS variable
3. **For new tokens**, add them to `tokens.css` first, then use them

## Exception: Fallback Values

Fallback values inside `var()` are allowed for resilience:
```typescript
// ✅ OK - fallback is only used if variable is undefined
background: 'var(--persona-primary, #4a6741)';
```

## Running the Linter

```bash
# From frontend-typescript directory
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Disabling Rules (Rare Cases)

If you have a legitimate reason to use a hardcoded value:
```typescript
// eslint-disable-next-line no-restricted-syntax
const EXTERNAL_API_COLOR = '#4285F4'; // Google blue, must match API
```

Document why the exception is needed!

## Related Files

- `public/design-system/tokens.css` - All CSS variables
- `src/config/animation-constants.ts` - Duration/easing constants
- `brand/FERNI-BRAND-GUIDELINES.md` - Brand color palette
- `src/ui/engagement-components.ts` - Shared UI component styles

