/**
 * Jordan's and Nayan's briefings say only what the member's own data holds
 * (#3044): nothing for a member with no data, and lines that match the data
 * for a member with some. Fictional members and numbers throughout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => ({
  goals: [] as Array<Record<string, unknown>>,
  loads: [] as string[],
  calendarConnected: false,
  coordination: vi.fn(async () => '**Current Capacity:** light'),
  calendarLoad: vi.fn(async () => ({
    weeklyMeetingHours: 0,
    consecutiveOverloadedDays: 0,
    weeklyFocusTimeRatio: 1,
    lightestDayThisWeek: 'Monday',
  })),
}));

vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => {
      data.loads.push('productivity');
    },
    getFullUserData: () => ({ enhancedHabits: [], weeklyReflections: [] }),
  }),
}));
vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => {
      data.loads.push('financial');
    },
    getActiveSavingsGoals: () => (data.loads.includes('financial') ? data.goals : []),
    getUserSavingsGoals: () => (data.loads.includes('financial') ? data.goals : []),
    getUserSpendingTriggers: () => [],
    getRecentSpendingTriggers: () => [],
    getMainBudget: () => undefined,
  }),
}));
vi.mock('../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => [] }),
}));
vi.mock('../../../../services/calendar/index.js', () => ({
  hasAnyProviderConnected: async () => data.calendarConnected,
}));
vi.mock('../../../../services/calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: data.calendarLoad,
}));
vi.mock('../../../../services/calendar/ambient-calendar-awareness.js', () => ({
  getAmbientCalendarContext: async () => ({
    nextMeeting: { minutesUntil: null },
    justEndedMeeting: { event: null },
  }),
}));
vi.mock('../../../../services/superhuman/milestone-calendar-coordinator.js', () => ({
  getCoordinationContext: data.coordination,
}));
vi.mock('../../../../services/milestones/milestone-calendar-sync.js', () => ({
  buildMilestoneCalendarContext: async () => null,
}));
vi.mock('../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getRecentWins: async () => [],
}));
// Producers outside these builders; their own truthfulness is not under test here.
vi.mock('../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));
vi.mock('../../../../services/superhuman/index.js', () => ({
  buildLifeTrajectoryContext: async () => '',
  buildContemplativeContext: async () => '',
  buildDevelopmentalContext: async () => '',
}));
vi.mock('../../../../services/superhuman/wisdom-intelligence-services.js', () => ({
  buildNayanWisdomContext: async () => '',
}));
vi.mock('../../../../services/cross-persona/observation-recorder.js', () => {
  const observer = { insight: vi.fn(), pattern: vi.fn(), opportunity: vi.fn(), milestone: vi.fn() };
  return { jordan: observer, nayan: observer, recordConcern: vi.fn() };
});

import { buildJordanMilestoneInsightsContext } from '../jordan-milestone-insights/index.js';
import { buildNayanWisdomInsightsContext } from '../nayan-wisdom-insights/index.js';

const input = (personaId: string, member: string) =>
  ({
    services: { userId: member, sessionId: `call-${member}`, personaId },
    userData: { turnCount: 0 },
  }) as never;

const text = (injections: Array<{ content: string }>) =>
  injections.map((i) => i.content).join('\n');

const inDays = (days: number) => new Date(Date.now() + (days - 0.5) * 86_400_000).toISOString();

beforeEach(() => {
  data.goals = [];
  data.loads = [];
  data.calendarConnected = false;
  data.coordination.mockClear();
  data.calendarLoad.mockClear();
});

describe('Jordan briefing', () => {
  it('a member with no data gets nothing (no "(Real Data)" 50/100s, no "$0 saved", no seasons)', async () => {
    expect(
      await buildJordanMilestoneInsightsContext(input('jordan-taylor', 'member-0301'))
    ).toEqual([]);
    expect(data.coordination).not.toHaveBeenCalled();
  });

  it('a member with a dated goal gets lines that match it', async () => {
    data.goals = [
      {
        id: 'g-1',
        name: 'Kayak trip',
        targetAmount: 900,
        currentAmount: 300,
        deadline: inDays(20),
      },
    ];
    const out = text(
      await buildJordanMilestoneInsightsContext(input('jordan-taylor', 'member-0302'))
    );

    expect(data.loads).toContain('financial');
    expect(out).toContain('Active goals: 1');
    expect(out).toContain('Total saved: $300');
    expect(out).toContain('Kayak trip (20d)');
    expect(out).not.toMatch(/Real Data|Velocity Index|Season:|wedding season|Mother's Day/i);
    // No calendar connected: no coordination read off an empty calendar.
    expect(data.coordination).not.toHaveBeenCalled();
  });

  it('with a connected calendar, coordination gets the member’s dated goals (not [])', async () => {
    data.calendarConnected = true;
    data.goals = [
      { id: 'g-1', name: 'Kayak trip', targetAmount: 900, currentAmount: 300, deadline: inDays(5) },
    ];
    await buildJordanMilestoneInsightsContext(input('jordan-taylor', 'member-0303'));
    expect(data.coordination).toHaveBeenCalledWith('member-0303', [
      expect.objectContaining({ name: 'Kayak trip', importance: 'high' }),
    ]);
  });
});

describe('Nayan briefing', () => {
  it('a member with no data gets nothing (no fallow season, no calendar, no scores)', async () => {
    expect(await buildNayanWisdomInsightsContext(input('nayan-patel', 'member-0401'))).toEqual([]);
    expect(data.calendarLoad).not.toHaveBeenCalled();
  });

  it('a member with a goal gets their chapter, and no claims about habits, a calendar or a season', async () => {
    data.goals = [
      {
        id: 'g-1',
        name: 'Emergency fund',
        targetAmount: 3000,
        currentAmount: 2000,
        deadline: inDays(60),
      },
    ];
    const out = text(await buildNayanWisdomInsightsContext(input('nayan-patel', 'member-0402')));

    expect(data.loads).toEqual(expect.arrayContaining(['productivity', 'financial']));
    expect(out).toContain('Life chapter: foundation-building');
    expect(out).not.toMatch(
      /resting|fallow|composting|Calendar intensity|WISDOM METRICS|Inner Peace|Mortality|Season:|Past chapter|unknown/i
    );
  });
});
