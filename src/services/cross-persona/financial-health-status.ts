/**
 * Financial health slice of the cross-team status (Peter's domain).
 *
 * Kept out of cross-persona-insights.ts so a missing budget or missing goals is never
 * reported as a healthy one: `hasBudget` says whether `budgetUsedPercent` is a real
 * measurement, and `savingsOnTrack` is only true when the user actually has goals.
 *
 * @module services/cross-persona/financial-health-status
 */

import type { getFinancialStore } from '../stores/financial-store.js';

type FinancialStore = ReturnType<typeof getFinancialStore>;

export interface FinancialHealth {
  /** False when the user has no budget; budgetUsedPercent is then a placeholder 0 */
  hasBudget: boolean;
  budgetUsedPercent: number;
  recentStressTriggers: number;
  /** True only when the user has savings goals and they are on track (false with none) */
  savingsOnTrack: boolean;
}

const STRESS_EMOTIONS = ['stressed', 'anxious', 'bored', 'lonely', 'tired'];
const DAY_MS = 1000 * 60 * 60 * 24;

export function emptyFinancialHealth(): FinancialHealth {
  return { hasBudget: false, budgetUsedPercent: 0, recentStressTriggers: 0, savingsOnTrack: false };
}

export function computeFinancialHealth(
  store: FinancialStore,
  userId: string,
  goals: ReturnType<FinancialStore['getActiveSavingsGoals']>
): FinancialHealth {
  const health = emptyFinancialHealth();

  const budget = store.getMainBudget(userId);
  if (budget) {
    health.hasBudget = true;
    health.budgetUsedPercent = Math.round((budget.spent / budget.monthlyLimit) * 100);
  }

  health.recentStressTriggers = store
    .getRecentSpendingTriggers(userId, 14)
    .filter((t) => STRESS_EMOTIONS.includes(t.emotion)).length;

  const now = new Date();
  const goalsOnTrack = goals.filter((g) => {
    if (!g.deadline) return true;
    const progress = g.currentAmount / g.targetAmount;
    const created = new Date(g.createdAt || now).getTime();
    const daysTotal = Math.ceil((new Date(g.deadline).getTime() - created) / DAY_MS);
    const daysElapsed = Math.ceil((now.getTime() - created) / DAY_MS);
    return progress >= (daysElapsed / daysTotal) * 0.8;
  });
  // With no goals there is nothing to be on track for
  health.savingsOnTrack = goals.length > 0 && goalsOnTrack.length >= goals.length * 0.7;

  return health;
}

/**
 * One-line budget/savings verdict for prompts, or null when the user has neither a budget
 * nor goals (so there is nothing real to call "on track").
 */
export function budgetStatusLabel(health: FinancialHealth, activeGoals: number): string | null {
  if (!health.hasBudget && activeGoals === 0) return null;
  const budgetOk = !health.hasBudget || health.budgetUsedPercent < 90;
  const savingsOk = activeGoals === 0 || health.savingsOnTrack;
  return budgetOk && savingsOk ? '✅ On track' : '⚠️ Needs attention';
}
