/**
 * SMS Sender
 *
 * Sends SMS messages for quick confirmations and local service providers.
 * Many tradespeople prefer text over calls during work hours.
 */
import type { ConciergeTarget, ConciergeResult, ConciergeDomain, ConciergeRequirements, ConciergeRequestType } from '../types.js';
export interface SmsSenderOptions {
    userId: string;
    userName: string;
    callbackNumber?: string;
}
export interface SendSmsOptions {
    target: ConciergeTarget;
    domain: ConciergeDomain;
    type: ConciergeRequestType;
    requirements: ConciergeRequirements;
    customMessage?: string;
}
export interface SmsResult {
    success: boolean;
    result?: ConciergeResult;
    error?: string;
    messageSid?: string;
}
export declare class SmsSender {
    private userId;
    private userName;
    private callbackNumber?;
    constructor(options: SmsSenderOptions);
    /**
     * Check if SMS is configured
     */
    static isConfigured(): boolean;
    /**
     * Send an SMS to a target
     */
    send(options: SendSmsOptions): Promise<SmsResult>;
    /**
     * Generate SMS message based on domain
     */
    private generateMessage;
    private buildServiceSms;
    private buildRestaurantSms;
    private buildGenericSms;
    /**
     * Send SMS via Twilio
     */
    private sendViaTwilio;
    /**
     * Simulate SMS for development
     */
    private simulateSms;
    /**
     * Handle incoming SMS responses
     */
    handleIncomingResponse(from: string, body: string, requestId: string): Promise<void>;
}
export declare function createSmsSender(options: SmsSenderOptions): SmsSender;
//# sourceMappingURL=sms-sender.d.ts.map