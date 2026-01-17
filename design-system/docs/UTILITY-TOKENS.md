# Utility Tokens - Ferni Design System

> **Beyond CSS variables - semantic patterns that adapt to context.**

---

## Overview

Utility tokens provide **semantic, context-aware** colors for common UI patterns. Unlike raw color values, these tokens:

1. **Adapt to theme** - Different values for Zen (light) vs Midnight (dark)
2. **Express intent** - "focus-ring" not "green-30-percent"
3. **Stay consistent** - Same token, same behavior everywhere

---

## Focus Ring Tokens

Use for interactive element focus states. These respect the active theme's accent color.

| Token | Zen (Light) | Midnight (Dark) | Use Case |
|-------|-------------|-----------------|----------|
| `--color-utility-focus-ring` | `rgba(61, 90, 69, 0.3)` | `rgba(212, 168, 74, 0.3)` | Strong focus rings |
| `--color-utility-focus-ring-subtle` | `rgba(61, 90, 69, 0.1)` | `rgba(212, 168, 74, 0.1)` | Subtle focus/hover states |

### Usage

```css
/* Input focus */
input:focus {
  box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
}

/* Button focus */
button:focus-visible {
  box-shadow: 0 0 0 3px var(--color-utility-focus-ring);
}

/* Card selection */
.card.selected {
  box-shadow: 0 0 0 2px var(--color-utility-focus-ring);
}
```

---

## Backdrop Tokens

Use for modal overlays, sidebars, and dimming backgrounds.

| Token | Zen (Light) | Midnight (Dark) | Use Case |
|-------|-------------|-----------------|----------|
| `--color-utility-backdrop` | `rgba(44, 37, 32, 0.6)` | `rgba(20, 16, 14, 0.7)` | Standard modal backdrop |
| `--color-utility-backdrop-light` | `rgba(44, 37, 32, 0.4)` | `rgba(20, 16, 14, 0.5)` | Light overlay (notifications) |
| `--color-utility-scrim` | `rgba(44, 37, 32, 0.8)` | `rgba(20, 16, 14, 0.85)` | Heavy overlay (critical modals) |

### Usage

```css
/* Modal backdrop */
.modal-overlay {
  background: var(--color-utility-backdrop);
  backdrop-filter: blur(8px);
}

/* Notification toast backdrop */
.toast-container {
  background: var(--color-utility-backdrop-light);
}

/* Critical confirmation dialog */
.danger-modal-overlay {
  background: var(--color-utility-scrim);
}
```

---

## Semantic Tint Tokens

Use for status backgrounds that need to be subtle but visible.

| Token | Zen (Light) | Midnight (Dark) | Use Case |
|-------|-------------|-----------------|----------|
| `--color-semantic-success-tint` | `rgba(61, 122, 82, 0.08)` | `rgba(107, 196, 143, 0.12)` | Success state backgrounds |
| `--color-semantic-error-tint` | `rgba(181, 69, 58, 0.08)` | `rgba(224, 117, 117, 0.12)` | Error state backgrounds |
| `--color-semantic-warning-tint` | `rgba(166, 124, 53, 0.08)` | `rgba(224, 184, 96, 0.12)` | Warning state backgrounds |
| `--color-semantic-info-tint` | `rgba(58, 107, 156, 0.08)` | `rgba(125, 166, 207, 0.12)` | Info state backgrounds |

### Usage

```css
/* Error message container */
.error-message {
  background: var(--color-semantic-error-tint);
  border: 1px solid var(--color-semantic-error-glow);
  color: var(--color-semantic-error);
}

/* Success notification */
.success-banner {
  background: var(--color-semantic-success-tint);
  border-left: 3px solid var(--color-semantic-success);
}

/* Warning callout */
.warning-callout {
  background: var(--color-semantic-warning-tint);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
}
```

---

## Migration Guide

### Before (hardcoded)

```css
/* ❌ Don't do this */
box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
background: rgba(44, 37, 32, 0.6);
background: rgba(204, 68, 68, 0.08);
```

### After (tokenized)

```css
/* ✅ Do this */
box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
background: var(--color-utility-backdrop);
background: var(--color-semantic-error-tint);
```

---

## Why Tokens Matter

### 1. **Theme Consistency**
Tokens automatically adjust for light/dark themes. Hardcoded rgba values don't.

### 2. **Semantic Clarity**
`--color-utility-focus-ring` tells developers *what* it's for, not *what color* it is.

### 3. **Easy Updates**
Change one token value, update everywhere. No find-and-replace across 100 files.

### 4. **Accessibility**
Tokens can be tuned for high-contrast modes. Hardcoded values can't.

---

## Token Philosophy

> **"Name the intent, not the implementation."**

- ✅ `--color-utility-focus-ring` (what it does)
- ❌ `--color-green-30-opacity` (what it looks like)

This philosophy means tokens remain meaningful even when colors change.

