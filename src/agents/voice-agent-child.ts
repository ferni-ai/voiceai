/**
 * Lightweight Voice Agent Entry Point for Child Processes
 *
 * This file is designed to load INSTANTLY (<1 second) for LiveKit SDK child processes.
 * It only imports the absolute minimum needed for the agent definition.
 *
 * ALL heavy modules are preloaded during prewarm() so entry() is instant.
 *
 * E2E DIAGNOSTICS:
 * - PREWARM logs are emitted immediately after child spawn
 * - ENTRY logs track the full session lifecycle
 * - All errors are captured with full stack traces
 *
 * LOGGING LEVELS:
 * - [STARTUP] - Module initialization
 * - [PREWARM] - Dependency preloading
 * - [ENTRY] - Job entry/session handling
 * - [SYNC] - Prewarm/entry synchronization
 * - [TIMING] - Performance measurements
 * - [STATE] - Dependency state changes
 * - [ERROR] - Errors and failures
 */

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

const _startTime = Date.now();
const _processLabel = `CHILD:${process.pid}`;

/** Get current timestamp prefix for logs */
const _logPrefix = () => `[${new Date().toISOString()}] [${_processLabel}]`;

/** Get memory usage in MB */
const _memMB = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

/** Get elapsed time since module start */
const _elapsed = () => Date.now() - _startTime;

/** Log a message with standard prefix */
const log = (level: string, msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`${_logPrefix()} [${level}] ${msg}${dataStr}\n`);
};

/** Log a separator box for major phases */
const logBox = (title: string) => {
  const line = '═'.repeat(60);
  process.stderr.write(`\n${_logPrefix()} ╔${line}╗\n`);
  process.stderr.write(`${_logPrefix()} ║  ${title.padEnd(58)}║\n`);
  process.stderr.write(`${_logPrefix()} ╚${line}╝\n`);
};

/** Log a timing measurement */
const logTiming = (operation: string, durationMs: number, details?: string) => {
  const status = durationMs < 1000 ? '✅' : durationMs < 3000 ? '⚠️' : '🔴';
  const detailStr = details ? ` (${details})` : '';
  log('TIMING', `${status} ${operation}: ${durationMs}ms${detailStr}`, { mem: _memMB() });
};

// ============================================================================
// STARTUP LOGGING
// ============================================================================

logBox('VOICE AGENT CHILD PROCESS STARTING');
log('STARTUP', 'Module initializing', {
  pid: process.pid,
  isChild: !!process.send,
  nodeVersion: process.version,
  platform: process.platform,
  mem: _memMB(),
});

// CRITICAL: Catch uncaught errors in child process to debug silent failures
process.on('uncaughtException', (err) => {
  logBox('UNCAUGHT EXCEPTION');
  log('ERROR', `Message: ${err.message}`);
  log('ERROR', `Stack: ${err.stack}`);
  log('ERROR', 'Process will exit with code 1');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', `UNHANDLED REJECTION: ${reason}`);
});

// Track import timing
const _importStart = Date.now();

// ONLY import what's absolutely necessary for the agent definition
import { defineAgent, type JobContext, type JobProcess } from '@livekit/agents';

logTiming('@livekit/agents import', Date.now() - _importStart);
log('STARTUP', 'Core imports complete', { elapsed: _elapsed(), mem: _memMB() });

// ============================================================================
// PRELOADED DEPENDENCIES CACHE
// ============================================================================

export interface PreloadedDeps {
  // External packages
  voice: typeof import('@livekit/agents').voice | null;
  google: typeof import('@livekit/agents-plugin-google') | null;
  silero: typeof import('@livekit/agents-plugin-silero') | null;
  genai: typeof import('@google/genai') | null;
  // Lightweight internal modules (NO HEAVY IMPORT CHAINS)
  resourceServer: typeof import('./shared/resource-server.js') | null;
  e2eDiagnostics: typeof import('./shared/e2e-diagnostics.js') | null;
  warmGreeting: typeof import('./shared/warm-greeting.js') | null;
  lightweightTTS: typeof import('./shared/lightweight-tts.js') | null;
  // Heavy modules - NOT preloaded, imported on-demand if cache miss
  selfHealing: typeof import('../services/self-healing/index.js') | null;
  voiceManager: typeof import('../speech/voice-manager.js') | null;
  personas: typeof import('../personas/index.js') | null;
  startup: typeof import('../startup.js') | null;
  voiceAgentEntry: typeof import('./voice-agent-entry.js') | null;
  voiceAgentSession: typeof import('./voice-agent-session.js') | null;
  // Pre-loaded heavy resources (not just modules)
  vadModel: unknown | null;
  personaBundlesReady: boolean;
}

