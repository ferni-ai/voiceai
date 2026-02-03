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

| Aspect | Current (OpenAI/Gemini + Cartesia) | PersonaPlex |
|--------|-----------------------------------|-------------|
| **Pipeline** | STT → Text LLM → TTS | Native speech-to-speech |
| **Voice Control** | Cartesia voice IDs | Audio embeddings (`.pt` files) |
| **Turn Detection** | Server VAD | Built-in full-duplex |
| **Function Calling** | Native FC / JSON workaround | Context injection (no native FC) |
| **Latency** | ~300-500ms (3 stages) | ~100-200ms (single model) |
| **Infrastructure** | Cloud APIs | Self-hosted GPU |

---

## Directory Structure

```
personaplex/
├── CLAUDE.md                     # This file
├── index.ts                      # Main exports
├── config.ts                     # Configuration and environment
├── types.ts                      # TypeScript types
├── client.ts                     # PersonaPlex WebSocket client
├── voice-embeddings/
│   ├── generator.ts              # Generate voice embeddings from Cartesia
│   ├── mapping.ts                # Persona → voice embedding mapping
│   └── assets/                   # Pre-generated .pt files (gitignored)
├── prompt-builder.ts             # Build PersonaPlex text prompts from personas
├── context-injector.ts           # Inject memory/tool results into prompts
├── tool-executor.ts              # Execute tools outside voice loop
└── __tests__/
    └── *.test.ts                 # Tests
```

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
|---------|------------------|----------------------|----------|
| Ferni | `fdeb5d75-...` | `ferni.pt` | `NATM1` |
| Maya | `11175483-...` | `maya.pt` | `NATF2` |
| Alex | `81c164d9-...` | `alex.pt` | `NATF1` |
| Peter | `3f04e815-...` | `peter.pt` | `NATM0` |
| Jordan | `b2d14370-...` | `jordan.pt` | `NATF0` |
| Nayan | `52f0a563-...` | `nayan.pt` | `NATM2` |

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

## Usage

### Starting PersonaPlex Server

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

*Created: February 2026*
