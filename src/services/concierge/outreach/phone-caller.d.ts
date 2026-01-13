/**
 * Phone Caller
 *
 * Makes outbound phone calls on behalf of users using Twilio + LiveKit.
 * This is the primary channel for getting real-time quotes and making reservations.
 *
 * "Better Than Human" - calls multiple businesses, handles hold times, negotiates rates.
 */
import type { ConciergeTarget, ConciergeResult, OutreachScript, ConciergeDomain, ConciergeRequirements } from '../types.js';
export interface PhoneCallerOptions {
    userId: string;
    userName?: string;
    callbackNumber?: string;
}
export interface CallOptions {
    target: ConciergeTarget;
    domain: ConciergeDomain;
    requirements: ConciergeRequirements;
    script?: OutreachScript;
    timeout?: number;
}
export interface CallResult {
    success: boolean;
    result?: ConciergeResult;
    error?: string;
    callSid?: string;
}
export declare class PhoneCaller {
    private userId;
    private userName?;
    private callbackNumber?;
    constructor(options: PhoneCallerOptions);
    /**
     * Check if phone calling is configured
     */
    static isConfigured(): boolean;
    /**
     * Make an outbound call to a target
     */
    call(options: CallOptions): Promise<CallResult>;
    /**
     * Execute the actual Twilio call
     */
    private executeTwilioCall;
    /**
     * Simulate a call for development/testing
     */
    private simulateCall;
    /**
     * Generate mock result data for testing
     */
    private generateMockResult;
    /**
     * Cancel an ongoing call
     */
    cancelCall(callSid: string): Promise<void>;
}
export declare function createPhoneCaller(options: PhoneCallerOptions): PhoneCaller;
//# sourceMappingURL=phone-caller.d.ts.map