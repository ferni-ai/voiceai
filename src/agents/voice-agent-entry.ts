/**
 * Voice Agent Entry Function (Extracted for Child Processes)
 *
 * ALL heavy modules are accessed via preloaded cache from prewarm.
 * This eliminates ALL dynamic imports during entry for instant startup.
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';
import type { PreloadedDeps } from './voice-agent-child.js';

// Lazy-loaded module cache (populated from preloaded or dynamic import)
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

interface PersonaConfig {
  name?: string;
  voice?: { voiceId: string; provider: string };
  systemPrompt?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Load core voice dependencies - uses preloaded from prewarm if available */
async function loadVoiceDeps(preloaded?: Partial<PreloadedDeps>): Promise<void> {
  if (voice) return;
  const startTime = Date.now();

  if (preloaded?.voice && preloaded?.google && preloaded?.silero && preloaded?.genai) {
    process.stderr.write(`[voice-agent-entry] Using PRELOADED voice deps ✅\n`);
    voice = preloaded.voice;
    google = preloaded.google;
    silero = preloaded.silero;
    genai = preloaded.genai;
    return;
  }

  process.stderr.write(`[voice-agent-entry] Loading voice deps (not preloaded)...\n`);
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
  process.stderr.write(`[voice-agent-entry] Voice deps loaded in ${Date.now() - startTime}ms\n`);
}

/** Check for pre-warmed resources and get persona config */
async function getPrewarmedResources(
  personaId: string,
  preloaded?: Partial<PreloadedDeps>
): Promise<{ usePrewarmed: boolean; persona: PersonaConfig | null; systemPrompt: string | null }> {
  try {
    // Use lightweight cache reader if preloaded, otherwise fallback to resource-server
    const cacheReader = preloaded?.cacheReader ?? (await import('./shared/cache-reader.js'));
    const { isMainProcessWarmedUp, getPersonaConfig, getSystemPrompt } = cacheReader;

    if (isMainProcessWarmedUp()) {
      process.stderr.write(`[voice-agent-entry] Using main process cache ✅\n`);
      const config = getPersonaConfig(personaId);
      const prompt = getSystemPrompt(personaId);
      if (config) {
        return { usePrewarmed: true, persona: config as PersonaConfig, systemPrompt: prompt };
      }
    }
  } catch {
    process.stderr.write(`[voice-agent-entry] Cache unavailable, loading locally\n`);
  }
  return { usePrewarmed: false, persona: null, systemPrompt: null };
}

/** Load persona from bundles (fallback path when cache miss) */
async function loadPersonaLocally(
  personaId: string,
  preloaded?: Partial<PreloadedDeps>
): Promise<PersonaConfig | null> {
  // Always dynamically import personas module (not preloaded to keep child lightweight)
  const personas = await import('../personas/index.js');
  // Skip initializeFromBundles if already done during prewarm
  if (!preloaded?.personaBundlesReady) {
    await personas.initializeFromBundles();
  } else {
    process.stderr.write(`[voice-agent-entry] Using PRELOADED persona bundles ✅\n`);
  }
  const loaded = await personas.getPersonaAsync(personaId);
  return loaded
    ? { name: loaded.name, voice: loaded.voice, systemPrompt: loaded.systemPrompt }
    : null;
}

/** Connect to room with timeout */
async function connectToRoom(ctx: JobContext): Promise<void> {
  process.stderr.write(`[voice-agent-entry] Connecting to room...\n`);
  const connectStart = Date.now();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Room connection timed out after 30s')), 30000);
  });
  await Promise.race([ctx.connect(), timeout]);
  process.stderr.write(
    `[voice-agent-entry] Connected to ${ctx.room.name} in ${Date.now() - connectStart}ms\n`
  );
}

