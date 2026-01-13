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
import { EventEmitter } from 'events';
export type NotificationType = 'milestone_approaching' | 'milestone_overdue' | 'goal_at_risk' | 'goal_check_in' | 'quarterly_review' | 'retirement_check_in' | 'celebration';
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
    checkIntervalMs: number;
    milestoneWarningDays: number[];
    goalCheckInFrequency: 'daily' | 'weekly' | 'monthly';
    enableQuarterlyReviews: boolean;
    enableRetirementCheckIns: boolean;
    enableSmartTiming: boolean;
}
declare class ProactiveScheduler extends EventEmitter {
    private config;
    private intervalId;
    private notifications;
    private userIds;
    private running;
    constructor(config?: Partial<SchedulerConfig>);
    /**
     * Start the scheduler
     */
    start(): void;
    /**
     * Stop the scheduler
     */
    stop(): void;
    /**
     * Register a user for proactive checks
     */
    registerUser(userId: string): void;
    /**
     * Unregister a user
     */
    unregisterUser(userId: string): void;
    /**
     * Run all checks for all registered users
     * Uses smart timing to only notify users at optimal times
     */
    runChecks(): Promise<void>;
    /**
     * Run checks for a single user (can be called manually)
     */
    runChecksForUser(userId: string): Promise<ProactiveNotification[]>;
    private checkUserMilestones;
    private createMilestoneApproachingNotification;
    private createMilestoneOverdueNotification;
    private checkUserGoals;
    private createGoalAtRiskNotification;
    private createGoalCelebrationNotification;
    private checkQuarterlyReview;
    private checkRetirement;
    private createNotification;
    private sendToAgentBus;
    private hasRecentNotification;
    /**
     * Get all notifications for a user
     */
    getNotificationsForUser(userId: string, limit?: number): ProactiveNotification[];
    /**
     * Get undelivered notifications for a user
     */
    getUndeliveredNotifications(userId: string): ProactiveNotification[];
    /**
     * Mark a notification as delivered
     */
    markDelivered(notificationId: string): void;
    /**
     * Mark a notification as acknowledged
     */
    markAcknowledged(notificationId: string): void;
}
export declare function getProactiveScheduler(config?: Partial<SchedulerConfig>): ProactiveScheduler;
/**
 * Start the proactive scheduler (call during app initialization)
 */
export declare function startProactiveScheduler(config?: Partial<SchedulerConfig>): ProactiveScheduler;
/**
 * Stop the proactive scheduler
 */
export declare function stopProactiveScheduler(): void;
export default getProactiveScheduler;
//# sourceMappingURL=proactive-scheduler.d.ts.map