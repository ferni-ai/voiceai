# Landing Page Brand Alignment Audit
**Date:** 2025-12-12
**Scope:** `promo/ferni-website/` alignment with brand guidelines and design system

---

## Executive Summary

The landing page has **significant drift** from the brand guidelines and design system tokens. The primary issues are:

1. **Accent color mismatch** - Brand guidelines specify `#3D5A45`, but design tokens use `#2d5a3d`
2. **Persona color inconsistencies** - Nayan differs between tailwind config and tokens
3. **Token architecture fragmented** - 5+ token file locations causing drift
4. **Hardcoded values** - Tailwind config uses hardcoded hex instead of token references

---

## Critical Discrepancies

### 1. Accent Color Mismatch (HIGH PRIORITY)

| Source | Accent Color | Status |
|--------|--------------|--------|
| Brand Guidelines (`FERNI-BRAND-GUIDELINES.md`) | `#3D5A45` | **Source of Truth** |
| `styles.css` (inline variables) | `#3d5a45` | ✅ Matches brand |
| `design-tokens.css` (auto-generated) | `#2d5a3d` | ❌ **WRONG** |
| `colors.json` (token source) | `#2d5a3d` | ❌ **WRONG** |

**Impact:** CTAs, buttons, and accent elements render with wrong green shade.

**Root Cause:** The design system tokens were set incorrectly. The `colors.json` source of truth diverged from brand guidelines.

**Fix Required:** Update `design-system/tokens/colors.json` accent to `#3D5A45`.

---

### 2. Persona Color: Nayan (MEDIUM PRIORITY)

| Source | Nayan Primary | Status |
|--------|---------------|--------|
| `colors.json` | `#b8956a` | Source of Truth |
| `design-tokens.css` | `#b8956a` | ✅ Matches |
| `tailwind.config.js` | `#8a7a6a` | ❌ **WRONG** |

**Impact:** Nayan's team member card/avatar renders with incorrect color.

**Fix Required:** Update `tailwind.config.js` Nayan to `#b8956a`.

---

### 3. Background Color Variance (LOW PRIORITY)

| Source | Background | Notes |
|--------|------------|-------|
| Brand Guidelines | `#F5F1E8` (Paper Cream) | Primary background |
| `styles.css` | `#f5f1e8` | ✅ Matches |
| `design-tokens.css` | `#faf8f5` | Different - this is "zen" theme |

**Assessment:** The landing page `styles.css` correctly uses brand color. The generated `design-tokens.css` has a different "zen" theme background which isn't being used for the main background anyway. **Not a critical issue** since styles.css takes precedence.

---

## Token Architecture Issues

### Current State (Fragmented)

```
5+ Token File Locations:
├── design-system/tokens/colors.json        ← Source of Truth
├── design-system/dist/tokens.css           ← Build output
├── brand/ferni-design-tokens.css           ← DEPRECATED (should delete)
├── promo/ferni-website/css/design-tokens.css  ← Auto-synced
├── frontend-typescript/public/design-system/tokens.css  ← App tokens
└── promo/ferni-website/tailwind.config.js  ← HARDCODED (not synced!)
```

### Problem: Tailwind Config Bypass

The `tailwind.config.js` file **hardcodes all colors** instead of referencing CSS variables:

```javascript
// Current (WRONG) - hardcoded values
colors: {
  ferni: { DEFAULT: '#4a6741' },
  jack: { DEFAULT: '#9a7b5a' },
  // ...
}

// Should be (CORRECT) - reference CSS variables
colors: {
  ferni: { DEFAULT: 'var(--color-ferni)' },
  jack: { DEFAULT: 'var(--color-jack)' },
  // ...
}
```

**Impact:** Tailwind classes like `bg-nayan` don't update when tokens change.

---

## Hardcoded Values Inventory

### In `tailwind.config.js` (All Should Reference Tokens)

| Variable | Hardcoded | Token Value | Match? |
|----------|-----------|-------------|--------|
| ferni | `#4a6741` | `#4a6741` | ✅ |
| jack | `#9a7b5a` | `#9a7b5a` | ✅ |
| peter | `#3a6b73` | `#3a6b73` | ✅ |
| alex | `#5a6b8a` | `#5a6b8a` | ✅ |
| maya | `#a67a6a` | `#a67a6a` | ✅ |
| jordan | `#c4856a` | `#c4856a` | ✅ |
| **nayan** | `#8a7a6a` | `#b8956a` | ❌ **MISMATCH** |

### In `styles.css` (Inline Token Definitions)

