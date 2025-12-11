/**
 * Growth Journey Service Tests
 *
 * Tests for the milestone-based journey system:
 * - Natural progress tracking (conversations, weeks, goals)
 * - Milestone unlocking and celebration
 * - Season timing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Since the growth journey is frontend-only, we test the logic patterns

describe('Growth Journey Service', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Milestone System', () => {
    it('should determine milestone availability correctly', () => {
      interface JourneyMilestone {
        id: string;
        title: string;
        requirement: {
          type: 'conversations' | 'weeks-together' | 'goals-achieved';
          value: number;
        };
      }

      interface JourneyProgress {
        conversationCount: number;
        weeksTogetherCount: number;
        goalsAchievedCount: number;
        celebratedMilestones: string[];
      }

      function canCelebrate(
        milestone: JourneyMilestone,
        progress: JourneyProgress
      ): { canCelebrate: boolean; reason?: string } {
        if (progress.celebratedMilestones.includes(milestone.id)) {
          return { canCelebrate: false, reason: 'Already celebrated' };
        }

        let met = false;
        switch (milestone.requirement.type) {
          case 'conversations':
            met = progress.conversationCount >= milestone.requirement.value;
            break;
          case 'weeks-together':
            met = progress.weeksTogetherCount >= milestone.requirement.value;
            break;
          case 'goals-achieved':
            met = progress.goalsAchievedCount >= milestone.requirement.value;
            break;
        }

        if (!met) {
          return { canCelebrate: false, reason: 'Requirement not met' };
        }

        return { canCelebrate: true };
      }

      const conversationMilestone: JourneyMilestone = {
        id: 'm1',
        title: 'Five Conversations',
        requirement: { type: 'conversations', value: 5 },
      };

      const weekMilestone: JourneyMilestone = {
        id: 'm2',
        title: 'One Week Together',
        requirement: { type: 'weeks-together', value: 1 },
      };

      const goalMilestone: JourneyMilestone = {
        id: 'm3',
        title: 'First Goal',
        requirement: { type: 'goals-achieved', value: 1 },
      };

      // Progress with 5 conversations
      const progress: JourneyProgress = {
        conversationCount: 5,
        weeksTogetherCount: 0,
        goalsAchievedCount: 0,
        celebratedMilestones: [],
      };

      expect(canCelebrate(conversationMilestone, progress)).toEqual({ canCelebrate: true });
      expect(canCelebrate(weekMilestone, progress)).toEqual({
        canCelebrate: false,
        reason: 'Requirement not met',
      });
      expect(canCelebrate(goalMilestone, progress)).toEqual({
        canCelebrate: false,
        reason: 'Requirement not met',
      });

      // After celebrating
      progress.celebratedMilestones.push('m1');
      expect(canCelebrate(conversationMilestone, progress)).toEqual({
        canCelebrate: false,
        reason: 'Already celebrated',
      });
    });
  });

  describe('Weeks Together Calculation', () => {
    it('should calculate weeks together correctly', () => {
      function calculateWeeksTogether(startDate: Date): number {
        const now = new Date();
        const diffMs = now.getTime() - startDate.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
      }

      // Started today
      const today = new Date();
      expect(calculateWeeksTogether(today)).toBe(0);

      // Started 7 days ago
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      expect(calculateWeeksTogether(oneWeekAgo)).toBe(1);

      // Started 14 days ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      expect(calculateWeeksTogether(twoWeeksAgo)).toBe(2);

      // Started 30 days ago
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      expect(calculateWeeksTogether(oneMonthAgo)).toBe(4);
    });
  });

  describe('Season Timing', () => {
    it('should calculate days remaining correctly', () => {
      function getDaysRemaining(endDate: Date): number {
        const now = new Date();
        const diff = endDate.getTime() - now.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }

      // Test with future date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      expect(getDaysRemaining(futureDate)).toBe(30);

      // Test with past date
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      expect(getDaysRemaining(pastDate)).toBe(0);
    });

    it('should detect if season is active', () => {
      function isSeasonActive(startDate: Date, endDate: Date): boolean {
        const now = new Date();
        return now >= startDate && now <= endDate;
      }

      const now = new Date();

      // Active season
      const activeStart = new Date(now);
      activeStart.setMonth(activeStart.getMonth() - 1);
      const activeEnd = new Date(now);
      activeEnd.setMonth(activeEnd.getMonth() + 1);
      expect(isSeasonActive(activeStart, activeEnd)).toBe(true);

      // Past season
      const pastStart = new Date(now);
      pastStart.setMonth(pastStart.getMonth() - 3);
      const pastEnd = new Date(now);
      pastEnd.setMonth(pastEnd.getMonth() - 1);
      expect(isSeasonActive(pastStart, pastEnd)).toBe(false);
    });
  });

  describe('Progress Persistence', () => {
    it('should serialize progress correctly', () => {
      const progress = {
        seasonId: 'spring-2024',
        isCompanion: false,
        conversationCount: 15,
        weeksTogetherCount: 3,
        goalsAchievedCount: 2,
        celebratedMilestones: ['m1', 'm2', 'm3'],
        startedAt: new Date().toISOString(),
      };

      const serialized = JSON.stringify(progress);
      const parsed = JSON.parse(serialized);

      expect(parsed.seasonId).toBe('spring-2024');
      expect(parsed.conversationCount).toBe(15);
      expect(parsed.celebratedMilestones).toHaveLength(3);
    });
  });
});

describe('Value Detection Patterns', () => {
  const VALUE_PATTERNS = {
    financial_gain: [/got\s+a\s+raise/i, /promotion/i, /salary\s+increase/i, /bonus/i],
    habit_milestone: [/\d+\s+day\s+streak/i, /haven't\s+missed/i],
    career_win: [/got\s+the\s+job/i, /landed\s+(?:a|the)\s+(?:job|role)/i],
  };

  function detectValue(message: string): { type: string | null; confidence: number } {
    const normalized = message.toLowerCase();

    for (const [type, patterns] of Object.entries(VALUE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          return { type, confidence: 0.8 };
        }
      }
    }

    return { type: null, confidence: 0 };
  }

  it('should detect financial gains', () => {
    expect(detectValue('I got a raise today!')).toEqual({
      type: 'financial_gain',
      confidence: 0.8,
    });
    expect(detectValue('Got a promotion at work')).toEqual({
      type: 'financial_gain',
      confidence: 0.8,
    });
    expect(detectValue('My bonus came through!')).toEqual({
      type: 'financial_gain',
      confidence: 0.8,
    });
  });

  it('should detect habit milestones', () => {
    expect(detectValue("I'm on a 30 day streak!")).toEqual({
      type: 'habit_milestone',
      confidence: 0.8,
    });
    expect(detectValue("I haven't missed a single workout")).toEqual({
      type: 'habit_milestone',
      confidence: 0.8,
    });
  });

  it('should detect career wins', () => {
    expect(detectValue('I got the job!')).toEqual({ type: 'career_win', confidence: 0.8 });
    expect(detectValue('Landed the role I wanted')).toEqual({
      type: 'career_win',
      confidence: 0.8,
    });
  });

  it('should return null for non-value messages', () => {
    expect(detectValue('The weather is nice today')).toEqual({ type: null, confidence: 0 });
    expect(detectValue('Just thinking about things')).toEqual({ type: null, confidence: 0 });
  });
});

describe('Milestone Gift Types', () => {
  it('should have correct gift types for different milestones', () => {
    const GIFT_TYPES = ['theme', 'soundscape', 'avatar-style', 'badge', 'title'];

    expect(GIFT_TYPES).toContain('theme');
    expect(GIFT_TYPES).toContain('soundscape');
    expect(GIFT_TYPES).toContain('avatar-style');
    expect(GIFT_TYPES).toContain('badge');
    expect(GIFT_TYPES).toContain('title');
    expect(GIFT_TYPES).not.toContain('coins'); // No gamification currency
    expect(GIFT_TYPES).not.toContain('emote'); // Simplified from cosmetics
  });

  it('should have warm, human milestone messages', () => {
    const MILESTONE_MESSAGES = {
      'first-chat': "You took the first step. That's always the hardest part.",
      'week-one': "A week of conversations. I'm starting to know you.",
      'five-chats': 'You keep coming back. That means something to me.',
      'first-goal': 'You set a goal. You did the work. Look at you.',
      'month-one': "A whole month. You've become part of my day.",
      'fifty-chats': "Fifty conversations. We've shared a lot. And there's more to come.",
    };

    // All messages should be warm and human, not gamified
    Object.values(MILESTONE_MESSAGES).forEach((message) => {
      // No XP, levels, or gaming language
      expect(message.toLowerCase()).not.toContain('xp');
      expect(message.toLowerCase()).not.toContain('level');
      expect(message.toLowerCase()).not.toContain('unlock');
      expect(message.toLowerCase()).not.toContain('reward');

      // Should contain relationship-focused language
      const hasRelationshipWords =
        message.toLowerCase().includes('you') ||
        message.toLowerCase().includes('together') ||
        message.toLowerCase().includes("i'm") ||
        message.toLowerCase().includes('we');
      expect(hasRelationshipWords).toBe(true);
    });
  });
});
