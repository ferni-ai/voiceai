/**
 * Turn-Taking Engine Tests
 *
 * Tests for intelligent turn-taking in group conversations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TurnTakingEngine, DEFAULT_TURN_TAKING_CONFIG } from '../turn-taking.js';
import type { GroupConversation, GroupParticipant, TurnTakingConfig } from '../types.js';

// ============================================================================
// HELPERS
// ============================================================================

function createMockConversation(overrides?: Partial<GroupConversation>): GroupConversation {
  return {
    roomId: 'test-room',
    sessionId: 'test-session',
    mode: 'team_roundtable',
    participants: new Map(),
    initiatorId: 'user_1',
    turnTaking: DEFAULT_TURN_TAKING_CONFIG,
    transcript: [],
    startedAt: new Date(),
    ...overrides,
  };
}

function createMockParticipant(
  id: string,
  type: 'human' | 'agent' | 'external',
  name: string
): GroupParticipant {
  return {
    id,
    name,
    type,
    connection:
      type === 'agent' ? { type: 'agent', personaId: id } : { type: 'webrtc', identity: id },
    role: type === 'agent' ? 'expert' : 'initiator',
    speakingState: 'silent',
    joinedAt: new Date(),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('TurnTakingEngine', () => {
  let conversation: GroupConversation;
  let engine: TurnTakingEngine;

  beforeEach(() => {
    conversation = createMockConversation();

    // Add participants
    const user = createMockParticipant('user_1', 'human', 'User');
    const ferni = createMockParticipant('agent_ferni', 'agent', 'Ferni');
    const peter = createMockParticipant('agent_peter', 'agent', 'Peter');

    conversation.participants.set(user.id, user);
    conversation.participants.set(ferni.id, ferni);
    conversation.participants.set(peter.id, peter);

    engine = new TurnTakingEngine(conversation);
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Basic Operations', () => {
    it('should initialize with no current speaker', () => {
      expect(engine.getCurrentSpeaker()).toBeNull();
    });

    it('should track speaking start', () => {
      engine.onSpeakingStart('user_1');

      const speaker = engine.getCurrentSpeaker();
      expect(speaker).not.toBeNull();
      expect(speaker?.id).toBe('user_1');
    });

    it('should track speaking end', () => {
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      expect(engine.getCurrentSpeaker()).toBeNull();
    });

    it('should update turn counts', () => {
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      engine.onSpeakingStart('agent_ferni');
      engine.onSpeakingEnd('agent_ferni');

      const stats = engine.getTurnStats();
      expect(stats.turnCounts['user_1']).toBe(1);
      expect(stats.turnCounts['agent_ferni']).toBe(1);
    });
  });

  describe('Turn-Taking Rules', () => {
    it('should not allow agent to speak while human is speaking', () => {
      engine.onSpeakingStart('user_1');

      expect(engine.shouldAgentSpeak('agent_ferni')).toBe(false);
    });

    it('should not allow agent to speak during short silence', () => {
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      // Immediate check - silence threshold not met
      expect(engine.shouldAgentSpeak('agent_ferni')).toBe(false);
    });

    it('should allow agent to speak after silence threshold', async () => {
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      // Wait for silence threshold
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 900);
      });

      // Now agent should be able to speak
      expect(engine.shouldAgentSpeak('agent_ferni')).toBe(true);
    });

    it('should prevent agent dominance', () => {
      // Simulate 2 agent turns without human
      conversation.transcript.push({
        id: 'utt_1',
        speakerId: 'agent_ferni',
        speakerName: 'Ferni',
        speakerType: 'agent',
        text: 'First agent turn',
        timestamp: new Date(),
        durationMs: 1000,
      });

      conversation.transcript.push({
        id: 'utt_2',
        speakerId: 'agent_peter',
        speakerName: 'Peter',
        speakerType: 'agent',
        text: 'Second agent turn',
        timestamp: new Date(),
        durationMs: 1000,
      });

      engine.onSpeakingEnd('agent_peter');

      // Third agent turn should be blocked
      expect(engine.shouldAgentSpeak('agent_ferni')).toBe(false);
    });
  });

  describe('Speaking Queue', () => {
    it('should allow requesting to speak', () => {
      engine.requestToSpeak('agent_ferni');
      engine.requestToSpeak('agent_peter');

      // Ferni requested first, should get priority
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');
    });

    it('should not add duplicate requests', () => {
      engine.requestToSpeak('agent_ferni');
      engine.requestToSpeak('agent_ferni');

      // Internal queue should only have one entry
      // (We can't directly test this, but it shouldn't cause issues)
    });
  });

  describe('Turn Statistics', () => {
    it('should calculate balance correctly with equal turns', () => {
      // Two agents, each speaks once
      engine.onSpeakingStart('agent_ferni');
      engine.onSpeakingEnd('agent_ferni');

      engine.onSpeakingStart('agent_peter');
      engine.onSpeakingEnd('agent_peter');

      const stats = engine.getTurnStats();
      expect(stats.balance).toBeGreaterThan(0.9); // High balance
    });

    it('should detect imbalance', () => {
      // One agent speaks 3 times, other speaks 0
      for (let i = 0; i < 3; i++) {
        engine.onSpeakingStart('agent_ferni');
        engine.onSpeakingEnd('agent_ferni');
      }

      const stats = engine.getTurnStats();
      // With only one participant having turns, balance may still be 1
      // But if we check turn counts, we can see the imbalance
      expect(stats.turnCounts['agent_ferni']).toBe(3);
      expect(stats.turnCounts['agent_peter']).toBeUndefined();
    });

    it('should calculate average turns', () => {
      engine.onSpeakingStart('agent_ferni');
      engine.onSpeakingEnd('agent_ferni');

      engine.onSpeakingStart('agent_ferni');
      engine.onSpeakingEnd('agent_ferni');

      engine.onSpeakingStart('agent_peter');
      engine.onSpeakingEnd('agent_peter');

      const stats = engine.getTurnStats();
      expect(stats.averageTurns).toBe(1.5); // (2 + 1) / 2
    });
  });

  describe('Configuration', () => {
    it('should use default config', () => {
      expect(engine['config'].silenceThresholdMs).toBe(
        DEFAULT_TURN_TAKING_CONFIG.silenceThresholdMs
      );
    });

    it('should allow config updates', () => {
      engine.updateConfig({ silenceThresholdMs: 500 });
      expect(engine['config'].silenceThresholdMs).toBe(500);
    });
  });

  describe('Events', () => {
    it('should emit speaker_changed event', () => {
      const handler = vi.fn();
      engine.on('speaker_changed', handler);

      engine.onSpeakingStart('user_1');

      expect(handler).toHaveBeenCalledWith({ speakerId: 'user_1' });
    });

    it('should emit silence event', async () => {
      const handler = vi.fn();
      engine.on('silence', handler);

      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      // Wait for silence to accumulate
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1100);
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up timers on destroy', () => {
      engine.onSpeakingStart('user_1');
      engine.onSpeakingEnd('user_1');

      engine.destroy();

      // Should not throw or leak
      expect(() => engine.destroy()).not.toThrow();
    });
  });
});
