# 🚨 POPUP AUDIT: First-Time User Experience

> **Mission:** The goal is to allow people to have a conversation with Ferni. That is gradual and incremental. Not overwhelm with anything that isn't "better than human."

---

## Executive Summary

**Current Problem:** First-time users, especially on mobile, are OVERWHELMED by multiple popups/modals triggering simultaneously or in rapid succession. This violates our core principle of **gradual, incremental discovery**.

**Impact:** Users bounce before they can experience what makes Ferni special - the conversation itself.

---

## 📋 Complete Popup Inventory

### Category A: First-Time User Triggers (IMMEDIATE)

| Popup                  | When Triggered                           | Duration                   | Mobile Impact     |
| ---------------------- | ---------------------------------------- | -------------------------- | ----------------- |
| **Onboarding UI**      | 1500ms after app init (if not completed) | 5 steps, user-controlled   | Full-screen modal |
| **Toast (greeting)**   | Immediately on welcome                   | 2500ms                     | Bottom pill       |
| **Engagement Trigger** | 500ms after connection                   | Persistent until dismissed | Bottom buttons    |
| **Subscription Badge** | App load if free tier                    | Persistent                 | Top-right badge   |

### Category B: Relationship Stage Triggers

| Popup                       | When Triggered                             | Duration                     | Mobile Impact             |
| --------------------------- | ------------------------------------------ | ---------------------------- | ------------------------- |
| **Stage Celebration**       | On relationship stage change               | Full modal with confetti     | Full-screen takeover      |
| **Persona Intro**           | When team member unlocks                   | 3-screen flow                | Full-screen modal         |
| **Team Unlock Celebration** | On unlock event                            | Celebration animation        | Overlay effects           |
| **Feature Hints**           | Every 2s check loop, 1s after stage change | 15s (auto-dismiss) or manual | Spotlight + floating card |

### Category C: Progressive Feature Triggers

| Popup                  | When Triggered                         | Duration       | Mobile Impact   |
| ---------------------- | -------------------------------------- | -------------- | --------------- |
| **Trust Signals**      | Backend events (building-trust+ stage) | 8s auto-hide   | Floating cards  |
| **Progress Indicator** | Stage change                           | Persistent     | Small indicator |
| **Team Intro Modal**   | User-initiated                         | Manual dismiss | Large modal     |

### Category D: Action-Based Triggers

| Popup                          | When Triggered                | Duration       | Mobile Impact             |
| ------------------------------ | ----------------------------- | -------------- | ------------------------- |
| **Subscription Limit Modal**   | Before connection if at limit | Manual dismiss | Full-screen blocking      |
| **Subscription Upgrade Modal** | Multiple triggers             | Manual dismiss | Full-screen modal         |
| **Value Capture**              | Achievement detection         | Manual dismiss | Full-screen with confetti |
| **Voice Enrollment**           | User-initiated                | Flow-based     | Multi-step modal          |
| **Toast Notifications**        | Various events                | 2.5-4s         | Bottom pills (queue)      |

---

## 🔥 Critical Issues Identified

### Issue 1: Simultaneous Popup Storm on First Launch

**What happens:**

1. App loads → Toast greeting shows (immediate)
2. 1500ms → Onboarding starts (if first time)
3. 500ms after connection → Engagement triggers show
4. User finishes first conversation → Stage change fires
5. Stage change → Stage Celebration modal
6. Stage change → Feature hints check (1s delay)
7. Stage change → Progress indicator updates
8. Team unlock check → Persona unlock possible
9. Trust signals → May fire during conversation

**Result:** User sees 3-5+ UI elements competing for attention.

### Issue 2: Feature Hints Polling Loop

```typescript
// feature-hints.ui.ts line 180
checkInterval = setInterval(checkForHintOpportunities, 2000);
```

Every 2 seconds, the system checks for hint opportunities. Combined with:

- Maximum 1 hint at a time (good)
- But fires 1s after EVERY stage change
- Creates frequent "popup lottery" feeling

### Issue 3: Stage Celebration on EVERY Stage Transition

```typescript
// stage-celebration.ui.ts line 199
relationshipStageService.onStageChange((event) => {
  log.info('Stage change detected', { from: event.previousStage, to: event.newStage });
  showStageCelebration(event); // ALWAYS shows!
});
```

