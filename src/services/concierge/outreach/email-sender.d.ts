/**
 * Email Sender
 *
 * Sends emails on behalf of users for formal requests and follow-ups.
 * Used for healthcare, insurance, and businesses that prefer written communication.
 */
import type { ConciergeTarget, ConciergeResult, ConciergeDomain, ConciergeRequirements, ConciergeRequestType } from '../types.js';
export interface EmailSenderOptions {
    userId: string;
    userName: string;
    userEmail: string;
    callbackNumber?: string;
}
export interface SendEmailOptions {
    target: ConciergeTarget;
    domain: ConciergeDomain;
    type: ConciergeRequestType;
    requirements: ConciergeRequirements;
    subject?: string;
    customMessage?: string;
}
export interface EmailResult {
    success: boolean;
    result?: ConciergeResult;
    error?: string;
    messageId?: string;
}
export declare class EmailSender {
    private userId;
    private userName;
    private userEmail;
    private callbackNumber?;
    constructor(options: EmailSenderOptions);
    /**
     * Check if email sending is configured
     */
    static isConfigured(): boolean;
    /**
     * Send an email to a target
     */
    send(options: SendEmailOptions): Promise<EmailResult>;
    /**
     * Generate email subject and body
     */
    private generateEmailContent;
    private buildHotelEmailContent;
    private buildHealthcareEmailContent;
    private buildInsuranceEmailContent;
    private buildServiceEmailContent;
    private buildGenericEmailContent;
    /**
     * Send email via SendGrid
     */
    private sendViaSendGrid;
    /**
     * Simulate email for development
     */
    private simulateEmail;
}
export declare function createEmailSender(options: EmailSenderOptions): EmailSender;
//# sourceMappingURL=email-sender.d.ts.map