/**
 * Agent session creation — builds the LLM model, TTS, VAD, tools, and AgentSession.
 *
 * Handles all model provider variants: Director Mode, Qwen full-stack, standard (Gemini/OpenAI).
 * Also handles tool loading via Gateway (2026) or legacy orchestrator.
 *
 * @module agents/voice-agent-entry/session-creator
 */

import type { PersonaConfig } from '../../personas/types.js';
import type { VoiceDeps } from '../voice-agent/phases/index.js';
import type { AudioRouter } from '../../integrations/qwen3-omni/director/audio-router.js';
import type { UserLocation } from './types.js';
import { USE_TOOL_GATEWAY } from './constants.js';
import { createLightweightVoiceAgentRef } from './voice-agent-ref.js';
import {
  getModelProvider,
  isQwen3OmniCandleBackend,
  isUsingQwen3TTS,
} from '../model-provider/index.js';
import {
  isDirectorModeRequested,
  createDirectorModeSession,
} from '../voice-agent/director-mode-setup.js';
import { getToolGateway } from '../../tools/gateway/index.js';
import { SonataSTT } from '../../speech/providers/sonata-stt-adapter.js';
import { modelConfig } from '../../services/model-config.js';

// ============================================================================
// VAD CACHING (Worker-Level Singleton)
// ============================================================================

/** Worker-level cached VAD instance — loaded once, reused across all sessions */
type VadInstance = Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>>;
let cachedVad: VadInstance | null = null;
let vadLoadPromise: Promise<VadInstance> | null = null;

/**
 * Pre-warm the Silero VAD at worker startup.
 * Call this once during worker initialization to avoid ~764ms per-session load.
 */
export async function prewarmVAD(silero: typeof import('@livekit/agents-plugin-silero')): Promise<void> {
  if (cachedVad) return;
  if (vadLoadPromise) {
    await vadLoadPromise;
    return;
  }
  vadLoadPromise = (async () => {
    const start = Date.now();
    cachedVad = await silero.VAD.load();
    process.stderr.write(`[session-creator] 🎙️ VAD pre-warmed at worker level in ${Date.now() - start}ms\n`);
    return cachedVad;
  })();
  await vadLoadPromise;
}

/** Inputs needed to create a session */
export interface CreateSessionInput {
  sessionId: string;
  sessionPersona: PersonaConfig;
  systemPrompt: string;
  modelBaseInstructions: string;
  userId: string | null;
  userAccent: string | null;
  userData: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  voiceDeps: VoiceDeps;
  roomMetadata: string | undefined;
  metadata: Record<string, unknown>;
  subscriptionTier: 'free' | 'friend' | 'partner';
  cleanupHandlers: Array<() => void | Promise<void>>;
}

/** Result from session creation */
export interface CreateSessionResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  voiceAgentRef: ReturnType<typeof createLightweightVoiceAgentRef>;
  directorAudioRouter: AudioRouter | undefined;
  toolCount: number;
  toolLoadMode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionTools: Record<string, any>;
}

/**
 * Create the full AgentSession with LLM model, TTS, VAD, and tools.
 */
