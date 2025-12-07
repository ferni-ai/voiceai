# Conversation Humanization System

The humanization system makes AI conversations feel natural and human-like through strategic imperfections, active listening, conversational memory, and persona-specific tuning.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Voice Agent                                 │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   User Input │───▶│  Humanizer   │───▶│  Context Builder │  │
│  └──────────────┘    │  (Pre-Proc)  │    │  (LLM Prompt)    │  │
│                      └──────────────┘    └──────────────────┘  │
│                                                   │             │
│                                                   ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  TTS Output  │◀───│  SSML Layer  │◀───│     LLM          │  │
│  └──────────────┘    │  + Humanizer │    │   Response       │  │
│                      │  (Post-Proc) │    └──────────────────┘  │
│                      └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Speech Naturalizer (`src/conversation/speech-naturalizer.ts`)

Adds strategic imperfections to make speech sound natural:

- **Disfluencies**: "Well...", "Um...", "You know..."
- **Hedging**: "I think...", "Maybe...", "Perhaps..."
- **Self-correction**: "Actually, what I mean is..."
- **Thinking phrases**: "Let me think about that..."
- **Sentence fragments**: Natural incomplete thoughts

```typescript
import { SpeechNaturalizer } from './conversation/speech-naturalizer.js';

const naturalizer = new SpeechNaturalizer();
const result = naturalizer.naturalize(
  'You should invest in index funds.',
  'ferni',
  { emotion: 'neutral', userPacing: 'normal' }
);

// result.text: "Well... I think you should consider index funds."
// result.ssml: "Well...<break time='200ms'/> I think you should consider index funds."
// result.appliedFeatures: ['disfluency', 'hedging']
```

### 2. Active Listening Engine (`src/conversation/active-listening.ts`)

Makes the AI an attentive listener:

- **Backchannels**: "Mmhmm", "I hear you", "Right"
- **Emotional echoes**: Mirror user's emotional state
- **Vocabulary mirroring**: Adopt user's terminology
- **Silence handling**: Know when to let silence breathe

```typescript
import { ActiveListeningEngine } from './conversation/active-listening.js';

const engine = new ActiveListeningEngine();

// Get a context-appropriate backchannel
const backchannel = engine.getBackchannel('ferni', {
  userEmotion: 'sad',
  userPacing: 'relaxed',
});

// Check if silence should be allowed
const allowSilence = engine.shouldAllowSilence('relaxed', 'sad');
// true - give space after emotional sharing
```

### 3. Conversational Memory (`src/conversation/conversational-memory.ts`)

Tracks and references conversation threads:

- **Topic threading**: Remember what was discussed
- **Notable statements**: Track important user statements
- **Commitment tracking**: Remember user commitments
- **Contradiction detection**: Notice inconsistencies

```typescript
import { ConversationalMemory } from './conversation/conversational-memory.js';

const memory = new ConversationalMemory();

// Record user messages
memory.recordUserMessage('I want to save for a house', {
  turnNumber: 3,
  topic: 'savings',
  wasPersonal: true,
  madeCommitment: true,
});

// Get memory callbacks for natural references
const callback = memory.getMemoryCallback('ferni', 8, {
  currentTopic: 'investments',
  userEmotion: 'neutral',
});
// callback.phrase: "Earlier you mentioned wanting to save for a house..."
```

### 4. Question Pattern Engine (`src/conversation/question-patterns.ts`)

Generates diverse question types:

| Intent | Example |
|--------|---------|
| `explore` | "What does that look like for you?" |
| `clarify` | "When you say 'safe', what does that mean to you?" |
| `challenge` | "What's holding you back from trying that?" |
| `reflect` | "How does that sit with you?" |
| `hypothetical` | "If you could change one thing, what would it be?" |

```typescript
import { QuestionPatternEngine } from './conversation/question-patterns.js';

const engine = new QuestionPatternEngine();
const question = engine.generateQuestion({
  personaId: 'ferni',
  topic: 'career',
  intent: 'reflect',
  userEmotion: 'uncertain',
  conversationDepth: 8,
});
// question.question: "What's your gut telling you about this?"
// question.type: 'reflective'
```

### 5. Conversation Humanizer (`src/conversation/humanizer.ts`)

Orchestrates all modules:

```typescript
import { ConversationHumanizer } from './conversation/humanizer.js';

const humanizer = new ConversationHumanizer();

// Pre-process user input
const preActions = humanizer.processUserMessage({
  personaId: 'ferni',
  turnNumber: 5,
  userMessage: 'I feel stuck',
  userEmotion: 'frustrated',
  topic: 'career',
  wasPersonalSharing: true,
});

// Humanize LLM response
const humanized = humanizer.humanizeResponse(
  'I understand that feeling of being stuck. Let\'s explore what\'s possible.',
  {
    personaId: 'ferni',
    turnNumber: 5,
    userEmotion: 'frustrated',
    userPacing: 'normal',
    currentTopic: 'career',
    lastUserStatement: 'I feel stuck',
    preActions,
  }
);
```

## Configuration

### Presets

Apply pre-configured humanization styles:

```typescript
import { applyPreset, getRecommendedPreset } from './conversation/humanizing-config.js';

// Apply a specific preset
applyPreset('therapeutic');  // For coaching/supportive personas
applyPreset('expert');       // For authoritative personas
applyPreset('conversational'); // For casual, friendly personas
applyPreset('minimal');      // Very subtle humanization
applyPreset('disabled');     // Turn off humanization

// Get recommended preset for a persona
const preset = getRecommendedPreset('ferni'); // Returns 'therapeutic'
```

### Available Presets

| Preset | Disfluency | Backchannel | Memory | Best For |
|--------|------------|-------------|--------|----------|
| `minimal` | 5% | 10% | 10% | Professional assistants |
| `natural` | 15% | 30% | 20% | General use |
| `conversational` | 25% | 40% | 30% | Friendly personas |
| `therapeutic` | 10% | 40% | 30% | Coaching/support |
| `expert` | 8% | 20% | 25% | Authority figures |

### Per-Persona Configuration

Configure in persona bundle manifests:

```json
{
  "humanization": {
    "preset": "therapeutic",
    "overrides": {
      "disfluency": {
        "enabled": true,
        "frequency": 0.12
      },
      "active_listening": {
        "enabled": true,
        "backchannel_probability": 0.4,
        "emotional_echo_probability": 0.5
      },
      "conversational_memory": {
        "enabled": true,
        "callback_probability": 0.3
      }
    },
    "warmup": {
      "turns": 2,
      "reduction": 0.6
    },
    "context_modifiers": {
      "serious_topics_reduction": 0.4,
      "personal_sharing_warmth_boost": 1.5
    }
  }
}
```

### Configuration Parameters

```typescript
interface HumanizingConfig {
  disfluency: {
    enabled: boolean;
    frequency: number;           // 0-1, probability
    contextSensitivity: boolean; // Reduce in serious contexts
  };
  
  hedging: {
    enabled: boolean;
    adviceHedgingRate: number;   // 0-1
    predictionHedgingRate: number;
  };
  
  backchannel: {
    enabled: boolean;
    minIntervalMs: number;       // Min time between backchannels
    probability: number;
  };
  
  memory: {
    enabled: boolean;
    minTurnsBeforeCallback: number;
    callbackProbability: number;
    maxTrackedStatements: number;
  };
  
  questions: {
    enabled: boolean;
    followUpProbability: number;
    typeRepeatAvoidance: number; // Turns before repeating type
  };
  
  global: {
    enabled: boolean;            // Master switch
    warmupTurns: number;         // Reduced humanization period
    warmupReduction: number;     // 0-1
  };
}
```

## SSML Integration

The humanization system integrates with SSML for natural speech:

```typescript
import { applyConversationSsmlEnhancements } from './ssml/conversation-integration.js';

const enhanced = applyConversationSsmlEnhancements(
  'Well... I think you should consider that.',
  {
    personaId: 'ferni',
    emotion: 'affectionate',
    baseSpeed: 0.9,
    conversationContext: {
      turnNumber: 5,
      userEmotion: 'sad',
      wasPersonalSharing: true,
    },
  }
);

// Result includes SSML tags for:
// - Pauses after disfluencies
// - Speed adjustments for hedging
// - Emotion tags for echoes
// - Thinking phrase timing
```

## Analytics & Evolution

Track humanization effectiveness:

```typescript
import { getHumanizationAnalytics } from './services/humanization-analytics.js';

const analytics = getHumanizationAnalytics();

// Track session
analytics.startSession('session-123', 'ferni');

// Record feature usage
analytics.recordFeatureUsage('session-123', 'ferni', 5, 'disfluency', {
  type: 'well',
});

// Record engagement signals
analytics.recordEngagementSignal('session-123', 'ferni', 5, 'explicit_positive', 1);

// End session and get summary
const summary = analytics.endSession('session-123');
// {
//   totalTurns: 12,
//   overallEngagement: 'high',
//   mostEffectiveFeature: 'memory_callback',
//   sentimentTrend: 'improving'
// }

// Get parameter recommendations
const recommendations = analytics.getParameterRecommendations('ferni');
// [{ featureType: 'disfluency', recommendation: 'increase', confidence: 0.8 }]
```

