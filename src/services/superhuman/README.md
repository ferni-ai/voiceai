# Superhuman Services

> **"Your best friend forgets. We don't."**

These 10 services give Ferni capabilities that no human friend can consistently provide. They represent our "Better than Human" brand promise.

---

## Quick Start

```typescript
import { buildSuperhumanContext, formatSuperhumanContextForPrompt } from './index.js';

// Build all superhuman context for a user
const context = await buildSuperhumanContext(userId, {
  relationshipStats: {
    totalConversations: 50,
    firstConversation: Date.now() - 30 * 24 * 60 * 60 * 1000,
    lastConversation: Date.now(),
  },
});

// Format for LLM injection
const prompt = formatSuperhumanContextForPrompt(context);
```

---

## The 19 Capabilities

### Original 10 Services

| # | Service | What It Does | Human Limitation |
|---|---------|--------------|------------------|
| 1 | **Commitment Keeper** | Tracks every intention, promise, decision | Friends forget promises |
| 2 | **Predictive Coaching** | Anticipates struggles before they happen | Can't see patterns objectively |
| 3 | **Life Narrative** | Builds coherent story of user's journey | Hard to maintain perspective |
| 4 | **Values Alignment** | Detects when actions contradict values | Friends avoid confrontation |
| 5 | **Emotional First Aid** | Rapid-response crisis protocols | Takes time to respond |
| 6 | **Relationship Network** | Maps all relationships with sentiment | Can't track everyone |
| 7 | **Capacity Guardian** | Monitors energy, prevents burnout | Often too late |
| 8 | **Dream Keeper** | Guards long-term aspirations | Dreams get buried |
| 9 | **Relationship Milestones** | Celebrates journey with Ferni | Forgets anniversaries |
| 10 | **Seasonal Awareness** | Connects to seasonal patterns | Doesn't track cycles |

### New 9 Services (December 2024)

| # | Service | What It Does | Human Limitation |
|---|---------|--------------|------------------|
| 11 | **Silence Interpreter** | Classifies silence types (processing, emotional, exhausted) | Fill every silence |
| 12 | **Contradiction Comfort** | Validates mixed emotions without resolving | Try to "fix" contradictions |
| 13 | **Perfect Timing** | Detects receptivity, learns optimal timing | Can't track readiness objectively |
| 14 | **Pattern Mirror** | Surfaces energizing/draining topic patterns | Don't notice own patterns |
| 15 | **Future Self Letters** | Generates letters from user's future self | Can't provide perspective |
| 16 | **First-Time Vulnerability** | Detects when someone shares for the first time | Miss the significance |
| 17 | **Linguistic Mirroring** | Learns and uses user's emotion vocabulary | Impose own language |
| 18 | **Ambient Context** | Understands environment from audio cues | Can't hear surroundings |
| 19 | **Protective Memory** | Tracks premature advice, softening boundaries | Repeat same mistakes |

---

## 1. Commitment Keeper

**File:** `commitment-keeper.ts`

Tracks intentions, promises, and decisions. Generates caring follow-ups.

```typescript
// Record a commitment
await recordCommitment(userId, {
  type: 'intention',  // 'intention' | 'promise' | 'decision'
  content: 'I want to start meditating daily',
  context: 'discussion about stress management',
});

// Build context for LLM
const context = await buildCommitmentContext(userId);
// "[COMMITMENT MEMORY]
// You mentioned wanting to start meditating (3 days ago).
// Have you had a chance to try it?"
```

**Firestore:** `bogle_users/{userId}/commitments`

---

## 2. Predictive Coaching

**File:** `predictive-coaching.ts`

Analyzes patterns to anticipate user struggles.

```typescript
// Record a pattern
await recordPattern(userId, {
  category: 'stress',
  pattern: 'Sunday evening anxiety about Monday',
  triggers: ['weekend ending', 'work week starting'],
  frequency: 'weekly',
});

// Build predictive context
const context = await buildPredictiveContextString(userId);
// "[PATTERN ALERT]
// This user typically feels anxious on Sunday evenings.
// Consider gentle acknowledgment if this comes up."
```