The landing page defines its own `:root` variables in `styles.css:12-52` instead of importing from `design-tokens.css`. This creates a parallel token system.

**Current pattern:**
```css
/* styles.css - defines own tokens */
:root {
  --color-bg: #f5f1e8;
  --color-accent: #3d5a45;
  /* ... */
}

/* Also imports design-tokens.css which has DIFFERENT values */
@import url('design-tokens.css');
```

**Issue:** When both files define the same variable, the last one wins. Import order matters.

---

## Typography Assessment

| Element | Brand Guideline | Implementation | Status |
|---------|-----------------|----------------|--------|
| Display Font | Plus Jakarta Sans | Plus Jakarta Sans | ✅ |
| Body Font | Inter | Inter | ✅ |
| Accent Font | Sora | Sora | ✅ |
| Mono Font | JetBrains Mono | JetBrains Mono | ✅ |

**Typography is correctly aligned.**

---

## Animation/Motion Assessment

| Property | Design Tokens | Landing Page | Status |
|----------|---------------|--------------|--------|
| Ease curves | 12 defined | Uses standard CSS | ⚠️ Could improve |
| Durations | 14 defined | Inline values | ⚠️ Could improve |

**Not critical but could benefit from using token variables for consistency.**

---

## Prioritized Recommendations

### P0 - Critical (Fix Immediately)

1. **Fix accent color in tokens source**
   ```bash
   # In design-system/tokens/colors.json
   # Change accent from #2d5a3d to #3D5A45
   npm run tokens:sync
   ```

2. **Fix Nayan color in tailwind.config.js**
   ```javascript
   nayan: {
     DEFAULT: '#b8956a',  // was #8a7a6a
     dark: '#9a7a52',
     glow: 'rgba(184, 149, 106, 0.28)',
   }
   ```

### P1 - High Priority (This Sprint)

3. **Refactor tailwind.config.js to reference CSS variables**
   - Eliminates hardcoded colors
   - Single source of truth
   - Auto-updates with token sync

4. **Consolidate styles.css token definitions**
   - Remove inline `:root` definitions
   - Rely solely on imported `design-tokens.css`
   - Or: Generate a landing-page-specific token file

### P2 - Medium Priority (Next Sprint)

5. **Delete deprecated token files**
   - Remove `brand/ferni-design-tokens.css`
   - Update any references

6. **Add token drift check to landing page CI**
   - Extend `npm run tokens:check` to validate promo files

### P3 - Nice to Have

7. **Use animation tokens for transitions**
   - Replace inline `0.3s ease` with `var(--duration-slow) var(--ease-smooth)`

---

## Quick Fix Commands

```bash
# 1. Fix accent color in source
# Edit design-system/tokens/colors.json manually:
#   Change "accent": "#2d5a3d" to "accent": "#3D5A45"

# 2. Rebuild and sync tokens
npm run tokens:sync

# 3. Verify no drift
npm run tokens:check

# 4. Fix Nayan in tailwind.config.js manually
# Edit promo/ferni-website/tailwind.config.js
```

---

## Appendix: Color Reference Table

### Brand Guidelines (Source of Truth)

| Name | Hex | Usage |
|------|-----|-------|
| Paper Cream | `#F5F1E8` | Primary background |
| Forest Green | `#3D5A45` | CTAs, buttons, accents |
| Deep Sage | `#4a6741` | Ferni persona |
| Warm Charcoal | `#2C2520` | Primary text |
| Muted Taupe | `#6B635A` | Secondary text |

### Persona Colors (from colors.json)

| Persona | Primary | Secondary | Glow |
|---------|---------|-----------|------|
| Ferni | `#4a6741` | `#3d5a35` | `rgba(74, 103, 65, 0.28)` |
| Jack | `#9a7b5a` | `#7d6348` | `rgba(154, 123, 90, 0.28)` |
| Peter | `#3a6b73` | `#2d5359` | `rgba(58, 107, 115, 0.28)` |
| Alex | `#5a6b8a` | `#4a5a73` | `rgba(90, 107, 138, 0.28)` |
| Maya | `#a67a6a` | `#8a635a` | `rgba(166, 122, 106, 0.28)` |
| Jordan | `#c4856a` | `#a86d55` | `rgba(196, 133, 106, 0.28)` |
| Nayan | `#b8956a` | `#9a7a52` | `rgba(184, 149, 106, 0.28)` |

---

## Sign-Off

- [ ] P0 fixes applied
- [ ] P1 refactoring complete
- [ ] Token drift check passing
- [ ] Visual QA on staging
