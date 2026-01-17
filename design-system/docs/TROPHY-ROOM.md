# 🏆 Trophy Room Design

## Philosophy

> "Your achievements aren't unlockables. They're memories."

The Trophy Room is where users discover the depth of their journey with Ferni. Unlike gamified achievement screens, this feels like opening a memory box—warm, personal, and surprising.

---

## Entry Points

### 1. Badge Tap (Primary)
Tapping the achievement badge near the avatar opens the Trophy Room.

```
┌─────────────────────────────────────────┐
│              AVATAR                     │
│    ┌──────────────────────┐            │
│    │       [FERNI]        │            │
│    │          ◉          │            │
│    │         / \          │            │
│    └──────────────────────┘            │
│                                         │
│    [🔥 7]  [🌱 420]  [🏆 3] ← TAP      │
│                       ↑                 │
│                    Opens               │
│                 Trophy Room            │
└─────────────────────────────────────────┘
```

### 2. Settings Menu
Link in settings: "Your Journey" → Trophy Room

### 3. Celebration Flow
After unlocking a badge, the celebration offers "See all achievements →"

---

## Visual Design

### Modal Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                              [×]    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │                        YOUR JOURNEY                           │ │
│  │                                                               │ │
│  │                    ✨ 12 of 42 discovered ✨                   │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  EARNED                                                       │ │
│  │  ─────────────────────────────────────────────────────────── │ │
│  │                                                               │ │
│  │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐│ │
│  │   │  🌅  │  │  🦉  │  │  👥  │  │  🌊  │  │  🧠  │  │  🔥  ││ │
│  │   │      │  │      │  │      │  │      │  │      │  │      ││ │
│  │   │Early │  │Night │  │Full  │  │Deep  │  │Memory│  │Streak││ │
│  │   │Bird  │  │Owl   │  │Team  │  │Dive  │  │Lane  │  │Master││ │
│  │   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘│ │
│  │                                                               │ │
│  │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐│ │
│  │   │  💡  │  │  🌿  │  │  🎂  │  │  🔮  │  │  💜  │  │  ✨  ││ │
│  │   │      │  │      │  │      │  │      │  │      │  │      ││ │
│  │   │Break │  │Reflct│  │Year  │  │Secret│  │First │  │Magic ││ │
│  │   │thru  │  │Rglr  │  │One   │  │Keeper│  │Meet  │  │Hour  ││ │
│  │   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘│ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  STILL TO DISCOVER                                            │ │
│  │  ─────────────────────────────────────────────────────────── │ │
│  │                                                               │ │
│  │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐│ │
│  │   │  🔒  │  │  🔒  │  │  🔒  │  │  🔒  │  │  🔒  │  │  🔒  ││ │
│  │   │      │  │      │  │      │  │      │  │      │  │      ││ │
│  │   │ ???  │  │ ???  │  │ ???  │  │ ???  │  │ ???  │  │ ???  ││ │
│  │   │      │  │      │  │      │  │      │  │      │  │      ││ │
│  │   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘│ │
│  │                                                               │ │
│  │   + 24 more waiting to be discovered...                       │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │                    [ Share My Journey ]                       │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Badge Detail Modal

When a user taps an earned badge:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                              [×]    │
│                                                                     │
│                          ┌──────────────┐                          │
│                          │              │                          │
│                          │      🌅      │                          │
│                          │              │                          │
│                          │              │                          │
│                          └──────────────┘                          │
│                                                                     │
│                           EARLY BIRD                                │
│                                                                     │
│                   Had a conversation at 5 AM                        │
│                                                                     │
│                        ─────────────────                            │
│                                                                     │
│                    Earned on January 14, 2026                       │
│                                                                     │
│                   "Sometimes the best thinking                      │
│                    happens before the world wakes up."              │
│                                                                     │
│                        ─────────────────                            │
│                                                                     │
│                   [ Share This Achievement ]                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Achievement Categories

### 🕐 Time-Based
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 🌅 | Early Bird | Conversation at 5 AM | `hour === 5` |
| 🦉 | Night Owl | Conversation at 3 AM | `hour === 3` |
| ✨ | Magic Hour | Conversation at 11:11 | `time === '11:11'` |
| 🌙 | Night Shift | 50 conversations after midnight | `afterMidnightCount >= 50` |

