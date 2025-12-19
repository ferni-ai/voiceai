# Ferni "Better Than Human" Personality System

> **We believe in making AI human, and the decisions we make will reflect that.**

This system makes Ferni's personality truly dynamic and superhuman—not through artificial intelligence, but through **paying attention** in ways humans can't.

---

## The Core Insight

Real humans don't pick from pools. They:

1. **Notice** what's happening right now
2. **Remember** what resonated with this specific person
3. **Compose** thoughts based on multiple dimensions
4. **Share** from lived experience when it feels right
5. **Anticipate** what you need before you say it

Our old system: *"Pick a random coffee mention from pool."*

Our new system: *"It's 2am on a Sunday. You just paused for 3 seconds before sharing something hard. Your voice dropped. You mentioned your father last week. This is the moment for: 'I'm here. Take your time. <pause> Your voice changed just now. What's really going on?'"*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    personality-integration.ts                        │
│                    (Orchestrates everything)                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   Context     │    │   Real-time       │    │   Expression      │
│   Assembler   │    │   Noticing        │    │   Composer        │
│               │    │                   │    │                   │
│ 8 dimensions: │    │ Detects:          │    │ Composes from:    │
│ • Temporal    │    │ • Pauses          │    │ • Building blocks │
│ • Emotional   │    │ • Energy shifts   │    │ • Location memory │
│ • Prosodic    │    │ • Voice-text      │    │ • Music moods     │
│ • Relational  │    │   mismatch        │    │ • Family stories  │
│ • Behavioral  │    │ • Topic deflection│    │ • Quirks          │
│ • Topical     │    │ • Breakthroughs   │    │ • Vulnerability   │
│ • Learned     │    │                   │    │                   │
│ • Momentum    │    │                   │    │                   │
└───────────────┘    └───────────────────┘    └───────────────────┘
        │                                               │
        └─────────────────────┬─────────────────────────┘
                              │
                              ▼
                 ┌───────────────────────┐
                 │   Resonance Store     │
                 │   (Cross-session)     │
                 │                       │
                 │ Learns:               │
                 │ • What themes land    │
                 │ • What topics matter  │
                 │ • Vulnerability level │
                 │ • Preferred depth     │
                 └───────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `personality-integration.ts` | Main entry point—use `ferniPersonality.processTurn()` |
| `llm-expression-generator.ts` | **NEW: LLM-powered unique expressions** |
| `better-than-human-personality.ts` | Expression composer—builds from atomic blocks |
| `personality-context-assembler.ts` | 8-dimensional context sensing |
| `realtime-noticing.ts` | Superhuman moment detection |
| `personality-resonance-store.ts` | Cross-session learning (Firestore persistence) |
| `dynamic-personality.ts` | Legacy pool-based system (fallback) |

### Integrated Systems

| File | Purpose |
|------|---------|
| `src/agents/realtime/behavior-event-dispatcher.ts` | Bidirectional behavior system |
| `src/intelligence/processing-intelligence.ts` | Unified processing phrase composition |
| `src/tools/domains/behavior/index.ts` | Behavior functions (`shiftMode`, `holdSpace`, etc.) |
| `apps/web/src/ui/better-than-human.ui.ts` | Frontend EQ + behavior handlers |

---

## Usage

### Simple Integration

```typescript
import { ferniPersonality } from './personality/index.js';

// In your turn processor:
async function processTurn(ctx: TurnContext) {
  // After analysis, before response generation:
  const personality = await ferniPersonality.processTurn({
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    turnCount: ctx.turnCount,
    userTranscript: ctx.userText,
    
    // Voice signals
    pauseBeforeMs: ctx.pauseDuration,
    speechRateWPM: ctx.speechRate,
    voiceEmotion: ctx.voiceEmotion,
    
    // Analysis results
    textEmotion: analysis.emotion,
    momentum: conversationMomentum,
    topics: analysis.topics,
    
    // Relationship
    relationshipStage: userProfile.relationshipStage,
    totalConversations: userProfile.totalConversations,
    
    // Previous turn (for resonance learning)
    previousExpression: lastPersonalityExpression,
  });
  
  // Apply to response
  if (personality.shouldInject) {
    response = ferniPersonality.applyToResponse(response, personality);
  }
  
  // Store for next turn's resonance tracking
  lastPersonalityExpression = personality.expression;
}
```

