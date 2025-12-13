# Voice Agent Loading Architecture

## Executive Summary

This document explains the voice agent's loading architecture, the IPC issues we were experiencing, and the fixes implemented.

## File Structure

```
src/
├── agent.ts                      # Entry point (imports voice-worker.ts)
└── agents/
    ├── voice-worker.ts           # ⭐ NEW: Lightweight main process bootstrap
    ├── voice-agent-child.ts      # Child process agent definition
    ├── voice-agent-session.ts    # Session orchestration
    ├── voice-agent-entry.ts      # Full session setup
    ├── voice-agent.ts            # Full agent (legacy, heavy imports)
    └── shared/
        └── resource-server.ts    # Cache file management
```

## The Problem

We were experiencing production IPC failures with symptoms like:

- "runner initialization timed out"
- "assignment for job timed out"
- Sessions failing to start
- Race conditions between prewarm() and entry()

## Root Causes Identified

### 1. Entry Did Not Wait for Prewarm

The LiveKit SDK calls `prewarm()` but does NOT await it. The SDK immediately calls `entry()` after `prewarm()` returns, even if background initialization is still running.

**Before (Broken):**

```typescript
// voice-agent-child.ts entry()
entry: async (ctx: JobContext) => {
  await ctx.connect();
  // ❌ Never waited for prewarm!
  // Deps might be partially loaded here
  const session = _preloadedDeps.voiceAgentSession ?? import(...);
}
```

**After (Fixed):**

```typescript
entry: async (ctx: JobContext) => {
  await ctx.connect();

  // ✅ Wait for prewarm to complete (with timeout)
  if (_prewarmState === 'running' || _prewarmState === 'pending') {
    const result = await Promise.race([
      _prewarmReady.then(() => 'ready'),
      new Promise(r => setTimeout(() => r('timeout'), 30000))
    ]);
  }

  const session = _preloadedDeps.voiceAgentSession ?? import(...);
}
```

### 2. Resource Cache Written AFTER Children Spawned

The main process was setting up the IPC handler and cache file AFTER calling `cli.runApp()`, which spawns child processes. Children would try to read the cache before it existed.

**Before (Broken):**

```typescript
// voice-agent.ts
cli.runApp(...); // Spawns children immediately

// ❌ Children already running!
const { warmupResources, setupIPCHandler } = await import('...');
setupIPCHandler();
warmupResources(); // Too late!
```

**After (Fixed):**

```typescript
// voice-agent.ts
// ✅ Setup BEFORE spawning children
const { warmupResources, setupIPCHandler } = await import('...');
setupIPCHandler();
await warmupResources(); // Wait for cache file

cli.runApp(...); // Now safe to spawn children
```

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ENTRY POINT: agent.ts → voice-worker.ts (MAIN PROCESS)                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  voice-worker.ts (LIGHTWEIGHT - only ~10 imports!)                           │
│                                                                              │
│  1. Startup logging                                                          │
│     ↓                                                                        │
│  2. Health Server Start                                                      │
│     ↓                                                                        │
│  3. Shutdown handlers + Diagnostics + Self-healing (parallel)               │
│     ↓                                                                        │
│  4. IPC Handler Setup                                                        │
│     ↓                                                                        │
│  5. Resource Warmup (writes cache file, awaited!)                           │
│     ↓                                                                        │
│  6. cli.runApp({ agent: 'voice-agent-child.js' })                           │
│     └─→ Spawns child processes                                               │
│                                                                              │
│  NOTE: voice-agent.ts (heavy) is NEVER loaded in main process!              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ spawns
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ CHILD PROCESS (voice-agent-child.ts)                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Module Load (lightweight - only @livekit/agents)                            │
│     ↓                                                                        │
│  prewarm():                                                                  │
│     • Returns IMMEDIATELY (SDK timeout requirement)                          │
│     • Starts background init (fire-and-forget)                               │
│     • Background loads: voice, google, silero, genai, internal modules       │
│     • Resolves _prewarmReady when complete                                   │
│     ↓                                                                        │
│  entry():                                                                    │
│     1. ctx.connect() ← IMMEDIATE (SDK requires within 10s)                   │
│     2. Wait for _prewarmReady OR timeout ← NEW FIX                           │
│     3. Use preloaded deps or fallback to dynamic import                      │
│     4. Call runVoiceAgentSession()                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ delegates to
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SESSION RUNNER (voice-agent-session.ts → voice-agent-entry.ts)               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  • Receives preloaded deps from child process                                │
│  • Creates VAD, TTS, LLM, Agent                                              │
│  • Starts session                                                            │
│  • Handles conversation lifecycle                                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Timing Requirements

See `src/config/timeouts.ts` for the centralized timeout configuration.

### Timeout Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLOUD RUN REQUEST TIMEOUT: 300s (5 min)                                     │
│ └─ Everything must complete within this                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ LIVEKIT SDK (Patched in Dockerfile):                                        │
│ ├─ initializeTimeout: 300s (patched from 30s)                              │
│ │   └─ Parent waits for child initializeResponse                           │
│ ├─ initializeProcessTimeout: 300s (patched from 10s)                       │
│ │   └─ WorkerOptions setting                                                │
│ └─ ORPHANED_TIMEOUT: 300s (patched from 15s)                               │
│     └─ Child ping timeout                                                   │
│                                                                             │
│ APPLICATION TIMEOUTS:                                                       │
│ ├─ warmupTimeout: 30s                                                       │
│ │   └─ Main process waits for cache file                                   │
│ ├─ prewarmWaitTimeout: 30s                                                  │
│ │   └─ entry() waits for prewarm to complete                               │
│ ├─ moduleImportTimeout: 30s                                                 │
│ │   └─ Individual module import timeout                                    │
│ └─ roomConnectTimeout: 30s                                                  │
│     └─ ctx.connect() timeout                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### LiveKit SDK Patching

