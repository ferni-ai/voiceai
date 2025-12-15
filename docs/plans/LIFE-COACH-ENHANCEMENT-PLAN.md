# 🎯 Ferni Life Coach Enhancement Plan

**Created:** December 2024  
**Goal:** Make Ferni the best AI life coach in existence  
**North Star:** "Did they feel less alone? And did they smile?"

---

## Executive Summary

This plan enhances Ferni's life coaching capabilities across **6 phases** over **8-12 weeks**, focusing on:

1. **Phase 1:** Crisis Safety & Quick Wins (Week 1-2)
2. **Phase 2:** Goal Tracking & Accountability (Week 2-3)
3. **Phase 3:** Proactive Care System (Week 3-4)
4. **Phase 4:** Coaching Intelligence (Week 4-6)
5. **Phase 5:** Progress & Growth Visualization (Week 6-8)
6. **Phase 6:** Team Coordination Intelligence (Week 8-10)

---

## Phase 1: Crisis Safety & Quick Wins 🚨

**Duration:** Week 1-2  
**Priority:** CRITICAL + HIGH IMPACT

### 1.1 Crisis Detection & Escalation

**Why:** User safety is non-negotiable. Ferni must recognize crisis and connect to resources while staying present.

**Implementation:**

```
src/services/safety/
├── crisis-detection.ts      # Detect crisis signals
├── crisis-response.ts       # Warm response + resource connection
├── escalation-pathways.ts   # When to suggest professional help
└── index.ts
```

**Crisis Signals to Detect:**

- Suicidal ideation ("I don't want to be here", "what's the point")
- Self-harm mentions
- Abuse indicators (domestic, child, elder)
- Severe distress (panic attacks, psychotic symptoms)
- Substance crisis

**Response Philosophy:**

- Never abandon ("I'm here, AND I want you to have more support")
- Validate first, resources second
- Warm handoff language, not clinical

**Files to Create:**

- [ ] `src/services/safety/crisis-detection.ts`
- [ ] `src/services/safety/crisis-response.ts`
- [ ] `src/services/safety/escalation-pathways.ts`
- [ ] `src/services/safety/index.ts`

**Integration Points:**

- [ ] Add to voice-agent turn processor
- [ ] Add to context builders
- [ ] Create admin alerts for crisis events

---

### 1.2 Execute Proactive Outreach

**Why:** "Thinking of You" moments exist but never execute. This is a core brand promise.

**Current State:**

- `src/services/trust-systems/thinking-of-you.ts` generates moments
- No scheduled job executes them

**Implementation:**

- [ ] Create `src/jobs/proactive-outreach.job.ts`
- [ ] Add to `src/tasks/index.ts` scheduler
- [ ] Integrate with push notifications
- [ ] Add time-appropriate delivery (not 2am)
- [ ] Track delivery and response rates

**Delivery Channels:**

- Push notification (primary)
- SMS (for premium users)
- In-app next session prompt (fallback)

---

### 1.3 Surface Growth Reflections

**Why:** Ferni notices user evolution but rarely says it. This builds deep trust.

**Current State:**

- `trust-context.ts` has `formatGrowthReflection()` but may not trigger often

**Enhancement:**

- [ ] Lower threshold for growth detection
- [ ] Add session milestone triggers (10th, 25th, 50th conversation)
- [ ] Create "remember when" moments based on past struggles now overcome
- [ ] Add to emotional arc as celebration opportunity

---

### 1.4 Small Wins Follow-Up

**Why:** "How did that interview go?" shows Ferni remembers what matters.

**Current State:**

- `detectIntention()` tracks plans
- `getPendingIntentions()` exists but not checked

**Implementation:**

- [ ] Add intention check to session start
- [ ] Create follow-up question generator
- [ ] Track follow-up success rates
- [ ] Graceful handling when user forgot/didn't do it

---

## Phase 2: Goal Tracking & Accountability 🎯

**Duration:** Week 2-3  
**Priority:** HIGH

### 2.1 Goal Tracking Service

**Why:** Structured goal-setting with follow-up is the core of coaching.

**Files to Create:**

```
src/services/coaching/
├── goal-tracking.ts         # Core goal CRUD
├── goal-decomposition.ts    # Break into milestones
├── goal-check-ins.ts        # Scheduled check-ins
├── goal-celebration.ts      # Progress celebration
└── index.ts
```

