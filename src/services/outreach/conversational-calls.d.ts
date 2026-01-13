/**
 * Conversational Voice Call Outreach
 *
 * > "We show up. Not because you asked. Because we noticed."
 *
 * Creates outbound voice calls where Ferni (or other personas) can:
 * - Deliver SSML-enhanced messages that sound human
 * - Have two-way conversations (not just voicemails)
 * - Handle user responses naturally
 *
 * Uses LiveKit + Twilio SIP integration for real voice calls.
 *
 * @module ConversationalCalls
 */
export interface ProactiveCallRequest {
    userId: string;
    phoneNumber: string;
    message: string;
    ssml: string;
    personaId: string;
    reason: string;
    scheduledFor?: Date;
    maxDuration?: number;
    enableConversation?: boolean;
    voicemailFallback?: boolean;
}
export interface CallResult {
    success: boolean;
    id?: string;
    callId?: string;
    twilioCallSid?: string;
    livekitRoomName?: string;
    status?: 'scheduled' | 'initiated' | 'initiating' | 'ringing' | 'answered' | 'voicemail' | 'no_answer' | 'failed';
    error?: string;
    context?: OutboundCallContext;
    initiatedAt?: string;
    answeredAt?: string;
    completedAt?: string;
    callDurationSeconds?: number;
    voicemailLeft?: boolean;
    conversationSummary?: string;
    followUpActions?: string[];
}
export interface ScheduledCall {
    id: string;
    userId: string;
    phoneNumber: string;
    message: string;
    ssml: string;
    personaId: string;
    reason: string;
    scheduledFor: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    lastAttemptAt?: string;
    completedAt?: string;
    outcome?: string;
}
/**
 * Enhance SSML for Cartesia TTS to sound natural
 *
 * Adds:
 * - Natural breathing pauses
 * - Emotional emphasis
 * - Conversational rhythm
 */
export declare function enhanceSSMLForCall(ssml: string, personaId: string): string;
/**
 * Schedule a proactive outreach call
 */
export declare function scheduleProactiveCall(request: ProactiveCallRequest): Promise<CallResult>;
export interface CallStatusUpdate {
    CallSid: string;
    CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
    CallDuration?: string;
    AnsweredBy?: 'human' | 'machine_start' | 'machine_end_beep' | 'fax' | 'unknown';
}
/**
 * Handle Twilio status callback
 */
export declare function handleCallStatusUpdate(update: CallStatusUpdate): Promise<void>;
export type CallStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type { ScheduledCall as OutboundCall };
export interface OutboundCallContext {
    userId?: string;
    phoneNumber?: string;
    message?: string;
    ssml?: string;
    personaId?: string;
    reason?: string;
    maxDuration?: number;
    trigger?: {
        id: string;
        type: string;
        reason: string;
        urgency?: 'low' | 'medium' | 'high' | 'critical';
    };
    user?: {
        id: string;
        name?: string;
        preferredName?: string;
        phone: string;
        relationshipStage?: 'new' | 'building' | 'established' | 'deep';
        timezone?: string;
    };
    context?: {
        lastConversationSummary?: string;
        activeCommitments?: string[];
        recentWins?: string[];
        avoidTopics?: string[];
        emotionalState?: string;
        insideJokes?: string[];
    };
    approach?: {
        tone?: string;
        primaryGoal?: string;
        maxDuration?: number;
        secondaryGoals?: string[];
    };
    persona?: string;
}
export interface ConversationalCallService {
    isConfigured: () => boolean;
    makeCall: (context: OutboundCallContext) => Promise<CallResult>;
    scheduleCall: (request: ProactiveCallRequest) => Promise<CallResult>;
    getActiveCall?: (callId: string) => Promise<CallResult | null>;
    getActiveCalls?: () => Promise<CallResult[]>;
    endCall?: (callId: string, reason?: string) => Promise<void>;
    updateCallSummary?: (callId: string, summary: CallSummaryUpdate) => Promise<void>;
    handleStatusCallback?: (callId: string, status: string, data?: StatusCallbackData) => Promise<void>;
    handleMachineDetection?: (callId: string, answeredBy?: string) => Promise<string | void>;
}
export interface StatusCallbackData {
    callSid?: string;
    duration?: number;
    answeredBy?: string;
}
export interface CallSummaryUpdate {
    conversationSummary?: string;
    followUpActions?: string[];
    userMood?: string;
    keyTopics?: string[];
    receptivity?: string;
}
export declare function getConversationalCallService(): ConversationalCallService;
/**
 * Check if conversational calls are configured
 */
export declare function isConversationalCallsConfigured(): boolean;
/**
 * Make a conversational call (legacy API)
 * @deprecated Use conversationalCalls.scheduleProactiveCall directly
 */
export declare function makeConversationalCall(context: OutboundCallContext): Promise<CallResult>;
/**
 * Format referral conversations for context injection
 * @deprecated Use dedicated context builder
 */
export declare function formatReferralConversationsForContext(_userId?: string): string;
export declare const conversationalCalls: {
    scheduleProactiveCall: typeof scheduleProactiveCall;
    handleCallStatusUpdate: typeof handleCallStatusUpdate;
    enhanceSSMLForCall: typeof enhanceSSMLForCall;
    isConfigured: typeof isConversationalCallsConfigured;
    makeCall: typeof makeConversationalCall;
};
export default conversationalCalls;
//# sourceMappingURL=conversational-calls.d.ts.map