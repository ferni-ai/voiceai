/**
 * Twilio Webhook Handlers
 *
 * Handles incoming webhooks from Twilio for:
 * - SMS status updates (queued, sent, delivered, failed)
 * - SMS replies (inbound messages)
 * - Call status updates (initiated, ringing, answered, completed)
 * - Voicemail detection
 */
export interface TwilioSMSStatusPayload {
    MessageSid: string;
    MessageStatus: string;
    To: string;
    From: string;
    ErrorCode?: string;
    ErrorMessage?: string;
    AccountSid: string;
}
export interface TwilioInboundSMSPayload {
    MessageSid: string;
    Body: string;
    From: string;
    To: string;
    NumMedia: string;
    MediaUrl0?: string;
    MediaContentType0?: string;
    AccountSid: string;
}
export interface TwilioCallStatusPayload {
    CallSid: string;
    CallStatus: string;
    To: string;
    From: string;
    Direction: string;
    CallDuration?: string;
    AnsweredBy?: string;
    AccountSid: string;
}
export interface InboundMessage {
    id: string;
    from: string;
    body: string;
    receivedAt: Date;
    mediaUrls?: string[];
    userId?: string;
    conversationId?: string;
}
type InboundMessageHandler = (message: InboundMessage) => Promise<void>;
/**
 * Initialize webhook handlers with Twilio auth token
 */
export declare function initializeTwilioWebhooks(authToken: string): void;
/**
 * Register handler for inbound messages
 */
export declare function onInboundMessage(handler: InboundMessageHandler): void;
/**
 * Validate Twilio webhook signature
 * Uses HMAC-SHA1 as per Twilio's specification
 */
export declare function validateTwilioSignature(signature: string, url: string, params: Record<string, string>): boolean;
/**
 * Handle SMS status webhook from Twilio
 *
 * Statuses: queued, failed, sent, delivered, undelivered, receiving, received, read
 */
export declare function handleSMSStatusWebhook(payload: TwilioSMSStatusPayload, signature?: string, url?: string): Promise<{
    success: boolean;
    twiml?: string;
}>;
/**
 * Handle inbound SMS (user reply)
 */
export declare function handleInboundSMSWebhook(payload: TwilioInboundSMSPayload, signature?: string, url?: string): Promise<{
    success: boolean;
    twiml?: string;
}>;
/**
 * Handle call status webhook from Twilio
 *
 * Statuses: queued, initiated, ringing, in-progress, completed, busy, failed, no-answer, canceled
 */
export declare function handleCallStatusWebhook(payload: TwilioCallStatusPayload, signature?: string, url?: string): Promise<{
    success: boolean;
    twiml?: string;
}>;
/**
 * Handle answering machine detection
 * Returns TwiML for leaving voicemail
 */
export declare function handleVoicemailWebhook(payload: TwilioCallStatusPayload, voicemailMessage: string): Promise<{
    twiml: string;
}>;
/**
 * Get recent inbound messages
 */
export declare function getRecentInbound(limit?: number): InboundMessage[];
/**
 * Clear old inbound messages
 */
export declare function clearOldInbound(maxAgeHours?: number): number;
export declare const twilioWebhooks: {
    initialize: typeof initializeTwilioWebhooks;
    onInboundMessage: typeof onInboundMessage;
    validateSignature: typeof validateTwilioSignature;
    handleSMSStatus: typeof handleSMSStatusWebhook;
    handleInboundSMS: typeof handleInboundSMSWebhook;
    handleCallStatus: typeof handleCallStatusWebhook;
    handleVoicemail: typeof handleVoicemailWebhook;
    getRecentInbound: typeof getRecentInbound;
    clearOldInbound: typeof clearOldInbound;
};
export {};
//# sourceMappingURL=twilio-webhooks.d.ts.map