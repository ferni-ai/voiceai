/**
 * Proactive Outreach Service - Agent to User Communication
 *
 * Core service functions for agents (Ferni, Maya, Alex, etc.) to proactively
 * reach out to USERS via:
 * - SMS text messages
 * - Email
 * - Phone calls (with voice message using persona voices via Cartesia TTS)
 *
 * Use cases:
 * - Reminders ("I'll text you tomorrow at 9am about your interview")
 * - Follow-ups ("Let me check in with you next week about your progress")
 * - Celebrations ("I'll send you a congrats when you hit your goal!")
 * - Accountability ("I'll call you if you haven't logged your workout by 8pm")
 *
 * NOTE: This is for Agent → User communication.
 * For User → Contact communication, see: communication/outreach/
 *
 * The user's contact info is stored in their profile and persisted to Firestore.
 *
 * @module proactive/outreach/service
 */
import { z } from 'zod';
import { type ReminderDeliveryMethod } from '../../../../services/scheduling/reminder-scheduler.js';
interface SimpleToolDefinition {
    name: string;
    description: string;
    parameters: z.ZodType;
    handler: (params: Record<string, unknown>, context: ToolContext) => Promise<string>;
}
interface ToolContext {
    userId?: string;
    personaId?: string;
}
export interface UserContactInfo {
    phone?: string;
    email?: string;
    preferredMethod?: 'sms' | 'email' | 'call' | 'voice_message';
    timezone?: string;
}
export interface OutreachRequest {
    userId: string;
    agentId: string;
    type: 'reminder' | 'follow_up' | 'check_in' | 'celebration' | 'accountability';
    message: string;
    scheduledFor: Date;
    method: ReminderDeliveryMethod;
    contactInfo: UserContactInfo;
    context?: string;
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
 * Check if we can reach the user (async - loads from profile if needed)
 */
export declare function canReachUser(userId: string, method?: ReminderDeliveryMethod): Promise<boolean>;
/** Options for immediate sends with contact ML tracking */
export interface ImmediateContactOptions {
    /** Contact ID for ML timing learning (if this message is ABOUT a contact) */
    contactId?: string;
    /** If true, this is a direct message TO the contact (not to user about contact) */
    isDirectToContact?: boolean;
}
/**
 * Send an immediate text message to the user
 */
export declare function textUser(userId: string, message: string, personaId?: string, options?: ImmediateContactOptions): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Send an immediate email to the user
 */
export declare function emailUser(userId: string, subject: string, message: string, personaId?: string, options?: ImmediateContactOptions): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Call the user immediately using the specified persona's voice
 */
export declare function callUser(userId: string, message: string, personaId?: string, options?: ImmediateContactOptions): Promise<{
    success: boolean;
    callSid?: string;
    error?: string;
}>;
/** Options for scheduling with contact ML tracking */
export interface ScheduleContactOptions {
    /** Contact ID for ML timing learning */
    contactId?: string;
    /** Contact name for display */
    contactName?: string;
    /** If true, message goes directly TO the contact (not as reminder to self) */
    isDirectToContact?: boolean;
    /** Phone number to send to (overrides user's saved contact) */
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
export declare const proactiveOutreachTools: SimpleToolDefinition[];
/**
 * Initialize proactive outreach system
 * Call this when the agent starts
 */
export declare function initializeProactiveOutreach(): void;
declare const _default: {
    setUserContactInfo: typeof setUserContactInfo;
    getUserContactInfo: typeof getUserContactInfo;
    canReachUser: typeof canReachUser;
    textUser: typeof textUser;
    emailUser: typeof emailUser;
    callUser: typeof callUser;
    scheduleText: typeof scheduleText;
    scheduleEmail: typeof scheduleEmail;
    scheduleCall: typeof scheduleCall;
    proactiveOutreachTools: SimpleToolDefinition[];
    initializeProactiveOutreach: typeof initializeProactiveOutreach;
};
export default _default;
//# sourceMappingURL=service.d.ts.map