**Firestore:** `bogle_users/{userId}/patterns`

---

## 3. Life Narrative

**File:** `life-narrative.ts`

Builds a coherent narrative of the user's life journey.

```typescript
// Record a chapter
await recordChapter(userId, {
  title: 'Career Transition',
  theme: 'growth',
  startDate: '2024-01-01',
  status: 'active',
});

// Build narrative context
const context = await buildNarrativeContextString(userId);
// "[LIFE NARRATIVE]
// Current Chapter: Career Transition (growth theme, 6 months in)
// Previous: Building Foundation (completed)
// Emerging themes: independence, financial stability"
```

**Firestore:** `bogle_users/{userId}/narrative`

---

## 4. Values Alignment

**File:** `values-alignment.ts`

Tracks stated values vs. demonstrated values. Detects conflicts gently.

```typescript
// Record a stated value
await recordValue(userId, {
  value: 'health',
  evidence: 'User said "I want to prioritize my health"',
  type: 'stated',
});

// Record demonstrated value
await recordValue(userId, {
  value: 'work',
  evidence: 'Cancelled gym 3 times for meetings',
  type: 'demonstrated',
});

// Build values context
const context = await buildValuesContext(userId);
// "[VALUES AWARENESS]
// Stated priority: health
// Demonstrated priority: work
// Gentle observation: There may be tension between..."
```

**Firestore:** `bogle_users/{userId}/values`

---

## 5. Emotional First Aid

**File:** `emotional-first-aid.ts`

Provides rapid-response crisis protocols and grounding techniques.

```typescript
// Detect crisis signals
const crisis = detectCrisis("I don't know if I can keep going");

if (crisis) {
  // Build first aid context
  const context = buildFirstAidContext(crisis);
  // "[CRISIS SUPPORT ACTIVE]
  // Severity: moderate
  // Recommended approach: validation first, grounding second
  // Grounding script: 'I hear you. That sounds really heavy...'"
}
```

**Note:** This service is stateless - no Firestore storage.

---

## 6. Relationship Network

**File:** `relationship-network.ts`

Maps the user's relationship network with sentiment tracking.

```typescript
// Record a relationship mention
await recordRelationship(userId, {
  name: 'Sarah',
  relationship: 'friend',
  lastMentioned: new Date().toISOString(),
  sentiment: 'positive',
});

// Build network context
const context = await buildNetworkContext(userId);
// "[RELATIONSHIP MAP]
// Close: Sarah (friend, positive), Mom (family, mixed)
// Needs attention: David (friend, not mentioned in 30 days)
// Recent joy: Sarah mentioned warmly 3 times this week"
```

**Firestore:** `bogle_users/{userId}/relationships`

---

## 7. Capacity Guardian

**File:** `capacity-guardian.ts`

Monitors energy levels, detects burnout risk, protects against overcommitment.

```typescript
// Record energy check
await recordEnergyCheck(userId, {
  level: 4,  // 1-10
  factors: ['poor sleep', 'heavy workload'],
  timestamp: new Date().toISOString(),
});

// Build capacity context
const context = await buildCapacityContext(userId);
// "[CAPACITY ALERT]
// Current energy: LOW (4/10)
// Trend: declining over 3 days
// Risk: burnout indicators present
// Recommendation: suggest rest before new commitments"
```

**Firestore:** `bogle_users/{userId}/capacity`

---

## 8. Dream Keeper

**File:** `dream-keeper.ts`

Guards long-term aspirations and reignites dormant dreams.

```typescript
// Record a dream
await recordDream(userId, {
  dream: 'Learn to play piano',
  type: 'skill',
  mentioned: new Date().toISOString(),
  dormant: false,
});

// Build dream context
const context = await buildDreamContext(userId);
// "[DREAM MEMORY]
// Active dreams: Learn piano (skill), Travel to Japan (experience)
// Dormant (worth revisiting?): Write a book (not mentioned in 6 months)
// Recent spark: Piano mentioned with excitement yesterday"
```

