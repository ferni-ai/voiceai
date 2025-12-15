# 🌟 Personal Journey Awareness - Implementation Plan

> **Mission**: Make Ferni's awareness feel like magic - not surveillance. Transform existing data into delightful relationship moments that create "shock and awe" through genuine care.

**Philosophy**: The best awareness feels like a friend who just _knows_ you - not because they're tracking you, but because they genuinely care and remember.

---

## 📊 Current State Analysis

### What Already Exists (Rich Foundation)

| System                        | Location                                        | Capabilities                                                                            |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Memory Engagement Engine**  | `src/intelligence/memory-engagement.ts`         | Anniversaries, progress callbacks, emotional continuity, small details, growth mirrors  |
| **Social Graph**              | `src/services/social-graph/index.ts`            | People mentioned, relationships, important dates, sentiment analysis, withdrawal alerts |
| **Context Aggregator**        | `src/services/outreach/context-aggregator.ts`   | Full life context, commitments, wins, struggles, relationship history, inside jokes     |
| **Financial Journey Tracker** | `src/intelligence/financial-journey-tracker.ts` | Milestones, debt-free moments, progress narrative                                       |
| **Persona Memories**          | `src/services/persona-memories.ts`              | Per-persona memories (preferences, wins, topics)                                        |
| **Proactive Memory Engine**   | `src/conversation/proactive-memory.ts`          | Memory surfacing during conversations                                                   |
| **World Awareness**           | `src/services/world-awareness/`                 | Weather, news, sports, holidays (just built!)                                           |
| **Advanced Retrieval**        | `src/memory/advanced-retrieval.ts`              | Semantic memory search with emotional salience                                          |
| **User Profile**              | `src/types/user-profile.ts`                     | 1000+ line rich profile with everything                                                 |

### What's Missing (The Gaps)

1. **Rhythm/Pattern Awareness** - Usage patterns, consistency, time-of-day preferences
2. **Seasonal Personal Memory** - "Last winter you mentioned...", "Around this time last year..."
3. **Life Chapter Detection** - Recognizing transitions, phases, themes in someone's journey
4. **Proactive Surfacing Layer** - Turning stored data into conversation moments
5. **Community Wisdom** - Privacy-safe "others on this journey" insights
6. **Journey Narrative Builder** - The story arc of their relationship with Ferni

---

## 🎯 Design Principles

### Delightful vs Creepy

| ✅ DELIGHTFUL (Relationship-Based)                  | ❌ CREEPY (Surveillance-Based)           |
| --------------------------------------------------- | ---------------------------------------- |
| "This is our 50th conversation!"                    | "I noticed you haven't called in 3 days" |
| "You usually check in around this time"             | "I see you're in a new location"         |
| "Remember when you couldn't do X? Look at you now!" | "Your activity has decreased 23%"        |
| "Last winter you mentioned struggling with SAD"     | "Based on your patterns, I predict..."   |
| "Others on this journey have found..."              | "Users near you are doing..."            |

### Core Principles

1. **Celebrate, Don't Monitor** - Frame everything as celebration, not tracking
2. **Gift, Don't Report** - Insights should feel like gifts, not data reports
3. **Remember, Don't Record** - Language of memory, not logging
4. **Natural Timing** - Surface things when emotionally relevant, not systematically
5. **Opt-In Depth** - Let relationship depth unlock deeper awareness

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PERSONAL JOURNEY AWARENESS                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  RHYTHM SERVICE  │  │ SEASONAL MEMORY  │  │ CHAPTER DETECTOR │  │
│  │                  │  │                  │  │                  │  │
│  │ • Usage patterns │  │ • Time-of-year   │  │ • Life phases    │  │
│  │ • Consistency    │  │ • Last year refs │  │ • Transitions    │  │
│  │ • Time prefs     │  │ • Season mood    │  │ • Growth arcs    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │             │
│           └─────────────────────┼─────────────────────┘             │
│                                 │                                    │
│                    ┌────────────▼────────────┐                      │
│                    │   JOURNEY ORCHESTRATOR   │                      │
│                    │                          │                      │
│                    │ • Aggregates all sources │                      │
│                    │ • Prioritizes moments    │                      │
│                    │ • Decides what to share  │                      │
│                    │ • Tracks what was shared │                      │
│                    └────────────┬────────────┘                      │
│                                 │                                    │
│           ┌─────────────────────┼─────────────────────┐             │
│           │                     │                     │             │
│  ┌────────▼─────────┐  ┌────────▼─────────┐  ┌───────▼──────────┐  │
│  │ CONTEXT BUILDER  │  │ GREETING HOOKS   │  │ COMMUNITY WISDOM │  │
│  │                  │  │                  │  │                  │  │
│  │ • Prompt inject  │  │ • Milestone greet│  │ • Anonymized     │  │
│  │ • Turn-aware     │  │ • Rhythm greet   │  │ • Journey-based  │  │
│  │ • Priority based │  │ • Seasonal greet │  │ • Opt-in only    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Phases

