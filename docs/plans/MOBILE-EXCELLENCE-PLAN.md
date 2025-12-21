# Ferni Mobile Excellence Plan

> **"Finally, someone who actually listens"** — this promise must feel true on every device, especially the one in your pocket at 2am.

---

## Our Mobile Philosophy

Mobile isn't a "smaller version" of desktop. It's often the **most intimate** context where someone connects with Ferni:
- The 2am worry that keeps you awake
- The commute contemplation before a big meeting
- The bathroom break when you need a moment to breathe

**Mobile-first means presence-first.** Every tap, swipe, and interaction should feel like Ferni is fully there with you.

---

## Current State Assessment

### ✅ Already Implemented
| Feature | Location | Status |
|---------|----------|--------|
| iOS Touch Utility | `apps/web/src/utils/ios-touch.ts` | Complete |
| Safe Area CSS | `settings-menu.ui.ts` | Complete |
| Airy Sounds | `sound.ui.ts` | Complete |
| Mobile Delights | `mobile-delights.ui.ts` | Complete |
| Gesture Support | `gestures.ui.ts` | Basic |
| Key Modal iOS Support | subscription, marketplace, team-unlock | Complete |

### 🔶 Needs Attention
| Area | Priority | Impact |
|------|----------|--------|
| Remaining modals not using iOS touch | High | Tap reliability on iOS |
| Gesture conflicts with scrollable content | High | Scroll jank |
| Modal scroll momentum | Medium | Feel |
| Haptic feedback consistency | Medium | Delight |
| Landscape orientation support | Low | Edge cases |

---

## Phase 1: Touch Reliability (Critical)

**Goal:** Every tap works on iOS Safari, every time.

### 1.1 Migrate All Modals to iOS Touch Utility

Files to update with `addTapListener`:

**User-Facing (Critical):**
- [ ] `engagement.ui.ts` - Daily practice panel
- [ ] `conversation-memory.ui.ts` - Memory viewer
- [ ] `conversation-history.ui.ts` - Chat history
- [ ] `household-manager.ui.ts` - Family sharing
- [ ] `predictions.ui.ts` - Prediction tracker
- [ ] `journey.ui.ts` - Growth journey

**Settings (High):**
- [ ] `accent-settings.ui.ts`
- [ ] `contact-settings.ui.ts`
- [ ] `notification-settings.ui.ts`
- [ ] `outreach-settings.ui.ts`
- [ ] `calendar-settings.ui.ts`

**Features (Medium):**
- [ ] `cognitive-insights.ui.ts`
- [ ] `trust-journey.ui.ts`
- [ ] `music-dashboard.ui.ts`
- [ ] `ritual-builder.ui.ts`
- [ ] `commands.ui.ts`

### 1.2 Implementation Pattern

```typescript
// BEFORE - May fail on iOS
backdrop.addEventListener('click', close);
button.addEventListener('click', handleClick);

// AFTER - Reliable everywhere
import { addTapListener, cleanupTapListeners } from '../utils/ios-touch.js';

addTapListener(backdrop, close);
addTapListener(button, handleClick);

// In cleanup/hide:
cleanupTapListeners(modalElement);
```

---

## Phase 2: Scroll & Gesture Harmony

**Goal:** Scrolling inside modals feels native; gestures don't conflict.

### 2.1 Gesture Conflict Prevention

Update `gestures.ui.ts` to ignore touches inside scrollable content:

```typescript
const SCROLLABLE_SELECTORS = [
  '.ferni-modal__content',
  '.subscription-card',
  '.marketplace-content',
  '.settings-menu__nav',
  '.engagement-panel-content',
  '[data-scrollable="true"]',
];

function handleTouchStart(e: TouchEvent) {
  // Don't hijack scroll gestures
  if (isInsideScrollableContent(e.target)) {
    touchState.isTracking = false;
    return;
  }
  // ... rest of handler
}
```

### 2.2 iOS Scroll Momentum

Every scrollable container needs:

```css
.scrollable-content {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
```

---

## Phase 3: Safe Areas (Notched Devices)

**Goal:** Content never hidden under notch, home indicator, or Dynamic Island.

### 3.1 Standard Pattern

```css
/* Modal container respects all safe areas */
.ferni-modal {
  padding: max(16px, env(safe-area-inset-top))
           max(16px, env(safe-area-inset-right))
           max(16px, env(safe-area-inset-bottom))
           max(16px, env(safe-area-inset-left));
}

/* Full-height panels use dvh */
.ferni-menu__panel {
  height: 100vh;
  height: 100dvh;
}

/* iOS Safari fallback */
@supports (-webkit-touch-callout: none) {
  .ferni-menu__panel {
    height: -webkit-fill-available;
  }
}
```

### 3.2 Viewport Meta Tag

Ensure `index.html` has:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

---

## Phase 4: Sound Design (Airy & Happy)

**Goal:** Every sound feels like wind chimes in a Japanese garden.

### Current Sound Philosophy ✅

| Sound | Feel | Implementation |
|-------|------|----------------|
| Connect | Morning awakening | Ascending pentatonic (F5→A5→C6→F6) |
| Disconnect | Leaves settling | Gentle descent (C6→A5→F5) |
| Switch | Carousel whoosh | Perfect fourth interval |
| Click | Water droplet | Single A6 sine |
| Celebrate | Sparkle shower | Cascading major arpeggio |