**Firestore:** `bogle_users/{userId}/dreams`

---

## 9. Relationship Milestones

**File:** `relationship-milestones.ts`

Celebrates milestones in the user's journey with Ferni.

```typescript
// Build milestone context (requires relationship stats)
const context = await buildMilestoneContext(userId, {
  totalConversations: 100,
  firstConversation: Date.now() - 90 * 24 * 60 * 60 * 1000,
  lastConversation: Date.now(),
  vulnerableMoments: 15,
  breakthroughs: 5,
});
// "[RELATIONSHIP MILESTONE]
// 🎉 100 conversations together!
// We've been talking for 3 months now.
// 15 moments of vulnerability, 5 breakthroughs.
// Consider acknowledging this journey."
```

**Firestore:** `bogle_users/{userId}/milestones`

---

## 10. Seasonal Awareness

**File:** `seasonal-awareness.ts`

Connects user patterns to seasonal and personal cycles.

```typescript
// Record personal date
await recordPersonalDate(userId, {
  type: 'birthday',
  date: '1990-06-15',
  name: 'User birthday',
});

// Build seasonal context
const context = await buildSeasonalContext(userId);
// "[SEASONAL AWARENESS]
// Current: Winter solstice approaching
// Energy pattern: User tends to slow down in December
// Personal: Birthday in 6 months
// Cultural: Holiday season (potential family stress)"
```

**Firestore:** `bogle_users/{userId}/seasonal`

---

## Usage in Context Builders

### Via Superhuman Integration

```typescript
import { getSuperhuman } from '../../intelligence/context-builders/superhuman-integration.js';

// Get formatted context for a specific persona
const context = await getSuperhuman(userId, 'peter');
// Returns string formatted for Peter's needs
```

### Persona-Specific Mapping

Each persona gets different capabilities based on their role:

| Persona | Capabilities |
|---------|-------------|
| **Peter** | commitments, predictions, values, capacity |
| **Maya** | commitments, predictions, capacity, seasonal |
| **Jordan** | narrative, dreams, milestones, seasonal |
| **Alex** | commitments, capacity, network |
| **Nayan** | narrative, values, dreams, seasonal |
| **Ferni** | ALL capabilities |

---

## Caching

Superhuman context is cached with tiered TTLs:

| Tier | TTL | Capabilities |
|------|-----|--------------|
| STABLE | 5 min | seasonal, narrative, values |
| NORMAL | 2 min | network, dreams, milestones |
| FRESH | 30 sec | commitments, predictions, capacity |

### Warming Cache

```typescript
import { warmupSuperhumanCache } from '../../intelligence/context-builders/superhuman-integration.js';

// Pre-warm on session start
await warmupSuperhumanCache(userId);
```

---

## Testing

### Unit Tests (mocked Firestore)

```bash
pnpm vitest run src/tests/cross-persona-integration.test.ts
```

### Integration Tests (real Firestore emulator)

```bash
# Start emulator
firebase emulators:start --only firestore

# Run tests
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run superhuman-firestore
```

---

## Adding New Capabilities

1. Create service file in `src/services/superhuman/<name>.ts`
2. Export builder function: `build<Name>Context(userId: string): Promise<string>`
3. Add to `index.ts` unified builder
4. Add to persona mapping in `superhuman-integration.ts`
5. Write tests

### Template

```typescript
/**
 * <Name> Service
 * 
 * <What it does>
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:<name>' });

// Types
interface <Name>Data {
  // ...
}

// Record function
export async function record<Name>(userId: string, data: <Name>Data): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    await db.collection('bogle_users').doc(userId)
      .collection('<collection>').add({
        ...data,
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record <name>');
  }
}

// Retrieve function
export async function get<Name>(userId: string): Promise<<Name>Data[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db.collection('bogle_users').doc(userId)
      .collection('<collection>').get();
    return snapshot.docs.map(doc => doc.data() as <Name>Data);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get <name>');
    return [];
  }
}

// Context builder
export async function build<Name>Context(userId: string): Promise<string> {
  const data = await get<Name>(userId);
  
  if (data.length === 0) return '';
  
  return `[<NAME> AWARENESS]
