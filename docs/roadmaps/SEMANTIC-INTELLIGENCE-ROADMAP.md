# Semantic Intelligence Roadmap

> **"Better than Human" - A comprehensive plan for superhuman memory and understanding**

This roadmap outlines the evolution of Ferni's semantic intelligence capabilities, organized into phases that build upon each other.

**STATUS: V3.7 COMPLETE ✅** - All phases implemented on Dec 26, 2024

---

## Implementation Status

### V3.1 Core (COMPLETE ✅)

| Capability | Status | Description |
|------------|--------|-------------|
| Correlation Mining | ✅ | Cross-domain pattern detection |
| Emotional Trajectories | ✅ | Multi-week emotional arc tracking |
| Relational Semantics | ✅ | Person → emotional impact mapping |
| Counter-Factual Memory | ✅ | Advice tracking & outcome learning |
| Growth Fingerprint | ✅ | Linguistic/cognitive evolution |
| Cross-Session Threading | ✅ | Hidden connection discovery |
| Enhanced Person Extraction | ✅ | NER-like proper name detection |
| Semantic Advice Matching | ✅ | Embedding-based advice matching |

---

### V3.2 Proactive Intelligence (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Insight Broker | ✅ | `insight-broker.ts` |
| Open Loops | ✅ | `open-loops.ts` |
| Ferni Commitments | ✅ | `ferni-commitments.ts` |

### V3.3 Relational Network (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Relationship Graph | ✅ | `relationship-graph.ts` |
| Connection Tracking | ✅ | (in relationship-graph.ts) |
| Support Mapping | ✅ | (in relationship-graph.ts) |

### V3.4 Temporal Intelligence (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Hourly Patterns | ✅ | `temporal-patterns.ts` |
| Day-of-Week Patterns | ✅ | `temporal-patterns.ts` |
| Seasonal Patterns | ✅ | `temporal-patterns.ts` |
| Anomaly Detection | ✅ | `temporal-patterns.ts` |

### V3.5 Behavioral Intelligence (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Self-Sabotage Detection | ✅ | `behavioral-intelligence.ts` |
| Emotional Baseline | ✅ | `behavioral-intelligence.ts` |
| Trigger Mapping | ✅ | `behavioral-intelligence.ts` |

### V3.6 Coaching Intelligence (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Advice Effectiveness | ✅ | `coaching-intelligence.ts` |
| Learning Style Detection | ✅ | `coaching-intelligence.ts` |
| Resistance Patterns | ✅ | `coaching-intelligence.ts` |

### V3.7 Self-Awareness (COMPLETE ✅)

| Capability | Status | File |
|------------|--------|------|
| Blind Spot Identification | ✅ | `self-awareness.ts` |
| Self-Perception Gaps | ✅ | `self-awareness.ts` |
| Values-Behavior Alignment | ✅ | `self-awareness.ts` |
| Cognitive Distortion Tracking | ✅ | `self-awareness.ts` |

---

## What's Next: V4.0 Predictive Intelligence

### 🔴 Remaining Gaps

1. **Emotional Forecasting** - Predict upcoming emotional states from patterns
2. **Crisis Prediction** - Detect burnout trajectory and warning signs
3. **Growth Prediction** - Predict readiness for challenges
4. **Multi-modal Memory** - Persist voice tone patterns
5. **Dream/Aspiration Persistence** - Long-term goals semantically tracked

---

## Phase 1: Proactive Intelligence (V3.2)

**Theme:** Make the collected data actionable

### 1.1 Insight Surfacing Engine

**Problem:** We collect rich data but it sits passive until context building.

