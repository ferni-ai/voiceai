/**
 * Financial Prediction Service
 *
 * Builds on Plaid integration to provide "Better than Human" financial foresight.
 *
 * Superhuman Capabilities:
 * - Cash flow forecasting (bills, income timing)
 * - Spending pattern anomaly detection
 * - Subscription creep identification
 * - Savings goal progress with predictions
 * - Proactive money stress awareness
 *
 * @module services/finance/prediction
 */
export interface Bill {
    name: string;
    amount: number;
    dueDate: Date;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
    category: string;
    isRecurring: boolean;
    confidence: number;
}
export interface IncomeSource {
    name: string;
    amount: number;
    nextExpected: Date;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    confidence: number;
}
export interface CashFlowForecast {
    currentBalance: number;
    projectedBalance: number;
    daysOut: number;
    inflows: Array<{
        date: Date;
        amount: number;
        source: string;
    }>;
    outflows: Array<{
        date: Date;
        amount: number;
        description: string;
    }>;
    warnings: CashFlowWarning[];
    projectedLow: {
        date: Date;
        balance: number;
    };
}
export interface CashFlowWarning {
    type: 'low_balance' | 'overdraft_risk' | 'large_bill' | 'unusual_timing';
    severity: 'info' | 'warning' | 'alert';
    message: string;
    date: Date;
    amount?: number;
}
export interface SpendingAnomaly {
    type: 'spike' | 'unusual_merchant' | 'category_increase' | 'time_anomaly';
    description: string;
    amount: number;
    percentAboveNormal: number;
    category?: string;
    merchant?: string;
    date: Date;
}
export interface SubscriptionCreep {
    totalMonthly: number;
    previousMonthly: number;
    changePercent: number;
    subscriptions: Array<{
        name: string;
        amount: number;
        firstSeen: Date;
        status: 'active' | 'new' | 'cancelled';
    }>;
    newSubscriptions: Array<{
        name: string;
        amount: number;
        firstSeen: Date;
    }>;
    potentialSavings: number;
    unusedSuggestions: string[];
}
export interface SavingsGoal {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: Date;
    monthlyContribution: number;
}
export interface GoalProgress {
    goal: SavingsGoal;
    percentComplete: number;
    onTrack: boolean;
    projectedCompletion: Date;
    monthlyNeeded: number;
    surplus: number;
    message: string;
}
export interface FinancialInsight {
    type: 'cash_flow' | 'anomaly' | 'subscription' | 'goal' | 'stress';
    severity: 'info' | 'warning' | 'alert';
    insight: string;
    suggestion?: string;
    data?: Record<string, unknown>;
}
/**
 * Detect recurring bills from transaction history
 */
export declare function detectBills(userId: string): Promise<Bill[]>;
/**
 * Detect recurring income from transaction history
 */
export declare function detectIncome(userId: string): Promise<IncomeSource[]>;
/**
 * Predict cash flow for upcoming days
 */
export declare function predictCashFlow(userId: string, daysOut?: number): Promise<CashFlowForecast | null>;
/**
 * Detect unusual spending patterns
 */
export declare function detectAnomalies(userId: string): Promise<SpendingAnomaly[]>;
/**
 * Detect subscription services and creep over time
 */
export declare function detectSubscriptionCreep(userId: string): Promise<SubscriptionCreep | null>;
/**
 * Create a savings goal
 */
export declare function createSavingsGoal(userId: string, name: string, targetAmount: number, targetDate: Date, currentAmount?: number): SavingsGoal;
/**
 * Update progress on a savings goal
 */
export declare function updateGoalProgress(userId: string, goalId: string, newAmount: number): GoalProgress | null;
/**
 * Generate financial insight for context injection
 */
export declare function generateFinancialInsight(userId: string): Promise<FinancialInsight | null>;
/**
 * Generate superhuman financial moment
 */
export declare function generateSuperhumanMoment(userId: string): string | null;
declare const _default: {
    detectBills: typeof detectBills;
    detectIncome: typeof detectIncome;
    predictCashFlow: typeof predictCashFlow;
    detectAnomalies: typeof detectAnomalies;
    detectSubscriptionCreep: typeof detectSubscriptionCreep;
    createSavingsGoal: typeof createSavingsGoal;
    updateGoalProgress: typeof updateGoalProgress;
    generateFinancialInsight: typeof generateFinancialInsight;
    generateSuperhumanMoment: typeof generateSuperhumanMoment;
};
export default _default;
//# sourceMappingURL=prediction.d.ts.map