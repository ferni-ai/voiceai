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
// OPTIMIZATION: Only include modules that are ACTUALLY preloaded.
// Heavy modules (self-healing, personas, startup, etc.) are imported on-demand
// in voice-agent-entry.ts when needed (usually in error paths).

export interface PreloadedDeps {
  // External packages (preloaded in Phase 1)
  voice: typeof import('@livekit/agents').voice | null;
  google: typeof import('@livekit/agents-plugin-google') | null;
  silero: typeof import('@livekit/agents-plugin-silero') | null;
  genai: typeof import('@google/genai') | null;
  // Lightweight internal modules (preloaded in Phase 2)
  // NOTE: Using cache-reader.ts instead of resource-server.ts for zero dependencies
  cacheReader: typeof import('./shared/cache-reader.js') | null;
  e2eDiagnostics: typeof import('./shared/e2e-diagnostics.js') | null;
  warmGreeting: typeof import('./shared/warm-greeting.js') | null;
  lightweightTTS: typeof import('./shared/lightweight-tts.js') | null;
  lightweightResilience: typeof import('./shared/lightweight-resilience.js') | null;
  // Pre-loaded heavy resources (not modules)
  vadModel: unknown | null;
  // Flags indicating preload status
  personaBundlesReady: boolean;
  cartesiaTTSPrewarmed: boolean;
}

