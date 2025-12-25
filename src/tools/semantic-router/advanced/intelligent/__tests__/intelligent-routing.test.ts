/**
 * Intelligent Routing System Tests
 *
 * Basic tests for the intelligent routing infrastructure.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntentClassifier,
  initializeIntentClassifier,
} from '../intent-classifier.js';
import {
  BanditOptimizer,
  initializeBanditOptimizer,
  calculateImplicitReward,
  calculateExplicitReward,
} from '../bandit-optimizer.js';
import {
  FERNI_INTENTS,
  PERSONA_HANDOFF_INTENTS,
  MUSIC_INTENTS,
  HABIT_INTENTS,
  getIntentsForPersona,
} from '../ferni-intents.js';

// ============================================================================
// INTENT CLASSIFIER TESTS
// ============================================================================

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = initializeIntentClassifier();
    classifier.registerIntents(FERNI_INTENTS);
  });

  describe('Persona Handoffs', () => {
    it('should classify "talk to maya" as handoff intent', () => {
      const result = classifier.classify('talk to maya');
      expect(result).not.toBeNull();
      expect(result?.intent?.category).toBe('handoff');
      expect(result?.intent?.id).toBe('handoff.maya');
      expect(result?.toolId).toBe('handoff_maya');
    });

    it('should classify "switch to peter" as handoff intent', () => {
      const result = classifier.classify('switch to peter');
      expect(result?.intent?.category).toBe('handoff');
      expect(result?.toolId).toBe('handoff_peter');
    });

    it('should classify "go back to ferni" as handoff intent', () => {
      const result = classifier.classify('go back to ferni');
      expect(result?.intent?.category).toBe('handoff');
      expect(result?.toolId).toBe('handoff_ferni');
    });
  });

  describe('Music Intents', () => {
    it('should classify "play some music" as music play intent', () => {
      const result = classifier.classify('play some music');
      expect(result?.intent?.category).toBe('music');
      expect(result?.intent?.action).toBe('play');
      expect(result?.toolId).toBe('spotify_play');
    });

    it('should classify "pause the music" as music pause', () => {
      const result = classifier.classify('pause the music');
      expect(result?.intent?.category).toBe('music');
      expect(result?.intent?.action).toBe('pause');
      expect(result?.toolId).toBe('spotify_pause');
    });
  });

  describe('Habit Intents', () => {
    it('should classify "I just did my workout" as habit log', () => {
      const result = classifier.classify('I just did my workout');
      expect(result?.intent?.category).toBe('habits');
      expect(result?.intent?.action).toBe('log');
      expect(result?.toolId).toBe('habit_log');
    });

    it('should classify "start my morning routine" as routine intent', () => {
      const result = classifier.classify('start my morning routine');
      expect(result?.intent?.category).toBe('habits');
      expect(result?.intent?.action).toBe('routine');
      expect(result?.toolId).toBe('habit_routine');
    });
  });

  describe('Calendar Intents', () => {
    it('should classify "what is on my calendar" as calendar check', () => {
      const result = classifier.classify('what is on my calendar');
      expect(result?.intent?.category).toBe('calendar');
      expect(result?.intent?.action).toBe('check');
      expect(result?.toolId).toBe('calendar_check');
    });
  });

  describe('Emotional Intents', () => {
    it('should classify "I am feeling stressed" as stress support', () => {
      const result = classifier.classify('I am feeling stressed');
      expect(result?.intent?.category).toBe('emotion');
      expect(result?.intent?.action).toBe('support');
      expect(result?.toolId).toBe('stress_support');
    });
  });

  describe('Crisis Intents', () => {
    it('should classify crisis keywords with high priority', () => {
      const result = classifier.classify('I need urgent help');
      expect(result?.intent?.category).toBe('crisis');
      expect(result?.intent?.priority).toBe(20);
      expect(result?.toolId).toBe('crisis_help');
    });
  });

  describe('Smalltalk Intents', () => {
    it('should classify "hello" as greeting', () => {
      const result = classifier.classify('hello');
      expect(result?.intent?.category).toBe('smalltalk');
      expect(result?.intent?.action).toBe('greeting');
    });
  });
});

// ============================================================================
// BANDIT OPTIMIZER TESTS
// ============================================================================

describe('BanditOptimizer', () => {
  let bandit: BanditOptimizer;

  beforeEach(async () => {
    bandit = initializeBanditOptimizer();
    await bandit.initialize(['spotify_play', 'calendar_check', 'habit_log']);
  });

  describe('Selection', () => {
    it('should select from available tools', () => {
      const result = bandit.select(['spotify_play', 'calendar_check']);
      expect(result.toolId).toBeDefined();
      expect(['spotify_play', 'calendar_check']).toContain(result.toolId);
    });

    it('should handle single candidate', () => {
      const result = bandit.select(['habit_log']);
      expect(result.toolId).toBe('habit_log');
    });
  });

  describe('Reward Recording', () => {
    it('should update arm statistics on reward', () => {
      const result = bandit.select(['spotify_play']);
      // recordReward(toolId, reward, context?)
      bandit.recordReward(result.toolId, 1.0);
      // Verify arm was updated
      const arm = bandit.getArmStats(result.toolId);
      expect(arm?.successes).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return exploration stats', () => {
      const stats = bandit.getExplorationStats();
      expect(stats.totalSelections).toBeDefined();
      expect(stats.explorationRate).toBeDefined();
    });

    it('should return all arms', () => {
      const arms = bandit.getAllArms();
      expect(arms.length).toBe(3);
    });
  });
});

// ============================================================================
// REWARD CALCULATION TESTS
// ============================================================================

describe('Reward Calculations', () => {
  describe('calculateImplicitReward', () => {
    it('should give higher reward for positive signals', () => {
      const goodReward = calculateImplicitReward({
        continued: true,
        corrected: false,
        thanked: true,
        switchedTopic: false,
      });
      expect(goodReward).toBeGreaterThan(0.5);
    });

    it('should give lower reward for corrections', () => {
      const badReward = calculateImplicitReward({
        continued: false,
        corrected: true,
        thanked: false,
        switchedTopic: true,
      });
      expect(badReward).toBeLessThan(0.5);
    });

    it('should boost reward for quick responses', () => {
      const quickReward = calculateImplicitReward({
        continued: true,
        corrected: false,
        thanked: false,
        switchedTopic: false,
        responseTimeMs: 1000,
      });
      const slowReward = calculateImplicitReward({
        continued: true,
        corrected: false,
        thanked: false,
        switchedTopic: false,
        responseTimeMs: 5000,
      });
      expect(quickReward).toBeGreaterThan(slowReward);
    });
  });

  describe('calculateExplicitReward', () => {
    it('should convert 5-star rating to reward', () => {
      expect(calculateExplicitReward({ rating: 5 })).toBe(1.0);
      expect(calculateExplicitReward({ rating: 1 })).toBe(0.0);
      expect(calculateExplicitReward({ rating: 3 })).toBe(0.5);
    });

    it('should convert thumbs up/down to reward', () => {
      expect(calculateExplicitReward({ thumbs: 'up' })).toBe(1.0);
      expect(calculateExplicitReward({ thumbs: 'down' })).toBe(0.0);
    });

    it('should convert helpful boolean to reward', () => {
      expect(calculateExplicitReward({ helpful: true })).toBe(1.0);
      expect(calculateExplicitReward({ helpful: false })).toBe(0.0);
    });

    it('should return neutral for no feedback', () => {
      expect(calculateExplicitReward({})).toBe(0.5);
    });
  });
});

// ============================================================================
// PERSONA-SPECIFIC INTENTS TESTS
// ============================================================================

describe('getIntentsForPersona', () => {
  it('should return all intents for ferni', () => {
    const intents = getIntentsForPersona('ferni');
    expect(intents).toEqual(FERNI_INTENTS);
  });

  it('should return habit intents for maya', () => {
    const intents = getIntentsForPersona('maya');
    expect(intents.some((i) => i.category === 'habits')).toBe(true);
    expect(intents.some((i) => i.category === 'crisis')).toBe(true);
  });

  it('should return finance intents for peter', () => {
    const intents = getIntentsForPersona('peter');
    expect(intents.some((i) => i.category === 'finance')).toBe(true);
  });

  it('should return calendar intents for alex', () => {
    const intents = getIntentsForPersona('alex');
    expect(intents.some((i) => i.category === 'calendar')).toBe(true);
  });

  it('should return planning intents for jordan', () => {
    const intents = getIntentsForPersona('jordan');
    expect(intents.some((i) => i.category === 'planning')).toBe(true);
  });

  it('should return wisdom intents for nayan', () => {
    const intents = getIntentsForPersona('nayan');
    expect(intents.some((i) => i.category === 'wisdom')).toBe(true);
  });
});
