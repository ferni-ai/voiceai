# Shared "Better Than Human" Personality System

> **All personas now have superhuman emotional intelligence.**

Previously, only Ferni had the full "Better Than Human" personality system. Now ALL personas (Maya, Peter, Alex, Jordan, Nayan) leverage the same capabilities:

- **8-dimensional context sensing**
- **Real-time noticing** (pauses, energy shifts, topic deflection)
- **Cross-session resonance learning**
- **Dynamic expression composition**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        turn-personality.ts                           │
│  Routes to Ferni's system OR shared "Better Than Human" system       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ▼                                           ▼
┌─────────────────────────┐             ┌─────────────────────────────┐
│ Ferni Personality       │             │ Shared Personality          │
│ (personality-           │             │ (shared-personality-        │
│  integration.ts)        │             │  integration.ts)            │
└─────────────────────────┘             └─────────────────────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          │                       │                       │
                          ▼                       ▼                       ▼
                ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
                │ Context          │    │ Real-Time        │    │ Resonance        │
                │ Assembler        │    │ Noticing         │    │ Store            │
                │ (8 dimensions)   │    │ (pause, energy)  │    │ (cross-session)  │
                └──────────────────┘    └──────────────────┘    └──────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │ Persona          │
                │ Building Blocks  │
                │ (passions,       │
                │  opinions,       │
                │  quirks, etc.)   │
                └──────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/agents/voice-agent/turn-personality.ts` | Main router - routes to Ferni or shared system |
| `src/personas/shared/shared-personality-integration.ts` | Entry point for shared system |
| `src/personas/shared/personality-context-assembler.ts` | Gathers 8-dimensional context |
| `src/personas/shared/realtime-noticing.ts` | Detects subtle conversational cues |
| `src/personas/shared/personality-resonance-store.ts` | Cross-session learning |
| `src/personas/shared/better-than-human-personality.ts` | Expression composition |
| `src/personas/shared/persona-building-blocks.ts` | Per-persona passions, opinions, quirks |

---

## 8-Dimensional Context Sensing

Every turn, we assemble context across 8 dimensions:

| Dimension | What We Sense | Example |
|-----------|---------------|---------|
| **Temporal** | Time of day, day of week, season | "It's late night on a Tuesday" |
| **Emotional** | Current emotion, trajectory, distress | "Rising anxiety, 0.7 intensity" |
| **Conversational** | Momentum, topic, turn count | "Intimate momentum, discussing work" |
| **Relational** | Stage, shared vulnerabilities, history | "Friend stage, 5 vulnerabilities shared" |
| **Prosodic** | Speech pace, pauses, energy | "Slow pace, 2s pause, low energy" |
| **Topical** | Current topic, shift detection | "Shifted from 'work' to 'family'" |
| **Behavioral** | What user just shared, personal sharing | "User shared a win" |
| **Learned** | Cross-session resonance profile | "User responds well to humor" |

---

## Real-Time Noticing

We detect subtle cues humans often miss:

| Type | Detection | Example Acknowledgment |
|------|-----------|------------------------|
| `significant_pause` | > 2 seconds before speaking | "You took a moment there..." |
| `energy_drop` | Voice arousal decreased | "Something shifted..." |
| `energy_rise` | Voice arousal increased | "I can hear the change in you" |
| `mismatch` | Voice vs text emotion differ | "Your voice says something different" |
| `topic_deflection` | Changed topic when emotional | "I notice we moved away from..." |
| `speech_rate_change` | Sudden faster/slower | "You're speaking differently" |
| `repeated_theme` | Topic keeps returning | "This keeps coming up..." |
| `protective_language` | "I'm fine", "it's nothing" | "When you say you're fine..." |
| `breakthrough_moment` | Positive shift detected | "Something just clicked" |

### Persona-Aware Acknowledgments

Each persona has their own voice for noticing:

- **Maya**: "I noticed something there. Want to explore it?"
- **Peter**: "That pause tells me there's more here."
- **Nayan**: "Sometimes the silence speaks louder than words."

---

## Cross-Session Resonance Learning

We learn what works for each user:

```typescript
interface UserResonanceProfile {
  resonantThemes: ThemeCategory[];      // What lands well
  avoidThemes: ThemeCategory[];         // What falls flat
  connectionPoints: string[];           // Personal details they liked
  comfortWithVulnerability: 'low' | 'medium' | 'high';
  preferredExpressionLength: 'brief' | 'medium' | 'detailed';
  userMentionedTopics: string[];        // For natural callbacks
}
```

### Engagement Detection

After an expression, we analyze the user's response:

- **Positive**: "I love that!", "haha", "yes exactly", "me too"
- **Negative**: "anyway...", "let's move on", "sure"
- **Neutral**: Short ambiguous responses

---

## Persona Building Blocks

Each persona has unique content for expressions:

```typescript
interface PersonaBuildingBlocks {
  passions: PersonaPassion[];           // What excites them
  opinions: PersonaOpinion[];           // Perspectives they share
  quirks: PersonaQuirk[];               // Unique traits
  locations: LocationFragments;         // Physical grounding
  vulnerabilities: PersonaVulnerability[];  // Authentic struggles
  familyFragments: string[];            // Family mentions
  warmDrinks: string[];                 // Drink preferences
  topicConnections: Record<string, string[]>;  // Topic → expressions
  temporalPhrases?: { ... };            // Time-specific expressions
}
```

### Example: Maya's Building Blocks

```typescript
{
  passions: [
    { topic: 'habit_systems', expression: 'I get excited about systems that actually stick' },
    { topic: 'morning_routines', expression: 'Mornings are sacred to me' },
  ],
  vulnerabilities: [
    { trigger: 'perfection_pressure', expression: 'I used to think I had to be perfect' },
  ],
  warmDrinks: ['herbal tea', 'warm water with lemon'],
}
```

---

## Integration with Turn Handler

The `turn-personality.ts` routes based on persona:

```typescript
export async function processPersonality(ctx: PersonalityContext) {
  if (ctx.personaId === 'ferni') {
    return processFerniPersonality(ctx);  // Ferni's original system
  }
  return processSharedPersonality(ctx);   // Shared "Better Than Human" system
}
```

Inside `processSharedPersonality`:

1. Check if persona has building blocks
2. Prewarm resonance cache (first turn)
3. Record resonance from previous expression
4. Record user topic mentions
5. Assemble 8-dimensional context
6. Check for real-time noticing (priority 1)
7. If noticing, return acknowledgment
8. Check expression cooldown
9. Compose expression using building blocks
10. Return injection content

---

## Testing

```bash
# Run all shared personality tests (103 tests)
pnpm vitest run src/personas/shared/__tests__/

