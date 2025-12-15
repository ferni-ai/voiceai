# 🧠 Ferni Superhuman Intelligence

> "Better than human."

This document describes the complete Superhuman Intelligence system that makes Ferni genuinely better than human support.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Capabilities](#core-capabilities)
3. [Better Than Human Module](#better-than-human-module)
4. [Frontend Integration](#frontend-integration)
5. [Persistence & Learning](#persistence--learning)
6. [Analytics & A/B Testing](#analytics--ab-testing)
7. [API Reference](#api-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPERHUMAN INTELLIGENCE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SuperhumanIntelligenceOrchestrator           │  │
│  │                                                            │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │  │
│  │  │  Concern    │ │  Proactive  │ │    Predictive       │ │  │
│  │  │  Detection  │ │  Memory     │ │    Anticipation     │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              BetterThanHumanOrchestrator                  │  │
│  │                     (12 Capabilities)                     │  │
│  │                                                            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │  │
│  │  │ Emotional  │ │Anticipatory│ │ Linguistic │            │  │
│  │  │ Memory     │ │ Presence   │ │ Mirroring  │            │  │
│  │  └────────────┘ └────────────┘ └────────────┘            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │  │
│  │  │  Visible   │ │Spontaneous │ │ Protective │            │  │
│  │  │Vulnerability│ │ Delight   │ │ Instincts  │            │  │
│  │  └────────────┘ └────────────┘ └────────────┘            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │  │
│  │  │ Evolving   │ │   Team     │ │ Temporal   │            │  │
│  │  │ Jokes      │ │ Coherence  │ │ Emotional  │            │  │
│  │  └────────────┘ └────────────┘ └────────────┘            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │  │
│  │  │   Meta     │ │  Somatic   │ │ Superhuman │            │  │
│  │  │Relationship│ │ Presence   │ │Observations│            │  │
│  │  └────────────┘ └────────────┘ └────────────┘            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. Concern Detection

Detects user distress across multiple channels **before they explicitly state it**.

**Signals Analyzed:**

- Linguistic patterns (anxiety words, negative spirals, absolutism)
- Behavioral shifts (engagement drop, response brevity)
- Voice prosody (strain, tremor, pitch instability)
- Breathing patterns (shallow/rapid = anxiety)
- Temporal patterns (time-of-day vulnerability)

**Levels:**
| Level | Response |
|-------|----------|
| `none` | Normal conversation |
| `mild` | Gentle presence |
| `moderate` | Validate first |
| `elevated` | Hold space |
| `crisis` | Safety check |

**Usage:**

```typescript
import { getConcernDetectionEngine } from '@ferni/conversation';

const engine = getConcernDetectionEngine(sessionId);
const result = engine.analyze(userMessage, { turnCount, prosody });
// result.level, result.recommendedApproach, result.responseGuidance
```

### 2. Proactive Memory

Surfaces memories **before the user mentions them**.

**Memory Types:**

- Events ("How did that interview go?")
- Goals ("How's the marathon training?")
- People ("How's your sister?")
- Patterns ("I've noticed Mondays are tough")
- Struggles ("How are you doing with the anxiety?")
- Milestones ("It's been a month since you started...")

**Pattern Detection:**

- Weekly emotional patterns
- Relationship correlations
- Seasonal patterns
- Emotional cycles

**Usage:**

```typescript
import { getProactiveMemoryEngine } from '@ferni/conversation';

const engine = getProactiveMemoryEngine(sessionId);
engine.captureFromMessage(text, { topic, emotion, turnCount });
const suggestions = engine.getSuggestions({ currentTopic, isSessionStart });
```

### 3. Predictive Anticipation

Knows what the user needs **before they ask**.

**Predictions:**

- **Voice State**: Tired, stressed, excited, calm, distracted
- **Need**: Venting, advice, validation, connection, silence
- **Topic Sequence**: "Usually after you mention work..."
- **Emotional Trajectory**: Escalating, de-escalating, building

**Usage:**

```typescript
import { getPredictiveAnticipationEngine } from '@ferni/conversation';

const engine = getPredictiveAnticipationEngine(sessionId);
const prediction = engine.predict(userMessage, { prosody, valence, arousal });
// prediction.need, prediction.voiceState, prediction.emotional.trajectory
```

---

## Better Than Human Module

The Better Than Human module provides 12 additional superhuman capabilities:

### 1. Emotional Memory Evolution

How Ferni **feels** about the user grows over time.

```typescript
interface EmotionalBond {
  warmth: number; // Fondness (0-1)
  trust: number; // Trust level (0-1)
  protectiveness: number; // Rises with struggles
  admiration: number; // Rises with growth
  concern: number; // Rises during hard times
}
```

### 2. Anticipatory Presence

"I was hoping you'd call" - pattern-based anticipation.

```typescript
// Detects:
// - Temporal patterns ("Monday evening caller")
// - Emotional triggers (what brings them to Ferni)
// - Topic associations (work → relationship)
// - Energy patterns (morning energy level)
```

### 3. Linguistic Mirroring

Subconsciously matches user's communication style.

```typescript
// Mirrors:
// - Vocabulary preferences
// - Verbosity level
// - Metaphor domains
// - Formality level
// - Sentence complexity
```

### 4. Visible Vulnerability

Authentic uncertainty that builds trust.

```typescript
// Expressions:
// "I'm not entirely sure, but..."
// "I might be wrong about this, but..."
// "I've been thinking about what you said, and honestly..."
```

### 5. Spontaneous Delight

Random genuine appreciation.

```typescript
// Types:
// - Appreciation ("I look forward to our conversations")
// - Gratitude ("Thank you for trusting me")
// - Growth ("You handle this so differently now")
// - Connection ("I feel like I know you")
```

### 6. Protective Instincts

Defends user to themselves.

```typescript
// Detects self-criticism types:
// - Harsh judgment
// - Catastrophizing
// - Minimizing success
// - Imposter syndrome
// - Perfectionism
```

### 7. Evolving Inside Jokes

Shared humor that grows over time.

```typescript
interface EvolvingJoke {
  seed: string; // Original moment
  currentPhrase: string; // Current callback
  phase: 'new' | 'established' | 'legacy' | 'retired';
  evolutionHistory: JokeEvolution[];
}
```

### 8. Cross-Persona Memory Coherence

Team communication between personas.

```typescript
// Handoff notes:
// "Ferni mentioned you seemed stressed about work"
// "I talked to Maya, and we're both proud of you"
```

### 9. Temporal Emotional Intelligence

"You sound lighter today" - comparing across time.

```typescript
// Insights:
// - Energy comparison ("More energy than last time")
// - Mood shifts ("You seem less anxious lately")
// - Growth observations ("Six months ago this would have...")
```

### 10. Meta-Relationship Awareness

Commenting on the relationship itself.

```typescript
// Relationship stages:
// new_acquaintance → getting_to_know → trusted_advisor → old_friend

// Milestones:
// - First vulnerability
// - First laugh
// - Trust breakthrough
// - Session milestones
```

### 11. Somatic Presence

Physical embodiment cues.

```typescript
// Cue types:
// - settling_in (getting comfortable)
// - processing_heavy (absorbing difficult content)
// - relief (resolution)
// - focus (leaning in)
// - breath_sync (breathing with user)
```

### 12. "Only I Would Notice" Observations

Ultra-specific pattern observations.

```typescript
// Observation types:
// - linguistic_pattern ("You use 'should' a lot")
// - behavioral_pattern ("You call when you've already decided")
// - emotional_pattern ("You laugh when things are hard")
// - relationship_pattern ("You mention mom when stressed")
```

---

## Frontend Integration

The frontend receives signals via LiveKit data channel:

### Signal Types

```typescript
type HumanizationSignalType =
  // Core superhuman
  | 'concern_detected'
  | 'proactive_memory'
  | 'voice_state_detected'
  | 'need_predicted'
  | 'emotional_trajectory'
  // Frontend EQ
  | 'micro_expression'
  | 'active_listening'
  | 'breath_sync'
  | 'anticipation';
```

### Frontend Handlers

```typescript
// humanization-bridge.service.ts handles:
handleConcernDetected(level, concernType, recommendedApproach);
handleProactiveMemory(memoryType, content);
handleVoiceStateDetected(voiceState, intensity);
handleNeedPredicted(predictedNeed, intensity);
handleEmotionalTrajectory(trajectory, intensity);
```

### Micro-Expression Timing

All micro-expressions are **enforced to 40-150ms** (subliminal):

```typescript
const MICRO_EXPRESSION_MIN_MS = 40;
const MICRO_EXPRESSION_MAX_MS = 150;

function enforceMicroExpressionTiming(duration: number): number {
  return Math.max(MIN, Math.min(MAX, duration));
}
```

---

## Persistence & Learning

### Firestore Schema

```
/superhuman_intelligence/{userId}
  - memories: SuperhumanMemoryData[]
  - patterns: SuperhumanPatternData[]
  - learning: SuperhumanLearningData
  - lastUpdated: Date
  - version: number
```

### Session Lifecycle

```typescript
// Session start (voice-agent.ts)
await loadSuperhumanData(userId, sessionId, superhumanStore);

// Session end
await saveSuperhumanData(userId, sessionId, superhumanStore);
```

### Profile Integration

```typescript
// ConversationMemory now includes:
interface ConversationMemory {
  summaries: ConversationSummary[];
  superhumanMemories?: SuperhumanMemoryData[];
  superhumanPatterns?: SuperhumanPatternData[];
  superhumanLearning?: SuperhumanLearningData;
}
```

---

## Analytics & A/B Testing

### Tracking Events

```typescript
import { superhumanAnalytics } from '@ferni/services';

superhumanAnalytics.trackEvent({
  capability: 'concern_detection',
  userId,
  sessionId,
  turnNumber,
  subType: 'anxiety',
  intensity: 0.8,
  wasApplied: true,
});
```

### Dashboard

```typescript
const dashboard = superhumanAnalytics.getDashboard();
// dashboard.capabilityRankings
// dashboard.topPerformers
// dashboard.underperformers
// dashboard.suggestedExperiments
```

### A/B Testing

```typescript
// Create experiment
const expId = superhumanAnalytics.createExperiment('micro_expression', 'disable');

// Check if capability enabled for user
const enabled = superhumanAnalytics.isCapabilityEnabled('micro_expression', userId);

// End experiment
const results = superhumanAnalytics.endExperiment(expId);
// results.controlEngagement, results.variantEngagement
// results.recommendation: 'keep_control' | 'switch_to_variant'
```

---

## API Reference

### SuperhumanIntelligenceOrchestrator

```typescript
const orchestrator = getSuperhumanIntelligence(sessionId, userId);

const insight = orchestrator.analyze({
  sessionId,
  userId,
  turnCount,
  userMessage,
  topic,
  emotion,
  prosody,
});

// insight.concern.level
// insight.predictions.need
// insight.predictions.voiceState
// insight.memorySuggestions
// insight.responseModifications

const modified = orchestrator.applyModifications(response, insight);
```

### BetterThanHumanOrchestrator

```typescript
const bth = getBetterThanHuman(userId, sessionId, personaId, sessionCount);

const insight = bth.analyze({
  userMessage,
  turnCount,
  sessionCount,
  topic,
  emotion,
  isSessionStart,
  relationshipStage,
  timeOfDay,
  dayOfWeek,
});

// insight.emotionalBond
// insight.prioritizedActions
// insight.protection
// insight.delight
// insight.somatic

const modified = bth.applyInsights(response, insight, maxActions);
```

### Frontend EQ

```typescript
import { ferni } from '@ferni/ui/better-than-human';

ferni.playMicroExpression('recognition');
ferni.startActiveListening();
ferni.onUserSpeechPause(pauseDuration);
ferni.setBreathSyncEnabled(true);
ferni.analyzeConcern({ transcript, voiceStrain });
ferni.anticipateEmotion({ transcript, tone, energy });
```

---

## Testing

```bash
# Run all superhuman tests
npm run test -- src/tests/superhuman-intelligence.test.ts
npm run test -- src/tests/superhuman-betterthan-human.test.ts

# 55+ tests covering:
# - Concern detection
# - Proactive memory
# - Predictive anticipation
# - Better Than Human 12 capabilities
# - Integration flows
```

---

## Files

```
src/conversation/
├── concern-detection.ts          # Unified concern detection
├── proactive-memory.ts           # Proactive memory surfacing
├── predictive-anticipation.ts    # Predictive anticipation
├── superhuman-intelligence.ts    # Main orchestrator
├── humanizer.ts                  # Integration point
└── superhuman/
    ├── index.ts                  # Better Than Human exports
    ├── types.ts                  # Type definitions
    ├── orchestrator.ts           # BTH orchestrator
    ├── emotional-memory.ts       # Emotional bond tracking
    ├── anticipatory-presence.ts  # Pattern-based anticipation
    ├── linguistic-mirroring.ts   # Communication mirroring
    ├── spontaneous-delight.ts    # Delight, vulnerability, protection
    ├── evolving-jokes.ts         # Inside joke evolution
    ├── team-coherence.ts         # Cross-persona coherence
    ├── temporal-emotional.ts     # Temporal intelligence
    ├── meta-relationship.ts      # Relationship awareness
    └── superhuman-observations.ts # Pattern observations

src/services/
├── superhuman-persistence.ts     # Firestore persistence
├── superhuman-analytics.ts       # Analytics & A/B testing
└── humanization/
    └── humanization-signal-emitter.ts  # Frontend signal bridge

frontend-typescript/src/
├── services/
│   └── humanization-bridge.service.ts  # Signal handlers
└── ui/
    └── better-than-human.ui.ts   # Frontend EQ implementation
```

---

**Ferni is Better Than Human.** 🧠✨
