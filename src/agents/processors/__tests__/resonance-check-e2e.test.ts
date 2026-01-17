/**
 * Resonance Check E2E Tests
 *
 * Tests the full flow of voice-native feedback for superhuman capability effectiveness:
 * 1. Queue resonance checks when signals are detected
 * 2. Get next resonance check after cooldown
 * 3. Classify user verbal responses
 * 4. Record responses and persist to analytics
 *
 * This validates the "P0: Voice-Enabled Feedback" feature that enables
 * Ferni to naturally ask "Does that track?" after surfacing insights.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  queueResonanceCheck,
  getNextResonanceCheck,
  recordResonanceResponse,
  classifyResonanceResponse,
  cleanupResonanceQueue,
} from '../../integrations/better-than-human-integration.js';
import type { SuperhumanCapability } from '../../../conversation/superhuman/analytics.js';

// Mock the analytics tracking
vi.mock('../../../conversation/superhuman/analytics.js', async () => {
  const actual = await vi.importActual('../../../conversation/superhuman/analytics.js');
  return {
    ...actual,
    trackCapabilityEffectiveness: vi.fn(),
  };
});

// Mock the resonance check generator
vi.mock('../../../speech/llm-backchannel.js', () => ({
  generateResonanceCheck: vi.fn().mockReturnValue({
    shouldTrigger: true,
    instructions: 'End your response with a natural check-in like "Does that track?"',
    confidence: 0.8,
  }),
}));

describe('Resonance Check E2E Flow', () => {
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_USER_ID = 'test-user-456';
  const TEST_PERSONA_ID = 'ferni';

  beforeEach(() => {
    // Clean up before each test
    cleanupResonanceQueue(TEST_SESSION_ID);
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupResonanceQueue(TEST_SESSION_ID);
  });

  describe('queueResonanceCheck', () => {
    it('should queue a resonance check for commitment detection', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'User mentioned wanting to exercise more',
        1
      );

      // Next turn should have a queued check
      const result = getNextResonanceCheck(TEST_SESSION_ID, 2, TEST_PERSONA_ID);
      expect(result.shouldCheck).toBe(true);
      expect(result.capability).toBe('commitment_keeper');
    });

    it('should queue multiple capabilities', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment detected',
        1
      );
      queueResonanceCheck(
        TEST_SESSION_ID,
        'values_alignment' as SuperhumanCapability,
        'Values conflict surfaced',
        1
      );
      queueResonanceCheck(
        TEST_SESSION_ID,
        'capacity_guardian' as SuperhumanCapability,
        'Burnout warning',
        1
      );

      // First check should be commitment_keeper (FIFO)
      const first = getNextResonanceCheck(TEST_SESSION_ID, 2, TEST_PERSONA_ID);
      expect(first.shouldCheck).toBe(true);
      expect(first.capability).toBe('commitment_keeper');
    });

    it('should limit queue to 3 unchecked items', () => {
      // Queue 4 items - 4th should be dropped
      for (let i = 0; i < 4; i++) {
        queueResonanceCheck(
          TEST_SESSION_ID,
          'commitment_keeper' as SuperhumanCapability,
          `Insight ${i + 1}`,
          1
        );
      }

      // Check 3 times - should get 3 results
      let checkCount = 0;
      for (let turn = 2; turn <= 10; turn++) {
        const result = getNextResonanceCheck(TEST_SESSION_ID, turn, TEST_PERSONA_ID);
        if (result.shouldCheck) checkCount++;
      }

      expect(checkCount).toBe(3); // Only 3 were queued (4th was dropped)
    });
  });

  describe('getNextResonanceCheck', () => {
    it('should not trigger on same turn as queue', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment detected',
        1
      );

      // Same turn - should not trigger
      const result = getNextResonanceCheck(TEST_SESSION_ID, 1, TEST_PERSONA_ID);
      expect(result.shouldCheck).toBe(false);
    });

    it('should trigger on next turn after queue', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment detected',
        1
      );

      // Next turn - should trigger
      const result = getNextResonanceCheck(TEST_SESSION_ID, 2, TEST_PERSONA_ID);
      expect(result.shouldCheck).toBe(true);
      expect(result.instructions).toBeDefined();
      expect(result.instructions).toContain('track');
    });

    it('should return false when queue is empty', () => {
      const result = getNextResonanceCheck(TEST_SESSION_ID, 5, TEST_PERSONA_ID);
      expect(result.shouldCheck).toBe(false);
      expect(result.instructions).toBeUndefined();
    });

    it('should mark item as checked after retrieval', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment detected',
        1
      );

      // First call triggers check
      const first = getNextResonanceCheck(TEST_SESSION_ID, 2, TEST_PERSONA_ID);
      expect(first.shouldCheck).toBe(true);

      // Second call should not trigger same item
      const second = getNextResonanceCheck(TEST_SESSION_ID, 3, TEST_PERSONA_ID);
      expect(second.shouldCheck).toBe(false);
    });
  });

  describe('classifyResonanceResponse', () => {
    describe('positive responses', () => {
      const positiveResponses = [
        "yes, that's exactly right",
        'yeah totally',
        'yep, you nailed it',
        'that makes sense',
        'you got it',
        "that's spot on", // Need "that's" prefix for pattern match
        'definitely',
        'absolutely',
        'for sure',
        'hundred percent',
        'I feel that way too',
      ];

      positiveResponses.forEach((response) => {
        it(`should classify "${response}" as positive`, () => {
          expect(classifyResonanceResponse(response)).toBe('positive');
        });
      });
    });

    describe('negative responses', () => {
      const negativeResponses = [
        "no, that's not it",
        'not really',
        "that's off",
        "I don't think so",
        "that's wrong",
        'missing the mark',
        "that's not what I meant",
      ];

      negativeResponses.forEach((response) => {
        it(`should classify "${response}" as negative`, () => {
          expect(classifyResonanceResponse(response)).toBe('negative');
        });
      });
    });

    describe('neutral responses', () => {
      const neutralResponses = [
        'hmm, interesting',
        'okay',
        'I see',
        'tell me more',
        'what do you mean?',
      ];

      neutralResponses.forEach((response) => {
        it(`should classify "${response}" as neutral`, () => {
          expect(classifyResonanceResponse(response)).toBe('neutral');
        });
      });
    });
  });

  describe('recordResonanceResponse', () => {
    it('should record a positive response', async () => {
      const { trackCapabilityEffectiveness } =
        await import('../../../conversation/superhuman/analytics.js');

      recordResonanceResponse(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'commitment_keeper' as SuperhumanCapability,
        'positive',
        true // engagement increase
      );

      expect(trackCapabilityEffectiveness).toHaveBeenCalledWith({
        capability: 'commitment_keeper',
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        userReaction: 'positive',
        engagementIncrease: true,
      });
    });

    it('should record a negative response', async () => {
      const { trackCapabilityEffectiveness } =
        await import('../../../conversation/superhuman/analytics.js');

      recordResonanceResponse(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'values_alignment' as SuperhumanCapability,
        'negative',
        false
      );

      expect(trackCapabilityEffectiveness).toHaveBeenCalledWith({
        capability: 'values_alignment',
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        userReaction: 'negative',
        engagementIncrease: false,
      });
    });
  });

  describe('Full E2E Flow', () => {
    it('should complete the full resonance check lifecycle', async () => {
      const { trackCapabilityEffectiveness } =
        await import('../../../conversation/superhuman/analytics.js');

      // Step 1: Signal detected (commitment) - queue for feedback
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'User said they want to start meditating daily',
        5
      );

      // Step 2: Turn 5 (same turn) - no check yet
      const turn5 = getNextResonanceCheck(TEST_SESSION_ID, 5, TEST_PERSONA_ID);
      expect(turn5.shouldCheck).toBe(false);

      // Step 3: Turn 6 - check triggers
      const turn6 = getNextResonanceCheck(TEST_SESSION_ID, 6, TEST_PERSONA_ID);
      expect(turn6.shouldCheck).toBe(true);
      expect(turn6.capability).toBe('commitment_keeper');
      expect(turn6.instructions).toContain('track');

      // Step 4: User responds "yeah, that's exactly what I meant"
      const userResponse = "yeah, that's exactly what I meant";
      const classification = classifyResonanceResponse(userResponse);
      expect(classification).toBe('positive');

      // Step 5: Record the response
      recordResonanceResponse(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'commitment_keeper' as SuperhumanCapability,
        classification,
        true // user engaged more after
      );

      // Step 6: Verify analytics was called
      expect(trackCapabilityEffectiveness).toHaveBeenCalledWith({
        capability: 'commitment_keeper',
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        userReaction: 'positive',
        engagementIncrease: true,
      });

      // Step 7: Queue is now empty for this capability
      const turn7 = getNextResonanceCheck(TEST_SESSION_ID, 7, TEST_PERSONA_ID);
      expect(turn7.shouldCheck).toBe(false);
    });

    it('should handle multiple capabilities in sequence', async () => {
      // Queue multiple capabilities
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Commitment detected',
        1
      );
      queueResonanceCheck(
        TEST_SESSION_ID,
        'values_alignment' as SuperhumanCapability,
        'Values surfaced',
        2
      );

      // Turn 3: First capability checked
      const check1 = getNextResonanceCheck(TEST_SESSION_ID, 3, TEST_PERSONA_ID);
      expect(check1.shouldCheck).toBe(true);
      expect(check1.capability).toBe('commitment_keeper');

      // Record first response
      recordResonanceResponse(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'commitment_keeper' as SuperhumanCapability,
        'positive',
        false
      );

      // Turn 4: Second capability checked (values was queued at turn 2)
      const check2 = getNextResonanceCheck(TEST_SESSION_ID, 4, TEST_PERSONA_ID);
      expect(check2.shouldCheck).toBe(true);
      expect(check2.capability).toBe('values_alignment');
    });
  });

  describe('Cleanup', () => {
    it('should clean up session queue on cleanup call', () => {
      queueResonanceCheck(
        TEST_SESSION_ID,
        'commitment_keeper' as SuperhumanCapability,
        'Test insight',
        1
      );

      // Cleanup the queue
      cleanupResonanceQueue(TEST_SESSION_ID);

      // Queue should be empty
      const result = getNextResonanceCheck(TEST_SESSION_ID, 10, TEST_PERSONA_ID);
      expect(result.shouldCheck).toBe(false);
    });
  });
});
