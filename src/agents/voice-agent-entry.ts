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
  connectToRoom,
  getCachedVoiceDeps,
  getPrewarmedResources,
  loadPersonaLocally,
  loadVoiceDeps as loadVoiceDepsPhase,
  type VoiceDeps,
} from './voice-agent/phases/index.js';

// Import the full PersonaConfig type for proper type compatibility
import type { PersonaConfig } from '../personas/types.js';

// Import VoiceAgentRef type for handoff support
import type { VoiceAgentRef } from './shared/handoff/types.js';

// Import BundleRuntimeEngine type for bundle state
import type { BundleRuntimeEngine } from '../personas/bundles/runtime.js';

// Centralized model configuration (toggle models via admin UI or model-config.json)
import { modelConfig } from '../services/model-config.js';

// FinOps cost tracking for session economics
import { finops } from '../services/observability/finops.js';

// ============================================================================
// LIGHTWEIGHT VOICE AGENT REF (For Handoff Support)
// ============================================================================

/**
 * Creates a lightweight VoiceAgentRef wrapper for the agent.
 * This enables handoffs to update LLM instructions without the full VoiceAgent class.
 *
 * FIX: Previously getVoiceAgentRef returned null, breaking handoff identity switching.
 * Now we create a proper wrapper that implements the required interface.
 */