**Goal Schema:**

```typescript
interface CoachingGoal {
  id: string;
  userId: string;
  personaId: string; // Which team member is helping

  // Definition
  title: string;
  description: string;
  domain: 'career' | 'health' | 'relationships' | 'finance' | 'personal_growth' | 'habits';

  // SMART criteria
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timebound: Date;

  // Progress
  milestones: Milestone[];
  currentMilestone: number;
  progress: number; // 0-100

  // Metadata
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Context
  obstacles: string[]; // What's getting in the way
  motivations: string[]; // Why this matters
  supportNeeded: string[]; // How Ferni can help
}

interface Milestone {
  id: string;
  title: string;
  dueDate: Date;
  completed: boolean;
  completedAt?: Date;
  checkInScheduled?: Date;
  notes: string[];
}
```

**Detection & Creation:**

- [ ] Detect goal statements in conversation
- [ ] Offer to formalize ("Want me to help you make a plan for this?")
- [ ] Guide through SMART goal creation naturally
- [ ] Store in Firestore with user context

**Check-in System:**

- [ ] Schedule milestone check-ins
- [ ] Proactive: "Your resume deadline is tomorrow. How's it going?"
- [ ] Reactive: Ask about goals when relevant topic comes up
- [ ] Celebrate completions with persona-appropriate enthusiasm

---

### 2.2 Action Planning Integration

**Why:** After discussing a problem, create actionable next steps.

**Implementation:**

- [ ] Create `src/services/coaching/action-planning.ts`
- [ ] Detect "action opportunity" in conversation
- [ ] Generate 2-3 tiny first steps
- [ ] Offer to set reminder/check-in
- [ ] Track action completion rates

**Action Item Schema:**

```typescript
interface ActionItem {
  id: string;
  goalId?: string; // Optional link to goal
  userId: string;

  action: string;
  context: string; // What conversation spawned this
  dueDate?: Date;

  status: 'pending' | 'completed' | 'skipped';
  followUpScheduled?: Date;
}
```

---

### 2.3 Obstacle Detection & Support

**Why:** When progress stalls, understand why and offer support.

**Implementation:**

- [ ] Track goal velocity (progress over time)
- [ ] Detect stalls (no progress in 2+ weeks)
- [ ] Gentle exploration: "I noticed we haven't talked about X lately. What's going on?"
- [ ] Offer adjusted milestones or pivot options
- [ ] Never shame, always understand

---

## Phase 3: Proactive Care System 💌

**Duration:** Week 3-4  
**Priority:** HIGH

### 3.1 Thinking of You Execution

**Already outlined in Phase 1.2**

---

### 3.2 Life Events Follow-Up

**Why:** Ferni should remember birthdays, anniversaries, stressful dates.

**Current State:**

- `life-events.ts` tracks events
- Not proactively surfacing

**Implementation:**

- [ ] Create calendar-aware check-in system
- [ ] "I know today is hard—it's been a year since..."
- [ ] Birthday/anniversary acknowledgments
- [ ] Pre-event support ("Big interview tomorrow. How are you feeling?")

**Integration:**

- [ ] Add to proactive outreach job
- [ ] Add to session start context

---

### 3.3 Seasonal & Contextual Awareness

**Current State:**

- `seasonal-awareness.ts` exists
- May not be surfacing in conversations

**Enhancement:**

- [ ] Holiday awareness (not everyone celebrates)
- [ ] Seasonal depression patterns (winter, anniversaries)
- [ ] Major news event sensitivity
- [ ] Time of day / day of week patterns

---

### 3.4 Re-engagement Nudges

**Why:** When users go quiet, Ferni should reach out appropriately.

**Implementation:**

- [ ] Track session frequency patterns
- [ ] Detect unusual absence (missed expected session)
- [ ] Gentle re-engagement: "Haven't heard from you in a bit. Just wanted to check in."
- [ ] Respect if they need space
- [ ] Graduated urgency (day 3, day 7, day 14)

---

## Phase 4: Coaching Intelligence 🧠

**Duration:** Week 4-6  
**Priority:** MEDIUM-HIGH

### 4.1 Deepen Socratic Questioning

**Why:** The best coaching unlocks insights through questions, not advice.

**Current State:**

- `socratic-engine.ts` exists but may not be prominent

**Enhancement:**

