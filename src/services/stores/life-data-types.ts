/**
 * Life Data Types - Jordan's Domain
 *
 * Type definitions for:
 * - Life milestones (wedding, baby, home, etc.)
 * - Life goals (career, health, relationships, etc.)
 * - Retirement plans
 * - Team coordination context
 * - Calendar events and appointments
 * - Savings goals and budgets
 */

// ============================================================================
// LIFE MILESTONE TYPES
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
// LIFE GOAL TYPES
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
// RETIREMENT PLAN TYPES
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
// LIFE PORTFOLIO TYPES
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
// CALENDAR & APPOINTMENT TYPES (Alex's Domain)
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
// SAVINGS & BUDGET TYPES (Maya's Domain)
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
// TEAM COORDINATION TYPES
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
// USER LIFE DATA CONTAINER
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create empty user life data
 */
export function createEmptyUserLifeData(userId: string): UserLifeData {
  return {
    userId,
    milestones: [],
    goals: [],
    lastUpdated: new Date(),
  };
}

/**
 * Create a default life portfolio
 */
export function createDefaultLifePortfolio(userId: string): LifePortfolio {
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

  const portfolio: LifePortfolio = {
    userId,
    categories: {} as Record<LifeGoalCategory, CategorySatisfaction>,
    overallScore: 5,
  };

  for (const cat of categories) {
    portfolio.categories[cat] = {
      satisfaction: 5,
      focus: 'maintain',
    };
  }

  return portfolio;
}

/**
 * Create a new team context
 */
export function createTeamContext(userId: string): TeamContext {
  return {
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
}
