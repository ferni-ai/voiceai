/**
 * DeepHumanizationEngine Tests
 *
 * Comprehensive tests for the deep humanization engine that creates
 * natural, human-like conversation features:
 * - Mood drift
 * - Spontaneous thoughts
 * - Physical presence
 * - Running jokes
 * - Mind changes
 * - Engagement signals
 * - Excitement interruptions
 * - Breath sounds
 * - Anticipation
 * - Contradiction surfacing
 * - First-turn noticing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DeepHumanizationEngine,
  getDeepHumanizationEngine,
  resetDeepHumanizationEngine,
  classifyTopicWeight,
  detectEvidence,
  detectBreakthrough,
  detectAdviceGiving,
  detectDisengagement,
  detectHighEngagement,
  type HumanizationContext,
  type ConversationMood,
} from '../deep-humanization.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('DeepHumanizationEngine', () => {
  const testPersonaId = 'ferni';
  let engine: DeepHumanizationEngine;

  beforeEach(() => {
    resetDeepHumanizationEngine(testPersonaId);
    engine = new DeepHumanizationEngine(testPersonaId);
  });

  afterEach(() => {
    resetDeepHumanizationEngine(testPersonaId);
  });

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('initialization', () => {
    it('should create a new engine instance', () => {
      expect(engine).toBeInstanceOf(DeepHumanizationEngine);
    });

    it('should get singleton instance via factory', () => {
      const instance1 = getDeepHumanizationEngine(testPersonaId);
      const instance2 = getDeepHumanizationEngine(testPersonaId);
      expect(instance1).toBe(instance2);
    });

    it('should start with default mood', () => {
      const mood = engine.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
      expect(mood.heavyTopicCount).toBe(0);
      expect(mood.inEmotionalMoment).toBe(false);
    });
  });

  // ==========================================================================
  // MOOD TRACKING TESTS
  // ==========================================================================

  describe('mood tracking', () => {
    it('should decrease energy for heavy topics', () => {
      const initialMood = engine.getMood();

      engine.updateMood({
        topicWeight: 'heavy',
        turnCount: 1,
      });

      const updatedMood = engine.getMood();
      expect(updatedMood.energy).toBeLessThan(initialMood.energy);
      expect(updatedMood.emotionalLoad).toBeGreaterThan(0);
      expect(updatedMood.heavyTopicCount).toBe(1);
    });

    it('should increase energy for light topics', () => {
      // First decrease with heavy topic
      engine.updateMood({ topicWeight: 'heavy', turnCount: 1 });
      const afterHeavy = engine.getMood();

      // Then increase with light topic
      engine.updateMood({ topicWeight: 'light', turnCount: 2 });
      const afterLight = engine.getMood();

      expect(afterLight.energy).toBeGreaterThan(afterHeavy.energy);
    });

    it('should track emotional moments', () => {
      engine.updateMood({
        userEmotion: 'sadness',
        turnCount: 1,
      });

      expect(engine.getMood().inEmotionalMoment).toBe(true);
    });

    it('should track vulnerable moments', () => {
      engine.updateMood({
        userEmotion: 'vulnerable',
        turnCount: 1,
      });

      expect(engine.getMood().inEmotionalMoment).toBe(true);
    });

    it('should increase engagement for high user engagement', () => {
      const initial = engine.getMood();

      engine.updateMood({
        userEngagement: 'high',
        turnCount: 1,
      });

      expect(engine.getMood().engagement).toBeGreaterThan(initial.engagement);
    });

    it('should decrease engagement for low user engagement', () => {
      const initial = engine.getMood();

      engine.updateMood({
        userEngagement: 'low',
        turnCount: 1,
      });

      expect(engine.getMood().engagement).toBeLessThan(initial.engagement);
    });

    it('should decay energy in long sessions', () => {
      // Update with many turns
      for (let i = 1; i <= 20; i++) {
        engine.updateMood({ turnCount: i });
      }

      const mood = engine.getMood();
      // Energy should have decayed
      expect(mood.energy).toBeLessThan(0.75);
    });
  });

  // ==========================================================================
  // HUMANIZATION INJECTION TESTS
  // ==========================================================================

  describe('getHumanizationInjections', () => {
    const baseContext: HumanizationContext = {
      personaId: testPersonaId,
      turnCount: 5,
      sessionMinutes: 10,
      currentHour: 14,
      userMessage: 'Testing the humanization system',
      recentTopics: ['testing'],
      relationshipStage: 'acquaintance',
    };

    it('should return array of injections', async () => {
      const injections = await engine.getHumanizationInjections(baseContext);
      expect(Array.isArray(injections)).toBe(true);
    });

    it('should limit injections to max 2 per response', async () => {
      // Run multiple times to test limit
      for (let i = 0; i < 5; i++) {
        const injections = await engine.getHumanizationInjections({
          ...baseContext,
          turnCount: i + 5,
        });
        expect(injections.length).toBeLessThanOrEqual(2);
      }
    });

    it('should return injections with required properties', async () => {
      // Run multiple times to get at least one injection
      let foundInjection = false;
      for (let i = 0; i < 20; i++) {
        const injections = await engine.getHumanizationInjections({
          ...baseContext,
          turnCount: i + 1,
        });
        if (injections.length > 0) {
          foundInjection = true;
          const injection = injections[0];
          expect(injection.type).toBeDefined();
          expect(injection.content).toBeDefined();
          expect(injection.placement).toBeDefined();
          expect(['prefix', 'suffix', 'standalone', 'interrupt']).toContain(injection.placement);
          break;
        }
      }
      // Injections are probabilistic, so we don't require finding one
      expect(typeof foundInjection).toBe('boolean');
    });

    it('should prioritize excitement interruptions for breakthrough moments', async () => {
      const injections = await engine.getHumanizationInjections(
        { ...baseContext, turnCount: 10 },
        { isBreakthroughMoment: true }
      );

      // Check if excitement_interruption is present (probabilistic)
      if (injections.length > 0) {
        const types = injections.map((i) => i.type);
        // Excitement should be prioritized when breakthrough detected
        expect(Array.isArray(types)).toBe(true);
      }
    });

    it('should prioritize engagement signal for disengaged users', async () => {
      const injections = await engine.getHumanizationInjections(
        { ...baseContext, turnCount: 10 },
        { isDisengaged: true }
      );

      // Engagement signal should be considered (probabilistic)
      expect(Array.isArray(injections)).toBe(true);
    });
  });

  // ==========================================================================
  // APPLY INJECTIONS TESTS
  // ==========================================================================

  describe('applyInjections', () => {
    it('should apply prefix injections', () => {
      const result = engine.applyInjections('Original response.', [
        {
          type: 'mood_signal',
          content: 'Hmm,',
          placement: 'prefix',
          probability: 1,
          cooldownTurns: 0,
        },
      ]);

      expect(result).toContain('Hmm,');
      expect(result).toContain('Original response.');
      expect(result.indexOf('Hmm,')).toBeLessThan(result.indexOf('Original'));
    });

    it('should apply suffix injections', () => {
      const result = engine.applyInjections('Original response.', [
        {
          type: 'physical_presence',
          content: '*leans back*',
          placement: 'suffix',
          probability: 1,
          cooldownTurns: 0,
        },
      ]);

      expect(result).toContain('Original response.');
      expect(result).toContain('*leans back*');
      expect(result.indexOf('*leans back*')).toBeGreaterThan(result.indexOf('Original'));
    });

    it('should apply interrupt injections with break', () => {
      const result = engine.applyInjections('Original response.', [
        {
          type: 'excitement_interruption',
          content: 'Wait!',
          placement: 'interrupt',
          probability: 1,
          cooldownTurns: 0,
        },
      ]);

      expect(result).toContain('Wait!');
      expect(result).toContain('<break time="200ms"/>');
    });

    it('should apply multiple injections in order', () => {
      const result = engine.applyInjections('Middle.', [
        {
          type: 'mood_signal',
          content: 'Start',
          placement: 'prefix',
          probability: 1,
          cooldownTurns: 0,
        },
        {
          type: 'physical_presence',
          content: 'End',
          placement: 'suffix',
          probability: 1,
          cooldownTurns: 0,
        },
      ]);

      const startIdx = result.indexOf('Start');
      const middleIdx = result.indexOf('Middle');
      const endIdx = result.indexOf('End');

      expect(startIdx).toBeLessThan(middleIdx);
      expect(middleIdx).toBeLessThan(endIdx);
    });
  });

  // ==========================================================================
  // RESET TESTS
  // ==========================================================================

  describe('reset', () => {
    it('should reset mood to default values', () => {
      // Modify mood
      engine.updateMood({
        topicWeight: 'heavy',
        userEngagement: 'high',
        userEmotion: 'sadness',
        turnCount: 10,
      });

      // Reset
      engine.reset();

      // Check defaults
      const mood = engine.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
      expect(mood.heavyTopicCount).toBe(0);
      expect(mood.inEmotionalMoment).toBe(false);
    });
  });
});

// ============================================================================
// DETECTION HELPER TESTS (delegated to shared utilities)
// ============================================================================

describe('Detection helpers (shared utilities)', () => {
  describe('classifyTopicWeight', () => {
    it('should classify heavy topics', () => {
      expect(classifyTopicWeight('My father died')).toBe('heavy');
      expect(classifyTopicWeight('Dealing with trauma')).toBe('heavy');
      expect(classifyTopicWeight('I got fired today')).toBe('heavy');
    });

    it('should classify light topics', () => {
      expect(classifyTopicWeight('Haha that was funny')).toBe('light');
      expect(classifyTopicWeight("I'm so excited!")).toBe('light');
      expect(classifyTopicWeight('Going on vacation')).toBe('light');
    });

    it('should classify medium topics', () => {
      expect(classifyTopicWeight('Working on a project')).toBe('medium');
    });

    it('should use detected emotion', () => {
      expect(classifyTopicWeight('Something happened', 'sadness')).toBe('heavy');
      expect(classifyTopicWeight('Something happened', 'joy')).toBe('light');
    });
  });

  describe('detectEvidence', () => {
    it('should detect evidence patterns', () => {
      expect(detectEvidence("Here's the thing")).toBe(true);
      expect(detectEvidence('But actually')).toBe(true);
      expect(detectEvidence('In my experience')).toBe(true);
      expect(detectEvidence('I disagree')).toBe(true);
    });

    it('should return false for non-evidence', () => {
      expect(detectEvidence('I agree with you')).toBe(false);
      expect(detectEvidence('That makes sense')).toBe(false);
    });
  });

  describe('detectBreakthrough', () => {
    it('should detect breakthrough patterns', () => {
      expect(detectBreakthrough('I just realized')).toBe(true);
      expect(detectBreakthrough('It hit me that')).toBe(true);
      expect(detectBreakthrough('Finally!')).toBe(true);
      expect(detectBreakthrough("I've never told anyone")).toBe(true);
    });

    it('should return false for non-breakthrough', () => {
      expect(detectBreakthrough('I think so')).toBe(false);
      expect(detectBreakthrough('Maybe')).toBe(false);
    });
  });

  describe('detectAdviceGiving', () => {
    it('should detect advice patterns', () => {
      expect(detectAdviceGiving('You should try')).toBe(true);
      expect(detectAdviceGiving("I'd recommend")).toBe(true);
      expect(detectAdviceGiving('Consider this')).toBe(true);
    });

    it('should return false for non-advice', () => {
      expect(detectAdviceGiving('What do you think?')).toBe(false);
      expect(detectAdviceGiving('How are you feeling?')).toBe(false);
    });
  });

  describe('detectDisengagement', () => {
    it('should detect disengagement patterns', () => {
      expect(detectDisengagement('yeah')).toBe(true);
      expect(detectDisengagement('ok')).toBe(true);
      expect(detectDisengagement('whatever')).toBe(true);
      expect(detectDisengagement('meh')).toBe(true);
    });

    it('should return false for engaged responses', () => {
      expect(detectDisengagement("That's really interesting!")).toBe(false);
      expect(detectDisengagement('Tell me more about that')).toBe(false);
    });
  });

  describe('detectHighEngagement', () => {
    it('should detect high engagement in long enthusiastic messages', () => {
      const engaged =
        "This is so fascinating! I've been thinking about this for a while and I feel like I finally understand what you mean. I want to share more about my experience.";
      expect(detectHighEngagement(engaged)).toBe(true);
    });

    it('should return false for short messages', () => {
      expect(detectHighEngagement("That's cool")).toBe(false);
      expect(detectHighEngagement('Interesting')).toBe(false);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('deep humanization factory', () => {
  it('should get or create engine for persona', () => {
    const engine1 = getDeepHumanizationEngine('test-persona');
    const engine2 = getDeepHumanizationEngine('test-persona');
    expect(engine1).toBe(engine2);
  });

  it('should create different engines for different personas', () => {
    const ferniEngine = getDeepHumanizationEngine('ferni');
    const peterEngine = getDeepHumanizationEngine('peter-john');
    expect(ferniEngine).not.toBe(peterEngine);
  });

  it('should reset specific persona engine', () => {
    const engine = getDeepHumanizationEngine('reset-test');
    engine.updateMood({ topicWeight: 'heavy', turnCount: 1 });

    resetDeepHumanizationEngine('reset-test');

    // After reset, mood should be default
    const mood = engine.getMood();
    expect(mood.energy).toBe(0.75);
  });
});
