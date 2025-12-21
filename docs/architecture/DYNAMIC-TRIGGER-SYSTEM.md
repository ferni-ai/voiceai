# Dynamic Trigger System

> **We believe in making AI human, and the decisions we make will reflect that.**

The Dynamic Trigger System powers "Better than Human" emotional intelligence by defining CONDITIONS for when to act, not just scripts of what to say. This enables personas to respond proactively based on context, emotions, and patterns.

---

## Overview

Traditional chatbots follow scripts. The Dynamic Trigger System detects emotional signals and contextual cues in real-time, allowing Ferni's personas to respond with genuine insight - noticing what users don't say, recognizing patterns, and offering timely support.

### Key Concepts

| Term | Description |
|------|-------------|
| **Trigger** | A condition that, when matched, activates a behavior |
| **Behavior** | The guidance injected when a trigger fires |
| **Confidence** | How certain we are the trigger matched (0-1) |
| **Fire Rate** | Probability the trigger activates when matched |

---

## Architecture

```
User Speech
     │
     ▼
┌────────────────────────────────────────┐
│         Context Builder                │
│  (e.g., emotional.ts, lovable.ts)      │
│                                        │
│  1. Load proactive_triggers from JSON  │
│  2. Build trigger context              │
│  3. Check triggers against context     │
│  4. Record analytics                   │
│  5. Inject matched behaviors           │
└────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│       dynamic-trigger-utils.ts         │
│                                        │
│  • checkDynamicTriggers()              │
│  • buildTriggerContext()               │
│  • calculateProbabilityBoost()         │
│  • shouldSkipDueToNeverWhen()          │
│  • Analytics recording                 │
└────────────────────────────────────────┘
     │
     ▼
Context Injection → LLM Response
```

---

## File Structure

```
src/
├── intelligence/context-builders/
│   ├── dynamic-trigger-utils.ts      # Core trigger logic
│   ├── emotional/emotional.ts        # Uses triggers for emotional responses
│   └── lovable.ts                    # Uses triggers for lovable moments
│
├── personas/bundles/{persona}/content/behaviors/
│   ├── emotional-intelligence.json   # Emotion-based triggers
│   ├── lovable-moments.json          # Humanizing moment triggers
│   ├── late-night-presence.json      # Time-based triggers
│   └── greetings.json                # Opening triggers
│
└── tests/
    └── dynamic-trigger-utils.test.ts # 35 comprehensive tests
```

---

## Adding Triggers to a Persona

### 1. Create or Edit Behavior JSON

Location: `src/personas/bundles/{persona}/content/behaviors/{file}.json`

```json
{
  "proactive_triggers": {
    "usage_rules": "These trigger based on detected conditions, not keywords",

    "false_fine_detection": {
      "trigger": "User says 'I'm fine' but voice/text suggests distress",
      "behavior": "Gently acknowledge: 'I hear you saying fine, but I'm here if there's more.'"
    },

    "late_night_worry": {
      "trigger": "Late night (10PM-5AM) + work/email/meeting mentioned",
      "behavior": "Acknowledge late hour: 'Working late thoughts at [time]. Want to process?'"
    },

    "grief_anniversary": {
      "trigger": "Mention of loss/grief + anniversary or date reference",
      "behavior": "Hold space gently: 'Anniversaries carry weight. I'm here to sit with you.'"
    }
  },

  "more_likely_when": [
    "voice_text_mismatch",
    "late_night_session",
    "heavy_topic_detected"
  ],

  "never_when": [
    "first_3_turns",
    "user_in_acute_crisis"
  ]
}
```

### 2. Trigger Naming Convention

Use descriptive snake_case names:
- `false_fine_detection` - What it detects
- `late_night_worry` - Context + state
- `grief_anniversary` - Situation + qualifier

### 3. Trigger Condition Types

