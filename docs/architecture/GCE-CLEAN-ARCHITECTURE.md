# GCE Clean Architecture Proposal

## Executive Summary

Now that we've committed to **Google Compute Engine (GCE)** for voice agents, we can simplify our architecture significantly. GCE provides:

- **Long-running processes** - No cold start penalty
- **Stateful instances** - Can maintain connection pools, warm caches
- **More memory** - Can preload more resources
- **Predictable performance** - No serverless variability

This proposal standardizes a clean architecture that scales horizontally while maintaining simplicity.

---

## Current Pain Points

| Problem                       | Root Cause                             | Impact                               |
| ----------------------------- | -------------------------------------- | ------------------------------------ |
| Two worker implementations    | Cloud Run vs GCE optimization attempts | Code duplication, maintenance burden |
| 1100+ line entry file         | Monolithic session setup               | Hard to test, hard to modify         |
| Inconsistent handler patterns | Organic growth                         | Cognitive load, bugs                 |
| Unclear boundaries            | Everything imports everything          | Circular deps, slow startup          |
| Testing difficulty            | Tight coupling                         | Low test coverage on critical paths  |

---

## Proposed Architecture: Hexagonal + Vertical Slices

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           GCE VOICE AGENT                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     INFRASTRUCTURE LAYER                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │  │
│  │  │   LiveKit   │  │   Cartesia  │  │   Gemini    │  │  Firestore │ │  │
│  │  │   Adapter   │  │   Adapter   │  │   Adapter   │  │   Adapter  │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      APPLICATION LAYER                               │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐│  │
│  │  │                    Session Orchestrator                         ││  │
│  │  │  - Lifecycle management                                         ││  │
│  │  │  - Handler coordination                                         ││  │
│  │  │  - Error boundaries                                             ││  │
│  │  └─────────────────────────────────────────────────────────────────┘│  │
│  │                                                                      │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │  │
│  │  │    Session    │  │     Turn      │  │    Audio      │           │  │
│  │  │   Pipeline    │  │   Pipeline    │  │   Pipeline    │           │  │
│  │  └───────────────┘  └───────────────┘  └───────────────┘           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        DOMAIN LAYER                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │  │
│  │  │   Persona   │  │ Conversation│  │   Memory    │  │   Trust    │ │  │
│  │  │   Domain    │  │   Domain    │  │   Domain    │  │   Domain   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/agents/
├── index.ts                      # Public API exports
├── worker.ts                     # ⭐ Single GCE worker (replaces two workers)
│
├── core/                         # Core abstractions (no external deps)
│   ├── index.ts
│   ├── types.ts                  # SessionContext, HandlerResult, etc.
│   ├── errors.ts                 # AgentError, ErrorBoundary
│   ├── result.ts                 # Result<T, E> type for error handling
│   └── events.ts                 # Typed event system
│
├── adapters/                     # Infrastructure adapters (ports)
│   ├── index.ts
│   ├── livekit/
│   │   ├── connection.ts         # Room connection management
│   │   ├── audio.ts              # Audio stream handling
│   │   └── data-channel.ts       # Frontend communication
│   ├── cartesia/
│   │   ├── tts.ts                # TTS adapter
│   │   └── voice-cloning.ts      # Voice localization
│   ├── gemini/
│   │   ├── llm.ts                # LLM adapter
│   │   └── realtime.ts           # Realtime model
│   └── firestore/
│       ├── user-profile.ts       # User data persistence
│       └── session-state.ts      # Session state persistence
│
├── session/                      # Session lifecycle (application layer)
│   ├── index.ts
│   ├── orchestrator.ts           # ⭐ Main session coordinator
│   ├── state.ts                  # SessionState (single source of truth)
│   ├── context.ts                # SessionContext builder
│   └── cleanup.ts                # Graceful cleanup
│
├── pipelines/                    # Processing pipelines
│   ├── index.ts
│   ├── session/                  # Session setup pipeline
│   │   ├── pipeline.ts           # SessionPipeline class
│   │   ├── steps/                # Individual steps
│   │   │   ├── identify-user.ts
│   │   │   ├── load-persona.ts
│   │   │   ├── connect-room.ts
│   │   │   ├── initialize-services.ts
│   │   │   ├── setup-handlers.ts
│   │   │   └── speak-greeting.ts
│   │   └── types.ts
│   ├── turn/                     # Turn processing pipeline
│   │   ├── pipeline.ts
│   │   ├── steps/
│   │   │   ├── parse-input.ts
│   │   │   ├── analyze-emotion.ts
│   │   │   ├── build-context.ts
│   │   │   ├── inject-memory.ts
│   │   │   └── prepare-response.ts
│   │   └── types.ts
│   └── audio/                    # Audio processing pipeline
│       ├── pipeline.ts
│       ├── steps/
│       │   ├── vad.ts
│       │   ├── emotion-detection.ts
│       │   └── transcript.ts
│       └── types.ts
│
├── handlers/                     # Event handlers (already good structure)
│   ├── index.ts
│   ├── transcript.ts
│   ├── music.ts
│   ├── handoff.ts
│   ├── cameo.ts
│   ├── celebration.ts
│   └── session-state.ts
│
├── integrations/                 # Feature integrations (already exists)
│   ├── index.ts
│   ├── voice-humanization.ts
│   ├── speech-metrics.ts
│   └── dynamic-speed.ts
│
└── __tests__/                    # Tests mirror structure
    ├── unit/
    │   ├── core/
    │   ├── adapters/
    │   ├── pipelines/
    │   └── handlers/
    ├── integration/
    │   ├── session-lifecycle.test.ts
    │   ├── turn-processing.test.ts
    │   └── error-recovery.test.ts
    └── e2e/
        └── voice-session.test.ts
