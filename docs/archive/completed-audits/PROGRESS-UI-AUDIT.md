# "Your Progress" / "Your Journey" UI Audit

> **Audit Date:** December 20, 2025  
> **Status:** ✅ Complete - All changes implemented

---

## Summary

Audited all UI components related to user progress, relationship tracking, and journey visualization. Standardized terminology and removed dead code.

---

## Components Audited

### 1. **journey.ui.ts** (~2,400 lines)
**Purpose:** The main "Your Journey" modal - a unified view of relationship progress, trust insights, and milestones.

**Status:** ✅ Primary component for journey visualization

**Key Features:**
- Progress ring showing stage completion
- Relationship stage display with taglines
- Trust insights section ("What I've Noticed")
- Milestones scrapbook with categories
- Connection state banner (connected/disconnected)

**Recommendations:**
- 🔴 **File too large** - Should be split into:
  - `journey/styles.ts` (~1,200 lines of CSS)
  - `journey/trust-insights.ts` (~300 lines)
  - `journey/milestones.ts` (~100 lines)
  - `journey/connection-banner.ts` (~100 lines)

---

### 2. **analytics-dashboard.ui.ts** (~1,300 lines)
**Purpose:** Analytics dashboard showing engagement metrics over time (streaks, mood, prediction accuracy).

**Status:** ✅ Updated title to "Your Journey" (was "Your Progress")

**Key Features:**
- Streak trends visualization
- Mood pattern charts
- Prediction accuracy tracking
- Growth insights

---

### 3. **engagement.ui.ts** (~500 lines)
**Purpose:** "Daily Check-in" modal for rituals, streaks, and emotional weather.

**Status:** ✅ Updated section label to "Your Journey" (was "Your Progress")

**Key Features:**
- Daily ritual tracking
- Streak display
- Emotional weather history
- Stats overview

---

### 4. **progress-indicator.ui.ts** (~450 lines)
**Purpose:** Subtle, always-visible indicator in bottom-left corner showing progress toward next relationship stage.

**Status:** ✅ Keep as-is - serves unique purpose

**Key Features:**
- Collapsed/expanded states
- Stage progress arc
- Conversation metrics
- Hides during active conversations

---

### 5. **stage-celebration.ui.ts** (~1,380 lines)
**Purpose:** Stage-up celebration overlay. Progress panel functions redirect to journey.ui.ts.

**Status:** ✅ Renamed from `relationship-progress.ui.ts`

**Key Features:**
- Stage-up celebration modal with confetti animations
- Stage descriptions and transitions
- Legacy exports maintained for compatibility
- New exports: `initStageCelebration`, `showStageCelebration`, `stageCelebration`

---

### 6. **journey-indicator.ui.ts** (DELETED)
**Purpose:** Was intended to be a badge near avatar showing milestone count.

**Status:** ❌ **REMOVED** - Never imported anywhere (dead code)

---

## Changes Made

### ✅ All Completed

| Change | Files |
|--------|-------|
| Standardized "Your Journey" naming | `analytics-dashboard.ui.ts`, `engagement.ui.ts` |
| Created shared icons module | `ui/icons/journey-icons.ts`, `ui/icons/index.ts` |
| Removed dead code | `journey-indicator.ui.ts` (deleted) |
| Extracted CSS to separate module (~1,200 lines) | `ui/journey/styles.ts` |
| Renamed for clarity | `relationship-progress.ui.ts` → `stage-celebration.ui.ts` |
| Updated all imports | `app.ts`, `index.ts`, `lazy-ui.ts` |
| journey.ui.ts uses shared icons | Replaced inline ICONS with JOURNEY_ICONS |

### 📊 File Size Improvements

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `journey.ui.ts` | ~2,400 lines | ~1,090 lines | **55%** |
| New: `journey/styles.ts` | - | ~1,100 lines | (extracted CSS) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Points                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Settings Menu ─────────► journey.ui.ts ("Your Journey" modal)  │
│                                                                  │
│  Stage Change Event ────► relationship-progress.ui.ts           │
│                           (celebration overlay)                  │
│                                                                  │
│  Avatar Click (future) ──► progress-indicator.ui.ts             │
│                           (bottom-left indicator)               │
│                                                                  │
│  Menu Item ─────────────► analytics-dashboard.ui.ts             │
│                           (engagement metrics dashboard)         │
│                                                                  │
│  Menu Item ─────────────► engagement.ui.ts                      │
│                           (daily check-in modal)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Shared Resources

### Icons (`ui/icons/journey-icons.ts`)

Centralized Lucide-style icons for all journey/progress components:

| Icon | Purpose |
|------|---------|
| `heart`, `heartFilled`, `heartBroken` | Connection states |
| `sparkles`, `star`, `trophy` | Achievements |
| `messageCircle`, `calendar`, `flame` | Stats |
| `close`, `chevronDown`, `chevronUp` | Navigation |
| `lock`, `check`, `loader` | States |

**Usage:**
```typescript
import { JOURNEY_ICONS, getJourneyIcon } from '../icons/journey-icons.js';

// Use constant directly
const icon = JOURNEY_ICONS.heart;

// Or with size override
const smallIcon = getJourneyIcon('heart', 16);
```

---

## Naming Convention

**Standardized on "Your Journey"** for all user-facing titles:

| Component | Title |
|-----------|-------|
| journey.ui.ts | "Your Journey" |
| analytics-dashboard.ui.ts | "Your Journey" |
| engagement.ui.ts section | "Your Journey" |
| progress-indicator.ui.ts | "Your Journey with Ferni" |

**Internal naming:**
- Files: `journey-*.ts` for journey-related
- CSS classes: `.journey-*`
- Variables: `journey*` or `progress*`

---

## Test Coverage

Key files to test after changes:

```bash
# Visual regression tests
pnpm test:e2e -- --grep "journey"

# Unit tests for icons
pnpm test -- journey-icons

# Accessibility audit
pnpm audit:ui
```

---

## Related Files

- `services/relationship-stage.service.ts` - Stage state management
- `services/engagement.service.ts` - Engagement data fetching
- `services/trust-journey.service.ts` - Trust data management
- `ui/ferni-milestones.ui.ts` - Milestone definitions
- `config/animation-constants.ts` - Shared animation values

