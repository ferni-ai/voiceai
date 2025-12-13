/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * ALL modules are preloaded during prewarm - no dynamic imports during session.
 */

import type { JobContext } from '@livekit/agents';

/**
 * Run a voice agent session using preloaded dependencies.
 */
export async function runVoiceAgentSession(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.job.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-session] Starting session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // Get preloaded entry module (instant!) or fallback to import
    let runFullVoiceAgentEntry: typeof import('./voice-agent-entry.js').runFullVoiceAgentEntry;
    try {
      const { getPreloadedDeps } = await import('./voice-agent-child.js');
      const preloaded = getPreloadedDeps();
      if (preloaded?.voiceAgentEntry) {
        runFullVoiceAgentEntry = preloaded.voiceAgentEntry.runFullVoiceAgentEntry;
        process.stderr.write(`[voice-agent-session] Using PRELOADED entry module ✅\n`);
      } else {
        const mod = await import('./voice-agent-entry.js');
        runFullVoiceAgentEntry = mod.runFullVoiceAgentEntry;
      }
    } catch {
      const mod = await import('./voice-agent-entry.js');
      runFullVoiceAgentEntry = mod.runFullVoiceAgentEntry;
    }
    
    process.stderr.write(
      `[voice-agent-session] Entry ready in ${Date.now() - startTime}ms\n`
    );
    
    await runFullVoiceAgentEntry(ctx);
    
    process.stderr.write(`[voice-agent-session] Session completed.\n`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[voice-agent-session] ERROR: ${errorMsg}\n`);

    // If session fails, connect but don't provide session
    try {
      if (!ctx.room.isConnected) {
        await ctx.connect();
      }
      await new Promise<void>((resolve) => {
        ctx.room.on('disconnected', () => resolve());
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}