export async function createAgentSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const {
    sessionId, sessionPersona, systemPrompt, modelBaseInstructions,
    userId, userAccent, userData, services, voiceDeps, roomMetadata,
    metadata, subscriptionTier, cleanupHandlers,
  } = input;

  const modelProvider = getModelProvider();
  const { voice, google: _google, genai: _genai } = voiceDeps;

  // =========================================================================
  // VAD CONFIGURATION (Always-On, Worker-Level Cache)
  // =========================================================================
  const DISABLE_VAD = process.env.DISABLE_VAD === 'true';
  let vad: Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>> | undefined;

  if (!DISABLE_VAD) {
    try {
      const vadLoadStart = Date.now();
      if (cachedVad) {
        // Reuse worker-level cached VAD (saves ~764ms per session)
        vad = cachedVad;
        process.stderr.write(
          `[voice-agent-entry] 🎙️ Silero VAD from worker cache (0ms vs ~764ms)\n`
        );
      } else {
        // Fallback: load per-session if not pre-warmed (first session or pre-warm failed)
        const { silero } = voiceDeps;
        vad = await silero.VAD.load();
        cachedVad = vad; // Cache for next session
        process.stderr.write(
          `[voice-agent-entry] 🎙️ Silero VAD loaded (first session) in ${Date.now() - vadLoadStart}ms\n`
        );
      }
    } catch (vadErr) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ VAD load failed - barge-in will fall back to transcript-based detection: ${vadErr}\n`
      );
    }
  } else {
    process.stderr.write('[voice-agent-entry] 🎙️ VAD disabled by DISABLE_VAD env var\n');
  }

  // =========================================================================
  // VOICE LOCALIZATION (International Accent Support)
  // =========================================================================
  const { getDefaultVoiceConfig } = await import('../../config/cartesia-config.js');
  const defaultVoice = getDefaultVoiceConfig();
  const voiceConfig = sessionPersona.voice || defaultVoice;
  let effectiveVoiceId = voiceConfig.voiceId;
  let isLocalizedVoice = false;

  if (userAccent && userAccent !== 'american') {
    try {
      const { getLocalizedVoiceId } =
        await import('../../services/voice/cartesia-voice-localization.js');
      const localizationResult = await getLocalizedVoiceId(sessionPersona.id, userAccent as import('../../config/voice-accents.js').EnglishAccent);
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

  // ⚡ OPTIMIZATION: Parallelize independent module loads
  process.stderr.write(`[voice-agent-entry] ⚡ Starting parallel module loads...\n`);
  const parallelLoadStart = Date.now();

  const [voiceManager, toolOrchestratorModule, ferniAgentModule, functionCallingModule] =
    await Promise.all([
      import('../../speech/voice-manager.js'),
      import('../../tools/orchestrator/voice-agent-integration.js'),
      import('../personas/ferni-agent.js'),
      import('../../tools/utils/function-calling-config.js'),
    ]);

  process.stderr.write(
    `[voice-agent-entry] ⚡ Parallel module loads complete in ${Date.now() - parallelLoadStart}ms\n`
  );

  // Create TTS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tts: any;
  if (isUsingQwen3TTS()) {
    const { Qwen3TTSAdapter } =
      await import('../../integrations/qwen3-omni/adapters/livekit-tts-adapter.js');
    tts = new Qwen3TTSAdapter({
      serverUrl: process.env.QWEN3_TTS_URL || 'http://localhost:8001',
      personaId: sessionPersona.id,
      language: 'English',
    });
  } else {
    tts = voiceManager.createPersonaAwareTTS(sessionPersona.name, {
      ...voiceConfig,
      voiceId: effectiveVoiceId,
      accent: (userAccent || 'american') as import('../../config/voice-accents.js').EnglishAccent,
      isLocalizedVoice,
    });
  }

  // Initialize voice manager
  const sessionVoiceManager = voiceManager.getSessionVoiceManager(sessionId);
  sessionVoiceManager.initialize();

  // Fire-and-forget TTS registration (non-blocking)
  if (!isUsingQwen3TTS()) {
    void (async () => {
      try {
        const { registerSessionTTS } = await import('../../api/session-accent-routes.js');
        registerSessionTTS(sessionId, tts as never, sessionPersona.id, (userAccent || 'american') as import('../../config/voice-accents.js').EnglishAccent);
      } catch {
        // Non-critical
      }
    })();
  }

  // STT provider selection: Sonata or LLM-internal
  const useSonataStt = process.env.USE_SONATA_STT === 'true';
  const externalStt = useSonataStt
    ? new SonataSTT({
        hfRepo: process.env.SONATA_STT_HF_REPO,
        enableVad: process.env.SONATA_STT_ENABLE_VAD !== 'false',
      })
    : undefined;

  // =========================================================================
  // TOOL LOADING: Gateway (2026) or Legacy Orchestrator
  // =========================================================================
  let toolGateway: ReturnType<typeof getToolGateway> | null = null;

  if (USE_TOOL_GATEWAY) {
    toolGateway = getToolGateway();
    if (!toolGateway.isReady()) {
      const warmupStart = Date.now();
      process.stderr.write(`[voice-agent-entry] 🚀 Tool Gateway warming up (Tier 0)...\n`);
      await toolGateway.warmup();
      process.stderr.write(
        `[voice-agent-entry] ✅ Tool Gateway warmed up in ${Date.now() - warmupStart}ms\n`
      );
    }
    const sessionStartTs = Date.now();
    await toolGateway.startSession(userId || 'anonymous', sessionId, {
      hasCalendarLinked: services.userProfile?.hasCalendarLinked,
      hasSpotifyLinked: services.userProfile?.hasSpotifyLinked,
      isInCrisis: false,
      recentTopics: [],
    });
    const metrics = toolGateway.getMetrics();
    process.stderr.write(
      `[voice-agent-entry] 🎯 Tool Gateway session started in ${Date.now() - sessionStartTs}ms ` +
        `(Tier 0: ${metrics.tier0Count}, Tier 1: ${metrics.tier1Count}, Total: ${metrics.totalTools} tools)\n`
    );
  } else {
    const { initializeToolOrchestrator, isOrchestratorInitialized } = toolOrchestratorModule;
    if (!isOrchestratorInitialized()) {
      try {
        await initializeToolOrchestrator();
      } catch (orchErr) {
        process.stderr.write(
          `[voice-agent-entry] Orchestrator init failed (will use legacy): ${orchErr}\n`
        );
      }
    }
  }

  const { getToolsForAgent } = toolOrchestratorModule;

  // Extract user location from metadata
  const userLocation: UserLocation | undefined =
    metadata.city || metadata.regionCode || metadata.countryCode
      ? {
          city: metadata.city as string | undefined,
          regionCode: metadata.regionCode as string | undefined,
          countryCode: metadata.countryCode as string | undefined,
        }
      : undefined;

  process.stderr.write(
    `[voice-agent-entry] 📍 Geo metadata received: city=${metadata.city || 'none'}, region=${metadata.regionCode || 'none'}, country=${metadata.countryCode || 'none'}\n`
  );

  userData.userLocation = userLocation;

  // Set current active session for native tool location fallback
  const { setCurrentActiveSession } =
    await import('../../tools/domains/information/location-preference.js');
  const formattedLocation = userLocation?.city
    ? userLocation.regionCode
      ? `${userLocation.city}, ${userLocation.regionCode}`
      : userLocation.city
    : undefined;
  setCurrentActiveSession(userId || 'anonymous', formattedLocation, sessionId);

  // Get tools
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionTools: Record<string, any>;
  let toolCount: number;
  let toolLoadMode: string;

  if (USE_TOOL_GATEWAY && toolGateway) {
    const gatewayStart = Date.now();
    sessionTools = toolGateway.getSessionTools();
    toolCount = Object.keys(sessionTools).length;
    toolLoadMode = 'gateway';
    const toolLoadTimeMs = Date.now() - gatewayStart;
    process.stderr.write(
      `[voice-agent-entry] 🎯 Tool Gateway: ${toolCount} tools ready (${toolLoadTimeMs}ms)\n`
    );

    // Recover missing critical tools if needed
    const criticalTools = ['playMusic', 'musicControl', 'rememberAboutUser', 'recallFromMemory'];
    let missingCritical = criticalTools.filter((t) => !toolGateway!.isToolReady(t));

    if (missingCritical.length > 0) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ Missing critical tools: ${missingCritical.join(', ')} - attempting recovery...\n`
      );
      const musicToolsMissing = missingCritical.filter((t) =>
        ['playMusic', 'musicControl', 'musicInfo'].includes(t)
      );
      if (musicToolsMissing.length > 0) {
        try {
          const { getToolDefinitions } = await import('../../tools/domains/entertainment/index.js');
          const { EnvironmentServiceRegistry } = await import('../../tools/registry/types.js');
          const entertainmentDefs = await getToolDefinitions();
          for (const toolId of musicToolsMissing) {
            const toolDef = entertainmentDefs.find((d: { id: string }) => d.id === toolId);
            if (toolDef) {
              const tool = toolDef.create({
                userId: userId || 'anonymous',
                agentId: sessionPersona.id,
                agentDisplayName: sessionPersona.name,
                services: new EnvironmentServiceRegistry(),
              });
              sessionTools[toolId] = tool;
              process.stderr.write(`[voice-agent-entry] ✅ Recovered ${toolId} via direct import\n`);
            }
          }
          toolCount = Object.keys(sessionTools).length;
        } catch (recoveryErr) {
          process.stderr.write(
            `[voice-agent-entry] ❌ Failed to recover music tools: ${recoveryErr}\n`
          );
        }
      }
      missingCritical = criticalTools.filter(
        (t) => !toolGateway!.isToolReady(t) && !sessionTools[t]
      );
      if (missingCritical.length > 0) {
        process.stderr.write(
          `[voice-agent-entry] 🚨 STILL MISSING critical tools: ${missingCritical.join(', ')}\n`
        );
      }
    }
    if (missingCritical.length === 0) {
      process.stderr.write(`[voice-agent-entry] ✅ All critical tools loaded\n`);
    }
  } else {
    const { tools: orchestratorTools, meta: toolsMeta } = await getToolsForAgent({
      persona: { id: sessionPersona.id, displayName: sessionPersona.name },
      userId: userId || 'anonymous',
      userProfile: services.userProfile,
      subscriptionTier,
      initialTranscript: '',
      services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
      userLocation,
      fastPath: true,
      sessionId,
    });
    sessionTools = orchestratorTools;
    toolCount = toolsMeta.toolCount;
    toolLoadMode = toolsMeta.mode;
    process.stderr.write(
      `[voice-agent-entry] Got ${toolCount} tools from ${toolLoadMode} (${toolsMeta.selectionTimeMs}ms)\n`
    );
  }

  // Create agent
  const { FerniAgent } = ferniAgentModule;
  const toolNames = Object.keys(sessionTools || {});
  process.stderr.write(
    `[voice-agent-entry] Creating agent for ${sessionPersona.id} with ${toolCount} tools (${toolLoadMode})\n`
  );
  process.stderr.write(
    `[voice-agent-entry] 🔧 Tool names (ALL ${toolNames.length}): ${toolNames.join(', ')}\n`
  );

  const agent = new FerniAgent(systemPrompt, {
    skipGreeting: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: sessionTools as any,
  });

  // Create VoiceAgentRef for handoff support
  const voiceAgentRef = createLightweightVoiceAgentRef(
    agent as unknown as { _instructions?: string },
    sessionPersona
  );
  process.stderr.write(`[voice-agent-entry] 🎭 VoiceAgentRef created for handoff support\n`);

  // Build tool config
  const { buildToolConfig } = functionCallingModule;
  const emotionAnalysis = userData.lastEmotionAnalysis as { distressLevel?: number } | undefined;
  const isCrisis = emotionAnalysis?.distressLevel
    ? emotionAnalysis.distressLevel > 0.7
    : false;
  const toolConfig = buildToolConfig({ environment: 'production', isCrisis });
  const allowedTools = toolConfig.functionCallingConfig.allowedFunctionNames;
  process.stderr.write(
    `[voice-agent-entry] 🔧 Function calling config: mode=${toolConfig.functionCallingConfig.mode}, isCrisis=${isCrisis}\n`
  );
  process.stderr.write(
    `[voice-agent-entry] 🔧 Allowed tools: ${allowedTools ? allowedTools.join(', ') : 'ALL (no restrictions)'}\n`
  );

  // Get centralized model config
  const geminiConfig = modelConfig.getDefault();

  // =========================================================================
  // CREATE SESSION (Director Mode, Qwen Full Stack, or Standard)
  // =========================================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;
  let directorAudioRouter: AudioRouter | undefined;

  const voiceOptions = {
    allowInterruptions: true,
    minEndpointingDelay: 150,
    maxEndpointingDelay: 450,
    minInterruptionWords: 1,
    minInterruptionDuration: 150,
    preemptiveGeneration: true,
  };

  if (isDirectorModeRequested(roomMetadata)) {
    // Director Mode path
    process.stderr.write(
      `[voice-agent-entry] 🎬 Director Mode enabled - creating Qwen3-Omni RealtimeModel + DirectorEngine\n`
    );
    const useDirectorFullStack =
      process.env.USE_QWEN3_OMNI === 'true' && process.env.USE_QWEN3_OMNI_FULL_STACK !== 'false';
    const sendDataMessageForSession = useDirectorFullStack
      ? async (type: string, payload: Record<string, unknown>) => {
          try {
            const { getFrontendPublisher } = await import('../realtime/index.js');
            const pub = getFrontendPublisher();
            if (pub?.isConnected()) await pub.sendData(type, payload ?? {});
          } catch { /* no-op */ }
        }
      : undefined;
    const directorResult = await createDirectorModeSession({
      sessionId,
      userId: userId ?? 'anonymous',
      directorUserId: userId ?? undefined,
      initialLead: sessionPersona.id as import('../../integrations/qwen3-omni/director/types.js').PersonaId,
      initialCast: [sessionPersona.id as import('../../integrations/qwen3-omni/director/types.js').PersonaId],
      initialMood: 'warm',
      autoDirectorMode: 'autopilot',
      maxEnsembleSize: 4,
      useTtsClient: true,
      sendDataMessage: sendDataMessageForSession,
      services,
    });
    directorAudioRouter = directorResult.audioRouter;
    session = new voice.AgentSession({
      turnDetection: 'realtime_llm',
      vad,
      ...(externalStt && { stt: externalStt }),
      llm: directorResult.realtimeModel,
      tts,
      userData,
      voiceOptions,
    });
    process.stderr.write(
      `[voice-agent-entry] 🎬 Director Mode session created (path=qwen_director${useDirectorFullStack ? '_full_stack' : ''})\n`
    );
  } else {
    // Non-Director: Qwen full stack or ModelProvider (Gemini/OpenAI)
    const useQwenFullStack =
      process.env.USE_QWEN3_OMNI === 'true' && process.env.USE_QWEN3_OMNI_FULL_STACK !== 'false';

    if (useQwenFullStack) {
      // Try Candle NAPI first
      if (isQwen3OmniCandleBackend()) {
        try {
          const { NativeOmniRealtimeModel } = await import(
            '../../integrations/qwen3-omni/adapters/native-omni-adapter.js'
          );
          const { NativeOmniEngine, isNativeOmniAvailable } = await import(
            '../../integrations/qwen3-omni/native-engine.js'
          );
          if (isNativeOmniAvailable()) {
            const testMode = process.env.QWEN3_OMNI_TEST_MODE === 'true';
            const engine = NativeOmniEngine.create({
              testMode,
              modelPath: process.env.QWEN3_OMNI_MODEL_PATH,
              tokenizerPath: process.env.QWEN3_OMNI_TOKENIZER_PATH,
            });
            const model = new NativeOmniRealtimeModel({
              engine,
              inputSampleRate: 48000,
              outputSampleRate: 24000,
              liveKitOutputSampleRate: 48000,
            });
            session = new voice.AgentSession({
              turnDetection: 'realtime_llm', vad,
              ...(externalStt && { stt: externalStt }),
              llm: model, tts, userData, voiceOptions,
            });
            process.stderr.write(`[voice-agent-entry] ✅ Qwen Candle NAPI pipeline (in-process)\n`);
          }
        } catch (e) {
          process.stderr.write(
            `[voice-agent-entry] ⚠️ Candle backend failed, falling back to HTTP: ${String(e)}\n`
          );
        }
      }
      // Qwen full stack (HTTP) fallback
      if (!session) {
        process.stderr.write(
          `[voice-agent-entry] 🚀 Qwen full stack (single-persona SessionManagerRealtimeModel)\n`
        );
        const sendDataMessageForQwen = async (type: string, payload: Record<string, unknown>) => {
          try {
            const { getFrontendPublisher } = await import('../realtime/index.js');
            const pub = getFrontendPublisher();
            if (pub?.isConnected()) await pub.sendData(type, payload ?? {});
          } catch { /* no-op */ }
        };
        const { SessionManagerRealtimeModel } =
          await import('../../integrations/qwen3-omni/adapters/livekit-session-manager-adapter.js');
        const { getQwen3OmniConfig } = await import('../../integrations/qwen3-omni/config.js');
        const { createQwen3OmniClient } = await import('../../integrations/qwen3-omni/client.js');
        const { createMockQwen3OmniClient, isQwen3OmniMockEnabled } =
          await import('../../integrations/qwen3-omni/client-mock.js');
        const omniConfig = getQwen3OmniConfig();
        const client = isQwen3OmniMockEnabled()
          ? (createMockQwen3OmniClient() as unknown as import('../../integrations/qwen3-omni/client.js').Qwen3OmniClient)
          : createQwen3OmniClient();
        const llm = new SessionManagerRealtimeModel({
          sessionId, userId: userId ?? 'anonymous', personaId: sessionPersona.id,
          serverUrl: omniConfig.serverUrl,
          ttsServerUrl: omniConfig.ttsServerUrl ?? omniConfig.serverUrl.replace(':8000', ':8001'),
          services: services ?? {}, sendDataMessage: sendDataMessageForQwen, client,
        });
        session = new voice.AgentSession({
          turnDetection: 'realtime_llm', vad,
          ...(externalStt && { stt: externalStt }),
          llm, tts, userData, voiceOptions,
        });
        process.stderr.write(
          `[voice-agent-entry] ✅ Qwen full stack session created (path=qwen_full_stack, BTH: emotion, personality, quality)\n`
        );
      }
    } else {
      // Standard model provider path (Gemini/OpenAI)
      const pathLabel =
        process.env.USE_QWEN3_OMNI === 'true'
          ? 'qwen_realtime'
          : process.env.USE_OPENAI_REALTIME === 'true'
            ? 'openai_cartesia'
            : 'gemini_cartesia';
      process.stderr.write(
        `[voice-agent-entry] ${modelProvider.getLogPrefix()} Creating LLM model via ${modelProvider.displayName} (path=${pathLabel})...\n`
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const llm: any = await modelProvider.createLLMModel({
        model: geminiConfig.model,
        instructions: modelBaseInstructions,
        temperature: geminiConfig.temperature,
      });

      process.stderr.write(
        `[voice-agent-entry] ${modelProvider.getLogPrefix()} LLM model created (text → Cartesia TTS)\n`
      );

      // Debug: Listen for input audio transcription events
      const llmWithEvents = llm as { on?: (event: string, handler: (event: unknown) => void) => void };
      if (llmWithEvents.on) {
        llmWithEvents.on('input_audio_transcription_completed', (event: unknown) => {
          const transcriptionEvent = event as { transcript?: string };
          process.stderr.write(
            `\n🎤 [GEMINI STT] Input transcribed: "${transcriptionEvent.transcript || '(empty)'}"\n`
          );
        });
      }

      session = new voice.AgentSession({
        turnDetection: modelProvider.getSessionTurnDetection(),
        vad, ...(externalStt && { stt: externalStt }),
        llm, tts, userData, voiceOptions,
      });
    }
  }

  // Add cleanup handler for retry counter WeakMap
  const { clearRetryCounter } = await import('../shared/sanitizer/index.js');
  if (session) {
    cleanupHandlers.push(() => {
      try { clearRetryCounter(session); } catch { /* ignore */ }
    });
  }

  return {
    session,
    agent,
    voiceAgentRef,
    directorAudioRouter,
    toolCount,
    toolLoadMode,
    sessionTools,
  };
}
