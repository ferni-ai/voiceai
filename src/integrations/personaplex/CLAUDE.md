# PersonaPlex Integration

> **Full-duplex speech-to-speech model integration for Ferni**

PersonaPlex is NVIDIA's real-time, full-duplex speech-to-speech conversational model. This integration allows Ferni to use PersonaPlex as an alternative to the current STT → LLM → TTS pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      REUSABLE CORE (unchanged)                  │
├─────────────────────────────────────────────────────────────────┤
│  Personas    Memory     Tools      Intelligence    Services     │
│  (bundles)   (L1/L2/L3) (118 doms) (200+ builders) (70+ super)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Integration Layer │
                    │  (this module)     │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ PersonaPlex   │    │ Tool Executor │    │ Context       │
│ Client        │    │ (outside loop)│    │ Injector      │
│ (WebSocket)   │    │               │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    PersonaPlex Server                          │
│  (Full-duplex speech-to-speech with text prompt control)       │
└───────────────────────────────────────────────────────────────┘
```

---

## Key Differences from Current Pipeline

| Aspect               | Current (OpenAI/Gemini + Cartesia) | PersonaPlex                      |
| -------------------- | ---------------------------------- | -------------------------------- |
| **Pipeline**         | STT → Text LLM → TTS               | Native speech-to-speech          |
| **Voice Control**    | Cartesia voice IDs                 | Audio embeddings (`.pt` files)   |
| **Turn Detection**   | Server VAD                         | Built-in full-duplex             |
| **Function Calling** | Native FC / JSON workaround        | Context injection (no native FC) |
| **Latency**          | ~300-500ms (3 stages)              | ~100-200ms (single model)        |
| **Infrastructure**   | Cloud APIs                         | Self-hosted GPU                  |

---

## Directory Structure

```
personaplex/
├── CLAUDE.md                     # This file
├── index.ts                      # Main exports
├── config.ts                     # Configuration and environment
├── types.ts                      # TypeScript types
├── client.ts                     # PersonaPlex WebSocket client (self-hosted)
├── api-client.ts                 # PersonaPlex.io API client (hosted)
├── prompt-builder.ts             # Basic prompt building
├── enhanced-prompt-builder.ts    # Full persona integration
├── voice-embeddings/
│   ├── generator.ts              # Generate voice embeddings from Cartesia
│   └── samples/                  # Generated WAV files (gitignored)
├── session/
│   ├── index.ts                  # Session exports
│   └── session-manager.ts        # ⭐ FULL SESSION MANAGEMENT
├── humanization/
│   ├── index.ts                  # Humanization exports
│   └── ssml-to-text.ts           # ⭐ SSML/PROSODY TRANSLATION
├── tools/
│   ├── index.ts                  # Tool exports
│   └── tool-executor.ts          # ⭐ TOOL EXECUTION OUTSIDE VOICE LOOP
└── __tests__/
    ├── config.test.ts            # Config tests
    ├── prompt-builder.test.ts    # Prompt tests
    └── full-integration.test.ts  # ⭐ FULL INTEGRATION TESTS
```

---

## Full Integration Architecture

The PersonaPlex integration leverages **ALL** of Ferni's existing systems:

```
┌─────────────────────────────────────────────────────────────────┐
│                  PersonaPlexSessionManager                       │
│                  (session/session-manager.ts)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Persona      │  │ Context      │  │ Tool         │          │
│  │ Bundles      │  │ Builders     │  │ Orchestrator │          │
│  │ (full load)  │  │ (200+)       │  │ (118 domains)│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │ Cognitive    │  │ Behavioral   │  │ Semantic     │          │
│  │ Profiles     │  │ Signals      │  │ Routing      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Memory       │  │ Humanization │  │ Handoff      │          │
│  │ L1/L2/L3     │  │ Engine       │  │ Manager      │          │
│  │ + STM Buffer │  │ (SSML→Text)  │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    ┌──────▼───────┐                             │
│                    │ PersonaPlex  │                             │
│                    │ Client       │                             │
│                    └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Systems Integrated

| System                 | Location                             | Integration Point                              |
| ---------------------- | ------------------------------------ | ---------------------------------------------- |
| **Persona Bundles**    | `src/personas/bundles/`              | Full load with behaviors, stories, knowledge   |
| **Context Builders**   | `src/intelligence/context-builders/` | All 200+ builders via `buildIntegratedContext` |
| **Tool Orchestrator**  | `src/tools/orchestrator/`            | Full 118 domains with semantic routing         |
| **Memory System**      | `src/memory/dynamic/`                | L1/L2/L3 with STM buffer and deep extraction   |
| **Humanization**       | `src/speech/`, `src/conversation/`   | SSML/prosody translated to text guidance       |
| **Handoff Manager**    | `src/handoff/`                       | Persona transitions with context preservation  |
| **DJ Controller**      | `src/audio/dj-controller.ts`         | Music commands via speech detection            |
| **Analysis Engine**    | `src/intelligence/detectors/`        | Emotion, intent, topic detection               |
| **Cognitive Profiles** | `src/personas/cognitive/`            | Persona-specific communication styles          |