### Enhancement Opportunities

1. **Reduce volume further on mobile** (speakers are closer to ears)
2. **Respect system silent mode**
3. **Add haptic pairing** for deaf accessibility

---

## Phase 5: Haptic Feedback

**Goal:** Subtle tactile confirmations that feel natural.

### Haptic Map

| Interaction | Haptic Type | Intensity |
|-------------|-------------|-----------|
| Button tap | `selection` | Light |
| Mode switch | `impactLight` | Light |
| Success | `notificationSuccess` | Medium |
| Error | `notificationError` | Strong |
| Team unlock | `impactHeavy` | Strong |

### Implementation

```typescript
// apps/web/src/utils/haptics.ts
export function haptic(type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error') {
  if (!navigator.vibrate) return;
  
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30],
    selection: [5],
    success: [10, 50, 20],
    error: [30, 50, 30, 50, 30],
  };
  
  navigator.vibrate(patterns[type] ?? [10]);
}
```

---

## Phase 6: Shared Modal/Menu System

**Goal:** One consistent, accessible, beautiful pattern for all overlays.

### 6.1 Update `engagement-components.ts`

Enhance the shared `.ferni-modal` and `.ferni-menu` classes with:

```css
/* Animation that feels alive */
.ferni-modal__card {
  transform: translateY(20px) scale(0.95);
  opacity: 0;
  transition: 
    transform var(--duration-slower) var(--ease-spring),
    opacity var(--duration-slower) var(--ease-gentle);
}

.ferni-modal--visible .ferni-modal__card {
  transform: translateY(0) scale(1);
  opacity: 1;
}

/* Reduced motion respect */
@media (prefers-reduced-motion: reduce) {
  .ferni-modal__card {
    transform: none;
    transition: opacity var(--duration-fast) linear;
  }
}
```

### 6.2 Migration Guide

For each modal not yet using shared system:

1. Replace custom modal container with `.ferni-modal`
2. Replace custom backdrop with `.ferni-modal__backdrop`
3. Replace custom card with `.ferni-modal__card`
4. Replace click handlers with `addTapListener`
5. Add `cleanupTapListeners` in close handler

---

## Phase 7: Performance

**Goal:** 60fps animations, instant feedback, no jank.

### 7.1 Animation Best Practices

```css
/* Use transform/opacity only - GPU accelerated */
.animate-element {
  transform: translateX(0);
  opacity: 1;
  /* NEVER animate: width, height, top, left, margin, padding */
}

/* Will-change for heavy animations (use sparingly) */
.waveform-canvas {
  will-change: transform;
}
```

### 7.2 Touch Response

- **Touch feedback:** < 16ms (1 frame)
- **Animation start:** < 100ms
- **Full transition:** < 400ms

---

## Phase 8: Accessibility

**Goal:** WCAG AA compliance, fully usable with VoiceOver/TalkBack.

### 8.1 Focus Management

```typescript
// When modal opens
function openModal() {
  previouslyFocusedElement = document.activeElement;
  modal.querySelector('[autofocus], button, input')?.focus();
}

// When modal closes
function closeModal() {
  previouslyFocusedElement?.focus();
}
```

### 8.2 Screen Reader Announcements

```typescript
function announceToScreenReader(message: string) {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  setTimeout(() => announcer.remove(), 1000);
}
```

---

## Implementation Priority

### Week 1: Critical Path
1. [ ] Migrate remaining user-facing modals to iOS touch
2. [ ] Fix gesture conflicts with scrollable content
3. [ ] Audit all modals for safe area support

### Week 2: Polish
4. [ ] Enhance haptic feedback consistency
5. [ ] Improve animation smoothness
6. [ ] Add landscape orientation support

### Week 3: Delight
7. [ ] Refine sound volumes for mobile
8. [ ] Add micro-interactions
9. [ ] Test on physical devices (iPhone, iPad, Android)

---

## Testing Checklist

### iOS Safari (iPhone)
- [ ] All taps register on first touch
- [ ] Scrolling inside modals is smooth
- [ ] Content doesn't hide under notch
- [ ] Home indicator doesn't block bottom buttons
- [ ] Sounds play without jarring volume

### iOS Safari (iPad)
- [ ] Landscape mode works
- [ ] Split view supported
- [ ] Keyboard doesn't break layout

### Android Chrome
- [ ] Touch interactions work
- [ ] Safe areas respected
- [ ] Back gesture doesn't conflict

### Accessibility
- [ ] VoiceOver can navigate all modals
- [ ] TalkBack reads content correctly
- [ ] Reduced motion is respected

---

## Success Metrics

| Metric | Target |
|--------|--------|
| First tap success rate | 100% |
| Animation frame rate | 60fps |
| Modal open time | < 300ms |
| Lighthouse mobile score | > 90 |
| WCAG AA compliance | 100% |

---

## Brand Alignment Check

Before shipping, every mobile interaction should pass:

1. ✅ **Does this feel warm?** Not cold, clinical, or frustrating
2. ✅ **Does this feel present?** Responsive, attentive, not laggy
3. ✅ **Does this feel human?** Natural, organic, not robotic
4. ✅ **Does this serve the relationship?** Not blocking, interrupting, or annoying

---

*"The goal isn't to pass the Turing test. It's to pass the 'would I want to use this app again at 2am?' test."*
