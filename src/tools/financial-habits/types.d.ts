/**
 * Financial Habits Types
 *
 * Type definitions for the financial habits tools.
 * Extracted from financial-habits.ts for clean architecture.
 */
export type { BudgetData, BudgetCategoryData, SavingsGoalData, SubscriptionData, SpendingTriggerData, SpendingLimitData, } from '../../services/stores/financial-store.js';
export interface SpendingCategory {
    name: string;
    amount: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
    isEssential: boolean;
}
//# sourceMappingURL=types.d.ts.map