No gating on:

- Time since last celebration
- User in middle of conversation
- Other modals already showing
- Mobile vs desktop context

### Issue 4: Progressive Features All Init At Once

```typescript
// progressive-features.service.ts line 50-67
export function initProgressiveFeatures(): void {
  initTeamUnlockService();
  initStageCelebration();
  initTrustSignals();
  initPersonaIntro();
  initFeatureHints();
  initProgressIndicator();
  // All subscribe to stage changes simultaneously!
}
```

Five systems all listening to `onStageChange` independently.

### Issue 5: Mobile Screen Real Estate Conflict

On mobile (< 480px viewport):

- Full-screen modals leave no escape hatch feeling
- Multiple floating elements overlap
- Bottom-positioned elements conflict with iOS safe area
- Touch targets may overlap

### Issue 6: No Popup Coordination/Queue System

Each popup system is independent:

- Toasts have their own queue ✓
- Modals have no coordination ✗
- Feature hints have limit of 1 ✓
- No global "modal already showing" check ✗

---

## 📱 Mobile-Specific Concerns

### Screen Real Estate

| Device            | Viewport | Modal Real Estate | Critical |
| ----------------- | -------- | ----------------- | -------- |
| iPhone SE         | 375x667  | ~300x450 usable   | HIGH     |
| iPhone 15         | 390x844  | ~350x700 usable   | MEDIUM   |
| iPhone 15 Pro Max | 430x932  | ~380x800 usable   | LOW      |
| Android Compact   | 360x640  | ~300x400 usable   | HIGH     |

### Current Modal Sizes

- Onboarding card: 420px max-width (wraps on SE)
- Stage celebration: 480px max-width (overflows on SE)
- Subscription modal: 480px max-width (overflows on SE)
- Feature hints: 280-300px max-width (OK)

### Touch Conflicts

- Close buttons: 40px (good)
- Backdrop tap to close (good)
- But overlapping modals create confusion

---

## 🎯 First-Time User Experience Strategy

### Philosophy

> "The first conversation IS the onboarding."

Users should:

1. **See Ferni** - The avatar, not a modal
2. **Tap connect** - One clear action
3. **Talk** - That's it. That's the product.

Everything else can wait.

### Proposed Tiered Experience

#### Tier 0: Immediate (First Session)

- [ ] Show ONLY the connect button
- [ ] No onboarding modal
- [ ] No feature hints
- [ ] No stage celebrations
- [ ] Simple toast: "Tap to start talking"

#### Tier 1: After First Conversation (Hours/Days later)

- [ ] Subtle welcome back message
- [ ] ONE feature hint (voice/team)
- [ ] Still no forced modals

#### Tier 2: Building Relationship (5+ conversations)

- [ ] Trust signals start appearing
- [ ] Feature hints unlock gradually
- [ ] Team members become visible

#### Tier 3: Established (15+ conversations)

- [ ] Stage celebration (first time only)
- [ ] Full feature discovery enabled
- [ ] Proactive features unlocked

---

## 🔧 Implementation Recommendations

### Immediate Fixes (P0 - This Week)

#### 1. Add Global Modal Coordinator

```typescript
// services/modal-coordinator.service.ts
class ModalCoordinator {
  private activeModal: string | null = null;
  private queue: ModalRequest[] = [];

  request(modalId: string, priority: number): Promise<boolean> {
    if (this.activeModal) {
      if (priority > this.getCurrentPriority()) {
        this.queue.push({ id: this.activeModal, ... });
        return true;
      }
      return false; // Wait your turn
    }
    this.activeModal = modalId;
    return true;
  }

  release(modalId: string): void {
    if (this.activeModal === modalId) {
      this.activeModal = null;
      this.processQueue();
    }
  }
}
```

#### 2. Disable Onboarding for First-Time Users

```typescript
// app.ts - showWelcome()
// REMOVE:
setTimeout(() => {
  startOnboardingIfNeeded();
}, 1500);

// REPLACE WITH:
const conversationCount = greetingUI.getConversationCount();
if (conversationCount >= 2) {
  setTimeout(() => {
    startOnboardingIfNeeded();
  }, 3000);
}
```

#### 3. Add Conversation Context to Stage Celebration

