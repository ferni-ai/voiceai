/**
 * Communication Service
 *
 * Core communication functions: email, SMS, reminders.
 * This is the implementation layer - use this for direct API calls.
 *
 * For LLM tools, use `tools/domains/communication/` instead.
 */
/**
 * Send an email via SendGrid
 *
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param body - Email body content
 * @param isHtml - Whether body is HTML (default: false)
 */
export declare function sendEmail(to: string, subject: string, body: string, isHtml?: boolean): Promise<string>;
/**
 * Send an SMS via Twilio
 */
export declare function sendSMS(to: string, message: string): Promise<string>;
/**
 * Send a reminder via SMS
 *
 * @param to - Phone number to send to
 * @param reminderText - The reminder message
 * @param context - Optional context to include
 */
export declare function sendReminder(to: string, reminderText: string, context?: string): Promise<string>;
declare const _default: {
    sendEmail: typeof sendEmail;
    sendSMS: typeof sendSMS;
    sendReminder: typeof sendReminder;
};
export default _default;
//# sourceMappingURL=communication-service.d.ts.map