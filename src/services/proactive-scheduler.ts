/**
 * Proactive Scheduler - Background Check-ins and Notifications
 *
 * Periodically checks for:
 * - Upcoming milestones that need attention
 * - Goals that are at risk
 * - Quarterly review reminders
 * - Retirement check-ins
 *
 * Triggers notifications via the Agent Bus.
 */

import { getLogger } from '../utils/safe-logger.js';
import { EventEmitter } from 'events';
import { getLifeDataStore, type LifeMilestone, type LifeGoal } from './life-data-store.js';
import { getAgentBus, type AgentId } from './agent-bus.js';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'milestone_approaching'
  | 'milestone_overdue'
  | 'goal_at_risk'
  | 'goal_check_in'
  | 'quarterly_review'
  | 'retirement_check_in'
  | 'celebration';

export interface ProactiveNotification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: Date;
  deliveredAt?: Date;
  acknowledgedAt?: Date;
}

export interface SchedulerConfig {
  checkIntervalMs: number; // How often to check (default: 1 hour)
  milestoneWarningDays: number[]; // Days before milestone to warn (default: [30, 14, 7, 3, 1])
  goalCheckInFrequency: 'daily' | 'weekly' | 'monthly'; // How often to check goals
  enableQuarterlyReviews: boolean;
  enableRetirementCheckIns: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
  milestoneWarningDays: [30, 14, 7, 3, 1],
  goalCheckInFrequency: 'weekly',
  enableQuarterlyReviews: true,
  enableRetirementCheckIns: true,
};

// ============================================================================
// NOTIFICATION MESSAGES
// ============================================================================

const MILESTONE_MESSAGES = {
  approaching: {
    30: (name: string) =>
      `"${name}" is coming up in about a month! Let's make sure we're on track.`,
    14: (name: string) => `Two weeks until "${name}"! Time to finalize the details.`,
    7: (name: string) => `One week until "${name}"! Let's do a final check.`,
    3: (name: string) => `"${name}" is in just 3 days! Everything ready?`,
    1: (name: string) => `Tomorrow is "${name}"! This is so exciting!`,
  },
  overdue: (name: string, days: number) =>
    `"${name}" was scheduled ${days} days ago. Should we update the timeline or mark it complete?`,
};

const GOAL_MESSAGES = {
  atRisk: (title: string, progress: number) =>
    `Your goal "${title}" is at ${progress}% - let's figure out what's blocking progress!`,
  checkIn: (title: string, progress: number) =>
    `Quick check-in on "${title}" - you're at ${progress}%. How's it going?`,
  celebrate: (title: string) =>
    `🎉 You completed "${title}"! That's amazing - let's celebrate this win!`,
};

const REVIEW_MESSAGES = {
  quarterly:
    "Time for your quarterly review! Let's look at your progress and plan for next quarter.",
  retirement: (yearsLeft: number, progress: number) =>
    `Retirement check-in: ${yearsLeft} years to go, ${progress}% saved. Let's review your plan.`,
};

// ============================================================================
// PROACTIVE SCHEDULER CLASS
// ============================================================================

class ProactiveScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private notifications = new Map<string, ProactiveNotification>();
  private userIds = new Set<string>();
  private running = false;

  constructor(config: Partial<SchedulerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    getLogger().info({ config: this.config }, '⏰ Proactive Scheduler created');
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      getLogger().warn('Scheduler already running');
      return;
    }

    this.running = true;
    getLogger().info({ intervalMs: this.config.checkIntervalMs }, '⏰ Proactive Scheduler started');

    // Run immediately
    this.runChecks();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runChecks();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    getLogger().info('⏰ Proactive Scheduler stopped');
  }

  /**
   * Register a user for proactive checks
   */
  registerUser(userId: string): void {
    this.userIds.add(userId);
    getLogger().debug({ userId }, 'User registered for proactive checks');
  }

  /**
   * Unregister a user
   */
  unregisterUser(userId: string): void {
    this.userIds.delete(userId);
  }

  // ============================================================================
  // CHECK EXECUTION
  // ============================================================================

  /**
   * Run all checks for all registered users
   */
  async runChecks(): Promise<void> {
    getLogger().debug({ userCount: this.userIds.size }, 'Running proactive checks');

    for (const userId of this.userIds) {
      try {
        await this.checkUserMilestones(userId);
        await this.checkUserGoals(userId);

        if (this.config.enableQuarterlyReviews) {
          await this.checkQuarterlyReview(userId);
        }

        if (this.config.enableRetirementCheckIns) {
          await this.checkRetirement(userId);
        }
      } catch (error) {
        getLogger().error({ userId, error }, 'Error running proactive checks for user');
      }
    }
  }

  /**
   * Run checks for a single user (can be called manually)
   */
  async runChecksForUser(userId: string): Promise<ProactiveNotification[]> {
    const notifications: ProactiveNotification[] = [];

    const milestoneNotifs = await this.checkUserMilestones(userId);
    notifications.push(...milestoneNotifs);

    const goalNotifs = await this.checkUserGoals(userId);
    notifications.push(...goalNotifs);

    if (this.config.enableQuarterlyReviews) {
      const reviewNotif = await this.checkQuarterlyReview(userId);
      if (reviewNotif) notifications.push(reviewNotif);
    }

    if (this.config.enableRetirementCheckIns) {
      const retirementNotif = await this.checkRetirement(userId);
      if (retirementNotif) notifications.push(retirementNotif);
    }

    return notifications;
  }

  // ============================================================================
  // MILESTONE CHECKS
  // ============================================================================

  private async checkUserMilestones(userId: string): Promise<ProactiveNotification[]> {
    const store = getLifeDataStore();
    const milestones = await store.getMilestones(userId);
    const notifications: ProactiveNotification[] = [];
    const now = new Date();

    for (const milestone of milestones) {
      if (!milestone.targetDate || milestone.status === 'completed') continue;

      const daysUntil = Math.ceil(
        (milestone.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check if overdue
      if (daysUntil < 0) {
        const notif = this.createMilestoneOverdueNotification(
          userId,
          milestone,
          Math.abs(daysUntil)
        );
        notifications.push(notif);
        continue;
      }

      // Check warning thresholds
      for (const threshold of this.config.milestoneWarningDays) {
        if (daysUntil <= threshold && daysUntil > (threshold === 1 ? 0 : threshold - 7)) {
          const notif = this.createMilestoneApproachingNotification(
            userId,
            milestone,
            daysUntil,
            threshold
          );
          if (!this.hasRecentNotification(userId, `milestone_${milestone.id}_${threshold}`)) {
            notifications.push(notif);
          }
          break;
        }
      }
    }

    return notifications;
  }

  private createMilestoneApproachingNotification(
    userId: string,
    milestone: LifeMilestone,
    daysUntil: number,
    threshold: number
  ): ProactiveNotification {
    const messageFunc =
      MILESTONE_MESSAGES.approaching[threshold as keyof typeof MILESTONE_MESSAGES.approaching];
    const message = messageFunc
      ? messageFunc(milestone.name)
      : `"${milestone.name}" is ${daysUntil} days away!`;

    const notif = this.createNotification(
      userId,
      'milestone_approaching',
      daysUntil <= 3 ? 'high' : daysUntil <= 7 ? 'medium' : 'low',
      `Milestone: ${milestone.name}`,
      message,
      {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        daysUntil,
        category: milestone.category,
      }
    );

    this.sendToAgentBus(notif, 'jordan');
    return notif;
  }

  private createMilestoneOverdueNotification(
    userId: string,
    milestone: LifeMilestone,
    daysOverdue: number
  ): ProactiveNotification {
    const notif = this.createNotification(
      userId,
      'milestone_overdue',
      'urgent',
      `Overdue: ${milestone.name}`,
      MILESTONE_MESSAGES.overdue(milestone.name, daysOverdue),
      {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        daysOverdue,
      }
    );

    this.sendToAgentBus(notif, 'jordan');
    return notif;
  }

  // ============================================================================
  // GOAL CHECKS
  // ============================================================================

  private async checkUserGoals(userId: string): Promise<ProactiveNotification[]> {
    const store = getLifeDataStore();
    const goals = await store.getGoals(userId);
    const notifications: ProactiveNotification[] = [];

    for (const goal of goals) {
      // Skip already completed or abandoned goals
      if (goal.status === 'completed' || goal.status === 'abandoned') continue;

      // Check for newly completed (progress reached 100% but status not yet updated)
      if (goal.progressPercent >= 100) {
        const notif = this.createGoalCelebrationNotification(userId, goal);
        notifications.push(notif);
        continue;
      }

      // Check for at-risk
      if (goal.status === 'at-risk' || goal.progressPercent < 25) {
        if (!this.hasRecentNotification(userId, `goal_risk_${goal.id}`)) {
          const notif = this.createGoalAtRiskNotification(userId, goal);
          notifications.push(notif);
        }
      }
    }

    return notifications;
  }

  private createGoalAtRiskNotification(userId: string, goal: LifeGoal): ProactiveNotification {
    const notif = this.createNotification(
      userId,
      'goal_at_risk',
      'medium',
      `Goal Needs Attention: ${goal.title}`,
      GOAL_MESSAGES.atRisk(goal.title, goal.progressPercent),
      {
        goalId: goal.id,
        goalTitle: goal.title,
        progress: goal.progressPercent,
        category: goal.category,
      }
    );

    this.sendToAgentBus(notif, 'jordan');
    return notif;
  }

  private createGoalCelebrationNotification(userId: string, goal: LifeGoal): ProactiveNotification {
    const notif = this.createNotification(
      userId,
      'celebration',
      'high',
      `🎉 Goal Completed: ${goal.title}`,
      GOAL_MESSAGES.celebrate(goal.title),
      {
        goalId: goal.id,
        goalTitle: goal.title,
        category: goal.category,
      }
    );

    this.sendToAgentBus(notif, 'jordan');
    return notif;
  }

  // ============================================================================
  // QUARTERLY REVIEW CHECKS
  // ============================================================================

  private async checkQuarterlyReview(userId: string): Promise<ProactiveNotification | null> {
    const store = getLifeDataStore();
    const portfolio = await store.getPortfolio(userId);

    if (portfolio.nextReviewDate && new Date() >= portfolio.nextReviewDate) {
      if (!this.hasRecentNotification(userId, 'quarterly_review')) {
        const notif = this.createNotification(
          userId,
          'quarterly_review',
          'medium',
          'Time for Quarterly Review',
          REVIEW_MESSAGES.quarterly,
          { portfolioScore: portfolio.overallScore }
        );

        this.sendToAgentBus(notif, 'jordan');
        return notif;
      }
    }

    return null;
  }

  // ============================================================================
  // RETIREMENT CHECKS
  // ============================================================================

  private async checkRetirement(userId: string): Promise<ProactiveNotification | null> {
    const store = getLifeDataStore();
    const plan = await store.getRetirementPlan(userId);

    if (!plan) return null;

    const yearsToRetirement = plan.targetAge - plan.currentAge;

    // Check-in at key milestones
    const checkInYears = [20, 15, 10, 5, 3, 1];
    for (const year of checkInYears) {
      if (Math.abs(yearsToRetirement - year) < 0.5) {
        if (!this.hasRecentNotification(userId, `retirement_${year}`)) {
          const notif = this.createNotification(
            userId,
            'retirement_check_in',
            yearsToRetirement <= 5 ? 'high' : 'medium',
            `${yearsToRetirement} Years to Retirement`,
            REVIEW_MESSAGES.retirement(yearsToRetirement, plan.savingsProgress),
            {
              yearsToRetirement,
              savingsProgress: plan.savingsProgress,
              targetAge: plan.targetAge,
            }
          );

          this.sendToAgentBus(notif, 'jordan');
          return notif;
        }
      }
    }

    return null;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private createNotification(
    userId: string,
    type: NotificationType,
    priority: ProactiveNotification['priority'],
    title: string,
    message: string,
    data: Record<string, unknown>
  ): ProactiveNotification {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const notif: ProactiveNotification = {
      id,
      userId,
      type,
      priority,
      title,
      message,
      data,
      createdAt: new Date(),
    };

    this.notifications.set(id, notif);
    this.emit('notification', notif);

    getLogger().info(
      {
        notificationId: id,
        userId,
        type,
        priority,
        title,
      },
      '🔔 Proactive notification created'
    );

    return notif;
  }

  private sendToAgentBus(notification: ProactiveNotification, targetAgent: AgentId): void {
    const bus = getAgentBus();
    bus.notify(
      'jordan',
      targetAgent,
      notification.type,
      {
        notificationId: notification.id,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        ...notification.data,
      },
      notification.userId
    );
  }

  private hasRecentNotification(userId: string, key: string, hoursAgo = 24): boolean {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursAgo);

    for (const notif of this.notifications.values()) {
      if (
        notif.userId === userId &&
        notif.createdAt >= cutoff &&
        JSON.stringify(notif.data).includes(key)
      ) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // NOTIFICATION MANAGEMENT
  // ============================================================================

  /**
   * Get all notifications for a user
   */
  getNotificationsForUser(userId: string, limit = 20): ProactiveNotification[] {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get undelivered notifications for a user
   */
  getUndeliveredNotifications(userId: string): ProactiveNotification[] {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId && !n.deliveredAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Mark a notification as delivered
   */
  markDelivered(notificationId: string): void {
    const notif = this.notifications.get(notificationId);
    if (notif) {
      notif.deliveredAt = new Date();
    }
  }

  /**
   * Mark a notification as acknowledged
   */
  markAcknowledged(notificationId: string): void {
    const notif = this.notifications.get(notificationId);
    if (notif) {
      notif.acknowledgedAt = new Date();
    }
  }
}

// Singleton instance
let schedulerInstance: ProactiveScheduler | null = null;

export function getProactiveScheduler(config?: Partial<SchedulerConfig>): ProactiveScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ProactiveScheduler(config);
  }
  return schedulerInstance;
}

/**
 * Start the proactive scheduler (call during app initialization)
 */
export function startProactiveScheduler(config?: Partial<SchedulerConfig>): ProactiveScheduler {
  const scheduler = getProactiveScheduler(config);
  scheduler.start();
  return scheduler;
}

/**
 * Stop the proactive scheduler
 */
export function stopProactiveScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}

export default getProactiveScheduler;
