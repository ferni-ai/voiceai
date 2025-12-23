/**
 * Voice Agent Data Channel Handler
 *
 * Handles incoming data messages from the frontend via LiveKit data channel:
 * - handoff_request: User clicks a persona in the UI to switch
 * - game_start_request: User starts a music game from the UI game picker
 * - text_game_start_request: User starts a text game from the UI game picker
 * - practice_start_request: User starts a guided practice from the UI
 * - voice-pack-change: User changes voice pack from Personalize UI
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/data-channel-handler
 */

import type { JobContext, voice } from '@livekit/agents';
import { log as livekitLog } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getCurrentAgent } from '../../tools/handoff/index.js';
import type { UserData } from '../shared/types.js';
import {
  isHandoffInProgress,
  completeHandoff,
  getNextMessageSeqSync,
  getHandoffPersonaInfo,
} from '../shared/handoff/session-state.js';
import type { MacOSContextPayload } from '../../intelligence/context-builders/macos-context.js';

// New coordinator-based handoff system
import {
  getSessionAdapter,
  removeSessionAdapter,
  createCoordinatorAdapter,
  type CoordinatorAdapterConfig,
} from '../shared/handoff/coordinator-adapter.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DataChannelContext {
  /** LiveKit room instance */
  room: Room;
  /** LiveKit job context (needed for coordinator) */
  ctx?: JobContext;
  /** Voice session instance */
  session: voice.AgentSession<UserData>;
  /** Session services */
  services: SessionServices;
  /** Current persona config */
  sessionPersona: PersonaConfig;
  /** User ID (may be undefined for anonymous) */
  userId: string | undefined;
  /** Session ID for logging */
  sessionId: string;
  /** Voice agent reference for persona updates */
  voiceAgentRef?: {
    setPersona: (personaId: string, instructions: string) => void;
  };
  /** TTS instance for voice switching - CRITICAL for actual voice change! */
  tts?: {
    switchVoice?: (name: string, voiceId: string, accent?: string) => void;
  };
}

export interface DataChannelResult {
  /** The data received handler function */
  handler: (data: Uint8Array, participant?: { identity: string }) => void;
  /** Cleanup function to remove the handler */
  cleanup: () => void;
}

// ============================================================================
// MAIN DATA CHANNEL SETUP
// ============================================================================

// Lazy getLogger() initialization - livekitLog() can only be called after LiveKit initializes
// Using a getter to defer the call until the getLogger() is actually needed
const getLogger = () => livekitLog();

/**
 * Set up data channel message handling
 *
 * This registers a handler for incoming data messages from the frontend.
 * Returns a cleanup function that should be called on disconnect.
 */
