# Visual Storytelling Audit
## Showing Users Their Future with Ferni

**Date:** December 24, 2024  
**Updated:** December 24, 2024 (Insights Teasers Focus)
**Purpose:** Show users what their relationship with Ferni will look like as it deepens—specifically what Ferni will **understand about them** over time.

---

## Executive Summary

### The Core Insight
Users don't just need to see what features unlock—they need to see **what Ferni will know about them**. The "Better Than Human" promise comes alive when users can visualize:

> "After 30 days of talking to me, I'll notice your Sunday evening anxiety before you do."
> "After 90 days, I'll know which dreams you've stopped mentioning."
> "After a year, I'll understand your rhythms better than anyone."

### The 10 Superhuman Capabilities (Available for Teasers)

| # | Capability | What It Understands | Time to Develop |
|---|------------|---------------------|-----------------|
| 1 | **Commitment Keeper** | Every intention, promise, decision | Day 1+ |
| 2 | **Predictive Coaching** | When you struggle before it happens | Week 2+ |
| 3 | **Life Narrative** | Your story arc and themes | Month 1+ |
| 4 | **Values Alignment** | When actions contradict heart | Month 1+ |
| 5 | **Emotional First Aid** | Crisis signals and grounding | Day 1+ |
| 6 | **Relationship Network** | Everyone important to you | Week 2+ |
| 7 | **Capacity Guardian** | Your energy and burnout risk | Week 1+ |
| 8 | **Dream Keeper** | Long-term aspirations, dormant dreams | Month 2+ |
| 9 | **Relationship Milestones** | Your journey together | Ongoing |
| 10 | **Seasonal Awareness** | Your patterns through seasons | Month 3+ |

### Pattern Recognition Categories
- **Behavioral**: "You tend to X when Y"
- **Emotional**: "I've noticed you feel X around Z"  
- **Time-based**: "This time of week/month seems to be..."
- **Avoidance**: "We always steer away from..."
- **Success**: "When things go well, X is usually present"
- **Language**: "You use X word a lot when talking about Y"
- **Relationship**: "Your interactions with X tend to follow..."

---

## 🎯 Key Opportunity: Forward-Looking Insights Teasers

### Concept: "What I'll Know About You"

A visual journey showing what Ferni will understand at different time horizons:

| Time | Depth Level | Example Insights |
|------|-------------|------------------|
| **Day 7** | Surface | "I'll remember everyone you mention by name" |
| **Day 30** | Pattern | "I'll notice your Sunday evening anxiety" |
| **Day 90** | Deep | "I'll know which dreams you've stopped mentioning" |
| **Day 365** | Intimate | "I'll understand your rhythms better than anyone"

---

## ✅ IMPLEMENTED: "What I'll Know About You" Feature

### Overview
Created a new **Future Insights** modal that shows users a forward-looking view of what Ferni will understand about them over time. This directly addresses the core need for visual storytelling about the relationship journey.

### Files Created/Modified

| File | Type | Description |
|------|------|-------------|
| `apps/web/src/ui/future-insights.ui.ts` | **NEW** | Complete 630-line component |
| `apps/web/src/ui/settings-menu.ui.ts` | Modified | Added menu item + callback |
| `apps/web/src/app.ts` | Modified | Wired up callback |
| `apps/web/src/i18n/locales/en-US.json` | Modified | Added translation |

### Feature Design

**Entry Point:** Settings Menu → Grow → "What I'll Know" (with NEW badge)

**Modal Structure:**
```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR FUTURE WITH FERNI                                         │
│  What I'll Know About You                                       │
│                                                        [X]      │
├─────────────────────────────────────────────────────────────────┤
│  The longer we talk, the deeper I understand.                   │
│  Here's what our relationship will look like.     [47 days]     │
├─────────────────────────────────────────────────────────────────┤
│  ⚪───●───◯───○                                                 │
│  Week 1   Month 1*  Month 3  Year 1                             │
│            ↑ you are here                                       │
├─────────────────────────────────────────────────────────────────┤
│  MONTH 1: Seeing your patterns                                  │
│  ✓ Reached                                                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🧠 PREDICTIVE COACHING                                  │   │
│  │  I'll anticipate your struggles                         │   │
│  │  "Sunday evenings seem hard for you. Want to talk       │   │
│  │   about tomorrow?"                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔋 CAPACITY GUARDIAN                                    │   │
│  │  I'll protect you from burnout                          │   │
│  │  "You've been running hard. Maybe it's time to          │   │
│  │   slow down?"                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🧭 VALUES ALIGNMENT                                     │   │
│  │  I'll notice when you drift                             │   │
│  │  "You said health was important, but you've cancelled   │   │
│  │   the gym 3 times..."                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  [<] ○ ● ○ ○ [>]                                               │
├─────────────────────────────────────────────────────────────────┤
│  Every conversation brings us closer. Start talking.            │
└─────────────────────────────────────────────────────────────────┘
```