**Solution:** Create an "insight broker" that:
- Monitors all 6 semantic systems for high-priority insights
- Pushes relevant insights to the agent at the right moment
- Respects timing intelligence (don't surface heavy stuff late at night)

```typescript
interface ProactiveInsight {
  id: string;
  source: 'correlation' | 'trajectory' | 'relational' | 'counterfactual' | 'growth' | 'threading';
  priority: 'critical' | 'high' | 'medium' | 'low';
  insight: string;
  surfaceWhen: InsightTrigger[];
  expiresAt?: Date;
}

// Examples:
// - "You mentioned trying meditation 5 days ago. How's that going?"
// - "I notice you haven't mentioned [person] in 2 weeks - that's unusual"
// - "Last time work got this stressful, you mentioned wanting to quit"
```

**Files to create:**
- `src/services/superhuman/semantic-intelligence/insight-broker.ts`
- `src/services/superhuman/semantic-intelligence/insight-triggers.ts`

### 1.2 Follow-Up Intelligence

**Problem:** Ferni doesn't proactively check in on things.

**Solution:** Track "open loops" that need follow-up:
- Advice given (already exists in counterfactual memory)
- User-stated intentions ("I'm going to talk to her tomorrow")
- Emotional peaks (check in after a crisis)
- Life events mentioned (job interview, doctor visit)

```typescript
interface OpenLoop {
  id: string;
  type: 'advice' | 'intention' | 'emotional_peak' | 'life_event' | 'commitment';
  content: string;
  created: Date;
  followUpAfter: Date;
  followUpBefore: Date;
  priority: number;
  resolved: boolean;
}
```

**Files to create:**
- `src/services/superhuman/semantic-intelligence/open-loops.ts`
- `src/services/superhuman/semantic-intelligence/intention-detector.ts`

### 1.3 Commitment Keeper (Ferni's Promises)

**Problem:** We track advice but not when Ferni says "I'll remember that" or "Let's revisit this."

**Solution:** Track Ferni's commitments to the user:
- "I'll check in about that next time"
- "Let's see how you feel in a week"
- "I won't bring that up again"

```typescript
interface FerniCommitment {
  id: string;
  commitment: string;
  context: string;
  madeAt: Date;
  dueBy?: Date;
  fulfilled: boolean;
  fulfilledAt?: Date;
}
```

**Files to create:**
- `src/services/superhuman/semantic-intelligence/ferni-commitments.ts`
- Detection in response post-processing

---

## Phase 2: Relational Network (V3.3)

**Theme:** Understand the user's social ecosystem

### 2.1 Relationship Graph

**Problem:** We track individual people but not their connections.

**Solution:** Build a semantic graph of the user's relationships:

```typescript
interface RelationshipGraph {
  nodes: Map<string, PersonNode>;
  edges: RelationshipEdge[];
}

interface PersonNode {
  id: string;
  name: string;
  aliases: string[]; // "mom", "mother", "my mom", "Carol"
  relationship: string; // to user
  emotionalImpact: number; // -1 to 1
  mentionFrequency: number;
  lastMentioned: Date;
  topics: string[]; // what they talk about regarding this person
}

interface RelationshipEdge {
  from: string;
  to: string;
  type: 'family' | 'friend' | 'colleague' | 'romantic' | 'conflict' | 'support';
  sentiment: number;
  context: string; // "Mom doesn't like Sarah"
}
```

### 2.2 Conflict Memory

**Problem:** Don't remember interpersonal conflicts and their resolutions.

**Solution:** Track conflicts between people in the user's life:
- Who's in conflict with whom
- What the conflict is about
- What resolution attempts were made
- Current status

### 2.3 Support System Mapping

**Problem:** Don't know who the user turns to for what.

**Solution:** Map the user's support network:
- Who do they call when stressed about work?
- Who do they celebrate with?
- Who do they avoid certain topics with?

---

## Phase 3: Temporal Intelligence (V3.4)

**Theme:** Understand time-based patterns

### 3.1 Circadian Patterns

Track how emotions and topics vary by time of day:
- Morning anxiety?
- Sunday scaries?
- Late-night existential thoughts?

```typescript
interface CircadianPattern {
  userId: string;
  hourOfDay: number;
  dayOfWeek: number;
  patterns: {
    dominantEmotions: string[];
    commonTopics: string[];
    energyLevel: number;
    receptivity: number;
  };
}
```

### 3.2 Seasonal Patterns

Track longer-term cycles:
- Winter depression
- Holiday anxiety
- Anniversary reactions
- Tax season stress

### 3.3 Life Stage Awareness

Track where the user is in life:
- Career stage
- Relationship stage
- Parenting stage
- Health journey stage

---

## Phase 4: Behavioral Intelligence (V3.5)

**Theme:** Detect patterns the user can't see

### 4.1 Self-Sabotage Detection

Identify recurring patterns that hurt the user:
- "Every time you get close to a promotion, you pick a fight with your boss"
- "You tend to isolate when you need support most"
- "You say yes to things right before burnout"

```typescript
interface SelfSabotagePattern {
  id: string;
  pattern: string;
  trigger: string;
  behavior: string;
  consequence: string;
  instances: PatternInstance[];
  confidence: number;
  surfaced: boolean; // have we gently mentioned this?
}
```

### 4.2 Emotional Baseline

Establish what's "normal" for this person:
- Typical energy level
- Baseline anxiety level
- Normal mood range
- Detect when they're outside their normal

### 4.3 Trigger Mapping

Map what causes emotional states:
- What triggers anxiety?
- What brings joy?
- What causes shutdown?
- What enables flow?

---

## Phase 5: Coaching Intelligence (V3.6)

**Theme:** Learn how to help THIS person

### 5.1 Advice Effectiveness Scoring

Track what types of advice work for this person:

```typescript
interface AdviceEffectivenessProfile {
  userId: string;
  
  // What approaches work?
  effectiveApproaches: {
    directSuggestions: number; // 0-1
    gentleNudges: number;
    questioningApproach: number;
    storytelling: number;
    dataAndEvidence: number;
    emotionalValidation: number;
  };
  
  // What domains do they accept advice in?
  receptiveTopics: string[];
  resistantTopics: string[];
  
  // What framing works?
  responseToFraming: {
    positiveBased: number; // "you could..."
    negativeBased: number; // "you might want to avoid..."
    neutralBased: number;
  };
}
```

### 5.2 Learning Style Detection

Detect how the user learns best:
- Data-driven (show me the research)
- Story-driven (tell me about others)
- Experience-driven (let me try it)
- Reflection-driven (let me think about it)

### 5.3 Resistance Patterns

Track when and why the user resists:
- Topics they deflect
- Times they're closed off
- Patterns in pushback

---

## Phase 6: Self-Awareness Coaching (V3.7)

**Theme:** Help users see themselves more clearly

### 6.1 Blind Spot Identification

Identify things the user can't see about themselves:
- Patterns they don't notice
- Impact they have on others
- Gaps between intention and action

### 6.2 Self-Perception Gaps

Track differences between:
- How they describe themselves vs. what they do
- What they say they want vs. what they choose
- How they think others see them vs. evidence

### 6.3 Values-Behavior Alignment

Track alignment between stated values and actions:
- "I value family" + "I worked every weekend this month"
- "Health is important" + "I haven't exercised in 3 weeks"

---

## Phase 7: Predictive Intelligence (V4.0)

**Theme:** Anticipate before being told

### 7.1 Emotional Forecasting

Predict upcoming emotional states:
- Based on calendar (stressful week ahead)
- Based on patterns (Sunday anxiety incoming)
- Based on life events (anniversary approaching)

### 7.2 Crisis Prediction

Detect warning signs of:
- Burnout trajectory
- Relationship breakdown
- Mental health decline
- Major life disruption

### 7.3 Growth Prediction

Predict readiness for:
- New challenges
- Difficult conversations
- Life changes
- Deeper self-work

---

## Implementation Priority Matrix

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 3.2 Proactive Intelligence | 🔥🔥🔥 | Medium | **P0** |
| 3.3 Relational Network | 🔥🔥🔥 | High | **P1** |
| 3.4 Temporal Intelligence | 🔥🔥 | Medium | **P2** |
| 3.5 Behavioral Intelligence | 🔥🔥🔥 | High | **P1** |
| 3.6 Coaching Intelligence | 🔥🔥 | Medium | **P2** |
| 3.7 Self-Awareness Coaching | 🔥🔥🔥 | High | **P2** |
| 4.0 Predictive Intelligence | 🔥🔥🔥 | Very High | **P3** |

---

## Technical Considerations

### Storage
- All semantic data uses Firestore under `bogle_users/{userId}/`
- Consider sharding for users with 1000+ conversations
- Implement TTL for low-value observations

### Performance
- Person extraction runs on every turn - consider caching
- Embedding generation is expensive - batch where possible
- Context building should stay under 200ms

### Privacy
- All data is user-scoped
- Consider data export for user transparency
- Implement "forget" capability for GDPR

### Testing
- Each phase needs unit tests
- Integration tests for cross-system interactions
- E2E tests for proactive surfacing

---

## Success Metrics

### Quantitative
- % of advice followed through
- User-reported helpfulness score
- Conversation depth (turns before superficial)
- Return rate (do they come back?)

### Qualitative
- "It feels like you really know me"
- "How did you remember that?"
- "I never thought about it that way"
- "You noticed something I didn't"

---

## Completion Summary

**V3.1 - V3.7 COMPLETE** (Dec 26, 2024)

All systems are integrated into `integration.ts` and fed data from every user turn:
- V3 Core: 6 semantic intelligence systems
- V3.2: 3 proactive intelligence systems  
- V3.3: Relationship graph with connections
- V3.4: Temporal patterns (hourly, daily, seasonal)
- V3.5: Behavioral intelligence (sabotage, baseline, triggers)
- V3.6: Coaching intelligence (effectiveness, learning style, resistance)
- V3.7: Self-awareness (blind spots, gaps, values, distortions)

## Next Steps (V4.0)

1. **Deploy & Test** - Validate all systems work in production
2. **Observability** - Add metrics for system effectiveness
3. **Predictive Intelligence** - Begin V4.0 emotional forecasting
4. **Multi-modal Memory** - Persist voice prosody patterns
5. **Dream Persistence** - Track long-term aspirations

---

*Last updated: December 26, 2024*
*V3.7 Complete*