```

---

## Core Abstractions

### 1. SessionContext (Single Source of Truth)

```typescript
// src/agents/core/types.ts

/**
 * Immutable session context passed to all handlers.
 * Use SessionState for mutable state.
 */
export interface SessionContext {
  // Identity
  readonly sessionId: string;
  readonly jobId: string;
  readonly roomName: string;

  // User
  readonly userId: string | null;
  readonly userName: string | null;
  readonly userAccent: string;

  // Persona
  readonly persona: PersonaConfig;
  readonly systemPrompt: string;

  // Connections (adapters)
  readonly room: RoomAdapter;
  readonly tts: TTSAdapter;
  readonly llm: LLMAdapter;

  // State (mutable via SessionState)
  readonly state: SessionState;

  // Services
  readonly services: SessionServices;
}

/**
 * Mutable session state with typed updates.
 */
export interface SessionState {
  // Turn tracking
  turnCount: number;
  lastUserMessage: string | null;
  lastAgentMessage: string | null;

  // Emotional state
  emotion: EmotionAnalysis | null;
  mood: MoodState | null;

  // Conversation tracking
  currentTopic: string | null;
  mentionedTopics: Set<string>;
  relationshipStage: RelationshipStage;

  // Feature flags
  flags: Map<string, boolean>;

  // Methods
  update(changes: Partial<SessionState>): void;
  snapshot(): Readonly<SessionState>;
}
```

### 2. Result Type (Error Handling)

```typescript
// src/agents/core/result.ts

/**
 * Result type for explicit error handling.
 * Inspired by Rust's Result<T, E>.
 */
export type Result<T, E = AgentError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

// Usage:
async function loadPersona(id: string): Promise<Result<PersonaConfig, PersonaError>> {
  try {
    const persona = await getPersonaAsync(id);
    if (!persona) return err(new PersonaNotFoundError(id));
    return ok(persona);
  } catch (e) {
    return err(new PersonaLoadError(id, e));
  }
}
```

### 3. Pipeline Pattern

```typescript
// src/agents/pipelines/session/pipeline.ts

/**
 * Session pipeline - composable steps for session setup.
 * Each step receives context and returns updated context or error.
 */
export class SessionPipeline {
  private steps: PipelineStep<SessionContext>[] = [];

  add(step: PipelineStep<SessionContext>): this {
    this.steps.push(step);
    return this;
  }

  async execute(initial: SessionContext): Promise<Result<SessionContext>> {
    let context = initial;

    for (const step of this.steps) {
      const result = await step.execute(context);
      if (!result.ok) {
        return result; // Short-circuit on error
      }
      context = result.value;
    }

    return ok(context);
  }
}

