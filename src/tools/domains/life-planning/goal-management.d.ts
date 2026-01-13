/**
 * Goal Management System - Jordan's Life Goals Coordination
 *
 * Comprehensive goal management including:
 * - Annual goals and quarterly reviews
 * - Life vision and portfolio dashboard
 * - Goal tracking across all life areas
 * - Integration with Maya (financial goals) and Alex (scheduling)
 *
 * Jordan helps users set, track, and achieve their life goals.
 */
import { llm } from '@livekit/agents';
export type GoalCategory = 'career' | 'financial' | 'health' | 'relationships' | 'personal-growth' | 'home' | 'travel' | 'giving' | 'fun';
export type GoalTimeframe = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'multi-year' | 'life';
export type GoalStatus = 'not-started' | 'in-progress' | 'on-track' | 'at-risk' | 'completed' | 'abandoned';
export interface Goal {
    id: string;
    userId: string;
    title: string;
    description?: string;
    category: GoalCategory;
    timeframe: GoalTimeframe;
    startDate: Date;
    targetDate?: Date;
    completedDate?: Date;
    status: GoalStatus;
    progressPercent: number;
    milestones: GoalMilestone[];
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    parentGoalId?: string;
    linkedMilestoneId?: string;
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
    overallScore: number;
}
export interface PortfolioCategory {
    category: GoalCategory;
    satisfaction: number;
    goals: Goal[];
    focus: 'maintain' | 'improve' | 'transform';
    notes?: string;
}
export declare function createGoal(userId: string, title: string, category: GoalCategory, timeframe: GoalTimeframe, targetDate?: Date, targetValue?: number, unit?: string, description?: string): Promise<Goal>;
export declare function updateGoalProgress(goalId: string, progressPercent?: number, currentValue?: number, status?: GoalStatus): Goal | undefined;
export declare function addGoalMilestone(goalId: string, title: string, targetDate?: Date): GoalMilestone | undefined;
export declare function addGoalReflection(goalId: string, type: GoalReflection['type'], content: string): GoalReflection | undefined;
export declare function getOrCreatePortfolio(userId: string): LifePortfolio;
export declare function updatePortfolioSatisfaction(userId: string, category: GoalCategory, satisfaction: number, focus?: 'maintain' | 'improve' | 'transform'): LifePortfolio;
/**
 * Get all active goals for a user (for context enrichment)
 */
export declare function getActiveGoals(userId: string): Array<{
    id: string;
    name: string;
    category: GoalCategory;
    targetDate?: Date;
    status: string;
}>;
/**
 * Get upcoming milestones across all goals (for context enrichment)
 */
export declare function getUpcomingMilestones(userId: string, withinDays?: number): Array<{
    name: string;
    targetDate: Date;
    goalId: string;
    goalName: string;
    category: GoalCategory;
}>;
/**
 * Find events near a specific date (for "X days from now" enrichment)
 */
export declare function findEventsNearDate(userId: string, targetDate: Date, windowDays?: number): Array<{
    name: string;
    date: Date;
    type: 'goal_deadline' | 'milestone';
    daysFromTarget: number;
}>;
export declare function createGoalManagementTools(): {
    createGoal: llm.FunctionTool<{
        title: string;
        category: "relationships" | "health" | "home" | "financial" | "career" | "travel" | "fun" | "personal-growth" | "giving";
        timeframe: "quarterly" | "monthly" | "weekly" | "annual" | "daily" | "multi-year" | "life";
        userId: string;
        targetDate?: string | undefined;
        targetValue?: number | undefined;
        unit?: string | undefined;
        description?: string | undefined;
    }, unknown, string>;
    updateGoalProgress: llm.FunctionTool<{
        goalTitle: string;
        userId: string;
        progressPercent?: number | undefined;
        currentValue?: number | undefined;
        status?: "completed" | "abandoned" | "in-progress" | "not-started" | "on-track" | "at-risk" | undefined;
    }, unknown, string>;
    getGoalsSummary: llm.FunctionTool<{
        category: "relationships" | "health" | "home" | "all" | "financial" | "career" | "travel" | "fun" | "personal-growth" | "giving";
        timeframe: "all" | "quarterly" | "monthly" | "weekly" | "annual" | "daily" | "multi-year" | "life";
        userId: string;
    }, unknown, string>;
    addGoalMilestone: llm.FunctionTool<{
        goalTitle: string;
        milestoneTitle: string;
        userId: string;
        targetDate?: string | undefined;
    }, unknown, string>;
    getLifePortfolio: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    updatePortfolioSatisfaction: llm.FunctionTool<{
        category: "relationships" | "health" | "home" | "financial" | "career" | "travel" | "fun" | "personal-growth" | "giving";
        satisfaction: number;
        userId: string;
        focus?: "maintain" | "improve" | "transform" | undefined;
    }, unknown, string>;
    getGoalIdeas: llm.FunctionTool<{
        category: "relationships" | "health" | "home" | "financial" | "career" | "travel" | "fun" | "personal-growth" | "giving";
    }, unknown, string>;
    runQuarterlyReview: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    addGoalReflection: llm.FunctionTool<{
        goalTitle: string;
        type: "check-in" | "celebration" | "obstacle" | "lesson" | "pivot";
        content: string;
        userId: string;
    }, unknown, string>;
};
export default createGoalManagementTools;
//# sourceMappingURL=goal-management.d.ts.map