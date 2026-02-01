# Menu Features Audit & Fix Plan

> **Date:** January 25, 2026  
> **Auditor:** AI Assistant  
> **Scope:** All features accessible from Settings Menu with "NEW" badges

---

## Executive Summary

The settings menu contains **15 features marked as "NEW"** with varying levels of brand compliance and functionality. This audit identifies issues and provides a prioritized fix plan.

### Key Findings

| Category | Count | Status |
|----------|-------|--------|
| Features with emoji icons (brand violation) | 8 | 🔴 Critical |
| Features with hardcoded colors | 6 | 🟠 High |
| Features with empty states for new users | 10 | 🟡 Medium |
| Features using proper SVG icons | 7 | ✅ Compliant |

---

## Brand Violations by Feature

### 🔴 Critical: Emoji Icon Usage (MUST FIX)

Brand guidelines state: **"NEVER use emoji as icons in UI"** - use Lucide SVG icons instead.

| Feature | File | Emoji Used | Fix Priority |
|---------|------|------------|--------------|
| **Growth Journal** | `growth-journal.ui.ts` | 📓, 🏆, 🔄, 💡, 🎉, 🌱, 📝 | P0 |
| **Pattern Insights** | `pattern-insights.ui.ts` | 📊, 🌱, ✨ | P0 |
| **Knowledge Quiz** | `knowledge-quiz.ui.ts` | 🎯, ✨, 🎉 | P0 |
| **Memory Lane** | `memory-lane.ui.ts` | ✨, 🏆, 🌱 | P1 |
| **Capability Hub** | `capability-hub.ui.ts` | 🧠, 📊 | P1 |
| **Ferni Knows** | `memory/ferni-knows.ui.ts` | 🎯, 🎉 | P1 |
| **Memory Threads** | `memory/memory-threads.ui.ts` | 🎯, 📅 | P1 |
| **Routine Builder** | `ferni-care/routine-builder.ui.ts` | 📅, 💡 | P2 |

### ✅ Compliant: Proper SVG Icons

| Feature | File | Notes |
|---------|------|-------|
| **Future Insights** | `future-insights.ui.ts` | Uses proper ICONS object |
| **Ferni Hub** | `ferni-hub.ui.ts` | Uses `hub-icons.ts` |
| **Settings Menu** | `settings-menu.ui.ts` | Uses centralized ICONS |
| **Vibe Controller** | `vibe-controller.ui.ts` | Uses ICONS object |

---

## Color Violations

### 🟠 High: Hardcoded Colors

Brand guidelines: **"NEVER hardcode hex colors"** - use CSS variables.

| Feature | File | Violation | Should Be |
|---------|------|-----------|-----------|
| **Growth Journal** | `growth-journal.ui.ts` | `#1a1a2e` (cool gray) | `var(--color-bg-secondary)` |
| **Growth Journal** | `growth-journal.ui.ts` | `rgba(255, 215, 0, 0.1)` hardcoded | CSS variable |
| **Pattern Insights** | `pattern-insights.ui.ts` | `rgba(255, 255, 255, ...)` (cool white) | Warm brown tokens |
| **Pattern Insights** | `pattern-insights.ui.ts` | `rgba(100, 180, 255, 0.03)` hardcoded | CSS variable |

### ✅ Compliant: Using CSS Variables

| Feature | File | Notes |
|---------|------|-------|
| **Memory Lane** | `memory-lane.ui.ts` | Uses warm browns `#2C2520`, `#70605a` |
| **Future Insights** | `future-insights.ui.ts` | Uses design tokens |
| **Ferni Hub** | `ferni-hub.ui.ts` | Uses design tokens |

---

## Empty State Issues

These features show empty/stub states for users without sufficient data:

| Feature | Requires | Empty State Quality | Fix Priority |
|---------|----------|---------------------|--------------|
| **Growth Journal** | Conversation history | 🟡 Basic | P0 |
| **Pattern Insights** | 7+ days of data | 🟡 Basic | P1 |
| **Memory Lane** | Significant memories | 🟡 Basic | P1 |
| **Knowledge Quiz** | User profile data | 🟢 Good | - |
| **Your Year** | 30+ days of data | 🔴 None | P0 |
| **Activity** | Any activity | 🟢 Good | - |
| **Conversation Insights** | Feedback data | 🟡 Basic | P1 |

---

## Feature Audit Details

### 1. Growth Journal (`growth-journal.ui.ts`)

**Status:** 🔴 Multiple Issues

**Issues:**
1. Uses emoji icons instead of Lucide SVG
2. Hardcoded rgba colors for entry types
3. Cool gray fallback color (`#1a1a2e`)
4. Side panel drawer (brand prefers centered modals for content)
5. Empty state appears even when default entry should show

**Fixes Required:**
```typescript
// ❌ Current
const TYPE_ICONS: Record<string, string> = {
  milestone: '🏆',
  pattern: '🔄',
  insight: '💡',
  celebration: '🎉',
  nudge: '🌱',
};

// ✅ Should be
const TYPE_ICONS: Record<string, string> = {
  milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">...</svg>',
  pattern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">...</svg>',
  // etc.
};
```

---

### 2. Pattern Insights (`pattern-insights.ui.ts`)

**Status:** 🟠 Color Issues

**Issues:**
1. Uses emoji for type icons
2. Cool white rgba fallbacks instead of warm browns
3. Hardcoded background colors

---

### 3. Memory Lane (`memory-lane.ui.ts`)

**Status:** 🟡 Minor Issues

**Issues:**
1. Uses emoji for mood icons (✨, 🏆, 🌱)

**Good:**
- Uses warm brown fallback colors
- Uses CSS variables correctly
- Centered modal pattern

---

### 4. Knowledge Quiz (`knowledge-quiz.ui.ts`)

