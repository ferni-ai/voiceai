/**
 * Financial Habits Helpers
 *
 * Helper functions for financial analysis.
 * Extracted from financial-habits.ts for clean architecture.
 */

import { getFinancialStore, type BudgetData } from '../../services/stores/financial-store.js';
import type { SpendingCategory } from './types.js';

// ============================================================================
// SPENDING ANALYSIS HELPERS
// ============================================================================

/**
 * Analyze spending from budget data
 */
export function analyzeSpendingFromBudget(budget: BudgetData | undefined): SpendingCategory[] {
  if (!budget) return [];

  return budget.categories.map((cat) => ({
    name: cat.name,
    amount: cat.spent,
    percentage: budget.spent > 0 ? Math.round((cat.spent / budget.spent) * 100) : 0,
    trend: cat.spent > cat.limit ? 'up' : cat.spent < cat.limit * 0.8 ? 'down' : 'stable',
    isEssential: cat.isEssential || ['Housing', 'Food', 'Transport'].includes(cat.name),
  }));
}

/**
 * Find spending leaks from user's financial data
 */
export function findSpendingLeaksFromStore(userId: string): string[] {
  const store = getFinancialStore();
  const leaks: string[] = [];

  // Check subscriptions
  const unusedSubs = store.getUnusedSubscriptions(userId);
  if (unusedSubs.length > 0) {
    const total = unusedSubs.reduce((sum, s) => sum + s.amount, 0);
    leaks.push(`${unusedSubs.length} unused subscriptions costing $${total.toFixed(2)}/month`);
  }

  // Check budget overages
  const budget = store.getMainBudget(userId);
  if (budget) {
    const overCategories = budget.categories.filter((c) => c.spent > c.limit);
    for (const cat of overCategories) {
      leaks.push(`${cat.name} is $${(cat.spent - cat.limit).toFixed(2)} over budget`);
    }
  }

  return leaks;
}
