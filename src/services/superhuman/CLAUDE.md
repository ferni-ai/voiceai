# Superhuman Services

> **"Better Than Human" capabilities - what makes Ferni genuinely superior to human support.**

These services implement capabilities that no human friend can match: perfect memory, constant availability, pattern recognition across months of conversations, and proactive support without burnout.

---

## Philosophy

Superhuman isn't about artificial intelligence - it's about leveraging technology to provide support that's **literally impossible** for humans:

- A friend who **never forgets** a promise you made
- Someone who **notices patterns** in your behavior over months
- Support that's **always available** at 2am without resentment
- Tracking of **every relationship** in your life without mental load

---

## Service Categories

### Core 10 (Original "Better Than Human")

| Service | File | Human Limitation Overcome |
|---------|------|---------------------------|
| **Commitment Keeper** | `commitment-keeper.ts` | Friends forget promises |
| **Predictive Coaching** | `predictive-coaching.ts` | Can't see patterns objectively |
| **Life Narrative** | `life-narrative.ts` | Hard to maintain perspective |
| **Values Alignment** | `values-alignment.ts` | Friends avoid confrontation |
| **Emotional First Aid** | `emotional-first-aid.ts` | Takes time to respond |
| **Relationship Network** | `relationship-network.ts` | Can't track everyone |
| **Capacity Guardian** | `capacity-guardian.ts` | Often too late for burnout |
| **Dream Keeper** | `dream-keeper.ts` | Dreams get buried |
| **Relationship Milestones** | `relationship-milestones.ts` | Forgets anniversaries |
| **Seasonal Awareness** | `seasonal-awareness.ts` | Doesn't track cycles |

### Extended Capabilities (70+ files across 3 subdirectories)

| Category | Key Services | Purpose |
|----------|-------------|---------|
| **Planning** | `anticipatory-planning.ts`, `planning-coordination.ts` | Proactive preparation |
| **Events** | `event-pattern-memory.ts`, `event-story-capture.ts`, `post-event-learning.ts` | Life event tracking |
| **Emotional** | `emotional-vocabulary.ts`, `energy-wave-mapping.ts`, `voice-biomarkers.ts` | Deep emotional support |
| **Social** | `guest-intelligence.ts`, `conflict-resolution-memory.ts`, `social-battery.ts` | Relationship intelligence |
| **Integration** | `commitment-calendar-integration.ts`, `calendar-prep-coaching.ts` | Cross-system coordination |
| **Celebration** | `celebration-balance.ts`, `milestone-calendar-coordinator.ts` | Joy amplification |
| **Intelligence** | `semantic-intelligence/`, `insight-generation/` | Deep semantic analysis |
| **Habits** | `habit-economics.ts`, `habit-optimization-engine.ts`, `biometric-habit-intelligence.ts` | Habit intelligence |
| **Life Modeling** | `life-trajectory-engine.ts`, `future-self.ts`, `developmental-stage-awareness.ts` | Life trajectory |

---

## Architecture

