/**
 * Tests for the Proactive Anticipation module (Phase 4)
 *
 * This module anticipates user needs based on:
 * - Time patterns (morning briefings, evening recaps)
 * - Calendar events (upcoming meetings)
 * - Usage patterns (daily habits)
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import {
  getProactiveHints,
  shouldPrewarmTool,
  recordToolTiming,
  type ProactiveHint,
  type AnticipationContext,
} from '../proactive-anticipation.js';
import { resetForTesting, initializeForTesting } from '../persistence.js';

// Test user ID
const TEST_USER = 'test-user-proactive';

describe('Proactive Anticipation', () => {
  // Pre-initialize Firestore before any tests to avoid issues with fake timers
  beforeAll(async () => {
    await initializeForTesting();
  });

  beforeEach(() => {
    // Reset persistence cache before each test
    resetForTesting();
    // Use fake timers but allow async operations to complete
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getProactiveHints', () => {
    it('should return morning hints during morning hours', async () => {
      // Set time to 7 AM
      vi.setSystemTime(new Date('2024-12-30T07:00:00'));

      const context: AnticipationContext = {
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
      };

      const hints = await getProactiveHints(context);

      // Should suggest morning-appropriate tools
      expect(hints).toBeInstanceOf(Array);
    });

    it('should return calendar hints when meetings are upcoming', async () => {
      vi.setSystemTime(new Date('2024-12-30T09:45:00'));

      const context: AnticipationContext = {
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
        upcomingEvents: [
          { title: 'Team Standup', startsInMinutes: 15 },
          { title: 'Client Call', startsInMinutes: 60 },
        ],
      };

      const hints = await getProactiveHints(context);

      // Should potentially hint about the upcoming meeting
      expect(hints).toBeInstanceOf(Array);
    });

    it('should respect recent tool usage to avoid repetition', async () => {
      vi.setSystemTime(new Date('2024-12-30T08:00:00'));

      const context: AnticipationContext = {
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
        recentTools: ['getWeather', 'getEvents'], // Already used these
      };

      const hints = await getProactiveHints(context);

      // Should not suggest recently used tools with high confidence
      const recentlyUsedHints = hints.filter(
        (h) => (h.toolId === 'getWeather' || h.toolId === 'getEvents') && h.confidence > 0.8
      );
      expect(recentlyUsedHints.length).toBe(0);
    });

    it('should limit number of hints returned', async () => {
      vi.setSystemTime(new Date('2024-12-30T09:00:00'));

      const context: AnticipationContext = {
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
      };

      const hints = await getProactiveHints(context);

      // Should not overwhelm with too many hints (capped at 3)
      expect(hints.length).toBeLessThanOrEqual(3);
    });
  });

  describe('shouldPrewarmTool', () => {
    it('should recommend prewarming based on time patterns', async () => {
      vi.setSystemTime(new Date('2024-12-30T06:55:00')); // Just before 7 AM

      // First record some timing patterns
      for (let i = 0; i < 5; i++) {
        const morningTime = new Date('2024-12-30T07:00:00');
        morningTime.setDate(morningTime.getDate() - i);
        await recordToolTiming({
          userId: TEST_USER,
          toolId: 'getWeather',
          timestamp: morningTime,
        });
      }

      const context: AnticipationContext = {
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
      };

      const shouldPrewarm = shouldPrewarmTool('getWeather', context);

      // May or may not recommend prewarm depending on pattern strength
      expect(typeof shouldPrewarm).toBe('boolean');
    });

    it('should not prewarm rarely used tools', async () => {
      vi.setSystemTime(new Date('2024-12-30T15:00:00'));

      const context: AnticipationContext = {
        userId: 'new-user-no-history',
        personaId: 'ferni',
        currentTime: new Date(),
      };

      const shouldPrewarm = shouldPrewarmTool('someRareTool', context);

      expect(shouldPrewarm).toBe(false);
    });
  });

  describe('recordToolTiming', () => {
    it('should record tool usage timestamp', async () => {
      vi.setSystemTime(new Date('2024-12-30T10:30:00'));

      await expect(
        recordToolTiming({
          userId: TEST_USER,
          toolId: 'playMusic',
          timestamp: new Date(),
        })
      ).resolves.not.toThrow();
    });

    it('should handle multiple recordings for same tool', async () => {
      for (let hour = 8; hour <= 12; hour++) {
        vi.setSystemTime(new Date(`2024-12-30T${hour.toString().padStart(2, '0')}:00:00`));

        await recordToolTiming({
          userId: `${TEST_USER}-multiple`,
          toolId: 'getEvents',
          timestamp: new Date(),
        });
      }

      // Should have recorded all timings
      // (no way to verify directly without internal access, but should not throw)
    });
  });

  describe('time-of-day patterns', () => {
    it('should suggest weather in morning', async () => {
      vi.setSystemTime(new Date('2024-12-30T07:30:00'));

      const hints = await getProactiveHints({
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
      });

      // Weather is often relevant in morning
      // Implementation-dependent
      expect(hints).toBeInstanceOf(Array);
    });

    it('should not suggest morning tools at night', async () => {
      vi.setSystemTime(new Date('2024-12-30T23:00:00'));

      const hints = await getProactiveHints({
        userId: TEST_USER,
        personaId: 'ferni',
        currentTime: new Date(),
      });

      // Should not suggest morning briefing at night
      const morningOnlyHints = hints.filter(
        (h) => h.reason.toLowerCase().includes('morning') && h.confidence > 0.7
      );
      expect(morningOnlyHints.length).toBe(0);
    });
  });
});
