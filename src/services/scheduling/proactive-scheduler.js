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
import { getDefaultStore } from '../../memory/index.js';
import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getAgentBus } from '../agent-bus.js';
import { getLifeDataStore } from '../stores/life-data-store.js';
// Cache for user engagement patterns
const userEngagementPatterns = new Map();
/**
 * Learn user engagement patterns from their conversation history
 */
async function learnUserEngagementPattern(userId) {
    // Check cache first
    const cached = userEngagementPatterns.get(userId);
    if (cached)
        return cached;
    // Default pattern
    const defaultPattern = {
        preferredHours: [9, 10, 11, 14, 15, 16, 19, 20], // Business hours + evening
        preferredDays: [1, 2, 3, 4, 5], // Weekdays
        responseRate: 0.5,
        avgResponseDelayMs: 60 * 60 * 1000, // 1 hour default
    };
    try {
        const store = getDefaultStore();
        const profile = await store.getProfile(userId);
        if (profile?.conversationPatterns?.sessions) {
            const { sessions } = profile.conversationPatterns;
            const hourCounts = new Map();
            const dayCounts = new Map();
            // Count engagement by hour and day
            for (const session of sessions) {
                const start = new Date(session.startedAt);
                const hour = start.getHours();
                const day = start.getDay();
                hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
                dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
            }
            // Find top hours (above average)
            const avgHourCount = sessions.length / 24;
            const preferredHours = Array.from(hourCounts.entries())
                .filter(([_, count]) => count > avgHourCount)
                .map(([hour]) => hour)
                .sort((a, b) => a - b);
            // Find preferred days
            const avgDayCount = sessions.length / 7;
            const preferredDays = Array.from(dayCounts.entries())
                .filter(([_, count]) => count > avgDayCount)
                .map(([day]) => day)
                .sort((a, b) => a - b);
            const pattern = {
                preferredHours: preferredHours.length > 0 ? preferredHours : defaultPattern.preferredHours,
                preferredDays: preferredDays.length > 0 ? preferredDays : defaultPattern.preferredDays,
                responseRate: profile.conversationPatterns.preferences?.likesSmallTalkFirst ? 0.7 : 0.5,
                avgResponseDelayMs: (profile.conversationPatterns.preferences?.avgDuration || 10) * 60 * 1000,
            };
            userEngagementPatterns.set(userId, pattern);
            return pattern;
        }
    }
    catch (error) {
        getLogger().debug({ error, userId }, 'Could not learn engagement pattern, using defaults');
    }
    return defaultPattern;
}
/**
 * Check if now is a good time to contact a user based on their patterns
 */
function isGoodTimeForUser(pattern) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    // Check if current hour is in preferred hours (with 1-hour tolerance)
    const hourOk = pattern.preferredHours.some((h) => Math.abs(h - currentHour) <= 1);
    // Check if current day is in preferred days
    const dayOk = pattern.preferredDays.includes(currentDay);
    return hourOk && dayOk;
}
/**
 * Get the next optimal contact time for a user
 */
