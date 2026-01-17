# Dashboard UI Design System Audit Report

**Date:** December 21, 2025  
**Scope:** All dashboard UI files in `apps/web/src/ui/`

## Executive Summary

This audit examines 10 dashboard UI files for design system compliance. The codebase has **good overall adoption** of CSS variables and design tokens, with most files using the `DURATION` and `EASING` constants correctly. However, several patterns need remediation:

| Severity | Count | Issue |
|----------|-------|-------|
| 🔴 High | 1 file | Heavy hardcoded values (performance-dashboard) |
| 🟡 Medium | 8 files | Hardcoded CSS fallback values |
| 🟢 Low | 1 file | Exemplary (music-dashboard) |

## Files Audited

### 1. ✅ `music-dashboard.ui.ts` - EXEMPLARY
**Status:** Best-in-class implementation

**Strengths:**
- Properly imports `DURATION, EASING` from animation-constants
- Uses CSS variables consistently: `var(--color-background-elevated, #fffdfb)`
- Correct dark theme handling via `@media (prefers-color-scheme: dark)`
- Uses design system spacing: `var(--space-4, 16px)`

**Minor Issues:** CSS fallbacks in var() - acceptable but not ideal

---

### 2. 🟡 `creative-you-dashboard.ui.ts`
**Status:** Good with minor issues

**Violations:**
- Hardcoded colors in `MOOD_COLORS` map
- `transition: opacity 200ms ease` - should use DURATION.NORMAL
- `transition: 150ms ease` - should use DURATION.FAST

**Good Practices:**
- Uses CSS variables for colors
- Proper modal backdrop blur

---

### 3. 🟡 `wellbeing-dashboard.ui.ts`
**Status:** Good with dark theme support

**Violations:**
- Hardcoded animation durations in comments mention tokens but some values still hardcoded
- CSS fallback values present

**Good Practices:**
- Excellent dark theme support with `[data-theme="midnight"]`
- Uses CSS variables throughout
- WCAG AA compliant contrast handling

---

### 4. 🟡 `analytics-dashboard.ui.ts`
**Status:** Good design token usage

**Violations:**
- `font-size: 10px` hardcoded (should use `var(--text-xs)`)
- Some `var(--color-*, #hex)` patterns

**Good Practices:**
- Imports and uses `DURATION, EASING` correctly
- Uses `--ma-*` spacing tokens
- Comprehensive dark theme support

---

### 5. 🟡 `garden-dashboard.ui.ts`
**Status:** Good with fallbacks

**Violations:**
- `transition: all 0.2s ease` - should use DURATION constants
- Hardcoded backdrop color: `rgba(44, 37, 32, 0.6)`
- `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)` - should use `var(--shadow-2xl)`

**Good Practices:**
- Uses CSS variables for most colors
- Proper z-index handling

---

### 6. 🟡 `marketing-dashboard.ui.ts`
**Status:** Good with fallbacks

**Violations:**
- `backdrop-filter: blur(20px)` - should use `var(--glass-blur-medium)`
- `z-index: 10000` - should use `var(--z-modal)`
- Hardcoded colors: `rgba(44, 37, 32, 0.4)`, `#888`
- `border-radius: 8px` - should use `var(--radius-md)`

**Good Practices:**
- Uses `DURATION` and `EASING` constants
- CSS variables for persona colors

---

### 7. 🟡 `evalops-dashboard.ui.ts`
**Status:** Good structure with fallbacks

**Violations:**
- `z-index: 10000` - should use `var(--z-modal)`
- `backdrop-filter: blur(var(--glass-blur-medium, 16px))` - fallback present
- Hardcoded colors: `#ccc`, `#666`, `#444`
- `font-size: 14px` - should use `var(--text-sm)`

**Good Practices:**
- Imports `DURATION, EASING` correctly
- Good component structure

---

### 8. 🟡 `trust-dashboard.ui.ts`
**Status:** Good implementation

**Violations:**
- CSS fallback patterns present
- Some hardcoded font sizes

**Good Practices:**
- Uses CSS variables consistently
- Proper modal patterns

---

### 9. 🔴 `admin/performance-dashboard.ui.ts` - NEEDS WORK
**Status:** Most hardcoded values

**Critical Violations:**
```css
/* Hardcoded font families */
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'

/* Hardcoded padding/spacing */
padding: 24px, 20px, 16px, 12px, 8px

/* Hardcoded font sizes */
font-size: 11px, 12px, 14px, 16px, 18px, 24px

/* Hardcoded colors */
#4a6741, #3d5a35, #5a6b8a, #dc3545, #28a745, #ffc107
rgba(74, 103, 65, 0.1)

/* Hardcoded border-radius */
border-radius: 4px, 6px, 8px, 12px

/* Hardcoded shadows */
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)
```

**Recommended Actions:**
1. Replace font-family with `var(--font-display)` and `var(--font-body)`
2. Replace padding/spacing with `var(--space-*)` tokens
3. Replace font-sizes with `var(--text-*)` tokens
4. Replace hardcoded colors with `var(--color-*)` or `var(--persona-*)`
5. Replace border-radius with `var(--radius-*)` tokens
6. Replace box-shadow with `var(--shadow-*)` tokens