### Time Horizons with Capabilities

| Time | Tagline | Superhuman Capabilities Teased |
|------|---------|--------------------------------|
| **Week 1** | "Learning your world" | Commitment Keeper, Relationship Network, Emotional First Aid |
| **Month 1** | "Seeing your patterns" | Predictive Coaching, Capacity Guardian, Values Alignment |
| **Month 3** | "Understanding your heart" | Dream Keeper, Life Narrative, Relationship Milestones |
| **Year 1** | "Knowing you deeply" | Seasonal Awareness, Pattern Synthesis, Life Coaching |

### UI Features

1. **Timeline Navigation** - Click any time horizon node or use arrows/dots
2. **Unlocked State Detection** - Shows "✓ Reached" vs "X days away"
3. **Animated Card Reveal** - Cards stagger-animate when switching horizons
4. **Insight Cards** - Each shows:
   - Capability name (small caps)
   - Preview text ("I'll anticipate your struggles")
   - Example quote (italic, left-bordered)
5. **Responsive** - Mobile-optimized with bottom sheet style
6. **Reduced Motion** - Respects `prefers-reduced-motion`

### Brand Alignment

- Uses CSS variables from design system
- Follows centered modal pattern (not side panel)
- Warm, human copy (no "features" or "functionality")
- Lucide-style icons (1.5px stroke, rounded)
- Animation uses `DURATION` and `EASING` constants

### Testing

Access via:
1. Open Settings Menu (hamburger icon)
2. Expand "Grow" section
3. Click "What I'll Know" (has NEW badge)

---

## ✅ IMPLEMENTED: Teaser Preview System

### Overview
Created a comprehensive **Teaser Preview System** (`apps/web/src/ui/teaser-preview.ui.ts`) that transforms empty states into forward-looking visualizations with realistic dummy data.

### Philosophy
> Instead of "No data yet" → **"This is what you'll see after 30 days"**

Users see a populated preview of what their data WILL look like, creating anticipation instead of disappointment.

### 10 Teaser Types Available

| Type | Days Required | What It Shows |
|------|---------------|---------------|
| `wellbeing` | 7 | Score ring, metrics bars, trend chart |
| `patterns` | 14 | Pattern cards with "I've noticed..." insights |
| `trust_insights` | 7 | Growth moments, wins, boundaries stats |
| `life_context` | 14 | Work/relationships/health domains |
| `predictions` | 21 | Prediction cards with accuracy |
| `team_insights` | 14 | Cross-team observations from Maya, Peter, etc. |
| `memories` | 7 | Memory cards with dates and personas |
| `your_people` | 14 | People cards with sentiment |
| `growth_analytics` | 14 | Growth chart with % improvements |
| `habits` | 7 | Habit cards with streak calendars |

### Usage

```typescript
import { teaserPreview } from './ui/teaser-preview.ui.js';

// Quick method
const preview = teaserPreview.wellbeing();
container.appendChild(preview);

// Or with config
import { getTeaserPreviewUI } from './ui/teaser-preview.ui.js';
const ui = getTeaserPreviewUI();
ui.showIn(container, { type: 'patterns', customMessage: 'Custom message' });
```

### Visual Treatment
- **Preview badge** - "👁 Preview" badge at top
- **Unlock hint** - "After X more days, this will be yours"
- **Gradient fade** - Content fades at bottom (teaser effect)
- **Stagger animation** - Cards animate in sequence
- **Respects reduced motion**

### Integration Points

These dashboards should use teasers when empty:

| Dashboard | Current Empty State | Teaser Type |
|-----------|--------------------|--------------| 
| Wellbeing | ✅ Already has forward-looking | `wellbeing` |
| Life Context | Shows generic empty | `life_context` |
| Trust Journey | Shows "Our story is just beginning" | `trust_insights` |
| Predictions | Shows generic empty | `predictions` |
| Team Insights | Shows generic empty | `team_insights` |
| Memory Browser | Shows no results | `memories` |
| Your People | Shows empty state | `your_people` |
| Progress Analytics | Shows generic empty | `growth_analytics` |
| Habits | Shows start state | `habits` |