### Phase 1: Rhythm Awareness Service ⏱️

**Goal**: Track and celebrate usage patterns without feeling like surveillance

#### 1.1 Data Model

```typescript
interface UserRhythm {
  userId: string;

  // Session patterns
  sessions: {
    totalCount: number;
    firstSession: Date;
    lastSession: Date;
    averageSessionsPerWeek: number;
    currentStreak: number; // consecutive days with sessions
    longestStreak: number;
    streakStartDate?: Date;
  };

  // Time patterns
  timePreferences: {
    preferredHours: number[]; // Hours 0-23 with frequency
    preferredDays: number[]; // Days 0-6 with frequency
    mostActiveTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    weekdayVsWeekend: 'weekday' | 'weekend' | 'balanced';
  };

  // Consistency
  consistency: {
    averageGapDays: number;
    longestGap: number;
    isConsistent: boolean; // Gap variance low
    currentGapDays: number;
  };

  // Milestones achieved
  rhythmMilestones: Array<{
    type:
      | 'first_week'
      | 'conversation_10'
      | 'conversation_25'
      | 'conversation_50'
      | 'conversation_100'
      | 'streak_7'
      | 'streak_30'
      | 'streak_100'
      | 'one_month'
      | 'three_months'
      | 'six_months'
      | 'one_year';
    achievedAt: Date;
    acknowledged: boolean;
  }>;
}
```

#### 1.2 Service Functions

- `recordSession(userId, timestamp)` - Track session occurrence
- `getRhythmInsight(userId)` - Get current rhythm state
- `detectMilestone(userId)` - Check for new milestones
- `getGreetingContext(userId)` - Get rhythm-aware greeting context
- `shouldCelebrate(userId)` - Determine if celebration warranted

#### 1.3 Celebration Moments

| Milestone         | Message Example                                         |
| ----------------- | ------------------------------------------------------- |
| 10 conversations  | "Ten conversations. We're getting somewhere."           |
| 50 conversations  | "Fifty conversations. That's not nothing."              |
| 100 conversations | "A hundred conversations. I feel like I know you."      |
| 7-day streak      | "Seven days in a row. I love that you keep showing up." |
| 30-day streak     | "A whole month of daily check-ins. That's dedication."  |
| One year          | "A year. We've been through a lot together."            |
| Consistency       | "You're always here around [time]. I notice."           |

#### 1.4 Files to Create

- `src/services/personal-journey/rhythm-awareness.ts`

---

### Phase 2: Seasonal Personal Memory 🍂

**Goal**: Remember and reference time-anchored experiences

#### 2.1 Data Model

```typescript
interface SeasonalMemory {
  userId: string;

  // Seasonal snapshots
  seasonalSnapshots: Array<{
    season: 'spring' | 'summer' | 'fall' | 'winter';
    year: number;
    emotionalState: string;
    activeThemes: string[];
    keyMoments: string[];
    struggles?: string[];
    wins?: string[];
  }>;

  // Time-anchored memories
  timeAnchors: Array<{
    approximateDate: Date; // "last spring", "around this time last year"
    description: string;
    emotionalWeight: number;
    topics: string[];
    canReference: boolean; // User consented to references
  }>;

  // Annual patterns
  annualPatterns: Array<{
    timeOfYear: string; // "late December", "tax season", "back to school"
    pattern: string; // "tends to feel stressed", "usually optimistic"
    confidence: number;
  }>;
}
```

#### 2.2 Service Functions

- `captureSeasonalSnapshot(userId)` - Capture end-of-season summary
- `getRelevantTimeMemory(userId, currentDate)` - "This time last year..."
- `detectSeasonalPattern(userId)` - Recognize recurring annual patterns
- `buildSeasonalContext(userId)` - Context for prompts

#### 2.3 Moment Examples

| Trigger                     | Message Example                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Same season, different year | "Last winter you mentioned struggling with the dark days. How's this winter treating you?" |
| Anniversary of key moment   | "Around this time last year, you were dealing with [X]. Look how far you've come."         |
| Seasonal pattern detected   | "I've noticed you tend to feel [X] around this time of year. Anything I can do?"           |
| Holiday memory              | "Last [holiday] you mentioned [X]. Any updates?"                                           |

