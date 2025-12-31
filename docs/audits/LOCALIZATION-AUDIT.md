# Ferni Localization Audit Report

**Generated:** December 23, 2024  
**Last Updated:** December 30, 2024  
**Scope:** Frontend UI, Services, Backend APIs, Landing Page

---

## Executive Summary

| Area | Status | Details |
|------|--------|---------|
| **i18n Infrastructure** | ✅ Complete | `t()` function, locale detection, RTL utilities |
| **Translation Files** | ✅ 100% Synced | **1,889 keys** in en-US, all locales synced |
| **UI Files w/ i18n** | ✅ **~180 files** | Up from 92 (95% increase!) |
| **Hardcoded Errors** | ✅ **0 errors** | Down from 201 errors |
| **Hardcoded Warnings** | ⚠️ 101 warnings | Title properties (low priority) |
| **Landing Page** | ✅ Complete | Spanish & French at 100%+ |
| **Currency/Pricing** | ✅ Complete | Multi-currency with PPP pricing |
| **ESLint Enforcement** | ✅ Added | Warns on hardcoded toast/textContent |
| **Pre-commit Hook** | ✅ Added | `lint-i18n.js --staged` |
| **Auto-fix Scripts** | ✅ Added | Fix toasts, text, aria-labels |

---

## Quick Commands

```bash
# Check for hardcoded strings (0 errors, 101 warnings)
cd apps/web && npm run lint:i18n

# Auto-fix all hardcoded strings
cd apps/web && npm run i18n:fix:all

# Fix specific patterns
cd apps/web && npm run i18n:fix:toasts    # Fix toast messages
cd apps/web && npm run i18n:fix:text      # Fix textContent
cd apps/web && npm run i18n:fix:aria      # Fix aria-labels

# Sync new keys to all locales
cd apps/web && npm run i18n:sync-missing

# Check translation coverage
cd apps/web && npm run i18n:coverage
```

---

## December 30, 2024 Updates

### 🎉 Major Accomplishments

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Lint Errors** | 201 | **0** | ✅ -100% |
| **Translation Keys** | 1,138 | **1,889** | +751 keys |
| **Files with i18n** | 92 | **~180** | +95% |
| **Toast Messages Localized** | ~30 | **183** | +510% |
| **Aria-labels Localized** | ~50 | **513** | +926% |
| **Locales at 100% Key Coverage** | 10 | **10** | ✅ Maintained |

### ✅ Automated Fix Scripts Created

Three new scripts that automatically fix hardcoded strings:

1. **`npm run i18n:fix:toasts`** - Fixes 183 toast messages across 50 files
2. **`npm run i18n:fix:text`** - Fixes 63 textContent assignments across 19 files  
3. **`npm run i18n:fix:aria`** - Fixes 513 aria-labels across 110 files
4. **`npm run i18n:fix:all`** - Runs all fixes + syncs keys

### ✅ New Translation Key Categories

| Category | Keys Added | Purpose |
|----------|------------|---------|
| `toasts.*` | 156 | All user-facing notifications |
| `accessibility.*` | 570 | Screen reader labels |
| `visualizations.*` | 25 | Data visualization UI |
| `ui.*` | Various | File-specific UI strings |

### ✅ Pre-commit Integration
- `lint-staged` now runs `lint-i18n.js --staged` on UI/service files
- **0 errors** means PRs won't be blocked by i18n issues
- 101 warnings remain (title properties - low priority)

---

## 1. Translation Coverage by Locale

### App Translations (`apps/web/src/i18n/locales/`)

| Locale | Keys | Coverage | Status |
|--------|------|----------|--------|
| **en-US** (source) | 639 | 100% | ✅ Source |
| **es** (Spanish) | 483 | 76% | ⚠️ Missing 156 keys |
| **fr** (French) | 483 | 76% | ⚠️ Missing 156 keys |
| **de** (German) | 483 | 76% | ⚠️ Missing 156 keys |
| **ja** (Japanese) | 483 | 76% | ⚠️ Missing 156 keys |
| **ko** (Korean) | 483 | 76% | ⚠️ Missing 156 keys |
| **zh-Hans** (Simplified Chinese) | 483 | 76% | ⚠️ Missing 156 keys |
| **zh-Hant** (Traditional Chinese) | 483 | 76% | ⚠️ Missing 156 keys |
| **ar** (Arabic - RTL) | 483 | 76% | ⚠️ Missing 156 keys |
| **he** (Hebrew - RTL) | 483 | 76% | ⚠️ Missing 156 keys |
| **en-GB** (British English) | 523 | 82% | ⚠️ Missing 116 keys |

