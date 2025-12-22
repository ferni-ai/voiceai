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

import { voice } from '@livekit/agents';
import type { JobContext } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import type { Room } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import { modelConfig } from '../../services/model-config.js';
import { getVoiceId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import type { ConversationManager } from '../../services/conversation-manager.js';

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

  // Build the system prompt with handoff context
  const systemPrompt = buildAgentSystemPrompt(config);

  // Create TTS with persona's voice (async)
  const tts = await createPersonaTTS(persona.id);

  // Create Gemini LLM
  const geminiConfig = modelConfig.getDefault();
  const llmModel = new google.beta.realtime.RealtimeModel({
    model: geminiConfig.model,
    temperature: geminiConfig.temperature,
    instructions: systemPrompt,
    language: geminiConfig.language,
    toolChoice: 'auto',
    geminiTools: { googleSearch: {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // Create voice session
  const session = new voice.AgentSession<UserData>({
    llm: llmModel,
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

  // Create agent wrapper
  const agent = new voice.Agent<UserData>({
    instructions: systemPrompt,
  });

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
          transcriptHandler.handler(event as import('../voice-agent/transcript-handler.js').TranscriptEvent);
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
  diag.entry(`🎭 Agent setup complete: ${persona.id} (${setupMs}ms, handlers: ${JSON.stringify(handlersStatus)})`);

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

      try {
        await session.close();
      } catch (err) {
        log.warn({ error: String(err) }, 'Error closing session');
      }
    },
    say: (text: string, options?: { allowInterruptions?: boolean }) => {
      session.say(text, { allowInterruptions: options?.allowInterruptions ?? true });
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build the system prompt for an agent, including handoff context.
 */
function buildAgentSystemPrompt(config: AgentSetupConfig): string {
  const { persona, isHandoff, previousPersonaId, conversationSummary, recentMessages, userData } =
    config;

  const parts: string[] = [];

  // Base system prompt from persona
  if (persona.systemPrompt) {
    parts.push(persona.systemPrompt);
  }

  // User context
  if (userData.userName) {
    parts.push(`\n\n[USER CONTEXT]\nThe user's name is ${userData.userName}.`);
  }

  // Handoff context
  if (isHandoff && previousPersonaId) {
    parts.push('\n\n[HANDOFF CONTEXT]');
    parts.push(`You just received this conversation from ${previousPersonaId}.`);
    parts.push('Continue naturally - acknowledge the handoff briefly but focus on helping.');

    if (conversationSummary) {
      parts.push(`\nConversation summary: ${conversationSummary}`);
    }

    if (recentMessages && recentMessages.length > 0) {
      parts.push('\nRecent conversation:');
      parts.push(recentMessages.slice(-5).join('\n'));
    }
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

  log.debug({ personaId, voiceId, voiceName }, '🎭 Creating TTS');

  // Use PersonaAwareTTS (supports voice switching)
  return voiceManagerModule.createPersonaAwareTTS(voiceName, {
    voiceId,
    accent: 'american',
    isLocalizedVoice: false,
  });
}

/**
 * Create a conversation summary for handoff.
 */
export function buildConversationSummary(
  services: SessionServices,
  maxLength: number = 500
): string {
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
export function getRecentMessagesForHandoff(
  services: SessionServices,
  count: number = 5
): string[] {
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

