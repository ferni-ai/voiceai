# Admin UI Audit Report

> **Date**: 2025-12-11
> **Scope**: All admin section files in `apps/web/src/admin/`

## Executive Summary

| Category | Status | Issues Found |
|----------|--------|--------------|
| **Brand Compliance** | Needs Work | 145+ violations |
| **Accessibility (WCAG AA)** | ~70% Compliant | 19 issues (5 critical) |

---

## Brand Compliance Audit

### Summary by Category

| Category | Count | Severity | Primary Files |
|----------|-------|----------|---------------|
| Hardcoded Hex Colors | 45+ | HIGH | AdminPortal.ts, AvatarSoulSection.ts, ApiDocsSection.ts |
| Hardcoded rgba/Gradients | 50+ | HIGH | AvatarSoulSection.ts, TrustSection.ts, AdminPortal.ts |
| Hardcoded Spacing | 40+ | MEDIUM | AvatarSoulSection.ts, AdminPortal.ts |
| Undefined Tokens | 5 | HIGH | BusinessMetricsSection.ts |
| Hardcoded Z-Index | 6 | MEDIUM | AdminPortal.ts, AvatarSoulSection.ts |

### Critical Files Requiring Updates

#### 1. AdminPortal.ts (35+ violations)

**Hardcoded Colors (Lines 551-568, 694-1223):**
- `#1a1612`, `#2c2520`, `#faf6f0`, `#d4ccc4`, `#a89a8c` - Background/text colors
- `#d4a84b` - Accent color (should use `var(--color-accent-primary)`)
- `#c44536` - Error color (should use `var(--color-semantic-error)`)
- `#4a6741` - Ferni green (should use `var(--color-ferni)`)
- Multiple `rgba()` values for borders and overlays

**Hardcoded Z-Index:**
- Line 587: `z-index: 100` → `var(--z-sticky)`
- Line 815: `z-index: 100` → `var(--z-modal)`
- Line 1006: `z-index: 1000` → `var(--z-modal-backdrop)`

**Hardcoded Spacing:**
- Lines 718, 749: `0.125rem`, `0.375rem`, `0.5rem` → `var(--space-*)`
- Line 770: `min-height: 300px` → design token

#### 2. AvatarSoulSection.ts (50+ violations)

**Most Problematic** - Contains emojis (violates CLAUDE.md "NO EMOJIS" rule):
- Line 33: "✨ Avatar Soul Lab"
- Lines 147-150: "💙 Comfort Pulse", "🎉 Celebrate"

**Hardcoded Colors:**
- Lines 216-543: Extensive use of `rgba()` and hex colors
- Gradient backgrounds with hardcoded values

**Hardcoded Spacing:**
- 20+ instances of bare `rem` values

#### 3. admin-events.ts (20+ violations)

**Agent Template Colors (Lines 334-385):**
- Basic: `#4a6741`, `#3d5a35`
- Sage: `#3a6b73`, `#2d545a`
- Specialist: `#7a5c4f`, `#5d463c`
- Coordinator: `#5c4a7a`, `#463c5d`
- Coach: `#d4a84b`, `#b8923f`
- Creative: `#a67a6a`, `#8a6458`

**Should use:** `var(--persona-*)` tokens

#### 4. ApiDocsSection.ts

**HTTP Method Colors (Lines 225-252):**
- GET: `rgba(74, 103, 65, 0.2)`, `#4a6741`
- POST: `rgba(58, 107, 115, 0.2)`, `#3a6b73`
- PUT: `rgba(212, 168, 75, 0.2)`, `#d4a84b`
- DELETE: `rgba(196, 69, 54, 0.2)`, `#c44536`

### Recommendations

1. **Define Missing Tokens** - Add `--space-lg`, `--space-xl` to design system
2. **Create Admin Color Tokens** - Define `--admin-bg-*`, `--admin-border-*` variants
3. **Remove Hex Fallbacks** - Once tokens are consistent, remove fallback values
4. **Centralize Agent Colors** - Use persona color tokens from design system

---

## Accessibility Audit

