/**
 * Persona Pattern Integration Tests
 *
 * Tests the connection between persona bundles and predictive intelligence.
 *
 * @module intelligence/predictive/__tests__/persona-patterns.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PersonaPredictiveConfig } from '../persona-patterns.js';

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
        proactiveResponse: [
          'Sundays can be a powerful time for reflection. What are you noticing?',
        ],
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
        proactiveResponse: ['When everything feels heavy, we can find what matters most together.'],
        valenceMatch: 'negative',
        intensityThreshold: 0.7,
      },
      joy_celebration: {
        triggers: ['happy', 'excited', 'wonderful', 'amazing'],
        detection: 'User expresses joy or excitement',
        proactiveResponse: ['That spark of joy is worth savoring. What made this moment special?'],
        valenceMatch: 'positive',
      },
    },
    behavioral: {
      avoidance_pattern: {
        triggers: ['later', 'eventually', 'someday', 'not now'],
        detection: 'User shows avoidance behavior',
        insight: 'Avoidance often protects something vulnerable',
        proactiveResponse: [
          "I notice we keep circling back. No pressure, but I'm curious what's there.",
        ],
      },
      progress_seeking: {
        triggers: ['goal', 'progress', 'achieving', 'next step'],
        detection: 'User focused on progress and goals',
        proactiveResponse: [
          'Your drive is inspiring. What would make this next step feel meaningful?',
        ],
      },
    },
  },
  concernDetection: {
    warningSigns: {
      isolation: {
        detection: 'Signs of social withdrawal',
        response: [
          "It sounds like you've been spending time alone lately. How are you feeling about that?",
        ],
        severity: 'medium',
        warningSigns: ['alone', 'nobody', 'isolated', 'withdrawn'],
      },
      burnout: {
        detection: 'Signs of burnout',
        response: [
          "I'm noticing some signs of exhaustion. Your wellbeing matters - can we explore what's draining you?",
        ],
        severity: 'high',
        warningSigns: ['exhausted', 'drained', 'burnt out', 'cant sleep', 'nothing matters'],
      },
    },
  },
  proactiveFollowUps: {
    goal_check: {
      timing: 'end of session',
      phrases: ['How are you feeling about your goals?', 'Any progress on what we discussed?'],
      minSessionsToSurface: 3,
    },
    habit_reminder: {
      timing: 'when relevant',
      phrases: ["How's that new habit going?", 'Have you been keeping up with your practice?'],
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
});
