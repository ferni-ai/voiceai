# VoiceAI Frontend Design Standards

## Core Principles

This document defines the design standards for the VoiceAI frontend. All implementations must adhere to these guidelines.

### Professional Visual Standards

**NO EMOJIS** - Never use emojis in any UI implementation. They appear unprofessional and inconsistent across platforms. Use:
- SVG icons for visual indicators
- CSS shapes and animations for decorative elements
- Typography and spacing for hierarchy

**Typography First** - Let typography do the heavy lifting. Proper font weights, sizes, and spacing communicate hierarchy better than decorative elements.

**Restraint Over Excess** - When in doubt, remove visual elements rather than add them. Every pixel must earn its place.

---

## Design System Integration

### Token Usage

Always use design system tokens. Never hardcode colors, spacing, or typography values.

```css
/* Correct */
color: var(--color-text-primary);
background: var(--color-bg-secondary);
padding: var(--space-md);
font-family: var(--font-display);

/* Incorrect */
color: #ffffff;
background: #1a1a2e;
padding: 16px;
font-family: 'Inter', sans-serif;
```

### Color Palette

- **Backgrounds**: Use `--color-bg-*` tokens (primary, secondary, tertiary, elevated, glass)
- **Text**: Use `--color-text-*` tokens (primary, secondary, muted, dimmed)
- **Borders**: Use `--color-border-*` tokens (subtle, medium)
- **Accents**: Use `--color-accent-*` tokens sparingly for interactive elements
- **Semantic**: Use `--color-semantic-*` for success, error, warning states

### Typography Scale

```css
--text-2xs: 0.625rem;   /* 10px - Micro labels */
--text-xs: 0.75rem;     /* 12px - Captions */
--text-sm: 0.8125rem;   /* 13px - Small body */
--text-base: 0.9375rem; /* 15px - Body text */
--text-lg: 1.0625rem;   /* 17px - Large body */
--text-xl: 1.25rem;     /* 20px - Subheadings */
--text-2xl: 1.5rem;     /* 24px - Headings */
--text-3xl: 1.875rem;   /* 30px - Display */
--text-4xl: 2.25rem;    /* 36px - Hero */
```

### Spacing (Golden Ratio)

```css
--space-2xs: 0.125rem;  /* 2px */
--space-xs: 0.25rem;    /* 4px */
--space-sm: 0.5rem;     /* 8px */
--space-md: 1rem;       /* 16px - Base */
--space-lg: 1.618rem;   /* 26px */
--space-xl: 2.618rem;   /* 42px */
--space-2xl: 4.236rem;  /* 68px */
--space-3xl: 6.854rem;  /* 110px */
```

---

## Animation Standards

### Timing

Use golden-ratio based timing for natural feel:

```css
--timing-fast: 233ms;
--timing-base: 377ms;
--timing-slow: 610ms;
--timing-slower: 987ms;
```

### Easing

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);    /* Snappy exits */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);   /* Smooth exits */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);       /* Balanced */
```

### Principles

1. **Subtle over dramatic** - Animations should feel natural, not call attention to themselves
2. **Purpose-driven** - Every animation must serve UX (feedback, orientation, delight)
3. **Respect reduced motion** - Always check `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Guidelines

### Buttons

- Use `--radius-full` (pill shape) for primary actions
- Use `--radius-lg` for secondary actions
- Minimum touch target: 44px
- Clear hover/active/focus states

### Inputs

- Use `--radius-md` or `--radius-lg`
- Clear focus ring using accent color
- Placeholder text uses `--color-text-muted`

### Cards / Surfaces

- Use `--color-bg-elevated` for raised surfaces
- Subtle borders with `--color-border-subtle`
- Layered shadows for depth (never single harsh shadow)

### Toast Notifications

- Position: Top-right (desktop), top-center (mobile)
- Duration: Minimum 5 seconds (WCAG)
- Pause on hover for accessibility
- Slide in/out, never cause layout shift

---

## Icons

### SVG Standards

All icons must be inline SVG with:
- `viewBox="0 0 24 24"` (24x24 grid)
- `fill="none"` with `stroke="currentColor"`
- `stroke-width="1.5"` or `stroke-width="2"`
- `stroke-linecap="round"` and `stroke-linejoin="round"`

### Icon Library

Use consistent icons across the app. Common icons:

```html
<!-- Check/Success -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Close/X -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Info -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 16v-4M12 8h.01" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Voice/Microphone -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Brain/AI -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2a4 4 0 014 4v1a3 3 0 013 3v1a3 3 0 01-3 3h-1v4a4 4 0 01-8 0v-4H6a3 3 0 01-3-3v-1a3 3 0 013-3V6a4 4 0 014-4z"/>
  <circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/>
</svg>

<!-- Team/Users -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
  <circle cx="9" cy="7" r="4"/>
  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
</svg>
```

---

## Accessibility

### Color Contrast

- Body text: Minimum 4.5:1 contrast ratio
- Large text (18px+): Minimum 3:1 contrast ratio
- Interactive elements: Clear focus indicators

### Focus States

Always provide visible focus indicators:

```css
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}
```

### ARIA

- Use semantic HTML first
- Add ARIA labels for icon-only buttons
- Use `aria-live` for dynamic content updates
- Test with screen readers

---

## Theme Support

### Midnight Theme (Default)

Dark theme with deep blues and purples. Professional, focused.

### Zen Theme

Light theme with warm neutrals. Calm, approachable.

### Implementation

```css
/* Dark theme specific */
[data-theme="midnight"] .component {
  background: var(--color-bg-secondary);
}

/* Light theme specific */
[data-theme="zen"] .component {
  background: var(--color-bg-secondary);
  /* Token values change automatically */
}
```

---

## File Organization

```
src/
  ui/
    component.ui.ts    # Component logic
  styles/
    component.css      # Component styles (if separate)
index.html             # Main styles in <style> block
```

### CSS in HTML

For now, all CSS lives in `index.html` within the `<style>` block. This keeps everything in one place during rapid development.

### TypeScript UI Modules

Each UI component should:
1. Export an `init*` function
2. Export a `dispose` function for cleanup
3. Use named exports, not default exports
4. Be re-exported from `src/ui/index.ts`

---

## Code Quality

### Comments

- Use section headers for major CSS blocks
- Explain non-obvious CSS (hacks, workarounds)
- No emoji in comments

```css
/* ========================================================================
   COMPONENT NAME - Brief description
   ======================================================================== */
```

### Naming

- CSS: kebab-case (`.toast-container`, `.landing-headline`)
- TypeScript: camelCase for functions/variables, PascalCase for types
- IDs: camelCase (`#landingModal`, `#connectBtn`)

---

## Performance

### Critical CSS

- Keep critical CSS (above-fold) minimal
- Use `contain` property for layout isolation
- Avoid layout shift (reserve space for async content)

### Animations

- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid animating `width`, `height`, `top`, `left`
- Use `will-change` sparingly and only when needed

### Images

- Use SVG for icons and simple graphics
- Lazy load below-fold images
- Provide appropriate `width` and `height` attributes

---

## Summary

1. **No emojis** - Use SVG icons
2. **Use tokens** - Never hardcode values
3. **Be subtle** - Restraint is sophistication
4. **Be accessible** - Contrast, focus, ARIA
5. **Be performant** - GPU animations, layout isolation
6. **Be consistent** - Follow existing patterns