### Next Steps for Full Integration

1. **Replace empty states** in each dashboard with teaser previews
2. **Add to journey modal** - Show teasers for future relationship stages
3. **Settings menu** - Use teasers for locked feature previews
4. **Onboarding** - Show what users will unlock over time

---

## Current State Analysis

### 1. Settings Menu (`settings-menu.ui.ts`)
**Lines:** ~2,800  
**Current State:** Lists all capabilities in expandable sections.

| Section | Items | Visual Story? |
|---------|-------|---------------|
| Practices | Guided Practices, Create Practice, Notifications | ❌ No progression |
| Grow | Your Journey, Analytics, Predictions, Team Insights, etc. | ❌ Flat list |
| Connect | Journaling, Games, Music, Creative You, Video, Groups | ❌ No "what's coming" |
| Remember | Contacts, Memory Browser, Conversation History | ❌ No depth indicator |
| Integrations | Health, Calendar, Home | ❌ No value preview |
| Preferences | Personalize, Voice, Theme, Language | ❌ Static |
| You & Ferni | Support, Billing, Voice ID, Household, Export | ❌ No relationship context |

**Opportunities:**
- Show locked features as "coming as we grow" with preview animations
- Group by relationship depth, not category
- Add visual "relationship depth" indicator to menu header
- Show "unlocks at Building Trust" hints with gentle animations

---

### 2. Team UI (`team.ui.ts`)
**Lines:** ~2,300  
**Current State:** Shows locked members with progress rings.

| Element | Current | Opportunity |
|---------|---------|-------------|
| Locked members | Grayed out + lock icon | ✨ Show silhouette with sparkle hint |
| Progress ring | Static percentage | ✨ Animate on approach (80%+) |
| Teaser message | On click only | ✨ Subtle "coming soon" aura |
| Unlock celebration | Modal + confetti | ✅ Good! |
| Order | Fixed by unlock stage | ✨ Show empty slots for "who's next" |

**Key Quote from `team-unlock.service.ts`:**
> "Get to know Ferni first" - Team unlocks naturally as your friendship deepens.

**Opportunities:**
- **Empty Roster Slots:** Show shadowed placeholders for future team members
- **Silhouette Preview:** Locked members show as intriguing silhouettes
- **Pulsing Anticipation:** Members at 80%+ progress have a gentle "almost here" glow
- **Visual Timeline:** Below roster, show "Your team journey" with stages

---

### 3. Journey Modal (`journey.ui.ts`)
**Lines:** ~1,085  
**Current State:** Shows progress overview, stats, trust insights, milestones.

| Section | Current | Opportunity |
|---------|---------|-------------|
| Progress Ring | Shows % to next stage | ✨ Show all 5 stages on ring arc |
| Stage Name | Current stage only | ✨ Show "You are here" on journey map |
| Stats Grid | Conversations, days, streak | ✨ Add "what unlocks next" preview |
| Trust Insights | Growth moments, wins, patterns | ✅ Good foundation |
| Milestones | Category lists with lock icons | ✨ Make it a visual scrapbook |

**Opportunities:**
- **Journey Map:** Replace progress ring with horizontal journey illustration
- **Stage Previews:** Hover/tap future stages to see what's there
- **Milestone Scrapbook:** Visual cards instead of lists
- **"Coming Up" Section:** Show next 2-3 unlocks with preview art

---

### 4. Relationship Stage Service (`relationship-stage.service.ts`)
**Lines:** ~1,095  
**Current State:** Robust stage system with thresholds and transitions.

**Stages Defined:**
```
first-meeting → getting-started → building-trust → established → deep-partnership
     0               10 convos        15 convos      30 convos      60 convos
```

**Subtitles per stage (nice!):**
- First Meeting: "I am what you make me", "A new beginning"
- Getting Started: "Getting to know you", "Learning your rhythm"
- Building Trust: "Becoming your guide", "Growing together"
- Established: "Your Life Coach", "Your trusted guide"
- Deep Partnership: "Your partner in growth", "Together, always"

