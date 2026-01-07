# Unified Intelligence Architecture

> **"Ferni doesn't just have data. Ferni understands."**

**Status: ✅ IMPLEMENTED** (January 2026)

This document maps the complete intelligence ecosystem and how all components work together.

## Quick Start

```typescript
import {
  initIntelligenceSession,
  getIntelligenceForTurn,
  recordDomainSignal,
  markInsightSurfaced,
} from './intelligence/index.js';

// At session start
initIntelligenceSession(userId);

// Each turn - get everything Ferni needs
const intelligence = await getIntelligenceForTurn(userId, {
  moment: 'session_start', // or 'natural_pause', 'topic_relevant'
  voiceEmotion: { primary: 'anxious', energy: 0.3 },
  recentTopics: ['work stress', 'sleep'],
});

// Use in prompt
systemPrompt += intelligence.formattedContext;

// Check for proactive insight
if (intelligence.proactiveInsights.length > 0) {
  const insight = intelligence.proactiveInsights[0];
  // Surface it to user, then:
  markInsightSurfaced(userId, insight.id);
}

// Record signals for correlation learning
recordDomainSignal(userId, {
  domain: 'sleep',
  store: 'conversation',
  metric: 'quality',
  direction: 'decreased',
  magnitude: 'moderate',
  timestamp: new Date(),
});
```

---

## The Complete Intelligence Map

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER CONVERSATION                                        │
│    Voice Input → Audio Analysis → Transcription → Turn Processing → Voice Output            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              REAL-TIME INTELLIGENCE LAYER                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ Voice Emotion    │  │ Intent           │  │ Topic            │  │ Turn             │    │
│  │ Detection        │  │ Classification   │  │ Tracking         │  │ Prediction       │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
        ┌──────────────────────────────────┼──────────────────────────────────┐
        ▼                                  ▼                                  ▼
┌───────────────────────┐  ┌───────────────────────────────────┐  ┌───────────────────────┐
│  UNIFIED INTELLIGENCE │  │    SUPERHUMAN SERVICES (19+)      │  │  SEMANTIC INTELLIGENCE │
│  (NEW - Level 2-5)    │  │    "Better Than Human"            │  │  (V3 System)          │
│  ─────────────────────│  │  ─────────────────────────────────│  │  ─────────────────────│
│  • Context Assembler  │  │  • Commitment Keeper              │  │  • Correlation Mining │
│  • Cross-Domain       │  │  • Predictive Coaching            │  │  • Emotional Trajectory│
│  • Proactive Engine   │  │  • Life Narrative                 │  │  • Threading Context  │
│  • Temporal Patterns  │  │  • Values Alignment               │  │  • Relational Network │
│                       │  │  • Capacity Guardian              │  │  • Open Loops         │
│  Owns: Timing,        │  │  • Dream Keeper                   │  │  • Counterfactual     │
│  Surfacing, Priority  │  │  • +13 more                       │  │  • Insight Broker     │
└───────────────────────┘  └───────────────────────────────────┘  └───────────────────────┘
        │                                  │                                  │
        └──────────────────────────────────┼──────────────────────────────────┘
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              COLLECTIVE LEARNING LAYER                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ Individual       │  │ Community        │  │ Agent            │  │ Capability       │    │
│  │ Learning         │  │ Insights         │  │ Evolution        │  │ Learning         │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DATA FOUNDATION                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ 98 Entity Types  │  │ Domain Stores    │  │ Semantic Memory  │  │ Firestore        │    │
│  │ (data-layer/     │  │ (stores/)        │  │ (memory/)        │  │ Persistence      │    │
│  │  types.ts)       │  │                  │  │                  │  │                  │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Ownership

| Component | Owner Module | Status | Purpose |
|-----------|-------------|--------|---------|
| **Context Assembly** | `intelligence/context-assembler.ts` | ✅ Implemented | Knows what matters RIGHT NOW |
| **Cross-Domain Correlation** | `intelligence/patterns/cross-domain-correlator.ts` | ✅ Implemented | Connects dots humans miss |
| **Proactive Surfacing** | `intelligence/proactive/proactive-engine.ts` | ✅ Implemented | Decides WHEN to share insights |
| **Superhuman Services** | `services/superhuman/` | 19 "Better Than Human" capabilities |
| **Semantic Intelligence** | `services/superhuman/semantic-intelligence/` | V3 AI understanding |
| **Predictive Intelligence** | `intelligence/predictive/` | Multi-signal prediction fusion |
| **Collective Learning** | `intelligence/collective-learning-integration.ts` | Cross-user patterns |
| **Data Layer** | `services/data-layer/` | 98 entity types, unified access |
| **Trust Systems** | `services/trust-systems/` | Relationship building |

