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
 * Run a full voice agent session with Phase 3 resource sharing + self-healing.
 */
export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';

  // Import E2E diagnostics and self-healing
  const { e2e } = await import('./shared/e2e-diagnostics.js');
  const { withResilience, analyzeFailure, humanizeError } = await import(
    '../services/self-healing/index.js'
  );

  // Track current phase for error diagnosis
  let currentPhase: 'deps' | 'persona' | 'connect' | 'session' | 'greeting' | 'running' = 'deps';

  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;

  try {
    // Step 1: Load voice dependencies (with retry)
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(loadVoiceDeps, {
      maxRetries: 2,
      baseDelay: 1000,
      operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // Step 2: Get persona (from cache or load locally)
    currentPhase = 'persona';
    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';

    e2e.resourceLoading(`persona:${personaId}`);
    const personaStart = Date.now();
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
    e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);
    process.stderr.write(`[voice-agent-entry] Using persona: ${persona?.name || personaId}\n`);

    // Step 3: Connect to room (with retry for transient network issues)
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();
    await withResilience(() => connectToRoom(ctx), {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      operationName: 'room-connect',
      onRetry: (attempt, error) => {
        e2e.warn('SESSION', `Room connect retry (attempt ${attempt})`, {
          error: error.message,
          roomName,
        });
      },
    });
    e2e.sessionConnected(
      jobId,
      roomName,
      ctx.room.localParticipant?.identity || 'agent',
      Date.now() - connectStart
    );

    // Step 4: Create and start session
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();
    const systemPrompt =
      cachedPrompt || persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.';
    const created = await createSession(persona, systemPrompt);
    session = created.session;

    await session.start({ agent: created.agent, room: ctx.room });
    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // Step 5: Say greeting
    currentPhase = 'greeting';
    const { getWarmGreeting } = await import('./shared/warm-greeting.js');
    await session.say(
      getWarmGreeting(personaId) || "Hey there! I'm Ferni. How can I help you today?"
    );

    // Running normally
    currentPhase = 'running';

    // Wait for disconnect
    await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Run AI diagnosis - map phase to valid stage type
    const stageMap: Record<typeof currentPhase, 'unknown' | 'session' | 'entry'> = {
      deps: 'entry',
      persona: 'entry',
      connect: 'session',
      session: 'session',
      greeting: 'session',
      running: 'session',
    };
    try {
      const diagnosis = await analyzeFailure([errObj.message, errObj.stack || ''], {
        jobId,
        stage: stageMap[currentPhase],
        timing: { totalMs: Date.now() - startTime },
        errorType: errObj.name,
        errorMessage: errObj.message,
      });

      e2e.custom('DIAGNOSIS', `AI analysis for session ${jobId}`, {
        phase: currentPhase,
        rootCause: diagnosis.rootCause,
        confidence: diagnosis.confidence,
        autoFixable: diagnosis.autoFixable,
      });

      // If session is connected, explain to user what happened
      if (session && ctx.room.isConnected && diagnosis.humanExplanation) {
        const humanized = humanizeError(errObj);
        if (humanized.shouldNotifyUser) {
          try {
            await session.say(humanized.userMessage);
          } catch {
            /* can't speak, just log */
          }
        }
      }
    } catch {
      /* diagnosis is best-effort */
    }

    // Fallback: connect and wait
    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
    } catch {
      /* ignore */
    }
  }
}
