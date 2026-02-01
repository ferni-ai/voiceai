# Superhuman Communication Tools

> **"Better than Human"** - 10 communication capabilities no human friend can match.

This module gives Alex superhuman communication intelligence, fulfilling Ferni's core promise.

## 🦸 The 10 Capabilities

| # | Tool | File | What No Human Can Do |
|---|------|------|---------------------|
| 1 | **Communication Archaeology** | `communication-archaeology.ts` | Perfect recall of every conversation mentioned |
| 2 | **Relationship Temperature** | `relationship-temperature.ts` | Track gradual drift before they notice |
| 3 | **Unsaid Words Detector** | `unsaid-words-detector.ts` | Notice what they DON'T say |
| 4 | **Reception Predictor** | `reception-predictor.ts` | Predict how messages will land |
| 5 | **Apology Effectiveness** | `apology-effectiveness.ts` | Learn what apology style works per person |
| 6 | **Conflict Replay** | `conflict-replay.ts` | Objectively analyze conflicts |
| 7 | **Communication Debt** | `communication-debt.ts` | Track ALL communication obligations |
| 8 | **Third-Party Perspective** | `third-party-perspective.ts` | Truly neutral viewpoints (no bias) |
| 9 | **Strategic Silence** | `strategic-silence.ts` | Know when NOT to communicate |
| 10 | **Unspoken Needs** | `unspoken-needs.ts` | Surface underlying needs from complaints |

## 📁 File Structure

```
superhuman-tools/
├── types.ts                     # Shared TypeScript types
├── communication-archaeology.ts # Tool 1: Perfect recall
├── relationship-temperature.ts  # Tool 2: Relationship health tracking
├── unsaid-words-detector.ts     # Tool 3: Deflection patterns
├── reception-predictor.ts       # Tool 4: Message reception prediction
├── apology-effectiveness.ts     # Tool 5: Apology learning
├── conflict-replay.ts           # Tool 6: Conflict analysis
├── communication-debt.ts        # Tool 7: Obligation tracking
├── third-party-perspective.ts   # Tool 8: Neutral viewpoints
├── strategic-silence.ts         # Tool 9: Timing intelligence
├── unspoken-needs.ts            # Tool 10: Need translation
├── llm-tools.ts                 # LLM-callable tool definitions
├── index.ts                     # Unified exports
├── CLAUDE.md                    # This file
└── (no __tests__/ directory - tests live in parent domain or E2E suites)
```

## 🔌 Integration Points

### 1. Context Builder Integration
Alex's context builder automatically injects superhuman insights:

```typescript
// In alex-communication-insights/superhuman-context.ts
import { buildSuperhumanCommunicationContext } from '../../../../tools/domains/communication/superhuman-tools/index.js';

const context = await buildSuperhumanCommunicationContext(userId, {
  includeAll: true,
  contactName: mentionedPerson,
});
```

### 2. LLM Tool Integration
Alex can actively USE these capabilities when users ask:

```typescript
// In llm-tools.ts
import { createSuperhumanCommunicationTools } from './llm-tools.js';

const tools = createSuperhumanCommunicationTools(ctx);
// tools.recallConversation, tools.checkRelationshipHealth, etc.
```

### 3. Real-Time Processing
User transcripts are processed for pattern detection:

```typescript
import { processTranscriptForSuperhuman } from './superhuman-context.js';

// Called on each turn
await processTranscriptForSuperhuman(userId, transcript);
```

## 🗄️ Data Storage

All data is stored in Firestore under `bogle_users/{userId}/`:

| Collection | What It Stores |
|------------|----------------|
| `communication_events` | Past conversations mentioned |
| `communication_profiles` | Per-contact communication patterns |
| `relationship_temperatures` | Relationship health over time |
| `unsaid_topics` | Avoided/deflected topics |
| `apology_records` | Apology outcomes per contact |
| `conflict_records` | Conflict analysis and patterns |
| `communication_debts` | Unreturned calls, unanswered texts |
| `silence_records` | Response timing outcomes |
| `unspoken_needs` | Detected underlying needs |

## 🎯 LLM Tools Available

| Tool Name | When Alex Uses It |
|-----------|------------------|
| `recallConversation` | "What did I tell you about my talk with mom?" |
| `checkRelationshipHealth` | "How are things with Sarah?" |
| `getRelationshipsNeedingAttention` | "Who should I check in with?" |
| `predictMessageReception` | "How will this sound to my boss?" |
| `getApologyAdvice` | "How should I apologize to Lisa?" |
| `analyzeConflict` | "Let's analyze that fight with my brother" |
| `getCommunicationDebts` | "Who do I owe a call back to?" |
| `markCommunicationDone` | "I called dad back" |
| `getObjectivePerspective` | "Am I being unreasonable about this?" |
| `shouldISendThis` | "Should I send this text?" |
| `holdMessageForLater` | "Hold this until tomorrow" |
| `translateMyNeed` | "She never listens to me!" |
| `whatAmIAvoiding` | "What am I not dealing with?" |

## 🧪 Usage Examples

### Building Context for LLM
```typescript
import { buildSuperhumanCommunicationContext } from './index.js';

const context = await buildSuperhumanCommunicationContext(userId, {
  includeAll: true,
  contactName: 'Sarah',
  maxLength: 2500
});
// Returns formatted context string for LLM injection
```

### Recording a Communication Event
```typescript
import { communicationArchaeology } from './index.js';

await communicationArchaeology.recordEvent(userId, {
  type: 'mentioned',
  contactName: 'Dad',
  summary: 'Talked about money, he got defensive',
  topics: ['money', 'finances'],
  sentiment: -0.3,
  emotionalWeight: 0.7,
  occurredAt: Date.now(),
});
```

### Checking Relationship Health
```typescript
import { relationshipTemperature } from './index.js';

const temp = await relationshipTemperature.get(userId, 'Sarah');
// Returns: { currentTemperature: 65, trend: 'cooling', alerts: [...] }
```

### Predicting Message Reception
```typescript
import { receptionPredictor } from './index.js';

const prediction = await receptionPredictor.predict(
  userId,
  "You never listen to me!",
  'Sarah'
);
// Returns: { predictedReception: 'defensive', warningFlags: [...], suggestedRewording: '...' }
```

## ✅ Code Review Checklist

When modifying these tools:

- [ ] All data persists to Firestore (not just in-memory)
- [ ] Context builders return reasonable-length strings (<3KB)
- [ ] LLM tools have clear, descriptive names and descriptions
- [ ] Pattern detection has reasonable thresholds (avoid false positives)
- [ ] Uses `createLogger()` from utils (not console.log)
- [ ] Handles missing data gracefully (returns helpful messages)
- [ ] Updates relationship temperature when conversations are mentioned
- [ ] Session data is persisted when session ends

## 🔗 Related Files

- `src/intelligence/context-builders/personas/alex-communication-insights/` - Alex's context builder
- `src/services/superhuman/commitment-keeper.ts` - Similar pattern for commitments
- `src/services/superhuman/README.md` - Superhuman services documentation
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - Brand philosophy

## 💡 Design Philosophy

These tools embody the "Better than Human" promise:

1. **Perfect Memory** - We never forget what they told us
2. **Pattern Recognition** - We see trends humans miss
3. **No Judgment** - Neutral analysis without ego
4. **Proactive Care** - Surface issues before they escalate
5. **Learning** - Get better with each interaction

Every capability should pass the test: *"Can a human friend do this consistently?"* If yes, it's not superhuman enough.