export function setupDataChannelHandler(ctx: DataChannelContext): DataChannelResult {
  const { room, session, services, sessionPersona, userId, sessionId, voiceAgentRef } = ctx;

  // The actual async handler for data messages
  const dataReceivedHandler = async (data: Uint8Array, participant?: { identity: string }) => {
    const ourIdentity = room.localParticipant?.identity;
    const theirIdentity = participant?.identity;

    // Enhanced debugging for handoff requests
    getLogger().info(
      { ourIdentity, theirIdentity, dataLength: data?.length },
      '📩 Data received from participant'
    );

    // Only process messages from our user (not from ourselves)
    if (!participant) {
      getLogger().warn('🚫 Ignoring message: no participant info attached');
      return;
    }
    if (theirIdentity === ourIdentity) {
      getLogger().debug('Ignoring message: from ourselves (agent)');
      return;
    }

    try {
      const rawText = new TextDecoder().decode(data);
      getLogger().info({ rawText: rawText.slice(0, 200) }, '📝 Raw data message received');

      const message = JSON.parse(rawText);
      getLogger().info(
        { messageType: message.type, target: message.target, timestamp: message.timestamp },
        '📬 Parsed data message'
      );

      // Handle different message types
      if (message.type === 'handoff_request') {
        await handleHandoffRequest(message, ctx);
      }

      if (message.type === 'game_start_request') {
        await handleGameStartRequest(message, ctx);
      }

      if (message.type === 'text_game_start_request') {
        await handleTextGameStartRequest(message, ctx);
      }

      if (message.type === 'practice_start_request') {
        await handlePracticeStartRequest(message, ctx);
      }

      if (message.type === 'voice-pack-change') {
        await handleVoicePackChange(message, ctx);
      }

      if (message.type === 'claude_narration') {
        await handleClaudeNarration(message, ctx);
      }

      if (message.type === 'handoff_cancel') {
        await handleHandoffCancel(message, ctx);
      }

      if (message.type === 'macos_context') {
        await handleMacOSContext(message, ctx);
      }

      // DEV MODE SYNC: Frontend dev panel can send dev mode state to backend
      // This allows dev panel unlock bypasses to propagate to voice agent
      if (message.type === 'dev_mode_sync') {
        await handleDevModeSync(message, ctx);
      }
    } catch {
      // Not JSON or not a valid request - this is expected for non-data-channel uses
      // Silently ignore as data channel is used for multiple message types
    }
  };

  // Register the handler (wrap async handler to avoid misused-promises)
  const dataReceivedHandlerWrapper = (data: Uint8Array, participant?: { identity: string }) => {
    void dataReceivedHandler(data, participant);
  };

  room.on('dataReceived', dataReceivedHandlerWrapper);

  // Return cleanup function
  return {
    handler: dataReceivedHandlerWrapper,
    cleanup: () => {
      room.off('dataReceived', dataReceivedHandlerWrapper);
    },
  };
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle handoff_request messages - user clicked a persona in the UI
 *
 * NEW: Uses the HandoffCoordinator for reliable, transactional handoffs
 * with intelligent banter (soft open + arriving welcome).
 */
async function handleHandoffRequest(
  message: { target: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, services, voiceAgentRef, sessionId, session } = ctx;
  const targetPersona = message.target;

  getLogger().info({ targetPersona, sessionId }, '🎯 User requested handoff via UI');
  diag.entry(`🎯 User requested handoff via UI to: ${targetPersona}`);

  // Helper to send acknowledgment to frontend
  const sendAck = async (success: boolean, error?: string) => {
    try {
      const ackMessage = JSON.stringify({
        type: 'handoff_acknowledged',
        target: targetPersona,
        success,
        error,
        timestamp: Date.now(),
      });
      await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
        reliable: true,
      });
    } catch (ackErr) {
      getLogger().warn({ error: String(ackErr) }, 'Failed to send handoff ack');
    }
  };

  // Helper to send failure message to frontend
  const sendFailure = async (errorMsg: string) => {
    try {
      const currentAgent = getCurrentAgent();
      const failureMessage = JSON.stringify({
        type: 'handoff_failed',
        newAgent: targetPersona,
        previousAgent: currentAgent,
        rollbackTo: currentAgent,
        error: errorMsg,
        timestamp: Date.now(),
      });
      await room.localParticipant?.publishData(new TextEncoder().encode(failureMessage), {
        reliable: true,
      });
    } catch (failErr) {
      getLogger().warn({ error: String(failErr) }, 'Failed to send handoff_failed');
    }
  };

  try {
    // Get or create coordinator adapter for this session
    let adapter = getSessionAdapter(sessionId);

    if (!adapter && ctx.ctx) {
      // Create adapter if we have job context
      // CRITICAL: Pass sessionPersona.id so coordinator knows the starting agent
      // CRITICAL: Pass tts so actual voice can be changed!
      adapter = getSessionAdapter(sessionId, {
        ctx: ctx.ctx,
        session,
        services,
        room,
        getVoiceAgentRef: () => voiceAgentRef || null,
        initialAgent: ctx.sessionPersona.id,
        tts: ctx.tts, // CRITICAL: Without this, voice won't actually change!
      });
    }

    if (!adapter) {
      // Fallback: adapter not available
      getLogger().warn(
        { sessionId },
        '⚠️ Coordinator adapter not available - using legacy handoff'
      );
      await sendAck(false, 'Handoff system not initialized');
      await sendFailure('Handoff system not ready');
      return;
    }

    // Execute handoff via the new coordinator
    getLogger().info(
      { targetPersona, currentAgent: adapter.getCurrentAgent() },
      '🔄 Executing handoff via coordinator (FAST MODE)'
    );

    // UI-initiated = FAST MODE (Option D: instant switch, async welcome)
    const result = await adapter.executeHandoff(targetPersona, 'User requested via UI tap', {
      userProfile: services.userProfile,
      subscriptionTier:
        (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free',
      fastMode: true, // ⚡ Instant switch for UI clicks
      source: 'user',
    });

    getLogger().info(
      { result: JSON.stringify(result).slice(0, 500) },
      '📦 Coordinator handoff result'
    );

    if (!result.success) {
      getLogger().warn({ error: result.error }, '⚠️ Handoff blocked');
      await sendAck(false, result.error || 'Handoff failed');
      await sendFailure(result.error || 'Handoff failed');
    } else {
      getLogger().info(
        { newAgent: result.targetAgent, traceId: result.traceId },
        '✅ Handoff executed'
      );
      await sendAck(true);
      diag.entry(`🎭 Coordinator handoff complete: ${result.targetAgent}`);
    }
  } catch (handoffErr) {
    getLogger().error({ error: String(handoffErr) }, '❌ Handoff execution failed');
    await sendAck(false, String(handoffErr));
    await sendFailure(String(handoffErr));
  }
}

