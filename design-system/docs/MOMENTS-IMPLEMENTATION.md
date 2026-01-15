# 🛠️ Moments System Implementation Plan

## Overview

This document provides the step-by-step implementation plan for migrating from 7+ fragmented feedback systems to the unified Moments System.

**Goal:** Single, avatar-centric feedback system that's better than Apple, Google, and Pixar.

---

## Current State: Files to Migrate

| File | Lines | Status | Migration Target |
|------|-------|--------|------------------|
| `toast.ui.ts` | 338 | Active | → `moments.whisper()` |
| `whisper.ui.ts` | 590 | Active | → `moments.whisper()` |
| `celebration.ui.ts` | 591 | Active | → `moments.celebrate()` |
| `team-unlock-celebration.ui.ts` | 676 | Active | → `moments.milestone()` |
| `checkin-badge.ui.ts` | 563 | Active | → `badges.checkin` |
| `streak.ui.ts` | 499 | Active | → `badges.streak` |
| `seeds-toast.ui.ts` | 85 | Active | → `moments.notice()` |
| `notifications.ui.ts` | 615 | Active | → `moments.notice()` |
| `celebration.service.ts` | 293 | Active | → Keep (avatar animations) |
| `milestone-card.ui.ts` | 516 | Active | → Keep (share cards) |

**Total:** ~4,766 lines across 10 files → Consolidated into ~1,500 lines

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Create Core Types

```bash
touch apps/web/src/ui/moments/types.ts
```

```typescript
// apps/web/src/ui/moments/types.ts

export type MomentLevel = 'whisper' | 'notice' | 'celebration' | 'milestone';

export type MomentType = 
  | 'info' | 'success' | 'warning' | 'error'     // Whisper types
  | 'seeds' | 'badge' | 'streak' | 'secret'       // Notice types
  | 'small_win' | 'big_win' | 'team_unlock'       // Celebration types
  | 'anniversary' | 'relationship' | 'journey';   // Milestone types

export interface MomentConfig {
  level: MomentLevel;
  type: MomentType;
  message: string;
  duration?: number;
  icon?: IconName;
  action?: MomentAction;
  data?: Record<string, unknown>;
}

export interface MomentAction {
  label: string;
  callback: () => void;
}

export interface MomentState {
  id: string;
  config: MomentConfig;
  element: HTMLElement;
  timeout?: ReturnType<typeof setTimeout>;
  status: 'entering' | 'visible' | 'exiting';
}

export interface BadgeState {
  streak: number;
  seeds: number;
  achievementCount: number;
  unseenAchievements: Set<string>;
  hasCheckin: boolean;
}
```

### 1.2 Create Token Constants

```bash
touch apps/web/src/ui/moments/constants.ts
```

```typescript
// apps/web/src/ui/moments/constants.ts

import { DURATION, EASING, STAGGER } from '../../config/animation-constants.js';

export const MOMENT_DURATIONS = {
  whisper: {
    default: 2500,
    short: 2000,
    error: 4000,
  },
  notice: {
    default: 4000,
    withAction: 8000,
  },
  celebration: {
    sequence: 1600,
    display: 5000,
  },
  milestone: {
    entrance: 800,
    contentStagger: 80,
  },
};

export const MOMENT_ANIMATIONS = {
  whisper: {
    enter: {
      keyframes: [
        { opacity: 0, transform: 'translateY(8px) scale(0.95)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      options: { duration: DURATION.SLOW, easing: EASING.SPRING },
    },
    exit: {
      keyframes: [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
      ],
      options: { duration: DURATION.NORMAL, easing: EASING.STANDARD },
    },
  },
  // ... other animations from tokens
};

export const HAPTIC_MAP = {
  whisper: { info: 'softTap', success: 'softTap', warning: 'notification', error: 'error' },
  notice: { default: 'notification', seeds: 'sparkle', badge: 'success' },
  celebration: { default: 'success' },
  milestone: { sequence: ['softTap', 'warmWelcome', 'success'] },
};
```

### 1.3 Create MomentsManager Singleton

```bash
touch apps/web/src/ui/moments/manager.ts
```

