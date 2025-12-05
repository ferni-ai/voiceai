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

import { getLogger } from '../utils/safe-logger.js';
import { getDefaultStore, type MemoryStore } from '../memory/index.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// TYPES - Maya's Financial Data
// ============================================================================

export interface MayaFinancialData {
  userId: string;
  lastUpdated: Date;

  // Budgets
  budgets: BudgetData[];

  // Savings Goals
  savingsGoals: SavingsGoalData[];

  // Subscriptions
  subscriptions: SubscriptionData[];

  // Spending Triggers (for behavioral insights)
  spendingTriggers: SpendingTriggerData[];

  // Spending Limits
  spendingLimits: SpendingLimitData[];

  // Weekly Check-ins
  weeklyCheckIns: WeeklyCheckInData[];
}

// Budget Types
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

// Savings Goal Types
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

// Subscription Types
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

// Spending Trigger Types (behavioral tracking)
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

// Spending Limit Types
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

// Weekly Check-In Types
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

// ============================================================================
// MAYA FINANCIAL STORE CLASS
// ============================================================================

class MayaFinancialStore {
  private store: MemoryStore | null = null;
  private cache = new Map<string, MayaFinancialData>();
  private dirtyUsers = new Set<string>();
  private saveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // In-memory stores for fast tool access
  private budgetMemory = new Map<string, BudgetData>();
  private savingsGoalMemory = new Map<string, SavingsGoalData>();
  private subscriptionMemory = new Map<string, SubscriptionData>();
  private spendingTriggerMemory = new Map<string, SpendingTriggerData>();
  private spendingLimitMemory = new Map<string, SpendingLimitData>();
  private weeklyCheckInMemory = new Map<string, WeeklyCheckInData>();

  async initialize(): Promise<void> {
    try {
      this.store = getDefaultStore();
      await this.store.initialize();
      getLogger().info('💰 Maya financial store initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Maya financial store initialization failed - using memory only');
    }
  }

  // ============================================================================
  // LOAD / SAVE USER DATA
  // ============================================================================

