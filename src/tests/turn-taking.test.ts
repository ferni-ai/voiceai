/**
 * Turn-Taking Monitor Tests
 *
 * Tests for conversation turn-taking management:
 * - Turn recording and speaker normalization
 * - Speaking ratio calculations
 * - Invitation and brief response recommendations
 * - Statistics gathering
 * - Singleton management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TurnTakingMonitor,
  getTurnTakingMonitor,
  resetTurnTakingMonitor,
} from '../conversation/turn-taking.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('TurnTakingMonitor', () => {
  let monitor: TurnTakingMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new TurnTakingMonitor();
  });

  describe('recordTurn', () => {
    it('should record agent turn', () => {
      monitor.recordTurn('agent', 1000);

      const stats = monitor.getStats();
      expect(stats.agentTurnCount).toBe(1);
      expect(stats.agentTotalMs).toBe(1000);
    });

    it('should record user turn', () => {
      monitor.recordTurn('user', 2000);

      const stats = monitor.getStats();
      expect(stats.userTurnCount).toBe(1);
      expect(stats.userTotalMs).toBe(2000);
    });

    it('should normalize jack to agent', () => {
      monitor.recordTurn('jack', 1500);

      const stats = monitor.getStats();
      expect(stats.agentTurnCount).toBe(1);
      expect(stats.agentTotalMs).toBe(1500);
    });

    it('should accumulate multiple turns', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 2000);
      monitor.recordTurn('agent', 1500);

      const stats = monitor.getStats();
      expect(stats.turnCount).toBe(3);
      expect(stats.agentTurnCount).toBe(2);
      expect(stats.userTurnCount).toBe(1);
      expect(stats.agentTotalMs).toBe(2500);
    });

    it('should keep max 50 turns', () => {
      // Record 60 turns
      for (let i = 0; i < 60; i++) {
        monitor.recordTurn('agent', 100);
      }

      const stats = monitor.getStats();
      expect(stats.turnCount).toBe(50);
    });
  });

  describe('getSpeakingRatio', () => {
    it('should return 0.5 when no turns recorded', () => {
      expect(monitor.getSpeakingRatio()).toBe(0.5);
    });

    it('should calculate ratio correctly with balanced turns', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 1000);

      expect(monitor.getSpeakingRatio()).toBe(0.5);
    });

    it('should calculate ratio correctly with agent-heavy turns', () => {
      monitor.recordTurn('agent', 3000);
      monitor.recordTurn('user', 1000);

      expect(monitor.getSpeakingRatio()).toBe(0.75);
    });

    it('should calculate ratio correctly with user-heavy turns', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 3000);

      expect(monitor.getSpeakingRatio()).toBe(0.25);
    });

    it('should only consider recent 10 turns for ratio', () => {
      // Fill with user-heavy turns first
      for (let i = 0; i < 10; i++) {
        monitor.recordTurn('user', 1000);
      }

      // Then add agent-heavy turns (these should be the recent 10)
      for (let i = 0; i < 10; i++) {
        monitor.recordTurn('agent', 1000);
      }

      // Recent 10 are all agent = ratio should be 1.0
      expect(monitor.getSpeakingRatio()).toBe(1.0);
    });
  });

  describe('shouldInviteUserToSpeak', () => {
    it('should return false with fewer than 3 turns', () => {
      monitor.recordTurn('agent', 5000);
      monitor.recordTurn('agent', 5000);

      expect(monitor.shouldInviteUserToSpeak()).toBe(false);
    });

    it('should return false when ratio is balanced', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 2000);
      monitor.recordTurn('agent', 1000);

      // Agent: 2000 / 4000 = 50%, below 65% threshold
      expect(monitor.shouldInviteUserToSpeak()).toBe(false);
    });

    it('should return true when agent ratio > 65%', () => {
      monitor.recordTurn('agent', 3000);
      monitor.recordTurn('user', 1000);
      monitor.recordTurn('agent', 3000);

      // Agent: 6000 / 7000 = ~86%
      expect(monitor.shouldInviteUserToSpeak()).toBe(true);
    });
  });

  describe('shouldKeepResponseBrief', () => {
    it('should return false with fewer than 3 turns', () => {
      monitor.recordTurn('agent', 5000);
      monitor.recordTurn('agent', 5000);

      expect(monitor.shouldKeepResponseBrief()).toBe(false);
    });

    it('should return false when ratio is low', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 3000);
      monitor.recordTurn('agent', 1000);

      expect(monitor.shouldKeepResponseBrief()).toBe(false);
    });

    it('should return true when agent ratio > 55%', () => {
      monitor.recordTurn('agent', 6000);
      monitor.recordTurn('user', 4000);
      monitor.recordTurn('agent', 1000);

      // Agent: 7000 / 11000 = ~64%
      expect(monitor.shouldKeepResponseBrief()).toBe(true);
    });
  });

  describe('getInvitation', () => {
    it('should return a string', () => {
      const invitation = monitor.getInvitation();

      expect(typeof invitation).toBe('string');
      expect(invitation.length).toBeGreaterThan(0);
    });

    it('should return invitation phrases', () => {
      const validPhrases = [
        'What do you think?',
        "I'd love to hear your thoughts.",
        'Does that make sense?',
        'What questions do you have?',
        'How does that land for you?',
        'What are your thoughts on that?',
      ];

      const invitation = monitor.getInvitation();
      expect(validPhrases).toContain(invitation);
    });
  });

  describe('getStats', () => {
    it('should return zeroed stats when empty', () => {
      const stats = monitor.getStats();

      expect(stats.agentTotalMs).toBe(0);
      expect(stats.userTotalMs).toBe(0);
      expect(stats.turnCount).toBe(0);
      expect(stats.agentTurnCount).toBe(0);
      expect(stats.userTurnCount).toBe(0);
      expect(stats.averageAgentTurnMs).toBe(0);
      expect(stats.averageUserTurnMs).toBe(0);
      expect(stats.speakingRatio).toBe(0.5);
      expect(stats.recentBalance).toBe('balanced');
    });

    it('should calculate averages correctly', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('agent', 2000);
      monitor.recordTurn('user', 500);
      monitor.recordTurn('user', 1500);

      const stats = monitor.getStats();
      expect(stats.averageAgentTurnMs).toBe(1500);
      expect(stats.averageUserTurnMs).toBe(1000);
    });

    it('should identify agent-heavy balance', () => {
      monitor.recordTurn('agent', 3000);
      monitor.recordTurn('user', 1000);

      const stats = monitor.getStats();
      expect(stats.recentBalance).toBe('agent_heavy');
    });

    it('should identify user-heavy balance', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 3000);

      const stats = monitor.getStats();
      expect(stats.recentBalance).toBe('user_heavy');
    });

    it('should identify balanced conversation', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 1000);

      const stats = monitor.getStats();
      expect(stats.recentBalance).toBe('balanced');
    });
  });

  describe('reset', () => {
    it('should clear all turns', () => {
      monitor.recordTurn('agent', 1000);
      monitor.recordTurn('user', 2000);

      monitor.reset();

      const stats = monitor.getStats();
      expect(stats.turnCount).toBe(0);
      expect(stats.agentTotalMs).toBe(0);
      expect(stats.userTotalMs).toBe(0);
    });
  });
});

describe('Turn-Taking Singleton', () => {
  beforeEach(() => {
    resetTurnTakingMonitor();
  });

  describe('getTurnTakingMonitor', () => {
    it('should return the same instance on multiple calls', () => {
      const monitor1 = getTurnTakingMonitor();
      const monitor2 = getTurnTakingMonitor();

      expect(monitor1).toBe(monitor2);
    });

    it('should return a TurnTakingMonitor instance', () => {
      const monitor = getTurnTakingMonitor();

      expect(monitor).toBeInstanceOf(TurnTakingMonitor);
    });
  });

  describe('resetTurnTakingMonitor', () => {
    it('should clear data and create new instance on next get', () => {
      const monitor1 = getTurnTakingMonitor();
      monitor1.recordTurn('agent', 1000);

      resetTurnTakingMonitor();

      const monitor2 = getTurnTakingMonitor();
      expect(monitor2.getStats().turnCount).toBe(0);
    });

    it('should not throw when called without existing monitor', () => {
      expect(() => resetTurnTakingMonitor()).not.toThrow();
    });
  });
});
