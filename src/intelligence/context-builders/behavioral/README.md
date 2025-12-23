# Behavioral Context Builder System

## The Three Systems

This architecture splits context into THREE separate systems:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONTEXT BUILDING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. AWARENESS FACTS         2. BEHAVIORAL SIGNALS               │
│     (What to know)             (How to behave)                  │
│                                                                 │
│     Time: 2:17 AM              tone: 'gentle'                   │
│     User: Seth                 pace: 'slow'                     │
│     Topic: job stress          style: 'supportive'              │
│                                                                 │
│     ↓ Model READS these        ↓ Model FOLLOWS these            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  3. TOOL GUIDANCE                                               │
│     (When to query)                                             │
│                                                                 │
│     - searchMemories: "When referencing past conversations"     │
│     - getCalendar: "When they mention schedule"                 │
│     - playMusic: "When they want music"                         │
│                                                                 │
│     ↓ Model CALLS these when it needs more info                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## The Problem

Traditional context builders inject information like this:

```
[EMOTIONAL CONTEXT: User seems sad about their job loss. Acknowledge their feelings before offering advice.]
```

The LLM is told "don't speak this, just use it." But LLMs often:
1. Echo the context: "I can see from the context that you're sad..."
2. Reference the detection: "Since you mentioned feeling worried..."
3. Over-interpret: "It sounds like the job loss is really affecting you..."

This is **context leakage** - internal guidance becoming spoken output.

## The Solution: Behavioral Signals

Instead of telling the model **what to know**, we tell it **how to behave**.

### Old Approach (Leaky)

```typescript
createContextInjection(
  'emotional_context',
  `[EMOTIONAL CONTEXT: User seems ${emotion}. Be supportive.]`
);
```

### New Approach (Behavioral)

```typescript
return {
  tone: 'gentle',
  style: 'supportive',
  questionStyle: 'reflective',
  avoidances: ['giving advice before validating'],
};
```

The model receives instructions like:
- "Be gentle."
- "Validate and support."
- "If you ask anything, mirror back what they said."

**Nothing to leak** because there are no facts about the user.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Context Builder Input                    │
│  (userText, analysis, userData, persona, voiceEmotion...)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Behavioral Builders                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │  emotional   │ │   memory     │ │    distress      │   │
│  │  .behavioral │ │  .behavioral │ │   .behavioral    │   │
│  └──────────────┘ └──────────────┘ └──────────────────┘   │
│                              │                              │
│         Each returns BehavioralSignals                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Aggregator                              │
│  - Resolves conflicts (higher priority wins)                │
│  - Merges callbacks and avoidances                          │
│  - Activates special modes (crisis, presence, celebration)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Behavioral Directive                       │
│                                                             │
│  ## Response Style                                          │
│  Be gentle, subdued energy.                                 │
│  Keep slow pace, brief response.                            │
│  Focus on hearing them. Minimal output.                     │
│  No questions right now - just presence.                    │
│                                                             │
│  **Just be present. Don't fix. Don't advise.**             │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### BehavioralSignals

The structured output from a behavioral builder:

```typescript
interface BehavioralSignals {
  // Tone & Energy
  tone?: 'warm' | 'gentle' | 'grounding' | 'energetic' | 'serious' | 'playful' | 'contemplative' | 'celebratory';
  pace?: 'slow' | 'normal' | 'brisk';
  length?: 'brief' | 'moderate' | 'expansive';
  energy?: 'subdued' | 'calm' | 'warm' | 'elevated' | 'high';

  // Conversational Style
  style?: 'listening' | 'exploratory' | 'supportive' | 'directive' | 'celebratory' | 'reflective' | 'grounding' | 'collaborative';
  questionStyle?: 'none' | 'open' | 'reflective' | 'clarifying' | 'gentle-probe';

  // Callbacks (hints, not facts)
  callbacks?: CallbackSignal[];

  // Topics/approaches to avoid
  avoidances?: string[];

  // Special modes
  modes?: {
    holdingSpace?: boolean;   // Just be present
    crisisMode?: boolean;     // Safety first
    celebrationMode?: boolean; // Share in joy
    ventingMode?: boolean;    // Listen, don't solve
    processingMode?: boolean; // Minimal intervention
  };

  // Meta
  source?: string;
  confidence?: number;
  priority?: number;
}
```

### CallbackSignal

Hints about things to reference WITHOUT exposing raw facts:

```typescript
interface CallbackSignal {
  type: 'memory' | 'thread' | 'milestone' | 'pattern' | 'shared-moment' | 'growth';

  // Behavioral hint, NOT the fact itself
  // GOOD: "They shared something difficult recently. Acknowledge with care."
  // BAD: "User mentioned divorce on Dec 15th with ex-wife Sarah"
  hint: string;

  strength: 'subtle' | 'natural' | 'important';
}
```

### Priority & Conflict Resolution

When multiple builders emit conflicting signals:
1. Higher priority wins
2. Crisis mode overrides everything
3. Modes are OR'd together (any builder can activate)
4. Callbacks are merged and limited

## Migration Path

### 1. Hybrid Mode (Recommended Start)

Use `buildHybridBehavioralContext` to combine:
- New behavioral builders
- Legacy context builders (automatically translated)

```typescript
import { buildHybridBehavioralContext } from './behavioral';

// Run legacy builders
const legacyInjections = await runLegacyBuilders(input);

// Get hybrid behavioral directive
const result = await buildHybridBehavioralContext(input, legacyInjections);

// Use the directive in the prompt
const prompt = `${result.directive}\n\n${systemPrompt}`;
```

