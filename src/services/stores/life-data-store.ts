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
import type { MemoryStore } from '../../memory/store.js';
import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// TYPES - LIFE MILESTONES
// ============================================================================

export type MilestoneCategory =
  | 'wedding'
  | 'first-baby'
  | 'first-home'
  | 'graduation'
  | 'retirement'
  | 'first-solo-trip'
  | 'first-pet'
  | 'coming-of-age'
  | 'milestone-birthday'
  | 'first-job'
  | 'first-car'
  | 'anniversary'
  | 'college-sendoff'
  | 'other';

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

  // Team integration
  mayaBudgetId?: string;
  alexCalendarEventId?: string;
  alexReminderId?: string;

  // Timestamps
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

// ============================================================================
// TYPES - LIFE GOALS
// ============================================================================

export type LifeGoalCategory =
  | 'career'
  | 'financial'
  | 'health'
  | 'relationships'
  | 'personal-growth'
  | 'home'
  | 'travel'
  | 'giving'
  | 'fun';

export type GoalTimeframe =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'multi-year'
  | 'life';

export interface LifeGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: LifeGoalCategory;
  timeframe: GoalTimeframe;

  // Timeline
  startDate: Date;
  targetDate?: Date;
  completedDate?: Date;

  // Progress
  status: 'not-started' | 'in-progress' | 'on-track' | 'at-risk' | 'completed' | 'abandoned';
  progressPercent: number;

  // Metrics
  targetValue?: number;
  currentValue?: number;
  unit?: string;

  // Notes
  notes: string;

  // Team integration
  linkedMilestoneId?: string;
  mayaSavingsGoalId?: string;
  alexReminderId?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// TYPES - RETIREMENT PLAN
// ============================================================================

export type RetirementStyle =
  | 'early-retirement'
  | 'traditional'
  | 'semi-retirement'
  | 'encore-career'
  | 'flexible';

export interface RetirementPlan {
  id: string;
  userId: string;
  targetAge: number;
  currentAge: number;
  style: RetirementStyle;
  monthlyIncomeGoal: number;
  currentSavings: number;
  savingsProgress: number;

  // Vision items
  visionItems: RetirementVisionItem[];

  // Checklist
  checklist: RetirementChecklistItem[];

  // Timestamps
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

// ============================================================================
// TYPES - LIFE PORTFOLIO
// ============================================================================

export interface LifePortfolio {
  userId: string;
  categories: Record<LifeGoalCategory, CategorySatisfaction>;
  overallScore: number;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
}

export interface CategorySatisfaction {
  satisfaction: number; // 1-10
  focus: 'maintain' | 'improve' | 'transform';
  notes?: string;
}

// ============================================================================
// TYPES - ALEX'S CALENDAR & APPOINTMENTS
// ============================================================================

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

// ============================================================================
// TYPES - MAYA'S SAVINGS & BUDGETS
// ============================================================================

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

// ============================================================================
// TYPES - TEAM COORDINATION
// ============================================================================

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

// ============================================================================
// EXTENDED USER DATA INTERFACE
// ============================================================================

export interface UserLifeData {
  userId: string;
  milestones: LifeMilestone[];
  goals: LifeGoal[];
  retirementPlan?: RetirementPlan;
  portfolio?: LifePortfolio;

  // Alex's data
  calendarEvents?: CalendarEvent[];
  recurringCheckIns?: RecurringCheckIn[];
  lifeEventAppointments?: LifeEventAppointment[];

  // Maya's data
  milestoneSavingsGoals?: MilestoneSavingsGoal[];
  milestoneBudgets?: MilestoneBudget[];

  // Team coordination
  teamContext?: TeamContext;

  lastUpdated: Date;
}

// ============================================================================
// LIFE DATA STORE CLASS
// ============================================================================

class LifeDataStore {
  private store: MemoryStore | null = null;
  private cache = new Map<string, UserLifeData>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.store = getDefaultStore();
    this.initialized = true;
    getLogger().info('📊 Life Data Store initialized');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getFromCache(userId: string): UserLifeData | undefined {
    return this.cache.get(userId);
  }

  private setInCache(userId: string, data: UserLifeData): void {
    this.cache.set(userId, data);
  }

  // ============================================================================
  // CORE OPERATIONS
  // ============================================================================