```typescript
// apps/web/src/ui/moments/manager.ts

import { createLogger } from '../../utils/logger.js';
import { getHapticsService } from '../../services/haptics.service.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import { MOMENT_DURATIONS, MOMENT_ANIMATIONS, HAPTIC_MAP } from './constants.js';
import type { MomentConfig, MomentState, MomentLevel } from './types.js';

const log = createLogger('MomentsManager');
const { trackedTimeout, clearAll } = createTimeoutTracker();

class MomentsManager {
  private container: HTMLElement | null = null;
  private active: MomentState | null = null;
  private queue: MomentConfig[] = [];
  private idCounter = 0;
  private haptics = getHapticsService();
  private styleInjected = false;

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Level 1: Whisper - transient feedback
   */
  whisper(message: string, options?: { 
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    icon?: string;
  }): string {
    return this.show({
      level: 'whisper',
      type: options?.type ?? 'info',
      message,
      duration: options?.duration,
      icon: options?.icon,
    });
  }

  /**
   * Level 2: Notice - event with optional action
   */
  notice(message: string, options?: {
    type?: 'info' | 'seeds' | 'badge' | 'streak' | 'secret';
    icon?: string;
    action?: { label: string; callback: () => void };
    duration?: number;
  }): string {
    return this.show({
      level: 'notice',
      type: options?.type ?? 'info',
      message,
      icon: options?.icon,
      action: options?.action,
      duration: options?.duration,
    });
  }

  /**
   * Level 3: Celebrate - milestone moment
   */
  async celebrate(type: 'small_win' | 'big_win' | 'streak' | 'badge' | 'team_unlock', data?: {
    title?: string;
    subtitle?: string;
    badge?: string;
    count?: number;
  }): Promise<void> {
    return this.showCelebration({ level: 'celebration', type, message: '', data });
  }

  /**
   * Level 4: Milestone - full modal experience
   */
  async milestone(type: 'anniversary' | 'relationship' | 'journey' | 'team_unlock', data: {
    title: string;
    message: string;
    stats?: Record<string, string | number>;
    action?: { label: string; callback: () => void };
  }): Promise<void> {
    return this.showMilestone({ level: 'milestone', type, message: data.message, data });
  }

  /**
   * Dismiss active moment
   */
  dismiss(id?: string): void {
    if (!this.active) return;
    if (id && this.active.id !== id) return;
    this.dismissActive();
  }

  /**
   * Dismiss all and clear queue
   */
  dismissAll(): void {
    this.queue = [];
    if (this.active) this.dismissActive();
  }

  // =========================================================================
  // INTERNAL
  // =========================================================================

  private show(config: MomentConfig): string {
    const id = `moment-${++this.idCounter}`;
    
    if (this.active) {
      this.queue.push(config);
      log.debug({ id, queued: true }, 'Moment queued');
      return id;
    }

    this.ensureContainer();
    this.injectStyles();
    this.displayMoment(id, config);
    return id;
  }

  private displayMoment(id: string, config: MomentConfig): void {
    // Implementation follows MOMENT_ANIMATIONS
    // Creates element, adds to container, animates in
    // Sets up auto-dismiss timeout
    // Fires haptic
  }

  private async showCelebration(config: MomentConfig): Promise<void> {
    // Plays full Pixar-style sequence
    // Avatar anticipation → wind-up → burst → settle
  }

  private async showMilestone(config: MomentConfig): Promise<void> {
    // Creates modal with backdrop blur
    // Staggered content reveal
    // Ambient effects
  }

  private dismissActive(): void {
    // Animate out, remove, process queue
  }

  private ensureContainer(): void {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'moments-container';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  }

  private injectStyles(): void {
    if (this.styleInjected) return;
    // Inject all moment styles
    this.styleInjected = true;
  }

  destroy(): void {
    clearAll();
    this.dismissAll();
    this.container?.remove();
  }
}

// Singleton
let instance: MomentsManager | null = null;

export function getMomentsManager(): MomentsManager {
  if (!instance) instance = new MomentsManager();
  return instance;
}

export function resetMomentsManager(): void {
  instance?.destroy();
  instance = null;
}
```

### 1.4 Create Simple Export

```bash
touch apps/web/src/ui/moments/index.ts
```

```typescript
// apps/web/src/ui/moments/index.ts

import { getMomentsManager } from './manager.js';

export const moments = {
  whisper: (...args: Parameters<typeof getMomentsManager>['whisper']) => 
    getMomentsManager().whisper(...args),
  notice: (...args: Parameters<typeof getMomentsManager>['notice']) => 
    getMomentsManager().notice(...args),
  celebrate: (...args: Parameters<typeof getMomentsManager>['celebrate']) => 
    getMomentsManager().celebrate(...args),
  milestone: (...args: Parameters<typeof getMomentsManager>['milestone']) => 
    getMomentsManager().milestone(...args),
  dismiss: (id?: string) => getMomentsManager().dismiss(id),
  dismissAll: () => getMomentsManager().dismissAll(),
};

export default moments;

// Re-export types
export * from './types.js';
```

---

## Phase 2: Backward Compatibility Layer (Week 2-3)

### 2.1 Create Toast Shim

Keep existing imports working while using new system:

