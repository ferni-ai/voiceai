/**
 * Jordan's Retirement & Goal Management Tools - Unit Tests
 *
 * Tests for retirement planning, goal management, life portfolio,
 * and team integration features.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRetirementPlan,
  getRetirementPlan,
  updateRetirementSavings,
  addVisionItem,
} from '../tools/retirement-planning.js';

import {
  createGoal,
  updateGoalProgress,
  addGoalMilestone,
  addGoalReflection,
  getOrCreatePortfolio,
  updatePortfolioSatisfaction,
  type GoalCategory,
} from '../tools/domains/life-planning/goal-management.js';

import {
  createSharedGoal,
  createTeamHandoff,
  linkMilestoneToTeam,
} from '../tools/team-integration.js';

import { shouldHandoffToJordan } from '../tools/handoff/index.js';

describe('Jordan Retirement & Goal Management', () => {
  describe('Retirement Planning', () => {
    it('should create a traditional retirement plan', () => {
      const plan = createRetirementPlan(
        'ret-user-1',
        45, // current age
        65, // target age
        'traditional',
        6000 // monthly income goal
      );

      expect(plan).toBeDefined();
      expect(plan.targetAge).toBe(65);
      expect(plan.currentAge).toBe(45);
      expect(plan.style).toBe('traditional');
      expect(plan.monthlyIncomeGoal).toBe(6000);
      expect(plan.phase).toBe('accumulating'); // 20 years out
    });

    it('should create an early retirement plan', () => {
      const plan = createRetirementPlan('ret-user-2', 35, 50, 'early-retirement', 5000);

      expect(plan).toBeDefined();
      expect(plan.style).toBe('early-retirement');
      expect(plan.phase).toBe('accumulating'); // 15 years out
    });

    it('should create pre-retirement phase when close', () => {
      const plan = createRetirementPlan('ret-user-3', 58, 65, 'traditional', 7000);

      expect(plan.phase).toBe('pre-retirement'); // 7 years out
    });

    it('should create transitioning phase when very close', () => {
      const plan = createRetirementPlan('ret-user-4', 64, 65, 'traditional', 5000);

      expect(plan.phase).toBe('transitioning'); // 1 year out
    });

    it('should build appropriate checklist based on timeline', () => {
      const plan = createRetirementPlan('ret-user-5', 60, 65, 'traditional', 5000);

      expect(plan.checklist.length).toBeGreaterThan(0);
      // 5-year checklist should have items
      const fiveYearItems = plan.checklist.filter((item) => item.yearsBeforeRetirement === 5);
      expect(fiveYearItems.length).toBeGreaterThan(0);
    });

    it('should update retirement savings and calculate progress', () => {
      const plan = createRetirementPlan('ret-user-6', 50, 65, 'traditional', 5000);

      // 4% rule: need 25x annual income = 25 * 60000 = $1,500,000
      const updated = updateRetirementSavings(plan.id, 750000);

      expect(updated).toBeDefined();
      expect(updated!.currentSavings).toBe(750000);
      expect(updated!.savingsProgress).toBe(50); // 50% of $1.5M
    });

    it('should retrieve retirement plan by user ID', () => {
      const userId = 'ret-user-7';
      createRetirementPlan(userId, 40, 60, 'semi-retirement', 4000);

      const retrieved = getRetirementPlan(userId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.userId).toBe(userId);
      expect(retrieved!.style).toBe('semi-retirement');
    });

    it('should add vision items to retirement plan', () => {
      const plan = createRetirementPlan('ret-user-8', 55, 65, 'traditional', 5000);

      const item = addVisionItem(plan.id, 'travel', 'Visit every continent', 'must-have', 10000);

      expect(item).toBeDefined();
      expect(item!.category).toBe('travel');
      expect(item!.priority).toBe('must-have');
      expect(item!.estimatedCost).toBe(10000);
    });
  });

  describe('Goal Management', () => {
    it('should create a goal with all properties', async () => {
      const targetDate = new Date('2025-12-31');
      const goal = await createGoal(
        'goal-user-1',
        'Run a marathon',
        'health',
        'annual',
        targetDate,
        26.2, // miles
        'miles',
        'Complete my first marathon'
      );

      expect(goal).toBeDefined();
      expect(goal.title).toBe('Run a marathon');
      expect(goal.category).toBe('health');
      expect(goal.timeframe).toBe('annual');
      expect(goal.targetValue).toBe(26.2);
      expect(goal.unit).toBe('miles');
      expect(goal.status).toBe('not-started');
    });

    it('should update goal progress and auto-calculate status', async () => {
      const goal = await createGoal(
        'goal-user-2',
        'Read 12 books',
        'personal-growth',
        'annual',
        undefined,
        12,
        'books'
      );

      // Read 6 books
      const updated = updateGoalProgress(goal.id, undefined, 6);

      expect(updated!.currentValue).toBe(6);
      expect(updated!.progressPercent).toBe(50); // 6/12 = 50%
      expect(updated!.status).toBe('in-progress');
    });

    it('should auto-complete goal when progress reaches 100%', async () => {
      const goal = await createGoal(
        'goal-user-3',
        'Save $10,000',
        'financial',
        'annual',
        undefined,
        10000,
        'dollars'
      );

      const updated = updateGoalProgress(goal.id, undefined, 10000);

      expect(updated!.progressPercent).toBe(100);
      expect(updated!.status).toBe('completed');
      expect(updated!.completedDate).toBeDefined();
    });

    it('should add milestones to a goal', async () => {
      const goal = await createGoal('goal-user-4', 'Launch side business', 'career', 'annual');

      const milestone = addGoalMilestone(goal.id, 'Register LLC', new Date('2025-03-01'));

      expect(milestone).toBeDefined();
      expect(milestone!.title).toBe('Register LLC');
      expect(goal.milestones.length).toBe(1);
    });

    it('should add reflections to a goal', async () => {
      const goal = await createGoal('goal-user-5', 'Learn Spanish', 'personal-growth', 'annual');

      const reflection = addGoalReflection(
        goal.id,
        'celebration',
        'Had my first conversation in Spanish!'
      );

      expect(reflection).toBeDefined();
      expect(reflection!.type).toBe('celebration');
      expect(goal.reflections.length).toBe(1);
    });

    it('should create all goal categories', async () => {
      const categories: GoalCategory[] = [
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

      for (let index = 0; index < categories.length; index++) {
        const category = categories[index];
        const goal = await createGoal(
          `goal-cat-user-${index}`,
          `Test ${category} goal`,
          category,
          'quarterly'
        );
        expect(goal.category).toBe(category);
      }
    });
  });

  describe('Life Portfolio', () => {
    it('should create a life portfolio with all categories', () => {
      const portfolio = getOrCreatePortfolio('portfolio-user-1');

      expect(portfolio).toBeDefined();
      expect(Object.keys(portfolio.categories).length).toBe(9);
      expect(portfolio.categories.career).toBeDefined();
      expect(portfolio.categories.health).toBeDefined();
      expect(portfolio.categories.fun).toBeDefined();
    });

    it('should update category satisfaction', () => {
      const userId = 'portfolio-user-2';
      getOrCreatePortfolio(userId);

      const updated = updatePortfolioSatisfaction(userId, 'health', 8, 'maintain');

      expect(updated.categories.health.satisfaction).toBe(8);
      expect(updated.categories.health.focus).toBe('maintain');
    });

    it('should calculate overall score correctly', () => {
      const userId = 'portfolio-user-3';
      getOrCreatePortfolio(userId);

      // Update multiple categories
      updatePortfolioSatisfaction(userId, 'career', 8);
      updatePortfolioSatisfaction(userId, 'health', 7);
      updatePortfolioSatisfaction(userId, 'relationships', 9);

      const portfolio = getOrCreatePortfolio(userId);

      // Overall score should be average of all categories
      expect(portfolio.overallScore).toBeGreaterThan(0);
      expect(portfolio.overallScore).toBeLessThanOrEqual(10);
    });
  });

  describe('Team Integration', () => {
    it('should create a shared goal', async () => {
      const goal = await createSharedGoal(
        'team-user-1',
        'Save for vacation',
        'travel',
        5000,
        '6 months'
      );

      expect(goal).toBeDefined();
      expect(goal.title).toBe('Save for vacation');
      expect(goal.financialTarget).toBe(5000);
      expect(goal.timeline).toBe('6 months');
    });

    it('should create team handoff', async () => {
      const handoff = await createTeamHandoff(
        'team-user-2',
        'jordan',
        'maya',
        'Set up savings goal for vacation',
        { vacationBudget: 5000, destination: 'Hawaii' }
      );

      expect(handoff).toBeDefined();
      expect(handoff.fromMember).toBe('jordan');
      expect(handoff.toMember).toBe('maya');
      expect(handoff.acknowledged).toBe(false);
    });

    it('should link milestone to team coordination', async () => {
      const milestone = await linkMilestoneToTeam(
        'team-user-3',
        'milestone_123',
        'Wedding Planning',
        new Date('2026-06-15'),
        'budget_123' // Now uses mayaBudgetId instead of mayaBudgetAllocation
      );

      expect(milestone).toBeDefined();
      expect(milestone.name).toBe('Wedding Planning');
      expect(milestone.mayaBudgetId).toBe('budget_123');
    });
  });

  describe('Handoff Triggers for Jordan', () => {
    it('should trigger for retirement planning', () => {
      expect(shouldHandoffToJordan('help me plan for retirement')).toBe(true);
      expect(shouldHandoffToJordan('when can i retire')).toBe(true);
      expect(shouldHandoffToJordan('early retirement planning')).toBe(true);
      expect(shouldHandoffToJordan('fire movement advice')).toBe(true);
      expect(shouldHandoffToJordan('retirement vision')).toBe(true);
    });

    it('should trigger for goal management', () => {
      expect(shouldHandoffToJordan('help me set a goal')).toBe(true);
      expect(shouldHandoffToJordan('my life goals')).toBe(true);
      expect(shouldHandoffToJordan('quarterly review')).toBe(true);
      expect(shouldHandoffToJordan('life portfolio review')).toBe(true);
      expect(shouldHandoffToJordan('work life balance')).toBe(true);
    });

    it('should trigger for team coordination', () => {
      expect(shouldHandoffToJordan('coordinate with maya on this')).toBe(true);
      expect(shouldHandoffToJordan('team planning session')).toBe(true);
      expect(shouldHandoffToJordan('get the team together')).toBe(true);
    });

    it('should trigger for life planning categories', () => {
      expect(shouldHandoffToJordan('career goal setting')).toBe(true);
      expect(shouldHandoffToJordan('health goal for this year')).toBe(true);
      expect(shouldHandoffToJordan('personal growth plan')).toBe(true);
      expect(shouldHandoffToJordan('bucket list planning')).toBe(true);
    });
  });

  describe('Retirement Styles', () => {
    it('should support all retirement styles', () => {
      const styles = [
        'early-retirement',
        'traditional',
        'semi-retirement',
        'encore-career',
        'flexible',
      ];

      styles.forEach((style, index) => {
        const plan = createRetirementPlan(`style-user-${index}`, 45, 65, style as any, 5000);
        expect(plan.style).toBe(style);
      });
    });
  });

  describe('Goal Timeframes', () => {
    it('should support all goal timeframes', async () => {
      const timeframes = [
        'daily',
        'weekly',
        'monthly',
        'quarterly',
        'annual',
        'multi-year',
        'life',
      ];

      for (let index = 0; index < timeframes.length; index++) {
        const timeframe = timeframes[index];
        const goal = await createGoal(
          `timeframe-user-${index}`,
          `Test ${timeframe} goal`,
          'personal-growth',
          timeframe as any
        );
        expect(goal.timeframe).toBe(timeframe);
      }
    });
  });
});
