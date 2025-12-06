# Ferni Design System Style Guide

## Quick Reference for UI Development

This guide provides quick-access patterns for building brand-compliant Ferni UI components.

---

## 🎨 Color System

### Never Hardcode Colors
```css
/* ❌ NEVER */
background: #4a6741;
color: rgba(44, 37, 32, 0.5);

/* ✅ ALWAYS */
background: var(--persona-primary);
color: var(--color-text-secondary);
```

### Key Color Tokens

| Token | Light Theme | Dark Theme | Use |
|-------|-------------|------------|-----|
| `--color-text-primary` | #2c2520 | #faf6f0 | Headlines, important text |
| `--color-text-secondary` | #5c544a | #f0ebe4 | Body text |
| `--color-text-muted` | #756a5e | #e8e2da | Labels, hints |
| `--color-background-elevated` | #fffdfb | #70605a | Cards, modals |
| `--color-background-secondary` | #f5f2ed | #60504a | Secondary surfaces |
| `--persona-primary` | Varies by persona | Persona's main color |
| `--persona-tint` | Varies by persona | Light tint for backgrounds |

---

## 📐 Spacing System (MA 間)

Use the MA spacing system based on Fibonacci sequence:

| Token | Value | Use |
|-------|-------|-----|
| `--ma-breath` | 8px | Tight spacing |
| `--ma-pause` | 13px | Small gaps |
| `--ma-rest` | 21px | Standard padding |
| `--ma-silence` | 34px | Large spacing |
| `--ma-meditation` | 55px | Section gaps |

```css
/* ✅ Use MA tokens */
padding: var(--ma-rest);
gap: var(--ma-breath);
margin-bottom: var(--ma-silence);
```

---

## 🪟 Modal System

### Base Classes (New Pattern)

Use these shared classes for consistent modals:

```html
<div class="ferni-modal">
  <div class="ferni-modal__backdrop"></div>
  <div class="ferni-modal__card">
    <header class="ferni-modal__header">
      <h2 class="ferni-modal__title">Title</h2>
      <button class="engagement-close-btn">×</button>
    </header>
    <div class="ferni-modal__content">
      <!-- Content -->
    </div>
    <footer class="ferni-modal__footer">
      <!-- Actions -->
    </footer>
  </div>
</div>
```

### Backdrop Tokens

| Token | Opacity | Use |
|-------|---------|-----|
| `--backdrop-light` | ~30% | Subtle overlays |
| `--backdrop-medium` | ~50% | Standard modals |
| `--backdrop-heavy` | ~70% | Important dialogs |
| `--backdrop-menu` | ~30-50% | Navigation menus |
| `--backdrop-page` | ~95% | Full-page overlays |

```css
/* ✅ Use backdrop tokens */
background: var(--backdrop-heavy);
backdrop-filter: blur(var(--glass-blur-subtle));
```

---

## 📱 Menu System

### Slide-in Navigation Pattern

```html
<div class="ferni-menu">
  <div class="ferni-menu__backdrop"></div>
  <div class="ferni-menu__panel">
    <!-- Menu content -->
  </div>
</div>
```

### Visibility States

```css
/* Hidden (default) */
.ferni-modal { opacity: 0; visibility: hidden; }

/* Visible */
.ferni-modal--visible { opacity: 1; visibility: visible; }
```

---

## 🔘 Button Shadows

### Interactive Element Shadows

| Token | State |
|-------|-------|
| `--shadow-button-rest` | Default state |
| `--shadow-button-hover` | Hover state |
| `--shadow-button-pressed` | Active/pressed |
| `--shadow-button-focus` | Keyboard focus |

```css
.my-button {
  box-shadow: var(--shadow-button-rest);
}
.my-button:hover {
  box-shadow: var(--shadow-button-hover);
}
.my-button:active {
  box-shadow: var(--shadow-button-pressed);
}
```

---

## ⏱️ Animation Constants

Import from `animation-constants.ts`:

```typescript
import { DURATION, EASING } from '../config/animation-constants.js';
```

### Duration Constants

| Constant | Value | Use |
|----------|-------|-----|
| `DURATION.FAST` | 100ms | Hover, focus |
| `DURATION.NORMAL` | 200ms | Standard transitions |
| `DURATION.SLOW` | 300ms | Deliberate moves |
| `DURATION.MODERATE` | 400ms | Panel slides |
| `DURATION.CELEBRATION` | 800ms | Major events |

### Easing Constants

| Constant | Description |
|----------|-------------|
| `EASING.STANDARD` | Material design standard |
| `EASING.SPRING` | Pixar-style bounce |
| `EASING.EXPO_OUT` | Dramatic deceleration |
| `EASING.GENTLE` | Organic, natural |

---

## 🔤 Typography

### Font Families

| Token | Font | Use |
|-------|------|-----|
| `--font-display` | Plus Jakarta Sans | Headlines, buttons |
| `--font-body` | Inter | Body text, labels |

```css
/* ❌ NEVER use --font-primary (deprecated) */
font-family: var(--font-primary);

/* ✅ ALWAYS use --font-body */
font-family: var(--font-body);
```

### Text Sizes

| Token | Size |
|-------|------|
| `--text-xs` | 0.75rem |
| `--text-sm` | 0.8125rem |
| `--text-base` | 0.9375rem |
| `--text-lg` | 1.0625rem |
| `--text-xl` | 1.25rem |
| `--text-2xl` | 1.5rem |

---

## 🌓 Dark Theme Support

Always include dark theme overrides:

```css
/* Base styles (light theme) */
.my-component {
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
}

/* Dark theme overrides */
[data-theme="midnight"] .my-component {
  /* Uses same tokens - they auto-switch! */
  /* Only override if behavior differs */
}
```

### WCAG AA Compliance

Dark theme text must meet 4.5:1 contrast on #70605a background:

| Token | Color | Contrast |
|-------|-------|----------|
| `--color-text-primary` | #faf6f0 | 5.56:1 ✅ |
| `--color-text-secondary` | #f0ebe4 | 5.05:1 ✅ |
| `--color-text-muted` | #e8e2da | 4.65:1 ✅ |

---

## ♿ Accessibility

### Reduced Motion

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .my-component {
    animation: none !important;
    transition: opacity var(--duration-fast) linear !important;
    transform: none !important;
  }
}
```

### Check in TypeScript

```typescript
import { prefersReducedMotion } from '../config/animation-constants.js';

if (!prefersReducedMotion()) {
  // Run animation
}
```

---

## 📦 BEM Naming Conventions

### New Components: Use `ferni-` Prefix

```
ferni-modal__*     - Centered dialogs
ferni-menu__*      - Slide-in navigation
ferni-btn__*       - Buttons
ferni-card__*      - Content cards
```

### Legacy Prefixes (Backward Compatible)

```
engagement-*       - Daily check-in UI
predictions-*      - Predictions modal
settings-menu__*   - Hamburger menu
pred-tracker__*    - Prediction tracker
```

---

## ✅ Checklist Before PR

- [ ] No hardcoded hex colors (`#RRGGBB`)
- [ ] No hardcoded rgba values
- [ ] Uses `--font-body` not `--font-primary`
- [ ] Uses `DURATION.*` constants
- [ ] Uses `EASING.*` constants
- [ ] Uses `--backdrop-*` for overlays
- [ ] Uses `--shadow-button-*` for interactive elements
- [ ] Has dark theme support (`[data-theme="midnight"]`)
- [ ] Has reduced motion support
- [ ] Uses semantic BEM class names

---

## 🔗 Related Files

- **CSS Tokens:** `public/design-system/tokens.css`
- **Animation Constants:** `src/config/animation-constants.ts`
- **Shared Components:** `src/ui/engagement-components.ts`
- **Brand Guidelines:** `brand/FERNI-BRAND-GUIDELINES.md`

