/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * IMPORTANT: This module loads the FULL voice-agent.ts with all features:
 * - Custom VoiceAgent class with humanization
 * - Trust systems integration
 * - Persona-aware Cartesia TTS
 * - Tools and handoffs
 * - Conversation manager
 * - Everything that makes Ferni "better than human"
 *
 * The child process has already responded to the SDK's initializeRequest,
 * so we have time to load the full module here.
 */

import type { JobContext } from '@livekit/agents';

/**
 * Run a voice agent session using the FULL voice agent capabilities.
 * This is called by voice-agent-child.ts after dynamic loading.
 */
export async function runVoiceAgentSession(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-session] Starting FULL session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // Load the full voice agent module
    // This includes all 51 imports but we're past the child process timeout now
    process.stderr.write(`[voice-agent-session] Importing full voice-agent.js...\n`);

    const voiceAgentModule = await import('./voice-agent.js');

    process.stderr.write(
      `[voice-agent-session] Full voice agent loaded in ${Date.now() - startTime}ms\n`
    );

    // Get the agent definition (defineAgent result)
    const agent = voiceAgentModule.default;

    if (agent && typeof agent.entry === 'function') {
      process.stderr.write(`[voice-agent-session] Calling full agent.entry()...\n`);
      
      // Call the REAL entry function with all features
      await agent.entry(ctx);
      
      process.stderr.write(`[voice-agent-session] Full session completed.\n`);
    } else {
      throw new Error(
        `Agent entry function not found. Type: ${typeof agent}, Has entry: ${typeof agent?.entry}`
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[voice-agent-session] ERROR: ${errorMsg}\n`);

    // If full agent fails, connect but don't provide session
    // User will see agent connected but not responsive - better than crash
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
