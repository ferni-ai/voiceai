/**
 * Conversational Call Service - Two-Way AI Voice Calls
 *
 * Enables full two-way voice conversations where:
 * 1. Twilio makes the outbound call
 * 2. Audio streams via WebSocket to our bridge
 * 3. Bridge connects to LiveKit room with AI agent
 * 4. Agent responds in real-time using Cartesia TTS
 *
 * This is for INTERACTIVE calls where the recipient speaks back.
 * For one-way messages, use natural-call.service.ts instead.
 *
 * @module conversational-call.service
 */
export interface ConversationalCallRequest {
    /** Phone number to call */
    phone: string;
    /** Recipient's name */
    recipientName: string;
    /** User ID (for context and memory access) */
    userId: string;
    /** Persona making the call (default: ferni) */
    personaId?: string;
    /** Purpose of the call (used for agent context) */
    purpose: string;
    /** Specific objective (what should the agent accomplish?) */
    objective?: string;
    /** Initial greeting (spoken before connecting to agent) */
    greeting?: string;
    /** Call type for routing and behavior */
    callType?: 'appointment_scheduling' | 'business_inquiry' | 'personal_call' | 'follow_up' | 'general';
    /** Additional context for the agent */
    context?: Record<string, unknown>;
    /** Timeout in seconds (default: 300 = 5 minutes) */
    timeoutSeconds?: number;
}
export interface ConversationalCallResult {
    success: boolean;
    message: string;
    callSid?: string;
    roomName?: string;
    error?: string;
}
export interface CallSession {
    callId: string;
    callSid: string;
    roomName: string;
    phone: string;
    recipientName: string;
    userId: string;
    personaId: string;
    purpose: string;
    objective?: string;
    callType: string;
    status: 'initiating' | 'ringing' | 'connected' | 'ended' | 'failed';
    startedAt: Date;
    connectedAt?: Date;
    endedAt?: Date;
    duration?: number;
    outcome?: {
        success: boolean;
        summary?: string;
        extractedData?: Record<string, unknown>;
    };
}
/**
 * Get an active call session
 */
export declare function getCallSession(callId: string): CallSession | undefined;
/**
 * Get all active calls
 */
export declare function getActiveCalls(): CallSession[];
/**
 * Subscribe to call events
 */
export declare function onCallEvent(event: 'connected' | 'ended' | 'outcome', callback: (session: CallSession) => void): void;
/**
 * Check if conversational calling is properly configured
 */
export declare function isConversationalCallingConfigured(): {
    configured: boolean;
    missing: string[];
};
/**
 * Make a two-way conversational call
 *
 * The call flow:
 * 1. Create LiveKit room with agent context
 * 2. Initiate Twilio call with Stream TwiML
 * 3. Twilio streams audio to our WebSocket bridge
 * 4. Bridge connects audio to LiveKit room
 * 5. AI agent handles the conversation
 * 6. Results are captured and returned
 */
export declare function makeConversationalCall(request: ConversationalCallRequest): Promise<ConversationalCallResult>;
/**
 * Record the outcome of a call (called by agent when conversation ends)
 */
export declare function recordCallOutcome(callId: string, outcome: {
    success: boolean;
    summary?: string;
    extractedData?: Record<string, unknown>;
}): void;
declare const _default: {
    makeConversationalCall: typeof makeConversationalCall;
    recordCallOutcome: typeof recordCallOutcome;
    getCallSession: typeof getCallSession;
    getActiveCalls: typeof getActiveCalls;
    isConversationalCallingConfigured: typeof isConversationalCallingConfigured;
    onCallEvent: typeof onCallEvent;
};
export default _default;
//# sourceMappingURL=conversational-call.service.d.ts.map