---

## Voice Embedding System

### How PersonaPlex Voices Work

PersonaPlex uses audio-based voice conditioning through embeddings:

1. **Pre-packaged voices**: `NATF0-3`, `NATM0-3`, `VARF0-4`, `VARM0-4`
2. **Custom voices**: Any audio file can be converted to embeddings

### Creating Custom Voice Embeddings

We generate custom voice embeddings from Cartesia TTS samples:

```
Cartesia Voice ID → TTS Audio Sample → Mimi Encoder → .pt Embedding
     (Ferni)         (30s speech)       (PersonaPlex)   (ferni.pt)
```

### Voice Mapping

| Persona | Cartesia Voice ID | PersonaPlex Embedding | Fallback |
| ------- | ----------------- | --------------------- | -------- |
| Ferni   | `fdeb5d75-...`    | `ferni.pt`            | `NATM1`  |
| Maya    | `11175483-...`    | `maya.pt`             | `NATF2`  |
| Alex    | `81c164d9-...`    | `alex.pt`             | `NATF1`  |
| Peter   | `3f04e815-...`    | `peter.pt`            | `NATM0`  |
| Jordan  | `b2d14370-...`    | `jordan.pt`           | `NATF0`  |
| Nayan   | `52f0a563-...`    | `nayan.pt`            | `NATM2`  |

---

## Text Prompt Format

PersonaPlex accepts text-based role prompts. We convert our persona system prompts:

### Assistant/Coaching Role

```
You are Ferni, a wise and friendly life coach. You help people navigate life's challenges with warmth and wisdom. You enjoy having a good conversation. Have an empathetic discussion about whatever the user wants to talk about.
```

### With Context (Memory, Tools)

```
You are Ferni, a wise and friendly life coach.

IMPORTANT CONTEXT:
- User's name is Sarah
- Last session: discussed career change anxiety
- User preference: prefers encouragement over direct advice

AVAILABLE ACTIONS (say these phrases to trigger):
- "Let me check your calendar" → triggers calendar lookup
- "I'll play some music" → triggers music playback

You enjoy having a good conversation. Be present and supportive.
```

---

## Tool Execution Strategy

Since PersonaPlex doesn't have native function calling, we use **context injection**:

1. **Pre-turn**: Build context from memory and available tools
2. **During conversation**: Detect tool-triggering phrases in speech output
3. **Post-detection**: Execute tool, inject result into next prompt update

```typescript
// Tool detection patterns
const TOOL_TRIGGERS = {
  calendar: /let me check (your |the )?calendar/i,
  music: /i('ll| will) play (some )?music/i,
  weather: /let me (check|look up) the weather/i,
};
```

---

## Environment Variables

```bash
# PersonaPlex server configuration
PERSONAPLEX_URL=ws://localhost:8998/api/chat
PERSONAPLEX_HOST=localhost
PERSONAPLEX_PORT=8998

# Voice embeddings
PERSONAPLEX_VOICE_DIR=/path/to/voice-embeddings

# Feature flag
USE_PERSONAPLEX=false  # Set to true to enable
```

---

## GCE GPU Deployment

### Deploy with Ferni CLI (Recommended)

```bash
# Set HuggingFace token first
export HF_TOKEN=hf_xxx

# Deploy GPU instance with PersonaPlex
ferni personaplex deploy

# Check health
ferni personaplex health

# View logs
ferni personaplex logs

# Generate voice embeddings on GPU
ferni personaplex voices

# SSH into instance
ferni personaplex ssh

# Tear down
ferni personaplex destroy
```

### Infrastructure Files

| File                                 | Purpose                |
| ------------------------------------ | ---------------------- |
| `infra/personaplex/deploy.sh`        | Main deployment script |
| `infra/personaplex/README.md`        | Infrastructure docs    |
| `apps/cli/src/commands/personaplex/` | CLI commands           |

### GPU Options

| GPU           | VRAM | Cost/Hour | Best For                |
| ------------- | ---- | --------- | ----------------------- |
| **NVIDIA L4** | 24GB | ~$0.70    | ✅ Production inference |
| NVIDIA T4     | 16GB | ~$0.35    | Budget/testing          |
| NVIDIA A100   | 40GB | ~$2.50    | Overkill                |

### Cost Estimate

- **On-demand (development)**: ~$50-100/month
- **24/7 (production)**: ~$500/month
- **Spot/preemptible**: ~60% cheaper

---

## Alternative: PersonaPlex.io API

Use the hosted API instead of self-hosting:

```typescript
import { createPersonaPlexAPIClient } from './integrations/personaplex/index.js';

const client = createPersonaPlexAPIClient({
  apiKey: process.env.PERSONAPLEX_API_KEY!,
});

await client.createSession({
  personaId: 'ferni',
  context: { userId: 'user-123' },
});
```

- **Cost**: $0.08/minute
- **No GPU needed**
- **16 pre-built voices**
- **Sign up**: https://personaplex.io

---

## Usage

### Full Integration (Recommended)

Use the `PersonaPlexSessionManager` for complete integration with all Ferni systems:

```typescript
import { createPersonaPlexSession } from './integrations/personaplex/index.js';

// Create session with full integration
const session = createPersonaPlexSession({
  sessionId: 'my-session',
  userId: 'user-123',
  personaId: 'ferni',
  services: myServices,
  serverUrl: process.env.PERSONAPLEX_URL,
  useCustomVoice: true,
  enableMusic: true,
  enableHandoffs: true,
});

// Initialize (loads persona, tools, memory, etc.)
await session.initialize();

// Connect to PersonaPlex server
await session.connect();

// Process conversation turns
session.on('audio', (data) => playAudio(data.audio));
session.on('text', (data) => console.log('Agent:', data.text));
session.on('toolTrigger', async ({ tool, params }) => {
  const result = await executeTool(tool, params);
  // Result automatically injected into next prompt
});
session.on('handoffRequested', ({ targetPersonaId, reason }) => {
  // Handle handoff to another persona
  await session.executeHandoff({ targetPersonaId, reason });
});

// Process user speech
const turnContext = await session.processTurn(userTranscript);
// turnContext includes: analysis, memoryContext, behavioralSignals, fullPrompt

// Cleanup
await session.cleanup();
```

### SSML to Text Translation

Translate Ferni's rich humanization guidance to text:

```typescript
import { translateSSMLToText } from './integrations/personaplex/humanization/index.js';

const guidance = await translateSSMLToText({
  userEmotion: 'anxious',
  intensity: 0.8,
  personaId: 'ferni',
  turnCount: 5,
  trustLevel: 7,
  isSensitiveTopic: true,
});

// guidance.voiceGuidance contains full text-based instructions
// guidance.components has individual guidance sections
// guidance.suggestedOpening has recommended opening phrase
```

### Tool Execution

Execute tools detected from agent speech:

```typescript
import { createToolExecutor } from './integrations/personaplex/tools/index.js';

const executor = createToolExecutor({
  userId: 'user-123',
  sessionId: 'session-456',
  personaId: 'ferni',
  lastUserTranscript: '',
  services: myServices,
});

await executor.initialize({ id: 'ferni', displayName: 'Ferni' });

// Process agent speech and execute detected tools
const results = await executor.processAgentSpeech('Let me check your calendar for tomorrow');

// Build context from tool results
const toolContext = executor.buildToolResultContext();
```

### Starting PersonaPlex Server (Self-hosted)

```bash
# On GPU machine
cd personaplex
SSL_DIR=$(mktemp -d); python -m moshi.server --ssl "$SSL_DIR" --voice-prompt-dir ./voices
```

### Using with Ferni

```typescript
import { PersonaPlexClient } from './integrations/personaplex/client.js';
import { buildPersonaPlexPrompt } from './integrations/personaplex/prompt-builder.js';

const client = new PersonaPlexClient({
  url: process.env.PERSONAPLEX_URL,
});

// Build prompt from persona
const prompt = await buildPersonaPlexPrompt('ferni', {
  userId,
  sessionContext,
  memoryContext,
});

// Connect with persona voice and prompt
await client.connect({
  voicePrompt: 'ferni.pt',
  textPrompt: prompt,
});
```

---

## Migration Path

### Phase 1: Voice Embedding Generation

- Generate voice samples from Cartesia
- Create PersonaPlex embeddings for all personas
- Test voice quality parity

### Phase 2: Prompt Adaptation

- Convert persona system prompts to PersonaPlex format
- Implement context injection for memory
- Test conversational quality

### Phase 3: Tool Integration

- Implement phrase-based tool detection
- Build tool execution outside voice loop
- Test tool reliability

### Phase 4: Production Deployment

- Set up GPU infrastructure
- Implement fallback to current pipeline
- A/B test with users

---

## Known Limitations

1. **No native function calling**: Tools must be triggered via speech patterns
2. **GPU required**: PersonaPlex requires NVIDIA GPU for inference
3. **Voice quality**: Custom embeddings may not match Cartesia quality
4. **Context window**: Text prompt length is limited

---

## Related Documentation

- PersonaPlex: https://github.com/NVIDIA/personaplex
- Moshi Architecture: https://arxiv.org/abs/2410.00037
- Current voice pipeline: `src/agents/CLAUDE.md`
- Persona system: `src/personas/CLAUDE.md`

---

_Created: February 2026_
