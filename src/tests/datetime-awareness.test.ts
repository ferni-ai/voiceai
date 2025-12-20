/**
 * DateTime Awareness Validation Tests
 *
 * Validates that agents receive proper date/time context at launch.
 * This is critical for the "Better than Human" experience - Ferni should
 * always know what day/time it is without being told.
 *
 * @module tests/datetime-awareness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generatePreSessionBriefing,
  getTimeAwareGreetingHint,
  type PreSessionBriefing,
  type TemporalContext,
} from '../services/pre-session-briefing.js';

describe('DateTime Awareness', () => {
  describe('generatePreSessionBriefing', () => {
    it('should generate briefing with current date and time', async () => {
      const briefing = await generatePreSessionBriefing();

      expect(briefing).toBeDefined();
      expect(briefing.temporal).toBeDefined();
      expect(briefing.temporal.date).toBeTruthy();
      expect(briefing.temporal.time).toBeTruthy();
      expect(briefing.temporal.dayOfWeek).toBeTruthy();
      expect(briefing.temporal.timeOfDay).toBeTruthy();
    });

    it('should include formatted date in expected format', async () => {
      const briefing = await generatePreSessionBriefing();

      // Should match format like "Saturday, December 20, 2024"
      const datePattern = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), \w+ \d+, \d{4}$/;
      expect(briefing.temporal.date).toMatch(datePattern);
    });

    it('should include formatted time with AM/PM', async () => {
      const briefing = await generatePreSessionBriefing();

      // Should match format like "10:30 AM" or "2:45 PM"
      const timePattern = /^\d{1,2}:\d{2} (AM|PM)$/;
      expect(briefing.temporal.time).toMatch(timePattern);
    });

    it('should have valid timeOfDay value', async () => {
      const briefing = await generatePreSessionBriefing();

      const validTimeOfDay = ['early_morning', 'morning', 'midday', 'afternoon', 'evening', 'late_night'];
      expect(validTimeOfDay).toContain(briefing.temporal.timeOfDay);
    });

    it('should correctly identify weekend status', async () => {
      const briefing = await generatePreSessionBriefing();
      const today = new Date().getDay();
      const expectedIsWeekend = today === 0 || today === 6;

      expect(briefing.temporal.isWeekend).toBe(expectedIsWeekend);
    });

    it('should generate seasonal context', async () => {
      const briefing = await generatePreSessionBriefing();

      expect(briefing.cultural).toBeDefined();
      expect(briefing.cultural.season).toBeTruthy();
      expect(['Spring', 'Summer', 'Fall', 'Winter']).toContain(briefing.cultural.season);
      expect(briefing.cultural.seasonalMood).toBeTruthy();
    });

    it('should generate formatted briefing for prompt injection', async () => {
      const briefing = await generatePreSessionBriefing();

      expect(briefing.formatted).toBeTruthy();
      expect(briefing.formatted).toContain('[YOUR AWARENESS');
      expect(briefing.formatted).toContain("It's");
      expect(briefing.formatted).toContain('naturally');
    });

    it('should include user name in briefing when provided', async () => {
      const briefing = await generatePreSessionBriefing('test-user', {
        name: 'Alex',
      });

      expect(briefing.userContext?.name).toBe('Alex');
      expect(briefing.formatted).toContain('Alex');
    });

    it('should include last conversation context when provided', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const briefing = await generatePreSessionBriefing('test-user', {
        name: 'Jordan',
        lastConversation: yesterday,
      });

      expect(briefing.userContext?.lastConversation).toBeDefined();
      expect(briefing.userContext?.lastConversation?.when).toBe('yesterday');
    });

    it('should handle "earlier today" for same-day conversations', async () => {
      const briefing = await generatePreSessionBriefing('test-user', {
        lastConversation: new Date(), // Now
      });

      expect(briefing.userContext?.lastConversation?.when).toBe('earlier today');
    });
  });

  describe('TemporalContext correctness', () => {
    it('should have consistent day of week with isWeekend', async () => {
      const briefing = await generatePreSessionBriefing();
      const { dayOfWeek, isWeekend } = briefing.temporal;

      if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
        expect(isWeekend).toBe(true);
      } else {
        expect(isWeekend).toBe(false);
      }
    });

    it('should generate a vibe string', async () => {
      const briefing = await generatePreSessionBriefing();

      expect(briefing.temporal.vibe).toBeTruthy();
      expect(briefing.temporal.vibe.length).toBeGreaterThan(10);
    });

    it('should include daysUntilWeekend for weekdays', async () => {
      const briefing = await generatePreSessionBriefing();

      if (!briefing.temporal.isWeekend) {
        expect(briefing.temporal.daysUntilWeekend).toBeDefined();
        expect(briefing.temporal.daysUntilWeekend).toBeGreaterThanOrEqual(0);
        expect(briefing.temporal.daysUntilWeekend).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('getTimeAwareGreetingHint', () => {
    it('should return a string', () => {
      const hint = getTimeAwareGreetingHint();
      expect(typeof hint).toBe('string');
    });
  });

  describe('Cultural Context', () => {
    it('should detect upcoming holidays within 7 days', async () => {
      const briefing = await generatePreSessionBriefing();

      // upcomingHolidays should be an array (may be empty)
      expect(Array.isArray(briefing.cultural.upcomingHolidays)).toBe(true);

      // If there are upcoming holidays, they should have valid structure
      for (const holiday of briefing.cultural.upcomingHolidays) {
        expect(holiday.name).toBeTruthy();
        expect(holiday.daysAway).toBeGreaterThan(0);
        expect(holiday.daysAway).toBeLessThanOrEqual(7);
      }
    });
  });

  describe('Prompt Injection Format', () => {
    it('should be properly formatted for LLM injection', async () => {
      const briefing = await generatePreSessionBriefing();
      const lines = briefing.formatted.split('\n');

      // Should have header with date
      expect(lines[0]).toContain('[YOUR AWARENESS');
      expect(lines[0]).toContain('202'); // Year

      // Should have time and vibe
      expect(lines.some((l) => l.includes('It\'s'))).toBe(true);

      // Should have guidance to use naturally
      expect(lines.some((l) => l.toLowerCase().includes('naturally'))).toBe(true);
    });

    it('should not include sensitive technical details', async () => {
      const briefing = await generatePreSessionBriefing();

      expect(briefing.formatted).not.toContain('function');
      expect(briefing.formatted).not.toContain('Promise');
      expect(briefing.formatted).not.toContain('async');
      expect(briefing.formatted).not.toContain('Error');
    });
  });
});

describe('Integration: DateTime in Session', () => {
  it('should generate briefing that agents can understand', async () => {
    const briefing = await generatePreSessionBriefing('user123', {
      name: 'Test User',
    });

    // Validate the briefing contains information an agent needs
    const requiredInfo = [
      briefing.temporal.date, // Full date
      briefing.temporal.time, // Current time
      briefing.temporal.dayOfWeek, // Day of week
      briefing.cultural.season, // Season
    ];

    for (const info of requiredInfo) {
      expect(info).toBeTruthy();
      expect(briefing.formatted).toContain(
        info.includes(',') ? info.split(',')[0] : info // For date, just check first part
      );
    }
  });

  it('should provide enough context for time-appropriate responses', async () => {
    const briefing = await generatePreSessionBriefing();

    // The formatted briefing should give the agent all it needs
    const formatted = briefing.formatted.toLowerCase();

    // Should mention the time or time of day
    const hasTimeContext =
      formatted.includes('am') ||
      formatted.includes('pm') ||
      formatted.includes('morning') ||
      formatted.includes('afternoon') ||
      formatted.includes('evening') ||
      formatted.includes('night');

    expect(hasTimeContext).toBe(true);
  });
});

describe('Anonymous/Minimal User Scenarios', () => {
  it('should work with NO userId and NO profile (completely anonymous)', async () => {
    const briefing = await generatePreSessionBriefing();

    // MUST still generate valid temporal context
    expect(briefing.temporal.date).toBeTruthy();
    expect(briefing.temporal.time).toBeTruthy();
    expect(briefing.temporal.dayOfWeek).toBeTruthy();
    expect(briefing.temporal.timeOfDay).toBeTruthy();
    expect(briefing.formatted).toBeTruthy();
    expect(briefing.formatted.length).toBeGreaterThan(50);
  });

  it('should work with userId but NO profile', async () => {
    const briefing = await generatePreSessionBriefing('anon-user-123');

    expect(briefing.temporal.date).toBeTruthy();
    expect(briefing.formatted).toContain('[YOUR AWARENESS');
  });

  it('should work with empty profile object', async () => {
    const briefing = await generatePreSessionBriefing('user-456', {});

    expect(briefing.temporal.date).toBeTruthy();
    expect(briefing.cultural.season).toBeTruthy();
    expect(briefing.formatted).toBeTruthy();
  });

  it('should work with undefined name in profile', async () => {
    const briefing = await generatePreSessionBriefing('user-789', {
      name: undefined,
      lastConversation: undefined,
    });

    expect(briefing.temporal.date).toBeTruthy();
    // Should NOT contain "You're talking to" when no name
    expect(briefing.formatted).not.toContain("You're talking to");
  });

  it('should NOT throw errors regardless of input', async () => {
    // These should all complete without throwing
    await expect(generatePreSessionBriefing()).resolves.toBeDefined();
    await expect(generatePreSessionBriefing(undefined)).resolves.toBeDefined();
    await expect(generatePreSessionBriefing(undefined, undefined)).resolves.toBeDefined();
    await expect(generatePreSessionBriefing('', {})).resolves.toBeDefined();
    await expect(generatePreSessionBriefing('user', { name: '' })).resolves.toBeDefined();
  });
});

describe('Injection Guarantee', () => {
  it('should always produce a non-empty formatted string', async () => {
    // Run multiple times to catch any timing edge cases
    for (let i = 0; i < 5; i++) {
      const briefing = await generatePreSessionBriefing();
      expect(briefing.formatted).toBeTruthy();
      expect(briefing.formatted.length).toBeGreaterThan(0);
      expect(briefing.formatted).toContain('[YOUR AWARENESS');
    }
  });

  it('should always include minimum required context', async () => {
    const briefing = await generatePreSessionBriefing();
    const formatted = briefing.formatted;

    // These MUST always be present for the agent to be time-aware
    const requiredPatterns = [
      /\[YOUR AWARENESS/, // Header
      /It's \d{1,2}:\d{2} (AM|PM)/, // Time
      /(Spring|Summer|Fall|Winter)/, // Season
    ];

    for (const pattern of requiredPatterns) {
      expect(formatted).toMatch(pattern);
    }
  });
});