// Usage - compose steps declaratively:
const sessionPipeline = new SessionPipeline()
  .add(new IdentifyUserStep())
  .add(new LoadPersonaStep())
  .add(new ConnectRoomStep())
  .add(new InitializeServicesStep())
  .add(new SetupHandlersStep())
  .add(new SpeakGreetingStep());
```

---

## Worker Consolidation

### Before: Two Workers

```
voice-worker.ts (multi-process, LiveKit SDK child spawning)
voice-worker-single-process.ts (custom single-process, manual WebSocket)
```

### After: One Worker

```typescript
// src/agents/worker.ts

/**
 * GCE Voice Worker
 *
 * Single-process worker optimized for GCE:
 * - Long-running process (no cold starts)
 * - Pre-warmed resources (connections, caches)
 * - Horizontal scaling via multiple GCE instances
 */

import { WorkerOptions, cli } from '@livekit/agents';
import { SessionOrchestrator } from './session/orchestrator.js';
import { warmupResources } from './warmup.js';

const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

async function main() {
  log('🚀 GCE Voice Worker starting');

  // Phase 1: Start health server (immediate)
  startHealthServer(AGENT_NAME);

  // Phase 2: Warmup resources (parallel)
  await warmupResources({
    preloadPersonas: true,
    warmTTSConnections: true,
    warmDBConnections: true,
  });

  // Phase 3: Start agent worker
  cli.runApp(
    new WorkerOptions({
      agent: async (ctx) => {
        const orchestrator = new SessionOrchestrator(ctx);
        await orchestrator.run();
      },
      agentName: AGENT_NAME,
      production: true,
      // GCE-specific: Single process handles multiple concurrent sessions
      numIdleProcesses: 0,
    })
  );

  log('✅ GCE Voice Worker ready');
}

main().catch(console.error);
```

---

## Session Orchestrator

The heart of the new architecture - replaces the 1100+ line entry file:

```typescript
// src/agents/session/orchestrator.ts

/**
 * SessionOrchestrator - coordinates the entire session lifecycle.
 *
 * Responsibilities:
 * - Build session context
 * - Execute session pipeline
 * - Coordinate handlers
 * - Handle errors with recovery
 * - Ensure graceful cleanup
 */
export class SessionOrchestrator {
  private ctx: JobContext;
  private session: SessionContext | null = null;
  private cleanupHandlers: Array<() => Promise<void>> = [];

  constructor(ctx: JobContext) {
    this.ctx = ctx;
  }

  async run(): Promise<void> {
    const startTime = Date.now();

    try {
      // Phase 1: Build initial context
      this.session = await this.buildContext();

      // Phase 2: Execute session pipeline
      const pipeline = this.createSessionPipeline();
      const result = await pipeline.execute(this.session);

      if (!result.ok) {
        await this.handleSetupError(result.error);
        return;
      }

      this.session = result.value;

      // Phase 3: Run until disconnect
      await this.runConversation();
    } catch (error) {
      await this.handleFatalError(error);
    } finally {
      await this.cleanup();
      log(`Session ended (${Date.now() - startTime}ms)`);
    }
  }

  private createSessionPipeline(): SessionPipeline {
    return new SessionPipeline()
      .add(new IdentifyUserStep())
      .add(new LoadPersonaStep())
      .add(new ConnectRoomStep())
      .add(new InitializeServicesStep())
      .add(new CreateAgentSessionStep())
      .add(new SetupHandlersStep())
      .add(new SpeakGreetingStep());
  }

  private async runConversation(): Promise<void> {
    const turnPipeline = this.createTurnPipeline();

    // Subscribe to user turns
    this.session!.agentSession.on('UserInputTranscribed', async (event) => {
      await turnPipeline.execute({
        ...this.session!,
        userText: event.text,
      });
    });

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      this.session!.room.on('disconnected', resolve);
    });
  }

  private async cleanup(): Promise<void> {
    for (const handler of this.cleanupHandlers) {
      try {
        await handler();
      } catch {
        // Log but don't throw during cleanup
      }
    }
  }

  onCleanup(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }
}
```

---

## Adapter Pattern

Isolate external dependencies behind adapters:

```typescript
// src/agents/adapters/cartesia/tts.ts

