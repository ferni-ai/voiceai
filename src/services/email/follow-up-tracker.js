/**
 * Follow-Up Tracker
 *
 * Tracks sent emails that need follow-up:
 * - Emails awaiting response
 * - Response time tracking
 * - Follow-up reminders
 * - Relationship health scoring
 *
 * @module services/email/follow-up-tracker
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'follow-up-tracker' });
// ============================================================================
// FOLLOW-UP TRACKER CLASS
// ============================================================================
export class FollowUpTracker {
    followUps = new Map();
    contactPatterns = new Map();
    userId;
    constructor(userId) {
        this.userId = userId;
        log.info({ userId }, 'Follow-up tracker initialized');
    }
    // ==========================================================================
    // TRACKING
    // ==========================================================================
    /**
     * Create a follow-up for a sent email
     */
    createFollowUp(params) {
        // Get expected response time from contact pattern or use default
        const pattern = this.getContactPattern(params.sentTo);
        const expectedDays = params.expectedResponseDays || pattern.typicalResponseDays || 3;
        const dueDate = new Date(params.sentAt);
        dueDate.setDate(dueDate.getDate() + expectedDays);
        const followUp = {
            id: `fu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId: this.userId,
            sentEmailId: params.sentEmailId,
            threadId: params.threadId,
            sentTo: params.sentTo,
            sentToName: params.sentToName,
            subject: params.subject,
            sentAt: params.sentAt,
            status: 'awaiting',
            priority: params.priority || 'normal',
            expectedResponseDays: expectedDays,
            dueDate,
            reminderSent: false,
            notes: params.notes,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.followUps.set(followUp.id, followUp);
        // Update contact pattern
        pattern.emailsSent++;
        pattern.pendingFollowUps++;
        pattern.updatedAt = new Date();
        this.contactPatterns.set(params.sentTo.toLowerCase(), pattern);
        log.info({ followUpId: followUp.id, sentTo: params.sentTo, dueDate: dueDate.toISOString() }, 'Follow-up created');
        return followUp;
    }
    /**
     * Record that a response was received
     */
    recordResponse(followUpId, responseEmailId, responseReceivedAt = new Date()) {
        const followUp = this.followUps.get(followUpId);
        if (!followUp) {
            return null;
        }
        const responseTimeHours = (responseReceivedAt.getTime() - followUp.sentAt.getTime()) / (1000 * 60 * 60);
        followUp.status = 'received';
        followUp.responseEmailId = responseEmailId;
        followUp.responseReceivedAt = responseReceivedAt;
        followUp.responseTimeHours = responseTimeHours;
        followUp.closedReason = 'received_response';
        followUp.updatedAt = new Date();
        // Update contact pattern
        const pattern = this.getContactPattern(followUp.sentTo);
        pattern.responsesReceived++;
        pattern.pendingFollowUps = Math.max(0, pattern.pendingFollowUps - 1);
        pattern.responseRate = pattern.responsesReceived / pattern.emailsSent;
        // Update average response time
        const totalResponseTime = pattern.avgResponseTimeHours * (pattern.responsesReceived - 1) + responseTimeHours;
        pattern.avgResponseTimeHours = totalResponseTime / pattern.responsesReceived;
        // Update fastest/slowest
        pattern.fastestResponseHours = Math.min(pattern.fastestResponseHours || Infinity, responseTimeHours);
        pattern.slowestResponseHours = Math.max(pattern.slowestResponseHours || 0, responseTimeHours);
        // Update typical response days
        pattern.typicalResponseDays = Math.round(pattern.avgResponseTimeHours / 24);
        pattern.updatedAt = new Date();
        this.contactPatterns.set(followUp.sentTo.toLowerCase(), pattern);
        log.info({ followUpId, responseTimeHours: Math.round(responseTimeHours) }, 'Response recorded');
        return followUp;
    }
    /**
     * Check if an incoming email matches a pending follow-up
     */
    checkForResponse(incomingEmail) {
        for (const followUp of this.followUps.values()) {
            if (followUp.status !== 'awaiting')
                continue;
            // Check if same thread
            if (followUp.threadId === incomingEmail.threadId) {
                // Check if from expected recipient
                if (incomingEmail.fromEmail.toLowerCase() === followUp.sentTo.toLowerCase()) {
                    return this.recordResponse(followUp.id, incomingEmail.id, incomingEmail.date);
                }
            }
        }
        return null;
    }
    /**
     * Close a follow-up manually
     */
    closeFollowUp(followUpId, reason) {
        const followUp = this.followUps.get(followUpId);
        if (!followUp) {
            return null;
        }
        followUp.status = 'closed';
        followUp.closedReason = reason;
        followUp.updatedAt = new Date();
        // Update contact pattern
        const pattern = this.getContactPattern(followUp.sentTo);
        pattern.pendingFollowUps = Math.max(0, pattern.pendingFollowUps - 1);
        pattern.updatedAt = new Date();
        this.contactPatterns.set(followUp.sentTo.toLowerCase(), pattern);
        return followUp;
    }
    /**
     * Mark reminder sent
     */
    markReminderSent(followUpId) {
        const followUp = this.followUps.get(followUpId);
        if (!followUp) {
            return null;
        }
        followUp.status = 'reminded';
        followUp.reminderSent = true;
        followUp.reminderSentAt = new Date();
        followUp.updatedAt = new Date();
        return followUp;
    }
    // ==========================================================================
    // QUERIES
    // ==========================================================================
    /**
     * Get all pending follow-ups
     */
    getPendingFollowUps() {
        return Array.from(this.followUps.values())
            .filter((f) => f.status === 'awaiting' || f.status === 'reminded')
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    }
    /**
     * Get overdue follow-ups
     */
    getOverdueFollowUps() {
        const now = new Date();
        return this.getPendingFollowUps().filter((f) => f.dueDate < now);
    }
    /**
     * Get follow-ups due today
     */
    getDueToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.getPendingFollowUps().filter((f) => f.dueDate >= today && f.dueDate < tomorrow);
    }
    /**
     * Get follow-ups due this week
     */
    getDueThisWeek() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(today);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        return this.getPendingFollowUps().filter((f) => f.dueDate >= today && f.dueDate < endOfWeek);
    }
    /**
     * Get follow-ups by contact
     */
    getFollowUpsByContact(email) {
        const lowerEmail = email.toLowerCase();
        return Array.from(this.followUps.values())
            .filter((f) => f.sentTo.toLowerCase() === lowerEmail)
            .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    }
    /**
     * Get follow-up summary
     */
    getSummary() {
        const pending = this.getPendingFollowUps();
        const now = new Date();
        const overdue = pending.filter((f) => f.dueDate < now);
        const urgent = pending.filter((f) => f.priority === 'urgent');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endOfWeek = new Date(today);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        const dueToday = pending.filter((f) => f.dueDate >= today && f.dueDate < tomorrow);
        const dueTomorrow = pending.filter((f) => f.dueDate >= tomorrow && f.dueDate < new Date(tomorrow.getTime() + 86400000));
        const dueThisWeek = pending.filter((f) => f.dueDate >= today && f.dueDate < endOfWeek);
        // Calculate average wait days
        const totalWaitDays = pending.reduce((sum, f) => {
            const waitMs = now.getTime() - f.sentAt.getTime();
            return sum + waitMs / (1000 * 60 * 60 * 24);
        }, 0);
        // Find oldest
        const oldest = pending.reduce((max, f) => {
            const days = (now.getTime() - f.sentAt.getTime()) / (1000 * 60 * 60 * 24);
            return Math.max(max, days);
        }, 0);
        return {
            totalPending: pending.length,
            urgentCount: urgent.length,
            overdueCount: overdue.length,
            dueToday: dueToday.length,
            dueTomorrow: dueTomorrow.length,
            dueThisWeek: dueThisWeek.length,
            avgWaitDays: pending.length > 0 ? Math.round(totalWaitDays / pending.length) : 0,
            oldestPendingDays: Math.round(oldest),
        };
    }
    // ==========================================================================
    // CONTACT PATTERNS
    // ==========================================================================
    /**
     * Get contact response pattern
     */
    getContactPattern(email) {
        const lowerEmail = email.toLowerCase();
        let pattern = this.contactPatterns.get(lowerEmail);
        if (!pattern) {
            pattern = {
                email: lowerEmail,
                emailsSent: 0,
                responsesReceived: 0,
                responseRate: 0,
                avgResponseTimeHours: 0,
                fastestResponseHours: 0,
                slowestResponseHours: 0,
                typicalResponseDays: 3, // Default
                pendingFollowUps: 0,
                updatedAt: new Date(),
            };
            this.contactPatterns.set(lowerEmail, pattern);
        }
        return pattern;
    }
    /**
     * Get all contacts with low response rates
     */
    getLowResponseContacts(threshold = 0.3) {
        return Array.from(this.contactPatterns.values())
            .filter((p) => p.emailsSent >= 3 && p.responseRate < threshold)
            .sort((a, b) => a.responseRate - b.responseRate);
    }
    /**
     * Get contacts with pending follow-ups
     */
    getContactsWithPendingFollowUps() {
        return Array.from(this.contactPatterns.values())
            .filter((p) => p.pendingFollowUps > 0)
            .sort((a, b) => b.pendingFollowUps - a.pendingFollowUps);
    }
    /**
     * Suggest best time to contact
     */
    suggestBestTimeToContact(email) {
        const pattern = this.getContactPattern(email);
        if (pattern.emailsSent < 3) {
            return { avgResponseTime: 'unknown', confidence: 'low' };
        }
        const avgHours = Math.round(pattern.avgResponseTimeHours);
        let avgResponseTime;
        if (avgHours < 24) {
            avgResponseTime = `${avgHours} hours`;
        }
        else {
            avgResponseTime = `${Math.round(avgHours / 24)} days`;
        }
        return {
            bestDay: pattern.bestDayToContact,
            bestTime: pattern.bestTimeToContact,
            avgResponseTime,
            confidence: pattern.emailsSent >= 10 ? 'high' : pattern.emailsSent >= 5 ? 'medium' : 'low',
        };
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const instances = new Map();
export function getFollowUpTracker(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new FollowUpTracker(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetFollowUpTracker(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=follow-up-tracker.js.map