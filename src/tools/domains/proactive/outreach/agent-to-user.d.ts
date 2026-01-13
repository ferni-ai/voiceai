/**
 * Agent-to-User Outreach Tools
 *
 * Proactive outreach FROM Ferni TO the user via SMS, email, or voice call.
 * This is different from communication/outreach which handles User→Contact outreach.
 *
 * Use cases:
 * - Reminders ("I'll text you tomorrow at 9am about your interview")
 * - Follow-ups ("Let me check in with you next week about your progress")
 * - Celebrations ("I'll send you a congrats when you hit your goal!")
 * - Accountability ("I'll call you if you haven't logged your workout by 8pm")
 *
 * "Better Than Human" - Ferni never forgets to follow up
 *
 * @module proactive/outreach
 */
import type { ToolDefinition } from '../../../registry/types.js';
import { type ReminderDeliveryMethod } from '../../../../services/scheduling/reminder-scheduler.js';
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
 * Store user's contact info for proactive outreach
 */
export declare function setUserContactInfo(userId: string, contactInfo: UserContactInfo): Promise<void>;
/**
 * Get user's contact info
 */
export declare function getUserContactInfo(userId: string): Promise<UserContactInfo | null>;
/**
 * Save user contact info for proactive outreach
 */
export declare const saveContactInfoDef: ToolDefinition;
/**
 * Schedule a proactive reminder
 */
export declare const scheduleReminderDef: ToolDefinition;
/**
 * Send immediate outreach
 */
export declare const sendImmediateOutreachDef: ToolDefinition;
/**
 * Call the user
 */
export declare const callUserDef: ToolDefinition;
export declare function getAgentToUserOutreachDefinitions(): ToolDefinition[];
export default getAgentToUserOutreachDefinitions;
//# sourceMappingURL=agent-to-user.d.ts.map