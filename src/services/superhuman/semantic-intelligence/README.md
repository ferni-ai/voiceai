# Semantic Intelligence System

> **"Better than Human" v3 - Connecting dots humans can't see**

Six core superhuman capabilities plus **LLM-powered detection** using Gemini Flash 2.0 for high-accuracy pattern recognition.

---

## 🆕 LLM-Powered Detection (Dec 2024)

For edge cases that regex can't handle, we use **Gemini Flash 2.0**:

```typescript
import {
  detectAdviceWithLLM,
  extractPersonsWithLLM,
  detectAdviceHybrid,
  extractPersonsHybrid,
} from './semantic-intelligence/index.js';

// Pure LLM detection (for testing/high-accuracy needs)
const advice = await detectAdviceWithLLM('Try keeping a gratitude journal');
// → { containsAdvice: true, category: 'practical', confidence: 0.92 }

const persons = await extractPersonsWithLLM('My mom always knows what to say');
// → [{ name: 'mom', relationship: 'parent', confidence: 0.95 }]

// Hybrid: regex first, LLM for uncertain cases (recommended for production)
const adviceHybrid = await detectAdviceHybrid(text);
const personsHybrid = await extractPersonsHybrid(text);
```

**Features:**
- **Fast**: 2s timeout, ~100-200ms typical latency
- **Cached**: 5-minute LRU cache for repeated queries
- **Resilient**: Circuit breaker prevents cascade failures
- **Hybrid mode**: Regex for high-confidence, LLM for edge cases

---

## The Six Capabilities

| # | Service | What It Does | Human Limitation |
|---|---------|--------------|------------------|
| 1 | **Correlation Mining** | Cross-correlates patterns across domains | Can't track multiple domains simultaneously |
| 2 | **Emotional Trajectories** | Tracks emotional arcs over weeks/months | Only sees moments, not journeys |
| 3 | **Relational Semantics** | Knows who brings joy vs. drains energy | Doesn't track emotional impact of people |
| 4 | **Counter-Factual Memory** | Learns from paths taken/not taken | Forgets what advice was given |
| 5 | **Growth Fingerprint** | Shows how they've evolved over time | Can't see gradual change objectively |
| 6 | **Cross-Session Threading** | Finds hidden connections across sessions | Doesn't remember all past conversations |

---

## Quick Start

```typescript
import {
  recordSemanticData,
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
} from './semantic-intelligence/index.js';

// Record data after each conversation turn
await recordSemanticData(userId, {
  content: 'I feel like I\'m not good enough at work',
  topics: ['work', 'self-worth'],
  emotion: 'anxiety',
  emotionIntensity: 0.7,
  emotionValence: -0.5,
  cognitivePattern: 'catastrophizing',
  significance: 'high',
});

// Build context for LLM injection
const context = await buildSemanticIntelligenceContext(userId, {
  topics: ['work'],
  emotion: 'anxiety',
});

// Format as string for prompt
const promptAddition = formatSemanticIntelligenceContext(context);
```

---

## Individual Services

### 1. Correlation Mining

Connects dots across domains that users can't see:

```typescript
import { correlationMining } from './semantic-intelligence/index.js';

// Record observations from different domains
await correlationMining.recordObservation(userId, {
  domain: 'emotion',
  pattern: 'stress',
  context: 'Monday morning call with boss',
});

await correlationMining.recordObservation(userId, {
  domain: 'sleep',
  pattern: 'poor',
  context: 'Sunday night insomnia',
});

// System discovers: "Sunday insomnia → Monday stress"

// Get relevant correlations
const correlations = await correlationMining.getRelevantCorrelations(userId, {
  currentEmotion: 'stressed',
});
```

**Domains:** `emotion`, `topic`, `person`, `time`, `energy`, `behavior`, `sleep`, `work`, `relationship`, `health`, `goal`

---

### 2. Emotional Trajectories

Tracks emotional journeys, not just moments:

```typescript
import { emotionalTrajectories } from './semantic-intelligence/index.js';

// Record emotional waypoints over time
await emotionalTrajectories.recordWaypoint(userId, {
  emotion: 'anxiety',
  intensity: 0.6,
  valence: -0.4,
  trigger: 'career',
  context: 'Worried about promotion',
});

// Later...
await emotionalTrajectories.recordWaypoint(userId, {
  emotion: 'anxiety',
  intensity: 0.8,
  valence: -0.6,
  trigger: 'career',
  context: 'Boss gave negative feedback',
});

// System tracks: "Career anxiety building over 2 weeks, now at peak"

// Get active arcs
const arcs = await emotionalTrajectories.getActiveArcs(userId);
// => [{ theme: 'anxiety about career', phase: 'building', trend: 'rising' }]
```

**Arc Phases:** `emerging`, `building`, `peak`, `resolving`, `resolved`, `recurring`

---

### 3. Relational Semantics

Knows which people bring joy vs. drain energy:

```typescript
import { relationalSemantics } from './semantic-intelligence/index.js';

// Record person mentions with emotional context
await relationalSemantics.recordMention(userId, {
  name: 'Mom',
  relationship: 'mother',
  emotion: 'stress',
  sentiment: -0.3,
  topics: ['expectations', 'career'],
});

// Over time, system learns:
// - "Conversations about Mom correlate with stress 70% of time"
// - "Support level: draining"

// Get impactful relationships
const { energizing, draining } = await relationalSemantics.getImpactfulRelationships(userId);
```

**Support Levels:** `draining`, `neutral`, `supportive`, `energizing`

---

### 4. Counter-Factual Memory

Learns from paths taken and not taken:

```typescript
import { counterfactualMemory } from './semantic-intelligence/index.js';

// Record when advice is given
const decision = await counterfactualMemory.recordDecision(userId, {
  advice: 'Set boundaries with your manager',
  context: 'Feeling overwhelmed at work',
});

// Later, record what happened
await counterfactualMemory.recordFollowUp(userId, {
  decisionPointId: decision.id,
  pathTaken: 'ignored',
});

// Even later, record outcome
await counterfactualMemory.recordOutcome(userId, {
  decisionPointId: decision.id,
  result: 'negative',
  description: 'Burned out after 3 weeks',
});

// System learns: "When they don't set boundaries, burnout follows"

// Get pending follow-ups
const pending = await counterfactualMemory.getPendingFollowUps(userId);
```

---

### 5. Growth Fingerprint

Shows how they've evolved over time:

```typescript
import { growthFingerprint } from './semantic-intelligence/index.js';

// Record conversation data regularly
await growthFingerprint.recordData(userId, {
  topics: ['work', 'stress'],
  emotion: 'anxiety',
  messageText: 'I\'m worried about everything',
  cognitivePattern: 'catastrophizing',
});

// System tracks weekly snapshots
// After several weeks:
const fingerprint = await growthFingerprint.getFingerprint(userId);
// => {
//   growthNarrative: "Over the past 8 weeks: Your emotional vocabulary has grown.
//                     You're approaching challenges with more of a problem-solving mindset.",
//   growth: {
//     emotionalRangeGrowth: 0.15,
//     cognitiveGrowth: { problemSolvingImprovement: 0.2 }
//   }
// }

// Compare to past
const comparison = await growthFingerprint.getComparison(userId, 4); // 4 weeks ago
```

---

### 6. Cross-Session Threading

Finds hidden connections across sessions:

```typescript
import { crossSessionThreading } from './semantic-intelligence/index.js';

// Session 12
await crossSessionThreading.recordMoment(userId, {
  content: 'I feel like I\'m not good enough at work',
  emotion: 'inadequacy',
  significance: 'high',
});

// ... 35 sessions later ...

// Session 47
await crossSessionThreading.recordMoment(userId, {
  content: 'My dad always pushed perfection',
  emotion: 'resentment',
  significance: 'high',
});

// System discovers: 0.87 semantic similarity
// Connection: "perfectionism" theme spans sessions

// Get unconscious connections
const threads = await crossSessionThreading.getUnconsciousConnections(userId);
// => [{ theme: 'perfectionism & worth', userAwareness: 'unconscious' }]
```

