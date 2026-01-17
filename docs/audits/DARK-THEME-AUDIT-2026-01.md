# 🌙 Dark Theme Audit - January 2026

## Executive Summary

**Status:** 🚨 **CRITICAL** - Multiple systemic issues causing readability problems

The website dark theme has **massive readability issues** stemming from:
1. **Circular CSS variable references** that silently fail
2. **Fragmented dark mode implementation** across 18+ CSS files
3. **Variable reassignment collisions** where the same variable is used for both light and dark values
4. **Inconsistent dark theme selectors** (`@media prefers-color-scheme`, `[data-theme="dark"]`, `.theme--dark`)
5. **45+ hardcoded hex colors** bypassing the design token system

---

## 🔴 CRITICAL Issue #1: Circular Variable References

**Location:** `apps/website/ferni-website/src/css/dark-mode.css` (lines 51-54)

```css
/* This code has CIRCULAR REFERENCES that do NOTHING: */
[data-theme="dark"] {
  --color-text-muted: var(--color-text-muted);   /* ← BROKEN! Self-reference */
  --color-text-dimmed: var(--color-text-dimmed); /* ← BROKEN! Self-reference */
}
```

**Impact:** The `--color-text-muted` and `--color-text-dimmed` values NEVER CHANGE in dark mode. They remain at their light mode values (`#6b635a` and `#756a5e`), which are **dark colors on dark backgrounds** = invisible text.

**Fix Required:**
```css
[data-theme="dark"] {
  --color-text-muted: #e8e2da;   /* From colors.json themes.midnight.text.muted */
  --color-text-dimmed: #ddd6cc;  /* From colors.json themes.midnight.text.dimmed */
}
```

---

## 🔴 CRITICAL Issue #2: Variable Name Collision

**Location:** `apps/website/ferni-website/src/css/dark-mode.css` (line 38)

```css
[data-theme="dark"] {
  --color-background: var(--color-text-primary);  /* Wait... what? */
}
```

The code uses `--color-text-primary` (which is `#2c2520` - dark ink color) as the BACKGROUND. This is intentional (warm dark background), but creates confusion because:

1. **Before this line:** `--color-text-primary` = `#2c2520` (dark)
2. **After line 51:** `--color-text-primary` = `var(--color-text-inverse)` = `#faf8f5` (light)

This ordering dependency is fragile. If CSS cascade changes, colors break silently.

**Root Cause:** Using the same variable names for conceptually different purposes (foreground vs background) based on theme context.

---

## 🔴 CRITICAL Issue #3: Three Different Dark Mode Selectors

The website uses THREE different mechanisms for dark mode:

| Selector | Files Using It | Mechanism |
|----------|---------------|-----------|
| `@media (prefers-color-scheme: dark)` | 18 files | System preference |
| `[data-theme="dark"]` | 5 files (283 occurrences) | Manual toggle |
| `.theme--dark` | dark-mode.css | Class-based |

**Problem:** Styles defined in `@media` queries don't apply when using `[data-theme="dark"]`, and vice versa. This means:
- Users with dark OS + manual toggle off see MIXED styles
- Manual toggle users may miss styles that are only in `@media` blocks

**The 3,000-line dark-mode.css has to DUPLICATE every style** - once for `@media` and once for `[data-theme="dark"]`. This is unmaintainable.

---

## 🟠 HIGH Issue #4: Hardcoded Colors (45+)

**Found in:** `apps/website/ferni-website/src/css/` (multiple files)

Examples from `components.css`:
```css
/* Hardcoded rgba() instead of tokens */
background: rgba(74, 103, 65, 0.03);  /* Should be var(--color-ferni-subtle) */
border: 1px solid rgba(44, 37, 32, 0.05);  /* Should be var(--color-border-subtle) */
box-shadow: 0 6px 16px rgba(74, 103, 65, 0.3);  /* Should be var(--shadow-glow-ferni) */
```

**Impact:** When dark mode activates, these hardcoded colors DON'T adapt. They remain optimized for light backgrounds, creating low-contrast or invisible elements.

---

## 🟠 HIGH Issue #5: tokens.css Has Hardcoded Hex in Dark Override

**Location:** `apps/website/ferni-website/src/css/tokens.css` (lines 628-712)

The file correctly uses hardcoded hex values in the `@media (prefers-color-scheme: dark)` block (to avoid circular references), but:

1. These values are **DUPLICATED** in `_tokens.css`, `design-tokens.css`, and `dark-mode.css`
2. Each file has slightly different values
3. No automation ensures they stay in sync

```css
/* tokens.css says: */
--color-text-secondary: #e8e0d5;  /* 4.6:1 contrast */

/* _tokens.css dark mode would inherit light values because it has no dark override! */
```

---

## 🟡 MEDIUM Issue #6: Contrast Ratios Are Questionable

The comments claim WCAG AA compliance:
```css
/* Text Colors (all WCAG AA compliant on var(--color-text-primary)):
   - Primary: var(--color-text-inverse) (12.1:1 contrast)
   - Secondary: var(--color-bg-secondary) (9.8:1 contrast)
   - Muted: var(--color-text-muted) (7.5:1 contrast)
   - Dimmed: var(--color-text-dimmed) (5.9:1 contrast) */
```

**Problem:** These ratios are calculated against `var(--color-text-primary)` (`#2c2520`), but the actual background is `#584840` (Cedar Dark) or `#70605a` (elevated).

**Actual Contrast Ratios on `#70605a`:**

