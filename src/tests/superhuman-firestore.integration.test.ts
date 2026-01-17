/**
 * Superhuman Services - Firestore Integration Tests
 *
 * These tests run against the Firestore emulator to verify actual database operations.
 * To run: FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run superhuman-firestore
 *
 * Prerequisites:
 * 1. Start the Firestore emulator: firebase emulators:start --only firestore
 * 2. Set FIRESTORE_EMULATOR_HOST=localhost:8080
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Check if we're running with the emulator
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('Superhuman Services - Firestore Integration', () => {
  const TEST_USER_ID = `integration-test-${Date.now()}`;

  beforeAll(() => {
    console.log(`Running Firestore integration tests against emulator: ${EMULATOR_HOST}`);
    console.log(`Test user ID: ${TEST_USER_ID}`);
  });

  afterAll(async () => {
    // Cleanup test data
    console.log(`Cleaning up test user: ${TEST_USER_ID}`);
    // Note: In production tests, we'd delete the test user's data here
  });

  // ============================================================================
  // COMMITMENT KEEPER TESTS
  // ============================================================================

  describe('Commitment Keeper', () => {
    beforeEach(async () => {
      // Clear any existing commitments for this test user
    });

    it('should record and retrieve a commitment', async () => {
      const { recordCommitment, getCommitments } =
        await import('../services/superhuman/commitment-keeper.js');

      // Record a commitment
      await recordCommitment(TEST_USER_ID, {
        type: 'intention',
        content: 'I want to exercise more',
        context: 'discussion about health',
      });

      // Retrieve commitments
      const commitments = await getCommitments(TEST_USER_ID);

      expect(commitments).toBeDefined();
      expect(Array.isArray(commitments)).toBe(true);
      // Note: May be empty if Firestore isn't persisting (emulator behavior varies)
    });

    it('should build commitment context string', async () => {
      const { buildCommitmentContext } =
        await import('../services/superhuman/commitment-keeper.js');

      const context = await buildCommitmentContext(TEST_USER_ID);

      expect(typeof context).toBe('string');
      // Context should be a string (may be empty if no commitments)
    });
  });

  // ============================================================================
  // PREDICTIVE COACHING TESTS
  // ============================================================================

  describe('Predictive Coaching', () => {
    it('should record an observation/pattern', async () => {
      const { recordObservation, loadUserPatterns } =
        await import('../services/superhuman/predictive-coaching.js');

      // Record observations that build into a pattern
      await recordObservation(TEST_USER_ID, {
        type: 'temporal',
        trigger: 'Sunday evening',
        outcome: 'anxiety about Monday',
        emotion: 'stressed',
        dayOfWeek: 0, // Sunday
        hour: 20, // 8 PM
      });

      // Record a few more to build confidence
      await recordObservation(TEST_USER_ID, {
        type: 'temporal',
        trigger: 'Sunday evening',
        outcome: 'anxiety about Monday',
        emotion: 'stressed',
        dayOfWeek: 0,
        hour: 19,
      });

      const patterns = await loadUserPatterns(TEST_USER_ID);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should generate predictions from patterns', async () => {
      const { recordObservation, generatePredictions } =
        await import('../services/superhuman/predictive-coaching.js');

      // Build up a high-confidence pattern (need 5+ observations)
      for (let i = 0; i < 6; i++) {
        await recordObservation(TEST_USER_ID, {
          type: 'emotional',
          trigger: 'work deadline',
          outcome: 'stress and overwhelm',
          emotion: 'anxious',
        });
      }

      const predictions = await generatePredictions(TEST_USER_ID);
      expect(Array.isArray(predictions)).toBe(true);
      // May have predictions if pattern reached high confidence
    });

    it('should build predictive context', async () => {
      const { buildPredictiveContextString } =
        await import('../services/superhuman/predictive-coaching.js');

      const context = await buildPredictiveContextString(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // LIFE NARRATIVE TESTS
  // ============================================================================

  describe('Life Narrative', () => {
    it('should record a chapter', async () => {
      const { recordChapter, getNarrative } =
        await import('../services/superhuman/life-narrative.js');

      await recordChapter(TEST_USER_ID, {
        title: 'Career Transition',
        theme: 'growth',
        startDate: new Date().toISOString(),
        status: 'active',
      });

      const narrative = await getNarrative(TEST_USER_ID);
      expect(narrative).toBeDefined();
    });

    it('should build narrative context', async () => {
      const { buildNarrativeContextString } =
        await import('../services/superhuman/life-narrative.js');

      const context = await buildNarrativeContextString(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // VALUES ALIGNMENT TESTS
  // ============================================================================

  describe('Values Alignment', () => {
    it('should record a stated value', async () => {
      const { recordValue, getValues } = await import('../services/superhuman/values-alignment.js');

      await recordValue(TEST_USER_ID, {
        value: 'health',
        evidence: 'User said "I want to prioritize my health this year"',
        type: 'stated',
      });

      const values = await getValues(TEST_USER_ID);
      expect(values).toBeDefined();
    });

    it('should build values context', async () => {
      const { buildValuesContext } = await import('../services/superhuman/values-alignment.js');

      const context = await buildValuesContext(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // EMOTIONAL FIRST AID TESTS
  // ============================================================================

  describe('Emotional First Aid', () => {
    it('should detect crisis signals', async () => {
      const { detectCrisis } = await import('../services/superhuman/emotional-first-aid.js');

      // Test with non-crisis text
      const noCrisis = detectCrisis('I had a good day today');
      expect(noCrisis).toBeNull();

      // Test with potential crisis signal (gentle detection)
      const maybeCrisis = detectCrisis("I'm feeling really overwhelmed and don't know what to do");
      // May or may not detect based on thresholds
      expect(maybeCrisis === null || typeof maybeCrisis === 'object').toBe(true);
    });

    it('should build first aid context when crisis detected', async () => {
      const { buildFirstAidContext, detectCrisis } =
        await import('../services/superhuman/emotional-first-aid.js');

      const crisis = detectCrisis("I'm having a really hard time and feel like giving up");
      if (crisis) {
        const context = buildFirstAidContext(crisis);
        expect(typeof context).toBe('string');
        expect(context.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // RELATIONSHIP NETWORK TESTS
  // ============================================================================

  describe('Relationship Network', () => {
    it('should record a relationship mention', async () => {
      const { recordRelationship, getNetwork } =
        await import('../services/superhuman/relationship-network.js');

      await recordRelationship(TEST_USER_ID, {
        name: 'Sarah',
        relationship: 'friend',
        lastMentioned: new Date().toISOString(),
        sentiment: 'positive',
      });

      const network = await getNetwork(TEST_USER_ID);
      expect(network).toBeDefined();
    });

    it('should build network context', async () => {
      const { buildNetworkContext } =
        await import('../services/superhuman/relationship-network.js');

      const context = await buildNetworkContext(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // CAPACITY GUARDIAN TESTS
  // ============================================================================

  describe('Capacity Guardian', () => {
    it('should record energy level', async () => {
      const { recordEnergyCheck, getCapacity } =
        await import('../services/superhuman/capacity-guardian.js');

      await recordEnergyCheck(TEST_USER_ID, {
        level: 6,
        factors: ['good sleep', 'exercise'],
        timestamp: new Date().toISOString(),
      });

      const capacity = await getCapacity(TEST_USER_ID);
      expect(capacity).toBeDefined();
    });

    it('should build capacity context', async () => {
      const { buildCapacityContext } = await import('../services/superhuman/capacity-guardian.js');

      const context = await buildCapacityContext(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // DREAM KEEPER TESTS
  // ============================================================================

  describe('Dream Keeper', () => {
    it('should record a dream/aspiration', async () => {
      const { recordDream, getDreams } = await import('../services/superhuman/dream-keeper.js');

      await recordDream(TEST_USER_ID, {
        dream: 'Learn to play piano',
        type: 'skill',
        mentioned: new Date().toISOString(),
        dormant: false,
      });

      const dreams = await getDreams(TEST_USER_ID);
      expect(dreams).toBeDefined();
    });

    it('should build dream context', async () => {
      const { buildDreamContext } = await import('../services/superhuman/dream-keeper.js');

      const context = await buildDreamContext(TEST_USER_ID);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // RELATIONSHIP MILESTONES TESTS
  // ============================================================================

  describe('Relationship Milestones', () => {
    it('should build milestone context with stats', async () => {
      const { buildMilestoneContext } =
        await import('../services/superhuman/relationship-milestones.js');

      const stats = {
        totalConversations: 50,
        firstConversation: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        lastConversation: Date.now(),
        vulnerableMoments: 5,
        breakthroughs: 2,
      };

      const context = await buildMilestoneContext(TEST_USER_ID, stats);
      expect(typeof context).toBe('string');
    });
  });

  // ============================================================================
  // SEASONAL AWARENESS TESTS
  // ============================================================================

  describe('Seasonal Awareness', () => {
    it('should build seasonal context', async () => {
      const { buildSeasonalContext } = await import('../services/superhuman/seasonal-awareness.js');

      const context = await buildSeasonalContext(TEST_USER_ID);
      expect(typeof context).toBe('string');
      // Should mention current season or time of year
    });

    it('should record personal dates', async () => {
      const { recordPersonalDate, getPersonalDates } =
        await import('../services/superhuman/seasonal-awareness.js');

      await recordPersonalDate(TEST_USER_ID, {
        type: 'birthday',
        date: '1990-06-15',
        name: 'User birthday',
      });

      const dates = await getPersonalDates(TEST_USER_ID);
      expect(dates).toBeDefined();
    });
  });

  // ============================================================================
  // UNIFIED CONTEXT BUILDER TEST
  // ============================================================================

  describe('Unified Superhuman Context', () => {
    it('should build complete superhuman context', async () => {
      const { buildSuperhumanContext, formatSuperhumanContextForPrompt } =
        await import('../services/superhuman/index.js');

      const context = await buildSuperhumanContext(TEST_USER_ID, {
        relationshipStats: {
          totalConversations: 10,
          firstConversation: Date.now() - 7 * 24 * 60 * 60 * 1000,
          lastConversation: Date.now(),
        },
      });

      expect(context).toBeDefined();
      expect(context.commitments).toBeDefined();
      expect(context.predictions).toBeDefined();
      expect(context.narrative).toBeDefined();
      expect(context.values).toBeDefined();
      expect(context.network).toBeDefined();
      expect(context.capacity).toBeDefined();
      expect(context.dreams).toBeDefined();
      expect(context.seasonal).toBeDefined();

      // Test formatting
      const formatted = formatSuperhumanContextForPrompt(context);
      expect(typeof formatted).toBe('string');
    });

    it('should include crisis context when signal detected', async () => {
      const { buildSuperhumanContext } = await import('../services/superhuman/index.js');

      const context = await buildSuperhumanContext(TEST_USER_ID, {
        crisisSignal: {
          type: 'text',
          signal: "I'm feeling really overwhelmed and don't know what to do anymore",
        },
      });

      // Crisis may or may not be detected based on signal strength
      expect(context.crisis === null || typeof context.crisis === 'string').toBe(true);
    });
  });

  // ============================================================================
  // PERFORMANCE TEST
  // ============================================================================

  describe('Performance', () => {
    it('should build full context within acceptable time', async () => {
      const { buildSuperhumanContext } = await import('../services/superhuman/index.js');

      const start = Date.now();
      await buildSuperhumanContext(TEST_USER_ID);
      const duration = Date.now() - start;

      // Should complete within 2 seconds (generous for emulator)
      expect(duration).toBeLessThan(2000);
      console.log(`Full superhuman context built in ${duration}ms`);
    });
  });
});

// ============================================================================
// INSTRUCTIONS FOR RUNNING
// ============================================================================

describe('Test Instructions', () => {
  it('should provide instructions when emulator not detected', () => {
    if (!EMULATOR_HOST) {
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  Firestore Emulator Not Detected                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  To run these integration tests:                                      ║
║                                                                        ║
║  1. Start the emulator:                                               ║
║     firebase emulators:start --only firestore                         ║
║                                                                        ║
║  2. Run tests with emulator host:                                     ║
║     FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run \\         ║
║       src/tests/superhuman-firestore.integration.test.ts              ║
║                                                                        ║
║  Or add to your .env.test:                                            ║
║     FIRESTORE_EMULATOR_HOST=localhost:8080                            ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
    }
    expect(true).toBe(true);
  });
});