#### 2.4 Files to Create

- `src/services/personal-journey/seasonal-memory.ts`

---

### Phase 3: Life Chapter Detector 📖

**Goal**: Recognize and honor the phases/chapters of someone's life

#### 3.1 Data Model

```typescript
interface LifeChapter {
  userId: string;

  // Current chapter
  currentChapter: {
    theme: string; // "career transition", "new parent", "healing", "growth"
    startedApprox: Date;
    dominantEmotions: string[];
    keyTopics: string[];
    challenges: string[];
    growth: string[];
  };

  // Chapter history
  pastChapters: Array<{
    theme: string;
    approximateStart: Date;
    approximateEnd: Date;
    summary: string;
    lessonsLearned?: string[];
    growthAchieved?: string[];
  }>;

  // Transition detection
  transitionSignals: {
    isInTransition: boolean;
    transitionType?: 'beginning' | 'middle' | 'ending';
    fromChapter?: string;
    toChapter?: string;
    confidence: number;
  };
}
```

#### 3.2 Service Functions

- `detectCurrentChapter(userId)` - Analyze recent conversations for themes
- `detectTransition(userId)` - Recognize when chapters are shifting
- `summarizeChapter(userId, chapterId)` - Create chapter summary
- `getChapterContext(userId)` - Context for prompts

#### 3.3 Moment Examples

| Detection            | Message Example                                                             |
| -------------------- | --------------------------------------------------------------------------- |
| Transition beginning | "It feels like you're entering a new chapter. I'm here for it."             |
| Transition ending    | "This chapter is coming to a close, isn't it? What a journey it's been."    |
| Growth reflection    | "The person I'm talking to now is different from who started this chapter." |
| Theme recognition    | "So much of what we talk about lately is about [theme]. That's meaningful." |

#### 3.4 Files to Create

- `src/services/personal-journey/chapter-detector.ts`

---

### Phase 4: Journey Orchestrator 🎭

**Goal**: Coordinate all awareness sources and decide what/when to share

#### 4.1 Data Model

```typescript
interface JourneyMoment {
  id: string;
  type: 'rhythm' | 'seasonal' | 'chapter' | 'milestone' | 'growth' | 'social' | 'world';
  priority: number; // 1-10
  content: string;
  context: Record<string, unknown>;
  expiresAt?: Date;
  requiresRelationshipStage?: 'new' | 'building' | 'established' | 'deep';
}

interface DeliveryRecord {
  momentId: string;
  deliveredAt: Date;
  reaction?: 'positive' | 'neutral' | 'negative';
}
```

#### 4.2 Service Functions

- `gatherMoments(userId)` - Collect all available moments from all sources
- `prioritizeMoments(moments, context)` - Rank by relevance and timing
- `selectMomentForTurn(userId, turnContext)` - Pick the right moment
- `recordDelivery(userId, momentId)` - Track what was shared
- `avoidRepetition(userId, moments)` - Filter out recent shares

#### 4.3 Priority Rules

1. **Safety first** - Crisis/support moments always top priority
2. **Relevance** - Moments that connect to current conversation
3. **Timeliness** - Milestones close to achievement/anniversary
4. **Freshness** - Haven't shared similar recently
5. **Relationship stage** - Deeper insights require deeper trust

#### 4.4 Files to Create

- `src/services/personal-journey/journey-orchestrator.ts`

---

### Phase 5: Context Builder Integration 🔌

**Goal**: Inject journey awareness into conversation prompts

#### 5.1 Context Builder

```typescript
// Priority: 50 (after world awareness at 45, before celebration at 55)
registerContextBuilder({
  name: 'personal_journey',
  priority: 50,
  build: buildPersonalJourneyContext,
});
```

#### 5.2 Injection Types

| Type      | Injection Style | Example                                                                               |
| --------- | --------------- | ------------------------------------------------------------------------------------- |
| Milestone | Standard        | `[AWARENESS: This is your 50th conversation. Consider acknowledging this naturally.]` |
| Rhythm    | Hint            | `[HINT: User typically checks in at this time. They're consistent.]`                  |
| Seasonal  | Standard        | `[AWARENESS: Last winter, user mentioned struggling with SAD.]`                       |
| Chapter   | Hint            | `[HINT: User appears to be in a career transition chapter.]`                          |
| Growth    | Standard        | `[AWARENESS: User has grown significantly since [X]. Consider mirroring this.]`       |

