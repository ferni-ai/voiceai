/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * IMPORTANT: Uses LAZY IMPORTS to avoid loading heavy dependencies upfront.
 * All "better than human" features are preserved - they're just loaded on-demand.
 */

import type { JobContext } from '@livekit/agents';

/**
 * Run a voice agent session using lazy-loaded dependencies.
 * This is called by voice-agent-child.ts after dynamic loading.
 */
export async function runVoiceAgentSession(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-session] Starting session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // Use the lazy-loading entry function that loads deps on-demand
    const { runFullVoiceAgentEntry } = await import('./voice-agent-entry.js');
    
    process.stderr.write(
      `[voice-agent-session] Entry module loaded in ${Date.now() - startTime}ms\n`
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