/**
 * Handle game_start_request messages - user started a game from UI
 */
async function handleGameStartRequest(
  message: { gameType: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, session, sessionPersona } = ctx;
  const { gameType } = message;

  getLogger().info({ gameType }, '🎮 User requested game start via UI');

  try {
    const { getSessionGameEngine } = await import('../../services/games/index.js');
    const engine = getSessionGameEngine(ctx.sessionId, sessionPersona.id);

    // Start the game - returns welcome message
    // Cast gameType since it comes from user input via data channel
    type GameType = import('../../services/games/types.js').GameType;
    const welcomeMessage = await engine.startGame(gameType as GameType);
    getLogger().info({ gameType, welcomeMessage }, '🎮 Game engine returned welcome message');

    // CRITICAL: Make the agent actually SPEAK the welcome message
    // Use coordinated speech - text is already written, no need for LLM
    if (welcomeMessage && session) {
      getLogger().info({ welcomeMessage }, '🎮 Agent speaking game welcome...');
      coordinatedSay(ctx.sessionId, welcomeMessage, { allowInterruptions: true });
      getLogger().info('🎮 Agent spoke welcome message');
    }

    // Send ack to frontend
    const ackMessage = JSON.stringify({
      type: 'game_start_ack',
      gameType,
      success: true,
      message: welcomeMessage,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });

    getLogger().info({ gameType }, '🎮 Game started successfully');
  } catch (gameErr) {
    getLogger().error({ error: String(gameErr), gameType }, '❌ Game start failed');

    // Make agent acknowledge the error gracefully with a warm static phrase
    // Using coordinated speech to avoid generateReply echoing issues
    if (session) {
      coordinatedSay(
        ctx.sessionId,
        `Hmm, hit a small snag there. Try saying "let's play ${gameType}" and we'll get it going.`,
        { allowInterruptions: true }
      );
    }

    const errorMsg = JSON.stringify({
      type: 'game_start_ack',
      gameType,
      success: false,
      error: String(gameErr),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(errorMsg), {
      reliable: true,
    });
  }
}

/**
 * Handle text_game_start_request messages - user started a text game from UI
 */
async function handleTextGameStartRequest(
  message: { gameType: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, session, sessionPersona } = ctx;
  const { gameType } = message;

  getLogger().info({ gameType }, '🎮 User requested text game start via UI');

  try {
    const { getSessionTextGameEngine } = await import('../../services/games/index.js');
    const engine = getSessionTextGameEngine(ctx.sessionId, sessionPersona.id);

    // Start the text game - returns result with message
    type TextGameType = import('../../services/games/text-game-types.js').TextGameType;
    const result = await engine.startGame(gameType as TextGameType);
    getLogger().info({ gameType, result }, '🎮 Text game engine returned result');

    // CRITICAL: Make the agent actually SPEAK the welcome message
    // Use coordinated speech - text is already written, no need for LLM
    if (result.message && session) {
      getLogger().info({ message: result.message }, '🎮 Agent speaking text game welcome...');
      // Combine message with board state if available
      const fullMessage = result.boardDescription
        ? `${result.message} ${result.boardDescription}`
        : result.message;
      coordinatedSay(ctx.sessionId, fullMessage, { allowInterruptions: true });
      getLogger().info('🎮 Agent spoke text game welcome message');
    }

    // Send ack to frontend
    const ackMessage = JSON.stringify({
      type: 'text_game_start_ack',
      gameType,
      success: true,
      message: result.message,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });

    getLogger().info({ gameType }, '🎮 Text game started successfully');
  } catch (gameErr) {
    getLogger().error({ error: String(gameErr), gameType }, '❌ Text game start failed');

    // Make agent acknowledge the error gracefully with a warm static phrase
    // Using coordinated speech to avoid generateReply echoing issues
    if (session) {
      coordinatedSay(
        ctx.sessionId,
        `Oops, something went sideways. Try saying "let's play ${gameType}" instead.`,
        { allowInterruptions: true }
      );
    }

    const errorMsg = JSON.stringify({
      type: 'text_game_start_ack',
      gameType,
      success: false,
      error: String(gameErr),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(errorMsg), {
      reliable: true,
    });
  }
}

/**
 * Handle practice_start_request messages - user started a guided practice from UI
 */
async function handlePracticeStartRequest(
  message: { commandId: string; commandName: string; prompt: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, session, sessionPersona } = ctx;
  const { commandId, commandName, prompt } = message;

  getLogger().info(
    { commandId, commandName, personaId: sessionPersona.id },
    '🎯 User requested guided practice via UI'
  );

  try {
    // Make the agent speak the practice prompt directly
    // Use coordinated speech - text is already written, no need for LLM
    if (prompt && session) {
      getLogger().info(
        { commandName, promptLength: prompt.length },
        '🎯 Agent starting guided practice...'
      );
      coordinatedSay(ctx.sessionId, prompt, { allowInterruptions: true });
      getLogger().info({ commandId }, '🎯 Agent started guided practice');
    }

    // Send ack to frontend
    const ackMessage = JSON.stringify({
      type: 'practice_start_ack',
      commandId,
      commandName,
      success: true,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });

    getLogger().info({ commandId, commandName }, '🎯 Guided practice started successfully');
  } catch (practiceErr) {
    getLogger().error({ error: String(practiceErr), commandId }, '❌ Practice start failed');

    // Make agent acknowledge the error gracefully with a warm static phrase
    // Using coordinated speech to avoid generateReply echoing issues
    if (session) {
      coordinatedSay(
        ctx.sessionId,
        `Small hiccup there. Let's just talk through ${commandName} naturally - I'm right here.`,
        { allowInterruptions: true }
      );
    }

    const errorMsg = JSON.stringify({
      type: 'practice_start_ack',
      commandId,
      commandName,
      success: false,
      error: String(practiceErr),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(errorMsg), {
      reliable: true,
    });
  }
}

/**
 * Handle claude_narration messages - Claude Code CLI sending updates to narrate
 *
 * This enables voice-driven coding where:
 * 1. User speaks to Ferni
 * 2. Ferni triggers Claude Code via CLI
 * 3. Claude streams progress back via data channel
 * 4. Ferni speaks the progress updates
 */
async function handleClaudeNarration(
  message: { text: string; narration_type: 'progress' | 'result' | 'tool' },
  ctx: DataChannelContext
): Promise<void> {
  const { session } = ctx;
  const { text, narration_type } = message;

  if (!text || !session) {
    getLogger().warn('Claude narration received but no text or session');
    return;
  }

  getLogger().info(
    { narration_type, textLength: text.length },
    '🤖 Claude Code narration received'
  );

  try {
    // Speak Claude's update directly using coordinated speech
    // Text is already written by Claude Code, no need for LLM processing
    coordinatedSay(ctx.sessionId, text, { allowInterruptions: true });
    getLogger().info({ narration_type }, '🎙️ Ferni speaking Claude update');
  } catch (narrationErr) {
    getLogger().warn({ error: String(narrationErr) }, 'Failed to narrate Claude update');
  }
}

/**
 * Handle voice-pack-change messages - user changed voice pack from UI
 */
async function handleVoicePackChange(
  message: { type: string; packId: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, userId } = ctx;

  getLogger().info({ packId: message.packId }, '🎤 User changed voice pack via Personalize');

  try {
    const { handleVoicePackMessage } = await import('../../services/voice-pack-service.js');
    // Pass full message including type for voice pack service
    handleVoicePackMessage(userId ?? 'anonymous', { type: message.type, packId: message.packId });

    // Acknowledge the change
    const ackMessage = JSON.stringify({
      type: 'voice_pack_ack',
      packId: message.packId,
      success: true,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });

    getLogger().info({ packId: message.packId }, '🎤 Voice pack updated successfully');
  } catch (voicePackErr) {
    getLogger().warn({ error: String(voicePackErr) }, 'Voice pack change failed');
  }
}

/**
 * Handle handoff_cancel messages - user cancelled an in-progress handoff
 *
 * This is sent by the frontend when the user taps to cancel a handoff
 * that's currently transitioning. We clean up backend state and send
 * handoff_cancelled back to confirm.
 */
async function handleHandoffCancel(
  message: { targetPersona?: string; reason?: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, sessionId } = ctx;
  const { targetPersona, reason } = message;

  getLogger().info({ targetPersona, reason }, '🚫 User requested handoff cancellation');
  diag.entry(`🚫 Handoff cancellation requested: ${targetPersona || 'unknown'}`);

  // Check if there's actually a handoff in progress
  if (!isHandoffInProgress(sessionId)) {
    getLogger().warn('No handoff in progress to cancel');

    // Send cancelled anyway to ensure frontend state is synced
    const cancelledMessage = JSON.stringify({
      type: 'handoff_cancelled',
      targetPersona: targetPersona || 'unknown',
      reason: 'No handoff in progress',
      seq: getNextMessageSeqSync(sessionId),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(cancelledMessage), {
      reliable: true,
    });
    return;
  }

  try {
    // Get info about the in-progress handoff before clearing
    const handoffInfo = getHandoffPersonaInfo(sessionId);

    // Complete/clear the handoff state
    const { durationMs } = completeHandoff(sessionId);

    getLogger().info(
      {
        targetPersona: handoffInfo.targetPersonaId,
        previousPersona: handoffInfo.previousPersonaId,
        durationMs,
      },
      '🚫 Handoff state cleared due to cancellation'
    );

    // Send handoff_cancelled message to frontend
    const cancelledMessage = JSON.stringify({
      type: 'handoff_cancelled',
      targetPersona: handoffInfo.targetPersonaId || targetPersona || 'unknown',
      previousPersona: handoffInfo.previousPersonaId,
      reason: reason || 'Cancelled by user',
      durationMs,
      seq: getNextMessageSeqSync(sessionId),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(cancelledMessage), {
      reliable: true,
    });

    diag.entry(`🚫 Handoff cancelled after ${durationMs}ms`);
    getLogger().info({ targetPersona, durationMs }, '✅ Handoff cancellation complete');
  } catch (cancelErr) {
    getLogger().error({ error: String(cancelErr) }, '❌ Handoff cancellation failed');

    // Try to send failure response
    try {
      const errorMessage = JSON.stringify({
        type: 'handoff_cancelled',
        targetPersona: targetPersona || 'unknown',
        reason: `Cancellation error: ${cancelErr}`,
        error: String(cancelErr),
        seq: getNextMessageSeqSync(sessionId),
        timestamp: Date.now(),
      });
      await room.localParticipant?.publishData(new TextEncoder().encode(errorMessage), {
        reliable: true,
      });
    } catch (sendErr) {
      getLogger().debug({ error: String(sendErr) }, 'Failed to send cancellation error');
    }
  }
}

/**
 * Handle macos_context messages - macOS native app sending system intelligence
 *
 * This enables superhuman awareness where:
 * 1. macOS app monitors user context (calendar, focus, apps)
 * 2. Context is sent to agent via data channel
 * 3. Agent incorporates context into responses
 */
async function handleMacOSContext(
  message: { payload: Record<string, unknown>; helpMeWithThis?: boolean },
  ctx: DataChannelContext
): Promise<void> {
  const { session, services, sessionId } = ctx;
  const { payload, helpMeWithThis } = message;

  getLogger().info(
    {
      activeApp: payload.activeApp,
      hasSelectedText: !!payload.selectedText,
      hasMeeting: !!payload.upcomingEvent,
      isFocused: payload.isFocused,
      helpMeWithThis,
    },
    '🖥️ macOS context received'
  );

  try {
    // Import and use the macOS context builder
    const { buildMacOSContext } =
      await import('../../intelligence/context-builders/macos-context.js');

    // The message is already parsed, use payload directly as MacOSContextPayload
    const macOSContext = payload as unknown as MacOSContextPayload;

    if (macOSContext) {
      // Store context in session for use by turn processor
      // Note: Session context storage would need to be implemented via session userData
      const sessionContext = session?.userData as Record<string, unknown> | undefined;
      if (sessionContext) {
        (sessionContext as Record<string, unknown>).macOS = macOSContext;
      }

      // If this is a "Help me with this" request, generate an immediate response
      if (helpMeWithThis && payload.selectedText && session) {
        const contextString = buildMacOSContext(macOSContext);
        getLogger().info(
          { selectedTextLength: String(payload.selectedText).length },
          '🆘 Help me with this - generating response'
        );

        session.generateReply({
          instructions: `The user pressed "Help me with this" on their Mac while looking at something.

${contextString}

They want help understanding or working with this selected text. Provide a helpful, contextual response.
Be concise but thorough. If it's code, offer to explain or improve it.
If it's an error, help them understand and fix it.`,
        });
      }

      getLogger().info('✅ macOS context stored for session');
    }
  } catch (contextErr) {
    getLogger().warn({ error: String(contextErr) }, 'Failed to process macOS context');
  }
}

// ============================================================================
// DEV MODE SYNC HANDLER
// ============================================================================

/**
 * Handle dev_mode_sync messages from frontend dev panel.
 *
 * When the frontend dev panel is enabled, it sends this message to let the
 * backend know it should bypass team unlock checks. This allows testing of
 * all personas without needing environment variables.
 *
 * Message format:
 * {
 *   type: 'dev_mode_sync',
 *   enabled: boolean,
 *   bypassUnlocks: boolean,     // Bypass team member unlock checks
 *   simulatedTier?: string,     // 'free' | 'friend' | 'partner'
 *   timestamp: number
 * }
 */
async function handleDevModeSync(
  message: {
    enabled: boolean;
    bypassUnlocks?: boolean;
    simulatedTier?: 'free' | 'friend' | 'partner';
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { services, sessionId, room } = ctx;

  getLogger().info(
    {
      enabled: message.enabled,
      bypassUnlocks: message.bypassUnlocks,
      simulatedTier: message.simulatedTier,
      sessionId,
    },
    '🔧 Dev mode sync received from frontend'
  );

  try {
    // Store dev mode state in services for this session
    // This will be checked by handoff unlock validation
    if (services && typeof services === 'object') {
      // Use a type assertion to add the devMode property
      (services as SessionServices & { devMode?: DevModeState }).devMode = {
        enabled: message.enabled,
        bypassUnlocks: message.bypassUnlocks ?? message.enabled,
        simulatedTier: message.simulatedTier,
        syncedAt: Date.now(),
      };

      getLogger().info(
        {
          devModeEnabled: message.enabled,
          bypassUnlocks: message.bypassUnlocks ?? message.enabled,
        },
        '✅ Dev mode state stored in session services'
      );

      // Send acknowledgment back to frontend
      try {
        const ackMessage = JSON.stringify({
          type: 'dev_mode_sync_ack',
          success: true,
          bypassUnlocks: message.bypassUnlocks ?? message.enabled,
          timestamp: Date.now(),
        });
        await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
          reliable: true,
        });
      } catch (ackErr) {
        getLogger().debug({ error: String(ackErr) }, 'Failed to send dev mode ack');
      }
    }
  } catch (err) {
    getLogger().warn({ error: String(err) }, 'Failed to process dev mode sync');
  }
}

/**
 * Dev mode state stored in session services.
 * Exported for use by handoff unlock checks.
 */
export interface DevModeState {
  enabled: boolean;
  bypassUnlocks: boolean;
  simulatedTier?: 'free' | 'friend' | 'partner';
  syncedAt: number;
}

/**
 * Check if dev mode bypass is enabled for this session.
 * Used by handoff unlock validation.
 */
export function isDevModeBypassEnabled(services: SessionServices): boolean {
  const devMode = (services as SessionServices & { devMode?: DevModeState }).devMode;
  return devMode?.enabled === true && devMode?.bypassUnlocks === true;
}

/**
 * Get simulated tier from dev mode, if set.
 */
export function getDevModeSimulatedTier(
  services: SessionServices
): 'free' | 'friend' | 'partner' | undefined {
  const devMode = (services as SessionServices & { devMode?: DevModeState }).devMode;
  return devMode?.enabled ? devMode.simulatedTier : undefined;
}

export default setupDataChannelHandler;
