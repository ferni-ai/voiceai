/**
 * Gmail Service
 *
 * Read-only access to user's Gmail inbox for Alex (Communication Specialist).
 *
 * Features:
 * - Read inbox messages
 * - Search emails
 * - Get thread details
 * - Email triage and summarization
 *
 * NOTE: This requires the user to have completed Google OAuth with Gmail scope.
 * We reuse the existing Google OAuth infrastructure from google-calendar-oauth.ts.
 *
 * @module services/gmail
 */
export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    internalDate: string;
    payload: GmailPayload;
    sizeEstimate: number;
}
export interface GmailPayload {
    partId?: string;
    mimeType: string;
    filename?: string;
    headers: GmailHeader[];
    body: {
        size: number;
        data?: string;
        attachmentId?: string;
    };
    parts?: GmailPayload[];
}
export interface GmailHeader {
    name: string;
    value: string;
}
export interface EmailSummary {
    id: string;
    threadId: string;
    from: string;
    fromEmail: string;
    to: string;
    subject: string;
    snippet: string;
    date: Date;
    isRead: boolean;
    isImportant: boolean;
    isStarred: boolean;
    labels: string[];
    hasAttachments: boolean;
}
export interface EmailThread {
    id: string;
    messages: EmailSummary[];
    subject: string;
    participants: string[];
    lastMessageDate: Date;
    messageCount: number;
    isUnread: boolean;
}
export interface InboxStats {
    unreadCount: number;
    totalToday: number;
    importantUnread: number;
    categories: {
        primary: number;
        social: number;
        promotions: number;
        updates: number;
    };
}
export interface SearchOptions {
    maxResults?: number;
    labelIds?: string[];
    query?: string;
    includeSpamTrash?: boolean;
}
/**
 * Check if Gmail is configured for a user
 *
 * Uses the same OAuth as Calendar - if Calendar works, Gmail should too
 * (assuming the OAuth scope includes Gmail read access)
 */
export declare function isGmailConfigured(userId: string): Promise<boolean>;
/**
 * Get inbox messages
 */
export declare function getInboxMessages(userId: string, options?: SearchOptions): Promise<EmailSummary[]>;
/**
 * Get unread messages
 */
export declare function getUnreadMessages(userId: string, maxResults?: number): Promise<EmailSummary[]>;
/**
 * Get important unread messages
 */
export declare function getImportantUnread(userId: string, maxResults?: number): Promise<EmailSummary[]>;
/**
 * Search emails with query
 *
 * @param query - Gmail search query (e.g., "from:boss@company.com", "is:unread subject:urgent")
 */
export declare function searchEmails(userId: string, query: string, maxResults?: number): Promise<EmailSummary[]>;
/**
 * Get inbox statistics
 */
export declare function getInboxStats(userId: string): Promise<InboxStats | null>;
/**
 * Get a specific email thread
 */
export declare function getEmailThread(userId: string, threadId: string): Promise<EmailThread | null>;
export interface TriageResult {
    urgent: EmailSummary[];
    needsResponse: EmailSummary[];
    fyi: EmailSummary[];
    promotional: EmailSummary[];
}
/**
 * Triage unread emails into categories
 *
 * Categories:
 * - urgent: Important/starred, or from known important senders
 * - needsResponse: Questions or action items detected
 * - fyi: Updates, newsletters, notifications
 * - promotional: Marketing, promotional emails
 */
export declare function triageUnreadEmails(userId: string): Promise<TriageResult | null>;
/**
 * Format email summary for voice output
 */
export declare function formatEmailForSpeech(email: EmailSummary): string;
/**
 * Format inbox summary for voice
 */
export declare function formatInboxSummaryForSpeech(stats: InboxStats, urgent: EmailSummary[]): string;
export interface ComposeEmailOptions {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType?: 'text' | 'html';
    /** Reply to existing thread */
    threadId?: string;
    /** Original message ID for In-Reply-To header */
    inReplyTo?: string;
}
export interface DraftResult {
    id: string;
    threadId: string;
    message: {
        id: string;
        labelIds: string[];
    };
}
export interface SendResult {
    success: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
}
/**
 * Create a draft email
 *
 * "Better than Human" - Draft emails for user review before sending
 */
export declare function createDraft(userId: string, options: ComposeEmailOptions): Promise<DraftResult | null>;
/**
 * Send an email directly
 *
 * "Better than Human" - Send emails on behalf of user (with consent)
 */
export declare function sendEmail(userId: string, options: ComposeEmailOptions): Promise<SendResult>;
/**
 * Reply to an existing thread
 *
 * "Better than Human" - Contextual replies that maintain conversation threads
 */
export declare function replyToThread(userId: string, threadId: string, body: string, options?: {
    bodyType?: 'text' | 'html';
    cc?: string[];
}): Promise<SendResult>;
/**
 * Update a draft and optionally send it
 */
export declare function updateDraft(userId: string, draftId: string, options: ComposeEmailOptions, sendNow?: boolean): Promise<SendResult>;
/**
 * Delete a draft
 */
export declare function deleteDraft(userId: string, draftId: string): Promise<boolean>;
/**
 * List user's drafts
 */
export declare function listDrafts(userId: string, maxResults?: number): Promise<DraftResult[]>;
export interface EmailSuggestion {
    type: 'reply' | 'followup' | 'action';
    email: EmailSummary;
    suggestion: string;
    urgency: 'high' | 'medium' | 'low';
}
/**
 * Generate email suggestions for Alex
 *
 * "Better than Human" - Proactive email management
 */
export declare function generateEmailSuggestions(userId: string): Promise<EmailSuggestion[]>;
declare const _default: {
    isGmailConfigured: typeof isGmailConfigured;
    getInboxMessages: typeof getInboxMessages;
    getUnreadMessages: typeof getUnreadMessages;
    getImportantUnread: typeof getImportantUnread;
    searchEmails: typeof searchEmails;
    getInboxStats: typeof getInboxStats;
    getEmailThread: typeof getEmailThread;
    triageUnreadEmails: typeof triageUnreadEmails;
    formatEmailForSpeech: typeof formatEmailForSpeech;
    formatInboxSummaryForSpeech: typeof formatInboxSummaryForSpeech;
    createDraft: typeof createDraft;
    sendEmail: typeof sendEmail;
    replyToThread: typeof replyToThread;
    updateDraft: typeof updateDraft;
    deleteDraft: typeof deleteDraft;
    listDrafts: typeof listDrafts;
    generateEmailSuggestions: typeof generateEmailSuggestions;
};
export default _default;
//# sourceMappingURL=gmail-service.d.ts.map