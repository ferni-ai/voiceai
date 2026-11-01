/**
 * Maya's and Alex's briefings say only what the member's own data holds
 * (#3044): nothing at all for a member with no data, and lines that match the
 * data for a member with some. Fictional members and numbers throughout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => ({
  productivity: {} as Record<string, unknown>,
  goals: [] as Array<Record<string, unknown>>,
  loads: [] as string[],
  moodLogs: [] as Array<{ date: string; mood: number; energy: number }>,
  calendarConnected: false,
  windows: vi.fn(async () => [
    {
      date: new Date('2026-11-03T09:00:00Z'),
      startHour: 9,
      endHour: 11,
      quality: 'ideal',
      reason: 'free',
    },
  ]),
}));

vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => {
      data.loads.push('productivity');
    },
    // Empty until loaded, like the real cache.
    getFullUserData: () => (data.loads.includes('productivity') ? data.productivity : {}),
    getUserHabits: () => [],
    getUserHabitLogs: () => [],
  }),
}));
vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => {
      data.loads.push('financial');
    },
    getUserSavingsGoals: () => (data.loads.includes('financial') ? data.goals : []),
    getActiveSavingsGoals: () => (data.loads.includes('financial') ? data.goals : []),
    getUserSpendingTriggers: () => [],
    getRecentSpendingTriggers: () => [],
    getMainBudget: () => undefined,
  }),
}));
vi.mock('../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => data.moodLogs }),
}));
vi.mock('../../../../services/calendar/index.js', () => ({
  hasAnyProviderConnected: async () => data.calendarConnected,
}));
vi.mock('../../../../services/superhuman/milestone-calendar-coordinator.js', () => ({
  detectMilestoneConflicts: async () => [],
  findOptimalMilestoneWindows: data.windows,
}));
vi.mock('../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getActiveBlockers: async () => [],
}));
// Producers outside these builders; their own truthfulness is not under test here.
vi.mock('../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));
vi.mock('../../../../services/superhuman/index.js', () => ({
  buildCommunicationIntelligenceContext: async () => '',
  buildHabitOptimizationContext: async () => '',
  buildHabitEconomicsContext: async () => '',
  buildBiometricHabitContext: async () => '',
  buildExperimentationContext: async () => '',
}));
vi.mock('../alex-communication-insights/superhuman-context.js', () => ({
  buildAlexSuperhumanContext: async () => ({ contextString: '' }),
  processTranscriptForSuperhuman: async () => ({}),
}));
vi.mock('../../../../services/cross-persona/observation-recorder.js', () => {
  const observer = { concern: vi.fn(), pattern: vi.fn(), opportunity: vi.fn(), milestone: vi.fn() };
  return { maya: observer, alex: observer };
});

import { buildAlexCommunicationInsightsContext } from '../alex-communication-insights/index.js';
import { buildMayaCoachingInsightsContext } from '../maya-coaching-insights/index.js';

const input = (personaId: string, member: string) =>
  ({
    services: { userId: member, sessionId: `call-${member}`, personaId },
    userData: { turnCount: 0 },
  }) as never;

const text = (injections: Array<{ content: string }>) =>
  injections.map((i) => i.content).join('\n');

/** Every number in the briefing, so a test can say which ones the fixture holds. */
const numbers = (s: string) => s.match(/\d+/g) ?? [];

const habit = {
  id: 'h-1',
  name: 'Evening walk',
  isActive: true,
  isPaused: false,
  currentStreak: 4,
  longestStreak: 4,
  successRate: 0.75,
  totalCompletions: 12,
  isKeystone: false,
};

beforeEach(() => {
  data.productivity = {};
  data.goals = [];
  data.loads = [];
  data.moodLogs = [];
  data.calendarConnected = false;
  data.windows.mockClear();
});

