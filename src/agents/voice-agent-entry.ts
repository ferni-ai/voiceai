/**
 * Voice Agent Entry Function (Extracted for Child Processes)
 *
 * This module contains the entry function logic extracted from voice-agent.ts.
 * It uses LAZY IMPORTS to avoid loading heavy dependencies until they're actually needed.
 *
 * This allows child processes to:
 * 1. Load this module quickly (no heavy top-level imports)
 * 2. Start running the session immediately
 * 3. Load dependencies on-demand as the session progresses
 *
 * All the "better than human" features are preserved - they're just loaded lazily.
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';

// Lazy-loaded module cache
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

/**
 * Load core voice dependencies lazily
 */
async function loadVoiceDeps(): Promise<void> {
  if (voice) return; // Already loaded

  const startTime = Date.now();
  process.stderr.write(`[voice-agent-entry] Loading voice dependencies...\n`);

  try {
    process.stderr.write(`[voice-agent-entry] Importing @livekit/agents...\n`);
    const agents = await import('@livekit/agents');
    process.stderr.write(`[voice-agent-entry] @livekit/agents loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Importing @livekit/agents-plugin-google...\n`);
    const googleMod = await import('@livekit/agents-plugin-google');
    process.stderr.write(`[voice-agent-entry] @livekit/agents-plugin-google loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Importing @livekit/agents-plugin-silero...\n`);
    const sileroMod = await import('@livekit/agents-plugin-silero');
    process.stderr.write(`[voice-agent-entry] @livekit/agents-plugin-silero loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Importing @google/genai...\n`);
    const genaiMod = await import('@google/genai');
    process.stderr.write(`[voice-agent-entry] @google/genai loaded in ${Date.now() - startTime}ms\n`);

    voice = agents.voice;
    google = googleMod;
    silero = sileroMod;
    genai = genaiMod;

    process.stderr.write(
      `[voice-agent-entry] All voice dependencies loaded in ${Date.now() - startTime}ms\n`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[voice-agent-entry] ERROR loading deps: ${errorMsg}\n`);
    throw error;
  }
}

/**
 * Run a full voice agent session with all "better than human" capabilities.
 * Dependencies are loaded lazily as needed.
 */
export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-entry] Starting FULL session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // STEP 1: Load core voice dependencies
    await loadVoiceDeps();

    // STEP 2: Initialize services (lazy import)
    process.stderr.write(`[voice-agent-entry] Initializing services...\n`);
    const { startup } = await import('../startup.js');
    await startup();
    process.stderr.write(`[voice-agent-entry] Services initialized.\n`);

    // STEP 3: Connect to room
    process.stderr.write(`[voice-agent-entry] Connecting to room...\n`);
    await ctx.connect();
    process.stderr.write(`[voice-agent-entry] Connected to room ${ctx.room.name}\n`);

    // STEP 4: Get persona configuration
    const { getPersonaAsync, initializeFromBundles } = await import('../personas/index.js');
    await initializeFromBundles();

    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';
    const persona = await getPersonaAsync(personaId);
    process.stderr.write(`[voice-agent-entry] Using persona: ${persona?.name || 'unknown'}\n`);

    // STEP 5: Load VAD
    process.stderr.write(`[voice-agent-entry] Loading VAD...\n`);
    const vad = await silero!.VAD.load();
    process.stderr.write(`[voice-agent-entry] VAD loaded.\n`);

    // STEP 6: Create TTS (lazy import)
    process.stderr.write(`[voice-agent-entry] Creating TTS...\n`);
    const { createPersonaAwareTTS } = await import('../speech/voice-manager.js');
    const voiceConfig = persona?.voice || {
      voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
      provider: 'cartesia' as const,
    };
    const tts = createPersonaAwareTTS(persona?.name || 'Ferni', {
      ...voiceConfig,
      accent: 'american',
    });
    process.stderr.write(`[voice-agent-entry] TTS created.\n`);

    // STEP 7: Create simple Agent for session start
    process.stderr.write(`[voice-agent-entry] Creating Agent...\n`);
    const agent = new voice!.Agent({
      instructions: persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.',
    });
    process.stderr.write(`[voice-agent-entry] Agent created.\n`);

    // STEP 8: Create AgentSession
    process.stderr.write(`[voice-agent-entry] Creating AgentSession...\n`);
    const session = new voice!.AgentSession({
      vad,
      llm: new google!.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        modalities: [genai!.Modality.TEXT],
        temperature: 0.8,
        language: 'en-US',
        instructions: persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.',
      }),
      tts,
      voiceOptions: {
        allowInterruptions: true,
        minEndpointingDelay: 400,
        maxEndpointingDelay: 1200,
        minInterruptionWords: 1,
        minInterruptionDuration: 300,
        preemptiveGeneration: true,
      },
    });

    // STEP 9: Start session
    process.stderr.write(`[voice-agent-entry] Starting session...\n`);
    await session.start({
      agent,
      room: ctx.room,
    });
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // STEP 10: Say greeting (lazy import)
    const { getWarmGreeting } = await import('./shared/warm-greeting.js');
    const greeting = getWarmGreeting(personaId) || "Hey there! I'm Ferni. How can I help you today?";
    await session.say(greeting);
    process.stderr.write(`[voice-agent-entry] Greeting sent.\n`);

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', () => {
        process.stderr.write(`[voice-agent-entry] Room disconnected.\n`);
        resolve();
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[voice-agent-entry] ERROR: ${errorMsg}\n`);

    // Try fallback - just connect and wait
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

