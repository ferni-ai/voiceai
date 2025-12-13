/**
 * Voice Agent Entry Function (Extracted for Child Processes)
 *
 * PHASE 2: Tiered Initialization with Resource Sharing
 *
 * This module contains the entry function logic extracted from voice-agent.ts.
 * It uses LAZY IMPORTS to avoid loading heavy dependencies until they're actually needed.
 *
 * Architecture (Google/Anthropic pattern):
 * 1. Main process pre-warms expensive resources (VAD, TTS, Personas)
 * 2. Child processes check for pre-warmed resources first
 * 3. Fall back to loading on-demand if not pre-warmed
 *
 * This allows child processes to:
 * 1. Load this module quickly (no heavy top-level imports)
 * 2. Use pre-warmed resources when available (fast path)
 * 3. Load dependencies on-demand as fallback (slow path)
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';

// Lazy-loaded module cache
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

// Pre-warmed resource cache (populated from main process via IPC)
const prewarmedVAD: unknown = null;
const prewarmedTTS = new Map<string, unknown>();
const prewarmedPersonas = new Map<string, unknown>();

/**
 * Check if main process has pre-warmed resources available
 */
async function checkPrewarmedResources(): Promise<boolean> {
  // In child process, we can check if parent sent us pre-warmed info
  // For now, we'll use a simple check via process.env or IPC
  try {
    const { requestResource, initIPCClient } = await import('./shared/resource-server.js');

    // Initialize IPC client to communicate with main process
    initIPCClient();

    // Request resource status from main process
    const status = await requestResource('vad', 'status', {});
    if (status.success && status.data) {
      const data = status.data as { warmedUp: boolean };
      process.stderr.write(
        `[voice-agent-entry] Main process resources: ${data.warmedUp ? 'WARMED' : 'NOT READY'}\n`
      );
      return data.warmedUp;
    }
  } catch {
    // IPC not available - fall back to loading locally
    process.stderr.write(
      `[voice-agent-entry] No IPC connection to main process - loading locally\n`
    );
  }
  return false;
}

/**
 * Load core voice dependencies lazily
 */
