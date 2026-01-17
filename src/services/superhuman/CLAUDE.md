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

### Extended Capabilities (45 total services)

| Category | Services | Purpose |
|----------|----------|---------|
| **Planning** | `anticipatory-planning.ts`, `planning-coordination.ts` | Proactive preparation |
| **Events** | `event-pattern-memory.ts`, `event-story-capture.ts` | Life event tracking |
| **Emotional** | `emotional-vocabulary.ts`, `energy-wave-mapping.ts` | Deep emotional support |
| **Social** | `guest-intelligence.ts`, `conflict-resolution-memory.ts` | Relationship intelligence |
| **Integration** | `commitment-calendar-integration.ts` | Cross-system coordination |
| **Celebration** | `celebration-balance.ts`, `micro-celebrations.ts` | Joy amplification |

---

## Architecture

```
src/services/superhuman/
├── index.ts                         # Unified exports + context builders
├── types.ts                         # Shared type definitions
├── firestore-utils.ts               # Persistence helpers
├── README.md                        # Detailed service documentation
│
├── commitment-keeper.ts             # Promise tracking
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
└── [35+ additional service files]
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