```
src/services/superhuman/
├── index.ts                         # Unified exports + context builders
├── types.ts                         # Shared type definitions
├── firestore-utils.ts               # Persistence helpers
├── README.md                        # Detailed service documentation
├── health-check.ts                  # Superhuman service health checks
│
├── # Core 10 Services
├── commitment-keeper.ts             # Promise tracking
├── commitment-keeper-e2e.ts         # E2E validation for commitments
├── predictive-coaching.ts           # Pattern recognition
├── life-narrative.ts                # Story threading
├── values-alignment.ts              # Values detection
├── emotional-first-aid.ts           # Crisis response
├── relationship-network.ts          # People tracking
├── capacity-guardian.ts             # Burnout prevention
├── dream-keeper.ts                  # Aspirations
├── relationship-milestones.ts       # Anniversary tracking
├── seasonal-awareness.ts            # Cyclical patterns
│
├── # Extended Services (55+ files)
├── anticipatory-planning.ts         # Proactive preparation
├── biometric-habit-intelligence.ts  # Biometric-informed habits
├── calendar-prep-coaching.ts        # Calendar-aware coaching
├── causal-inference-engine.ts       # Causal reasoning
├── celebration-balance.ts           # Joy amplification
├── commitment-calendar-integration.ts # Cross-system coordination
├── communication-intelligence-engine.ts # Communication patterns
├── compound-effects.ts              # Compound growth tracking
├── conflict-resolution-memory.ts    # Conflict pattern memory
├── contemplative-intelligence.ts    # Reflective insights
├── contradiction-comfort.ts         # Holding contradictions
├── cross-domain-synthesis.ts        # Cross-domain pattern synthesis
├── developmental-stage-awareness.ts # Life stage awareness
├── emotional-vocabulary.ts          # Emotional language support
├── energy-wave-mapping.ts           # Energy pattern mapping
├── event-intelligence-services.ts   # Event pattern analysis
├── event-pattern-memory.ts          # Event memory
├── event-story-capture.ts           # Event storytelling
├── financial-pattern-intelligence.ts # Financial patterns
├── future-self.ts                   # Future self visualization
├── guest-intelligence.ts            # Guest/social intelligence
├── habit-economics.ts               # Habit cost-benefit analysis
├── habit-intelligence-services.ts   # Habit pattern services
├── habit-optimization-engine.ts     # Habit optimization
├── inside-joke-memory.ts            # Inside joke tracking
├── life-trajectory-engine.ts        # Life trajectory modeling
├── life-trajectory-simulator.ts     # Life trajectory simulation
├── milestone-calendar-coordinator.ts # Milestone scheduling
├── mood-calendar.ts                 # Mood-calendar correlation
├── n1-experimentation-platform.ts   # N=1 experimentation
├── observations.ts                  # User observation tracking
├── orchestration-intelligence.ts    # Service orchestration
├── pattern-analytics-services.ts    # Pattern analytics
├── pattern-mirror.ts                # Pattern mirroring
├── perfect-timing.ts                # Optimal timing detection
├── persona-affinity.ts              # Persona affinity tracking
├── planning-coordination.ts         # Planning coordination
├── post-event-learning.ts           # Post-event learning
├── proactive-insight-generator.ts   # Proactive insight generation
├── proactive-milestone-detector.ts  # Milestone detection
├── protective-silence.ts            # Protective silence timing
├── recovery-tracking.ts             # Recovery pattern tracking
├── relationship-health.ts           # Relationship health scoring
├── seasonal-planning-intelligence.ts # Season-aware planning
├── silence-interpreter.ts           # Silence interpretation
├── social-battery.ts                # Social energy tracking
├── unified-user-knowledge.ts        # Unified user knowledge
├── user-corrections.ts              # User correction handling
├── voice-biomarkers.ts              # Voice biomarker analysis
├── wisdom-intelligence-services.ts  # Wisdom generation
│
├── # Subdirectories
├── insight-generation/              # Automated insight generation
│   ├── index.ts
│   ├── engine.ts                    # Insight generation engine
│   ├── types.ts                     # Insight types
│   └── generators/                  # Domain-specific generators
├── relational-memory/               # Relational memory subsystem
│   ├── index.ts
│   ├── engine.ts                    # Relational memory engine
│   ├── types.ts                     # Relational types
│   └── __tests__/
├── semantic-intelligence/           # Semantic analysis (24 files)
│   ├── index.ts
│   ├── types.ts
│   ├── integration.ts
│   ├── README.md
│   ├── advice-detector.ts           # Advice pattern detection
│   ├── advice-matcher.ts            # Advice matching
│   ├── behavioral-intelligence.ts   # Behavioral analysis
│   ├── coaching-intelligence.ts     # Coaching pattern detection
│   ├── correlation-mining.ts        # Cross-domain correlations
│   ├── counterfactual-memory.ts     # "What if" reasoning
│   ├── cross-session-threading.ts   # Cross-session threads
│   ├── emotional-semantics.ts       # Emotional semantic analysis
│   ├── emotional-trajectories.ts    # Emotional trajectory tracking
│   ├── ferni-commitments.ts         # Ferni's own commitments
│   ├── growth-fingerprint.ts        # Growth pattern fingerprint
│   ├── insight-broker.ts            # Insight brokering
│   ├── llm-detector.ts              # LLM-based detection
│   ├── open-loops.ts                # Open loop tracking
│   ├── person-extractor.ts          # Person extraction from text
│   ├── relational-semantics.ts      # Relationship semantic analysis
│   ├── relationship-graph.ts        # Relationship graph building
│   ├── self-awareness.ts            # Self-awareness detection
│   ├── temporal-patterns.ts         # Temporal pattern analysis
│   └── __tests__/
│
└── __tests__/                       # Superhuman service tests
```