### Landing Page Translations (`apps/website/ferni-website/src/_data/i18n/`)

| Locale | Keys | Status |
|--------|------|--------|
| **en** (source) | 127 | ✅ Source |
| **es** | 139 | ✅ Complete (109%) |
| **fr** | 139 | ✅ Complete (109%) |

---

## 2. UI Files Localization Status

### Summary
- **Total UI files:** 243
- **Files WITH i18n import:** 80 (33%)
- **Files WITHOUT i18n import:** 163 (67%)

### Priority 1: High-Traffic User-Facing Files (Missing i18n)

| File | Hardcoded Strings | Priority |
|------|-------------------|----------|
| `toast.ui.ts` | Toast messages throughout app | 🔴 Critical |
| `add-person.ui.ts` | Form labels, placeholders, aria-labels | 🔴 Critical |
| `edit-person.ui.ts` | Form labels, error messages | 🔴 Critical |
| `your-people.ui.ts` | Section titles, empty states | 🔴 Critical |
| `conversation-starters.ui.ts` | Starter phrases | 🔴 Critical |
| `greeting.ui.ts` | Time-based greetings | 🔴 Critical |
| `confirm-modal.ui.ts` | Confirmation dialogs | 🔴 Critical |
| `empty-state.ui.ts` | Empty state messages | 🔴 Critical |
| `splash-screen.ui.ts` | Loading messages | 🟡 High |
| `celebration.ui.ts` | Celebration messages | 🟡 High |
| `team.ui.ts` | Team member info | 🟡 High |
| `subscription-badge.ui.ts` | Tier names | 🟡 High |

### Priority 2: Settings & Preferences (Missing i18n)

| File | Hardcoded Strings |
|------|-------------------|
| `calendar-settings.ui.ts` | Button states, sync messages |
| `calendar-selection.ui.ts` | Save states |
| `coaching-mode.ui.ts` | Placeholders, section titles |
| `custom-agent-wizard.ui.ts` | Wizard steps, form fields |
| `custom-agent-editor.ui.ts` | Form labels, save states |
| `important-dates.ui.ts` | Date labels, error messages |
| `voice-clone-recorder.ui.ts` | Recording states |

### Priority 3: Feature-Specific (Missing i18n)

| File | Hardcoded Strings |
|------|-------------------|
| `digital-twin.ui.ts` | Journey sections |
| `digital-twin-profile.ui.ts` | Profile placeholders |
| `gift-seeds.ui.ts` | Gift messages |
| `earn-seeds-modal.ui.ts` | Earning methods |
| `garden-dashboard.ui.ts` | Garden terminology |
| `ferni-milestones.ui.ts` | Milestone categories |
| `growth-journey.ui.ts` | Growth stages |

### Priority 4: Admin/Debug (Low Priority)

| File | Notes |
|------|-------|
| `admin.ui.ts` | Admin-only, English acceptable |
| `dev-panel.ui.ts` | Developer tool |
| `insights-debug-panel.ui.ts` | Debug tool |
| `evalops-dashboard.ui.ts` | Internal dashboard |
| `trigger-debug-panel.ui.ts` | Debug tool |

---

## 3. Service Files Needing Localization

### User-Facing Services

| Service | Hardcoded Strings | Priority |
|---------|-------------------|----------|
| `growth-journey.service.ts` | Milestone titles, descriptions | 🔴 Critical |
| `cosmetics.service.ts` | Theme names, descriptions | 🟡 High |
| `ambient-sounds.service.ts` | Sound names, descriptions | 🟡 High |
| `apple-iap.service.ts` | Dialog titles | 🟡 High |
| `engagement-demo-data.ts` | Demo content titles | 🟢 Low |

### Services with Toast/Error Messages

| Service | Needs i18n Import |
|---------|-------------------|
| `seeds-economy.service.ts` | ⚠️ Toast messages |
| `handoff.service.ts` | ⚠️ Error messages |
| `monetization.service.ts` | ⚠️ Upgrade prompts |
| `voice-auth.service.ts` | ⚠️ Auth messages |
| `roadmap.service.ts` | ⚠️ Feature descriptions |