function createLightweightVoiceAgentRef(
  agent: { _instructions?: string },
  initialPersona: PersonaConfig
): VoiceAgentRef {
  // Mutable state for the wrapper
  let currentPersona: PersonaConfig = initialPersona;
  let bundleRuntime: BundleRuntimeEngine | undefined;

  return {
    setPersona(persona: unknown): void {
      const p = persona as PersonaConfig;
      currentPersona = p;

      // CRITICAL: Update the agent's instructions for the new persona
      if (p.systemPrompt) {
        agent._instructions = p.systemPrompt;
        process.stderr.write(
          `[voice-agent-entry] 🎭 LLM instructions updated for ${p.name} (${p.systemPrompt.length} chars)\n`
        );
      } else {
        process.stderr.write(`[voice-agent-entry] ⚠️ Persona ${p.name} has no systemPrompt!\n`);
      }
    },

    getPersona(): { id: string } | undefined {
      return currentPersona ? { id: currentPersona.id } : undefined;
    },

    setBundleRuntime(runtime: unknown): void {
      bundleRuntime = runtime as BundleRuntimeEngine;
      process.stderr.write(
        `[voice-agent-entry] 📦 Bundle runtime updated for ${currentPersona?.name}\n`
      );
    },

    getBundleRuntime(): { getState: () => { personaId?: string } } | undefined {
      if (!bundleRuntime) return undefined;
      return {
        getState: () => {
          const state = bundleRuntime?.getState?.();
          return { personaId: state?.personaId };
        },
      };
    },

    // For validation checks
    get instructions(): string | undefined {
      return agent._instructions;
    },
  };
}

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

  // Import crash analytics for session tracking
  const crashAnalyticsModule = await import('./shared/crash-analytics.js');
  const {
    registerSession,
    updateSessionState,
    unregisterSession,
    recordCrash,
    recordConnectionDrop,
    markOperationPending,
  } = crashAnalyticsModule;

  // Register session immediately for crash tracking
  registerSession(sessionId, {
    sessionId,
    roomName,
    userId: undefined, // Will be updated when metadata is parsed
    personaId: undefined, // Will be updated when persona is loaded
  });

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

    // Build persona name from ID if needed
    const personaName = personaId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Default communication config for greeting generation
    const defaultCommunication = {
      greetingStyle: 'warm-friend' as const,
      returningUserStyle: 'warm-friend' as const,
      formalityLevel: 0.3,
      thinkingPhrases: ['Let me think about that...', 'Hmm...'],
      listeningCues: ['I hear you', 'Go on...'],
      backchannels: { neutral: ['mm-hmm'], engaged: ['right'], empathetic: ['I understand'] },
      silenceFillers: {
        early: ['Take your time'],
        mid: ["I'm here"],
        late: ["Whenever you're ready"],
      },
      selfCorrections: ['Actually, let me rephrase that...'],
      trailingOffs: ['You know...'],
      interruptionRecoveries: ['Sorry, go ahead'],
      humilityPhrases: ['I could be wrong, but...'],
      emotionalExpressions: {
        laughter: ['haha'],
        surprise: ['Oh!'],
        concern: ['Oh no...'],
        joy: ["That's wonderful!"],
        empathy: ['I understand...'],
      },
    };

    // Default identity config for greeting generation
    const defaultIdentity = {
      selfReference: personaName,
      coreValues: ['empathy', 'growth', 'authenticity'],
      role: 'life coach',
      priorities: ['user wellbeing', 'genuine connection'],
      desiredUserExperience: 'feeling heard and supported',
    };

    // Build fallback persona with all required fields
    // NOTE: This is only used when the persona bundle fails to load
    // In normal operation, personas come from the registry with full configs
    const fallbackPersona: PersonaConfig = {
      id: personaId,
      name: personaName,
      description: `${personaName} is a warm and supportive life coach.`,
      voice: { voiceId: defaultVoice.voiceId, provider: 'cartesia' as const },
      systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
      personality: {
        warmth: 0.7,
        humorLevel: 0.4,
        humorStyle: ['observational', 'self-deprecating'],
        directness: 0.6,
        energy: 0.6,
        tangentFrequency: 0.3,
        traits: ['empathetic', 'supportive', 'curious'],
        boundaries: ['Never give medical/legal/financial advice'],
      },
      speechCharacteristics: {
        baseSpeedMultiplier: 1.0,
        pauseMultiplier: 1.0,
        speedVariation: 0.15,
        thinkingSoundFrequency: 0.4,
        emphasisStyle: 'moderate',
        sentenceEndingStyle: 'natural',
        minimumEnergy: 0.8,
        maximumEnergy: 1.1,
      },
      communication: defaultCommunication,
      identity: defaultIdentity,
      knowledge: {
        domains: ['life-coaching', 'personal-growth'],
        qualifiedTopics: [
          'goal-setting',
          'habits',
          'motivation',
          'relationships',
          'work-life-balance',
        ],
        outOfScopeTopics: ['medical-diagnosis', 'legal-advice', 'financial-advice'],
        outOfScopeResponse:
          "That's outside my expertise. I'd recommend speaking with a qualified professional for that.",
      },
    };

    // Use provided persona or fallback, ensuring required fields are present
    const sessionPersona: PersonaConfig = persona
      ? {
          ...fallbackPersona, // Defaults
          ...persona, // Override with actual persona
          // Ensure critical nested objects exist
          communication: persona.communication ?? defaultCommunication,
          identity: persona.identity ?? defaultIdentity,
          knowledge: persona.knowledge ?? fallbackPersona.knowledge,
        }
      : fallbackPersona;

    // ✅ FULL RICH PROMPT - Load persona-specific system prompt from bundles
    // Uses loadSystemPrompt() which handles all personas (ferni, maya-santos, alex-chen, etc.)
    const { loadSystemPrompt } = await import('./personas/prompt-loader.js');
    const systemPrompt = await loadSystemPrompt(sessionPersona.id);

    // DISABLED: Thought signature protocol was potentially confusing Gemini Realtime
    // Google's examples don't put tool instructions in system prompt - they let tool definitions handle it
    // If tool calling is unreliable, this might be why
    // const { getThoughtSignatureProtocol } = await import('../tools/utils/function-calling-config.js');
    // const thoughtProtocol = getThoughtSignatureProtocol(sessionPersona.id);
    // systemPrompt = `${systemPrompt}\n\n${thoughtProtocol}`;

    process.stderr.write(
      `[voice-agent-entry] Using RICH prompt + thought protocol (${systemPrompt.length} chars, ~${Math.round(systemPrompt.length / 4)} tokens) 🎉\n`
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

    // Update crash analytics with user context
    updateSessionState(sessionId, {
      state: 'active',
    });
    // Store userId/personaId for crash context (these are simple values, not SessionSnapshot fields)
    registerSession(sessionId, {
      sessionId,
      roomName,
      userId: userId || undefined,
      personaId: sessionPersona.id,
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

    // Start FinOps cost tracking for this session
    // Determine tier from user profile subscription
    const userSubTier = services.userProfile?.subscription?.tier || 'free';
    const finopsTier =
      userSubTier === 'partner' ? 'partner' : userSubTier === 'friend' ? 'friend' : 'free';
    finops.startSession({
      sessionId,
      userId,
      tier: finopsTier,
    });
    process.stderr.write(`[voice-agent-entry] FinOps tracking started (tier: ${finopsTier})\n`);

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
    // PERFORMANCE OPTIMIZATIONS: Initialize scaling systems for this session
    // Enables: Pub/Sub offloading, batched LLM analysis, parallel memory search,
    // context caching, speculative TTS, and turn profiling
    // =========================================================================
    const enablePubSub = process.env.PUBSUB_ENABLED === 'true';
    try {
      const perfModule = await import('./shared/performance/index.js');
      await perfModule.initializePerformanceOptimizations({
        userId: userId || 'anonymous',
        personaId,
        sessionId,
        enablePubSub,
        enableSpeculativeTTS: true,
        // 🚨 DISABLED: batchedAnalysis makes redundant LLM calls per turn
        // The turn processor already does emotion/intent detection
        // This was doubling API costs! Re-enable only if you need it for specific analytics.
        enableBatchedAnalysis: false,
        enableParallelMemory: true,
        enableContextCache: true,
        enableProfiling: true,
      });
      process.stderr.write(
        `[voice-agent-entry] 🚀 Performance optimizations initialized (pubsub: ${enablePubSub})\n`
      );

      // Add cleanup handler for performance system
      cleanupHandlers.push(async () => {
        try {
          // Log performance summary before reset
          const summary = await perfModule.getPerformanceSummary();
          if (summary) {
            process.stderr.write(
              `[voice-agent-entry] 📊 Performance summary: ${JSON.stringify(summary.turnProfiling || {})}\n`
            );
          }
          perfModule.resetPerformanceOptimizations();
        } catch {
          /* ignore cleanup errors */
        }
      });
    } catch (perfErr) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ Performance optimizations failed (non-fatal): ${perfErr}\n`
      );
    }

    // =========================================================================
    // STEP 5: CREATE SESSION
    // =========================================================================
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();

    // Load external VAD for user activity detection
    // Note: Gemini also has built-in turn detection, but we need VAD for DJ Booth etc.
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
        const { getLocalizedVoiceId } =
          await import('../services/voice/cartesia-voice-localization.js');
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

    // Create FerniAgent with ORCHESTRATOR-selected tools (not legacy 89 tools)
    process.stderr.write(`[voice-agent-entry] Getting tools from orchestrator...\n`);

    // Import and use the tool orchestrator
    const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
      await import('../tools/orchestrator/voice-agent-integration.js');

    // Initialize orchestrator if not already done
    if (!isOrchestratorInitialized()) {
      try {
        await initializeToolOrchestrator();
      } catch (orchErr) {
        process.stderr.write(
          `[voice-agent-entry] Orchestrator init failed (will use legacy): ${orchErr}\n`
        );
      }
    }

    // Get tools from orchestrator
    const subscriptionTier =
      (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
    const { tools: orchestratorTools, meta: toolsMeta } = await getToolsForAgent({
      persona: { id: sessionPersona.id, displayName: sessionPersona.name },
      userId: userId || 'anonymous',
      userProfile: services.userProfile,
      subscriptionTier,
      initialTranscript: '', // Session start - no transcript yet
      // Pass services for dev mode bypass (synced from frontend dev panel via data channel)
      services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
    });

    process.stderr.write(
      `[voice-agent-entry] Got ${toolsMeta.toolCount} tools from ${toolsMeta.mode} (${toolsMeta.selectionTimeMs}ms)\n`
    );

    // Create agent with persona-specific system prompt and orchestrator-selected tools
    // NOTE: FerniAgent is the main agent class used for ALL personas. The persona identity
    // comes from the system prompt (loaded above via loadSystemPrompt), not the class name.
    const { FerniAgent } = await import('./personas/ferni-agent.js');

    // DEBUG: Log tools being passed to agent
    const toolNames = Object.keys(orchestratorTools || {});
    process.stderr.write(
      `[voice-agent-entry] Creating agent for ${sessionPersona.id} with ${toolsMeta.toolCount} orchestrator tools\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔧 Tool names: ${toolNames.slice(0, 10).join(', ')}${toolNames.length > 10 ? ` ... and ${toolNames.length - 10} more` : ''}\n`
    );

    const agent = new FerniAgent(systemPrompt, {
      skipGreeting: true, // Greeting handled by generateAndSpeakGreeting below
      tools: orchestratorTools, // Use orchestrator-selected tools
    });

    // FIX: Create lightweight VoiceAgentRef for handoff support
    // This enables LLM instruction updates during persona handoffs
    // NOTE: Cast needed to access internal _instructions property (not in public API)
    // The LiveKit SDK doesn't expose a setInstructions() method, so we access it directly
    const voiceAgentRef = createLightweightVoiceAgentRef(
      agent as unknown as { _instructions?: string },
      sessionPersona
    );
    process.stderr.write(`[voice-agent-entry] 🎭 VoiceAgentRef created for handoff support\n`);

    // Agent owns instructions and tools - don't duplicate instructions on RealtimeModel
    // Import function calling config following Vertex AI best practices
    const { buildToolConfig } = await import('../tools/utils/function-calling-config.js');

    // Build tool config based on context (crisis mode, new user, etc.)
    const _isNewUser = !services.userProfile || (services.userProfile.totalConversations ?? 0) < 3;
    const isCrisis = userData.lastEmotionAnalysis?.distressLevel
      ? userData.lastEmotionAnalysis.distressLevel > 0.7
      : false;

    const toolConfig = buildToolConfig({
      environment: 'production',
      // TEMPORARILY DISABLED: isNewUser restrictions were limiting tools too aggressively
      // isNewUser,
      isCrisis,
    });

    const allowedTools = toolConfig.functionCallingConfig.allowedFunctionNames;
    process.stderr.write(
      `[voice-agent-entry] 🔧 Function calling config: mode=${toolConfig.functionCallingConfig.mode}, isCrisis=${isCrisis}\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔧 Allowed tools: ${allowedTools ? allowedTools.join(', ') : 'ALL (no restrictions)'}\n`
    );

    // Get centralized model config (toggle via admin UI or model-config.json)
    const geminiConfig = modelConfig.getDefault();
    process.stderr.write(`[voice-agent-entry] 🤖 Using model: ${geminiConfig.model}\n`);

    session = new voice.AgentSession({
      vad,
      llm: new google.beta.realtime.RealtimeModel({
        model: geminiConfig.model,
        modalities: [genai.Modality.TEXT],
        temperature: geminiConfig.temperature,
        language: geminiConfig.language,
        // PATCHED: toolChoice triggers function calling mode via our SDK patch
        // 'auto' = Gemini decides, 'required' = force function call
        // @see docs/LIVEKIT-SDK-PATCH.md
        // NOTE: 'required' didn't help - Gemini still narrates tool calls
        // This is a known Gemini Live API bug. Workaround is in tool-call-sanitizer.ts
        toolChoice: 'auto',
        // Enable Google Search as a built-in Gemini tool for real-time information
        // NOTE: geminiTools gets merged into the tools config sent to Gemini Live API
        // @see https://ai.google.dev/gemini-api/docs/live-tools#google-search
        geminiTools: { googleSearch: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
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
      { createEventHandler }, // NEW: Uses coordinator-based handoff system
      { registerCameoHandlers },
      { generateAndSpeakGreeting },
      { handleSessionCleanup },
    ] = await Promise.all([
      import('./voice-agent/music-handler.js'),
      import('./voice-agent/data-channel-handler.js'),
      import('./voice-agent/transcript-handler.js'),
      import('./voice-agent/session-state-handler.js'),
      import('./voice-agent/tool-tracking-handler.js'),
      import('./shared/handoff/event-handler.js'), // NEW: Coordinator-based
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

    // =========================================================================
    // PRE-SESSION BRIEFING - Make Ferni aware of time, date, context
    // GUARANTEE: Agent ALWAYS gets datetime awareness, even if full briefing fails
    // =========================================================================
    try {
      const { generatePreSessionBriefing } = await import('../services/pre-session-briefing.js');
      const briefing = await generatePreSessionBriefing(userId, {
        name: userData.userName || userData.name,
        lastConversation: userData.lastConversationDate
          ? new Date(userData.lastConversationDate)
          : undefined,
      });
      // Store formatted briefing for context injection
      userData.preSessionBriefing = briefing.formatted;
      process.stderr.write(
        `[voice-agent-entry] 📋 Pre-session briefing generated (${briefing.temporal.timeOfDay}, ${briefing.cultural.season})\n`
      );
    } catch (briefingErr) {
      // FALLBACK: Generate minimal datetime awareness so agent is NEVER unaware of time
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      userData.preSessionBriefing = `[YOUR AWARENESS - ${dateStr}]\nIt's ${timeStr}.\nUse this awareness naturally - don't announce it, just BE present in the moment.`;
      process.stderr.write(
        `[voice-agent-entry] Pre-session briefing failed, using fallback datetime: ${String(briefingErr)}\n`
      );
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
      sessionId,
      userData,
    });
    cleanupHandlers.push(musicResult.clearTimers);
    process.stderr.write(
      `[voice-agent-entry] 🎵 Music handler initialized: ${musicResult.initialized}\n`
    );

    // =========================================================================
    // CONNECTION TYPE DETECTION & KRISP NOISE CANCELLATION
    // =========================================================================
    const jobMetadata = ctx.job?.metadata || '';
    const isWebConnection = jobMetadata.includes('"source":"web"');
    const isPhoneCall =
      !isWebConnection &&
      (participant?.identity?.includes('phone') ||
        participant?.identity?.includes('sip') ||
        jobMetadata.includes('"source":"phone"'));

    // Enable Krisp-powered noise cancellation for ALL connections (web + phone)
    // This dramatically improves STT accuracy by removing background noise
    // @see https://docs.livekit.io/agents/noise-cancellation/
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inputOptions: any = undefined;
    try {
      const noiseCancellation = await import('@livekit/noise-cancellation-node');
      if (isPhoneCall) {
        // Phone calls: Use telephony-optimized noise cancellation
        inputOptions = {
          noiseCancellation: noiseCancellation.TelephonyBackgroundVoiceCancellation(),
        };
        process.stderr.write(
          `[voice-agent-entry] 📞 Phone call - telephony noise cancellation enabled\n`
        );
      } else {
        // Web connections: Use Krisp BVC (Background Voice Cancellation)
        // This is the BEST option for web - removes AC, fans, keyboard, etc.
        inputOptions = { noiseCancellation: noiseCancellation.BackgroundVoiceCancellation() };
        process.stderr.write(
          `[voice-agent-entry] 🔇 Web connection - Krisp BVC noise cancellation enabled\n`
        );
      }
    } catch (err) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Noise cancellation not available: ${err}\n`);
    }

    await session.start({ agent, room: ctx.room, inputOptions });
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(
      `[voice-agent-entry] Session started! (isPhone: ${isPhoneCall}, isWeb: ${isWebConnection})\n`
    );

    // DEBUG: Verify tools are registered with the agent
    // NOTE: Cast needed to access internal _tools property (not in public API)
    // This is only for debug logging - production code doesn't depend on it
    const agentTools = (agent as unknown as { _tools?: Record<string, unknown> })?._tools;
    const registeredToolCount = agentTools ? Object.keys(agentTools).length : 0;
    process.stderr.write(
      `[voice-agent-entry] ✅ Agent registered with ${registeredToolCount} tools\n`
    );

    // =========================================================================
    // DEBUG LOGGING (disabled in production for performance)
    // Set DEBUG_VOICE_AGENT=true to enable verbose logging
    // =========================================================================
    const debugEnabled = process.env.DEBUG_VOICE_AGENT === 'true';

    if (debugEnabled) {
      process.stderr.write(`[voice-agent-entry] 🔍 Debug logging ENABLED\n`);

      // Hook into function calls collected (before execution)
      const fnCallsHandler = (event: unknown) => {
        const eventData = event as { calls?: Array<{ name: string }> };
        const callNames = eventData?.calls?.map((c) => c.name).join(', ') || 'unknown';
        process.stderr.write(`📥 [FUNCTION CALLS] ${callNames}\n`);
      };
      session.on('function_calls_collected' as Parameters<typeof session.on>[0], fnCallsHandler);
      cleanupTracker.register('event', 'function_calls_collected handler', () => {
        session.off?.('function_calls_collected', fnCallsHandler);
      });
    }

    // TOOL TRACKING HANDLER
    // Create sendDataMessage helper for behavior signal emission
    const sendDataMessage = async (
      type: string,
      payload: Record<string, unknown>
    ): Promise<void> => {
      try {
        const message = JSON.stringify({ type, ...payload });
        const data = new TextEncoder().encode(message);
        await ctx.room.localParticipant?.publishData(data, { reliable: true });
      } catch {
        // Non-critical - silently ignore errors
      }
    };

    setupToolTrackingHandler({
      session,
      userData,
      services,
      sessionPersona: sessionPersona,
      sessionId,
      debugEnabled: true,
      // 🔄 BEHAVIOR SIGNAL INTEGRATION: Pass sendDataMessage for frontend signaling
      sendDataMessage,
    });

    // SESSION STATE HANDLERS (silence detection, engagement, idle timeout)
    const { silenceContext } = setupSessionStateHandlers({
      session,
      sessionPersona: sessionPersona,
      conversationManager,
      userData,
      sessionId,
      // Idle timeout callback - disconnect after extended silence
      onIdleTimeout: async () => {
        process.stderr.write(`[voice-agent-entry] ⏰ Idle timeout - disconnecting session ${sessionId}\n`);
        try {
          // Signal frontend that we're disconnecting due to idle
          const { sendFrontendSignal } = await import('../services/frontend-signal.js');
          await sendFrontendSignal('conversation_end', {
            reason: 'idle_timeout',
            disconnectDelay: 0, // Disconnect immediately after TTS finishes
            timestamp: Date.now(),
          });
        } catch {
          // Non-critical - still disconnect
        }
        try {
          // Disconnect the room
          if (ctx.room.isConnected) {
            await ctx.room.disconnect();
          }
        } catch (disconnectErr) {
          process.stderr.write(`[voice-agent-entry] ⚠️ Error disconnecting: ${disconnectErr}\n`);
        }
      },
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
      const evt = event as { transcript?: string; isFinal?: boolean };
      if (evt.isFinal) {
        process.stderr.write(`\n[STT] FINAL: "${evt.transcript}"\n`);

        // FinOps: Estimate STT duration from word count (~150 WPM average)
        // This is an approximation; actual duration would require audio timestamps
        if (evt.transcript) {
          const wordCount = evt.transcript.split(/\s+/).filter((w) => w.length > 0).length;
          const estimatedDurationSeconds = (wordCount / 150) * 60; // 150 WPM = 2.5 words/sec
          finops.recordSTTCost({
            durationSeconds: Math.max(1, estimatedDurationSeconds), // Minimum 1 second
            userId,
            sessionId,
          });
        }
      } else if (evt.transcript && evt.transcript.length > 5) {
        process.stderr.write(`[STT] partial: "${evt.transcript}"\n`);
      }
      transcriptHandler.handler(
        event as import('./voice-agent/transcript-handler.js').TranscriptEvent
      );
    });

    // HANDOFF HANDLER
    // NEW: Coordinator-based handoff handler with intelligent banter
    const eventHandlerResult = createEventHandler({
      ctx,
      session,
      tts: session.tts as { switchVoice?: (name: string, id: string) => void },
      services,
      userData,
      getVoiceAgentRef: () => voiceAgentRef as { setPersona: (personaId: string, instructions: string) => void } | null,
      sessionId, // CRITICAL: Must match data-channel-handler's sessionId
    });
    cleanupTracker.register('event', 'handoffEvents.voiceSwitch', eventHandlerResult.cleanup);

    // CAMEO HANDLERS
    // FIX: Now using voiceAgentRef to enable LLM instruction updates during cameos
    try {
      const cleanupCameoHandlers = await registerCameoHandlers({
        ctx,
        session,
        tts: session.tts as { switchVoice?: (name: string, id: string) => void },
        hostPersonaId: sessionPersona.id,
        hostVoiceId: sessionPersona.voice.voiceId,
        getVoiceAgentRef: () =>
          voiceAgentRef as unknown as import('./shared/cameo-handler.js').CameoVoiceAgentRef,
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
    // FIX BUG: Pass voiceAgentRef so UI-initiated handoffs can update LLM instructions
    // Without this, clicking a persona in the UI changes the voice but keeps the LLM identity!
    const dataChannelResult = setupDataChannelHandler({
      room: ctx.room,
      ctx, // Pass JobContext for coordinator adapter fallback creation
      session,
      services,
      sessionPersona,
      userId,
      sessionId,
      voiceAgentRef,
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
      const conversationSession = await initConversationSession({
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
        // Pass userProfile for superhuman memory callbacks (birthdays, growth celebrations, etc.)
        userProfile: services.userProfile
          ? { humanMemory: services.userProfile.humanMemory }
          : undefined,
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

    // Wait for disconnect - capture the reason for crash analytics
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', (reason?: unknown) => {
        const disconnectReason = String(reason || 'unknown');
        const sessionDurationMs = Date.now() - startTime;
        process.stderr.write(
          `[voice-agent-entry] 🔌 Disconnected (reason: ${disconnectReason}, duration: ${sessionDurationMs}ms)\n`
        );

        // 🚨 CRASH-ANALYTICS: Log disconnect with full context
        void (async () => {
          try {
            const { recordConnectionDrop } = await import('./shared/crash-analytics.js');
            // Determine if this was a graceful disconnect
            const isGraceful =
              disconnectReason === 'client_left' || disconnectReason === 'participant_left';
            recordConnectionDrop(sessionId, disconnectReason, isGraceful);
          } catch (e) {
            process.stderr.write(`[voice-agent-entry] Failed to capture disconnect event: ${e}\n`);
          }
        })();

        resolve();
      });
    });

    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);

    // End FinOps cost tracking and record final costs
    const sessionDurationMs = Date.now() - startTime;
    const sessionDurationMinutes = sessionDurationMs / 60000;
    finops.recordLiveKitCost({
      durationMinutes: sessionDurationMinutes,
      userId,
      sessionId,
      tier: finopsTier,
    });
    const finopsSession = finops.endSession(sessionId);
    if (finopsSession) {
      process.stderr.write(
        `[voice-agent-entry] 💰 FinOps: Session cost $${finopsSession.totalCost.toFixed(4)} (${sessionDurationMinutes.toFixed(1)} min, tier: ${finopsSession.tier})\n`
      );
    }

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
      handoffHandler: eventHandlerResult.handler,
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

    // Unregister session from crash analytics (clean exit)
    unregisterSession(sessionId, 'clean_exit');
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Record crash in crash analytics
    recordCrash('uncaught_exception', errObj, sessionId, {
      roomName,
      connectionState: currentPhase,
    });

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

    // Unregister session from crash analytics (crash exit)
    unregisterSession(sessionId, `crash_in_${currentPhase}`);
  }
}
