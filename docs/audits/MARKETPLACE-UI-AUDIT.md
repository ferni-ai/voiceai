# Marketplace UI Audit Report

**Date:** 2024-12-13
**Auditor:** Claude AI (Automated Review)
**Files Audited:**
- `apps/web/src/ui/marketplace.ui.ts`
- `apps/web/src/ui/marketplace-billing.ui.ts`
- `apps/web/src/ui/marketplace-publisher.ui.ts`
- `apps/web/src/services/marketplace.service.ts`

---

## Executive Summary

The marketplace UI components demonstrate **strong accessibility foundations** but have several areas for improvement in design token compliance and brand alignment. Overall rating: **B+**

| Category | Score | Notes |
|----------|-------|-------|
| Accessibility (WCAG AA) | A | Strong keyboard nav, ARIA, reduced motion |
| Design Token Compliance | B | Good token use, some hardcoded values found |
| Brand Alignment | B+ | Follows design language, minor deviations |

---

## 1. Accessibility Audit (WCAG 2.1 AA)

### 1.1 Keyboard Navigation ✅ PASS

All three UI files implement proper keyboard navigation:

**marketplace.ui.ts:**
- `Escape` key closes modal
- Focus trap on modal open
- Tab navigation through grid items

**marketplace-billing.ui.ts:**
- `Escape` key closes dashboard
- Focus management on open
- Keyboard-accessible buttons

**marketplace-publisher.ui.ts:**
- Full tab panel navigation (`role="tablist"`)
- `aria-selected` state management
- `Escape` key support

### 1.2 Screen Reader Support ✅ PASS

**Strong ARIA Implementation:**
```typescript
// marketplace.ui.ts
marketplaceModal.setAttribute('role', 'dialog');
marketplaceModal.setAttribute('aria-labelledby', 'marketplace-title');
marketplaceModal.setAttribute('aria-modal', 'true');

// marketplace-publisher.ui.ts
announceToScreenReader(message) // Screen reader live announcements
```

**Icons properly hidden:**
```html
<svg aria-hidden="true" ...>
```

### 1.3 Reduced Motion ✅ PASS

All three files check `prefers-reduced-motion`:
```typescript
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnimationDuration(baseDuration: number): number {
  return prefersReducedMotion() ? 0 : baseDuration;
}
```

### 1.4 Focus Indicators ✅ PASS

Focus-visible styles implemented:
```css
.billing-close:focus-visible {
  outline: 2px solid var(--persona-primary);
  outline-offset: 2px;
}
```

### 1.5 Color Contrast ⚠️ REVIEW NEEDED

**Finding:** Some text-on-background combinations may not meet WCAG AA 4.5:1:

| Element | Foreground | Background | Action |
|---------|------------|------------|--------|
| `.tier-desc` | `rgba(255,255,255,0.8)` | Gradient | **Review** |
| `.usage-card-meta` | `var(--color-text-muted)` | Secondary bg | Verify |
| `.empty-hint` | Muted | Light bg | Verify |

**Recommendation:** Run automated contrast checker against live UI.

### 1.6 Touch Targets ✅ PASS

Buttons meet 44x44px minimum:
```css
.billing-close {
  width: 44px;
  height: 44px;
}
```

### 1.7 Form Labels ✅ PASS

```html
<input type="search" aria-label="Search for coaches">
<select aria-label="Filter by specialty">
```

---

## 2. Design Token Compliance

### 2.1 Color Tokens ⚠️ MINOR ISSUES

**Good Token Usage:**
```css
background: var(--color-background-elevated);
color: var(--color-text-primary);
border: 1px solid var(--color-border-subtle);
```

**Found Hardcoded Values:**

| File | Line (approx) | Issue | Fix |
|------|---------------|-------|-----|
| marketplace-billing.ui.ts | 513 | `rgba(44, 37, 32, 0.7)` | Use `var(--backdrop-dark)` |
| marketplace-billing.ui.ts | 518 | `#FFFDFB` | Use `var(--color-background-elevated)` |
| marketplace-billing.ui.ts | 869 | `#3a3330`, `#faf6f0`, `#e8e2da` | Use theme tokens |
| marketplace.ui.ts | ~50-63 | `rgba(217, 119, 87, 0.35)` etc. | Define in CSS vars |

### 2.2 Spacing Tokens ✅ MOSTLY COMPLIANT

Uses spacing variables throughout:
```css
padding: var(--space-6, 24px);
gap: var(--space-4, 16px);
margin: var(--space-2, 8px);
```

**Note:** Fallback values are provided (good practice).

### 2.3 Z-Index Tokens ✅ PASS

```css
z-index: var(--z-modal, 2100);
```

### 2.4 Animation Tokens ✅ PASS

Imports from design system:
```typescript
import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';
```

Usage:
```css
transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
animation-delay: ${index * STAGGER.TIGHT}ms
```

### 2.5 Typography Tokens ✅ PASS