function getNextOptimalContactTime(pattern) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    // Find next preferred hour today
    const nextHourToday = pattern.preferredHours.find((h) => h > currentHour);
    if (nextHourToday !== undefined && pattern.preferredDays.includes(currentDay)) {
        const result = new Date(now);
        result.setHours(nextHourToday, 0, 0, 0);
        return result;
    }
    // Find next preferred day and hour
    for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
        const futureDay = (currentDay + daysAhead) % 7;
        if (pattern.preferredDays.includes(futureDay)) {
            const result = new Date(now);
            result.setDate(result.getDate() + daysAhead);
            result.setHours(pattern.preferredHours[0] || 9, 0, 0, 0);
            return result;
        }
    }
    // Fallback: tomorrow at first preferred hour
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(pattern.preferredHours[0] || 9, 0, 0, 0);
    return result;
}
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    checkIntervalMs: 60 * 60 * 1000, // 1 hour
    milestoneWarningDays: [30, 14, 7, 3, 1],
    goalCheckInFrequency: 'weekly',
    enableQuarterlyReviews: true,
    enableRetirementCheckIns: true,
    enableSmartTiming: true, // Use learned patterns by default
};
// ============================================================================
// NOTIFICATION MESSAGES
// ============================================================================
const MILESTONE_MESSAGES = {
    approaching: {
        30: (name) => `"${name}" is coming up in about a month! Let's make sure we're on track.`,
        14: (name) => `Two weeks until "${name}"! Time to finalize the details.`,
        7: (name) => `One week until "${name}"! Let's do a final check.`,
        3: (name) => `"${name}" is in just 3 days! Everything ready?`,
        1: (name) => `Tomorrow is "${name}"! This is so exciting!`,
    },
    overdue: (name, days) => `"${name}" was scheduled ${days} days ago. Should we update the timeline or mark it complete?`,
};
const GOAL_MESSAGES = {
    atRisk: (title, progress) => `Your goal "${title}" is at ${progress}% - let's figure out what's blocking progress!`,
    checkIn: (title, progress) => `Quick check-in on "${title}" - you're at ${progress}%. How's it going?`,
    celebrate: (title) => `🎉 You completed "${title}"! That's amazing - let's celebrate this win!`,
};
const REVIEW_MESSAGES = {
    quarterly: "Time for your quarterly review! Let's look at your progress and plan for next quarter.",
    retirement: (yearsLeft, progress) => `Retirement check-in: ${yearsLeft} years to go, ${progress}% saved. Let's review your plan.`,
};
// ============================================================================
// PROACTIVE SCHEDULER CLASS
// ============================================================================
class ProactiveScheduler extends EventEmitter {
    config;
    intervalId = null;
    notifications = new Map();
    userIds = new Set();
    running = false;
    constructor(config = {}) {
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
    start() {
        if (this.running) {
            getLogger().warn('Scheduler already running');
            return;
        }
        this.running = true;
        getLogger().info({ intervalMs: this.config.checkIntervalMs }, '⏰ Proactive Scheduler started');
        // Run immediately
        void this.runChecks();
        // Then run on interval
        registerInterval('proactive-scheduler-checks', () => void this.runChecks(), this.config.checkIntervalMs);
    }
    /**
     * Stop the scheduler
     */
    stop() {
        clearNamedInterval('proactive-scheduler-checks');
        this.intervalId = null;
        this.running = false;
        getLogger().info('⏰ Proactive Scheduler stopped');
    }
    /**
     * Register a user for proactive checks
     */
    registerUser(userId) {
        this.userIds.add(userId);
        getLogger().debug({ userId }, 'User registered for proactive checks');
    }
    /**
     * Unregister a user
     */
    unregisterUser(userId) {
        this.userIds.delete(userId);
    }
    // ============================================================================
    // CHECK EXECUTION
    // ============================================================================
    /**
     * Run all checks for all registered users
     * Uses smart timing to only notify users at optimal times
     */
    async runChecks() {
        getLogger().debug({ userCount: this.userIds.size }, 'Running proactive checks');
        for (const userId of this.userIds) {
            try {
                // Smart timing: check if now is a good time for this user
                if (this.config.enableSmartTiming) {
                    const pattern = await learnUserEngagementPattern(userId);
                    if (!isGoodTimeForUser(pattern)) {
                        // Schedule for optimal time instead of now
                        const optimalTime = getNextOptimalContactTime(pattern);
                        getLogger().debug({ userId, optimalTime: optimalTime.toISOString() }, 'Skipping user - not optimal time, will try later');
                        continue;
                    }
                }
                await this.checkUserMilestones(userId);
                await this.checkUserGoals(userId);
                if (this.config.enableQuarterlyReviews) {
                    await this.checkQuarterlyReview(userId);
                }
                if (this.config.enableRetirementCheckIns) {
                    await this.checkRetirement(userId);
                }
            }
            catch (error) {
                getLogger().error({ userId, error }, 'Error running proactive checks for user');
            }
        }
    }
    /**
     * Run checks for a single user (can be called manually)
     */
    async runChecksForUser(userId) {
        const notifications = [];
        const milestoneNotifs = await this.checkUserMilestones(userId);
        notifications.push(...milestoneNotifs);
        const goalNotifs = await this.checkUserGoals(userId);
        notifications.push(...goalNotifs);
        if (this.config.enableQuarterlyReviews) {
            const reviewNotif = await this.checkQuarterlyReview(userId);
            if (reviewNotif)
                notifications.push(reviewNotif);
        }
        if (this.config.enableRetirementCheckIns) {
            const retirementNotif = await this.checkRetirement(userId);
            if (retirementNotif)
                notifications.push(retirementNotif);
        }
        return notifications;
    }
    // ============================================================================
    // MILESTONE CHECKS
    // ============================================================================
    async checkUserMilestones(userId) {
        const store = getLifeDataStore();
        const milestones = await store.getMilestones(userId);
        const notifications = [];
        const now = new Date();
        for (const milestone of milestones) {
            if (!milestone.targetDate || milestone.status === 'completed')
                continue;
            const daysUntil = Math.ceil((milestone.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            // Check if overdue
            if (daysUntil < 0) {
                const notif = this.createMilestoneOverdueNotification(userId, milestone, Math.abs(daysUntil));
                notifications.push(notif);
                continue;
            }
            // Check warning thresholds
            for (const threshold of this.config.milestoneWarningDays) {
                if (daysUntil <= threshold && daysUntil > (threshold === 1 ? 0 : threshold - 7)) {
                    const notif = this.createMilestoneApproachingNotification(userId, milestone, daysUntil, threshold);
                    if (!this.hasRecentNotification(userId, `milestone_${milestone.id}_${threshold}`)) {
                        notifications.push(notif);
                    }
                    break;
                }
            }
        }
        return notifications;
    }
    createMilestoneApproachingNotification(userId, milestone, daysUntil, threshold) {
        const messageFunc = MILESTONE_MESSAGES.approaching[threshold];
        const message = messageFunc
            ? messageFunc(milestone.name)
            : `"${milestone.name}" is ${daysUntil} days away!`;
        const notif = this.createNotification(userId, 'milestone_approaching', daysUntil <= 3 ? 'high' : daysUntil <= 7 ? 'medium' : 'low', `Milestone: ${milestone.name}`, message, {
            milestoneId: milestone.id,
            milestoneName: milestone.name,
            daysUntil,
            category: milestone.category,
        });
        this.sendToAgentBus(notif, 'jordan');
        return notif;
    }
    createMilestoneOverdueNotification(userId, milestone, daysOverdue) {
        const notif = this.createNotification(userId, 'milestone_overdue', 'urgent', `Overdue: ${milestone.name}`, MILESTONE_MESSAGES.overdue(milestone.name, daysOverdue), {
            milestoneId: milestone.id,
            milestoneName: milestone.name,
            daysOverdue,
        });
        this.sendToAgentBus(notif, 'jordan');
        return notif;
    }
    // ============================================================================
    // GOAL CHECKS
    // ============================================================================
    async checkUserGoals(userId) {
        const store = getLifeDataStore();
        const goals = await store.getGoals(userId);
        const notifications = [];
        for (const goal of goals) {
            // Skip already completed or abandoned goals
            if (goal.status === 'completed' || goal.status === 'abandoned')
                continue;
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
    createGoalAtRiskNotification(userId, goal) {
        const notif = this.createNotification(userId, 'goal_at_risk', 'medium', `Goal Needs Attention: ${goal.title}`, GOAL_MESSAGES.atRisk(goal.title, goal.progressPercent), {
            goalId: goal.id,
            goalTitle: goal.title,
            progress: goal.progressPercent,
            category: goal.category,
        });
        this.sendToAgentBus(notif, 'jordan');
        return notif;
    }
    createGoalCelebrationNotification(userId, goal) {
        const notif = this.createNotification(userId, 'celebration', 'high', `🎉 Goal Completed: ${goal.title}`, GOAL_MESSAGES.celebrate(goal.title), {
            goalId: goal.id,
            goalTitle: goal.title,
            category: goal.category,
        });
        this.sendToAgentBus(notif, 'jordan');
        return notif;
    }
    // ============================================================================
    // QUARTERLY REVIEW CHECKS
    // ============================================================================
    async checkQuarterlyReview(userId) {
        const store = getLifeDataStore();
        const portfolio = await store.getPortfolio(userId);
        if (portfolio.nextReviewDate && new Date() >= portfolio.nextReviewDate) {
            if (!this.hasRecentNotification(userId, 'quarterly_review')) {
                const notif = this.createNotification(userId, 'quarterly_review', 'medium', 'Time for Quarterly Review', REVIEW_MESSAGES.quarterly, { portfolioScore: portfolio.overallScore });
                this.sendToAgentBus(notif, 'jordan');
                return notif;
            }
        }
        return null;
    }
    // ============================================================================
    // RETIREMENT CHECKS
    // ============================================================================
    async checkRetirement(userId) {
        const store = getLifeDataStore();
        const plan = await store.getRetirementPlan(userId);
        if (!plan)
            return null;
        const yearsToRetirement = plan.targetAge - plan.currentAge;
        // Check-in at key milestones
        const checkInYears = [20, 15, 10, 5, 3, 1];
        for (const year of checkInYears) {
            if (Math.abs(yearsToRetirement - year) < 0.5) {
                if (!this.hasRecentNotification(userId, `retirement_${year}`)) {
                    const notif = this.createNotification(userId, 'retirement_check_in', yearsToRetirement <= 5 ? 'high' : 'medium', `${yearsToRetirement} Years to Retirement`, REVIEW_MESSAGES.retirement(yearsToRetirement, plan.savingsProgress), {
                        yearsToRetirement,
                        savingsProgress: plan.savingsProgress,
                        targetAge: plan.targetAge,
                    });
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
    createNotification(userId, type, priority, title, message, data) {
        const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const notif = {
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
        getLogger().info({
            notificationId: id,
            userId,
            type,
            priority,
            title,
        }, '🔔 Proactive notification created');
        return notif;
    }
    sendToAgentBus(notification, targetAgent) {
        const bus = getAgentBus();
        bus.notify('jordan', targetAgent, notification.type, {
            notificationId: notification.id,
            title: notification.title,
            message: notification.message,
            priority: notification.priority,
            ...notification.data,
        }, notification.userId);
    }
    hasRecentNotification(userId, key, hoursAgo = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hoursAgo);
        for (const notif of this.notifications.values()) {
            if (notif.userId === userId &&
                notif.createdAt >= cutoff &&
                JSON.stringify(notif.data).includes(key)) {
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
    getNotificationsForUser(userId, limit = 20) {
        return Array.from(this.notifications.values())
            .filter((n) => n.userId === userId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }
    /**
     * Get undelivered notifications for a user
     */
    getUndeliveredNotifications(userId) {
        return Array.from(this.notifications.values())
            .filter((n) => n.userId === userId && !n.deliveredAt)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    /**
     * Mark a notification as delivered
     */
    markDelivered(notificationId) {
        const notif = this.notifications.get(notificationId);
        if (notif) {
            notif.deliveredAt = new Date();
        }
    }
    /**
     * Mark a notification as acknowledged
     */
    markAcknowledged(notificationId) {
        const notif = this.notifications.get(notificationId);
        if (notif) {
            notif.acknowledgedAt = new Date();
        }
    }
}
// Singleton instance
let schedulerInstance = null;
export function getProactiveScheduler(config) {
    if (!schedulerInstance) {
        schedulerInstance = new ProactiveScheduler(config);
    }
    return schedulerInstance;
}
/**
 * Start the proactive scheduler (call during app initialization)
 */
export function startProactiveScheduler(config) {
    const scheduler = getProactiveScheduler(config);
    scheduler.start();
    return scheduler;
}
/**
 * Stop the proactive scheduler
 */
export function stopProactiveScheduler() {
    if (schedulerInstance) {
        schedulerInstance.stop();
    }
}
export default getProactiveScheduler;
//# sourceMappingURL=proactive-scheduler.js.map