### 2. Convert Builders Gradually

Convert high-impact builders first:
1. ✅ `emotional.behavioral.ts` - Emotional state
2. ✅ `memory.behavioral.ts` - Memory callbacks
3. ✅ `distress.behavioral.ts` - Crisis detection
4. 🔲 `humanizing.behavioral.ts` - Persona mood/quirks
5. 🔲 `methodology.behavioral.ts` - Coaching approaches

### 3. Full Behavioral Mode

Once all builders are converted:

```typescript
import { buildBehavioralContext } from './behavioral';

const result = await buildBehavioralContext(input);
const prompt = `${result.directive}\n\n${systemPrompt}`;
```

## Creating a New Behavioral Builder

```typescript
// src/intelligence/context-builders/behavioral/builders/my-feature.behavioral.ts

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

async function buildMyFeatureBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis, userData, persona } = input;

  // Analyze context...
  // Return behavioral signals, NOT facts

  return {
    source: 'my-feature',
    confidence: 0.8,
    priority: 50,

    tone: 'warm',
    style: 'exploratory',

    // GOOD: Behavioral hint
    callbacks: [{
      type: 'pattern',
      hint: 'They seem interested in exploring this further.',
      strength: 'natural',
    }],

    // BAD: Would be a fact leak
    // callbacks: [{
    //   hint: 'They asked about hiking last Tuesday at 3pm',
    // }],
  };
}

registerBehavioralBuilder({
  name: 'my-feature',
  description: 'What this builder does',
  priority: 50, // 0=runs first, 100=runs last
  category: 'category-name',
  build: buildMyFeatureBehavior,
});
```

## Testing

```typescript
import { buildBehavioralContext } from './behavioral';
import { createMockInput } from './test-utils';

describe('Behavioral Context', () => {
  it('should not leak emotional facts', async () => {
    const input = createMockInput({
      userText: "I'm feeling really anxious about the interview",
      analysis: {
        emotion: { primary: 'anxious', intensity: 0.8 }
      }
    });

    const result = await buildBehavioralContext(input);

    // Directive should NOT contain raw facts
    expect(result.directive).not.toMatch(/anxious/i);
    expect(result.directive).not.toMatch(/interview/i);

    // Directive SHOULD contain behavioral guidance
    expect(result.directive).toMatch(/grounding/i);
    expect(result.directive).toMatch(/supportive/i);
  });

  it('should activate crisis mode for distress', async () => {
    const input = createMockInput({
      userText: "I can't take it anymore",
      analysis: {
        emotion: { distressLevel: 0.9 }
      }
    });

    const result = await buildBehavioralContext(input);

    expect(result.behavior.modes.crisisMode).toBe(true);
    expect(result.behavior.questionStyle).toBe('none');
  });
});
```

## Key Files

| File | Purpose |
|------|---------|
| `signals.ts` | Type definitions for behavioral signals |
| `aggregator.ts` | Combines signals from multiple builders |
| `translator.ts` | Converts legacy context → behavioral signals |
| `orchestrator.ts` | Runs all builders, produces final directive |
| `awareness.ts` | Facts the model should know (time, user, session) |
| `tool-guidance.ts` | When to call tools for more information |
| `integration.ts` | Combines all three systems |
| `builders/*.behavioral.ts` | Individual behavioral builders |

## Awareness Facts (What to Know)

Unlike behavioral signals (which guide behavior), awareness facts are things
the model SHOULD read and use. They're not "stage directions" - they're knowledge.

```typescript
import { buildAwarenessFacts, formatAwarenessFacts } from './behavioral';

const facts = await buildAwarenessFacts(input);
// {
//   currentTime: '2:17 AM',
//   timeOfDay: 'late_night',
//   userName: 'Seth',
//   turnCount: 5,
//   sessionDuration: '12 minutes',
//   currentTopic: 'job search',
//   activeGoals: ['find new job', 'exercise more']
// }

const formatted = formatAwarenessFacts(facts);
// ## Current Awareness
// **Time:** 2:17 AM (Tuesday)
// **Talking to:** Seth
// **This conversation:** Turn 5, 12 minutes
// **Current topic:** job search
// **Working on:** find new job, exercise more
```

## Tool Guidance (When to Query)

Instead of pre-loading all possible data (which leaks), we tell the model
WHAT tools are available and WHEN to use them. The model asks for data
when it needs it.

```typescript
import { getAvailableTools, formatToolGuidance, suggestTools } from './behavioral';

const tools = await getAvailableTools(input);
// Returns available tools based on user's connected integrations

const formatted = formatToolGuidance(tools);
// ## Available Tools
// Call these tools to get information rather than guessing:
//
// ### Memory & History
// - **searchMemories**: Search past conversations and learned facts
//   *Use when:* When you want to reference something from previous conversations
//
// ### Calendar
// - **getCalendar**: View their schedule for today or upcoming days
//   *Use when:* When they mention meetings, schedule, or being busy

// Get proactive tool suggestions based on user's message
const suggestions = suggestTools(input, tools);
// Returns CallbackSignals like:
// "They referenced the past. Consider calling searchMemories."
```

## Why This Works

1. **Nothing to leak**: The directive contains behavioral instructions, not facts
2. **Explicit behavior**: Model knows exactly HOW to behave
3. **Priority resolution**: Crisis mode automatically overrides everything
4. **Gradual migration**: Hybrid mode allows incremental conversion
5. **Testable**: Can verify directives don't contain sensitive info

