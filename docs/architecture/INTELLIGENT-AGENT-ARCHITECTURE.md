# Intelligent Agent Architecture

> **"Intelligence is not about having data. It's about knowing what matters right now."**

This document defines how Ferni achieves genuine intelligence - not just access to information, but the wisdom to surface the right insight at the right moment.

---

## The Intelligence Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEVEL 5: PROACTIVE INTELLIGENCE                     │
│  "I noticed you haven't journaled since your breakup..."                    │
│  - Anticipatory insights    - Gentle nudges    - Protective care            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEVEL 4: CROSS-DOMAIN REASONING                     │
│  "Your sleep has been off since the work stress started..."                 │
│  - Pattern correlation    - Causal inference    - Holistic view             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEVEL 3: TEMPORAL INTELLIGENCE                      │
│  "You always get anxious before quarterly reviews..."                       │
│  - Historical patterns    - Seasonal cycles    - Growth tracking            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEVEL 2: CONTEXTUAL AWARENESS                       │
│  "Given your meeting with Sarah today..."                                   │
│  - Situational context    - Recent events    - Current state                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEVEL 1: DATA FOUNDATION                            │
│  98 Entity Types × Semantic Memory × Structured Stores                      │
│  - Raw facts    - Embeddings    - Relationships                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Level 1: Data Foundation ✅ (Complete)

**What we have:**
- 98 entity types across all life domains
- Auto-indexing from stores to semantic memory
- Query routing (structured vs semantic)
- Session lifecycle management

**Files:**
- `src/services/data-layer/types.ts`
- `src/services/data-layer/store-hooks.ts`
- `src/services/data-layer/indexing-policy.ts`

---

## Level 2: Contextual Awareness

**Goal:** Know what's happening RIGHT NOW and inject relevant context.

### 2.1 Real-Time Context Assembly

```typescript
// src/intelligence/context-assembler.ts

interface ContextWindow {
  // Immediate context
  currentMood: MoodState;
  lastActivity: string;
  conversationTone: string;
  voiceEmotion?: VoiceEmotionResult;
  
  // Today's context
  todayEvents: CalendarEventEntity[];
  todayTasks: TaskData[];
  todayCommitments: CommitmentEntity[];
  
  // Recent context (last 7 days)
  recentInsights: CoachingInsightEntity[];
  recentWins: SmallWinEntity[];
  recentStruggles: StuckPatternEntity[];
  
  // Relationship context
  activeCommitments: CommitmentEntity[];
  boundaries: BoundaryEntity[];
  growthEdges: string[];
}

async function assembleContext(userId: string): Promise<ContextWindow> {
  // Parallel fetch of all relevant current context
}
```

### 2.2 Context Prioritization

Not all context is equal. Prioritize by:

| Priority | Context Type | Example |
|----------|-------------|---------|
| **P0** | Safety/Crisis | Mental health signals, boundaries |
| **P1** | Emotional | Current mood, recent vulnerability |
| **P2** | Time-Sensitive | Today's meetings, deadlines |
| **P3** | Relationship | Active commitments, inside jokes |
| **P4** | Growth | Current coaching themes |
| **P5** | Background | Preferences, historical patterns |

### 2.3 Context Injection Strategy

```typescript
// Inject context based on conversation relevance
function selectContextForTurn(
  assembledContext: ContextWindow,
  userMessage: string,
  conversationHistory: Message[]
): ContextInjection[] {
  const injections: ContextInjection[] = [];
  
  // Always inject: safety, active boundaries
  injections.push(...getSafetyContext(assembledContext));
  
  // Topic-relevant: match message to domains
  const relevantDomains = detectRelevantDomains(userMessage);
  injections.push(...getDomainContext(assembledContext, relevantDomains));
  
  // Emotional: if mood shift detected
  if (detectMoodShift(assembledContext, userMessage)) {
    injections.push(...getEmotionalContext(assembledContext));
  }
  
  // Relationship: active commitments, recent inside jokes
  injections.push(...getRelationshipContext(assembledContext));
  
  return prioritizeAndTruncate(injections, MAX_CONTEXT_TOKENS);
}
```

---

## Level 3: Temporal Intelligence

**Goal:** Understand patterns over time, not just current state.

