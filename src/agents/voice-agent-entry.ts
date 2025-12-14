/**
 * Voice Agent Entry Function (Fully Integrated)
 *
 * This is the main entry point for voice agent sessions in the lightweight child process.
 * It uses all the extracted handlers from voice-agent/ for full feature parity with voice-agent.ts.
 *
 * INTEGRATIONS:
 * - Session services (user profile, trial status, trust systems)
 * - User identification (voice ID, metadata)
 * - Music player & DJ booth
 * - Handoff system (team member switching)
 * - Data channel handler (frontend communication)
 * - Transcript handler (emotion detection, game detection, feedback)
 * - Session state handlers (silence detection, engagement)
 * - Tool tracking & orchestration
 * - Voice humanization (prosody, disfluencies, emotional arc)
 * - Frontend publisher (real-time UI updates)
 * - Cameo system (team member pop-ins)
 * - Bundle runtime (rich persona content)
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';
import type { PreloadedDeps } from './voice-agent-child.js';

// Lazy-loaded module cache (populated from preloaded or dynamic import)
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

// ============================================================================
// TYPES
// ============================================================================

// Import the full PersonaConfig type for proper type compatibility
import type { PersonaConfig } from '../personas/types.js';

// ToolSet matches the ToolContext type expected by voice.Agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolSet = Record<string, any>;

// Simplified persona config for fallback scenarios
interface SimplePersonaConfig {
  id: string;
  name: string;
  voice: { voiceId: string; provider: string };
  systemPrompt: string;
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
  const personas = await import('../personas/index.js');
  if (!preloaded?.personaBundlesReady) {
    await personas.initializeFromBundles();
  } else {
    process.stderr.write(`[voice-agent-entry] Using PRELOADED persona bundles ✅\n`);
  }
  // Return the full persona config directly - it should have all required fields
  const result = await personas.getPersonaAsync(personaId);
  return result ?? null; // Convert undefined to null for type consistency
}

/**
 * Build tools for the agent based on persona.
 */