/**
 * Cartesia TTS Adapter
 *
 * Isolates Cartesia SDK behind a clean interface.
 * Makes testing and swapping implementations easy.
 */
export interface TTSAdapter {
  speak(text: string, options?: SpeakOptions): Promise<void>;
  switchVoice(voiceId: string): void;
  setSpeed(multiplier: number): void;
  getLatency(): number;
}

export class CartesiaTTSAdapter implements TTSAdapter {
  private tts: CartesiaTTS;
  private voiceId: string;

  constructor(config: CartesiaTTSConfig) {
    this.voiceId = config.voiceId;
    this.tts = new CartesiaTTS({
      model: 'sonic-2',
      voice: { id: config.voiceId, mode: 'id' },
      apiKey: config.apiKey,
    });
  }

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    await this.tts.say(text, options);
  }

  switchVoice(voiceId: string): void {
    this.voiceId = voiceId;
    // Cartesia TTS voice switching logic
  }

  setSpeed(multiplier: number): void {
    // Apply speed to subsequent speech
  }

  getLatency(): number {
    return this.tts.getLastLatency();
  }
}

// Mock for testing
export class MockTTSAdapter implements TTSAdapter {
  public spokenTexts: string[] = [];

  async speak(text: string): Promise<void> {
    this.spokenTexts.push(text);
  }

  switchVoice(): void {}
  setSpeed(): void {}
  getLatency(): number {
    return 0;
  }
}
```

---

## Migration Plan

### Phase 1: Foundation (Week 1)

1. **Create core abstractions**
   - [ ] `core/types.ts` - SessionContext, SessionState
   - [ ] `core/result.ts` - Result<T, E> type
   - [ ] `core/errors.ts` - Error hierarchy
   - [ ] `core/events.ts` - Typed events

2. **Create adapter interfaces**
   - [ ] `adapters/types.ts` - TTSAdapter, LLMAdapter, RoomAdapter interfaces

### Phase 2: Adapters (Week 2)

3. **Implement adapters**
   - [ ] `adapters/cartesia/tts.ts`
   - [ ] `adapters/gemini/llm.ts`
   - [ ] `adapters/livekit/connection.ts`
   - [ ] Mock implementations for testing

### Phase 3: Pipelines (Week 3)

4. **Create session pipeline**
   - [ ] Extract steps from `voice-agent-entry.ts`
   - [ ] Each step: ~50 lines, single responsibility
   - [ ] Unit tests for each step

5. **Create turn pipeline**
   - [ ] Extract from `turn-handler.ts`
   - [ ] Parallel-safe step execution

### Phase 4: Orchestrator (Week 4)

6. **Build SessionOrchestrator**
   - [ ] Replace `voice-agent-entry.ts`
   - [ ] Integration tests

7. **Consolidate workers**
   - [ ] New `worker.ts` using orchestrator
   - [ ] Remove `voice-worker.ts` and `voice-worker-single-process.ts`

### Phase 5: Cleanup (Week 5)

8. **Remove legacy code**
   - [ ] Archive old worker files
   - [ ] Update deploy scripts
   - [ ] Update documentation

---

## Scaling on GCE

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GCE Instance Group                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Instance 1 │  │  Instance 2 │  │  Instance 3 │    ...         │
│  │  (n1-std-2) │  │  (n1-std-2) │  │  (n1-std-2) │                │
│  │             │  │             │  │             │                │
│  │  Sessions:  │  │  Sessions:  │  │  Sessions:  │                │
│  │  - Room A   │  │  - Room D   │  │  - Room G   │                │
│  │  - Room B   │  │  - Room E   │  │  - Room H   │                │
│  │  - Room C   │  │  - Room F   │  │  - Room I   │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
│                                                                     │
│  Autoscaling: 3-10 instances based on concurrent sessions          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Instance Configuration

```yaml
# infra/gce-instance-template.yaml
machineType: n1-standard-2 # 2 vCPU, 7.5 GB RAM
disk:
  sizeGb: 20
  type: pd-ssd # Fast startup