---

## Integration with Superhuman Services

Add to the main superhuman context builder:

```typescript
// In src/services/superhuman/index.ts
import {
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
} from './semantic-intelligence/index.js';

export async function buildSuperhumanContext(userId: string, options?: {...}) {
  // ... existing code ...

  // Add semantic intelligence
  const semanticContext = await buildSemanticIntelligenceContext(userId, {
    topics: currentTopics,
    emotion: currentEmotion,
    personMentioned: currentPerson,
  });

  return {
    // ... existing context ...
    semanticIntelligence: formatSemanticIntelligenceContext(semanticContext),
  };
}
```

---

## Firestore Schema

```
bogle_users/{userId}/
├── semantic_correlations/{correlationId}  # Cross-domain patterns
├── emotional_arcs/{arcId}                 # Emotional trajectories
├── relational_nodes/{nodeId}              # People in their life
├── relational_graph/edges                 # Connections between people
├── decision_points/{decisionId}           # Advice given
├── counterfactual_patterns/{patternId}    # Learned patterns
├── semantic_intelligence/growth_fingerprint  # Growth tracking
└── semantic_threads/{threadId}            # Cross-session connections
```

---

## Testing

```bash
# Run all semantic intelligence tests
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/

# Run specific service tests
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/correlation-mining.test.ts
```

---

## V3.1 Enhancements (Dec 2024)

### Enhanced Person Extraction (`person-extractor.ts`)

NER-like person extraction that goes beyond simple regex:

```typescript
import { extractPersons, getPrimaryPerson, getPrimaryPersonName } from './semantic-intelligence/index.js';

// Extract all people mentioned
const persons = extractPersons('My mom called me and Sarah stopped by');
// => [
//   { name: 'mom', relationship: 'parent', confidence: 0.95, isProperName: false },
//   { name: 'Sarah', relationship: undefined, confidence: 0.85, isProperName: true }
// ]

// Get primary person (highest confidence)
const primary = getPrimaryPerson(text);
const name = getPrimaryPersonName(text);
```

