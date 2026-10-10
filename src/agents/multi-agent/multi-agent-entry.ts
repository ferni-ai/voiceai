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

import { initializeFrontendPublisher } from '../realtime/frontend-publisher.js';
import type { JobContext } from '@livekit/agents';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/types.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { UserData } from '../shared/types.js';
import { createAgentOrchestrator, type AgentOrchestrator } from './orchestrator.js';
import { createPersonaAgentFactory } from './persona-agent-factory.js';
import { checkHandoffUnlocked } from '../../tools/handoff/handoff-unlock-check.js';
import { setCurrentAgent } from '../../tools/handoff/state.js';
import type { AgentId } from '../../services/agent-bus.js';

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

  // This call's own frontend publisher, bound to its session before
  // anything else starts, so app messages can't reach another caller's room.
  initializeFrontendPublisher(sessionId, room);

  // Warm the TTS socket while the session sets up, before the greeting needs it.
  void import('../../speech/tts-gateway/index.js')
    .then(({ prewarmTTSGateway }) => prewarmTTSGateway())
    .catch((error: unknown) => log.debug({ error: String(error) }, 'TTS prewarm skipped'));

  // Get conversation manager (required for full handlers including music)
  let conversationManager:
    import('../../services/conversation-manager.js').ConversationManager | undefined;
  if (enableFullHandlers) {
    try {
      const { getConversationManager } = await import('../../services/conversation-manager.js');
      conversationManager = getConversationManager();
      conversationManager.setPersonaId(initialPersonaId);
      log.debug({ sessionId }, '🎭 Conversation manager initialized');
    } catch (err) {
      // 🐛 FIX: Upgrade to error level - this breaks music and other critical handlers!
      log.error(
        { error: String(err), sessionId },
        '🚨 CRITICAL: Could not initialize conversation manager! Music and other handlers will NOT work.'
      );
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

  // Create the orchestrator (with userId for predictive handoff pre-briefings)
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
    userId,
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

  // A tap reaches here straight from the browser: the same unlock check as the LLM's tools
  if (typeof targetPersonaId !== 'string') return { success: false, error: 'No persona given' };
  const check = (profile: UserProfile | null) =>
    checkHandoffUnlocked(targetPersonaId, profile, tierOf(profile));
  let unlock = check(services.userProfile ?? null);
  // Refused with no profile yet: it may still be loading, so wait for it once and decide again
  if (!unlock.open && !services.userProfile) unlock = check(await profileWhenLoaded(services));
  if (!unlock.open) return { success: false, error: unlock.error };
  // From here on, only the id the check decided on: never the raw one from the browser
  const target = unlock.target;
  const currentPersona = orchestrator.getCurrentPersonaId();
  if (currentPersona === target) {
    return { success: false, error: `Already with ${target}` };
  }

  diag.entry(`🎭 Data channel handoff: ${currentPersona} → ${target}`);

  const result = await orchestrator.handoff({
    targetPersonaId: target,
    reason,
    userName: services.userProfile?.name,
    userEmotion: services.sessionPriming?.emotionalContext?.lastEmotion,
  });

  // The LLM's handoff tools read the current agent from here: without this, after a tap to
  // Maya her own handoff back to Ferni was refused as "Already with Ferni"
  if (result.success) setCurrentAgent(target as AgentId);
  return {
    success: result.success,
    error: result.error,
  };
}

/**
 * The profile loads after the call starts (deferred startup); a tap in the first moments
 * waits briefly for it, so an unlocked teammate isn't refused for want of it. Still none
 * after that: decide without it, which keeps paid teammates closed.
 */
async function profileWhenLoaded(
  services: SessionServices,
  waitMs = 3000
): Promise<UserProfile | null> {
  // Once per call: a profile that didn't arrive in time won't hold up every later tap
  if (waitedForProfile.has(services)) return services.userProfile ?? null;
  waitedForProfile.add(services);
  for (let waited = 0; !services.userProfile && services.userId && waited < waitMs; waited += 100) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  return services.userProfile ?? null;
}

const waitedForProfile = new WeakSet<object>();

function tierOf(profile: UserProfile | null): 'free' | 'friend' | 'partner' {
  const tier = profile?.subscription?.tier;
  return tier === 'friend' || tier === 'partner' ? tier : 'free';
}
