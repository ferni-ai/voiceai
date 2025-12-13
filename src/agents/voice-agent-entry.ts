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
    const resourceServer = preloaded?.resourceServer ?? await import('./shared/resource-server.js');
    const { isMainProcessWarmedUp, getPrewarmedPersonaConfig, getPrewarmedSystemPrompt } = resourceServer;

    if (await isMainProcessWarmedUp()) {
      process.stderr.write(`[voice-agent-entry] Using main process cache ✅\n`);
      const config = await getPrewarmedPersonaConfig(personaId);
      const prompt = await getPrewarmedSystemPrompt(personaId);
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
  // CRITICAL: Avoid importing personas/index.js - it has a massive import chain!
  // Instead, try to read from the bundle JSON file directly.
  process.stderr.write(`[voice-agent-entry] Loading persona ${personaId} from bundles...\n`);
  
  try {
    // Try direct bundle file read first (fast, no heavy imports)
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Check common bundle paths
    const bundlePaths = [
      `/app/dist/personas/bundles/${personaId}/persona.manifest.json`,
      `./dist/personas/bundles/${personaId}/persona.manifest.json`,
    ];
    
    for (const bundlePath of bundlePaths) {
      try {
        const data = await fs.readFile(bundlePath, 'utf-8');
        const manifest = JSON.parse(data);
        process.stderr.write(`[voice-agent-entry] Found bundle at ${bundlePath}\n`);
        return {
          name: manifest.name || personaId,
          voice: manifest.voice || { voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091', provider: 'cartesia' },
          systemPrompt: manifest.systemPrompt || '',
        };
      } catch {
        // Try next path
      }
    }
    
    // If bundle not found, fall back to personas module (slower but comprehensive)
    process.stderr.write(`[voice-agent-entry] Bundle not found, using personas module...\n`);
    const personas = preloaded?.personas ?? await import('../personas/index.js');
    if (!preloaded?.personaBundlesReady) {
      await personas.initializeFromBundles();
    }
    const loaded = await personas.getPersonaAsync(personaId);
    return loaded
      ? { name: loaded.name, voice: loaded.voice, systemPrompt: loaded.systemPrompt }
      : null;
  } catch (error) {
    process.stderr.write(`[voice-agent-entry] Failed to load persona: ${error}\n`);
    // Return default Ferni config
    return {
      name: 'Ferni',
      voice: { voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091', provider: 'cartesia' },
      systemPrompt: 'You are Ferni, a warm and empathetic AI life coach.',
    };
  }
}

/** Connect to room with timeout */
async function connectToRoom(ctx: JobContext): Promise<void> {
  process.stderr.write(`[voice-agent-entry] Connecting to room...\n`);
  const connectStart = Date.now();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Room connection timed out after 30s')), 30000)
  );
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

  // Create TTS - use lightweight TTS to avoid massive import chain!
  // The voice-manager.js module has a huge dependency graph that causes 112+ second hangs.
  // Instead, use lightweight-tts.js which only imports @livekit/agents-plugin-cartesia.
  const voiceConfig = persona?.voice || {
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    provider: 'cartesia',
  };
  
  let tts: InstanceType<typeof import('@livekit/agents-plugin-cartesia').TTS>;
  const lightweightTTSMod = preloaded?.lightweightTTS;
  if (lightweightTTSMod) {
    tts = lightweightTTSMod.createLightweightTTS(persona?.name || 'Ferni', voiceConfig);
    process.stderr.write(`[voice-agent-entry] Using PRELOADED lightweight TTS ✅\n`);
  } else {
    // Fallback: import lightweight TTS (fast, no heavy deps)
    const lightweightTTS = await import('./shared/lightweight-tts.js');
    tts = lightweightTTS.createLightweightTTS(persona?.name || 'Ferni', voiceConfig);
    process.stderr.write(`[voice-agent-entry] Imported lightweight TTS\n`);
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
  } catch { /* not running as child process */ }

  // Use preloaded modules or fallback to dynamic import
  const e2eDiagnostics = preloaded?.e2eDiagnostics ?? await import('./shared/e2e-diagnostics.js');
  const selfHealing = preloaded?.selfHealing ?? await import('../services/self-healing/index.js');
  const { e2e } = e2eDiagnostics;
  const { withResilience, analyzeFailure, humanizeError } = selfHealing;

  let currentPhase: 'deps' | 'persona' | 'connect' | 'session' | 'greeting' | 'running' = 'deps';
  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;

  try {
    // Step 1: Load voice dependencies
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(() => loadVoiceDeps(preloaded ?? undefined), {
      maxRetries: 2, baseDelay: 1000, operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // Step 2: Get persona (from cache or load locally)
    currentPhase = 'persona';
    const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : {};
    const personaId = metadata.persona_id || process.env.PERSONA_ID || 'ferni';

    e2e.resourceLoading(`persona:${personaId}`);
    const personaStart = Date.now();
    const { usePrewarmed, persona: cachedPersona, systemPrompt: cachedPrompt } =
      await getPrewarmedResources(personaId, preloaded ?? undefined);

    let persona = cachedPersona;
    if (!usePrewarmed) {
      // CRITICAL: Do NOT import startup.js here!
      // startup.js has a massive import chain that causes 112+ second hangs.
      // Instead, try to load persona from bundles directly (much lighter).
      process.stderr.write(`[voice-agent-entry] Cache miss - loading persona locally...\n`);
      persona = await loadPersonaLocally(personaId, preloaded ?? undefined);
    }
    e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);
    process.stderr.write(`[voice-agent-entry] Using persona: ${persona?.name || personaId}\n`);

    // Step 3: Connect to room
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();
    await withResilience(() => connectToRoom(ctx), {
      maxRetries: 3, baseDelay: 500, maxDelay: 5000, operationName: 'room-connect',
      onRetry: (attempt, error) => {
        e2e.warn('SESSION', `Room connect retry (attempt ${attempt})`, { error: error.message, roomName });
      },
    });
    e2e.sessionConnected(jobId, roomName, ctx.room.localParticipant?.identity || 'agent', Date.now() - connectStart);

    // Step 4: Create and start session
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();
    const systemPrompt = cachedPrompt || persona?.systemPrompt || 'You are Ferni, a helpful AI life coach.';
    const created = await createSession(persona, systemPrompt, preloaded ?? undefined);
    session = created.session;

    await session.start({ agent: created.agent, room: ctx.room });
    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(`[voice-agent-entry] Session started in ${Date.now() - startTime}ms!\n`);

    // Step 5: Say greeting - use preloaded warmGreeting
    currentPhase = 'greeting';
    const warmGreeting = preloaded?.warmGreeting ?? await import('./shared/warm-greeting.js');
    await session.say(
      warmGreeting.getWarmGreeting(personaId) || "Hey there! I'm Ferni. How can I help you today?"
    );

    currentPhase = 'running';
    await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Run AI diagnosis
    const stageMap: Record<typeof currentPhase, 'unknown' | 'session' | 'entry'> = {
      deps: 'entry', persona: 'entry', connect: 'session',
      session: 'session', greeting: 'session', running: 'session',
    };
    try {
      const diagnosis = await analyzeFailure([errObj.message, errObj.stack || ''], {
        jobId, stage: stageMap[currentPhase],
        timing: { totalMs: Date.now() - startTime },
        errorType: errObj.name, errorMessage: errObj.message,
      });

      e2e.custom('DIAGNOSIS', `AI analysis for session ${jobId}`, {
        phase: currentPhase, rootCause: diagnosis.rootCause,
        confidence: diagnosis.confidence, autoFixable: diagnosis.autoFixable,
      });

      if (session && ctx.room.isConnected && diagnosis.humanExplanation) {
        const humanized = humanizeError(errObj);
        if (humanized.shouldNotifyUser) {
          try { await session.say(humanized.userMessage); } catch { /* can't speak */ }
        }
      }
    } catch { /* diagnosis is best-effort */ }

    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => ctx.room.on('disconnected', () => resolve()));
    } catch { /* ignore */ }
  }
}
