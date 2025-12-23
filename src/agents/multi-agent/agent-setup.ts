/**
 * Agent Setup Module
 *
 * Provides reusable setup functions for creating fully-featured persona agents.
 * Each agent gets its own Gemini session, TTS, handlers, and tools.
 *
 * This is the core of the multi-agent architecture - it ensures each persona
 * agent has all the capabilities needed for a full conversation.
 *
 * HANDLERS INCLUDED:
 * - Transcript handler (turn processing, emotion detection)
 * - Session state handlers (silence detection, engagement)
 * - Tool tracking handler (monitoring)
 * - Music handler (playback control)
 *
 * @module agents/multi-agent/agent-setup
 */

import * as genai from '@google/genai';
import { voice, type JobContext } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as openai from '@livekit/agents-plugin-openai';
import type { Room } from '@livekit/rtc-node';

/**
 * OpenAI Realtime mode: Use OpenAI's Realtime API instead of Gemini Live.
 * OpenAI Realtime has NATIVE function calling - no JSON workarounds needed!
 */
const USE_OPENAI_REALTIME = process.env.USE_OPENAI_REALTIME === 'true';
import type { PersonaConfig } from '../../personas/types.js';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { modelConfig } from '../../services/model-config.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { UserData } from '../shared/types.js';
// FIX: Import speech cleanup to prevent memory leaks on agent cleanup
import { cleanupSpeechSession } from '../../speech/session-cleanup.js';
// FIX: Import retry counter cleanup for WeakMap session GC
import { clearRetryCounter } from '../shared/tool-call-sanitizer.js';
// Speech coordination for centralized speech management
import {
  coordinatedSay,
  initializeSpeechCoordination,
  cleanupSpeechCoordination,
} from '../../speech/coordination/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for setting up a persona agent.
 */
export interface AgentSetupConfig {
  /** Persona configuration */
  persona: PersonaConfig;
  /** LiveKit job context */
  ctx: JobContext;
  /** LiveKit room */
  room: Room;
  /** Session services (DI container) */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Is this a handoff (not initial connection)? */
  isHandoff?: boolean;
  /** Previous persona (for handoff context) */
  previousPersonaId?: string;
  /** Conversation summary from previous agent */
  conversationSummary?: string;
  /** Recent messages for context */
  recentMessages?: string[];
  /** Conversation manager for tracking state */
  conversationManager?: ConversationManager;
  /** Enable full handlers (music, transcript, etc.) */
  enableFullHandlers?: boolean;
}

/**
 * Result of setting up a persona agent.
 */
