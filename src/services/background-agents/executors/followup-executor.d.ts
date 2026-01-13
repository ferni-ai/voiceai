/**
 * Follow-up Executor
 *
 * Alex's domain - sends follow-up messages on user's behalf.
 * "BETTER THAN HUMAN" - We never forget to follow up.
 *
 * Features:
 * - Sends follow-up emails/messages
 * - Tracks delivery status
 * - Supports multiple channels (email, text)
 */
import type { ResultPriority } from '../result-types.js';
export interface FollowupRequest {
    userId: string;
    sessionId?: string;
    recipientName: string;
    recipientEmail?: string;
    recipientPhone?: string;
    subject: string;
    message: string;
    channel: 'email' | 'sms' | 'both';
    context?: string;
    originalConversation?: string;
    scheduledFor?: string;
    initiatedBy?: string;
    priority?: ResultPriority;
}
export interface FollowupResult {
    sent: boolean;
    channel: string;
    recipientName: string;
    messageId?: string;
    deliveryStatus: 'sent' | 'queued' | 'failed';
    error?: string;
}
/**
 * Execute a follow-up message task.
 */
export declare function executeFollowup(request: FollowupRequest): Promise<FollowupResult>;
/**
 * Queue a follow-up for background execution.
 */
export declare function queueFollowup(request: FollowupRequest): Promise<string>;
//# sourceMappingURL=followup-executor.d.ts.map