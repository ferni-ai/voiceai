/**
 * Persona Pattern Integration Tests
 *
 * Tests the connection between persona bundles and predictive intelligence.
 *
 * @module intelligence/predictive/__tests__/persona-patterns.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PersonaPredictiveConfig, PatternMatchContext } from '../persona-patterns.js';

// Mock loadBundleById
vi.mock('../../../personas/bundles/loader.js', () => ({
  loadBundleById: vi.fn(),
}));

// Import after mocking
import {
  loadPersonaPatterns,
  matchPersonaPatterns,
  getPersonaFollowUps,
  detectPersonaConcerns,
  getPersonaPatternSignal,
  clearPatternCache,
} from '../persona-patterns.js';
import { loadBundleById } from '../../../personas/bundles/loader.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockPredictiveConfig: PersonaPredictiveConfig = {
  patterns: {
    temporal: {
      sunday_reflection: {
        triggers: ['week', 'sunday', 'reflection'],
        detection: 'User mentions Sunday or weekly reflection',
        insight: 'Sunday is often a time of transition and introspection',
        proactiveResponse: ['Sundays can be a powerful time for reflection. What are you noticing?'],
        dayOfWeekAffinity: [0], // Sunday
      },
      monday_stress: {
        triggers: ['monday', 'work', 'stress', 'busy'],
        detection: 'User mentions Monday or work stress',
        proactiveResponse: ['The start of the week can feel heavy. How are you carrying it?'],
        dayOfWeekAffinity: [1], // Monday
        hourRangeAffinity: [7, 10], // Morning hours
      },
    },
    emotional: {
      overwhelm_pattern: {
        triggers: ['overwhelmed', 'too much', 'cant handle'],
        detection: 'User expresses feeling overwhelmed',
        insight: 'They may need help prioritizing or permission to let go',
        proactiveResponse: ["When everything feels heavy, we can find what matters most together."],
        valenceMatch: 'negative',
        intensityThreshold: 0.7,
      },
      joy_celebration: {
        triggers: ['happy', 'excited', 'wonderful', 'amazing'],
        detection: 'User expresses joy or excitement',
        proactiveResponse: ["That spark of joy is worth savoring. What made this moment special?"],
        valenceMatch: 'positive',
      },
    },
    behavioral: {
      avoidance_pattern: {
        triggers: ['later', 'eventually', 'someday', 'not now'],
        detection: 'User shows avoidance behavior',
        insight: 'Avoidance often protects something vulnerable',
        proactiveResponse: ["I notice we keep circling back. No pressure, but I'm curious what's there."],
      },
      progress_seeking: {
        triggers: ['goal', 'progress', 'achieving', 'next step'],
        detection: 'User focused on progress and goals',
        proactiveResponse: ["Your drive is inspiring. What would make this next step feel meaningful?"],
      },
    },
  },
  concernDetection: {
    warningSigns: {
      isolation: {
        detection: 'Signs of social withdrawal',
        response: ["It sounds like you've been spending time alone lately. How are you feeling about that?"],
        severity: 'medium',
        warningSigns: ['alone', 'nobody', 'isolated', 'withdrawn'],
      },
      burnout: {
        detection: 'Signs of burnout',
        response: ["I'm noticing some signs of exhaustion. Your wellbeing matters - can we explore what's draining you?"],
        severity: 'high',
        warningSigns: ['exhausted', 'drained', 'burnt out', 'cant sleep', 'nothing matters'],
      },
    },
  },
  proactiveFollowUps: {
    goal_check: {
      timing: 'end of session',
      phrases: ["How are you feeling about your goals?", "Any progress on what we discussed?"],
      minSessionsToSurface: 3,
    },
    habit_reminder: {
      timing: 'when relevant',
      phrases: ["How's that new habit going?", "Have you been keeping up with your practice?"],
      minSessionsToSurface: 5,
    },
  },
  usageRules: {
    minSessionsForPatterns: 2,
    minSessionsForProactive: 3,
    maxProactiveMentionsPerSession: 2,
  },
};

const mockBundle = {
  manifest: { identity: { id: 'ferni' } },
  bundlePath: '/test/path',
  loadedAt: new Date(),
  getBehaviors: vi.fn().mockResolvedValue({
    'predictive-patterns': mockPredictiveConfig,
  }),
  getStory: vi.fn(),
  getStoriesByTrigger: vi.fn(),
  getAllStories: vi.fn(),
  getKnowledge: vi.fn(),
};

// ============================================================================
// TESTS
// ============================================================================

describe('PersonaPatterns', () => {
  beforeEach(() => {
    clearPatternCache();
    vi.clearAllMocks();
    (loadBundleById as ReturnType<typeof vi.fn>).mockResolvedValue(mockBundle);
  });

  // ==========================================================================
  // loadPersonaPatterns
  // ==========================================================================

  describe('loadPersonaPatterns', () => {
    it('should load patterns from persona bundle', async () => {
      const config = await loadPersonaPatterns('ferni');

      expect(config).not.toBeNull();
      expect(config?.patterns.temporal).toHaveProperty('sunday_reflection');
      expect(config?.patterns.emotional).toHaveProperty('overwhelm_pattern');
      expect(config?.patterns.behavioral).toHaveProperty('avoidance_pattern');
    });

    it('should cache loaded patterns', async () => {
      await loadPersonaPatterns('ferni');
      await loadPersonaPatterns('ferni');

      // Should only load once due to caching
      expect(loadBundleById).toHaveBeenCalledTimes(1);
    });

    it('should return null if bundle not found', async () => {
      (loadBundleById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const config = await loadPersonaPatterns('unknown');

      expect(config).toBeNull();
    });

    it('should return default config if no predictive patterns in bundle', async () => {
      (loadBundleById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockBundle,
        getBehaviors: vi.fn().mockResolvedValue({}),
      });

      const config = await loadPersonaPatterns('empty');

      expect(config).not.toBeNull();
      expect(Object.keys(config?.patterns.temporal || {})).toHaveLength(0);
    });
  });

  // ==========================================================================
  // matchPersonaPatterns
  // ==========================================================================

  describe('matchPersonaPatterns', () => {
    it('should match temporal patterns', () => {
      const context: PatternMatchContext = {
        userMessage: 'It\'s Sunday and I want to reflect on my week',
        topics: ['reflection'],
        dayOfWeek: 0, // Sunday
        hour: 10,
        sessionNumber: 5,
      };

      const patterns = matchPersonaPatterns('ferni', mockPredictiveConfig, context);

      expect(patterns.length).toBeGreaterThan(0);
      const sundayPattern = patterns.find((p) => p.name === 'sunday_reflection');
      expect(sundayPattern).toBeDefined();
      expect(sundayPattern?.patternType).toBe('temporal');
    });

    it('should boost confidence for temporal affinity matches', () => {
      const sundayContext: PatternMatchContext = {
        userMessage: 'I want to reflect on my week',
        topics: ['reflection'],
        dayOfWeek: 0, // Sunday (matches affinity)
        hour: 10,
        sessionNumber: 5,
      };

      const tuesdayContext: PatternMatchContext = {
        userMessage: 'I want to reflect on my week',
        topics: ['reflection'],
        dayOfWeek: 2, // Tuesday (no affinity match)
        hour: 10,
        sessionNumber: 5,
      };

      const sundayPatterns = matchPersonaPatterns('ferni', mockPredictiveConfig, sundayContext);
      const tuesdayPatterns = matchPersonaPatterns('ferni', mockPredictiveConfig, tuesdayContext);

      const sundayReflection = sundayPatterns.find((p) => p.name === 'sunday_reflection');
      const tuesdayReflection = tuesdayPatterns.find((p) => p.name === 'sunday_reflection');

      // Sunday should have higher confidence
      if (sundayReflection && tuesdayReflection) {
        expect(sundayReflection.confidence).toBeGreaterThan(tuesdayReflection.confidence);
      }
    });

    it('should match emotional patterns with valence boost', () => {
      const context: PatternMatchContext = {
        userMessage: 'I feel overwhelmed and cant handle everything',
        topics: ['stress'],
        emotion: {
          primary: 'overwhelmed',
          intensity: 0.8,
          valence: 'negative',
        },
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      };

      const patterns = matchPersonaPatterns('ferni', mockPredictiveConfig, context);

      const overwhelmPattern = patterns.find((p) => p.name === 'overwhelm_pattern');
      expect(overwhelmPattern).toBeDefined();
      expect(overwhelmPattern?.patternType).toBe('emotional');
      expect(overwhelmPattern?.proactiveResponse).toBeDefined();
    });

    it('should match behavioral patterns', () => {
      const context: PatternMatchContext = {
        userMessage: 'Maybe later I\'ll deal with this, eventually someday',
        topics: ['procrastination'],
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      };

      const patterns = matchPersonaPatterns('ferni', mockPredictiveConfig, context);

      const avoidancePattern = patterns.find((p) => p.name === 'avoidance_pattern');
      expect(avoidancePattern).toBeDefined();
      expect(avoidancePattern?.insight).toContain('vulnerable');
    });

    it('should sort patterns by confidence', () => {
      const context: PatternMatchContext = {
        userMessage: 'I am overwhelmed and want to eventually reflect on my week',
        topics: ['stress', 'reflection'],
        emotion: { intensity: 0.9, valence: 'negative' },
        dayOfWeek: 0,
        hour: 10,
        sessionNumber: 5,
      };

      const patterns = matchPersonaPatterns('ferni', mockPredictiveConfig, context);

      // Should be sorted by confidence descending
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    });
  });

  // ==========================================================================
  // detectPersonaConcerns
  // ==========================================================================

  describe('detectPersonaConcerns', () => {
    it('should detect concerns from warning signs', () => {
      const context: PatternMatchContext = {
        userMessage: 'I\'ve been alone a lot lately, feeling isolated and withdrawn',
        topics: ['loneliness'],
        emotion: { intensity: 0.6, valence: 'negative' },
        dayOfWeek: 3,
        hour: 22,
        sessionNumber: 5,
      };

      const concerns = detectPersonaConcerns('ferni', mockPredictiveConfig, context);

      expect(concerns.length).toBeGreaterThan(0);
      const isolation = concerns.find((c) => c.concernId.includes('isolation'));
      expect(isolation).toBeDefined();
      expect(isolation?.severity).toBe('medium');
    });

    it('should detect high severity concerns', () => {
      const context: PatternMatchContext = {
        userMessage: 'I\'m exhausted and drained, nothing matters anymore, cant sleep',
        topics: ['burnout'],
        emotion: { intensity: 0.9, valence: 'negative' },
        dayOfWeek: 3,
        hour: 2, // Late night
        sessionNumber: 5,
      };

      const concerns = detectPersonaConcerns('ferni', mockPredictiveConfig, context);

      const burnout = concerns.find((c) => c.concernId.includes('burnout'));
      expect(burnout).toBeDefined();
      expect(burnout?.severity).toBe('high');
    });

    it('should sort concerns by severity (high first)', () => {
      const context: PatternMatchContext = {
        userMessage: 'I\'m alone, isolated, exhausted, drained and nothing matters',
        topics: ['burnout', 'loneliness'],
        emotion: { intensity: 0.9, valence: 'negative' },
        dayOfWeek: 3,
        hour: 2,
        sessionNumber: 5,
      };

      const concerns = detectPersonaConcerns('ferni', mockPredictiveConfig, context);

      if (concerns.length > 1) {
        // High severity should come first
        expect(concerns[0].severity).toBe('high');
      }
    });
  });

  // ==========================================================================
  // getPersonaFollowUps
  // ==========================================================================

  describe('getPersonaFollowUps', () => {
    it('should return empty before minimum sessions', () => {
      const context: PatternMatchContext = {
        userMessage: 'How are my goals going?',
        topics: ['goals'],
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 2, // Less than minSessionsForProactive (3)
      };

      const followUps = getPersonaFollowUps('ferni', mockPredictiveConfig, context);

      expect(followUps).toHaveLength(0);
    });

    it('should return relevant follow-ups after minimum sessions', () => {
      const context: PatternMatchContext = {
        userMessage: 'I\'ve been thinking about my goals',
        topics: ['goals'],
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      };

      const followUps = getPersonaFollowUps('ferni', mockPredictiveConfig, context);

      expect(followUps.length).toBeGreaterThan(0);
      const goalFollowUp = followUps.find((f) => f.id.includes('goal_check'));
      expect(goalFollowUp).toBeDefined();
    });

    it('should respect minSessionsToSurface for specific follow-ups', () => {
      const context: PatternMatchContext = {
        userMessage: 'How\'s my habit going?',
        topics: ['habits'],
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 4, // Less than habit_reminder's minSessionsToSurface (5)
      };

      const followUps = getPersonaFollowUps('ferni', mockPredictiveConfig, context);

      const habitFollowUp = followUps.find((f) => f.id.includes('habit_reminder'));
      expect(habitFollowUp).toBeUndefined();
    });
  });

  // ==========================================================================
  // getPersonaPatternSignal
  // ==========================================================================

  describe('getPersonaPatternSignal', () => {
    it('should return combined signal with patterns, concerns, and follow-ups', async () => {
      const context: PatternMatchContext = {
        userMessage: 'I\'m overwhelmed thinking about my goals on Sunday',
        topics: ['goals', 'stress'],
        emotion: { intensity: 0.8, valence: 'negative' },
        dayOfWeek: 0,
        hour: 10,
        sessionNumber: 5,
      };

      const signal = await getPersonaPatternSignal('ferni', context);

      expect(signal.patterns.length).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThan(0);
    });

    it('should return empty signal for unknown persona', async () => {
      (loadBundleById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const context: PatternMatchContext = {
        userMessage: 'Test message',
        topics: [],
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      };

      const signal = await getPersonaPatternSignal('unknown', context);

      expect(signal.patterns).toHaveLength(0);
      expect(signal.concerns).toHaveLength(0);
      expect(signal.followUps).toHaveLength(0);
      expect(signal.confidence).toBe(0);
    });
  });
});