---

## 4. Specific Hardcoded String Patterns

### Toast Messages (Found in 30+ files)

```typescript
// Examples needing i18n:
toast.success("I'll remember what matters");  // digital-twin.ui.ts
toast.error('Could not load your journals');   // digital-twin.ui.ts
toast.success('Saved!');                       // edit-person.ui.ts
toast.warning('Pick a date');                  // important-dates.ui.ts
toast.error("Payment didn't go through");      // ferni-fund.ui.ts
```

**Action:** Replace with `t('toasts.savedSuccess')`, etc.

### Aria-Labels (Found in 50+ instances)

```typescript
// Examples needing i18n:
aria-label="Continue with Google"
aria-label="Remember me"
aria-label="Close"
aria-label="Save"
```

**Action:** Replace with `aria-label="${t('accessibility.continueWithGoogle')}"`, etc.

### Placeholders (Found in 20+ instances)

```typescript
// Examples needing i18n:
placeholder="What should we call them?"
placeholder="Who are they? What makes them special?"
placeholder="Enter friend's email or username"
placeholder="Thinking of you 💚"
```

**Action:** Replace with `placeholder="${t('placeholders.agentName')}"`, etc.

### Button/State Text

```typescript
// Examples needing i18n:
saveBtn.textContent = 'Saving...';
submitBtn.textContent = 'Connecting...';
recordBtn.textContent = 'Stop Recording';
button.innerHTML = `${ICONS.loader} <span>Processing...</span>`;
```

**Action:** Replace with `t('buttons.saving')`, etc.

---

## 5. Backend Localization Needs

### API Error Messages (Lower Priority)

Most API error messages are technical and don't need translation, but these user-facing ones should be localized:

| File | Message | Notes |
|------|---------|-------|
| `custom-agent-routes.ts` | "Voice clone created" | Success message |
| `custom-agent-routes.ts` | "Voice selected" | Success message |

### Persona Greetings

`src/personas/greetings.ts` generates dynamic greetings using templates. These templates are currently English-only but use the LLM to generate contextual responses, which naturally handles multilingual output.

**Recommendation:** The LLM-generated greetings work in any language based on user's language settings. No action needed.

---

## 6. Missing Translation Keys

### Keys in en-US but missing in other locales (sample):

```
common.tryAgain
common.updated
common.today
common.yesterday
common.daysAgo
common.weeksAgo
common.monthsAgo
buttons.chipIn
menu.sections.preferences
menu.sections.connections
menu.sections.practices
menu.sections.youAndFerni
menu.items.creativeYou
menu.items.discoverAgents
menu.items.journaling
menu.items.connections
menu.items.supportFerniExpanded
lifeContext (entire section)
subscription.welcomeFounder
subscription.youreOneOfUs
```

**Total missing:** ~156 keys per locale

---

## 7. RTL (Arabic/Hebrew) Considerations

### Implemented ✅
- `isRTL()` utility function
- `dir="rtl"` attribute support
- CSS logical properties where applicable

### Needs Testing 🔍
- Settings menu direction
- Modal layouts
- Form field alignment
- Icon positioning (arrows, etc.)
- Waveform animation direction
- Toast positioning

---

## 8. Currency/Pricing Status ✅

Multi-currency pricing is **fully implemented** in `src/i18n/pricing.ts`:

| Currency | Friend | Partner | Notes |
|----------|--------|---------|-------|
| USD | $10 | $20 | Default |
| EUR | €8.99 | €17.99 | PPP adjusted |
| GBP | £7.99 | £15.99 | PPP adjusted |
| JPY | ¥1500 | ¥3000 | No decimals |
| KRW | ₩15,000 | ₩30,000 | No decimals |
| CNY | ¥69 | ¥139 | Special China pricing |
| TWD | NT$299 | NT$599 | No decimals |
| SAR | 37 ر.س | 75 ر.س | RTL symbol position |
| ILS | ₪35 | ₪70 | |

### Stripe Price IDs Needed
Prices need to be created in Stripe Dashboard for each currency:
- `STRIPE_PRICE_FRIEND_EUR`, `STRIPE_PRICE_PARTNER_EUR`
- `STRIPE_PRICE_FRIEND_GBP`, `STRIPE_PRICE_PARTNER_GBP`
- etc.

---

