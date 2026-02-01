# PersonaPlex Integration Plan

> **⚠️ IMPORTANT UPDATE (January 2026)**
>
> After discovering **BTCW (Better Than Cartesia Work)** already exists in `apps/btcw/`, we recommend:
>
> - **Primary System**: BTCW + CosyVoice 3 (12 superhuman capabilities, full SSML)
> - **Secondary/Research**: PersonaPlex (for full-duplex scenarios)
>
> See `VOICE-SYSTEMS-UNIFIED-STRATEGY.md` for the complete comparison.
> See `BTCW-INTEGRATION-PLAN.md` for the recommended implementation path.

> **Goal**: Integrate NVIDIA PersonaPlex for custom voice fine-tuning, enabling Ferni personas to have truly unique, fine-tuned voices with full-duplex speech-to-speech capabilities.

**Status**: 🟡 Planning (Deprioritized - see BTCW)
**Owner**: Engineering Team
**Last Updated**: January 2026

---

## Executive Summary

PersonaPlex is NVIDIA's real-time full-duplex speech-to-speech model that enables:

- **Custom voice conditioning** via audio embeddings (no per-voice training needed)
- **Text-based persona control** via role prompts
- **True full-duplex** conversation (listen while speaking)
- **Low latency** real-time synthesis

This plan outlines how to integrate PersonaPlex into Ferni's voice architecture, enabling custom-trained voices for all 6 personas while maintaining our existing capabilities as fallback.

---

## Table of Contents

