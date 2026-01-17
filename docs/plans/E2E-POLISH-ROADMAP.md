# E2E Polish Roadmap

> **Making Ferni feel like a $1B product, not a $1M prototype.**

This document outlines polish opportunities to elevate Ferni's perceived quality to match Apple, Linear, and Vercel-tier experiences.

---

## Current State Assessment

| Category | Score | Notes |
|----------|-------|-------|
| Loading States | 9/10 | Excellent skeleton system |
| Empty States | 9/10 | 10+ presets, i18n support |
| Error Handling | 8/10 | Good recovery, could add more context |
| Accessibility | 8/10 | Focus trapping, ARIA, announce() |
| Haptics | 9/10 | 26+ patterns, persona-aware |
| Animations | 7/10 | Good base, missing modern APIs |
| Offline Support | 6/10 | Detection good, caching minimal |
| Keyboard Nav | 6/10 | Focus trap works, shortcuts limited |
| Sound Design | 7/10 | Good effects, could be more cohesive |

---

## Priority 1: Visual Polish (Week 1)

### 1.1 View Transitions API
Modern page transitions without layout thrash.

```typescript
// Add to apps/web/src/utils/view-transitions.ts
export async function withViewTransition(
  callback: () => void | Promise<void>,
  options?: { name?: string; fallback?: boolean }
): Promise<void> {
  if (!document.startViewTransition || prefersReducedMotion()) {
    await callback();
    return;
  }
  
  const transition = document.startViewTransition(async () => {
    await callback();
  });
  
  await transition.finished;
}

// Usage in persona handoffs
withViewTransition(() => {
  setActivePersona(newPersona);
  updateAvatarUI();
});
```

**Files to update:**
- `apps/web/src/app.ts` - Wrap persona switches
- `apps/web/src/ui/persona-magic.ui.ts` - Replace manual animations
- `apps/web/src/ui/engagement.ui.ts` - Modal open/close

### 1.2 Scroll-Triggered Reveals
Content fades in as it enters viewport.

```css
/* Add to tokens.css */
@keyframes scrollReveal {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.scroll-reveal {
  animation: scrollReveal 600ms var(--ease-out-expo) both;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}

/* Fallback for browsers without scroll-timeline */
@supports not (animation-timeline: view()) {
  .scroll-reveal {
    animation: scrollReveal 600ms var(--ease-out-expo) both;
    /* Use IntersectionObserver in JS */
  }
}
```

**Apply to:**
- Team member cards in journey
- Conversation history items
- Settings sections
- Trust milestones

### 1.3 Image Progressive Loading
"Blur-up" pattern for avatar and persona images.

```typescript
// Add to apps/web/src/utils/progressive-image.ts
export function progressiveImage(
  img: HTMLImageElement,
  lowResSrc: string,
  highResSrc: string
): void {
  // Start with tiny blurred version
  img.src = lowResSrc;
  img.style.filter = 'blur(10px)';
  img.style.transition = 'filter 400ms var(--ease-gentle)';
  
  // Load high-res in background
  const highRes = new Image();
  highRes.onload = () => {
    img.src = highResSrc;
    img.style.filter = 'blur(0)';
  };
  highRes.src = highResSrc;
}
```

---

## Priority 2: Interaction Polish (Week 2)

### 2.1 Global Keyboard Shortcuts
Professional-grade keyboard navigation.

```typescript
// Add to apps/web/src/ui/keyboard-shortcuts.ui.ts
export const SHORTCUTS = {
  // Global
  'cmd+k': { action: 'openCommandPalette', label: 'Command palette' },
  'cmd+/': { action: 'showShortcuts', label: 'Show shortcuts' },
  'esc': { action: 'closeModal', label: 'Close' },
  
  // Navigation
  '1': { action: 'goToFerni', label: 'Talk to Ferni' },
  '2': { action: 'goToTeam', label: 'Your team' },
  '3': { action: 'goToJourney', label: 'Your journey' },
  '4': { action: 'goToSettings', label: 'Settings' },
  
  // Actions
  'space': { action: 'toggleMic', label: 'Push to talk' },
  'm': { action: 'muteMic', label: 'Mute' },
  'r': { action: 'reconnect', label: 'Reconnect' },
  
  // Dev (development only)
  'cmd+shift+d': { action: 'toggleDevPanel', label: 'Dev panel' },
};

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const key = getShortcutKey(e);
    const shortcut = SHORTCUTS[key];
    
    if (shortcut && !isInputFocused()) {
      e.preventDefault();
      dispatchShortcut(shortcut.action);
    }
  });
}
```

