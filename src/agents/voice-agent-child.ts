/**
 * Lightweight Voice Agent Entry Point for Child Processes
 *
 * This file is designed to load INSTANTLY (<1 second) for LiveKit SDK child processes.
 * It only imports the absolute minimum needed for the agent definition.
 *
 * The heavy imports are loaded dynamically in the entry() function when a job starts.
 */

// Log immediately before any imports
const _startTime = Date.now();
process.stderr.write(
  `[voice-agent-child] MODULE START pid=${process.pid} isChild=${!!process.send} time=${new Date().toISOString()}\n`
);

// CRITICAL: Catch uncaught errors in child process to debug silent failures
process.on('uncaughtException', (err) => {
  process.stderr.write(`[voice-agent-child] UNCAUGHT EXCEPTION pid=${process.pid}: ${err.stack || err.message}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[voice-agent-child] UNHANDLED REJECTION pid=${process.pid}: ${reason}\n`);
});

// ONLY import what's absolutely necessary for the agent definition
import { defineAgent, type JobContext, type JobProcess } from '@livekit/agents';

process.stderr.write(
  `[voice-agent-child] Core import done in ${Date.now() - _startTime}ms pid=${process.pid}\n`
);

// ============================================================================
// AGENT DEFINITION - This is what the child process needs
// ============================================================================

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Ultra-fast prewarm - just mark as ready
    process.stderr.write(
      `[voice-agent-child] PREWARM pid=${process.pid} elapsed=${Date.now() - _startTime}ms\n`
    );
    proc.userData.prewarmComplete = true;
  },

  entry: async (ctx: JobContext) => {
    process.stderr.write(
      `[voice-agent-child] ENTRY START pid=${process.pid} elapsed=${Date.now() - _startTime}ms room=${ctx.room?.name || 'unknown'}\n`
    );

    try {
      // NOW load the heavy stuff - we have time during entry()
      const start = Date.now();
      process.stderr.write(`[voice-agent-child] Loading full agent module...\n`);

      // Dynamic import of the full voice agent
      const { runVoiceAgentSession } = await import('./voice-agent-session.js');

      process.stderr.write(
        `[voice-agent-child] Full agent loaded in ${Date.now() - start}ms pid=${process.pid}\n`
      );

      // Run the actual session
      await runVoiceAgentSession(ctx);
      process.stderr.write(`[voice-agent-child] Session ended normally pid=${process.pid}\n`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      process.stderr.write(`[voice-agent-child] ENTRY ERROR pid=${process.pid}: ${errMsg}\n`);
      
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