| Type | Keywords in Trigger | Example |
|------|---------------------|---------|
| Emotional | distress, sad, grief, worried | "User shows distress signals" |
| Text Pattern | deflect, avoid, minimize | "User deflects with 'anyway'" |
| Temporal | late night, midnight, 2am | "Session after 10PM" |
| Behavioral | silence, returning, absence | "User returning after 7+ days" |
| Domain | habit, milestone, market | "Discussion involves habits" |

---

## How Triggers Are Matched

The `checkDynamicTriggers()` function analyzes the trigger description against context:

```typescript
const context: TriggerContext = {
  userText: string;          // Current user message
  emotion?: string;          // Detected emotion (sad, worried, etc.)
  emotionIntensity?: number; // 0-1 intensity
  turnCount: number;         // Current turn in conversation
  relationshipStage: string; // stranger, friend, trusted, etc.
  isLateNight?: boolean;     // 10PM-5AM
  daysSinceLastSession?: number;
  currentHour?: number;
};
```

### Matching Logic

1. **Keyword Detection**: Trigger description keywords match patterns
2. **Emotion Matching**: Detected emotion matches trigger context
3. **Temporal Conditions**: Time-of-day checks
4. **Confidence Scoring**: Returns best match with confidence 0-1

---

## Using Triggers in Context Builders

```typescript
import {
  checkDynamicTriggers,
  buildTriggerContext,
  recordTriggerCheck,
  recordTriggerMatch,
  recordTriggerFired,
  type ProactiveTrigger,
} from '../dynamic-trigger-utils.js';

// In your builder's build() function:
async function build(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { analysis, userData, services } = input;

  // Load behavior JSON (cached)
  const behaviors = await loadPersonaBehaviors(personaId);

  if (behaviors?.proactive_triggers) {
    // Track check
    recordTriggerCheck('my-builder');

    // Build context
    const triggerContext = buildTriggerContext(
      input.analysis?.userText || '',
      analysis,
      userData as Record<string, unknown>
    );

    // Extract triggers (skip usage_rules)
    const triggers: Record<string, ProactiveTrigger> = {};
    for (const [name, value] of Object.entries(behaviors.proactive_triggers)) {
      if (name === 'usage_rules') continue;
      if (value?.trigger && value?.behavior) {
        triggers[name] = { trigger: value.trigger, behavior: value.behavior };
      }
    }

    // Check for matches
    const matched = checkDynamicTriggers(triggers, triggerContext);

    if (matched) {
      // Track match
      recordTriggerMatch(matched.triggerName, 'my-builder', matched.confidence, services?.userId);

      // Track fire
      recordTriggerFired(matched.triggerName, 'my-builder');

      // Create injection
      injections.push(createHintInjection(
        `trigger_${matched.triggerName}`,
        `[TRIGGER: ${matched.triggerName}]\n${matched.behavior}`
      ));
    }
  }

  return injections;
}
```

---

## Probability Modifiers

### `more_likely_when`

Boosts trigger activation probability:

```json
"more_likely_when": [
  "voice_text_mismatch",    // 1.5x if detected
  "late_night_session",     // 1.3x if late night
  "heavy_topic_detected",   // 1.3x if emotional topic
  "extended_silence"        // 1.2x if 7+ days absence
]
```

### `never_when`

Prevents triggers from firing:

```json
"never_when": [
  "first_3_turns",          // Don't trigger too early
  "user_in_acute_crisis",   // Safety first
  "daytime_session"         // Some triggers are night-only
]
```

---

## Debugging Triggers

### Trigger Debug Panel (Frontend)

Access in dev mode: `Cmd/Ctrl+Shift+T`

