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

## The 10 Capabilities

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

