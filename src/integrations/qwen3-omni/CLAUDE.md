# Qwen3-Omni Integration

End-to-end omni-modal speech-to-speech pipeline for Ferni, using **Qwen3-Omni Thinker** (audio understanding + reasoning) + **Qwen3-TTS** (persona voice synthesis).

## Architecture

```
User Audio (LiveKit WebRTC)
       │
       ▼
Qwen3-Omni Thinker (MoE 30B, 3.3B active)
  - Audio understanding via Multi-Codec Encoder
  - Text reasoning via MoE Thinker
  - Native function calling (118 tool domains)
  - System prompt: Full persona bundles + memory + context builders
       │
       ├─── Text Response
       │         │
       │         ▼
       │    Qwen3-TTS-1.7B (with voice clone)
       │      - 3-second voice cloning per persona
       │      - Emotion/tone via `instruct` param
       │      - 97ms first-packet latency
       │         │
       │         ▼
       │    Agent Audio (24kHz) → LiveKit → User
       │
       └─── Function Calls (native)
                 │
                 ▼
            Ferni Tool System (118 domains)
                 │
                 ▼
            Results injected into next turn
```

## Key Files

| File                         | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `types.ts`                   | All type definitions                                          |
| `config.ts`                  | Environment config, voice clone configs, GPU requirements     |
| `client.ts`                  | Qwen3-Omni Thinker client (OpenAI-compatible API)             |
| `tts-client.ts`              | Qwen3-TTS client (voice cloning, synthesis, streaming)        |
| `session/session-manager.ts` | Full Ferni integration (persona, memory, tools, humanization) |
| `index.ts`                   | Public API exports                                            |

## Environment Variables

```bash
# Enable Qwen3-Omni
USE_QWEN3_OMNI=true

# Server URLs
QWEN3_OMNI_URL=http://localhost:8000     # Thinker inference server
QWEN3_TTS_URL=http://localhost:8001      # TTS server

# Model config
QWEN3_OMNI_MODEL=Qwen3-Omni             # Model variant
QWEN3_OMNI_QUANTIZATION=int4            # none, int4, int8, gptq
QWEN3_OMNI_TEMPERATURE=0.7
QWEN3_OMNI_MAX_TOKENS=4096

# Feature flags
QWEN3_OMNI_FUNCTION_CALLING=true        # Native FC (default: true)
QWEN3_OMNI_DEBUG=false                  # Debug logging
```

## Voice Cloning Pipeline

1. Generate reference audio from Cartesia for each persona (~3 seconds)
2. Clone voice using `Qwen3TTSClient.cloneVoice()`
3. Cached prompt is reused for all subsequent synthesis calls
4. Fallback: `designVoice()` creates voice from text description

## Local dev without Thinker/TTS (mock)

Set `QWEN3_OMNI_MOCK=true` with `USE_QWEN3_OMNI_DIRECTOR=true` to run Director Mode locally without the Qwen3-Omni or TTS servers. The mock client yields canned text so you can try the Director Console, cast/scene, and WebSocket. See **docs/guides/DIRECTOR-MODE-LOCAL-DEV.md**.

## Quick Start

```typescript
import { createQwen3OmniSession } from './session/index.js';

const session = createQwen3OmniSession({
  sessionId: 'test-session',
  userId: 'user-123',
  personaId: 'ferni',
  services: sessionServices,
  enableHandoffs: true,
  enableMusic: true,
});

await session.initialize();

// Process a text turn
const result = await session.processTurn('Hey, how are you doing?');
// result.agentResponse = "Hey! Great to hear from you..."
// result.audio = { audioData: Uint8Array, sampleRate: 24000, latencyMs: 97 }

// Process audio input directly
const audioResult = await session.processAudioTurn(rawAudioBytes);
```

## Related

- `../../../tools/orchestrator/` - Tool orchestrator
- `../../../memory/dynamic/` - Memory system
- `../../../personas/bundles/` - Persona bundles
