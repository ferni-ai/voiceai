# 🌟 Ferni Moments System

## The Vision: Avatar as Notification Center

> "What if every piece of feedback felt like Ferni speaking to you?"

Apple unified their notification system. Google created Material snackbars. Pixar made every frame emotionally intentional.

**We're going further.** The Ferni Moments System treats **the avatar as the sole source of all feedback**. No corner toasts. No enterprise notification cards. Just Ferni, speaking to you.

---

## Current State: 7 Fragmented Systems

| System | Position | Problem |
|--------|----------|---------|
| Toast | Bottom center | Generic, disconnected from Ferni |
| Whisper | Near avatar | Good concept, incomplete |
| Celebration UI | Center modal | Gamified, not warm |
| Team Unlock | Full modal | One-off, heavy |
| Check-in Badge | Avatar | Isolated system |
| Streak UI | Avatar | Isolated system |
| Notifications | Top-right | Enterprise feel |

**Result:** Inconsistent experience. User doesn't know where to look.

---

## New Architecture: The Moments Hierarchy

### Single Source of Truth

```
┌─────────────────────────────────────────────────────────────────┐
│                     FERNI AVATAR                                │
│                (The Notification Center)                        │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │ BADGES  │        │ MOMENTS │        │PRESENCE │
   │(Persist)│        │(Transit)│        │ (Live)  │
   └─────────┘        └─────────┘        └─────────┘
        │                   │                   │
   Streak, Seeds       Feedback,           Speaking,
   Achievements        Events              Listening
```

### Four Moment Types (Emotional Escalation)

| Level | Name | Duration | Position | Animation | Haptic | Use Case |
|-------|------|----------|----------|-----------|--------|----------|
| 1 | **Whisper** | 2-3s | Below avatar | Fade up | `softTap` | Status, confirmations |
| 2 | **Notice** | 3-5s | Avatar pulse + whisper | Pulse glow | `notification` | Events, rewards |
| 3 | **Celebration** | 5-8s | Avatar + overlay | Scale bounce + sparkle | `success` | Milestones, streaks |
| 4 | **Milestone** | 8-15s | Full modal | Theatrical entrance | `impact` | Life moments, unlocks |

### The Pixar Principle

Every moment follows the Pixar emotional beat:

```
ANTICIPATION ──► ACTION ──► RESOLUTION
   (Setup)       (Peak)      (Settle)
```

**Example: Achievement Unlock**
1. **Anticipation** (200ms): Avatar eyes widen slightly
2. **Action** (400ms): Badge pops with scale overshoot
3. **Resolution** (300ms): Settle into place + whisper appears

---

## Design Tokens

### Motion System

```typescript
export const MOMENT_TIMING = {
  // Anticipation phase (Pixar wind-up)
  anticipation: {
    duration: 'var(--duration-fast)',     // 100ms
    scale: 0.95,                           // Slight compress
    easing: 'var(--ease-anticipate)',      // cubic-bezier(0.38, -0.4, 0.88, 0.65)
  },
  
  // Action phase (peak expression)
  action: {
    duration: 'var(--duration-slow)',      // 300ms
    easing: 'var(--ease-spring)',          // cubic-bezier(0.34, 1.56, 0.64, 1)
    overshoot: 1.08,                       // 8% overshoot
  },
  
  // Resolution phase (settle)
  resolution: {
    duration: 'var(--duration-normal)',    // 200ms
    easing: 'var(--ease-expo-out)',        // cubic-bezier(0.16, 1, 0.3, 1)
  },
};
```

### Color Semantics

```typescript
export const MOMENT_COLORS = {
  whisper: {
    background: 'var(--persona-primary)',
    text: 'white',
    glow: 'var(--persona-glow)',
  },
  notice: {
    background: 'var(--color-semantic-info)',
    text: 'white',
    glow: 'var(--color-semantic-info-glow)',
  },
  celebration: {
    background: 'linear-gradient(135deg, var(--persona-primary), var(--persona-secondary))',
    text: 'white',
    glow: 'var(--persona-glow)',
    sparkle: 'rgba(255, 255, 255, 0.8)',
  },
  milestone: {
    background: 'var(--color-background-elevated)',
    text: 'var(--color-text-primary)',
    accent: 'var(--persona-primary)',
    glow: 'var(--persona-glow)',
  },
};
```