describe('Maya briefing', () => {
  it('a member with no data gets nothing (no 0/100 dashboard, no "consistency needs support")', async () => {
    expect(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0101'))).toEqual([]);
  });

  it('habits only in productivityData.habits (the voice tool store) still say nothing about habits', async () => {
    // createHabit writes `habits`; Maya reads `enhancedHabits`. One store is lane S6.
    data.productivity = { habits: [{ id: 'x', name: 'Stretch' }], enhancedHabits: [] };
    expect(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0102'))).toEqual([]);
  });

  it('a member with a habit gets lines that match it, loaded before reading', async () => {
    data.productivity = { enhancedHabits: [habit], weeklyReflections: [] };
    const out = text(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0103')));

    expect(data.loads).toContain('productivity');
    expect(out).toContain('Active habits: 1');
    expect(out).toContain('Total completions: 12');
    expect(out).toContain('Success rate: 75%');
    expect(out).not.toMatch(/Consistency Index|Momentum Score|needs support/);
    // The fixture's numbers, turn 0, and the coaching principle "2 minutes or less".
    const allowed = new Set(['0', '1', '2', '4', '12', '75']);
    expect(numbers(out).filter((n) => !allowed.has(n))).toEqual([]);
  });
});

describe('Alex briefing', () => {
  it('a member with no data gets nothing (no metrics dashboard, no server-clock "time context")', async () => {
    expect(await buildAlexCommunicationInsightsContext(input('alex-chen', 'member-0201'))).toEqual(
      []
    );
  });

  it('a goal due in 5 days shows up, with no calendar windows when no calendar is connected', async () => {
    const deadline = new Date(Date.now() + 4.5 * 24 * 60 * 60 * 1000).toISOString();
    data.goals = [
      { id: 'g-1', name: 'Lease deposit', targetAmount: 1500, currentAmount: 600, deadline },
    ];
    const out = text(
      await buildAlexCommunicationInsightsContext(input('alex-chen', 'member-0202'))
    );

    expect(data.loads).toContain('financial');
    expect(out).toContain('Lease deposit deadline in 5 days');
    expect(out).not.toMatch(/Readiness:|Calendar Density|Time context|PROTECTED FOCUS|protecting/);
    expect(data.windows).not.toHaveBeenCalled();
  });

  it('with a connected calendar the free windows come back', async () => {
    data.calendarConnected = true;
    const deadline = new Date(Date.now() + 4.5 * 24 * 60 * 60 * 1000).toISOString();
    data.goals = [
      { id: 'g-1', name: 'Lease deposit', targetAmount: 1500, currentAmount: 600, deadline },
    ];
    const out = text(
      await buildAlexCommunicationInsightsContext(input('alex-chen', 'member-0203'))
    );
    expect(data.windows).toHaveBeenCalled();
    expect(out).toContain('PROTECTED FOCUS WINDOWS');
  });
});

describe('no best hour of day from the server clock (#3070 round 1)', () => {
  // On a UTC server a 21:00 ET mood log reads as 01:00, so "Best window: morning" was false.
  const lateEveningLogs = () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return [
      { date: `${yesterday}T01:00:00Z`, mood: 8, energy: 9 },
      { date: `${yesterday}T01:30:00Z`, mood: 8, energy: 9 },
    ];
  };

  it('Alex says no "Best window" for a member with mood logs', async () => {
    vi.stubEnv('TZ', 'UTC');
    data.moodLogs = lateEveningLogs();
    data.goals = [{ id: 'g-1', name: 'Lease deposit', targetAmount: 1500, currentAmount: 600 }];
    const out = text(
      await buildAlexCommunicationInsightsContext(input('alex-chen', 'member-0204'))
    );
    expect(out).not.toMatch(/Best (communication )?window|morning|afternoon|evening/i);
    vi.unstubAllEnvs();
  });

  it('Maya says no "Best time for challenges" for a member with mood logs', async () => {
    vi.stubEnv('TZ', 'UTC');
    data.moodLogs = lateEveningLogs();
    data.productivity = { enhancedHabits: [habit], weeklyReflections: [] };
    const out = text(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0104')));
    expect(out).toContain('MOOD INTELLIGENCE'); // the mood logs were read
    expect(out).not.toMatch(/Best time|Best energy|: (morning|afternoon|evening)\b/);
    vi.unstubAllEnvs();
  });
});