```typescript
// stage-celebration.ui.ts
relationshipStageService.onStageChange((event) => {
  // Don't show during active conversation
  if (appState.get('connection') === 'connected') {
    // Queue for after disconnect
    pendingCelebration = event;
    return;
  }

  // Don't show if another modal is active
  if (!modalCoordinator.request('stage-celebration', 5)) {
    return;
  }

  showStageCelebration(event);
});
```

#### 4. Gate Feature Hints on Conversation Count

```typescript
// feature-hints.ui.ts - checkForHintOpportunities()
function checkForHintOpportunities(): void {
  const metrics = relationshipStageService.getMetrics();

  // No hints until user has had at least 2 conversations
  if (metrics.totalConversations < 2) {
    return;
  }

  // ... rest of function
}
```

#### 5. Mobile-First Modal Sizing

```css
/* All modals should use this pattern */
.modal-card {
  max-width: min(480px, calc(100vw - 32px));
  max-height: min(90vh, calc(100vh - 32px));
  max-height: min(90vh, calc(100dvh - 32px)); /* Dynamic viewport */
}

@media (max-width: 480px) {
  .modal-card {
    border-radius: var(--radius-xl, 16px);
    margin: 16px;
  }
}
```

### Medium-Term Fixes (P1 - Next Sprint)

#### 6. Create First-Time User Mode

```typescript
// services/first-time-user.service.ts
export const firstTimeUserService = {
  isFirstSession(): boolean {
    return !localStorage.getItem('ferni:first_session_complete');
  },

  markSessionComplete(): void {
    localStorage.setItem('ferni:first_session_complete', 'true');
  },

  getConversationCount(): number {
    return parseInt(localStorage.getItem('ferni:conversation_count') || '0');
  },
};
```

#### 7. Implement Progressive Feature Unlocking

```typescript
const FEATURE_UNLOCK_GATES = {
  onboarding: { minConversations: 2 },
  'feature-hints': { minConversations: 2 },
  'trust-signals': { minConversations: 5, minStage: 'building-trust' },
  'stage-celebration': { minConversations: 3 },
  'persona-intro': { minConversations: 3 },
  'team-huddles': { minConversations: 7 },
} as const;
```

#### 8. Add Popup Cooldown System

```typescript
// services/popup-cooldown.service.ts
const COOLDOWNS = {
  modal: 30000, // 30s between any modals
  celebration: 60000, // 1min between celebrations
  hint: 10000, // 10s between hints
};

function canShowPopup(type: string): boolean {
  const lastShown = popupTimestamps.get(type) || 0;
  return Date.now() - lastShown > (COOLDOWNS[type] || 0);
}
```

### Long-Term Vision (P2 - Future)

#### 9. Conversational Onboarding

Instead of modals, Ferni introduces features during natural conversation:

- "By the way, you can swipe to meet Maya, our habits coach..."
- "I noticed you've been coming back regularly. Want to set up a daily check-in?"

#### 10. Contextual Feature Discovery

Features appear when relevant:

- Habit coaching after user mentions wanting to build a habit
- Team huddle after 5+ conversations
- Trust journey after emotional breakthrough

---

## 📊 Success Metrics

### Before (Current State)

- First-time users see: 3-5+ UI interruptions in first minute
- Mobile bounce rate: [need data]
- Time to first conversation: [need data]

### After (Target State)

- First-time users see: 0-1 UI interruptions before first conversation
- Mobile bounce rate: Reduce by 50%
- Time to first conversation: Under 10 seconds

---

## 🔄 Testing Checklist

### First-Time User Flow (Mobile)

- [ ] Clear all localStorage
- [ ] Open app on iPhone SE viewport
- [ ] Verify: ONLY see connect button + avatar
- [ ] Tap connect
- [ ] Verify: No modals during conversation
- [ ] End conversation
- [ ] Verify: At most ONE celebration/message

### Returning User Flow (Mobile)

- [ ] Have 3+ conversations logged
- [ ] Open app
- [ ] Verify: Personalized greeting (toast)
- [ ] Verify: No immediate modals
- [ ] Start conversation
- [ ] Verify: Features discoverable but not forced

### Stage Transition Flow

- [ ] Trigger stage change
- [ ] If in conversation: Verify celebration queued
- [ ] If idle: Verify ONE celebration shows
- [ ] Verify: No feature hints during celebration

---

## Appendix: File Locations