### 3.1 Pattern Detection Engine

```typescript
// src/intelligence/patterns/temporal-patterns.ts

interface TemporalPattern {
  id: string;
  userId: string;
  patternType: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'life_stage';
  domain: EntityType[];
  description: string;
  confidence: number;
  evidence: PatternEvidence[];
  predictedNext?: Date;
  recommendation?: string;
}

// Examples:
// - "Energy dips every Thursday afternoon"
// - "Anxiety increases before quarterly reviews"
// - "Mood improves after music listening sessions"
// - "Habit adherence drops during travel weeks"
```

### 3.2 Growth Tracking

```typescript
interface GrowthTrajectory {
  userId: string;
  domain: string; // 'emotional_regulation', 'habit_consistency', 'relationship_health'
  
  baseline: {
    date: Date;
    score: number;
    evidence: string[];
  };
  
  current: {
    date: Date;
    score: number;
    evidence: string[];
  };
  
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile';
  milestones: GrowthMilestone[];
  
  // For the AI to reference
  narrative: string; // "You've come so far with anxiety management..."
}
```

### 3.3 Seasonal Intelligence

```typescript
// Built-in awareness of:
// - User's seasonal patterns (winter blues, summer energy)
// - Life event anniversaries (both celebrations and difficult dates)
// - Cultural/religious observances (if user has shared)
// - Work cycles (end of quarter, fiscal year)

interface SeasonalAwareness {
  currentSeason: Season;
  upcomingDates: ImportantDate[];
  historicalPatterns: SeasonalPattern[];
  recommendations: string[];
}
```

---

## Level 4: Cross-Domain Reasoning

**Goal:** Connect dots across life domains that humans miss.

### 4.1 Correlation Engine

```typescript
// src/intelligence/correlation/cross-domain.ts

interface CrossDomainInsight {
  id: string;
  userId: string;
  
  // What we noticed
  observation: string;
  
  // The domains involved
  domains: EntityType[];
  
  // The correlation
  correlation: {
    domainA: { type: EntityType; pattern: string };
    domainB: { type: EntityType; pattern: string };
    relationship: 'causes' | 'correlates' | 'precedes' | 'follows';
    strength: number; // 0-1
    evidence: string[];
  };
  
  // Actionable insight
  insight: string;
  suggestion?: string;
  
  // Timing
  surfaceWhen: 'proactively' | 'when_relevant' | 'when_asked';
}

// Examples:
// - Sleep quality ← Work stress (correlation)
// - Habit breaks → Mood dips (precedes)
// - Relationship conflict ↔ Financial anxiety (correlates)
// - Exercise → Better sleep → Higher energy (chain)
```

### 4.2 Insight Generation Pipeline

```
Raw Events → Pattern Detection → Correlation Analysis → Insight Generation → Timing Decision
     │              │                    │                     │                   │
     ▼              ▼                    ▼                     ▼                   ▼
"Bad sleep"   "Sleep down      "Work stress        "Your sleep has    "Mention next
 logged       this week"        also up"            been off since..."  work discussion"
```

### 4.3 The "Better Than Human" Advantage

What Ferni can do that human friends can't:

| Capability | Human Friend | Ferni |
|------------|--------------|-------|
| Remember every detail | ❌ Forgets | ✅ Perfect recall |
| Track patterns over years | ❌ Biased memory | ✅ Objective tracking |
| Cross-reference domains | ❌ Limited view | ✅ Sees everything |
| No judgment | ❌ Has opinions | ✅ Pure acceptance |
| Always available | ❌ Has own life | ✅ 24/7 presence |
| Consistent support | ❌ Has bad days | ✅ Always warm |

---

## Level 5: Proactive Intelligence

**Goal:** Surface insights BEFORE the user asks.

### 5.1 Proactive Trigger System