- [ ] Make Socratic questions primary response mode
- [ ] Create question library by situation type
- [ ] Track which questions lead to breakthroughs
- [ ] Adapt questioning style to user preference

**Question Types:**

```typescript
type SocraticQuestionType =
  | 'clarifying' // "What do you mean by...?"
  | 'assumption_probing' // "What are you assuming here?"
  | 'evidence_seeking' // "What evidence supports that?"
  | 'perspective_taking' // "How would X see this?"
  | 'implication_exploring' // "What happens if that's true?"
  | 'meta_questioning'; // "Why is this question important?"
```

---

### 4.2 Personalized Coaching Style Adaptation

**Why:** Different people need different coaching approaches.

**Implementation:**

```
src/services/coaching/
├── style-detection.ts       # Detect learning/processing style
├── style-adaptation.ts      # Adapt coaching approach
└── style-profiles.ts        # Profile definitions
```

**Coaching Styles:**

```typescript
type CoachingStyle =
  | 'analytical' // Lead with data, frameworks, logic
  | 'emotional' // Process feelings before problem-solving
  | 'action' // Get to "what's next" quickly
  | 'reflective' // Lots of space, journaling prompts
  | 'supportive' // Heavy validation, gentle suggestions
  | 'challenging'; // Direct feedback, accountability
```

**Detection Signals:**

- Response patterns (asks for data vs shares feelings)
- Request patterns ("tell me what to do" vs "help me think")
- Explicit preferences
- Cultural context

---

### 4.3 Values-Centered Coaching

**Why:** The best decisions align with what matters most.

**Current State:**

- ACT values exist but relationship-stage gated

**Enhancement:**

- [ ] Surface values earlier in relationship
- [ ] "Values check" during difficult decisions
- [ ] "Does this align with what matters most to you?"
- [ ] Track values evolution over time
- [ ] Celebrate values-aligned actions

---

### 4.4 Cognitive Reframe Enhancement

**Why:** Help users see situations differently.

**Current State:**

- Cognitive distortion detection exists
- Response could be more sophisticated

**Enhancement:**

- [ ] Multiple reframe options (not just one)
- [ ] Track which reframes resonate
- [ ] Gentle introduction: "Can I offer another way to look at this?"
- [ ] User-generated reframes (they often know the answer)

---

### 4.5 Emotional Granularity Training

**Why:** "I feel bad" → "I feel disappointed, anxious, and a little angry"

**Implementation:**

- [ ] Detect low emotional granularity
- [ ] Offer vocabulary expansion: "Is that more frustration or disappointment?"
- [ ] Track emotional vocabulary growth
- [ ] Celebrate increased awareness

---

## Phase 5: Progress & Growth Visualization 📈

**Duration:** Week 6-8  
**Priority:** MEDIUM

### 5.1 Journey Reflection System

**Why:** Show users how far they've come.

**Implementation:**

```
src/services/coaching/
├── journey-tracking.ts      # Track milestones
├── journey-visualization.ts # Generate reflection content
└── journey-celebrations.ts  # Anniversary moments
```

**Reflection Moments:**

- Session milestones (10th, 25th, 50th, 100th)
- Time milestones (1 month, 3 months, 6 months, 1 year)
- Growth milestones (first time discussing X, breakthrough moment)
- Goal completions

**Content Types:**

- "Three months ago, you couldn't talk about this. Look at you now."
- "Remember when you thought you'd never X? You just did."
- "I've watched you grow in how you handle Y."

---

### 5.2 Progress Metrics (User-Facing)

**Why:** Tangible progress feels good.

**Metrics to Track:**

- Goals completed
- Habits maintained
- Cognitive distortions challenged
- Values-aligned decisions
- Breakthroughs
- Sessions with positive mood shift

**Display:**

- Weekly summary option
- Monthly reflection
- Annual review

---

### 5.3 Relationship Health Dashboard

**Why:** Make the relationship feel mutual.

**Current State:**

- `relationship-health.ts` calculates scores internally

**Enhancement:**

- [ ] Surface relationship milestones to user
- [ ] "We've been talking for 6 months now"
- [ ] Celebrate relationship growth, not just personal growth
- [ ] Acknowledge trust deepening

---

## Phase 6: Team Coordination Intelligence 🤝

**Duration:** Week 8-10  
**Priority:** MEDIUM

### 6.1 Intelligent Handoff Detection

