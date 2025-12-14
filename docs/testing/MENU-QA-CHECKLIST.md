# 🧪 Menu System QA Testing Checklist

**Date**: December 14, 2024  
**Version**: 2.0 (Progressive Disclosure Update)

---

## 🚀 Prerequisites

Before testing, start all 3 servers:

```bash
# Terminal 1 - Token Server (port 3001)
node token-server.js

# Terminal 2 - UI Server (port 3002)
PORT=3002 node ui-server.js

# Terminal 3 - Frontend Dev Server (port 3004)
cd frontend-typescript && pnpm dev
```

Open the app at: `http://localhost:3004`

---

## 📋 Test Scenarios

### 1. Progressive Disclosure (By Relationship Stage)

#### First Meeting (New User)

- [ ] Clear localStorage: `localStorage.clear()` then refresh
- [ ] Open menu - verify only these sections are visible:
  - [ ] ✅ Connect section
  - [ ] ✅ Make It Yours section
  - [ ] ✅ Account section
  - [ ] ❌ Grow section (should be hidden)
  - [ ] ❌ Remember section (should be hidden)
- [ ] Stage banner shows "New Friends"

#### Getting Started (2+ conversations)

- [ ] Simulate: `relationshipStageService.data.metrics.totalConversations = 3`
- [ ] Refresh and open menu
- [ ] Verify Grow section is now visible
- [ ] Verify Remember section is still hidden

#### Building Trust (7+ convos, 3+ days)

- [ ] Simulate advanced metrics
- [ ] Verify Remember section is now visible
- [ ] All sections should be visible

---

### 2. Feature Locking

#### Locked Features Display

- [ ] Open menu at "First Meeting" stage
- [ ] Verify these items show lock icon + progress hint:
  - [ ] Progress Analytics - "2 more chats"
  - [ ] Memory Browser - "3 more chats" (or "X more days")
  - [ ] Wellbeing Dashboard - shows lock
  - [ ] Video Chat - shows lock
  - [ ] Group Sessions - shows lock
  - [ ] Team Huddles - shows lock
  - [ ] What I've Learned - shows lock

#### Locked Item Behavior

- [ ] Click a locked item
- [ ] Verify shake animation plays
- [ ] Verify item does NOT open
- [ ] Verify unlock hint is visible below label

---

### 3. Pinned Items Feature

#### Pinning Items

- [ ] Right-click on "Play Games"
- [ ] Verify item gets pinned
- [ ] Verify "Quick Access" section appears at top
- [ ] Verify pinned item has X button for unpin

#### Unpinning Items

- [ ] Click X button on pinned item
- [ ] Verify item is removed from Quick Access
- [ ] Right-click same item again to re-pin
- [ ] Verify pinning is toggled

#### Persistence

- [ ] Pin 2-3 items
- [ ] Refresh page
- [ ] Verify pinned items persist
- [ ] Verify pinned items appear in Quick Access section

---

### 4. New Section Structure

#### Connect Section

- [ ] Verify contains: Play Games, Musical You, Video Chat, Group Sessions, Team Huddles
- [ ] Verify section is collapsible
- [ ] Verify chevron rotates on expand/collapse

#### Grow Section

- [ ] Verify contains: Your Journey, Our Relationship, How You're Growing, My Predictions, What I've Learned, Your Wellbeing
- [ ] Verify locked items show properly

#### Remember Section

- [ ] Verify contains: Our Memories, Past Conversations
- [ ] Verify section only visible at Building Trust+

#### Make It Yours Section

- [ ] Verify contains: Personalize, Voice & Accent, Guided Practices, Create Practice, Health & Fitness, Calendar, Notifications, Light/Dark, Language
- [ ] Verify Spotify link appears only when configured

#### Account Section

- [ ] Verify contains: Your Plan, Payment Settings, Your Voice, Your People, Contact Info, Download Your Story

---

### 5. Brand Voice Updates

Verify these labels appear correctly:

| Old Label            | New Label           | Location         |
| -------------------- | ------------------- | ---------------- |
| Progress Analytics   | How You're Growing  | Grow section     |
| Prediction Accuracy  | My Predictions      | Grow section     |
| Memory Browser       | Our Memories        | Remember section |
| Toggle Theme         | Light / Dark        | Make It Yours    |
| Export Data          | Download Your Story | Account          |
| Manage Billing       | Payment Settings    | Account          |
| Household Members    | Your People         | Account          |
| Voice ID             | Your Voice          | Account          |
| Trust Details        | Our Relationship    | Grow section     |
| Conversation History | Past Conversations  | Remember section |

---

### 6. i18n / Language Testing

#### Language Selector

- [ ] Click Language item in Make It Yours section
- [ ] Verify dropdown expands
- [ ] Verify current language has checkmark
- [ ] Verify flag emoji shows for each language

#### Language Switching

- [ ] Switch to Spanish (Español)
- [ ] Verify menu title changes to "¿Qué sigue?"
- [ ] Verify section names translate
- [ ] Verify item labels translate
- [ ] Verify unlock hints translate

#### RTL Languages

- [ ] Switch to Arabic (العربية)
- [ ] Verify page direction changes to RTL
- [ ] Verify menu layout respects RTL
- [ ] Switch to Hebrew (עברית)
- [ ] Verify same RTL behavior

---

### 7. Theme Toggle

- [ ] Click "Light / Dark" item
- [ ] Verify theme switches immediately
- [ ] Verify menu styling updates with theme
- [ ] Refresh page
- [ ] Verify theme persists

---

### 8. Accessibility

#### Keyboard Navigation

- [ ] Press Tab to navigate menu items
- [ ] Verify focus indicators are visible
- [ ] Press Enter to activate items
- [ ] Press Escape to close menu

#### Screen Reader

- [ ] Enable VoiceOver/NVDA
- [ ] Navigate menu
- [ ] Verify labels are read correctly
- [ ] Verify locked items announce their status

---

### 9. Visual Inspection

#### Stage Banner

- [ ] Verify stage name displays correctly
- [ ] Verify progress bar shows current progress
- [ ] Verify "Next: [Stage]" shows for non-max users
- [ ] Verify "Life Partners" shows at max level

#### Seeds Card

- [ ] Verify seeds balance displays
- [ ] Verify daily bonus indicator works

#### Quick Actions

- [ ] Verify Share Ferni, Support Ferni, Take the Tour at bottom
- [ ] Verify they work when clicked

---

### 10. E2E Test Validation

Run these test files:

```bash
# Run in order of priority
npx playwright test e2e/theme-toggle.spec.ts
npx playwright test e2e/language-selector.spec.ts
npx playwright test e2e/subscription.spec.ts
npx playwright test e2e/conversation-history.spec.ts
npx playwright test e2e/games.spec.ts
npx playwright test e2e/notifications.spec.ts
npx playwright test e2e/guided-practices.spec.ts
npx playwright test e2e/data-export.spec.ts
npx playwright test e2e/billing.spec.ts
```

---

## 🐛 Bug Report Template

If you find issues, document them:

```markdown
**Issue**: [Brief description]
**Steps to Reproduce**:

1.
2.
3.

**Expected**: [What should happen]
**Actual**: [What actually happens]
**Browser**: [Chrome/Safari/Firefox]
**Stage**: [First Meeting/Getting Started/Building Trust/etc]
```

---

## ✅ Sign-off

| Tester | Date | Result            |
| ------ | ---- | ----------------- |
|        |      | ⬜ Pass / ⬜ Fail |

---

## 📝 Notes

- All tests should pass in both light and dark themes
- Test on mobile viewport (375px width) in addition to desktop
- Test with slow 3G throttling to verify loading states