  /**
   * Get all life data for a user
   */
  async getUserLifeData(userId: string): Promise<UserLifeData> {
    await this.ensureInitialized();

    // Check cache first
    const cached = this.getFromCache(userId);
    if (cached) {
      return cached;
    }

    // Load from profile metadata
    if (this.store) {
      const profile = await this.store.getProfile(userId);
      if (profile && (profile as UserProfile & { lifeData?: UserLifeData }).lifeData) {
        const lifeData = (profile as UserProfile & { lifeData?: UserLifeData }).lifeData!;
        this.setInCache(userId, lifeData);
        return lifeData;
      }
    }

    // Create new life data
    const newData: UserLifeData = {
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
  async saveUserLifeData(userId: string, data: UserLifeData): Promise<void> {
    await this.ensureInitialized();

    data.lastUpdated = new Date();
    this.setInCache(userId, data);

    // Persist to profile
    if (this.store) {
      const profile = await this.store.getProfile(userId);
      if (profile) {
        (profile as UserProfile & { lifeData?: UserLifeData }).lifeData = data;
        await this.store.saveProfile(profile);
        getLogger().debug({ userId }, 'Life data persisted to profile');
      }
    }
  }

  // ============================================================================
  // MILESTONE OPERATIONS
  // ============================================================================

  async getMilestones(userId: string): Promise<LifeMilestone[]> {
    const data = await this.getUserLifeData(userId);
    return data.milestones;
  }

  async getMilestone(userId: string, milestoneId: string): Promise<LifeMilestone | undefined> {
    const milestones = await this.getMilestones(userId);
    return milestones.find((m) => m.id === milestoneId);
  }

  async saveMilestone(userId: string, milestone: LifeMilestone): Promise<void> {
    const data = await this.getUserLifeData(userId);

    const existingIndex = data.milestones.findIndex((m) => m.id === milestone.id);
    if (existingIndex >= 0) {
      data.milestones[existingIndex] = milestone;
    } else {
      data.milestones.push(milestone);
    }

    milestone.updatedAt = new Date();
    await this.saveUserLifeData(userId, data);

    getLogger().info(
      { userId, milestoneId: milestone.id, name: milestone.name },
      '💾 Milestone saved'
    );
  }

  async deleteMilestone(userId: string, milestoneId: string): Promise<boolean> {
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

  async getGoals(userId: string): Promise<LifeGoal[]> {
    const data = await this.getUserLifeData(userId);
    return data.goals;
  }

  async getGoal(userId: string, goalId: string): Promise<LifeGoal | undefined> {
    const goals = await this.getGoals(userId);
    return goals.find((g) => g.id === goalId);
  }

  async saveGoal(userId: string, goal: LifeGoal): Promise<void> {
    const data = await this.getUserLifeData(userId);

    const existingIndex = data.goals.findIndex((g) => g.id === goal.id);
    if (existingIndex >= 0) {
      data.goals[existingIndex] = goal;
    } else {
      data.goals.push(goal);
    }

    goal.updatedAt = new Date();
    await this.saveUserLifeData(userId, data);

    getLogger().info({ userId, goalId: goal.id, title: goal.title }, '💾 Goal saved');
  }

  async deleteGoal(userId: string, goalId: string): Promise<boolean> {
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

  async getRetirementPlan(userId: string): Promise<RetirementPlan | undefined> {
    const data = await this.getUserLifeData(userId);
    return data.retirementPlan;
  }

  async saveRetirementPlan(userId: string, plan: RetirementPlan): Promise<void> {
    const data = await this.getUserLifeData(userId);
    data.retirementPlan = plan;
    plan.updatedAt = new Date();
    await this.saveUserLifeData(userId, data);

    getLogger().info({ userId, targetAge: plan.targetAge }, '💾 Retirement plan saved');
  }

  // ============================================================================
  // LIFE PORTFOLIO OPERATIONS
  // ============================================================================

  async getPortfolio(userId: string): Promise<LifePortfolio> {
    const data = await this.getUserLifeData(userId);

    if (!data.portfolio) {
      // Create default portfolio
      const categories: LifeGoalCategory[] = [
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
        categories: {} as Record<LifeGoalCategory, CategorySatisfaction>,
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

  async savePortfolio(userId: string, portfolio: LifePortfolio): Promise<void> {
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
  async getUpcomingMilestones(userId: string, daysAhead = 30): Promise<LifeMilestone[]> {
    const milestones = await this.getMilestones(userId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return milestones
      .filter(
        (m) =>
          m.targetDate &&
          m.targetDate <= cutoffDate &&
          m.status !== 'completed' &&
          m.status !== 'postponed'
      )
      .sort((a, b) => (a.targetDate?.getTime() || 0) - (b.targetDate?.getTime() || 0));
  }

  /**
   * Get goals that need attention (at-risk or behind)
   */
  async getAtRiskGoals(userId: string): Promise<LifeGoal[]> {
    const goals = await this.getGoals(userId);
    return goals.filter((g) => g.status === 'at-risk' || g.progressPercent < 25);
  }

  /**
   * Get user's progress summary
   */
  async getProgressSummary(userId: string): Promise<{
    totalMilestones: number;
    completedMilestones: number;
    totalGoals: number;
    completedGoals: number;
    upcomingMilestones: number;
    atRiskGoals: number;
    retirementProgress: number;
    portfolioScore: number;
  }> {
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
      upcomingMilestones: milestones.filter(
        (m) => m.targetDate && m.targetDate <= thirtyDaysOut && m.targetDate >= now
      ).length,
      atRiskGoals: goals.filter((g) => g.status === 'at-risk').length,
      retirementProgress: retirement?.savingsProgress || 0,
      portfolioScore: portfolio.overallScore,
    };
  }

  // ============================================================================
  // ALEX'S CALENDAR EVENT OPERATIONS
  // ============================================================================

  async getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
    const data = await this.getUserLifeData(userId);
    return data.calendarEvents || [];
  }

  async getCalendarEvent(userId: string, eventId: string): Promise<CalendarEvent | undefined> {
    const events = await this.getCalendarEvents(userId);
    return events.find((e) => e.id === eventId);
  }

  async saveCalendarEvent(userId: string, event: CalendarEvent): Promise<void> {
    const data = await this.getUserLifeData(userId);
    if (!data.calendarEvents) data.calendarEvents = [];

    const index = data.calendarEvents.findIndex((e) => e.id === event.id);
    event.updatedAt = new Date();

    if (index >= 0) {
      data.calendarEvents[index] = event;
    } else {
      data.calendarEvents.push(event);
    }

    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, eventId: event.id }, '💾 Calendar event saved');
  }

  async deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
    const data = await this.getUserLifeData(userId);
    if (!data.calendarEvents) return false;

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

  async getRecurringCheckIns(userId: string): Promise<RecurringCheckIn[]> {
    const data = await this.getUserLifeData(userId);
    return data.recurringCheckIns || [];
  }

  async saveRecurringCheckIn(userId: string, checkIn: RecurringCheckIn): Promise<void> {
    const data = await this.getUserLifeData(userId);
    if (!data.recurringCheckIns) data.recurringCheckIns = [];

    const index = data.recurringCheckIns.findIndex((c) => c.id === checkIn.id);

    if (index >= 0) {
      data.recurringCheckIns[index] = checkIn;
    } else {
      data.recurringCheckIns.push(checkIn);
    }

    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, checkInId: checkIn.id }, '💾 Recurring check-in saved');
  }

  async deleteRecurringCheckIn(userId: string, checkInId: string): Promise<boolean> {
    const data = await this.getUserLifeData(userId);
    if (!data.recurringCheckIns) return false;

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

  async getLifeEventAppointments(userId: string): Promise<LifeEventAppointment[]> {
    const data = await this.getUserLifeData(userId);
    return data.lifeEventAppointments || [];
  }

  async getLifeEventAppointment(
    userId: string,
    appointmentId: string
  ): Promise<LifeEventAppointment | undefined> {
    const appointments = await this.getLifeEventAppointments(userId);
    return appointments.find((a) => a.id === appointmentId);
  }

  async saveLifeEventAppointment(userId: string, appointment: LifeEventAppointment): Promise<void> {
    const data = await this.getUserLifeData(userId);
    if (!data.lifeEventAppointments) data.lifeEventAppointments = [];

    const index = data.lifeEventAppointments.findIndex((a) => a.id === appointment.id);
    appointment.updatedAt = new Date();

    if (index >= 0) {
      data.lifeEventAppointments[index] = appointment;
    } else {
      data.lifeEventAppointments.push(appointment);
    }

    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, appointmentId: appointment.id }, '💾 Life event appointment saved');
  }

  async deleteLifeEventAppointment(userId: string, appointmentId: string): Promise<boolean> {
    const data = await this.getUserLifeData(userId);
    if (!data.lifeEventAppointments) return false;

    const index = data.lifeEventAppointments.findIndex((a) => a.id === appointmentId);
    if (index >= 0) {
      data.lifeEventAppointments.splice(index, 1);
      await this.saveUserLifeData(userId, data);
      return true;
    }
    return false;
  }

  async getPendingLifeEventAppointments(userId: string): Promise<LifeEventAppointment[]> {
    const appointments = await this.getLifeEventAppointments(userId);
    return appointments.filter((a) => a.status === 'calling' || a.status === 'pending');
  }

  // ============================================================================
  // MAYA'S SAVINGS GOAL OPERATIONS
  // ============================================================================

  async getMilestoneSavingsGoals(userId: string): Promise<MilestoneSavingsGoal[]> {
    const data = await this.getUserLifeData(userId);
    return data.milestoneSavingsGoals || [];
  }

  async getMilestoneSavingsGoal(
    userId: string,
    goalId: string
  ): Promise<MilestoneSavingsGoal | undefined> {
    const goals = await this.getMilestoneSavingsGoals(userId);
    return goals.find((g) => g.id === goalId);
  }

  async saveMilestoneSavingsGoal(userId: string, goal: MilestoneSavingsGoal): Promise<void> {
    const data = await this.getUserLifeData(userId);
    if (!data.milestoneSavingsGoals) data.milestoneSavingsGoals = [];

    const index = data.milestoneSavingsGoals.findIndex((g) => g.id === goal.id);
    goal.updatedAt = new Date();

    if (index >= 0) {
      data.milestoneSavingsGoals[index] = goal;
    } else {
      data.milestoneSavingsGoals.push(goal);
    }

    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, goalId: goal.id }, '💾 Milestone savings goal saved');
  }

