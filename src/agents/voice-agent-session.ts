/**
 * Voice Agent Session Runner
 *
 * This module is loaded dynamically by voice-agent-child.ts after the agent
 * has responded to the LiveKit SDK's initialization request.
 *
 * IMPORTANT: This module uses a simplified session setup to avoid loading
 * the full voice-agent.ts with all 51 imports.
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

  try {
    // Import only what we need, when we need it
    process.stderr.write(`[voice-agent-session] Loading modules...\n`);

    // Load modules in parallel - these are fast
    const [
      { voice },
      google,
      silero,
    ] = await Promise.all([
      import('@livekit/agents'),
      import('@livekit/agents-plugin-google'),
      import('@livekit/agents-plugin-silero'),
    ]);

    process.stderr.write(
      `[voice-agent-session] Core modules loaded in ${Date.now() - startTime}ms\n`
    );

    // Get persona configuration (fast - just JSON)
    const { getPersonaAsync, initializeFromBundles } = await import('../personas/index.js');
    await initializeFromBundles();
    
    // Get persona from job metadata
    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';
    const persona = await getPersonaAsync(personaId);
    process.stderr.write(`[voice-agent-session] Using persona: ${persona?.name || 'unknown'}\n`);

    // Create minimal agent using simple voice.Agent
    process.stderr.write(`[voice-agent-session] Creating simple agent...\n`);
    
    const simpleAgent = new voice.Agent({
      instructions: persona?.systemPrompt || 
        "You are Ferni, a warm and supportive AI life coach. Be helpful, empathetic, and encouraging.",
    });

    // Load VAD
    process.stderr.write(`[voice-agent-session] Loading VAD...\n`);
    const vad = await silero.VAD.load();
    process.stderr.write(`[voice-agent-session] VAD loaded.\n`);

    // Create session with Gemini Realtime
    process.stderr.write(`[voice-agent-session] Creating session...\n`);
    const session = new voice.AgentSession({
      vad,
      llm: new google.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        temperature: 0.8,
        language: 'en-US',
        instructions: persona?.systemPrompt || 
          "You are Ferni, a warm and supportive AI life coach.",
      }),
      voiceOptions: {
        allowInterruptions: true,
        minEndpointingDelay: 400,
        maxEndpointingDelay: 1200,
      },
    });

    // Connect to room
    process.stderr.write(`[voice-agent-session] Connecting to room...\n`);
    await ctx.connect();
    process.stderr.write(`[voice-agent-session] Connected to room ${ctx.room.name}\n`);

    // Start the session
    process.stderr.write(`[voice-agent-session] Starting session...\n`);
    await session.start({
      agent: simpleAgent,
      room: ctx.room,
    });
    process.stderr.write(`[voice-agent-session] Session started!\n`);

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', () => {
        process.stderr.write(`[voice-agent-session] Room disconnected.\n`);
        resolve();
      });
    });

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

