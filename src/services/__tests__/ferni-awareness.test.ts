/**
 * Ferni Awareness Service Tests
 *
 * Tests for awareness context building, user analysis,
 * conversation tracking, and decision queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

import {
  type UserAwareness,
  type ConversationAwareness,
  type TimeAwareness,
  type FerniAwarenessContext,
  buildFerniAwareness,
  isGoodMomentForVulnerability,
  shouldActivateLateNightMode,
  shouldSurfacePattern,
  getAppropriateEnergy,
  getToolDecisionContext,
} from '../ferni-awareness.js';

import type { UserProfile } from '../../types/user-profile.js';
import type { SessionServices } from '../types.js';

describe('FerniAwareness', () => {
  describe('UserAwareness type', () => {
    it('should define identity fields', () => {
      const identity: UserAwareness['identity'] = {
        name: 'John',
        userId: 'user-123',
        isReturningUser: true,
        totalConversations: 10,
        daysKnown: 30,
      };

      expect(identity.name).toBe('John');
      expect(identity.isReturningUser).toBe(true);
    });

    it('should define relationship stages', () => {
      const stages: UserAwareness['relationship']['stage'][] = [
        'new',
        'acquaintance',
        'familiar',
        'trusted',
      ];
      expect(stages).toHaveLength(4);
    });

    it('should define relationship fields', () => {
      const relationship: UserAwareness['relationship'] = {
        stage: 'trusted',
        healthScore: 85,
        recentTrend: 'improving',
        lastConversation: 'Discussed morning routine',
        sharedMoments: 15,
      };

      expect(relationship.stage).toBe('trusted');
      expect(relationship.healthScore).toBe(85);
    });

    it('should define emotional fields', () => {
      const emotional: UserAwareness['emotional'] = {
        currentMood: 'happy',
        moodIntensity: 0.8,
        recentMoods: ['happy', 'calm', 'excited'],
        emotionalPatterns: ['morning energy', 'evening calm'],
        needsSupport: false,
      };

      expect(emotional.currentMood).toBe('happy');
      expect(emotional.recentMoods).toHaveLength(3);
    });

    it('should define context fields', () => {
      const context: UserAwareness['context'] = {
        activeGoals: [{ name: 'Exercise more', progress: 60 }],
        recentTopics: ['fitness', 'nutrition'],
        pendingFollowUps: ['Check on workout progress'],
        upcomingEvents: ['Doctor appointment'],
        areasOfGrowth: ['consistency', 'mindfulness'],
      };

      expect(context.activeGoals).toHaveLength(1);
      expect(context.recentTopics).toContain('fitness');
    });

    it('should define preferences', () => {
      const preferences: UserAwareness['preferences'] = {
        communicationStyle: 'gentle',
        preferredPace: 'moderate',
        responsiveness: 'high',
        celebrationStyle: 'big',
      };

      expect(preferences.communicationStyle).toBe('gentle');
      expect(preferences.celebrationStyle).toBe('big');
    });
  });

  describe('ConversationAwareness type', () => {
    it('should define state fields', () => {
      const state: ConversationAwareness['state'] = {
        turnCount: 10,
        sessionDuration: 300,
        currentTopic: 'habits',
        currentMood: 'engaged',
        engagementLevel: 'high',
        mode: 'exploring',
      };

      expect(state.turnCount).toBe(10);
      expect(state.mode).toBe('exploring');
    });

    it('should define all conversation modes', () => {
      const modes: ConversationAwareness['state']['mode'][] = [
        'listening',
        'exploring',
        'advising',
        'supporting',
        'wrapping',
      ];
      expect(modes).toHaveLength(5);
    });

    it('should define history fields', () => {
      const history: ConversationAwareness['history'] = {
        topicsDiscussed: ['habits', 'goals', 'challenges'],
        emotionalJourney: ['curious', 'hopeful', 'determined'],
        toolsUsed: ['createHabit', 'setReminder'],
        keyMoments: ['breakthrough about morning routine'],
        unfinishedThreads: ['sleep schedule discussion'],
      };

      expect(history.topicsDiscussed).toHaveLength(3);
      expect(history.toolsUsed).toContain('createHabit');
    });

    it('should define insights fields', () => {
      const insights: ConversationAwareness['insights'] = {
        patterns: ['tends to procrastinate on weekends'],
        unsaidSignals: ['hesitant about career topic'],
        growthOpportunities: ['morning routine consistency'],
        celebrationOpportunities: ['7-day streak achieved'],
        boundariesToRespect: ['avoid family topics'],
      };

      expect(insights.patterns).toHaveLength(1);
      expect(insights.boundariesToRespect).toContain('avoid family topics');
    });
  });

  describe('TimeAwareness type', () => {
    it('should define time of day values', () => {
      const times: TimeAwareness['now']['timeOfDay'][] = [
        'early_morning',
        'morning',
        'afternoon',
        'evening',
        'late_night',
      ];
      expect(times).toHaveLength(5);
    });

    it('should define now fields', () => {
      const now: TimeAwareness['now'] = {
        timeOfDay: 'morning',
        dayOfWeek: 'Monday',
        isWeekend: false,
        hour: 9,
      };

      expect(now.timeOfDay).toBe('morning');
      expect(now.isWeekend).toBe(false);
    });

    it('should define seasonal fields', () => {
      const seasonal: TimeAwareness['seasonal'] = {
        season: 'summer',
        specialDays: ['July 4th'],
        userSpecificDates: ['birthday: June 15'],
      };

      expect(seasonal.season).toBe('summer');
      expect(seasonal.specialDays).toContain('July 4th');
    });

    it('should define timing fields', () => {
      const timing: TimeAwareness['timing'] = {
        isLateNight: false,
        isGoodTimeForDeepConvo: true,
        suggestedEnergy: 'high',
      };

      expect(timing.isGoodTimeForDeepConvo).toBe(true);
      expect(timing.suggestedEnergy).toBe('high');
    });
  });

  describe('FerniAwarenessContext type', () => {
    it('should define superpowers', () => {
      const context: FerniAwarenessContext = {
        user: {} as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: {} as TimeAwareness,
        superpowers: {
          perfectMemory: true,
          patternRecognition: true,
          emotionalConsistency: true,
          predictiveCare: true,
          boundaryRespect: true,
        },
      };

      expect(context.superpowers.perfectMemory).toBe(true);
      expect(context.superpowers.patternRecognition).toBe(true);
    });
  });

  describe('buildFerniAwareness', () => {
    it('should build context with null profile', async () => {
      const context = await buildFerniAwareness(undefined, null, {});

      expect(context).toBeDefined();
      expect(context.user).toBeDefined();
      expect(context.conversation).toBeDefined();
      expect(context.time).toBeDefined();
      expect(context.superpowers).toBeDefined();
    });

    it('should enable all superpowers', async () => {
      const context = await buildFerniAwareness(undefined, null, {});

      expect(context.superpowers.perfectMemory).toBe(true);
      expect(context.superpowers.patternRecognition).toBe(true);
      expect(context.superpowers.emotionalConsistency).toBe(true);
      expect(context.superpowers.predictiveCare).toBe(true);
      expect(context.superpowers.boundaryRespect).toBe(true);
    });

    it('should handle user profile with name', async () => {
      const profile: Partial<UserProfile> = {
        name: 'Alice',
        totalConversations: 5,
      };

      const context = await buildFerniAwareness(undefined, profile as UserProfile, {});

      expect(context.user.identity.name).toBe('Alice');
      expect(context.user.identity.totalConversations).toBe(5);
    });

    it('should calculate days known from first contact', async () => {
      const profile: Partial<UserProfile> = {
        firstContact: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };

      const context = await buildFerniAwareness(undefined, profile as UserProfile, {});

      expect(context.user.identity.daysKnown).toBeGreaterThanOrEqual(9);
      expect(context.user.identity.daysKnown).toBeLessThanOrEqual(11);
    });

    it('should map relationship stages correctly', async () => {
      const trustedProfile: Partial<UserProfile> = { relationshipStage: 'trusted_advisor' };
      const newProfile: Partial<UserProfile> = { relationshipStage: 'new_acquaintance' };

      const trustedContext = await buildFerniAwareness(
        undefined,
        trustedProfile as UserProfile,
        {}
      );
      const newContext = await buildFerniAwareness(undefined, newProfile as UserProfile, {});

      expect(trustedContext.user.relationship.stage).toBe('trusted');
      expect(newContext.user.relationship.stage).toBe('acquaintance');
    });

    it('should calculate health score based on engagement', async () => {
      const profile: Partial<UserProfile> = {
        totalConversations: 10,
      };

      const context = await buildFerniAwareness(undefined, profile as UserProfile, {});

      // Score = 50 + (totalConversations * 2)
      expect(context.user.relationship.healthScore).toBe(70);
    });

    it('should handle conversation data', async () => {
      const conversationData = {
        turnCount: 15,
        currentTopic: 'habits',
        currentMood: 'excited',
        recentTopics: ['fitness', 'nutrition'],
        keyMoments: ['had a breakthrough'],
      };

      const context = await buildFerniAwareness(undefined, null, conversationData);

      expect(context.conversation.state.turnCount).toBe(15);
      expect(context.conversation.state.currentTopic).toBe('habits');
      expect(context.conversation.history.topicsDiscussed).toContain('fitness');
      expect(context.conversation.history.keyMoments).toContain('had a breakthrough');
    });

    it('should determine engagement level from turn count', async () => {
      const lowEngagement = await buildFerniAwareness(undefined, null, { turnCount: 2 });
      const highEngagement = await buildFerniAwareness(undefined, null, { turnCount: 20 });

      // Low turn count with short duration = low engagement
      // High turn count = high engagement
      expect(highEngagement.conversation.state.engagementLevel).toBe('high');
    });

    it('should determine conversation mode from turn count', async () => {
      const earlyConvo = await buildFerniAwareness(undefined, null, { turnCount: 2 });
      const lateConvo = await buildFerniAwareness(undefined, null, { turnCount: 25 });

      expect(earlyConvo.conversation.state.mode).toBe('listening');
      expect(lateConvo.conversation.state.mode).toBe('wrapping');
    });

    it('should build time awareness', async () => {
      const context = await buildFerniAwareness(undefined, null, {});

      expect(context.time.now.timeOfDay).toBeDefined();
      expect(context.time.now.dayOfWeek).toBeDefined();
      expect(typeof context.time.now.isWeekend).toBe('boolean');
      expect(typeof context.time.now.hour).toBe('number');
    });

    it('should determine season from month', async () => {
      const context = await buildFerniAwareness(undefined, null, {});

      expect(['spring', 'summer', 'fall', 'winter']).toContain(context.time.seasonal.season);
    });
  });

  describe('isGoodMomentForVulnerability', () => {
    it('should return false for new users', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'new' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {
          state: { turnCount: 10, engagementLevel: 'high' },
        } as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(isGoodMomentForVulnerability(context)).toBe(false);
    });

    it('should return false for low turn count', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'trusted' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {
          state: { turnCount: 3, engagementLevel: 'medium' },
        } as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(isGoodMomentForVulnerability(context)).toBe(false);
    });

    it('should return true for late night with established relationship', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'familiar' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {
          state: { turnCount: 10, engagementLevel: 'medium' },
        } as ConversationAwareness,
        time: { timing: { isLateNight: true } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(isGoodMomentForVulnerability(context)).toBe(true);
    });

    it('should return true for high engagement', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'trusted' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {
          state: { turnCount: 10, engagementLevel: 'high' },
        } as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(isGoodMomentForVulnerability(context)).toBe(true);
    });

    it('should return true when user needs support', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'acquaintance' },
          emotional: { needsSupport: true },
        } as UserAwareness,
        conversation: {
          state: { turnCount: 10, engagementLevel: 'medium' },
        } as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(isGoodMomentForVulnerability(context)).toBe(true);
    });
  });

  describe('shouldActivateLateNightMode', () => {
    it('should return true for late night with established relationship', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'familiar' } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: true } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldActivateLateNightMode(context)).toBe(true);
    });

    it('should return false for new users even at late night', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'new' } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: true } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldActivateLateNightMode(context)).toBe(false);
    });

    it('should return false during daytime', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'trusted' } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldActivateLateNightMode(context)).toBe(false);
    });
  });

  describe('shouldSurfacePattern', () => {
    it('should return false for new relationship', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'new' } } as UserAwareness,
        conversation: { state: { turnCount: 15 } } as ConversationAwareness,
        time: {} as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldSurfacePattern(context)).toBe(false);
    });

    it('should return false for acquaintance relationship', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'acquaintance' } } as UserAwareness,
        conversation: { state: { turnCount: 15 } } as ConversationAwareness,
        time: {} as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldSurfacePattern(context)).toBe(false);
    });

    it('should return false for low turn count', () => {
      const context: FerniAwarenessContext = {
        user: { relationship: { stage: 'trusted' } } as UserAwareness,
        conversation: { state: { turnCount: 5 } } as ConversationAwareness,
        time: {} as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(shouldSurfacePattern(context)).toBe(false);
    });

    it('should sometimes return true for trusted with sufficient turns', () => {
      // Run multiple times due to random chance
      const results: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        const context: FerniAwarenessContext = {
          user: { relationship: { stage: 'trusted' } } as UserAwareness,
          conversation: { state: { turnCount: 15 } } as ConversationAwareness,
          time: {} as TimeAwareness,
          superpowers: {} as FerniAwarenessContext['superpowers'],
        };
        results.push(shouldSurfacePattern(context));
      }

      // With 20% chance, we should get some trues
      expect(results).toContain(true);
      expect(results).toContain(false);
    });
  });

  describe('getAppropriateEnergy', () => {
    it('should return calm when user needs support', () => {
      const context: FerniAwarenessContext = {
        user: { emotional: { needsSupport: true, currentMood: undefined } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false, suggestedEnergy: 'high' } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(getAppropriateEnergy(context)).toBe('calm');
    });

    it('should return calm for late night', () => {
      const context: FerniAwarenessContext = {
        user: { emotional: { needsSupport: false, currentMood: undefined } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: true, suggestedEnergy: 'moderate' } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(getAppropriateEnergy(context)).toBe('calm');
    });

    it('should return high when user is excited', () => {
      const context: FerniAwarenessContext = {
        user: { emotional: { needsSupport: false, currentMood: 'excited' } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false, suggestedEnergy: 'moderate' } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(getAppropriateEnergy(context)).toBe('high');
    });

    it('should return time-based suggestion as default', () => {
      const context: FerniAwarenessContext = {
        user: { emotional: { needsSupport: false, currentMood: 'neutral' } } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false, suggestedEnergy: 'moderate' } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      expect(getAppropriateEnergy(context)).toBe('moderate');
    });
  });

  describe('getToolDecisionContext', () => {
    it('should return minimal tool use for new users', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'new' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      const decision = getToolDecisionContext(context);

      expect(decision.shouldUseTools).toBe(false);
      expect(decision.toolStyle).toBe('minimal');
      expect(decision.avoidTools).toContain('calendar');
    });

    it('should return minimal tools for late night', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'trusted' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: true } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      const decision = getToolDecisionContext(context);

      expect(decision.shouldUseTools).toBe(false);
      expect(decision.toolStyle).toBe('minimal');
      expect(decision.suggestedTools).toContain('grounding');
      expect(decision.suggestedTools).toContain('breathing');
    });

    it('should return supportive tools when user needs support', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'familiar' },
          emotional: { needsSupport: true },
        } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      const decision = getToolDecisionContext(context);

      expect(decision.shouldUseTools).toBe(true);
      expect(decision.toolStyle).toBe('reactive');
      expect(decision.suggestedTools).toContain('journaling');
      expect(decision.avoidTools).toContain('productivity');
    });

    it('should return proactive tools for normal situations', () => {
      const context: FerniAwarenessContext = {
        user: {
          relationship: { stage: 'trusted' },
          emotional: { needsSupport: false },
        } as UserAwareness,
        conversation: {} as ConversationAwareness,
        time: { timing: { isLateNight: false } } as TimeAwareness,
        superpowers: {} as FerniAwarenessContext['superpowers'],
      };

      const decision = getToolDecisionContext(context);

      expect(decision.shouldUseTools).toBe(true);
      expect(decision.toolStyle).toBe('proactive');
      expect(decision.avoidTools).toHaveLength(0);
    });
  });
});