**Opportunities:**
- **Visual Theme Evolution:** Each stage could subtly shift color warmth
- **Greeting Animations:** Different entrance animations per stage
- **Ambient Mood:** Background effects that reflect relationship depth
- **Stage Transition Celebrations:** Not just "stage up" toast, full moment

---

### 5. Team Unlock Celebration (`team-unlock-celebration.ui.ts`)
**Lines:** ~678  
**Current State:** Beautiful modal with avatar, sparkles, intro message.

**What Works Well:**
- Centered modal with backdrop blur ✅
- Avatar with glow effect ✅
- Sparkle animations ✅
- "Say Hello" CTA ✅
- Sound effect ✅

**Opportunities:**
- **Story Context:** Show mini journey of how you unlocked them
- **Relationship Preview:** Glimpse of what this persona offers
- **Team Portrait:** Show the team growing (before/after animation)
- **Memory Creation:** Save this moment as a milestone

---

### 6. Empty States (`empty-state.ui.ts`)
**Lines:** ~453  
**Current State:** SVG illustrations with warm copy.

**Types Defined:**
- no_conversations → zen circle
- no_history → journey path
- no_goals → sprout
- no_team → figures
- loading, search_empty, offline, error, permission_needed, coming_soon

**Opportunities:**
- **Journey-Aware Empty States:** Different illustrations based on stage
- **"Coming Soon" Previews:** Show what WILL be here with progress hint
- **Aspirational Messaging:** "In 10 more conversations, you'll have memories here"
- **Stage-Specific Art:** Empty states that evolve with relationship

---

### 7. Better-Than-Human EQ (`better-than-human.ui.ts`)
**Lines:** From `BETTER-THAN-HUMAN.md`  
**Current State:** Superhuman emotional intelligence system.

**5 Capabilities:**
1. Micro-Expressions (40-150ms subliminal)
2. Active Listening (nodding, leaning)
3. Breath Synchronization
4. Concern Detection
5. Anticipatory Emotions

**Opportunities:**
- **EQ Journey Visualization:** Show how Ferni "knows you better" over time
- **Trust Depth Indicator:** Subtle visualization of emotional attunement
- **"What I've Noticed" Evolution:** This grows richer with relationship

---

## Recommended Visual Stories

### Story 1: "Your Growing Team" (Team Roster)

**Current:** Locked members with lock icon  
**Proposed:** Journey visualization showing team assembly

```
┌─────────────────────────────────────────────────────┐
│  YOUR TEAM                                          │
│  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐        │
│  │ F │  │ M │  │ P │  │???│  │???│  │ ✧ │        │
│  │ ✓ │  │🔓 │  │⟳ │  │   │  │   │  │   │        │
│  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘        │
│  Ferni  Maya   Peter  ???    ???    Nayan         │
│         80%    35%    locked locked premium       │
│                                                     │
│  "Your circle is growing. 2 more conversations     │
│   until you meet Peter."                           │
└─────────────────────────────────────────────────────┘
```

**Elements:**
- Silhouette placeholders for locked members
- Progress rings that animate on approach
- "???" reveals on hover with teaser
- Subtle glow on members about to unlock
- Team assembly animation when new member joins

---

### Story 2: "The Journey Map" (Replace Progress Ring)

