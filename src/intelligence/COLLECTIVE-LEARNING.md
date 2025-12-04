# Collective Learning Architecture

## Overview

This document describes the three-tier learning system that makes our AI agents continuously smarter:

1. **Individual Learning** - Personalization per user
2. **Community Learning** - Patterns across all users
3. **Agent Evolution** - Self-improvement from learnings

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT EVOLUTION                          │
│   Personas adapt prompts, stories, approaches based on data     │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Feeds into
┌─────────────────────────────────────────────────────────────────┐
│                     COMMUNITY INSIGHTS                          │
│   Aggregate patterns, effective responses, common journeys      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Contributes to
┌─────────────────────────────────────────────────────────────────┐
│                    INDIVIDUAL LEARNING                          │
│   Per-user preferences, response quality, conversation patterns │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Individual Learning (Per-User)

### Current Capabilities ✅
- User preferences (communication style, humor, verbosity)
- Response quality tracking (what works for this user)
- Conversation patterns (when they talk, how long)
- Key moments and emotional patterns
- Persona-specific memories

### Improvements Needed 🔧

#### A. Deeper Response Learning
```typescript
// Track WHY certain responses work
interface ResponseEffectiveness {
  responseId: string;
  
  // What we said
  responseType: 'story' | 'advice' | 'question' | 'empathy';
  hadPersonalShare: boolean;
  hadQuirk: boolean;
  hadTeamReference: boolean;
  
  // User reaction
  engagementScore: number;
  followUpDepth: number;  // Did they ask more questions?
  emotionalShift: 'positive' | 'neutral' | 'negative';
  topicContinued: boolean;
  
  // Context
  topic: string;
  userMood: string;
  relationshipStage: string;
  timeOfDay: string;
}
```

#### B. Learning Velocity Tracking
```typescript
// How fast is this user building relationship?
interface RelationshipVelocity {
  userId: string;
  turnsToTrustLevel: Record<string, number>;
  vulnerabilityMoments: number;
  breakthroughCount: number;
  averageSessionDepth: number;  // How deep do conversations go?
}
```

#### C. Topic Mastery Tracking
```typescript
// What has this user actually learned/internalized?
interface UserKnowledgeState {
  userId: string;
  
  // Topics we've covered
  topicsExplained: Map<string, {
    firstExplained: Date;
    timesRevisited: number;
    userUnderstandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
    lastAssessedConfidence: number;
  }>;
  
  // Don't re-explain what they know
  skipExplanationFor: string[];
}
```

---

## 2. Community Learning (Cross-User)

### New Capability: Community Insights Engine

This aggregates anonymized learning signals across ALL users to discover:

#### A. Response Effectiveness Patterns
```typescript
interface CommunityResponsePattern {
  // Aggregate: "Stories about market crashes work 73% better than abstract advice
  //             when users express anxiety about volatility"
  
  context: {
    userEmotion: string;
    topic: string;
    relationshipStage: string;
    personaId: string;
  };
  
  responseStrategies: Array<{
    strategy: string;  // 'story', 'direct_advice', 'question', etc.
    avgEngagement: number;
    sampleSize: number;
    confidenceInterval: number;
  }>;
  
  // The winner
  bestStrategy: string;
  improvementOverBaseline: number;
}
```

#### B. Journey Patterns
```typescript
interface CommunityJourneyPattern {
  // "Users who start with budget anxiety usually progress to:
  //  1. Emergency fund → 2. Debt awareness → 3. Investing questions"
  
  startingState: string;
  typicalProgression: Array<{
    stage: string;
    avgTimeToReach: number;  // days
    commonBlockers: string[];
    effectiveInterventions: string[];
  }>;
  
  successRate: number;  // % who complete journey
  avgTimeToCompletion: number;
}
```

#### C. Question Effectiveness
```typescript
interface EffectiveQuestions {
  // "These questions consistently lead to breakthroughs"
  
  topic: string;
  questions: Array<{
    question: string;
    avgBreakthroughRate: number;
    avgEngagementLift: number;
    bestContext: string;  // When to ask this
  }>;
}
```

