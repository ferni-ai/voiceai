/**
 * Story Timing Engine Tests
 *
 * Tests for the story timing intelligence that determines
 * when stories should be told for maximum impact.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  StoryTimingEngine,
  getStoryTimingEngine,
  resetStoryTimingEngine,
  type StoryTimingContext,
  type StoryRecommendation,
  type StoryMetrics,
} from '../conversation/story-timing.js';

import type { PersonaConfig, StoryConfig } from '../personas/types.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createStory(overrides: Partial<StoryConfig> = {}): StoryConfig {
  return {
    id: 'test-story',
    title: 'Test Story',
    triggers: ['test', 'example'],
    content: 'This is a test story.',
    emotionalTone: 'neutral',
    duration: 'short',
    ...overrides,
  };
}

function createPersona(stories: StoryConfig[] = []): PersonaConfig {
  return {
    id: 'test-persona',
    name: 'Test',
    systemPrompt: '',
    voice: 'test',
    description: 'Test persona',
    stories,
  } as PersonaConfig;
}

function createContext(overrides: Partial<StoryTimingContext> = {}): StoryTimingContext {
  return {
    turnCount: 10,
    conversationDurationMs: 60000,
    storiesToldThisSession: [],
    userEngagement: 'high',
    userPacing: 'relaxed',
    ...overrides,
  };
}

// ============================================================================
// STORY TIMING ENGINE TESTS
// ============================================================================

describe('StoryTimingEngine', () => {
  let engine: StoryTimingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new StoryTimingEngine();
  });

  describe('evaluateStoryTiming', () => {
    it('should reject stories when turn count is too low', () => {
      const persona = createPersona([createStory()]);
      const context = createContext({ turnCount: 2 });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.timing).toBe('soon');
      expect(result.reason).toContain('Too early');
    });

    it('should reject stories when too soon after last story', () => {
      const persona = createPersona([createStory()]);
      const context = createContext({
        turnCount: 10,
        lastStoryTurn: 8, // 2 turns ago
      });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('Too soon after last story');
    });

    it('should reject stories when max stories reached', () => {
      const persona = createPersona([createStory()]);
      const context = createContext({
        storiesToldThisSession: ['story1', 'story2', 'story3', 'story4'],
      });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.timing).toBe('never');
      expect(result.reason).toContain('Max stories reached');
    });

    it('should reject stories when user is rushed', () => {
      const persona = createPersona([createStory()]);
      const context = createContext({ userPacing: 'rushed' });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('rushed');
    });

    it('should reject stories when user engagement is low', () => {
      const persona = createPersona([createStory()]);
      const context = createContext({ userEngagement: 'low' });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('Low engagement');
    });

    it('should return no story when persona has no stories', () => {
      const persona = createPersona([]);
      const context = createContext();

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('No suitable story found');
    });

    it('should return no story when all stories already told', () => {
      const story = createStory({ id: 'told-story' });
      const persona = createPersona([story]);
      const context = createContext({
        storiesToldThisSession: ['told-story'],
      });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('No suitable story found');
    });

    it('should recommend telling story with good topic match', () => {
      const story = createStory({
        id: 'finance-story',
        triggers: ['money', 'investing', 'finance'],
      });
      const persona = createPersona([story]);
      const context = createContext({
        currentTopic: 'investing',
        userEngagement: 'high',
      });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.shouldTell).toBe(true);
      expect(result.story?.id).toBe('finance-story');
      expect(result.timing).toBe('now');
    });

    it('should include transition phrase in recommendation', () => {
      const story = createStory();
      const persona = createPersona([story]);
      const context = createContext({
        currentTopic: 'test topic',
      });

      const result = engine.evaluateStoryTiming(persona, context);

      expect(result.transitionPhrase).toBeDefined();
      expect(typeof result.transitionPhrase).toBe('string');
    });
  });

  describe('findBestStory', () => {
    it('should return null when persona has no stories', () => {
      const persona = createPersona([]);
      const context = createContext();

      const result = engine.findBestStory(persona, context);

      expect(result).toBeNull();
    });

    it('should filter out already-told stories', () => {
      const story1 = createStory({ id: 'story1' });
      const story2 = createStory({ id: 'story2' });
      const persona = createPersona([story1, story2]);
      const context = createContext({
        storiesToldThisSession: ['story1'],
      });

      const result = engine.findBestStory(persona, context);

      expect(result?.id).toBe('story2');
    });

    it('should prefer stories with matching triggers', () => {
      const genericStory = createStory({
        id: 'generic',
        triggers: ['general', 'stuff'],
      });
      const matchingStory = createStory({
        id: 'matching',
        triggers: ['retirement', 'pension'],
      });
      const persona = createPersona([genericStory, matchingStory]);
      const context = createContext({
        currentTopic: 'retirement planning',
      });

      const result = engine.findBestStory(persona, context);

      expect(result?.id).toBe('matching');
    });

    it('should return null when no story meets threshold', () => {
      const story = createStory({
        id: 'mismatched',
        triggers: ['xyz', 'abc'],
      });
      const persona = createPersona([story]);
      // Low turn count + low engagement = low score
      // Base: 0.5, turnCount<3: -0.3, low engagement: no bonus
      // Score = 0.2 + 0.1 (untold) = 0.3 < 0.4 threshold
      const context = createContext({
        turnCount: 2,
        currentTopic: 'completely unrelated topic',
        userEngagement: 'low', // No engagement bonus
      });

      const result = engine.findBestStory(persona, context);

      expect(result).toBeNull();
    });
  });

  describe('recordStoryTold', () => {
    it('should record story and update last story turn', () => {
      engine.recordStoryTold('story-1', 10);

      const metrics = engine.getMetrics();
      expect(metrics.storiesTold).toBe(1);
    });

    it('should record multiple stories', () => {
      engine.recordStoryTold('story-1', 5);
      engine.recordStoryTold('story-2', 12);
      engine.recordStoryTold('story-3', 20);

      const metrics = engine.getMetrics();
      expect(metrics.storiesTold).toBe(3);
    });
  });

  describe('recordStoryOutcome', () => {
    it('should track successful stories', () => {
      engine.recordStoryTold('good-story', 10);
      engine.recordStoryOutcome('good-story', true);

      const metrics = engine.getMetrics();
      expect(metrics.successfulStories).toContain('good-story');
    });

    it('should track unsuccessful stories', () => {
      engine.recordStoryTold('bad-story', 10);
      engine.recordStoryOutcome('bad-story', false);

      const metrics = engine.getMetrics();
      expect(metrics.successfulStories).not.toContain('bad-story');
    });

    it('should calculate engagement correctly', () => {
      engine.recordStoryTold('story-1', 5);
      engine.recordStoryTold('story-2', 10);
      engine.recordStoryOutcome('story-1', true);
      engine.recordStoryOutcome('story-2', false);

      const metrics = engine.getMetrics();
      // 1 success out of 2 stories = 0.5
      expect(metrics.avgEngagementAfterStory).toBe(0.5);
    });
  });

  describe('getMetrics', () => {
    it('should return zeroed metrics for new engine', () => {
      const metrics = engine.getMetrics();

      expect(metrics.storiesTold).toBe(0);
      expect(metrics.storiesSkipped).toBe(0);
      expect(metrics.avgEngagementAfterStory).toBe(0);
      expect(metrics.successfulStories).toEqual([]);
    });

    it('should return accurate metrics after activity', () => {
      engine.recordStoryTold('story-1', 5);
      engine.recordStoryTold('story-2', 12);
      engine.recordStoryOutcome('story-1', true);
      engine.recordStoryOutcome('story-2', true);

      const metrics = engine.getMetrics();

      expect(metrics.storiesTold).toBe(2);
      expect(metrics.successfulStories).toHaveLength(2);
      expect(metrics.avgEngagementAfterStory).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all tracking data', () => {
      engine.recordStoryTold('story-1', 5);
      engine.recordStoryOutcome('story-1', true);

      engine.reset();

      const metrics = engine.getMetrics();
      expect(metrics.storiesTold).toBe(0);
      expect(metrics.successfulStories).toEqual([]);
    });
  });

  describe('emotional fit checking', () => {
    it('should reject stories when user needs emotional support', () => {
      const story = createStory();
      const persona = createPersona([story]);
      const context = createContext({
        emotionalArc: {
          currentValence: -0.5,
          currentArousal: 0.7,
          trajectory: 'declining',
          needsEmotionalSupport: true,
          emotionalHistory: [],
          sessionStartEmotion: { valence: 0, arousal: 0.5 },
        },
      });

      const result = engine.evaluateStoryTiming(persona, context, story);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('User needs support');
    });

    it('should reject stories when emotions are volatile', () => {
      const story = createStory();
      const persona = createPersona([story]);
      const context = createContext({
        emotionalArc: {
          currentValence: 0,
          currentArousal: 0.5,
          trajectory: 'volatile',
          needsEmotionalSupport: false,
          emotionalHistory: [],
          sessionStartEmotion: { valence: 0, arousal: 0.5 },
        },
      });

      const result = engine.evaluateStoryTiming(persona, context, story);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('volatile');
    });

    it('should reject stories when user is agitated', () => {
      const story = createStory();
      const persona = createPersona([story]);
      const context = createContext({
        emotionalArc: {
          currentValence: -0.3,
          currentArousal: 0.8, // High arousal + negative valence
          trajectory: 'stable',
          needsEmotionalSupport: false,
          emotionalHistory: [],
          sessionStartEmotion: { valence: 0, arousal: 0.5 },
        },
      });

      const result = engine.evaluateStoryTiming(persona, context, story);

      expect(result.shouldTell).toBe(false);
      expect(result.reason).toContain('agitated');
    });

    it('should allow stories when emotional state is OK', () => {
      const story = createStory({
        triggers: ['test', 'current'],
      });
      const persona = createPersona([story]);
      const context = createContext({
        currentTopic: 'test topic',
        emotionalArc: {
          currentValence: 0.3, // Positive
          currentArousal: 0.4, // Low-moderate
          trajectory: 'stable',
          needsEmotionalSupport: false,
          emotionalHistory: [],
          sessionStartEmotion: { valence: 0, arousal: 0.5 },
        },
      });

      const result = engine.evaluateStoryTiming(persona, context, story);

      expect(result.shouldTell).toBe(true);
    });
  });
});

// ============================================================================
// SINGLETON TESTS
// ============================================================================

describe('StoryTimingEngine Singleton', () => {
  beforeEach(() => {
    resetStoryTimingEngine();
  });

  describe('getStoryTimingEngine', () => {
    it('should return the same instance on multiple calls', () => {
      const engine1 = getStoryTimingEngine();
      const engine2 = getStoryTimingEngine();

      expect(engine1).toBe(engine2);
    });

    it('should return a StoryTimingEngine instance', () => {
      const engine = getStoryTimingEngine();

      expect(engine).toBeInstanceOf(StoryTimingEngine);
    });
  });

  describe('resetStoryTimingEngine', () => {
    it('should clear data and create new instance on next get', () => {
      const engine1 = getStoryTimingEngine();
      engine1.recordStoryTold('story-1', 5);

      resetStoryTimingEngine();

      const engine2 = getStoryTimingEngine();
      expect(engine2.getMetrics().storiesTold).toBe(0);
    });

    it('should not throw when called without existing engine', () => {
      expect(() => resetStoryTimingEngine()).not.toThrow();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('StoryTimingEngine Integration', () => {
  let engine: StoryTimingEngine;

  beforeEach(() => {
    engine = new StoryTimingEngine();
  });

  it('should handle realistic conversation progression', () => {
    const stories = [
      createStory({ id: 'intro-story', triggers: ['hello', 'introduction'] }),
      createStory({ id: 'deep-story', triggers: ['life', 'meaning'] }),
      createStory({ id: 'finance-story', triggers: ['money', 'investing'] }),
    ];
    const persona = createPersona(stories);

    // Early conversation - should not tell stories
    let context = createContext({ turnCount: 2 });
    let result = engine.evaluateStoryTiming(persona, context);
    expect(result.shouldTell).toBe(false);

    // Mid conversation with matching topic
    context = createContext({
      turnCount: 8,
      currentTopic: 'investing',
      userEngagement: 'high',
    });
    result = engine.evaluateStoryTiming(persona, context);
    expect(result.shouldTell).toBe(true);
    expect(result.story?.id).toBe('finance-story');

    // Record the story was told
    engine.recordStoryTold('finance-story', 8);

    // Try again immediately - should be too soon
    context = createContext({
      turnCount: 10,
      lastStoryTurn: 8,
      storiesToldThisSession: ['finance-story'],
    });
    result = engine.evaluateStoryTiming(persona, context);
    expect(result.shouldTell).toBe(false);
    expect(result.reason).toContain('Too soon');

    // Later in conversation - should work with different story
    context = createContext({
      turnCount: 20,
      lastStoryTurn: 8, // 12 turns ago - enough spacing
      storiesToldThisSession: ['finance-story'],
      currentTopic: 'life philosophy',
    });
    result = engine.evaluateStoryTiming(persona, context);
    expect(result.shouldTell).toBe(true);
    expect(result.story?.id).toBe('deep-story');
  });

  it('should respect session story limits', () => {
    const stories = [
      createStory({ id: 'story1' }),
      createStory({ id: 'story2' }),
      createStory({ id: 'story3' }),
      createStory({ id: 'story4' }),
      createStory({ id: 'story5' }),
    ];
    const persona = createPersona(stories);

    // After 4 stories, should stop
    const context = createContext({
      storiesToldThisSession: ['story1', 'story2', 'story3', 'story4'],
    });

    const result = engine.evaluateStoryTiming(persona, context);
    expect(result.shouldTell).toBe(false);
    expect(result.timing).toBe('never');
  });
});
