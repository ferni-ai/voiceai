/**
 * Financial Habits Helpers
 *
 * Helper functions for financial analysis.
 * Extracted from financial-habits.ts for clean architecture.
 */
import { type BudgetData } from '../../services/stores/financial-store.js';
import type { SpendingCategory } from './types.js';
/**
 * Analyze spending from budget data
 */
export declare function analyzeSpendingFromBudget(budget: BudgetData | undefined): SpendingCategory[];
/**
 * Find spending leaks from user's financial data
 */
export declare function findSpendingLeaksFromStore(userId: string): string[];
//# sourceMappingURL=helpers.d.ts.map