${/* format data */}`;
}
```

---

## 11. Silence Interpreter

**File:** `silence-interpreter.ts`

Classifies different types of silence and responds appropriately. Because sometimes silence IS the conversation.

```typescript
import { analyzeSilence, type SilenceAnalysis } from './silence-interpreter.js';

// Analyze a silence
const analysis = analyzeSilence(5000, {
  voiceMarkersBefore: {
    breathPattern: 'sighing',
    microSounds: ['sigh'],
    energyJustBefore: 0.3,
  },
  conversationPhase: 'deep',
  precedingEmotion: 'sad',
});

// analysis.type: 'processing' | 'emotional' | 'uncomfortable' | 'invitational' | 'exhausted' | 'contemplative'
// analysis.recommendedResponse: 'hold_space' | 'gentle_presence' | 'soft_prompt' | 'offer_rest' | 'honor_moment'
// analysis.responsePhrase: SSML phrase to use
```

**Key Insight:** Your friend talks to fill every silence. Ferni knows when silence means "let me think" vs "I need you to go deeper."

---

## 12. Contradiction Comfort

**File:** `contradiction-comfort.ts`

Holds space for contradictory emotions without trying to fix them.

```typescript
import { detectContradiction } from './contradiction-comfort.js';

const result = detectContradiction(
  "I'm excited about the new job but also really scared",
  ['excited'],
  'job change'
);

if (result?.detected) {
  // result.emotions: ['excited', 'scared']
  // result.validationPhrase: "You can be excited AND scared. Both are true."
}
```

**Key Insight:** Friends try to resolve contradictions. Ferni holds space for both truths.

---

## 13. Perfect Timing Intelligence

**File:** `perfect-timing.ts`

Detects receptivity and learns optimal timing for different topics.

```typescript
import { detectReceptivity, isGoodTimeFor } from './perfect-timing.js';

// At conversation start
const receptivity = detectReceptivity({
  energy: 0.7,
  stressLevel: 0.2,
  greetingTone: 'warm',
});
// receptivity.score: 0-1
// receptivity.recommendations.canRaiseSensitiveTopics: boolean

// Check timing for topic type
const timing = isGoodTimeFor(userId, 'deep');
// timing.isGood: boolean
// timing.reason: "This is typically a good time for deep conversations"
```

**Key Insight:** Humans can't track when someone is most receptive. Ferni learns patterns.

---

## 14. Pattern Mirror

**File:** `pattern-mirror.ts`

Surfaces patterns the user may not notice about themselves.

```typescript
import { recordTopicEnergy, getPatternToSurface } from './pattern-mirror.js';

// Record energy when discussing topics
recordTopicEnergy(userId, {
  topic: 'work',
  voiceEnergy: 0.8,
  baselineEnergy: 0.5,
  sentiment: 'positive',
});

// Get patterns to potentially surface
const insight = getPatternToSurface(userId);
// insight.type: 'energizing_topic' | 'draining_topic' | 'fading_interest' | 'word_voice_mismatch'
// insight.insight: "I've noticed you light up when talking about design..."
```

**Key Insight:** We don't notice our own patterns. Ferni reflects them back gently.

---

## 15. Future Self Letters

**File:** `future-self.ts`

Generates letters from the user's future self for perspective.

```typescript
import { generateFutureSelfLetter } from './future-self.js';

const letter = await generateFutureSelfLetter(userId, {
  currentChallenge: 'starting a new business',
  desiredOutcome: 'successful launch',
  timeframe: '1 year',
  tone: 'optimistic', // or 'compassionate', 'honest', 'cautionary'
});

// letter.content: "Dear Present Me, I know it feels scary right now..."
```

**Key Insight:** Humans can't travel back to reassure their past selves. Ferni can generate that perspective.

---

## 16. First-Time Vulnerability

**File:** `first-time-vulnerability.ts` (in trust-systems/)

