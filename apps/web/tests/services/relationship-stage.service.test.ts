/**
 * Relationship Stage Service Tests
 *
 * getProgressToNextStage averages the requirements the next stage actually has
 * (conversations, days, streak). A requirement of 0 used to divide 0/0 (NaN),
 * and then counted as already met, so the journey widget showed "67% progress"
 * with zero conversations for the first-meeting -> getting-started step.
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

  it('is 0 with no conversations when the next stage only requires conversations (first-meeting -> getting-started)', async () => {
    const service = await serviceWith('first-meeting', { totalConversations: 0 });

    const { nextStage, progress } = service.getProgressToNextStage();

    expect(nextStage).toBe('getting-started');
    // Days and streak need 0 there, so they are not progress; only conversations (10) count.
    expect(Number.isNaN(progress)).toBe(false);
    expect(progress).toBe(0);
  });

  it('counts partial progress on the one requirement that has a minimum', async () => {
    const service = await serviceWith('first-meeting', { totalConversations: 5 });

    expect(service.getProgressToNextStage().progress).toBeCloseTo(0.5, 5);
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
