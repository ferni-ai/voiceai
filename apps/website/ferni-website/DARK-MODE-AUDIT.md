# Ferni.ai Dark Mode & Mobile Audit

> Comprehensive audit of dark mode implementation and mobile usability issues.
> Date: 2026-01-01

---

## Executive Summary

**Good News:** The dark mode implementation is comprehensive and well-architected. The `dark-mode.css` file contains 1,680 lines covering all 30 sections with WCAG AA compliant colors.

**Root Cause of Issues:** The dark mode ONLY responds to `@media (prefers-color-scheme: dark)` - system-level preference. If users have a manual toggle that sets `data-theme="dark"`, it won't work because the CSS doesn't support that selector.

**Mobile Issues:** 7 different breakpoint values (480px, 600px, 640px, 768px, 900px, 968px, 1024px) create inconsistent responsive behavior.

---

## Dark Mode Analysis

### What Works Well
- `src/css/dark-mode.css` is comprehensive (1,680 lines)
- All 30+ sections have proper dark mode overrides
- WCAG AA compliant contrast ratios documented
- Color palette is warm and brand-aligned (not cold/gray)
- High contrast mode support (`prefers-contrast: more`)
- Reduced motion support
- Print styles override dark mode

### Color Palette (Dark Mode)
| Token | Value | Contrast | Usage |
|-------|-------|----------|-------|
| `--color-background` | `#2c2520` | - | Main background |
| `--color-background-elevated` | `#3a332e` | - | Cards, elevated |
| `--color-background-surface` | `#4a4038` | - | Card surfaces |
| `--color-background-deep` | `#1a1614` | - | Dramatic sections |
| `--color-text-primary` | `#ffffff` | 12.1:1 | Headlines |
| `--color-text-secondary` | `#f0ebe4` | 9.8:1 | Body text |
| `--color-text-muted` | `#ddd6cc` | 7.5:1 | Captions |
| `--color-text-dimmed` | `#c8bfb4` | 5.9:1 | Disabled |

### The Root Problem

**dark-mode.css line 32:**
```css
@media (prefers-color-scheme: dark) {
  :root {
    /* All dark mode variables defined here */
  }
}
```

**Missing:**
```css
[data-theme="dark"] {
  /* Same variables for manual toggle */
}
```

The CSS only supports system-level dark mode preference. If the website has a manual toggle button that sets `data-theme="dark"` on the `<html>` element, those styles won't apply.

### Fix Required

Add `[data-theme="dark"]` selectors to support manual toggle. Two approaches:

**Option A: Duplicate all styles (verbose but clear)**
```css
@media (prefers-color-scheme: dark) {
  :root { /* dark variables */ }
  .hero { /* dark styles */ }
}

[data-theme="dark"] {
  /* Same variables and styles duplicated */
}
```

**Option B: Use CSS nesting with :is() (cleaner, modern)**
```css
@media (prefers-color-scheme: dark) {
  :root { /* variables */ }
}

[data-theme="dark"] {
  /* variables only - reuse via :is() for components */
}

:is([data-theme="dark"], @media (prefers-color-scheme: dark)) .hero {
  /* component styles */
}
```

**Recommended: Option A** - More verbose but clearer, better browser support.

---

## Mobile Breakpoint Analysis

### Current State (Inconsistent)
7 different breakpoints found across CSS files:
- `480px` - Very small phones
- `600px` - Small phones (non-standard)
- `640px` - Tailwind sm
- `768px` - Tablets (most common)
- `900px` - Non-standard
- `968px` - Non-standard
- `1024px` - Small laptops

### Files with Mobile Issues

| File | Breakpoints Used |
|------|-----------------|
| `styles.css` | 480, 600, 640, 768, 968, 1024 |
| `blog-page.css` | 480, 768 |
| `pricing-page.css` | 768, 900 |
| `team-page.css` | 768 |
| `apple-style.css` | 480, 768, 968 |

### Recommended Standard Breakpoints
Align with Tailwind CSS for consistency:
- `sm: 640px` - Small devices
- `md: 768px` - Tablets
- `lg: 1024px` - Laptops
- `xl: 1280px` - Desktops

---

## CSS File Architecture

### Production Files (loaded on ferni.ai)
```
src/css/
├── tokens.css           # Design tokens (light mode base)
├── dark-mode.css        # Dark mode overrides (1,680 lines)
├── story-brand.css      # Brand story section
├── components.css       # Reusable components
├── sections/
│   └── footer.css       # Footer styles
├── landing-intelligence.css
├── ai-copy-magic.css
├── ai-storytelling.css
├── pixar-animations.css
├── better-than-human.css
├── ferni-eq.css
├── ferni-showcase.css
└── waitlist-modal.css
```

### Legacy Files (NOT loaded in production)
```
css/
├── styles.css           # Legacy monolith (3,000+ lines)
├── styles-live.css      # Duplicate of styles.css
├── design-tokens.css    # Different from src/css/tokens.css
└── ...
```

**Note:** The `css/` folder contains legacy files that are NOT used in production. The production site loads from `src/css/`.

---

## Action Items

### Priority 1: Fix Manual Dark Mode Toggle
1. Create `[data-theme="dark"]` selectors in `dark-mode.css`
2. Add theme toggle button to navigation (if not present)
3. Store preference in localStorage
4. Apply on page load before render (prevent flash)

### Priority 2: Standardize Breakpoints
1. Audit all CSS files for breakpoint usage
2. Consolidate to 4 standard breakpoints (640, 768, 1024, 1280)
3. Test on real devices at each breakpoint

### Priority 3: Verify Dark Mode Coverage
1. Test every page with system dark mode enabled
2. Document any sections missing dark mode styles
3. Fix any contrast issues found

### Priority 4: Clean Up Legacy Files
1. Remove or archive `css/styles.css` and duplicates
2. Ensure `css/design-tokens.css` doesn't conflict with `src/css/tokens.css`
3. Update any documentation referencing old files

---

## Testing Checklist

### Dark Mode Testing
- [ ] Enable system dark mode (macOS: System Preferences > Appearance > Dark)
- [ ] Verify all sections have proper dark backgrounds
- [ ] Check text contrast meets WCAG AA (4.5:1 for body, 3:1 for large text)
- [ ] Test navigation in dark mode
- [ ] Test forms and inputs
- [ ] Test buttons (primary, secondary, ghost)
- [ ] Test cards and elevated surfaces
- [ ] Verify images look good on dark backgrounds

### Mobile Testing (Real Devices)
- [ ] iPhone SE (375px) - Test small screen
- [ ] iPhone 14 Pro (393px) - Standard phone
- [ ] iPad Mini (768px) - Tablet
- [ ] iPad Pro 12.9" (1024px) - Large tablet
- [ ] Test touch targets are 44x44px minimum
- [ ] Test text is readable without zooming (16px minimum)
- [ ] Test horizontal scrolling doesn't occur
- [ ] Test navigation menu collapse/expand

---

## References

- `src/css/dark-mode.css` - Main dark mode implementation
- `src/css/tokens.css` - Design tokens
- `DARK-THEME-POLISH-PLAN.md` - Previous planning document (in css/ folder)
- Brand Guidelines: `brand/FERNI-UNIVERSE-BIBLE.md`