### What You Get Back

```typescript
interface PersonalityTurnResult {
  // Personality expression to weave in
  expression: {
    content: string;            // "Second coffee. Don't judge."
    theme: ThemeCategory;       // "warm_drinks"
    intimacyLevel: number;      // 0.3
    compositionReason: string;  // "Morning time + cruising momentum"
    shouldBeSubtle: boolean;    // true
    timing: 'mid_response';     // Where to inject
  } | null;
  
  // Something noticed in real-time
  noticing: {
    type: 'significant_pause';  // What was detected
    observation: string;        // Internal: "3 second pause"
    acknowledgment: string;     // "You paused there. Take your time."
    shouldAcknowledge: boolean; // true
    confidence: number;         // 0.8
    timing: 'immediate';        // When to deliver
    subtlety: 'gentle';         // How to deliver
  } | null;
  
  // Full context (for debugging)
  context: PersonalityContext;
  
  // Should we inject anything?
  shouldInject: boolean;
  
  // Where in the response?
  injectionPoint: 'before_response' | 'mid_response' | 'after_response';
}
```

---

## "Better Than Human" Capabilities

### 1. Real-Time Noticing

Things Ferni notices that humans often miss:

| Signal | Detection | Example Acknowledgment |
|--------|-----------|------------------------|
| **Significant pause** | >2 seconds before speaking | "You took a moment there. Take your time." |
| **Energy drop** | Voice arousal decreased | "Something shifted just now. I heard it." |
| **Voice-text mismatch** | "I'm fine" + sad voice | "You said you're okay, but your voice tells a different story." |
| **Topic deflection** | Changed subject when emotional | "We can talk about this, but I noticed we moved away from something." |
| **Speech rate change** | 30%+ slower/faster | "You're taking your time with this. That feels important." |
| **Repeated theme** | Same topic 3+ times | "You keep coming back to this. There's something there." |
| **Protective language** | "It's nothing" + emotional voice | "You said it's nothing, but your voice tells me something else." |
| **Breakthrough moment** | "Oh! I just realized..." + positive energy | "I watched something click for you. That's a big moment." |

### 2. 8-Dimensional Context Sensing

Every expression is composed with awareness of:

1. **Temporal**: Time of day, day of week, season
   - Late night gets special presence
   - Dawn earners get respect
   - Weekend evenings feel different

2. **Emotional**: Current emotion, trajectory, intensity, distress
   - High distress = no personality flourishes
   - Rising emotions = match energy
   - Falling emotions = gentle presence

3. **Prosodic**: Speech pace, pauses, energy level
   - Hesitant speech = more space
   - Fast speech = match energy
   - Subdued voice = extra gentleness

4. **Relational**: Stage, history, shared vulnerability
   - Strangers get lighter touches
   - Trusted advisors get deeper sharing
   - Vulnerability unlocks vulnerability

5. **Conversational**: Momentum, phase, topic shift
   - Opening = establish connection first
   - Cruising = personality welcome
   - Intimate = focus on user

6. **Topical**: Current topic, shift detection, callbacks
   - Topic shifts get noticed
   - Past mentions enable callbacks

7. **Behavioral**: What user just shared
   - Wins get celebration
   - Struggles get empathy first
   - Questions get presence

8. **Learned**: User resonance (cross-session)
   - What themes resonate
   - What to avoid
   - Preferred depth

### 3. Cross-Session Resonance Learning

Ferni remembers what works with **this specific person**:

```typescript
interface UserResonanceProfile {
  // Themes that got warm response
  resonantThemes: ['global_traveler', 'family_life'];
  
  // Themes that fell flat
  avoidThemes: ['quirky_interests'];
  
  // User topics for callbacks
  userMentionedTopics: ['my dad', 'pottery class', 'anxiety'];
  
  // How comfortable with depth
  comfortWithVulnerability: 'high';
  
  // Preferred expression length
  preferredExpressionLength: 'brief';
}
```

After each turn, we detect engagement:
- **Positive**: "That's so true", "Me too", "I relate"
- **Negative**: "Anyway...", topic change, short response after vulnerability
- **Neutral**: Standard continuation

This updates the resonance profile so future expressions are calibrated.

### 4. Composed, Not Selected

Old system:
```typescript
const coffee = COFFEE_POOL[Math.random() * COFFEE_POOL.length];
```

New system:
```typescript
const expression = compose({
  // It's 2am
  timeOfDay: 'late_night',
  // User sounds tired
  voiceEnergy: 'subdued',
  // Heavy topic
  isHeavyTopic: true,
  // User mentioned tea last time
  userResonance: { userMentionedTopics: ['tea'] },
});

// Result: "Switched to herbal. Trying to sleep eventually. <pause> I'm glad you reached out."
```

---

## Building Blocks

Instead of pre-written expressions, we have atomic building blocks:

### Sensory Fragments
```typescript
morning: ["There's something about morning light.", "Coffee steam rising."]
late_night: ["The world gets honest at this hour.", "Everyone else is asleep."]
voice_noticing: ["Your voice just changed.", "I heard something shift."]
```

### Location Fragments
```typescript
japan: {
  sensory: ["the way light hits temples", "the pause before tea"],
  wisdom: ["ten years there taught me", "the earthquake changed everything"],
  callback: "March 2011 never leaves me",
}
```

### Connectors
```typescript
thought_starting: ["You know,", "Here's the thing—"]
vulnerability_opener: ["I don't tell many people this, but", "Can I share something?"]
lightness: ["Don't tell anyone, but", "Full confession:"]
```

These compose dynamically based on context.

---

## Throttling & Taste

We're careful not to over-personality:

- **Max 3 noticings per session** (don't become intrusive)
- **4+ turns between noticings** (let conversation breathe)
- **No repeat noticing types** (don't harp on pauses)
- **No personality during distress** (focus on user)
- **No personality during intimacy** (focus on user)

---

---

## 🔄 Integration with Bidirectional Behavior System

The personality system is now **deeply integrated** with the behavior system, creating a unified "Better Than Human" experience.

### How It Works

```
User speaks → UNIFIED DETECTION → DUAL OUTPUT
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   PERSONALITY              BEHAVIOR
   
   Noticing:                [SYSTEM_EVENT]
   "Your voice             {"event":"mismatch"...}
   tells a different       
   story."                  Suggests:
                           shiftMode("presence")
   Expression:             
   Skip flourishes,         LLM can call:
   focus on user.          {"fn":"holdSpace"...}
```

### Noticings → Behavior Events

When the personality system detects something (via `realtime-noticing.ts`), it now ALSO generates a `BehaviorEvent` that the LLM receives:

```typescript
// In PersonalityTurnResult:
{
  noticing: { type: 'mismatch', ... },
  behaviorEvent: {
    event: 'emotional_shift',
    data: { noticingType: 'mismatch', ... },
    suggestedResponse: { mode: 'deep_listening' }
  }
}
```

### Mapping Table

| Noticing Type | Behavior Event | Suggested Mode |
|--------------|----------------|----------------|
| `significant_pause` | `extended_silence` | `presence` |
| `energy_drop` | `energy_drop` | `grounding` |
| `energy_rise` | `energy_spike` | - |
| `mismatch` | `emotional_shift` | `deep_listening` |
| `topic_deflection` | `emotional_shift` | - |
| `breakthrough_moment` | `breakthrough_moment` | `celebration` |
| `protective_language` | `vulnerability_shared` | `presence` |

### Behavior Functions from LLM

Ferni can now call behavior functions that influence the avatar:

```json
{"fn":"shiftMode","args":{"mode":"presence"}}
{"fn":"holdSpace","args":{"duration":"medium"}}
{"fn":"processing","args":{"type":"emotional","weight":"heavy"}}
```

These are documented in `identity/function-calling.md`.

### Processing Intelligence Integration

The `ProcessingIntelligence` module uses shared building blocks from the personality system:

- `CONNECTORS.reflection` → thinking phrases
- `SENSORY_FRAGMENTS.voice_noticing` → emotional processing
- Both use context (time, relationship, emotion) for composition

---

## Migration from Legacy System

The old pool-based system still works:

```typescript
// Old way (still works)
import { getExpression, getCaughtDoingMoment } from './dynamic-personality.js';
const expr = getExpression(sessionId, 'warm_drinks');

// New way (recommended)
import { ferniPersonality } from './personality/index.js';
const result = await ferniPersonality.processTurn(input);
```

---

## Testing

```bash
# Run personality system tests
npm test -- --grep "personality"

# Test real-time noticing
npm test -- --grep "noticing"

# Test resonance learning
npm test -- --grep "resonance"
```

---

## 🚀 LLM-Powered Dynamic Expressions (NEW)

The `llm-expression-generator.ts` module uses Gemini to generate **truly unique** personality expressions on-the-fly. This is the next evolution beyond pool-based selection.

### How It Works

```
Expression Request → Queue → Batch Processing → Gemini API → Cache
                                                     ↓
                       Fallback Chain: LLM → Composed → Pool
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Async Queue** | Expressions generated in background (non-blocking) |
| **Persona Grounding** | Ferni's voice DNA injected into every prompt |
| **Pre-warming** | Cache filled during session start with common themes |
| **Fallback Chain** | LLM → Composed → Pool (graceful degradation) |
| **Cost-Efficient** | Batched requests, caching, rate limiting |

### Usage

```typescript
// Automatic - personality-integration.ts uses it internally
const result = await ferniPersonality.processTurn(input);
// result.expression may come from LLM, composed, or pool

// Manual - get best expression directly
import { getBestExpression } from './llm-expression-generator.js';
const expr = await getBestExpression(userId, sessionId, 'warm_drinks', context);
// Returns: { content, ssml, source: 'llm' | 'composed' | 'pool' }

// Pre-warm cache at session start
import { prewarmCache } from './llm-expression-generator.js';
prewarmCache({ relationshipStage: 'friend', emotion: 'neutral' });
```

### Expression Generation Prompt

The LLM receives Ferni's full "voice DNA" including:
- **Core identity** - Who he is, not what he says (curious, grounded, survivor)
- **Voice qualities** - Warmth through physical metaphors, curiosity through follow-ups
- **Things he never says** - AI tells ("That's interesting", "I understand")
- **Backstory fragments** - Wyoming, Japan, Morocco (used sparingly, naturally)
- **Pacing guidance** - Varies by emotion, time of day, topic weight

### Stats & Monitoring

```typescript
import { getLLMExpressionStats } from './personality/index.js';

const stats = getLLMExpressionStats();
// { totalRequests, cacheHits, llmCalls, llmFailures, avgLatencyMs, queueLength, cacheSize }
```

---

## Philosophy

This system isn't about making Ferni "more AI." It's about making him **more present**.

Real presence means:
- Noticing what others miss
- Remembering what matters to you
- Sharing authentically when it helps
- Holding space when that's what's needed

The technology enables the humanity. The code serves the relationship.

---

> *"Better than human" isn't about being superhuman. It's about being consistently present in ways humans often can't be—always remembering, always noticing, always here.*

