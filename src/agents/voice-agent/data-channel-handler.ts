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

import { log as livekitLog, type JobContext, type voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { MacOSContextPayload } from '../../intelligence/context-builders/external/macos-context.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
// Unified handoff module (Phase 3 migration)
import {
  getCurrentAgent,
  isHandoffInProgress,
  getNextMessageSeqSync,
} from '../../handoff/index.js';
import { completeHandoff } from '../../handoff/actions.js';
import { getHandoffPersonaInfo } from '../shared/handoff/session-state.js';
import type { UserData } from '../shared/types.js';

// New coordinator-based handoff system
import { getSessionAdapter } from '../shared/handoff/coordinator-adapter.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';
// Centralized generateReply gateway - NEVER use session.generateReply directly!
import { generateReply } from '../shared/generate-reply-gateway.js';
// Safe fire-and-forget for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';

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

      // 🧪 SYNTHETIC TEXT: Inject text as if it came from STT (bypasses STT, exercises LLM pipeline)
      // Used for production E2E testing without voice calls
      if (message.type === 'synthetic_text') {
        await handleSyntheticText(message, ctx);
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

      // 🎵 MUSIC CONTROL: Frontend play/pause buttons
      if (message.type === 'music_control') {
        await handleMusicControl(message, ctx);
      }

      // 🔄 REPEAT LAST: Replay last agent response via TTS
      if (message.type === 'repeat_last') {
        await handleRepeatLast(message, ctx);
      }

      // 🎭 USER REACTION: Handle quick reaction buttons from frontend
      if (message.type === 'user_reaction') {
        await handleUserReaction(message, ctx);
      }

      // 📊 USER FEEDBACK: Handle contextual feedback from avatar-attached UI
      if (message.type === 'user_feedback') {
        await handleUserFeedback(message, ctx);
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
      const currentAgent = getCurrentAgent(sessionId);
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
      await import('../../intelligence/context-builders/external/macos-context.js');

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

        // Use gateway for proper error handling and session readiness
        fireAndForget(async () => {
          await generateReply(session, sessionId, {
            instructions: `The user pressed "Help me with this" on their Mac while looking at something.

${contextString}

They want help understanding or working with this selected text. Provide a helpful, contextual response.
Be concise but thorough. If it's code, offer to explain or improve it.
If it's an error, help them understand and fix it.`,
            context: 'macos-help-me-with-this',
            fallbackMessage: "I'd be happy to help with that!",
            priority: 'high', // User explicitly requested help
          });
        }, 'macos-help-request');
      }

      getLogger().info('✅ macOS context stored for session');
    }
  } catch (contextErr) {
    getLogger().warn({ error: String(contextErr) }, 'Failed to process macOS context');
  }
}

// ============================================================================
// MUSIC CONTROL HANDLER
// ============================================================================

/**
 * Handle music_control messages - user clicked controls in Now Playing UI
 *
 * Message format:
 * {
 *   type: 'music_control',
 *   action: 'pause' | 'resume' | 'skip' | 'volume' | 'favorite',
 *   volume?: number,       // 0-100 for volume action
 *   track?: { name: string; artist: string },  // for favorite action
 *   timestamp: number
 * }
 */
