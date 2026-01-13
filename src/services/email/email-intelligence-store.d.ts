/**
 * Email Intelligence Store
 *
 * Firestore persistence for email intelligence data:
 * - Sender profiles
 * - Follow-up tracking
 * - Newsletter subscriptions
 * - User preferences
 *
 * @module services/email/email-intelligence-store
 */
import type { SenderProfile, EmailIntelligenceConfig } from './email-intelligence.js';
import type { FollowUp, ContactResponsePattern } from './follow-up-tracker.js';
import type { NewsletterSubscription, UnsubscribeRequest } from './unsubscribe-detector.js';
export interface EmailIntelligenceData {
    config: EmailIntelligenceConfig;
    senderProfiles: Record<string, SenderProfile>;
    followUps: Record<string, FollowUp>;
    contactPatterns: Record<string, ContactResponsePattern>;
    newsletters: Record<string, NewsletterSubscription>;
    unsubscribeRequests: Record<string, UnsubscribeRequest>;
    lastUpdated: string;
}
/**
 * Get email intelligence data for a user
 */
export declare function getEmailIntelligenceData(userId: string): Promise<EmailIntelligenceData | null>;
/**
 * Save email intelligence data for a user
 */
export declare function saveEmailIntelligenceData(userId: string, data: EmailIntelligenceData): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Save just sender profiles (partial update)
 */
export declare function saveSenderProfiles(userId: string, profiles: Record<string, SenderProfile>): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Save just follow-ups (partial update)
 */
export declare function saveFollowUps(userId: string, followUps: Record<string, FollowUp>): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Save just newsletters (partial update)
 */
export declare function saveNewsletters(userId: string, newsletters: Record<string, NewsletterSubscription>): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Save email intelligence config
 */
export declare function saveEmailConfig(userId: string, config: EmailIntelligenceConfig): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Delete email intelligence data
 */
export declare function deleteEmailIntelligenceData(userId: string): Promise<{
    success: boolean;
    error?: string;
}>;
//# sourceMappingURL=email-intelligence-store.d.ts.map