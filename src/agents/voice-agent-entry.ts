/**
 * Voice Agent Entry Function (Extracted for Child Processes)
 *
 * PHASE 2: Tiered Initialization with Resource Sharing
 *
 * Architecture (Google/Anthropic pattern):
 * 1. Main process pre-warms expensive resources (VAD, TTS, Personas)
 * 2. Child processes check for pre-warmed resources first
 * 3. Fall back to loading on-demand if not pre-warmed
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';

// Lazy-loaded module cache
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

// Types
interface PersonaConfig {
  name?: string;
  voice?: { voiceId: string; provider: string };
  systemPrompt?: string;
}

// ============================================================================
// HELPER FUNCTIONS (extracted to keep main function under 80 lines)
// ============================================================================

/** Load core voice dependencies lazily with detailed logging */
async function loadVoiceDeps(): Promise<void> {
  if (voice) return;
  const startTime = Date.now();
  process.stderr.write(`[voice-agent-entry] Loading voice dependencies...\n`);

  try {
    // Load each dependency individually with logging to identify which one fails
    process.stderr.write(`[voice-agent-entry] Loading @livekit/agents...\n`);
    const agents = await import('@livekit/agents');
    process.stderr.write(`[voice-agent-entry] @livekit/agents loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Loading @livekit/agents-plugin-google...\n`);
    const googleMod = await import('@livekit/agents-plugin-google');
    process.stderr.write(`[voice-agent-entry] @livekit/agents-plugin-google loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Loading @livekit/agents-plugin-silero...\n`);
    const sileroMod = await import('@livekit/agents-plugin-silero');
    process.stderr.write(`[voice-agent-entry] @livekit/agents-plugin-silero loaded in ${Date.now() - startTime}ms\n`);

    process.stderr.write(`[voice-agent-entry] Loading @google/genai...\n`);
    const genaiMod = await import('@google/genai');
    process.stderr.write(`[voice-agent-entry] @google/genai loaded in ${Date.now() - startTime}ms\n`);

    voice = agents.voice;
    google = googleMod;
    silero = sileroMod;
    genai = genaiMod;
    process.stderr.write(`[voice-agent-entry] All voice deps loaded in ${Date.now() - startTime}ms\n`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err);
    process.stderr.write(`[voice-agent-entry] FATAL: Failed to load voice deps: ${errMsg}\n`);
    throw err;
  }
}

/** Check for pre-warmed resources and get persona config */
async function getPrewarmedResources(personaId: string): Promise<{
  usePrewarmed: boolean;
  persona: PersonaConfig | null;
  systemPrompt: string | null;
}> {
  try {
    const { isMainProcessWarmedUp, getPrewarmedPersonaConfig, getPrewarmedSystemPrompt } =
      await import('./shared/resource-server.js');

    if (await isMainProcessWarmedUp()) {
      process.stderr.write(`[voice-agent-entry] Main process warmed - using cache\n`);
      const config = await getPrewarmedPersonaConfig(personaId);
      const prompt = await getPrewarmedSystemPrompt(personaId);
      if (config) {
        return {
          usePrewarmed: true,
          persona: config as PersonaConfig,
          systemPrompt: prompt,
        };
      }
    }
  } catch {
    process.stderr.write(`[voice-agent-entry] Cache unavailable, loading locally\n`);
  }
  return { usePrewarmed: false, persona: null, systemPrompt: null };
}

/** Load persona from bundles (fallback path) */
async function loadPersonaLocally(personaId: string): Promise<PersonaConfig | null> {
  const { getPersonaAsync, initializeFromBundles } = await import('../personas/index.js');
  await initializeFromBundles();
  const loaded = await getPersonaAsync(personaId);
  return loaded
    ? { name: loaded.name, voice: loaded.voice, systemPrompt: loaded.systemPrompt }
    : null;
}

