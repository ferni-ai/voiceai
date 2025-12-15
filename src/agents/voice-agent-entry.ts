/**
 * Voice Agent Entry Function (Fully Integrated)
 *
 * This is the main entry point for voice agent sessions in the lightweight child process.
 * It uses all the extracted handlers from voice-agent/ for full feature parity with voice-agent.ts.
 *
 * ARCHITECTURE:
 * - Phase modules in ./voice-agent/phases/ handle discrete initialization steps
 * - This file orchestrates the phases and manages the session lifecycle
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

import type { JobContext } from '@livekit/agents';

// Event cleanup registry for proper memory management
import {
  createSessionCleanupTracker,
  runSessionCleanup,
} from './session/event-cleanup-registry.js';

// Phase modules (extracted for maintainability)
import {
  loadVoiceDeps as loadVoiceDepsPhase,
  getCachedVoiceDeps,
  loadPersonaPhase,
  getPrewarmedResources,
  loadPersonaLocally,
  connectToRoom,
  waitForParticipant,
  detectConnectionType,
  type VoiceDeps,
} from './voice-agent/phases/index.js';

// Import the full PersonaConfig type for proper type compatibility
import type { PersonaConfig } from '../personas/types.js';

// ============================================================================
// MODULE-LEVEL STATE (Cached voice deps)
// ============================================================================

let cachedVoiceDeps: VoiceDeps | null = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Load core voice dependencies (uses phase module) */
async function loadVoiceDeps(): Promise<void> {
  if (cachedVoiceDeps) return;
  cachedVoiceDeps = await loadVoiceDepsPhase();
}

