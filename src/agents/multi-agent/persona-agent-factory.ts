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
import {
  markSessionReady,
  prewarmSession,
  registerSessionForReconnection,
} from '../shared/generate-reply-gateway.js';
// Model provider abstraction
import { getModelProvider } from '../model-provider/index.js';
import {
  getPrewarmGreetingPolicy,
  planFactoryPrewarm,
} from './prewarm-greeting-overlap.js';

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
    try {
      const { markCallStage } = await import('../../services/analytics/call-quality-monitor.js');
      markCallStage(sessionId, 'factory_start');
    } catch {
      /* non-fatal */
    }

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

      // Register session for gateway access (enables generateReplyBySessionId)
      registerSessionForReconnection(sessionId, agentSetup.session);

      // Speech coordination BEFORE prewarm — greeting (TTS) needs it and must
      // not wait for Gemini. Overlap: user hears greeting while prewarm runs.
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

      // =========================================================================
      // PREWARM + TOOLS
      // =========================================================================
      // Greeting uses Cartesia TTS only (agent.say → coordinatedSay) — it does
      // NOT open a Gemini WebSocket. The historical double-connection bug was
      // LLM generateReply racing prewarm; generateReply stays gated on
      // isSessionReady until prewarm marks ready.
      //
      // OVERLAP_GREETING_WITH_PREWARM (default on): return from factory before
      // prewarm finishes so orchestrator can greet (~6s saved on first audio).
      // Tools still register after prewarm (realtimeLLMSession must exist).
      // =========================================================================
      const provider = getModelProvider();
      const SKIP_PREWARM = process.env.SKIP_GEMINI_PREWARM === 'true';
      const prewarmPlan = planFactoryPrewarm(getPrewarmGreetingPolicy());

      const runPrewarmAndRegisterTools = async (): Promise<void> => {
        if (provider.needsPrewarm() && !context.isHandoff && !SKIP_PREWARM) {
          mark('prewarm_start');
          try {
            const prewarmStart = Date.now();
            const prewarmResult = await prewarmSession(agentSetup.session, sessionId);
            const prewarmMs = Date.now() - prewarmStart;
            if (prewarmResult) {
              log.info(
                { personaId, prewarmMs, overlapped: !prewarmPlan.blockFactoryOnPrewarm },
                '🔥 Prewarm complete'
              );
            } else {
              log.info(
                { personaId, prewarmMs },
                '⚠️ Prewarm incomplete - session marked ready for lazy connection'
              );
              markSessionReady(sessionId);
            }
          } catch (prewarmErr) {
            log.warn(
              { personaId, error: String(prewarmErr) },
              '⚠️ Prewarm failed - marking session ready anyway'
            );
            markSessionReady(sessionId);
          }
          mark('prewarm_done');
          try {
            const { markCallStage } = await import(
              '../../services/analytics/call-quality-monitor.js'
            );
            markCallStage(sessionId, 'prewarm_done');
          } catch {
            /* non-fatal */
          }
        } else if (SKIP_PREWARM) {
          log.info(
            { personaId },
            '⏭️ Prewarm skipped (SKIP_GEMINI_PREWARM=true) - marking session ready'
          );
          markSessionReady(sessionId);
        } else if (!provider.needsPrewarm()) {
          log.info(
            { personaId, providerId: provider.id },
            `${provider.getLogPrefix()} No prewarm needed - marking session ready`
          );
          markSessionReady(sessionId);
        } else if (context.isHandoff) {
          log.info({ personaId }, '🔄 Handoff session - marking session ready');
          markSessionReady(sessionId);
        }

        // Tools AFTER prewarm — realtimeLLMSession exists only then
        try {
          const { registerInitialTools, hasNativeToolUpdates } =
            await import('../shared/tool-updater.js');
          const agentTools = (agentSetup.agent as unknown as { _tools?: Record<string, unknown> })
            ?._tools;
          const toolCount = agentTools ? Object.keys(agentTools).length : 0;

          if (hasNativeToolUpdates() && toolCount > 0) {
            const registered = await registerInitialTools(agentSetup.agent);
            if (registered) {
              log.info(
                { personaId, toolCount },
                '🔧 Initial tools sent to session for native FC (after prewarm)'
              );
            }
          } else {
            log.debug(
              { personaId, hasNative: hasNativeToolUpdates(), toolCount },
              'Tool registration skipped (no native FC or no tools)'
            );
          }
        } catch (toolRegErr) {
          log.warn(
            { personaId, error: String(toolRegErr) },
            '⚠️ Failed to register initial tools (non-fatal)'
          );
        }
      };

      if (prewarmPlan.blockFactoryOnPrewarm) {
        await runPrewarmAndRegisterTools();
      } else {
        log.info(
          { personaId },
          '⚡ Overlap: factory returns before prewarm — greeting can start (TTS-only)'
        );
        void runPrewarmAndRegisterTools().catch((err: unknown) => {
          log.error(
            { personaId, error: String(err) },
            '🚨 Background prewarm/tools failed after overlapped greeting start'
          );
        });
      }
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