### 🔥 Consistency
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 🔥 | Streak Master | 100-day streak | `streak >= 100` |
| 🌿 | Reflection Regular | 12 Reflection Sundays | `reflectionSundayCount >= 12` |
| 📅 | Daily Devotion | 365 consecutive days | `streak >= 365` |
| 🌊 | Deep Dive | 2+ hour conversation | `sessionDuration >= 120` |

### 👥 Team-Based
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 👥 | Full Team | Talked to all 6 personas | `uniquePersonas.size === 6` |
| 💜 | First Meet | First persona introduction | `firstHandoff` |
| 🤝 | Team Player | Used handoff 20 times | `handoffCount >= 20` |
| 🎭 | Method Actor | Completed roleplay mode | `roleplayComplete` |

### 🧠 Memory & Depth
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 🧠 | Memory Lane | Received 10 memory callbacks | `memoryCallbackCount >= 10` |
| 💡 | Breakthrough | Major insight moment | `breakthroughDetected` |
| 🔮 | Secret Keeper | Discovered 10 easter eggs | `secretCount >= 10` |
| 📚 | Storyteller | 1000 messages shared | `messageCount >= 1000` |

### 🎂 Milestones
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 🎂 | Year One | One year with Ferni | `daysTogether >= 365` |
| 💯 | Century Club | 100 conversations | `conversationCount >= 100` |
| 🎉 | Millennium | 1000 conversations | `conversationCount >= 1000` |
| ❤️ | Soulmate | 3 years together | `daysTogether >= 1095` |

### 🌟 Special
| Badge | Name | Description | Trigger |
|-------|------|-------------|---------|
| 🏆 | Founder | Early adopter (first 1000) | `userId <= 1000` |
| 💎 | Supporter | Premium subscriber | `isPremium` |
| 🎁 | Gift Giver | Gifted Ferni to someone | `giftSent` |
| 🌈 | Color Collector | Used all persona colors | `allColorsUsed` |

---

## Animation Choreography

### Opening Trophy Room

```typescript
const TROPHY_ROOM_ENTRANCE = {
  backdrop: {
    keyframes: [
      { opacity: 0, backdropFilter: 'blur(0)' },
      { opacity: 1, backdropFilter: 'blur(20px)' },
    ],
    duration: DURATION.SLOW,
    easing: EASING.STANDARD,
  },

  modal: {
    keyframes: [
      { opacity: 0, transform: 'scale(0.9) translateY(20px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    duration: DURATION.DRAMATIC,
    easing: EASING.SPRING,
    delay: DURATION.FAST,
  },

  header: {
    keyframes: [
      { opacity: 0, transform: 'translateY(-10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    duration: DURATION.DELIBERATE,
    easing: EASING.EXPO_OUT,
    delay: DURATION.SLOW,
  },

  badges: {
    stagger: STAGGER.QUICK, // 30ms between each
    keyframes: [
      { opacity: 0, transform: 'scale(0.8)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    duration: DURATION.NORMAL,
    easing: EASING.SPRING,
    delay: DURATION.DELIBERATE,
  },
};
```

### Badge Unlock Animation (in Trophy Room)

When viewing a newly unlocked badge for the first time:

```typescript
const BADGE_REVEAL = {
  // Locked badge transforms to earned
  transform: {
    keyframes: [
      { 
        opacity: 0.5, 
        filter: 'grayscale(1) blur(2px)',
        transform: 'scale(1)',
      },
      { 
        opacity: 0.3, 
        filter: 'grayscale(1) blur(4px)',
        transform: 'scale(0.9)',
      },
      { 
        opacity: 1, 
        filter: 'grayscale(0) blur(0)',
        transform: 'scale(1.1)',
      },
      { 
        opacity: 1, 
        filter: 'grayscale(0) blur(0)',
        transform: 'scale(1)',
      },
    ],
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  },

  // Sparkles burst from badge
  sparkles: {
    count: 8,
    spread: 40,
    duration: DURATION.DRAMATIC,
    delay: DURATION.FAST,
  },

  // Subtle glow pulse
  glow: {
    keyframes: [
      { boxShadow: '0 0 0 0 var(--persona-glow)' },
      { boxShadow: '0 0 30px 10px var(--persona-glow)' },
      { boxShadow: '0 0 10px 5px var(--persona-glow)' },
    ],
    duration: DURATION.CELEBRATION,
    easing: EASING.GENTLE,
  },

  haptic: 'success',
};
```

