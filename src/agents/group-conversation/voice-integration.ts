/**
 * Group Conversation Voice Integration
 *
 * Integrates group conversations with the LiveKit voice agent.
 * Handles data channel messages for starting roundtables, adding participants, etc.
 *
 * @module agents/group-conversation/voice-integration
 */

import type { JobContext } from '@livekit/agents';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { TeamRoundtable, TeamRoundtableConfig } from './team-roundtable.js';
import type { ConferenceCallManager } from './conference-call-manager.js';
import type { GroupConversationManager } from './group-conversation-manager.js';
import type { RoundtableConfig, AddParticipantRequest } from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Data channel message types for group conversations
 */
export type GroupDataChannelMessage =
  // Team Roundtable
  | {
      type: 'group_roundtable_start';
      personas: string[];
      topic?: string;
      collaborationMode?: string;
    }
  | { type: 'group_roundtable_end'; reason?: string }

  // Conference Call
  | {
      type: 'group_call_add';
      phoneNumber: string;
      name: string;
      relationship?: string;
    }
  | { type: 'group_call_remove'; participantId: string; reason?: string }

  // General
  | { type: 'group_end'; reason?: string }
  | { type: 'group_get_state' };

/**
 * Response messages sent back to frontend
 */
export type GroupDataChannelResponse =
  | {
      type: 'group_roundtable_started';
      sessionId: string;
      personas: string[];
      topic?: string;
    }
  | { type: 'group_roundtable_ended'; sessionId: string }
  | {
      type: 'group_call_participant_added';
      participantId: string;
      name: string;
      status: 'dialing' | 'ringing' | 'connected';
    }
  | {
      type: 'group_call_participant_status';
      participantId: string;
      status: string;
    }
  | { type: 'group_call_participant_removed'; participantId: string }
  | {
      type: 'group_state';
      mode: 'team_roundtable' | 'conference_call' | 'hybrid' | null;
      participants: Array<{ id: string; name: string; type: string; isSpeaking: boolean }>;
    }
  | { type: 'group_error'; error: string };

/**
 * Configuration for the voice integration
 */
export interface VoiceIntegrationConfig {
  /** LiveKit job context */
  ctx: JobContext;

  /** LiveKit room */
  room: Room;

  /** User participant */
  userParticipant: RemoteParticipant;

  /** Session ID */
  sessionId: string;

  /** User ID (optional, defaults to 'anonymous') */
  userId?: string;

  /** Factory to create roundtable agents */
  createRoundtableAgent?: TeamRoundtableConfig['createAgent'];

  /** Webhook base URL for conference calls */
  webhookBaseUrl?: string;
}

// ============================================================================
// VOICE INTEGRATION CLASS
// ============================================================================

/**
 * GroupVoiceIntegration
 *
 * Bridges the frontend UI with the group conversation backend via LiveKit data channels.
 */
export class GroupVoiceIntegration {
  private readonly config: VoiceIntegrationConfig;
  private manager: GroupConversationManager | null = null;
  private roundtable: TeamRoundtable | null = null;
  private conferenceCall: ConferenceCallManager | null = null;