| File                                           | Purpose                 |
| ---------------------------------------------- | ----------------------- |
| `src/ui/onboarding.ui.ts`                      | First-time tour         |
| `src/ui/stage-celebration.ui.ts`               | Stage advancement modal |
| `src/ui/feature-hints.ui.ts`                   | Contextual hints        |
| `src/ui/persona-intro.ui.ts`                   | Team member intros      |
| `src/ui/trust-signals.ui.ts`                   | Trust signal cards      |
| `src/ui/subscription.ui.ts`                    | Upgrade/limit modals    |
| `src/ui/value-capture.ui.ts`                   | Achievement celebration |
| `src/ui/toast.ui.ts`                           | Toast notifications     |
| `src/services/progressive-features.service.ts` | Feature orchestration   |
| `src/app.ts`                                   | Main initialization     |

---

---

## 🔊 CELEBRATION SOUND AUDIT

### The Problem

The celebration sounds are **overwhelming and not on-brand**. They feel like a casino/game app, not a warm human coach.

### Current Sound Architecture

**Two competing sound systems:**

1. **Ferni Audio Engine** (`ferni-audio.service.ts`) - MP3 files (MISSING!)

   | Sound                    | File                              | Duration | Status  |
   | ------------------------ | --------------------------------- | -------- | ------- |
   | `celebration.small`      | ferni-celebration-small.mp3       | 1.8s     | MISSING |
   | `celebration.big`        | ferni-celebration-big.mp3         | 2.5s     | MISSING |
   | `celebration.milestone`  | ferni-celebration-milestone.mp3   | 3.0s     | MISSING |
   | `celebration.streak`     | ferni-celebration-streak.mp3      | 2.0s     | MISSING |
   | `celebration.teamUnlock` | ferni-celebration-team-unlock.mp3 | 2.5s     | MISSING |

2. **Sound UI** (`sound.ui.ts`) - Web Audio API synthesized

   ```typescript
   celebrate: {
     frequencies: [523.25, 659.25, 783.99, 1046.5, 1318.5], // 5-note arpeggio!
     delays: [0, 0.08, 0.16, 0.24, 0.32],
     duration: 0.25,
     type: 'triangle',
     volume: 0.12,
   }
   ```

   **Problem:** This sounds like a slot machine jackpot, not a warm human moment.

### Multi-Sensory Overload

When a celebration triggers, ALL of these fire simultaneously:

1. **Sound** - 1.8-3 second audio
2. **Haptics** - Multiple patterns
3. **Glow effects** - Avatar glows
4. **Visual card** - Centered modal with text
5. **Confetti** - 50 particle animation

This is sensory bombardment, not delight.

### Brand Misalignment

| Current               | Brand Guidelines Say                       |
| --------------------- | ------------------------------------------ |
| 5-note arpeggios      | "Subtle, pleasing sounds"                  |
| 3-second celebrations | "Quick acknowledgment"                     |
| Confetti explosions   | "Warm, human moments"                      |
| Multiple sounds       | "Zen-like, minimal aesthetic"              |
| Game-like jingles     | "Better than human, not better than games" |

### Sound Design Recommendations

#### Option A: Zen Acknowledgment (Recommended)

Replace all celebration sounds with ONE subtle sound:

```typescript
acknowledge: {
  frequencies: [440, 523.25], // Just A4 → C5 (minor third)
  delays: [0, 0.15],
  duration: 0.2,
  type: 'sine',
  volume: 0.06,  // Very quiet
  attack: 0.02,
  decay: 0.18,
}
```

#### Option B: Warmth Pulse

A gentle warm "hum" that fades:

```typescript
warmth: {
  frequency: 220, // A3 - warm low tone
  duration: 0.4,
  type: 'sine',
  volume: 0.04,
  attack: 0.1,  // Slow fade in
  decay: 0.3,   // Slow fade out
}
```

#### Option C: Silence

For major milestones, **haptics only**. Let the visual moment speak for itself.

### Celebration Reduction Strategy

**Current triggers that play celebration sounds:**

1. Stage celebration modal → `celebration.milestone`
2. Team unlock → `celebration.teamUnlock`
3. Streak milestone → `celebration.streak`
4. Small win acknowledgment → `celebration.small`
5. Big win → `celebration.big`
6. First meeting → `notification.gentle`
7. Deep moment → `notification.gentle`

