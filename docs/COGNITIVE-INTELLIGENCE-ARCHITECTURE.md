# Cognitive Intelligence Architecture

> Making each persona think differently, adapt to users, and learn over time.

## Overview

The Cognitive Intelligence System gives each Ferni persona a unique **cognitive style** - how they think, reason, and process information. This creates differentiation beyond just "what they say" to "how they think."

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COGNITIVE INTELLIGENCE STACK                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │   Persona    │    │    User      │    │   Session    │         │
│   │   Profile    │    │   Profile    │    │    State     │         │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │
│          │                   │                   │                  │
│          └───────────────────┴───────────────────┘                  │
│                              │                                      │
│                    ┌─────────▼─────────┐                           │
│                    │    Cognitive      │                           │
│                    │     Engine        │                           │
│                    └─────────┬─────────┘                           │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                 │
│          │                   │                   │                  │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐           │
│   │  Reasoning  │    │   Speech    │    │   Insight   │           │
│   │  Guidance   │    │ Adaptation  │    │ Generation  │           │
│   └─────────────┘    └─────────────┘    └─────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Cognitive Profiles (`src/personas/cognitive-profiles.ts`)

Each persona has a unique cognitive profile defining:

| Component | Description |
|-----------|-------------|
| `reasoningStyle` | Primary thinking approach (narrative, analytical, empathetic, etc.) |
| `attentionProfile` | What they naturally notice vs. miss |
| `theoryOfMind` | How they assess user knowledge levels |
| `cognitiveBiases` | Known biases with self-awareness phrases |
| `metacognition` | Confidence calibration and uncertainty expression |
| `informationProcessing` | Deliberation depth and thinking-aloud style |
| `signatureThinkingPhrases` | Unique expressions of their thought process |

**Example - Ferni's Profile:**
```typescript
{
  reasoningStyle: 'narrative',
  attentionProfile: {
    focusAreas: ['meaning', 'emotions', 'relationships'],
    blindSpots: ['raw data', 'strict logic'],
    curiosityTriggers: ['vulnerability', 'aspirations'],
  },
  metacognition: {
    confidenceThresholds: { high: 0.8, medium: 0.5, low: 0.3 },
    uncertaintyExpressions: ["I'm still exploring that with you..."],
  },
}
```

### 2. Cognitive Engine (`src/personas/cognitive-intelligence.ts`)

The engine processes context and generates guidance:

```typescript
const guidance = engine.generateGuidance({
  currentTopic: 'career change',
  userExpertise: 'intermediate',
  emotionalWeight: 'heavy',
  questionComplexity: 'complex',
  turnCount: 5,
  previousApproaches: ['empathetic', 'narrative'],
});

// Returns:
{
  recommendedApproach: 'empathetic',
  attentionCues: ['Notice the fear underlying this decision'],
  biasAlert: 'My optimism bias might minimize real concerns',
  explanationStrategy: 'Use metaphors, avoid data dumps',
  confidenceLevel: 'medium',
  thinkingAloudPrompt: "Let me sit with that for a moment...",
}
```

### 3. User Cognitive Style Detection (`src/personas/cognitive-advanced.ts`)

Detects user's thinking preferences from their messages:

```typescript
const userStyle = detectUserCognitiveStyle(conversationHistory);
// { style: 'analytical', confidence: 0.72, signals: { analytical: 8, empathetic: 3, ... } }
```

**Detection Signals:**
- **Analytical**: "data", "facts", "evidence", "analyze", "why"
- **Empathetic**: "feel", "emotions", "care", "support"
- **Systematic**: "steps", "process", "plan", "workflow"
- **Narrative**: "story", "experience", "journey"
- **Pragmatic**: "do", "action", "implement", "results"

### 4. Cognitive Speech Integration (`src/speech/cognitive-speech-integration.ts`)

Dynamically adjusts speech based on cognitive state:

| Cognitive State | Speech Adjustment |
|-----------------|-------------------|
| Empathetic mode | Slower pace, longer pauses, softer emphasis |
| Analytical mode | Measured pace, clear pauses at key points |
| Low confidence | Slower, more pauses, thinking sounds |
| High confidence | Slightly faster, direct delivery |
| In reasoning chain | Transition pauses between steps |

### 5. Cognitive Persistence (`src/services/cognitive-persistence.ts`)

Stores and retrieves cognitive learning in Firestore:

```typescript
// What's persisted per user:
{
  detectedStyle: 'analytical',
  styleConfidence: 0.78,
  approachEffectiveness: {
    narrative: { totalScore: 85, sampleCount: 12 },
    empathetic: { totalScore: 72, sampleCount: 8 },
  },
  expertiseAreas: ['career planning', 'investing'],
  noviceAreas: ['meditation', 'emotional regulation'],
}
```

### 6. Cognitive Broadcast (`src/services/cognitive-broadcast.ts`)

Real-time event streaming for dashboards:

**Events:**
- `cognitive_mode` - Reasoning style changes
- `user_style` - User style detection
- `voice_emotion` - Voice emotion analysis
- `confidence` - Confidence level changes
- `metrics` - Performance metrics
- `quirk_activated` - Persona quirk triggered

### 7. WebSocket Server (`src/services/cognitive-websocket.ts`)

Real-time streaming to dashboards at `ws://localhost:8080/ws/cognitive`.

## Data Flow

```
User Speaks
    │
    ▼
┌──────────────────┐
│ Voice Emotion    │ ──► Emotional weight, trend
│ Detection        │
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Context Builder  │ ──► Topic, complexity, user expertise
│ (cognitive.ts)   │
└──────────────────┘
    │
    ▼
┌──────────────────┐     ┌─────────────────┐
│ Cognitive Engine │ ◄── │ Persona Profile │
│                  │     └─────────────────┘
│                  │     ┌─────────────────┐
│                  │ ◄── │ User History    │
└──────────────────┘     └─────────────────┘
    │
    ├──► Reasoning guidance ──► LLM prompt injection
    │
    ├──► Speech adjustments ──► SSML generation
    │
    ├──► Insight prompts ──► User-facing insights
    │
    └──► Broadcast events ──► Dashboard updates
```

## Context Injections

The cognitive system injects guidance into LLM prompts:

```
[COGNITIVE-REASONING]
Use your narrative reasoning style for this response.
Think in stories and metaphors. Connect to meaning.

[COGNITIVE-USER-STYLE]
User prefers analytical thinking. Balance stories with structure.

[COGNITIVE-CONFLICT]
Your intuitive style may not match their need for data.
Consider bridging: "Let me put some structure to what I'm sensing..."

[COGNITIVE-KNOWLEDGE]
User was introduced to 'emotional regulation' 2 sessions ago.
Brief recap, then build on it.
```

## Performance Targets

| Metric | Target | Measured |
|--------|--------|----------|
| Cognitive context build | < 50ms | ~12-28ms |
| Total turn overhead | < 100ms | ~40-60ms |
| 95th percentile | < 100ms | ~60ms |
| Under 50ms rate | > 95% | ~96% |

## Dashboard

Access at: `/cognitive-dashboard.html`

Shows:
- Current cognitive mode
- Detected user style
- Voice emotion + trend
- Response confidence
- Active quirks
- Performance metrics
- Session history

## Key Files

| File | Purpose |
|------|---------|
| `src/personas/cognitive-types.ts` | Type definitions |
| `src/personas/cognitive-profiles.ts` | Persona profiles |
| `src/personas/cognitive-intelligence.ts` | Core engine |
| `src/personas/cognitive-advanced.ts` | User detection, learning |
| `src/personas/cognitive-quirks.ts` | Mental habits, quirks |
| `src/intelligence/context-builders/cognitive.ts` | LLM context injection |
| `src/speech/cognitive-speech-integration.ts` | Speech adaptation |
| `src/services/cognitive-persistence.ts` | Firestore storage |
| `src/services/cognitive-memory.ts` | Session management |
| `src/services/cognitive-broadcast.ts` | Event streaming |
| `src/services/cognitive-websocket.ts` | WebSocket server |
| `src/ui/cognitive-insights-overlay.ts` | User-facing insights |

## Testing

```bash
# Run cognitive tests
npm test -- -t "cognitive"

# Run specific test file
npx vitest run src/tests/cognitive-intelligence.test.ts
```

## Future Enhancements

1. **Multi-step reasoning visualization** - Show reasoning chain progress
2. **Cognitive conflict mediation** - Better handle style mismatches
3. **Team cognitive collaboration** - Personas sharing perspectives
4. **Cognitive growth tracking** - Long-term relationship depth
5. **Voice → cognitive state** - Deeper emotion integration