```css
font-family: var(--font-display);
font-size: 1.5rem;  // Relative units good
```

### 2.6 Shadow Tokens ⚠️ MINOR

**Good:**
```css
box-shadow: var(--shadow-2xl);
```

**Missing:** Some hover states could use shadow tokens.

---

## 3. Brand Alignment Audit

### 3.1 Persona Color System ✅ PASS

Uses CSS variables via `data-persona` attribute:
```typescript
function getPersonaGradient(personaId: string): string {
  return 'linear-gradient(135deg, var(--persona-secondary), var(--persona-primary))';
}
```

### 3.2 Visual Language ✅ PASS

**Consistent Elements:**
- Rounded corners (`var(--radius-lg)`, `var(--radius-full)`)
- Glass/blur effects
- Subtle animations
- Professional iconography (Lucide-style SVGs)

### 3.3 Tone of Voice ✅ PASS

User-facing copy follows brand guidelines:
- "Expand your team." (empowering)
- "Find coaches who understand what you need." (supportive)
- "No anxiety-inducing language about limits"
- "Celebrate engagement, not monetize fear"

### 3.4 Emoji Usage ✅ PASS

**No emojis found in UI components** - uses SVG icons as per brand guidelines.

### 3.5 External Brand Colors ⚠️ DOCUMENT

External AI brand colors are handled separately:
```typescript
const externalGlows: Record<string, string> = {
  claude: 'rgba(217, 119, 87, 0.35)',
  gemini: 'rgba(66, 133, 244, 0.35)',
  gpt: 'rgba(16, 163, 127, 0.35)',
};
```

**Recommendation:** Move these to CSS variables for consistency.

---

## 4. Issues Summary

### 4.1 Critical (Must Fix)

None found.

### 4.2 High Priority (Should Fix)

| ID | Category | Issue | File | Recommendation |
|----|----------|-------|------|----------------|
| H1 | Tokens | Hardcoded RGBA in backdrop | marketplace-billing.ui.ts:513 | Use `var(--backdrop-*)` |
| H2 | Tokens | Hardcoded hex in dark theme | marketplace-billing.ui.ts:869 | Use theme-aware tokens |
| H3 | A11y | Color contrast verification needed | Multiple | Automated testing |

### 4.3 Medium Priority (Nice to Have)

| ID | Category | Issue | Recommendation |
|----|----------|-------|----------------|
| M1 | Tokens | External brand colors hardcoded | Define as CSS variables |
| M2 | A11y | Add loading state announcements | `aria-busy="true"` |
| M3 | Brand | Inconsistent icon stroke widths | Standardize to 2px |

### 4.4 Low Priority

| ID | Category | Issue | Recommendation |
|----|----------|-------|----------------|
| L1 | Perf | Large inline styles | Extract to stylesheet |
| L2 | Maint | Duplicate style injection | Shared utility function |

---

## 5. Recommended Fixes

### Fix H1 & H2: Token Compliance

In `marketplace-billing.ui.ts`, replace:

```css
/* Before */
background: rgba(44, 37, 32, 0.7);

/* After */
background: var(--backdrop-dark, rgba(44, 37, 32, 0.7));
```

And for dark theme:
```css
/* Before */
background: var(--color-background-elevated, #3a3330);

/* After */
background: var(--color-background-elevated);
```

### Fix M1: External Brand Colors

Create in `tokens/colors.json`:
```json
{
  "external": {
    "claude-glow": "rgba(217, 119, 87, 0.35)",
    "gemini-glow": "rgba(66, 133, 244, 0.35)",
    "gpt-glow": "rgba(16, 163, 127, 0.35)"
  }
}
```

### Fix M2: Loading Announcements

Add to loading states:
```typescript
container?.setAttribute('aria-busy', 'true');
announceToScreenReader('Loading marketplace data...');
```

---

## 6. Testing Checklist

### Automated Testing
- [ ] Run `npm run lint:tokens` to catch hardcoded values
- [ ] Run `npm run audit:ui` for accessibility checks
- [ ] Run contrast checker (e.g., axe DevTools)

### Manual Testing
- [ ] Tab through all interactive elements
- [ ] Test with VoiceOver/NVDA screen reader
- [ ] Test with reduced motion enabled
- [ ] Test at 200% zoom
- [ ] Test in dark mode

### Device Testing
- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## 7. Conclusion

The marketplace UI components demonstrate mature accessibility practices and mostly follow the design system. The primary improvements needed are:

1. **Replace hardcoded color values** with design tokens (3-5 instances)
2. **Verify color contrast** ratios meet WCAG AA
3. **Add loading state announcements** for better screen reader UX
4. **Document external brand colors** in the token system

With these fixes, the marketplace UI will achieve full compliance with Ferni's design standards.

---

**Next Steps:**
1. Create issues for H1, H2, H3 fixes
2. Run automated accessibility audit
3. Schedule manual testing session
4. Update tokens.json with external brand colors
