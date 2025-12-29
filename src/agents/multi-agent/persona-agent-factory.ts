/**
 * Persona Agent Factory
 *
 * Creates individual persona agents for the multi-agent orchestrator.
 * Uses the agent-setup module for consistent agent configuration.
 *
 * @module agents/multi-agent/persona-agent-factory
 */

import type { JobContext } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { PersonaAgent, AgentCreationContext } from './orchestrator.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import { getPersonaAsyncCached } from '../shared/handoff/cached-modules.js';
import {
  setupPersonaAgent,
  buildConversationSummary,
  getRecentMessagesForHandoff,
} from './agent-setup.js';
// Speech coordination for centralized speech management
import { initializeSpeechCoordination } from '../../speech/coordination/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaAgentFactoryConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** Session services */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Conversation manager for tracking state */
  conversationManager?: import('../../services/conversation-manager.js').ConversationManager;
  /** Enable full handlers on agents */
  enableFullHandlers?: boolean;
  /**
   * ⚡ FAST-AGENT-JOIN: Defer handler wiring until after greeting.
   * When true, handlers are wired in background after greeting starts.
   */
  deferHandlers?: boolean;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a factory function for the orchestrator.
 *
 * The factory captures the shared context (ctx, services, userData) and
 * returns a function that creates persona agents with full capabilities.
 */
export function createPersonaAgentFactory(factoryConfig: PersonaAgentFactoryConfig) {
  const {
    ctx,
    services,
    userData,
    sessionId,
    userId,
    conversationManager,
    enableFullHandlers = true,
    deferHandlers = false, // ⚡ FAST-AGENT-JOIN: defer handlers for faster startup
  } = factoryConfig;

  /**
   * Create a persona agent for the given persona ID.
   */
  return async function createAgent(
    personaId: string,
    context: AgentCreationContext
  ): Promise<PersonaAgent> {
    const agentInstanceId = `${personaId}-${Date.now()}`;

    log.info(
      { personaId, agentInstanceId, isHandoff: context.isHandoff },
      '🎭 Factory creating persona agent'
    );

    // Validate required context
    if (!context.room) {
      throw new Error(`Cannot create agent ${personaId}: room is null/undefined`);
    }

    // Get persona config
    const personaConfig = await getPersonaAsyncCached(personaId);
    if (!personaConfig) {
      throw new Error(`Unknown persona: ${personaId}`);
    }
    log.info({ personaId, personaName: personaConfig.name }, '🎭 Persona config loaded');

    // Build handoff context if this is a handoff
    let conversationSummary: string | undefined;
    let recentMessages: string[] | undefined;

    if (context.isHandoff) {
      conversationSummary = context.conversationSummary || buildConversationSummary(services);
      recentMessages = context.recentMessages || getRecentMessagesForHandoff(services);
    }

    // Use the agent setup module
    // ⚡ FAST-AGENT-JOIN: Pass deferHandlers to speed up initial agent creation
    const agentSetup = await setupPersonaAgent({
      persona: personaConfig,
      ctx,
      room: context.room,
      services,
      userData,
      sessionId,
      userId,
      isHandoff: context.isHandoff,
      previousPersonaId: context.previousPersonaId,
      conversationSummary,
      recentMessages,
      conversationManager,
      enableFullHandlers,
      deferHandlers, // Wire handlers in background after greeting
    });

    // State for muting
    let isMuted = false;

    // Build the PersonaAgent interface
    const personaAgent: PersonaAgent = {
      id: agentInstanceId,
      personaId,
      isActive: false,
      session: agentSetup.session,
      cleanup: agentSetup.cleanup,
      say: (text: string, options?: { allowInterruptions?: boolean }) => {
        if (isMuted) {
          log.debug({ personaId }, 'Agent is muted, not speaking');
          return;
        }
        agentSetup.say(text, options);
      },
      setMuted: (muted: boolean) => {
        isMuted = muted;
        log.debug({ personaId, muted }, '🎭 Agent mute state changed');
      },
      interrupt: () => {
        try {
          agentSetup.session.interrupt();
          log.debug({ personaId }, '🎭 Agent interrupted');
        } catch (err) {
          log.debug({ personaId, error: String(err) }, 'Interrupt error (non-critical)');
        }
      },
      // ⚡ FAST-AGENT-JOIN: Wire handlers after greeting (when deferred)
      wireHandlers: agentSetup.wireHandlers,
    };

    // Start the session in the room
    // CRITICAL: For handoffs, use record: false to avoid "Only one AgentSession can be primary" error
    // The old session may still be registered as primary even after close() is called
    try {
      log.info(
        { personaId, agentInstanceId, isHandoff: context.isHandoff },
        '🎭 Starting agent session in room...'
      );
      await agentSetup.session.start({
        room: context.room,
        agent: agentSetup.agent,
        // For handoffs, don't claim primary status - the old session may still be releasing
        // For initial agent, be primary (record: true is default)
        ...(context.isHandoff ? { record: false } : {}),
      });
      log.info({ personaId, agentInstanceId }, '🎭 Agent session started successfully');

      // =========================================================================
      // GEMINI PREWARM: Force Gemini to process the system prompt BEFORE user speaks
      // =========================================================================
      const useOpenAI = process.env.USE_OPENAI_REALTIME === 'true';
      if (!useOpenAI && !context.isHandoff) {
        // Only prewarm for Gemini AND initial agent (not handoffs - they're time-sensitive)
        const prewarmStart = Date.now();
        log.info({ personaId }, '🔥 Prewarming Gemini session...');

        try {
          const warmupPromise = new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Gemini prewarm timeout (10s)'));
            }, 10000);

            const handle = agentSetup.session.generateReply({
              instructions:
                '[INTERNAL WARMUP - DO NOT SPEAK] Silently acknowledge you are ready. Output nothing.',
              allowInterruptions: true,
            });

            handle
              .waitForPlayout()
              .then(() => {
                clearTimeout(timeoutId);
                resolve();
              })
              .catch((err) => {
                clearTimeout(timeoutId);
                log.debug(
                  { personaId, error: String(err) },
                  '⚠️ Prewarm playout error (may be OK)'
                );
                resolve();
              });
          });

          await warmupPromise;
          log.info({ personaId, durationMs: Date.now() - prewarmStart }, '🔥 Gemini prewarmed');
        } catch (prewarmErr) {
          log.warn(
            { personaId, durationMs: Date.now() - prewarmStart, error: String(prewarmErr) },
            '⚠️ Gemini prewarm failed (continuing anyway)'
          );
        }
      }

      // Initialize speech coordination for this agent's session
      // This enables centralized speech management and prevents overlap
      try {
        initializeSpeechCoordination({
          session: agentSetup.session,
          sessionId,
          personaId,
          userId,
        });
        log.info({ personaId, sessionId }, '🎤 Speech coordination initialized');
      } catch (coordErr) {
        log.warn(
          { personaId, error: String(coordErr) },
          '🎤 Speech coordination init failed (non-critical)'
        );
      }
    } catch (startErr) {
      log.error(
        { personaId, agentInstanceId, error: String(startErr) },
        '🎭 CRITICAL: Failed to start agent session'
      );
      throw new Error(`Failed to start session for ${personaId}: ${startErr}`);
    }

    diag.entry(`🎭 Agent started: ${personaId} (${agentInstanceId})`);

    return personaAgent;
  };
}
