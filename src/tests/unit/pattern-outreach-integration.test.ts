/**
 * Tests for Pattern-Based Proactive Outreach Integration
 *
 * Validates that pattern triggers correctly schedule outreach messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock trigger publisher before imports (must not reference external variables)
vi.mock('../../services/outreach/trigger-publisher.js', () => ({
  publishOutreachTrigger: vi.fn().mockResolvedValue({
    success: true,
    triggerId: 'test-trigger-123',
    messageId: 'pub-sub-msg-456',
  }),
}));

// Mock background task
vi.mock('../../utils/background-task.js', () => ({
  runBackground: vi.fn((promise) => void promise),
}));

import {
  schedulePatternOutreach,
  schedulePatternOutreachAsync,
  scheduleSundayAnxietyFollowUp,
  scheduleWorkStressFollowUp,
  scheduleRelationshipCheckIn,
  PATTERN_OUTREACH_MAP,
  getNextWeekdayAt,
  getNextTimeAt,
} from '../../services/outreach/pattern-outreach-integration.js';

import { publishOutreachTrigger } from '../../services/outreach/trigger-publisher.js';

// Get mocked function after import
const mockPublishOutreachTrigger = vi.mocked(publishOutreachTrigger);

describe('pattern-outreach-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set to Sunday evening 8pm
    vi.setSystemTime(new Date('2024-12-29T20:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('PATTERN_OUTREACH_MAP', () => {
    it('should have mapping for Sunday evening anxiety', () => {
      expect(PATTERN_OUTREACH_MAP['Sunday evening anxiety']).toBeDefined();
      expect(PATTERN_OUTREACH_MAP['Sunday evening anxiety'].triggerType).toBe(
        'pattern_acknowledgment'
      );
      expect(PATTERN_OUTREACH_MAP['Sunday evening anxiety'].suggestedTime?.hour).toBe(8); // 8am
      expect(PATTERN_OUTREACH_MAP['Sunday evening anxiety'].suggestedTime?.dayOffset).toBe(1); // Next day
    });

    it('should have mapping for Work stress trigger', () => {
      expect(PATTERN_OUTREACH_MAP['Work stress trigger']).toBeDefined();
      expect(PATTERN_OUTREACH_MAP['Work stress trigger'].triggerType).toBe('emotional_support');
      expect(PATTERN_OUTREACH_MAP['Work stress trigger'].delayMinutes).toBe(180); // 3 hours
    });

    it('should have mapping for Relationship tension', () => {
      expect(PATTERN_OUTREACH_MAP['Relationship tension']).toBeDefined();
      expect(PATTERN_OUTREACH_MAP['Relationship tension'].delayMinutes).toBe(1440); // 24 hours
    });
  });

  describe('schedulePatternOutreach', () => {
    it('should schedule outreach for known pattern', async () => {
      const pattern = {
        pattern: 'Sunday evening anxiety',
        patternDescription: 'User shows anxiety on Sunday evenings',
        tendency: 'Gets anxious before the work week',
        suggestedOutreach: 'Monday morning support message',
        actionable: 'Offer to help plan the week',
      };

      const ctx = {
        userId: 'user-123',
        sessionId: 'session-456',
        currentEmotion: 'anxiety',
        emotionIntensity: 0.7,
      };

      await schedulePatternOutreach(pattern, ctx);

      expect(mockPublishOutreachTrigger).toHaveBeenCalledTimes(1);

      const call = mockPublishOutreachTrigger.mock.calls[0][0];
      expect(call.userId).toBe('user-123');
      expect(call.type).toBe('pattern_acknowledgment');
      expect(call.priority).toBe('medium');
      expect(call.reason).toContain('User shows anxiety on Sunday evenings'); // Contains patternDescription
    });

    it('should not schedule outreach for unknown pattern', async () => {
      const pattern = {
        pattern: 'Unknown pattern XYZ',
        patternDescription: 'Some unknown pattern',
        tendency: 'Unknown',
        suggestedOutreach: 'N/A',
        actionable: 'N/A',
      };

      const ctx = {
        userId: 'user-123',
        sessionId: 'session-456',
      };

      await schedulePatternOutreach(pattern, ctx);

      expect(mockPublishOutreachTrigger).not.toHaveBeenCalled();
    });
  });

  describe('scheduleSundayAnxietyFollowUp', () => {
    it('should schedule for Monday 8am', async () => {
      await scheduleSundayAnxietyFollowUp('user-123', 'session-456', 0.8);

      expect(mockPublishOutreachTrigger).toHaveBeenCalledTimes(1);

      const call = mockPublishOutreachTrigger.mock.calls[0][0];
      expect(call.type).toBe('pattern_acknowledgment');
      expect(call.priority).toBe('high'); // High because anxietyLevel > 0.7

      const scheduledFor = new Date(call.scheduledFor);
      expect(scheduledFor.getHours()).toBe(8);
      expect(scheduledFor.getDay()).toBe(1); // Monday
    });

    it('should use medium priority for lower anxiety', async () => {
      await scheduleSundayAnxietyFollowUp('user-123', 'session-456', 0.5);

      const call = mockPublishOutreachTrigger.mock.calls[0][0];
      expect(call.priority).toBe('medium');
    });
  });

  describe('scheduleWorkStressFollowUp', () => {
    it('should schedule for evening (7pm)', async () => {
      // Set time to afternoon
      vi.setSystemTime(new Date('2024-12-30T14:00:00'));

      await scheduleWorkStressFollowUp('user-123', 'session-456', ['deadline', 'meeting']);

      expect(mockPublishOutreachTrigger).toHaveBeenCalledTimes(1);

      const call = mockPublishOutreachTrigger.mock.calls[0][0];
      expect(call.type).toBe('emotional_support');
      expect(call.context?.topics).toEqual(['deadline', 'meeting']);

      const scheduledFor = new Date(call.scheduledFor);
      expect(scheduledFor.getHours()).toBe(19); // 7pm
    });
  });

  describe('scheduleRelationshipCheckIn', () => {
    it('should schedule for next day noon', async () => {
      await scheduleRelationshipCheckIn('user-123', 'session-456', 'partner');

      expect(mockPublishOutreachTrigger).toHaveBeenCalledTimes(1);

      const call = mockPublishOutreachTrigger.mock.calls[0][0];
      expect(call.type).toBe('check_in');
      expect(call.priority).toBe('low');
      expect(call.context?.metadata?.relationshipType).toBe('partner');

      const scheduledFor = new Date(call.scheduledFor);
      expect(scheduledFor.getHours()).toBe(12);
    });
  });

  describe('time utilities', () => {
    describe('getNextWeekdayAt', () => {
      it('should return next Monday at 8am from Sunday', () => {
        // Sunday 8pm
        vi.setSystemTime(new Date('2024-12-29T20:00:00'));

        const nextMonday = getNextWeekdayAt(1, 8);

        expect(nextMonday.getDay()).toBe(1); // Monday
        expect(nextMonday.getHours()).toBe(8);
        expect(nextMonday.getDate()).toBe(30); // Dec 30
      });

      it('should return next week if already past target day', () => {
        // Tuesday 10am
        vi.setSystemTime(new Date('2024-12-31T10:00:00'));

        const nextMonday = getNextWeekdayAt(1, 8);

        expect(nextMonday.getDay()).toBe(1);
        expect(nextMonday.getDate()).toBe(6); // Jan 6, next week
      });
    });

    describe('getNextTimeAt', () => {
      it('should return same day if time is in future', () => {
        // 2pm
        vi.setSystemTime(new Date('2024-12-30T14:00:00'));

        const nextEvening = getNextTimeAt(19); // 7pm

        expect(nextEvening.getDate()).toBe(30);
        expect(nextEvening.getHours()).toBe(19);
      });

      it('should return next day if time has passed', () => {
        // 9pm
        vi.setSystemTime(new Date('2024-12-30T21:00:00'));

        const nextEvening = getNextTimeAt(19); // 7pm

        expect(nextEvening.getDate()).toBe(31);
        expect(nextEvening.getHours()).toBe(19);
      });
    });
  });

  describe('schedulePatternOutreachAsync', () => {
    it('should not block (fire and forget)', async () => {
      const { runBackground } = await import('../../utils/background-task.js');
      vi.mocked(runBackground).mockClear();

      const pattern = {
        pattern: 'Work stress trigger',
        patternDescription: 'Test',
        tendency: 'Test',
        suggestedOutreach: 'Test',
        actionable: 'Test',
      };

      const ctx = {
        userId: 'user-999', // Use unique user to avoid dedup
        sessionId: 'session-456',
      };

      // Should not throw and should return immediately
      expect(() => schedulePatternOutreachAsync(pattern, ctx)).not.toThrow();

      // runBackground should have been called
      expect(runBackground).toHaveBeenCalled();
    });
  });
});
