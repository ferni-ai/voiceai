/**
 * Team Unlock Service Tests
 *
 * Tests for the relationship-based team unlock system:
 * - Member unlock based on relationship stage
 * - Subscription tier overrides
 * - Progress tracking
 * - Backend sync and bypass mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Relationship stage types for proper mocking
type RelationshipStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';

// Mock relationship stage service - vi.hoisted to ensure it's available before vi.mock
const mockStageService = vi.hoisted(() => ({
  getStage: vi.fn((): RelationshipStage => 'first-meeting'),
  getMetrics: vi.fn(() => ({
    totalConversations: 0,
    daysSinceFirstMeeting: 0,
    currentStreak: 0,
    longestStreak: 0,
  })),
  onStageChange: vi.fn(() => () => {}),
}));

vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: mockStageService,
}));

// Setup fetch mock
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  // CRITICAL: Reset module state between tests to prevent state leakage
  _resetForTesting();

  // Reset mock stage service to default values
  mockStageService.getStage.mockReturnValue('first-meeting');
  mockStageService.getMetrics.mockReturnValue({
    totalConversations: 0,
    daysSinceFirstMeeting: 0,
    currentStreak: 0,
    longestStreak: 0,
  });

  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        stage: 'first-meeting',
        tier: 'free',
        unlockedMembers: ['ferni'],
        bypassMode: null,
      }),
  });
});

// Import after mocking
import {
  initTeamUnlockService,
  setSubscriptionTier,
  updateUnlockState,
  getUnlockState,
  isTeamMemberUnlocked,
  isFullTeamUnlocked,
  getMemberStatus,
  getTeamMember,
  getIntroductionMessage,
  onUnlockStateChange,
  onMemberUnlocked,
  onAlmostThere,
  clearNewlyUnlocked,
  getTeamMemberClasses,
  getProgressText,
  resyncWithBackend,
  isBypassModeActive,
  getBypassMode,
  TEAM_MEMBERS,
  _resetForTesting,
  type TeamMemberId,
} from '../../src/services/team-unlock.service.js';

describe('TeamUnlockService', () => {
  describe('TEAM_MEMBERS', () => {
    it('should have all 6 team members', () => {
      expect(TEAM_MEMBERS).toHaveLength(6);
    });

    it('should have correct unlock stages', () => {
      const ferniMember = TEAM_MEMBERS.find((m) => m.id === 'ferni');
      const mayaMember = TEAM_MEMBERS.find((m) => m.id === 'maya-santos');
      const nayanMember = TEAM_MEMBERS.find((m) => m.id === 'nayan-patel');

      expect(ferniMember?.unlocksAt).toBe('first-meeting');
      expect(mayaMember?.unlocksAt).toBe('getting-started');
      expect(nayanMember?.unlocksAt).toBe('deep-partnership');
      expect(nayanMember?.premium).toBe(true);
    });

    it('should have introduction messages for all members', () => {
      for (const member of TEAM_MEMBERS) {
        expect(member.introductionMessage).toBeDefined();
        expect(member.introductionMessage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('initTeamUnlockService', () => {
    it('should initialize with Ferni unlocked', () => {
      localStorageMock.setItem('ferni_user_id', 'test-user');
      initTeamUnlockService();

      expect(isTeamMemberUnlocked('ferni')).toBe(true);
    });

    it('should subscribe to relationship stage changes', () => {
      initTeamUnlockService();

      expect(mockStageService.onStageChange).toHaveBeenCalled();
    });

    it('should load persisted state from localStorage', () => {
      const persistedState = {
        unlockedMembers: ['ferni', 'maya-santos'],
        tier: 'friend',
        almostThereShown: [],
        timestamp: Date.now(),
      };
      localStorageMock.setItem('ferni_team_unlock_state', JSON.stringify(persistedState));

      initTeamUnlockService();

      // Should restore subscription tier
      expect(isTeamMemberUnlocked('maya-santos')).toBe(true);
    });

    it('should ignore expired persisted state', () => {
      const expiredState = {
        unlockedMembers: ['ferni', 'maya-santos'],
        tier: 'free',
        almostThereShown: [],
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      localStorageMock.setItem('ferni_team_unlock_state', JSON.stringify(expiredState));

      initTeamUnlockService();

      // Should not use expired state
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ferni_team_unlock_state');
    });
  });

  describe('setSubscriptionTier', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should update unlock state when tier changes', () => {
      setSubscriptionTier('friend');

      // Friend tier unlocks all non-premium members
      expect(isTeamMemberUnlocked('maya-santos')).toBe(true);
      expect(isTeamMemberUnlocked('peter-john')).toBe(true);
      expect(isTeamMemberUnlocked('alex-chen')).toBe(true);
      expect(isTeamMemberUnlocked('jordan-taylor')).toBe(true);
    });

    it('should not update if tier is the same', () => {
      const listener = vi.fn();
      onUnlockStateChange(listener);

      setSubscriptionTier('free');
      setSubscriptionTier('free');

      // Should only call once (initial + one update)
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should unlock Nayan only for partner tier or deep-partnership', () => {
      setSubscriptionTier('friend');
      expect(isTeamMemberUnlocked('nayan-patel')).toBe(false);

      setSubscriptionTier('partner');
      expect(isTeamMemberUnlocked('nayan-patel')).toBe(true);
    });
  });

  describe('updateUnlockState', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should unlock Maya at getting-started stage', () => {
      mockStageService.getStage.mockReturnValue('getting-started');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 10,
        daysSinceFirstMeeting: 3,
        currentStreak: 5,
        longestStreak: 5,
      });

      updateUnlockState();

      expect(isTeamMemberUnlocked('maya-santos')).toBe(true);
    });

    it('should calculate progress correctly', () => {
      mockStageService.getStage.mockReturnValue('first-meeting');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 5, // 50% of 10 needed
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
      });

      updateUnlockState();

      const mayaStatus = getMemberStatus('maya-santos');
      expect(mayaStatus.progress).toBeGreaterThan(0);
      expect(mayaStatus.progress).toBeLessThan(1);
    });

    it('should track next unlock info', () => {
      mockStageService.getStage.mockReturnValue('first-meeting');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 5,
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
      });

      const state = updateUnlockState();

      expect(state.nextUnlock).toBeDefined();
      expect(state.nextUnlock?.member.id).toBe('maya-santos');
      expect(state.nextUnlock?.conversationsNeeded).toBe(5);
    });

    it('should persist state to localStorage', () => {
      updateUnlockState();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ferni_team_unlock_state',
        expect.any(String)
      );
    });
  });

  describe('isTeamMemberUnlocked', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should always return true for Ferni', () => {
      expect(isTeamMemberUnlocked('ferni')).toBe(true);
    });

    it('should return false for locked members', () => {
      expect(isTeamMemberUnlocked('nayan-patel')).toBe(false);
    });

    it('should respect bypass mode', async () => {
      // Use mockResolvedValue to handle fetchWithRetry retries
      // Need to mock multiple times since fetchWithRetry may retry on initial response
      const bypassResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            bypassMode: 'all',
            tier: 'free',
          }),
      };
      mockFetch
        .mockResolvedValueOnce(bypassResponse)
        .mockResolvedValueOnce(bypassResponse)
        .mockResolvedValueOnce(bypassResponse);

      await resyncWithBackend('test-user');

      expect(isTeamMemberUnlocked('nayan-patel')).toBe(true);
    });
  });

  describe('isFullTeamUnlocked', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should return false for free tier at first-meeting', () => {
      expect(isFullTeamUnlocked()).toBe(false);
    });

    it('should return true for friend tier', () => {
      setSubscriptionTier('friend');
      expect(isFullTeamUnlocked()).toBe(true);
    });

    it('should return true when all core members unlocked', () => {
      mockStageService.getStage.mockReturnValue('established');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 100,
        daysSinceFirstMeeting: 60,
        currentStreak: 30,
        longestStreak: 30,
      });

      updateUnlockState();

      expect(isFullTeamUnlocked()).toBe(true);
    });
  });

  describe('getMemberStatus', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should return unlocked status for Ferni', () => {
      const status = getMemberStatus('ferni');

      expect(status.unlocked).toBe(true);
      expect(status.progress).toBe(1);
    });

    it('should include lock reason for locked members', () => {
      const status = getMemberStatus('maya-santos');

      expect(status.unlocked).toBe(false);
      expect(status.lockReason).toBeDefined();
    });

    it('should include unlock hint', () => {
      const status = getMemberStatus('maya-santos');

      expect(status.unlockHint).toBeDefined();
      expect(status.unlockHint).toContain('10');
    });
  });

  describe('getTeamMember', () => {
    it('should return member config by ID', () => {
      const member = getTeamMember('maya-santos');

      expect(member?.displayName).toBe('Maya');
      expect(member?.role).toBe('Habits Coach');
    });

    it('should return undefined for unknown ID', () => {
      const member = getTeamMember('unknown' as TeamMemberId);

      expect(member).toBeUndefined();
    });
  });

  describe('getIntroductionMessage', () => {
    it('should return introduction message', () => {
      const message = getIntroductionMessage('maya-santos');

      expect(message).toBeDefined();
      expect(message).toContain('Maya');
    });

    it('should return null for unknown member', () => {
      const message = getIntroductionMessage('unknown' as TeamMemberId);

      expect(message).toBeNull();
    });
  });

  describe('onUnlockStateChange', () => {
    it('should call listener immediately with current state', () => {
      initTeamUnlockService();
      const listener = vi.fn();

      onUnlockStateChange(listener);

      expect(listener).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      initTeamUnlockService();
      const listener = vi.fn();

      const unsubscribe = onUnlockStateChange(listener);
      unsubscribe();

      // Trigger update
      updateUnlockState();

      // Should only have been called once (initial)
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('onMemberUnlocked', () => {
    it('should fire when member is newly unlocked', () => {
      initTeamUnlockService();
      const listener = vi.fn();
      onMemberUnlocked(listener);

      // Simulate Maya becoming unlocked
      mockStageService.getStage.mockReturnValue('getting-started');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 10,
        daysSinceFirstMeeting: 3,
        currentStreak: 5,
        longestStreak: 5,
      });

      updateUnlockState();

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'maya-santos' }));
    });
  });

  describe('onAlmostThere', () => {
    it('should fire when progress crosses 80%', () => {
      initTeamUnlockService();
      const listener = vi.fn();
      onAlmostThere(listener);

      // Simulate 80%+ progress
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 8, // 80% of 10
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
      });

      updateUnlockState();

      expect(listener).toHaveBeenCalled();
    });

    it('should only fire once per member', () => {
      initTeamUnlockService();
      const listener = vi.fn();
      onAlmostThere(listener);

      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 8,
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
      });

      updateUnlockState();
      updateUnlockState(); // Second call

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearNewlyUnlocked', () => {
    it('should clear newly unlocked flag', () => {
      initTeamUnlockService();

      // Simulate Maya becoming unlocked
      mockStageService.getStage.mockReturnValue('getting-started');
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 10,
        daysSinceFirstMeeting: 3,
        currentStreak: 5,
        longestStreak: 5,
      });

      updateUnlockState();
      expect(getUnlockState()?.newlyUnlocked).toBe('maya-santos');

      clearNewlyUnlocked();
      expect(getUnlockState()?.newlyUnlocked).toBeNull();
    });
  });

  describe('getTeamMemberClasses', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should return unlocked class for Ferni', () => {
      const classes = getTeamMemberClasses('ferni');

      expect(classes).toContain('team-member--unlocked');
    });

    it('should return locked class for locked members', () => {
      const classes = getTeamMemberClasses('maya-santos');

      expect(classes).toContain('team-member--locked');
    });

    it('should return premium class for Nayan', () => {
      const classes = getTeamMemberClasses('nayan-patel');

      expect(classes).toContain('team-member--premium');
    });

    it('should return almost-unlocked class for high progress', () => {
      mockStageService.getMetrics.mockReturnValue({
        totalConversations: 8,
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
      });
      updateUnlockState();

      const classes = getTeamMemberClasses('maya-santos');

      expect(classes).toContain('team-member--almost-unlocked');
    });
  });

  describe('getProgressText', () => {
    beforeEach(() => {
      initTeamUnlockService();
    });

    it('should return "Unlocked" for unlocked members', () => {
      const text = getProgressText('ferni');

      expect(text).toBe('Unlocked');
    });

    it('should return progress hint for locked members', () => {
      const text = getProgressText('maya-santos');

      expect(text).toContain('more conversation');
    });
  });

  describe('Backend Sync', () => {
    describe('resyncWithBackend', () => {
      it('should fetch unlock state from backend', async () => {
        await resyncWithBackend('test-user');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/relationship/team-unlocks?userId=test-user'),
          expect.any(Object)
        );
      });

      it('should update bypass mode from backend', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              bypassMode: ['maya-santos', 'peter-john'],
              tier: 'free',
            }),
        });

        await resyncWithBackend('test-user');

        expect(getBypassMode()).toEqual(['maya-santos', 'peter-john']);
      });

      it('should handle failed sync gracefully', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

        await expect(resyncWithBackend('test-user')).resolves.not.toThrow();
      });
    });

    describe('isBypassModeActive', () => {
      it('should return false by default', () => {
        expect(isBypassModeActive()).toBe(false);
      });

      it('should return true after bypass mode is set', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              bypassMode: 'all',
            }),
        });

        await resyncWithBackend('test-user');

        expect(isBypassModeActive()).toBe(true);
      });
    });
  });
});