---

## Violation Categories

### Category 1: Hardcoded Fallbacks in CSS Variables 🟡
**Prevalence:** 8/10 files  
**Pattern:** `var(--color-text-primary, #2c2520)`

**Impact:** Low - fallbacks work but defeat single source of truth

**Fix:** Remove fallbacks where CSS variables are guaranteed to exist:
```css
/* Before */
color: var(--color-text-primary, #2c2520);

/* After */
color: var(--color-text-primary);
```

---

### Category 2: Hardcoded Animation Durations 🟡
**Prevalence:** 4/10 files  
**Pattern:** `transition: all 0.2s ease`

**Impact:** Medium - inconsistent animation timing

**Fix:** Import and use DURATION constants:
```typescript
import { DURATION, EASING } from '../config/animation-constants.js';

// Before
transition: 'all 0.2s ease'

// After  
transition: `all ${DURATION.NORMAL}ms ${EASING.STANDARD}`
```

---

### Category 3: Hardcoded Z-Index Values 🟡
**Prevalence:** 4/10 files  
**Pattern:** `z-index: 10000`

**Impact:** Low - but can cause stacking issues

**Fix:** Use CSS variable:
```css
/* Before */
z-index: 10000;

/* After */
z-index: var(--z-modal);
```

---

### Category 4: Hardcoded Backdrop Blur 🟡
**Prevalence:** 5/10 files  
**Pattern:** `backdrop-filter: blur(20px)`

**Impact:** Low - inconsistent blur values

**Fix:**
```css
/* Before */
backdrop-filter: blur(20px);

/* After */
backdrop-filter: blur(var(--glass-blur-medium));
```

---

### Category 5: Fully Hardcoded Values 🔴
**Prevalence:** 1/10 files (performance-dashboard)  
**Pattern:** Raw pixel values without any CSS variables

**Impact:** High - completely bypasses design system

**Fix:** Full migration to design tokens (see remediation plan)

---

## Remediation Priority

### Phase 1: Critical (performance-dashboard)
1. Fix `admin/performance-dashboard.ui.ts` - most violations

### Phase 2: Quick Wins (remove fallbacks)
These files are mostly compliant - just remove unnecessary fallbacks:
2. `music-dashboard.ui.ts`
3. `wellbeing-dashboard.ui.ts`
4. `analytics-dashboard.ui.ts`

### Phase 3: Animation Fixes
Fix hardcoded animation durations:
5. `creative-you-dashboard.ui.ts`
6. `garden-dashboard.ui.ts`

### Phase 4: Comprehensive Cleanup
Full audit of remaining patterns:
7. `marketing-dashboard.ui.ts`
8. `evalops-dashboard.ui.ts`
9. `trust-dashboard.ui.ts`

---

## Token Mapping Reference

| Hardcoded Value | Design Token |
|-----------------|--------------|
| `#2c2520` | `var(--color-text-primary)` |
| `#5c5248`, `#70605a` | `var(--color-text-secondary)` |
| `#756a5e`, `#7a6f63` | `var(--color-text-muted)` |
| `#fffdfb` | `var(--color-background-elevated)` |
| `#f5f2ed` | `var(--color-background-subtle)` |
| `#4a6741` | `var(--persona-primary)` or `var(--color-ferni)` |
| `rgba(44, 37, 32, 0.6)` | `var(--backdrop-page)` |
| `200ms` | `DURATION.NORMAL` |
| `300ms` | `DURATION.SLOW` |
| `100ms` | `DURATION.FAST` |
| `10000` | `var(--z-modal)` |
| `24px` | `var(--space-6)` or `var(--radius-2xl)` |
| `16px` | `var(--space-4)` or `var(--radius-lg)` |
| `12px` | `var(--space-3)` or `var(--radius-md)` |
| `8px` | `var(--space-2)` or `var(--radius-sm)` |
| `blur(20px)` | `var(--glass-blur-medium)` |
| `blur(24px)` | `var(--glass-blur-strong)` |

---

## Validation Commands

After fixes, run these to validate:

```bash
# Check for hardcoded hex colors
grep -r "#[0-9a-fA-F]\{6\}" apps/web/src/ui/*-dashboard*.ts

# Check for hardcoded rgba
grep -r "rgba(" apps/web/src/ui/*-dashboard*.ts

# Check for hardcoded px values in transitions
grep -rE "transition:.*[0-9]+ms" apps/web/src/ui/*-dashboard*.ts

# Run linter
pnpm lint:tokens
```

---

## Conclusion

The dashboard UI codebase shows **good design system adoption** overall. The main areas for improvement are:

1. **One critical file** (`performance-dashboard.ui.ts`) needs complete remediation
2. **CSS fallback values** can be safely removed in most cases
3. **Animation timing** should consistently use DURATION constants
4. **Dark theme** support is generally well-implemented

The `music-dashboard.ui.ts` file serves as an excellent reference implementation for other dashboards to follow.

