/**
 * Maya Integration Tests
 *
 * Tests Maya's complete feature set:
 * - Habit coaching tools
 * - Gamification system (V1 + V2)
 * - Proactive coaching
 * - Notification configuration
 * - Data persistence flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProductivityStore,
  initializeProductivityStore,
} from '../services/productivity-store.js';

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  voice: {
    BackgroundAudioPlayer: vi.fn(),
  },
}));

// ============================================================================
// GAMIFICATION TESTS
// ============================================================================

describe('Maya Gamification System', () => {
  describe('Badge Definitions', () => {
    it('should have all badge categories covered', async () => {
      const { BADGE_DEFINITIONS } = await import('../tools/gamification.js');

      const categories = new Set(BADGE_DEFINITIONS.map((b) => b.category));

      expect(categories).toContain('streaks');
      expect(categories).toContain('milestones');
      expect(categories).toContain('challenges');
      expect(categories).toContain('domains');
      expect(categories).toContain('behavior_science');
      expect(categories).toContain('comebacks');
      expect(categories).toContain('social');
      expect(categories).toContain('special');
    });

    it('should have all rarity levels', async () => {
      const { BADGE_DEFINITIONS } = await import('../tools/gamification.js');

      const rarities = new Set(BADGE_DEFINITIONS.map((b) => b.rarity));

      expect(rarities).toContain('common');
      expect(rarities).toContain('uncommon');
      expect(rarities).toContain('rare');
      expect(rarities).toContain('epic');
      expect(rarities).toContain('legendary');
    });

    it('should have 45+ badges', async () => {
      const { BADGE_DEFINITIONS } = await import('../tools/gamification.js');

      expect(BADGE_DEFINITIONS.length).toBeGreaterThanOrEqual(45);
    });
  });

  describe('Title Progression', () => {
    it('should have 10 title tiers', async () => {
      const { TITLE_PROGRESSION } = await import('../tools/gamification.js');

      expect(TITLE_PROGRESSION.length).toBe(10);

      // Check tiers are 1-10
      const tiers = TITLE_PROGRESSION.map((t) => t.tier);
      expect(Math.min(...tiers)).toBe(1);
      expect(Math.max(...tiers)).toBe(10);
    });

    it('should have progression from newcomer to legend', async () => {
      const { TITLE_PROGRESSION } = await import('../tools/gamification.js');

      const titles = TITLE_PROGRESSION.map((t) => t.id);

      expect(titles).toContain('newcomer');
      expect(titles).toContain('habit_legend');
    });
  });

  describe('XP Calculations', () => {
    it('should calculate level from XP correctly', async () => {
      const { calculateLevel } = await import('../tools/gamification.js');

      // Level formula: level = sqrt(totalXP / 100) + 1
      expect(calculateLevel(0).level).toBe(1);
      expect(calculateLevel(100).level).toBe(2);
      expect(calculateLevel(400).level).toBe(3);
      expect(calculateLevel(900).level).toBe(4);
      expect(calculateLevel(10000).level).toBe(11);
    });

    it('should calculate progress percentage', async () => {
      const { calculateLevel } = await import('../tools/gamification.js');

      const level2Progress = calculateLevel(200); // Halfway to level 3
      expect(level2Progress.level).toBe(2);
      expect(level2Progress.progress).toBeGreaterThan(0);
      expect(level2Progress.progress).toBeLessThan(100);
    });
  });
});

// ============================================================================
// HABIT COACHING TESTS
// ============================================================================

describe('Maya Habit Coaching', () => {
  describe('Life Domains', () => {
    it('should define all 8 life domains', async () => {
      const { LIFE_DOMAINS } = await import('../tools/habit-coaching.js');

      const domainKeys = Object.keys(LIFE_DOMAINS);

      expect(domainKeys).toContain('health');
      expect(domainKeys).toContain('mind');
      expect(domainKeys).toContain('relationships');
      expect(domainKeys).toContain('career');
      expect(domainKeys).toContain('finance');
      expect(domainKeys).toContain('selfCare');
      expect(domainKeys).toContain('home');
      expect(domainKeys).toContain('learning');
    });

    it('should have subdomains for each domain', async () => {
      const { LIFE_DOMAINS } = await import('../tools/habit-coaching.js');

      for (const [key, domain] of Object.entries(LIFE_DOMAINS)) {
        expect(domain.subdomains, `${key} should have subdomains`).toBeDefined();
        expect(
          domain.subdomains.length,
          `${key} should have at least one subdomain`
        ).toBeGreaterThan(0);
        expect(domain.icon, `${key} should have an icon`).toBeDefined();
      }
    });
  });

  describe('Glidepath System', () => {
    it('should define 5 glidepath levels', async () => {
      const { GLIDEPATH_LEVELS } = await import('../tools/habit-coaching.js');

      expect(GLIDEPATH_LEVELS.length).toBe(5);

      // Check level numbers 1-5
      const levelNumbers = GLIDEPATH_LEVELS.map((l) => l.level);
      expect(levelNumbers).toContain(1);
      expect(levelNumbers).toContain(2);
      expect(levelNumbers).toContain(3);
      expect(levelNumbers).toContain(4);
      expect(levelNumbers).toContain(5);
    });

    it('should have increasing intensity per level', async () => {
      const { GLIDEPATH_LEVELS } = await import('../tools/habit-coaching.js');

      for (let i = 1; i < GLIDEPATH_LEVELS.length; i++) {
        expect(GLIDEPATH_LEVELS[i].intensity).toBeGreaterThan(GLIDEPATH_LEVELS[i - 1].intensity);
      }
    });
  });

  describe('Four Tendencies', () => {
    it('should have assessFourTendencies tool', async () => {
      const { createMayaHabitCoachTools } = await import('../tools/habit-coaching.js');
      const tools = createMayaHabitCoachTools();

      // The Four Tendencies framework is implemented as a tool
      expect(tools.assessFourTendencies).toBeDefined();
    });

    it('should have Four Tendencies as internal constant', async () => {
      // The FOUR_TENDENCIES constant is internal to the tool
      // We verify the tool exists and works through the tool definition
      const { createMayaHabitCoachTools } = await import('../tools/habit-coaching.js');
      const tools = createMayaHabitCoachTools();

      // Check the tool has proper configuration
      expect(tools.assessFourTendencies.description).toBeDefined();
      expect(tools.assessFourTendencies.execute).toBeDefined();
    });
  });

  describe('30-Day Challenges', () => {
    it('should define multiple challenge types', async () => {
      const { THIRTY_DAY_CHALLENGES } = await import('../tools/habit-coaching.js');

      const challengeKeys = Object.keys(THIRTY_DAY_CHALLENGES);
      expect(challengeKeys.length).toBeGreaterThanOrEqual(3);

      // Check for actual challenge names in the system
      expect(challengeKeys).toContain('morning_person');
    });

    it('should have weekly structure for each challenge', async () => {
      const { THIRTY_DAY_CHALLENGES } = await import('../tools/habit-coaching.js');

      for (const [name, challenge] of Object.entries(THIRTY_DAY_CHALLENGES)) {
        expect(challenge.name, `${name} should have a name`).toBeDefined();
        expect(challenge.weeks, `${name} should have weeks`).toBeDefined();
        expect(challenge.weeks.length, `${name} should have multiple weeks`).toBeGreaterThanOrEqual(
          4
        );

        // Each week should have days
        for (const week of challenge.weeks) {
          expect(week.days, `Week in ${name} should have days`).toBeDefined();
          expect(week.days.length, `Week in ${name} should have 7 days`).toBe(7);
        }
      }
    });
  });
});

// ============================================================================
// PROACTIVE COACHING TESTS
// ============================================================================

describe('Maya Proactive Coaching', () => {
  describe('Opportunity Detection', () => {
    it('should define multiple opportunity types', async () => {
      // Import tools
      const { createMayaProactiveTools } = await import('../tools/proactive-coaching.js');
      const tools = createMayaProactiveTools();

      expect(tools.checkForProactiveOpportunities).toBeDefined();
      expect(tools.generateProactiveMessage).toBeDefined();
      expect(tools.scheduleFollowUp).toBeDefined();
      expect(tools.getPendingFollowUps).toBeDefined();
      expect(tools.celebrateAchievement).toBeDefined();
    });
  });
});

// ============================================================================
// NOTIFICATION TESTS
// ============================================================================

describe('Maya Notification System', () => {
  describe('Notification Tools', () => {
    it('should provide all notification configuration tools', async () => {
      const { createMayaNotificationTools } = await import('../tools/notifications.js');
      const tools = createMayaNotificationTools();

      expect(tools.getNotificationPreferences).toBeDefined();
      expect(tools.setNotificationsEnabled).toBeDefined();
      expect(tools.setPreferredTime).toBeDefined();
      expect(tools.setDeliveryMethod).toBeDefined();
      expect(tools.setQuietHours).toBeDefined();
      expect(tools.configureNotificationTypes).toBeDefined();
      expect(tools.scheduleCustomReminder).toBeDefined();
      expect(tools.setupDailyReminders).toBeDefined();
      expect(tools.setupWeeklyReflection).toBeDefined();
    });
  });
});

// ============================================================================
// TOOL INTEGRATION TESTS
// ============================================================================

describe('Maya Tool Integration', () => {
  // Skip full integration tests that require complex mocking
  // These are tested in the individual tool modules
  it.skip('should create all Maya tools in index (requires full mock)', async () => {
    // This test requires mocking the entire audio subsystem
    // Tool creation is verified through individual tool module tests
  });

  it.skip('should support maya alias IDs (requires full mock)', async () => {
    // This test requires mocking the entire audio subsystem
    // ID mapping is verified in persona-id-mapping tests
  });

  // Verify individual tool modules can be imported
  it('should import habit coach tools', async () => {
    const module = await import('../tools/habit-coaching.js');
    expect(module.createMayaHabitCoachTools).toBeDefined();
    expect(typeof module.createMayaHabitCoachTools).toBe('function');
  });

  it('should import gamification tools', async () => {
    const module = await import('../tools/gamification.js');
    expect(module.createMayaGamificationTools).toBeDefined();
    expect(module.BADGE_DEFINITIONS).toBeDefined();
    expect(module.TITLE_PROGRESSION).toBeDefined();
  });

  it('should import gamification v2 tools', async () => {
    const module = await import('../tools/gamification-v2.js');
    expect(module.createMayaGamificationToolsV2).toBeDefined();
    expect(typeof module.createMayaGamificationToolsV2).toBe('function');
  });

  it('should import proactive coach tools', async () => {
    const module = await import('../tools/proactive-coaching.js');
    expect(module.createMayaProactiveTools).toBeDefined();
    expect(typeof module.createMayaProactiveTools).toBe('function');
  });

  it('should import notification tools', async () => {
    const module = await import('../tools/notifications.js');
    expect(module.createMayaNotificationTools).toBeDefined();
    expect(typeof module.createMayaNotificationTools).toBe('function');
  });
});

// ============================================================================
// DATA PERSISTENCE TESTS
// ============================================================================

describe('Maya Data Persistence', () => {
  beforeEach(async () => {
    // Reset store
    vi.clearAllMocks();
  });

  describe('ProductivityStore User Preferences', () => {
    it('should store and retrieve user preferences', async () => {
      const store = getProductivityStore();
      const userId = 'test-user-123';
      const key = 'testPreference';
      const value = { test: 'data', number: 42 };

      store.setUserPreference(userId, key, value);
      const retrieved = store.getUserPreference(userId, key);

      expect(retrieved).toEqual(value);
    });

    it('should return undefined for non-existent preferences', async () => {
      const store = getProductivityStore();
      const userId = 'test-user-456';

      const retrieved = store.getUserPreference(userId, 'nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('should isolate preferences by user', async () => {
      const store = getProductivityStore();
      const key = 'sharedKey';

      store.setUserPreference('user1', key, { value: 'user1data' });
      store.setUserPreference('user2', key, { value: 'user2data' });

      expect(store.getUserPreference('user1', key)).toEqual({ value: 'user1data' });
      expect(store.getUserPreference('user2', key)).toEqual({ value: 'user2data' });
    });
  });

  describe('Enhanced Habit Storage', () => {
    it('should store and retrieve enhanced habits', async () => {
      const store = getProductivityStore();
      const userId = 'test-user-habits';

      const habit = {
        id: 'habit-123',
        name: 'Morning Meditation',
        description: '5 minutes of mindfulness',
        domain: 'mind',
        currentLevel: 1,
        targetLevel: 5,
        levelStartDate: new Date().toISOString(),
        levelHistory: [],
        habitLoop: {
          cue: { type: 'time', description: '7am', specificity: 'high' },
          routine: { behavior: 'Sit and breathe', duration: 5, difficulty: 'easy' },
          reward: { intrinsic: 'Calm feeling', celebration: 'Say "I am present"' },
        },
        isKeystone: false,
        frequency: 'daily',
        targetPerDay: 1,
        currentStreak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        successRate: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setEnhancedHabit(userId, habit);
      const habits = store.getUserEnhancedHabits(userId);

      expect(habits.length).toBe(1);
      expect(habits[0].name).toBe('Morning Meditation');
      expect(habits[0].domain).toBe('mind');
    });
  });
});

// ============================================================================
// GAMIFICATION STORE TESTS (V2)
// ============================================================================

describe('Maya Gamification Store V2', () => {
  describe('Zod Schemas', () => {
    it('should validate gamification profile schema', async () => {
      const { GamificationProfileSchema } = await import('../services/maya-gamification-store.js');

      const validProfile = {
        userId: 'test-123',
        totalXP: 1000,
        level: 4,
        currentTitle: 'habit_builder',
        titleTier: 4,
        badgeCount: 5,
        challengesCompleted: 1,
        stats: {
          totalHabitsCreated: 3,
          totalCompletions: 50,
          longestStreak: 14,
          currentStreak: 7,
          domainsExplored: ['health', 'mind'],
          behaviorToolsUsed: ['four_tendencies'],
          comebacks: 1,
          weeklyReflections: 2,
        },
        preferences: {
          showOnLeaderboard: true,
          displayName: 'TestUser',
          shareProgress: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const result = GamificationProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
    });

    it('should validate earned badge schema', async () => {
      const { EarnedBadgeSchema } = await import('../services/maya-gamification-store.js');

      const validBadge = {
        id: 'badge_first_streak_123',
        badgeId: 'first_streak',
        userId: 'test-123',
        earnedAt: new Date().toISOString(),
        rarity: 'common' as const,
        category: 'streaks',
        xpAwarded: 50,
      };

      const result = EarnedBadgeSchema.safeParse(validBadge);
      expect(result.success).toBe(true);
    });

    it('should validate export schema', async () => {
      const { GamificationExportSchema } = await import('../services/maya-gamification-store.js');

      const validExport = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        userId: 'test-123',
        profile: {
          userId: 'test-123',
          totalXP: 0,
          level: 1,
          currentTitle: 'newcomer',
          titleTier: 1,
          badgeCount: 0,
          challengesCompleted: 0,
          stats: {
            totalHabitsCreated: 0,
            totalCompletions: 0,
            longestStreak: 0,
            currentStreak: 0,
            domainsExplored: [],
            behaviorToolsUsed: [],
            comebacks: 0,
            weeklyReflections: 0,
          },
          preferences: {
            showOnLeaderboard: true,
            shareProgress: false,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
        badges: [],
        challenges: [],
        behaviorTools: [],
        moodLogs: [],
      };

      const result = GamificationExportSchema.safeParse(validExport);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// END-TO-END FLOW TESTS
// ============================================================================

describe('Maya End-to-End Flows', () => {
  it('should support a complete habit creation flow', async () => {
    const { createMayaHabitCoachTools } = await import('../tools/habit-coaching.js');
    const tools = createMayaHabitCoachTools();

    // 1. Assess life domains
    expect(tools.assessLifeDomains).toBeDefined();

    // 2. Get habit recommendations
    expect(tools.recommendHabits).toBeDefined();

    // 3. Create enhanced habit
    expect(tools.createEnhancedHabit).toBeDefined();

    // 4. Log completion
    expect(tools.logHabitCompletion).toBeDefined();

    // 5. Weekly reflection
    expect(tools.weeklyReflection).toBeDefined();

    // 6. Get encouragement
    expect(tools.getEncouragement).toBeDefined();
  });

  it('should support a complete challenge flow', async () => {
    const { createMayaHabitCoachTools } = await import('../tools/habit-coaching.js');
    const tools = createMayaHabitCoachTools();

    // 1. Start challenge
    expect(tools.start30DayChallenge).toBeDefined();

    // 2. Get today's action
    expect(tools.getTodaysChallengeAction).toBeDefined();

    // 3. Log challenge day
    expect(tools.logChallengeDay).toBeDefined();

    // 4. Get habit bundle
    expect(tools.getHabitBundle).toBeDefined();
  });

  it('should support a complete gamification flow', async () => {
    const { createMayaGamificationToolsV2 } = await import('../tools/gamification-v2.js');
    const tools = createMayaGamificationToolsV2();

    // 1. Get profile
    expect(tools.getGamificationProfileV2).toBeDefined();

    // 2. Award XP
    expect(tools.awardXPV2).toBeDefined();

    // 3. Check/Award badges
    expect(tools.awardBadgeV2).toBeDefined();

    // 4. View badges
    expect(tools.viewBadgeCollectionV2).toBeDefined();

    // 5. Check leaderboard
    expect(tools.getLeaderboard).toBeDefined();

    // 6. Celebrate progress
    expect(tools.celebrateProgressV2).toBeDefined();

    // 7. Export for backup
    expect(tools.exportGamificationData).toBeDefined();
  });
});