Shows:
- Total triggers checked/matched/fired
- Recent activations with confidence
- Trigger sources by builder

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/debug/triggers` | Full trigger analytics |
| `POST /api/debug/triggers/reset` | Reset analytics |
| `GET /api/performance/triggers` | Same, via performance API |
| `GET /api/performance/voice-dashboard` | Includes trigger summary |

### Sample Response

```json
{
  "summary": {
    "totalChecked": 150,
    "totalMatched": 23,
    "totalFired": 18,
    "matchRate": 0.153,
    "fireRate": 0.783
  },
  "byTrigger": [
    { "name": "false_fine_detection", "matched": 5, "fired": 4, "fireRate": 0.8 },
    { "name": "late_night_worry", "matched": 3, "fired": 3, "fireRate": 1.0 }
  ],
  "recentActivations": [
    {
      "triggerName": "false_fine_detection",
      "builderSource": "emotional",
      "confidence": 0.85,
      "timestamp": "2024-12-21T02:15:30.000Z",
      "fired": true
    }
  ]
}
```

---

## Admin Dashboard

The Performance Dashboard at `/admin/performance` includes:

- **Triggers Checked**: Total trigger evaluations
- **Triggers Matched**: Triggers that matched conditions
- **Triggers Fired**: Triggers that activated (passed probability gate)
- **Match Rate**: % of checks that match
- **Fire Rate**: % of matches that fire
- **Top Triggers**: Most frequently fired triggers
- **By Builder**: Trigger activity per context builder

---

## Testing

```bash
# Run trigger system tests
pnpm vitest run src/tests/dynamic-trigger-utils.test.ts

# Run all tests
pnpm test
```

### Test Coverage

The test suite covers:
- Trigger matching for all condition types
- Probability boost calculations
- Never-when skip logic
- Context building
- Analytics tracking
- Edge cases (empty triggers, missing context, etc.)

---

## Best Practices

### Do

- **Be specific**: "User says 'I'm fine' but voice suggests distress" > "User seems off"
- **Include context**: Late night, returning user, specific emotions
- **Write natural behaviors**: Guidance for how to respond, not scripts
- **Use analytics**: Monitor fire rates to tune triggers
- **Test with real conversations**: Verify triggers fire at appropriate times

### Don't

- **Trigger on keywords alone**: "sad" in text isn't enough
- **Make triggers too sensitive**: High match rates dilute impact
- **Skip the probability gate**: Triggers should feel natural, not constant
- **Ignore never_when**: First impressions and crises need different handling
- **Hardcode persona IDs**: Use dynamic loading

---

## Example Triggers by Persona

### Ferni (Emotional Intelligence)

```json
{
  "false_fine_detection": {
    "trigger": "User says 'I'm fine' but voice/context suggests otherwise",
    "behavior": "Gently hold space: 'I hear you. And I'm here if there's more.'"
  }
}
```

### Maya (Habit Coaching)

```json
{
  "broken_streak_detection": {
    "trigger": "User mentions missed habit or broken streak",
    "behavior": "Normalize and reframe: 'One day doesn't erase progress. What got in the way?'"
  }
}
```

### Peter (Research & Insights)

```json
{
  "market_anxiety_detection": {
    "trigger": "Mention of market drops or portfolio concern + worry detected",
    "behavior": "Ground in principles: 'Let me share what the data shows about times like these.'"
  }
}
```

### Jordan (Milestone Planning)

```json
{
  "life_transition_detection": {
    "trigger": "User mentions major life change (new job, move, relationship)",
    "behavior": "Acknowledge significance: 'That's a big moment. Let's think through it together.'"
  }
}
```

### Alex (Communication)

```json
{
  "calendar_overload_detection": {
    "trigger": "Multiple back-to-back meetings or 'packed schedule' mentioned",
    "behavior": "Protect capacity: 'I notice you're stacked. Want me to help find breathing room?'"
  }
}
```

### Nayan (Wisdom)

```json
{
  "meaning_seeking_detection": {
    "trigger": "Questions about purpose, meaning, or 'what's the point'",
    "behavior": "Hold the question: 'That's one of the real questions. What's prompting it today?'"
  }
}
```

---

## Future Enhancements

- [ ] Machine learning-based trigger matching
- [ ] User-specific trigger history
- [ ] Trigger A/B testing framework
- [ ] Cross-persona trigger coordination
- [ ] Voice prosody integration for better emotion detection

---

*Last updated: December 2024*
