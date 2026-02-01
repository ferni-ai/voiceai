# Menu Features Completion Plan

> **Date:** January 25, 2026  
> **Status:** 🟡 In Progress  
> **Previous Work:** Phase 1-6 partially complete  
> **Estimated Remaining Effort:** 6-8 hours

---

## Executive Summary

The initial menu features overhaul addressed ~60% of the identified issues. This plan covers the remaining gaps to achieve 100% brand compliance and full E2E validation.

### What's Done ✅

| Task | Status |
|------|--------|
| Created `shared-icons.ts` with SVG icons | ✅ Complete |
| Fixed `growth-journal.ui.ts` - emoji → SVG, colors | ✅ Complete |
| Fixed `pattern-insights.ui.ts` - emoji → SVG, colors | ✅ Complete |
| Fixed `knowledge-quiz.ui.ts` - emoji → SVG | ✅ Complete |
| Fixed `memory-lane.ui.ts` - emoji mood icons → SVG | ✅ Complete |
| Created `empty-state.ts` shared component | ✅ Complete |
| Menu restructured (6 → 5 sections, ~43 → ~26 items) | ✅ Complete |
| NEW badges limited to 3 max | ✅ Complete |
| Deprecated features redirect (Growth Journal, How We Connect, Activity) | ✅ Complete |

### What's Remaining ❌

| Task | Priority | Effort |
|------|----------|--------|
| Fix 4 more files with emoji icons | P0 | 2h |
| Remove console.log from your-year-with-ferni.ui.ts | P1 | 15m |
| Run `pnpm lint:tokens` validation | P1 | 15m |
| Integrate empty-state component in remaining features | P1 | 1h |
| Visual review: light theme | P1 | 30m |
| Visual review: dark theme + WCAG AA | P1 | 30m |
| E2E functional testing all menu features | P2 | 2h |
| TypeScript compilation verification | P1 | 15m |

---

## Phase 7: Complete Emoji Icon Fixes (P0)

### 7.1 Files Still Using Emoji

| File | Location | Emoji to Replace |
|------|----------|------------------|
| `capability-hub.ui.ts` | `apps/web/src/ui/` | 🧠, 📊 |
| `ferni-knows.ui.ts` | `apps/web/src/ui/memory/` | 🎯, 🎉 |
| `memory-threads.ui.ts` | `apps/web/src/ui/memory/` | 🎯, 📅 |
| `routine-builder.ui.ts` | `apps/web/src/ui/ferni-care/` | 📅, 💡 |

### 7.2 Implementation Steps

For each file:
1. Add import: `import { ... } from './icons/shared-icons.js'`
2. Find emoji constants/usage
3. Replace with SVG from shared-icons (add new icons if needed)
4. Update rendering to use `innerHTML` instead of `textContent`
5. Add CSS for SVG sizing if needed

### 7.3 Icons to Add to shared-icons.ts

```typescript
// Add to ANALYTICS_ICONS
brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`,

chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,

// Add to GROWTH_ICONS (if not already present)
lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
```

### 7.4 Deliverables

- [ ] `capability-hub.ui.ts` - zero emoji
- [ ] `ferni-knows.ui.ts` - zero emoji  
- [ ] `memory-threads.ui.ts` - zero emoji
- [ ] `routine-builder.ui.ts` - zero emoji
- [ ] `shared-icons.ts` - new icons added

---

## Phase 8: Code Cleanup (P1)

### 8.1 Remove Console.log Statements

**File:** `apps/web/src/ui/your-year-with-ferni.ui.ts`

Search and remove any `console.log` statements. Replace with proper logger if needed:

```typescript
// ❌ Remove
console.log('debug info');

// ✅ Replace with (if logging is needed)
import { createLogger } from '../utils/logger.js';
const log = createLogger('YourYearUI');
log.debug('debug info');
```

### 8.2 Deliverables

- [ ] Zero `console.log` in your-year-with-ferni.ui.ts
- [ ] Any necessary logging uses createLogger

---

## Phase 9: Empty State Integration (P1)

### 9.1 Features Needing Empty State Component

The `createEmptyState()` component was created but only integrated in 3 files. Integrate in remaining:

| Feature | File | Current Empty State | Action |
|---------|------|---------------------|--------|
| Your Year | `your-year-with-ferni.ui.ts` | Basic/None | Add `createEmptyState('your-year')` |
| Conversation History | `conversation-history.ui.ts` | Unknown | Check & integrate |
| Contacts | `contacts.ui.ts` | Unknown | Check & integrate |
| Music Dashboard | `music-dashboard.ui.ts` | Unknown | Check & integrate |
| Activity | Deprecated → Your Story | N/A | Skip |

### 9.2 Implementation Pattern

```typescript
import { createEmptyState } from './components/empty-state.js';