**Status:** 🟠 Emoji Icons

**Issues:**
1. Uses emoji for category icons (🎯, ✨, 🎉)

**Good:**
- Empty state handled well
- Good user experience

---

### 5. Future Insights (`future-insights.ui.ts`)

**Status:** ✅ Compliant

**Good:**
- Uses proper SVG ICONS object
- Uses design tokens
- Beautiful implementation

---

### 6. Ferni Hub (`ferni-hub.ui.ts`)

**Status:** ✅ Compliant

**Good:**
- Uses dedicated `hub-icons.ts` for icons
- Uses design tokens
- Well-structured

---

### 7. Vibe Controller (`vibe-controller.ui.ts`)

**Status:** ✅ Compliant

**Good:**
- Uses proper ICONS object
- Uses design tokens

---

### 8. Your Year with Ferni (`your-year-with-ferni.ui.ts`)

**Status:** 🔴 Needs Review

**Issues:**
- Empty state for users with < 30 days
- Console.log statements visible in callback

---

## Prioritized Fix Plan

### Phase 1: Critical Brand Violations (P0) - Week 1

| Task | File | Effort | Impact |
|------|------|--------|--------|
| Replace emoji with Lucide SVG icons | `growth-journal.ui.ts` | 2h | High |
| Fix hardcoded colors | `growth-journal.ui.ts` | 1h | High |
| Replace emoji with Lucide SVG icons | `pattern-insights.ui.ts` | 1h | High |
| Fix warm/cool color fallbacks | `pattern-insights.ui.ts` | 1h | Medium |
| Replace emoji with Lucide SVG icons | `knowledge-quiz.ui.ts` | 1h | Medium |

**Deliverable:** Core "NEW" features are brand-compliant

### Phase 2: Secondary Brand Issues (P1) - Week 2

| Task | File | Effort | Impact |
|------|------|--------|--------|
| Replace emoji in mood icons | `memory-lane.ui.ts` | 1h | Medium |
| Replace emoji icons | `capability-hub.ui.ts` | 1h | Medium |
| Replace emoji icons | `memory/ferni-knows.ui.ts` | 1h | Low |
| Replace emoji icons | `memory/memory-threads.ui.ts` | 1h | Low |
| Improve empty states | Multiple | 4h | High |

**Deliverable:** All memory-related features are brand-compliant

### Phase 3: UX Improvements (P2) - Week 3

| Task | File | Effort | Impact |
|------|------|--------|--------|
| Consider centered modal vs drawer | `growth-journal.ui.ts` | 3h | Medium |
| Remove console.log statements | `your-year-with-ferni.ui.ts` | 0.5h | Low |
| Add onboarding states | Multiple | 4h | High |
| Consolidate icon systems | Create shared icons file | 4h | High |

**Deliverable:** Consistent UX across all menu features

---

## Recommended Icon Consolidation

Create a shared icons file at `apps/web/src/ui/icons/shared-icons.ts`:

```typescript
/**
 * Shared Lucide-style icons for UI components
 * 
 * All icons use:
 * - 24x24 viewBox
 * - stroke="currentColor"
 * - stroke-width="1.5" or "2"
 * - stroke-linecap="round"
 * - stroke-linejoin="round"
 */

export const SHARED_ICONS = {
  // Growth & Progress
  milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  
  pattern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 1-9 9 9 9 0 0 1-6-2.3l-3-2.7"/></svg>',
  
  insight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  
  celebration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
  
  seedling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a4 4 0 0 0 4-4V2H8v4a4 4 0 0 0 4 4Z"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/></svg>',
  
  // Memory & History
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
  
  // Analytics & Data
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  
  // Time & Calendar
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  
  // Emotions
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
};
```

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] Zero emoji icons in Growth Journal, Pattern Insights, Knowledge Quiz
- [ ] All colors use CSS variables with warm fallbacks
- [ ] `pnpm lint:tokens` passes for all edited files
- [ ] Visual review confirms warm, on-brand appearance

### Phase 2 Complete When:
- [ ] Zero emoji icons in Memory Lane, Capability Hub, memory/* files
- [ ] Empty states have warm, encouraging copy
- [ ] All features tested in both light and dark themes

### Phase 3 Complete When:
- [ ] Shared icons file created and documented
- [ ] All menu features use shared icons
- [ ] Brand compliance audit passes 100%
- [ ] Console.log statements removed from production code

---

## Testing Requirements

After each phase:

1. **Visual Review**
   - Light theme appearance
   - Dark theme appearance (WCAG AA contrast)
   - Empty state appearance for new users

2. **Functional Testing**
   - Feature opens from menu
   - Data loads correctly
   - Close/dismiss works

3. **Brand Compliance**
   ```bash
   pnpm lint:tokens  # Check design token usage
   pnpm quality      # Full quality check
   ```

---

## Resources

- Brand Guidelines: `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`
- Design Tokens: `design-system/tokens/*.json`
- Icon Reference: Lucide Icons (https://lucide.dev)
- Good Example: `apps/web/src/ui/future-insights.ui.ts`
- Good Example: `apps/web/src/ui/ferni-hub.ui.ts`

---

## Notes

1. **Why emoji are problematic:**
   - Render differently across OS/browsers
   - Can't be styled (color, size)
   - Look inconsistent with Lucide icons
   - Not accessible (screen readers read emoji names)

2. **Why warm colors matter:**
   - Brand identity: "earthy, grounded, human"
   - Cool grays feel "techy, cold, corporate"
   - Warm browns feel "friendly, approachable"

3. **The "NEW" badge problem:**
   - 15 features marked "NEW" suggests rushed rollout
   - Users may feel overwhelmed
   - Consider removing "NEW" from older features (> 30 days)