  async loadUserData(userId: string): Promise<MayaFinancialData> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached) {
      return cached;
    }

    // Try to load from profile
    if (this.store) {
      try {
        const profile = await this.store.getProfile(userId);
        if (profile) {
          const financialData = (profile as UserProfile & { mayaFinancialData?: MayaFinancialData })
            .mayaFinancialData;

          if (financialData) {
            // Hydrate into memory maps
            this.hydrateMemoryMaps(userId, financialData);
            this.cache.set(userId, financialData);
            getLogger().debug(
              { userId, budgets: financialData.budgets?.length || 0 },
              'Loaded Maya financial data'
            );
            return financialData;
          }
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load Maya financial data');
      }
    }

    // Return empty data
    const emptyData = this.createEmptyData(userId);
    this.cache.set(userId, emptyData);
    return emptyData;
  }

  async saveUserData(userId: string): Promise<void> {
    // Collect all data from memory maps
    const data = this.collectUserData(userId);

    // Update cache
    data.lastUpdated = new Date();
    this.cache.set(userId, data);

    // Persist to profile
    if (this.store) {
      try {
        const profile = await this.store.getProfile(userId);
        if (profile) {
          (profile as UserProfile & { mayaFinancialData?: MayaFinancialData }).mayaFinancialData =
            data;
          await this.store.saveProfile(profile);
          getLogger().debug({ userId }, 'Saved Maya financial data');
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to save Maya financial data');
      }
    }

    this.dirtyUsers.delete(userId);
  }

  // Debounced save - batches rapid updates
  markDirty(userId: string): void {
    this.dirtyUsers.add(userId);

    // Clear existing timer
    const existingTimer = this.saveDebounceTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer - save after 5 seconds of no activity
    const timer = setTimeout(() => {
      this.saveUserData(userId);
      this.saveDebounceTimers.delete(userId);
    }, 5000);

    this.saveDebounceTimers.set(userId, timer);
  }

  // Force save all dirty users (call on shutdown)
  async flushAll(): Promise<void> {
    // Clear all timers
    for (const timer of this.saveDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.saveDebounceTimers.clear();

    // Save all dirty users
    const savePromises = Array.from(this.dirtyUsers).map(async (userId) =>
      this.saveUserData(userId)
    );
    await Promise.all(savePromises);

    getLogger().info({ count: this.dirtyUsers.size }, 'Flushed all Maya financial data');
  }

  // ============================================================================
  // BUDGET OPERATIONS
  // ============================================================================

  getBudget(userId: string, budgetId: string): BudgetData | undefined {
    return Array.from(this.budgetMemory.values()).find(
      (b) => b.id === budgetId && b.userId === userId
    );
  }

  getUserBudgets(userId: string): BudgetData[] {
    return Array.from(this.budgetMemory.values()).filter((b) => b.userId === userId);
  }

  getMainBudget(userId: string): BudgetData | undefined {
    // Return the main budget (first one or one named "Monthly Budget")
    const budgets = this.getUserBudgets(userId);
    return (
      budgets.find((b) => b.name.toLowerCase().includes('monthly')) ||
      budgets.find((b) => b.name.toLowerCase().includes('main')) ||
      budgets[0]
    );
  }

  setBudget(userId: string, budget: BudgetData): void {
    budget.updatedAt = new Date().toISOString();
    this.budgetMemory.set(budget.id, budget);
    this.markDirty(userId);
  }

  deleteBudget(userId: string, budgetId: string): boolean {
    const budget = this.getBudget(userId, budgetId);
    if (budget) {
      this.budgetMemory.delete(budgetId);
      this.markDirty(userId);
      return true;
    }
    return false;
  }

  // ============================================================================
  // SAVINGS GOAL OPERATIONS
  // ============================================================================

  getSavingsGoal(userId: string, goalId: string): SavingsGoalData | undefined {
    return Array.from(this.savingsGoalMemory.values()).find(
      (g) => g.id === goalId && g.userId === userId
    );
  }

  getUserSavingsGoals(userId: string): SavingsGoalData[] {
    return Array.from(this.savingsGoalMemory.values()).filter((g) => g.userId === userId);
  }

  getActiveSavingsGoals(userId: string): SavingsGoalData[] {
    return this.getUserSavingsGoals(userId).filter((g) => g.status === 'active');
  }

  getEmergencyFund(userId: string): SavingsGoalData | undefined {
    return this.getUserSavingsGoals(userId).find((g) => g.isEmergencyFund);
  }

  setSavingsGoal(userId: string, goal: SavingsGoalData): void {
    goal.updatedAt = new Date().toISOString();
    this.savingsGoalMemory.set(goal.id, goal);
    this.markDirty(userId);
  }

  updateSavingsProgress(userId: string, goalId: string, newAmount: number): SavingsGoalData | null {
    const goal = this.getSavingsGoal(userId, goalId);
    if (!goal) return null;

    goal.currentAmount = newAmount;
    if (newAmount >= goal.targetAmount) {
      goal.status = 'completed';
    }
    goal.updatedAt = new Date().toISOString();

    this.savingsGoalMemory.set(goalId, goal);
    this.markDirty(userId);

    return goal;
  }

  deleteSavingsGoal(userId: string, goalId: string): boolean {
    const goal = this.getSavingsGoal(userId, goalId);
    if (goal) {
      this.savingsGoalMemory.delete(goalId);
      this.markDirty(userId);
      return true;
    }
    return false;
  }

  // ============================================================================
  // SUBSCRIPTION OPERATIONS
  // ============================================================================

  getSubscription(userId: string, subId: string): SubscriptionData | undefined {
    return Array.from(this.subscriptionMemory.values()).find(
      (s) => s.id === subId && s.userId === userId
    );
  }

  getUserSubscriptions(userId: string): SubscriptionData[] {
    return Array.from(this.subscriptionMemory.values()).filter((s) => s.userId === userId);
  }

  getActiveSubscriptions(userId: string): SubscriptionData[] {
    return this.getUserSubscriptions(userId).filter((s) => s.isActive);
  }

  getUnusedSubscriptions(userId: string): SubscriptionData[] {
    return this.getUserSubscriptions(userId).filter((s) => s.isActive && s.usefulness === 'unused');
  }

  setSubscription(userId: string, sub: SubscriptionData): void {
    sub.updatedAt = new Date().toISOString();
    this.subscriptionMemory.set(sub.id, sub);
    this.markDirty(userId);
  }

  updateSubscriptionUsefulness(
    userId: string,
    subId: string,
    usefulness: SubscriptionData['usefulness']
  ): SubscriptionData | null {
    const sub = this.getSubscription(userId, subId);
    if (!sub) return null;

    sub.usefulness = usefulness;
    sub.updatedAt = new Date().toISOString();

    this.subscriptionMemory.set(subId, sub);
    this.markDirty(userId);

    return sub;
  }

  deleteSubscription(userId: string, subId: string): boolean {
    const sub = this.getSubscription(userId, subId);
    if (sub) {
      this.subscriptionMemory.delete(subId);
      this.markDirty(userId);
      return true;
    }
    return false;
  }

  // ============================================================================
  // SPENDING TRIGGER OPERATIONS
  // ============================================================================

  addSpendingTrigger(userId: string, trigger: SpendingTriggerData): void {
    this.spendingTriggerMemory.set(trigger.id, trigger);
    this.markDirty(userId);
  }

  getUserSpendingTriggers(userId: string): SpendingTriggerData[] {
    return Array.from(this.spendingTriggerMemory.values()).filter((t) => t.userId === userId);
  }

  getRecentSpendingTriggers(userId: string, limit = 10): SpendingTriggerData[] {
    return this.getUserSpendingTriggers(userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getSpendingTriggersByEmotion(userId: string): Record<string, SpendingTriggerData[]> {
    const triggers = this.getUserSpendingTriggers(userId);
    return triggers.reduce(
      (acc, t) => {
        if (!acc[t.emotion]) acc[t.emotion] = [];
        acc[t.emotion].push(t);
        return acc;
      },
      {} as Record<string, SpendingTriggerData[]>
    );
  }

  // ============================================================================
  // SPENDING LIMIT OPERATIONS
  // ============================================================================

  getSpendingLimit(userId: string, limitId: string): SpendingLimitData | undefined {
    return Array.from(this.spendingLimitMemory.values()).find(
      (l) => l.id === limitId && l.userId === userId
    );
  }

  getSpendingLimitByCategory(userId: string, category: string): SpendingLimitData | undefined {
    return Array.from(this.spendingLimitMemory.values()).find(
      (l) => l.userId === userId && l.category.toLowerCase() === category.toLowerCase()
    );
  }

  getUserSpendingLimits(userId: string): SpendingLimitData[] {
    return Array.from(this.spendingLimitMemory.values()).filter((l) => l.userId === userId);
  }

  setSpendingLimit(userId: string, limit: SpendingLimitData): void {
    limit.updatedAt = new Date().toISOString();
    this.spendingLimitMemory.set(limit.id, limit);
    this.markDirty(userId);
  }

  logSpendAgainstLimit(userId: string, category: string, amount: number): SpendingLimitData | null {
    const limit = this.getSpendingLimitByCategory(userId, category);
    if (!limit) return null;

    // Check if we need to reset weekly/monthly totals
    const now = new Date();
    const lastWeekReset = new Date(limit.lastWeekReset);
    const lastMonthReset = new Date(limit.lastMonthReset);

    // Reset weekly if it's been more than 7 days
    if (now.getTime() - lastWeekReset.getTime() > 7 * 24 * 60 * 60 * 1000) {
      limit.currentWeekSpend = 0;
      limit.lastWeekReset = now.toISOString();
    }

    // Reset monthly if we're in a new month
    if (
      now.getMonth() !== lastMonthReset.getMonth() ||
      now.getFullYear() !== lastMonthReset.getFullYear()
    ) {
      limit.currentMonthSpend = 0;
      limit.lastMonthReset = now.toISOString();
    }

    // Add the spend
    limit.currentWeekSpend += amount;
    limit.currentMonthSpend += amount;
    limit.updatedAt = now.toISOString();

    this.spendingLimitMemory.set(limit.id, limit);
    this.markDirty(userId);

    return limit;
  }

  deleteSpendingLimit(userId: string, limitId: string): boolean {
    const limit = this.getSpendingLimit(userId, limitId);
    if (limit) {
      this.spendingLimitMemory.delete(limitId);
      this.markDirty(userId);
      return true;
    }
    return false;
  }

  // ============================================================================
  // WEEKLY CHECK-IN OPERATIONS
  // ============================================================================

  addWeeklyCheckIn(userId: string, checkIn: WeeklyCheckInData): void {
    this.weeklyCheckInMemory.set(checkIn.id, checkIn);
    this.markDirty(userId);
  }

  getUserWeeklyCheckIns(userId: string): WeeklyCheckInData[] {
    return Array.from(this.weeklyCheckInMemory.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => {
        // Sort by year then week number, descending
        if (a.year !== b.year) return b.year - a.year;
        return b.weekNumber - a.weekNumber;
      });
  }

  getLatestWeeklyCheckIn(userId: string): WeeklyCheckInData | undefined {
    const checkIns = this.getUserWeeklyCheckIns(userId);
    return checkIns[0];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private createEmptyData(userId: string): MayaFinancialData {
    return {
      userId,
      lastUpdated: new Date(),
      budgets: [],
      savingsGoals: [],
      subscriptions: [],
      spendingTriggers: [],
      spendingLimits: [],
      weeklyCheckIns: [],
    };
  }

  private hydrateMemoryMaps(userId: string, data: MayaFinancialData): void {
    // Hydrate budgets
    for (const budget of data.budgets || []) {
      this.budgetMemory.set(budget.id, budget);
    }

    // Hydrate savings goals
    for (const goal of data.savingsGoals || []) {
      this.savingsGoalMemory.set(goal.id, goal);
    }

    // Hydrate subscriptions
    for (const sub of data.subscriptions || []) {
      this.subscriptionMemory.set(sub.id, sub);
    }

    // Hydrate spending triggers
    for (const trigger of data.spendingTriggers || []) {
      this.spendingTriggerMemory.set(trigger.id, trigger);
    }

    // Hydrate spending limits
    for (const limit of data.spendingLimits || []) {
      this.spendingLimitMemory.set(limit.id, limit);
    }

    // Hydrate weekly check-ins
    for (const checkIn of data.weeklyCheckIns || []) {
      this.weeklyCheckInMemory.set(checkIn.id, checkIn);
    }
  }

  private collectUserData(userId: string): MayaFinancialData {
    return {
      userId,
      lastUpdated: new Date(),
      budgets: Array.from(this.budgetMemory.values()).filter((b) => b.userId === userId),
      savingsGoals: Array.from(this.savingsGoalMemory.values()).filter((g) => g.userId === userId),
      subscriptions: Array.from(this.subscriptionMemory.values()).filter(
        (s) => s.userId === userId
      ),
      spendingTriggers: Array.from(this.spendingTriggerMemory.values()).filter(
        (t) => t.userId === userId
      ),
      spendingLimits: Array.from(this.spendingLimitMemory.values()).filter(
        (l) => l.userId === userId
      ),
      weeklyCheckIns: Array.from(this.weeklyCheckInMemory.values()).filter(
        (c) => c.userId === userId
      ),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let mayaFinancialStoreInstance: MayaFinancialStore | null = null;

export function getMayaFinancialStore(): MayaFinancialStore {
  if (!mayaFinancialStoreInstance) {
    mayaFinancialStoreInstance = new MayaFinancialStore();
    // Initialize asynchronously
    mayaFinancialStoreInstance.initialize().catch((error) => {
      getLogger().error({ error }, 'Failed to initialize Maya financial store');
    });
  }
  return mayaFinancialStoreInstance;
}

// Export the store class for testing
export { MayaFinancialStore };