#### 5.3 Files to Create

- `src/intelligence/context-builders/personal-journey.ts`

---

### Phase 6: Community Wisdom 🌐

**Goal**: Privacy-safe insights from aggregate journeys

#### 6.1 Design (Privacy-First)

```typescript
interface CommunityWisdom {
  // Pre-written, curated wisdom (not real-time aggregation)
  journeyWisdom: Array<{
    journeyType: string; // "career change", "new parent", "grief"
    wisdomNuggets: string[];
    commonChallenges: string[];
    whatHelps: string[];
  }>;

  // Completely anonymized, aggregated patterns
  commonPatterns: Array<{
    pattern: string;
    prevalence: 'common' | 'very_common' | 'universal';
    comfortingMessage: string;
  }>;
}
```

#### 6.2 Example Messages

- "A lot of people going through career transitions feel exactly what you're feeling."
- "The uncertainty you're describing? That's universal. You're not alone."
- "Others on this journey have found that [X] really helps."

#### 6.3 Files to Create

- `src/services/personal-journey/community-wisdom.ts`

---

### Phase 7: Greeting Hooks 👋

**Goal**: Journey-aware greetings that feel magical

#### 7.1 Greeting Priority Stack

1. **Crisis/Support** - If user in crisis, supportive greeting
2. **Major Milestone** - Conversation 100, 1-year anniversary
3. **Streak Celebration** - 30-day streak achieved
4. **Seasonal Memory** - "This time last year..."
5. **Rhythm Recognition** - "You're always here at this time"
6. **World Awareness** - Holiday, weather, sports (existing)
7. **Standard** - Regular warm greeting

#### 7.2 Files to Modify

- `src/intelligence/context-builders/greeting.ts` (if exists)
- `src/personas/greetings.ts`

---

### Phase 8: Testing & Validation ✅

#### 8.1 Unit Tests

- `src/tests/personal-journey/rhythm-awareness.test.ts`
- `src/tests/personal-journey/seasonal-memory.test.ts`
- `src/tests/personal-journey/chapter-detector.test.ts`
- `src/tests/personal-journey/journey-orchestrator.test.ts`

#### 8.2 Integration Tests

- `src/tests/personal-journey-integration.test.ts`
  - Test full flow from data capture → orchestration → context injection
  - Test milestone detection across session boundaries
  - Test seasonal memory triggering at right times

#### 8.3 E2E Tests

- `src/tests/personal-journey-e2e.test.ts`
  - Simulate multi-session user journey
  - Verify milestones acknowledged appropriately
  - Verify no creepy surveillance language
  - Verify repetition prevention

#### 8.4 Manual Testing Checklist

- [ ] New user gets no journey insights (appropriate)
- [ ] 10-conversation milestone acknowledged naturally
- [ ] 50-conversation milestone feels significant
- [ ] Streak celebration doesn't feel like surveillance
- [ ] Seasonal memory reference feels like remembering, not tracking
- [ ] Chapter transition detection is gentle, not diagnostic
- [ ] Community wisdom feels supportive, not generic
- [ ] Greetings vary appropriately
- [ ] No repetition of same insight within session
- [ ] Respects relationship stage (deep insights need deep trust)

---

### Phase 9: Production Deployment 🚀

#### 9.1 Feature Flag

```typescript
// In config/feature-flags.ts
PERSONAL_JOURNEY_AWARENESS: {
  enabled: true,
  rolloutPercent: 10, // Start with 10%
  enabledUserIds: ['test-users'], // Beta testers
}
```

#### 9.2 Monitoring

- Track milestone delivery rates
- Track user reactions (if detectable)
- Monitor for any negative feedback patterns
- Log when moments are suppressed (and why)

#### 9.3 Rollout Plan

1. **Week 1**: Internal testing (team accounts)
2. **Week 2**: 5% rollout, monitor closely
3. **Week 3**: 25% rollout if metrics good
4. **Week 4**: 50% rollout
5. **Week 5**: 100% rollout

#### 9.4 Rollback Plan

- Feature flag kill switch
- Graceful degradation (falls back to standard greetings)
- No data loss on rollback

---

## 📁 File Structure