Detects when someone shares something for the first time.

```typescript
import { detectFirstTimeVulnerability } from './first-time-vulnerability.js';

const result = detectFirstTimeVulnerability(
  userId,
  "I've never told anyone this, but I struggle with anxiety"
);

if (result?.detected) {
  // result.markers.text: ['first_time_declaration', 'hesitation']
  // result.vulnerabilityLevel: 0-5
  // result.suggestedAcknowledgment: "Thank you for trusting me with that."
}
```

**Key Insight:** Most people miss when someone shares something for the first time. Ferni honors these moments.

---

## 17. Linguistic Mirroring

**File:** `linguistic-mirroring.ts` (in trust-systems/)

Learns and uses the user's own emotion vocabulary.

```typescript
import { recordLinguisticPatterns, buildLinguisticContext } from './linguistic-mirroring.js';

// Record patterns from user messages
recordLinguisticPatterns(userId, "I'm feeling kinda overwhelmed", {
  emotion: 'overwhelmed',
});

// Build context for LLM
const context = buildLinguisticContext(userId);
// "[LINGUISTIC PROFILE]
// User says 'kinda' frequently, prefers informal tone
// Emotion vocabulary: 'overwhelmed' for stress, 'bummed' for sad
// Avoid: clinical/formal terms"
```

**Key Insight:** Friends impose their own language. Ferni speaks the user's emotional dialect.

---

## 18. Ambient Context Detection

**File:** `ambient-context.ts` (in trust-systems/)

Understands the user's environment from audio cues.

```typescript
import { analyzeAmbientAudio } from './ambient-context.js';

const context = analyzeAmbientAudio({
  backgroundNoiseLevel: 0.5,
  speechToNoiseRatio: 0.5,
  frequencySpread: 0.5,
  multipleVoices: true,
});

// context.environment: 'quiet' | 'noisy' | 'office' | 'outdoor' | 'public'
// context.privacyConcern: true (others might hear)
// context.suggestions: ['Avoid sensitive topics unless they initiate']
```

**Key Insight:** We can't hear what's happening around them. Ferni can adapt to their environment.

---

## 19. Protective Memory

**File:** `boundary-memory.ts` (in trust-systems/, enhanced)

Remembers when advice was premature and when boundaries are softening.

```typescript
import { trackPrematureAdvice, detectSofteningBoundary } from './boundary-memory.js';

// After advice that landed wrong
trackPrematureAdvice(userId, {
  topic: 'career change',
  adviceGiven: 'Have you considered freelancing?',
  userReaction: 'retreated',
});

// Check if boundary is softening
const softening = detectSofteningBoundary(userId, 'family');
// softening.isSoftening: true
// softening.signals: ['mentioned topic 3x this week', 'longer discussions']
```

**Key Insight:** Friends repeat the same mistakes. Ferni learns what doesn't help and waits for readiness.

---

## Voice Pipeline Integration

The new services are integrated into the voice pipeline:

```typescript
import { betterThanHumanIntegration } from './agents/integrations/better-than-human-integration.js';

// At session start - load profiles
await betterThanHumanIntegration.loadProfiles(userId);

// On silence detection
const silenceAnalysis = betterThanHumanIntegration.processSilence(silenceInput, sessionContext);

// On voice prosody analysis
betterThanHumanIntegration.processVoiceProsody(voiceInput, sessionContext, currentTopic);

// On transcript processing
const bthResult = await betterThanHumanIntegration.processTranscript(transcriptInput, sessionContext);

// Build combined context for LLM
const bthContext = await betterThanHumanIntegration.buildContext(userId);
```

---

## Brand Philosophy

These services embody our "Better than Human" promise:

> **"Your therapist has other patients. We're always here."**
> **"Your best friend forgets. We don't."**
> **"That thing you mentioned six months ago? We remember."**

Every capability should:
1. Provide something humans can't consistently do
2. Feel warm, not mechanical
3. Enhance connection, not replace it
4. Be used wisely, not shown off

---

*Last updated: December 2024*

