/**
 * Voice Agent Data Channel Handler
 *
 * Handles incoming data messages from the frontend via LiveKit data channel:
 * - handoff_request: User clicks a persona in the UI to switch
 * - game_start_request: User starts a game from the UI game picker
 * - voice-pack-change: User changes voice pack from Personalize UI
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/data-channel-handler
 */

import { log as livekitLog } from '@livekit/agents';
import type { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import {
  createHandoffTools,
  executeHandoff,
  getCurrentAgent,
} from '../../tools/handoff/index.js';
import type { UserData } from '../shared/types.js';

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

const logger = livekitLog();

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
    logger.info(
      { ourIdentity, theirIdentity, dataLength: data?.length },
      '📩 Data received from participant'
    );

    // Only process messages from our user (not from ourselves)
    if (!participant) {
      logger.warn('🚫 Ignoring message: no participant info attached');
      return;
    }
    if (theirIdentity === ourIdentity) {
      logger.debug('Ignoring message: from ourselves (agent)');
      return;
    }

    try {
      const rawText = new TextDecoder().decode(data);
      logger.info({ rawText: rawText.slice(0, 200) }, '📝 Raw data message received');

      const message = JSON.parse(rawText);
      logger.info(
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

      if (message.type === 'voice-pack-change') {
        await handleVoicePackChange(message, ctx);
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

  logger.info({ targetPersona }, '🎯 User requested handoff via UI');
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

  logger.info(
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
      logger.warn({ error: String(ackErr) }, 'Failed to send handoff ack');
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
      logger.warn({ error: String(failErr) }, 'Failed to send handoff_failed');
    }
  };

  // Check if we have a valid handoff target
  const toolDefinition =
    handoffToolSet.toolsByAgentId.get(canonicalId) ||
    handoffToolSet.toolsByName.get(toolNameLower);

  if (toolDefinition) {
    logger.info(
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

      logger.info({ result: JSON.stringify(result).slice(0, 500) }, '📦 Handoff result');

      if (!result.success) {
        logger.warn({ error: result.error, rateLimited: result.rateLimited }, '⚠️ Handoff blocked');
        await sendAck(false, result.error || 'Handoff failed');
        if (!result.rateLimited) {
          await sendFailure(result.error || 'Handoff failed');
        }
      } else {
        logger.info({ newAgent: result.targetAgent }, '✅ Handoff executed');
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
            logger.warn({ error: String(identityErr) }, 'Identity injection failed (non-fatal)');
          }
        }
      }
    } catch (handoffErr) {
      logger.error({ error: String(handoffErr) }, '❌ Handoff execution failed');
      await sendFailure(String(handoffErr));
    }
  } else {
    logger.warn({ targetPersona, toolName }, '⚠️ Unknown handoff target or tool not found');
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

  logger.info({ gameType }, '🎮 User requested game start via UI');

  try {
    const { getGameEngine } = await import('../../services/games/index.js');
    const engine = getGameEngine(sessionPersona.id);

    // Start the game - returns welcome message
    // Cast gameType since it comes from user input via data channel
    type GameType = import('../../services/games/types.js').GameType;
    const welcomeMessage = await engine.startGame(gameType as GameType);
    logger.info({ gameType, welcomeMessage }, '🎮 Game engine returned welcome message');

    // CRITICAL: Make the agent actually SPEAK the welcome message
    if (welcomeMessage && session) {
      logger.info({ welcomeMessage }, '🎮 Agent speaking game welcome...');

      session.generateReply({
        instructions: `You are starting a music game called "${gameType}".
        Say the following welcome message naturally, with enthusiasm:

        "${welcomeMessage}"

        After speaking, wait for the user's response.`,
      });

      logger.info('🎮 Agent spoke welcome message');
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

    logger.info({ gameType }, '🎮 Game started successfully');
  } catch (gameErr) {
    logger.error({ error: String(gameErr), gameType }, '❌ Game start failed');

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
 * Handle voice-pack-change messages - user changed voice pack from UI
 */
async function handleVoicePackChange(
  message: { type: string; packId: string },
  ctx: DataChannelContext
): Promise<void> {
  const { room, userId } = ctx;

  logger.info({ packId: message.packId }, '🎤 User changed voice pack via Personalize');

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

    logger.info({ packId: message.packId }, '🎤 Voice pack updated successfully');
  } catch (voicePackErr) {
    logger.warn({ error: String(voicePackErr) }, 'Voice pack change failed');
  }
}

export default setupDataChannelHandler;