  constructor(config: VoiceIntegrationConfig) {
    this.config = config;
    log.info({ sessionId: config.sessionId }, '🎙️ GroupVoiceIntegration created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Handle incoming data channel messages
   */
  async handleDataChannelMessage(data: unknown): Promise<void> {
    if (!isGroupDataChannelMessage(data)) {
      return; // Not a group conversation message
    }

    const message = data as GroupDataChannelMessage;

    log.debug(
      { type: message.type, sessionId: this.config.sessionId },
      '🎙️ Group data channel message'
    );

    try {
      switch (message.type) {
        case 'group_roundtable_start':
          await this.handleRoundtableStart(message);
          break;

        case 'group_roundtable_end':
          await this.handleRoundtableEnd(message);
          break;

        case 'group_call_add':
          await this.handleCallAdd(message);
          break;

        case 'group_call_remove':
          await this.handleCallRemove(message);
          break;

        case 'group_end':
          await this.handleGroupEnd(message);
          break;

        case 'group_get_state':
          await this.handleGetState();
          break;
      }
    } catch (error) {
      log.error(
        { error: String(error), messageType: message.type },
        '🎙️ Error handling group message'
      );
      this.sendResponse({ type: 'group_error', error: String(error) });
    }
  }

  /**
   * Check if a group conversation is active
   */
  isGroupActive(): boolean {
    return this.roundtable !== null || this.conferenceCall !== null;
  }

  /**
   * Get the current mode
   */
  getCurrentMode(): 'team_roundtable' | 'conference_call' | 'hybrid' | null {
    if (this.roundtable && this.conferenceCall) return 'hybrid';
    if (this.roundtable) return 'team_roundtable';
    if (this.conferenceCall) return 'conference_call';
    return null;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.roundtable) {
      await this.roundtable.cleanup();
      this.roundtable = null;
    }

    if (this.conferenceCall) {
      await this.conferenceCall.cleanup();
      this.conferenceCall = null;
    }

    if (this.manager) {
      await this.manager.cleanup();
      this.manager = null;
    }

    log.debug({ sessionId: this.config.sessionId }, '🎙️ GroupVoiceIntegration cleaned up');
  }

  // ==========================================================================
  // PRIVATE METHODS - MESSAGE HANDLERS
  // ==========================================================================

  /**
   * Handle roundtable start request
   */
  private async handleRoundtableStart(message: {
    personas: string[];
    topic?: string;
    collaborationMode?: string;
  }): Promise<void> {
    if (this.roundtable) {
      this.sendResponse({ type: 'group_error', error: 'Roundtable already active' });
      return;
    }

    if (!this.config.createRoundtableAgent) {
      this.sendResponse({ type: 'group_error', error: 'Roundtable not configured' });
      return;
    }

    diag.entry(`🎙️ Starting team roundtable: ${message.personas.join(', ')}`);

    // Import dynamically to avoid circular deps
    const { createTeamRoundtable } = await import('./team-roundtable.js');

    const result = await createTeamRoundtable({
      ctx: this.config.ctx,
      room: this.config.room,
      userParticipant: this.config.userParticipant,
      sessionId: this.config.sessionId,
      userId: this.config.userId ?? 'anonymous',
      roundtable: {
        personas: message.personas,
        topic: message.topic,
        collaborationMode: (message.collaborationMode as any) ?? 'discussion',
        moderator: 'ferni',
      },
      createAgent: this.config.createRoundtableAgent,
    });

    this.roundtable = result.roundtable;

    // Wire up events
    this.roundtable.on('speaker_changed', ({ speakerId }) => {
      this.broadcastSpeakerChange(speakerId);
    });

    this.sendResponse({
      type: 'group_roundtable_started',
      sessionId: this.config.sessionId,
      personas: message.personas,
      topic: message.topic,
    });

    log.info({ personas: message.personas, topic: message.topic }, '🎙️ Team roundtable started');
  }

  /**
   * Handle roundtable end request
   */
  private async handleRoundtableEnd(message: { reason?: string }): Promise<void> {
    if (!this.roundtable) {
      return;
    }

    await this.roundtable.end(message.reason);
    this.roundtable = null;

    this.sendResponse({
      type: 'group_roundtable_ended',
      sessionId: this.config.sessionId,
    });

    log.info({ reason: message.reason }, '🎙️ Team roundtable ended');
  }

  /**
   * Handle add participant request
   */
  private async handleCallAdd(message: {
    phoneNumber: string;
    name: string;
    relationship?: string;
  }): Promise<void> {
    // Create conference call manager if needed
    if (!this.conferenceCall) {
      const { createConferenceCallManager } = await import('./conference-call-manager.js');

      this.conferenceCall = createConferenceCallManager({
        room: this.config.room,
        sessionId: this.config.sessionId,
        userId: this.config.userId ?? 'anonymous',
        webhookBaseUrl: this.config.webhookBaseUrl ?? 'https://api.ferni.ai',
        manager: this.manager ?? undefined,
      });

      // Wire up events
      this.conferenceCall.on('participant_connected', ({ participant }) => {
        this.sendResponse({
          type: 'group_call_participant_status',
          participantId: participant.id,
          status: 'connected',
        });
      });

      this.conferenceCall.on('participant_disconnected', ({ participant }) => {
        this.sendResponse({
          type: 'group_call_participant_removed',
          participantId: participant.id,
        });
      });
    }

    const result = await this.conferenceCall.addParticipant({
      phoneNumber: message.phoneNumber,
      name: message.name,
      relationship: message.relationship,
      announceToRoom: true,
    });

    if (result.success) {
      this.sendResponse({
        type: 'group_call_participant_added',
        participantId: result.participantId!,
        name: message.name,
        status: 'dialing',
      });
    } else {
      this.sendResponse({
        type: 'group_error',
        error: result.error ?? 'Failed to add participant',
      });
    }

    log.info(
      { name: message.name, success: result.success },
      '🎙️ Conference call participant add request'
    );
  }

  /**
   * Handle remove participant request
   */
  private async handleCallRemove(message: {
    participantId: string;
    reason?: string;
  }): Promise<void> {
    if (!this.conferenceCall) {
      return;
    }

    await this.conferenceCall.removeParticipant(message.participantId, message.reason);

    this.sendResponse({
      type: 'group_call_participant_removed',
      participantId: message.participantId,
    });

    log.info({ participantId: message.participantId }, '🎙️ Conference call participant removed');
  }

  /**
   * Handle group end request
   */
  private async handleGroupEnd(message: { reason?: string }): Promise<void> {
    await this.cleanup();
    log.info({ reason: message.reason }, '🎙️ Group conversation ended');
  }

  /**
   * Handle get state request
   */
  private async handleGetState(): Promise<void> {
    const mode = this.getCurrentMode();
    const participants: Array<{ id: string; name: string; type: string; isSpeaking: boolean }> = [];

    if (this.manager) {
      for (const p of this.manager.getParticipants()) {
        participants.push({
          id: p.id,
          name: p.name,
          type: p.type,
          isSpeaking: p.speakingState === 'speaking',
        });
      }
    }

    this.sendResponse({
      type: 'group_state',
      mode,
      participants,
    });
  }

  // ==========================================================================
  // PRIVATE METHODS - UTILITIES
  // ==========================================================================

  /**
   * Send a response back to the frontend
   */
  private sendResponse(response: GroupDataChannelResponse): void {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(response));

    this.config.room.localParticipant?.publishData(data, { reliable: true });
  }