1. [Phase 1: Evaluation & Proof of Concept](#phase-1-evaluation--proof-of-concept)
2. [Phase 2: Voice Embedding Pipeline](#phase-2-voice-embedding-pipeline)
3. [Phase 3: Model Provider Implementation](#phase-3-model-provider-implementation)
4. [Phase 4: Infrastructure & Deployment](#phase-4-infrastructure--deployment)
5. [Phase 5: Testing & Quality Assurance](#phase-5-testing--quality-assurance)
6. [Phase 6: Production Rollout](#phase-6-production-rollout)
7. [Risk Assessment](#risk-assessment)
8. [Success Metrics](#success-metrics)

---

## Phase 1: Evaluation & Proof of Concept

### Objectives

- Set up local PersonaPlex environment
- Extract voice embeddings for Ferni
- Compare quality against Cartesia
- Measure latency characteristics

### Tasks

#### 1.1 Environment Setup

```bash
# Create experiment directory
mkdir -p apps/experiments/personaplex
cd apps/experiments/personaplex

# Clone PersonaPlex
git clone https://github.com/NVIDIA/personaplex.git
cd personaplex

# Install dependencies
pip install moshi/.

# Accept HuggingFace license
# https://huggingface.co/nvidia/personaplex-7b-v1
export HF_TOKEN=<token>
```

#### 1.2 Voice Sample Collection

| Persona | Voice Actor | Recording Requirements             |
| ------- | ----------- | ---------------------------------- |
| Ferni   | TBD         | 60 sec warm, coaching tone         |
| Maya    | TBD         | 60 sec energetic, habit-focused    |
| Peter   | TBD         | 60 sec analytical, research-like   |
| Alex    | TBD         | 60 sec professional, communication |
| Jordan  | TBD         | 60 sec organized, planning-focused |
| Nayan   | TBD         | 60 sec wise, philosophical         |

**Recording Specifications:**

- Sample rate: 24kHz (Mimi codec requirement)
- Format: WAV, mono
- Environment: Quiet room, minimal reverb
- Content: Varied sentences, emotional range
- Duration: 30-60 seconds minimum per persona

#### 1.3 Evaluation Scripts

Create `apps/experiments/personaplex/`:

```
apps/experiments/personaplex/
├── README.md                    # Setup instructions
├── requirements.txt             # Python dependencies
├── voices/                      # Voice samples & embeddings
│   ├── samples/                 # Raw audio recordings
│   └── embeddings/              # Extracted .pt files
├── scripts/
│   ├── extract_embedding.py     # Extract Mimi voice embedding
│   ├── offline_test.py          # Test with sample conversations
│   ├── compare_quality.py       # A/B test vs Cartesia
│   ├── measure_latency.py       # Latency benchmarks
│   └── server_test.py           # Test live server mode
└── results/                     # Test results & reports
```

#### 1.4 Deliverables

- [ ] Working PersonaPlex local environment
- [ ] Voice embedding for Ferni (proof of concept)
- [ ] Quality comparison report (PersonaPlex vs Cartesia)
- [ ] Latency benchmark report
- [ ] Go/No-Go decision document

---

## Phase 2: Voice Embedding Pipeline

### Objectives

- Create automated voice embedding extraction
- Build voice registry for PersonaPlex embeddings
- Establish voice sample management workflow

### Tasks

#### 2.1 Voice Embedding Extractor

```typescript
// src/speech/personaplex/embedding-extractor.ts

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaPlexEmbeddingExtractor' });

/**
 * Configuration for voice embedding extraction
 */
export interface EmbeddingExtractionConfig {
  /** Path to input audio file (24kHz WAV) */
  audioPath: string;
  /** Output path for .pt embedding file */
  outputPath: string;
  /** Optional: normalize audio before extraction */
  normalize?: boolean;
  /** Optional: trim silence from audio */
  trimSilence?: boolean;
}

/**
 * Extract a voice embedding from an audio sample using Mimi encoder.
 *
 * The embedding captures:
 * - Voice timbre
 * - Speaking style
 * - Prosody characteristics
 *
 * @param config Extraction configuration
 * @returns Path to the generated embedding file
 */
export async function extractVoiceEmbedding(config: EmbeddingExtractionConfig): Promise<string> {
  const { audioPath, outputPath, normalize = true, trimSilence = true } = config;

  // Validate input exists
  await fs.access(audioPath);

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  log.info({ audioPath, outputPath }, '🎙️ Extracting voice embedding');

  return new Promise((resolve, reject) => {
    const args = ['-m', 'moshi.extract_embedding', '--audio', audioPath, '--output', outputPath];

    if (normalize) args.push('--normalize');
    if (trimSilence) args.push('--trim-silence');

    const process = spawn('python', args, {
      cwd: path.join(__dirname, '../../../apps/experiments/personaplex/personaplex'),
    });

    let stderr = '';
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        log.info({ outputPath }, '✅ Voice embedding extracted');
        resolve(outputPath);
      } else {
        log.error({ code, stderr }, '❌ Embedding extraction failed');
        reject(new Error(`Embedding extraction failed: ${stderr}`));
      }
    });
  });
}

/**
 * Batch extract embeddings for all personas
 */
export async function extractAllPersonaEmbeddings(
  samplesDir: string,
  outputDir: string
): Promise<Map<string, string>> {
  const personas = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan'];
  const results = new Map<string, string>();

  for (const persona of personas) {
    const audioPath = path.join(samplesDir, `${persona}.wav`);
    const outputPath = path.join(outputDir, `${persona}.pt`);

    try {
      await extractVoiceEmbedding({ audioPath, outputPath });
      results.set(persona, outputPath);
    } catch (error) {
      log.warn({ persona, error }, `⚠️ Failed to extract embedding for ${persona}`);
    }
  }

  return results;
}
```

#### 2.2 Voice Registry

```typescript
// src/speech/personaplex/voice-registry.ts

import path from 'path';
import { promises as fs } from 'fs';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaPlexVoiceRegistry' });

/**
 * PersonaPlex voice embedding registry.
 * Maps persona IDs to their voice embedding files.
 */
export interface PersonaPlexVoiceConfig {
  /** Path to .pt embedding file */
  embeddingPath: string;
  /** Fallback to pre-packaged voice if custom not available */
  fallbackVoice?: string;
  /** Voice quality score from evaluation (0-1) */
  qualityScore?: number;
  /** Last updated timestamp */
  lastUpdated?: Date;
}

/**
 * Pre-packaged PersonaPlex voices (from NVIDIA)
 */
export const PREPACKAGED_VOICES = {
  // Natural voices (more conversational)
  NATF0: 'NATF0.pt',
  NATF1: 'NATF1.pt',
  NATF2: 'NATF2.pt',
  NATF3: 'NATF3.pt',
  NATM0: 'NATM0.pt',
  NATM1: 'NATM1.pt',
  NATM2: 'NATM2.pt',
  NATM3: 'NATM3.pt',
  // Variety voices (more expressive range)
  VARF0: 'VARF0.pt',
  VARF1: 'VARF1.pt',
  VARF2: 'VARF2.pt',
  VARF3: 'VARF3.pt',
  VARF4: 'VARF4.pt',
  VARM0: 'VARM0.pt',
  VARM1: 'VARM1.pt',
  VARM2: 'VARM2.pt',
  VARM3: 'VARM3.pt',
  VARM4: 'VARM4.pt',
} as const;

/**
 * Ferni persona voice configurations.
 * Custom embeddings take priority; fallback to pre-packaged if not available.
 */
export const PERSONAPLEX_VOICE_CONFIG: Record<string, PersonaPlexVoiceConfig> = {
  ferni: {
    embeddingPath: 'voices/personaplex/ferni.pt',
    fallbackVoice: 'NATF2', // Warm female voice
  },
  maya: {
    embeddingPath: 'voices/personaplex/maya.pt',
    fallbackVoice: 'NATF1', // Energetic female voice
  },
  peter: {
    embeddingPath: 'voices/personaplex/peter.pt',
    fallbackVoice: 'NATM2', // Analytical male voice
  },
  alex: {
    embeddingPath: 'voices/personaplex/alex.pt',
    fallbackVoice: 'NATM1', // Professional male voice
  },
  jordan: {
    embeddingPath: 'voices/personaplex/jordan.pt',
    fallbackVoice: 'NATF3', // Organized female voice
  },
  nayan: {
    embeddingPath: 'voices/personaplex/nayan.pt',
    fallbackVoice: 'NATM3', // Wise elder male voice
  },
  // Financial legends
  'joel-dickson': {
    embeddingPath: 'voices/personaplex/joel-dickson.pt',
    fallbackVoice: 'NATM0',
  },
  'peter-lynch': {
    embeddingPath: 'voices/personaplex/peter-lynch.pt',
    fallbackVoice: 'VARM1',
  },
  'john-bogle': {
    embeddingPath: 'voices/personaplex/john-bogle.pt',
    fallbackVoice: 'VARM0',
  },
};

/**
 * Get the voice embedding path for a persona.
 * Falls back to pre-packaged voice if custom not available.
 */
export async function getPersonaPlexVoicePath(personaId: string): Promise<string> {
  const config = PERSONAPLEX_VOICE_CONFIG[personaId.toLowerCase()];

  if (!config) {
    log.warn({ personaId }, '⚠️ Unknown persona, using default voice');
    return PREPACKAGED_VOICES.NATF2;
  }

  // Check if custom embedding exists
  try {
    await fs.access(config.embeddingPath);
    return config.embeddingPath;
  } catch {
    // Fall back to pre-packaged
    log.info({ personaId, fallback: config.fallbackVoice }, '📢 Using fallback pre-packaged voice');
    return (
      PREPACKAGED_VOICES[config.fallbackVoice as keyof typeof PREPACKAGED_VOICES] ||
      PREPACKAGED_VOICES.NATF2
    );
  }
}

/**
 * Check which personas have custom voice embeddings
 */
export async function getVoiceEmbeddingStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};

  for (const [personaId, config] of Object.entries(PERSONAPLEX_VOICE_CONFIG)) {
    try {
      await fs.access(config.embeddingPath);
      status[personaId] = true;
    } catch {
      status[personaId] = false;
    }
  }

  return status;
}
```

#### 2.3 CLI Commands

```typescript
// apps/cli/src/commands/voices/personaplex.ts

import { Command } from 'commander';

export const personaplexCommand = new Command('personaplex')
  .description('PersonaPlex voice management')
  .addCommand(
    new Command('extract')
      .description('Extract voice embedding from audio sample')
      .argument('<audio>', 'Path to audio file (24kHz WAV)')
      .argument('<output>', 'Output path for .pt file')
      .action(async (audio, output) => {
        const { extractVoiceEmbedding } =
          await import('../../../../src/speech/personaplex/embedding-extractor.js');
        await extractVoiceEmbedding({ audioPath: audio, outputPath: output });
        console.log(`✅ Embedding saved to ${output}`);
      })
  )
  .addCommand(
    new Command('extract-all')
      .description('Extract embeddings for all personas')
      .option('-s, --samples <dir>', 'Samples directory', 'voices/samples')
      .option('-o, --output <dir>', 'Output directory', 'voices/personaplex')
      .action(async (options) => {
        const { extractAllPersonaEmbeddings } =
          await import('../../../../src/speech/personaplex/embedding-extractor.js');
        const results = await extractAllPersonaEmbeddings(options.samples, options.output);
        console.log(`✅ Extracted ${results.size} embeddings`);
      })
  )
  .addCommand(
    new Command('status')
      .description('Show voice embedding status for all personas')
      .action(async () => {
        const { getVoiceEmbeddingStatus } =
          await import('../../../../src/speech/personaplex/voice-registry.js');
        const status = await getVoiceEmbeddingStatus();
        console.log('\n📊 PersonaPlex Voice Embedding Status:\n');
        for (const [persona, hasEmbedding] of Object.entries(status)) {
          const icon = hasEmbedding ? '✅' : '❌';
          console.log(`  ${icon} ${persona}`);
        }
      })
  )
  .addCommand(
    new Command('test')
      .description('Test voice with sample text')
      .argument('<persona>', 'Persona ID')
      .argument('[text]', 'Text to synthesize', 'Hello, I am your AI companion.')
      .option('-o, --output <file>', 'Output audio file', 'test-output.wav')
      .action(async (persona, text, options) => {
        // Implementation: call PersonaPlex offline mode
        console.log(`🎙️ Testing ${persona} voice...`);
        // TODO: Implement test synthesis
      })
  );
```

#### 2.4 Deliverables

- [ ] `src/speech/personaplex/embedding-extractor.ts`
- [ ] `src/speech/personaplex/voice-registry.ts`
- [ ] CLI commands: `ferni personaplex extract|status|test`
- [ ] Voice samples for all 6 core personas
- [ ] Extracted embeddings in `voices/personaplex/`

---

## Phase 3: Model Provider Implementation

### Objectives

- Create PersonaPlex model provider
- Implement WebSocket client for PersonaPlex server
- Handle function calling via JSON workaround
- Support persona handoffs

### Tasks

#### 3.1 PersonaPlex Model Provider

```typescript
// src/agents/model-provider/personaplex.ts

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
  LLMModelConfig,
} from './types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaPlexVoicePath } from '../../speech/personaplex/voice-registry.js';

const log = createLogger({ module: 'PersonaPlexProvider' });

/**
 * PersonaPlex Model Provider
 *
 * Implements full-duplex speech-to-speech using NVIDIA PersonaPlex.
 * This provider is fundamentally different from OpenAI/Gemini:
 * - End-to-end speech (no separate STT/TTS)
 * - Voice conditioning via embeddings
 * - True full-duplex (can listen while speaking)
 */
export class PersonaPlexProvider implements ModelProvider {
  readonly id: ModelProviderId = 'personaplex' as ModelProviderId;
  readonly displayName = 'PersonaPlex Speech-to-Speech';

  private serverUrl: string;

  constructor() {
    this.serverUrl = process.env.PERSONAPLEX_URL || 'wss://localhost:8998';
  }

  // =========================================================================
  // CAPABILITIES
  // =========================================================================

  hasNativeFunctionCalling(): boolean {
    // PersonaPlex uses text output → need JSON workaround like Gemini
    return false;
  }

  needsJsonWorkaround(): boolean {
    return true;
  }

  hasBuiltInTurnDetection(): boolean {
    // Moshi has native full-duplex turn handling
    return true;
  }

  // =========================================================================
  // PROMPT CONFIGURATION
  // =========================================================================

  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: true, // Need JSON format instructions
      includeFunctionCallingSpecialty: true, // Per-persona tool examples
      includeToolUsageGuidance: true, // When to use tools
      includeModelBaseInstructions: true, // Full instructions
      useMinimalInstructions: false,
    };
  }

  getTokenLimit(): number {
    // PersonaPlex (Moshi-based) has similar limits to Gemini
    return 30000;
  }

  getMinimalInstructions(): string {
    return `You are a helpful AI assistant. Respond naturally and conversationally.`;
  }

  // =========================================================================
  // SESSION CONFIGURATION
  // =========================================================================

  getSessionTurnDetection(): 'realtime_llm' | undefined {
    // PersonaPlex handles turn detection internally
    return undefined;
  }

  needsPrewarm(): boolean {
    // May benefit from prewarm for model loading
    return true;
  }

  getLogPrefix(): string {
    return '🎭'; // PersonaPlex emoji
  }

  // =========================================================================
  // MODEL CREATION
  // =========================================================================

  async createLLMModel(config: LLMModelConfig): Promise<PersonaPlexSession> {
    const personaId = (config as any).personaId || 'ferni';
    const voicePath = await getPersonaPlexVoicePath(personaId);

    log.info(
      { personaId, voicePath, serverUrl: this.serverUrl },
      '🎭 Creating PersonaPlex session'
    );

    return new PersonaPlexSession({
      serverUrl: this.serverUrl,
      voicePrompt: voicePath,
      textPrompt: config.instructions,
      temperature: config.temperature ?? 0.7,
      personaId,
    });
  }
}

/**
 * PersonaPlex Session
 *
 * Manages WebSocket connection to PersonaPlex server.
 * Handles bidirectional audio streaming and text responses.
 */
export class PersonaPlexSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: PersonaPlexSessionConfig;
  private isConnected = false;

  constructor(config: PersonaPlexSessionConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to PersonaPlex server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.serverUrl, {
        headers: {
          'X-Voice-Prompt': this.config.voicePrompt,
          'X-Text-Prompt': this.config.textPrompt,
        },
      });

      this.ws.on('open', () => {
        log.info({ personaId: this.config.personaId }, '✅ PersonaPlex connected');
        this.isConnected = true;

        // Send initial configuration
        this.ws?.send(
          JSON.stringify({
            type: 'configure',
            voice_prompt: this.config.voicePrompt,
            text_prompt: this.config.textPrompt,
            temperature: this.config.temperature,
          })
        );

        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        log.error({ error }, '❌ PersonaPlex WebSocket error');
        reject(error);
      });

      this.ws.on('close', () => {
        log.info({}, 'PersonaPlex connection closed');
        this.isConnected = false;
        this.emit('close');
      });
    });
  }

  /**
   * Send audio frame to PersonaPlex
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (!this.isConnected || !this.ws) {
      log.warn({}, 'Cannot send audio - not connected');
      return;
    }

    this.ws.send(audioData);
  }

  /**
   * Handle incoming messages from PersonaPlex
   */
  private handleMessage(data: WebSocket.Data): void {
    // Check if it's audio data (binary)
    if (data instanceof Buffer || data instanceof ArrayBuffer) {
      this.emit('audio', data);
      return;
    }

    // Parse JSON message
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'transcript':
          // User speech transcription
          this.emit('user_transcript', message.text);
          break;

        case 'response_text':
          // Model's text response (for logging/function call detection)
          this.emit('response_text', message.text);
          break;

        case 'function_call':
          // JSON function call detected
          this.emit('function_call', {
            fn: message.fn,
            args: message.args,
          });
          break;

        case 'turn_start':
          this.emit('turn_start');
          break;

        case 'turn_end':
          this.emit('turn_end');
          break;

        default:
          log.debug({ type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      log.warn({ error }, 'Failed to parse PersonaPlex message');
    }
  }

  /**
   * Send function call result back to PersonaPlex
   */
  sendFunctionResult(fn: string, result: unknown): void {
    if (!this.isConnected || !this.ws) return;

    this.ws.send(
      JSON.stringify({
        type: 'function_result',
        fn,
        result,
      })
    );
  }

  /**
   * Update persona (for handoffs)
   */
  async updatePersona(personaId: string, textPrompt: string): Promise<void> {
    const voicePath = await getPersonaPlexVoicePath(personaId);

    if (!this.ws || !this.isConnected) {
      throw new Error('Not connected');
    }

    log.info({ personaId, voicePath }, '🔄 Updating PersonaPlex persona');

    this.ws.send(
      JSON.stringify({
        type: 'update_persona',
        voice_prompt: voicePath,
        text_prompt: textPrompt,
      })
    );

    this.config.personaId = personaId;
    this.config.voicePrompt = voicePath;
    this.config.textPrompt = textPrompt;
  }

  /**
   * Disconnect from PersonaPlex
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

interface PersonaPlexSessionConfig {
  serverUrl: string;
  voicePrompt: string;
  textPrompt: string;
  temperature: number;
  personaId: string;
}
```

#### 3.2 Factory Update

```typescript
// src/agents/model-provider/factory.ts (UPDATE)

import { PersonaPlexProvider } from './personaplex.js';

export function getModelProvider(): ModelProvider {
  // PersonaPlex (requires GPU, full-duplex speech-to-speech)
  if (process.env.USE_PERSONAPLEX === 'true') {
    return new PersonaPlexProvider();
  }

  // OpenAI Realtime (recommended default)
  if (process.env.USE_OPENAI_REALTIME === 'true') {
    return new OpenAIRealtimeProvider();
  }

  // Gemini Live (fallback)
  return new GeminiLiveProvider();
}

export function isUsingPersonaPlex(): boolean {
  return process.env.USE_PERSONAPLEX === 'true';
}
```

#### 3.3 LiveKit Integration

```typescript
// src/agents/integrations/personaplex-livekit-bridge.ts

import type { JobContext } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { PersonaPlexSession } from '../model-provider/personaplex.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaPlexLiveKitBridge' });

/**
 * Bridge between LiveKit audio streams and PersonaPlex.
 *
 * Unlike OpenAI/Gemini which use text mode + Cartesia TTS,
 * PersonaPlex handles audio end-to-end.
 */
export class PersonaPlexLiveKitBridge {
  private session: PersonaPlexSession;
  private ctx: JobContext;

  constructor(session: PersonaPlexSession, ctx: JobContext) {
    this.session = session;
    this.ctx = ctx;
  }

  /**
   * Start bridging audio between LiveKit and PersonaPlex
   */
  async start(): Promise<void> {
    // Connect to PersonaPlex
    await this.session.connect();

    // Forward user audio to PersonaPlex
    this.ctx.room.on('audioFrameReceived', (frame: AudioFrame) => {
      this.session.sendAudio(frame.data.buffer);
    });

    // Forward PersonaPlex audio to LiveKit
    this.session.on('audio', (audioData: ArrayBuffer) => {
      // Convert to LiveKit AudioFrame and publish
      this.publishAudioToLiveKit(audioData);
    });

    // Handle transcripts for logging/UI
    this.session.on('user_transcript', (text: string) => {
      log.debug({ text }, '👤 User transcript');
      // Emit to frontend via data channel
    });

    this.session.on('response_text', (text: string) => {
      log.debug({ text: text.slice(0, 100) }, '🤖 Response text');
      // Check for JSON function calls
      this.checkForFunctionCall(text);
    });
  }

  private publishAudioToLiveKit(audioData: ArrayBuffer): void {
    // Convert ArrayBuffer to LiveKit AudioFrame format
    // and publish to the room
    // Implementation depends on LiveKit SDK specifics
  }

  private checkForFunctionCall(text: string): void {
    // Use existing JSON function call detection
    // from src/agents/shared/sanitizer/
  }

  async stop(): Promise<void> {
    this.session.disconnect();
  }
}
```

#### 3.4 Deliverables

- [ ] `src/agents/model-provider/personaplex.ts`
- [ ] `src/agents/model-provider/factory.ts` (updated)
- [ ] `src/agents/integrations/personaplex-livekit-bridge.ts`
- [ ] Unit tests for PersonaPlex provider
- [ ] Integration tests for audio bridging

---

## Phase 4: Infrastructure & Deployment

### Objectives

- Set up GCE instance with GPU for PersonaPlex
- Deploy PersonaPlex server container
- Configure networking and health checks
- Set up monitoring and alerting

### Tasks

#### 4.1 GCE Instance Configuration

```yaml
# infra/personaplex-gce.yaml

apiVersion: compute/v1
kind: Instance
metadata:
  name: personaplex-voice
  zone: us-central1-a
spec:
  machineType: n1-standard-4

  accelerators:
    - acceleratorType: nvidia-tesla-t4
      acceleratorCount: 1

  disks:
    - boot: true
      autoDelete: true
      initializeParams:
        sourceImage: projects/ml-images/global/images/c0-deeplearning-common-cu121-v20240128-debian-11
        diskSizeGb: 100
        diskType: pd-ssd

  networkInterfaces:
    - network: global/networks/default
      accessConfigs:
        - name: External NAT
          type: ONE_TO_ONE_NAT

  metadata:
    items:
      - key: startup-script
        value: |
          #!/bin/bash
          # Install Docker
          curl -fsSL https://get.docker.com | sh

          # Pull PersonaPlex container
          docker pull gcr.io/ferni-prod/personaplex:latest

          # Start PersonaPlex server
          docker run -d \
            --name personaplex \
            --gpus all \
            -p 8998:8998 \
            -v /voices:/voices \
            -e HF_TOKEN=${HF_TOKEN} \
            gcr.io/ferni-prod/personaplex:latest

  tags:
    items:
      - personaplex
      - gpu-instance

  serviceAccounts:
    - email: default
      scopes:
        - https://www.googleapis.com/auth/cloud-platform
```

#### 4.2 Docker Container

```dockerfile
# docker/personaplex/Dockerfile

FROM nvidia/cuda:12.1-runtime-ubuntu22.04

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone and install PersonaPlex
WORKDIR /app
RUN git clone https://github.com/NVIDIA/personaplex.git
WORKDIR /app/personaplex
RUN pip install moshi/.

# Copy voice embeddings
COPY voices/ /voices/

# Expose port
EXPOSE 8998

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8998/health || exit 1

# Start server with SSL (using temp certs for internal communication)
CMD ["python", "-m", "moshi.server", "--port", "8998", "--voices-dir", "/voices"]
```

#### 4.3 Deploy Command

```typescript
// apps/cli/src/commands/deploy/deploy-personaplex.ts

import { Command } from 'commander';

export const deployPersonaplexCommand = new Command('personaplex')
  .description('Deploy PersonaPlex voice server to GCE')
  .option('--dry-run', 'Preview deployment without executing')
  .action(async (options) => {
    console.log('🎭 Deploying PersonaPlex to GCE...\n');

    // 1. Build container
    console.log('📦 Building container...');
    // docker build -t gcr.io/ferni-prod/personaplex:latest -f docker/personaplex/Dockerfile .

    // 2. Push to GCR
    console.log('☁️ Pushing to Container Registry...');
    // docker push gcr.io/ferni-prod/personaplex:latest

    // 3. Create/update GCE instance
    console.log('🖥️ Creating GCE instance with GPU...');
    // gcloud compute instances create personaplex-voice --config infra/personaplex-gce.yaml

    // 4. Wait for health check
    console.log('🏥 Waiting for health check...');
    // curl http://<ip>:8998/health

    // 5. Update DNS/routing
    console.log('🌐 Updating routing...');

    console.log('\n✅ PersonaPlex deployed successfully!');
    console.log('   URL: wss://personaplex.ferni.ai:8998');
  });
```

#### 4.4 Environment Variables

```bash
# .env additions for PersonaPlex

# Enable PersonaPlex (requires GPU instance)
USE_PERSONAPLEX=false

# PersonaPlex server URL
PERSONAPLEX_URL=wss://personaplex.ferni.ai:8998

# HuggingFace token for model download
HF_TOKEN=hf_xxx

# Voice embeddings directory
PERSONAPLEX_VOICES_DIR=/voices/personaplex
```

#### 4.5 Cost Estimates

| Resource          | Specification    | Monthly Cost    |
| ----------------- | ---------------- | --------------- |
| GCE n1-standard-4 | 4 vCPU, 15GB RAM | ~$100           |
| NVIDIA T4 GPU     | 16GB VRAM        | ~$250           |
| SSD Storage       | 100GB            | ~$17            |
| Network egress    | Estimated 500GB  | ~$60            |
| **Total**         |                  | **~$427/month** |

_Compare to current: Voice agent GCE (~$150) + Cartesia API (~$200-500)_

#### 4.6 Deliverables

- [ ] `infra/personaplex-gce.yaml`
- [ ] `docker/personaplex/Dockerfile`
- [ ] `apps/cli/src/commands/deploy/deploy-personaplex.ts`
- [ ] Firewall rules for port 8998
- [ ] Health check endpoint
- [ ] Monitoring dashboard in Cloud Monitoring

---

## Phase 5: Testing & Quality Assurance

### Objectives

- Comprehensive unit and integration tests
- Voice quality benchmarks
- Latency performance tests
- A/B testing infrastructure

### Tasks

#### 5.1 Test Suite Structure

```
src/tests/personaplex/
├── unit/
│   ├── embedding-extractor.test.ts
│   ├── voice-registry.test.ts
│   └── personaplex-provider.test.ts
├── integration/
│   ├── personaplex-session.test.ts
│   ├── livekit-bridge.test.ts
│   └── handoff.test.ts
├── e2e/
│   ├── full-conversation.test.ts
│   ├── function-calling.test.ts
│   └── multi-persona.test.ts
└── benchmarks/
    ├── latency.bench.ts
    ├── voice-quality.bench.ts
    └── throughput.bench.ts
```

#### 5.2 Voice Quality Metrics

```typescript
// src/tests/personaplex/benchmarks/voice-quality.bench.ts

import { describe, it, expect } from 'vitest';

describe('Voice Quality Benchmarks', () => {
  /**
   * Speaker Similarity Score
   * Using WavLM TDNN embeddings (same as PersonaPlex paper)
   * Target: > 0.65 similarity score
   */
  it('should achieve high speaker similarity', async () => {
    const referenceAudio = await loadAudio('voices/samples/ferni.wav');
    const synthesizedAudio = await synthesizeWithPersonaPlex(
      'ferni',
      'Hello, I am Ferni, your AI life coach.'
    );

    const similarity = await calculateWavLMSimilarity(referenceAudio, synthesizedAudio);

    expect(similarity).toBeGreaterThan(0.65);
  });

  /**
   * Naturalness Score (MOS estimation)
   * Target: > 4.0 MOS (Mean Opinion Score)
   */
  it('should sound natural', async () => {
    const audio = await synthesizeWithPersonaPlex(
      'ferni',
      'Let me share something with you that I have been thinking about.'
    );

    const mosScore = await estimateMOS(audio);

    expect(mosScore).toBeGreaterThan(4.0);
  });

  /**
   * Cartesia Comparison
   * PersonaPlex should be at least as good as Cartesia
   */
  it('should match or exceed Cartesia quality', async () => {
    const text = 'I understand how you feel. Let us work through this together.';

    const personaplexAudio = await synthesizeWithPersonaPlex('ferni', text);
    const cartesiaAudio = await synthesizeWithCartesia('ferni', text);

    const personaplexMOS = await estimateMOS(personaplexAudio);
    const cartesiaMOS = await estimateMOS(cartesiaAudio);

    // PersonaPlex should be within 0.2 MOS of Cartesia
    expect(personaplexMOS).toBeGreaterThanOrEqual(cartesiaMOS - 0.2);
  });
});
```

#### 5.3 Latency Benchmarks

```typescript
// src/tests/personaplex/benchmarks/latency.bench.ts

describe('Latency Benchmarks', () => {
  /**
   * Time to First Audio Byte (TTFAB)
   * Target: < 300ms (matching current Cartesia performance)
   */
  it('should achieve low TTFAB', async () => {
    const startTime = Date.now();

    const session = await createPersonaPlexSession('ferni');
    session.sendAudio(userAudioChunk);

    await new Promise<void>((resolve) => {
      session.once('audio', () => {
        const ttfab = Date.now() - startTime;
        expect(ttfab).toBeLessThan(300);
        resolve();
      });
    });
  });

  /**
   * End-to-end latency
   * Target: < 500ms from end of user speech to start of response
   */
  it('should achieve low E2E latency', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 10; i++) {
      const latency = await measureE2ELatency('ferni', 'How are you today?');
      latencies.push(latency);
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    expect(avgLatency).toBeLessThan(400);
    expect(p95Latency).toBeLessThan(500);
  });
});
```

#### 5.4 A/B Testing

```typescript
// src/services/experiments/personaplex-ab-test.ts

import { ExperimentManager } from '../../tools/intelligence/learning/experiment-manager.js';

/**
 * A/B test configuration for PersonaPlex vs Cartesia
 */
export const PERSONAPLEX_AB_TEST = {
  id: 'personaplex-voice-quality',
  name: 'PersonaPlex vs Cartesia Voice Quality',
  variants: {
    control: { provider: 'cartesia' },
    treatment: { provider: 'personaplex' },
  },
  metrics: [
    'user_satisfaction_rating',
    'conversation_duration',
    'turn_count',
    'interruption_rate',
    'return_rate_7d',
  ],
  trafficAllocation: 0.1, // Start with 10% in treatment
  minSampleSize: 1000,
};

export async function setupPersonaPlexABTest(): Promise<void> {
  const manager = new ExperimentManager();
  await manager.createExperiment(PERSONAPLEX_AB_TEST);
}
```

#### 5.5 Deliverables

- [ ] Unit test suite (>80% coverage)
- [ ] Integration test suite
- [ ] E2E test suite
- [ ] Latency benchmark suite
- [ ] Voice quality benchmark suite
- [ ] A/B testing configuration
- [ ] Quality gate in CI/CD

---

## Phase 6: Production Rollout

### Objectives

- Gradual rollout with feature flags
- Monitoring and alerting
- Rollback procedures
- Documentation

### Tasks

#### 6.1 Feature Flag Configuration

```typescript
// src/services/feature-flags/personaplex.ts

export const PERSONAPLEX_FLAGS = {
  /**
   * Master switch for PersonaPlex
   * Set via: ferni experiments start personaplex-enabled
   */
  PERSONAPLEX_ENABLED: {
    key: 'personaplex.enabled',
    defaultValue: false,
    description: 'Enable PersonaPlex speech-to-speech',
  },

  /**
   * Rollout percentage (0-100)
   */
  PERSONAPLEX_ROLLOUT_PERCENT: {
    key: 'personaplex.rollout_percent',
    defaultValue: 0,
    description: 'Percentage of sessions using PersonaPlex',
  },

  /**
   * Per-persona enablement
   */
  PERSONAPLEX_PERSONAS: {
    key: 'personaplex.personas',
    defaultValue: [],
    description: 'List of persona IDs using PersonaPlex',
  },

  /**
   * Fallback to Cartesia on PersonaPlex errors
   */
  PERSONAPLEX_FALLBACK_ENABLED: {
    key: 'personaplex.fallback_enabled',
    defaultValue: true,
    description: 'Fall back to Cartesia on PersonaPlex failure',
  },
};
```

#### 6.2 Rollout Schedule

| Stage            | Traffic | Duration | Success Criteria                    |
| ---------------- | ------- | -------- | ----------------------------------- |
| **Canary**       | 1%      | 1 week   | No critical errors, latency < 500ms |
| **Early Access** | 10%     | 2 weeks  | User satisfaction ≥ control         |
| **Limited GA**   | 25%     | 2 weeks  | All metrics stable                  |
| **GA**           | 50%     | 2 weeks  | Positive A/B results                |
| **Full Rollout** | 100%    | -        | Deprecate Cartesia fallback         |

#### 6.3 Monitoring Dashboards

```yaml
# monitoring/personaplex-dashboard.yaml

displayName: PersonaPlex Voice Performance
tiles:
  - title: Sessions by Provider
    chart:
      type: pie
      metrics:
        - provider=personaplex
        - provider=cartesia

  - title: Latency (P50/P95/P99)
    chart:
      type: line
      metrics:
        - personaplex_ttfab_p50
        - personaplex_ttfab_p95
        - personaplex_ttfab_p99

  - title: Error Rate
    chart:
      type: line
      threshold: 0.01 # Alert if > 1%
      metrics:
        - personaplex_error_rate

  - title: Voice Quality Score
    chart:
      type: gauge
      min: 0
      max: 1
      thresholds:
        - value: 0.65
          color: green
        - value: 0.5
          color: yellow
        - value: 0
          color: red
```

#### 6.4 Rollback Procedures

```bash
# Emergency rollback commands

# 1. Disable PersonaPlex immediately
ferni experiments stop personaplex-enabled

# 2. Set rollout to 0%
ferni config set personaplex.rollout_percent 0

# 3. Verify all sessions using Cartesia
ferni metrics live --filter provider=personaplex
# Should show 0 sessions

# 4. Check for any stuck sessions
ferni sessions --filter provider=personaplex --action=migrate

# 5. Generate incident report
ferni incidents create personaplex-rollback --severity=high
```

#### 6.5 Documentation

| Document        | Location                                        | Description       |
| --------------- | ----------------------------------------------- | ----------------- |
| Architecture    | `docs/architecture/PERSONAPLEX-ARCHITECTURE.md` | System design     |
| Operations      | `docs/runbooks/PERSONAPLEX-OPERATIONS.md`       | Ops procedures    |
| Voice Guide     | `docs/guides/PERSONAPLEX-VOICE-SETUP.md`        | How to add voices |
| Troubleshooting | `docs/troubleshooting/PERSONAPLEX.md`           | Common issues     |

#### 6.6 Deliverables

- [ ] Feature flag configuration
- [ ] Rollout plan with gates
- [ ] Monitoring dashboards
- [ ] Alerting rules
- [ ] Rollback procedures
- [ ] Operational documentation
- [ ] User documentation

---

## Risk Assessment

| Risk                         | Probability | Impact | Mitigation                            |
| ---------------------------- | ----------- | ------ | ------------------------------------- |
| **GPU availability**         | Medium      | High   | Use preemptible + reserved instances  |
| **Voice quality regression** | Low         | High   | A/B testing, quality gates            |
| **Latency increase**         | Medium      | Medium | Performance benchmarks, fallback      |
| **Cost overrun**             | Medium      | Medium | Usage monitoring, auto-scaling limits |
| **Integration complexity**   | High        | Medium | Phased approach, feature flags        |
| **PersonaPlex model issues** | Low         | High   | Cartesia fallback always available    |

---

## Success Metrics

### Primary Metrics

| Metric                | Target    | Measurement           |
| --------------------- | --------- | --------------------- |
| **Voice Similarity**  | > 0.65    | WavLM TDNN score      |
| **User Satisfaction** | ≥ Control | Post-session rating   |
| **TTFAB**             | < 300ms   | P95 latency           |
| **Error Rate**        | < 1%      | Failed synthesis rate |

### Secondary Metrics

| Metric                    | Target    | Measurement               |
| ------------------------- | --------- | ------------------------- |
| **Conversation Duration** | ≥ Control | Average session length    |
| **Return Rate**           | ≥ Control | 7-day return rate         |
| **Interruption Handling** | Improved  | Takeover success rate     |
| **Cost per Session**      | ≤ Control | Total infrastructure cost |

---

## Timeline Summary

| Phase                       | Duration  | Key Deliverables                  |
| --------------------------- | --------- | --------------------------------- |
| **Phase 1: Evaluation**     | 1 week    | Go/No-Go decision                 |
| **Phase 2: Voice Pipeline** | 2 weeks   | Embedding extraction, registry    |
| **Phase 3: Model Provider** | 2 weeks   | PersonaPlex provider, integration |
| **Phase 4: Infrastructure** | 1 week    | GCE deployment, monitoring        |
| **Phase 5: Testing**        | 2 weeks   | Test suite, benchmarks, A/B       |
| **Phase 6: Rollout**        | 4-8 weeks | Gradual production rollout        |

**Total: 12-16 weeks**

---

## Next Steps

1. **Immediate**: Set up evaluation environment (`apps/experiments/personaplex/`)
2. **This week**: Record voice samples for Ferni (proof of concept)
3. **Next week**: Extract embedding, run quality comparison
4. **Go/No-Go**: Decision based on Phase 1 results

---

_Document created: January 2026_
_Last updated: January 2026_