  async deleteMilestoneSavingsGoal(userId: string, goalId: string): Promise<boolean> {
    const data = await this.getUserLifeData(userId);
    if (!data.milestoneSavingsGoals) return false;

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

  async getMilestoneBudgets(userId: string): Promise<MilestoneBudget[]> {
    const data = await this.getUserLifeData(userId);
    return data.milestoneBudgets || [];
  }

  async getMilestoneBudget(userId: string, budgetId: string): Promise<MilestoneBudget | undefined> {
    const budgets = await this.getMilestoneBudgets(userId);
    return budgets.find((b) => b.id === budgetId);
  }

  async saveMilestoneBudget(userId: string, budget: MilestoneBudget): Promise<void> {
    const data = await this.getUserLifeData(userId);
    if (!data.milestoneBudgets) data.milestoneBudgets = [];

    const index = data.milestoneBudgets.findIndex((b) => b.id === budget.id);
    budget.updatedAt = new Date();

    if (index >= 0) {
      data.milestoneBudgets[index] = budget;
    } else {
      data.milestoneBudgets.push(budget);
    }

    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, budgetId: budget.id }, '💾 Milestone budget saved');
  }

  async deleteMilestoneBudget(userId: string, budgetId: string): Promise<boolean> {
    const data = await this.getUserLifeData(userId);
    if (!data.milestoneBudgets) return false;

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

  async getTeamContext(userId: string): Promise<TeamContext | undefined> {
    const data = await this.getUserLifeData(userId);
    return data.teamContext;
  }

  async saveTeamContext(userId: string, context: TeamContext): Promise<void> {
    const data = await this.getUserLifeData(userId);
    context.updatedAt = new Date();
    data.teamContext = context;
    await this.saveUserLifeData(userId, data);
    getLogger().debug({ userId, contextId: context.id }, '💾 Team context saved');
  }

  async getOrCreateTeamContext(userId: string): Promise<TeamContext> {
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
  clearUserCache(userId: string): void {
    if (this.cache.has(userId)) {
      this.cache.delete(userId);
      getLogger().debug({ userId }, '🧹 Life data cache cleared for user');
    }
  }

  /**
   * Clear all caches (for testing or system cleanup)
   */
  clearAllCaches(): void {
    const count = this.cache.size;
    this.cache.clear();
    getLogger().info({ clearedCount: count }, '🧹 All life data caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { userCount: number } {
    return {
      userCount: this.cache.size,
    };
  }
}

// Singleton instance
let lifeDataStoreInstance: LifeDataStore | null = null;

export function getLifeDataStore(): LifeDataStore {
  if (!lifeDataStoreInstance) {
    lifeDataStoreInstance = new LifeDataStore();
  }
  return lifeDataStoreInstance;
}

export default getLifeDataStore;
