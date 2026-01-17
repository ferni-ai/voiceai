# Ferni TTS Integration Guide

Integrate the custom Ferni TTS service with the voice agent for **superhuman prosody** - better-than-human speech that adapts to conversation context.

## Quick Start

### 1. Enable Ferni TTS

Set the environment variable to switch TTS providers:

```bash
# In .env or environment
TTS_PROVIDER=ferni-tts
FERNI_TTS_ENDPOINT=http://localhost:8080  # Or your deployed service
```

### 2. Start the Ferni TTS Service

```bash
# From services/ferni-tts/
docker-compose up

# Or run directly
cargo run --release
```

### 3. Use in Voice Agent

The provider abstraction handles everything automatically:

```typescript
import { createUnifiedTTS } from '@ferni/speech/tts';

// Automatically uses Ferni TTS when TTS_PROVIDER=ferni-tts
const tts = await createUnifiedTTS('Ferni', {
  voiceId: 'ferni',
  provider: 'ferni-tts', // Or rely on TTS_PROVIDER env var
});

// Start streaming
const stream = tts.stream();
stream.pushText('Hello, how are you today?');
stream.endInput();
```

## Superhuman Context

The magic of Ferni TTS is the **superhuman context** - conversation state that drives 8 prosody transforms.

### Bridge Pattern (Recommended)

```typescript
import {
  bridgeToFerniContext,
  FerniTTS,
  createFerniTTSFromEnv,
} from '@ferni/speech/tts';

// In your voice agent's ttsNode:
async function customTtsNode(text, modelSettings) {
  // Get Ferni TTS instance
  const tts = createFerniTTSFromEnv();

  // Bridge conversation state → superhuman context
  const superhumanContext = bridgeToFerniContext(session.userData);
  tts.setSuperhumanContext(superhumanContext);

  // Stream synthesis
  const stream = tts.stream();
  stream.updateInputStream(text);

  return stream;
}
```

### Manual Context (When You Need Control)

```typescript
import { FerniSuperhumanContext, createFerniTTS } from '@ferni/speech/tts';

const tts = createFerniTTS('ferni');

// Build context manually
const context: FerniSuperhumanContext = {
  userLocalHour: 14, // 2pm - normal energy
  relationshipStage: 0.7, // 70% trust built
  userEnergy: 0.6, // Moderate energy
  userEmotion: ['joy', 0.8], // Happy at 80% intensity
  topicSensitivity: 0.3, // Low sensitivity
  emotionalTrajectory: 'building_to_joy',
  turnNumber: 5,
  userSpeakingRate: 1.1, // Slightly fast speaker
  rememberedEntities: [
    {
      name: 'Sarah',
      entityType: 'person',
      familiarity: 0.9, // Very familiar
      emotionalValence: 0.7, // Positive association
    },
  ],
};

tts.setSuperhumanContext(context);
```

### Async Enrichment (For Deep Personalization)

```typescript
import {
  bridgeToFerniContext,
  enrichContextFromFirestore,
  enrichContextWithMemory,
} from '@ferni/speech/tts';

async function getEnrichedContext(userId: string, userData: unknown) {
  // Start with basic context from session
  let context = bridgeToFerniContext(userData);

  // Enrich with relationship data from Firestore
  context = await enrichContextFromFirestore(userId, context);

  // Enrich with relevant memory entities
  context = await enrichContextWithMemory(userId, context, ['work', 'family']);

  return context;
}
```

## The 8 Superhuman Transforms

Each transform adjusts speech prosody based on context:

| Transform               | Context Used                        | Effect                              |
| ----------------------- | ----------------------------------- | ----------------------------------- |
| **Circadian Rhythm**    | `userLocalHour`                     | Slower at 2am, normal during day    |
| **Memory Prosody**      | `rememberedEntities`                | Emphasizes familiar names/places    |
| **Emotional Anticipation** | `userEmotion`, `emotionalTrajectory` | Express emotion before content   |
| **Meaningful Silence**  | `topicSensitivity`                  | Longer pauses for sensitive topics  |
| **Relationship Prosody**| `relationshipStage`                 | More warmth with trusted users      |
| **Energy Matching**     | `userEnergy`                        | Mirrors user's speaking energy      |
| **Backchannels**        | `turnNumber`                        | Natural "hmm", "uh-huh" sounds      |
| **Breath Patterns**     | `userSpeakingRate`                  | Natural breathing matching rate     |

## SSML Support

Ferni TTS supports full W3C SSML 1.1 plus custom extensions:

### Standard SSML

```xml
<speak>
  <prosody rate="slow">
    Hello, <emphasis level="strong">friend</emphasis>.
  </prosody>
  <break time="500ms"/>
  How are you today?
</speak>
```