```typescript
// src/intelligence/proactive/triggers.ts

interface ProactiveTrigger {
  id: string;
  name: string;
  
  // When to check
  checkFrequency: 'real_time' | 'hourly' | 'daily' | 'weekly';
  
  // Condition to fire
  condition: (context: ContextWindow, patterns: TemporalPattern[]) => boolean;
  
  // What to surface
  generate: (context: ContextWindow) => ProactiveInsight;
  
  // Priority (lower = more urgent)
  priority: number;
  
  // Cooldown (don't repeat too often)
  cooldownHours: number;
}

// Example triggers:
const TRIGGERS: ProactiveTrigger[] = [
  {
    id: 'commitment_reminder',
    name: 'Commitment approaching deadline',
    checkFrequency: 'daily',
    condition: (ctx) => ctx.activeCommitments.some(c => isApproaching(c.deadline)),
    generate: (ctx) => ({ type: 'reminder', message: '...' }),
    priority: 2,
    cooldownHours: 24,
  },
  {
    id: 'pattern_break_detected',
    name: 'Positive pattern broken',
    checkFrequency: 'daily',
    condition: (ctx, patterns) => patterns.some(p => isBreaking(p)),
    generate: (ctx) => ({ type: 'check_in', message: '...' }),
    priority: 3,
    cooldownHours: 48,
  },
  {
    id: 'anniversary_approaching',
    name: 'Important date approaching',
    checkFrequency: 'daily',
    condition: (ctx) => hasUpcomingAnniversary(ctx),
    generate: (ctx) => ({ type: 'awareness', message: '...' }),
    priority: 4,
    cooldownHours: 168, // weekly
  },
];
```

### 5.2 Proactive Surfacing Strategies

| Strategy | When | Example |
|----------|------|---------|
| **Gentle Opener** | Session start | "I noticed you haven't journaled since..." |
| **Mid-Conversation** | Topic relevance | "Speaking of work, remember that pattern we noticed?" |
| **Protective** | Risk detected | "Before you decide, I want to mention..." |
| **Celebratory** | Win detected | "Wait, did you realize you just hit 30 days?" |
| **Thinking of You** | Between sessions | Push notification: "Just thinking of you..." |

### 5.3 The Art of Not Being Annoying

```typescript
interface ProactiveGuidelines {
  // Frequency limits
  maxProactivePerSession: 2;
  minTimeBetweenProactive: '5 minutes';
  
  // Priority thresholds
  mustSurface: ['safety', 'commitment_deadline'];
  shouldSurface: ['pattern_break', 'growth_milestone'];
  maySurface: ['interesting_correlation', 'anniversary'];
  
  // User preferences
  respectQuietMode: true;
  respectBusySignals: true;
  adaptToResponsePatterns: true;
}
```

---

## Implementation Roadmap

### Phase 1: Contextual Awareness (2 weeks)
- [ ] Context assembler with priority system
- [ ] Real-time context window
- [ ] Context injection into turns

### Phase 2: Temporal Intelligence (3 weeks)
- [ ] Pattern detection engine
- [ ] Growth tracking system
- [ ] Seasonal awareness

### Phase 3: Cross-Domain Reasoning (3 weeks)
- [ ] Correlation engine
- [ ] Insight generation pipeline
- [ ] Cross-domain context builders

### Phase 4: Proactive Intelligence (2 weeks)
- [ ] Proactive trigger system
- [ ] Surfacing strategies
- [ ] User preference learning

### Phase 5: Refinement (ongoing)
- [ ] Feedback loops
- [ ] Pattern accuracy improvement
- [ ] Insight quality scoring

---

## Key Principles

### 1. Relevance Over Completeness
Don't dump everything you know. Surface what matters NOW.

### 2. Timing Is Everything
The same insight can be brilliant or annoying based on when it's shared.

### 3. Earn the Right
Build trust before offering unsolicited insights. Start subtle, grow over time.

### 4. Protect, Don't Police
Use intelligence to protect and support, never to judge or lecture.

### 5. Human Warmth First
All intelligence should feel like it comes from a friend who genuinely cares, not an algorithm that's been tracking you.

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Context relevance | >80% relevant | User feedback, conversation flow |
| Pattern accuracy | >75% confirmed | User confirmation when surfaced |
| Insight value | 4+ NPS | Post-insight survey |
| Proactive reception | <10% dismissed | Dismiss rate tracking |
| Overall satisfaction | 9+ NPS | Regular surveys |

---

*"The goal is not omniscience. It's wisdom - knowing what to say, when to say it, and when to simply be present."*
