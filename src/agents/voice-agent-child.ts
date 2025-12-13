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
 */

// Log immediately before any imports
const _startTime = Date.now();
const _processLabel = `CHILD:${process.pid}`;
const _logPrefix = () => `[${new Date().toISOString()}] [${_processLabel}]`;

process.stderr.write(
  `${_logPrefix()} [STARTUP] Module starting isChild=${!!process.send}\n`
);

// CRITICAL: Catch uncaught errors in child process to debug silent failures
process.on('uncaughtException', (err) => {
  process.stderr.write(
    `\n${_logPrefix()} [ERROR] UNCAUGHT EXCEPTION\n` +
    `${_logPrefix()} [ERROR] ${err.message}\n` +
    `${_logPrefix()} [ERROR] Stack: ${err.stack}\n\n`
  );
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `\n${_logPrefix()} [WARN] UNHANDLED REJECTION: ${reason}\n\n`
  );
});

// ONLY import what's absolutely necessary for the agent definition
import { defineAgent, type JobContext, type JobProcess } from '@livekit/agents';

process.stderr.write(
  `${_logPrefix()} [STARTUP] Core imports loaded in ${Date.now() - _startTime}ms\n`
);

// ============================================================================
// PRELOADED DEPENDENCIES CACHE - ALL modules preloaded during prewarm
// ============================================================================

export interface PreloadedDeps {
  // External packages
  voice: typeof import('@livekit/agents').voice | null;
  google: typeof import('@livekit/agents-plugin-google') | null;
  silero: typeof import('@livekit/agents-plugin-silero') | null;
  genai: typeof import('@google/genai') | null;
  // Internal modules
  resourceServer: typeof import('./shared/resource-server.js') | null;
  e2eDiagnostics: typeof import('./shared/e2e-diagnostics.js') | null;
  warmGreeting: typeof import('./shared/warm-greeting.js') | null;
  selfHealing: typeof import('../services/self-healing/index.js') | null;
  voiceManager: typeof import('../speech/voice-manager.js') | null;
  personas: typeof import('../personas/index.js') | null;
  startup: typeof import('../startup.js') | null;
  voiceAgentEntry: typeof import('./voice-agent-entry.js') | null;
  voiceAgentSession: typeof import('./voice-agent-session.js') | null;
  // Pre-loaded heavy resources (not just modules)
  vadModel: unknown | null; // Silero VAD - takes ~2s to load
  personaBundlesReady: boolean; // Whether initializeFromBundles() completed
}

export let _preloadedDeps: PreloadedDeps = {
  voice: null, google: null, silero: null, genai: null,
  resourceServer: null, e2eDiagnostics: null, warmGreeting: null,
  selfHealing: null, voiceManager: null, personas: null,
  startup: null, voiceAgentEntry: null, voiceAgentSession: null,
  vadModel: null, personaBundlesReady: false,
};

