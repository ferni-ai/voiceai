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
  const { ctx, services, userData, sessionId, userId, conversationManager, enableFullHandlers = true } = factoryConfig;

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

    // Get persona config
    const personaConfig = await getPersonaAsyncCached(personaId);
    if (!personaConfig) {
      throw new Error(`Unknown persona: ${personaId}`);
    }

    // Build handoff context if this is a handoff
    let conversationSummary: string | undefined;
    let recentMessages: string[] | undefined;

    if (context.isHandoff) {
      conversationSummary = context.conversationSummary || buildConversationSummary(services);
      recentMessages = context.recentMessages || getRecentMessagesForHandoff(services);
    }

    // Use the agent setup module
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
    };

    // Start the session in the room
    await agentSetup.session.start({
      room: context.room,
      agent: agentSetup.agent,
    });

    diag.entry(`🎭 Agent started: ${personaId} (${agentInstanceId})`);

    return personaAgent;
  };
}