async function loadVoiceDeps(): Promise<void> {
  if (voice) return; // Already loaded

  const startTime = Date.now();
  process.stderr.write(`[voice-agent-entry] Loading voice dependencies...\n`);

  try {
    // Load in parallel for speed
    const [agents, googleMod, sileroMod, genaiMod] = await Promise.all([
      import('@livekit/agents'),
      import('@livekit/agents-plugin-google'),
      import('@livekit/agents-plugin-silero'),
      import('@google/genai'),
    ]);

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
 *
 * PHASE 3: Uses pre-warmed resources from main process via IPC when available.
 * Falls back to loading locally if main process not ready.
 */
export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const roomName = ctx.room?.name || 'unknown';
  process.stderr.write(
    `[voice-agent-entry] Starting FULL session for room ${roomName} pid=${process.pid}\n`
  );

  try {
    // STEP 1: Load core voice dependencies (parallel)
    await loadVoiceDeps();

    // STEP 2: Check if main process has pre-warmed resources (Phase 3)
    let usePrewarmed = false;
    let prewarmedPersona: unknown = null;
    let prewarmedPrompt: string | null = null;

    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';

    try {
      const { isMainProcessWarmedUp, getPrewarmedPersonaConfig, getPrewarmedSystemPrompt } =
        await import('./shared/resource-server.js');

      const warmedUp = await isMainProcessWarmedUp();
      if (warmedUp) {
        process.stderr.write(
          `[voice-agent-entry] Main process warmed up - using IPC for resources\n`
        );

        // Get pre-warmed persona config via IPC (fast path)
        prewarmedPersona = await getPrewarmedPersonaConfig(personaId);
        prewarmedPrompt = await getPrewarmedSystemPrompt(personaId);
        usePrewarmed = !!prewarmedPersona;

        if (usePrewarmed) {
          process.stderr.write(
            `[voice-agent-entry] Got pre-warmed resources in ${Date.now() - startTime}ms\n`
          );
        }
      }
    } catch (ipcError) {
      process.stderr.write(`[voice-agent-entry] IPC unavailable, loading locally: ${ipcError}\n`);
    }

    // STEP 3: Initialize services (lazy import) - only if not using pre-warmed
    if (!usePrewarmed) {
      process.stderr.write(`[voice-agent-entry] Initializing services locally...\n`);
      const { startup } = await import('../startup.js');
      await startup();
      process.stderr.write(`[voice-agent-entry] Services initialized.\n`);
    }

    // STEP 4: Connect to room (with timeout)
    process.stderr.write(`[voice-agent-entry] Connecting to room...\n`);
    const connectStart = Date.now();
    const connectTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Room connection timed out after 30s')), 30000)
    );
    try {
      await Promise.race([ctx.connect(), connectTimeout]);
      process.stderr.write(
        `[voice-agent-entry] Connected to room ${ctx.room.name} in ${Date.now() - connectStart}ms\n`
      );
    } catch (connectError) {
      process.stderr.write(
        `[voice-agent-entry] Connect failed: ${connectError instanceof Error ? connectError.message : String(connectError)}\n`
      );
      throw connectError;
    }

    // STEP 5: Get persona configuration (use pre-warmed if available)
    let persona: {
      name?: string;
      voice?: { voiceId: string; provider: string };
      systemPrompt?: string;
    } | null = null;

    if (usePrewarmed && prewarmedPersona) {
      // Cast prewarmed persona to compatible type
      const prewarmed = prewarmedPersona as Record<string, unknown>;
      persona = {
        name: typeof prewarmed.name === 'string' ? prewarmed.name : undefined,
        voice: prewarmed.voice as { voiceId: string; provider: string } | undefined,
        systemPrompt:
          typeof prewarmed.systemPrompt === 'string' ? prewarmed.systemPrompt : undefined,
      };
      process.stderr.write(
        `[voice-agent-entry] Using PRE-WARMED persona: ${persona?.name || personaId}\n`
      );
    } else {
      const { getPersonaAsync, initializeFromBundles } = await import('../personas/index.js');
      await initializeFromBundles();
      const loaded = await getPersonaAsync(personaId);
      if (loaded) {
        persona = {
          name: loaded.name,
          voice: loaded.voice,
          systemPrompt: loaded.systemPrompt,
        };
      }
      process.stderr.write(
        `[voice-agent-entry] Loaded persona locally: ${persona?.name || 'unknown'}\n`
      );
    }

    // STEP 6: Load VAD (model file likely in OS cache from main process)
    process.stderr.write(`[voice-agent-entry] Loading VAD...\n`);
    const vadStart = Date.now();
    const vad = await silero!.VAD.load();
    process.stderr.write(
      `[voice-agent-entry] VAD loaded in ${Date.now() - vadStart}ms (OS cache: ${Date.now() - vadStart < 500 ? 'HIT' : 'MISS'})\n`
    );

    // STEP 7: Create TTS
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

    // Use pre-warmed system prompt if available
    const systemPrompt =
      prewarmedPrompt || persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.';

    // STEP 8: Create simple Agent for session start
    process.stderr.write(`[voice-agent-entry] Creating Agent...\n`);
    const agent = new voice!.Agent({
      instructions: systemPrompt,
    });
    process.stderr.write(`[voice-agent-entry] Agent created.\n`);

    // STEP 9: Create AgentSession
    process.stderr.write(`[voice-agent-entry] Creating AgentSession...\n`);
    const session = new voice!.AgentSession({
      vad,
      llm: new google!.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        modalities: [genai!.Modality.TEXT],
        temperature: 0.8,
        language: 'en-US',
        instructions: systemPrompt,
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

    // STEP 10: Start session
    process.stderr.write(`[voice-agent-entry] Starting session...\n`);
    await session.start({
      agent,
      room: ctx.room,
    });
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // STEP 11: Say greeting (lazy import)
    const { getWarmGreeting } = await import('./shared/warm-greeting.js');
    const greeting =
      getWarmGreeting(personaId) || "Hey there! I'm Ferni. How can I help you today?";
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