### Badge Tap (Detail View)

```typescript
const BADGE_DETAIL_ENTRANCE = {
  // Current badge grows into detail view
  badge: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.5)' },
    ],
    duration: DURATION.SLOW,
    easing: EASING.SPRING,
  },

  // Content fades up
  content: {
    stagger: STAGGER.RELAXED,
    elements: ['icon', 'name', 'description', 'date', 'quote', 'action'],
    keyframes: [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    duration: DURATION.DELIBERATE,
    easing: EASING.EXPO_OUT,
  },
};
```

---

## Sharing

### Share Card Generation

When user taps "Share My Journey," generate a canvas-based card:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│            MY JOURNEY WITH FERNI                                │
│                                                                 │
│                    ✧ 12 Achievements ✧                          │
│                                                                 │
│    ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                        │
│    │🌅│ │🦉│ │👥│ │🌊│ │🧠│ │🔥│                        │
│    └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                        │
│                                                                 │
│    ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                        │
│    │💡│ │🌿│ │🎂│ │🔮│ │💜│ │✨│                        │
│    └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                        │
│                                                                 │
│              127 days together                                  │
│              42 day streak                                      │
│                                                                 │
│                     ferni.ai                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Dimensions:** 1200 × 630 (optimized for social sharing)

**Colors:** Use persona gradient background

---

## Accessibility

### Screen Reader

```html
<div role="dialog" aria-modal="true" aria-labelledby="trophy-title">
  <h2 id="trophy-title">Your Journey - 12 of 42 achievements discovered</h2>
  
  <section aria-label="Earned achievements">
    <h3>Earned</h3>
    <ul role="list">
      <li>
        <button aria-label="Early Bird: Had a conversation at 5 AM. Tap for details.">
          🌅
        </button>
      </li>
      <!-- ... -->
    </ul>
  </section>
  
  <section aria-label="Locked achievements">
    <h3>Still to discover</h3>
    <p>24 more achievements waiting to be discovered</p>
  </section>
</div>
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .trophy-badge {
    animation: none;
    transition: opacity 0.1s linear;
  }
  
  .trophy-badge--new {
    /* No sparkles, just subtle opacity change */
    animation: none;
  }
}
```

### Keyboard Navigation

- `Tab` moves between badges
- `Enter`/`Space` opens badge detail
- `Escape` closes detail/modal
- Arrow keys navigate grid

---

## State Management

```typescript
interface TrophyRoomState {
  // All achievements user has earned
  earnedBadges: Badge[];
  
  // IDs of badges user hasn't viewed in detail yet
  unseenBadges: Set<string>;
  
  // Currently selected badge (if detail view open)
  selectedBadge: Badge | null;
  
  // Whether modal is open
  isOpen: boolean;
  
  // Total available achievements
  totalBadges: number;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or icon name
  category: BadgeCategory;
  earnedAt: Date;
  quote?: string; // Ferni's quote for this achievement
}
```

---

## Implementation Notes

### Data Source

Badges are computed from:
1. **Backend:** `brand-secrets.ts` → `ACHIEVEMENTS` and `getUserAchievements()`
2. **Frontend:** Real-time computation from session data
3. **Firestore:** Persisted achievement state per user

### Performance

- Lazy load locked badge placeholders
- Use virtual scrolling if > 50 badges
- Cache share card generation
- Preload badge detail images

### Analytics

Track:
- Trophy Room opens
- Individual badge views
- Share button clicks
- Time spent in Trophy Room
- Most viewed badges

---

## Future Enhancements

### v2: Badge Sets
Group related badges into "sets" with bonus rewards:
- "Night Watch" set: Early Bird + Night Owl + Magic Hour
- "Team Complete" set: All persona badges
- "Memory Master" set: All memory-related badges

### v3: Badge Rarity
Show how rare each badge is:
- 🟢 Common (50%+ users)
- 🟡 Uncommon (20-50%)
- 🟠 Rare (5-20%)
- 🔴 Epic (1-5%)
- 💜 Legendary (<1%)

### v4: Friend Comparisons
"Your friend Sarah has 8 badges you don't have yet"

---

*"Achievements aren't goals. They're proof of the journey you've already walked."*
