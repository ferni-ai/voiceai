/**
 * Team Services Tests
 *
 * Tests for:
 * - Agent Bus (cross-agent communication)
 * - Life Data Store (persistence)
 * - Proactive Scheduler (background notifications)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAgentBus,
  jordanRequestMayaSavingsGoal,
  jordanRequestAlexSchedule,
  jordanShareMilestoneWithMaya,
  jordanShareMilestoneWithAlex,
} from '../services/agent-bus.js';

import {
  getLifeDataStore,
  type LifeMilestone,
  type LifeGoal,
  type RetirementPlan,
} from '../services/life-data-store.js';

import {
  getProactiveScheduler,
  type ProactiveNotification,
} from '../services/proactive-scheduler.js';

describe('Team Services', () => {
  describe('Agent Bus', () => {
    it('should get singleton instance', () => {
      const bus1 = getAgentBus();
      const bus2 = getAgentBus();
      expect(bus1).toBe(bus2);
    });

    it('should send tool execution requests', async () => {
      const bus = getAgentBus();

      const result = await bus.requestToolExecution(
        'jordan',
        'maya',
        'createSavingsGoal',
        { name: 'Test Goal', amount: 5000 },
        'test-user'
      );

      expect(result).toBeDefined();
      expect(result.executedBy).toBe('maya');
    });

    it('should share context between agents', () => {
      const bus = getAgentBus();

      bus.shareContext('jordan', 'maya', { milestoneId: 'test-123', budget: 10000 }, 'test-user');

      const sharedContext = bus.getSharedContextForUser('test-user');
      expect(sharedContext.milestoneId).toBe('test-123');
      expect(sharedContext.budget).toBe(10000);
    });

    it('should send notifications', () => {
      const bus = getAgentBus();
      let notificationReceived = false;

      bus.on('notification', (msg) => {
        notificationReceived = true;
        expect(msg.type).toBe('notification');
      });

      bus.notify(
        'jordan',
        'alex',
        'milestone_approaching',
        { milestoneName: 'Wedding', daysUntil: 7 },
        'test-user'
      );

      expect(notificationReceived).toBe(true);
    });

    it('should get messages between agents', async () => {
      const bus = getAgentBus();

      // Send a few messages
      await bus.requestToolExecution('jordan', 'maya', 'test1', {}, 'user1');
      await bus.requestToolExecution('maya', 'jordan', 'test2', {}, 'user1');
      bus.shareContext('jordan', 'alex', { test: true }, 'user1');

      const messages = bus.getMessagesBetween('jordan', 'maya', 10);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should provide convenience functions for Jordan', async () => {
      const result1 = await jordanRequestMayaSavingsGoal(
        'Wedding Fund',
        25000,
        '2026-06-15',
        'test-user'
      );
      expect(result1.executedBy).toBe('maya');

      const result2 = await jordanRequestAlexSchedule(
        'Wedding Day',
        '2026-06-15',
        [30, 14, 7, 1],
        'test-user'
      );
      expect(result2.executedBy).toBe('alex');
    });

    it('should share milestone context with team', () => {
      const bus = getAgentBus();

      jordanShareMilestoneWithMaya(
        'milestone-123',
        'First Home',
        50000,
        new Date('2025-12-01'),
        'test-user'
      );

      jordanShareMilestoneWithAlex(
        'milestone-123',
        'First Home',
        new Date('2025-12-01'),
        ['Get pre-approved', 'Tour homes', 'Make offer'],
        'test-user'
      );

      const context = bus.getSharedContextForUser('test-user');
      expect(context.milestoneName).toBe('First Home');
    });
  });

  describe('Life Data Store', () => {
    it('should get singleton instance', () => {
      const store1 = getLifeDataStore();
      const store2 = getLifeDataStore();
      expect(store1).toBe(store2);
    });

    it('should create and retrieve milestones', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-1';

      const milestone: LifeMilestone = {
        id: 'test-milestone-1',
        userId,
        name: 'First Baby',
        category: 'first-baby',
        targetDate: new Date('2025-09-01'),
        status: 'planning',
        budget: 5000,
        checklist: [],
        notes: 'Exciting!',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveMilestone(userId, milestone);

      const retrieved = await store.getMilestone(userId, 'test-milestone-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('First Baby');
      expect(retrieved!.budget).toBe(5000);
    });

    it('should create and retrieve goals', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-2';

      const goal: LifeGoal = {
        id: 'test-goal-1',
        userId,
        title: 'Learn Spanish',
        category: 'personal-growth',
        timeframe: 'annual',
        startDate: new Date(),
        status: 'in-progress',
        progressPercent: 25,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveGoal(userId, goal);

      const retrieved = await store.getGoal(userId, 'test-goal-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('Learn Spanish');
      expect(retrieved!.progressPercent).toBe(25);
    });

    it('should save and retrieve retirement plan', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-3';

      const plan: RetirementPlan = {
        id: 'test-retirement-1',
        userId,
        targetAge: 60,
        currentAge: 35,
        style: 'early-retirement',
        monthlyIncomeGoal: 6000,
        currentSavings: 250000,
        savingsProgress: 25,
        visionItems: [],
        checklist: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveRetirementPlan(userId, plan);

      const retrieved = await store.getRetirementPlan(userId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.targetAge).toBe(60);
      expect(retrieved!.style).toBe('early-retirement');
    });

    it('should get life portfolio with all categories', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-4';

      const portfolio = await store.getPortfolio(userId);

      expect(portfolio).toBeDefined();
      expect(portfolio.categories.career).toBeDefined();
      expect(portfolio.categories.health).toBeDefined();
      expect(portfolio.categories.fun).toBeDefined();
      expect(Object.keys(portfolio.categories).length).toBe(9);
    });

    it('should get upcoming milestones', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-5';

      // Create milestone 10 days from now
      const tenDaysFromNow = new Date();
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

      await store.saveMilestone(userId, {
        id: 'upcoming-milestone',
        userId,
        name: 'Upcoming Event',
        category: 'other',
        targetDate: tenDaysFromNow,
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const upcoming = await store.getUpcomingMilestones(userId, 30);
      expect(upcoming.length).toBeGreaterThan(0);
      expect(upcoming[0].name).toBe('Upcoming Event');
    });

    it('should get progress summary', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-6';

      // Add some data
      await store.saveMilestone(userId, {
        id: 'summary-milestone',
        userId,
        name: 'Test Milestone',
        category: 'other',
        status: 'completed',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await store.saveGoal(userId, {
        id: 'summary-goal',
        userId,
        title: 'Test Goal',
        category: 'career',
        timeframe: 'annual',
        startDate: new Date(),
        status: 'at-risk',
        progressPercent: 10,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await store.getProgressSummary(userId);

      expect(summary.totalMilestones).toBeGreaterThan(0);
      expect(summary.completedMilestones).toBeGreaterThan(0);
      expect(summary.totalGoals).toBeGreaterThan(0);
      expect(summary.atRiskGoals).toBeGreaterThan(0);
    });

    it('should delete milestones', async () => {
      const store = getLifeDataStore();
      const userId = 'store-test-user-7';

      await store.saveMilestone(userId, {
        id: 'to-delete',
        userId,
        name: 'Delete Me',
        category: 'other',
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const deleted = await store.deleteMilestone(userId, 'to-delete');
      expect(deleted).toBe(true);

      const retrieved = await store.getMilestone(userId, 'to-delete');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Proactive Scheduler', () => {
    let scheduler: ReturnType<typeof getProactiveScheduler>;

    beforeEach(() => {
      scheduler = getProactiveScheduler({
        checkIntervalMs: 60000, // Don't actually run during tests
      });
    });

    afterEach(() => {
      scheduler.stop();
    });

    it('should get singleton instance', () => {
      const scheduler1 = getProactiveScheduler();
      const scheduler2 = getProactiveScheduler();
      expect(scheduler1).toBe(scheduler2);
    });

    it('should register and unregister users', () => {
      scheduler.registerUser('test-user-1');
      scheduler.registerUser('test-user-2');

      // Should not throw
      scheduler.unregisterUser('test-user-1');
    });

    it('should run checks for a user', async () => {
      const store = getLifeDataStore();
      const userId = 'scheduler-test-user';

      // Create an overdue milestone
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      await store.saveMilestone(userId, {
        id: 'overdue-milestone',
        userId,
        name: 'Overdue Event',
        category: 'other',
        targetDate: pastDate,
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      scheduler.registerUser(userId);
      const notifications = await scheduler.runChecksForUser(userId);

      expect(notifications.length).toBeGreaterThan(0);
      const overdueNotif = notifications.find((n) => n.type === 'milestone_overdue');
      expect(overdueNotif).toBeDefined();
      expect(overdueNotif!.priority).toBe('urgent');
    });

    it('should create approaching milestone notifications', async () => {
      const store = getLifeDataStore();
      const userId = 'scheduler-test-user-2';

      // Create milestone 5 days from now
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 5);

      await store.saveMilestone(userId, {
        id: 'soon-milestone',
        userId,
        name: 'Coming Soon',
        category: 'wedding',
        targetDate: soonDate,
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      scheduler.registerUser(userId);
      const notifications = await scheduler.runChecksForUser(userId);

      const approachingNotif = notifications.find((n) => n.type === 'milestone_approaching');
      expect(approachingNotif).toBeDefined();
    });

    it('should emit notification events', async () => {
      const store = getLifeDataStore();
      const userId = 'scheduler-test-user-3';
      let eventFired = false;

      const handler = (notif: ProactiveNotification) => {
        if (notif.userId === userId) {
          eventFired = true;
        }
      };

      scheduler.on('notification', handler);

      // Create an at-risk goal
      await store.saveGoal(userId, {
        id: 'at-risk-goal',
        userId,
        title: 'At Risk Goal',
        category: 'health',
        timeframe: 'annual',
        startDate: new Date(),
        status: 'at-risk',
        progressPercent: 5,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      scheduler.registerUser(userId);
      await scheduler.runChecksForUser(userId);

      scheduler.off('notification', handler);

      expect(eventFired).toBe(true);
    });

    it('should get notifications for user', async () => {
      const userId = 'scheduler-test-user-4';
      scheduler.registerUser(userId);

      // Run checks to generate notifications
      await scheduler.runChecksForUser(userId);

      const notifications = scheduler.getNotificationsForUser(userId);
      // May or may not have notifications depending on data
      expect(Array.isArray(notifications)).toBe(true);
    });

    it('should mark notifications as delivered and acknowledged', async () => {
      const store = getLifeDataStore();
      const userId = 'scheduler-test-user-5';

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await store.saveMilestone(userId, {
        id: 'for-marking',
        userId,
        name: 'For Marking Test',
        category: 'other',
        targetDate: pastDate,
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      scheduler.registerUser(userId);
      const notifications = await scheduler.runChecksForUser(userId);

      if (notifications.length > 0) {
        const notif = notifications[0];

        scheduler.markDelivered(notif.id);
        scheduler.markAcknowledged(notif.id);

        // Retrieve and verify
        const userNotifs = scheduler.getNotificationsForUser(userId);
        const updated = userNotifs.find((n) => n.id === notif.id);

        expect(updated?.deliveredAt).toBeDefined();
        expect(updated?.acknowledgedAt).toBeDefined();
      }
    });
  });

  describe('Integration: Team Coordination', () => {
    it('should coordinate a milestone across all services', async () => {
      const bus = getAgentBus();
      const store = getLifeDataStore();
      const scheduler = getProactiveScheduler();

      const userId = 'integration-user';
      const milestoneId = 'integration-milestone';

      // 1. Save milestone to persistent storage
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);

      await store.saveMilestone(userId, {
        id: milestoneId,
        userId,
        name: 'Wedding',
        category: 'wedding',
        targetDate,
        status: 'planning',
        budget: 25000,
        checklist: [],
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Request Maya to create savings goal via bus
      const mayaResult = await bus.requestToolExecution(
        'jordan',
        'maya',
        'createSavingsGoal',
        { name: 'Wedding Fund', amount: 25000 },
        userId
      );
      expect(mayaResult.success).toBe(true);

      // 3. Share context with team
      jordanShareMilestoneWithMaya(milestoneId, 'Wedding', 25000, targetDate, userId);
      jordanShareMilestoneWithAlex(
        milestoneId,
        'Wedding',
        targetDate,
        ['Book venue', 'Send invites'],
        userId
      );

      // 4. Register for proactive notifications
      scheduler.registerUser(userId);

      // 5. Verify everything is connected
      const sharedContext = bus.getSharedContextForUser(userId);
      expect(sharedContext.milestoneName).toBe('Wedding');

      const storedMilestone = await store.getMilestone(userId, milestoneId);
      expect(storedMilestone).toBeDefined();
      expect(storedMilestone!.budget).toBe(25000);
    });
  });
});
