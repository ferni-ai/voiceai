/**
 * Relationship Stage Service Tests
 *
 * getProgressToNextStage averages three requirements (conversations, days,
 * streak). A requirement of 0 used to divide 0/0, so progress was NaN for the
 * first-meeting -> getting-started step (minDays and minStreak are 0 there).
 * Then the 0 requirements were counted as met, so a brand-new user saw 67%.
 * Only requirements with a minimum above 0 count towards the average.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'ferni_relationship';

type Metrics = {
  totalConversations: number;
  daysSinceFirstMeeting: number;
  currentStreak: number;
  longestStreak: number;
};

/** Load a fresh service whose stored relationship data has the given stage and metrics. */
async function serviceWith(stage: string, metrics: Partial<Metrics>) {
  const now = new Date().toISOString();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      stage,
      firstMeetingDate: now,
      metrics: {
        totalConversations: 0,
        daysSinceFirstMeeting: 0,
        currentStreak: 0,
        longestStreak: 0,
        milestonesReached: 0,
        insightsShared: 0,
        lastConversation: null,
        ...metrics,
      },
      memories: [],
      lastUpdated: now,
    })
  );
  vi.resetModules();
  const { relationshipStageService } = await import('../../src/services/relationship-stage.service');
  return relationshipStageService;
}

describe('RelationshipStageService.getProgressToNextStage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is finite when the next stage has zero-valued requirements (first-meeting -> getting-started)', async () => {
    const service = await serviceWith('first-meeting', { totalConversations: 0 });

    const { nextStage, progress } = service.getProgressToNextStage();

    expect(nextStage).toBe('getting-started');
    // Only the conversations requirement (10) exists; days and streak need 0.
    expect(Number.isNaN(progress)).toBe(false);
    expect(progress).toBe(0);
  });

  it('shows 0% progress for a new user with no conversations, not 67%', async () => {
    const service = await serviceWith('first-meeting', {
      totalConversations: 0,
      daysSinceFirstMeeting: 0,
      currentStreak: 0,
      longestStreak: 0,
    });

    expect(Math.round(service.getProgressToNextStage().progress * 100)).toBe(0);
  });

  it('counts partial progress on the one requirement that has a minimum', async () => {
    const service = await serviceWith('first-meeting', { totalConversations: 5 });

    expect(service.getProgressToNextStage().progress).toBeCloseTo(0.5, 5);
  });

  it('ignores days and streak that the next stage does not require', async () => {
    const service = await serviceWith('first-meeting', {
      totalConversations: 0,
      daysSinceFirstMeeting: 40,
      currentStreak: 10,
    });

    expect(service.getProgressToNextStage().progress).toBe(0);
  });

  it('feature unlock progress is finite and 0 for a new user', async () => {
    const service = await serviceWith('first-meeting', {});

    const { isUnlocked, progress } = service.getFeatureUnlockProgress('relationship-progress');

    expect(isUnlocked).toBe(false);
    expect(progress).toBe(0);
  });

  it('still averages all three requirements when none are zero (getting-started -> building-trust)', async () => {
    const service = await serviceWith('getting-started', {
      totalConversations: 10,
      daysSinceFirstMeeting: 0,
      currentStreak: 0,
    });

    // building-trust needs 15 conversations, 5 days, a 3-day streak.
    expect(service.getProgressToNextStage().progress).toBeCloseTo(10 / 15 / 3, 5);
  });

  it('is 1 at the deepest stage', async () => {
    const service = await serviceWith('deep-partnership', {});

    expect(service.getProgressToNextStage()).toMatchObject({ nextStage: null, progress: 1 });
  });
});
