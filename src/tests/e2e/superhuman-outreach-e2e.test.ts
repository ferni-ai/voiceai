/**
 * Superhuman → Outreach E2E Integration Tests
 *
 * Tests that superhuman services correctly trigger proactive outreach.
 *
 * @module tests/e2e/superhuman-outreach-e2e.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the outreach trigger publisher
vi.mock('../../services/outreach/trigger-publisher.js', () => ({
  publishOutreachTrigger: vi.fn().mockResolvedValue({ success: true, triggerId: 'test-trigger' }),
  publishCommitmentTrigger: vi.fn().mockResolvedValue({ success: true, triggerId: 'test-trigger' }),
  publishEmotionalSupportTrigger: vi
    .fn()
    .mockResolvedValue({ success: true, triggerId: 'test-trigger' }),
  publishThinkingOfYouTrigger: vi
    .fn()
    .mockResolvedValue({ success: true, triggerId: 'test-trigger' }),
}));

// Mock Firestore
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn().mockReturnValue(null),
  cleanForFirestore: vi.fn((obj) => obj),
}));

// Mock calendar integration
vi.mock('../../services/superhuman/commitment-calendar-integration.js', () => ({
  validateCommitmentFeasibility: vi
    .fn()
    .mockResolvedValue({ feasible: true, score: 85, conflicts: [] }),
  createCalendarBlocksForCommitment: vi.fn().mockResolvedValue({ success: true }),
  buildCommitmentCalendarContext: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../services/calendar/calendar-bridge.js', () => ({
  syncCommitmentToCalendar: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../services/data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn().mockResolvedValue(undefined),
}));

describe('Superhuman → Outreach E2E Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Commitment Keeper → Outreach', () => {
    it('should trigger outreach when commitment is made', async () => {
      const { saveCommitment } = await import('../../services/superhuman/commitment-keeper.js');
      const { publishCommitmentTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await saveCommitment({
        userId: 'test-user',
        statement: 'I will exercise tomorrow morning',
        summary: 'Morning exercise',
        type: 'intention',
        emotionalWeight: 0.7,
        lastMentioned: Date.now(),
        followUpAfter: Date.now() + 86400000,
        status: 'active',
        followUpCount: 0,
      });

      // Verify outreach trigger was called
      expect(publishCommitmentTrigger).toHaveBeenCalledWith(
        'test-user',
        'Morning exercise',
        expect.any(Date),
        expect.objectContaining({
          personaId: 'maya',
          priority: 'medium',
        })
      );
    });

    it('should include deadline when commitment has target date', async () => {
      const { saveCommitment } = await import('../../services/superhuman/commitment-keeper.js');
      const { publishCommitmentTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      const targetDate = Date.now() + 2 * 86400000; // 2 days from now

      await saveCommitment({
        userId: 'test-user',
        statement: 'I will finish the report by Friday',
        summary: 'Finish report',
        type: 'promise',
        emotionalWeight: 0.8,
        targetDate,
        lastMentioned: Date.now(),
        followUpAfter: targetDate,
        status: 'active',
        followUpCount: 0,
      });

      expect(publishCommitmentTrigger).toHaveBeenCalledWith(
        'test-user',
        'Finish report',
        expect.any(Date),
        expect.anything()
      );

      // Verify the date passed is close to targetDate
      const callArgs = (publishCommitmentTrigger as ReturnType<typeof vi.fn>).mock.calls[0];
      const passedDate = callArgs[2] as Date;
      expect(passedDate.getTime()).toBe(targetDate);
    });
  });

  describe('Dream Keeper → Outreach', () => {
    it('should trigger outreach when dream becomes dormant', async () => {
      const { onDreamBecameDormant } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onDreamBecameDormant('test-user', {
        id: 'dream-123',
        title: 'Write a novel',
        dormantDays: 45,
      });

      expect(publishThinkingOfYouTrigger).toHaveBeenCalledWith(
        'test-user',
        expect.stringContaining('Write a novel'),
        expect.objectContaining({
          personaId: 'ferni',
          metadata: expect.objectContaining({
            dreamId: 'dream-123',
            dreamTitle: 'Write a novel',
            dormantDays: 45,
          }),
        })
      );
    });

    it('should NOT trigger outreach if dream dormant less than 30 days', async () => {
      const { onDreamBecameDormant } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onDreamBecameDormant('test-user', {
        id: 'dream-456',
        title: 'Learn guitar',
        dormantDays: 20, // Less than 30 day threshold
      });

      // Should NOT have been called
      expect(publishThinkingOfYouTrigger).not.toHaveBeenCalled();
    });
  });

  describe('Capacity Guardian → Outreach', () => {
    it('should trigger outreach when burnout risk is elevated', async () => {
      const { onBurnoutRiskElevated } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishEmotionalSupportTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onBurnoutRiskElevated('test-user', {
        risk: 'high',
        riskScore: 65,
        factors: ['Declining Energy', 'Heavy Meeting Load'],
      });

      expect(publishEmotionalSupportTrigger).toHaveBeenCalledWith(
        'test-user',
        'burnout',
        0.65, // riskScore / 100
        expect.objectContaining({
          personaId: 'ferni',
          topics: ['Declining Energy', 'Heavy Meeting Load'],
        })
      );
    });

    it('should NOT trigger outreach for low/moderate risk', async () => {
      const { onBurnoutRiskElevated } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishEmotionalSupportTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onBurnoutRiskElevated('test-user', {
        risk: 'moderate',
        riskScore: 25,
        factors: ['Watching energy'],
      });

      // Moderate risk should NOT trigger outreach (only elevated/high/critical)
      expect(publishEmotionalSupportTrigger).not.toHaveBeenCalled();
    });
  });

  describe('Values Alignment → Outreach', () => {
    it('should trigger outreach when values conflict is detected', async () => {
      const { onValuesConflictDetected } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onValuesConflictDetected('test-user', {
        values: ['family', 'work'],
        situation: 'Working late instead of dinner with family',
        severity: 'high',
      });

      expect(publishThinkingOfYouTrigger).toHaveBeenCalledWith(
        'test-user',
        expect.stringContaining('family vs work'),
        expect.objectContaining({
          personaId: 'nayan', // Wisdom persona for values
        })
      );
    });

    it('should NOT trigger outreach for low severity conflict', async () => {
      const { onValuesConflictDetected } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onValuesConflictDetected('test-user', {
        values: ['freedom', 'security'],
        situation: 'Minor decision',
        severity: 'low',
      });

      expect(publishThinkingOfYouTrigger).not.toHaveBeenCalled();
    });
  });

  describe('Seasonal Awareness → Outreach', () => {
    it('should trigger outreach for upcoming important dates', async () => {
      const { onImportantDateApproaching } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishOutreachTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await onImportantDateApproaching('test-user', {
        name: "Mom's birthday",
        date: tomorrow,
        daysUntil: 1,
        type: 'birthday',
      });

      expect(publishOutreachTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          type: 'milestone_approaching',
          priority: 'high', // 1 day away = high priority
          reason: expect.stringContaining("Mom's birthday"),
          personaId: 'jordan', // Jordan is the planner
        })
      );
    });

    it('should NOT trigger outreach for dates more than 7 days away', async () => {
      const { onImportantDateApproaching } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishOutreachTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      const inTwoWeeks = new Date();
      inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);

      await onImportantDateApproaching('test-user', {
        name: 'Some event',
        date: inTwoWeeks,
        daysUntil: 14,
        type: 'anniversary',
      });

      expect(publishOutreachTrigger).not.toHaveBeenCalled();
    });
  });

  describe('Predictive Coaching → Outreach', () => {
    it('should trigger outreach for high-confidence predictions', async () => {
      const { onStrugglePredicted } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishOutreachTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onStrugglePredicted('test-user', {
        type: 'anxiety',
        confidence: 0.85,
        preventionTip: 'Take breaks every hour',
        timeframe: 'next 3 days',
      });

      expect(publishOutreachTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          type: 'thinking_of_you',
          priority: 'medium',
          reason: expect.stringContaining('anxiety'),
        })
      );
    });

    it('should NOT trigger outreach for low-confidence predictions', async () => {
      const { onStrugglePredicted } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishOutreachTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onStrugglePredicted('test-user', {
        type: 'stress',
        confidence: 0.5, // Below 0.7 threshold
        preventionTip: 'Maybe rest',
        timeframe: 'this week',
      });

      expect(publishOutreachTrigger).not.toHaveBeenCalled();
    });
  });
});

describe('Outreach Bridge Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Crisis Detection → Outreach', () => {
    it('should trigger high-priority outreach for crisis signals', async () => {
      const { onCrisisSignalsDetected } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishEmotionalSupportTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onCrisisSignalsDetected('test-user', {
        severity: 'critical',
        signals: ['hopelessness', 'isolation'],
      });

      expect(publishEmotionalSupportTrigger).toHaveBeenCalledWith(
        'test-user',
        'crisis',
        1.0, // Critical = max intensity
        expect.objectContaining({
          personaId: 'ferni',
          topics: ['hopelessness', 'isolation'],
        })
      );
    });
  });

  describe('Relationship Health → Outreach', () => {
    it('should trigger outreach for declining relationship health', async () => {
      const { onRelationshipHealthDecline } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onRelationshipHealthDecline('test-user', {
        personName: 'Sarah',
        previousHealth: 'healthy',
        currentHealth: 'strained',
        daysSinceContact: 21,
      });

      expect(publishThinkingOfYouTrigger).toHaveBeenCalledWith(
        'test-user',
        expect.stringContaining('Sarah'),
        expect.anything()
      );
    });

    it('should NOT trigger for recent contacts', async () => {
      const { onRelationshipHealthDecline } =
        await import('../../services/outreach/superhuman-outreach-bridge.js');
      const { publishThinkingOfYouTrigger } =
        await import('../../services/outreach/trigger-publisher.js');

      await onRelationshipHealthDecline('test-user', {
        personName: 'Mike',
        previousHealth: 'healthy',
        currentHealth: 'neutral',
        daysSinceContact: 5, // Less than 14 day threshold
      });

      expect(publishThinkingOfYouTrigger).not.toHaveBeenCalled();
    });
  });
});
