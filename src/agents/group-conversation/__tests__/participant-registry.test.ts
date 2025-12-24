/**
 * Participant Registry Tests
 *
 * Tests for managing participants in group conversations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ParticipantRegistry,
  createParticipantRegistry,
  createUserParticipant,
  createAgentParticipant,
  createExternalParticipant,
} from '../participant-registry.js';

// ============================================================================
// TESTS
// ============================================================================

describe('ParticipantRegistry', () => {
  let registry: ParticipantRegistry;

  beforeEach(() => {
    registry = createParticipantRegistry('test-session');
  });

  afterEach(() => {
    registry.destroy();
  });

  describe('Factory Functions', () => {
    it('should create user participant', () => {
      const user = createUserParticipant('user_123', 'John');

      expect(user.id).toBe('user_user_123');
      expect(user.name).toBe('John');
      expect(user.type).toBe('human');
      expect(user.role).toBe('initiator');
      expect(user.connection.type).toBe('webrtc');
    });

    it('should create agent participant', () => {
      const agent = createAgentParticipant('ferni', 'Ferni', 'moderator');

      expect(agent.id).toBe('agent_ferni');
      expect(agent.name).toBe('Ferni');
      expect(agent.type).toBe('agent');
      expect(agent.role).toBe('moderator');
      expect(agent.connection.type).toBe('agent');
      if (agent.connection.type === 'agent') {
        expect(agent.connection.personaId).toBe('ferni');
      }
    });

    it('should create external participant', () => {
      const external = createExternalParticipant('+15551234567', 'call_123', 'Sarah', 'partner');

      expect(external.id).toBe('ext_call_123');
      expect(external.name).toBe('Sarah');
      expect(external.type).toBe('external');
      expect(external.role).toBe('participant');
      expect(external.relationship).toBe('partner');
      expect(external.connection.type).toBe('sip');
    });
  });

  describe('Add/Remove Participants', () => {
    it('should add a participant', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);

      expect(registry.count).toBe(1);
      expect(registry.get('user_user_1')).toBe(user);
    });

    it('should not add duplicate participants', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);
      registry.add(user);

      expect(registry.count).toBe(1);
    });

    it('should remove a participant', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);

      const removed = registry.remove('user_user_1');

      expect(removed).toBe(true);
      expect(registry.count).toBe(0);
    });

    it('should return false when removing non-existent participant', () => {
      const removed = registry.remove('non_existent');
      expect(removed).toBe(false);
    });

    it('should set leftAt when removing', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);
      registry.remove('user_user_1');

      expect(user.leftAt).toBeDefined();
    });
  });

  describe('Query Participants', () => {
    beforeEach(() => {
      registry.add(createUserParticipant('user_1', 'John'));
      registry.add(createAgentParticipant('ferni', 'Ferni', 'moderator'));
      registry.add(createAgentParticipant('peter', 'Peter', 'expert'));
      registry.add(createExternalParticipant('+15551234567', 'call_1', 'Sarah'));
    });

    it('should get all participants', () => {
      const all = registry.getAll();
      expect(all.length).toBe(4);
    });

    it('should get participants by type', () => {
      const agents = registry.getByType('agent');
      expect(agents.length).toBe(2);

      const humans = registry.getByType('human');
      expect(humans.length).toBe(1);

      const externals = registry.getByType('external');
      expect(externals.length).toBe(1);
    });

    it('should get participants by role', () => {
      const moderators = registry.getByRole('moderator');
      expect(moderators.length).toBe(1);
      expect(moderators[0].name).toBe('Ferni');

      const experts = registry.getByRole('expert');
      expect(experts.length).toBe(1);
    });

    it('should get initiator', () => {
      const initiator = registry.getInitiator();
      expect(initiator?.name).toBe('John');
    });

    it('should get moderator', () => {
      const moderator = registry.getModerator();
      expect(moderator?.name).toBe('Ferni');
    });

    it('should get all agents', () => {
      const agents = registry.getAgents();
      expect(agents.length).toBe(2);
    });

    it('should get external participants', () => {
      const externals = registry.getExternalParticipants();
      expect(externals.length).toBe(1);
      expect(externals[0].name).toBe('Sarah');
    });

    it('should check if participant exists', () => {
      expect(registry.has('user_user_1')).toBe(true);
      expect(registry.has('non_existent')).toBe(false);
    });
  });

  describe('Find Participants', () => {
    beforeEach(() => {
      registry.add(createAgentParticipant('ferni', 'Ferni'));
      registry.add(createExternalParticipant('+15551234567', 'call_1', 'Sarah'));
      registry.add(createExternalParticipant('+15559876543', 'call_2', 'Bob'));
    });

    it('should find by phone number', () => {
      const participant = registry.findByPhoneNumber('+15551234567');
      expect(participant?.name).toBe('Sarah');
    });

    it('should return undefined for non-existent phone', () => {
      const participant = registry.findByPhoneNumber('+10000000000');
      expect(participant).toBeUndefined();
    });

    it('should find by persona ID', () => {
      const participant = registry.findByPersonaId('ferni');
      expect(participant?.name).toBe('Ferni');
    });

    it('should return undefined for non-existent persona', () => {
      const participant = registry.findByPersonaId('maya');
      expect(participant).toBeUndefined();
    });
  });

  describe('Update Participants', () => {
    it('should update role', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);

      registry.updateRole('user_user_1', 'moderator');

      expect(user.role).toBe('moderator');
    });

    it('should update speaking state', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);

      registry.updateSpeakingState('user_user_1', 'speaking');

      expect(user.speakingState).toBe('speaking');
    });

    it('should return false for non-existent participant updates', () => {
      expect(registry.updateRole('non_existent', 'moderator')).toBe(false);
      expect(registry.updateSpeakingState('non_existent', 'speaking')).toBe(false);
    });
  });

  describe('Summary', () => {
    it('should generate summary string', () => {
      registry.add(createUserParticipant('user_1', 'John'));
      registry.add(createAgentParticipant('ferni', 'Ferni'));

      const summary = registry.getSummary();

      expect(summary).toContain('John');
      expect(summary).toContain('Ferni');
      expect(summary).toContain('human');
      expect(summary).toContain('agent');
    });

    it('should show speaking indicator', () => {
      const user = createUserParticipant('user_1', 'John');
      registry.add(user);
      registry.updateSpeakingState('user_user_1', 'speaking');

      const summary = registry.getSummary();

      expect(summary).toContain('🎤');
    });
  });

  describe('Events', () => {
    it('should emit participant_joined event', () => {
      const handler = vi.fn();
      registry.on('participant_joined', handler);

      const user = createUserParticipant('user_1', 'John');
      registry.add(user);

      expect(handler).toHaveBeenCalledWith({ participant: user });
    });

    it('should emit participant_left event', () => {
      const handler = vi.fn();
      registry.on('participant_left', handler);

      const user = createUserParticipant('user_1', 'John');
      registry.add(user);
      registry.remove('user_user_1', 'test reason');

      expect(handler).toHaveBeenCalledWith({
        participantId: 'user_user_1',
        reason: 'test reason',
      });
    });
  });
});