**Why:** Know when Maya, Alex, Peter, Jack, or Jordan would be more helpful.

**Enhancement:**

```
src/services/coaching/
├── handoff-intelligence.ts   # Detect handoff opportunities
├── team-coordination.ts      # Coordinate team context
└── handoff-warmth.ts         # Warm handoff language
```

**Detection Patterns:**

- Habit formation → Maya
- Communication skills → Alex
- Research needs → Peter
- Financial wisdom → Jack
- Life event planning → Jordan
- Deep wisdom → Nayan (premium)

---

### 6.2 Cross-Persona Context Sharing

**Why:** "Maya mentioned you're working on morning routines. How's that going?"

**Implementation:**

- [ ] Shared goal context across personas
- [ ] Conversation summary for handoff
- [ ] Coordinated check-ins
- [ ] Unified relationship health

---

### 6.3 Team Introduction Strategy

**Why:** Introduce team members naturally over time.

**Implementation:**

- [ ] Track which team members user has met
- [ ] Natural introduction opportunities
- [ ] Warm handoff language: "I have a friend who's incredible at this..."
- [ ] Post-handoff follow-up from Ferni

---

## Implementation Order & Dependencies

```
Phase 1 (Critical) ─────────────────────────────────┐
  1.1 Crisis Detection                              │
  1.2 Proactive Outreach                            │
  1.3 Growth Reflections                            │
  1.4 Small Wins Follow-Up                          │
                                                    │
Phase 2 (Core) ──────────────────────────────────────┤
  2.1 Goal Tracking (depends on 1.4)               │
  2.2 Action Planning                               │
  2.3 Obstacle Detection (depends on 2.1)          │
                                                    │
Phase 3 (Care) ──────────────────────────────────────┤
  3.1 Life Events Follow-Up                         │
  3.2 Seasonal Awareness                            │
  3.3 Re-engagement Nudges (depends on 1.2)        │
                                                    │
Phase 4 (Intelligence) ──────────────────────────────┤
  4.1 Socratic Questioning                          │
  4.2 Style Adaptation                              │
  4.3 Values Coaching (depends on 4.2)             │
  4.4 Cognitive Reframe                             │
  4.5 Emotional Granularity                         │
                                                    │
Phase 5 (Visualization) ─────────────────────────────┤
  5.1 Journey Reflection (depends on 2.1)          │
  5.2 Progress Metrics                              │
  5.3 Relationship Dashboard                        │
                                                    │
Phase 6 (Team) ──────────────────────────────────────┘
  6.1 Handoff Intelligence
  6.2 Cross-Persona Context
  6.3 Team Introduction
```

---

## Success Metrics

### User Experience

- Session frequency increase
- Session duration increase
- Goal completion rate
- Return rate (7-day, 30-day)
- User-reported satisfaction

### Coaching Quality

- Breakthrough moments detected
- Values-aligned decisions made
- Cognitive distortions challenged
- Goals completed
- Habits maintained

### Relationship Health

- Trust score trend
- Callback success rate
- Proactive outreach engagement
- Re-engagement success rate

---

## Risk Mitigation

### Over-Coaching

**Risk:** Ferni becomes preachy or advice-heavy  
**Mitigation:** Keep question-to-statement ratio high, track user feedback

### Privacy Concerns

**Risk:** Users feel surveilled by detailed tracking  
**Mitigation:** Transparent about what's remembered, easy opt-out

### Crisis Handling

**Risk:** Inadequate response to genuine crisis  
**Mitigation:** Conservative crisis detection, always provide resources

### Feature Creep

**Risk:** Too many features, loses coherence  
**Mitigation:** Each feature must pass "does this make them feel less alone?" test

---

## Files to Create Summary

```
src/services/
├── safety/
│   ├── crisis-detection.ts
│   ├── crisis-response.ts
│   ├── escalation-pathways.ts
│   └── index.ts
├── coaching/
│   ├── goal-tracking.ts
│   ├── goal-decomposition.ts
│   ├── goal-check-ins.ts
│   ├── goal-celebration.ts
│   ├── action-planning.ts
│   ├── obstacle-detection.ts
│   ├── style-detection.ts
│   ├── style-adaptation.ts
│   ├── style-profiles.ts
│   ├── journey-tracking.ts
│   ├── journey-visualization.ts
│   ├── journey-celebrations.ts
│   ├── handoff-intelligence.ts
│   ├── team-coordination.ts
│   ├── handoff-warmth.ts
│   └── index.ts
├── jobs/
│   └── proactive-outreach.job.ts
```

