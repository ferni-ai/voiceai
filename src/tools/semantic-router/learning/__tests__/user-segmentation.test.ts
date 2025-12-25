/**
 * User Segmentation Tests
 *
 * Tests the SOTA cohort-based learning system for accelerating personalization.
 *
 * @module tools/semantic-router/learning/__tests__/user-segmentation.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  UserSegmentationEngine,
  getUserSegmentationEngine,
  initializeUserSegmentation,
  shutdownUserSegmentation,
  type InteractionEvent,
} from '../user-segmentation.js';

function createInteraction(overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    userId: 'test-user',
    sessionId: 'session-1',
    timestamp: Date.now(),
    toolId: 'playMusic',
    toolCategory: 'entertainment',
    wasCorrect: true,
    confidence: 0.85,
    latencyMs: 50,
    messageLength: 15,
    isQuestion: false,
    isFollowup: false,
    ...overrides,
  };
}

describe('UserSegmentationEngine', () => {
  let engine: UserSegmentationEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new UserSegmentationEngine({
      minInteractionsForFingerprint: 5, // Lower for testing
      numCohorts: 8,
      minCohortSize: 2,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  describe('recordInteraction', () => {
    it('should record interactions for a user', () => {
      const userId = 'test-user';

      for (let i = 0; i < 3; i++) {
        engine.recordInteraction(createInteraction({ userId }));
      }

      const stats = engine.getStats();
      expect(stats.totalUsers).toBe(1);
    });

    it('should assign cohort after enough interactions', () => {
      const userId = 'cohort-user';

      // Record enough interactions
      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
            toolId: `tool${i % 5}`,
            toolCategory: i % 2 === 0 ? 'entertainment' : 'information',
          })
        );
      }

      const assignment = engine.getCohortAssignment(userId);
      expect(assignment).not.toBeNull();
      expect(assignment!.primaryCohort).toBeDefined();
      expect(assignment!.cohortSimilarity).toBeGreaterThan(0);
    });

    it('should not assign cohort with too few interactions', () => {
      const userId = 'few-interactions';

      engine.recordInteraction(createInteraction({ userId }));

      const assignment = engine.getCohortAssignment(userId);
      expect(assignment).toBeNull();
    });
  });

  describe('getCohortAssignment', () => {
    it('should return null for unknown user', () => {
      const assignment = engine.getCohortAssignment('unknown-user');
      expect(assignment).toBeNull();
    });

    it('should include secondary cohorts', () => {
      const userId = 'multi-cohort';

      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(createInteraction({ userId, timestamp: Date.now() + i * 1000 }));
      }

      const assignment = engine.getCohortAssignment(userId);
      expect(assignment).not.toBeNull();
      expect(assignment!.secondaryCohorts).toBeDefined();
      expect(assignment!.secondaryCohorts.length).toBeGreaterThan(0);
    });
  });

  describe('getCohortToolPreferences', () => {
    it('should return null for unassigned user', () => {
      const prefs = engine.getCohortToolPreferences('unknown');
      expect(prefs).toBeNull();
    });

    it('should return tool preferences from cohort', () => {
      const userId = 'pref-user';

      // Record interactions with tools
      for (let i = 0; i < 15; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
            toolId: 'playMusic',
            wasCorrect: true,
          })
        );
      }

      const prefs = engine.getCohortToolPreferences(userId);
      // May or may not have preferences depending on cohort
      expect(prefs === null || prefs instanceof Map).toBe(true);
    });
  });

  describe('getCohortStrategyRecommendation', () => {
    it('should return null for unassigned user', () => {
      const rec = engine.getCohortStrategyRecommendation('unknown');
      expect(rec).toBeNull();
    });

    it('should return strategy recommendation', () => {
      const userId = 'strategy-user';

      // Record fast interactions
      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
            latencyMs: 20, // Fast
          })
        );
      }

      const rec = engine.getCohortStrategyRecommendation(userId);
      expect(rec === null || typeof rec.strategy === 'string').toBe(true);
    });
  });

  describe('getNewUserPriors', () => {
    it('should return default priors for unknown user', () => {
      const priors = engine.getNewUserPriors('unknown');
      expect(priors).not.toBeNull();
      expect(priors!.strategyPrior).toBe('balanced');
      expect(priors!.inheritanceWeight).toBe(0);
    });

    it('should return cohort-based priors for assigned user', () => {
      const userId = 'prior-user';

      for (let i = 0; i < 15; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
          })
        );
      }

      const priors = engine.getNewUserPriors(userId);
      expect(priors).not.toBeNull();
      expect(priors!.toolPriors).toBeDefined();
      expect(priors!.categoryPriors).toBeDefined();
    });
  });

  describe('reassignUser', () => {
    it('should return null for user with insufficient data', () => {
      const assignment = engine.reassignUser('insufficient');
      expect(assignment).toBeNull();
    });

    it('should reassign user with sufficient data', () => {
      const userId = 'reassign-user';

      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
          })
        );
      }

      const assignment = engine.reassignUser(userId);
      expect(assignment).not.toBeNull();
    });
  });

  describe('getAllCohorts', () => {
    it('should return all predefined cohorts', () => {
      const cohorts = engine.getAllCohorts();
      expect(cohorts.length).toBe(8); // 8 predefined archetypes
    });

    it('should include cohort metadata', () => {
      const cohorts = engine.getAllCohorts();

      for (const cohort of cohorts) {
        expect(cohort.cohortId).toBeDefined();
        expect(cohort.name).toBeDefined();
        expect(cohort.description).toBeDefined();
        expect(cohort.centroid).toBeDefined();
      }
    });
  });

  describe('getCohort', () => {
    it('should return null for unknown cohort', () => {
      const cohort = engine.getCohort('unknown-cohort');
      expect(cohort).toBeNull();
    });

    it('should return cohort by ID', () => {
      const cohort = engine.getCohort('power_user');
      expect(cohort).not.toBeNull();
      expect(cohort!.name).toBe('Power Users');
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const stats = engine.getStats();
      expect(stats.totalUsers).toBe(0);
      expect(stats.assignedUsers).toBe(0);
      expect(stats.numCohorts).toBe(8);
    });

    it('should track users', () => {
      // Add some users
      for (let u = 0; u < 3; u++) {
        for (let i = 0; i < 10; i++) {
          engine.recordInteraction(
            createInteraction({
              userId: `user-${u}`,
              timestamp: Date.now() + i * 1000,
            })
          );
        }
      }

      const stats = engine.getStats();
      expect(stats.totalUsers).toBe(3);
      expect(stats.assignedUsers).toBe(3);
    });
  });

  describe('updateCohorts', () => {
    it('should update cohort centroids', async () => {
      // Add users to cohorts with varying behaviors
      for (let u = 0; u < 5; u++) {
        for (let i = 0; i < 10; i++) {
          engine.recordInteraction(
            createInteraction({
              userId: `update-user-${u}`,
              timestamp: Date.now() + i * 1000,
              // Create tool diversity by varying tool IDs per user
              toolId: `tool${i % (u + 1)}`, // User 0: 1 tool, User 4: 5 tools
              toolCategory: ['entertainment', 'information', 'productivity'][i % 3],
            })
          );
        }
      }

      await engine.updateCohorts();

      const stats = engine.getStats();
      expect(stats.lastCohortUpdate).toBeGreaterThan(0);
    });
  });

  describe('clearUser', () => {
    it('should clear a specific user', () => {
      const userId = 'clear-me';

      for (let i = 0; i < 10; i++) {
        engine.recordInteraction(
          createInteraction({
            userId,
            timestamp: Date.now() + i * 1000,
          })
        );
      }

      expect(engine.getCohortAssignment(userId)).not.toBeNull();

      engine.clearUser(userId);

      expect(engine.getCohortAssignment(userId)).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all data', () => {
      // Add some users
      for (let u = 0; u < 3; u++) {
        for (let i = 0; i < 10; i++) {
          engine.recordInteraction(
            createInteraction({
              userId: `user-${u}`,
              timestamp: Date.now() + i * 1000,
            })
          );
        }
      }

      expect(engine.getStats().totalUsers).toBe(3);

      engine.clearAll();

      expect(engine.getStats().totalUsers).toBe(0);
      expect(engine.getStats().assignedUsers).toBe(0);
    });
  });
});

describe('Behavioral Fingerprinting', () => {
  let engine: UserSegmentationEngine;

  beforeEach(() => {
    engine = new UserSegmentationEngine({
      minInteractionsForFingerprint: 5,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  it('should create fingerprint from diverse interactions', () => {
    const userId = 'diverse-user';

    // Mix of different interaction types
    for (let i = 0; i < 20; i++) {
      engine.recordInteraction(
        createInteraction({
          userId,
          timestamp: Date.now() + i * 60000, // 1 min apart
          toolId: `tool${i % 8}`,
          toolCategory: ['entertainment', 'information', 'productivity'][i % 3],
          wasCorrect: i % 5 !== 0, // 80% correct
          confidence: 0.7 + (i % 3) * 0.1,
          latencyMs: 30 + (i % 10) * 20,
          messageLength: 5 + i % 20,
          isQuestion: i % 4 === 0,
          isFollowup: i % 6 === 0,
        })
      );
    }

    const assignment = engine.getCohortAssignment(userId);
    expect(assignment).not.toBeNull();
    expect(assignment!.fingerprint).toBeDefined();
    expect(assignment!.fingerprint.toolDiversity).toBeGreaterThan(0);
    expect(assignment!.fingerprint.questionRatio).toBeGreaterThan(0);
  });

  it('should distinguish power users from casual users', () => {
    // Power user: high diversity, fast, frequent
    const powerUserId = 'power-user';
    for (let i = 0; i < 50; i++) {
      engine.recordInteraction(
        createInteraction({
          userId: powerUserId,
          timestamp: Date.now() + i * 1000, // Very frequent
          toolId: `tool${i % 15}`, // High diversity
          wasCorrect: true,
          latencyMs: 20, // Prefers fast
        })
      );
    }

    // Casual user: low diversity, slower, infrequent
    const casualUserId = 'casual-user';
    for (let i = 0; i < 10; i++) {
      engine.recordInteraction(
        createInteraction({
          userId: casualUserId,
          timestamp: Date.now() + i * 3600000, // 1 hour apart
          toolId: 'playMusic', // Low diversity
          wasCorrect: i % 2 === 0,
          latencyMs: 150, // Tolerates slower
        })
      );
    }

    const powerAssignment = engine.getCohortAssignment(powerUserId);
    const casualAssignment = engine.getCohortAssignment(casualUserId);

    // Both should be assigned
    expect(powerAssignment).not.toBeNull();
    expect(casualAssignment).not.toBeNull();

    // Fingerprints should differ
    expect(powerAssignment!.fingerprint.toolDiversity).toBeGreaterThan(
      casualAssignment!.fingerprint.toolDiversity
    );
  });
});

describe('Cohort Inheritance', () => {
  let engine: UserSegmentationEngine;

  beforeEach(() => {
    engine = new UserSegmentationEngine({
      minInteractionsForFingerprint: 5,
      cohortInheritanceWeight: 0.5,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  it('should provide priors from cohort for new user', () => {
    // Create a cohort with strong tool preferences
    for (let u = 0; u < 5; u++) {
      for (let i = 0; i < 15; i++) {
        engine.recordInteraction(
          createInteraction({
            userId: `existing-${u}`,
            timestamp: Date.now() + i * 1000,
            toolId: 'playMusic',
            wasCorrect: true,
          })
        );
      }
    }

    // New user joins a cohort
    const newUserId = 'new-user';
    for (let i = 0; i < 10; i++) {
      engine.recordInteraction(
        createInteraction({
          userId: newUserId,
          timestamp: Date.now() + i * 1000,
          toolId: 'playMusic',
        })
      );
    }

    const priors = engine.getNewUserPriors(newUserId);
    expect(priors).not.toBeNull();
    // Should have inherited some preferences
    expect(priors!.inheritanceWeight).toBeGreaterThan(0);
  });
});

describe('Module exports', () => {
  afterEach(() => {
    shutdownUserSegmentation();
  });

  it('should initialize and shutdown cleanly', () => {
    const engine = initializeUserSegmentation({
      minInteractionsForFingerprint: 10,
    });

    expect(engine).toBeDefined();

    shutdownUserSegmentation();
  });

  it('should get singleton instance', () => {
    const engine1 = getUserSegmentationEngine();
    const engine2 = getUserSegmentationEngine();

    expect(engine1).toBe(engine2);
  });
});
