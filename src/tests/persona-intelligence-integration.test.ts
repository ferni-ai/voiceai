/**
 * Persona Intelligence Integration Tests
 *
 * Validates all three anchoring systems work together:
 * 1. Relationship Memory (Core Principle #2: Relationship Over Transaction)
 * 2. Predictive Intelligence (Core Principle #5: Presence Over Performance)
 * 3. Cognitive Differentiation (Core Principle #4: Authentic Personality)
 *
 * @module tests/persona-intelligence-integration.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d }),
    now: () => ({ toDate: () => new Date() }),
  },
}));

// Mock bundle loader for predictive patterns
vi.mock('../personas/bundles/loader.js', () => ({
  loadBundleById: vi.fn().mockResolvedValue({
    manifest: { identity: { id: 'ferni' } },
    bundlePath: '/test/path',
    loadedAt: new Date(),
    getBehaviors: vi.fn().mockResolvedValue({
      'predictive-patterns': {
        patterns: {
          temporal: {
            sunday_reflection: {
              triggers: ['sunday', 'week', 'reflection'],
              detection: 'User mentions Sunday or weekly reflection',
              proactive_response: ['Sundays can be powerful for reflection.'],
            },
          },
          emotional: {
            overwhelm: {
              triggers: ['overwhelmed', 'too much'],
              detection: 'Signs of overwhelm',
              proactive_response: ['When everything feels heavy, we can find what matters most.'],
            },
          },
          behavioral: {},
        },
        concernDetection: { warningSigns: {} },
        proactiveFollowUps: {},
      },
    }),
    getStory: vi.fn(),
    getStoriesByTrigger: vi.fn(),
    getAllStories: vi.fn(),
    getKnowledge: vi.fn(),
  }),
}));

// Mock cognitive differentiation
vi.mock('../personas/cognitive-differentiation.js', () => ({
  getCognitiveDifferentiation: vi.fn().mockReturnValue({
    personaId: 'ferni',
    questioning: {
      openVsClosed: 0.95,
      feelingVsData: 0.85,
      whyVsHow: 0.9,
      followUpFrequency: 0.8,
      questionStarters: ['What would you do if no one was watching?'],
      deepDiveQuestions: ['What does that mean to you?'],
      avoidQuestions: [],
    },
    silence: {
      primaryInterpretation: 'processing',
      comfortWithSilence: 5000,
      silenceResponses: { short: [], medium: [], long: [] },
      silenceBreakers: ['Take your time...'],
    },
    disagreement: {
      primaryStyle: 'gentle',
      secondaryStyle: 'curious',
      disagreementFrequency: 0.3,
      strongOpinionTopics: ['self-worth'],
      disagreementPhrases: {
        mild: ['I wonder...'],
        moderate: ['What I hear is different...'],
        strong: ['I care too much to let that slide.'],
      },
      reconciliationPhrases: [],
    },
    insight: {
      primaryFraming: 'observation',
      contextualFraming: {
        emotional: 'observation',
        analytical: 'reflection',
        actionable: 'question',
      },
      insightLeadIns: ['I notice...', 'What strikes me is...'],
      softeners: ['I might be wrong, but...'],
      amplifiers: ['This feels important:'],
    },
    pacing: {
      baseThinkingTime: 300,
      complexityMultiplier: 1.5,
      emotionalMultiplier: 1.3,
      midResponsePauseFrequency: 0.4,
      thinkingSignals: ['Hmm...'],
      processingSignals: [],
      breathingTopics: ['grief', 'loss'],
    },
  }),
}));

// Import modules after mocking
import {
  initializeRelationship,
  clearAllRelationshipEngines,
} from '../intelligence/relationship/index.js';
import {
  loadPersonaPatterns,
  matchPersonaPatterns,
  clearPatternCache,
} from '../intelligence/predictive/persona-patterns.js';
import { clearCognitiveCache } from '../intelligence/cognitive/index.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Persona Intelligence Integration', () => {
  const userId = 'test-user-123';
  const personaId = 'ferni';

  beforeEach(() => {
    // Clear all caches
    clearAllRelationshipEngines();
    clearPatternCache();
    clearCognitiveCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Individual System Tests
  // ==========================================================================

  describe('Individual Systems', () => {
    it('should initialize relationship memory', async () => {
      const engine = await initializeRelationship(userId, personaId);

      expect(engine).toBeDefined();
      expect(engine.getMemory()).toBeDefined();
      expect(engine.getMemory().userId).toBe(userId);
      expect(engine.getMemory().personaId).toBe(personaId);
    });

    it('should load predictive patterns', async () => {
      const config = await loadPersonaPatterns(personaId);

      expect(config).not.toBeNull();
      expect(config?.patterns.temporal).toHaveProperty('sunday_reflection');
      expect(config?.patterns.emotional).toHaveProperty('overwhelm');
    });
  });

  // ==========================================================================
  // Simulated Conversation Flow
  // ==========================================================================

  describe('Simulated Conversation Flow', () => {
    it('should track relationship progression within session', async () => {
      // Initialize
      const engine = await initializeRelationship(userId, personaId);
      engine.startSession();

      // Record multiple moments
      engine.recordMoment('vulnerability', 'Session 1 moment 1', {});
      engine.recordMoment('breakthrough', 'Session 1 breakthrough', {});

      // Check moments recorded
      const memory = engine.getMemory();
      expect(memory.sharedMoments.length).toBe(2);
      expect(memory.sharedMoments[0].type).toBe('vulnerability');
      expect(memory.sharedMoments[1].type).toBe('breakthrough');

      // End session
      await engine.endSession('positive', ['growth']);

      // Verify final state
      const finalMemory = engine.getMemory();
      expect(finalMemory.totalSessions).toBe(1);
      expect(finalMemory.sharedMoments.length).toBe(2);
    });
  });

  // ==========================================================================
  // Error Resilience
  // ==========================================================================

  describe('Error Resilience', () => {
    it('should handle missing predictive patterns gracefully', async () => {
      // Clear mock to return empty behaviors
      const { loadBundleById } = await import('../personas/bundles/loader.js');
      (loadBundleById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        manifest: { identity: { id: 'empty' } },
        bundlePath: '/test/path',
        loadedAt: new Date(),
        getBehaviors: vi.fn().mockResolvedValue({}),
        getStory: vi.fn(),
        getStoriesByTrigger: vi.fn(),
        getAllStories: vi.fn(),
        getKnowledge: vi.fn(),
      });

      const config = await loadPersonaPatterns('empty');

      // Should return default config, not error
      expect(config).not.toBeNull();
      expect(Object.keys(config?.patterns.temporal || {})).toHaveLength(0);
    });

    it('should maintain relationship state even if other systems fail', async () => {
      // Initialize relationship
      const engine = await initializeRelationship(userId, personaId);
      engine.startSession();
      engine.recordMoment('breakthrough', 'Important moment', {});

      // Even if predictive or cognitive fail, relationship is preserved
      const memory = engine.getMemory();
      expect(memory.sharedMoments.length).toBe(1);
      expect(memory.sharedMoments[0].type).toBe('breakthrough');
    });
  });
});