async function buildTools(personaId: string): Promise<ToolSet> {
  const toolsStart = Date.now();
  process.stderr.write(`[voice-agent-entry] 🔧 Building tools for ${personaId}...\n`);

  try {
    const { buildAgentTools, buildEssentialTools } = await import('../tools/builder.js');

    const [personaTools, essentialTools] = await Promise.all([
      buildAgentTools(personaId),
      buildEssentialTools(),
    ]);

    const allTools: ToolSet = {
      ...essentialTools,
      ...personaTools,
    };

    const toolCount = Object.keys(allTools).length;
    const toolNames = Object.keys(allTools).slice(0, 10).join(', ');
    process.stderr.write(
      `[voice-agent-entry] 🔧 Built ${toolCount} tools in ${Date.now() - toolsStart}ms\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔧 Tools: ${toolNames}${toolCount > 10 ? '...' : ''}\n`
    );

    const hasMusicTools = Object.keys(allTools).some(
      (name) => name.toLowerCase().includes('music') || name.toLowerCase().includes('play')
    );
    process.stderr.write(`[voice-agent-entry] 🎵 Music tools available: ${hasMusicTools}\n`);

    return allTools;
  } catch (error) {
    process.stderr.write(
      `[voice-agent-entry] ⚠️ Tool building failed: ${error}. Proceeding without tools.\n`
    );
    return {};
  }
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

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';
  const sessionId = `session-${jobId}-${Date.now()}`;

  // Get preloaded deps
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

  const lightweightResilience =
    preloaded?.lightweightResilience ?? (await import('./shared/lightweight-resilience.js'));
  const { withResilience, humanizeError } = lightweightResilience;

  let currentPhase:
    | 'deps'
    | 'persona'
    | 'connect'
    | 'session'
    | 'services'
    | 'handlers'
    | 'greeting'
    | 'running' = 'deps';
  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanupHandlers: Array<() => void | Promise<void>> = [];

  try {
    // =========================================================================
    // STEP 1: LOAD VOICE DEPENDENCIES
    // =========================================================================
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(async () => loadVoiceDeps(preloaded ?? undefined), {
      maxRetries: 2,
      baseDelay: 1000,
      operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // =========================================================================
    // STEP 2: GET PERSONA
    // =========================================================================
    currentPhase = 'persona';

    // Parse metadata for persona ID
    let metadata: Record<string, unknown> = {};
    if (ctx.job.metadata) {
      try {
        metadata = JSON.parse(ctx.job.metadata);
      } catch (e) {
        process.stderr.write(`[voice-agent-entry] Failed to parse job.metadata: ${e}\n`);
      }
    }
    if (!metadata.persona_id && ctx.job.room?.metadata) {
      try {
        const roomMeta = JSON.parse(ctx.job.room.metadata);
        if (roomMeta.persona_id) {
          metadata = { ...metadata, ...roomMeta };
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
      const startup = await import('../startup.js');
      await startup.startup();
      persona = await loadPersonaLocally(personaId, preloaded ?? undefined);
    }
    e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);

    // Create a full persona config with defaults
    // Use 'as unknown as PersonaConfig' for fallback since we don't have all required fields
    // Import voice config for correct fallback voice ID
    const { getDefaultVoiceConfig } = await import('../config/cartesia-config.js');
    const defaultVoice = getDefaultVoiceConfig();

    const sessionPersona = (persona || {
      id: personaId,
      name: personaId
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      voice: { voiceId: defaultVoice.voiceId, provider: defaultVoice.provider },
      systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
      personality: { warmth: 0.7, humor: 0.4, directness: 0.6, energy: 0.6 },
      speechCharacteristics: { baseSpeedMultiplier: 1.0, pauseMultiplier: 1.0 },
    }) as unknown as PersonaConfig;

    const systemPrompt = cachedPrompt || sessionPersona.systemPrompt;
    process.stderr.write(`[voice-agent-entry] Using persona: ${sessionPersona.name}\n`);

    // =========================================================================
    // STEP 3: CONNECT TO ROOM
    // =========================================================================
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();
    await withResilience(async () => connectToRoom(ctx), {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      operationName: 'room-connect',
      onBeforeRetry: async () => {
        await ctx.room.disconnect();
      },
    });
    e2e.sessionConnected(
      jobId,
      roomName,
      ctx.room.localParticipant?.identity || 'agent',
      Date.now() - connectStart
    );

    // =========================================================================
    // STEP 4: INITIALIZE SESSION SERVICES
    // =========================================================================
    currentPhase = 'services';
    process.stderr.write(`[voice-agent-entry] 📦 Initializing session services...\n`);

    // Import handlers dynamically to keep startup fast
    const [
      { identifyUser },
      { initializeSession },
      { initializeHandoffContext, handoffEvents },
      { getConversationManager },
    ] = await Promise.all([
      import('./voice-agent/user-identification-handler.js'),
      import('./voice-agent/session-init-handler.js'),
      import('../tools/handoff/index.js'),
      import('../services/conversation-manager.js'),
    ]);

    // Identify user from metadata
    const { userId, userName, userAccent } = await identifyUser({
      jobMetadata: ctx.job.metadata,
      room: ctx.room,
      sessionId,
    });

    // Initialize session services (trust profiles, trial status, etc.)
    const {
      services,
      isReturningUser,
      isTrialUser,
      isFirstConversation,
      trialStatus,
      userData,
      sessionStateManager,
      stopPeriodicSync,
    } = await initializeSession({
      sessionId,
      userId,
      userName,
      userAccent,
      sessionPersona,
      room: ctx.room,
    });

    if (stopPeriodicSync) {
      cleanupHandlers.push(stopPeriodicSync);
    }

    // Initialize handoff context
    const customData = services.userProfile?.customData as Record<string, unknown> | undefined;
    initializeHandoffContext({
      meetingCounts:
        services.userProfile?.humanizingState?.perPersonaMeetingCounts ||
        (customData?.meetingCounts as Record<string, number> | undefined),
      lastTopics:
        services.userProfile?.humanizingState?.perPersonaLastTopic ||
        (customData?.lastTopicsPerPersona as Record<string, string> | undefined),
    });

    process.stderr.write(
      `[voice-agent-entry] 📦 Services initialized (userId: ${userId || 'anonymous'}, returning: ${isReturningUser})\n`
    );

    // =========================================================================
    // STEP 5: BUILD TOOLS & CREATE SESSION
    // =========================================================================
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();

    // Build tools
    e2e.resourceLoading('tools');
    const toolsStart = Date.now();
    const tools = await buildTools(personaId);
    e2e.resourceLoaded('tools', Date.now() - toolsStart);

    // Load VAD
    type VADType = Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>>;
    let vad: VADType;
    if (preloaded?.vadModel) {
      vad = preloaded.vadModel as VADType;
    } else {
      vad = await silero!.VAD.load();
    }

    // =========================================================================
    // VOICE LOCALIZATION (International Accent Support)
    // =========================================================================
    const voiceConfig = sessionPersona.voice || defaultVoice;

    let effectiveVoiceId = voiceConfig.voiceId;
    let isLocalizedVoice = false;

    // 🌍 For non-American accents, get a localized voice
    if (userAccent && userAccent !== 'american') {
      try {
        const { getLocalizedVoiceId } = await import('../services/cartesia-voice-localization.js');
        const localizationResult = await getLocalizedVoiceId(sessionPersona.id, userAccent);
        effectiveVoiceId = localizationResult.voiceId;
        isLocalizedVoice = localizationResult.isLocalized;
        process.stderr.write(
          `[voice-agent-entry] 🌍 Voice localized: ${userAccent} (cached: ${localizationResult.cached})\n`
        );
      } catch (locErr) {
        process.stderr.write(
          `[voice-agent-entry] Voice localization failed (non-fatal): ${locErr}\n`
        );
      }
    }

    // Create TTS with localized voice
    let tts;
    if (preloaded?.ttsCore) {
      // Use lightweight TTS core for fast startup in child processes
      tts = preloaded.ttsCore.createTTSFromConfig(sessionPersona.name, {
        ...voiceConfig,
        voiceId: effectiveVoiceId,
        accent: userAccent || 'american',
      });
    } else {
      // Fallback to full PersonaAwareTTS (with voice switching support)
      const voiceManager = await import('../speech/voice-manager.js');
      tts = voiceManager.createPersonaAwareTTS(sessionPersona.name, {
        ...voiceConfig,
        voiceId: effectiveVoiceId,
        accent: userAccent || 'american',
        isLocalizedVoice,
      });

      // Initialize voice manager and register TTS for mid-session accent changes
      const sessionVoiceManager = voiceManager.getSessionVoiceManager(sessionId);
      sessionVoiceManager.initialize();

      try {
        const { registerSessionTTS } = await import('../api/session-accent-routes.js');
        registerSessionTTS(sessionId, tts, sessionPersona.id, userAccent || 'american');
      } catch {
        // Non-critical - accent changes just won't work mid-session
      }
    }

    // Create Agent with tools
    const toolCount = Object.keys(tools).length;
    process.stderr.write(`[voice-agent-entry] Creating Agent with ${toolCount} tools\n`);

    const agent = new voice!.Agent({
      instructions: systemPrompt,
      tools: toolCount > 0 ? tools : undefined,
    });

    session = new voice!.AgentSession({
      vad,
      llm: new google!.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        modalities: [genai!.Modality.TEXT],
        temperature: 0.8,
        language: 'en-US',
        instructions: systemPrompt,
      }),
      tts,
      userData,
      voiceOptions: {
        allowInterruptions: true,
        minEndpointingDelay: 400,
        maxEndpointingDelay: 1200,
        minInterruptionWords: 1,
        minInterruptionDuration: 300,
        preemptiveGeneration: true,
      },
    });

    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    process.stderr.write(`[voice-agent-entry] Session created in ${Date.now() - sessionStart}ms\n`);

    // =========================================================================
    // STEP 6: SET UP ALL HANDLERS
    // =========================================================================
    currentPhase = 'handlers';
    process.stderr.write(`[voice-agent-entry] 🔌 Setting up handlers...\n`);

    // Import all handlers
    const [
      { setupMusicHandler },
      { setupDataChannelHandler },
      { createTranscriptHandler },
      { setupSessionStateHandlers },
      { setupToolTrackingHandler },
      { createHandoffHandler },
      { registerCameoHandlers },
      { generateAndSpeakGreeting },
      { handleSessionCleanup },
    ] = await Promise.all([
      import('./voice-agent/music-handler.js'),
      import('./voice-agent/data-channel-handler.js'),
      import('./voice-agent/transcript-handler.js'),
      import('./voice-agent/session-state-handler.js'),
      import('./voice-agent/tool-tracking-handler.js'),
      import('./shared/handoff-handler.js'),
      import('./shared/cameo-handler.js'),
      import('./voice-agent/greeting-handler.js'),
      import('./voice-agent/cleanup-handler.js'),
    ]);

    const conversationManager = getConversationManager();
    conversationManager.setPersonaId(sessionPersona.id);

    // Wire conversation manager to capture insights for learning
    conversationManager.setInsightCallback((type, key, value, confidence) => {
      services.captureInsight(type, key, value, confidence);
    });

    // =========================================================================
    // VOICE HUMANIZATION INTEGRATION
    // Makes agent feel more human through prosody, micro-interruptions, etc.
    // =========================================================================
    let voiceHumanization: { cleanup: () => void } | null = null;
    try {
      const { getEmotionalArcTracker } = await import('../conversation/index.js');
      const { quickSetupVoiceHumanization } =
        await import('./integrations/voice-humanization-integration.js');
      const emotionalArcTracker = getEmotionalArcTracker();

      voiceHumanization = quickSetupVoiceHumanization(
        sessionId,
        sessionPersona.id,
        emotionalArcTracker,
        {
          onInterrupt: () => {
            // When micro-interruption detected, interrupt the agent
            process.stderr.write(`[voice-agent-entry] 🛑 Micro-interruption detected\n`);
            try {
              session.interrupt();
            } catch {
              // Ignore interrupt errors
            }
          },
          onLaughter: (laughType: string) => {
            process.stderr.write(`[voice-agent-entry] 😄 User laughter detected: ${laughType}\n`);
          },
        }
      );
      process.stderr.write(`[voice-agent-entry] 🎤 Voice humanization initialized\n`);
    } catch (humanizationErr) {
      process.stderr.write(
        `[voice-agent-entry] Voice humanization init (non-fatal): ${humanizationErr}\n`
      );
    }

    // =========================================================================
    // EXTENSIBILITY SESSION HOOK - Marketplace agent custom behavior
    // =========================================================================
    let extensibilitySessionPrompt: string | null = null;
    try {
      const { onSessionStart } = await import('../personas/bundles/extensibility-integration.js');
      extensibilitySessionPrompt = await onSessionStart({
        personaId: sessionPersona.id,
        userId,
        sessionId,
      });
      if (extensibilitySessionPrompt) {
        process.stderr.write(`[voice-agent-entry] 🔌 Extensibility hook executed\n`);
        // Store in userData for use in context injection
        // FIX AUDIT ISSUE: Property now typed in UserData interface
        userData.extensibilitySessionPrompt = extensibilitySessionPrompt;
      }
    } catch {
      // Non-critical - extensibility is optional
    }

    // Wait for participant before starting session
    process.stderr.write(`[voice-agent-entry] 👤 Waiting for participant...\n`);
    const participant = await Promise.race([
      ctx.waitForParticipant(),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 2000);
      }),
    ]);

    if (participant) {
      process.stderr.write(`[voice-agent-entry] 👤 Participant joined: ${participant.identity}\n`);
    }

    // MUSIC HANDLER - Initialize music player
    const musicResult = await setupMusicHandler({
      room: ctx.room,
      session,
      services,
      sessionPersona: sessionPersona,
      conversationManager,
    });
    cleanupHandlers.push(musicResult.clearTimers);
    process.stderr.write(
      `[voice-agent-entry] 🎵 Music handler initialized: ${musicResult.initialized}\n`
    );

    // =========================================================================
    // PHONE CALL DETECTION & NOISE CANCELLATION
    // =========================================================================
    const jobMetadata = ctx.job?.metadata || '';
    const isWebConnection = jobMetadata.includes('"source":"web"');
    const isPhoneCall =
      !isWebConnection &&
      (participant?.identity?.includes('phone') ||
        participant?.identity?.includes('sip') ||
        jobMetadata.includes('"source":"phone"'));

    // Start the session with phone-specific noise cancellation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inputOptions: any = undefined;
    if (isPhoneCall) {
      try {
        const { TelephonyBackgroundVoiceCancellation } =
          await import('@livekit/noise-cancellation-node');
        inputOptions = { noiseCancellation: TelephonyBackgroundVoiceCancellation() };
        process.stderr.write(`[voice-agent-entry] 📞 Phone call - noise cancellation enabled\n`);
      } catch {
        process.stderr.write(`[voice-agent-entry] Noise cancellation not available (non-fatal)\n`);
      }
    }

    await session.start({ agent, room: ctx.room, inputOptions });
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(
      `[voice-agent-entry] Session started! (isPhone: ${isPhoneCall}, isWeb: ${isWebConnection})\n`
    );

    // TOOL TRACKING HANDLER
    setupToolTrackingHandler({
      session,
      userData,
      services,
      sessionPersona: sessionPersona,
      sessionId,
      debugEnabled: false,
    });

    // SESSION STATE HANDLERS (silence detection, engagement)
    const { silenceContext } = setupSessionStateHandlers({
      session,
      sessionPersona: sessionPersona,
      conversationManager,
      userData,
      sessionId,
    });

    // TRANSCRIPT HANDLER
    const { autoOptimizer } = await import('../tools/auto-optimizer.js');
    const { patternAnalyzer } = await import('../tools/pattern-analyzer.js');
    const { feedbackCollector } = await import('../tools/feedback-collector.js');
    const { dynamicToolLoader } = await import('../tools/dynamic-loader.js');
    const transcriptHandler = createTranscriptHandler({
      room: ctx.room,
      session,
      services,
      sessionPersona: sessionPersona,
      conversationManager,
      voiceHumanization: null, // Will be set up if needed
      userData,
      userId,
      sessionId,
      silenceContext,
      dynamicToolLoader,
      autoOptimizer,
    });
    session.on(voice!.AgentSessionEventTypes.UserInputTranscribed, (event: unknown) => {
      transcriptHandler.handler(
        event as import('./voice-agent/transcript-handler.js').TranscriptEvent
      );
    });

    // HANDOFF HANDLER
    const handoffHandler = createHandoffHandler({
      ctx,
      session,
      tts: session.tts as { switchVoice?: (name: string, id: string) => void },
      services,
      userData,
      getVoiceAgentRef: () => null, // Simplified - no VoiceAgent class in lightweight entry
    });
    const wrappedHandoffHandler = (data: Parameters<typeof handoffHandler>[0]) => {
      void handoffHandler(data).catch((err) => {
        process.stderr.write(`[voice-agent-entry] Handoff handler error: ${err}\n`);
      });
    };
    handoffEvents.on('voiceSwitch', wrappedHandoffHandler);
    cleanupHandlers.push(() => {
      void handoffEvents.off('voiceSwitch', wrappedHandoffHandler);
    });

    // CAMEO HANDLERS
    try {
      const cleanupCameoHandlers = await registerCameoHandlers({
        ctx,
        session,
        tts: session.tts as { switchVoice?: (name: string, id: string) => void },
        hostPersonaId: sessionPersona.id,
        hostVoiceId: sessionPersona.voice.voiceId,
        getVoiceAgentRef: () => null,
        hostPersona: sessionPersona,
      });
      if (cleanupCameoHandlers) {
        cleanupHandlers.push(cleanupCameoHandlers);
      }
      process.stderr.write(`[voice-agent-entry] 🎬 Cameo handlers registered\n`);
    } catch (cameoErr) {
      process.stderr.write(`[voice-agent-entry] Cameo handlers failed (non-fatal): ${cameoErr}\n`);
    }

    // DATA CHANNEL HANDLER (frontend communication)
    const dataChannelResult = setupDataChannelHandler({
      room: ctx.room,
      session,
      services,
      sessionPersona,
      userId,
      sessionId,
      voiceAgentRef: undefined,
    });
    cleanupHandlers.push(dataChannelResult.cleanup);
    process.stderr.write(`[voice-agent-entry] 📡 Data channel handler set up\n`);

    // FRONTEND PUBLISHER
    let frontendPublisherReady = false;
    try {
      const { initializeFrontendPublisher, getFrontendPublisher } =
        await import('./realtime/index.js');
      initializeFrontendPublisher(ctx.room);

      const { initFrontendSignal } = await import('../services/frontend-signal.js');
      initFrontendSignal(async (type, data) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) {
          await publisher.sendData(type, data ?? {});
        }
      });
      frontendPublisherReady = true;
      process.stderr.write(`[voice-agent-entry] 📤 Frontend publisher initialized\n`);

      // =========================================================================
      // HUMANIZATION SIGNAL EMITTER - Bridge backend humanization to frontend EQ
      // Enables avatar to respond BEFORE words arrive
      // =========================================================================
      try {
        const { initHumanizationSignalEmitter } =
          await import('../services/humanization/humanization-signal-emitter.js');
        initHumanizationSignalEmitter(async (type, payload) => {
          const publisher = getFrontendPublisher();
          if (publisher.isConnected()) {
            await publisher.sendData(type, payload);
          }
        });
        process.stderr.write(`[voice-agent-entry] 🌉 Humanization signal emitter initialized\n`);
      } catch {
        // Non-critical
      }

      // =========================================================================
      // TRUST SIGNAL EMITTER - Shows "Ferni noticed..." cards for growth, wins
      // =========================================================================
      try {
        const { setSignalEmitter } =
          await import('../services/trust-systems/trust-signal-emitter.js');
        setSignalEmitter((signal) => {
          const publisher = getFrontendPublisher();
          if (publisher.isConnected()) {
            void publisher.sendData('trust_signal', {
              signalType: signal.type,
              title: signal.title,
              message: signal.message,
              personaId: signal.personaId || sessionPersona.id,
              timing: signal.timing,
              metadata: signal.metadata,
            });
          }
        });
        process.stderr.write(`[voice-agent-entry] 💚 Trust signal emitter initialized\n`);
      } catch {
        // Non-critical
      }
    } catch (pubErr) {
      process.stderr.write(
        `[voice-agent-entry] Frontend publisher failed (non-fatal): ${pubErr}\n`
      );
    }

    // =========================================================================
    // ASYNC EVENTS - Trigger background processing
    // =========================================================================
    try {
      const { emitConversationStart } = await import('../services/async-events/index.js');
      emitConversationStart({
        sessionId,
        userId: userId || 'anonymous',
        personaId: sessionPersona.id,
        isReturning: isReturningUser,
      });
      process.stderr.write(`[voice-agent-entry] 📤 conversation:start emitted\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // PROSODY BRIDGE - Voice analysis connection
    // =========================================================================
    try {
      const { initProsodyBridge } = await import('../conversation/humanization/index.js');
      initProsodyBridge(sessionId, userId || 'anonymous');
      process.stderr.write(`[voice-agent-entry] 🌉 Prosody bridge initialized\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // BUNDLE RUNTIME - Rich persona content (stories, rituals, etc.)
    // =========================================================================
    let bundleRuntime: import('../personas/bundles/index.js').BundleRuntimeEngine | undefined;
    try {
      const { createBundleRuntime } = await import('../personas/bundles/index.js');
      const { loadBundleById } = await import('../personas/bundles/loader.js');
      const bundle = await loadBundleById(sessionPersona.id);
      if (bundle) {
        bundleRuntime = await createBundleRuntime(bundle);

        // Sync relationship state from user profile
        if (userData.bundleRuntimeState) {
          bundleRuntime.updateState({
            relationshipTurns: userData.bundleRuntimeState.relationshipTurns,
            sessionCount: services.userProfile?.totalConversations || 0,
            userName: userData.name,
          });
        }
        process.stderr.write(
          `[voice-agent-entry] 📦 Bundle runtime initialized (stage: ${bundleRuntime.getRelationshipStageName()})\n`
        );
      }
    } catch (bundleErr) {
      process.stderr.write(`[voice-agent-entry] Bundle runtime (non-fatal): ${bundleErr}\n`);
    }

    // =========================================================================
    // UNIFIED CONVERSATION HUMANIZATION - Voice print, memory, breathing sync
    // =========================================================================
    try {
      const { initConversationSession } =
        await import('./integrations/conversation-session-integration.js');
      const conversationSession = initConversationSession({
        sessionId,
        userId: userId || 'anonymous',
        personaId: sessionPersona.id,
        sessionCount: services.userProfile?.totalConversations,
        relationshipStage: services.userProfile?.relationshipStage as
          | 'stranger'
          | 'acquaintance'
          | 'friend'
          | 'trusted_advisor'
          | undefined,
      });

      if (conversationSession) {
        process.stderr.write(`[voice-agent-entry] 🎭 Unified conversation session initialized\n`);
      }

      // Load persisted humanization data
      const { initializeFromPersistence } =
        await import('../conversation/humanization/persistence.js');
      await initializeFromPersistence(userId || 'anonymous', sessionId);
    } catch (humanizationErr) {
      process.stderr.write(
        `[voice-agent-entry] Humanization init (non-fatal): ${humanizationErr}\n`
      );
    }

    // =========================================================================
    // VOICE HUMANIZATION INIT - Feature flags, metrics, response anticipation
    // =========================================================================
    try {
      const { setupVoiceHumanizationInit } =
        await import('./voice-agent/voice-humanization-init-handler.js');
      setupVoiceHumanizationInit({
        sessionId,
        sessionPersona,
        userId,
        userProfile: services.userProfile,
      });
      process.stderr.write(`[voice-agent-entry] 🎤 Voice humanization init complete\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // PARALLEL NON-CRITICAL SERVICES
    // =========================================================================
    await Promise.allSettled([
      // Engagement data sender
      (async () => {
        try {
          const mod = await import('../services/engagement-data-sender.js');
          const engagementDataSender = mod.getEngagementDataSender();
          // FIX AUDIT ISSUE: Use structural typing - ctx.room has localParticipant with publishData
          // which matches LiveKitRoomLike interface. Cast to that interface type.
          engagementDataSender.setRoom(
            ctx.room as Parameters<typeof engagementDataSender.setRoom>[0]
          );
          if (userId) {
            await engagementDataSender.sendEngagementData(userId);
          }
        } catch {
          // Non-critical
        }
      })(),
      // Cognitive session start
      (async () => {
        try {
          const { onCognitiveSessionStart } =
            await import('../services/cognitive-session-hooks.js');
          await onCognitiveSessionStart({
            userId: userId || 'anonymous',
            personaId: sessionPersona.id,
            userProfile: services.userProfile,
            sessionId,
          });
        } catch {
          // Non-critical
        }
      })(),
      // Game engine initialization
      (async () => {
        try {
          const { getSessionGameEngine } = await import('../services/games/index.js');
          const engine = getSessionGameEngine(sessionId, sessionPersona.id);
          if (userId) {
            await engine.initializeForUser(userId);
          }
        } catch {
          // Non-critical
        }
      })(),
    ]);

    // =========================================================================
    // STEP 7: GREETING
    // =========================================================================
    currentPhase = 'greeting';
    process.stderr.write(`[voice-agent-entry] 🎤 Speaking greeting...\n`);

    // Use the full greeting handler for best experience
    try {
      await generateAndSpeakGreeting({
        sessionPersona: sessionPersona,
        services,
        userData,
        sessionId,
        userId,
        userName,
        isReturningUser,
        bundleRuntime, // Now using actual bundle runtime
        utilitiesProactiveOpener: undefined,
        session,
        tagGreeting: (text) => text, // Simple passthrough - full SSML tagging not needed for lightweight
      });
    } catch (greetingErr) {
      // Fallback to simple greeting
      process.stderr.write(
        `[voice-agent-entry] Greeting handler failed, using fallback: ${greetingErr}\n`
      );
      const fallbackGreeting = `Hey there! I'm ${sessionPersona.name}. How can I help you today?`;
      await session.say(fallbackGreeting).waitForPlayout();
    }

    process.stderr.write(
      `[voice-agent-entry] ✅ Session fully initialized in ${Date.now() - startTime}ms!\n`
    );

    // =========================================================================
    // STEP 8: RUN UNTIL DISCONNECT
    // =========================================================================
    currentPhase = 'running';

    // Monitor connection state
    ctx.room.on('connectionStateChanged', (state: unknown) => {
      process.stderr.write(`[voice-agent-entry] 🔌 Connection state: ${state}\n`);
    });

    ctx.room.on('reconnecting', () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnecting...\n`);
    });

    ctx.room.on('reconnected', () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnected!\n`);
    });

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', () => {
        process.stderr.write(`[voice-agent-entry] 🔌 Disconnected\n`);
        resolve();
      });
    });

    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);

    // Run cleanup
    process.stderr.write(`[voice-agent-entry] 🧹 Running cleanup handlers...\n`);
    await handleSessionCleanup({
      sessionId,
      userId,
      services,
      sessionPersona,
      voiceHumanization, // Now using actual voice humanization
      utilitiesCleanup: undefined,
      patternAnalyzer,
      autoOptimizer,
      feedbackCollector,
      dataChannelCleanup: dataChannelResult.cleanup,
      handoffHandler: wrappedHandoffHandler,
      cameoCleanup: undefined,
      musicCleanup: musicResult.clearTimers,
      userData,
      stopPeriodicSync,
    });

    // Run additional cleanup handlers
    for (const cleanup of cleanupHandlers) {
      try {
        await cleanup();
      } catch {
        /* ignore cleanup errors */
      }
    }

    process.stderr.write(`[voice-agent-entry] Session ended cleanly.\n`);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Try AI diagnosis
    try {
      const selfHealing = await import('../services/self-healing/index.js');
      const diagnosis = await selfHealing.analyzeFailure([errObj.message, errObj.stack || ''], {
        jobId,
        stage: currentPhase === 'deps' || currentPhase === 'persona' ? 'entry' : 'session',
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

    // Run cleanup handlers even on error
    for (const cleanup of cleanupHandlers) {
      try {
        await cleanup();
      } catch {
        /* ignore */
      }
    }

    // Keep room connected if possible
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