#### D. Story Resonance
```typescript
interface StoryResonance {
  // "Jack's Wellington story resonates 2.3x more with Gen X users"
  
  storyId: string;
  overallEffectiveness: number;
  
  segmentEffectiveness: Map<string, number>;  // By user segment
  bestContexts: string[];  // When to tell this story
  userReactions: {
    moved: number;
    inspired: number;
    connected: number;
    indifferent: number;
  };
}
```

---

## 3. Agent Evolution (Self-Improvement)

### How Personas Get Smarter

#### A. Dynamic Prompt Adaptation
```typescript
interface PersonaEvolution {
  personaId: string;
  
  // Learned adjustments to base prompts
  promptAdjustments: Array<{
    trigger: string;  // "when user shows anxiety"
    adjustment: string;  // "lead with empathy before advice"
    confidence: number;
    source: 'community_data' | 'a_b_test' | 'feedback';
    effectivenessLift: number;
  }>;
  
  // Stories that work best
  storyRankings: Array<{
    storyId: string;
    effectivenessScore: number;
    bestContexts: string[];
  }>;
  
  // Phrases that resonate
  effectivePhrases: Array<{
    phrase: string;
    context: string;
    resonanceScore: number;
  }>;
}
```

#### B. A/B Testing Framework
```typescript
interface PersonaExperiment {
  experimentId: string;
  personaId: string;
  
  hypothesis: string;
  
  variantA: {
    description: string;
    promptModification: string;
  };
  
  variantB: {
    description: string;
    promptModification: string;
  };
  
  metrics: {
    engagement: { a: number; b: number };
    satisfaction: { a: number; b: number };
    retention: { a: number; b: number };
  };
  
  status: 'running' | 'concluded';
  winner?: 'a' | 'b' | 'inconclusive';
}
```

#### C. Emergent Behavior Detection
```typescript
interface EmergentPattern {
  // "We noticed Jack naturally started saying 'stay the course' more
  //  when users showed panic. This correlates with +23% calming effect.
  //  RECOMMENDATION: Codify this into the prompt."
  
  patternId: string;
  description: string;
  
  observedBehavior: string;
  correlatedOutcome: string;
  effectSize: number;
  confidence: number;
  
  recommendation: 'codify' | 'amplify' | 'investigate' | 'suppress';
  implemented: boolean;
}
```

---

## Implementation Plan

### Phase 1: Enhanced Individual Learning
1. Add `ResponseEffectiveness` tracking to `response-quality-tracker.ts`
2. Add `RelationshipVelocity` to user profiles
3. Add `UserKnowledgeState` for topic mastery tracking

### Phase 2: Community Insights Engine
1. Create `community-insights.ts` for aggregation
2. Create background job to compute community patterns daily
3. Store in `community_insights` collection in Firestore

### Phase 3: Agent Evolution
1. Create `agent-evolution.ts` for persona improvements
2. Create A/B testing framework
3. Create feedback loop from community → prompts

### Phase 4: Closed Loop
1. Community insights feed into context builders
2. Persona prompts dynamically adjust based on learnings
3. Regular "persona review" jobs analyze and suggest improvements

---

## Data Flow

```
User Conversation
        │
        ▼
┌───────────────────┐
│ Individual Learn  │──────► Store in UserProfile
└───────────────────┘
        │
        ▼ (Anonymized, Aggregated)
┌───────────────────┐
│ Community Insights│──────► community_insights collection
└───────────────────┘
        │
        ▼ (Daily/Weekly job)
┌───────────────────┐
│ Agent Evolution   │──────► Update persona prompts/content
└───────────────────┘
        │
        ▼
Better responses for ALL users
```

---

## Privacy Considerations

1. **Anonymization**: All community data is anonymized before aggregation
2. **Differential Privacy**: Add noise to small cohorts
3. **Opt-out**: Users can opt out of community learning contribution
4. **No PII in Community Data**: Only behavioral signals, never personal info
5. **Aggregation Thresholds**: Minimum N users before pattern is surfaced

---

## Success Metrics

1. **Individual**: Response engagement score improves over time per user
2. **Community**: New users reach "trusted advisor" stage faster
3. **Agent**: Persona effectiveness metrics improve week over week
4. **Retention**: Users return more frequently as system learns

