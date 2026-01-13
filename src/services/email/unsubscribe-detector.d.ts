/**
 * Unsubscribe Detector
 *
 * Finds and processes unsubscribe links in emails:
 * - Detect unsubscribe links in headers and body
 * - Track newsletter subscriptions
 * - One-click unsubscribe support
 * - Unsubscribe history
 *
 * @module services/email/unsubscribe-detector
 */
export type UnsubscribeMethod = 'list_unsubscribe' | 'link' | 'email' | 'form' | 'unknown';
export type UnsubscribeStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export interface UnsubscribeLink {
    emailId: string;
    senderEmail: string;
    senderName?: string;
    senderDomain: string;
    method: UnsubscribeMethod;
    url?: string;
    email?: string;
    isOneClick: boolean;
    detectedAt: Date;
}
export interface UnsubscribeRequest {
    id: string;
    userId: string;
    link: UnsubscribeLink;
    status: UnsubscribeStatus;
    requestedAt: Date;
    completedAt?: Date;
    error?: string;
    notes?: string;
}
export interface NewsletterSubscription {
    senderEmail: string;
    senderName?: string;
    senderDomain: string;
    emailCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    wantToKeep: boolean;
    unsubscribeRequested: boolean;
    unsubscribedAt?: Date;
    unsubscribeMethod?: UnsubscribeMethod;
    unsubscribeUrl?: string;
    unsubscribeEmail?: string;
}
export declare class UnsubscribeDetector {
    private subscriptions;
    private unsubscribeRequests;
    private userId;
    constructor(userId: string);
    /**
     * Detect unsubscribe links from email headers
     */
    detectFromHeaders(emailId: string, headers: Array<{
        name: string;
        value: string;
    }>, fromEmail: string, fromName?: string): UnsubscribeLink | null;
    /**
     * Detect unsubscribe links from email body
     */
    detectFromBody(emailId: string, htmlBody: string, textBody: string, fromEmail: string, fromName?: string): UnsubscribeLink | null;
    private extractLinkFromHtml;
    private extractLinkFromText;
    /**
     * Update or create subscription record
     */
    private updateSubscription;
    /**
     * Get all tracked newsletters
     */
    getNewsletters(): NewsletterSubscription[];
    /**
     * Get newsletters with unsubscribe capability
     */
    getUnsubscribableNewsletters(): NewsletterSubscription[];
    /**
     * Get newsletters marked for unsubscribe
     */
    getPendingUnsubscribes(): NewsletterSubscription[];
    /**
     * Mark newsletter to keep
     */
    markAsWantToKeep(senderEmail: string): void;
    /**
     * Request unsubscribe from newsletter
     */
    requestUnsubscribe(senderEmail: string): UnsubscribeRequest | null;
    /**
     * Execute one-click unsubscribe (RFC 8058)
     */
    executeOneClickUnsubscribe(requestId: string): Promise<boolean>;
    /**
     * Get unsubscribe URL for manual unsubscribe
     */
    getUnsubscribeUrl(senderEmail: string): string | null;
    /**
     * Mark unsubscribe as completed (for manual unsubscribes)
     */
    markUnsubscribeComplete(requestId: string): void;
    /**
     * Get unsubscribe statistics
     */
    getStats(): {
        totalNewsletters: number;
        unsubscribable: number;
        pendingUnsubscribes: number;
        completedUnsubscribes: number;
        wantToKeep: number;
        topSenders: Array<{
            email: string;
            count: number;
        }>;
    };
    /**
     * Estimate email reduction from unsubscribing
     */
    estimateEmailReduction(): {
        monthlyEstimate: number;
        yearlyEstimate: number;
        topCandidates: Array<{
            email: string;
            monthlyEmails: number;
        }>;
    };
}
export declare function getUnsubscribeDetector(userId: string): UnsubscribeDetector;
export declare function resetUnsubscribeDetector(userId: string): void;
//# sourceMappingURL=unsubscribe-detector.d.ts.map