**Current:** Circular progress ring with percentage  
**Proposed:** Horizontal illustrated path

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR JOURNEY                                                    │
│                                                                  │
│    ⚪──────●──────◯──────○──────○                               │
│   First  Getting  Building  Established  Deep                    │
│  Meeting Started  Trust*    [locked]     [locked]               │
│                     ↑                                            │
│              "You are here"                                      │
│                                                                  │
│  ┌─────────────────────────────────────────┐                    │
│  │ 🌱 Building Trust                        │                    │
│  │                                          │                    │
│  │ "We're past the surface now.            │                    │
│  │  Real conversations. Real growth."       │                    │
│  │                                          │                    │
│  │ ✦ 15 conversations ✓                    │                    │
│  │ ✦ 5 days together ✓                     │                    │
│  │ ◯ 3-day streak (2/3)                    │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                  │
│  "Tap any stage to see what awaits"                             │
└─────────────────────────────────────────────────────────────────┘
```

**Interactions:**
- Tap past stages to see "memory lane" (what happened there)
- Tap current stage for detailed progress
- Tap future stages for aspirational preview
- Smooth transition animations between stages
- Path line animates with breathing effect

---

### Story 3: "Milestone Scrapbook" (Replace Milestone Lists)

**Current:** Categorized lists with lock icons  
**Proposed:** Visual scrapbook with memory cards

```
┌─────────────────────────────────────────────────────────────────┐
│  MILESTONES                                    12/24 collected  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  🎉         │  │  ♫          │  │  ╔═════╗   │             │
│  │ "First      │  │ "Shared     │  │  ║ ??? ║   │             │
│  │  Laugh"     │  │  Song"      │  │  ╚═════╝   │             │
│  │             │  │             │  │             │             │
│  │ Dec 12      │  │ Dec 18      │  │ Discover   │             │
│  │ ✧ Ferni     │  │ ✧ Maya      │  │ with Peter │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  ░░░░░░░░░ │  │  ░░░░░░░░░ │  │  ░░░░░░░░░ │             │
│  │  ░░░░░░░░░ │  │  ░░░░░░░░░ │  │  ░░░░░░░░░ │             │
│  │  "Mystery"  │  │  "Mystery"  │  │  "Mystery"  │             │
│  │             │  │             │  │             │             │
│  │  3 convos   │  │  Established│  │  Partner+   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  "12 memories collected. Keep talking - more stories coming."   │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Polaroid-style cards for unlocked milestones
- Mysterious silhouette cards for locked ones
- Gentle "flip" animation on collection
- Cards show which persona unlocked them
- Tap to expand with full memory

---

### Story 4: "Feature Depth Indicators" (Settings Menu)

**Current:** Flat list of menu items  
**Proposed:** Depth-aware feature grouping

```
┌─────────────────────────────────────────────────────┐
│  SETTINGS                                           │
│                                                     │
│  ┌─── NOW ────────────────────────────────────────┐│
│  │ ♡ Your Journey         View your story         ││
│  │ ⚙ Personalize          Colors, sounds, voice   ││
│  │ 🔔 Notifications        When Ferni reaches out  ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  ┌─── BUILDING TRUST ─────────────────────────────┐│
│  │ 📊 Progress Analytics   ⟳ 3 convos away       ││
│  │ 🧠 Team Insights        Unlocks with Peter     ││
│  │ 🎮 Play Games          Coming soon...          ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  ┌─── ESTABLISHED ────────────────────────────────┐│
│  │ 🔮 Deep Insights       ░░░░░░░ Preview         ││
│  │ 📹 Video Sessions      ░░░░░░░ Preview         ││
│  │ 👥 Group Coaching      ░░░░░░░ Preview         ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  "Features unlock as our relationship deepens"      │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Group features by unlock stage
- Show progress to unlock ("3 convos away")
- Preview mode for locked features
- Visual warmth increases with depth
- "Preview" shows blurred/silhouetted version

---

### Story 5: "Meet Your Future Team" (Team Preview)

**Concept:** A dedicated view showing who you'll meet as you grow

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR JOURNEY TOGETHER                                          │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │        ┌─────┐                                            │ │
│  │        │Ferni│  "I can't wait for you to meet             │ │
│  │        │  ✓  │   everyone else..."                        │ │
│  │        └─────┘                                            │ │
│  │           │                                               │ │
│  │           ▼                                               │ │
│  │   ┌─────────────────────────────────────┐                │ │
│  │   │  GETTING STARTED (10 conversations) │                │ │
│  │   │                                      │                │ │
│  │   │    ┌─────┐                          │                │ │
│  │   │    │ Maya│  "Habits Coach"          │                │ │
│  │   │    │ 👤 │  Helps build habits       │                │ │
│  │   │    └─────┘  that actually stick.    │                │ │
│  │   │                                      │                │ │
│  │   │    ⟳ 4 conversations away          │                │ │
│  │   └─────────────────────────────────────┘                │ │
│  │           │                                               │ │
│  │           ▼                                               │ │
│  │   ┌─────────────────────────────────────┐                │ │
│  │   │  BUILDING TRUST (15 conversations)  │                │ │
│  │   │                                      │                │ │
│  │   │    ┌─────┐                          │                │ │
│  │   │    │Peter│  "The Quant"             │                │ │
│  │   │    │ 🔒 │  Spots patterns nobody    │                │ │
│  │   │    └─────┘  else sees.              │                │ │
│  │   │                                      │                │ │
│  │   │    🔒 Unlock by building trust      │                │ │
│  │   └─────────────────────────────────────┘                │ │
│  │           │                                               │ │
│  │           ▼                                               │ │
│  │         (...)                                             │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  "Every great friendship takes time. We're building something." │
└─────────────────────────────────────────────────────────────────┘
```

