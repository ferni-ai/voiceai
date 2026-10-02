/**
 * Goal Management Types
 *
 * Goal, milestone, reflection and life-portfolio types used by the
 * life-planning goal management tools.
 */

export type GoalCategory =
  | 'career' // Work, income, professional growth
  | 'financial' // Savings, debt, investments (coordinate with Maya)
  | 'health' // Fitness, wellness, medical
  | 'relationships' // Family, friends, romance
  | 'personal-growth' // Learning, skills, hobbies
  | 'home' // Living situation, home projects
  | 'travel' // Trips, adventures
  | 'giving' // Charity, volunteering, legacy
  | 'fun'; // Recreation, entertainment, joy

export type GoalTimeframe =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'multi-year'
  | 'life';

export type GoalStatus =
  | 'not-started'
  | 'in-progress'
  | 'on-track'
  | 'at-risk'
  | 'completed'
  | 'abandoned';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: GoalCategory;
  timeframe: GoalTimeframe;

  // Timeline
  startDate: Date;
  targetDate?: Date;
  completedDate?: Date;

  // Progress
  status: GoalStatus;
  progressPercent: number;
  milestones: GoalMilestone[];

  // Metrics
  targetValue?: number;
  currentValue?: number;
  unit?: string; // e.g., "dollars", "pounds", "books"

  // Connections
  parentGoalId?: string; // For breaking down larger goals
  linkedMilestoneId?: string; // Link to a life milestone

  // Notes
  notes: string;
  reflections: GoalReflection[];

  createdAt: Date;
  updatedAt: Date;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetDate?: Date;
  completed: boolean;
  notes?: string;
}

export interface GoalReflection {
  id: string;
  date: Date;
  type: 'check-in' | 'celebration' | 'obstacle' | 'lesson' | 'pivot';
  content: string;
}

export interface LifePortfolio {
  userId: string;
  categories: Record<GoalCategory, PortfolioCategory>;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
  overallScore: number; // 1-10 life satisfaction
}

export interface PortfolioCategory {
  category: GoalCategory;
  satisfaction: number; // 1-10
  goals: Goal[];
  focus: 'maintain' | 'improve' | 'transform';
  notes?: string;
}
