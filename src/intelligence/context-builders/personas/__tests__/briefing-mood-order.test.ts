/**
 * getMoodLogs returns a member's mood logs newest first. Peter's and Maya's
 * briefings must still show the newest log as the latest and read the trend
 * forwards in time (#3044, PR C3 round 2): read as given, a mood that rose from
 * 2 to 9 showed as "last logged: low" and "declining". Fictional members and
 * numbers throughout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => ({
  moodLogs: [] as Array<{ date: string; mood: number; energy: number }>,
}));

vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getFullUserData: () => ({}),
    getUserHabits: () => [],
    getUserHabitLogs: () => [],
  }),
}));
vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getMainBudget: () => undefined,
    getActiveSavingsGoals: () => [],
    getUserSavingsGoals: () => [],
    getUserSpendingTriggers: () => [],
    getRecentSpendingTriggers: () => [],
  }),
}));
// As the real store returns them: orderBy('date', 'desc').
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
  hasAnyProviderConnected: async () => false,
}));
vi.mock('../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getPendingDecisions: async () => [],
  getActiveBlockers: async () => [],
}));
// Producers outside these builders; their own truthfulness is not under test here.
vi.mock('../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));
vi.mock('../../../../services/superhuman/index.js', () => ({
  buildCausalInferenceContext: async () => '',
  buildFinancialPatternContext: async () => '',
  buildHabitOptimizationContext: async () => '',
  buildHabitEconomicsContext: async () => '',
  buildBiometricHabitContext: async () => '',
  buildExperimentationContext: async () => '',
}));
vi.mock('../../../../services/cross-persona/observation-recorder.js', () => ({
  peter: { pattern: vi.fn(), insight: vi.fn(), concern: vi.fn() },
}));

import { buildMayaCoachingInsightsContext } from '../maya-coaching-insights/index.js';
import { buildPeterResearchInsightsContext } from '../peter-research-insights/index.js';

const input = (personaId: string, member: string) =>
  ({
    services: { userId: member, sessionId: `call-${member}`, personaId },
    userData: { turnCount: 0 },
  }) as never;

const text = (injections: Array<{ content: string }>) =>
  injections.map((i) => i.content).join('\n');

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Four logs, NEWEST first, with mood and energy going from `from` to `to` over two weeks. */
const newestFirst = (from: number, to: number) => {
  const step = (to - from) / 3;
  return [1, 4, 9, 13].map((days, i) => {
    const value = Math.round(to - step * i);
    return { date: daysAgo(days), mood: value, energy: value };
  });
};

beforeEach(() => {
  data.moodLogs = [];
});

describe('Peter reads mood logs in time order', () => {
  it('a mood rising from 2 to 9: last logged is the newest, and the trend is improving', async () => {
    data.moodLogs = newestFirst(2, 9);
    const out = text(await buildPeterResearchInsightsContext(input('peter-john', 'member-0401')));

    expect(out).toContain('Last logged: Mood high, Energy high');
    expect(out).toContain('Mood trend (last two weeks): improving');
    expect(out).not.toMatch(/declining|extra care/i);
  });

  it('a mood falling from 9 to 2: last logged is low, and the trend is declining', async () => {
    data.moodLogs = newestFirst(9, 2);
    const out = text(await buildPeterResearchInsightsContext(input('peter-john', 'member-0402')));

    expect(out).toContain('Last logged: Mood low, Energy low');
    expect(out).toContain('Mood trend (last two weeks): declining');
    expect(out).toContain('Declining mood trend detected - approach with extra care');
  });
});

describe('Maya reads mood logs in time order', () => {
  it('a mood rising from 2 to 9: current state is the newest, and the trend is improving', async () => {
    data.moodLogs = newestFirst(2, 9);
    const out = text(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0403')));

    expect(out).toContain('Current: high mood, high energy');
    expect(out).toContain('Trend: improving');
    expect(out).not.toMatch(/declining/i);
  });

  it('a mood falling from 9 to 2: current state is low, and the trend is declining', async () => {
    data.moodLogs = newestFirst(9, 2);
    const out = text(await buildMayaCoachingInsightsContext(input('maya-santos', 'member-0404')));

    expect(out).toContain('Current: low mood, low energy');
    expect(out).toContain('Trend: declining');
  });
});
