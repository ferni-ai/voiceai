/**
 * Arc-Aware Selector Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted for mocks that need to be referenced
const { mockGetEmotionalArcTracker, mockEmitArc } = vi.hoisted(() => ({
  mockGetEmotionalArcTracker: vi.fn(),
  mockEmitArc: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../conversation/index.js', () => ({
  getEmotionalArcTracker: mockGetEmotionalArcTracker,
}));

vi.mock('../humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    emitArc: mockEmitArc.mockResolvedValue(undefined),
  },
}));

import {
  getArcBehaviorRecommendation,
  getPhaseGuidance,
  getPhasePersonality,
  shouldSurfaceInnerWorld,
  areStoriesAppropriate,
  getRecommendedResponseLength,
  type PhasePersonality,
} from '../arc-aware-selector.js';

describe('ArcAwareSelector', () => {
  const createMockArcTracker = (overrides = {}) => ({
    getArc: vi.fn().mockReturnValue({
      currentArousal: 0.5,
      currentValence: 0.5,
      trajectory: 'stable',
      needsEmotionalSupport: false,
      ...overrides,
    }),
    getCurrentPhase: vi.fn().mockReturnValue('building'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmotionalArcTracker.mockReturnValue(createMockArcTracker());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getArcBehaviorRecommendation', () => {
    it('should return opening phase for early turns', () => {
      mockGetEmotionalArcTracker.mockReturnValue(createMockArcTracker());

      const recommendation = getArcBehaviorRecommendation(2);

      expect(recommendation.phase).toBeDefined();
      expect(recommendation.personality).toBeDefined();
      expect(recommendation.behaviors).toBeDefined();
    });

    it('should include personality settings', () => {
      const recommendation = getArcBehaviorRecommendation(5);

      expect(recommendation.personality.energy).toBeGreaterThan(0);
      expect(recommendation.personality.focus).toBeDefined();
      expect(recommendation.personality.responseLength).toBeDefined();
    });

    it('should include behavior flags', () => {
      const recommendation = getArcBehaviorRecommendation(5);

      expect(typeof recommendation.behaviors.useBackchannels).toBe('boolean');
      expect(typeof recommendation.behaviors.allowTangents).toBe('boolean');
      expect(typeof recommendation.behaviors.offerStories).toBe('boolean');
    });

    it('should adjust for high emotional intensity', () => {
      const normalRec = getArcBehaviorRecommendation(5, undefined, {
        emotionalIntensity: 0.3,
      });

      const highIntensityRec = getArcBehaviorRecommendation(5, undefined, {
        emotionalIntensity: 0.85,
      });

      // High intensity should have lower question frequency
      expect(highIntensityRec.personality.questionFrequency).toBeLessThanOrEqual(
        normalRec.personality.questionFrequency
      );
    });

    it('should adjust for heavy topics', () => {
      const rec = getArcBehaviorRecommendation(5, undefined, {
        topicWeight: 'heavy',
      });

      expect(rec.personality.responseLength).toBe('minimal');
      expect(rec.personality.storiesAppropriate).toBe(false);
    });

    it('should adjust for stranger relationship', () => {
      const rec = getArcBehaviorRecommendation(5, undefined, {
        relationshipStage: 'stranger',
      });

      expect(rec.personality.innerWorldActive).toBe(false);
    });

    it('should emit arc signal on phase change', async () => {
      mockGetEmotionalArcTracker.mockReturnValue({
        getArc: vi.fn().mockReturnValue({
          currentArousal: 0.8,
          trajectory: 'stable',
        }),
        getCurrentPhase: vi.fn().mockReturnValue('peak'),
      });

      getArcBehaviorRecommendation(8, 'building', {
        userEmotion: 'sad',
        emotionalIntensity: 0.7,
      });

      expect(mockEmitArc).toHaveBeenCalledWith({
        phase: 'peak',
        intensity: 0.7,
        dominantEmotion: 'sad',
      });
    });

    it('should include transition phrase on phase change', () => {
      mockGetEmotionalArcTracker.mockReturnValue({
        getArc: vi.fn().mockReturnValue({
          currentArousal: 0.3,
          trajectory: 'declining',
        }),
        getCurrentPhase: vi.fn().mockReturnValue('release'),
      });

      const rec = getArcBehaviorRecommendation(10, 'peak');

      // peak->release transition has phrases defined
      expect(rec.suggestions.transitionPhrase).toBeDefined();
    });

    it('should enable backchannels in building phase', () => {
      mockGetEmotionalArcTracker.mockReturnValue({
        getArc: vi.fn().mockReturnValue({}),
        getCurrentPhase: vi.fn().mockReturnValue('building'),
      });

      const rec = getArcBehaviorRecommendation(6);

      expect(rec.behaviors.useBackchannels).toBe(true);
    });

    it('should use callback context', () => {
      mockGetEmotionalArcTracker.mockReturnValue({
        getArc: vi.fn().mockReturnValue({}),
        getCurrentPhase: vi.fn().mockReturnValue('building'),
      });

      const rec = getArcBehaviorRecommendation(6, undefined, {
        hasActiveCallback: true,
      });

      expect(rec.behaviors.useInsideReferences).toBe(true);
    });
  });

  describe('getPhaseGuidance', () => {
    it('should return guidance for opening phase', () => {
      const guidance = getPhaseGuidance('opening');

      expect(Array.isArray(guidance)).toBe(true);
      expect(guidance.length).toBeGreaterThan(0);
    });

    it('should return guidance for peak phase', () => {
      const guidance = getPhaseGuidance('peak');

      expect(guidance.some(g => g.includes('present'))).toBe(true);
    });

    it('should return guidance for closing phase', () => {
      const guidance = getPhaseGuidance('closing');

      expect(guidance.some(g => g.includes('wrap'))).toBe(true);
    });
  });

  describe('getPhasePersonality', () => {
    it('should return personality for each phase', () => {
      const phases = ['opening', 'building', 'peak', 'release', 'closing'] as const;

      for (const phase of phases) {
        const personality = getPhasePersonality(phase);

        expect(personality.energy).toBeGreaterThan(0);
        expect(personality.energy).toBeLessThanOrEqual(1);
        expect(personality.focus).toBeDefined();
      }
    });

    it('should return lowest energy for peak phase', () => {
      const peakPersonality = getPhasePersonality('peak');
      const buildingPersonality = getPhasePersonality('building');

      expect(peakPersonality.energy).toBeLessThan(buildingPersonality.energy);
    });

    it('should have highest silence comfort at peak', () => {
      const peakPersonality = getPhasePersonality('peak');
      const openingPersonality = getPhasePersonality('opening');

      expect(peakPersonality.silenceComfort).toBeGreaterThan(openingPersonality.silenceComfort);
    });

    it('should return a copy (not original)', () => {
      const p1 = getPhasePersonality('building');
      const p2 = getPhasePersonality('building');

      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });

  describe('shouldSurfaceInnerWorld', () => {
    it('should not surface for strangers', () => {
      const result = shouldSurfaceInnerWorld('peak', 0.8, 'stranger');

      expect(result).toBe(false);
    });

    it('should not surface for low emotional intensity', () => {
      const result = shouldSurfaceInnerWorld('peak', 0.2, 'friend');

      expect(result).toBe(false);
    });

    it('should have probabilistic surfacing for peak phase', () => {
      // Run multiple times to check probability-based behavior
      let surfacedCount = 0;
      for (let i = 0; i < 50; i++) {
        if (shouldSurfaceInnerWorld('peak', 0.7, 'friend')) {
          surfacedCount++;
        }
      }

      // Peak has 55% base probability, with friend bonus of 10% = 65%
      // Should surface at least sometimes (probabilistic)
      expect(surfacedCount).toBeGreaterThan(0);
    });

    it('should have lower probability for opening phase', () => {
      // Opening has low probability (10%)
      let surfacedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (shouldSurfaceInnerWorld('opening', 0.6, 'acquaintance')) {
          surfacedCount++;
        }
      }

      // Should surface rarely
      expect(surfacedCount).toBeLessThan(40);
    });
  });

  describe('areStoriesAppropriate', () => {
    it('should not allow stories in peak phase', () => {
      const result = areStoriesAppropriate('peak', {});

      expect(result).toBe(false);
    });

    it('should allow stories in building phase', () => {
      const result = areStoriesAppropriate('building', {
        turnsSinceLastStory: 10,
      });

      expect(result).toBe(true);
    });

    it('should not allow stories too soon after last story', () => {
      const result = areStoriesAppropriate('building', {
        turnsSinceLastStory: 2,
      });

      expect(result).toBe(false);
    });

    it('should not allow stories during distress', () => {
      const result = areStoriesAppropriate('building', {
        userEmotion: 'distressed',
        turnsSinceLastStory: 10,
      });

      expect(result).toBe(false);
    });

    it('should not allow stories during anxiety', () => {
      const result = areStoriesAppropriate('release', {
        userEmotion: 'anxious',
        turnsSinceLastStory: 10,
      });

      expect(result).toBe(false);
    });
  });

  describe('getRecommendedResponseLength', () => {
    it('should return minimal for peak phase', () => {
      const result = getRecommendedResponseLength('peak', 50);

      expect(result.minWords).toBeLessThan(30);
      expect(result.maxWords).toBeLessThan(50);
    });

    it('should return balanced for building phase', () => {
      const result = getRecommendedResponseLength('building', 50);

      expect(result.minWords).toBeGreaterThanOrEqual(30);
      expect(result.maxWords).toBeGreaterThanOrEqual(100);
    });

    it('should reduce length for short user messages', () => {
      const shortResult = getRecommendedResponseLength('building', 10);
      const normalResult = getRecommendedResponseLength('building', 50);

      expect(shortResult.maxWords).toBeLessThan(normalResult.maxWords);
    });

    it('should increase length for long user messages', () => {
      const longResult = getRecommendedResponseLength('building', 150);
      const normalResult = getRecommendedResponseLength('building', 50);

      expect(longResult.minWords).toBeGreaterThan(normalResult.minWords);
    });
  });
});