The LiveKit SDK has hardcoded timeouts that are too short for Cloud Run cold starts.
We patch these in `docker/Dockerfile.agent`:

```dockerfile
# Files patched:
# - node_modules/@livekit/agents/dist/worker.js
# - node_modules/@livekit/agents/dist/job_proc_lazy_main.js
# - node_modules/@livekit/agents/dist/inference_proc_lazy_main.js

# Patterns patched:
initializeTimeout: 3e4        → 3e5      # 30s → 5min
initializeProcessTimeout = 10 * 1e3 → 300 * 1e3  # 10s → 5min
ORPHANED_TIMEOUT = 15 * 1e3   → 300 * 1e3  # 15s → 5min
```

### Typical Timing (Cold Start)

| Phase             | Typical   | Worst Case |
| ----------------- | --------- | ---------- |
| Module load       | 100-500ms | 2s         |
| prewarm() return  | <100ms    | <100ms     |
| Background warmup | 5-15s     | 30s        |
| ctx.connect()     | 200-500ms | 2s         |
| Prewarm wait      | 0-5s      | 30s        |
| Session creation  | 2-5s      | 10s        |
| **Total**         | **8-25s** | **~75s**   |

## Cache File Mechanism

Since LiveKit SDK manages child process IPC, we use a cache file approach:

```
/tmp/ferni-cache/
├── persona-configs.json   # Pre-serialized persona configs
└── warmup-status.json     # Warmup completion status
```

Child processes check `warmup-status.json` to see if main process has warmed up, then read `persona-configs.json` for fast persona loading.

## Fallback Chain

If preloaded deps aren't available, we fall back to dynamic imports:

```typescript
// Priority 1: Preloaded dep (instant)
const module =
  _preloadedDeps.voiceAgentSession ??
  // Priority 2: Dynamic import (slow but works)
  (await import('./voice-agent-session.js'));
```

## Completed Improvements

### 1. ✅ Separate Main Process Bootstrap

Created `voice-worker.ts` that only handles main process concerns:

- Lightweight (~10 imports vs ~50)
- Fast startup (~2s vs ~10s)
- Clear separation of concerns

### 2. ✅ Centralized Timeout Configuration

Created `src/config/timeouts.ts` with:

- All timeout values in one place
- Documentation of what each timeout does
- Validation function to check consistency
- Helper to generate timeout report

### 3. Future: Health Check Improvements

Add specific health check for prewarm/cache status.

## Tuning Timeouts

All timeouts are documented in `src/config/timeouts.ts`. To tune:

1. **Edit the centralized config**:

   ```typescript
   // src/config/timeouts.ts
   export const APP_TIMEOUTS = {
     WARMUP_TIMEOUT: 30_000, // Increase for slow networks
     PREWARM_WAIT_TIMEOUT: 30_000, // Increase for heavy modules
     // ...
   };
   ```

2. **For LiveKit SDK timeouts**, edit `docker/Dockerfile.agent`:

   ```dockerfile
   # Change 3e5 (300000ms = 5min) to desired value
   sed -i "s/initializeTimeout: 3e4/initializeTimeout: 3e5/g" "{}"
   ```

3. **For Cloud Run timeouts**, edit `infra/cloudrun-service-agent.yaml`:
   ```yaml
   spec:
     timeoutSeconds: 300 # Max request duration
   ```

### Timeout Validation

```bash
# Print all timeout values
npx tsx -e "import { getTimeoutReport } from './src/config/timeouts.js'; console.log(getTimeoutReport())"

# Check for consistency issues
npx tsx -e "import { validateTimeouts } from './src/config/timeouts.js'; console.log(validateTimeouts())"
```

## Testing the Fix

```bash
# Build
npm run build:fast

# Deploy (will use new loading order)
npm run deploy:agent:async

# Monitor logs for:
# - "Setting up resource cache BEFORE spawning children"
# - "Resource cache ready"
# - "⏳ Waiting for prewarm to complete"
# - "✅ Prewarm signaled ready"
```

## Log Levels Reference

| Level     | Meaning                       |
| --------- | ----------------------------- |
| [STARTUP] | Module initialization         |
| [PREWARM] | Dependency preloading         |
| [ENTRY]   | Job entry/session handling    |
| [SYNC]    | Prewarm/entry synchronization |
| [TIMING]  | Performance measurements      |
| [STATE]   | Dependency state changes      |
| [ERROR]   | Errors and failures           |

## Key Files

| File                        | Purpose                            | Imports |
| --------------------------- | ---------------------------------- | ------- |
| `agent.ts`                  | Entry point (imports voice-worker) | 1       |
| `voice-worker.ts`           | ⭐ Main process bootstrap          | ~10     |
| `voice-agent-child.ts`      | Child process agent definition     | ~5      |
| `voice-agent-session.ts`    | Session orchestration              | ~3      |
| `voice-agent-entry.ts`      | Full session setup                 | ~15     |
| `voice-agent.ts`            | Full agent logic (legacy)          | ~50     |
| `shared/resource-server.ts` | Cache file management              | ~5      |

## Benefits of New Architecture

1. **Fast Main Process Startup**: voice-worker.ts loads in ~2s vs ~10s for voice-agent.ts
2. **Lower Memory**: Main process only loads what it needs
3. **Clear Separation**: Bootstrap vs agent logic cleanly separated
4. **Easier Debugging**: Each file has single responsibility
5. **No Race Conditions**: Warmup happens BEFORE children spawn
