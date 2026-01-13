/**
 * Maya Financial Store
 *
 * Persistent storage for Maya's financial wellness tools:
 * - Budgets and budget categories
 * - Savings goals
 * - Subscriptions
 * - Spending triggers and patterns
 * - Spending limits
 *
 * Integrates with existing Firestore infrastructure and user profiles.
 * All data is user-scoped and persists across sessions.
 */
export interface MayaFinancialData {
    userId: string;
    lastUpdated: Date;
    budgets: BudgetData[];
    savingsGoals: SavingsGoalData[];
    subscriptions: SubscriptionData[];
    spendingTriggers: SpendingTriggerData[];
    spendingLimits: SpendingLimitData[];
    weeklyCheckIns: WeeklyCheckInData[];
}
export interface BudgetData {
    id: string;
    userId: string;
    name: string;
    monthlyLimit: number;
    spent: number;
    remaining: number;
    categories: BudgetCategoryData[];
    createdAt: string;
    updatedAt: string;
}
export interface BudgetCategoryData {
    name: string;
    limit: number;
    spent: number;
    color: string;
    isEssential: boolean;
}
export interface SavingsGoalData {
    id: string;
    userId: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string;
    monthlyContribution: number;
    priority: 'high' | 'medium' | 'low';
    isEmergencyFund: boolean;
    status: 'active' | 'paused' | 'completed';
    createdAt: string;
    updatedAt: string;
}
export interface SubscriptionData {
    id: string;
    userId: string;
    name: string;
    amount: number;
    frequency: 'weekly' | 'monthly' | 'yearly';
    category: string;
    lastCharged?: string;
    nextCharge?: string;
    isActive: boolean;
    usefulness: 'essential' | 'nice-to-have' | 'unused' | 'unknown';
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface SpendingTriggerData {
    id: string;
    userId: string;
    timestamp: string;
    purchase: string;
    amount: number;
    emotion: string;
    situation: string;
    regretLevel: string;
    notes?: string;
}
export interface SpendingLimitData {
    id: string;
    userId: string;
    category: string;
    weeklyLimit?: number;
    monthlyLimit?: number;
    alertAtPercent: number;
    currentWeekSpend: number;
    currentMonthSpend: number;
    lastWeekReset: string;
    lastMonthReset: string;
    createdAt: string;
    updatedAt: string;
}
export interface WeeklyCheckInData {
    id: string;
    userId: string;
    weekNumber: number;
    year: number;
    timestamp: string;
    wins: string[];
    challenges: string[];
    upcomingExpenses: string[];
    totalSpent?: number;
    totalSaved?: number;
    notes?: string;
}
declare class MayaFinancialStore {
    private store;
    private cache;
    private dirtyUsers;
    private saveDebounceTimers;
    private budgetMemory;
    private savingsGoalMemory;
    private subscriptionMemory;
    private spendingTriggerMemory;
    private spendingLimitMemory;
    private weeklyCheckInMemory;
    initialize(): Promise<void>;
    loadUserData(userId: string): Promise<MayaFinancialData>;
    saveUserData(userId: string): Promise<void>;
    markDirty(userId: string): void;
    flushAll(): Promise<void>;
    getBudget(userId: string, budgetId: string): BudgetData | undefined;
    getUserBudgets(userId: string): BudgetData[];
    getMainBudget(userId: string): BudgetData | undefined;
    setBudget(userId: string, budget: BudgetData): void;
    deleteBudget(userId: string, budgetId: string): boolean;
    getSavingsGoal(userId: string, goalId: string): SavingsGoalData | undefined;
    getUserSavingsGoals(userId: string): SavingsGoalData[];
    getActiveSavingsGoals(userId: string): SavingsGoalData[];
    getEmergencyFund(userId: string): SavingsGoalData | undefined;
    setSavingsGoal(userId: string, goal: SavingsGoalData): void;
    updateSavingsProgress(userId: string, goalId: string, newAmount: number): SavingsGoalData | null;
    deleteSavingsGoal(userId: string, goalId: string): boolean;
    getSubscription(userId: string, subId: string): SubscriptionData | undefined;
    getUserSubscriptions(userId: string): SubscriptionData[];
    getActiveSubscriptions(userId: string): SubscriptionData[];
    getUnusedSubscriptions(userId: string): SubscriptionData[];
    setSubscription(userId: string, sub: SubscriptionData): void;
    updateSubscriptionUsefulness(userId: string, subId: string, usefulness: SubscriptionData['usefulness']): SubscriptionData | null;
    deleteSubscription(userId: string, subId: string): boolean;
    addSpendingTrigger(userId: string, trigger: SpendingTriggerData): void;
    getUserSpendingTriggers(userId: string): SpendingTriggerData[];
    getRecentSpendingTriggers(userId: string, limit?: number): SpendingTriggerData[];
    getSpendingTriggersByEmotion(userId: string): Record<string, SpendingTriggerData[]>;
    getSpendingLimit(userId: string, limitId: string): SpendingLimitData | undefined;
    getSpendingLimitByCategory(userId: string, category: string): SpendingLimitData | undefined;
    getUserSpendingLimits(userId: string): SpendingLimitData[];
    setSpendingLimit(userId: string, limit: SpendingLimitData): void;
    logSpendAgainstLimit(userId: string, category: string, amount: number): SpendingLimitData | null;
    deleteSpendingLimit(userId: string, limitId: string): boolean;
    addWeeklyCheckIn(userId: string, checkIn: WeeklyCheckInData): void;
    getUserWeeklyCheckIns(userId: string): WeeklyCheckInData[];
    getLatestWeeklyCheckIn(userId: string): WeeklyCheckInData | undefined;
    private createEmptyData;
    private hydrateMemoryMaps;
    private collectUserData;
}
export declare function getFinancialStore(): MayaFinancialStore;
/**
 * Initialize the Maya Financial Store (for lifecycle management)
 */
export declare function initializeMayaFinancialStore(): Promise<void>;
/**
 * Shutdown the Maya Financial Store (for lifecycle management)
 */
export declare function shutdownMayaFinancialStore(): Promise<void>;
export { MayaFinancialStore };
//# sourceMappingURL=financial-store.d.ts.map