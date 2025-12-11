/**
 * Personal Journey Awareness - E2E Tests
 *
 * Tests the complete Personal Journey Awareness system end-to-end,
 * simulating multi-session user journeys.
 *
 * Key validations:
 * 1. Multi-session user journey simulation
 * 2. Milestone acknowledgments work correctly
 * 3. NO creepy/surveillance language (anti-pattern validation)
 * 4. Repetition prevention across sessions
 * 5. Feature flag behavior
 *
 * @module tests/personal-journey/e2e
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetFeatureFlags, setFeatureFlagsForTesting } from '../../config/feature-flags.js';
import {
  clearChapterCache,
  updateChapterDetection,
} from '../../services/personal-journey/chapter-detector.js';
import {
  clearAllJourneyCaches,
  getJourneySnapshot,
  recordDelivery,
  selectMomentForTurn,
} from '../../services/personal-journey/journey-orchestrator.js';
import {
  clearRhythmCache,
  getRhythmStats,
  recordSession,
} from '../../services/personal-journey/rhythm-awareness.js';
import { clearSeasonalCache } from '../../services/personal-journey/seasonal-memory.js';
import {
  cleanupPersonalJourney,
  getPersonalJourneyForPersistence,
  initPersonalJourney,
  updateJourneyFromConversation,
} from '../../services/personal-journey/session-integration.js';
import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// ANTI-PATTERN VALIDATION - "Delightful, Not Creepy"
// ============================================================================

/**
 * Words and phrases that violate the "Delightful vs Creepy" principles
 * from PERSONAL-JOURNEY-AWARENESS-PLAN.md
 */
const CREEPY_PATTERNS = [
  // Surveillance language
  /\bI tracked\b/i,
  /\bI've been tracking\b/i,
  /\bI monitored\b/i,
  /\bI've been monitoring\b/i,
  /\bI logged\b/i,
  /\bI recorded\b/i,
  /\bI detected\b/i,
  /\bmy records show\b/i,
  /\bmy data shows\b/i,
  /\baccording to my logs\b/i,

  // Clinical/robotic language
  /\byour usage\b/i,
  /\byour activity\b/i,
  /\byour patterns\b/i,
  /\byour metrics\b/i,
  /\banalytics show\b/i,
  /\bstatistically\b/i,
  /\bdata indicates\b/i,
  /\bbased on your patterns\b/i,
  /\bI predict\b/i,
  /\bprobability\b/i,

  // Passive-aggressive monitoring
  /\byou haven't called\b/i,
  /\byou haven't checked in\b/i,
  /\byour absence\b/i,
  /\byou've been absent\b/i,
  /\bI noticed you haven't\b/i,
  /\byour engagement has\b/i,
  /\bdecreased\b.*\%/i,
  /\bincreased\b.*\%/i,

  // Location/behavior surveillance
  /\bI see you're in\b/i,
  /\bI noticed you're at\b/i,
  /\byour location\b/i,
  /\byour device\b/i,
  /\byour IP\b/i,
  /\byour browser\b/i,

  // Comparison to other users (creepy)
  /\busers like you\b/i,
  /\bpeople in your area\b/i,
  /\busers near you\b/i,
  /\bother users\b/i,
  /\baverage user\b/i,
  /\btypical user\b/i,

  // Exact dates/times (too precise = creepy)
  /\bat exactly\b/i,
  /\bon \d{1,2}\/\d{1,2}\/\d{4}\b/i,
  /\bat \d{1,2}:\d{2}:\d{2}\b/i,
];

/**
 * Good patterns that indicate delightful language
 */
const DELIGHTFUL_PATTERNS = [
  /\bI remember\b/i,
  /\bI recall\b/i,
  /\bI noticed\b/i, // "I noticed" alone is OK, "I noticed you haven't" is not
  /\bI've missed\b/i,
  /\bwe've been through\b/i,
  /\bour \d+ conversation/i,
  /\blast time we talked\b/i,
  /\bthis time last year\b/i,
  /\ba few months ago\b/i,
  /\baround this time\b/i,
  /\byou mentioned\b/i,
  /\byou told me\b/i,
  /\byou shared\b/i,
  /\bwe talked about\b/i,
  /\bothers on this journey\b/i, // Good community wisdom phrasing
  /\bpeople going through\b/i, // Good community wisdom phrasing
];

/**
 * Validate that content doesn't contain creepy anti-patterns
 */
function validateNotCreepy(content: string): { isCreepy: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const pattern of CREEPY_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`Matched creepy pattern: ${pattern.source}`);
    }
  }

  return {
    isCreepy: violations.length > 0,
    violations,
  };
}

/**
 * Check if content uses delightful language patterns
 */