async function handleMusicControl(
  message: {
    action: string;
    volume?: number;
    track?: { name: string; artist: string };
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { room, sessionId, userId } = ctx;
  const { action, volume, track } = message;

  getLogger().info({ action, sessionId, volume, track }, '🎵 Music control request from UI');

  try {
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();

    switch (action) {
      case 'pause':
        musicPlayer.pause();
        getLogger().info('🎵 Music paused via UI button');
        break;

      case 'resume':
      case 'play':
        await musicPlayer.resume();
        getLogger().info('🎵 Music resumed via UI button');
        break;

      case 'skip':
        await musicPlayer.skip();
        getLogger().info('🎵 Music skipped via UI button');
        break;

      case 'volume':
        if (typeof volume === 'number') {
          // Volume is 0-100 from UI, convert to 0-1 for music player
          musicPlayer.setVolume(volume / 100);
          getLogger().info({ volume }, '🎵 Music volume adjusted via UI');
        }
        break;

      case 'favorite':
        if (track) {
          // Log favorite for analytics - can be stored in Firestore later
          // The music learning system is for transition learning, not track favorites
          getLogger().info(
            {
              userId: userId ?? 'anonymous',
              sessionId,
              trackName: track.name,
              artist: track.artist,
              action: 'favorite',
            },
            '🎵 Track favorited via UI button'
          );
        }
        break;

      default:
        getLogger().warn({ action }, '🎵 Unknown music control action');
    }

    // Send acknowledgment back to frontend
    const ackMessage = JSON.stringify({
      type: 'music_control_ack',
      action,
      success: true,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });
  } catch (err) {
    getLogger().error({ error: String(err), action }, '🎵 Music control failed');

    // Send failure response
    const errorMessage = JSON.stringify({
      type: 'music_control_ack',
      action,
      success: false,
      error: String(err),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(errorMessage), {
      reliable: true,
    });
  }
}

// ============================================================================
// REPEAT LAST HANDLER
// ============================================================================

/**
 * Handle repeat_last messages - replay the last agent response via TTS.
 *
 * This allows users to hear the last response again if they missed it.
 * Uses coordinatedSay for proper speech coordination.
 */
async function handleRepeatLast(
  message: {
    text: string;
    personaId?: string;
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { room, sessionId } = ctx;
  const { text, personaId } = message;

  if (!text) {
    getLogger().warn({ sessionId }, '🔄 Repeat last request with no text');
    return;
  }

  getLogger().info(
    { sessionId, personaId, textLength: text.length },
    '🔄 Repeat last response requested'
  );

  try {
    // Use coordinated speech to replay the text
    coordinatedSay(sessionId, text, { allowInterruptions: true });

    // Send acknowledgment back to frontend
    const ackMessage = JSON.stringify({
      type: 'repeat_last_ack',
      success: true,
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
      reliable: true,
    });

    getLogger().info({ sessionId }, '🔄 Repeat last response completed');
  } catch (err) {
    getLogger().error({ error: String(err), sessionId }, '🔄 Repeat last failed');

    // Send failure response
    const errorMessage = JSON.stringify({
      type: 'repeat_last_ack',
      success: false,
      error: String(err),
      timestamp: Date.now(),
    });
    await room.localParticipant?.publishData(new TextEncoder().encode(errorMessage), {
      reliable: true,
    });
  }
}

// ============================================================================
// USER REACTION HANDLER
// ============================================================================

/**
 * Handle user_reaction messages - quick reaction buttons from frontend.
 *
 * Reactions are emotional feedback that can:
 * 1. Be logged for analytics (engagement tracking)
 * 2. Inform the agent's understanding of user sentiment
 * 3. Trigger visual feedback on the frontend (handled there)
 *
 * Message format:
 * {
 *   type: 'user_reaction',
 *   reactionId: 'thumbs_up' | 'heart' | 'sparkles' | 'lightbulb' | 'smile' | 'clap',
 *   label: string,
 *   timestamp: number
 * }
 */
async function handleUserReaction(
  message: {
    reactionId: string;
    label?: string;
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { room, sessionId, sessionPersona, userId } = ctx;
  const { reactionId, label, timestamp } = message;

  getLogger().info(
    {
      sessionId,
      reactionId,
      label,
      userId,
      personaId: sessionPersona?.id,
    },
    '🎭 User sent reaction'
  );

  // Track engagement event for analytics (fire and forget)
  // Reactions are logged to understand user sentiment and engagement
  fireAndForget(async () => {
    try {
      // Log the reaction for analytics - could be extended to store in Firestore
      getLogger().debug(
        {
          sessionId,
          userId,
          reactionId,
          personaId: sessionPersona?.id,
          timestamp: timestamp || Date.now(),
        },
        '🎭 Reaction tracked for analytics'
      );
    } catch (err) {
      getLogger().warn({ error: String(err), sessionId }, '🎭 Failed to record reaction');
    }
  }, 'user_reaction_tracking');

  // Send acknowledgment back to frontend
  const ackMessage = JSON.stringify({
    type: 'user_reaction_ack',
    reactionId,
    success: true,
    timestamp: Date.now(),
  });
  await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
    reliable: true,
  });
}

// ============================================================================
// USER FEEDBACK HANDLER (Contextual Feedback System)
// ============================================================================

/**
 * Handle user_feedback messages - contextual feedback from avatar-attached UI.
 *
 * This is the new contextual feedback system that collects micro-feedback
 * during natural conversation pauses. The feedback is stored and can influence
 * the ongoing conversation.
 *
 * Message format:
 * {
 *   type: 'user_feedback',
 *   feedbackId: string,      // ID from the feedback_prompt event
 *   reaction: 'resonated' | 'helpful' | 'too_much' | 'off_track' | 'skipped',
 *   responseTimeMs: number,  // Time from prompt to response
 *   timestamp: number
 * }
 */
async function handleUserFeedback(
  message: {
    feedbackId: string;
    reaction: string;
    responseTimeMs?: number;
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { room, sessionId, sessionPersona, userId } = ctx;
  const { feedbackId, reaction, responseTimeMs, timestamp } = message;

  getLogger().info(
    {
      sessionId,
      feedbackId,
      reaction,
      responseTimeMs,
      userId,
      personaId: sessionPersona?.id,
    },
    '📊 User sent contextual feedback'
  );

  // Record the feedback reaction (fire and forget)
  fireAndForget(async () => {
    try {
      const { recordFeedbackReaction } = await import('../../services/feedback/index.js');

      if (userId && feedbackId) {
        const result = await recordFeedbackReaction({
          feedbackId,
          userId,
          reaction: reaction as 'resonated' | 'helpful' | 'too_much' | 'off_track' | 'skipped',
        });

        if (result.ok) {
          getLogger().info(
            { feedbackId, reaction, userId },
            '📊 Feedback reaction recorded successfully'
          );
        } else {
          getLogger().warn(
            { feedbackId, reason: result.reason },
            '📊 Failed to record feedback reaction'
          );
        }
      }
    } catch (err) {
      getLogger().warn({ error: String(err), feedbackId }, '📊 Failed to record feedback');
    }
  }, 'user_feedback_recording');

  // Update the feedback trigger engine with emotional tone based on reaction
  fireAndForget(async () => {
    try {
      const { feedbackTriggerEngine } = await import('../feedback/index.js');

      // Map reaction to emotional tone for future context
      if (reaction === 'too_much') {
        feedbackTriggerEngine.onEmotionalToneChange(sessionId, 'heavy');
      } else if (reaction === 'resonated' || reaction === 'helpful') {
        feedbackTriggerEngine.onEmotionalToneChange(sessionId, 'positive');
      }
    } catch (err) {
      getLogger().debug({ error: String(err) }, '📊 Failed to update feedback trigger state');
    }
  }, 'user_feedback_trigger_update');

  // Send acknowledgment back to frontend
  const ackMessage = JSON.stringify({
    type: 'user_feedback_ack',
    feedbackId,
    success: true,
    timestamp: Date.now(),
  });
  await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
    reliable: true,
  });
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
  const { devMode } = services as SessionServices & { devMode?: DevModeState };
  return devMode?.enabled === true && devMode?.bypassUnlocks === true;
}

/**
 * Get simulated tier from dev mode, if set.
 */
export function getDevModeSimulatedTier(
  services: SessionServices
): 'free' | 'friend' | 'partner' | undefined {
  const { devMode } = services as SessionServices & { devMode?: DevModeState };
  return devMode?.enabled ? devMode.simulatedTier : undefined;
}

// ============================================================================
// SYNTHETIC TEXT HANDLER (E2E Testing)
// ============================================================================

/**
 * Handle synthetic_text messages - inject text as if it came from STT
 *
 * This bypasses actual speech recognition but exercises the FULL LLM pipeline:
 * - generateReply() is called with the synthetic text
 * - Gemini processes the text and decides on tool calls
 * - Semantic router can pre-route if enabled
 * - Full diagnostic logging captures what happens
 *
 * Message format:
 * {
 *   type: 'synthetic_text',
 *   text: 'What is the weather in Zion National Park?',
 *   expectTool?: 'getWeather',  // Optional: expected tool for validation
 *   testId?: string,            // Optional: test identifier for correlation
 *   bypassSemanticRouter?: boolean  // If true, send directly to Gemini
 * }
 *
 * Response format (sent back via data channel):
 * {
 *   type: 'synthetic_text_result',
 *   testId: string,
 *   success: boolean,
 *   input: string,
 *   routing: { attempted, handled, toolId, confidence },
 *   llm: { called, responseReceived, duration },
 *   toolsDetected: string[],
 *   diagnostics: { ... }
 * }
 */
async function handleSyntheticText(
  message: {
    text: string;
    expectTool?: string;
    testId?: string;
    bypassSemanticRouter?: boolean;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { session, room, sessionId, sessionPersona, userId } = ctx;
  const { text, expectTool, testId, bypassSemanticRouter } = message;
  const startTime = Date.now();

  getLogger().info(
    {
      testId,
      text: text.slice(0, 100),
      expectTool,
      bypassSemanticRouter,
      personaId: sessionPersona.id,
      sessionId,
    },
    '🧪 [SYNTHETIC] ========== SYNTHETIC TEXT TEST STARTING =========='
  );

  if (!text || !session) {
    getLogger().warn({ testId }, '🧪 [SYNTHETIC] Missing text or session');
    return;
  }

  const result: {
    type: string;
    testId: string;
    success: boolean;
    input: string;
    routing: {
      attempted: boolean;
      handled: boolean;
      toolId?: string;
      confidence?: number;
    };
    llm: {
      called: boolean;
      generateReplyInvoked: boolean;
      durationMs?: number;
    };
    expectTool?: string;
    matched: boolean;
    diagnostics: {
      personaId: string;
      sessionId: string;
      timestamp: string;
      totalDurationMs: number;
    };
  } = {
    type: 'synthetic_text_result',
    testId: testId || `test-${Date.now()}`,
    success: false,
    input: text,
    routing: {
      attempted: false,
      handled: false,
    },
    llm: {
      called: false,
      generateReplyInvoked: false,
    },
    expectTool,
    matched: false,
    diagnostics: {
      personaId: sessionPersona.id,
      sessionId,
      timestamp: new Date().toISOString(),
      totalDurationMs: 0,
    },
  };

  try {
    // Step 1: Try semantic routing first (unless bypassed)
    if (!bypassSemanticRouter) {
      try {
        const { routeTranscript, isSemanticRoutingEnabled } =
          await import('../../tools/semantic-router/integration/transcript-integration.js');

        if (isSemanticRoutingEnabled()) {
          getLogger().info(
            { testId, text: text.slice(0, 50) },
            '🧪 [SYNTHETIC] Attempting semantic routing...'
          );

          // Create mock session for routing (tracks if generateReply was called)
          let generateReplyCalled = false;
          let generateReplyInstructions = '';
          const mockSession = {
            generateReply: (options: { instructions: string }) => {
              generateReplyCalled = true;
              generateReplyInstructions = options.instructions;
              getLogger().info(
                {
                  testId,
                  instructionsLength: options.instructions?.length,
                  instructionsPreview: options.instructions?.slice(0, 200),
                },
                '🧪 [SYNTHETIC] generateReply() called by semantic router'
              );
            },
          };

          const routingResult = await routeTranscript(text, {
            userId: userId || 'synthetic-test',
            sessionId,
            personaId: sessionPersona.id,
            session: mockSession,
            conversationHistory: [],
            recentTools: [],
          });

          result.routing = {
            attempted: routingResult.attempted,
            handled: routingResult.handled,
            toolId: routingResult.toolId,
            confidence: routingResult.confidence,
          };

          getLogger().info(
            {
              testId,
              ...result.routing,
              generateReplyCalled,
            },
            '🧪 [SYNTHETIC] Semantic routing result'
          );

          // If routing handled it with high confidence
          if (routingResult.handled && routingResult.toolId) {
            result.success = true;
            result.matched = !expectTool || routingResult.toolId === expectTool;
            result.diagnostics.totalDurationMs = Date.now() - startTime;

            getLogger().info(
              {
                testId,
                toolId: routingResult.toolId,
                expectTool,
                matched: result.matched,
                durationMs: result.diagnostics.totalDurationMs,
              },
              '🧪 [SYNTHETIC] ✅ Semantic router handled the request'
            );

            // Send result back to frontend
            await sendSyntheticResult(room, result);
            return;
          }
        }
      } catch (routingErr) {
        getLogger().warn(
          { testId, error: String(routingErr) },
          '🧪 [SYNTHETIC] Semantic routing failed, falling back to LLM'
        );
      }
    }

    // Step 2: Send to Gemini via generateReply gateway
    getLogger().info(
      { testId, text: text.slice(0, 50) },
      '🧪 [SYNTHETIC] Sending to Gemini via generateReply gateway...'
    );

    result.llm.called = true;

    // Use gateway for proper error handling and session readiness checks
    // Don't await - this is async and streams
    fireAndForget(async () => {
      await generateReply(session, sessionId, {
        instructions: `The user said: "${text}"

IMPORTANT: This is a SYNTHETIC TEST to validate tool execution.
If this request requires a tool (like weather, music, handoff), you MUST call that tool.
Do NOT just respond conversationally - CALL THE APPROPRIATE TOOL.

For example:
- "What's the weather..." → Call getWeather tool
- "Play some music..." → Call playMusic tool
- "Transfer me to..." → Call handoff tool`,
        context: 'synthetic-text-test',
        priority: 'normal', // Test requests use normal priority
      });
    }, 'synthetic-text-test');

    result.llm.generateReplyInvoked = true;
    result.llm.durationMs = Date.now() - startTime;

    getLogger().info(
      { testId, durationMs: result.llm.durationMs },
      '🧪 [SYNTHETIC] generateReply gateway invoked - LLM is processing'
    );

    // Note: generateReply is async and streams - we can't easily capture the response here
    // The tool execution will be logged by the tool-call-sanitizer and json-function-executor
    result.success = true;
    result.diagnostics.totalDurationMs = Date.now() - startTime;

    // Send result back to frontend
    await sendSyntheticResult(room, result);

    getLogger().info(
      {
        testId,
        totalDurationMs: result.diagnostics.totalDurationMs,
        routingHandled: result.routing.handled,
        llmInvoked: result.llm.generateReplyInvoked,
      },
      '🧪 [SYNTHETIC] ========== SYNTHETIC TEXT TEST COMPLETE =========='
    );
  } catch (err) {
    getLogger().error(
      { testId, error: String(err) },
      '🧪 [SYNTHETIC] ❌ Synthetic text test failed'
    );

    result.success = false;
    result.diagnostics.totalDurationMs = Date.now() - startTime;
    await sendSyntheticResult(room, result);
  }
}

/**
 * Send synthetic test result back to frontend via data channel
 */
async function sendSyntheticResult(room: Room, result: Record<string, unknown>): Promise<void> {
  try {
    const message = JSON.stringify(result);
    await room.localParticipant?.publishData(new TextEncoder().encode(message), {
      reliable: true,
    });
  } catch (err) {
    getLogger().warn({ error: String(err) }, '🧪 [SYNTHETIC] Failed to send result');
  }
}

export default setupDataChannelHandler;
