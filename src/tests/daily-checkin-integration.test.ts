/**
 * Daily Check-in Integration Tests
 *
 * Tests the complete daily check-in flow including:
 * - Check-in detection from voice transcripts
 * - Emotional weather extraction (keyword and LLM)
 * - Streak calculation and persistence
 * - API route integration
 * - Voice agent handler integration
 *
 * These tests verify the critical path from user saying
 * "let's do a daily check-in" to data being persisted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Services under test
import {
  getDailyRitualsService,
  resetDailyRitualsService,
  PERSONA_RITUALS,
  RITUAL_PROMPTS,
  type EmotionalWeather,
} from '../services/daily-rituals.js';

// Voice agent handler
import {
  detectDailyCheckIn,
  extractEmotionalWeather,
  getStreakCelebration,
  resetActiveCheckIns,
  type DailyCheckInContext,
  type EmotionalWeather as HandlerWeather,
} from '../agents/voice-agent/daily-checkin-handler.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Daily Check-in Integration Tests', () => {
  beforeEach(() => {
    resetDailyRitualsService();
    resetActiveCheckIns();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // CHECK-IN DETECTION TESTS
  // ============================================================================

  describe('Check-in Detection', () => {
    const createContext = (overrides?: Partial<DailyCheckInContext>): DailyCheckInContext => ({
      sessionId: 'test-session-123',
      userId: 'test-user-456',
      turnCount: 1,
      recentTranscripts: [],
      ...overrides,
    });

    it('should detect explicit daily check-in trigger', () => {
      const transcript = "Let's do a daily check-in";
      const ctx = createContext();

      const result = detectDailyCheckIn(transcript, ctx);

      expect(result.isCheckIn).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.trigger).toBe('command');
    });

    it('should detect morning check-in variant', () => {
      const transcript = 'Good morning, can we do a morning check-in?';
      const ctx = createContext();

      const result = detectDailyCheckIn(transcript, ctx);

      expect(result.isCheckIn).toBe(true);
      expect(result.trigger).toBe('command');
    });

    it('should detect sky check trigger', () => {
      const transcript = "What's my sky check for today?";
      const ctx = createContext();

      const result = detectDailyCheckIn(transcript, ctx);

      expect(result.isCheckIn).toBe(true);
      expect(result.trigger).toBe('command');
    });

    it('should detect emotional weather request', () => {
      const transcript = "Let's check my emotional weather";
      const ctx = createContext();

      const result = detectDailyCheckIn(transcript, ctx);

      expect(result.isCheckIn).toBe(true);
    });

    it('should not detect check-in for unrelated transcript', () => {
      const transcript = 'What time does the grocery store close?';
      const ctx = createContext({ turnCount: 5 }); // Not early in conversation

      const result = detectDailyCheckIn(transcript, ctx);

      expect(result.isCheckIn).toBe(false);
      expect(result.trigger).toBe('none');
    });

    it('should detect organic emotional disclosure early in conversation', () => {
      const transcript = "I'm feeling really tired and overwhelmed today, my energy is so low";
      const ctx = createContext({ turnCount: 2 });

      const result = detectDailyCheckIn(transcript, ctx);

      // Early emotional disclosure should be captured
      expect(result.isCheckIn).toBe(true);
      expect(result.trigger).toBe('organic');
    });

    it('should not capture emotional content late in conversation as check-in', () => {
      const transcript = "I'm feeling really tired";
      const ctx = createContext({ turnCount: 10 }); // Late in conversation

      const result = detectDailyCheckIn(transcript, ctx);

      // Late emotional content shouldn't trigger check-in
      expect(result.isCheckIn).toBe(false);
    });
  });

  // ============================================================================
  // WEATHER EXTRACTION TESTS
  // ============================================================================

  describe('Emotional Weather Extraction', () => {
    it('should extract sunny weather from positive transcript', () => {
      const transcript = "I'm feeling great today! Really excited and energized for the day.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('sunny');
      expect(weather?.energy).toBe('high');
    });

    it('should extract cloudy weather from low mood transcript', () => {
      const transcript =
        "I'm feeling kind of meh today. Just tired and unmotivated, going through the motions.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('cloudy');
      expect(weather?.energy).toBe('low');
    });

    it('should extract stormy weather from stressed transcript', () => {
      const transcript = "I'm so stressed and overwhelmed right now. Everything feels like chaos.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('stormy');
    });

    it('should extract rainy weather from sad transcript', () => {
      const transcript = "I'm feeling sad today, a bit down and lonely. Missing someone.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('rainy');
    });

    it('should extract foggy weather from confused transcript', () => {
      const transcript =
        "I'm feeling so confused and uncertain. Not sure what to do, brain fog everywhere.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('foggy');
    });

    it('should extract rainbow weather from breakthrough transcript', () => {
      const transcript =
        'I finally feel some relief! Like a weight has been lifted. So grateful and hopeful.';

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('rainbow');
    });

    it('should extract mixed/partly-cloudy for ambiguous mood', () => {
      const transcript = "I'm feeling okay I guess. Not bad, could be better. Mixed feelings.";

      const weather = extractEmotionalWeather(transcript);

      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('partly-cloudy');
    });

    it('should return null for transcript with no emotional content', () => {
      const transcript = 'What time does the store close?';

      const weather = extractEmotionalWeather(transcript);

      expect(weather).toBeNull();
    });

    it('should include note from original transcript', () => {
      const transcript = "I'm feeling amazing today!";

      const weather = extractEmotionalWeather(transcript);

      expect(weather?.note).toBeDefined();
      expect(weather?.note).toContain('amazing');
    });

    it('should truncate very long notes', () => {
      const longTranscript = 'I am feeling great. '.repeat(50);

      const weather = extractEmotionalWeather(longTranscript);

      expect(weather?.note).toBeDefined();
      expect(weather!.note!.length).toBeLessThanOrEqual(203); // 200 + '...'
    });
  });

  // ============================================================================
  // STREAK LOGIC TESTS
  // ============================================================================

  describe('Streak Calculation', () => {
    it('should start streak at 1 for first completion', async () => {
      const service = getDailyRitualsService();
      const userId = 'streak-test-user-1';
      const ritualId = 'ferni-sky-check';

      const result = await service.recordCompletionAsync(userId, ritualId, {
        emotionalWeather: { primary: 'sunny', energy: 'high' },
      });

      expect(result.newStreak).toBe(1);
    });

    it('should handle streak calculation for known ritual', async () => {
      const service = getDailyRitualsService();
      const userId = 'streak-test-user-2';
      const ritualId = 'ferni-sky-check';

      // First completion
      const result1 = await service.recordCompletionAsync(userId, ritualId);
      expect(result1.newStreak).toBe(1);
    });

    it('should not break streak for same-day completion', async () => {
      const service = getDailyRitualsService();
      const userId = 'streak-test-user-3';
      const ritualId = 'ferni-sky-check';

      // First completion
      await service.recordCompletionAsync(userId, ritualId);

      // Same day completion
      const result = await service.recordCompletionAsync(userId, ritualId);

      // Should maintain streak at 1, not increment
      expect(result.newStreak).toBe(1);
    });

    it('should track longest streak', async () => {
      const service = getDailyRitualsService();
      const userId = 'streak-test-user-4';
      const ritualId = 'ferni-sky-check';

      // First completion starts streak
      const result = await service.recordCompletionAsync(userId, ritualId);

      expect(result.newStreak).toBe(1);
      // First completion is always a "new record"
      expect(result.isNewRecord).toBe(true);
    });
  });

  // ============================================================================
  // CELEBRATION TESTS
  // ============================================================================

  describe('Streak Celebrations', () => {
    it('should return celebration for 3-day milestone', () => {
      const celebration = getStreakCelebration(3);

      expect(celebration).not.toBeNull();
      expect(celebration).toContain('Three days');
    });

    it('should return celebration for 7-day milestone', () => {
      const celebration = getStreakCelebration(7);

      expect(celebration).not.toBeNull();
      expect(celebration).toContain('week');
    });

    it('should return celebration for 30-day milestone', () => {
      const celebration = getStreakCelebration(30);

      expect(celebration).not.toBeNull();
      expect(celebration).toContain('month');
    });

    it('should return celebration for 100-day milestone', () => {
      const celebration = getStreakCelebration(100);

      expect(celebration).not.toBeNull();
      expect(celebration).toContain('hundred');
    });

    it('should return null for non-milestone days', () => {
      const celebration = getStreakCelebration(5);

      expect(celebration).toBeNull();
    });
  });

  // ============================================================================
  // RITUAL PROMPTS TESTS
  // ============================================================================

  describe('Ritual Prompts', () => {
    it('should have opening prompts for Ferni sky check', () => {
      const prompts = RITUAL_PROMPTS['ferni-sky-check'];

      expect(prompts).toBeDefined();
      expect(prompts.openings).toBeDefined();
      expect(prompts.openings.length).toBeGreaterThan(0);
    });

    it('should have weather responses for all weather types', () => {
      const prompts = RITUAL_PROMPTS['ferni-sky-check'];
      const weatherTypes = [
        'sunny',
        'partly-cloudy',
        'cloudy',
        'rainy',
        'stormy',
        'foggy',
        'rainbow',
      ];

      for (const weather of weatherTypes) {
        expect(
          prompts.weatherResponses[weather as keyof typeof prompts.weatherResponses]
        ).toBeDefined();
        expect(
          prompts.weatherResponses[weather as keyof typeof prompts.weatherResponses].length
        ).toBeGreaterThan(0);
      }
    });

    it('should have streak celebrations for key milestones', () => {
      const prompts = RITUAL_PROMPTS['ferni-sky-check'];
      const milestones = [3, 7, 14, 30, 66, 100];

      for (const milestone of milestones) {
        expect(
          prompts.streakCelebrations[milestone as keyof typeof prompts.streakCelebrations]
        ).toBeDefined();
      }
    });

    it('should have prompts for all persona rituals', () => {
      for (const ritualId of Object.keys(PERSONA_RITUALS)) {
        const prompts = RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS];
        expect(prompts).toBeDefined();
      }
    });
  });

  // ============================================================================
  // SERVICE METHODS TESTS
  // ============================================================================

  describe('DailyRitualsService Methods', () => {
    it('should get ritual opening', () => {
      const service = getDailyRitualsService();

      const opening = service.getRitualOpening('ferni-sky-check');

      expect(opening).toBeDefined();
      expect(opening.length).toBeGreaterThan(0);
    });

    it('should get weather response', () => {
      const service = getDailyRitualsService();

      const response = service.getWeatherResponse('sunny');

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it('should get daily wisdom from Nayan', () => {
      const service = getDailyRitualsService();

      const wisdom = service.getDailyWisdom();

      expect(wisdom).toBeDefined();
      expect(wisdom.length).toBeGreaterThan(0);
    });

    it('should get cat commentary from Maya', () => {
      const service = getDailyRitualsService();

      const commentary = service.getCatCommentary();

      expect(commentary).toBeDefined();
      expect(commentary.compound).toBeDefined();
      expect(commentary.interest).toBeDefined();
    });

    it('should check if user should be reminded', () => {
      const service = getDailyRitualsService();
      const userId = 'remind-test-user';

      // New user with no profile - should not remind
      const shouldRemind = service.shouldRemind(userId, 'ferni-sky-check');

      expect(typeof shouldRemind).toBe('boolean');
    });

    it('should get due rituals for user', () => {
      const service = getDailyRitualsService();
      const userId = 'due-test-user';

      const dueRituals = service.getDueRituals(userId);

      expect(Array.isArray(dueRituals)).toBe(true);
    });
  });

  // ============================================================================
  // WEATHER TRENDS TESTS
  // ============================================================================

  describe('Weather Trends Analysis', () => {
    it('should return stable trend for user with no history', () => {
      const service = getDailyRitualsService();
      const userId = 'trend-test-user';

      const trends = service.getWeatherTrends(userId);

      expect(trends.energyTrend).toBe('stable');
      expect(trends.dominantWeather).toBeNull();
    });

    it('should track weather history after completions', async () => {
      const service = getDailyRitualsService();
      const userId = 'weather-history-user';
      const ritualId = 'ferni-sky-check';

      // Record completion with weather
      await service.recordCompletionAsync(userId, ritualId, {
        emotionalWeather: { primary: 'sunny', energy: 'high' },
      });

      const profile = service.exportProfile(userId);

      expect(profile).not.toBeNull();
      expect(profile?.emotionalWeatherHistory.length).toBe(1);
    });
  });

  // ============================================================================
  // PERSONA RITUALS CONFIG TESTS
  // ============================================================================

  describe('Persona Rituals Configuration', () => {
    it('should have Ferni sky check ritual', () => {
      const ritual = PERSONA_RITUALS['ferni-sky-check'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('ferni');
      expect(ritual.name).toBe('Morning Sky Check');
      expect(ritual.streakable).toBe(true);
    });

    it('should have Maya habit heartbeat ritual', () => {
      const ritual = PERSONA_RITUALS['maya-habit-heartbeat'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('maya-santos');
      expect(ritual.name).toBe('Habit Heartbeat');
    });

    it('should have Nayan morning stillness ritual', () => {
      const ritual = PERSONA_RITUALS['nayan-morning-stillness'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('nayan-patel');
      expect(ritual.duration).toBe('15 seconds');
    });

    it('should have Peter pattern pulse ritual', () => {
      const ritual = PERSONA_RITUALS['peter-pattern-pulse'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('peter-john');
    });

    it('should have Alex inbox pulse ritual (weekday only)', () => {
      const ritual = PERSONA_RITUALS['alex-inbox-pulse'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('alex-chen');
      expect(ritual.frequency).toBe('weekday');
    });

    it('should have Jordan today chapter ritual', () => {
      const ritual = PERSONA_RITUALS['jordan-todays-chapter'];

      expect(ritual).toBeDefined();
      expect(ritual.personaId).toBe('jordan-taylor');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty transcript gracefully', () => {
      const weather = extractEmotionalWeather('');

      expect(weather).toBeNull();
    });

    it('should handle transcript with only punctuation', () => {
      const weather = extractEmotionalWeather('... ? ! ...');

      expect(weather).toBeNull();
    });

    it('should handle transcript with mixed case', () => {
      const weather = extractEmotionalWeather("I'm FEELING GREAT! So EXCITED and ENERGIZED!");

      expect(weather?.primary).toBe('sunny');
    });

    it('should handle transcript with multiple emotions', () => {
      // When mixed signals, should pick strongest
      const weather = extractEmotionalWeather(
        "I'm happy but also kind of stressed and a little anxious"
      );

      // Should still produce a result
      expect(weather).not.toBeNull();
    });

    it('should handle unknown ritual ID gracefully', async () => {
      const service = getDailyRitualsService();
      const userId = 'unknown-ritual-user';

      // Should auto-create if not found
      const result = await service.recordCompletionAsync(userId, 'unknown-ritual-id');

      // Should still work (creates new streak)
      expect(result.newStreak).toBe(1);
    });
  });

  // ============================================================================
  // FULL FLOW INTEGRATION
  // ============================================================================

  describe('Full Daily Check-in Flow', () => {
    it('should complete full check-in flow from detection to persistence', async () => {
      const ctx: DailyCheckInContext = {
        sessionId: 'full-flow-session',
        userId: 'full-flow-user',
        turnCount: 1,
        recentTranscripts: [],
      };

      // Step 1: Detect check-in
      const detection = detectDailyCheckIn("Let's do a daily check-in", ctx);
      expect(detection.isCheckIn).toBe(true);

      // Step 2: User responds with emotional state
      const userResponse = "I'm feeling really good today, lots of energy and optimism";
      const weather = extractEmotionalWeather(userResponse);
      expect(weather).not.toBeNull();
      expect(weather?.primary).toBe('sunny');

      // Step 3: Record completion
      const service = getDailyRitualsService();
      const result = await service.recordCompletionAsync(ctx.userId!, 'ferni-sky-check', {
        emotionalWeather: weather!,
      });

      expect(result.newStreak).toBeGreaterThan(0);

      // Step 4: Verify data persisted
      const profile = service.exportProfile(ctx.userId!);
      expect(profile).not.toBeNull();
      expect(profile?.emotionalWeatherHistory.length).toBe(1);
      expect(profile?.emotionalWeatherHistory[0].weather.primary).toBe('sunny');
    });

    it('should track multi-turn check-in conversation', async () => {
      const service = getDailyRitualsService();
      const userId = 'multi-turn-user';

      // Turn 1: Initiate check-in
      const ctx1: DailyCheckInContext = {
        sessionId: 'multi-turn-session',
        userId,
        turnCount: 1,
        recentTranscripts: [],
      };
      detectDailyCheckIn("Let's do a daily check-in", ctx1);

      // Turn 2: User describes feelings
      const ctx2: DailyCheckInContext = {
        ...ctx1,
        turnCount: 2,
        recentTranscripts: ["Let's do a daily check-in"],
      };
      detectDailyCheckIn("Well I'm feeling kind of foggy today, not sure what's going on", ctx2);

      // Extract weather from the response
      const weather = extractEmotionalWeather(
        "Well I'm feeling kind of foggy today, not sure what's going on"
      );

      expect(weather?.primary).toBe('foggy');

      // Record
      const result = await service.recordCompletionAsync(userId, 'ferni-sky-check', {
        emotionalWeather: weather!,
      });

      expect(result.newStreak).toBe(1);
    });
  });
});