# Run specific test files
pnpm vitest run src/personas/shared/__tests__/shared-personality-integration.test.ts
pnpm vitest run src/personas/shared/__tests__/realtime-noticing.test.ts
pnpm vitest run src/personas/shared/__tests__/personality-resonance-store.test.ts
pnpm vitest run src/personas/shared/__tests__/personality-pipeline-e2e.test.ts
```

---

## Adding a New Persona

1. Add building blocks to `persona-building-blocks.ts`:

```typescript
const NEW_PERSONA_BLOCKS: PersonaBuildingBlocks = {
  passions: [/* ... */],
  opinions: [/* ... */],
  // ...
};

// Add to export
export const PERSONA_BUILDING_BLOCKS = {
  // ...
  'new-persona-id': NEW_PERSONA_BLOCKS,
};
```

2. Add noticing acknowledgments to `realtime-noticing.ts`:

```typescript
const PERSONA_ACKNOWLEDGMENTS = {
  // ...
  'new-persona-id': {
    significant_pause: ['Your acknowledgment here...'],
    // ...
  },
};
```

3. The system will automatically include the new persona in the shared pipeline.

---

## Performance Considerations

- **Resonance cache** is prewarmed on session start
- **Noticing is throttled** (max once per 4 turns, max 3 per session)
- **Expression cooldown** prevents over-injection (3 turn minimum)
- **Firestore writes are debounced** (5 second delay)

---

## Debugging

Enable debug logs:

```typescript
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'shared-personality-integration' });
// or
const log = createLogger({ module: 'shared-realtime-noticing' });
```

Key log signatures:
- `🔍 Noticing detected for shared personality` - Noticing triggered
- `🎭 Expression composed for shared personality` - Expression generated
- `Persona has no building blocks, skipping personality` - Missing blocks

---

*Last updated: December 2024*