export const _preloadedDeps: PreloadedDeps = {
  voice: null,
  google: null,
  silero: null,
  genai: null,
  resourceServer: null,
  e2eDiagnostics: null,
  warmGreeting: null,
  lightweightTTS: null,
  selfHealing: null,
  voiceManager: null,
  personas: null,
  startup: null,
  voiceAgentEntry: null,
  voiceAgentSession: null,
  vadModel: null,
  personaBundlesReady: false,
};

/** Log current dependency state */
const logDepsState = () => {
  const loaded = Object.entries(_preloadedDeps)
    .filter(([k, v]) => v !== null && k !== 'personaBundlesReady')
    .map(([k]) => k);
  const missing = Object.entries(_preloadedDeps)
    .filter(([k, v]) => v === null && k !== 'personaBundlesReady')
    .map(([k]) => k);

  log('STATE', `Dependencies: ${loaded.length} loaded, ${missing.length} missing`, {
    loaded: loaded.join(', ') || 'none',
    missing: missing.join(', ') || 'none',
    vadModel: _preloadedDeps.vadModel ? 'loaded' : 'not loaded',
    personaBundles: _preloadedDeps.personaBundlesReady ? 'ready' : 'not ready',
  });
};

// ============================================================================
// PREWARM SYNCHRONIZATION
// ============================================================================
// CRITICAL FIX: The LiveKit SDK does NOT await prewarm() before calling entry().
// This means entry() can run while prewarm() is still loading dependencies.
// We need a Promise that entry() can await to ensure deps are ready.

let _prewarmState: 'pending' | 'running' | 'complete' | 'failed' | 'timeout' = 'pending';
let _prewarmResolve: (() => void) | null = null;
let _prewarmReject: ((err: Error) => void) | null = null;
const _entryWaitingCount = 0;

const _prewarmReady = new Promise<void>((resolve, reject) => {
  _prewarmResolve = resolve;
  _prewarmReject = reject;
});

log('SYNC', 'Prewarm synchronization initialized', { state: _prewarmState });

// ============================================================================
// SMART READINESS CHECK (No hard timeout!)
// ============================================================================
// Instead of a fixed timeout, we use a progress-based approach:
// 1. Entry can proceed as soon as CRITICAL deps are loaded (voice, google, silero)
// 2. Non-critical deps can load in background
// 3. If critical deps aren't loaded, entry falls back to dynamic imports
// 4. No arbitrary timeout - we check actual state, not elapsed time

const CRITICAL_DEPS = ['voice', 'google', 'silero', 'voiceAgentSession'] as const;

/** Check if critical dependencies are loaded */
function areCriticalDepsLoaded(): boolean {
  return CRITICAL_DEPS.every((dep) => _preloadedDeps[dep] !== null);
}

/** Get loading progress as a percentage */
function getLoadingProgress(): {
  loaded: number;
  total: number;
  percent: number;
  critical: boolean;
} {
  const allDeps = Object.entries(_preloadedDeps).filter(([k]) => k !== 'personaBundlesReady');
  const loaded = allDeps.filter(([_, v]) => v !== null).length;
  const total = allDeps.length;
  const critical = areCriticalDepsLoaded();
  return { loaded, total, percent: Math.round((loaded / total) * 100), critical };
}

// Safety timeout - only logs a warning, doesn't reject
// This is just for monitoring, not for control flow
// NOTE: Keep in sync with APP_TIMEOUTS.PREWARM_SAFETY_TIMEOUT in src/config/timeouts.ts
const SAFETY_TIMEOUT_MS = 120000; // 2 minutes - just for logging
const _safetyTimeout = setTimeout(() => {
  if (_prewarmState === 'running' || _prewarmState === 'pending') {
    const progress = getLoadingProgress();
    log('SYNC', `⚠️ Prewarm still running after ${SAFETY_TIMEOUT_MS / 1000}s (monitoring only)`, {
      elapsed: _elapsed(),
      state: _prewarmState,
      progress: `${progress.loaded}/${progress.total} (${progress.percent}%)`,
      criticalReady: progress.critical,
      entryWaiting: _entryWaitingCount,
    });
    logDepsState();
    // NOTE: We do NOT reject here - we just log for monitoring
    // Entry will proceed when deps are ready OR fall back to dynamic imports
  }
}, SAFETY_TIMEOUT_MS);

