/**
 * Voice Agent Data Channel Handler
 *
 * Handles incoming data messages from the frontend via LiveKit data channel:
 * - handoff_request: User clicks a persona in the UI to switch
 * - game_start_request: User starts a game from the UI game picker
 * - practice_start_request: User starts a guided practice from the UI
 * - voice-pack-change: User changes voice pack from Personalize UI
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/data-channel-handler
 */

import type { voice } from '@livekit/agents';
import { log as livekitLog } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { createHandoffTools, executeHandoff, getCurrentAgent } from '../../tools/handoff/index.js';
import type { UserData } from '../shared/types.js';
import {
  isHandoffInProgress,
  completeHandoff,
  getNextMessageSeq,
  getHandoffPersonaInfo,
} from '../shared/handoff/session-state.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DataChannelContext {
  /** LiveKit room instance */
  room: Room;
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
    setPersona: (persona: PersonaConfig) => void;
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
 */
async function handleHandoffRequest(
  message: { target: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, services, voiceAgentRef } = ctx;
  const targetPersona = message.target;

  getLogger().info({ targetPersona }, '🎯 User requested handoff via UI');
  diag.entry(`🎯 User requested handoff via UI to: ${targetPersona}`);

  // Get handoff tools using the new factory
  const handoffToolSet = await createHandoffTools();

  // Map persona IDs to canonical IDs for lookup
  const personaToCanonical: Record<string, string> = {
    // Canonical IDs
    ferni: 'ferni',
    'peter-john': 'peter-john',
    'alex-chen': 'alex-chen',
    'maya-santos': 'maya-santos',
    'jordan-taylor': 'jordan-taylor',
    'nayan-patel': 'nayan-patel',
    // Legacy aliases (for backward compatibility)
    'jack-b': 'ferni',
    'comm-specialist': 'alex-chen',
    'spend-save': 'maya-santos',
    'event-planner': 'jordan-taylor',
    // Short names
    alex: 'alex-chen',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    peter: 'peter-john',
    nayan: 'nayan-patel',
  };

  const canonicalId = personaToCanonical[targetPersona] || targetPersona;
  // Tool names use first name only (e.g., handoffToNayan not handoffToNayanPatel)
  const displayName = canonicalId.split('-')[0];
  const toolName = `handoffTo${displayName.charAt(0).toUpperCase()}${displayName.slice(1)}`;
  const toolNameLower = toolName.toLowerCase();

  getLogger().info(
    {
      targetPersona,
      canonicalId,
      toolName,
      availableTools: Array.from(handoffToolSet.toolsByName.keys()),
    },
    '🔧 Looking up handoff tool'
  );

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
      const failureMessage = JSON.stringify({
        type: 'handoff_failed',
        newAgent: targetPersona,
        previousAgent: getCurrentAgent(),
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

  // Check if we have a valid handoff target
  const toolDefinition =
    handoffToolSet.toolsByAgentId.get(canonicalId) || handoffToolSet.toolsByName.get(toolNameLower);

  if (toolDefinition) {
    getLogger().info(
      { targetPersona, toolName, currentAgent: getCurrentAgent() },
      '🔄 Executing user-requested handoff'
    );

    try {
      // Execute the handoff with user profile for unlock validation
      const result = await executeHandoff(canonicalId, 'User requested via UI tap', {
        userProfile: services.userProfile,
        subscriptionTier:
          (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free',
      });

      getLogger().info({ result: JSON.stringify(result).slice(0, 500) }, '📦 Handoff result');

      if (!result.success) {
        getLogger().warn(
          { error: result.error, rateLimited: result.rateLimited },
          '⚠️ Handoff blocked'
        );
        await sendAck(false, result.error || 'Handoff failed');
        if (!result.rateLimited) {
          await sendFailure(result.error || 'Handoff failed');
        }
      } else {
        getLogger().info({ newAgent: result.targetAgent }, '✅ Handoff executed');
        await sendAck(true);

        // CRITICAL: Inject identity into LLM context
        if (result.targetAgent) {
          try {
            const { getPersonaAsync } = await import('../../personas/index.js');
            const newPersona = await getPersonaAsync(result.targetAgent);

            if (newPersona) {
              // Update the voiceAgent's persona reference AND instructions
              if (voiceAgentRef) {
                voiceAgentRef.setPersona(newPersona);
                diag.entry(`🎭 VoiceAgent persona AND instructions updated to ${newPersona.name}`);
              }
              diag.entry(`🎭 Identity switch complete for ${newPersona.name}`);
            }
          } catch (identityErr) {
            getLogger().warn(
              { error: String(identityErr) },
              'Identity injection failed (non-fatal)'
            );
          }
        }
      }
    } catch (handoffErr) {
      getLogger().error({ error: String(handoffErr) }, '❌ Handoff execution failed');
      await sendFailure(String(handoffErr));
    }
  } else {
    getLogger().warn({ targetPersona, toolName }, '⚠️ Unknown handoff target or tool not found');
    await sendAck(false, `Unknown persona: ${targetPersona}`);
    await sendFailure(`Invalid handoff target: ${targetPersona}`);
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
    if (welcomeMessage && session) {
      getLogger().info({ welcomeMessage }, '🎮 Agent speaking game welcome...');

      session.generateReply({
        instructions: `You are starting a music game called "${gameType}".
        Say the following welcome message naturally, with enthusiasm:

        "${welcomeMessage}"

        After speaking, wait for the user's response.`,
      });

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

    // Make agent acknowledge the error gracefully
    if (session) {
      session.generateReply({
        instructions: `Apologize briefly - there was a technical issue starting the game.
        Suggest the user try saying "let's play ${gameType}" instead.`,
      });
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
    // Make the agent speak the practice prompt naturally
    if (prompt && session) {
      getLogger().info(
        { commandName, promptLength: prompt.length },
        '🎯 Agent starting guided practice...'
      );

      session.generateReply({
        instructions: `The user has selected the "${commandName}" guided practice.

Begin the practice by saying the following prompt naturally, as if you're starting a guided conversation:

"${prompt}"

Wait for the user to respond before continuing. Be warm and supportive throughout this practice.`,
      });

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

    // Make agent acknowledge the error gracefully
    if (session) {
      session.generateReply({
        instructions: `Apologize briefly - there was a small hiccup starting the practice.
        Offer to guide them through "${commandName}" by just talking naturally instead.`,
      });
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
    // Make Ferni speak Claude's update naturally
    // Keep it brief and conversational
    const instruction =
      narration_type === 'result'
        ? `Say this completion message naturally and warmly: "${text}"`
        : narration_type === 'tool'
          ? `Briefly mention: "${text}" - keep it very short, just a quick update`
          : `Say this progress update naturally: "${text}"`;

    session.generateReply({
      instructions: instruction,
    });

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
      seq: getNextMessageSeq(sessionId),
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
      seq: getNextMessageSeq(sessionId),
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
        seq: getNextMessageSeq(sessionId),
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

export default setupDataChannelHandler;
