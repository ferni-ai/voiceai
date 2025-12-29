/**
 * Multi-Agent Voice Entry Point
 *
 * This is an alternative entry point that uses the multi-agent orchestrator
 * for natural persona handoffs. Each persona gets its own Gemini session
 * and TTS voice.
 *
 * Usage:
 * ```typescript
 * import { initializeMultiAgentSession } from './multi-agent/multi-agent-entry.js';
 *
 * // In your voice agent entry:
 * const { orchestrator, cleanup } = await initializeMultiAgentSession({
 *   ctx,
 *   room,
 *   userParticipant,
 *   initialPersonaId: 'ferni',
 *   services,
 *   userData,
 *   sessionId,
 * });
 *
 * // Handle handoff requests from data channel
 * room.on('data_received', (data) => {
 *   if (data.type === 'handoff_request') {
 *     orchestrator.handoff({
 *       targetPersonaId: data.target,
 *       reason: data.reason,
 *     });
 *   }
 * });
 * ```
 *
 * @module agents/multi-agent/multi-agent-entry
 */

import type { JobContext } from '@livekit/agents';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import { createAgentOrchestrator, type AgentOrchestrator } from './orchestrator.js';
import { createPersonaAgentFactory } from './persona-agent-factory.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface MultiAgentSessionConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** LiveKit room */
  room: Room;
  /** User participant */
  userParticipant: RemoteParticipant;
  /** Initial persona to start with */
  initialPersonaId: string;
  /** Session services */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Callback when handoff completes */
  onHandoffComplete?: (fromPersona: string, toPersona: string) => void;
  /** Enable full handlers (music, transcript, etc.) - default: true */
  enableFullHandlers?: boolean;
  /**
   * ⚡ FAST-AGENT-JOIN: Defer handler wiring until after greeting.
   * When true, handlers wire in background after greeting starts (~500ms saved).
   * Default: false (for backward compatibility)
   */
  deferHandlers?: boolean;
}

export interface MultiAgentSessionResult {
  /** The agent orchestrator */
  orchestrator: AgentOrchestrator;
  /** Cleanup function */
  cleanup: () => Promise<void>;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Initialize a multi-agent session.
 *
 * This creates the orchestrator and starts the initial persona agent.
 * The orchestrator handles all handoffs between personas.
 */
export async function initializeMultiAgentSession(
  config: MultiAgentSessionConfig
): Promise<MultiAgentSessionResult> {
  const {
    ctx,
    room,
    userParticipant,
    initialPersonaId,
    services,
    userData,
    sessionId,
    userId,
    onHandoffComplete,
    enableFullHandlers = true,
    deferHandlers = false, // ⚡ FAST-AGENT-JOIN: defer handlers for faster startup
  } = config;

  log.info(
    { sessionId, initialPersonaId, enableFullHandlers, deferHandlers },
    '🎭 Initializing multi-agent session'
  );

  const startTime = Date.now();

  // Get conversation manager (required for full handlers)
  let conversationManager:
    | import('../../services/conversation-manager.js').ConversationManager
    | undefined;
  if (enableFullHandlers) {
    try {
      const { getConversationManager } = await import('../../services/conversation-manager.js');
      conversationManager = getConversationManager();
      conversationManager.setPersonaId(initialPersonaId);
      log.debug({ sessionId }, '🎭 Conversation manager initialized');
    } catch (err) {
      log.warn({ error: String(err) }, '⚠️ Could not initialize conversation manager');
    }
  }

  // Create the persona agent factory
  // ⚡ FAST-AGENT-JOIN: Pass deferHandlers for faster initial agent creation
  const agentFactory = createPersonaAgentFactory({
    ctx,
    services,
    userData,
    sessionId,
    userId,
    conversationManager,
    enableFullHandlers,
    deferHandlers, // Wire handlers after greeting for faster startup
  });

  // Create the orchestrator
  const orchestrator = createAgentOrchestrator({
    ctx,
    room,
    userParticipant,
    createPersonaAgent: agentFactory,
    onHandoffComplete: (from, to) => {
      log.info({ from, to, sessionId }, '🎭 Handoff complete');
      onHandoffComplete?.(from, to);
    },
    sessionId,
  });

  // Start with the initial persona
  await orchestrator.start(initialPersonaId);

  const initMs = Date.now() - startTime;
  diag.entry(`🎭 Multi-agent session initialized (${initMs}ms)`);

  return {
    orchestrator,
    cleanup: async () => {
      log.info({ sessionId }, '🎭 Cleaning up multi-agent session');
      await orchestrator.shutdown();
    },
  };
}

/**
 * Handle a handoff request from the data channel.
 *
 * This is a convenience function that can be called from the data channel handler.
 */
export async function handleHandoffFromDataChannel(
  orchestrator: AgentOrchestrator,
  targetPersonaId: string,
  reason: string,
  services: SessionServices
): Promise<{ success: boolean; error?: string }> {
  if (orchestrator.isHandoffInProgress()) {
    return { success: false, error: 'Handoff already in progress' };
  }

  const currentPersona = orchestrator.getCurrentPersonaId();
  if (currentPersona === targetPersonaId) {
    return { success: false, error: `Already with ${targetPersonaId}` };
  }

  diag.entry(`🎭 Data channel handoff: ${currentPersona} → ${targetPersonaId}`);

  const result = await orchestrator.handoff({
    targetPersonaId,
    reason,
    userName: services.userProfile?.name,
    userEmotion: services.sessionPriming?.emotionalContext?.lastEmotion,
  });

  return {
    success: result.success,
    error: result.error,
  };
}