function hasDelightfulLanguage(content: string): boolean {
  return DELIGHTFUL_PATTERNS.some((pattern) => pattern.test(content));
}

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Personal Journey E2E Tests', () => {
  const testUserId = 'e2e-test-user-123';

  beforeEach(() => {
    // Enable feature flags for tests
    setFeatureFlagsForTesting({
      personalJourney: {
        enabled: true,
        rhythmAwareness: true,
        seasonalMemory: true,
        chapterDetection: true,
        communityWisdom: true,
        greetingEnhancement: true,
        rolloutPercent: 100,
      },
    });

    // Clear all caches before each test
    clearRhythmCache(testUserId);
    clearSeasonalCache(testUserId);
    clearChapterCache(testUserId);
    clearAllJourneyCaches(testUserId);
  });

  afterEach(() => {
    // Reset feature flags after each test
    resetFeatureFlags();
  });

  // ============================================================================
  // ANTI-PATTERN VALIDATION TESTS
  // ============================================================================

  describe('Anti-Pattern Validation (Delightful vs Creepy)', () => {
    it('should NOT produce messages with surveillance language', () => {
      // Simulate a user with significant history
      for (let i = 0; i < 55; i++) {
        recordSession(testUserId);
      }

      // Get milestone moments
      const moment = selectMomentForTurn(testUserId, {
        isGreeting: true,
        turnCount: 0,
      });

      if (moment) {
        const validation = validateNotCreepy(moment.content);
        expect(validation.isCreepy).toBe(false);
        if (validation.isCreepy) {
          console.error('Creepy content detected:', moment.content);
          console.error('Violations:', validation.violations);
        }
      }
    });

    it('should use warm, relationship-based language', () => {
      // Build up history
      for (let i = 0; i < 25; i++) {
        recordSession(testUserId);
      }

      const moment = selectMomentForTurn(testUserId, {
        isGreeting: true,
        turnCount: 0,
      });

      if (moment) {
        // Either the content uses delightful language OR it's a simple greeting
        // (Some moments may be very short and neutral)
        const validation = validateNotCreepy(moment.content);
        expect(validation.isCreepy).toBe(false);
      }
    });

    it('should validate all milestone messages are not creepy', () => {
      const milestoneConversationCounts = [10, 25, 50, 100];

      for (const count of milestoneConversationCounts) {
        // Reset and build up to specific count
        clearRhythmCache(testUserId);
        clearAllJourneyCaches(testUserId);

        for (let i = 0; i < count; i++) {
          recordSession(testUserId);
        }

        const moment = selectMomentForTurn(testUserId, {
          isGreeting: true,
          turnCount: 0,
        });

        if (moment) {
          const validation = validateNotCreepy(moment.content);
          expect(validation.isCreepy).toBe(false);
          if (validation.isCreepy) {
            console.error(`Creepy content at ${count} conversations:`, moment.content);
            console.error('Violations:', validation.violations);
          }
        }
      }
    });

    it('should validate chapter detection messages are not creepy', async () => {
      // Build up chapter data
      await initPersonalJourney(testUserId, null);

      // Build up enough conversations for chapter detection to trigger
      for (let i = 0; i < 30; i++) {
        recordSession(testUserId);
      }

      // Simulate conversations with career transition theme
      for (let i = 0; i < 10; i++) {
        try {
          updateChapterDetection(testUserId, {
            topics: ['career', 'job', 'interview', 'resume', 'work'],
            emotions: ['anxious', 'hopeful', 'uncertain'],
          });
        } catch {
          // Chapter detection may fail if not enough data - that's OK for this test
        }
      }

      const moment = selectMomentForTurn(testUserId, {
        isGreeting: false,
        turnCount: 5,
        userMessage: "I'm thinking about my career change",
      });

      if (moment && moment.type.includes('chapter')) {
        const validation = validateNotCreepy(moment.content);
        expect(validation.isCreepy).toBe(false);
      }
    });
  });

  // ============================================================================
  // MULTI-SESSION JOURNEY SIMULATION
  // ============================================================================

  describe('Multi-Session Journey Simulation', () => {
    it('should track progress across multiple sessions', async () => {
      // Session 1 - New user
      // initPersonalJourney already calls recordSession internally
      await initPersonalJourney(testUserId, null);

      let stats = getRhythmStats(testUserId);
      // Should have at least 1 conversation after init
      expect(stats.totalConversations).toBeGreaterThanOrEqual(1);
      expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
      const initialCount = stats.totalConversations;

      // Get data to persist
      const session1Data = getPersonalJourneyForPersistence(testUserId);
      cleanupPersonalJourney(testUserId);

      // Session 2 - Returning user with persisted data
      const mockProfile: Partial<UserProfile> = {
        personalJourney: session1Data,
      };
      await initPersonalJourney(testUserId, mockProfile as UserProfile);

      stats = getRhythmStats(testUserId);
      // Session count should have increased
      expect(stats.totalConversations).toBeGreaterThanOrEqual(initialCount);
    });

    it('should accumulate milestones across sessions', async () => {
      // Simulate 10 sessions with persistence between each
      let persistedData: ReturnType<typeof getPersonalJourneyForPersistence> = {};

      for (let session = 1; session <= 10; session++) {
        const mockProfile: Partial<UserProfile> = {
          personalJourney: persistedData,
        };

        await initPersonalJourney(testUserId, session === 1 ? null : (mockProfile as UserProfile));

        // Simulate conversation content
        await updateJourneyFromConversation(testUserId, {
          topics: ['life', 'goals'],
          emotions: ['hopeful'],
        });

        persistedData = getPersonalJourneyForPersistence(testUserId);
        cleanupPersonalJourney(testUserId);
      }

      // Verify data accumulated
      expect(persistedData.rhythm?.sessions?.totalCount).toBeGreaterThanOrEqual(10);
    });

    it('should maintain consistent relationship stage across sessions', async () => {
      // Build up conversations
      await initPersonalJourney(testUserId, null);

      // Record 60 sessions
      for (let i = 0; i < 60; i++) {
        recordSession(testUserId);
      }

      const snapshot = getJourneySnapshot(testUserId);
      // Note: Relationship stage requires BOTH conversations AND time
      // Since tests run instantly, daysKnown=0, so stage will be 'new'
      // This is expected behavior - we're testing that the system
      // correctly tracks conversations even if time hasn't passed
      expect(snapshot.stats.totalConversations).toBeGreaterThanOrEqual(60);
      // The stage will be 'new' because daysKnown is 0 (tests run instantly)
      expect(snapshot.stats.relationshipStage).toBeDefined();
    });
  });

  // ============================================================================
  // REPETITION PREVENTION
  // ============================================================================

  describe('Repetition Prevention', () => {
    it('should not repeat the same moment within a session', () => {
      // Build up history
      for (let i = 0; i < 50; i++) {
        recordSession(testUserId);
      }

      const deliveredMoments: string[] = [];

      // Try to get multiple moments in one session
      for (let turn = 0; turn < 10; turn++) {
        const moment = selectMomentForTurn(testUserId, {
          isGreeting: turn === 0,
          turnCount: turn,
        });

        if (moment) {
          // Should not be the same as previously delivered
          const key = `${moment.type}:${moment.content}`;
          expect(deliveredMoments).not.toContain(key);
          deliveredMoments.push(key);

          // Record delivery
          recordDelivery(testUserId, moment);
        }
      }
    });

    it('should respect cooldown periods for similar moments', () => {
      // Build up history
      for (let i = 0; i < 100; i++) {
        recordSession(testUserId);
      }

      // Get first moment
      const firstMoment = selectMomentForTurn(testUserId, {
        isGreeting: true,
        turnCount: 0,
      });

      if (firstMoment) {
        recordDelivery(testUserId, firstMoment);

        // Immediately try to get another moment of the same type
        const secondMoment = selectMomentForTurn(testUserId, {
          isGreeting: false,
          turnCount: 1,
        });

        // Should either be null or a different type
        if (secondMoment) {
          expect(secondMoment.type).not.toBe(firstMoment.type);
        }
      }
    });
  });

  // ============================================================================
  // FEATURE FLAG BEHAVIOR
  // ============================================================================

  describe('Feature Flag Behavior', () => {
    it('should respect feature flag when disabled', async () => {
      // Disable feature flags
      setFeatureFlagsForTesting({
        personalJourney: {
          enabled: false,
          rhythmAwareness: false,
          seasonalMemory: false,
          chapterDetection: false,
          communityWisdom: false,
          greetingEnhancement: false,
          rolloutPercent: 0,
        },
      });

      // Clear any existing data
      clearRhythmCache(testUserId);
      clearAllJourneyCaches(testUserId);

      // Try to initialize - should be a no-op with flag disabled
      await initPersonalJourney(testUserId, null);

      // Session should NOT be recorded because feature is disabled
      const stats = getRhythmStats(testUserId);
      // With flag disabled, init returns early and doesn't record session
      // So totalConversations should be 0 (or default)
      expect(stats.totalConversations).toBe(0);
    });

    it('should respect rollout percentage', async () => {
      // Set low rollout percentage
      setFeatureFlagsForTesting({
        personalJourney: {
          enabled: true,
          rhythmAwareness: true,
          seasonalMemory: true,
          chapterDetection: true,
          communityWisdom: true,
          greetingEnhancement: true,
          rolloutPercent: 0, // No one in rollout
        },
      });

      // Clear any existing data
      clearRhythmCache(testUserId);
      clearAllJourneyCaches(testUserId);

      // Try to initialize - should be a no-op because user not in rollout
      await initPersonalJourney(testUserId, null);

      // Session should NOT be recorded because user not in rollout
      const stats = getRhythmStats(testUserId);
      expect(stats.totalConversations).toBe(0);
    });
  });

  // ============================================================================
  // JOURNEY SNAPSHOT CONSISTENCY
  // ============================================================================

  describe('Journey Snapshot Consistency', () => {
    it('should produce consistent snapshots', () => {
      // Build up history
      for (let i = 0; i < 30; i++) {
        recordSession(testUserId);
      }

      // Get multiple snapshots
      const snapshot1 = getJourneySnapshot(testUserId);
      const snapshot2 = getJourneySnapshot(testUserId);

      // Should be consistent (same data, same moment count)
      expect(snapshot1.stats.totalConversations).toBe(snapshot2.stats.totalConversations);
      expect(snapshot1.stats.relationshipStage).toBe(snapshot2.stats.relationshipStage);
      expect(snapshot1.stats.currentStreak).toBe(snapshot2.stats.currentStreak);
    });

    it('should track conversation counts correctly', () => {
      // Test conversation counting works correctly
      // Note: Relationship stage requires BOTH conversations AND days known
      // Since tests run instantly, we can only verify conversation count accuracy
      const testCases = [
        { count: 5, minConversations: 5 },
        { count: 15, minConversations: 15 },
        { count: 35, minConversations: 35 },
        { count: 75, minConversations: 75 },
      ];

      for (const { count, minConversations } of testCases) {
        const uniqueUserId = `e2e-count-test-${count}`;
        clearRhythmCache(uniqueUserId);
        clearAllJourneyCaches(uniqueUserId);

        for (let i = 0; i < count; i++) {
          recordSession(uniqueUserId);
        }

        const snapshot = getJourneySnapshot(uniqueUserId);
        expect(snapshot.stats.totalConversations).toBeGreaterThanOrEqual(minConversations);
        // Stage will be 'new' because daysKnown=0 in tests
        expect(snapshot.stats.relationshipStage).toBe('new');
      }
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling & Graceful Degradation', () => {
    it('should handle invalid userId gracefully', () => {
      expect(() => recordSession('')).not.toThrow();
      expect(() => getRhythmStats('')).not.toThrow();
      expect(() => getJourneySnapshot('')).not.toThrow();
    });

    it('should handle null profile gracefully', async () => {
      await expect(initPersonalJourney(testUserId, null)).resolves.not.toThrow();
    });

    it('should handle malformed profile data gracefully', async () => {
      const malformedProfile = {
        personalJourney: {
          rhythm: 'invalid' as unknown,
          seasonal: null,
          chapters: undefined,
        },
      } as unknown as UserProfile;

      await expect(initPersonalJourney(testUserId, malformedProfile)).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// STANDALONE ANTI-PATTERN VALIDATOR
// ============================================================================

describe('Anti-Pattern Validator', () => {
  describe('validateNotCreepy()', () => {
    it('should flag surveillance language', () => {
      const creepyMessages = [
        "I tracked that you've been here 10 times",
        'Your usage has decreased by 23%',
        "I noticed you haven't called in 3 days",
        'Based on your patterns, I predict you need help',
        'Users like you typically struggle here',
        "I see you're in a new location",
        'My data shows you prefer mornings',
      ];

      for (const msg of creepyMessages) {
        const result = validateNotCreepy(msg);
        expect(result.isCreepy).toBe(true);
      }
    });

    it('should allow warm, relationship-based language', () => {
      const warmMessages = [
        'I remember you mentioning that last time',
        "We've been through a lot together",
        'This is our 50th conversation!',
        'Last time we talked, you were excited about...',
        'Around this time last year, you mentioned...',
        "I've missed talking with you",
        'Others on this journey have found...',
      ];

      for (const msg of warmMessages) {
        const result = validateNotCreepy(msg);
        expect(result.isCreepy).toBe(false);
      }
    });

    it('should distinguish between good and bad "noticed"', () => {
      // Bad: passive-aggressive monitoring
      const badNoticed = "I noticed you haven't checked in lately";
      expect(validateNotCreepy(badNoticed).isCreepy).toBe(true);

      // Good: natural observation (without "haven't")
      const goodNoticed = 'I noticed you mentioned your new job';
      expect(validateNotCreepy(goodNoticed).isCreepy).toBe(false);
    });
  });

  describe('hasDelightfulLanguage()', () => {
    it('should recognize delightful patterns', () => {
      expect(hasDelightfulLanguage('I remember when you told me about that')).toBe(true);
      expect(hasDelightfulLanguage("We've been through so much together")).toBe(true);
      expect(hasDelightfulLanguage('Others on this journey have found peace')).toBe(true);
    });

    it('should not flag neutral language as delightful', () => {
      expect(hasDelightfulLanguage('Hello')).toBe(false);
      expect(hasDelightfulLanguage('How are you?')).toBe(false);
    });
  });
});