export interface AgentSetupResult {
  /** The voice session */
  session: voice.AgentSession<UserData>;
  /** The agent wrapper */
  agent: voice.Agent<UserData>;
  /** TTS engine */
  tts: Awaited<ReturnType<typeof createPersonaTTS>>;
  /** Cleanup function (cleans up all handlers) */
  cleanup: () => Promise<void>;
  /** Function to make agent speak */
  say: (text: string, options?: { allowInterruptions?: boolean }) => void;
  /** Handlers status */
  handlers: {
    transcript: boolean;
    sessionState: boolean;
    toolTracking: boolean;
    music: boolean;
  };
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

/**
 * Set up a fully-featured persona agent.
 *
 * This creates:
 * - Gemini session with persona's system prompt
 * - Cartesia TTS with persona's voice
 * - All necessary handlers (when enableFullHandlers=true):
 *   - Transcript handler (turn processing, emotion detection)
 *   - Session state handlers (silence detection, engagement)
 *   - Tool tracking handler
 *   - Music handler
 *
 * @param config - Setup configuration
 * @returns The configured agent components
 */
export async function setupPersonaAgent(config: AgentSetupConfig): Promise<AgentSetupResult> {
  const {
    persona,
    userData,
    sessionId,
    isHandoff,
    previousPersonaId,
    room,
    services,
    userId,
    conversationManager,
    enableFullHandlers = true, // Default to enabling all handlers
  } = config;

  log.info(
    { personaId: persona.id, sessionId, isHandoff, enableFullHandlers },
    '🎭 Setting up persona agent'
  );

  const setupStart = Date.now();
  const cleanupFunctions: Array<() => void | Promise<void>> = [];

  // =========================================================================
  // BUILD SYSTEM PROMPT (Using proper prompt loader for function-calling!)
  // FIX: Previously used buildAgentSystemPrompt which missed function-calling instructions
  // =========================================================================
  let systemPrompt: string;
  try {
    const { loadSystemPrompt } = await import('../personas/prompt-loader.js');
    systemPrompt = await loadSystemPrompt(persona.id);
    log.info({ personaId: persona.id }, '🎭 Loaded full system prompt with function-calling');
  } catch (promptErr) {
    log.warn(
      { error: String(promptErr), personaId: persona.id },
      '⚠️ Failed to load full prompt, using fallback'
    );
    systemPrompt = buildAgentSystemPrompt(config);
  }

  // Add handoff context if this is a handoff
  if (isHandoff && previousPersonaId) {
    const handoffContext = buildHandoffContext(config);
    if (handoffContext) {
      systemPrompt = `${systemPrompt}\n\n${handoffContext}`;
    }
  }

  // Create TTS with persona's voice (async)
  const tts = await createPersonaTTS(persona.id);

  // =========================================================================
  // GET TOOLS FROM ORCHESTRATOR (Critical for music, memory, etc.)
  // =========================================================================
  let orchestratorTools: Record<string, unknown> = {};
  try {
    const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
      await import('../../tools/orchestrator/voice-agent-integration.js');

    // Initialize orchestrator if needed
    if (!isOrchestratorInitialized()) {
      await initializeToolOrchestrator();
    }

    // Get tools for this persona
    const subscriptionTier =
      (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
    const { tools, meta } = await getToolsForAgent({
      persona: { id: persona.id, displayName: persona.name },
      userId: userId || 'anonymous',
      userProfile: services.userProfile,
      subscriptionTier,
      initialTranscript: '',
      services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
    });

    orchestratorTools = tools;
    log.info(
      { personaId: persona.id, toolCount: meta.toolCount, mode: meta.mode },
      '🎭 Tools loaded for multi-agent persona'
    );
  } catch (toolErr) {
    log.warn(
      { error: String(toolErr), personaId: persona.id },
      '⚠️ Failed to load tools for multi-agent persona (will have no tools)'
    );
  }

  // =========================================================================
  // LLM SELECTION: OpenAI Realtime vs Gemini Live
  // =========================================================================
  const geminiConfig = modelConfig.getDefault();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let llmModel: any;

  if (USE_OPENAI_REALTIME) {
    // =====================================================================
    // OpenAI Realtime API - Native function calling, no JSON workarounds!
    // Using text-only mode so Cartesia TTS handles the persona voice.
    // =====================================================================
    log.info(
      { personaId: persona.id },
      '🔮 Creating OpenAI Realtime model for multi-agent (text-only → Cartesia TTS)'
    );

    // OpenAI Realtime with text-only mode → Cartesia TTS for persona voice
    // Docs: https://docs.livekit.io/agents/models/realtime/plugins/openai/#separate-tts
    // Upgraded SDK to 1.0.30 which has modalities fix
    llmModel = new openai.realtime.RealtimeModel({
      modalities: ['text'], // Text-only mode - Cartesia TTS handles persona voice
      temperature: Math.max(0.6, geminiConfig.temperature), // OpenAI min is 0.6
      turnDetection: {
        type: 'server_vad', // Using server_vad per docs (more stable)
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
        interrupt_response: true,
      },
    });

    log.info(
      { personaId: persona.id, modalities: ['text'], tts: 'cartesia' },
      '🔮 OpenAI Realtime model created (text → Cartesia TTS)'
    );
  } else {
    // =====================================================================
    // Gemini Live API (default)
    // =====================================================================
    // CRITICAL: modalities: TEXT ensures Gemini outputs text (not audio directly)
    // This text then goes through our Cartesia TTS with the persona's voice.
    // Without this, Gemini outputs audio with its default male voice!

    // Debug: Log what we're passing to RealtimeModel
    log.info(
      {
        personaId: persona.id,
        modalitiesValue: genai.Modality.TEXT,
        modalitiesArray: [genai.Modality.TEXT],
      },
      '🎭 Creating RealtimeModel with modalities'
    );

    // NOTE: Do NOT pass instructions to RealtimeModel!
    // In single-agent mode (which works), instructions go ONLY to the Agent, not the LLM.
    // Passing instructions to both causes the wrong voice - possibly because Gemini
    // interprets system instructions differently when they're on the model vs agent.
    const realtimeModelOptions = {
      model: geminiConfig.model,
      modalities: [genai.Modality.TEXT], // Output text → Cartesia TTS (persona voice)
      temperature: geminiConfig.temperature,
      // instructions: systemPrompt,  // ← REMOVED: Goes on Agent only (matches voice-agent-entry.ts)
      language: geminiConfig.language,
      toolChoice: 'auto',
      geminiTools: { googleSearch: {} },
    };

    // Debug: Log the full RealtimeModel options
    log.info(
      {
        personaId: persona.id,
        options: {
          model: realtimeModelOptions.model,
          modalities: realtimeModelOptions.modalities,
          // Note: instructions are passed to Agent, not RealtimeModel
        },
      },
      '🎭 RealtimeModel options BEFORE creation'
    );

    llmModel = new google.beta.realtime.RealtimeModel(realtimeModelOptions as any);

    // Try to access internal _options to verify
    const internalOptions = (llmModel as unknown as { _options?: Record<string, unknown> })
      ._options;
    if (internalOptions) {
      log.info(
        {
          personaId: persona.id,
          responseModalities: internalOptions.responseModalities,
          audioOutput: (llmModel as unknown as { capabilities?: { audioOutput?: boolean } })
            .capabilities?.audioOutput,
        },
        '🎭 RealtimeModel internal options AFTER creation'
      );
    }
  }

  // Create voice session
  // Turn detection: OpenAI uses its model config, Gemini uses 'realtime_llm'
  // TTS: OpenAI text-only mode uses Cartesia TTS for persona voice
  const session = new voice.AgentSession<UserData>({
    turnDetection: USE_OPENAI_REALTIME ? undefined : 'realtime_llm',
    llm: llmModel,
    tts, // Cartesia TTS for both (OpenAI text-only mode outputs text)
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

  // Create agent wrapper WITH TOOLS using FerniAgent (has ttsNode override for JSON sanitizer)
  // FIX: Previously used voice.Agent which BYPASSED the JSON function call sanitizer!
  // FerniAgent's ttsNode override filters {"fn":"startGame","args":{}} before TTS speaks it.
  const { FerniAgent } = await import('../personas/ferni-agent.js');

  const agent = new FerniAgent(systemPrompt, {
    tools: orchestratorTools as any, // Type mismatch: ToolSet vs Record<string, unknown>
    // CRITICAL: Skip FerniAgent's built-in greeting which uses generateReply() without
    // function-calling instructions. This can confuse the model and break tool calls.
    // The model will greet naturally based on its system prompt.
    skipGreeting: true,
  }) as unknown as voice.Agent<UserData>; // Type cast needed - FerniAgent uses compatible session data

  // Track handler status
  const handlersStatus = {
    transcript: false,
    sessionState: false,
    toolTracking: false,
    music: false,
  };

  // =========================================================================
  // WIRE UP HANDLERS (when enabled)
  // =========================================================================
  if (enableFullHandlers) {
    try {
      // Import handlers dynamically to avoid circular deps
      const [
        { createTranscriptHandler },
        { setupSessionStateHandlers },
        { setupToolTrackingHandler },
        { setupMusicHandler },
      ] = await Promise.all([
        import('../voice-agent/transcript-handler.js'),
        import('../voice-agent/session-state-handler.js'),
        import('../voice-agent/tool-tracking-handler.js'),
        import('../voice-agent/music-handler.js'),
      ]);

      // Create sendDataMessage helper for frontend signaling
      const sendDataMessage = async (
        type: string,
        payload: Record<string, unknown>
      ): Promise<void> => {
        try {
          const message = JSON.stringify({ type, ...payload });
          const data = new TextEncoder().encode(message);
          await room.localParticipant?.publishData(data, { reliable: true });
        } catch {
          // Non-critical - silently ignore errors
        }
      };

      // TRANSCRIPT HANDLER
      if (conversationManager) {
        // Create silence context with required fields
        const silenceContext = {
          silenceDurationSeconds: 0,
          turnCount: 0,
          topicsDiscussed: [] as string[],
          memorableMoments: [] as string[],
          lastUserMessage: undefined as string | undefined,
        };

        // Import dynamic tool loader
        const { dynamicToolLoader } = await import('../../tools/dynamic-loader.js');
        const { autoOptimizer } = await import('../../tools/auto-optimizer.js');

        const transcriptHandler = createTranscriptHandler({
          room,
          session,
          services,
          sessionPersona: persona,
          conversationManager,
          voiceHumanization: null,
          userData,
          userId,
          sessionId,
          silenceContext,
          dynamicToolLoader,
          autoOptimizer,
        });

        // Wire transcript events
        const transcriptEventHandler = (event: unknown) => {
          transcriptHandler.handler(
            event as import('../voice-agent/transcript-handler.js').TranscriptEvent
          );
        };
        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, transcriptEventHandler);
        cleanupFunctions.push(() => {
          session.off?.(voice.AgentSessionEventTypes.UserInputTranscribed, transcriptEventHandler);
        });
        handlersStatus.transcript = true;
        diag.entry(`🎭 [${persona.id}] Transcript handler wired`);

        // SESSION STATE HANDLERS
        const stateResult = setupSessionStateHandlers({
          session,
          sessionPersona: persona,
          conversationManager,
          userData,
          sessionId,
        });
        // Note: silenceContext is created by setupSessionStateHandlers
        handlersStatus.sessionState = true;
        diag.entry(`🎭 [${persona.id}] Session state handlers wired`);

        // Update silenceContext from state result if available
        if (stateResult?.silenceContext) {
          Object.assign(silenceContext, stateResult.silenceContext);
        }
      }

      // TOOL TRACKING HANDLER
      setupToolTrackingHandler({
        session,
        userData,
        services,
        sessionPersona: persona,
        sessionId,
        debugEnabled: process.env.DEBUG_VOICE_AGENT === 'true',
        sendDataMessage,
      });
      handlersStatus.toolTracking = true;
      diag.entry(`🎭 [${persona.id}] Tool tracking handler wired`);

      // FRONTEND PUBLISHER - Required for music state messages to frontend
      // Without this, the frontend won't know when music is playing
      try {
        const { initializeFrontendPublisher } = await import('../realtime/index.js');
        initializeFrontendPublisher(room);
        diag.entry(`🎭 [${persona.id}] Frontend publisher initialized`);
      } catch (pubErr) {
        log.warn({ error: String(pubErr) }, '⚠️ Failed to initialize frontend publisher');
      }

      // MUSIC HANDLER
      if (conversationManager) {
        const musicResult = await setupMusicHandler({
          room,
          session,
          services,
          sessionPersona: persona,
          conversationManager,
          sessionId,
          userData,
        });
        if (musicResult.clearTimers) {
          cleanupFunctions.push(musicResult.clearTimers);
        }
        handlersStatus.music = musicResult.initialized;
        diag.entry(`🎭 [${persona.id}] Music handler wired: ${musicResult.initialized}`);
      }
    } catch (err) {
      log.warn({ error: String(err), personaId: persona.id }, '⚠️ Some handlers failed to wire');
    }
  }

  // Track cleanup state
  let isCleanedUp = false;

  const setupMs = Date.now() - setupStart;
  diag.entry(
    `🎭 Agent setup complete: ${persona.id} (${setupMs}ms, handlers: ${JSON.stringify(handlersStatus)})`
  );

  if (isHandoff && previousPersonaId) {
    diag.entry(`🎭 Handoff context: ${previousPersonaId} → ${persona.id}`);
  }

  return {
    session,
    agent,
    tts,
    handlers: handlersStatus,
    cleanup: async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      log.info({ personaId: persona.id, sessionId }, '🎭 Cleaning up agent');

      // Run all cleanup functions
      for (const cleanup of cleanupFunctions) {
        try {
          await cleanup();
        } catch (err) {
          log.warn({ error: String(err) }, 'Error in handler cleanup');
        }
      }

      // FIX: Clean up speech session services (29+ services) to prevent memory leaks
      // This matches what the main voice-agent cleanup does
      try {
        cleanupSpeechSession(sessionId, { verbose: false, reason: 'normal' });
        log.debug(
          { sessionId, personaId: persona.id },
          '🎤 Speech session cleaned up (agent cleanup)'
        );
      } catch (err) {
        log.warn({ error: String(err) }, 'Error cleaning up speech session');
      }

      // FIX: Clear retry counter WeakMap entry explicitly
      // While WeakMap will GC when session is collected, explicit cleanup is better practice
      // and ensures memory is freed immediately
      try {
        clearRetryCounter(session);
        log.debug({ sessionId }, '🔄 Retry counter cleared');
      } catch (err) {
        log.warn({ error: String(err) }, 'Error clearing retry counter');
      }

      try {
        await session.close();
      } catch (err) {
        log.warn({ error: String(err) }, 'Error closing session');
      }
    },
    say: (text: string, options?: { allowInterruptions?: boolean }) => {
      // Use coordinated speech for centralized speech management
      coordinatedSay(sessionId, text, { allowInterruptions: options?.allowInterruptions ?? true });
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build the system prompt for an agent (FALLBACK ONLY).
 * Prefer using loadSystemPrompt() from prompt-loader.js for full function-calling support.
 */
function buildAgentSystemPrompt(config: AgentSetupConfig): string {
  const { persona, userData } = config;

  const parts: string[] = [];

  // Base system prompt from persona
  if (persona.systemPrompt) {
    parts.push(persona.systemPrompt);
  }

  // User context
  if (userData.userName) {
    parts.push(`\n\n[USER CONTEXT]\nThe user's name is ${userData.userName}.`);
  }

  return parts.join('\n');
}

/**
 * Build handoff-specific context to append to system prompt.
 */
function buildHandoffContext(config: AgentSetupConfig): string | null {
  const { isHandoff, previousPersonaId, conversationSummary, recentMessages } = config;

  if (!isHandoff || !previousPersonaId) {
    return null;
  }

  const parts: string[] = [];
  parts.push('[HANDOFF CONTEXT]');
  parts.push(`You just received this conversation from ${previousPersonaId}.`);
  parts.push('Continue naturally - acknowledge the handoff briefly but focus on helping.');

  if (conversationSummary) {
    parts.push(`\nConversation summary: ${conversationSummary}`);
  }

  if (recentMessages && recentMessages.length > 0) {
    parts.push('\nRecent conversation:');
    parts.push(recentMessages.slice(-5).join('\n'));
  }

  return parts.join('\n');
}

/**
 * Create TTS engine with persona's voice.
 * Uses the same PersonaAwareTTS pattern as voice-agent-entry.ts
 */
async function createPersonaTTS(personaId: string) {
  const voiceManagerModule = await import('../../speech/voice-manager.js');

  const voiceId = getVoiceId(personaId);
  const voiceName = getPersonaDisplayName(personaId);

  // Log the voice ID we're using - this is critical for debugging
  log.info({ personaId, voiceId, voiceName }, '🎭 Creating TTS with Cartesia voice');

  // Use PersonaAwareTTS (supports voice switching)
  const tts = voiceManagerModule.createPersonaAwareTTS(voiceName, {
    voiceId,
    accent: 'american',
    isLocalizedVoice: false,
  });

  log.info({ personaId, ttsVoiceId: tts.getVoiceId?.() || 'N/A' }, '🎭 TTS created');

  return tts;
}

/**
 * Create a conversation summary for handoff.
 */
export function buildConversationSummary(services: SessionServices, maxLength = 500): string {
  const parts: string[] = [];

  // Get emotional context
  const emotion = services.sessionPriming?.emotionalContext?.lastEmotion;
  if (emotion && emotion !== 'neutral') {
    parts.push(`User's emotional state: ${emotion}`);
  }

  // Get session duration from sessionStartTime
  if (services.sessionStartTime) {
    const durationMs = Date.now() - services.sessionStartTime;
    const minutes = Math.round(durationMs / 60000);
    if (minutes > 0) {
      parts.push(`Session duration: ${minutes} minutes`);
    }
  }

  // Try to get topics from priming if available
  const priming = services.sessionPriming as {
    openThreads?: Array<{ topic: string }>;
  };
  if (priming?.openThreads && priming.openThreads.length > 0) {
    const topics = priming.openThreads.slice(0, 3).map((t) => t.topic);
    parts.push(`Topics discussed: ${topics.join(', ')}`);
  }

  const summary = parts.join('. ');
  return summary.slice(0, maxLength);
}

/**
 * Get recent messages for handoff context.
 */
export function getRecentMessagesForHandoff(services: SessionServices, count = 5): string[] {
  try {
    const historyTracker = services.historyTracker as {
      getSessionHistory?: () => { entries?: Array<{ role: string; content: string }> };
    };

    if (historyTracker?.getSessionHistory) {
      const history = historyTracker.getSessionHistory();
      const entries = history?.entries?.slice(-count) || [];
      return entries.map((e) => `${e.role}: ${e.content}`);
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Could not get recent messages');
  }

  return [];
}