---

## Data Flow: Single Turn

```
1. VOICE INPUT
   └─→ Audio prosody analysis (emotion, energy, stress)
   └─→ Transcription

2. REAL-TIME ANALYSIS (parallel)
   ├─→ Voice emotion → MoodState, energy level
   ├─→ Intent classification → topic, goal
   ├─→ Turn prediction → expected response patterns
   └─→ Semantic intelligence → correlations, trajectories

3. CONTEXT ASSEMBLY (NEW - unified)
   └─→ getIntelligenceForTurn(userId, {
         moment: 'natural_pause',
         voiceEmotion: voiceEmotionResult
       })
   └─→ Returns: {
         context: ContextWindow,      // What matters now
         correlations: CrossDomainCorrelation[], // Patterns detected
         proactiveInsights: ProactiveInsight[]   // Ready to surface
       }

4. SUPERHUMAN CONTEXT
   └─→ buildSuperhumanContext(userId, {
         voiceEmotion, calendarEvents, transcript, ...
       })
   └─→ Returns: 19 capability contexts formatted for LLM

5. LLM CONTEXT INJECTION
   └─→ Prioritize by: Safety > Emotional > Time-Sensitive > Relationship > Growth
   └─→ Inject into system prompt
   └─→ Include proactive insight if timing is right

6. GENERATE RESPONSE
   └─→ LLM produces response
   └─→ Apply persona voice
   └─→ TTS generation

7. LEARNING (async, fire-and-forget)
   ├─→ Record domain signals → cross-domain correlator
   ├─→ Process semantic intelligence → correlation mining
   ├─→ Update individual learning → user preferences
   └─→ Contribute to community insights → anonymous aggregation
```

---

## Integration Points

### 1. Turn Handler Integration

```typescript
// In turn-handler.ts

import { getIntelligenceForTurn, initIntelligenceSession } from '../intelligence/index.js';
import { buildSuperhumanContext } from '../services/superhuman/index.js';
import { processSemanticIntelligence } from '../services/superhuman/semantic-intelligence/integration.js';

// At session start
initIntelligenceSession(userId);

// Each turn
const [intelligence, superhuman] = await Promise.all([
  getIntelligenceForTurn(userId, {
    moment: isFirstTurn ? 'session_start' : 'natural_pause',
    voiceEmotion: voiceEmotionResult,
  }),
  buildSuperhumanContext(userId, {
    currentVoiceBiomarkers: voiceBiomarkers,
    currentTranscript: transcript,
    currentTopics: detectedTopics,
    currentEmotion: emotion,
  }),
]);

// Check for proactive insight to surface
if (intelligence.proactiveInsights.length > 0) {
  const insight = intelligence.proactiveInsights[0];
  if (insight.surfaceMoment === 'session_start' && isFirstTurn) {
    // Inject opener insight
    additionalContext.push(insight.message);
    markInsightSurfaced(userId, insight.id);
  }
}

// Fire-and-forget learning
void processSemanticIntelligence({
  userId,
  userText: transcript,
  topic: detectedTopics[0],
  textEmotion: emotion,
});
```

### 2. Cross-Domain Signal Recording

```typescript
// In domain stores (e.g., productivity-store.ts)

import { recordDomainSignal } from '../intelligence/index.js';

setHabit(userId, habit) {
  // ... save habit ...
  
  // Record signal for correlation detection
  recordDomainSignal(userId, {
    domain: 'habit',
    store: 'productivity',
    metric: habit.name,
    direction: habit.completed ? 'completed' : 'missed',
    magnitude: 'moderate',
    timestamp: new Date(),
  });
}
```

### 3. Superhuman Service Integration

The new intelligence layer enhances superhuman services:

```typescript
// In superhuman/predictive-coaching.ts

import { getCrossCorrelator } from '../../intelligence/index.js';

export async function buildPredictiveContextString(userId: string): Promise<string> {
  // Existing prediction logic...
  const predictions = await generatePredictions(userId);
  
  // NEW: Enhance with cross-domain correlations
  const correlations = getCrossCorrelator().getCorrelations(userId, {
    minConfidence: 'likely',
  });
  
  // Merge correlation insights into predictions
  for (const corr of correlations) {
    if (corr.surfaceStrategy === 'proactively') {
      predictions.push({
        type: 'correlation',
        insight: corr.insight,
        suggestion: corr.suggestion,
      });
    }
  }
  
  return formatPredictionsForPrompt(predictions);
}
```

### 4. Context Builder Integration

```typescript
// In context-builders/superhuman/superhuman-integration.ts

import { assembleContext, selectContextForTurn } from '../../intelligence/index.js';

export async function buildEnhancedSuperhuman(
  userId: string,
  personaId: string
): Promise<string> {
  // Assemble unified context
  const context = await assembleContext(userId);
  
  // Select what's relevant for this moment
  const prioritized = selectContextForTurn(context, '', persona);
  
  // Build superhuman context
  const superhuman = await buildSuperhumanContext(userId);
  
  // Merge and format
  return formatForPersona(prioritized, superhuman, personaId);
}
```

---

## Capability Matrix

| Capability | Source Module | Feeds Into | Output |
|------------|---------------|------------|--------|
| **Perfect Memory** | data-layer, stores | Context Assembler | Relevant past context |
| **Emotional Awareness** | voice-emotion, prosody | Proactive Engine | Mood-aware responses |
| **Pattern Detection** | cross-domain-correlator | Superhuman context | "I noticed..." insights |
| **Predictive Coaching** | predictive-coaching.ts | LLM context | Anticipatory guidance |
| **Proactive Surfacing** | proactive-engine.ts | Turn handler | Timely insights |
| **Values Alignment** | values-alignment.ts | LLM context | Gentle confrontation |
| **Commitment Tracking** | commitment-keeper.ts | Proactive Engine | Follow-up reminders |
| **Relationship Network** | relationship-network.ts | Context Assembler | Social awareness |
| **Capacity Monitoring** | capacity-guardian.ts | Proactive Engine | Burnout prevention |
| **Collective Learning** | community-insights.ts | All personas | What works for everyone |

---

## Proactive Intelligence Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROACTIVE TRIGGER CHECK                      │
│                                                                 │
│  Session Start?  ─────────────────────────────────────────────┐ │
│       │                                                       │ │
│       ▼                                                       │ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │ Late Night  │  │ Commitment  │  │ Habit       │           │ │
│  │ Check       │  │ Deadline    │  │ Struggle    │           │ │
│  │ Priority: 1 │  │ Priority: 3 │  │ Priority: 5 │           │ │
│  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│                                                               │ │
│  Natural Pause?  ────────────────────────────────────────────┘ │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Overwhelm   │  │ Pattern     │  │ Celebration │             │
│  │ Detection   │  │ Observation │  │ Milestone   │             │
│  │ Priority: 2 │  │ Priority: 6 │  │ Priority: 7 │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  Topic Relevant?  ─────────────────────────────────────────────┐│
│       │                                                        ││
│       ▼                                                        ││
│  ┌─────────────┐  ┌─────────────┐                             ││
│  │ Cross-Domain│  │ Inside Joke │                             ││
│  │ Correlation │  │ Callback    │                             ││
│  │ Priority: 6 │  │ Priority: 9 │                             ││
│  └─────────────┘  └─────────────┘                             ││
│                                                                ││
└────────────────────────────────────────────────────────────────┘│
                              │                                   │
                              ▼                                   │
┌─────────────────────────────────────────────────────────────────┐
│                    PRIORITIZE & LIMIT                           │
│                                                                 │
│  • Max 2 per session                                            │
│  • Cooldown periods honored                                     │
│  • Trust level requirements checked                             │
│  • User preference learning applied                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SURFACE INSIGHT                              │
│                                                                 │
│  "Hey, I noticed you haven't journaled since your breakup..."   │
│  "Wait - did you realize you just hit 30 days?"                 │
│  "Your sleep has been off since the work stress started..."     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Learning Feedback Loop

