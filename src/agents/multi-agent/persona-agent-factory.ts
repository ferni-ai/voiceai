/**
 * Persona Agent Factory
 *
 * Creates individual persona agents for the multi-agent orchestrator.
 * Uses the agent-setup module for consistent agent configuration.
 *
 * @module agents/multi-agent/persona-agent-factory
 */

import type { JobContext } from '@livekit/agents';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getPersonaAsyncCached } from '../shared/handoff/cached-modules.js';
import type { UserData } from '../shared/types.js';
import {
  buildConversationSummary,
  getRecentMessagesForHandoff,
  setupPersonaAgent,
} from './agent-setup.js';
import type { AgentCreationContext, PersonaAgent } from './orchestrator.js';
// Speech coordination for centralized speech management
import { initializeSpeechCoordination } from '../../speech/coordination/index.js';
// Centralized generateReply gateway - handles session readiness
import { markSessionReady, prewarmSession } from '../shared/generate-reply-gateway.js';
// Model provider abstraction
import { getModelProvider } from '../model-provider/index.js';

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
    const factoryStart = Date.now();
    const mark = (step: string) => {
      const elapsed = Date.now() - factoryStart;
      log.info({ personaId, step, elapsedMs: elapsed }, `⏱️ [FACTORY] ${step}`);
      process.stderr.write(`⏱️ [FACTORY ${personaId}] [${elapsed}ms] ${step}\n`);
    };
    mark('factory_start');

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
    mark('get_persona_config');
    const personaConfig = await getPersonaAsyncCached(personaId);
    if (!personaConfig) {
      throw new Error(`Unknown persona: ${personaId}`);
    }
    mark('persona_config_loaded');
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
    mark('setup_persona_agent_start');
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
    mark('setup_persona_agent_done');

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
      // GREETING AWARENESS: Expose userData so orchestrator can store greeting text
      // This allows the turn-handler to inject what was said on turn 0
      userData,
    };

    // Start the session in the room
    // CRITICAL: For handoffs, use record: false to avoid "Only one AgentSession can be primary" error
    // The old session may still be registered as primary even after close() is called
    try {
      log.info(
        { personaId, agentInstanceId, isHandoff: context.isHandoff },
        '🎭 Starting agent session in room...'
      );
      mark('session_start_call');
      await agentSetup.session.start({
        room: context.room,
        agent: agentSetup.agent,
        // For handoffs, don't claim primary status - the old session may still be releasing
        // For initial agent, be primary (record: true is default)
        ...(context.isHandoff ? { record: false } : {}),
      });
      mark('session_started');
      log.info({ personaId, agentInstanceId }, '🎭 Agent session started successfully');

      // =========================================================================
      // PREWARM: SYNCHRONOUS to prevent double connection (provider-dependent)
      // =========================================================================
      // FIX: The SDK was creating 2 WebSocket connections because we were
      // firing prewarm async and the greeting raced ahead. By waiting for
      // prewarm to complete (with timeout), we establish ONE stable connection.
      // =========================================================================
      const provider = getModelProvider();
      const SKIP_PREWARM = process.env.SKIP_GEMINI_PREWARM === 'true';

      if (provider.needsPrewarm() && !context.isHandoff && !SKIP_PREWARM) {
        mark('prewarm_start');
        // SYNCHRONOUS prewarm - establishes stable Gemini connection
        // This prevents the double connection issue where SDK created 2 WebSockets
        //
        // NOTE: prewarmSession() has its own internal 5s timeout (in generate-reply-gateway.ts)
        // We don't add another timeout here to avoid race conditions and duplicate logs.
        // If prewarm fails or times out, it returns false and we mark session ready anyway.
        try {
          const prewarmStart = Date.now();
          const prewarmResult = await prewarmSession(agentSetup.session, sessionId);
          const prewarmMs = Date.now() - prewarmStart;
          if (prewarmResult) {
            log.info({ personaId, prewarmMs }, '🔥 Prewarm complete (sync)');
          } else {
            // prewarmSession() already logged the timeout/failure reason
            // We just need to mark the session ready for lazy connection
            log.info(
              { personaId, prewarmMs },
              '⚠️ Prewarm incomplete - session marked ready for lazy connection'
            );
            markSessionReady(sessionId);
          }
        } catch (prewarmErr) {
          // FIX: Even on error, mark session ready so it can proceed with lazy connection
          log.warn(
            { personaId, error: String(prewarmErr) },
            '⚠️ Prewarm failed - marking session ready anyway'
          );
          markSessionReady(sessionId);
        }
        mark('prewarm_done');
      } else if (SKIP_PREWARM) {
        // FIX: When skipping prewarm, we still need to mark the session ready!
        log.info(
          { personaId },
          '⏭️ Prewarm skipped (SKIP_GEMINI_PREWARM=true) - marking session ready'
        );
        markSessionReady(sessionId);
      } else if (!provider.needsPrewarm()) {
        // Provider doesn't need prewarm - mark session ready immediately
        log.info(
          { personaId, providerId: provider.id },
          `${provider.getLogPrefix()} No prewarm needed - marking session ready`
        );
        markSessionReady(sessionId);
      } else if (context.isHandoff) {
        // Handoff sessions inherit readiness from the original session
        // but we should still mark them ready to be safe
        log.info({ personaId }, '🔄 Handoff session - marking session ready');
        markSessionReady(sessionId);
      }

      // Initialize speech coordination for this agent's session
      // This enables centralized speech management and prevents overlap
      mark('speech_coordination_start');
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
      mark('speech_coordination_done');
    } catch (startErr) {
      log.error(
        { personaId, agentInstanceId, error: String(startErr) },
        '🎭 CRITICAL: Failed to start agent session'
      );
      throw new Error(`Failed to start session for ${personaId}: ${startErr}`);
    }

    // Final timing
    const totalFactoryMs = Date.now() - factoryStart;
    mark('factory_complete');
    log.info(
      { personaId, agentInstanceId, totalFactoryMs },
      `🏁 [FACTORY] Agent created in ${totalFactoryMs}ms`
    );
    process.stderr.write(`\n🏁 [FACTORY ${personaId}] TOTAL: ${totalFactoryMs}ms\n`);

    diag.entry(`🎭 Agent started: ${personaId} (${agentInstanceId})`);

    return personaAgent;
  };
}