| Token | Color | Actual Contrast | WCAG AA (4.5:1) |
|-------|-------|-----------------|-----------------|
| `--color-text-primary` | `#faf6f0` | 5.56:1 | ✅ Pass |
| `--color-text-secondary` | `#f0ebe4` | 5.05:1 | ✅ Pass |
| `--color-text-muted` | `#e8e2da` | 4.65:1 | ✅ Pass |
| `--color-text-dimmed` | `#ddd6cc` | 4.15:1 | ❌ FAIL |

`--color-text-dimmed` is borderline - fails on some backgrounds!

---

## 🟡 MEDIUM Issue #7: 87 CSS Files in Website

```
apps/website/ferni-website/src/css/ → 87 files!
```

Dark mode styles are scattered across:
- `dark-mode.css` (3,099 lines - the "master" file)
- `tokens.css` (775 lines with dark override)
- `_tokens.css` (635 lines)
- `design-tokens.css`
- `capabilities.css` (57 `[data-theme="dark"]` occurrences)
- Plus 13 other files with `@media (prefers-color-scheme: dark)`

**No single source of truth.** Fixing dark mode requires updating multiple files.

---

## 📊 File Analysis

### Files with Dark Mode Code

| File | `@media` Blocks | `[data-theme]` Blocks | Lines |
|------|-----------------|----------------------|-------|
| dark-mode.css | 48 | 223 | 3,099 |
| capabilities.css | 1 | 57 | ~500 |
| tokens.css | 1 | 1 | 775 |
| _tokens.css | 1 | 1 | 635 |
| components.css | 1 | 0 | ~1,100 |
| story-brand.css | 1 | 0 | ~7,500 |
| footer.css | 2 | 0 | ~200 |

### Hardcoded Color Count by File

| File | Hardcoded `#hex` | Hardcoded `rgba()` |
|------|------------------|-------------------|
| components.css | 0 | 50+ |
| main.css | 3 | 10+ |
| story-brand.css | 5 | 30+ |
| tokens.css | 30 | 20+ |

---

## 🔧 Recommended Fixes

### Phase 1: Emergency Fixes (1-2 hours)

#### Fix 1.1: Fix Circular References in dark-mode.css

```css
/* BEFORE (BROKEN): */
[data-theme="dark"] {
  --color-text-muted: var(--color-text-muted);
  --color-text-dimmed: var(--color-text-dimmed);
}

/* AFTER (FIXED): */
[data-theme="dark"] {
  --color-text-muted: #e8e2da;   /* Hardcode from colors.json */
  --color-text-dimmed: #ddd6cc;  /* Hardcode from colors.json */
}
```

#### Fix 1.2: Add Missing Dark Overrides to _tokens.css

The `_tokens.css` file is the actual imported file but has NO dark mode override block at the end. Add one:

```css
/* Add to end of _tokens.css: */
@media (prefers-color-scheme: dark) {
  :root {
    /* Copy all dark variables from tokens.css lines 628-712 */
  }
}
```

### Phase 2: Consolidation (4-8 hours)

#### Fix 2.1: Unify Dark Mode Selectors

Create a single dark mode approach:
1. Choose ONE selector: `[data-theme="dark"]` (allows manual toggle)
2. Migrate ALL `@media (prefers-color-scheme: dark)` styles to `[data-theme="dark"]`
3. Add JS to auto-set `data-theme` based on OS preference

```javascript
// Add to page init:
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
```

#### Fix 2.2: Replace Hardcoded Colors

Run automated replacement:
```bash
# Example: Replace hardcoded ferni green
sed -i 's/rgba(74, 103, 65,/var(--color-ferni-rgba,/g' *.css
```

Better: Create semantic tokens for all rgba variants:
```css
:root {
  --color-ferni-rgba-03: rgba(74, 103, 65, 0.03);
  --color-ferni-rgba-06: rgba(74, 103, 65, 0.06);
  --color-ferni-rgba-12: rgba(74, 103, 65, 0.12);
  /* etc */
}
```

### Phase 3: Architecture (1-2 days)

#### Fix 3.1: Single Token Source

1. Make `design-system/tokens/colors.json` the ONLY source
2. Auto-generate ALL CSS files from it
3. Add CI check to prevent drift

#### Fix 3.2: Reduce CSS Files

Merge the 87 CSS files down to:
- `tokens.css` - Variables only
- `base.css` - Reset, typography
- `components.css` - All components
- `pages.css` - Page-specific styles

---

## 📋 Immediate Action Items

| Priority | Task | Owner | Est. Time |
|----------|------|-------|-----------|
| 🔴 P0 | Fix circular references in dark-mode.css | - | 15 min |
| 🔴 P0 | Add dark mode block to _tokens.css | - | 30 min |
| 🔴 P0 | Verify all text colors have WCAG AA contrast | - | 1 hour |
| 🟠 P1 | Unify dark mode selectors | - | 4 hours |
| 🟠 P1 | Replace hardcoded colors in components.css | - | 2 hours |
| 🟡 P2 | Consolidate 87 CSS files | - | 1 day |
| 🟡 P2 | Add token drift CI check | - | 2 hours |

---

## 🎯 Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Circular variable references | 2 | 0 |
| Dark mode selector types | 3 | 1 |
| Hardcoded colors in CSS | 45+ | 0 |
| CSS files | 87 | ~10 |
| WCAG AA failures | Unknown | 0 |
| Token drift locations | 5 | 1 |

---

## Related Documentation

- `docs/audits/DESIGN-SYSTEM-AUDIT.md` - Previous audit (December 2024)
- `design-system/tokens/colors.json` - Source of truth for colors
- `.cursorrules` - Dark theme WCAG requirements

---

*Generated: January 14, 2026*
*Audit Type: Dark Theme Readability*
