/**
 * Peter's briefing says only what the member's own data holds (#3044, PR C3).
 * Unlike his teammates' builders his runs unflagged, on every call that starts
 * with Peter: it printed "YOUR COMPUTED METRICS (Real Data)" over scores made
 * from defaults (Decision Quality Index 50/100 with no data), plus server-clock
 * "time of day" lore and framework lines with invented numbers. Fictional
 * members and numbers throughout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => ({
  productivity: {} as Record<string, unknown>,
  goals: [] as Array<Record<string, unknown>>,
  budget: undefined as Record<string, unknown> | undefined,
  moodLogs: [] as Array<{ date: string; mood: number; energy: number }>,
  loads: [] as string[],
  calendarConnected: false,
  calendarLoad: vi.fn(async () => ({
    weeklyMeetingHours: 12,
    weeklyFocusTimeRatio: 0.4,
    lightestDayThisWeek: 'Thursday',
  })),
  pattern: vi.fn(),
}));

vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => {
      data.loads.push('productivity');
    },
    // Empty until loaded, like the real cache.
    getFullUserData: () => (data.loads.includes('productivity') ? data.productivity : {}),
  }),
}));
vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => {
      data.loads.push('financial');
    },
    getMainBudget: () => (data.loads.includes('financial') ? data.budget : undefined),
    getActiveSavingsGoals: () => (data.loads.includes('financial') ? data.goals : []),
  }),
}));
vi.mock('../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => data.moodLogs }),
}));
vi.mock('../../../../memory/orchestrator.js', () => ({
  getMemoryOrchestrator: () => ({
    getMemoryHealth: async () => ({
      totalMemories: 0,
      recentMemories: 0,
      emotionalMemories: 0,
      commitments: 0,
    }),
  }),
}));
vi.mock('../../../../services/calendar/index.js', () => ({
  hasAnyProviderConnected: async () => data.calendarConnected,
}));
vi.mock('../../../../services/calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: data.calendarLoad,
}));
vi.mock('../../../../services/calendar/ambient-calendar-awareness.js', () => ({
  getAmbientCalendarContext: async () => ({
    nextMeeting: { event: null, minutesUntil: null },
    justEndedMeeting: { event: null },
  }),
}));
vi.mock('../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getPendingDecisions: async () => [],
}));
// Producers outside this builder; their own truthfulness is not under test here.
vi.mock('../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));
vi.mock('../../../../services/superhuman/index.js', () => ({
  buildCausalInferenceContext: async () => '',
  buildFinancialPatternContext: async () => '',
}));
vi.mock('../../../../services/cross-persona/observation-recorder.js', () => ({
  peter: { pattern: data.pattern, insight: vi.fn(), concern: vi.fn() },
}));

import { buildPeterResearchInsightsContext } from '../peter-research-insights/index.js';

const input = (member: string) =>
  ({
    services: { userId: member, sessionId: `call-${member}`, personaId: 'peter-john' },
    userData: { turnCount: 0 },
  }) as never;

const text = (injections: Array<{ content: string }>) =>
  injections.map((i) => i.content).join('\n');

/** Every number in the briefing, so a test can say which ones the fixture holds. */
const numbers = (s: string) => s.match(/\d+/g) ?? [];

const fixture = () => {
  data.productivity = {
    enhancedHabits: [
      {
        name: 'Morning pages',
        isActive: true,
        isPaused: false,
        currentStreak: 4,
        longestStreak: 4,
        successRate: 0.75,
        totalCompletions: 12,
        isKeystone: false,
      },
    ],
  };
  // Half the limit spent on the 15th: on pace, so no pace line; top category 40%, no share line.
  data.budget = {
    spent: 1000,
    monthlyLimit: 2000,
    categories: [
      { name: 'Groceries', spent: 400, limit: 500 },
      { name: 'Dining', spent: 300, limit: 250 },
      { name: 'Transit', spent: 300, limit: 300 },
    ],
  };
  data.goals = [{ id: 'g-1', name: 'Bike fund', targetAmount: 1000, currentAmount: 600 }];
  data.moodLogs = [
    { date: '2026-11-14T15:00:00Z', mood: 7, energy: 6 },
    { date: '2026-11-15T09:00:00Z', mood: 7, energy: 6 },
  ];
};

beforeEach(() => {
  // A Monday morning on the 15th: the old clock lore ("Peak decision-making window",
  // "Monday: Fresh start energy") would print now if it came back.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T10:00:00'));
  data.productivity = {};
  data.goals = [];
  data.budget = undefined;
  data.moodLogs = [];
  data.loads = [];
  data.calendarConnected = false;
  data.calendarLoad.mockClear();
  data.pattern.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Peter briefing', () => {
  it('a member with no data gets nothing: no "(Real Data)" header and no metric line', async () => {
    const out = await buildPeterResearchInsightsContext(input('member-fictional-0301'));

    expect(text(out)).not.toMatch(/Real Data|Decision Quality|Habit Formation Velocity/);
    expect(text(out)).not.toMatch(/Motivation Sustainability|Financial Stress/);
    expect(out).toEqual([]);
    expect(data.loads).toEqual(expect.arrayContaining(['productivity', 'financial']));
  });

  it('with fixture data every printed number is the fixture’s, and nothing claims more', async () => {
    vi.setSystemTime(new Date('2026-11-15T10:00:00'));
    fixture();
    const out = text(await buildPeterResearchInsightsContext(input('member-fictional-0302')));

    expect(out).toContain('Active habits: 1');
    expect(out).toContain('Success rate: 75%');
    expect(out).toContain('Total completions: 12');
    expect(out).toContain('Morning pages (4d)');
    expect(out).toContain('over budget in 1 categories: Dining');
    expect(out).toContain('"Bike fund" is at 60%');
    expect(out).toContain('Average energy: 3.0/5');
    expect(out).not.toMatch(/Real Data|Decision Quality|Velocity|Sustainability|Stress Level/);
    expect(out).not.toMatch(/portfolio|your accounts|invest|trading|pre-market/i);
    expect(out).not.toMatch(/Calendar load|Best day/); // no calendar connected
    // Fixture values and what they directly give: 1 habit and 1 category over its
    // limit, 4-day streak, 12 completions, 75% = 0.75, 60% = 600 of 1000, energy
    // 6 on the 10-point log = 3.0 on the 5-point scale. 0 is the turn number.
    const allowed = new Set(['0', '1', '3', '4', '5', '12', '60', '75']);
    expect(numbers(out).filter((n) => !allowed.has(n))).toEqual([]);
    // The only team observation recorded is the real over-budget one, no framework template.
    expect(data.pattern.mock.calls.map((call) => call[1])).toEqual([
      expect.stringMatching(/^Anomaly detected: User is over budget in 1 categories: Dining/),
    ]);
  });

  it('calendar lines need a connected calendar', async () => {
    fixture();
    await buildPeterResearchInsightsContext(input('member-fictional-0303'));
    expect(data.calendarLoad).not.toHaveBeenCalled();

    data.calendarConnected = true;
    const out = text(await buildPeterResearchInsightsContext(input('member-fictional-0304')));
    expect(out).toContain('Best day for deep research: Thursday');
    expect(out).not.toMatch(/Focus time|\d+h available/); // assumed a 40-hour week
  });
});
