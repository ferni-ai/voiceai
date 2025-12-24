/**
 * Participant Registry
 *
 * Manages participants in a group conversation.
 * Tracks who's in the room, their roles, and connection status.
 *
 * @module agents/group-conversation/participant-registry
 */

import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  GroupParticipant,
  ParticipantType,
  ParticipantRole,
  GroupConversationEvent,
} from './types.js';

const log = getLogger();

// ============================================================================
// PARTICIPANT REGISTRY
// ============================================================================

/**
 * Registry for managing group conversation participants.
 *
 * Handles:
 * - Adding/removing participants
 * - Tracking connection status
 * - Role assignment
 * - Events for participant changes
 */
export class ParticipantRegistry extends EventEmitter {
  private participants: Map<string, GroupParticipant> = new Map();
  private readonly sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    log.debug({ sessionId }, 'ParticipantRegistry created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Add a new participant
   */
  add(participant: GroupParticipant): void {
    if (this.participants.has(participant.id)) {
      log.warn({ participantId: participant.id }, 'Participant already exists');
      return;
    }

    this.participants.set(participant.id, participant);

    log.info(
      {
        participantId: participant.id,
        name: participant.name,
        type: participant.type,
        role: participant.role,
      },
      'Participant added'
    );

    this.emit('participant_joined', { participant } satisfies Partial<GroupConversationEvent>);
  }

  /**
   * Remove a participant
   */
  remove(participantId: string, reason?: string): boolean {
    const participant = this.participants.get(participantId);
    if (!participant) {
      log.warn({ participantId }, 'Cannot remove: participant not found');
      return false;
    }

    participant.leftAt = new Date();
    this.participants.delete(participantId);

    log.info({ participantId, name: participant.name, reason }, 'Participant removed');

    this.emit('participant_left', {
      participantId,
      reason,
    } satisfies Partial<GroupConversationEvent>);

    return true;
  }

  /**
   * Get a participant by ID
   */
  get(participantId: string): GroupParticipant | undefined {
    return this.participants.get(participantId);
  }

  /**
   * Get all participants
   */
  getAll(): GroupParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get participants by type
   */
  getByType(type: ParticipantType): GroupParticipant[] {
    return this.getAll().filter((p) => p.type === type);
  }

  /**
   * Get participants by role
   */
  getByRole(role: ParticipantRole): GroupParticipant[] {
    return this.getAll().filter((p) => p.role === role);
  }

  /**
   * Get the initiator (user who started the conversation)
   */
  getInitiator(): GroupParticipant | undefined {
    return this.getByRole('initiator')[0];
  }

  /**
   * Get the moderator (usually Ferni)
   */
  getModerator(): GroupParticipant | undefined {
    return this.getByRole('moderator')[0];
  }

  /**
   * Get all active agents
   */
  getAgents(): GroupParticipant[] {
    return this.getByType('agent');
  }

  /**
   * Get all external participants (phone)
   */
  getExternalParticipants(): GroupParticipant[] {
    return this.getByType('external');
  }

  /**
   * Check if a participant exists
   */
  has(participantId: string): boolean {
    return this.participants.has(participantId);
  }

  /**
   * Get participant count
   */
  get count(): number {
    return this.participants.size;
  }

  /**
   * Update a participant's role
   */
  updateRole(participantId: string, role: ParticipantRole): boolean {
    const participant = this.participants.get(participantId);
    if (!participant) return false;

    participant.role = role;
    log.debug({ participantId, role }, 'Participant role updated');
    return true;
  }

  /**
   * Update a participant's speaking state
   */
  updateSpeakingState(participantId: string, state: 'silent' | 'speaking' | 'listening'): boolean {
    const participant = this.participants.get(participantId);
    if (!participant) return false;

    participant.speakingState = state;
    return true;
  }

  /**
   * Find participant by phone number
   */
  findByPhoneNumber(phoneNumber: string): GroupParticipant | undefined {
    return this.getAll().find((p) => {
      if (p.connection.type !== 'sip') return false;
      return p.connection.phoneNumber === phoneNumber;
    });
  }

  /**
   * Find participant by persona ID (for agents)
   */
  findByPersonaId(personaId: string): GroupParticipant | undefined {
    return this.getAll().find((p) => {
      if (p.connection.type !== 'agent') return false;
      return p.connection.personaId === personaId;
    });
  }

  /**
   * Get participant summary for logging/context
   */
  getSummary(): string {
    const parts = this.getAll().map((p) => {
      const indicator = p.speakingState === 'speaking' ? '🎤' : '';
      return `${indicator}${p.name} (${p.type})`;
    });
    return parts.join(', ');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.participants.clear();
    this.removeAllListeners();
    log.debug({ sessionId: this.sessionId }, 'ParticipantRegistry destroyed');
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new participant registry
 */
export function createParticipantRegistry(sessionId: string): ParticipantRegistry {
  return new ParticipantRegistry(sessionId);
}

/**
 * Create a user participant (the person using Ferni)
 */
export function createUserParticipant(identity: string, name?: string): GroupParticipant {
  return {
    id: `user_${identity}`,
    name: name ?? 'You',
    type: 'human',
    connection: { type: 'webrtc', identity },
    role: 'initiator',
    speakingState: 'silent',
    joinedAt: new Date(),
  };
}

/**
 * Create an agent participant
 */
export function createAgentParticipant(
  personaId: string,
  name: string,
  role: ParticipantRole = 'expert'
): GroupParticipant {
  return {
    id: `agent_${personaId}`,
    name,
    type: 'agent',
    connection: { type: 'agent', personaId },
    role,
    speakingState: 'silent',
    joinedAt: new Date(),
  };
}

/**
 * Create an external participant (phone)
 */
export function createExternalParticipant(
  phoneNumber: string,
  callSid: string,
  name: string,
  relationship?: string
): GroupParticipant {
  return {
    id: `ext_${callSid}`,
    name,
    type: 'external',
    connection: { type: 'sip', phoneNumber, callSid },
    role: 'participant',
    speakingState: 'silent',
    joinedAt: new Date(),
    relationship,
  };
}
