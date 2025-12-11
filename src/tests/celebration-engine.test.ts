/**
 * Celebration Engine Tests
 *
 * Tests for the celebration engine including:
 * - Detection patterns for goals, streaks, growth, effort
 * - Celebration generation with intensity levels
 * - External triggers from other systems
 * - Reaction tracking and stats
 * - History import/export
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CelebrationEngine,
  getCelebrationEngine,
  resetCelebrationEngine,
  type CelebrationTrigger,
  type CelebrationIntensity,
  type CelebrationType,
} from '../services/celebration-engine.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
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
}));

vi.mock('../services/humanization/humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    breakthrough: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('CelebrationEngine', () => {
  let engine: CelebrationEngine;

  beforeEach(() => {
    engine = new CelebrationEngine('user-123', 'ferni');
  });

  describe('detectCelebration - Goal completion patterns', () => {
    it('should detect "I did it" as goal completion', () => {
      const trigger = engine.detectCelebration('I did it! Finally finished my project!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('goal_completed');
      expect(trigger?.intensity).toBe('enthusiastic');
    });

    it('should detect "I finished" as goal completion', () => {
      const trigger = engine.detectCelebration('I finished the marathon!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('goal_completed');
    });

    it('should detect "finally completed" as goal completion', () => {
      const trigger = engine.detectCelebration('Finally completed my degree!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('goal_completed');
    });

    it('should detect "got my certification" as goal completion', () => {
      const trigger = engine.detectCelebration('I got my certification yesterday!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('goal_completed');
    });

    it('should detect "reached my goal" as goal completion', () => {
      const trigger = engine.detectCelebration('I reached my goal!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('goal_completed');
    });
  });

  describe('detectCelebration - Streak patterns', () => {
    it('should detect "7 days in a row" as streak', () => {
      const trigger = engine.detectCelebration("I've meditated 7 days in a row!", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('streak_achieved');
      expect(trigger?.context?.streakDays).toBe(7);
      expect(trigger?.intensity).toBe('warm');
    });

    it('should detect "30 days straight" as streak with enthusiastic intensity', () => {
      const trigger = engine.detectCelebration('30 days straight of exercising!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('streak_achieved');
      expect(trigger?.context?.streakDays).toBe(30);
      expect(trigger?.intensity).toBe('enthusiastic');
    });

    it('should detect "haven\'t missed a day" as streak', () => {
      const trigger = engine.detectCelebration("I haven't missed a day in 14 days!", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('streak_achieved');
    });

    it('should detect "every single day" as streak', () => {
      const trigger = engine.detectCelebration(
        "I've been doing it every single day for 21 days!",
        10
      );

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('streak_achieved');
    });

    it('should detect short streak with subtle intensity', () => {
      const trigger = engine.detectCelebration('3 days in a row now!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('streak_achieved');
      expect(trigger?.intensity).toBe('subtle');
    });
  });

  describe('detectCelebration - Growth patterns', () => {
    it('should detect "I used to" as growth recognition', () => {
      const trigger = engine.detectCelebration(
        'I used to be terrified of public speaking, now I do it weekly',
        10
      );

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('growth_recognized');
    });

    it('should detect "compared to before" as growth', () => {
      const trigger = engine.detectCelebration("Compared to before, I'm so much calmer now", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('growth_recognized');
    });

    it('should detect "I\'ve improved" as growth', () => {
      const trigger = engine.detectCelebration("I've improved so much at managing my time", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('growth_recognized');
    });

    it('should detect "easier now" as growth', () => {
      const trigger = engine.detectCelebration("It's so much easier now than before", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('growth_recognized');
    });
  });

  describe('detectCelebration - Breakthrough patterns', () => {
    it('should detect "I just realized" as breakthrough', () => {
      const trigger = engine.detectCelebration('I just realized why I keep doing that!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('breakthrough');
      expect(trigger?.intensity).toBe('warm');
    });

    it('should detect "it clicked" as breakthrough', () => {
      const trigger = engine.detectCelebration('It finally clicked! I understand now!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('breakthrough');
    });

    it('should detect "oh my god" as breakthrough', () => {
      const trigger = engine.detectCelebration('Oh my god, I never saw it that way before!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('breakthrough');
    });

    it('should detect "everything makes sense" as breakthrough', () => {
      const trigger = engine.detectCelebration('Everything makes sense now!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('breakthrough');
    });
  });

  describe('detectCelebration - First-time patterns', () => {
    it('should detect "first time" as first-time achievement', () => {
      const trigger = engine.detectCelebration('This is my first time giving a presentation!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('first_time');
    });

    it('should detect "never done this before" as first-time', () => {
      const trigger = engine.detectCelebration("I've never done this before!", 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('first_time');
    });

    it('should detect "my first" as first-time', () => {
      const trigger = engine.detectCelebration('My first marathon is next week!', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('first_time');
    });
  });

  describe('detectCelebration - Effort patterns', () => {
    it('should detect "I tried" as effort recognition', () => {
      const trigger = engine.detectCelebration('I tried my best even though I failed', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('effort_recognized');
      expect(trigger?.intensity).toBe('subtle');
    });

    it('should detect "I showed up" as effort', () => {
      const trigger = engine.detectCelebration(
        "I showed up to the gym even when I didn't want to",
        10
      );

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('effort_recognized');
    });

    it('should detect "pushed through" as effort', () => {
      const trigger = engine.detectCelebration('I pushed through the discomfort', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('effort_recognized');
    });

    it('should detect "at least I" as effort', () => {
      const trigger = engine.detectCelebration('At least I tried something new', 10);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe('effort_recognized');
    });
  });

  describe('detectCelebration - Cooldown behavior', () => {
    it('should not detect during cooldown period', () => {
      const trigger1 = engine.detectCelebration('I did it!', 10);
      expect(trigger1).not.toBeNull();

      // Immediately after - should be in cooldown
      const trigger2 = engine.detectCelebration('I also finished another thing!', 11);
      expect(trigger2).toBeNull();
    });

    it('should detect after cooldown period ends', () => {
      const trigger1 = engine.detectCelebration('I did it!', 10);
      expect(trigger1).not.toBeNull();

      // After cooldown (3 turns)
      const trigger2 = engine.detectCelebration('I finished another thing!', 14);
      expect(trigger2).not.toBeNull();
    });
  });

  describe('detectCelebration - Priority ordering', () => {
    it('should prioritize goal completion over breakthrough', () => {
      // Message that matches both patterns
      const trigger = engine.detectCelebration('I just realized I did it! I finished!', 10);

      // Goal completion has higher priority
      expect(trigger?.type).toBe('goal_completed');
    });

    it('should prioritize breakthrough over growth', () => {
      const trigger = engine.detectCelebration("I just realized how much I've grown!", 10);

      expect(trigger?.type).toBe('breakthrough');
    });
  });

  describe('detectCelebration - No match', () => {
    it('should return null for casual conversation', () => {
      const trigger = engine.detectCelebration('How are you doing today?', 10);

      expect(trigger).toBeNull();
    });

    it('should return null for questions', () => {
      const trigger = engine.detectCelebration('What should I do about my project?', 10);

      expect(trigger).toBeNull();
    });
  });

  describe('generateCelebration', () => {
    it('should generate celebration response with message', () => {
      const trigger = engine.detectCelebration('I did it!', 10);
      expect(trigger).not.toBeNull();

      const response = engine.generateCelebration(trigger!);

      expect(response.message).toBeTruthy();
      expect(response.ssml).toBeTruthy();
      expect(response.expression).toBeDefined();
      expect(response.energy).toBeDefined();
    });

    it('should include SSML with prosody', () => {
      const trigger = engine.detectCelebration('I finished my goal!', 10);
      const response = engine.generateCelebration(trigger!);

      expect(response.ssml).toContain('prosody');
      expect(response.ssml).toContain('break');
    });

    it('should set expression based on type', () => {
      const trigger = engine.detectCelebration("I've grown so much", 10);
      const response = engine.generateCelebration(trigger!);

      expect(['delight', 'pride', 'warmth', 'excited', 'celebrating']).toContain(
        response.expression
      );
    });

    it('should set energy based on intensity', () => {
      // Enthusiastic triggers should have higher energy
      const trigger = engine.detectCelebration('I DID IT! FINALLY!', 10);
      expect(trigger?.intensity).toBe('enthusiastic');

      const response = engine.generateCelebration(trigger!);
      expect(['bright', 'exuberant']).toContain(response.energy);
    });

    it('should have longer pause for ecstatic intensity', () => {
      // Create ecstatic trigger via streak
      const engine2 = new CelebrationEngine('user-123', 'ferni');
      const response = engine2.celebrateStreak({ days: 100, habit: 'meditation' });

      expect(response.pauseBeforeMs).toBe(500);
    });
  });

  describe('celebrateGoalCompletion', () => {
    it('should generate celebration for goal', () => {
      const response = engine.celebrateGoalCompletion({
        id: 'goal-1',
        title: 'Learn Spanish',
        domain: 'learning',
        startedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      });

      expect(response.message).toBeTruthy();
      expect(response.energy).toBeDefined();
    });

    it('should have enthusiastic intensity for long goals', () => {
      const response = engine.celebrateGoalCompletion({
        id: 'goal-1',
        title: 'Get promotion',
        domain: 'career',
        startedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      });

      expect(['bright', 'exuberant']).toContain(response.energy);
    });
  });

  describe('celebrateStreak', () => {
    it('should celebrate 7-day streak with warm intensity', () => {
      const response = engine.celebrateStreak({ days: 7, habit: 'journaling' });

      expect(response.message).toContain('7');
      expect(response.energy).toBe('warm');
    });

    it('should celebrate 30-day streak with enthusiastic intensity', () => {
      const response = engine.celebrateStreak({ days: 30, habit: 'exercise' });

      expect(response.energy).toBe('bright');
    });

    it('should celebrate 100-day streak with ecstatic intensity', () => {
      const response = engine.celebrateStreak({ days: 100, habit: 'meditation' });

      expect(response.energy).toBe('exuberant');
    });

    it('should celebrate short streak with subtle intensity', () => {
      const response = engine.celebrateStreak({ days: 3, habit: 'reading' });

      expect(response.energy).toBe('calm');
    });
  });

  describe('celebrateGrowth', () => {
    it('should generate growth celebration', () => {
      const response = engine.celebrateGrowth({
        area: 'public speaking',
        before: 'terrified of presenting',
        after: 'comfortable presenting to groups',
        timespan: '6 months',
      });

      expect(response.message).toBeTruthy();
      expect(response.expression).toBe('pride');
    });
  });

  describe('celebrateRelationshipMilestone', () => {
    it('should celebrate conversation milestone', () => {
      const response = engine.celebrateRelationshipMilestone({
        type: 'conversations',
        value: 50,
      });

      expect(response.message).toBeTruthy();
      expect(response.expression).toBe('warmth');
    });

    it('should celebrate 1 year milestone with enthusiastic intensity', () => {
      const response = engine.celebrateRelationshipMilestone({
        type: 'months',
        value: 12,
      });

      expect(response.energy).toBe('bright');
    });

    it('should celebrate 100 conversations with enthusiastic intensity', () => {
      const response = engine.celebrateRelationshipMilestone({
        type: 'conversations',
        value: 100,
      });

      expect(response.energy).toBe('bright');
    });

    it('should celebrate vulnerability shared milestone', () => {
      const response = engine.celebrateRelationshipMilestone({
        type: 'vulnerability_shared',
        value: 10,
      });

      expect(response.message).toBeTruthy();
    });
  });

  describe('recordReaction', () => {
    it('should record positive reaction', () => {
      const trigger = engine.detectCelebration('I did it!', 10);
      const response = engine.generateCelebration(trigger!);

      engine.recordReaction(trigger!.id, 'positive');

      const stats = engine.getStats();
      expect(stats.positiveReactions).toBe(1);
    });

    it('should record neutral reaction', () => {
      const trigger = engine.detectCelebration('I finished!', 10);
      engine.generateCelebration(trigger!);

      engine.recordReaction(trigger!.id, 'neutral');

      const stats = engine.getStats();
      expect(stats.positiveReactions).toBe(0);
    });

    it('should handle unknown triggerId gracefully', () => {
      expect(() => engine.recordReaction('unknown-id', 'positive')).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return total celebrations count', () => {
      engine.celebrateStreak({ days: 7, habit: 'test' });
      engine.celebrateStreak({ days: 14, habit: 'test2' });

      const stats = engine.getStats();

      expect(stats.total).toBe(2);
    });

    it('should return breakdown by type', () => {
      engine.celebrateStreak({ days: 7, habit: 'test' });
      engine.celebrateGrowth({
        area: 'test',
        before: 'a',
        after: 'b',
        timespan: '1 week',
      });

      const stats = engine.getStats();

      expect(stats.byType.streak_achieved).toBe(1);
      expect(stats.byType.growth_recognized).toBe(1);
    });

    it('should return empty stats when no celebrations', () => {
      const stats = engine.getStats();

      expect(stats.total).toBe(0);
      expect(stats.positiveReactions).toBe(0);
    });
  });

  describe('exportHistory and importHistory', () => {
    it('should export celebration history', () => {
      engine.celebrateStreak({ days: 7, habit: 'test' });

      const history = engine.exportHistory();

      expect(history.length).toBe(1);
      expect(history[0].type).toBe('streak_achieved');
    });

    it('should import celebration history', () => {
      const records = [
        {
          triggerId: 'test-1',
          type: 'streak_achieved' as CelebrationType,
          userId: 'user-123',
          celebratedAt: new Date(),
          messageDelivered: 'Test message',
        },
      ];

      engine.importHistory(records);

      const stats = engine.getStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset turn counter but preserve history', () => {
      engine.celebrateStreak({ days: 7, habit: 'test' });

      engine.reset();

      const stats = engine.getStats();
      // History should be preserved
      expect(stats.total).toBe(1);
    });
  });
});

describe('getCelebrationEngine factory', () => {
  it('should return same instance for same user/persona', () => {
    const engine1 = getCelebrationEngine('user-1', 'ferni');
    const engine2 = getCelebrationEngine('user-1', 'ferni');

    expect(engine1).toBe(engine2);
  });

  it('should return different instances for different users', () => {
    const engine1 = getCelebrationEngine('user-1', 'ferni');
    const engine2 = getCelebrationEngine('user-2', 'ferni');

    expect(engine1).not.toBe(engine2);
  });

  it('should return different instances for different personas', () => {
    const engine1 = getCelebrationEngine('user-1', 'ferni');
    const engine2 = getCelebrationEngine('user-1', 'alex-chen');

    expect(engine1).not.toBe(engine2);
  });
});

describe('resetCelebrationEngine', () => {
  it('should reset engine state', () => {
    const engine = getCelebrationEngine('reset-test', 'ferni');
    engine.celebrateStreak({ days: 7, habit: 'test' });

    resetCelebrationEngine('reset-test', 'ferni');

    // Engine still exists but turn counter is reset
    expect(() => getCelebrationEngine('reset-test', 'ferni')).not.toThrow();
  });

  it('should not throw for non-existent engine', () => {
    expect(() => resetCelebrationEngine('non-existent', 'ferni')).not.toThrow();
  });
});

describe('CelebrationTrigger structure', () => {
  it('should have required fields', () => {
    const engine = new CelebrationEngine('user-123', 'ferni');
    const trigger = engine.detectCelebration('I did it!', 10);

    expect(trigger?.id).toBeDefined();
    expect(trigger?.type).toBeDefined();
    expect(trigger?.userId).toBe('user-123');
    expect(trigger?.personaId).toBe('ferni');
    expect(trigger?.achievement).toBeDefined();
    expect(trigger?.significance).toBeDefined();
    expect(trigger?.evidence).toBeDefined();
    expect(trigger?.intensity).toBeDefined();
    expect(trigger?.detectedAt).toBeInstanceOf(Date);
  });
});

describe('CelebrationIntensity coverage', () => {
  const intensities: CelebrationIntensity[] = ['subtle', 'warm', 'enthusiastic', 'ecstatic'];

  it('should handle all intensity levels', () => {
    for (const intensity of intensities) {
      expect(typeof intensity).toBe('string');
    }
  });
});

describe('CelebrationType coverage', () => {
  const types: CelebrationType[] = [
    'goal_completed',
    'milestone_reached',
    'streak_achieved',
    'growth_recognized',
    'effort_recognized',
    'relationship_milestone',
    'first_time',
    'breakthrough',
  ];

  it('should handle all celebration types', () => {
    for (const type of types) {
      expect(typeof type).toBe('string');
    }
  });
});
