/**
 * SMS Reading Tools
 *
 * Read and manage incoming SMS messages via Twilio.
 * Complements the existing SMS sending capability.
 *
 * @module simple-utilities/sms-reading-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
export interface SMSMessage {
    id: string;
    from: string;
    to: string;
    body: string;
    direction: 'inbound' | 'outbound';
    status: string;
    dateSent: string;
    dateCreated: string;
}
export interface SMSConversation {
    phoneNumber: string;
    contactName?: string;
    messages: SMSMessage[];
    lastMessageAt: string;
    unreadCount: number;
}
/**
 * Read recent SMS messages
 */
export declare const readSMSDef: ToolDefinition;
/**
 * Check for new/unread messages
 */
export declare const checkNewMessagesDef: ToolDefinition;
/**
 * Search messages
 */
export declare const searchMessagesDef: ToolDefinition;
export declare const smsReadingToolDefinitions: ToolDefinition[];
export default smsReadingToolDefinitions;
//# sourceMappingURL=sms-reading-tools.d.ts.map