### Scale System

| Level | Scale | Elevation | Presence |
|-------|-------|-----------|----------|
| Whisper | 1.0 | z-whisper (1000) | Subtle |
| Notice | 1.02 | z-notice (1100) | Noticeable |
| Celebration | 1.05 | z-celebration (1200) | Prominent |
| Milestone | 1.0 (modal) | z-modal (2000) | Commanding |

---

## Component Architecture

### `MomentsManager` (Singleton)

The central orchestrator for all feedback.

```typescript
interface MomentsManager {
  // Core API
  whisper(message: string, options?: WhisperOptions): MomentId;
  notice(message: string, options?: NoticeOptions): MomentId;
  celebrate(type: CelebrationType, data: CelebrationData): MomentId;
  milestone(type: MilestoneType, data: MilestoneData): Promise<void>;
  
  // Queue management
  queue: MomentQueue;
  dismiss(id: MomentId): void;
  dismissAll(): void;
  
  // State
  activeMoment: Moment | null;
  pendingCount: number;
}
```

### Moment Types

```typescript
type WhisperOptions = {
  duration?: number;          // Default 2500ms
  type?: 'info' | 'success' | 'warning' | 'error';
  icon?: IconName;            // Optional leading icon
};

type NoticeOptions = WhisperOptions & {
  action?: {
    label: string;
    callback: () => void;
  };
};

type CelebrationType = 
  | 'small_win'      // Quick acknowledgment
  | 'big_win'        // Major achievement
  | 'streak'         // Consistency milestone
  | 'seeds'          // Currency earned
  | 'badge'          // Achievement unlocked
  | 'secret'         // Easter egg discovered
  | 'team_unlock';   // New persona available

type MilestoneType =
  | 'relationship_stage'  // Trust level advancement
  | 'anniversary'         // Time-based milestone
  | 'journey_complete'    // Major journey milestone
  | 'year_in_review';     // Annual summary
```

---

## Badge System Architecture

### Badge Display Modes

```
┌─────────────────────────────────────────────────┐
│              AVATAR                             │
│    ┌──────────────────────────┐                │
│    │       [FERNI]            │                │
│    │          ◉              │   ← Active     │
│    │         / \              │     Avatar    │
│    └──────────────────────────┘                │
│                                                 │
│    [🔥 7]  [🌱 420]  [🏆 3]                     │
│     │        │        │                        │
│   Streak   Seeds  Achievements                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Badge Types

| Badge | Icon | Position | Behavior |
|-------|------|----------|----------|
| **Streak** | 🔥 (flame) | Bottom-left of avatar | Pulses at milestone |
| **Seeds** | 🌱 (seed) | Bottom-center | Animates on earn |
| **Achievements** | 🏆 (trophy) | Bottom-right | Shows count, opens collection |
| **Check-in** | 💚 (heart) | Top-right of avatar | Pulses when pending |

### Trophy Room (Achievement Collection)

Full-screen modal showing all achievements:

```
┌─────────────────────────────────────────────────────────┐
│  ← Close                                                │
│                                                         │
│  YOUR ACHIEVEMENTS                                      │
│  12 of 42 unlocked                                      │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  EARNED                                           │ │
│  │                                                   │ │
│  │  [🌅]  [🦉]  [👥]  [🌊]  [🧠]  [🔥]             │ │
│  │  Early  Night  Full  Deep  Memory Streak         │ │
│  │  Bird   Owl    Team  Dive  Lane   Master         │ │
│  │                                                   │ │
│  │  [💡]  [🌿]  [🎂]  [🔮]  [💜]  [✨]             │ │
│  │  Break  Reflect Year  Secret First  Magic       │ │
│  │  through Regular One  Keeper Meet   Hour        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  LOCKED                                           │ │
│  │                                                   │ │
│  │  [🔒]  [🔒]  [🔒]  [🔒]  [🔒]  [🔒]             │ │
│  │  ???    ???   ???   ???   ???   ???              │ │
│  │                                                   │ │
│  │  + 24 more to discover...                        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  [Share My Journey]                              │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Animation Choreography

### Whisper (Level 1)