### Ferni SSML Extensions

```xml
<speak>
  <ferni:emotion type="warm" intensity="0.8">
    I remember what you said about Sarah.
  </ferni:emotion>

  <ferni:memory entity="Sarah" type="person">
    She sounds wonderful.
  </ferni:memory>

  <ferni:breath/>

  <ferni:silence purpose="impact" duration="800ms"/>

  That's really meaningful.

  <ferni:backchannel type="affirmation"/>
</speak>
```

## Environment Variables

| Variable               | Default                  | Description                        |
| ---------------------- | ------------------------ | ---------------------------------- |
| `TTS_PROVIDER`         | `cartesia`               | TTS provider (ferni-tts, cartesia) |
| `FERNI_TTS_ENDPOINT`   | `http://localhost:8080`  | Ferni TTS service URL              |
| `FERNI_TTS_API_KEY`    | -                        | Optional API key                   |
| `FERNI_TTS_DEFAULT_VOICE` | `ferni`               | Default persona voice              |

## Provider Comparison

| Feature               | Cartesia        | Ferni TTS                   |
| --------------------- | --------------- | --------------------------- |
| SSML Support          | Partial         | Full W3C + Extensions       |
| Superhuman Transforms | ❌               | ✅ 8 transforms              |
| Custom Voices         | Via Cartesia    | Via reference audio         |
| Latency               | ~150ms          | ~50ms (local)               |
| Context-Aware         | Basic emotion   | Full conversation state     |
| Deployment            | Cloud           | Self-hosted (Docker/Rust)   |

## A/B Testing

Compare TTS quality between providers:

```typescript
import { getDefaultTTSProvider, createUnifiedTTS } from '@ferni/speech/tts';

// Random assignment (50/50)
const useExperimental = Math.random() < 0.5;
const provider = useExperimental ? 'ferni-tts' : 'cartesia';

const tts = await createUnifiedTTS('Ferni', {
  voiceId: 'ferni',
  provider,
});

// Log for analytics
console.log({ provider, sessionId, userId });
```

## Troubleshooting

### "Connection refused" errors

Ferni TTS service isn't running:

```bash
# Check if service is running
curl http://localhost:8080/health

# Start the service
cd services/ferni-tts && docker-compose up
```

### "Voice not found" errors

Check voice ID mapping:

```typescript
import { getFerniTTSVoiceIdForPersona } from '@ferni/speech/tts';

// Maps persona IDs to Ferni TTS voice names
const voiceId = getFerniTTSVoiceIdForPersona('peter-john'); // → 'peter'
```

### Context not being applied

Ensure you call `setSuperhumanContext()` before streaming:

```typescript
const tts = createFerniTTSFromEnv();

// ✅ Set context BEFORE creating stream
tts.setSuperhumanContext(context);
const stream = tts.stream();

// ❌ Wrong - stream already created
const stream = tts.stream();
tts.setSuperhumanContext(context); // Too late!
```

## Architecture

```
Voice Agent Session
       │
       ▼
┌──────────────────┐
│ Context Bridge   │  ← Extracts conversation state
│ (bridgeToFerni)  │
└──────────────────┘
       │
       ▼ FerniSuperhumanContext
┌──────────────────┐
│ Ferni TTS Client │  ← TypeScript client
│ (ferni-tts-core) │
└──────────────────┘
       │
       ▼ HTTP POST /v1/synthesize/stream
┌──────────────────┐
│ Ferni TTS Server │  ← Rust service (services/ferni-tts)
│ (SSML + Superhuman)│
└──────────────────┘
       │
       ▼ PCM Audio Stream
┌──────────────────┐
│ Post-TTS Transform│  ← Existing Rust DSP (optional)
│ (warmth, compression)│
└──────────────────┘
       │
       ▼ AudioFrame[]
┌──────────────────┐
│ LiveKit WebRTC   │  ← To user
└──────────────────┘
```

## Files

| File                              | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `src/speech/tts/ferni-tts-core.ts` | TypeScript client for Ferni TTS       |
| `src/speech/tts/ferni-tts-context-bridge.ts` | Conversation state → superhuman context |
| `services/ferni-tts/`             | Rust TTS service                       |
| `services/ferni-tts/src/ssml/`    | SSML parser                            |
| `services/ferni-tts/src/superhuman/` | 8 prosody transforms                |

## Next Steps

1. **Voice Training**: Collect reference audio for custom persona voices
2. **Latency Benchmarking**: Compare with Cartesia in production
3. **A/B Testing**: Measure user satisfaction with superhuman prosody
