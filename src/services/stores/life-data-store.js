/**
 * Life Data Store - Persistent Storage for Jordan's Domain
 *
 * Stores and retrieves:
 * - Life milestones (wedding, baby, home, etc.)
 * - Life goals (career, health, relationships, etc.)
 * - Retirement plans
 * - Team coordination context
 *
 * Integrates with the existing MemoryStore system.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { getDefaultStore } from '../../memory/index.js';
// ============================================================================
// LIFE DATA STORE CLASS
// ============================================================================
class LifeDataStore {
    store = null;
    cache = new Map();
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        this.store = getDefaultStore();
        this.initialized = true;
        getLogger().info('📊 Life Data Store initialized');
    }
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    getFromCache(userId) {
        return this.cache.get(userId);
    }
    setInCache(userId, data) {
        this.cache.set(userId, data);
    }
    // ============================================================================
    // CORE OPERATIONS
    // ============================================================================
    /**
     * Get all life data for a user
     */
    async getUserLifeData(userId) {
        await this.ensureInitialized();
        // Check cache first
        const cached = this.getFromCache(userId);
        if (cached) {
            return cached;
        }
        // Load from profile metadata
        if (this.store) {
            const profile = await this.store.getProfile(userId);
            if (profile && profile.lifeData) {
                const lifeData = profile.lifeData;
                this.setInCache(userId, lifeData);
                return lifeData;
            }
        }
        // Create new life data
        const newData = {
            userId,
            milestones: [],
            goals: [],
            lastUpdated: new Date(),
        };
        this.setInCache(userId, newData);
        return newData;
    }
    /**
     * Save all life data for a user
     */
    async saveUserLifeData(userId, data) {
        await this.ensureInitialized();
        data.lastUpdated = new Date();
        this.setInCache(userId, data);
        // Persist to profile
        if (this.store) {
            const profile = await this.store.getProfile(userId);
            if (profile) {
                profile.lifeData = data;
                await this.store.saveProfile(profile);
                getLogger().debug({ userId }, 'Life data persisted to profile');
            }
        }
    }
    // ============================================================================
    // MILESTONE OPERATIONS
    // ============================================================================
    async getMilestones(userId) {
        const data = await this.getUserLifeData(userId);
        return data.milestones;
    }
    async getMilestone(userId, milestoneId) {
        const milestones = await this.getMilestones(userId);
        return milestones.find((m) => m.id === milestoneId);
    }
    async saveMilestone(userId, milestone) {
        const data = await this.getUserLifeData(userId);
        const existingIndex = data.milestones.findIndex((m) => m.id === milestone.id);
        if (existingIndex >= 0) {
            data.milestones[existingIndex] = milestone;
        }
        else {
            data.milestones.push(milestone);
        }
        milestone.updatedAt = new Date();
        await this.saveUserLifeData(userId, data);
        getLogger().info({ userId, milestoneId: milestone.id, name: milestone.name }, '💾 Milestone saved');
    }
    async deleteMilestone(userId, milestoneId) {
        const data = await this.getUserLifeData(userId);
        const initialLength = data.milestones.length;
        data.milestones = data.milestones.filter((m) => m.id !== milestoneId);
        if (data.milestones.length < initialLength) {
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // GOAL OPERATIONS
    // ============================================================================
    async getGoals(userId) {
        const data = await this.getUserLifeData(userId);
        return data.goals;
    }
    async getGoal(userId, goalId) {
        const goals = await this.getGoals(userId);
        return goals.find((g) => g.id === goalId);
    }
    async saveGoal(userId, goal) {
        const data = await this.getUserLifeData(userId);
        const existingIndex = data.goals.findIndex((g) => g.id === goal.id);
        if (existingIndex >= 0) {
            data.goals[existingIndex] = goal;
        }
        else {
            data.goals.push(goal);
        }
        goal.updatedAt = new Date();
        await this.saveUserLifeData(userId, data);
        getLogger().info({ userId, goalId: goal.id, title: goal.title }, '💾 Goal saved');
    }
    async deleteGoal(userId, goalId) {
        const data = await this.getUserLifeData(userId);
        const initialLength = data.goals.length;
        data.goals = data.goals.filter((g) => g.id !== goalId);
        if (data.goals.length < initialLength) {
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // RETIREMENT PLAN OPERATIONS
    // ============================================================================
    async getRetirementPlan(userId) {
        const data = await this.getUserLifeData(userId);
        return data.retirementPlan;
    }
    async saveRetirementPlan(userId, plan) {
        const data = await this.getUserLifeData(userId);
        data.retirementPlan = plan;
        plan.updatedAt = new Date();
        await this.saveUserLifeData(userId, data);
        getLogger().info({ userId, targetAge: plan.targetAge }, '💾 Retirement plan saved');
    }
    // ============================================================================
    // LIFE PORTFOLIO OPERATIONS
    // ============================================================================
    async getPortfolio(userId) {
        const data = await this.getUserLifeData(userId);
        if (!data.portfolio) {
            // Create default portfolio
            const categories = [
                'career',
                'financial',
                'health',
                'relationships',
                'personal-growth',
                'home',
                'travel',
                'giving',
                'fun',
            ];
            data.portfolio = {
                userId,
                categories: {},
                overallScore: 5,
            };
            for (const cat of categories) {
                data.portfolio.categories[cat] = {
                    satisfaction: 5,
                    focus: 'maintain',
                };
            }
        }
        return data.portfolio;
    }
    async savePortfolio(userId, portfolio) {
        const data = await this.getUserLifeData(userId);
        data.portfolio = portfolio;
        await this.saveUserLifeData(userId, data);
        getLogger().info({ userId, overallScore: portfolio.overallScore }, '💾 Portfolio saved');
    }
    // ============================================================================
    // QUERY OPERATIONS
    // ============================================================================
    /**
     * Get milestones with upcoming dates
     */
    async getUpcomingMilestones(userId, daysAhead = 30) {
        const milestones = await this.getMilestones(userId);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
        return milestones
            .filter((m) => m.targetDate &&
            m.targetDate <= cutoffDate &&
            m.status !== 'completed' &&
            m.status !== 'postponed')
            .sort((a, b) => (a.targetDate?.getTime() || 0) - (b.targetDate?.getTime() || 0));
    }
    /**
     * Get goals that need attention (at-risk or behind)
     */
    async getAtRiskGoals(userId) {
        const goals = await this.getGoals(userId);
        return goals.filter((g) => g.status === 'at-risk' || g.progressPercent < 25);
    }
    /**
     * Get user's progress summary
     */
    async getProgressSummary(userId) {
        const [milestones, goals, retirement, portfolio] = await Promise.all([
            this.getMilestones(userId),
            this.getGoals(userId),
            this.getRetirementPlan(userId),
            this.getPortfolio(userId),
        ]);
        const now = new Date();
        const thirtyDaysOut = new Date();
        thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
        return {
            totalMilestones: milestones.length,
            completedMilestones: milestones.filter((m) => m.status === 'completed').length,
            totalGoals: goals.length,
            completedGoals: goals.filter((g) => g.status === 'completed').length,
            upcomingMilestones: milestones.filter((m) => m.targetDate && m.targetDate <= thirtyDaysOut && m.targetDate >= now).length,
            atRiskGoals: goals.filter((g) => g.status === 'at-risk').length,
            retirementProgress: retirement?.savingsProgress || 0,
            portfolioScore: portfolio.overallScore,
        };
    }
    // ============================================================================
    // ALEX'S CALENDAR EVENT OPERATIONS
    // ============================================================================
    async getCalendarEvents(userId) {
        const data = await this.getUserLifeData(userId);
        return data.calendarEvents || [];
    }
    async getCalendarEvent(userId, eventId) {
        const events = await this.getCalendarEvents(userId);
        return events.find((e) => e.id === eventId);
    }
    async saveCalendarEvent(userId, event) {
        const data = await this.getUserLifeData(userId);
        if (!data.calendarEvents)
            data.calendarEvents = [];
        const index = data.calendarEvents.findIndex((e) => e.id === event.id);
        event.updatedAt = new Date();
        if (index >= 0) {
            data.calendarEvents[index] = event;
        }
        else {
            data.calendarEvents.push(event);
        }
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, eventId: event.id }, '💾 Calendar event saved');
    }
    async deleteCalendarEvent(userId, eventId) {
        const data = await this.getUserLifeData(userId);
        if (!data.calendarEvents)
            return false;
        const index = data.calendarEvents.findIndex((e) => e.id === eventId);
        if (index >= 0) {
            data.calendarEvents.splice(index, 1);
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // ALEX'S RECURRING CHECK-IN OPERATIONS
    // ============================================================================
    async getRecurringCheckIns(userId) {
        const data = await this.getUserLifeData(userId);
        return data.recurringCheckIns || [];
    }
    async saveRecurringCheckIn(userId, checkIn) {
        const data = await this.getUserLifeData(userId);
        if (!data.recurringCheckIns)
            data.recurringCheckIns = [];
        const index = data.recurringCheckIns.findIndex((c) => c.id === checkIn.id);
        if (index >= 0) {
            data.recurringCheckIns[index] = checkIn;
        }
        else {
            data.recurringCheckIns.push(checkIn);
        }
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, checkInId: checkIn.id }, '💾 Recurring check-in saved');
    }
    async deleteRecurringCheckIn(userId, checkInId) {
        const data = await this.getUserLifeData(userId);
        if (!data.recurringCheckIns)
            return false;
        const index = data.recurringCheckIns.findIndex((c) => c.id === checkInId);
        if (index >= 0) {
            data.recurringCheckIns.splice(index, 1);
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // ALEX'S LIFE EVENT APPOINTMENT OPERATIONS
    // ============================================================================
    async getLifeEventAppointments(userId) {
        const data = await this.getUserLifeData(userId);
        return data.lifeEventAppointments || [];
    }
    async getLifeEventAppointment(userId, appointmentId) {
        const appointments = await this.getLifeEventAppointments(userId);
        return appointments.find((a) => a.id === appointmentId);
    }
    async saveLifeEventAppointment(userId, appointment) {
        const data = await this.getUserLifeData(userId);
        if (!data.lifeEventAppointments)
            data.lifeEventAppointments = [];
        const index = data.lifeEventAppointments.findIndex((a) => a.id === appointment.id);
        appointment.updatedAt = new Date();
        if (index >= 0) {
            data.lifeEventAppointments[index] = appointment;
        }
        else {
            data.lifeEventAppointments.push(appointment);
        }
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, appointmentId: appointment.id }, '💾 Life event appointment saved');
    }
    async deleteLifeEventAppointment(userId, appointmentId) {
        const data = await this.getUserLifeData(userId);
        if (!data.lifeEventAppointments)
            return false;
        const index = data.lifeEventAppointments.findIndex((a) => a.id === appointmentId);
        if (index >= 0) {
            data.lifeEventAppointments.splice(index, 1);
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    async getPendingLifeEventAppointments(userId) {
        const appointments = await this.getLifeEventAppointments(userId);
        return appointments.filter((a) => a.status === 'calling' || a.status === 'pending');
    }
    // ============================================================================
    // MAYA'S SAVINGS GOAL OPERATIONS
    // ============================================================================
    async getMilestoneSavingsGoals(userId) {
        const data = await this.getUserLifeData(userId);
        return data.milestoneSavingsGoals || [];
    }
    async getMilestoneSavingsGoal(userId, goalId) {
        const goals = await this.getMilestoneSavingsGoals(userId);
        return goals.find((g) => g.id === goalId);
    }
    async saveMilestoneSavingsGoal(userId, goal) {
        const data = await this.getUserLifeData(userId);
        if (!data.milestoneSavingsGoals)
            data.milestoneSavingsGoals = [];
        const index = data.milestoneSavingsGoals.findIndex((g) => g.id === goal.id);
        goal.updatedAt = new Date();
        if (index >= 0) {
            data.milestoneSavingsGoals[index] = goal;
        }
        else {
            data.milestoneSavingsGoals.push(goal);
        }
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, goalId: goal.id }, '💾 Milestone savings goal saved');
    }
    async deleteMilestoneSavingsGoal(userId, goalId) {
        const data = await this.getUserLifeData(userId);
        if (!data.milestoneSavingsGoals)
            return false;
        const index = data.milestoneSavingsGoals.findIndex((g) => g.id === goalId);
        if (index >= 0) {
            data.milestoneSavingsGoals.splice(index, 1);
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // MAYA'S BUDGET OPERATIONS
    // ============================================================================
    async getMilestoneBudgets(userId) {
        const data = await this.getUserLifeData(userId);
        return data.milestoneBudgets || [];
    }
    async getMilestoneBudget(userId, budgetId) {
        const budgets = await this.getMilestoneBudgets(userId);
        return budgets.find((b) => b.id === budgetId);
    }
    async saveMilestoneBudget(userId, budget) {
        const data = await this.getUserLifeData(userId);
        if (!data.milestoneBudgets)
            data.milestoneBudgets = [];
        const index = data.milestoneBudgets.findIndex((b) => b.id === budget.id);
        budget.updatedAt = new Date();
        if (index >= 0) {
            data.milestoneBudgets[index] = budget;
        }
        else {
            data.milestoneBudgets.push(budget);
        }
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, budgetId: budget.id }, '💾 Milestone budget saved');
    }
    async deleteMilestoneBudget(userId, budgetId) {
        const data = await this.getUserLifeData(userId);
        if (!data.milestoneBudgets)
            return false;
        const index = data.milestoneBudgets.findIndex((b) => b.id === budgetId);
        if (index >= 0) {
            data.milestoneBudgets.splice(index, 1);
            await this.saveUserLifeData(userId, data);
            return true;
        }
        return false;
    }
    // ============================================================================
    // TEAM CONTEXT OPERATIONS
    // ============================================================================
    async getTeamContext(userId) {
        const data = await this.getUserLifeData(userId);
        return data.teamContext;
    }
    async saveTeamContext(userId, context) {
        const data = await this.getUserLifeData(userId);
        context.updatedAt = new Date();
        data.teamContext = context;
        await this.saveUserLifeData(userId, data);
        getLogger().debug({ userId, contextId: context.id }, '💾 Team context saved');
    }
    async getOrCreateTeamContext(userId) {
        let context = await this.getTeamContext(userId);
        if (!context) {
            context = {
                id: `team_ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                userId,
                sharedGoals: [],
                sharedMilestones: [],
                sharedBudgets: [],
                pendingHandoffs: [],
                completedHandoffs: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await this.saveTeamContext(userId, context);
        }
        return context;
    }
    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================
    /**
     * Clear cache for a specific user (call on session end)
     */
    clearUserCache(userId) {
        if (this.cache.has(userId)) {
            this.cache.delete(userId);
            getLogger().debug({ userId }, '🧹 Life data cache cleared for user');
        }
    }
    /**
     * Clear all caches (for testing or system cleanup)
     */
    clearAllCaches() {
        const count = this.cache.size;
        this.cache.clear();
        getLogger().info({ clearedCount: count }, '🧹 All life data caches cleared');
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            userCount: this.cache.size,
        };
    }
}
// Singleton instance
let lifeDataStoreInstance = null;
export function getLifeDataStore() {
    if (!lifeDataStoreInstance) {
        lifeDataStoreInstance = new LifeDataStore();
    }
    return lifeDataStoreInstance;
}
export default getLifeDataStore;
//# sourceMappingURL=life-data-store.js.map