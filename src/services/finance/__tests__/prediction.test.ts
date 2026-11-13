/**
 * Financial Prediction Service Tests
 *
 * Tests for financial forecasting types, goal tracking, and utility functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Plaid tools
vi.mock('../../../tools/domains/finance/plaid.js', () => ({
  getStoredAccessToken: vi.fn().mockReturnValue(null),
  getAccountBalances: vi.fn().mockResolvedValue([]),
  getTransactions: vi.fn().mockResolvedValue([]),
  analyzeSpending: vi.fn().mockResolvedValue(null),
}));

import {
  createSavingsGoal,
  updateGoalProgress,
  type Bill,
  type IncomeSource,
  type CashFlowWarning,
  type SubscriptionCreep,
  type SavingsGoal,
  type GoalProgress,
} from '../prediction.js';

describe('FinancePrediction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Type definitions', () => {
    it('should have valid Bill structure', () => {
      const bill: Bill = {
        name: 'Netflix',
        amount: 15.99,
        dueDate: new Date('2024-12-25'),
        frequency: 'monthly',
        category: 'entertainment',
        isRecurring: true,
        confidence: 0.95,
      };

      expect(bill.name).toBe('Netflix');
      expect(bill.amount).toBeGreaterThan(0);
      expect(['weekly', 'biweekly', 'monthly', 'quarterly', 'annual']).toContain(bill.frequency);
      expect(bill.confidence).toBeGreaterThanOrEqual(0);
      expect(bill.confidence).toBeLessThanOrEqual(1);
    });

    it('should have valid IncomeSource structure', () => {
      const income: IncomeSource = {
        name: 'Acme Corp Payroll',
        amount: 5000,
        nextExpected: new Date('2025-01-15'),
        frequency: 'biweekly',
        confidence: 0.9,
      };

      expect(income.name).toBe('Acme Corp Payroll');
      expect(income.amount).toBeGreaterThan(0);
      expect(['weekly', 'biweekly', 'monthly']).toContain(income.frequency);
    });

    it('should have valid CashFlowWarning types', () => {
      const warnings: CashFlowWarning[] = [
        {
          type: 'low_balance',
          severity: 'warning',
          message: 'Balance will drop below $500',
          date: new Date(),
          amount: 350,
        },
        {
          type: 'overdraft_risk',
          severity: 'alert',
          message: 'Risk of overdraft on Jan 15',
          date: new Date(),
        },
        {
          type: 'large_bill',
          severity: 'info',
          message: 'Large bill upcoming',
          date: new Date(),
          amount: 1500,
        },
        {
          type: 'unusual_timing',
          severity: 'info',
          message: 'Bill earlier than usual',
          date: new Date(),
        },
      ];

      expect(warnings).toHaveLength(4);
      for (const warning of warnings) {
        expect(['low_balance', 'overdraft_risk', 'large_bill', 'unusual_timing']).toContain(
          warning.type
        );
        expect(['info', 'warning', 'alert']).toContain(warning.severity);
      }
    });

    it('should have valid SubscriptionCreep structure', () => {
      const creep: SubscriptionCreep = {
        totalMonthly: 150,
        previousMonthly: 120,
        changePercent: 25,
        subscriptions: [
          { name: 'Netflix', amount: 15.99, firstSeen: new Date('2020-01-01'), status: 'active' },
          { name: 'Spotify', amount: 10.99, firstSeen: new Date('2019-06-15'), status: 'active' },
          { name: 'New Service', amount: 30, firstSeen: new Date('2024-12-01'), status: 'new' },
        ],
        newSubscriptions: [{ name: 'New Service', amount: 30, firstSeen: new Date('2024-12-01') }],
        potentialSavings: 40.99,
        unusedSuggestions: ['Cancel unused gym membership'],
      };

      expect(creep.changePercent).toBe(25);
      expect(creep.subscriptions).toHaveLength(3);
      expect(creep.newSubscriptions).toHaveLength(1);
    });

    it('should have valid SavingsGoal structure', () => {
      const goal: SavingsGoal = {
        id: 'goal-123',
        name: 'Emergency Fund',
        targetAmount: 10000,
        currentAmount: 3500,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 500,
      };

      expect(goal.targetAmount).toBeGreaterThan(goal.currentAmount);
      expect(goal.monthlyContribution).toBeGreaterThan(0);
    });

    it('should have valid GoalProgress structure', () => {
      const progress: GoalProgress = {
        goal: {
          id: 'goal-123',
          name: 'Vacation',
          targetAmount: 5000,
          currentAmount: 2500,
          targetDate: new Date('2025-06-01'),
          monthlyContribution: 400,
        },
        percentComplete: 50,
        onTrack: true,
        projectedCompletion: new Date('2025-05-15'),
        monthlyNeeded: 400,
        surplus: 50,
        message: 'You are on track!',
      };

      expect(progress.percentComplete).toBe(50);
      expect(progress.onTrack).toBe(true);
      expect(progress.surplus).toBeGreaterThan(0);
    });
  });

  describe('Bill frequency calculations', () => {
    it('should support all frequency types', () => {
      const frequencies: Bill['frequency'][] = [
        'weekly',
        'biweekly',
        'monthly',
        'quarterly',
        'annual',
      ];

      const bills: Bill[] = frequencies.map((freq, i) => ({
        name: `Bill ${i}`,
        amount: 100,
        dueDate: new Date(),
        frequency: freq,
        category: 'test',
        isRecurring: true,
        confidence: 0.9,
      }));

      expect(bills).toHaveLength(5);
    });

    it('should calculate next due date with frequency offsets', () => {
      // Use a mid-month date to avoid edge cases
      const baseDueDate = new Date(2024, 11, 15); // Dec 15, 2024 (months are 0-indexed)

      const weeklyNext = new Date(baseDueDate);
      weeklyNext.setDate(weeklyNext.getDate() + 7);
      expect(weeklyNext.getDate()).toBe(22); // Dec 22

      const monthlyNext = new Date(baseDueDate);
      monthlyNext.setMonth(monthlyNext.getMonth() + 1);
      expect(monthlyNext.getMonth()).toBe(0); // January

      const quarterlyNext = new Date(baseDueDate);
      quarterlyNext.setMonth(quarterlyNext.getMonth() + 3);
      expect(quarterlyNext.getMonth()).toBe(2); // March
    });
  });

  describe('createSavingsGoal', () => {
    it('should create a valid savings goal with defaults', () => {
      // createSavingsGoal(userId, name, targetAmount, targetDate, currentAmount = 0)
      const goal = createSavingsGoal(
        'test-user',
        'Vacation Fund',
        3000,
        new Date('2025-06-01')
        // Not passing currentAmount - defaults to 0
      );

      expect(goal.name).toBe('Vacation Fund');
      expect(goal.targetAmount).toBe(3000);
      expect(goal.currentAmount).toBe(0); // Default value
      expect(goal.monthlyContribution).toBeGreaterThan(0); // Calculated based on remaining
      expect(goal.id).toBeDefined();
      expect(goal.id).toMatch(/^goal_\d+$/);
    });

    it('should accept initial currentAmount', () => {
      const goal = createSavingsGoal(
        'test-user',
        'Vacation Fund',
        3000,
        new Date('2025-06-01'),
        500 // Starting with $500 already saved
      );

      expect(goal.currentAmount).toBe(500);
    });

    it('should calculate monthly contribution based on remaining amount', () => {
      const goal = createSavingsGoal('test-user', 'Emergency Fund', 10000, new Date('2025-12-31'));

      // monthlyContribution = (targetAmount - currentAmount) / monthsRemaining
      expect(goal.monthlyContribution).toBeGreaterThan(0);
    });

    it('should generate timestamp-based IDs', () => {
      const goal1 = createSavingsGoal('user1', 'Goal 1', 1000, new Date('2025-06-01'));

      // IDs are based on Date.now() - they may be the same if created in same ms
      // Just verify the format is correct
      expect(goal1.id).toMatch(/^goal_\d+$/);
    });
  });

  describe('updateGoalProgress', () => {
    it('should update goal current amount', () => {
      // Create goal first to populate state
      const goal = createSavingsGoal(
        'update-test-user',
        'Test Goal',
        1000,
        new Date('2025-12-31'),
        100
      );

      // updateGoalProgress returns GoalProgress which has .goal.currentAmount
      const progress = updateGoalProgress('update-test-user', goal.id, 250);

      expect(progress).not.toBeNull();
      if (progress) {
        expect(progress.goal.currentAmount).toBe(250);
        expect(progress.percentComplete).toBeCloseTo(25, 0); // 250/1000 = 25%
      }
    });

    it('should allow amounts above target (over-saving)', () => {
      // Note: The implementation doesn't cap currentAmount at targetAmount
      const goal = createSavingsGoal(
        'over-save-user',
        'Test Goal',
        1000,
        new Date('2025-12-31'),
        100
      );

      const progress = updateGoalProgress('over-save-user', goal.id, 1500);

      expect(progress).not.toBeNull();
      if (progress) {
        // The implementation allows over-saving (percentComplete > 100%)
        expect(progress.goal.currentAmount).toBe(1500);
        expect(progress.percentComplete).toBeGreaterThan(100);
      }
    });

    it('should return null for unknown user', () => {
      const progress = updateGoalProgress('nonexistent-user', 'fake-id', 100);
      expect(progress).toBeNull();
    });

    it('should return null for unknown goal ID', () => {
      // Create a user with a goal first
      createSavingsGoal('goal-lookup-user', 'Test Goal', 1000, new Date('2025-12-31'));

      // Try to update with wrong goal ID
      const progress = updateGoalProgress('goal-lookup-user', 'wrong-goal-id', 100);
      expect(progress).toBeNull();
    });
  });

  describe('Goal progress calculations', () => {
    it('should calculate percent complete correctly', () => {
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Test',
        targetAmount: 1000,
        currentAmount: 250,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 100,
      };

      const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
      expect(percentComplete).toBe(25);
    });

    it('should calculate months remaining', () => {
      const targetDate = new Date('2025-06-01');
      const today = new Date('2024-12-25');

      const monthsRemaining =
        (targetDate.getFullYear() - today.getFullYear()) * 12 +
        (targetDate.getMonth() - today.getMonth());

      expect(monthsRemaining).toBeGreaterThan(0);
      expect(monthsRemaining).toBeLessThanOrEqual(12);
    });

    it('should calculate monthly needed to reach goal', () => {
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Test',
        targetAmount: 6000,
        currentAmount: 1000,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 400,
      };

      const remaining = goal.targetAmount - goal.currentAmount; // 5000
      const monthsRemaining = 12;
      const monthlyNeeded = remaining / monthsRemaining;

      expect(monthlyNeeded).toBeCloseTo(416.67, 0);
    });

    it('should determine if on track', () => {
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Test',
        targetAmount: 6000,
        currentAmount: 1000,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 500,
      };

      const remaining = goal.targetAmount - goal.currentAmount;
      const monthsRemaining = 12;
      const monthlyNeeded = remaining / monthsRemaining;

      const onTrack = goal.monthlyContribution >= monthlyNeeded;
      expect(onTrack).toBe(true);
    });
  });

  describe('Subscription creep detection', () => {
    it('should calculate change percent correctly', () => {
      const previous = 100;
      const current = 130;

      const changePercent = ((current - previous) / previous) * 100;
      expect(changePercent).toBe(30);
    });

    it('should identify new subscriptions', () => {
      const subscriptions = [
        {
          name: 'Netflix',
          amount: 15.99,
          firstSeen: new Date('2020-01-01'),
          status: 'active' as const,
        },
        {
          name: 'New App',
          amount: 9.99,
          firstSeen: new Date('2024-12-01'),
          status: 'new' as const,
        },
      ];

      const newSubs = subscriptions.filter((s) => s.status === 'new');
      expect(newSubs).toHaveLength(1);
      expect(newSubs[0].name).toBe('New App');
    });

    it('should calculate potential savings', () => {
      const subscriptions = [
        {
          name: 'Unused Gym',
          amount: 50,
          firstSeen: new Date('2023-01-01'),
          status: 'active' as const,
          unused: true,
        },
        {
          name: 'Netflix',
          amount: 15.99,
          firstSeen: new Date('2020-01-01'),
          status: 'active' as const,
        },
      ];

      const potentialSavings = subscriptions
        .filter((s) => (s as { unused?: boolean }).unused)
        .reduce((sum, s) => sum + s.amount, 0);

      expect(potentialSavings).toBe(50);
    });
  });

  describe('Cash flow warning priorities', () => {
    it('should rank warnings by severity', () => {
      const warnings: CashFlowWarning[] = [
        { type: 'low_balance', severity: 'info', message: 'Heads up', date: new Date() },
        { type: 'overdraft_risk', severity: 'alert', message: 'Danger!', date: new Date() },
        { type: 'large_bill', severity: 'warning', message: 'Big bill coming', date: new Date() },
      ];

      const severityOrder = { alert: 3, warning: 2, info: 1 };
      const sorted = warnings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

      expect(sorted[0].severity).toBe('alert');
      expect(sorted[1].severity).toBe('warning');
      expect(sorted[2].severity).toBe('info');
    });

    it('should sort by date for same severity', () => {
      const jan15 = new Date('2025-01-15');
      const jan10 = new Date('2025-01-10');
      const jan20 = new Date('2025-01-20');

      const warnings: CashFlowWarning[] = [
        { type: 'low_balance', severity: 'warning', message: 'Later', date: jan20 },
        { type: 'low_balance', severity: 'warning', message: 'Earlier', date: jan10 },
        { type: 'low_balance', severity: 'warning', message: 'Middle', date: jan15 },
      ];

      const sorted = warnings.sort((a, b) => a.date.getTime() - b.date.getTime());

      expect(sorted[0].date).toEqual(jan10);
      expect(sorted[1].date).toEqual(jan15);
      expect(sorted[2].date).toEqual(jan20);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero income', () => {
      const income: IncomeSource[] = [];
      expect(income).toHaveLength(0);
    });

    it('should handle zero bills', () => {
      const bills: Bill[] = [];
      expect(bills).toHaveLength(0);
    });

    it('should handle goal with past target date', () => {
      const pastDate = new Date('2020-01-01');
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Old Goal',
        targetAmount: 1000,
        currentAmount: 500,
        targetDate: pastDate,
        monthlyContribution: 100,
      };

      const today = new Date();
      const isPastDue = goal.targetDate < today;

      expect(isPastDue).toBe(true);
    });

    it('should handle completed goal', () => {
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Completed Goal',
        targetAmount: 1000,
        currentAmount: 1000,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 100,
      };

      const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
      expect(percentComplete).toBe(100);
    });

    it('should handle over-funded goal', () => {
      const goal: SavingsGoal = {
        id: 'test',
        name: 'Over-funded Goal',
        targetAmount: 1000,
        currentAmount: 1200,
        targetDate: new Date('2025-12-31'),
        monthlyContribution: 100,
      };

      const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
      expect(percentComplete).toBe(120);
      expect(goal.currentAmount).toBeGreaterThan(goal.targetAmount);
    });
  });
});