**Enhancements to Existing Files:**

- `src/services/therapeutic-frameworks/act-values.ts` - Values coaching
- `src/services/cognitive-intelligence/socratic-engine.ts` - Question enhancement
- `src/services/trust-systems/thinking-of-you.ts` - Execution hook
- `src/services/trust-systems/growth-reflection.ts` - Lower threshold
- `src/services/trust-systems/small-wins.ts` - Follow-up system
- `src/agents/voice-agent/index.ts` - Integration points
- `src/intelligence/context-builders/index.ts` - New context builders

---

## Implementation Status 🎉

**Status:** ALL PHASES IMPLEMENTED ✅

### Implemented Files

```
src/services/safety/                    ✅ COMPLETE
├── crisis-detection.ts                 ✅ Detects crisis signals
├── crisis-response.ts                  ✅ Warm responses with resources
├── escalation-pathways.ts              ✅ Professional help suggestions
└── index.ts                            ✅ Unified API

src/services/coaching/                  ✅ COMPLETE
├── goal-tracking.ts                    ✅ Goal CRUD & detection
├── action-planning.ts                  ✅ Breaking goals into steps
├── obstacle-detection.ts               ✅ Barrier identification
├── style-adaptation.ts                 ✅ Coaching style personalization
├── emotional-granularity.ts            ✅ Emotion vocabulary training
├── journey-tracking.ts                 ✅ Milestones & reflections
├── handoff-intelligence.ts             ✅ Team member suggestions
├── socratic-engine.ts                  ✅ Guided self-discovery
├── cognitive-reframes.ts               ✅ Cognitive distortion reframing
├── seasonal-awareness.ts               ✅ Time/season context
├── reengagement.ts                     ✅ Thoughtful re-engagement
├── values-coaching.ts                  ✅ Core values exploration
├── progress-metrics.ts                 ✅ User-facing growth tracking
├── cross-persona-context.ts            ✅ Team context sharing
├── persistence.ts                      ✅ Firestore integration
└── index.ts                            ✅ Unified API

src/intelligence/context-builders/      ✅ INTEGRATED
└── coaching-context.ts                 ✅ LLM context injection
```

### Integration Points

| Integration              | Status | Details                                    |
| ------------------------ | ------ | ------------------------------------------ |
| Context Builder Registry | ✅     | Auto-loaded in `context-builders/index.ts` |
| Turn Processor           | ✅     | Injected via context builder system        |
| Firestore Persistence    | ✅     | Session start/end hooks                    |
| Safety Module            | ✅     | Priority context injection                 |

### Test Coverage

```bash
npm run test -- src/tests/coaching.test.ts
```

Tests cover:

- Goal tracking (detection, CRUD, check-ins, export/import)
- Action planning (opportunity detection, suggestions, tracking)
- Obstacle detection (type classification, supportive responses)
- Style adaptation (signal detection, guidance generation)
- Emotional granularity (vague expression detection, vocabulary)
- Journey tracking (session recording, milestones, reflections)
- Cognitive reframes (distortion detection, reframing techniques)
- Socratic questioning (question type selection, generation)
- Values coaching (exploration, identification, decision checks)
- Handoff intelligence (opportunity detection, introductions)
- Seasonal awareness (season detection, holidays, difficult times)
- Progress metrics (recording, reflection generation)
- Re-engagement (nudge timing, message generation)
- Cross-persona context (sharing, retrieval, handoff summaries)
- Safety integration (crisis detection, responses, escalation)

### Documentation

- [COACHING-SYSTEM.md](./COACHING-SYSTEM.md) - Complete technical documentation
- This file - Enhancement plan with all phases marked complete

---

## Let's Begin! 🚀

~~Phase 1 is ready to implement. Start with:~~

~~1. Crisis Detection & Response (most critical)~~
~~2. Proactive Outreach Execution (quick win)~~
~~3. Growth Reflections Enhancement~~
~~4. Small Wins Follow-Up~~

**All phases have been implemented!** 🎉

Next steps:

1. Deploy and monitor in production
2. Gather user feedback
3. Iterate on ML-based improvements
4. Add wearable/calendar integrations
