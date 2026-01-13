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
import { getDefaultStore } from '../../memory/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { onBudgetChange, onSavingsGoalChange, onSubscriptionChange, } from '../data-layer/store-hooks.js';
import { recordFinancialSignal } from '../data-layer/domain-signals.js';
// ============================================================================
// MAYA FINANCIAL STORE CLASS
// ============================================================================
class MayaFinancialStore {
    store = null;
    cache = new Map();
    dirtyUsers = new Set();
    saveDebounceTimers = new Map();
    // In-memory stores for fast tool access
    budgetMemory = new Map();
    savingsGoalMemory = new Map();
    subscriptionMemory = new Map();
    spendingTriggerMemory = new Map();
    spendingLimitMemory = new Map();
    weeklyCheckInMemory = new Map();
    async initialize() {
        try {
            this.store = getDefaultStore();
            await this.store.initialize();
            getLogger().info('💰 Maya financial store initialized');
        }
        catch (error) {
            getLogger().warn({ error }, 'Maya financial store initialization failed - using memory only');
        }
    }
    // ============================================================================
    // LOAD / SAVE USER DATA
    // ============================================================================
    async loadUserData(userId) {
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
                    const financialData = profile
                        .mayaFinancialData;
                    if (financialData) {
                        // Hydrate into memory maps
                        this.hydrateMemoryMaps(userId, financialData);
                        this.cache.set(userId, financialData);
                        getLogger().debug({ userId, budgets: financialData.budgets?.length || 0 }, 'Loaded Maya financial data');
                        return financialData;
                    }
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to load Maya financial data');
            }
        }
        // Return empty data
        const emptyData = this.createEmptyData(userId);
        this.cache.set(userId, emptyData);
        return emptyData;
    }
    async saveUserData(userId) {
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
                    profile.mayaFinancialData =
                        data;
                    await this.store.saveProfile(profile);
                    getLogger().debug({ userId }, 'Saved Maya financial data');
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to save Maya financial data');
            }
        }
        this.dirtyUsers.delete(userId);
    }
    // Debounced save - batches rapid updates
    markDirty(userId) {
        this.dirtyUsers.add(userId);
        // Clear existing timer
        const existingTimer = this.saveDebounceTimers.get(userId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Set new timer - save after 5 seconds of no activity
        const timer = setTimeout(() => {
            void this.saveUserData(userId);
            this.saveDebounceTimers.delete(userId);
        }, 5000);
        this.saveDebounceTimers.set(userId, timer);
    }
    // Force save all dirty users (call on shutdown)
    async flushAll() {
        // Clear all timers
        for (const timer of this.saveDebounceTimers.values()) {
            clearTimeout(timer);
        }
        this.saveDebounceTimers.clear();
        // Save all dirty users
        const savePromises = Array.from(this.dirtyUsers).map(async (userId) => this.saveUserData(userId));
        await Promise.all(savePromises);
        getLogger().info({ count: this.dirtyUsers.size }, 'Flushed all Maya financial data');
    }
    // ============================================================================
    // BUDGET OPERATIONS
    // ============================================================================
    getBudget(userId, budgetId) {
        return Array.from(this.budgetMemory.values()).find((b) => b.id === budgetId && b.userId === userId);
    }
    getUserBudgets(userId) {
        return Array.from(this.budgetMemory.values()).filter((b) => b.userId === userId);
    }
    getMainBudget(userId) {
        // Return the main budget (first one or one named "Monthly Budget")
        const budgets = this.getUserBudgets(userId);
        return (budgets.find((b) => b.name.toLowerCase().includes('monthly')) ||
            budgets.find((b) => b.name.toLowerCase().includes('main')) ||
            budgets[0]);
    }
    setBudget(userId, budget) {
        const isNew = !this.budgetMemory.has(budget.id);
        budget.updatedAt = new Date().toISOString();
        this.budgetMemory.set(budget.id, budget);
        this.markDirty(userId);
        // Auto-index to semantic memory
        onBudgetChange(userId, budget.id, {
            name: budget.name,
            monthlyLimit: budget.monthlyLimit,
            spent: budget.spent,
            remaining: budget.remaining,
        }, isNew ? 'create' : 'update');
        // Record domain signal for cross-domain intelligence
        if (isNew) {
            recordFinancialSignal(userId, 'budget_set', {
                category: budget.name,
                amount: budget.monthlyLimit,
                budgetRemaining: budget.remaining,
            });
        }
    }
    deleteBudget(userId, budgetId) {
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
    getSavingsGoal(userId, goalId) {
        return Array.from(this.savingsGoalMemory.values()).find((g) => g.id === goalId && g.userId === userId);
    }
    getUserSavingsGoals(userId) {
        return Array.from(this.savingsGoalMemory.values()).filter((g) => g.userId === userId);
    }
    getActiveSavingsGoals(userId) {
        return this.getUserSavingsGoals(userId).filter((g) => g.status === 'active');
    }
    getEmergencyFund(userId) {
        return this.getUserSavingsGoals(userId).find((g) => g.isEmergencyFund);
    }
    setSavingsGoal(userId, goal) {
        const isNew = !this.savingsGoalMemory.has(goal.id);
        const previousAmount = !isNew ? this.savingsGoalMemory.get(goal.id)?.currentAmount : 0;
        goal.updatedAt = new Date().toISOString();
        this.savingsGoalMemory.set(goal.id, goal);
        this.markDirty(userId);
        // Auto-index to semantic memory
        onSavingsGoalChange(userId, goal.id, {
            name: goal.name,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount,
            deadline: goal.deadline,
            priority: goal.priority,
        }, isNew ? 'create' : 'update');
        // Record domain signal for cross-domain intelligence
        if (goal.currentAmount !== previousAmount) {
            // Savings progress changed
            const progressPercent = goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
            recordFinancialSignal(userId, 'savings_goal_progress', {
                category: goal.name,
                amount: goal.currentAmount,
                savingsProgress: progressPercent,
            });
        }
    }
    updateSavingsProgress(userId, goalId, newAmount) {
        const goal = this.getSavingsGoal(userId, goalId);
        if (!goal)
            return null;
        goal.currentAmount = newAmount;
        if (newAmount >= goal.targetAmount) {
            goal.status = 'completed';
        }
        goal.updatedAt = new Date().toISOString();
        this.savingsGoalMemory.set(goalId, goal);
        this.markDirty(userId);
        return goal;
    }
    deleteSavingsGoal(userId, goalId) {
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
    getSubscription(userId, subId) {
        return Array.from(this.subscriptionMemory.values()).find((s) => s.id === subId && s.userId === userId);
    }
    getUserSubscriptions(userId) {
        return Array.from(this.subscriptionMemory.values()).filter((s) => s.userId === userId);
    }
    getActiveSubscriptions(userId) {
        return this.getUserSubscriptions(userId).filter((s) => s.isActive);
    }
    getUnusedSubscriptions(userId) {
        return this.getUserSubscriptions(userId).filter((s) => s.isActive && s.usefulness === 'unused');
    }
    setSubscription(userId, sub) {
        const isNew = !this.subscriptionMemory.has(sub.id);
        sub.updatedAt = new Date().toISOString();
        this.subscriptionMemory.set(sub.id, sub);
        this.markDirty(userId);
        // Auto-index to semantic memory
        onSubscriptionChange(userId, sub.id, {
            name: sub.name,
            amount: sub.amount,
            frequency: sub.frequency,
            category: sub.category,
            usefulness: sub.usefulness,
            isActive: sub.isActive,
        }, isNew ? 'create' : 'update');
    }
    updateSubscriptionUsefulness(userId, subId, usefulness) {
        const sub = this.getSubscription(userId, subId);
        if (!sub)
            return null;
        sub.usefulness = usefulness;
        sub.updatedAt = new Date().toISOString();
        this.subscriptionMemory.set(subId, sub);
        this.markDirty(userId);
        return sub;
    }
    deleteSubscription(userId, subId) {
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
    addSpendingTrigger(userId, trigger) {
        this.spendingTriggerMemory.set(trigger.id, trigger);
        this.markDirty(userId);
    }
    getUserSpendingTriggers(userId) {
        return Array.from(this.spendingTriggerMemory.values()).filter((t) => t.userId === userId);
    }
    getRecentSpendingTriggers(userId, limit = 10) {
        return this.getUserSpendingTriggers(userId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
    }
    getSpendingTriggersByEmotion(userId) {
        const triggers = this.getUserSpendingTriggers(userId);
        return triggers.reduce((acc, t) => {
            if (!acc[t.emotion])
                acc[t.emotion] = [];
            acc[t.emotion].push(t);
            return acc;
        }, {});
    }
    // ============================================================================
    // SPENDING LIMIT OPERATIONS
    // ============================================================================
    getSpendingLimit(userId, limitId) {
        return Array.from(this.spendingLimitMemory.values()).find((l) => l.id === limitId && l.userId === userId);
    }
    getSpendingLimitByCategory(userId, category) {
        return Array.from(this.spendingLimitMemory.values()).find((l) => l.userId === userId && l.category.toLowerCase() === category.toLowerCase());
    }
    getUserSpendingLimits(userId) {
        return Array.from(this.spendingLimitMemory.values()).filter((l) => l.userId === userId);
    }
    setSpendingLimit(userId, limit) {
        limit.updatedAt = new Date().toISOString();
        this.spendingLimitMemory.set(limit.id, limit);
        this.markDirty(userId);
    }
    logSpendAgainstLimit(userId, category, amount) {
        const limit = this.getSpendingLimitByCategory(userId, category);
        if (!limit)
            return null;
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
        if (now.getMonth() !== lastMonthReset.getMonth() ||
            now.getFullYear() !== lastMonthReset.getFullYear()) {
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
    deleteSpendingLimit(userId, limitId) {
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
    addWeeklyCheckIn(userId, checkIn) {
        this.weeklyCheckInMemory.set(checkIn.id, checkIn);
        this.markDirty(userId);
    }
    getUserWeeklyCheckIns(userId) {
        return Array.from(this.weeklyCheckInMemory.values())
            .filter((c) => c.userId === userId)
            .sort((a, b) => {
            // Sort by year then week number, descending
            if (a.year !== b.year)
                return b.year - a.year;
            return b.weekNumber - a.weekNumber;
        });
    }
    getLatestWeeklyCheckIn(userId) {
        const checkIns = this.getUserWeeklyCheckIns(userId);
        return checkIns[0];
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    createEmptyData(userId) {
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
    hydrateMemoryMaps(userId, data) {
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
    collectUserData(userId) {
        return {
            userId,
            lastUpdated: new Date(),
            budgets: Array.from(this.budgetMemory.values()).filter((b) => b.userId === userId),
            savingsGoals: Array.from(this.savingsGoalMemory.values()).filter((g) => g.userId === userId),
            subscriptions: Array.from(this.subscriptionMemory.values()).filter((s) => s.userId === userId),
            spendingTriggers: Array.from(this.spendingTriggerMemory.values()).filter((t) => t.userId === userId),
            spendingLimits: Array.from(this.spendingLimitMemory.values()).filter((l) => l.userId === userId),
            weeklyCheckIns: Array.from(this.weeklyCheckInMemory.values()).filter((c) => c.userId === userId),
        };
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let mayaFinancialStoreInstance = null;
export function getFinancialStore() {
    if (!mayaFinancialStoreInstance) {
        mayaFinancialStoreInstance = new MayaFinancialStore();
        // Initialize asynchronously
        mayaFinancialStoreInstance.initialize().catch((error) => {
            getLogger().error({ error }, 'Failed to initialize Maya financial store');
        });
    }
    return mayaFinancialStoreInstance;
}
/**
 * Initialize the Maya Financial Store (for lifecycle management)
 */
export async function initializeMayaFinancialStore() {
    const store = getFinancialStore();
    await store.initialize();
    getLogger().info('Maya Financial Store initialized');
}
/**
 * Shutdown the Maya Financial Store (for lifecycle management)
 */
export async function shutdownMayaFinancialStore() {
    if (mayaFinancialStoreInstance) {
        // Note: No explicit shutdown needed - just clear the instance
        mayaFinancialStoreInstance = null;
        getLogger().info('Maya Financial Store shutdown');
    }
}
// Export the store class for testing
export { MayaFinancialStore };
//# sourceMappingURL=financial-store.js.map