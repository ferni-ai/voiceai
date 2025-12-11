/**
 * Financial Habits Types
 *
 * Type definitions for the financial habits tools.
 * Extracted from financial-habits.ts for clean architecture.
 */

// Re-export store types for convenience
export type {
  BudgetData,
  BudgetCategoryData,
  SavingsGoalData,
  SubscriptionData,
  SpendingTriggerData,
  SpendingLimitData,
} from '../../services/financial-store.js';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

export interface SpendingCategory {
  name: string;
  amount: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  isEssential: boolean;
}
