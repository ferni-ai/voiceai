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
  budget: undefined as { spent: number; monthlyLimit: number } | undefined,
  jordanHandoff: null as Record<string, unknown> | null,
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
    getMainBudget: () => (data.loads.includes('financial') ? data.budget : undefined),
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
// The handoff signal is tested in tools/handoff; here only what Jordan prints for one.
vi.mock('../jordan-milestone-insights/handoff-analysis.js', () => ({
  analyzeHandoffForJordan: () => data.jordanHandoff,
}));
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
  data.budget = undefined;
  data.jordanHandoff = null;
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

describe('Jordan handoff briefing', () => {
  it("shows the handing-off persona's notes, not Peter's financial list", async () => {
    data.budget = { spent: 1800, monthlyLimit: 3000 };
    data.jordanHandoff = {
      topic: 'trip planning',
      planningContext: null,
      excitementLevel: 'medium',
      actionItems: [],
      emotionalWeight: 0,
      previousPersonaInsights: ['Maya noted: walks most mornings'],
    };
    const out = text(
      await buildJordanMilestoneInsightsContext(input('jordan-taylor', 'member-0304'))
    );

    const start = out.indexOf('=== HANDOFF CONTEXT ===');
    const handoff = out.slice(start, out.indexOf('\n=== ', start + 1));
    expect(handoff).toContain('Maya noted: walks most mornings');
    expect(handoff).not.toContain('Budget at 60%');
    // Peter's budget line is real and belongs once, in his own section.
    expect(out.split('Budget at 60%').length - 1).toBe(1);
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

  it('an unmatched goal and no budget or habits: no values gap, no catch-all theme', async () => {
    data.goals = [
      {
        id: 'g-1',
        name: 'Canoe fund',
        targetAmount: 2400,
        currentAmount: 900,
        deadline: inDays(13),
      },
    ];
    const out = text(await buildNayanWisdomInsightsContext(input('nayan-patel', 'member-0403')));
    expect(out).toContain('Life chapter: active-growth');
    expect(out).not.toMatch(
      /values not yet clear|Becoming who they are meant to be|Dominant theme/
    );
  });

  it('a budget that shows no values does give the values gap', async () => {
    data.budget = { spent: 2400, monthlyLimit: 3000 }; // 80%: neither saving nor overspending
    data.goals = [
      {
        id: 'g-1',
        name: 'Canoe fund',
        targetAmount: 2400,
        currentAmount: 900,
        deadline: inDays(13),
      },
    ];
    const out = text(await buildNayanWisdomInsightsContext(input('nayan-patel', 'member-0404')));
    expect(out).toContain('values not yet clear through action');
  });
});
