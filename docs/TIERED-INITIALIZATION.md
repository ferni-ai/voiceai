# Tiered Initialization Architecture

## Problem Statement

The voice agent has 51 top-level imports that take 30+ seconds to load. LiveKit SDK spawns child processes for each session, and these child processes must initialize within 30 seconds or timeout.

## Solution: Tiered Initialization

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS                                       │
│  Started once per Cloud Run container, stays warm                           │
│                                                                              │
│  TIER 1: Instant (<100ms)                                                   │
│  ├── Health server (port 8080)                                              │
│  ├── LiveKit SDK connection                                                 │
│  └── Job dispatcher                                                         │
│                                                                              │
│  TIER 2: Background Warm-Up (after Tier 1 completes)                        │
│  ├── VAD model (Silero) - load once, reuse                                  │
│  ├── TTS client pool - pre-connected Cartesia clients                       │
│  ├── LLM client pool - pre-connected Gemini clients                         │
│  ├── Persona configs - all 6 personas loaded                                │
│  └── Trust system services - initialized                                    │
│                                                                              │
│  WARM RESOURCE POOL (shared via IPC with child processes)                   │
│  └── Resources available for child processes to use                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ spawn (with IPC channel)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHILD PROCESS (Per Session)                          │
│  Spawned by LiveKit SDK when a job is dispatched                            │
│                                                                              │
│  TIER 1: Instant (<50ms)                                                    │
│  ├── defineAgent() export                                                   │
│  └── prewarm() - just marks ready                                           │
│                                                                              │
│  TIER 2: Session Start (in entry() function)                                │
│  ├── Receive context from main process via IPC                              │
│  ├── Get pre-warmed resources from pool                                     │
│  └── Create session with shared resources                                   │
│                                                                              │
│  TIER 3: On-Demand (during conversation)                                    │
│  ├── Tool execution (calendar, spotify, etc.)                               │
│  ├── Handoff logic (when persona switch needed)                             │
│  └── Trust system updates (async, non-blocking)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Strategy

#### Phase 1: Lazy Loading (Current - Getting Unblocked)

- Child process loads minimal code
- Dependencies loaded on-demand in entry()
- Gets us working, but each session reloads everything

#### Phase 2: Main Process Pre-Warming

- Main process loads expensive resources after startup
- Resources stored in memory, ready for use
- Child processes receive resources via serialization

#### Phase 3: Resource Sharing

- Use Node.js Worker Threads or IPC for sharing
- VAD model, TTS connections shared across sessions
- Significant memory and CPU savings

### Current Implementation (Phase 2)

```typescript
// voice-agent.ts - Main process warms resources
if (!process.send) {
  // ... start worker ...

  // PHASE 2: Pre-warm expensive resources (background)
  const { warmupResources, setupIPCHandler } = await import('./shared/resource-server.js');
  setupIPCHandler();
  warmupResources(); // Non-blocking, runs in background
}

// resource-server.ts - Google/Anthropic sidecar pattern
class ResourceRegistry {
  async warmup() {
    await Promise.all([
      this.warmupVAD(),      // Load Silero model once
      this.warmupTTS(),      // Pre-connect Cartesia clients
      this.warmupPersonas(), // Cache persona configs
    ]);
  }
}

// voice-agent-entry.ts - Child process checks for pre-warmed resources
async function checkPrewarmedResources(): Promise<boolean> {
  const { requestResource, initIPCClient } = await import('./shared/resource-server.js');
  initIPCClient();
  const status = await requestResource('vad', 'status', {});
  return status.success && status.data?.warmedUp;
}
```

### Future Optimization: Pre-Warmed Pool

```typescript
// In main process (voice-agent.ts)
class WarmResourcePool {
  private vadModel: VAD | null = null;
  private ttsPool: Map<string, CartesiaTTS> = new Map();

  async warmUp() {
    // Load VAD once
    this.vadModel = await silero.VAD.load();

    // Pre-create TTS clients for each persona
    for (const persona of PERSONAS) {
      this.ttsPool.set(persona.id, createTTS(persona.voice));
    }
  }

  getVAD(): VAD {
    return this.vadModel!;
  }

  getTTS(personaId: string): CartesiaTTS {
    return this.ttsPool.get(personaId)!;
  }
}

// Child process gets resources via proc.userData
export default defineAgent({
  entry: async (ctx, proc) => {
    const pool = proc.userData.resourcePool;
    const vad = pool.getVAD(); // Already loaded!
    const tts = pool.getTTS(personaId); // Already connected!
    // ... use resources
  },
});
```

### Metrics to Track

| Metric             | Before            | Phase 1 | Phase 2 (Target) |
| ------------------ | ----------------- | ------- | ---------------- |
| Cold start         | 30+ sec (timeout) | ~15 sec | <5 sec           |
| Warm session start | N/A               | ~10 sec | <2 sec           |
| Memory per session | ~500MB            | ~500MB  | ~100MB (shared)  |
| CPU during load    | 100%              | 100%    | <30%             |

### Related Files

- `src/agents/voice-agent.ts` - Main process entry
- `src/agents/voice-agent-child.ts` - Lightweight child entry
- `src/agents/voice-agent-entry.ts` - Lazy loading session runner
- `src/agents/voice-agent-session.ts` - Session orchestrator

### References

- [LiveKit Agents SDK - Worker Options](https://docs.livekit.io/agents/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Cloud Run Min Instances](https://cloud.google.com/run/docs/configuring/min-instances)
