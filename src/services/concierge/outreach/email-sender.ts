/**
 * Email Sender
 *
 * Sends emails on behalf of users for formal requests and follow-ups.
 * Used for healthcare, insurance, and businesses that prefer written communication.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { isEmailConfigured, sendAppEmail } from '../../communication-service.js';
import type {
  ConciergeTarget,
  ConciergeResult,
  ConciergeDomain,
  ConciergeRequirements,
  ConciergeRequestType,
} from '../types.js';

const log = createLogger({ module: 'concierge-email' });

// The From address is the app transport's (EMAIL_FROM); replies go to the user.
const FROM_NAME = 'Ferni Concierge';

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

export class EmailSender {
  private userId: string;
  private userName: string;
  private userEmail: string;
  private callbackNumber?: string;

  constructor(options: EmailSenderOptions) {
    this.userId = options.userId;
    this.userName = options.userName;
    this.userEmail = options.userEmail;
    this.callbackNumber = options.callbackNumber;
  }

  /**
   * Check if email sending is configured
   */
  static isConfigured(): boolean {
    return isEmailConfigured();
  }

  /**
   * Send an email to a target
   */
  async send(options: SendEmailOptions): Promise<EmailResult> {
    const { target, domain, type, requirements } = options;

    if (!target.email) {
      // Try to find email from website
      log.info({ target: target.name }, 'Target has no email, would attempt website scrape');
      return { success: false, error: 'Target has no email address' };
    }

    log.info({ targetName: target.name, domain }, 'Sending email');

    // Generate email content
    const { subject, body } = this.generateEmailContent(target, domain, type, requirements);

    // It used to "simulate" here and report success without sending anything
    if (!EmailSender.isConfigured()) {
      log.warn('Email transport not configured; concierge email not sent');
      return { success: false, error: 'Email is not configured' };
    }

    const sent = await sendAppEmail({
      to: target.email,
      fromName: FROM_NAME,
      replyTo: this.userEmail,
      subject,
      text: body,
      kind: 'transactional',
    });
    if (!sent.ok) {
      log.error({ provider: sent.provider, status: sent.status, error: sent.error, target: target.name }, 'Email failed'); // prettier-ignore
      return { success: false, error: sent.error ?? 'Email send failed' };
    }
    return { success: true, result: this.sentResult(target), messageId: sent.messageId };
  }

  /**
   * Generate email subject and body
   */
  private generateEmailContent(
    target: ConciergeTarget,
    domain: ConciergeDomain,
    type: ConciergeRequestType,
    requirements: ConciergeRequirements
  ): { subject: string; body: string } {
    const typeLabels: Record<ConciergeRequestType, string> = {
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

  private buildHotelEmailContent(requirements: ConciergeRequirements): string {
    const parts: string[] = ['ACCOMMODATION REQUEST'];

    if (requirements.dateRange) {
      parts.push(
        `Check-in: ${requirements.dateRange.start.toLocaleDateString()}`,
        `Check-out: ${requirements.dateRange.end.toLocaleDateString()}`
      );
    }
    if (requirements.guests) parts.push(`Guests: ${requirements.guests}`);
    if (requirements.rooms) parts.push(`Rooms needed: ${requirements.rooms}`);
    if (requirements.roomType) parts.push(`Room preference: ${requirements.roomType}`);
    if (requirements.amenities?.length) {
      parts.push(`Desired amenities: ${requirements.amenities.join(', ')}`);
    }
    if (requirements.budget) {
      parts.push(
        `Budget: ${requirements.budget.min ? `$${requirements.budget.min}` : ''} - ${requirements.budget.max ? `$${requirements.budget.max}` : ''} per night`
      );
    }
    if (requirements.specialRequests?.length) {
      parts.push(`Special requests: ${requirements.specialRequests.join(', ')}`);
    }

    parts.push('', 'Please provide your best available rate and any applicable discounts.');

    return parts.join('\n');
  }

  private buildHealthcareEmailContent(requirements: ConciergeRequirements): string {
    const parts: string[] = ['APPOINTMENT REQUEST'];

    if (requirements.providerType) parts.push(`Provider type: ${requirements.providerType}`);
    if (requirements.urgency) {
      const urgencyLabels = {
        routine: 'Routine',
        soon: 'Within 1-2 weeks',
        urgent: 'As soon as possible',
      };
      parts.push(`Urgency: ${urgencyLabels[requirements.urgency]}`);
    }
    if (requirements.reason) parts.push(`Reason for visit: ${requirements.reason}`);
    if (requirements.insuranceProvider) {
      parts.push(`Insurance: ${requirements.insuranceProvider}`);
    }
    if (requirements.timePreference) {
      parts.push(`Time preference: ${requirements.timePreference}`);
    }

    parts.push('', 'Please provide available appointment times.');

    return parts.join('\n');
  }

  private buildInsuranceEmailContent(requirements: ConciergeRequirements): string {
    const parts: string[] = ['INSURANCE INQUIRY'];

    if (requirements.serviceType) parts.push(`Regarding: ${requirements.serviceType}`);
    if (requirements.notes) parts.push(`Details: ${requirements.notes}`);

    parts.push('', 'Please provide information or next steps.');

    return parts.join('\n');
  }

  private buildServiceEmailContent(requirements: ConciergeRequirements): string {
    const parts: string[] = ['SERVICE REQUEST'];

    if (requirements.serviceType) parts.push(`Service needed: ${requirements.serviceType}`);
    if (requirements.serviceDescription) {
      parts.push(`Description: ${requirements.serviceDescription}`);
    }
    if (requirements.location) parts.push(`Location: ${requirements.location}`);
    if (requirements.date) {
      parts.push(`Preferred date: ${requirements.date.toLocaleDateString()}`);
    }
    if (requirements.budget) {
      parts.push(
        `Budget: $${requirements.budget.min || 0} - $${requirements.budget.max || 'flexible'}`
      );
    }

    parts.push('', 'Please provide a quote and available times.');

    return parts.join('\n');
  }

  private buildGenericEmailContent(requirements: ConciergeRequirements): string {
    const parts: string[] = [];

    if (requirements.notes) parts.push(requirements.notes);
    if (requirements.specialRequests?.length) {
      parts.push(`Details: ${requirements.specialRequests.join(', ')}`);
    }

    return parts.join('\n') || 'I would like more information about your services.';
  }

  /** The tracker record for an email that went out. */
  private sentResult(target: ConciergeTarget): ConciergeResult {
    return {
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
  }
}

// Factory function
export function createEmailSender(options: EmailSenderOptions): EmailSender {
  return new EmailSender(options);
}