// In render function when data is empty:
if (data.length === 0) {
  const emptyState = createEmptyState('feature-type');
  container.appendChild(emptyState);
  return;
}
```

### 9.3 Deliverables

- [ ] your-year-with-ferni.ui.ts uses shared empty state
- [ ] conversation-history.ui.ts checked/integrated
- [ ] contacts.ui.ts checked/integrated
- [ ] music-dashboard.ui.ts checked/integrated

---

## Phase 10: Validation & Testing (P1)

### 10.1 TypeScript Compilation

```bash
# Run from apps/web directory
cd apps/web && pnpm tsc --noEmit --skipLibCheck

# Expected: No NEW errors in files we modified
```

**Files to verify compile cleanly:**
- `growth-journal.ui.ts`
- `pattern-insights.ui.ts`
- `knowledge-quiz.ui.ts`
- `memory-lane.ui.ts`
- `settings-menu.ui.ts`
- `icons/shared-icons.ts`
- `components/empty-state.ts`
- `capability-hub.ui.ts` (after fix)
- `memory/ferni-knows.ui.ts` (after fix)
- `memory/memory-threads.ui.ts` (after fix)
- `ferni-care/routine-builder.ui.ts` (after fix)

### 10.2 Linter Check

```bash
# Run ESLint on modified files
pnpm lint apps/web/src/ui/growth-journal.ui.ts \
  apps/web/src/ui/pattern-insights.ui.ts \
  apps/web/src/ui/knowledge-quiz.ui.ts \
  apps/web/src/ui/memory-lane.ui.ts \
  apps/web/src/ui/settings-menu.ui.ts
```

### 10.3 Design Token Validation

```bash
# Verify no hardcoded colors in UI files
cd apps/web && pnpm lint:tokens
```

### 10.4 Deliverables

- [ ] TypeScript compiles with no new errors
- [ ] ESLint passes on all modified files
- [ ] lint:tokens passes (if script exists)

---

## Phase 11: Visual Review (P1)

### 11.1 Light Theme Review

Open each feature in browser with light theme and verify:

| Feature | Check | Status |
|---------|-------|--------|
| Growth Journal | Warm brown background, SVG icons visible | ☐ |
| Pattern Insights | Warm colors, icons render correctly | ☐ |
| Knowledge Quiz | Category icons visible, colors warm | ☐ |
| Memory Lane | Mood icons visible, card tints warm | ☐ |
| Settings Menu | All menu items visible, icons render | ☐ |
| Capability Hub | Icons render (after fix) | ☐ |
| Ferni Knows | Icons render (after fix) | ☐ |
| Memory Threads | Icons render (after fix) | ☐ |
| Routine Builder | Icons render (after fix) | ☐ |

### 11.2 Dark Theme Review

Same features with dark theme:

| Feature | Check | Status |
|---------|-------|--------|
| Growth Journal | Text readable (WCAG AA 4.5:1), colors warm | ☐ |
| Pattern Insights | Contrast sufficient, icons visible | ☐ |
| Knowledge Quiz | Modal readable in dark mode | ☐ |
| Memory Lane | Card backgrounds work in dark | ☐ |
| Settings Menu | All text readable | ☐ |

### 11.3 Empty State Review

For new users (or simulated empty data):

| Feature | Empty State | Status |
|---------|-------------|--------|
| Growth Journal | Shows warm encouraging copy | ☐ |
| Pattern Insights | Shows "learning your rhythms" | ☐ |
| Memory Lane | Shows "building memories" | ☐ |
| Your Year | Shows anticipation message | ☐ |

### 11.4 Deliverables

- [ ] All features visually correct in light theme
- [ ] All features pass WCAG AA in dark theme
- [ ] Empty states are warm and encouraging

---

## Phase 12: E2E Functional Testing (P2)

### 12.1 Feature Access Test

For each menu feature:

```
1. Open settings menu
2. Click on feature
3. Verify feature opens (loading state → content)
4. Verify close/dismiss works (X button, backdrop, Escape)
5. Verify no console errors
```

### 12.2 Test Matrix

| Feature | Opens | Shows Data | Closes | No Errors |
|---------|-------|------------|--------|-----------|
| Your Story | ☐ | ☐ | ☐ | ☐ |
| Memory Lane | ☐ | ☐ | ☐ | ☐ |
| Your Patterns | ☐ | ☐ | ☐ | ☐ |
| Conversation History | ☐ | ☐ | ☐ | ☐ |
| Your Year | ☐ | ☐ | ☐ | ☐ |
| Journal | ☐ | ☐ | ☐ | ☐ |
| Knowledge Quiz | ☐ | ☐ | ☐ | ☐ |
| Music Dashboard | ☐ | ☐ | ☐ | ☐ |
| Play Games | ☐ | ☐ | ☐ | ☐ |
| Vibe Controller | ☐ | ☐ | ☐ | ☐ |
| Discover Agents | ☐ | ☐ | ☐ | ☐ |
| Contacts | ☐ | ☐ | ☐ | ☐ |
| Household Members | ☐ | ☐ | ☐ | ☐ |
| Family Callers | ☐ | ☐ | ☐ | ☐ |
| All Connections | ☐ | ☐ | ☐ | ☐ |

### 12.3 Deprecated Feature Redirect Test

```
1. If any code still calls deprecated callbacks, verify redirect works:
   - Growth Journal → Your Story
   - How We Connect → Your Patterns  
   - Activity → Your Story
