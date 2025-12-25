/**
 * Nudge Engine Tests
 *
 * Tests for the behavioral economics nudge engine.
 * Based on Thaler & Sunstein's nudge theory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flushUser: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  selectNudges,
  createImplementationIntention,
  createCommitment,
  recordIntentionOutcome,
  updateCommitmentStatus,
  getActiveCommitments,
  getImplementationIntentions,
  getNudgeContextInjection,
  generateIntentionPrompt,
  clearUserNudgeData,
  nudgeEngine,
  type NudgeContext,
  type Nudge,
} from '../nudge-engine.js';

describe('NudgeEngine', () => {
  const testUserId = 'nudge-test-user-' + Date.now();

  beforeEach(async () => {
    // Clear data between tests
    await clearUserNudgeData(testUserId);
  });

  describe('selectNudges', () => {
    it('should return nudges for context', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'health',
        currentStage: 'considering',
        motivationLevel: 0.5,
      };

      const nudges = selectNudges(context);

      expect(nudges.length).toBeGreaterThan(0);
      expect(nudges.length).toBeLessThanOrEqual(3);
    });

    it('should always include implementation intention', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'productivity',
        currentStage: 'planning',
        motivationLevel: 0.7,
      };

      const nudges = selectNudges(context);
      const hasImplementationIntention = nudges.some(n => n.type === 'implementation_intention');

      expect(hasImplementationIntention).toBe(true);
    });

    it('should include loss framing for considering stage', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'financial',
        currentStage: 'considering',
        motivationLevel: 0.6,
      };

      const nudges = selectNudges(context);
      const hasLossFraming = nudges.some(n => n.type === 'loss_framing');

      expect(hasLossFraming).toBe(true);
    });

    it('should include commitment device for planning stage', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'habit',
        currentStage: 'planning',
        motivationLevel: 0.7,
      };

      const nudges = selectNudges(context);
      const hasCommitment = nudges.some(n => n.type === 'commitment_device');

      expect(hasCommitment).toBe(true);
    });

    it('should include chunking for acting stage', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'growth',
        currentStage: 'acting',
        motivationLevel: 0.8,
      };

      const nudges = selectNudges(context);
      const hasChunking = nudges.some(n => n.type === 'chunking');

      expect(hasChunking).toBe(true);
    });

    it('should include social proof for maintaining stage', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'relationship',
        currentStage: 'maintaining',
        motivationLevel: 0.9,
      };

      const nudges = selectNudges(context);
      const hasSocialProof = nudges.some(n => n.type === 'social_proof');

      expect(hasSocialProof).toBe(true);
    });

    it('should add nudges for low motivation', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'health',
        currentStage: 'acting',
        motivationLevel: 0.2, // Low motivation
      };

      const nudges = selectNudges(context);
      // Low motivation should still return nudges
      expect(nudges.length).toBeGreaterThan(0);
    });

    it('should add friction reduction for multiple past attempts', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'habit',
        currentStage: 'planning',
        motivationLevel: 0.5,
        pastAttempts: 4,
      };

      const nudges = selectNudges(context);
      const hasFrictionReduction = nudges.some(n => n.type === 'friction_reduction');

      expect(hasFrictionReduction).toBe(true);
    });

    it('should return nudges with required properties', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'productivity',
        currentStage: 'considering',
        motivationLevel: 0.5,
      };

      const nudges = selectNudges(context);

      for (const nudge of nudges) {
        expect(nudge.id).toBeDefined();
        expect(nudge.type).toBeDefined();
        expect(nudge.targetBehavior).toBe('productivity');
        expect(nudge.strategy).toBeDefined();
        expect(nudge.script).toBeDefined();
        expect(nudge.timing).toMatch(/^(immediate|delayed|contextual)$/);
        expect(nudge.effectiveness).toBeGreaterThan(0);
        expect(nudge.effectiveness).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('createImplementationIntention', () => {
    it('should create an implementation intention', () => {
      const intention = createImplementationIntention(
        testUserId,
        'exercise daily',
        'I wake up',
        'do 10 pushups'
      );

      expect(intention.id).toBeDefined();
      expect(intention.userId).toBe(testUserId);
      expect(intention.goal).toBe('exercise daily');
      expect(intention.situation).toBe('I wake up');
      expect(intention.behavior).toBe('do 10 pushups');
      expect(intention.formula).toBe('If I wake up, then I will do 10 pushups');
      expect(intention.createdAt).toBeInstanceOf(Date);
      expect(intention.timesTriggered).toBe(0);
      expect(intention.successRate).toBe(0);
    });

    it('should store intention in user\'s list', () => {
      createImplementationIntention(
        testUserId,
        'read more',
        'I sit down for lunch',
        'read one page'
      );

      const intentions = getImplementationIntentions(testUserId);
      expect(intentions.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow multiple intentions per user', () => {
      createImplementationIntention(testUserId, 'goal1', 'situation1', 'behavior1');
      createImplementationIntention(testUserId, 'goal2', 'situation2', 'behavior2');

      const intentions = getImplementationIntentions(testUserId);
      expect(intentions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createCommitment', () => {
    it('should create a basic commitment', () => {
      const commitment = createCommitment(testUserId, 'I will exercise 3 times a week');

      expect(commitment.id).toBeDefined();
      expect(commitment.userId).toBe(testUserId);
      expect(commitment.commitment).toBe('I will exercise 3 times a week');
      expect(commitment.type).toBe('identity'); // default type
      expect(commitment.status).toBe('active');
      expect(commitment.createdAt).toBeInstanceOf(Date);
    });

    it('should create commitment with options', () => {
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week
      const commitment = createCommitment(testUserId, 'I will finish the project', {
        type: 'social',
        deadline,
        stakes: 'Donate $50 to charity',
        witnesses: ['Alice', 'Bob'],
      });

      expect(commitment.type).toBe('social');
      expect(commitment.deadline).toEqual(deadline);
      expect(commitment.stakes).toBe('Donate $50 to charity');
      expect(commitment.witnesses).toEqual(['Alice', 'Bob']);
    });

    it('should store commitment in user\'s list', () => {
      createCommitment(testUserId, 'Test commitment');

      const activeCommitments = getActiveCommitments(testUserId);
      expect(activeCommitments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recordIntentionOutcome', () => {
    it('should update intention stats on success', () => {
      const intention = createImplementationIntention(
        testUserId,
        'meditate',
        'I wake up',
        'meditate 5 min'
      );

      recordIntentionOutcome(testUserId, intention.id, true);

      const intentions = getImplementationIntentions(testUserId);
      const updated = intentions.find(i => i.id === intention.id);

      expect(updated?.timesTriggered).toBe(1);
      expect(updated?.successRate).toBe(1);
    });

    it('should calculate running success rate', () => {
      const intention = createImplementationIntention(
        testUserId,
        'stretch',
        'after meeting',
        'stretch 2 min'
      );

      recordIntentionOutcome(testUserId, intention.id, true);
      recordIntentionOutcome(testUserId, intention.id, false);
      recordIntentionOutcome(testUserId, intention.id, true);

      const intentions = getImplementationIntentions(testUserId);
      const updated = intentions.find(i => i.id === intention.id);

      expect(updated?.timesTriggered).toBe(3);
      // Success rate: 2/3 ≈ 0.667
      expect(updated?.successRate).toBeCloseTo(0.667, 2);
    });

    it('should handle unknown intention gracefully', () => {
      expect(() => {
        recordIntentionOutcome(testUserId, 'unknown-id', true);
      }).not.toThrow();
    });

    it('should handle unknown user gracefully', () => {
      expect(() => {
        recordIntentionOutcome('unknown-user', 'some-id', true);
      }).not.toThrow();
    });
  });

  describe('updateCommitmentStatus', () => {
    it('should update commitment to fulfilled', () => {
      const commitment = createCommitment(testUserId, 'Complete the task');

      updateCommitmentStatus(testUserId, commitment.id, 'fulfilled');

      const activeCommitments = getActiveCommitments(testUserId);
      expect(activeCommitments.find(c => c.id === commitment.id)).toBeUndefined();
    });

    it('should update commitment to broken', () => {
      const commitment = createCommitment(testUserId, 'Another task');

      updateCommitmentStatus(testUserId, commitment.id, 'broken');

      const activeCommitments = getActiveCommitments(testUserId);
      expect(activeCommitments.find(c => c.id === commitment.id)).toBeUndefined();
    });

    it('should handle unknown commitment gracefully', () => {
      expect(() => {
        updateCommitmentStatus(testUserId, 'unknown-id', 'fulfilled');
      }).not.toThrow();
    });
  });

  describe('getActiveCommitments', () => {
    it('should return only active commitments', () => {
      const commitment1 = createCommitment(testUserId, 'Commitment 1');
      const commitment2 = createCommitment(testUserId, 'Commitment 2');

      updateCommitmentStatus(testUserId, commitment1.id, 'fulfilled');

      const activeCommitments = getActiveCommitments(testUserId);
      expect(activeCommitments.find(c => c.id === commitment1.id)).toBeUndefined();
      expect(activeCommitments.find(c => c.id === commitment2.id)).toBeDefined();
    });

    it('should return empty array for unknown user', () => {
      const commitments = getActiveCommitments('unknown-user');
      expect(commitments).toEqual([]);
    });
  });

  describe('getImplementationIntentions', () => {
    it('should return all intentions for user', () => {
      createImplementationIntention(testUserId, 'goal1', 'sit1', 'beh1');
      createImplementationIntention(testUserId, 'goal2', 'sit2', 'beh2');

      const intentions = getImplementationIntentions(testUserId);
      expect(intentions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for unknown user', () => {
      const intentions = getImplementationIntentions('unknown-user');
      expect(intentions).toEqual([]);
    });
  });

  describe('getNudgeContextInjection', () => {
    it('should generate context injection for LLM', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'habit',
        currentStage: 'planning',
        motivationLevel: 0.6,
      };

      const injection = getNudgeContextInjection(context);

      expect(injection).toContain('BEHAVIORAL NUDGES');
      expect(injection).toContain('planning');
      expect(injection).toContain('60%');
    });

    it('should include nudge scripts', () => {
      const context: NudgeContext = {
        userId: testUserId,
        goalType: 'health',
        currentStage: 'considering',
        motivationLevel: 0.5,
      };

      const injection = getNudgeContextInjection(context);

      expect(injection).toContain('•');
    });
  });

  describe('generateIntentionPrompt', () => {
    it('should generate implementation intention prompt', () => {
      const prompt = generateIntentionPrompt('exercise more');

      expect(prompt).toContain('When');
      expect(prompt).toContain('I will');
      expect(prompt).toContain('exercise more');
      expect(prompt).toContain('example');
    });

    it('should include if-then format', () => {
      const prompt = generateIntentionPrompt('read daily');

      expect(prompt.toLowerCase()).toContain('when');
      expect(prompt.toLowerCase()).toContain('will');
    });
  });

  describe('nudgeEngine export', () => {
    it('should expose all main functions', () => {
      expect(nudgeEngine.select).toBeDefined();
      expect(nudgeEngine.createIntention).toBeDefined();
      expect(nudgeEngine.createCommitment).toBeDefined();
      expect(nudgeEngine.recordOutcome).toBeDefined();
      expect(nudgeEngine.updateCommitment).toBeDefined();
      expect(nudgeEngine.getCommitments).toBeDefined();
      expect(nudgeEngine.getIntentions).toBeDefined();
      expect(nudgeEngine.getContext).toBeDefined();
      expect(nudgeEngine.generatePrompt).toBeDefined();
      expect(nudgeEngine.loadUserData).toBeDefined();
      expect(nudgeEngine.flushUserData).toBeDefined();
      expect(nudgeEngine.clearUserData).toBeDefined();
    });
  });

  describe('nudge types coverage', () => {
    const allStages: NudgeContext['currentStage'][] = ['considering', 'planning', 'acting', 'maintaining'];

    it('should generate nudges for all stages', () => {
      for (const stage of allStages) {
        const context: NudgeContext = {
          userId: testUserId,
          goalType: 'productivity',
          currentStage: stage,
          motivationLevel: 0.5,
        };

        const nudges = selectNudges(context);
        expect(nudges.length).toBeGreaterThan(0);
      }
    });

    const allGoalTypes: NudgeContext['goalType'][] = ['health', 'productivity', 'relationship', 'financial', 'growth', 'habit'];

    it('should generate nudges for all goal types', () => {
      for (const goalType of allGoalTypes) {
        const context: NudgeContext = {
          userId: testUserId,
          goalType,
          currentStage: 'planning',
          motivationLevel: 0.5,
        };

        const nudges = selectNudges(context);
        expect(nudges.length).toBeGreaterThan(0);
        expect(nudges[0].targetBehavior).toBe(goalType);
      }
    });
  });

  describe('commitment types', () => {
    const commitmentTypes: ('social' | 'financial' | 'identity' | 'temporal')[] = [
      'social',
      'financial',
      'identity',
      'temporal',
    ];

    it('should support all commitment types', () => {
      for (const type of commitmentTypes) {
        const commitment = createCommitment(testUserId, `${type} commitment`, { type });
        expect(commitment.type).toBe(type);
      }
    });
  });
});