/** Get voice, google, silero, genai from cached deps */
function getVoiceDeps(): VoiceDeps {
  if (!cachedVoiceDeps) {
    cachedVoiceDeps = getCachedVoiceDeps();
    if (!cachedVoiceDeps) {
      throw new Error('Voice deps not loaded - call loadVoiceDeps first');
    }
  }
  return cachedVoiceDeps;
}

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';
  const sessionId = `session-${jobId}-${Date.now()}`;

  // In the new GCE architecture, dependencies are loaded directly by worker.ts
  // Import modules on demand
  const e2eDiagnostics = await import('./shared/e2e-diagnostics.js');
  const { e2e } = e2eDiagnostics;

  const lightweightResilience = await import('./shared/lightweight-resilience.js');
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

  const cleanupHandlers: Array<() => void | Promise<void>> = [];

  // Create session-scoped cleanup tracker for automatic event handler cleanup
  const cleanupTracker = createSessionCleanupTracker(sessionId);

  try {
    // =========================================================================
    // STEP 1: LOAD VOICE DEPENDENCIES
    // =========================================================================
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(async () => loadVoiceDeps(), {
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
    } = await getPrewarmedResources(personaId);

    let persona = cachedPersona;
    if (!usePrewarmed) {
      const startup = await import('../startup.js');
      await startup.startup();
      persona = await loadPersonaLocally(personaId);
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

    // ✅ FULL RICH PROMPT - Tools work from definitions, so use all tokens for personality!
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const richPromptPath = join(__dirname, '../personas/bundles/ferni/identity/system-prompt.md');
    const systemPrompt = await fs.readFile(richPromptPath, 'utf-8');
    process.stderr.write(
      `[voice-agent-entry] Using RICH prompt (${systemPrompt.length} chars, ~${Math.round(systemPrompt.length / 4)} tokens) - tools from definitions only! 🎉\n`
    );

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

    // Register session with SessionDataManager for proper cache cleanup
    // This is CRITICAL for preventing memory leaks - when session ends,
    // all user data caches will be automatically cleared
    if (userId) {
      try {
        const { getSessionDataManager } = await import('../services/session-data-manager.js');
        getSessionDataManager().sessionStarted(userId);
      } catch {
        // SessionDataManager may not be initialized - non-fatal
      }
    }

    // =========================================================================
    // STEP 5: CREATE SESSION
    // =========================================================================
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();

    // Load VAD using cached deps
    const { silero } = getVoiceDeps();
    type VADType = Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>>;
    const vad: VADType = await silero.VAD.load();

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

    // Create TTS with localized voice using PersonaAwareTTS (with voice switching support)
    const voiceManager = await import('../speech/voice-manager.js');
    const tts = voiceManager.createPersonaAwareTTS(sessionPersona.name, {
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

    // Get voice deps for session creation
    const { voice, google, genai } = getVoiceDeps();

    // Create FerniAgent - builds tools internally from domain imports
    // No more buildTools() phase - FerniAgent owns its tools
    process.stderr.write(`[voice-agent-entry] Creating FerniAgent (tools built internally)\n`);
    const { FerniAgent } = await import('./personas/ferni-agent.js');
    const agent = new FerniAgent(systemPrompt, {
      skipGreeting: true, // Greeting handled by generateAndSpeakGreeting below
    });

    // Agent owns instructions and tools - don't duplicate instructions on RealtimeModel
    session = new voice.AgentSession({
      vad,
      llm: new google.beta.realtime.RealtimeModel({
        model: 'gemini-2.0-flash-exp',
        modalities: [genai.Modality.TEXT],
        temperature: 0.8,
        language: 'en-US',
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

    // =========================================================================
    // 🔍 DEBUG: Comprehensive event logging to capture Gemini responses
    // =========================================================================
    process.stderr.write(`[voice-agent-entry] 🔍 Setting up Gemini debug logging...\n`);

    // Log ALL session events for debugging
    const debugEvents = [
      'agent_state_changed',
      'user_state_changed',
      'function_calls_collected',
      'function_tools_executed',
      'agent_speech_started',
      'agent_speech_stopped',
      'user_input_transcribed',
    ];

    // Try to hook into raw LLM events if available
    if (session.llm && typeof session.llm.on === 'function') {
      process.stderr.write(`[voice-agent-entry] 🔍 Hooking into LLM events...\n`);
      session.llm.on('response', (resp: unknown) => {
        process.stderr.write(`\n${'='.repeat(70)}\n`);
        process.stderr.write(`🤖 [RAW LLM RESPONSE]:\n`);
        process.stderr.write(`${JSON.stringify(resp, null, 2)}\n`);
        process.stderr.write(`${'='.repeat(70)}\n\n`);
      });
    }

    // Hook into function calls collected (before execution)
    const fnCallsHandler = (event: unknown) => {
      process.stderr.write(`\n${'='.repeat(70)}\n`);
      process.stderr.write(`📥 [FUNCTION CALLS COLLECTED] (Gemini wants to call these tools):\n`);
      process.stderr.write(`${JSON.stringify(event, null, 2)}\n`);
      process.stderr.write(`${'='.repeat(70)}\n\n`);
    };
    session.on('function_calls_collected' as Parameters<typeof session.on>[0], fnCallsHandler);
    cleanupTracker.register('event', 'function_calls_collected handler', () => {
      session.off?.('function_calls_collected', fnCallsHandler);
    });

    // TOOL TRACKING HANDLER
    setupToolTrackingHandler({
      session,
      userData,
      services,
      sessionPersona: sessionPersona,
      sessionId,
      debugEnabled: true,
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
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event: unknown) => {
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
    cleanupTracker.register('event', 'handoffEvents.voiceSwitch', () => {
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

    // Monitor connection state with cleanup tracking
    const connectionStateHandler = (state: unknown) => {
      process.stderr.write(`[voice-agent-entry] 🔌 Connection state: ${state}\n`);
    };
    ctx.room.on('connectionStateChanged', connectionStateHandler);
    cleanupTracker.register('event', 'room.connectionStateChanged', () => {
      ctx.room.off('connectionStateChanged', connectionStateHandler);
    });

    const reconnectingHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnecting...\n`);
    };
    ctx.room.on('reconnecting', reconnectingHandler);
    cleanupTracker.register('event', 'room.reconnecting', () => {
      ctx.room.off('reconnecting', reconnectingHandler);
    });

    const reconnectedHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnected!\n`);
    };
    ctx.room.on('reconnected', reconnectedHandler);
    cleanupTracker.register('event', 'room.reconnected', () => {
      ctx.room.off('reconnected', reconnectedHandler);
    });

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', () => {
        process.stderr.write(`[voice-agent-entry] 🔌 Disconnected\n`);
        resolve();
      });
    });

    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);

    // Run event cleanup registry (cleans up all registered event handlers)
    process.stderr.write(`[voice-agent-entry] 🧹 Running event cleanup registry...\n`);
    const registryResult = await runSessionCleanup(sessionId);
    process.stderr.write(
      `[voice-agent-entry] 🧹 Registry cleanup: ${registryResult.cleaned} cleaned, ${registryResult.errors} errors, ${registryResult.totalDurationMs}ms\n`
    );

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

    // Run event cleanup registry even on error
    try {
      const registryResult = await runSessionCleanup(sessionId);
      process.stderr.write(
        `[voice-agent-entry] 🧹 Registry cleanup on error: ${registryResult.cleaned} cleaned\n`
      );
    } catch {
      /* ignore registry cleanup errors */
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
