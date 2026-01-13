/**
 * User Contact Service
 *
 * Manages user contact information for proactive outreach.
 * This service is the source of truth for contact info,
 * used by both the outreach tools and the services layer.
 *
 * ARCHITECTURE NOTE: This service exists at Level 60 (services)
 * and can be imported by both tools (Level 70) and other services.
 */
export interface UserContactInfo {
    phone?: string;
    email?: string;
    preferredMethod?: 'sms' | 'email' | 'call' | 'voice_message';
    timezone?: string;
}
/**
 * Store user's contact information for proactive outreach.
 * Persists to Firestore via user profile for cross-session continuity.
 */
export declare function setUserContactInfo(userId: string, info: Partial<UserContactInfo>): Promise<void>;
/**
 * Get user's contact information.
 * Checks cache first, then loads from profile if not found.
 */
export declare function getUserContactInfo(userId: string): Promise<UserContactInfo | undefined>;
/**
 * Check if we can reach a user via a specific method.
 */
export declare function canReachUser(userId: string, method?: 'sms' | 'email' | 'call'): Promise<boolean>;
/**
 * Clear contact cache for a user (useful for testing or logout)
 */
export declare function clearContactCache(userId?: string): void;
/**
 * Get cached contact info without async lookup (for performance-critical paths)
 */
export declare function getCachedContactInfo(userId: string): UserContactInfo | undefined;
export interface ScheduleContactOptions {
    /** Contact ID for ML timing learning */
    contactId?: string;
    /** Contact name for display */
    contactName?: string;
    /** Whether this is a direct message TO the contact */
    isDirectToContact?: boolean;
    /** Phone to send to (overrides user's saved contact) */
    toPhone?: string;
    /** Email to send to (overrides user's saved contact) */
    toEmail?: string;
}
/**
 * Schedule a future text message
 */
export declare function scheduleText(userId: string, message: string, scheduledFor: Date, personaId?: string, options?: ScheduleContactOptions): Promise<{
    success: boolean;
    reminderId?: string;
    error?: string;
}>;
/**
 * Schedule a future email
 */
export declare function scheduleEmail(userId: string, subject: string, message: string, scheduledFor: Date, personaId?: string, options?: ScheduleContactOptions): Promise<{
    success: boolean;
    reminderId?: string;
    error?: string;
}>;
/**
 * Schedule a future phone call
 */
export declare function scheduleCall(userId: string, message: string, scheduledFor: Date, personaId?: string, options?: ScheduleContactOptions): Promise<{
    success: boolean;
    reminderId?: string;
    error?: string;
}>;
//# sourceMappingURL=user-contact.d.ts.map