**Features:**
- Relationship terms (my mom, my wife, boss)
- Proper names from context (Sarah called me, talked to John)
- Titles and roles (doctor, therapist, manager)
- Possessive patterns (Alex's sister, Tom and I)
- Confidence scoring

### Semantic Advice Matching (`advice-matcher.ts`)

Uses embeddings to semantically match user statements to past advice:

```typescript
import { findMatchingAdvice, precomputeAdviceEmbeddings, type PastAdvice } from './semantic-intelligence/index.js';

const pastAdvice: PastAdvice[] = [
  { id: 'advice-1', adviceText: 'Try getting more sleep', topic: 'health', timestamp: new Date() },
];

// Pre-compute embeddings for faster matching
await precomputeAdviceEmbeddings(pastAdvice);

// Find matching advice from user's response
const match = await findMatchingAdvice('I actually started sleeping more', pastAdvice);
// => { advice: {...}, similarity: 0.82, matchType: 'semantic', confidence: 0.75 }
```

**Match Types:**
- `semantic` - Embedding-based similarity matching
- `explicit` - User explicitly references advice ("you suggested...")
- `topic` - Keyword/topic overlap matching (fallback)

**Integration:**
The `detectAdviceOutcome` function in `integration.ts` now uses semantic matching instead of just matching the most recent advice.

---

---

## V3.2-V3.7 Major Expansion (Dec 26, 2024)

### V3.2 Proactive Intelligence

**Insight Broker** (`insight-broker.ts`) - Surfaces insights at the right moment:

```typescript
import { insightBroker } from './semantic-intelligence/index.js';

// Get insights to surface for current context
const insights = await insightBroker.getToSurface(userId, {
  currentTopic: 'work',
  currentPerson: 'boss',
  isSessionStart: true,
});

// Format for LLM injection
const prompt = insightBroker.format(insights);
```

**Open Loops** (`open-loops.ts`) - Tracks things needing follow-up:

```typescript
import { openLoops } from './semantic-intelligence/index.js';

// Detect intentions, concerns, life events
const detected = openLoops.detect(userText, { emotion, topic });

// Get loops ready for follow-up
const ready = await openLoops.getReadyForFollowUp(userId);
```

**Ferni Commitments** (`ferni-commitments.ts`) - Tracks Ferni's promises:

```typescript
import { ferniCommitments } from './semantic-intelligence/index.js';

// Track commitments in Ferni's response
await ferniCommitments.trackInResponse(userId, response, { topic });

// Get pending commitments
const pending = await ferniCommitments.getPending(userId);

// Get topics to avoid (she promised not to mention)
const avoid = await ferniCommitments.getAvoidanceTopics(userId);
```

---

### V3.3 Relational Network

**Relationship Graph** (`relationship-graph.ts`) - Rich people connections:

```typescript
import { relationshipGraph } from './semantic-intelligence/index.js';

// Get people by emotional impact
const { energizing, draining, neutral } = await relationshipGraph.getByImpact(userId);

// Get conflicts in their network
const conflicts = await relationshipGraph.getConflicts(userId);

// Get top supporters
const supporters = await relationshipGraph.getTopSupporters(userId);

// Format for context
const context = await relationshipGraph.format(userId, currentPerson);
```

---

### V3.4 Temporal Intelligence

**Temporal Patterns** (`temporal-patterns.ts`) - Time-based patterns:

```typescript
import { temporalPatterns } from './semantic-intelligence/index.js';

// Get hourly pattern for current time
const hourly = await temporalPatterns.getHourlyPattern(userId);

// Get day-of-week pattern
const daily = await temporalPatterns.getDayPattern(userId);

// Detect if current state is unusual
const anomaly = await temporalPatterns.detectAnomaly(userId, { emotion, energyLevel });

// Format for context
const context = await temporalPatterns.format(userId);
```

---

### V3.5 Behavioral Intelligence

**Behavioral Intelligence** (`behavioral-intelligence.ts`) - Patterns they can't see:

```typescript
import { behavioralIntelligence } from './semantic-intelligence/index.js';

// Get unsurfaced self-sabotage patterns
const patterns = await behavioralIntelligence.getUnsurfaced(userId);

// Check if current state is outside baseline
const deviation = await behavioralIntelligence.checkDeviation(userId, { valence, energy });

// Check for known triggers in text
const triggers = await behavioralIntelligence.checkTriggers(userId, userText);

// Format for context
const context = await behavioralIntelligence.format(userId);
```

---

### V3.6 Coaching Intelligence

**Coaching Intelligence** (`coaching-intelligence.ts`) - Learn how to help THIS person:

```typescript
import { coachingIntelligence } from './semantic-intelligence/index.js';

// Get best coaching approach
const approach = await coachingIntelligence.getBestApproach(userId);

// Get learning style
const style = await coachingIntelligence.getStyle(userId);

// Check if topic is sensitive
const isSensitive = await coachingIntelligence.isTopicSensitive(userId, topic);

// Get recommendations
const recommendations = await coachingIntelligence.getRecommendations(userId, topic);

// Format for context
const context = await coachingIntelligence.format(userId, topic);
```

---

### V3.7 Self-Awareness Intelligence

**Self-Awareness** (`self-awareness.ts`) - Help them see clearly:

```typescript
import { selfAwareness } from './semantic-intelligence/index.js';

// Get blind spots to surface
const blindSpots = await selfAwareness.getUnsurfaced(userId);

// Get self-perception gaps
const gaps = await selfAwareness.getGaps(userId);

// Get misaligned values
const misaligned = await selfAwareness.getMisaligned(userId);

// Detect cognitive distortions in text
const distortions = selfAwareness.detectDistortions(userText);

// Format for context
const context = await selfAwareness.format(userId);
```

---

## Updated Firestore Schema

```
bogle_users/{userId}/
├── # V3 Core
├── semantic_correlations/{id}     # Cross-domain patterns
├── emotional_arcs/{id}            # Emotional trajectories
├── relational_nodes/{id}          # People (legacy)
├── relational_graph/edges         # Connections between people
├── decision_points/{id}           # Advice given
├── counterfactual_patterns/{id}   # Learned patterns
├── semantic_intelligence/growth   # Growth tracking
├── semantic_threads/{id}          # Cross-session connections
│
├── # V3.2 Proactive Intelligence
├── proactive_insights/{id}        # Insight broker
├── open_loops/{id}                # Follow-up tracking
├── ferni_commitments/{id}         # Ferni's promises
│
├── # V3.3 Relational Network
├── relationship_nodes/{id}        # Enhanced person nodes
├── relationship_connections/{id}  # Person-to-person edges
│
├── # V3.4 Temporal Intelligence
├── temporal_snapshots/{id}        # Time-based data points
│
├── # V3.5 Behavioral Intelligence
├── sabotage_patterns/{id}         # Self-sabotage patterns
├── behavioral_intelligence/baseline
├── behavioral_triggers/{id}       # Known triggers
│
├── # V3.6 Coaching Intelligence
├── coaching_intelligence/effectiveness
├── coaching_intelligence/learning_style
├── coaching_intelligence/resistance
│
└── # V3.7 Self-Awareness
    ├── blind_spots/{id}           # Blind spots
    ├── self_perception_gaps/{id}  # Perception gaps
    ├── self_awareness/values      # Values alignment
    └── self_awareness/distortions # Cognitive patterns
```

---

## Testing

### LLM-Powered Synthetic Testing

We use LLM-powered synthetic testing to validate semantic intelligence at scale. See:
- `__tests__/semantic-intelligence-synthetic.test.ts` - Comprehensive synthetic test suite

Run synthetic tests:
```bash
# Without LLM (seed scenarios only - 38+ tests)
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/semantic-intelligence-synthetic.test.ts

# With LLM-generated scenarios (generates random realistic variations)
GOOGLE_API_KEY=xxx pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/semantic-intelligence-synthetic.test.ts
```

### What Gets Tested

| Test Suite | What It Validates |
|------------|-------------------|
| **Advice Detection** | Coaching advice identification and categorization |
| **Person Extraction** | Proper name and relationship extraction |
| **Emotional Trajectories** | Tracking emotional arcs over time |
| **Relational Semantics** | Person → emotional impact mapping |
| **Counterfactual Memory** | Advice/outcome tracking |
| **Growth Fingerprint** | Linguistic evolution detection |
| **Cross-Session Threading** | Topic connection across sessions |
| **Correlation Mining** | Cross-domain pattern detection |
| **V3.2-V3.7 Services** | Export verification for all services |
| **Stress Testing** | High-volume and concurrent operations |

### Extending Synthetic Tests

To add new test scenarios:

```typescript
const NEW_SCENARIOS = [
  {
    utterance: "User says this naturally",
    expected: { containsAdvice: true, category: 'behavioral' },
  },
];

describe('New Capability', () => {
  it.each(NEW_SCENARIOS)('should handle: "$utterance"', ({ utterance, expected }) => {
    const result = detectSomething(utterance);
    expect(result).toMatchObject(expected);
  });
});
```

### Run All Semantic Intelligence Tests

```bash
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/
```

---

## Philosophy

These capabilities embody our "Better than Human" promise:

1. **Perfect memory** - Track every observation, pattern, moment
2. **Pattern recognition** - See connections humans miss
3. **Longitudinal awareness** - See journeys, not snapshots
4. **Objective observation** - Notice growth they can't see
5. **Cross-referencing** - Connect thoughts across time
6. **Learning from history** - Remember what worked
7. **Proactive surfacing** - Know WHEN to share insights
8. **Relational intelligence** - Understand their social ecosystem
9. **Temporal awareness** - Know their rhythms and cycles
10. **Behavioral insight** - See patterns they can't
11. **Adaptive coaching** - Learn HOW to help this person
12. **Mirror clarity** - Help them see themselves clearly

**The goal:** Surface insights naturally, not mechanically. "I notice..." not "My data shows..."

---

*Last updated: December 26, 2024 (V3.7)*

