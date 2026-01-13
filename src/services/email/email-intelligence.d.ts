/**
 * Email Intelligence Service
 *
 * ML-based email prioritization and intelligence:
 * - Importance scoring
 * - Sender reputation tracking
 * - Response urgency detection
 * - Email categorization
 * - Smart summarization
 *
 * @module services/email/email-intelligence
 */
import type { EmailSummary } from '../gmail/gmail-service.js';
export type EmailPriority = 'critical' | 'high' | 'normal' | 'low' | 'bulk';
export type EmailCategory = 'primary' | 'updates' | 'social' | 'promotions' | 'forums' | 'receipts' | 'newsletters' | 'automated' | 'personal';
export interface EmailScore {
    emailId: string;
    priority: EmailPriority;
    priorityScore: number;
    urgencyScore: number;
    importanceScore: number;
    category: EmailCategory;
    confidence: number;
    signals: {
        senderReputation: number;
        subjectUrgency: number;
        bodyImportance: number;
        timeRelevance: number;
        threadActivity: number;
        personalConnection: number;
    };
    suggestedAction: 'respond_now' | 'respond_today' | 'respond_this_week' | 'archive' | 'unsubscribe' | 'review';
    responseTimeHours?: number;
    scoredAt: Date;
}
export interface SenderProfile {
    email: string;
    name?: string;
    domain: string;
    reputationScore: number;
    emailCount: number;
    responseRate: number;
    avgResponseTimeHours: number;
    isVip: boolean;
    isAutomatic: boolean;
    isNewsletter: boolean;
    isPersonal: boolean;
    categories: EmailCategory[];
    lastEmailAt?: Date;
    lastResponseAt?: Date;
    unsubscribeRequested: boolean;
    blocked: boolean;
    updatedAt: Date;
}
export interface EmailIntelligenceConfig {
    userId: string;
    vipSenders: string[];
    priorityKeywords: string[];
    lowPriorityKeywords: string[];
    blockedDomains: string[];
    autoArchiveSenders: string[];
    workHoursStart: number;
    workHoursEnd: number;
    timezone: string;
}
export declare class EmailIntelligence {
    private senderProfiles;
    private config;
    constructor(config: EmailIntelligenceConfig);
    /**
     * Score an email for prioritization
     */
    scoreEmail(email: EmailSummary): EmailScore;
    /**
     * Batch score multiple emails
     */
    scoreEmails(emails: EmailSummary[]): EmailScore[];
    /**
     * Get top priority emails
     */
    getTopPriorityEmails(scores: EmailScore[], limit?: number): EmailScore[];
    private scoreSender;
    private scoreSubject;
    private scoreBody;
    private scoreTimeRelevance;
    private scorePersonalConnection;
    private determinePriority;
    private categorizeEmail;
    private suggestAction;
    private estimateResponseTime;
    /**
     * Get or create sender profile
     */
    getSenderProfile(email: string): SenderProfile;
    /**
     * Update sender profile based on user action
     */
    updateSenderProfile(email: string, update: Partial<SenderProfile>): void;
    /**
     * Mark sender as VIP
     */
    markAsVip(email: string): void;
    /**
     * Block sender
     */
    blockSender(email: string): void;
    /**
     * Request unsubscribe
     */
    requestUnsubscribe(email: string): void;
    private createDefaultProfile;
    /**
     * Get emails that should be auto-archived
     */
    getAutoArchiveCandidates(scores: EmailScore[]): EmailScore[];
    /**
     * Get newsletters for potential unsubscribe
     */
    getUnsubscribeCandidates(scores: EmailScore[]): EmailScore[];
    /**
     * Get summary of inbox health
     */
    getInboxHealth(scores: EmailScore[]): {
        totalEmails: number;
        criticalCount: number;
        needsAttention: number;
        canArchive: number;
        unsubscribeCandidates: number;
        avgPriorityScore: number;
    };
}
export declare function getEmailIntelligence(userId: string): EmailIntelligence;
export declare function resetEmailIntelligence(userId: string): void;
//# sourceMappingURL=email-intelligence.d.ts.map