/**
 * TEAM_BY_NEED in the app: when GET /api/relationship/team-unlocks says teamByNeed, every
 * teammate is on the team bar for a brand-new free user. Nobody is locked, nobody has a
 * lock reason or progress hint, and nobody gets an "unlocked!" celebration (they were
 * always there). Without the field, the same user sees the relationship locks as before.
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
  'first-meeting' | 'getting-started' | 'building-trust' | 'established' | 'deep-partnership';

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

  // clearAllMocks keeps queued mockResolvedValueOnce values; drop them so
  // one test's unused responses can't leak into the next.
  mockFetch.mockReset();
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
  getMemberStatus,
  getTeamMemberClasses,
  getUnlockState,
  initTeamUnlockService,
  isFullTeamUnlocked,
  isTeamMemberUnlocked,
  onMemberUnlocked,
  resyncWithBackend,
  TEAM_MEMBERS,
  _resetForTesting,
} from '../../src/services/team-unlock.service.js';

/** The server's answer for a brand-new free user, with or without TEAM_BY_NEED. */
function serverSays(teamByNeed: boolean | undefined): void {
  const response = {
    ok: true,
    json: () =>
      Promise.resolve({
        stage: 'first-meeting',
        tier: 'free',
        unlockedMembers: ['ferni'],
        bypassMode: null,
        ...(teamByNeed === undefined ? {} : { teamByNeed }),
      }),
  };
  mockFetch.mockResolvedValue(response);
}

const teammates = TEAM_MEMBERS.map((m) => m.id).filter((id) => id !== 'ferni');

describe('team bar with TEAM_BY_NEED', () => {
  it('shows every teammate available to a brand-new free user: no lock, no reason', async () => {
    serverSays(true);
    initTeamUnlockService('new-user');
    const celebrated = vi.fn();
    onMemberUnlocked(celebrated);
    await resyncWithBackend('new-user');

    for (const id of teammates) {
      expect(isTeamMemberUnlocked(id), id).toBe(true);
      expect(getTeamMemberClasses(id), id).not.toContain('team-member--locked');
      expect(getMemberStatus(id).lockReason, id).toBeUndefined();
      expect(getUnlockState()?.unlockedMembers.has(id), id).toBe(true);
    }
    expect(isFullTeamUnlocked()).toBe(true);
    expect(getUnlockState()?.nextUnlock).toBeNull();
    // Always on the team, never "unlocked"
    expect(celebrated).not.toHaveBeenCalled();
  });

  it('keeps the locks when the server says nothing about it (flag off)', async () => {
    serverSays(undefined);
    initTeamUnlockService('new-user');
    await resyncWithBackend('new-user');

    for (const id of teammates) {
      expect(isTeamMemberUnlocked(id), id).toBe(false);
      expect(getTeamMemberClasses(id), id).toContain('team-member--locked');
    }
    expect(isFullTeamUnlocked()).toBe(false);
  });

  it('locks again when the server turns it off', async () => {
    serverSays(true);
    await resyncWithBackend('new-user');
    expect(isTeamMemberUnlocked('nayan-patel')).toBe(true);
    serverSays(false);
    await resyncWithBackend('new-user');
    expect(isTeamMemberUnlocked('nayan-patel')).toBe(false);
  });
});
