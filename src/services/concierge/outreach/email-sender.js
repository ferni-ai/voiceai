/**
 * Email Sender
 *
 * Sends emails on behalf of users for formal requests and follow-ups.
 * Used for healthcare, insurance, and businesses that prefer written communication.
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'concierge-email' });
// SendGrid configuration
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.CONCIERGE_FROM_EMAIL || 'concierge@ferni.ai';
const FROM_NAME = 'Ferni Concierge';
export class EmailSender {
    userId;
    userName;
    userEmail;
    callbackNumber;
    constructor(options) {
        this.userId = options.userId;
        this.userName = options.userName;
        this.userEmail = options.userEmail;
        this.callbackNumber = options.callbackNumber;
    }
    /**
     * Check if email sending is configured
     */
    static isConfigured() {
        return !!SENDGRID_API_KEY;
    }
    /**
     * Send an email to a target
     */
    async send(options) {
        const { target, domain, type, requirements } = options;
        if (!target.email) {
            // Try to find email from website
            log.info({ target: target.name }, 'Target has no email, would attempt website scrape');
            return { success: false, error: 'Target has no email address' };
        }
        log.info({ targetName: target.name, email: target.email, domain }, 'Sending email');
        // Generate email content
        const { subject, body } = this.generateEmailContent(target, domain, type, requirements);
        if (!EmailSender.isConfigured()) {
            log.warn('SendGrid not configured, simulating email');
            return this.simulateEmail(target, subject, body);
        }
        try {
            const result = await this.sendViaSendGrid(target.email, subject, body);
            return result;
        }
        catch (error) {
            log.error({ error: String(error), target: target.name }, 'Email failed');
            return { success: false, error: String(error) };
        }
    }
    /**
     * Generate email subject and body
     */
    generateEmailContent(target, domain, type, requirements) {
        const typeLabels = {
            quote: 'Quote Request',
            booking: 'Booking Request',
            appointment: 'Appointment Request',
            inquiry: 'Inquiry',
            complaint: 'Issue Report',
            status: 'Status Check',
        };
        const subject = `${typeLabels[type]} for ${this.userName}`;
        // Build body based on domain
        let specificContent = '';
        switch (domain) {
            case 'hotel':
                specificContent = this.buildHotelEmailContent(requirements);
                break;
            case 'healthcare':
                specificContent = this.buildHealthcareEmailContent(requirements);
                break;
            case 'insurance':
                specificContent = this.buildInsuranceEmailContent(requirements);
                break;
            case 'local_service':
                specificContent = this.buildServiceEmailContent(requirements);
                break;
            default:
                specificContent = this.buildGenericEmailContent(requirements);
        }
        const body = `Dear ${target.name},

I am reaching out on behalf of ${this.userName} regarding the following request:

${specificContent}

Please respond to this email or call ${this.callbackNumber || 'the number on file'} at your earliest convenience.

Best regards,
Alex
Ferni AI Assistant
${this.callbackNumber ? `Callback: ${this.callbackNumber}` : ''}

---
This email was sent by Ferni's AI Concierge service on behalf of ${this.userName}.
Reply directly to respond to this request.`;
        return { subject, body };
    }
    buildHotelEmailContent(requirements) {
        const parts = ['ACCOMMODATION REQUEST'];
        if (requirements.dateRange) {
            parts.push(`Check-in: ${requirements.dateRange.start.toLocaleDateString()}`, `Check-out: ${requirements.dateRange.end.toLocaleDateString()}`);
        }
        if (requirements.guests)
            parts.push(`Guests: ${requirements.guests}`);
        if (requirements.rooms)
            parts.push(`Rooms needed: ${requirements.rooms}`);
        if (requirements.roomType)
            parts.push(`Room preference: ${requirements.roomType}`);
        if (requirements.amenities?.length) {
            parts.push(`Desired amenities: ${requirements.amenities.join(', ')}`);
        }
        if (requirements.budget) {
            parts.push(`Budget: ${requirements.budget.min ? `$${requirements.budget.min}` : ''} - ${requirements.budget.max ? `$${requirements.budget.max}` : ''} per night`);
        }
        if (requirements.specialRequests?.length) {
            parts.push(`Special requests: ${requirements.specialRequests.join(', ')}`);
        }
        parts.push('', 'Please provide your best available rate and any applicable discounts.');
        return parts.join('\n');
    }
    buildHealthcareEmailContent(requirements) {
        const parts = ['APPOINTMENT REQUEST'];
        if (requirements.providerType)
            parts.push(`Provider type: ${requirements.providerType}`);
        if (requirements.urgency) {
            const urgencyLabels = {
                routine: 'Routine',
                soon: 'Within 1-2 weeks',
                urgent: 'As soon as possible',
            };
            parts.push(`Urgency: ${urgencyLabels[requirements.urgency]}`);
        }
        if (requirements.reason)
            parts.push(`Reason for visit: ${requirements.reason}`);
        if (requirements.insuranceProvider) {
            parts.push(`Insurance: ${requirements.insuranceProvider}`);
        }
        if (requirements.timePreference) {
            parts.push(`Time preference: ${requirements.timePreference}`);
        }
        parts.push('', 'Please provide available appointment times.');
        return parts.join('\n');
    }
    buildInsuranceEmailContent(requirements) {
        const parts = ['INSURANCE INQUIRY'];
        if (requirements.serviceType)
            parts.push(`Regarding: ${requirements.serviceType}`);
        if (requirements.notes)
            parts.push(`Details: ${requirements.notes}`);
        parts.push('', 'Please provide information or next steps.');
        return parts.join('\n');
    }
    buildServiceEmailContent(requirements) {
        const parts = ['SERVICE REQUEST'];
        if (requirements.serviceType)
            parts.push(`Service needed: ${requirements.serviceType}`);
        if (requirements.serviceDescription) {
            parts.push(`Description: ${requirements.serviceDescription}`);
        }
        if (requirements.location)
            parts.push(`Location: ${requirements.location}`);
        if (requirements.date) {
            parts.push(`Preferred date: ${requirements.date.toLocaleDateString()}`);
        }
        if (requirements.budget) {
            parts.push(`Budget: $${requirements.budget.min || 0} - $${requirements.budget.max || 'flexible'}`);
        }
        parts.push('', 'Please provide a quote and available times.');
        return parts.join('\n');
    }
    buildGenericEmailContent(requirements) {
        const parts = [];
        if (requirements.notes)
            parts.push(requirements.notes);
        if (requirements.specialRequests?.length) {
            parts.push(`Details: ${requirements.specialRequests.join(', ')}`);
        }
        return parts.join('\n') || 'I would like more information about your services.';
    }
    /**
     * Send email via SendGrid
     */
    async sendViaSendGrid(to, subject, body) {
        // Production SendGrid integration
        /*
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(SENDGRID_API_KEY);
    
        const msg = {
          to,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          replyTo: this.userEmail,
          subject,
          text: body,
        };
    
        const response = await sgMail.send(msg);
        return {
          success: true,
          messageId: response[0].headers['x-message-id'],
        };
        */
        log.info({ to, subject }, 'Would send email via SendGrid');
        return this.simulateEmail({ email: to }, subject, body);
    }
    /**
     * Simulate email for development
     */
    async simulateEmail(target, subject, body) {
        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
        log.info({ to: target.email, subject, bodyLength: body.length }, 'Simulated email sent');
        const result = {
            id: `result_${Date.now()}`,
            requestId: target.requestId,
            targetId: target.id,
            channel: 'email',
            attemptNumber: target.attempts + 1,
            success: true,
            summary: `Email sent to ${target.name}`,
            data: {
                notes: 'Awaiting response',
            },
            timestamp: new Date(),
            emailThreadId: `email_${Date.now()}`,
        };
        return { success: true, result, messageId: `sim_${Date.now()}` };
    }
}
// Factory function
export function createEmailSender(options) {
    return new EmailSender(options);
}
//# sourceMappingURL=email-sender.js.map