**Proposed simplification:**

| Event             | Sound        | Visual             | Haptic   |
| ----------------- | ------------ | ------------------ | -------- |
| Small win         | None         | None               | Soft tap |
| Streak (3-6 days) | None         | Toast only         | Soft tap |
| Streak (7+ days)  | Warmth pulse | Toast only         | Medium   |
| Stage change      | None         | Card (no confetti) | Medium   |
| Team unlock       | Warmth pulse | Card only          | Medium   |
| Big milestone     | Warmth pulse | Card only          | Success  |

### Implementation Steps

1. ✅ **Remove or mute celebration sounds** from `ferni-audio.service.ts`
2. ✅ **Replace `celebrate` sound** in `sound.ui.ts` with gentler alternative
3. ✅ **Disable confetti by default** - make it opt-in only
4. ✅ **Add celebration cooldown** - max 1 celebration per 60 seconds
5. ✅ **Gate celebrations on first-time users** - no celebrations until 3+ conversations

---

## ✅ IMPLEMENTATION STATUS

### P0 - Critical (COMPLETED)

| Fix                                  | File                           | Status     |
| ------------------------------------ | ------------------------------ | ---------- |
| Modal coordinator service            | `modal-coordinator.service.ts` | ✅ Created |
| Zen celebration sounds               | `sound.ui.ts`                  | ✅ Done    |
| No confetti by default               | `celebration.ui.ts`            | ✅ Done    |
| Onboarding gated (2+ convos)         | `onboarding.ui.ts`             | ✅ Done    |
| Feature hints gated (2+ convos)      | `feature-hints.ui.ts`          | ✅ Done    |
| Stage celebrations gated (3+ convos) | `stage-celebration.ui.ts`      | ✅ Done    |
| Celebration cooldown (60s)           | `modal-coordinator.service.ts` | ✅ Done    |
| Mobile modal sizing                  | `stage-celebration.ui.ts`      | ✅ Done    |

### P1 - Should Do (COMPLETED)

| Fix                                  | File                  | Status  |
| ------------------------------------ | --------------------- | ------- |
| Trust signals gated (5+ convos)      | `trust-signals.ui.ts` | ✅ Done |
| Persona intro coordinated            | `persona-intro.ui.ts` | ✅ Done |
| Engagement trigger gated (1+ convos) | `app.ts`              | ✅ Done |
| Subscription modals coordinated      | `subscription.ui.ts`  | ✅ Done |

### P2 - Polish (COMPLETED)

| Fix                                   | File                                  | Status  |
| ------------------------------------- | ------------------------------------- | ------- |
| Toast greeting gated (1+ convos)      | `app.ts`                              | ✅ Done |
| Subscription badge hidden (1+ convos) | `subscription-badge.ui.ts`            | ✅ Done |
| Value capture gated (3+ convos)       | `monetization-integration.service.ts` | ✅ Done |
| Test utilities for verification       | `modal-coordinator.service.ts`        | ✅ Done |

### How It Works Now

**First-time user experience:**

1. Opens app → Sees Ferni's avatar + connect button
2. Taps connect → Pure conversation, nothing else
3. After 1st conversation → Engagement triggers appear
4. After 2nd conversation → Onboarding tour, feature hints, persona intros unlock
5. After 3rd conversation → Stage celebrations unlock
6. After 5th conversation → Trust signals unlock

**During any conversation:**

- Zero popups
- Zero celebration sounds
- Zero confetti
- Just Ferni

---

## 🧪 Testing Commands

In development mode, use the browser console to test:

```javascript
// Reset to first-time user state
window.testFirstTimeUser.reset();

// Simulate N conversations
window.testFirstTimeUser.simulate(3);

// Check current unlock status
window.testFirstTimeUser.status();
```

### Feature Unlock Schedule

| Conversations | What Unlocks                                                    |
| ------------- | --------------------------------------------------------------- |
| **0** (First) | Just Ferni avatar + connect button                              |
| **1+**        | Greeting, streak badge, subscription badge, engagement triggers |
| **2+**        | Onboarding tour, feature hints, persona intros                  |
| **3+**        | Stage celebrations, value capture                               |
| **5+**        | Trust signals                                                   |

---

_Last updated: December 14, 2024_
_Author: Ferni Engineering Team_
