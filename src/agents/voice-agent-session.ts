/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * Note: voice-agent-entry is NOT preloaded to keep child processes lightweight.
 * It's imported on-demand when a session starts.
 */

import type { JobContext } from '@livekit/agents';

/**
 * Run a voice agent session.
 * Dynamically imports voice-agent-entry to keep child process lean during prewarm.
 */
export async function runVoiceAgentSession(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.job.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-session] Starting session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // Import entry module on-demand (not preloaded to keep child lightweight)
    const { runFullVoiceAgentEntry } = await import('./voice-agent-entry.js');
    
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