  /**
   * Broadcast speaker change to frontend
   */
  private broadcastSpeakerChange(speakerId: string | null): void {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      JSON.stringify({
        type: 'group_speaker_changed',
        speakerId,
      })
    );

    this.config.room.localParticipant?.publishData(data, { reliable: true });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type guard for group data channel messages
 */
function isGroupDataChannelMessage(data: unknown): data is GroupDataChannelMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const message = data as Record<string, unknown>;
  const type = message.type;

  return (
    type === 'group_roundtable_start' ||
    type === 'group_roundtable_end' ||
    type === 'group_call_add' ||
    type === 'group_call_remove' ||
    type === 'group_end' ||
    type === 'group_get_state'
  );
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a group voice integration handler
 */
export function createGroupVoiceIntegration(config: VoiceIntegrationConfig): GroupVoiceIntegration {
  return new GroupVoiceIntegration(config);
}

/**
 * Set up group conversation data channel handler on a room
 */
export function setupGroupDataChannelHandler(
  room: Room,
  integration: GroupVoiceIntegration
): () => void {
  const handler = (payload: Uint8Array) => {
    try {
      const decoder = new TextDecoder();
      const text = decoder.decode(payload);
      const data = JSON.parse(text);

      if (isGroupDataChannelMessage(data)) {
        integration.handleDataChannelMessage(data).catch((err) => {
          log.error({ error: String(err) }, 'Error handling group data channel message');
        });
      }
    } catch {
      // Not JSON or not a group message, ignore
    }
  };

  room.on('dataReceived', handler);

  // Return cleanup function
  return () => {
    room.off('dataReceived', handler);
  };
}