/** Connect to room with timeout */
async function connectToRoom(ctx: JobContext): Promise<void> {
  process.stderr.write(`[voice-agent-entry] Connecting to room...\n`);
  const connectStart = Date.now();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Room connection timed out after 30s')), 30000)
  );
  try {
    await Promise.race([ctx.connect(), timeout]);
    process.stderr.write(
      `[voice-agent-entry] Connected to ${ctx.room.name} in ${Date.now() - connectStart}ms\n`
    );
  } catch (err) {
    process.stderr.write(`[voice-agent-entry] Connect FAILED: ${err}\n`);
    throw err;
  }
}

/** Create session components (VAD, TTS, Agent, Session) */
async function createSession(
  persona: PersonaConfig | null,
  systemPrompt: string
): Promise<{
  session: InstanceType<typeof voiceType.AgentSession>;
  agent: InstanceType<typeof voiceType.Agent>;
}> {
  const createStart = Date.now();
  process.stderr.write(`[voice-agent-entry] Creating session components...\n`);

  // Load VAD with error handling
  process.stderr.write(`[voice-agent-entry] Loading VAD model...\n`);
  let vad;
  try {
    const vadStart = Date.now();
    vad = await silero!.VAD.load();
    process.stderr.write(`[voice-agent-entry] VAD loaded in ${Date.now() - vadStart}ms\n`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err);
    process.stderr.write(`[voice-agent-entry] FATAL: VAD load failed: ${errMsg}\n`);
    throw err;
  }

  // Create TTS with error handling
  process.stderr.write(`[voice-agent-entry] Creating TTS...\n`);
  let tts;
  try {
    const { createPersonaAwareTTS } = await import('../speech/voice-manager.js');
    const voiceConfig = persona?.voice || {
      voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
      provider: 'cartesia',
    };
    tts = createPersonaAwareTTS(persona?.name || 'Ferni', {
      ...voiceConfig,
      accent: 'american',
    });
    process.stderr.write(`[voice-agent-entry] TTS created in ${Date.now() - createStart}ms\n`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err);
    process.stderr.write(`[voice-agent-entry] FATAL: TTS creation failed: ${errMsg}\n`);
    throw err;
  }

  // Create Agent and Session with error handling
  process.stderr.write(`[voice-agent-entry] Creating LLM and session...\n`);
  try {
    const agent = new voice!.Agent({ instructions: systemPrompt });
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
    process.stderr.write(`[voice-agent-entry] Session created in ${Date.now() - createStart}ms\n`);
    return { session, agent };
  } catch (err) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err);
    process.stderr.write(`[voice-agent-entry] FATAL: Session creation failed: ${errMsg}\n`);
    throw err;
  }
}

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

/**
 * Run a full voice agent session with Phase 3 resource sharing.
 */
export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  try {
    // Step 1: Load voice dependencies
    await loadVoiceDeps();

    // Step 2: Get persona (from cache or load locally)
    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';

    const {
      usePrewarmed,
      persona: cachedPersona,
      systemPrompt: cachedPrompt,
    } = await getPrewarmedResources(personaId);

    let persona = cachedPersona;
    if (!usePrewarmed) {
      const { startup } = await import('../startup.js');
      await startup();
      persona = await loadPersonaLocally(personaId);
    }
    process.stderr.write(`[voice-agent-entry] Using persona: ${persona?.name || personaId}\n`);

    // Step 3: Connect to room
    await connectToRoom(ctx);

    // Step 4: Create and start session
    const systemPrompt =
      cachedPrompt || persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.';
    const { session, agent } = await createSession(persona, systemPrompt);

    await session.start({ agent, room: ctx.room });
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // Step 5: Say greeting
    const { getWarmGreeting } = await import('./shared/warm-greeting.js');
    await session.say(
      getWarmGreeting(personaId) || "Hey there! I'm Ferni. How can I help you today?"
    );

    // Wait for disconnect
    await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
  } catch (error) {
    process.stderr.write(`[voice-agent-entry] ERROR: ${error}\n`);
    // Fallback: connect and wait
    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
    } catch {
      /* ignore */
    }
  }
}