```typescript
const WHISPER_CHOREOGRAPHY = {
  enter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(8px) scale(0.95)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    duration: DURATION.SLOW,      // 300ms
    easing: EASING.SPRING,
  },
  
  exit: {
    keyframes: [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
    ],
    duration: DURATION.NORMAL,    // 200ms
    easing: EASING.STANDARD,
  },
  
  avatarReaction: {
    type: 'micro-nod',            // Subtle acknowledgment
    duration: DURATION.FAST,
  },
};
```

### Notice (Level 2)

```typescript
const NOTICE_CHOREOGRAPHY = {
  // Avatar reacts first (anticipation)
  avatarAnticipation: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(0.98)' },
    ],
    duration: DURATION.FAST,      // 100ms
    easing: EASING.ANTICIPATE,
  },
  
  // Avatar pulses with glow
  avatarPulse: {
    keyframes: [
      { boxShadow: '0 0 0 0 var(--persona-glow)' },
      { boxShadow: '0 0 30px 8px var(--persona-glow)' },
      { boxShadow: '0 0 15px 4px var(--persona-glow)' },
    ],
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  },
  
  // Message appears (action)
  messageEnter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(12px) scale(0.9)' },
      { opacity: 1, transform: 'translateY(0) scale(1.02)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    duration: DURATION.SLOW,
    easing: EASING.SPRING,
    delay: DURATION.FAST,         // After avatar anticipation
  },
  
  haptic: 'notification',
};
```

### Celebration (Level 3)

```typescript
const CELEBRATION_CHOREOGRAPHY = {
  // Full theatrical sequence
  sequence: [
    // Beat 1: Anticipation (Ferni notices)
    {
      avatar: { scale: 0.95, expression: 'notice' },
      duration: DURATION.FAST,
      haptic: 'softTap',
    },
    
    // Beat 2: Wind-up (Ferni prepares to celebrate)
    {
      avatar: { scale: 0.9, expression: 'delight-wind-up' },
      duration: DURATION.NORMAL,
    },
    
    // Beat 3: Celebration burst
    {
      avatar: { 
        scale: 1.08, 
        expression: 'delight',
        glow: 'full',
      },
      sparkles: { emit: 12, spread: 'radial' },
      message: { enter: true },
      duration: DURATION.SLOW,
      easing: EASING.SPRING,
      haptic: 'success',
    },
    
    // Beat 4: Resolution (settle)
    {
      avatar: { scale: 1, expression: 'happy' },
      sparkles: { fade: true },
      duration: DURATION.NORMAL,
      easing: EASING.EXPO_OUT,
    },
    
    // Beat 5: Return to neutral
    {
      avatar: { expression: 'neutral' },
      message: { persist: true },
      duration: DURATION.SLOW,
    },
  ],
  
  totalDuration: DURATION.CELEBRATION * 2,  // ~1.6s
};
```

### Milestone (Level 4)

```typescript
const MILESTONE_CHOREOGRAPHY = {
  // Full modal experience
  phases: {
    // Phase 1: Backdrop dims (user attention captured)
    backdrop: {
      enter: {
        keyframes: [
          { opacity: 0, backdropFilter: 'blur(0px)' },
          { opacity: 1, backdropFilter: 'blur(20px)' },
        ],
        duration: DURATION.SLOW,
        easing: EASING.STANDARD,
      },
    },
    
    // Phase 2: Modal card rises
    card: {
      enter: {
        keyframes: [
          { opacity: 0, transform: 'scale(0.8) translateY(40px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ],
        duration: DURATION.DRAMATIC,
        easing: EASING.SPRING,
        delay: DURATION.NORMAL,
      },
    },
    
    // Phase 3: Content reveals (staggered)
    content: {
      stagger: STAGGER.RELAXED,    // 80ms between elements
      elements: ['icon', 'title', 'message', 'stats', 'action'],
      keyframes: [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      duration: DURATION.DELIBERATE,
      easing: EASING.EXPO_OUT,
    },
    
    // Phase 4: Ambient effects
    ambient: {
      sparkles: { count: 6, duration: DURATION.GLACIAL },
      glow: { pulse: true, frequency: 2000 },
    },
  },
  
  hapticSequence: ['softTap', 300, 'warmWelcome', 200, 'success'],
};
```

---

## Haptic Choreography

### Haptic Patterns

