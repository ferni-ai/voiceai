# BTCW Integration Plan: Better Than Human Voice

> **Mission**: Integrate BTCW (Better Than Cartesia Work) into Ferni's voice agent for superhuman TTS with full SSML control and 12+ capabilities that no other system offers.

**Status**: 🟡 Planning Complete - Implementation On Hold
**Priority**: P0 (Core Platform)
**Estimated Effort**: 2-3 weeks

---

## Current State (January 2026)

### Completed

- ✅ BTCW codebase moved to `apps/btcw/`
- ✅ BTCW TTS provider created: `src/speech/tts-gateway/providers/btcw.ts`
- ✅ Provider factory updated with `USE_BTCW_TTS` feature flag
- ✅ Architecture documented (this file + `VOICE-SYSTEMS-UNIFIED-STRATEGY.md`)
- ✅ PersonaPlex comparison completed (BTCW wins for Ferni's use case)

### On Hold (Pending Prioritization)

- ⏸️ Recording 6 persona voice samples
- ⏸️ Deploying CosyVoice 3 server to Cloud Run GPU
- ⏸️ Wiring session context in `turn-processor.ts`
- ⏸️ A/B testing against Cartesia

### Future Enhancement (Not Required)

- 🔮 **Mimi Semantic VAD** - Optional enhancement for smarter interrupt detection
  - Would run parallel to Gemini's built-in VAD (no conflict)
  - Benefits: Distinguish backchannels from interrupts, semantic end-of-turn
  - Complexity: Medium - requires Mimi encoder integration
  - See "Mimi Integration" section below for details

---

## Executive Summary

BTCW is a custom TTS system you've already built that provides:

- **12 superhuman voice capabilities** (circadian, relationship, silence, etc.)
- **Full SSML support** (W3C 1.1 + Cartesia extensions)
- **Voice cloning** from 10-20 second samples
- **150ms first-packet latency**
- **Open source foundation** (CosyVoice 3, Apache-2.0)

This plan integrates BTCW with the Ferni voice agent, replacing Cartesia TTS.

---

## Why BTCW Over PersonaPlex?

| Capability                 | BTCW                                   | PersonaPlex        |
| -------------------------- | -------------------------------------- | ------------------ |
| **Circadian adaptation**   | ✅ Voice changes by time of day        | ❌ None            |
| **Relationship evolution** | ✅ Voice deepens with trust            | ❌ None            |
| **Meaningful silence**     | ✅ Knows when NOT to speak             | ❌ Always responds |
| **SSML control**           | ✅ Full W3C 1.1 + Cartesia             | ❌ None            |
| **Memory prosody**         | ✅ Reverence for past moments          | ❌ None            |
| **Backchannels**           | ✅ "mm-hmm", "yeah"                    | ⚠️ Uncontrolled    |
| **Emotional anticipation** | ✅ Primes emotion BEFORE content       | ❌ None            |
| **Breath sync**            | ✅ Parasympathetic coupling            | ❌ None            |
| **Responsive escalation**  | ✅ MORE present as distress increases  | ❌ None            |
| **Vocal fatigue**          | ✅ Realistic strain showing dedication | ❌ None            |
| **Full duplex**            | ❌ Separate STT/LLM/TTS                | ✅ Native          |

**BTCW wins for Ferni** because the "Better Than Human" brand requires capabilities PersonaPlex can't provide.

---

## SSML Flow Through the System

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Ferni Voice Agent                                │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │ LLM Response │ ← "I understand how hard this is..."              │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                Superhuman Synthesizer                         │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  1. Check meaningful_silence → maybe don't speak     │    │  │
│  │  │  2. Check backchannel → maybe just "mm-hmm"          │    │  │
│  │  │  3. Apply circadian (2am → slower, warmer)           │    │  │
│  │  │  4. Apply relationship (day 90 → more intimate)      │    │  │
│  │  │  5. Apply memory_prosody (sacred moment → pause)     │    │  │
│  │  │  6. Apply anticipation (joy coming → prime smile)    │    │  │
│  │  │  7. Apply escalation (distress → MORE present)       │    │  │
│  │  │  8. Apply vocal_fatigue (30 min → slight strain)     │    │  │
│  │  │  9. Apply breath_sync (match user rhythm)            │    │  │
│  │  │ 10. Apply micro_prosody (subliminal 40-150ms cues)   │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  │                                                               │  │
│  │  Output: Modified text with SSML                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      SSML Parser                              │  │
│  │                                                               │  │
│  │  <prosody rate="-10%" pitch="-3%">                           │  │
│  │    <emotion value="sympathetic">                             │  │
│  │      <break time="300ms"/>                                   │  │
│  │      I understand how hard this is.                          │  │
│  │      <break time="200ms"/>                                   │  │
│  │      I'm here with you.                                      │  │
│  │    </emotion>                                                │  │
│  │  </prosody>                                                  │  │
│  │                                                               │  │
│  │  Parses to: {                                                │  │
│  │    cleanText: "I understand...",                             │  │
│  │    emotion: "sympathetic",                                   │  │
│  │    rate: 0.9, pitch: 0.97,                                   │  │
│  │    breaks: [{pos: 0, ms: 300}, {pos: 32, ms: 200}]          │  │
│  │  }                                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    CosyVoice 3 Server                         │  │
│  │                                                               │  │
│  │  POST /v1/audio/speech                                        │  │
│  │  {                                                            │  │
│  │    "text": "I understand...",                                 │  │
│  │    "voice": "ferni",                                          │  │
│  │    "instruct": "[gentle][slow][warm]",                        │  │
│  │    "speed": 0.9,                                              │  │
│  │    "stream": true                                             │  │
│  │  }                                                            │  │
│  │                                                               │  │
│  │  Response: PCM audio stream (24kHz, 150ms first byte)         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │ LiveKit Room │ → User hears superhuman voice                     │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Move BTCW Into Project (Day 1-2)

### Task 1.1: Copy BTCW to apps/btcw

```bash
# Move from Downloads to project
mv ~/Downloads/btcw apps/btcw

# Verify structure
ls apps/btcw/
# Should see: inference/, rust-server/, integration/, training/, voices/
```

### Task 1.2: Update Git

```bash
git add apps/btcw
git commit -m "feat: add BTCW (Better Than Cartesia Work) superhuman TTS"
```

### Task 1.3: Add to Monorepo

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'apps/btcw/integration' # TypeScript integration
  - 'packages/*'
```

### Task 1.4: Install Dependencies

```bash
# Python dependencies for CosyVoice server
cd apps/btcw/inference
pip install -r requirements.txt

# TypeScript dependencies for integration
cd ../integration
pnpm install

# Build TypeScript
pnpm build
```

### Deliverable: BTCW in project, dependencies installed

---

## Phase 2: Record Persona Voice Samples (Day 2-3)

### Task 2.1: Recording Requirements

Each persona needs 10-20 seconds of clean reference audio:

| Persona    | Voice Characteristics            | Recording Script                                                                                                                    |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Ferni**  | Warm, supportive, coordinator    | "Welcome back. I've been thinking about what you shared last time. How are you feeling today? I'm here for whatever you need."      |
| **Peter**  | Calm authority, financial wisdom | "Let me help you understand your options. The key is to stay focused on your long-term goals while managing short-term volatility." |
| **Maya**   | Energetic, encouraging coach     | "You've got this! I know it feels hard right now, but every small step counts. Let's break this down together."                     |
| **Alex**   | Professional, organized          | "I've reviewed your calendar for the week. You have three priority items to address. Shall I walk you through the schedule?"        |
| **Jordan** | Celebratory, milestone-focused   | "This is such a big moment! I'm so proud of how far you've come. Let's take a moment to really appreciate this achievement."        |
| **Nayan**  | Wise, contemplative              | "Sometimes the answers we seek come when we stop searching. Let's sit with this question together and see what emerges."            |

### Task 2.2: Recording Setup

1. **Environment**: Quiet room, no echo
2. **Equipment**: Quality microphone (even iPhone voice memo works)
3. **Format**: 24kHz WAV, mono
4. **Duration**: 15-20 seconds per persona
5. **Content**: Varied emotional range, natural pacing

### Task 2.3: Save Voice Files

```bash
# Place recordings in voices folder
apps/btcw/voices/
├── ferni.wav     # 15-20 sec reference
├── peter.wav
├── maya.wav
├── alex.wav
├── jordan.wav
└── nayan.wav
```

### Deliverable: 6 persona voice samples recorded and validated

---

## Phase 3: Deploy CosyVoice Server (Day 3-5)

### Task 3.1: Build Docker Image

```bash
cd apps/btcw
docker build -t gcr.io/voiceai-prod/btcw-cosyvoice:latest -f inference/Dockerfile .
docker push gcr.io/voiceai-prod/btcw-cosyvoice:latest
```

### Task 3.2: Deploy to Cloud Run (GPU)

```bash
gcloud run deploy btcw-cosyvoice \
  --image gcr.io/voiceai-prod/btcw-cosyvoice:latest \
  --region us-central1 \
  --min-instances 1 \
  --max-instances 10 \
  --memory 16Gi \
  --cpu 4 \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars "COSYVOICE_MODEL=CosyVoice2-0.5B"
```

### Task 3.3: Add to Ferni CLI

```typescript
// apps/cli/src/commands/deploy/deploy-btcw.ts
export async function deployBTCW() {
  // Build, push, deploy with health checks
}
```

### Task 3.4: Health Check

```bash
curl https://btcw-cosyvoice-xxx.run.app/health
# {"status": "healthy", "model": "CosyVoice2-0.5B", "voices": ["ferni", "peter", ...]}
```

### Deliverable: CosyVoice server running on Cloud Run GPU

---

## Phase 4: Integrate with Voice Agent (Day 5-8)

### Task 4.1: Create BTCW TTS Provider

```typescript
// src/speech/tts-gateway/providers/btcw.ts

import { ITTSProvider, TTSRequest, TTSResponse } from '../types.js';
import { SuperhumanSynthesizer, SynthesisContext } from '@btcw/integration';
import { parseSSML, translateSSML } from '@btcw/integration';

export class BTCWProvider implements ITTSProvider {
  #serverUrl: string;
  #synthesizer: SuperhumanSynthesizer;

  constructor(serverUrl: string) {
    this.#serverUrl = serverUrl;
    this.#synthesizer = new SuperhumanSynthesizer();
  }

  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    // Build synthesis context from session
    const context = this.#buildContext(request);

    // Apply superhuman capabilities
    const result = this.#synthesizer.process(context);

    // Check for meaningful silence
    if (result.shouldBeSilent) {
      return {
        audio: this.#createSilence(result.silenceDurationMs),
        minimalResponse: result.minimalResponse,
      };
    }

    // Parse SSML to CosyVoice parameters
    const params = translateSSML(result.ssml);

    // Call CosyVoice server
    const response = await fetch(`${this.#serverUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        voice: request.voiceId,
        instruct: this.#emotionToInstruction(params.emotion),
        speed: params.speed,
        stream: true,
      }),
    });

    // Return streaming audio
    return {
      stream: response.body,
      capabilitiesUsed: result.capabilitiesUsed,
    };
  }

  #buildContext(request: TTSRequest): SynthesisContext {
    return {
      text: request.text,
      voiceId: request.voiceId,
      baseEmotion: request.emotion || 'neutral',

      // User state from session
      userIsDistressed: request.sessionContext?.userDistressed ?? false,
      userDistressLevel: request.sessionContext?.distressLevel ?? 0,
      userSeemsEmotional: request.sessionContext?.emotional ?? false,
      userSeemsVulnerable: request.sessionContext?.vulnerable ?? false,
      userBreathRate: request.sessionContext?.breathRate,

      // Relationship context
      daysSinceFirstInteraction: request.sessionContext?.daysSinceFirst ?? 0,
      totalInteractions: request.sessionContext?.totalInteractions ?? 0,

      // Memory context
      memoryReferences: request.sessionContext?.memoryRefs ?? [],

      // Conversation state
      userJustSpoke: request.sessionContext?.userJustSpoke ?? true,
      userLastMessage: request.sessionContext?.lastUserMessage ?? '',
      timeSinceUserFinishedMs: request.sessionContext?.timeSinceUserMs ?? 0,

      // Time
      userTimezoneOffset: request.sessionContext?.timezoneOffset ?? 0,
    };
  }

  #emotionToInstruction(emotion: string): string {
    const map: Record<string, string> = {
      neutral: '',
      happy: '[happy]',
      sad: '[sad]',
      sympathetic: '[gentle][slow]',
      contemplative: '[slow][soft]',
      warm: '[gentle][warm]',
      concerned: '[gentle][slow][soft]',
      proud: '[happy][slightly excited]',
      calm: '[slow][soft]',
      peaceful: '[very slow][very soft]',
    };
    return map[emotion] || '';
  }
}
```

### Task 4.2: Wire Session Context

```typescript
// src/agents/processors/turn-processor.ts

// Add to turn processing:
const ttsContext: SessionContext = {
  userDistressed: emotionState.distressDetected,
  distressLevel: emotionState.distressLevel,
  emotional: emotionState.emotional,
  vulnerable: emotionState.vulnerable,
  breathRate: breathAnalyzer.currentRate,
  daysSinceFirst: userProfile.daysSinceFirstInteraction,
  totalInteractions: userProfile.totalInteractions,
  memoryRefs: contextManager.getActiveMemoryReferences(),
  userJustSpoke: true,
  lastUserMessage: transcript,
  timeSinceUserMs: Date.now() - lastUserSpeechEndTime,
  timezoneOffset: userProfile.timezoneOffset,
};

// Pass to TTS
const audio = await tts.synthesize({
  text: response,
  voiceId: persona.voiceId,
  emotion: emotionState.responseEmotion,
  sessionContext: ttsContext,
});
```

### Task 4.3: Handle Superhuman Results

```typescript
// Handle meaningful silence
if (audio.minimalResponse) {
  // Speak minimal response or be silent
  if (audio.minimalResponse !== null) {
    await speakMinimal(audio.minimalResponse);
  }
  // Don't speak the full response
  return;
}

// Handle backchannels
if (audio.backchannel) {
  await speakBackchannel(audio.backchannel);
}

// Log capabilities used
log.debug({ capabilities: audio.capabilitiesUsed }, 'Superhuman TTS applied');
```

### Task 4.4: Add Feature Flag

```bash
# .env
USE_BTCW_TTS=true
BTCW_SERVER_URL=https://btcw-cosyvoice-xxx.run.app
```

```typescript
// src/speech/tts-gateway/factory.ts
export function createTTSProvider(): ITTSProvider {
  if (process.env.USE_BTCW_TTS === 'true') {
    return new BTCWProvider(process.env.BTCW_SERVER_URL!);
  }
  return new CartesiaProvider(); // Fallback
}
```

### Deliverable: BTCW integrated with voice agent, feature flagged

---

## Phase 5: Test and Validate (Day 8-10)

### Task 5.1: Unit Tests

```typescript
// src/speech/tts-gateway/providers/__tests__/btcw.test.ts
describe('BTCWProvider', () => {
  test('applies circadian adaptation at 2am', async () => {
    const provider = new BTCWProvider('http://mock');
    const result = await provider.synthesize({
      text: 'Hello',
      voiceId: 'ferni',
      sessionContext: { timezoneOffset: 0 }, // 2am
    });
    expect(result.capabilitiesUsed).toContain('circadian_adaptation');
  });

  test('detects meaningful silence for grief', async () => {
    const result = await provider.synthesize({
      text: 'I understand.',
      voiceId: 'ferni',
      sessionContext: {
        lastUserMessage: 'My mom passed away last week...',
        emotional: true,
        vulnerable: true,
      },
    });
    expect(result.shouldBeSilent || result.capabilitiesUsed.includes('meaningful_silence')).toBe(
      true
    );
  });
});
```

### Task 5.2: Integration Tests

```typescript
// src/tests/integration/btcw-integration.test.ts
describe('BTCW Integration', () => {
  test('full turn with superhuman TTS', async () => {
    // Simulate full turn: user speaks → LLM responds → BTCW synthesizes
  });

  test('voice quality comparison', async () => {
    // Compare BTCW vs Cartesia for same text
  });
});
```

### Task 5.3: A/B Test Setup

```typescript
// Use experiment system
await experimentManager.create({
  id: 'btcw-vs-cartesia',
  type: 'ab',
  variants: ['btcw', 'cartesia'],
  metrics: ['voice_quality_rating', 'conversation_length', 'return_rate'],
});
```

### Deliverable: Comprehensive test coverage, A/B test running

---

## Phase 6: Production Rollout (Day 10-14)

### Task 6.1: Gradual Rollout

```bash
# Start with 5% traffic
ferni traffic canary 5 --variant btcw

# Monitor metrics for 24h
ferni metrics voice-quality --last 24h

# Increase to 25%
ferni traffic canary 25 --variant btcw

# Full rollout
ferni traffic shift 100 --variant btcw
```

### Task 6.2: Monitoring

- **Latency**: First byte < 200ms
- **Error rate**: < 1%
- **Voice quality**: User ratings
- **Capability usage**: Which superhuman features trigger

### Task 6.3: Rollback Plan

```bash
# If issues detected
ferni rollback btcw --to cartesia
```

### Deliverable: BTCW in production, Cartesia as fallback

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Ferni Platform                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Voice Agent (GCE)                          │ │
│  │                                                                    │ │
│  │  ┌──────────────┐    ┌─────────────┐    ┌──────────────────────┐  │ │
│  │  │   LiveKit    │───▶│     LLM     │───▶│   BTCW TTS Provider  │  │ │
│  │  │   (audio)    │    │  (OpenAI)   │    │                      │  │ │
│  │  └──────────────┘    └─────────────┘    │  ┌────────────────┐  │  │ │
│  │                                         │  │  Superhuman    │  │  │ │
│  │                                         │  │  Synthesizer   │  │  │ │
│  │                                         │  │  (12 caps)     │  │  │ │
│  │                                         │  └────────┬───────┘  │  │ │
│  │                                         │           │          │  │ │
│  │                                         │  ┌────────▼───────┐  │  │ │
│  │                                         │  │  SSML Parser   │  │  │ │
│  │                                         │  │  (W3C + ext)   │  │  │ │
│  │                                         │  └────────┬───────┘  │  │ │
│  │                                         └───────────│──────────┘  │ │
│  └─────────────────────────────────────────────────────│──────────────┘ │
│                                                        │                 │
│  ┌─────────────────────────────────────────────────────▼───────────────┐│
│  │                   CosyVoice 3 Server (Cloud Run GPU)                 ││
│  │                                                                      ││
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  ││
│  │   │  Voice Clone │  │  Emotion     │  │  Streaming Synthesis     │  ││
│  │   │  (10-20 sec) │  │  Instruct    │  │  (150ms first byte)      │  ││
│  │   └──────────────┘  └──────────────┘  └──────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Analysis

### BTCW (CosyVoice + GPU)

| Component                | Monthly Cost     |
| ------------------------ | ---------------- |
| Cloud Run L4 GPU (min 1) | ~$400-600        |
| Storage (voice models)   | ~$10             |
| Network egress           | ~$50             |
| **Total**                | **~$460-660/mo** |

### Cartesia (Current)

| Component                  | Monthly Cost     |
| -------------------------- | ---------------- |
| API usage (est. 10M chars) | ~$400-500        |
| No infrastructure          | $0               |
| **Total**                  | **~$400-500/mo** |

### Comparison

- **Low volume**: Cartesia cheaper (pay-per-use)
- **High volume**: BTCW cheaper (fixed cost)
- **Capability**: BTCW dramatically better (12 superhuman features)

**Recommendation**: BTCW is worth the investment for the capability gains.

---

## Files to Create

| Path                                           | Purpose                             |
| ---------------------------------------------- | ----------------------------------- |
| `apps/btcw/`                                   | BTCW package (moved from Downloads) |
| `src/speech/tts-gateway/providers/btcw.ts`     | BTCW TTS provider                   |
| `src/speech/tts-gateway/superhuman-context.ts` | Session context builder             |
| `apps/cli/src/commands/deploy/deploy-btcw.ts`  | CLI deploy command                  |
| `docs/architecture/BTCW-INTEGRATION.md`        | Architecture documentation          |

---

## Success Criteria

| Metric               | Target                        |
| -------------------- | ----------------------------- |
| First byte latency   | < 200ms                       |
| Voice quality rating | ≥ 4.5/5                       |
| Capability coverage  | All 12 capabilities active    |
| Error rate           | < 1%                          |
| User satisfaction    | Higher than Cartesia baseline |

---

## Next Steps (When Resumed)

1. ~~**Move BTCW** to `apps/btcw/`~~ ✅ Done
2. **Record persona voices** (6 personas × 15-20 sec)
3. **Deploy CosyVoice server** to Cloud Run GPU
4. ~~**Implement BTCW TTS provider**~~ ✅ Done (`src/speech/tts-gateway/providers/btcw.ts`)
5. **Wire session context** to superhuman synthesizer
6. **Test thoroughly**
7. **Gradual rollout**

---

## Future Enhancement: Mimi Semantic VAD

> **Status**: 🔮 Future Research - Not Required for BTCW

Mimi (from Kyutai/Moshi) is a streaming neural audio codec that could enhance interrupt detection. This is **optional** and **separate from BTCW**.

### Why Consider Mimi?

| Capability               | Current (Gemini VAD)    | With Mimi                  |
| ------------------------ | ----------------------- | -------------------------- |
| Turn detection           | ✅ Works well           | ✅ Same                    |
| Latency                  | ~150-200ms              | ~80ms frames               |
| Backchannel detection    | ❌ Triggers on "mm-hmm" | ✅ Can distinguish         |
| Semantic end-of-turn     | ❌ Silence-based        | ✅ Content-aware           |
| Interrupt classification | ❌ All treated same     | ✅ Barge-in vs backchannel |

### Architecture: Parallel (No Conflict)

Mimi would run **alongside** Gemini's VAD, not replace it:

```
Audio Input ──┬──► Gemini VAD (turn detection - unchanged)
              │
              └──► Mimi (parallel) ──► Graceful Interrupt System
                                       │
                                       ├─► "Backchannel" → Don't trail
                                       ├─► "Barge-in" → Start trailing
                                       └─► "New thought" → Prepare to yield
```

**Key insight**: Gemini VAD handles WHEN to respond. Mimi would enhance HOW we respond (graceful trailing vs abrupt stop).

### Why Not Now?

1. **Current system works well** - Gemini VAD + graceful-interrupt is already good
2. **Complexity** - Adds another dependency (Mimi encoder, ~24GB GPU memory)
3. **BTCW is the priority** - Superhuman TTS has higher impact than smarter VAD
4. **Marginal gains** - The improvement is optimization, not transformation

### If We Add It Later

```typescript
// Would be added to src/speech/graceful-interrupt/mimi-enhanced.ts
import { MimiEncoder } from '@kyutai/mimi';

export class MimiSemanticVAD {
  async processFrame(audio: Float32Array): Promise<{
    isSpeech: boolean;
    isBackchannel: boolean;
    isNewThought: boolean;
    semanticConfidence: number;
  }>;
}
```

### Related: PersonaPlex/Gemini Hybrid

We also explored wiring Mimi to Gemini (like LLaMA-Omni2 architecture). This is even more future - would require:

- Training a speech adapter (Mimi tokens → Gemini embedding space)
- ~200K paired samples for training
- Disabling Gemini's built-in VAD

**Recommendation**: Evaluate only if latency becomes critical (<200ms target).

---

## Appendix: SSML Tag Reference

### W3C SSML 1.1 (Supported)

| Tag          | Example                                         | Effect               |
| ------------ | ----------------------------------------------- | -------------------- |
| `<prosody>`  | `<prosody rate="-10%" pitch="+5%">`             | Speed, pitch, volume |
| `<break>`    | `<break time="500ms"/>`                         | Pause                |
| `<emphasis>` | `<emphasis level="strong">`                     | Stress               |
| `<say-as>`   | `<say-as interpret-as="date">`                  | Pronunciation        |
| `<sub>`      | `<sub alias="AI">artificial intelligence</sub>` | Substitution         |
| `<phoneme>`  | `<phoneme ph="təˈmeɪtoʊ">`                      | IPA pronunciation    |
| `<mark>`     | `<mark name="point1"/>`                         | Bookmark             |
| `<lang>`     | `<lang xml:lang="es">hola</lang>`               | Language             |
| `<audio>`    | `<audio src="url"/>`                            | Audio embed          |

### Cartesia Extensions (Supported)

| Tag          | Example                          | Effect           |
| ------------ | -------------------------------- | ---------------- |
| `<speed>`    | `<speed ratio="0.9"/>`           | Speed control    |
| `<volume>`   | `<volume ratio="1.2"/>`          | Volume control   |
| `<emotion>`  | `<emotion value="sympathetic"/>` | 21 emotions      |
| `<spell>`    | `<spell>ABC</spell>`             | Letter-by-letter |
| `[laughter]` | `[laughter]`                     | Nonverbal        |

### Superhuman SSML (Auto-generated)

The superhuman synthesizer automatically generates appropriate SSML:

```xml
<!-- 2am conversation -->
<prosody rate="-15%" pitch="-3%" volume="-20%">
  <emotion value="warm">
    Sometimes the quiet moments reveal what really matters.
  </emotion>
</prosody>

<!-- Grief response -->
<break time="500ms"/>
<emotion value="sympathetic">
  <prosody rate="-10%">
    I'm here with you.
  </prosody>
</emotion>

<!-- Memory reference (sacred moment) -->
<break time="300ms"/>
<emotion value="reverent">
  Remember when you told me about your dad?
  <break time="200ms"/>
  That was such an important moment.
</emotion>
```

---

_Document created: January 2026_
_Author: Engineering Team_