## 9. Recommended Action Plan

### Phase 1: Complete Translations (Week 1-2)
1. Export missing 156 keys to translation platform
2. Professional translation for all 10 locales
3. Update all translation files to 100%

### Phase 2: High-Priority UI Files (Week 2-3)
1. Add i18n imports to critical files:
   - `toast.ui.ts`
   - `add-person.ui.ts`
   - `edit-person.ui.ts`
   - `greeting.ui.ts`
   - `confirm-modal.ui.ts`
   - `empty-state.ui.ts`
2. Replace hardcoded strings with `t()` calls
3. Add new keys to en-US.json as needed

### Phase 3: Medium-Priority Files (Week 3-4)
1. Settings & preferences files
2. Feature-specific files
3. Services with user-facing strings

### Phase 4: RTL Testing (Week 4-5)
1. Visual testing in Arabic
2. Visual testing in Hebrew
3. Fix layout issues
4. Add RTL-specific CSS where needed

### Phase 5: Stripe Multi-Currency (Week 5)
1. Create Stripe prices for all currencies
2. Set environment variables
3. Test checkout flow in each currency

---

## 10. Automated Checks

### Add to CI Pipeline

```bash
# Check for hardcoded strings in UI files
pnpm lint:i18n

# Check translation coverage
pnpm i18n:coverage

# Check RTL layout issues
pnpm test:rtl
```

### Pre-commit Hook Addition

Add to `.husky/pre-commit`:
```bash
# Check for new hardcoded strings
pnpm lint:i18n --staged
```

---

## Files Reference

### Already Localized (Sample)
- `apps/web/src/ui/settings-menu.ui.ts` ✅
- `apps/web/src/ui/journey.ui.ts` ✅
- `apps/web/src/ui/subscription.ui.ts` ✅
- `apps/web/src/ui/onboarding.ui.ts` ✅
- `apps/web/src/ui/trust-journey/index.ts` ✅

### Full List of Files Missing i18n

<details>
<summary>Click to expand (163 files)</summary>