### 2.2 Command Palette (⌘K)
Spotlight-style quick actions.

```typescript
// Linear/Vercel-style command palette
export function openCommandPalette(): void {
  const commands = [
    { id: 'call-ferni', label: 'Call Ferni', icon: 'phone', shortcut: 'Enter' },
    { id: 'switch-peter', label: 'Switch to Peter', icon: 'user' },
    { id: 'switch-maya', label: 'Switch to Maya', icon: 'user' },
    { id: 'view-journey', label: 'View your journey', icon: 'map' },
    { id: 'view-calendar', label: 'View calendar', icon: 'calendar' },
    { id: 'settings', label: 'Settings', icon: 'settings', shortcut: ',' },
    { id: 'dark-mode', label: 'Toggle dark mode', icon: 'moon' },
    { id: 'help', label: 'Get help', icon: 'help-circle' },
  ];
  
  // Render fuzzy-searchable palette
}
```

### 2.3 Touch Gestures Enhancement
Swipe actions for mobile.

```typescript
// Enhance apps/web/src/ui/gestures.ui.ts
export const GESTURES = {
  // Swipe down on avatar → End call
  avatar: {
    swipeDown: 'endCall',
    longPress: 'openQuickActions',
  },
  
  // Swipe right on modal → Close
  modal: {
    swipeRight: 'close',
    swipeDown: 'minimize',
  },
  
  // Pull down anywhere → Refresh connection
  global: {
    pullDown: 'refreshConnection',
  },
};
```

---

## Priority 3: Resilience Polish (Week 3)

### 3.1 Smart Retry with Exponential Backoff
Already have `fetch-retry.ts`, but enhance with UI feedback.

```typescript
// Enhance apps/web/src/utils/fetch-retry.ts
export interface RetryState {
  attempt: number;
  maxAttempts: number;
  nextRetryIn: number;
  error?: string;
}

// Show user-friendly retry countdown
export function showRetryProgress(state: RetryState): void {
  toast.info(`Reconnecting in ${state.nextRetryIn}s... (${state.attempt}/${state.maxAttempts})`);
}
```

### 3.2 Connection Quality Indicator
Real-time WebRTC quality feedback.

```typescript
// Add to apps/web/src/ui/connection-quality.ui.ts
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

export function initConnectionIndicator(): void {
  // Show subtle indicator in corner
  // - 4 bars = excellent
  // - 3 bars = good
  // - 2 bars = fair (show warning)
  // - 1 bar = poor (show "Reconnecting...")
  // - 0 bars = disconnected
}

// Integrate with LiveKit stats
lk.on('signalConnectionStateChanged', (state) => {
  updateConnectionQuality(state);
});
```

### 3.3 Offline-First Data Layer
Cache conversations and settings locally.

```typescript
// Add to apps/web/src/services/offline-cache.service.ts
export class OfflineCacheService {
  private db: IDBDatabase | null = null;
  
  async cacheConversation(id: string, data: ConversationData): Promise<void> {
    // IndexedDB storage for offline access
  }
  
  async getCachedConversation(id: string): Promise<ConversationData | null> {
    // Return cached if offline
  }
  
  async syncWhenOnline(): Promise<void> {
    // Queue updates and sync when connection restored
  }
}
```

---

## Priority 4: Micro-Polish (Ongoing)

### 4.1 Button Press States
Every button should feel "physical".

```css
/* Enhance all buttons */
.btn {
  transition: transform 150ms var(--ease-spring);
}

.btn:active {
  transform: scale(0.97);
}

/* Add subtle shadow lift on hover */
.btn:hover {
  box-shadow: 0 4px 12px var(--shadow-color);
  transform: translateY(-1px);
}
```