# Autoscaling
autoscalingPolicy:
  minNumReplicas: 3 # Always 3 warm instances
  maxNumReplicas: 10
  coolDownPeriodSec: 60
  cpuUtilization:
    target: 0.6 # Scale at 60% CPU
```

### Resource Pre-warming

```typescript
// src/agents/warmup.ts

/**
 * Pre-warm resources for instant session handling.
 * GCE instances run this once at startup.
 */
export async function warmupResources(options: WarmupOptions): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (options.preloadPersonas) {
    tasks.push(preloadAllPersonaConfigs());
  }

  if (options.warmTTSConnections) {
    tasks.push(warmCartesiaConnections());
  }

  if (options.warmDBConnections) {
    tasks.push(warmFirestorePool());
  }

  // Pre-fetch common data
  tasks.push(prefetchCommonData());

  await Promise.all(tasks);
}

async function warmCartesiaConnections(): Promise<void> {
  // Create TTS instances for each persona voice
  const personas = await getAllPersonaConfigs();
  for (const persona of personas) {
    const tts = createPersonaTTS(persona);
    await tts.warmConnection();
    ttsPool.set(persona.id, tts);
  }
}
```

---

## Testing Strategy

### Unit Tests (Fast, Isolated)

```typescript
// src/agents/__tests__/unit/pipelines/identify-user.test.ts

describe('IdentifyUserStep', () => {
  it('extracts user from job metadata', async () => {
    const step = new IdentifyUserStep();
    const ctx = createMockContext({
      jobMetadata: { user_id: 'user123', user_name: 'Alice' },
    });

    const result = await step.execute(ctx);

    expect(result.ok).toBe(true);
    expect(result.value.userId).toBe('user123');
    expect(result.value.userName).toBe('Alice');
  });

  it('handles anonymous users', async () => {
    const step = new IdentifyUserStep();
    const ctx = createMockContext({ jobMetadata: {} });

    const result = await step.execute(ctx);

    expect(result.ok).toBe(true);
    expect(result.value.userId).toBeNull();
  });
});
```

### Integration Tests (Service Boundaries)

```typescript
// src/agents/__tests__/integration/session-lifecycle.test.ts

describe('Session Lifecycle', () => {
  it('completes full session setup', async () => {
    const ctx = createTestJobContext();
    const orchestrator = new SessionOrchestrator(ctx);

    // Run until greeting is spoken
    await orchestrator.runUntilPhase('greeting');

    expect(ctx.room.isConnected).toBe(true);
    expect(mockTTS.spokenTexts).toHaveLength(1);
    expect(mockTTS.spokenTexts[0]).toContain('Hey');
  });

  it('recovers from TTS failure', async () => {
    mockTTS.failNext(new Error('TTS unavailable'));

    const ctx = createTestJobContext();
    const orchestrator = new SessionOrchestrator(ctx);

    await orchestrator.runUntilPhase('greeting');

    // Should use fallback greeting
    expect(mockTTS.spokenTexts[0]).toContain('Hi there');
  });
});
```

---

## Benefits

| Aspect          | Before                      | After                           |
| --------------- | --------------------------- | ------------------------------- |
| Worker files    | 2 competing implementations | 1 unified worker                |
| Entry file      | 1100+ lines                 | ~100 lines (orchestrator)       |
| Testing         | Manual integration only     | Unit + integration + e2e        |
| Adding features | Modify giant file           | Add pipeline step               |
| Error handling  | Try/catch spaghetti         | Result types + error boundaries |
| Dependencies    | Tight coupling              | Adapter interfaces              |
| Startup time    | Variable                    | Consistent (pre-warmed)         |
| Scaling         | Complex                     | Horizontal autoscaling          |

---

## Next Steps

1. **Review this proposal** - Feedback on structure?
2. **Start with core/** - Build foundation types
3. **Incremental migration** - Don't rewrite, refactor
4. **Keep production stable** - Feature flag new architecture

---

## Questions to Discuss

1. **Handler granularity**: Keep current handlers or consolidate?
2. **State management**: SessionStateManager vs simpler state object?
3. **Realtime features**: How to integrate humanization signals?
4. **Testing priority**: Which paths need coverage first?

---

_Last updated: December 2024_