export const _preloadedDeps: PreloadedDeps = {
  voice: null,
  google: null,
  silero: null,
  genai: null,
  cacheReader: null,
  e2eDiagnostics: null,
  warmGreeting: null,
  lightweightTTS: null,
  lightweightResilience: null,
  vadModel: null,
  personaBundlesReady: false,
  cartesiaTTSPrewarmed: false,
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

const CRITICAL_DEPS = ['voice', 'google', 'silero'] as const;

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
        // OPTIMIZATION: Start VAD model loading NOW (in parallel with Phase 2)
        // ══════════════════════════════════════════════════════════════════════
        // VAD loading takes 2-5 seconds. By starting it here, it runs in parallel
        // with Phase 2 lightweight module imports, potentially saving 1-3 seconds.
        let vadLoadPromise: Promise<void> | null = null;
        const vadLoadStart = Date.now();
        if (silero) {
          log('PREWARM', '🎤 Starting VAD model load (parallel with Phase 2)...');
          vadLoadPromise = silero.VAD.load()
            .then((vadModel: unknown) => {
              _preloadedDeps.vadModel = vadModel;
              logTiming('Silero VAD model (parallel)', Date.now() - vadLoadStart);
              log('PREWARM', '✅ VAD model loaded (parallel)');
            })
            .catch((vadError: unknown) => {
              log('ERROR', `VAD model failed to load: ${vadError}`);
              // Non-fatal - will be loaded on-demand in entry()
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        // OPTIMIZATION: Preconnect to external APIs (DNS + TLS handshake)
        // ══════════════════════════════════════════════════════════════════════
        // Saves ~200-500ms on first API call by pre-establishing connections.
        // Fire-and-forget - we don't wait for these to complete.
        const preconnectUrls = [
          'https://api.cartesia.ai', // TTS API
          'https://generativelanguage.googleapis.com', // Gemini API
        ];
        for (const url of preconnectUrls) {
          fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
            .then(() => log('PREWARM', `🔗 Preconnected to ${new URL(url).hostname}`))
            .catch(() => {
              /* Best effort - ignore failures */
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        // OPTIMIZATION: TTS prewarm will happen after Phase 2 imports lightweight-tts
        // We don't import it here to avoid duplicate imports.
        // ══════════════════════════════════════════════════════════════════════

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 2: LIGHTWEIGHT Internal modules ONLY
        // ══════════════════════════════════════════════════════════════════════
        // CRITICAL: All modules here must have ZERO or minimal import chains!
        //
        // We use:
        // - cache-reader.js: Zero dependencies, just reads JSON files
        // - lightweight-tts.js: Only imports @livekit/agents-plugin-cartesia
        // - lightweight-resilience.js: Zero dependencies, retry + error humanization
        // - warm-greeting.js: Self-contained greeting strings
        // - e2e-diagnostics.js: Self-contained logging
        //
        // NEVER import here:
        // - resource-server.js (imports safe-logger → @livekit/agents)
        // - voice-manager.js (massive import chain: cartesia, handoff, registry, bundles)
        // - personas/index.js (imports 50+ modules)
        // - startup.js (imports memory, services, tools)
        // - self-healing/index.js (imports 10+ modules)
        // ══════════════════════════════════════════════════════════════════════
        log('PREWARM', '📦 Phase 2: Loading LIGHTWEIGHT internal modules...');
        const phase2Start = Date.now();

        // Only import lightweight modules with zero/minimal import chains
        const phase2Results = await Promise.allSettled([
          import('./shared/cache-reader.js').then((m) => {
            logTiming('cache-reader', Date.now() - phase2Start);
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
          import('./shared/lightweight-resilience.js').then((m) => {
            logTiming('lightweight-resilience', Date.now() - phase2Start);
            return m;
          }),
        ]);

        log('PREWARM', '📦 Phase 2 imports completed, processing results...');

        // Extract results
        const [
          cacheReaderResult,
          e2eResult,
          warmGreetingResult,
          lightweightTTSResult,
          lightweightResilienceResult,
        ] = phase2Results;

        logTiming(
          'Phase 2 TOTAL',
          Date.now() - phase2Start,
          `${phase2Results.filter((r) => r.status === 'fulfilled').length}/5 succeeded`
        );
        log('PREWARM', 'Phase 2 complete', { mem: _memMB(), elapsed: _elapsed() });

        // Update deps state - only what we actually imported
        _preloadedDeps.cacheReader =
          cacheReaderResult.status === 'fulfilled'
            ? (cacheReaderResult.value as typeof _preloadedDeps.cacheReader)
            : null;
        _preloadedDeps.e2eDiagnostics =
          e2eResult.status === 'fulfilled'
            ? (e2eResult.value as typeof _preloadedDeps.e2eDiagnostics)
            : null;
        _preloadedDeps.warmGreeting =
          warmGreetingResult.status === 'fulfilled'
            ? (warmGreetingResult.value as typeof _preloadedDeps.warmGreeting)
            : null;
        _preloadedDeps.lightweightTTS =
          lightweightTTSResult.status === 'fulfilled'
            ? (lightweightTTSResult.value as typeof _preloadedDeps.lightweightTTS)
            : null;
        _preloadedDeps.lightweightResilience =
          lightweightResilienceResult.status === 'fulfilled'
            ? (lightweightResilienceResult.value as typeof _preloadedDeps.lightweightResilience)
            : null;

        logDepsState();

        // ══════════════════════════════════════════════════════════════════════
        // OPTIMIZATION: Pre-warm TTS connection (fire-and-forget)
        // ══════════════════════════════════════════════════════════════════════
        // Now that we have lightweightTTS loaded, pre-warm a TTS instance.
        // This runs in parallel with Phase 3 (VAD wait + cache check).
        let ttsPrewarmPromise: Promise<void> | null = null;
        if (_preloadedDeps.lightweightTTS) {
          log('PREWARM', '🎤 Pre-warming TTS connection...');
          ttsPrewarmPromise = _preloadedDeps.lightweightTTS
            .prewarmTTSConnection()
            .then(() => log('PREWARM', '✅ TTS pre-warmed'))
            .catch(() => {
              /* Best effort */
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 3: Wait for VAD + Check cache (VAD already loading in parallel!)
        // ══════════════════════════════════════════════════════════════════════
        // VAD model loading was started right after Phase 1 (runs in parallel with Phase 2)
        // Here we just await the promise and check the cache status.
        // ══════════════════════════════════════════════════════════════════════
        log('PREWARM', '📦 Phase 3: Waiting for VAD model + checking cache...');
        const phase3Start = Date.now();

        // Wait for VAD model (already loading in parallel since after Phase 1)
        if (vadLoadPromise) {
          await vadLoadPromise;
          if (_preloadedDeps.vadModel) {
            log('PREWARM', '✅ VAD model ready (was loading in parallel)');
          }
        } else if (!silero) {
          log('WARN', 'Silero not available, VAD will be loaded on-demand');
        }

        // Check if main process cache is available (using lightweight cache-reader)
        if (_preloadedDeps.cacheReader) {
          try {
            const isWarmed = _preloadedDeps.cacheReader.isMainProcessWarmedUp();
            if (isWarmed) {
              const stats = _preloadedDeps.cacheReader.getCacheStats();
              log('PREWARM', '✅ Main process cache available - persona configs ready', {
                personaCount: stats.personaCount,
                cacheAgeMs: stats.cacheAgeMs,
              });
              _preloadedDeps.personaBundlesReady = true; // Signal that we have configs via cache
            } else {
              log('WARN', 'Main process cache not ready - entry() will load on-demand');
            }
          } catch (cacheError) {
            log('WARN', `Cache check failed: ${cacheError}`);
          }
        }

        logTiming('Phase 3 TOTAL (VAD wait + cache check)', Date.now() - phase3Start);
        log('PREWARM', 'Phase 3 complete', { mem: _memMB(), elapsed: _elapsed() });

        // Wait for TTS prewarm (should already be done by now, but make sure)
        if (ttsPrewarmPromise) {
          await ttsPrewarmPromise;
          _preloadedDeps.cartesiaTTSPrewarmed = true;
        }

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

      // Import session module (lightweight - just delegates to voice-agent-entry)
      const sessionLoadStart = Date.now();
      const voiceAgentSession = await import('./voice-agent-session.js');
      logTiming('voice-agent-session import', Date.now() - sessionLoadStart);

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