### Critical Issues (Must Fix)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 1 | Form inputs missing `<label for="">` association | admin-events.ts | 203-439 | Screen readers can't link labels to inputs |
| 2 | Divs with `role="button"` instead of `<button>` | AgentsSection.ts | 371 | Inconsistent semantics |
| 3 | Color contrast - warning badges | DashboardSection.ts | 156 | Fails WCAG AA (4.5:1 required) |
| 4 | Modal close buttons lack visible text | admin-events.ts | 198, 409 | Ambiguous for visual users |
| 5 | Retry button missing focus-visible state | AdminPortal.ts | 428 | Keyboard users can't see focus |

### High Priority Issues

| # | Issue | File | Impact |
|---|-------|------|--------|
| 6 | Emojis used in UI text | AvatarSoulSection.ts | Violates brand rules; screen reader issues |
| 7 | Select without visible focus ring | ApiDocsSection.ts | Subtle focus indicator |
| 8 | Emotion buttons lack aria-label | DesignSystemSection.ts | Purpose unclear |
| 9 | Template cards have no text content | AgentsSection.ts | Empty focusable elements |
| 10 | Percentage input incomplete labeling | FlagsSection.ts | Unclear which flag |

### Medium Priority Issues

| # | Issue | File | Impact |
|---|-------|------|--------|
| 11 | Click handlers without keyboard support | admin-events.ts | Keyboard users excluded |
| 12 | Search input missing clear button | FlagsSection.ts | UX inconvenience |
| 13 | Animations without reduced motion check | AvatarSoulSection.ts | Motion sensitivity |
| 14 | Drag-to-reorder without keyboard alternative | AgentsSection.ts | Keyboard users can't reorder |
| 15 | Table headers missing `scope="col"` | BuilderMetricsSection.ts | Screen reader association |

### Low Priority Issues

| # | Issue | File |
|---|-------|------|
| 16 | Status indicator SVG without title | HumanListeningSection.ts |
| 17 | Loading spinner lacks aria-live | AdminPortal.ts |
| 18 | Error message needs aria-live="alert" | AdminPortal.ts |
| 19 | Modals don't trap focus | admin-events.ts |

### Compliance Summary

| Standard | Status |
|----------|--------|
| WCAG 2.1 Level AA | ~70% compliant |
| ARIA Landmarks | Partially implemented |
| Keyboard Navigation | ~75% compliant |
| Color Contrast | 1-2 violations |

---

## Action Plan

### Phase 1: Critical Fixes (Immediate)

1. **Replace emojis** in AvatarSoulSection.ts with text or SVG icons
2. **Add `<label for="">` associations** to all form inputs
3. **Convert divs with `role="button"`** to actual `<button>` elements
4. **Fix color contrast** on warning badges
5. **Add aria-labels** to all unlabeled interactive elements

### Phase 2: High Priority (This Week)

6. **Create admin-specific design tokens** for colors used only in admin
7. **Replace hardcoded z-index** with semantic tokens
8. **Add focus-visible styles** to all interactive elements
9. **Implement keyboard support** for click handlers

### Phase 3: Medium Priority (This Sprint)

10. **Replace all hardcoded colors** with CSS variables
11. **Replace hardcoded spacing** with `var(--space-*)` tokens
12. **Add reduced-motion media queries** to animations
13. **Implement keyboard drag-reorder alternative**
14. **Add `scope="col"` to table headers**

### Phase 4: Polish (Backlog)

15. **Add aria-live regions** for dynamic content
16. **Implement focus trapping** in modals
17. **Add visible loading indicators** with aria descriptions
18. **Full keyboard navigation testing**

---

## Testing Checklist

Before marking fixes complete:

- [ ] `npm run lint:tokens` passes (no hardcoded values)
- [ ] `npm run audit:ui` passes (no accessibility errors)
- [ ] Test with keyboard only (Tab, Enter, Space, Escape)
- [ ] Test with screen reader (VoiceOver on Mac)
- [ ] Test with `prefers-reduced-motion: reduce`
- [ ] Verify color contrast with browser DevTools

---

## Files Changed in This Audit Session

| File | Change |
|------|--------|
| `src/services/admin-activity.ts` | NEW - Firestore-backed activity log |
| `src/api/v1/admin/dashboard.ts` | Updated to use Firestore activity service |
| `src/api/subscription-routes.ts` | Fixed missing await |
| `src/personas/bundles/mcp-integration.ts` | Fixed bundle.path → bundlePath |
