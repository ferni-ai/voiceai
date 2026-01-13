/**
 * Conversation Context Bridge - Outreach → Voice Continuity
 *
 * When a user receives a proactive message (SMS, push, email) and then
 * starts a voice call, THIS system ensures the conversation picks up
 * with full context.
 *
 * > "Better than human" = the voice call knows WHY you reached out.
 *
 * Flow:
 * 1. Outreach sent → Store context in Firestore
 * 2. User replies/opens app → Load context
 * 3. User starts voice call → Inject context into LLM
 * 4. Ferni: "I'm glad you called back. I was thinking about..."
 *
 * @module services/outreach/conversation-context-bridge
 */
export type OutreachType = 'thinking_of_you' | 'ml_prediction' | 'life_rhythm' | 'habit_support' | 'celebration' | 'hard_date' | 'follow_up' | 'team_insight' | 'collaborative_support' | 'planning' | 'milestone_approaching';
export interface OutreachContext {
    /** Unique ID for this outreach */
    outreachId: string;
    /** User who received the outreach */
    userId: string;
    /** What triggered the outreach */
    type: OutreachType;
    /** Which persona sent it */
    personaId: string;
    /** The message that was sent */
    message: string;
    /** Channel used */
    channel: 'sms' | 'push' | 'email' | 'voice_message' | 'call';
    /** When it was sent */
    sentAt: Date;
    /** Why we reached out (for LLM context) */
    reason: string;
    /** ML confidence if prediction-driven */
    mlConfidence?: number;
    /** Specific trigger details */
    triggerDetails?: Record<string, unknown>;
    /** User's emotional state when we reached out */
    predictedEmotionalState?: string;
    /** What we hope to discuss */
    suggestedTopics?: string[];
}
export interface OutreachResponse {
    /** The outreach this responds to */
    outreachId: string;
    /** How user responded */
    responseType: 'reply' | 'tap' | 'call_back' | 'ignore';
    /** Response timestamp */
    respondedAt: Date;
    /** Reply content (if SMS reply) */
    replyContent?: string;
    /** Did they start a voice call? */
    startedVoiceCall?: boolean;
}
export interface ConversationBridgeContext {
    /** The original outreach */
    outreach: OutreachContext;
    /** User's response (if any) */
    response?: OutreachResponse;
    /** Time since outreach */
    timeSinceOutreach: number;
    /** Is this conversation a direct response to the outreach? */
    isDirectResponse: boolean;
    /** Formatted context for LLM injection */
    llmContext: string;
}
/**
 * Store outreach context when sending any proactive message.
 * Call this whenever we send SMS, push, email, or voice message.
 */
export declare function storeOutreachContext(context: OutreachContext): Promise<void>;
/**
 * Record when user responds to outreach.
 */
export declare function recordOutreachResponse(userId: string, responseType: 'reply' | 'tap' | 'call_back' | 'ignore', replyContent?: string): Promise<void>;
/**
 * Get conversation bridge context for a user starting a voice call.
 * This determines if/how the call should reference recent outreach.
 */
export declare function getConversationBridgeContext(userId: string): Promise<ConversationBridgeContext | null>;
/**
 * Format the bridge context for injection into LLM system prompt.
 * This tells Ferni WHY the user is calling and what to acknowledge.
 */
declare function formatBridgeContextForLLM(outreach: OutreachContext, response: OutreachResponse | undefined, timeSinceOutreach: number): string;
/**
 * Build context injection for the turn processor.
 * Call this from the main context builder pipeline.
 */
export declare function buildOutreachBridgeInjection(userId: string): Promise<{
    content: string;
    priority: number;
} | null>;
/**
 * Handle incoming SMS reply to an outreach message.
 * This would be called from a Twilio webhook.
 */
export declare function handleSMSReply(userId: string, fromNumber: string, body: string): Promise<{
    shouldTriggerVoiceCall: boolean;
    voiceCallContext?: ConversationBridgeContext;
}>;
/**
 * Detect if SMS reply indicates user wants a voice call.
 */
declare function detectCallIntent(message: string): boolean;
/**
 * Handle when user taps a push notification.
 * This prepares context for if they start a voice call from the app.
 */
export declare function handlePushNotificationTap(userId: string, notificationId: string, action?: string): Promise<void>;
/**
 * Clear outreach context after it's been used.
 * Call this after the first turn of a voice call that used the context.
 */
export declare function clearOutreachContext(userId: string): void;
export { formatBridgeContextForLLM, detectCallIntent };
//# sourceMappingURL=conversation-context-bridge.d.ts.map