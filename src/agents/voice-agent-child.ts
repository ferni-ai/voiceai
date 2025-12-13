/**
 * Lightweight Voice Agent Entry Point for Child Processes
 *
 * This file is designed to load INSTANTLY (<1 second) for LiveKit SDK child processes.
 * It only imports the absolute minimum needed for the agent definition.
 *
 * The heavy imports are loaded dynamically in the entry() function when a job starts.
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
    `\n${_logPrefix()} [ERROR] ══════════════════════════════════════════════\n` +
    `${_logPrefix()} [ERROR] UNCAUGHT EXCEPTION\n` +
    `${_logPrefix()} [ERROR] ${err.message}\n` +
    `${_logPrefix()} [ERROR] Stack: ${err.stack}\n` +
    `${_logPrefix()} [ERROR] ══════════════════════════════════════════════\n\n`
  );
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `\n${_logPrefix()} [WARN] ══════════════════════════════════════════════\n` +
    `${_logPrefix()} [WARN] UNHANDLED REJECTION\n` +
    `${_logPrefix()} [WARN] ${reason}\n` +
    `${_logPrefix()} [WARN] ══════════════════════════════════════════════\n\n`
  );
});

// ONLY import what's absolutely necessary for the agent definition
import { defineAgent, type JobContext, type JobProcess } from '@livekit/agents';

process.stderr.write(
  `${_logPrefix()} [STARTUP] Core imports loaded in ${Date.now() - _startTime}ms\n`
);

// ============================================================================
// AGENT DEFINITION - This is what the child process needs
// ============================================================================

// Cache for preloaded modules - exported so voice-agent-entry can use them
export let _preloadedDeps: {
  voice: typeof import('@livekit/agents').voice | null;
  google: typeof import('@livekit/agents-plugin-google') | null;
  silero: typeof import('@livekit/agents-plugin-silero') | null;
  genai: typeof import('@google/genai') | null;
} = { voice: null, google: null, silero: null, genai: null };

/** Get preloaded dependencies (if available) */
export function getPreloadedDeps() {
  return _preloadedDeps;
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const prewarmStart = Date.now();
    process.stderr.write(
      `\n${_logPrefix()} [PREWARM] ══════════════════════════════════════════════\n` +
      `${_logPrefix()} [PREWARM] Starting dependency preload...\n`
    );

    try {
      // Preload ALL heavy dependencies in parallel during prewarm
      // This way they're cached before entry() is called
      const [agents, google, silero, genai] = await Promise.all([
        import('@livekit/agents').then(m => {
          process.stderr.write(`${_logPrefix()} [PREWARM] @livekit/agents loaded\n`);
          return m;
        }),
        import('@livekit/agents-plugin-google').then(m => {
          process.stderr.write(`${_logPrefix()} [PREWARM] @livekit/agents-plugin-google loaded\n`);
          return m;
        }),
        import('@livekit/agents-plugin-silero').then(m => {
          process.stderr.write(`${_logPrefix()} [PREWARM] @livekit/agents-plugin-silero loaded\n`);
          return m;
        }),
        import('@google/genai').then(m => {
          process.stderr.write(`${_logPrefix()} [PREWARM] @google/genai loaded\n`);
          return m;
        }),
      ]);

      // Cache them
      _preloadedDeps = {
        voice: agents.voice,
        google,
        silero,
        genai,
      };
      proc.userData.preloadedDeps = _preloadedDeps;

      const prewarmTime = Date.now() - prewarmStart;
      process.stderr.write(
        `${_logPrefix()} [PREWARM] ✅ All dependencies preloaded in ${prewarmTime}ms\n` +
        `${_logPrefix()} [PREWARM] Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
        `${_logPrefix()} [PREWARM] ══════════════════════════════════════════════\n\n`
      );
    } catch (err) {
      process.stderr.write(
        `${_logPrefix()} [PREWARM] ⚠️ Preload failed (will load in entry): ${err}\n` +
        `${_logPrefix()} [PREWARM] ══════════════════════════════════════════════\n\n`
      );
    }

    proc.userData.prewarmComplete = true;
    proc.userData.prewarmTime = Date.now() - _startTime;
  },

  entry: async (ctx: JobContext) => {
    const entryStart = Date.now();
    const jobId = ctx.job.id;
    const roomName = ctx.job.room?.name || 'unknown';

    process.stderr.write(
      `\n${_logPrefix()} [ENTRY] ══════════════════════════════════════════════\n` +
      `${_logPrefix()} [ENTRY] Session entry started\n` +
      `${_logPrefix()} [ENTRY] Job ID: ${jobId}\n` +
      `${_logPrefix()} [ENTRY] Room: ${roomName}\n` +
      `${_logPrefix()} [ENTRY] Time since module start: ${Date.now() - _startTime}ms\n` +
      `${_logPrefix()} [ENTRY] ══════════════════════════════════════════════\n\n`
    );

    try {
      // NOW load the heavy stuff - we have time during entry()
      const loadStart = Date.now();
      process.stderr.write(`${_logPrefix()} [ENTRY] Loading full agent module...\n`);

      // Dynamic import of the full voice agent
      const { runVoiceAgentSession } = await import('./voice-agent-session.js');

      const loadTime = Date.now() - loadStart;
      process.stderr.write(
        `${_logPrefix()} [ENTRY] ✅ Full agent module loaded in ${loadTime}ms\n`
      );

      // Run the actual session
      process.stderr.write(`${_logPrefix()} [ENTRY] Starting voice session...\n`);
      await runVoiceAgentSession(ctx);

      const totalTime = Date.now() - entryStart;
      process.stderr.write(
        `\n${_logPrefix()} [ENTRY] ══════════════════════════════════════════════\n` +
        `${_logPrefix()} [ENTRY] ✅ Session completed normally\n` +
        `${_logPrefix()} [ENTRY] Total duration: ${totalTime}ms\n` +
        `${_logPrefix()} [ENTRY] ══════════════════════════════════════════════\n\n`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      process.stderr.write(
        `\n${_logPrefix()} [ERROR] ══════════════════════════════════════════════\n` +
        `${_logPrefix()} [ERROR] Session entry FAILED\n` +
        `${_logPrefix()} [ERROR] Job ID: ${jobId}\n` +
        `${_logPrefix()} [ERROR] ${errMsg}\n` +
        `${_logPrefix()} [ERROR] ══════════════════════════════════════════════\n\n`
      );

      // Try to connect and wait so LiveKit doesn't see an immediate failure
      try {
        if (!ctx.room.isConnected) await ctx.connect();
        await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

