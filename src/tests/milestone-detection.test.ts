/**
 * Milestone Detection Service Tests
 *
 * Tests for user milestone detection including:
 * - Conversation count milestones
 * - Streak milestones
 * - Anniversary detection
 * - Celebration phrases
 * - Rate limiting (shouldCelebrate)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkHabitStreak,
  detectMilestones,
  getMilestoneCelebrationPhrase,
  shouldCelebrate,
  markCelebrated,
  MilestoneDetectionService,
  type Milestone,
  type MilestoneContext,
  type MilestoneType,
} from '../services/milestone-detection.js';
import type { UserProfile } from '../types/user-profile.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Milestone Detection Service', () => {
  describe('checkHabitStreak', () => {
    it('should return null for non-milestone streak days', () => {
      const result = checkHabitStreak('ferni', 2);
      expect(result).toBeNull();
    });

    it('should detect 3-day streak milestone', () => {
      const result = checkHabitStreak('ferni', 3);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('streak');
      expect(result?.value).toBe(3);
      expect(result?.celebrationLevel).toBe('small');
    });

    it('should detect 7-day streak milestone', () => {
      const result = checkHabitStreak('maya-santos', 7);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('streak');
      expect(result?.value).toBe(7);
      expect(result?.celebrationLevel).toBe('small');
    });

    it('should detect 14-day streak with medium celebration', () => {
      const result = checkHabitStreak('ferni', 14);

      expect(result).not.toBeNull();
      expect(result?.celebrationLevel).toBe('medium');
    });

    it('should detect 21-day streak with medium celebration', () => {
      const result = checkHabitStreak('ferni', 21);

      expect(result).not.toBeNull();
      expect(result?.celebrationLevel).toBe('medium');
    });

    it('should detect 30-day streak with big celebration', () => {
      const result = checkHabitStreak('ferni', 30);

      expect(result).not.toBeNull();
      expect(result?.celebrationLevel).toBe('big');
    });

    it('should detect 60-day streak with big celebration', () => {
      const result = checkHabitStreak('ferni', 60);

      expect(result).not.toBeNull();
      expect(result?.celebrationLevel).toBe('big');
    });

    it('should detect 90-day streak with big celebration', () => {
      const result = checkHabitStreak('ferni', 90);

      expect(result).not.toBeNull();
      expect(result?.celebrationLevel).toBe('big');
    });

    it('should detect 180-day streak (half year!)', () => {
      const result = checkHabitStreak('ferni', 180);

      expect(result).not.toBeNull();
      expect(result?.value).toBe(180);
    });

    it('should detect 365-day streak (full year!)', () => {
      const result = checkHabitStreak('ferni', 365);

      expect(result).not.toBeNull();
      expect(result?.value).toBe(365);
      expect(result?.celebrationLevel).toBe('big');
    });

    it('should return null for non-milestone large numbers', () => {
      const result = checkHabitStreak('ferni', 100);
      expect(result).toBeNull();
    });

    it('should include personaId in the milestone', () => {
      const result = checkHabitStreak('alex-chen', 7);

      expect(result?.personaId).toBe('alex-chen');
    });

    it('should include timestamp', () => {
      const before = new Date();
      const result = checkHabitStreak('ferni', 7);
      const after = new Date();

      expect(result?.timestamp).toBeDefined();
      expect(result?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('detectMilestones', () => {
    const createMockProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
      ({
        id: 'test-user-123',
        humanizingState: {
          perPersonaMeetingCounts: {},
          perPersonaRelationshipData: {},
          perPersonaRelationshipStage: {},
          ...overrides.humanizingState,
        },
        ...overrides,
      }) as UserProfile;

    it('should detect first meeting milestone', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 1 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);

      expect(milestones.some((m) => m.type === 'first_meeting')).toBe(true);
    });

    it('should detect 5 conversation milestone', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 5 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);

      expect(milestones.some((m) => m.type === 'conversation_count' && m.value === 5)).toBe(true);
    });

    it('should detect 10 conversation milestone', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 10 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);

      expect(milestones.some((m) => m.type === 'conversation_count')).toBe(true);
    });

    it('should detect 25 conversation milestone', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 25 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);
      const milestone = milestones.find((m) => m.type === 'conversation_count');

      expect(milestone).toBeDefined();
      expect(milestone?.celebrationLevel).toBe('medium');
    });

    it('should detect 100 conversation milestone with big celebration', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 100 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);
      const milestone = milestones.find((m) => m.type === 'conversation_count');

      expect(milestone).toBeDefined();
      expect(milestone?.celebrationLevel).toBe('big');
    });

    it('should return empty array for non-milestone meeting counts', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaMeetingCounts: { ferni: 3 },
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        }),
      };

      const milestones = detectMilestones(context);

      expect(milestones.some((m) => m.type === 'conversation_count')).toBe(false);
    });

    it('should handle missing humanizingState gracefully', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: {} as UserProfile,
      };

      // Should not throw
      expect(() => detectMilestones(context)).not.toThrow();

      const milestones = detectMilestones(context);
      expect(Array.isArray(milestones)).toBe(true);
    });

    it('should handle missing perPersonaMeetingCounts', () => {
      const context: MilestoneContext = {
        userId: 'user-123',
        personaId: 'ferni',
        profile: createMockProfile({
          humanizingState: {
            perPersonaRelationshipData: {},
            perPersonaRelationshipStage: {},
          },
        } as any),
      };

      const milestones = detectMilestones(context);
      expect(Array.isArray(milestones)).toBe(true);
    });
  });

  describe('getMilestoneCelebrationPhrase', () => {
    it('should return phrase for first_meeting', () => {
      const milestone: Milestone = {
        type: 'first_meeting',
        personaId: 'ferni',
        description: 'First time meeting!',
        value: 1,
        timestamp: new Date(),
        celebrationLevel: 'small',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('should return phrase for conversation_count', () => {
      const milestone: Milestone = {
        type: 'conversation_count',
        personaId: 'ferni',
        description: '25 conversations together!',
        value: 25,
        timestamp: new Date(),
        celebrationLevel: 'medium',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
      expect(phrase).toContain('25');
    });

    it('should return phrase for streak', () => {
      const milestone: Milestone = {
        type: 'streak',
        personaId: 'ferni',
        description: '7 day streak!',
        value: 7,
        timestamp: new Date(),
        celebrationLevel: 'small',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
      expect(phrase).toContain('7');
    });

    it('should return phrase for anniversary', () => {
      const milestone: Milestone = {
        type: 'anniversary',
        personaId: 'ferni',
        description: '1 year together',
        timestamp: new Date(),
        celebrationLevel: 'big',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for relationship_upgrade', () => {
      const milestone: Milestone = {
        type: 'relationship_upgrade',
        personaId: 'ferni',
        description: 'becoming friends',
        timestamp: new Date(),
        celebrationLevel: 'medium',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for breakthrough', () => {
      const milestone: Milestone = {
        type: 'breakthrough',
        personaId: 'ferni',
        description: 'A breakthrough moment',
        timestamp: new Date(),
        celebrationLevel: 'big',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for goal_achieved', () => {
      const milestone: Milestone = {
        type: 'goal_achieved',
        personaId: 'ferni',
        description: 'Goal completed',
        timestamp: new Date(),
        celebrationLevel: 'big',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for habit_formed', () => {
      const milestone: Milestone = {
        type: 'habit_formed',
        personaId: 'ferni',
        description: 'New habit formed',
        timestamp: new Date(),
        celebrationLevel: 'big',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for vulnerability_shared', () => {
      const milestone: Milestone = {
        type: 'vulnerability_shared',
        personaId: 'ferni',
        description: 'Vulnerability shared',
        timestamp: new Date(),
        celebrationLevel: 'small',
      };

      const phrase = getMilestoneCelebrationPhrase(milestone);
      expect(typeof phrase).toBe('string');
    });
  });

  describe('shouldCelebrate and markCelebrated', () => {
    it('should return true for never-celebrated milestone', () => {
      const userId = `new-user-${Date.now()}`;
      const result = shouldCelebrate(userId, 'ferni', 'streak');
      expect(result).toBe(true);
    });

    it('should return false immediately after marking celebrated', () => {
      const userId = `celebrate-test-${Date.now()}`;
      const personaId = 'ferni';
      const milestoneType: MilestoneType = 'conversation_count';

      // Mark as celebrated
      markCelebrated(userId, personaId, milestoneType);

      // Should not celebrate again immediately
      const result = shouldCelebrate(userId, personaId, milestoneType);
      expect(result).toBe(false);
    });

    it('should track different milestone types separately', () => {
      const userId = `multi-type-${Date.now()}`;
      const personaId = 'ferni';

      // Mark streak as celebrated
      markCelebrated(userId, personaId, 'streak');

      // Different type should still be celebratable
      const result = shouldCelebrate(userId, personaId, 'conversation_count');
      expect(result).toBe(true);
    });

    it('should track different personas separately', () => {
      const userId = `multi-persona-${Date.now()}`;
      const milestoneType: MilestoneType = 'streak';

      // Mark for ferni
      markCelebrated(userId, 'ferni', milestoneType);

      // Different persona should still be celebratable
      const result = shouldCelebrate(userId, 'maya-santos', milestoneType);
      expect(result).toBe(true);
    });

    it('should track different users separately', () => {
      const user1 = `user1-${Date.now()}`;
      const user2 = `user2-${Date.now()}`;
      const personaId = 'ferni';
      const milestoneType: MilestoneType = 'streak';

      // Mark for user1
      markCelebrated(user1, personaId, milestoneType);

      // Different user should still be celebratable
      const result = shouldCelebrate(user2, personaId, milestoneType);
      expect(result).toBe(true);
    });
  });

  describe('MilestoneDetectionService', () => {
    it('should expose detect method', () => {
      expect(typeof MilestoneDetectionService.detect).toBe('function');
    });

    it('should expose getCelebrationPhrase method', () => {
      expect(typeof MilestoneDetectionService.getCelebrationPhrase).toBe('function');
    });

    it('should expose checkStreak method', () => {
      expect(typeof MilestoneDetectionService.checkStreak).toBe('function');
    });

    it('should expose shouldCelebrate method', () => {
      expect(typeof MilestoneDetectionService.shouldCelebrate).toBe('function');
    });

    it('should expose markCelebrated method', () => {
      expect(typeof MilestoneDetectionService.markCelebrated).toBe('function');
    });

    it('should work via service object', () => {
      const streak = MilestoneDetectionService.checkStreak('ferni', 7);
      expect(streak).not.toBeNull();
      expect(streak?.type).toBe('streak');

      const phrase = MilestoneDetectionService.getCelebrationPhrase(streak!);
      expect(typeof phrase).toBe('string');
    });
  });

  describe('All Milestone Types Coverage', () => {
    const milestoneTypes: MilestoneType[] = [
      'first_meeting',
      'relationship_upgrade',
      'conversation_count',
      'time_spent',
      'streak',
      'anniversary',
      'breakthrough',
      'goal_achieved',
      'habit_formed',
      'vulnerability_shared',
    ];

    it('should have phrase templates for all milestone types', () => {
      for (const type of milestoneTypes) {
        const milestone: Milestone = {
          type,
          personaId: 'ferni',
          description: 'Test milestone',
          value: 10,
          timestamp: new Date(),
          celebrationLevel: 'medium',
        };

        const phrase = getMilestoneCelebrationPhrase(milestone);
        expect(typeof phrase).toBe('string');
        expect(phrase.length).toBeGreaterThan(0);
      }
    });
  });
});
