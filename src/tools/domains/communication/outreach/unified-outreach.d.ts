/**
 * Unified Outreach Tool - "Better than Human" Communication
 *
 * THE ONE tool for reaching out to contacts. Replaces:
 * - sendMessage, sendEmail, sendSMS
 * - sendPersonalizedMessage
 * - makePhoneCall, callAndConverse
 * - sendVoiceMessage
 *
 * "Better than Human" because:
 * 1. REMEMBERS EVERYTHING - Pulls full relationship context
 * 2. PERFECT TIMING - Uses ML to pick optimal send time
 * 3. TRULY PERSONAL - LLM crafts messages from relationship history
 * 4. CHANNEL SMART - Picks best channel based on purpose + preferences
 * 5. REAL CONVERSATIONS - Can have actual dialogue, not just voicemail
 *
 * User says: "Reach out to Mom and wish her happy birthday"
 * We: Look up Mom, pull her topics/history, craft a personal message
 *     referencing things only we'd remember, send via her preferred channel
 */
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';
import { type ContactRelationship } from '../../../../services/contacts/contact-relationship-service.js';
export type OutreachIntent = 'check_in' | 'wish_well' | 'share_news' | 'ask_question' | 'follow_up' | 'important' | 'just_because' | 'schedule' | 'thank_you' | 'apology' | 'reminder';
export type Channel = 'call' | 'text' | 'email' | 'voicemail' | 'conversation';
export interface OutreachContext {
    contact: ContactRelationship;
    intent: OutreachIntent;
    purpose: string;
    userId: string;
    personaId: string;
    daysSinceLastContact: number;
    recentTopics: string[];
    pendingFollowUp?: string;
    relationshipStrength: number;
    preferredChannel?: Channel;
    bestTimeToReach?: string;
}
export interface OutreachDecision {
    channel: Channel;
    confidence: number;
    reasoning: string;
    alternatives: Channel[];
    suggestedTime?: Date;
    isNowGood: boolean;
}
export interface OutreachResult {
    success: boolean;
    channel: Channel;
    message: string;
    contactName: string;
    error?: string;
}
export declare function createUnifiedOutreachTool(ctx: ToolContext): Tool;
export declare function getUnifiedOutreachDefinition(): ToolDefinition;
export default createUnifiedOutreachTool;
//# sourceMappingURL=unified-outreach.d.ts.map