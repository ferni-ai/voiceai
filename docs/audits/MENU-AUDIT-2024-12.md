# 🍔 Ferni Menu System - Critical Audit

**Date**: December 14, 2024  
**Auditor**: Claude  
**Status**: ✅ RESOLVED - All critical issues fixed

---

## 🎉 COMPLETED IMPROVEMENTS (December 14, 2024)

### ✅ Progressive Disclosure

- Menu sections now show/hide based on relationship stage
- New users see only essential sections (Connect, Personalize, Account)
- Grow section unlocks at "Getting Started" stage
- Remember section unlocks at "Building Trust" stage

### ✅ Expanded Feature Locks

- Expanded from 4 to 12 locked features with unlock progress hints
- Friendly unlock messages: "3 more chats" instead of "Unlock at Building Trust"
- Added `getFeatureUnlockProgress()` to relationship service

### ✅ New Section Organization

| Old Section             | New Section       | User Goal          |
| ----------------------- | ----------------- | ------------------ |
| Sessions & Fun          | **Connect**       | Ways to engage     |
| Your Journey + Insights | **Grow**          | Progress & growth  |
| (new)                   | **Remember**      | Memories & history |
| Customize               | **Make It Yours** | Personalization    |
| Account & Security      | **Account**       | Billing & data     |

### ✅ Brand Voice Updates

| Old Label           | New Label           |
| ------------------- | ------------------- |
| Progress Analytics  | How You're Growing  |
| Prediction Accuracy | My Predictions      |
| Memory Browser      | Our Memories        |
| Toggle Theme        | Light / Dark        |
| Export Data         | Download Your Story |
| Manage Billing      | Payment Settings    |
| Household Members   | Your People         |
| Voice ID            | Your Voice          |

### ✅ Pinned Items Feature

- Users can right-click any menu item to pin/unpin
- Pinned items appear in "Quick Access" section at top
- Persists in localStorage

### ✅ CSS Cleanup

- Removed all hardcoded fallback values
- Using design system tokens consistently

### ✅ E2E Tests Added

Created 9 new test files:

- `conversation-history.spec.ts`
- `games.spec.ts`
- `guided-practices.spec.ts`
- `notifications.spec.ts`
- `subscription.spec.ts`
- `billing.spec.ts`
- `data-export.spec.ts`
- `theme-toggle.spec.ts`
- `language-selector.spec.ts`

---

## Original Audit (Preserved Below)

---

## Executive Summary

The Ferni settings menu has **33 menu items** across 6 sections, plus a stage banner, seeds display, and language selector. This audit reveals significant concerns about:

1. **Overwhelming complexity** - Too many items for early-stage users
2. **Inconsistent feature locking** - Only 4 features have stage-based locks
3. **Missing E2E coverage** - Several menu items lack tests
4. **Design system drift** - Some hardcoded values in styles
5. **Information architecture** - Sections not aligned with user journey

---

## Table of Contents

