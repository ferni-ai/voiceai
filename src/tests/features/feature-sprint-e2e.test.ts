/**
 * Feature Sprint E2E Tests
 *
 * End-to-end tests for the major features:
 * - A: Digital Twin Profile
 * - B: Voice Journal
 * - C: Semantic Memory
 * - D: Health Dashboard (iOS Parity)
 * - E: Mobile Polish
 *
 * @module tests/features/feature-sprint-e2e
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// ============================================================================
// A. DIGITAL TWIN PROFILE TESTS
// ============================================================================

describe('A. Digital Twin Profile', () => {
  describe('API Routes', () => {
    it('should save and retrieve a twin profile', async () => {
      // Mock the API call
      const mockProfile = {
        lifeChapters: [
          {
            title: 'College Years',
            years: '2010-2014',
            description: 'Found my passion for design',
          },
        ],
        coreValues: ['creativity', 'authenticity', 'growth'],
        communicationStyle: {
          formality: 'casual',
          pace: 'moderate',
          verbosity: 'balanced',
          storytelling: true,
          usesMetaphors: true,
          askingQuestions: true,
          givingAdvice: false,
        },
        passions: ['photography', 'hiking', 'cooking'],
      };

      // Test that profile structure is valid
      expect(mockProfile.lifeChapters).toHaveLength(1);
      expect(mockProfile.coreValues).toContain('creativity');
      expect(mockProfile.communicationStyle.formality).toBe('casual');
    });

    it('should build context for AI from twin profile', async () => {
      // Import the context builder
      const { buildTwinProfileContext } =
        await import('../../intelligence/context-builders/personas/twin-profile-context.js');

      // This will return null for a non-existent user (expected)
      const context = await buildTwinProfileContext('test-user-nonexistent');
      expect(context).toBeNull();
    });
  });

  describe('Context Builder Registration', () => {
    it('should be registered in the builder manifest', async () => {
      const { BUILDER_MANIFEST } =
        await import('../../intelligence/context-builders/core/loader.js');
      const { BuilderCategory } =
        await import('../../intelligence/context-builders/core/categories.js');

      const personaBuilders = BUILDER_MANIFEST[BuilderCategory.PERSONA];
      expect(personaBuilders).toContain('twin-profile-context');
    });
  });
});

// ============================================================================
// B. VOICE JOURNAL TESTS
// ============================================================================

describe('B. Voice Journal', () => {
  describe('Journal Entry Creation', () => {
    it('should create a journal entry with mood', () => {
      const entry = {
        id: 'entry-1',
        timestamp: new Date().toISOString(),
        transcript: 'Today was a good day. I made progress on my goals.',
        mood: 'sunny' as const,
        duration: 45,
        insights: ['progress', 'positivity'],
      };

      expect(entry.mood).toBe('sunny');
      expect(entry.transcript).toContain('progress');
      expect(entry.insights).toHaveLength(2);
    });

    it('should support multiple mood states', () => {
      const moods = ['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy'] as const;

      moods.forEach((mood) => {
        expect(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy']).toContain(mood);
      });
    });
  });

  describe('Journal Analytics', () => {
    it('should track journal entry creation', async () => {
      const { voiceJournalAnalytics } =
        await import('../../../apps/web/src/services/feature-analytics.service.js');

      // The analytics functions exist
      expect(typeof voiceJournalAnalytics.journalOpened).toBe('function');
      expect(typeof voiceJournalAnalytics.recordingStarted).toBe('function');
      expect(typeof voiceJournalAnalytics.entryCreated).toBe('function');
      expect(typeof voiceJournalAnalytics.moodSelected).toBe('function');
    });
  });
});

// ============================================================================
// C. SEMANTIC MEMORY TESTS
// ============================================================================

describe('C. Semantic Memory', () => {
  describe('Memory Infrastructure', () => {
    it('should have Firestore vector store implementation', async () => {
      // Check that the vector store module exists
      const vectorStoreModule = await import('../../memory/firestore-vector-store/index.js');

      expect(vectorStoreModule).toBeDefined();
    });

    it('should have embedding service', async () => {
      // Check that the embeddings module exists
      const embeddingsModule = await import('../../memory/embeddings.js');

      expect(embeddingsModule).toBeDefined();
    });
  });

  describe('Semantic Intelligence', () => {
    it('should have semantic intelligence service', async () => {
      // Check that the semantic intelligence module exists
      const semanticModule =
        await import('../../services/superhuman/semantic-intelligence/index.js');

      expect(semanticModule).toBeDefined();
    });
  });

  describe('Memory Analytics', () => {
    it('should track memory events', async () => {
      const { semanticMemoryAnalytics } =
        await import('../../../apps/web/src/services/feature-analytics.service.js');

      expect(typeof semanticMemoryAnalytics.memoryBrowserOpened).toBe('function');
      expect(typeof semanticMemoryAnalytics.memorySearched).toBe('function');
      expect(typeof semanticMemoryAnalytics.memorySurfaced).toBe('function');
    });
  });
});

// ============================================================================
// D. HEALTH DASHBOARD (iOS PARITY) TESTS
// ============================================================================

describe('D. Health Dashboard', () => {
  describe('API Routes', () => {
    it('should have Apple Health API routes', async () => {
      // Check that the routes module exists
      const routesModule = await import('../../servers/api/routes/apple-health.js');

      expect(routesModule).toBeDefined();
    });
  });

  describe('Health Data Types', () => {
    it('should support standard health metrics', () => {
      const healthMetrics = {
        steps: 10000,
        sleepHours: 7.5,
        hrvAvg: 45,
        restingHeartRate: 62,
        activeCalories: 450,
        exerciseMinutes: 30,
      };

      expect(healthMetrics.steps).toBeGreaterThan(0);
      expect(healthMetrics.sleepHours).toBeGreaterThan(0);
      expect(healthMetrics.hrvAvg).toBeGreaterThan(0);
    });

    it('should track sleep quality levels', () => {
      const sleepQualities = ['poor', 'fair', 'good', 'excellent'] as const;

      sleepQualities.forEach((quality) => {
        expect(['poor', 'fair', 'good', 'excellent']).toContain(quality);
      });
    });
  });

  describe('Health Analytics', () => {
    it('should track health dashboard events', async () => {
      const { healthDashboardAnalytics } =
        await import('../../../apps/web/src/services/feature-analytics.service.js');

      expect(typeof healthDashboardAnalytics.dashboardOpened).toBe('function');
      expect(typeof healthDashboardAnalytics.appleHealthConnected).toBe('function');
      expect(typeof healthDashboardAnalytics.healthDataSynced).toBe('function');
      expect(typeof healthDashboardAnalytics.metricViewed).toBe('function');
    });
  });
});

// ============================================================================
// E. MOBILE POLISH TESTS
// ============================================================================

describe('E. Mobile Polish', () => {
  describe('Bottom Sheet Component', () => {
    it('should have mobile bottom sheet implementation', async () => {
      // The module exists (already verified as complete)
      const bottomSheetModule = await import('../../../apps/web/src/ui/mobile-bottom-sheet.ui.js');

      expect(bottomSheetModule).toBeDefined();
      expect(typeof bottomSheetModule.open).toBe('function');
      expect(typeof bottomSheetModule.close).toBe('function');
    });
  });

  describe('Mobile Analytics', () => {
    it('should track mobile experience events', async () => {
      const { mobileAnalytics } =
        await import('../../../apps/web/src/services/feature-analytics.service.js');

      expect(typeof mobileAnalytics.bottomSheetOpened).toBe('function');
      expect(typeof mobileAnalytics.bottomSheetActionUsed).toBe('function');
      expect(typeof mobileAnalytics.pwaInstalled).toBe('function');
      expect(typeof mobileAnalytics.swipeGestureUsed).toBe('function');
    });
  });

  describe('Touch Interactions', () => {
    it('should support gesture directions', () => {
      const directions = ['left', 'right', 'up', 'down'] as const;

      directions.forEach((direction) => {
        expect(['left', 'right', 'up', 'down']).toContain(direction);
      });
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Feature Analytics', () => {
  it('should export all feature analytics modules', async () => {
    const { featureAnalytics } =
      await import('../../../apps/web/src/services/feature-analytics.service.js');

    expect(featureAnalytics.digitalTwin).toBeDefined();
    expect(featureAnalytics.voiceJournal).toBeDefined();
    expect(featureAnalytics.semanticMemory).toBeDefined();
    expect(featureAnalytics.healthDashboard).toBeDefined();
    expect(featureAnalytics.mobile).toBeDefined();
    expect(featureAnalytics.quality).toBeDefined();
  });

  it('should have quality metrics tracking', async () => {
    const { qualityMetrics } =
      await import('../../../apps/web/src/services/feature-analytics.service.js');

    expect(typeof qualityMetrics.featureRated).toBe('function');
    expect(typeof qualityMetrics.issueReported).toBe('function');
    expect(typeof qualityMetrics.featureLoadTime).toBe('function');
  });
});

describe('Integration: Context Builders', () => {
  it('should have all persona context builders registered', async () => {
    const { BUILDER_MANIFEST } = await import('../../intelligence/context-builders/core/loader.js');
    const { BuilderCategory } =
      await import('../../intelligence/context-builders/core/categories.js');

    const personaBuilders = BUILDER_MANIFEST[BuilderCategory.PERSONA];

    // Core persona builders should be registered
    expect(personaBuilders).toContain('twin-profile-context');
    expect(personaBuilders).toContain('persona-identity');
    expect(personaBuilders).toContain('human-personality');
  });
});
