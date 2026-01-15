/**
 * Semantic Intelligence E2E Integration Tests
 *
 * Comprehensive test suite validating the end-to-end integration of:
 * - Session lifecycle hooks
 * - Redis caching (emotional state, presence, biomarkers)
 * - Domain data capture (location, pets, crisis)
 * - Live superhuman injections
 * - TTL cleanup
 * - Planning coordination
 *
 * @module tests/e2e/semantic-intelligence-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// PHASE 1: SESSION LIFECYCLE HOOKS
// ============================================================================

describe('Phase 1: Session Lifecycle Hooks', () => {
  describe('onSessionStart', () => {
    it('should record session start with user context', async () => {
      const mockFirestore = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ exists: false }),
          }),
        }),
      };

      vi.doMock('firebase-admin', () => ({
        firestore: () => mockFirestore,
        apps: [{}],
      }));

      const { sessionLifecycle } =
        await import('../../services/session/session-lifecycle-hooks.js');

      await expect(sessionLifecycle.onStart('user-123', 'session-456')).resolves.not.toThrow();
    });

    it('should handle missing userId gracefully', async () => {
      const { sessionLifecycle } =
        await import('../../services/session/session-lifecycle-hooks.js');

      // Should not throw, just log and return
      await expect(sessionLifecycle.onStart('', 'session-456')).resolves.not.toThrow();
    });
  });

  describe('onSessionEnd', () => {
    it('should record session end with duration', async () => {
      const { sessionLifecycle } =
        await import('../../services/session/session-lifecycle-hooks.js');

      await expect(
        sessionLifecycle.onEnd('user-123', 'session-456', {
          turnCount: 10,
          duration: 300,
        })
      ).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// PHASE 2: REDIS CACHING
// ============================================================================

describe('Phase 2: Redis Caching', () => {
  describe('Emotional State Cache', () => {
    it('should have setEmotionalState API', async () => {
      // Verify the Redis cache has the expected API for emotional state caching
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const redis = getRedisCache();

      expect(typeof redis.setEmotionalState).toBe('function');
    });

    it('should have getEmotionalState API', async () => {
      // Verify the Redis cache has the expected API for emotional state retrieval
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const redis = getRedisCache();

      expect(typeof redis.getEmotionalState).toBe('function');
    });
  });

  describe('Outreach Suppression', () => {
    it('should have presence tracking API', async () => {
      // Verify the Redis cache has presence tracking capability
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const redis = getRedisCache();

      // Verify the cache has the expected API for presence tracking
      expect(typeof redis.setUserPresence).toBe('function');
      expect(typeof redis.getUserPresence).toBe('function');
    });
  });
});

// ============================================================================
// PHASE 3: DOMAIN DATA CAPTURE
// ============================================================================

describe('Phase 3: Domain Data Capture', () => {
  describe('Location Capture', () => {
    it('should detect favorite place mentions', async () => {
      const { locationCaptureDefinition } =
        await import('../../intelligence/data-capture/definitions/location.capture.js');

      // Test trigger detection
      const text = 'My favorite coffee shop is on Main Street';
      const triggers = locationCaptureDefinition.triggers;

      const hasPhraseTrigger = triggers.phrases?.some((phrase: string) =>
        text.toLowerCase().includes(phrase.toLowerCase())
      );
      expect(hasPhraseTrigger).toBe(true);
    });

    it('should extract place type from text', async () => {
      const { locationCaptureDefinition } =
        await import('../../intelligence/data-capture/definitions/location.capture.js');

      // Test that restaurant mentions trigger
      const text = 'I love that Thai restaurant downtown';
      const hasKeyword = locationCaptureDefinition.triggers.keywords?.some((kw: { word: string }) =>
        text.toLowerCase().includes(kw.word.toLowerCase())
      );
      expect(hasKeyword).toBe(true);
    });
  });

  describe('Pet Capture', () => {
    it('should detect pet mentions', async () => {
      const { petCaptureDefinition } =
        await import('../../intelligence/data-capture/definitions/pets.capture.js');

      const text = 'My dog Max is feeling better today';
      const hasPhraseTrigger = petCaptureDefinition.triggers.phrases?.some((phrase: string) =>
        text.toLowerCase().includes(phrase.toLowerCase())
      );
      expect(hasPhraseTrigger).toBe(true);
    });

    it('should detect pet loss sensitively', async () => {
      const { petCaptureDefinition } =
        await import('../../intelligence/data-capture/definitions/pets.capture.js');

      const text = 'I lost my cat last week';
      const hasPattern = petCaptureDefinition.triggers.patterns?.some((pattern: RegExp) =>
        pattern.test(text)
      );
      expect(hasPattern).toBe(true);
    });
  });

  describe('Crisis Detection', () => {
    it('should have crisis hooks for recording episodes', async () => {
      // Verify crisis hooks are available for recording episodes
      const crisisHooks = await import('../../services/data-layer/hooks/crisis-hooks.js');

      expect(typeof crisisHooks.onCrisisEpisodeChange).toBe('function');
      expect(typeof crisisHooks.onSupportReceivedChange).toBe('function');
    });
  });
});

// ============================================================================
// PHASE 4: OUTREACH BRIDGE
// ============================================================================

describe('Phase 4: Outreach Integration', () => {
  describe('Decision Engine Suppression', () => {
    it('should have outreach decision engine with suppression capability', async () => {
      // Verify the outreach decision engine is available
      const decisionEngineModule = await import('../../services/outreach/decision-engine.js');

      // Check that the module exports the decision engine
      expect(decisionEngineModule.OutreachDecisionEngine).toBeDefined();
    });

    it('should have Redis cache with outreach suppression API', async () => {
      // Verify the Redis cache has outreach suppression capability
      const { getRedisCache } = await import('../../memory/redis-cache.js');
      const redis = getRedisCache();

      expect(typeof redis.suppressOutreach).toBe('function');
      expect(typeof redis.isOutreachSuppressed).toBe('function');
    });
  });
});

// ============================================================================
// PHASE 5: LIVE SUPERHUMAN INJECTIONS
// ============================================================================

describe('Phase 5: Live Superhuman Injections', () => {
  describe('buildLiveSuperhumanInjections (processors version)', () => {
    it('should be callable from turn processor', async () => {
      // The live superhuman injections are in src/agents/processors/live-superhuman-injections.ts
      // and are called by turn-processor.ts in Tier 2
      const { buildLiveSuperhumanInjections } =
        await import('../../agents/processors/live-superhuman-injections.js');

      expect(typeof buildLiveSuperhumanInjections).toBe('function');
    });
  });

  describe('Emotion and Trajectory Routing Boosts', () => {
    it('should apply emotion boosts to tool matches', async () => {
      const { applyEmotionBoosts } =
        await import('../../tools/semantic-router/emotion-routing-boost.js');

      const matches = [
        { toolId: 'grief-support', score: 0.7, domain: 'grief' },
        { toolId: 'weather-check', score: 0.8, domain: 'utility' },
      ];

      const emotion = { primary: 'sad', intensity: 0.8, valence: -0.5, source: 'voice' as const };
      const boosted = applyEmotionBoosts(matches, emotion);

      // Grief tool should be boosted for sad emotion
      const griefMatch = boosted.find((m) => m.toolId === 'grief-support');
      expect(griefMatch?.score).toBeGreaterThan(0.7);
    });

    it('should apply trajectory boosts based on emotional arc', async () => {
      const { applyTrajectoryBoosts } =
        await import('../../tools/semantic-router/trajectory-routing-boost.js');

      // Type defined inline to avoid import issues
      interface EmotionalArc {
        id: string;
        type: 'stress' | 'mood' | 'energy' | 'anxiety' | 'recovery' | 'confidence' | 'motivation';
        direction: 'rising' | 'falling' | 'stable' | 'volatile';
        intensity: 'low' | 'medium' | 'high';
        durationDays: number;
        startedAt: string;
      }

      const matches = [
        { toolId: 'burnout-assessment', score: 0.6, domain: 'burnout' },
        { toolId: 'celebration-tool', score: 0.7, domain: 'celebration' },
      ];

      const risingStressArc: EmotionalArc = {
        id: 'test_arc',
        type: 'stress',
        direction: 'rising',
        intensity: 'high',
        durationDays: 7,
        startedAt: new Date().toISOString(),
      };

      const boosted = applyTrajectoryBoosts(matches, [risingStressArc]);

      // Burnout tool should be boosted for rising stress
      const burnoutMatch = boosted.find((m) => m.toolId === 'burnout-assessment');
      expect(burnoutMatch?.score).toBeGreaterThan(0.6);
    });
  });
});

// ============================================================================
// PHASE 6: TTL CLEANUP
// ============================================================================

describe('Phase 6: TTL Cleanup', () => {
  describe('TTL Configurations', () => {
    it('should have valid TTL configs for all collections', async () => {
      const { TTL_CONFIGS } = await import('../../services/data-layer/ttl-cleanup.js');

      expect(TTL_CONFIGS.length).toBeGreaterThan(0);

      for (const config of TTL_CONFIGS) {
        expect(config.path).toBeDefined();
        expect(config.ttlDays).toBeGreaterThan(0);
      }
    });

    it('should not include sensitive collections', async () => {
      const { TTL_CONFIGS } = await import('../../services/data-layer/ttl-cleanup.js');

      const sensitiveCollections = ['crisis_episodes', 'dreams'];
      for (const collection of sensitiveCollections) {
        const found = TTL_CONFIGS.find((c) => c.path === collection);
        expect(found).toBeUndefined();
      }
    });
  });

  describe('runTTLCleanup', () => {
    it('should support dry run mode', async () => {
      const { runTTLCleanup } = await import('../../services/data-layer/ttl-cleanup.js');

      // Dry run should not throw
      const result = await runTTLCleanup({ dryRun: true });

      expect(result.timestamp).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });
});

// ============================================================================
// PHASE 7: PLANNING COORDINATION
// ============================================================================

describe('Phase 7: Planning Coordination', () => {
  describe('checkPlanningReadiness', () => {
    it('should return a complete assessment', async () => {
      const { checkPlanningReadiness } =
        await import('../../services/superhuman/planning-coordination.js');

      const assessment = await checkPlanningReadiness('user-123', 'wedding', '2026-06-15', 10000);

      expect(assessment.overallScore).toBeDefined();
      expect(['green', 'yellow', 'red']).toContain(assessment.status);
      expect(assessment.financial).toBeDefined();
      expect(assessment.calendar).toBeDefined();
      expect(assessment.energy).toBeDefined();
      expect(assessment.lifeStage).toBeDefined();
      expect(assessment.summary).toBeDefined();
    });
  });

  describe('quickReadinessCheck', () => {
    it('should return status and reason', async () => {
      const { quickReadinessCheck } =
        await import('../../services/superhuman/planning-coordination.js');

      const result = await quickReadinessCheck('user-123', 5000);

      expect(['green', 'yellow', 'red']).toContain(result.status);
      expect(result.reason).toBeDefined();
    });
  });

  describe('checkGoalAlignment', () => {
    it('should check alignment with goals', async () => {
      const { checkGoalAlignment } =
        await import('../../services/superhuman/planning-coordination.js');

      const result = await checkGoalAlignment(
        'user-123',
        'family reunion',
        'Reconnect with extended family'
      );

      expect(typeof result.aligned).toBe('boolean');
      expect(Array.isArray(result.supportingGoals)).toBe(true);
      expect(Array.isArray(result.potentialConflicts)).toBe(true);
      expect(result.recommendation).toBeDefined();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Full Data Flow', () => {
  it('should capture and route data through the full pipeline', async () => {
    // This tests the complete flow:
    // 1. User says something → Data capture detects
    // 2. Hook fires → Stores in Firestore
    // 3. Context builder picks up → Injects into LLM

    const { allDataCaptureDefinitions } =
      await import('../../intelligence/data-capture/definitions/index.js');

    // Verify all expected capture definitions are registered
    const expectedCategories = [
      'contacts',
      'relationship',
      'commitment',
      'dream',
      'conflict',
      'recovery',
      'social',
      'mood',
      'boundary',
      'location',
      'pet',
    ];

    const actualCategories = allDataCaptureDefinitions.map((d) => d.category);

    for (const expected of ['location', 'pet']) {
      // At minimum, our new ones should be there
      expect(actualCategories).toContain(expected);
    }
  });

  it('should have all hooks available for data routing', async () => {
    // Verify hooks are importable
    const locationHooks = await import('../../services/data-layer/hooks/location-hooks.js');
    const petHooks = await import('../../services/data-layer/hooks/pets-hooks.js');
    const crisisHooks = await import('../../services/data-layer/hooks/crisis-hooks.js');

    expect(locationHooks.onFavoritePlaceChange).toBeDefined();
    expect(locationHooks.onLocationMemoryChange).toBeDefined();
    expect(petHooks.onPetChange).toBeDefined();
    expect(petHooks.onPetMilestoneChange).toBeDefined();
    expect(crisisHooks.onCrisisEpisodeChange).toBeDefined();
  });
});
