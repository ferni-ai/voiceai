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
import type { EmailSummary } from '../gmail/gmail-service.js';
export type FollowUpStatus = 'awaiting' | 'received' | 'reminded' | 'closed' | 'expired';
export type FollowUpPriority = 'urgent' | 'high' | 'normal' | 'low';
export interface FollowUp {
    id: string;
    userId: string;
    sentEmailId: string;
    threadId: string;
    sentTo: string;
    sentToName?: string;
    subject: string;
    sentAt: Date;
    status: FollowUpStatus;
    priority: FollowUpPriority;
    responseEmailId?: string;
    responseReceivedAt?: Date;
    responseTimeHours?: number;
    expectedResponseDays: number;
    dueDate: Date;
    reminderSent: boolean;
    reminderSentAt?: Date;
    notes?: string;
    closedReason?: 'received_response' | 'manually_closed' | 'no_longer_needed' | 'expired';
    createdAt: Date;
    updatedAt: Date;
}
export interface ContactResponsePattern {
    email: string;
    name?: string;
    emailsSent: number;
    responsesReceived: number;
    responseRate: number;
    avgResponseTimeHours: number;
    fastestResponseHours: number;
    slowestResponseHours: number;
    typicalResponseDays: number;
    bestDayToContact?: string;
    bestTimeToContact?: string;
    pendingFollowUps: number;
    updatedAt: Date;
}
export interface FollowUpSummary {
    totalPending: number;
    urgentCount: number;
    overdueCount: number;
    dueToday: number;
    dueTomorrow: number;
    dueThisWeek: number;
    avgWaitDays: number;
    oldestPendingDays: number;
}
export declare class FollowUpTracker {
    private followUps;
    private contactPatterns;
    private userId;
    constructor(userId: string);
    /**
     * Create a follow-up for a sent email
     */
    createFollowUp(params: {
        sentEmailId: string;
        threadId: string;
        sentTo: string;
        sentToName?: string;
        subject: string;
        sentAt: Date;
        priority?: FollowUpPriority;
        expectedResponseDays?: number;
        notes?: string;
    }): FollowUp;
    /**
     * Record that a response was received
     */
    recordResponse(followUpId: string, responseEmailId: string, responseReceivedAt?: Date): FollowUp | null;
    /**
     * Check if an incoming email matches a pending follow-up
     */
    checkForResponse(incomingEmail: EmailSummary): FollowUp | null;
    /**
     * Close a follow-up manually
     */
    closeFollowUp(followUpId: string, reason: 'manually_closed' | 'no_longer_needed'): FollowUp | null;
    /**
     * Mark reminder sent
     */
    markReminderSent(followUpId: string): FollowUp | null;
    /**
     * Get all pending follow-ups
     */
    getPendingFollowUps(): FollowUp[];
    /**
     * Get overdue follow-ups
     */
    getOverdueFollowUps(): FollowUp[];
    /**
     * Get follow-ups due today
     */
    getDueToday(): FollowUp[];
    /**
     * Get follow-ups due this week
     */
    getDueThisWeek(): FollowUp[];
    /**
     * Get follow-ups by contact
     */
    getFollowUpsByContact(email: string): FollowUp[];
    /**
     * Get follow-up summary
     */
    getSummary(): FollowUpSummary;
    /**
     * Get contact response pattern
     */
    getContactPattern(email: string): ContactResponsePattern;
    /**
     * Get all contacts with low response rates
     */
    getLowResponseContacts(threshold?: number): ContactResponsePattern[];
    /**
     * Get contacts with pending follow-ups
     */
    getContactsWithPendingFollowUps(): ContactResponsePattern[];
    /**
     * Suggest best time to contact
     */
    suggestBestTimeToContact(email: string): {
        bestDay?: string;
        bestTime?: string;
        avgResponseTime: string;
        confidence: 'high' | 'medium' | 'low';
    };
}
export declare function getFollowUpTracker(userId: string): FollowUpTracker;
export declare function resetFollowUpTracker(userId: string): void;
//# sourceMappingURL=follow-up-tracker.d.ts.map