export function getPreloadedDeps(): PreloadedDeps {
  return _preloadedDeps;
}

/** Wait for prewarm to complete before using deps */
export async function waitForPrewarm(): Promise<void> {
  return _prewarmReady;
}

/** Get current prewarm state for debugging */
export function getPrewarmState(): string {
  return _prewarmState;
}

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const prewarmStart = Date.now();
    _prewarmState = 'running';

    logBox('PREWARM STARTING');
    log('PREWARM', 'Beginning dependency preload', {
      elapsed: _elapsed(),
      mem: _memMB(),
      prewarmState: _prewarmState,
      entryWaiting: _entryWaitingCount,
    });

    // ══════════════════════════════════════════════════════════════════════
    // CRITICAL: Return IMMEDIATELY to let SDK send initializeResponse!
    // The SDK has a 30-second timeout waiting for prewarm to return.
    // All heavy work happens in background - entry() will wait for it.
    // ══════════════════════════════════════════════════════════════════════

    // Fire-and-forget background initialization
    const doBackgroundInit = async () => {
      try {
        // ══════════════════════════════════════════════════════════════════════
        // PHASE 1: External packages (LiveKit, Google, Silero, GenAI)
        // ══════════════════════════════════════════════════════════════════════
        log('PREWARM', '📦 Phase 1: Loading external packages...');
        const phase1Start = Date.now();

        const phase1Results = await Promise.allSettled([
          import('@livekit/agents').then((m) => {
            logTiming('@livekit/agents', Date.now() - phase1Start);
            return m;
          }),
          import('@livekit/agents-plugin-google').then((m) => {
            logTiming('@livekit/agents-plugin-google', Date.now() - phase1Start);
            return m;
          }),
          import('@livekit/agents-plugin-silero').then((m) => {
            logTiming('@livekit/agents-plugin-silero', Date.now() - phase1Start);
            return m;
          }),
          import('@google/genai').then((m) => {
            logTiming('@google/genai', Date.now() - phase1Start);
            return m;
          }),
        ]);

        // Extract results
        const [agentsResult, googleResult, sileroResult, genaiResult] = phase1Results;
        const agents = agentsResult.status === 'fulfilled' ? agentsResult.value : null;
        const google = googleResult.status === 'fulfilled' ? googleResult.value : null;
        const silero = sileroResult.status === 'fulfilled' ? sileroResult.value : null;
        const genai = genaiResult.status === 'fulfilled' ? genaiResult.value : null;

        // Log failures
        phase1Results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const names = [
              '@livekit/agents',
              '@livekit/agents-plugin-google',
              '@livekit/agents-plugin-silero',
              '@google/genai',
            ];
            log('ERROR', `Failed to load ${names[i]}: ${r.reason}`);
          }
        });

        logTiming(
          'Phase 1 TOTAL',
          Date.now() - phase1Start,
          `${phase1Results.filter((r) => r.status === 'fulfilled').length}/4 succeeded`
        );
        log('PREWARM', 'Phase 1 complete', { mem: _memMB(), elapsed: _elapsed() });

        // Update deps state
        if (agents) _preloadedDeps.voice = agents.voice;
        if (google) _preloadedDeps.google = google;
        if (silero) _preloadedDeps.silero = silero;
        if (genai) _preloadedDeps.genai = genai;
        logDepsState();

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 2: LIGHTWEIGHT Internal modules ONLY
        // ══════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Do NOT import heavy modules here!
        // - voice-manager.js has a massive import chain (cartesia, handoff, registry, bundles)
        // - personas/index.js imports 50+ modules
        // - startup.js imports memory, services, tools
        // These caused 112+ second hangs!
        //
        // Instead, use:
        // - resource-server.js to read from cache file (fast!)
        // - lightweight-tts.js for TTS creation (no heavy deps!)
        // - warm-greeting.js is self-contained
        // - e2e-diagnostics.js is self-contained
        // ══════════════════════════════════════════════════════════════════════
        log('PREWARM', '📦 Phase 2: Loading LIGHTWEIGHT internal modules...');
        const phase2Start = Date.now();

        // Only import lightweight modules that don't have heavy import chains
        const phase2Results = await Promise.allSettled([
          import('./shared/resource-server.js').then((m) => {
            logTiming('resource-server', Date.now() - phase2Start);
            return m;
          }),
          import('./shared/e2e-diagnostics.js').then((m) => {
            logTiming('e2e-diagnostics', Date.now() - phase2Start);
            return m;
          }),
          import('./shared/warm-greeting.js').then((m) => {
            logTiming('warm-greeting', Date.now() - phase2Start);
            return m;
          }),
          import('./shared/lightweight-tts.js').then((m) => {
            logTiming('lightweight-tts', Date.now() - phase2Start);
            return m;
          }),
        ]);

        log('PREWARM', '📦 Phase 2 imports completed, processing results...');

        // Extract results
        const [resourceServerResult, e2eResult, warmGreetingResult, lightweightTTSResult] =
          phase2Results;

        logTiming(
          'Phase 2 TOTAL',
          Date.now() - phase2Start,
          `${phase2Results.filter((r) => r.status === 'fulfilled').length}/4 succeeded`
        );
        log('PREWARM', 'Phase 2 complete', { mem: _memMB(), elapsed: _elapsed() });

        // Update deps state - only what we actually imported
        _preloadedDeps.resourceServer =
          resourceServerResult.status === 'fulfilled'
            ? (resourceServerResult.value as typeof _preloadedDeps.resourceServer)
            : null;
        _preloadedDeps.e2eDiagnostics =
          e2eResult.status === 'fulfilled'
            ? (e2eResult.value as typeof _preloadedDeps.e2eDiagnostics)
            : null;
        _preloadedDeps.warmGreeting =
          warmGreetingResult.status === 'fulfilled'
            ? (warmGreetingResult.value as typeof _preloadedDeps.warmGreeting)
            : null;

        // Store lightweight TTS factory for use in entry
        if (lightweightTTSResult.status === 'fulfilled') {
          _preloadedDeps.lightweightTTS = lightweightTTSResult.value as typeof _preloadedDeps.lightweightTTS;
        }

        // NOTE: These are intentionally NOT imported - they cause 112+ second hangs:
        // - voiceManager (use lightweightTTS instead)
        // - personas (get from cache file instead)
        // - startup (not needed - cache has everything)
        // - voiceAgentEntry (imported on-demand in entry())
        // - voiceAgentSession (imported on-demand in entry())
        // - selfHealing (imported on-demand if needed)
        logDepsState();

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 3: VAD Model ONLY (persona configs come from cache file!)
        // ══════════════════════════════════════════════════════════════════════
        // CRITICAL FIX: Do NOT initialize persona bundles or startup here!
        // - Persona bundles require importing personas/index.js (causes 112s hang)
        // - Startup requires importing memory, services, tools (causes 112s hang)
        // Instead, we read from cache file written by main process (instant!)
        // ══════════════════════════════════════════════════════════════════════
        log('PREWARM', '📦 Phase 3: Loading VAD model...');
        const phase3Start = Date.now();

        // VAD model is the only heavy resource we need to load in child
        // Persona configs are read from cache file (written by main process)
        if (silero) {
          try {
            const vadModel = await silero.VAD.load();
            _preloadedDeps.vadModel = vadModel;
            logTiming('Silero VAD model', Date.now() - phase3Start);
            log('PREWARM', '✅ VAD model loaded');
          } catch (vadError) {
            log('ERROR', `VAD model failed to load: ${vadError}`);
            // Non-fatal - will be loaded on-demand in entry()
          }
        } else {
          log('WARN', 'Silero not available, VAD will be loaded on-demand');
        }

        // Check if main process cache is available
        if (_preloadedDeps.resourceServer) {
          try {
            const isWarmed = await _preloadedDeps.resourceServer.isMainProcessWarmedUp();
            if (isWarmed) {
              log('PREWARM', '✅ Main process cache available - persona configs ready');
              _preloadedDeps.personaBundlesReady = true; // Signal that we have configs via cache
            } else {
              log('WARN', 'Main process cache not ready - entry() will load on-demand');
            }
          } catch (cacheError) {
            log('WARN', `Cache check failed: ${cacheError}`);
          }
        }

        logTiming('Phase 3 TOTAL', Date.now() - phase3Start);
        log('PREWARM', 'Phase 3 complete', { mem: _memMB(), elapsed: _elapsed() });

        // Store in proc userData for debugging
        proc.userData.preloadedDeps = _preloadedDeps;

        // ══════════════════════════════════════════════════════════════════════
        // PREWARM COMPLETE
        // ══════════════════════════════════════════════════════════════════════
        _prewarmState = 'complete';
        const totalTime = Date.now() - prewarmStart;

        logBox('PREWARM COMPLETE');
        log('PREWARM', '✅ All dependencies preloaded', {
          totalMs: totalTime,
          elapsed: _elapsed(),
          mem: _memMB(),
          prewarmState: _prewarmState,
          entryWaiting: _entryWaitingCount,
        });
        logDepsState();

        // Signal that prewarm is complete - entry() can now use deps
        clearTimeout(_safetyTimeout);
        if (_prewarmResolve) {
          log('SYNC', '🔓 Signaling prewarm complete to waiting entry() calls', {
            waitingCount: _entryWaitingCount,
          });
          _prewarmResolve();
          _prewarmResolve = null;
        }
      } catch (err) {
        _prewarmState = 'failed';
        const errMsg = err instanceof Error ? err.stack || err.message : String(err);

        logBox('PREWARM FAILED');
        log('ERROR', `Prewarm failed: ${errMsg}`, {
          elapsed: _elapsed(),
          mem: _memMB(),
          prewarmState: _prewarmState,
        });
        logDepsState();

        // Even on failure, resolve so entry() doesn't hang forever
        // Entry will fall back to dynamic imports
        clearTimeout(_safetyTimeout);
        if (_prewarmResolve) {
          log('SYNC', '⚠️ Resolving prewarm (failed) so entry() can proceed with fallbacks');
          _prewarmResolve();
          _prewarmResolve = null;
        }
      }

      proc.userData.prewarmComplete = true;
      proc.userData.prewarmTime = Date.now() - _startTime;
      log('PREWARM', 'Background init complete', {
        prewarmComplete: true,
        prewarmTimeMs: proc.userData.prewarmTime,
      });
    };

    // Start background init (fire-and-forget)
    doBackgroundInit().catch((err) => {
      log('ERROR', `Background init crashed: ${err}`);
    });

    // Return IMMEDIATELY - do not wait for background init!
    // This lets the SDK send initializeResponse within its timeout
    log('PREWARM', '🚀 Prewarm returning immediately (background init started)', {
      elapsed: Date.now() - prewarmStart,
      mem: _memMB(),
    });
  },

  entry: async (ctx: JobContext) => {
    const entryStart = Date.now();
    const jobId = ctx.job.id;
    const roomName = ctx.job.room?.name || 'unknown';
    const participantId = ctx.job.participant?.identity || 'unknown';

    logBox(`ENTRY: Job ${jobId}`);
    log('ENTRY', 'Job received', {
      jobId,
      roomName,
      participantId,
      elapsed: _elapsed(),
      mem: _memMB(),
      prewarmState: _prewarmState,
    });

    try {
      // ══════════════════════════════════════════════════════════════════════
      // CONNECT TO ROOM IMMEDIATELY!
      // ══════════════════════════════════════════════════════════════════════
      // The SDK expects ctx.connect() within 10 seconds of entry() being called.
      // Connect FIRST, before any other operations or imports.
      // ══════════════════════════════════════════════════════════════════════
      log('ENTRY', '🔌 Connecting to room IMMEDIATELY...');
      const connectStart = Date.now();
      await ctx.connect();
      log('ENTRY', `✅ Room connected in ${Date.now() - connectStart}ms`);

      // ══════════════════════════════════════════════════════════════════════
      // WAIT FOR CRITICAL DEPENDENCIES
      // ══════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: The prewarm() function returns immediately but loads deps
      // in background. We MUST wait for critical deps before starting session.
      // Without this, we get race conditions and "assignment for job timed out".
      // ══════════════════════════════════════════════════════════════════════
      const progress = getLoadingProgress();
      log('SYNC', `Deps at entry: ${progress.loaded}/${progress.total}`, {
        prewarmState: _prewarmState,
        criticalReady: progress.critical,
        elapsed: _elapsed(),
      });

      // Wait for prewarm to complete OR timeout after 30s
      // If prewarm failed or timed out, we'll use dynamic imports as fallback
      if (_prewarmState === 'running' || _prewarmState === 'pending') {
        log('SYNC', '⏳ Waiting for prewarm to complete...');
        const waitStart = Date.now();

        // Use Promise.race with timeout
        // NOTE: Keep in sync with APP_TIMEOUTS.PREWARM_WAIT_TIMEOUT in src/config/timeouts.ts
        const PREWARM_WAIT_TIMEOUT = 30_000; // 30 seconds max wait
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), PREWARM_WAIT_TIMEOUT);
        });

        const result = await Promise.race([
          _prewarmReady.then(() => 'ready' as const),
          timeoutPromise,
        ]);

        const waitMs = Date.now() - waitStart;
        if (result === 'timeout') {
          log('SYNC', `⚠️ Prewarm wait timed out after ${waitMs}ms, will use fallback imports`, {
            prewarmState: _prewarmState,
          });
        } else {
          log('SYNC', `✅ Prewarm signaled ready after ${waitMs}ms`, {
            prewarmState: _prewarmState,
          });
        }
      } else {
        log('SYNC', `Prewarm already ${_prewarmState}, proceeding immediately`);
      }

      // Final state check
      const finalProgress = getLoadingProgress();
      log('SYNC', `Final deps: ${finalProgress.loaded}/${finalProgress.total}`, {
        prewarmState: _prewarmState,
        criticalReady: finalProgress.critical,
      });

      // ══════════════════════════════════════════════════════════════════════
      // START SESSION
      // ══════════════════════════════════════════════════════════════════════
      log('ENTRY', '🎤 Starting voice session...', { elapsed: _elapsed() });

      // Use preloaded session module or fallback
      const sessionLoadStart = Date.now();
      const voiceAgentSession =
        _preloadedDeps.voiceAgentSession ?? (await import('./voice-agent-session.js'));

      const sessionLoadMs = Date.now() - sessionLoadStart;
      log(
        'ENTRY',
        `Session module: ${_preloadedDeps.voiceAgentSession ? 'PRELOADED ✅' : `imported (${sessionLoadMs}ms)`}`
      );

      // Run the session
      log('ENTRY', '🚀 Calling runVoiceAgentSession...');
      await voiceAgentSession.runVoiceAgentSession(ctx);

      // ══════════════════════════════════════════════════════════════════════
      // SESSION COMPLETE
      // ══════════════════════════════════════════════════════════════════════
      const totalMs = Date.now() - entryStart;
      logBox(`SESSION COMPLETE: Job ${jobId}`);
      log('ENTRY', '✅ Session completed successfully', {
        jobId,
        totalMs,
        elapsed: _elapsed(),
        mem: _memMB(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);

      logBox(`SESSION FAILED: Job ${jobId}`);
      log('ERROR', `Session failed: ${errMsg}`, {
        jobId,
        elapsed: _elapsed(),
        mem: _memMB(),
        prewarmState: _prewarmState,
      });
      logDepsState();

      // Try to stay connected so user doesn't get disconnected abruptly
      try {
        if (!ctx.room.isConnected) {
          log('ENTRY', 'Attempting to connect to room for graceful handling...');
          await ctx.connect();
        }
        log('ENTRY', 'Waiting for room disconnect...');
        await new Promise<void>((resolve) => {
          ctx.room.on('disconnected', () => resolve());
        });
      } catch (cleanupErr) {
        log('ERROR', `Cleanup failed: ${cleanupErr}`);
      }
    }
  },
});

// ============================================================================
// MODULE LOAD COMPLETE
// ============================================================================
log('STARTUP', '📦 Module load complete', {
  elapsed: _elapsed(),
  mem: _memMB(),
  prewarmState: _prewarmState,
});
// Cache bust 1765661593