```

### 12.4 Deliverables

- [ ] All menu features open correctly
- [ ] All features show appropriate data/empty state
- [ ] All features close correctly
- [ ] No console errors during normal usage
- [ ] Deprecated redirects work

---

## Phase 13: Final Audit (P1)

### 13.1 Brand Compliance Checklist

Run final audit on all UI files:

```bash
# Search for remaining emoji in UI files
rg '[\x{1F300}-\x{1F9FF}]' apps/web/src/ui/ --type ts

# Search for hardcoded hex colors (should use CSS vars)
rg '#[0-9a-fA-F]{6}' apps/web/src/ui/*.ui.ts

# Search for console.log
rg 'console\.(log|warn|error)' apps/web/src/ui/ --type ts
```

### 13.2 Acceptance Criteria

| Criteria | Target | Status |
|----------|--------|--------|
| Emoji in UI files | 0 | ☐ |
| Hardcoded colors in new/modified files | 0 | ☐ |
| Console.log in production code | 0 | ☐ |
| NEW badges on features | ≤ 3 | ☐ |
| Menu sections | 5 | ☐ |
| Menu items (approx) | 25-30 | ☐ |

### 13.3 Deliverables

- [ ] Zero emoji in UI code
- [ ] All colors use CSS variables
- [ ] All logging uses createLogger
- [ ] Menu structure matches spec

---

## Implementation Order

### Session 1 (~3 hours)
1. **Phase 7**: Fix remaining 4 emoji files
2. **Phase 8**: Remove console.log
3. **Phase 10.1-10.2**: TypeScript + ESLint check

### Session 2 (~2 hours)  
4. **Phase 9**: Empty state integration
5. **Phase 11**: Visual review (light + dark)

### Session 3 (~2 hours)
6. **Phase 12**: E2E functional testing
7. **Phase 13**: Final audit

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Files with emoji icons | 8 | 0 |
| Files with hardcoded colors | 6 | 0 |
| Menu sections | 6 | 5 |
| Menu items | ~43 | ~26 |
| NEW badges | 15 | 3 |
| Empty states with warm copy | 3 | 10 |
| Brand compliance | ~60% | 100% |

---

## Rollback Plan

If issues discovered after deployment:

1. **Visual regression**: Revert CSS changes, keep icon structure
2. **Functional issues**: Feature flag to restore old menu structure
3. **Performance issues**: Lazy-load shared-icons.ts

---

## Files Modified (Summary)

### Created
- `apps/web/src/ui/icons/shared-icons.ts`
- `apps/web/src/ui/components/empty-state.ts`
- `docs/plans/MENU-FEATURES-COMPLETION-PLAN.md`

### Modified
- `apps/web/src/ui/growth-journal.ui.ts`
- `apps/web/src/ui/pattern-insights.ui.ts`
- `apps/web/src/ui/knowledge-quiz.ui.ts`
- `apps/web/src/ui/memory-lane.ui.ts`
- `apps/web/src/ui/settings-menu.ui.ts`
- `apps/web/src/ui/icons/index.ts`

### To Modify (This Plan)
- `apps/web/src/ui/capability-hub.ui.ts`
- `apps/web/src/ui/memory/ferni-knows.ui.ts`
- `apps/web/src/ui/memory/memory-threads.ui.ts`
- `apps/web/src/ui/ferni-care/routine-builder.ui.ts`
- `apps/web/src/ui/your-year-with-ferni.ui.ts`

---

_Plan created: January 25, 2026_
_Estimated completion: 6-8 hours across 3 sessions_