---

## Integration Pattern

Each service provides a `build*Context()` function for prompt injection:

```typescript
import {
  buildCommitmentContext,
  buildCapacityContext,
  buildDreamContext,
} from '../services/superhuman/index.js';

// In context builder or turn handler
const superhumanContext = await Promise.all([
  buildCommitmentContext(userId),
  buildCapacityContext(userId),
  buildDreamContext(userId),
]);
```

---

## Context Building

All services follow this pattern:

```typescript
// 1. Load user data from Firestore
const data = await loadUserCommitments(userId);

// 2. Analyze for relevant insights
const pending = data.filter(c => c.status === 'pending');

// 3. Format for prompt injection
return formatCommitmentsForPrompt(pending);
```

---

## Firestore Structure

```
bogle_users/{userId}/
├── commitments/           # Commitment Keeper
├── patterns/              # Predictive Coaching
├── life_chapters/         # Life Narrative
├── values/                # Values Alignment
├── network/               # Relationship Network
├── capacity/              # Capacity Guardian
├── dreams/                # Dream Keeper
├── milestones/            # Relationship Milestones
└── seasonal/              # Seasonal Awareness
```

---

## Adding a New Superhuman Service

1. Create `src/services/superhuman/{service-name}.ts`
2. Implement:
   - `detect{Thing}()` - Detect from user input
   - `record{Thing}()` - Save to Firestore
   - `load{Thing}()` - Load from Firestore
   - `build{Thing}Context()` - Format for prompts
3. Export from `index.ts`
4. Add context builder call in `superhuman-integration.ts`

### Template

```typescript
import { getFirestoreDb } from './firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'my-superhuman-service' });

export interface MyData {
  userId: string;
  content: string;
  createdAt: string;
}

export async function detectMyThing(text: string): Promise<boolean> {
  // Detection logic
}

export async function recordMyThing(userId: string, data: MyData): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection('bogle_users').doc(userId)
    .collection('my_things').add(data);
}

export async function loadMyThings(userId: string): Promise<MyData[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const snapshot = await db.collection('bogle_users').doc(userId)
    .collection('my_things').get();

  return snapshot.docs.map(doc => doc.data() as MyData);
}

export async function buildMyThingContext(userId: string): Promise<string> {
  const things = await loadMyThings(userId);
  if (things.length === 0) return '';

  return `## User's Things\n${things.map(t => `- ${t.content}`).join('\n')}`;
}
```

---

## Rules

### Do
- Return empty string from context builders when no data
- Use `getFirestoreDb()` for safe Firestore access
- Keep detection functions lightweight (run on every turn)
- Format context for LLM consumption (markdown)
- Handle missing data gracefully

### Don't
- Import from agents/ or api/ (architecture violation)
- Throw errors to callers (return empty/default)
- Store session state in module variables (use Firestore)
- Create services that overlap with existing ones
- Make detection functions async-heavy

---

## Testing

```bash
# Run all superhuman service tests
pnpm vitest run src/services/superhuman/__tests__/

# Run specific service tests
pnpm vitest run commitment-keeper

# Integration tests (requires Firestore emulator)
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run superhuman
```

---

## Performance Notes

- Context builders run in parallel via `Promise.all()`
- Firestore reads are cached per-session
- Detection functions should complete in <10ms
- Heavy analysis is deferred to background tasks

---

## Related Documentation

- `README.md` - Detailed service descriptions
- `../../CLAUDE.md` - Main project documentation
- `../CLAUDE.md` - Services layer patterns
- `../../conversation/superhuman/CLAUDE.md` - Conversational features
- `../../intelligence/context-builders/superhuman/` - Context builder integration

---

*Last updated: January 2026*