1. [Current Menu Structure](#1-current-menu-structure)
2. [Information Architecture Audit](#2-information-architecture-audit)
3. [Implementation Status](#3-implementation-status)
4. [E2E Test Coverage](#4-e2e-test-coverage)
5. [Design System Compliance](#5-design-system-compliance)
6. [Brand Voice Audit](#6-brand-voice-audit)
7. [Feature Lock System](#7-feature-lock-system)
8. [Recommendations](#8-recommendations)
9. [Action Items](#9-action-items)

---

## 1. Current Menu Structure

### Stage Banner

```
Your stage: Building Trust
Next: Trusted Guide [progress bar]
```

### Seeds Display

```
Your Seeds
Daily bonus available!
0 seeds to spend
```

### Section 1: Your Journey (4 items)

| Item                | Action          | UI File                     | E2E Test                     |
| ------------------- | --------------- | --------------------------- | ---------------------------- |
| Your Journey        | `your-journey`  | `growth-journey.ui.ts`      | `journey.spec.ts`            |
| Trust Details       | `trust-journey` | `trust-journey.ui.ts`       | `trust-systems.spec.ts`      |
| Progress Analytics  | `analytics`     | `analytics-dashboard.ui.ts` | `analytics.spec.ts`          |
| Prediction Accuracy | `predictions`   | `prediction-tracker.ui.ts`  | `prediction-tracker.spec.ts` |

### Section 2: Insights (4 items)

| Item                 | Action                | UI File                      | E2E Test                     |
| -------------------- | --------------------- | ---------------------------- | ---------------------------- |
| What I've Learned    | `cognitive`           | `cognitive-insights.ui.ts`   | `cognitive-insights.spec.ts` |
| Memory Browser       | `conversation-memory` | `conversation-memory.ui.ts`  | `memory-browser.spec.ts`     |
| Wellbeing Dashboard  | `wellbeing`           | `wellbeing-dashboard.ui.ts`  | `wellbeing.spec.ts`          |
| Conversation History | `history`             | `conversation-history.ui.ts` | ❌ **MISSING**               |

### Section 3: Sessions & Fun (5 items)

| Item           | Action            | Badge | UI File                 | E2E Test                  |
| -------------- | ----------------- | ----- | ----------------------- | ------------------------- |
| Video Sessions | `video-settings`  | NEW   | `video-settings.ui.ts`  | `video-sessions.spec.ts`  |
| Group Coaching | `group-coaching`  | NEW   | `group-coaching.ui.ts`  | `group-coaching.spec.ts`  |
| Team Huddles   | `team`            |       | `team-huddle.ui.ts`     | `team-huddle.spec.ts`     |
| Play Games     | `play-games`      |       | `game-picker.ui.ts`     | ❌ **MISSING**            |
| Musical You    | `music-dashboard` |       | `music-dashboard.ui.ts` | `music-dashboard.spec.ts` |

### Section 4: Customize (10 items)

| Item                   | Action              | Badge | UI File                       | E2E Test                  |
| ---------------------- | ------------------- | ----- | ----------------------------- | ------------------------- |
| Personalize            | `personalize`       |       | `personalize.ui.ts`           | `personalize.spec.ts`     |
| Voice Accent           | `accent-settings`   |       | `accent-settings.ui.ts`       | `accent-settings.spec.ts` |
| Guided Practices       | `commands`          |       | `commands.ui.ts`              | ❌ **MISSING**            |
| Create Custom Practice | `ritual`            |       | `ritual-builder.ui.ts`        | `ritual-builder.spec.ts`  |
| Health & Fitness       | `wearable-settings` | NEW   | `wearable-settings.ui.ts`     | `wearable.spec.ts`        |
| Calendar               | `calendar-settings` |       | `calendar-settings.ui.ts`     | `calendar.spec.ts`        |
| Notifications          | `notifications`     |       | `notification-settings.ui.ts` | ❌ **MISSING**            |
| Toggle Theme           | `theme`             |       | (inline)                      | ❌ **MISSING**            |
| Language               | `toggle-language`   |       | (inline)                      | ❌ **MISSING**            |
| Link Spotify           | `spotify`           |       | `spotify.ui.ts`               | ❌ **MISSING**            |

### Section 5: Account & Security (6 items)

| Item              | Action             | UI File                     | E2E Test                   |
| ----------------- | ------------------ | --------------------------- | -------------------------- |
| Your Plan         | `subscription`     | `subscription.ui.ts`        | ❌ **MISSING**             |
| Manage Billing    | `billing`          | `marketplace-billing.ui.ts` | ❌ **MISSING**             |
| Voice ID          | `voice-enrollment` | `voice-enrollment.ui.ts`    | `voice-identity.spec.ts`   |
| Household Members | `household`        | `household-manager.ui.ts`   | `household.spec.ts`        |
| Contact Info      | `contact-settings` | `contact-settings.ui.ts`    | `contact-settings.spec.ts` |
| Export Data       | `export`           | `data-export.ui.ts`         | ❌ **MISSING**             |

### Section 6: Quick Actions (3 items)

| Item          | Action          | UI File            | E2E Test             |
| ------------- | --------------- | ------------------ | -------------------- |
| Share Ferni   | `share-ferni`   | `referral.ui.ts`   | `referral.spec.ts`   |
| Support Ferni | `support-ferni` | `ferni-fund.ui.ts` | `ferni-fund.spec.ts` |
| Take the Tour | `help`          | `onboarding.ui.ts` | `onboarding.spec.ts` |

---

## 2. Information Architecture Audit

### 🔴 CRITICAL: Menu is Overwhelming

**Problem**: A first-meeting user sees **33 menu items** immediately. This violates our brand principles:

- "Clean, uncluttered spaces" (Brand Guidelines §1)
- "Purposeful simplicity" (Brand Guidelines §1)
- "Japanese zen aesthetics" (Brand Guidelines §1)

**Current structure reveals ALL features from day 1**, regardless of relationship stage:

- Why show "What I've Learned" when Ferni hasn't learned anything yet?
- Why show "Memory Browser" when there are no memories?
- Why show "Progress Analytics" with no progress?

### Recommended: Progressive Disclosure by Stage

| Stage                | Visible Sections      | Items Shown |
| -------------------- | --------------------- | ----------- |
| **First Meeting**    | Customize, Account    | ~10 items   |
| **Getting Started**  | + Your Journey basics | ~15 items   |
| **Building Trust**   | + Insights            | ~22 items   |
| **Established**      | + Sessions & Fun      | ~28 items   |
| **Deep Partnership** | All features          | 33 items    |

### Section Grouping Issues

**Problem**: Current sections don't match user mental models:

| Current Section      | Issue                                             |
| -------------------- | ------------------------------------------------- |
| "Your Journey"       | Mixes progress tracking with prediction analytics |
| "Insights"           | "Conversation History" is not an insight          |
| "Sessions & Fun"     | "Musical You" isn't a session                     |
| "Customize"          | 10 items is too many - needs splitting            |
| "Account & Security" | "Voice ID" is more about identity than security   |

**Recommendation**: Reorganize around user goals:

1. **Connect** - Ways to engage (Voice, Video, Group, Games)
2. **Grow** - Your progress & insights
3. **Remember** - Memories, history, what Ferni learned
4. **Personalize** - Make Ferni yours
5. **Account** - Billing, data, security

---

## 3. Implementation Status

### ✅ Fully Implemented (28 items)

All menu items have corresponding UI files.

### ⚠️ Partial Implementation (3 items)

| Item         | Issue                          |
| ------------ | ------------------------------ |
| Toggle Theme | Inline function, no modal      |
| Language     | Inline dropdown, works         |
| Link Spotify | Hidden by default, conditional |

### 🔴 Integration Issues Found

| Item                  | Issue                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `cognitive`           | Shows "Unlock at Trusted Guide" but FEATURE_LOCK_MAP only has 4 items |
| `conversation-memory` | No lock despite being memory-dependent                                |
| `wellbeing`           | No lock but needs conversation data                                   |

---

## 4. E2E Test Coverage

### Summary

- **Tested**: 21 items (64%)
- **Missing**: 12 items (36%)

### 🔴 Missing E2E Tests

| Item                 | Priority | Reason           |
| -------------------- | -------- | ---------------- |
| Conversation History | HIGH     | Core feature     |
| Play Games           | MEDIUM   | User engagement  |
| Guided Practices     | HIGH     | Core feature     |
| Notifications        | HIGH     | System settings  |
| Toggle Theme         | MEDIUM   | UX critical      |
| Language             | MEDIUM   | i18n critical    |
| Link Spotify         | LOW      | Optional feature |
| Your Plan            | HIGH     | Revenue critical |
| Manage Billing       | HIGH     | Revenue critical |
| Export Data          | HIGH     | Privacy critical |

### Test Files That Exist

```
e2e/
├── accent-settings.spec.ts
├── analytics.spec.ts
├── calendar.spec.ts
├── cognitive-insights.spec.ts
├── contact-settings.spec.ts
├── ferni-fund.spec.ts
├── group-coaching.spec.ts
├── household.spec.ts
├── journey.spec.ts
├── memory-browser.spec.ts
├── music-dashboard.spec.ts
├── onboarding.spec.ts
├── personalize.spec.ts
├── prediction-tracker.spec.ts
├── referral.spec.ts
├── ritual-builder.spec.ts
├── team-huddle.spec.ts
├── trust-systems.spec.ts
├── video-sessions.spec.ts
├── voice-identity.spec.ts
├── wearable.spec.ts
└── wellbeing.spec.ts
```

---

## 5. Design System Compliance

### Colors ✅ Mostly Compliant

The menu uses CSS variables correctly:

- `var(--color-text-primary)`
- `var(--color-background-elevated)`
- `var(--persona-primary)`

### ⚠️ Hardcoded Values Found

```typescript
// settings-menu.ui.ts line 797
color: var(--color-text-secondary, #5c544a);

// Should be just:
color: var(--color-text-secondary);
```

**Recommendation**: Remove all hardcoded fallback colors. Trust the design system.

### Spacing ⚠️ Some Issues

**Good**:

- Uses `var(--space-*)` tokens consistently
- Uses `var(--radius-*)` for borders

**Issues**:

```css
/* Line 1024 - hardcoded margin */
margin-bottom: 2px;

/* Should be: */
margin-bottom: var(--space-0); /* or remove */
```

### Typography ✅ Compliant

Uses proper font variables:

- `var(--font-display)` for headings
- `var(--font-body)` for items

### Animation ✅ Compliant

Uses animation constants:

- `DURATION.FAST`, `DURATION.NORMAL`, `DURATION.MODERATE`
- `EASING.STANDARD`, `EASING.EXPO_OUT`

### Border Radius ✅ Compliant

Uses tokens:

- `var(--radius-md)`
- `var(--radius-full)`

---

## 6. Brand Voice Audit

### ✅ Good Examples

| Label               | Assessment              |
| ------------------- | ----------------------- |
| "Your Journey"      | ✅ Personal, warm       |
| "Trust Details"     | ✅ Relationship-focused |
| "What I've Learned" | ✅ First person, human  |
| "Musical You"       | ✅ Playful, personal    |

### ⚠️ Needs Improvement

| Current               | Issue         | Suggestion            |
| --------------------- | ------------- | --------------------- |
| "Progress Analytics"  | Too corporate | "How You're Growing"  |
| "Prediction Accuracy" | Technical     | "My Predictions"      |
| "Toggle Theme"        | Action verb   | "Light / Dark"        |
| "Export Data"         | Technical     | "Download Your Story" |
| "Manage Billing"      | Corporate     | "Payment Settings"    |
| "Voice ID"            | Technical     | "Your Voice"          |
| "Household Members"   | Generic       | "Your People"         |

### Menu Title Audit

**Current**: "Menu"  
**Assessment**: ❌ Generic, not Ferni-like

**Suggestions**:

- "Let's Go" (action-oriented)
- "What's Next?" (conversational)
- Just remove the title (Apple pattern)

---

## 7. Feature Lock System

### Current Implementation

Only **4 features** are locked by relationship stage:

```typescript
const FEATURE_LOCK_MAP: Record<string, string> = {
  team: 'team-huddle', // Building Trust
  cognitive: 'deep-insights', // Established
  ritual: 'custom-rituals', // Getting Started
  relationship: 'relationship-progress', // Getting Started
};
```

### 🔴 CRITICAL: Inconsistent Locking

**Problem**: The menu shows "Unlock at Trusted Guide" for "What I've Learned" (cognitive), but:

- Memory Browser has NO lock (yet needs memories)
- Wellbeing Dashboard has NO lock (yet needs data)
- Progress Analytics has NO lock (yet needs progress)

### Recommended Lock Expansion

| Feature             | Suggested Stage | Rationale                |
| ------------------- | --------------- | ------------------------ |
| Memory Browser      | Getting Started | Need some memories first |
| Wellbeing Dashboard | Building Trust  | Need mood data           |
| Progress Analytics  | Getting Started | Need some sessions       |
| Prediction Accuracy | Building Trust  | Need predictions first   |
| Team Huddles        | Building Trust  | (current)                |
| What I've Learned   | Established     | (current)                |
| Group Coaching      | Building Trust  | Social feature           |
| Video Sessions      | Building Trust  | More intimate            |

### Visual Lock Treatment

**Current**: Grayed out with lock icon + "Unlock at [Stage]" text

**Issues**:

- Lock icon is small (16px) - hard to see
- Unlock hint uses technical stage names
- No progress indicator to next unlock

**Recommendations**:

1. Show progress to unlock: "3 more conversations to unlock"
2. Use human stage names: "Keep chatting to unlock"
3. Add subtle animation on hover showing progress

---

## 8. Recommendations

### Priority 1: Reduce Overwhelm (CRITICAL)

1. **Implement progressive disclosure** - Show features only when relevant
2. **Collapse more sections by default** - Only "Customize" open for new users
3. **Add "pinned" items** - Let users pin favorites to top
4. **Consider removing sections** - Combine related items

### Priority 2: Fix Feature Locks

1. **Expand FEATURE_LOCK_MAP** to include all data-dependent features
2. **Add progress-to-unlock hints** instead of just stage names
3. **Consider "preview" state** - Show locked features with blur/overlay

### Priority 3: Add Missing E2E Tests

Create tests for:

1. `conversation-history.spec.ts`
2. `games.spec.ts`
3. `guided-practices.spec.ts`
4. `notifications.spec.ts`
5. `subscription.spec.ts`
6. `billing.spec.ts`
7. `data-export.spec.ts`
8. `theme-toggle.spec.ts`
9. `language-selector.spec.ts`

### Priority 4: Brand Voice Polish

1. Rename technical labels to human language
2. Consider removing menu title entirely
3. Add micro-copy to locked items explaining benefit

### Priority 5: Design System Cleanup

1. Remove all hardcoded fallback values
2. Audit spacing - ensure no hardcoded margins
3. Verify WCAG contrast in both themes

---

## 9. Action Items

### Immediate (This Sprint)

- [ ] Add e2e tests for 10 missing items
- [ ] Fix hardcoded CSS values (5 instances)
- [ ] Expand FEATURE_LOCK_MAP to 8 features

### Short-term (Next 2 Sprints)

- [ ] Implement progressive disclosure by stage
- [ ] Rename 7 menu items for brand voice
- [ ] Add unlock progress hints

### Long-term (Roadmap)

- [ ] Consider menu redesign with new section structure
- [ ] Add "pinned items" feature
- [ ] User research on menu usability

---

## Appendix A: File References

| Component            | File Path                                                        |
| -------------------- | ---------------------------------------------------------------- |
| Menu UI              | `apps/web/src/ui/settings-menu.ui.ts`                 |
| Relationship Service | `apps/web/src/services/relationship-stage.service.ts` |
| Design Tokens        | `design-system/tokens/*.json`                                    |
| Brand Guidelines     | `design-system/brand/FERNI-BRAND-GUIDELINES.md`                  |
| E2E Tests            | `e2e/*.spec.ts`                                                  |

## Appendix B: Related Audits

- Design System Audit: `docs/audits/DESIGN-SYSTEM-AUDIT.md`
- Accessibility Audit: `e2e/accessibility.spec.ts`

---

**Audit Complete** | Last Updated: December 14, 2024