```typescript
// apps/web/src/ui/toast.ui.ts (updated)

import { moments } from './moments/index.js';

// Old API maps to new system
export const toast = {
  info: (message: string) => moments.whisper(message, { type: 'info' }),
  success: (message: string) => moments.whisper(message, { type: 'success' }),
  warning: (message: string) => moments.whisper(message, { type: 'warning' }),
  error: (message: string) => moments.whisper(message, { type: 'error' }),
  show: (config: { message: string; type?: string; duration?: number }) => 
    moments.whisper(config.message, { type: config.type as any, duration: config.duration }),
  dismiss: moments.dismiss,
  dismissAll: moments.dismissAll,
};

// Keep old exports for backward compatibility
export const toastInfo = toast.info;
export const toastSuccess = toast.success;
export const toastWarning = toast.warning;
export const toastError = toast.error;
export const showToast = toast.show;
export const dismissToast = toast.dismiss;
export const dismissAllToasts = toast.dismissAll;

// Deprecation warnings in dev
if (process.env.NODE_ENV === 'development') {
  console.warn('toast.ui.ts is deprecated. Use moments.whisper() instead.');
}
```

### 2.2 Create Whisper Shim

```typescript
// apps/web/src/ui/whisper.ui.ts (updated)

import { moments } from './moments/index.js';

export const whisper = {
  info: (message: string) => moments.whisper(message, { type: 'info' }),
  success: (message: string) => moments.whisper(message, { type: 'success' }),
  warning: (message: string) => moments.whisper(message, { type: 'warning' }),
  error: (message: string) => moments.whisper(message, { type: 'error' }),
  celebration: (amount: number, reason?: string) => 
    moments.notice(`+${amount} ${reason || 'seeds'}`, { type: 'seeds', icon: 'seed' }),
  show: moments.whisper,
  dismiss: moments.dismiss,
  dismissAll: moments.dismissAll,
};

export default whisper;
```

---

## Phase 3: Badge System (Week 3-4)

### 3.1 Create Badges Component

```bash
touch apps/web/src/ui/moments/badges.ts
```

```typescript
// apps/web/src/ui/moments/badges.ts

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import type { BadgeState } from './types.js';

const log = createLogger('Badges');

class BadgeDisplay {
  private container: HTMLElement | null = null;
  private state: BadgeState = {
    streak: 0,
    seeds: 0,
    achievementCount: 0,
    unseenAchievements: new Set(),
    hasCheckin: false,
  };

  initialize(avatarContainer: HTMLElement): void {
    this.createContainer(avatarContainer);
    this.render();
  }

  updateStreak(count: number, animate = true): void {
    const oldStreak = this.state.streak;
    this.state.streak = count;
    this.render();
    
    if (animate && count > oldStreak) {
      this.animateStreakIncrement();
    }
  }

  updateSeeds(count: number, animate = true): void {
    const oldSeeds = this.state.seeds;
    this.state.seeds = count;
    this.render();
    
    if (animate && count > oldSeeds) {
      this.animateSeedsEarned(count - oldSeeds);
    }
  }

  addAchievement(id: string): void {
    this.state.achievementCount++;
    this.state.unseenAchievements.add(id);
    this.render();
    this.animateNewAchievement();
  }

  setCheckinPending(pending: boolean): void {
    this.state.hasCheckin = pending;
    this.render();
  }

  openTrophyRoom(): void {
    // Opens trophy room modal
    window.dispatchEvent(new CustomEvent('ferni:open-trophy-room'));
  }

  // ... rendering and animation methods
}

let instance: BadgeDisplay | null = null;

export function getBadgeDisplay(): BadgeDisplay {
  if (!instance) instance = new BadgeDisplay();
  return instance;
}
```

### 3.2 Create Trophy Room Modal

```bash
touch apps/web/src/ui/moments/trophy-room.ts
```

```typescript
// apps/web/src/ui/moments/trophy-room.ts

import { DURATION, EASING, STAGGER } from '../../config/animation-constants.js';
import { ACHIEVEMENTS, getUserAchievements } from '../../services/achievements.service.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('TrophyRoom');

export async function openTrophyRoom(): Promise<void> {
  const earned = await getUserAchievements();
  const modal = createTrophyRoomModal(earned);
  document.body.appendChild(modal);
  animateEntrance(modal);
}

function createTrophyRoomModal(earned: Achievement[]): HTMLElement {
  // Creates full trophy room UI
  // Earned badges grid
  // Locked badges grid (with ??? placeholders)
  // Share button
}

function animateEntrance(modal: HTMLElement): void {
  // Backdrop → Modal → Header → Badges (staggered)
}
```

---

## Phase 4: Migration Script (Week 4-5)

### 4.1 Find All Usage

```bash
# Find all toast/whisper/celebration calls
rg "toast\.(info|success|warning|error)" apps/web/src --type ts -l
rg "whisper\.(info|success|warning|error)" apps/web/src --type ts -l
rg "celebrate\(" apps/web/src --type ts -l
```