### 4.2 Form Field Micro-Interactions
Labels that animate, validation that delights.

```css
/* Floating labels */
.form-field input:focus + label,
.form-field input:not(:placeholder-shown) + label {
  transform: translateY(-20px) scale(0.85);
  color: var(--persona-primary);
}

/* Success checkmark animation */
.form-field--valid::after {
  content: '✓';
  animation: checkPop 300ms var(--ease-spring);
}

@keyframes checkPop {
  0% { transform: scale(0) rotate(-45deg); }
  60% { transform: scale(1.2) rotate(10deg); }
  100% { transform: scale(1) rotate(0); }
}
```

### 4.3 List Item Stagger
Items animate in sequence.

```css
/* Auto-stagger with CSS */
.list-item {
  animation: slideUp 400ms var(--ease-out-expo) both;
  animation-delay: calc(var(--item-index, 0) * 50ms);
}

/* In JS, set --item-index on each item */
items.forEach((item, i) => {
  item.style.setProperty('--item-index', i.toString());
});
```

### 4.4 Sound Design Enhancement
Add subtle audio for key moments.

| Action | Sound | Duration | Notes |
|--------|-------|----------|-------|
| Connect | Warm chime | 400ms | Ascending tone |
| Disconnect | Soft fade | 300ms | Descending tone |
| Persona switch | Transition swoosh | 200ms | Different per persona |
| Achievement | Sparkle cascade | 500ms | Celebratory |
| Error | Soft thud | 150ms | Non-alarming |
| Button press | Soft click | 50ms | Optional, off by default |

---

## Priority 5: Performance Polish

### 5.1 Route-Based Code Splitting
Lazy load heavy features.

```typescript
// Split heavy modals
const TrustJourney = lazy(() => import('./ui/trust-journey'));
const GardenDashboard = lazy(() => import('./ui/garden-dashboard.ui'));
const Marketplace = lazy(() => import('./ui/marketplace.ui'));
```

### 5.2 Smart Preloading
Preload likely next views.

```typescript
// When user hovers team member, preload their persona intro
teamMember.addEventListener('mouseenter', () => {
  import('./ui/persona-intro.ui'); // Preload
});

// When on main screen, preload settings
if (currentRoute === 'main') {
  requestIdleCallback(() => {
    import('./ui/settings-panel.ui');
  });
}
```

### 5.3 Animation Performance
Use `will-change` sparingly and correctly.

```css
/* Only during animation */
.animating {
  will-change: transform, opacity;
}

/* Remove after animation */
.animation-done {
  will-change: auto;
}
```

---

## Implementation Priority

### This Week (High Impact, Low Effort)
1. [ ] Add View Transitions API wrapper
2. [ ] Implement scroll-reveal animations
3. [ ] Add button press states to all buttons
4. [ ] Add keyboard shortcut hints to tooltips

### Next Week (High Impact, Medium Effort)
1. [ ] Build command palette (⌘K)
2. [ ] Add connection quality indicator
3. [ ] Implement progressive image loading
4. [ ] Add list item stagger animations

### Month 1 (Medium Impact, Higher Effort)
1. [ ] Build offline-first cache layer
2. [ ] Add full keyboard navigation system
3. [ ] Implement smart preloading
4. [ ] Add floating label form fields

### Month 2+ (Nice to Have)
1. [ ] Scroll-driven animation-timeline
2. [ ] Pull-to-refresh gesture
3. [ ] Sound design overhaul
4. [ ] Motion preference intelligence

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to Interactive | ~2s | <1.5s |
| Layout Shifts (CLS) | ~0.1 | <0.05 |
| Animation Jank | Some | None |
| Keyboard Navigable | Partial | Full |
| Offline Usable | No | Basic |
| A11y Audit Score | 85% | 95% |

---

## Design Philosophy Reminder

> "Every transition should feel like magic, not motion."

- **Purposeful** - Animations guide attention, not distract
- **Consistent** - Same gesture = same result everywhere
- **Responsive** - Everything responds instantly, even if loading
- **Accessible** - Reduced motion users get the same quality
- **Delightful** - Occasional surprise, never annoyance

---

*Last updated: December 2024*