/** Create session components (VAD, TTS, Agent, Session) */
async function createSession(
  persona: PersonaConfig | null,
  systemPrompt: string,
  preloaded?: Partial<PreloadedDeps>
): Promise<{
  session: InstanceType<typeof voiceType.AgentSession>;
  agent: InstanceType<typeof voiceType.Agent>;
}> {
  const createStart = Date.now();
  process.stderr.write(`[voice-agent-entry] Creating session components...\n`);

  // Use preloaded VAD model (instant!) or load fresh
  type VADType = Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>>;
  let vad: VADType;
  if (preloaded?.vadModel) {
    vad = preloaded.vadModel as VADType;
    process.stderr.write(`[voice-agent-entry] Using PRELOADED VAD model ✅\n`);
  } else {
    process.stderr.write(`[voice-agent-entry] Loading VAD model (not preloaded)...\n`);
    vad = await silero!.VAD.load();
    process.stderr.write(`[voice-agent-entry] VAD loaded\n`);
  }

  // Create TTS - use lightweight TTS if preloaded, otherwise full voice-manager
  const voiceConfig = persona?.voice || {
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    provider: 'cartesia',
  };

  let tts;
  if (preloaded?.lightweightTTS) {
    // Use lightweight TTS (already imported in prewarm)
    tts = preloaded.lightweightTTS.createLightweightTTS(persona?.name || 'Ferni', {
      ...voiceConfig,
      accent: 'american',
    });
    process.stderr.write(`[voice-agent-entry] Using PRELOADED lightweight TTS ✅\n`);
  } else {
    // Fallback to full voice-manager
    const voiceManager = await import('../speech/voice-manager.js');
    tts = voiceManager.createPersonaAwareTTS(persona?.name || 'Ferni', {
      ...voiceConfig,
      accent: 'american',
    });
  }

  // Create Agent and Session
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
}

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';

  // Get preloaded deps (instant, no imports needed!)
  let preloaded: PreloadedDeps | null = null;
  try {
    const { getPreloadedDeps } = await import('./voice-agent-child.js');
    preloaded = getPreloadedDeps();
  } catch {
    /* not running as child process */
  }

  // Use preloaded modules or fallback to dynamic import
  const e2eDiagnostics = preloaded?.e2eDiagnostics ?? (await import('./shared/e2e-diagnostics.js'));
  const { e2e } = e2eDiagnostics;

  // Use lightweight resilience for basic withResilience (no AI diagnostics during normal flow)
  const lightweightResilience =
    preloaded?.lightweightResilience ?? (await import('./shared/lightweight-resilience.js'));
  const { withResilience, humanizeError } = lightweightResilience;

  let currentPhase: 'deps' | 'persona' | 'connect' | 'session' | 'greeting' | 'running' = 'deps';
  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;

  try {
    // Step 1: Load voice dependencies
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(async () => loadVoiceDeps(preloaded ?? undefined), {
      maxRetries: 2,
      baseDelay: 1000,
      operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // Step 2: Get persona (from cache or load locally)
    currentPhase = 'persona';

    // DEBUG: Log all available metadata sources
    process.stderr.write(`[voice-agent-entry] DEBUG job.metadata: ${ctx.job.metadata}\n`);
    process.stderr.write(`[voice-agent-entry] DEBUG room.metadata: ${ctx.job.room?.metadata}\n`);

    // Try job.metadata first (dispatch metadata), then room.metadata (room creation metadata)
    let metadata: Record<string, unknown> = {};
    if (ctx.job.metadata) {
      try {
        metadata = JSON.parse(ctx.job.metadata);
      } catch (e) {
        process.stderr.write(`[voice-agent-entry] Failed to parse job.metadata: ${e}\n`);
      }
    }

    // FIX: Also check room.metadata as fallback (room metadata from token server)
    if (!metadata.persona_id && ctx.job.room?.metadata) {
      try {
        const roomMeta = JSON.parse(ctx.job.room.metadata);
        if (roomMeta.persona_id) {
          metadata = { ...metadata, ...roomMeta };
          process.stderr.write(
            `[voice-agent-entry] Using room.metadata for persona_id: ${roomMeta.persona_id}\n`
          );
        }
      } catch (e) {
        process.stderr.write(`[voice-agent-entry] Failed to parse room.metadata: ${e}\n`);
      }
    }

    const personaId = (metadata.persona_id as string) || process.env.PERSONA_ID || 'ferni';
    process.stderr.write(`[voice-agent-entry] Resolved personaId: ${personaId}\n`);

    e2e.resourceLoading(`persona:${personaId}`);
    const personaStart = Date.now();
    const {
      usePrewarmed,
      persona: cachedPersona,
      systemPrompt: cachedPrompt,
    } = await getPrewarmedResources(personaId, preloaded ?? undefined);

    let persona = cachedPersona;
    if (!usePrewarmed) {
      // Run startup initialization (always dynamic import - not preloaded)
      const startup = await import('../startup.js');
      await startup.startup();
      persona = await loadPersonaLocally(personaId, preloaded ?? undefined);
    }
    e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);
    process.stderr.write(`[voice-agent-entry] Using persona: ${persona?.name || personaId}\n`);

    // Step 3: Connect to room
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();
    await withResilience(async () => connectToRoom(ctx), {
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
      // CRITICAL: Disconnect before retry to prevent "Participant already exists" race condition.
      // When room.connect() times out, the connection may still be happening in background.
      // Without disconnect, retry creates a duplicate participant identity.
      onBeforeRetry: async () => {
        process.stderr.write(`[voice-agent-entry] Disconnecting room before retry...\n`);
        await ctx.room.disconnect();
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

    // FIX BUG: Generate proper fallback system prompt based on persona ID, NOT hardcoded to Ferni
    // This prevents "Peter's voice but Ferni's persona" bug when persona loading partially fails
    const personaDisplayName =
      persona?.name ||
      personaId
        .split('-')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    const fallbackSystemPrompt = `You are ${personaDisplayName}, a helpful AI assistant. Introduce yourself by your name.`;
    const systemPrompt = cachedPrompt || persona?.systemPrompt || fallbackSystemPrompt;

    // Log warning if we had to use fallback (indicates a loading issue)
    if (!cachedPrompt && !persona?.systemPrompt) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ WARNING: Using fallback system prompt for ${personaId} - persona may not have loaded correctly!\n`
      );
    }

    const created = await createSession(persona, systemPrompt, preloaded ?? undefined);
    session = created.session;

    await session.start({ agent: created.agent, room: ctx.room });
    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // Step 5: Wait for participant to join BEFORE speaking greeting
    // This is CRITICAL - RoomIO.init() waits for participant before calling audioOutput.start()
    // Without this, session.say() will block forever because captureFrame() awaits startedFuture
    currentPhase = 'greeting';
    process.stderr.write(`[voice-agent-entry] 👤 Waiting for participant to join...\n`);
    const participantWaitStart = Date.now();
    const participant = await ctx.waitForParticipant();
    process.stderr.write(
      `[voice-agent-entry] 👤 Participant joined: ${participant.identity} (waited ${Date.now() - participantWaitStart}ms)\n`
    );

    // Step 6: Say greeting - use preloaded warmGreeting
    process.stderr.write(`[voice-agent-entry] 🎤 Starting greeting phase...\n`);
    const warmGreeting = preloaded?.warmGreeting ?? (await import('./shared/warm-greeting.js'));
    // FIX BUG: Generate persona-specific fallback greeting instead of hardcoded Ferni
    const fallbackGreeting = `Hey there! I'm ${personaDisplayName}. How can I help you today?`;
    const greetingText = warmGreeting.getWarmGreeting(personaId) || fallbackGreeting;
    process.stderr.write(`[voice-agent-entry] 🎤 Speaking greeting: "${greetingText.slice(0, 80)}..."\n`);
    const sayStart = Date.now();
    const speechHandle = session.say(greetingText);
    // Wait for actual audio playout to complete (not just queueing)
    await speechHandle.waitForPlayout();
    process.stderr.write(`[voice-agent-entry] 🎤 Greeting spoken in ${Date.now() - sayStart}ms\n`);

    currentPhase = 'running';
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', () => resolve());
    });
    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Run AI diagnosis (lazy-load heavy self-healing module only on error)
    const stageMap: Record<typeof currentPhase, 'unknown' | 'session' | 'entry'> = {
      deps: 'entry',
      persona: 'entry',
      connect: 'session',
      session: 'session',
      greeting: 'session',
      running: 'session',
    };
    try {
      // Only load heavy AI diagnostics when an error actually occurs
      const selfHealing = await import('../services/self-healing/index.js');
      const diagnosis = await selfHealing.analyzeFailure([errObj.message, errObj.stack || ''], {
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

      if (session && ctx.room.isConnected && diagnosis.humanExplanation) {
        const humanized = humanizeError(errObj);
        if (humanized.shouldNotifyUser) {
          try {
            await session.say(humanized.userMessage);
          } catch {
            /* can't speak */
          }
        }
      }
    } catch {
      /* diagnosis is best-effort */
    }

    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => {
        ctx.room.on('disconnected', () => resolve());
      });
    } catch {
      /* ignore */
    }
  }
}