### 4.2 Update Each File

For each file using old APIs:

```typescript
// Before
import { toast } from '../ui/toast.ui.js';
toast.success('Saved!');

// After
import { moments } from '../ui/moments/index.js';
moments.whisper('Saved!', { type: 'success' });
```

### 4.3 Validation Checklist

- [ ] All `toast.` calls migrated
- [ ] All `whisper.` calls migrated  
- [ ] All `celebrate()` calls migrated
- [ ] All `showStreakMilestone()` calls migrated
- [ ] All achievement unlocks use new system
- [ ] Old files marked as deprecated

---

## Phase 5: Remove Legacy (Week 5-6)

### 5.1 Delete Old Files

```bash
# After all migrations complete and tested
rm apps/web/src/ui/toast.ui.ts
rm apps/web/src/ui/whisper.ui.ts
rm apps/web/src/ui/celebration.ui.ts
rm apps/web/src/ui/team-unlock-celebration.ui.ts
rm apps/web/src/ui/checkin-badge.ui.ts
rm apps/web/src/ui/streak.ui.ts
rm apps/web/src/ui/seeds-toast.ui.ts
rm apps/web/src/ui/notifications.ui.ts
```

### 5.2 Update Index Exports

```typescript
// apps/web/src/ui/index.ts

// Old exports removed
// export * from './toast.ui.js';
// export * from './whisper.ui.js';

// New unified export
export { moments, badges, trophyRoom } from './moments/index.js';
```

---

## Phase 6: Polish (Week 6-8)

### 6.1 Haptic Sync

Ensure every visual moment has synchronized haptic:

```typescript
// Haptic fires at animation peak (75% of duration)
const syncHaptic = (animation: Animation, hapticPattern: string) => {
  const peak = animation.duration * 0.75;
  setTimeout(() => haptics.play(hapticPattern), peak);
};
```

### 6.2 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .moment {
    animation: none !important;
    transition: opacity 0.1s linear !important;
  }
  
  .moment-sparkle {
    display: none !important;
  }
}
```

### 6.3 Performance Optimization

- Virtual scroll for trophy room (if many badges)
- Lazy load badge icons
- Cache share card canvas
- Use `will-change` sparingly

### 6.4 Accessibility Audit

- [ ] All moments have proper ARIA roles
- [ ] Focus management for milestones
- [ ] Keyboard navigation in trophy room
- [ ] Screen reader announcements
- [ ] Color contrast meets WCAG AA

---

## Testing Plan

### Unit Tests

```typescript
// apps/web/src/ui/moments/__tests__/manager.test.ts

describe('MomentsManager', () => {
  it('shows whisper immediately when queue empty', () => {});
  it('queues whisper when one is active', () => {});
  it('processes queue after dismissal', () => {});
  it('plays celebration sequence in order', () => {});
  it('shows milestone with staggered content', () => {});
  it('fires correct haptic for each type', () => {});
  it('respects reduced motion preference', () => {});
});
```

### E2E Tests

```typescript
// e2e/moments.spec.ts

test('whisper appears and auto-dismisses', async ({ page }) => {
  await page.evaluate(() => moments.whisper('Test'));
  await expect(page.locator('.moment-whisper')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator('.moment-whisper')).not.toBeVisible();
});

test('trophy room shows earned badges', async ({ page }) => {
  await page.evaluate(() => openTrophyRoom());
  await expect(page.locator('.trophy-room')).toBeVisible();
  await expect(page.locator('.badge-earned')).toHaveCount(expectedCount);
});
```

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Notification systems | 7 | 1 | ✅ |
| Lines of code | ~4,800 | ~1,500 | ✅ |
| Animation consistency | ~40% | 100% | ✅ |
| Haptic coverage | ~20% | 100% | ✅ |
| Design token usage | ~60% | 100% | ✅ |
| Accessibility score | Unknown | WCAG AA | ✅ |

---

## Rollback Plan

If issues arise:

1. **Shims remain active** - old imports still work
2. **Feature flag** - `ENABLE_MOMENTS_V2=false` reverts to old system
3. **Gradual rollout** - enable per-user via experiment

---

## File Structure (Final)

```
apps/web/src/ui/moments/
├── index.ts              # Public exports
├── manager.ts            # MomentsManager singleton
├── badges.ts             # Badge display system
├── trophy-room.ts        # Achievement collection modal
├── types.ts              # TypeScript types
├── constants.ts          # Animation/haptic constants
├── styles.ts             # CSS-in-JS styles
├── animations.ts         # Animation choreography
├── sparkles.ts           # Particle effects
└── __tests__/
    ├── manager.test.ts
    ├── badges.test.ts
    └── trophy-room.test.ts
```

---

*"The best refactor is one users never notice—except that everything feels better."*