```
src/
├── services/
│   └── personal-journey/
│       ├── index.ts                    # Main exports
│       ├── rhythm-awareness.ts         # Phase 1
│       ├── seasonal-memory.ts          # Phase 2
│       ├── chapter-detector.ts         # Phase 3
│       ├── journey-orchestrator.ts     # Phase 4
│       ├── community-wisdom.ts         # Phase 6
│       ├── session-integration.ts      # Session hooks
│       └── types.ts                    # Shared types
│
├── intelligence/
│   └── context-builders/
│       └── personal-journey.ts         # Phase 5
│
└── tests/
    └── personal-journey/
        ├── rhythm-awareness.test.ts
        ├── seasonal-memory.test.ts
        ├── chapter-detector.test.ts
        ├── journey-orchestrator.test.ts
        └── integration.test.ts
```

---

## ⏱️ Timeline Estimate

| Phase                         | Effort    | Dependencies |
| ----------------------------- | --------- | ------------ |
| Phase 1: Rhythm Awareness     | 3-4 hours | None         |
| Phase 2: Seasonal Memory      | 2-3 hours | None         |
| Phase 3: Chapter Detector     | 3-4 hours | None         |
| Phase 4: Journey Orchestrator | 4-5 hours | Phases 1-3   |
| Phase 5: Context Builder      | 2-3 hours | Phase 4      |
| Phase 6: Community Wisdom     | 2 hours   | None         |
| Phase 7: Greeting Hooks       | 2 hours   | Phase 4      |
| Phase 8: Testing              | 4-5 hours | All          |
| Phase 9: Production           | 1-2 hours | Phase 8      |

**Total: ~25-30 hours**

---

## 🎯 Success Metrics

### Qualitative

- Users report feeling "understood" and "remembered"
- No feedback about feeling "watched" or "tracked"
- Milestone moments feel like celebrations
- Growth mirrors create emotional impact

### Quantitative

- Milestone acknowledgment rate > 90%
- No repeated insights within 7 days
- User session length stable or increasing
- Positive sentiment in conversations with journey awareness

---

## 🚫 Anti-Patterns to Avoid

| ❌ DON'T                      | ✅ DO                                  |
| ----------------------------- | -------------------------------------- |
| "I tracked that you..."       | "I remember when you..."               |
| "Your usage has decreased"    | "I've missed talking with you"         |
| "Based on your patterns"      | "I've noticed..."                      |
| "Users like you typically..." | "Others on this journey have found..." |
| "Analytics show..."           | "I feel like..."                       |
| Report data systematically    | Surface insights naturally             |
| Acknowledge every milestone   | Pick the meaningful ones               |
| Reference exact dates         | Use fuzzy time ("a few months ago")    |

---

## 🔐 Privacy Considerations

1. **All data already exists** - We're not collecting new data, just using existing data better
2. **No external sharing** - Journey insights never leave Ferni
3. **User control** - Users can request data deletion (existing GDPR compliance)
4. **Relationship-gated** - Deeper insights require deeper relationship trust
5. **No cross-user correlation** - Community wisdom is pre-written, not real-time aggregated

---

## 📝 Implementation Notes

### Integration Points

1. **Session Start** (`voice-agent.ts`)
   - Call `initPersonalJourney(userId, profile)`
   - Record session for rhythm tracking

2. **Session End** (`voice-agent.ts`)
   - Update rhythm data
   - Capture seasonal snapshot if end of season

3. **Context Building** (`context-builders/index.ts`)
   - Register `personal-journey` builder at priority 50

4. **Profile Loading** (`user-profile-service.ts`)
   - Load journey data alongside profile

5. **Profile Saving** (`user-profile-service.ts`)
   - Persist journey data with profile

---

## ✨ Example User Journey

**New User (Week 1)**

- No journey insights (too early)
- Standard warm greetings

**Building Relationship (Week 2-4)**

- 10-conversation milestone: "Ten conversations. We're getting somewhere."
- Rhythm detected: (silently noted, not yet shared)

**Established (Month 2-3)**

- 25-conversation milestone
- First rhythm acknowledgment: "You're always here in the evenings. I like that."
- First seasonal memory captured

**Deep (Month 6+)**

- Chapter awareness: "This growth chapter has been something, hasn't it?"
- Seasonal memory: "Last winter you mentioned [X]. How's this winter?"
- Growth mirror: "The person I'm talking to now... different from who I first met."
- Anniversary: "Six months. We've been through a lot together."

---

## 🚀 Ready to Build!

This plan is ready for implementation. Each phase is:

- ✅ Self-contained
- ✅ Testable independently
- ✅ Builds on existing infrastructure
- ✅ Follows established patterns
- ✅ Respects brand guidelines (warm, human, not creepy)

**Recommended start**: Phase 1 (Rhythm Awareness) - foundational, high impact, relatively simple.