| Pattern | Intensity | Duration | Use Case |
|---------|-----------|----------|----------|
| `softTap` | Light | 10ms | Whisper appearance |
| `notification` | Medium | 20ms | Notice events |
| `success` | Heavy + Light | 40ms | Celebration peak |
| `warmWelcome` | Medium ramp | 50ms | Milestone entrance |
| `sparkle` | Light burst | 30ms | Sparkle effects |
| `impact` | Heavy | 30ms | Major reveal |

### Synchronization

```typescript
// Haptics ALWAYS synchronize with visual peak
const syncHapticWithAnimation = (animation: Animation, haptic: string) => {
  // Fire haptic at the "overshoot" point of spring animation
  // This is typically at 70-80% of duration
  const peakOffset = animation.duration * 0.75;
  
  setTimeout(() => {
    haptics.play(haptic);
  }, peakOffset);
};
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)
- [ ] Create `MomentsManager` singleton
- [ ] Create `moments.tokens.ts` with all design tokens
- [ ] Create `whisper-v2.ui.ts` as first unified component
- [ ] Update animation-constants with moment-specific values

### Phase 2: Unification (Week 3-4)
- [ ] Migrate `toast.ui.ts` → `moments.whisper()`
- [ ] Migrate `whisper.ui.ts` → `moments.whisper()`
- [ ] Migrate `seeds-toast.ui.ts` → `moments.notice()`
- [ ] Migrate `celebration.ui.ts` → `moments.celebrate()`

### Phase 3: Enhancement (Week 5-6)
- [ ] Create Trophy Room modal
- [ ] Unify badge display system
- [ ] Implement avatar reaction system
- [ ] Add sparkle/particle effects

### Phase 4: Polish (Week 7-8)
- [ ] Full haptic synchronization
- [ ] Reduced motion alternatives
- [ ] Performance optimization
- [ ] Accessibility audit

---

## API Design

### Simple Import

```typescript
import { moments } from '@ferni/ui';

// Level 1: Whisper (transient feedback)
moments.whisper('Saved!');
moments.whisper('Updated', { type: 'success' });
moments.whisper("That didn't work", { type: 'error' });

// Level 2: Notice (event with optional action)
moments.notice('+10 seeds', { 
  icon: 'seed',
  type: 'celebration',
});
moments.notice('New message from Maya', {
  action: { label: 'View', callback: () => openChat('maya') },
});

// Level 3: Celebration (milestone moment)
moments.celebrate('streak', { count: 7 });
moments.celebrate('badge', { 
  badge: 'early_bird',
  name: 'Early Bird',
  description: 'Had a conversation at 5 AM',
});

// Level 4: Milestone (full experience)
await moments.milestone('team_unlock', {
  persona: 'maya',
  name: 'Maya Santos',
  role: 'Life Coach',
  message: "I've been looking forward to meeting you.",
});
```

### Event System

```typescript
// Listen for moment events
moments.on('whisper:shown', (id) => analytics.track('whisper', { id }));
moments.on('badge:unlocked', (badge) => analytics.track('achievement', badge));
moments.on('milestone:completed', (type) => analytics.track('milestone', { type }));
```

---

## Success Metrics

| Metric | Current | Target | How We Measure |
|--------|---------|--------|----------------|
| Feedback system count | 7 | 1 | Unified API |
| Animation consistency | ~40% | 100% | Design token usage |
| Haptic coverage | ~20% | 100% | Every moment has haptic |
| Badge visibility | Low | High | Click-through rate |
| Trophy room opens | N/A | 5%+ DAU | Analytics |

---

## Appendix: Comparative Analysis

### What Apple Does Right
- **System-wide consistency**: Every notification looks the same
- **Dynamic Island**: Contextual, non-intrusive feedback
- **Haptic synchronization**: Touch matches visual

### What Google Does Right
- **Clear hierarchy**: Snackbar < Banner < Dialog
- **Motion specification**: Detailed easing and duration
- **Dynamic color**: Feedback inherits context color

### What Pixar Does Right
- **Emotional beats**: Anticipation → Action → Resolution
- **Character timing**: Every animation serves personality
- **Weight and physics**: Things feel real

### What Ferni Does Better
- **Avatar as center**: All feedback comes from one trusted source
- **Emotional progression**: Clear escalation from whisper to milestone
- **Relationship context**: Feedback reflects your journey together
- **Collectibility**: Achievements create lasting memories
- **Human warmth**: Never feels like notifications, feels like conversation

---

*"The best feedback system is one you forget exists—because it just feels like someone talking to you."*