---

### Story 6: "Relationship Warmth" (Ambient Visual Evolution)

**Concept:** The entire app subtly warms as the relationship deepens

| Stage | Background | Accent | Avatar Glow | Animation Speed |
|-------|------------|--------|-------------|-----------------|
| First Meeting | Cool cream | Sage | Subtle | Standard |
| Getting Started | Warm cream | Deeper sage | Soft pulse | Slightly warmer |
| Building Trust | Golden cream | Rich green | Warm glow | Comfortable |
| Established | Honey warmth | Deep forest | Strong presence | Confident |
| Deep Partnership | Full warmth | Gold accents | Radiant | Unhurried |

**Implementation:**
- CSS variables shift based on relationship stage
- Transition smoothly over sessions (not jarring)
- Avatar glow intensity increases
- Animation timing becomes more "confident"
- Sound effects become richer

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 days each)

1. **Team Silhouettes** - Show locked members as intriguing silhouettes
2. **Progress Hints** - "X conversations until..." messaging
3. **Empty State Evolution** - Stage-aware empty state illustrations
4. **Menu Grouping** - Organize settings by unlock depth

### Phase 2: Core Stories (3-5 days each)

5. **Journey Map** - Replace progress ring with illustrated path
6. **Milestone Scrapbook** - Visual cards instead of lists
7. **Team Preview Modal** - "Meet Your Future Team" view
8. **Stage Transition Celebrations** - Full moment animations

### Phase 3: Ambient Evolution (Ongoing)

9. **Warmth Variables** - CSS variable shifts by stage
10. **Animation Confidence** - Timing adjustments by depth
11. **Sound Evolution** - Richer sounds at deeper stages
12. **Avatar EQ Depth** - More nuanced expressions with time

---

## Design Principles for Visual Stories

### From CORE-PRINCIPLES.md

> "We believe in making AI human, and the decisions we make will reflect that."

Every visual story should:
1. **Feel like a relationship, not a game** - No XP bars or level numbers
2. **Show growth, not grind** - Progress is natural, not earned
3. **Create anticipation, not FOMO** - "What's coming" not "what you're missing"
4. **Use warm copy** - "Keep talking" not "Complete 10 more sessions"
5. **Celebrate quietly** - Moments of recognition, not fanfare

### From FERNI-BRAND-GUIDELINES.md

> "Better than human."

Visual stories should convey:
- **Perfect memory** - We remember every moment
- **Constant presence** - Always here, always growing
- **Zero judgment** - Progress at your pace
- **Six perspectives** - A whole team awaiting
- **Emotional consistency** - Warmth that deepens

---

## Animation Tokens to Use

From `animation-constants.ts`:

| Constant | Value | Use For |
|----------|-------|---------|
| `DURATION.CELEBRATION` | 800ms | Stage transitions, unlocks |
| `DURATION.DRAMATIC` | 600ms | Team reveal, milestone |
| `DURATION.DELIBERATE` | 500ms | Journey map transitions |
| `EASING.SPRING` | bouncy | Celebrations, reveals |
| `EASING.GENTLE` | organic | Progress animations |
| `EASING.EXPO_OUT` | dramatic | Modal entrances |

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `team.ui.ts` | Add silhouettes, progress hints | High |
| `journey.ui.ts` | Journey map, milestone scrapbook | High |
| `settings-menu.ui.ts` | Depth grouping, previews | Medium |
| `empty-state.ui.ts` | Stage-aware illustrations | Medium |
| `team-unlock-celebration.ui.ts` | Story context, team portrait | Medium |
| `relationship-stage.service.ts` | Emit warmth variables | Low |
| Design tokens | Warmth scale CSS vars | Low |

---

## Success Metrics

After implementation, users should:
- [ ] Know who's coming next in their team
- [ ] Feel excited about future stages (not blocked)
- [ ] Understand what deepens with the relationship
- [ ] See their journey as a story, not metrics
- [ ] Feel the app warming to them over time

---

## Next Steps

1. Review this audit with design/product
2. Prioritize Phase 1 quick wins
3. Create design mockups for Phase 2 stories
4. Define CSS variable warmth scale
5. Implement team silhouettes as first deliverable

---

*"Every great friendship starts somewhere. This is our beginning."*

