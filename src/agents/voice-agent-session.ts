/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * By deferring the heavy imports to this point, we ensure the child process
 * can respond within the SDK's timeout window.
 */

import type { JobContext } from '@livekit/agents';

/**
 * Run a voice agent session.
 * This is called by voice-agent-child.ts after dynamic loading.
 */
export async function runVoiceAgentSession(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-session] Starting session for room ${roomName} pid=${process.pid}\n`
  );

  // Now we can safely load the full voice agent module
  // By this point, the child process has already responded to initializeRequest
  // so there's no timeout pressure
  process.stderr.write(`[voice-agent-session] Importing voice-agent.js...\n`);

  try {
    // Import the full voice agent - this loads all 51 imports
    process.stderr.write(`[voice-agent-session] Starting import...\n`);
    const voiceAgentModule = await import('./voice-agent.js');
    process.stderr.write(`[voice-agent-session] Import complete.\n`);

    process.stderr.write(
      `[voice-agent-session] Voice agent module loaded in ${Date.now() - startTime}ms\n`
    );

    // The voice-agent.ts exports a default agent with entry function
    const agent = voiceAgentModule.default;
    process.stderr.write(
      `[voice-agent-session] Agent type: ${typeof agent}, has entry: ${typeof agent?.entry}\n`
    );

    if (agent && typeof agent.entry === 'function') {
      process.stderr.write(`[voice-agent-session] Calling agent.entry(ctx)...\n`);
      await agent.entry(ctx);
      process.stderr.write(`[voice-agent-session] agent.entry() completed.\n`);
    } else {
      process.stderr.write(
        `[voice-agent-session] WARNING: No entry function found (agent=${!!agent}), running fallback\n`
      );
      await runFallbackSession(ctx);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(
      `[voice-agent-session] ERROR: ${errorMsg}\n`
    );
    // Try fallback
    await runFallbackSession(ctx);
  }
}

/**
 * Fallback session if the full agent fails to load.
 * Simply logs an error - the connection will eventually timeout.
 */
async function runFallbackSession(ctx: JobContext): Promise<void> {
  process.stderr.write(
    `[voice-agent-session] CRITICAL: Full agent failed to load. ` +
      `Room: ${ctx.room.name}, cannot provide session.\n`
  );

  // Connect and wait - user will see agent connected but not responding
  // Better than crashing completely
  await ctx.connect();

  // Wait for disconnect
  await new Promise<void>((resolve) => {
    ctx.room.on('disconnected', () => resolve());
  });
}

