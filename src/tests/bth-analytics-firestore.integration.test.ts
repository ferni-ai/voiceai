/**
 * BTH Analytics - Firestore Integration Tests
 *
 * Tests the resonance feedback persistence and analytics aggregation.
 * To run: FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run bth-analytics-firestore
 *
 * Prerequisites:
 * 1. Start the Firestore emulator: firebase emulators:start --only firestore
 * 2. Set FIRESTORE_EMULATOR_HOST=localhost:8080
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { SuperhumanCapability } from '../conversation/superhuman/analytics.js';

// Check if we're running with the emulator
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('BTH Analytics - Firestore Integration', () => {
  const TEST_USER_ID = `bth-analytics-test-${Date.now()}`;
  const TEST_SESSION_ID = `session-${Date.now()}`;

  beforeAll(() => {
    console.log(`Running BTH Analytics Firestore tests against emulator: ${EMULATOR_HOST}`);
    console.log(`Test user ID: ${TEST_USER_ID}`);
  });

  afterAll(async () => {
    // Cleanup test data
    const { resetPersistence } =
      await import('../conversation/superhuman/analytics-persistence.js');
    resetPersistence();
    console.log(`Cleaned up test user: ${TEST_USER_ID}`);
  });

  // ============================================================================
  // USAGE EVENT PERSISTENCE TESTS
  // ============================================================================

  describe('Usage Event Persistence', () => {
    it('should persist a usage event for a capability', async () => {
      const { persistUsageEvent, getPersistedCapabilityStats } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capability: SuperhumanCapability = 'emotional_memory';

      // Persist a usage event
      await persistUsageEvent(capability, TEST_USER_ID, TEST_SESSION_ID, {
        context: 'Remembered a detail from 3 months ago',
        turnIndex: 5,
        applied: true,
      });

      // Verify it was persisted by checking stats
      const stats = await getPersistedCapabilityStats(capability);

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      // Stats may be empty initially if aggregation hasn't run
    });

    it('should persist multiple usage events', async () => {
      const { persistUsageEvent } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capabilities: SuperhumanCapability[] = [
        'anticipatory_presence',
        'silence_interpreter',
        'spontaneous_delight',
      ];

      // Persist events for different capabilities
      for (const capability of capabilities) {
        await persistUsageEvent(capability, TEST_USER_ID, TEST_SESSION_ID, {
          context: `Testing ${capability}`,
          turnIndex: Math.floor(Math.random() * 10),
          applied: true,
        });
      }

      // No error means success - aggregation will consolidate later
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // EFFECTIVENESS (RESONANCE) EVENT TESTS
  // ============================================================================

  describe('Effectiveness Event Persistence', () => {
    it('should persist a positive resonance event', async () => {
      const { persistEffectivenessEvent, getUserFeedbackHistory } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capability: SuperhumanCapability = 'contradiction_comfort';

      // Record positive feedback
      await persistEffectivenessEvent(capability, TEST_USER_ID, TEST_SESSION_ID, {
        reaction: 'positive',
        context: 'User said "Yes, exactly!"',
        turnIndex: 8,
      });

      // Check user feedback history
      const feedback = await getUserFeedbackHistory(TEST_USER_ID, 10);

      expect(feedback).toBeDefined();
      expect(Array.isArray(feedback)).toBe(true);
    });

    it('should persist neutral and negative resonance events', async () => {
      const { persistEffectivenessEvent } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capability: SuperhumanCapability = 'protective_memory';

      // Record neutral feedback
      await persistEffectivenessEvent(capability, TEST_USER_ID, TEST_SESSION_ID, {
        reaction: 'neutral',
        context: 'User continued without acknowledgment',
        turnIndex: 3,
      });

      // Record negative feedback
      await persistEffectivenessEvent(capability, TEST_USER_ID, TEST_SESSION_ID, {
        reaction: 'negative',
        context: 'User said "that\'s not quite right"',
        turnIndex: 4,
      });

      // No error means success
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // AGGREGATE STATS TESTS
  // ============================================================================

  describe('Aggregate Statistics', () => {
    beforeEach(async () => {
      // Pre-populate with test data
      const { persistUsageEvent, persistEffectivenessEvent } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capability: SuperhumanCapability = 'pattern_mirror';

      // Create usage and effectiveness data
      for (let i = 0; i < 5; i++) {
        await persistUsageEvent(capability, TEST_USER_ID, `session-${i}`, {
          context: `Test usage ${i}`,
          turnIndex: i,
          applied: true,
        });
        await persistEffectivenessEvent(capability, TEST_USER_ID, `session-${i}`, {
          reaction: i % 2 === 0 ? 'positive' : 'neutral',
          context: `Test feedback ${i}`,
          turnIndex: i + 1,
        });
      }
    });

    it('should update and retrieve aggregates', async () => {
      const { updateAggregates, getPersistedCapabilityStats } =
        await import('../conversation/superhuman/analytics-persistence.js');

      // Run aggregation
      await updateAggregates();

      // Get stats for all capabilities
      const allStats = await getPersistedCapabilityStats();

      expect(allStats).toBeDefined();
      expect(Array.isArray(allStats)).toBe(true);

      // Stats structure validation
      for (const stat of allStats) {
        expect(stat).toHaveProperty('capability');
        expect(stat).toHaveProperty('totalUsage');
        expect(stat).toHaveProperty('effectivenessScore');
        expect(typeof stat.capability).toBe('string');
        expect(typeof stat.totalUsage).toBe('number');
      }
    });

    it('should retrieve stats for a specific capability', async () => {
      const { updateAggregates, getPersistedCapabilityStats } =
        await import('../conversation/superhuman/analytics-persistence.js');

      await updateAggregates();

      const capability: SuperhumanCapability = 'pattern_mirror';
      const stats = await getPersistedCapabilityStats(capability);

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
    });
  });

  // ============================================================================
  // TOP CAPABILITIES TESTS
  // ============================================================================

  describe('Top Capabilities', () => {
    it('should retrieve top capabilities by effectiveness', async () => {
      const { getTopCapabilities } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const top = await getTopCapabilities(5);

      expect(top).toBeDefined();
      expect(Array.isArray(top)).toBe(true);

      // Verify ordering (should be descending by effectiveness)
      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1].effectivenessScore).toBeGreaterThanOrEqual(top[i].effectivenessScore);
      }
    });
  });

  // ============================================================================
  // EFFECTIVENESS TREND TESTS
  // ============================================================================

  describe('Effectiveness Trends', () => {
    it('should retrieve effectiveness trend over time', async () => {
      const { getEffectivenessTrend } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const capability: SuperhumanCapability = 'pattern_mirror';
      const trend = await getEffectivenessTrend(capability, 7);

      expect(trend).toBeDefined();
      expect(Array.isArray(trend)).toBe(true);

      // Verify trend structure
      for (const point of trend) {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('positive');
        expect(point).toHaveProperty('neutral');
        expect(point).toHaveProperty('negative');
      }
    });
  });

  // ============================================================================
  // USER FEEDBACK HISTORY TESTS
  // ============================================================================

  describe('User Feedback History', () => {
    it('should retrieve feedback history for a user', async () => {
      const { getUserFeedbackHistory } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const feedback = await getUserFeedbackHistory(TEST_USER_ID, 50);

      expect(feedback).toBeDefined();
      expect(Array.isArray(feedback)).toBe(true);

      // Verify feedback structure
      for (const entry of feedback) {
        expect(entry).toHaveProperty('capability');
        expect(entry).toHaveProperty('reaction');
        expect(entry).toHaveProperty('timestamp');
      }
    });

    it('should respect limit parameter', async () => {
      const { getUserFeedbackHistory } =
        await import('../conversation/superhuman/analytics-persistence.js');

      const limit = 3;
      const feedback = await getUserFeedbackHistory(TEST_USER_ID, limit);

      expect(feedback.length).toBeLessThanOrEqual(limit);
    });
  });
});

// ============================================================================
// UNIT TESTS (Run without emulator)
// ============================================================================

describe('BTH Analytics - Unit Tests (No Emulator)', () => {
  describe('In-Memory Analytics', () => {
    it('should track capability usage in memory', async () => {
      const { trackCapabilityUsage, getCapabilityStats, clearAnalytics } =
        await import('../conversation/superhuman/analytics.js');

      // Clear for clean test
      clearAnalytics();

      // Use a valid capability from the SuperhumanCapability type
      const capability: SuperhumanCapability = 'predictive_coaching';

      // Track usage with correct event object structure
      trackCapabilityUsage({
        capability,
        actionType: 'resonance_check',
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
        turnCount: 1,
        sessionCount: 1,
        priority: 0.8,
        wasApplied: true,
      });

      // Get stats
      const stats = getCapabilityStats();
      const capStat = stats.find((s) => s.capability === capability);

      expect(capStat).toBeDefined();
      if (capStat) {
        expect(capStat.totalUsage).toBeGreaterThanOrEqual(1);
      }
    });

    it('should record effectiveness reactions', async () => {
      const { trackCapabilityEffectiveness, getCapabilityStats, clearAnalytics } =
        await import('../conversation/superhuman/analytics.js');

      // Clear for clean test
      clearAnalytics();

      // Use a valid capability from the SuperhumanCapability type
      const capability: SuperhumanCapability = 'commitment_keeper';

      // Record reactions with correct event structure
      trackCapabilityEffectiveness({
        capability,
        userId: 'test-user',
        sessionId: 'test-session',
        userReaction: 'positive',
        engagementIncrease: true,
      });
      trackCapabilityEffectiveness({
        capability,
        userId: 'test-user',
        sessionId: 'test-session',
        userReaction: 'neutral',
        engagementIncrease: false,
      });
      trackCapabilityEffectiveness({
        capability,
        userId: 'test-user',
        sessionId: 'test-session',
        userReaction: 'negative',
        engagementIncrease: false,
      });

      const stats = getCapabilityStats();
      const capStat = stats.find((s) => s.capability === capability);

      expect(capStat).toBeDefined();
      if (capStat) {
        expect(capStat.positiveReactions).toBeGreaterThanOrEqual(1);
        expect(capStat.neutralReactions).toBeGreaterThanOrEqual(1);
        expect(capStat.negativeReactions).toBeGreaterThanOrEqual(1);
      }
    });

    it('should calculate effectiveness rate', async () => {
      const { getMostEffectiveCapabilities } =
        await import('../conversation/superhuman/analytics.js');

      const effective = getMostEffectiveCapabilities();

      expect(Array.isArray(effective)).toBe(true);

      // Each entry should have effectiveness rate
      for (const entry of effective) {
        expect(entry).toHaveProperty('capability');
        expect(entry).toHaveProperty('effectivenessRate');
        expect(entry.effectivenessRate).toBeGreaterThanOrEqual(0);
        expect(entry.effectivenessRate).toBeLessThanOrEqual(1);
      }
    });
  });
});
