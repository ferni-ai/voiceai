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
export type MilestoneCategory = 'wedding' | 'first-baby' | 'first-home' | 'graduation' | 'retirement' | 'first-solo-trip' | 'first-pet' | 'coming-of-age' | 'milestone-birthday' | 'first-job' | 'first-car' | 'anniversary' | 'college-sendoff' | 'other';
export interface LifeMilestone {
    id: string;
    userId: string;
    name: string;
    category: MilestoneCategory;
    targetDate?: Date;
    status: 'dreaming' | 'planning' | 'in-progress' | 'completed' | 'postponed';
    budget?: number;
    checklist: MilestoneChecklistItem[];
    notes: string;
    mayaBudgetId?: string;
    alexCalendarEventId?: string;
    alexReminderId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface MilestoneChecklistItem {
    id: string;
    task: string;
    category: string;
    dueDate?: Date;
    completed: boolean;
    notes?: string;
}
export type LifeGoalCategory = 'career' | 'financial' | 'health' | 'relationships' | 'personal-growth' | 'home' | 'travel' | 'giving' | 'fun';
export type GoalTimeframe = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'multi-year' | 'life';
export interface LifeGoal {
    id: string;
    userId: string;
    title: string;
    description?: string;
    category: LifeGoalCategory;
    timeframe: GoalTimeframe;
    startDate: Date;
    targetDate?: Date;
    completedDate?: Date;
    status: 'not-started' | 'in-progress' | 'on-track' | 'at-risk' | 'completed' | 'abandoned';
    progressPercent: number;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    notes: string;
    linkedMilestoneId?: string;
    mayaSavingsGoalId?: string;
    alexReminderId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export type RetirementStyle = 'early-retirement' | 'traditional' | 'semi-retirement' | 'encore-career' | 'flexible';
export interface RetirementPlan {
    id: string;
    userId: string;
    targetAge: number;
    currentAge: number;
    style: RetirementStyle;
    monthlyIncomeGoal: number;
    currentSavings: number;
    savingsProgress: number;
    visionItems: RetirementVisionItem[];
    checklist: RetirementChecklistItem[];
    createdAt: Date;
    updatedAt: Date;
}
export interface RetirementVisionItem {
    id: string;
    category: 'location' | 'activities' | 'travel' | 'family' | 'health' | 'legacy' | 'work';
    description: string;
    priority: 'must-have' | 'nice-to-have' | 'dream';
    estimatedCost?: number;
}
export interface RetirementChecklistItem {
    id: string;
    task: string;
    category: string;
    yearsBeforeRetirement?: number;
    completed: boolean;
}
export interface LifePortfolio {
    userId: string;
    categories: Record<LifeGoalCategory, CategorySatisfaction>;
    overallScore: number;
    lastReviewDate?: Date;
    nextReviewDate?: Date;
}
export interface CategorySatisfaction {
    satisfaction: number;
    focus: 'maintain' | 'improve' | 'transform';
    notes?: string;
}
export interface CalendarEvent {
    id: string;
    userId: string;
    title: string;
    date: Date;
    description?: string;
    linkedMilestoneId?: string;
    source: 'jordan-milestone' | 'manual' | 'recurring';
    reminderDays: number[];
    remindersSet: string[];
    status: 'scheduled' | 'reminded' | 'completed' | 'cancelled';
    createdAt: Date;
    updatedAt: Date;
}
export interface RecurringCheckIn {
    id: string;
    userId: string;
    title: string;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    linkedMilestoneId?: string;
    deliveryMethod: 'voice' | 'sms' | 'email';
    deliveryAddress?: string;
    nextCheckIn: Date;
    lastCheckIn?: Date;
    isActive: boolean;
    createdAt: Date;
}
export interface LifeEventAppointment {
    id: string;
    userId: string;
    eventName: string;
    milestoneId?: string;
    appointmentType: string;
    vendorName: string;
    vendorPhone?: string;
    preferredDate: Date;
    preferredTime?: string;
    specialRequests?: string;
    status: 'pending' | 'calling' | 'confirmed' | 'waitlist' | 'cancelled';
    confirmationNumber?: string;
    confirmedDateTime?: Date;
    callAttempts: number;
    notes: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface MilestoneSavingsGoal {
    id: string;
    userId: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: Date;
    monthlyContribution: number;
    linkedMilestoneId?: string;
    linkedMilestoneName?: string;
    status: 'active' | 'on-track' | 'behind' | 'completed';
    progressPercent: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface MilestoneBudget {
    id: string;
    userId: string;
    name: string;
    totalBudget: number;
    categories: Record<string, number>;
    spent: number;
    remaining: number;
    linkedMilestoneId?: string;
    linkedMilestoneName?: string;
    createdAt: Date;
    updatedAt: Date;
}
export type TeamMember = 'jordan' | 'maya' | 'alex' | 'nayan-patel' | 'peter-john';
export interface TeamContext {
    id: string;
    userId: string;
    activeProject?: TeamProject;
    sharedGoals: SharedGoal[];
    sharedMilestones: SharedMilestone[];
    sharedBudgets: SharedBudget[];
    pendingHandoffs: TeamHandoff[];
    completedHandoffs: TeamHandoff[];
    createdAt: Date;
    updatedAt: Date;
}
export interface TeamProject {
    id: string;
    name: string;
    type: 'milestone' | 'goal' | 'event' | 'purchase' | 'financial';
    leadTeamMember: TeamMember;
    supportingMembers: TeamMember[];
    status: 'planning' | 'in-progress' | 'review' | 'completed';
    context: Record<string, unknown>;
}
export interface SharedGoal {
    id: string;
    title: string;
    category: string;
    jordanMilestoneId?: string;
    jordanGoalId?: string;
    timeline?: string;
    financialTarget?: number;
    currentSavings?: number;
    mayaBudgetId?: string;
    alexCalendarId?: string;
    status: 'active' | 'on-track' | 'at-risk' | 'completed';
}
export interface SharedMilestone {
    id: string;
    name: string;
    jordanMilestoneId: string;
    targetDate?: Date;
    mayaBudgetId?: string;
    alexEventId?: string;
    teamNotes: string[];
}
export interface SharedBudget {
    id: string;
    name: string;
    totalBudget: number;
    allocated: Record<string, number>;
    spent: number;
    linkedMilestoneId?: string;
}
export interface TeamHandoff {
    id: string;
    fromMember: TeamMember;
    toMember: TeamMember;
    reason: string;
    context: Record<string, unknown>;
    timestamp: Date;
    acknowledged: boolean;
}
export interface UserLifeData {
    userId: string;
    milestones: LifeMilestone[];
    goals: LifeGoal[];
    retirementPlan?: RetirementPlan;
    portfolio?: LifePortfolio;
    calendarEvents?: CalendarEvent[];
    recurringCheckIns?: RecurringCheckIn[];
    lifeEventAppointments?: LifeEventAppointment[];
    milestoneSavingsGoals?: MilestoneSavingsGoal[];
    milestoneBudgets?: MilestoneBudget[];
    teamContext?: TeamContext;
    lastUpdated: Date;
}
declare class LifeDataStore {
    private store;
    private cache;
    private initialized;
    initialize(): Promise<void>;
    private ensureInitialized;
    private getFromCache;
    private setInCache;
    /**
     * Get all life data for a user
     */
    getUserLifeData(userId: string): Promise<UserLifeData>;
    /**
     * Save all life data for a user
     */
    saveUserLifeData(userId: string, data: UserLifeData): Promise<void>;
    getMilestones(userId: string): Promise<LifeMilestone[]>;
    getMilestone(userId: string, milestoneId: string): Promise<LifeMilestone | undefined>;
    saveMilestone(userId: string, milestone: LifeMilestone): Promise<void>;
    deleteMilestone(userId: string, milestoneId: string): Promise<boolean>;
    getGoals(userId: string): Promise<LifeGoal[]>;
    getGoal(userId: string, goalId: string): Promise<LifeGoal | undefined>;
    saveGoal(userId: string, goal: LifeGoal): Promise<void>;
    deleteGoal(userId: string, goalId: string): Promise<boolean>;
    getRetirementPlan(userId: string): Promise<RetirementPlan | undefined>;
    saveRetirementPlan(userId: string, plan: RetirementPlan): Promise<void>;
    getPortfolio(userId: string): Promise<LifePortfolio>;
    savePortfolio(userId: string, portfolio: LifePortfolio): Promise<void>;
    /**
     * Get milestones with upcoming dates
     */
    getUpcomingMilestones(userId: string, daysAhead?: number): Promise<LifeMilestone[]>;
    /**
     * Get goals that need attention (at-risk or behind)
     */
    getAtRiskGoals(userId: string): Promise<LifeGoal[]>;
    /**
     * Get user's progress summary
     */
    getProgressSummary(userId: string): Promise<{
        totalMilestones: number;
        completedMilestones: number;
        totalGoals: number;
        completedGoals: number;
        upcomingMilestones: number;
        atRiskGoals: number;
        retirementProgress: number;
        portfolioScore: number;
    }>;
    getCalendarEvents(userId: string): Promise<CalendarEvent[]>;
    getCalendarEvent(userId: string, eventId: string): Promise<CalendarEvent | undefined>;
    saveCalendarEvent(userId: string, event: CalendarEvent): Promise<void>;
    deleteCalendarEvent(userId: string, eventId: string): Promise<boolean>;
    getRecurringCheckIns(userId: string): Promise<RecurringCheckIn[]>;
    saveRecurringCheckIn(userId: string, checkIn: RecurringCheckIn): Promise<void>;
    deleteRecurringCheckIn(userId: string, checkInId: string): Promise<boolean>;
    getLifeEventAppointments(userId: string): Promise<LifeEventAppointment[]>;
    getLifeEventAppointment(userId: string, appointmentId: string): Promise<LifeEventAppointment | undefined>;
    saveLifeEventAppointment(userId: string, appointment: LifeEventAppointment): Promise<void>;
    deleteLifeEventAppointment(userId: string, appointmentId: string): Promise<boolean>;
    getPendingLifeEventAppointments(userId: string): Promise<LifeEventAppointment[]>;
    getMilestoneSavingsGoals(userId: string): Promise<MilestoneSavingsGoal[]>;
    getMilestoneSavingsGoal(userId: string, goalId: string): Promise<MilestoneSavingsGoal | undefined>;
    saveMilestoneSavingsGoal(userId: string, goal: MilestoneSavingsGoal): Promise<void>;
    deleteMilestoneSavingsGoal(userId: string, goalId: string): Promise<boolean>;
    getMilestoneBudgets(userId: string): Promise<MilestoneBudget[]>;
    getMilestoneBudget(userId: string, budgetId: string): Promise<MilestoneBudget | undefined>;
    saveMilestoneBudget(userId: string, budget: MilestoneBudget): Promise<void>;
    deleteMilestoneBudget(userId: string, budgetId: string): Promise<boolean>;
    getTeamContext(userId: string): Promise<TeamContext | undefined>;
    saveTeamContext(userId: string, context: TeamContext): Promise<void>;
    getOrCreateTeamContext(userId: string): Promise<TeamContext>;
    /**
     * Clear cache for a specific user (call on session end)
     */
    clearUserCache(userId: string): void;
    /**
     * Clear all caches (for testing or system cleanup)
     */
    clearAllCaches(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        userCount: number;
    };
}
export declare function getLifeDataStore(): LifeDataStore;
export default getLifeDataStore;
//# sourceMappingURL=life-data-store.d.ts.map