```
User Conversation
        │
        ▼
┌───────────────────┐
│ Record Signals    │──────────────────────────────────────────┐
│ (turn-learning)   │                                          │
└───────────────────┘                                          │
        │                                                      │
        ▼                                                      ▼
┌───────────────────┐                              ┌───────────────────┐
│ Individual Learn  │──────► User Profile          │ Cross-Domain      │
│ (preferences)     │                              │ Correlator        │
└───────────────────┘                              └───────────────────┘
        │                                                      │
        ▼                                                      ▼
┌───────────────────┐                              ┌───────────────────┐
│ Community         │◄─────── Anonymized ─────────►│ Pattern           │
│ Insights          │         Aggregation          │ Detection         │
└───────────────────┘                              └───────────────────┘
        │                                                      │
        ▼                                                      ▼
┌───────────────────┐                              ┌───────────────────┐
│ Agent Evolution   │──────► Prompt Updates        │ Proactive         │
│ (self-improve)    │                              │ Surfacing         │
└───────────────────┘                              └───────────────────┘
        │                                                      │
        └──────────────────────────────────────────────────────┘
                              │
                              ▼
                    Better responses for ALL users
```

---

## The "Better Than Human" Differentiators

| What Humans Can't Do | How Ferni Does It |
|---------------------|-------------------|
| Remember every detail | 98 entity types + semantic memory |
| Track patterns objectively | Cross-domain correlation engine |
| Be available 24/7 | Always present, same warmth at 2am |
| See across life domains | Unified context assembler |
| Never have bad days | Consistent emotional availability |
| Know optimal timing | Proactive engine + receptivity detection |
| Learn from everyone | Collective learning (anonymous) |
| Predict struggles | Predictive coaching + temporal patterns |
| Hold contradictions | Contradiction comfort service |
| Read between lines | Voice mismatch detection |

---

## Key Files Reference

| Layer | File | Status | Purpose |
|-------|------|--------|---------|
| **Unified Entry** | `intelligence/index.ts` | ✅ | All exports |
| **Unified API** | `intelligence/unified-intelligence-api.ts` | ✅ | Single entry point for all intelligence |
| **Context Assembly** | `intelligence/context-assembler.ts` | ✅ | What matters now |
| **Cross-Domain** | `intelligence/patterns/cross-domain-correlator.ts` | ✅ | Pattern connections |
| **Proactive** | `intelligence/proactive/proactive-engine.ts` | ✅ | Timing decisions |
| **Superhuman** | `services/superhuman/index.ts` | 19 capabilities |
| **Semantic V3** | `services/superhuman/semantic-intelligence/index.ts` | AI understanding |
| **Predictions** | `intelligence/predictive/index.ts` | Multi-signal fusion |
| **Collective** | `intelligence/collective-learning-integration.ts` | Cross-user learning |
| **Data Layer** | `services/data-layer/index.ts` | 98 entity types |
| **Turn Handler** | `agents/voice-agent/turn-handler.ts` | Orchestration point |

---

## Quick Start: Adding Intelligence

### 1. Surface a Proactive Insight

```typescript
import { checkProactiveTriggers, markInsightSurfaced } from './intelligence/index.js';

const insights = checkProactiveTriggers(context, 'session_start');
if (insights[0]) {
  surfaceToUser(insights[0].message);
  markInsightSurfaced(userId, insights[0].id);
}
```

### 2. Record a Cross-Domain Signal

```typescript
import { recordDomainSignal } from './intelligence/index.js';

recordDomainSignal(userId, {
  domain: 'sleep_pattern',
  store: 'health',
  metric: 'quality',
  direction: 'decreased',
  magnitude: 'moderate',
  timestamp: new Date(),
});
```

### 3. Get Full Context for LLM

```typescript
import { getIntelligenceForTurn } from './intelligence/index.js';
import { buildSuperhumanContext } from './services/superhuman/index.js';

const [intelligence, superhuman] = await Promise.all([
  getIntelligenceForTurn(userId, { moment: 'natural_pause' }),
  buildSuperhumanContext(userId),
]);
```

---

*"Ferni doesn't just remember. Ferni understands. And understanding is better than human."*
