/**
 * A user with no budget and no savings goals must never be told their spending is
 * "mindful" or their budget is "on track": those claims need a budget / goals to exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  budget: null as { spent: number; monthlyLimit: number } | null,
  goals: [] as Array<{ currentAmount: number; targetAmount: number; deadline?: string }>,
  habits: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getActiveSavingsGoals: () => state.goals,
    getMainBudget: () => state.budget,
    getRecentSpendingTriggers: () => [],
  }),
}));
vi.mock('../../stores/productivity-store.js', () => ({
  getProductivityStore: () => ({ getFullUserData: () => ({ enhancedHabits: state.habits }) }),
}));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    set: () => undefined,
    setImmediate: async () => undefined,
    load: async () => null,
  }),
}));
vi.mock('../insights-broadcast.js', () => ({ insightsBroadcast: { publishInsight: () => {} } }));
vi.mock('../../superhuman/index.js', () => ({
  loadUserCommitments: async () => [],
  assessBurnoutRisk: async () => null,
  findDormantDreams: async () => [],
  findUpcomingDates: async () => [],
}));

import {
  formatInsightBriefingForPrompt,
  generateTeamStatus,
  getInsightsForPersona,
  scanForCrossPersonaInsights,
} from '../cross-persona-insights.js';
import { budgetStatusLabel, emptyFinancialHealth } from '../financial-health-status.js';

let n = 0;
const nextUser = () => `fin-health-user-${++n}`;

const activeHabit = {
  isActive: true,
  isPaused: false,
  currentStreak: 3,
  longestStreak: 3,
  isKeystone: false,
};

describe('financial health is only claimed when a budget / goals exist', () => {
  beforeEach(() => {
    state.budget = null;
    state.goals = [];
    state.habits = [activeHabit];
  });

  it('reports no budget and no on-track savings for a user with neither', async () => {
    const status = await generateTeamStatus(nextUser());
    expect(status.financialHealth.hasBudget).toBe(false);
    expect(status.financialHealth.savingsOnTrack).toBe(false);
  });

  it('reports a real budget and on-track goals when they exist', async () => {
    state.budget = { spent: 10, monthlyLimit: 100 };
    state.goals = [{ currentAmount: 50, targetAmount: 100 }];
    const status = await generateTeamStatus(nextUser());
    expect(status.financialHealth.hasBudget).toBe(true);
    expect(status.financialHealth.budgetUsedPercent).toBe(10);
    expect(status.financialHealth.savingsOnTrack).toBe(true);
  });

  it('overall-wellness insight does not say spending is mindful without a budget', async () => {
    const userId = nextUser();
    await scanForCrossPersonaInsights(userId);
    const wellness = getInsightsForPersona(userId, 'ferni').find(
      (i) => i.insight.category === 'overall-wellness'
    );
    expect(wellness).toBeDefined();
    expect(wellness!.insight.summary).toMatch(/habits are on track/i);
    expect(wellness!.insight.summary).not.toMatch(/spending|mindful|budget/i);
  });

  it('overall-wellness insight keeps the spending claim when a budget is healthy', async () => {
    state.budget = { spent: 10, monthlyLimit: 100 };
    const userId = nextUser();
    await scanForCrossPersonaInsights(userId);
    const wellness = getInsightsForPersona(userId, 'ferni').find(
      (i) => i.insight.category === 'overall-wellness'
    );
    expect(wellness!.insight.summary).toMatch(/spending is mindful/i);
  });

  it('prompt briefing says no budget is set instead of "0% used"', async () => {
    const teamStatus = await generateTeamStatus(nextUser());
    const text = formatInsightBriefingForPrompt({
      incomingInsights: [],
      teamStatus,
      proactiveDiscoveries: [],
    });
    expect(text).toContain('Budget: none set');
    expect(text).not.toContain('0% used');
  });

  it('budgetStatusLabel is silent with neither budget nor goals', () => {
    const health = emptyFinancialHealth();
    expect(budgetStatusLabel(health, 0)).toBeNull();
    expect(budgetStatusLabel({ ...health, hasBudget: true, budgetUsedPercent: 20 }, 0)).toBe(
      '✅ On track'
    );
    expect(budgetStatusLabel({ ...health, hasBudget: true, budgetUsedPercent: 95 }, 0)).toBe(
      '⚠️ Needs attention'
    );
    expect(budgetStatusLabel(health, 1)).toBe('⚠️ Needs attention');
  });
});