export function getPreloadedDeps(): PreloadedDeps {
  return _preloadedDeps;
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const prewarmStart = Date.now();
    process.stderr.write(`\n${_logPrefix()} [PREWARM] Starting FULL dependency preload...\n`);

    try {
      // PHASE 1: External packages
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 1: External packages...\n`);
      const [agents, google, silero, genai] = await Promise.all([
        import('@livekit/agents'),
        import('@livekit/agents-plugin-google'),
        import('@livekit/agents-plugin-silero'),
        import('@google/genai'),
      ]);
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 1 done: ${Date.now() - prewarmStart}ms\n`);

      // PHASE 2: ALL internal modules (eliminate ALL dynamic imports during entry)
      const phase2Start = Date.now();
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 2: Internal modules...\n`);
      const [
        resourceServer, e2eDiagnostics, warmGreeting, selfHealing,
        voiceManager, personas, startup, voiceAgentEntry, voiceAgentSession,
      ] = await Promise.all([
        import('./shared/resource-server.js'),
        import('./shared/e2e-diagnostics.js'),
        import('./shared/warm-greeting.js'),
        import('../services/self-healing/index.js'),
        import('../speech/voice-manager.js'),
        import('../personas/index.js'),
        import('../startup.js'),
        import('./voice-agent-entry.js'),
        import('./voice-agent-session.js'),
      ]);
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 2 done: ${Date.now() - phase2Start}ms\n`);

      // PHASE 3: Load heavy resources (VAD model, persona bundles)
      const phase3Start = Date.now();
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 3: Heavy resources (VAD, bundles)...\n`);
      
      let vadModel: unknown = null;
      let personaBundlesReady = false;
      
      // Load VAD model and persona bundles in parallel
      await Promise.all([
        // VAD model takes ~2s to load - do it now so createSession is instant
        silero.VAD.load().then(model => {
          vadModel = model;
          process.stderr.write(`${_logPrefix()} [PREWARM]   ✓ VAD model loaded\n`);
        }).catch(err => {
          process.stderr.write(`${_logPrefix()} [PREWARM]   ⚠️ VAD failed: ${err}\n`);
        }),
        // Initialize persona bundles so getPersonaAsync is fast
        personas.initializeFromBundles().then(() => {
          personaBundlesReady = true;
          process.stderr.write(`${_logPrefix()} [PREWARM]   ✓ Persona bundles initialized\n`);
        }).catch(err => {
          process.stderr.write(`${_logPrefix()} [PREWARM]   ⚠️ Bundles failed: ${err}\n`);
        }),
        // Run startup initialization
        startup.startup().then(() => {
          process.stderr.write(`${_logPrefix()} [PREWARM]   ✓ Startup complete\n`);
        }).catch(err => {
          process.stderr.write(`${_logPrefix()} [PREWARM]   ⚠️ Startup failed: ${err}\n`);
        }),
      ]);
      process.stderr.write(`${_logPrefix()} [PREWARM] Phase 3 done: ${Date.now() - phase3Start}ms\n`);

      // Cache everything
      _preloadedDeps = {
        voice: agents.voice, google, silero, genai,
        resourceServer, e2eDiagnostics, warmGreeting, selfHealing,
        voiceManager, personas, startup, voiceAgentEntry, voiceAgentSession,
        vadModel, personaBundlesReady,
      };
      proc.userData.preloadedDeps = _preloadedDeps;

      process.stderr.write(
        `${_logPrefix()} [PREWARM] ✅ ALL deps + resources preloaded in ${Date.now() - prewarmStart}ms, ` +
        `memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n\n`
      );
    } catch (err) {
      process.stderr.write(`${_logPrefix()} [PREWARM] ⚠️ Failed: ${err}\n\n`);
    }

    proc.userData.prewarmComplete = true;
    proc.userData.prewarmTime = Date.now() - _startTime;
  },

  entry: async (ctx: JobContext) => {
    const entryStart = Date.now();
    const jobId = ctx.job.id;
    const roomName = ctx.job.room?.name || 'unknown';

    process.stderr.write(
      `\n${_logPrefix()} [ENTRY] Job=${jobId} Room=${roomName} ` +
      `sinceStart=${Date.now() - _startTime}ms\n`
    );

    try {
      // Use preloaded session module (instant!) or fallback
      const voiceAgentSession = _preloadedDeps.voiceAgentSession 
        ?? await import('./voice-agent-session.js');
      
      process.stderr.write(
        `${_logPrefix()} [ENTRY] Session module: ${_preloadedDeps.voiceAgentSession ? 'PRELOADED' : 'imported'}\n`
      );

      await voiceAgentSession.runVoiceAgentSession(ctx);

      process.stderr.write(
        `${_logPrefix()} [ENTRY] ✅ Session completed in ${Date.now() - entryStart}ms\n\n`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      process.stderr.write(`\n${_logPrefix()} [ERROR] Session FAILED: ${errMsg}\n\n`);

      try {
        if (!ctx.room.isConnected) await ctx.connect();
        await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
      } catch { /* ignore */ }
    }
  },
});