```
apps/web/src/ui/add-person.ui.ts
apps/web/src/ui/admin.ui.ts
apps/web/src/ui/agent-particles.ui.ts
apps/web/src/ui/ambient-effects.ui.ts
apps/web/src/ui/ambient-life.ui.ts
apps/web/src/ui/animation-orchestrator.ui.ts
apps/web/src/ui/avatar-feedback.ui.ts
apps/web/src/ui/avatar-lamp.ui.ts
apps/web/src/ui/avatar-soul.ui.ts
apps/web/src/ui/better-than-human.ui.ts
apps/web/src/ui/birthday-reminders.ui.ts
apps/web/src/ui/brand-ui.ts
apps/web/src/ui/calendar-quick-widget.ui.ts
apps/web/src/ui/cameo-roster.ui.ts
apps/web/src/ui/celebration.ui.ts
apps/web/src/ui/celebrations.ui.ts
apps/web/src/ui/character-sheet.ui.ts
apps/web/src/ui/coach.ui.ts
apps/web/src/ui/coaching-mode.ui.ts
apps/web/src/ui/cognitive-insights-overlay.ts
apps/web/src/ui/commands.ui.ts
apps/web/src/ui/confirm-modal.ui.ts
apps/web/src/ui/connection-heart.ui.ts
apps/web/src/ui/connection-quality.ui.ts
apps/web/src/ui/conversation-cost.ui.ts
apps/web/src/ui/conversation-starters.ui.ts
apps/web/src/ui/custom-agent-editor.ui.ts
apps/web/src/ui/custom-agent-wizard.ui.ts
apps/web/src/ui/digital-twin-profile.ui.ts
apps/web/src/ui/digital-twin.ui.ts
apps/web/src/ui/earn-seeds-modal.ui.ts
apps/web/src/ui/easter-eggs.ui.ts
apps/web/src/ui/edit-person.ui.ts
apps/web/src/ui/empty-state.ui.ts
apps/web/src/ui/engagement-components.ts
apps/web/src/ui/engagement.ui.ts
apps/web/src/ui/eye-tracking.ui.ts
apps/web/src/ui/favicon-manager.ui.ts
apps/web/src/ui/ferni-awakens.ui.ts
apps/web/src/ui/ferni-expressions.ui.ts
apps/web/src/ui/ferni-eye.ui.ts
apps/web/src/ui/ferni-fund.styles.ts
apps/web/src/ui/ferni-milestones.ui.ts
apps/web/src/ui/ferni-moments.ui.ts
apps/web/src/ui/garden-dashboard.ui.ts
apps/web/src/ui/gestures.ui.ts
apps/web/src/ui/gift-seeds.ui.ts
apps/web/src/ui/gift-suggestions.ui.ts
apps/web/src/ui/greeting.ui.ts
apps/web/src/ui/growth-journey.ui.ts
apps/web/src/ui/import-contacts.ui.ts
apps/web/src/ui/important-dates.ui.ts
apps/web/src/ui/index.ts
apps/web/src/ui/insights-debug-panel.ui.ts
apps/web/src/ui/keyboard.ui.ts
apps/web/src/ui/kinetic-typography.ui.ts
apps/web/src/ui/legacy-share.ui.ts
apps/web/src/ui/legacy-stories.ui.ts
apps/web/src/ui/living-logo.ui.ts
apps/web/src/ui/loading-skeleton.ui.ts
apps/web/src/ui/loading-states.ui.ts
apps/web/src/ui/log-moment.ui.ts
apps/web/src/ui/logo-expressions.ui.ts
apps/web/src/ui/magnetic-hover.ui.ts
apps/web/src/ui/marketing-dashboard.ui.ts
apps/web/src/ui/memory-input-modal.ui.ts
apps/web/src/ui/mentor-teachings.ui.ts
apps/web/src/ui/message.ui.ts
apps/web/src/ui/micro-interactions.ui.ts
apps/web/src/ui/milestone-card.ui.ts
apps/web/src/ui/mood.ui.ts
apps/web/src/ui/persona-magic.ui.ts
apps/web/src/ui/persona-transition.ui.ts
apps/web/src/ui/practice-briefing-toast.ui.ts
apps/web/src/ui/practice-suggestions.ui.ts
apps/web/src/ui/presence.ui.ts
apps/web/src/ui/proactive-outreach.ui.ts
apps/web/src/ui/professional-tasks.ui.ts
apps/web/src/ui/record-gift.ui.ts
apps/web/src/ui/relationship-card.ui.ts
apps/web/src/ui/relationship-insights.ui.ts
apps/web/src/ui/ripple.ui.ts
apps/web/src/ui/ritual-builder.ui.ts
apps/web/src/ui/roleplay-mode.ui.ts
apps/web/src/ui/seeds-display.ui.ts
apps/web/src/ui/seeds-toast.ui.ts
apps/web/src/ui/send-message.ui.ts
apps/web/src/ui/service-health.ui.ts
apps/web/src/ui/skeleton.ui.ts
apps/web/src/ui/soul.test.ts
apps/web/src/ui/soul.ui.ts
apps/web/src/ui/sound.ui.ts
apps/web/src/ui/splash-screen.ui.ts
apps/web/src/ui/spotify.ui.ts
apps/web/src/ui/streak-celebrations.ui.ts
apps/web/src/ui/subscription-badge.ui.ts
apps/web/src/ui/talk-to-twin.ui.ts
apps/web/src/ui/task-mode.ui.ts
apps/web/src/ui/team-insights.ui.ts
apps/web/src/ui/team.ui.ts
apps/web/src/ui/toast.ui.ts
apps/web/src/ui/transcript.ui.ts
apps/web/src/ui/trigger-debug-panel.ui.ts
apps/web/src/ui/trust-journey.ui.ts
apps/web/src/ui/voice-clone-recorder.ui.ts
apps/web/src/ui/voice-id-badge.ui.ts
apps/web/src/ui/waveform.ui.ts
apps/web/src/ui/weather-effects.ui.ts
apps/web/src/ui/winter-solstice.ui.ts
apps/web/src/ui/your-people.ui.ts
```

</details>

---

## Summary

| Metric | Value |
|--------|-------|
| Total UI Files | 243 |
| Files with i18n | 80 (33%) |
| Files needing i18n | 163 (67%) |
| Translation keys (en-US) | 639 |
| Non-English coverage | 76% |
| Missing keys per locale | ~156 |
| Supported locales | 11 |
| RTL locales | 2 (ar, he) |
| Currencies supported | 9 |

**Overall Localization Readiness: 45%**

---

*Generated by Cursor AI - December 2024*