## Testing

Run end-to-end tests:

```bash
# Run unit tests
npx vitest run src/tests/conversation-humanizing.test.ts

# Run E2E integration tests
npx ts-node scripts/test-humanizing-e2e.ts
```

## Voice Agent Integration

The humanization system is integrated into the voice agent at two points:

### 1. User Turn Completed (Pre-processing)

```typescript
// In onUserTurnCompleted:
const humanizer = getConversationHumanizer(this.persona.id);

const preActions = humanizer.processUserMessage({
  personaId: this.persona.id,
  turnNumber: userData?.turnCount || 0,
  userMessage: userText,
  userEmotion: analysis.emotion.primary,
  topic: currentTopic,
  wasPersonalSharing: analysis.emotion.needsSupport,
});

// Store for response phase
userData.humanizerPreActions = preActions;

// Inject humanizing context into LLM prompt
const humanizingContext = buildConversationHumanizingContext({...});
allContext.push(formatConversationHumanizingForPrompt(humanizingContext));
```

### 2. Agent Turn Completed (Post-processing)

```typescript
// In onAgentTurnCompleted:
const humanizedResponse = humanizer.humanizeResponse(rawLLMResponse, {
  personaId: this.persona.id,
  turnNumber: userData?.turnCount || 0,
  userEmotion: analysis.emotion.primary,
  userPacing: responseDynamics.getPacingAnalysis().userPacing,
  currentTopic,
  lastUserStatement: userText,
  preActions: userData?.humanizerPreActions,
});

// Use humanized text and SSML for TTS
let finalResponseText = humanizedResponse.text;
let finalResponseSsml = humanizedResponse.ssml;
```

## Best Practices

### 1. Start with Presets

Don't over-configure. Start with a preset that matches your persona's character:

- **Therapeutic personas** (Ferni, coaches): Use `therapeutic` preset
- **Expert personas** (Jack Bogle): Use `expert` preset
- **Casual personas** (Peter Lynch): Use `conversational` preset
- **Professional assistants** (Alex): Use `minimal` preset

### 2. Use Warmup Period

New conversations should have reduced humanization to establish rapport first:

```json
{
  "warmup": {
    "turns": 2,
    "reduction": 0.6
  }
}
```

### 3. Context Sensitivity

Reduce casual elements in serious contexts:

```json
{
  "context_modifiers": {
    "serious_topics_reduction": 0.4
  }
}
```

### 4. Monitor Analytics

Track which features correlate with engagement:

```typescript
const metrics = analytics.getPersonaMetrics('ferni');
const recommendations = analytics.getParameterRecommendations('ferni');

// Adjust config based on real data
if (recommendations.some(r => r.featureType === 'disfluency' && r.recommendation === 'decrease')) {
  updateHumanizingConfig({
    disfluency: { frequency: config.disfluency.frequency * 0.8 }
  });
}
```

### 5. Test with Real Users

The E2E test script verifies technical correctness, but real user feedback is essential for tuning the "feel" of conversations.

## Troubleshooting

### Humanization Not Applied

1. Check if enabled in config:
   ```typescript
   const config = getHumanizingConfig();
   console.log(config.global.enabled); // Should be true
   ```

2. Check persona has humanization config in manifest

3. Check if in warmup period (features are reduced)

### Too Much Humanization

1. Apply a more conservative preset:
   ```typescript
   applyPreset('minimal');
   ```

2. Reduce individual frequencies in config

3. Increase context sensitivity for serious topics

### SSML Tags Not Rendering

1. Verify TTS provider supports the tags
2. Check SSML sanitization isn't removing them
3. Use `sanitizeSsml()` to fix malformed tags

## File Structure

```
src/
├── conversation/
│   ├── speech-naturalizer.ts    # Disfluencies, hedging
│   ├── active-listening.ts      # Backchannels, echoing
│   ├── conversational-memory.ts # Memory, threading
│   ├── question-patterns.ts     # Question diversity
│   ├── humanizer.ts            # Orchestration layer
│   ├── humanizing-config.ts    # Configuration & presets
│   └── index.ts                # Exports
├── ssml/
│   └── conversation-integration.ts # SSML enhancements
├── intelligence/
│   └── context-builders/
│       └── conversation-humanizing.ts # LLM prompt injection
├── services/
│   └── humanization-analytics.ts # Tracking & learning
└── personas/bundles/
    └── */persona.manifest.json  # Per-persona humanization config
```

