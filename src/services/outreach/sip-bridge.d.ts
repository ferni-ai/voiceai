/**
 * Twilio → LiveKit SIP Bridge
 *
 * Creates a bridge between Twilio outbound calls and LiveKit rooms
 * for real-time, two-way conversational AI calls.
 *
 * Flow:
 * 1. Twilio initiates outbound call
 * 2. When answered, Twilio dials into a SIP trunk connected to LiveKit
 * 3. LiveKit room is created with the appropriate persona agent
 * 4. User has a real conversation with the AI
 */
export interface SIPBridgeConfig {
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioPhoneNumber: string;
    livekitHost: string;
    livekitApiKey: string;
    livekitApiSecret: string;
    sipTrunkNumber: string;
    sipDomain: string;
}
export interface OutboundCallOptions {
    userId: string;
    toPhone: string;
    personaId: string;
    context: string;
    message: string;
    webhookBaseUrl: string;
}
export interface CallSession {
    callSid: string;
    userId: string;
    personaId: string;
    roomName: string;
    status: 'initiating' | 'ringing' | 'connected' | 'conversation' | 'completed' | 'failed';
    startedAt: Date;
    connectedAt?: Date;
    endedAt?: Date;
    duration?: number;
    voicemailDetected?: boolean;
}
/**
 * Initialize the SIP bridge with Twilio and LiveKit credentials
 */
export declare function initializeSIPBridge(bridgeConfig: SIPBridgeConfig): void;
/**
 * Check if SIP bridge is available
 */
export declare function isSIPBridgeAvailable(): boolean;
/**
 * Initiate an outbound conversational call
 * Uses Twilio to call the user, then bridges to LiveKit for AI conversation
 */
export declare function initiateConversationalCall(options: OutboundCallOptions): Promise<{
    success: boolean;
    callSid?: string;
    roomName?: string;
    error?: string;
}>;
/**
 * Generate TwiML for initial call connection
 * Called when the user answers the phone
 */
export declare function generateCallConnectTwiML(params: {
    roomName: string;
    personaId: string;
    context: string;
    message: string;
    voicemailDetected?: boolean;
}): string;
/**
 * Generate TwiML for leaving a voicemail
 */
export declare function generateVoicemailTwiML(personaId: string, message: string): string;
/**
 * Handle Twilio call status updates
 */
export declare function handleCallStatus(callSid: string, status: string, details?: Record<string, unknown>): void;
/**
 * Handle machine detection (voicemail) callback
 */
export declare function handleMachineDetection(callSid: string, answeredBy: string): {
    isVoicemail: boolean;
};
/**
 * Get active call session
 */
export declare function getCallSession(callSid: string): CallSession | undefined;
/**
 * Get all active sessions
 */
export declare function getActiveSessions(): CallSession[];
/**
 * Mark session as in conversation (LiveKit connected)
 */
export declare function markSessionInConversation(callSid: string): void;
/**
 * End a call session
 */
export declare function endCall(callSid: string): Promise<void>;
/**
 * Create a LiveKit room for an outbound call
 * The agent will join this room when the call is connected
 */
export declare function createOutboundCallRoom(params: {
    roomName: string;
    userId: string;
    personaId: string;
    context: string;
}): Promise<{
    success: boolean;
    token?: string;
    error?: string;
}>;
export declare const sipBridge: {
    initialize: typeof initializeSIPBridge;
    isAvailable: typeof isSIPBridgeAvailable;
    initiateCall: typeof initiateConversationalCall;
    generateConnectTwiML: typeof generateCallConnectTwiML;
    generateVoicemailTwiML: typeof generateVoicemailTwiML;
    handleStatus: typeof handleCallStatus;
    handleMachineDetection: typeof handleMachineDetection;
    getSession: typeof getCallSession;
    getActiveSessions: typeof getActiveSessions;
    markInConversation: typeof markSessionInConversation;
    endCall: typeof endCall;
    createRoom: typeof createOutboundCallRoom;
};
export default sipBridge;
//# sourceMappingURL=sip-bridge.d.ts.map